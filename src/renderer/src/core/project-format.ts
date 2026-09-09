import { inflateSync, strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate'
import { BLEND_MODES, type AnimationCelSurface, type AnimationFrame, type AnimationLoopSection, type BackgroundLayerSettings, type BlendMode, type ColorMode, type FreeTileCelData, type FreeTileInstance, type FreeTileSourceLayer, type LayerGroup, type LayerMask, type LayerStyles, type PaletteEntry, type ProjectBrush, type RasterFormat, type RasterLayer, type RgbaColor, type RuntimeRasterTiles, type SpriteDocument, type TextCelData, type TilemapCelData, type TilemapCell, type Tileset, type TimelapseSettings } from '@shared/types'
import { compositeDocument, createCompositePointSampler, createId, createNormalCompositePointSampler, getLayerStorageOrigin, getRasterContentRevision, paletteColorIdForCanvas, rasterContentBounds, remapIndexedDocumentToVisiblePalette, setLayerStorageOrigin } from './document'
import { createAnimationCelLookup, createDefaultAnimationTimeline, ensureAnimationDocument, normalizeAnimationTimeline, refreshActiveAnimationFrame, syncActiveAnimationLayers } from './animation'
import { normalizeOutlineSettings } from './outline-settings'
import { normalizeProjectDisplaySettings, normalizeProjectStatistics, normalizeTimelapseSettings } from './project-metadata'
import { encodePng } from './png-encode'
import { translateCurrent as tr } from './localization'
import { normalizePaletteColumns, normalizePaletteSlots } from './palette-layout'
import { normalizeProjectLayerPanelState } from './layer-panel-state'
import { installRuntimeRaster, rasterStorageIdentity, runtimeRasterForSurface } from './runtime-raster'
import { normalizeDocumentSlices } from './slices'
import { normalizeTextCelData } from './text-cel-data'
import { cloneLayerStyles, normalizeLayerStyles } from './layer-styles'
import { normalizeBackgroundLayerSettings } from './background-patterns'
import { MAX_TILE_SIZE, MAX_TILEMAP_CELLS, MAX_TILEMAP_SURFACE_PIXELS, MAX_TILESET_LAYOUT_SLOTS, MAX_TILESET_PIXELS, compactTilesetTileSlots, normalizeTilemapCell, renderTilemapSurface } from './tilemap'
import { MAX_FREE_TILE_INSTANCES, freeTileSourceRefs, normalizeFreeTileCelData, renderFreeTileSurface, type FreeTileSourceCollection } from './free-tile'
import { ensureFreeTileTilesetOwnership, freeTileSourcesForLayer } from './free-tile-document'
import { beginRuntimeDiagnosticOperation, runtimeDiagnosticsActive, type RuntimeDiagnosticOperation } from './runtime-diagnostics'

interface ManifestLayer {
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

interface ManifestMask {
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

interface ManifestProjectBrush {
  id: string
  name: string
  width: number
  height: number
  dataFile: string
  colorsFile?: string
  sourceX?: number
  sourceY?: number
}

interface ManifestTileset {
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

interface ManifestTilemapCelData {
  tileWidth: number
  tileHeight: number
  columns: number
  rows: number
  cells: ManifestTilemapCell[]
}

interface ManifestFreeTileCelData {
  instances: FreeTileInstance[]
}

interface ManifestCel {
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

interface ManifestGroupMask {
  groupId: string
  frameId: string
  mask: ManifestMask
}

interface ManifestLayerMask {
  layerId: string
  frameId: string
  mask: ManifestMask
}

interface ManifestAnimation {
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
  dataFile: string
}

interface ManifestTimelapse extends Omit<TimelapseSettings, 'snapshots'> {
  snapshots: ManifestTimelapseSnapshot[]
}

type RasterDataEncoding = 'raw' | 'sparse-tiles-v1'

export const PROJECT_SCHEMA_VERSION = 19
const FREE_TILE_SET_PROJECT_SCHEMA_VERSION = 18
const LINKED_LAYERS_PROJECT_SCHEMA_VERSION = 17
const LOOP_SECTIONS_PROJECT_SCHEMA_VERSION = 16
const FREE_TILE_SOURCE_PROJECT_SCHEMA_VERSION = 15
const FREE_TILE_PROJECT_SCHEMA_VERSION = 14
const TILEMAP_PROJECT_SCHEMA_VERSION = 13
const BACKGROUND_LAYER_PROJECT_SCHEMA_VERSION = 12
const LAYER_STYLES_PROJECT_SCHEMA_VERSION = 11
const DOCUMENT_COLOR_MODE_PROJECT_SCHEMA_VERSION = 10
const TEXT_BOX_PROJECT_SCHEMA_VERSION = 9
const STYLED_TEXT_PROJECT_SCHEMA_VERSION = 8
const EDITABLE_TEXT_PROJECT_SCHEMA_VERSION = 7
const SLICES_PROJECT_SCHEMA_VERSION = 6
const SPARSE_RASTER_PROJECT_SCHEMA_VERSION = 5
const LEGACY_PROJECT_SCHEMA_VERSION = 4
const SPARSE_TILE_SIZE = 64
const SPARSE_TILE_MAGIC = 0x3154534d
const SPARSE_TILE_HEADER_BYTES = 24
const SPARSE_TILE_ENTRY_BYTES = 16

interface ProjectManifest {
  schemaVersion: typeof PROJECT_SCHEMA_VERSION
  app: 'MoonSprite'
  document: Omit<SpriteDocument, 'layers' | 'groups' | 'palette' | 'customBrushes' | 'tilesets' | 'animation' | 'timelapse' | 'filePath' | 'sourceFilePath' | 'dirty'> & { schemaVersion: typeof PROJECT_SCHEMA_VERSION; layers: ManifestLayer[]; groups: LayerGroup[]; palette: PaletteEntry[]; customBrushes: ManifestProjectBrush[]; tilesets: ManifestTileset[]; animation: ManifestAnimation; timelapse?: ManifestTimelapse }
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

const toU8 = (array: Uint8ClampedArray | Uint32Array): Uint8Array =>
  new Uint8Array(array.buffer, array.byteOffset, array.byteLength)

interface EncodedRasterData {
  data: Uint8Array
  encoding: RasterDataEncoding
}

interface DecodedRasterData {
  pixels: Uint8ClampedArray | Uint32Array
  width: number
  height: number
  storageOffsetX: number
  storageOffsetY: number
  runtimeRaster?: RuntimeRasterTiles
}

const tileContainsContent = (pixels: Uint8ClampedArray | Uint32Array, format: RasterFormat, width: number, startX: number, startY: number, tileWidth: number, tileHeight: number): boolean => {
  for (let y = 0; y < tileHeight; y += 1) {
    let index = (startY + y) * width + startX
    const end = index + tileWidth
    if (format === 'rgba' && pixels instanceof Uint8ClampedArray) {
      for (; index < end; index += 1) {
        const offset = index * 4
        if (pixels[offset] !== 0 || pixels[offset + 1] !== 0 || pixels[offset + 2] !== 0 || pixels[offset + 3] !== 0) return true
      }
    } else if (format === 'indexed' && pixels instanceof Uint32Array) {
      for (; index < end; index += 1) if (pixels[index] !== 0) return true
    }
  }
  return false
}

const encodeSparseRasterData = (pixels: Uint8ClampedArray | Uint32Array, format: RasterFormat, width: number, height: number): EncodedRasterData => {
  const raw = toU8(pixels)
  const tiles: Array<{ x: number; y: number; width: number; height: number; data: Uint8Array }> = []
  let payloadBytes = 0
  for (let y = 0; y < height; y += SPARSE_TILE_SIZE) for (let x = 0; x < width; x += SPARSE_TILE_SIZE) {
    const tileWidth = Math.min(SPARSE_TILE_SIZE, width - x)
    const tileHeight = Math.min(SPARSE_TILE_SIZE, height - y)
    if (!tileContainsContent(pixels, format, width, x, y, tileWidth, tileHeight)) continue
    const bytes = new Uint8Array(tileWidth * tileHeight * 4)
    for (let row = 0; row < tileHeight; row += 1) {
      const sourceOffset = ((y + row) * width + x) * 4
      bytes.set(raw.subarray(sourceOffset, sourceOffset + tileWidth * 4), row * tileWidth * 4)
    }
    tiles.push({ x, y, width: tileWidth, height: tileHeight, data: bytes })
    payloadBytes += bytes.byteLength
  }
  const encodedBytes = SPARSE_TILE_HEADER_BYTES + tiles.length * SPARSE_TILE_ENTRY_BYTES + payloadBytes
  if (encodedBytes >= raw.byteLength) return { data: raw, encoding: 'raw' }
  const data = new Uint8Array(encodedBytes)
  const view = new DataView(data.buffer)
  view.setUint32(0, SPARSE_TILE_MAGIC, true)
  view.setUint16(4, SPARSE_TILE_SIZE, true)
  view.setUint8(6, format === 'rgba' ? 1 : 2)
  view.setUint32(8, width, true)
  view.setUint32(12, height, true)
  view.setUint32(16, tiles.length, true)
  view.setUint32(20, payloadBytes, true)
  let entryOffset = SPARSE_TILE_HEADER_BYTES
  let dataOffset = SPARSE_TILE_HEADER_BYTES + tiles.length * SPARSE_TILE_ENTRY_BYTES
  for (const tile of tiles) {
    view.setUint32(entryOffset, tile.x, true)
    view.setUint32(entryOffset + 4, tile.y, true)
    view.setUint16(entryOffset + 8, tile.width, true)
    view.setUint16(entryOffset + 10, tile.height, true)
    view.setUint32(entryOffset + 12, dataOffset, true)
    data.set(tile.data, dataOffset)
    entryOffset += SPARSE_TILE_ENTRY_BYTES
    dataOffset += tile.data.byteLength
  }
  return { data, encoding: 'sparse-tiles-v1' }
}

const encodeRuntimeRasterData = (runtime: RuntimeRasterTiles): EncodedRasterData => {
  const tileColumns = Math.ceil(runtime.width / runtime.tileSize)
  const slots = Array.from(runtime.tileOffsets.entries()).filter((entry) => entry[1] !== 0)
  const entriesEnd = SPARSE_TILE_HEADER_BYTES + slots.length * SPARSE_TILE_ENTRY_BYTES
  const data = new Uint8Array(entriesEnd + runtime.data.byteLength)
  const view = new DataView(data.buffer)
  view.setUint32(0, SPARSE_TILE_MAGIC, true)
  view.setUint16(4, runtime.tileSize, true)
  view.setUint8(6, runtime.format === 'rgba' ? 1 : 2)
  view.setUint32(8, runtime.width, true)
  view.setUint32(12, runtime.height, true)
  view.setUint32(16, slots.length, true)
  view.setUint32(20, runtime.data.byteLength, true)
  let payloadOffset = entriesEnd
  for (let index = 0; index < slots.length; index += 1) {
    const [slot, encodedOffset] = slots[index]
    const tileX = slot % tileColumns
    const tileY = Math.floor(slot / tileColumns)
    const x = tileX * runtime.tileSize
    const y = tileY * runtime.tileSize
    const entryOffset = SPARSE_TILE_HEADER_BYTES + index * SPARSE_TILE_ENTRY_BYTES
    view.setUint32(entryOffset, x, true)
    view.setUint32(entryOffset + 4, y, true)
    const tileWidth = Math.min(runtime.tileSize, runtime.width - x)
    const tileHeight = Math.min(runtime.tileSize, runtime.height - y)
    const tileBytes = tileWidth * tileHeight * 4
    view.setUint16(entryOffset + 8, tileWidth, true)
    view.setUint16(entryOffset + 10, tileHeight, true)
    view.setUint32(entryOffset + 12, payloadOffset, true)
    data.set(runtime.data.subarray(encodedOffset - 1, encodedOffset - 1 + tileBytes), payloadOffset)
    payloadOffset += tileBytes
  }
  return { data, encoding: 'sparse-tiles-v1' }
}

const decodeSparseRasterData = (data: Uint8Array, format: RasterFormat, width: number, height: number): DecodedRasterData | null => {
  if (data.byteLength < SPARSE_TILE_HEADER_BYTES) return null
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  if (view.getUint32(0, true) !== SPARSE_TILE_MAGIC || view.getUint16(4, true) !== SPARSE_TILE_SIZE) return null
  if (view.getUint8(6) !== (format === 'rgba' ? 1 : 2) || view.getUint32(8, true) !== width || view.getUint32(12, true) !== height) return null
  const tileCount = view.getUint32(16, true)
  const payloadBytes = view.getUint32(20, true)
  const entriesEnd = SPARSE_TILE_HEADER_BYTES + tileCount * SPARSE_TILE_ENTRY_BYTES
  const outputByteLength = width * height * 4
  const tileColumns = Math.ceil(width / SPARSE_TILE_SIZE)
  const tileRows = Math.ceil(height / SPARSE_TILE_SIZE)
  if (!Number.isSafeInteger(entriesEnd) || entriesEnd > data.byteLength || payloadBytes !== data.byteLength - entriesEnd) return null
  if (!Number.isSafeInteger(outputByteLength) || outputByteLength < 0 || tileCount > tileColumns * tileRows) return null
  const tileOffsets = new Int32Array(tileColumns * tileRows)
  let expectedDataOffset = entriesEnd
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let index = 0; index < tileCount; index += 1) {
    const entryOffset = SPARSE_TILE_HEADER_BYTES + index * SPARSE_TILE_ENTRY_BYTES
    const x = view.getUint32(entryOffset, true)
    const y = view.getUint32(entryOffset + 4, true)
    const tileWidth = view.getUint16(entryOffset + 8, true)
    const tileHeight = view.getUint16(entryOffset + 10, true)
    const dataOffset = view.getUint32(entryOffset + 12, true)
    if (!tileWidth || !tileHeight || x >= width || y >= height || x % SPARSE_TILE_SIZE !== 0 || y % SPARSE_TILE_SIZE !== 0 || dataOffset !== expectedDataOffset) return null
    if (tileWidth !== Math.min(SPARSE_TILE_SIZE, width - x) || tileHeight !== Math.min(SPARSE_TILE_SIZE, height - y)) return null
    const slot = (y / SPARSE_TILE_SIZE) * tileColumns + x / SPARSE_TILE_SIZE
    if (tileOffsets[slot] !== 0) return null
    const tileBytes = tileWidth * tileHeight * 4
    if (dataOffset + tileBytes > data.byteLength) return null
    tileOffsets[slot] = dataOffset - entriesEnd + 1
    expectedDataOffset += tileBytes
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x + tileWidth - 1)
    maxY = Math.max(maxY, y + tileHeight - 1)
  }
  if (expectedDataOffset !== data.byteLength) return null
  const runtimeRaster: RuntimeRasterTiles = {
    kind: 'sparse-tiles-v1',
    format,
    width,
    height,
    tileSize: SPARSE_TILE_SIZE,
    data: data.slice(entriesEnd),
    tileOffsets,
    visibleBounds: maxX < minX || maxY < minY ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
  }
  return {
    pixels: format === 'rgba' ? new Uint8ClampedArray(4) : new Uint32Array(1),
    width,
    height,
    storageOffsetX: 0,
    storageOffsetY: 0,
    runtimeRaster
  }
}

const PROJECT_PREVIEW_MAX_DIMENSION = 512
const LARGE_PROJECT_STORAGE_PIXELS = 32 * 1024 * 1024

type DecodedRasterSurface = RasterLayer | NonNullable<NonNullable<SpriteDocument['animation']>['cels'][number]['surface']>

export const compactProjectRasterStorage = (document: SpriteDocument, minimumStoredPixels = LARGE_PROJECT_STORAGE_PIXELS): void => {
  const surfaces: DecodedRasterSurface[] = [
    ...document.layers,
    ...(document.animation?.cels.flatMap((cel) => cel.surface ? [cel.surface] : []) ?? [])
  ]
  const uniquePixels = new Set(surfaces.map((surface) => surface.pixels))
  const storedPixels = [...uniquePixels].reduce((total, pixels) => total + (pixels instanceof Uint8ClampedArray ? pixels.length / 4 : pixels.length), 0)
  if (storedPixels < minimumStoredPixels) return

  const opaquePaletteIds = new Set(document.palette.filter((entry) => entry.color.a > 0).map((entry) => entry.id))
  const layers = new Set<RasterLayer>(document.layers)
  const surfacesByPixels = new Map<DecodedRasterSurface['pixels'], DecodedRasterSurface[]>()
  for (const surface of surfaces) {
    const entries = surfacesByPixels.get(surface.pixels) ?? []
    entries.push(surface)
    surfacesByPixels.set(surface.pixels, entries)
  }

  for (const entries of surfacesByPixels.values()) {
    const source = entries[0]
    if (entries.some((surface) => surface.format !== source.format || surface.width !== source.width || surface.height !== source.height)) continue
    let minX = source.width
    let minY = source.height
    let maxX = -1
    let maxY = -1
    for (let y = 0; y < source.height; y += 1) {
      let left = 0
      let right = source.width - 1
      if (source.format === 'rgba') {
        const rowOffset = y * source.width * 4
        while (left <= right && source.pixels[rowOffset + left * 4 + 3] === 0) left += 1
        while (right >= left && source.pixels[rowOffset + right * 4 + 3] === 0) right -= 1
      } else {
        const rowOffset = y * source.width
        while (left <= right && !opaquePaletteIds.has(source.pixels[rowOffset + left])) left += 1
        while (right >= left && !opaquePaletteIds.has(source.pixels[rowOffset + right])) right -= 1
      }
      if (right < left) continue
      minX = Math.min(minX, left)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, right)
      maxY = y
    }

    const empty = maxX < minX || maxY < minY
    const width = empty ? 1 : maxX - minX + 1
    const height = empty ? 1 : maxY - minY + 1
    if (!empty && width * height > source.width * source.height * 0.9) continue
    const pixels = source.format === 'rgba'
      ? new Uint8ClampedArray(width * height * 4)
      : new Uint32Array(width * height)
    if (!empty) {
      for (let y = 0; y < height; y += 1) {
        if (source.format === 'rgba' && pixels instanceof Uint8ClampedArray) {
          const start = ((minY + y) * source.width + minX) * 4
          pixels.set(source.pixels.subarray(start, start + width * 4), y * width * 4)
        } else if (source.format === 'indexed' && pixels instanceof Uint32Array) {
          const start = (minY + y) * source.width + minX
          pixels.set(source.pixels.subarray(start, start + width), y * width)
        }
      }
    }
    for (const surface of entries) {
      const layerStorageOrigin = layers.has(surface as RasterLayer) ? getLayerStorageOrigin(surface as RasterLayer) : null
      surface.width = width
      surface.height = height
      if (!empty) {
        surface.offsetX += minX
        surface.offsetY += minY
        if ('storageOriginX' in surface) surface.storageOriginX = (surface.storageOriginX ?? 0) + minX
        if ('storageOriginY' in surface) surface.storageOriginY = (surface.storageOriginY ?? 0) + minY
        if (layerStorageOrigin) setLayerStorageOrigin(surface as RasterLayer, { x: layerStorageOrigin.x + minX, y: layerStorageOrigin.y + minY })
      }
      if (surface.format === 'rgba' && pixels instanceof Uint8ClampedArray) surface.pixels = pixels
      if (surface.format === 'indexed' && pixels instanceof Uint32Array) surface.pixels = pixels
    }
  }
}

export const encodeProjectPreview = (document: SpriteDocument): Uint8Array => {
  if (document.width <= PROJECT_PREVIEW_MAX_DIMENSION && document.height <= PROJECT_PREVIEW_MAX_DIMENSION) {
    return encodePng(compositeDocument(document), document.width, document.height).bytes
  }
  const scale = Math.min(PROJECT_PREVIEW_MAX_DIMENSION / document.width, PROJECT_PREVIEW_MAX_DIMENSION / document.height)
  const width = Math.max(1, Math.round(document.width * scale))
  const height = Math.max(1, Math.round(document.height * scale))
  const pixels = new Uint8ClampedArray(width * height * 4)
  const sample = createNormalCompositePointSampler(document) ?? createCompositePointSampler(document)
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const sourceX = Math.min(document.width - 1, Math.floor((x + 0.5) * document.width / width))
    const sourceY = Math.min(document.height - 1, Math.floor((y + 0.5) * document.height / height))
    const color = sample(sourceX, sourceY)
    const offset = (y * width + x) * 4
    pixels[offset] = color.r
    pixels[offset + 1] = color.g
    pixels[offset + 2] = color.b
    pixels[offset + 3] = color.a
  }
  return encodePng(pixels, width, height).bytes
}

const blendModeSet = new Set<string>(BLEND_MODES)
const normalizeBlendMode = (value: unknown): BlendMode => typeof value === 'string' && blendModeSet.has(value) ? value as BlendMode : 'normal'

const normalizeLayerGroups = (source: unknown): LayerGroup[] => {
  if (!Array.isArray(source)) return []
  const groups: LayerGroup[] = []
  const seen = new Set<string>()
  for (const value of source) {
    if (!value || typeof value !== 'object') continue
    const candidate = value as Partial<LayerGroup>
    if (typeof candidate.id !== 'string' || !candidate.id || seen.has(candidate.id)) continue
    seen.add(candidate.id)
    const layerStyles = normalizeLayerStyles(candidate.layerStyles)
    groups.push({
      id: candidate.id,
      name: typeof candidate.name === 'string' && candidate.name ? candidate.name : tr('core.document.group'),
      ...(Number.isFinite(candidate.panelOrder) ? { panelOrder: Number(candidate.panelOrder) } : {}),
      ...(normalizeDisplayColor(candidate.displayColor) ? { displayColor: normalizeDisplayColor(candidate.displayColor)! } : {}),
      ...(typeof candidate.description === 'string' && candidate.description ? { description: candidate.description } : {}),
      ...(candidate.parentGroupId === undefined ? {} : { parentGroupId: typeof candidate.parentGroupId === 'string' ? candidate.parentGroupId : null }),
      visible: candidate.visible !== false,
      locked: candidate.locked === true,
      opacity: Number.isFinite(candidate.opacity) ? Math.max(0, Math.min(1, Number(candidate.opacity))) : 1,
      blendMode: normalizeBlendMode(candidate.blendMode),
      ...(candidate.clippingMask === true ? { clippingMask: true } : {}),
      ...(layerStyles ? { layerStyles } : {}),
      ...(candidate.cumulativeBlend === true ? { cumulativeBlend: true } : {})
    })
  }
  const groupById = new Map(groups.map((group) => [group.id, group]))
  const originalParents = new Map(groups.map((group) => [group.id, group.parentGroupId]))
  for (const group of groups) {
    const originalParent = group.parentGroupId
    if (!originalParent) continue
    if (!groupById.has(originalParent) || originalParent === group.id) {
      group.parentGroupId = null
      continue
    }
    const visited = new Set([group.id])
    let parentId: string | null | undefined = originalParent
    while (parentId) {
      if (visited.has(parentId)) {
        group.parentGroupId = null
        break
      }
      visited.add(parentId)
      parentId = originalParents.get(parentId)
    }
  }
  return groups
}

const normalizeDisplayColor = (value: unknown): RgbaColor | null => {
  if (!value || typeof value !== 'object') return null
  const color = value as Partial<RgbaColor>
  if (![color.r, color.g, color.b, color.a].every((channel) => typeof channel === 'number' && Number.isFinite(channel))) return null
  return { r: Math.max(0, Math.min(255, Math.round(color.r!))), g: Math.max(0, Math.min(255, Math.round(color.g!))), b: Math.max(0, Math.min(255, Math.round(color.b!))), a: Math.max(0, Math.min(255, Math.round(color.a!))) }
}

const normalizeManifestFreeTileSources = (value: unknown): FreeTileSourceLayer[] => {
  if (!Array.isArray(value)) return []
  const ids = new Set<string>()
  const tilesetIds = new Set<string>()
  const sources: FreeTileSourceLayer[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') return []
    const source = entry as Partial<FreeTileSourceLayer>
    if (typeof source.id !== 'string' || !source.id || ids.has(source.id)
      || typeof source.tilesetId !== 'string' || !source.tilesetId || tilesetIds.has(source.tilesetId)) return []
    ids.add(source.id)
    tilesetIds.add(source.tilesetId)
    const displayColor = normalizeDisplayColor(source.displayColor)
    sources.push({
      id: source.id,
      name: typeof source.name === 'string' && source.name ? source.name : tr('core.document.layer'),
      tilesetId: source.tilesetId,
      ...(typeof source.description === 'string' && source.description ? { description: source.description } : {}),
      ...(displayColor ? { displayColor } : {}),
      visible: source.visible !== false,
      locked: source.locked === true,
      opacity: Number.isFinite(source.opacity) ? Math.max(0, Math.min(1, Number(source.opacity))) : 1,
      blendMode: normalizeBlendMode(source.blendMode),
      offsetX: Number.isSafeInteger(source.offsetX) ? source.offsetX! : 0,
      offsetY: Number.isSafeInteger(source.offsetY) ? source.offsetY! : 0
    })
  }
  return sources
}

const normalizeManifestAnimation = (value: unknown): ManifestAnimation => {
  const normalized = normalizeAnimationTimeline(value)
  const frameIds = new Set(normalized.frames.map((frame) => frame.id))
  const rawCels = value && typeof value === 'object' && Array.isArray((value as { cels?: unknown }).cels)
    ? (value as { cels: unknown[] }).cels
    : []
  return {
    frames: normalized.frames,
    activeFrameId: normalized.activeFrameId,
    loop: normalized.loop,
    loopSections: (normalized.loopSections ?? []).map((section) => ({ ...section })),
    cels: normalized.cels.map((cel) => {
      const raw = rawCels.find((candidate) => candidate && typeof candidate === 'object' && (candidate as { id?: unknown }).id === cel.id) as Partial<ManifestCel> | undefined
      const { mask: _runtimeMask, surface: _runtimeSurface, tilemap: _runtimeTilemap, freeTiles: _runtimeFreeTiles, ...normalizedCel } = cel
      return { ...normalizedCel, ...(Number.isFinite(raw?.opacity) ? { opacity: Math.max(0, Math.min(1, Number(raw!.opacity))) } : {}), ...(raw?.format === 'rgba' || raw?.format === 'indexed' ? { format: raw.format } : {}), ...(Number.isSafeInteger(raw?.width) ? { width: raw!.width } : {}), ...(Number.isSafeInteger(raw?.height) ? { height: raw!.height } : {}), ...(Number.isFinite(raw?.offsetX) ? { offsetX: Math.trunc(raw!.offsetX!) } : {}), ...(Number.isFinite(raw?.offsetY) ? { offsetY: Math.trunc(raw!.offsetY!) } : {}), ...(typeof raw?.dataFile === 'string' ? { dataFile: raw.dataFile } : {}), ...(raw?.dataEncoding === 'raw' || raw?.dataEncoding === 'sparse-tiles-v1' ? { dataEncoding: raw.dataEncoding } : {}), ...(raw?.mask ? { mask: raw.mask } : {}), ...(raw?.text && typeof raw.text === 'object' ? { text: normalizeTextCelData(raw.text) } : {}), ...(raw?.tilemap && typeof raw.tilemap === 'object' ? { tilemap: raw.tilemap } : {}), ...(raw?.freeTiles && typeof raw.freeTiles === 'object' ? { freeTiles: raw.freeTiles } : {}) }
    }),
    layerMasks: value && typeof value === 'object' && Array.isArray((value as { layerMasks?: unknown }).layerMasks)
      ? (value as { layerMasks: unknown[] }).layerMasks.flatMap((item) => {
          if (!item || typeof item !== 'object') return []
          const candidate = item as Partial<ManifestLayerMask>
          return typeof candidate.layerId === 'string' && candidate.layerId && typeof candidate.frameId === 'string' && frameIds.has(candidate.frameId) && candidate.mask
            ? [{ layerId: candidate.layerId, frameId: candidate.frameId, mask: candidate.mask }]
            : []
        })
      : [],
    groupMasks: value && typeof value === 'object' && Array.isArray((value as { groupMasks?: unknown }).groupMasks)
      ? (value as { groupMasks: unknown[] }).groupMasks.flatMap((item) => {
          if (!item || typeof item !== 'object') return []
          const candidate = item as Partial<ManifestGroupMask>
          return typeof candidate.groupId === 'string' && candidate.groupId && typeof candidate.frameId === 'string' && frameIds.has(candidate.frameId) && candidate.mask
            ? [{ groupId: candidate.groupId, frameId: candidate.frameId, mask: candidate.mask }]
            : []
        })
      : []
  }
}

const manifestTilemapFromData = (tilemap: TilemapCelData): ManifestTilemapCelData => ({
  tileWidth: tilemap.tileWidth,
  tileHeight: tilemap.tileHeight,
  columns: tilemap.columns,
  rows: tilemap.rows,
  cells: tilemap.cells.flatMap((cell, index) => cell ? [{ index, ...cell }] : [])
})

const manifestFreeTilesFromData = (freeTiles: FreeTileCelData): ManifestFreeTileCelData => ({
  instances: freeTiles.instances.map((instance) => ({ ...instance }))
})

export interface ProjectEncodeOptions {
  /** Recovery snapshots do not need a gallery preview and can skip its full-canvas composite. */
  includePreview?: boolean
  /** Lower compression trades disk space for a substantially shorter main-thread encode. */
  compressionLevel?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
  /** Reports completion of archive preparation and sequential file compression. */
  onProgress?: (value: number) => void
}

interface ProjectArchiveResource {
  key: string
  path: string
  revision: number | null
  byteLength?: number
  raster?: { width: number; height: number; offsetX: number; offsetY: number; dataEncoding: RasterDataEncoding; byteLength?: number }
}

interface ProjectArchiveBuild {
  files: Record<string, Uint8Array>
  resources: ProjectArchiveResource[]
}

export interface ProjectArchiveReuseEntry {
  path: string
  crc32: number
  byteLength: number
  encoding?: RasterDataEncoding
  width?: number
  height?: number
}

interface ProjectSaveBaseline {
  sourcePath: string
  schemaVersion: number
  resources: Map<string, { path: string; crc32: number; revision: number | null; byteLength?: number; raster?: ProjectArchiveResource['raster'] }>
}

interface ProjectSaveBaselineCandidate {
  resources: Array<ProjectArchiveResource & { crc32: number }>
}

export interface EncodedProjectSave {
  data: Uint8Array
  sourcePath: string | null
  reusableEntries: ProjectArchiveReuseEntry[]
  baseline: ProjectSaveBaselineCandidate
}

const projectSaveBaselines = new WeakMap<SpriteDocument, ProjectSaveBaseline>()

const rasterGeometryMatchesSurface = (raster: ProjectArchiveResource['raster'], surface: RasterLayer | AnimationCelSurface): boolean => Boolean(
  raster
  && raster.width === surface.width
  && raster.height === surface.height
  && raster.offsetX === surface.offsetX
  && raster.offsetY === surface.offsetY
)

const rasterMetadataMatches = (left: ProjectArchiveResource['raster'], right: ProjectArchiveResource['raster']): boolean => {
  if (!left || !right) return left === right
  return left.width === right.width
    && left.height === right.height
    && left.offsetX === right.offsetX
    && left.offsetY === right.offsetY
    && left.dataEncoding === right.dataEncoding
    && left.byteLength === right.byteLength
}

const tilesetRasterMetadata = (tileset: Tileset): NonNullable<ProjectArchiveResource['raster']> => ({
  width: tileset.columns * tileset.tileWidth,
  height: tileset.rows * tileset.tileHeight,
  offsetX: 0,
  offsetY: 0,
  dataEncoding: 'raw',
  byteLength: tileset.columns * tileset.rows * tileset.tileWidth * tileset.tileHeight * 4
})

const createProjectArchiveFiles = (
  document: SpriteDocument,
  options: ProjectEncodeOptions = {},
  baseline?: ProjectSaveBaseline,
  revisionOverrides?: ReadonlyMap<string, number | null>
): ProjectArchiveBuild => {
  syncActiveAnimationLayers(document)
  ensureFreeTileTilesetOwnership(document)
  const files: Record<string, Uint8Array> = {}
  const resources: ProjectArchiveResource[] = []
  const dataFileByPixels = new Map<object, { dataFile: string; dataEncoding: RasterDataEncoding; width: number; height: number; byteLength: number }>()
  const rasterStorageByFile = new Map<string, { storage: object; dataEncoding: RasterDataEncoding; width: number; height: number }>()
  const canClaimRasterFile = (dataFile: string, storage: object, raster: { dataEncoding: RasterDataEncoding; width: number; height: number }): boolean => {
    const claimed = rasterStorageByFile.get(dataFile)
    return !claimed || (claimed.storage === storage && claimed.dataEncoding === raster.dataEncoding && claimed.width === raster.width && claimed.height === raster.height)
  }
  const claimRasterFile = (dataFile: string, storage: object, raster: { dataEncoding: RasterDataEncoding; width: number; height: number }): void => {
    rasterStorageByFile.set(dataFile, { storage, dataEncoding: raster.dataEncoding, width: raster.width, height: raster.height })
  }
  const revisionFor = (key: string, resource: object): number | null => revisionOverrides?.get(key) ?? getRasterContentRevision(resource)
  const encodePixels = (key: string, preferredFile: string, surface: RasterLayer | AnimationCelSurface): { dataFile: string; dataEncoding: RasterDataEncoding; width: number; height: number; offsetX: number; offsetY: number; byteLength: number } => {
    const storage = rasterStorageIdentity(surface)
    const existing = dataFileByPixels.get(storage)
    const revision = revisionFor(key, storage)
    if (existing) {
      const result = { ...existing, offsetX: surface.offsetX, offsetY: surface.offsetY }
      resources.push({ key, path: existing.dataFile, revision, byteLength: existing.byteLength, raster: { width: result.width, height: result.height, offsetX: result.offsetX, offsetY: result.offsetY, dataEncoding: result.dataEncoding, byteLength: existing.byteLength } })
      return result
    }
    const previous = baseline?.resources.get(key)
    if (baseline?.schemaVersion === PROJECT_SCHEMA_VERSION && previous?.raster && previous.revision === revision && rasterGeometryMatchesSurface(previous.raster, surface) && canClaimRasterFile(previous.path, storage, previous.raster)) {
      const byteLength = previous.byteLength ?? previous.raster.byteLength
      if (byteLength !== undefined) {
        const result = { dataFile: previous.path, ...previous.raster, byteLength }
        resources.push({ key, path: previous.path, revision, byteLength, raster: { ...previous.raster, byteLength } })
        claimRasterFile(previous.path, storage, previous.raster)
        dataFileByPixels.set(storage, { dataFile: result.dataFile, dataEncoding: result.dataEncoding, width: result.width, height: result.height, byteLength })
        return result
      }
    }
    const runtime = runtimeRasterForSurface(surface)
    const encoded = runtime && storage === runtime
      ? encodeRuntimeRasterData(runtime)
      : encodeSparseRasterData(surface.pixels, surface.format, surface.width, surface.height)
    const dataFile = encoded.encoding === 'sparse-tiles-v1' ? `${preferredFile}.tiles` : preferredFile
    files[dataFile] = encoded.data
    const raster = { width: surface.width, height: surface.height, offsetX: surface.offsetX, offsetY: surface.offsetY, dataEncoding: encoded.encoding, byteLength: encoded.data.byteLength }
    resources.push({ key, path: dataFile, revision, byteLength: encoded.data.byteLength, raster })
    claimRasterFile(dataFile, storage, raster)
    const result = { dataFile, ...raster }
    dataFileByPixels.set(storage, { dataFile: result.dataFile, dataEncoding: result.dataEncoding, width: result.width, height: result.height, byteLength: result.byteLength })
    return result
  }
  const encodeMask = (key: string, mask: LayerMask): ManifestMask => {
    const dataFile = `masks/${mask.id}.rgba`
    files[dataFile] = toU8(mask.pixels)
    resources.push({ key, path: dataFile, revision: revisionFor(key, mask.pixels), byteLength: mask.pixels.byteLength })
    return { id: mask.id, ...(mask.linkedMaskId ? { linkedMaskId: mask.linkedMaskId } : {}), ...(mask.locked ? { locked: true } : {}), ...(mask.autoLinkAnimationCels ? { autoLinkAnimationCels: true } : {}), width: mask.width, height: mask.height, offsetX: mask.offsetX, offsetY: mask.offsetY, dataFile }
  }
  const layers: ManifestLayer[] = document.layers.map((layer) => {
    const encoded = encodePixels(`layer:${layer.id}`, `layers/${layer.id}.${layer.format === 'rgba' ? 'rgba' : 'idx32'}`, layer)
    return {
      id: layer.id,
      name: layer.name,
      ...(layer.linkedContentId ? { linkedContentId: layer.linkedContentId } : {}),
      ...(layer.autoLinkAnimationCels === true ? { autoLinkAnimationCels: true } : {}),
      ...(layer.displayColor ? { displayColor: layer.displayColor } : {}),
      ...(layer.description ? { description: layer.description } : {}),
      ...(layer.kind === 'text' || layer.kind === 'tilemap' || layer.kind === 'free-tile' ? { kind: layer.kind } : {}),
      ...(layer.kind === 'tilemap' && layer.tilemapTilesetId ? { tilemapTilesetId: layer.tilemapTilesetId } : {}),
      ...(layer.kind === 'free-tile' && layer.freeTileSetId ? { freeTileSetId: layer.freeTileSetId } : {}),
      ...(layer.kind === 'free-tile' && layer.freeTileSources ? { freeTileSources: layer.freeTileSources.map((source) => ({ ...source, displayColor: source.displayColor ? { ...source.displayColor } : undefined })) } : {}),
      visible: layer.visible,
      locked: layer.locked,
      opacity: layer.opacity,
      blendMode: layer.blendMode,
      ...(layer.clippingMask === true ? { clippingMask: true } : {}),
      ...(layer.layerStyles ? { layerStyles: cloneLayerStyles(layer.layerStyles) } : {}),
      ...(layer.background ? { background: { ...layer.background } } : {}),
      groupId: layer.groupId ?? null,
      width: encoded.width,
      height: encoded.height,
      offsetX: encoded.offsetX,
      offsetY: encoded.offsetY,
      dataFile: encoded.dataFile,
      dataEncoding: encoded.dataEncoding
    }
  })
  const groups: LayerGroup[] = document.groups.map((group) => ({ ...group, layerStyles: cloneLayerStyles(group.layerStyles), displayColor: group.displayColor ? { ...group.displayColor } : undefined }))
  const customBrushes: ManifestProjectBrush[] = (document.customBrushes ?? []).map((brush) => {
    const dataFile = `brushes/${brush.id}.gray`
    files[dataFile] = brush.coverage
    const colorsFile = brush.colors && brush.colors.length === brush.width * brush.height ? `brushes/${brush.id}.rgba` : undefined
    if (colorsFile) files[colorsFile] = toU8(brush.colors!)
    return { id: brush.id, name: brush.name, width: brush.width, height: brush.height, dataFile, colorsFile, sourceX: brush.sourceX, sourceY: brush.sourceY }
  })
  const tilesets: ManifestTileset[] = (document.tilesets ?? []).map((tileset) => {
    const dataFile = `tilesets/${tileset.id}.rgba`
    const raster = tilesetRasterMetadata(tileset)
    const byteLength = raster.byteLength
    if (!Number.isSafeInteger(raster.width) || !Number.isSafeInteger(raster.height)
      || typeof byteLength !== 'number' || !Number.isSafeInteger(byteLength) || byteLength > MAX_TILESET_PIXELS * 4
      || tileset.pixels.byteLength !== byteLength) {
      throw new Error(tr('core.project.layerCorrupt', { name: tileset.name || tileset.id }))
    }
    files[dataFile] = toU8(tileset.pixels)
    resources.push({ key: `tileset:${tileset.id}`, path: dataFile, revision: revisionFor(`tileset:${tileset.id}`, tileset.pixels), raster })
    return {
      id: tileset.id,
      name: tileset.name,
      tileWidth: tileset.tileWidth,
      tileHeight: tileset.tileHeight,
      columns: tileset.columns,
      rows: tileset.rows,
      tileIds: [...tileset.tileIds],
      tileSlots: compactTilesetTileSlots(tileset.tileIds, tileset.tileSlots),
      dataFile
    }
  })
  const timeline = ensureAnimationDocument(document)
  const animation: ManifestAnimation = {
    frames: timeline.frames.map((frame) => ({ ...frame })),
    activeFrameId: timeline.activeFrameId,
    loop: timeline.loop,
    loopSections: (timeline.loopSections ?? []).map((section) => ({ ...section })),
    layerMasks: (timeline.layerMasks ?? []).map((entry) => ({ layerId: entry.layerId, frameId: entry.frameId, mask: encodeMask(`layer-mask:${entry.layerId}:${entry.frameId}`, entry.mask) })),
    groupMasks: (timeline.groupMasks ?? []).map((entry) => ({ groupId: entry.groupId, frameId: entry.frameId, mask: encodeMask(`group-mask:${entry.groupId}:${entry.frameId}`, entry.mask) })),
    cels: timeline.cels.flatMap((cel) => {
      if (!cel.surface) return []
      const encoded = cel.linkedCelId ? undefined : encodePixels(`cel:${cel.id}`, `cels/${cel.id}.${cel.surface.format === 'rgba' ? 'rgba' : 'idx32'}`, cel.surface)
      return [{
        id: cel.id,
        layerId: cel.layerId,
        frameId: cel.frameId,
        ...(cel.linkedCelId ? { linkedCelId: cel.linkedCelId } : {}),
        ...(Number.isFinite(cel.zIndex) && cel.zIndex !== 0 ? { zIndex: Math.max(-999, Math.min(999, Math.trunc(cel.zIndex!))) } : {}),
        ...(Number.isFinite(cel.opacity) ? { opacity: cel.opacity } : {}),
        ...(encoded ? {
          format: cel.surface.format,
          width: encoded.width,
          height: encoded.height,
          offsetX: encoded.offsetX,
          offsetY: encoded.offsetY,
          dataFile: encoded.dataFile,
          dataEncoding: encoded.dataEncoding
        } : {}),
        ...(cel.text ? { text: normalizeTextCelData(cel.text) } : {}),
        ...(cel.tilemap && !cel.linkedCelId ? { tilemap: manifestTilemapFromData(cel.tilemap) } : {}),
        ...(cel.freeTiles && !cel.linkedCelId ? { freeTiles: manifestFreeTilesFromData(cel.freeTiles) } : {})
      }]
    })
  }
  const timelapseSettings = normalizeTimelapseSettings(document.timelapse, document.timelapse?.snapshots ?? [])
  const timelapse: ManifestTimelapse = {
    enabled: timelapseSettings.enabled,
    quality: timelapseSettings.quality,
    fps: timelapseSettings.fps,
    speed: timelapseSettings.speed,
    mode: timelapseSettings.mode,
    snapshots: timelapseSettings.snapshots.map((snapshot) => {
      const dataFile = `timelapse/${snapshot.id}.png`
      files[dataFile] = snapshot.data
      resources.push({ key: `timelapse:${snapshot.id}`, path: dataFile, revision: null })
      return { id: snapshot.id, capturedAt: snapshot.capturedAt, elapsedMs: snapshot.elapsedMs, width: snapshot.width, height: snapshot.height, dataFile }
    })
  }
  const { schemaVersion: _schemaVersion, layers: _layers, groups: _groups, palette: _palette, customBrushes: _customBrushes, tilesets: _tilesets, animation: _animation, timelapse: _timelapse, filePath: _filePath, sourceFilePath: _sourceFilePath, dirty: _dirty, ...serializable } = document
  const manifest: ProjectManifest = {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    app: 'MoonSprite',
    document: {
      ...serializable,
      schemaVersion: PROJECT_SCHEMA_VERSION,
      layers,
      groups,
      palette: document.palette.map((entry) => ({ ...entry, color: { ...entry.color } })),
      paletteColumns: normalizePaletteColumns(document.paletteColumns),
      paletteSlots: normalizePaletteSlots(document.palette.map((entry) => entry.id), document.paletteOrder, document.paletteSlots, normalizePaletteColumns(document.paletteColumns)),
      customBrushes,
      tilesets,
      animation,
      timelapse,
      slices: normalizeDocumentSlices(document.slices, document.width, document.height)
    }
  }
  files['manifest.json'] = strToU8(JSON.stringify(manifest))
  if (options.includePreview !== false) files['preview.png'] = encodeProjectPreview(document)
  return { files, resources }
}

const createProjectZipEntries = (files: Record<string, Uint8Array>): Zippable => {
  const entries: Zippable = {}
  for (const [path, data] of Object.entries(files)) {
    // Timelapse frames are already PNG-compressed. Deflating hundreds of them
    // again adds save latency with negligible size reduction.
    entries[path] = /^timelapse\/.*\.png$/i.test(path) ? [data, { level: 0 }] : data
  }
  return entries
}

export function encodeProject(document: SpriteDocument, options: ProjectEncodeOptions = {}): Uint8Array {
  const { files } = createProjectArchiveFiles(document, options)
  return zipSync(createProjectZipEntries(files), { level: options.compressionLevel ?? 6 })
}

interface SerializedProjectSaveBaseline {
  sourcePath: string
  schemaVersion: number
  resources: Array<[string, { path: string; crc32: number; revision: number | null; byteLength?: number; raster?: ProjectArchiveResource['raster'] }]>
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

interface ProjectEncodeWorkerResponse {
  id: number
  result?: ProjectEncodeWorkerResult
  error?: string
}

let projectEncodeWorker: Worker | null = null
let projectEncodeSequence = 0
const pendingProjectEncodes = new Map<number, { resolve: (result: ProjectEncodeWorkerResult) => void; reject: (error: Error) => void; diagnostic: RuntimeDiagnosticOperation | null }>()

const resetProjectEncodeWorker = (error: Error): void => {
  projectEncodeWorker?.terminate()
  projectEncodeWorker = null
  for (const request of pendingProjectEncodes.values()) {
    request.diagnostic?.finish('error', { message: error.message })
    request.reject(error)
  }
  pendingProjectEncodes.clear()
}

const ensureProjectEncodeWorker = (): Worker => {
  if (projectEncodeWorker) return projectEncodeWorker
  const worker = new Worker(new URL('../workers/project-encode.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (event: MessageEvent<ProjectEncodeWorkerResponse>) => {
    const request = pendingProjectEncodes.get(event.data.id)
    if (!request) return
    pendingProjectEncodes.delete(event.data.id)
    if (event.data.result) {
      request.diagnostic?.finish('ok', { outputBytes: event.data.result.data.byteLength })
      request.resolve(event.data.result)
    } else {
      const error = new Error(event.data.error || 'Project encode failed')
      request.diagnostic?.finish('error', { message: error.message })
      request.reject(error)
    }
  }
  worker.onerror = (event) => resetProjectEncodeWorker(new Error(event.message || 'Project encode worker failed'))
  projectEncodeWorker = worker
  return worker
}

const encodeProjectInWorker = (payload: ProjectEncodeWorkerPayload): Promise<ProjectEncodeWorkerResult> => {
  if (typeof Worker === 'undefined') return Promise.resolve().then(() => encodeProjectWorkerPayload(payload))
  return new Promise((resolve, reject) => {
    const id = ++projectEncodeSequence
    const diagnostic = runtimeDiagnosticsActive()
      ? beginRuntimeDiagnosticOperation('project.encode.worker', {
          width: payload.document.width,
          height: payload.document.height,
          layers: payload.document.layers.length,
          frames: payload.document.animation?.frames.length ?? 1,
          incremental: payload.incremental
        }, 5_000)
      : null
    pendingProjectEncodes.set(id, { resolve, reject, diagnostic })
    try {
      const postStartedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
      ensureProjectEncodeWorker().postMessage({ id, payload })
      diagnostic?.mark('post-message', { durationMs: Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - postStartedAt) })
    } catch (error) {
      pendingProjectEncodes.delete(id)
      const failure = error instanceof Error ? error : new Error(String(error))
      diagnostic?.finish('error', { message: failure.message })
      reject(failure)
    }
  })
}

export function encodeProjectAsync(document: SpriteDocument, options: ProjectEncodeOptions = {}): Promise<Uint8Array> {
  options.onProgress?.(0)
  options.onProgress?.(0.05)
  return encodeProjectInWorker(createProjectEncodeWorkerPayload(document, options, false)).then((result) => {
    options.onProgress?.(1)
    return result.data
  })
}

const readZipEntryMetadata = (data: Uint8Array): Map<string, { crc32: number; byteLength: number }> => {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  let end = data.byteLength - 22
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end -= 1
  if (end < 0) throw new Error(tr('core.project.unzip'))
  const commentLength = view.getUint16(end + 20, true)
  if (end + 22 + commentLength !== data.byteLength) throw new Error(tr('core.project.unzip'))
  const entryCount = view.getUint16(end + 10, true)
  const centralDirectorySize = view.getUint32(end + 12, true)
  let offset = view.getUint32(end + 16, true)
  if (offset > end || centralDirectorySize > end - offset) throw new Error(tr('core.project.unzip'))
  const centralDirectoryEnd = offset + centralDirectorySize
  const decoder = new TextDecoder()
  const entries = new Map<string, { crc32: number; byteLength: number }>()
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > data.byteLength || view.getUint32(offset, true) !== 0x02014b50) throw new Error(tr('core.project.unzip'))
    const nameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    const nameEnd = offset + 46 + nameLength
    const nextOffset = nameEnd + extraLength + commentLength
    if (nameEnd > data.byteLength || nextOffset > centralDirectoryEnd) throw new Error(tr('core.project.unzip'))
    const name = decoder.decode(data.subarray(offset + 46, nameEnd))
    if (!name || entries.has(name)) throw new Error(tr('core.project.unzip'))
    const compressedLength = view.getUint32(offset + 20, true)
    const localOffset = view.getUint32(offset + 42, true)
    if (compressedLength === 0xffffffff || localOffset === 0xffffffff || localOffset + 30 > data.byteLength || view.getUint32(localOffset, true) !== 0x04034b50) throw new Error(tr('core.project.unzip'))
    const localNameLength = view.getUint16(localOffset + 26, true)
    const localExtraLength = view.getUint16(localOffset + 28, true)
    const dataStart = localOffset + 30 + localNameLength + localExtraLength
    if (dataStart > data.byteLength || compressedLength > data.byteLength - dataStart) throw new Error(tr('core.project.unzip'))
    entries.set(name, { crc32: view.getUint32(offset + 16, true), byteLength: view.getUint32(offset + 24, true) })
    offset = nextOffset
  }
  if (offset !== centralDirectoryEnd) throw new Error(tr('core.project.unzip'))
  return entries
}

const readZipEntryCrcs = (data: Uint8Array): Map<string, number> => new Map(
  Array.from(readZipEntryMetadata(data), ([name, metadata]) => [name, metadata.crc32])
)

const captureProjectResourceRevisions = (document: SpriteDocument): Array<[string, number | null]> => {
  const revisions: Array<[string, number | null]> = []
  for (const layer of document.layers) revisions.push([`layer:${layer.id}`, getRasterContentRevision(rasterStorageIdentity(layer))])
  for (const tileset of document.tilesets ?? []) revisions.push([`tileset:${tileset.id}`, getRasterContentRevision(tileset.pixels)])
  const timeline = ensureAnimationDocument(document)
  for (const cel of timeline.cels) {
    if (cel.surface) revisions.push([`cel:${cel.id}`, getRasterContentRevision(rasterStorageIdentity(cel.surface))])
  }
  for (const entry of timeline.layerMasks ?? []) revisions.push([`layer-mask:${entry.layerId}:${entry.frameId}`, getRasterContentRevision(entry.mask.pixels)])
  for (const entry of timeline.groupMasks ?? []) revisions.push([`group-mask:${entry.groupId}:${entry.frameId}`, getRasterContentRevision(entry.mask.pixels)])
  for (const snapshot of document.timelapse?.snapshots ?? []) revisions.push([`timelapse:${snapshot.id}`, null])
  return revisions
}

const createProjectEncodeWorkerPayload = (document: SpriteDocument, options: ProjectEncodeOptions, incremental: boolean): ProjectEncodeWorkerPayload => {
  const baseline = incremental ? projectSaveBaselines.get(document) : undefined
  return {
    document,
    includePreview: options.includePreview !== false,
    compressionLevel: options.compressionLevel ?? 6,
    incremental,
    baseline: baseline ? { sourcePath: baseline.sourcePath, schemaVersion: baseline.schemaVersion, resources: [...baseline.resources.entries()] } : undefined,
    resourceRevisions: captureProjectResourceRevisions(document),
    layerStorageOrigins: document.layers.map((layer) => [layer.id, getLayerStorageOrigin(layer)])
  }
}

export function encodeProjectWorkerPayload(payload: ProjectEncodeWorkerPayload): ProjectEncodeWorkerResult {
  for (const [layerId, origin] of payload.layerStorageOrigins) {
    const layer = payload.document.layers.find((candidate) => candidate.id === layerId)
    if (layer) setLayerStorageOrigin(layer, origin)
  }
  const baseline: ProjectSaveBaseline | undefined = payload.baseline
    ? { sourcePath: payload.baseline.sourcePath, schemaVersion: payload.baseline.schemaVersion, resources: new Map(payload.baseline.resources) }
    : undefined
  const { files, resources } = createProjectArchiveFiles(
    payload.document,
    { includePreview: payload.includePreview, compressionLevel: payload.compressionLevel },
    baseline,
    new Map(payload.resourceRevisions)
  )
  if (!payload.incremental) {
    return {
      data: zipSync(createProjectZipEntries(files), { level: payload.compressionLevel }),
      sourcePath: null,
      reusableEntries: [],
      baseline: { resources: [] }
    }
  }
  const reusableEntries: ProjectArchiveReuseEntry[] = []
  const reusableCrcs = new Map<string, number>()
  const patchFiles = { ...files }
  if (baseline) for (const resource of resources) {
    const previous = baseline.resources.get(resource.key)
    const byteLength = previous?.byteLength ?? previous?.raster?.byteLength
    if (!previous || byteLength === undefined || previous.path !== resource.path || previous.revision !== resource.revision || !rasterMetadataMatches(previous.raster, resource.raster)) continue
    delete patchFiles[resource.path]
    if (!reusableCrcs.has(resource.path)) reusableEntries.push({
      path: resource.path,
      crc32: previous.crc32,
      byteLength,
      ...(resource.raster ? { encoding: resource.raster.dataEncoding, width: resource.raster.width, height: resource.raster.height } : {})
    })
    reusableCrcs.set(resource.path, previous.crc32)
  }
  if (baseline && reusableEntries.length > 0) patchFiles['.moonsprite-save-plan.json'] = strToU8(JSON.stringify({ version: 2, entries: reusableEntries }))
  const data = zipSync(createProjectZipEntries(patchFiles), { level: payload.compressionLevel })
  const patchCrcs = readZipEntryCrcs(data)
  const baselineResources = resources.flatMap((resource) => {
    const crc32 = reusableCrcs.get(resource.path) ?? patchCrcs.get(resource.path)
    return crc32 === undefined ? [] : [{ ...resource, crc32 }]
  })
  return {
    data,
    sourcePath: baseline?.sourcePath ?? null,
    reusableEntries,
    baseline: { resources: baselineResources }
  }
}

const projectResourcesFromManifest = (document: SpriteDocument, manifest: ProjectManifest, entryMetadata?: ReadonlyMap<string, { crc32: number; byteLength: number }>): ProjectArchiveResource[] => {
  const candidates = new Map<string, ProjectArchiveResource>()
  const add = (key: string, path: string | null | undefined, revision: number | null, raster?: ProjectArchiveResource['raster']): void => {
    if (!path) return
    const byteLength = entryMetadata?.get(path)?.byteLength
    candidates.set(key, {
      key,
      path,
      revision,
      ...(byteLength === undefined ? {} : { byteLength }),
      ...(raster ? { raster: byteLength === undefined ? raster : { ...raster, byteLength } } : {})
    })
  }
  const rasterFromMetadata = (metadata: Pick<ManifestLayer | ManifestCel, 'width' | 'height' | 'offsetX' | 'offsetY' | 'dataEncoding'> | undefined, fallbackWidth?: number, fallbackHeight?: number): ProjectArchiveResource['raster'] | undefined => {
    const width = Number.isSafeInteger(metadata?.width) && metadata!.width! > 0 ? metadata!.width! : fallbackWidth
    const height = Number.isSafeInteger(metadata?.height) && metadata!.height! > 0 ? metadata!.height! : fallbackHeight
    const dataEncoding = rasterDataEncoding(metadata?.dataEncoding)
    if (!width || !height || !dataEncoding) return undefined
    return {
      width,
      height,
      offsetX: Number.isFinite(metadata?.offsetX) ? Math.trunc(metadata!.offsetX!) : 0,
      offsetY: Number.isFinite(metadata?.offsetY) ? Math.trunc(metadata!.offsetY!) : 0,
      dataEncoding
    }
  }
  const layerMetadata = new Map(manifest.document.layers.map((layer) => [layer.id, layer]))
  const activeCelFiles = directActiveCelDataFiles(manifest)
  for (const layer of document.layers) {
    const metadata = layerMetadata.get(layer.id)
    const activeCel = activeCelFiles.get(layer.id)
    const storage = rasterStorageIdentity(layer)
    add(
      `layer:${layer.id}`,
      activeCel?.dataFile ?? metadata?.dataFile,
      getRasterContentRevision(storage),
      activeCel ?? rasterFromMetadata(metadata, manifest.document.width, manifest.document.height)
    )
  }
  const tilesetMetadata = new Map((manifest.document.tilesets ?? []).map((tileset) => [tileset.id, tileset]))
  for (const tileset of document.tilesets ?? []) {
    const dataFile = tilesetMetadata.get(tileset.id)?.dataFile
    const raster = tilesetRasterMetadata(tileset)
    add(`tileset:${tileset.id}`, dataFile, getRasterContentRevision(tileset.pixels), {
      ...raster,
      ...(dataFile && entryMetadata?.get(dataFile) ? { byteLength: entryMetadata.get(dataFile)!.byteLength } : {})
    })
  }
  const timeline = ensureAnimationDocument(document)
  const celMetadata = new Map(manifest.document.animation.cels.map((cel) => [cel.id, cel]))
  for (const cel of timeline.cels) {
    const metadata = celMetadata.get(cel.id)
    if (cel.surface && metadata?.dataFile) {
      const storage = rasterStorageIdentity(cel.surface)
      add(`cel:${cel.id}`, metadata.dataFile, getRasterContentRevision(storage), rasterFromMetadata(metadata))
    }
  }
  const layerMaskMetadata = new Map((manifest.document.animation.layerMasks ?? []).map((entry) => [`${entry.layerId}\u0000${entry.frameId}`, entry]))
  for (const entry of timeline.layerMasks ?? []) add(`layer-mask:${entry.layerId}:${entry.frameId}`, layerMaskMetadata.get(`${entry.layerId}\u0000${entry.frameId}`)?.mask.dataFile, getRasterContentRevision(entry.mask.pixels))
  const groupMaskMetadata = new Map((manifest.document.animation.groupMasks ?? []).map((entry) => [`${entry.groupId}\u0000${entry.frameId}`, entry]))
  for (const entry of timeline.groupMasks ?? []) add(`group-mask:${entry.groupId}:${entry.frameId}`, groupMaskMetadata.get(`${entry.groupId}\u0000${entry.frameId}`)?.mask.dataFile, getRasterContentRevision(entry.mask.pixels))
  const snapshotMetadata = new Map((manifest.document.timelapse?.snapshots ?? []).map((snapshot) => [snapshot.id, snapshot]))
  for (const snapshot of document.timelapse?.snapshots ?? []) add(`timelapse:${snapshot.id}`, snapshotMetadata.get(snapshot.id)?.dataFile, null)
  return Array.from(candidates.values())
}

const manifestResourcePaths = (manifest: ProjectManifest): string[] => {
  const paths: string[] = []
  const add = (path: string | undefined): void => { if (path) paths.push(path) }
  for (const layer of manifest.document.layers) add(layer.dataFile)
  for (const brush of manifest.document.customBrushes ?? []) {
    add(brush.dataFile)
    add(brush.colorsFile)
  }
  for (const tileset of manifest.document.tilesets ?? []) add(tileset.dataFile)
  for (const cel of manifest.document.animation.cels) add(cel.dataFile)
  for (const entry of manifest.document.animation.layerMasks ?? []) add(entry.mask.dataFile)
  for (const entry of manifest.document.animation.groupMasks ?? []) add(entry.mask.dataFile)
  for (const snapshot of manifest.document.timelapse?.snapshots ?? []) add(snapshot.dataFile)
  return paths
}

export function registerProjectSaveBaseline(document: SpriteDocument, sourcePath: string, archive: Uint8Array): boolean {
  let entryMetadata: Map<string, { crc32: number; byteLength: number }>
  let manifest: ProjectManifest
  let sourceSchemaVersion: number
  try {
    entryMetadata = readZipEntryMetadata(archive)
    const manifestFiles = unzipSync(archive, { filter: (file) => file.name === 'manifest.json' })
    const rawManifest = JSON.parse(strFromU8(manifestFiles['manifest.json'])) as { schemaVersion?: unknown }
    sourceSchemaVersion = Number(rawManifest.schemaVersion)
    manifest = readManifest(manifestFiles)
    if (manifestResourcePaths(manifest).some((path) => !entryMetadata.has(path))) throw new Error('Missing project resource')
  } catch {
    projectSaveBaselines.delete(document)
    return false
  }
  const resources = new Map<string, { path: string; crc32: number; revision: number | null; byteLength?: number; raster?: ProjectArchiveResource['raster'] }>()
  for (const resource of projectResourcesFromManifest(document, manifest, entryMetadata)) {
    const metadata = entryMetadata.get(resource.path)
    if (metadata !== undefined) resources.set(resource.key, { path: resource.path, crc32: metadata.crc32, revision: resource.revision, byteLength: metadata.byteLength, ...(resource.raster ? { raster: resource.raster } : {}) })
  }
  projectSaveBaselines.set(document, { sourcePath, schemaVersion: sourceSchemaVersion, resources })
  return true
}

export async function encodeProjectSaveAsync(document: SpriteDocument, options: ProjectEncodeOptions = {}): Promise<EncodedProjectSave> {
  options.onProgress?.(0)
  options.onProgress?.(0.05)
  const result = await encodeProjectInWorker(createProjectEncodeWorkerPayload(document, options, true))
  options.onProgress?.(1)
  return result
}

export function acceptProjectSaveBaseline(document: SpriteDocument, filePath: string, encoded: EncodedProjectSave): void {
  const resources = new Map<string, { path: string; crc32: number; revision: number | null; byteLength?: number; raster?: ProjectArchiveResource['raster'] }>()
  for (const resource of encoded.baseline.resources) resources.set(resource.key, { path: resource.path, crc32: resource.crc32, revision: resource.revision, ...(resource.byteLength === undefined ? {} : { byteLength: resource.byteLength }), ...(resource.raster ? { raster: resource.raster } : {}) })
  projectSaveBaselines.set(document, { sourcePath: filePath, schemaVersion: PROJECT_SCHEMA_VERSION, resources })
}

export function clearProjectSaveBaseline(document: SpriteDocument): void {
  projectSaveBaselines.delete(document)
}

export function migrateProjectManifest(input: unknown): ProjectManifest {
  if (!input || typeof input !== 'object') throw new Error(tr('core.project.invalidManifestFormat'))
  const candidate = input as { app?: unknown; schemaVersion?: unknown; document?: Record<string, unknown> }
  if (candidate.app !== 'MoonSprite' || !candidate.document) throw new Error(tr('core.project.unsupportedVersion'))
  const version = Number(candidate.schemaVersion)
  if (![1, 2, 3, LEGACY_PROJECT_SCHEMA_VERSION, SPARSE_RASTER_PROJECT_SCHEMA_VERSION, SLICES_PROJECT_SCHEMA_VERSION, EDITABLE_TEXT_PROJECT_SCHEMA_VERSION, STYLED_TEXT_PROJECT_SCHEMA_VERSION, TEXT_BOX_PROJECT_SCHEMA_VERSION, DOCUMENT_COLOR_MODE_PROJECT_SCHEMA_VERSION, LAYER_STYLES_PROJECT_SCHEMA_VERSION, BACKGROUND_LAYER_PROJECT_SCHEMA_VERSION, TILEMAP_PROJECT_SCHEMA_VERSION, FREE_TILE_PROJECT_SCHEMA_VERSION, FREE_TILE_SOURCE_PROJECT_SCHEMA_VERSION, LOOP_SECTIONS_PROJECT_SCHEMA_VERSION, LINKED_LAYERS_PROJECT_SCHEMA_VERSION, FREE_TILE_SET_PROJECT_SCHEMA_VERSION, PROJECT_SCHEMA_VERSION].includes(version) || candidate.document.schemaVersion !== candidate.schemaVersion) throw new Error(tr('core.project.unsupportedVersion'))
  if (version >= SPARSE_RASTER_PROJECT_SCHEMA_VERSION) {
    const layers = Array.isArray(candidate.document.layers) ? candidate.document.layers : []
    const animation = candidate.document.animation && typeof candidate.document.animation === 'object' ? candidate.document.animation as { cels?: unknown } : null
    const cels = Array.isArray(animation?.cels) ? animation.cels : []
    const hasUnknownEncoding = [...layers, ...cels].some((entry) => {
      if (!entry || typeof entry !== 'object') return false
      const encoding = (entry as { dataEncoding?: unknown }).dataEncoding
      return encoding !== undefined && encoding !== 'raw' && encoding !== 'sparse-tiles-v1'
    })
    if (hasUnknownEncoding) throw new Error(tr('core.project.unsupportedVersion'))
  }
  const animation = normalizeManifestAnimation(version === 1 ? createDefaultAnimationTimeline() : candidate.document.animation)
  if (version < LOOP_SECTIONS_PROJECT_SCHEMA_VERSION) animation.loopSections = []
  const legacy = version <= LEGACY_PROJECT_SCHEMA_VERSION
  const layers = Array.isArray(candidate.document.layers)
    ? candidate.document.layers.map((layer) => {
        if (!layer || typeof layer !== 'object') return layer
        const next: Record<string, unknown> = { ...(layer as Record<string, unknown>), ...(legacy ? { dataEncoding: 'raw' as const } : {}) }
        if (version < LINKED_LAYERS_PROJECT_SCHEMA_VERSION) delete next.linkedContentId
        const layerStyles = version >= LAYER_STYLES_PROJECT_SCHEMA_VERSION ? normalizeLayerStyles(next.layerStyles) : undefined
        if (layerStyles) next.layerStyles = layerStyles
        else delete next.layerStyles
        const background = version >= BACKGROUND_LAYER_PROJECT_SCHEMA_VERSION ? normalizeBackgroundLayerSettings(next.background) : undefined
        if (background) next.background = background
        else delete next.background
        if (version < FREE_TILE_PROJECT_SCHEMA_VERSION) {
          if (next.kind === 'free-tile') delete next.kind
          delete next.freeTileTilesetId
          delete next.freeTileSources
        } else if (version < FREE_TILE_SOURCE_PROJECT_SCHEMA_VERSION) {
          delete next.freeTileSources
        } else {
          delete next.freeTileTilesetId
        }
        if (next.kind === 'free-tile' && version < FREE_TILE_SET_PROJECT_SCHEMA_VERSION) next.freeTileSetId = createId('free-tile-set')
        return next as unknown as ManifestLayer
      })
    : candidate.document.layers
  const groups = Array.isArray(candidate.document.groups)
    ? candidate.document.groups.map((group) => {
        if (!group || typeof group !== 'object') return group
        const next: Record<string, unknown> = { ...(group as Record<string, unknown>) }
        const layerStyles = version >= LAYER_STYLES_PROJECT_SCHEMA_VERSION ? normalizeLayerStyles(next.layerStyles) : undefined
        if (layerStyles) next.layerStyles = layerStyles
        else delete next.layerStyles
        return next as unknown as LayerGroup
      })
    : candidate.document.groups
  const cels = animation.cels.map((cel) => {
    const next = legacy && cel.dataFile ? { ...cel, dataEncoding: 'raw' as const } : { ...cel }
    if (version < TILEMAP_PROJECT_SCHEMA_VERSION) delete next.tilemap
    if (version < FREE_TILE_PROJECT_SCHEMA_VERSION) delete next.freeTiles
    return next
  })
  const tilesets = version >= TILEMAP_PROJECT_SCHEMA_VERSION && Array.isArray(candidate.document.tilesets)
    ? candidate.document.tilesets as unknown as ManifestTileset[]
    : []
  return {
    ...(candidate as Omit<ProjectManifest, 'schemaVersion' | 'document'>),
    schemaVersion: PROJECT_SCHEMA_VERSION,
    sourceSchemaVersion: version,
    document: {
      ...(candidate.document as ProjectManifest['document']),
      schemaVersion: PROJECT_SCHEMA_VERSION,
      ...(layers ? { layers: layers as ManifestLayer[] } : {}),
      ...(groups ? { groups: groups as LayerGroup[] } : {}),
      tilesets,
      animation: { ...animation, cels },
      slices: normalizeDocumentSlices(candidate.document.slices, Number(candidate.document.width) || 1, Number(candidate.document.height) || 1)
    }
  }
}

function readManifest(files: Record<string, Uint8Array>): ProjectManifest {
  const manifestFile = files['manifest.json']
  if (!manifestFile) throw new Error(tr('core.project.missingManifest'))
  let manifest: ProjectManifest
  try {
    manifest = migrateProjectManifest(JSON.parse(strFromU8(manifestFile)))
  } catch {
    throw new Error(tr('core.project.manifestUnreadable'))
  }
  if (manifest.app !== 'MoonSprite' || manifest.schemaVersion !== PROJECT_SCHEMA_VERSION || manifest.document?.schemaVersion !== PROJECT_SCHEMA_VERSION) {
    throw new Error(tr('core.project.invalidVersion'))
  }
  return manifest
}

export function readProjectExpandedRasterBytes(input: Uint8Array): number | null {
  try {
    const directory = projectZipDirectory(input)
    const files = directory
      ? projectZipFiles(input, directory, new Set(['manifest.json'])) ?? unzipSync(input, { filter: (file) => file.name === 'manifest.json' })
      : unzipSync(input, { filter: (file) => file.name === 'manifest.json' })
    const source = readManifest(files).document
    const resources = new Map<string, number>()
    const add = (dataFile: unknown, width: unknown, height: unknown, bytesPerPixel = 4): void => {
      if (typeof dataFile !== 'string' || !dataFile || resources.has(dataFile)) return
      const resourceWidth = Number(width)
      const resourceHeight = Number(height)
      const bytes = resourceWidth * resourceHeight * bytesPerPixel
      if (!Number.isSafeInteger(resourceWidth) || !Number.isSafeInteger(resourceHeight) || resourceWidth < 1 || resourceHeight < 1 || !Number.isSafeInteger(bytes)) throw new Error('invalid raster size')
      resources.set(dataFile, bytes)
    }
    for (const layer of source.layers ?? []) add(layer.dataFile, layer.width ?? source.width, layer.height ?? source.height)
    for (const tileset of source.tilesets ?? []) {
      const width = tileset.columns * tileset.tileWidth
      const height = tileset.rows * tileset.tileHeight
      if (!Number.isSafeInteger(width * height) || width * height > MAX_TILESET_PIXELS) throw new Error('invalid tileset size')
      add(tileset.dataFile, width, height)
    }
    for (const cel of source.animation.cels ?? []) {
      if (cel.dataFile) add(cel.dataFile, cel.width, cel.height)
      if (cel.mask) add(cel.mask.dataFile, cel.mask.width, cel.mask.height)
    }
    for (const entry of source.animation.layerMasks ?? []) add(entry.mask.dataFile, entry.mask.width, entry.mask.height)
    for (const entry of source.animation.groupMasks ?? []) add(entry.mask.dataFile, entry.mask.width, entry.mask.height)
    let total = 0
    for (const bytes of resources.values()) {
      total += bytes
      if (!Number.isSafeInteger(total)) return null
    }
    return total
  } catch {
    return null
  }
}

interface RasterDataSource {
  dataFile: string
  dataEncoding: RasterDataEncoding
  width: number
  height: number
  offsetX: number
  offsetY: number
}

const rasterDataEncoding = (value: unknown): RasterDataEncoding | null => value === undefined || value === 'raw'
  ? 'raw'
  : value === 'sparse-tiles-v1' ? value : null

const directActiveCelDataFiles = (manifest: ProjectManifest): Map<string, RasterDataSource> => {
  const source = manifest.document
  if (source.animation.frames.length !== 1) return new Map()
  const documentRasterFormat: RasterFormat = source.colorMode === 'indexed' ? 'indexed' : 'rgba'
  const activeFrameId = source.animation.activeFrameId
  const activeCels = new Map(source.animation.cels
    .filter((cel) => cel.frameId === activeFrameId && typeof cel.dataFile === 'string' && cel.dataFile)
    .map((cel) => [cel.layerId, cel]))
  const dataFiles = new Map<string, RasterDataSource>()
  for (const layer of source.layers) {
    const cel = activeCels.get(layer.id)
    if (!cel || cel.format !== documentRasterFormat) continue
    const layerWidth = Number.isSafeInteger(layer.width) && layer.width! > 0 ? layer.width! : source.width
    const layerHeight = Number.isSafeInteger(layer.height) && layer.height! > 0 ? layer.height! : source.height
    if (cel.width !== layerWidth || cel.height !== layerHeight) continue
    if (Math.trunc(cel.offsetX ?? 0) !== Math.trunc(layer.offsetX ?? 0) || Math.trunc(cel.offsetY ?? 0) !== Math.trunc(layer.offsetY ?? 0)) continue
    const dataEncoding = rasterDataEncoding(cel.dataEncoding)
    if (!dataEncoding) continue
    dataFiles.set(layer.id, { dataFile: cel.dataFile!, dataEncoding, width: cel.width!, height: cel.height!, offsetX: Math.trunc(cel.offsetX ?? 0), offsetY: Math.trunc(cel.offsetY ?? 0) })
  }
  return dataFiles
}

const requiredProjectDataFiles = (manifest: ProjectManifest, activeCelFiles: ReadonlyMap<string, RasterDataSource>, storedTimelapseFiles: ReadonlyMap<string, Uint8Array> = new Map()): Set<string> => {
  const source = manifest.document
  const required = new Set<string>()
  for (const layer of source.layers) required.add(activeCelFiles.get(layer.id)?.dataFile ?? layer.dataFile)
  for (const brush of source.customBrushes ?? []) {
    required.add(brush.dataFile)
    if (brush.colorsFile) required.add(brush.colorsFile)
  }
  for (const tileset of source.tilesets ?? []) required.add(tileset.dataFile)
  for (const cel of source.animation.cels) {
    if (cel.dataFile) required.add(cel.dataFile)
    if (cel.mask?.dataFile) required.add(cel.mask.dataFile)
  }
  for (const entry of source.animation.layerMasks ?? []) required.add(entry.mask.dataFile)
  for (const entry of source.animation.groupMasks ?? []) required.add(entry.mask.dataFile)
  for (const snapshot of source.timelapse?.snapshots ?? []) if (!storedTimelapseFiles.has(snapshot.dataFile)) required.add(snapshot.dataFile)
  return required
}

interface ProjectZipEntry {
  compression: number
  flags: number
  compressedSize: number
  uncompressedSize: number
  localOffset: number
}

const projectZipDirectory = (data: Uint8Array): Map<string, ProjectZipEntry> | null => {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  let end = data.byteLength - 22
  const minimumOffset = Math.max(0, data.byteLength - 65_557)
  while (end >= minimumOffset && view.getUint32(end, true) !== 0x06054b50) end -= 1
  if (end < minimumOffset) return null
  const entryCount = view.getUint16(end + 10, true)
  let offset = view.getUint32(end + 16, true)
  if (entryCount === 0xffff || offset === 0xffffffff || offset >= data.byteLength) return null
  const decoder = new TextDecoder()
  const entries = new Map<string, ProjectZipEntry>()
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > data.byteLength || view.getUint32(offset, true) !== 0x02014b50) return null
    const flags = view.getUint16(offset + 8, true)
    const compression = view.getUint16(offset + 10, true)
    const compressedSize = view.getUint32(offset + 20, true)
    const uncompressedSize = view.getUint32(offset + 24, true)
    const nameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    const localOffset = view.getUint32(offset + 42, true)
    const nameStart = offset + 46
    const nameEnd = nameStart + nameLength
    if (nameEnd > data.byteLength || compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) return null
    const name = decoder.decode(data.subarray(nameStart, nameEnd))
    entries.set(name, { compression, flags, compressedSize, uncompressedSize, localOffset })
    offset = nameEnd + extraLength + commentLength
  }
  return entries
}

