import type { WorkspaceRecording } from './workspace-recording'
import type { RasterLayer } from '@shared/types-layer'
import { commitPixelEdit, revertPixelEdit, type HistoryEntry, type PixelEdit } from '@/core/history'
import { animationMaskAt } from '@/core/document-model'
import { animationLayerAtFrame, parseAnimationCelKey, refreshActiveAnimationFrame, syncActiveAnimationFrame, syncAnimationLayerAtFrame } from '@/core/animation'
import { clearSelection, fillSelectionOrCanvas } from '@/core/tools-fill'
import { loadEditorPreferences } from '@/core/file-preferences'
import { freeTileInstanceBounds, freeTileSourceForInstance } from '@/core/free-tile'
import { activeFreeTileCelTarget } from '@/core/free-tile-document'
import { createFreeTileSourceEditRaster, freeTileSelectionToEditRaster, freeTileSourceSnapshotFromEditRaster } from '@/core/free-tile-edit'
import { activeLayerMask, selectedTransformLayersForSession } from './workspace-session'
import type { AntiAliasPreview } from './workspace-state'
import type { DocumentSession } from './workspace-types'
import { commitFreeTileSourceEditInSession } from './workspace-free-tile-transaction'
import { tr } from './workspace-translation'
import { completeDocumentChange } from './workspace-document-change'

export const restoreAntiAliasPreviewState = (session: DocumentSession, preview: AntiAliasPreview): void => {
  for (let index = preview.edits.length - 1; index >= 0; index -= 1) revertPixelEdit(session.document, preview.edits[index])
  syncActiveAnimationFrame(session.document)
}

export const invalidateAntiAliasPreview = (session: DocumentSession): void => {
  const fromRevision = session.contentRevision
  session.revision += 1
  session.contentRevision += 1
  session.contentInvalidation = { kind: 'full', fromRevision, revision: session.contentRevision }
  session.selectionGuidesPreservedAtContentRevision = session.contentRevision
}

export const deleteFreeTileSourceSelectionInSession = (recordDocumentOperation: WorkspaceRecording['recordDocumentOperation'], session: DocumentSession): HistoryEntry | null => {
  if (!session.selection || session.freeTileMode !== 'edit') return null
  const target = activeFreeTileCelTarget(session.document)
  const instance = target && session.selectedFreeTileInstanceId ? (target.freeTiles.instances.find((candidate) => candidate.id === session.selectedFreeTileInstanceId) ?? null) : null
  const source = target && instance ? freeTileSourceForInstance(target.sources, instance) : null
  const sourceLayer = source ? target?.layer.freeTileSources?.find((candidate) => candidate.id === source.id) : null
  if (!target || !instance || !source || sourceLayer?.locked === true || source.visible === false || instance.locked === true || instance.visible === false) return null
  const bounds = freeTileInstanceBounds(instance, target.sources, target.surface.offsetX, target.surface.offsetY)
  const sourceEdit = createFreeTileSourceEditRaster(session.document, source, bounds, { x: session.selection.x, y: session.selection.y }, instance)
  if (!sourceEdit) return null
  const selection = freeTileSelectionToEditRaster(sourceEdit, session.selection)
  const edit = selection ? clearSelection(sourceEdit.document, selection, sourceEdit.layer) : null
  if (!edit) return null
  return commitFreeTileSourceEditInSession(recordDocumentOperation, session, source.id, sourceEdit.before, freeTileSourceSnapshotFromEditRaster(sourceEdit), tr('workspace.history.deleteSelection'))
}

export interface SelectionEffectTarget {
  layer: RasterLayer
  frameId?: string
  mask: boolean
}

/** Effects may expand a frame proxy and replace its storage even when no pixel edit is returned. */
export const syncSelectionEffectTarget = (session: DocumentSession, target: SelectionEffectTarget): void => {
  if (!target.frameId || target.mask) return
  syncAnimationLayerAtFrame(session.document, target.layer, target.frameId)
  // Read back the persisted surface before any active-frame sync can overwrite it.
  refreshActiveAnimationFrame(session.document)
}

