import { afterEach, expect, it, vi } from 'vitest'
import { createDocument, compositeRegion, DocumentCompositeCache } from './document'
import { beginPixelEdit, commitPixelEdit } from './history'
import { paintBrush, paintLine, brushStrokeInvalidationRects } from './tools-brush'
import { createDefaultLayerStyles } from './layer-styles'
import * as symmetry from './symmetry'

afterEach(() => vi.restoreAllMocks())

const axisCases = [
  { horizontal: true, vertical: true, diagonalUp: false, diagonalDown: false },
  { horizontal: false, vertical: false, diagonalUp: false, diagonalDown: false, rotational: true },
  { horizontal: false, vertical: false, diagonalUp: true, diagonalDown: false },
  { horizontal: false, vertical: false, diagonalUp: false, diagonalDown: true },
  { horizontal: true, vertical: false, diagonalUp: true, diagonalDown: true, rotational: true }
]

it.each(axisCases)('keeps real 45px pointer segments off the per-pixel symmetry path: %j', axes => {
  const document = createDocument('actual pointer segment', 333, 333, 'rgba')
  const layer = document.layers[0]
  layer.layerStyles = createDefaultLayerStyles()
  layer.layerStyles.stroke.enabled = true
  layer.layerStyles.shadow.enabled = true
  const pointTransforms = vi.spyOn(symmetry, 'symmetryPoints')
  paintLine(document, layer, beginPixelEdit(layer.id), 150, 150, 160, 155, 45, { r: 255, g: 0, b: 0, a: 255 }, null,
    'round', 'solid', 1, null, undefined, 0, 'paint', undefined, 'raster',
    axes, undefined, undefined,
    { fromSize: 45, toSize: 45, fromOpacityScale: 1, toOpacityScale: 1, fromAngle: 0, toAngle: 0 })
  expect(pointTransforms.mock.calls.length).toBeLessThan(100)
  expect(layer.pixels.some(value => value !== 0)).toBe(true)
})

const equalPixels = (left: ArrayLike<number>, right: ArrayLike<number>): boolean => {
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index++) if (left[index] !== right[index]) return false
  return true
}

it.each(axisCases.flatMap(axes => [1, 2, 38, 45, 63, 64, 65, 128].map(size => ({ axes, size }))))('matches per-pixel symmetry for $size px, $axes, erasers and undo', ({ size, axes }) => {
  for (const shape of ['round', 'square', 'line'] as const) for (const erase of [false, true]) {
    const document = createDocument('fast mirrored spans', 160, 160, 'rgba')
    const reference = createDocument('per-pixel mirrored spans', 160, 160, 'rgba')
    const layer = document.layers[0], referenceLayer = reference.layers[0]
    if (erase) { layer.pixels.fill(255); referenceLayer.pixels.fill(255) }
    const before = layer.pixels.slice()
    const edit = beginPixelEdit(layer.id), referenceEdit = beginPixelEdit(referenceLayer.id)
    const color = { r: 230, g: 30, b: 40, a: erase ? 0 : 255 }
    for (const [x, y, cx, cy] of [[70, 75, 80, 80], [72, 76, 80, 80], [74, 76, 80.5, 79.5], [74, 76, 80, 79.5], [-4, 20, 80.5, 79.5]]) {
      const center = { x: cx, y: cy }
      paintBrush(document, layer, edit, x, y, size, color, shape, null, 'solid', 1, null, undefined, 0, 'paint', undefined, axes, center)
      // A full-canvas selection deliberately uses the general per-pixel path.
      paintBrush(reference, referenceLayer, referenceEdit, x, y, size, color, shape, { x: 0, y: 0, width: 160, height: 160 }, 'solid', 1, null, undefined, 0, 'paint', undefined, axes, center)
      expect(equalPixels(layer.pixels, referenceLayer.pixels)).toBe(true)
    }
    const after = layer.pixels.slice()
    const entry = commitPixelEdit(document, edit, 'mirrored brush')!
    entry.undo()
    expect(equalPixels(layer.pixels, before)).toBe(true)
    entry.redo()
    expect(equalPixels(layer.pixels, after)).toBe(true)
  }
})

it('measures large symmetric brush writes separately from styled compositing', () => {
  const document = createDocument('large symmetric brush', 512, 512, 'rgba')
  const layer = document.layers[0]
  layer.layerStyles = createDefaultLayerStyles()
  layer.layerStyles.stroke.enabled = true
  const axes = { horizontal: true, vertical: true, diagonalUp: false, diagonalDown: false }
  const cache = new DocumentCompositeCache()
  const edit = beginPixelEdit(layer.id)
  compositeRegion(document, 0, 0, 512, 512, cache, 0)
  let paintMs = 0, styleMs = 0
  for (let sample = 0; sample < 8; sample++) {
    const point = { x: 192 + sample * 2, y: 192 + sample }
    const start = performance.now()
    paintBrush(document, layer, edit, point.x, point.y, 128, { r: 255, g: 0, b: 0, a: 255 }, 'round', null, 'solid', 1, null, undefined, 0, 'paint', undefined, axes)
    paintMs += performance.now() - start
    const rects = brushStrokeInvalidationRects(point, point, 128, null, 512, 512, axes)
    for (const rect of rects) cache.invalidateStyleSources(document, rect, [layer.id])
    const renderStart = performance.now()
    for (const rect of rects) compositeRegion(document, rect.x, rect.y, rect.width, rect.height, cache, 0)
    styleMs += performance.now() - renderStart
  }
  console.info(`128px four-way brush, 8 samples: paint=${paintMs.toFixed(1)}ms styles=${styleMs.toFixed(1)}ms`)
  expect(equalPixels(compositeRegion(document, 0, 0, 512, 512, cache, 0), compositeRegion(document, 0, 0, 512, 512, new DocumentCompositeCache(), 0))).toBe(true)
})
