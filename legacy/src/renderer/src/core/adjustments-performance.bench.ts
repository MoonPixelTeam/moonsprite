import { bench, describe } from 'vitest'
import { applyColorAdjustmentDirect, buildCurveHistogram, type ColorAdjustment } from './adjustments'
import { createDocument, getActiveLayer } from './document'

const createBenchmarkLayer = (name: string, size: number, colorCount: number) => {
  const document = createDocument(name, size, size, 'rgba')
  const layer = getActiveLayer(document)
  if (layer.format !== 'rgba') throw new Error('RGBA benchmark layer required')
  for (let index = 0; index < size * size; index += 1) {
    const color = index % colorCount
    const packed = colorCount > 256
      ? Math.imul(color, 0x9e3779b1) >>> 0
      : color | (((color * 37) & 0xff) << 8) | (((color * 83) & 0xff) << 16)
    const offset = index * 4
    layer.pixels[offset] = packed & 0xff
    layer.pixels[offset + 1] = (packed >>> 8) & 0xff
    layer.pixels[offset + 2] = (packed >>> 16) & 0xff
    layer.pixels[offset + 3] = color % 17 === 0 ? 0 : 255
  }
  return { document, layer, source: new Uint8ClampedArray(layer.pixels) }
}

const pixelArt = createBenchmarkLayer('large adjustment benchmark', 4000, 256)
const adjustments: Array<[string, ColorAdjustment]> = [
  ['adjust 4000x4000 brightness', { kind: 'brightness-contrast', brightness: 20, contrast: 10 }],
  ['adjust 4000x4000 hue saturation', { kind: 'hue-saturation', hue: 20, saturation: 15, lightness: 5 }],
  ['adjust 4000x4000 color balance', { kind: 'color-balance', midtonesCyanRed: 20, midtonesMagentaGreen: -10, preserveLuminosity: true }],
  ['adjust 4000x4000 curves', { kind: 'curves', curvePoints: [{ x: 0, y: 0 }, { x: 128, y: 160 }, { x: 255, y: 255 }] }]
]

describe('large whole-layer adjustments', () => {
  for (const [name, adjustment] of adjustments) bench(name, () => {
    applyColorAdjustmentDirect(pixelArt.document, pixelArt.layer, adjustment, null, pixelArt.source)
  }, { iterations: 10, warmupIterations: 2, time: 0, warmupTime: 0 })

  bench('build 4000x4000 curve histogram', () => {
    buildCurveHistogram(pixelArt.source, 'rgba', [])
  }, { iterations: 10, warmupIterations: 2, time: 0, warmupTime: 0 })
})

const highEntropy = createBenchmarkLayer('high entropy adjustment benchmark', 1024, 1024 * 1024)

describe('high-entropy whole-layer adjustments', () => {
  bench('adjust 1024x1024 high entropy hue saturation', () => {
    applyColorAdjustmentDirect(highEntropy.document, highEntropy.layer, { kind: 'hue-saturation', hue: 20, saturation: 15, lightness: 5 }, null, highEntropy.source)
  }, { iterations: 10, warmupIterations: 2, time: 0, warmupTime: 0 })

  bench('adjust 1024x1024 high entropy color balance', () => {
    applyColorAdjustmentDirect(highEntropy.document, highEntropy.layer, { kind: 'color-balance', midtonesCyanRed: 20, midtonesMagentaGreen: -10, preserveLuminosity: true }, null, highEntropy.source)
  }, { iterations: 10, warmupIterations: 2, time: 0, warmupTime: 0 })
})
