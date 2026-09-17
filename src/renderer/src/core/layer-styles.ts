import type { GradientDither } from '@shared/types-brush'
import type { LayerStyles } from '@shared/types-layer-style'
import type { RasterLayer } from '@shared/types-layer'
import type { RgbaColor } from '@shared/types-color'
import type { SelectionRect } from '@shared/types-selection'
import { blendWithMode, colorEquals, TRANSPARENT } from './raster'
import { DEFAULT_OUTLINE_SMART_HUE_DARKNESS, normalizeOutlineDirections, normalizeOutlineKernel, normalizeOutlinePosition, OUTLINE_DIRECTIONS, outlineDirectionsForKernel, outlineDirectionForOffset, outlineKernelContainsOffset, resolveOutlineStrokeColor } from './outline-settings'
import { gradientColorForAmount, GRADIENT_DITHER_PRESETS } from './gradient-color'

export const MAX_LAYER_STYLE_SIZE = 32
export const MAX_LAYER_STYLE_STROKE_SIZE = 64
export const MAX_LAYER_STYLE_SHADOW_OFFSET = 64
export const DEFAULT_LAYER_STYLE_SMART_HUE_DARKNESS = DEFAULT_OUTLINE_SMART_HUE_DARKNESS
export const DEFAULT_LAYER_STYLE_SMART_SHADOW_DARKNESS = 45

const gradientDithers = new Set<GradientDither>(GRADIENT_DITHER_PRESETS)

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value))
const integer = (value: unknown, fallback: number, min: number, max: number): number => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? clamp(Math.round(numeric), min, max) : fallback
}
const byte = (value: unknown, fallback: number): number => integer(value, fallback, 0, 255)
const enabled = (value: unknown): boolean => value === true
const record = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' ? value as Record<string, unknown> : null
const color = (value: unknown, fallback: RgbaColor): RgbaColor => {
  const source = record(value)
  return source
    ? { r: byte(source.r, fallback.r), g: byte(source.g, fallback.g), b: byte(source.b, fallback.b), a: byte(source.a, fallback.a) }
    : { ...fallback }
}

const field = (value: unknown): string => value === undefined ? '' : String(value)
const rawColorSignature = (value: unknown): string => {
  const source = record(value)
  return source ? [source.r, source.g, source.b, source.a].map(field).join(',') : ''
}

/**
 * Produces a cheap mutation-sensitive key for the normalized style fields.
 * The compositor uses it on every draw instead of cloning a complete style
 * tree just to decide whether its cached result is still usable.
 */
export const layerStylesSignature = (value: unknown): string => {
  const source = record(value)
  if (!source) return ''
  const stroke = record(source.stroke)
  const shadow = record(source.shadow)
  const innerGlow = record(source.innerGlow)
  const colorOverlay = record(source.colorOverlay)
  const gradientOverlay = record(source.gradientOverlay)
  const directions = record(stroke?.directions)
  return [
    source.enabled,
    stroke?.enabled, rawColorSignature(stroke?.color), stroke?.size, stroke?.position, stroke?.kernel,
    directions?.nw, directions?.n, directions?.ne, directions?.w, directions?.e, directions?.sw, directions?.s, directions?.se,
    stroke?.smartHue, stroke?.smartHueDarkness, stroke?.followOpacity,
    shadow?.enabled, rawColorSignature(shadow?.color), shadow?.offsetX, shadow?.offsetY, shadow?.blur, shadow?.smartShadow, shadow?.smartShadowDarkness,
    innerGlow?.enabled, rawColorSignature(innerGlow?.color), innerGlow?.size,
    colorOverlay?.enabled, rawColorSignature(colorOverlay?.color),
    gradientOverlay?.enabled, rawColorSignature(gradientOverlay?.from), rawColorSignature(gradientOverlay?.to), gradientOverlay?.angle, gradientOverlay?.dither
  ].map(field).join('|')
}

export function createDefaultLayerStyles(): LayerStyles {
  return {
    enabled: true,
    stroke: { enabled: false, color: { r: 0, g: 0, b: 0, a: 255 }, size: 1, position: 'outside', kernel: 'round', directions: outlineDirectionsForKernel('round'), smartHue: false, smartHueDarkness: DEFAULT_LAYER_STYLE_SMART_HUE_DARKNESS, followOpacity: false },
    shadow: { enabled: false, color: { r: 0, g: 0, b: 0, a: 160 }, offsetX: 2, offsetY: 2, blur: 0, smartShadow: false, smartShadowDarkness: DEFAULT_LAYER_STYLE_SMART_SHADOW_DARKNESS },
    innerGlow: { enabled: false, color: { r: 255, g: 255, b: 255, a: 192 }, size: 2 },
    colorOverlay: { enabled: false, color: { r: 41, g: 121, b: 255, a: 255 } },
    gradientOverlay: { enabled: false, from: { r: 0, g: 0, b: 0, a: 255 }, to: { r: 255, g: 255, b: 255, a: 255 }, angle: 0, dither: 'none' }
  }
}

