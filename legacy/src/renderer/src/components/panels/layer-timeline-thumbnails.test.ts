import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MAX_CEL_THUMBNAIL_VARIANT_BYTES, rememberCelThumbnailVariant, scheduleThumbnailRender } from './layer-timeline-thumbnails'

describe('timeline thumbnail scheduler', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('batches many thumbnails into one frame and one flush task', () => {
    vi.useFakeTimers()
    const frames: FrameRequestCallback[] = []
    const request = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback)
      return frames.length
    })
    const renders: number[] = []
    scheduleThumbnailRender(() => renders.push(1))
    scheduleThumbnailRender(() => renders.push(2))
    scheduleThumbnailRender(() => renders.push(3))
    expect(request).toHaveBeenCalledOnce()
    expect(renders).toEqual([])
    frames[0](performance.now())
    vi.runAllTimers()
    expect(renders).toEqual([1, 2, 3])
  })

  it('cancels one thumbnail without canceling the shared batch', () => {
    vi.useFakeTimers()
    const frames: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback)
      return frames.length
    })
    const first = vi.fn()
    const second = vi.fn()
    const cancelFirst = scheduleThumbnailRender(first)
    scheduleThumbnailRender(second)
    cancelFirst()
    frames[0](performance.now())
    vi.runAllTimers()
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledOnce()
  })

  it('bounds thumbnail variants by bytes for a large multi-layer timeline', () => {
    const layers = 100
    const frames = 8
    const thumbnailBytes = 128 * 128 * 4
    let beforeBytes = 0
    let afterBytes = 0
    for (let layer = 0; layer < layers; layer += 1) {
      const entries = new Map<string, { revision: number; storageRevision: number; pixels: Uint8ClampedArray }>()
      for (let frame = 0; frame < frames; frame += 1) {
        const pixels = new Uint8ClampedArray(thumbnailBytes)
        beforeBytes += pixels.byteLength
        rememberCelThumbnailVariant(entries, `frame-${frame}`, { revision: frame, storageRevision: frame, pixels })
      }
      afterBytes += [...entries.values()].reduce((total, entry) => total + entry.pixels.byteLength, 0)
    }
    const evidence = {
      scenario: { canvas: '4096x4096', layers, frames, thumbnail: '128x128 RGBA' },
      beforeBytes,
      afterBytes,
      perStorageBudgetBytes: MAX_CEL_THUMBNAIL_VARIANT_BYTES,
      reductionRatio: 1 - afterBytes / beforeBytes
    }
    mkdirSync(resolve('output'), { recursive: true })
    writeFileSync(resolve('output/timeline-thumbnail-byte-budget-after-20261006.json'), `${JSON.stringify(evidence, null, 2)}\n`)
    expect(afterBytes).toBeLessThanOrEqual(layers * MAX_CEL_THUMBNAIL_VARIANT_BYTES)
    expect(evidence.reductionRatio).toBeGreaterThan(0.7)
  })
})
