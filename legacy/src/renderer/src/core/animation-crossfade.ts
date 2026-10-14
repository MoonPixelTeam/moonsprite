import type { AnimationCelSurface } from '@shared/types-animation'
import type { SelectionRect } from '@shared/types-selection'
import { readSurfacePackedLocal } from './runtime-raster'
import { packColor, unpackColor } from './raster'
import { translateCurrent as tr } from './localization'

const dither = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]

/** Premultiplied crossfade; indexed documents dissolve without changing their palette. */
export function crossfadeTweenSurface(
  start: AnimationCelSurface | undefined, end: AnimationCelSurface | undefined,
  bounds: SelectionRect, format: 'rgba' | 'indexed', progress: number,
  startOpacity: number, endOpacity: number, maxPixels: number, reserve?: (bytes: number) => void
): { surface: AnimationCelSurface; opacity: number } {
  const { x: offsetX, y: offsetY, width, height } = bounds
  if (width > 16384 || height > 16384 || width * height > Math.min(maxPixels, 16 * 1024 * 1024)) throw new Error(tr('timeline.tween.tooLarge'))
  reserve?.(width * height * 4)
  const pixels = new Uint32Array(width * height)
  const opacity = startOpacity * (1 - progress) + endOpacity * progress
  const amount = opacity > 0 ? endOpacity * progress / opacity : progress
  const read = (surface: AnimationCelSurface | undefined, x: number, y: number): number => {
    if (!surface) return 0
    const sx = x - surface.offsetX, sy = y - surface.offsetY
    return sx < 0 || sy < 0 || sx >= surface.width || sy >= surface.height ? 0 : readSurfacePackedLocal(surface, sx, sy)
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const a = read(start, offsetX + x, offsetY + y), b = read(end, offsetX + x, offsetY + y)
    if (format === 'indexed') {
      pixels[y * width + x] = amount > (dither[((offsetY + y) & 3) * 4 + ((offsetX + x) & 3)] + 0.5) / 16 ? b : a
      continue
    }
    const from = unpackColor(a), to = unpackColor(b)
    const alphaA = from.a * (1 - amount), alphaB = to.a * amount, alpha = alphaA + alphaB
    if (alpha > 0) pixels[y * width + x] = packColor({
      r: (from.r * alphaA + to.r * alphaB) / alpha,
      g: (from.g * alphaA + to.g * alphaB) / alpha,
      b: (from.b * alphaA + to.b * alphaB) / alpha, a: alpha
    })
  }
  const geometry = { width, height, offsetX, offsetY }
  return { opacity, surface: format === 'indexed' ? { ...geometry, format, pixels }
    : { ...geometry, format, pixels: new Uint8ClampedArray(pixels.buffer) } }
}
