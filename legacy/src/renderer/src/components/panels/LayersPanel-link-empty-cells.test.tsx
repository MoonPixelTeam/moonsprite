import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { activateAnimationFrame, addBlankAnimationFrame, animationCelAt, animationCelKey, connectAnimationCels, resolveAnimationCel, syncActiveAnimationFrame } from '@/core/animation'
import { createDocument, createLayer, writeLayerColor } from '@/core/document'
import { useWorkspace } from '@/store/workspace'
import { LayersPanel } from './LayersPanel'

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('moonSprite', { getResourceInfo: vi.fn().mockResolvedValue({ totalBytes: 8e9, freeBytes: 4e9 }) })
  useWorkspace.setState({ sessions: [], activeId: null, message: null, dialog: null })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it.each([
  { sparse: false, linked: false, shift: false }, { sparse: true, linked: false, shift: false },
  { sparse: false, linked: true, shift: false }, { sparse: true, linked: true, shift: false },
  { sparse: false, linked: false, shift: true }, { sparse: true, linked: true, shift: true },
  { sparse: false, linked: false, shift: false, ctrl: true }, { sparse: true, linked: true, shift: false, ctrl: true }
])('fills the missing middle cel into one continuous 1-3 block ($sparse, $linked, $shift, $ctrl)', ({ sparse, linked, shift, ctrl }) => {
  const document = createDocument('1 content, 2 empty, 3 content', 1, 1, 'rgba')
  const layer = document.layers[0]
  writeLayerColor(document, layer, 0, { r: 255, g: 0, b: 0, a: 255 })
  addBlankAnimationFrame(document)
  addBlankAnimationFrame(document)
  writeLayerColor(document, layer, 0, { r: 0, g: 0, b: 255, a: 255 })
  syncActiveAnimationFrame(document)
  activateAnimationFrame(document, document.animation!.frames[0].id)
  useWorkspace.getState().addSession(document)
  const timeline = document.animation!
  if (linked) connectAnimationCels(document, [timeline.cels[0].id, timeline.cels[2].id])
  if (sparse) timeline.cels = timeline.cels.filter(cel => cel.frameId !== timeline.frames[1].id)
  const keys = timeline.frames.map(frame => animationCelKey(layer.id, frame.id))
  const view = render(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)
  const cell = (index: number) => view.container.querySelector(`[data-animation-cel-key="${keys[index]}"]`)!
  expect(cell(1).querySelector('.cel-content-marker')).toBeNull()
  fireEvent.pointerDown(cell(0), { button: 0, pointerId: 1, clientX: 10, clientY: 50 })
  if (shift || ctrl) {
    fireEvent.pointerUp(cell(0), { button: 0, pointerId: 1, clientX: 10, clientY: 50 })
    fireEvent.pointerDown(cell(2), { button: 0, pointerId: 1, shiftKey: shift, ctrlKey: ctrl, clientX: 80, clientY: 50 })
  } else fireEvent.pointerMove(cell(2), { buttons: 1, pointerId: 1, clientX: 80, clientY: 50 })
  fireEvent.pointerUp(cell(2), { button: 0, pointerId: 1, clientX: 80, clientY: 50 })
  expect(useWorkspace.getState().sessions[0].selectedAnimationCellKeys).toEqual(ctrl ? [keys[0], keys[2]] : keys)
  fireEvent.contextMenu(cell(2))
  fireEvent.click(screen.getByRole('menuitem', { name: /^连接单元格/ }))
  const first = animationCelAt(timeline, layer.id, timeline.frames[0].id)!
  const middle = animationCelAt(timeline, layer.id, timeline.frames[1].id)!
  expect(resolveAnimationCel(timeline, middle)?.id).toBe(first.id)
  expect(Array.from(resolveAnimationCel(timeline, middle)!.surface!.pixels)).toEqual([255, 0, 0, 255])
  view.rerender(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)
  expect(view.container.querySelector('[data-linked-cel-block][data-frame-index="0"][data-frame-span="3"]')).toBeInTheDocument()
  expect(view.container.querySelector('[data-linked-cel-connector]')).toBeNull()
  useWorkspace.getState().undo()
  expect(Array.from(animationCelAt(timeline, layer.id, timeline.frames[1].id)!.surface!.pixels)).toEqual([0, 0, 0, 0])
  useWorkspace.getState().redo()
  expect(resolveAnimationCel(timeline, animationCelAt(timeline, layer.id, timeline.frames[1].id)!)?.id).toBe(first.id)
})

