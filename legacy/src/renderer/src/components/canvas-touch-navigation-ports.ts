import { useWorkspace } from '@/store/workspace'
import { tabletFeedback } from '@/core/tablet-interaction'
import { clampCanvasZoom as clampZoom, createCanvasPanDrag } from '@/core/canvas-input'
import { canvasCursors } from '@/core/canvas-visuals'
import type { Ports } from './canvas-device-router-ports'
import type { TouchNavigationPorts } from './canvas-touch-navigation'

/** Adapt touch navigation to the canvas preview and document command boundaries. */
export function canvasTouchNavigationPorts(ports: Ports): TouchNavigationPorts {
  return {
    blocked: () => ports.inputRef.current.auxiliaryMouseGestureActive(),
    viewportPoint: point => ports.stagePoint(point.x, point.y),
    cancelDrawing: () => { ports.cancelActiveCanvasInteraction(); ports.inputRef.current.resetPointerDeviceState() },
    history: action => {
      const state = useWorkspace.getState()
      if (state.activeId !== ports.session.document.id) return
      state[action]()
      tabletFeedback(action === 'undo' ? 'undo' : 'redo')
    },
    sample: event => {
      ports.inputRef.current.setTemporaryTool(event.pointerId, 'eyedropper')
      const routed = Object.assign(Object.create(event), { currentTarget: ports.canvasRef.current, button: 0, buttons: 1 })
      ports.handlePointerDown(routed as React.PointerEvent<HTMLCanvasElement>)
    },
    feedback: tabletFeedback,
    read: () => ({
      preferences: ports.tabletPreferences,
      view: { ...ports.session.view, ...ports.liveViewRef.current },
      documentSize: ports.session.document,
      viewportSize: ports.stageSize(),
      rotationIndicatorPosition: ports.rotationIndicatorPosition
    }),
    beginPan: (point) => {
      const view = ports.liveViewRef.current
      ports.inputRef.current.drag = createCanvasPanDrag({ x: view.panX, y: view.panY }, point)
      ports.beginPanPreview()
    },
    endPan: (commit) => {
      if (ports.inputRef.current.drag?.kind !== 'pan') return
      ports.inputRef.current.finish()
      if (commit) ports.finishPanPreview()
    },
    preview: (geometry) => {
      const view = { ...ports.session.view, ...geometry }
      ports.liveViewRef.current = view
      ports.applyRotationStyle(view)
      ports.scheduleZoomPreview(view)
    },
    finishPinch: (commitRotation) => {
      const rotation = ports.liveViewRef.current.rotation
      ports.finishZoomPreview()
      if (commitRotation) useWorkspace.getState().setViewForDocument(ports.session.document.id, { rotation })
    },
    constrain: (view, size) => ports.constrainCanvasView({ ...ports.session.view, ...view }, size),
    clampZoom,
    grabbingCursor: canvasCursors.grabbing
  }
}
