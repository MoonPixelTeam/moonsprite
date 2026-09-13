import type { AnimationLoopSection, AnimationTimeline } from '@shared/types-animation'
import type { RgbaColor } from '@shared/types-color'
import type { SpriteDocument } from '@shared/types-document'
import { resolveAnimationLoopSectionRange } from './animation-loop-sections'
import { animationLayersAtFrame, ensureAnimationDocument } from './animation'
import { compositeDocument, compositeRegion } from './document-composite'

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
