import { createNavigationCanvasInput } from './canvas-input-navigation'
import { createSelectionCanvasInput } from './canvas-input-selection'
import { createTextCanvasInput } from './canvas-input-text'
import { createShapeCanvasInput } from './canvas-input-shape'
import { createFreeTileCanvasInput } from './canvas-input-free-tile'
import { createExtensionCanvasInput } from './canvas-input-extension'
import { createSliceCanvasInput } from './canvas-input-slice'
import { createLayerMoveCanvasInput } from './canvas-input-layer-move'
import { createStrokeCanvasInput } from './canvas-input-stroke'
import { createFillCanvasInput } from './canvas-input-fill'
import { createTileCanvasInput } from './canvas-input-tile'
import { createSamplingCanvasInput } from './canvas-input-sampling'
import { createTransformCanvasInput } from './canvas-input-transform'
import { endCanvasToolGesture } from '@/core/canvas-tool-gesture-lock'
import { useWorkspace, type DocumentSession } from '@/store/workspace'
import { CanvasInputState, selectionGestureMoved, type CanvasDragState as DragState } from '@/core/canvas-input'
import { prepareAdjustmentPreviewEdit } from '@/core/adjustment-preview-lifecycle'
import { syncHeldShortcutModifiers } from '@/components/useQuickToolShortcut'
import { SymmetryDragState } from './canvas-stage-helpers'
interface Ports {
  liveInputSession: () => DocumentSession
  stopAirbrushTimer: () => void
  stopLiquifyTimer: () => void
  symmetryDragRef: import('react').RefObject<SymmetryDragState | null>
  inputRef: import('react').RefObject<CanvasInputState>
  cancelActiveCanvasInteraction: () => void
  updateCursor: (event: React.PointerEvent<HTMLCanvasElement>) => void
  draw: () => void
  endSelectionAdjustmentEdit: () => void
  scheduleDraw: () => void
  hideEyedropperMagnifier: () => void
  hideMoveLayerContentPreview: (delayMs?: number) => void
  flushCanvasResizePreview: () => void
  cancelSelectionPreview: () => void
  flushSelectionPreview: (drag: DragState, render?: boolean) => void
  adjustmentPreviewEditRef: import('react').RefObject<boolean>
  navigationInput: ReturnType<typeof createNavigationCanvasInput>
  selectionInput: ReturnType<typeof createSelectionCanvasInput>
  samplingInput: ReturnType<typeof createSamplingCanvasInput>
  extensionInput: ReturnType<typeof createExtensionCanvasInput>
  fillInput: ReturnType<typeof createFillCanvasInput>
  tileInput: ReturnType<typeof createTileCanvasInput>
  freeTileInput: ReturnType<typeof createFreeTileCanvasInput>
  strokeInput: ReturnType<typeof createStrokeCanvasInput>
  layerMoveInput: ReturnType<typeof createLayerMoveCanvasInput>
  shapeInput: ReturnType<typeof createShapeCanvasInput>
  textInput: ReturnType<typeof createTextCanvasInput>
  sliceInput: ReturnType<typeof createSliceCanvasInput>
  transformInput: ReturnType<typeof createTransformCanvasInput>
}

