import type { RgbaColor } from '@shared/types-color'
import type { SpriteDocument } from '@shared/types-document'
import { compositeDocument } from './document-composite'
import { encodePng } from './png-encode'
import { translateCurrent as tr } from './localization'
import { clampByte, hsvToRgb, packColor, rgbToHsv } from './raster'

interface WeightedColor extends RgbaColor { count: number }

export type PaletteSortMode = 'hue' | 'saturation' | 'brightness' | 'luminance' | 'red' | 'green' | 'blue' | 'alpha'
export type PaletteSortDirection = 'ascending' | 'descending'

interface PaletteColorSortValues {
  achromatic: boolean
  hue: number
  brightness: number
  luminance: number
  saturation: number
}

const srgbToLinear = (channel: number): number => {
  const value = channel / 255
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

const paletteColorSortValues = (color: RgbaColor): PaletteColorSortValues => {
  const red = color.r / 255
  const green = color.g / 255
  const blue = color.b / 255
  const maximum = Math.max(red, green, blue)
  const minimum = Math.min(red, green, blue)
  const range = maximum - minimum
  let hue = 0
  if (range > 0) {
    if (maximum === red) hue = ((green - blue) / range + (green < blue ? 6 : 0)) * 60
    else if (maximum === green) hue = ((blue - red) / range + 2) * 60
    else hue = ((red - green) / range + 4) * 60
  }
  return {
    achromatic: range <= 8 / 255,
    hue,
    brightness: maximum,
    luminance: 0.2126 * srgbToLinear(color.r) + 0.7152 * srgbToLinear(color.g) + 0.0722 * srgbToLinear(color.b),
    saturation: maximum === 0 ? 0 : range / maximum
  }
}

const comparePaletteColorsByHue = (left: RgbaColor, right: RgbaColor): number => {
  const leftValues = paletteColorSortValues(left)
  const rightValues = paletteColorSortValues(right)
  if (leftValues.achromatic !== rightValues.achromatic) return leftValues.achromatic ? -1 : 1
  if (leftValues.achromatic) return leftValues.brightness - rightValues.brightness || right.a - left.a || packColor(left) - packColor(right)
  return leftValues.hue - rightValues.hue
    || leftValues.brightness - rightValues.brightness
    || rightValues.saturation - leftValues.saturation
    || right.a - left.a
    || packColor(left) - packColor(right)
}

export const comparePaletteColors = (left: RgbaColor, right: RgbaColor, mode: PaletteSortMode, direction: PaletteSortDirection = 'ascending'): number => {
  const leftValues = paletteColorSortValues(left)
  const rightValues = paletteColorSortValues(right)
  const result = mode === 'saturation'
    ? leftValues.saturation - rightValues.saturation || leftValues.brightness - rightValues.brightness || comparePaletteColorsByHue(left, right)
    : mode === 'brightness'
      ? leftValues.brightness - rightValues.brightness || leftValues.saturation - rightValues.saturation || comparePaletteColorsByHue(left, right)
      : mode === 'luminance'
        ? leftValues.luminance - rightValues.luminance || leftValues.brightness - rightValues.brightness || comparePaletteColorsByHue(left, right)
        : mode === 'red'
          ? left.r - right.r || left.g - right.g || left.b - right.b || left.a - right.a
          : mode === 'green'
            ? left.g - right.g || left.r - right.r || left.b - right.b || left.a - right.a
            : mode === 'blue'
              ? left.b - right.b || left.r - right.r || left.g - right.g || left.a - right.a
              : mode === 'alpha'
                ? left.a - right.a || comparePaletteColorsByHue(left, right)
                : comparePaletteColorsByHue(left, right)
  return direction === 'descending' ? -result : result
}

export const sortPaletteColors = (colors: readonly RgbaColor[], mode: PaletteSortMode = 'hue', direction: PaletteSortDirection = 'ascending'): RgbaColor[] => [...colors]
  .sort((left, right) => comparePaletteColors(left, right, mode, direction))
  .map((color) => ({ ...color }))

const interpolateChannel = (start: number, end: number, amount: number): number => clampByte(start + (end - start) * amount)

export const paletteGradient = (start: RgbaColor, end: RgbaColor, count: number, byHue = false): RgbaColor[] => {
  const length = Math.max(0, Math.trunc(count))
  if (length === 0) return []
  if (length === 1) return [{ ...start }]
  const startHsv = rgbToHsv(start)
  const endHsv = rgbToHsv(end)
  let hueDelta = endHsv.h - startHsv.h
  if (hueDelta > 180) hueDelta -= 360
  else if (hueDelta < -180) hueDelta += 360
  return Array.from({ length }, (_, index) => {
    const amount = index / (length - 1)
    if (!byHue) return {
      r: interpolateChannel(start.r, end.r, amount),
      g: interpolateChannel(start.g, end.g, amount),
      b: interpolateChannel(start.b, end.b, amount),
      a: interpolateChannel(start.a, end.a, amount)
    }
    return hsvToRgb({
      h: startHsv.h + hueDelta * amount,
      s: startHsv.s + (endHsv.s - startHsv.s) * amount,
      v: startHsv.v + (endHsv.v - startHsv.v) * amount
    }, interpolateChannel(start.a, end.a, amount))
  })
}

const colorKey = (color: RgbaColor): number =>
  (color.r | (color.g << 8) | (color.b << 16) | (color.a << 24)) >>> 0

const channelValue = (color: RgbaColor, channel: keyof RgbaColor): number => color[channel]

const bucketRange = (colors: WeightedColor[]): { channel: keyof RgbaColor; range: number } => {
  const channels: Array<keyof RgbaColor> = ['r', 'g', 'b', 'a']
  let best: { channel: keyof RgbaColor; range: number } = { channel: 'r', range: -1 }
  for (const channel of channels) {
    let minimum = 255
    let maximum = 0
    for (const color of colors) {
      minimum = Math.min(minimum, channelValue(color, channel))
      maximum = Math.max(maximum, channelValue(color, channel))
    }
    if (maximum - minimum > best.range) best = { channel, range: maximum - minimum }
  }
  return best
}

const splitBucket = (colors: WeightedColor[]): [WeightedColor[], WeightedColor[]] | null => {
  if (colors.length < 2) return null
  const { channel } = bucketRange(colors)
  const sorted = [...colors].sort((left, right) => channelValue(left, channel) - channelValue(right, channel) || colorKey(left) - colorKey(right))
  const total = sorted.reduce((sum, color) => sum + color.count, 0)
  let accumulated = 0
  let splitIndex = 1
  for (; splitIndex < sorted.length; splitIndex += 1) {
    accumulated += sorted[splitIndex - 1].count
    if (accumulated >= total / 2) break
  }
  return [sorted.slice(0, splitIndex), sorted.slice(splitIndex)]
}

const averageBucket = (colors: WeightedColor[]): RgbaColor => {
  const total = colors.reduce((sum, color) => sum + color.count, 0)
  const average = (channel: keyof RgbaColor): number => Math.round(colors.reduce((sum, color) => sum + channelValue(color, channel) * color.count, 0) / total)
  return { r: average('r'), g: average('g'), b: average('b'), a: average('a') }
}

export function extractPaletteColorsFromRgbaSurfaces(surfaces: readonly Uint8ClampedArray[], requestedLimit: number, maximumSamples = Number.POSITIVE_INFINITY): RgbaColor[] {
  const limit = Math.max(1, Math.min(4096, Math.round(requestedLimit) || 1))
  const totalPixels = surfaces.reduce((total, pixels) => total + Math.floor(pixels.length / 4), 0)
  const sampleLimit = Number.isFinite(maximumSamples) ? Math.max(1, Math.floor(maximumSamples)) : Math.max(1, totalPixels)
  const sampleStride = Math.max(1, Math.ceil(totalPixels / sampleLimit))
  const colors = new Map<number, WeightedColor>()
  let globalPixelIndex = 0
  for (const pixels of surfaces) {
    for (let offset = 0; offset < pixels.length; offset += 4) {
      const sample = globalPixelIndex % sampleStride === 0
      globalPixelIndex += 1
      if (!sample) continue
      if (pixels[offset + 3] === 0) continue
      const color = { r: pixels[offset], g: pixels[offset + 1], b: pixels[offset + 2], a: pixels[offset + 3] }
      const key = colorKey(color)
      const existing = colors.get(key)
      if (existing) existing.count += 1
      else colors.set(key, { ...color, count: 1 })
    }
  }
  const unique = [...colors.values()]
  if (unique.length <= limit) return unique.map(({ r, g, b, a }) => ({ r, g, b, a }))

  const buckets: WeightedColor[][] = [unique]
  while (buckets.length < limit) {
    let candidateIndex = -1
    let candidateScore = -1
    for (let index = 0; index < buckets.length; index += 1) {
      if (buckets[index].length < 2) continue
      const score = bucketRange(buckets[index]).range * buckets[index].reduce((sum, color) => sum + color.count, 0)
      if (score > candidateScore) {
        candidateIndex = index
        candidateScore = score
      }
    }
    if (candidateIndex < 0) break
    const split = splitBucket(buckets[candidateIndex])
    if (!split || split[0].length === 0 || split[1].length === 0) break
    buckets.splice(candidateIndex, 1, split[0], split[1])
  }

  const result: RgbaColor[] = []
  const seen = new Set<number>()
  for (const bucket of buckets) {
    const average = averageBucket(bucket)
    const representative = seen.has(colorKey(average))
      ? [...bucket].sort((left, right) => right.count - left.count || colorKey(left) - colorKey(right)).find((color) => !seen.has(colorKey(color)))
      : average
    if (!representative) continue
    const color = { r: representative.r, g: representative.g, b: representative.b, a: representative.a }
    seen.add(colorKey(color))
    result.push(color)
  }

  // Different median-cut buckets can share the same weighted average. Fill any
  // collisions with deterministic source colors so the requested count is kept.
  const targetCount = Math.min(limit, unique.length)
  if (result.length < targetCount) {
    const candidates = [...unique].sort((left, right) => right.count - left.count || colorKey(left) - colorKey(right))
    for (const candidate of candidates) {
      const key = colorKey(candidate)
      if (seen.has(key)) continue
      seen.add(key)
      result.push({ r: candidate.r, g: candidate.g, b: candidate.b, a: candidate.a })
      if (result.length === targetCount) break
    }
  }
  return result
}

export function extractPaletteColors(document: SpriteDocument, requestedLimit: number): RgbaColor[] {
  return sortPaletteColors(extractPaletteColorsFromRgbaSurfaces([compositeDocument(document)], requestedLimit), 'luminance')
}

export function mergePaletteColors(current: RgbaColor[], incoming: RgbaColor[]): RgbaColor[] {
  const result = current.map((color) => ({ ...color }))
  const seen = new Set(result.map(colorKey))
  for (const color of incoming) {
    const key = colorKey(color)
    if (seen.has(key)) continue
    seen.add(key)
    result.push({ ...color })
  }
  return result
}

export function encodePalettePng(colors: RgbaColor[], tileSize = 16, maximumColumns = 8): { bytes: Uint8Array; width: number; height: number } {
  if (colors.length === 0) throw new Error(tr('core.palette.empty'))
  const size = Math.max(1, Math.min(64, Math.round(tileSize)))
  const columns = Math.max(1, Math.min(Math.round(maximumColumns), colors.length))
  const rows = Math.ceil(colors.length / columns)
  const width = columns * size
  const height = rows * size
  const pixels = new Uint8ClampedArray(width * height * 4)
  for (let index = 0; index < colors.length; index += 1) {
    const color = colors[index]
    const startX = (index % columns) * size
    const startY = Math.floor(index / columns) * size
    for (let y = startY; y < startY + size; y += 1) {
      for (let x = startX; x < startX + size; x += 1) {
        const offset = (y * width + x) * 4
        pixels[offset] = color.r
        pixels[offset + 1] = color.g
        pixels[offset + 2] = color.b
        pixels[offset + 3] = color.a
      }
    }
  }
  return { bytes: encodePng(pixels, width, height, true).bytes, width, height }
}
