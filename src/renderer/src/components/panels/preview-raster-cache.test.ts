import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createDocument, createLayer, createLayerMask, writeLayerColor } from '@/core/document'
import { compositeRegion } from '@/core/document-composite'
import { ensureAnimationDocument } from '@/core/animation'
import { createPreviewPointSampler } from '@/core/preview-point-sampler'
import { PreviewRasterCache, type PreviewRasterView } from './preview-raster-cache'
import { createPreviewProjectedRenderer } from '@/core/preview-projected-renderer'
import { BLEND_MODES } from '@shared/types-color'

const writes: Array<{ x: number; y: number; data: Uint8ClampedArray }> = []
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    createImageData: (width: number, height: number) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
    putImageData: (data: ImageData, x: number, y: number) => writes.push({ x, y, data: data.data.slice() }),
    drawImage: vi.fn(), clearRect: vi.fn()
  } as unknown as CanvasRenderingContext2D)
  writes.length = 0
})
afterEach(() => vi.restoreAllMocks())
const view: PreviewRasterView = { width: 256, height: 256, scale: 1 / 16, originX: 0, originY: 0, luminance: false }

it('copies translated translucent pixels and samples only newly exposed edges', () => {
  const doc = createDocument('pan cache', 16, 16, 'rgba', false)
  for (let p = 0; p < 256; p++) writeLayerColor(doc, doc.layers[0], p, { r: p, g: 22, b: 33, a: 128 })
  const pixels = new Uint8ClampedArray(8 * 8 * 4)
  const context = {
    globalCompositeOperation: 'source-over',
    createImageData: (width: number, height: number) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
    putImageData: (image: ImageData, x: number, y: number) => {
      for (let row = 0; row < image.height; row++) pixels.set(image.data.subarray(row * image.width * 4, (row + 1) * image.width * 4), ((y + row) * 8 + x) * 4)
    },
    drawImage: vi.fn((_source: CanvasImageSource, sx: number, sy: number, width: number, height: number, dx: number, dy: number) => {
      expect(context.globalCompositeOperation).toBe('copy')
      const previous = pixels.slice()
      pixels.fill(0)
      for (let row = 0; row < height; row++) pixels.set(previous.subarray(((sy + row) * 8 + sx) * 4, ((sy + row) * 8 + sx + width) * 4), ((dy + row) * 8 + dx) * 4)
    })
  }
  vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(context as unknown as CanvasRenderingContext2D)
  const cache = new PreviewRasterCache()
  const initial = { width: 8, height: 8, originX: 0, originY: 0, scale: 1.25, luminance: false }
  cache.configure(doc, 'frame-1', 0, initial)
  expect(cache.render().pixels).toBe(64)
  let previousX = 0, previousY = 0
  for (const [originX, originY] of [[1, 0], [2, 1], [-1, 2], [0, -1], [0, 0]]) {
    cache.configure(doc, 'frame-1', 0, { ...initial, originX, originY })
    expect(cache.requiresSeed).toBe(false)
    expect(cache.render().pixels).toBe(64 - (8 - Math.abs(originX - previousX)) * (8 - Math.abs(originY - previousY)))
    const expected = new Uint8ClampedArray(64 * 4)
    createPreviewProjectedRenderer(doc)(Int32Array.from({ length: 8 }, (_, x) => Math.floor((x + 0.5 - originX) / initial.scale)),
      Int32Array.from({ length: 8 }, (_, y) => Math.floor((y + 0.5 - originY) / initial.scale)), expected)
    expect(pixels).toEqual(expected)
    expect(context.globalCompositeOperation).toBe('source-over')
    previousX = originX; previousY = originY
  }
  const copies = context.drawImage.mock.calls.length
  cache.configure(doc, 'frame-1', 1, { ...initial, originX: 1 })
  expect(context.drawImage).toHaveBeenCalledTimes(copies)
  expect(cache.render().pixels).toBe(64)
})

it('limits a two-pixel pan of a 1024 by 768 preview to 1536 sampled pixels', () => {
  const doc = createDocument('pan work budget', 16, 16, 'rgba', false)
  const cache = new PreviewRasterCache()
  const large = { ...view, width: 1024, height: 768, scale: 48 }
  cache.configure(doc, 'frame-1', 0, large)
  cache.seedFromShared(document.createElement('canvas'), [])
  cache.configure(doc, 'frame-1', 0, { ...large, originX: 2 })
  expect(cache.requiresSeed).toBe(false)
  expect(cache.render().pixels).toBe(1536)
})

