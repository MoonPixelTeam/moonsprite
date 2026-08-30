import type { GradientDither, GradientStop, GradientType, RasterLayer, RgbaColor, SelectionMask, SpriteDocument } from '@shared/types'
import { beginPixelEdit, preparePixelEdit, recordPixel, type PixelEdit } from './history'
import { expandLayerToRect, getLayerStorageOrigin, isLayerEffectivelyLocked, layerIndexAt, markLayerContentChanged, normalizeLayerPackedValue, paletteColorIdForCanvas, readLayerColor, readLayerPacked, writeLayerPacked } from './document'
import { blendOver, packColor } from './raster'
import { magicWandSelection, selectionContains } from './selection'
import { createGradientColorSampler, type GradientGeometryOptions } from './gradient-color'

export { createGradientColorSampler, gradientAmountAt, gradientColorAt, gradientColorForAmount, GRADIENT_DITHER_PRESETS, interpolateRgbaColor, normalizeGradientStops, resolveRadialGradientGeometry } from './gradient-color'
export type { GradientGeometryOptions, RadialGradientGeometry } from './gradient-color'

/** Snaps a gradient endpoint to one of sixteen evenly spaced directions. */
export const constrainGradientEndpoint = (
  start: { x: number; y: number },
  end: { x: number; y: number }
): { x: number; y: number } => {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const distance = Math.hypot(dx, dy)
  if (distance === 0) return { ...end }
  const step = Math.PI / 8
  const angle = Math.atan2(dy, dx)
  const snappedAngle = Math.round(angle / step) * step
  // Keep the snapped endpoint continuous. Rounding here would turn the
  // diagonal direction back into an arbitrary integer slope at short drags.
  const normalizeCoordinate = (value: number): number => Math.abs(value - Math.round(value)) < 1e-10 ? Math.round(value) : value
  return {
    x: normalizeCoordinate(start.x + Math.cos(snappedAngle) * distance),
    y: normalizeCoordinate(start.y + Math.sin(snappedAngle) * distance)
  }
}

/** Resolves the color-matched area that a gradient is allowed to paint. */
export const gradientRegionSelection = (
  document: SpriteDocument,
  layer: RasterLayer,
  start: { x: number; y: number },
  tolerance = 0,
  contiguous = true
): SelectionMask | null => magicWandSelection(document, layer, start.x, start.y, tolerance, contiguous)

const gradientPaintValue = (document: SpriteDocument, layer: RasterLayer, index: number, color: RgbaColor): number => {
  if (color.a === 0) {
    // A transparent gradient source is source-over no-op, including hidden
    // RGB channels on an already transparent destination.
    return readLayerPacked(document, layer, index)
  }
  if (color.a === 255) return layer.format === 'rgba' ? packColor(color) : paletteColorIdForCanvas(document, color)
  return layer.format === 'rgba'
    ? packColor(blendOver(readLayerColor(document, layer, index), color))
    : paletteColorIdForCanvas(document, blendOver(readLayerColor(document, layer, index), color))
}

const DENSE_GRADIENT_MIN_PIXELS = 512 * 512

