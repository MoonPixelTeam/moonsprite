import type { AnimationCelSurface, BackgroundLayerSettings, BackgroundPatternId, RasterLayer, RgbaColor } from '@shared/types'
import { readSurfacePackedLocal } from './runtime-raster'

type BackgroundSurface = RasterLayer | AnimationCelSurface

export interface BackgroundPatternTile {
  id: string
  name: string
  width: number
  height: number
  pixels: Uint8ClampedArray
  pattern?: Exclude<BackgroundPatternId, 'solid'>
}

export const BACKGROUND_PATTERN_IDS: readonly BackgroundPatternId[] = ['solid', 'grid', 'stripes', 'diamond', 'diamond-nested', 'circles']

const patternIds = new Set<string>(BACKGROUND_PATTERN_IDS)
const gray = (value: number): RgbaColor => ({ r: value, g: value, b: value, a: 255 })
const positiveModulo = (value: number, divisor: number): number => ((value % divisor) + divisor) % divisor

const diamondNestedRows = [
  'BABBBBBAABBBBBABAAAAAA',
  'ABBBBBABBABBBBBABAAAAB',
  'BBBBBABAABABBBBBABAABA',
  'BBBBABAAAABABBBBBABBAB',
  'BBBABAAAAAABABBBBBAABB',
  'BBABAAAAAAAABABBBBBBBB',
  'BABAAABBBBAAABABBBBBBB',
  'ABAAAABAABAAAABABBAABB',
  'ABAAAABAABAAAABABBAABB',
  'BABAAABBBBAAABABBBBBBB',
  'BBABAAAAAAAABABBBBBBBB',
  'BBBABAAAAAABABBBBBAABB',
  'BBBBABAAAABABBBBBABBAB',
  'BBBBBABAABABBBBBABAABA',
  'ABBBBBABBABBBBBABAAAAB',
  'BABBBBBAABBBBBABAAAAAA',
  'ABABBBBBBBBBBABAAAAAAA',
  'AABABBBBBBBBABAAABBBBA',
  'AAABABBAABBABAAAABAABA',
  'AAABABBAABBABAAAABAABA',
  'AABABBBBBBBBABAAABBBBA',
  'ABABBBBBBBBBBABAAAAAAA'
] as const

const circleRows = [
  'ABBBABBBBBBABBBA',
  'BBBBABBBBBBABBBB',
  'BBBABBBBBBBBABBB',
  'BBABBBAAAABBBABB',
  'AABBBABBBBABBBAA',
  'BBBBABBBBBBABBBB',
  'BBBABBBBBBBBABBB',
  'BBBABBBAABBBABBB',
  'BBBABBBAABBBABBB',
  'BBBABBBBBBBBABBB',
  'BBBBABBBBBBABBBB',
  'AABBBABBBBABBBAA',
  'BBABBBAAAABBBABB',
  'BBBABBBBBBBBABBB',
  'BBBBABBBBBBABBBB',
  'ABBBABBBBBBABBBA'
] as const

export const isBackgroundPatternId = (value: unknown): value is BackgroundPatternId =>
  typeof value === 'string' && patternIds.has(value)

export const normalizeBackgroundLayerSettings = (value: unknown): BackgroundLayerSettings | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const candidate = value as Partial<BackgroundLayerSettings>
  if (candidate.mode === 'canvas') return { mode: 'canvas' }
  if (candidate.mode === 'preset' && isBackgroundPatternId(candidate.pattern)) return { mode: 'preset', pattern: candidate.pattern }
  return undefined
}

export const backgroundPatternSize = (pattern: BackgroundPatternId): { width: number; height: number } => {
  if (pattern === 'solid') return { width: 1, height: 1 }
  if (pattern === 'diamond-nested') return { width: 22, height: 22 }
  if (pattern === 'circles') return { width: 16, height: 16 }
  return { width: 32, height: 32 }
}

