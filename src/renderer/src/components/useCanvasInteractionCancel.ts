import { registerCanvasKeyboard } from './canvas-keyboard-router'
import { useEffect } from 'react'
import { clearCanvasToolGestures } from '@/core/canvas-tool-gesture-lock'
import { type SelectionTransformLayerState } from '@/core/tools-selection-transform'
import { useWorkspace, type DocumentSession } from '@/store/workspace'
import { canvasColorSamplingActiveFor, endCanvasColorSampling } from '@/core/canvas-color-sampling'
import { CanvasInputState, revertCancelledCanvasDragPixelChanges, type CanvasDragState as DragState } from '@/core/canvas-input'
import { prepareAdjustmentPreviewEdit } from '@/core/adjustment-preview-lifecycle'
import { applyTilemapDocumentEdit } from '@/core/tilemap-document'
import { GradientCompositePreviewCache, GradientPreviewCoverageCache, SymmetryDragState } from './canvas-stage-helpers'
interface Ports {
  readonly magicGestureRef: import('react').RefObject<{
    cancel: (redraw?: boolean) => void
    drag: DragState
  } | null>
  readonly canvasRef: import('react').RefObject<HTMLCanvasElement | null>
  readonly stopAirbrushTimer: () => void
  readonly stopLiquifyTimer: () => void
  readonly updateRotationIndicator: (rotation: number, visible: boolean) => void
  readonly liveViewRef: import('react').RefObject<import('@shared/types-view').ViewState>
  readonly hideMoveLayerContentPreview: (delayMs?: number) => void
  readonly gradientPreviewCoverageCacheRef: import('react').RefObject<GradientPreviewCoverageCache | null>
  readonly gradientCompositePreviewCacheRef: import('react').RefObject<GradientCompositePreviewCache | null>
  readonly inputRef: import('react').RefObject<CanvasInputState>
  readonly symmetryDragRef: import('react').RefObject<SymmetryDragState | null>
  cancelSelectionPreview: () => void
  readonly endSelectionAdjustmentEdit: () => void
  readonly adjustmentPreviewEditRef: import('react').RefObject<boolean>
  readonly session: DocumentSession
  readonly restoreDeferredFloatingSelectionPreview: (drag: DragState) => void
  readonly restoreSelectionLayerPreviews: (layers: readonly SelectionTransformLayerState[]) => void
  readonly canvasResizeFrameRef: import('react').RefObject<number | null>
  readonly pendingCanvasResizeRef: import('react').RefObject<import('@/store/workspace').CanvasResizePreview | null>
  readonly canvasResizePreviewRef: import('react').RefObject<import('@/store/workspace').CanvasResizePreview | null>
  readonly finishPanPreview: () => import('@shared/types-view').ViewState
  readonly finishZoomPreview: () => import('@shared/types-view').ViewState
  readonly invalidateOnionSkinDragFrames: (drag: DragState) => void
  readonly compositeCacheRef: import('react').RefObject<import('@/components/canvas-composite-cache').CanvasCompositeCache>
  readonly scheduleDraw: () => void
}