it('restores the whole raster when a full live preview ends without a revision change', () => {
  const doc = createDocument('full live preview', 2, 2, 'rgba', false)
  const cache = new PreviewRasterCache()
  cache.configure(doc, 'frame-1', 0, { width: 2, height: 2, scale: 1, originX: 0, originY: 0, luminance: false })
  cache.render()
  writeLayerColor(doc, doc.layers[0], 0, { r: 255, g: 0, b: 0, a: 255 })
  cache.invalidate(undefined, true)
  expect(cache.render().pixels).toBe(4)
  expect(Array.from(writes.at(-1)!.data.slice(0, 4))).toEqual([255, 0, 0, 255])
  writeLayerColor(doc, doc.layers[0], 0, { r: 0, g: 0, b: 0, a: 0 })
  cache.finishLive()
  expect(cache.render().pixels).toBe(4)
  expect(Array.from(writes.at(-1)!.data.slice(0, 4))).toEqual([0, 0, 0, 0])
  expect(cache.render().pixels).toBe(0)
})

it.each(BLEND_MODES)('projected scanlines preserve %s with groups, clipping, masks and cumulative blending', mode => {
  const doc = createDocument('projected stack', 8, 8, 'rgba', false)
  for (let n = 0; n < 4; n++) {
    const layer = n === 0 ? doc.layers[0] : createLayer(String(n), 8, 8, 'rgba')
    if (n) doc.layers.push(layer)
    layer.opacity = n % 2 ? 0.6 : 1
    layer.blendMode = n === 2 ? mode : 'normal'
    if (n > 0) layer.groupId = 'g'
    layer.clippingMask = n === 3
    for (let i = 0; i < 64; i++) writeLayerColor(doc, layer, i, { r: (i * 17 + n * 53) % 256, g: 100 + n * 30, b: 180, a: i % 4 === 0 ? 0 : 150 })
  }
  doc.groups.push({ id: 'g', name: 'G', visible: true, locked: false, opacity: 0.7, blendMode: mode })
  const timeline = ensureAnimationDocument(doc), mask = createLayerMask('g', 8, 8, 'group')
  writeLayerColor(doc, mask, 27, { r: 120, g: 120, b: 120, a: 255 })
  timeline.groupMasks = [{ groupId: 'g', frameId: timeline.activeFrameId, mask }]
  for (const cumulative of [false, true]) {
    doc.groups[0].cumulativeBlend = cumulative
    const xs = new Int32Array([1, 3, 5, 7]), ys = new Int32Array([1, 3, 5, 7]), output = new Uint8ClampedArray(64)
    createPreviewProjectedRenderer(doc)(xs, ys, output)
    const full = compositeRegion(doc, 0, 0, 8, 8)
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const i = (ys[y] * 8 + xs[x]) * 4, j = (y * 4 + x) * 4
      expect(Array.from(output.slice(j, j + 4))).toEqual(Array.from(full.slice(i, i + 4)))
    }
  }
})

it.each(['rgba', 'indexed'] as const)('matches the full compositor for %s groups, clipping, blend modes and live masks', mode => {
  const doc = createDocument('sample', 8, 8, mode, false)
  for (let i = 0; i < 3; i++) {
    const layer = i === 0 ? doc.layers[0] : createLayer(String(i), 8, 8, mode)
    if (i) doc.layers.push(layer)
    layer.opacity = 0.7
    layer.blendMode = i === 1 ? 'multiply' : 'normal'
    if (i) layer.groupId = 'group'
    if (i === 2) layer.clippingMask = true
    for (let p = 0; p < 64; p++) writeLayerColor(doc, layer, p, { r: (p * 7 + i * 42) % 256, g: 60, b: 220, a: p % 3 ? 128 : 255 })
  }
  doc.groups.push({ id: 'group', name: 'group', visible: true, locked: false, opacity: 0.6, blendMode: 'screen' })
  const timeline = ensureAnimationDocument(doc)
  const mask = createLayerMask('group', 8, 8, 'group')
  timeline.groupMasks = [{ groupId: 'group', frameId: timeline.activeFrameId, mask }]
  const sample = createPreviewPointSampler(doc)!
  // A previously neutral mask must remain live without recompiling or scanning it.
  writeLayerColor(doc, mask, 5, { r: 0, g: 0, b: 0, a: 255 })
  const expected = compositeRegion(doc, 0, 0, 8, 8)
  for (let p = 0; p < 64; p++) expect(Object.values(sample(p % 8, Math.floor(p / 8)))).toEqual(Array.from(expected.slice(p * 4, p * 4 + 4)))
})

