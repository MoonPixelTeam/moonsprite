import type { RasterLayer } from '@shared/types-layer'
import type { RgbaColor } from '@shared/types-color'
import type { SelectionMask, SelectionRect } from '@shared/types-selection'
import type { SpriteDocument } from '@shared/types-document'
import { cacheRasterContentBounds, cachedRasterContentBounds, isLayerMask, markLayerContentChanged, normalizeLayerPackedValue, readLayerColor } from './document-model'
import { beginPixelEdit, recordPixel, type PixelEdit } from './history'
import { translateCurrent as tr } from './localization'
import { packColor } from './raster'
import { selectionContains } from './selection'

export type AdjustmentKind = 'color-balance' | 'brightness-contrast' | 'hue-saturation' | 'curves'
export type CurveChannel = 'rgb' | 'red' | 'green' | 'blue'
export interface CurvePoint { x: number; y: number }

export interface CurveHistogram {
  rgb: Uint32Array
  red: Uint32Array
  green: Uint32Array
  blue: Uint32Array
}

export interface ColorAdjustment {
  kind: AdjustmentKind
  shadows?: number
  midtones?: number
  highlights?: number
  brightness?: number
  contrast?: number
  hue?: number
  saturation?: number
  lightness?: number
  /** Curve's midpoint, 0-255. 128 is the identity. */
  curveMidpoint?: number
  curvePoints?: CurvePoint[]
  curveRedPoints?: CurvePoint[]
  curveGreenPoints?: CurvePoint[]
  curveBluePoints?: CurvePoint[]
  shadowsCyanRed?: number
  shadowsMagentaGreen?: number
  shadowsYellowBlue?: number
  midtonesCyanRed?: number
  midtonesMagentaGreen?: number
  midtonesYellowBlue?: number
  highlightsCyanRed?: number
  highlightsMagentaGreen?: number
  highlightsYellowBlue?: number
  preserveLuminosity?: boolean
}

const identityCurvePoints = (points: CurvePoint[] | undefined): boolean => !points
  || (points.length === 2 && points[0].x === 0 && points[0].y === 0 && points[1].x === 255 && points[1].y === 255)

export const isColorAdjustmentIdentity = (adjustment: ColorAdjustment): boolean => {
  if (adjustment.kind === 'brightness-contrast') return (adjustment.brightness ?? 0) === 0 && (adjustment.contrast ?? 0) === 0
  if (adjustment.kind === 'hue-saturation') return (adjustment.hue ?? 0) === 0 && (adjustment.saturation ?? 0) === 0 && (adjustment.lightness ?? 0) === 0
  if (adjustment.kind === 'curves') return (adjustment.curveMidpoint ?? 128) === 128
    && identityCurvePoints(adjustment.curvePoints)
    && identityCurvePoints(adjustment.curveRedPoints)
    && identityCurvePoints(adjustment.curveGreenPoints)
    && identityCurvePoints(adjustment.curveBluePoints)
  return (adjustment.shadows ?? 0) === 0
    && (adjustment.midtones ?? 0) === 0
    && (adjustment.highlights ?? 0) === 0
    && (adjustment.shadowsCyanRed ?? 0) === 0
    && (adjustment.shadowsMagentaGreen ?? 0) === 0
    && (adjustment.shadowsYellowBlue ?? 0) === 0
    && (adjustment.midtonesCyanRed ?? 0) === 0
    && (adjustment.midtonesMagentaGreen ?? 0) === 0
    && (adjustment.midtonesYellowBlue ?? 0) === 0
    && (adjustment.highlightsCyanRed ?? 0) === 0
    && (adjustment.highlightsMagentaGreen ?? 0) === 0
    && (adjustment.highlightsYellowBlue ?? 0) === 0
}

const clamp = (value: number): number => Math.max(0, Math.min(255, Math.round(value)))

const identityCurve: CurvePoint[] = [{ x: 0, y: 0 }, { x: 255, y: 255 }]

const createCurveHistogram = (): CurveHistogram => ({
  rgb: new Uint32Array(256),
  red: new Uint32Array(256),
  green: new Uint32Array(256),
  blue: new Uint32Array(256)
})

