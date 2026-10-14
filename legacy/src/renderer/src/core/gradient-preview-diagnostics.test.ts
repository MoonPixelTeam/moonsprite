import { afterEach, describe, expect, it, vi } from 'vitest'
import { createGradientPreviewDiagnostics } from './gradient-preview-diagnostics'

afterEach(() => vi.useRealTimers())

describe('gradient preview diagnostic aggregation', () => {
  it('does not write on frames and emits one bounded summary after settling', () => {
    vi.useFakeTimers()
    const emit = vi.fn()
    const collector = createGradientPreviewDiagnostics(emit)
    for (let index = 0; index < 240; index++) {
      collector.record('linear', { path: 'linear-periodic', width: 4000 }, { prepare: 1, raster: 20, upload: 2, total: 23, inputLag: 30 })
      vi.advanceTimersByTime(16)
    }
    expect(emit).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    expect(emit).toHaveBeenCalledTimes(1)
    expect(emit.mock.calls[0][0]).toMatchObject({ frames: 240, totalMeanMs: 23, totalMaxMs: 23, inputLagMaxMs: 30 })
    expect(JSON.stringify(emit.mock.calls[0][0]).length).toBeLessThan(1000)
    collector.flush()
    expect(emit).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('separates different paths and flushes pending work on cleanup', () => {
    vi.useFakeTimers()
    const emit = vi.fn()
    const collector = createGradientPreviewDiagnostics(emit)
    collector.record('linear', { path: 'linear-periodic' }, { prepare: 1, raster: 2, upload: 3, total: 6, inputLag: 10 })
    collector.record('radial', { path: 'sampled-dither' }, { prepare: 1, raster: 900, upload: 3, total: 904, inputLag: 1000 })
    collector.flush()
    expect(emit.mock.calls.map(call => [call[0].path, call[0].totalMaxMs])).toEqual([['linear-periodic', 6], ['sampled-dither', 904]])
    expect(vi.getTimerCount()).toBe(0)
  })
})
