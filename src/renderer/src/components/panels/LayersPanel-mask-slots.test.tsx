import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { activateAnimationFrame, addBlankAnimationFrame, animationCelKey } from '@/core/animation'
import { animationMaskAt, createDocument, createLayerMask, writeLayerColor } from '@/core/document'
import { useWorkspace } from '@/store/workspace'
import { LayersPanel } from './LayersPanel'

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('moonSprite', { getResourceInfo: vi.fn().mockResolvedValue({ totalBytes: 8e9, freeBytes: 4e9 }) })
  useWorkspace.setState({ sessions: [], activeId: null, message: null, dialog: null })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function setup(group: boolean, maskIndexes = [0, 2], frameCount = 5) {
  const document = createDocument('mask slots', 1, 1, 'rgba')
  const layer = document.layers[0]
  if (group) {
    document.groups.push({ id: 'group', name: 'Group', visible: true, locked: false, opacity: 1, blendMode: 'normal' })
    layer.groupId = 'group'
  }
  const ownerId = group ? 'group' : layer.id
  writeLayerColor(document, layer, 0, { r: 255, g: 0, b: 0, a: 255 })
  for (let index = 1; index < frameCount; index++) addBlankAnimationFrame(document)
  const timeline = document.animation!
  for (const index of maskIndexes) {
    const mask = createLayerMask(ownerId, 1, 1, group ? 'group' : 'cel')
    writeLayerColor(document, mask, 0, { r: 40 + index, g: 40 + index, b: 40 + index, a: 255 })
    const frameId = timeline.frames[index].id
    if (group) (timeline.groupMasks ??= []).push({ groupId: ownerId, frameId, mask })
    else (timeline.layerMasks ??= []).push({ layerId: ownerId, frameId, mask })
  }
  activateAnimationFrame(document, timeline.frames[0].id)
  useWorkspace.getState().addSession(document)
  function Panel() {
    const session = useWorkspace((state) => state.sessions[0])
    return <LayersPanel session={session} docked />
  }
  const view = render(<Panel />)
  const keys = timeline.frames.map((frame) => animationCelKey(ownerId, frame.id))
  const cell = (index: number) => view.container.querySelector(`[data-animation-mask-cel-key="${keys[index]}"]`)!
  const mask = (index: number) => animationMaskAt(timeline, ownerId, timeline.frames[index].id)
  const down = (index: number, modifiers = {}) => fireEvent.pointerDown(cell(index), { button: 0, pointerId: 1, clientX: 14 + index * 28, clientY: 70, ...modifiers })
  const move = (index: number) => fireEvent.pointerMove(cell(index), { buttons: 1, pointerId: 1, clientX: 14 + index * 28, clientY: 70 })
  const up = (index: number) => fireEvent.pointerUp(cell(index), { button: 0, pointerId: 1, clientX: 14 + index * 28, clientY: 70 })
  return { ...view, keys, cell, mask, down, move, up, document }
}

it.each([false, true])('keeps empty mask slots active throughout forward and backward drags (group=%s)', (group) => {
  const f = setup(group)
  f.down(0)
  for (const end of [1, 2, 3, 4, 3, 2]) {
    f.move(end)
    for (let i = 0; i <= end; i++) expect(f.cell(i)).toHaveClass('active-frame')
    if (end < 4) expect(f.cell(end + 1)).not.toHaveClass('active-frame')
  }
  f.up(2)
  expect(useWorkspace.getState().sessions[0].selectedAnimationMaskCellKeys).toEqual(f.keys.slice(0, 3))
})

it.each([false, true].flatMap((group) => ['drag', 'shift', 'ctrl'].map((mode) => ({ group, mode }))))(
  'fills missing mask 2 when linking frames 1–3 ($group, $mode)', ({ group, mode }) => {
    const f = setup(group)
    const before = [f.mask(0)!.id, f.mask(2)!.id]
    f.down(0)
    if (mode === 'drag') f.move(2)
    else { f.up(0); f.down(2, { shiftKey: mode === 'shift', ctrlKey: mode === 'ctrl' }) }
    f.up(2)
    fireEvent.contextMenu(f.cell(mode === 'ctrl' ? 2 : 1))
    fireEvent.click(screen.getByRole('menuitem', { name: /^链接图层蒙版单元格/ }))
    for (let i = 0; i < 3; i++) {
      expect(f.mask(i)?.id).toBe(before[0])
      expect(Array.from(f.mask(i)!.pixels)).toEqual([40, 40, 40, 255])
    }
    expect(f.container.querySelector('[data-linked-cel-block][data-frame-index="0"][data-frame-span="3"]')).toBeInTheDocument()
    expect(f.container.querySelector('[data-linked-cel-connector]')).toBeNull()
    expect(f.mask(3)).toBeNull()
    expect(f.mask(4)).toBeNull()
    act(() => useWorkspace.getState().undo())
    expect(f.mask(0)?.id).toBe(before[0])
    expect(f.mask(1)).toBeNull()
    expect(f.mask(2)?.id).toBe(before[1])
    act(() => useWorkspace.getState().redo())
    expect(f.mask(1)?.id).toBe(before[0])
  }
)

it.each([false, true])('links one existing mask to selected empty slots (group=%s)', (group) => {
  const f = setup(group, [1])
  f.down(0); f.move(2); f.up(2)
  fireEvent.contextMenu(f.cell(2))
  const menu = screen.getByRole('menuitem', { name: /^链接图层蒙版单元格/ })
  expect(menu).not.toBeDisabled()
  fireEvent.click(menu)
  expect(f.mask(0)?.id).toBe(f.mask(1)?.id)
  expect(f.mask(2)?.id).toBe(f.mask(1)?.id)
})

it('preserves an unselected existing mask between Ctrl-selected endpoints', () => {
  const f = setup(false, [0, 1, 2])
  const middle = f.mask(1)!.id
  f.down(0); f.up(0); f.down(2, { ctrlKey: true }); f.up(2)
  act(() => useWorkspace.getState().connectSelectedAnimationMasks())
  expect(f.mask(2)?.id).toBe(f.mask(0)?.id)
  expect(f.mask(1)?.id).toBe(middle)
})

it.each([false, true])('fills a gap even when both endpoint masks are already linked (group=%s)', (group) => {
  const f = setup(group)
  f.mask(2)!.linkedMaskId = f.mask(0)!.id
  f.down(0); f.up(0); f.down(2, { ctrlKey: true }); f.up(2)
  act(() => useWorkspace.getState().connectSelectedAnimationMasks())
  expect(f.mask(1)?.id).toBe(f.mask(0)?.id)
  act(() => useWorkspace.getState().undo())
  expect(f.mask(1)).toBeNull()
  expect(f.mask(2)?.id).toBe(f.mask(0)?.id)
})

it('does not create a mask on a locked owner', () => {
  const f = setup(false)
  f.down(0); f.move(2); f.up(2)
  f.document.layers[0].locked = true
  act(() => useWorkspace.getState().connectSelectedAnimationMasks())
  expect(f.mask(1)).toBeNull()
  expect(f.mask(2)?.id).not.toBe(f.mask(0)?.id)
})