const accumulateCurveHistogram = (
  histogram: CurveHistogram,
  pixels: Uint8ClampedArray | Uint32Array,
  format: 'rgba' | 'indexed',
  paletteMap: Map<number, RgbaColor> | null,
  fromPixel: number,
  toPixel: number
): void => {
  if (format === 'rgba') {
    const rgba = pixels as Uint8ClampedArray
    if (rgba.byteOffset % 4 === 0) {
      const words = new Uint32Array(rgba.buffer as ArrayBuffer, rgba.byteOffset, rgba.byteLength / 4)
      for (let index = fromPixel; index < toPixel; index += 1) {
        const current = words[index]
        if ((current >>> 24) === 0) continue
        const red = current & 0xff
        const green = (current >>> 8) & 0xff
        const blue = (current >>> 16) & 0xff
        histogram.rgb[((red + green + blue + 1) / 3) | 0] += 1
        histogram.red[red] += 1
        histogram.green[green] += 1
        histogram.blue[blue] += 1
      }
    } else for (let pixel = fromPixel; pixel < toPixel; pixel += 1) {
      const offset = pixel * 4
      if (rgba[offset + 3] === 0) continue
      const red = rgba[offset]
      const green = rgba[offset + 1]
      const blue = rgba[offset + 2]
      histogram.rgb[((red + green + blue + 1) / 3) | 0] += 1
      histogram.red[red] += 1
      histogram.green[green] += 1
      histogram.blue[blue] += 1
    }
  } else {
    const indexed = pixels as Uint32Array
    for (let index = fromPixel; index < toPixel; index += 1) {
      const color = paletteMap?.get(indexed[index])
      if (!color || color.a === 0) continue
      histogram.rgb[((color.r + color.g + color.b + 1) / 3) | 0] += 1
      histogram.red[color.r] += 1
      histogram.green[color.g] += 1
      histogram.blue[color.b] += 1
    }
  }
}

export function buildCurveHistogram(pixels: Uint8ClampedArray | Uint32Array, format: 'rgba' | 'indexed', palette: Array<{ id: number; color: RgbaColor }>): CurveHistogram {
  const histogram = createCurveHistogram()
  const totalPixels = format === 'rgba' ? pixels.length / 4 : pixels.length
  accumulateCurveHistogram(histogram, pixels, format, format === 'indexed' ? new Map(palette.map((entry) => [entry.id, entry.color])) : null, 0, totalPixels)
  return histogram
}

const CURVE_HISTOGRAM_CHUNK_PIXELS = 512 * 1024

export async function buildCurveHistogramChunked(
  pixels: Uint8ClampedArray | Uint32Array,
  format: 'rgba' | 'indexed',
  palette: Array<{ id: number; color: RgbaColor }>,
  shouldContinue: () => boolean = () => true,
  yieldControl: () => Promise<void> = () => Promise.resolve()
): Promise<CurveHistogram | null> {
  const histogram = createCurveHistogram()
  const totalPixels = format === 'rgba' ? pixels.length / 4 : pixels.length
  const paletteMap = format === 'indexed' ? new Map(palette.map((entry) => [entry.id, entry.color])) : null
  for (let fromPixel = 0; fromPixel < totalPixels; fromPixel += CURVE_HISTOGRAM_CHUNK_PIXELS) {
    if (!shouldContinue()) return null
    const toPixel = Math.min(totalPixels, fromPixel + CURVE_HISTOGRAM_CHUNK_PIXELS)
    accumulateCurveHistogram(histogram, pixels, format, paletteMap, fromPixel, toPixel)
    if (toPixel < totalPixels) await yieldControl()
  }
  return shouldContinue() ? histogram : null
}

export function buildHistogramPath(values: Uint32Array, width = 255, height = 255): string {
  const maximum = Math.max(1, ...values)
  const commands = [`M 0 ${height}`]
  for (let index = 0; index < values.length; index += 1) {
    const x = index / Math.max(1, values.length - 1) * width
    const y = height - values[index] / maximum * (height - 4)
    commands.push(`L ${x.toFixed(2)} ${y.toFixed(2)}`)
  }
  commands.push(`L ${width} ${height} Z`)
  return commands.join(' ')
}

const curveControls = (points: CurvePoint[], index: number, axis: 'x' | 'y'): number => {
  const current = points[index]
  const previous = points[Math.max(0, index - 1)]
  const next = points[Math.min(points.length - 1, index + 1)]
  return (next[axis] - previous[axis]) / Math.max(1, next.x - previous.x)
}

