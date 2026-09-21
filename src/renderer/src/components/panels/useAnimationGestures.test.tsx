import type { PointerEvent as ReactPointerEvent } from 'react'
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { createDocument } from '@/core/document-model'
import { useWorkspace } from '@/store/workspace'
import { useAnimationGestures } from './useAnimationGestures'
import { timelineSelectionOutlineHit } from './animation-gesture-helpers'

afterEach(() => { cleanup(); useWorkspace.setState({sessions: [], activeId: null}) })

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
