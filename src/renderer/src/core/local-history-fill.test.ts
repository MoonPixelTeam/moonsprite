import { expect, it } from 'vitest'
import { createDocument, getActiveLayer, writeLayerPackedRun } from './document'
import { beginPixelEdit, commitPixelEdit } from './history'
import { captureCommittedHistoryDelta, cloneHistoryDocument, hydrateLocalHistoryDelta } from './local-history-delta'

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