it('maps output pixels consistently at fractional DPR, pan and zoom, including alpha and offscreen edits', () => {
  const doc = createDocument('mapping', 16, 16, 'rgba', false)
  for (let p = 0; p < 256; p++) writeLayerColor(doc, doc.layers[0], p, { r: p % 256, g: 22, b: 33, a: 128 })
  const cache = new PreviewRasterCache()
  cache.configure(doc, 'frame-1', 0, { width: 8, height: 8, originX: -1.5, originY: -2, scale: 0.75, luminance: false })
  expect(cache.render().pending).toBe(false)
  const sample = createPreviewPointSampler(doc)!
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const expected = sample(Math.floor((x + 2) / 0.75), Math.floor((y + 2.5) / 0.75))
    expect(Array.from(writes[0].data.slice((y * 8 + x) * 4, (y * 8 + x + 1) * 4))).toEqual(Object.values(expected))
  }
  cache.invalidate({ x: 100, y: 100, width: 10, height: 10 })
  expect(cache.render().pixels).toBe(0)
})

it('bounds dirty work on a populated 4K / 100 layer stack and preserves pending work across commit', () => {
  const doc = createDocument('4K-100', 4096, 4096, 'rgba', false)
  // Shared read-only backing saves test memory; all 100 full-size layers are
  // still sampled/blended independently at each output point.
  new Uint32Array(doc.layers[0].pixels.buffer).fill(0x80706050)
  const base = doc.layers[0]
  doc.layers = Array.from({ length: 100 }, (_, i) => ({ ...base, id: `layer-${i}`, opacity: 0.8 }))
  const cache = new PreviewRasterCache()
  cache.configure(doc, 'frame-1', 0, view)
  const fullStart = performance.now()
  const initial = cache.render()
  const fullMs = performance.now() - fullStart
  expect(initial).toEqual({ pixels: 65536, pending: false })
  const samples: number[] = []
  for (let i = 0; i < 50; i++) {
    const start = performance.now()
    cache.invalidate({ x: 512, y: 512, width: 16, height: 16 }, true)
    expect(cache.render().pixels).toBe(1)
    samples.push(performance.now() - start)
  }
  cache.invalidate({ x: 3500, y: 3500, width: 16, height: 16 }, true)
  cache.finishLive()
  cache.configure(doc, 'frame-1', 1, view, { kind: 'region', rect: { x: 512, y: 512, width: 16, height: 16 }, fromRevision: 0, revision: 1 })
  expect(cache.render().pixels).toBe(5)
  expect(cache.render().pixels).toBe(0)
  samples.sort((a, b) => a - b)
  console.info(JSON.stringify({ fixture: '4K/100 full overlapping translucent layers, shared backing', fullPreviewPixels: initial.pixels,
    fullPreviewCpuMs: fullMs, dirtyPreviewPixels: 1, dirtyCpuMedianMs: samples[25], dirtyCpuP95Ms: samples[47] }))
}, 20000)

it('seeds a complete preview from the editor and updates every dirty tile before presenting', () => {
  const doc = createDocument('budget', 4096, 4096, 'rgba', false)
  const cache = new PreviewRasterCache()
  cache.configure(doc, 'frame-1', 0, view)
  cache.seedFromShared(document.createElement('canvas'), [])
  expect(cache.render()).toEqual({ pixels: 0, pending: false })
  cache.invalidate({ x: 512, y: 512, width: 256, height: 256 })
  expect(cache.render()).toEqual({ pixels: 256, pending: false })
  expect(cache.render()).toEqual({ pixels: 0, pending: false })
  cache.configure(doc, 'frame-2', 0, { ...view, width: 8, height: 8 })
  expect(cache.render()).toEqual({ pixels: 64, pending: false })
  cache.dispose()
  expect(cache.render()).toEqual({ pixels: 0, pending: false })
})

it('only seeds once and repairs stale offscreen source regions instead of treating them as current', () => {
  const doc = createDocument('seed', 4096, 4096, 'rgba', false)
  const cache = new PreviewRasterCache()
  cache.configure(doc, 'frame-1', 0, view)
  const source = document.createElement('canvas')
  cache.seedFromShared(source, [{ x: 512, y: 512, width: 16, height: 16 }])
  expect(cache.render().pixels).toBe(1)
  cache.seedFromShared(source, [{ x: 0, y: 0, width: 4096, height: 4096 }])
  expect(cache.render().pixels).toBe(0)
})
