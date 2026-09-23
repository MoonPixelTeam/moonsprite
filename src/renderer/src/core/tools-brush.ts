import type { BrushDitherSettings, BrushPaintMode, BrushShape, BrushTexture, GradientDither, ImageBrush, ImageBrushSettings, InkMode } from '@shared/types-brush'
import type { RasterLayer } from '@shared/types-layer'
import type { RgbaColor } from '@shared/types-color'
import type { SelectionMask, SelectionRect } from '@shared/types-selection'
import type { SpriteDocument } from '@shared/types-document'
import type { TileRepeatMode } from '@shared/types-raster'
import { getPaletteEntry, layerIndexAt, markLayerContentChanged, normalizeLayerPackedValue, paletteColorIdForCanvas, readLayerColor, readLayerPacked, writeLayerPacked } from './document-model'
import { preparePixelEdit, recordPixel, type PixelEdit } from './history'
import { isInBounds, packColor, unpackColor } from './raster'
import { continuousLinePoints, continuousLinePointsWithFixForLineBrush, rasterLinePoints } from './selection'
import { proceduralBrushCoverageAt } from './brushes'
import { balancedStairLinePoints } from './pixel-line'
import { hasSymmetry, symmetryPoints, symmetricSpanPainter, type SymmetryAxes, type SymmetryCenter } from './symmetry'
import { brushDitherContains, gradientColorForAmount, interpolateRgbaColor } from './gradient-color'
import { tileRepeatRectSegments, wrapDocumentPointForTileRepeat } from './tilemap'
import { applyInkColor, resolveInkStampColor } from './ink'
import { brushPaintBaselineByEdit, brushOriginalValue, brushEditParent, isSplitBrushEdit, lastBrushStampForEdit, lastBrushStampByEdit, type SolidPointRecorder, solidPointRecorderByEdit, brushCoverageByEdit, BRUSH_COVERAGE_CHUNK_BITS, BRUSH_COVERAGE_CHUNK_SIZE, BRUSH_COVERAGE_CHUNK_MASK } from './tools-pixel-edit-state'
import { compositeSelectionPixelOver, ensureLayerCoversEditRect, insideSelection, paintLayerValue, BrushGradientSample, brushStampDimensions, BrushMaskPoint, defaultImageBrushSettings, wrappedIndex, imageBrushCoverageAt, imageBrushCoverage, brushTextureContains, interpolateBrushAngle } from './tools-pixel-edit'

const compositeSelectionPixel = (document: SpriteDocument, layer: RasterLayer, index: number, value: number): number => (
  compositeSelectionPixelOver(document, layer, readLayerPacked(document, layer, index), value)
)

const layerColorBeforeEdit = (document: SpriteDocument, layer: RasterLayer, edit: PixelEdit, index: number): RgbaColor => {
  const original = brushOriginalValue(edit, index)
  if (original === undefined) return readLayerColor(document, layer, index)
  return layer.format === 'rgba' ? unpackColor(original) : getPaletteEntry(document, original).color
}

const solidPointRecorderFor = (document: SpriteDocument, layer: RasterLayer, edit: PixelEdit, packedValue: number, size: number): SolidPointRecorder | null => {
  if (isSplitBrushEdit(edit) || size < 64 || layer.offsetX !== 0 || layer.offsetY !== 0 || layer.width !== document.width || layer.height !== document.height) return null
  const existing = solidPointRecorderByEdit.get(edit)
  if (existing && existing.packedValue === packedValue) return existing
  if (existing) return null
  if (edit.before.size > 0 || edit.points || edit.runs?.length || edit.denseRegion?.count) return null
  const recorder: SolidPointRecorder = {
    packedValue,
    seen: new Uint8Array(Math.ceil(layer.width * layer.height / 8)),
    indices: new Uint32Array(Math.max(4096, Math.min(layer.width * layer.height, size * size * 2))),
    before: new Uint32Array(Math.max(4096, Math.min(layer.width * layer.height, size * size * 2))),
    after: new Uint32Array(Math.max(4096, Math.min(layer.width * layer.height, size * size * 2))),
    count: 0
  }
  solidPointRecorderByEdit.set(edit, recorder)
  return recorder
}

