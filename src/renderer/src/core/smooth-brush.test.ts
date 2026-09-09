import { describe, expect, it } from 'vitest'
import { createDocument, readLayerColorAt, writeLayerColor } from './document'
import { beginPixelEdit, revertPixelEdit } from './history'
import { applySmoothBrush, collectSmoothBrushArea } from './smooth-brush'

const color = { r: 50, g: 100, b: 200, a: 255 }
function fixture(points: number[][]) {
  const document = createDocument('smooth', 9, 9, 'rgba')
  const layer = document.layers[0]
  for (const [x, y] of points) writeLayerColor(document, layer, y * 9 + x, color)
  const stroke = { visited: new Set<number>() }
  const edit = beginPixelEdit(layer.id)
  return { document, layer, stroke, edit }
}

describe('smooth brush', () => {
  it('10, 20, 30 and 50 percent apply increasing subsets of the same corrections', () => {
    const points = [[1, 1], [4, 1], [7, 1], [1, 7], [7, 7]]
    for (const strength of [10, 20, 30, 50]) {
      const { document, layer, stroke, edit } = fixture(points)
      for (const [x, y] of points) stroke.visited.add(y * 9 + x)
      const before = layer.pixels.slice()
      applySmoothBrush(document, layer, edit, stroke, null, strength)
      const removed = points.filter(([x, y]) => readLayerColorAt(document, layer, x, y).a === 0)
      expect(removed.length).toBe(strength / 10)
      revertPixelEdit(document, edit)
      expect(layer.pixels).toEqual(before)
    }
  })

  it('partial strength prioritizes an isolated speck over a less certain nub regardless of coverage order', () => {
    const points = [[1, 1], [4, 4], [4, 5], [3, 5]]
    for (const keys of [[40, 10], [10, 40]]) {
      const { document, layer, stroke, edit } = fixture(points)
      stroke.visited = new Set(keys)
      applySmoothBrush(document, layer, edit, stroke, null, 10)
      expect(readLayerColorAt(document, layer, 1, 1).a).toBe(0)
      expect(readLayerColorAt(document, layer, 4, 4)).toEqual(color)
    }
  })

  it('zero strength does not modify pixels or create an edit', () => {
    const { document, layer, stroke, edit } = fixture([[4, 4]])
    stroke.visited.add(40)
    expect(applySmoothBrush(document, layer, edit, stroke, null, 0)).toBe(false)
    expect(edit.before.size).toBe(0)
    expect(readLayerColorAt(document, layer, 4, 4)).toEqual(color)
  })

  it('low strengths already remove ordinary nubs', () => {
    const points = [[4, 2]]
    for (let y = 3; y <= 6; y++) for (let x = 2; x <= 6; x++) points.push([x, y])
    for (const strength of [10, 20, 30, 50, 100]) {
      const { document, layer, stroke, edit } = fixture(points)
      stroke.visited.add(2 * 9 + 4)
      applySmoothBrush(document, layer, edit, stroke, null, strength)
      expect(readLayerColorAt(document, layer, 4, 2).a).toBe(0)
      revertPixelEdit(document, edit)
      expect(readLayerColorAt(document, layer, 4, 2)).toEqual(color)
    }
  })

  it('100% cleans a weaker multicolor nub that 50% preserves', () => {
    for (const strength of [50, 100]) {
      const { document, layer, stroke, edit } = fixture([[4, 4], [4, 5], [3, 5]])
      for (const x of [4, 5]) writeLayerColor(document, layer, 3 * 9 + x, { r: 200, g: 30, b: 20, a: 255 })
      stroke.visited.add(40)
      applySmoothBrush(document, layer, edit, stroke, null, strength)
      expect(readLayerColorAt(document, layer, 4, 4).a).toBe(strength === 50 ? 255 : 0)
      revertPixelEdit(document, edit)
      expect(readLayerColorAt(document, layer, 4, 4)).toEqual(color)
    }
  })

  it('only collects coverage while pressed; applies on release and can revert exactly', () => {
    const { document, layer, stroke, edit } = fixture([[1, 4], [2, 4], [4, 4], [5, 4]])
    const before = layer.pixels.slice()
    collectSmoothBrushArea(document, stroke, { x: 2, y: 4 }, { x: 5, y: 4 }, 4, null)
    expect(stroke.visited.has(4 * 9 + 3)).toBe(true)
    expect(layer.pixels).toEqual(before)
    expect(edit.before.size).toBe(0)
    expect(applySmoothBrush(document, layer, edit, stroke, null)).toBe(true)
    expect(readLayerColorAt(document, layer, 3, 4)).toEqual(color)
    revertPixelEdit(document, edit)
    expect(layer.pixels).toEqual(before)
  })

  it.each([10, 50, 75, 100])('preserves a thin diagonal and its endpoints at %i%%', (strength) => {
    const { document, layer, stroke, edit } = fixture(Array.from({ length: 7 }, (_, i) => [i + 1, i + 1]))
    const before = layer.pixels.slice()
    collectSmoothBrushArea(document, stroke, { x: 4, y: 4 }, { x: 4, y: 4 }, 16, null)
    applySmoothBrush(document, layer, edit, stroke, null, strength)
    expect(layer.pixels).toEqual(before)
  })

  it('removes a single pixel nub without removing the block corner', () => {
    const points = [[4, 2]]
    for (let y = 3; y <= 6; y++) for (let x = 2; x <= 6; x++) points.push([x, y])
    const { document, layer, stroke, edit } = fixture(points)
    collectSmoothBrushArea(document, stroke, { x: 4, y: 4 }, { x: 4, y: 4 }, 16, null)
    applySmoothBrush(document, layer, edit, stroke, null)
    expect(readLayerColorAt(document, layer, 4, 2).a).toBe(0)
    expect(readLayerColorAt(document, layer, 2, 3)).toEqual(color)
  })

  it('does not process pixels outside the painted area', () => {
    const { document, layer, stroke, edit } = fixture([[1, 1], [7, 7]])
    collectSmoothBrushArea(document, stroke, { x: 1, y: 1 }, { x: 1, y: 1 }, 1, null)
    applySmoothBrush(document, layer, edit, stroke, null)
    expect(readLayerColorAt(document, layer, 1, 1).a).toBe(0)
    expect(readLayerColorAt(document, layer, 7, 7)).toEqual(color)
  })

  it('high strengths visibly round a block contour instead of matching 50%', () => {
    const points: number[][] = []
    for (let y = 2; y <= 6; y++) for (let x = 2; x <= 6; x++) points.push([x, y])
    for (const strength of [50, 75, 100]) {
      const { document, layer, stroke, edit } = fixture(points)
      const before = layer.pixels.slice()
      collectSmoothBrushArea(document, stroke, { x: 4, y: 4 }, { x: 4, y: 4 }, 16, null)
      applySmoothBrush(document, layer, edit, stroke, null, strength)
      expect(readLayerColorAt(document, layer, 2, 2).a).toBe(strength === 50 ? 255 : 0)
      expect(readLayerColorAt(document, layer, 4, 4)).toEqual(color)
      revertPixelEdit(document, edit)
      expect(layer.pixels).toEqual(before)
    }
  })

  it('strong passes are independent of coverage insertion order', () => {
    const points: number[][] = [[4, 1]]
    for (let y = 2; y <= 6; y++) for (let x = 2; x <= 6; x++) points.push([x, y])
    const outputs = [false, true].map((reverse) => {
      const { document, layer, stroke, edit } = fixture(points)
      collectSmoothBrushArea(document, stroke, { x: 4, y: 4 }, { x: 4, y: 4 }, 16, null)
      if (reverse) stroke.visited = new Set([...stroke.visited].reverse())
      applySmoothBrush(document, layer, edit, stroke, null, 100)
      return layer.pixels
    })
    expect(outputs[0]).toEqual(outputs[1])
  })

})
