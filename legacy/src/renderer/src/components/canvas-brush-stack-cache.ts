import type { SpriteDocument } from '@shared/types-document'
import type { BrushPreviewStackCache } from './canvas-stage-helpers'
import { compositeRegion } from '@/core/document-composite'

/** Keep the same exact stack pixels, but allocate only around the brush. */
export function brushStackPreview(document: SpriteDocument, revision: number, activeIndex: number,
  points: Iterable<{ sampleX: number; sampleY: number }>, cached: BrushPreviewStackCache | null): BrushPreviewStackCache | null {
  let left = document.width, top = document.height, right = 0, bottom = 0
  for (const { sampleX: x, sampleY: y } of points) {
    if (x < 0 || y < 0 || x >= document.width || y >= document.height) continue
    left = Math.min(left, x); top = Math.min(top, y)
    right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1)
  }
  if (right <= left || bottom <= top) return null
  const signature = `${document.id}:${revision}:${document.layers[activeIndex].id}`
  if (cached?.signature === signature && left >= cached.x && top >= cached.y
    && right <= cached.x + cached.width && bottom <= cached.y + cached.height) return cached
  const tile = 128
  const x = Math.floor(left / tile) * tile, y = Math.floor(top / tile) * tile
  const width = Math.min(document.width, Math.ceil(right / tile) * tile) - x
  const height = Math.min(document.height, Math.ceil(bottom / tile) * tile) - y
  const subset = (layers: SpriteDocument['layers']): SpriteDocument => ({ ...document, layers, activeLayerId: layers[0]?.id ?? document.activeLayerId })
  return { signature, x, y, width, height,
    lower: compositeRegion(subset(document.layers.slice(0, activeIndex)), x, y, width, height),
    upper: compositeRegion(subset(document.layers.slice(activeIndex + 1)), x, y, width, height) }
}
