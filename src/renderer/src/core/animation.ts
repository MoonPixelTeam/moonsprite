import type { AnimationCel, AnimationCelSurface, AnimationFrame, AnimationTimeline } from '@shared/types-animation'
import type { AnimationGroupMask, AnimationLayerMask, LayerMask, RasterLayer } from '@shared/types-layer'
import type { FreeTileCelData, TilemapCelData } from '@shared/types-tiles'
import type { PaletteEntry } from '@shared/types-color'
import type { SelectionMask } from '@shared/types-selection'
import type { SpriteDocument } from '@shared/types-document'
import type { TextCelData } from '@shared/types-text'
import { animationMaskAt, createId, getLayerStorageOrigin, paletteColorIdForCanvas, resolveAnimationMask, setLayerStorageOrigin } from './document-model'
import { assignRasterStorage, installRuntimeRaster, rasterStorageIdentity, runtimeRasterVisibleBounds, readSurfacePackedLocal } from './runtime-raster'
import { normalizeTextCelData, translateTextCelData } from './text-cel-data'
import { cloneLayerStyles } from './layer-styles'
import { backgroundPatternSize, tileBackgroundSurfaceToCanvas } from './background-patterns'
import { cloneTilemapCelData, cloneTileset, normalizeTilemapCelData, renderTilemapSurface, resizeTilemapCelDataToCanvas } from './tilemap'
import { cloneFreeTileCelData, createFreeTileCelData, freeTileSourceRefs, freeTileSourceForInstance, normalizeFreeTileCelData, renderFreeTileSurface } from './free-tile'
import { normalizeAnimationLoopSections, reconcileAnimationLoopSectionsAfterFrameDeletion, reconcileAnimationLoopSectionsAfterFrameInsertion } from './animation-loop-sections'
import { linkedLayerGroups, linkedLayerMembers, normalizeLinkedLayerMetadata, shareLinkedRasterContent } from './linked-layers'

export const DEFAULT_FRAME_DURATION = 100
export const MAX_ANIMATION_FRAME_DURATION = 60_000

export const createDefaultAnimationTimeline = (): AnimationTimeline => ({
  frames: [{ id: 'frame-1', duration: DEFAULT_FRAME_DURATION }],
  cels: [],
  layerMasks: [],
  groupMasks: [],
  loopSections: [],
  activeFrameId: 'frame-1',
  loop: true
})

const normalizeFrame = (value: unknown, index: number, seen: Set<string>): AnimationFrame | null => {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<AnimationFrame>
  const id = typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id : `frame-${index + 1}`
  if (seen.has(id)) return null
  seen.add(id)
  const duration = Number.isFinite(candidate.duration)
    ? Math.max(1, Math.min(MAX_ANIMATION_FRAME_DURATION, Math.trunc(Number(candidate.duration))))
    : DEFAULT_FRAME_DURATION
  return { id, duration, ...(candidate.disabled === true ? { disabled: true } : {}) }
}

const normalizeSurface = (value: unknown): AnimationCelSurface | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const candidate = value as Partial<AnimationCelSurface>
  const width = Number(candidate.width)
  const height = Number(candidate.height)
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) return undefined
  const offsetX = Number.isFinite(candidate.offsetX) ? Math.trunc(Number(candidate.offsetX)) : 0
  const offsetY = Number.isFinite(candidate.offsetY) ? Math.trunc(Number(candidate.offsetY)) : 0
  const runtime = candidate.runtimeRaster
  if (candidate.format === 'rgba' && runtime?.kind === 'sparse-tiles-v1' && runtime.format === 'rgba' && runtime.width === width && runtime.height === height) {
    const surface: AnimationCelSurface = { format: 'rgba', width, height, offsetX, offsetY, pixels: new Uint8ClampedArray(4) }
    installRuntimeRaster(surface, runtime)
    return surface
  }
  if (candidate.format === 'indexed' && runtime?.kind === 'sparse-tiles-v1' && runtime.format === 'indexed' && runtime.width === width && runtime.height === height) {
    const surface: AnimationCelSurface = { format: 'indexed', width, height, offsetX, offsetY, pixels: new Uint32Array(1) }
    installRuntimeRaster(surface, runtime)
    return surface
  }
  if (candidate.format === 'rgba' && candidate.pixels instanceof Uint8ClampedArray && candidate.pixels.length === width * height * 4) {
    return { format: 'rgba', width, height, offsetX, offsetY, pixels: candidate.pixels }
  }
  if (candidate.format === 'indexed' && candidate.pixels instanceof Uint32Array && candidate.pixels.length === width * height) {
    return { format: 'indexed', width, height, offsetX, offsetY, pixels: candidate.pixels }
  }
  return undefined
}

const normalizeLayerMask = (value: unknown, ownerId: string, ownerKind: LayerMask['ownerKind'] = 'cel'): LayerMask | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const candidate = value as Partial<LayerMask>
  const width = Number(candidate.width)
  const height = Number(candidate.height)
  if (typeof candidate.id !== 'string' || !candidate.id || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) return undefined
  if (!(candidate.pixels instanceof Uint8ClampedArray) || candidate.pixels.length !== width * height * 4) return undefined
  return {
    id: candidate.id,
    name: typeof candidate.name === 'string' ? candidate.name : '',
    description: typeof candidate.description === 'string' ? candidate.description : '',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    width,
    height,
    offsetX: Number.isFinite(candidate.offsetX) ? Math.trunc(Number(candidate.offsetX)) : 0,
    offsetY: Number.isFinite(candidate.offsetY) ? Math.trunc(Number(candidate.offsetY)) : 0,
    format: 'rgba',
    pixels: candidate.pixels,
    ownerKind,
    ownerId,
    moveWithOwner: candidate.moveWithOwner !== false,
    ...(typeof candidate.linkedMaskId === 'string' ? { linkedMaskId: candidate.linkedMaskId } : {})
  }
}

const normalizeGroupMasks = (value: unknown, frameIds: Set<string>): AnimationGroupMask[] => {
  if (!Array.isArray(value)) return []
  const result: AnimationGroupMask[] = []
  const slots = new Set<string>()
  const maskIds = new Set<string>()
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const candidate = item as Partial<AnimationGroupMask>
    if (typeof candidate.groupId !== 'string' || !candidate.groupId || typeof candidate.frameId !== 'string' || !frameIds.has(candidate.frameId)) continue
    const slot = `${candidate.groupId}\u0000${candidate.frameId}`
    if (slots.has(slot)) continue
    const mask = normalizeLayerMask(candidate.mask, candidate.groupId, 'group')
    if (!mask || maskIds.has(mask.id)) continue
    slots.add(slot)
    maskIds.add(mask.id)
    result.push({ groupId: candidate.groupId, frameId: candidate.frameId, mask })
  }
  return result
}

const normalizeLayerMasks = (value: unknown, legacyCels: unknown, frameIds: Set<string>): AnimationLayerMask[] => {
  const entries = Array.isArray(value) ? value : []
  const legacyEntries = Array.isArray(legacyCels)
    ? legacyCels.flatMap((item) => {
        if (!item || typeof item !== 'object') return []
        const candidate = item as Partial<AnimationCel> & { mask?: unknown }
        return typeof candidate.layerId === 'string' && typeof candidate.frameId === 'string' && candidate.mask
          ? [{ layerId: candidate.layerId, frameId: candidate.frameId, mask: candidate.mask }]
          : []
      })
    : []
  const result: AnimationLayerMask[] = []
  const slots = new Set<string>()
  const maskIds = new Set<string>()
  for (const item of [...entries, ...legacyEntries]) {
    if (!item || typeof item !== 'object') continue
    const candidate = item as Partial<AnimationLayerMask>
    if (typeof candidate.layerId !== 'string' || !candidate.layerId || typeof candidate.frameId !== 'string' || !frameIds.has(candidate.frameId)) continue
    const slot = `${candidate.layerId}\u0000${candidate.frameId}`
    if (slots.has(slot)) continue
    const mask = normalizeLayerMask(candidate.mask, candidate.layerId)
    if (!mask || maskIds.has(mask.id)) continue
    slots.add(slot)
    maskIds.add(mask.id)
    result.push({ layerId: candidate.layerId, frameId: candidate.frameId, mask })
  }
  return result
}

const cloneLayerMaskForCel = (mask: LayerMask, ownerId: string, id = mask.id): LayerMask => ({
  ...mask,
  id,
  ownerKind: 'cel',
  ownerId,
  linkedMaskId: id === mask.id ? mask.linkedMaskId : null,
  pixels: new Uint8ClampedArray(mask.pixels)
})

const cloneAnimationText = (text: TextCelData | undefined): TextCelData | undefined => text ? ({
  ...text,
  color: { ...text.color },
  styleRuns: text.styleRuns?.map((run) => ({ ...run, color: run.color ? { ...run.color } : undefined })),
  transforms: text.transforms?.map((transform) => ({
    ...transform,
    source: { ...transform.source },
    target: { ...transform.target },
    shear: transform.shear ? { ...transform.shear } : undefined
  }))
}) : undefined

const cloneAnimationTilemap = (tilemap: TilemapCelData | undefined): TilemapCelData | undefined =>
  tilemap ? cloneTilemapCelData(tilemap) : undefined

const blankAnimationTilemap = (tilemap: TilemapCelData | undefined): TilemapCelData | undefined => tilemap ? ({
  ...tilemap,
  cells: Array.from({ length: tilemap.cells.length }, () => null)
}) : undefined

const cloneAnimationFreeTiles = (freeTiles: FreeTileCelData | undefined): FreeTileCelData | undefined =>
  freeTiles ? cloneFreeTileCelData(freeTiles) : undefined

const blankAnimationFreeTiles = (freeTiles: FreeTileCelData | undefined): FreeTileCelData | undefined =>
  freeTiles ? createFreeTileCelData() : undefined

