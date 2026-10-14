import type { AnimationCel, AnimationCelSurface } from '@shared/types-animation'
import type { SpriteDocument } from '@shared/types-document'
import type { SelectionRect } from '@shared/types-selection'
import type { LayerMask } from '@shared/types-layer'
import type { PaletteEntry } from '@shared/types-color'
import { animationCelAt, layerFromAnimationCel, cloneAnimationCel, cloneAnimationGroupMask, cloneAnimationLayerMask, resolveAnimationCel } from './animation'
import { createId, getLayerIdsInGroup, isLayerEffectivelyLocked, isLayerEffectivelyVisible, paletteColorIdForCanvas, rasterContentBounds, resolveAnimationMask } from './document-model'
import { shareRasterLayer } from './layer-preview'
import { inverseTransformedSelectionPoint, remapTransformedSelectionPoint } from './selection'
import { readSurfacePackedLocal } from './runtime-raster'
import { translateCurrent as tr } from './localization'
import { resolveAnimationLoopSectionRange } from './animation-loop-sections'
import { crossfadeTweenSurface } from './animation-crossfade'
import { morphTweenSurface, prepareMorphTween } from './animation-morph'
import { betweenTweenMask } from './animation-tween-masks'
import { compositeRegion } from './document-composite'
import { layerStyleOutputBounds } from './layer-styles'

import { tweenProgress, validTweenCurve, type TweenEasing, type TweenCurve } from './tween-easing'
export { tweenProgress } from './tween-easing'
export type { TweenEasing, TweenCurve } from './tween-easing'
export interface TweenPathPoint { x: number; y: number }
export interface AnimationTweenOptions {
  autoCropCanvas?: boolean
  /** Displacements from the chosen source anchor, sampled by arc length. */
  path?: readonly TweenPathPoint[]
  pathAnchor?: TweenPathPoint
  scope?: 'frame' | 'loop' | 'between'
  betweenMode?: 'morph' | 'crossfade'
  layerScope?: 'current' | 'selected' | 'all'
  layerIds?: readonly string[]
  groupIds?: readonly string[]
  loopSectionId?: string
  frameCount: number
  duration: number
  offsetX: number
  offsetY: number
  rotation: number
  scale: number
  opacity: number
  easing: TweenEasing
  easingCurve?: TweenCurve
}
export const DEFAULT_ANIMATION_TWEEN: AnimationTweenOptions = {
  autoCropCanvas: false,
  betweenMode: 'morph',
  frameCount: 8, duration: 100, offsetX: 16, offsetY: 0, rotation: 0, scale: 100, opacity: 100, easing: 'linear'
}
/** Easing controls distance along the polyline, independent of drawing speed. */
export function tweenTranslation(options: Pick<AnimationTweenOptions, 'path' | 'offsetX' | 'offsetY'>, progress: number): TweenPathPoint {
  const t = Math.max(0, Math.min(1, progress))
  const path = options.path
  if (!path || path.length < 2) return { x: options.offsetX * t, y: options.offsetY * t }
  let length = 0
  const lengths = path.slice(1).map((point, index) => {
    const distance = Math.hypot(point.x - path[index].x, point.y - path[index].y)
    length += distance
    return distance
  })
  let remaining = length * t
  for (let index = 0; index < lengths.length; index++) {
    const distance = lengths[index]
    if (distance > 0 && remaining <= distance) {
      const ratio = remaining / distance
      return { x: path[index].x + (path[index + 1].x - path[index].x) * ratio,
        y: path[index].y + (path[index + 1].y - path[index].y) * ratio }
    }
    remaining -= distance
  }
  return { ...path[path.length - 1] }
}