const projectZipEntryData = (data: Uint8Array, entry: ProjectZipEntry): Uint8Array | null => {
  if ((entry.flags & 1) !== 0) return null
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  if (entry.localOffset + 30 > data.byteLength || view.getUint32(entry.localOffset, true) !== 0x04034b50) return null
  const localNameLength = view.getUint16(entry.localOffset + 26, true)
  const localExtraLength = view.getUint16(entry.localOffset + 28, true)
  const dataStart = entry.localOffset + 30 + localNameLength + localExtraLength
  const dataEnd = dataStart + entry.compressedSize
  if (dataEnd > data.byteLength) return null
  const compressed = data.subarray(dataStart, dataEnd)
  if (entry.compression === 0 && entry.compressedSize === entry.uncompressedSize) return compressed
  if (entry.compression !== 8) return null
  const output = inflateSync(compressed)
  return output.byteLength === entry.uncompressedSize ? output : null
}

const projectZipFiles = (data: Uint8Array, directory: ReadonlyMap<string, ProjectZipEntry>, names: ReadonlySet<string>): Record<string, Uint8Array> | null => {
  const files: Record<string, Uint8Array> = {}
  for (const name of names) {
    const entry = directory.get(name)
    if (!entry) continue
    const bytes = projectZipEntryData(data, entry)
    if (!bytes) return null
    files[name] = bytes
  }
  return files
}