it('does not fill an unselected populated gap or empty cells outside the selected endpoints', () => {
  const document = createDocument('leave unrelated cells intact', 1, 1, 'rgba')
  const layer = document.layers[0]
  writeLayerColor(document, layer, 0, { r: 255, g: 0, b: 0, a: 255 })
  addBlankAnimationFrame(document)
  writeLayerColor(document, layer, 0, { r: 0, g: 255, b: 0, a: 255 })
  addBlankAnimationFrame(document)
  writeLayerColor(document, layer, 0, { r: 0, g: 0, b: 255, a: 255 })
  addBlankAnimationFrame(document)
  useWorkspace.getState().addSession(document)
  const timeline = document.animation!
  useWorkspace.getState().selectAnimationCell(animationCelKey(layer.id, timeline.frames[0].id))
  useWorkspace.getState().selectAnimationCell(animationCelKey(layer.id, timeline.frames[2].id), 'toggle')
  useWorkspace.getState().connectSelectedAnimationCels()
  const gap = animationCelAt(timeline, layer.id, timeline.frames[1].id)!
  expect(gap.linkedCelId).toBeFalsy()
  expect(Array.from(gap.surface!.pixels)).toEqual([0, 255, 0, 255])
  expect(animationCelAt(timeline, layer.id, timeline.frames[3].id)!.linkedCelId).toBeFalsy()
})

it.each([false, true])('links selected empty slots to the content cel from the menu (sparse=%s)', (sparse) => {
  const document = createDocument('fill empty links', 1, 1, 'rgba')
  const layer = document.layers[0]
  addBlankAnimationFrame(document)
  writeLayerColor(document, layer, 0, { r: 255, g: 0, b: 0, a: 255 })
  addBlankAnimationFrame(document)
  addBlankAnimationFrame(document)
  syncActiveAnimationFrame(document)
  useWorkspace.getState().addSession(document)
  const timeline = document.animation!
  const source = animationCelAt(timeline, layer.id, timeline.frames[1].id)!
  for (let index = 0; index < 3; index++) useWorkspace.getState().selectAnimationCell(animationCelKey(layer.id, timeline.frames[index].id), index === 0 ? 'replace' : 'toggle')
  if (sparse) timeline.cels = timeline.cels.filter(cel => cel.id === source.id)
  const selected = [...useWorkspace.getState().sessions[0].selectedAnimationCellKeys]
  expect(selected).toHaveLength(3)
  expect(Array.from(source.surface!.pixels)).toEqual([255, 0, 0, 255])
  const view = render(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)
  // Opening the menu on a selected empty position must keep all selected slots.
  fireEvent.contextMenu(view.container.querySelector(`[data-animation-cel-key="${selected[0]}"]`)!)
  expect(useWorkspace.getState().sessions[0].selectedAnimationCellKeys).toEqual(selected)
  const link = screen.getByRole('menuitem', { name: /^连接单元格/ })
  expect(link).not.toBeDisabled()
  fireEvent.click(link)
  const verifyLinked = () => {
    for (const frame of timeline.frames.slice(0, 3)) {
      const cel = animationCelAt(timeline, layer.id, frame.id)!
      expect(resolveAnimationCel(timeline, cel)?.id).toBe(source.id)
      expect(Array.from(resolveAnimationCel(timeline, cel)!.surface!.pixels)).toEqual([255, 0, 0, 255])
    }
    const outside = animationCelAt(timeline, layer.id, timeline.frames[3].id)!
    expect(outside.linkedCelId).toBeFalsy()
    expect(Array.from(outside.surface!.pixels).every(value => value === 0)).toBe(true)
  }
  verifyLinked()
  useWorkspace.getState().undo()
  for (const index of [0, 2]) {
    const cel = animationCelAt(timeline, layer.id, timeline.frames[index].id)!
    expect(cel.linkedCelId).toBeFalsy()
    expect(Array.from(cel.surface!.pixels).every(value => value === 0)).toBe(true)
  }
  useWorkspace.getState().redo()
  verifyLinked()
})

it('does not enable linking when the only content belongs to a different layer', () => {
  const document = createDocument('cross layer empty links', 1, 1, 'rgba')
  const first = document.layers[0]
  const second = createLayer('Empty', 1, 1, 'rgba')
  document.layers.push(second)
  writeLayerColor(document, first, 0, { r: 255, g: 0, b: 0, a: 255 })
  addBlankAnimationFrame(document)
  useWorkspace.getState().addSession(document)
  const frames = document.animation!.frames
  const keys = [animationCelKey(first.id, frames[0].id), ...frames.map(frame => animationCelKey(second.id, frame.id))]
  keys.forEach((key, index) => useWorkspace.getState().selectAnimationCell(key, index ? 'toggle' : 'replace'))
  const view = render(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)
  fireEvent.contextMenu(view.container.querySelector(`[data-animation-cel-key="${keys[1]}"]`)!)
  expect(screen.getByRole('menuitem', { name: /^连接单元格/ })).toBeDisabled()
})
