import { act, cleanup, fireEvent, render, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDocument } from '@/core/document-model'
import { CanvasInputState, type CanvasDragState } from '@/core/canvas-input'
import { useWorkspace } from '@/store/workspace'
import { CanvasStage } from './CanvasStage'
import { useCanvasSelectionTransform } from './useCanvasSelectionTransform'
import { renderCanvasFrame } from './canvas-render-frame'

// Keep real controllers, geometry, pointer routing and Store commands. Rendering
// pixels belongs to the renderer tests and requires a browser canvas backend.
vi.mock('./canvas-render-frame', () => ({ renderCanvasFrame: vi.fn() }))

class TestPointerEvent extends MouseEvent {
  readonly pointerId: number
  readonly pointerType: string
  readonly pressure: number
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init)
    this.pointerId = init.pointerId ?? 1
    this.pointerType = init.pointerType ?? 'mouse'
    this.pressure = init.pressure ?? 0.5
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  useWorkspace.setState({ sessions: [], activeId: null })
  vi.stubGlobal('PointerEvent', TestPointerEvent)
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 320, 240))
  Object.defineProperty(HTMLCanvasElement.prototype, 'setPointerCapture', { configurable: true, value: vi.fn() })
  Object.defineProperty(HTMLCanvasElement.prototype, 'releasePointerCapture', { configurable: true, value: vi.fn() })
  Object.defineProperty(HTMLCanvasElement.prototype, 'hasPointerCapture', { configurable: true, value: () => true })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function addSession(name = 'controller ownership') {
  useWorkspace.getState().addSession(createDocument(name, 8, 8, 'rgba'))
  return useWorkspace.getState().sessions.at(-1)!
}

describe('CanvasStage controller composition', () => {
  it('routes a real hand drag through down/move/up without changing document revision', () => {
    addSession()
    useWorkspace.getState().setTool('hand')
    const session = useWorkspace.getState().sessions[0]
    const { container, unmount } = render(<CanvasStage session={session} />)
    const canvas = container.querySelector<HTMLCanvasElement>('.stage-canvas')!
    const before = { ...useWorkspace.getState().sessions[0].view }
    const revision = session.revision
    fireEvent.pointerDown(canvas, { pointerId: 1, button: 0, buttons: 1, clientX: 160, clientY: 120 })
    fireEvent.pointerMove(canvas, { pointerId: 1, button: 0, buttons: 1, clientX: 180, clientY: 130 })
    fireEvent.pointerUp(canvas, { pointerId: 1, button: 0, buttons: 0, clientX: 180, clientY: 130 })
    const after = useWorkspace.getState().sessions[0]
    expect(after.view.panX).toBeGreaterThan(before.panX)
    expect(after.view.panY).toBeGreaterThan(before.panY)
    expect(after.revision).toBe(revision)
    expect(canvas.setPointerCapture).toHaveBeenCalledWith(1)
    unmount()
    vi.mocked(renderCanvasFrame).mockClear()
    act(() => vi.advanceTimersByTime(500))
    expect(renderCanvasFrame).not.toHaveBeenCalled()
  })

  it('cancels a pending selection preview on document switch and unmount without a viewport owner', () => {
    const first = addSession('first')
    const second = addSession('second')
    const cancelFrame = vi.spyOn(window, 'cancelAnimationFrame')
    const draw = vi.fn()
    const inputRef = { current: new CanvasInputState() }
    const { result, rerender, unmount } = renderHook(
      ({ session }) =>
        useCanvasSelectionTransform({
          session,
          inputRef,
          draw
        } as unknown as Parameters<typeof useCanvasSelectionTransform>[0]),
      { initialProps: { session: first } }
    )
    const drag = { kind: 'move-selection', start: { x: 0, y: 0 }, last: { x: 0, y: 0 } } as CanvasDragState
    inputRef.current.drag = drag
    act(() => result.current.scheduleSelectionPreview(drag))
    rerender({ session: second })
    expect(cancelFrame).toHaveBeenCalledTimes(1)
    act(() => result.current.scheduleSelectionPreview(drag))
    unmount()
    expect(cancelFrame).toHaveBeenCalledTimes(2)
    act(() => vi.advanceTimersByTime(100))
    expect(draw).not.toHaveBeenCalled()
  })
})
