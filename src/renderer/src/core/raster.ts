import type { BlendMode, RgbaColor } from '@shared/types-color'

export const TRANSPARENT: RgbaColor = { r: 0, g: 0, b: 0, a: 0 }

export const clampByte = (value: number): number => Math.max(0, Math.min(255, Math.round(value)))

export const packColor = (color: RgbaColor): number =>
  (clampByte(color.r) | (clampByte(color.g) << 8) | (clampByte(color.b) << 16) | (clampByte(color.a) << 24)) >>> 0

export const unpackColor = (value: number): RgbaColor => ({
  r: value & 0xff,
  g: (value >>> 8) & 0xff,
  b: (value >>> 16) & 0xff,
  a: (value >>> 24) & 0xff
})

export const colorToHex = (color: RgbaColor): string =>
  `#${[color.r, color.g, color.b].map((part) => clampByte(part).toString(16).padStart(2, '0')).join('')}`.toUpperCase()

export const hexToColor = (hex: string, alpha = 255): RgbaColor | null => {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) return null
  const value = Number.parseInt(match[1], 16)
  return { r: value >>> 16, g: (value >>> 8) & 0xff, b: value & 0xff, a: clampByte(alpha) }
}

export const colorEquals = (a: RgbaColor, b: RgbaColor): boolean => packColor(a) === packColor(b)

export const blendOver = (bottom: RgbaColor, top: RgbaColor, opacity = 1): RgbaColor => {
  const topAlpha = (top.a / 255) * opacity
  const bottomAlpha = bottom.a / 255
  const outAlpha = topAlpha + bottomAlpha * (1 - topAlpha)
  if (outAlpha <= 0) return TRANSPARENT
  return {
    r: clampByte(((top.r * topAlpha) + (bottom.r * bottomAlpha * (1 - topAlpha))) / outAlpha),
    g: clampByte(((top.g * topAlpha) + (bottom.g * bottomAlpha * (1 - topAlpha))) / outAlpha),
    b: clampByte(((top.b * topAlpha) + (bottom.b * bottomAlpha * (1 - topAlpha))) / outAlpha),
    a: clampByte(outAlpha * 255)
  }
}

const blendChannel = (bottom: number, top: number, mode: BlendMode): number => {
  if (mode === 'darken') return Math.min(bottom, top)
  if (mode === 'multiply') return (bottom * top) / 255
  if (mode === 'color-burn') return top <= 0 ? 0 : 255 - Math.min(255, ((255 - bottom) * 255) / top)
  if (mode === 'linear-burn') return Math.max(0, bottom + top - 255)
  if (mode === 'lighten') return Math.max(bottom, top)
  if (mode === 'screen') return 255 - ((255 - bottom) * (255 - top)) / 255
  if (mode === 'color-dodge') return top >= 255 ? 255 : Math.min(255, (bottom * 255) / (255 - top))
  if (mode === 'linear-dodge') return Math.min(255, bottom + top)
  if (mode === 'overlay') return bottom < 128 ? (2 * bottom * top) / 255 : 255 - (2 * (255 - bottom) * (255 - top)) / 255
  if (mode === 'hard-light') return top < 128 ? (2 * bottom * top) / 255 : 255 - (2 * (255 - bottom) * (255 - top)) / 255
  if (mode === 'soft-light') {
    const b = bottom / 255
    const t = top / 255
    const curve = b <= 0.25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b)
    return 255 * (t <= 0.5 ? b - (1 - 2 * t) * b * (1 - b) : b + (2 * t - 1) * (curve - b))
  }
  if (mode === 'vivid-light') return top < 128
    ? blendChannel(bottom, top * 2, 'color-burn')
    : blendChannel(bottom, (top - 128) * 2, 'color-dodge')
  if (mode === 'linear-light') return Math.max(0, Math.min(255, bottom + 2 * top - 255))
  if (mode === 'pin-light') return top < 128 ? Math.min(bottom, top * 2) : Math.max(bottom, (top - 128) * 2)
  if (mode === 'hard-mix') return blendChannel(bottom, top, 'vivid-light') < 128 ? 0 : 255
  if (mode === 'difference') return Math.abs(bottom - top)
  if (mode === 'exclusion') return bottom + top - (2 * bottom * top) / 255
  if (mode === 'subtract') return Math.max(0, bottom - top)
  if (mode === 'divide') return top <= 0 ? 255 : Math.min(255, (bottom * 255) / top)
  return top
}

