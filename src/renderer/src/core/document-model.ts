import type { AnimationCel, AnimationCelSurface, AnimationTimeline } from '@shared/types-animation'
import type { CanvasAnchor, SelectionRect } from '@shared/types-selection'
import type { ColorMode, ImageResizeInterpolation, RuntimeRasterTiles } from '@shared/types-raster'
import type { FreeTileCelData, FreeTileSourceLayer, Tileset } from '@shared/types-tiles'
import type { IndexedLayer, LayerGroup, LayerMask, RasterLayer, RgbaLayer } from '@shared/types-layer'
import type { PaletteEntry, RgbaColor } from '@shared/types-color'
import type { SpriteDocument } from '@shared/types-document'
import { colorEquals, packColor, readRgbaPixel, relativeLuminanceColor, TRANSPARENT, unpackColor, writeRgbaPixel } from './raster'
import { translateCurrent as tr } from './localization'
import { DEFAULT_PROJECT_DISPLAY_SETTINGS, DEFAULT_PROJECT_STATISTICS, DEFAULT_TIMELAPSE_SETTINGS } from './project-metadata'
import { addPaletteIdToSlots, normalizePaletteColumns, normalizePaletteSlots, paletteOrderFromSlots, PALETTE_GRID_COLUMNS } from './palette-layout'
import { cachedRuntimeRasterVisibleBounds, detachRuntimeRaster, installRuntimeRaster, lazyRuntimeRasterForSurface, rasterStorageIdentity, readSurfacePackedLocal, runtimeRasterVisibleBounds } from './runtime-raster'
import { cloneLayerStyles } from './layer-styles'
import { backgroundPatternSize, tileBackgroundSurfaceToCanvas } from './background-patterns'
import { quantizePixelColor } from './pixel-format'

let sequence = 0

const layerStorageOrigins = new WeakMap<RasterLayer, { x: number; y: number }>()

const rasterContentRevisions = new WeakMap<object, number>()

export const createId = (prefix: string): string => `${prefix}-${Date.now().toString(36)}-${(++sequence).toString(36)}`

const transparentEntry = (): PaletteEntry => ({ id: 0, name: tr('core.document.transparentColor'), color: TRANSPARENT })

const maskGray = (color: RgbaColor): number => Math.max(0, Math.min(255, Math.round((color.r * 2126 + color.g * 7152 + color.b * 722) / 10000)))

export const maskCoverageFromColor = (color: RgbaColor): number => color.a === 0 ? 255 : Math.round(255 + (maskGray(color) - 255) * color.a / 255)

const normalizedMaskColor = (color: RgbaColor): RgbaColor => color.a === 0
  ? TRANSPARENT
  : { r: maskCoverageFromColor(color), g: maskCoverageFromColor(color), b: maskCoverageFromColor(color), a: 255 }

export const layerMaskDisplayColor = (color: RgbaColor): RgbaColor => {
  const value = maskCoverageFromColor(color)
  return { r: value, g: value, b: value, a: 255 }
}

const maskPacked = (color: RgbaColor): number => {
  const normalized = normalizedMaskColor(color)
  return (normalized.r | (normalized.g << 8) | (normalized.b << 16) | (normalized.a << 24)) >>> 0
}

export function createLayerMask(ownerId: string, width: number, height: number, ownerKind: LayerMask['ownerKind'] = 'cel'): LayerMask {
  const pixels = new Uint8ClampedArray(width * height * 4)
  return {
    id: createId('mask'),
    name: tr(ownerKind === 'group' ? 'core.document.layerGroupMask' : 'core.document.layerMask'),
    description: '',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    width,
    height,
    offsetX: 0,
    offsetY: 0,
    format: 'rgba',
    pixels,
    ownerKind,
    ownerId,
    moveWithOwner: true
  }
}

export const isLayerMask = (surface: RasterLayer): surface is LayerMask => 'ownerKind' in surface && 'ownerId' in surface

export const layerMasks = (document: SpriteDocument): LayerMask[] => document.animation
  ? [...(document.animation.layerMasks ?? []).map((entry) => entry.mask), ...(document.animation.groupMasks ?? []).map((entry) => entry.mask)]
  : []

export const findLayerMask = (document: SpriteDocument, id: string): LayerMask | null => layerMasks(document).find((mask) => mask.id === id) ?? null

export const animationMaskSlotAt = (timeline: AnimationTimeline, ownerId: string, frameId: string): LayerMask | null => {
  const layerMask = (timeline.layerMasks ?? []).find((entry) => entry.layerId === ownerId && entry.frameId === frameId)?.mask
  if (layerMask) return layerMask
  return (timeline.groupMasks ?? []).find((entry) => entry.groupId === ownerId && entry.frameId === frameId)?.mask ?? null
}

export const resolveAnimationMask = (timeline: AnimationTimeline, mask: LayerMask | null): LayerMask | null => {
  if (!mask?.linkedMaskId) return mask
  const byId = new Map([...(timeline.layerMasks ?? []).map((entry) => entry.mask), ...(timeline.groupMasks ?? []).map((entry) => entry.mask)].map((candidate) => [candidate.id, candidate]))
  const visited = new Set<string>()
  let current = mask
  while (current.linkedMaskId) {
    if (visited.has(current.id)) return mask
    visited.add(current.id)
    const linked = byId.get(current.linkedMaskId)
    if (!linked) return mask
    current = linked
  }
  return current
}

/** Build a single-pass lookup of resolved animation masks by owner/frame key. */
export const createAnimationMaskLookup = (timeline: AnimationTimeline): Map<string, LayerMask> => {
  const byId = new Map<string, LayerMask>()
  for (const entry of timeline.layerMasks ?? []) byId.set(entry.mask.id, entry.mask)
  for (const entry of timeline.groupMasks ?? []) byId.set(entry.mask.id, entry.mask)
  const resolve = (mask: LayerMask): LayerMask => {
    if (!mask.linkedMaskId) return mask
    const visited = new Set<string>()
    let current = mask
    while (current.linkedMaskId) {
      if (visited.has(current.id)) return mask
      visited.add(current.id)
      const linked = byId.get(current.linkedMaskId)
      if (!linked) return mask
      current = linked
    }
    return current
  }
  const result = new Map<string, LayerMask>()
  for (const entry of timeline.layerMasks ?? []) result.set(`${entry.layerId}:${entry.frameId}`, resolve(entry.mask))
  for (const entry of timeline.groupMasks ?? []) result.set(`${entry.groupId}:${entry.frameId}`, resolve(entry.mask))
  return result
}

export const animationMaskAt = (timeline: AnimationTimeline, ownerId: string, frameId: string): LayerMask | null =>
  resolveAnimationMask(timeline, animationMaskSlotAt(timeline, ownerId, frameId))

export type LayerMaskOwner =
  | { kind: 'cel'; frameId: string; layerId: string; cel: AnimationCel }
  | { kind: 'group'; frameId: string; groupId: string; group: LayerGroup }

export const getLayerMaskOwner = (document: SpriteDocument, mask: LayerMask): LayerMaskOwner | null => {
  if (mask.ownerKind === 'group') {
    const entry = document.animation?.groupMasks?.find((candidate) => candidate.mask.id === mask.id)
    const group = entry ? document.groups.find((candidate) => candidate.id === entry.groupId) : null
    return entry && group ? { kind: 'group', frameId: entry.frameId, groupId: group.id, group } : null
  }
  const entry = document.animation?.layerMasks?.find((candidate) => candidate.mask.id === mask.id)
  const cel = entry ? document.animation?.cels.find((candidate) => candidate.layerId === entry.layerId && candidate.frameId === entry.frameId) : null
  return entry && cel ? { kind: 'cel', frameId: entry.frameId, layerId: entry.layerId, cel } : null
}

export const readLayerMaskDisplayColorAt = (mask: LayerMask, x: number, y: number): RgbaColor => {
  const index = layerIndexAt(mask, x, y)
  return index === null ? { r: 255, g: 255, b: 255, a: 255 } : layerMaskDisplayColor(readRgbaPixel(mask.pixels, index))
}