const appendSolidPoint = (recorder: SolidPointRecorder, index: number, before: number): void => {
  const byte = index >> 3
  const mask = 1 << (index & 7)
  if (recorder.seen[byte] & mask) return
  recorder.seen[byte] |= mask
  if (recorder.count >= recorder.indices.length) {
    const nextLength = Math.min(recorder.seen.length * 8, Math.max(recorder.indices.length * 2, recorder.indices.length + 4096))
    const indices = new Uint32Array(nextLength)
    const beforeValues = new Uint32Array(nextLength)
    const afterValues = new Uint32Array(nextLength)
    indices.set(recorder.indices)
    beforeValues.set(recorder.before)
    afterValues.set(recorder.after)
    recorder.indices = indices
    recorder.before = beforeValues
    recorder.after = afterValues
  }
  recorder.indices[recorder.count] = index
  recorder.before[recorder.count] = before
  recorder.after[recorder.count] = recorder.packedValue
  recorder.count += 1
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
  const parent = brushEditParent(edit)
  const inheritedCoverage = parent ? brushCoverageByEdit.get(parent)?.get(key)?.chunks.get(chunkIndex)?.[offset] ?? 0 : 0
  const previousCoverage = Math.max(chunk[offset], inheritedCoverage) - 1
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
  angle = 0,
  optimizedRotation = true,
  inkMode: InkMode = 'simple'
): void {
  const normalizedOpacityScale = Math.max(0, Math.min(1, Number.isFinite(opacityScale) ? opacityScale : 1))
  if (normalizedOpacityScale <= 0 && inkMode !== 'copy-alpha-color') return
  const recordedPixelCount = edit.before.size
  const geometryAngle = !imageBrush && (size <= 1 || shape === 'round') ? 0 : angle
  const stamp = brushStampDimensions(size, imageBrush, geometryAngle, shape)
  const { x: beforeX, y: beforeY } = brushStampAnchor(size, imageBrush, geometryAngle, shape)
  const stampX = x - beforeX
  const stampY = y - beforeY
  const footprint = symmetricRect(document, { x: stampX, y: stampY, width: stamp.width, height: stamp.height }, symmetryAxes, symmetryCenter, tileRepeatMode)
  if (!ensureLayerCoversEditRect(document, layer, edit, footprint)) return
  const offsets = brushMaskOffsets(size, shape, texture, textureScale, stampX, stampY, imageBrush, imageBrushSettings, proceduralAntialiasStrength, brushPaintMode, patternOrigin?.x ?? stampX, patternOrigin?.y ?? stampY, brushDither, angle, optimizedRotation)
  const symmetricSpans = hasSymmetry(symmetryAxes)
  const pivotX = symmetryCenter?.x ?? document.width / 2, pivotY = symmetryCenter?.y ?? document.height / 2
  const solidStampKey = inkMode === 'simple' && tileRepeatMode === 'off' && Math.abs(geometryAngle % 360) < 0.0001 && !selection && !imageBrush && texture === 'solid' && !brushDither?.enabled && !colorReplacement && !gradient && !coverageKey && (color.a === 0 || color.a === 255)
    ? `${shape}:${stamp.width}x${stamp.height}:${color.a === 0 ? 'erase' : packColor(color)}:${normalizedOpacityScale}:${symmetricSpans ? `${symmetryAxes?.horizontal}:${symmetryAxes?.vertical}:${symmetryAxes?.diagonalDown}:${symmetryAxes?.diagonalUp}:${symmetryAxes?.rotational}:${pivotX}:${pivotY}` : ''}`
    : null
  const solidPackedValue = solidStampKey && Math.round(255 * normalizedOpacityScale) === 255
    ? color.a === 0
      ? 0
      : layer.format === 'rgba'
        ? packColor(color)
        : paletteColorIdForCanvas(document, color)
    : null
  const solidPointRecorder = solidPackedValue !== null ? solidPointRecorderFor(document, layer, edit, solidPackedValue, size) : null
  let occupancy: Uint8Array | null = null
  const previousStamp = solidStampKey ? lastBrushStampForEdit(edit) : undefined
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
  if (solidStampKey) {
    preparePixelEdit(document, edit)
    const solidValue = solidPackedValue === null ? null : normalizeLayerPackedValue(document, layer, solidPackedValue)
    const trackCoverage = isSplitBrushEdit(edit) || solidValue === null
    const uniformCoverage = Math.round(255 * normalizedOpacityScale)
    const uniformCoverageKey = color.a === 0 ? 'simple:erase' : `simple:paint:${color.r},${color.g},${color.b},${color.a}`
    const stampedColor = resolveInkStampColor('simple', color, 255, normalizedOpacityScale)
    const rowSpans = solidBrushPreviewRowSpans(size, shape, geometryAngle, optimizedRotation)
    const rowSpanAt = (localY: number): SolidBrushPreviewRowSpan | undefined => {
      if (shape === 'line') {
        const span = rowSpans[0]
        return span?.y === localY ? span : undefined
      }
      return rowSpans[localY]
    }
    const packedPixels = layer.format === 'rgba' && layer.pixels.byteOffset % 4 === 0
      ? new Uint32Array(layer.pixels.buffer as ArrayBuffer, layer.pixels.byteOffset, layer.pixels.byteLength / 4)
      : null
    let changed = false
    let storageChanged = false
    let dirtyLeft = Number.POSITIVE_INFINITY
    let dirtyTop = Number.POSITIVE_INFINITY
    let dirtyRight = Number.NEGATIVE_INFINITY
    let dirtyBottom = Number.NEGATIVE_INFINITY
    const paintSpan = (py: number, fromX: number, toX: number): void => {
      if (toX < fromX || py < 0 || py >= document.height) return
      const clippedFromX = Math.max(0, fromX)
      const clippedToX = Math.min(document.width - 1, toX)
      if (clippedToX < clippedFromX) return
      let rowChanged = false
      let rowDirtyLeft = Number.POSITIVE_INFINITY
      let rowDirtyRight = Number.NEGATIVE_INFINITY
      for (let px = clippedFromX; px <= clippedToX; px += 1) {
        const index = layerIndexAt(layer, px, py)
        if (index === null) continue
        if (trackCoverage && !claimBrushCoverage(edit, uniformCoverageKey, index, uniformCoverage)) continue
        let packedValue = solidValue
        if (packedValue === null) {
          if (color.a === 0) {
            const base = layerColorBeforeEdit(document, layer, edit, index)
            const erased = { ...base, a: Math.round(base.a * (1 - uniformCoverage / 255)) }
            packedValue = layer.format === 'rgba' ? packColor(erased) : erased.a === 0 ? 0 : paletteColorIdForCanvas(document, erased)
          } else packedValue = paintLayerValue(document, layer, edit, index, stampedColor)
          packedValue = normalizeLayerPackedValue(document, layer, packedValue)
        }
        const current = layer.format === 'indexed' ? layer.pixels[index] : packedPixels ? packedPixels[index] : readLayerPacked(document, layer, index)
        if (current === packedValue) continue
        if (solidPointRecorder) {
          appendSolidPoint(solidPointRecorder, index, current)
          if (!storageChanged) {
            markLayerContentChanged(layer)
            storageChanged = true
          }
          if (layer.format === 'indexed') layer.pixels[index] = packedValue
          else if (packedPixels) packedPixels[index] = packedValue
          else writeLayerPacked(document, layer, index, packedValue)
          rowChanged = true
          rowDirtyLeft = Math.min(rowDirtyLeft, px)
          rowDirtyRight = Math.max(rowDirtyRight, px + 1)
          continue
        }
        if (!trackCoverage && edit.before.has(index)) continue
        // A loaded layer may still use sparse runtime storage. Materialize it
        // before the first direct write so the write is not lost in the
        // placeholder pixel buffer when the runtime storage is detached.
        if (!storageChanged) {
          markLayerContentChanged(layer)
          storageChanged = true
        }
        if (!edit.before.has(index)) edit.before.set(index, current)
        edit.after.set(index, packedValue)
        if (layer.format === 'indexed') layer.pixels[index] = packedValue
        else if (packedPixels) packedPixels[index] = packedValue
        else writeLayerPacked(document, layer, index, packedValue)
        rowChanged = true
        rowDirtyLeft = Math.min(rowDirtyLeft, px)
        rowDirtyRight = Math.max(rowDirtyRight, px + 1)
      }
      if (!rowChanged) return
      changed = true
      dirtyLeft = Math.min(dirtyLeft, rowDirtyLeft)
      dirtyTop = Math.min(dirtyTop, py)
      dirtyRight = Math.max(dirtyRight, rowDirtyRight)
      dirtyBottom = Math.max(dirtyBottom, py + 1)
    }
    const paintSymmetricSpan = symmetricSpanPainter(document.width, document.height, symmetryAxes, symmetryCenter, paintSpan)
    for (const span of rowSpans) {
      const py = stampY + span.y
      const left = stampX + span.left
      const right = stampX + span.right
      if (previousStamp?.key !== solidStampKey) {
        paintSymmetricSpan(py, left, right)
        continue
      }
      const previousLocalY = py - previousStamp.stampY
      const previousSpan = previousLocalY >= 0 && previousLocalY < previousStamp.height ? rowSpanAt(previousLocalY) : undefined
      if (!previousSpan) {
        paintSymmetricSpan(py, left, right)
        continue
      }
      const previousLeft = previousStamp.stampX + previousSpan.left
      const previousRight = previousStamp.stampX + previousSpan.right
      if (previousRight < left || previousLeft > right) {
        paintSymmetricSpan(py, left, right)
        continue
      }
      paintSymmetricSpan(py, left, Math.min(right, previousLeft - 1))
      paintSymmetricSpan(py, Math.max(left, previousRight + 1), right)
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
    if (solidPointRecorder) edit.points = { indices: solidPointRecorder.indices, before: solidPointRecorder.before, after: solidPointRecorder.after, count: solidPointRecorder.count }
    return
  }
  for (const offset of offsets) {
    const scaledCoverage = Math.round(offset.coverage * normalizedOpacityScale)
    const inkCoverage = inkMode === 'copy-alpha-color' ? offset.coverage : scaledCoverage
    if (inkCoverage === 0) continue
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
        if (scaledCoverage === 0) continue
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
      const paintCoverageKey = `${inkMode}:${coverageKey ?? (gradient
        ? brushGradientCoverageKey(gradient)
        : color.a === 0
        ? 'erase'
        : `paint:${paintColor.r},${paintColor.g},${paintColor.b},${paintColor.a}`)}`
      const eraseResolvedColor = !gradient && color.a === 0
      const sourceOverGradient = gradientHasTransparentStop(gradient) || Boolean(gradient && paintColor.a === 0)
      const overwriteImageBrushPixel = imageBrush?.intrinsicSize === true
        && inkMode === 'simple'
        && brushPaintMode === 'paint'
        && !eraseResolvedColor
        // A gradient with a transparent stop must blend over the current
        // destination, including for intrinsic image brushes. Direct
        // replacement would let a lower-pressure crossing erase the earlier
        // part of the same stroke.
        && !sourceOverGradient
      if (!overwriteImageBrushPixel && !claimBrushCoverage(edit, paintCoverageKey, index, inkCoverage, coverageKey !== undefined || gradient !== undefined || inkMode === 'lock-alpha')) continue
      const stamped = resolveInkStampColor(inkMode, paintColor, offset.coverage, normalizedOpacityScale)
      if (inkMode !== 'simple') {
        // Aseprite's Lock Alpha reads from the stroke source image, not from
        // the already-modified destination. Keep repeated samples in one
        // stroke idempotent so translucent colors cannot accumulate and blur.
        const destinationColor = inkMode === 'lock-alpha'
          ? layerColorBeforeEdit(document, layer, edit, index)
          : readLayerColor(document, layer, index)
        const nextColor = applyInkColor(inkMode, destinationColor, stamped)
        if (nextColor) recordPixel(document, layer, edit, index, layer.format === 'rgba'
          ? packColor(nextColor)
          : nextColor.a === 0 ? 0 : paletteColorIdForCanvas(document, nextColor))
        continue
      }
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

/** Selects the brush centers shared by geometric-path previews and commits. */
export function brushPathStampPoints(
  points: readonly { x: number; y: number }[],
  size: number,
  imageBrush: ImageBrush | null = null,
  angle = 0,
  shape: BrushShape = 'square'
): Array<{ x: number; y: number }> {
  if (points.length === 0) return []
  const stamp = brushStampDimensions(size, imageBrush, angle, shape)
  const stampSpacing = shape === 'line' ? 1 : Math.max(1, Math.floor(Math.max(stamp.width, stamp.height) / 16))
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

/** The pointer pixel inside a brush stamp. Even dimensions use the lower-right center pixel. */
export function brushStampAnchor(size: number, imageBrush: ImageBrush | null = null, angle = 0, shape: BrushShape = 'square'): { x: number; y: number } {
  const stamp = brushStampDimensions(size, imageBrush, angle, shape)
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

const imageBrushMaskCache = new WeakMap<ImageBrush, Map<string, BrushMaskPoint[]>>()

const solidBrushMaskCache = new Map<string, BrushMaskPoint[]>()

const solidBrushOccupancyCache = new Map<string, Uint8Array>()

const imageBrushCacheKey = (imageBrush: ImageBrush, size: number, settings: ImageBrushSettings = defaultImageBrushSettings, antialiasStrength = 0, paintMode: BrushPaintMode = 'paint', originX = 0, originY = 0, patternOriginX = originX, patternOriginY = originY, angle = 0): string => {
  const procedural = imageBrush.proceduralSettings
  const proceduralKey = procedural ? `${procedural.seed}:${procedural.scale}:${procedural.detail}:${procedural.variation}:${procedural.angle}` : ''
  const dimensions = brushStampDimensions(size, imageBrush, angle)
  const originKey = paintMode !== 'paint'
    ? `${wrappedIndex(originX, imageBrush.width)}:${wrappedIndex(originY, imageBrush.height)}:${wrappedIndex(patternOriginX, imageBrush.width)}:${wrappedIndex(patternOriginY, imageBrush.height)}`
    : ''
  return `${dimensions.width}x${dimensions.height}:${settings.mode}:${settings.threshold}:${settings.blackPoint}:${settings.whitePoint}:${settings.invert ? 1 : 0}:${antialiasStrength}:${paintMode}:${originKey}:${proceduralKey}:${Math.round(angle * 1000) / 1000}`
}

export const imageBrushContainsAt = (imageBrush: ImageBrush, x: number, y: number, size: number, settings?: ImageBrushSettings): boolean => imageBrushCoverageAt(imageBrush, x, y, size, settings) > 0

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

export interface SolidBrushPreviewRowSpan {
  y: number
  left: number
  right: number
}

const solidBrushPreviewRowSpanCache = new Map<string, readonly SolidBrushPreviewRowSpan[]>()

/**
 * Exact solid-brush footprint compressed to one horizontal span per occupied
 * row. Hover previews can therefore scale with brush diameter instead of
 * brush area while keeping the same raster footprint as painting.
 */
export function solidBrushPreviewRowSpans(size: number, shape: BrushShape, angle = 0, optimizedRotation = true): readonly SolidBrushPreviewRowSpan[] {
  const normalizedSize = Math.max(1, Math.round(size))
  const geometryAngle = normalizedSize <= 1 || shape === 'round' ? 0 : angle
  const normalizedAngle = Math.round(geometryAngle * 1000) / 1000
  const cacheKey = `${shape}:${normalizedSize}:${normalizedAngle}:${optimizedRotation ? 1 : 0}`
  const cached = solidBrushPreviewRowSpanCache.get(cacheKey)
  if (cached) return cached

  let spans: SolidBrushPreviewRowSpan[]
  if (shape === 'square' && Math.abs(geometryAngle % 360) < 0.0001) {
    spans = Array.from({ length: normalizedSize }, (_, y) => ({ y, left: 0, right: normalizedSize - 1 }))
  } else if (shape === 'round') {
    spans = integerEllipseRowSpans(normalizedSize)
      .map((span, y) => ({ y, left: span.left, right: span.right }))
      .filter((span) => span.right >= span.left)
  } else if (shape === 'line' && Math.abs(geometryAngle % 360) < 0.0001) {
    const y = Math.floor(normalizedSize / 2)
    spans = [{ y, left: 0, right: normalizedSize - 1 }]
  } else {
    const mask = brushMaskOffsets(normalizedSize, shape, 'solid', 1, 0, 0, null, undefined, 0, 'paint', 0, 0, undefined, geometryAngle, optimizedRotation)
    const rows = new Map<number, { left: number; right: number }>()
    for (const point of mask) {
      const row = rows.get(point.y)
      if (row) {
        row.left = Math.min(row.left, point.x)
        row.right = Math.max(row.right, point.x)
      } else rows.set(point.y, { left: point.x, right: point.x })
    }
    spans = [...rows.entries()].sort((left, right) => left[0] - right[0]).map(([y, span]) => ({ y, ...span }))
  }

  if (solidBrushPreviewRowSpanCache.size >= 16) solidBrushPreviewRowSpanCache.delete(solidBrushPreviewRowSpanCache.keys().next().value!)
  solidBrushPreviewRowSpanCache.set(cacheKey, spans)
  return spans
}

/** Returns only the newly exposed pixels when a solid stamp moves. */
export function solidBrushStampDifferenceRects(
  from: { x: number; y: number },
  to: { x: number; y: number },
  size: number,
  shape: BrushShape,
  angle = 0,
  optimizedRotation = true
): SelectionRect[] {
  const spans = solidBrushPreviewRowSpans(size, shape, angle, optimizedRotation)
  const anchor = brushStampAnchor(size, null, angle, shape)
  const currentX = to.x - anchor.x
  const currentY = to.y - anchor.y
  const previousX = from.x - anchor.x
  const previousY = from.y - anchor.y
  const byRow = new Map<number, Array<{ left: number; right: number }>>()
  const addInterval = (y: number, left: number, right: number): void => {
    if (right < left) return
    const intervals = byRow.get(y) ?? []
    intervals.push({ left, right })
    byRow.set(y, intervals)
  }
  const previousRows = new Map(spans.map((span) => [previousY + span.y, span]))
  for (const span of spans) {
    const y = currentY + span.y
    const previous = previousRows.get(y)
    const left = currentX + span.left
    const right = currentX + span.right
    if (!previous) {
      addInterval(y, left, right)
      continue
    }
    const previousLeft = previousX + previous.left
    const previousRight = previousX + previous.right
    addInterval(y, left, Math.min(right, previousLeft - 1))
    addInterval(y, Math.max(left, previousRight + 1), right)
  }
  const result: SelectionRect[] = []
  for (const [y, intervals] of byRow) {
    for (const interval of intervals) {
      const previous = result.at(-1)
      if (previous && previous.x === interval.left && previous.width === interval.right - interval.left + 1 && previous.y + previous.height === y) previous.height += 1
      else result.push({ x: interval.left, y, width: interval.right - interval.left + 1, height: 1 })
    }
  }
  return result
}

export function brushMaskOffsets(size: number, shape: BrushShape, texture: BrushTexture = 'solid', textureScale = 1, originX = 0, originY = 0, imageBrush: ImageBrush | null = null, imageBrushSettings?: ImageBrushSettings, proceduralAntialiasStrength = 0, brushPaintMode: BrushPaintMode = 'paint', patternOriginX = originX, patternOriginY = originY, brushDither?: BrushDitherSettings, angle = 0, optimizedRotation = true): BrushMaskPoint[] {
  const normalizedSize = Math.max(1, Math.round(size))
  const geometryAngle = !imageBrush && (normalizedSize <= 1 || shape === 'round') ? 0 : angle
  const points: BrushMaskPoint[] = []
  if (imageBrush) {
    const stamp = brushStampDimensions(normalizedSize, imageBrush, geometryAngle)
    const strength = imageBrush.id.startsWith('procedural:') ? proceduralAntialiasStrength : 0
    const cacheKey = imageBrushCacheKey(imageBrush, normalizedSize, imageBrushSettings, strength, brushPaintMode, originX, originY, patternOriginX, patternOriginY, geometryAngle)
    let cache = imageBrushMaskCache.get(imageBrush)
    const cached = cache?.get(cacheKey)
    if (cached) return cached
    const sourceStamp = brushStampDimensions(normalizedSize, imageBrush)
    const radians = geometryAngle * Math.PI / 180
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
  const normalizedSolidAngle = Math.round(geometryAngle * 1000) / 1000
  const solidCacheKey = texture === 'solid' ? `${shape}:${normalizedSize}:${normalizedSolidAngle}` : null
  const cachedSolid = solidCacheKey ? solidBrushMaskCache.get(solidCacheKey) : null
  if (cachedSolid) return applyDither(cachedSolid)
  if (optimizedRotation && shape === 'line' && Math.abs(geometryAngle % 360) >= 0.0001) {
    const stamp = brushStampDimensions(normalizedSize, null, geometryAngle, shape)
    const center = { x: Math.floor(normalizedSize / 2), y: Math.floor(normalizedSize / 2) }
    const span = normalizedSize / 2
    const radians = geometryAngle * Math.PI / 180
    const dx = Math.trunc(span * Math.cos(-radians))
    const dy = Math.trunc(span * Math.sin(-radians))
    const line = [...continuousLinePoints({ x: center.x - dx, y: center.y - dy }, center), ...continuousLinePoints(center, { x: center.x + dx, y: center.y + dy })]
    const linePixels = new Map<string, { x: number; y: number }>()
    for (const point of line) {
      if (point.x < 0 || point.y < 0 || point.x >= stamp.width || point.y >= stamp.height) continue
      linePixels.set(`${point.x}:${point.y}`, point)
    }
    for (const point of linePixels.values()) if (brushTextureContains(texture, originX + point.x, originY + point.y, textureScale)) points.push({ ...point, coverage: 255 })
    return applyDither(points)
  }
  if ((shape === 'line' || shape === 'square') && Math.abs(geometryAngle % 360) >= 0.0001) {
    const stamp = brushStampDimensions(normalizedSize, null, geometryAngle, shape)
    const radians = geometryAngle * Math.PI / 180
    const cosine = Math.cos(radians)
    const sine = Math.sin(radians)
    const outputCenter = { x: (stamp.width - 1) / 2, y: (stamp.height - 1) / 2 }
    const sourceCenter = (normalizedSize - 1) / 2
    const sourceRow = Math.floor(normalizedSize / 2)
    for (let y = 0; y < stamp.height; y += 1) for (let x = 0; x < stamp.width; x += 1) {
      const outputX = x - outputCenter.x
      const outputY = y - outputCenter.y
      const sourceX = Math.round(cosine * outputX + sine * outputY + sourceCenter)
      const sourceY = Math.round(-sine * outputX + cosine * outputY + sourceCenter)
      const sourceVisible = shape === 'square' || sourceY === sourceRow
      if (sourceVisible && sourceX >= 0 && sourceX < normalizedSize && sourceY >= 0 && sourceY < normalizedSize && brushTextureContains(texture, sourceX, sourceY, textureScale)) {
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
  brushDither?: BrushDitherSettings,
  optimizedRotation = true,
  inkMode: InkMode = 'simple'
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
    paintBrush(document, layer, edit, pointX, pointY, pointSize, pointColor, shape, selection, texture, textureScale, imageBrush, imageBrushSettings, proceduralAntialiasStrength, brushPaintMode, patternOrigin, symmetryAxes, symmetryCenter, colorReplacement, opacityScale, dynamics?.coverageKey, dynamics?.overrideImageBrushColor, gradient, tileRepeatMode, brushDither, angle, optimizedRotation, inkMode)
  }
  const maximumSize = Math.max(1, Math.round(Math.max(size, dynamics?.fromSize ?? size, dynamics?.toSize ?? size)))
  const maximumAngle = Math.max(Math.abs(dynamics?.fromAngle ?? 0), Math.abs(dynamics?.toAngle ?? 0))
  const maximumGeometryAngle = !imageBrush && (maximumSize <= 1 || shape === 'round') ? 0 : maximumAngle
  const lineBrushStartAngle = Number.isFinite(dynamics?.fromAngle) ? dynamics!.fromAngle! : 0
  const lineBrushEndAngle = Number.isFinite(dynamics?.toAngle) ? dynamics!.toAngle! : lineBrushStartAngle
  // A rotated line stamp is only one pixel wide. Sampling a conventional
  // raster line can skip the cardinal bridge between diagonal centers, which
  // leaves pinholes in the painted stroke. Match the smooth brush's
  // continuous one-pixel sampling for every rotated line brush instead of
  // trying to predict the risky travel direction.
  const lineBrushNeedsContinuousCoverage = shape === 'line' && maximumSize > 1 && (
    Math.abs(lineBrushStartAngle % 180) >= 0.0001 ||
    Math.abs(lineBrushEndAngle % 180) >= 0.0001
  )
  const points = lineBrushNeedsContinuousCoverage
    ? continuousLinePointsWithFixForLineBrush({ x: fromX, y: fromY }, { x: toX, y: toY })
    : lineAlgorithm === 'balanced'
      ? balancedStairLinePoints({ x: fromX, y: fromY }, { x: toX, y: toY })
      : rasterLinePoints({ x: fromX, y: fromY }, { x: toX, y: toY })
  if (points.length === 0) return
  const maximumStamp = brushStampDimensions(maximumSize, imageBrush, maximumGeometryAngle, shape)
  const maximumAnchor = brushStampAnchor(maximumSize, imageBrush, maximumGeometryAngle, shape)
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
    const geometryAngle = pointSize <= 1 || !imageBrush && shape === 'round' ? 0 : pointAngle
    const stamp = brushStampDimensions(pointSize, imageBrush, geometryAngle, shape)
    const stampSpacing = shape === 'line' ? 1 : Math.max(1, Math.floor(Math.max(stamp.width, stamp.height) / 16))
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
  brushDither?: BrushDitherSettings,
  optimizedRotation = true,
  angle = 0,
  inkMode: InkMode = 'simple'
): void {
  const centers = brushPathStampPoints(points, size, imageBrush, angle, shape)
  if (centers.length === 0) return
  const geometryAngle = !imageBrush && (size <= 1 || shape === 'round') ? 0 : angle
  const stamp = brushStampDimensions(size, imageBrush, geometryAngle, shape)
  const anchor = brushStampAnchor(size, imageBrush, geometryAngle, shape)
  const left = Math.min(...centers.map((point) => point.x)) - anchor.x
  const top = Math.min(...centers.map((point) => point.y)) - anchor.y
  const right = Math.max(...centers.map((point) => point.x)) - anchor.x + stamp.width
  const bottom = Math.max(...centers.map((point) => point.y)) - anchor.y + stamp.height
  const footprint = symmetricRect(document, { x: left, y: top, width: right - left, height: bottom - top }, symmetryAxes, symmetryCenter, tileRepeatMode)
  if (!ensureLayerCoversEditRect(document, layer, edit, footprint)) return
  for (const center of centers) {
    paintBrush(document, layer, edit, center.x, center.y, size, color, shape, selection, texture, textureScale, imageBrush, imageBrushSettings, proceduralAntialiasStrength, brushPaintMode, patternOrigin, symmetryAxes, symmetryCenter, undefined, 1, undefined, false, undefined, tileRepeatMode, brushDither, angle, optimizedRotation, inkMode)
  }
}
