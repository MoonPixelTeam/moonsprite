import { afterEach, expect, it, vi } from 'vitest'
import { canvasAdaptiveContrast } from './canvas-adaptive-contrast'
import type { RasterContext2D } from './canvas-selection-renderer'

afterEach(() => vi.unstubAllGlobals())

it.each([
  { a: 0, b: 2, c: -2, d: 0, e: 100, f: 0, crop: [68, 20, 8, 16] },
  { a: -2, b: 0, c: 0, d: 2, e: 100, f: 0, crop: [64, 24, 16, 8] }
])('samples the document beneath a rotated or mirrored transparent overlay: $crop', matrix => {
  const draws: Array<{ source: unknown; args: number[]; filter: string }> = []
  vi.stubGlobal('OffscreenCanvas', class {
    constructor(public width: number, public height: number) {}
    getContext() {
      return { filter: 'none', clearRect: vi.fn(), drawImage(source: unknown, ...args: number[]) { draws.push({ source, args, filter: this.filter }) } }
    }
  })
  const backdrop = { width: 100, height: 100 } as HTMLCanvasElement
  const overlay = { width: 100, height: 100 }
  const setTransform = vi.fn()
  const context = { canvas: overlay, getTransform: () => ({ ...matrix, inverse: () => ({ translate: () => 'inverse mapping' }) }), createPattern: () => ({ setTransform }) } as unknown as RasterContext2D
  canvasAdaptiveContrast(context, { x: 10, y: 12, width: 8, height: 4 }, backdrop)
  expect(draws[0]).toEqual({ source: backdrop, args: [...matrix.crop, 0, 0, matrix.crop[2], matrix.crop[3]], filter: 'none' })
  expect(draws[1].source).toBe(overlay)
  expect(draws[1].filter).toBe('none')
  expect(draws[2].filter).toContain('invert(1)')
  expect(setTransform).toHaveBeenCalledWith('inverse mapping')
})

it('aligns contrast with each covered backing pixel at scaled and translated view positions', () => {
  const drawImage = vi.fn(), setTransform = vi.fn()
  const target = { clearRect: vi.fn(), drawImage, filter: '' }
  vi.stubGlobal('OffscreenCanvas', class {
    constructor(public width: number, public height: number) {}
    getContext() { return target }
  })
  const context = {
    canvas: { width: 200, height: 100 },
    getTransform: () => ({ a: 2, b: 0, c: 0, d: 2, e: -10, f: -20, inverse: () => ({ translate: (x: number, y: number) => ({ a: 0.5, d: 0.5, e: 5 + x / 2, f: 10 + y / 2 }) }) }),
    createPattern: vi.fn(() => ({ setTransform }))
  } as unknown as RasterContext2D
  const pattern = canvasAdaptiveContrast(context, { x: 20, y: 30, width: 8, height: 6 })
  expect(pattern).toEqual({ setTransform })
  // Only the cursor's covered region is copied; no hotspot read or full-canvas readback.
  expect(drawImage).toHaveBeenCalledWith(context.canvas, 30, 40, 16, 12, 0, 0, 16, 12)
  expect(setTransform).toHaveBeenCalledWith({ a: 0.5, d: 0.5, e: 20, f: 30 })
  expect(context.createPattern).toHaveBeenCalledWith(expect.objectContaining({ width: 16, height: 12 }), 'no-repeat')
})

it('does not allocate a backdrop for a mark entirely outside the canvas', () => {
  const allocate = vi.fn()
  vi.stubGlobal('OffscreenCanvas', allocate)
  const context = { canvas: { width: 20, height: 20 }, getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) } as unknown as RasterContext2D
  canvasAdaptiveContrast(context, { x: -10, y: 0, width: 5, height: 5 })
  expect(allocate).not.toHaveBeenCalled()
})