export function normalizeLayerStyles(value: unknown): LayerStyles | undefined {
  const source = record(value)
  if (!source) return undefined
  const defaults = createDefaultLayerStyles()
  const stroke = record(source.stroke)
  const shadow = record(source.shadow)
  const innerGlow = record(source.innerGlow)
  const colorOverlay = record(source.colorOverlay)
  const gradientOverlay = record(source.gradientOverlay)
  const strokeKernel = normalizeOutlineKernel(stroke?.kernel, defaults.stroke.kernel)
  return {
    enabled: source.enabled !== false,
    stroke: {
      enabled: enabled(stroke?.enabled),
      color: color(stroke?.color, defaults.stroke.color),
      size: integer(stroke?.size, defaults.stroke.size, 1, MAX_LAYER_STYLE_STROKE_SIZE),
      position: normalizeOutlinePosition(stroke?.position, defaults.stroke.position),
      kernel: strokeKernel,
      directions: normalizeOutlineDirections(stroke?.directions, outlineDirectionsForKernel(strokeKernel)),
      smartHue: enabled(stroke?.smartHue),
      smartHueDarkness: integer(stroke?.smartHueDarkness, defaults.stroke.smartHueDarkness, 0, 100),
      followOpacity: enabled(stroke?.followOpacity)
    },
    shadow: {
      enabled: enabled(shadow?.enabled),
      color: color(shadow?.color, defaults.shadow.color),
      offsetX: integer(shadow?.offsetX, defaults.shadow.offsetX, -MAX_LAYER_STYLE_SHADOW_OFFSET, MAX_LAYER_STYLE_SHADOW_OFFSET),
      offsetY: integer(shadow?.offsetY, defaults.shadow.offsetY, -MAX_LAYER_STYLE_SHADOW_OFFSET, MAX_LAYER_STYLE_SHADOW_OFFSET),
      blur: integer(shadow?.blur, defaults.shadow.blur, 0, MAX_LAYER_STYLE_SIZE),
      smartShadow: enabled(shadow?.smartShadow),
      smartShadowDarkness: integer(shadow?.smartShadowDarkness, defaults.shadow.smartShadowDarkness, 0, 100)
    },
    innerGlow: {
      enabled: enabled(innerGlow?.enabled),
      color: color(innerGlow?.color, defaults.innerGlow.color),
      size: integer(innerGlow?.size, defaults.innerGlow.size, 1, MAX_LAYER_STYLE_SIZE)
    },
    colorOverlay: {
      enabled: enabled(colorOverlay?.enabled),
      color: color(colorOverlay?.color, defaults.colorOverlay.color)
    },
    gradientOverlay: {
      enabled: enabled(gradientOverlay?.enabled),
      from: color(gradientOverlay?.from, defaults.gradientOverlay.from),
      to: color(gradientOverlay?.to, defaults.gradientOverlay.to),
      angle: integer(gradientOverlay?.angle, defaults.gradientOverlay.angle, 0, 359),
      dither: gradientDithers.has(gradientOverlay?.dither as GradientDither) ? gradientOverlay?.dither as GradientDither : defaults.gradientOverlay.dither
    }
  }
}

export const cloneLayerStyles = (styles: LayerStyles | undefined): LayerStyles | undefined => {
  const normalized = normalizeLayerStyles(styles)
  return normalized ? {
    enabled: normalized.enabled,
    stroke: { ...normalized.stroke, color: { ...normalized.stroke.color }, directions: { ...normalized.stroke.directions } },
    shadow: { ...normalized.shadow, color: { ...normalized.shadow.color } },
    innerGlow: { ...normalized.innerGlow, color: { ...normalized.innerGlow.color } },
    colorOverlay: { ...normalized.colorOverlay, color: { ...normalized.colorOverlay.color } },
    gradientOverlay: { ...normalized.gradientOverlay, from: { ...normalized.gradientOverlay.from }, to: { ...normalized.gradientOverlay.to } }
  } : undefined
}

export const resolveLayerStyles = (styles: LayerStyles | undefined): LayerStyles => cloneLayerStyles(styles) ?? createDefaultLayerStyles()

export const hasConfiguredLayerStyles = (styles: LayerStyles | undefined): boolean => Boolean(styles && (
  styles.stroke.enabled
  || styles.shadow.enabled
  || styles.innerGlow.enabled
  || styles.colorOverlay.enabled
  || styles.gradientOverlay.enabled
))

