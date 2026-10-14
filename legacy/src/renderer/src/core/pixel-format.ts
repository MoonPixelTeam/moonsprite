import type { RgbaColor } from '@shared/types-color'
import type { PixelFormat } from '@shared/types-raster'

export const PIXEL_FORMATS: readonly PixelFormat[] = ['rgba32', 'rgb24', 'rgb565', 'rgb555', 'rgb332', 'rgba4444', 'rgba5551', 'argb1555']

const CHANNEL_BITS: Record<PixelFormat, readonly [number, number, number, number]> = {
  rgba32: [8, 8, 8, 8],
  rgb24: [8, 8, 8, 0],
  rgb565: [5, 6, 5, 0],
  rgb555: [5, 5, 5, 0],
  rgb332: [3, 3, 2, 0],
  rgba4444: [4, 4, 4, 4],
  rgba5551: [5, 5, 5, 1],
  argb1555: [5, 5, 5, 1]
}

export const isPixelFormat = (value: unknown): value is PixelFormat => typeof value === 'string' && PIXEL_FORMATS.includes(value as PixelFormat)

const expand = (value: number, bits: number): number => Math.round((value * 255) / ((1 << bits) - 1))
const quantize = (value: number, bits: number): number => Math.round(value * ((1 << bits) - 1) / 255)

/** Quantizes channel precision while retaining the editor's RGBA8 raster layout. */
export function quantizePixelColor(color: RgbaColor, format: PixelFormat): RgbaColor {
  if (format === 'rgba32') return color
  const [r, g, b, a] = CHANNEL_BITS[format]
  return {
    r: expand(quantize(color.r, r), r),
    g: expand(quantize(color.g, g), g),
    b: expand(quantize(color.b, b), b),
    a: a === 0 ? 255 : expand(quantize(color.a, a), a)
  }
}
