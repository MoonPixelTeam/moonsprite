import type { RuntimeDiagnosticDetail } from './runtime-diagnostics'

import { installLagAttribution } from './runtime-lag-observers'
export interface LagResourceSample {
  summary: RuntimeDiagnosticDetail
  processes: RuntimeDiagnosticDetail[]
}
interface Ports {
  record: (name: string, detail: RuntimeDiagnosticDetail) => void
  resources?: () => Promise<LagResourceSample>
}
const bucket = () => ({ count: 0, total: 0, max: 0, over100: 0, over300: 0 })
type Bucket = ReturnType<typeof bucket>
const add = (stats: Bucket, duration: number) => {
  if (!Number.isFinite(duration) || duration < 0) return
  stats.count++; stats.total += duration; stats.max = Math.max(stats.max, duration)
  if (duration >= 100) stats.over100++
  if (duration >= 300) stats.over300++
}
const detail = (stats: Bucket): RuntimeDiagnosticDetail => ({ samples: stats.count,
  meanMs: Math.round(stats.total / Math.max(1, stats.count) * 10) / 10,
  maxMs: Math.round(stats.max * 10) / 10, over100Ms: stats.over100, over300Ms: stats.over300 })

/** Constant-size counters on input; no pixel reads, DOM traversal, IPC or
 * continuous animation loop in the input handler. All writes use the caller's
 * bounded diagnostic writer. Resource sampling never overlaps. */