export const cloneAnimationGroupMask = (entry: AnimationGroupMask, groupId = entry.groupId, frameId = entry.frameId, maskId = entry.mask.id): AnimationGroupMask => ({
  groupId,
  frameId,
  mask: { ...entry.mask, id: maskId, ownerKind: 'group', ownerId: groupId, linkedMaskId: maskId === entry.mask.id ? entry.mask.linkedMaskId : null, pixels: new Uint8ClampedArray(entry.mask.pixels) }
})

export const cloneAnimationLayerMask = (entry: AnimationLayerMask, layerId = entry.layerId, frameId = entry.frameId, maskId = entry.mask.id): AnimationLayerMask => ({
  layerId,
  frameId,
  mask: { ...entry.mask, id: maskId, ownerKind: 'cel', ownerId: layerId, linkedMaskId: maskId === entry.mask.id ? entry.mask.linkedMaskId : null, pixels: new Uint8ClampedArray(entry.mask.pixels) }
})

export const MIN_ANIMATION_CEL_Z_INDEX = -999
export const MAX_ANIMATION_CEL_Z_INDEX = 999
export const normalizeAnimationCelZIndex = (value: unknown): number => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.max(MIN_ANIMATION_CEL_Z_INDEX, Math.min(MAX_ANIMATION_CEL_Z_INDEX, Math.trunc(numeric)))
}

const normalizeCels = (value: unknown, frameIds: Set<string>): AnimationCel[] => {
  if (!Array.isArray(value)) return []
  const result: AnimationCel[] = []
  const ids = new Set<string>()
  const slots = new Set<string>()
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const candidate = item as Partial<AnimationCel>
    if (typeof candidate.id !== 'string' || !candidate.id || ids.has(candidate.id)) continue
    if (typeof candidate.layerId !== 'string' || !candidate.layerId || typeof candidate.frameId !== 'string' || !frameIds.has(candidate.frameId)) continue
    const slot = `${candidate.layerId}:${candidate.frameId}`
    if (slots.has(slot)) continue
    ids.add(candidate.id)
    slots.add(slot)
    const surface = normalizeSurface(candidate.surface)
    const text = candidate.text && typeof candidate.text === 'object' ? normalizeTextCelData(candidate.text) : undefined
    const tilemap = candidate.tilemap && typeof candidate.tilemap === 'object' ? normalizeTilemapCelData(candidate.tilemap) ?? undefined : undefined
    const freeTiles = candidate.freeTiles && typeof candidate.freeTiles === 'object' ? normalizeFreeTileCelData(candidate.freeTiles) ?? undefined : undefined
    result.push({
      id: candidate.id,
      layerId: candidate.layerId,
      frameId: candidate.frameId,
      ...(typeof candidate.linkedCelId === 'string' ? { linkedCelId: candidate.linkedCelId } : {}),
      ...(normalizeAnimationCelZIndex(candidate.zIndex) !== 0 ? { zIndex: normalizeAnimationCelZIndex(candidate.zIndex) } : {}),
      ...(Number.isFinite(candidate.opacity) ? { opacity: Math.max(0, Math.min(1, Number(candidate.opacity))) } : {}),
      ...(surface ? { surface } : {}),
      ...(text ? { text } : {}),
      ...(tilemap ? { tilemap } : {}),
      ...(freeTiles ? { freeTiles } : {})
    })
  }
  return result
}

/** 旧工程没有动画字段时会被视为单帧工程。 */
export const normalizeAnimationTimeline = (value: unknown): AnimationTimeline => {
  if (!value || typeof value !== 'object') return createDefaultAnimationTimeline()
  const candidate = value as Partial<AnimationTimeline>
  const seen = new Set<string>()
  const frames = Array.isArray(candidate.frames)
    ? candidate.frames.map((frame, index) => normalizeFrame(frame, index, seen)).filter((frame): frame is AnimationFrame => Boolean(frame))
    : []
  if (frames.length === 0) return createDefaultAnimationTimeline()
  const frameIds = new Set(frames.map((frame) => frame.id))
  const cels = normalizeCels(candidate.cels, frameIds)
  return {
    frames,
    cels,
    layerMasks: normalizeLayerMasks(candidate.layerMasks, candidate.cels, frameIds),
    groupMasks: normalizeGroupMasks(candidate.groupMasks, frameIds),
    loopSections: normalizeAnimationLoopSections(candidate.loopSections, frames),
    activeFrameId: typeof candidate.activeFrameId === 'string' && frameIds.has(candidate.activeFrameId) ? candidate.activeFrameId : frames[0].id,
    loop: candidate.loop !== false
  }
}

export const animationFrameAt = (timeline: AnimationTimeline, frameId: string): AnimationFrame | null =>
  timeline.frames.find((frame) => frame.id === frameId) ?? null

export const animationCelAt = (timeline: AnimationTimeline, layerId: string, frameId: string): AnimationCel | null =>
  timeline.cels.find((cel) => cel.layerId === layerId && cel.frameId === frameId) ?? null

export const animationGroupMaskAt = (timeline: AnimationTimeline, groupId: string, frameId: string): LayerMask | null =>
  animationMaskAt(timeline, groupId, frameId)

export interface AnimationCelLookup {
  at: (layerId: string, frameId: string) => AnimationCel | null
  resolve: (cel: AnimationCel | null) => AnimationCel | null
}

/** Builds the cel indexes once for batch timeline work such as playback and panel rendering. */
export const createAnimationCelLookup = (timeline: AnimationTimeline): AnimationCelLookup => {
  const bySlot = new Map(timeline.cels.map((candidate) => [celSlotKey(candidate.layerId, candidate.frameId), candidate]))
  let byId: Map<string, AnimationCel> | null = null
  const resolved = new Map<string, AnimationCel>()
  const resolve = (cel: AnimationCel | null): AnimationCel | null => {
    if (!cel || !cel.linkedCelId) return cel
    const cached = resolved.get(cel.id)
    if (cached) return cached
    const visited = new Set<string>()
    const path: AnimationCel[] = []
    let current = cel
    while (current.linkedCelId) {
      const known = resolved.get(current.id)
      if (known) {
        for (const member of path) resolved.set(member.id, known)
        return known
      }
      if (visited.has(current.id)) return cel
      visited.add(current.id)
      path.push(current)
      byId ??= new Map(timeline.cels.map((candidate) => [candidate.id, candidate]))
      const linked = byId.get(current.linkedCelId)
      if (!linked || linked.layerId !== cel.layerId) return cel
      current = linked
    }
    resolved.set(current.id, current)
    for (const member of path) resolved.set(member.id, current)
    return current
  }
  return {
    at: (layerId, frameId) => bySlot.get(celSlotKey(layerId, frameId)) ?? null,
    resolve
  }
}

export const resolveAnimationCel = (timeline: AnimationTimeline, cel: AnimationCel | null): AnimationCel | null =>
  !cel?.linkedCelId ? cel : createAnimationCelLookup(timeline).resolve(cel)

/** 判断 cel 是否包含至少一个可见像素，而不是只判断是否存在 surface。 */
export const animationCelHasContent = (cel: AnimationCel | null, palette: readonly PaletteEntry[] = []): boolean => {
  if (!cel?.surface) return false
  const opaqueIds = cel.surface.format === 'indexed' && palette.length > 0
    ? new Set(palette.filter((entry) => entry.color.a > 0).map((entry) => entry.id))
    : undefined
  const runtimeBounds = runtimeRasterVisibleBounds(cel.surface, opaqueIds)
  if (runtimeBounds !== undefined) return runtimeBounds !== null
  if (cel.surface.format === 'rgba') {
    for (let index = 3; index < cel.surface.pixels.length; index += 4) if (cel.surface.pixels[index] > 0) return true
    return false
  }
  if (palette.length === 0) return cel.surface.pixels.some((pixel) => pixel !== 0)
  const visiblePaletteIds = new Set(palette.filter((entry) => entry.color.a > 0).map((entry) => entry.id))
  return cel.surface.pixels.some((pixel) => visiblePaletteIds.has(pixel))
}

