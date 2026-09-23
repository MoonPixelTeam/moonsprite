import { expect, it } from 'vitest'
import { createDocument, createLayer, getActiveLayer, writeLayerColor, compositeRegion } from '@/core/document'
import { DocumentCompositeCache } from './document-composite-cache'

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
