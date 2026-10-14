import { measureRuntimeDiagnostic, onRuntimeDiagnosticsDisabled, recordRuntimeDiagnostic, runtimeDiagnosticsActive, type RuntimeDiagnosticDetail } from './runtime-diagnostics'

const noCheckpoint = (_stage: string): void => {}

/** Checkpoints are exclusive wall-time slices of one synchronous operation.
 * Even sub-threshold slices are included when their enclosing operation is slow. */
export function measureRuntimeStages<T>(name: string, action: (checkpoint: (stage: string) => void) => T, detail: () => RuntimeDiagnosticDetail): T {
  if (!runtimeDiagnosticsActive()) return action(noCheckpoint)
  let previous = performance.now()
  const stages: Array<[string, number]> = []
  const checkpoint = (stage: string): void => {
    const now = performance.now()
    if (stages.length < 12) stages.push([stage, Math.max(0, now - previous)])
    previous = now
  }
  return measureRuntimeDiagnostic(name, () => {
    try { return action(checkpoint) } finally { checkpoint('tail') }
  }, () => ({
    ...detail(),
    stages: stages.map(([stage, duration]) => `${stage}:${duration.toFixed(1)}ms`).join(','),
    stageTiming: 'exclusive-wall-time'
  }))
}

/** Event timestamps use either the performance origin or (legacy) Unix time.
 * This measures event creation to handler entry, not hardware input latency. */
export function runtimeEventStartTime(timeStamp: number): number | null {
  if (!runtimeDiagnosticsActive() || !Number.isFinite(timeStamp) || timeStamp <= 0) return null
  const now = performance.now()
  const start = timeStamp > now ? timeStamp - performance.timeOrigin : timeStamp
  return Number.isFinite(start) && start >= 0 && start <= now ? start : null
}

/** At most one bounded trailing summary per second for a canvas/metric.
 * Waits never enter the synchronous span ring used for long-task attribution. */
export function createRuntimeLatencyReporter(name: string, thresholdMs = 32, timing: 'elapsed-wait' | 'notification-count' = 'elapsed-wait') {
  let timer: ReturnType<typeof setTimeout> | null = null
  let unregister: (() => void) | null = null
  let count = 0
  let maxMs = 0
  let worst: RuntimeDiagnosticDetail = {}
  const flush = (): void => {
    if (timer !== null) clearTimeout(timer)
    timer = null
    unregister?.()
    unregister = null
    if (count && runtimeDiagnosticsActive()) recordRuntimeDiagnostic('operation-stage', name, {
      ...worst, timing, samples: count, ...(timing === 'elapsed-wait' ? { maxMs: Math.round(maxMs * 10) / 10 } : {})
    })
    count = 0
    maxMs = 0
    worst = {}
  }
  return {
    record(start: number | null, detail: () => RuntimeDiagnosticDetail): void {
      if (start === null || !runtimeDiagnosticsActive()) return
      const duration = performance.now() - start
      if (!Number.isFinite(duration) || duration < thresholdMs) return
      if (count === 0 || duration > maxMs) {
        let context: RuntimeDiagnosticDetail
        try { context = detail() } catch { return /* Diagnostics cannot interrupt input. */ }
        maxMs = duration
        worst = { ...context, startTimeMs: start }
      }
      count++
      if (timer === null) {
        timer = setTimeout(flush, 1000)
        unregister = onRuntimeDiagnosticsDisabled(flush)
      }
    },
    flush
  }
}
