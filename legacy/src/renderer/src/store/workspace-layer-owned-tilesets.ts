import type { RasterLayer } from '@shared/types-layer'
import type { SpriteDocument } from '@shared/types-document'
import type { Tileset } from '@shared/types-tiles'


export interface IndexedTilesetSnapshot {
  index: number
  tileset: Tileset
}

export const removableOwnedTilesets = (
  document: SpriteDocument,
  removedLayerIds: ReadonlySet<string>,
  ownerLayers: readonly RasterLayer[] = document.layers
): IndexedTilesetSnapshot[] => {
  const candidateIds = new Set(ownerLayers
    .filter((layer) => removedLayerIds.has(layer.id))
    .flatMap((layer) => layer.kind === 'tilemap' && layer.tilemapTilesetId
      ? [layer.tilemapTilesetId]
      : layer.kind === 'free-tile' ? (layer.freeTileSources ?? []).map((source) => source.tilesetId) : []))
  if (candidateIds.size === 0) return []
  const retainedOwnerIds = new Set(document.layers
    .filter((layer) => !removedLayerIds.has(layer.id))
    .flatMap((layer) => layer.kind === 'tilemap' && layer.tilemapTilesetId
      ? [layer.tilemapTilesetId]
      : layer.kind === 'free-tile' ? (layer.freeTileSources ?? []).map((source) => source.tilesetId) : []))
  const retainedReferenceIds = new Set((document.animation?.cels ?? [])
    .filter((cel) => !removedLayerIds.has(cel.layerId) && cel.tilemap)
    .flatMap((cel) => cel.tilemap!.cells.flatMap((cell) => cell ? [cell.tilesetId] : [])))
  return (document.tilesets ?? []).flatMap((tileset, index) => candidateIds.has(tileset.id) && !retainedOwnerIds.has(tileset.id) && !retainedReferenceIds.has(tileset.id)
    ? [{ index, tileset }]
    : [])
}

export const removeTilesetSnapshots = (document: SpriteDocument, snapshots: readonly IndexedTilesetSnapshot[]): void => {
  if (snapshots.length === 0) return
  const ids = new Set(snapshots.map((snapshot) => snapshot.tileset.id))
  document.tilesets = (document.tilesets ?? []).filter((tileset) => !ids.has(tileset.id))
}
