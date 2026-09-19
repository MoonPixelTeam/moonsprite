import type { AnimationCel, AnimationCelSurface } from '@shared/types-animation'
import type { SpriteDocument } from '@shared/types-document'
import type { SelectionRect } from '@shared/types-selection'
import type { PaletteEntry } from '@shared/types-color'
import { animationCelAt, cloneAnimationCel, cloneAnimationGroupMask, cloneAnimationLayerMask, resolveAnimationCel } from './animation'
import { createId, isLayerEffectivelyLocked, rasterContentBounds, resolveAnimationMask } from './document-model'
import { inverseTransformedSelectionPoint, remapTransformedSelectionPoint } from './selection'
import { readSurfacePackedLocal } from './runtime-raster'
import { translateCurrent as tr } from './localization'
import { resolveAnimationLoopSectionRange } from './animation-loop-sections'

export type TweenEasing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'
export interface AnimationTweenOptions {
  scope?: 'frame' | 'loop'
  loopSectionId?: string
  frameCount: number
  duration: number
  offsetX: number
  offsetY: number
  rotation: number
  scale: number
  opacity: number
  easing: TweenEasing
}
export const DEFAULT_ANIMATION_TWEEN: AnimationTweenOptions = {
  frameCount: 8, duration: 100, offsetX: 16, offsetY: 0, rotation: 0, scale: 100, opacity: 100, easing: 'linear'
}
export const tweenProgress = (progress: number, easing: TweenEasing): number => {
  const t = Math.max(0, Math.min(1, progress))
  if (easing === 'ease-in') return t * t
  if (easing === 'ease-out') return 1 - (1 - t) ** 2
  if (easing === 'ease-in-out') return t * t * (3 - 2 * t)
  return t
}
export function validateAnimationTween(options: AnimationTweenOptions): void {
  if ((options.scope !== undefined && !['frame', 'loop'].includes(options.scope))
    || ![options.frameCount, options.duration, options.offsetX, options.offsetY, options.rotation, options.scale, options.opacity].every(Number.isFinite)
    || !Number.isInteger(options.frameCount) || options.frameCount < 1 || options.frameCount > 120
    || !Number.isInteger(options.duration) || options.duration < 1 || options.duration > 60000
    || Math.abs(options.offsetX) > 16384 || Math.abs(options.offsetY) > 16384 || Math.abs(options.rotation) > 3600
    || options.scale < 1 || options.scale > 1000 || options.opacity < 0 || options.opacity > 100
    || !['linear', 'ease-in', 'ease-out', 'ease-in-out'].includes(options.easing)) throw new Error(tr('timeline.tween.invalid'))
}

