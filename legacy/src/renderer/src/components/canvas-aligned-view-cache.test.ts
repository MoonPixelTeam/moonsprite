import { afterEach, expect, it, vi } from 'vitest'
import { CanvasAlignedViewCache } from './canvas-aligned-view-cache'
import { CanvasCompositeBlitter } from './canvas-composite-cache-blitter'

afterEach(() => vi.unstubAllGlobals())
it('retains opposite tile regions while bounding total memory and releasing invalidated surfaces', () => {
  const canvases: { width: number; height: number }[] = []
  vi.stubGlobal('OffscreenCanvas', class {
    constructor(public width: number, public height: number) { canvases.push(this) }
    getContext() { return { setTransform: vi.fn(), imageSmoothingEnabled: false } }
  })
  const blitter = new CanvasCompositeBlitter()
  const build = vi.spyOn(blitter, 'drawAlignedPixelRegion').mockImplementation(() => {})
  const context = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D
  const source = { width: 3000, height: 3000 } as ImageBitmap
  const cache = new CanvasAlignedViewCache()
  for (const x of [0, 700, 0, 700, 0, 700, 0, 700]) expect(cache.draw(context, source, blitter, 0, 0, 4.5, x, 0, 100, 100)).toBe(true)
  expect(build).toHaveBeenCalledTimes(2)
  for (let index = 0; index < 15; index++) {
    cache.draw(context, source, blitter, 0, 0, 4.5, index * 150, 500, 400, 400)
    expect(canvases.reduce((sum, canvas) => sum + canvas.width * canvas.height * 4, 0)).toBeLessThanOrEqual(32 * 1024 * 1024)
  }
  cache.clear()
  expect(canvases.every(canvas => canvas.width === 0 && canvas.height === 0)).toBe(true)
})
