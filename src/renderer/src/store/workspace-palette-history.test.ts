import { afterEach, beforeEach, expect, it } from 'vitest'
import { createDocument } from '@/core/document-model'
import { useWorkspace } from './workspace'

const red = { r: 240, g: 20, b: 10, a: 255 }
const blue = { r: 10, g: 20, b: 240, a: 255 }
const session = () => useWorkspace.getState().sessions[0]
const snapshot = () => ({
  palette: session().document.palette.map(entry => ({ ...entry, color: { ...entry.color } })),
  slots: [...session().document.paletteSlots!], order: [...session().document.paletteOrder],
  nextColorId: session().document.nextColorId
})

beforeEach(() => {
  localStorage.clear()
  useWorkspace.setState({ sessions: [], activeId: null })
  const document = createDocument('palette history', 1, 1, 'rgba')
  document.palette = [red, blue].map((color, index) => ({ id: index + 1, name: `Color ${index}`, color: { ...color } }))
  document.paletteOrder = [1, 2]
  document.paletteSlots = [1, 2, null, null]
  document.paletteColumns = 4
  document.nextColorId = 3
  useWorkspace.getState().addSession(document)
  useWorkspace.getState().selectPaletteColors([], -1)
})
afterEach(() => { useWorkspace.setState({ sessions: [], activeId: null }); localStorage.clear() })

it('records adding and positioning a color as one history entry', () => {
  const store = useWorkspace.getState()
  const before = snapshot(), position = session().history.position
  const id = store.addPaletteColor(red, { slots: [...before.slots], columns: 4, indices: [18] })!
  expect(session().document.paletteSlots?.[18]).toBe(id)
  expect(session().history.position).toBe(position + 1)
  expect(session().history.timeline.entries.at(-1)?.label).toBeTruthy()
  const after = snapshot()
  store.undo()
  expect(snapshot()).toEqual(before)
  store.redo()
  expect(snapshot()).toEqual(after)
})

it('overwrites occupied targets and fills empty targets without touching other slots', () => {
  const store = useWorkspace.getState(), before = snapshot()
  const position = session().history.position
  const ids = store.pastePaletteColors([red, blue, blue], { slots: before.slots, columns: 4, indices: [1, 8, 9] })
  expect(ids).toEqual([2, 3, 4])
  expect(session().document.paletteSlots?.[0]).toBe(1)
  expect(session().document.paletteSlots?.slice(8, 10)).toEqual([3, 4])
  expect(session().document.palette.find(entry => entry.id === 2)?.color).toEqual(red)
  expect(session().history.position).toBe(position + 1)
  const after = snapshot()
  store.undo()
  expect(snapshot()).toEqual(before)
  store.redo()
  expect(snapshot()).toEqual(after)
})

it('bounds a paste to the supplied rectangle and ignores identical overwrites in history', () => {
  const store = useWorkspace.getState(), position = session().history.position
  store.pastePaletteColors([red, blue, red], { slots: [1, 2, null, null], columns: 4, indices: [0, 1] })
  expect(session().history.position).toBe(position)
  expect(session().document.paletteOrder).toEqual([1, 2])
})

it('records appending duplicate transparent colors and restores the color allocator', () => {
  const store = useWorkspace.getState(), before = snapshot()
  const transparent = { r: 0, g: 0, b: 0, a: 0 }
  expect(store.pastePaletteColors([transparent, transparent])).toEqual([3, 4])
  const after = snapshot()
  store.undo()
  expect(snapshot()).toEqual(before)
  store.redo()
  expect(snapshot()).toEqual(after)
})

it('replays color edits correctly across paste undo and redo', () => {
  const store = useWorkspace.getState(), before = snapshot()
  store.updatePaletteColor(1, blue)
  store.selectPaletteColors([1], 1)
  store.pastePaletteColors([red])
  const after = snapshot()
  store.undo()
  expect(session().document.palette[0].color).toEqual(blue)
  store.undo()
  expect(snapshot()).toEqual(before)
  store.redo()
  store.redo()
  expect(snapshot()).toEqual(after)
})