export function buildCurveLut(points: CurvePoint[]): Uint8Array {
  const normalized = points
    .map((point) => ({ x: clamp(point.x), y: clamp(point.y) }))
    .sort((left, right) => left.x - right.x)
    .filter((point, index, entries) => index === entries.length - 1 || point.x !== entries[index + 1].x)
  if (normalized.length === 0 || normalized[0].x !== 0) normalized.unshift({ x: 0, y: normalized[0]?.y ?? 0 })
  if (normalized[normalized.length - 1].x !== 255) normalized.push({ x: 255, y: normalized[normalized.length - 1]?.y ?? 255 })
  const lut = new Uint8Array(256)
  let segment = 0
  for (let input = 0; input < 256; input += 1) {
    while (segment < normalized.length - 2 && input > normalized[segment + 1].x) segment += 1
    const left = normalized[segment]
    const right = normalized[Math.min(segment + 1, normalized.length - 1)]
    const distance = Math.max(1, right.x - left.x)
    const t = Math.max(0, Math.min(1, (input - left.x) / distance))
    const leftSlope = curveControls(normalized, segment, 'y')
    const rightSlope = curveControls(normalized, Math.min(segment + 1, normalized.length - 1), 'y')
    const controlLeft = left.y + leftSlope * distance / 3
    const controlRight = right.y - rightSlope * distance / 3
    const inverse = 1 - t
    lut[input] = clamp(inverse ** 3 * left.y + 3 * inverse ** 2 * t * controlLeft + 3 * inverse * t ** 2 * controlRight + t ** 3 * right.y)
  }
  return lut
}

export function buildCurvePath(points: CurvePoint[]): string {
  const normalized = points
    .map((point) => ({ x: clamp(point.x), y: clamp(point.y) }))
    .sort((left, right) => left.x - right.x)
  if (normalized.length < 2) return ''
  const commands = [`M ${normalized[0].x} ${255 - normalized[0].y}`]
  for (let index = 0; index < normalized.length - 1; index += 1) {
    const left = normalized[index]
    const right = normalized[index + 1]
    const distance = Math.max(1, right.x - left.x)
    const leftControlY = left.y + curveControls(normalized, index, 'y') * distance / 3
    const rightControlY = right.y - curveControls(normalized, index + 1, 'y') * distance / 3
    commands.push(`C ${left.x + distance / 3} ${255 - leftControlY} ${right.x - distance / 3} ${255 - rightControlY} ${right.x} ${255 - right.y}`)
  }
  return commands.join(' ')
}

export interface PreparedCurveLuts {
  rgb: Uint8Array
  red: Uint8Array
  green: Uint8Array
  blue: Uint8Array
}

const prepareCurveLuts = (adjustment: ColorAdjustment): PreparedCurveLuts => ({
  rgb: buildCurveLut(adjustment.curvePoints ?? [{ x: 0, y: 0 }, { x: 128, y: adjustment.curveMidpoint ?? 128 }, { x: 255, y: 255 }]),
  red: buildCurveLut(adjustment.curveRedPoints ?? identityCurve),
  green: buildCurveLut(adjustment.curveGreenPoints ?? identityCurve),
  blue: buildCurveLut(adjustment.curveBluePoints ?? identityCurve)
})

const hueSaturationPackedRgb = (red: number, green: number, blue: number, adjustment: ColorAdjustment): number => {
  const r = red / 255; const g = green / 255; const b = blue / 255
  const max = Math.max(r, g, b); const min = Math.min(r, g, b); const delta = max - min; const l = (max + min) / 2
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1))
  const hue = delta === 0 ? 0 : ((max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4) * 60 + 360) % 360
  const lightnessDelta = (adjustment.lightness ?? 0) / 100
  const lightness = lightnessDelta >= 0 ? l + (1 - l) * lightnessDelta : l * (1 + lightnessDelta)
  const h = (((hue + (adjustment.hue ?? 0)) % 360) + 360) % 360 / 360
  const s = Math.max(0, Math.min(1, saturation * (1 + (adjustment.saturation ?? 0) / 100)))
  const nextLightness = Math.max(0, Math.min(1, lightness))
  if (s === 0) {
    const value = clamp(nextLightness * 255)
    return value | (value << 8) | (value << 16)
  }
  const q = nextLightness < .5 ? nextLightness * (1 + s) : nextLightness + s - nextLightness * s; const p = 2 * nextLightness - q
  const component = (shift: number): number => { let t = (h + shift) % 1; if (t < 0) t += 1; return clamp((p + (q - p) * (t < 1 / 6 ? 6 * t : t < .5 ? 1 : t < 2 / 3 ? (2 / 3 - t) * 6 : 0)) * 255) }
  return component(1 / 3) | (component(0) << 8) | (component(-1 / 3) << 16)
}

