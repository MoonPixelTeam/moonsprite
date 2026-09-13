import { afterEach, describe, expect, it, vi } from 'vitest'
import { deviceAlignedCanvasRect } from '@/core/canvas-render-plan'
import { createDocument, markLayerContentChanged, readLayerColorAt, writeLayerColor } from '@/core/document'
import { installRuntimeRaster, surfacePixelsMaterialized } from '@/core/runtime-raster'
import { buildCanvasClickFlashRaster, CanvasClickFlashCache, presentCanvasClickFlash, type CanvasClickFlashTiming } from './canvas-click-flash'
import type { RasterContext2D } from './canvas-selection-renderer'

class MockImageData {
  constructor(public data: Uint8ClampedArray, public width: number, public height: number) {}
}
class MockOffscreenCanvas {
  image: MockImageData | null = null
  constructor(public width: number, public height: number) {}
  getContext() { return { putImageData: (image: MockImageData) => { this.image = image } } }
}
const fixture = () => {
  vi.stubGlobal('OffscreenCanvas', MockOffscreenCanvas)
  vi.stubGlobal('ImageData', MockImageData)
  const document = createDocument('flash', 8, 8, 'rgba')
  const layer = document.layers[0]
  const context = { drawImage: vi.fn(), imageSmoothingEnabled: true }
  const cache = new CanvasClickFlashCache()
  const request = {
    contentKey: 'layer:0', layer, palette: document.palette,
    region: { x: 0, y: 0, width: 8, height: 8 },
    originX: 0, originY: 0, zoom: 1, deviceScale: { x: 1, y: 1 }
  }
  const draw = () => cache.draw(context as unknown as RasterContext2D, request)
  const surface = () => context.drawImage.mock.lastCall![0] as MockOffscreenCanvas
  return { document, layer, cache, context, request, draw, surface }
}
afterEach(() => vi.unstubAllGlobals())

describe('move click flash presentation', () => {
  it('keeps a delayed first frame visible for the entire configured duration', () => {
    const flash: CanvasClickFlashTiming = { duration: 120, expiresAt: null }
    expect(presentCanvasClickFlash(flash, 950)).toBe(true)
    expect(flash.expiresAt).toBe(1070)
    expect(presentCanvasClickFlash(flash, 980)).toBe(false)
    expect(flash.expiresAt).toBe(1070)
  })

  it('gives a repeated click its own lifetime even while its previous flash is visible', () => {
    const first: CanvasClickFlashTiming = { duration: 120, expiresAt: null }
    const second: CanvasClickFlashTiming = { duration: 120, expiresAt: null }
    presentCanvasClickFlash(first, 100)
    presentCanvasClickFlash(second, 150)
    expect(first.expiresAt).toBe(220)
    expect(second.expiresAt).toBe(270)
  })
})

