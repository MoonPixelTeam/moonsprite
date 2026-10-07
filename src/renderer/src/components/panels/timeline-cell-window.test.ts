import { describe, expect, it, vi } from 'vitest'
import { timelineVisibleRange } from './use-timeline-cell-window'
import { scheduleThumbnailRender } from './layer-timeline-thumbnails'

describe('timeline cell viewport and thumbnail slices', () => {
  it('covers variable group/mask row heights at both edges and clamps overscan', () => {
    expect(timelineVisibleRange([24, 64, 84, 124, 164], 65, 100, 0)).toEqual([1, 3])
    expect(timelineVisibleRange([0, 40, 80, 120], 40, 80, 0)).toEqual([1, 2])
    expect(timelineVisibleRange([0, 40, 80, 120], 0, 40)).toEqual([0, 3])
    expect(timelineVisibleRange([0, 40, 80, 120], 500, 600, 0)).toEqual([3, 3])
  })
  it('yields after its time budget and honors cancellation between slices', () => {
    vi.useFakeTimers()
    const frames: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => { frames.push(cb); return frames.length })
    let time = 0
    vi.spyOn(performance, 'now').mockImplementation(() => time)
    const rendered: number[] = []
    const cancel = Array.from({ length: 6 }, (_, i) => scheduleThumbnailRender(() => { rendered.push(i); time += 4 }))
    frames.shift()!(time); vi.runOnlyPendingTimers()
    expect(rendered).toEqual([0, 1])
    expect(frames.length).toBe(1)
    cancel[2](); cancel[4]()
    frames.shift()!(time); vi.runOnlyPendingTimers()
    expect(rendered).toEqual([0, 1, 3, 5])
    cancel.forEach(fn => fn())
    vi.useRealTimers(); vi.restoreAllMocks()
  })
})
