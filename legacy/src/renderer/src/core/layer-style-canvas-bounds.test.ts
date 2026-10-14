import { expect, it } from 'vitest'
import { compositeRegion, createDocument, createLayer, DocumentCompositeCache, writeLayerColor } from './document'
import { createDefaultLayerStyles } from './layer-styles'

it.each(['stroke', 'shadow', 'innerGlow', 'colorOverlay'] as const)('limits %s to canvas pixels without changing overflow storage', effect => {
  const document = createDocument('style canvas boundary', 8, 6, 'rgba')
  const layer = createLayer('overflow', 12, 6, 'rgba')
  layer.offsetX = -2
  document.layers = [layer]
  layer.layerStyles = createDefaultLayerStyles()
  layer.layerStyles[effect].enabled = true
  layer.layerStyles.stroke.size = 2
  layer.layerStyles.shadow.offsetX = 2
  layer.layerStyles.shadow.offsetY = 0
  layer.layerStyles.shadow.blur = 2
  const red = { r: 200, g: 20, b: 10, a: 255 }
  for (const x of [0, 1, 5, 10, 11]) writeLayerColor(document, layer, 2 * 12 + x, red)
  const original = layer.pixels.slice()
  const clipped = createDocument('reference', 8, 6, 'rgba')
  clipped.layers[0].layerStyles = layer.layerStyles
  writeLayerColor(clipped, clipped.layers[0], 2 * 8 + 3, red)
  const expected = compositeRegion(clipped, 0, 0, 8, 6)
  const cache = new DocumentCompositeCache()
  expect(compositeRegion(document, 0, 0, 8, 6)).toEqual(expected)
  expect(compositeRegion(document, 0, 0, 8, 6, cache, 1)).toEqual(expected)
  for (const renderer of [undefined, cache]) {
    // Outside the canvas, keep raw editable content but never its effects.
    expect(Array.from(compositeRegion(document, -1, 2, 1, 1, renderer, 1))).toEqual([200, 20, 10, 255])
    expect(Array.from(compositeRegion(document, -1, 1, 1, 1, renderer, 1))).toEqual([0, 0, 0, 0])
  }
  expect(layer.pixels).toEqual(original)
  // Moving previously clipped content into the canvas must refresh style tiles.
  layer.offsetX = 0
  cache.invalidateLayerPlacementCaches()
  expect(compositeRegion(document, 0, 0, 8, 6, cache, 1)).toEqual(compositeRegion(document, 0, 0, 8, 6))
  document.width = 10
  expect(compositeRegion(document, 0, 0, 10, 6, cache, 2)).toEqual(compositeRegion(document, 0, 0, 10, 6))
})

it('ignores off-canvas sources for group styles and refreshes them when the canvas expands', () => {
  const document = createDocument('styled group boundary', 4, 4, 'rgba')
  const layer = document.layers[0]
  layer.offsetX = -1
  layer.groupId = 'group'
  writeLayerColor(document, layer, 2 * 4, { r: 200, g: 0, b: 0, a: 255 })
  const styles = createDefaultLayerStyles()
  styles.shadow.enabled = true
  styles.shadow.offsetX = 2
  styles.shadow.offsetY = 0
  document.groups.push({ id: 'group', name: 'Group', visible: true, locked: false, opacity: 1, blendMode: 'normal', layerStyles: styles })
  const cache = new DocumentCompositeCache()
  expect(compositeRegion(document, 0, 0, 4, 4, cache, 1).every(value => value === 0)).toBe(true)
  layer.offsetX = 4
  cache.invalidateAll()
  compositeRegion(document, 0, 0, 4, 4, cache, 2)
  document.width = 8
  expect(compositeRegion(document, 0, 0, 8, 4, cache, 3)).toEqual(compositeRegion(document, 0, 0, 8, 4))
})
