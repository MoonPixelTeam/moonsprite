import { afterEach, expect, it } from 'vitest'
import { createDocument, getActiveLayer } from '@/core/document-model'
import { animationCelKey, ensureAnimationDocument } from '@/core/animation'
import { writeLayerColor } from '@/core/document'
import { useWorkspace } from './workspace'

afterEach(() => useWorkspace.setState({ sessions: [], activeId: null }))
function setup() {
  const document = createDocument('drag copy', 2, 1, 'rgba')
  const layer = getActiveLayer(document)
  writeLayerColor(document, layer, 0, { r: 255, g: 0, b: 0, a: 255 })
  useWorkspace.getState().addSession(document)
  for (let i = 0; i < 3; i++) useWorkspace.getState().duplicateAnimationFrame()
  return { document, layer, timeline: ensureAnimationDocument(document), commands: useWorkspace.getState() }
}

it('restores the frame selection context when undoing a frame move', () => {
  const { timeline, commands } = setup()
  const ids = timeline.frames.map(frame => frame.id)
  commands.selectAnimationFrame(ids[0], 'replace')
  commands.selectAnimationFrame(ids[1], 'toggle')
  commands.setActiveAnimationFrame(ids[1])
  const session = useWorkspace.getState().sessions[0]
  const before = {
    selected: [...session.selectedAnimationFrameIds],
    anchor: session.animationFrameSelectionAnchorId,
    active: timeline.activeFrameId,
    activeLayer: session.document.activeLayerId
  }
  commands.moveSelectedAnimationFrames(ids[3], true)
  commands.undo()
  expect(session.selectedAnimationFrameIds).toEqual(before.selected)
  expect(session.animationFrameSelectionAnchorId).toBe(before.anchor)
  expect(timeline.activeFrameId).toBe(before.active)
  expect(session.document.activeLayerId).toBe(before.activeLayer)
})

it('copies a multi-cel block without clearing sources and supports undo/redo', () => {
  const { document, layer, timeline, commands } = setup()
  const keys = timeline.frames.map(frame => animationCelKey(layer.id, frame.id))
  commands.selectAnimationCell(keys[0])
  commands.selectAnimationCell(keys[1], 'toggle')
  const before = timeline.cels.map(cel => Array.from(cel.surface!.pixels))
  commands.moveSelectedAnimationCels(layer.id, timeline.frames[2].id, keys[0], true)
  expect(timeline.cels.map(cel => Array.from(cel.surface!.pixels))).toEqual(before)
  expect(useWorkspace.getState().sessions[0].selectedAnimationCellKeys).toEqual(keys.slice(2))
  expect(timeline.cels[0].surface!.pixels).not.toBe(timeline.cels[2].surface!.pixels)
  commands.undo()
  expect(useWorkspace.getState().sessions[0].selectedAnimationCellKeys).toEqual(keys.slice(0, 2))
  commands.redo()
  expect(ensureAnimationDocument(document).frames).toHaveLength(4)
  expect(useWorkspace.getState().sessions[0].selectedAnimationCellKeys).toEqual(keys.slice(2))
})

it('inserts selected frame copies without touching clipboard and undoes in one step', () => {
  const { timeline, commands } = setup()
  const ids = timeline.frames.map(frame => frame.id)
  commands.selectAnimationFrame(ids[0], 'replace')
  commands.selectAnimationFrame(ids[1], 'toggle')
  const clipboard = useWorkspace.getState().sessions[0].animationFrameClipboard
  commands.pasteAnimationFrames({ frameId: ids[3], insertAfter: true })
  expect(timeline.frames).toHaveLength(6)
  expect(timeline.frames.slice(0, 4).map(frame => frame.id)).toEqual(ids)
  expect(useWorkspace.getState().sessions[0].animationFrameClipboard).toEqual(clipboard)
  expect(useWorkspace.getState().sessions[0].selectedAnimationFrameIds).toEqual(timeline.frames.slice(4).map(frame => frame.id))
  commands.undo()
  expect(timeline.frames.map(frame => frame.id)).toEqual(ids)
  commands.redo()
  expect(timeline.frames).toHaveLength(6)
})