const blendTables = new Map<BlendMode, Float64Array>()
const separableBlendTableFor = (mode: BlendMode): Float64Array | null => {
  if (mode === 'hue' || mode === 'saturation' || mode === 'color' || mode === 'luminosity') return null
  let table = blendTables.get(mode)
  if (table) return table
  table = new Float64Array(256 * 256)
  for (let bottom = 0; bottom < 256; bottom += 1) for (let top = 0; top < 256; top += 1) {
    table[bottom * 256 + top] = blendChannel(bottom, top, mode)
  }
  blendTables.set(mode, table)
  return table
}

type RgbVector = [number, number, number]
const vectorLuminosity = ([r, g, b]: RgbVector): number => 0.3 * r + 0.59 * g + 0.11 * b
const vectorSaturation = (value: RgbVector): number => Math.max(...value) - Math.min(...value)
const clipVector = (value: RgbVector): RgbVector => {
  const luminosity = vectorLuminosity(value)
  const minimum = Math.min(...value)
  const maximum = Math.max(...value)
  let output = [...value] as RgbVector
  if (minimum < 0) output = output.map((channel) => luminosity + ((channel - luminosity) * luminosity) / (luminosity - minimum)) as RgbVector
  if (maximum > 1) output = output.map((channel) => luminosity + ((channel - luminosity) * (1 - luminosity)) / (maximum - luminosity)) as RgbVector
  return output
}
const setVectorLuminosity = (value: RgbVector, luminosity: number): RgbVector => clipVector(value.map((channel) => channel + luminosity - vectorLuminosity(value)) as RgbVector)
const setVectorSaturation = (value: RgbVector, saturation: number): RgbVector => {
  const output = [0, 0, 0] as RgbVector
  const indices = [0, 1, 2].sort((left, right) => value[left] - value[right])
  const [minimum, middle, maximum] = indices
  if (value[maximum] > value[minimum]) {
    output[middle] = ((value[middle] - value[minimum]) * saturation) / (value[maximum] - value[minimum])
    output[maximum] = saturation
  }
  output[minimum] = 0
  return output
}

const nonSeparableBlend = (bottom: RgbaColor, top: RgbaColor, mode: BlendMode): RgbVector | null => {
  if (mode !== 'hue' && mode !== 'saturation' && mode !== 'color' && mode !== 'luminosity') return null
  const b = [bottom.r / 255, bottom.g / 255, bottom.b / 255] as RgbVector
  const t = [top.r / 255, top.g / 255, top.b / 255] as RgbVector
  if (mode === 'hue') return setVectorLuminosity(setVectorSaturation(t, vectorSaturation(b)), vectorLuminosity(b))
  if (mode === 'saturation') return setVectorLuminosity(setVectorSaturation(b, vectorSaturation(t)), vectorLuminosity(b))
  if (mode === 'color') return setVectorLuminosity(t, vectorLuminosity(b))
  return setVectorLuminosity(b, vectorLuminosity(t))
}

export const blendWithMode = (bottom: RgbaColor, top: RgbaColor, opacity: number, mode: BlendMode): RgbaColor => {
  if (mode === 'normal' || bottom.a === 0) return blendOver(bottom, top, opacity)
  const nonSeparable = nonSeparableBlend(bottom, top, mode)
  const mixed = {
    r: nonSeparable ? nonSeparable[0] * 255 : blendChannel(bottom.r, top.r, mode),
    g: nonSeparable ? nonSeparable[1] * 255 : blendChannel(bottom.g, top.g, mode),
    b: nonSeparable ? nonSeparable[2] * 255 : blendChannel(bottom.b, top.b, mode),
    a: top.a
  }
  return blendOver(bottom, mixed, opacity)
}

/** Writes the same blend result without allocating intermediate colors.
 * Non-separable modes still use the canonical color-vector implementation. */