/** Renders a mask as an isolated white-backed grayscale surface for mask editing. */
export const renderLayerMaskRegion = (mask: LayerMask, x: number, y: number, width: number, height: number): Uint8ClampedArray => {
  const outputWidth = Math.max(0, Math.trunc(width))
  const outputHeight = Math.max(0, Math.trunc(height))
  const output = new Uint8ClampedArray(outputWidth * outputHeight * 4)
  for (let localY = 0; localY < outputHeight; localY += 1) for (let localX = 0; localX < outputWidth; localX += 1) {
    const color = readLayerMaskDisplayColorAt(mask, Math.trunc(x) + localX, Math.trunc(y) + localY)
    const offset = (localY * outputWidth + localX) * 4
    output[offset] = color.r
    output[offset + 1] = color.g
    output[offset + 2] = color.b
    output[offset + 3] = 255
  }
  return output
}

export function createLayer(name: string, width: number, height: number, mode: ColorMode): RasterLayer {
  const common = { id: createId('layer'), name, description: '', visible: true, locked: false, opacity: 1, blendMode: 'normal' as const, width, height, offsetX: 0, offsetY: 0 }
  return mode === 'indexed'
    ? { ...common, format: 'indexed', pixels: new Uint32Array(width * height) }
    : { ...common, format: 'rgba', pixels: new Uint8ClampedArray(width * height * 4) }
}

const sparseBlankLayers = new WeakSet<RasterLayer>()

/** Creates a blank layer without reserving a full-canvas bitmap before its first edit. */
export function createSparseLayer(name: string, mode: ColorMode): RasterLayer {
  const layer = createLayer(name, 1, 1, mode)
  sparseBlankLayers.add(layer)
  return layer
}

export function createDocument(name: string, width: number, height: number, colorMode: ColorMode, timelapseEnabled = DEFAULT_TIMELAPSE_SETTINGS.enabled, pixelFormat: SpriteDocument['pixelFormat'] = colorMode === 'rgba' ? 'rgba32' : undefined): SpriteDocument {
  const layer = createLayer(tr('core.document.defaultLayer', { index: 1 }), width, height, colorMode)
  const palette = colorMode === 'indexed'
    ? [transparentEntry(), { id: 1, name: tr('core.document.inkBlack'), color: { r: 24, g: 27, b: 33, a: 255 } }, { id: 2, name: tr('core.document.moonBlue'), color: { r: 41, g: 121, b: 255, a: 255 } }]
    : colorMode === 'grayscale'
      ? [{ id: 1, name: tr('core.document.inkBlack'), color: { r: 24, g: 24, b: 24, a: 255 } }, { id: 2, name: tr('core.document.colorName', { id: 2 }), color: { r: 255, g: 255, b: 255, a: 255 } }]
      : [{ id: 1, name: tr('core.document.inkBlack'), color: { r: 24, g: 27, b: 33, a: 255 } }, { id: 2, name: tr('core.document.moonBlue'), color: { r: 41, g: 121, b: 255, a: 255 } }]
  const now = new Date().toISOString()
  const frameId = 'frame-1'
  const initialSurface = layer.format === 'rgba'
    ? { format: 'rgba' as const, width, height, offsetX: 0, offsetY: 0, pixels: layer.pixels }
    : { format: 'indexed' as const, width, height, offsetX: 0, offsetY: 0, pixels: layer.pixels }
  return {
    schemaVersion: 18,
    id: createId('doc'),
    name,
    width,
    height,
    colorMode,
    pixelFormat: colorMode === 'rgba' ? pixelFormat : undefined,
    layers: [layer],
    groups: [],
    activeLayerId: layer.id,
    palette,
    paletteOrder: palette.map((entry) => entry.id),
    paletteSlots: normalizePaletteSlots(palette.map((entry) => entry.id), palette.map((entry) => entry.id)),
    paletteColumns: PALETTE_GRID_COLUMNS,
    nextColorId: 3,
    customBrushes: [],
    tilesets: [],
    animation: { frames: [{ id: frameId, duration: 100 }], cels: [{ id: createId('cel'), layerId: layer.id, frameId, opacity: layer.opacity, surface: initialSurface }], layerMasks: [], groupMasks: [], loopSections: [], activeFrameId: frameId, loop: true },
    displaySettings: { ...DEFAULT_PROJECT_DISPLAY_SETTINGS, grid: { ...DEFAULT_PROJECT_DISPLAY_SETTINGS.grid }, symmetryCenter: { x: width / 2, y: height / 2 } },
    statistics: { ...DEFAULT_PROJECT_STATISTICS },
    timelapse: { ...DEFAULT_TIMELAPSE_SETTINGS, enabled: timelapseEnabled, snapshots: [] },
    slices: [],
    filePath: null,
    dirty: false,
    createdAt: now,
    updatedAt: now
  }
}

export function resizeDocumentAt(document: SpriteDocument, width: number, height: number, offsetX: number, offsetY: number, trimOutside = false): { offsetX: number; offsetY: number } {
  const horizontal = Math.trunc(offsetX)
  const vertical = Math.trunc(offsetY)
  const sourceWidth = document.width
  const sourceHeight = document.height
  for (const layer of document.layers) {
    if (layer.background) {
      if (layer.background.mode === 'canvas' && !layer.background.repeatWidth) layer.background = { ...layer.background, repeatWidth: sourceWidth, repeatHeight: sourceHeight }
      const repeatSize = layer.background.mode === 'preset' && layer.background.pattern ? backgroundPatternSize(layer.background.pattern) : { width: layer.background.repeatWidth!, height: layer.background.repeatHeight! }
      const presetPattern = layer.background.mode === 'preset' ? layer.background.pattern : undefined
      tileBackgroundSurfaceToCanvas(layer, sourceWidth, sourceHeight, width, height, horizontal, vertical, repeatSize, presetPattern, (color) => paletteColorIdForCanvas(document, color))
      setLayerStorageOrigin(layer, { x: 0, y: 0 })
      continue
    }
    // Layers are independent bitmaps. Changing the canvas only changes the
    // viewport; keeping their local pixels preserves content beyond its edges.
    layer.offsetX += horizontal
    layer.offsetY += vertical
  }
  for (const mask of layerMasks(document)) {
    mask.offsetX += horizontal
    mask.offsetY += vertical
  }
  document.width = width
  document.height = height
  if (trimOutside) cropLayersToCanvas(document)
  return { offsetX: horizontal, offsetY: vertical }
}

/** Permanently discards every stored layer pixel outside the current canvas. */
export function cropLayersToCanvas(document: SpriteDocument): void {
  for (const layer of [...document.layers, ...layerMasks(document)]) {
    // A repeating background retains a complete unit even when its viewport is cropped.
    if (!isLayerMask(layer) && layer.background) continue
    if (!isLayerMask(layer) && (layer.kind === 'tilemap' || layer.kind === 'free-tile')) continue
    const left = Math.max(0, layer.offsetX)
    const top = Math.max(0, layer.offsetY)
    const right = Math.min(document.width, layer.offsetX + layer.width)
    const bottom = Math.min(document.height, layer.offsetY + layer.height)
    const sourceX = left - layer.offsetX
    const sourceY = top - layer.offsetY
    const nextWidth = right - left
    const nextHeight = bottom - top
    const storageOrigin = layerStorageOrigins.get(layer) ?? { x: 0, y: 0 }
    if (nextWidth <= 0 || nextHeight <= 0) {
      layer.pixels = isLayerMask(layer)
        ? new Uint8ClampedArray(4)
        : layer.format === 'rgba' ? new Uint8ClampedArray(4) : new Uint32Array(1)
      layer.width = 1
      layer.height = 1
      layer.offsetX = 0
      layer.offsetY = 0
      layerStorageOrigins.set(layer, { x: storageOrigin.x + sourceX, y: storageOrigin.y + sourceY })
      continue
    }
    if (left === layer.offsetX && top === layer.offsetY && nextWidth === layer.width && nextHeight === layer.height) continue
    if (layer.format === 'rgba') {
      const pixels = new Uint8ClampedArray(nextWidth * nextHeight * 4)
      for (let y = 0; y < nextHeight; y += 1) {
        const sourceOffset = ((sourceY + y) * layer.width + sourceX) * 4
        pixels.set(layer.pixels.subarray(sourceOffset, sourceOffset + nextWidth * 4), y * nextWidth * 4)
      }
      layer.pixels = pixels
    } else {
      const pixels = new Uint32Array(nextWidth * nextHeight)
      for (let y = 0; y < nextHeight; y += 1) {
        const sourceOffset = (sourceY + y) * layer.width + sourceX
        pixels.set(layer.pixels.subarray(sourceOffset, sourceOffset + nextWidth), y * nextWidth)
      }
      layer.pixels = pixels
    }
    layer.width = nextWidth
    layer.height = nextHeight
    layer.offsetX = left
    layer.offsetY = top
    layerStorageOrigins.set(layer, { x: storageOrigin.x + sourceX, y: storageOrigin.y + sourceY })
  }
}

