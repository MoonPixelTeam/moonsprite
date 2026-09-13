import { act, cleanup, fireEvent, render, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDocument } from '@/core/document-model'
import { CanvasInputState, type CanvasDragState } from '@/core/canvas-input'
import { useWorkspace } from '@/store/workspace'
import { CanvasStage } from './CanvasStage'
import { useCanvasSelectionTransform } from './useCanvasSelectionTransform'
import { renderCanvasFrame } from './canvas-render-frame'
import { beginWorkspaceResize, endWorkspaceResize } from './workspace-resize'

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
  it('skips queued and newly requested draws while a split surface is frozen, then redraws on release', () => {
    const session = addSession('frozen split')
    const { container } = render(<CanvasStage session={session} />)
    const surface = container.querySelector<HTMLElement>('.stage-surface')!
    vi.mocked(renderCanvasFrame).mockClear()
    act(() => {
      beginWorkspaceResize()
      surface.dataset.canvasResizeFrozen = 'true'
      vi.advanceTimersToNextFrame()
      window.dispatchEvent(new Event('moonsprite:preferences-changed'))
      vi.advanceTimersToNextFrame()
    })
    expect(renderCanvasFrame).not.toHaveBeenCalled()
    act(() => {
      delete surface.dataset.canvasResizeFrozen
      endWorkspaceResize()
      vi.advanceTimersToNextFrame()
    })
    expect(renderCanvasFrame).toHaveBeenCalledTimes(1)
  })

  it('draws only the visible tab among eight resident canvases and catches up on activation', () => {
    const sessions = Array.from({ length: 8 }, (_, index) => addSession(`resident ${index}`))
    render(<>{sessions.map(session => <div key={session.document.id} className="document-tab-stage" data-document-id={session.document.id}>
      <CanvasStage session={session} />
    </div>)}</>)
    vi.mocked(renderCanvasFrame).mockClear()
    act(() => vi.advanceTimersToNextFrame())
    expect(renderCanvasFrame).toHaveBeenCalledTimes(1)
    expect(vi.mocked(renderCanvasFrame).mock.calls[0][0].resources.canvasRef.current?.closest('.document-tab-stage')?.getAttribute('data-document-id')).toBe(sessions[7].document.id)

    vi.mocked(renderCanvasFrame).mockClear()
    act(() => {
      useWorkspace.getState().setViewForDocument(sessions[0].document.id, { zoom: 6 })
      window.dispatchEvent(new Event('moonsprite:preferences-changed'))
    })
    act(() => vi.advanceTimersToNextFrame())
    expect(renderCanvasFrame).toHaveBeenCalledTimes(1)

    vi.mocked(renderCanvasFrame).mockClear()
    act(() => useWorkspace.getState().setActive(sessions[0].document.id))
    act(() => vi.advanceTimersToNextFrame())
    expect(renderCanvasFrame).toHaveBeenCalledTimes(1)
    expect(vi.mocked(renderCanvasFrame).mock.calls[0][0].resources.liveViewRef.current.zoom).toBe(6)
  })

  it('skips a queued frame if its tab becomes hidden before the RAF runs', () => {
    const first = addSession('queued first'), second = addSession('queued second')
    act(() => useWorkspace.getState().setActive(first.document.id))
    render(<>{[first, second].map(session => <div key={session.document.id} className="document-tab-stage" data-document-id={session.document.id}>
      <CanvasStage session={session} />
    </div>)}</>)
    vi.mocked(renderCanvasFrame).mockClear()
    act(() => useWorkspace.getState().setActive(second.document.id))
    act(() => vi.advanceTimersToNextFrame())
    expect(renderCanvasFrame).toHaveBeenCalledTimes(1)
    expect(vi.mocked(renderCanvasFrame).mock.calls[0][0].resources.canvasRef.current?.closest('.document-tab-stage')?.getAttribute('data-document-id')).toBe(second.document.id)
  })

  it('continues drawing every visible split pane even when only one document is active', () => {
    const first = addSession('split first'), second = addSession('split second')
    render(<>{[first, second].map(session => <section key={session.document.id} className="document-pane">
      <CanvasStage session={session} />
    </section>)}</>)
    vi.mocked(renderCanvasFrame).mockClear()
    act(() => vi.advanceTimersToNextFrame())
    expect(renderCanvasFrame).toHaveBeenCalledTimes(2)
    vi.mocked(renderCanvasFrame).mockClear()
    act(() => {
      useWorkspace.getState().setActive(first.document.id)
      window.dispatchEvent(new Event('moonsprite:preferences-changed'))
    })
    act(() => vi.advanceTimersToNextFrame())
    expect(renderCanvasFrame).toHaveBeenCalledTimes(2)
  })

  it('coalesces wheel zoom with a pending canvas draw and paints the final view', () => {
    const session = addSession('zoom scheduling')
    const revision = session.revision
    const contentRevision = session.contentRevision
    const { container } = render(<CanvasStage session={session} />)
    const canvas = container.querySelector<HTMLCanvasElement>('.stage-canvas')!
    vi.mocked(renderCanvasFrame).mockClear()
    // Mount already queued a draw. Multiple wheel events must join it.
    for (let index = 0; index < 3; index++) {
      fireEvent.wheel(canvas, { deltaY: -100, clientX: 160, clientY: 120 })
    }
    act(() => vi.advanceTimersToNextFrame())
    expect(renderCanvasFrame).toHaveBeenCalledTimes(1)
    const { resources } = vi.mocked(renderCanvasFrame).mock.calls[0][0]
    const zoom = resources.liveViewRef.current.zoom
    expect(zoom).toBeGreaterThan(session.view.zoom)
    expect(resources.zoomPreviewStartRef.current).not.toBeNull()
    act(() => vi.advanceTimersByTime(150))
    expect(renderCanvasFrame).toHaveBeenCalledTimes(2)
    expect(resources.zoomPreviewStartRef.current).toBeNull()
    const committed = useWorkspace.getState().sessions[0]
    expect(committed.view.zoom).toBe(zoom)
    expect(committed.revision).toBe(revision)
    expect(committed.contentRevision).toBe(contentRevision)
  })

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
