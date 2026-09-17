import type { TileRepeatMode } from './types-raster'

export interface ViewState {
  zoom: number
  panX: number
  panY: number
  /** View-only clockwise rotation in degrees. Never changes document pixels. */
  rotation: number
  /** View-only horizontal mirror. Never changes document pixels. */
  mirrored: boolean
  /** View-only vertical mirror. Never changes document pixels. */
  mirroredVertical: boolean
  /** View-only one-pixel grid visibility. Optional for hot-reloaded legacy sessions. */
  showPixelGrid?: boolean
  showGrid: boolean
  /** View-only configurable grid origin and cell size. */
  grid?: GridSettings
  /** View-only 2:1 isometric guides and optional straight-line alignment. */
  isoViewEnabled?: boolean
  relativeLuminance: boolean
  /** View-only repeated canvas preview and wrapped painting mode. */
  tileRepeatMode?: TileRepeatMode
  /** View-only selection outline visibility. The selection itself remains active. */
  showSelectionOutline?: boolean
  /** View-only transform pivot visibility. The configured pivot still affects transforms while hidden. */
  showSelectionPivot?: boolean
  /** Quick Command Bar center as a normalized horizontal position in its owning canvas. */
  quickCommandBarPositionX?: number
  /** Whether this project keeps its Quick Command Bar expanded while it owns canvas focus. */
  quickCommandBarExpanded?: boolean
}

export interface GridSettings {
  x: number
  y: number
  width: number
  height: number
}