describe('move click flash raster', () => {
  it('flashes all four corners of a 4200 x 2400 sparse layer in its first paint', () => {
    const f = fixture()
    const width = 4200, height = 2400, tileSize = 64
    f.layer.width = width; f.layer.height = height
    const columns = Math.ceil(width / tileSize), rows = Math.ceil(height / tileSize)
    const tileOffsets = new Int32Array(columns * rows)
    const data: number[] = []
    for (const [tx, ty] of [[0, 0], [columns - 1, 0], [0, rows - 1], [columns - 1, rows - 1]]) {
      const tw = Math.min(tileSize, width - tx * tileSize), th = Math.min(tileSize, height - ty * tileSize)
      tileOffsets[ty * columns + tx] = data.length + 1
      for (let i = 0; i < tw * th; i += 1) data.push(20, 20, 20, 255)
    }
    installRuntimeRaster(f.layer, { kind: 'sparse-tiles-v1', format: 'rgba', width, height, tileSize, tileOffsets, data: new Uint8Array(data) })
    f.request.region = { x: 0, y: 0, width, height }
    f.request.zoom = 0.1
    const raster = buildCanvasClickFlashRaster(f.request)
    expect(raster.visitedPixels).toBe(data.length / 4)
    expect(raster.visitedPixels).toBeLessThan(16_384)
    expect(f.draw()).toBe(true)
    expect(f.context.drawImage).toHaveBeenCalledTimes(1)
    const image = f.surface().image!
    for (const [x, y] of [[0, 0], [419, 0], [0, 239], [419, 239]]) {
      expect(image.data[(y * image.width + x) * 4 + 3]).toBe(255)
    }
    expect(surfacePixelsMaterialized(f.layer)).toBe(false)
  })

  it('skips source rows only after their complete output silhouette is opaque', () => {
    const f = fixture()
    f.layer.pixels = new Uint8ClampedArray(8 * 8 * 4).fill(255)
    f.request.zoom = 0.25
    const solid = buildCanvasClickFlashRaster(f.request)
    expect(solid.visitedPixels).toBe(16)
    expect([...solid.pixels].filter((_, i) => i % 4 === 3)).toEqual([255, 255, 255, 255])
    // A lone pixel in the last row must still be found; transparent rows
    // never allow an early exit from their destination row.
    f.layer.pixels = new Uint8ClampedArray(8 * 8 * 4)
    f.layer.pixels[63 * 4 + 3] = 255
    const sparse = buildCanvasClickFlashRaster(f.request)
    expect(sparse.visitedPixels).toBe(64)
    expect(sparse.pixels.at(-1)).toBe(255)
  })

  it('reuses the completed bitmap after expiry and invalidates edited or replaced storage', () => {
    const f = fixture()
    writeLayerColor(f.document, f.layer, 0, { r: 20, g: 20, b: 20, a: 255 })
    f.draw()
    const first = f.surface()
    // A frame without a flash does not evict its completed raster.
    for (let i = 0; i < 10; i += 1) f.draw()
    expect(f.context.drawImage).toHaveBeenCalledTimes(11)
    expect(f.surface()).toBe(first)
    writeLayerColor(f.document, f.layer, 0, { r: 255, g: 255, b: 255, a: 100 })
    f.draw()
    const edited = f.surface()
    expect(edited).not.toBe(first)
    expect([...edited.image!.data.slice(0, 4)]).toEqual([0, 0, 0, 100])
    f.layer.pixels = new Uint8ClampedArray(8 * 8 * 4)
    markLayerContentChanged(f.layer)
    f.draw()
    expect(f.surface()).not.toBe(edited)
    expect(f.surface().image!.data.every(value => value === 0)).toBe(true)
  })

  it.each([0.1, 0.5, 1, 1.5, 3])('preserves sparse edges at zoom %s with fractional origin and layer offset', zoom => {
    const f = fixture()
    f.layer.offsetX = -3; f.layer.offsetY = 7
    writeLayerColor(f.document, f.layer, 0, { r: 20, g: 20, b: 20, a: 127 })
    f.request.region = { x: -3, y: 7, width: 8, height: 8 }
    f.request.zoom = zoom
    f.request.originX = -0.3; f.request.originY = 0.7
    f.request.deviceScale = { x: 1.25, y: 1.5 }
    f.draw()
    const alpha = [...f.surface().image!.data].filter((_, i) => i % 4 === 3)
    expect(alpha.filter(value => value > 0)).toEqual([127])
    const expected = deviceAlignedCanvasRect(-0.3 - 3 * zoom, 0.7 + 7 * zoom, 8 * zoom, 8 * zoom, f.request.deviceScale)
    expect(f.context.drawImage).toHaveBeenLastCalledWith(f.surface(), expected.left, expected.top, expected.width, expected.height)
  })

  it('matches layer sampling for an off-canvas clipped dense raster', () => {
    const f = fixture()
    f.layer.offsetX = -3; f.layer.offsetY = -2
    for (let i = 0; i < 64; i += 1) writeLayerColor(f.document, f.layer, i, { r: i * 3, g: i * 2, b: 20, a: i % 3 ? 120 : 0 })
    f.request.region = { x: 0, y: 0, width: 8, height: 8 }
    const raster = buildCanvasClickFlashRaster(f.request)
    for (let y = 0; y < 8; y += 1) for (let x = 0; x < 8; x += 1) {
      const color = readLayerColorAt(f.document, f.layer, x, y)
      const value = color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722 > 145 ? 0 : 255
      const expected = color.a ? [value, value, value, color.a] : [0, 0, 0, 0]
      expect([...raster.pixels.slice((y * 8 + x) * 4, (y * 8 + x + 1) * 4)]).toEqual(expected)
    }
  })

  it.each([false, true])('supports indexed storage (sparse: %s) and palette invalidation', sparse => {
    const f = fixture()
    const document = createDocument('indexed flash', 8, 8, 'indexed')
    const layer = document.layers[0]
    const palette = [{ id: 0, color: { r: 0, g: 0, b: 0, a: 0 } }, { id: 500, color: { r: 255, g: 255, b: 255, a: 127 } }]
    if (sparse) installRuntimeRaster(layer, { kind: 'sparse-tiles-v1', format: 'indexed', width: 8, height: 8, tileSize: 1, data: new Uint8Array([244, 1, 0, 0]), tileOffsets: Int32Array.from({ length: 64 }, (_, i) => i === 63 ? 1 : 0) })
    else layer.pixels[63] = 500
    Object.assign(f.request, { layer, palette })
    f.draw()
    expect([...f.surface().image!.data.slice(-4)]).toEqual([0, 0, 0, 127])
    palette[1].color = { r: 0, g: 0, b: 0, a: 255 }
    f.request.contentKey = 'layer:palette-revision-1'
    f.draw()
    expect([...f.surface().image!.data.slice(-4)]).toEqual([255, 255, 255, 255])
  })

  it('invalidates subpixel coverage when viewport phase changes and clears caches', () => {
    const f = fixture()
    f.request.zoom = 0.5
    f.draw()
    const first = f.surface()
    f.request.originX = 0.4
    f.draw()
    expect(f.surface()).not.toBe(first)
    const second = f.surface()
    f.cache.clear()
    f.draw()
    expect(f.surface()).not.toBe(second)
  })

  it('bounds retained cache entries and keeps recently used flashes', () => {
    const f = fixture()
    const cache = new CanvasClickFlashCache(512, 2)
    const draw = (contentKey: string) => cache.draw(f.context as unknown as RasterContext2D, { ...f.request, contentKey })
    draw('one'); const one = f.surface()
    draw('two'); const two = f.surface()
    draw('one'); expect(f.surface()).toBe(one)
    draw('three')
    draw('one'); expect(f.surface()).toBe(one)
    draw('two'); expect(f.surface()).not.toBe(two)
  })
})