export const blendWithModeInto = (
  output: Uint8ClampedArray<ArrayBufferLike>,
  offset: number,
  bottomR: number,
  bottomG: number,
  bottomB: number,
  bottomA: number,
  topR: number,
  topG: number,
  topB: number,
  topA: number,
  opacity: number,
  mode: BlendMode
): void => {
  if (opacity === 1 && topA === 255 && bottomA === 255) {
    if (mode === 'normal') {
      output[offset] = topR
      output[offset + 1] = topG
      output[offset + 2] = topB
      output[offset + 3] = 255
      return
    }
    const table = separableBlendTableFor(mode)
    if (table) {
      output[offset] = clampByte(table[bottomR * 256 + topR])
      output[offset + 1] = clampByte(table[bottomG * 256 + topG])
      output[offset + 2] = clampByte(table[bottomB * 256 + topB])
      output[offset + 3] = 255
      return
    }
  }
  const topAlpha = (topA / 255) * opacity
  const bottomAlpha = bottomA / 255
  const outputAlpha = topAlpha + bottomAlpha * (1 - topAlpha)
  if (outputAlpha <= 0) {
    output[offset] = 0
    output[offset + 1] = 0
    output[offset + 2] = 0
    output[offset + 3] = 0
    return
  }
  let mixedR = topR
  let mixedG = topG
  let mixedB = topB
  if (mode !== 'normal' && bottomA !== 0) {
    const isNonSeparable = mode === 'hue' || mode === 'saturation' || mode === 'color' || mode === 'luminosity'
    if (isNonSeparable) {
      const nonSeparable = nonSeparableBlend(
        { r: bottomR, g: bottomG, b: bottomB, a: bottomA },
        { r: topR, g: topG, b: topB, a: topA },
        mode
      )!
      mixedR = nonSeparable[0] * 255
      mixedG = nonSeparable[1] * 255
      mixedB = nonSeparable[2] * 255
    } else {
      const table = separableBlendTableFor(mode)
      mixedR = table ? table[bottomR * 256 + topR] : blendChannel(bottomR, topR, mode)
      mixedG = table ? table[bottomG * 256 + topG] : blendChannel(bottomG, topG, mode)
      mixedB = table ? table[bottomB * 256 + topB] : blendChannel(bottomB, topB, mode)
    }
  }
  output[offset] = clampByte(((mixedR * topAlpha) + (bottomR * bottomAlpha * (1 - topAlpha))) / outputAlpha)
  output[offset + 1] = clampByte(((mixedG * topAlpha) + (bottomG * bottomAlpha * (1 - topAlpha))) / outputAlpha)
  output[offset + 2] = clampByte(((mixedB * topAlpha) + (bottomB * bottomAlpha * (1 - topAlpha))) / outputAlpha)
  output[offset + 3] = clampByte(outputAlpha * 255)
}

const srgbToLinear = (channel: number): number => {
  const value = channel / 255
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}
const linearToSrgb = (value: number): number => 255 * (value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055)

/** Converts display RGB to perceptual-lightness gray while preserving alpha. */
export const relativeLuminanceColor = (color: RgbaColor): RgbaColor => {
  const luminance = 0.2126 * srgbToLinear(color.r) + 0.7152 * srgbToLinear(color.g) + 0.0722 * srgbToLinear(color.b)
  const gray = clampByte(linearToSrgb(luminance))
  return { r: gray, g: gray, b: gray, a: color.a }
}

export const applyRelativeLuminance = (pixels: Uint8ClampedArray): Uint8ClampedArray => {
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const gray = relativeLuminanceColor({ r: pixels[offset], g: pixels[offset + 1], b: pixels[offset + 2], a: pixels[offset + 3] }).r
    pixels[offset] = gray
    pixels[offset + 1] = gray
    pixels[offset + 2] = gray
  }
  return pixels
}

export const readRgbaPixel = (pixels: Uint8ClampedArray, index: number): RgbaColor => {
  const offset = index * 4
  return { r: pixels[offset], g: pixels[offset + 1], b: pixels[offset + 2], a: pixels[offset + 3] }
}

export const writeRgbaPixel = (pixels: Uint8ClampedArray, index: number, color: RgbaColor): void => {
  const offset = index * 4
  pixels[offset] = clampByte(color.r)
  pixels[offset + 1] = clampByte(color.g)
  pixels[offset + 2] = clampByte(color.b)
  pixels[offset + 3] = clampByte(color.a)
}

export const pixelIndex = (width: number, x: number, y: number): number => y * width + x

export const isInBounds = (width: number, height: number, x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < width && y < height

export interface HsvColor {
  h: number
  s: number
  v: number
}

export const rgbToHsv = (color: RgbaColor): HsvColor => {
  const r = color.r / 255
  const g = color.g / 255
  const b = color.b / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  let h = 0
  if (delta > 0) {
    if (max === r) h = 60 * (((g - b) / delta) % 6)
    else if (max === g) h = 60 * ((b - r) / delta + 2)
    else h = 60 * ((r - g) / delta + 4)
  }
  if (h < 0) h += 360
  return { h, s: max === 0 ? 0 : delta / max, v: max }
}

export const hsvToRgb = (hsv: HsvColor, alpha = 255): RgbaColor => {
  const h = ((hsv.h % 360) + 360) % 360
  const c = hsv.v * hsv.s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = hsv.v - c
  const sector = Math.floor(h / 60)
  const values = sector === 0 ? [c, x, 0] : sector === 1 ? [x, c, 0] : sector === 2 ? [0, c, x] : sector === 3 ? [0, x, c] : sector === 4 ? [x, 0, c] : [c, 0, x]
  return { r: clampByte((values[0] + m) * 255), g: clampByte((values[1] + m) * 255), b: clampByte((values[2] + m) * 255), a: clampByte(alpha) }
}