export const hasEnabledLayerStyles = (styles: LayerStyles | undefined): boolean => styles?.enabled !== false && hasConfiguredLayerStyles(styles)

export const layerStylesEqual = (left: LayerStyles | undefined, right: LayerStyles | undefined): boolean => {
  if (left === right) return true
  if (layerStylesSignature(left) === layerStylesSignature(right)) return true
  const a = normalizeLayerStyles(left)
  const b = normalizeLayerStyles(right)
  if (!a || !b) return a === b
  return a.enabled === b.enabled
    && a.stroke.enabled === b.stroke.enabled
    && a.stroke.size === b.stroke.size
    && a.stroke.position === b.stroke.position
    && a.stroke.kernel === b.stroke.kernel
    && a.stroke.smartHue === b.stroke.smartHue
    && a.stroke.smartHueDarkness === b.stroke.smartHueDarkness
    && a.stroke.followOpacity === b.stroke.followOpacity
    && OUTLINE_DIRECTIONS.every((direction) => a.stroke.directions[direction] === b.stroke.directions[direction])
    && colorEquals(a.stroke.color, b.stroke.color)
    && a.shadow.enabled === b.shadow.enabled
    && a.shadow.offsetX === b.shadow.offsetX
    && a.shadow.offsetY === b.shadow.offsetY
    && a.shadow.blur === b.shadow.blur
    && a.shadow.smartShadow === b.shadow.smartShadow
    && a.shadow.smartShadowDarkness === b.shadow.smartShadowDarkness
    && colorEquals(a.shadow.color, b.shadow.color)
    && a.innerGlow.enabled === b.innerGlow.enabled
    && a.innerGlow.size === b.innerGlow.size
    && colorEquals(a.innerGlow.color, b.innerGlow.color)
    && a.colorOverlay.enabled === b.colorOverlay.enabled
    && colorEquals(a.colorOverlay.color, b.colorOverlay.color)
    && a.gradientOverlay.enabled === b.gradientOverlay.enabled
    && a.gradientOverlay.angle === b.gradientOverlay.angle
    && a.gradientOverlay.dither === b.gradientOverlay.dither
    && colorEquals(a.gradientOverlay.from, b.gradientOverlay.from)
    && colorEquals(a.gradientOverlay.to, b.gradientOverlay.to)
}

export const mapLayerStyleColors = (styles: LayerStyles, mapper: (color: RgbaColor) => RgbaColor): LayerStyles => ({
  enabled: styles.enabled,
  stroke: { ...styles.stroke, color: mapper(styles.stroke.color), directions: { ...styles.stroke.directions } },
  shadow: { ...styles.shadow, color: mapper(styles.shadow.color) },
  innerGlow: { ...styles.innerGlow, color: mapper(styles.innerGlow.color) },
  colorOverlay: { ...styles.colorOverlay, color: mapper(styles.colorOverlay.color) },
  gradientOverlay: { ...styles.gradientOverlay, from: mapper(styles.gradientOverlay.from), to: mapper(styles.gradientOverlay.to) }
})

export const layerStylesHistoryBytes = (styles: LayerStyles | undefined): number => styles ? 128 : 0

const expandRect = (rect: SelectionRect, amount: number): SelectionRect => ({
  x: rect.x - amount,
  y: rect.y - amount,
  width: rect.width + amount * 2,
  height: rect.height + amount * 2
})

const translateRect = (rect: SelectionRect, offsetX: number, offsetY: number): SelectionRect => ({
  x: rect.x + offsetX,
  y: rect.y + offsetY,
  width: rect.width,
  height: rect.height
})

const unionRect = (left: SelectionRect, right: SelectionRect): SelectionRect => {
  const x = Math.min(left.x, right.x)
  const y = Math.min(left.y, right.y)
  const toX = Math.max(left.x + left.width, right.x + right.width)
  const toY = Math.max(left.y + left.height, right.y + right.height)
  return { x, y, width: toX - x, height: toY - y }
}

/** Expands a changed source region to every output pixel that can depend on it. */
export const layerStyleAffectedRect = (rect: SelectionRect, styles: LayerStyles | undefined): SelectionRect => {
  if (!hasEnabledLayerStyles(styles)) return { ...rect }
  const resolved = resolveLayerStyles(styles)
  let affected = { ...rect }
  if (resolved.stroke.enabled) affected = unionRect(affected, expandRect(rect, resolved.stroke.size))
  if (resolved.innerGlow.enabled) affected = unionRect(affected, expandRect(rect, resolved.innerGlow.size))
  if (resolved.shadow.enabled) {
    affected = unionRect(affected, expandRect(translateRect(rect, resolved.shadow.offsetX, resolved.shadow.offsetY), resolved.shadow.blur))
  }
  return affected
}