/** Builds a canvas-clipped selection from every visible pixel in one cel. */
export const animationCelContentSelection = (cel: AnimationCel | null, palette: readonly PaletteEntry[], canvasWidth: number, canvasHeight: number): SelectionMask | null => {
  const surface = cel?.surface
  const documentWidth = Math.max(0, Math.trunc(canvasWidth))
  const documentHeight = Math.max(0, Math.trunc(canvasHeight))
  if (!surface || documentWidth < 1 || documentHeight < 1) return null
  const sourceLeft = Math.max(0, -surface.offsetX)
  const sourceTop = Math.max(0, -surface.offsetY)
  const sourceRight = Math.min(surface.width, documentWidth - surface.offsetX)
  const sourceBottom = Math.min(surface.height, documentHeight - surface.offsetY)
  if (sourceRight <= sourceLeft || sourceBottom <= sourceTop) return null

  const opaquePaletteIds = surface.format === 'indexed'
    ? new Set(palette.filter((entry) => entry.color.a > 0).map((entry) => entry.id))
    : null
  const opaqueAt = surface.format === 'rgba'
    ? (x: number, y: number): boolean => (readSurfacePackedLocal(surface, x, y) >>> 24) > 0
    : palette.length === 0
      ? (x: number, y: number): boolean => readSurfacePackedLocal(surface, x, y) !== 0
      : (x: number, y: number): boolean => opaquePaletteIds!.has(readSurfacePackedLocal(surface, x, y))

  let minX = sourceRight
  let minY = sourceBottom
  let maxX = -1
  let maxY = -1
  for (let y = sourceTop; y < sourceBottom; y += 1) for (let x = sourceLeft; x < sourceRight; x += 1) {
    if (!opaqueAt(x, y)) continue
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  if (maxX < minX || maxY < minY) return null

  const width = maxX - minX + 1
  const height = maxY - minY + 1
  const mask = new Uint8Array(width * height)
  let selected = 0
  for (let y = minY; y <= maxY; y += 1) for (let x = minX; x <= maxX; x += 1) {
    if (!opaqueAt(x, y)) continue
    mask[(y - minY) * width + x - minX] = 1
    selected += 1
  }
  const selection = { x: surface.offsetX + minX, y: surface.offsetY + minY, width, height }
  return selected === width * height ? selection : { ...selection, mask }
}

export const animationCelKey = (layerId: string, frameId: string): string => `${layerId}:${frameId}`

export const parseAnimationCelKey = (key: string): { layerId: string; frameId: string } | null => {
  const separator = key.lastIndexOf(':')
  if (separator <= 0 || separator === key.length - 1) return null
  return { layerId: key.slice(0, separator), frameId: key.slice(separator + 1) }
}

export interface AnimationCelPlacement {
  source: AnimationCel
  target: AnimationCel
}

/** 按拖拽锚点保留多选 cel 在图层和帧网格中的相对位置。 */
export const mapAnimationCelBlock = (
  timeline: AnimationTimeline,
  layerIds: readonly string[],
  sourceCels: readonly AnimationCel[],
  sourceAnchorKey: string,
  targetLayerId: string,
  targetFrameId: string
): AnimationCelPlacement[] => {
  const anchor = parseAnimationCelKey(sourceAnchorKey)
  const sourceLayerIndex = anchor ? layerIds.indexOf(anchor.layerId) : -1
  const sourceFrameIndex = anchor ? timeline.frames.findIndex((frame) => frame.id === anchor.frameId) : -1
  const targetLayerIndex = layerIds.indexOf(targetLayerId)
  const targetFrameIndex = timeline.frames.findIndex((frame) => frame.id === targetFrameId)
  if (sourceLayerIndex < 0 || sourceFrameIndex < 0 || targetLayerIndex < 0 || targetFrameIndex < 0) return []

  const layerIndexById = new Map(layerIds.map((id, index) => [id, index]))
  const frameIndexById = new Map(timeline.frames.map((frame, index) => [frame.id, index]))
  const celBySlot = new Map(timeline.cels.map((cel) => [animationCelKey(cel.layerId, cel.frameId), cel]))
  return sourceCels.flatMap((source) => {
    const layerIndex = layerIndexById.get(source.layerId)
    const frameIndex = frameIndexById.get(source.frameId)
    if (layerIndex === undefined || frameIndex === undefined) return []
    const destinationLayerId = layerIds[targetLayerIndex + layerIndex - sourceLayerIndex]
    const destinationFrame = timeline.frames[targetFrameIndex + frameIndex - sourceFrameIndex]
    if (!destinationLayerId || !destinationFrame) return []
    const target = celBySlot.get(animationCelKey(destinationLayerId, destinationFrame.id))
    return target ? [{ source, target }] : []
  })
}

const celSlotKey = (layerId: string, frameId: string): string => `${layerId}\u0000${frameId}`

const createAnimationIdAllocator = (timeline: AnimationTimeline, prefix: 'frame' | 'cel'): (() => string) => {
  const used = new Set(prefix === 'frame' ? timeline.frames.map((frame) => frame.id) : timeline.cels.map((cel) => cel.id))
  let index = used.size + 1
  return () => {
    while (used.has(`${prefix}-${index}`)) index += 1
    const id = `${prefix}-${index}`
    used.add(id)
    index += 1
    return id
  }
}

const uniqueAnimationId = (timeline: AnimationTimeline, prefix: 'frame' | 'cel'): string => createAnimationIdAllocator(timeline, prefix)()

const surfaceFromLayer = (layer: RasterLayer, copyPixels = false): AnimationCelSurface => {
  const storageOrigin = getLayerStorageOrigin(layer)
  const surface: AnimationCelSurface = layer.format === 'rgba'
    ? { format: 'rgba', width: layer.width, height: layer.height, offsetX: layer.offsetX, offsetY: layer.offsetY, storageOriginX: storageOrigin.x, storageOriginY: storageOrigin.y, pixels: new Uint8ClampedArray(4) }
    : { format: 'indexed', width: layer.width, height: layer.height, offsetX: layer.offsetX, offsetY: layer.offsetY, storageOriginX: storageOrigin.x, storageOriginY: storageOrigin.y, pixels: new Uint32Array(1) }
  assignRasterStorage(surface, layer, copyPixels)
  return surface
}

const updateSurfaceFromLayer = (surface: AnimationCelSurface, layer: RasterLayer): AnimationCelSurface => {
  if (surface.format !== layer.format) return surfaceFromLayer(layer)
  const storageOrigin = getLayerStorageOrigin(layer)
  surface.width = layer.width
  surface.height = layer.height
  surface.offsetX = layer.offsetX
  surface.offsetY = layer.offsetY
  surface.storageOriginX = storageOrigin.x
  surface.storageOriginY = storageOrigin.y
  assignRasterStorage(surface, layer)
  return surface
}

const blankSurfaceFromLayer = (layer: RasterLayer): AnimationCelSurface => layer.format === 'rgba'
  ? { format: 'rgba', width: 1, height: 1, offsetX: 0, offsetY: 0, pixels: new Uint8ClampedArray(4) }
  : { format: 'indexed', width: 1, height: 1, offsetX: 0, offsetY: 0, pixels: new Uint32Array(1) }

export const cloneAnimationCelSurface = (surface: AnimationCelSurface): AnimationCelSurface => surfaceFromSurface(surface, true)

const surfaceFromSurface = (source: AnimationCelSurface, copyPixels = false): AnimationCelSurface => {
  const surface: AnimationCelSurface = source.format === 'rgba'
    ? { ...source, pixels: new Uint8ClampedArray(4) }
    : { ...source, pixels: new Uint32Array(1) }
  assignRasterStorage(surface, source, copyPixels)
  return surface
}

const shareAnimationCelSurface = (surface: AnimationCelSurface): AnimationCelSurface => surfaceFromSurface(surface)

const cropAnimationCelSurface = (surface: AnimationCelSurface, canvasWidth: number, canvasHeight: number): void => {
  const left = Math.max(0, surface.offsetX)
  const top = Math.max(0, surface.offsetY)
  const right = Math.min(canvasWidth, surface.offsetX + surface.width)
  const bottom = Math.min(canvasHeight, surface.offsetY + surface.height)
  const sourceX = left - surface.offsetX
  const sourceY = top - surface.offsetY
  const nextWidth = right - left
  const nextHeight = bottom - top
  const storageOriginX = surface.storageOriginX ?? 0
  const storageOriginY = surface.storageOriginY ?? 0
  if (nextWidth <= 0 || nextHeight <= 0) {
    surface.width = 1
    surface.height = 1
    surface.offsetX = 0
    surface.offsetY = 0
    surface.storageOriginX = storageOriginX + sourceX
    surface.storageOriginY = storageOriginY + sourceY
    surface.pixels = surface.format === 'rgba' ? new Uint8ClampedArray(4) : new Uint32Array(1)
    return
  }
  if (left === surface.offsetX && top === surface.offsetY && nextWidth === surface.width && nextHeight === surface.height) return
  if (surface.format === 'rgba') {
    const pixels = new Uint8ClampedArray(nextWidth * nextHeight * 4)
    for (let y = 0; y < nextHeight; y += 1) {
      const sourceOffset = ((sourceY + y) * surface.width + sourceX) * 4
      pixels.set(surface.pixels.subarray(sourceOffset, sourceOffset + nextWidth * 4), y * nextWidth * 4)
    }
    surface.pixels = pixels
  } else {
    const pixels = new Uint32Array(nextWidth * nextHeight)
    for (let y = 0; y < nextHeight; y += 1) {
      const sourceOffset = (sourceY + y) * surface.width + sourceX
      pixels.set(surface.pixels.subarray(sourceOffset, sourceOffset + nextWidth), y * nextWidth)
    }
    surface.pixels = pixels
  }
  surface.width = nextWidth
  surface.height = nextHeight
  surface.offsetX = left
  surface.offsetY = top
  surface.storageOriginX = storageOriginX + sourceX
  surface.storageOriginY = storageOriginY + sourceY
}

/** 将画布坐标偏移同步到所有动画 cel，不改变 cel 在画布中的世界位置。 */
export const resizeAnimationCelsAt = (
  document: SpriteDocument,
  offsetX: number,
  offsetY: number,
  trimOutside = false,
  sourceCanvasWidth = document.width,
  sourceCanvasHeight = document.height
): void => {
  const timeline = ensureAnimationDocument(document)
  const horizontal = Math.trunc(offsetX)
  const vertical = Math.trunc(offsetY)
  const expanding = document.width > sourceCanvasWidth || document.height > sourceCanvasHeight
  const backgroundLayerIds = new Set(document.layers.filter((layer) => layer.background).map((layer) => layer.id))
  syncFrameSurfaces(document, timeline)
  const lookup = createAnimationCelLookup(timeline)
  const activeSourceIds = new Set(timeline.cels
    .filter((cel) => cel.frameId === timeline.activeFrameId)
    .map((cel) => (lookup.resolve(cel) ?? cel).id))
  const resized = new Set<object | string>()
  for (const cel of timeline.cels) {
    const source = lookup.resolve(cel) ?? cel
    const storage = source.surface ? rasterStorageIdentity(source.surface) : source.id
    if (resized.has(storage)) continue
    resized.add(storage)
    const activeSource = activeSourceIds.has(source.id)
    if (source.tilemap) {
      const layer = document.layers.find((candidate) => candidate.id === source.layerId)
      const shiftedOffsetX = (source.surface?.offsetX ?? (activeSource ? layer?.offsetX ?? 0 : 0)) + (activeSource ? 0 : horizontal)
      const shiftedOffsetY = (source.surface?.offsetY ?? (activeSource ? layer?.offsetY ?? 0 : 0)) + (activeSource ? 0 : vertical)
      const resizedTilemap = resizeTilemapCelDataToCanvas(source.tilemap, shiftedOffsetX, shiftedOffsetY, document.width, document.height, trimOutside)
      source.tilemap = resizedTilemap.tilemap
      source.surface = renderTilemapSurface(source.tilemap, document.tilesets ?? [], document.colorMode, resizedTilemap.offsetX, resizedTilemap.offsetY)
      continue
    }
    if (source.freeTiles) {
      const layer = document.layers.find((candidate) => candidate.id === source.layerId && candidate.kind === 'free-tile')
      const sources = layer ? freeTileSourceRefs(layer.freeTileSources, document.tilesets ?? []) : []
      if (!layer || sources.length === 0) continue
      const shiftedOffsetX = (source.surface?.offsetX ?? (activeSource ? layer.offsetX : 0)) + (activeSource ? 0 : horizontal)
      const shiftedOffsetY = (source.surface?.offsetY ?? (activeSource ? layer.offsetY : 0)) + (activeSource ? 0 : vertical)
      const currentWidth = source.surface?.width ?? sourceCanvasWidth
      const currentHeight = source.surface?.height ?? sourceCanvasHeight
      let left = shiftedOffsetX
      let top = shiftedOffsetY
      let right = shiftedOffsetX + currentWidth
      let bottom = shiftedOffsetY + currentHeight
      if (expanding) {
        left = Math.min(left, 0)
        top = Math.min(top, 0)
        right = Math.max(right, document.width)
        bottom = Math.max(bottom, document.height)
      }
      if (trimOutside) {
        left = Math.max(0, left)
        top = Math.max(0, top)
        right = Math.min(document.width, right)
        bottom = Math.min(document.height, bottom)
        if (right <= left || bottom <= top) {
          left = 0
          top = 0
          right = document.width
          bottom = document.height
        }
      }
      const localShiftX = shiftedOffsetX - left
      const localShiftY = shiftedOffsetY - top
      source.freeTiles.instances = source.freeTiles.instances
        .map((instance) => ({ ...instance, x: instance.x + localShiftX, y: instance.y + localShiftY }))
        .filter((instance) => {
          if (!trimOutside) return true
          const sourceRef = freeTileSourceForInstance(sources, instance)
          if (!sourceRef) return false
          return left + instance.x < document.width
            && top + instance.y < document.height
            && left + instance.x + sourceRef.tileset.tileWidth > 0
            && top + instance.y + sourceRef.tileset.tileHeight > 0
        })
      source.surface = renderFreeTileSurface(
        source.freeTiles,
        sources,
        document.colorMode,
        Math.max(1, right - left),
        Math.max(1, bottom - top),
        left,
        top,
        document.colorMode === 'indexed' ? (color) => paletteColorIdForCanvas(document, color) : undefined
      )
      continue
    }
    if (activeSource || !source.surface) continue
    if (expanding && backgroundLayerIds.has(cel.layerId)) {
      const background = document.layers.find((layer) => layer.id === cel.layerId)?.background
      const repeatSize = background?.mode === 'preset' && background.pattern ? backgroundPatternSize(background.pattern) : undefined
      const presetPattern = background?.mode === 'preset' ? background.pattern : undefined
      tileBackgroundSurfaceToCanvas(source.surface, sourceCanvasWidth, sourceCanvasHeight, document.width, document.height, horizontal, vertical, repeatSize, presetPattern, (color) => paletteColorIdForCanvas(document, color))
      continue
    }
    source.surface.offsetX += horizontal
    source.surface.offsetY += vertical
    if (trimOutside) cropAnimationCelSurface(source.surface, document.width, document.height)
  }
  normalizeAnimationCelLinks(timeline)
  synchronizeLinkedLayerContentsForTimeline(document, timeline)
  applyFrameSurfaces(document, timeline)
}

export const cloneAnimationCel = (cel: AnimationCel): AnimationCel => ({
  ...cel,
  mask: undefined,
  surface: cel.surface ? cloneAnimationCelSurface(cel.surface) : undefined,
  text: cloneAnimationText(cel.text),
  tilemap: cloneAnimationTilemap(cel.tilemap),
  freeTiles: cloneAnimationFreeTiles(cel.freeTiles)
})

/** Create an isolated document snapshot for read-only animation previewing. */
export const cloneDocumentForAnimationFrame = (document: SpriteDocument, frameId: string): SpriteDocument => {
  const layers = document.layers.map((layer) => {
    const clone = layer.format === 'rgba'
      ? { ...layer, layerStyles: cloneLayerStyles(layer.layerStyles), background: layer.background ? { ...layer.background } : undefined, pixels: new Uint8ClampedArray(4) } as RasterLayer
      : { ...layer, layerStyles: cloneLayerStyles(layer.layerStyles), background: layer.background ? { ...layer.background } : undefined, pixels: new Uint32Array(1) } as RasterLayer
    assignRasterStorage(clone, layer)
    setLayerStorageOrigin(clone, getLayerStorageOrigin(layer))
    return clone
  })
  const preview: SpriteDocument = {
    ...document,
    layers,
    groups: document.groups.map((group) => ({ ...group, layerStyles: cloneLayerStyles(group.layerStyles), displayColor: group.displayColor ? { ...group.displayColor } : undefined })),
    palette: document.palette.map((entry) => ({ ...entry, color: { ...entry.color } })),
    paletteOrder: [...document.paletteOrder],
    paletteSlots: document.paletteSlots ? [...document.paletteSlots] : undefined,
    paletteColumns: document.paletteColumns,
    customBrushes: document.customBrushes?.map((brush) => ({ ...brush, coverage: brush.coverage.slice(), colors: brush.colors?.slice() })),
    tilesets: document.tilesets?.map(cloneTileset),
    animation: document.animation
      ? {
          ...document.animation,
          frames: document.animation.frames.map((frame) => ({ ...frame })),
          cels: document.animation.cels.map((cel) => ({ ...cel, mask: undefined, text: cloneAnimationText(cel.text), tilemap: cloneAnimationTilemap(cel.tilemap), freeTiles: cloneAnimationFreeTiles(cel.freeTiles), surface: cel.surface ? shareAnimationCelSurface(cel.surface) : undefined })),
          layerMasks: (document.animation.layerMasks ?? []).map((entry) => ({ ...entry, mask: { ...entry.mask, pixels: entry.mask.pixels } })),
          groupMasks: (document.animation.groupMasks ?? []).map((entry) => ({ ...entry, mask: { ...entry.mask, pixels: entry.mask.pixels } }))
        }
      : undefined
  }
  const timeline = ensureAnimationDocument(preview)
  if (timeline.frames.some((frame) => frame.id === frameId)) activateAnimationFrame(preview, frameId)
  return preview
}

const applySurfaceToLayer = (layer: RasterLayer, surface: AnimationCelSurface, opacity?: number): void => {
  if (layer.format !== surface.format) throw new Error('动画 cel 与图层颜色模式不一致')
  layer.width = surface.width
  layer.height = surface.height
  layer.offsetX = surface.offsetX
  layer.offsetY = surface.offsetY
  assignRasterStorage(layer, surface)
  if (Number.isFinite(opacity)) layer.opacity = Math.max(0, Math.min(1, opacity!))
  setLayerStorageOrigin(layer, { x: surface.storageOriginX ?? 0, y: surface.storageOriginY ?? 0 })
}

/**
 * Clear the currently displayed layer surface without changing its geometry
 * or allocating an animation cel. Selection-only switches can target sparse
 * frame slots, so the previous frame's pixels must not remain visible while
 * the slot itself stays absent from the timeline.
 */
const clearLayerSurface = (layer: RasterLayer): void => {
  const length = Math.max(1, layer.width * layer.height * (layer.format === 'rgba' ? 4 : 1))
  // Reuse an already materialized buffer where possible. Assigning a fresh
  // typed array for runtime-backed or malformed storage avoids forcing a
  // large lazy raster to materialize just to clear it, and the runtime-raster
  // setter drops the stale compressed backing store.
  if (!layer.runtimeRaster && layer.pixels.length === length) {
    layer.pixels.fill(0)
    return
  }
  layer.pixels = layer.format === 'rgba' ? new Uint8ClampedArray(length) : new Uint32Array(length)
  delete layer.runtimeRaster
}

const celsByLayerForFrame = (timeline: AnimationTimeline, frameId: string): Map<string, AnimationCel> => {
  const result = new Map<string, AnimationCel>()
  for (const cel of timeline.cels) if (cel.frameId === frameId) result.set(cel.layerId, cel)
  return result
}

const syncFrameSurfaces = (document: SpriteDocument, timeline: AnimationTimeline): void => {
  const activeCels = celsByLayerForFrame(timeline, timeline.activeFrameId)
  const lookup = createAnimationCelLookup(timeline)
  const membersBySource = new Map<string, AnimationCel[]>()
  for (const candidate of timeline.cels) {
    if (!candidate.linkedCelId) continue
    const source = lookup.resolve(candidate)
    if (!source) continue
    const members = membersBySource.get(source.id) ?? []
    members.push(candidate)
    membersBySource.set(source.id, members)
  }
  for (const layer of document.layers) {
    const cel = activeCels.get(layer.id)
    if (cel) {
      const source = lookup.resolve(cel) ?? cel
      source.surface = surfaceFromLayer(layer)
      source.opacity = layer.opacity
      for (const candidate of membersBySource.get(source.id) ?? []) {
        candidate.surface = source.surface
        candidate.opacity = source.opacity
      }
    }
  }
  synchronizeLinkedLayerContentsForTimeline(document, timeline, document.activeLayerId, timeline.activeFrameId)
}

const applyFrameSurfaces = (document: SpriteDocument, timeline: AnimationTimeline): void => {
  const activeCels = celsByLayerForFrame(timeline, timeline.activeFrameId)
  const lookup = createAnimationCelLookup(timeline)
  for (const layer of document.layers) {
    const cel = lookup.resolve(activeCels.get(layer.id) ?? null)
    if (cel?.surface) applySurfaceToLayer(layer, cel.surface, cel.opacity)
    else clearLayerSurface(layer)
  }
}

const normalizeAnimationCelLinks = (timeline: AnimationTimeline): void => {
  const byId = new Map(timeline.cels.map((cel) => [cel.id, cel]))
  for (const cel of timeline.cels) {
    if (!cel.linkedCelId) continue
    const linked = byId.get(cel.linkedCelId)
    if (!linked || linked.id === cel.id || linked.layerId !== cel.layerId) cel.linkedCelId = null
  }
  for (const cel of timeline.cels) {
    if (!cel.linkedCelId) continue
    const visited = new Set<string>()
    let current: AnimationCel | undefined = cel
    while (current?.linkedCelId) {
      if (visited.has(current.id)) {
        cel.linkedCelId = null
        current = undefined
        break
      }
      visited.add(current.id)
      current = byId.get(current.linkedCelId)
    }
    if (!current || current === cel) continue
    cel.linkedCelId = current.id
    cel.zIndex = normalizeAnimationCelZIndex(current.zIndex)
    cel.surface = current.surface
    cel.opacity = current.opacity
    cel.text = current.text
    cel.tilemap = current.tilemap
    cel.freeTiles = current.freeTiles
  }
}

const synchronizeLinkedLayerGroupContentsForTimeline = (
  document: SpriteDocument,
  timeline: AnimationTimeline,
  linkedContentId: string,
  preferredLayerId?: string,
  preferredFrameId?: string
): void => {
  const members = linkedLayerMembers(document, linkedContentId)
  if (members.length < 2) return
  const lookup = createAnimationCelLookup(timeline)
  const parent = new Map<string, string>()
  const nodes = new Map<string, AnimationCel>()
  const find = (id: string): string => {
    const current = parent.get(id) ?? id
    if (current === id) return id
    const root = find(current)
    parent.set(id, root)
    return root
  }
  const union = (left: string, right: string): void => {
    const leftRoot = find(left)
    const rightRoot = find(right)
    if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot)
  }
  for (const frame of timeline.frames) {
    const sources = members.flatMap((layer) => {
      const source = lookup.resolve(lookup.at(layer.id, frame.id))
      if (!source?.surface) return []
      nodes.set(source.id, source)
      parent.set(source.id, parent.get(source.id) ?? source.id)
      return [source]
    })
    for (let index = 1; index < sources.length; index += 1) union(sources[0].id, sources[index].id)
  }
  if (nodes.size < 2) return
  const components = new Map<string, AnimationCel[]>()
  for (const node of nodes.values()) {
    const root = find(node.id)
    const component = components.get(root) ?? []
    component.push(node)
    components.set(root, component)
  }
  const preferredFrame = preferredFrameId ?? timeline.activeFrameId
  const preferredSource = preferredLayerId ? lookup.resolve(lookup.at(preferredLayerId, preferredFrame)) : null
  const activeSource = lookup.resolve(lookup.at(document.activeLayerId, timeline.activeFrameId))
  for (const component of components.values()) {
    const preferred = preferredSource && component.some((candidate) => candidate.id === preferredSource.id) ? preferredSource : null
    const active = activeSource && component.some((candidate) => candidate.id === activeSource.id) ? activeSource : null
    const source = preferred ?? active ?? component[0]
    if (!source.surface) continue
    for (const candidate of component) if (candidate.surface) shareLinkedRasterContent(candidate.surface, source.surface)
  }
}

