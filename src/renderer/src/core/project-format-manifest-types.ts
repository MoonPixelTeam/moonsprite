import { type BlendMode, type PaletteEntry, type RgbaColor } from '@shared/types-color'
import { type AnimationFrame, type AnimationLoopSection } from '@shared/types-animation'
import { type BackgroundLayerSettings, type LayerGroup } from '@shared/types-layer'
import { type ColorMode, type RasterFormat } from '@shared/types-raster'
import { type FreeTileInstance, type FreeTileSourceLayer, type TilemapCell } from '@shared/types-tiles'
import { type LayerStyles } from '@shared/types-layer-style'
import { type SpriteDocument } from '@shared/types-document'
import { type TextCelData } from '@shared/types-text'
import { type TimelapseSettings } from '@shared/types-timelapse'


export interface ManifestLayer {
  id: string
  name: string
  linkedContentId?: string
  autoLinkAnimationCels?: boolean
  displayColor?: RgbaColor
  description?: string
  kind?: 'text' | 'tilemap' | 'free-tile'
  tilemapTilesetId?: string
  freeTileTilesetId?: string
  freeTileSetId?: string
  freeTileSources?: FreeTileSourceLayer[]
  visible: boolean
  locked: boolean
  opacity: number
  blendMode?: BlendMode
  clippingMask?: boolean
  layerStyles?: LayerStyles
  background?: BackgroundLayerSettings
  groupId?: string | null
  width?: number
  height?: number
  offsetX?: number
  offsetY?: number
  dataFile: string
  dataEncoding?: RasterDataEncoding
}

export interface ManifestMask {
  id: string
  linkedMaskId?: string | null
  locked?: boolean
  autoLinkAnimationCels?: boolean
  width: number
  height: number
  offsetX: number
  offsetY: number
  dataFile: string
}

export interface ManifestProjectBrush {
  id: string
  name: string
  width: number
  height: number
  dataFile: string
  colorsFile?: string
  sourceX?: number
  sourceY?: number
}

export interface ManifestTileset {
  id: string
  name: string
  tileWidth: number
  tileHeight: number
  columns: number
  rows: number
  tileIds: string[]
  tileSlots?: Array<string | null>
  dataFile: string
}

interface ManifestTilemapCell extends TilemapCell {
  index: number
}

export interface ManifestTilemapCelData {
  tileWidth: number
  tileHeight: number
  columns: number
  rows: number
  cells: ManifestTilemapCell[]
}

export interface ManifestFreeTileCelData {
  instances: FreeTileInstance[]
}

export interface ManifestCel {
  id: string
  layerId: string
  frameId: string
  linkedCelId?: string | null
  zIndex?: number
  opacity?: number
  format?: RasterFormat
  width?: number
  height?: number
  offsetX?: number
  offsetY?: number
  dataFile?: string
  dataEncoding?: RasterDataEncoding
  mask?: ManifestMask
  text?: TextCelData
  tilemap?: ManifestTilemapCelData
  freeTiles?: ManifestFreeTileCelData
}

export interface ManifestGroupMask {
  groupId: string
  frameId: string
  mask: ManifestMask
}

export interface ManifestLayerMask {
  layerId: string
  frameId: string
  mask: ManifestMask
}

export interface ManifestAnimation {
  frames: AnimationFrame[]
  cels: ManifestCel[]
  layerMasks: ManifestLayerMask[]
  groupMasks: ManifestGroupMask[]
  loopSections: AnimationLoopSection[]
  activeFrameId: string
  loop: boolean
}

interface ManifestTimelapseSnapshot {
  id: string
  capturedAt: number
  elapsedMs: number
  width: number
  height: number
  changeScore?: number
  dataFile?: string
  local?: import('@shared/types-timelapse').TimelapseFrameReference
}

export interface ManifestTimelapse extends Omit<TimelapseSettings, 'snapshots'> {
  snapshots: ManifestTimelapseSnapshot[]
}

export type RasterDataEncoding = 'raw' | 'sparse-tiles-v1'

export const PROJECT_SCHEMA_VERSION = 20

export const FREE_TILE_SET_PROJECT_SCHEMA_VERSION = 18

export const LINKED_LAYERS_PROJECT_SCHEMA_VERSION = 17

export const LOOP_SECTIONS_PROJECT_SCHEMA_VERSION = 16

export const FREE_TILE_SOURCE_PROJECT_SCHEMA_VERSION = 15

export const FREE_TILE_PROJECT_SCHEMA_VERSION = 14

export const TILEMAP_PROJECT_SCHEMA_VERSION = 13

export const BACKGROUND_LAYER_PROJECT_SCHEMA_VERSION = 12

export const LAYER_STYLES_PROJECT_SCHEMA_VERSION = 11

