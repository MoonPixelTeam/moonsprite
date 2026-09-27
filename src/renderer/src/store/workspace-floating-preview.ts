import type { SelectionMask, SelectionRect } from '@shared/types-selection'
import type { SpriteDocument } from '@shared/types-document'
import { revertPixelEdit } from '@/core/history'
import { restoreSelectionTranslationPreview, type SelectionTransformLayerState } from '@/core/tools-selection-transform'
import { hasEnabledLayerStyles } from '@/core/layer-styles'
import { expandLayerStyleInvalidationRect } from '@/core/document-composite-plan'
import type { DocumentSession, FloatingPaste } from './workspace-types'
import { mergeSelectionRects, rectangularSelection } from './workspace-selection-geometry'
import { invalidateSessionContent } from './workspace-session'

export const markFloatingPreviewChanged = (session: DocumentSession, before: SelectionRect, after: SelectionRect): void => {
  const fromRevision = session.contentRevision
  // The canvas repaint effect keys on `session.revision`, so a content-only
  // revision bump leaves a stale frame behind. Cancelling or undoing a
  // materialized floating selection reaches this helper without any later
  // `touch()`, which is how "undo works but the canvas keeps showing the moved
  // pixels" happened: the pixels rolled back, the repaint was never scheduled.
  session.revision += 1
  session.contentRevision += 1
  const pendingLayerIds = session.pendingPaste?.layers?.map((state) => state.layerId)
    ?? (session.pendingPaste?.layerId ? [session.pendingPaste.layerId] : [])
  const styledPreview = pendingLayerIds.some((id) => {
    const layer = session.document.layers.find((candidate) => candidate.id === id)
    return Boolean(layer && hasEnabledLayerStyles(layer.layerStyles))
  })
  session.contentInvalidation = styledPreview
    ? { kind: 'full', fromRevision, revision: session.contentRevision }
    : {
        kind: 'region',
        frameId: session.document.animation?.activeFrameId,
        rect: expandLayerStyleInvalidationRect(session.document, mergeSelectionRects(before, after), pendingLayerIds.length ? pendingLayerIds : undefined),
        fromRevision,
        revision: session.contentRevision
      }
}

export const markFloatingOverlayChanged = (session: DocumentSession): void => {
  session.revision += 1
}

export const restoreSelectionTransformLayerPreview = (document: SpriteDocument, layerState: SelectionTransformLayerState): void => {
  if (layerState.translationPreview) restoreSelectionTranslationPreview(document, layerState.translationPreview)
  else if (layerState.previewEdit) revertPixelEdit(document, layerState.previewEdit)
}

export const restoreFloatingPreview = (session: DocumentSession): void => {
  const pending = session.pendingPaste
  if (!pending) return
  if (pending.layers?.length) {
    const previewed = pending.layers.some((layerState) => layerState.previewEdit || layerState.translationPreview)
    for (const layerState of pending.layers) restoreSelectionTransformLayerPreview(session.document, layerState)
    if (previewed) invalidateSessionContent(session)
    return
  }
  // A deferred preview is not supposed to have touched the document. The
  // canvas finish handler, however, materializes a simple selection
  // translation and can still hand the drag over as deferred, which left the
  // moved pixels in the document while the overlay kept drawing them at the
  // new position. Roll back whatever was actually written instead of trusting
  // the flag.
  const edit = pending.previewEdit
  if (pending.previewDeferred && !edit && !pending.translationPreview) return
  const previewDocument = pending.freeTile?.edit.document ?? session.document
  if (pending.translationPreview) restoreSelectionTranslationPreview(previewDocument, pending.translationPreview)
  else if (edit) revertPixelEdit(previewDocument, edit)
  // `revertPixelEdit` writes layer pixels directly and never advances the
  // session revisions. Without this invalidation the composite cache keeps
  // serving the surface it built while the move was still previewed, so undo
  // reports success and the canvas keeps the moved frame until the next
  // unrelated repaint (toggling a layer's eye, for example).
  if (previewDocument === session.document) invalidateSessionContent(session)
}

export const floatingSelectionGeometrySource = (pending: FloatingPaste): SelectionMask => pending.freeTile?.selectionSource
  ?? (pending.source.origin === 'clipboard' ? rectangularSelection(pending.source.selection) : pending.source.selection)