const synchronizeLinkedLayerContentsForTimeline = (
  document: SpriteDocument,
  timeline: AnimationTimeline,
  preferredLayerId?: string,
  preferredFrameId?: string
): void => {
  for (const linkedContentId of linkedLayerGroups(document).keys()) {
    synchronizeLinkedLayerGroupContentsForTimeline(document, timeline, linkedContentId, preferredLayerId, preferredFrameId)
  }
}

const applyLinkedLayerGroupActiveSurfaces = (document: SpriteDocument, timeline: AnimationTimeline, linkedContentId: string): void => {
  const lookup = createAnimationCelLookup(timeline)
  for (const layer of linkedLayerMembers(document, linkedContentId)) {
    const cel = lookup.at(layer.id, timeline.activeFrameId)
    const source = lookup.resolve(cel)
    if (source?.surface) applySurfaceToLayer(layer, source.surface, cel?.opacity)
  }
}

export const synchronizeLinkedLayerGroupContents = (
  document: SpriteDocument,
  linkedContentId: string,
  preferredLayerId?: string,
  preferredFrameId?: string
): void => {
  const timeline = ensureAnimationDocument(document, preferredLayerId, preferredFrameId)
  synchronizeLinkedLayerGroupContentsForTimeline(document, timeline, linkedContentId, preferredLayerId, preferredFrameId)
  applyLinkedLayerGroupActiveSurfaces(document, timeline, linkedContentId)
}