export function resizeDocument(document: SpriteDocument, width: number, height: number, anchor: CanvasAnchor): { offsetX: number; offsetY: number } {
  const horizontal = anchor === 'nw' || anchor === 'w' || anchor === 'sw' ? 0 : anchor === 'ne' || anchor === 'e' || anchor === 'se' ? width - document.width : Math.floor((width - document.width) / 2)
  const vertical = anchor === 'nw' || anchor === 'n' || anchor === 'ne' ? 0 : anchor === 'sw' || anchor === 's' || anchor === 'se' ? height - document.height : Math.floor((height - document.height) / 2)
  return resizeDocumentAt(document, width, height, horizontal, vertical)
}

const clampIndex = (value: number, maximum: number): number => Math.max(0, Math.min(maximum - 1, value))

type ImageResizeSurface = RasterLayer | AnimationCelSurface

type ImageResizePixels = Uint8ClampedArray | Uint32Array

interface ImageResizeSurfaceSnapshot {
  surface: ImageResizeSurface
  format: ImageResizeSurface['format']
  width: number
  height: number
  offsetX: number
  offsetY: number
  storageOriginX: number
  storageOriginY: number
  storage: { kind: 'runtime'; runtime: RuntimeRasterTiles } | { kind: 'pixels'; pixels: ImageResizePixels }
}

export interface DocumentImageResizeSnapshot {
  width: number
  height: number
  surfaces: ImageResizeSurfaceSnapshot[]
  freeTileCels: Array<{ freeTiles: FreeTileCelData; instances: FreeTileCelData['instances'] }>
  freeTileTilesets: Array<{
    tileset: Tileset
    tileWidth: number
    tileHeight: number
    columns: number
    rows: number
    pixels: Uint8ClampedArray
  }>
  freeTileSources: Array<{ source: FreeTileSourceLayer; offsetX: number; offsetY: number }>
}

const documentImageResizeSurfaces = (document: SpriteDocument): ImageResizeSurface[] => {
  const surfaces: ImageResizeSurface[] = []
  const seen = new Set<object>()
  const add = (surface: ImageResizeSurface | null | undefined): void => {
    if (!surface || seen.has(surface)) return
    seen.add(surface)
    surfaces.push(surface)
  }
  for (const layer of document.layers) add(layer)
  for (const cel of document.animation?.cels ?? []) add(cel.surface)
  for (const mask of layerMasks(document)) add(mask)
  return surfaces
}

const surfaceStorageOrigin = (surface: ImageResizeSurface): { x: number; y: number } =>
  'id' in surface
    ? getLayerStorageOrigin(surface)
    : { x: surface.storageOriginX ?? 0, y: surface.storageOriginY ?? 0 }

const setSurfaceStorageOrigin = (surface: ImageResizeSurface, x: number, y: number): void => {
  if ('id' in surface) setLayerStorageOrigin(surface, { x, y })
  else {
    surface.storageOriginX = Math.trunc(x)
    surface.storageOriginY = Math.trunc(y)
  }
}

export const captureDocumentImageResizeSnapshot = (document: SpriteDocument): DocumentImageResizeSnapshot => {
  const freeTileLayers = document.layers.filter((layer) => layer.kind === 'free-tile')
  const freeTileTilesetIds = new Set(freeTileLayers.flatMap((layer) => layer.kind === 'free-tile'
    ? layer.freeTileSources?.map((source) => source.tilesetId) ?? (layer.freeTileTilesetId ? [layer.freeTileTilesetId] : [])
    : []))
  const seenFreeTiles = new Set<FreeTileCelData>()
  return {
    width: document.width,
    height: document.height,
    surfaces: documentImageResizeSurfaces(document).map((surface) => {
      const origin = surfaceStorageOrigin(surface)
      const runtime = lazyRuntimeRasterForSurface(surface)
      return {
        surface,
        format: surface.format,
        width: surface.width,
        height: surface.height,
        offsetX: surface.offsetX,
        offsetY: surface.offsetY,
        storageOriginX: origin.x,
        storageOriginY: origin.y,
        storage: runtime ? { kind: 'runtime', runtime } : { kind: 'pixels', pixels: surface.pixels }
      }
    }),
    freeTileCels: (document.animation?.cels ?? []).flatMap((cel) => {
      if (!cel.freeTiles || seenFreeTiles.has(cel.freeTiles)) return []
      seenFreeTiles.add(cel.freeTiles)
      return [{ freeTiles: cel.freeTiles, instances: cel.freeTiles.instances.map((instance) => ({ ...instance })) }]
    }),
    freeTileTilesets: (document.tilesets ?? []).flatMap((tileset) => freeTileTilesetIds.has(tileset.id) ? [{
      tileset,
      tileWidth: tileset.tileWidth,
      tileHeight: tileset.tileHeight,
      columns: tileset.columns,
      rows: tileset.rows,
      pixels: tileset.pixels
    }] : []),
    freeTileSources: freeTileLayers.flatMap((layer) => layer.kind === 'free-tile'
      ? (layer.freeTileSources ?? []).map((source) => ({ source, offsetX: source.offsetX, offsetY: source.offsetY }))
      : [])
  }
}

export const restoreDocumentImageResizeSnapshot = (document: SpriteDocument, snapshot: DocumentImageResizeSnapshot): void => {
  document.width = snapshot.width
  document.height = snapshot.height
  for (const state of snapshot.freeTileCels) state.freeTiles.instances = state.instances.map((instance) => ({ ...instance }))
  for (const state of snapshot.freeTileTilesets) {
    state.tileset.tileWidth = state.tileWidth
    state.tileset.tileHeight = state.tileHeight
    state.tileset.columns = state.columns
    state.tileset.rows = state.rows
    state.tileset.pixels = state.pixels
  }
  for (const state of snapshot.freeTileSources) {
    state.source.offsetX = state.offsetX
    state.source.offsetY = state.offsetY
  }
  for (const state of snapshot.surfaces) {
    const surface = state.surface
    surface.format = state.format
    surface.width = state.width
    surface.height = state.height
    surface.offsetX = state.offsetX
    surface.offsetY = state.offsetY
    setSurfaceStorageOrigin(surface, state.storageOriginX, state.storageOriginY)
    if (state.storage.kind === 'runtime') installRuntimeRaster(surface, state.storage.runtime)
    else if (state.format === 'rgba') surface.pixels = state.storage.pixels as Uint8ClampedArray
    else surface.pixels = state.storage.pixels as Uint32Array
  }
}

export const documentImageResizeSnapshotBytes = (snapshot: DocumentImageResizeSnapshot): number => {
  const seen = new Set<object>()
  let bytes = 0
  for (const state of snapshot.surfaces) {
    const storage = state.storage.kind === 'runtime' ? state.storage.runtime : state.storage.pixels
    if (seen.has(storage)) continue
    seen.add(storage)
    bytes += state.storage.kind === 'runtime'
      ? state.storage.runtime.data.byteLength + state.storage.runtime.tileOffsets.byteLength
      : state.storage.pixels.byteLength
  }
  for (const state of snapshot.freeTileTilesets) if (!seen.has(state.pixels)) {
    seen.add(state.pixels)
    bytes += state.pixels.byteLength
  }
  bytes += snapshot.freeTileCels.reduce((sum, state) => sum + state.instances.length * 72, 0)
  return bytes + snapshot.surfaces.length * 64 + snapshot.freeTileTilesets.length * 48 + snapshot.freeTileSources.length * 24 + snapshot.freeTileCels.length * 24 + 16
}

