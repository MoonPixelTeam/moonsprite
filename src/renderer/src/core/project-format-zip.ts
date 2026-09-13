import { inflateSync, strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate'
import { BLEND_MODES, type BlendMode, type PaletteEntry, type RgbaColor } from '@shared/types-color'
import { type AnimationCelSurface, type AnimationFrame, type AnimationLoopSection } from '@shared/types-animation'
import { type BackgroundLayerSettings, type LayerGroup, type LayerMask, type RasterLayer } from '@shared/types-layer'
import { type ColorMode, type RasterFormat, type RuntimeRasterTiles } from '@shared/types-raster'
import { type FreeTileCelData, type FreeTileInstance, type FreeTileSourceLayer, type TilemapCelData, type TilemapCell, type Tileset } from '@shared/types-tiles'
import { type LayerStyles } from '@shared/types-layer-style'
import { type ProjectBrush } from '@shared/types-brush'
import { type SpriteDocument } from '@shared/types-document'
import { type TextCelData } from '@shared/types-text'
import { type TimelapseSettings } from '@shared/types-timelapse'
import { compositeDocument, createCompositePointSampler, createNormalCompositePointSampler } from './document-composite'
import { createId, getLayerStorageOrigin, getRasterContentRevision, paletteColorIdForCanvas, rasterContentBounds, remapIndexedDocumentToVisiblePalette, setLayerStorageOrigin } from './document-model'
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
interface ProjectZipEntry {
  compression: number
  flags: number
  compressedSize: number
  uncompressedSize: number
  localOffset: number
}

export const projectZipDirectory = (data: Uint8Array): Map<string, ProjectZipEntry> | null => {
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
    entries.set(name, {
      compression,
      flags,
      compressedSize,
      uncompressedSize,
      localOffset
    })
    offset = nameEnd + extraLength + commentLength
  }
  return entries
}

export const projectZipEntryData = (data: Uint8Array, entry: ProjectZipEntry): Uint8Array | null => {
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

export const projectZipFiles = (data: Uint8Array, directory: ReadonlyMap<string, ProjectZipEntry>, names: ReadonlySet<string>): Record<string, Uint8Array> | null => {
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

export const storedTimelapseEntryViews = (data: Uint8Array, directory: ReadonlyMap<string, ProjectZipEntry>): Map<string, Uint8Array> => {
  const entries = new Map<string, Uint8Array>()
  for (const [name, entry] of directory) {
    if (!/^timelapse\/.*\.png$/i.test(name) || entry.compression !== 0 || entry.compressedSize !== entry.uncompressedSize) continue
    const bytes = projectZipEntryData(data, entry)
    if (bytes) entries.set(name, bytes)
  }
  return entries
}
