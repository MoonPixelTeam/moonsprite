import { useWorkspace, type DocumentSession } from '@/store/workspace'
import { viewPanDeltaFromScreen } from '@/core/view-geometry'
import { CanvasInputState, type CanvasPoint as Point } from '@/core/canvas-input'
export function createCanvasAutoPan(ports: {
  inputRef: import('react').RefObject<CanvasInputState>
  stageSize: () => {
    width: number
    height: number
  }
  stagePoint: (clientX: number, clientY: number) => Point
  liveViewRef: import('react').RefObject<import('@shared/types-view').ViewState>
  rotationIndicatorPosition: import('@/core/file-preferences').RotationIndicatorPosition
  constrainCanvasView: (
    view: DocumentSession['view'],
    size?: {
      width: number
      height: number
    }
  ) => DocumentSession['view']
  applyRotationStyle: (_view: import('@shared/types-view').ViewState) => void
}) {
  return ({ event }: { event: React.PointerEvent<HTMLCanvasElement> }) => {
    const { inputRef, stageSize, stagePoint, liveViewRef, rotationIndicatorPosition, constrainCanvasView, applyRotationStyle } = ports
    const autoPanDrag = inputRef.current.drag
    if (
      autoPanDrag &&
      [
        'marquee',
        'lasso',
        'polygon-lasso',
        'freeform-shape',
        'polygon-shape',
        'line-shape',
        'curve-shape',
        'create-text-box',
        'move-selection',
        'move-selection-pivot',
        'move-content',
        'transform-content',
        'rotate-content',
        'shear-content'
      ].includes(autoPanDrag.kind)
    ) {
      const size = stageSize()
      const pointer = stagePoint(event.clientX, event.clientY)
      const edge = 28
      const edgeSpeed = (position: number, start: number, end: number): number =>
        position < start + edge
          ? -Math.min(16, Math.max(2, (start + edge - position) * 0.4))
          : position > end - edge
            ? Math.min(16, Math.max(2, (position - (end - edge)) * 0.4))
            : 0
      const screenX = edgeSpeed(pointer.x, 0, size.width)
      const screenY = edgeSpeed(pointer.y, 0, size.height)
      if (screenX !== 0 || screenY !== 0) {
        const view = liveViewRef.current
        const delta = viewPanDeltaFromScreen(-screenX, -screenY, view.rotation, rotationIndicatorPosition, view.mirrored, view.mirroredVertical)
        liveViewRef.current = constrainCanvasView({ ...view, panX: view.panX + delta.x, panY: view.panY + delta.y })
        useWorkspace.getState().setView({ panX: liveViewRef.current.panX, panY: liveViewRef.current.panY })
        applyRotationStyle(liveViewRef.current)
      }
    }
  }
}