const writeRgbaResizePixel = (
  target: Uint8ClampedArray,
  offset: number,
  red: number,
  green: number,
  blue: number,
  alpha: number,
  normalizeMask: boolean
): void => {
  if (!normalizeMask) {
    target[offset] = red
    target[offset + 1] = green
    target[offset + 2] = blue
    target[offset + 3] = alpha
    return
  }
  if (alpha === 0) {
    target[offset] = 0
    target[offset + 1] = 0
    target[offset + 2] = 0
    target[offset + 3] = 0
    return
  }
  const gray = Math.max(0, Math.min(255, Math.round((red * 2126 + green * 7152 + blue * 722) / 10000)))
  const coverage = Math.round(255 + (gray - 255) * alpha / 255)
  target[offset] = coverage
  target[offset + 1] = coverage
  target[offset + 2] = coverage
  target[offset + 3] = 255
}

const resizeSurfacePixels = (
  surface: ImageResizeSurface,
  targetWidth: number,
  targetHeight: number,
  targetOffsetX: number,
  targetOffsetY: number,
  scaleX: number,
  scaleY: number,
  interpolation: ImageResizeInterpolation,
  normalizeMask: boolean
): ImageResizePixels => {
  const sourceWidth = surface.width
  const sourceHeight = surface.height
  const sourceOffsetX = surface.offsetX
  const sourceOffsetY = surface.offsetY
  const lazyRuntime = lazyRuntimeRasterForSurface(surface)

  if (surface.format === 'indexed') {
    const sourceX = new Int32Array(targetWidth)
    const sourceY = new Int32Array(targetHeight)
    for (let x = 0; x < targetWidth; x += 1) sourceX[x] = clampIndex(Math.floor((targetOffsetX + x + 0.5) / scaleX - sourceOffsetX), sourceWidth)
    for (let y = 0; y < targetHeight; y += 1) sourceY[y] = clampIndex(Math.floor((targetOffsetY + y + 0.5) / scaleY - sourceOffsetY), sourceHeight)
    const target = new Uint32Array(targetWidth * targetHeight)
    if (lazyRuntime) {
      for (let y = 0; y < targetHeight; y += 1) {
        const targetRow = y * targetWidth
        const sourceRow = sourceY[y]
        for (let x = 0; x < targetWidth; x += 1) target[targetRow + x] = readSurfacePackedLocal(surface, sourceX[x], sourceRow)
      }
      return target
    }
    const source = surface.pixels
    for (let y = 0; y < targetHeight; y += 1) {
      const targetRow = y * targetWidth
      const sourceRow = sourceY[y] * sourceWidth
      for (let x = 0; x < targetWidth; x += 1) target[targetRow + x] = source[sourceRow + sourceX[x]] ?? 0
    }
    return target
  }

  const target = new Uint8ClampedArray(targetWidth * targetHeight * 4)
  if (interpolation !== 'smooth') {
    const sourceX = new Int32Array(targetWidth)
    const sourceY = new Int32Array(targetHeight)
    for (let x = 0; x < targetWidth; x += 1) sourceX[x] = clampIndex(Math.floor((targetOffsetX + x + 0.5) / scaleX - sourceOffsetX), sourceWidth)
    for (let y = 0; y < targetHeight; y += 1) sourceY[y] = clampIndex(Math.floor((targetOffsetY + y + 0.5) / scaleY - sourceOffsetY), sourceHeight)
    if (lazyRuntime) {
      for (let y = 0; y < targetHeight; y += 1) for (let x = 0; x < targetWidth; x += 1) {
        const packed = readSurfacePackedLocal(surface, sourceX[x], sourceY[y])
        writeRgbaResizePixel(target, (y * targetWidth + x) * 4, packed & 0xff, (packed >>> 8) & 0xff, (packed >>> 16) & 0xff, (packed >>> 24) & 0xff, normalizeMask)
      }
      return target
    }
    const source = surface.pixels
    for (let y = 0; y < targetHeight; y += 1) {
      const sourceRow = sourceY[y] * sourceWidth
      for (let x = 0; x < targetWidth; x += 1) {
        const sourcePixel = (sourceRow + sourceX[x]) * 4
        writeRgbaResizePixel(target, (y * targetWidth + x) * 4, source[sourcePixel], source[sourcePixel + 1], source[sourcePixel + 2], source[sourcePixel + 3], normalizeMask)
      }
    }
    return target
  }

  const left = new Int32Array(targetWidth)
  const right = new Int32Array(targetWidth)
  const fractionX = new Float64Array(targetWidth)
  const top = new Int32Array(targetHeight)
  const bottom = new Int32Array(targetHeight)
  const fractionY = new Float64Array(targetHeight)
  for (let x = 0; x < targetWidth; x += 1) {
    const value = (targetOffsetX + x + 0.5) / scaleX - sourceOffsetX - 0.5
    const floor = Math.floor(value)
    left[x] = clampIndex(floor, sourceWidth)
    right[x] = clampIndex(floor + 1, sourceWidth)
    fractionX[x] = value - floor
  }
  for (let y = 0; y < targetHeight; y += 1) {
    const value = (targetOffsetY + y + 0.5) / scaleY - sourceOffsetY - 0.5
    const floor = Math.floor(value)
    top[y] = clampIndex(floor, sourceHeight)
    bottom[y] = clampIndex(floor + 1, sourceHeight)
    fractionY[y] = value - floor
  }

  const packedAt = lazyRuntime
    ? (x: number, y: number): number => readSurfacePackedLocal(surface, x, y)
    : (x: number, y: number): number => {
        const offset = (y * sourceWidth + x) * 4
        const source = surface.pixels
        return (source[offset] | (source[offset + 1] << 8) | (source[offset + 2] << 16) | (source[offset + 3] << 24)) >>> 0
      }
  for (let y = 0; y < targetHeight; y += 1) for (let x = 0; x < targetWidth; x += 1) {
    const topLeft = packedAt(left[x], top[y])
    const topRight = packedAt(right[x], top[y])
    const bottomLeft = packedAt(left[x], bottom[y])
    const bottomRight = packedAt(right[x], bottom[y])
    const fx = fractionX[x]
    const fy = fractionY[y]
    const redTop = (topLeft & 0xff) + ((topRight & 0xff) - (topLeft & 0xff)) * fx
    const redBottom = (bottomLeft & 0xff) + ((bottomRight & 0xff) - (bottomLeft & 0xff)) * fx
    const greenTop = ((topLeft >>> 8) & 0xff) + (((topRight >>> 8) & 0xff) - ((topLeft >>> 8) & 0xff)) * fx
    const greenBottom = ((bottomLeft >>> 8) & 0xff) + (((bottomRight >>> 8) & 0xff) - ((bottomLeft >>> 8) & 0xff)) * fx
    const blueTop = ((topLeft >>> 16) & 0xff) + (((topRight >>> 16) & 0xff) - ((topLeft >>> 16) & 0xff)) * fx
    const blueBottom = ((bottomLeft >>> 16) & 0xff) + (((bottomRight >>> 16) & 0xff) - ((bottomLeft >>> 16) & 0xff)) * fx
    const alphaTop = ((topLeft >>> 24) & 0xff) + (((topRight >>> 24) & 0xff) - ((topLeft >>> 24) & 0xff)) * fx
    const alphaBottom = ((bottomLeft >>> 24) & 0xff) + (((bottomRight >>> 24) & 0xff) - ((bottomLeft >>> 24) & 0xff)) * fx
    writeRgbaResizePixel(
      target,
      (y * targetWidth + x) * 4,
      Math.round(redTop + (redBottom - redTop) * fy),
      Math.round(greenTop + (greenBottom - greenTop) * fy),
      Math.round(blueTop + (blueBottom - blueTop) * fy),
      Math.round(alphaTop + (alphaBottom - alphaTop) * fy),
      normalizeMask
    )
  }
  return target
}

