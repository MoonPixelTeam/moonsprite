import type { AnimationLoopSection, AnimationTimeline } from '@shared/types-animation'
import type { RgbaColor } from '@shared/types-color'
import type { SpriteDocument } from '@shared/types-document'
import { resolveAnimationLoopSectionRange } from './animation-loop-sections'
import { animationCelAt, layerFromAnimationCel, animationLayersAtFrame, ensureAnimationDocument, resolveAnimationCel } from './animation'
import { compositeDocument, compositeRegion, createCompositePointSampler, createNormalCompositePointSampler } from './document-composite'
import { isLayerEffectivelyVisible, layerContentBounds } from './document-model'
import { layerStyleOutputBounds } from './layer-styles'
import type { RasterLayer } from '@shared/types-layer'
import { blendOver, TRANSPARENT } from './raster'

const documentForAnimationLayerComposite = (document: SpriteDocument, layers: SpriteDocument['layers'], frameId: string, layerId?: string): SpriteDocument => {
  const animation = document.animation ? { ...document.animation, activeFrameId: frameId } : document.animation
  if (!layerId || !layers.some((layer) => layer.id === layerId)) return { ...document, layers, animation }
  const visibleGroups = new Set<string>()
  let groupId = layers.find((layer) => layer.id === layerId)?.groupId ?? null
  while (groupId) {
    if (visibleGroups.has(groupId)) break
    visibleGroups.add(groupId)
    groupId = document.groups.find((group) => group.id === groupId)?.parentGroupId ?? null
  }
  return {
    ...document,
    animation,
    layers: layers.map((layer) => ({ ...layer, visible: layer.id === layerId && layer.visible })),
    groups: document.groups.map((group) => ({ ...group, visible: visibleGroups.has(group.id) && group.visible }))
  }
}

export interface OnionSkinFrameRef { frameId: string; distance: number; side: 'previous' | 'next' }

export interface OnionSkinStyle {
  previousColor: RgbaColor
  nextColor: RgbaColor
  previousOpacity: number
  nextOpacity: number
  scope?: 'current-layer' | 'all-layers'
}

export const onionSkinFrameRefs = (timeline: AnimationTimeline, previousFrames: number, nextFrames: number, loopSection?: AnimationLoopSection | null): OnionSkinFrameRef[] => {
  const activeIndex = timeline.frames.findIndex((frame) => frame.id === timeline.activeFrameId)
  if (activeIndex < 0) return []
  const sectionRange = loopSection ? resolveAnimationLoopSectionRange(timeline, loopSection) : null
  const sectionActiveIndex = sectionRange && activeIndex >= sectionRange.startIndex && activeIndex <= sectionRange.endIndex
    ? activeIndex - sectionRange.startIndex
    : null
  const sectionLength = sectionRange ? sectionRange.endIndex - sectionRange.startIndex + 1 : 0
  const result: OnionSkinFrameRef[] = []
  const previousLimit = sectionActiveIndex === null ? Math.min(8, Math.max(0, Math.round(previousFrames))) : Math.min(8, Math.max(0, Math.round(previousFrames)), Math.max(0, sectionLength - 1))
  const nextLimit = sectionActiveIndex === null ? Math.min(8, Math.max(0, Math.round(nextFrames))) : Math.min(8, Math.max(0, Math.round(nextFrames)), Math.max(0, sectionLength - 1))
  for (let distance = previousLimit; distance >= 1; distance -= 1) {
    const frame = sectionActiveIndex === null
      ? timeline.frames[activeIndex - distance]
      : timeline.frames[sectionRange!.startIndex + (sectionActiveIndex - distance + sectionLength) % sectionLength]
    if (frame) result.push({ frameId: frame.id, distance, side: 'previous' })
  }
  for (let distance = nextLimit; distance >= 1; distance -= 1) {
    const frame = sectionActiveIndex === null
      ? timeline.frames[activeIndex + distance]
      : timeline.frames[sectionRange!.startIndex + (sectionActiveIndex + distance) % sectionLength]
    if (frame) result.push({ frameId: frame.id, distance, side: 'next' })
  }
  return result
}

export const compositeAnimationFrame = (document: SpriteDocument, frameId: string, layerId?: string): Uint8ClampedArray => {
  ensureAnimationDocument(document)
  const layers = animationLayersAtFrame(document, frameId)
  return compositeDocument(documentForAnimationLayerComposite(document, layers, frameId, layerId))
}

export const compositeAnimationFrameRegion = (document: SpriteDocument, frameId: string, x: number, y: number, width: number, height: number): Uint8ClampedArray => {
  ensureAnimationDocument(document)
  const layers = animationLayersAtFrame(document, frameId)
  return compositeRegion(documentForAnimationLayerComposite(document, layers, frameId), x, y, width, height)
}

const tintOnionSkinColor = (source: RgbaColor, tint: RgbaColor, opacityPercent: number, distance: number): RgbaColor => {
  if (source.a === 0) return TRANSPARENT
  const opacity = Math.max(0, Math.min(1, opacityPercent / 100)) / Math.max(1, distance)
  const sourceLuminance = source.r * 0.2126 + source.g * 0.7152 + source.b * 0.0722
  const brightness = 0.25 + sourceLuminance / 255 * 0.75
  return {
    r: Math.round(tint.r * brightness),
    g: Math.round(tint.g * brightness),
    b: Math.round(tint.b * brightness),
    a: Math.round(source.a * opacity * tint.a / 255)
  }
}