export const backgroundPatternColorAt = (pattern: BackgroundPatternId, x: number, y: number): RgbaColor => {
  const size = backgroundPatternSize(pattern)
  const localX = positiveModulo(Math.trunc(x), size.width)
  const localY = positiveModulo(Math.trunc(y), size.height)
  if (pattern === 'solid') return gray(228)
  if (pattern === 'grid') return gray(((localX < 16) === (localY < 16)) ? 180 : 191)
  if (pattern === 'stripes') {
    const quadrant = (localX >= 16 ? 1 : 0) + (localY >= 16 ? 1 : 0)
    return gray(quadrant === 0 ? 106 : quadrant === 1 ? 113 : 119)
  }
  if (pattern === 'diamond') {
    const quadrantX = Math.floor(localX / 16)
    const quadrantY = Math.floor(localY / 16)
    const distance = Math.abs(localX % 16 - 7.5) + Math.abs(localY % 16 - 7.5)
    if (distance > 8) return gray(119)
    return gray((quadrantX + quadrantY) % 2 === 0 ? 143 : 98)
  }
  if (pattern === 'diamond-nested') return gray(diamondNestedRows[localY][localX] === 'A' ? 143 : 171)
  return gray(circleRows[localY][localX] === 'A' ? 152 : 171)
}

export const renderBackgroundPatternRgba = (width: number, height: number, pattern: BackgroundPatternId): Uint8ClampedArray => {
  const pixels = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const color = backgroundPatternColorAt(pattern, x, y)
    const offset = (y * width + x) * 4
    pixels[offset] = color.r
    pixels[offset + 1] = color.g
    pixels[offset + 2] = color.b
    pixels[offset + 3] = color.a
  }
  return pixels
}

export const renderBackgroundPatternIndexed = (width: number, height: number, pattern: BackgroundPatternId, resolveColor: (color: RgbaColor) => number): Uint32Array => {
  const colors = new Map<number, number>()
  const pixels = new Uint32Array(width * height)
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const color = backgroundPatternColorAt(pattern, x, y)
    let id = colors.get(color.r)
    if (id === undefined) {
      id = resolveColor(color)
      colors.set(color.r, id)
    }
    pixels[y * width + x] = id
  }
  return pixels
}

const validateBackgroundPatternTile = (tile: BackgroundPatternTile): void => {
  if (!Number.isSafeInteger(tile.width) || !Number.isSafeInteger(tile.height) || tile.width < 1 || tile.height < 1 || tile.pixels.length !== tile.width * tile.height * 4) {
    throw new Error('Invalid background preset tile.')
  }
}

export const renderBackgroundTileRgba = (width: number, height: number, tile: BackgroundPatternTile): Uint8ClampedArray => {
  validateBackgroundPatternTile(tile)
  const pixels = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const source = ((y % tile.height) * tile.width + (x % tile.width)) * 4
    pixels.set(tile.pixels.subarray(source, source + 4), (y * width + x) * 4)
  }
  return pixels
}

export const renderBackgroundTileIndexed = (width: number, height: number, tile: BackgroundPatternTile, resolveColor: (color: RgbaColor) => number): Uint32Array => {
  validateBackgroundPatternTile(tile)
  const ids = new Map<number, number>()
  const pixels = new Uint32Array(width * height)
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const source = ((y % tile.height) * tile.width + (x % tile.width)) * 4
    const color = { r: tile.pixels[source], g: tile.pixels[source + 1], b: tile.pixels[source + 2], a: tile.pixels[source + 3] }
    const key = (color.r | (color.g << 8) | (color.b << 16) | (color.a << 24)) >>> 0
    let id = ids.get(key)
    if (id === undefined) {
      id = resolveColor(color)
      ids.set(key, id)
    }
    pixels[y * width + x] = id
  }
  return pixels
}