/** Returns the visible output bounds after effects that can extend beyond the source. */
export const layerStyleOutputBounds = (bounds: SelectionRect | null, styles: LayerStyles | undefined): SelectionRect | null => {
  if (!bounds || !hasEnabledLayerStyles(styles)) return bounds ? { ...bounds } : null
  const resolved = resolveLayerStyles(styles)
  let output = { ...bounds }
  if (resolved.stroke.enabled && resolved.stroke.position !== 'inside') output = unionRect(output, expandRect(bounds, resolved.stroke.size))
  if (resolved.shadow.enabled) output = unionRect(output, expandRect(translateRect(bounds, resolved.shadow.offsetX, resolved.shadow.offsetY), resolved.shadow.blur))
  return output
}

const withCoverage = (colorValue: RgbaColor, coverage: number): RgbaColor => ({
  r: colorValue.r,
  g: colorValue.g,
  b: colorValue.b,
  a: Math.round(colorValue.a * clamp(coverage, 0, 1))
})

const shadowColor = (style: LayerStyles['shadow']): RgbaColor => {
  if (!style.smartShadow) return style.color
  // A black overlay at this alpha scales every live background RGB channel by
  // the same amount, preserving its hue while applying the darkness factor.
  return { r: 0, g: 0, b: 0, a: Math.round(255 * clamp(style.smartShadowDarkness, 0, 100) / 100) }
}

const overlayPreservingAlpha = (base: RgbaColor, overlay: RgbaColor, coverage = 1): RgbaColor => {
  if (base.a === 0) return base
  const amount = clamp((overlay.a / 255) * coverage, 0, 1)
  if (amount <= 0) return base
  return {
    r: Math.round(base.r + (overlay.r - base.r) * amount),
    g: Math.round(base.g + (overlay.g - base.g) * amount),
    b: Math.round(base.b + (overlay.b - base.b) * amount),
    a: base.a
  }
}

interface OutsideStrokeSample {
  alpha: number
  referenceColor: RgbaColor
}

const outsideStrokeSample = (read: LayerStyleSourceReader, x: number, y: number, style: LayerStyles['stroke']): OutsideStrokeSample => {
  let maximum = 0
  let referenceColor = TRANSPARENT
  let referenceDistance = Number.POSITIVE_INFINITY
  for (let offsetY = -style.size; offsetY <= style.size; offsetY += 1) for (let offsetX = -style.size; offsetX <= style.size; offsetX += 1) {
    if (!outlineKernelContainsOffset(offsetX, offsetY, style.size, style.kernel)) continue
    const direction = outlineDirectionForOffset(-offsetX, -offsetY)
    if (!direction || !style.directions[direction]) continue
    const sample = read(x + offsetX, y + offsetY)
    maximum = Math.max(maximum, sample.a)
    if ((style.smartHue || style.followOpacity) && sample.a > 0) {
      const distance = offsetX * offsetX + offsetY * offsetY
      // When several source pixels are equally close (common on an
      // anti-aliased diagonal), prefer the lower-alpha edge pixel. Picking
      // the opaque interior pixel here made follow-opacity render as a
      // fully opaque stroke instead of matching the softened edge.
      if (distance < referenceDistance || (distance === referenceDistance && sample.a < referenceColor.a)) {
        referenceColor = sample
        referenceDistance = distance
      }
    }
    if (!style.smartHue && maximum === 255) return { alpha: maximum, referenceColor }
  }
  return { alpha: maximum, referenceColor }
}

const innerStrokeCoverage = (read: LayerStyleSourceReader, x: number, y: number, style: LayerStyles['stroke']): number => {
  let coverage = 0
  for (let offsetY = -style.size; offsetY <= style.size; offsetY += 1) for (let offsetX = -style.size; offsetX <= style.size; offsetX += 1) {
    if (!outlineKernelContainsOffset(offsetX, offsetY, style.size, style.kernel)) continue
    const direction = outlineDirectionForOffset(offsetX, offsetY)
    if (!direction || !style.directions[direction]) continue
    // Treat anti-aliased (partially transparent) pixels as existing
    // content.  Using fractional alpha here makes an anti-aliased edge
    // receive a second, overlapping inner stroke.  Shift+O uses the same
    // binary boundary semantics (alpha > 0 is source content).
    coverage = Math.max(coverage, read(x + offsetX, y + offsetY).a === 0 ? 1 : 0)
    if (coverage >= 1) return 1
  }
  return coverage
}