const applyDenseGradient = (
  document: SpriteDocument,
  layer: RasterLayer,
  edit: PixelEdit,
  left: number,
  top: number,
  right: number,
  bottom: number,
  sampleColor: (x: number, y: number) => RgbaColor,
  selection?: SelectionMask | null,
  paintRegion?: SelectionMask | null
): PixelEdit | null => {
  const width = right - left
  const height = bottom - top
  const before = new Uint32Array(width * height)
  const after = new Uint32Array(width * height)
  const changed = new Uint8Array(width * height)
  const storageOrigin = getLayerStorageOrigin(layer)
  let count = 0
  let dirtyLeft = right
  let dirtyTop = bottom
  let dirtyRight = left
  let dirtyBottom = top
  const rgbaWords = layer.format === 'rgba' && layer.pixels.byteOffset % 4 === 0
    ? new Uint32Array(layer.pixels.buffer as ArrayBuffer, layer.pixels.byteOffset, layer.pixels.byteLength / 4)
    : null

  preparePixelEdit(document, edit)
  for (let y = top; y < bottom; y += 1) for (let x = left; x < right; x += 1) {
    if (selection && !selectionContains(selection, x, y)) continue
    if (paintRegion && !selectionContains(paintRegion, x, y)) continue
    const index = layerIndexAt(layer, x, y)
    if (index === null) continue
    const current = rgbaWords ? rgbaWords[index] : readLayerPacked(document, layer, index)
    const next = normalizeLayerPackedValue(document, layer, gradientPaintValue(document, layer, index, sampleColor(x, y)))
    if (current === next) continue
    if (count === 0) markLayerContentChanged(layer)
    const denseOffset = (y - top) * width + x - left
    before[denseOffset] = current
    after[denseOffset] = next
    changed[denseOffset] = 1
    count += 1
    dirtyLeft = Math.min(dirtyLeft, x)
    dirtyTop = Math.min(dirtyTop, y)
    dirtyRight = Math.max(dirtyRight, x + 1)
    dirtyBottom = Math.max(dirtyBottom, y + 1)
    if (rgbaWords) rgbaWords[index] = next
    else writeLayerPacked(document, layer, index, next)
  }
  if (count === 0) return null
  edit.denseRegion = {
    x: left - layer.offsetX + storageOrigin.x,
    y: top - layer.offsetY + storageOrigin.y,
    width,
    height,
    before,
    after,
    changed,
    count
  }
  edit.dirtyRect = { x: dirtyLeft, y: dirtyTop, width: dirtyRight - dirtyLeft, height: dirtyBottom - dirtyTop }
  return edit
}

/** Applies one gradient as a single undoable pixel edit. */
export const applyGradient = (
  document: SpriteDocument,
  layer: RasterLayer,
  start: { x: number; y: number },
  end: { x: number; y: number },
  startColor: RgbaColor,
  endColor: RgbaColor,
  selection?: SelectionMask | null,
  dither: GradientDither = 'none',
  paintRegion?: SelectionMask | null,
  type: GradientType = 'linear',
  geometryOptions: GradientGeometryOptions = {},
  gradientStops?: readonly GradientStop[]
): PixelEdit | null => {
  if (paintRegion === null || isLayerEffectivelyLocked(document, layer)) return null
  const left = Math.ceil(Math.max(0, selection?.x ?? 0, paintRegion?.x ?? 0))
  const top = Math.ceil(Math.max(0, selection?.y ?? 0, paintRegion?.y ?? 0))
  const right = Math.min(document.width, selection ? selection.x + selection.width : document.width, paintRegion ? paintRegion.x + paintRegion.width : document.width)
  const bottom = Math.min(document.height, selection ? selection.y + selection.height : document.height, paintRegion ? paintRegion.y + paintRegion.height : document.height)
  if (right <= left || bottom <= top) return null
  if (!expandLayerToRect(layer, left, top, right, bottom)) return null
  const sampleColor = createGradientColorSampler(startColor, endColor, start, end, dither, type, geometryOptions, gradientStops)
  const edit = beginPixelEdit(layer.id)
  if ((right - left) * (bottom - top) >= DENSE_GRADIENT_MIN_PIXELS) {
    return applyDenseGradient(document, layer, edit, left, top, right, bottom, sampleColor, selection, paintRegion)
  }
  for (let y = top; y < bottom; y += 1) for (let x = left; x < right; x += 1) {
    if (selection && !selectionContains(selection, x, y)) continue
    if (paintRegion && !selectionContains(paintRegion, x, y)) continue
    const index = layerIndexAt(layer, x, y)
    if (index === null) continue
    const color = sampleColor(x, y)
    recordPixel(document, layer, edit, index, gradientPaintValue(document, layer, index, color))
  }
  return edit.before.size > 0 ? edit : null
}