export function resizeDocumentImage(document: SpriteDocument, width: number, height: number, interpolation: ImageResizeInterpolation = 'nearest'): void {
  const sourceWidth = document.width
  const sourceHeight = document.height
  if (width === sourceWidth && height === sourceHeight) return
  const scaleX = width / sourceWidth
  const scaleY = height / sourceHeight
  const groups = new Map<object, Map<string, ImageResizeSurface[]>>()
  for (const surface of documentImageResizeSurfaces(document)) {
    const storage = rasterStorageIdentity(surface)
    const byGeometry = groups.get(storage) ?? new Map<string, ImageResizeSurface[]>()
    const key = `${surface.format}:${surface.width}:${surface.height}:${surface.offsetX}:${surface.offsetY}:${isLayerMask(surface as RasterLayer) ? 'mask' : 'image'}`
    const members = byGeometry.get(key) ?? []
    members.push(surface)
    byGeometry.set(key, members)
    groups.set(storage, byGeometry)
  }
  for (const byGeometry of groups.values()) for (const members of byGeometry.values()) {
    const layer = members[0]
    const sourceLayerWidth = layer.width
    const sourceLayerHeight = layer.height
    const sourceOffsetX = layer.offsetX
    const sourceOffsetY = layer.offsetY
    const targetOffsetX = Math.floor(sourceOffsetX * scaleX)
    const targetOffsetY = Math.floor(sourceOffsetY * scaleY)
    const targetRight = Math.ceil((sourceOffsetX + sourceLayerWidth) * scaleX)
    const targetBottom = Math.ceil((sourceOffsetY + sourceLayerHeight) * scaleY)
    const targetWidth = Math.max(1, targetRight - targetOffsetX)
    const targetHeight = Math.max(1, targetBottom - targetOffsetY)
    const target = resizeSurfacePixels(layer, targetWidth, targetHeight, targetOffsetX, targetOffsetY, scaleX, scaleY, interpolation, isLayerMask(layer as RasterLayer))
    for (const member of members) {
      member.width = targetWidth
      member.height = targetHeight
      member.offsetX = targetOffsetX
      member.offsetY = targetOffsetY
      setSurfaceStorageOrigin(member, 0, 0)
      if (member.format === 'rgba') member.pixels = target as Uint8ClampedArray
      else member.pixels = target as Uint32Array
    }
  }
  document.width = width
  document.height = height
}

export const getActiveLayer = (document: SpriteDocument): RasterLayer => {
  const layer = document.layers.find((candidate) => candidate.id === document.activeLayerId)
  if (!layer) throw new Error(tr('core.document.activeLayerMissing'))
  return layer
}

export const getLayer = (document: SpriteDocument, id: string): RasterLayer => {
  const layer = document.layers.find((candidate) => candidate.id === id) ?? findLayerMask(document, id)
  if (!layer) throw new Error(tr('core.document.layerMissing'))
  return layer
}

export const getGroup = (document: SpriteDocument, id: string): LayerGroup => {
  const group = document.groups.find((candidate) => candidate.id === id)
  if (!group) throw new Error(tr('core.document.groupMissing'))
  return group
}

export const getDescendantGroupIds = (document: SpriteDocument, groupId: string): string[] => {
  const descendants: string[] = []
  const pending = [groupId]
  const visited = new Set<string>(pending)
  while (pending.length > 0) {
    const parentId = pending.shift()!
    for (const group of document.groups) {
      if (group.parentGroupId !== parentId || visited.has(group.id)) continue
      visited.add(group.id)
      descendants.push(group.id)
      pending.push(group.id)
    }
  }
  return descendants
}

export const getLayerIdsInGroup = (document: SpriteDocument, groupId: string): string[] => {
  const groupIds = new Set([groupId, ...getDescendantGroupIds(document, groupId)])
  return document.layers.filter((layer) => Boolean(layer.groupId && groupIds.has(layer.groupId))).map((layer) => layer.id)
}

export const getLayerLockingGroup = (document: SpriteDocument, layer: RasterLayer): LayerGroup | null => {
  const visited = new Set<string>()
  let groupId = layer.groupId ?? null
  while (groupId && !visited.has(groupId)) {
    visited.add(groupId)
    const group = document.groups.find((candidate) => candidate.id === groupId)
    if (!group) return null
    if (group.locked) return group
    groupId = group.parentGroupId ?? null
  }
  return null
}

export const getGroupLockingAncestor = (document: SpriteDocument, group: LayerGroup): LayerGroup | null => {
  const visited = new Set<string>([group.id])
  let groupId = group.parentGroupId ?? null
  while (groupId && !visited.has(groupId)) {
    visited.add(groupId)
    const parent = document.groups.find((candidate) => candidate.id === groupId)
    if (!parent) return null
    if (parent.locked) return parent
    groupId = parent.parentGroupId ?? null
  }
  return null
}

export const isGroupEffectivelyVisible = (document: SpriteDocument, group: LayerGroup): boolean => {
  if (!group.visible) return false
  const visited = new Set<string>([group.id])
  let groupId = group.parentGroupId ?? null
  while (groupId && !visited.has(groupId)) {
    visited.add(groupId)
    const parent = document.groups.find((candidate) => candidate.id === groupId)
    if (!parent) return true
    if (!parent.visible) return false
    groupId = parent.parentGroupId ?? null
  }
  return true
}

export const isLayerEffectivelyLocked = (document: SpriteDocument, layer: RasterLayer): boolean => {
  if (!isLayerMask(layer)) return layer.locked || Boolean(getLayerLockingGroup(document, layer))
  const owner = getLayerMaskOwner(document, layer)
  if (layer.locked) return true
  if (owner?.kind === 'group') return isGroupEffectivelyLocked(document, owner.group)
  const ownerLayer = owner ? document.layers.find((candidate) => candidate.id === owner.layerId) : null
  return !ownerLayer || isLayerEffectivelyLocked(document, ownerLayer)
}

export const isGroupEffectivelyLocked = (document: SpriteDocument, group: LayerGroup): boolean => group.locked || Boolean(getGroupLockingAncestor(document, group))

export const isLayerEffectivelyVisible = (document: SpriteDocument, layer: RasterLayer): boolean => {
  if (isLayerMask(layer)) {
    const owner = getLayerMaskOwner(document, layer)
    if (owner?.kind === 'group') return isGroupEffectivelyVisible(document, owner.group)
    const ownerLayer = owner ? document.layers.find((candidate) => candidate.id === owner.layerId) : null
    return Boolean(ownerLayer && isLayerEffectivelyVisible(document, ownerLayer))
  }
  if (!layer.visible) return false
  const visited = new Set<string>()
  let groupId = layer.groupId ?? null
  while (groupId && !visited.has(groupId)) {
    visited.add(groupId)
    const group = document.groups.find((candidate) => candidate.id === groupId)
    if (!group) return true
    if (!group.visible) return false
    groupId = group.parentGroupId ?? null
  }
  return true
}

export const getPaletteEntry = (document: SpriteDocument, id: number): PaletteEntry => document.palette.find((entry) => entry.id === id) ?? transparentEntry()

export function findOrAddPaletteColor(document: SpriteDocument, color: RgbaColor, addToVisiblePalette = false): number {
  const addVisibleColor = (id: number): void => {
    const columns = normalizePaletteColumns(document.paletteColumns)
    const currentSlots = normalizePaletteSlots(document.palette.map((entry) => entry.id), document.paletteOrder, document.paletteSlots, columns)
    const slots = document.paletteOrder.includes(id) ? currentSlots : addPaletteIdToSlots(currentSlots, id, columns)
    document.paletteSlots = slots
    document.paletteColumns = columns
    document.paletteOrder = paletteOrderFromSlots(slots)
  }
  if (color.a === 0) {
    if (!document.palette.some((entry) => entry.id === 0)) document.palette.unshift(transparentEntry())
    if (addToVisiblePalette) addVisibleColor(0)
    return 0
  }
  const existing = document.palette.find((entry) => colorEquals(entry.color, color))
  if (existing) {
    if (addToVisiblePalette) addVisibleColor(existing.id)
    return existing.id
  }
  const id = document.nextColorId++
  document.palette.push({ id, name: tr('core.document.colorName', { id }), color: { ...color } })
  if (addToVisiblePalette) addVisibleColor(id)
  return id
}

const visiblePaletteEntries = (document: SpriteDocument): PaletteEntry[] => {
  const entriesById = new Map(document.palette.map((entry) => [entry.id, entry]))
  const seen = new Set<number>()
  return document.paletteOrder.flatMap((id) => {
    if (seen.has(id)) return []
    seen.add(id)
    const entry = entriesById.get(id)
    return entry ? [entry] : []
  })
}

const paletteColorDistance = (left: RgbaColor, right: RgbaColor): number => {
  const red = left.r - right.r
  const green = left.g - right.g
  const blue = left.b - right.b
  const alpha = left.a - right.a
  return red * red + green * green + blue * blue + alpha * alpha * 2
}

