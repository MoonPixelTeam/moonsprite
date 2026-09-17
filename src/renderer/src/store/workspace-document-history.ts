import type { AnimationCel, AnimationFrame, AnimationLoopSection } from '@shared/types-animation'
import type { AnimationGroupMask, AnimationLayerMask, LayerGroup, RasterLayer } from '@shared/types-layer'
import type { ColorMode } from '@shared/types-raster'
import type { FreeTileSourceLayer, Tileset } from '@shared/types-tiles'
import type { PaletteEntry } from '@shared/types-color'
import type { SpriteDocument } from '@shared/types-document'
import { cloneAnimationCel, ensureAnimationDocument, refreshActiveAnimationFrame, restoreAnimationCels, syncActiveAnimationFrame } from '@/core/animation'
import { cloneAnimationLoopSections } from '@/core/animation-loop-sections'
import { captureDocumentImageResizeSnapshot, documentImageResizeSnapshotBytes, restoreDocumentImageResizeSnapshot, type DocumentImageResizeSnapshot } from '@/core/document-model'
import { cloneLayerStyles } from '@/core/layer-styles'
import { rasterStorageIdentity, runtimeRasterForSurface } from '@/core/runtime-raster'
import { cloneTilemapCelData } from '@/core/tilemap'
import { cloneFreeTileCelData } from '@/core/free-tile'

interface AnimationStructureSnapshot {
  frames: AnimationFrame[]
  cels: AnimationCel[]
  layerMasks: AnimationLayerMask[]
  groupMasks: AnimationGroupMask[]
  loopSections: AnimationLoopSection[]
  activeFrameId: string
  loop: boolean
}

export interface DocumentStructureSnapshot {
  layers: RasterLayer[]
  layerParents: Array<{ layer: RasterLayer; groupId: string | null }>
  groups: LayerGroup[]
  groupPositions: Array<{ group: LayerGroup; parentGroupId: string | null; panelOrder?: number }>
  activeLayerId: string
  tilesets: Tileset[]
  palette: PaletteEntry[]
  paletteOrder: number[]
  paletteSlots?: Array<number | null>
  paletteColumns?: number
  nextColorId: number
  animation: AnimationStructureSnapshot
}

const clonePalette = (palette: readonly PaletteEntry[]): PaletteEntry[] => palette.map((entry) => ({ ...entry, color: { ...entry.color } }))

export const captureDocumentStructureSnapshot = (document: SpriteDocument): DocumentStructureSnapshot => {
  syncActiveAnimationFrame(document)
  const timeline = ensureAnimationDocument(document)
  return {
    layers: [...document.layers],
    layerParents: document.layers.map((layer) => ({ layer, groupId: layer.groupId ?? null })),
    groups: [...document.groups],
    groupPositions: document.groups.map((group) => ({ group, parentGroupId: group.parentGroupId ?? null, panelOrder: group.panelOrder })),
    activeLayerId: document.activeLayerId,
    tilesets: [...(document.tilesets ?? [])],
    palette: clonePalette(document.palette),
    paletteOrder: [...document.paletteOrder],
    paletteSlots: document.paletteSlots ? [...document.paletteSlots] : undefined,
    paletteColumns: document.paletteColumns,
    nextColorId: document.nextColorId,
    animation: {
      frames: [...timeline.frames],
      cels: [...timeline.cels],
      layerMasks: [...(timeline.layerMasks ?? [])],
      groupMasks: [...(timeline.groupMasks ?? [])],
      loopSections: cloneAnimationLoopSections(timeline.loopSections),
      activeFrameId: timeline.activeFrameId,
      loop: timeline.loop
    }
  }
}

export const restoreDocumentStructureSnapshot = (document: SpriteDocument, snapshot: DocumentStructureSnapshot): void => {
  for (const state of snapshot.layerParents) state.layer.groupId = state.groupId
  for (const state of snapshot.groupPositions) {
    state.group.parentGroupId = state.parentGroupId
    if (state.panelOrder === undefined) delete state.group.panelOrder
    else state.group.panelOrder = state.panelOrder
  }
  document.layers = [...snapshot.layers]
  document.groups = [...snapshot.groups]
  document.activeLayerId = snapshot.activeLayerId
  document.tilesets = [...snapshot.tilesets]
  document.palette = clonePalette(snapshot.palette)
  document.paletteOrder = [...snapshot.paletteOrder]
  document.paletteSlots = snapshot.paletteSlots ? [...snapshot.paletteSlots] : undefined
  document.paletteColumns = snapshot.paletteColumns
  document.nextColorId = snapshot.nextColorId
  const timeline = ensureAnimationDocument(document)
  timeline.frames = [...snapshot.animation.frames]
  timeline.cels = [...snapshot.animation.cels]
  timeline.layerMasks = [...snapshot.animation.layerMasks]
  timeline.groupMasks = [...snapshot.animation.groupMasks]
  timeline.loopSections = cloneAnimationLoopSections(snapshot.animation.loopSections)
  timeline.activeFrameId = snapshot.animation.activeFrameId
  timeline.loop = snapshot.animation.loop
  refreshActiveAnimationFrame(document)
}

