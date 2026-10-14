import { bench, describe } from 'vitest'
import { createDocument, getActiveLayer } from './document'
import { magicWandSelection, selectionBoundarySegments } from './selection'

const document = createDocument('selection benchmark', 512, 512, 'rgba')
const layer = getActiveLayer(document)
if (layer.format !== 'rgba') throw new Error('RGBA required')
let seed = 123456789
for (let index = 0; index < document.width * document.height; index += 1) {
  seed = (seed * 1664525 + 1013904223) >>> 0
  const value = seed % 100 < 14 ? 36 : 0
  const offset = index * 4
  layer.pixels[offset] = value
  layer.pixels[offset + 1] = value
  layer.pixels[offset + 2] = value
  layer.pixels[offset + 3] = 255
}
const selection = magicWandSelection(document, layer, 0, 0, 0, true)!

describe('magic-wand hot paths', () => {
  bench('select contiguous noise background', () => {
    magicWandSelection(document, layer, 0, 0, 0, true)
  })

  bench('build noisy selection boundary', () => {
    selectionBoundarySegments(selection)
  })
})
