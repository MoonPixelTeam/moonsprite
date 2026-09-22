import type { PointerEvent as ReactPointerEvent } from 'react'
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { createDocument } from '@/core/document-model'
import { useWorkspace } from '@/store/workspace'
import { useAnimationGestures } from './useAnimationGestures'
import { timelineSelectionOutlineHit } from './animation-gesture-helpers'

const originalSetActiveAnimationFrame = useWorkspace.getState().setActiveAnimationFrame
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); useWorkspace.setState({sessions: [], activeId: null, setActiveAnimationFrame: originalSetActiveAnimationFrame}) })

it('starts an Alt drag from inside an already selected frame without replacing the range', () => {
  const { result, session } = setup()
  const frameId = session.document.animation!.frames[0].id
  session.selectedAnimationFrameIds = [frameId]
  act(() => result.current.beginAnimationFrameDrag({button:0,altKey:true,clientX:10,clientY:10,preventDefault:vi.fn()} as unknown as ReactPointerEvent<HTMLElement>,frameId))
  expect(result.current.readGesture()).toMatchObject({kind:'frame',canMove:true,frameIds:[frameId]})
  act(() => result.current.finish(true))
})

it('starts a right-button move gesture for a multi-selected frame range without collapsing it on a click', () => {
  const { result, session } = setup()
  useWorkspace.getState().duplicateAnimationFrame()
  const frameIds = session.document.animation!.frames.map(frame => frame.id)
  session.selectedAnimationFrameIds = frameIds.slice(0, 2)
  act(() => result.current.beginAnimationFrameDrag({button:2,clientX:10,clientY:10,preventDefault:vi.fn()} as unknown as ReactPointerEvent<HTMLElement>, frameIds[0]))
  expect(result.current.readGesture()).toMatchObject({kind:'frame',button:2,canMove:true,frameIds:frameIds.slice(0, 2)})
  act(() => result.current.finish())
  expect(session.selectedAnimationFrameIds).toEqual(frameIds.slice(0, 2))
  expect(result.current.consumeContextMenu()).toBe(false)
})

it('starts a right-button move gesture for a multi-selected cel range', () => {
  const { result, session } = setup()
  useWorkspace.getState().duplicateAnimationFrame()
  const frameIds = session.document.animation!.frames.map(frame => frame.id)
  const layerId = session.document.activeLayerId
  const keys = frameIds.slice(0, 2).map(frameId => `${layerId}:${frameId}`)
  session.selectedAnimationCellKeys = keys
  act(() => result.current.beginAnimationCelDrag({button:2,clientX:10,clientY:10,preventDefault:vi.fn()} as unknown as ReactPointerEvent<HTMLButtonElement>, layerId, frameIds[0]))
  expect(result.current.readGesture()).toMatchObject({kind:'cel',button:2,canMove:true,cellKeys:keys})
  act(() => result.current.finish())
  expect(session.selectedAnimationCellKeys).toEqual(keys)
})

function setup(list: HTMLDivElement | null = null) {
  useWorkspace.setState({sessions: [], activeId: null})
  const document = createDocument('timeline gesture', 4, 4, 'rgba')
  useWorkspace.getState().addSession(document)
  const session = useWorkspace.getState().sessions[0]
  const hook = renderHook(() => useAnimationGestures({
    session, listRef: {current: list}, showAnimationSelectionOutline: vi.fn(),
    showAnimationCellSelectionOutline: vi.fn(), setSelectionOutlineVisible: vi.fn(),
    setAnimationCellSelectionOutlineVisible: vi.fn(), preserveSelectionAfterEdit: vi.fn(),
    cellRange: () => [], maskCellRange: () => []
  }))
  const begin = () => act(() => hook.result.current.beginAnimationFrameDrag({button: 0, clientX: 10, clientY: 10, preventDefault: vi.fn()} as unknown as ReactPointerEvent<HTMLElement>, document.animation!.frames[0].id))
  return {...hook, session, begin}
}

