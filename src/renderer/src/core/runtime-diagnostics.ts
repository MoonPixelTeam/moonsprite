export type RuntimeDiagnosticValue = string | number | boolean | null
export type RuntimeDiagnosticDetail = Record<string, RuntimeDiagnosticValue>

export type RuntimeDiagnosticKind =
  | 'session'
  | 'operation-start'
  | 'operation-stage'
  | 'operation-slow'
  | 'operation-end'
  | 'main-thread-stall'
  | 'long-task'
  | 'error'

export interface RuntimeDiagnosticEvent {
  version: 1
  sessionId: string
  sequence: number
  timestamp: string
  monotonicMs: number
  kind: RuntimeDiagnosticKind
  name: string
  detail: RuntimeDiagnosticDetail
}

export interface RuntimeDiagnosticOperation {
  readonly id: string
  mark(stage: string, detail?: RuntimeDiagnosticDetail): void
  finish(outcome?: 'ok' | 'error' | 'canceled', detail?: RuntimeDiagnosticDetail): void
}

type RuntimeDiagnosticSink = (events: readonly RuntimeDiagnosticEvent[]) => void | Promise<void>
type RuntimeDiagnosticContextProvider = () => RuntimeDiagnosticDetail

const MAX_RECENT_EVENTS = 200
const MAX_QUEUED_EVENTS = 100
const DEFAULT_OPERATION_WARNING_MS = 5_000
const MAX_DETAIL_KEYS = 48
const MAX_DETAIL_STRING_LENGTH = 500

type RuntimeDiagnosticCrypto = Partial<Pick<Crypto, 'getRandomValues' | 'randomUUID'>>

let fallbackSessionIdSequence = 0

export const createRuntimeDiagnosticSessionId = (
  randomSource: RuntimeDiagnosticCrypto | null = typeof globalThis.crypto === 'undefined' ? null : globalThis.crypto
): string => {
  if (typeof randomSource?.randomUUID === 'function') return randomSource.randomUUID()
  if (typeof randomSource?.getRandomValues === 'function') {
    const bytes = randomSource.getRandomValues(new Uint8Array(16))
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }
  fallbackSessionIdSequence += 1
  return `runtime-${Date.now().toString(36)}-${fallbackSessionIdSequence.toString(36)}`
}

const sessionId = createRuntimeDiagnosticSessionId()
const recentEvents: RuntimeDiagnosticEvent[] = []
const queuedEvents: RuntimeDiagnosticEvent[] = []
const activeOperations = new Map<string, { name: string; startedAt: number }>()
let sequence = 0
let operationSequence = 0
let sink: RuntimeDiagnosticSink | null = null
let contextProvider: RuntimeDiagnosticContextProvider | null = null
let watchdogInstalled = false
let collectionEnabled = true
let collectionGeneration = 0
const collectionCleanups = new Set<() => void>()
export const onRuntimeDiagnosticsDisabled = (cleanup: () => void): (() => void) => {
  collectionCleanups.add(cleanup)
  return () => { collectionCleanups.delete(cleanup) }
}
export const setRuntimeDiagnosticCollection = (enabled: boolean): void => {
  if (collectionEnabled === enabled) return
  collectionEnabled = enabled
  collectionGeneration++
  if (enabled) return
  for (const cleanup of [...collectionCleanups]) cleanup()
  recentEvents.length = 0
  queuedEvents.length = 0
  recentSpans.length = 0
  spanReports.clear()
  lastAction = null
}
let lastAction: { name: string; detail: RuntimeDiagnosticDetail } | null = null
const recentSpans: Array<{ id: number; name: string; start: number; end: number; documentId: RuntimeDiagnosticValue; layerId: RuntimeDiagnosticValue }> = []
const spanReports = new Map<string, { at: number; suppressed: number; maxMs: number }>()
let spanSequence = 0
let activeSpanId: number | null = null

const monotonicNow = (): number => typeof performance !== 'undefined' ? performance.now() : Date.now()

const normalizeValue = (value: unknown): RuntimeDiagnosticValue => {
  if (typeof value === 'string') return value.length > MAX_DETAIL_STRING_LENGTH ? `${value.slice(0, MAX_DETAIL_STRING_LENGTH)}...` : value
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value
  if (ArrayBuffer.isView(value)) return `[Pixel/binary data: ${value.byteLength} bytes]`
  if (value instanceof ArrayBuffer) return `[ArrayBuffer: ${value.byteLength} bytes]`
  if (Array.isArray(value)) return `[Array: ${value.length} items]`
  return `[${typeof value}]`
}