const storedTimelapseEntryViews = (data: Uint8Array, directory: ReadonlyMap<string, ProjectZipEntry>): Map<string, Uint8Array> => {
  const entries = new Map<string, Uint8Array>()
  for (const [name, entry] of directory) {
    if (!/^timelapse\/.*\.png$/i.test(name) || entry.compression !== 0 || entry.compressedSize !== entry.uncompressedSize) continue
    const bytes = projectZipEntryData(data, entry)
    if (bytes) entries.set(name, bytes)
  }
  return entries
}

export function readProjectGalleryMetadata(input: Uint8Array, options: ProjectGalleryReadOptions = {}): ProjectGalleryMetadata {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(input, { filter: (file) => file.name === 'manifest.json' || file.name === 'preview.png' })
  } catch {
    throw new Error(tr('core.project.galleryUnzip'))
  }
  const manifest = readManifest(files)
  const source = manifest.document
  if (!Number.isSafeInteger(source.width) || !Number.isSafeInteger(source.height) || source.width < 1 || source.height < 1) {
    throw new Error(tr('core.project.galleryCanvasSize'))
  }
  if (source.colorMode !== 'rgba' && source.colorMode !== 'indexed' && source.colorMode !== 'grayscale') throw new Error(tr('core.project.galleryColorMode'))
  const preview = files['preview.png']
  if (!preview?.byteLength) {
    if (!options.generateMissingPreview) throw new Error(tr('core.project.missingPreview'))
    const document = decodeProject(input)
    return {
      name: source.name || tr('core.document.untitled'),
      width: source.width,
      height: source.height,
      colorMode: source.colorMode,
      preview: encodeProjectPreview(document)
    }
  }
  return {
    name: source.name || tr('core.document.untitled'),
    width: source.width,
    height: source.height,
    colorMode: source.colorMode,
    preview: preview.slice()
  }
}