const snapshotObjects = (snapshot: DocumentStructureSnapshot): Set<object> => new Set<object>([
  ...snapshot.layers,
  ...snapshot.groups,
  ...snapshot.tilesets,
  ...snapshot.animation.frames,
  ...snapshot.animation.cels,
  ...snapshot.animation.layerMasks,
  ...snapshot.animation.groupMasks,
  ...snapshot.animation.loopSections
])

const retainedBytesForObjects = (snapshot: DocumentStructureSnapshot, retained: ReadonlySet<object>): number => {
  const storage = new Set<object>()
  let bytes = 0
  const addSurface = (surface: RasterLayer | NonNullable<AnimationCel['surface']>): void => {
    const identity = rasterStorageIdentity(surface)
    if (storage.has(identity)) return
    storage.add(identity)
    const runtime = runtimeRasterForSurface(surface)
    bytes += runtime ? runtime.data.byteLength + runtime.tileOffsets.byteLength : surface.pixels.byteLength
  }
  for (const layer of snapshot.layers) if (retained.has(layer)) addSurface(layer)
  for (const cel of snapshot.animation.cels) if (retained.has(cel) && cel.surface) addSurface(cel.surface)
  for (const entry of snapshot.animation.layerMasks) if (retained.has(entry)) addSurface(entry.mask)
  for (const entry of snapshot.animation.groupMasks) if (retained.has(entry)) addSurface(entry.mask)
  for (const tileset of snapshot.tilesets) if (retained.has(tileset) && !storage.has(tileset.pixels)) {
    storage.add(tileset.pixels)
    bytes += tileset.pixels.byteLength
  }
  return bytes
}

export const documentStructureDeltaBytes = (before: DocumentStructureSnapshot, after: DocumentStructureSnapshot): number => {
  const beforeObjects = snapshotObjects(before)
  const afterObjects = snapshotObjects(after)
  const beforeOnly = new Set([...beforeObjects].filter((object) => !afterObjects.has(object)))
  const afterOnly = new Set([...afterObjects].filter((object) => !beforeObjects.has(object)))
  return retainedBytesForObjects(before, beforeOnly)
    + retainedBytesForObjects(after, afterOnly)
    + (beforeObjects.size + afterObjects.size) * 24
    + (before.palette.length + after.palette.length) * 32
}

interface LayerDefinitionSnapshot {
  name: string
  linkedContentId?: string
  kind?: RasterLayer['kind']
  tilemapTilesetId?: string
  freeTileSetId?: string
  freeTileSources?: FreeTileSourceLayer[]
  layerStyles?: RasterLayer['layerStyles']
  background?: RasterLayer['background']
}

export interface LayerContentSnapshot {
  layerId: string
  definition: LayerDefinitionSnapshot
  cels: AnimationCel[]
  layerMasks?: AnimationLayerMask[]
  tilesets: Tileset[]
  palette: PaletteEntry[]
  paletteOrder: number[]
  paletteSlots?: Array<number | null>
  paletteColumns?: number
  nextColorId: number
}

