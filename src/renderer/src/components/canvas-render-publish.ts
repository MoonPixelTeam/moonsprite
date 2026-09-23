import { layerMovePreviewActive, type CanvasDragState as DragState } from '@/core/canvas-input'
import { notifyCanvasPreview, type CanvasPreviewSnapshot } from '@/core/canvas-preview-lifecycle'
import { parseAnimationCelKey } from '@/core/animation'
import type * as React from 'react'
import type { DocumentSession } from '@/store/workspace-types'
import { nonContentPreviewDragKinds } from './canvas-stage-helpers'
export function publishCanvasFramePreview({
  activeDrag,
  selectionPreviewOwner,
  currentActiveLayer,
  cloneSelectionQuad,
  currentSession,
  compositeCacheRef,
  publishedCanvasPreviewRef,
  session
}: {
  activeDrag: DragState | null
  selectionPreviewOwner: 'active' | 'pending' | null
  currentActiveLayer: import('@shared/types-layer').RasterLayer
  cloneSelectionQuad: (quad: import('@shared/types-selection').SelectionQuad | null | undefined) => import('@shared/types-selection').SelectionQuad | null
  currentSession: DocumentSession
  compositeCacheRef: React.RefObject<import('@/components/canvas-composite-cache').CanvasCompositeCache>
  publishedCanvasPreviewRef: React.RefObject<CanvasPreviewSnapshot | null>
  session: DocumentSession
}) {
  const movingLayerIds =
    layerMovePreviewActive(activeDrag) && !activeDrag.duplicatedLayer
      ? activeDrag.animationCellKeys?.length
        ? [...new Set(activeDrag.animationCellKeys.map((key) => parseAnimationCelKey(key)?.layerId).filter((id): id is string => Boolean(id)))]
        : activeDrag.layerIds
      : undefined
  const selectionPreview =
    selectionPreviewOwner === 'active' && activeDrag?.selectionSource && activeDrag.previewTarget
      ? {
          layerId: currentActiveLayer.id,
          source: activeDrag.selectionSource,
          target: { ...activeDrag.previewTarget },
          angle: activeDrag.previewAngle ?? 0,
          shear: activeDrag.previewShear ? { ...activeDrag.previewShear } : undefined,
          quad: activeDrag.previewQuad ? (cloneSelectionQuad(activeDrag.previewQuad) ?? undefined) : undefined,
          copy: Boolean(activeDrag.copy),
          optimizedRotation: currentSession.selectionRotationAlgorithm === 'rotsprite'
        }
      : selectionPreviewOwner === 'pending' && currentSession.pendingPaste
        ? {
            layerId: currentSession.pendingPaste.layerId,
            source: currentSession.pendingPaste.source,
            target: { ...(currentSession.pendingPaste.transformTarget ?? currentSession.pendingPaste.target) },
            angle: currentSession.pendingPaste.transformAngle ?? 0,
            shear: currentSession.pendingPaste.transformShear ? { ...currentSession.pendingPaste.transformShear } : undefined,
            quad: currentSession.pendingPaste.transformQuad ? (cloneSelectionQuad(currentSession.pendingPaste.transformQuad) ?? undefined) : undefined,
            copy: currentSession.pendingPaste.copy,
            optimizedRotation: currentSession.selectionRotationAlgorithm === 'rotsprite'
          }
        : undefined
  const publishesContentPreview = Boolean(
    currentSession.pendingPaste || movingLayerIds?.length || selectionPreview || (activeDrag && !nonContentPreviewDragKinds.has(activeDrag.kind))
  )
  const previewFrameId = currentSession.document.animation?.activeFrameId ?? 'static'
  const previewInvalidation = compositeCacheRef.current.consumePreviewInvalidation(previewFrameId)
  if (publishesContentPreview) {
    const snapshot: CanvasPreviewSnapshot = {
      document: currentSession.document,
      frameId: previewFrameId,
      revision: currentSession.revision,
      contentRevision: currentSession.contentRevision,
      invalidation: previewInvalidation ?? undefined,
      movingLayerIds: movingLayerIds ? [...movingLayerIds] : undefined,
      selectionPreview,
      liveRasterEdit: activeDrag?.kind === 'draw' || activeDrag?.kind === 'airbrush' || activeDrag?.kind === 'smooth' || activeDrag?.kind === 'liquify'
    }
    publishedCanvasPreviewRef.current = snapshot
    notifyCanvasPreview(session.document.id, snapshot)
  } else if (publishedCanvasPreviewRef.current !== null) {
    publishedCanvasPreviewRef.current = null
    notifyCanvasPreview(session.document.id, null)
  }
}
