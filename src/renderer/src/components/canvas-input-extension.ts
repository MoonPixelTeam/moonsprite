import type { RasterLayer } from '@shared/types-layer'
import { type DocumentSession } from '@/store/workspace'
import { CanvasInputState } from '@/core/canvas-input-controller'
import { type CanvasDragState as DragState, type CanvasPoint as Point } from '@/core/canvas-input-contracts'
import { extensionToolContributionFor } from '@/core/extension-contributions'

interface Ports {
  extensionToolRequestRef: import('react').RefObject<AbortController | null>
  addExtensionToolFootprint: (drag: DragState, center: Point, currentSession: DocumentSession) => void
  inputRef: import('react').RefObject<CanvasInputState>
  scheduleBrushPreviewOverlay: () => void
  updateCursor: (event: React.PointerEvent<HTMLCanvasElement>) => void
  runExtensionTool: (drag: DragState, initialSession: DocumentSession) => Promise<void>
}

export function createExtensionCanvasInput(ports: Ports) {
  function beginExtension({
    session,
    event,
    hasRasterFocus,
    canEditLayer,
    editableLayer,
    point
  }: {
    session: DocumentSession
    event: React.PointerEvent<HTMLCanvasElement>
    hasRasterFocus: boolean
    canEditLayer: boolean
    editableLayer: RasterLayer
    point: Point
  }): boolean {
    const { extensionToolRequestRef, addExtensionToolFootprint, inputRef, scheduleBrushPreviewOverlay } = ports
    if (session.tool === 'extension' && event.button === 0) {
      const contribution = extensionToolContributionFor(session.extensionToolId)
      if (
        !contribution ||
        contribution.tool.kind !== 'remote-pixel-brush' ||
        !hasRasterFocus ||
        !canEditLayer ||
        editableLayer.kind ||
        session.activeLayerMaskId ||
        extensionToolRequestRef.current
      )
        return true
      const drag: DragState = {
        kind: 'extension-tool',
        start: point,
        last: point,
        extensionToolMask: new Set<number>(),
        extensionToolContentRevision: session.contentRevision,
        startedAt: Date.now()
      }
      addExtensionToolFootprint(drag, point, session)
      inputRef.current.drag = drag
      event.currentTarget.setPointerCapture(event.pointerId)
      scheduleBrushPreviewOverlay()
      return true
    }
    return false
  }

  function moveExtension({ drag, point, session }: { drag: DragState; point: Point; session: DocumentSession }): boolean {
    const { addExtensionToolFootprint, scheduleBrushPreviewOverlay } = ports
    if (drag.kind === 'extension-tool') {
      const distance = Math.max(Math.abs(point.x - drag.last.x), Math.abs(point.y - drag.last.y))
      const steps = Math.max(1, Math.ceil(distance))
      for (let step = 1; step <= steps; step += 1) {
        const amount = step / steps
        addExtensionToolFootprint(drag, { x: drag.last.x + (point.x - drag.last.x) * amount, y: drag.last.y + (point.y - drag.last.y) * amount }, session)
      }
      drag.last = point
      scheduleBrushPreviewOverlay()
      return true
    }
    return false
  }

  function endExtension({
    drag,
    event,
    currentInteractionSession
  }: {
    drag: DragState
    event: React.PointerEvent<HTMLCanvasElement>
    currentInteractionSession: DocumentSession
  }): boolean {
    const { updateCursor, runExtensionTool, scheduleBrushPreviewOverlay } = ports
    if (drag.kind === 'extension-tool') {
      updateCursor(event)
      void runExtensionTool(drag, currentInteractionSession)
      scheduleBrushPreviewOverlay()
      return true
    }
    return false
  }
  return { beginExtension, moveExtension, endExtension }
}
