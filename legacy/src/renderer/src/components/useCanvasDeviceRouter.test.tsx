import { act, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { beginCanvasToolGesture, clearCanvasToolGestures, deferCanvasShortcut, endCanvasToolGesture, isCanvasToolGestureLocked } from '@/core/canvas-tool-gesture-lock'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { CanvasInputState } from '@/core/canvas-input'
import { DEFAULT_TABLET_PREFERENCES, RIGHT_CLICK_ACTIONS } from '@/core/file-preferences'
import type { DocumentSession } from '@/store/workspace'
import { withDeviceTemporaryTool } from './canvas-device-tools'
import { cancelsActiveCanvasDrawWhileRightHeld, cancelsActiveCanvasDrawWithRightClick, useCanvasDeviceRouter } from './useCanvasDeviceRouter'

afterEach(() => clearCanvasToolGestures())

const captureLossHarness = () => {
  const input = new CanvasInputState()
  const canvas = document.createElement('canvas')
  canvas.hasPointerCapture = () => false
  const session = { document: { id: 'capture-loss' }, tool: 'pencil' } as DocumentSession
  const cancelActiveCanvasInteraction = vi.fn(() => { input.resetInteraction(); clearCanvasToolGestures() })
  const ports = {
    inputRef: { current: input }, session, canvasRef: { current: canvas },
    tabletPreferences: DEFAULT_TABLET_PREFERENCES, liveInputSession: () => session,
    cancelActiveCanvasInteraction, hideEyedropperMagnifier: vi.fn(), updateCursor: vi.fn(),
    scheduleBrushPreviewOverlay: vi.fn(), hidePenCursor: vi.fn(),
    handlePointerUp: vi.fn(() => input.finish()), syncPenCursor: vi.fn()
  } as unknown as Parameters<typeof useCanvasDeviceRouter>[0]
  const hook = renderHook(() => useCanvasDeviceRouter(ports))
  input.drag = { kind: 'draw', start: { x: 0, y: 0 }, last: { x: 1, y: 1 } }
  const event = (pointerId = 9) => {
    const nativeEvent = { pointerId, pointerType: 'pen', button: 0, buttons: 0, timeStamp: performance.now() }
    return { ...nativeEvent, nativeEvent, currentTarget: canvas, preventDefault: vi.fn() } as unknown as ReactPointerEvent<HTMLCanvasElement>
  }
  return { ...hook, input, event, cancelActiveCanvasInteraction }
}

it('cancels unexpected pen capture loss and allows subsequent undo shortcuts to run', async () => {
  const h = captureLossHarness()
  beginCanvasToolGesture(9)
  const queuedBeforeCancel = vi.fn()
  deferCanvasShortcut(queuedBeforeCancel)
  act(() => h.result.current.pointerLostCapture(h.event()))
  expect(h.cancelActiveCanvasInteraction).toHaveBeenCalledOnce()
  expect(h.input.drag).toBeNull()
  expect(isCanvasToolGestureLocked()).toBe(false)
  const undo = vi.fn()
  deferCanvasShortcut(undo)
  await Promise.resolve()
  expect(queuedBeforeCancel).not.toHaveBeenCalled()
  expect(undo).toHaveBeenCalledOnce()
  h.unmount()
})

it('does not cancel another pointer or a polygon between normal clicks on capture loss', () => {
  const h = captureLossHarness()
  beginCanvasToolGesture(9)
  act(() => h.result.current.pointerLostCapture(h.event(10)))
  expect(isCanvasToolGestureLocked()).toBe(true)
  expect(h.cancelActiveCanvasInteraction).not.toHaveBeenCalled()
  endCanvasToolGesture(9)
  h.input.drag = { kind: 'polygon-lasso', start: { x: 0, y: 0 }, last: { x: 1, y: 1 }, path: [{ x: 0, y: 0 }] }
  act(() => h.result.current.pointerLostCapture(h.event()))
  expect(h.input.drag?.kind).toBe('polygon-lasso')
  expect(h.cancelActiveCanvasInteraction).not.toHaveBeenCalled()
  h.unmount()
})

it('finishes a normal stroke before queued undo and ignores the following capture loss', async () => {
  const h = captureLossHarness()
  beginCanvasToolGesture(9)
  const undo = vi.fn(() => expect(h.input.drag).toBeNull())
  deferCanvasShortcut(undo)
  act(() => h.result.current.pointerUp(h.event()))
  act(() => h.result.current.pointerLostCapture(h.event()))
  expect(h.cancelActiveCanvasInteraction).not.toHaveBeenCalled()
  expect(isCanvasToolGestureLocked()).toBe(false)
  await Promise.resolve()
  expect(undo).toHaveBeenCalledOnce()
  h.unmount()
})

it.each(['pointerUp', 'pointerCancel'] as const)('releases only the filtered pen lock on %s while an auxiliary mouse owns the gesture', (handler) => {
  const h = captureLossHarness()
  h.input.acceptPointerDeviceEvent({ pointerId: 1, pointerType: 'mouse', buttons: 4, timeStamp: performance.now() }, true)
  beginCanvasToolGesture(9)
  beginCanvasToolGesture(1)
  act(() => h.result.current[handler](h.event()))
  expect(isCanvasToolGestureLocked(9)).toBe(false)
  expect(isCanvasToolGestureLocked(1)).toBe(true)
  expect(h.cancelActiveCanvasInteraction).not.toHaveBeenCalled()
  h.unmount()
})

it('cancels only an active non-navigation gesture when the right button joins a left-button gesture', () => {
  expect(cancelsActiveCanvasDrawWithRightClick({ button: 2, buttons: 3 }, { kind: 'draw' } as never)).toBe(true)
  expect(cancelsActiveCanvasDrawWithRightClick({ button: 0, buttons: 3 }, { kind: 'draw' } as never)).toBe(true)
  expect(cancelsActiveCanvasDrawWithRightClick({ button: 2, buttons: 2 }, { kind: 'draw' } as never)).toBe(false)
  expect(cancelsActiveCanvasDrawWithRightClick({ button: 2, buttons: 3 }, { kind: 'pan' } as never)).toBe(false)
  expect(cancelsActiveCanvasDrawWhileRightHeld({ buttons: 3 }, { kind: 'draw' } as never)).toBe(true)
})

it('cancels when the browser reports the joined right button through pointer movement', () => {
  const input = new CanvasInputState()
  input.drag = { kind: 'draw', start: { x: 0, y: 0 }, last: { x: 0, y: 0 } }
  const cancelActiveCanvasInteraction = vi.fn()
  const handlePointerMove = vi.fn()
  const session = { document: { id: 'cancel-draw-move-test' }, tool: 'pencil' } as DocumentSession
  const ports = {
    inputRef: { current: input }, session, canvasRef: { current: document.createElement('canvas') },
    tabletPreferences: DEFAULT_TABLET_PREFERENCES, liveInputSession: () => session,
    cancelActiveCanvasInteraction, handlePointerMove, hideEyedropperMagnifier: vi.fn(), updateCursor: vi.fn()
  } as unknown as Parameters<typeof useCanvasDeviceRouter>[0]
  const { result, unmount } = renderHook(() => useCanvasDeviceRouter(ports))
  const nativeEvent = { pointerId: 9, pointerType: 'mouse', button: -1, buttons: 3, timeStamp: performance.now() }
  const event = { ...nativeEvent, nativeEvent, currentTarget: { hasPointerCapture: vi.fn(() => false), releasePointerCapture: vi.fn() }, preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as ReactPointerEvent<HTMLCanvasElement>

  act(() => result.current.pointerMove(event))

  expect(cancelActiveCanvasInteraction).toHaveBeenCalledOnce()
  expect(handlePointerMove).not.toHaveBeenCalled()
  expect(event.preventDefault).toHaveBeenCalledOnce()
  unmount()
})

it('rolls back an in-flight draw instead of routing the joined right click to a tool', () => {
  const input = new CanvasInputState()
  input.drag = { kind: 'draw', start: { x: 0, y: 0 }, last: { x: 0, y: 0 } }
  const cancelActiveCanvasInteraction = vi.fn()
  const handlePointerDown = vi.fn()
  const session = { document: { id: 'cancel-draw-test' }, tool: 'pencil' } as DocumentSession
  const ports = {
    inputRef: { current: input }, session, canvasRef: { current: document.createElement('canvas') },
    tabletPreferences: DEFAULT_TABLET_PREFERENCES, liveInputSession: () => session,
    cancelActiveCanvasInteraction, handlePointerDown, hideEyedropperMagnifier: vi.fn(), updateCursor: vi.fn()
  } as unknown as Parameters<typeof useCanvasDeviceRouter>[0]
  const { result, unmount } = renderHook(() => useCanvasDeviceRouter(ports))
  const nativeEvent = { pointerId: 9, pointerType: 'mouse', button: 2, buttons: 3, timeStamp: performance.now() }
  const event = { ...nativeEvent, nativeEvent, currentTarget: { hasPointerCapture: vi.fn(() => false), releasePointerCapture: vi.fn() }, preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as ReactPointerEvent<HTMLCanvasElement>

  act(() => result.current.pointerDown(event))

  expect(cancelActiveCanvasInteraction).toHaveBeenCalledOnce()
  expect(handlePointerDown).not.toHaveBeenCalled()
  expect(event.preventDefault).toHaveBeenCalledOnce()
  unmount()
})

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

it.each([
  { tool: 'selection', selectionKind: 'polygon-lasso', shapeKind: undefined, active: false },
  { tool: 'selection', selectionKind: 'polygon-lasso', shapeKind: undefined, active: true },
  { tool: 'shape', selectionKind: undefined, shapeKind: 'polygon', active: false },
  { tool: 'shape', selectionKind: undefined, shapeKind: 'polygon', active: true }
] as const)('routes right clicks to the $tool polygon with active=$active', ({ tool, selectionKind, shapeKind, active }) => {
  const input = new CanvasInputState()
  const session = { document: { id: 'polygon-right-click' }, tool, selectionKind, shapeKind } as DocumentSession
  if (active) input.drag = { kind: tool === 'selection' ? 'polygon-lasso' : 'polygon-shape', start: { x: 1, y: 1 }, last: { x: 2, y: 2 }, path: [{ x: 1, y: 1 }, { x: 2, y: 2 }] }
  const handlePointerDown = vi.fn()
  const ports = {
    inputRef: { current: input }, session, canvasRef: { current: document.createElement('canvas') },
    tabletPreferences: { ...DEFAULT_TABLET_PREFERENCES, rightClickAction: 'eraser' }, liveInputSession: () => session,
    handlePointerDown, syncPenCursor: vi.fn()
  } as unknown as Parameters<typeof useCanvasDeviceRouter>[0]
  const { result, unmount } = renderHook(() => useCanvasDeviceRouter(ports))
  const nativeEvent = { pointerId: 9, pointerType: 'mouse', button: 2, buttons: 2, timeStamp: performance.now() }
  const event = { ...nativeEvent, nativeEvent, preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as ReactPointerEvent<HTMLCanvasElement>
  act(() => result.current.pointerDown(event))
  expect(handlePointerDown).toHaveBeenCalledWith(event)
  expect(input.temporaryTool).toBeNull()
  expect(input.temporaryRightClickAction).toBeNull()
  expect(event.preventDefault).toHaveBeenCalled()
  unmount()
})

it('preserves the live pen cursor when an ignored compatibility mouse move follows it', () => {
  const input = new CanvasInputState()
  const hidePenCursor = vi.fn()
  vi.spyOn(input, 'acceptPointerDeviceEvent').mockReturnValue(false)
  const session = { document: { id: 'cursor-test' }, tool: 'selection', selectionKind: 'brush' } as DocumentSession
  const ports = {
    inputRef: { current: input }, session, canvasRef: { current: document.createElement('canvas') },
    tabletPreferences: DEFAULT_TABLET_PREFERENCES, liveInputSession: () => session,
    hidePenCursor, handlePointerMove: vi.fn(), syncPenCursor: vi.fn()
  } as unknown as Parameters<typeof useCanvasDeviceRouter>[0]
  const { result, unmount } = renderHook(() => useCanvasDeviceRouter(ports))
  const nativeEvent = { pointerId: 9, pointerType: 'mouse', button: -1, buttons: 0, timeStamp: performance.now() }
  const event = { ...nativeEvent, nativeEvent, preventDefault: vi.fn() } as unknown as ReactPointerEvent<HTMLCanvasElement>

  act(() => result.current.pointerMove(event))

  expect(hidePenCursor).not.toHaveBeenCalled()
  unmount()
})

it('publishes the cursor before entering the expensive tool move path', () => {
  const input = new CanvasInputState()
  const canvas = document.createElement('canvas')
  const sequence: string[] = []
  const session = { document: { id: 'cursor-order-test' }, tool: 'pencil' } as DocumentSession
  const ports = {
    inputRef: { current: input }, session, canvasRef: { current: canvas },
    tabletPreferences: DEFAULT_TABLET_PREFERENCES, liveInputSession: () => session,
    handlePointerMove: vi.fn(() => sequence.push('tool')),
    syncPenCursor: vi.fn(() => sequence.push('cursor')),
    hidePenCursor: vi.fn(), hideEyedropperMagnifier: vi.fn()
  } as unknown as Parameters<typeof useCanvasDeviceRouter>[0]
  const { result, unmount } = renderHook(() => useCanvasDeviceRouter(ports))
  const nativeEvent = { pointerId: 4, pointerType: 'mouse', button: -1, buttons: 0, timeStamp: performance.now() }
  const event = { ...nativeEvent, nativeEvent, currentTarget: canvas, preventDefault: vi.fn() } as unknown as ReactPointerEvent<HTMLCanvasElement>

  act(() => result.current.pointerMove(event))

  expect(sequence).toEqual(['cursor', 'tool'])
  unmount()
})
