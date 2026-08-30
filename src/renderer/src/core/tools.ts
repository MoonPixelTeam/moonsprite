import type { AnimationCelSurface, BrushDitherSettings, BrushPaintMode, BrushShape, BrushTexture, GradientDither, ImageBrush, ImageBrushSettings, OutlineDirections, OutlineKernel, OutlinePosition, RasterLayer, RgbaColor, SelectionMask, SelectionQuad, SelectionRect, ShapeKind, SpriteDocument, TileRepeatMode } from '@shared/types'
import { compositeRegion, ensureLayerCoversCanvas, expandLayerToRect, getActiveLayer, getLayer, getLayerStorageOrigin, getPaletteEntry, isLayerEffectivelyLocked, layerContentBounds, layerIndexAt, layerIndexAtStoragePoint, markLayerContentChanged, normalizeLayerPackedValue, paletteColorIdForCanvas, readLayerColor, readLayerColorAt, readLayerPacked, readLayerPackedAt, writeLayerPacked, writeLayerPackedRun } from './document'
import { beginPixelEdit, preparePixelEdit, recordPixel, recordPixelKnownCurrent, type PixelEdit } from './history'
import { blendOver, isInBounds, packColor, pixelIndex, unpackColor } from './raster'
import { flipSelectionMask, lassoSelection, packedColorMatchesTolerance, polygonSelection, rasterLinePoints, rotatedEllipseSelection, rotatedRectSelection, rotatedSelectionBounds, roundedRectContainsPoint, roundedRectRadius, selectionContains, selectionQuadBounds, selectionQuadPoint, selectionQuadSourcePoint, selectionQuadTransformFor, transformedSelectionBounds, transformedSelectionDestinationPoint, transformedSelectionSourcePoint, type SelectionFlipAxis, type SelectionShearTransform } from './selection'
import { proceduralBrushCoverageAt } from './brushes'
import { balancedStairLinePoints } from './pixel-line'
import { hasSymmetry, symmetryPoints, symmetrySelectionDragRegion, type SymmetryAxes, type SymmetryCenter, type SymmetryPoint } from './symmetry'
import { brushDitherContains, gradientColorForAmount, interpolateRgbaColor } from './gradient-color'
import { readSurfacePackedRegion } from './runtime-raster'
import { allOutlineDirections, DEFAULT_OUTLINE_SMART_HUE_DARKNESS, outlineDirectionForOffset, outlineKernelContainsOffset, resolveOutlineStrokeColor } from './outline-settings'
import { tileRepeatRectSegments, wrapDocumentPointForTileRepeat } from './tilemap'
import { contiguousMatchingRegion } from './contiguous-region'

const paintLayerValue = (
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

const layerColorBeforeEdit = (document: SpriteDocument, layer: RasterLayer, edit: PixelEdit, index: number): RgbaColor => {
  const original = brushPaintBaselineByEdit.get(edit)?.get(index) ?? edit.before.get(index)
  if (original === undefined) return readLayerColor(document, layer, index)
  return layer.format === 'rgba' ? unpackColor(original) : getPaletteEntry(document, original).color
}

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

const BRUSH_COVERAGE_CHUNK_BITS = 12
const BRUSH_COVERAGE_CHUNK_SIZE = 1 << BRUSH_COVERAGE_CHUNK_BITS
const BRUSH_COVERAGE_CHUNK_MASK = BRUSH_COVERAGE_CHUNK_SIZE - 1
const brushCoverageByEdit = new WeakMap<PixelEdit, Map<string, BrushCoverageChunks>>()
const brushPaintBaselineByEdit = new WeakMap<PixelEdit, Map<number, number>>()
const lastBrushStampByEdit = new WeakMap<PixelEdit, BrushStampState>()
const EDIT_EXPANSION_PADDING = 64

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
}

const ensureLayerCoversEditRect = (document: SpriteDocument, layer: RasterLayer, edit: PixelEdit, rect: SelectionRect, padding = EDIT_EXPANSION_PADDING): boolean => {
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

const symmetricRect = (
  document: SpriteDocument,
  rect: SelectionRect,
  axes?: SymmetryAxes,
  center?: SymmetryCenter,
  tileRepeatMode: TileRepeatMode = 'off'
): SelectionRect => {
  const corners = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width - 1, y: rect.y },
    { x: rect.x, y: rect.y + rect.height - 1 },
    { x: rect.x + rect.width - 1, y: rect.y + rect.height - 1 }
  ]
  const points = corners.flatMap((point) => symmetryPoints(point, document.width, document.height, axes, center, tileRepeatMode === 'off'))
  if (points.length === 0) return rect
  const left = Math.min(...points.map((point) => point.x))
  const top = Math.min(...points.map((point) => point.y))
  const right = Math.max(...points.map((point) => point.x)) + 1
  const bottom = Math.max(...points.map((point) => point.y)) + 1
  const symmetric = { x: left, y: top, width: right - left, height: bottom - top }
  if (tileRepeatMode === 'off') return symmetric
  const segments = tileRepeatRectSegments(symmetric, document.width, document.height, tileRepeatMode)
  if (segments.length === 0) return symmetric
  const wrappedLeft = Math.min(...segments.map((segment) => segment.x))
  const wrappedTop = Math.min(...segments.map((segment) => segment.y))
  const wrappedRight = Math.max(...segments.map((segment) => segment.x + segment.width))
  const wrappedBottom = Math.max(...segments.map((segment) => segment.y + segment.height))
  return { x: wrappedLeft, y: wrappedTop, width: wrappedRight - wrappedLeft, height: wrappedBottom - wrappedTop }
}

const claimBrushCoverage = (edit: PixelEdit, key: string, index: number, coverageValue: number, replaceEqual = false): boolean => {
  let coverageByKey = brushCoverageByEdit.get(edit)
  if (!coverageByKey) {
    coverageByKey = new Map()
    brushCoverageByEdit.set(edit, coverageByKey)
  }
  let coverageRecord = coverageByKey.get(key)
  if (!coverageRecord) {
    coverageRecord = { chunks: new Map() }
    coverageByKey.set(key, coverageRecord)
  }
  const chunkIndex = index >> BRUSH_COVERAGE_CHUNK_BITS
  let chunk = coverageRecord.chunks.get(chunkIndex)
  if (!chunk) { chunk = new Uint16Array(BRUSH_COVERAGE_CHUNK_SIZE); coverageRecord.chunks.set(chunkIndex, chunk) }
  const offset = index & BRUSH_COVERAGE_CHUNK_MASK
  const previousCoverage = chunk[offset] - 1
  if (previousCoverage > coverageValue || (!replaceEqual && previousCoverage === coverageValue)) return false
  chunk[offset] = coverageValue + 1
  return true
}

export function inheritBrushPaintBaseline(edit: PixelEdit, baseline: ReadonlyMap<number, number>): void {
  brushPaintBaselineByEdit.set(edit, new Map(baseline))
}

export const normalizeSelection = (startX: number, startY: number, endX: number, endY: number): SelectionRect => ({
  x: Math.min(startX, endX),
  y: Math.min(startY, endY),
  width: Math.abs(endX - startX) + 1,
  height: Math.abs(endY - startY) + 1
})

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

export function paintSquare(
  document: SpriteDocument,
  layer: RasterLayer,
  edit: PixelEdit,
  x: number,
  y: number,
  size: number,
  color: RgbaColor,
  selection?: SelectionMask | null
): void {
  const radiusBefore = Math.floor(size / 2)
  const radiusAfter = size - radiusBefore - 1
  if (!ensureLayerCoversEditRect(document, layer, edit, { x: x - radiusBefore, y: y - radiusBefore, width: size, height: size })) return
  for (let py = y - radiusBefore; py <= y + radiusAfter; py += 1) {
    for (let px = x - radiusBefore; px <= x + radiusAfter; px += 1) {
      if (!isInBounds(document.width, document.height, px, py)) continue
      if (selection && !insideSelection(selection, px, py)) continue
      const index = layerIndexAt(layer, px, py)
      if (index === null) continue
      recordPixel(document, layer, edit, index, paintLayerValue(document, layer, edit, index, color))
    }
  }
}

export interface BrushGradientSample {
  startColor: RgbaColor
  endColor: RgbaColor
  gradientAmount: number
  dither: GradientDither
}

/** Whether a dynamic gradient needs true source-over compositing. */
const gradientHasTransparentStop = (gradient: BrushGradientSample | undefined): boolean => Boolean(
  gradient && (gradient.startColor.a < 255 || gradient.endColor.a < 255)
)

export interface BrushLineGradient {
  startColor: RgbaColor
  endColor: RgbaColor
  fromAmount: number
  toAmount: number
  dither: GradientDither
}

const brushGradientCoverageKey = (gradient: BrushGradientSample): string => {
  const start = gradient.startColor
  const end = gradient.endColor
  return `paint:brush-gradient:${start.r},${start.g},${start.b},${start.a}:${end.r},${end.g},${end.b},${end.a}:${gradient.dither}`
}

export function paintBrush(
  document: SpriteDocument,
  layer: RasterLayer,
  edit: PixelEdit,
  x: number,
  y: number,
  size: number,
  color: RgbaColor,
  shape: BrushShape,
  selection?: SelectionMask | null,
  texture: BrushTexture = 'solid',
  textureScale = 1,
  imageBrush: ImageBrush | null = null,
  imageBrushSettings?: ImageBrushSettings,
  proceduralAntialiasStrength = 0,
  brushPaintMode: BrushPaintMode = 'paint',
  patternOrigin?: { x: number; y: number },
  symmetryAxes?: SymmetryAxes,
  symmetryCenter?: SymmetryCenter,
  colorReplacement?: { source: RgbaColor; target: RgbaColor },
  opacityScale = 1,
  coverageKey?: string,
  overrideImageBrushColor = false,
  gradient?: BrushGradientSample,
  tileRepeatMode: TileRepeatMode = 'off',
  brushDither?: BrushDitherSettings,
  angle = 0
): void {
  const normalizedOpacityScale = Math.max(0, Math.min(1, Number.isFinite(opacityScale) ? opacityScale : 1))
  if (normalizedOpacityScale <= 0) return
  const recordedPixelCount = edit.before.size
  const stamp = brushStampDimensions(size, imageBrush, angle)
  const { x: beforeX, y: beforeY } = brushStampAnchor(size, imageBrush, angle)
  const stampX = x - beforeX
  const stampY = y - beforeY
  const footprint = symmetricRect(document, { x: stampX, y: stampY, width: stamp.width, height: stamp.height }, symmetryAxes, symmetryCenter, tileRepeatMode)
  if (!ensureLayerCoversEditRect(document, layer, edit, footprint)) return
  const offsets = brushMaskOffsets(size, shape, texture, textureScale, stampX, stampY, imageBrush, imageBrushSettings, proceduralAntialiasStrength, brushPaintMode, patternOrigin?.x ?? stampX, patternOrigin?.y ?? stampY, brushDither, angle)
  const solidStampKey = tileRepeatMode === 'off' && !selection && !imageBrush && texture === 'solid' && !brushDither?.enabled && normalizedOpacityScale === 1 && !colorReplacement && !gradient && !coverageKey && !hasSymmetry(symmetryAxes) && (color.a === 0 || color.a === 255)
    ? `${shape}:${stamp.width}x${stamp.height}:${color.a === 0 ? 'erase' : packColor(color)}`
    : null
  const solidPackedValue = solidStampKey
    ? color.a === 0
      ? 0
      : layer.format === 'rgba'
        ? packColor(color)
        : paletteColorIdForCanvas(document, color)
    : null
  let occupancy: Uint8Array | null = null
  const previousStamp = solidStampKey ? lastBrushStampByEdit.get(edit) : undefined
  if (solidStampKey) {
    const occupancyKey = `${shape}:${stamp.width}x${stamp.height}`
    occupancy = solidBrushOccupancyCache.get(occupancyKey) ?? null
    if (!occupancy) {
      occupancy = new Uint8Array(stamp.width * stamp.height)
      for (const offset of offsets) occupancy[offset.y * stamp.width + offset.x] = 1
      if (solidBrushOccupancyCache.size >= 16) solidBrushOccupancyCache.delete(solidBrushOccupancyCache.keys().next().value!)
      solidBrushOccupancyCache.set(occupancyKey, occupancy)
    }
  }
  if (solidPackedValue !== null) {
    preparePixelEdit(document, edit)
    const packedValue = normalizeLayerPackedValue(document, layer, solidPackedValue)
    const packedPixels = layer.format === 'rgba' && layer.pixels.byteOffset % 4 === 0
      ? new Uint32Array(layer.pixels.buffer as ArrayBuffer, layer.pixels.byteOffset, layer.pixels.byteLength / 4)
      : null
    let changed = false
    let storageChanged = false
    let dirtyLeft = Number.POSITIVE_INFINITY
    let dirtyTop = Number.POSITIVE_INFINITY
    let dirtyRight = Number.NEGATIVE_INFINITY
    let dirtyBottom = Number.NEGATIVE_INFINITY
    for (const offset of offsets) {
      if (offset.coverage === 0) continue
      const px = stampX + offset.x
      const py = stampY + offset.y
      if (previousStamp?.key === solidStampKey) {
        const previousLocalX = px - previousStamp.stampX
        const previousLocalY = py - previousStamp.stampY
        if (previousLocalX >= 0 && previousLocalY >= 0 && previousLocalX < previousStamp.width && previousLocalY < previousStamp.height && previousStamp.occupied[previousLocalY * previousStamp.width + previousLocalX]) continue
      }
      const index = layerIndexAt(layer, px, py)
      if (index === null || edit.before.has(index)) continue
      const current = layer.format === 'indexed' ? layer.pixels[index] : packedPixels ? packedPixels[index] : readLayerPacked(document, layer, index)
      if (current === packedValue) continue
      // A loaded layer may still use sparse runtime storage. Materialize it
      // before the first direct write so the write is not lost in the
      // placeholder pixel buffer when the runtime storage is detached.
      if (!storageChanged) {
        markLayerContentChanged(layer)
        storageChanged = true
      }
      edit.before.set(index, current)
      edit.after.set(index, packedValue)
      if (layer.format === 'indexed') layer.pixels[index] = packedValue
      else if (packedPixels) packedPixels[index] = packedValue
      else writeLayerPacked(document, layer, index, packedValue)
      changed = true
      dirtyLeft = Math.min(dirtyLeft, px)
      dirtyTop = Math.min(dirtyTop, py)
      dirtyRight = Math.max(dirtyRight, px + 1)
      dirtyBottom = Math.max(dirtyBottom, py + 1)
    }
    if (changed) {
      const currentDirty = edit.dirtyRect
      if (!currentDirty) edit.dirtyRect = { x: dirtyLeft, y: dirtyTop, width: dirtyRight - dirtyLeft, height: dirtyBottom - dirtyTop }
      else {
        const left = Math.min(currentDirty.x, dirtyLeft)
        const top = Math.min(currentDirty.y, dirtyTop)
        const right = Math.max(currentDirty.x + currentDirty.width, dirtyRight)
        const bottom = Math.max(currentDirty.y + currentDirty.height, dirtyBottom)
        currentDirty.x = left
        currentDirty.y = top
        currentDirty.width = right - left
        currentDirty.height = bottom - top
      }
    }
    if (occupancy && solidStampKey) lastBrushStampByEdit.set(edit, { key: solidStampKey, stampX, stampY, width: stamp.width, height: stamp.height, occupied: occupancy })
    return
  }
  for (const offset of offsets) {
    const scaledCoverage = Math.round(offset.coverage * normalizedOpacityScale)
    if (scaledCoverage === 0) continue
    const sourcePoint = { x: x - beforeX + offset.x, y: y - beforeY + offset.y }
    if (solidStampKey && previousStamp?.key === solidStampKey) {
      const previousLocalX = sourcePoint.x - previousStamp.stampX
      const previousLocalY = sourcePoint.y - previousStamp.stampY
      if (previousLocalX >= 0 && previousLocalY >= 0 && previousLocalX < previousStamp.width && previousLocalY < previousStamp.height && previousStamp.occupied[previousLocalY * previousStamp.width + previousLocalX]) continue
    }
    for (const destination of symmetryPoints(sourcePoint, document.width, document.height, symmetryAxes, symmetryCenter, tileRepeatMode === 'off')) {
      const { x: px, y: py } = wrapDocumentPointForTileRepeat(destination, document.width, document.height, tileRepeatMode)
      if (!isInBounds(document.width, document.height, px, py)) continue
      if (selection && !insideSelection(selection, px, py)) continue
      const index = layerIndexAt(layer, px, py)
      if (index === null) continue
      if (colorReplacement) {
        const current = layerColorBeforeEdit(document, layer, edit, index)
        const source = colorReplacement.source
        if (current.r !== source.r || current.g !== source.g || current.b !== source.b || current.a !== source.a) continue
        const target = colorReplacement.target
        const coverageKey = `replace:${source.r},${source.g},${source.b},${source.a}:${target.r},${target.g},${target.b},${target.a}`
        if (!claimBrushCoverage(edit, coverageKey, index, scaledCoverage)) continue
        const coverage = scaledCoverage / 255
        const replacement = scaledCoverage === 255 ? target : {
          r: Math.round(current.r + (target.r - current.r) * coverage),
          g: Math.round(current.g + (target.g - current.g) * coverage),
          b: Math.round(current.b + (target.b - current.b) * coverage),
          a: Math.round(current.a + (target.a - current.a) * coverage)
        }
        recordPixel(document, layer, edit, index, layer.format === 'rgba'
          ? packColor(replacement)
          : replacement.a === 0 ? 0 : paletteColorIdForCanvas(document, replacement))
        continue
      }
      const resolvedColor = gradient
        ? gradientColorForAmount(gradient.startColor, gradient.endColor, gradient.gradientAmount, px, py, gradient.dither)
        : color
      const paintColor = offset.color && !overrideImageBrushColor && !gradient
        ? offset.color
        : offset.color
          ? { ...resolvedColor, a: Math.round(resolvedColor.a * offset.color.a / 255) }
          : resolvedColor
      const paintCoverageKey = coverageKey ?? (gradient
        ? brushGradientCoverageKey(gradient)
        : color.a === 0
        ? 'erase'
        : `paint:${paintColor.r},${paintColor.g},${paintColor.b},${paintColor.a}`)
      const eraseResolvedColor = !gradient && color.a === 0
      const sourceOverGradient = gradientHasTransparentStop(gradient) || Boolean(gradient && paintColor.a === 0)
      const overwriteImageBrushPixel = imageBrush?.intrinsicSize === true
        && brushPaintMode === 'paint'
        && !eraseResolvedColor
        // A gradient with a transparent stop must blend over the current
        // destination, including for intrinsic image brushes. Direct
        // replacement would let a lower-pressure crossing erase the earlier
        // part of the same stroke.
        && !sourceOverGradient
      if (!overwriteImageBrushPixel && !claimBrushCoverage(edit, paintCoverageKey, index, scaledCoverage, coverageKey !== undefined || gradient !== undefined)) continue
      if (eraseResolvedColor) {
        const eraseCoverage = offset.color ? Math.round(scaledCoverage * offset.color.a / 255) : scaledCoverage
        if (eraseCoverage === 0) continue
        if (eraseCoverage === 255) recordPixel(document, layer, edit, index, 0)
        else {
          const base = layerColorBeforeEdit(document, layer, edit, index)
          const erased = { ...base, a: Math.round(base.a * (1 - eraseCoverage / 255)) }
          recordPixel(document, layer, edit, index, layer.format === 'rgba' ? packColor(erased) : erased.a === 0 ? 0 : paletteColorIdForCanvas(document, erased))
        }
      } else {
        const stamped = scaledCoverage === 255 ? paintColor : { ...paintColor, a: Math.round(paintColor.a * scaledCoverage / 255) }
        const next = overwriteImageBrushPixel
          ? layer.format === 'rgba'
            ? packColor(stamped)
            : stamped.a === 0 ? 0 : paletteColorIdForCanvas(document, stamped)
          : paintLayerValue(document, layer, edit, index, stamped, gradient !== undefined, sourceOverGradient)
        recordPixel(document, layer, edit, index, next)
      }
    }
  }
  if (solidStampKey && occupancy) lastBrushStampByEdit.set(edit, { key: solidStampKey, stampX, stampY, width: stamp.width, height: stamp.height, occupied: occupancy })
  else lastBrushStampByEdit.delete(edit)
  if (edit.before.size > recordedPixelCount) markLayerContentChanged(layer)
}

