import type { BrushShape, BrushTexture, GradientDither, ImageBrush, ImageBrushSettings } from '@shared/types-brush'
import type { RasterLayer } from '@shared/types-layer'
import type { RgbaColor } from '@shared/types-color'
import type { SelectionMask, SelectionRect } from '@shared/types-selection'
import type { SpriteDocument } from '@shared/types-document'
import { expandLayerToRect, getLayerStorageOrigin, getPaletteEntry, isLayerMask, layerIndexAtStoragePoint, paletteColorIdForCanvas, readLayerColor, readLayerPacked } from './document-model'
import { type PixelEdit } from './history'
import { blendOver, clampByte, packColor, unpackColor } from './raster'
import { selectionContains } from './selection'
import { proceduralBrushCoverageAt } from './brushes'


export const paintLayerValue = (
  document: SpriteDocument,
  layer: RasterLayer,
  edit: PixelEdit,
  index: number,
  color: RgbaColor,
  compositeTransparent = false,
  useCurrentDestination = false
): number => {
  // A normal transparent brush is an eraser. Dynamic gradient samples are
  // different: a transparent sample is a source-over no-op, matching
  // Aseprite's ink compositing and preserving the pixel underneath.
  if (color.a === 0) {
    if (!compositeTransparent) return layer.format === 'rgba' ? packColor(color) : 0
    // A transparent pressure-gradient sample must use the pixel currently on
    // the canvas as its backdrop. Using the edit/baseline snapshot here would
    // restore the pixel from before the stroke and erase an earlier part of
    // the same stroke when the path crosses itself.
    if (useCurrentDestination) return readLayerPacked(document, layer, index)
    const original = brushPaintBaselineByEdit.get(edit)?.get(index) ?? edit.before.get(index)
    if (original !== undefined) return original
    return readLayerPacked(document, layer, index)
  }
  if (color.a === 255 && !useCurrentDestination) return layer.format === 'rgba' ? packColor(color) : paletteColorIdForCanvas(document, color)
  let base: RgbaColor
  if (useCurrentDestination) base = readLayerColor(document, layer, index)
  else {
    const original = brushPaintBaselineByEdit.get(edit)?.get(index) ?? edit.before.get(index)
    base = original === undefined
      ? readLayerColor(document, layer, index)
      : layer.format === 'rgba'
        ? unpackColor(original)
        : getPaletteEntry(document, original).color
  }
  const blended = blendOver(base, color)
  return layer.format === 'rgba' ? packColor(blended) : paletteColorIdForCanvas(document, blended)
}

export /**
 * Composites a captured selection pixel over the destination pixel for copy /
 * paste-style operations. A normal selection move bypasses this helper and
 * writes the captured packed value directly, so moving a translucent pixel
 * cannot accumulate alpha. Masks keep their scalar/direct-write semantics and
 * therefore bypass color compositing.
 */
const compositeSelectionPixelOver = (document: SpriteDocument, layer: RasterLayer, destination: number, value: number): number => {
  if (isLayerMask(layer)) return value
  // Pasted images often contain millions of opaque pixels. Their packed
  // value is already the source-over result; avoid allocating colors and
  // rounding/repacking every channel during both translation passes.
  if (layer.format === 'rgba') {
    const alpha = value >>> 24
    if (alpha === 0) return destination
    if (alpha === 255 || (destination >>> 24) === 0) return value >>> 0
    // Match blendOver's operation order and byte rounding, without creating
    // top/base/result color objects for translucent clipboard pixels.
    const topAlpha = alpha / 255
    const bottomAlpha = (destination >>> 24) / 255
    const outAlpha = topAlpha + bottomAlpha * (1 - topAlpha)
    const r = clampByte(((value & 0xff) * topAlpha + (destination & 0xff) * bottomAlpha * (1 - topAlpha)) / outAlpha)
    const g = clampByte((((value >>> 8) & 0xff) * topAlpha + ((destination >>> 8) & 0xff) * bottomAlpha * (1 - topAlpha)) / outAlpha)
    const b = clampByte((((value >>> 16) & 0xff) * topAlpha + ((destination >>> 16) & 0xff) * bottomAlpha * (1 - topAlpha)) / outAlpha)
    return (r | (g << 8) | (b << 16) | (clampByte(outAlpha * 255) << 24)) >>> 0
  }
  const top = getPaletteEntry(document, value).color
  if (top.a === 0) return destination
  const base = getPaletteEntry(document, destination).color
  return paletteColorIdForCanvas(document, blendOver(base, top))
}