const normalizeDetail = (detail: RuntimeDiagnosticDetail | undefined): RuntimeDiagnosticDetail => {
  if (!detail) return {}
  // Runtime callers can bypass the scalar-only TypeScript contract. Never
  // enumerate image buffers or recursively serialize an object into a log.
  if (ArrayBuffer.isView(detail) || detail instanceof ArrayBuffer || Array.isArray(detail)) {
    return { omittedDetail: normalizeValue(detail) }
  }
  const normalized: RuntimeDiagnosticDetail = {}
  let count = 0
  for (const key in detail) {
    if (count >= MAX_DETAIL_KEYS) break
    const property = Object.getOwnPropertyDescriptor(detail, key)
    if (!property) continue
    count += 1
    Object.defineProperty(normalized, key.slice(0, 128), {
      value: 'value' in property ? normalizeValue(property.value) : '[accessor]',
      enumerable: true, configurable: true, writable: true
    })
  }
  return normalized
}

const currentContext = (): RuntimeDiagnosticDetail => {
  try {
    return normalizeDetail(contextProvider?.())
  } catch {
    return { contextUnavailable: true }
  }
}

const activeOperationDetail = (now: number): RuntimeDiagnosticDetail => {
  let operations = ''
  for (const operation of activeOperations.values()) {
    operations += `${operations ? ',' : ''}${operation.name.slice(0, MAX_DETAIL_STRING_LENGTH)}:${Math.max(0, Math.round(now - operation.startedAt))}ms`
    if (operations.length >= MAX_DETAIL_STRING_LENGTH) {
      operations = `${operations.slice(0, MAX_DETAIL_STRING_LENGTH)}...`
      break
    }
  }
  return {
    activeOperationCount: activeOperations.size,
    ...(operations ? { activeOperations: operations } : {}),
    ...(lastAction ? { lastAction: lastAction.name, ...lastAction.detail } : {})
  }
}

const publish = (event: RuntimeDiagnosticEvent): void => {
  recentEvents.push(event)
  if (recentEvents.length > MAX_RECENT_EVENTS) recentEvents.splice(0, recentEvents.length - MAX_RECENT_EVENTS)
  if (!sink) {
    queuedEvents.push(event)
    if (queuedEvents.length > MAX_QUEUED_EVENTS) queuedEvents.splice(0, queuedEvents.length - MAX_QUEUED_EVENTS)
    return
  }
  try {
    void Promise.resolve(sink([event])).catch(() => undefined)
  } catch {
    // Diagnostics must never interfere with editing or error handling.
  }
}

export const recordRuntimeDiagnostic = (
  kind: RuntimeDiagnosticKind,
  name: string,
  detail?: RuntimeDiagnosticDetail,
  includeContext = false
): void => {
  if (!collectionEnabled) return
  const now = monotonicNow()
  publish({
    version: 1,
    sessionId,
    sequence: ++sequence,
    timestamp: new Date().toISOString(),
    monotonicMs: Math.round(now * 100) / 100,
    kind,
    name: name.slice(0, MAX_DETAIL_STRING_LENGTH),
    detail: normalizeDetail({
      ...(includeContext ? currentContext() : {}),
      ...normalizeDetail(detail)
    })
  })
}

export const configureRuntimeDiagnostics = (
  nextSink: RuntimeDiagnosticSink | null,
  nextContextProvider?: RuntimeDiagnosticContextProvider
): void => {
  sink = nextSink
  contextProvider = nextContextProvider ?? null
  if (!nextSink) return
  if (queuedEvents.length === 0) return
  const queued = queuedEvents.splice(0)
  try {
    void Promise.resolve(nextSink(queued)).catch(() => undefined)
  } catch {
    // The in-memory ring remains available even when persistence is unavailable.
  }
}

export const runtimeDiagnosticsActive = (): boolean => collectionEnabled && (sink !== null || watchdogInstalled)

