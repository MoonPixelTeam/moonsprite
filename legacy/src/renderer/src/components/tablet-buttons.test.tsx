import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { CanvasInputState } from '@/core/canvas-input'
import { DEFAULT_TABLET_PREFERENCES } from '@/core/file-preferences'
import type { DocumentSession } from '@/store/workspace'
import { useCanvasDeviceRouter } from './useCanvasDeviceRouter'
import { deviceRightClickAction, penEraserToolEvent } from './canvas-device-tools'

afterEach(cleanup)

function fixture() {
  const input = new CanvasInputState()
  const canvas = document.createElement('canvas')
  canvas.setPointerCapture = vi.fn(); canvas.releasePointerCapture = vi.fn(); canvas.hasPointerCapture = () => false
  const session = { document: { id: 'tablet' }, tool: 'pencil' } as DocumentSession
  const down = vi.fn((event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.button === 1) input.drag = { kind: 'pan', start: { x: 0, y: 0 }, last: { x: 0, y: 0 } }
  })
  const up = vi.fn(() => { input.drag = null })
  const move = vi.fn()
  const ports = {
    inputRef: { current: input }, session, canvasRef: { current: canvas }, tabletPreferences: DEFAULT_TABLET_PREFERENCES,
    liveInputSession: () => session, handlePointerDown: down, handlePointerMove: move, handlePointerUp: up,
    syncPenCursor: vi.fn(), hidePenCursor: vi.fn(), cancelActiveCanvasInteraction: vi.fn(), hideEyedropperMagnifier: vi.fn(), updateCursor: vi.fn()
  } as unknown as Parameters<typeof useCanvasDeviceRouter>[0]
  const hook = renderHook(() => useCanvasDeviceRouter(ports))
  const event = (pointerType: string, button: number, buttons: number) => {
    const nativeEvent = { pointerId: pointerType === 'pen' ? 8 : 1, pointerType, button, buttons, pressure: 0, clientX: 20, clientY: 30, timeStamp: performance.now() }
    return { ...nativeEvent, nativeEvent, currentTarget: canvas, preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as ReactPointerEvent<HTMLCanvasElement>
  }
  return { input, down, up, move, hook, event }
}

it('starts and ends a pen middle-button chord delivered as pointermove while the tip stays down', () => {
  const { hook, event, down, up, move } = fixture()
  act(() => hook.result.current.pointerMove(event('pen', 1, 5)))
  expect(down).toHaveBeenCalledOnce()
  expect(down.mock.lastCall![0].button).toBe(1)
  act(() => hook.result.current.pointerMove(event('pen', -1, 5)))
  expect(move).toHaveBeenCalledOnce()
  act(() => hook.result.current.pointerMove(event('pen', 1, 1)))
  expect(up).toHaveBeenCalledOnce()
})

it.each([1, 2])('accepts driver-emulated mouse button %s move and release interleaved with pen hover', button => {
  const { hook, event, input, up, move } = fixture()
  const bit = button === 1 ? 4 : 2
  act(() => hook.result.current.pointerDown(event('mouse', button, bit)))
  act(() => hook.result.current.pointerMove(event('pen', -1, 0)))
  act(() => hook.result.current.pointerMove(event('mouse', -1, bit)))
  expect(move).toHaveBeenCalledTimes(2)
  act(() => hook.result.current.pointerMove(event('pen', -1, 0)))
  act(() => hook.result.current.pointerUp(event('pen', 0, 0)))
  act(() => hook.result.current.pointerLeave(event('pen', -1, 0)))
  expect(input.auxiliaryMouseGestureActive()).toBe(true)
  if (button === 1) expect(input.drag?.kind).toBe('pan')
  expect(up).not.toHaveBeenCalled()
  act(() => hook.result.current.pointerUp(event('mouse', button, 0)))
  expect(up).toHaveBeenCalledOnce()
})

it('recognizes a driver reporting the middle button only through its buttons bitmask', () => {
  const { hook, event, down, up } = fixture()
  act(() => hook.result.current.pointerMove(event('pen', -1, 4)))
  expect(down.mock.lastCall![0].button).toBe(1)
  act(() => hook.result.current.pointerMove(event('pen', -1, 0)))
  expect(up).toHaveBeenCalledOnce()
})

it.each([3, 4])('never paints using back/forward button %s', button => {
  const { hook, event, down } = fixture()
  act(() => hook.result.current.pointerDown(event('pen', button, button === 3 ? 8 : 16)))
  expect(down).not.toHaveBeenCalled()
})

it('routes an enabled eraser tip as primary down/move/up and honors barrel preferences', () => {
  const preferences = DEFAULT_TABLET_PREFERENCES
  expect(penEraserToolEvent({ pointerType: 'pen', button: 5, buttons: 32 }, preferences)).toMatchObject({ button: 0, buttons: 1 })
  expect(penEraserToolEvent({ pointerType: 'pen', button: -1, buttons: 32 }, preferences)).toMatchObject({ button: -1, buttons: 1 })
  expect(penEraserToolEvent({ pointerType: 'pen', button: 5, buttons: 0 }, preferences)).toMatchObject({ button: 0, buttons: 0 })
  const pen = { pointerType: 'pen', button: 2, buttons: 2 }
  expect(deviceRightClickAction(pen, { ...preferences, rightClickAction: 'background', barrelButtonAction: 'eyedropper' })).toBe('foreground-eyedropper')
  expect(deviceRightClickAction(pen, { ...preferences, rightClickAction: 'lasso', barrelButtonAction: 'eraser' })).toBe('lasso')
})