const colorBalancePackedRgb = (red: number, green: number, blue: number, adjustment: ColorAdjustment): number => {
  const luminance = (red * 0.2126 + green * 0.7152 + blue * 0.0722) / 255
  const shadowsWeight = Math.max(0, Math.min(1, (0.5 - luminance) * 2))
  const highlightsWeight = Math.max(0, Math.min(1, (luminance - 0.5) * 2))
  const midtonesWeight = 1 - shadowsWeight - highlightsWeight
  const weighted = (legacy: number | undefined, shadow: number | undefined, middle: number | undefined, highlight: number | undefined): number =>
    (shadow ?? legacy ?? 0) * shadowsWeight + (middle ?? legacy ?? 0) * midtonesWeight + (highlight ?? legacy ?? 0) * highlightsWeight
  const cyanRed = weighted(adjustment.midtones, adjustment.shadowsCyanRed ?? adjustment.shadows, adjustment.midtonesCyanRed, adjustment.highlightsCyanRed ?? adjustment.highlights)
  const magentaGreen = weighted(undefined, adjustment.shadowsMagentaGreen, adjustment.midtonesMagentaGreen, adjustment.highlightsMagentaGreen)
  const yellowBlue = weighted(undefined, adjustment.shadowsYellowBlue, adjustment.midtonesYellowBlue, adjustment.highlightsYellowBlue)
  let nextRed = red + cyanRed - magentaGreen * 0.5 - yellowBlue * 0.5
  let nextGreen = green - cyanRed * 0.5 + magentaGreen - yellowBlue * 0.5
  let nextBlue = blue - cyanRed * 0.5 - magentaGreen * 0.5 + yellowBlue
  if (adjustment.preserveLuminosity !== false) {
    const nextLuminance = nextRed * 0.2126 + nextGreen * 0.7152 + nextBlue * 0.0722
    const correction = red * 0.2126 + green * 0.7152 + blue * 0.0722 - nextLuminance
    nextRed += correction; nextGreen += correction; nextBlue += correction
  }
  return clamp(nextRed) | (clamp(nextGreen) << 8) | (clamp(nextBlue) << 16)
}

export function adjustColor(color: RgbaColor, adjustment: ColorAdjustment, preparedCurve?: Uint8Array | PreparedCurveLuts): RgbaColor {
  if (color.a === 0) return color
  if (adjustment.kind === 'brightness-contrast') {
    const brightness = (adjustment.brightness ?? 0) * 2.55
    const contrast = (adjustment.contrast ?? 0) / 100
    const transform = (value: number): number => clamp((value - 128) * (1 + contrast) + 128 + brightness)
    return { r: transform(color.r), g: transform(color.g), b: transform(color.b), a: color.a }
  }
  if (adjustment.kind === 'hue-saturation') {
    const packed = hueSaturationPackedRgb(color.r, color.g, color.b, adjustment)
    return { r: packed & 0xff, g: (packed >>> 8) & 0xff, b: (packed >>> 16) & 0xff, a: color.a }
  }
  if (adjustment.kind === 'color-balance') {
    const packed = colorBalancePackedRgb(color.r, color.g, color.b, adjustment)
    return { r: packed & 0xff, g: (packed >>> 8) & 0xff, b: (packed >>> 16) & 0xff, a: color.a }
  }
  const midpoint = Math.max(1, Math.min(254, adjustment.curveMidpoint ?? 128))
  const curves: PreparedCurveLuts = preparedCurve && !(preparedCurve instanceof Uint8Array)
    ? preparedCurve
    : {
        rgb: preparedCurve instanceof Uint8Array ? preparedCurve : buildCurveLut(adjustment.curvePoints ?? [{ x: 0, y: 0 }, { x: 128, y: midpoint }, { x: 255, y: 255 }]),
        red: buildCurveLut(adjustment.curveRedPoints ?? identityCurve),
        green: buildCurveLut(adjustment.curveGreenPoints ?? identityCurve),
        blue: buildCurveLut(adjustment.curveBluePoints ?? identityCurve)
      }
  const rgb = curves.rgb
  return { r: curves.red[rgb[color.r]], g: curves.green[rgb[color.g]], b: curves.blue[rgb[color.b]], a: color.a }
}

