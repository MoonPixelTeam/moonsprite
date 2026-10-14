import { describe, expect, it } from 'vitest'
import { applyColorAdjustment, applyColorAdjustmentDirect, adjustColor, createColorizeAdjustment, buildCurveHistogram, buildCurveHistogramChunked, buildCurveLut, buildCurvePath, isColorAdjustmentIdentity, type ColorAdjustment } from './adjustments'
import { processAdjustmentPreview } from './adjustment-preview-processing'
import { createDocument, getActiveLayer, readLayerColor, writeLayerColor } from './document'

describe('color adjustments', () => {
  it('colorizes gray and colored pixels to one hue while retaining lightness and alpha', () => {
    const adjustment = createColorizeAdjustment({ r: 0, g: 0, b: 255, a: 0 })
    for (const color of [{ r: 80, g: 80, b: 80, a: 127 }, { r: 40, g: 180, b: 90, a: 255 }]) {
      const next = adjustColor(color, adjustment)
      expect(next.b).toBeGreaterThan(next.r)
      expect(next.r).toBe(next.g)
      expect(next.a).toBe(color.a)
      expect(Math.max(next.r, next.g, next.b) + Math.min(next.r, next.g, next.b)).toBeCloseTo(Math.max(color.r, color.g, color.b) + Math.min(color.r, color.g, color.b), 0)
    }
    for (const color of [{ r: 0, g: 0, b: 0, a: 255 }, { r: 255, g: 255, b: 255, a: 255 }, { r: 80, g: 90, b: 100, a: 0 }]) {
      expect(adjustColor(color, adjustment)).toEqual(color)
    }
  })

  it('uses red for achromatic foreground and treats zero-saturation colorizing as desaturation', () => {
    for (const value of [0, 255]) expect(createColorizeAdjustment({ r: value, g: value, b: value, a: 255 }).hue).toBe(0)
    const adjustment: ColorAdjustment = { kind: 'hue-saturation', colorize: true, hue: 0, saturation: 0 }
    expect(isColorAdjustmentIdentity(adjustment)).toBe(false)
    expect(adjustColor({ r: 40, g: 180, b: 90, a: 128 }, adjustment)).toEqual({ r: 110, g: 110, b: 110, a: 128 })
  })

  it('matches direct preview colorizing to committed edits inside a selection', () => {
    const expected = createDocument('colorize', 3, 1, 'rgba')
    const actual = createDocument('colorize preview', 3, 1, 'rgba')
    const before = new Uint8ClampedArray([80, 80, 80, 128, 40, 180, 90, 255, 12, 34, 56, 0])
    const expectedLayer = getActiveLayer(expected)
    const actualLayer = getActiveLayer(actual)
    expectedLayer.pixels.set(before)
    actualLayer.pixels.set(before)
    const selection = { x: 0, y: 0, width: 3, height: 1, mask: new Uint8Array([1, 0, 1]) }
    const adjustment = createColorizeAdjustment({ r: 0, g: 0, b: 255, a: 255 })
    applyColorAdjustment(expected, expectedLayer, adjustment, selection)
    applyColorAdjustmentDirect(actual, actualLayer, adjustment, selection)
    expect(actualLayer.pixels).toEqual(expectedLayer.pixels)
    expect(Array.from(actualLayer.pixels.slice(4))).toEqual(Array.from(before.slice(4)))
    expect(actualLayer.pixels[2]).toBeGreaterThan(actualLayer.pixels[0])
  })
  it('keeps alpha while applying brightness and contrast', () => {
    const next = adjustColor({ r: 80, g: 100, b: 120, a: 140 }, { kind: 'brightness-contrast', brightness: 20, contrast: 10 })
    expect(next.a).toBe(140)
    expect(next.r).toBeGreaterThan(80)
  })



  it('limits adjustments to the selection in document coordinates', () => {
    const document = createDocument('selected adjustment', 4, 2, 'rgba')
    const layer = getActiveLayer(document)
    layer.offsetX = 1
    layer.offsetY = 1
    writeLayerColor(document, layer, 0, { r: 10, g: 20, b: 30, a: 255 })
    writeLayerColor(document, layer, 1, { r: 40, g: 50, b: 60, a: 255 })

    const edit = applyColorAdjustment(document, layer, { kind: 'brightness-contrast', brightness: 10 }, { x: 2, y: 1, width: 1, height: 1 })

    expect(edit.before.size).toBe(1)
    expect(readLayerColor(document, layer, 0).r).toBe(10)
    expect(readLayerColor(document, layer, 1).r).toBeGreaterThan(40)
  })

  it.each<ColorAdjustment>([
    { kind: 'brightness-contrast', brightness: 20, contrast: 10 },
    { kind: 'hue-saturation', hue: 25, saturation: 20, lightness: 10 },
    { kind: 'color-balance', midtonesCyanRed: 20, midtonesMagentaGreen: -15, highlightsYellowBlue: 10, preserveLuminosity: true },
    { kind: 'curves', curvePoints: [{ x: 0, y: 0 }, { x: 128, y: 170 }, { x: 255, y: 255 }] }
  ])('matches the history-producing RGBA path for $kind previews', (adjustment) => {
    const expectedDocument = createDocument('expected adjustment', 3, 2, 'rgba')
    const actualDocument = createDocument('direct adjustment', 3, 2, 'rgba')
    const expectedLayer = getActiveLayer(expectedDocument)
    const actualLayer = getActiveLayer(actualDocument)
    const pixels = new Uint8ClampedArray([
      10, 20, 30, 255, 50, 60, 70, 180, 90, 100, 110, 0,
      120, 130, 140, 255, 160, 170, 180, 220, 200, 210, 220, 255
    ])
    expectedLayer.pixels.set(pixels)
    actualLayer.pixels.set(pixels)

    applyColorAdjustment(expectedDocument, expectedLayer, adjustment)
    applyColorAdjustmentDirect(actualDocument, actualLayer, adjustment)

    expect(actualLayer.pixels).toEqual(expectedLayer.pixels)
  })

  it('restores pixels outside a masked selection from the supplied preview baseline', () => {
    const document = createDocument('direct selected adjustment', 3, 1, 'rgba')
    const layer = getActiveLayer(document)
    const baseline = new Uint8ClampedArray([
      10, 20, 30, 255,
      40, 50, 60, 255,
      70, 80, 90, 255
    ])
    layer.pixels.fill(255)

    applyColorAdjustmentDirect(document, layer, { kind: 'brightness-contrast', brightness: 20 }, { x: 0, y: 0, width: 3, height: 1, mask: new Uint8Array([0, 1, 0]) }, baseline)

    expect(readLayerColor(document, layer, 0)).toEqual({ r: 10, g: 20, b: 30, a: 255 })
    expect(readLayerColor(document, layer, 1).r).toBeGreaterThan(40)
    expect(readLayerColor(document, layer, 2)).toEqual({ r: 70, g: 80, b: 90, a: 255 })
  })


  it('produces worker preview pixels identical to the complete adjustment path', async () => {
    const document = createDocument('worker adjustment preview', 4, 2, 'rgba')
    const layer = getActiveLayer(document)
    const source = new Uint8ClampedArray([
      10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255, 100, 110, 120, 255,
      130, 140, 150, 255, 160, 170, 180, 255, 190, 200, 210, 255, 220, 230, 240, 255
    ])
    layer.pixels.set(source)
    const selection = { x: 1, y: 0, width: 2, height: 2, mask: new Uint8Array([1, 0, 1, 1]) }
    const adjustment: ColorAdjustment = { kind: 'hue-saturation', hue: 30, saturation: 25, lightness: 10 }
    applyColorAdjustmentDirect(document, layer, adjustment, selection, source)
    const expected = new Uint8ClampedArray(layer.pixels)

    const result = await processAdjustmentPreview({
      documentWidth: 4,
      documentHeight: 2,
      colorMode: 'rgba',
      palette: document.palette,
      paletteOrder: document.paletteOrder,
      nextColorId: document.nextColorId,
      selection,
      locale: 'zh-CN',
      layers: [{ layerId: layer.id, width: 4, height: 2, offsetX: 0, offsetY: 0, format: 'rgba', isMask: false, localContentBounds: { x: 0, y: 0, width: 4, height: 2 }, pixels: source }]
    }, 1, adjustment, { x: 0, y: 0, width: 4, height: 2 })

    expect(result).not.toBeNull()
    const previewLayer = result!.layers[0]
    const actual = new Uint8ClampedArray(source)
    for (let row = 0; row < previewLayer.height; row += 1) {
      const sourceOffset = row * previewLayer.width * 4
      const targetOffset = ((previewLayer.y + row) * 4 + previewLayer.x) * 4
      actual.set((previewLayer.pixels as Uint8ClampedArray).subarray(sourceOffset, sourceOffset + previewLayer.width * 4), targetOffset)
    }
    expect(actual).toEqual(expected)
  })









})
