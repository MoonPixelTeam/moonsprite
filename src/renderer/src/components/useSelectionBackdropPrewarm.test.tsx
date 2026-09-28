import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useSelectionBackdropPrewarm } from './useSelectionBackdropPrewarm'

const { state } = vi.hoisted(() => ({ state: { activeId: 'doc', sessions: [] as unknown[] } }))
vi.mock('@/store/workspace', () => ({ useWorkspace: { getState: () => state } }))
afterEach(() => { cleanup(); vi.useRealTimers() })

it('starts after pointer release even when the final selection keeps its identity', () => {
  vi.useFakeTimers()
  const session = { document: { id: 'doc', activeLayerId: 'layer' }, contentRevision: 1, selection: { x: 0, y: 0, width: 500, height: 500 } }
  state.sessions = [session]
  const input = { current: { drag: {} as object | null } }
  const stop = vi.fn(), prepareSelectionBackdrop = vi.fn(() => stop)
  const mounted = renderHook(() => useSelectionBackdropPrewarm({ prepareSelectionBackdrop } as never, session as never, input as never))
  expect(prepareSelectionBackdrop).not.toHaveBeenCalled()
  act(() => { window.dispatchEvent(new Event('pointerup')); input.current.drag = null; vi.runAllTimers() })
  expect(prepareSelectionBackdrop).toHaveBeenCalledTimes(1)
  expect(prepareSelectionBackdrop.mock.calls[0]?.slice(0, 4)).toEqual([session.document, 'layer', 1, session.selection])
  mounted.unmount()
  expect(stop).toHaveBeenCalledOnce()
  act(() => { window.dispatchEvent(new Event('pointerup')); vi.runAllTimers() })
  expect(prepareSelectionBackdrop).toHaveBeenCalledTimes(1)
})
