import type { BrushDitherSettings, BrushDitherTemplate, GradientDither, GradientStop, GradientType, RgbaColor } from '@shared/types'

export const GRADIENT_DITHER_PRESETS: readonly GradientDither[] = [
  'none', 'bayer-2', 'bayer-4', 'bayer-8', 'checker', 'diagonal', 'diagonal-reverse', 'horizontal', 'vertical'
]

export const BRUSH_DITHER_TEMPLATES: readonly BrushDitherTemplate[] = [
  'checker', 'diagonal', 'diagonal-reverse', 'horizontal', 'vertical', 'bayer-2', 'bayer-4', 'bayer-8'
]

const BAYER_2 = [
  [0, 2],
  [3, 1]
]

const expandBayer = (previous: number[][]): number[][] => {
  const size = previous.length
  const next = Array.from({ length: size * 2 }, () => Array<number>(size * 2).fill(0))
  const quadrants = [[0, 2], [3, 1]]
  for (let y = 0; y < size * 2; y += 1) for (let x = 0; x < size * 2; x += 1) {
    const quadrant = quadrants[Math.floor(y / size)][Math.floor(x / size)]
    next[y][x] = previous[y % size][x % size] * 4 + quadrant
  }
  return next
}

const BAYER_4 = expandBayer(BAYER_2)
const BAYER_8 = expandBayer(BAYER_4)

export const DEFAULT_BRUSH_DITHER_SETTINGS: BrushDitherSettings = {
  enabled: false,
  template: 'bayer-4',
  stage: 8
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value))
const clampByte = (value: number): number => Math.max(0, Math.min(255, Math.round(value)))

export interface GradientGeometryOptions {
  fromCenter?: boolean
  proportional?: boolean
}

export interface RadialGradientGeometry {
  center: { x: number; y: number }
  radiusX: number
  radiusY: number
}

export const resolveRadialGradientGeometry = (
  start: { x: number; y: number },
  end: { x: number; y: number },
  options: GradientGeometryOptions = {}
): RadialGradientGeometry => {
  let deltaX = end.x - start.x
  let deltaY = end.y - start.y
  if (options.proportional) {
    const distance = Math.max(Math.abs(deltaX), Math.abs(deltaY))
    deltaX = (deltaX < 0 ? -1 : 1) * distance
    deltaY = (deltaY < 0 ? -1 : 1) * distance
  }
  if (options.fromCenter) {
    return {
      center: { ...start },
      radiusX: Math.abs(deltaX),
      radiusY: Math.abs(deltaY)
    }
  }
  return {
    center: { x: start.x + deltaX / 2, y: start.y + deltaY / 2 },
    radiusX: Math.abs(deltaX) / 2,
    radiusY: Math.abs(deltaY) / 2
  }
}

const radialGradientAmountAt = (x: number, y: number, geometry: RadialGradientGeometry): number => {
  if (geometry.radiusX === 0 && geometry.radiusY === 0) return 0
  const distanceX = Math.abs(x - geometry.center.x)
  const distanceY = Math.abs(y - geometry.center.y)
  const normalizedX = geometry.radiusX === 0 ? (distanceX === 0 ? 0 : Number.POSITIVE_INFINITY) : distanceX / geometry.radiusX
  const normalizedY = geometry.radiusY === 0 ? (distanceY === 0 ? 0 : Number.POSITIVE_INFINITY) : distanceY / geometry.radiusY
  return clamp01(Math.hypot(normalizedX, normalizedY))
}

export const interpolateRgbaColor = (start: RgbaColor, end: RgbaColor, amount: number): RgbaColor => ({
  r: Math.round(start.r + (end.r - start.r) * clamp01(amount)),
  g: Math.round(start.g + (end.g - start.g) * clamp01(amount)),
  b: Math.round(start.b + (end.b - start.b) * clamp01(amount)),
  a: Math.round(start.a + (end.a - start.a) * clamp01(amount))
})

/**
 * Keeps transparent gradient stops from introducing a black (or otherwise
 * unrelated) RGB ramp.  Pixels are stored as non-premultiplied RGBA, so the
 * RGB channels of a fully transparent stop still influence intermediate
 * colors before alpha compositing.  Aseprite carries the visible stop's RGB
 * into the transparent stop for this reason.
 */
const normalizeTransparentGradientStops = (start: RgbaColor, end: RgbaColor): { start: RgbaColor; end: RgbaColor } => {
  if (start.a === 0 && end.a !== 0) return { start: { ...start, r: end.r, g: end.g, b: end.b }, end: { ...end } }
  if (start.a !== 0 && end.a === 0) return { start: { ...start }, end: { ...end, r: start.r, g: start.g, b: start.b } }
  return { start: { ...start }, end: { ...end } }
}