export function useCanvasInteractionCancel(ports: Ports) {
  const cancelActiveCanvasInteraction = (): void => {
    ports.magicGestureRef.current?.cancel()
    if (canvasColorSamplingActiveFor(ports.canvasRef.current)) endCanvasColorSampling()
    clearCanvasToolGestures()
    ports.stopAirbrushTimer()
    ports.stopLiquifyTimer()
    // The rotation indicator is a DOM overlay shown only while a rotate-view
    // gesture is active. Blur/cancel paths do not receive pointer-up, so hide
    // it here as part of the common interaction cleanup instead of leaving a
    // stale indicator visible after the window regains focus.
    ports.updateRotationIndicator(ports.liveViewRef.current.rotation, false)
    ports.hideMoveLayerContentPreview()
    ports.gradientPreviewCoverageCacheRef.current = null
    ports.gradientCompositePreviewCacheRef.current = null
    const drag = ports.inputRef.current.resetInteraction()
    ports.symmetryDragRef.current = null
    ports.cancelSelectionPreview()
    if (!drag) {
      ports.endSelectionAdjustmentEdit()
      return
    }
    if (ports.adjustmentPreviewEditRef.current) prepareAdjustmentPreviewEdit(ports.session.document.id)
    const state = useWorkspace.getState()
    let documentChanged = false
    if (drag.kind === 'fill' && drag.fillHistoryCommitted) {
      state.undo()
      documentChanged = true
    } else if (drag.kind === 'smooth' && drag.edit) {
      state.cancelSmoothBrushStroke(drag.edit)
      documentChanged = true
    } else if (drag.kind === 'liquify' && drag.edit) {
      state.setLiquifyGestureActive(false)
      state.cancelLiquifyStroke(drag.edit, Boolean(drag.liquifyCompound))
      documentChanged = true
    } else if (drag.selectionPreparationPending) {
      // A press without a real transform never touched document pixels.
    } else if (drag.floatingPaste && drag.deferredSelectionPreview) {
      ports.restoreDeferredFloatingSelectionPreview(drag)
    } else if (drag.floatingPaste) {
      const target = drag.previewSelection ?? drag.selectionStart
      const hasLayerPreview = drag.selectionLayers?.some((layer) => layer.previewEdit || layer.translationPreview)
      if (target && (drag.previewEdit || drag.translationPreview || hasLayerPreview))
        state.updateFloatingPastePreview(
          drag.previewEdit ?? null,
          target,
          drag.translationPreview,
          drag.previewTarget,
          drag.previewAngle,
          drag.previewShear,
          false,
          drag.selectionLayers,
          drag.previewQuad
        )
    } else if (drag.selectionLayers?.length) {
      ports.restoreSelectionLayerPreviews(drag.selectionLayers)
      documentChanged = true
    } else if (drag.tilemapSelectionMoveSource && drag.tilemapEdit) {
      documentChanged = applyTilemapDocumentEdit(ports.session.document, drag.tilemapEdit, 'before')
    } else if (drag.kind === 'tile-draw' && drag.tilemapEdit) {
      documentChanged = applyTilemapDocumentEdit(ports.session.document, drag.tilemapEdit, 'before')
    } else if (drag.freeTileInstanceSelectionMove && drag.freeTilePlacementEdit) {
      state.cancelFreeTilePlacement(drag.freeTilePlacementEdit)
      documentChanged = true
    } else if ((drag.kind === 'free-tile-draw' || drag.kind === 'free-tile-instance-move') && drag.freeTilePlacementEdit) {
      state.cancelFreeTilePlacement(drag.freeTilePlacementEdit)
      documentChanged = true
    } else if (drag.freeTileSourceId && drag.freeTileSourceBefore) {
      const before = drag.freeTileSourceBefore
      documentChanged = state.previewFreeTileSource(before.sourceId, before.width, before.height, before.pixels, before.offsetX, before.offsetY)
      if (drag.freeTilePlacementEdit) state.cancelFreeTilePlacement(drag.freeTilePlacementEdit)
    } else documentChanged = revertCancelledCanvasDragPixelChanges(ports.session.document, drag)
    if (drag.kind === 'move-layer') {
      state.cancelLayerMovePreview(ports.session.document.id, drag)
      documentChanged = true
    }
    if (drag.kind === 'transform-text-box') {
      state.cancelTextBoxTransform()
      documentChanged = true
    }
    if ((drag.kind === 'canvas-resize' || drag.kind === 'canvas-move') && drag.canvasPreview) {
      if (ports.canvasResizeFrameRef.current !== null) window.cancelAnimationFrame(ports.canvasResizeFrameRef.current)
      ports.canvasResizeFrameRef.current = null
      ports.pendingCanvasResizeRef.current = null
      ports.canvasResizePreviewRef.current = { ...drag.canvasPreview }
      state.setCanvasResizePreview(drag.canvasPreview)
    }
    if (drag.kind === 'pan') ports.finishPanPreview()
    if (drag.kind === 'zoom-drag') ports.finishZoomPreview()
    ports.endSelectionAdjustmentEdit()
    if (documentChanged) {
      ports.invalidateOnionSkinDragFrames(drag)
      ports.compositeCacheRef.current.invalidateAll()
    }
    ports.scheduleDraw()
  }

  useEffect(() => {
    const prepareEscapeCancellation = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && ports.inputRef.current.drag) cancelActiveCanvasInteraction()
    }
    return registerCanvasKeyboard({ isActive: () => useWorkspace.getState().activeId === ports.session.document.id, keyDown: prepareEscapeCancellation })
    // The capture phase updates floating preview ownership before App handles Escape.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ports.session.document.id])
  return { cancelActiveCanvasInteraction }
}