function animationFrames() {
  let id = 0
  const callbacks = new Map<number, FrameRequestCallback>()
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { callbacks.set(++id, callback); return id })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(frame => { callbacks.delete(frame) })
  return {
    callbacks,
    tick: (beforePaint?: () => void) => act(() => {
      const pending = [...callbacks.entries()]
      for (const [frame, callback] of pending) if (callbacks.delete(frame)) callback(16)
      beforePaint?.()
    })
  }
}

function framePointer(frameId: string, clientX = 40): PointerEvent {
  const target = document.createElement('button')
  target.dataset.animationFrameId = frameId
  return {target, clientX, clientY: 10, altKey: false} as unknown as PointerEvent
}

it.each(['range', 'move'] as const)('commits the latest %s feedback before the animation callback returns to paint', mode => {
  const raf = animationFrames()
  const {result, session, begin} = setup()
  act(() => useWorkspace.getState().duplicateAnimationFrame())
  const frames = session.document.animation!.frames
  if (mode === 'range') begin()
  else {
    session.selectedAnimationFrameIds = [frames[0].id]
    act(() => result.current.beginAnimationFrameDrag({button: 0, altKey: true, clientX: 10, clientY: 10, preventDefault: vi.fn()} as unknown as ReactPointerEvent<HTMLElement>, frames[0].id))
  }
  act(() => result.current.move(framePointer(frames[1].id)))
  // Checking inside the animation turn is intentional: act() otherwise drains
  // React work afterward and conceals a one-paint delay in timeline feedback.
  raf.tick(() => {
    if (mode === 'range') expect(result.current.animationGestureSelection).toEqual({kind: 'frame', ids: frames.map(frame => frame.id)})
    else expect(result.current.animationFrameDropTarget?.frameId).toBe(frames[1].id)
  })
})

it('updates the range during input and coalesces global frame preview until after the paint opportunity', () => {
  vi.useFakeTimers()
  const raf = animationFrames()
  const {result, session, begin} = setup()
  act(() => { useWorkspace.getState().duplicateAnimationFrame(); useWorkspace.getState().duplicateAnimationFrame() })
  const frames = session.document.animation!.frames
  act(() => useWorkspace.getState().setActiveAnimationFrame(frames[0].id))
  const preview = vi.spyOn(useWorkspace.getState(), 'setActiveAnimationFrame')
  const history = session.history.revision
  begin()
  act(() => {
    for (let i = 0; i < 12; i++) result.current.move(framePointer(frames[1].id))
    result.current.move(framePointer(frames[2].id))
    expect(result.current.animationGestureSelection).toEqual({kind: 'frame', ids: frames.map(frame => frame.id)})
  })
  expect(raf.callbacks.size).toBe(1)
  expect(preview).not.toHaveBeenCalled()
  raf.tick()
  expect(result.current.animationGestureSelection).toEqual({kind: 'frame', ids: frames.map(frame => frame.id)})
  expect(preview).not.toHaveBeenCalled()
  act(() => vi.runOnlyPendingTimers())
  expect(preview).toHaveBeenCalledExactlyOnceWith(frames[2].id)
  expect(raf.callbacks.size).toBe(0)
  expect(session.history.revision).toBe(history)
  act(() => result.current.cancel())
  expect(session.document.animation!.activeFrameId).toBe(frames[0].id)
})

it('flushes the final pointer before release without waiting for a display tick', () => {
  const raf = animationFrames()
  const {result, session, begin} = setup()
  act(() => useWorkspace.getState().duplicateAnimationFrame())
  const frames = session.document.animation!.frames
  act(() => useWorkspace.getState().setActiveAnimationFrame(frames[0].id))
  begin()
  act(() => { result.current.move(framePointer(frames[1].id)); result.current.finish() })
  expect(session.selectedAnimationFrameIds).toEqual(frames.map(frame => frame.id))
  expect(session.document.animation!.activeFrameId).toBe(frames[1].id)
  expect(raf.callbacks.size).toBe(0)
})

