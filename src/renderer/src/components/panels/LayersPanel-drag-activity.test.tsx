import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { activateAnimationFrame, addBlankAnimationFrame, animationCelKey } from '@/core/animation'
import { createDocument, createLayer, readLayerColor, writeLayerColor } from '@/core/document'
import { useWorkspace } from '@/store/workspace'
import { LayersPanel } from './LayersPanel'

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('moonSprite', { getResourceInfo: vi.fn().mockResolvedValue({ totalBytes: 8e9, freeBytes: 4e9 }) })
  useWorkspace.setState({ sessions: [], activeId: null, message: null, dialog: null })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it.each(['frame', 'cel', 'group-cel'] as const)('previews %s range pixels before release and restores the frame on cancellation', (kind) => {
  const document = createDocument('live frame preview', 1, 1, 'rgba')
  const layer = document.layers[0]
  document.groups.push({ id: 'group', name: 'Group', visible: true, locked: false, opacity: 1, blendMode: 'normal' })
  layer.groupId = 'group'
  const colors = [
    { r: 255, g: 0, b: 0, a: 255 },
    { r: 0, g: 255, b: 0, a: 255 },
    { r: 0, g: 0, b: 255, a: 255 }
  ]
  colors.forEach((color, index) => {
    if (index > 0) addBlankAnimationFrame(document)
    writeLayerColor(document, layer, 0, color)
  })
  const frames = document.animation!.frames
  activateAnimationFrame(document, frames[0].id)
  useWorkspace.getState().addSession(document)
  const initial = useWorkspace.getState().sessions[0]
  const contentRevision = initial.contentRevision
  const historyPosition = initial.history.position
  const view = render(<LayersPanel session={initial} docked />)
  const target = (index: number) => view.container.querySelector(kind === 'frame'
    ? `[data-animation-frame-id="${frames[index].id}"]`
    : `[data-animation-${kind}-key="${animationCelKey(kind === 'group-cel' ? 'group' : layer.id, frames[index].id)}"]`)!
  const begin = () => fireEvent.pointerDown(target(0), { button: 0, pointerId: 1, clientX: 10, clientY: 50 })
  const move = (index: number) => fireEvent.pointerMove(target(index), { buttons: 1, pointerId: 1, clientX: 15 + index * 28, clientY: 50 })
  begin()
  for (const index of [1, 2, 1, 0, 1]) {
    move(index)
    const active = useWorkspace.getState().sessions[0]
    expect(active.document.animation!.activeFrameId).toBe(frames[index].id)
    expect(readLayerColor(active.document, active.document.layers[0], 0)).toEqual(colors[index])
    expect(active.contentRevision).toBe(contentRevision)
    expect(active.history.position).toBe(historyPosition)
  }
  fireEvent.pointerCancel(window, { pointerId: 1 })
  expect(document.animation!.activeFrameId).toBe(frames[0].id)
  expect(readLayerColor(document, layer, 0)).toEqual(colors[0])
  begin()
  move(1)
  fireEvent.pointerUp(target(1), { button: 0, pointerId: 1 })
  expect(document.animation!.activeFrameId).toBe(frames[1].id)
  expect(readLayerColor(document, layer, 0)).toEqual(colors[1])
  const selected = useWorkspace.getState().sessions[0]
  if (kind === 'frame') expect(selected.selectedAnimationFrameIds).toEqual(frames.slice(0, 2).map((frame) => frame.id))
  if (kind === 'cel') expect(selected.selectedAnimationCellKeys).toEqual(frames.slice(0, 2).map((frame) => animationCelKey(layer.id, frame.id)))
})

it.each([false, true])('keeps every traversed frame active before releasing a cel range drag (group=%s)', (group) => {
  const document = createDocument('drag activity', 1, 1, 'rgba')
  const layer = document.layers[0]
  if (group) {
    document.groups.push({ id: 'group', name: 'Group', visible: true, locked: false, opacity: 1, blendMode: 'normal' })
    layer.groupId = 'group'
  }
  document.layers.push(createLayer('Other row', 1, 1, 'rgba'))
  writeLayerColor(document, layer, 0, { r: 255, g: 0, b: 0, a: 255 })
  for (let i = 1; i < 5; i++) addBlankAnimationFrame(document)
  const frames = document.animation!.frames
  activateAnimationFrame(document, frames[0].id)
  useWorkspace.getState().addSession(document)
  const view = render(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)
  const cell = (i: number) => view.container.querySelector(`[data-animation-${group ? 'group-cel' : 'cel'}-key="${animationCelKey(group ? 'group' : layer.id, frames[i].id)}"]`)!
  fireEvent.pointerDown(cell(0), { button: 0, pointerId: 1, clientX: 10, clientY: 50 })
  for (let end = 1; end < 5; end++) {
    fireEvent.pointerMove(cell(end), { buttons: 1, pointerId: 1, clientX: 10 + end * 28, clientY: 50 })
    for (let index = 0; index <= end; index++) {
      expect(view.container.querySelector(`[data-animation-frame-id="${frames[index].id}"]`)).toHaveClass('active')
    }
  }
  fireEvent.pointerUp(cell(4), { button: 0, pointerId: 1 })
})
