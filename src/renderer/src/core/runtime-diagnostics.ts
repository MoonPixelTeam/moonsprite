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
const MAX_DETAIL_KEYS = 32
const MAX_DETAIL_STRING_LENGTH = 500

const sessionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
const recentEvents: RuntimeDiagnosticEvent[] = []
const queuedEvents: RuntimeDiagnosticEvent[] = []
const activeOperations = new Map<string, { name: string; startedAt: number }>()
let sequence = 0
let operationSequence = 0
let sink: RuntimeDiagnosticSink | null = null
let contextProvider: RuntimeDiagnosticContextProvider | null = null
let watchdogInstalled = false
let lastAction: { name: string; detail: RuntimeDiagnosticDetail } | null = null

const monotonicNow = (): number => typeof performance !== 'undefined' ? performance.now() : Date.now()

const normalizeDetail = (detail: RuntimeDiagnosticDetail | undefined): RuntimeDiagnosticDetail => {
  if (!detail) return {}
  const normalized: RuntimeDiagnosticDetail = {}
  for (const [key, value] of Object.entries(detail).slice(0, MAX_DETAIL_KEYS)) {
    normalized[key] = typeof value === 'string' && value.length > MAX_DETAIL_STRING_LENGTH
      ? `${value.slice(0, MAX_DETAIL_STRING_LENGTH)}...`
      : value
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
  const operations = [...activeOperations.values()]
    .map((operation) => `${operation.name}:${Math.max(0, Math.round(now - operation.startedAt))}ms`)
    .join(',')
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
  const now = monotonicNow()
  publish({
    version: 1,
    sessionId,
    sequence: ++sequence,
    timestamp: new Date().toISOString(),
    monotonicMs: Math.round(now * 100) / 100,
    kind,
    name,
    detail: {
      ...normalizeDetail(detail),
      ...(includeContext ? currentContext() : {})
    }
  })
}

export const configureRuntimeDiagnostics = (
  nextSink: RuntimeDiagnosticSink,
  nextContextProvider?: RuntimeDiagnosticContextProvider
): void => {
  sink = nextSink
  contextProvider = nextContextProvider ?? null
  if (queuedEvents.length === 0) return
  const queued = queuedEvents.splice(0)
  try {
    void Promise.resolve(sink(queued)).catch(() => undefined)
  } catch {
    // The in-memory ring remains available even when persistence is unavailable.
  }
}

export const runtimeDiagnosticsActive = (): boolean => sink !== null || watchdogInstalled

export const beginRuntimeDiagnosticOperation = (
  name: string,
  detail?: RuntimeDiagnosticDetail,
  warningMs = DEFAULT_OPERATION_WARNING_MS
): RuntimeDiagnosticOperation => {
  const id = `${sessionId}-${++operationSequence}`
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

  return {
    id,
    mark(stage, stageDetail) {
      if (finished) return
      recordRuntimeDiagnostic('operation-stage', name, {
        operationId: id,
        stage,
        elapsedMs: Math.round(monotonicNow() - startedAt),
        ...stageDetail
      })
    },
    finish(outcome = 'ok', finishDetail) {
      if (finished) return
      finished = true
      globalThis.clearTimeout(warningTimer)
      activeOperations.delete(id)
      const durationMs = Math.max(0, monotonicNow() - startedAt)
      recordRuntimeDiagnostic('operation-end', name, {
        operationId: id,
        outcome,
        durationMs: Math.round(durationMs),
        slow: slowReported || durationMs >= warningMs,
        ...finishDetail
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
  if (watchdogInstalled || typeof window === 'undefined') return () => undefined
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
          ...activeOperationDetail(monotonicNow())
        }, true)
      }
    })
    observer.observe({ entryTypes: ['longtask'] })
  }

  recordRuntimeDiagnostic('session', 'renderer.started', {
    hardwareConcurrency: navigator.hardwareConcurrency || 0,
    language: navigator.language,
    userAgent: navigator.userAgent
  })

  return () => {
    window.clearInterval(heartbeat)
    observer?.disconnect()
    window.removeEventListener('pointerdown', onPointerDown, true)
    window.removeEventListener('keydown', onKeyDown, true)
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onUnhandledRejection)
    document.removeEventListener('visibilitychange', onVisibilityChange)
    watchdogInstalled = false
  }
}

export const runtimeDiagnosticSnapshot = (): readonly RuntimeDiagnosticEvent[] => recentEvents.map((event) => ({ ...event, detail: { ...event.detail } }))

export const resetRuntimeDiagnosticsForTests = (): void => {
  sink = null
  contextProvider = null
  recentEvents.length = 0
  queuedEvents.length = 0
  activeOperations.clear()
  lastAction = null
  sequence = 0
  operationSequence = 0
}