it('shares the latest pointer with edge scrolling and keeps scrolling while the pointer rests', () => {
  const raf = animationFrames()
  const list = document.createElement('div')
  Object.defineProperties(list, {scrollWidth: {value: 1000}, clientWidth: {value: 200}})
  vi.spyOn(list, 'getBoundingClientRect').mockReturnValue({left: 0, top: 0, right: 200, bottom: 40, width: 200, height: 40, x: 0, y: 0, toJSON: () => ({})})
  const {result, session, begin} = setup(list)
  act(() => { useWorkspace.getState().duplicateAnimationFrame(); useWorkspace.getState().duplicateAnimationFrame() })
  const frames = session.document.animation!.frames
  begin()
  act(() => result.current.move(framePointer(frames[1].id, 190)))
  raf.tick()
  act(() => result.current.move(framePointer(frames[2].id, 190)))
  raf.tick()
  expect(list.scrollLeft).toBe(36)
  expect(result.current.animationGestureActiveTarget?.frameId).toBe(frames[2].id)
  expect(raf.callbacks.size).toBe(1)
  raf.tick()
  expect(list.scrollLeft).toBe(54)
  act(() => result.current.finish(true))
  expect(raf.callbacks.size).toBe(0)
})

it.each(['cancel', 'finish', 'unmount'] as const)('discards deferred preview on %s and leaves idle movement unscheduled', end => {
  vi.useFakeTimers()
  const raf = animationFrames()
  const {result, session, begin, unmount} = setup()
  act(() => useWorkspace.getState().duplicateAnimationFrame())
  const frames = session.document.animation!.frames
  const preview = vi.spyOn(useWorkspace.getState(), 'setActiveAnimationFrame')
  act(() => result.current.move(framePointer(frames[1].id)))
  expect(raf.callbacks.size).toBe(0)
  begin()
  act(() => result.current.move(framePointer(frames[1].id)))
  expect(raf.callbacks.size).toBe(1)
  raf.tick()
  expect(preview).not.toHaveBeenCalled()
  act(() => { if (end === 'unmount') unmount(); else if (end === 'finish') result.current.finish(true); else result.current.cancel() })
  expect(raf.callbacks.size).toBe(0)
  act(() => vi.runOnlyPendingTimers())
  expect(preview).not.toHaveBeenCalled()
})

it('updates the cel target before the pointer handler returns', () => {
  animationFrames()
  const {result, session} = setup()
  act(() => useWorkspace.getState().duplicateAnimationFrame())
  const frames = session.document.animation!.frames, layerId = session.document.activeLayerId
  act(() => result.current.beginAnimationCelDrag({button: 0, clientX: 10, clientY: 10, preventDefault: vi.fn()} as unknown as ReactPointerEvent<HTMLButtonElement>, layerId, frames[0].id))
  const target = document.createElement('button')
  target.dataset.animationCelKey = `${layerId}:${frames[1].id}`
  act(() => {
    result.current.move({target, clientX: 40, clientY: 10, altKey: false} as unknown as PointerEvent)
    expect(result.current.animationGestureActiveTarget).toEqual({kind: 'cel', layerId, frameId: frames[1].id})
  })
})