export const synchronizeLinkedLayerContents = (
  document: SpriteDocument,
  preferredLayerId?: string,
  preferredFrameId?: string
): void => {
  if (linkedLayerGroups(document).size === 0) return
  const timeline = ensureAnimationDocument(document, preferredLayerId, preferredFrameId)
  synchronizeLinkedLayerContentsForTimeline(document, timeline, preferredLayerId, preferredFrameId)
  applyFrameSurfaces(document, timeline)
}

export const detachLinkedLayerContent = (document: SpriteDocument, layerId: string): void => {
  const layer = document.layers.find((candidate) => candidate.id === layerId)
  if (!layer?.linkedContentId) return
  const timeline = ensureAnimationDocument(document, layerId, document.animation?.activeFrameId)
  const lookup = createAnimationCelLookup(timeline)
  const clonedBySourceId = new Map<string, AnimationCelSurface>()
  for (const cel of timeline.cels) {
    if (cel.layerId !== layerId) continue
    const source = lookup.resolve(cel) ?? cel
    if (source.layerId !== layerId || !source.surface) continue
    let surface = clonedBySourceId.get(source.id)
    if (!surface) {
      surface = cloneAnimationCelSurface(source.surface)
      clonedBySourceId.set(source.id, surface)
      source.surface = surface
    }
    if (cel === source) cel.surface = surface
  }
  delete layer.linkedContentId
  const active = lookup.at(layerId, timeline.activeFrameId)
  const activeSource = lookup.resolve(active) ?? active
  if (activeSource?.surface) applySurfaceToLayer(layer, activeSource.surface, active?.opacity)
}

const normalizeAnimationMaskLinks = (timeline: AnimationTimeline): void => {
  const masks = [...(timeline.layerMasks ?? []).map((entry) => entry.mask), ...(timeline.groupMasks ?? []).map((entry) => entry.mask)]
  const byId = new Map(masks.map((mask) => [mask.id, mask]))
  for (const mask of masks) {
    if (!mask.linkedMaskId) continue
    const linked = byId.get(mask.linkedMaskId)
    if (!linked || linked.id === mask.id) mask.linkedMaskId = null
  }
  for (const mask of masks) {
    if (!mask.linkedMaskId) continue
    const resolved = resolveAnimationMask(timeline, mask)
    if (!resolved || resolved === mask) mask.linkedMaskId = null
    else mask.linkedMaskId = resolved.id
  }
}

/** 为旧工程或新图层补齐每个帧槽位，并让活动帧引用当前图层像素。 */
export const ensureAnimationDocument = (
  document: SpriteDocument,
  preferredLinkedLayerId?: string,
  preferredLinkedFrameId?: string
): AnimationTimeline => {
  const timeline = document.animation ?? createDefaultAnimationTimeline()
  document.animation = timeline
  normalizeLinkedLayerMetadata(document)
  timeline.loopSections ??= []
  const frameIds = new Set(timeline.frames.map((frame) => frame.id))
  const layers = new Map(document.layers.map((layer) => [layer.id, layer]))
  const groups = new Set(document.groups.map((group) => group.id))
  timeline.cels = timeline.cels.filter((cel) => frameIds.has(cel.frameId) && layers.has(cel.layerId))
  timeline.layerMasks = (timeline.layerMasks ?? []).filter((entry) => frameIds.has(entry.frameId) && layers.has(entry.layerId))
  timeline.groupMasks = (timeline.groupMasks ?? []).filter((entry) => frameIds.has(entry.frameId) && groups.has(entry.groupId))
  const celsBySlot = new Map(timeline.cels.map((cel) => [celSlotKey(cel.layerId, cel.frameId), cel]))
  const tilemapTemplateByLayer = new Map<string, TilemapCelData>()
  const freeTileTemplateByLayer = new Map<string, FreeTileCelData>()
  for (const cel of timeline.cels) if (cel.tilemap && !tilemapTemplateByLayer.has(cel.layerId)) tilemapTemplateByLayer.set(cel.layerId, cel.tilemap)
  for (const cel of timeline.cels) if (cel.freeTiles && !freeTileTemplateByLayer.has(cel.layerId)) freeTileTemplateByLayer.set(cel.layerId, cel.freeTiles)
  const nextCelId = createAnimationIdAllocator(timeline, 'cel')
  for (const layer of document.layers) {
    for (const frame of timeline.frames) {
      const slot = celSlotKey(layer.id, frame.id)
      let cel = celsBySlot.get(slot)
      if (!cel) {
        const tilemap = layer.kind === 'tilemap' ? blankAnimationTilemap(tilemapTemplateByLayer.get(layer.id)) : undefined
        const freeTiles = layer.kind === 'free-tile' ? blankAnimationFreeTiles(freeTileTemplateByLayer.get(layer.id)) ?? createFreeTileCelData() : undefined
        const freeTileSources = layer.kind === 'free-tile' ? freeTileSourceRefs(layer.freeTileSources, document.tilesets ?? []) : []
        cel = {
          id: nextCelId(),
          layerId: layer.id,
          frameId: frame.id,
          opacity: layer.opacity,
          surface: frame.id === timeline.activeFrameId
            ? surfaceFromLayer(layer)
            : tilemap
              ? renderTilemapSurface(tilemap, document.tilesets ?? [], document.colorMode)
              : freeTiles && freeTileSources.length > 0
                ? renderFreeTileSurface(freeTiles, freeTileSources, document.colorMode, document.width, document.height)
              : blankSurfaceFromLayer(layer),
          ...(tilemap ? { tilemap } : {}),
          ...(freeTiles ? { freeTiles } : {})
        }
        timeline.cels.push(cel)
        celsBySlot.set(slot, cel)
      } else if (!cel.surface || cel.surface.format !== layer.format) {
        cel.surface = frame.id === timeline.activeFrameId ? surfaceFromLayer(layer) : blankSurfaceFromLayer(layer)
      }
      if (frame.id === timeline.activeFrameId && cel.surface && rasterStorageIdentity(cel.surface) === rasterStorageIdentity(layer)) {
        cel.surface = updateSurfaceFromLayer(cel.surface, layer)
        cel.opacity = layer.opacity
      }
      if (!Number.isFinite(cel.opacity)) cel.opacity = layer.opacity
    }
  }
  normalizeAnimationCelLinks(timeline)
  synchronizeLinkedLayerContentsForTimeline(document, timeline, preferredLinkedLayerId, preferredLinkedFrameId)
  normalizeAnimationMaskLinks(timeline)
  return timeline
}

