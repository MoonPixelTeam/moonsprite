import { beforeEach, expect, it } from 'vitest'
import { activateAnimationFrame, addBlankAnimationFrame, animationCelAt, animationCelKey, ensureAnimationDocument, linkAnimationFrameCels, resolveAnimationCel } from '@/core/animation'
import { createDocument, createLayer, readLayerPacked, writeLayerColor } from '@/core/document'
import { useWorkspace } from './workspace'

beforeEach(() => {
  localStorage.clear()
  useWorkspace.setState({ sessions: [], activeId: null, message: null, dialog: null })
})

function setup() {
  const document = createDocument('reverse', 1, 1, 'rgba')
  document.layers.push(createLayer('second', 1, 1, 'rgba'))
  const timeline = ensureAnimationDocument(document)
  for (let i = 0; i < 4; i++) addBlankAnimationFrame(document)
  const frames = timeline.frames.map(frame => frame.id)
  frames.forEach((id, i) => {
    activateAnimationFrame(document, id)
    document.layers.forEach((layer, row) => writeLayerColor(document, layer, 0, { r: i + 1 + row * 10, g: 0, b: 0, a: 255 }))
    timeline.frames[i].duration = 100 + i * 10
  })
  activateAnimationFrame(document, frames[0])
  useWorkspace.getState().addSession(document)
  const session = useWorkspace.getState().sessions[0]
  const select = (rows: number[], indexes: number[]) => {
    session.selectedAnimationCellKeys = rows.flatMap(row => indexes.map(i => animationCelKey(document.layers[row].id, frames[i])))
    session.animationCellSelectionExplicit = true
  }
  const values = (row = 0) => frames.map(id => resolveAnimationCel(timeline, animationCelAt(timeline, document.layers[row].id, id))?.surface?.pixels[0] ?? 0)
  return { document, timeline, frames, session, select, values }
}

it('reverses five cels per row in time order and restores pixels with undo and redo', () => {
  const view = setup()
  view.select([0, 1], [4, 1, 3, 0, 2])
  const keys = [...view.session.selectedAnimationCellKeys]
  const history = view.session.history.length
  useWorkspace.getState().reverseSelectedAnimationCels()
  expect(view.values()).toEqual([5, 4, 3, 2, 1])
  expect(view.values(1)).toEqual([15, 14, 13, 12, 11])
  expect(readLayerPacked(view.document, view.document.layers[0], 0) & 255).toBe(5)
  expect(view.timeline.frames.map(frame => frame.duration)).toEqual([100, 110, 120, 130, 140])
  expect(view.session.history.length).toBe(history + 1)
  expect(view.session.selectedAnimationCellKeys).toEqual(keys)
  useWorkspace.getState().undo()
  expect(view.values()).toEqual([1, 2, 3, 4, 5])
  useWorkspace.getState().redo()
  expect(view.values()).toEqual([5, 4, 3, 2, 1])
})

it('preserves unselected slots, other rows and links to a moved cel', () => {
  const view = setup()
  const layer = view.document.layers[0]
  linkAnimationFrameCels(view.document, view.frames[0], view.frames[1], [layer.id])
  view.select([0], [4, 0])
  useWorkspace.getState().reverseSelectedAnimationCels()
  expect(view.values()).toEqual([5, 1, 3, 4, 1])
  expect(view.values(1)).toEqual([11, 12, 13, 14, 15])
  expect(animationCelAt(view.timeline, layer.id, view.frames[1])?.linkedCelId).toBe(animationCelAt(view.timeline, layer.id, view.frames[4])?.id)
  useWorkspace.getState().undo()
  expect(view.values()).toEqual([1, 1, 3, 4, 5])
  useWorkspace.getState().redo()
  expect(view.values()).toEqual([5, 1, 3, 4, 1])
})

it('includes blank cells in the reversal', () => {
  const view = setup()
  const blank = addBlankAnimationFrame(view.document)
  view.session.selectedAnimationCellKeys = [animationCelKey(view.document.layers[0].id, view.frames[0]), animationCelKey(view.document.layers[0].id, blank)]
  useWorkspace.getState().reverseSelectedAnimationCels()
  expect(view.values()[0]).toBe(0)
  expect(animationCelAt(view.timeline, view.document.layers[0].id, blank)?.surface?.pixels[0]).toBe(1)
  useWorkspace.getState().undo()
  expect(view.values()[0]).toBe(1)
})

it('does nothing for single slots and rejects changes to locked layers', () => {
  const view = setup()
  const history = view.session.history.length
  view.select([0, 1], [0])
  useWorkspace.getState().reverseSelectedAnimationCels()
  view.select([0], [0, 4])
  view.document.layers[0].locked = true
  useWorkspace.getState().reverseSelectedAnimationCels()
  expect(view.values()).toEqual([1, 2, 3, 4, 5])
  expect(view.session.history.length).toBe(history)
})

it.each([{ indexes: [0, 1, 2, 3, 4] }, { indexes: [0, 2, 4] }])('reverses selected frames with duration and preserves loop positions: $indexes', ({ indexes }) => {
  const view = setup()
  const original = [...view.timeline.frames]
  view.timeline.loopSections = [{ id: 'loop', name: 'loop', startFrameId: view.frames[0], endFrameId: view.frames[2], direction: 'forward', repeatCount: 2 }]
  view.session.selectedAnimationFrameIds = indexes.map(i => view.frames[i])
  const history = view.session.history.length
  useWorkspace.getState().reverseSelectedAnimationFrames()
  const expected = [...original]
  indexes.forEach((index, i) => { expected[index] = original[indexes[indexes.length - 1 - i]] })
  expect(view.timeline.frames).toEqual(expected)
  expect(view.values()).toEqual([1, 2, 3, 4, 5])
  expect(view.timeline.loopSections?.[0]).toMatchObject({ startFrameId: expected[0].id, endFrameId: expected[2].id })
  expect(view.session.history.length).toBe(history + 1)
  useWorkspace.getState().undo()
  expect(view.timeline.frames).toEqual(original)
  expect(view.timeline.loopSections?.[0].startFrameId).toBe(view.frames[0])
  useWorkspace.getState().redo()
  expect(view.timeline.frames).toEqual(expected)
})