export interface BrushLineDynamics {
  fromSize?: number
  toSize?: number
  fromOpacityScale?: number
  toOpacityScale?: number
  fromColor?: RgbaColor
  toColor?: RgbaColor
  gradient?: BrushLineGradient
  coverageKey?: string
  overrideImageBrushColor?: boolean
  fromAngle?: number
  toAngle?: number
}

export interface BrushMaskPoint { x: number; y: number; coverage: number; color?: RgbaColor }

/** Interpolates signed brush angles through the shortest turn. */
export function interpolateBrushAngle(from: number, to: number, progress: number): number {
  const delta = ((to - from + 540) % 360) - 180
  return from + delta * progress
}

/** Selects the brush centers shared by geometric-path previews and commits. */
export function brushPathStampPoints(
  points: readonly { x: number; y: number }[],
  size: number,
  imageBrush: ImageBrush | null = null
): Array<{ x: number; y: number }> {
  if (points.length === 0) return []
  const stamp = brushStampDimensions(size, imageBrush)
  const stampSpacing = Math.max(1, Math.floor(Math.max(stamp.width, stamp.height) / 16))
  const centers: Array<{ x: number; y: number }> = []
  let stepsSinceStamp = 0
  for (let index = 0; index < points.length; index += 1) {
    if (index > 0) stepsSinceStamp += 1
    if (index !== 0 && index !== points.length - 1 && stepsSinceStamp < stampSpacing) continue
    centers.push({ x: Math.round(points[index].x), y: Math.round(points[index].y) })
    stepsSinceStamp = 0
  }
  return centers
}

/** The footprint shared by painting and the canvas preview. */
export function brushStampDimensions(size: number, imageBrush: ImageBrush | null = null, angle = 0): { width: number; height: number } {
  const base = imageBrush?.intrinsicSize
    ? { width: Math.max(1, imageBrush.width), height: Math.max(1, imageBrush.height) }
    : { width: Math.max(1, Math.round(size)), height: Math.max(1, Math.round(size)) }
  if (!imageBrush || Math.abs(angle % 360) < 0.0001) return base
  const radians = angle * Math.PI / 180
  const cosine = Math.abs(Math.cos(radians))
  const sine = Math.abs(Math.sin(radians))
  return {
    width: Math.max(1, Math.ceil(base.width * cosine + base.height * sine - 1e-9)),
    height: Math.max(1, Math.ceil(base.width * sine + base.height * cosine - 1e-9))
  }
}

/** The pointer pixel inside a brush stamp. Even dimensions use the lower-right center pixel. */
export function brushStampAnchor(size: number, imageBrush: ImageBrush | null = null, angle = 0): { x: number; y: number } {
  const stamp = brushStampDimensions(size, imageBrush, angle)
  return { x: Math.floor(stamp.width / 2), y: Math.floor(stamp.height / 2) }
}

/** Returns the live-composite regions covered by a brush segment and all of its symmetry copies. */
export function brushStrokeInvalidationRects(
  from: { x: number; y: number },
  to: { x: number; y: number },
  size: number,
  imageBrush: ImageBrush | null,
  documentWidth: number,
  documentHeight: number,
  axes?: SymmetryAxes,
  center?: SymmetryCenter,
  tileRepeatMode: TileRepeatMode = 'off',
  angle = 0
): SelectionRect[] {
  const stamp = brushStampDimensions(size, imageBrush, angle)
  const anchor = brushStampAnchor(size, imageBrush, angle)
  const afterX = stamp.width - anchor.x - 1
  const afterY = stamp.height - anchor.y - 1
  const symmetric = hasSymmetry(axes)
  const swapsAxes = Boolean(axes?.diagonalDown || axes?.diagonalUp || axes?.rotational)
  const radiusX = Math.max(anchor.x, afterX)
  const radiusY = Math.max(anchor.y, afterY)
  const reflectedRadius = Math.max(radiusX, radiusY)
  const beforeX = symmetric ? swapsAxes ? reflectedRadius : radiusX : anchor.x
  const beforeY = symmetric ? swapsAxes ? reflectedRadius : radiusY : anchor.y
  const trailingX = symmetric ? beforeX : afterX
  const trailingY = symmetric ? beforeY : afterY
  const fromPoints = symmetryPoints(from, documentWidth, documentHeight, axes, center, false)
  const toPoints = symmetryPoints(to, documentWidth, documentHeight, axes, center, false)
  const segments = fromPoints.length === toPoints.length
    ? fromPoints.map((start, index) => ({ start, end: toPoints[index] }))
    : fromPoints.flatMap((start) => toPoints.map((end) => ({ start, end })))
  const regions = new Map<string, SelectionRect>()
  for (const segment of segments) {
    const left = Math.min(segment.start.x, segment.end.x) - beforeX
    const top = Math.min(segment.start.y, segment.end.y) - beforeY
    const right = Math.max(segment.start.x, segment.end.x) + trailingX + 1
    const bottom = Math.max(segment.start.y, segment.end.y) + trailingY + 1
    for (const rect of tileRepeatRectSegments(
      { x: left, y: top, width: right - left, height: bottom - top },
      documentWidth,
      documentHeight,
      tileRepeatMode
    )) regions.set(`${rect.x}:${rect.y}:${rect.width}:${rect.height}`, rect)
  }
  return [...regions.values()]
}

const orderedDither4x4 = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5
]

// Colored image brushes preserve source RGBA pixels. Coverage conversion remains
// only for legacy mask brushes and built-in procedural fill textures.
const defaultImageBrushSettings: ImageBrushSettings = { mode: 'dither', threshold: 128, blackPoint: 0, whitePoint: 255, invert: false }
const imageBrushMaskCache = new WeakMap<ImageBrush, Map<string, BrushMaskPoint[]>>()
const solidBrushMaskCache = new Map<string, BrushMaskPoint[]>()
const solidBrushOccupancyCache = new Map<string, Uint8Array>()
const wrappedIndex = (value: number, length: number): number => ((value % length) + length) % length