export const connectAnimationCels = (document: SpriteDocument, celIds: readonly string[]): boolean => {
  const timeline = ensureAnimationDocument(document)
  syncFrameSurfaces(document, timeline)
  const selected = new Set(celIds)
  const frameIndex = new Map(timeline.frames.map((frame, index) => [frame.id, index]))
  const byLayer = new Map<string, AnimationCel[]>()
  for (const cel of timeline.cels) {
    if (!selected.has(cel.id)) continue
    const group = byLayer.get(cel.layerId) ?? []
    group.push(cel)
    byLayer.set(cel.layerId, group)
  }
  let changed = false
  for (const cels of byLayer.values()) {
    if (cels.length < 2) continue
    cels.sort((left, right) => (frameIndex.get(left.frameId) ?? 0) - (frameIndex.get(right.frameId) ?? 0))
    const firstContent = cels.find((cel) => animationCelHasContent(resolveAnimationCel(timeline, cel), document.palette))
    if (!firstContent) continue
    const source = resolveAnimationCel(timeline, firstContent) ?? firstContent
    for (const cel of cels) {
      if (cel.id === source.id) {
        if (cel.linkedCelId) changed = true
        cel.linkedCelId = null
        continue
      }
      if (cel.linkedCelId !== source.id || cel.surface !== source.surface || cel.opacity !== source.opacity || normalizeAnimationCelZIndex(cel.zIndex) !== normalizeAnimationCelZIndex(source.zIndex)) changed = true
      cel.linkedCelId = source.id
      cel.zIndex = normalizeAnimationCelZIndex(source.zIndex)
      cel.surface = source.surface
      cel.opacity = source.opacity
      cel.text = source.text
      cel.tilemap = source.tilemap
      cel.freeTiles = source.freeTiles
    }
  }
  normalizeAnimationCelLinks(timeline)
  applyFrameSurfaces(document, timeline)
  return changed
}

/** Links target-frame cels directly to resolved source cels that contain visible content. */
export const linkAnimationFrameCels = (document: SpriteDocument, sourceFrameId: string, targetFrameId: string, layerIds: readonly string[]): boolean => {
  const timeline = ensureAnimationDocument(document)
  if (sourceFrameId === targetFrameId) return false
  syncFrameSurfaces(document, timeline)
  const lookup = createAnimationCelLookup(timeline)
  let changed = false
  for (const layerId of new Set(layerIds)) {
    const sourceSlot = lookup.at(layerId, sourceFrameId)
    const target = lookup.at(layerId, targetFrameId)
    const source = lookup.resolve(sourceSlot) ?? sourceSlot
    if (!source || !target || source.id === target.id || !animationCelHasContent(source, document.palette)) continue
    target.linkedCelId = source.id
    target.zIndex = normalizeAnimationCelZIndex(source.zIndex)
    target.surface = source.surface
    target.opacity = source.opacity
    target.text = source.text
    target.tilemap = source.tilemap
    target.freeTiles = source.freeTiles
    changed = true
  }
  normalizeAnimationCelLinks(timeline)
  applyFrameSurfaces(document, timeline)
  return changed
}

/** Inherit the previous frame's cel link for opted-in raster layers. */
export const inheritAnimationFrameCelLinks = (
  document: SpriteDocument,
  sourceFrameId: string,
  targetFrameId: string,
  layerIds: readonly string[] = document.layers.map((layer) => layer.id)
): boolean => {
  const timeline = ensureAnimationDocument(document)
  if (sourceFrameId === targetFrameId) return false
  syncFrameSurfaces(document, timeline)
  const lookup = createAnimationCelLookup(timeline)
  let changed = false
  for (const layerId of new Set(layerIds)) {
    const layer = document.layers.find((candidate) => candidate.id === layerId)
    if (!layer?.autoLinkAnimationCels) continue
    const sourceSlot = lookup.at(layerId, sourceFrameId)
    const target = lookup.at(layerId, targetFrameId)
    if (!sourceSlot || !target) continue
    // A source cel may be independent (the common first-frame case) or
    // already linked to an earlier cel. Empty independent cels remain empty;
    // only visible content starts a new canonical link chain.
    if (!sourceSlot.linkedCelId && !animationCelHasContent(sourceSlot, document.palette)) continue
    const source = lookup.resolve(sourceSlot) ?? sourceSlot
    if (!source || source.id === target.id) continue
    if (target.linkedCelId !== source.id || target.surface !== source.surface || target.opacity !== source.opacity || normalizeAnimationCelZIndex(target.zIndex) !== normalizeAnimationCelZIndex(source.zIndex)) changed = true
    target.linkedCelId = source.id
    target.zIndex = normalizeAnimationCelZIndex(source.zIndex)
    target.surface = source.surface
    target.opacity = source.opacity
    target.text = source.text
    target.tilemap = source.tilemap
    target.freeTiles = source.freeTiles
  }
  normalizeAnimationCelLinks(timeline)
  applyFrameSurfaces(document, timeline)
  return changed
}

/** Inherit per-mask links for ordinary layer masks when their owner opts in. */
export const inheritAnimationFrameMaskLinks = (document: SpriteDocument, sourceFrameId: string, targetFrameId: string): boolean => {
  const timeline = ensureAnimationDocument(document)
  if (sourceFrameId === targetFrameId) return false
  syncFrameSurfaces(document, timeline)
  const celLookup = createAnimationCelLookup(timeline)
  const maskBySlot = new Map<string, LayerMask>()
  const maskById = new Map<string, LayerMask>()
  for (const entry of timeline.layerMasks ?? []) {
    maskBySlot.set(`${entry.layerId}:${entry.frameId}`, entry.mask)
    maskById.set(entry.mask.id, entry.mask)
  }
  for (const entry of timeline.groupMasks ?? []) {
    maskBySlot.set(`${entry.groupId}:${entry.frameId}`, entry.mask)
    maskById.set(entry.mask.id, entry.mask)
  }
  const resolveMask = (mask: LayerMask): LayerMask => {
    const visited = new Set<string>()
    let current = mask
    while (current.linkedMaskId && !visited.has(current.id)) {
      visited.add(current.id)
      const linked = maskById.get(current.linkedMaskId)
      if (!linked) break
      current = linked
    }
    return current
  }
  let changed = false
  for (const layer of document.layers) {
    const sourceCel = celLookup.at(layer.id, sourceFrameId)
    const targetCel = celLookup.at(layer.id, targetFrameId)
    const sourceMask = maskBySlot.get(`${layer.id}:${sourceFrameId}`) ?? null
    if (!sourceCel || !targetCel || !sourceMask || sourceMask.autoLinkAnimationCels !== true) continue
    const targetMask = maskBySlot.get(`${layer.id}:${targetFrameId}`) ?? null
    const rootMask = resolveMask(sourceMask)
    if (!targetMask) {
      const mask = cloneLayerMaskForCel(rootMask, targetCel.layerId, createId('mask'))
      mask.linkedMaskId = rootMask.id
      timeline.layerMasks ??= []
      timeline.layerMasks.push({ layerId: targetCel.layerId, frameId: targetCel.frameId, mask })
      changed = true
    } else if (targetMask.linkedMaskId !== rootMask.id) {
      targetMask.linkedMaskId = rootMask.id
      changed = true
    }
  }
  return changed
}

/** Break links only for the requested cels while preserving their current pixels. */
export const disconnectAnimationCels = (document: SpriteDocument, celIds: readonly string[]): boolean => {
  const timeline = ensureAnimationDocument(document)
  syncFrameSurfaces(document, timeline)
  const selected = new Set(celIds)
  const selectedSourceIds = new Set<string>()
  for (const cel of timeline.cels) {
    if (!selected.has(cel.id)) continue
    const source = resolveAnimationCel(timeline, cel)
    if (source?.id === cel.id && timeline.cels.some((candidate) => candidate.id !== source.id && resolveAnimationCel(timeline, candidate)?.id === source.id)) {
      selectedSourceIds.add(source.id)
    }
  }
  let changed = false
  for (const cel of timeline.cels) {
    const resolved = resolveAnimationCel(timeline, cel)
    const selectedThroughSource = Boolean(resolved && selectedSourceIds.has(resolved.id))
    if ((!selected.has(cel.id) && !selectedThroughSource) || !cel.linkedCelId) continue
    const source = resolveAnimationCel(timeline, cel)
    if (!source) continue
    cel.zIndex = normalizeAnimationCelZIndex(source.zIndex)
    cel.surface = source.surface ? cloneAnimationCelSurface(source.surface) : undefined
    cel.opacity = source.opacity
    cel.text = cloneAnimationText(source.text)
    cel.tilemap = cloneAnimationTilemap(source.tilemap)
    cel.freeTiles = cloneAnimationFreeTiles(source.freeTiles)
    cel.linkedCelId = null
    changed = true
  }
  normalizeAnimationCelLinks(timeline)
  applyFrameSurfaces(document, timeline)
  return changed
}

export const syncActiveAnimationFrame = (document: SpriteDocument): void => {
  const timeline = ensureAnimationDocument(document)
  syncFrameSurfaces(document, timeline)
  applyFrameSurfaces(document, timeline)
}

const syncAnimationLayerSurface = (timeline: AnimationTimeline, lookup: AnimationCelLookup, layer: RasterLayer): boolean => {
  const cel = lookup.at(layer.id, timeline.activeFrameId)
  if (!cel) return false
  const source = lookup.resolve(cel) ?? cel
  source.surface = source.surface ? updateSurfaceFromLayer(source.surface, layer) : surfaceFromLayer(layer)
  source.opacity = layer.opacity
  if (cel !== source) {
    cel.surface = source.surface
    cel.opacity = source.opacity
  }
  return true
}

