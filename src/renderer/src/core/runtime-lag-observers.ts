import type { RuntimeDiagnosticDetail } from './runtime-diagnostics'

interface SlowEntry extends PerformanceEntry {
  processingStart?: number
  processingEnd?: number
  renderStart?: number
  styleAndLayoutStart?: number
  blockingDuration?: number
  scripts?: { duration: number; sourceURL?: string; sourceFunctionName?: string; sourceCharPosition?: number; forcedStyleAndLayoutDuration?: number }[]
}

/** Optional Chromium attribution. Do not log targets, DOM text or URL queries.
 * Retain only the worst entry per type until the next one-second drain. */
export function installLagAttribution() {
  const observers: PerformanceObserver[] = []
  const pending = new Map<string, RuntimeDiagnosticDetail>()
  const capabilities: RuntimeDiagnosticDetail = {}
  for (const type of ['long-animation-frame', 'event']) {
    capabilities[type] = false
    if (typeof PerformanceObserver === 'undefined' || !PerformanceObserver.supportedEntryTypes?.includes(type)) continue
    let observer: PerformanceObserver | null = null
    try {
      observer = new PerformanceObserver(list => {
        for (const raw of list.getEntries()) {
          const entry = raw as SlowEntry
          if (entry.duration < 104 || entry.duration <= Number(pending.get(type)?.durationMs ?? 0)) continue
          const detail: RuntimeDiagnosticDetail = { entryType: type, startMs: entry.startTime, durationMs: entry.duration }
          if (type === 'event') {
            detail.event = entry.name
            detail.inputWaitMs = Math.max(0, (entry.processingStart ?? entry.startTime) - entry.startTime)
            detail.handlerMs = Math.max(0, (entry.processingEnd ?? 0) - (entry.processingStart ?? 0))
            detail.presentationWaitEstimateMs = Math.max(0, entry.startTime + entry.duration - (entry.processingEnd ?? entry.startTime))
          } else {
            detail.blockingDurationMs = entry.blockingDuration ?? null
            detail.renderStartMs = entry.renderStart ?? null
            detail.styleAndLayoutStartMs = entry.styleAndLayoutStart ?? null
            const scripts = (entry.scripts ?? []).slice(0, 32).sort((a, b) => b.duration - a.duration).slice(0, 3)
            detail.scripts = scripts.map(script => {
              const file = (script.sourceURL ?? '').split(/[?#]/)[0].split('/').at(-1)?.slice(0, 100) ?? ''
              return `${file}:${script.sourceCharPosition ?? -1} ${(script.sourceFunctionName ?? '').slice(0, 80)} ${Math.round(script.duration)}ms layout:${Math.round(script.forcedStyleAndLayoutDuration ?? 0)}ms`
            }).join(' | ')
          }
          pending.set(type, detail)
        }
      })
      observer.observe(type === 'event' ? { type, durationThreshold: 104 } as PerformanceObserverInit : { type })
      observers.push(observer); capabilities[type] = true
    } catch (error) { observer?.disconnect(); capabilities[`${type}Error`] = String(error).slice(0, 200) }
  }
  return {
    capabilities,
    drain: () => { const entries = [...pending.values()]; pending.clear(); return entries },
    stop: () => { for (const observer of observers) observer.disconnect(); pending.clear() }
  }
}