it('does not apply a deferred preview to a document opened during the gesture', () => {
  vi.useFakeTimers()
  const raf = animationFrames()
  const {result, session, begin} = setup()
  act(() => useWorkspace.getState().duplicateAnimationFrame())
  const frames = session.document.animation!.frames
  act(() => useWorkspace.getState().setActiveAnimationFrame(frames[0].id))
  begin()
  act(() => result.current.move(framePointer(frames[1].id)))
  raf.tick()
  const nextDocument = createDocument('next', 4, 4, 'rgba')
  act(() => useWorkspace.getState().addSession(nextDocument))
  const activeFrameId = nextDocument.animation!.activeFrameId
  const preview = vi.spyOn(useWorkspace.getState(), 'setActiveAnimationFrame')
  act(() => vi.runOnlyPendingTimers())
  expect(preview).not.toHaveBeenCalled()
  expect(nextDocument.animation!.activeFrameId).toBe(activeFrameId)
  expect(session.document.animation!.activeFrameId).toBe(frames[0].id)
})

it('reuses measured edge rows across scrolling and refreshes them after resize', () => {
  const raf = animationFrames()
  const list = document.createElement('div'), outline = document.createElement('div')
  outline.dataset.animationCelSelection = ''
  list.append(outline)
  const bounds = (left: number, width: number) => ({left, top: 0, right: left + width, bottom: 40, width, height: 40, x: left, y: 0, toJSON: () => ({})})
  const listBounds = vi.spyOn(list, 'getBoundingClientRect').mockReturnValue(bounds(0, 200))
  vi.spyOn(outline, 'getBoundingClientRect').mockReturnValue(bounds(0, 100))
  const {result, session} = setup(list)
  act(() => { useWorkspace.getState().duplicateAnimationFrame(); useWorkspace.getState().duplicateAnimationFrame() })
  const frames = session.document.animation!.frames, layerId = session.document.activeLayerId
  const keys = frames.map(frame => `${layerId}:${frame.id}`)
  const measurements = keys.map((key, index) => {
    const cell = document.createElement('button')
    cell.dataset.animationCelKey = key
    list.append(cell)
    return vi.spyOn(cell, 'getBoundingClientRect').mockReturnValue(bounds(100 + index * 40, 40))
  })
  session.selectedAnimationCellKeys = [keys[0]]
  act(() => result.current.beginAnimationCelDrag({button: 0, clientX: 1, clientY: 10, preventDefault: vi.fn()} as unknown as ReactPointerEvent<HTMLButtonElement>, layerId, frames[0].id))
  const move = (clientX: number) => {
    act(() => result.current.move({clientX, clientY: 10, target: document.body, altKey: false} as unknown as PointerEvent))
    raf.tick()
  }
  move(300)
  expect(result.current.animationCelDropTargetKey).toBe(keys[2])
  list.scrollLeft = 100
  move(130)
  expect(result.current.animationCelDropTargetKey).toBe(keys[2])
  move(-150)
  expect(result.current.animationCelDropTargetKey).toBe(keys[0])
  for (const measured of measurements) expect(measured).toHaveBeenCalledTimes(1)
  listBounds.mockReturnValue(bounds(0, 250))
  move(300)
  for (const measured of measurements) expect(measured).toHaveBeenCalledTimes(2)
})

it('uses the copy cursor during Alt drag and restores it on Alt release and cancel', () => {
  const { result, session, unmount } = setup()
  const frameId = session.document.animation!.frames[0].id
  session.selectedAnimationFrameIds = [frameId]
  act(() => result.current.beginAnimationFrameDrag({button:0,altKey:true,clientX:10,clientY:10,preventDefault:vi.fn()} as unknown as ReactPointerEvent<HTMLElement>,frameId))
  act(() => result.current.move({altKey:true,clientX:30,clientY:10,target:document.body} as unknown as PointerEvent))
  expect(document.body.classList.contains('animation-copy-drag')).toBe(true)
  act(() => window.dispatchEvent(new KeyboardEvent('keyup',{key:'Alt',altKey:false})))
  expect(document.body.classList.contains('animation-copy-drag')).toBe(false)
  act(() => window.dispatchEvent(new KeyboardEvent('keydown',{key:'Alt',altKey:true})))
  expect(document.body.classList.contains('animation-copy-drag')).toBe(true)
  act(() => result.current.finish(true))
  expect(document.body.classList.contains('animation-copy-drag')).toBe(false)
  unmount()
  expect(document.body.classList.contains('animation-copy-drag')).toBe(false)
})