export function validateAnimationTween(options: AnimationTweenOptions): void {
  if (options.pathAnchor && (!Number.isInteger(options.pathAnchor.x) || !Number.isInteger(options.pathAnchor.y)
    || Math.abs(options.pathAnchor.x) > 16384 || Math.abs(options.pathAnchor.y) > 16384)) throw new Error(tr('timeline.tween.invalid'))
  if (options.path !== undefined && (options.path.length < 2 || options.path.length > 2048
    || options.path.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y) || Math.abs(point.x) > 16384 || Math.abs(point.y) > 16384)
    || options.path[0].x !== 0 || options.path[0].y !== 0
    || !options.path.some((point) => point.x !== 0 || point.y !== 0))) throw new Error(tr('timeline.tween.invalid'))
  if ((options.scope !== undefined && !['frame', 'loop', 'between'].includes(options.scope))
    || (options.layerScope !== undefined && !['current', 'selected', 'all'].includes(options.layerScope))
    || (options.betweenMode !== undefined && !['morph', 'crossfade'].includes(options.betweenMode))
    || ![options.frameCount, options.duration, options.offsetX, options.offsetY, options.rotation, options.scale, options.opacity].every(Number.isFinite)
    || !Number.isInteger(options.frameCount) || options.frameCount < 1 || options.frameCount > 120
    || !Number.isInteger(options.duration) || options.duration < 1 || options.duration > 60000
    || Math.abs(options.offsetX) > 16384 || Math.abs(options.offsetY) > 16384 || Math.abs(options.rotation) > 3600
    || options.scale < 1 || options.scale > 1000 || options.opacity < 0 || options.opacity > 100
    || !['linear', 'ease-in', 'ease-out', 'ease-in-out', 'custom'].includes(options.easing)
    || (options.easing === 'custom' && options.easingCurve !== undefined && !validTweenCurve(options.easingCurve))) throw new Error(tr('timeline.tween.invalid'))
}

/** Geometry shared by preview framing and nearest-neighbour rasterization. */
export function tweenSurfaceGeometry(source: Pick<AnimationCelSurface, 'width' | 'height' | 'offsetX' | 'offsetY'>, pivot: SelectionRect, options: AnimationTweenOptions, progress: number) {
  const t = tweenProgress(progress, options.easing, options.easingCurve)
  const translation = tweenTranslation(options, t)
  const scale = 1 + (options.scale / 100 - 1) * t
  const target = {
    x: pivot.x + pivot.width * (1 - scale) / 2 + Math.round(translation.x),
    y: pivot.y + pivot.height * (1 - scale) / 2 + Math.round(translation.y),
    width: pivot.width * scale, height: pivot.height * scale
  }
  const angle = options.rotation * t
  const corners = [[0, 0], [source.width, 0], [0, source.height], [source.width, source.height]].map(([x, y]) =>
    remapTransformedSelectionPoint(pivot, target, { x: source.offsetX + x, y: source.offsetY + y }, 0, undefined, angle))
  const left = Math.floor(Math.min(...corners.map((point) => point.x)))
  const top = Math.floor(Math.min(...corners.map((point) => point.y)))
  const width = Math.max(1, Math.ceil(Math.max(...corners.map((point) => point.x))) - left)
  const height = Math.max(1, Math.ceil(Math.max(...corners.map((point) => point.y))) - top)
  return { left, top, width, height, target, angle, scale }
}

export function tweenSurface(source: AnimationCelSurface, pivot: SelectionRect, options: AnimationTweenOptions, progress: number, maxPixels = 16 * 1024 * 1024, reserve?: (bytes: number) => void): AnimationCelSurface {
  const { left, top, width, height, target, angle, scale } = tweenSurfaceGeometry(source, pivot, options, progress)
  if (width > 16384 || height > 16384 || width * height > maxPixels) throw new Error(tr('timeline.tween.tooLarge'))
  reserve?.(width * height * 4)
  const packed = new Uint32Array(width * height)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const point = inverseTransformedSelectionPoint(target, { x: left + x + 0.5, y: top + y + 0.5 }, angle)
    const sx = Math.floor(pivot.x + (point.x - target.x) / scale - source.offsetX)
    const sy = Math.floor(pivot.y + (point.y - target.y) / scale - source.offsetY)
    if (sx >= 0 && sy >= 0 && sx < source.width && sy < source.height) packed[y * width + x] = readSurfacePackedLocal(source, sx, sy)
  }
  return source.format === 'indexed'
    ? { format: 'indexed', width, height, offsetX: left, offsetY: top, pixels: packed }
    : { format: 'rgba', width, height, offsetX: left, offsetY: top, pixels: new Uint8ClampedArray(packed.buffer) }
}

