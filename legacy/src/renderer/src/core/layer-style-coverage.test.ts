import { describe, expect, it, vi } from 'vitest'
import { compositeRegion, createDocument, createLayer, createLayerMask, DocumentCompositeCache, markLayerContentChanged, writeLayerColor } from './document'
import { createDefaultLayerStyles, applyLayerStylesAt } from './layer-styles'
import { layerStyleCoverageAt, layerStyleCoverageTile } from './layer-style-coverage'
import { ensureAnimationDocument } from './animation'

describe('exact alpha style coverage', () => {
  it.each(['square', 'horizontal', 'vertical', 'round'] as const)('matches reference pixels for %s with variable alpha and stacked overlays', kernel => {
    const styles = createDefaultLayerStyles()
    styles.stroke = { ...styles.stroke, enabled: true, size: 3, position: 'both', kernel,
      directions: { n: kernel !== 'horizontal', s: kernel !== 'horizontal', w: kernel !== 'vertical', e: kernel !== 'vertical', nw: kernel === 'square', ne: kernel === 'square', sw: kernel === 'square', se: kernel === 'square' } }
    styles.shadow = { ...styles.shadow, enabled: true, blur: 3, offsetX: -2, offsetY: 1 }
    styles.innerGlow = { ...styles.innerGlow, enabled: true, size: 4 }
    styles.colorOverlay.enabled = true
    styles.gradientOverlay.enabled = true
    const read = (x: number, y: number) => ({ r: (Math.abs(x * 47) % 256), g: Math.abs(y * 31) % 256, b: 23, a: [0, 1, 63, 128, 200, 254, 255][Math.abs(x * 13 + y * 7) % 7] })
    const rect = { x: -4, y: -3, width: 12, height: 11 }
    const tile = layerStyleCoverageTile(rect, styles, (x, y) => read(x, y).a)
    for (let y = 0; y < rect.height; y++) for (let x = 0; x < rect.width; x++) {
      const sx = rect.x + x, sy = rect.y + y, source = read(sx, sy)
      expect(applyLayerStylesAt(rect, styles, sx, sy, source, read, undefined, layerStyleCoverageAt(tile, y * rect.width + x))).toEqual(applyLayerStylesAt(rect, styles, sx, sy, source, read))
    }
  })
})

const fixture = () => {
  const doc = createDocument('styled composition', 24, 24, 'rgba', false), layer = doc.layers[0]
  for (let y = 3; y < 21; y++) for (let x = 3; x < 21; x++) writeLayerColor(doc, layer, y * 24 + x, { r: x * 10, g: y * 10, b: 160, a: (x + y) % 3 === 0 ? 128 : 255 })
  const styles = createDefaultLayerStyles()
  styles.stroke = { ...styles.stroke, enabled: true, size: 2, position: 'both' }
  styles.shadow = { ...styles.shadow, enabled: true, blur: 2, offsetX: 2, offsetY: -1 }
  styles.innerGlow = { ...styles.innerGlow, enabled: true, size: 2 }
  styles.gradientOverlay.enabled = true
  layer.layerStyles = styles
  return { doc, layer, styles }
}