const shadowCoverage = (read: LayerStyleSourceReader, x: number, y: number, blur: number): number => {
  if (blur <= 0) return read(x, y).a / 255
  let maximum = 0
  for (let offsetY = -blur; offsetY <= blur; offsetY += 1) for (let offsetX = -blur; offsetX <= blur; offsetX += 1) {
    const distance = Math.max(Math.abs(offsetX), Math.abs(offsetY))
    const alpha = read(x + offsetX, y + offsetY).a / 255
    maximum = Math.max(maximum, alpha * (1 - distance / (blur + 1)))
    if (maximum >= 1) return 1
  }
  return maximum
}

const innerGlowCoverage = (read: LayerStyleSourceReader, x: number, y: number, size: number): number => {
  for (let distance = 1; distance <= size; distance += 1) {
    let transparentCoverage = 0
    for (let offset = -distance; offset <= distance; offset += 1) {
      transparentCoverage = Math.max(transparentCoverage, 1 - read(x + offset, y - distance).a / 255)
      transparentCoverage = Math.max(transparentCoverage, 1 - read(x + offset, y + distance).a / 255)
      if (offset > -distance && offset < distance) {
        transparentCoverage = Math.max(transparentCoverage, 1 - read(x - distance, y + offset).a / 255)
        transparentCoverage = Math.max(transparentCoverage, 1 - read(x + distance, y + offset).a / 255)
      }
    }
    if (transparentCoverage > 0) return transparentCoverage * ((size - distance + 1) / size)
  }
  return 0
}

export const layerStyleShadowCoverage = shadowCoverage
export const layerStyleInnerGlowCoverage = innerGlowCoverage

export type LayerStyleBinaryStrokeMetric = 'square' | 'horizontal' | 'vertical' | 'cardinal'

/**
 * Returns the exact distance metric for the common binary stroke presets.
 * Custom direction masks intentionally use the pixel-accurate fallback.
 */
export const layerStyleBinaryStrokeMetric = (_stroke: LayerStyles['stroke']): LayerStyleBinaryStrokeMetric | null => {
  // Stroke alpha now has two explicit semantics (fixed vs follow source
  // opacity). The distance-field shortcut only modeled the former
  // fractional-alpha behavior, so it can disagree with the exact directed
  // outline at corners. Keep one authoritative rendering path for strokes.
  return null
}

const blendNormalColors = (backdrop: RgbaColor, source: RgbaColor): RgbaColor => {
  if (backdrop.a === 0) return source
  if (source.a === 0) return backdrop
  if (source.a === 255) return source
  const topAlpha = source.a / 255
  const bottomAlpha = backdrop.a / 255
  const outputAlpha = topAlpha + bottomAlpha * (1 - topAlpha)
  return outputAlpha <= 0
    ? TRANSPARENT
    : {
        r: Math.round((source.r * topAlpha + backdrop.r * bottomAlpha * (1 - topAlpha)) / outputAlpha),
        g: Math.round((source.g * topAlpha + backdrop.g * bottomAlpha * (1 - topAlpha)) / outputAlpha),
        b: Math.round((source.b * topAlpha + backdrop.b * bottomAlpha * (1 - topAlpha)) / outputAlpha),
        a: Math.round(outputAlpha * 255)
      }
}

const packedByte = (value: number): number => Math.max(0, Math.min(255, Math.round(value)))
const packedRgba = (r: number, g: number, b: number, a: number): number =>
  (packedByte(r) | (packedByte(g) << 8) | (packedByte(b) << 16) | (packedByte(a) << 24)) >>> 0

const blendPackedNormal = (backdropPacked: number, sourcePacked: number): number => {
  const backdropA = backdropPacked >>> 24 & 0xff
  const sourceA = sourcePacked >>> 24 & 0xff
  if (backdropA === 0) return sourcePacked >>> 0
  if (sourceA === 0) return backdropPacked >>> 0
  if (sourceA === 255) return sourcePacked >>> 0
  const topAlpha = sourceA / 255
  const bottomAlpha = backdropA / 255
  const outputAlpha = topAlpha + bottomAlpha * (1 - topAlpha)
  if (outputAlpha <= 0) return 0
  const sourceR = sourcePacked & 0xff
  const sourceG = sourcePacked >>> 8 & 0xff
  const sourceB = sourcePacked >>> 16 & 0xff
  const backdropR = backdropPacked & 0xff
  const backdropG = backdropPacked >>> 8 & 0xff
  const backdropB = backdropPacked >>> 16 & 0xff
  return packedRgba(
    (sourceR * topAlpha + backdropR * bottomAlpha * (1 - topAlpha)) / outputAlpha,
    (sourceG * topAlpha + backdropG * bottomAlpha * (1 - topAlpha)) / outputAlpha,
    (sourceB * topAlpha + backdropB * bottomAlpha * (1 - topAlpha)) / outputAlpha,
    outputAlpha * 255
  )
}