export function createCanvasPointerUp(ports: Ports) {
  return (event: React.PointerEvent<HTMLCanvasElement>): void => {
    const {
      liveInputSession,
      stopAirbrushTimer,
      stopLiquifyTimer,
      symmetryDragRef,
      inputRef,
      cancelActiveCanvasInteraction,
      updateCursor,
      draw,
      endSelectionAdjustmentEdit,
      scheduleDraw,
      hideEyedropperMagnifier,
      hideMoveLayerContentPreview,
      flushCanvasResizePreview,
      cancelSelectionPreview,
      flushSelectionPreview,
      adjustmentPreviewEditRef,
      navigationInput,
      selectionInput,
      samplingInput,
      extensionInput,
      fillInput,
      tileInput,
      freeTileInput,
      strokeInput,
      layerMoveInput,
      shapeInput,
      textInput,
      sliceInput,
      transformInput
    } = ports

    endCanvasToolGesture(event.pointerId)
    const session = liveInputSession()
    syncHeldShortcutModifiers(event.nativeEvent)
    stopAirbrushTimer()
    stopLiquifyTimer()
    const currentInteractionSession = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id) ?? session
    if (currentInteractionSession.freeTransformActive === true) {
      const staleSymmetryDrag = symmetryDragRef.current
      if (staleSymmetryDrag) {
        symmetryDragRef.current = null
        if (event.currentTarget.hasPointerCapture(staleSymmetryDrag.pointerId)) event.currentTarget.releasePointerCapture(staleSymmetryDrag.pointerId)
      }
      // A mode switch can happen after a legacy gesture has already produced a
      // preview but before the pointer is released. Do not commit that stale
      // gesture while free transform is active; free-transform corner drags
      // and content translations are the only content gestures allowed here.
      const activeDrag = inputRef.current.drag
      const freeTransformDrag = (activeDrag?.kind === 'transform-content' || activeDrag?.kind === 'move-content') && activeDrag.freeTransform === true
      if (activeDrag && activeDrag.kind !== 'pan' && !freeTransformDrag) {
        cancelActiveCanvasInteraction()
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
        updateCursor(event)
        draw()
        return
      }
    }
    if (symmetryDragRef.current) {
      symmetryDragRef.current = null
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
      updateCursor(event)
      draw()
      return
    }
    if (inputRef.current.drag?.kind === 'polygon-lasso' || inputRef.current.drag?.kind === 'polygon-shape') {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
      endSelectionAdjustmentEdit()
      scheduleDraw()
      return
    }
    const drag = inputRef.current.finish()
    if (!drag) {
      inputRef.current.resetPointerInteraction()
      updateCursor(event)
      hideEyedropperMagnifier()
      return
    }
    if (drag.kind === 'move-layer') hideMoveLayerContentPreview(220)
    if (drag.kind === 'canvas-resize' || drag.kind === 'canvas-move') flushCanvasResizePreview()
    cancelSelectionPreview()
    const selectionPreviewWasPending = Boolean(drag.previewPending)
    flushSelectionPreview(drag)
    if (adjustmentPreviewEditRef.current && !selectionPreviewWasPending) prepareAdjustmentPreviewEdit(session.document.id)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    const state = useWorkspace.getState()
    if (drag.kind === 'pan' && navigationInput.endPan({ drag, currentInteractionSession, event })) return
    if (drag.kind === 'zoom-drag' && navigationInput.endZoom({ drag, event, session })) return
    if (drag.kind === 'rotate-view' && navigationInput.endRotation({ drag })) return
    if (drag.kind === 'move-selection-pivot' && selectionInput.endPivot({ drag, state, event })) return
    if (drag.kind === 'sample-color' && samplingInput.endSample({ drag, event, state, session })) return
    if (drag.kind === 'extension-tool' && extensionInput.endExtension({ drag, event, currentInteractionSession })) return
    if (drag.kind === 'gradient' && fillInput.endGradient({ drag, session, state })) return
    updateCursor(event)
    if (drag.kind === 'move-content' && drag.selectionStart && drag.tilemapSelectionMoveSource && tileInput.endTileSelection({ drag, state })) return
    if (
      drag.kind === 'move-content' &&
      drag.freeTileInstanceSelectionMove &&
      drag.freeTilePlacementEdit &&
      drag.selectionStart &&
      freeTileInput.endFreeTileSelection({ drag, state })
    )
      return
    if (
      (drag.kind === 'move-content' || drag.kind === 'transform-content' || drag.kind === 'rotate-content' || drag.kind === 'shear-content') &&
      drag.freeTileSelectionTransform &&
      drag.freeTileSourceId &&
      drag.selectionStart &&
      drag.previewSelection &&
      freeTileInput.endFreeTileTransform({ drag, state })
    )
      return
    if (drag.kind === 'free-tile-instance-move' && drag.freeTilePlacementEdit && freeTileInput.endInstanceMove({ drag, state })) return
    if (drag.kind === 'free-tile-draw' && drag.freeTilePlacementEdit && freeTileInput.endFreeTileDraw({ drag, state, session })) return
    if (
      drag.kind === 'free-tile-edit' &&
      drag.freeTileSourceId &&
      drag.freeTileSourceBefore &&
      drag.freeTileEditDocument &&
      drag.freeTileEditLayer &&
      drag.freeTileEditOrigin &&
      drag.freeTileEditSourceOffset &&
      freeTileInput.endFreeTileEdit({ drag, session, state })
    )
      return
    if (drag.kind === 'tile-draw' && drag.tilemapEdit && tileInput.endTile({ drag, state, session })) return
    if (drag.kind === 'draw' && drag.edit && strokeInput.endRaster({ drag, state, session })) return
    if (drag.kind === 'smooth' && drag.edit && strokeInput.endSmooth({ drag, state })) return
    if (drag.kind === 'airbrush' && drag.edit && strokeInput.endAirbrush({ drag, state })) return
    if (drag.kind === 'liquify' && drag.edit && strokeInput.endLiquify({ drag, state })) return
    if (drag.kind === 'move-layer' && layerMoveInput.endLayerMove({ drag, state, session })) return
    if (
      drag.kind === 'move-layer' &&
      drag.collapseLayerSelectionOnClick &&
      !drag.moved &&
      drag.clickLayerId &&
      layerMoveInput.endLayerClick({ drag, state, session })
    )
      return
    if (drag.kind === 'move-layer' && drag.previewPivot && layerMoveInput.endLayerPivot({ drag, state })) return
    if (drag.kind === 'shape' && shapeInput.endShape({ drag, session, state })) return
    if (drag.kind === 'freeform-shape' && shapeInput.endFreeform({ drag, session })) return
    if (drag.kind === 'line-shape' && shapeInput.endLine({ drag })) return
    if (drag.kind === 'curve-shape' && shapeInput.endCurve({ drag, session })) return
    if (drag.kind === 'marquee' && selectionInput.endMarquee({ drag, event, session, state })) return
    if (drag.kind === 'create-text-box' && textInput.endTextCreation({ drag, event, session })) return
    if (drag.kind === 'transform-text-box' && drag.previewTarget && textInput.endTextTransform({ drag, state, session })) return
    if (
      drag.kind === 'create-slice' &&
      drag.previewTarget &&
      (drag.moved || selectionGestureMoved(drag.startClient, { x: event.clientX, y: event.clientY })) &&
      sliceInput.endSliceCreation({ drag, event, state })
    )
      return
    if (drag.kind === 'move-slice' && drag.sliceId && sliceInput.endSliceMove({ drag, event, state })) return
    if (drag.kind === 'resize-slice' && drag.sliceId && drag.previewTarget && sliceInput.endSliceResize({ drag, state })) return
    if (drag.kind === 'lasso' && selectionInput.endLasso({ drag, session, state })) return
    if (drag.kind === 'magic-preview' && selectionInput.endMagic({ drag })) return
    if (drag.kind === 'move-selection' && drag.selectionStart && drag.previewSelection && selectionInput.endSelectionMove({ drag, state })) return
    if (
      (drag.kind === 'move-content' || drag.kind === 'transform-content' || drag.kind === 'rotate-content' || drag.kind === 'shear-content') &&
      drag.selectionStart &&
      drag.previewSelection &&
      transformInput.endContentTransform({ drag, session, state })
    )
      return
    endSelectionAdjustmentEdit()
    // Let the browser process the pointer event before repainting the stage.
    // Synchronous full-stage painting here made completing or cancelling a
    // large selection block all input until the composite finished.
    scheduleDraw()
  }
}