const adjustmentChannelLuts = (adjustment: ColorAdjustment): PreparedCurveLuts | null => {
  if (adjustment.kind === 'brightness-contrast') {
    const brightness = (adjustment.brightness ?? 0) * 2.55
    const contrast = (adjustment.contrast ?? 0) / 100
    const lut = new Uint8Array(256)
    for (let value = 0; value < 256; value += 1) lut[value] = clamp((value - 128) * (1 + contrast) + 128 + brightness)
    return { rgb: lut, red: lut, green: lut, blue: lut }
  }
  if (adjustment.kind !== 'curves') return null
  const curves = prepareCurveLuts(adjustment)
  const red = new Uint8Array(256)
  const green = new Uint8Array(256)
  const blue = new Uint8Array(256)
  for (let value = 0; value < 256; value += 1) {
    red[value] = curves.red[curves.rgb[value]]
    green[value] = curves.green[curves.rgb[value]]
    blue[value] = curves.blue[curves.rgb[value]]
  }
  return { rgb: curves.rgb, red, green, blue }
}

interface AdjustmentLocalBounds { left: number; top: number; right: number; bottom: number }

const adjustmentLocalBounds = (layer: RasterLayer, selection: SelectionMask | null, region?: SelectionRect): AdjustmentLocalBounds | null => {
  let left = 0
  let top = 0
  let right = layer.width
  let bottom = layer.height
  if (selection) {
    left = Math.max(left, selection.x - layer.offsetX)
    top = Math.max(top, selection.y - layer.offsetY)
    right = Math.min(right, selection.x + selection.width - layer.offsetX)
    bottom = Math.min(bottom, selection.y + selection.height - layer.offsetY)
  }
  if (region) {
    left = Math.max(left, region.x - layer.offsetX)
    top = Math.max(top, region.y - layer.offsetY)
    right = Math.min(right, region.x + region.width - layer.offsetX)
    bottom = Math.min(bottom, region.y + region.height - layer.offsetY)
  }
  left = Math.max(0, Math.floor(left))
  top = Math.max(0, Math.floor(top))
  right = Math.min(layer.width, Math.ceil(right))
  bottom = Math.min(layer.height, Math.ceil(bottom))
  if (left >= right || top >= bottom) return null
  return { left, top, right, bottom }
}

const visitAdjustmentIndices = (layer: RasterLayer, selection: SelectionMask | null, visit: (index: number) => void): void => {
  if (!selection) {
    const total = layer.width * layer.height
    for (let index = 0; index < total; index += 1) visit(index)
    return
  }
  const left = Math.max(0, selection.x - layer.offsetX)
  const top = Math.max(0, selection.y - layer.offsetY)
  const right = Math.min(layer.width, selection.x + selection.width - layer.offsetX)
  const bottom = Math.min(layer.height, selection.y + selection.height - layer.offsetY)
  if (left >= right || top >= bottom) return
  if (!selection.mask) {
    for (let y = top; y < bottom; y += 1) {
      const row = y * layer.width
      for (let x = left; x < right; x += 1) visit(row + x)
    }
    return
  }
  for (let y = top; y < bottom; y += 1) {
    const row = y * layer.width
    const maskRow = (y + layer.offsetY - selection.y) * selection.width - selection.x + layer.offsetX
    for (let x = left; x < right; x += 1) if (selection.mask[maskRow + x] === 1) visit(row + x)
  }
}

