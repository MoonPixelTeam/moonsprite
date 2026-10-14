import type { GradientDither, GradientStop, GradientType } from '@shared/types-brush'
import type { RasterLayer } from '@shared/types-layer'
import type { RgbaColor } from '@shared/types-color'
import type { SelectionMask } from '@shared/types-selection'
import type { SpriteDocument } from '@shared/types-document'
import { beginPixelEdit, preparePixelEdit, recordPixel, type PixelEdit } from './history'
import { cacheRasterContentBounds, expandLayerToRect, getLayerStorageOrigin, isLayerEffectivelyLocked, isLayerMask, layerIndexAt, markLayerContentChanged, normalizeLayerPackedValue, paletteColorIdForCanvas, rasterContentBounds, readLayerColor, readLayerPacked, writeLayerPacked } from './document-model'
import { blendOver, packColor } from './raster'
import { magicWandSelection, selectionContains, type MagicWandRegionOptions } from './selection'
import { createGradientColorSampler, normalizeGradientStops, resolveRadialGradientGeometry, type GradientGeometryOptions } from './gradient-color'
import { createLinearDitherPreviewSampler } from './gradient-dither-preview'

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
  contiguous = true,
  options?: MagicWandRegionOptions
): SelectionMask | null => magicWandSelection(document, layer, start.x, start.y, tolerance, contiguous, 0, options)

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

const createOpaqueRgbaGradientSampler = (
  document: SpriteDocument,
  layer: RasterLayer,
  startColor: RgbaColor,
  endColor: RgbaColor,
  start: { x: number; y: number },
  end: { x: number; y: number },
  dither: GradientDither,
  type: GradientType,
  geometryOptions: GradientGeometryOptions,
  gradientStops?: readonly GradientStop[]
): ((x: number, y: number) => number) | null => {
  if (document.colorMode !== 'rgba' || layer.format !== 'rgba' || isLayerMask(layer) || dither !== 'none') return null
  const stops = normalizeGradientStops(gradientStops, startColor, endColor)
  if (stops.some((stop) => stop.color.a !== 255)) return null
  const packedStops = stops.map((stop) => packColor(stop.color))
  const packedForAmount = (amount: number): number => {
    if (amount <= stops[0].position) return packedStops[0]
    const lastIndex = stops.length - 1
    if (amount >= stops[lastIndex].position) return packedStops[lastIndex]
    let rightIndex = 1
    while (rightIndex < stops.length && stops[rightIndex].position < amount) rightIndex += 1
    const left = stops[rightIndex - 1]
    const right = stops[rightIndex]
    const span = right.position - left.position
    const progress = span === 0 ? 0 : (amount - left.position) / span
    const red = Math.round(left.color.r + (right.color.r - left.color.r) * progress)
    const green = Math.round(left.color.g + (right.color.g - left.color.g) * progress)
    const blue = Math.round(left.color.b + (right.color.b - left.color.b) * progress)
    return (red | (green << 8) | (blue << 16) | 0xff000000) >>> 0
  }
  if (type === 'radial') {
    const geometry = resolveRadialGradientGeometry(start, end, geometryOptions)
    return (x, y) => {
      if (geometry.radiusX === 0 && geometry.radiusY === 0) return packedForAmount(0)
      const distanceX = Math.abs(x - geometry.center.x)
      const distanceY = Math.abs(y - geometry.center.y)
      const normalizedX = geometry.radiusX === 0 ? (distanceX === 0 ? 0 : Number.POSITIVE_INFINITY) : distanceX / geometry.radiusX
      const normalizedY = geometry.radiusY === 0 ? (distanceY === 0 ? 0 : Number.POSITIVE_INFINITY) : distanceY / geometry.radiusY
      return packedForAmount(Math.max(0, Math.min(1, Math.hypot(normalizedX, normalizedY))))
    }
  }
  const deltaX = end.x - start.x
  const deltaY = end.y - start.y
  const lengthSquared = deltaX * deltaX + deltaY * deltaY
  if (lengthSquared === 0) return () => packedForAmount(0)
  return (x, y) => packedForAmount(Math.max(0, Math.min(1, ((x - start.x) * deltaX + (y - start.y) * deltaY) / lengthSquared)))
}

