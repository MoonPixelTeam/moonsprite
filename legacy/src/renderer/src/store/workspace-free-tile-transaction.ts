import { type WorkspaceRecording } from './workspace-recording'
import type { SelectionMask } from '@shared/types-selection'
import { type HistoryEntry } from '@/core/history'
import { freeTileCelDataEqual } from '@/core/free-tile'
import { applyFreeTilePlacementEdit, applyFreeTileSourceSnapshot, freeTileLayerIdsForSource, freeTileSourceEditSnapshotBytes, freeTileSourceEditSnapshotsEqual, freeTileSourceOwnerForId, type FreeTilePlacementEdit, type FreeTileSourceEditSnapshot } from '@/core/free-tile-document'
import { cloneSelectionMask, touch } from './workspace-session'
import type { DocumentSession, SelectionPivot } from './workspace-types'
import { selectionMasksEqual } from './workspace-selection-geometry'

export const commitFreeTileSourceEditInSession = (recordDocumentOperation: WorkspaceRecording['recordDocumentOperation'],
  session: DocumentSession,
  sourceId: string,
  before: FreeTileSourceEditSnapshot,
  after: FreeTileSourceEditSnapshot,
  label: string,
  placementEdit?: FreeTilePlacementEdit,
  selectionEdit?: {
    before: SelectionMask | null
    after: SelectionMask | null
    beforePivot: SelectionPivot | null
    afterPivot: SelectionPivot | null
  }
): HistoryEntry | null => {
  const sourceChanged = !freeTileSourceEditSnapshotsEqual(before, after)
  const placementChanged = Boolean(placementEdit && !freeTileCelDataEqual(placementEdit.before, placementEdit.after))
  const beforeSelection = cloneSelectionMask(selectionEdit?.before ?? null)
  const afterSelection = cloneSelectionMask(selectionEdit?.after ?? null)
  const beforeSelectionPivot = selectionEdit?.beforePivot ? { ...selectionEdit.beforePivot } : null
  const afterSelectionPivot = selectionEdit?.afterPivot ? { ...selectionEdit.afterPivot } : null
  const selectionChanged = Boolean(selectionEdit && (
    !selectionMasksEqual(beforeSelection, afterSelection)
    || beforeSelectionPivot?.x !== afterSelectionPivot?.x
    || beforeSelectionPivot?.y !== afterSelectionPivot?.y
  ))
  if (!sourceChanged && !placementChanged && !selectionChanged) return null
  const owner = freeTileSourceOwnerForId(session.document, sourceId)
  if (!owner || owner.source.id !== before.sourceId || owner.source.id !== after.sourceId) return null
  const sourceAlreadyApplied = freeTileSourceEditSnapshotsEqual(after, { sourceId: owner.source.id, tilesetId: owner.tileset.id, width: owner.tileset.tileWidth, height: owner.tileset.tileHeight, pixels: owner.tileset.pixels, offsetX: owner.source.offsetX, offsetY: owner.source.offsetY })
  const previewInvalidation = sourceAlreadyApplied && !placementChanged && session.contentInvalidation?.kind === 'region' ? session.contentInvalidation : null
  const applyBefore = (): void => {
    if (placementEdit) applyFreeTilePlacementEdit(session.document, placementEdit, 'before')
    if (sourceChanged) applyFreeTileSourceSnapshot(session.document, before)
    if (selectionEdit) {
      session.selection = cloneSelectionMask(beforeSelection)
      session.selectionPivot = beforeSelectionPivot ? { ...beforeSelectionPivot } : null
    }
  }
  const applyAfter = (skipSource = false): void => {
    if (sourceChanged && !skipSource) applyFreeTileSourceSnapshot(session.document, after)
    if (placementEdit) applyFreeTilePlacementEdit(session.document, placementEdit, 'after')
    if (selectionEdit) {
      session.selection = cloneSelectionMask(afterSelection)
      session.selectionPivot = afterSelectionPivot ? { ...afterSelectionPivot } : null
    }
  }
  applyAfter(sourceAlreadyApplied)
  const contentChanged = sourceChanged || placementChanged
  const entry: HistoryEntry = {
    label,
    bytes: freeTileSourceEditSnapshotBytes(before) + freeTileSourceEditSnapshotBytes(after)
      + (placementEdit ? (placementEdit.before.instances.length + placementEdit.after.instances.length) * 72 : 0)
      + (beforeSelection?.mask?.byteLength ?? 0)
      + (afterSelection?.mask?.byteLength ?? 0)
      + (selectionEdit ? 64 : 0),
    undo: applyBefore,
    redo: () => applyAfter(),
    ...(contentChanged ? { invalidation: { kind: 'full' as const } } : {}),
    affectedLayerIds: freeTileLayerIdsForSource(session.document, owner.source.id),
    documentChanged: contentChanged,
    contentChanged,
    requiresAnimationSync: false
  }
  session.history.push(entry)
  if (contentChanged) {
    touch(session, true, previewInvalidation?.rect ? { kind: 'region', rect: previewInvalidation.rect } : { kind: 'full' })
    if (previewInvalidation && session.contentInvalidation?.kind === 'region') session.contentInvalidation.fromRevision = previewInvalidation.fromRevision
    recordDocumentOperation(session, { stroke: true })
  }
  return entry
}
