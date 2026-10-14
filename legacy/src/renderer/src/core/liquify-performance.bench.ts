import { bench, describe } from 'vitest'
import { createDocument, writeLayerColor } from './document'
import { beginPixelEdit } from './history'
import { applyLiquifyPushPath, createLiquifyPushStroke } from './liquify'

const document = createDocument('liquify benchmark', 4096, 4096, 'rgba')
const layer = document.layers[0]
for (let y = 1856; y < 2240; y += 1) for (let x = 1856; x < 2240; x += 1) {
  writeLayerColor(document, layer, y * layer.width + x, {
    r: (x * 13) & 255,
    g: (y * 17) & 255,
    b: ((x + y) * 7) & 255,
    a: 255
  })
}

describe('liquify local working set', () => {
  bench('push radius 128 on a 4096px canvas', () => {
    applyLiquifyPushPath(document, layer, beginPixelEdit(layer.id), createLiquifyPushStroke(), { x: 2036, y: 2048 }, [{ x: 2060, y: 2048 }], {
      radius: 128, strength: 70
    })
  }, { iterations: 10, warmupIterations: 2 })
})
