import { describe, expect, it } from 'vitest'
import { compositeRegion, createDocument, createLayer, readLayerColorAt, writeLayerColor } from './document'
import { applyGradient, createGradientColorSampler } from './gradient'
import { blendOver } from './raster'
import { compositeGradientPreviewAt, createGradientCompositePreview, fillGradientPreviewBlock, gradientReplacementColor } from './gradient-preview'

describe('gradient preview', () => {
  it.each([0, 1, 2])('preserves the full-canvas backdrop calculation when cropping layer %s', (activeIndex) => {
    const document = createDocument('gradient preview layers', 8, 8, 'rgba')
    document.layers.push(createLayer('middle', 8, 8, 'rgba'), createLayer('top', 8, 8, 'rgba'))
    document.layers.forEach((layer, index) => {
      for (let pixel = 0; pixel < 64; pixel++) writeLayerColor(document, layer, pixel, { r: 30 + 70 * index, g: 40, b: 100, a: index === 0 ? 255 : 128 })
    })
    const active = document.layers[activeIndex]
    const start = { x: 2, y: 1 }, end = { x: 4, y: 1 }
    const from = { r: 255, g: 0, b: 0, a: 0 }, to = { r: 0, g: 120, b: 255, a: 128 }
    const bounds = { x: 2, y: 1, width: 3, height: 4 }
    const preview = createGradientCompositePreview(document, activeIndex, bounds, false)
    const sample = createGradientColorSampler(from, to, start, end, 'none')
    const pixels: number[] = []
    const expected: number[] = []
    const lower = compositeRegion({ ...document, layers: document.layers.slice(0, activeIndex) }, 0, 0, 8, 8)
    const upper = compositeRegion({ ...document, layers: document.layers.slice(activeIndex + 1) }, 0, 0, 8, 8)
    for (let y = 1; y < 5; y++) for (let x = 2; x < 5; x++) {
      const replacement = gradientReplacementColor(readLayerColorAt(document, active, x, y), sample(x, y))
      const color = compositeGradientPreviewAt(preview, x, y, replacement)
      pixels.push(color.r, color.g, color.b, color.a)
      const offset = (y * 8 + x) * 4
      const read = (data: Uint8ClampedArray) => ({ r: data[offset], g: data[offset + 1], b: data[offset + 2], a: data[offset + 3] })
      // Compare the same upper-stack flattening order as the existing preview;
      // separately test commit parity below without changing rounding semantics.
      const reference = blendOver(blendOver(read(lower), replacement), read(upper))
      expected.push(reference.r, reference.g, reference.b, reference.a)
    }
    expect(pixels).toEqual(expected)
    expect(preview.lower?.length ?? 0).toBe(activeIndex === 0 ? 0 : 3 * 4 * 4)
    expect(preview.upper?.length ?? 0).toBe(activeIndex === 2 ? 0 : 3 * 4 * 4)
  })

  it.each([0, 1])('matches the committed translucent gradient and transparent endpoint on a two-layer stack (%s)', (activeIndex) => {
    const document = createDocument('gradient commit parity', 4, 1, 'rgba')
    document.layers.push(createLayer('upper', 4, 1, 'rgba'))
    document.layers.forEach((layer, i) => {
      for (let x = 0; x < 4; x++) writeLayerColor(document, layer, x, { r: 80, g: 120, b: 160, a: i === 0 ? 255 : 128 })
    })
    const active = document.layers[activeIndex]
    const from = { r: 255, g: 0, b: 0, a: 0 }, to = { r: 0, g: 0, b: 255, a: 128 }
    const start = { x: 0, y: 0 }, end = { x: 3, y: 0 }
    const sample = createGradientColorSampler(from, to, start, end, 'none')
    const preview = createGradientCompositePreview(document, activeIndex, { x: 0, y: 0, width: 4, height: 1 }, false)
    const colors = Array.from({ length: 4 }, (_, x) => compositeGradientPreviewAt(preview, x, 0, gradientReplacementColor(readLayerColorAt(document, active, x, 0), sample(x, 0))))
    applyGradient(document, active, start, end, from, to)
    expect(colors.flatMap((color) => [color.r, color.g, color.b, color.a])).toEqual(Array.from(compositeRegion(document, 0, 0, 4, 1)))
  })

  it('skips backdrop pixels for an opaque top-layer gradient and preserves upper layers in a middle-layer preview', () => {
    const document = createDocument('opaque preview', 8, 8, 'rgba')
    document.layers.push(createLayer('middle', 8, 8, 'rgba'), createLayer('top', 8, 8, 'rgba'))
    const bounds = { x: 2, y: 3, width: 2, height: 2 }
    const top = createGradientCompositePreview(document, 2, bounds, true)
    expect(top.lower).toBeNull()
    expect(top.upper).toBeNull()
    const color = { r: 15, g: 45, b: 75, a: 255 }
    expect(compositeGradientPreviewAt(top, 2, 3, color)).toBe(color)
    writeLayerColor(document, document.layers[2], 3 * 8 + 2, { r: 0, g: 255, b: 0, a: 255 })
    const middle = createGradientCompositePreview(document, 1, bounds, true)
    expect(middle.lower).toBeNull()
    expect(compositeGradientPreviewAt(middle, 2, 3, color)).toEqual({ r: 0, g: 255, b: 0, a: 255 })
  })

  it('writes enlarged screen blocks exactly without touching pixels outside the block', () => {
    const pixels = new Uint8ClampedArray(8 * 6 * 4).fill(19)
    const expected = pixels.slice()
    const color = { r: 100, g: 200, b: 50, a: 128 }
    for (let y = 2; y < 5; y++) for (let x = 1; x < 7; x++) expected.set([100, 200, 50, 128], (y * 8 + x) * 4)
    fillGradientPreviewBlock(new Uint32Array(pixels.buffer), 8, 1, 2, 7, 5, color)
    expect(pixels).toEqual(expected)
  })
})
