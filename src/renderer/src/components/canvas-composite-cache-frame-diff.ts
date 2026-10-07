import type { SpriteDocument } from '@shared/types-document'
import type { SelectionRect } from '@shared/types-selection'

export interface FrameDiff {
  fromFrameId: string
  toFrameId: string
  changedLayerIds: Set<string>
  dirtyRects: SelectionRect[]
}

const frameDiffCache = new WeakMap<SpriteDocument, Map<string, FrameDiff>>()

/**
 * Compute the difference between two animation frames.
 * Returns changed layer IDs and dirty rects for incremental rendering.
 */
export const computeFrameDiff = (
  document: SpriteDocument,
  fromFrameId: string,
  toFrameId: string
): FrameDiff => {
  const cacheKey = `${fromFrameId}:${toFrameId}`
  let cache = frameDiffCache.get(document)
  if (!cache) {
    cache = new Map()
    frameDiffCache.set(document, cache)
  }

  const cached = cache.get(cacheKey)
  if (cached) return cached

  const animation = document.animation
  if (!animation) {
    // No animation timeline, return empty diff
    return {
      fromFrameId,
      toFrameId,
      changedLayerIds: new Set(),
      dirtyRects: []
    }
  }

  const fromFrame = animation.frames.find((f) => f.id === fromFrameId)
  const toFrame = animation.frames.find((f) => f.id === toFrameId)

  if (!fromFrame || !toFrame) {
    // Full invalidation if frames don't exist
    return {
      fromFrameId,
      toFrameId,
      changedLayerIds: new Set(document.layers.map(l => l.id)),
      dirtyRects: [{ x: 0, y: 0, width: document.width, height: document.height }]
    }
  }

  const changedLayerIds = new Set<string>()
  const dirtyRects: SelectionRect[] = []

  // Compare cels for each layer
  for (const layer of document.layers) {
    const fromCel = animation.cels.find((c) => c.layerId === layer.id && c.frameId === fromFrameId)
    const toCel = animation.cels.find((c) => c.layerId === layer.id && c.frameId === toFrameId)

    // Check if cel changed
    if (fromCel?.id !== toCel?.id) {
      changedLayerIds.add(layer.id)

      // Add dirty rects for both old and new cel positions
      if (fromCel?.surface) {
        dirtyRects.push({
          x: fromCel.surface.offsetX,
          y: fromCel.surface.offsetY,
          width: fromCel.surface.width,
          height: fromCel.surface.height
        })
      }
      if (toCel?.surface) {
        dirtyRects.push({
          x: toCel.surface.offsetX,
          y: toCel.surface.offsetY,
          width: toCel.surface.width,
          height: toCel.surface.height
        })
      }
    }
  }

  const diff: FrameDiff = {
    fromFrameId,
    toFrameId,
    changedLayerIds,
    dirtyRects: mergeOverlappingRects(dirtyRects)
  }

  cache.set(cacheKey, diff)

  // Limit cache size to avoid unbounded growth
  if (cache.size > 64) {
    const firstKey = cache.keys().next().value
    if (firstKey) cache.delete(firstKey)
  }

  return diff
}

/** Merge overlapping dirty rects to reduce composite work. */
const mergeOverlappingRects = (rects: SelectionRect[]): SelectionRect[] => {
  if (rects.length <= 1) return rects

  const merged: SelectionRect[] = []
  const sorted = [...rects].sort((a, b) => a.x - b.x || a.y - b.y)

  let current = sorted[0]

  for (let i = 1; i < sorted.length; i++) {
    const rect = sorted[i]
    const currentRight = current.x + current.width
    const currentBottom = current.y + current.height
    const rectRight = rect.x + rect.width
    const rectBottom = rect.y + rect.height

    // Check if rects overlap or are adjacent
    if (rect.x <= currentRight && rect.y <= currentBottom &&
        rectRight >= current.x && rectBottom >= current.y) {
      // Merge
      const left = Math.min(current.x, rect.x)
      const top = Math.min(current.y, rect.y)
      const right = Math.max(currentRight, rectRight)
      const bottom = Math.max(currentBottom, rectBottom)
      current = { x: left, y: top, width: right - left, height: bottom - top }
    } else {
      merged.push(current)
      current = rect
    }
  }

  merged.push(current)
  return merged
}

/** Invalidate frame diff cache when document structure changes. */
export const invalidateFrameDiffCache = (document: SpriteDocument): void => {
  frameDiffCache.delete(document)
}
