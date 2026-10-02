import { describe, expect, it } from 'vitest'
import { createDocument, getActiveLayer, readLayerColorAt, writeLayerColor, compositeRegion, findOrAddPaletteColor } from './document'
import { commitPixelEdit, revertPixelEdit } from './history'
import { floodFill, floodFillSymmetric } from './tools-fill'

const original = { r: 172, g: 49, b: 49, a: 255 }
const light = { r: 240, g: 210, b: 210, a: 255 }

describe('cropped smart-closure fill history', () => {
  it('includes tolerated colors and preserves their distinct before values', () => {
    const document = createDocument('tolerance', 512, 512, 'rgba')
    const layer = getActiveLayer(document)
    layer.width = 24
    layer.height = 24
    layer.offsetX = 20
    layer.offsetY = 30
    layer.pixels = new Uint8ClampedArray(24 * 24 * 4)
    const similar = { ...original, r: original.r + 1 }
    for (let y = 4; y < 20; y++) for (let x = 4; x < 20; x++) writeLayerColor(document, layer, y * 24 + x, x < 12 ? original : similar)
    const before = layer.pixels.slice()
    const edit = floodFill(document, layer, 28, 38, light, null, true, null, 1, undefined, 'solid', 1, 0, 'paint', 10, 2)
    expect(readLayerColorAt(document, layer, 36, 38)).toEqual(light)
    const history = commitPixelEdit(document, edit!, 'fill')!
    history.undo()
    expect(layer.pixels.every((value, index) => value === before[index])).toBe(true)
  })

  it('undoes overlapping compact translucent symmetry fills to the first before value', () => {
    const document = createDocument('overlapping runs', 512, 512, 'rgba')
    const layer = getActiveLayer(document)
    const before = layer.pixels.slice()
    const edit = floodFillSymmetric(document, layer, 100, 100, { ...light, a: 128 }, null, true, null, 1, undefined, 'solid', 1, 0, 'paint', { horizontal: false, vertical: true, diagonalUp: false, diagonalDown: false }, undefined, 0, 2)
    expect(edit?.before.size).toBe(0)
    expect(edit?.runs?.length).toBe(1024)
    const after = layer.pixels.slice()
    const history = commitPixelEdit(document, edit!, 'fill')!
    history.undo()
    expect(layer.pixels.every((value, index) => value === before[index])).toBe(true)
    history.redo()
    expect(layer.pixels.every((value, index) => value === after[index])).toBe(true)
    revertPixelEdit(document, edit)
    expect(layer.pixels.every((value, index) => value === before[index])).toBe(true)
  })

  it('keeps earlier symmetric fill edits valid when a later seed expands storage', () => {
    const document = createDocument('symmetric expansion', 20, 20, 'rgba')
    const layer = getActiveLayer(document)
    layer.width = 6
    layer.height = 6
    layer.offsetX = 2
    layer.offsetY = 2
    layer.pixels = new Uint8ClampedArray(6 * 6 * 4)
    for (let y = 1; y < 5; y++) for (let x = 1; x < 5; x++) writeLayerColor(document, layer, y * 6 + x, original)
    const before = compositeRegion(document, 0, 0, 20, 20)
    const edit = floodFillSymmetric(document, layer, 4, 4, light, null, true, null, 1, undefined, 'solid', 1, 0, 'paint', { horizontal: false, vertical: true, diagonalUp: false, diagonalDown: false })
    const after = compositeRegion(document, 0, 0, 20, 20)
    const history = commitPixelEdit(document, edit!, 'fill')!
    history.undo()
    expect(compositeRegion(document, 0, 0, 20, 20)).toEqual(before)
    history.redo()
    expect(compositeRegion(document, 0, 0, 20, 20)).toEqual(after)
  })

  it.each(['rgba', 'indexed'] as const)('fills in canvas coordinates and restores every %s pixel', (format) => {
    const document = createDocument('offset fill', 500, 767, format)
    if (format === 'indexed') {
      findOrAddPaletteColor(document, original, true)
      findOrAddPaletteColor(document, light, true)
    }
    const layer = getActiveLayer(document)
    layer.width = 297
    layer.height = 241
    layer.offsetX = 20
    layer.offsetY = 30
    layer.pixels = format === 'rgba' ? new Uint8ClampedArray(297 * 241 * 4) : new Uint32Array(297 * 241)
    for (let y = 40; y < 100; y++) for (let x = 40; x < 110; x++) {
      writeLayerColor(document, layer, y * layer.width + x, original)
    }
    const before = layer.pixels.slice()
    const edit = floodFillSymmetric(document, layer, 80, 90, light, null, true, null, 1, undefined, 'solid', 1, 0, 'paint', undefined, undefined, 0, 2)
    expect(edit).not.toBeNull()
    const after = layer.pixels.slice()
    const history = commitPixelEdit(document, edit!, 'fill')!
    history.undo()
    expect(layer.pixels).toEqual(before)
    history.redo()
    expect(layer.pixels).toEqual(after)
    for (let y = 30; y < 271; y++) for (let x = 20; x < 317; x++) {
      const color = readLayerColorAt(document, layer, x, y)
      if (x >= 60 && x < 130 && y >= 70 && y < 130) expect(color).toEqual(light)
      else expect(color.a).toBe(0)
    }
    revertPixelEdit(document, edit)
    expect(layer.pixels).toEqual(before)
  })
})
