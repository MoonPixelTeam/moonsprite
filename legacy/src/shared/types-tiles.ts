import type { RgbaColor, BlendMode } from './types-color'

export type TilemapQuarterTurns = 0 | 1 | 2 | 3

export interface TilemapCell {
  tilesetId: string
  tileId: string
  flipHorizontal?: boolean
  flipVertical?: boolean
  /** Clockwise quarter turns applied after flips. */
  rotation?: TilemapQuarterTurns
}

export interface TilemapCelData {
  tileWidth: number
  tileHeight: number
  columns: number
  rows: number
  cells: Array<TilemapCell | null>
}

/** A reusable source owned by one Free Tile set and shared by every member layer. Source dimensions come from its Tileset. */
export interface FreeTileSourceLayer {
  id: string
  name: string
  /** The one-tile Tileset that stores this source's pixels. */
  tilesetId: string
  description?: string
  displayColor?: RgbaColor
  visible: boolean
  locked: boolean
  /** Legacy source-wide appearance values. New instances override these values. */
  opacity: number
  /** Legacy source-wide appearance values. New instances override these values. */
  blendMode: BlendMode
  /** Source-local layer offset retained for layer-like editing and future group transforms. */
  offsetX: number
  offsetY: number
}

export interface FreeTileInstance {
  /** Stable instance ID; array order is the compositing order from back to front. */
  id: string
  /** Source layer in the owning Free Tile Layer. */
  sourceId?: string
  /** Legacy source tile ID used by schema v14 projects. */
  tileId?: string
  /** Pixel position in the cel surface's local coordinate system. */
  x: number
  y: number
  /** Instance-level visibility; omitted legacy values are visible. */
  visible?: boolean
  /** Instance-level edit lock; omitted legacy values are unlocked. */
  locked?: boolean
  /** Instance opacity. Omitted legacy values inherit the source opacity. */
  opacity?: number
  /** Instance blend mode. Omitted legacy values inherit the source blend mode. */
  blendMode?: BlendMode
  /** Clockwise quarter turns applied only to this instance. */
  rotation?: TilemapQuarterTurns
  /** Instance-only mirrors; source pixels remain unchanged. */
  flipHorizontal?: boolean
  flipVertical?: boolean
}

export interface FreeTileCelData {
  instances: FreeTileInstance[]
}

export interface Tileset {
  id: string
  name: string
  tileWidth: number
  tileHeight: number
  columns: number
  rows: number
  /** Stable IDs in row-major sheet order. */
  tileIds: string[]
  /** Nullable row-major positions used by the Tileset panel; omitted legacy data is compact. */
  tileSlots?: Array<string | null>
  /** Padded RGBA sheet sized columns * tileWidth by rows * tileHeight. */
  pixels: Uint8ClampedArray
}
