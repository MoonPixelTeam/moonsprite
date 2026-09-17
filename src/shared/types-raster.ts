export type ColorMode = 'rgba' | 'indexed' | 'grayscale'

export type RasterFormat = 'rgba' | 'indexed'

export type ImageResizeInterpolation = 'nearest' | 'smooth'

export type TileRepeatMode = 'off' | 'x' | 'y' | 'both'

export interface RuntimeRasterTiles {
  kind: 'sparse-tiles-v1'
  format: RasterFormat
  width: number
  height: number
  tileSize: number
  data: Uint8Array
  /** One-based payload offset per tile slot; zero means the tile is absent. */
  tileOffsets: Int32Array
  /** Exact visible bounds for immutable RGBA tiles; null means fully transparent. */
  visibleBounds?: { x: number; y: number; width: number; height: number } | null
}