export /**
 * Uses the original value captured by a pixel edit when available. Selection
 * transforms clear their source before writing destinations, so reading the
 * live layer here would incorrectly blend over a cleared pixel for overlaps.
 */
const compositeSelectionPixelForEdit = (document: SpriteDocument, layer: RasterLayer, edit: PixelEdit, index: number, value: number): number => (
  compositeSelectionPixelOver(document, layer, edit.before.get(index) ?? readLayerPacked(document, layer, index), value)
)

interface BrushCoverageChunks {
  chunks: Map<number, Uint16Array>
}

interface BrushStampState {
  key: string
  stampX: number
  stampY: number
  width: number
  height: number
  occupied: Uint8Array
}

export interface SolidPointRecorder {
  packedValue: number
  seen: Uint8Array
  indices: Uint32Array
  before: Uint32Array
  after: Uint32Array
  count: number
}

export const BRUSH_COVERAGE_CHUNK_BITS = 12

export const BRUSH_COVERAGE_CHUNK_SIZE = 1 << BRUSH_COVERAGE_CHUNK_BITS

export const BRUSH_COVERAGE_CHUNK_MASK = BRUSH_COVERAGE_CHUNK_SIZE - 1

export const brushCoverageByEdit = new WeakMap<PixelEdit, Map<string, BrushCoverageChunks>>()

export const brushPaintBaselineByEdit = new WeakMap<PixelEdit, Map<number, number>>()

export const lastBrushStampByEdit = new WeakMap<PixelEdit, BrushStampState>()

export const solidPointRecorderByEdit = new WeakMap<PixelEdit, SolidPointRecorder>()

export const EDIT_EXPANSION_PADDING = 64

const remapPixelEditAfterLayerExpansion = (layer: RasterLayer, edit: PixelEdit, oldWidth: number, oldOrigin: { x: number; y: number }): void => {
  const remap = (index: number): number | null => layerIndexAtStoragePoint(layer, index % oldWidth + oldOrigin.x, Math.floor(index / oldWidth) + oldOrigin.y)
  const remapValues = (values: Map<number, number>): void => {
    const entries = [...values]
    values.clear()
    for (const [index, value] of entries) {
      const nextIndex = remap(index)
      if (nextIndex !== null) values.set(nextIndex, value)
    }
  }
  remapValues(edit.before)
  remapValues(edit.after)
  const paintBaseline = brushPaintBaselineByEdit.get(edit)
  if (paintBaseline) remapValues(paintBaseline)
  const coverageByKey = brushCoverageByEdit.get(edit)
  if (coverageByKey) for (const coverage of coverageByKey.values()) {
    const remapped = new Map<number, number>()
    for (const [chunkIndex, chunk] of coverage.chunks) for (let offset = 0; offset < chunk.length; offset += 1) {
      const stored = chunk[offset]
      if (stored === 0) continue
      const nextIndex = remap((chunkIndex << BRUSH_COVERAGE_CHUNK_BITS) + offset)
      if (nextIndex !== null) remapped.set(nextIndex, stored)
    }
    coverage.chunks.clear()
    for (const [index, stored] of remapped) {
      const chunkIndex = index >> BRUSH_COVERAGE_CHUNK_BITS
      let chunk = coverage.chunks.get(chunkIndex)
      if (!chunk) { chunk = new Uint16Array(BRUSH_COVERAGE_CHUNK_SIZE); coverage.chunks.set(chunkIndex, chunk) }
      chunk[index & BRUSH_COVERAGE_CHUNK_MASK] = stored
    }
  }
  lastBrushStampByEdit.delete(edit)
  solidPointRecorderByEdit.delete(edit)
}