export function cropTweenSource(source: AnimationCelSurface, palette: readonly PaletteEntry[]): AnimationCelSurface {
  const bounds = rasterContentBounds(source, palette)
  if (!bounds) throw new Error(tr('timeline.tween.empty'))
  if (bounds.width * bounds.height > 16 * 1024 * 1024) throw new Error(tr('timeline.tween.tooLarge'))
  const geometry = { width: bounds.width, height: bounds.height, offsetX: bounds.x + source.offsetX, offsetY: bounds.y + source.offsetY }
  const crop = new Uint32Array(bounds.width * bounds.height)
  for (let y = 0; y < bounds.height; y++) for (let x = 0; x < bounds.width; x++) crop[y * bounds.width + x] = readSurfacePackedLocal(source, bounds.x + x, bounds.y + y)
  return source.format === 'indexed' ? { format: 'indexed', ...geometry, pixels: crop }
    : { format: 'rgba', ...geometry, pixels: new Uint8ClampedArray(crop.buffer) }
}

/** Shared by preview and generation; use one pivot across all poses in a loop. */
function animationTweenLayerSource(document: SpriteDocument, frameId: string, layerId: string, options: Pick<AnimationTweenOptions, 'scope' | 'loopSectionId' | 'betweenMode'>) {
  const timeline = document.animation
  const layer = document.layers.find((item) => item.id === layerId)
  if (!timeline || !timeline.frames.some((frame) => frame.id === frameId) || !layer || layer.kind || layer.background || isLayerEffectivelyLocked(document, layer)) throw new Error(tr('timeline.tween.rasterOnly'))
  let frames = timeline.frames.filter((frame) => frame.id === frameId)
  let insertionFrameId = frameId
  if (options.scope === 'between') {
    const index = timeline.frames.findIndex((frame) => frame.id === frameId)
    const next = timeline.frames[index + 1]
    if (!next) throw new Error(tr('timeline.tween.noNextFrame'))
    frames = [timeline.frames[index], next]
  }
  if (options.scope === 'loop') {
    const section = timeline.loopSections?.find((item) => item.id === options.loopSectionId)
    const range = section && resolveAnimationLoopSectionRange(timeline, section)
    if (!section || !range) throw new Error(tr('timeline.tween.invalidLoop'))
    frames = timeline.frames.slice(range.startIndex, range.endIndex + 1).filter((frame) => !frame.disabled)
    if (section.direction === 'reverse') frames.reverse()
    insertionFrameId = range.endFrameId
    if (!frames.length) throw new Error(tr('timeline.tween.invalidLoop'))
  }
  let pivot: SelectionRect | null = null
  for (const frame of frames) {
    const surface = animationTweenSourceSurface(document, layerId, frame.id)
    const bounds = surface && rasterContentBounds(surface, document.palette)
    if (!surface || !bounds) continue
    const rect = { ...bounds, x: bounds.x + surface.offsetX, y: bounds.y + surface.offsetY }
    if (!pivot) pivot = rect
    else {
      const x = Math.min(pivot.x, rect.x), y = Math.min(pivot.y, rect.y)
      pivot = { x, y, width: Math.max(pivot.x + pivot.width, rect.x + rect.width) - x, height: Math.max(pivot.y + pivot.height, rect.y + rect.height) - y }
    }
  }
  if (!pivot) pivot = { x: 0, y: 0, width: 1, height: 1 }
  if (!pivot) throw new Error(tr('timeline.tween.empty'))
  const morph = options.scope === 'between' && options.betweenMode !== 'crossfade'
    ? prepareMorphTween(animationTweenSourceSurface(document, layerId, frames[0].id), animationTweenSourceSurface(document, layerId, frames[1].id), document.palette) : undefined
  return { frames, insertionFrameId, pivot, morph }
}

type TweenSourceOptions = Pick<AnimationTweenOptions, 'scope' | 'loopSectionId' | 'betweenMode' | 'layerScope' | 'layerIds' | 'groupIds'>

export function animationTweenLayerIds(document: SpriteDocument, layerId: string, options: TweenSourceOptions): string[] {
  const requested = new Set([...(options.layerIds ?? []), ...(options.groupIds ?? []).flatMap((id) => getLayerIdsInGroup(document, id))])
  return document.layers.filter((layer) => (options.layerScope === 'all' || (options.layerScope === 'selected' ? requested.has(layer.id) : layer.id === layerId))
    && !layer.kind && !layer.background && !isLayerEffectivelyLocked(document, layer)).map((layer) => layer.id)
}

const unionTweenRects = (rects: SelectionRect[]): SelectionRect => {
  if (!rects.length) return { x: 0, y: 0, width: 1, height: 1 }
  const x = Math.min(...rects.map((rect) => rect.x)), y = Math.min(...rects.map((rect) => rect.y))
  return { x, y, width: Math.max(...rects.map((rect) => rect.x + rect.width)) - x, height: Math.max(...rects.map((rect) => rect.y + rect.height)) - y }
}

