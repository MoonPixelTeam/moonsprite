export const TILESET_TILE_PREVIEW_EVENT = 'moonsprite:tileset-tile-preview'

export interface TilesetTilePreviewDetail {
  documentId: string
  tilesetId: string
  tiles: ReadonlyMap<string, Uint8ClampedArray> | null
}

export const publishTilesetTilePreview = (detail: TilesetTilePreviewDetail): void => {
  window.dispatchEvent(new CustomEvent<TilesetTilePreviewDetail>(TILESET_TILE_PREVIEW_EVENT, { detail }))
}

export const clearTilesetTilePreview = (documentId: string, tilesetId: string): void => {
  publishTilesetTilePreview({ documentId, tilesetId, tiles: null })
}
