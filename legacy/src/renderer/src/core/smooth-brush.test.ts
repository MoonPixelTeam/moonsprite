import { describe, expect, it } from 'vitest'
import { createDocument, readLayerColorAt, readLayerPacked, writeLayerColor } from './document'
import { beginPixelEdit, recordPixel, revertPixelEdit } from './history'
import { applySmoothBrush, collectSmoothBrushArea, smoothChangedLiquifyPixels } from './smooth-brush'
import { rectSelection } from './selection'

const color = { r: 50, g: 100, b: 200, a: 255 }
function fixture(points: number[][], size = 9) {
  const document = createDocument('smooth', size, size, 'rgba')
  const layer = document.layers[0]
  for (const [x, y] of points) writeLayerColor(document, layer, y * size + x, color)
  const stroke = { visited: new Set<number>() }
  const edit = beginPixelEdit(layer.id)
  return { document, layer, stroke, edit }
}

describe('smooth brush', () => {
  it.each([0, 1, 2, 3])('removes a short attached spur and a diagonal speck in rotation %i', (rotation) => {
    const turn = ([px, py]: number[]): number[] => {
      let x = px, y = py
      for (let i = 0; i < rotation; i++) [x, y] = [20 - y, x]
      return [x, y]
    }
    const body: number[][] = []
    for (let y = 9; y <= 15; y++) for (let x = 9; x <= 15; x++) body.push([x, y])
    const tails = [[12, 8], [12, 7], [8, 8]].map(turn)
    const { document, layer, stroke, edit } = fixture([...body.map(turn), ...tails], 21)
    const before = layer.pixels.slice()
    for (const [x, y] of tails) stroke.visited.add(y * 21 + x)
    applySmoothBrush(document, layer, edit, stroke, null, 50)
    for (const [x, y] of tails) expect(readLayerColorAt(document, layer, x, y).a).toBe(0)
    for (const [x, y] of body.map(turn)) expect(readLayerColorAt(document, layer, x, y)).toEqual(color)
    revertPixelEdit(document, edit)
    expect(layer.pixels).toEqual(before)
  })

  it('preserves a longer thin stroke attached to a body at full strength', () => {
    const points: number[][] = []
    for (let y = 10; y <= 16; y++) for (let x = 7; x <= 13; x++) points.push([x, y])
    for (let y = 3; y < 10; y++) points.push([10, y])
    const { document, layer, stroke, edit } = fixture(points, 21)
    for (let y = 3; y <= 6; y++) stroke.visited.add(y * 21 + 10)
    const before = layer.pixels.slice()
    applySmoothBrush(document, layer, edit, stroke, null, 100)
    expect(layer.pixels).toEqual(before)
  })

  it.each([false, true])('removes a small floating pair, including diagonal connectivity (%s)', (diagonal) => {
    const points = [[4, 4], [5, diagonal ? 5 : 4]]
    const { document, layer, stroke, edit } = fixture(points)
    const before = layer.pixels.slice()
    for (const [x, y] of points) stroke.visited.add(y * 9 + x)
    applySmoothBrush(document, layer, edit, stroke, null, 50)
    for (const [x, y] of points) expect(readLayerColorAt(document, layer, x, y).a).toBe(0)
    revertPixelEdit(document, edit)
    expect(layer.pixels).toEqual(before)
  })

  it('small-hole filling follows strength and uses the surrounding original color', () => {
    const points: number[][] = []
    for (let y = 1; y < 8; y++) for (let x = 1; x < 8; x++) {
      if (x === 4 && (y === 4 || y === 5)) continue
      points.push([x, y])
    }
    for (const strength of [10, 50, 100]) {
      const { document, layer, stroke, edit } = fixture(points)
      stroke.visited = new Set([40, 49])
      applySmoothBrush(document, layer, edit, stroke, null, strength)
      for (const y of [4, 5]) expect(readLayerColorAt(document, layer, 4, y).a).toBe(strength === 10 ? 0 : 255)
    }
  })

  it('does not classify a clipped part of a longer line as floating debris', () => {
    const { document, layer, stroke, edit } = fixture([[2, 4], [3, 4], [4, 4], [5, 4], [6, 4]])
    const before = layer.pixels.slice()
    stroke.visited = new Set([38, 39])
    applySmoothBrush(document, layer, edit, stroke, null, 100)
    expect(layer.pixels).toEqual(before)
  })

  it('does not partially remove a floating pair crossing the selection boundary', () => {
    const { document, layer, stroke, edit } = fixture([[4, 4], [5, 4]])
    const before = layer.pixels.slice()
    stroke.visited = new Set([40, 41])
    applySmoothBrush(document, layer, edit, stroke, rectSelection(4, 4, 1, 1), 100)
    expect(layer.pixels).toEqual(before)
  })

  it('high strengths reduce jagged contour length without splitting the solid region', () => {
    const points: number[][] = []
    for (let y = 4; y <= 28; y++) {
      for (let x = 7 + (y % 4 < 2 ? 3 : 0); x <= 25; x++) points.push([x, y])
    }
    const boundaries = [50, 65, 80, 100].map((strength) => {
      const { document, layer, stroke, edit } = fixture(points, 33)
      const before = layer.pixels.slice()
      collectSmoothBrushArea(document, stroke, { x: 16, y: 16 }, { x: 16, y: 16 }, 64, null)
      applySmoothBrush(document, layer, edit, stroke, null, strength)
      const filled = new Set<number>()
      for (let y = 0; y < 33; y++) for (let x = 0; x < 33; x++) {
        const value = readLayerColorAt(document, layer, x, y)
        if (value.a) { expect(value).toEqual(color); filled.add(y * 33 + x) }
      }
      let boundary = 0
      for (const key of filled) for (const delta of [-33, 33, -1, 1]) if (!filled.has(key + delta)) boundary++
      const connected = new Set<number>()
      const queue = [filled.values().next().value!]
      while (queue.length) {
        const key = queue.pop()!
        if (!filled.has(key) || connected.has(key)) continue
        connected.add(key)
        for (const delta of [-33, 33, -1, 1]) queue.push(key + delta)
      }
      expect(connected.size).toBe(filled.size)
      revertPixelEdit(document, edit)
      expect(layer.pixels).toEqual(before)
      return boundary
    })
    for (const boundary of boundaries.slice(1)) expect(boundary).toBeLessThanOrEqual(boundaries[0])
    expect(boundaries[3]).toBeLessThan(boundaries[0])
    expect(boundaries[3]).toBeLessThan(boundaries[1])
  })

  it('smooths the pushed result only, retaining the original push undo baseline', () => {
    const points = [[1, 1], [7, 7]]
    for (let y = 3; y <= 6; y++) for (let x = 3; x <= 7; x++) points.push([x, y])
    const { document, layer, edit } = fixture(points)
    const before = layer.pixels.slice()
    // Model the push moving a source pixel onto the top edge as a nub.
    const source = readLayerPacked(document, layer, 10)
    recordPixel(document, layer, edit, 10, 0)
    recordPixel(document, layer, edit, 2 * 9 + 5, source)
    expect(readLayerColorAt(document, layer, 5, 2)).toEqual(color)
    expect(smoothChangedLiquifyPixels(document, layer, edit, null)).toBe(true)
    expect(readLayerColorAt(document, layer, 5, 2).a).toBe(0)
    expect(readLayerColorAt(document, layer, 7, 7)).toEqual(color)
    expect(edit.before.size).toBe(2)
    revertPixelEdit(document, edit)
    expect(layer.pixels).toEqual(before)
  })

  it('does not smooth pixels touched by a push but restored to their original value', () => {
    const { document, layer, edit } = fixture([[4, 4]])
    const before = layer.pixels.slice()
    const source = readLayerPacked(document, layer, 40)
    recordPixel(document, layer, edit, 40, 0)
    recordPixel(document, layer, edit, 40, source)
    expect(smoothChangedLiquifyPixels(document, layer, edit, null)).toBe(false)
    expect(layer.pixels).toEqual(before)
  })

  it('respects liquify smoothing strength', () => {
    for (const strength of [0, 100]) {
      const points = [[1, 1], [7, 7]]
      for (let y = 3; y <= 6; y++) for (let x = 3; x <= 7; x++) points.push([x, y])
      const { document, layer, edit } = fixture(points)
      const source = readLayerPacked(document, layer, 10)
      recordPixel(document, layer, edit, 10, 0)
      recordPixel(document, layer, edit, 2 * 9 + 5, source)
      expect(smoothChangedLiquifyPixels(document, layer, edit, null, strength)).toBe(strength === 100)
      expect(readLayerColorAt(document, layer, 5, 2).a).toBe(strength === 0 ? 255 : 0)
      expect(readLayerColorAt(document, layer, 7, 7)).toEqual(color)
    }
  })

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

  it('100% is substantially stronger than 75% while 50% keeps the baseline', () => {
    const points: number[][] = []
    for (let y = 1; y <= 7; y++) for (let x = 1; x <= 7; x++) points.push([x, y])
    const opaqueCounts = [50, 75, 100].map((strength) => {
      const { document, layer, stroke, edit } = fixture(points)
      collectSmoothBrushArea(document, stroke, { x: 4, y: 4 }, { x: 4, y: 4 }, 16, null)
      applySmoothBrush(document, layer, edit, stroke, null, strength)
      let opaque = 0
      for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
        if (readLayerColorAt(document, layer, x, y).a > 0) opaque++
      }
      return opaque
    })
    expect(opaqueCounts[0]).toBeGreaterThan(opaqueCounts[1])
    expect(opaqueCounts[1]).toBeGreaterThan(opaqueCounts[2])
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