/**
 * Applies the normal-alpha subset of layer styles without allocating colors.
 * A null result means that the caller must use the full style evaluator.
 */
export const applySimpleLayerStylesPacked = (
  styles: LayerStyles,
  x: number,
  y: number,
  sourcePacked: number,
  readGeometry: LayerStyleSourceReader,
  shadowCoverageOverride?: number,
  innerGlowCoverageOverride?: number,
  outsideStrokeCoverageOverride?: number,
  innerStrokeCoverageOverride?: number
): number | null => {
  if (styles.enabled === false) return sourcePacked >>> 0
  if (styles.colorOverlay.enabled || styles.gradientOverlay.enabled) return null
  if (styles.stroke.enabled && (styles.stroke.smartHue || styles.stroke.followOpacity)) return null
  if (styles.stroke.enabled && outsideStrokeCoverageOverride === undefined && innerStrokeCoverageOverride === undefined) return null
  if (!styles.shadow.enabled && !styles.innerGlow.enabled && !styles.stroke.enabled) return sourcePacked >>> 0

  const sourceR = sourcePacked & 0xff
  const sourceG = (sourcePacked >>> 8) & 0xff
  const sourceB = (sourcePacked >>> 16) & 0xff
  const sourceA = (sourcePacked >>> 24) & 0xff
  let styledR = sourceR
  let styledG = sourceG
  let styledB = sourceB
  if (sourceA > 0 && styles.innerGlow.enabled) {
    const coverage = innerGlowCoverageOverride ?? innerGlowCoverage(readGeometry, x, y, styles.innerGlow.size)
    const amount = Math.max(0, Math.min(1, styles.innerGlow.color.a / 255 * coverage))
    styledR = packedByte(sourceR + (styles.innerGlow.color.r - sourceR) * amount)
    styledG = packedByte(sourceG + (styles.innerGlow.color.g - sourceG) * amount)
    styledB = packedByte(sourceB + (styles.innerGlow.color.b - sourceB) * amount)
  }

  if (sourceA > 0 && styles.stroke.enabled && styles.stroke.position !== 'outside') {
    const amount = Math.max(0, Math.min(1, innerStrokeCoverageOverride ?? 0))
    const strokeAmount = styles.stroke.color.a / 255 * amount
    styledR = packedByte(styledR + (styles.stroke.color.r - styledR) * strokeAmount)
    styledG = packedByte(styledG + (styles.stroke.color.g - styledG) * strokeAmount)
    styledB = packedByte(styledB + (styles.stroke.color.b - styledB) * strokeAmount)
  }

  let backdropPacked = 0
  if (styles.shadow.enabled) {
    const coverage = shadowCoverageOverride ?? layerStyleShadowCoverage(readGeometry, x - styles.shadow.offsetX, y - styles.shadow.offsetY, styles.shadow.blur)
    const shadowAlphaBase = styles.shadow.smartShadow
      ? packedByte(255 * Math.max(0, Math.min(100, styles.shadow.smartShadowDarkness)) / 100)
      : styles.shadow.color.a
    const shadowAlpha = packedByte(shadowAlphaBase * Math.max(0, Math.min(1, coverage)))
    if (shadowAlpha > 0) {
      const shadowR = styles.shadow.smartShadow ? 0 : styles.shadow.color.r
      const shadowG = styles.shadow.smartShadow ? 0 : styles.shadow.color.g
      const shadowB = styles.shadow.smartShadow ? 0 : styles.shadow.color.b
      backdropPacked = packedRgba(shadowR, shadowG, shadowB, shadowAlpha)
    }
  }

  if (sourceA === 0 && styles.stroke.enabled && styles.stroke.position !== 'inside') {
    const amount = Math.max(0, Math.min(1, outsideStrokeCoverageOverride ?? 0))
    const strokeAlpha = packedByte(styles.stroke.color.a * amount)
    if (strokeAlpha > 0) {
      const strokePacked = packedRgba(styles.stroke.color.r, styles.stroke.color.g, styles.stroke.color.b, strokeAlpha)
      if (backdropPacked === 0) backdropPacked = strokePacked
      else backdropPacked = blendPackedNormal(backdropPacked, strokePacked)
    }
  }

  if (sourceA === 0) return backdropPacked
  const sourceStyledPacked = packedRgba(styledR, styledG, styledB, sourceA)
  if (backdropPacked === 0) return sourceStyledPacked
  if (sourceA === 255) return sourceStyledPacked
  return blendPackedNormal(backdropPacked, sourceStyledPacked)
}