const visitAdjustmentRegionIndices = (layer: RasterLayer, selection: SelectionMask | null, region: SelectionRect, visit: (index: number) => void): void => {
  const bounds = adjustmentLocalBounds(layer, selection, region)
  if (!bounds) return
  const { left, top, right, bottom } = bounds
  if (!selection?.mask) {
    for (let y = top; y < bottom; y += 1) {
      const row = y * layer.width
      for (let x = left; x < right; x += 1) visit(row + x)
    }
    return
  }
  for (let y = top; y < bottom; y += 1) {
    const row = y * layer.width
    const maskRow = (y + layer.offsetY - selection.y) * selection.width - selection.x + layer.offsetX
    for (let x = left; x < right; x += 1) if (selection.mask[maskRow + x] === 1) visit(row + x)
  }
}

const applyRgbaChannelLuts = (
  layer: RasterLayer,
  selection: SelectionMask | null,
  source: Uint8ClampedArray,
  target: Uint8ClampedArray,
  luts: PreparedCurveLuts
): void => {
  if (!selection && source.byteOffset % 4 === 0 && target.byteOffset % 4 === 0) {
    const sourceWords = new Uint32Array(source.buffer as ArrayBuffer, source.byteOffset, source.byteLength / 4)
    const targetWords = new Uint32Array(target.buffer as ArrayBuffer, target.byteOffset, target.byteLength / 4)
    for (let index = 0; index < sourceWords.length; index += 1) {
      const current = sourceWords[index]
      const alpha = current >>> 24
      targetWords[index] = alpha === 0
        ? current
        : (luts.red[current & 0xff] | (luts.green[(current >>> 8) & 0xff] << 8) | (luts.blue[(current >>> 16) & 0xff] << 16) | (alpha << 24)) >>> 0
    }
    return
  }
  visitAdjustmentIndices(layer, selection, (index) => {
    const offset = index * 4
    const alpha = source[offset + 3]
    if (alpha === 0) {
      target[offset] = source[offset]
      target[offset + 1] = source[offset + 1]
      target[offset + 2] = source[offset + 2]
    } else {
      target[offset] = luts.red[source[offset]]
      target[offset + 1] = luts.green[source[offset + 1]]
      target[offset + 2] = luts.blue[source[offset + 2]]
    }
    target[offset + 3] = alpha
  })
}

const applyRgbaChannelLutsRegion = (
  layer: RasterLayer,
  selection: SelectionMask | null,
  source: Uint8ClampedArray,
  target: Uint8ClampedArray,
  luts: PreparedCurveLuts,
  region: SelectionRect
): void => {
  visitAdjustmentRegionIndices(layer, selection, region, (index) => {
    const offset = index * 4
    const alpha = source[offset + 3]
    if (alpha === 0) {
      target[offset] = source[offset]
      target[offset + 1] = source[offset + 1]
      target[offset + 2] = source[offset + 2]
    } else {
      target[offset] = luts.red[source[offset]]
      target[offset + 1] = luts.green[source[offset + 1]]
      target[offset + 2] = luts.blue[source[offset + 2]]
    }
    target[offset + 3] = alpha
  })
}

const applyRgbaPackedTransform = (
  layer: RasterLayer,
  selection: SelectionMask | null,
  source: Uint8ClampedArray,
  target: Uint8ClampedArray,
  transform: (red: number, green: number, blue: number) => number
): void => {
  let repeatedColorCache: Map<number, number> | null = new Map()
  if (!selection && source.byteOffset % 4 === 0 && target.byteOffset % 4 === 0) {
    const sourceWords = new Uint32Array(source.buffer as ArrayBuffer, source.byteOffset, source.byteLength / 4)
    const targetWords = new Uint32Array(target.buffer as ArrayBuffer, target.byteOffset, target.byteLength / 4)
    for (let index = 0; index < sourceWords.length; index += 1) {
      const current = sourceWords[index]
      const alpha = current >>> 24
      if (alpha === 0) {
        targetWords[index] = current
        continue
      }
      const sourceRgb = current & 0x00ffffff
      let packed = repeatedColorCache?.get(sourceRgb)
      if (packed === undefined) {
        packed = transform(sourceRgb & 0xff, (sourceRgb >>> 8) & 0xff, sourceRgb >>> 16)
        if (repeatedColorCache) {
          if (repeatedColorCache.size < 8192) repeatedColorCache.set(sourceRgb, packed)
          else repeatedColorCache = null
        }
      }
      targetWords[index] = (packed | (alpha << 24)) >>> 0
    }
    return
  }
  visitAdjustmentIndices(layer, selection, (index) => {
    const offset = index * 4
    const alpha = source[offset + 3]
    if (alpha === 0) {
      target[offset] = source[offset]
      target[offset + 1] = source[offset + 1]
      target[offset + 2] = source[offset + 2]
      target[offset + 3] = alpha
      return
    }
    const sourceRgb = source[offset] | (source[offset + 1] << 8) | (source[offset + 2] << 16)
    let packed = repeatedColorCache?.get(sourceRgb)
    if (packed === undefined) {
      packed = transform(source[offset], source[offset + 1], source[offset + 2])
      if (repeatedColorCache) {
        if (repeatedColorCache.size < 8192) repeatedColorCache.set(sourceRgb, packed)
        else repeatedColorCache = null
      }
    }
    target[offset] = packed & 0xff
    target[offset + 1] = (packed >>> 8) & 0xff
    target[offset + 2] = (packed >>> 16) & 0xff
    target[offset + 3] = alpha
  })
}

