import { expect, it } from 'vitest'
import { createDocument, createLayer, writeLayerColor } from './document-model'
import { compositeRegion } from './document-composite-region'
import { createCompositePointSampler } from './document-composite-sampling'
import { DocumentCompositeCache } from './document-composite-cache'
import { createDefaultLayerStyles } from './layer-styles'

it.each([false, true])('hides an ordinary layer above a clipping chain (cached: %s)', cached => {
  const document = createDocument('clipping visibility', 3, 1, 'rgba', false)
  const base = document.layers[0]
  const clipped = createLayer('clipped', 3, 1, 'rgba')
  const upper = createLayer('ordinary upper', 3, 1, 'rgba')
  clipped.clippingMask = true
  document.layers.push(clipped, upper)
  writeLayerColor(document, base, 0, { r: 255, g: 0, b: 0, a: 255 })
  for (let x = 0; x < 2; x++) writeLayerColor(document, clipped, x, { r: 0, g: 255, b: 0, a: 255 })
  for (let x = 1; x < 3; x++) writeLayerColor(document, upper, x, { r: 0, g: 0, b: 255, a: 255 })
  const cache = cached ? new DocumentCompositeCache() : undefined
  const shown = new Uint8ClampedArray([0, 255, 0, 255, 0, 0, 255, 255, 0, 0, 255, 255])
  const hidden = new Uint8ClampedArray([0, 255, 0, 255, 0, 0, 0, 0, 0, 0, 0, 0])
  let revision = 0
  expect(compositeRegion(document, 0, 0, 3, 1, cache, revision++)).toEqual(shown)
  // No effects and an explicitly disabled effects object must behave alike.
  for (const styles of [undefined, createDefaultLayerStyles()]) {
    upper.layerStyles = styles
    for (const visible of [false, true, false]) {
      upper.visible = visible
      expect(compositeRegion(document, 0, 0, 3, 1, cache, revision++)).toEqual(visible ? shown : hidden)
    }
  }
})

it.each(['background', 'base', 'clipped', 'upper'] as const)('matches the point sampler when toggling the %s around a clipping chain', target => {
  const document = createDocument('clipping stack visibility', 2, 1, 'rgba', false)
  const background = document.layers[0]
  const base = createLayer('base', 2, 1, 'rgba')
  const clipped = createLayer('clipped', 2, 1, 'rgba')
  const upper = createLayer('upper', 2, 1, 'rgba')
  document.layers.push(base, clipped, upper)
  clipped.clippingMask = true
  writeLayerColor(document, background, 0, { r: 20, g: 30, b: 40, a: 255 })
  writeLayerColor(document, background, 1, { r: 20, g: 30, b: 40, a: 255 })
  writeLayerColor(document, base, 0, { r: 200, g: 0, b: 0, a: 128 })
  writeLayerColor(document, clipped, 0, { r: 0, g: 200, b: 0, a: 255 })
  writeLayerColor(document, clipped, 1, { r: 0, g: 200, b: 0, a: 255 })
  writeLayerColor(document, upper, 1, { r: 0, g: 0, b: 200, a: 255 })
  const layer = { background, base, clipped, upper }[target]
  const cache = new DocumentCompositeCache()
  let revision = 0
  for (const visible of [true, false, true, false]) {
    layer.visible = visible
    const sample = createCompositePointSampler(document)
    const expected = new Uint8ClampedArray([0, 1].flatMap(x => {
      const color = sample(x, 0); return [color.r, color.g, color.b, color.a]
    }))
    expect(compositeRegion(document, 0, 0, 2, 1, cache, revision++)).toEqual(expected)
    expect(compositeRegion(document, 0, 0, 2, 1)).toEqual(expected)
  }
})
