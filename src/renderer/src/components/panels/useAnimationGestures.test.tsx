import type { PointerEvent as ReactPointerEvent } from 'react'
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { createDocument } from '@/core/document-model'
import { useWorkspace } from '@/store/workspace'
import { useAnimationGestures } from './useAnimationGestures'

afterEach(() => { cleanup(); useWorkspace.setState({sessions: [], activeId: null}) })

it('starts an Alt drag from inside an already selected frame without replacing the range', () => {
  const { result, session } = setup()
  const frameId = session.document.animation!.frames[0].id
  session.selectedAnimationFrameIds = [frameId]
  act(() => result.current.beginAnimationFrameDrag({button:0,altKey:true,clientX:10,clientY:10,preventDefault:vi.fn()} as unknown as ReactPointerEvent<HTMLElement>,frameId))
  expect(result.current.readGesture()).toMatchObject({kind:'frame',canMove:true,frameIds:[frameId]})
  act(() => result.current.finish(true))
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