export function animationTweenSource(document: SpriteDocument, frameId: string, layerId: string, options: TweenSourceOptions) {
  const layerIds = animationTweenLayerIds(document, layerId, options)
  if (!layerIds.length) throw new Error(tr('timeline.tween.rasterOnly'))
  const layers = new Map<string, ReturnType<typeof animationTweenLayerSource>>()
  let bytes = 0
  for (const id of layerIds) {
    // Empty layers must not prevent a whole selection from moving. Single-layer validation stays explicit.
    const part = animationTweenLayerSource(document, frameId, id, options.scope === 'between' ? { ...options, betweenMode: 'crossfade' } : options)
    if (options.scope === 'between' && options.betweenMode !== 'crossfade') {
      const start = animationTweenSourceSurface(document, id, part.frames[0].id), end = animationTweenSourceSurface(document, id, part.frames[1].id)
      if (start && end && rasterContentBounds(start, document.palette) && rasterContentBounds(end, document.palette)) part.morph = prepareMorphTween(start, end, document.palette)
      else if ((options.layerScope ?? 'current') === 'current') throw new Error(tr('timeline.tween.morphNeedsContent'))
    }
    bytes += part.morph?.byteLength ?? 0
    if (bytes > 64 * 1024 * 1024) throw new Error(tr('timeline.tween.tooLarge'))
    layers.set(id, part)
  }
  const first = layers.values().next().value!
  const pivot = unionTweenRects([...layers].filter(([id, part]) => part.frames.some((frame) => { const surface = animationTweenSourceSurface(document, id, frame.id); return surface && rasterContentBounds(surface, document.palette) })).map(([, part]) => part.pivot))
  if (options.scope !== 'between') for (const part of layers.values()) part.pivot = pivot
  const groupIds = document.groups.filter((group) => {
    const children = getLayerIdsInGroup(document, group.id)
    return children.length > 0 && children.every((id) => layers.has(id))
  }).map((group) => group.id)
  return { ...first, pivot, layers, layerIds, groupIds, bytes }
}

export function animationTweenSourceSurface(document: SpriteDocument, layerId: string, frameId: string): AnimationCelSurface | undefined {
  const timeline = document.animation
  if (!timeline) return undefined
  return timeline.activeFrameId === frameId ? document.layers.find((layer) => layer.id === layerId)
    : resolveAnimationCel(timeline, animationCelAt(timeline, layerId, frameId))?.surface
}

/** Zero is the source preview; loop output begins at its first playable pose. */
export function animationTweenSourceFrameId(source: ReturnType<typeof animationTweenSource>, options: Pick<AnimationTweenOptions, 'scope'>, step: number): string {
  return source.frames[(options.scope === 'loop' ? Math.max(0, step - 1) : 0) % source.frames.length].id
}

/** Fit all output poses once, without allocating or rendering their raster surfaces. */
export function animationTweenPreviewBounds(document: SpriteDocument, _layerId: string, source: ReturnType<typeof animationTweenSource>, options: AnimationTweenOptions): SelectionRect {
  const rects: SelectionRect[] = []
  const include = (rect: SelectionRect, layerId: string) => {
    const layer = document.layers.find((item) => item.id === layerId)!
    let styled = layerStyleOutputBounds(rect, layer.layerStyles) ?? rect
    let groupId = layer.groupId
    const visited = new Set<string>()
    while (groupId && !visited.has(groupId)) {
      visited.add(groupId)
      const group = document.groups.find((item) => item.id === groupId)
      if (!group) break
      styled = layerStyleOutputBounds(styled, group.layerStyles) ?? styled
      groupId = group.parentGroupId
    }
    rects.push(styled)
  }
  for (const layer of document.layers) if (isLayerEffectivelyVisible(document, layer)) for (const frame of source.frames) {
    const surface = animationTweenSourceSurface(document, layer.id, frame.id), bounds = surface && rasterContentBounds(surface, document.palette)
    if (surface && bounds) include({ ...bounds, x: bounds.x + surface.offsetX, y: bounds.y + surface.offsetY }, layer.id)
  }
  for (const [id, part] of source.layers) {
    if (options.scope === 'between') { include(part.pivot, id); continue }
    for (let step = 0; step <= options.frameCount; step++) {
      const surface = animationTweenSourceSurface(document, id, animationTweenSourceFrameId(source, options, step))
      const bounds = surface && rasterContentBounds(surface, document.palette)
      if (!surface || !bounds) continue
      const geometry = tweenSurfaceGeometry({ ...bounds, offsetX: bounds.x + surface.offsetX, offsetY: bounds.y + surface.offsetY }, source.pivot, options, step / options.frameCount)
      include({ x: geometry.left, y: geometry.top, width: geometry.width, height: geometry.height }, id)
    }
  }
  for (const point of options.path ?? []) rects.push({ x: (options.pathAnchor?.x ?? source.pivot.x + source.pivot.width / 2) + point.x, y: (options.pathAnchor?.y ?? source.pivot.y + source.pivot.height / 2) + point.y, width: 1, height: 1 })
  return unionTweenRects(rects)
}