export const captureLayerContentSnapshot = (
  document: SpriteDocument,
  layerId: string,
  options: { includeLayerMasks?: boolean } = {}
): LayerContentSnapshot => {
  syncActiveAnimationFrame(document)
  const layer = document.layers.find((candidate) => candidate.id === layerId)
  if (!layer) throw new Error(`Layer not found: ${layerId}`)
  const timeline = ensureAnimationDocument(document)
  return {
    layerId,
    definition: {
      name: layer.name,
      linkedContentId: layer.linkedContentId,
      kind: layer.kind,
      tilemapTilesetId: layer.tilemapTilesetId,
      freeTileSetId: layer.freeTileSetId,
      freeTileSources: layer.freeTileSources?.map((source) => ({ ...source, displayColor: source.displayColor ? { ...source.displayColor } : undefined })),
      layerStyles: cloneLayerStyles(layer.layerStyles),
      background: layer.background ? { ...layer.background } : undefined
    },
    cels: timeline.cels.filter((cel) => cel.layerId === layerId).map(cloneAnimationCel),
    ...(options.includeLayerMasks === true ? {
      layerMasks: (timeline.layerMasks ?? []).filter((entry) => entry.layerId === layerId).map((entry) => ({
        layerId: entry.layerId,
        frameId: entry.frameId,
        mask: { ...entry.mask, pixels: new Uint8ClampedArray(entry.mask.pixels) }
      }))
    } : {}),
    tilesets: [...(document.tilesets ?? [])],
    palette: clonePalette(document.palette),
    paletteOrder: [...document.paletteOrder],
    paletteSlots: document.paletteSlots ? [...document.paletteSlots] : undefined,
    paletteColumns: document.paletteColumns,
    nextColorId: document.nextColorId
  }
}

export const restoreLayerContentSnapshot = (document: SpriteDocument, snapshot: LayerContentSnapshot): void => {
  const layer = document.layers.find((candidate) => candidate.id === snapshot.layerId)
  if (!layer) return
  layer.name = snapshot.definition.name
  if (snapshot.definition.linkedContentId) layer.linkedContentId = snapshot.definition.linkedContentId
  else delete layer.linkedContentId
  if (snapshot.definition.kind) layer.kind = snapshot.definition.kind
  else delete layer.kind
  if (snapshot.definition.tilemapTilesetId) layer.tilemapTilesetId = snapshot.definition.tilemapTilesetId
  else delete layer.tilemapTilesetId
  delete layer.freeTileTilesetId
  if (snapshot.definition.freeTileSetId) layer.freeTileSetId = snapshot.definition.freeTileSetId
  else delete layer.freeTileSetId
  if (snapshot.definition.freeTileSources) layer.freeTileSources = snapshot.definition.freeTileSources.map((source) => ({ ...source, displayColor: source.displayColor ? { ...source.displayColor } : undefined }))
  else delete layer.freeTileSources
  if (snapshot.definition.layerStyles) layer.layerStyles = cloneLayerStyles(snapshot.definition.layerStyles)
  else delete layer.layerStyles
  if (snapshot.definition.background) layer.background = { ...snapshot.definition.background }
  else delete layer.background
  document.tilesets = [...snapshot.tilesets]
  document.palette = clonePalette(snapshot.palette)
  document.paletteOrder = [...snapshot.paletteOrder]
  document.paletteSlots = snapshot.paletteSlots ? [...snapshot.paletteSlots] : undefined
  document.paletteColumns = snapshot.paletteColumns
  document.nextColorId = snapshot.nextColorId
  restoreAnimationCels(document, snapshot.cels)
  if (snapshot.layerMasks) {
    const timeline = ensureAnimationDocument(document)
    timeline.layerMasks = [
      ...(timeline.layerMasks ?? []).filter((entry) => entry.layerId !== snapshot.layerId),
      ...snapshot.layerMasks.map((entry) => ({
        layerId: entry.layerId,
        frameId: entry.frameId,
        mask: { ...entry.mask, pixels: new Uint8ClampedArray(entry.mask.pixels) }
      }))
    ]
  }
}

export const layerContentSnapshotBytes = (snapshot: LayerContentSnapshot): number => {
  const storage = new Set<object>()
  let bytes = 0
  for (const cel of snapshot.cels) {
    if (cel.surface) {
      const identity = rasterStorageIdentity(cel.surface)
      if (!storage.has(identity)) {
        storage.add(identity)
        const runtime = runtimeRasterForSurface(cel.surface)
        bytes += runtime ? runtime.data.byteLength + runtime.tileOffsets.byteLength : cel.surface.pixels.byteLength
      }
    }
  }
  for (const entry of snapshot.layerMasks ?? []) if (!storage.has(entry.mask.pixels)) {
    storage.add(entry.mask.pixels)
    bytes += entry.mask.pixels.byteLength
  }
  for (const tileset of snapshot.tilesets) if (!storage.has(tileset.pixels)) {
    storage.add(tileset.pixels)
    bytes += tileset.pixels.byteLength
  }
  return bytes + snapshot.cels.length * 64 + snapshot.palette.length * 32
}

