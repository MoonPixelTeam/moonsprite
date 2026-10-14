import { afterEach, expect, it, vi } from 'vitest'
import { createResizeFrameDiagnostics, startResizeFrameDiagnostics } from './workspace-resize-frames'
import { recordRuntimeDiagnostic, runtimeDiagnosticsActive } from '@/core/runtime-diagnostics'

vi.mock('@/core/runtime-diagnostics', () => ({
  recordRuntimeDiagnostic: vi.fn(), runtimeDiagnosticsActive: vi.fn(() => true)
}))

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); vi.clearAllMocks() })

it('includes overlapping resize frames and attributes script and rendering stalls separately', () => {
  const diagnostics = createResizeFrameDiagnostics(100)
  diagnostics.end(500)
  diagnostics.longFrame({ startTime: 0, duration: 100 })
  diagnostics.longFrame({ startTime: 500, duration: 100 })
  diagnostics.longFrame({ startTime: 90, duration: 163, renderStart: 230, styleAndLayoutStart: 240,
    blockingDuration: 113, scripts: [{ duration: 130, forcedStyleAndLayoutDuration: 11,
      sourceURL: 'http://localhost:5173/src/example.ts?t=123', sourceFunctionName: 'resize', sourceCharPosition: 23, invoker: 'ResizeObserver' }] })
  diagnostics.longFrame({ startTime: 480, duration: 60, renderStart: 490, styleAndLayoutStart: 500 })
  expect(diagnostics.snapshot()).toMatchObject({ longFrameCount: 2, longFrameMaxMs: 163,
    blockingMaxMs: 113, renderMaxMs: 50, layoutTailMaxMs: 40, scriptMaxMs: 130,
    forcedLayoutMaxMs: 11, scriptFunction: 'resize', scriptPosition: 23,
    scriptSource: 'http://localhost:5173/src/example.ts' })
})

it('measures frame gaps independently of the small JS draw timers with bounded output', () => {
  const diagnostics = createResizeFrameDiagnostics(100)
  diagnostics.frame(90)
  diagnostics.frame(110)
  diagnostics.frame(126)
  diagnostics.frame(286)
  diagnostics.end(300)
  diagnostics.frame(400)
  expect(diagnostics.snapshot()).toMatchObject({ frameIntervals: 2, frameMeanMs: 88,
    frameMaxMs: 160, framesOver25Ms: 1, framesOver50Ms: 1, firstFrameWaitMs: 10 })
  const long = createResizeFrameDiagnostics(0)
  for (let i = 0; i < 10000; i++) long.frame(i * 16)
  expect(Object.keys(long.snapshot()).length).toBeLessThanOrEqual(32)
  expect(Object.values(long.snapshot()).every(value => !Array.isArray(value))).toBe(true)
})

it('drains delayed release entries, disconnects once, and logs only after release', () => {
  vi.useFakeTimers()
  vi.spyOn(performance, 'now').mockReturnValue(100)
  const callbacks = new Map<number, FrameRequestCallback>()
  let id = 0
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { callbacks.set(++id, callback); return id })
  const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(key => { callbacks.delete(key) })
  const observe = vi.fn(), disconnect = vi.fn()
  const takeRecords = vi.fn(() => [{ startTime: 110, duration: 160 }])
  vi.stubGlobal('PerformanceObserver', class {
    static supportedEntryTypes = ['long-animation-frame']
    observe = observe; disconnect = disconnect; takeRecords = takeRecords
  })
  const stop = startResizeFrameDiagnostics()
  expect(observe).toHaveBeenCalledWith({ type: 'long-animation-frame', buffered: true })
  callbacks.get(1)!(110)
  expect(recordRuntimeDiagnostic).not.toHaveBeenCalled()
  vi.mocked(performance.now).mockReturnValue(200)
  stop(); stop()
  expect(cancel).toHaveBeenCalledOnce()
  vi.advanceTimersByTime(100)
  expect(disconnect).toHaveBeenCalledOnce()
  expect(recordRuntimeDiagnostic).toHaveBeenCalledExactlyOnceWith('operation-stage', 'workspace.resize.frames',
    expect.objectContaining({ longFrameCount: 1, longFrameMaxMs: 160, observerStatus: 'active' }))
})

it('keeps frame timing available without LoAF and does no work if diagnostics are disabled', () => {
  vi.useFakeTimers()
  vi.stubGlobal('PerformanceObserver', undefined)
  const raf = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(3)
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
  startResizeFrameDiagnostics()()
  vi.advanceTimersByTime(100)
  expect(recordRuntimeDiagnostic).toHaveBeenCalledWith('operation-stage', 'workspace.resize.frames',
    expect.objectContaining({ observerStatus: 'unsupported' }))
  raf.mockClear()
  vi.mocked(runtimeDiagnosticsActive).mockReturnValueOnce(false)
  startResizeFrameDiagnostics()()
  expect(raf).not.toHaveBeenCalled()
})
