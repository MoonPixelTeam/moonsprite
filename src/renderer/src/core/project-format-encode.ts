import { strToU8, zipSync, type Zippable } from 'fflate'
import { type AnimationCelSurface } from '@shared/types-animation'
import { type LayerGroup, type LayerMask, type RasterLayer } from '@shared/types-layer'
import { type Tileset } from '@shared/types-tiles'
import { type SpriteDocument } from '@shared/types-document'
import { getRasterContentRevision } from './document-model'
import { ensureAnimationDocument, syncActiveAnimationLayers } from './animation'
import { normalizeTimelapseSettings } from './project-metadata'
import { translateCurrent as tr } from './localization'
import { normalizePaletteColumns, normalizePaletteSlots } from './palette-layout'
import { rasterStorageIdentity, runtimeRasterForSurface } from './runtime-raster'
import { normalizeDocumentSlices } from './slices'
import { normalizeTextCelData } from './text-cel-data'
import { cloneLayerStyles } from './layer-styles'
import { MAX_TILESET_PIXELS, compactTilesetTileSlots } from './tilemap'
import { ensureFreeTileTilesetOwnership } from './free-tile-document'
import {
  type ProjectArchiveResource,
  type ProjectEncodeOptions,
  type ProjectSaveBaseline,
  type ProjectArchiveBuild,
  type RasterDataEncoding,
  PROJECT_SCHEMA_VERSION,
  type ManifestMask,
  type ManifestLayer,
  type ManifestProjectBrush,
  type ManifestTileset,
  type ManifestAnimation,
  type ManifestTimelapse,
  type ProjectManifest
} from './project-format-manifest-types'
import { encodeRuntimeRasterData, encodeSparseRasterData, toU8 } from './project-format-raster'
import { manifestTilemapFromData, manifestFreeTilesFromData, encodeProjectPreview } from './project-format-manifest'

const rasterGeometryMatchesSurface = (raster: ProjectArchiveResource['raster'], surface: RasterLayer | AnimationCelSurface): boolean =>
  Boolean(raster && raster.width === surface.width && raster.height === surface.height && raster.offsetX === surface.offsetX && raster.offsetY === surface.offsetY)

export const rasterMetadataMatches = (left: ProjectArchiveResource['raster'], right: ProjectArchiveResource['raster']): boolean => {
  if (!left || !right) return left === right
  return left.width === right.width && left.height === right.height && left.offsetX === right.offsetX && left.offsetY === right.offsetY && left.dataEncoding === right.dataEncoding && left.byteLength === right.byteLength
}

export const tilesetRasterMetadata = (tileset: Tileset): NonNullable<ProjectArchiveResource['raster']> => ({
  width: tileset.columns * tileset.tileWidth,
  height: tileset.rows * tileset.tileHeight,
  offsetX: 0,
  offsetY: 0,
  dataEncoding: 'raw',
  byteLength: tileset.columns * tileset.rows * tileset.tileWidth * tileset.tileHeight * 4
})