export const DOCUMENT_COLOR_MODE_PROJECT_SCHEMA_VERSION = 10

export const TEXT_BOX_PROJECT_SCHEMA_VERSION = 9

export const STYLED_TEXT_PROJECT_SCHEMA_VERSION = 8

export const EDITABLE_TEXT_PROJECT_SCHEMA_VERSION = 7

export const SLICES_PROJECT_SCHEMA_VERSION = 6

export const SPARSE_RASTER_PROJECT_SCHEMA_VERSION = 5

export const LEGACY_PROJECT_SCHEMA_VERSION = 4

export const SPARSE_TILE_SIZE = 64

export const SPARSE_TILE_MAGIC = 0x3154534d

export const SPARSE_TILE_HEADER_BYTES = 24

export const SPARSE_TILE_ENTRY_BYTES = 16

export interface ProjectManifest {
  schemaVersion: typeof PROJECT_SCHEMA_VERSION
  app: 'MoonSprite'
  document: Omit<SpriteDocument, 'layers' | 'groups' | 'palette' | 'customBrushes' | 'tilesets' | 'animation' | 'timelapse' | 'filePath' | 'sourceFilePath' | 'dirty'> & {
    schemaVersion: typeof PROJECT_SCHEMA_VERSION
    layers: ManifestLayer[]
    groups: LayerGroup[]
    palette: PaletteEntry[]
    customBrushes: ManifestProjectBrush[]
    tilesets: ManifestTileset[]
    animation: ManifestAnimation
    timelapse?: ManifestTimelapse
  }
  sourceSchemaVersion?: number
}

export interface ProjectGalleryMetadata {
  name: string
  width: number
  height: number
  colorMode: ColorMode
  preview: Uint8Array
}

export interface ProjectGalleryReadOptions {
  generateMissingPreview?: boolean
}

export interface ProjectEncodeOptions {
  /** Recovery snapshots do not need a gallery preview and can skip its full-canvas composite. */
  includePreview?: boolean
  /** Lower compression trades disk space for a substantially shorter main-thread encode. */
  compressionLevel?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
  /** Reports completion of archive preparation and sequential file compression. */
  onProgress?: (value: number) => void
}

export interface ProjectArchiveResource {
  key: string
  path: string
  revision: number | null
  byteLength?: number
  raster?: {
    width: number
    height: number
    offsetX: number
    offsetY: number
    dataEncoding: RasterDataEncoding
    byteLength?: number
  }
}

export interface ProjectArchiveBuild {
  files: Record<string, Uint8Array>
  resources: ProjectArchiveResource[]
  preview?: ProjectPreviewCache
}

export interface ProjectPreviewCache {
  key: string
  data: Uint8Array
}

export interface ProjectArchiveReuseEntry {
  path: string
  crc32: number
  byteLength: number
  encoding?: RasterDataEncoding
  width?: number
  height?: number
}

export interface ProjectSaveBaseline {
  preview?: ProjectPreviewCache
  sourcePath: string
  schemaVersion: number
  resources: Map<
    string,
    {
      path: string
      crc32: number
      revision: number | null
      byteLength?: number
      raster?: ProjectArchiveResource['raster']
    }
  >
}

interface ProjectSaveBaselineCandidate {
  resources: Array<ProjectArchiveResource & { crc32: number }>
  preview?: ProjectPreviewCache
}

export interface EncodedProjectSave {
  data: Uint8Array
  sourcePath: string | null
  reusableEntries: ProjectArchiveReuseEntry[]
  baseline: ProjectSaveBaselineCandidate
}

interface SerializedProjectSaveBaseline {
  preview?: ProjectPreviewCache
  sourcePath: string
  schemaVersion: number
  resources: Array<
    [
      string,
      {
        path: string
        crc32: number
        revision: number | null
        byteLength?: number
        raster?: ProjectArchiveResource['raster']
      }
    ]
  >
}

export interface ProjectEncodeWorkerPayload {
  document: SpriteDocument
  includePreview: boolean
  compressionLevel: NonNullable<ProjectEncodeOptions['compressionLevel']>
  incremental: boolean
  baseline?: SerializedProjectSaveBaseline
  resourceRevisions: Array<[string, number | null]>
  layerStorageOrigins: Array<[string, { x: number; y: number }]>
}

export interface ProjectEncodeWorkerResult {
  data: Uint8Array
  sourcePath: string | null
  reusableEntries: ProjectArchiveReuseEntry[]
  baseline: ProjectSaveBaselineCandidate
}

export interface ProjectEncodeWorkerResponse {
  id: number
  result?: ProjectEncodeWorkerResult
  error?: string
}

export interface RasterDataSource {
  dataFile: string
  dataEncoding: RasterDataEncoding
  width: number
  height: number
  offsetX: number
  offsetY: number
}
