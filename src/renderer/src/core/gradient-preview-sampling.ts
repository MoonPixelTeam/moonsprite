import type { RgbaColor } from '@shared/types-color'
import type { SpriteDocument } from '@shared/types-document'
import type { SelectionRect } from '@shared/types-selection'
import { compileCompositePointSampler } from './document-composite-sampling'
import { packColor, unpackColor } from './raster'

/** For a gradient gesture whose source document stays unchanged. Recreate
 * after edits; ordinary brush/cursor samplers must continue reading live data. */
export const createGradientReplacementSampler = (document: SpriteDocument, layerId: string, bounds: SelectionRect) => {
  const left = Math.max(0, Math.floor(bounds.x)), top = Math.max(0, Math.floor(bounds.y))
  const width = Math.max(0, Math.min(document.width, Math.ceil(bounds.x + bounds.width)) - left)
  const height = Math.max(0, Math.min(document.height, Math.ceil(bounds.y + bounds.height)) - top)
  const pixelCount = width * height
  // Bound memory across all layers/groups, and allocate only when sampled.
  let remainingBytes = 32 * 1024 * 1024
  const cache = (read: (x: number, y: number) => RgbaColor) => {
    if (!pixelCount || pixelCount * 5 > remainingBytes) return read
    remainingBytes -= pixelCount * 5
    const pixels = new Uint32Array(pixelCount)
    const valid = new Uint8Array(pixelCount)
    return (x: number, y: number): RgbaColor => {
      if (x < left || y < top || x >= left + width || y >= top + height) return read(x, y)
      const index = (y - top) * width + x - left
      if (!valid[index]) {
        const color = read(x, y)
        pixels[index] = packColor(color)
        valid[index] = 1
        return color
      }
      return unpackColor(pixels[index])
    }
  }
  return compileCompositePointSampler(document, layerId, undefined, 0, undefined, false, cache)
}
