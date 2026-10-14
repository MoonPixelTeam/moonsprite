import { bench, describe } from 'vitest'
import { compositeRegion, createDocument, createLayer } from './document'
import { createGradientCompositePreview, fillGradientPreviewBlock } from './gradient-preview'

describe('4K gradient backdrop preparation', () => {
  const document = createDocument('gradient backdrop profile', 4000, 4000, 'rgba')
  new Uint32Array(document.layers[0].pixels.buffer).fill(0xff884422)
  document.layers.push(createLayer('gradient', 1, 1, 'rgba'), createLayer('overlay', 256, 256, 'rgba'))
  new Uint32Array(document.layers[2].pixels.buffer).fill(0x80884422)
  const bounds = { x: 0, y: 0, width: 800, height: 600 }
  const options = { iterations: 3, warmupIterations: 1, time: 0, warmupTime: 0 }
  bench('previous whole-canvas backdrop pair', () => {
    compositeRegion({ ...document, layers: document.layers.slice(0, 1) }, 0, 0, 4000, 4000)
    compositeRegion({ ...document, layers: document.layers.slice(2) }, 0, 0, 4000, 4000)
  }, options)
  bench('visible translucent backdrop pair', () => { createGradientCompositePreview(document, 1, bounds, false) }, options)
  bench('visible opaque backdrop pair', () => { createGradientCompositePreview(document, 1, bounds, true) }, options)
})

describe('800% gradient screen-pixel writes', () => {
  const width = 1600, height = 960
  const pixels = new Uint8ClampedArray(width * height * 4)
  const words = new Uint32Array(pixels.buffer)
  const color = { r: 50, g: 100, b: 200, a: 255 }
  const options = { iterations: 10, warmupIterations: 2, time: 0, warmupTime: 0 }
  bench('previous individual byte writes', () => {
    for (let top = 0; top < height; top += 8) for (let left = 0; left < width; left += 8) {
      for (let y = top; y < top + 8; y++) for (let x = left; x < left + 8; x++) {
        const offset = (y * width + x) * 4
        pixels[offset] = color.r; pixels[offset + 1] = color.g; pixels[offset + 2] = color.b; pixels[offset + 3] = color.a
      }
    }
  }, options)
  bench('packed pixel writes', () => {
    for (let top = 0; top < height; top += 8) for (let left = 0; left < width; left += 8) fillGradientPreviewBlock(words, width, left, top, left + 8, top + 8, color)
  }, options)
})