export interface LayerStyleGeometry {
  x: number
  y: number
  width: number
  height: number
}

const gradientColorAt = (geometry: LayerStyleGeometry, style: LayerStyles['gradientOverlay'], x: number, y: number): RgbaColor => {
  const localX = geometry.width <= 1 ? 0.5 : (x - geometry.x) / (geometry.width - 1)
  const localY = geometry.height <= 1 ? 0.5 : (y - geometry.y) / (geometry.height - 1)
  const radians = style.angle * Math.PI / 180
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  const extent = Math.max(Number.EPSILON, (Math.abs(cosine) + Math.abs(sine)) / 2)
  const position = clamp(0.5 + (((localX - 0.5) * cosine + (localY - 0.5) * sine) / (2 * extent)), 0, 1)
  return gradientColorForAmount(style.from, style.to, position, x, y, style.dither)
}

export type LayerStyleSourceReader = (x: number, y: number) => RgbaColor
export type LayerStyleColorResolver = (color: RgbaColor) => RgbaColor

export type LayerStylePart = 'shadow' | 'outerStroke' | 'colorOverlay' | 'gradientOverlay' | 'innerGlow' | 'innerStroke'

/** Bottom-to-top effect order. Interior parts use the existing clipping stack:
 * their alpha is the effect coverage, not another copy of the source alpha.
 * A both-sided stroke has two parts because only its interior is clipped. */
export function enabledLayerStyleParts(styles: LayerStyles): LayerStylePart[] {
  if (!styles.enabled) return []
  const parts: LayerStylePart[] = []
  if (styles.shadow.enabled) parts.push('shadow')
  if (styles.stroke.enabled && styles.stroke.position !== 'inside') parts.push('outerStroke')
  if (styles.colorOverlay.enabled) parts.push('colorOverlay')
  if (styles.gradientOverlay.enabled) parts.push('gradientOverlay')
  if (styles.innerGlow.enabled) parts.push('innerGlow')
  if (styles.stroke.enabled && styles.stroke.position !== 'outside') parts.push('innerStroke')
  return parts
}

/** Extracts effect pixels only, using the same geometry, smart colors and order
 * as applyLayerStylesAt. Never includes the original image in an effect layer. */
export function sampleLayerStyleParts(
  geometry: LayerStyleGeometry,
  styles: LayerStyles,
  x: number,
  y: number,
  source: RgbaColor,
  read: LayerStyleSourceReader,
  resolveColor: LayerStyleColorResolver = (color) => color
): Partial<Record<LayerStylePart, RgbaColor>> {
  const result: Partial<Record<LayerStylePart, RgbaColor>> = {}
  if (!styles.enabled) return result
  if (styles.shadow.enabled) result.shadow = withCoverage(shadowColor(styles.shadow), shadowCoverage(read, x - styles.shadow.offsetX, y - styles.shadow.offsetY, styles.shadow.blur))
  if (styles.stroke.enabled && styles.stroke.position !== 'inside' && source.a === 0) {
    const sample = outsideStrokeSample(read, x, y, styles.stroke)
    result.outerStroke = withCoverage(
      resolveOutlineStrokeColor({ ...styles.stroke, followOpacity: styles.stroke.followOpacity === true }, sample.referenceColor, resolveColor),
      sample.alpha > 0 ? 1 : 0
    )
  }
  if (source.a === 0) return result
  let styled = source
  if (styles.colorOverlay.enabled) {
    result.colorOverlay = styles.colorOverlay.color
    styled = overlayPreservingAlpha(styled, styles.colorOverlay.color)
  }
  if (styles.gradientOverlay.enabled) {
    const color = gradientColorAt(geometry, styles.gradientOverlay, x, y)
    result.gradientOverlay = color
    styled = overlayPreservingAlpha(styled, color)
  }
  if (styles.innerGlow.enabled) {
    const coverage = innerGlowCoverage(read, x, y, styles.innerGlow.size)
    result.innerGlow = withCoverage(styles.innerGlow.color, coverage)
    styled = overlayPreservingAlpha(styled, styles.innerGlow.color, coverage)
  }
  if (styles.stroke.enabled && styles.stroke.position !== 'outside') {
    result.innerStroke = withCoverage(resolveOutlineStrokeColor({ ...styles.stroke, followOpacity: styles.stroke.followOpacity === true }, styled, resolveColor), styles.stroke.followOpacity ? 1 : innerStrokeCoverage(read, x, y, styles.stroke))
  }
  return result
}

