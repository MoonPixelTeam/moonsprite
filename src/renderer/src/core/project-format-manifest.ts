import { strFromU8 } from 'fflate'
import { BLEND_MODES, type BlendMode, type RgbaColor } from '@shared/types-color'
import { type LayerGroup } from '@shared/types-layer'
import { type RasterFormat } from '@shared/types-raster'
import { type FreeTileCelData, type FreeTileSourceLayer, type TilemapCelData } from '@shared/types-tiles'
import { type SpriteDocument } from '@shared/types-document'
import {
  compositeDocument
} from './document-composite-region'
import {
  createCompositePointSampler,
  createNormalCompositePointSampler
} from './document-composite-sampling'
import { createId } from './document-model'
import { createDefaultAnimationTimeline, normalizeAnimationTimeline } from './animation'
import { encodePng } from './png-encode'
import { translateCurrent as tr } from './localization'
import { normalizeDocumentSlices } from './slices'
import { normalizeTextCelData } from './text-cel-data'
import { normalizeLayerStyles } from './layer-styles'
import { normalizeBackgroundLayerSettings } from './background-patterns'
import { PROJECT_PREVIEW_MAX_DIMENSION, rasterDataEncoding } from './project-format-raster'
import {
  type ManifestAnimation,
  type ManifestCel,
  type ManifestLayerMask,
  type ManifestGroupMask,
  type ManifestTilemapCelData,
  type ManifestFreeTileCelData,
  type ProjectManifest,
  LEGACY_PROJECT_SCHEMA_VERSION,
  SPARSE_RASTER_PROJECT_SCHEMA_VERSION,
  SLICES_PROJECT_SCHEMA_VERSION,
  EDITABLE_TEXT_PROJECT_SCHEMA_VERSION,
  STYLED_TEXT_PROJECT_SCHEMA_VERSION,
  TEXT_BOX_PROJECT_SCHEMA_VERSION,
  DOCUMENT_COLOR_MODE_PROJECT_SCHEMA_VERSION,
  LAYER_STYLES_PROJECT_SCHEMA_VERSION,
  BACKGROUND_LAYER_PROJECT_SCHEMA_VERSION,
  TILEMAP_PROJECT_SCHEMA_VERSION,
  FREE_TILE_PROJECT_SCHEMA_VERSION,
  FREE_TILE_SOURCE_PROJECT_SCHEMA_VERSION,
  LOOP_SECTIONS_PROJECT_SCHEMA_VERSION,
  LINKED_LAYERS_PROJECT_SCHEMA_VERSION,
  FREE_TILE_SET_PROJECT_SCHEMA_VERSION,
  PROJECT_SCHEMA_VERSION,
  type ManifestLayer,
  type ManifestTileset,
  type RasterDataSource
} from './project-format-manifest-types'