const decodeManifestTilesets = (metadata: readonly ManifestTileset[], files: Readonly<Record<string, Uint8Array>>): Tileset[] => {
  const ids = new Set<string>()
  return metadata.map((candidate) => {
    const id = typeof candidate?.id === 'string' ? candidate.id : ''
    const name = typeof candidate?.name === 'string' ? candidate.name : ''
    const tileWidth = Number(candidate?.tileWidth)
    const tileHeight = Number(candidate?.tileHeight)
    const columns = Number(candidate?.columns)
    const rows = Number(candidate?.rows)
    const tileCount = columns * rows
    const sheetPixels = columns * tileWidth * rows * tileHeight
    const tileIds = Array.isArray(candidate?.tileIds) ? candidate.tileIds : []
    const uniqueTileIds = new Set(tileIds)
    const tileSlots = candidate?.tileSlots === undefined ? [...tileIds] : candidate.tileSlots
    const slotTileIds = Array.isArray(tileSlots) ? tileSlots.filter((tileId): tileId is string => tileId !== null) : []
    if (!id || ids.has(id)
      || !Number.isSafeInteger(tileWidth) || tileWidth < 1 || tileWidth > MAX_TILE_SIZE
      || !Number.isSafeInteger(tileHeight) || tileHeight < 1 || tileHeight > MAX_TILE_SIZE
      || !Number.isSafeInteger(columns) || columns < 1
      || !Number.isSafeInteger(rows) || rows < 1
      || !Number.isSafeInteger(tileCount) || tileCount < 1
      || !Number.isSafeInteger(sheetPixels) || sheetPixels > MAX_TILESET_PIXELS
      || tileIds.length < 1 || tileIds.length > tileCount
      || uniqueTileIds.size !== tileIds.length
      || tileIds.some((tileId) => typeof tileId !== 'string' || !tileId)
      || !Array.isArray(tileSlots) || tileSlots.length < 1 || tileSlots.length > MAX_TILESET_LAYOUT_SLOTS
      || tileSlots.some((tileId) => tileId !== null && (typeof tileId !== 'string' || !tileId))
      || slotTileIds.length !== tileIds.length || new Set(slotTileIds).size !== slotTileIds.length
      || slotTileIds.some((tileId) => !uniqueTileIds.has(tileId))
      || typeof candidate.dataFile !== 'string' || !candidate.dataFile) {
      throw new Error(tr('core.project.layerCorrupt', { name: name || id || 'Tileset' }))
    }
    const bytes = files[candidate.dataFile]
    if (!bytes || bytes.byteLength !== sheetPixels * 4) throw new Error(tr('core.project.layerCorrupt', { name: name || id }))
    ids.add(id)
    return {
      id,
      name: name.trim() || 'Tileset',
      tileWidth,
      tileHeight,
      columns,
      rows,
      tileIds: [...tileIds],
      tileSlots: [...tileSlots],
      pixels: new Uint8ClampedArray(bytes.slice().buffer)
    }
  })
}