/** The preview and insertion use the same endpoint pixels, easing and alpha math. */
export function animationBetweenFrame(document: SpriteDocument, layerId: string, source: ReturnType<typeof animationTweenSource>, options: AnimationTweenOptions, progress: number, maxPixels = 16 * 1024 * 1024, reserve?: (bytes: number) => void) {
  const layer = document.layers.find((item) => item.id === layerId)!
  const [start, end] = source.frames
  const opacity = (id: string): number => resolveAnimationCel(document.animation!, animationCelAt(document.animation!, layerId, id))?.opacity ?? layer.opacity
  const part = source.layers.get(layerId)!
  if (part.morph) {
    const t = tweenProgress(progress, options.easing, options.easingCurve)
    return { surface: morphTweenSurface(part.morph, t, maxPixels, (color) => paletteColorIdForCanvas(document, color), reserve),
      opacity: opacity(start.id) * (1 - t) + opacity(end.id) * t }
  }
  return crossfadeTweenSurface(animationTweenSourceSurface(document, layerId, start.id), animationTweenSourceSurface(document, layerId, end.id),
    part.pivot, layer.format, tweenProgress(progress, options.easing, options.easingCurve), opacity(start.id), opacity(end.id), maxPixels, reserve)
}

/** Build one frame for both preview and insertion; never modifies the source document. */
export function prepareAnimationTweenFrame(document: SpriteDocument, source: ReturnType<typeof animationTweenSource>, options: AnimationTweenOptions, step: number, consume: (bytes: number) => void, maxPixels = 16 * 1024 * 1024, independent = true) {
  const timeline = document.animation!
  const sourceFrameId = animationTweenSourceFrameId(source, options, step)
  const frame = { id: createId('frame'), duration: options.duration }
  const progress = step / (options.frameCount + (options.scope === 'between' ? 1 : 0))
  const cels: AnimationCel[] = []
  for (const layer of document.layers) {
    const slot = animationCelAt(timeline, layer.id, sourceFrameId)
    const resolved = resolveAnimationCel(timeline, slot)
    const surface = animationTweenSourceSurface(document, layer.id, sourceFrameId)
    const selected = source.layers.has(layer.id)
    let copy: AnimationCel
    if (selected && options.scope === 'between') {
      copy = { id: '', layerId: layer.id, frameId: frame.id, zIndex: slot?.zIndex, ...animationBetweenFrame(document, layer.id, source, options, progress, maxPixels, consume) }
    } else if (selected && surface && rasterContentBounds(surface, document.palette)) {
      const output = tweenSurface(cropTweenSource(surface, document.palette), source.pivot, options, progress, maxPixels, consume)
      copy = { ...resolved, id: '', layerId: layer.id, frameId: frame.id, surface: output,
        opacity: (resolved?.opacity ?? layer.opacity) * (1 + (options.opacity / 100 - 1) * tweenProgress(progress, options.easing, options.easingCurve)) }
    } else {
      if (!resolved && !surface) continue
      const original = { ...resolved, id: slot?.id ?? '', layerId: layer.id, frameId: sourceFrameId, surface }
      if (independent) consume((surface?.width ?? 0) * (surface?.height ?? 0) * 4)
      copy = independent ? cloneAnimationCel(original) : original
    }
    cels.push({ ...copy, id: createId('cel'), layerId: layer.id, frameId: frame.id, linkedCelId: null })
  }
  const ownerBounds = (ids: readonly string[], frameId: string): SelectionRect => unionTweenRects(ids.flatMap((id) => {
    const surface = animationTweenSourceSurface(document, id, frameId), bounds = surface && rasterContentBounds(surface, document.palette)
    return surface && bounds ? [{ ...bounds, x: bounds.x + surface.offsetX, y: bounds.y + surface.offsetY }] : []
  }))
  const maskFor = (mask: LayerMask | undefined) => mask && (resolveAnimationMask(timeline, mask) ?? mask)
  const maskOutput = (start: LayerMask | undefined, end: LayerMask | undefined, selected: boolean, ids: string[]): LayerMask | undefined => {
    if (!start && (!selected || options.scope !== 'between' || !end)) return undefined
    const original = start ?? end!
    if (selected && !original.locked && !end?.locked && options.scope === 'between') {
      const from = ownerBounds(ids, source.frames[0].id), to = ownerBounds(ids, source.frames[1].id)
      // A crossfade has fixed geometry; morph masks follow the interpolated content bounds.
      const stationary = options.betweenMode === 'crossfade' || ids.every((id) => !source.layers.get(id)?.morph)
      const result = betweenTweenMask(start, end, from, stationary ? from : to, tweenProgress(progress, options.easing, options.easingCurve), maxPixels, consume)
      return { ...original, ...result, id: createId('mask'), linkedMaskId: undefined, runtimeRaster: undefined }
    }
    if (selected && !original.locked && original.moveWithOwner !== false && options.scope !== 'between') {
      const result = tweenSurface(original, source.pivot, options, progress, maxPixels, consume)
      return { ...original, ...result, id: createId('mask'), linkedMaskId: null, format: 'rgba', pixels: result.pixels as Uint8ClampedArray, runtimeRaster: undefined }
    }
    if (independent) consume(original.width * original.height * 4)
    const copy = independent ? original.ownerKind === 'group'
      ? cloneAnimationGroupMask({ groupId: original.ownerId, frameId: frame.id, mask: original }, original.ownerId, frame.id, createId('mask')).mask
      : cloneAnimationLayerMask({ layerId: original.ownerId, frameId: frame.id, mask: original }, original.ownerId, frame.id, createId('mask')).mask
      : { ...original, id: createId('mask'), linkedMaskId: null }
    return copy
  }
  const endFrameId = options.scope === 'between' ? source.frames[1].id : sourceFrameId
  const layerMasks: NonNullable<typeof timeline.layerMasks> = []
  const groupMasks: NonNullable<typeof timeline.groupMasks> = []
  for (const layer of document.layers) {
    const start = maskFor(timeline.layerMasks?.find((entry) => entry.layerId === layer.id && entry.frameId === sourceFrameId)?.mask)
    const end = maskFor(timeline.layerMasks?.find((entry) => entry.layerId === layer.id && entry.frameId === endFrameId)?.mask)
    const mask = maskOutput(start, end, source.layers.has(layer.id), [layer.id])
    if (mask) layerMasks.push({ layerId: layer.id, frameId: frame.id, mask: { ...mask, ownerKind: 'cel', ownerId: layer.id } })
  }
  for (const group of document.groups) {
    const start = maskFor(timeline.groupMasks?.find((entry) => entry.groupId === group.id && entry.frameId === sourceFrameId)?.mask)
    const end = maskFor(timeline.groupMasks?.find((entry) => entry.groupId === group.id && entry.frameId === endFrameId)?.mask)
    const mask = maskOutput(start, end, source.groupIds.includes(group.id), getLayerIdsInGroup(document, group.id))
    if (mask) groupMasks.push({ groupId: group.id, frameId: frame.id, mask: { ...mask, ownerKind: 'group', ownerId: group.id } })
  }
  return { frame, cels, layerMasks, groupMasks }
}

