import { bench, describe } from 'vitest'
import { createDocument, invalidateRasterContentBounds, layerContentBounds, readLayerColorAt } from '@/core/document'

const document = createDocument('post-erase bounds benchmark', 1, 1, 'rgba')
const layer = document.layers[0]
layer.width = 4200; layer.height = 2400
layer.pixels = new Uint8ClampedArray(layer.width * layer.height * 4).fill(255)
for (let y = 0; y < layer.height; y += 1) layer.pixels[y * layer.width * 4 + 3] = 0

// CPU work only: the old background task's queue delays are excluded.
describe('4200x2400 layer bounds after erasing the left edge', () => {
  bench('previous background pixel scan', () => {
    let minX = layer.width, minY = layer.height, maxX = -1, maxY = -1
    for (let y = 0; y < layer.height; y += 1) for (let x = 0; x < layer.width; x += 1) {
      if (!readLayerColorAt(document, layer, x, y).a) continue
      minX = Math.min(minX, x); minY = Math.min(minY, y)
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
    }
    if (minX !== 1 || minY !== 0 || maxX !== 4199 || maxY !== 2399) throw new Error('Unexpected baseline bounds')
  }, { iterations: 3, warmupIterations: 1, time: 200, warmupTime: 50 })
  bench('native row edge refresh', () => {
    invalidateRasterContentBounds(layer)
    layerContentBounds(document, layer)
  }, { iterations: 3, warmupIterations: 1, time: 200, warmupTime: 50 })
})
