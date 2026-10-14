import { afterEach, expect, it, vi } from 'vitest'
import { createDocument } from './document'
import { beginPixelEdit, commitPixelEdit } from './history'
import { paintBrush, paintLine } from './tools-brush'
import { paintBrush as paintBrushReference } from './__fixtures__/p01-brush-reference'
import * as symmetry from './symmetry'

afterEach(() => vi.restoreAllMocks())

it.each(['round', 'square', 'line'] as const)('preserves translucent %s coverage, pressure, symmetry and history', shape => {
  const document = createDocument('span brush', 160, 160, 'rgba')
  const reference = createDocument('per-pixel brush', 160, 160, 'rgba')
  const layer = document.layers[0], referenceLayer = reference.layers[0]
  for (let i = 0; i < layer.pixels.length; i++) layer.pixels[i] = (i * 13) % 256
  referenceLayer.pixels.set(layer.pixels)
  const before = layer.pixels.slice()
  const edit = beginPixelEdit(layer.id), referenceEdit = beginPixelEdit(referenceLayer.id)
  const axes = { horizontal: true, vertical: true, diagonalUp: false, diagonalDown: false }
  const selection = { x: 0, y: 0, width: 160, height: 160 }
  for (const size of [45, 128]) for (const [x, y, opacity] of [[70, 75, 0.3], [72, 76, 0.3], [74, 76, 0.8], [70, 75, 0.5], [-4, 20, 1]]) {
    const color = { r: 230, g: 30, b: 40, a: 128 }
    paintBrush(document, layer, edit, x, y, size, color, shape, null, 'solid', 1, null, undefined, 0, 'paint', undefined, axes, undefined, undefined, opacity)
    // Frozen pre-P01 implementation keeps this an independent pixel reference.
    paintBrushReference(reference, referenceLayer, referenceEdit, x, y, size, color, shape, selection, 'solid', 1, null, undefined, 0, 'paint', undefined, axes, undefined, undefined, opacity)
    expect(layer.pixels.every((value, index) => value === referenceLayer.pixels[index])).toBe(true)
  }
  const after = layer.pixels.slice()
  const entry = commitPixelEdit(document, edit, 'translucent stroke')!
  entry.undo()
  expect(layer.pixels.every((value, index) => value === before[index])).toBe(true)
  entry.redo()
  expect(layer.pixels.every((value, index) => value === after[index])).toBe(true)
})

it('avoids per-pixel symmetry traversal for translucent pointer segments', () => {
  const document = createDocument('translucent pointer', 1280, 1280, 'rgba')
  const layer = document.layers[0]
  const points = vi.spyOn(symmetry, 'symmetryPoints')
  paintLine(document, layer, beginPixelEdit(layer.id), 300, 300, 340, 310, 128, { r: 230, g: 30, b: 40, a: 128 }, null, 'round')
  expect(points.mock.calls.length).toBeLessThan(100)
  expect(layer.pixels.some(value => value !== 0)).toBe(true)
})
