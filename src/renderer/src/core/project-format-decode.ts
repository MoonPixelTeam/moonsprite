import { normalizeGradientMap } from './gradient-map'
import { unzipSync } from 'fflate'
import { isPixelFormat } from './pixel-format'
import { type LayerMask, type RasterLayer } from '@shared/types-layer'
import { type ColorMode, type RasterFormat } from '@shared/types-raster'
import { type FreeTileCelData, type FreeTileSourceLayer, type TilemapCelData, type TilemapCell, type Tileset } from '@shared/types-tiles'
import { type ProjectBrush } from '@shared/types-brush'
import { type SpriteDocument } from '@shared/types-document'
import {
  createId,
  paletteColorIdForCanvas,
  rasterContentBounds,
  remapIndexedDocumentToVisiblePalette,
  setLayerStorageOrigin
} from './document-model'
import { createAnimationCelLookup, ensureAnimationDocument, normalizeAnimationTimeline, refreshActiveAnimationFrame } from './animation'
import { normalizeOutlineSettings } from './outline-settings'
import { normalizeProjectDisplaySettings, normalizeProjectStatistics } from './project-metadata'
import { translateCurrent as tr } from './localization'
import { normalizePaletteColumns, normalizePaletteSlots } from './palette-layout'
import { normalizeProjectLayerPanelState } from './layer-panel-state'
import { restoreProjectTimelapse, type ProjectDecodeReport } from './project-format-timelapse'
export type { ProjectDecodeReport, TimelapseFrameDropReason } from './project-format-timelapse'
import { installRuntimeRaster, rasterStorageIdentity } from './runtime-raster'
import { normalizeDocumentSlices } from './slices'
import { normalizeTextCelData } from './text-cel-data'
import { normalizeLayerStyles } from './layer-styles'
import { normalizeBackgroundLayerSettings } from './background-patterns'
import {
  MAX_TILE_SIZE,
  MAX_TILEMAP_CELLS,
  MAX_TILEMAP_SURFACE_PIXELS,
  MAX_TILESET_LAYOUT_SLOTS,
  MAX_TILESET_PIXELS,
  normalizeTilemapCell,
  renderTilemapSurface
} from './tilemap'
import {
  MAX_FREE_TILE_INSTANCES,
  freeTileSourceRefs,
  normalizeFreeTileCelData,
  renderFreeTileSurface,
  type FreeTileSourceCollection
} from './free-tile'
import { ensureFreeTileTilesetOwnership, freeTileSourcesForLayer } from './free-tile-document'
import { projectZipDirectory, projectZipFiles, storedTimelapseEntryViews } from './project-format-zip'
import {
  type ManifestTileset,
  type ManifestTilemapCelData,
  type ManifestFreeTileCelData,
  type ManifestMask,
  PROJECT_SCHEMA_VERSION,
  FREE_TILE_SOURCE_PROJECT_SCHEMA_VERSION,
  SPARSE_RASTER_PROJECT_SCHEMA_VERSION
} from './project-format-manifest-types'
import {
  readManifest,
  directActiveCelDataFiles,
  requiredProjectDataFiles,
  normalizeBlendMode,
  normalizeManifestFreeTileSources,
  normalizeDisplayColor,
  normalizeLayerGroups
} from './project-format-manifest'
import { type DecodedRasterData, rasterDataEncoding, decodeSparseRasterData, compactProjectRasterStorage } from './project-format-raster'

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
    if (
      !id ||
      ids.has(id) ||
      !Number.isSafeInteger(tileWidth) ||
      tileWidth < 1 ||
      !Number.isSafeInteger(tileHeight) ||
      tileHeight < 1 ||
      !Number.isSafeInteger(columns) ||
      columns < 1 ||
      !Number.isSafeInteger(rows) ||
      rows < 1 ||
      !Number.isSafeInteger(tileCount) ||
      tileCount < 1 ||
      !Number.isSafeInteger(sheetPixels) ||
      sheetPixels > MAX_TILESET_PIXELS ||
      tileIds.length < 1 ||
      tileIds.length > tileCount ||
      uniqueTileIds.size !== tileIds.length ||
      tileIds.some((tileId) => typeof tileId !== 'string' || !tileId) ||
      !Array.isArray(tileSlots) ||
      tileSlots.length < 1 ||
      tileSlots.length > MAX_TILESET_LAYOUT_SLOTS ||
      tileSlots.some((tileId) => tileId !== null && (typeof tileId !== 'string' || !tileId)) ||
      slotTileIds.length !== tileIds.length ||
      new Set(slotTileIds).size !== slotTileIds.length ||
      slotTileIds.some((tileId) => !uniqueTileIds.has(tileId)) ||
      typeof candidate.dataFile !== 'string' ||
      !candidate.dataFile
    ) {
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

const decodeManifestTilemap = (value: ManifestTilemapCelData, tilesets: ReadonlyMap<string, Tileset>, name: string): TilemapCelData => {
  const tileWidth = Number(value?.tileWidth)
  const tileHeight = Number(value?.tileHeight)
  const columns = Number(value?.columns)
  const rows = Number(value?.rows)
  const count = columns * rows
  const surfacePixels = columns * tileWidth * rows * tileHeight
  if (
    !Number.isSafeInteger(tileWidth) ||
    tileWidth < 1 ||
    tileWidth > MAX_TILE_SIZE ||
    !Number.isSafeInteger(tileHeight) ||
    tileHeight < 1 ||
    tileHeight > MAX_TILE_SIZE ||
    !Number.isSafeInteger(columns) ||
    columns < 1 ||
    !Number.isSafeInteger(rows) ||
    rows < 1 ||
    !Number.isSafeInteger(count) ||
    count > MAX_TILEMAP_CELLS ||
    !Number.isSafeInteger(surfacePixels) ||
    surfacePixels > MAX_TILEMAP_SURFACE_PIXELS ||
    !Array.isArray(value?.cells)
  )
    throw new Error(tr('core.project.layerCorrupt', { name }))
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

const decodeManifestFreeTiles = (value: ManifestFreeTileCelData, sources: FreeTileSourceCollection, name: string): FreeTileCelData => {
  if (!Array.isArray(value?.instances) || value.instances.length > MAX_FREE_TILE_INSTANCES) throw new Error(tr('core.project.layerCorrupt', { name }))
  if (Array.isArray(sources) && value.instances.some((instance) => !instance || typeof instance !== 'object' || typeof instance.sourceId !== 'string' || !instance.sourceId || typeof instance.tileId === 'string')) {
    throw new Error(tr('core.project.layerCorrupt', { name }))
  }
  const normalized = normalizeFreeTileCelData(value, sources, true)
  if (!normalized) throw new Error(tr('core.project.layerCorrupt', { name }))
  return normalized
}

export interface ProjectDecodeOptions {
  onProgress?: (value: number) => void
  /** Diagnoses frames the archive could not restore instead of dropping them silently. */
  onDroppedTimelapseFrames?: (report: ProjectDecodeReport) => void
}

export function decodeProject(input: Uint8Array, options: ProjectDecodeOptions = {}): SpriteDocument {
  const onProgress = options.onProgress
  const reportProgress = (value: number): void => onProgress?.(Math.max(0, Math.min(1, value)))
  reportProgress(0)
  const directory = projectZipDirectory(input)
  let manifestFiles: Record<string, Uint8Array>
  try {
    manifestFiles = directory ? (projectZipFiles(input, directory, new Set(['manifest.json'])) ?? unzipSync(input, { filter: (file) => file.name === 'manifest.json' })) : unzipSync(input, { filter: (file) => file.name === 'manifest.json' })
  } catch (error) {
    throw new Error(`${tr('core.project.unzip')} ${error instanceof Error ? error.message : String(error)}`)
  }
  reportProgress(0.12)
  const manifest = readManifest(manifestFiles)
  const activeCelFiles = directActiveCelDataFiles(manifest)
  const storedTimelapseFiles = directory ? storedTimelapseEntryViews(input, directory) : new Map<string, Uint8Array>()
  const requiredFiles = requiredProjectDataFiles(manifest, activeCelFiles, storedTimelapseFiles)
  let files: Record<string, Uint8Array>
  try {
    files = directory ? (projectZipFiles(input, directory, requiredFiles) ?? unzipSync(input, { filter: (file) => requiredFiles.has(file.name) })) : unzipSync(input, { filter: (file) => requiredFiles.has(file.name) })
  } catch (error) {
    throw new Error(`${tr('core.project.unzip')} ${error instanceof Error ? error.message : String(error)}`)
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
      if (cached)
        return {
          pixels: cached,
          width,
          height,
          storageOffsetX: 0,
          storageOffsetY: 0
        }
      const pixels = bytes.byteLength === expectedBytes ? new Uint8ClampedArray(bytes.buffer, bytes.byteOffset, bytes.byteLength) : null
      if (!pixels) throw new Error(tr('core.project.layerCorrupt', { name: dataFile }))
      rgbaPixelsByFile.set(cacheKey, pixels)
      return { pixels, width, height, storageOffsetX: 0, storageOffsetY: 0 }
    }
    const cached = indexedPixelsByFile.get(cacheKey)
    if (cached)
      return {
        pixels: cached,
        width,
        height,
        storageOffsetX: 0,
        storageOffsetY: 0
      }
    const pixels = bytes.byteLength === expectedBytes ? (bytes.byteOffset % 4 === 0 ? new Uint32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4) : new Uint32Array(bytes.slice().buffer)) : null
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
    return {
      id: metadata.id,
      name: tr(ownerKind === 'group' ? 'core.document.layerGroupMask' : 'core.document.layerMask'),
      description: '',
      visible: true,
      locked: metadata.locked === true,
      opacity: 1,
      blendMode: 'normal',
      width,
      height,
      offsetX: Math.trunc(offsetX),
      offsetY: Math.trunc(offsetY),
      format: 'rgba',
      pixels: maskPixels,
      ownerKind,
      ownerId,
      ...(metadata.linkedMaskId ? { linkedMaskId: metadata.linkedMaskId } : {}),
      ...(metadata.autoLinkAnimationCels === true ? { autoLinkAnimationCels: true } : {})
    }
  }
  const totalItems = Math.max(
    1,
    source.layers.length +
      (source.customBrushes?.length ?? 0) +
      (source.tilesets?.length ?? 0) +
      source.animation.cels.length +
      (source.animation.layerMasks?.length ?? source.animation.cels.filter((cel) => cel.mask).length) +
      (source.animation.groupMasks?.length ?? 0) +
      (source.timelapse?.snapshots?.length ?? 0)
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
    const legacyStyles = normalizeLayerStyles(metadata.layerStyles)
    const layerStyles = metadata.kind === 'adjustment' ? undefined : legacyStyles
    // Migrate the previous beta representation only at the project boundary.
    const adjustment = metadata.kind === 'adjustment' ? {
      kind: 'gradient-map' as const,
      enabled: metadata.adjustment ? metadata.adjustment.enabled !== false : legacyStyles?.enabled !== false && legacyStyles?.gradientMap?.enabled !== false,
      gradientMap: normalizeGradientMap(metadata.adjustment?.gradientMap ?? legacyStyles?.gradientMap)
    } : undefined
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
      ...(adjustment ? { adjustment } : {}),
      ...(background ? { background } : {}),
      ...(metadata.kind === 'text' || metadata.kind === 'tilemap' || metadata.kind === 'free-tile' || metadata.kind === 'adjustment' ? { kind: metadata.kind } : {}),
      ...(metadata.kind === 'tilemap' && typeof metadata.tilemapTilesetId === 'string' ? { tilemapTilesetId: metadata.tilemapTilesetId } : {}),
      ...(metadata.kind === 'free-tile' && typeof metadata.freeTileTilesetId === 'string' ? { freeTileTilesetId: metadata.freeTileTilesetId } : {}),
      ...(metadata.kind === 'free-tile' && typeof metadata.freeTileSetId === 'string' ? { freeTileSetId: metadata.freeTileSetId } : {}),
      ...(metadata.kind === 'free-tile' && Array.isArray(metadata.freeTileSources)
        ? {
            freeTileSources: normalizeManifestFreeTileSources(metadata.freeTileSources)
          }
        : {}),
      groupId: typeof metadata.groupId === 'string' ? metadata.groupId : null,
      ...(normalizeDisplayColor(metadata.displayColor) ? { displayColor: normalizeDisplayColor(metadata.displayColor)! } : {}),
      width: decoded.width,
      height: decoded.height,
      offsetX: (Number.isFinite(metadata.offsetX) ? Math.trunc(metadata.offsetX!) : 0) + decoded.storageOffsetX,
      offsetY: (Number.isFinite(metadata.offsetY) ? Math.trunc(metadata.offsetY!) : 0) + decoded.storageOffsetY
    }
    const layer =
      rasterFormat === 'rgba'
        ? {
            ...common,
            format: 'rgba' as const,
            pixels: decoded.pixels as Uint8ClampedArray
          }
        : {
            ...common,
            format: 'indexed' as const,
            pixels: decoded.pixels as Uint32Array
          }
    if (decoded.runtimeRaster) installRuntimeRaster(layer, decoded.runtimeRaster)
    if (decoded.storageOffsetX !== 0 || decoded.storageOffsetY !== 0)
      setLayerStorageOrigin(layer, {
        x: decoded.storageOffsetX,
        y: decoded.storageOffsetY
      })
    reportItem()
    return layer
  })
  if (layers.length === 0) throw new Error(tr('core.project.noLayers'))
  const tilemapTilesetIds = new Set(layers.flatMap((layer) => (layer.kind === 'tilemap' && layer.tilemapTilesetId ? [layer.tilemapTilesetId] : [])))
  const legacyFreeTileOwnerIds = new Set<string>()
  const freeTileTilesetOwners = new Map<string, string>()
  const freeTileSourceOwners = new Map<string, string>()
  const freeTileSourcesBySet = new Map<string, FreeTileSourceLayer[]>()
  const legacyFreeTiles = (manifest.sourceSchemaVersion ?? PROJECT_SCHEMA_VERSION) < FREE_TILE_SOURCE_PROJECT_SCHEMA_VERSION
  const sameFreeTileSource = (left: FreeTileSourceLayer, right: FreeTileSourceLayer): boolean =>
    left.id === right.id &&
    left.name === right.name &&
    left.tilesetId === right.tilesetId &&
    left.description === right.description &&
    left.visible === right.visible &&
    left.locked === right.locked &&
    left.opacity === right.opacity &&
    left.blendMode === right.blendMode &&
    left.offsetX === right.offsetX &&
    left.offsetY === right.offsetY &&
    left.displayColor?.r === right.displayColor?.r &&
    left.displayColor?.g === right.displayColor?.g &&
    left.displayColor?.b === right.displayColor?.b &&
    left.displayColor?.a === right.displayColor?.a
  for (const layer of layers) {
    if (layer.kind !== 'free-tile') continue
    if (legacyFreeTiles) {
      if (!layer.freeTileTilesetId || tilemapTilesetIds.has(layer.freeTileTilesetId) || legacyFreeTileOwnerIds.has(layer.freeTileTilesetId) || !tilesetsById.has(layer.freeTileTilesetId))
        throw new Error(tr('core.project.layerCorrupt', { name: layer.name }))
      legacyFreeTileOwnerIds.add(layer.freeTileTilesetId)
      continue
    }
    const setId = layer.freeTileSetId?.trim()
    if (!setId || setId !== layer.freeTileSetId || !layer.freeTileSources?.length) throw new Error(tr('core.project.layerCorrupt', { name: layer.name }))
    const canonicalSources = freeTileSourcesBySet.get(setId)
    if (canonicalSources && (canonicalSources.length !== layer.freeTileSources.length || canonicalSources.some((source, index) => !sameFreeTileSource(source, layer.freeTileSources![index])))) {
      throw new Error(tr('core.project.layerCorrupt', { name: layer.name }))
    }
    if (!canonicalSources) freeTileSourcesBySet.set(setId, layer.freeTileSources)
    const localSourceIds = new Set<string>()
    const localTilesetIds = new Set<string>()
    for (const source of layer.freeTileSources) {
      const sourceOwner = freeTileSourceOwners.get(source.id)
      const tilesetOwner = freeTileTilesetOwners.get(source.tilesetId)
      if (localSourceIds.has(source.id) || localTilesetIds.has(source.tilesetId) || (sourceOwner && sourceOwner !== setId) || (tilesetOwner && tilesetOwner !== setId)) throw new Error(tr('core.project.layerCorrupt', { name: layer.name }))
      const tileset = tilesetsById.get(source.tilesetId)
      if (!tileset || tileset.tileIds.length !== 1 || tileset.columns !== 1 || tileset.rows !== 1 || tilemapTilesetIds.has(source.tilesetId)) throw new Error(tr('core.project.layerCorrupt', { name: layer.name }))
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
    if (!Number.isSafeInteger(metadata.width) || !Number.isSafeInteger(metadata.height) || metadata.width < 1 || metadata.height < 1 || metadata.width * metadata.height > 16 * 1024 * 1024)
      throw new Error(tr('core.project.brushInvalidSize', { name: metadata.name }))
    const bytes = files[metadata.dataFile]
    if (!bytes || bytes.byteLength !== metadata.width * metadata.height) throw new Error(tr('core.project.brushCorrupt', { name: metadata.name }))
    let colors: Uint32Array | undefined
    if (metadata.colorsFile) {
      const colorBytes = files[metadata.colorsFile]
      if (colorBytes && colorBytes.byteLength === metadata.width * metadata.height * 4) colors = new Uint32Array(colorBytes.slice().buffer)
    }
    customBrushes.push({
      id: metadata.id,
      name: metadata.name,
      width: metadata.width,
      height: metadata.height,
      coverage: bytes.slice(),
      colors,
      sourceX: metadata.sourceX,
      sourceY: metadata.sourceY
    })
    reportItem()
  }
  const outlineSettings = normalizeOutlineSettings(source.outlineSettings)
  const displaySettings = normalizeProjectDisplaySettings(source.displaySettings)
  const statistics = normalizeProjectStatistics(source.statistics)
  const timelapse = restoreProjectTimelapse(source.timelapse, storedTimelapseFiles, files, reportItem, options.onDroppedTimelapseFrames)
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
      return cel.linkedCelId
        ? [
            {
              ...cel,
              text: metadata.text ? normalizeTextCelData(metadata.text) : cel.text
            }
          ]
        : []
    }
    if (metadata.format !== 'rgba' && metadata.format !== 'indexed') throw new Error(tr('core.project.layerCorrupt', { name: cel.id }))
    const width = Number(metadata.width)
    const height = Number(metadata.height)
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) return []
    const decoded = decodePixels(metadata.dataFile, metadata.dataEncoding, metadata.format, width, height)
    const surface =
      metadata.format === 'rgba'
        ? {
            format: 'rgba' as const,
            width: decoded.width,
            height: decoded.height,
            offsetX: Math.trunc(metadata.offsetX ?? 0) + decoded.storageOffsetX,
            offsetY: Math.trunc(metadata.offsetY ?? 0) + decoded.storageOffsetY,
            storageOriginX: decoded.storageOffsetX,
            storageOriginY: decoded.storageOffsetY,
            pixels: decoded.pixels as Uint8ClampedArray
          }
        : {
            format: 'indexed' as const,
            width: decoded.width,
            height: decoded.height,
            offsetX: Math.trunc(metadata.offsetX ?? 0) + decoded.storageOffsetX,
            offsetY: Math.trunc(metadata.offsetY ?? 0) + decoded.storageOffsetY,
            storageOriginX: decoded.storageOffsetX,
            storageOriginY: decoded.storageOffsetY,
            pixels: decoded.pixels as Uint32Array
          }
    if (decoded.runtimeRaster) installRuntimeRaster(surface, decoded.runtimeRaster)
    reportItem()
    return [
      {
        ...cel,
        text: metadata.text ? normalizeTextCelData(metadata.text) : cel.text,
        ...(tilemap ? { tilemap } : {}),
        ...(freeTiles ? { freeTiles } : {}),
        surface
      }
    ]
  })
  const manifestLayerMasks = Array.isArray(source.animation?.layerMasks) ? source.animation.layerMasks : []
  const decodedLayerMaskSlots = new Set<string>()
  animation.layerMasks = [...manifestLayerMasks, ...manifestCels.flatMap((cel) => (cel.mask ? [{ layerId: cel.layerId, frameId: cel.frameId, mask: cel.mask }] : []))].flatMap((entry) => {
    if (!entry || typeof entry.layerId !== 'string' || !layersById.has(entry.layerId) || typeof entry.frameId !== 'string' || !animation.frames.some((frame) => frame.id === entry.frameId))
      throw new Error(tr('core.project.layerMaskCorrupt'))
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
  const paletteOrder = Array.isArray(source.paletteOrder) ? source.paletteOrder.filter((id): id is number => typeof id === 'number' && Number.isSafeInteger(id)) : []
  const paletteColumns = normalizePaletteColumns(source.paletteColumns)
  const document: SpriteDocument = {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: createId('doc'),
    name: source.name || tr('core.document.untitled'),
    width: source.width,
    height: source.height,
    colorMode: mode,
    pixelFormat: mode === 'rgba' ? (isPixelFormat(source.pixelFormat) ? source.pixelFormat : 'rgba32') : undefined,
    layers,
    groups,
    activeLayerId,
    palette,
    paletteOrder,
    paletteColumns,
    paletteSlots: normalizePaletteSlots(
      palette.map((entry) => entry.id),
      paletteOrder,
      Array.isArray(source.paletteSlots) ? source.paletteSlots : undefined,
      paletteColumns
    ),
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
      cel.surface = renderTilemapSurface(cel.tilemap, document.tilesets ?? [], document.colorMode, cel.surface.offsetX, cel.surface.offsetY, document.colorMode === 'indexed' ? (color) => paletteColorIdForCanvas(document, color) : undefined)
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
      if (
        !firstSurface ||
        surfaces.some(
          (surface) => !surface || surface.format !== firstSurface.format || surface.width !== firstSurface.width || surface.height !== firstSurface.height || rasterStorageIdentity(surface) !== rasterStorageIdentity(firstSurface)
        )
      ) {
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
