import type { RgbaColor } from '@shared/types-color'
import type { SelectionRect } from '@shared/types-selection'
import type { SpriteDocument } from '@shared/types-document'
import { compositeRegion } from './document-composite'
import { blendOver, packColor } from './raster'

export interface GradientCompositePreview extends SelectionRect {
  lower: Uint8ClampedArray | null
  upper: Uint8ClampedArray | null
}

/** Exact background pixels only for the visible preview, in document coordinates. */
export const createGradientCompositePreview = (document: SpriteDocument, activeIndex: number, bounds: SelectionRect, opaqueReplacement: boolean): GradientCompositePreview => {
  const x = Math.max(0, Math.floor(bounds.x))
  const y = Math.max(0, Math.floor(bounds.y))
  const width = Math.max(0, Math.min(document.width, Math.ceil(bounds.x + bounds.width)) - x)
  const height = Math.max(0, Math.min(document.height, Math.ceil(bounds.y + bounds.height)) - y)
  const render = (layers: SpriteDocument['layers']): Uint8ClampedArray | null => layers.length && width && height
    ? compositeRegion({ ...document, layers, activeLayerId: layers[0].id }, x, y, width, height)
    : null
  return {
    x, y, width, height,
    // Fully opaque replacement pixels cannot reveal the layers underneath.
    lower: opaqueReplacement ? null : render(document.layers.slice(0, activeIndex)),
    upper: render(document.layers.slice(activeIndex + 1))
  }
}

export const gradientReplacementColor = (current: RgbaColor, gradient: RgbaColor): RgbaColor => gradient.a === 0
  ? current : gradient.a === 255 ? gradient : blendOver(current, gradient)

export const compositeGradientPreviewAt = (preview: GradientCompositePreview, x: number, y: number, replacement: RgbaColor): RgbaColor => {
  const offset = ((y - preview.y) * preview.width + x - preview.x) * 4
  let result = replacement
  const read = (pixels: Uint8ClampedArray): RgbaColor => ({ r: pixels[offset], g: pixels[offset + 1], b: pixels[offset + 2], a: pixels[offset + 3] })
  if (preview.lower && replacement.a !== 255) result = blendOver(read(preview.lower), result)
  if (preview.upper && preview.upper[offset + 3] !== 0) result = blendOver(result, read(preview.upper))
  return result
}

/** One packed write instead of four byte writes per screen pixel. */
export const fillGradientPreviewBlock = (pixels: Uint32Array, width: number, left: number, top: number, right: number, bottom: number, color: RgbaColor): void => {
  const value = packColor(color)
  // Tiny zoomed pixel blocks are faster as direct writes than repeated native
  // fill() calls. Keep row bounds exact without allocating temporary arrays.
  for (let y = top; y < bottom; y += 1) {
    const end = y * width + right
    for (let offset = y * width + left; offset < end; offset += 1) pixels[offset] = value
  }
}