export const encodeProjectPreview = (document: SpriteDocument): Uint8Array => {
  if (document.width <= PROJECT_PREVIEW_MAX_DIMENSION && document.height <= PROJECT_PREVIEW_MAX_DIMENSION) {
    return encodePng(compositeDocument(document), document.width, document.height).bytes
  }
  const scale = Math.min(PROJECT_PREVIEW_MAX_DIMENSION / document.width, PROJECT_PREVIEW_MAX_DIMENSION / document.height)
  const width = Math.max(1, Math.round(document.width * scale))
  const height = Math.max(1, Math.round(document.height * scale))
  const pixels = new Uint8ClampedArray(width * height * 4)
  const sample = createNormalCompositePointSampler(document) ?? createCompositePointSampler(document)
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(document.width - 1, Math.floor(((x + 0.5) * document.width) / width))
      const sourceY = Math.min(document.height - 1, Math.floor(((y + 0.5) * document.height) / height))
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

export const normalizeBlendMode = (value: unknown): BlendMode => (typeof value === 'string' && blendModeSet.has(value) ? (value as BlendMode) : 'normal')

export const normalizeLayerGroups = (source: unknown): LayerGroup[] => {
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
      ...(candidate.parentGroupId === undefined
        ? {}
        : {
            parentGroupId: typeof candidate.parentGroupId === 'string' ? candidate.parentGroupId : null
          }),
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

export const normalizeDisplayColor = (value: unknown): RgbaColor | null => {
  if (!value || typeof value !== 'object') return null
  const color = value as Partial<RgbaColor>
  if (![color.r, color.g, color.b, color.a].every((channel) => typeof channel === 'number' && Number.isFinite(channel))) return null
  return {
    r: Math.max(0, Math.min(255, Math.round(color.r!))),
    g: Math.max(0, Math.min(255, Math.round(color.g!))),
    b: Math.max(0, Math.min(255, Math.round(color.b!))),
    a: Math.max(0, Math.min(255, Math.round(color.a!)))
  }
}

export const normalizeManifestFreeTileSources = (value: unknown): FreeTileSourceLayer[] => {
  if (!Array.isArray(value)) return []
  const ids = new Set<string>()
  const tilesetIds = new Set<string>()
  const sources: FreeTileSourceLayer[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') return []
    const source = entry as Partial<FreeTileSourceLayer>
    if (typeof source.id !== 'string' || !source.id || ids.has(source.id) || typeof source.tilesetId !== 'string' || !source.tilesetId || tilesetIds.has(source.tilesetId)) return []
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
  const rawCels = value && typeof value === 'object' && Array.isArray((value as { cels?: unknown }).cels) ? (value as { cels: unknown[] }).cels : []
  return {
    frames: normalized.frames,
    activeFrameId: normalized.activeFrameId,
    loop: normalized.loop,
    loopSections: (normalized.loopSections ?? []).map((section) => ({
      ...section
    })),
    cels: normalized.cels.map((cel) => {
      const raw = rawCels.find((candidate) => candidate && typeof candidate === 'object' && (candidate as { id?: unknown }).id === cel.id) as Partial<ManifestCel> | undefined
      const { mask: _runtimeMask, surface: _runtimeSurface, tilemap: _runtimeTilemap, freeTiles: _runtimeFreeTiles, ...normalizedCel } = cel
      return {
        ...normalizedCel,
        ...(Number.isFinite(raw?.opacity) ? { opacity: Math.max(0, Math.min(1, Number(raw!.opacity))) } : {}),
        ...(raw?.format === 'rgba' || raw?.format === 'indexed' ? { format: raw.format } : {}),
        ...(Number.isSafeInteger(raw?.width) ? { width: raw!.width } : {}),
        ...(Number.isSafeInteger(raw?.height) ? { height: raw!.height } : {}),
        ...(Number.isFinite(raw?.offsetX) ? { offsetX: Math.trunc(raw!.offsetX!) } : {}),
        ...(Number.isFinite(raw?.offsetY) ? { offsetY: Math.trunc(raw!.offsetY!) } : {}),
        ...(typeof raw?.dataFile === 'string' ? { dataFile: raw.dataFile } : {}),
        ...(raw?.dataEncoding === 'raw' || raw?.dataEncoding === 'sparse-tiles-v1' ? { dataEncoding: raw.dataEncoding } : {}),
        ...(raw?.mask ? { mask: raw.mask } : {}),
        ...(raw?.text && typeof raw.text === 'object' ? { text: normalizeTextCelData(raw.text) } : {}),
        ...(raw?.tilemap && typeof raw.tilemap === 'object' ? { tilemap: raw.tilemap } : {}),
        ...(raw?.freeTiles && typeof raw.freeTiles === 'object' ? { freeTiles: raw.freeTiles } : {})
      }
    }),
    layerMasks:
      value && typeof value === 'object' && Array.isArray((value as { layerMasks?: unknown }).layerMasks)
        ? (value as { layerMasks: unknown[] }).layerMasks.flatMap((item) => {
            if (!item || typeof item !== 'object') return []
            const candidate = item as Partial<ManifestLayerMask>
            return typeof candidate.layerId === 'string' && candidate.layerId && typeof candidate.frameId === 'string' && frameIds.has(candidate.frameId) && candidate.mask
              ? [
                  {
                    layerId: candidate.layerId,
                    frameId: candidate.frameId,
                    mask: candidate.mask
                  }
                ]
              : []
          })
        : [],
    groupMasks:
      value && typeof value === 'object' && Array.isArray((value as { groupMasks?: unknown }).groupMasks)
        ? (value as { groupMasks: unknown[] }).groupMasks.flatMap((item) => {
            if (!item || typeof item !== 'object') return []
            const candidate = item as Partial<ManifestGroupMask>
            return typeof candidate.groupId === 'string' && candidate.groupId && typeof candidate.frameId === 'string' && frameIds.has(candidate.frameId) && candidate.mask
              ? [
                  {
                    groupId: candidate.groupId,
                    frameId: candidate.frameId,
                    mask: candidate.mask
                  }
                ]
              : []
          })
        : []
  }
}

export const manifestTilemapFromData = (tilemap: TilemapCelData): ManifestTilemapCelData => ({
  tileWidth: tilemap.tileWidth,
  tileHeight: tilemap.tileHeight,
  columns: tilemap.columns,
  rows: tilemap.rows,
  cells: tilemap.cells.flatMap((cell, index) => (cell ? [{ index, ...cell }] : []))
})

export const manifestFreeTilesFromData = (freeTiles: FreeTileCelData): ManifestFreeTileCelData => ({
  instances: freeTiles.instances.map((instance) => ({ ...instance }))
})

export function migrateProjectManifest(input: unknown): ProjectManifest {
  if (!input || typeof input !== 'object') throw new Error(tr('core.project.invalidManifestFormat'))
  const candidate = input as {
    app?: unknown
    schemaVersion?: unknown
    document?: Record<string, unknown>
  }
  if (candidate.app !== 'MoonSprite' || !candidate.document) throw new Error(tr('core.project.unsupportedVersion'))
  const version = Number(candidate.schemaVersion)
  if (
    ![
      1,
      2,
      3,
      LEGACY_PROJECT_SCHEMA_VERSION,
      SPARSE_RASTER_PROJECT_SCHEMA_VERSION,
      SLICES_PROJECT_SCHEMA_VERSION,
      EDITABLE_TEXT_PROJECT_SCHEMA_VERSION,
      STYLED_TEXT_PROJECT_SCHEMA_VERSION,
      TEXT_BOX_PROJECT_SCHEMA_VERSION,
      DOCUMENT_COLOR_MODE_PROJECT_SCHEMA_VERSION,
      LAYER_STYLES_PROJECT_SCHEMA_VERSION,
      BACKGROUND_LAYER_PROJECT_SCHEMA_VERSION,
      TILEMAP_PROJECT_SCHEMA_VERSION,
      FREE_TILE_PROJECT_SCHEMA_VERSION,
      FREE_TILE_SOURCE_PROJECT_SCHEMA_VERSION,
      LOOP_SECTIONS_PROJECT_SCHEMA_VERSION,
      LINKED_LAYERS_PROJECT_SCHEMA_VERSION,
      FREE_TILE_SET_PROJECT_SCHEMA_VERSION,
      PROJECT_SCHEMA_VERSION
    ].includes(version) ||
    candidate.document.schemaVersion !== candidate.schemaVersion
  )
    throw new Error(tr('core.project.unsupportedVersion'))
  if (version >= SPARSE_RASTER_PROJECT_SCHEMA_VERSION) {
    const layers = Array.isArray(candidate.document.layers) ? candidate.document.layers : []
    const animation = candidate.document.animation && typeof candidate.document.animation === 'object' ? (candidate.document.animation as { cels?: unknown }) : null
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
        const next: Record<string, unknown> = {
          ...(layer as Record<string, unknown>),
          ...(legacy ? { dataEncoding: 'raw' as const } : {})
        }
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
        const next: Record<string, unknown> = {
          ...(group as Record<string, unknown>)
        }
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
  const tilesets = version >= TILEMAP_PROJECT_SCHEMA_VERSION && Array.isArray(candidate.document.tilesets) ? (candidate.document.tilesets as unknown as ManifestTileset[]) : []
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

export function readManifest(files: Record<string, Uint8Array>): ProjectManifest {
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

export const directActiveCelDataFiles = (manifest: ProjectManifest): Map<string, RasterDataSource> => {
  const source = manifest.document
  if (source.animation.frames.length !== 1) return new Map()
  const documentRasterFormat: RasterFormat = source.colorMode === 'indexed' ? 'indexed' : 'rgba'
  const activeFrameId = source.animation.activeFrameId
  const activeCels = new Map(source.animation.cels.filter((cel) => cel.frameId === activeFrameId && typeof cel.dataFile === 'string' && cel.dataFile).map((cel) => [cel.layerId, cel]))
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
    dataFiles.set(layer.id, {
      dataFile: cel.dataFile!,
      dataEncoding,
      width: cel.width!,
      height: cel.height!,
      offsetX: Math.trunc(cel.offsetX ?? 0),
      offsetY: Math.trunc(cel.offsetY ?? 0)
    })
  }
  return dataFiles
}

export const requiredProjectDataFiles = (manifest: ProjectManifest, activeCelFiles: ReadonlyMap<string, RasterDataSource>, storedTimelapseFiles: ReadonlyMap<string, Uint8Array> = new Map()): Set<string> => {
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