export const normalizeGradientStops = (
  stops: readonly GradientStop[] | null | undefined,
  fallbackStart: RgbaColor,
  fallbackEnd: RgbaColor
): GradientStop[] => {
  const normalized = (stops ?? []).filter((stop) => Boolean(stop && Number.isFinite(stop.position) && stop.color))
    .map((stop) => ({
      position: clamp01(stop.position),
      color: {
        r: clampByte(stop.color.r),
        g: clampByte(stop.color.g),
        b: clampByte(stop.color.b),
        a: clampByte(stop.color.a)
      }
    }))
    .sort((left, right) => left.position - right.position)
  if (normalized.length < 2) return [{ position: 0, color: { ...fallbackStart } }, { position: 1, color: { ...fallbackEnd } }]
  return normalized
}

const bayerStage = (matrix: number[][], x: number, y: number): number => {
  const size = matrix.length
  return matrix[((y % size) + size) % size][((x % size) + size) % size]
}

export const ditherStageCount = (mode: GradientDither | BrushDitherTemplate): number => {
  if (mode === 'checker') return 2
  if (mode === 'diagonal' || mode === 'diagonal-reverse' || mode === 'horizontal' || mode === 'vertical') return 6
  if (mode === 'bayer-2') return 4
  if (mode === 'bayer-4') return 16
  if (mode === 'bayer-8') return 64
  return 1
}

export const ditherStageAt = (mode: BrushDitherTemplate, x: number, y: number): number => {
  if (mode === 'checker') return ((x + y) & 1) === 0 ? 0 : 1
  if (mode === 'diagonal') return ((x + y) % 6 + 6) % 6
  if (mode === 'diagonal-reverse') return ((x - y) % 6 + 6) % 6
  if (mode === 'horizontal') return (y % 6 + 6) % 6
  if (mode === 'vertical') return (x % 6 + 6) % 6
  if (mode === 'bayer-2') return bayerStage(BAYER_2, x, y)
  if (mode === 'bayer-4') return bayerStage(BAYER_4, x, y)
  return bayerStage(BAYER_8, x, y)
}

const ditherThreshold = (mode: Exclude<GradientDither, 'none'>, x: number, y: number): number => {
  const count = ditherStageCount(mode)
  return (ditherStageAt(mode, x, y) + 0.5) / count
}

export const normalizeBrushDitherSettings = (
  value: Partial<BrushDitherSettings> | null | undefined,
  fallback: BrushDitherSettings = DEFAULT_BRUSH_DITHER_SETTINGS
): BrushDitherSettings => {
  const template = BRUSH_DITHER_TEMPLATES.includes(value?.template as BrushDitherTemplate)
    ? value!.template as BrushDitherTemplate
    : fallback.template
  const maximumStage = ditherStageCount(template)
  const fallbackStage = Math.max(1, Math.min(maximumStage, Math.round(fallback.stage)))
  return {
    enabled: typeof value?.enabled === 'boolean' ? value.enabled : fallback.enabled,
    template,
    stage: Number.isFinite(value?.stage) ? Math.max(1, Math.min(maximumStage, Math.round(value!.stage!))) : fallbackStage
  }
}

export const brushDitherContains = (settings: BrushDitherSettings | null | undefined, x: number, y: number): boolean => {
  if (!settings?.enabled) return true
  return ditherStageAt(settings.template, x, y) < Math.max(1, Math.min(ditherStageCount(settings.template), Math.round(settings.stage)))
}

export const brushDitherSettingsForTemplate = (settings: BrushDitherSettings, template: BrushDitherTemplate): BrushDitherSettings => {
  const previousCount = ditherStageCount(settings.template)
  const nextCount = ditherStageCount(template)
  const nextStage = Math.max(1, Math.min(nextCount, Math.round((settings.stage / previousCount) * nextCount)))
  return { enabled: true, template, stage: nextStage }
}

export const gradientAmountAt = (
  x: number,
  y: number,
  start: { x: number; y: number },
  end: { x: number; y: number },
  type: GradientType = 'linear',
  geometryOptions: GradientGeometryOptions = {}
): number => {
  if (type === 'radial') return radialGradientAmountAt(x, y, resolveRadialGradientGeometry(start, end, geometryOptions))
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return 0
  return clamp01(((x - start.x) * dx + (y - start.y) * dy) / lengthSquared)
}

