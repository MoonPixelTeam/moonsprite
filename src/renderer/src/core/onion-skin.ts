import type { AnimationTimeline, RgbaColor, SpriteDocument } from '@shared/types'
import { animationLayersAtFrame, ensureAnimationDocument } from './animation'
import { compositeDocument, compositeRegion } from './document'

export interface OnionSkinFrameRef { frameId: string; distance: number; side: 'previous' | 'next' }

export const onionSkinFrameRefs = (timeline: AnimationTimeline, previousFrames: number, nextFrames: number): OnionSkinFrameRef[] => {
  const activeIndex = timeline.frames.findIndex((frame) => frame.id === timeline.activeFrameId)
  if (activeIndex < 0) return []
  const result: OnionSkinFrameRef[] = []
  for (let distance = Math.min(8, Math.max(0, Math.round(previousFrames))); distance >= 1; distance -= 1) {
    const frame = timeline.frames[activeIndex - distance]
    if (frame) result.push({ frameId: frame.id, distance, side: 'previous' })
  }
  for (let distance = Math.min(8, Math.max(0, Math.round(nextFrames))); distance >= 1; distance -= 1) {
    const frame = timeline.frames[activeIndex + distance]
    if (frame) result.push({ frameId: frame.id, distance, side: 'next' })
  }
  return result
}

export const compositeAnimationFrame = (document: SpriteDocument, frameId: string): Uint8ClampedArray => {
  ensureAnimationDocument(document)
  const layers = animationLayersAtFrame(document, frameId)
  return compositeDocument({ ...document, layers })
}

export const compositeAnimationFrameRegion = (document: SpriteDocument, frameId: string, x: number, y: number, width: number, height: number): Uint8ClampedArray => {
  ensureAnimationDocument(document)
  const layers = animationLayersAtFrame(document, frameId)
  return compositeRegion({ ...document, layers }, x, y, width, height)
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
