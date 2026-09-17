import type { BlendMode } from '@shared/types-color'
import type { RasterLayer } from '@shared/types-layer'
import type { SpriteDocument } from '@shared/types-document'

export const imageData = (pixels: Uint8ClampedArray, width: number, height: number): ImageData => new ImageData(pixels as Uint8ClampedArray<ArrayBuffer>, width, height)

export const gpuBlendModeFor = (mode: BlendMode): GlobalCompositeOperation | null => {
  // Canvas blends interpolate the source color by backdrop alpha before source-over.
  return mode === 'normal' ? 'source-over' : null
}

export const compositePreviewPixel = (output: Uint8ClampedArray, outputOffset: number, packed: number, layerFormat: RasterLayer['format'], layerOpacity: number, palette: Map<number, SpriteDocument['palette'][number]['color']> | null): void => {
  const indexedColor = layerFormat === 'indexed' ? palette?.get(packed) : undefined
  const r = indexedColor?.r ?? packed & 0xff
  const g = indexedColor?.g ?? (packed >>> 8) & 0xff
  const b = indexedColor?.b ?? (packed >>> 16) & 0xff
  const a = indexedColor?.a ?? (layerFormat === 'rgba' ? (packed >>> 24) & 0xff : 0)
  if (a === 0) return
  const bottomAlpha = output[outputOffset + 3]
  if (layerOpacity === 1 && (bottomAlpha === 0 || a === 255)) {
    output[outputOffset] = r
    output[outputOffset + 1] = g
    output[outputOffset + 2] = b
    output[outputOffset + 3] = a
    return
  }
  const topAlpha = (a / 255) * layerOpacity
  const baseAlpha = bottomAlpha / 255
  const outputAlpha = topAlpha + baseAlpha * (1 - topAlpha)
  if (outputAlpha <= 0) return
  output[outputOffset] = Math.round((r * topAlpha + output[outputOffset] * baseAlpha * (1 - topAlpha)) / outputAlpha)
  output[outputOffset + 1] = Math.round((g * topAlpha + output[outputOffset + 1] * baseAlpha * (1 - topAlpha)) / outputAlpha)
  output[outputOffset + 2] = Math.round((b * topAlpha + output[outputOffset + 2] * baseAlpha * (1 - topAlpha)) / outputAlpha)
  output[outputOffset + 3] = Math.round(outputAlpha * 255)
}
