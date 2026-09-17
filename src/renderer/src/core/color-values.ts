import type { RgbaColor } from '@shared/types-color'
import { clampByte, hsvToRgb, rgbToHsv } from './raster'

export type ColorValueMode = 'rgb' | 'hsv' | 'hsl' | 'gray' | 'lab' | 'cmyk' | 'palette'

export const colorValueModeLabel = (mode: ColorValueMode): string => mode === 'palette' ? 'PLT' : mode.toUpperCase()

export interface HslColor {
  h: number
  s: number
  l: number
}

export interface ColorValueField {
  key: 'r' | 'g' | 'b' | 'h' | 's' | 'v' | 'l' | 'gray' | 'labL' | 'labA' | 'labB' | 'c' | 'm' | 'y' | 'k' | 'a'
  label: string
  min: number
  max: number
  step: number
}

export const colorValueFields = (mode: ColorValueMode): ColorValueField[] => {
  if (mode === 'palette') return []
  if (mode === 'rgb') return [{ key: 'r', label: 'R', min: 0, max: 255, step: 1 }, { key: 'g', label: 'G', min: 0, max: 255, step: 1 }, { key: 'b', label: 'B', min: 0, max: 255, step: 1 }, { key: 'a', label: 'A', min: 0, max: 255, step: 1 }]
  if (mode === 'hsv') return [{ key: 'h', label: 'H', min: 0, max: 360, step: 1 }, { key: 's', label: 'S', min: 0, max: 100, step: 1 }, { key: 'v', label: 'V', min: 0, max: 100, step: 1 }, { key: 'a', label: 'A', min: 0, max: 255, step: 1 }]
  if (mode === 'hsl') return [{ key: 'h', label: 'H', min: 0, max: 360, step: 1 }, { key: 's', label: 'S', min: 0, max: 100, step: 1 }, { key: 'l', label: 'L', min: 0, max: 100, step: 1 }, { key: 'a', label: 'A', min: 0, max: 255, step: 1 }]
  if (mode === 'lab') return [{ key: 'labL', label: 'L', min: 0, max: 100, step: 1 }, { key: 'labA', label: 'a', min: -128, max: 127, step: 1 }, { key: 'labB', label: 'b', min: -128, max: 127, step: 1 }, { key: 'a', label: 'A', min: 0, max: 255, step: 1 }]
  if (mode === 'cmyk') return [{ key: 'c', label: 'C', min: 0, max: 100, step: 1 }, { key: 'm', label: 'M', min: 0, max: 100, step: 1 }, { key: 'y', label: 'Y', min: 0, max: 100, step: 1 }, { key: 'k', label: 'K', min: 0, max: 100, step: 1 }, { key: 'a', label: 'A', min: 0, max: 255, step: 1 }]
  return [{ key: 'gray', label: 'Gray', min: 0, max: 255, step: 1 }, { key: 'a', label: 'A', min: 0, max: 255, step: 1 }]
}

const srgbToLinear = (channel: number): number => {
  const value = Math.max(0, Math.min(1, channel / 255))
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

const linearToSrgb = (channel: number): number => {
  const value = Math.max(0, Math.min(1, channel))
  return clampByte(255 * (value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055))
}

const labCurve = (value: number): number => value > 216 / 24389 ? Math.cbrt(value) : (24389 / 27 * value + 16) / 116
const inverseLabCurve = (value: number): number => value ** 3 > 216 / 24389 ? value ** 3 : 27 / 24389 * (116 * value - 16)

export const rgbToLab = (color: RgbaColor): { l: number; a: number; b: number } => {
  const r = srgbToLinear(color.r)
  const g = srgbToLinear(color.g)
  const b = srgbToLinear(color.b)
  const fx = labCurve((r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047)
  const fy = labCurve(r * 0.2126729 + g * 0.7151522 + b * 0.072175)
  const fz = labCurve((r * 0.0193339 + g * 0.119192 + b * 0.9503041) / 1.08883)
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) }
}

export const labToRgb = (l: number, a: number, b: number, alpha = 255): RgbaColor => {
  const fy = (Math.max(0, Math.min(100, l)) + 16) / 116
  const fx = fy + Math.max(-128, Math.min(127, a)) / 500
  const fz = fy - Math.max(-128, Math.min(127, b)) / 200
  const x = 0.95047 * inverseLabCurve(fx)
  const y = inverseLabCurve(fy)
  const z = 1.08883 * inverseLabCurve(fz)
  return {
    r: linearToSrgb(x * 3.2404542 - y * 1.5371385 - z * 0.4985314),
    g: linearToSrgb(-x * 0.969266 + y * 1.8760108 + z * 0.041556),
    b: linearToSrgb(x * 0.0556434 - y * 0.2040259 + z * 1.0572252),
    a: clampByte(alpha)
  }
}

export const rgbToCmyk = (color: RgbaColor): { c: number; m: number; y: number; k: number } => {
  const r = color.r / 255
  const g = color.g / 255
  const b = color.b / 255
  const k = 1 - Math.max(r, g, b)
  if (k >= 1 - Number.EPSILON) return { c: 0, m: 0, y: 0, k: 1 }
  return { c: (1 - r - k) / (1 - k), m: (1 - g - k) / (1 - k), y: (1 - b - k) / (1 - k), k }
}