const decodeManifestTilemap = (
  value: ManifestTilemapCelData,
  tilesets: ReadonlyMap<string, Tileset>,
  name: string
): TilemapCelData => {
  const tileWidth = Number(value?.tileWidth)
  const tileHeight = Number(value?.tileHeight)
  const columns = Number(value?.columns)
  const rows = Number(value?.rows)
  const count = columns * rows
  const surfacePixels = columns * tileWidth * rows * tileHeight
  if (!Number.isSafeInteger(tileWidth) || tileWidth < 1 || tileWidth > MAX_TILE_SIZE
    || !Number.isSafeInteger(tileHeight) || tileHeight < 1 || tileHeight > MAX_TILE_SIZE
    || !Number.isSafeInteger(columns) || columns < 1
    || !Number.isSafeInteger(rows) || rows < 1
    || !Number.isSafeInteger(count) || count > MAX_TILEMAP_CELLS
    || !Number.isSafeInteger(surfacePixels) || surfacePixels > MAX_TILEMAP_SURFACE_PIXELS
    || !Array.isArray(value?.cells)) throw new Error(tr('core.project.layerCorrupt', { name }))
  const cells: Array<TilemapCell | null> = Array.from({ length: count }, () => null)
  const indexes = new Set<number>()
  for (const entry of value.cells) {
    if (!entry || typeof entry !== 'object' || !Number.isSafeInteger(entry.index) || entry.index < 0 || entry.index >= count || indexes.has(entry.index)) {
      throw new Error(tr('core.project.layerCorrupt', { name }))
    }
    const normalized = normalizeTilemapCell(entry, tilesets)
    const tileset = normalized ? tilesets.get(normalized.tilesetId) : undefined
    if (!normalized || !tileset || tileset.tileWidth !== tileWidth || tileset.tileHeight !== tileHeight) {
      throw new Error(tr('core.project.layerCorrupt', { name }))
    }
    indexes.add(entry.index)
    cells[entry.index] = normalized
  }
  return { tileWidth, tileHeight, columns, rows, cells }
}

