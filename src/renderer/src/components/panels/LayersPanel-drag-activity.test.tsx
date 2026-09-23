import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { activateAnimationFrame, addBlankAnimationFrame, animationCelKey } from '@/core/animation'
import { createDocument, createLayer, readLayerColor, writeLayerColor } from '@/core/document'
import { useWorkspace } from '@/store/workspace'
import { LayersPanel } from './LayersPanel'

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  vi.stubGlobal('moonSprite', { getResourceInfo: vi.fn().mockResolvedValue({ totalBytes: 8e9, freeBytes: 4e9 }) })
  useWorkspace.setState({ sessions: [], activeId: null, message: null, dialog: null })
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

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
    act(() => { vi.advanceTimersByTime(17) })
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


it('coalesces canvas frame updates while the selection follows every pointer target', () => {
  const doc = createDocument('coalesced preview', 1, 1, 'rgba')
  for (let i = 0; i < 3; i++) addBlankAnimationFrame(doc)
  const frames = doc.animation!.frames
  activateAnimationFrame(doc, frames[0].id)
  useWorkspace.getState().addSession(doc)
  const view = render(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)
  const header = (i: number) => view.container.querySelector(`[data-animation-frame-id="${frames[i].id}"]`)!
  const switchFrame = vi.spyOn(useWorkspace.getState(), 'setActiveAnimationFrame')
  fireEvent.pointerDown(header(0), {button: 0, clientX: 10, clientY: 10})
  for (let i = 1; i < frames.length; i++) fireEvent.pointerMove(header(i), {buttons: 1, clientX: 10 + i * 28, clientY: 10})
  expect(header(3)).toHaveClass('active')
  expect(switchFrame).not.toHaveBeenCalled()
  act(() => { vi.advanceTimersByTime(17) })
  expect(switchFrame).toHaveBeenCalledTimes(1)
  expect(doc.animation!.activeFrameId).toBe(frames[3].id)
  fireEvent.pointerCancel(window)
  expect(doc.animation!.activeFrameId).toBe(frames[0].id)
  act(() => { vi.advanceTimersByTime(17) })
  expect(doc.animation!.activeFrameId).toBe(frames[0].id)
})

it('moves a selected frame from a group-row border and restores the original activity on undo', () => {
  const doc = createDocument('group frame border', 1, 1, 'rgba')
  doc.groups.push({id: 'group', name: 'Group', visible: true, locked: false, opacity: 1, blendMode: 'normal'})
  doc.layers[0].groupId = 'group'
  for (let i = 0; i < 2; i++) addBlankAnimationFrame(doc)
  const ids = doc.animation!.frames.map(frame => frame.id)
  useWorkspace.getState().addSession(doc)
  const commands = useWorkspace.getState()
  commands.selectAnimationFrame(ids[0])
  const view = render(<LayersPanel session={commands.sessions[0]} docked />)
  const cell = (id: string) => view.container.querySelector<HTMLElement>(`[data-animation-group-cel-key="group:${id}"]`)!
  const outline = view.container.querySelector(`[data-animation-frame-selection]`)!
  vi.spyOn(outline, 'getBoundingClientRect').mockReturnValue({left: 0, right: 28, top: 0, bottom: 100, width: 28, height: 100} as DOMRect)
  vi.spyOn(cell(ids[2]), 'getBoundingClientRect').mockReturnValue({left: 56, right: 84, top: 30, bottom: 60, width: 28, height: 30} as DOMRect)
  fireEvent.pointerMove(cell(ids[0]), {clientX: 1, clientY: 45})
  expect(cell(ids[0]).style.cursor).toBe('var(--cursor-move)')
  fireEvent.pointerDown(cell(ids[0]), {button: 0, clientX: 1, clientY: 45})
  expect(commands.sessions[0].selectedAnimationFrameIds).toEqual([ids[0]])
  fireEvent.pointerMove(cell(ids[2]), {buttons: 1, clientX: 80, clientY: 45})
  act(() => { vi.advanceTimersByTime(17) })
  expect(doc.animation!.activeFrameId).toBe(ids[0])
  fireEvent.pointerUp(cell(ids[2]), {button: 0, clientX: 80, clientY: 45})
  expect(doc.animation!.frames.map(frame => frame.id)).toEqual([ids[1], ids[2], ids[0]])
  act(() => commands.undo())
  expect(doc.animation!.frames.map(frame => frame.id)).toEqual(ids)
  expect(doc.animation!.activeFrameId).toBe(ids[0])
  expect(commands.sessions[0].selectedAnimationFrameIds).toEqual([ids[0]])
})


it.each([
  {kind: 'frame', button: 0}, {kind: 'frame', button: 2},
  {kind: 'cel', button: 0}, {kind: 'cel', button: 2}
] as const)('keeps the active frame fixed during a $kind move with button $button', ({kind, button}) => {
  const doc = createDocument('move activity', 1, 1, 'rgba')
  for (let i = 0; i < 3; i++) addBlankAnimationFrame(doc)
  const ids = doc.animation!.frames.map(frame => frame.id)
  const layerId = doc.layers[0].id
  const keys = ids.map(id => animationCelKey(layerId, id))
  useWorkspace.getState().addSession(doc)
  const commands = useWorkspace.getState()
  if (kind === 'frame') {
    commands.selectAnimationFrame(ids[0])
    commands.selectAnimationFrame(ids[1], 'toggle')
  } else {
    commands.selectAnimationCell(keys[0])
    commands.selectAnimationCell(keys[1], 'toggle')
  }
  const session = commands.sessions[0]
  const originalFrame = doc.animation!.activeFrameId
  const historyPosition = session.history.position
  const view = render(<LayersPanel session={session} docked />)
  const target = (i: number) => view.container.querySelector(kind === 'frame'
    ? `[data-animation-frame-id="${ids[i]}"]`
    : `[data-animation-cel-key="${keys[i]}"]`)!
  const switchFrame = vi.spyOn(useWorkspace.getState(), 'setActiveAnimationFrame')
  switchFrame.mockClear()
  const outline = view.container.querySelector(kind === 'frame' ? '[data-animation-frame-selection]' : '[data-animation-cel-selection]')!
  vi.spyOn(outline, 'getBoundingClientRect').mockReturnValue({left: 0, right: 56, top: 0, bottom: 60, width: 56, height: 60} as DOMRect)
  fireEvent.pointerDown(target(0), {button, clientX: 1, clientY: 10})
  for (const i of [1, 2]) {
    fireEvent.pointerMove(target(i), {buttons: button === 0 ? 1 : 2, clientX: 10 + i * 28, clientY: 10})
    act(() => { vi.advanceTimersByTime(17) })
    expect(doc.animation!.activeFrameId).toBe(originalFrame)
    expect(switchFrame).not.toHaveBeenCalled()
    expect(session.history.position).toBe(historyPosition)
  }
  fireEvent.pointerUp(target(2), {button, clientX: 66, clientY: 10})
  expect(session.history.position).toBe(historyPosition + 1)
  if (kind === 'frame') expect(doc.animation!.frames.map(frame => frame.id)).toEqual([ids[2], ids[0], ids[1], ids[3]])
  else expect(session.selectedAnimationCellKeys).toEqual(keys.slice(2))
  act(() => commands.undo())
  expect(doc.animation!.activeFrameId).toBe(originalFrame)
})
