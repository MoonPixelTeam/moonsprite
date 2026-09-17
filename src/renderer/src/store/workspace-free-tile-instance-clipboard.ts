import { createId, isLayerEffectivelyLocked } from '@/core/document-model'
import { activeFreeTileCelTarget, applyFreeTilePlacementEdit, freeTileSetIdForLayer, replaceFreeTileSetSources, type FreeTilePlacementEdit } from '@/core/free-tile-document'
import { cloneFreeTileCelData, freeTileSourceForInstance } from '@/core/free-tile'
import { cloneTileset } from '@/core/tilemap'
import type { LayerCollectionClipboard } from './clipboard-service'
import type { DocumentSession } from './workspace-types'
import type { WorkspaceRecording } from './workspace-recording'
import { completeDocumentChange } from './workspace-document-change'
import { setFreeTileInstanceSelectionState } from './workspace-free-tile-selection'
import { tr } from './workspace-translation'

export function captureFreeTileInstances(session: DocumentSession): LayerCollectionClipboard | null {
  const target = activeFreeTileCelTarget(session.document)
  if (!target) return null
  const setId = freeTileSetIdForLayer(target.layer)
  if (!setId) return null
  const ids = new Set(session.selectedFreeTileInstanceIds.length ? session.selectedFreeTileInstanceIds : [session.selectedFreeTileInstanceId])
  const instances = target.freeTiles.instances.filter(instance => ids.has(instance.id)).map(instance => ({ ...instance,
    sourceId: freeTileSourceForInstance(target.sources, instance)?.id ?? instance.sourceId }))
  if (!instances.length) return null
  const sourceIds = new Set(instances.map(instance => instance.sourceId))
  const sources = (target.layer.freeTileSources ?? []).filter(source => sourceIds.has(source.id))
  return { sourceDocumentId: session.document.id, layers: [], groups: [],
    tilesets: (session.document.tilesets ?? []).filter(tileset => sources.some(source => source.tilesetId === tileset.id)),
    freeTileInstances: { setId, offsetX: target.surface.offsetX, offsetY: target.surface.offsetY, instances, sources } }
}

export function pasteFreeTileInstances(session: DocumentSession, clipboard: LayerCollectionClipboard, record: WorkspaceRecording['recordDocumentOperation']): boolean {
  const copied = clipboard.freeTileInstances, document = session.document
  const target = activeFreeTileCelTarget(document)
  if (!copied || !target || isLayerEffectivelyLocked(document, target.layer)) return false
  const beforeSources = [...(target.layer.freeTileSources ?? [])]
  const shared = clipboard.sourceDocumentId === document.id && copied.setId === freeTileSetIdForLayer(target.layer)
  const addedSources: typeof beforeSources = [], addedTilesets: NonNullable<typeof document.tilesets> = []
  const sourceIds = new Map<string, string>()
  for (const source of copied.sources) {
    const existing = shared ? beforeSources.find(candidate => candidate.id === source.id) : null
    if (existing) { sourceIds.set(source.id, existing.id); continue }
    const originalTileset = clipboard.tilesets?.find(tileset => tileset.id === source.tilesetId)
    if (!originalTileset) return false
    const tileset = { ...cloneTileset(originalTileset), id: createId('tileset') }
    const imported = { ...source, id: createId('free-tile-source'), tilesetId: tileset.id }
    addedSources.push(imported)
    addedTilesets.push(tileset)
    sourceIds.set(source.id, imported.id)
  }
  if (copied.instances.some(instance => !instance.sourceId || !sourceIds.has(instance.sourceId))) return false
  const instances = copied.instances.map(instance => ({ ...instance, id: createId('free-tile-instance'), sourceId: sourceIds.get(instance.sourceId!)!,
    x: instance.x + copied.offsetX - target.surface.offsetX, y: instance.y + copied.offsetY - target.surface.offsetY }))
  const before = cloneFreeTileCelData(target.freeTiles)
  const edit: FreeTilePlacementEdit = { layerId: target.layer.id, frameId: target.cel.frameId, before,
    after: { instances: [...before.instances, ...instances] }, dirtyRect: null }
  const previousIds = [...session.selectedFreeTileInstanceIds], previousPrimary = session.selectedFreeTileInstanceId
  const previousAnchor = session.freeTileInstanceSelectionAnchorId
  const previousSelection = session.selection, previousPivot = session.selectionPivot
  const addedIds = new Set(addedTilesets.map(tileset => tileset.id))
  const apply = (): void => {
    if (addedSources.length) {
      document.tilesets = [...(document.tilesets ?? []).filter(tileset => !addedIds.has(tileset.id)), ...addedTilesets.map(cloneTileset)]
      replaceFreeTileSetSources(document, target.layer, [...beforeSources, ...addedSources])
    }
    applyFreeTilePlacementEdit(document, edit, 'after')
    setFreeTileInstanceSelectionState(session, instances.map(instance => instance.id), instances.at(-1)!.id)
    session.selection = null
    session.selectionPivot = null
  }
  apply()
  session.history.push({ label: tr('workspace.history.pasteToLayer'),
    bytes: (edit.before.instances.length + edit.after.instances.length) * 72 + addedTilesets.reduce((sum, tileset) => sum + tileset.pixels.byteLength, 0),
    undo: () => {
      applyFreeTilePlacementEdit(document, edit, 'before')
      if (addedSources.length) {
        replaceFreeTileSetSources(document, target.layer, beforeSources)
        document.tilesets = (document.tilesets ?? []).filter(tileset => !addedIds.has(tileset.id))
      }
      setFreeTileInstanceSelectionState(session, previousIds, previousPrimary, previousAnchor)
      session.selection = previousSelection
      session.selectionPivot = previousPivot
    }, redo: apply, invalidation: { kind: 'full' }, affectedLayerIds: [target.layer.id], contentChanged: true, requiresAnimationSync: false })
  completeDocumentChange(session, 'content', record, { kind: 'full' })
  return true
}
