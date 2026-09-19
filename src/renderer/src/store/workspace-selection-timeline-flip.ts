import { animationLayerAtFrame, ensureAnimationDocument, parseAnimationCelKey, refreshActiveAnimationFrame, resolveAnimationCel, syncActiveAnimationFrame, syncAnimationLayerAtFrame, createAnimationCelLookup } from '@/core/animation'
import { getLayerIdsInGroup, isLayerEffectivelyLocked, isLayerEffectivelyVisible } from '@/core/document-model'
import { commitPixelEdit, type HistoryEntry } from '@/core/history'
import { flipLayer } from '@/core/tools-selection-transform-apply'
import { rasterStorageIdentity } from '@/core/runtime-raster'
import { applyTilemapDocumentEdit, flipTilemapSelection } from '@/core/tilemap-document'
import { tilemapEditBytes } from '@/core/tilemap'
import { cloneFreeTileCelData, freeTileCelDataEqual } from '@/core/free-tile'
import { applyFreeTilePlacementEdit, type FreeTilePlacementEdit } from '@/core/free-tile-document'
import { loadEditorPreferences } from '@/core/file-preferences'
import { activeLayerMask } from './workspace-session'
import type { DocumentSession } from './workspace-types'
import type { WorkspaceRecording } from './workspace-recording'
import { completeDocumentChange } from './workspace-document-change'
import { tr } from './workspace-translation'

/** Whole-cel flips use explicit timeline targets, never a synthetic canvas marquee. */
export function flipSelectedTimelineContents(session: DocumentSession, axis: 'horizontal' | 'vertical', record: WorkspaceRecording['recordDocumentOperation']): boolean {
  if (session.selection || activeLayerMask(session) || session.selectedAnimationMaskCellKeys.length > 0 || session.selectedAnimationMaskRowKeys.length > 0) return false
  const explicitLayers = session.layerSelectionExplicit || session.selectedGroupId !== null || session.selectedGroupIds.length > 0
  if (!explicitLayers && session.selectedAnimationCellKeys.length === 0 && session.selectedAnimationFrameIds.length === 0) return false
  const document = session.document
  syncActiveAnimationFrame(document)
  const timeline = ensureAnimationDocument(document)
  const layerIds = new Set(session.selectedLayerIds)
  for (const groupId of new Set([...session.selectedGroupIds, ...(session.selectedGroupId ? [session.selectedGroupId] : [])])) {
    for (const layerId of getLayerIdsInGroup(document, groupId)) layerIds.add(layerId)
  }
  const frames = session.selectedAnimationFrameIds.length > 0 ? session.selectedAnimationFrameIds : timeline.frames.map((frame) => frame.id)
  const pairs = session.selectedAnimationCellKeys.length > 0
    ? session.selectedAnimationCellKeys.flatMap((key) => { const pair = parseAnimationCelKey(key); return pair ? [pair] : [] })
    : document.layers.filter((layer) => !explicitLayers || layerIds.has(layer.id))
      .flatMap((layer) => frames.map((frameId) => ({ layerId: layer.id, frameId })))
  const lookup = createAnimationCelLookup(timeline)
  const seen = new Set<object>()
  // Capture identities before any edit replaces a surface or updates a linked cel.
  const targets = pairs.filter(({ layerId, frameId }) => {
    const layer = document.layers.find((candidate) => candidate.id === layerId)
    if (!layer || layer.kind === 'text' || !isLayerEffectivelyVisible(document, layer) || isLayerEffectivelyLocked(document, layer)) return false
    const source = lookup.resolve(lookup.at(layerId, frameId))
    if (!source?.surface) return false
    const identity = layer.kind === 'tilemap' ? source.tilemap : layer.kind === 'free-tile' ? source.freeTiles : rasterStorageIdentity(source.surface)
    if (!identity || seen.has(identity)) return false
    seen.add(identity)
    return true
  })
  const label = axis === 'horizontal' ? tr('workspace.history.flipSelectionHorizontal') : tr('workspace.history.flipSelectionVertical')
  const entries: HistoryEntry[] = []
  const capturePersistentChanges = Boolean(session.localHistory) && loadEditorPreferences().localHistoryEnabled
  try {
    for (const { layerId, frameId } of targets) {
      const layer = animationLayerAtFrame(document, layerId, frameId)
      if (!layer) continue
      if (layer.kind === 'tilemap') {
        const edit = flipTilemapSelection(document, layerId, frameId, { x: layer.offsetX, y: layer.offsetY, width: layer.width, height: layer.height }, axis)
        if (edit) entries.push({ label, bytes: tilemapEditBytes(edit), affectedLayerIds: [layerId],
          undo: () => { applyTilemapDocumentEdit(document, edit, 'before') },
          redo: () => { applyTilemapDocumentEdit(document, edit, 'after') } })
      } else if (layer.kind === 'free-tile') {
        const source = resolveAnimationCel(timeline, timeline.cels.find((cel) => cel.layerId === layerId && cel.frameId === frameId) ?? null)
        if (!source?.freeTiles) continue
        const before = cloneFreeTileCelData(source.freeTiles)
        const after = cloneFreeTileCelData(before)
        for (const instance of after.instances) {
          if (instance.locked === true) continue
          if (axis === 'horizontal') instance.flipHorizontal = instance.flipHorizontal !== true
          else instance.flipVertical = instance.flipVertical !== true
        }
        if (freeTileCelDataEqual(before, after)) continue
        const edit: FreeTilePlacementEdit = { layerId, frameId, before, after, dirtyRect: null }
        applyFreeTilePlacementEdit(document, edit, 'after')
        entries.push({ label, bytes: (before.instances.length + after.instances.length) * 72, affectedLayerIds: [layerId],
          undo: () => { applyFreeTilePlacementEdit(document, edit, 'before') },
          redo: () => { applyFreeTilePlacementEdit(document, edit, 'after') } })
      } else {
        const edit = flipLayer(document, axis, layer)
        if (!edit) continue
        edit.frameId = frameId
        syncAnimationLayerAtFrame(document, layer, frameId)
        refreshActiveAnimationFrame(document)
        const entry = commitPixelEdit(document, edit, label, capturePersistentChanges)
        if (entry) entries.push(entry)
      }
    }
  } catch (error) {
    for (const entry of [...entries].reverse()) entry.undo()
    refreshActiveAnimationFrame(document)
    throw error
  }
  if (entries.length > 0) {
    session.history.push({ label, bytes: entries.reduce((total, entry) => total + entry.bytes, 0),
      undo: () => { for (const entry of [...entries].reverse()) entry.undo(); refreshActiveAnimationFrame(document) },
      redo: () => { for (const entry of entries) entry.redo(); refreshActiveAnimationFrame(document) },
      affectedLayerIds: [...new Set(entries.flatMap((entry) => entry.affectedLayerIds ?? []))],
      contentChanged: true, invalidation: { kind: 'full' }, requiresAnimationSync: false
    })
    session.lastPencilPoint = null
    session.lastEraserPoint = null
    completeDocumentChange(session, 'content', record, { kind: 'full' })
  }
  return true
}