/** Synchronizes the active frame with one index build and no timeline normalization. */
export const syncActiveAnimationLayers = (document: SpriteDocument): void => {
  const timeline = document.animation
  if (!timeline) {
    syncActiveAnimationFrame(document)
    return
  }
  const lookup = createAnimationCelLookup(timeline)
  if (document.layers.some((layer) => !lookup.at(layer.id, timeline.activeFrameId))) {
    syncActiveAnimationFrame(document)
    return
  }
  for (const layer of document.layers) syncAnimationLayerSurface(timeline, lookup, layer)
  synchronizeLinkedLayerContentsForTimeline(document, timeline, document.activeLayerId, timeline.activeFrameId)
  applyFrameSurfaces(document, timeline)
}

/** Keeps a pixel edit on one active layer out of the full layer-by-frame normalization path. */
export const syncActiveAnimationLayer = (document: SpriteDocument, layerId: string): void => {
  const timeline = document.animation
  const layer = document.layers.find((candidate) => candidate.id === layerId)
  if (!timeline || !layer) return
  const cel = animationCelAt(timeline, layerId, timeline.activeFrameId)
  if (!cel) {
    syncActiveAnimationFrame(document)
    return
  }
  const lookup = cel.linkedCelId ? createAnimationCelLookup(timeline) : { at: () => cel, resolve: () => cel }
  syncAnimationLayerSurface(timeline, lookup, layer)
  if (layer.linkedContentId) {
    synchronizeLinkedLayerGroupContentsForTimeline(document, timeline, layer.linkedContentId, layer.id, timeline.activeFrameId)
    applyLinkedLayerGroupActiveSurfaces(document, timeline, layer.linkedContentId)
  }
}

export const refreshActiveAnimationFrame = (document: SpriteDocument): void => {
  const timeline = ensureAnimationDocument(document)
  applyFrameSurfaces(document, timeline)
}

export const animationCelOffsetsForKeys = (document: SpriteDocument, keys: readonly string[]): Record<string, { x: number; y: number }> => {
  const timeline = ensureAnimationDocument(document)
  const lookup = createAnimationCelLookup(timeline)
  const offsets: Record<string, { x: number; y: number }> = {}
  for (const key of keys) {
    const target = parseAnimationCelKey(key)
    if (!target) continue
    const cel = lookup.resolve(lookup.at(target.layerId, target.frameId))
    if (!cel?.surface) continue
    offsets[key] = { x: cel.surface.offsetX, y: cel.surface.offsetY }
  }
  return offsets
}

export const setAnimationCelOffsetsForKeys = (document: SpriteDocument, offsets: Readonly<Record<string, { x: number; y: number }>>): void => {
  const timeline = ensureAnimationDocument(document)
  const lookup = createAnimationCelLookup(timeline)
  for (const [key, offset] of Object.entries(offsets)) {
    const target = parseAnimationCelKey(key)
    if (!target) continue
    const cel = lookup.resolve(lookup.at(target.layerId, target.frameId))
    if (!cel?.surface) continue
    if (cel.text) translateTextCelData(cel.text, offset.x - cel.surface.offsetX, offset.y - cel.surface.offsetY)
    cel.surface.offsetX = offset.x
    cel.surface.offsetY = offset.y
  }
  applyFrameSurfaces(document, timeline)
}

export const setAnimationCelOffsets = (document: SpriteDocument, frameId: string, offsets: Readonly<Record<string, { x: number; y: number }>>): void => {
  setAnimationCelOffsetsForKeys(document, Object.fromEntries(Object.entries(offsets).map(([layerId, offset]) => [animationCelKey(layerId, frameId), offset])))
}

export const activateAnimationFrame = (document: SpriteDocument, frameId: string, materialize = true): boolean => {
  const timeline = materialize ? ensureAnimationDocument(document) : document.animation
  if (!timeline) return false
  if (timeline.activeFrameId === frameId) return true
  if (!timeline.frames.some((frame) => frame.id === frameId)) return false
  if (!materialize) {
    const lookup = createAnimationCelLookup(timeline)
    // Persist the currently displayed layer pixels only into cels that
    // already exist and already own a surface. Sparse empty slots remain
    // untouched; selection must not allocate their raster storage.
    for (const layer of document.layers) {
      const cel = lookup.at(layer.id, timeline.activeFrameId)
      const source = lookup.resolve(cel)
      if (!source?.surface) continue
      syncAnimationLayerSurface(timeline, lookup, layer)
    }
    timeline.activeFrameId = frameId
    // Apply only cels that already exist. Sparse/empty slots stay absent and
    // are never allocated by a selection-only frame switch.
    applyFrameSurfaces(document, timeline)
    return true
  }
  syncFrameSurfaces(document, timeline)
  timeline.activeFrameId = frameId
  applyFrameSurfaces(document, timeline)
  return true
}

export const addBlankAnimationFrame = (document: SpriteDocument): string => {
  const timeline = ensureAnimationDocument(document)
  syncFrameSurfaces(document, timeline)
  const sourceFrameId = timeline.activeFrameId
  const previousFrames = [...timeline.frames]
  const activeIndex = Math.max(0, timeline.frames.findIndex((frame) => frame.id === sourceFrameId))
  const id = uniqueAnimationId(timeline, 'frame')
  timeline.frames.splice(activeIndex + 1, 0, { id, duration: DEFAULT_FRAME_DURATION })
  timeline.loopSections = reconcileAnimationLoopSectionsAfterFrameInsertion(timeline.loopSections, previousFrames, sourceFrameId, id)
  const nextCelId = createAnimationIdAllocator(timeline, 'cel')
  const lookup = createAnimationCelLookup(timeline)
  for (const layer of document.layers) {
    const source = lookup.resolve(lookup.at(layer.id, timeline.activeFrameId))
    const tilemap = layer.kind === 'tilemap' ? blankAnimationTilemap(source?.tilemap) : undefined
    const freeTiles = layer.kind === 'free-tile' ? blankAnimationFreeTiles(source?.freeTiles) ?? createFreeTileCelData() : undefined
    const freeTileSources = layer.kind === 'free-tile' ? freeTileSourceRefs(layer.freeTileSources, document.tilesets ?? []) : []
    timeline.cels.push({
      id: nextCelId(),
      layerId: layer.id,
      frameId: id,
      opacity: layer.opacity,
      surface: tilemap
        ? renderTilemapSurface(tilemap, document.tilesets ?? [], document.colorMode, source?.surface?.offsetX ?? 0, source?.surface?.offsetY ?? 0)
        : freeTiles && freeTileSources.length > 0
          ? renderFreeTileSurface(freeTiles, freeTileSources, document.colorMode, source?.surface?.width ?? document.width, source?.surface?.height ?? document.height, source?.surface?.offsetX ?? 0, source?.surface?.offsetY ?? 0)
        : blankSurfaceFromLayer(layer),
      ...(tilemap ? { tilemap } : {}),
      ...(freeTiles ? { freeTiles } : {})
    })
  }
  inheritAnimationFrameCelLinks(document, sourceFrameId, id)
  inheritAnimationFrameMaskLinks(document, sourceFrameId, id)
  timeline.activeFrameId = id
  applyFrameSurfaces(document, timeline)
  return id
}

export const duplicateAnimationFrame = (document: SpriteDocument): string => {
  const timeline = ensureAnimationDocument(document)
  syncFrameSurfaces(document, timeline)
  const sourceId = timeline.activeFrameId
  const previousFrames = [...timeline.frames]
  const sourceIndex = Math.max(0, timeline.frames.findIndex((frame) => frame.id === sourceId))
  const id = uniqueAnimationId(timeline, 'frame')
  const sourceFrame = timeline.frames[sourceIndex]
  timeline.frames.splice(sourceIndex + 1, 0, {
    id,
    duration: sourceFrame?.duration ?? DEFAULT_FRAME_DURATION,
    ...(sourceFrame?.disabled === true ? { disabled: true } : {})
  })
  timeline.loopSections = reconcileAnimationLoopSectionsAfterFrameInsertion(timeline.loopSections, previousFrames, sourceId, id)
  const sourceCels = celsByLayerForFrame(timeline, sourceId)
  const nextCelId = createAnimationIdAllocator(timeline, 'cel')
  for (const layer of document.layers) {
    const sourceCel = sourceCels.get(layer.id)
    const resolvedSourceCel = resolveAnimationCel(timeline, sourceCel ?? null)
    const source = resolvedSourceCel?.surface ?? blankSurfaceFromLayer(layer)
    const celId = nextCelId()
  timeline.cels.push({ id: celId, layerId: layer.id, frameId: id, zIndex: normalizeAnimationCelZIndex(resolvedSourceCel?.zIndex), opacity: resolvedSourceCel?.opacity ?? layer.opacity, surface: cloneAnimationCelSurface(source), tilemap: cloneAnimationTilemap(resolvedSourceCel?.tilemap), freeTiles: cloneAnimationFreeTiles(resolvedSourceCel?.freeTiles) })
  }
  for (const entry of (timeline.layerMasks ?? []).filter((candidate) => candidate.frameId === sourceId)) {
    timeline.layerMasks!.push(cloneAnimationLayerMask(entry, entry.layerId, id, createId('mask')))
  }
  for (const entry of (timeline.groupMasks ?? []).filter((candidate) => candidate.frameId === sourceId)) {
    timeline.groupMasks!.push(cloneAnimationGroupMask(entry, entry.groupId, id, createId('mask')))
  }
  inheritAnimationFrameCelLinks(document, sourceId, id)
  inheritAnimationFrameMaskLinks(document, sourceId, id)
  timeline.activeFrameId = id
  applyFrameSurfaces(document, timeline)
  return id
}

