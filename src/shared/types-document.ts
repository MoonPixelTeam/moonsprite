import type { GridSettings } from './types-view'
import type { ColorMode } from './types-raster'
import type { RasterLayer, LayerGroup } from './types-layer'
import type { PaletteEntry } from './types-color'
import type { ProjectBrush } from './types-brush'
import type { Tileset } from './types-tiles'
import type { AnimationTimeline } from './types-animation'
import type { OutlineSettings } from './types-selection'
import type { TimelapseSettings } from './types-timelapse'

export interface ProjectDisplaySettings {
  showPixelGrid: boolean
  showGrid: boolean
  grid: GridSettings
}

export interface ProjectStatistics {
  strokeCount: number
  operationCount: number
  drawingTimeMs: number
}

export interface ProjectLayerPanelState {
  activeLayerId: string
  selectedLayerIds: string[]
  selectedGroupIds: string[]
  selectedGroupId: string | null
  layerSelectionAnchorId: string | null
  collapsedGroupIds: string[]
}

export interface DocumentSlice {
  id: string
  name: string
  x: number
  y: number
  width: number
  height: number
}

export interface SpriteDocument {
  schemaVersion: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19
  id: string
  name: string
  width: number
  height: number
  colorMode: ColorMode
  layers: RasterLayer[]
  groups: LayerGroup[]
  activeLayerId: string
  palette: PaletteEntry[]
  paletteOrder: number[]
  /** Fixed visual palette slots. Empty entries preserve user-defined spacing and placement. */
  paletteSlots?: Array<number | null>
  /** Column count used to decode paletteSlots into stable two-dimensional positions. */
  paletteColumns?: number
  nextColorId: number
  /** Project-owned brushes are stored in the .moonsprite container. */
  customBrushes?: ProjectBrush[]
  /** Project-owned tile sheets referenced by Tilemap cells. */
  tilesets?: Tileset[]
  /** Animation metadata is independent from layer ordering and optional for v1 compatibility. */
  animation?: AnimationTimeline
  /** Project-owned defaults for the selection outline dialog. */
  outlineSettings?: OutlineSettings
  /** Project-owned display toggles. View navigation remains session-only. */
  displaySettings?: ProjectDisplaySettings
  /** Layer panel context restored when the project is reopened. */
  layerPanelState?: ProjectLayerPanelState
  /** Persisted editing statistics used by the project information view. */
  statistics?: ProjectStatistics
  /** Optional complete history of drawing snapshots for timelapse export. */
  timelapse?: TimelapseSettings
  /** Named export regions stored in document pixel coordinates. */
  slices?: DocumentSlice[]
  filePath: string | null
  /** Original path used to open imported images or Aseprite projects. */
  sourceFilePath?: string
  dirty: boolean
  createdAt: string
  updatedAt: string
}
