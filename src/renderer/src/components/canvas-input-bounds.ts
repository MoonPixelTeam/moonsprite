import { type DocumentSession } from '@/store/workspace'
import { CanvasInputState } from '@/core/canvas-input-controller'
import { constrainedTranslation } from '@/core/canvas-input-resize'
import { type CanvasDragState as DragState, type CanvasPoint as Point } from '@/core/canvas-input-contracts'
import { canvasCursors } from '@/core/canvas-visuals'

interface Ports {
  inputRef: import('react').RefObject<CanvasInputState>
  canvasResizeContains: (event: React.PointerEvent<HTMLCanvasElement>) => boolean
  scheduleCanvasResizePreview: (preview: NonNullable<DocumentSession['canvasResizePreview']>) => void
  modifierActive: (event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>, id: import('@/core/shortcuts').ShortcutId) => boolean
}

export function createBoundsCanvasInput(ports: Ports) {
  function beginBounds({
    activeResizePreview,
    event,
    resizeEdge,
    point
  }: {
    activeResizePreview: DocumentSession['canvasResizePreview']
    event: React.PointerEvent<HTMLCanvasElement>
    resizeEdge: 'e' | 'n' | 'ne' | 'nw' | 's' | 'se' | 'sw' | 'w' | null | undefined
    point: Point
  }): boolean {
    const { inputRef, canvasResizeContains } = ports
    if (activeResizePreview) {
      inputRef.current.sampling = false
      inputRef.current.shiftLinePreview = false
      if (event.button === 0 && resizeEdge) {
        inputRef.current.drag = { kind: 'canvas-resize', start: point, last: point, canvasEdge: resizeEdge, canvasPreview: { ...activeResizePreview } }
      } else if (event.button === 0 && canvasResizeContains(event)) {
        inputRef.current.drag = { kind: 'canvas-move', start: point, last: point, canvasPreview: { ...activeResizePreview } }
        event.currentTarget.style.cursor = canvasCursors.move
      }
      return true
    }
    return false
  }

  function moveBoundsResize({ drag, point }: { drag: DragState; point: Point }): boolean {
    const { scheduleCanvasResizePreview } = ports
    if (drag.kind === 'canvas-resize' && drag.canvasPreview && drag.canvasEdge) {
      const start = drag.canvasPreview
      let left = -start.offsetX
      let top = -start.offsetY
      let right = left + start.width
      let bottom = top + start.height
      if (drag.canvasEdge.includes('w')) left = Math.min(right - 1, point.x)
      if (drag.canvasEdge.includes('e')) right = Math.max(left + 1, point.x + 1)
      if (drag.canvasEdge.includes('n')) top = Math.min(bottom - 1, point.y)
      if (drag.canvasEdge.includes('s')) bottom = Math.max(top + 1, point.y + 1)
      scheduleCanvasResizePreview({ width: right - left, height: bottom - top, offsetX: -left, offsetY: -top })
      return true
    }
    return false
  }

  function moveBounds({ drag, point, event }: { drag: DragState; point: Point; event: React.PointerEvent<HTMLCanvasElement> }): boolean {
    const { modifierActive, scheduleCanvasResizePreview } = ports
    if (drag.kind === 'canvas-move' && drag.canvasPreview) {
      const distance = constrainedTranslation(drag, point.x - drag.start.x, point.y - drag.start.y, modifierActive(event.nativeEvent, 'constrainAxis'))
      scheduleCanvasResizePreview({
        ...drag.canvasPreview,
        offsetX: drag.canvasPreview.offsetX - distance.x,
        offsetY: drag.canvasPreview.offsetY - distance.y
      })
      event.currentTarget.style.cursor = canvasCursors.move
      return true
    }
    return false
  }
  return { beginBounds, moveBoundsResize, moveBounds }
}
