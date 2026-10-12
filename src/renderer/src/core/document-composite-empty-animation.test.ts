import { expect, it } from 'vitest'
import { createDocument, writeLayerColor, compositeRegion } from './document'
import { normalCompositeLayers, opacityGroupCompositeStack } from './document-composite-plan'

it('omits blank displayed rasters but includes a live stroke before its cel is synchronized', () => {
  const document = createDocument('live empty cel', 8, 8, 'rgba'), layer = document.layers[0]
  expect(normalCompositeLayers(document)).toEqual([])
  expect(opacityGroupCompositeStack(document)).toEqual([])
  // A preview/expanded edit can have different storage from the canonical cel.
  layer.pixels = new Uint8ClampedArray(8 * 8 * 4)
  writeLayerColor(document, layer, 10, { r: 200, g: 40, b: 90, a: 255 })
  expect(document.animation!.cels[0].surface!.pixels[43]).toBe(0)
  expect(normalCompositeLayers(document)).toEqual([layer])
  expect(opacityGroupCompositeStack(document)).toHaveLength(1)
  expect(compositeRegion(document, 0, 0, 8, 8).slice(40, 44)).toEqual(new Uint8ClampedArray([200, 40, 90, 255]))
})

it('does not discard adjustment layers, and keeps styled stack correctness', () => {
  const document = createDocument('adjustment fallback', 1, 1, 'rgba')
  document.layers[0].kind = 'adjustment'
  expect(normalCompositeLayers(document)).toBeNull()
  expect(opacityGroupCompositeStack(document)).toBeNull()
})
