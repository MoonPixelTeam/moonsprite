import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { addBlankAnimationFrame, animationCelKey } from '@/core/animation'
import { createDocument, createLayer } from '@/core/document-model'
import { useWorkspace } from '@/store/workspace'
import { LayersPanel } from './LayersPanel'

beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); useWorkspace.setState({sessions: [], activeId: null}) })
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })

function setup(collapsed = false, paint = false) {
  const doc = createDocument('group range', 1, 1, 'rgba')
  const a = doc.layers[0], b = createLayer('B', 1, 1, 'rgba'), c = createLayer('C', 1, 1, 'rgba')
  b.groupId = 'g'; c.groupId = 'h'
  doc.layers.push(b, c)
  if (paint) for (const [i, layer] of doc.layers.entries()) { layer.pixels[0] = (i + 1) * 50; layer.pixels[3] = 255 }
  doc.groups.push(...['g', 'h'].map(id => ({id, name: id, visible: true, locked: false, opacity: 1, blendMode: 'normal' as const})))
  addBlankAnimationFrame(doc); addBlankAnimationFrame(doc)
  useWorkspace.getState().addSession(doc)
  const session = useWorkspace.getState().sessions[0]
  if (collapsed) session.collapsedGroupIds = ['h']
  const view = render(<LayersPanel session={session} docked />)
  const frameIds = doc.animation!.frames.map(frame => frame.id)
  const key = (owner: string, frame: number) => animationCelKey(owner, frameIds[frame])
  const cell = (owner: string, frame: number) => {
    const kind = owner === 'g' || owner === 'h' ? 'group-cel' : 'cel'
    return view.container.querySelector<HTMLElement>(`[data-animation-${kind}-key="${key(owner, frame)}"]`)!
  }
  const down = (owner: string, frame = 0) => fireEvent.pointerDown(cell(owner, frame), {button: 0, clientX: 10, clientY: 40})
  const move = (owner: string, frame: number) => {
    fireEvent.pointerMove(cell(owner, frame), {buttons: 1, clientX: 50 + frame * 28, clientY: 100})
    act(() => vi.advanceTimersByTime(17))
  }
  const up = () => fireEvent.pointerUp(window, {button: 0})
  return {doc, session, view, a, b, c, key, cell, down, move, up}
}

it('starts in group whitespace, crosses into cels and commits only editable slots', () => {
  const {doc, session, view, b, key, cell, down, move, up} = setup()
  const history = session.history.position, revision = session.contentRevision, celCount = doc.animation!.cels.length
  down('g'); move(b.id, 1)
  expect(cell('g', 1)).toHaveClass('selected-cel')
  expect(cell(b.id, 1)).toHaveClass('selected-cel')
  expect(view.container.querySelector('[data-animation-cel-selection]')).toHaveStyle({'--animation-row-span': '2', '--animation-frame-span': '2'})
  up()
  expect(new Set(session.selectedAnimationCellKeys)).toEqual(new Set([key(b.id, 0), key(b.id, 1)]))
  expect(cell('g', 1)).toHaveClass('selected-cel')
  expect(doc.animation!.cels.length).toBe(celCount)
  expect(session.history.position).toBe(history)
  expect(session.contentRevision).toBe(revision)
  act(() => useWorkspace.getState().selectAnimationCell(key(b.id, 2)))
  view.rerender(<LayersPanel session={session} docked />)
  expect(cell('g', 1)).not.toHaveClass('selected-cel')
})

it('extends an ordinary cel marquee onto a group row and back across it', () => {
  const {session, a, b, key, cell, down, move, up} = setup()
  down(a.id); move('g', 1)
  expect(cell('g', 1)).toHaveClass('selected-cel')
  expect(cell(b.id, 1)).toHaveClass('selected-cel')
  move(b.id, 2); move('g', 2); up()
  expect(new Set(session.selectedAnimationCellKeys)).toEqual(new Set([a.id, b.id].flatMap(id => [0, 1, 2].map(frame => key(id, frame)))))
  expect(session.selectedGroupIds).toEqual([])
})

it('crosses a collapsed group without selecting its hidden descendants', () => {
  const {session, a, b, c, key, down, move, up} = setup(true)
  down('h'); move(a.id, 1); up()
  expect(new Set(session.selectedAnimationCellKeys)).toEqual(new Set([a.id, b.id].flatMap(id => [0, 1].map(frame => key(id, frame)))))
  expect(session.selectedAnimationCellKeys.some(slot => slot.startsWith(`${c.id}:`))).toBe(false)
})

it('keeps a group-only marquee out of document operations and cancels mixed ranges safely', () => {
  const {session, b, doc, down, move, up} = setup()
  down('g'); move('g', 2); up()
  expect(session.selectedAnimationCellKeys).toEqual([])
  expect(session.selectedGroupIds).toEqual([])
  const original = doc.animation!.activeFrameId
  down('g'); move(b.id, 1)
  fireEvent.pointerCancel(window)
  expect(session.selectedAnimationCellKeys).toEqual([])
  expect(doc.animation!.activeFrameId).toBe(original)
})

