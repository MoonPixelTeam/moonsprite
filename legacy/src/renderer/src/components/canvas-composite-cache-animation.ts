import type { SpriteDocument } from '@shared/types-document'
import { rasterStorageIdentity } from '@/core/runtime-raster'

// Animation playback keeps both per-layer upload surfaces and composed frame
// surfaces alive. The composed-frame cache has a separate 64 MiB cap, so keep
// the source side to 128 MiB to bound their combined browser-backed storage at
// roughly 192 MiB per document instead of allowing the two caches to reach
// 320 MiB before eviction starts.
const MAX_ANIMATION_LAYER_SOURCE_CACHE_BYTES = 128 * 1024 * 1024
export const MAX_DOCUMENT_COMPOSITE_CACHE_BYTES = 128 * 1024 * 1024

export const trimAnimationLayerSourceCache = (state: { entries: Map<object, { source: CanvasImageSource; bytes: number }>; bytes: number } | undefined, budget: number): void => {
  if (!state) return
  while (state.entries.size > 0 && state.bytes > budget) {
    const oldestIdentity = state.entries.keys().next().value
    if (oldestIdentity === undefined) break
    const oldest = state.entries.get(oldestIdentity)
    if (oldest && typeof ImageBitmap !== 'undefined' && oldest.source instanceof ImageBitmap) oldest.source.close()
    if (oldest) state.bytes -= oldest.bytes
    state.entries.delete(oldestIdentity)
  }
}

/** Keep all active-frame sources when practical, with a bounded GPU memory cap. */
export const animationLayerSourceCacheBudget = (document: SpriteDocument, minimumBytes: number, reservedSurfaceBytes = 0): number => {
  const seen = new Set<object>()
  let activeFrameBytes = 0
  for (const layer of document.layers) {
    if (layer.format !== 'rgba' || layer.width <= 0 || layer.height <= 0) continue
    const identity = rasterStorageIdentity(layer)
    if (seen.has(identity)) continue
    seen.add(identity)
    activeFrameBytes += layer.width * layer.height * 4
  }
  const sourceTarget = Math.max(minimumBytes, Math.min(MAX_ANIMATION_LAYER_SOURCE_CACHE_BYTES, activeFrameBytes))
  return Math.min(sourceTarget, Math.max(0, MAX_DOCUMENT_COMPOSITE_CACHE_BYTES - reservedSurfaceBytes))
}