/** Preserves the old canvas contents and fills only the newly exposed area. */
export const tileBackgroundSurfaceToCanvas = (
  surface: BackgroundSurface,
  sourceCanvasWidth: number,
  sourceCanvasHeight: number,
  targetCanvasWidth: number,
  targetCanvasHeight: number,
  offsetX: number,
  offsetY: number,
  repeatSize?: { width: number; height: number },
  presetPattern?: BackgroundPatternId,
  resolveColor?: (color: RgbaColor) => number
): void => {
  const sourceWidth = surface.width
  const sourceHeight = surface.height
  const sourceOffsetX = surface.offsetX
  const sourceOffsetY = surface.offsetY
  const horizontal = Math.trunc(offsetX)
  const vertical = Math.trunc(offsetY)
  const repeatWidth = repeatSize?.width ?? sourceCanvasWidth
  const repeatHeight = repeatSize?.height ?? sourceCanvasHeight
  if (surface.format === 'rgba') {
    const pixels = new Uint8ClampedArray(targetCanvasWidth * targetCanvasHeight * 4)
    for (let y = 0; y < targetCanvasHeight; y += 1) for (let x = 0; x < targetCanvasWidth; x += 1) {
      const sourceCanvasX = x - horizontal
      const sourceCanvasY = y - vertical
      const insideSourceCanvas = sourceCanvasX >= 0 && sourceCanvasX < sourceCanvasWidth && sourceCanvasY >= 0 && sourceCanvasY < sourceCanvasHeight
      const localX = insideSourceCanvas
        ? sourceCanvasX - sourceOffsetX
        : positiveModulo(sourceCanvasX - sourceOffsetX, repeatWidth)
      const localY = insideSourceCanvas
        ? sourceCanvasY - sourceOffsetY
        : positiveModulo(sourceCanvasY - sourceOffsetY, repeatHeight)
      const target = (y * targetCanvasWidth + x) * 4
      if (!insideSourceCanvas && presetPattern) {
        const color = backgroundPatternColorAt(presetPattern, sourceCanvasX, sourceCanvasY)
        pixels[target] = color.r
        pixels[target + 1] = color.g
        pixels[target + 2] = color.b
        pixels[target + 3] = color.a
        continue
      }
      if (localX < 0 || localY < 0 || localX >= sourceWidth || localY >= sourceHeight) continue
      const packed = readSurfacePackedLocal(surface, localX, localY)
      pixels[target] = packed & 0xff
      pixels[target + 1] = (packed >>> 8) & 0xff
      pixels[target + 2] = (packed >>> 16) & 0xff
      pixels[target + 3] = (packed >>> 24) & 0xff
    }
    surface.pixels = pixels
  } else {
    const pixels = new Uint32Array(targetCanvasWidth * targetCanvasHeight)
    for (let y = 0; y < targetCanvasHeight; y += 1) for (let x = 0; x < targetCanvasWidth; x += 1) {
      const sourceCanvasX = x - horizontal
      const sourceCanvasY = y - vertical
      const insideSourceCanvas = sourceCanvasX >= 0 && sourceCanvasX < sourceCanvasWidth && sourceCanvasY >= 0 && sourceCanvasY < sourceCanvasHeight
      const localX = insideSourceCanvas
        ? sourceCanvasX - sourceOffsetX
        : positiveModulo(sourceCanvasX - sourceOffsetX, repeatWidth)
      const localY = insideSourceCanvas
        ? sourceCanvasY - sourceOffsetY
        : positiveModulo(sourceCanvasY - sourceOffsetY, repeatHeight)
      if (!insideSourceCanvas && presetPattern && resolveColor) {
        pixels[y * targetCanvasWidth + x] = resolveColor(backgroundPatternColorAt(presetPattern, sourceCanvasX, sourceCanvasY))
        continue
      }
      if (localX < 0 || localY < 0 || localX >= sourceWidth || localY >= sourceHeight) continue
      pixels[y * targetCanvasWidth + x] = readSurfacePackedLocal(surface, localX, localY)
    }
    surface.pixels = pixels
  }
  delete surface.runtimeRaster
  surface.width = targetCanvasWidth
  surface.height = targetCanvasHeight
  surface.offsetX = 0
  surface.offsetY = 0
  if (!('id' in surface)) {
    surface.storageOriginX = 0
    surface.storageOriginY = 0
  }
}
