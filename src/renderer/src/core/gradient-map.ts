import type { GradientMapSettings } from '@shared/types-gradient-map'
import type { GradientStop } from '@shared/types-brush'
import type { RgbaColor } from '@shared/types-color'
import { GRADIENT_DITHER_PRESETS, gradientColorForAmount, normalizeGradientStops } from './gradient-color'

const black = { r: 0, g: 0, b: 0, a: 255 }
const white = { r: 255, g: 255, b: 255, a: 255 }
const byte = (value: unknown, fallback: number): number => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(255, Math.round(value))) : fallback

/** Accept only bounded, finite settings at persistence and UI boundaries. */
export function normalizeGradientMap(value: unknown): GradientMapSettings {
  const data = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const stops: GradientStop[] = []
  if (Array.isArray(data.stops)) for (const candidate of data.stops.slice(0, 256)) {
    if (!candidate || typeof candidate !== 'object' || !Number.isFinite(candidate.position) || !candidate.color || typeof candidate.color !== 'object') continue
    stops.push({ position: candidate.position, color: { r: byte(candidate.color.r, 0), g: byte(candidate.color.g, 0), b: byte(candidate.color.b, 0), a: 255 } })
  }
  return {
    stops: normalizeGradientStops(stops, black, white),
    mode: data.mode === 'steps' ? 'steps' : 'continuous',
    dither: GRADIENT_DITHER_PRESETS.includes(data.dither as GradientMapSettings['dither']) ? data.dither as GradientMapSettings['dither'] : 'none',
    reverse: data.reverse === true
  }
}

export const gradientMapSignature = (settings: GradientMapSettings): string => [settings.mode, settings.dither, settings.reverse,
  ...settings.stops.map(stop => `${stop.position}:${stop.color.r},${stop.color.g},${stop.color.b}`)].join('|')

/** Prepare stop lookup once; alpha is preserved and dither uses document coordinates. */
function createReferenceGradientMapSampler(value: GradientMapSettings): (color: RgbaColor, x?: number, y?: number) => RgbaColor {
  const settings = normalizeGradientMap(value)
  const stops = settings.stops
  const lookup = Array.from({ length: 256 }, (_, luminance) => {
    const amount = settings.reverse ? 1 - luminance / 255 : luminance / 255
    const rightIndex = stops.findIndex(stop => stop.position >= amount)
    const right = stops[rightIndex < 0 ? stops.length - 1 : rightIndex]
    const left = stops[Math.max(0, rightIndex < 0 ? stops.length - 1 : rightIndex - 1)]
    const fraction = right.position > left.position ? Math.max(0, Math.min(1, (amount - left.position) / (right.position - left.position))) : 0
    const color = settings.mode === 'steps' ? (fraction < 0.5 ? left.color : right.color)
      : gradientColorForAmount(left.color, right.color, fraction, 0, 0)
    return { left: left.color, right: right.color, fraction, color }
  })
  return (source, x = 0, y = 0) => {
    if (source.a === 0) return { ...source }
    const luminance = byte(source.r * 0.2126 + source.g * 0.7152 + source.b * 0.0722, 0)
    const entry = lookup[luminance]
    const color = settings.dither === 'none' ? entry.color : gradientColorForAmount(entry.left, entry.right, entry.fraction, x, y, settings.dither)
    return { r: color.r, g: color.g, b: color.b, a: source.a }
  }
}

const packedSamplerCache = new Map<string, (r: number, g: number, b: number, x: number, y: number) => number>()

/** A small periodic RGB table avoids color allocation and dither math per pixel. */
export function createGradientMapPackedSampler(value: GradientMapSettings): (r: number, g: number, b: number, x: number, y: number) => number {
  const settings = normalizeGradientMap(value)
  const key = gradientMapSignature(settings)
  const cached = packedSamplerCache.get(key)
  if (cached) return cached
  const period = settings.dither === 'none' ? 1 : settings.dither === 'bayer-8' ? 8 : settings.dither === 'bayer-4' ? 4 : settings.dither === 'bayer-2' || settings.dither === 'checker' ? 2 : 6
  const table = new Uint32Array(period * period * 256)
  const sample = createReferenceGradientMapSampler(settings)
  for (let y = 0; y < period; y++) for (let x = 0; x < period; x++) for (let luminance = 0; luminance < 256; luminance++) {
    const color = sample({ r: luminance, g: luminance, b: luminance, a: 255 }, x, y)
    table[(y * period + x) * 256 + luminance] = color.r | (color.g << 8) | (color.b << 16)
  }
  const packed: (r: number, g: number, b: number, x: number, y: number) => number = period === 1
    ? (r, g, b) => table[Math.round(r * 0.2126 + g * 0.7152 + b * 0.0722)]
    : (r, g, b, x, y) => table[(((y % period + period) % period) * period + (x % period + period) % period) * 256 + Math.round(r * 0.2126 + g * 0.7152 + b * 0.0722)]
  if (packedSamplerCache.size >= 16) packedSamplerCache.delete(packedSamplerCache.keys().next().value!)
  packedSamplerCache.set(key, packed)
  return packed
}

export function createGradientMapSampler(value: GradientMapSettings): (color: RgbaColor, x?: number, y?: number) => RgbaColor {
  const sample = createGradientMapPackedSampler(value)
  return (source, x = 0, y = 0) => {
    if (source.a === 0) return { ...source }
    const rgb = sample(source.r, source.g, source.b, x, y)
    return { r: rgb & 255, g: (rgb >>> 8) & 255, b: (rgb >>> 16) & 255, a: source.a }
  }
}