/** Synchronous, inclusive wall time only; never use this to time an awaited job. */
export const measureRuntimeDiagnostic = <T>(name: string, action: () => T, detail?: () => RuntimeDiagnosticDetail): T => {
  if (!runtimeDiagnosticsActive()) return action()
  const generation = collectionGeneration
  const start = monotonicNow()
  const parentSpanId = activeSpanId
  const spanId = ++spanSequence
  activeSpanId = spanId
  let failed = false
  try { return action() } catch (error) { failed = true; throw error } finally {
    activeSpanId = parentSpanId
    const end = monotonicNow()
    const durationMs = end - start
    // No context collection, timers or persistence on the normal fast path.
    if (collectionEnabled && generation === collectionGeneration && (durationMs >= 16 || failed)) {
      try {
        name = name.slice(0, 128)
        const spanDetail = normalizeDetail(detail?.())
        recentSpans.push({ id: spanId, name, start, end, documentId: spanDetail.documentId ?? null, layerId: spanDetail.layerId ?? null })
        if (recentSpans.length > 128) recentSpans.shift()
        const previous = spanReports.get(name)
        if (!failed && previous && end - previous.at < 1000) {
          previous.suppressed += 1
          previous.maxMs = Math.max(previous.maxMs, durationMs)
        } else {
          if (spanReports.size >= 64 && !previous) spanReports.delete(spanReports.keys().next().value!)
          spanReports.set(name, { at: end, suppressed: 0, maxMs: 0 })
          recordRuntimeDiagnostic(failed ? 'error' : 'operation-stage', name, {
            spanId, parentSpanId, startTimeMs: Math.round(start * 10) / 10,
            durationMs: Math.round(durationMs * 10) / 10, timing: 'sync-inclusive',
            suppressedSamples: previous?.suppressed ?? 0,
            suppressedMaxMs: Math.round(previous?.maxMs ?? 0),
            ...spanDetail
          }, true)
        }
      } catch { /* Instrumentation must not change an operation's result or error. */ }
    }
  }
}

/** Match finished work against the task's actual interval, not observer delivery time. */
export const runtimeDiagnosticSpanOverlap = (start: number, duration: number): RuntimeDiagnosticDetail => {
  const matching = recentSpans.filter((span) => span.start < start + duration && span.end > start)
    .sort((a, b) => (b.end - b.start) - (a.end - a.start))
  const attributed = matching.find((span) => span.documentId !== null)
  return {
    measuredSpanCount: matching.length,
    measuredDocumentId: attributed?.documentId ?? null,
    measuredLayerId: attributed?.layerId ?? null,
    measuredSpans: matching.slice(0, 6)
      .map((span) => `${span.id}:${span.name}:${Math.round(span.end - span.start)}ms`).join(',')
  }
}

export const beginRuntimeDiagnosticOperation = (
  name: string,
  detail?: RuntimeDiagnosticDetail,
  warningMs = DEFAULT_OPERATION_WARNING_MS
): RuntimeDiagnosticOperation => {
  if (!collectionEnabled) return { id: '', mark: () => {}, finish: () => {} }
  const id = `${sessionId}-${++operationSequence}`
  detail = normalizeDetail(detail)
  const startedAt = monotonicNow()
  activeOperations.set(id, { name, startedAt })
  recordRuntimeDiagnostic('operation-start', name, { operationId: id, ...detail })
  let finished = false
  let slowReported = false
  const warningTimer = globalThis.setTimeout(() => {
    if (finished) return
    slowReported = true
    recordRuntimeDiagnostic('operation-slow', name, {
      operationId: id,
      durationMs: Math.round(monotonicNow() - startedAt),
      ...detail
    }, true)
  }, Math.max(1, warningMs))
  const unregister = onRuntimeDiagnosticsDisabled(() => {
    finished = true
    globalThis.clearTimeout(warningTimer)
    activeOperations.delete(id)
    unregister()
  })

  return {
    id,
    mark(stage, stageDetail) {
      if (finished) return
      recordRuntimeDiagnostic('operation-stage', name, {
        operationId: id,
        stage,
        elapsedMs: Math.round(monotonicNow() - startedAt),
        ...normalizeDetail(stageDetail)
      })
    },
    finish(outcome = 'ok', finishDetail) {
      if (finished) return
      finished = true
      unregister()
      globalThis.clearTimeout(warningTimer)
      activeOperations.delete(id)
      const durationMs = Math.max(0, monotonicNow() - startedAt)
      recordRuntimeDiagnostic('operation-end', name, {
        operationId: id,
        outcome,
        durationMs: Math.round(durationMs),
        slow: slowReported || durationMs >= warningMs,
        ...normalizeDetail(finishDetail)
      }, slowReported || durationMs >= warningMs || outcome === 'error')
    }
  }
}

export const mainThreadStallDuration = (elapsedMs: number, intervalMs: number, thresholdMs: number): number | null => {
  const blockedMs = elapsedMs - intervalMs
  return Number.isFinite(blockedMs) && blockedMs >= thresholdMs ? blockedMs : null
}

const errorDetail = (error: unknown): RuntimeDiagnosticDetail => {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack?.split('\n').slice(0, 5).join('\n') ?? ''
    }
  }
  return { message: String(error) }
}

const controlIdentity = (target: EventTarget | null): string => {
  if (!(target instanceof Element)) return 'unknown'
  const control = target.closest<HTMLElement>('[data-tool],button,[role="menuitem"],[role="slider"],input')
  if (!control) return target.tagName.toLowerCase()
  return control.dataset.tool
    ? `tool:${control.dataset.tool}`
    : control.id
      ? `id:${control.id}`
      : `${control.tagName.toLowerCase()}.${[...control.classList].slice(0, 2).join('.')}`
}

