import { isLayerEffectivelyLocked, isLayerEffectivelyVisible } from '@/core/document-model'
import { freeTileInstanceBounds, freeTileSourceForInstance } from '@/core/free-tile'
import { activeFreeTileCelTarget } from '@/core/free-tile-document'
import { createFreeTileSourceEditRaster, freeTileSelectionForInstanceEdit, freeTileSelectionToEditRaster, freeTileSourceSnapshotFromEditRaster } from '@/core/free-tile-edit'
import { flipSelectionMask } from '@/core/selection'
import { flipSelection } from '@/core/tools-selection-transform-apply'
import { commitFreeTileSourceEditInSession } from './workspace-free-tile-transaction'
import type { WorkspaceRecording } from './workspace-recording'
import { activePaintLayer } from './workspace-session'
import { tr } from './workspace-translation'
import type { DocumentSession } from './workspace-types'

/** A marquee edits the shared source in the selected instance's orientation. */
export function flipFreeTileSourceSelection(
  session: DocumentSession,
  axis: 'horizontal' | 'vertical',
  recordDocumentOperation: WorkspaceRecording['recordDocumentOperation']
): void {
  const layer = activePaintLayer(session)
  if (!session.selection || !isLayerEffectivelyVisible(session.document, layer) || isLayerEffectivelyLocked(session.document, layer)) return
  const target = activeFreeTileCelTarget(session.document)
  if (!target || target.layer.id !== layer.id) return
  const instance = target.freeTiles.instances.find(candidate => candidate.id === session.selectedFreeTileInstanceId)
  const source = instance && freeTileSourceForInstance(target.sources, instance)
  const sourceLayer = source && layer.freeTileSources?.find(candidate => candidate.id === source.id)
  if (!instance || !source || !sourceLayer || instance.visible === false || instance.locked || source.visible === false || sourceLayer.locked) return
  const bounds = freeTileInstanceBounds(instance, target.sources, target.surface.offsetX, target.surface.offsetY)
  const selection = freeTileSelectionForInstanceEdit(session.selection, bounds)
  if (!selection) return
  // Preserve the full marquee, including transparent padding beyond the source.
  const edit = createFreeTileSourceEditRaster(session.document, source, bounds, undefined, instance)
  if (!edit) return
  const localSelection = freeTileSelectionToEditRaster(edit, selection)
  if (!localSelection) return
  const pixelEdit = flipSelection(edit.document, localSelection, axis, edit.layer)
  const after = pixelEdit ? freeTileSourceSnapshotFromEditRaster(edit, localSelection) : edit.before
  const entry = commitFreeTileSourceEditInSession(recordDocumentOperation, session, source.id, edit.before, after,
    axis === 'horizontal' ? tr('workspace.history.flipSelectionHorizontal') : tr('workspace.history.flipSelectionVertical'),
    undefined, {
      before: session.selection,
      after: flipSelectionMask(selection, axis),
      beforePivot: session.selectionPivot ?? null,
      afterPivot: session.selectionPivot ?? null
    })
  session.lastPencilPoint = null
  session.lastEraserPoint = null
  if (entry) session.selectionGuidesPreservedAtContentRevision = session.contentRevision
}