/** Nearest-neighbour rasterization uses the same geometry as selection transforms. */
export function tweenSurface(source: AnimationCelSurface, pivot: SelectionRect, options: AnimationTweenOptions, progress: number, maxPixels = 16 * 1024 * 1024): AnimationCelSurface {
  const t = tweenProgress(progress, options.easing)
  const scale = 1 + (options.scale / 100 - 1) * t
  const target = {
    x: pivot.x + pivot.width * (1 - scale) / 2 + Math.round(options.offsetX * t),
    y: pivot.y + pivot.height * (1 - scale) / 2 + Math.round(options.offsetY * t),
    width: pivot.width * scale, height: pivot.height * scale
  }
  const angle = options.rotation * t
  const corners = [[0, 0], [source.width, 0], [0, source.height], [source.width, source.height]].map(([x, y]) =>
    remapTransformedSelectionPoint(pivot, target, { x: source.offsetX + x, y: source.offsetY + y }, 0, undefined, angle))
  const left = Math.floor(Math.min(...corners.map((point) => point.x)))
  const top = Math.floor(Math.min(...corners.map((point) => point.y)))
  const width = Math.max(1, Math.ceil(Math.max(...corners.map((point) => point.x))) - left)
  const height = Math.max(1, Math.ceil(Math.max(...corners.map((point) => point.y))) - top)
  if (width > 16384 || height > 16384 || width * height > maxPixels) throw new Error(tr('timeline.tween.tooLarge'))
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
export function animationTweenSource(document: SpriteDocument, frameId: string, layerId: string, options: Pick<AnimationTweenOptions, 'scope' | 'loopSectionId'>) {
  const timeline = document.animation
  const layer = document.layers.find((item) => item.id === layerId)
  if (!timeline || !timeline.frames.some((frame) => frame.id === frameId) || !layer || layer.kind || layer.background || isLayerEffectivelyLocked(document, layer)) throw new Error(tr('timeline.tween.rasterOnly'))
  let frames = timeline.frames.filter((frame) => frame.id === frameId)
  let insertionFrameId = frameId
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
  if (!pivot) throw new Error(tr('timeline.tween.empty'))
  return { frames, insertionFrameId, pivot }
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

/** Prepares independent ordinary cels; the caller inserts them in one transaction. */
export function prepareAnimationTween(document: SpriteDocument, frameId: string, layerId: string, options: AnimationTweenOptions) {
  validateAnimationTween(options)
  const source = animationTweenSource(document, frameId, layerId, options)
  const timeline = document.animation!
  const layer = document.layers.find((item) => item.id === layerId)!
  const { pivot } = source
  const frames: import('@shared/types-animation').AnimationFrame[] = []
  const cels: AnimationCel[] = []
  const layerMasks: NonNullable<typeof timeline.layerMasks> = []
  const groupMasks: NonNullable<typeof timeline.groupMasks> = []
  let remaining = 128 * 1024 * 1024
  const consume = (bytes: number): void => { remaining -= bytes; if (remaining < 0) throw new Error(tr('timeline.tween.tooLarge')) }
  for (let index = 1; index <= options.frameCount; index++) {
    const sourceFrameId = animationTweenSourceFrameId(source, options, index)
    const sources = timeline.cels.filter((item) => item.frameId === sourceFrameId).map((item) => ({ slot: item, resolved: resolveAnimationCel(timeline, item) ?? item }))
    const sourceLayerMasks = (timeline.layerMasks ?? []).filter((item) => item.frameId === sourceFrameId).map((item) => ({ ...item, mask: resolveAnimationMask(timeline, item.mask) ?? item.mask }))
    const sourceGroupMasks = (timeline.groupMasks ?? []).filter((item) => item.frameId === sourceFrameId).map((item) => ({ ...item, mask: resolveAnimationMask(timeline, item.mask) ?? item.mask }))
    const id = createId('frame')
    const progress = index / options.frameCount
    frames.push({ id, duration: options.duration })
    for (const { slot, resolved } of sources) {
      let copy: AnimationCel
      if (slot.layerId === layerId && resolved.surface && rasterContentBounds(resolved.surface, document.palette)) {
        const cropped = cropTweenSource(resolved.surface, document.palette)
        const surface = tweenSurface(cropped, pivot, options, progress, Math.floor(remaining / 4))
        consume(surface.width * surface.height * 4)
        copy = { ...resolved, surface, opacity: (resolved.opacity ?? layer.opacity) * (1 + (options.opacity / 100 - 1) * tweenProgress(progress, options.easing)) }
      } else {
        consume((resolved.surface?.width ?? 0) * (resolved.surface?.height ?? 0) * 4)
        copy = cloneAnimationCel(resolved)
      }
      cels.push({ ...copy, id: createId('cel'), layerId: slot.layerId, frameId: id, linkedCelId: null })
    }
    for (const entry of sourceLayerMasks) {
      consume(entry.mask.width * entry.mask.height * 4)
      const copy = cloneAnimationLayerMask(entry, entry.layerId, id, createId('mask'))
      if (entry.layerId === layerId) {
        const surface = tweenSurface(entry.mask, pivot, options, progress, Math.floor(remaining / 4))
        consume(surface.width * surface.height * 4)
        copy.mask = { ...copy.mask, ...surface, format: 'rgba', pixels: surface.pixels as Uint8ClampedArray }
      }
      layerMasks.push(copy)
    }
    for (const entry of sourceGroupMasks) {
      consume(entry.mask.width * entry.mask.height * 4)
      groupMasks.push(cloneAnimationGroupMask(entry, entry.groupId, id, createId('mask')))
    }
  }
  return { frames, cels, layerMasks, groupMasks, insertionFrameId: source.insertionFrameId }
}
