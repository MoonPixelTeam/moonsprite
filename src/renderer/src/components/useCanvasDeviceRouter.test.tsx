import { act, renderHook } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { CanvasInputState } from '@/core/canvas-input'
import { DEFAULT_TABLET_PREFERENCES, RIGHT_CLICK_ACTIONS } from '@/core/file-preferences'
import type { DocumentSession } from '@/store/workspace'
import { withDeviceTemporaryTool } from './canvas-device-tools'
import { useCanvasDeviceRouter } from './useCanvasDeviceRouter'

it('keeps each right-click action active through down/move/up and restores the original tool', () => {
  for (const action of RIGHT_CLICK_ACTIONS) {
    const input = new CanvasInputState()
    const session = { document: { id: 'right-click-test' }, tool: 'pencil', brushSize: 3, brushProfiles: { eraser: { brushSize: 9 } } } as DocumentSession
    const live = () => withDeviceTemporaryTool(session, input.temporaryTool, input.temporaryRightClickAction)
    const observed: Array<{ button: number; buttons: number; tool: string; action: string | null }> = []
    const record = (event: ReactPointerEvent<HTMLCanvasElement>) => {
      observed.push({ button: event.button, buttons: event.buttons, tool: live().tool, action: input.temporaryRightClickAction })
    }
    const ports = {
      inputRef: { current: input }, session, canvasRef: { current: document.createElement('canvas') },
      tabletPreferences: { ...DEFAULT_TABLET_PREFERENCES, rightClickAction: action }, liveInputSession: live,
      handlePointerDown: record, handlePointerMove: record, handlePointerUp: record, syncPenCursor: vi.fn()
    } as unknown as Parameters<typeof useCanvasDeviceRouter>[0]
    const { result, unmount } = renderHook(() => useCanvasDeviceRouter(ports))
    const event = (button: number, buttons: number) => {
      const nativeEvent = { pointerId: 9, pointerType: 'mouse', button, buttons, timeStamp: performance.now() }
      return { ...nativeEvent, nativeEvent, preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as ReactPointerEvent<HTMLCanvasElement>
    }
    act(() => result.current.pointerDown(event(2, 2)))
    act(() => result.current.pointerMove(event(-1, 2)))
    act(() => result.current.pointerUp(event(2, 0)))
    const mapped = action !== 'background'
    expect(observed.map(({ button, buttons }) => [button, buttons])).toEqual(mapped ? [[0, 1], [-1, 1], [0, 0]] : [[2, 2], [-1, 2], [2, 0]])
    expect(observed.every((entry) => entry.action === (mapped ? action : null))).toBe(true)
    expect(observed.map(({ tool }) => tool)).toEqual(Array(3).fill(action === 'background' ? 'pencil' : action === 'foreground-eyedropper' ? 'eyedropper' : action === 'rectangle' || action === 'lasso' ? 'selection' : action === 'select-layer-move' ? 'move' : action))
    expect(live()).toBe(session)
    unmount()
  }
})
