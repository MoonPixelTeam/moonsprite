import { expect, it } from 'vitest'
import { BLEND_MODES } from '@shared/types-color'
import { createDocument, createLayer, writeLayerColor, compositeRegion } from './document'
import { LayerPropertyProjectedPreview } from './layer-property-projected-preview'
import { createDefaultLayerStyles } from './layer-styles'

it.each(['rgba', 'indexed'] as const)('matches full-composite samples through all blend modes and opacity zero: %s', format => {
  const document = createDocument('projected properties', 13, 9, format, false)
  document.layers.push(createLayer('top', 11, 7, format))
  const top = document.layers[1]
  top.offsetX = 2; top.offsetY = -1
  document.layers.forEach((layer, i) => {
    for (let p = 0; p < layer.width * layer.height; p++) writeLayerColor(document, layer, p,
      { r: (p * 43 + i * 5) % 256, g: (p * 11 + i * 101) % 256, b: 80, a: [0, 80, 150, 255][p % 4] })
  })
  const cache = new LayerPropertyProjectedPreview(), rect = { x: 1, y: 1, width: 11, height: 7 }
  let revision = 0
  for (const blendMode of BLEND_MODES) for (const opacity of [1, 0.4, 0, 0.7]) {
    top.blendMode = blendMode; top.opacity = opacity
    const output = cache.render(document, rect, 4, 3, ++revision,
      { compositeOnly: true, propertyOwnerIds: [top.id], fromRevision: 0, revision })
    expect(output).not.toBeNull()
    const full = compositeRegion(document, 0, 0, 13, 9)
    for (let y = 0; y < 3; y++) for (let x = 0; x < 4; x++) {
      const sx = Math.floor(1 + (x + 0.5) * 11 / 4), sy = Math.floor(1 + (y + 0.5) * 7 / 3)
      expect(output!.slice((y * 4 + x) * 4, (y * 4 + x + 1) * 4)).toEqual(full.slice((sy * 13 + sx) * 4, (sy * 13 + sx + 1) * 4))
    }
  }
})

it('rebuilds after source edits and rejects dependent stacks or an insufficient budget', () => {
  const document = createDocument('projection invalidation', 8, 8, 'rgba', false)
  const top = createLayer('top', 8, 8, 'rgba'); document.layers.push(top)
  writeLayerColor(document, document.layers[0], 9, { r: 200, g: 0, b: 0, a: 255 })
  const rect = { x: 0, y: 0, width: 8, height: 8 }, cache = new LayerPropertyProjectedPreview()
  const hint = (fromRevision: number, revision: number) => ({ compositeOnly: true as const, propertyOwnerIds: [top.id], fromRevision, revision })
  expect(cache.render(document, rect, 4, 4, 1, hint(0, 1))?.slice(0, 4)).toEqual(new Uint8ClampedArray([200, 0, 0, 255]))
  writeLayerColor(document, document.layers[0], 9, { r: 0, g: 200, b: 0, a: 255 })
  expect(cache.render(document, rect, 4, 4, 3, hint(2, 3))?.slice(0, 4)).toEqual(new Uint8ClampedArray([0, 200, 0, 255]))
  expect(new LayerPropertyProjectedPreview(1).render(document, rect, 4, 4, 3, hint(2, 3))).toBeNull()
  cache.clear()
  top.layerStyles = createDefaultLayerStyles(); top.layerStyles.stroke.enabled = true
  expect(cache.render(document, rect, 4, 4, 3, hint(2, 3))).toBeNull()
  delete top.layerStyles
  expect(cache.render(document, rect, 4, 4, 3, { ...hint(2, 3), propertyOwnerIds: [document.layers[0].id] })).toBeNull()
})