/** Composite a single ephemeral frame with the production layer/group/mask/style renderer. */
export function animationTweenCompositePreview(document: SpriteDocument, source: ReturnType<typeof animationTweenSource>, options: AnimationTweenOptions, step: number, bounds: SelectionRect): AnimationCelSurface {
  const hiddenLayer = (layer: SpriteDocument['layers'][number]) => {
    const shared = shareRasterLayer(layer)
    shared.visible = false
    return shared
  }
  const maxPixels = 1024 * 1024
  if (bounds.width * bounds.height > maxPixels) throw new Error(tr('timeline.tween.tooLarge'))
  let remaining = 64 * 1024 * 1024
  const consume = (bytes: number) => { remaining -= bytes; if (remaining < 0) throw new Error(tr('timeline.tween.tooLarge')) }
  const endpointId = step === 0 ? source.frames[0].id : options.scope === 'between' && step === options.frameCount + 1 ? source.frames[1].id : null
  let preview: SpriteDocument
  if (endpointId) {
    const layers = document.layers.map((layer) => {
      const cel = resolveAnimationCel(document.animation!, animationCelAt(document.animation!, layer.id, endpointId))
      return layerFromAnimationCel(layer, { ...cel, id: '', frameId: endpointId, layerId: layer.id, surface: animationTweenSourceSurface(document, layer.id, endpointId) }) ?? hiddenLayer(layer)
    })
    preview = { ...document, layers, animation: { ...document.animation!, activeFrameId: endpointId } }
  } else {
    const generated = prepareAnimationTweenFrame(document, source, options, step, consume, maxPixels, false)
    const byLayer = new Map(generated.cels.map((cel) => [cel.layerId, cel]))
    const layers = document.layers.map((layer) => layerFromAnimationCel(layer, byLayer.get(layer.id) ?? null) ?? hiddenLayer(layer))
    preview = { ...document, layers, animation: { ...document.animation!, activeFrameId: generated.frame.id,
      frames: [generated.frame], cels: generated.cels, layerMasks: generated.layerMasks, groupMasks: generated.groupMasks } }
  }
  return { format: 'rgba', width: bounds.width, height: bounds.height, offsetX: bounds.x, offsetY: bounds.y, pixels: compositeRegion(preview, bounds.x, bounds.y, bounds.width, bounds.height) }
}

