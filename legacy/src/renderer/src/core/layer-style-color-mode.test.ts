import { describe, expect, it } from 'vitest'
import { compositeRegion, createDocument, createLayer, DocumentCompositeCache } from './document'
import { createDefaultLayerStyles } from './layer-styles'
import { compileCompositePointSampler } from './document-composite-sampling'
import { readRgbaPixel } from './raster'

const red = { r: 255, g: 0, b: 0, a: 255 }
const blue = { r: 0, g: 0, b: 255, a: 255 }
const fixture = () => {
  const doc = createDocument('indexed styles', 8, 8, 'indexed', false)
  doc.palette = [{ id: 0, name: 'transparent', color: { r: 0, g: 0, b: 0, a: 0 } }, { id: 1, name: 'red', color: red }, { id: 2, name: 'blue', color: blue }]
  doc.paletteOrder = [0, 1, 2]
  const layer = doc.layers[0]
  layer.pixels[3 * 8 + 3] = 1
  layer.layerStyles = createDefaultLayerStyles()
  return { doc, layer, styles: layer.layerStyles }
}

describe('layer style document color modes', () => {
  it.each(['colorOverlay', 'gradientOverlay', 'gradientMap', 'innerGlow', 'shadow', 'stroke'] as const)('keeps %s output inside the visible indexed palette on all rendering paths', effect => {
    const { doc, layer, styles } = fixture()
    styles[effect]!.enabled = true
    styles.colorOverlay.color = { ...blue, a: 128 }
    styles.gradientOverlay.from = styles.gradientOverlay.to = { r: 120, g: 0, b: 135, a: 255 }
    styles.gradientMap!.stops = [{ position: 0, color: { r: 90, g: 40, b: 180, a: 255 } }, { position: 1, color: { r: 90, g: 40, b: 180, a: 255 } }]
    styles.innerGlow.color = { ...blue, a: 128 }
    styles.shadow.blur = 2
    styles.shadow.color = { ...blue, a: 128 }
    styles.stroke.smartHue = true
    const before = layer.pixels.slice()
    const palette = JSON.stringify(doc.palette)
    const point = compileCompositePointSampler(doc)
    for (const cached of [false, true]) {
      const pixels = compositeRegion(doc, 0, 0, 8, 8, cached ? new DocumentCompositeCache() : undefined)
      for (let i = 0; i < 64; i++) {
        const color = readRgbaPixel(pixels, i)
        expect(doc.palette.some(entry => JSON.stringify(entry.color) === JSON.stringify(color))).toBe(true)
        expect(color).toEqual(point(i % 8, Math.floor(i / 8), undefined))
      }
    }
    expect(layer.pixels).toEqual(before)
    expect(JSON.stringify(doc.palette)).toBe(palette)
  })

  it('invalidates cached styles after hiding a palette color without changing its entries', () => {
    const { doc, styles } = fixture()
    styles.colorOverlay.enabled = true
    styles.colorOverlay.color = blue
    const cache = new DocumentCompositeCache()
    expect(readRgbaPixel(compositeRegion(doc, 0, 0, 8, 8, cache), 27)).toEqual(blue)
    doc.paletteOrder = [0, 1]
    expect(readRgbaPixel(compositeRegion(doc, 0, 0, 8, 8, cache, 1), 27)).toEqual(red)
  })

  it('resolves group gradients to indexed colors', () => {
    const { doc, layer, styles } = fixture()
    layer.layerStyles = undefined
    layer.groupId = 'group'
    styles.gradientMap!.enabled = true
    styles.gradientMap!.stops = [{ position: 0, color: { r: 90, g: 40, b: 180, a: 255 } }, { position: 1, color: { r: 90, g: 40, b: 180, a: 255 } }]
    doc.groups = [{ id: 'group', name: 'group', visible: true, locked: false, opacity: 1, blendMode: 'normal', layerStyles: styles }]
    for (const cache of [undefined, new DocumentCompositeCache()]) expect(readRgbaPixel(compositeRegion(doc, 0, 0, 8, 8, cache), 27)).toEqual(blue)
  })

  it('keeps generated gradients grayscale in a grayscale document', () => {
    const doc = createDocument('gray', 2, 1, 'grayscale', false)
    doc.layers = [createLayer('gray', 2, 1, 'grayscale')]
    doc.layers[0].pixels.set([100, 100, 100, 255])
    const styles = doc.layers[0].layerStyles = createDefaultLayerStyles()
    styles.gradientMap!.enabled = true
    styles.gradientMap!.stops = [{ position: 0, color: blue }, { position: 1, color: red }]
    const color = readRgbaPixel(compositeRegion(doc, 0, 0, 2, 1, new DocumentCompositeCache()), 0)
    expect(color.r).toBe(color.g)
    expect(color.g).toBe(color.b)
  })
})