const applyRgbaPackedTransformRegion = (
  layer: RasterLayer,
  selection: SelectionMask | null,
  source: Uint8ClampedArray,
  target: Uint8ClampedArray,
  transform: (red: number, green: number, blue: number) => number,
  region: SelectionRect
): void => {
  let repeatedColorCache: Map<number, number> | null = new Map()
  visitAdjustmentRegionIndices(layer, selection, region, (index) => {
    const offset = index * 4
    const alpha = source[offset + 3]
    if (alpha === 0) {
      target[offset] = source[offset]
      target[offset + 1] = source[offset + 1]
      target[offset + 2] = source[offset + 2]
      target[offset + 3] = alpha
      return
    }
    const sourceRgb = source[offset] | (source[offset + 1] << 8) | (source[offset + 2] << 16)
    let packed = repeatedColorCache?.get(sourceRgb)
    if (packed === undefined) {
      packed = transform(source[offset], source[offset + 1], source[offset + 2])
      if (repeatedColorCache) {
        if (repeatedColorCache.size < 8192) repeatedColorCache.set(sourceRgb, packed)
        else repeatedColorCache = null
      }
    }
    target[offset] = packed & 0xff
    target[offset + 1] = (packed >>> 8) & 0xff
    target[offset + 2] = (packed >>> 16) & 0xff
    target[offset + 3] = alpha
  })
}

