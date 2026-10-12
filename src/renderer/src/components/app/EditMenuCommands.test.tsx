import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createDocument, createLayer, getActiveLayer, writeLayerColor } from '@/core/document'
import { addBlankAnimationFrame, animationCelAt, animationCelKey, ensureAnimationDocument } from '@/core/animation'
import { useWorkspace } from '@/store/workspace'
import { EditMenuCommands } from './EditMenuCommands'

beforeEach(() => useWorkspace.setState({ sessions: [], activeId: null }))
afterEach(() => { cleanup(); vi.restoreAllMocks(); useWorkspace.setState({ sessions: [], activeId: null }) })

function fixture() {
  const document = createDocument('Delete cels', 2, 1, 'rgba')
  const layer = getActiveLayer(document)
  const other = createLayer('Other layer', 2, 1, 'rgba')
  document.layers.push(other)
  writeLayerColor(document, layer, 0, { r: 255, g: 0, b: 0, a: 255 })
  writeLayerColor(document, other, 1, { r: 0, g: 0, b: 255, a: 255 })
  const timeline = ensureAnimationDocument(document)
  const first = timeline.activeFrameId
  const second = addBlankAnimationFrame(document)
  writeLayerColor(document, layer, 1, { r: 0, g: 255, b: 0, a: 255 })
  writeLayerColor(document, other, 0, { r: 255, g: 255, b: 0, a: 255 })
  useWorkspace.getState().addSession(document)
  const close = vi.fn()
  const view = render(<EditMenuCommands shortcutFor={() => ''} closeMenu={close} onOpenOutline={() => {}} pasteSpecial={null} />)
  return { document, timeline, layer, other, first, second, close, remove: () => fireEvent.click(view.getByRole('button', { name: '删除' })) }
}

it.each([false, true])('deletes only the selected timeline cells and preserves layers, frames and undo (multiple=%s)', multiple => {
  const f = fixture()
  const store = useWorkspace.getState()
  const keys = [animationCelKey(f.layer.id, f.first)]
  store.selectAnimationCell(keys[0])
  if (multiple) {
    keys.push(animationCelKey(f.other.id, f.second))
    store.selectAnimationCell(keys[1], 'toggle')
  }
  const before = new Map(f.timeline.cels.map(cel => [animationCelKey(cel.layerId, cel.frameId), cel.surface!.pixels.slice()]))
  const layers = f.document.layers.map(layer => layer.id)
  const frames = f.timeline.frames.map(frame => frame.id)
  const deleteLayer = vi.spyOn(store, 'deleteActiveLayer')
  f.remove()
  expect(deleteLayer).not.toHaveBeenCalled()
  expect(f.close).toHaveBeenCalledOnce()
  expect(f.document.layers.map(layer => layer.id)).toEqual(layers)
  expect(f.timeline.frames.map(frame => frame.id)).toEqual(frames)
  for (const cel of f.timeline.cels) {
    const key = animationCelKey(cel.layerId, cel.frameId)
    if (keys.includes(key)) expect(cel.surface!.pixels.every(value => value === 0)).toBe(true)
    else expect(cel.surface!.pixels).toEqual(before.get(key))
  }
  store.undo()
  for (const key of keys) {
    expect(f.timeline.cels.find(cel => animationCelKey(cel.layerId, cel.frameId) === key)!.surface!.pixels).toEqual(before.get(key))
  }
  store.redo()
  expect(animationCelAt(f.timeline, f.layer.id, f.first)!.surface!.pixels.every(value => value === 0)).toBe(true)
})

it('keeps canvas pixel selections ahead of a timeline selection', () => {
  const f = fixture()
  const store = useWorkspace.getState()
  store.selectAnimationCell(animationCelKey(f.layer.id, f.first))
  store.mutateActive(session => { session.selection = { x: 0, y: 0, width: 1, height: 1 } }, false)
  const current = useWorkspace.getState()
  const pixels = vi.spyOn(current, 'deleteSelection').mockImplementation(() => {})
  const cels = vi.spyOn(current, 'deleteSelectedAnimationItems').mockImplementation(() => {})
  const layers = vi.spyOn(current, 'deleteActiveLayer').mockImplementation(() => {})
  f.remove()
  expect(pixels).toHaveBeenCalledOnce()
  expect(cels).not.toHaveBeenCalled()
  expect(layers).not.toHaveBeenCalled()
})

it('deletes selected frames without deleting their layers', () => {
  const f = fixture()
  useWorkspace.getState().selectAnimationFrame(f.first)
  const layers = f.document.layers.map(layer => layer.id)
  f.remove()
  expect(f.timeline.frames.map(frame => frame.id)).toEqual([f.second])
  expect(f.document.layers.map(layer => layer.id)).toEqual(layers)
  useWorkspace.getState().undo()
  expect(f.timeline.frames.map(frame => frame.id)).toEqual([f.first, f.second])
})

it('retains layer deletion when a layer is explicitly selected', () => {
  const f = fixture()
  useWorkspace.getState().selectLayer(f.other.id)
  f.remove()
  expect(f.document.layers.map(layer => layer.id)).toEqual([f.layer.id])
})
