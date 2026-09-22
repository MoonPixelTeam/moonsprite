import { afterEach, expect, it, vi } from 'vitest'
import { compositeRegion, createDocument, DocumentCompositeCache, writeLayerColor } from './document'
import { beginPixelEdit } from './history'
import { paintBrush, brushStrokeInvalidationRects } from './tools-brush'
import { createDefaultLayerStyles } from './layer-styles'
import { styledLayerBlockCacheFor } from './document-composite-style-types'
import * as geometry from './document-composite-style-geometry'
import { appendStyleDirtyRect } from './layer-style-dirty-regions'
import { LayerStyleTileCache } from './layer-style-tile-cache'
import type { SelectionRect } from '@shared/types-selection'

afterEach(() => vi.restoreAllMocks())

it.each(['stroke', 'combined', 'dynamic'] as const)('updates only touched pixels within warm %s style blocks near the symmetry center', mode => {
  const document = createDocument('dense symmetric drawing', 256, 256, 'rgba')
  const layer = document.layers[0]
  const styles = layer.layerStyles = createDefaultLayerStyles()
  styles.stroke.enabled = true
  if (mode !== 'stroke') {
    styles.shadow.enabled = true
    styles.shadow.blur = 2
    styles.innerGlow.enabled = true
    styles.gradientOverlay.enabled = true
  }
  if (mode === 'dynamic') {
    styles.stroke.smartHue = true
    styles.stroke.followOpacity = true
  }
  for (let y = 8; y < 256; y += 8) for (let x = 8; x < 256; x += 8) {
    writeLayerColor(document, layer, y * 256 + x, { r: 180, g: 20, b: 20, a: 255 })
  }
  const cache = new DocumentCompositeCache()
  compositeRegion(document, 0, 0, 256, 256, cache, 0)
  const render = vi.spyOn(geometry, 'localBinaryStyleFields')
  const axes = { horizontal: true, vertical: true, diagonalUp: false, diagonalDown: false }
  const edit = beginPixelEdit(layer.id)
  for (const x of [120, 122, 125]) {
    paintBrush(document, layer, edit, x, 120, 5, { r: 255, g: 40, b: 40, a: 180 }, 'round', null, 'solid', 1, null, undefined, 0, 'paint', undefined, axes)
    for (const rect of brushStrokeInvalidationRects({ x, y: 120 }, { x, y: 120 }, 5, null, 256, 256, axes)) cache.invalidateStyleSources(document, rect, [layer.id])
    render.mockClear()
    const actual = compositeRegion(document, 0, 0, 256, 256, cache, 0)
    const renderedPixels = render.mock.calls.reduce((sum, call) => sum + call[2].width * call[2].height, 0)
    expect(renderedPixels).toBeGreaterThan(0)
    expect(renderedPixels).toBeLessThan(4096)
    expect(actual).toEqual(compositeRegion(document, 0, 0, 256, 256, new DocumentCompositeCache(), 0))
  }
}, 20_000)

it('scans only mirrored brush regions and retains untouched style blocks between them', () => {
  const document = createDocument('symmetric styles', 256, 256, 'rgba')
  const layer = document.layers[0]
  layer.layerStyles = createDefaultLayerStyles()
  layer.layerStyles.stroke.enabled = true
  layer.layerStyles.shadow.enabled = true
  layer.layerStyles.innerGlow.enabled = true
  writeLayerColor(document, layer, 128 * 256 + 128, { r: 255, g: 0, b: 0, a: 255 })
  const cache = new DocumentCompositeCache()
  compositeRegion(document, 0, 0, 256, 256, cache, 0)
  const blocks = styledLayerBlockCacheFor(cache.renderLayersFor(document, 0)![0])!.blocks
  const center = blocks.get('2:2')
  expect(center).toBeDefined()
  const scan = vi.spyOn(geometry, 'incrementalContentBounds')
  const axes = { horizontal: true, vertical: true, diagonalUp: false, diagonalDown: false }
  const edit = beginPixelEdit(layer.id)
  for (const x of [12, 14]) {
    paintBrush(document, layer, edit, x, 12, 5, { r: 41, g: 121, b: 255, a: 180 }, 'round', null, 'solid', 1, null, undefined, 0, 'paint', undefined, axes)
    for (const rect of brushStrokeInvalidationRects({ x, y: 12 }, { x, y: 12 }, 5, null, 256, 256, axes)) {
      cache.invalidateStyleSources(document, rect, [layer.id])
    }
    const actual = compositeRegion(document, 0, 0, 256, 256, cache, 0)
    expect(actual).toEqual(compositeRegion(document, 0, 0, 256, 256, new DocumentCompositeCache(), 0))
    expect(blocks.get('2:2')).toBe(center)
  }
  const scannedPixels = scan.mock.calls.reduce((sum, call) => sum + call[3].width * call[3].height, 0)
  expect(scannedPixels).toBeLessThanOrEqual(8 * 25)
})

it('retains isolated style tiles between disjoint edits and refreshes both edited tiles', () => {
  const cache = new LayerStyleTileCache()
  const owner = {}
  const styles = createDefaultLayerStyles()
  styles.stroke.enabled = true
  styles.shadow.enabled = true
  let red = 40
  const source = vi.fn(() => ({ r: red, g: 80, b: 120, a: 255 }))
  const resolve = (color: ReturnType<typeof source>) => color
  const bounds = { x: 0, y: 0, width: 256, height: 256 }
  const before = cache.prepare(owner, 'same geometry', 0, undefined, bounds, styles, source, resolve)
  before(12, 12)
  const middle = before(128, 128)
  before(243, 243)
  red = 200
  const dirty = [{ x: 10, y: 10, width: 5, height: 5 }, { x: 241, y: 241, width: 5, height: 5 }]
  const after = cache.prepare(owner, 'same geometry', 1, dirty, bounds, styles, source, resolve)
  source.mockClear()
  expect(after(128, 128)).toEqual(middle)
  expect(source).not.toHaveBeenCalled()
  expect(after(12, 12).r).toBe(200)
  expect(after(243, 243).r).toBe(200)
})

it('bounds a long pending queue without losing any edited region', () => {
  const pending: SelectionRect[] = []
  const inputs = Array.from({ length: 160 }, (_, i) => ({ x: (i % 2) * 4096 + Math.floor(i / 2) * 10, y: 20, width: 2, height: 2 }))
  for (const rect of inputs) {
    appendStyleDirtyRect(pending, rect)
    expect(pending.length).toBeLessThanOrEqual(32)
  }
  for (const rect of inputs) expect(pending.some(region =>
    region.x <= rect.x && region.y <= rect.y
    && region.x + region.width >= rect.x + rect.width
    && region.y + region.height >= rect.y + rect.height)).toBe(true)
  expect(pending.every(rect => rect.width < 4096)).toBe(true)
})