it('cancels a preview without committing timeline selection or history', () => {
  const {result, session, begin} = setup()
  const selected = [...session.selectedAnimationFrameIds], history = session.history.revision
  begin()
  expect(result.current.animationGestureSelection?.kind).toBe('frame')
  act(() => result.current.finish(true))
  expect(result.current.readGesture()).toBeNull()
  expect(result.current.animationGestureSelection).toBeNull()
  expect(session.selectedAnimationFrameIds).toEqual(selected)
  expect(session.history.revision).toBe(history)
})

it.each(['frame', 'cel'])('updates the hovered %s border cursor when Alt changes without pointer movement', kind => {
  const list = document.createElement('div'), item = document.createElement('button'), outline = document.createElement('div')
  list.append(item, outline); document.body.append(list)
  const {result,session,unmount} = setup(list)
  const frameId = session.document.animation!.frames[0].id
  const key = session.document.activeLayerId + ':' + frameId
  if (kind === 'frame') { session.selectedAnimationFrameIds = [frameId]; outline.setAttribute('data-animation-frame-selection',frameId) }
  else { session.selectedAnimationCellKeys = [key]; outline.setAttribute('data-animation-cel-selection','') }
  vi.spyOn(outline,'getBoundingClientRect').mockReturnValue({left:0,top:0,right:100,bottom:100,width:100,height:100,x:0,y:0,toJSON:()=>({})})
  act(()=>result.current.updateAnimationItemCursor({currentTarget:item,clientX:1,clientY:50,altKey:false} as unknown as ReactPointerEvent<HTMLElement>,frameId,kind==='cel'?key:undefined))
  expect(item.style.cursor).toBe('var(--cursor-move)')
  act(()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'Alt',altKey:true})))
  expect(item.style.cursor).toBe('var(--cursor-copy)')
  act(()=>window.dispatchEvent(new KeyboardEvent('keyup',{key:'Alt',altKey:false})))
  expect(item.style.cursor).toBe('var(--cursor-move)')
  act(()=>item.dispatchEvent(new MouseEvent('pointerout',{bubbles:true,relatedTarget:document.body})))
  act(()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'Alt',altKey:true})))
  expect(item.style.cursor).toBe('')
  unmount();list.remove()
})

it('checks every selection outline box so separated group borders remain draggable', () => {
  const list = document.createElement('div')
  const first = document.createElement('div')
  const second = document.createElement('div')
  first.dataset.animationSelectedRow = ''
  second.dataset.animationSelectedRow = ''
  list.append(first, second)
  document.body.append(list)
  vi.spyOn(first, 'getBoundingClientRect').mockReturnValue({left: 0, top: 0, right: 100, bottom: 20, width: 100, height: 20, x: 0, y: 0, toJSON: () => ({})})
  vi.spyOn(second, 'getBoundingClientRect').mockReturnValue({left: 0, top: 40, right: 100, bottom: 60, width: 100, height: 20, x: 0, y: 40, toJSON: () => ({})})
  expect(timelineSelectionOutlineHit({current: list}, {clientX: 1, clientY: 59} as unknown as ReactPointerEvent<HTMLElement>, '[data-animation-selected-row]')).toBe(true)
  list.remove()
})

it('discards a pending gesture when another document becomes active', () => {
  const {result, session, begin} = setup()
  const selected = [...session.selectedAnimationFrameIds]
  begin()
  act(() => useWorkspace.getState().addSession(createDocument('other', 4, 4, 'rgba')))
  act(() => result.current.finish())
  expect(result.current.readGesture()).toBeNull()
  expect(session.selectedAnimationFrameIds).toEqual(selected)
  expect(useWorkspace.getState().sessions[1].selectedAnimationFrameIds).toEqual([])
})