export const ensureLayerCoversEditRect = (document: SpriteDocument, layer: RasterLayer, edit: PixelEdit, rect: SelectionRect, padding = EDIT_EXPANSION_PADDING): boolean => {
  const left = Math.max(0, Math.floor(rect.x) - padding)
  const top = Math.max(0, Math.floor(rect.y) - padding)
  const right = Math.min(document.width, Math.ceil(rect.x + rect.width) + padding)
  const bottom = Math.min(document.height, Math.ceil(rect.y + rect.height) + padding)
  if (right <= left || bottom <= top) return false
  if (left >= layer.offsetX && top >= layer.offsetY && right <= layer.offsetX + layer.width && bottom <= layer.offsetY + layer.height) return true
  if (edit.runs?.length || edit.denseRegion?.count) return false
  const oldWidth = layer.width
  const oldOrigin = getLayerStorageOrigin(layer)
  if (!expandLayerToRect(layer, left, top, right, bottom)) return false
  if (edit.before.size > 0 || edit.after.size > 0 || brushCoverageByEdit.has(edit)) remapPixelEditAfterLayerExpansion(layer, edit, oldWidth, oldOrigin)
  return true
}

export const clampSelection = (document: SpriteDocument, selection: SelectionRect): SelectionRect | null => {
  const x = Math.max(0, selection.x)
  const y = Math.max(0, selection.y)
  const right = Math.min(document.width, selection.x + selection.width)
  const bottom = Math.min(document.height, selection.y + selection.height)
  if (right <= x || bottom <= y) return null
  return { x, y, width: right - x, height: bottom - y }
}

export const clampSelectionMask = (document: SpriteDocument, selection: SelectionMask): SelectionMask | null => {
  const bounds = clampSelection(document, selection)
  if (!bounds) return null
  if (!selection.mask) return bounds
  if (bounds.x === selection.x && bounds.y === selection.y && bounds.width === selection.width && bounds.height === selection.height) return selection
  const mask = new Uint8Array(bounds.width * bounds.height)
  for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
    for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
      if (selectionContains(selection, x, y)) mask[(y - bounds.y) * bounds.width + x - bounds.x] = 1
    }
  }
  return { ...bounds, mask }
}

export interface BrushGradientSample {
  startColor: RgbaColor
  endColor: RgbaColor
  gradientAmount: number
  dither: GradientDither
}

export interface BrushMaskPoint { x: number; y: number; coverage: number; color?: RgbaColor }

/** Interpolates signed brush angles through the shortest turn. */
export function interpolateBrushAngle(from: number, to: number, progress: number): number {
  const delta = ((to - from + 540) % 360) - 180
  return from + delta * progress
}

/** The footprint shared by painting and the canvas preview. */
export function brushStampDimensions(size: number, imageBrush: ImageBrush | null = null, angle = 0, shape: BrushShape = 'square'): { width: number; height: number } {
  const base = imageBrush?.intrinsicSize
    ? { width: Math.max(1, imageBrush.width), height: Math.max(1, imageBrush.height) }
    : { width: Math.max(1, Math.round(size)), height: Math.max(1, Math.round(size)) }
  if (Math.abs(angle % 360) < 0.0001 || shape === 'line' && !imageBrush) return base
  const radians = angle * Math.PI / 180
  const cosine = Math.abs(Math.cos(radians))
  const sine = Math.abs(Math.sin(radians))
  return {
    width: Math.max(1, Math.ceil(base.width * cosine + base.height * sine - 1e-9)),
    height: Math.max(1, Math.ceil(base.width * sine + base.height * cosine - 1e-9))
  }
}