describe('styled cache across compositing features and source growth', () => {
  it.each(['normal', 'multiply', 'mask', 'group', 'clipping'] as const)('matches uncached composition before and after live %s painting', feature => {
    const { doc, layer, styles } = fixture()
    if (feature === 'multiply') layer.blendMode = 'multiply'
    if (feature === 'group') {
      doc.groups.push({ id: 'g', name: 'group', visible: true, locked: false, opacity: 0.7, blendMode: 'normal', parentGroupId: null, layerStyles: { ...styles, stroke: { ...styles.stroke, enabled: false } } })
      layer.groupId = 'g'
    }
    if (feature === 'mask') {
      const animation = ensureAnimationDocument(doc)
      const mask = createLayerMask(layer.id, 24, 24)
      for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) writeLayerColor(doc, mask, y * 24 + x, { r: x < 12 ? 128 : 255, g: x < 12 ? 128 : 255, b: x < 12 ? 128 : 255, a: 255 })
      animation.cels.find(cel => cel.layerId === layer.id)!.mask = mask
    }
    if (feature === 'clipping') {
      const lower = createLayer('base', 24, 24, 'rgba')
      for (let y = 5; y < 19; y++) for (let x = 5; x < 19; x++) writeLayerColor(doc, lower, y * 24 + x, { r: 255, g: 255, b: 255, a: 255 })
      doc.layers.unshift(lower); layer.clippingMask = true
    }
    const cache = new DocumentCompositeCache()
    expect(compositeRegion(doc, 0, 0, 24, 24, cache, 1)).toEqual(compositeRegion(doc, 0, 0, 24, 24))
    for (const point of [{ x: 10, y: 10 }, { x: 11, y: 10 }, { x: 21, y: 22 }]) {
      writeLayerColor(doc, layer, point.y * 24 + point.x, { r: 10, g: 200, b: 80, a: 128 })
      markLayerContentChanged(layer)
      const dirty = { ...point, width: 1, height: 1 }
      cache.invalidateStyleSources(doc, dirty, [layer.id])
      expect(compositeRegion(doc, 0, 0, 24, 24, cache, 1, dirty, dirty)).toEqual(compositeRegion(doc, 0, 0, 24, 24))
    }
  })

  it('retains remote tiles when bounds grow, and leaves other owners cached', () => {
    const doc = createDocument('stable tiles', 256, 256, 'rgba', false)
    doc.layers.push(createLayer('untouched', 256, 256, 'rgba'))
    for (const layer of doc.layers) {
      for (const [x, y] of [[20, 20], [180, 180]]) writeLayerColor(doc, layer, y * 256 + x, { r: 255, g: 80, b: 0, a: 255 })
      layer.layerStyles = createDefaultLayerStyles(); layer.layerStyles.colorOverlay.enabled = true
    }
    const cache = new DocumentCompositeCache()
    const spy = vi.spyOn(cache as unknown as { renderStyledLayerBlock: (...args: any[]) => Uint8ClampedArray }, 'renderStyledLayerBlock')
    compositeRegion(doc, 0, 0, 64, 64, cache, 1)
    const dirty = { x: 210, y: 180, width: 1, height: 1 }
    writeLayerColor(doc, doc.layers[0], 180 * 256 + 210, { r: 255, g: 80, b: 0, a: 255 }); markLayerContentChanged(doc.layers[0])
    cache.invalidateStyleSources(doc, dirty, [doc.layers[0].id]); spy.mockClear()
    compositeRegion(doc, 0, 0, 64, 64, cache, 1, dirty, dirty)
    expect(spy).not.toHaveBeenCalled()
    expect(compositeRegion(doc, 0, 0, 256, 256, cache, 1)).toEqual(compositeRegion(doc, 0, 0, 256, 256))
  })

  it('refreshes post-mask tiles when the brush reports the mask ID at the same document revision', () => {
    const { doc, layer } = fixture()
    const animation = ensureAnimationDocument(doc), mask = createLayerMask(layer.id, 24, 24)
    animation.cels.find(cel => cel.layerId === layer.id)!.mask = mask
    const cache = new DocumentCompositeCache()
    compositeRegion(doc, 0, 0, 24, 24, cache, 1)
    for (const value of [0, 128, 255]) {
      writeLayerColor(doc, mask, 10 * 24 + 10, { r: value, g: value, b: value, a: 255 })
      const dirty = { x: 10, y: 10, width: 1, height: 1 }
      cache.invalidateStyleSources(doc, dirty, [mask.id])
      expect(compositeRegion(doc, 0, 0, 24, 24, cache, 1, dirty, dirty)).toEqual(compositeRegion(doc, 0, 0, 24, 24))
    }
  })

  it('retains exact group gradient geometry when erasing the content boundary', () => {
    const { doc, layer } = fixture()
    delete layer.layerStyles
    const styles = createDefaultLayerStyles(); styles.gradientOverlay.enabled = true
    doc.groups.push({ id: 'g', name: 'gradient', visible: true, locked: false, opacity: 1, blendMode: 'normal', parentGroupId: null, layerStyles: styles })
    layer.groupId = 'g'
    const cache = new DocumentCompositeCache()
    compositeRegion(doc, 0, 0, 24, 24, cache, 1)
    for (let y = 0; y < 24; y++) writeLayerColor(doc, layer, y * 24 + 20, { r: 0, g: 0, b: 0, a: 0 })
    markLayerContentChanged(layer)
    const dirty = { x: 20, y: 0, width: 1, height: 24 }
    cache.invalidateStyleSources(doc, dirty, [layer.id])
    expect(compositeRegion(doc, 0, 0, 24, 24, cache, 1, dirty, dirty)).toEqual(compositeRegion(doc, 0, 0, 24, 24))
  })
})
