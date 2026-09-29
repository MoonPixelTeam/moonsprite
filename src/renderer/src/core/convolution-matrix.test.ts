import { describe, expect, it } from 'vitest'
import { createDocument, expandLayerToRect, readLayerColorAt, writeLayerColor } from './document-model'
import { CONVOLUTION_PRESETS, convolveLayer, type ConvolutionOptions } from './convolution-matrix'

const options = (presetId: string, tiled = false): ConvolutionOptions => ({ presetId, tiled, channels: { ...CONVOLUTION_PRESETS.find(item => item.id === presetId)!.channels } })
const setup = (width = 3, height = 1) => {
  const document = createDocument('convolution', width, height, 'rgba')
  const layer = document.layers[0]
  expandLayerToRect(layer, 0, 0, width, height)
  return { document, layer }
}

describe('convolution sampling', () => {
  it('clamps canvas edges and wraps them only when tiled', async () => {
    const { document, layer } = setup()
    ;[30, 60, 120].forEach((r, i) => writeLayerColor(document, layer, i, { r, g: 10, b: 20, a: 255 }))
    const clamped = await convolveLayer(document, layer, options('blur-5x1'), null, () => false)
    const tiled = await convolveLayer(document, layer, options('blur-5x1', true), null, () => false)
    expect(readLayerColorAt(document, clamped!, 0, 0).r).toBe(54)
    expect(readLayerColorAt(document, tiled!, 0, 0).r).toBe(78)
    expect(readLayerColorAt(document, layer, 0, 0).r).toBe(30)
  })

  it('samples outside a nonrectangular selection without modifying excluded pixels or channels', async () => {
    const { document, layer } = setup()
    ;[30, 60, 120].forEach((r, i) => writeLayerColor(document, layer, i, { r, g: 41, b: 59, a: 255 }))
    const settings = options('negative')
    settings.channels = { r: true, g: false, b: false, a: false }
    const result = await convolveLayer(document, layer, settings, { x: 0, y: 0, width: 3, height: 1, mask: new Uint8Array([0, 1, 0]) }, () => false)
    expect(readLayerColorAt(document, result!, 0, 0).r).toBe(30)
    expect(readLayerColorAt(document, result!, 1, 0)).toEqual({ r: 195, g: 41, b: 59, a: 255 })
    expect(readLayerColorAt(document, result!, 2, 0).r).toBe(120)
    const blurred = await convolveLayer(document, layer, options('blur-5x1'), { x: 1, y: 0, width: 1, height: 1 }, () => false)
    expect(readLayerColorAt(document, blurred!, 1, 0).r).toBe(72)
    expect(readLayerColorAt(document, blurred!, 0, 0).r).toBe(30)
  })

  it('renormalizes RGB around transparency, spreads alpha, and bounds tiny content on a 4K canvas', async () => {
    const { document, layer } = setup(1, 1)
    document.width = 4096; document.height = 4096
    layer.offsetX = 2000; layer.offsetY = 2000
    writeLayerColor(document, layer, 0, { r: 240, g: 80, b: 20, a: 255 })
    const result = await convolveLayer(document, layer, options('blur-3x3'), null, () => false)
    expect([result!.width, result!.height, result!.offsetX, result!.offsetY]).toEqual([3, 3, 1999, 1999])
    expect(readLayerColorAt(document, result!, 2000, 2000)).toEqual({ r: 240, g: 80, b: 20, a: 63 })
    expect(readLayerColorAt(document, result!, 1999, 1999).a).toBe(15)
    expect(layer.width).toBe(1)
  })

  it('expands alpha-only outlines and discards cancelled results', async () => {
    const { document, layer } = setup(1, 1)
    document.width = 5; document.height = 5
    layer.offsetX = 2; layer.offsetY = 2
    writeLayerColor(document, layer, 0, { r: 240, g: 80, b: 20, a: 255 })
    const result = await convolveLayer(document, layer, options('outline-cross'), null, () => false)
    expect(readLayerColorAt(document, result!, 2, 1)).toEqual({ r: 0, g: 0, b: 0, a: 255 })
    expect(readLayerColorAt(document, result!, 1, 1).a).toBe(0)
    expect(await convolveLayer(document, layer, options('blur-17x17'), null, () => true)).toBeNull()
  })
})