export const deleteAnimationFrame = (document: SpriteDocument, frameId = document.animation?.activeFrameId): boolean => {
  const timeline = ensureAnimationDocument(document)
  if (!frameId || timeline.frames.length <= 1) return false
  const index = timeline.frames.findIndex((frame) => frame.id === frameId)
  if (index < 0) return false
  syncFrameSurfaces(document, timeline)
  const previousFrames = [...timeline.frames]
  timeline.frames.splice(index, 1)
  timeline.cels = timeline.cels.filter((cel) => cel.frameId !== frameId)
  timeline.layerMasks = (timeline.layerMasks ?? []).filter((entry) => entry.frameId !== frameId)
  timeline.groupMasks = (timeline.groupMasks ?? []).filter((entry) => entry.frameId !== frameId)
  timeline.loopSections = reconcileAnimationLoopSectionsAfterFrameDeletion(timeline.loopSections, previousFrames, timeline.frames, frameId)
  if (timeline.activeFrameId === frameId) {
    timeline.activeFrameId = timeline.frames[Math.min(index, timeline.frames.length - 1)].id
    applyFrameSurfaces(document, timeline)
  }
  return true
}

export const setAnimationFrameDuration = (document: SpriteDocument, frameId: string, duration: number): boolean => {
  const frame = animationFrameAt(ensureAnimationDocument(document), frameId)
  if (!frame) return false
  frame.duration = Math.max(1, Math.min(MAX_ANIMATION_FRAME_DURATION, Math.trunc(duration) || DEFAULT_FRAME_DURATION))
  return true
}

export const setAnimationLoop = (document: SpriteDocument, loop: boolean): void => {
  ensureAnimationDocument(document).loop = loop
}

export const firstPlayableAnimationFrameId = (timeline: Pick<AnimationTimeline, 'frames'>): string | null =>
  timeline.frames.find((frame) => frame.disabled !== true)?.id ?? null

export const nextAnimationFrameId = (timeline: AnimationTimeline, frameId: string): string | null => {
  const index = timeline.frames.findIndex((frame) => frame.id === frameId)
  if (index < 0) return firstPlayableAnimationFrameId(timeline)
  const next = timeline.frames.slice(index + 1).find((frame) => frame.disabled !== true)
  if (next) return next.id
  if (timeline.loop) return firstPlayableAnimationFrameId(timeline)
  return timeline.frames[index]?.disabled === true ? null : frameId
}

export const stepAnimationFrameId = (timeline: Pick<AnimationTimeline, 'frames'>, frameId: string, direction: -1 | 1): string | null => {
  if (timeline.frames.length === 0) return null
  const currentIndex = timeline.frames.findIndex((frame) => frame.id === frameId)
  const startIndex = currentIndex >= 0 ? currentIndex : direction > 0 ? -1 : 0
  for (let offset = 1; offset <= timeline.frames.length; offset += 1) {
    const index = (startIndex + direction * offset + timeline.frames.length) % timeline.frames.length
    const frame = timeline.frames[index]
    if (frame?.disabled !== true) return frame?.id ?? null
  }
  return null
}

export const cloneAnimationCelsForLayer = (document: SpriteDocument, sourceLayerId: string, targetLayer: RasterLayer): void => {
  const timeline = ensureAnimationDocument(document)
  timeline.cels = timeline.cels.filter((cel) => cel.layerId !== targetLayer.id)
  const sourceCels = new Map(timeline.cels.filter((cel) => cel.layerId === sourceLayerId).map((cel) => [cel.frameId, cel]))
  const nextCelId = createAnimationIdAllocator(timeline, 'cel')
  for (const frame of timeline.frames) {
    const sourceCel = sourceCels.get(frame.id)
    const resolvedSourceCel = resolveAnimationCel(timeline, sourceCel ?? null)
    const source = resolvedSourceCel?.surface
    const celId = nextCelId()
    timeline.cels.push({
      id: celId,
      layerId: targetLayer.id,
      frameId: frame.id,
      opacity: sourceCel?.opacity ?? targetLayer.opacity,
      surface: source ? cloneAnimationCelSurface(source) : blankSurfaceFromLayer(targetLayer),
      text: cloneAnimationText(resolvedSourceCel?.text),
      tilemap: cloneAnimationTilemap(resolvedSourceCel?.tilemap),
      freeTiles: cloneAnimationFreeTiles(resolvedSourceCel?.freeTiles)
    })
  }
  for (const entry of (timeline.layerMasks ?? []).filter((candidate) => candidate.layerId === sourceLayerId)) {
    timeline.layerMasks!.push(cloneAnimationLayerMask(entry, targetLayer.id, entry.frameId, createId('mask')))
  }
  if (targetLayer.linkedContentId) synchronizeLinkedLayerGroupContentsForTimeline(document, timeline, targetLayer.linkedContentId, sourceLayerId, timeline.activeFrameId)
  const active = animationCelAt(timeline, targetLayer.id, timeline.activeFrameId)
  const activeSource = resolveAnimationCel(timeline, active)
  if (activeSource?.surface) applySurfaceToLayer(targetLayer, activeSource.surface, active?.opacity)
}

export const removeAnimationCelsForLayers = (document: SpriteDocument, layerIds: readonly string[]): AnimationCel[] => {
  const timeline = ensureAnimationDocument(document)
  const ids = new Set(layerIds)
  const removed = timeline.cels.filter((cel) => ids.has(cel.layerId))
  timeline.cels = timeline.cels.filter((cel) => !ids.has(cel.layerId))
  return removed
}

export const restoreAnimationCels = (document: SpriteDocument, cels: readonly AnimationCel[]): void => {
  const timeline = ensureAnimationDocument(document)
  const incomingSlots = new Set(cels.map((cel) => `${cel.layerId}:${cel.frameId}`))
  timeline.cels = timeline.cels.filter((cel) => !incomingSlots.has(`${cel.layerId}:${cel.frameId}`))
  for (const cel of cels) {
    timeline.cels.push(cloneAnimationCel(cel))
  }
  normalizeAnimationCelLinks(timeline)
  const synchronized = new Set<string>()
  for (const cel of cels) {
    const layer = document.layers.find((candidate) => candidate.id === cel.layerId)
    if (!layer?.linkedContentId || synchronized.has(layer.linkedContentId)) continue
    synchronized.add(layer.linkedContentId)
    synchronizeLinkedLayerGroupContentsForTimeline(document, timeline, layer.linkedContentId, layer.id, cel.frameId)
  }
  refreshActiveAnimationFrame(document)
}

const layerFromAnimationCel = (layer: RasterLayer | undefined, cel: AnimationCel | null): RasterLayer | null => {
  const surface = cel?.surface
  if (!layer || !surface || layer.format !== surface.format) return null
  const target: RasterLayer | null = layer.format === 'rgba' && surface.format === 'rgba'
    ? { ...layer, width: surface.width, height: surface.height, offsetX: surface.offsetX, offsetY: surface.offsetY, pixels: new Uint8ClampedArray(4) }
    : layer.format === 'indexed' && surface.format === 'indexed'
      ? { ...layer, width: surface.width, height: surface.height, offsetX: surface.offsetX, offsetY: surface.offsetY, pixels: new Uint32Array(1) }
      : null
  if (target) assignRasterStorage(target, surface)
  if (target) setLayerStorageOrigin(target, { x: surface.storageOriginX ?? 0, y: surface.storageOriginY ?? 0 })
  if (target && Number.isFinite(cel?.opacity)) target.opacity = cel!.opacity!
  return target
}

/** Resolves every layer for one frame with a single cel index build. */
export const animationLayersAtFrame = (document: SpriteDocument, frameId: string): RasterLayer[] => {
  const timeline = ensureAnimationDocument(document)
  const lookup = createAnimationCelLookup(timeline)
  return document.layers.map((layer) => layerFromAnimationCel(layer, lookup.resolve(lookup.at(layer.id, frameId))) ?? layer)
}

/** 供撤销系统在非活动帧中原位写回像素。 */
export const animationLayerAtFrame = (document: SpriteDocument, layerId: string, frameId: string): RasterLayer | null => {
  const layer = document.layers.find((candidate) => candidate.id === layerId)
  const timeline = ensureAnimationDocument(document)
  const lookup = createAnimationCelLookup(timeline)
  return layerFromAnimationCel(layer, lookup.resolve(lookup.at(layerId, frameId)))
}

/** Persists geometry and raster storage from an editable frame proxy back to its resolved cel source. */
export const syncAnimationLayerAtFrame = (document: SpriteDocument, layer: RasterLayer, frameId: string): boolean => {
  const timeline = ensureAnimationDocument(document)
  const lookup = createAnimationCelLookup(timeline)
  const cel = lookup.at(layer.id, frameId)
  if (!cel) return false
  const source = lookup.resolve(cel) ?? cel
  source.surface = source.surface ? updateSurfaceFromLayer(source.surface, layer) : surfaceFromLayer(layer)
  if (cel !== source) cel.surface = source.surface
  const documentLayer = document.layers.find((candidate) => candidate.id === layer.id)
  if (documentLayer?.linkedContentId) {
    synchronizeLinkedLayerGroupContentsForTimeline(document, timeline, documentLayer.linkedContentId, layer.id, frameId)
    if (timeline.activeFrameId === frameId) applyLinkedLayerGroupActiveSurfaces(document, timeline, documentLayer.linkedContentId)
  }
  return true
}

/** Updates cel geometry without copying or materializing its raster storage. */
export const setAnimationLayerOffsetsAtFrame = (document: SpriteDocument, layerId: string, frameId: string, offsetX: number, offsetY: number): void => {
  const layer = document.layers.find((candidate) => candidate.id === layerId)
  const timeline = document.animation
  if (!timeline) {
    if (layer) {
      layer.offsetX = offsetX
      layer.offsetY = offsetY
    }
    return
  }
  const cel = animationCelAt(timeline, layerId, frameId)
  const source = cel ? resolveAnimationCel(timeline, cel) ?? cel : null
  if (source?.surface) {
    source.surface.offsetX = offsetX
    source.surface.offsetY = offsetY
    if (cel && cel !== source) cel.surface = source.surface
  }
  if (layer && timeline.activeFrameId === frameId) {
    layer.offsetX = offsetX
    layer.offsetY = offsetY
  }
}