export interface DocumentColorModeSnapshot {
  colorMode: ColorMode
  surfaces: DocumentImageResizeSnapshot
  palette: PaletteEntry[]
  paletteOrder: number[]
  paletteSlots?: Array<number | null>
  paletteColumns?: number
  nextColorId: number
}

export const captureDocumentColorModeSnapshot = (document: SpriteDocument): DocumentColorModeSnapshot => {
  const surfaces = captureDocumentImageResizeSnapshot(document)
  // Color conversion replaces or reuses raster storage. Keep an owned copy so
  // undo is independent from the buffers touched by the conversion itself.
  surfaces.surfaces = surfaces.surfaces.map((entry) => ({
    ...entry,
    storage: entry.storage.kind === 'pixels'
      ? { kind: 'pixels', pixels: entry.storage.pixels.slice() }
      : {
          kind: 'runtime',
          runtime: {
            ...entry.storage.runtime,
            data: entry.storage.runtime.data.slice(),
            tileOffsets: entry.storage.runtime.tileOffsets.slice()
          }
        }
  }))
  return {
    colorMode: document.colorMode,
    surfaces,
  palette: clonePalette(document.palette),
  paletteOrder: [...document.paletteOrder],
  paletteSlots: document.paletteSlots ? [...document.paletteSlots] : undefined,
  paletteColumns: document.paletteColumns,
  nextColorId: document.nextColorId
  }
}

export const restoreDocumentColorModeSnapshot = (document: SpriteDocument, snapshot: DocumentColorModeSnapshot): void => {
  document.colorMode = snapshot.colorMode
  document.palette = clonePalette(snapshot.palette)
  document.paletteOrder = [...snapshot.paletteOrder]
  document.paletteSlots = snapshot.paletteSlots ? [...snapshot.paletteSlots] : undefined
  document.paletteColumns = snapshot.paletteColumns
  document.nextColorId = snapshot.nextColorId
  restoreDocumentImageResizeSnapshot(document, snapshot.surfaces)
  refreshActiveAnimationFrame(document)
}

export const documentColorModeSnapshotBytes = (snapshot: DocumentColorModeSnapshot): number =>
  documentImageResizeSnapshotBytes(snapshot.surfaces) + snapshot.palette.length * 32

export interface DocumentCanvasResizeSnapshot {
  backgrounds: Array<{ layer: RasterLayer; settings: RasterLayer['background'] }>
  surfaces: DocumentImageResizeSnapshot
  cels: Array<{ celId: string; surface?: AnimationCel['surface']; tilemap?: AnimationCel['tilemap']; freeTiles?: AnimationCel['freeTiles'] }>
}

export const captureDocumentCanvasResizeSnapshot = (document: SpriteDocument): DocumentCanvasResizeSnapshot => ({
  backgrounds: document.layers.filter(layer => layer.background).map(layer => ({ layer, settings: { ...layer.background! } })),
  surfaces: captureDocumentImageResizeSnapshot(document),
  cels: (document.animation?.cels ?? []).map((cel) => ({
    celId: cel.id,
    surface: cel.surface,
    tilemap: cel.tilemap ? cloneTilemapCelData(cel.tilemap) : undefined,
    freeTiles: cel.freeTiles ? cloneFreeTileCelData(cel.freeTiles) : undefined
  }))
})

export const restoreDocumentCanvasResizeSnapshot = (document: SpriteDocument, snapshot: DocumentCanvasResizeSnapshot): void => {
  for (const { layer, settings } of snapshot.backgrounds) layer.background = settings ? { ...settings } : undefined
  const cels = new Map(snapshot.cels.map((entry) => [entry.celId, entry]))
  for (const cel of document.animation?.cels ?? []) {
    const state = cels.get(cel.id)
    if (!state) continue
    cel.surface = state.surface
    if (state.tilemap) cel.tilemap = cloneTilemapCelData(state.tilemap)
    else delete cel.tilemap
    if (state.freeTiles) cel.freeTiles = cloneFreeTileCelData(state.freeTiles)
    else delete cel.freeTiles
  }
  restoreDocumentImageResizeSnapshot(document, snapshot.surfaces)
}

export const documentCanvasResizeSnapshotBytes = (snapshot: DocumentCanvasResizeSnapshot): number =>
  documentImageResizeSnapshotBytes(snapshot.surfaces)
  + snapshot.cels.reduce((sum, entry) => sum + (entry.tilemap?.cells.length ?? 0) * 16 + (entry.freeTiles?.instances.length ?? 0) * 72 + 32, 0)