export interface LayerStyleCoverageOverrides {
  shadow?: number
  innerGlow?: number
  outsideStroke?: number
  insideStroke?: number
}

export function applyLayerStylesAt(
  geometry: LayerStyleGeometry | RasterLayer,
  styles: LayerStyles,
  x: number,
  y: number,
  source: RgbaColor,
  readGeometry: LayerStyleSourceReader,
  resolveDynamicColor: LayerStyleColorResolver = (color) => color,
  coverageOverrides?: LayerStyleCoverageOverrides
): RgbaColor {
  if (styles.enabled === false) return source
  const hasStroke = styles.stroke.enabled
  const hasOverlay = styles.colorOverlay.enabled || styles.gradientOverlay.enabled
  const hasShadow = styles.shadow.enabled
  const hasInnerGlow = styles.innerGlow.enabled

  // These effects only perform normal-alpha operations. Keeping them on a
  // scalar path avoids constructing several transient colors for every pixel
  // during large style previews while preserving the same blend order.
  if (!hasStroke && !hasOverlay && (hasShadow || hasInnerGlow)) {
    let styledSource = source
    if (source.a > 0 && hasInnerGlow) styledSource = overlayPreservingAlpha(
      source,
      styles.innerGlow.color,
      coverageOverrides?.innerGlow ?? innerGlowCoverage(readGeometry, x, y, styles.innerGlow.size)
    )
    if (!hasShadow) return styledSource
    const shadowCoverageValue = coverageOverrides?.shadow ?? shadowCoverage(readGeometry, x - styles.shadow.offsetX, y - styles.shadow.offsetY, styles.shadow.blur)
    const shadow = withCoverage(shadowColor(styles.shadow), shadowCoverageValue)
    if (shadow.a === 0) return styledSource.a > 0 ? styledSource : TRANSPARENT
    return styledSource.a > 0 ? blendNormalColors(shadow, styledSource) : shadow
  }

  let backdrop = TRANSPARENT
  if (styles.shadow.enabled) {
    const coverage = coverageOverrides?.shadow ?? shadowCoverage(readGeometry, x - styles.shadow.offsetX, y - styles.shadow.offsetY, styles.shadow.blur)
    if (coverage > 0) backdrop = blendWithMode(backdrop, withCoverage(shadowColor(styles.shadow), coverage), 1, 'normal')
  }
  if (styles.stroke.enabled && styles.stroke.position !== 'inside' && source.a === 0) {
    const sample = coverageOverrides?.outsideStroke !== undefined && !styles.stroke.smartHue && !styles.stroke.followOpacity
      ? { alpha: coverageOverrides.outsideStroke * 255, referenceColor: TRANSPARENT }
      : outsideStrokeSample(readGeometry, x, y, styles.stroke)
    // A normal layer-style stroke is an opaque/fixed-alpha effect.  Source
    // alpha is consulted only when the explicit follow-opacity option is on;
    // otherwise an anti-aliased source edge must not fade the chosen stroke.
    const coverage = sample.alpha > 0 ? 1 : 0
    if (coverage > 0) backdrop = blendWithMode(backdrop, withCoverage(resolveOutlineStrokeColor({ ...styles.stroke, followOpacity: styles.stroke.followOpacity === true }, sample.referenceColor, resolveDynamicColor), coverage), 1, 'normal')
  }

  let styledSource = source
  if (styledSource.a > 0 && styles.colorOverlay.enabled) styledSource = overlayPreservingAlpha(styledSource, styles.colorOverlay.color)
  if (styledSource.a > 0 && styles.gradientOverlay.enabled) styledSource = overlayPreservingAlpha(styledSource, gradientColorAt('offsetX' in geometry ? { x: geometry.offsetX, y: geometry.offsetY, width: geometry.width, height: geometry.height } : geometry, styles.gradientOverlay, x, y))
  if (styledSource.a > 0 && styles.innerGlow.enabled) styledSource = overlayPreservingAlpha(
    styledSource,
    styles.innerGlow.color,
    coverageOverrides?.innerGlow ?? innerGlowCoverage(readGeometry, x, y, styles.innerGlow.size)
  )
  if (styledSource.a > 0 && styles.stroke.enabled && styles.stroke.position !== 'outside') styledSource = overlayPreservingAlpha(styledSource, resolveOutlineStrokeColor({ ...styles.stroke, followOpacity: styles.stroke.followOpacity === true }, styledSource, resolveDynamicColor), styles.stroke.followOpacity ? 1 : coverageOverrides?.insideStroke ?? innerStrokeCoverage(readGeometry, x, y, styles.stroke))
  return styledSource.a > 0 ? blendWithMode(backdrop, styledSource, 1, 'normal') : backdrop
}