/** Resolves a canvas color without mutating the palette. */
export function paletteColorIdForCanvas(document: SpriteDocument, color: RgbaColor): number {
  if (color.a === 0) return 0
  const candidates = visiblePaletteEntries(document).filter((entry) => entry.id !== 0 && entry.color.a > 0)
  const exact = candidates.find((entry) => colorEquals(entry.color, color))
  if (exact) return exact.id
  let nearest: PaletteEntry | null = null
  let nearestDistance = Number.POSITIVE_INFINITY
  for (const entry of candidates) {
    const distance = paletteColorDistance(color, entry.color)
    if (distance >= nearestDistance) continue
    nearest = entry
    nearestDistance = distance
  }
  return nearest?.id ?? 0
}

export const normalizeDocumentColor = (document: SpriteDocument, color: RgbaColor): RgbaColor =>
  document.colorMode === 'grayscale'
    ? relativeLuminanceColor(color)
    : document.colorMode === 'rgba'
      ? quantizePixelColor(color, document.pixelFormat ?? 'rgba32')
      : color

/** Resolves a compositor-owned color without mutating an indexed palette. */
export const resolveDocumentCanvasColor = (document: SpriteDocument, color: RgbaColor): RgbaColor =>
  document.colorMode === 'indexed'
    ? getPaletteEntry(document, paletteColorIdForCanvas(document, color)).color
    : normalizeDocumentColor(document, color)

/** Resolves the color that will be visible after writing to a layer. */
export const resolveLayerCanvasColor = (document: SpriteDocument, layer: RasterLayer, color: RgbaColor): RgbaColor => {
  if (isLayerMask(layer)) return normalizedMaskColor(color)
  return layer.format === 'indexed' ? resolveDocumentCanvasColor(document, color) : normalizeDocumentColor(document, color)
}

const paletteIdForCanvas = (document: SpriteDocument, id: number): number => {
  if (id === 0 || document.paletteOrder.includes(id)) return id
  return paletteColorIdForCanvas(document, getPaletteEntry(document, id).color)
}

export const normalizeLayerPackedValue = (document: SpriteDocument, layer: RasterLayer, value: number): number => {
  if (isLayerMask(layer)) return maskPacked(unpackColor(value))
  if (layer.format === 'indexed') return paletteIdForCanvas(document, value)
  // Empty layer coverage remains transparent even with an opaque paint format.
  // Packed writes also move/clear existing pixels and restore undo snapshots;
  // quantizing empty RGBA as a new RGB color would turn that space black.
  if ((value >>> 24) === 0) return value
  if (document.colorMode === 'rgba' && document.pixelFormat && document.pixelFormat !== 'rgba32') {
    return packColor(quantizePixelColor(unpackColor(value), document.pixelFormat))
  }
  return document.colorMode === 'grayscale' ? packColor(relativeLuminanceColor(unpackColor(value))) : value
}

export function readLayerColor(document: SpriteDocument, layer: RasterLayer, index: number): RgbaColor {
  const packed = readSurfacePackedLocal(layer, index % layer.width, Math.floor(index / layer.width))
  return layer.format === 'rgba' ? unpackColor(packed) : getPaletteEntry(document, packed).color
}

/** Converts canvas coordinates to an index in a layer's private bitmap. */
export function layerIndexAt(layer: RasterLayer, x: number, y: number): number | null {
  const localX = x - layer.offsetX
  const localY = y - layer.offsetY
  if (localX < 0 || localY < 0 || localX >= layer.width || localY >= layer.height) return null
  return localY * layer.width + localX
}

/** Expands a layer bitmap without discarding pixels that currently sit outside the canvas. */
export function expandLayerToRect(layer: RasterLayer, left: number, top: number, right: number, bottom: number): boolean {
  const isStoredBlankPixel = layer.width === 1 && layer.height === 1 && (layer.format === 'rgba' ? layer.pixels[3] === 0 : layer.pixels[0] === 0)
  if (sparseBlankLayers.has(layer) || isStoredBlankPixel) {
    const nextLeft = Math.trunc(left)
    const nextTop = Math.trunc(top)
    const nextWidth = Math.trunc(right) - nextLeft
    const nextHeight = Math.trunc(bottom) - nextTop
    const pixelCount = nextWidth * nextHeight
    if (!Number.isSafeInteger(pixelCount) || pixelCount <= 0 || pixelCount > 64 * 1024 * 1024) return false
    try {
      layer.pixels = layer.format === 'rgba'
        ? new Uint8ClampedArray(pixelCount * 4)
        : new Uint32Array(pixelCount)
    } catch {
      return false
    }
    layer.width = nextWidth
    layer.height = nextHeight
    layer.offsetX = nextLeft
    layer.offsetY = nextTop
    layerStorageOrigins.set(layer, { x: 0, y: 0 })
    return true
  }
  const nextLeft = Math.min(layer.offsetX, Math.trunc(left))
  const nextTop = Math.min(layer.offsetY, Math.trunc(top))
  const nextRight = Math.max(layer.offsetX + layer.width, Math.trunc(right))
  const nextBottom = Math.max(layer.offsetY + layer.height, Math.trunc(bottom))
  const nextWidth = nextRight - nextLeft
  const nextHeight = nextBottom - nextTop
  if (nextWidth === layer.width && nextHeight === layer.height && nextLeft === layer.offsetX && nextTop === layer.offsetY) return true
  const pixelCount = nextWidth * nextHeight
  if (!Number.isSafeInteger(pixelCount) || pixelCount <= 0 || pixelCount > 64 * 1024 * 1024) return false
  const shiftX = layer.offsetX - nextLeft
  const shiftY = layer.offsetY - nextTop
  try {
    if (layer.format === 'rgba') {
      const pixels = new Uint8ClampedArray(pixelCount * 4)
      const destinationX = layer.offsetX - nextLeft
      const destinationY = layer.offsetY - nextTop
      for (let y = 0; y < layer.height; y += 1) {
        const sourceOffset = y * layer.width * 4
        const destinationOffset = ((destinationY + y) * nextWidth + destinationX) * 4
        pixels.set(layer.pixels.subarray(sourceOffset, sourceOffset + layer.width * 4), destinationOffset)
      }
      layer.pixels = pixels
    } else {
      const pixels = new Uint32Array(pixelCount)
      const destinationX = layer.offsetX - nextLeft
      const destinationY = layer.offsetY - nextTop
      for (let y = 0; y < layer.height; y += 1) {
        const sourceOffset = y * layer.width
        const destinationOffset = (destinationY + y) * nextWidth + destinationX
        pixels.set(layer.pixels.subarray(sourceOffset, sourceOffset + layer.width), destinationOffset)
      }
      layer.pixels = pixels
    }
  } catch {
    return false
  }
  layer.width = nextWidth
  layer.height = nextHeight
  layer.offsetX = nextLeft
  layer.offsetY = nextTop
  const storageOrigin = layerStorageOrigins.get(layer) ?? { x: 0, y: 0 }
  layerStorageOrigins.set(layer, { x: storageOrigin.x - shiftX, y: storageOrigin.y - shiftY })
  return true
}

export const ensureLayerCoversCanvas = (document: SpriteDocument, layer: RasterLayer): boolean =>
  expandLayerToRect(layer, 0, 0, document.width, document.height)

/** Stable bitmap coordinates used by history entries across layer expansion. */
export function layerStoragePoint(layer: RasterLayer, index: number): { x: number; y: number } {
  const origin = layerStorageOrigins.get(layer) ?? { x: 0, y: 0 }
  return { x: index % layer.width + origin.x, y: Math.floor(index / layer.width) + origin.y }
}

export const getLayerStorageOrigin = (layer: RasterLayer): { x: number; y: number } => ({ ...(layerStorageOrigins.get(layer) ?? { x: 0, y: 0 }) })

export const getRasterContentRevision = (storage: object): number => rasterContentRevisions.get(storage) ?? 0

export const getLayerContentRevision = (layer: RasterLayer): number => getRasterContentRevision(rasterStorageIdentity(layer))

type RasterContentSurface = RasterLayer | AnimationCelSurface

const rasterContentBoundsCache = new WeakMap<object, Map<string, SelectionRect | null>>()

export const rasterContentPaletteKey = (surface: RasterContentSurface, palette: readonly PaletteEntry[]): string =>
  surface.format === 'rgba' ? 'rgba' : palette.filter((entry) => entry.color.a > 0).map((entry) => entry.id).sort((a, b) => a - b).join(',')

