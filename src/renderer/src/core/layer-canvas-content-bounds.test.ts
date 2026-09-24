import { expect, it } from 'vitest'
import { createDocument, createLayer, writeLayerColor } from './document-model'
import { layerCanvasContentBounds } from './layer-canvas-content-bounds'

it.each(['rgba', 'indexed'] as const)('ignores off-canvas pixels when bounding %s content', mode => {
  const document = createDocument('bounds', 8, 8, mode)
  const layer = createLayer('wide', 20, 8, mode)
  layer.offsetX = -6
  const color = { r: 255, g: 0, b: 0, a: 255 }
  writeLayerColor(document, layer, 0, color)
  writeLayerColor(document, layer, 19, color)
  expect(layerCanvasContentBounds(document, layer)).toBeNull()
  writeLayerColor(document, layer, 3 * 20 + 10, color)
  expect(layerCanvasContentBounds(document, layer)).toEqual({ x: 4, y: 3, width: 1, height: 1 })
})
