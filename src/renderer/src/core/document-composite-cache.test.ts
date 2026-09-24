import { expect, it } from 'vitest'
import { createCompositePointSampler, createDocument, createLayer, getActiveLayer, writeLayerColor, compositeRegion } from '@/core/document'
import { DocumentCompositeCache } from './document-composite-cache'
import { simpleClippingLayers } from './document-composite-clipping'

it('rebuilds the normal layer plan when a live stroke fills an empty blended layer', () => {
  const document = createDocument('live blend plan', 4, 4, 'rgba', false)
  const layer = getActiveLayer(document)
  layer.blendMode = 'multiply'
  const cache = new DocumentCompositeCache()

  // Empty non-normal layers are omitted from the fast normal plan.
  expect(cache.normalLayersFor(document, 0)).toEqual([])

  // A live stroke changes pixels before the document revision is committed.
  writeLayerColor(document, layer, 0, { r: 255, g: 0, b: 0, a: 255 })
  cache.invalidateLiveSourceCaches()

  expect(cache.normalLayersFor(document, 0)).toBeNull()
})

it.each([1, 0.6])('renders the first blended stroke after moving an empty layer out of a group (opacity %s)', opacity => {
  const document = createDocument('first grouped stroke', 4, 4, 'rgba', false)
  document.groups.push({ id: 'A', name: 'A', visible: true, locked: false, opacity, blendMode: 'normal', parentGroupId: null })
  const bottom = getActiveLayer(document)
  bottom.groupId = 'A'
  writeLayerColor(document, bottom, 0, { r: 120, g: 180, b: 240, a: 255 })
  const layer = createLayer('new', 4, 4, 'rgba')
  layer.groupId = 'A'
  document.layers.push(layer)
  const cache = new DocumentCompositeCache()
  compositeRegion(document, 0, 0, 4, 4, cache, 0)
  layer.groupId = null
  layer.blendMode = 'multiply'
  compositeRegion(document, 0, 0, 4, 4, cache, 1)
  cache.opacityGroupStackFor(document, 1)
  cache.movePreviewLayersFor(document, 1)
  writeLayerColor(document, layer, 0, { r: 200, g: 80, b: 40, a: 255 })
  cache.invalidateLiveSourceCaches()
  const expected = compositeRegion(document, 0, 0, 4, 4)
  expect(compositeRegion(document, 0, 0, 4, 4, cache, 1)).toEqual(expected)
  if (opacity === 1) expect(cache.movePreviewLayersFor(document, 1)?.some(item => item.id === layer.id)).toBe(true)
  expect(compositeRegion(document, 0, 0, 4, 4, cache, 2)).toEqual(expected)
})

it('uses the raster compositor for ordinary clipping chains', () => {
  const document = createDocument('clipping raster path', 8, 2, 'rgba', false)
  const base = document.layers[0]
  const clipped = createLayer('clipped', 8, 2, 'rgba')
  const upper = createLayer('upper', 8, 2, 'rgba')
  clipped.clippingMask = true
  clipped.opacity = 0.6
  document.layers.push(clipped)
  document.layers.push(upper)
  writeLayerColor(document, base, 1, { r: 40, g: 80, b: 180, a: 128 })
  writeLayerColor(document, base, 2, { r: 40, g: 80, b: 180, a: 255 })
  writeLayerColor(document, clipped, 1, { r: 240, g: 40, b: 20, a: 255 })
  writeLayerColor(document, clipped, 2, { r: 240, g: 40, b: 20, a: 128 })
  writeLayerColor(document, upper, 2, { r: 20, g: 220, b: 60, a: 180 })

  const layers = simpleClippingLayers(document)
  expect(layers?.map(layer => layer.id)).toEqual([base.id, clipped.id, upper.id])
  const expected = new Uint8ClampedArray(document.width * document.height * 4)
  const sample = createCompositePointSampler(document)
  for (let y = 0; y < document.height; y += 1) for (let x = 0; x < document.width; x += 1) {
    const color = sample(x, y)
    const offset = (y * document.width + x) * 4
    expected[offset] = color.r
    expected[offset + 1] = color.g
    expected[offset + 2] = color.b
    expected[offset + 3] = color.a
  }

  expect(compositeRegion(document, 0, 0, document.width, document.height, new DocumentCompositeCache(), 1)).toEqual(expected)
})
