import { activeTilemapCelTarget } from '@/core/tilemap-document'
import { activeFreeTileCelTarget } from '@/core/free-tile-document'
import type { DocumentSession } from './workspace-types'

export const ensureTileSelection = (session: DocumentSession): void => {
  if (session.tilemapMode !== 'create' && session.tilemapMode !== 'hybrid' && session.tilemapMode !== 'paint' && session.tilemapMode !== 'edit') session.tilemapMode = 'hybrid'
  if (session.freeTileMode !== 'paint' && session.freeTileMode !== 'edit') session.freeTileMode = 'paint'
  const tilesets = session.document.tilesets ?? []
  if (tilesets.length === 0) {
    session.selectedTilesetId = null
    session.selectedTileId = null
    session.secondaryTileId = null
    return
  }
  const freeTarget = activeFreeTileCelTarget(session.document)
  const target = freeTarget ? null : activeTilemapCelTarget(session.document)
  const tilemapTilesetIds = new Set(session.document.layers.flatMap((layer) => layer.kind === 'tilemap' && layer.tilemapTilesetId ? [layer.tilemapTilesetId] : []))
  const compatible = freeTarget
    ? tilesets.filter((tileset) => freeTarget.sources.some((source) => source.tileset.id === tileset.id))
    : target
      ? tilesets.filter((tileset) => tilemapTilesetIds.has(tileset.id))
      : tilesets
  const selected = compatible.find((tileset) => tileset.id === session.selectedTilesetId) ?? compatible[0] ?? null
  session.selectedTilesetId = selected?.id ?? null
  session.selectedTileId = selected?.tileIds.includes(session.selectedTileId ?? '')
    ? session.selectedTileId
    : selected?.tileIds[0] ?? null
  session.secondaryTileId = selected?.tileIds.includes(session.secondaryTileId ?? '')
    ? session.secondaryTileId
    : selected?.tileIds[0] ?? null
}
