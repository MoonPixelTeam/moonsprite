import { describe, expect, it } from 'vitest'
import { commitPixelEdit, revertPixelEdit } from './history'
import { createDocument, createSparseLayer, getActiveLayer, readLayerColorAt, writeLayerColor } from './document'
import { applyGradient, constrainGradientEndpoint, createGradientColorSampler, gradientAmountAt, gradientColorAt, gradientColorForAmount, gradientRegionSelection, GRADIENT_DITHER_PRESETS, interpolateRgbaColor, resolveRadialGradientGeometry } from './gradient'
import { ditherStageCount } from './gradient-color'

const red = { r: 255, g: 0, b: 0, a: 255 }
const blue = { r: 0, g: 0, b: 255, a: 255 }
const green = { r: 0, g: 255, b: 0, a: 255 }

describe('gradient tool core', () => {
  it('snaps constrained endpoints to sixteen directions while preserving distance', () => {
    expect(constrainGradientEndpoint({ x: 2, y: 3 }, { x: 12, y: 3 })).toEqual({ x: 12, y: 3 })
    expect(constrainGradientEndpoint({ x: 2, y: 3 }, { x: 2, y: 13 })).toEqual({ x: 2, y: 13 })
    expect(constrainGradientEndpoint({ x: 0, y: 0 }, { x: 10, y: 10 })).toEqual({ x: 10, y: 10 })

    const snapped = constrainGradientEndpoint({ x: 0, y: 0 }, { x: 10, y: 3 })
    const angle = Math.atan2(snapped.y, snapped.x)
    const directionStep = Math.PI / 8
    expect(Math.abs(angle / directionStep - Math.round(angle / directionStep))).toBeLessThan(0.000001)
    expect(Math.hypot(snapped.x, snapped.y)).toBeGreaterThan(0)
  })



  it('resolves radial gradients from independently sized ellipse bounds', () => {
    const start = { x: 0, y: 0 }
    const end = { x: 8, y: 4 }
    expect(gradientAmountAt(4, 2, start, end, 'radial')).toBe(0)
    expect(gradientAmountAt(8, 2, start, end, 'radial')).toBe(1)
    expect(gradientAmountAt(4, 4, start, end, 'radial')).toBe(1)
    expect(gradientAmountAt(6, 3, start, end, 'radial')).toBeCloseTo(Math.SQRT1_2)
    expect(gradientAmountAt(0, 0, start, end, 'radial')).toBe(1)
    expect(gradientColorAt(red, blue, 4, 2, start, end, 'none', 'radial')).toEqual(red)
    expect(gradientColorAt(red, blue, 6, 2, start, end, 'none', 'radial')).toEqual({ r: 128, g: 0, b: 128, a: 255 })
    expect(createGradientColorSampler(red, blue, start, end, 'none', 'radial')(4, 4)).toEqual(blue)
  })

  it('rotates radial gradient ellipse axes around its center', () => {
    const start = { x: 0, y: 0 }
    const end = { x: 8, y: 4 }
    expect(gradientAmountAt(4, 4, start, end, 'radial', { angle: 90 })).toBe(0.5)
    expect(gradientAmountAt(4, 6, start, end, 'radial', { angle: 90 })).toBe(1)
    expect(gradientAmountAt(4, 6, start, end, 'radial', { angle: 90, radialGeometry: { center: { x: 4, y: 2 }, radiusX: 4, radiusY: 2 } })).toBe(1)
  })

  it('interpolates any number of freeform gradient stops', () => {
    const stops = [
      { position: 1, color: blue },
      { position: 0.5, color: green },
      { position: 0, color: red }
    ]
    const sample = createGradientColorSampler(red, blue, { x: 0, y: 0 }, { x: 4, y: 0 }, 'none', 'linear', {}, stops)
    expect(sample(0, 0)).toEqual(red)
    expect(sample(1, 0)).toEqual({ r: 128, g: 128, b: 0, a: 255 })
    expect(sample(2, 0)).toEqual(green)
    expect(sample(3, 0)).toEqual({ r: 0, g: 128, b: 128, a: 255 })
    expect(sample(4, 0)).toEqual(blue)
  })

  it('represents a uniform gradient paint region without a full-size mask', () => {
    const document = createDocument('uniform gradient region', 512, 512, 'rgba')
    const layer = getActiveLayer(document)

    expect(gradientRegionSelection(document, layer, { x: 256, y: 256 }, 0, true)).toEqual({
      x: 0,
      y: 0,
      width: 512,
      height: 512
    })
  })

  it('keeps dense opaque multi-stop gradients exact through undo and redo', () => {
    const document = createDocument('dense packed gradient', 512, 512, 'rgba')
    const layer = getActiveLayer(document)
    const stops = [
      { position: 0, color: red },
      { position: 0.5, color: green },
      { position: 1, color: blue }
    ]
    const start = { x: 0, y: 0 }
    const end = { x: 511, y: 0 }
    const sample = createGradientColorSampler(red, blue, start, end, 'none', 'linear', {}, stops)
    const edit = applyGradient(document, layer, start, end, red, blue, null, 'none', undefined, 'linear', {}, stops)

    expect(edit?.denseRegion?.count).toBeGreaterThan(0)
    for (const x of [0, 128, 256, 384, 511]) expect(readLayerColorAt(document, layer, x, 300)).toEqual(sample(x, 300))

    const history = commitPixelEdit(document, edit!, 'dense gradient')!
    history.undo()
    expect(readLayerColorAt(document, layer, 0, 300).a).toBe(0)
    expect(readLayerColorAt(document, layer, 511, 300).a).toBe(0)
    history.redo()
    for (const x of [0, 128, 256, 384, 511]) expect(readLayerColorAt(document, layer, x, 300)).toEqual(sample(x, 300))
  })

  it('does not leave a sparse layer expanded when a transparent gradient is a no-op', () => {
    const document = createDocument('sparse gradient no-op', 1024, 1024, 'rgba')
    const layer = createSparseLayer('sparse', 'rgba')
    document.layers = [layer]
    document.activeLayerId = layer.id
    const transparent = { r: 0, g: 0, b: 0, a: 0 }
    const edit = applyGradient(document, layer, { x: 0, y: 0 }, { x: 1023, y: 1023 }, transparent, transparent)
    expect(edit).toBeNull()
    expect(layer.width).toBe(1)
    expect(layer.height).toBe(1)
    expect(layer.offsetX).toBe(0)
    expect(layer.offsetY).toBe(0)
  })

  it('restores an opaque background layer after repeated dense gradient undo', () => {
    const document = createDocument('background gradient undo', 1024, 1024, 'rgba')
    const layer = getActiveLayer(document)
    layer.background = { mode: 'canvas' }
    const yellow = { r: 255, g: 230, b: 0, a: 255 }
    layer.pixels.fill(0)
    for (let offset = 0; offset < layer.pixels.length; offset += 4) {
      layer.pixels[offset] = yellow.r
      layer.pixels[offset + 1] = yellow.g
      layer.pixels[offset + 2] = yellow.b
      layer.pixels[offset + 3] = yellow.a
    }
    for (let iteration = 0; iteration < 3; iteration += 1) {
      const edit = applyGradient(document, layer, { x: 0, y: 0 }, { x: 1023, y: 0 }, red, blue)
      expect(edit).not.toBeNull()
      const history = commitPixelEdit(document, edit!, 'background gradient')!
      history.undo()
      expect(readLayerColorAt(document, layer, 512, 512)).toEqual(yellow)
    }
  })

  it('preserves pixels outside a masked dense gradient on undo and redo', () => {
    const document = createDocument('masked dense gradient', 1024, 512, 'rgba')
    const layer = getActiveLayer(document)
    const outside = { r: 12, g: 34, b: 56, a: 255 }
    for (let index = 0; index < layer.width * layer.height; index += 1) writeLayerColor(document, layer, index, outside)
    const selection = { x: 0, y: 0, width: 512, height: 512, mask: new Uint8Array(512 * 512).fill(1) }
    const edit = applyGradient(document, layer, { x: 0, y: 0 }, { x: 511, y: 0 }, red, blue, selection)
    expect(edit?.denseRegion?.count).toBeGreaterThan(0)
    const history = commitPixelEdit(document, edit!, 'masked gradient')!
    history.undo()
    expect(readLayerColorAt(document, layer, 800, 300)).toEqual(outside)
    history.redo()
    expect(readLayerColorAt(document, layer, 800, 300)).toEqual(outside)
  })

  it('uses the nearest edge stop outside the first and last positions', () => {
    const sample = createGradientColorSampler(red, blue, { x: 0, y: 0 }, { x: 4, y: 0 }, 'none', 'linear', {}, [
      { position: 0.25, color: red },
      { position: 0.75, color: blue }
    ])
    expect(sample(0, 0)).toEqual(red)
    expect(sample(1, 0)).toEqual(red)
    expect(sample(2, 0)).toEqual({ r: 128, g: 0, b: 128, a: 255 })
    expect(sample(4, 0)).toEqual(blue)
  })

  it('supports freeform stops in radial gradients and ordered dithering', () => {
    const stops = [
      { position: 0, color: red },
      { position: 0.5, color: green },
      { position: 1, color: blue }
    ]
    const radial = createGradientColorSampler(red, blue, { x: 0, y: 0 }, { x: 4, y: 4 }, 'none', 'radial', {}, stops)
    expect(radial(2, 2)).toEqual(red)
    expect(radial(2, 3)).toEqual(green)
    expect(radial(2, 4)).toEqual(blue)
    const dithered = createGradientColorSampler(red, blue, { x: 0, y: 0 }, { x: 4, y: 0 }, 'checker', 'linear', {}, stops)
    expect(dithered(0, 0)).toEqual(red)
    expect(dithered(2, 0)).toEqual(green)
    expect(dithered(4, 0)).toEqual(blue)
  })

  it('matches marquee-style center and proportional modifiers for radial geometry', () => {
    expect(resolveRadialGradientGeometry({ x: 0, y: 0 }, { x: 8, y: 4 })).toEqual({
      center: { x: 4, y: 2 },
      radiusX: 4,
      radiusY: 2
    })
    expect(resolveRadialGradientGeometry({ x: 3, y: 3 }, { x: 7, y: 5 }, { fromCenter: true })).toEqual({
      center: { x: 3, y: 3 },
      radiusX: 4,
      radiusY: 2
    })
    expect(resolveRadialGradientGeometry({ x: 0, y: 0 }, { x: 4, y: 2 }, { proportional: true })).toEqual({
      center: { x: 2, y: 2 },
      radiusX: 2,
      radiusY: 2
    })
    expect(resolveRadialGradientGeometry({ x: 0, y: 0 }, { x: 4, y: 2 }, { fromCenter: true, proportional: true })).toEqual({
      center: { x: 0, y: 0 },
      radiusX: 4,
      radiusY: 4
    })
  })

  it('keeps a zero-width radial axis finite and confined to its center line', () => {
    const start = { x: 0, y: 0 }
    const end = { x: 4, y: 0 }
    expect(gradientAmountAt(2, 0, start, end, 'radial')).toBe(0)
    expect(gradientAmountAt(0, 0, start, end, 'radial')).toBe(1)
    expect(gradientAmountAt(2, 1, start, end, 'radial')).toBe(1)
  })

  it('applies radial gradients through the same undoable edit path', () => {
    const document = createDocument('radial gradient', 5, 5, 'rgba')
    const layer = getActiveLayer(document)
    const edit = applyGradient(document, layer, { x: 0, y: 0 }, { x: 4, y: 4 }, red, blue, null, 'none', undefined, 'radial')

    expect(edit).not.toBeNull()
    expect(readLayerColorAt(document, layer, 2, 2)).toEqual(red)
    expect(readLayerColorAt(document, layer, 2, 3)).toEqual({ r: 128, g: 0, b: 128, a: 255 })
    expect(readLayerColorAt(document, layer, 2, 4)).toEqual(blue)
    expect(readLayerColorAt(document, layer, 0, 0)).toEqual(blue)
  })





  it('uses six stages for directional gradient dithering', () => {
    const samples = [
      { mode: 'diagonal' as const, low: { x: 2, y: 0 }, high: { x: 4, y: 0 } },
      { mode: 'diagonal-reverse' as const, low: { x: 2, y: 0 }, high: { x: 4, y: 0 } },
      { mode: 'horizontal' as const, low: { x: 0, y: 2 }, high: { x: 0, y: 4 } },
      { mode: 'vertical' as const, low: { x: 2, y: 0 }, high: { x: 4, y: 0 } }
    ]
    for (const sample of samples) {
      expect(ditherStageCount(sample.mode)).toBe(6)
      expect(gradientColorForAmount(red, blue, 0.5, sample.low.x, sample.low.y, sample.mode)).toEqual(blue)
      expect(gradientColorForAmount(red, blue, 0.5, sample.high.x, sample.high.y, sample.mode)).toEqual(red)
    }
  })









  it('maps indexed gradients to the existing palette without inserting colors', () => {
    const document = createDocument('indexed gradient', 3, 1, 'indexed')
    const layer = getActiveLayer(document)
    const startColor = { r: 200, g: 10, b: 20, a: 255 }
    const endColor = { r: 20, g: 30, b: 220, a: 255 }
    const originalPalette = document.palette.map((entry) => ({ ...entry, color: { ...entry.color } }))

    applyGradient(document, layer, { x: 0, y: 0 }, { x: 2, y: 0 }, startColor, endColor)

    expect([0, 1, 2].map((x) => readLayerColorAt(document, layer, x, 0))).toEqual([
      { r: 24, g: 27, b: 33, a: 255 },
      { r: 24, g: 27, b: 33, a: 255 },
      { r: 41, g: 121, b: 255, a: 255 }
    ])
    expect(document.palette).toEqual(originalPalette)
  })
})
