import type { AnimationCelSurface } from '@shared/types-animation'
import type { PaletteEntry, RgbaColor } from '@shared/types-color'
import { rasterContentBounds } from './document-model'
import { readSurfacePackedLocal } from './runtime-raster'
import { packColor, unpackColor } from './raster'
import { translateCurrent as tr } from './localization'

type MorphInput = { surface: AnimationCelSurface; bounds: { x: number; y: number; width: number; height: number } }

function input(surface: AnimationCelSurface | undefined, palette: readonly PaletteEntry[]): MorphInput {
  const bounds = surface && rasterContentBounds(surface, palette)
  if (!surface || !bounds) throw new Error(tr('timeline.tween.morphNeedsContent'))
  return { surface, bounds }
}

/** Eight-neighbour chamfer distance and nearest seed, in linear time and bounded memory. */
function distanceField(colors: Uint32Array, width: number, height: number, inside: boolean) {
  const distance = new Float32Array(colors.length).fill(Infinity)
  const nearest = new Int32Array(colors.length).fill(-1)
  for (let i = 0; i < colors.length; i++) if ((colors[i] >>> 24 > 0) === inside) { distance[i] = 0; nearest[i] = i }
  const visit = (i: number, other: number, cost: number) => {
    const candidate = distance[other] + cost
    if (candidate < distance[i]) { distance[i] = candidate; nearest[i] = nearest[other] }
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x
    if (x > 0) visit(i, i - 1, 1)
    if (y > 0) {
      visit(i, i - width, 1)
      if (x > 0) visit(i, i - width - 1, Math.SQRT2)
      if (x + 1 < width) visit(i, i - width + 1, Math.SQRT2)
    }
  }
  for (let y = height - 1; y >= 0; y--) for (let x = width - 1; x >= 0; x--) {
    const i = y * width + x
    if (x + 1 < width) visit(i, i + 1, 1)
    if (y + 1 < height) {
      visit(i, i + width, 1)
      if (x > 0) visit(i, i + width - 1, Math.SQRT2)
      if (x + 1 < width) visit(i, i + width + 1, Math.SQRT2)
    }
  }
  return { distance, nearest }
}

function shapeField(source: MorphInput, width: number, height: number, palette: Map<number, number>) {
  // A transparent border keeps the distance finite even for a solid rectangle.
  const stride = width + 2
  const colors = new Uint32Array(stride * (height + 2))
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const sx = source.bounds.x + Math.floor((x + 0.5) * source.bounds.width / width)
    const sy = source.bounds.y + Math.floor((y + 0.5) * source.bounds.height / height)
    const packed = readSurfacePackedLocal(source.surface, sx, sy)
    colors[(y + 1) * stride + x + 1] = source.surface.format === 'rgba' ? packed : palette.get(packed) ?? 0
  }
  const inner = distanceField(colors, stride, height + 2, true)
  const outer = distanceField(colors, stride, height + 2, false)
  const signed = inner.distance
  for (let i = 0; i < colors.length; i++) {
    if (colors[i] >>> 24 > 0) signed[i] = 0.5 - outer.distance[i]
    else {
      signed[i] -= 0.5
      // Extend the nearest solid color beyond the outline, avoiding faded edges.
      colors[i] = inner.nearest[i] >= 0 ? colors[inner.nearest[i]] : 0
    }
  }
  return { colors, signed }
}

/** Align content bounds, then interpolate signed outlines instead of image opacity. */
export function prepareMorphTween(start: AnimationCelSurface | undefined, end: AnimationCelSurface | undefined, palette: readonly PaletteEntry[]) {
  const from = input(start, palette), to = input(end, palette)
  const width = Math.max(from.bounds.width, to.bounds.width), height = Math.max(from.bounds.height, to.bounds.height)
  if (width > 16384 || height > 16384 || (width + 2) * (height + 2) > 1024 * 1024) throw new Error(tr('timeline.tween.tooLarge'))
  const lookup = new Map(palette.map((entry) => [entry.id, packColor(entry.color)]))
  const a = shapeField(from, width, height, lookup), b = shapeField(to, width, height, lookup)
  return { from, to, width, height, a, b, byteLength: a.colors.byteLength + a.signed.byteLength + b.colors.byteLength + b.signed.byteLength }
}

export function morphTweenSurface(plan: ReturnType<typeof prepareMorphTween>, progress: number, maxPixels: number, indexedColor: (color: RgbaColor) => number, reserve?: (bytes: number) => void): AnimationCelSurface {
  const t = Math.max(0, Math.min(1, progress)), lerp = (a: number, b: number) => a + (b - a) * t
  const { from, to } = plan
  const width = Math.max(1, Math.round(lerp(from.bounds.width, to.bounds.width)))
  const height = Math.max(1, Math.round(lerp(from.bounds.height, to.bounds.height)))
  const offsetX = Math.round(lerp(from.surface.offsetX + from.bounds.x, to.surface.offsetX + to.bounds.x))
  const offsetY = Math.round(lerp(from.surface.offsetY + from.bounds.y, to.surface.offsetY + to.bounds.y))
  if (width * height > maxPixels) throw new Error(tr('timeline.tween.tooLarge'))
  reserve?.(width * height * 4)
  const pixels = new Uint32Array(width * height), format = from.surface.format
  const paletteCache = new Map<number, number>()
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (t === 0 || t === 1) {
      const endpoint = t === 0 ? from : to
      pixels[y * width + x] = readSurfacePackedLocal(endpoint.surface, endpoint.bounds.x + x, endpoint.bounds.y + y)
      continue
    }
    const sx = Math.floor((x + 0.5) * plan.width / width), sy = Math.floor((y + 0.5) * plan.height / height)
    const index = (sy + 1) * (plan.width + 2) + sx + 1
    if (lerp(plan.a.signed[index], plan.b.signed[index]) > 0) continue
    const a = unpackColor(plan.a.colors[index]), b = unpackColor(plan.b.colors[index])
    const color = { r: lerp(a.r, b.r), g: lerp(a.g, b.g), b: lerp(a.b, b.b), a: lerp(a.a, b.a) }
    const packed = packColor(color)
    if (format === 'rgba') pixels[y * width + x] = packed
    else {
      let id = paletteCache.get(packed)
      if (id === undefined) {
        id = indexedColor(unpackColor(packed))
        if (paletteCache.size < 4096) paletteCache.set(packed, id)
      }
      pixels[y * width + x] = id
    }
  }
  const geometry = { width, height, offsetX, offsetY }
  return format === 'indexed' ? { ...geometry, format, pixels } : { ...geometry, format, pixels: new Uint8ClampedArray(pixels.buffer) }
}