export const createOnionSkinPointSampler = (
  document: SpriteDocument,
  refs: readonly OnionSkinFrameRef[],
  style: OnionSkinStyle
): ((x: number, y: number) => RgbaColor) => {
  const frames = refs.map((ref) => {
    const layers = animationLayersAtFrame(document, ref.frameId)
    const frameDocument = documentForAnimationLayerComposite(document, layers, ref.frameId)
    return {
      ref,
      sample: createNormalCompositePointSampler(frameDocument) ?? createCompositePointSampler(frameDocument)
    }
  })
  return (x, y) => {
    let result = TRANSPARENT
    for (const { ref, sample } of frames) {
      const tint = ref.side === 'previous' ? style.previousColor : style.nextColor
      const opacity = ref.side === 'previous' ? style.previousOpacity : style.nextOpacity
      result = blendOver(result, tintOnionSkinColor(sample(x, y), tint, opacity, ref.distance))
    }
    return result
  }
}

export const tintOnionSkinPixels = (source: Uint8ClampedArray, tint: RgbaColor, opacityPercent: number, distance: number): Uint8ClampedArray => {
  const output = new Uint8ClampedArray(source.length)
  const opacity = Math.max(0, Math.min(1, opacityPercent / 100)) / Math.max(1, distance)
  for (let offset = 0; offset < source.length; offset += 4) {
    if (source[offset + 3] === 0) continue
    const sourceLuminance = source[offset] * 0.2126 + source[offset + 1] * 0.7152 + source[offset + 2] * 0.0722
    const brightness = 0.25 + sourceLuminance / 255 * 0.75
    output[offset] = Math.round(tint.r * brightness)
    output[offset + 1] = Math.round(tint.g * brightness)
    output[offset + 2] = Math.round(tint.b * brightness)
    output[offset + 3] = Math.round(source[offset + 3] * opacity * tint.a / 255)
  }
  return output
}

/** A display-only shell: never pass this document to persistence or history. */
export const createOnionSkinDisplayDocument = (
  document: SpriteDocument,
  refs: readonly OnionSkinFrameRef[],
  style: OnionSkinStyle,
  layerId: string,
  displayId: string
): SpriteDocument => {
  const timeline = document.animation
  if (!timeline || refs.length === 0) return document
  const requested = style.scope === 'all-layers'
    ? document.layers.filter((layer) => !layer.background && isLayerEffectivelyVisible(document, layer))
    : document.layers.filter((layer) => layer.id === layerId && isLayerEffectivelyVisible(document, layer))
  if (requested.length === 0) return document
  const ghostsByInsertion = new Map<number, RasterLayer[]>()
  const ghostCels: Array<{ id: string; layerId: string; frameId: string; zIndex: number; surface: { format: 'rgba'; width: number; height: number; offsetX: number; offsetY: number; pixels: Uint8ClampedArray } }> = []
  for (const active of requested) {
    const activeIndex = document.layers.findIndex((layer) => layer.id === active.id)
    if (activeIndex < 0) continue
    // Keep clipping chains intact: their underlay belongs below the chain's base.
    let insertionIndex = activeIndex
    while (insertionIndex > 0 && document.layers[insertionIndex].clippingMask &&
      (document.layers[insertionIndex - 1].groupId ?? null) === (active.groupId ?? null)) insertionIndex -= 1
    const anchor = document.layers[insertionIndex]
    const zIndex = resolveAnimationCel(timeline, animationCelAt(timeline, anchor.id, timeline.activeFrameId))?.zIndex ?? 0
    for (const ref of refs) {
      const source = layerFromAnimationCel(active, resolveAnimationCel(timeline, animationCelAt(timeline, active.id, ref.frameId)))
      if (!source) continue
      const isolated: SpriteDocument = {
        ...document,
        layers: [{ ...source, groupId: null, clippingMask: false, blendMode: 'normal' }],
        groups: [],
        animation: { ...timeline, activeFrameId: ref.frameId }
      }
      const bounds = layerStyleOutputBounds(layerContentBounds(isolated, source), source.layerStyles)
      if (!bounds) continue
      const x = Math.max(0, bounds.x), y = Math.max(0, bounds.y)
      const width = Math.min(document.width, bounds.x + bounds.width) - x
      const height = Math.min(document.height, bounds.y + bounds.height) - y
      const tint = ref.side === 'previous' ? style.previousColor : style.nextColor
      const opacity = ref.side === 'previous' ? style.previousOpacity : style.nextOpacity
      if (width <= 0 || height <= 0 || opacity <= 0 || tint.a === 0) continue
      const ghost: RasterLayer = {
        id: `${displayId}:${active.id}:${ref.side}:${ref.frameId}`, name: 'Onion skin',
        visible: true, locked: true, opacity: 1, blendMode: 'normal', groupId: active.groupId,
        width, height, offsetX: x, offsetY: y, format: 'rgba',
        pixels: tintOnionSkinPixels(compositeRegion(isolated, x, y, width, height), tint, opacity, ref.distance)
      }
      const ghosts = ghostsByInsertion.get(insertionIndex) ?? []
      ghosts.push(ghost)
      ghostsByInsertion.set(insertionIndex, ghosts)
      ghostCels.push({ id: `${ghost.id}:cel`, layerId: ghost.id, frameId: timeline.activeFrameId, zIndex, surface: { format: 'rgba', width, height, offsetX: x, offsetY: y, pixels: ghost.pixels as Uint8ClampedArray } })
    }
  }
  if (ghostCels.length === 0) return document
  const layers: RasterLayer[] = []
  for (let index = 0; index < document.layers.length; index += 1) {
    layers.push(...(ghostsByInsertion.get(index) ?? []), document.layers[index])
  }
  return {
    ...document, id: displayId, layers,
    animation: { ...timeline, cels: [...timeline.cels, ...ghostCels] }
  }
}