export interface RuntimeDiagnosticWatchdogOptions {
  heartbeatIntervalMs?: number
  stallThresholdMs?: number
  longTaskThresholdMs?: number
}

export const installRuntimeDiagnosticWatchdog = (options: RuntimeDiagnosticWatchdogOptions = {}): (() => void) => {
  if (!collectionEnabled || watchdogInstalled || typeof window === 'undefined') return () => undefined
  watchdogInstalled = true
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? 500
  const stallThresholdMs = options.stallThresholdMs ?? 750
  const longTaskThresholdMs = options.longTaskThresholdMs ?? 120
  let lastHeartbeat = monotonicNow()

  const heartbeat = window.setInterval(() => {
    const now = monotonicNow()
    const elapsed = now - lastHeartbeat
    lastHeartbeat = now
    if (document.visibilityState === 'hidden') return
    const blockedMs = mainThreadStallDuration(elapsed, heartbeatIntervalMs, stallThresholdMs)
    if (blockedMs === null) return
    recordRuntimeDiagnostic('main-thread-stall', 'renderer.event-loop', {
      blockedMs: Math.round(blockedMs),
      heartbeatIntervalMs,
      ...activeOperationDetail(now)
    }, true)
  }, heartbeatIntervalMs)

  const onPointerDown = (event: PointerEvent): void => {
    lastAction = { name: 'pointer-down', detail: { control: controlIdentity(event.target), button: event.button } }
  }
  const onWheel = (event: WheelEvent): void => {
    lastAction = { name: 'wheel', detail: { control: controlIdentity(event.target), ctrl: event.ctrlKey } }
  }
  const onKeyDown = (event: KeyboardEvent): void => {
    const editable = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || (event.target instanceof HTMLElement && event.target.isContentEditable)
    lastAction = {
      name: 'key-down',
      detail: {
        key: editable && !event.ctrlKey && !event.altKey && !event.metaKey ? 'text-input' : event.key,
        ctrl: event.ctrlKey,
        shift: event.shiftKey,
        alt: event.altKey,
        meta: event.metaKey,
        control: controlIdentity(event.target)
      }
    }
  }
  const onError = (event: ErrorEvent): void => recordRuntimeDiagnostic('error', 'window.error', errorDetail(event.error ?? event.message), true)
  const onUnhandledRejection = (event: PromiseRejectionEvent): void => recordRuntimeDiagnostic('error', 'window.unhandled-rejection', errorDetail(event.reason), true)
  const onVisibilityChange = (): void => { lastHeartbeat = monotonicNow() }

  window.addEventListener('pointerdown', onPointerDown, true)
  window.addEventListener('wheel', onWheel, true)
  window.addEventListener('keydown', onKeyDown, true)
  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onUnhandledRejection)
  document.addEventListener('visibilitychange', onVisibilityChange)

  let observer: PerformanceObserver | null = null
  if (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
    observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration < longTaskThresholdMs) continue
        recordRuntimeDiagnostic('long-task', 'renderer.long-task', {
          durationMs: Math.round(entry.duration),
          startTimeMs: Math.round(entry.startTime),
          ...runtimeDiagnosticSpanOverlap(entry.startTime, entry.duration),
          ...activeOperationDetail(monotonicNow())
        }, true)
      }
    })
    observer.observe({ entryTypes: ['longtask'] })
  }

  recordRuntimeDiagnostic('session', 'renderer.started', {
    diagnosticRevision: 3,
    hardwareConcurrency: navigator.hardwareConcurrency || 0,
    language: navigator.language,
    userAgent: navigator.userAgent
  })

  return () => {
    window.clearInterval(heartbeat)
    observer?.disconnect()
    window.removeEventListener('pointerdown', onPointerDown, true)
    window.removeEventListener('wheel', onWheel, true)
    window.removeEventListener('keydown', onKeyDown, true)
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onUnhandledRejection)
    document.removeEventListener('visibilitychange', onVisibilityChange)
    watchdogInstalled = false
  }
}

export const runtimeDiagnosticSnapshot = (): readonly RuntimeDiagnosticEvent[] => recentEvents.map((event) => ({ ...event, detail: { ...event.detail } }))

export const resetRuntimeDiagnosticsForTests = (): void => {
  setRuntimeDiagnosticCollection(false)
  collectionEnabled = true
  sink = null
  contextProvider = null
  recentEvents.length = 0
  queuedEvents.length = 0
  activeOperations.clear()
  recentSpans.length = 0
  spanReports.clear()
  spanSequence = 0
  activeSpanId = null
  lastAction = null
  sequence = 0
  operationSequence = 0
}
