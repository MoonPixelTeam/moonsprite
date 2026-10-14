import type { RefObject } from 'react'
import { CanvasInputState } from '@/core/canvas-input-controller'
import type { CanvasDragState as DragState, CanvasPoint as Point } from '@/core/canvas-input-contracts'
import { selectionPivotAtDragPoint } from '@/core/canvas-input-hit-test'
import { drawingAnchorActive } from '@/core/canvas-centered-drawing'
import { canvasCursors } from '@/core/canvas-visuals'
import { useWorkspace, type DocumentSession } from '@/store/workspace'

interface Ports {
  selectionPivotHitAt: (clientX: number, clientY: number) => boolean
  selectionPivotForSession: (session: DocumentSession) => Point | null
  localContinuousPointAt: (clientX: number, clientY: number) => Point | null
  inputRef: RefObject<CanvasInputState>
  scheduleDraw: () => void
  updateCursor: (event: React.PointerEvent<HTMLCanvasElement>) => void
  draw: () => void
}

/** Shared pointer gesture for selection pivots and drawing anchors. */
export function createCanvasPivotInput(ports: Ports) {
  function beginPivot({
    event,
    viewNavigationToolActive,
    pivotSamplingHeld,
    freeTransformActive,
    session
  }: {
    event: React.PointerEvent<HTMLCanvasElement>
    viewNavigationToolActive: boolean
    pivotSamplingHeld: boolean
    freeTransformActive: boolean
    session: DocumentSession
  }): boolean {
    const { selectionPivotHitAt, selectionPivotForSession, localContinuousPointAt, inputRef } = ports
    if (
      event.button === 0 &&
      !viewNavigationToolActive &&
      !event.shiftKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !pivotSamplingHeld &&
      !freeTransformActive &&
      selectionPivotHitAt(event.clientX, event.clientY)
    ) {
      const currentSession = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id) ?? session
      const pivot = selectionPivotForSession(currentSession)
      const pointer = localContinuousPointAt(event.clientX, event.clientY)
      if (pivot && pointer) {
        inputRef.current.drag = { kind: 'move-selection-pivot', drawingAnchorMove: drawingAnchorActive(currentSession), start: pointer, last: pointer, selectionPivotStart: pivot, previewPivot: { ...pivot } }
        event.currentTarget.setPointerCapture(event.pointerId)
        event.currentTarget.style.cursor = canvasCursors.default
        event.preventDefault()
        return true
      }
    }
    return false
  }

  function movePivot({ drag, event }: { drag: DragState; event: React.PointerEvent<HTMLCanvasElement> }): boolean {
    const { localContinuousPointAt, scheduleDraw } = ports
    if (drag.kind === 'move-selection-pivot' && drag.selectionPivotStart) {
      const continuousPoint = localContinuousPointAt(event.clientX, event.clientY)
      if (!continuousPoint) return true
      drag.last = continuousPoint
      drag.previewPivot = selectionPivotAtDragPoint(drag.selectionPivotStart, drag.start, continuousPoint)
      if (drag.drawingAnchorMove) drag.previewPivot = { x: Math.round(drag.previewPivot.x * 2) / 2, y: Math.round(drag.previewPivot.y * 2) / 2 }
      event.currentTarget.style.cursor = canvasCursors.move
      scheduleDraw()
      return true
    }
    return false
  }

  function endPivot({
    drag,
    state,
    event
  }: {
    drag: DragState
    state: ReturnType<typeof useWorkspace.getState>
    event: React.PointerEvent<HTMLCanvasElement>
  }): boolean {
    const { updateCursor, draw } = ports
    if (drag.kind === 'move-selection-pivot') {
      if (drag.previewPivot) {
        if (drag.drawingAnchorMove) state.setDrawingAnchor(drag.previewPivot)
        else state.setSelectionPivot(drag.previewPivot)
      }
      updateCursor(event)
      draw()
      return true
    }
    return false
  }

  return { beginPivot, movePivot, endPivot }
}