const rasterContentBoundsCacheKey = (surface: RasterContentSurface, palette: readonly PaletteEntry[]): string =>
  `${surface.width}:${surface.height}:${getRasterContentRevision(rasterStorageIdentity(surface))}:${rasterContentPaletteKey(surface, palette)}`

export const cacheRasterContentBounds = (surface: RasterContentSurface, palette: readonly PaletteEntry[], bounds: SelectionRect | null): void => {
  const storage = rasterStorageIdentity(surface)
  const entries = rasterContentBoundsCache.get(storage) ?? new Map<string, SelectionRect | null>()
  if (entries.size >= 4) entries.clear()
  entries.set(rasterContentBoundsCacheKey(surface, palette), bounds ? { ...bounds } : null)
  rasterContentBoundsCache.set(storage, entries)
}

/** Drops derived visible bounds after operations that can relocate many pixels. */
export const invalidateRasterContentBounds = (surface: RasterContentSurface): void => {
  rasterContentBoundsCache.delete(rasterStorageIdentity(surface))
}

/** Returns local visible-pixel bounds and shares the result across layers, cels, thumbnails, and compositing. */
export function cachedRasterContentBounds(surface: RasterContentSurface, palette: readonly PaletteEntry[] = []): SelectionRect | null | undefined {
  const opaquePaletteIds = surface.format === 'indexed'
    ? new Set(palette.filter((entry) => entry.color.a > 0).map((entry) => entry.id))
    : undefined
  const runtimeBounds = cachedRuntimeRasterVisibleBounds(surface, opaquePaletteIds)
  if (runtimeBounds !== undefined) return runtimeBounds ? { ...runtimeBounds } : null
  const storage = rasterStorageIdentity(surface)
  const key = rasterContentBoundsCacheKey(surface, palette)
  const entries = rasterContentBoundsCache.get(storage) ?? new Map<string, SelectionRect | null>()
  const cached = entries.get(key)
  if (cached !== undefined || entries.has(key)) return cached ? { ...cached } : null
  return undefined
}

/** Returns local visible-pixel bounds and shares the result across layers, cels, thumbnails, and compositing. */
export function rasterContentBounds(surface: RasterContentSurface, palette: readonly PaletteEntry[] = []): SelectionRect | null {
  const cached = cachedRasterContentBounds(surface, palette)
  if (cached !== undefined) return cached
  const opaquePaletteIds = surface.format === 'indexed'
    ? new Set(palette.filter((entry) => entry.color.a > 0).map((entry) => entry.id))
    : undefined
  const runtimeBounds = runtimeRasterVisibleBounds(surface, opaquePaletteIds)
  if (runtimeBounds !== undefined) return runtimeBounds ? { ...runtimeBounds } : null
  let minX = surface.width
  let minY = surface.height
  let maxX = -1
  let maxY = -1
  // Only each row's first and last visible pixels can expand the bounds.
  // Hold native storage once: surface.pixels may be an accessor, and repeated
  // color sampling or visiting opaque interiors makes post-erase clicks stall.
  const pixels = surface.pixels
  if (surface.format === 'rgba') {
    for (let y = 0; y < surface.height; y += 1) {
      const row = y * surface.width * 4
      let left = 0
      while (left < surface.width && !(pixels[row + left * 4 + 3] > 0)) left += 1
      if (left === surface.width) continue
      minX = Math.min(minX, left)
      minY = Math.min(minY, y)
      maxY = y
      let right = surface.width - 1
      while (right > maxX && right > left && !(pixels[row + right * 4 + 3] > 0)) right -= 1
      maxX = Math.max(maxX, right)
    }
  } else {
    for (let y = 0; y < surface.height; y += 1) {
      const row = y * surface.width
      let left = 0
      while (left < surface.width && !opaquePaletteIds!.has(pixels[row + left])) left += 1
      if (left === surface.width) continue
      minX = Math.min(minX, left)
      minY = Math.min(minY, y)
      maxY = y
      let right = surface.width - 1
      while (right > maxX && right > left && !opaquePaletteIds!.has(pixels[row + right])) right -= 1
      maxX = Math.max(maxX, right)
    }
  }
  const bounds = maxX < minX || maxY < minY ? null : {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1
  }
  cacheRasterContentBounds(surface, palette, bounds)
  return bounds ? { ...bounds } : null
}

export const markRasterSurfaceContentChanged = (surface: RasterLayer | AnimationCelSurface): void => {
  const pixels = detachRuntimeRaster(surface)
  markRasterStorageContentChanged(pixels)
}

export const markRasterStorageContentChanged = (storage: object): void => {
  rasterContentRevisions.set(storage, getRasterContentRevision(storage) + 1)
}

export const markLayerContentChanged = (layer: RasterLayer): void => {
  sparseBlankLayers.delete(layer)
  markRasterSurfaceContentChanged(layer)
}

export const setLayerStorageOrigin = (layer: RasterLayer, origin: { x: number; y: number }): void => {
  layerStorageOrigins.set(layer, { x: Math.trunc(origin.x), y: Math.trunc(origin.y) })
}

export function layerIndexAtStoragePoint(layer: RasterLayer, x: number, y: number): number | null {
  const origin = layerStorageOrigins.get(layer) ?? { x: 0, y: 0 }
  const localX = x - origin.x
  const localY = y - origin.y
  if (localX < 0 || localY < 0 || localX >= layer.width || localY >= layer.height) return null
  return localY * layer.width + localX
}

export function readLayerColorAt(document: SpriteDocument, layer: RasterLayer, x: number, y: number): RgbaColor {
  const index = layerIndexAt(layer, x, y)
  return index === null ? TRANSPARENT : readLayerColor(document, layer, index)
}

/** Reads a layer pixel after applying the active frame's layer mask. */
export function readLayerVisibleColorAt(document: SpriteDocument, layer: RasterLayer, x: number, y: number): RgbaColor {
  const source = readLayerColorAt(document, layer, x, y)
  if (source.a === 0 || !document.animation) return source
  const mask = animationMaskAt(document.animation, layer.id, document.animation.activeFrameId)
  if (!mask || mask.visible === false) return source
  const maskIndex = layerIndexAt(mask, x, y)
  if (maskIndex === null) return source
  const maskOffset = maskIndex * 4
  const coverage = mask.pixels[maskOffset + 3] === 0 ? 255 : mask.pixels[maskOffset]
  return coverage === 255 ? source : { ...source, a: Math.round(source.a * coverage / 255) }
}

/** Returns the canvas-space bounds of every non-transparent pixel stored by a layer. */
export function layerContentBounds(document: SpriteDocument, layer: RasterLayer): SelectionRect | null {
  const localBounds = rasterContentBounds(layer, document.palette)
  return localBounds ? { ...localBounds, x: layer.offsetX + localBounds.x, y: layer.offsetY + localBounds.y } : null
}

/** Reads canvas-space content bounds only when decode, composition, or editing has already established them. */
export function cachedLayerContentBounds(document: SpriteDocument, layer: RasterLayer): SelectionRect | null | undefined {
  const localBounds = cachedRasterContentBounds(layer, document.palette)
  return localBounds === undefined
    ? undefined
    : localBounds
      ? { ...localBounds, x: layer.offsetX + localBounds.x, y: layer.offsetY + localBounds.y }
      : null
}

export function readLayerPackedAt(document: SpriteDocument, layer: RasterLayer, x: number, y: number): number | null {
  const index = layerIndexAt(layer, x, y)
  return index === null ? null : readLayerPacked(document, layer, index)
}

export function writeLayerColor(document: SpriteDocument, layer: RasterLayer, index: number, color: RgbaColor): void {
  markLayerContentChanged(layer)
  if (isLayerMask(layer)) {
    writeRgbaPixel(layer.pixels, index, normalizedMaskColor(color))
  } else if (layer.format === 'rgba') writeRgbaPixel(layer.pixels, index, normalizeDocumentColor(document, color))
  else layer.pixels[index] = paletteColorIdForCanvas(document, color)
}

export function readLayerPacked(_document: SpriteDocument, layer: RasterLayer, index: number): number {
  return readSurfacePackedLocal(layer, index % layer.width, Math.floor(index / layer.width))
}

