import type { PointerEvent as ReactPointerEvent } from 'react'
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { createDocument } from '@/core/document-model'
import { useWorkspace } from '@/store/workspace'
import { useAnimationGestures } from './useAnimationGestures'

afterEach(() => { cleanup(); useWorkspace.setState({sessions: [], activeId: null}) })

function setup() {
  useWorkspace.setState({sessions: [], activeId: null})
  const document = createDocument('timeline gesture', 4, 4, 'rgba')
  useWorkspace.getState().addSession(document)
  const session = useWorkspace.getState().sessions[0]
  const hook = renderHook(() => useAnimationGestures({
    session, listRef: {current: null}, showAnimationSelectionOutline: vi.fn(),
    showAnimationCellSelectionOutline: vi.fn(), setSelectionOutlineVisible: vi.fn(),
    setAnimationCellSelectionOutlineVisible: vi.fn(), preserveSelectionAfterEdit: vi.fn(),
    cellRange: () => [], maskCellRange: () => []
  }))
  const begin = () => act(() => hook.result.current.beginAnimationFrameDrag({button: 0, clientX: 10, clientY: 10, preventDefault: vi.fn()} as unknown as ReactPointerEvent<HTMLElement>, document.animation!.frames[0].id))
  return {...hook, session, begin}
}

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