const orderedDither4x4 = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5
]

export // Colored image brushes preserve source RGBA pixels. Coverage conversion remains
// only for legacy mask brushes and built-in procedural fill textures.
const defaultImageBrushSettings: ImageBrushSettings = { mode: 'dither', threshold: 128, blackPoint: 0, whitePoint: 255, invert: false }

export const wrappedIndex = (value: number, length: number): number => ((value % length) + length) % length

export const imageBrushCoverage = (sourceCoverage: number, x: number, y: number, settings: ImageBrushSettings = defaultImageBrushSettings, antialiasStrength = 0): number => {
  const source = settings.invert ? 255 - sourceCoverage : sourceCoverage
  const range = Math.max(1, settings.whitePoint - settings.blackPoint)
  const coverage = Math.max(0, Math.min(255, Math.round((source - settings.blackPoint) * 255 / range)))
  if (antialiasStrength <= 0) {
    if (settings.mode === 'threshold') return coverage >= settings.threshold ? 255 : 0
    return coverage > orderedDither4x4[(y & 3) * 4 + (x & 3)] * 16 ? 255 : 0
  }
  if (coverage === 0) return 0
  if (coverage === 255) return 255
  const boundary = settings.mode === 'threshold' ? settings.threshold : orderedDither4x4[(y & 3) * 4 + (x & 3)] * 16
  const band = Math.max(1, Math.round(Math.min(100, antialiasStrength) * 0.64))
  if (coverage >= boundary + band) return 255
  if (coverage >= boundary - band) return 128
  return 0
}

export function imageBrushCoverageAt(imageBrush: ImageBrush, x: number, y: number, size: number, settings?: ImageBrushSettings, proceduralAntialiasStrength = 0): number {
  const stamp = brushStampDimensions(size, imageBrush)
  const localX = wrappedIndex(x, stamp.width)
  const localY = wrappedIndex(y, stamp.height)
  const strength = imageBrush.id.startsWith('procedural:') ? proceduralAntialiasStrength : 0
  const sourceCoverage = imageBrush.id.startsWith('procedural:')
    ? proceduralBrushCoverageAt(imageBrush.id, localX, localY, Math.max(stamp.width, stamp.height), imageBrush.proceduralSettings)
    : (() => {
        const sourceX = imageBrush.intrinsicSize ? localX : Math.min(imageBrush.width - 1, Math.floor(localX * imageBrush.width / stamp.width))
        const sourceY = imageBrush.intrinsicSize ? localY : Math.min(imageBrush.height - 1, Math.floor(localY * imageBrush.height / stamp.height))
        return imageBrush.coverage[sourceY * imageBrush.width + sourceX] ?? 0
      })()
  return imageBrush.intrinsicSize ? sourceCoverage : imageBrushCoverage(sourceCoverage, localX, localY, settings, strength)
}

const texturePatterns: Record<Exclude<BrushTexture, 'solid'>, readonly string[]> = {
  cracks: ['10000000', '01000100', '00101100', '00011000', '00100100', '01000010', '10000001', '00000000'],
  wood: ['11101110', '11011101', '10111011', '01110111', '11101110', '11011101', '10111011', '01110111'],
  grain: ['10100110', '01011001', '10001010', '00110100', '11001001', '01100010', '10010110', '01001001']
}

export const brushTextureContains = (texture: BrushTexture, x: number, y: number, textureScale = 1): boolean => {
  if (texture === 'solid') return true
  const pattern = texturePatterns[texture]
  const scale = Math.max(1, Math.min(16, Math.round(textureScale)))
  const row = pattern[wrappedIndex(Math.floor(y / scale), pattern.length)]
  return row[wrappedIndex(Math.floor(x / scale), row.length)] === '1'
}

export const insideSelection = (selection: SelectionMask, x: number, y: number): boolean => selectionContains(selection, x, y)
