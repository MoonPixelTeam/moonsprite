import type { SpriteDocument } from '@shared/types-document'
import type { OnionSkinPreferences } from '@/core/file-preferences'
import { animationLoopSectionAtFrame } from '@/core/animation-loop-sections'
import { createOnionSkinDisplayDocument, onionSkinFrameRefs } from '@/core/onion-skin'

/** Cached display shell, shared by canvas compositing and tool preview samplers. */
export class OnionSkinCompositeCache {
  private cached: { source: SpriteDocument; key: string; document: SpriteDocument } | null = null
  private generation = 0

  invalidateAll(): void { this.cached = null }
  invalidateFrames(_frameIds: readonly string[]): void { this.cached = null }

  displayDocument(document: SpriteDocument, layerId: string, revision: number, style: OnionSkinPreferences): SpriteDocument {
    const timeline = document.animation
    if (!style.enabled || !timeline || timeline.frames.length < 2) return document
    const refs = onionSkinFrameRefs(timeline, style.previousFrames, style.nextFrames,
      animationLoopSectionAtFrame(timeline, timeline.activeFrameId))
    const key = [layerId, revision, timeline.activeFrameId,
      ...refs.map((ref) => `${ref.frameId}:${ref.side}:${ref.distance}`),
      style.previousOpacity, style.nextOpacity,
      ...[style.previousColor, style.nextColor].flatMap((color) => [color.r, color.g, color.b, color.a])].join(':')
    if (this.cached?.source === document && this.cached.key === key) return this.cached.document
    const display = createOnionSkinDisplayDocument(document, refs, style, layerId,
      `${document.id}:onion:${++this.generation}`)
    this.cached = { source: document, key, document: display }
    return display
  }
}