export function installRuntimeLagCapture(ports: Ports): () => void {
  let stopped = false, pendingResources = false, resourcesFailed = false
  let lastTick = performance.now(), lastSummary = lastTick, lastResource = -Infinity, lastFrame = -Infinity
  let frame: number | null = null
  let moves = bucket(), wheels = bucket(), presses = bucket(), frames = bucket(), tasks = bucket(), heartbeat = bucket()
  let inputCount = 0, skippedResources = 0
  const attribution = installLagAttribution()
  const recent: RuntimeDiagnosticDetail[] = []
  let inputPeak = 0, framePeak = 0, taskPeak = 0, taskTotal = 0, secondInputs = 0
  let incidentId = 0, lastIncident = -Infinity, postUntil = -Infinity
  let lastWindow = performance.now()
  let resourceRequestStarted = 0
  let lastInventory = -Infinity, inventoryInterval = 10_000
  const record = (name: string, value: RuntimeDiagnosticDetail) => { if (!stopped) ports.record(name, value) }
  const sampleResources = () => {
    if (!ports.resources || resourcesFailed || pendingResources || stopped) {
      if (pendingResources) skippedResources++
      return
    }
    pendingResources = true
    resourceRequestStarted = performance.now()
    lastResource = resourceRequestStarted
    void Promise.resolve().then(() => ports.resources!()).then(sample => {
      if (stopped) return
      record('lag.resources', { ...sample.summary, requestRoundTripMs: performance.now() - resourceRequestStarted })
      for (const process of sample.processes.slice(0, 32)) record('lag.process', process)
    }).catch(error => {
      resourcesFailed = true
      record('lag.resources-error', { message: String(error), retry: 're-enable-capture' })
    }).finally(() => { pendingResources = false })
  }
  const summarize = (reason: string) => {
    const now = performance.now()
    for (const [input, stats] of [['pointer-move', moves], ['wheel', wheels], ['pointer-down', presses]] as const) {
      if (stats.count) record('lag.input-summary', { input, ...detail(stats), windowMs: now - lastSummary, timing: 'event-creation-to-capture-listener' })
    }
    record('lag.scheduler', { reason, windowMs: now - lastSummary, hidden: document.hidden,
      frameSamples: frames.count, frameWaitMaxMs: frames.max, longTaskCount: tasks.count,
      longTaskTotalMs: tasks.total, longTaskMaxMs: tasks.max, heartbeatDelayMaxMs: heartbeat.max,
      resourceRequestPending: pendingResources, resourceRequestAgeMs: pendingResources ? now - resourceRequestStarted : 0,
      skippedResourceSamples: skippedResources, inputEvents: inputCount })
    if (now - lastInventory >= inventoryInterval) {
      const rendererSampleStarted = performance.now()
      record('lag.workspace', { reason })
      const memory = (performance as Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }).memory
      let backingBytes = 0, sampledCanvases = 0
      const canvases = document.getElementsByTagName('canvas')
      for (let index = 0; index < Math.min(canvases.length, 128); index++) {
        const canvas = canvases[index]
        backingBytes += canvas.width * canvas.height * 4; sampledCanvases++
      }
      record('lag.renderer-resources', { domElements: document.getElementsByTagName('*').length,
        canvasCount: canvases.length, sampledCanvases, canvasBackingEstimateBytes: backingBytes,
        jsHeapAvailable: Boolean(memory), jsHeapUsedBytes: memory?.usedJSHeapSize ?? null,
        jsHeapTotalBytes: memory?.totalJSHeapSize ?? null, jsHeapLimitBytes: memory?.jsHeapSizeLimit ?? null,
        collectionMs: performance.now() - rendererSampleStarted })
      const cost = performance.now() - rendererSampleStarted
      if (cost > 8) {
        inventoryInterval = 60_000
        record('lag.capture-budget', { inventoryCostMs: cost, inventoryIntervalMs: inventoryInterval })
      }
      lastInventory = now
    }
    moves = bucket(); wheels = bucket(); presses = bucket(); frames = bucket(); tasks = bucket(); heartbeat = bucket()
    inputCount = 0; skippedResources = 0; lastSummary = now
  }
  const input = (event: Event) => {
    if (stopped || document.hidden) return
    const now = performance.now()
    const start = event.timeStamp > now ? event.timeStamp - performance.timeOrigin : event.timeStamp
    if (start > 0 && start <= now) {
      add(event.type === 'wheel' ? wheels : event.type === 'pointerdown' ? presses : moves, now - start)
      inputPeak = Math.max(inputPeak, now - start)
    }
    inputCount++; secondInputs++
    // At most ten on-demand frame probes per second; idle capture schedules none.
    if (frame === null && now - lastFrame >= 100) {
      lastFrame = now
      frame = requestAnimationFrame(() => { frame = null; if (!stopped && !document.hidden) { const wait = performance.now() - now; add(frames, wait); framePeak = Math.max(framePeak, wait) } })
    }
  }
  let observer: PerformanceObserver | null = null
  const longTasksSupported = typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('longtask')
  if (longTasksSupported) {
    try {
      observer = new PerformanceObserver(entries => { if (!stopped && !document.hidden) for (const entry of entries.getEntries()) { add(tasks, entry.duration); taskPeak = Math.max(taskPeak, entry.duration); taskTotal += entry.duration } })
      observer.observe({ entryTypes: ['longtask'] })
    } catch (error) {
      observer?.disconnect(); observer = null
      record('lag.observer-error', { message: String(error) })
    }
  }
  const evidenceWindow = (now: number, heartbeatDelay: number) => {
    const evidence: RuntimeDiagnosticDetail = { windowStartMs: lastWindow, windowEndMs: now,
      hidden: document.hidden, inputPeakMs: inputPeak, frameWaitPeakMs: framePeak,
      longTaskPeakMs: taskPeak, longTaskTotalMs: taskTotal, heartbeatDelayMs: heartbeatDelay,
      inputCount: secondInputs, resourcePending: pendingResources }
    const slowEntries = attribution.drain()
    const severe = !document.hidden && (inputPeak >= 150 || framePeak >= 250 || taskPeak >= 200 || heartbeatDelay >= 500)
    if (severe && now - lastIncident >= 30_000) {
      lastIncident = now; postUntil = now + 10_000; incidentId++
      record('lag.incident', { incidentId, ...evidence, precedingWindows: recent.length,
        interpretation: 'threshold-evidence-not-confirmed-cause' })
      for (const previous of recent) record('lag.incident-window', { incidentId, phase: 'before', ...previous })
      summarize('automatic-incident')
    }
    if (now <= postUntil) record('lag.incident-window', { incidentId, phase: 'after', ...evidence })
    for (const entry of slowEntries) record('lag.attribution', entry)
    recent.push(evidence)
    if (recent.length > 30) recent.shift()
    inputPeak = 0; framePeak = 0; taskPeak = 0; taskTotal = 0; secondInputs = 0; lastWindow = now
  }
  const visibility = () => {
    record('lag.visibility', { hidden: document.hidden })
    lastTick = performance.now()
    // Do not misclassify background throttling as a foreground incident.
    inputPeak = 0; framePeak = 0; taskPeak = 0; taskTotal = 0; secondInputs = 0
    recent.length = 0; lastWindow = lastTick; postUntil = -Infinity
    if (frame !== null) cancelAnimationFrame(frame)
    frame = null
    sampleResources()
  }
  document.addEventListener('pointermove', input, { capture: true, passive: true })
  document.addEventListener('pointerdown', input, { capture: true, passive: true })
  document.addEventListener('wheel', input, { capture: true, passive: true })
  document.addEventListener('visibilitychange', visibility)
  const timer = setInterval(() => {
    const now = performance.now()
    const delay = document.hidden ? 0 : Math.max(0, now - lastTick - 1000)
    if (!document.hidden) add(heartbeat, delay)
    evidenceWindow(now, delay)
    lastTick = now
    if (now - lastSummary >= 10_000) summarize('interval')
    if (now - lastResource >= 10_000) sampleResources()
  }, 1000)
  // Startup resource work is deferred out of the preference change/input handler.
  const initial = setTimeout(sampleResources, 0)
  record('lag.capture-start', { userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency,
    ...attribution.capabilities, automaticIncidentCooldownMs: 30_000, precedingWindowLimit: 30,
    sampleIntervalMs: 10_000, frameProbeLimitHz: 10, longTasksSupported: Boolean(observer),
    nativeResourcesAvailable: Boolean(ports.resources), gpuMemoryCounters: false, threadStacks: false,
    heapMeasurement: 'browser-estimate', canvasMemoryMeasurement: 'rgba-backing-estimate-not-gpu-memory' })
  return () => {
    if (stopped) return
    evidenceWindow(performance.now(), 0)
    summarize('stop')
    record('lag.capture-stop', {})
    stopped = true
    clearTimeout(initial); clearInterval(timer)
    if (frame !== null) cancelAnimationFrame(frame)
    observer?.disconnect()
    attribution.stop()
    document.removeEventListener('pointermove', input, true)
    document.removeEventListener('pointerdown', input, true)
    document.removeEventListener('wheel', input, true)
    document.removeEventListener('visibilitychange', visibility)
  }
}
