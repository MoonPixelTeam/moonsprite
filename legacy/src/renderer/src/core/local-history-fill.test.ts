import { expect, it } from 'vitest'
import { createDocument, getActiveLayer, writeLayerPackedRun } from './document'
import { beginPixelEdit, commitPixelEdit } from './history'
import { captureCommittedHistoryDelta, cloneHistoryDocument, hydrateLocalHistoryDelta } from './local-history-delta'
import { floodFill, floodFillSymmetric } from './tools-fill'
import { syncActiveAnimationLayer } from './animation'

it('persists dev typed fill points combined with beta8 overlapping symmetry undo', () => {
  const document = createDocument('typed symmetry journal', 512, 512, 'rgba')
  const layer = getActiveLayer(document), before = layer.pixels.slice()
  const color = { r: 40, g: 90, b: 180, a: 128 }
  const options = { sourceColorAt: () => ({ r: 0, g: 0, b: 0, a: 0 }) }
  const probe = cloneHistoryDocument(document)
  const single = floodFill(probe, probe.layers[0], 100, 100, color, null, false, null, 1, undefined, 'grain', 1, 0, 'paint', 0, 0, undefined, options)!
  expect(single.points?.count).toBeGreaterThan(0)
  const edit = floodFillSymmetric(document, layer, 100, 100, color, null, false, null, 1, undefined, 'grain', 1, 0, 'paint', { horizontal: false, vertical: true, diagonalUp: false, diagonalDown: false }, undefined, 0, 0, undefined, options)!
  expect(edit.before.size).toBe(0)
  expect(edit.runs!.length).toBeGreaterThan(single.points!.count)
  syncActiveAnimationLayer(document, layer.id)
  const after = layer.pixels.slice(), committed = commitPixelEdit(document, edit, 'symmetry fill', true)!
  const delta = captureCommittedHistoryDelta(document, committed)!
  expect(delta).not.toBeNull()
  const reopened = cloneHistoryDocument(document), restored = hydrateLocalHistoryDelta(reopened, structuredClone(delta))
  restored.undo()
  expect(reopened.layers[0].pixels.every((value, index) => value === before[index])).toBe(true)
  restored.redo()
  expect(reopened.layers[0].pixels.every((value, index) => value === after[index])).toBe(true)
})

it('restores overlapping fill runs after reopening a persistent history delta', () => {
  const document = createDocument('persistent fill', 4, 1, 'rgba')
  const layer = getActiveLayer(document)
  const before = layer.pixels.slice()
  const edit = beginPixelEdit(layer.id)
  edit.runs = [
    { index: 0, length: 4, before: 0, after: 0xff3131ac },
    { index: 1, length: 2, before: 0xff3131ac, after: 0xffd2d2f0 }
  ]
  for (const run of edit.runs) writeLayerPackedRun(document, layer, run.index, run.length, run.after)
  const after = layer.pixels.slice()
  const committed = commitPixelEdit(document, edit, 'fill', true)!
  const delta = captureCommittedHistoryDelta(document, committed)!
  expect(delta).not.toBeNull()
  const reopened = cloneHistoryDocument(document)
  const restored = hydrateLocalHistoryDelta(reopened, structuredClone(delta))
  for (let cycle = 0; cycle < 3; cycle++) {
    restored.undo()
    expect(Array.from(reopened.layers[0].pixels)).toEqual(Array.from(before))
    restored.redo()
    expect(Array.from(reopened.layers[0].pixels)).toEqual(Array.from(after))
  }
})
