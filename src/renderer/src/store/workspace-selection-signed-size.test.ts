import { animationLayerAtFrame, duplicateAnimationFrame, ensureAnimationDocument } from '@/core/animation'
import { resizeTransformedSelectionBounds } from '@/core/canvas-input-resize'
import { captureSelectionTransform } from '@/core/tools-selection-transform-source'
import { applySelectionTransform } from '@/core/tools-selection-transform-apply'
import { beforeEach, expect, it } from 'vitest'
import { createDocument, getActiveLayer, readLayerColorAt, writeLayerColor } from '@/core/document'
import { useWorkspace } from './workspace'
const red = { r: 255, g: 0, b: 0, a: 255 }
const blue = { r: 0, g: 0, b: 255, a: 255 }
beforeEach(() => { localStorage.clear(); useWorkspace.setState({ sessions: [], activeId: null }) })
it.each(['width', 'height'] as const)('treats signed %s like crossing the opposite drag edge and commits one undo step', axis => {
  const doc = createDocument('signed selection', 8, 8, 'rgba')
  const layer = getActiveLayer(doc)
  writeLayerColor(doc, layer, 3 + 24, red)
  writeLayerColor(doc, layer, axis === 'width' ? 4 + 24 : 3 + 32, blue)
  const original = layer.pixels.slice()
  const store = useWorkspace.getState()
  store.addSession(doc); store.setSelection({ x: 3, y: 3, width: 2, height: 2 })
  store.setSelectionPivot({ x: 3, y: 3 })
  store.updateSelectionProperties({ [axis]: -2 })
  let session = useWorkspace.getState().sessions[0]
  const start = { x: 3, y: 3, width: 2, height: 2 }
  const dragged = resizeTransformedSelectionBounds(start, axis === 'width' ? { x: -4, y: 0 } : { x: 0, y: -4 }, 0, axis === 'width' ? 'e' : 's', false, false, true, { x: 3, y: 3 })
  expect(session.pendingPaste?.transformTarget).toEqual(dragged)
  expect(dragged).toMatchObject(axis === 'width' ? { x: 1, y: 3 } : { x: 3, y: 1 })
  const reference = createDocument('direct drag', 8, 8, 'rgba'); const referenceLayer = getActiveLayer(reference)
  referenceLayer.pixels.set(original)
  const source = captureSelectionTransform(reference, start, referenceLayer)!
  applySelectionTransform(reference, source, dragged, 0, false)
  // Editing the magnitude while still negative must not flip back.
  store.updateSelectionProperties({ [axis]: -3 })
  store.updateSelectionProperties({ [axis]: -2 })
  store.commitFloatingPaste()
  expect(layer.pixels).toEqual(referenceLayer.pixels)
  session = useWorkspace.getState().sessions[0]
  expect(session.history.position).toBe(1)
  store.undo(); expect(layer.pixels).toEqual(original)
  store.redo(); expect(layer.pixels).toEqual(referenceLayer.pixels)
})
it('restores original orientation when the signed width becomes positive', () => {
  const doc = createDocument('restore sign', 8, 1, 'rgba'); const layer = getActiveLayer(doc)
  writeLayerColor(doc, layer, 3, red); writeLayerColor(doc, layer, 4, blue)
  const store = useWorkspace.getState(); store.addSession(doc); store.setSelection({ x: 3, y: 0, width: 2, height: 1 })
  store.updateSelectionProperties({ width: -2 }); store.updateSelectionProperties({ width: 2 }); store.commitFloatingPaste()
  expect(readLayerColorAt(doc, layer, 3, 0)).toEqual(red)
  expect(readLayerColorAt(doc, layer, 4, 0)).toEqual(blue)
})

it('crosses the resize edge for every selected frame and preserves the frame selection through undo', () => {
  const doc = createDocument('frame mirror', 8, 1, 'rgba'); const layer = getActiveLayer(doc)
  writeLayerColor(doc, layer, 3, red); writeLayerColor(doc, layer, 4, blue)
  const timeline = ensureAnimationDocument(doc); const first = timeline.activeFrameId; const second = duplicateAnimationFrame(doc)
  const store = useWorkspace.getState(); store.addSession(doc)
  store.selectAnimationFrame(first); store.selectAnimationFrame(second, 'toggle')
  store.setSelection({ x: 3, y: 0, width: 2, height: 1 }); store.setSelectionPivot({ x: 3, y: 0 }); store.updateSelectionProperties({ width: -2 }); store.commitFloatingPaste()
  for (const frame of [first, second]) expect(readLayerColorAt(doc, animationLayerAtFrame(doc, layer.id, frame)!, 1, 0)).toEqual(blue)
  store.undo()
  for (const frame of [first, second]) expect(readLayerColorAt(doc, animationLayerAtFrame(doc, layer.id, frame)!, 3, 0)).toEqual(red)
  expect(useWorkspace.getState().sessions[0].selectedAnimationFrameIds).toEqual(expect.arrayContaining([first, second]))
})
