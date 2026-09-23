import { expect, it } from 'vitest'
import { applySelectionTransform, captureSelectionTransform } from './tools'
import { revertPixelEdit } from './history'
import { createDocument, getActiveLayer, readLayerColorAt, writeLayerColor } from './document-model'
import { lassoSelection, selectionContains } from './selection'
import { DEFAULT_SYMMETRY_AXES, symmetrySelection, symmetrySelectionDragDelta, transformSymmetrySelection } from './symmetry'

const points = (selection: ReturnType<typeof symmetrySelection>) => {
  const result: string[] = []
  if (selection) for (let y = selection.y; y < selection.y + selection.height; y++)
    for (let x = selection.x; x < selection.x + selection.width; x++)
      if (selectionContains(selection, x, y)) result.push(`${x},${y}`)
  return result.sort()
}
it.each([
  { x: 16, y: 16 }, { x: 20, y: 12 }, { x: 20.5, y: 12 }, { x: 20, y: 12.5 }
])('moves a lasso without fragmenting its mirrored copies around %j', (center) => {
  const doc = createDocument('offset symmetry', 40, 40, 'rgba')
  const axes = { ...DEFAULT_SYMMETRY_AXES, horizontal: true, vertical: true, diagonalDown: true }
  const seed = lassoSelection(doc, [{ x: 22, y: 3 }, { x: 25, y: 3 }, { x: 25, y: 5 }, { x: 23, y: 6 }, { x: 22, y: 5 }])!
  const selection = symmetrySelection(seed, 40, 40, axes, center)!
  const start = { x: 23, y: 4 }, delta = { x: 1, y: 1 }
  const mapped = symmetrySelectionDragDelta(selection, start, delta, 40, 40, axes, center, true)
  const moved = transformSymmetrySelection(selection, { ...selection, x: selection.x + mapped.x, y: selection.y + mapped.y }, 40, 40, 0, undefined, axes, center, true, start)
  const expected = symmetrySelection({ ...seed, x: seed.x + delta.x, y: seed.y + delta.y }, 40, 40, axes, center)
  expect(points(moved)).toEqual(points(expected))
})


it.each([
  { horizontal: true, vertical: true, diagonalDown: true },
  { diagonalUp: true, diagonalDown: true },
  { horizontal: true, rotational: true }
])('keeps moved lasso pixels, the selection preview and undo consistent with axes %j', (enabled) => {
  const doc = createDocument('offset symmetry pixels', 40, 40, 'rgba')
  const layer = getActiveLayer(doc)
  const center = { x: 20.5, y: 12 }
  const axes = { ...DEFAULT_SYMMETRY_AXES, ...enabled }
  const seed = lassoSelection(doc, [{ x: 22, y: 3 }, { x: 25, y: 3 }, { x: 25, y: 5 }, { x: 23, y: 6 }, { x: 22, y: 5 }])!
  const selection = symmetrySelection(seed, 40, 40, axes, center)!
  for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) {
    if (selectionContains(selection, x, y)) writeLayerColor(doc, layer, y * 40 + x, { r: 240, g: 60, b: 20, a: 255 })
  }
  const before = layer.pixels.slice()
  const source = captureSelectionTransform(doc, selection, layer)!
  // Preview updates restore captured pixels between pointer positions.
  for (const delta of [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: -1, y: 0 }]) {
    const start = { x: 23, y: 4 }
    const mapped = symmetrySelectionDragDelta(selection, start, delta, 40, 40, axes, center, true)
    const target = { ...selection, x: selection.x + mapped.x, y: selection.y + mapped.y }
    const expected = symmetrySelection({ ...seed, x: seed.x + delta.x, y: seed.y + delta.y }, 40, 40, axes, center)
    const preview = transformSymmetrySelection(selection, target, 40, 40, 0, undefined, axes, center, true, start)
    const edit = applySelectionTransform(doc, source, target, 0, false, undefined, axes, center, layer, start)!
    expect(edit).not.toBeNull()
    const painted: string[] = []
    for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) {
      if (readLayerColorAt(doc, layer, x, y).a) painted.push(`${x},${y}`)
    }
    expect(painted.sort()).toEqual(points(expected))
    expect(points(preview)).toEqual(points(expected))
    revertPixelEdit(doc, edit)
    expect(layer.pixels).toEqual(before)
  }
})
