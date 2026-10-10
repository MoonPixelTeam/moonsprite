import { syncActiveAnimationFrame } from '@/core/animation'
import { cloneTileset, deleteTilesetTiles } from '@/core/tilemap'
import { captureTilesetTileReferences } from '@/core/tilemap-document'
import { captureFreeTileReferences, replaceFreeTileSetSources } from '@/core/free-tile-document'
import { markRasterStorageContentChanged } from '@/core/document-model'
import type { DocumentSession } from './workspace-types'
import { completeDocumentChange } from './workspace-document-change'
import { tr } from './workspace-translation'
import { cloneFreeTileSourceLayer } from './workspace-layer-resources'

/** Keep references in every frame, including hidden layers and disabled frames. */
export function clearUnusedTiles(session: DocumentSession, tilesetId: string, record: Parameters<typeof completeDocumentChange>[2]): boolean {
  syncActiveAnimationFrame(session.document)
  const tileset = session.document.tilesets?.find(item => item.id === tilesetId)
  if (!tileset) return false
  const unused = tileset.tileIds.filter(id => captureTilesetTileReferences(session.document, tilesetId, id).length === 0 && captureFreeTileReferences(session.document, tilesetId, id).length === 0)
  if (!unused.length) return false
  const before = cloneTileset(tileset)
  const after = deleteTilesetTiles(tileset, unused) ?? cloneTileset(tileset)
  // A tileset must retain one tile; an entirely unused set keeps a blank slot.
  if (unused.length === tileset.tileIds.length) after.pixels.fill(0)
  if (after.tileIds.length === before.tileIds.length && after.pixels.every((value, index) => value === before.pixels[index])) return false
  const beforeSelection = { tilesetId: session.selectedTilesetId, tileId: session.selectedTileId, secondaryTileId: session.secondaryTileId }
  const afterSelection = beforeSelection.tilesetId !== tilesetId ? beforeSelection : { ...beforeSelection,
    tileId: after.tileIds.includes(beforeSelection.tileId ?? '') ? beforeSelection.tileId : after.tileIds[0],
    secondaryTileId: after.tileIds.includes(beforeSelection.secondaryTileId ?? '') ? beforeSelection.secondaryTileId : after.tileIds[0] }
  const apply = (snapshot: typeof before, selection: typeof beforeSelection) => {
    const replacement = cloneTileset(snapshot)
    session.document.tilesets = session.document.tilesets!.map(item => item.id === tilesetId ? replacement : item)
    markRasterStorageContentChanged(replacement.pixels)
    session.selectedTilesetId = selection.tilesetId; session.selectedTileId = selection.tileId; session.secondaryTileId = selection.secondaryTileId
  }
  apply(after, afterSelection)
  session.history.push({ label: tr('tileset.clearUnused'), bytes: before.pixels.byteLength + after.pixels.byteLength + 128,
    undo: () => apply(before, beforeSelection), redo: () => apply(after, afterSelection), invalidation: { kind: 'full' }, requiresAnimationSync: false })
  completeDocumentChange(session, 'content', record, { kind: 'full' })
  return true
}

/** Remove unused sources from the displayed shared set, preserving all frame references. */
export function clearUnusedFreeTileSources(session: DocumentSession, layerId: string, record: Parameters<typeof completeDocumentChange>[2]): boolean {
  const document = session.document
  syncActiveAnimationFrame(document)
  const layer = document.layers.find(item => item.id === layerId && item.kind === 'free-tile')
  if (!layer?.freeTileSources?.length) return false
  const beforeSources = layer.freeTileSources.map(cloneFreeTileSourceLayer)
  const unused = beforeSources.filter(source => {
    const tileset = document.tilesets?.find(item => item.id === source.tilesetId)
    return tileset && tileset.tileIds.every(id => captureFreeTileReferences(document, tileset.id, id).length === 0 && captureTilesetTileReferences(document, tileset.id, id).length === 0)
  })
  if (!unused.length) return false
  const allUnused = unused.length === beforeSources.length
  const removedIds = new Set(unused.filter(source => !allUnused || source.id !== beforeSources[0].id).map(source => source.id))
  const afterSources = beforeSources.filter(source => !removedIds.has(source.id))
  const removedTilesets = new Set(beforeSources.filter(source => removedIds.has(source.id)).map(source => source.tilesetId))
  // Keep storage owned by any source outside the cleaned set.
  for (const other of document.layers) for (const source of other.freeTileSources ?? []) {
    if (!beforeSources.some(item => item.id === source.id)) removedTilesets.delete(source.tilesetId)
  }
  const blankId = allUnused ? afterSources[0].tilesetId : null
  const changedIds = new Set([...removedTilesets, ...(blankId ? [blankId] : [])])
  const beforeTilesets = (document.tilesets ?? []).map(item => changedIds.has(item.id) ? cloneTileset(item) : item)
  const afterTilesets = beforeTilesets.filter(item => !removedTilesets.has(item.id)).map(item => {
    if (item.id !== blankId) return item
    const blank = cloneTileset(item); blank.pixels.fill(0); return blank
  })
  if (!removedIds.size && !beforeTilesets.some(item => item.id === blankId && item.pixels.some(value => value !== 0))) return false
  const beforeSelection = { tilesetId: session.selectedTilesetId, tileId: session.selectedTileId, secondaryTileId: session.secondaryTileId }
  const fallback = afterTilesets.find(item => item.id === afterSources[0].tilesetId)
  const afterSelection = removedTilesets.has(beforeSelection.tilesetId ?? '')
    ? { tilesetId: fallback?.id ?? null, tileId: fallback?.tileIds[0] ?? null, secondaryTileId: fallback?.tileIds[0] ?? null } : beforeSelection
  const apply = (sources: typeof beforeSources, tilesets: typeof beforeTilesets, selection: typeof beforeSelection) => {
    replaceFreeTileSetSources(document, layer, sources)
    document.tilesets = tilesets.map(item => {
      if (!changedIds.has(item.id)) return item
      const replacement = cloneTileset(item); markRasterStorageContentChanged(replacement.pixels); return replacement
    })
    session.selectedTilesetId = selection.tilesetId; session.selectedTileId = selection.tileId; session.secondaryTileId = selection.secondaryTileId
  }
  apply(afterSources, afterTilesets, afterSelection)
  session.history.push({ label: tr('tileset.clearUnused'),
    bytes: beforeTilesets.filter(item => changedIds.has(item.id)).reduce((bytes, item) => bytes + item.pixels.byteLength, 0) * 2 + (beforeSources.length + afterSources.length) * 128,
    undo: () => apply(beforeSources, beforeTilesets, beforeSelection), redo: () => apply(afterSources, afterTilesets, afterSelection),
    invalidation: { kind: 'full' }, contentChanged: true, requiresAnimationSync: false })
  completeDocumentChange(session, 'content', record, { kind: 'full' })
  return true
}