/** Checks a materialized raster without allocating or converting per-pixel colors. */
export function rasterLayerPackedValueIsUniform(layer: RasterLayer, packed: number): boolean {
  const expected = packed >>> 0
  if (layer.format === 'indexed') {
    for (let index = 0; index < layer.pixels.length; index += 1) {
      if ((layer.pixels[index] >>> 0) !== expected) return false
    }
    return true
  }
  if (layer.pixels.byteOffset % 4 === 0) {
    const words = new Uint32Array(layer.pixels.buffer as ArrayBuffer, layer.pixels.byteOffset, layer.pixels.byteLength / 4)
    for (let index = 0; index < words.length; index += 1) {
      if (words[index] !== expected) return false
    }
    return true
  }
  for (let offset = 0; offset < layer.pixels.length; offset += 4) {
    const value = (layer.pixels[offset]
      | (layer.pixels[offset + 1] << 8)
      | (layer.pixels[offset + 2] << 16)
      | (layer.pixels[offset + 3] << 24)) >>> 0
    if (value !== expected) return false
  }
  return true
}

export function writeLayerPacked(document: SpriteDocument, layer: RasterLayer, index: number, value: number): void {
  value = normalizeLayerPackedValue(document, layer, value)
  if (layer.format === 'indexed') { layer.pixels[index] = value; return }
  const offset = index * 4
  layer.pixels[offset] = value & 0xff
  layer.pixels[offset + 1] = (value >>> 8) & 0xff
  layer.pixels[offset + 2] = (value >>> 16) & 0xff
  layer.pixels[offset + 3] = (value >>> 24) & 0xff
}

/** Writes a packed value across one local bitmap row without per-pixel dispatch. */
export function writeLayerPackedRun(document: SpriteDocument, layer: RasterLayer, start: number, length: number, value: number): void {
  const count = Math.min(layer.width - (start % layer.width), length)
  if (count <= 0) return
  value = normalizeLayerPackedValue(document, layer, value)
  if (layer.format === 'indexed') {
    layer.pixels.fill(value, start, start + count)
    return
  }
  if (layer.pixels.byteOffset % 4 === 0) {
    const words = new Uint32Array(layer.pixels.buffer as ArrayBuffer, layer.pixels.byteOffset, layer.pixels.byteLength / 4)
    words.fill(value, start, start + count)
    return
  }
  for (let index = start; index < start + count; index += 1) writeLayerPacked(document, layer, index, value)
}

export function duplicateLayer(document: SpriteDocument, layerId: string): RasterLayer {
  const source = getLayer(document, layerId)
  const copyId = createId('layer')
  const layerStyles = cloneLayerStyles(source.layerStyles)
  const background = source.background ? { ...source.background } : undefined
  const copy = source.format === 'rgba'
    ? { ...source, id: copyId, name: `${source.name} ${tr('core.document.copySuffix')}`, ...(layerStyles ? { layerStyles } : {}), ...(background ? { background } : {}), pixels: new Uint8ClampedArray(source.pixels) } as RgbaLayer
    : { ...source, id: copyId, name: `${source.name} ${tr('core.document.copySuffix')}`, ...(layerStyles ? { layerStyles } : {}), ...(background ? { background } : {}), pixels: new Uint32Array(source.pixels) } as IndexedLayer
  document.layers.splice(document.layers.findIndex((layer) => layer.id === layerId) + 1, 0, copy)
  document.activeLayerId = copy.id
  return copy
}

type DocumentRasterSurface = RasterLayer | AnimationCelSurface

const documentRasterSurfaces = (document: SpriteDocument): DocumentRasterSurface[] => [
  ...document.layers,
  ...(document.animation?.cels.flatMap((cel) => cel.surface ? [cel.surface] : []) ?? [])
]

const ensureIndexedPalette = (document: SpriteDocument): void => {
  if (!document.palette.some((entry) => entry.id === 0)) document.palette.unshift(transparentEntry())
  if (document.paletteOrder.includes(0)) return
  const columns = normalizePaletteColumns(document.paletteColumns)
  const slots = normalizePaletteSlots(document.palette.map((entry) => entry.id), document.paletteOrder, document.paletteSlots, columns)
  document.paletteSlots = addPaletteIdToSlots(slots, 0, columns)
  document.paletteColumns = columns
  document.paletteOrder = paletteOrderFromSlots(document.paletteSlots)
}

export interface IndexedPaletteRemap {
  surfaces: DocumentRasterSurface[]
  before: Uint32Array
  after: Uint32Array
}

export function applyIndexedPaletteRemap(changes: readonly IndexedPaletteRemap[], state: 'before' | 'after'): void {
  for (const change of changes) for (const surface of change.surfaces) {
    detachRuntimeRaster(surface)
    surface.pixels = change[state]
  }
}

/** Remaps hidden or removed palette IDs used by the canvas to visible palette entries. */
export function remapIndexedDocumentToVisiblePalette(document: SpriteDocument): IndexedPaletteRemap[] {
  if (document.colorMode !== 'indexed') return []
  const groups = new Map<object, DocumentRasterSurface[]>()
  for (const surface of documentRasterSurfaces(document)) {
    if (surface.format !== 'indexed') continue
    const storage = rasterStorageIdentity(surface)
    const surfaces = groups.get(storage) ?? []
    surfaces.push(surface)
    groups.set(storage, surfaces)
  }
  const visibleIds = new Set(document.paletteOrder)
  const changes: IndexedPaletteRemap[] = []
  for (const surfaces of groups.values()) {
    const runtime = lazyRuntimeRasterForSurface(surfaces[0])
    if (runtime) {
      const view = new DataView(runtime.data.buffer, runtime.data.byteOffset, runtime.data.byteLength)
      let usesOnlyVisibleIds = true
      for (let offset = 0; offset + 4 <= runtime.data.byteLength; offset += 4) {
        const id = view.getUint32(offset, true)
        if (id === 0 || visibleIds.has(id)) continue
        usesOnlyVisibleIds = false
        break
      }
      if (usesOnlyVisibleIds) continue
    }
    const before = detachRuntimeRaster(surfaces[0]) as Uint32Array
    let after: Uint32Array | null = null
    for (let index = 0; index < before.length; index += 1) {
      const id = before[index]
      if (id === 0 || visibleIds.has(id)) continue
      after ??= before.slice()
      after[index] = paletteIdForCanvas(document, id)
    }
    if (!after) continue
    const change = { surfaces, before, after }
    applyIndexedPaletteRemap([change], 'after')
    changes.push(change)
  }
  return changes
}

export function convertDocumentColorMode(document: SpriteDocument, target: ColorMode): void {
  if (document.colorMode === target) return
  if (target === 'indexed') ensureIndexedPalette(document)
  const sourcePalette = new Map(document.palette.map((entry) => [entry.id, entry.color]))
  const bindings = documentRasterSurfaces(document).map((surface) => ({ surface, storage: rasterStorageIdentity(surface) }))
  const convertedByStorage = new Map<object, { format: 'rgba'; pixels: Uint8ClampedArray } | { format: 'indexed'; pixels: Uint32Array }>()
  for (const { surface, storage } of bindings) {
    let converted = convertedByStorage.get(storage)
    if (!converted) {
      const sourceFormat = surface.format
      const sourcePixels = detachRuntimeRaster(surface)
      const colorAt = (index: number): RgbaColor => sourceFormat === 'rgba'
        ? readRgbaPixel(sourcePixels as Uint8ClampedArray, index)
        : sourcePalette.get((sourcePixels as Uint32Array)[index]) ?? TRANSPARENT
      if (target === 'indexed') {
        const pixels = new Uint32Array(surface.width * surface.height)
        for (let index = 0; index < pixels.length; index += 1) pixels[index] = paletteColorIdForCanvas(document, colorAt(index))
        converted = { format: 'indexed', pixels }
      } else {
        const pixels = new Uint8ClampedArray(surface.width * surface.height * 4)
        for (let index = 0; index < surface.width * surface.height; index += 1) {
          const color = colorAt(index)
          writeRgbaPixel(pixels, index, target === 'grayscale' ? relativeLuminanceColor(color) : color)
        }
        converted = { format: 'rgba', pixels }
      }
      convertedByStorage.set(storage, converted)
    }
    detachRuntimeRaster(surface)
    Object.assign(surface, converted)
  }
  document.colorMode = target
}
