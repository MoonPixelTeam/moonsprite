import { useWorkspace, type DocumentSession } from '@/store/workspace'
import { type CanvasPoint as Point } from '@/core/canvas-input'
import { canvasCursors } from '@/core/canvas-visuals'
import { moveSymmetryCenter, symmetryAxisDragAllowed } from '@/core/symmetry'
import { SymmetryDragState } from './canvas-stage-helpers'
export function createCanvasSymmetryMove(ports: {
  symmetryDragRef: import('react').RefObject<SymmetryDragState | null>
  symmetryAxisPreferences: import('@/core/file-preferences').SymmetryAxisPreferences
  updateCursor: (event: React.PointerEvent<HTMLCanvasElement>) => void
  localContinuousPointAt: (clientX: number, clientY: number) => Point | null
  symmetryCenter: import('@/core/symmetry').SymmetryCenter
  scheduleDraw: () => void
}) {
  return ({ event, session }: { event: React.PointerEvent<HTMLCanvasElement>; session: DocumentSession }) => {
    const { symmetryDragRef, symmetryAxisPreferences, updateCursor, localContinuousPointAt, symmetryCenter, scheduleDraw } = ports
    const symmetryDrag = symmetryDragRef.current
    if (symmetryDrag) {
      if (!symmetryAxisDragAllowed(symmetryAxisPreferences.locked, event.ctrlKey)) {
        const pointerId = symmetryDrag.pointerId
        symmetryDragRef.current = null
        if (event.currentTarget.hasPointerCapture(pointerId)) event.currentTarget.releasePointerCapture(pointerId)
        updateCursor(event)
        return true
      }
      const point = localContinuousPointAt(event.clientX, event.clientY)
      if (point)
        useWorkspace.getState().setSymmetryCenter(moveSymmetryCenter(symmetryCenter, symmetryDrag.axis, point, session.document.width, session.document.height))
      event.currentTarget.style.cursor = canvasCursors.move
      scheduleDraw()
      return true
    }
    return false
  }
}