const imageBrushCoverage = (sourceCoverage: number, x: number, y: number, settings: ImageBrushSettings = defaultImageBrushSettings, antialiasStrength = 0): number => {
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

const imageBrushCacheKey = (imageBrush: ImageBrush, size: number, settings: ImageBrushSettings = defaultImageBrushSettings, antialiasStrength = 0, paintMode: BrushPaintMode = 'paint', originX = 0, originY = 0, patternOriginX = originX, patternOriginY = originY, angle = 0): string => {
  const procedural = imageBrush.proceduralSettings
  const proceduralKey = procedural ? `${procedural.seed}:${procedural.scale}:${procedural.detail}:${procedural.variation}:${procedural.angle}` : ''
  const dimensions = brushStampDimensions(size, imageBrush, angle)
  const originKey = paintMode !== 'paint'
    ? `${wrappedIndex(originX, imageBrush.width)}:${wrappedIndex(originY, imageBrush.height)}:${wrappedIndex(patternOriginX, imageBrush.width)}:${wrappedIndex(patternOriginY, imageBrush.height)}`
    : ''
  return `${dimensions.width}x${dimensions.height}:${settings.mode}:${settings.threshold}:${settings.blackPoint}:${settings.whitePoint}:${settings.invert ? 1 : 0}:${antialiasStrength}:${paintMode}:${originKey}:${proceduralKey}:${Math.round(angle * 1000) / 1000}`
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

export const imageBrushContainsAt = (imageBrush: ImageBrush, x: number, y: number, size: number, settings?: ImageBrushSettings): boolean => imageBrushCoverageAt(imageBrush, x, y, size, settings) > 0

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

const integerEllipseRowSpans = (size: number): Array<{ left: number; right: number }> => {
  let x0 = 0
  let y0 = 0
  let x1 = size - 1
  let y1 = size - 1
  let width = Math.abs(x1 - x0)
  const height = Math.abs(y1 - y0)
  let oddHeight = height & 1
  let deltaX = 4 * (1 - width) * height * height
  let deltaY = 4 * (oddHeight + 1) * width * width
  let error = deltaX + deltaY + oddHeight * width * width
  const spans = Array.from({ length: size }, () => ({ left: size, right: -1 }))
  const record = (x: number, y: number): void => {
    if (y < 0 || y >= size || x < 0 || x >= size) return
    spans[y].left = Math.min(spans[y].left, x)
    spans[y].right = Math.max(spans[y].right, x)
  }

  if (x0 > x1) { x0 = x1; x1 += width }
  if (y0 > y1) y0 = y1
  y0 += Math.floor((height + 1) / 2)
  y1 = y0 - oddHeight
  width *= 8 * width
  oddHeight = 8 * height * height
  do {
    record(x1, y0)
    record(x0, y0)
    record(x0, y1)
    record(x1, y1)
    const doubledError = 2 * error
    if (doubledError <= deltaY) {
      y0 += 1
      y1 -= 1
      deltaY += width
      error += deltaY
    }
    if (doubledError >= deltaX || 2 * error > deltaY) {
      x0 += 1
      x1 -= 1
      deltaX += oddHeight
      error += deltaX
    }
  } while (x0 <= x1)
  while (y0 - y1 < height) {
    record(x0 - 1, y0)
    record(x1 + 1, y0)
    y0 += 1
    record(x0 - 1, y1)
    record(x1 + 1, y1)
    y1 -= 1
  }
  return spans
}

export function brushMaskOffsets(size: number, shape: BrushShape, texture: BrushTexture = 'solid', textureScale = 1, originX = 0, originY = 0, imageBrush: ImageBrush | null = null, imageBrushSettings?: ImageBrushSettings, proceduralAntialiasStrength = 0, brushPaintMode: BrushPaintMode = 'paint', patternOriginX = originX, patternOriginY = originY, brushDither?: BrushDitherSettings, angle = 0): BrushMaskPoint[] {
  const normalizedSize = Math.max(1, Math.round(size))
  const points: BrushMaskPoint[] = []
  if (imageBrush) {
    const stamp = brushStampDimensions(normalizedSize, imageBrush, angle)
    const strength = imageBrush.id.startsWith('procedural:') ? proceduralAntialiasStrength : 0
    const cacheKey = imageBrushCacheKey(imageBrush, normalizedSize, imageBrushSettings, strength, brushPaintMode, originX, originY, patternOriginX, patternOriginY, angle)
    let cache = imageBrushMaskCache.get(imageBrush)
    const cached = cache?.get(cacheKey)
    if (cached) return cached
    const sourceStamp = brushStampDimensions(normalizedSize, imageBrush)
    const radians = angle * Math.PI / 180
    const cosine = Math.cos(radians)
    const sine = Math.sin(radians)
    for (let y = 0; y < stamp.height; y += 1) for (let x = 0; x < stamp.width; x += 1) {
      const outputCenterX = x - (stamp.width - 1) / 2
      const outputCenterY = y - (stamp.height - 1) / 2
      const sourceCenterX = cosine * outputCenterX + sine * outputCenterY + (sourceStamp.width - 1) / 2
      const sourceCenterY = -sine * outputCenterX + cosine * outputCenterY + (sourceStamp.height - 1) / 2
      const sourcePixelX = Math.round(sourceCenterX)
      const sourcePixelY = Math.round(sourceCenterY)
      if (sourcePixelX < 0 || sourcePixelY < 0 || sourcePixelX >= sourceStamp.width || sourcePixelY >= sourceStamp.height) continue
      // Source-aligned brushes preserve the pixels captured when the brush was
      // created. Target-aligned brushes restart the tile at the current stamp.
      const sampleX = brushPaintMode === 'pattern-source'
        ? originX + sourcePixelX - (imageBrush.sourceX ?? 0)
        : brushPaintMode === 'pattern-target'
          ? originX + sourcePixelX - patternOriginX
          : sourcePixelX
      const sampleY = brushPaintMode === 'pattern-source'
        ? originY + sourcePixelY - (imageBrush.sourceY ?? 0)
        : brushPaintMode === 'pattern-target'
          ? originY + sourcePixelY - patternOriginY
          : sourcePixelY
      const sourceCoverage = imageBrush.id.startsWith('procedural:')
        ? proceduralBrushCoverageAt(imageBrush.id, sampleX, sampleY, brushPaintMode === 'paint' ? sourceStamp.width : Math.max(imageBrush.width, imageBrush.height), imageBrush.proceduralSettings)
        : brushPaintMode === 'paint'
          ? imageBrush.coverage[(imageBrush.intrinsicSize ? sourcePixelY : Math.min(imageBrush.height - 1, Math.floor(sourcePixelY * imageBrush.height / sourceStamp.height))) * imageBrush.width + (imageBrush.intrinsicSize ? sourcePixelX : Math.min(imageBrush.width - 1, Math.floor(sourcePixelX * imageBrush.width / sourceStamp.width)))] ?? 0
          : (() => {
              const sourceX = wrappedIndex(sampleX, imageBrush.width)
              const sourceY = wrappedIndex(sampleY, imageBrush.height)
              return imageBrush.coverage[sourceY * imageBrush.width + sourceX] ?? 0
            })()
      const colorSource = imageBrush.paintColors ?? imageBrush.colors
      const colorIndex = brushPaintMode === 'paint'
        ? (imageBrush.intrinsicSize ? sourcePixelY : Math.min(imageBrush.height - 1, Math.floor(sourcePixelY * imageBrush.height / sourceStamp.height))) * imageBrush.width
          + (imageBrush.intrinsicSize ? sourcePixelX : Math.min(imageBrush.width - 1, Math.floor(sourcePixelX * imageBrush.width / sourceStamp.width)))
        : wrappedIndex(sampleY, imageBrush.height) * imageBrush.width + wrappedIndex(sampleX, imageBrush.width)
      const sourceColor = colorSource?.length === imageBrush.width * imageBrush.height ? unpackColor(colorSource[colorIndex] ?? 0) : undefined
      const coverage = sourceColor
        ? sourceColor.a > 0 ? 255 : 0
        : imageBrush.intrinsicSize ? sourceCoverage : imageBrushCoverage(sourceCoverage, sampleX, sampleY, imageBrushSettings, strength)
      if (coverage > 0) points.push({ x, y, coverage, color: sourceColor })
    }
    if (!cache) { cache = new Map(); imageBrushMaskCache.set(imageBrush, cache) }
    if (cache.size >= 4) cache.delete(cache.keys().next().value!)
    cache.set(cacheKey, points)
    return points
  }
  const applyDither = (mask: BrushMaskPoint[]): BrushMaskPoint[] => brushDither?.enabled
    ? mask.filter((point) => brushDitherContains(brushDither, originX + point.x, originY + point.y))
    : mask
  const solidCacheKey = texture === 'solid' ? `${shape}:${normalizedSize}` : null
  const cachedSolid = solidCacheKey ? solidBrushMaskCache.get(solidCacheKey) : null
  if (cachedSolid) return applyDither(cachedSolid)
  if (shape === 'line' && Math.abs(angle % 360) >= 0.0001) {
    const radians = angle * Math.PI / 180
    const cosine = Math.cos(radians)
    const sine = Math.sin(radians)
    const center = (normalizedSize - 1) / 2
    const sourceRow = Math.floor(normalizedSize / 2)
    for (let y = 0; y < normalizedSize; y += 1) for (let x = 0; x < normalizedSize; x += 1) {
      const outputX = x - center
      const outputY = y - center
      const sourceX = Math.round(cosine * outputX + sine * outputY + center)
      const sourceY = Math.round(-sine * outputX + cosine * outputY + center)
      if (sourceY === sourceRow && sourceX >= 0 && sourceX < normalizedSize && brushTextureContains(texture, sourceX, sourceY, textureScale)) {
        points.push({ x, y, coverage: 255 })
      }
    }
    return applyDither(points)
  }
  if (shape === 'line') {
    const row = Math.floor(normalizedSize / 2)
    for (let x = 0; x < normalizedSize; x += 1) if (brushTextureContains(texture, originX + x, originY + row, textureScale)) points.push({ x, y: row, coverage: 255 })
    return applyDither(points)
  }
  if (shape === 'square' || normalizedSize <= 1) {
    for (let y = 0; y < normalizedSize; y += 1) for (let x = 0; x < normalizedSize; x += 1) if (brushTextureContains(texture, originX + x, originY + y, textureScale)) points.push({ x, y, coverage: 255 })
    if (solidCacheKey) {
      if (solidBrushMaskCache.size >= 4) solidBrushMaskCache.delete(solidBrushMaskCache.keys().next().value!)
      solidBrushMaskCache.set(solidCacheKey, points)
    }
    return applyDither(points)
  }
  for (const [y, span] of integerEllipseRowSpans(normalizedSize).entries()) {
    for (let x = span.left; x <= span.right; x += 1) {
      if (brushTextureContains(texture, originX + x, originY + y, textureScale)) points.push({ x, y, coverage: 255 })
    }
  }
  if (solidCacheKey) {
    if (solidBrushMaskCache.size >= 4) solidBrushMaskCache.delete(solidBrushMaskCache.keys().next().value!)
    solidBrushMaskCache.set(solidCacheKey, points)
  }
  return applyDither(points)
}

export function paintLine(
  document: SpriteDocument,
  layer: RasterLayer,
  edit: PixelEdit,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  size: number,
  color: RgbaColor,
  selection?: SelectionMask | null,
  shape: BrushShape = 'square',
  texture: BrushTexture = 'solid',
  textureScale = 1,
  imageBrush: ImageBrush | null = null,
  imageBrushSettings?: ImageBrushSettings,
  proceduralAntialiasStrength = 0,
  brushPaintMode: BrushPaintMode = 'paint',
  patternOrigin?: { x: number; y: number },
  lineAlgorithm: 'raster' | 'balanced' = 'raster',
  symmetryAxes?: SymmetryAxes,
  symmetryCenter?: SymmetryCenter,
  colorReplacement?: { source: RgbaColor; target: RgbaColor },
  dynamics?: BrushLineDynamics,
  tileRepeatMode: TileRepeatMode = 'off',
  brushDither?: BrushDitherSettings
): void {
  const dynamicValue = (from: number | undefined, to: number | undefined, fallback: number, progress: number): number => {
    const start = Number.isFinite(from) ? from! : fallback
    const end = Number.isFinite(to) ? to! : fallback
    return start + (end - start) * progress
  }
  const paintPoint = (pointX: number, pointY: number, progress: number): void => {
    const pointSize = Math.max(1, Math.round(dynamicValue(dynamics?.fromSize, dynamics?.toSize, size, progress)))
    const opacityScale = dynamicValue(dynamics?.fromOpacityScale, dynamics?.toOpacityScale, 1, progress)
    const angle = interpolateBrushAngle(dynamics?.fromAngle ?? 0, dynamics?.toAngle ?? 0, progress)
    const pointColor = dynamics?.fromColor || dynamics?.toColor
      ? interpolateRgbaColor(dynamics.fromColor ?? dynamics.toColor ?? color, dynamics.toColor ?? dynamics.fromColor ?? color, progress)
      : color
    const gradient = dynamics?.gradient
      ? {
          startColor: dynamics.gradient.startColor,
          endColor: dynamics.gradient.endColor,
          gradientAmount: dynamicValue(dynamics.gradient.fromAmount, dynamics.gradient.toAmount, 0, progress),
          dither: dynamics.gradient.dither
        }
      : undefined
    paintBrush(document, layer, edit, pointX, pointY, pointSize, pointColor, shape, selection, texture, textureScale, imageBrush, imageBrushSettings, proceduralAntialiasStrength, brushPaintMode, patternOrigin, symmetryAxes, symmetryCenter, colorReplacement, opacityScale, dynamics?.coverageKey, dynamics?.overrideImageBrushColor, gradient, tileRepeatMode, brushDither, angle)
  }
  const points = lineAlgorithm === 'balanced'
    ? balancedStairLinePoints({ x: fromX, y: fromY }, { x: toX, y: toY })
    : rasterLinePoints({ x: fromX, y: fromY }, { x: toX, y: toY })
  if (points.length === 0) return
  const maximumSize = Math.max(1, Math.round(Math.max(size, dynamics?.fromSize ?? size, dynamics?.toSize ?? size)))
  const maximumAngle = Math.max(Math.abs(dynamics?.fromAngle ?? 0), Math.abs(dynamics?.toAngle ?? 0))
  const maximumStamp = brushStampDimensions(maximumSize, imageBrush, maximumAngle)
  const maximumAnchor = brushStampAnchor(maximumSize, imageBrush, maximumAngle)
  const lineLeft = Math.min(fromX, toX) - maximumAnchor.x
  const lineTop = Math.min(fromY, toY) - maximumAnchor.y
  const lineRight = Math.max(fromX, toX) - maximumAnchor.x + maximumStamp.width
  const lineBottom = Math.max(fromY, toY) - maximumAnchor.y + maximumStamp.height
  const footprint = symmetricRect(document, { x: lineLeft, y: lineTop, width: lineRight - lineLeft, height: lineBottom - lineTop }, symmetryAxes, symmetryCenter, tileRepeatMode)
  if (!ensureLayerCoversEditRect(document, layer, edit, footprint)) return
  let stepsSinceStamp = 0
  let lastStampedSize: number | null = null
  for (let index = 0; index < points.length; index += 1) {
    const progress = points.length <= 1 ? 1 : index / (points.length - 1)
    const pointSize = Math.max(1, Math.round(dynamicValue(dynamics?.fromSize, dynamics?.toSize, size, progress)))
    const pointAngle = interpolateBrushAngle(dynamics?.fromAngle ?? 0, dynamics?.toAngle ?? 0, progress)
    const stamp = brushStampDimensions(pointSize, imageBrush, pointAngle)
    const stampSpacing = Math.max(1, Math.floor(Math.max(stamp.width, stamp.height) / 16))
    if (index > 0) stepsSinceStamp += 1
    const sizeChanged = lastStampedSize !== null && pointSize !== lastStampedSize
    const mustPaint = index === 0 || index === points.length - 1 || sizeChanged || stepsSinceStamp >= stampSpacing
    if (!mustPaint) continue
    const point = points[index]
    paintPoint(point.x, point.y, progress)
    stepsSinceStamp = 0
    lastStampedSize = pointSize
  }
}

export function paintBrushPath(
  document: SpriteDocument,
  layer: RasterLayer,
  edit: PixelEdit,
  points: readonly { x: number; y: number }[],
  size: number,
  color: RgbaColor,
  selection?: SelectionMask | null,
  shape: BrushShape = 'square',
  texture: BrushTexture = 'solid',
  textureScale = 1,
  imageBrush: ImageBrush | null = null,
  imageBrushSettings?: ImageBrushSettings,
  proceduralAntialiasStrength = 0,
  brushPaintMode: BrushPaintMode = 'paint',
  patternOrigin?: { x: number; y: number },
  symmetryAxes?: SymmetryAxes,
  symmetryCenter?: SymmetryCenter,
  tileRepeatMode: TileRepeatMode = 'off',
  brushDither?: BrushDitherSettings
): void {
  const centers = brushPathStampPoints(points, size, imageBrush)
  if (centers.length === 0) return
  const stamp = brushStampDimensions(size, imageBrush)
  const anchor = brushStampAnchor(size, imageBrush)
  const left = Math.min(...centers.map((point) => point.x)) - anchor.x
  const top = Math.min(...centers.map((point) => point.y)) - anchor.y
  const right = Math.max(...centers.map((point) => point.x)) - anchor.x + stamp.width
  const bottom = Math.max(...centers.map((point) => point.y)) - anchor.y + stamp.height
  const footprint = symmetricRect(document, { x: left, y: top, width: right - left, height: bottom - top }, symmetryAxes, symmetryCenter, tileRepeatMode)
  if (!ensureLayerCoversEditRect(document, layer, edit, footprint)) return
  for (const center of centers) {
    paintBrush(document, layer, edit, center.x, center.y, size, color, shape, selection, texture, textureScale, imageBrush, imageBrushSettings, proceduralAntialiasStrength, brushPaintMode, patternOrigin, symmetryAxes, symmetryCenter, undefined, 1, undefined, false, undefined, tileRepeatMode, brushDither)
  }
}

export interface PixelPathPoint { x: number; y: number; size?: number; opacityScale?: number; angle?: number; color?: RgbaColor; gradient?: BrushGradientSample; coverageKey?: string; overrideImageBrushColor?: boolean }

export function appendPerfectPixelSegment(path: PixelPathPoint[], target: PixelPathPoint): boolean {
  if (!path.length) {
    path.push({ ...target })
    return false
  }
  const segmentStart = path[path.length - 1]
  let x = segmentStart.x
  let y = segmentStart.y
  const dx = Math.abs(target.x - x)
  const sx = x < target.x ? 1 : -1
  const dy = -Math.abs(target.y - y)
  const sy = y < target.y ? 1 : -1
  let error = dx + dy
  const totalSteps = Math.max(dx, Math.abs(dy))
  let step = 0
  let removedCorner = false
  while (x !== target.x || y !== target.y) {
    const twiceError = error * 2
    if (twiceError >= dy) { error += dy; x += sx }
    if (twiceError <= dx) { error += dx; y += sy }
    step += 1
    const progress = totalSteps === 0 ? 1 : step / totalSteps
    const point: PixelPathPoint = { x, y }
    if (segmentStart.size !== undefined || target.size !== undefined) {
      point.size = (segmentStart.size ?? target.size ?? 1) + ((target.size ?? segmentStart.size ?? 1) - (segmentStart.size ?? target.size ?? 1)) * progress
    }
    if (segmentStart.opacityScale !== undefined || target.opacityScale !== undefined) {
      point.opacityScale = (segmentStart.opacityScale ?? target.opacityScale ?? 1) + ((target.opacityScale ?? segmentStart.opacityScale ?? 1) - (segmentStart.opacityScale ?? target.opacityScale ?? 1)) * progress
    }
    if (segmentStart.angle !== undefined || target.angle !== undefined) {
      point.angle = interpolateBrushAngle(segmentStart.angle ?? target.angle ?? 0, target.angle ?? segmentStart.angle ?? 0, progress)
    }
    if (segmentStart.color || target.color) point.color = interpolateRgbaColor(segmentStart.color ?? target.color!, target.color ?? segmentStart.color!, progress)
    if (segmentStart.gradient || target.gradient) {
      const startGradient = segmentStart.gradient ?? target.gradient!
      const endGradient = target.gradient ?? segmentStart.gradient!
      point.gradient = {
        startColor: interpolateRgbaColor(startGradient.startColor, endGradient.startColor, progress),
        endColor: interpolateRgbaColor(startGradient.endColor, endGradient.endColor, progress),
        gradientAmount: startGradient.gradientAmount + (endGradient.gradientAmount - startGradient.gradientAmount) * progress,
        dither: endGradient.dither
      }
    }
    if (segmentStart.coverageKey || target.coverageKey) point.coverageKey = target.coverageKey ?? segmentStart.coverageKey
    if (segmentStart.overrideImageBrushColor || target.overrideImageBrushColor) point.overrideImageBrushColor = true
    if (path.length >= 2) {
      const previous = path[path.length - 1]
      const before = path[path.length - 2]
      const diagonalEndpoints = Math.abs(point.x - before.x) === 1 && Math.abs(point.y - before.y) === 1
      const previousFormsCorner = (previous.x === before.x && previous.y === point.y)
        || (previous.y === before.y && previous.x === point.x)
      if (diagonalEndpoints && previousFormsCorner) {
        path.pop()
        removedCorner = true
      }
    }
    const last = path[path.length - 1]
    if (!last || last.x !== point.x || last.y !== point.y) path.push(point)
  }
  return removedCorner
}

export function perfectPixelPathPoints(points: readonly { x: number; y: number }[]): PixelPathPoint[] {
  const path: PixelPathPoint[] = []
  for (const point of points) appendPerfectPixelSegment(path, point)
  return path
}

export function paintShape(
  document: SpriteDocument,
  layer: RasterLayer,
  edit: PixelEdit,
  bounds: SelectionRect,
  kind: ShapeKind,
  color: RgbaColor,
  selection?: SelectionMask | null,
  symmetryAxes?: SymmetryAxes,
  symmetryCenter?: SymmetryCenter,
  angle = 0,
  cornerRadius = 0
): void {
  const points = [...rotatedShapePixelPoints(bounds, kind, document.width, document.height, angle, cornerRadius)]
  if (points.length === 0) return
  const destinations = points.flatMap((point) => symmetryPoints(point, document.width, document.height, symmetryAxes, symmetryCenter))
  const left = Math.min(...destinations.map((point) => point.x))
  const top = Math.min(...destinations.map((point) => point.y))
  const right = Math.max(...destinations.map((point) => point.x)) + 1
  const bottom = Math.max(...destinations.map((point) => point.y)) + 1
  if (!ensureLayerCoversEditRect(document, layer, edit, { x: left, y: top, width: right - left, height: bottom - top })) return
  for (const point of points) {
    for (const { x, y } of symmetryPoints(point, document.width, document.height, symmetryAxes, symmetryCenter)) {
      if (selection && !insideSelection(selection, x, y)) continue
      const index = layerIndexAt(layer, x, y)
      if (index === null) continue
      recordPixel(document, layer, edit, index, paintLayerValue(document, layer, edit, index, color))
    }
  }
}

const uniquePixelPoints = (points: Iterable<{ x: number; y: number }>): BrushMaskPoint[] => {
  const result: BrushMaskPoint[] = []
  const seen = new Set<string>()
  for (const point of points) {
    const x = Math.round(point.x)
    const y = Math.round(point.y)
    const key = `${x}:${y}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push({ x, y, coverage: 255 })
  }
  return result
}

export function selectionMaskPixelPoints(selection: SelectionMask): BrushMaskPoint[] {
  const points: BrushMaskPoint[] = []
  const mask = selection.mask
  for (let localY = 0; localY < selection.height; localY += 1) for (let localX = 0; localX < selection.width; localX += 1) {
    const offset = localY * selection.width + localX
    if (mask && mask[offset] !== 1) continue
    points.push({ x: selection.x + localX, y: selection.y + localY, coverage: 255 })
  }
  return points
}

export function filledShapePathPixelPoints(document: SpriteDocument, path: readonly { x: number; y: number }[]): BrushMaskPoint[] {
  let roundedPath: readonly { x: number; y: number }[] = path
  for (const point of path) {
    if (!Number.isInteger(point.x) || !Number.isInteger(point.y)) {
      roundedPath = path.map((candidate) => ({ x: Math.round(candidate.x), y: Math.round(candidate.y) }))
      break
    }
  }
  const filled = lassoSelection(document, roundedPath)
  if (!filled) return []
  return selectionMaskPixelPoints(filled)
}

export function filledPolygonPathPixelPoints(document: SpriteDocument, vertices: readonly { x: number; y: number }[], balanced = false): BrushMaskPoint[] {
  let roundedVertices: readonly { x: number; y: number }[] = vertices
  for (const point of vertices) {
    if (!Number.isInteger(point.x) || !Number.isInteger(point.y)) {
      roundedVertices = vertices.map((candidate) => ({ x: Math.round(candidate.x), y: Math.round(candidate.y) }))
      break
    }
  }
  const filled = polygonSelection(document, roundedVertices, balanced)
  if (!filled) return []
  return selectionMaskPixelPoints(filled)
}

export function lineShapePixelPoints(start: { x: number; y: number }, end: { x: number; y: number }, balanced = false): BrushMaskPoint[] {
  return uniquePixelPoints((balanced ? balancedStairLinePoints : rasterLinePoints)(start, end))
}

export function bezierCurvePixelPoints(
  start: { x: number; y: number },
  controls: readonly { x: number; y: number }[],
  end: { x: number; y: number }
): BrushMaskPoint[] {
  const curvePoints = [start, ...controls, end]
  const baselineLength = Math.hypot(end.x - start.x, end.y - start.y)
  const steps = Math.min(4096, Math.max(16, Math.ceil(baselineLength * 2), curvePoints.length * 12))
  const points: Array<{ x: number; y: number }> = []
  let previous = { x: Math.round(start.x), y: Math.round(start.y) }
  points.push(previous)
  for (let step = 1; step <= steps; step += 1) {
    const amount = step / steps
    const working = curvePoints.map((point) => ({ x: point.x, y: point.y }))
    for (let level = working.length - 1; level > 0; level -= 1) {
      for (let index = 0; index < level; index += 1) {
        working[index] = {
          x: working[index].x + (working[index + 1].x - working[index].x) * amount,
          y: working[index].y + (working[index + 1].y - working[index].y) * amount
        }
      }
    }
    const current = { x: Math.round(working[0].x), y: Math.round(working[0].y) }
    points.push(...rasterLinePoints(previous, current))
    previous = current
  }
  return uniquePixelPoints(points)
}

export function paintShapePixelPoints(
  document: SpriteDocument,
  layer: RasterLayer,
  edit: PixelEdit,
  points: readonly { x: number; y: number }[],
  color: RgbaColor,
  selection?: SelectionMask | null,
  symmetryAxes?: SymmetryAxes,
  symmetryCenter?: SymmetryCenter
): void {
  const destinations = uniquePixelPoints(points.flatMap((point) => symmetryPoints(point, document.width, document.height, symmetryAxes, symmetryCenter)))
  if (destinations.length === 0) return
  const left = Math.min(...destinations.map((point) => point.x))
  const top = Math.min(...destinations.map((point) => point.y))
  const right = Math.max(...destinations.map((point) => point.x)) + 1
  const bottom = Math.max(...destinations.map((point) => point.y)) + 1
  if (!ensureLayerCoversEditRect(document, layer, edit, { x: left, y: top, width: right - left, height: bottom - top })) return
  for (const { x, y } of destinations) {
    if (selection && !insideSelection(selection, x, y)) continue
    const index = layerIndexAt(layer, x, y)
    if (index !== null) recordPixel(document, layer, edit, index, paintLayerValue(document, layer, edit, index, color))
  }
}

export interface OutlinePixelSample {
  index: number
  referenceColor: RgbaColor
}

interface OutlinePixelCandidate extends OutlinePixelSample {
  distance: number
  rank: number
}

const setOutlinePixelCandidate = (
  candidates: Map<number, OutlinePixelCandidate>,
  index: number,
  referenceColor: RgbaColor,
  distance: number,
  rank: number
): void => {
  const current = candidates.get(index)
  if (current && (current.distance < distance || (current.distance === distance && current.rank <= rank))) return
  candidates.set(index, { index, referenceColor, distance, rank })
}

/** Returns the exact pixels and source colors that a preview and the committed outline will paint. */
export function outlinePixelSamples(
  document: SpriteDocument,
  layer: RasterLayer,
  selection: SelectionMask | null,
  thickness: number,
  position: OutlinePosition,
  directions: OutlineDirections = allOutlineDirections(),
  kernel: OutlineKernel = 'square'
): OutlinePixelSample[] {
  const radius = Math.max(1, Math.min(64, Math.round(thickness)))
  const sourceBounds = selection ?? layerContentBounds(document, layer)
  if (!sourceBounds) return []
  const left = Math.max(0, sourceBounds.x - radius)
  const top = Math.max(0, sourceBounds.y - radius)
  const right = Math.min(document.width, sourceBounds.x + sourceBounds.width + radius)
  const bottom = Math.min(document.height, sourceBounds.y + sourceBounds.height + radius)
  if (right <= left || bottom <= top) return []
  const width = right - left
  const height = bottom - top
  const isSource = (x: number, y: number): boolean =>
    x >= left && y >= top && x < right && y < bottom && (!selection || selectionContains(selection, x, y)) && readLayerColorAt(document, layer, x, y).a > 0
  const result = new Map<number, OutlinePixelSample>()
  const boundary: Array<{ x: number; y: number; color: RgbaColor }> = []
  for (let y = top; y < bottom; y += 1) for (let x = left; x < right; x += 1) {
    if (!isSource(x, y)) continue
    let edge = false
    for (let dy = -1; dy <= 1 && !edge; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
      if ((dx !== 0 || dy !== 0) && !isSource(x + dx, y + dy)) { edge = true; break }
    }
    if (edge) boundary.push({ x, y, color: readLayerColorAt(document, layer, x, y) })
  }

  if (position !== 'inside') {
    const clipped = new Map<number, OutlinePixelCandidate>()
    const unclipped = new Map<number, OutlinePixelCandidate>()
    const diameter = radius * 2 + 1
    for (const source of boundary) for (let dy = -radius; dy <= radius; dy += 1) for (let dx = -radius; dx <= radius; dx += 1) {
      if (!outlineKernelContainsOffset(dx, dy, radius, kernel)) continue
      const direction = outlineDirectionForOffset(dx, dy)
      if (!direction || !directions[direction]) continue
      const targetX = source.x + dx
      const targetY = source.y + dy
      if (targetX < 0 || targetY < 0 || targetX >= document.width || targetY >= document.height || isSource(targetX, targetY)) continue
      const index = pixelIndex(document.width, targetX, targetY)
      if (readLayerColorAt(document, layer, targetX, targetY).a !== 0) continue
      const distance = dx * dx + dy * dy
      const rank = (-dy + radius) * diameter + (-dx + radius)
      setOutlinePixelCandidate(unclipped, index, source.color, distance, rank)
      if (selection && selectionContains(selection, targetX, targetY)) setOutlinePixelCandidate(clipped, index, source.color, distance, rank)
    }
    // Prefer clipping to the selection. A tight content selection has no room for an
    // outside stroke, so fall back to adjacent canvas pixels instead of doing nothing.
    for (const sample of (selection && clipped.size > 0 ? clipped : unclipped).values()) result.set(sample.index, { index: sample.index, referenceColor: sample.referenceColor })
  }

  if (position !== 'outside' && boundary.length > 0) {
    const innerRadius = Math.max(0, radius - 1)
    for (const source of boundary) {
      let allowedEdge = false
      for (let dy = -1; dy <= 1 && !allowedEdge; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0 || isSource(source.x + dx, source.y + dy) || !outlineKernelContainsOffset(dx, dy, 1, kernel)) continue
        const direction = outlineDirectionForOffset(dx, dy)
        if (direction && directions[direction]) { allowedEdge = true; break }
      }
      if (!allowedEdge) continue
      for (let dy = -innerRadius; dy <= innerRadius; dy += 1) for (let dx = -innerRadius; dx <= innerRadius; dx += 1) {
        if (dx !== 0 || dy !== 0) {
          if (!outlineKernelContainsOffset(dx, dy, innerRadius, kernel)) continue
          const direction = outlineDirectionForOffset(-dx, -dy)
          if (!direction || !directions[direction]) continue
        }
        const targetX = source.x + dx
        const targetY = source.y + dy
        if (targetX < left || targetY < top || targetX >= right || targetY >= bottom || !isSource(targetX, targetY)) continue
        const index = pixelIndex(document.width, targetX, targetY)
        if (!result.has(index)) result.set(index, { index, referenceColor: readLayerColorAt(document, layer, targetX, targetY) })
      }
    }
  }
  return [...result.values()]
}

/** Returns the exact pixels that a preview and the committed outline will paint. */
export function outlinePixelIndices(
  document: SpriteDocument,
  layer: RasterLayer,
  selection: SelectionMask | null,
  thickness: number,
  position: OutlinePosition,
  directions: OutlineDirections = allOutlineDirections(),
  kernel: OutlineKernel = 'square'
): number[] {
  return outlinePixelSamples(document, layer, selection, thickness, position, directions, kernel).map((sample) => sample.index)
}

export function outlineSelection(
  document: SpriteDocument,
  layer: RasterLayer,
  selection: SelectionMask | null,
  color: RgbaColor,
  thickness: number,
  position: OutlinePosition,
  directions: OutlineDirections = allOutlineDirections(),
  kernel: OutlineKernel = 'square',
  smartHue = false,
  smartHueDarkness = DEFAULT_OUTLINE_SMART_HUE_DARKNESS
): PixelEdit | null {
  if (isLayerEffectivelyLocked(document, layer)) return null
  if (!ensureLayerCoversCanvas(document, layer)) return null
  const edit = beginPixelEdit(layer.id)
  const colorSettings = { color, smartHue, smartHueDarkness }
  for (const sample of outlinePixelSamples(document, layer, selection, thickness, position, directions, kernel)) {
    const x = sample.index % document.width
    const y = Math.floor(sample.index / document.width)
    const index = layerIndexAt(layer, x, y)
    if (index !== null) recordPixel(document, layer, edit, index, paintLayerValue(document, layer, edit, index, resolveOutlineStrokeColor(colorSettings, sample.referenceColor)))
  }
  return edit.before.size > 0 ? edit : null
}

const shapeContainsOffset = (width: number, height: number, ellipse: boolean, offsetX: number, offsetY: number, cornerRadius = 0): boolean => {
  if (offsetX < 0 || offsetY < 0 || offsetX >= width || offsetY >= height) return false
  if (!ellipse) return roundedRectContainsPoint(width, height, cornerRadius, offsetX + 0.5, offsetY + 0.5)
  const centerX = (width - 1) / 2
  const centerY = (height - 1) / 2
  const radiusX = Math.max(0.5, width / 2)
  const radiusY = Math.max(0.5, height / 2)
  const dx = (offsetX - centerX) / radiusX
  const dy = (offsetY - centerY) / radiusY
  return (dx * dx) + (dy * dy) <= 1
}

export function shapeContainsPixel(bounds: SelectionRect, kind: ShapeKind, x: number, y: number, cornerRadius = 0): boolean {
  if (kind === 'freeform' || kind === 'polygon') return false
  const width = Math.max(1, bounds.width)
  const height = Math.max(1, bounds.height)
  return shapeContainsOffset(width, height, kind === 'ellipse' || kind === 'ellipse-outline', x - bounds.x, y - bounds.y, cornerRadius)
}

export function shapePixelPoints(bounds: SelectionRect, kind: ShapeKind, cornerRadius = 0): BrushMaskPoint[] {
  if (kind === 'freeform' || kind === 'polygon') return []
  const width = Math.max(1, bounds.width)
  const height = Math.max(1, bounds.height)
  const ellipse = kind === 'ellipse' || kind === 'ellipse-outline'
  const outline = kind === 'rectangle-outline' || kind === 'ellipse-outline'
  const filled = new Uint8Array(width * height)
  const contains = (offsetX: number, offsetY: number): boolean => shapeContainsOffset(width, height, ellipse, offsetX, offsetY, cornerRadius)
  for (let offsetY = 0; offsetY < height; offsetY += 1) for (let offsetX = 0; offsetX < width; offsetX += 1) if (contains(offsetX, offsetY)) filled[offsetY * width + offsetX] = 1
  const points: BrushMaskPoint[] = []
  for (let offsetY = 0; offsetY < height; offsetY += 1) {
    for (let offsetX = 0; offsetX < width; offsetX += 1) {
      if (!filled[offsetY * width + offsetX]) continue
      if (outline && contains(offsetX - 1, offsetY) && contains(offsetX + 1, offsetY) && contains(offsetX, offsetY - 1) && contains(offsetX, offsetY + 1)) continue
      points.push({ x: bounds.x + offsetX, y: bounds.y + offsetY, coverage: 255 })
    }
  }
  return points
}

interface ShapeBoundarySpan {
  left: number
  right: number
}

const findShapeBoundarySpan = (
  minX: number,
  maxX: number,
  y: number,
  contains: (x: number, y: number) => boolean,
  seedX: number
): ShapeBoundarySpan | null => {
  if (minX > maxX) return null
  let seed = Math.max(minX, Math.min(maxX, Math.round(seedX)))
  if (!contains(seed, y)) {
    let found = -1
    for (let distance = 1; distance <= maxX - minX; distance += 1) {
      const left = seed - distance
      if (left >= minX && contains(left, y)) { found = left; break }
      const right = seed + distance
      if (right <= maxX && contains(right, y)) { found = right; break }
    }
    if (found < 0) return null
    seed = found
  }

  let left = minX
  let right = seed
  while (left < right) {
    const middle = Math.floor((left + right) / 2)
    if (contains(middle, y)) right = middle
    else left = middle + 1
  }
  const spanLeft = left

  left = seed
  right = maxX
  while (left < right) {
    const middle = Math.ceil((left + right) / 2)
    if (contains(middle, y)) left = middle
    else right = middle - 1
  }
  return { left: spanLeft, right: left }
}

const collectShapeBoundaryPoints = (
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  canvasWidth: number,
  canvasHeight: number,
  contains: (x: number, y: number) => boolean,
  seedForRow: (y: number) => number,
  removeIsolatedTips: boolean
): BrushMaskPoint[] => {
  if (minX > maxX || minY > maxY) return []
  const spans: Array<ShapeBoundarySpan | null> = []
  for (let y = minY; y <= maxY; y += 1) spans.push(findShapeBoundarySpan(minX, maxX, y, contains, seedForRow(y)))

  const points: BrushMaskPoint[] = []
  const seen = new Set<number>()
  const add = (x: number, y: number): void => {
    if (x < 0 || y < 0 || x >= canvasWidth || y >= canvasHeight) return
    const key = y * canvasWidth + x
    if (seen.has(key)) return
    seen.add(key)
    points.push({ x, y, coverage: 255 })
  }
  const addRange = (left: number, right: number, y: number): void => {
    for (let x = left; x <= right; x += 1) add(x, y)
  }
  const addVerticalBoundary = (span: ShapeBoundarySpan, neighbor: ShapeBoundarySpan | null, y: number): void => {
    if (!neighbor) {
      addRange(span.left, span.right, y)
      return
    }
    if (span.left < neighbor.left) addRange(span.left, Math.min(span.right, neighbor.left - 1), y)
    if (span.right > neighbor.right) addRange(Math.max(span.left, neighbor.right + 1), span.right, y)
  }

  let currentRow = 0
  for (const span of spans) {
    if (!span) { currentRow += 1; continue }
    const y = minY + currentRow
    add(span.left, y)
    add(span.right, y)
    const previous = currentRow > 0 ? spans[currentRow - 1] : null
    const next = currentRow + 1 < spans.length ? spans[currentRow + 1] : null
    addVerticalBoundary(span, previous, y)
    addVerticalBoundary(span, next, y)
    currentRow += 1
  }

  if (!removeIsolatedTips) return points

  const spanAt = (y: number): ShapeBoundarySpan | null => {
    if (y < minY || y > maxY) return null
    return spans[y - minY]
  }
  const spanContains = (x: number, y: number): boolean => {
    const span = spanAt(y)
    return Boolean(span && x >= span.left && x <= span.right)
  }
  const removedTips = new Set<number>()
  for (let row = 0; row < spans.length; row += 1) {
    const span = spans[row]
    if (!span) continue
    const y = minY + row
    // Only span ends can have one horizontal neighbor. A short span is
    // checked in full because both ends may be isolated on a clipped tip.
    const candidates = span.right - span.left <= 3
      ? Array.from({ length: span.right - span.left + 1 }, (_, index) => span.left + index)
      : [span.left, span.right]
    for (const x of candidates) {
      let neighbors = 0
      if (spanContains(x - 1, y)) neighbors += 1
      if (spanContains(x + 1, y)) neighbors += 1
      if (spanContains(x, y - 1)) neighbors += 1
      if (spanContains(x, y + 1)) neighbors += 1
      if (neighbors <= 1) removedTips.add(y * canvasWidth + x)
    }
  }

  if (removedTips.size === 0) return points
  const result = points.filter((point) => !removedTips.has(point.y * canvasWidth + point.x))
  const boundaryKeys = new Set(result.map((point) => point.y * canvasWidth + point.x))
  for (const key of removedTips) {
    const x = key % canvasWidth
    const y = Math.floor(key / canvasWidth)
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const neighborX = x + dx
      const neighborY = y + dy
      if (!spanContains(neighborX, neighborY)) continue
      const neighborKey = neighborY * canvasWidth + neighborX
      if (removedTips.has(neighborKey) || boundaryKeys.has(neighborKey)) continue
      boundaryKeys.add(neighborKey)
      result.push({ x: neighborX, y: neighborY, coverage: 255 })
    }
  }
  return result
}

const snapShapeRotationValue = (value: number): number => {
  const rounded = Math.round(value)
  return Math.abs(value - rounded) < 1e-9 ? rounded : value
}

/** Returns only the current shape contour for a cheap drag-time preview. */
export function shapeBoundaryPixelPoints(
  bounds: SelectionRect,
  kind: ShapeKind,
  canvasWidth: number,
  canvasHeight: number,
  angle = 0,
  cornerRadius = 0
): BrushMaskPoint[] {
  if (kind === 'freeform' || kind === 'polygon' || canvasWidth <= 0 || canvasHeight <= 0) return []

  const normalizedAngle = ((angle % 360) + 360) % 360
  const normalizedWidth = Math.max(1, Math.ceil(bounds.width))
  const normalizedHeight = Math.max(1, Math.ceil(bounds.height))
  const ellipse = kind === 'ellipse' || kind === 'ellipse-outline'
  const axisAligned = normalizedAngle < 1e-9 || Math.abs(normalizedAngle - 360) < 1e-9

  if (axisAligned) {
    const minX = Math.max(0, Math.ceil(bounds.x))
    const maxX = Math.min(canvasWidth - 1, Math.floor(bounds.x + normalizedWidth - 1))
    const minY = Math.max(0, Math.ceil(bounds.y))
    const maxY = Math.min(canvasHeight - 1, Math.floor(bounds.y + normalizedHeight - 1))
    const contains = (x: number, y: number): boolean => shapeContainsOffset(
      normalizedWidth,
      normalizedHeight,
      ellipse,
      x - bounds.x,
      y - bounds.y,
      cornerRadius
    )
    const seedX = bounds.x + (normalizedWidth - 1) / 2
    return collectShapeBoundaryPoints(minX, maxX, minY, maxY, canvasWidth, canvasHeight, contains, () => seedX, false)
  }

  const target = { ...bounds, width: Math.max(1, bounds.width), height: Math.max(1, bounds.height) }
  const rotatedBounds = rotatedSelectionBounds(target, angle)
  const minX = Math.max(0, rotatedBounds.x)
  const maxX = Math.min(canvasWidth - 1, rotatedBounds.x + rotatedBounds.width - 1)
  const minY = Math.max(0, rotatedBounds.y)
  const maxY = Math.min(canvasHeight - 1, rotatedBounds.y + rotatedBounds.height - 1)
  const centerX = target.x + target.width / 2
  const centerY = target.y + target.height / 2
  const radians = angle * Math.PI / 180
  const cosine = snapShapeRotationValue(Math.cos(-radians))
  const sine = snapShapeRotationValue(Math.sin(-radians))
  const radius = roundedRectRadius(target.width, target.height, cornerRadius)
  const halfWidth = target.width / 2
  const halfHeight = target.height / 2
  const radiusX = Math.max(0.5, target.width / 2)
  const radiusY = Math.max(0.5, target.height / 2)
  const contains = (x: number, y: number): boolean => {
    const offsetX = x + 0.5 - centerX
    const offsetY = y + 0.5 - centerY
    const localX = offsetX * cosine - offsetY * sine
    const localY = offsetX * sine + offsetY * cosine
    if (ellipse) {
      const normalizedX = localX / radiusX
      const normalizedY = localY / radiusY
      return (normalizedX * normalizedX) + (normalizedY * normalizedY) <= 1
    }
    if (Math.abs(localX) >= halfWidth - 1e-9 || Math.abs(localY) >= halfHeight - 1e-9) return false
    return radius === 0 || roundedRectContainsPoint(target.width, target.height, radius, localX + halfWidth, localY + halfHeight)
  }
  const seedForRow = (y: number): number => {
    const offsetY = y + 0.5 - centerY
    return Math.abs(sine) < 1e-9 ? centerX - 0.5 : centerX - (offsetY * cosine / sine) - 0.5
  }
  const removeIsolatedTips = !ellipse
    && radius === 0
    && target.width > 2
    && target.height > 2
    && Math.abs(normalizedAngle % 90) > 1e-9
  return collectShapeBoundaryPoints(minX, maxX, minY, maxY, canvasWidth, canvasHeight, contains, seedForRow, removeIsolatedTips)
}

export function rotatedShapePixelPoints(
  bounds: SelectionRect,
  kind: ShapeKind,
  canvasWidth: number,
  canvasHeight: number,
  angle = 0,
  cornerRadius = 0
): BrushMaskPoint[] {
  if (kind === 'freeform' || kind === 'polygon') return []
  const normalizedAngle = ((angle % 360) + 360) % 360
  if (normalizedAngle < 1e-9 || Math.abs(normalizedAngle - 360) < 1e-9) return shapePixelPoints(bounds, kind, cornerRadius)
  const ellipse = kind === 'ellipse' || kind === 'ellipse-outline'
  const outline = kind === 'rectangle-outline' || kind === 'ellipse-outline'
  const filled = ellipse
    ? rotatedEllipseSelection(bounds, canvasWidth, canvasHeight, angle)
    : rotatedRectSelection(bounds, canvasWidth, canvasHeight, angle, true, cornerRadius)
  if (!filled) return []

  const points: BrushMaskPoint[] = []
  for (let y = filled.y; y < filled.y + filled.height; y += 1) {
    for (let x = filled.x; x < filled.x + filled.width; x += 1) {
      if (!selectionContains(filled, x, y)) continue
      if (outline
        && selectionContains(filled, x - 1, y)
        && selectionContains(filled, x + 1, y)
        && selectionContains(filled, x, y - 1)
        && selectionContains(filled, x, y + 1)) continue
      points.push({ x, y, coverage: 255 })
    }
  }
  return points
}

const insideSelection = (selection: SelectionMask, x: number, y: number): boolean => selectionContains(selection, x, y)
const COMPACT_FILL_MIN_PIXELS = 512 * 512
const DENSE_SELECTION_FILL_MIN_PIXELS = 512 * 512

export interface PixelOperationProfiler {
  record(stage: string, duration: number, detail?: Record<string, number | string | boolean>): void
}

const floodFillSolidRuns = (document: SpriteDocument, layer: RasterLayer, startX: number, startY: number, target: number, next: number, selection: SelectionMask | null | undefined, contiguous: boolean): PixelEdit | null => {
  const edit = beginPixelEdit(layer.id)
  preparePixelEdit(document, edit)
  const runs = [] as NonNullable<PixelEdit['runs']>
  const rgbaWords = layer.format === 'rgba' && layer.pixels.byteOffset % 4 === 0
    ? new Uint32Array(layer.pixels.buffer as ArrayBuffer, layer.pixels.byteOffset, layer.pixels.byteLength / 4)
    : null
  const layerIndexAtCanvas = (x: number, y: number): number | null => {
    const localX = x - layer.offsetX
    const localY = y - layer.offsetY
    return localX < 0 || localY < 0 || localX >= layer.width || localY >= layer.height ? null : localY * layer.width + localX
  }
  const selected = (x: number, y: number): boolean => {
    if (!selection) return true
    if (x < selection.x || y < selection.y || x >= selection.x + selection.width || y >= selection.y + selection.height) return false
    return !selection.mask || selection.mask[(y - selection.y) * selection.width + x - selection.x] === 1
  }
  const matches = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= document.width || y >= document.height || !selected(x, y)) return false
    const index = layerIndexAtCanvas(x, y)
    if (index === null) return false
    return layer.format === 'indexed' ? layer.pixels[index] === target : rgbaWords ? rgbaWords[index] === target : readLayerPacked(document, layer, index) === target
  }
  let dirtyLeft = document.width
  let dirtyTop = document.height
  let dirtyRight = 0
  let dirtyBottom = 0
  const fillSpan = (left: number, right: number, y: number): void => {
    const index = layerIndexAtCanvas(left, y)
    if (index === null) return
    const length = right - left + 1
    if (runs.length === 0) markLayerContentChanged(layer)
    writeLayerPackedRun(document, layer, index, length, next)
    runs.push({ index, length, before: target, after: next })
    dirtyLeft = Math.min(dirtyLeft, left)
    dirtyTop = Math.min(dirtyTop, y)
    dirtyRight = Math.max(dirtyRight, right + 1)
    dirtyBottom = Math.max(dirtyBottom, y + 1)
  }

  if (!contiguous) {
    const bounds = selection ? clampSelection(document, selection) : { x: 0, y: 0, width: document.width, height: document.height }
    if (!bounds) return null
    for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
      let x = bounds.x
      while (x < bounds.x + bounds.width) {
        while (x < bounds.x + bounds.width && !matches(x, y)) x += 1
        if (x >= bounds.x + bounds.width) break
        const left = x
        while (x + 1 < bounds.x + bounds.width && matches(x + 1, y)) x += 1
        fillSpan(left, x, y)
        x += 1
      }
    }
  } else {
    let stack = new Int32Array(1024)
    let stackLength = 0
    const push = (x: number, y: number): void => {
      if (stackLength === stack.length) {
        const expanded = new Int32Array(stack.length * 2)
        expanded.set(stack)
        stack = expanded
      }
      stack[stackLength++] = pixelIndex(document.width, x, y)
    }
    const scanNeighbor = (left: number, right: number, y: number): void => {
      if (y < 0 || y >= document.height) return
      let x = left
      while (x <= right) {
        while (x <= right && !matches(x, y)) x += 1
        if (x > right) break
        push(x, y)
        x += 1
        while (x <= right && matches(x, y)) x += 1
      }
    }
    push(startX, startY)
    while (stackLength > 0) {
      const seed = stack[--stackLength]
      const x = seed % document.width
      const y = Math.floor(seed / document.width)
      if (!matches(x, y)) continue
      let left = x
      let right = x
      while (matches(left - 1, y)) left -= 1
      while (matches(right + 1, y)) right += 1
      fillSpan(left, right, y)
      scanNeighbor(left, right, y - 1)
      scanNeighbor(left, right, y + 1)
    }
  }
  if (runs.length === 0) return null
  edit.runs = runs
  edit.dirtyRect = { x: dirtyLeft, y: dirtyTop, width: dirtyRight - dirtyLeft, height: dirtyBottom - dirtyTop }
  return edit
}

export function floodFill(document: SpriteDocument, layer: RasterLayer, startX: number, startY: number, color: RgbaColor, selection?: SelectionMask | null, contiguous = true, imageBrush: ImageBrush | null = null, brushSize = 1, imageBrushSettings?: ImageBrushSettings, brushTexture: BrushTexture = 'solid', brushTextureScale = 1, proceduralAntialiasStrength = 0, brushPaintMode: BrushPaintMode = 'paint', tolerance = 0, gapClosingThreshold = 0): PixelEdit | null {
  if (!isInBounds(document.width, document.height, startX, startY) || isLayerEffectivelyLocked(document, layer) || (selection && !insideSelection(selection, startX, startY))) return null
  const startWasOutsideLayer = layerIndexAt(layer, startX, startY) === null
  if (startWasOutsideLayer && !ensureLayerCoversCanvas(document, layer)) return null
  const startLayerIndex = layerIndexAt(layer, startX, startY)
  if (startLayerIndex === null) return null
  const target = readLayerPacked(document, layer, startLayerIndex)
  const normalizedTolerance = Math.max(0, Math.min(255, Math.round(tolerance) || 0))
  const paletteColors = layer.format === 'indexed'
    ? new Map(document.palette.map((entry) => [entry.id, packColor(getPaletteEntry(document, entry.id).color)]))
    : null
  const targetColor = layer.format === 'rgba' ? target : paletteColors!.get(target) ?? 0
  const matchesValue = (value: number): boolean => normalizedTolerance === 0
    ? value === target
    : packedColorMatchesTolerance(layer.format === 'rgba' ? value : paletteColors!.get(value) ?? 0, targetColor, normalizedTolerance)
  if (!startWasOutsideLayer && matchesValue(0)) {
    const bounds = selection ? clampSelection(document, selection) : { x: 0, y: 0, width: document.width, height: document.height }
    const layerLeft = layer.offsetX
    const layerTop = layer.offsetY
    const layerRight = layer.offsetX + layer.width
    const layerBottom = layer.offsetY + layer.height
    const boundsExtendOutsideLayer = Boolean(bounds && (bounds.x < layerLeft || bounds.y < layerTop || bounds.x + bounds.width > layerRight || bounds.y + bounds.height > layerBottom))
    const contiguousRegionCanEscapeLayer = (): boolean => {
      if (!contiguous || !boundsExtendOutsideLayer) return boundsExtendOutsideLayer
      const startLocalX = startX - layerLeft
      const startLocalY = startY - layerTop
      const visited = new Uint8Array(layer.width * layer.height)
      let stack = new Int32Array(Math.min(layer.width * layer.height, 1024))
      let stackLength = 0
      const matchesLocal = (localX: number, localY: number): boolean => {
        if (localX < 0 || localY < 0 || localX >= layer.width || localY >= layer.height) return false
        const index = localY * layer.width + localX
        if (visited[index]) return false
        const canvasX = layerLeft + localX
        const canvasY = layerTop + localY
        return (!selection || insideSelection(selection, canvasX, canvasY)) && matchesValue(readLayerPacked(document, layer, index))
      }
      const push = (localX: number, localY: number): void => {
        if (!matchesLocal(localX, localY)) return
        const index = localY * layer.width + localX
        visited[index] = 1
        if (stackLength === stack.length) {
          const expanded = new Int32Array(Math.min(layer.width * layer.height, Math.max(stack.length * 2, 1024)))
          expanded.set(stack)
          stack = expanded
        }
        stack[stackLength++] = index
      }
      const outsideSelected = (canvasX: number, canvasY: number): boolean => canvasX >= 0 && canvasY >= 0 && canvasX < document.width && canvasY < document.height && (!selection || insideSelection(selection, canvasX, canvasY))
      const scanNeighbor = (left: number, right: number, localY: number): void => {
        if (localY < 0 || localY >= layer.height) return
        let localX = left
        while (localX <= right) {
          while (localX <= right && !matchesLocal(localX, localY)) localX += 1
          if (localX > right) break
          push(localX, localY)
          localX += 1
          while (localX <= right && matchesLocal(localX, localY)) localX += 1
        }
      }
      push(startLocalX, startLocalY)
      while (stackLength > 0) {
        const index = stack[--stackLength]
        const localX = index % layer.width
        const localY = Math.floor(index / layer.width)
        let left = localX
        let right = localX
        while (matchesLocal(left - 1, localY)) left -= 1
        while (matchesLocal(right + 1, localY)) right += 1
        visited.fill(1, localY * layer.width + left, localY * layer.width + right + 1)
        const canvasY = layerTop + localY
        if ((left === 0 && outsideSelected(layerLeft - 1, canvasY))
          || (right === layer.width - 1 && outsideSelected(layerRight, canvasY))) return true
        if (localY === 0 || localY === layer.height - 1) {
          const outsideY = localY === 0 ? layerTop - 1 : layerBottom
          for (let x = left; x <= right; x += 1) if (outsideSelected(layerLeft + x, outsideY)) return true
        }
        scanNeighbor(left, right, localY - 1)
        scanNeighbor(left, right, localY + 1)
      }
      return false
    }
    const mayReachOutsideLayer = contiguousRegionCanEscapeLayer()
    if (mayReachOutsideLayer && !ensureLayerCoversCanvas(document, layer)) return null
  }
  const edit = beginPixelEdit(layer.id)
  preparePixelEdit(document, edit)
  const next = paintLayerValue(document, layer, edit, startLayerIndex, color)
  if (target === next) return null
  if (gapClosingThreshold <= 0 && normalizedTolerance === 0 && document.width * document.height >= COMPACT_FILL_MIN_PIXELS && !imageBrush && brushTexture === 'solid') {
    return floodFillSolidRuns(document, layer, startX, startY, target, next, selection, contiguous)
  }
  const textureCoverage = (x: number, y: number): number => {
    if (!imageBrush) return brushTextureContains(brushTexture, x, y, brushTextureScale) ? 255 : 0
    const originX = brushPaintMode === 'pattern-source' ? imageBrush.sourceX ?? 0 : brushPaintMode === 'pattern-target' ? startX : 0
    const originY = brushPaintMode === 'pattern-source' ? imageBrush.sourceY ?? 0 : brushPaintMode === 'pattern-target' ? startY : 0
    const sampleX = x - originX
    const sampleY = y - originY
    const sampleSize = imageBrush.id.startsWith('procedural:') || brushPaintMode !== 'paint'
      ? Math.max(imageBrush.width, imageBrush.height)
      : brushSize
    if (imageBrush.id.startsWith('procedural:')) return imageBrushCoverage(proceduralBrushCoverageAt(imageBrush.id, sampleX, sampleY, sampleSize, imageBrush.proceduralSettings), sampleX, sampleY, imageBrushSettings, proceduralAntialiasStrength)
    return imageBrush.intrinsicSize ? imageBrush.coverage[wrappedIndex(sampleY, imageBrush.height) * imageBrush.width + wrappedIndex(sampleX, imageBrush.width)] ?? 0 : imageBrushCoverageAt(imageBrush, sampleX, sampleY, sampleSize, imageBrushSettings)
  }
  const constantFillValue = color.a === 0
    ? layer.format === 'rgba' ? packColor(color) : 0
    : color.a === 255
      ? layer.format === 'rgba' ? packColor(color) : paletteColorIdForCanvas(document, color)
      : null
  const layerIndexAtCanvas = (x: number, y: number): number | null => {
    const localX = x - layer.offsetX
    const localY = y - layer.offsetY
    return localX < 0 || localY < 0 || localX >= layer.width || localY >= layer.height
      ? null
      : localY * layer.width + localX
  }
  const paintAtCoverage = (layerIndex: number, coverage: number, current: number): void => {
    if (coverage <= 0) return
    const nextValue = coverage === 255 && constantFillValue !== null
      ? constantFillValue
      : paintLayerValue(document, layer, edit, layerIndex, coverage === 255 ? color : { ...color, a: Math.round(color.a * coverage / 255) })
    recordPixelKnownCurrent(document, layer, edit, layerIndex, current, nextValue)
  }
  if (!contiguous) {
    const bounds = selection ? clampSelection(document, selection) : { x: 0, y: 0, width: document.width, height: document.height }
    if (!bounds) return null
    for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
      for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
        if (selection && !selectionContains(selection, x, y)) continue
        const layerIndex = layerIndexAtCanvas(x, y)
        if (layerIndex === null) continue
        const current = readLayerPacked(document, layer, layerIndex)
        if (!matchesValue(current)) continue
        paintAtCoverage(layerIndex, textureCoverage(x, y), current)
      }
    }
    return edit.before.size > 0 ? edit : null
  }
  const maxPixels = document.width * document.height
  if (gapClosingThreshold > 0) {
    const region = contiguousMatchingRegion(document.width, document.height, startX, startY, (index) => {
      const x = index % document.width
      const y = Math.floor(index / document.width)
      if (selection && !insideSelection(selection, x, y)) return false
      const layerIndex = layerIndexAtCanvas(x, y)
      return layerIndex !== null && matchesValue(readLayerPacked(document, layer, layerIndex))
    }, gapClosingThreshold)
    if (!region) return null
    for (let index = 0; index < maxPixels; index += 1) {
      if (region[index] !== 1) continue
      const x = index % document.width
      const y = Math.floor(index / document.width)
      const layerIndex = layerIndexAtCanvas(x, y)
      if (layerIndex !== null) paintAtCoverage(layerIndex, textureCoverage(x, y), readLayerPacked(document, layer, layerIndex))
    }
    return edit.before.size > 0 ? edit : null
  }
  const visited = new Uint8Array(maxPixels)
  let stack = new Int32Array(Math.min(maxPixels, 1024))
  let stackLength = 0
  const enqueueIfMatching = (x: number, y: number): void => {
    if (x < 0 || y < 0 || x >= document.width || y >= document.height) return
    const index = pixelIndex(document.width, x, y)
    if (visited[index] || (selection && !insideSelection(selection, x, y))) return
    const layerIndex = layerIndexAtCanvas(x, y)
    if (layerIndex === null || !matchesValue(readLayerPacked(document, layer, layerIndex))) return
    visited[index] = 1
    if (stackLength === stack.length) {
      const expanded = new Int32Array(Math.min(maxPixels, Math.max(stack.length * 2, 1024)))
      expanded.set(stack)
      stack = expanded
    }
    stack[stackLength++] = index
  }
  enqueueIfMatching(startX, startY)
  while (stackLength > 0) {
    const index = stack[--stackLength]
    const x = index % document.width
    const y = Math.floor(index / document.width)
    const layerIndex = layerIndexAtCanvas(x, y)
    if (layerIndex === null) continue
    paintAtCoverage(layerIndex, textureCoverage(x, y), readLayerPacked(document, layer, layerIndex))
    enqueueIfMatching(x - 1, y)
    enqueueIfMatching(x + 1, y)
    enqueueIfMatching(x, y - 1)
    enqueueIfMatching(x, y + 1)
  }
  return edit.before.size > 0 ? edit : null
}

export function floodFillSymmetric(document: SpriteDocument, layer: RasterLayer, startX: number, startY: number, color: RgbaColor, selection: SelectionMask | null | undefined, contiguous: boolean, imageBrush: ImageBrush | null, brushSize: number, imageBrushSettings: ImageBrushSettings | undefined, brushTexture: BrushTexture, brushTextureScale: number, proceduralAntialiasStrength: number, brushPaintMode: BrushPaintMode, symmetryAxes?: SymmetryAxes, symmetryCenter?: SymmetryCenter, tolerance = 0, gapClosingThreshold = 0, profiler?: PixelOperationProfiler): PixelEdit | null {
  const merged = beginPixelEdit(layer.id)
  for (const seed of symmetryPoints({ x: startX, y: startY }, document.width, document.height, symmetryAxes, symmetryCenter)) {
    const fillStartedAt = profiler ? performance.now() : 0
    const edit = floodFill(document, layer, seed.x, seed.y, color, selection, contiguous, imageBrush, brushSize, imageBrushSettings, brushTexture, brushTextureScale, proceduralAntialiasStrength, brushPaintMode, tolerance, gapClosingThreshold)
    profiler?.record('bucket.flood-fill', performance.now() - fillStartedAt, {
      points: edit?.before.size ?? 0,
      runs: edit?.runs?.length ?? 0,
      dirtyPixels: edit?.dirtyRect ? edit.dirtyRect.width * edit.dirtyRect.height : 0
    })
    if (!edit) continue
    const mergeStartedAt = profiler ? performance.now() : 0
    merged.frameId ??= edit.frameId
    if (edit.runs?.length) (merged.runs ??= []).push(...edit.runs)
    for (const [index, value] of edit.before) if (!merged.before.has(index)) merged.before.set(index, value)
    for (const [index, value] of edit.after) merged.after.set(index, value)
    if (edit.dirtyRect) {
      if (!merged.dirtyRect) merged.dirtyRect = { ...edit.dirtyRect }
      else {
        const left = Math.min(merged.dirtyRect.x, edit.dirtyRect.x)
        const top = Math.min(merged.dirtyRect.y, edit.dirtyRect.y)
        const right = Math.max(merged.dirtyRect.x + merged.dirtyRect.width, edit.dirtyRect.x + edit.dirtyRect.width)
        const bottom = Math.max(merged.dirtyRect.y + merged.dirtyRect.height, edit.dirtyRect.y + edit.dirtyRect.height)
        merged.dirtyRect = { x: left, y: top, width: right - left, height: bottom - top }
      }
    }
    profiler?.record('bucket.pixel-edit-merge', performance.now() - mergeStartedAt, {
      points: merged.before.size,
      runs: merged.runs?.length ?? 0
    })
  }
  return merged.before.size > 0 || merged.runs?.length ? merged : null
}

export function clearSelection(document: SpriteDocument, selection: SelectionMask, targetLayer?: RasterLayer): PixelEdit | null {
  const layer = targetLayer ?? getActiveLayer(document)
  if (isLayerEffectivelyLocked(document, layer)) return null
  const clamped = clampSelection(document, selection)
  const content = layerContentBounds(document, layer)
  if (!clamped || !content) return null
  const left = Math.max(clamped.x, content.x)
  const top = Math.max(clamped.y, content.y)
  const right = Math.min(clamped.x + clamped.width, content.x + content.width)
  const bottom = Math.min(clamped.y + clamped.height, content.y + content.height)
  if (right <= left || bottom <= top) return null
  const edit = beginPixelEdit(layer.id)
  if (!selection.mask) {
    const width = right - left
    const height = bottom - top
    const localLeft = left - layer.offsetX
    const localTop = top - layer.offsetY
    const values = readSurfacePackedRegion(layer, localLeft, localTop, width, height)
    for (let localY = 0; localY < height; localY += 1) {
      let layerIndex = (localTop + localY) * layer.width + localLeft
      let valueOffset = localY * width
      for (let localX = 0; localX < width; localX += 1, layerIndex += 1, valueOffset += 1) {
        const current = values[valueOffset]
        if (current !== 0) recordPixelKnownCurrent(document, layer, edit, layerIndex, current, 0)
      }
    }
    return edit.before.size > 0 ? edit : null
  }
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      if (!selectionContains(selection, x, y)) continue
      const index = layerIndexAt(layer, x, y)
      if (index !== null) recordPixel(document, layer, edit, index, 0)
    }
  }
  return edit
}

export function fillSelectionOrCanvas(document: SpriteDocument, layer: RasterLayer, color: RgbaColor, selection: SelectionMask | null = null): PixelEdit | null {
  if (isLayerEffectivelyLocked(document, layer)) return null
  const bounds = selection ? clampSelection(document, selection) : { x: 0, y: 0, width: document.width, height: document.height }
  if (!bounds) return null
  const edit = beginPixelEdit(layer.id)
  if (!ensureLayerCoversEditRect(document, layer, edit, bounds, selection ? EDIT_EXPANSION_PADDING : 0)) return null
  const value = normalizeLayerPackedValue(document, layer, layer.format === 'rgba' ? packColor(color) : paletteColorIdForCanvas(document, color))
  const denseArea = bounds.width * bounds.height
  let useDenseEdit = denseArea >= DENSE_SELECTION_FILL_MIN_PIXELS
  if (useDenseEdit && selection?.mask) {
    let selectedCount = 0
    for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
      for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
        if (selectionContains(selection, x, y)) selectedCount += 1
      }
    }
    useDenseEdit = selectedCount * 3 >= denseArea
  }
  if (useDenseEdit) {
    const before = new Uint32Array(bounds.width * bounds.height)
    const after = new Uint32Array(bounds.width * bounds.height)
    const changed = new Uint8Array(bounds.width * bounds.height)
    const storageOrigin = getLayerStorageOrigin(layer)
    const rgbaWords = layer.format === 'rgba' && layer.pixels.byteOffset % 4 === 0
      ? new Uint32Array(layer.pixels.buffer as ArrayBuffer, layer.pixels.byteOffset, layer.pixels.byteLength / 4)
      : null
    let count = 0
    let dirtyLeft = bounds.x + bounds.width
    let dirtyTop = bounds.y + bounds.height
    let dirtyRight = bounds.x
    let dirtyBottom = bounds.y
    preparePixelEdit(document, edit)
    for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
      for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
        const denseOffset = (y - bounds.y) * bounds.width + x - bounds.x
        const index = layerIndexAt(layer, x, y)
        if (index === null) continue
        const current = rgbaWords ? rgbaWords[index] : readLayerPacked(document, layer, index)
        before[denseOffset] = current
        after[denseOffset] = current
        if (selection && !selectionContains(selection, x, y)) continue
        if (current === value) continue
        if (count === 0) markLayerContentChanged(layer)
        after[denseOffset] = value
        changed[denseOffset] = 1
        count += 1
        dirtyLeft = Math.min(dirtyLeft, x)
        dirtyTop = Math.min(dirtyTop, y)
        dirtyRight = Math.max(dirtyRight, x + 1)
        dirtyBottom = Math.max(dirtyBottom, y + 1)
        if (rgbaWords) rgbaWords[index] = value
        else writeLayerPacked(document, layer, index, value)
      }
    }
    if (count === 0) return null
    edit.denseRegion = {
      x: bounds.x - layer.offsetX + storageOrigin.x,
      y: bounds.y - layer.offsetY + storageOrigin.y,
      width: bounds.width,
      height: bounds.height,
      before,
      after,
      changed,
      count
    }
    edit.dirtyRect = { x: dirtyLeft, y: dirtyTop, width: dirtyRight - dirtyLeft, height: dirtyBottom - dirtyTop }
    return edit
  }
  for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
    for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
      if (selection && !selectionContains(selection, x, y)) continue
      const index = layerIndexAt(layer, x, y)
      if (index === null) continue
      recordPixel(document, layer, edit, index, value)
    }
  }
  return edit.before.size > 0 ? edit : null
}

export function replaceLayerColor(document: SpriteDocument, layer: RasterLayer, source: RgbaColor, replacement: RgbaColor, selection: SelectionMask | null = null): PixelEdit | null {
  const sourceValue = packColor(source)
  if (sourceValue === packColor(replacement)) return null
  const indexedSourceIds = layer.format === 'indexed'
    ? new Set(document.palette.filter((entry) => packColor(entry.color) === sourceValue).map((entry) => entry.id))
    : null
  if (indexedSourceIds?.size === 0) return null
  const edit = beginPixelEdit(layer.id)
  let replacementValue: number | null = layer.format === 'rgba' ? packColor(replacement) : null
  const replaceIndex = (index: number): void => {
    const current = readLayerPacked(document, layer, index)
    if (layer.format === 'rgba' ? current !== sourceValue : !indexedSourceIds!.has(current)) return
    replacementValue ??= paletteColorIdForCanvas(document, replacement)
    recordPixelKnownCurrent(document, layer, edit, index, current, replacementValue)
  }
  if (selection) {
    const bounds = clampSelection(document, selection)
    if (!bounds) return null
    for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
      for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
        if (!selectionContains(selection, x, y)) continue
        const index = layerIndexAt(layer, x, y)
        if (index !== null) replaceIndex(index)
      }
    }
  } else {
    for (let index = 0; index < layer.width * layer.height; index += 1) replaceIndex(index)
  }
  return edit.before.size > 0 ? edit : null
}

export interface SelectionTransformSource {
  selection: SelectionMask
  values: Uint32Array
  selectedOffsets: Uint32Array
  opaqueOffsets: Uint32Array
  opaqueIndices: Uint32Array
  opaqueValues: Uint32Array
  origin?: 'selection' | 'clipboard'
  /**
   * Exact frame occupied by the captured pixels. When present, a free
   * transform maps this frame to the next target quad instead of assuming the
   * captured selection bounds are an axis-aligned rectangle.
   */
  sourceQuad?: SelectionQuad
}

const SELECTION_OFFSET_CACHE_LIMIT = 262_144

const forEachSelectedSourceOffset = (source: SelectionTransformSource, callback: (offset: number) => void): void => {
  if (source.selectedOffsets.length > 0) {
    for (const offset of source.selectedOffsets) callback(offset)
    return
  }
  const { mask, width, height } = source.selection
  const size = width * height
  if (!mask) {
    for (let offset = 0; offset < size; offset += 1) callback(offset)
    return
  }
  for (let offset = 0; offset < size; offset += 1) if (mask[offset] === 1) callback(offset)
}

const flippedSelectionOffset = (offset: number, width: number, height: number, axis: SelectionFlipAxis): number => {
  const x = offset % width
  const y = Math.floor(offset / width)
  return axis === 'horizontal' ? y * width + width - 1 - x : (height - 1 - y) * width + x
}

export function flipSelectionTransformSource(source: SelectionTransformSource, axis: SelectionFlipAxis): SelectionTransformSource {
  const { width, height } = source.selection
  const values = new Uint32Array(source.values.length)
  for (let offset = 0; offset < source.values.length; offset += 1) values[flippedSelectionOffset(offset, width, height, axis)] = source.values[offset]
  const selectedOffsets = Uint32Array.from(source.selectedOffsets, (offset) => flippedSelectionOffset(offset, width, height, axis))
  const opaque = Array.from(source.opaqueOffsets, (offset, index) => ({
    offset: flippedSelectionOffset(offset, width, height, axis),
    value: source.opaqueValues[index]
  })).sort((left, right) => left.offset - right.offset)
  const sourceQuad = source.sourceQuad
    ? axis === 'horizontal'
      ? {
          nw: { ...source.sourceQuad.ne },
          ne: { ...source.sourceQuad.nw },
          se: { ...source.sourceQuad.sw },
          sw: { ...source.sourceQuad.se }
        }
      : {
          nw: { ...source.sourceQuad.sw },
          ne: { ...source.sourceQuad.se },
          se: { ...source.sourceQuad.ne },
          sw: { ...source.sourceQuad.nw }
        }
    : undefined
  return {
    selection: flipSelectionMask(source.selection, axis),
    values,
    selectedOffsets,
    opaqueOffsets: Uint32Array.from(opaque, (item) => item.offset),
    // These indices remain tied to the original clear region while the
    // destination offsets and values follow the mirrored floating content.
    opaqueIndices: source.opaqueIndices.slice(),
    opaqueValues: Uint32Array.from(opaque, (item) => item.value),
    origin: source.origin,
    sourceQuad
  }
}

export interface SelectionTranslationPreview {
  layerId: string
  marks: Uint8Array
  canvasIndices: Uint32Array
  indices: Uint32Array
  before: Uint32Array
  count: number
}

export interface SelectionTransformLayerState {
  layerId: string
  frameId?: string
  source: SelectionTransformSource
  previewEdit: PixelEdit | null
  translationPreview: SelectionTranslationPreview | null
}

const SELECTION_TRANSLATION_POINT_HISTORY_THRESHOLD = 65_536

interface TransformCell { x: number; y: number; sourceIndex: number; value: number }

export function captureSelectionTransform(document: SpriteDocument, selection: SelectionMask, targetLayer?: RasterLayer, options?: { cacheOpaqueOffsets?: boolean; preserveOutsideCanvas?: boolean }): SelectionTransformSource | null {
  const layer = targetLayer ?? getActiveLayer(document)
  const source = options?.preserveOutsideCanvas
    ? { ...selection, mask: selection.mask?.slice() }
    : clampSelectionMask(document, selection)
  if (!source) return null
  const size = source.width * source.height
  const values = readSurfacePackedRegion(layer, source.x - layer.offsetX, source.y - layer.offsetY, source.width, source.height)
  const opaquePaletteIds = layer.format === 'indexed'
    ? new Set(document.palette.filter((entry) => entry.id !== 0 && entry.color.a !== 0).map((entry) => entry.id))
    : null
  const isOpaque = (value: number): boolean => layer.format === 'rgba' ? (value >>> 24) !== 0 : opaquePaletteIds!.has(value)
  if (size > SELECTION_OFFSET_CACHE_LIMIT && options?.cacheOpaqueOffsets === false) {
    return {
      selection: source,
      values,
      selectedOffsets: new Uint32Array(0),
      opaqueOffsets: new Uint32Array(0),
      opaqueIndices: new Uint32Array(0),
      opaqueValues: new Uint32Array(0),
      origin: 'selection'
    }
  }
  if (size > SELECTION_OFFSET_CACHE_LIMIT) {
    let opaqueCount = 0
    for (let offset = 0; offset < size; offset += 1) {
      if ((!source.mask || source.mask[offset] === 1) && isOpaque(values[offset])) opaqueCount += 1
    }
    const opaqueOffsets = new Uint32Array(opaqueCount)
    const opaqueIndices = new Uint32Array(opaqueCount)
    const opaqueValues = new Uint32Array(opaqueCount)
    let opaqueIndex = 0
    for (let offset = 0; offset < size; offset += 1) {
      if ((source.mask && source.mask[offset] !== 1) || !isOpaque(values[offset])) continue
      opaqueOffsets[opaqueIndex] = offset
      opaqueIndices[opaqueIndex] = pixelIndex(document.width, source.x + offset % source.width, source.y + Math.floor(offset / source.width))
      opaqueValues[opaqueIndex] = values[offset]
      opaqueIndex += 1
    }
    return {
      selection: source,
      values,
      selectedOffsets: new Uint32Array(0),
      opaqueOffsets,
      opaqueIndices,
      opaqueValues,
      origin: 'selection'
    }
  }
  const selectedCapacity = source.mask ? source.mask.reduce((count, selected) => count + (selected === 1 ? 1 : 0), 0) : size
  const selectedOffsets = new Uint32Array(selectedCapacity)
  const opaqueOffsets = new Uint32Array(selectedCapacity)
  const opaqueIndices = new Uint32Array(selectedCapacity)
  const opaqueValues = new Uint32Array(selectedCapacity)
  let selectedCount = 0
  let opaqueCount = 0
  for (let offset = 0; offset < size; offset += 1) {
    if (source.mask && source.mask[offset] !== 1) continue
    selectedOffsets[selectedCount++] = offset
    const value = values[offset]
    if (!isOpaque(value)) continue
    opaqueOffsets[opaqueCount] = offset
    opaqueIndices[opaqueCount] = pixelIndex(document.width, source.x + offset % source.width, source.y + Math.floor(offset / source.width))
    opaqueValues[opaqueCount] = value
    opaqueCount += 1
  }
  return {
    selection: source,
    values,
    selectedOffsets,
    opaqueOffsets: opaqueOffsets.slice(0, opaqueCount),
    opaqueIndices: opaqueIndices.slice(0, opaqueCount),
    opaqueValues: opaqueValues.slice(0, opaqueCount),
    origin: 'selection'
  }
}

export function applySelectionTranslationCommit(
  document: SpriteDocument,
  source: SelectionTransformSource,
  target: SelectionRect,
  copy = false,
  targetLayer?: RasterLayer,
  tileRepeatMode: TileRepeatMode = 'off'
): PixelEdit | null {
  const layer = targetLayer ?? getActiveLayer(document)
  const sourceSelection = source.selection
  if (target.width !== sourceSelection.width || target.height !== sourceSelection.height || target.flipHorizontal || target.flipVertical) return null
  if (!copy && target.x === sourceSelection.x && target.y === sourceSelection.y) return null
  if (isLayerEffectivelyLocked(document, layer)) return null
  if (tileRepeatMode !== 'off') {
    const preview = applySelectionTranslationPreview(document, source, target, copy, null, layer, undefined, tileRepeatMode)
    return selectionTranslationPreviewEdit(document, preview)
  }

  const deltaX = target.x - sourceSelection.x
  const deltaY = target.y - sourceSelection.y
  const selectionContainsLayerStorage = !sourceSelection.mask
    && sourceSelection.x <= layer.offsetX
    && sourceSelection.y <= layer.offsetY
    && sourceSelection.x + sourceSelection.width >= layer.offsetX + layer.width
    && sourceSelection.y + sourceSelection.height >= layer.offsetY + layer.height
  if (!copy && selectionContainsLayerStorage) {
    const edit = beginPixelEdit(layer.id)
    preparePixelEdit(document, edit)
    edit.layerOffset = {
      beforeX: layer.offsetX,
      beforeY: layer.offsetY,
      afterX: layer.offsetX + deltaX,
      afterY: layer.offsetY + deltaY
    }
    const left = Math.min(edit.layerOffset.beforeX, edit.layerOffset.afterX)
    const top = Math.min(edit.layerOffset.beforeY, edit.layerOffset.afterY)
    const right = Math.max(edit.layerOffset.beforeX + layer.width, edit.layerOffset.afterX + layer.width)
    const bottom = Math.max(edit.layerOffset.beforeY + layer.height, edit.layerOffset.afterY + layer.height)
    edit.dirtyRect = { x: left, y: top, width: right - left, height: bottom - top }
    layer.offsetX = edit.layerOffset.afterX
    layer.offsetY = edit.layerOffset.afterY
    return edit
  }
  let sourceRect: SelectionRect
  let targetRect: SelectionRect
  if (source.origin === 'clipboard') {
    const targetLeft = Math.max(0, target.x)
    const targetTop = Math.max(0, target.y)
    const targetRight = Math.min(document.width, target.x + target.width)
    const targetBottom = Math.min(document.height, target.y + target.height)
    if (targetRight <= targetLeft || targetBottom <= targetTop) return null
    targetRect = { x: targetLeft, y: targetTop, width: targetRight - targetLeft, height: targetBottom - targetTop }
    sourceRect = targetRect
  } else {
    const sourceLeft = Math.max(sourceSelection.x, layer.offsetX)
    const sourceTop = Math.max(sourceSelection.y, layer.offsetY)
    const sourceRight = Math.min(sourceSelection.x + sourceSelection.width, layer.offsetX + layer.width)
    const sourceBottom = Math.min(sourceSelection.y + sourceSelection.height, layer.offsetY + layer.height)
    if (sourceRight <= sourceLeft || sourceBottom <= sourceTop) return null
    sourceRect = { x: sourceLeft, y: sourceTop, width: sourceRight - sourceLeft, height: sourceBottom - sourceTop }
    targetRect = { x: sourceLeft + deltaX, y: sourceTop + deltaY, width: sourceRect.width, height: sourceRect.height }
  }
  if (!expandLayerToRect(layer, targetRect.x, targetRect.y, targetRect.x + targetRect.width, targetRect.y + targetRect.height)) return null
  const overlaps = sourceRect.x < targetRect.x + targetRect.width
    && targetRect.x < sourceRect.x + sourceRect.width
    && sourceRect.y < targetRect.y + targetRect.height
    && targetRect.y < sourceRect.y + sourceRect.height
  const regions = copy
    ? [targetRect]
    : overlaps
      ? [{
          x: Math.min(sourceRect.x, targetRect.x),
          y: Math.min(sourceRect.y, targetRect.y),
          width: Math.max(sourceRect.x + sourceRect.width, targetRect.x + targetRect.width) - Math.min(sourceRect.x, targetRect.x),
          height: Math.max(sourceRect.y + sourceRect.height, targetRect.y + targetRect.height) - Math.min(sourceRect.y, targetRect.y)
        }]
      : [sourceRect, targetRect]

  const mask = sourceSelection.mask
  const opaquePaletteIds = layer.format === 'indexed'
    ? new Set(document.palette.filter((entry) => entry.id !== 0 && entry.color.a !== 0).map((entry) => entry.id))
    : null
  const isOpaque = (value: number): boolean => layer.format === 'rgba' ? (value >>> 24) !== 0 : opaquePaletteIds!.has(value)
  const packedPixels = layer.format === 'rgba' && layer.pixels.byteOffset % 4 === 0
    ? new Uint32Array(layer.pixels.buffer as ArrayBuffer, layer.pixels.byteOffset, layer.pixels.byteLength / 4)
    : null
  const readPacked = (index: number): number => layer.format === 'indexed' ? layer.pixels[index] : packedPixels ? packedPixels[index] : readLayerPacked(document, layer, index)
  const writePacked = (index: number, value: number): void => {
    if (layer.format === 'indexed') layer.pixels[index] = value
    else if (packedPixels) packedPixels[index] = value
    else writeLayerPacked(document, layer, index, value)
  }
  const nextValueAt = (x: number, y: number, before: number): number => {
    let next = before
    if (!copy) {
      const localX = x - sourceSelection.x
      const localY = y - sourceSelection.y
      if (localX >= 0 && localY >= 0 && localX < sourceSelection.width && localY < sourceSelection.height) {
        const offset = localY * sourceSelection.width + localX
        if (!mask || mask[offset] === 1) next = 0
      }
    }
    const targetX = x - target.x
    const targetY = y - target.y
    if (targetX >= 0 && targetY >= 0 && targetX < target.width && targetY < target.height) {
      const offset = targetY * sourceSelection.width + targetX
      if ((!mask || mask[offset] === 1) && isOpaque(source.values[offset])) next = source.values[offset]
    }
    return next
  }

  let changedCount = 0
  let dirtyLeft = Number.POSITIVE_INFINITY
  let dirtyTop = Number.POSITIVE_INFINITY
  let dirtyRight = Number.NEGATIVE_INFINITY
  let dirtyBottom = Number.NEGATIVE_INFINITY
  for (const region of regions) {
    for (let y = region.y; y < region.y + region.height; y += 1) {
      let index = (y - layer.offsetY) * layer.width + region.x - layer.offsetX
      for (let x = region.x; x < region.x + region.width; x += 1, index += 1) {
        const before = readPacked(index)
        if (nextValueAt(x, y, before) === before) continue
        changedCount += 1
        dirtyLeft = Math.min(dirtyLeft, x)
        dirtyTop = Math.min(dirtyTop, y)
        dirtyRight = Math.max(dirtyRight, x + 1)
        dirtyBottom = Math.max(dirtyBottom, y + 1)
      }
    }
  }
  if (changedCount === 0) return null

  const edit = beginPixelEdit(layer.id)
  preparePixelEdit(document, edit)
  edit.dirtyRect = { x: dirtyLeft, y: dirtyTop, width: dirtyRight - dirtyLeft, height: dirtyBottom - dirtyTop }
  const area = regions.reduce((sum, region) => sum + region.width * region.height, 0)
  const useDenseRegion = regions.length === 1 && changedCount > area / 4
  markLayerContentChanged(layer)
  if (useDenseRegion) {
    const region = regions[0]
    const beforeValues = new Uint32Array(area)
    const afterValues = new Uint32Array(area)
    const changed = new Uint8Array(area)
    let offset = 0
    for (let y = region.y; y < region.y + region.height; y += 1) {
      let index = (y - layer.offsetY) * layer.width + region.x - layer.offsetX
      for (let x = region.x; x < region.x + region.width; x += 1, index += 1, offset += 1) {
        const before = readPacked(index)
        const after = nextValueAt(x, y, before)
        beforeValues[offset] = before
        afterValues[offset] = after
        if (after === before) continue
        changed[offset] = 1
        writePacked(index, after)
      }
    }
    const storageOrigin = getLayerStorageOrigin(layer)
    edit.denseRegion = {
      x: region.x - layer.offsetX + storageOrigin.x,
      y: region.y - layer.offsetY + storageOrigin.y,
      width: region.width,
      height: region.height,
      before: beforeValues,
      after: afterValues,
      changed,
      count: changedCount
    }
    return edit
  }

  const indices = new Uint32Array(changedCount)
  const beforeValues = new Uint32Array(changedCount)
  const afterValues = new Uint32Array(changedCount)
  let changedOffset = 0
  for (const region of regions) {
    for (let y = region.y; y < region.y + region.height; y += 1) {
      let index = (y - layer.offsetY) * layer.width + region.x - layer.offsetX
      for (let x = region.x; x < region.x + region.width; x += 1, index += 1) {
        const before = readPacked(index)
        const after = nextValueAt(x, y, before)
        if (after === before) continue
        indices[changedOffset] = index
        beforeValues[changedOffset] = before
        afterValues[changedOffset] = after
        writePacked(index, after)
        changedOffset += 1
      }
    }
  }
  edit.points = { indices, before: beforeValues, after: afterValues, count: changedCount }
  return edit
}

export function restoreSelectionTranslationPreview(document: SpriteDocument, preview: SelectionTranslationPreview): void {
  const layer = getLayer(document, preview.layerId)
  if (preview.count > 0) markLayerContentChanged(layer)
  for (let offset = 0; offset < preview.count; offset += 1) writeLayerPacked(document, layer, preview.indices[offset], preview.before[offset])
}

export function applySelectionTranslationPreview(
  document: SpriteDocument,
  source: SelectionTransformSource,
  target: SelectionRect,
  copy = false,
  reusable?: SelectionTranslationPreview | null,
  targetLayer?: RasterLayer,
  clipRect?: SelectionRect,
  tileRepeatMode: TileRepeatMode = 'off'
): SelectionTranslationPreview {
  const layer = targetLayer ?? getActiveLayer(document)
  if (reusable) restoreSelectionTranslationPreview(document, reusable)
  else if (layer.kind === 'tilemap') markLayerContentChanged(layer)
  ensureLayerCoversCanvas(document, layer)
  const visibleLeft = Math.max(0, target.x)
  const visibleTop = Math.max(0, target.y)
  const visibleRight = Math.min(document.width, target.x + target.width)
  const visibleBottom = Math.min(document.height, target.y + target.height)
  const visiblePixels = Math.max(0, visibleRight - visibleLeft) * Math.max(0, visibleBottom - visibleTop)
  const repeatCandidateCount = source.opaqueOffsets.length > 0 ? source.opaqueOffsets.length : source.values.length
  const required = tileRepeatMode !== 'off'
    ? Math.max(1, Math.min(document.width * document.height, repeatCandidateCount * (copy || source.origin === 'clipboard' ? 1 : 2)))
    : source.origin === 'clipboard'
      ? Math.max(1, visiblePixels)
      : Math.max(1, source.opaqueOffsets.length > 0 ? source.opaqueOffsets.length * 2 : source.values.length * 2)
  const preview: SelectionTranslationPreview = reusable && reusable.layerId === layer.id && reusable.marks.length === document.width * document.height
    ? reusable
    : {
        layerId: layer.id,
        marks: new Uint8Array(document.width * document.height),
        canvasIndices: new Uint32Array(required),
        indices: new Uint32Array(required),
        before: new Uint32Array(required),
        count: 0
      }
  for (let offset = 0; offset < preview.count; offset += 1) preview.marks[preview.canvasIndices[offset]] = 0
  preview.count = 0
  if (preview.indices.length < required) {
    preview.canvasIndices = new Uint32Array(required)
    preview.indices = new Uint32Array(required)
    preview.before = new Uint32Array(required)
  }
  const finishPreview = (): SelectionTranslationPreview => {
    if (preview.count > 0) markLayerContentChanged(layer)
    return preview
  }
  const insideClip = (x: number, y: number): boolean => !clipRect
    || (x >= clipRect.x && y >= clipRect.y && x < clipRect.x + clipRect.width && y < clipRect.y + clipRect.height)
  const capture = (canvasIndex: number): void => {
    if (preview.marks[canvasIndex] === 1) return
    const x = canvasIndex % document.width
    const y = Math.floor(canvasIndex / document.width)
    if (!insideClip(x, y)) return
    const index = layerIndexAt(layer, x, y)
    if (index === null) return
    preview.marks[canvasIndex] = 1
    preview.canvasIndices[preview.count] = canvasIndex
    preview.indices[preview.count] = index
    preview.before[preview.count] = readLayerPacked(document, layer, index)
    preview.count += 1
  }
  const writeCanvasPacked = (canvasIndex: number, value: number): void => {
    const x = canvasIndex % document.width
    const y = Math.floor(canvasIndex / document.width)
    if (!insideClip(x, y)) return
    const index = layerIndexAt(layer, x, y)
    if (index !== null) writeLayerPacked(document, layer, index, value)
  }
  const sourceSelection = source.selection
  if (tileRepeatMode !== 'off') {
    const isTransparent = (value: number): boolean => layer.format === 'rgba'
      ? (value >>> 24) === 0
      : value === 0 || getPaletteEntry(document, value).color.a === 0
    const forEachOpaqueSource = (visit: (localOffset: number, value: number) => void): void => {
      if (source.opaqueOffsets.length > 0) {
        for (let offset = 0; offset < source.opaqueOffsets.length; offset += 1) {
          visit(source.opaqueOffsets[offset], source.opaqueValues[offset])
        }
        return
      }
      for (let localOffset = 0; localOffset < source.values.length; localOffset += 1) {
        if (sourceSelection.mask && sourceSelection.mask[localOffset] !== 1) continue
        const value = source.values[localOffset]
        if (!isTransparent(value)) visit(localOffset, value)
      }
    }
    const sourceCanvasIndex = (localOffset: number): number | null => {
      const x = sourceSelection.x + localOffset % sourceSelection.width
      const y = sourceSelection.y + Math.floor(localOffset / sourceSelection.width)
      return isInBounds(document.width, document.height, x, y) ? pixelIndex(document.width, x, y) : null
    }
    const targetCanvasIndex = (localOffset: number): number | null => {
      const point = wrapDocumentPointForTileRepeat({
        x: target.x + localOffset % sourceSelection.width,
        y: target.y + Math.floor(localOffset / sourceSelection.width)
      }, document.width, document.height, tileRepeatMode)
      return isInBounds(document.width, document.height, point.x, point.y)
        ? pixelIndex(document.width, point.x, point.y)
        : null
    }

    forEachOpaqueSource((localOffset) => {
      if (!copy && source.origin !== 'clipboard') {
        const sourceIndex = sourceCanvasIndex(localOffset)
        if (sourceIndex !== null) capture(sourceIndex)
      }
      const targetIndex = targetCanvasIndex(localOffset)
      if (targetIndex !== null) capture(targetIndex)
    })
    if (!copy && source.origin !== 'clipboard') forEachOpaqueSource((localOffset) => {
      const sourceIndex = sourceCanvasIndex(localOffset)
      if (sourceIndex !== null) writeCanvasPacked(sourceIndex, 0)
    })
    forEachOpaqueSource((localOffset, value) => {
      const targetIndex = targetCanvasIndex(localOffset)
      if (targetIndex !== null) writeCanvasPacked(targetIndex, value)
    })
    return finishPreview()
  }
  // Floating pastes are copies. Walk the visible destination rectangle instead
  // of every source pixel so a large pasted image stays responsive on a small
  // canvas, while still retaining its off-canvas pixels for later movement.
  if (copy && source.origin === 'clipboard') {
    for (let y = visibleTop; y < visibleBottom; y += 1) {
      const localY = y - target.y
      for (let x = visibleLeft; x < visibleRight; x += 1) {
        const localX = x - target.x
        const sourceX = sourceSelection.x + localX
        const sourceY = sourceSelection.y + localY
        if (!selectionContains(sourceSelection, sourceX, sourceY)) continue
        const value = source.values[localY * sourceSelection.width + localX]
        const transparent = layer.format === 'rgba'
          ? (value >>> 24) === 0
          : value === 0 || getPaletteEntry(document, value).color.a === 0
        if (transparent) continue
        const index = pixelIndex(document.width, x, y)
        capture(index)
        writeCanvasPacked(index, value)
      }
    }
    return finishPreview()
  }
  // Clipboard sources intentionally omit index arrays for large off-canvas
  // pastes. Their previous preview has already been reverted before this
  // path runs, so the stable document contains no source pixels to clear.
  // Only capture and redraw the destination; clearing sourceSelection here
  // writes transparent pixels into the next preview baseline.
  if (source.origin === 'clipboard') {
    const isTransparent = (value: number): boolean => layer.format === 'rgba'
      ? (value >>> 24) === 0
      : value === 0 || getPaletteEntry(document, value).color.a === 0
    for (let localY = 0; localY < sourceSelection.height; localY += 1) for (let localX = 0; localX < sourceSelection.width; localX += 1) {
      const sourceOffset = localY * sourceSelection.width + localX
      const sourceX = sourceSelection.x + localX
      const sourceY = sourceSelection.y + localY
      if (!selectionContains(sourceSelection, sourceX, sourceY) || isTransparent(source.values[sourceOffset])) continue
      const targetX = target.x + localX
      const targetY = target.y + localY
      if (isInBounds(document.width, document.height, targetX, targetY)) capture(pixelIndex(document.width, targetX, targetY))
    }
    for (let localY = 0; localY < sourceSelection.height; localY += 1) for (let localX = 0; localX < sourceSelection.width; localX += 1) {
      const sourceOffset = localY * sourceSelection.width + localX
      const sourceX = sourceSelection.x + localX
      const sourceY = sourceSelection.y + localY
      if (!selectionContains(sourceSelection, sourceX, sourceY) || isTransparent(source.values[sourceOffset])) continue
      const targetX = target.x + localX
      const targetY = target.y + localY
      if (isInBounds(document.width, document.height, targetX, targetY)) writeCanvasPacked(pixelIndex(document.width, targetX, targetY), source.values[sourceOffset])
    }
    return finishPreview()
  }
  for (let offset = 0; offset < source.opaqueIndices.length; offset += 1) {
    const sourceIndex = source.opaqueIndices[offset]
    if (!copy) capture(sourceIndex)
    const localOffset = source.opaqueOffsets[offset]
    const x = target.x + localOffset % sourceSelection.width
    const y = target.y + Math.floor(localOffset / sourceSelection.width)
    if (isInBounds(document.width, document.height, x, y)) capture(pixelIndex(document.width, x, y))
  }
  if (!copy) {
    for (let offset = 0; offset < source.opaqueIndices.length; offset += 1) writeCanvasPacked(source.opaqueIndices[offset], 0)
  }
  for (let offset = 0; offset < source.opaqueIndices.length; offset += 1) {
    const localOffset = source.opaqueOffsets[offset]
    const x = target.x + localOffset % sourceSelection.width
    const y = target.y + Math.floor(localOffset / sourceSelection.width)
    if (isInBounds(document.width, document.height, x, y)) writeCanvasPacked(pixelIndex(document.width, x, y), source.opaqueValues[offset])
  }
  return finishPreview()
}

export function selectionTranslationPreviewEdit(document: SpriteDocument, preview: SelectionTranslationPreview): PixelEdit | null {
  const layer = getLayer(document, preview.layerId)
  if (preview.count === 0) return null
  const edit = beginPixelEdit(layer.id)
  preparePixelEdit(document, edit)
  const compact = preview.count >= SELECTION_TRANSLATION_POINT_HISTORY_THRESHOLD
  const pointIndices = compact ? new Uint32Array(preview.count) : null
  const pointBefore = compact ? new Uint32Array(preview.count) : null
  const pointAfter = compact ? new Uint32Array(preview.count) : null
  const storageOrigin = getLayerStorageOrigin(layer)
  let changed = 0
  let left = Number.POSITIVE_INFINITY
  let top = Number.POSITIVE_INFINITY
  let right = Number.NEGATIVE_INFINITY
  let bottom = Number.NEGATIVE_INFINITY
  for (let offset = 0; offset < preview.count; offset += 1) {
    const index = preview.indices[offset]
    const before = preview.before[offset]
    const after = readLayerPacked(document, layer, index)
    if (before === after) continue
    if (compact) {
      pointIndices![changed] = index
      pointBefore![changed] = before
      pointAfter![changed] = after
    } else {
      edit.before.set(index, before)
      edit.after.set(index, after)
    }
    const x = index % layer.width + storageOrigin.x
    const y = Math.floor(index / layer.width) + storageOrigin.y
    left = Math.min(left, x)
    top = Math.min(top, y)
    right = Math.max(right, x + 1)
    bottom = Math.max(bottom, y + 1)
    changed += 1
  }
  if (changed === 0) return null
  edit.dirtyRect = { x: left, y: top, width: right - left, height: bottom - top }
  if (compact) edit.points = {
    indices: changed === pointIndices!.length ? pointIndices! : pointIndices!.slice(0, changed),
    before: changed === pointBefore!.length ? pointBefore! : pointBefore!.slice(0, changed),
    after: changed === pointAfter!.length ? pointAfter! : pointAfter!.slice(0, changed),
    count: changed
  }
  return edit
}

function selectionTransformCells(document: SpriteDocument, sourceData: SelectionTransformSource, target: SelectionRect, angle: number, shear?: SelectionShearTransform, targetLayer?: RasterLayer, quad?: SelectionQuad, pixelCenteredSampling = false): TransformCell[] {
  const source = sourceData.selection
  const transformedBounds = quad ? selectionQuadBounds(quad) : transformedSelectionBounds(target, angle, shear)
  const destination = clampSelection(document, {
    x: Math.floor(transformedBounds.x),
    y: Math.floor(transformedBounds.y),
    width: Math.ceil(transformedBounds.x + transformedBounds.width) - Math.floor(transformedBounds.x),
    height: Math.ceil(transformedBounds.y + transformedBounds.height) - Math.floor(transformedBounds.y)
  })
  if (!destination) return []
  const cells = new Map<number, TransformCell>()
  const layer = targetLayer ?? getActiveLayer(document)
  const isOpaqueValue = (value: number): boolean => layer.format === 'rgba'
    ? (value >>> 24) !== 0
    : value !== 0 && getPaletteEntry(document, value).color.a !== 0
  if (quad) {
    const transform = selectionQuadTransformFor(source, quad)
    const sourceTransform = sourceData.sourceQuad ? selectionQuadTransformFor(source, sourceData.sourceQuad) : null
    if (!transform || (sourceData.sourceQuad && !sourceTransform)) return []
    for (let y = destination.y; y < destination.y + destination.height; y += 1) {
      for (let x = destination.x; x < destination.x + destination.width; x += 1) {
        const normalized = selectionQuadSourcePoint(transform, { x: x + 0.5, y: y + 0.5 })
        if (!normalized || normalized.x < -1e-9 || normalized.x > 1 + 1e-9 || normalized.y < -1e-9 || normalized.y > 1 + 1e-9) continue
        const sourcePoint = sourceTransform
          ? selectionQuadPoint(sourceTransform, normalized.x, normalized.y)
          : null
        const sourceX = sourcePoint
          ? Math.floor(sourcePoint.x)
          : source.x + Math.min(source.width - 1, Math.max(0, Math.floor(normalized.x * source.width)))
        const sourceY = sourcePoint
          ? Math.floor(sourcePoint.y)
          : source.y + Math.min(source.height - 1, Math.max(0, Math.floor(normalized.y * source.height)))
        if (sourceX < source.x || sourceY < source.y || sourceX >= source.x + source.width || sourceY >= source.y + source.height) continue
        if (!selectionContains(source, sourceX, sourceY)) continue
        const sourceOffset = (sourceY - source.y) * source.width + sourceX - source.x
        const value = sourceData.values[sourceOffset]
        if (!isOpaqueValue(value)) continue
        cells.set(pixelIndex(document.width, x, y), {
          x,
          y,
          sourceIndex: pixelIndex(document.width, sourceX, sourceY),
          value
        })
      }
    }
    return [...cells.values()]
  }
  const normalizedAngle = ((angle % 360) + 360) % 360
  const pixelPreservingRotation = Boolean(
    normalizedAngle !== 0
    && !shear
    && !target.flipHorizontal
    && !target.flipVertical
    && target.width === source.width
    && target.height === source.height
  )
  if (pixelPreservingRotation) {
    const addForwardMappedCell = (sourceOffset: number): void => {
      if (!isOpaqueValue(sourceData.values[sourceOffset])) return
      const localX = sourceOffset % source.width
      const localY = Math.floor(sourceOffset / source.width)
      const mapped = transformedSelectionDestinationPoint(source, target, source.x + localX, source.y + localY, angle)
      const x = Math.floor(mapped.x)
      const y = Math.floor(mapped.y)
      if (x < destination.x || y < destination.y || x >= destination.x + destination.width || y >= destination.y + destination.height) return
      const destinationIndex = pixelIndex(document.width, x, y)
      if (cells.has(destinationIndex)) return
      cells.set(destinationIndex, {
        x,
        y,
        sourceIndex: pixelIndex(document.width, source.x + localX, source.y + localY),
        value: sourceData.values[sourceOffset]
      })
    }
    if (sourceData.opaqueOffsets.length > 0) {
      for (const sourceOffset of sourceData.opaqueOffsets) addForwardMappedCell(sourceOffset)
    } else forEachSelectedSourceOffset(sourceData, addForwardMappedCell)

    const inverseCandidates = new Map<number, TransformCell>()
    for (let y = destination.y; y < destination.y + destination.height; y += 1) {
      for (let x = destination.x; x < destination.x + destination.width; x += 1) {
        const sourcePoint = transformedSelectionSourcePoint(source, target, x, y, angle)
        if (!sourcePoint) continue
        const sourceOffset = (sourcePoint.y - source.y) * source.width + sourcePoint.x - source.x
        const value = sourceData.values[sourceOffset]
        if (!isOpaqueValue(value)) continue
        const destinationIndex = pixelIndex(document.width, x, y)
        if (cells.has(destinationIndex)) continue
        inverseCandidates.set(destinationIndex, {
          x,
          y,
          sourceIndex: pixelIndex(document.width, sourcePoint.x, sourcePoint.y),
          value
        })
      }
    }

    // Forward mapping keeps thin pixel-art contours from growing. Fill only
    // inverse-sampled points enclosed by the existing result so solid areas do
    // not develop checkerboard holes while isolated edge duplicates stay out.
    let added = true
    while (added && inverseCandidates.size > 0) {
      added = false
      const additions: Array<[number, TransformCell]> = []
      for (const [destinationIndex, cell] of inverseCandidates) {
        const neighbors = [
          [cell.x - 1, cell.y],
          [cell.x + 1, cell.y],
          [cell.x, cell.y - 1],
          [cell.x, cell.y + 1]
        ]
        let occupiedNeighbors = 0
        for (const [neighborX, neighborY] of neighbors) {
          if (!isInBounds(document.width, document.height, neighborX, neighborY)) continue
          if (cells.has(pixelIndex(document.width, neighborX, neighborY))) occupiedNeighbors += 1
        }
        if (occupiedNeighbors >= 2) additions.push([destinationIndex, cell])
      }
      for (const [destinationIndex, cell] of additions) {
        cells.set(destinationIndex, cell)
        inverseCandidates.delete(destinationIndex)
        added = true
      }
    }
    return [...cells.values()]
  }
  for (let y = destination.y; y < destination.y + destination.height; y += 1) {
    for (let x = destination.x; x < destination.x + destination.width; x += 1) {
      const sourcePoint = transformedSelectionSourcePoint(source, target, x, y, angle, shear, pixelCenteredSampling)
      if (!sourcePoint) continue
      const sourceX = Math.floor(sourcePoint.x)
      const sourceY = Math.floor(sourcePoint.y)
      if (sourceX < source.x || sourceY < source.y || sourceX >= source.x + source.width || sourceY >= source.y + source.height) continue
      const sourceIndex = pixelIndex(document.width, sourceX, sourceY)
      const sourceOffset = (sourceY - source.y) * source.width + sourceX - source.x
      cells.set(pixelIndex(document.width, x, y), { x, y, sourceIndex, value: sourceData.values[sourceOffset] })
    }
  }
  return [...cells.values()]
}

export function selectionTransformPreviewPacked(
  document: SpriteDocument,
  source: SelectionTransformSource,
  target: SelectionRect,
  startX: number,
  startY: number,
  width: number,
  height: number,
  angle = 0,
  shear?: SelectionShearTransform,
  targetLayer?: RasterLayer,
  reusable?: Uint32Array,
  quad?: SelectionQuad
): Uint32Array {
  const size = Math.max(0, width * height)
  const output = reusable?.length === size ? reusable : new Uint32Array(size)
  output.fill(0)
  if (width <= 0 || height <= 0) return output
  const layer = targetLayer ?? getActiveLayer(document)
  const simpleInverseTransform = angle % 360 === 0 && !shear && !quad
  if (simpleInverseTransform) {
    const right = Math.min(document.width, startX + width, Math.ceil(target.x + target.width))
    const bottom = Math.min(document.height, startY + height, Math.ceil(target.y + target.height))
    const left = Math.max(0, startX, Math.floor(target.x))
    const top = Math.max(0, startY, Math.floor(target.y))
    for (let y = top; y < bottom; y += 1) for (let x = left; x < right; x += 1) {
      const sourcePoint = transformedSelectionSourcePoint(source.selection, target, x, y)
      if (!sourcePoint) continue
      const sourceOffset = (sourcePoint.y - source.selection.y) * source.selection.width + sourcePoint.x - source.selection.x
      output[(y - startY) * width + x - startX] = source.values[sourceOffset]
    }
    return output
  }
  for (const cell of selectionTransformCells(document, source, target, angle, shear, layer, quad)) {
    if (cell.x < startX || cell.y < startY || cell.x >= startX + width || cell.y >= startY + height) continue
    output[(cell.y - startY) * width + cell.x - startX] = cell.value
  }
  return output
}

export interface SelectionTransformPreviewRasterPacked {
  width: number
  height: number
  pixels: Uint32Array
}

/** Rasterizes a transform in local coordinates so integer movement can reuse the same pixels. */
export function selectionTransformPreviewRasterPacked(
  document: SpriteDocument,
  source: SelectionTransformSource,
  target: SelectionRect,
  angle = 0,
  shear?: SelectionShearTransform,
  targetLayer?: RasterLayer,
  quad?: SelectionQuad
): SelectionTransformPreviewRasterPacked {
  const transformedBounds = quad ? selectionQuadBounds(quad) : transformedSelectionBounds(target, angle, shear)
  const left = Math.floor(transformedBounds.x)
  const top = Math.floor(transformedBounds.y)
  const right = Math.ceil(transformedBounds.x + transformedBounds.width)
  const bottom = Math.ceil(transformedBounds.y + transformedBounds.height)
  const width = Math.max(0, right - left)
  const height = Math.max(0, bottom - top)
  if (width === 0 || height === 0) return { width, height, pixels: new Uint32Array(0) }

  const shiftX = -left
  const shiftY = -top
  const shiftedTarget: SelectionRect = {
    ...target,
    x: target.x + shiftX,
    y: target.y + shiftY,
    ...(Number.isFinite(target.flipOriginX) ? { flipOriginX: target.flipOriginX! + shiftX } : {}),
    ...(Number.isFinite(target.flipOriginY) ? { flipOriginY: target.flipOriginY! + shiftY } : {})
  }
  const shiftedQuad = quad
    ? {
        nw: { x: quad.nw.x + shiftX, y: quad.nw.y + shiftY },
        ne: { x: quad.ne.x + shiftX, y: quad.ne.y + shiftY },
        se: { x: quad.se.x + shiftX, y: quad.se.y + shiftY },
        sw: { x: quad.sw.x + shiftX, y: quad.sw.y + shiftY }
      }
    : undefined
  const shiftedSource: SelectionTransformSource = {
    ...source,
    selection: {
      ...source.selection,
      x: source.selection.x + shiftX,
      y: source.selection.y + shiftY
    },
    sourceQuad: source.sourceQuad
      ? {
          nw: { x: source.sourceQuad.nw.x + shiftX, y: source.sourceQuad.nw.y + shiftY },
          ne: { x: source.sourceQuad.ne.x + shiftX, y: source.sourceQuad.ne.y + shiftY },
          se: { x: source.sourceQuad.se.x + shiftX, y: source.sourceQuad.se.y + shiftY },
          sw: { x: source.sourceQuad.sw.x + shiftX, y: source.sourceQuad.sw.y + shiftY }
        }
      : undefined
  }
  const localDocument = {
    width,
    height,
    palette: document.palette
  } as SpriteDocument
  return {
    width,
    height,
    pixels: selectionTransformPreviewPacked(
      localDocument,
      shiftedSource,
      shiftedTarget,
      0,
      0,
      width,
      height,
      angle,
      shear,
      targetLayer,
      undefined,
      shiftedQuad
    )
  }
}

export function transformRgbaSelectionSurface(
  surface: Extract<AnimationCelSurface, { format: 'rgba' }>,
  sourceSelection: SelectionRect,
  target: SelectionRect,
  angle = 0,
  shear?: SelectionShearTransform
): Extract<AnimationCelSurface, { format: 'rgba' }> {
  const destinationBounds = transformedSelectionBounds(target, angle, shear)
  const left = Math.min(sourceSelection.x, destinationBounds.x)
  const top = Math.min(sourceSelection.y, destinationBounds.y)
  const right = Math.max(sourceSelection.x + sourceSelection.width, destinationBounds.x + destinationBounds.width)
  const bottom = Math.max(sourceSelection.y + sourceSelection.height, destinationBounds.y + destinationBounds.height)
  const shiftX = -left
  const shiftY = -top
  const width = Math.max(1, right - left)
  const height = Math.max(1, bottom - top)
  const virtualDocument = { width, height, palette: [] } as unknown as SpriteDocument
  const virtualLayer: RasterLayer = {
    id: 'text-transform', name: '', visible: true, locked: false, opacity: 1, blendMode: 'normal',
    format: 'rgba', width: 1, height: 1, offsetX: 0, offsetY: 0, pixels: new Uint8ClampedArray(4)
  }
  const shiftedSource: SelectionMask = {
    x: sourceSelection.x + shiftX,
    y: sourceSelection.y + shiftY,
    width: sourceSelection.width,
    height: sourceSelection.height
  }
  const values = new Uint32Array(shiftedSource.width * shiftedSource.height)
  const selectedOffsets = new Uint32Array(values.length)
  const opaqueOffsets: number[] = []
  const opaqueIndices: number[] = []
  const opaqueValues: number[] = []
  for (let localY = 0; localY < shiftedSource.height; localY += 1) {
    for (let localX = 0; localX < shiftedSource.width; localX += 1) {
      const offset = localY * shiftedSource.width + localX
      selectedOffsets[offset] = offset
      const sourceX = sourceSelection.x + localX - surface.offsetX
      const sourceY = sourceSelection.y + localY - surface.offsetY
      if (sourceX < 0 || sourceY < 0 || sourceX >= surface.width || sourceY >= surface.height) continue
      const pixelOffset = (sourceY * surface.width + sourceX) * 4
      const value = surface.pixels[pixelOffset]
        | surface.pixels[pixelOffset + 1] << 8
        | surface.pixels[pixelOffset + 2] << 16
        | surface.pixels[pixelOffset + 3] << 24
      values[offset] = value >>> 0
      if (surface.pixels[pixelOffset + 3] === 0) continue
      opaqueOffsets.push(offset)
      opaqueIndices.push(pixelIndex(width, shiftedSource.x + localX, shiftedSource.y + localY))
      opaqueValues.push(value >>> 0)
    }
  }
  const sourceData: SelectionTransformSource = {
    selection: shiftedSource,
    values,
    selectedOffsets,
    opaqueOffsets: Uint32Array.from(opaqueOffsets),
    opaqueIndices: Uint32Array.from(opaqueIndices),
    opaqueValues: Uint32Array.from(opaqueValues)
  }
  const shiftedTarget = { ...target, x: target.x + shiftX, y: target.y + shiftY }
  const shiftedBounds = transformedSelectionBounds(shiftedTarget, angle, shear)
  const pixels = new Uint8ClampedArray(shiftedBounds.width * shiftedBounds.height * 4)
  for (const cell of selectionTransformCells(virtualDocument, sourceData, shiftedTarget, angle, shear, virtualLayer)) {
    const localX = cell.x - shiftedBounds.x
    const localY = cell.y - shiftedBounds.y
    if (localX < 0 || localY < 0 || localX >= shiftedBounds.width || localY >= shiftedBounds.height) continue
    const offset = (localY * shiftedBounds.width + localX) * 4
    pixels[offset] = cell.value & 0xff
    pixels[offset + 1] = (cell.value >>> 8) & 0xff
    pixels[offset + 2] = (cell.value >>> 16) & 0xff
    pixels[offset + 3] = (cell.value >>> 24) & 0xff
  }
  return {
    format: 'rgba',
    width: shiftedBounds.width,
    height: shiftedBounds.height,
    offsetX: shiftedBounds.x - shiftX,
    offsetY: shiftedBounds.y - shiftY,
    pixels
  }
}

const isSymmetryRepresentative = (point: { x: number; y: number }, selection: SelectionMask, document: SpriteDocument, axes?: SymmetryAxes, center?: SymmetryCenter): boolean => {
  if (!hasSymmetry(axes)) return true
  const candidates = symmetryPoints(point, document.width, document.height, axes, center).filter((candidate) => selectionContains(selection, candidate.x, candidate.y))
  const currentKey = point.y * document.width + point.x
  return candidates.every((candidate) => currentKey <= candidate.y * document.width + candidate.x)
}

export function selectionTransformPreview(document: SpriteDocument, selection: SelectionMask, target: SelectionRect, angle = 0, shear?: SelectionShearTransform, symmetryAxes?: SymmetryAxes, symmetryCenter?: SymmetryCenter, targetLayer?: RasterLayer, quad?: SelectionQuad): Uint8ClampedArray {
  const outputBounds = quad ? selectionQuadBounds(quad) : target
  const output = new Uint8ClampedArray(outputBounds.width * outputBounds.height * 4)
  const layer = targetLayer ?? getActiveLayer(document)
  const source = captureSelectionTransform(document, selection, layer)
  if (!source) return output
  for (const cell of selectionTransformCells(document, source, target, angle, shear, layer, quad)) {
    const sourcePoint = { x: cell.sourceIndex % document.width, y: Math.floor(cell.sourceIndex / document.width) }
    if (!isSymmetryRepresentative(sourcePoint, source.selection, document, symmetryAxes, symmetryCenter)) continue
    const color = layer.format === 'indexed' ? getPaletteEntry(document, cell.value).color : unpackColor(cell.value)
    for (const destination of symmetryPoints({ x: cell.x, y: cell.y }, document.width, document.height, symmetryAxes, symmetryCenter)) {
      const localX = destination.x - outputBounds.x
      const localY = destination.y - outputBounds.y
      if (localX < 0 || localY < 0 || localX >= outputBounds.width || localY >= outputBounds.height) continue
      const offset = (localY * outputBounds.width + localX) * 4
      output[offset] = color.r
      output[offset + 1] = color.g
      output[offset + 2] = color.b
      output[offset + 3] = color.a
    }
  }
  return output
}

export function transformSelectionCopy(document: SpriteDocument, selection: SelectionMask, target: SelectionRect, angle = 0, shear?: SelectionShearTransform, symmetryAxes?: SymmetryAxes, symmetryCenter?: SymmetryCenter, targetLayer?: RasterLayer, quad?: SelectionQuad): PixelEdit | null {
  const layer = targetLayer ?? getActiveLayer(document)
  const source = captureSelectionTransform(document, selection, layer)
  return source ? applySelectionTransform(document, source, target, angle, true, shear, symmetryAxes, symmetryCenter, layer, undefined, quad) : null
}

export function applySelectionTransform(document: SpriteDocument, source: SelectionTransformSource, target: SelectionRect, angle = 0, copy = false, shear?: SelectionShearTransform, symmetryAxes?: SymmetryAxes, symmetryCenter?: SymmetryCenter, targetLayer?: RasterLayer, symmetryStartPoint?: SymmetryPoint, quad?: SelectionQuad, pixelCenteredSampling = false): PixelEdit | null {
  const layer = targetLayer ?? getActiveLayer(document)
  if (isLayerEffectivelyLocked(document, layer)) return null
  if (!ensureLayerCoversCanvas(document, layer)) return null
  const edit = beginPixelEdit(layer.id)
  const sourceSelection = source.selection
  const normalizedAngle = ((angle % 360) + 360) % 360
  const recordCanvasPixel = (x: number, y: number, value: number): void => {
    const index = layerIndexAt(layer, x, y)
    if (index !== null) recordPixel(document, layer, edit, index, value)
  }
  const symmetryRegion = symmetryStartPoint
    && normalizedAngle === 0
    && !shear
    && !quad
    && !target.flipHorizontal
    && !target.flipVertical
    && target.width === sourceSelection.width
    && target.height === sourceSelection.height
    && Number.isInteger(target.x)
    && Number.isInteger(target.y)
    ? symmetrySelectionDragRegion(sourceSelection, symmetryStartPoint, document.width, document.height, symmetryAxes, symmetryCenter)
    : null
  if (symmetryRegion) {
    if (!copy) forEachSelectedSourceOffset(source, (offset) => {
      const localX = offset % sourceSelection.width
      const localY = Math.floor(offset / sourceSelection.width)
      recordCanvasPixel(sourceSelection.x + localX, sourceSelection.y + localY, 0)
    })
    const written = new Set<number>()
    const deltaX = target.x - sourceSelection.x
    const deltaY = target.y - sourceSelection.y
    for (let y = symmetryRegion.y; y < symmetryRegion.y + symmetryRegion.height; y += 1) {
      for (let x = symmetryRegion.x; x < symmetryRegion.x + symmetryRegion.width; x += 1) {
        if (!selectionContains(symmetryRegion, x, y)) continue
        const sourceOffset = (y - sourceSelection.y) * sourceSelection.width + x - sourceSelection.x
        const value = source.values[sourceOffset]
        const transparent = layer.format === 'rgba'
          ? unpackColor(value).a === 0
          : value === 0 || getPaletteEntry(document, value).color.a === 0
        if (transparent) continue
        for (const destination of symmetryPoints({ x: x + deltaX, y: y + deltaY }, document.width, document.height, symmetryAxes, symmetryCenter)) {
          if (!isInBounds(document.width, document.height, destination.x, destination.y)) continue
          const index = layerIndexAt(layer, destination.x, destination.y)
          if (index === null || written.has(index)) continue
          written.add(index)
          recordCanvasPixel(destination.x, destination.y, value)
        }
      }
    }
    return edit.before.size > 0 ? edit : null
  }

  // Moving an unscaled selection is the common interactive path. Iterate its
  // captured offsets directly instead of allocating a TransformCell per pixel.
  if (!hasSymmetry(symmetryAxes) && normalizedAngle === 0 && !shear && !quad && Number.isInteger(target.x) && Number.isInteger(target.y) && target.width === sourceSelection.width && target.height === sourceSelection.height && !target.flipHorizontal && !target.flipVertical) {
    if (!copy) {
      forEachSelectedSourceOffset(source, (offset) => {
        const localX = offset % sourceSelection.width
        const localY = Math.floor(offset / sourceSelection.width)
        recordCanvasPixel(sourceSelection.x + localX, sourceSelection.y + localY, 0)
      })
    }
    if (copy) {
      const left = Math.max(0, target.x)
      const top = Math.max(0, target.y)
      const right = Math.min(document.width, target.x + target.width)
      const bottom = Math.min(document.height, target.y + target.height)
      for (let y = top; y < bottom; y += 1) for (let x = left; x < right; x += 1) {
        const localX = x - target.x
        const localY = y - target.y
        const sourceX = sourceSelection.x + localX
        const sourceY = sourceSelection.y + localY
        if (!selectionContains(sourceSelection, sourceX, sourceY)) continue
        const value = source.values[localY * sourceSelection.width + localX]
        const transparent = layer.format === 'rgba'
          ? (value >>> 24) === 0
          : value === 0 || getPaletteEntry(document, value).color.a === 0
        if (!transparent) recordCanvasPixel(x, y, value)
      }
    } else forEachSelectedSourceOffset(source, (offset) => {
      const localX = offset % sourceSelection.width
      const localY = Math.floor(offset / sourceSelection.width)
      const x = target.x + localX
      const y = target.y + localY
      if (!isInBounds(document.width, document.height, x, y)) return
      const value = source.values[offset]
      const transparent = layer.format === 'rgba'
        ? unpackColor(value).a === 0
        : value === 0 || getPaletteEntry(document, value).color.a === 0
      if (!transparent) recordCanvasPixel(x, y, value)
    })
    return edit.before.size > 0 ? edit : null
  }

  if (!copy) {
    const selection = sourceSelection
    for (let y = selection.y; y < selection.y + selection.height; y += 1) {
      for (let x = selection.x; x < selection.x + selection.width; x += 1) {
        if (!selectionContains(selection, x, y)) continue
        recordCanvasPixel(x, y, 0)
      }
    }
  }
  for (const cell of selectionTransformCells(document, source, target, angle, shear, layer, quad, pixelCenteredSampling)) {
    const sourcePoint = { x: cell.sourceIndex % document.width, y: Math.floor(cell.sourceIndex / document.width) }
    if (!isSymmetryRepresentative(sourcePoint, sourceSelection, document, symmetryAxes, symmetryCenter)) continue
    const transparent = layer.format === 'rgba'
      ? unpackColor(cell.value).a === 0
      : cell.value === 0 || getPaletteEntry(document, cell.value).color.a === 0
    if (transparent) continue
    for (const destination of symmetryPoints({ x: cell.x, y: cell.y }, document.width, document.height, symmetryAxes, symmetryCenter)) recordCanvasPixel(destination.x, destination.y, cell.value)
  }
  return edit.before.size > 0 ? edit : null
}

export function moveSelection(document: SpriteDocument, selection: SelectionMask, deltaX: number, deltaY: number, copy = false, targetLayer?: RasterLayer): PixelEdit | null {
  if (deltaX === 0 && deltaY === 0) return null
  const layer = targetLayer ?? getActiveLayer(document)
  const source = captureSelectionTransform(document, selection, layer)
  return source ? applySelectionTransform(document, source, { ...selection, x: selection.x + deltaX, y: selection.y + deltaY }, 0, copy, undefined, undefined, undefined, layer) : null
}

export function flipSelection(document: SpriteDocument, selection: SelectionMask, axis: 'horizontal' | 'vertical', targetLayer?: RasterLayer): PixelEdit | null {
  const layer = targetLayer ?? getActiveLayer(document)
  if (isLayerEffectivelyLocked(document, layer) || !ensureLayerCoversCanvas(document, layer)) return null
  const source = captureSelectionTransform(document, selection, layer)
  if (!source) return null
  const edit = beginPixelEdit(layer.id)
  const recordCanvasPacked = (x: number, y: number, value: number): void => {
    if (!isInBounds(document.width, document.height, x, y)) return
    const index = layerIndexAt(layer, x, y)
    if (index !== null) recordPixel(document, layer, edit, index, value)
  }

  forEachSelectedSourceOffset(source, (offset) => {
    const localX = offset % source.selection.width
    const localY = Math.floor(offset / source.selection.width)
    recordCanvasPacked(source.selection.x + localX, source.selection.y + localY, 0)
  })
  forEachSelectedSourceOffset(source, (offset) => {
    const localX = offset % source.selection.width
    const localY = Math.floor(offset / source.selection.width)
    const targetX = axis === 'horizontal' ? source.selection.width - 1 - localX : localX
    const targetY = axis === 'vertical' ? source.selection.height - 1 - localY : localY
    recordCanvasPacked(source.selection.x + targetX, source.selection.y + targetY, source.values[offset])
  })
  return edit.before.size > 0 ? edit : null
}

export function flipLayer(document: SpriteDocument, axis: 'horizontal' | 'vertical'): PixelEdit | null {
  const layer = getActiveLayer(document)
  if (isLayerEffectivelyLocked(document, layer) || layer.width < 1 || layer.height < 1) return null
  const edit = beginPixelEdit(layer.id)
  const swap = (first: number, second: number): void => {
    const firstValue = readLayerPacked(document, layer, first)
    const secondValue = readLayerPacked(document, layer, second)
    recordPixel(document, layer, edit, first, secondValue)
    recordPixel(document, layer, edit, second, firstValue)
  }
  if (axis === 'horizontal') {
    for (let y = 0; y < layer.height; y += 1) for (let x = 0; x < Math.floor(layer.width / 2); x += 1) {
      swap(y * layer.width + x, y * layer.width + layer.width - 1 - x)
    }
  } else {
    for (let y = 0; y < Math.floor(layer.height / 2); y += 1) for (let x = 0; x < layer.width; x += 1) {
      swap(y * layer.width + x, (layer.height - 1 - y) * layer.width + x)
    }
  }
  return edit.before.size > 0 ? edit : null
}

export const sampleCompositeColor = (document: SpriteDocument, x: number, y: number, activeLayerId?: string): RgbaColor => {
  if (!isInBounds(document.width, document.height, x, y)) return { r: 0, g: 0, b: 0, a: 0 }
  const activeBackground = activeLayerId
    ? document.layers.some((layer) => layer.id === activeLayerId && layer.background)
    : true
  const samplingDocument = activeBackground || !document.layers.some((layer) => layer.background)
    ? document
    : { ...document, layers: document.layers.filter((layer) => !layer.background) }
  const pixels = compositeRegion(samplingDocument, x, y, 1, 1)
  return { r: pixels[0], g: pixels[1], b: pixels[2], a: pixels[3] }
}