it('validates exact range keys at the store boundary before later edit commands see them', () => {
  const {session, a, b, key} = setup()
  act(() => useWorkspace.getState().selectAnimationCell(key(b.id, 1), 'replace', [key(a.id, 0), key(b.id, 1), key('g', 1), 'missing:frame', `${a.id}:missing`]))
  expect(session.selectedAnimationCellKeys).toEqual([key(a.id, 0), key(b.id, 1)])
})

it.each(['g', 'layer'] as const)('moves the entire mixed selection from its %s border without collapsing the outline', start => {
  const {session, doc, view, a, b, key, cell, down, move, up} = setup(false, true)
  down('g'); move(a.id, 1); up()
  const sourceKeys = [...session.selectedAnimationCellKeys]
  const history = session.history.position
  const outline = view.container.querySelector<HTMLElement>('[data-animation-cel-selection]')!
  vi.spyOn(outline, 'getBoundingClientRect').mockReturnValue({left: 0, right: 56, top: 30, bottom: 114, width: 56, height: 84, x: 0, y: 30, toJSON: () => ({})})
  const owner = start === 'g' ? 'g' : a.id
  fireEvent.pointerDown(cell(owner, 0), {button: 0, clientX: 1, clientY: 40})
  expect(session.selectedAnimationCellKeys).toEqual(sourceKeys)
  fireEvent.pointerMove(cell(owner, 1), {buttons: 1, clientX: 40, clientY: 40})
  act(() => vi.advanceTimersByTime(17))
  expect(view.container.querySelector('[data-animation-cel-selection]')).toHaveClass('animation-cel-drag-preview')
  expect(view.container.querySelector('[data-animation-cel-selection]')).toHaveStyle({'--animation-frame-index': '1', '--animation-frame-span': '2', '--animation-row-span': '3'})
  expect(cell(a.id, 0)).toHaveClass('dragging')
  expect(cell(b.id, 0)).toHaveClass('dragging')
  up()
  expect(new Set(session.selectedAnimationCellKeys)).toEqual(new Set([a.id, b.id].flatMap(id => [1, 2].map(frame => key(id, frame)))))
  expect(session.selectedGroupIds).toEqual([])
  expect(cell('g', 1)).toHaveClass('selected-cel')
  expect(cell('g', 2)).toHaveClass('selected-cel')
  const frames = doc.animation!.frames
  const pixel = (layerId: string, frame: number) => doc.animation!.cels.find(cel => cel.layerId === layerId && cel.frameId === frames[frame].id)?.surface?.pixels[3]
  expect(pixel(a.id, 0)).toBe(0)
  expect(pixel(b.id, 0)).toBe(0)
  expect(pixel(a.id, 1)).toBe(255)
  expect(pixel(b.id, 1)).toBe(255)
  expect(session.history.position).toBe(history + 1)
  act(() => useWorkspace.getState().undo())
  expect(new Set(session.selectedAnimationCellKeys)).toEqual(new Set(sourceKeys))
  expect(pixel(a.id, 0)).toBe(255)
  expect(pixel(b.id, 0)).toBe(255)
  view.rerender(<LayersPanel session={session} docked />)
  expect(session.selectedAnimationGroupCellKeys).toEqual([key('g', 0), key('g', 1)])
  expect(cell('g', 0)).toHaveClass('selected-cel')
  expect(cell('g', 1)).toHaveClass('selected-cel')
  expect(cell('g', 2)).not.toHaveClass('selected-cel')
  expect(view.container.querySelector('[data-animation-cel-selection]')).toHaveStyle({'--animation-frame-index': '0', '--animation-frame-span': '2', '--animation-row-span': '3'})
  act(() => useWorkspace.getState().redo())
  view.rerender(<LayersPanel session={session} docked />)
  expect(session.selectedAnimationGroupCellKeys).toEqual([key('g', 1), key('g', 2)])
  expect(cell('g', 0)).not.toHaveClass('selected-cel')
  expect(cell('g', 2)).toHaveClass('selected-cel')
})

it('keeps the group grab offset during a vertical move and cancels without changing contents', () => {
  const {session, view, b, cell, down, move, up} = setup(false, true)
  down('g'); move(b.id, 1); up()
  const source = [...session.selectedAnimationCellKeys], history = session.history.position
  const outline = view.container.querySelector<HTMLElement>('[data-animation-cel-selection]')!
  vi.spyOn(outline, 'getBoundingClientRect').mockReturnValue({left: 0, right: 56, top: 30, bottom: 86, width: 56, height: 56, x: 0, y: 30, toJSON: () => ({})})
  const row = Number(outline.style.getPropertyValue('--animation-row-index'))
  fireEvent.pointerDown(cell('g', 0), {button: 0, clientX: 1, clientY: 40})
  fireEvent.pointerMove(cell(b.id, 0), {buttons: 1, clientX: 1, clientY: 75})
  act(() => vi.advanceTimersByTime(17))
  expect(view.container.querySelector('[data-animation-cel-selection]')).toHaveStyle({'--animation-row-index': String(row + 1), '--animation-row-span': '2'})
  fireEvent.pointerCancel(window)
  expect(session.selectedAnimationCellKeys).toEqual(source)
  expect(session.history.position).toBe(history)
})