const decodeManifestFreeTiles = (
  value: ManifestFreeTileCelData,
  sources: FreeTileSourceCollection,
  name: string
): FreeTileCelData => {
  if (!Array.isArray(value?.instances) || value.instances.length > MAX_FREE_TILE_INSTANCES) throw new Error(tr('core.project.layerCorrupt', { name }))
  if (Array.isArray(sources) && value.instances.some((instance) => !instance || typeof instance !== 'object' || typeof instance.sourceId !== 'string' || !instance.sourceId || typeof instance.tileId === 'string')) {
    throw new Error(tr('core.project.layerCorrupt', { name }))
  }
  const normalized = normalizeFreeTileCelData(value, sources, true)
  if (!normalized) throw new Error(tr('core.project.layerCorrupt', { name }))
  return normalized
}

export function decodeProject(input: Uint8Array, onProgress?: (value: number) => void): SpriteDocument {
  const reportProgress = (value: number): void => onProgress?.(Math.max(0, Math.min(1, value)))
  reportProgress(0)
  const directory = projectZipDirectory(input)
  let manifestFiles: Record<string, Uint8Array>
  try {
    manifestFiles = directory
      ? projectZipFiles(input, directory, new Set(['manifest.json'])) ?? unzipSync(input, { filter: (file) => file.name === 'manifest.json' })
      : unzipSync(input, { filter: (file) => file.name === 'manifest.json' })
  } catch {
    throw new Error(tr('core.project.unzip'))
  }
  reportProgress(0.12)
  const manifest = readManifest(manifestFiles)
  const activeCelFiles = directActiveCelDataFiles(manifest)
  const storedTimelapseFiles = directory ? storedTimelapseEntryViews(input, directory) : new Map<string, Uint8Array>()
  const requiredFiles = requiredProjectDataFiles(manifest, activeCelFiles, storedTimelapseFiles)
  let files: Record<string, Uint8Array>
  try {
    files = directory
      ? projectZipFiles(input, directory, requiredFiles) ?? unzipSync(input, { filter: (file) => requiredFiles.has(file.name) })
      : unzipSync(input, { filter: (file) => requiredFiles.has(file.name) })
  } catch {
    throw new Error(tr('core.project.unzip'))
  }
  reportProgress(0.45)
  const source = manifest.document
  if (!Number.isSafeInteger(source.width) || !Number.isSafeInteger(source.height) || source.width < 1 || source.height < 1) {
    throw new Error(tr('core.project.invalidCanvasSize'))
  }
  const mode = source.colorMode as ColorMode
  if (mode !== 'rgba' && mode !== 'indexed' && mode !== 'grayscale') throw new Error(tr('core.project.unknownColorMode'))
  const rasterFormat: RasterFormat = mode === 'indexed' ? 'indexed' : 'rgba'
  const rgbaPixelsByFile = new Map<string, Uint8ClampedArray>()
  const indexedPixelsByFile = new Map<string, Uint32Array>()
  const decodedRasterByKey = new Map<string, DecodedRasterData>()
  const decodePixels = (dataFile: string, dataEncoding: unknown, format: RasterFormat, width: number, height: number): DecodedRasterData => {
    const expectedBytes = width * height * 4
    const bytes = files[dataFile]
    const encoding = rasterDataEncoding(dataEncoding)
    if (!bytes || !encoding || !Number.isSafeInteger(expectedBytes) || expectedBytes < 0) throw new Error(tr('core.project.layerCorrupt', { name: dataFile }))
    const cacheKey = `${dataFile}\u0000${encoding}\u0000${format}\u0000${width}\u0000${height}`
    const cachedRaster = decodedRasterByKey.get(cacheKey)
    if (cachedRaster) return cachedRaster
    if (encoding === 'sparse-tiles-v1') {
      const decoded = decodeSparseRasterData(bytes, format, width, height)
      if (!decoded) throw new Error(tr('core.project.layerCorrupt', { name: dataFile }))
      decodedRasterByKey.set(cacheKey, decoded)
      return decoded
    }
    if (format === 'rgba') {
      const cached = rgbaPixelsByFile.get(cacheKey)
      if (cached) return { pixels: cached, width, height, storageOffsetX: 0, storageOffsetY: 0 }
      const pixels = bytes.byteLength === expectedBytes ? new Uint8ClampedArray(bytes.buffer, bytes.byteOffset, bytes.byteLength) : null
      if (!pixels) throw new Error(tr('core.project.layerCorrupt', { name: dataFile }))
      rgbaPixelsByFile.set(cacheKey, pixels)
      return { pixels, width, height, storageOffsetX: 0, storageOffsetY: 0 }
    }
    const cached = indexedPixelsByFile.get(cacheKey)
    if (cached) return { pixels: cached, width, height, storageOffsetX: 0, storageOffsetY: 0 }
    const pixels = bytes.byteLength === expectedBytes
      ? bytes.byteOffset % 4 === 0 ? new Uint32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4) : new Uint32Array(bytes.slice().buffer)
      : null
    if (!pixels) throw new Error(tr('core.project.layerCorrupt', { name: dataFile }))
    indexedPixelsByFile.set(cacheKey, pixels)
    return { pixels, width, height, storageOffsetX: 0, storageOffsetY: 0 }
  }
  const decodedMaskIds = new Set<string>()
  const decodeMask = (metadata: ManifestMask | undefined, ownerId: string, ownerKind: LayerMask['ownerKind'] = 'cel'): LayerMask | undefined => {
    if (!metadata) return undefined
    if (typeof metadata.id !== 'string' || !metadata.id || decodedMaskIds.has(metadata.id) || typeof metadata.dataFile !== 'string' || !metadata.dataFile) throw new Error(tr('core.project.layerMaskCorrupt'))
    const width = Number(metadata.width)
    const height = Number(metadata.height)
    const offsetX = Number(metadata.offsetX)
    const offsetY = Number(metadata.offsetY)
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || !Number.isFinite(offsetX) || !Number.isFinite(offsetY)) throw new Error(tr('core.project.layerMaskCorrupt'))
    const bytes = files[metadata.dataFile]
    if (!bytes || (bytes.byteLength !== width * height && bytes.byteLength !== width * height * 4)) throw new Error(tr('core.project.layerMaskCorrupt'))
    const maskPixels = new Uint8ClampedArray(width * height * 4)
    if (bytes.byteLength === width * height * 4) {
      maskPixels.set(bytes)
      for (let offset = 0; offset < maskPixels.length; offset += 4) {
        const alpha = maskPixels[offset + 3]
        if (alpha === 0) {
          maskPixels[offset] = 0
          maskPixels[offset + 1] = 0
          maskPixels[offset + 2] = 0
          continue
        }
        if (alpha !== 255 || maskPixels[offset] !== maskPixels[offset + 1] || maskPixels[offset] !== maskPixels[offset + 2]) throw new Error(tr('core.project.layerMaskCorrupt'))
      }
    } else {
      for (let index = 0; index < bytes.length; index += 1) {
        const value = bytes[index]
        maskPixels.set([value, value, value, 255], index * 4)
      }
    }
    decodedMaskIds.add(metadata.id)
    if (metadata.linkedMaskId !== undefined && metadata.linkedMaskId !== null && (typeof metadata.linkedMaskId !== 'string' || !metadata.linkedMaskId)) throw new Error(tr('core.project.layerMaskCorrupt'))
    return { id: metadata.id, name: tr(ownerKind === 'group' ? 'core.document.layerGroupMask' : 'core.document.layerMask'), description: '', visible: true, locked: metadata.locked === true, opacity: 1, blendMode: 'normal', width, height, offsetX: Math.trunc(offsetX), offsetY: Math.trunc(offsetY), format: 'rgba', pixels: maskPixels, ownerKind, ownerId, ...(metadata.linkedMaskId ? { linkedMaskId: metadata.linkedMaskId } : {}), ...(metadata.autoLinkAnimationCels === true ? { autoLinkAnimationCels: true } : {}) }
  }
  const totalItems = Math.max(1,
    source.layers.length
    + (source.customBrushes?.length ?? 0)
    + (source.tilesets?.length ?? 0)
    + source.animation.cels.length
    + (source.animation.layerMasks?.length ?? source.animation.cels.filter((cel) => cel.mask).length)
    + (source.animation.groupMasks?.length ?? 0)
    + (source.timelapse?.snapshots?.length ?? 0)
  )
  let completedItems = 0
  const reportItem = (): void => {
    completedItems += 1
    reportProgress(0.45 + (completedItems / totalItems) * 0.48)
  }
  const tilesets = decodeManifestTilesets(Array.isArray(source.tilesets) ? source.tilesets : [], files)
  const tilesetsById = new Map(tilesets.map((tileset) => [tileset.id, tileset]))
  for (let index = 0; index < tilesets.length; index += 1) reportItem()
  const layers: RasterLayer[] = source.layers.map((metadata) => {
    const width = Number.isSafeInteger(metadata.width) && metadata.width! > 0 ? metadata.width! : source.width
    const height = Number.isSafeInteger(metadata.height) && metadata.height! > 0 ? metadata.height! : source.height
    const activeCelSource = activeCelFiles.get(metadata.id)
    const decoded = decodePixels(activeCelSource?.dataFile ?? metadata.dataFile, activeCelSource?.dataEncoding ?? metadata.dataEncoding, rasterFormat, width, height)
    const layerStyles = normalizeLayerStyles(metadata.layerStyles)
    const background = normalizeBackgroundLayerSettings(metadata.background)
    if (metadata.linkedContentId !== undefined && (typeof metadata.linkedContentId !== 'string' || !metadata.linkedContentId.trim() || metadata.kind || background)) {
      throw new Error(tr('core.project.layerCorrupt', { name: metadata.name }))
    }
    const common = {
      id: metadata.id,
      name: metadata.name,
      ...(typeof metadata.linkedContentId === 'string' ? { linkedContentId: metadata.linkedContentId } : {}),
      ...(metadata.autoLinkAnimationCels === true ? { autoLinkAnimationCels: true } : {}),
      description: typeof metadata.description === 'string' ? metadata.description : '',
      visible: metadata.visible !== false,
      locked: metadata.locked === true,
      opacity: Number.isFinite(metadata.opacity) ? Math.max(0, Math.min(1, Number(metadata.opacity))) : 1,
      blendMode: normalizeBlendMode(metadata.blendMode),
      ...(metadata.clippingMask === true ? { clippingMask: true } : {}),
      ...(layerStyles ? { layerStyles } : {}),
      ...(background ? { background } : {}),
      ...(metadata.kind === 'text' || metadata.kind === 'tilemap' || metadata.kind === 'free-tile' ? { kind: metadata.kind } : {}),
      ...(metadata.kind === 'tilemap' && typeof metadata.tilemapTilesetId === 'string' ? { tilemapTilesetId: metadata.tilemapTilesetId } : {}),
      ...(metadata.kind === 'free-tile' && typeof metadata.freeTileTilesetId === 'string' ? { freeTileTilesetId: metadata.freeTileTilesetId } : {}),
      ...(metadata.kind === 'free-tile' && typeof metadata.freeTileSetId === 'string' ? { freeTileSetId: metadata.freeTileSetId } : {}),
      ...(metadata.kind === 'free-tile' && Array.isArray(metadata.freeTileSources) ? { freeTileSources: normalizeManifestFreeTileSources(metadata.freeTileSources) } : {}),
      groupId: typeof metadata.groupId === 'string' ? metadata.groupId : null,
      ...(normalizeDisplayColor(metadata.displayColor) ? { displayColor: normalizeDisplayColor(metadata.displayColor)! } : {}),
      width: decoded.width,
      height: decoded.height,
      offsetX: (Number.isFinite(metadata.offsetX) ? Math.trunc(metadata.offsetX!) : 0) + decoded.storageOffsetX,
      offsetY: (Number.isFinite(metadata.offsetY) ? Math.trunc(metadata.offsetY!) : 0) + decoded.storageOffsetY
    }
    const layer = rasterFormat === 'rgba'
      ? { ...common, format: 'rgba' as const, pixels: decoded.pixels as Uint8ClampedArray }
      : { ...common, format: 'indexed' as const, pixels: decoded.pixels as Uint32Array }
    if (decoded.runtimeRaster) installRuntimeRaster(layer, decoded.runtimeRaster)
    if (decoded.storageOffsetX !== 0 || decoded.storageOffsetY !== 0) setLayerStorageOrigin(layer, { x: decoded.storageOffsetX, y: decoded.storageOffsetY })
    reportItem()
    return layer
  })
  if (layers.length === 0) throw new Error(tr('core.project.noLayers'))
  const tilemapTilesetIds = new Set(layers.flatMap((layer) => layer.kind === 'tilemap' && layer.tilemapTilesetId ? [layer.tilemapTilesetId] : []))
  const legacyFreeTileOwnerIds = new Set<string>()
  const freeTileTilesetOwners = new Map<string, string>()
  const freeTileSourceOwners = new Map<string, string>()
  const freeTileSourcesBySet = new Map<string, FreeTileSourceLayer[]>()
  const legacyFreeTiles = (manifest.sourceSchemaVersion ?? PROJECT_SCHEMA_VERSION) < FREE_TILE_SOURCE_PROJECT_SCHEMA_VERSION
  const sameFreeTileSource = (left: FreeTileSourceLayer, right: FreeTileSourceLayer): boolean =>
    left.id === right.id
    && left.name === right.name
    && left.tilesetId === right.tilesetId
    && left.description === right.description
    && left.visible === right.visible
    && left.locked === right.locked
    && left.opacity === right.opacity
    && left.blendMode === right.blendMode
    && left.offsetX === right.offsetX
    && left.offsetY === right.offsetY
    && left.displayColor?.r === right.displayColor?.r
    && left.displayColor?.g === right.displayColor?.g
    && left.displayColor?.b === right.displayColor?.b
    && left.displayColor?.a === right.displayColor?.a
  for (const layer of layers) {
    if (layer.kind !== 'free-tile') continue
    if (legacyFreeTiles) {
      if (!layer.freeTileTilesetId
        || tilemapTilesetIds.has(layer.freeTileTilesetId)
        || legacyFreeTileOwnerIds.has(layer.freeTileTilesetId)
        || !tilesetsById.has(layer.freeTileTilesetId)) throw new Error(tr('core.project.layerCorrupt', { name: layer.name }))
      legacyFreeTileOwnerIds.add(layer.freeTileTilesetId)
      continue
    }
    const setId = layer.freeTileSetId?.trim()
    if (!setId || setId !== layer.freeTileSetId || !layer.freeTileSources?.length) throw new Error(tr('core.project.layerCorrupt', { name: layer.name }))
    const canonicalSources = freeTileSourcesBySet.get(setId)
    if (canonicalSources && (canonicalSources.length !== layer.freeTileSources.length
      || canonicalSources.some((source, index) => !sameFreeTileSource(source, layer.freeTileSources![index])))) {
      throw new Error(tr('core.project.layerCorrupt', { name: layer.name }))
    }
    if (!canonicalSources) freeTileSourcesBySet.set(setId, layer.freeTileSources)
    const localSourceIds = new Set<string>()
    const localTilesetIds = new Set<string>()
    for (const source of layer.freeTileSources) {
      const sourceOwner = freeTileSourceOwners.get(source.id)
      const tilesetOwner = freeTileTilesetOwners.get(source.tilesetId)
      if (localSourceIds.has(source.id) || localTilesetIds.has(source.tilesetId)
        || (sourceOwner && sourceOwner !== setId)
        || (tilesetOwner && tilesetOwner !== setId)) throw new Error(tr('core.project.layerCorrupt', { name: layer.name }))
      const tileset = tilesetsById.get(source.tilesetId)
      if (!tileset || tileset.tileIds.length !== 1 || tileset.columns !== 1 || tileset.rows !== 1
        || tilemapTilesetIds.has(source.tilesetId)) throw new Error(tr('core.project.layerCorrupt', { name: layer.name }))
      localSourceIds.add(source.id)
      localTilesetIds.add(source.tilesetId)
      freeTileSourceOwners.set(source.id, setId)
      freeTileTilesetOwners.set(source.tilesetId, setId)
    }
  }
  const sourceGroups = Array.isArray(source.groups) ? source.groups : []
  const groups = normalizeLayerGroups(sourceGroups)
  const groupIds = new Set(groups.map((group) => group.id))
  for (const layer of layers) if (layer.groupId && !groupIds.has(layer.groupId)) layer.groupId = null
  const activeLayerId = layers.some((layer) => layer.id === source.activeLayerId) ? source.activeLayerId : layers[0].id
  const customBrushes: ProjectBrush[] = []
  for (const metadata of Array.isArray(source.customBrushes) ? source.customBrushes : []) {
    if (typeof metadata?.id !== 'string' || typeof metadata?.name !== 'string') continue
    if (!Number.isSafeInteger(metadata.width) || !Number.isSafeInteger(metadata.height) || metadata.width < 1 || metadata.height < 1 || metadata.width * metadata.height > 16 * 1024 * 1024) throw new Error(tr('core.project.brushInvalidSize', { name: metadata.name }))
    const bytes = files[metadata.dataFile]
    if (!bytes || bytes.byteLength !== metadata.width * metadata.height) throw new Error(tr('core.project.brushCorrupt', { name: metadata.name }))
    let colors: Uint32Array | undefined
    if (metadata.colorsFile) {
      const colorBytes = files[metadata.colorsFile]
      if (colorBytes && colorBytes.byteLength === metadata.width * metadata.height * 4) colors = new Uint32Array(colorBytes.slice().buffer)
    }
    customBrushes.push({ id: metadata.id, name: metadata.name, width: metadata.width, height: metadata.height, coverage: bytes.slice(), colors, sourceX: metadata.sourceX, sourceY: metadata.sourceY })
    reportItem()
  }
  const outlineSettings = normalizeOutlineSettings(source.outlineSettings)
  const displaySettings = normalizeProjectDisplaySettings(source.displaySettings)
  const statistics = normalizeProjectStatistics(source.statistics)
  const manifestTimelapse = source.timelapse && typeof source.timelapse === 'object' ? source.timelapse : undefined
  const timelapseSnapshots = (Array.isArray(manifestTimelapse?.snapshots) ? manifestTimelapse.snapshots : [])
    .flatMap((snapshot) => {
      if (!snapshot || typeof snapshot.id !== 'string' || typeof snapshot.dataFile !== 'string') return []
      const width = Number(snapshot.width)
      const height = Number(snapshot.height)
      const data = storedTimelapseFiles.get(snapshot.dataFile) ?? files[snapshot.dataFile]
      if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || !data?.byteLength) return []
      reportItem()
      return [{ id: snapshot.id, capturedAt: Math.max(0, Math.trunc(Number(snapshot.capturedAt) || 0)), elapsedMs: Math.max(0, Math.trunc(Number(snapshot.elapsedMs) || 0)), width, height, data }]
    })
  const timelapse = normalizeTimelapseSettings(manifestTimelapse, timelapseSnapshots)
  const animation = normalizeAnimationTimeline(source.animation)
  const manifestCels = Array.isArray(source.animation?.cels) ? source.animation.cels : []
  const layersById = new Map(layers.map((layer) => [layer.id, layer]))
  animation.cels = animation.cels.flatMap((cel) => {
    const metadata = manifestCels.find((candidate) => candidate.id === cel.id)
    if (!metadata) return []
    const layer = layersById.get(cel.layerId)
    if (!layer) return []
    const tilemap = metadata.tilemap ? decodeManifestTilemap(metadata.tilemap, tilesetsById, cel.id) : undefined
    const freeTileTileset = layer.kind === 'free-tile' && layer.freeTileTilesetId ? tilesetsById.get(layer.freeTileTilesetId) : undefined
    const freeTileSources = layer.kind === 'free-tile' ? freeTileSourceRefs(layer.freeTileSources, tilesets) : []
    const freeTileCollection: FreeTileSourceCollection | undefined = freeTileSources.length > 0 ? freeTileSources : freeTileTileset
    const freeTiles = metadata.freeTiles && freeTileCollection ? decodeManifestFreeTiles(metadata.freeTiles, freeTileCollection, cel.id) : undefined
    if (layer.kind === 'tilemap') {
      if (metadata.text || metadata.freeTiles || (!cel.linkedCelId && !tilemap)) throw new Error(tr('core.project.layerCorrupt', { name: cel.id }))
    } else if (layer.kind === 'free-tile') {
      if (metadata.text || metadata.tilemap || !freeTileCollection || (!cel.linkedCelId && !freeTiles)) throw new Error(tr('core.project.layerCorrupt', { name: cel.id }))
    } else if (tilemap || freeTiles || metadata.freeTiles) throw new Error(tr('core.project.layerCorrupt', { name: cel.id }))
    if (!metadata.dataFile) {
      reportItem()
      return cel.linkedCelId ? [{ ...cel, text: metadata.text ? normalizeTextCelData(metadata.text) : cel.text }] : []
    }
    if (metadata.format !== 'rgba' && metadata.format !== 'indexed') throw new Error(tr('core.project.layerCorrupt', { name: cel.id }))
    const width = Number(metadata.width)
    const height = Number(metadata.height)
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) return []
    const decoded = decodePixels(metadata.dataFile, metadata.dataEncoding, metadata.format, width, height)
    const surface = metadata.format === 'rgba'
      ? { format: 'rgba' as const, width: decoded.width, height: decoded.height, offsetX: Math.trunc(metadata.offsetX ?? 0) + decoded.storageOffsetX, offsetY: Math.trunc(metadata.offsetY ?? 0) + decoded.storageOffsetY, storageOriginX: decoded.storageOffsetX, storageOriginY: decoded.storageOffsetY, pixels: decoded.pixels as Uint8ClampedArray }
      : { format: 'indexed' as const, width: decoded.width, height: decoded.height, offsetX: Math.trunc(metadata.offsetX ?? 0) + decoded.storageOffsetX, offsetY: Math.trunc(metadata.offsetY ?? 0) + decoded.storageOffsetY, storageOriginX: decoded.storageOffsetX, storageOriginY: decoded.storageOffsetY, pixels: decoded.pixels as Uint32Array }
    if (decoded.runtimeRaster) installRuntimeRaster(surface, decoded.runtimeRaster)
    reportItem()
    return [{ ...cel, text: metadata.text ? normalizeTextCelData(metadata.text) : cel.text, ...(tilemap ? { tilemap } : {}), ...(freeTiles ? { freeTiles } : {}), surface }]
  })
  const manifestLayerMasks = Array.isArray(source.animation?.layerMasks) ? source.animation.layerMasks : []
  const decodedLayerMaskSlots = new Set<string>()
  animation.layerMasks = [...manifestLayerMasks, ...manifestCels.flatMap((cel) => cel.mask ? [{ layerId: cel.layerId, frameId: cel.frameId, mask: cel.mask }] : [])].flatMap((entry) => {
    if (!entry || typeof entry.layerId !== 'string' || !layersById.has(entry.layerId) || typeof entry.frameId !== 'string' || !animation.frames.some((frame) => frame.id === entry.frameId)) throw new Error(tr('core.project.layerMaskCorrupt'))
    const slot = `${entry.layerId}\u0000${entry.frameId}`
    if (decodedLayerMaskSlots.has(slot)) return []
    decodedLayerMaskSlots.add(slot)
    const mask = decodeMask(entry.mask, entry.layerId)
    reportItem()
    return mask ? [{ layerId: entry.layerId, frameId: entry.frameId, mask }] : []
  })
  const manifestGroupMasks = Array.isArray(source.animation?.groupMasks) ? source.animation.groupMasks : []
  const decodedGroupMaskSlots = new Set<string>()
  animation.groupMasks = manifestGroupMasks.flatMap((entry) => {
    if (!entry || typeof entry.groupId !== 'string' || !groupIds.has(entry.groupId) || typeof entry.frameId !== 'string' || !animation.frames.some((frame) => frame.id === entry.frameId)) throw new Error(tr('core.project.layerMaskCorrupt'))
    const slot = `${entry.groupId}\u0000${entry.frameId}`
    if (decodedGroupMaskSlots.has(slot)) throw new Error(tr('core.project.layerMaskCorrupt'))
    decodedGroupMaskSlots.add(slot)
    const mask = decodeMask(entry.mask, entry.groupId, 'group')
    reportItem()
    return mask ? [{ groupId: entry.groupId, frameId: entry.frameId, mask }] : []
  })
  const decodedMasks = [...(animation.layerMasks ?? []).map((entry) => entry.mask), ...(animation.groupMasks ?? []).map((entry) => entry.mask)]
  const decodedMasksById = new Map(decodedMasks.map((mask) => [mask.id, mask]))
  for (const mask of decodedMasks) {
    if (!mask.linkedMaskId) continue
    const linked = decodedMasksById.get(mask.linkedMaskId)
    if (!linked || linked === mask) throw new Error(tr('core.project.layerMaskCorrupt'))
    const visited = new Set<string>()
    let current: LayerMask | undefined = mask
    while (current?.linkedMaskId) {
      if (visited.has(current.id)) throw new Error(tr('core.project.layerMaskCorrupt'))
      visited.add(current.id)
      current = decodedMasksById.get(current.linkedMaskId)
      if (!current) throw new Error(tr('core.project.layerMaskCorrupt'))
    }
  }
  const palette = Array.isArray(source.palette) ? source.palette : []
  const paletteOrder = Array.isArray(source.paletteOrder)
    ? source.paletteOrder.filter((id): id is number => typeof id === 'number' && Number.isSafeInteger(id))
    : []
  const paletteColumns = normalizePaletteColumns(source.paletteColumns)
  const document: SpriteDocument = {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: createId('doc'),
    name: source.name || tr('core.document.untitled'),
    width: source.width,
    height: source.height,
    colorMode: mode,
    layers,
    groups,
    activeLayerId,
    palette,
    paletteOrder,
    paletteColumns,
    paletteSlots: normalizePaletteSlots(palette.map((entry) => entry.id), paletteOrder, Array.isArray(source.paletteSlots) ? source.paletteSlots : undefined, paletteColumns),
    nextColorId: Math.max(1, source.nextColorId ?? 1),
    customBrushes,
    tilesets,
    animation,
    ...(outlineSettings ? { outlineSettings } : {}),
    displaySettings,
    statistics,
    timelapse,
    slices: normalizeDocumentSlices(source.slices, source.width, source.height),
    filePath: null,
    dirty: false,
    createdAt: source.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
  document.layerPanelState = normalizeProjectLayerPanelState(document, source.layerPanelState)
  ensureFreeTileTilesetOwnership(document)
  for (const cel of animation.cels) {
    if (!cel.surface) continue
    if (cel.tilemap) {
      cel.surface = renderTilemapSurface(
        cel.tilemap,
        document.tilesets ?? [],
        document.colorMode,
        cel.surface.offsetX,
        cel.surface.offsetY,
        document.colorMode === 'indexed' ? (color) => paletteColorIdForCanvas(document, color) : undefined
      )
      continue
    }
    if (cel.freeTiles) {
      const layer = layersById.get(cel.layerId)
      const sources = layer?.kind === 'free-tile' ? freeTileSourcesForLayer(document, layer) : []
      if (sources.length === 0) throw new Error(tr('core.project.layerCorrupt', { name: cel.id }))
      cel.surface = renderFreeTileSurface(
        cel.freeTiles,
        sources,
        document.colorMode,
        cel.surface.width,
        cel.surface.height,
        cel.surface.offsetX,
        cel.surface.offsetY,
        document.colorMode === 'indexed' ? (color) => paletteColorIdForCanvas(document, color) : undefined
      )
    }
  }
  const linkedGroups = new Map<string, RasterLayer[]>()
  for (const layer of document.layers) {
    if (!layer.linkedContentId) continue
    if (layer.kind || layer.background) throw new Error(tr('core.project.layerCorrupt', { name: layer.name }))
    const members = linkedGroups.get(layer.linkedContentId) ?? []
    members.push(layer)
    linkedGroups.set(layer.linkedContentId, members)
  }
  const celLookup = createAnimationCelLookup(animation)
  for (const members of linkedGroups.values()) {
    if (members.length < 2) continue
    const first = members[0]
    const firstStorage = rasterStorageIdentity(first)
    if (members.some((layer) => layer.format !== first.format || layer.width !== first.width || layer.height !== first.height || rasterStorageIdentity(layer) !== firstStorage)) {
      throw new Error(tr('core.project.layerCorrupt', { name: first.name }))
    }
    for (const frame of animation.frames) {
      const surfaces = members.map((layer) => celLookup.resolve(celLookup.at(layer.id, frame.id))?.surface)
      const firstSurface = surfaces[0]
      if (!firstSurface || surfaces.some((surface) => !surface
        || surface.format !== firstSurface.format
        || surface.width !== firstSurface.width
        || surface.height !== firstSurface.height
        || rasterStorageIdentity(surface) !== rasterStorageIdentity(firstSurface))) {
        throw new Error(tr('core.project.layerCorrupt', { name: first.name }))
      }
    }
  }
  rgbaPixelsByFile.clear()
  indexedPixelsByFile.clear()
  decodedRasterByKey.clear()
  for (const name of requiredFiles) if (name !== 'manifest.json') delete files[name]
  if ((manifest.sourceSchemaVersion ?? 0) < SPARSE_RASTER_PROJECT_SCHEMA_VERSION) compactProjectRasterStorage(document)
  ensureAnimationDocument(document)
  refreshActiveAnimationFrame(document)
  remapIndexedDocumentToVisiblePalette(document)
  const activeLayer = document.layers.find((layer) => layer.id === document.activeLayerId)
  if (activeLayer) rasterContentBounds(activeLayer, document.palette)
  reportProgress(1)
  return document
}