export const selectedEffectTargets = (session: DocumentSession): SelectionEffectTarget[] => {
  const timeline = session.document.animation
  const targets: SelectionEffectTarget[] = []
  const seenPixels = new Set<object>()
  const collect = (layer: RasterLayer | null, frameId?: string, mask = false): void => {
    if (!layer || layer.kind || seenPixels.has(layer.pixels)) return
    seenPixels.add(layer.pixels)
    targets.push({ layer, frameId, mask })
  }
  syncActiveAnimationFrame(session.document)
  if (timeline && session.selectedAnimationMaskCellKeys.length > 0) {
    for (const key of session.selectedAnimationMaskCellKeys) {
      const target = parseAnimationCelKey(key)
      if (target) collect(animationMaskAt(timeline, target.layerId, target.frameId), target.frameId, true)
    }
    return targets
  }
  const mask = activeLayerMask(session)
  if (mask) {
    collect(mask, timeline?.activeFrameId, true)
    return targets
  }
  if (timeline && session.selectedAnimationCellKeys.length > 0) {
    for (const key of session.selectedAnimationCellKeys) {
      const target = parseAnimationCelKey(key)
      if (target) collect(animationLayerAtFrame(session.document, target.layerId, target.frameId), target.frameId)
    }
    return targets
  }
  const layers = selectedTransformLayersForSession(session)
  if (timeline && session.selectedAnimationFrameIds.length > 0) {
    for (const frameId of session.selectedAnimationFrameIds) for (const layer of layers) collect(animationLayerAtFrame(session.document, layer.id, frameId), frameId)
    return targets
  }
  const frameId = timeline?.activeFrameId
  for (const layer of layers) collect(frameId ? animationLayerAtFrame(session.document, layer.id, frameId) : layer, frameId)
  return targets
}

export const selectionEffectUsesMultipleTargets = (session: DocumentSession): boolean =>
  selectedTransformLayersForSession(session).length > 1 || session.selectedAnimationFrameIds.length > 1 || session.selectedAnimationCellKeys.length > 1 || session.selectedAnimationMaskCellKeys.length > 1

export const commitSelectedEffectInSession = (
  recordDocumentOperation: WorkspaceRecording['recordDocumentOperation'],
  session: DocumentSession,
  label: string,
  createEdit: (target: SelectionEffectTarget) => PixelEdit | null
): HistoryEntry | null => {
  const edits: PixelEdit[] = []
  for (const target of selectedEffectTargets(session)) {
    const edit = createEdit(target)
    syncSelectionEffectTarget(session, target)
    if (!edit) continue
    if (target.frameId) edit.frameId = target.frameId
    edits.push(edit)
  }
  if (edits.length === 0) return null
  const capturePersistentChanges = Boolean(session.localHistory) && loadEditorPreferences().localHistoryEnabled
  let committedCount = 0
  session.history.beginCompound()
  try {
    for (const edit of edits) {
      const entry = commitPixelEdit(session.document, edit, label, capturePersistentChanges)
      if (entry) {
        session.history.push(entry)
        committedCount += 1
      }
    }
    session.history.endCompound(label)
  } catch (error) {
    session.history.abortCompound()
    for (let index = edits.length - 1; index >= 0; index -= 1) revertPixelEdit(session.document, edits[index])
    syncActiveAnimationFrame(session.document)
    throw error
  }
  const entry = committedCount > 0 ? session.history.latestUndoEntry : null
  syncActiveAnimationFrame(session.document)
  if (entry) {
    session.selectionGuidesPreservedAtContentRevision = session.contentRevision + 1
    completeDocumentChange(session, 'content', recordDocumentOperation, { kind: 'full' })
  }
  return entry
}

export const deleteSelectedTargetsInSession = (recordDocumentOperation: WorkspaceRecording['recordDocumentOperation'], session: DocumentSession): HistoryEntry | null => {
  if (!session.selection) return null
  return commitSelectedEffectInSession(recordDocumentOperation, session, tr('workspace.history.deleteSelection'), (target) => target.mask
    ? fillSelectionOrCanvas(session.document, target.layer, session.secondaryColor, session.selection)
    : clearSelection(session.document, session.selection!, target.layer))
}