const applyDenseGradient = (
  document: SpriteDocument,
  layer: RasterLayer,
  edit: PixelEdit,
  left: number,
  top: number,
  right: number,
  bottom: number,
  sampleColor: (x: number, y: number) => RgbaColor,
  samplePacked: ((x: number, y: number) => number) | null,
  sampleRow: ((y: number, target: Uint32Array, offset: number) => void) | null,
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
  const localLeft = left - layer.offsetX
  const localTop = top - layer.offsetY
  const unmasked = !selection?.mask && !paintRegion?.mask
  const fullyTransparentRgba = Boolean((samplePacked || sampleRow) && rgbaWords && unmasked && rasterContentBounds(layer, document.palette) === null)

  preparePixelEdit(document, edit)
  if (fullyTransparentRgba) {
    markLayerContentChanged(layer)
    changed.fill(1)
    for (let localY = 0; localY < height; localY += 1) {
      const layerStart = (localTop + localY) * layer.width + localLeft
      const denseStart = localY * width
      before.set(rgbaWords!.subarray(layerStart, layerStart + width), denseStart)
      if (sampleRow) {
        sampleRow(top + localY, after, denseStart)
        rgbaWords!.set(after.subarray(denseStart, denseStart + width), layerStart)
        continue
      }
      for (let localX = 0; localX < width; localX += 1) {
        const next = samplePacked!(left + localX, top + localY)
        after[denseStart + localX] = next
        rgbaWords![layerStart + localX] = next
      }
    }
    edit.denseRegion = {
      x: left - layer.offsetX + storageOrigin.x,
      y: top - layer.offsetY + storageOrigin.y,
      width,
      height,
      before,
      after,
      changed,
      count: width * height
    }
    cacheRasterContentBounds(layer, document.palette, { x: localLeft, y: localTop, width, height })
    edit.dirtyRect = { x: left, y: top, width, height }
    return edit
  }
  const rowPixels = sampleRow ? new Uint32Array(width) : null
  for (let y = top; y < bottom; y += 1) {
    if (sampleRow) sampleRow(y, rowPixels!, 0)
    for (let x = left; x < right; x += 1) {
      const index = (y - layer.offsetY) * layer.width + x - layer.offsetX
      const current = rgbaWords ? rgbaWords[index] : readLayerPacked(document, layer, index)
      const denseOffset = (y - top) * width + x - left
      // History restores the entire dense rectangle, including selected pixels
      // whose gradient value is already correct or whose source is transparent.
      before[denseOffset] = current
      after[denseOffset] = current
      const selected = (!selection?.mask || selectionContains(selection, x, y))
        && (!paintRegion?.mask || selectionContains(paintRegion, x, y))
      // Dense history patches cover the complete rectangle. Preserve untouched
      // pixels too, otherwise undo/redo writes zeroes outside a masked region.
      if (!selected) {
        continue
      }
      const next = rowPixels ? rowPixels[x - left] : samplePacked
        ? samplePacked(x, y)
        : normalizeLayerPackedValue(document, layer, gradientPaintValue(document, layer, index, sampleColor(x, y)))
      if (current === next) continue
      if (count === 0) markLayerContentChanged(layer)
      after[denseOffset] = next
      changed[denseOffset] = 1
      count += 1
      if (x < dirtyLeft) dirtyLeft = x
      if (y < dirtyTop) dirtyTop = y
      if (x + 1 > dirtyRight) dirtyRight = x + 1
      if (y + 1 > dirtyBottom) dirtyBottom = y + 1
      if (rgbaWords) rgbaWords[index] = next
      else writeLayerPacked(document, layer, index, next)
    }
  }
  if (count === 0) return null
  if ((samplePacked || sampleRow) && unmasked && localLeft === 0 && localTop === 0 && width === layer.width && height === layer.height) {
    cacheRasterContentBounds(layer, document.palette, { x: 0, y: 0, width, height })
  }
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
  const sparseBlank = layer.width === 1 && layer.height === 1 && (layer.format === 'rgba' ? layer.pixels[3] === 0 : layer.pixels[0] === 0)
  const originalWidth = layer.width
  const originalHeight = layer.height
  const originalOffsetX = layer.offsetX
  const originalOffsetY = layer.offsetY
  if (!expandLayerToRect(layer, left, top, right, bottom)) return null
  const restoreEmptyExpansion = (): void => {
    if (!sparseBlank) return
    layer.width = originalWidth
    layer.height = originalHeight
    layer.offsetX = originalOffsetX
    layer.offsetY = originalOffsetY
    layer.pixels = layer.format === 'rgba' ? new Uint8ClampedArray([0, 0, 0, 0]) : new Uint32Array([0])
  }
  const sampleColor = createGradientColorSampler(startColor, endColor, start, end, dither, type, geometryOptions, gradientStops)
  const samplePacked = createOpaqueRgbaGradientSampler(document, layer, startColor, endColor, start, end, dither, type, geometryOptions, gradientStops)
  const edit = beginPixelEdit(layer.id)
  if ((right - left) * (bottom - top) >= DENSE_GRADIENT_MIN_PIXELS) {
    const sampleRow = type === 'linear' && dither !== 'none' && document.colorMode === 'rgba' && layer.format === 'rgba' && !isLayerMask(layer)
      && normalizeGradientStops(gradientStops, startColor, endColor).every(stop => stop.color.a === 255)
      ? createLinearDitherPreviewSampler(startColor, endColor, start, end, dither, left, right, gradientStops).writeSourceRow : null
    const denseEdit = applyDenseGradient(document, layer, edit, left, top, right, bottom, sampleColor, samplePacked, sampleRow, selection, paintRegion)
    if (!denseEdit) restoreEmptyExpansion()
    return denseEdit
  }
  for (let y = top; y < bottom; y += 1) for (let x = left; x < right; x += 1) {
    if (selection?.mask && !selectionContains(selection, x, y)) continue
    if (paintRegion?.mask && !selectionContains(paintRegion, x, y)) continue
    const index = layerIndexAt(layer, x, y)
    if (index === null) continue
    const color = sampleColor(x, y)
    recordPixel(document, layer, edit, index, gradientPaintValue(document, layer, index, color))
  }
  if (edit.before.size > 0) return edit
  restoreEmptyExpansion()
  return null
}
