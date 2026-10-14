export type ColorMode = 'rgba' | 'indexed' | 'grayscale'

/** Target channel precision for RGBA projects; runtime rasters remain RGBA8. */
export type PixelFormat = 'rgba32' | 'rgb24' | 'rgb565' | 'rgb555' | 'rgb332' | 'rgba4444' | 'rgba5551' | 'argb1555'

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