export const createProjectArchiveFiles = (document: SpriteDocument, options: ProjectEncodeOptions = {}, baseline?: ProjectSaveBaseline, revisionOverrides?: ReadonlyMap<string, number | null>): ProjectArchiveBuild => {
  syncActiveAnimationLayers(document)
  ensureFreeTileTilesetOwnership(document)
  const files: Record<string, Uint8Array> = {}
  const resources: ProjectArchiveResource[] = []
  const dataFileByPixels = new Map<
    object,
    {
      dataFile: string
      dataEncoding: RasterDataEncoding
      width: number
      height: number
      byteLength: number
    }
  >()
  const rasterStorageByFile = new Map<
    string,
    {
      storage: object
      dataEncoding: RasterDataEncoding
      width: number
      height: number
    }
  >()
  const canClaimRasterFile = (dataFile: string, storage: object, raster: { dataEncoding: RasterDataEncoding; width: number; height: number }): boolean => {
    const claimed = rasterStorageByFile.get(dataFile)
    return !claimed || (claimed.storage === storage && claimed.dataEncoding === raster.dataEncoding && claimed.width === raster.width && claimed.height === raster.height)
  }
  const claimRasterFile = (dataFile: string, storage: object, raster: { dataEncoding: RasterDataEncoding; width: number; height: number }): void => {
    rasterStorageByFile.set(dataFile, {
      storage,
      dataEncoding: raster.dataEncoding,
      width: raster.width,
      height: raster.height
    })
  }
  const revisionFor = (key: string, resource: object): number | null => revisionOverrides?.get(key) ?? getRasterContentRevision(resource)
  const encodePixels = (
    key: string,
    preferredFile: string,
    surface: RasterLayer | AnimationCelSurface
  ): {
    dataFile: string
    dataEncoding: RasterDataEncoding
    width: number
    height: number
    offsetX: number
    offsetY: number
    byteLength: number
  } => {
    const storage = rasterStorageIdentity(surface)
    const existing = dataFileByPixels.get(storage)
    const revision = revisionFor(key, storage)
    if (existing) {
      const result = {
        ...existing,
        offsetX: surface.offsetX,
        offsetY: surface.offsetY
      }
      resources.push({
        key,
        path: existing.dataFile,
        revision,
        byteLength: existing.byteLength,
        raster: {
          width: result.width,
          height: result.height,
          offsetX: result.offsetX,
          offsetY: result.offsetY,
          dataEncoding: result.dataEncoding,
          byteLength: existing.byteLength
        }
      })
      return result
    }
    const previous = baseline?.resources.get(key)
    if (baseline?.schemaVersion === PROJECT_SCHEMA_VERSION && previous?.raster && previous.revision === revision && rasterGeometryMatchesSurface(previous.raster, surface) && canClaimRasterFile(previous.path, storage, previous.raster)) {
      const byteLength = previous.byteLength ?? previous.raster.byteLength
      if (byteLength !== undefined) {
        const result = {
          dataFile: previous.path,
          ...previous.raster,
          byteLength
        }
        resources.push({
          key,
          path: previous.path,
          revision,
          byteLength,
          raster: { ...previous.raster, byteLength }
        })
        claimRasterFile(previous.path, storage, previous.raster)
        dataFileByPixels.set(storage, {
          dataFile: result.dataFile,
          dataEncoding: result.dataEncoding,
          width: result.width,
          height: result.height,
          byteLength
        })
        return result
      }
    }
    const runtime = runtimeRasterForSurface(surface)
    const encoded = runtime && storage === runtime ? encodeRuntimeRasterData(runtime) : encodeSparseRasterData(surface.pixels, surface.format, surface.width, surface.height)
    const dataFile = encoded.encoding === 'sparse-tiles-v1' ? `${preferredFile}.tiles` : preferredFile
    files[dataFile] = encoded.data
    const raster = {
      width: surface.width,
      height: surface.height,
      offsetX: surface.offsetX,
      offsetY: surface.offsetY,
      dataEncoding: encoded.encoding,
      byteLength: encoded.data.byteLength
    }
    resources.push({
      key,
      path: dataFile,
      revision,
      byteLength: encoded.data.byteLength,
      raster
    })
    claimRasterFile(dataFile, storage, raster)
    const result = { dataFile, ...raster }
    dataFileByPixels.set(storage, {
      dataFile: result.dataFile,
      dataEncoding: result.dataEncoding,
      width: result.width,
      height: result.height,
      byteLength: result.byteLength
    })
    return result
  }
  const encodeMask = (key: string, mask: LayerMask): ManifestMask => {
    const dataFile = `masks/${mask.id}.rgba`
    files[dataFile] = toU8(mask.pixels)
    resources.push({
      key,
      path: dataFile,
      revision: revisionFor(key, mask.pixels),
      byteLength: mask.pixels.byteLength
    })
    return {
      id: mask.id,
      ...(mask.linkedMaskId ? { linkedMaskId: mask.linkedMaskId } : {}),
      ...(mask.locked ? { locked: true } : {}),
      ...(mask.autoLinkAnimationCels ? { autoLinkAnimationCels: true } : {}),
      width: mask.width,
      height: mask.height,
      offsetX: mask.offsetX,
      offsetY: mask.offsetY,
      dataFile
    }
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
      ...(layer.kind === 'free-tile' && layer.freeTileSources
        ? {
            freeTileSources: layer.freeTileSources.map((source) => ({
              ...source,
              displayColor: source.displayColor ? { ...source.displayColor } : undefined
            }))
          }
        : {}),
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
  const groups: LayerGroup[] = document.groups.map((group) => ({
    ...group,
    layerStyles: cloneLayerStyles(group.layerStyles),
    displayColor: group.displayColor ? { ...group.displayColor } : undefined
  }))
  const customBrushes: ManifestProjectBrush[] = (document.customBrushes ?? []).map((brush) => {
    const dataFile = `brushes/${brush.id}.gray`
    files[dataFile] = brush.coverage
    const colorsFile = brush.colors && brush.colors.length === brush.width * brush.height ? `brushes/${brush.id}.rgba` : undefined
    if (colorsFile) files[colorsFile] = toU8(brush.colors!)
    return {
      id: brush.id,
      name: brush.name,
      width: brush.width,
      height: brush.height,
      dataFile,
      colorsFile,
      sourceX: brush.sourceX,
      sourceY: brush.sourceY
    }
  })
  const tilesets: ManifestTileset[] = (document.tilesets ?? []).map((tileset) => {
    const dataFile = `tilesets/${tileset.id}.rgba`
    const raster = tilesetRasterMetadata(tileset)
    const byteLength = raster.byteLength
    if (!Number.isSafeInteger(raster.width) || !Number.isSafeInteger(raster.height) || typeof byteLength !== 'number' || !Number.isSafeInteger(byteLength) || byteLength > MAX_TILESET_PIXELS * 4 || tileset.pixels.byteLength !== byteLength) {
      throw new Error(tr('core.project.layerCorrupt', { name: tileset.name || tileset.id }))
    }
    files[dataFile] = toU8(tileset.pixels)
    resources.push({
      key: `tileset:${tileset.id}`,
      path: dataFile,
      revision: revisionFor(`tileset:${tileset.id}`, tileset.pixels),
      raster
    })
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
    loopSections: (timeline.loopSections ?? []).map((section) => ({
      ...section
    })),
    layerMasks: (timeline.layerMasks ?? []).map((entry) => ({
      layerId: entry.layerId,
      frameId: entry.frameId,
      mask: encodeMask(`layer-mask:${entry.layerId}:${entry.frameId}`, entry.mask)
    })),
    groupMasks: (timeline.groupMasks ?? []).map((entry) => ({
      groupId: entry.groupId,
      frameId: entry.frameId,
      mask: encodeMask(`group-mask:${entry.groupId}:${entry.frameId}`, entry.mask)
    })),
    cels: timeline.cels.flatMap((cel) => {
      if (!cel.surface) return []
      const encoded = cel.linkedCelId ? undefined : encodePixels(`cel:${cel.id}`, `cels/${cel.id}.${cel.surface.format === 'rgba' ? 'rgba' : 'idx32'}`, cel.surface)
      return [
        {
          id: cel.id,
          layerId: cel.layerId,
          frameId: cel.frameId,
          ...(cel.linkedCelId ? { linkedCelId: cel.linkedCelId } : {}),
          ...(Number.isFinite(cel.zIndex) && cel.zIndex !== 0 ? { zIndex: Math.max(-999, Math.min(999, Math.trunc(cel.zIndex!))) } : {}),
          ...(Number.isFinite(cel.opacity) ? { opacity: cel.opacity } : {}),
          ...(encoded
            ? {
                format: cel.surface.format,
                width: encoded.width,
                height: encoded.height,
                offsetX: encoded.offsetX,
                offsetY: encoded.offsetY,
                dataFile: encoded.dataFile,
                dataEncoding: encoded.dataEncoding
              }
            : {}),
          ...(cel.text ? { text: normalizeTextCelData(cel.text) } : {}),
          ...(cel.tilemap && !cel.linkedCelId ? { tilemap: manifestTilemapFromData(cel.tilemap) } : {}),
          ...(cel.freeTiles && !cel.linkedCelId ? { freeTiles: manifestFreeTilesFromData(cel.freeTiles) } : {})
        }
      ]
    })
  }
  const timelapseSettings = normalizeTimelapseSettings(document.timelapse, document.timelapse?.snapshots ?? [])
  const timelapse: ManifestTimelapse = {
    enabled: timelapseSettings.enabled,
    recordUndoSteps: timelapseSettings.recordUndoSteps,
    quality: timelapseSettings.quality,
    fps: timelapseSettings.fps,
    speed: timelapseSettings.speed,
    mode: timelapseSettings.mode,
    snapshots: timelapseSettings.snapshots.map((snapshot) => {
      const dataFile = `timelapse/${snapshot.id}.png`
      files[dataFile] = snapshot.data
      resources.push({
        key: `timelapse:${snapshot.id}`,
        path: dataFile,
        revision: null
      })
      return {
        id: snapshot.id,
        capturedAt: snapshot.capturedAt,
        elapsedMs: snapshot.elapsedMs,
        width: snapshot.width,
        height: snapshot.height,
        changeScore: snapshot.changeScore,
        dataFile
      }
    })
  }
  const {
    schemaVersion: _schemaVersion,
    layers: _layers,
    groups: _groups,
    palette: _palette,
    customBrushes: _customBrushes,
    tilesets: _tilesets,
    animation: _animation,
    timelapse: _timelapse,
    filePath: _filePath,
    sourceFilePath: _sourceFilePath,
    dirty: _dirty,
    ...serializable
  } = document
  const manifest: ProjectManifest = {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    app: 'MoonSprite',
    document: {
      ...serializable,
      schemaVersion: PROJECT_SCHEMA_VERSION,
      layers,
      groups,
      palette: document.palette.map((entry) => ({
        ...entry,
        color: { ...entry.color }
      })),
      paletteColumns: normalizePaletteColumns(document.paletteColumns),
      paletteSlots: normalizePaletteSlots(
        document.palette.map((entry) => entry.id),
        document.paletteOrder,
        document.paletteSlots,
        normalizePaletteColumns(document.paletteColumns)
      ),
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

export const createProjectZipEntries = (files: Record<string, Uint8Array>): Zippable => {
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
  return zipSync(createProjectZipEntries(files), {
    level: options.compressionLevel ?? 6
  })
}
