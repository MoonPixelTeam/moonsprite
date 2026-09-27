import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CanvasInputState } from '@/core/canvas-input'
import { createDocument } from '@/core/document-model'
import { preserveViewOnViewportChange } from '@/core/view-geometry'
import { useWorkspace } from '@/store/workspace'
import { beginWorkspaceResize, endWorkspaceResize } from './workspace-resize'
import { beginDocumentPaneDockResize } from './app/document-pane-dock-resize'
import { useCanvasViewportGeometry } from './useCanvasViewportGeometry'

let notifyResize: () => void
let bounds: DOMRect

beforeEach(() => {
  vi.useFakeTimers()
  useWorkspace.setState({ sessions: [], activeId: null })
  bounds = new DOMRect(0, 0, 320, 240)
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: ResizeObserverCallback) {
      notifyResize = () => callback([{} as ResizeObserverEntry], this as unknown as ResizeObserver)
    }
    observe() {}
    disconnect() {}
  })
})

afterEach(() => {
  cleanup()
  endWorkspaceResize()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function mountGeometry() {
  useWorkspace.getState().addSession(createDocument('viewport resizing', 512, 512, 'rgba'))
  const session = useWorkspace.getState().sessions[0]
  const stage = document.createElement('div')
  vi.spyOn(stage, 'getBoundingClientRect').mockImplementation(() => bounds)
  const ports: Parameters<typeof useCanvasViewportGeometry>[0] = {
    interfaceScale: 1,
    stageRef: { current: stage },
    canvasRef: { current: null },
    storedSession: session,
    session,
    inputRef: { current: new CanvasInputState() },
    rotationIndicatorPosition: 'canvas',
    liveViewRef: { current: session.view },
    pendingViewRef: { current: null },
    scheduleDraw: vi.fn(),
    drawNow: vi.fn()
  }
  const hook = renderHook(() => useCanvasViewportGeometry(ports))
  return { ...hook, ports, session }
}

it('ignores unchanged notifications without publishing Store changes or redrawing', () => {
  const { ports } = mountGeometry()
  const changed = vi.fn()
  const unsubscribe = useWorkspace.subscribe(changed)
  act(() => {
    notifyResize()
    notifyResize()
    vi.advanceTimersToNextFrame()
  })
  expect(ports.scheduleDraw).not.toHaveBeenCalled()
  expect(changed).not.toHaveBeenCalled()
  unsubscribe()
})

it('corrects each resize before paint and publishes the latest geometry once outside observer delivery', () => {
  const { ports, session } = mountGeometry()
  const initialView = { ...ports.liveViewRef.current }
  const sizeChanged = vi.spyOn(useWorkspace.getState(), 'setViewportSizeForDocument')
  act(() => {
    bounds = new DOMRect(10, 5, 340, 250)
    notifyResize()
    bounds = new DOMRect(20, 10, 360, 260)
    notifyResize()
  })
  expect(sizeChanged).not.toHaveBeenCalled()
  expect(ports.scheduleDraw).not.toHaveBeenCalled()
  expect(ports.drawNow).toHaveBeenCalledTimes(2)
  expect(ports.liveViewRef.current).toEqual(preserveViewOnViewportChange(
    initialView, { left: 0, top: 0, width: 320, height: 240 },
    { left: 20, top: 10, width: 360, height: 260 }, 'canvas'
  ))
  act(() => vi.advanceTimersToNextFrame())
  expect(sizeChanged).toHaveBeenCalledTimes(1)
  expect(ports.drawNow).toHaveBeenCalledTimes(2)
  expect(ports.liveViewRef.current).toEqual(preserveViewOnViewportChange(
    initialView, { left: 0, top: 0, width: 320, height: 240 },
    { left: 20, top: 10, width: 360, height: 260 }, 'canvas'
  ))
  const current = useWorkspace.getState().sessions[0]
  expect(current.viewportSize).toEqual({ width: 360, height: 260 })
  expect(current.revision).toBe(session.revision)
  expect(current.contentRevision).toBe(session.contentRevision)
})

it('flushes the deferred Store view when a dock resize ends at the same bounds', () => {
  const { ports } = mountGeometry()
  act(() => {
    beginWorkspaceResize()
    bounds = new DOMRect(20, 10, 360, 260)
    notifyResize()
    vi.advanceTimersToNextFrame()
  })
  expect(useWorkspace.getState().sessions[0].viewportSize.width).toBe(320)
  expect(ports.pendingViewRef.current).not.toBeNull()
  act(() => endWorkspaceResize())
  expect(useWorkspace.getState().sessions[0].viewportSize.width).toBe(360)
  expect(ports.pendingViewRef.current).toBeNull()
})

it('cancels pending resize work on unmount', () => {
  const { unmount, ports } = mountGeometry()
  bounds = new DOMRect(20, 10, 360, 260)
  act(() => notifyResize())
  unmount()
  act(() => vi.advanceTimersByTime(100))
  expect(ports.scheduleDraw).not.toHaveBeenCalled()
  expect(useWorkspace.getState().sessions[0].viewportSize.width).toBe(320)
})

it('defers frozen split geometry until release and preserves the final screen placement', () => {
  const { ports, session } = mountGeometry()
  const initialView = { ...ports.liveViewRef.current }
  const stage = ports.stageRef.current!
  const sizeChanged = vi.spyOn(useWorkspace.getState(), 'setViewportSizeForDocument')
  sizeChanged.mockClear()
  act(() => {
    notifyResize() // A notification queued before pointer down must also be skipped.
    beginWorkspaceResize()
    stage.dataset.canvasResizeFrozen = 'true'
    bounds = new DOMRect(60, 40, 240, 180)
    vi.advanceTimersToNextFrame()
    notifyResize()
    vi.advanceTimersToNextFrame()
  })
  expect(sizeChanged).not.toHaveBeenCalled()
  expect(ports.scheduleDraw).not.toHaveBeenCalled()
  expect(ports.liveViewRef.current).toEqual(initialView)
  act(() => {
    delete stage.dataset.canvasResizeFrozen
    endWorkspaceResize()
  })
  expect(sizeChanged).toHaveBeenCalledTimes(1)
  expect(ports.drawNow).toHaveBeenCalledTimes(1)
  expect(ports.liveViewRef.current).toEqual(preserveViewOnViewportChange(initialView,
    { left: 0, top: 0, width: 320, height: 240 }, { left: 60, top: 40, width: 240, height: 180 }, 'canvas'))
  expect(useWorkspace.getState().sessions[0].contentRevision).toBe(session.contentRevision)
})

it.each(['left', 'right', 'bottom'] as const)('repaints exposed canvas before releasing the %s dock', edge => {
  const { ports, session } = mountGeometry()
  const stage = ports.stageRef.current!
  stage.className = 'stage-surface'
  stage.style.cssText = 'width:320px;height:240px'
  const viewport = document.createElement('div')
  viewport.append(stage)
  vi.spyOn(viewport, 'getBoundingClientRect').mockImplementation(() => bounds)
  const initialView = { ...ports.liveViewRef.current }
  const historyPosition = session.history.position
  let gesture: ReturnType<typeof beginDocumentPaneDockResize>
  act(() => {
    beginWorkspaceResize()
    gesture = beginDocumentPaneDockResize(viewport, null, edge)
    bounds = edge === 'left' ? new DOMRect(-80, 0, 400, 240)
      : edge === 'right' ? new DOMRect(0, 0, 400, 240) : new DOMRect(0, 0, 320, 320)
    gesture!.update()
    notifyResize()
  })
  expect(ports.drawNow).toHaveBeenCalledTimes(1)
  expect(ports.liveViewRef.current).toEqual(preserveViewOnViewportChange(initialView,
    { left: 0, top: 0, width: 320, height: 240 },
    { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height }, 'canvas'))
  expect(useWorkspace.getState().sessions[0].viewportSize).toEqual({ width: 320, height: 240 })
  act(() => { gesture!.finish(); endWorkspaceResize() })
  expect(useWorkspace.getState().sessions[0].viewportSize).toEqual({ width: bounds.width, height: bounds.height })
  expect(session.history.position).toBe(historyPosition)
  expect(useWorkspace.getState().sessions[0].contentRevision).toBe(session.contentRevision)
})
