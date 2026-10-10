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

it.each([800, 3840])('filters only a materialized cursor crop on a %s-pixel viewport', viewportWidth => {
  const draws: Array<{ source: unknown; args: number[]; filter: string }> = []
  const surfaces: object[] = []
  vi.stubGlobal('OffscreenCanvas', class {
    private context = {
      filter: 'none', clearRect: vi.fn(),
      drawImage(source: unknown, ...args: number[]) { draws.push({ source, args, filter: this.filter }) }
    }
    constructor(public width: number, public height: number) { surfaces.push(this) }
    getContext() { return this.context }
  })
  const context = {
    canvas: { width: viewportWidth, height: 2160 },
    getTransform: () => ({ a: 2, b: 0, c: 0, d: 2, e: 0, f: 0, inverse: () => ({ translate: vi.fn() }) }),
    createPattern: () => ({ setTransform: vi.fn() })
  } as unknown as RasterContext2D
  for (let x = 10; x < 20; x++) canvasAdaptiveContrast(context, { x, y: 30, width: 8, height: 6 })
  // Repeated pointer motion reuses two small surfaces, regardless of viewport size.
  expect(surfaces).toHaveLength(2)
  expect(surfaces).toEqual([expect.objectContaining({ width: 16, height: 12 }), expect.objectContaining({ width: 16, height: 12 })])
  const copies = draws.filter(draw => draw.source === context.canvas)
  expect(copies).toHaveLength(10)
  expect(copies.every(draw => draw.filter === 'none')).toBe(true)
  expect(copies[0].args).toEqual([20, 60, 16, 12, 0, 0, 16, 12])
  const filtered = draws.filter(draw => draw.filter.includes('invert(1)'))
  expect(filtered).toHaveLength(10)
  expect(filtered.every(draw => draw.source === surfaces[1])).toBe(true)
})

it('reuses preview surfaces while the brush crosses the canvas edge and clears retained pixels', () => {
  const surfaces: Array<{ width: number; height: number; clearRect: ReturnType<typeof vi.fn> }> = []
  const resized = vi.fn()
  vi.stubGlobal('OffscreenCanvas', class {
    private storedWidth: number
    private storedHeight: number
    readonly clearRect = vi.fn()
    private readonly context = { clearRect: this.clearRect, drawImage: vi.fn(), filter: 'none' }
    constructor(width: number, height: number) { this.storedWidth = width; this.storedHeight = height; surfaces.push(this) }
    get width() { return this.storedWidth }
    set width(value: number) { resized(); this.storedWidth = value }
    get height() { return this.storedHeight }
    set height(value: number) { resized(); this.storedHeight = value }
    getContext() { return this.context }
  })
  const context = {
    canvas: { width: 4096, height: 4096 },
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, inverse: () => ({ translate: vi.fn() }) }),
    createPattern: () => ({ setTransform: vi.fn() })
  } as unknown as RasterContext2D
  for (let i = 0; i < 500; i++) canvasAdaptiveContrast(context, { x: -(i % 9), y: 0, width: 64, height: 64 })
  expect(surfaces).toHaveLength(2)
  expect(resized).not.toHaveBeenCalled()
  for (const surface of surfaces) {
    expect(surface.width).toBe(64)
    expect(surface.height).toBe(64)
    expect(surface.clearRect).toHaveBeenLastCalledWith(0, 0, 64, 64)
  }
})

it('releases oversized preview capacity after changing brush size or aspect ratio', () => {
  const surfaces: Array<{ width: number; height: number }> = []
  vi.stubGlobal('OffscreenCanvas', class {
    private readonly context = { clearRect: vi.fn(), drawImage: vi.fn(), filter: 'none' }
    constructor(public width: number, public height: number) { surfaces.push(this) }
    getContext() { return this.context }
  })
  const context = {
    canvas: { width: 4096, height: 4096 },
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, inverse: () => ({ translate: vi.fn() }) }),
    createPattern: () => ({ setTransform: vi.fn() })
  } as unknown as RasterContext2D
  for (const [width, height] of [[1024, 1024], [16, 16], [8, 1000], [1000, 8], [800, 8]]) {
    canvasAdaptiveContrast(context, { x: 0, y: 0, width, height })
    expect(surfaces).toHaveLength(2)
    for (const surface of surfaces) {
      expect(surface.width).toBeGreaterThanOrEqual(width)
      expect(surface.height).toBeGreaterThanOrEqual(height)
      expect(surface.width * surface.height).toBeLessThanOrEqual(width * height * 1.25)
    }
  }
})