/** Applies a preview/final adjustment without constructing per-pixel history data. */
export function applyColorAdjustmentDirect(
  document: SpriteDocument,
  layer: RasterLayer,
  adjustment: ColorAdjustment,
  selection: SelectionMask | null = null,
  sourcePixels: Uint8ClampedArray | Uint32Array = layer.pixels,
  region?: SelectionRect
): void {
  if ((layer.format === 'rgba') !== (sourcePixels instanceof Uint8ClampedArray)) throw new Error(tr('core.history.adjustmentFormatChanged'))
  const expectedLength = layer.width * layer.height * (layer.format === 'rgba' ? 4 : 1)
  if (sourcePixels.length !== expectedLength) throw new Error(tr('core.history.adjustmentFormatChanged'))
  if (region && !adjustmentLocalBounds(layer, selection, region)) return
  const contentBounds = cachedRasterContentBounds(layer, document.palette)
  markLayerContentChanged(layer)
  const preserveContentBounds = (): void => {
    if (contentBounds !== undefined) cacheRasterContentBounds(layer, document.palette, contentBounds)
  }

  if (layer.format === 'rgba') {
    const source = sourcePixels as Uint8ClampedArray
    const target = layer.pixels as Uint8ClampedArray
    if (selection && source !== target && !region) target.set(source)
    const channelLuts = document.colorMode === 'rgba' && !isLayerMask(layer) ? adjustmentChannelLuts(adjustment) : null
    if (channelLuts) {
      if (region) applyRgbaChannelLutsRegion(layer, selection, source, target, channelLuts, region)
      else applyRgbaChannelLuts(layer, selection, source, target, channelLuts)
      preserveContentBounds()
      return
    }
    const packedRgbTransform = document.colorMode === 'rgba' && !isLayerMask(layer) && !channelLuts
      ? adjustment.kind === 'hue-saturation'
        ? (red: number, green: number, blue: number): number => hueSaturationPackedRgb(red, green, blue, adjustment)
        : adjustment.kind === 'color-balance'
          ? (red: number, green: number, blue: number): number => colorBalancePackedRgb(red, green, blue, adjustment)
          : null
      : null
    if (packedRgbTransform) {
      if (region) applyRgbaPackedTransformRegion(layer, selection, source, target, packedRgbTransform, region)
      else applyRgbaPackedTransform(layer, selection, source, target, packedRgbTransform)
      preserveContentBounds()
      return
    }
    const preparedCurve = adjustment.kind === 'curves' ? prepareCurveLuts(adjustment) : undefined
    const visit = region
      ? (callback: (index: number) => void): void => visitAdjustmentRegionIndices(layer, selection, region, callback)
      : (callback: (index: number) => void): void => visitAdjustmentIndices(layer, selection, callback)
    visit((index) => {
      const offset = index * 4
      const alpha = source[offset + 3]
      const next = adjustColor({ r: source[offset], g: source[offset + 1], b: source[offset + 2], a: alpha }, adjustment, preparedCurve)
      const packed = normalizeLayerPackedValue(document, layer, packColor(next))
      target[offset] = packed & 0xff
      target[offset + 1] = (packed >>> 8) & 0xff
      target[offset + 2] = (packed >>> 16) & 0xff
      target[offset + 3] = (packed >>> 24) & 0xff
    })
    preserveContentBounds()
    return
  }

  const source = sourcePixels as Uint32Array
  const target = layer.pixels as Uint32Array
  if (selection && source !== target && !region) target.set(source)
  const paletteById = new Map(document.palette.map((entry) => [entry.id, entry.color]))
  const paletteIdByColor = new Map<number, number>()
  for (const entry of document.palette) {
    const key = packColor(entry.color)
    if (!paletteIdByColor.has(key)) paletteIdByColor.set(key, entry.id)
  }
  const preparedCurve = adjustment.kind === 'curves' ? prepareCurveLuts(adjustment) : undefined
  const adjustedIdBySourceId = new Map<number, number>()
  const adjustedId = (sourceId: number): number => {
    const cached = adjustedIdBySourceId.get(sourceId)
    if (cached !== undefined) return cached
    const current = paletteById.get(sourceId) ?? { r: 0, g: 0, b: 0, a: 0 }
    const next = adjustColor(current, adjustment, preparedCurve)
    if (next.a === 0) {
      adjustedIdBySourceId.set(sourceId, 0)
      return 0
    }
    const key = packColor(next)
    let id = paletteIdByColor.get(key)
    if (id === undefined) {
      id = document.nextColorId++
      document.palette.push({ id, name: tr('core.document.colorName', { id }), color: next })
      paletteById.set(id, next)
      paletteIdByColor.set(key, id)
    }
    const normalized = normalizeLayerPackedValue(document, layer, id)
    adjustedIdBySourceId.set(sourceId, normalized)
    return normalized
  }
  if (region) visitAdjustmentRegionIndices(layer, selection, region, (index) => { target[index] = adjustedId(source[index]) })
  else visitAdjustmentIndices(layer, selection, (index) => { target[index] = adjustedId(source[index]) })
  preserveContentBounds()
}

export function applyColorAdjustment(document: SpriteDocument, layer: RasterLayer, adjustment: ColorAdjustment, selection: SelectionMask | null = null): PixelEdit {
  const edit = beginPixelEdit(layer.id)
  const preparedCurve = adjustment.kind === 'curves' ? prepareCurveLuts(adjustment) : undefined
  const total = layer.width * layer.height
  for (let index = 0; index < total; index += 1) {
    if (selection) {
      const x = layer.offsetX + index % layer.width
      const y = layer.offsetY + Math.floor(index / layer.width)
      if (!selectionContains(selection, x, y)) continue
    }
    const current = readLayerColor(document, layer, index)
    const next = adjustColor(current, adjustment, preparedCurve)
    const packed = layer.format === 'rgba' ? packColor(next) : next.a === 0 ? 0 : (() => {
      const existing = document.palette.find((entry) => entry.color.r === next.r && entry.color.g === next.g && entry.color.b === next.b && entry.color.a === next.a)
      if (existing) return existing.id
      const id = document.nextColorId++
      document.palette.push({ id, name: tr('core.document.colorName', { id }), color: next })
      return id
    })()
    recordPixel(document, layer, edit, index, packed)
  }
  return edit
}