export const gradientColorForAmount = (
  startColor: RgbaColor,
  endColor: RgbaColor,
  amount: number,
  x: number,
  y: number,
  dither: GradientDither = 'none',
  gradientStops?: readonly GradientStop[]
): RgbaColor => {
  const normalizedAmount = clamp01(amount)
  if (dither === 'none' && gradientStops && gradientStops.length >= 2) {
    const stops = normalizeGradientStops(gradientStops, startColor, endColor)
    const rightIndex = stops.findIndex((stop) => stop.position >= normalizedAmount)
    if (rightIndex < 0) return { ...stops[stops.length - 1].color }
    if (rightIndex === 0) return { ...stops[0].color }
    const left = stops[rightIndex - 1]
    const right = stops[rightIndex]
    const span = right.position - left.position
    return interpolateRgbaColor(left.color, right.color, span === 0 ? 0 : (normalizedAmount - left.position) / span)
  }
  const normalizedStart = startColor.a === 0 && endColor.a !== 0
    ? { ...startColor, r: endColor.r, g: endColor.g, b: endColor.b }
    : startColor
  const normalizedEnd = startColor.a !== 0 && endColor.a === 0
    ? { ...endColor, r: startColor.r, g: startColor.g, b: startColor.b }
    : endColor
  if (dither === 'none') return interpolateRgbaColor(normalizedStart, normalizedEnd, normalizedAmount)
  return normalizedAmount >= ditherThreshold(dither, x, y) ? { ...normalizedEnd } : { ...normalizedStart }
}

export const createGradientColorSampler = (
  startColor: RgbaColor,
  endColor: RgbaColor,
  start: { x: number; y: number },
  end: { x: number; y: number },
  dither: GradientDither = 'none',
  type: GradientType = 'linear',
  geometryOptions: GradientGeometryOptions = {},
  gradientStops?: readonly GradientStop[]
): ((x: number, y: number) => RgbaColor) => {
  const freeStops = dither === 'none' && gradientStops && gradientStops.length >= 2
    ? normalizeGradientStops(gradientStops, startColor, endColor).map((stop) => ({ ...stop, color: { ...stop.color } }))
    : null
  const legacyStops = normalizeTransparentGradientStops(startColor, endColor)
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  const deltaR = legacyStops.end.r - legacyStops.start.r
  const deltaG = legacyStops.end.g - legacyStops.start.g
  const deltaB = legacyStops.end.b - legacyStops.start.b
  const deltaA = legacyStops.end.a - legacyStops.start.a
  const colorForAmount: (amount: number, x: number, y: number) => RgbaColor = freeStops
    ? (amount: number): RgbaColor => {
        const normalizedAmount = clamp01(amount)
        const rightIndex = freeStops.findIndex((stop) => stop.position >= normalizedAmount)
        if (rightIndex < 0) return { ...freeStops[freeStops.length - 1].color }
        if (rightIndex === 0) return { ...freeStops[0].color }
        const left = freeStops[rightIndex - 1]
        const right = freeStops[rightIndex]
        const span = right.position - left.position
        return interpolateRgbaColor(left.color, right.color, span === 0 ? 0 : (normalizedAmount - left.position) / span)
      }
    : dither === 'none'
      ? (amount: number): RgbaColor => ({
          r: Math.round(legacyStops.start.r + deltaR * amount),
          g: Math.round(legacyStops.start.g + deltaG * amount),
          b: Math.round(legacyStops.start.b + deltaB * amount),
          a: Math.round(legacyStops.start.a + deltaA * amount)
        })
      : (amount: number, x: number, y: number): RgbaColor => amount >= ditherThreshold(dither, x, y) ? { ...legacyStops.end } : { ...legacyStops.start }
  if (type === 'radial') {
    const geometry = resolveRadialGradientGeometry(start, end, geometryOptions)
    return (x, y) => colorForAmount(radialGradientAmountAt(x, y, geometry), x, y)
  }
  if (lengthSquared === 0) return (x, y) => colorForAmount(0, x, y)
  return (x, y) => {
    const numerator = (x - start.x) * dx + (y - start.y) * dy
    return colorForAmount(clamp01(numerator / lengthSquared), x, y)
  }
}

export const gradientColorAt = (
  startColor: RgbaColor,
  endColor: RgbaColor,
  x: number,
  y: number,
  start: { x: number; y: number },
  end: { x: number; y: number },
  dither: GradientDither = 'none',
  type: GradientType = 'linear',
  geometryOptions: GradientGeometryOptions = {},
  gradientStops?: readonly GradientStop[]
): RgbaColor => gradientColorForAmount(startColor, endColor, gradientAmountAt(x, y, start, end, type, geometryOptions), x, y, dither, gradientStops)
