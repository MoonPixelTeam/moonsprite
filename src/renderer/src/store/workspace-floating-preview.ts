import type { SelectionMask, SelectionRect } from '@shared/types-selection'
import type { SpriteDocument } from '@shared/types-document'
import { revertPixelEdit } from '@/core/history'
import { restoreSelectionTranslationPreview, type SelectionTransformLayerState } from '@/core/tools-selection-transform'
import { hasEnabledLayerStyles } from '@/core/layer-styles'
import type { DocumentSession, FloatingPaste } from './workspace-types'
import { mergeSelectionRects, rectangularSelection } from './workspace-selection-geometry'

export const markFloatingPreviewChanged = (session: DocumentSession, before: SelectionRect, after: SelectionRect): void => {
  const fromRevision = session.contentRevision
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
        rect: mergeSelectionRects(before, after),
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
  if (!pending || pending.previewDeferred) return
  if (pending.layers?.length) {
    for (const layerState of pending.layers) restoreSelectionTransformLayerPreview(session.document, layerState)
    return
  }
  const previewDocument = pending.freeTile?.edit.document ?? session.document
  if (pending.translationPreview) restoreSelectionTranslationPreview(previewDocument, pending.translationPreview)
  else if (pending.previewEdit) revertPixelEdit(previewDocument, pending.previewEdit)
}

export const floatingSelectionGeometrySource = (pending: FloatingPaste): SelectionMask => pending.freeTile?.selectionSource
  ?? (pending.source.origin === 'clipboard' ? rectangularSelection(pending.source.selection) : pending.source.selection)