/** Prepare every participating layer in the same frame batch, for one transaction. */
export function prepareAnimationTween(document: SpriteDocument, frameId: string, layerId: string, options: AnimationTweenOptions) {
  validateAnimationTween(options)
  const source = animationTweenSource(document, frameId, layerId, options)
  const frames: import('@shared/types-animation').AnimationFrame[] = [], cels: AnimationCel[] = []
  const layerMasks: NonNullable<NonNullable<SpriteDocument['animation']>['layerMasks']> = []
  const groupMasks: NonNullable<NonNullable<SpriteDocument['animation']>['groupMasks']> = []
  let remaining = 128 * 1024 * 1024 - source.bytes
  const consume = (bytes: number) => { remaining -= bytes; if (remaining < 0) throw new Error(tr('timeline.tween.tooLarge')) }
  for (let step = 1; step <= options.frameCount; step++) {
    const generated = prepareAnimationTweenFrame(document, source, options, step, consume, Math.min(16 * 1024 * 1024, Math.floor(remaining / 4)))
    frames.push(generated.frame); cels.push(...generated.cels); layerMasks.push(...generated.layerMasks); groupMasks.push(...generated.groupMasks)
  }
  let canvasBounds: SelectionRect | undefined
  if (options.autoCropCanvas) {
    const rects: SelectionRect[] = [{ x: 0, y: 0, width: document.width, height: document.height }]
    const layers = new Map(document.layers.map(layer => [layer.id, layer]))
    for (const cel of [...(document.animation?.cels ?? []), ...cels]) {
      const surface = cel.surface
      if (!surface) continue
      const content = rasterContentBounds(surface, document.palette)
      if (!content) continue
      let bounds = { ...content, x: surface.offsetX + content.x, y: surface.offsetY + content.y }
      const layer = layers.get(cel.layerId)
      bounds = layerStyleOutputBounds(bounds, layer?.layerStyles) ?? bounds
      let group = document.groups.find(group => group.id === layer?.groupId)
      const visited = new Set<string>()
      while (group && !visited.has(group.id)) {
        visited.add(group.id)
        bounds = layerStyleOutputBounds(bounds, group.layerStyles) ?? bounds
        group = document.groups.find(candidate => candidate.id === group!.parentGroupId)
      }
      rects.push(bounds)
    }
    canvasBounds = unionTweenRects(rects)
    if (canvasBounds.width > 16384 || canvasBounds.height > 16384 || canvasBounds.width * canvasBounds.height > 16 * 1024 * 1024) throw new Error(tr('timeline.tween.tooLarge'))
  }
  return { frames, cels, layerMasks, groupMasks, insertionFrameId: source.insertionFrameId, canvasBounds }
}