export const cmykToRgb = (c: number, m: number, y: number, k: number, alpha = 255): RgbaColor => {
  const normalized = [c, m, y, k].map((value) => Math.max(0, Math.min(100, value)) / 100)
  return {
    r: clampByte(255 * (1 - normalized[0]) * (1 - normalized[3])),
    g: clampByte(255 * (1 - normalized[1]) * (1 - normalized[3])),
    b: clampByte(255 * (1 - normalized[2]) * (1 - normalized[3])),
    a: clampByte(alpha)
  }
}

export const rgbaHex = (color: RgbaColor): string => `#${[color.r, color.g, color.b, color.a].map((channel) => clampByte(channel).toString(16).padStart(2, '0')).join('').toUpperCase()}`

/** Uses six digits for opaque UI colors and keeps alpha only when it carries information. */
export const displayRgbaHex = (color: RgbaColor): string => {
  const value = rgbaHex(color)
  return clampByte(color.a) === 255 ? value.slice(0, 7) : value
}

export const parseRgbaHex = (value: string, fallbackAlpha = 255): RgbaColor | null => {
  const match = /^#?([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(value.trim())
  if (!match) return null
  const rgb = Number.parseInt(match[1], 16)
  return { r: rgb >>> 16, g: (rgb >>> 8) & 0xff, b: rgb & 0xff, a: match[2] ? Number.parseInt(match[2], 16) : fallbackAlpha }
}

export const rgbToHsl = (color: RgbaColor): HslColor => {
  const r = color.r / 255
  const g = color.g / 255
  const b = color.b / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  const l = (max + min) / 2
  if (delta === 0) return { h: 0, s: 0, l }
  const s = delta / (1 - Math.abs(2 * l - 1))
  const h = ((max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4) * 60 + 360) % 360
  return { h, s, l }
}

export const hslToRgb = (hue: number, saturation: number, lightness: number, alpha = 255): RgbaColor => {
  const h = ((hue % 360) + 360) % 360 / 360
  const s = Math.max(0, Math.min(1, saturation))
  const l = Math.max(0, Math.min(1, lightness))
  if (s === 0) {
    const value = Math.round(l * 255)
    return { r: value, g: value, b: value, a: alpha }
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const channel = (position: number): number => {
    let x = (h + position) % 1
    if (x < 0) x += 1
    return x < 1 / 6 ? p + (q - p) * 6 * x : x < 1 / 2 ? q : x < 2 / 3 ? p + (q - p) * (2 / 3 - x) * 6 : p
  }
  return { r: Math.round(channel(1 / 3) * 255), g: Math.round(channel(0) * 255), b: Math.round(channel(-1 / 3) * 255), a: alpha }
}

export const colorToValues = (color: RgbaColor, mode: ColorValueMode): Record<string, number> => {
  if (mode === 'palette') return {}
  if (mode === 'rgb') return { r: color.r, g: color.g, b: color.b, a: color.a }
  if (mode === 'gray') return { gray: Math.round(color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722), a: color.a }
  if (mode === 'hsv') {
    const hsv = rgbToHsv(color)
    return { h: hsv.h, s: hsv.s * 100, v: hsv.v * 100, a: color.a }
  }
  if (mode === 'lab') {
    const lab = rgbToLab(color)
    return { labL: lab.l, labA: lab.a, labB: lab.b, a: color.a }
  }
  if (mode === 'cmyk') {
    const cmyk = rgbToCmyk(color)
    return { c: cmyk.c * 100, m: cmyk.m * 100, y: cmyk.y * 100, k: cmyk.k * 100, a: color.a }
  }
  const hsl = rgbToHsl(color)
  return { h: hsl.h, s: hsl.s * 100, l: hsl.l * 100, a: color.a }
}

export const colorFromValues = (mode: ColorValueMode, values: Record<string, number>, fallback: RgbaColor): RgbaColor => {
  if (mode === 'palette') return { ...fallback }
  const alpha = clampByte(values.a ?? fallback.a)
  if (mode === 'rgb') return { r: clampByte(values.r), g: clampByte(values.g), b: clampByte(values.b), a: alpha }
  if (mode === 'gray') {
    const gray = clampByte(values.gray)
    return { r: gray, g: gray, b: gray, a: alpha }
  }
  if (mode === 'hsv') return hsvToRgb({ h: values.h ?? 0, s: (values.s ?? 0) / 100, v: (values.v ?? 0) / 100 }, alpha)
  if (mode === 'lab') return labToRgb(values.labL ?? 0, values.labA ?? 0, values.labB ?? 0, alpha)
  if (mode === 'cmyk') return cmykToRgb(values.c ?? 0, values.m ?? 0, values.y ?? 0, values.k ?? 0, alpha)
  return hslToRgb(values.h ?? 0, (values.s ?? 0) / 100, (values.l ?? 0) / 100, alpha)
}
