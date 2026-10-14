import { recordRuntimeDiagnostic, runtimeDiagnosticsActive, type RuntimeDiagnosticDetail } from '@/core/runtime-diagnostics'

interface FrameScript {
  duration: number
  forcedStyleAndLayoutDuration?: number
  sourceURL?: string
  sourceFunctionName?: string
  sourceCharPosition?: number
  invoker?: string
}

export interface ResizeLongFrame {
  startTime: number
  duration: number
  renderStart?: number
  styleAndLayoutStart?: number
  blockingDuration?: number
  scripts?: readonly FrameScript[]
}

/** Bounded summaries; never retain PerformanceEntries or a frame-by-frame trace. */
export function createResizeFrameDiagnostics(start: number) {
  let end = Infinity
  let previousFrame: number | null = null
  let firstFrameWait = 0
  let count = 0, total = 0, max = 0, over25 = 0, over50 = 0
  let longCount = 0, longMax = 0, blockingMax = 0, renderMax = 0, layoutTailMax = 0
  let scriptMax = 0, forcedLayoutMax = 0
  let worstScript: RuntimeDiagnosticDetail = {}
  return {
    end(time: number): void { end = time },
    frame(time: number): void {
      if (time < start || time > end) return
      if (previousFrame === null) firstFrameWait = time - start
      if (previousFrame !== null) {
        const delta = time - previousFrame
        count++; total += delta; max = Math.max(max, delta)
        if (delta > 25) over25++
        if (delta > 50) over50++
      }
      previousFrame = time
    },
    longFrame(entry: ResizeLongFrame): void {
      if (entry.startTime >= end || entry.startTime + entry.duration <= start) return
      longCount++
      longMax = Math.max(longMax, entry.duration)
      blockingMax = Math.max(blockingMax, entry.blockingDuration ?? 0)
      const finish = entry.startTime + entry.duration
      if (entry.renderStart) renderMax = Math.max(renderMax, finish - entry.renderStart)
      if (entry.styleAndLayoutStart) layoutTailMax = Math.max(layoutTailMax, finish - entry.styleAndLayoutStart)
      for (const script of entry.scripts ?? []) {
        forcedLayoutMax = Math.max(forcedLayoutMax, script.forcedStyleAndLayoutDuration ?? 0)
        if (script.duration <= scriptMax) continue
        scriptMax = script.duration
        worstScript = {
          scriptSource: (script.sourceURL ?? '').split('?')[0].slice(0, 400),
          scriptFunction: (script.sourceFunctionName ?? '').slice(0, 200),
          scriptPosition: script.sourceCharPosition ?? -1,
          scriptInvoker: (script.invoker ?? '').slice(0, 200)
        }
      }
    },
    snapshot(): RuntimeDiagnosticDetail {
      const round = (value: number): number => Math.round(value * 10) / 10
      return {
        version: 'dock-frames-v1', startTimeMs: round(start),
        durationMs: Number.isFinite(end) ? round(end - start) : 0,
        frameIntervals: count, frameMeanMs: count ? round(total / count) : 0,
        firstFrameWaitMs: round(firstFrameWait),
        frameMaxMs: round(max), framesOver25Ms: over25, framesOver50Ms: over50,
        longFrameCount: longCount, longFrameMaxMs: round(longMax),
        blockingMaxMs: round(blockingMax), renderMaxMs: round(renderMax),
        // This includes the rest of rendering after layout starts, not just layout.
        layoutTailMaxMs: round(layoutTailMax), scriptMaxMs: round(scriptMax),
        forcedLayoutMaxMs: round(forcedLayoutMax), ...worstScript
      }
    }
  }
}

/** Observe only a resize gesture, including the frame containing pointerup. */
export function startResizeFrameDiagnostics(): () => void {
  if (!runtimeDiagnosticsActive()) return () => undefined
  const diagnostics = createResizeFrameDiagnostics(performance.now())
  let observer: PerformanceObserver | null = null
  const supported = typeof PerformanceObserver !== 'undefined'
    && PerformanceObserver.supportedEntryTypes?.includes('long-animation-frame')
  let observerStatus = supported ? 'active' : 'unsupported'
  if (supported) {
    observer = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) diagnostics.longFrame(entry as ResizeLongFrame)
    })
    try {
      observer.observe({ type: 'long-animation-frame', buffered: true })
    } catch {
      observer.disconnect()
      observer = null
      observerStatus = 'unavailable'
    }
  }
  let stopped = false
  const tick = (time: number): void => {
    diagnostics.frame(time)
    if (!stopped) frame = window.requestAnimationFrame(tick)
  }
  let frame = window.requestAnimationFrame(tick)
  return () => {
    if (stopped) return
    stopped = true
    diagnostics.end(performance.now())
    window.cancelAnimationFrame(frame)
    // Allow the release frame's entry to arrive; no logging or layout reads in RAF.
    window.setTimeout(() => {
      for (const entry of observer?.takeRecords() ?? []) diagnostics.longFrame(entry as ResizeLongFrame)
      observer?.disconnect()
      recordRuntimeDiagnostic('operation-stage', 'workspace.resize.frames', {
        ...diagnostics.snapshot(), observerStatus
      })
    }, 100)
  }
}
