import { act, cleanup, fireEvent, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CanvasInputState } from '@/core/canvas-input'
import { createDocument } from '@/core/document-model'
import { sessionFromDocument } from '@/store/workspace-session'
import { useWorkspace } from '@/store/workspace'
import { useCanvasDeviceRouter } from './useCanvasDeviceRouter'
import { CANVAS_HOVER_DISMISS } from './useCanvasHoverDismiss'

afterEach(() => { cleanup(); vi.restoreAllMocks(); useWorkspace.setState({ sessions: [], activeId: null }) })

function setup() {
  const session = sessionFromDocument(createDocument('wheel focus', 32, 32, 'rgba'))
  session.tool = 'pencil'
  useWorkspace.setState({ sessions: [session], activeId: session.document.id })
  const input = new CanvasInputState()
  input.pointer.visible = true
  const stage = document.createElement('div')
  const canvas = document.createElement('canvas')
  canvas.className = 'stage-canvas'
  const reference = document.createElement('div')
  reference.className = 'canvas-references'
  stage.append(canvas, reference)
  document.body.append(stage)
  const scheduleZoomPreview = vi.fn(), updateCursorAt = vi.fn(), syncPenCursor = vi.fn()
  const setBrushSize = vi.spyOn(useWorkspace.getState(), 'setBrushSize').mockImplementation(() => {})
  const hook = renderHook(() => useCanvasDeviceRouter({
    inputRef: { current: input }, session, canvasRef: { current: canvas },
    stageBounds: () => ({ left: 0, top: 0, right: 32, bottom: 32 }),
    stageSize: () => ({ width: 32, height: 32 }), stagePoint: (x: number, y: number) => ({ x, y }),
    liveInputSession: () => session, liveViewRef: { current: session.view },
    activeLayer: session.document.layers[0], canvasResizePreviewRef: { current: null },
    modifierActive: (event: { ctrlKey: boolean }, id: string) => id === 'brushSizeWheelAdjust' && event.ctrlKey,
    constrainCanvasView: (view: typeof session.view) => view,
    wheelZoomEnabled: true, scheduleZoomPreview, updateCursorAt, syncPenCursor,
    hidePenCursor: vi.fn(), hideEyedropperMagnifier: vi.fn(), draw: vi.fn(),
    scheduleDraw: vi.fn(), cancelActiveCanvasInteraction: vi.fn()
  } as unknown as Parameters<typeof useCanvasDeviceRouter>[0]))
  return { ...hook, canvas, reference, input, session, scheduleZoomPreview, updateCursorAt, syncPenCursor, setBrushSize,
    dispose() { hook.unmount(); stage.remove() } }
}

function wheel(target: Element, ctrlKey = false) {
  const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100, clientX: 16, clientY: 16, ctrlKey })
  act(() => { target.dispatchEvent(event) })
  return event
}

it.each(['blur', 'moonsprite:extension-pointer-enter', CANVAS_HOVER_DISMISS])('routes the first wheel after %s without restoring hover', reason => {
  const view = setup()
  try {
    fireEvent(window, new Event(reason))
    for (const target of [view.canvas, view.reference]) {
      view.scheduleZoomPreview.mockClear()
      expect(wheel(target).defaultPrevented).toBe(true)
      expect(view.scheduleZoomPreview).toHaveBeenCalledOnce()
      expect(view.scheduleZoomPreview.mock.calls[0][0].zoom).toBeGreaterThan(view.session.view.zoom)
      expect(view.input.pointer.visible).toBe(false)
      expect(view.result.current.wheelBrushSizePreviewRef.current).toBe(false)
    }
    expect(view.updateCursorAt).not.toHaveBeenCalled()
    expect(view.syncPenCursor).not.toHaveBeenCalled()
    expect(wheel(document.body).defaultPrevented).toBe(false)
    expect(view.scheduleZoomPreview).toHaveBeenCalledOnce()
  } finally { view.dispose() }
})

it('allows modifier wheel adjustment after blur without showing the brush preview', () => {
  const view = setup()
  try {
    fireEvent(window, new Event('blur'))
    expect(wheel(view.canvas, true).defaultPrevented).toBe(true)
    expect(view.setBrushSize).toHaveBeenCalledWith(view.session.brushSize + 1)
    expect(view.result.current.wheelBrushSizePreviewRef.current).toBe(false)
    expect(view.input.pointer.visible).toBe(false)
    expect(view.updateCursorAt).not.toHaveBeenCalled()
    expect(view.scheduleZoomPreview).not.toHaveBeenCalled()
  } finally { view.dispose() }
})

it('ignores wheel input while the document is hidden', () => {
  const view = setup()
  try {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    expect(wheel(view.canvas).defaultPrevented).toBe(false)
    expect(view.scheduleZoomPreview).not.toHaveBeenCalled()
  } finally { view.dispose() }
})
