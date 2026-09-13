import type { PaletteEntry, RgbaColor } from '@shared/types-color'
import type { SpriteDocument } from '@shared/types-document'
import { translateCurrent as tr } from './localization'
import { normalizePaletteSlots, PALETTE_GRID_COLUMNS } from './palette-layout'
import { extractPaletteColorsFromRgbaSurfaces, sortPaletteColors } from './palette'
import { packColor, TRANSPARENT } from './raster'

export const IMPORTED_PALETTE_COLOR_LIMIT = 256
const IMPORTED_PALETTE_SAMPLE_LIMIT = 262_144
const IMPORTED_PALETTE_EXACT_COLOR_THRESHOLD = 4096

export const sortImportedPaletteColors = (colors: readonly RgbaColor[]): RgbaColor[] => sortPaletteColors(colors, 'luminance')

const applyPaletteEntries = (document: SpriteDocument, entries: PaletteEntry[]): void => {
  document.palette = entries
  document.paletteOrder = entries.map((entry) => entry.id)
  document.paletteColumns = PALETTE_GRID_COLUMNS
  document.paletteSlots = normalizePaletteSlots(entries.map((entry) => entry.id), document.paletteOrder, undefined, document.paletteColumns)
  document.nextColorId = Math.max(1, ...entries.map((entry) => entry.id + 1))
}

const rgbaSurfaces = (document: SpriteDocument): Uint8ClampedArray[] => {
  const result: Uint8ClampedArray[] = []
  const visited = new Set<Uint8ClampedArray>()
  const append = (pixels: Uint8ClampedArray): void => {
    if (visited.has(pixels)) return
    visited.add(pixels)
    result.push(pixels)
  }
  for (const layer of document.layers) if (layer.format === 'rgba') append(layer.pixels)
  for (const cel of document.animation?.cels ?? []) if (cel.surface?.format === 'rgba') append(cel.surface.pixels)
  return result
}

const hasLimitedExactColors = (surfaces: readonly Uint8ClampedArray[]): boolean => {
  const colors = new Set<number>()
  for (const pixels of surfaces) {
    for (let offset = 0; offset < pixels.length; offset += 4) {
      if (pixels[offset + 3] === 0) continue
      colors.add((pixels[offset] | (pixels[offset + 1] << 8) | (pixels[offset + 2] << 16) | (pixels[offset + 3] << 24)) >>> 0)
      if (colors.size > IMPORTED_PALETTE_EXACT_COLOR_THRESHOLD) return false
    }
  }
  return true
}

export function applyImportedRgbaPalette(document: SpriteDocument, limit = IMPORTED_PALETTE_COLOR_LIMIT): void {
  const surfaces = rgbaSurfaces(document)
  const maximumSamples = hasLimitedExactColors(surfaces) ? Number.POSITIVE_INFINITY : IMPORTED_PALETTE_SAMPLE_LIMIT
  const colors = sortImportedPaletteColors(extractPaletteColorsFromRgbaSurfaces(surfaces, limit, maximumSamples))
  applyPaletteEntries(document, colors.map((color, index) => {
    const id = index + 1
    return { id, name: tr('core.document.colorName', { id }), color }
  }))
}

export function normalizeImportedIndexedPalette(document: SpriteDocument): void {
  const sourcePalette = new Map(document.palette.map((entry) => [entry.id, entry]))
  const sourcePixels: Uint32Array[] = []
  const visited = new Set<Uint32Array>()
  const append = (pixels: Uint32Array): void => {
    if (visited.has(pixels)) return
    visited.add(pixels)
    sourcePixels.push(pixels)
  }
  for (const layer of document.layers) if (layer.format === 'indexed') append(layer.pixels)
  for (const cel of document.animation?.cels ?? []) if (cel.surface?.format === 'indexed') append(cel.surface.pixels)

  const usedSourceIds = new Set<number>()
  for (const pixels of sourcePixels) for (const id of pixels) usedSourceIds.add(id)

  const colorsByKey = new Map<number, RgbaColor>()
  for (const id of usedSourceIds) {
    const color = sourcePalette.get(id)?.color ?? TRANSPARENT
    if (color.a === 0) continue
    const key = packColor(color)
    if (!colorsByKey.has(key)) colorsByKey.set(key, { ...color })
  }
  const colors = sortImportedPaletteColors([...colorsByKey.values()])
  const idByColor = new Map(colors.map((color, index) => [packColor(color), index + 1]))
  const remap = new Map<number, number>()
  for (const id of usedSourceIds) {
    const color = sourcePalette.get(id)?.color ?? TRANSPARENT
    remap.set(id, color.a === 0 ? 0 : idByColor.get(packColor(color)) ?? 0)
  }
  for (const pixels of sourcePixels) {
    for (let index = 0; index < pixels.length; index += 1) pixels[index] = remap.get(pixels[index]) ?? 0
  }

  applyPaletteEntries(document, [
    { id: 0, name: tr('core.document.transparentColor'), color: TRANSPARENT },
    ...colors.map((color, index) => {
      const id = index + 1
      return { id, name: tr('core.document.colorName', { id }), color }
    })
  ])
}
