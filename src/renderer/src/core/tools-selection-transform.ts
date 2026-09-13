import type { AnimationCelSurface } from '@shared/types-animation'
import type { RasterLayer } from '@shared/types-layer'
import type { SelectionMask, SelectionQuad, SelectionRect } from '@shared/types-selection'
import type { SpriteDocument } from '@shared/types-document'
import type { TileRepeatMode } from '@shared/types-raster'
import { ensureLayerCoversCanvas, expandLayerToRect, getActiveLayer, getLayer, getLayerStorageOrigin, getPaletteEntry, invalidateRasterContentBounds, isLayerEffectivelyLocked, layerIndexAt, markLayerContentChanged, readLayerPacked, writeLayerPacked } from './document-model'
import { beginPixelEdit, preparePixelEdit, recordPixel, type PixelEdit } from './history'
import { isInBounds, pixelIndex, unpackColor } from './raster'
import { flipSelectionMask, selectionContains, selectionQuadBounds, selectionQuadPoint, selectionQuadSourcePoint, selectionQuadTransformFor, transformedSelectionBounds, transformedSelectionDestinationPoint, transformedSelectionSourcePoint, type SelectionFlipAxis, type SelectionShearTransform } from './selection'
import { RotSpriteSource, ROTSPRITE_SCALE } from './rotsprite-source'
import { hasSymmetry, symmetryPoints, symmetrySelectionDragRegion, type SymmetryAxes, type SymmetryCenter, type SymmetryPoint } from './symmetry'
import { readSurfacePackedRegion } from './runtime-raster'
import { wrapDocumentPointForTileRepeat } from './tilemap'
import { clampSelectionMask, compositeSelectionPixelOver, clampSelection, compositeSelectionPixelForEdit } from './tools-pixel-edit'

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

interface RotSpriteScaledSource {
  sampler: RotSpriteSource
  sourceOffsetX: number
  sourceOffsetY: number
  paletteKey: string
}

// Captured pixels/mask are immutable for a transform gesture; palette alpha
// can change independently and determines which indexed pixels form the bounds.
const rotSpriteScaledSourceCache = new WeakMap<SelectionTransformSource, RotSpriteScaledSource>()

/** RotSprite raster path with bounded Scale2x sampling.
 *
 * RotSprite is deliberately a two-stage raster operation. Aseprite first
 * builds an 8x EPX/Scale2x source, maps it to a fixed-point parallelogram by
 * scanlines, and only then shrinks that temporary image with fixed-point
 * nearest sampling. Sampling the low-resolution target directly is tempting,
 * but it changes which pixels cover a destination pixel and produces the
 * grooves visible on 45-degree shapes.
 */
const rotSpriteSelectionCells = (
  document: SpriteDocument,
  sourceData: SelectionTransformSource,
  target: SelectionRect,
  angle: number,
  layer: RasterLayer,
  shear?: SelectionShearTransform,
  quad?: SelectionQuad
): TransformCell[] | null => {
  const source = sourceData.selection
  const normalizedAngle = ((angle % 360) + 360) % 360
  const rightAngle = Math.abs(normalizedAngle % 90) < 1e-9
    || Math.abs(normalizedAngle % 90 - 90) < 1e-9
  if ((rightAngle && !shear && !quad) || source.width < 1 || source.height < 1) return null
  if (quad && !sourceData.sourceQuad) {
    const equal = (a: number, b: number): boolean => Math.abs(a - b) < 1e-9
    const aligned = (equal(quad.nw.y, quad.ne.y) && equal(quad.ne.x, quad.se.x)
      && equal(quad.se.y, quad.sw.y) && equal(quad.sw.x, quad.nw.x))
      || (equal(quad.nw.x, quad.ne.x) && equal(quad.ne.y, quad.se.y)
        && equal(quad.se.x, quad.sw.x) && equal(quad.sw.y, quad.nw.y))
    // Orthogonal transforms already have an exact pixel mapping. EPX should
    // not reshape corners during identity, axis-aligned resizing or flipping.
    if (aligned) return null
  }

  const opaquePaletteIds = layer.format === 'indexed'
    ? new Set(document.palette.filter((entry) => entry.id !== 0 && entry.color.a !== 0).map((entry) => entry.id))
    : null
  const isOpaqueValue = (value: number): boolean => layer.format === 'rgba'
    ? (value >>> 24) !== 0
    : value !== 0 && opaquePaletteIds!.has(value)

  const paletteKey = opaquePaletteIds ? [...opaquePaletteIds].join(',') : 'rgba'
  let scaledSource = rotSpriteScaledSourceCache.get(sourceData)
  if (!scaledSource || scaledSource.paletteKey !== paletteKey) {
    let contentLeft = source.width
    let contentTop = source.height
    let contentRight = -1
    let contentBottom = -1
    const includeOpaqueOffset = (offset: number): void => {
      contentLeft = Math.min(contentLeft, offset % source.width)
      contentTop = Math.min(contentTop, Math.floor(offset / source.width))
      contentRight = Math.max(contentRight, offset % source.width)
      contentBottom = Math.max(contentBottom, Math.floor(offset / source.width))
    }
    if (!opaquePaletteIds && sourceData.opaqueOffsets.length > 0) {
      for (const offset of sourceData.opaqueOffsets) includeOpaqueOffset(offset)
    } else {
      for (let offset = 0; offset < source.width * source.height; offset++) {
        if ((!source.mask || source.mask[offset] === 1) && isOpaqueValue(sourceData.values[offset])) includeOpaqueOffset(offset)
      }
    }
    const contentWidth = Math.max(0, contentRight - contentLeft + 1)
    const contentHeight = Math.max(0, contentBottom - contentTop + 1)
    scaledSource = {
      sampler: new RotSpriteSource(contentWidth, contentHeight, (x, y) => {
        const offset = (contentTop + y) * source.width + contentLeft + x
        return !source.mask || source.mask[offset] === 1 ? sourceData.values[offset] : 0
      }),
      sourceOffsetX: contentLeft,
      sourceOffsetY: contentTop,
      paletteKey
    }
    rotSpriteScaledSourceCache.set(sourceData, scaledSource)
  }
  const contentLeft = scaledSource.sourceOffsetX
  const contentTop = scaledSource.sourceOffsetY
  const contentWidth = scaledSource.sampler.width
  const contentHeight = scaledSource.sampler.height
  if (!contentWidth || !contentHeight) return []
  const selectedAt = (x: number, y: number): boolean => !source.mask || source.mask[(contentTop + y) * source.width + contentLeft + x] === 1
  const pureRotation = !shear && !target.flipHorizontal && !target.flipVertical
    && target.width === source.width && target.height === source.height
  const contentTarget = {
    x: target.x + contentLeft,
    y: target.y + contentTop,
    width: contentWidth,
    height: contentHeight
  }
  const pivotX = target.x + target.width / 2
  const pivotY = target.y + target.height / 2
  const rotateAroundSelectionCenter = (x: number, y: number): { x: number; y: number } => {
    const radians = angle * Math.PI / 180
    const cosine = Math.cos(radians)
    const sine = Math.sin(radians)
    return {
      x: pivotX + (x - pivotX) * cosine - (y - pivotY) * sine,
      y: pivotY + (x - pivotX) * sine + (y - pivotY) * cosine
    }
  }
  const transformedContentCorners = [
    { x: contentTarget.x, y: contentTarget.y },
    { x: contentTarget.x + contentTarget.width, y: contentTarget.y },
    { x: contentTarget.x + contentTarget.width, y: contentTarget.y + contentTarget.height },
    { x: contentTarget.x, y: contentTarget.y + contentTarget.height }
  ].map((corner) => pureRotation
    ? rotateAroundSelectionCenter(corner.x, corner.y)
    : transformedSelectionDestinationPoint(source, {
      ...target,
      // Match the shared inverse mapper for cross-boundary resize handles.
      flipHorizontal: target.flipHorizontal && !(Number.isFinite(target.flipOriginX) && target.flipOriginX! <= target.x + 1e-9),
      flipVertical: target.flipVertical && !(Number.isFinite(target.flipOriginY) && target.flipOriginY! <= target.y + 1e-9)
    }, source.x + corner.x - target.x - 0.5, source.y + corner.y - target.y - 0.5, angle, shear))
  const transformedBounds = quad ? selectionQuadBounds(quad) : {
    x: Math.floor(Math.min(...transformedContentCorners.map((corner) => corner.x))),
    y: Math.floor(Math.min(...transformedContentCorners.map((corner) => corner.y))),
    width: Math.ceil(Math.max(...transformedContentCorners.map((corner) => corner.x))) - Math.floor(Math.min(...transformedContentCorners.map((corner) => corner.x))),
    height: Math.ceil(Math.max(...transformedContentCorners.map((corner) => corner.y))) - Math.floor(Math.min(...transformedContentCorners.map((corner) => corner.y)))
  }
  // Keep the complete temporary surface even when the transformed selection
  // crosses the canvas. Aseprite clips only the final scaled copy.
  const workingBounds = {
    x: Math.floor(transformedBounds.x),
    y: Math.floor(transformedBounds.y),
    width: Math.ceil(transformedBounds.x + transformedBounds.width) - Math.floor(transformedBounds.x),
    height: Math.ceil(transformedBounds.y + transformedBounds.height) - Math.floor(transformedBounds.y)
  }
  if (workingBounds.width < 1 || workingBounds.height < 1) return []

  const FIXED_ONE = 65_536
  const FIXED_HALF = 32_768
  const fixedMul = (left: number, right: number): number => Math.floor(left * right / FIXED_ONE)
  const fixedDiv = (numerator: number, denominator: number): number => denominator === 0 ? 0 : Math.trunc(numerator * FIXED_ONE / denominator)
  const fixedFloor = (value: number): number => Math.floor(value / FIXED_ONE)
  const fixedRound = (value: number): number => Math.floor((value + FIXED_HALF) / FIXED_ONE)
  const fixedRoundDown = (value: number): number => Math.floor((value - FIXED_HALF) / FIXED_ONE)

  const enlargedWidth = contentWidth * ROTSPRITE_SCALE
  const enlargedHeight = contentHeight * ROTSPRITE_SCALE
  const sourceOffsetX = scaledSource.sourceOffsetX
  const sourceOffsetY = scaledSource.sourceOffsetY
  const highWidth = workingBounds.width * ROTSPRITE_SCALE
  const highHeight = workingBounds.height * ROTSPRITE_SCALE
  // Retain the original endpoint-based 8x -> 1x sampling phase without
  // allocating/rasterizing the high-resolution destination. Only these samples
  // can survive the final shrink. Canvas clipping must not reset their phase.
  const cells: TransformCell[] = []
  const downsampleX = workingBounds.width > 1 ? fixedDiv(highWidth - 1, workingBounds.width - 1) : 0
  const downsampleY = workingBounds.height > 1 ? fixedDiv(highHeight - 1, workingBounds.height - 1) : 0
  const firstX = Math.max(0, -workingBounds.x)
  const lastX = Math.min(workingBounds.width, document.width - workingBounds.x)
  const firstY = Math.max(0, -workingBounds.y)
  const lastY = Math.min(workingBounds.height, document.height - workingBounds.y)
  if (firstX >= lastX || firstY >= lastY) return []
  let outputY = firstY
  if (quad) {
    // Free quadrilaterals need the shared inverse geometry (including an
    // already transformed source). Apply the same endpoint shrink phase to
    // samples in the virtual 8x destination, then read the bounded EPX source.
    const transform = selectionQuadTransformFor(source, quad)
    const sourceTransform = sourceData.sourceQuad ? selectionQuadTransformFor(source, sourceData.sourceQuad) : null
    if (!transform || (sourceData.sourceQuad && !sourceTransform)) return []
    for (let y = firstY; y < lastY; y++) for (let x = firstX; x < lastX; x++) {
      const normalized = selectionQuadSourcePoint(transform, {
        x: workingBounds.x + (fixedFloor(x * downsampleX) + 0.5) / ROTSPRITE_SCALE,
        y: workingBounds.y + (fixedFloor(y * downsampleY) + 0.5) / ROTSPRITE_SCALE
      })
      if (!normalized || normalized.x < 0 || normalized.x >= 1 || normalized.y < 0 || normalized.y >= 1) continue
      const point = sourceTransform
        ? selectionQuadPoint(sourceTransform, normalized.x, normalized.y)
        : { x: source.x + normalized.x * source.width, y: source.y + normalized.y * source.height }
      if (!point) continue
      const highX = Math.floor((point.x - source.x - contentLeft) * ROTSPRITE_SCALE)
      const highY = Math.floor((point.y - source.y - contentTop) * ROTSPRITE_SCALE)
      if (highX < 0 || highY < 0 || highX >= enlargedWidth || highY >= enlargedHeight) continue
      const localX = Math.floor(highX / ROTSPRITE_SCALE)
      const localY = Math.floor(highY / ROTSPRITE_SCALE)
      if (!selectedAt(localX, localY)) continue
      const value = scaledSource.sampler.sample(highX, highY)
      if (!isOpaqueValue(value)) continue
      cells.push({ x: workingBounds.x + x, y: workingBounds.y + y,
        sourceIndex: pixelIndex(document.width, source.x + contentLeft + localX, source.y + contentTop + localY), value })
    }
    return cells
  }
  // This is the fixed-point corner calculation used by Aseprite's
  // rotate_scale_flip_coordinates(). The points are outer pixel corners, not
  // pixel centres, which is important for the final 8x -> 1x sampling.
  const radians = angle * Math.PI / 180
  const fixedCosine = Math.round(Math.cos(radians) * FIXED_ONE)
  const fixedSine = Math.round(Math.sin(radians) * FIXED_ONE)
  const sourceWidthFixed = contentWidth * ROTSPRITE_SCALE * FIXED_ONE
  const sourceHeightFixed = contentHeight * ROTSPRITE_SCALE * FIXED_ONE
  const pivotXFixed = sourceWidthFixed / 2
  const pivotYFixed = sourceHeightFixed / 2
  // Aseprite's coordinate helper receives the destination pivot (the
  // selection centre), while cx/cy are the source pivot. Passing the source
  // top-left here shifts the complete rotated image up and left.
  const contentCenter = rotateAroundSelectionCenter(
    contentTarget.x + contentTarget.width / 2,
    contentTarget.y + contentTarget.height / 2
  )
  const originXFixed = (contentCenter.x - workingBounds.x) * ROTSPRITE_SCALE * FIXED_ONE
  const originYFixed = (contentCenter.y - workingBounds.y) * ROTSPRITE_SCALE * FIXED_ONE
  const topLeftX = originXFixed - fixedMul(pivotXFixed, fixedCosine) + fixedMul(pivotYFixed, fixedSine)
  const topLeftY = originYFixed - fixedMul(pivotXFixed, fixedSine) - fixedMul(pivotYFixed, fixedCosine)
  const cornersX = pureRotation ? [
    topLeftX,
    topLeftX + fixedMul(sourceWidthFixed, fixedCosine),
    topLeftX + fixedMul(sourceWidthFixed, fixedCosine) - fixedMul(sourceHeightFixed, fixedSine),
    topLeftX - fixedMul(sourceHeightFixed, fixedSine)
  ] : transformedContentCorners.map(point => Math.round((point.x - workingBounds.x) * ROTSPRITE_SCALE * FIXED_ONE))
  const cornersY = pureRotation ? [
    topLeftY,
    topLeftY + fixedMul(sourceWidthFixed, fixedSine),
    topLeftY + fixedMul(sourceWidthFixed, fixedSine) + fixedMul(sourceHeightFixed, fixedCosine),
    topLeftY + fixedMul(sourceHeightFixed, fixedCosine)
  ] : transformedContentCorners.map(point => Math.round((point.y - workingBounds.y) * ROTSPRITE_SCALE * FIXED_ONE))

  // A direct TypeScript port of Aseprite's fixed-point parallelogram
  // scan-converter. Each destination high-resolution pixel is visited only
  // when its centre lies inside the transformed source pixel surface.
  let topIndex = 0
  for (let index = 1; index < 4; index += 1) if (cornersY[index] < cornersY[topIndex]) topIndex = index
  const nextIndex = (topIndex + 1) & 3
  const previousIndex = (topIndex + 3) & 3
  const rightIndex = (cornersX[nextIndex] - cornersX[topIndex]) * (cornersY[previousIndex] - cornersY[topIndex])
    > (cornersX[previousIndex] - cornersX[topIndex]) * (cornersY[nextIndex] - cornersY[topIndex]) ? 1 : -1
  const cornerX = new Array<number>(4)
  const cornerY = new Array<number>(4)
  const cornerSourceX = new Array<number>(4)
  const cornerSourceY = new Array<number>(4)
  let cornerIndex = topIndex
  for (let index = 0; index < 4; index += 1) {
    cornerX[index] = cornersX[cornerIndex]
    cornerY[index] = cornersY[cornerIndex]
    cornerSourceY[index] = cornerIndex < 2 ? 0 : enlargedHeight * FIXED_ONE - 1
    cornerSourceX[index] = cornerIndex === 0 || cornerIndex === 3 ? 0 : enlargedWidth * FIXED_ONE - 1
    cornerIndex = (cornerIndex + rightIndex + 4) & 3
  }

  const clipRight = highWidth * FIXED_ONE - 1
  const topY = cornerY[0]
  const rightY = cornerY[1]
  const bottomY = cornerY[2]
  const leftY = cornerY[3]
  const topX = cornerX[0]
  const rightX = cornerX[1]
  const bottomX = cornerX[2]
  const leftX = cornerX[3]
  if ((leftX > clipRight && topX > clipRight && bottomX > clipRight)
    || (rightX < 0 && topX < 0 && bottomX < 0)) {
    return []
  }

  let bottomScanline = fixedRound(bottomY)
  bottomScanline = Math.min(highHeight, bottomScanline)
  let scanlineY = Math.max(0, fixedRound(topY))
  if (scanlineY >= bottomScanline) {
    return []
  }

  let extra = scanlineY * FIXED_ONE + FIXED_HALF - topY
  let leftBmpDx = fixedDiv(leftX - topX, leftY - topY)
  let leftBmpX = topX + fixedMul(extra, leftBmpDx)
  let leftSourceDx = fixedDiv(cornerSourceX[3] - cornerSourceX[0], leftY - topY)
  let leftSourceX = cornerSourceX[0] + fixedMul(extra, leftSourceDx)
  let leftSourceDy = fixedDiv(cornerSourceY[3] - cornerSourceY[0], leftY - topY)
  let leftSourceY = cornerSourceY[0] + fixedMul(extra, leftSourceDy)
  let leftBottomScanline = Math.min(highHeight, fixedRound(leftY))

  let rightBmpDx = fixedDiv(rightX - topX, rightY - topY)
  let rightBmpX = topX + fixedMul(extra, rightBmpDx)
  let rightBottomScanline = fixedRound(rightY)
  const sourceDx = (cornersY[3] - cornersY[0]) * FIXED_ONE * (FIXED_ONE * enlargedWidth)
    / ((cornersX[1] - cornersX[0]) * (cornersY[3] - cornersY[0]) - (cornersX[3] - cornersX[0]) * (cornersY[1] - cornersY[0]))
  const sourceDy = (cornersY[1] - cornersY[0]) * FIXED_ONE * (FIXED_ONE * enlargedHeight)
    / ((cornersX[3] - cornersX[0]) * (cornersY[1] - cornersY[0]) - (cornersX[1] - cornersX[0]) * (cornersY[3] - cornersY[0]))

  const drawScanline = (y: number, left: number, right: number, sourceStartX: number, sourceStartY: number): void => {
    while (outputY < lastY && fixedFloor(outputY * downsampleY) < y) outputY++
    if (outputY >= lastY || fixedFloor(outputY * downsampleY) !== y) return
    const leftPixel = Math.max(0, fixedFloor(left))
    const rightPixel = Math.min(highWidth - 1, fixedFloor(right))
    const startX = sourceStartX + fixedMul((leftPixel * FIXED_ONE) - left, sourceDx)
    const startY = sourceStartY + fixedMul((leftPixel * FIXED_ONE) - left, sourceDy)
    const begin = downsampleX > 0 ? Math.max(firstX, Math.ceil(leftPixel * FIXED_ONE / downsampleX)) : firstX
    for (let x = begin; x < lastX; x++) {
      const highX = fixedFloor(x * downsampleX)
      if (highX > rightPixel) break
      const sourcePixelX = fixedFloor(startX + (highX - leftPixel) * sourceDx)
      const sourcePixelY = fixedFloor(startY + (highX - leftPixel) * sourceDy)
      if (sourcePixelX < 0 || sourcePixelY < 0 || sourcePixelX >= enlargedWidth || sourcePixelY >= enlargedHeight) continue
      const localX = Math.floor(sourcePixelX / ROTSPRITE_SCALE)
      const localY = Math.floor(sourcePixelY / ROTSPRITE_SCALE)
      if (!selectedAt(localX, localY)) continue
      const value = scaledSource!.sampler.sample(sourcePixelX, sourcePixelY)
      if (!isOpaqueValue(value)) continue
      cells.push({
        x: workingBounds.x + x,
        y: workingBounds.y + outputY,
        sourceIndex: pixelIndex(document.width, source.x + sourceOffsetX + localX, source.y + sourceOffsetY + localY),
        value
      })
    }
  }

  while (scanlineY < bottomScanline) {
    if (scanlineY >= leftBottomScanline) {
      extra = scanlineY * FIXED_ONE + FIXED_HALF - leftY
      leftBmpDx = fixedDiv(bottomX - leftX, bottomY - leftY)
      leftBmpX = leftX + fixedMul(extra, leftBmpDx)
      leftSourceDx = fixedDiv(cornerSourceX[2] - cornerSourceX[3], bottomY - leftY)
      leftSourceX = cornerSourceX[3] + fixedMul(extra, leftSourceDx)
      leftSourceDy = fixedDiv(cornerSourceY[2] - cornerSourceY[3], bottomY - leftY)
      leftSourceY = cornerSourceY[3] + fixedMul(extra, leftSourceDy)
      leftBottomScanline = Math.min(highHeight, fixedRound(bottomY))
    }
    if (scanlineY >= rightBottomScanline) {
      extra = scanlineY * FIXED_ONE + FIXED_HALF - rightY
      rightBmpDx = fixedDiv(bottomX - rightX, bottomY - rightY)
      rightBmpX = rightX + fixedMul(extra, rightBmpDx)
      rightBottomScanline = bottomScanline
    }

    let leftRounded = Math.max(0, fixedRound(leftBmpX)) * FIXED_ONE
    let rightRounded = Math.min(clipRight, fixedRoundDown(rightBmpX) * FIXED_ONE)
    if (leftRounded <= rightRounded) {
      let roundedSourceX = leftSourceX + fixedMul(leftRounded - leftBmpX + FIXED_HALF - 1, sourceDx)
      let roundedSourceY = leftSourceY + fixedMul(leftRounded - leftBmpX + FIXED_HALF - 1, sourceDy)
      let skipScanline = false
      const sourceXOutside = (value: number): boolean => fixedFloor(value) < 0 || fixedFloor(value) >= enlargedWidth
      const sourceYOutside = (value: number): boolean => fixedFloor(value) < 0 || fixedFloor(value) >= enlargedHeight

      // Match Aseprite's rounding-error correction. Depending on the
      // direction of the source delta, an out-of-range left sample can be
      // brought back into the sprite by shortening the destination span.
      if (sourceXOutside(roundedSourceX)) {
        if ((roundedSourceX < 0 && sourceDx <= 0) || (roundedSourceX > 0 && sourceDx >= 0)) skipScanline = true
        else {
          do {
            roundedSourceX += sourceDx
            leftRounded += FIXED_ONE
            if (leftRounded > rightRounded) {
              skipScanline = true
              break
            }
          } while (sourceXOutside(roundedSourceX))
        }
      }
      if (!skipScanline && sourceXOutside(roundedSourceX + Math.floor((rightRounded - leftRounded) / FIXED_ONE) * sourceDx)) {
        const rightSourceX = roundedSourceX + Math.floor((rightRounded - leftRounded) / FIXED_ONE) * sourceDx
        if ((rightSourceX < 0 && sourceDx <= 0) || (rightSourceX > 0 && sourceDx >= 0)) {
          do {
            rightRounded -= FIXED_ONE
            if (leftRounded > rightRounded) {
              skipScanline = true
              break
            }
          } while (sourceXOutside(roundedSourceX + Math.floor((rightRounded - leftRounded) / FIXED_ONE) * sourceDx))
        } else skipScanline = true
      }
      if (!skipScanline && sourceYOutside(roundedSourceY)) {
        if ((roundedSourceY < 0 && sourceDy <= 0) || (roundedSourceY > 0 && sourceDy >= 0)) skipScanline = true
        else {
          do {
            roundedSourceY += sourceDy
            leftRounded += FIXED_ONE
            if (leftRounded > rightRounded) {
              skipScanline = true
              break
            }
          } while (sourceYOutside(roundedSourceY))
        }
      }
      if (!skipScanline && sourceYOutside(roundedSourceY + Math.floor((rightRounded - leftRounded) / FIXED_ONE) * sourceDy)) {
        const rightSourceY = roundedSourceY + Math.floor((rightRounded - leftRounded) / FIXED_ONE) * sourceDy
        if ((rightSourceY < 0 && sourceDy <= 0) || (rightSourceY > 0 && sourceDy >= 0)) {
          do {
            rightRounded -= FIXED_ONE
            if (leftRounded > rightRounded) {
              skipScanline = true
              break
            }
          } while (sourceYOutside(roundedSourceY + Math.floor((rightRounded - leftRounded) / FIXED_ONE) * sourceDy))
        } else skipScanline = true
      }
      if (!skipScanline) drawScanline(scanlineY, leftRounded, rightRounded, roundedSourceX, roundedSourceY)
    }
    scanlineY += 1
    leftBmpX += leftBmpDx
    leftSourceX += leftSourceDx
    leftSourceY += leftSourceDy
    rightBmpX += rightBmpDx
  }

  return cells
}

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
      if ((!mask || mask[offset] === 1) && isOpaque(source.values[offset])) {
        // A normal move relocates the captured pixel exactly. Compositing a
        // translucent source over the destination would accumulate alpha and
        // change the pixel merely because it was moved. Clipboard/copy
        // operations remain source-over so they behave like a paste.
        next = copy || source.origin === 'clipboard'
          ? compositeSelectionPixelOver(document, layer, before, source.values[offset])
          : source.values[offset]
      }
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
  // Snapshot each destination before this pass writes it. A translated
  // selection may overlap its source; using the live layer after clearing the
  // source would blend translucent pixels against a partially written value.
  const previewBeforeByCanvas = new Map<number, number>()
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
    const before = readLayerPacked(document, layer, index)
    preview.before[preview.count] = before
    previewBeforeByCanvas.set(canvasIndex, before)
    preview.count += 1
  }
  const writeCanvasPacked = (canvasIndex: number, value: number, composite = false): void => {
    const x = canvasIndex % document.width
    const y = Math.floor(canvasIndex / document.width)
    if (!insideClip(x, y)) return
    const index = layerIndexAt(layer, x, y)
    if (index !== null) {
      const destination = previewBeforeByCanvas.get(canvasIndex)
      writeLayerPacked(document, layer, index, composite
        ? compositeSelectionPixelOver(document, layer, destination ?? readLayerPacked(document, layer, index), value)
        : value)
    }
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
      if (targetIndex !== null) writeCanvasPacked(targetIndex, value, copy || source.origin === 'clipboard')
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
        writeCanvasPacked(index, value, true)
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
      if (isInBounds(document.width, document.height, targetX, targetY)) writeCanvasPacked(pixelIndex(document.width, targetX, targetY), source.values[sourceOffset], true)
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
    if (isInBounds(document.width, document.height, x, y)) writeCanvasPacked(pixelIndex(document.width, x, y), source.opaqueValues[offset], copy)
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

function selectionTransformCells(document: SpriteDocument, sourceData: SelectionTransformSource, target: SelectionRect, angle: number, shear?: SelectionShearTransform, targetLayer?: RasterLayer, quad?: SelectionQuad, pixelCenteredSampling = false, optimizedRotation = false): TransformCell[] {
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
  if (optimizedRotation) {
    const rotSpriteCells = rotSpriteSelectionCells(document, sourceData, target, angle, layer, shear, quad)
    if (rotSpriteCells) return rotSpriteCells
  }
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
  quad?: SelectionQuad,
  optimizedRotation = false
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
  for (const cell of selectionTransformCells(document, source, target, angle, shear, layer, quad, false, optimizedRotation)) {
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
  quad?: SelectionQuad,
  optimizedRotation = false
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
      shiftedQuad,
      optimizedRotation
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

export function selectionTransformPreview(document: SpriteDocument, selection: SelectionMask, target: SelectionRect, angle = 0, shear?: SelectionShearTransform, symmetryAxes?: SymmetryAxes, symmetryCenter?: SymmetryCenter, targetLayer?: RasterLayer, quad?: SelectionQuad, optimizedRotation = false): Uint8ClampedArray {
  const outputBounds = quad ? selectionQuadBounds(quad) : target
  const output = new Uint8ClampedArray(outputBounds.width * outputBounds.height * 4)
  const layer = targetLayer ?? getActiveLayer(document)
  const source = captureSelectionTransform(document, selection, layer)
  if (!source) return output
  for (const cell of selectionTransformCells(document, source, target, angle, shear, layer, quad, false, optimizedRotation)) {
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

export function transformSelectionCopy(document: SpriteDocument, selection: SelectionMask, target: SelectionRect, angle = 0, shear?: SelectionShearTransform, symmetryAxes?: SymmetryAxes, symmetryCenter?: SymmetryCenter, targetLayer?: RasterLayer, quad?: SelectionQuad, optimizedRotation = false): PixelEdit | null {
  const layer = targetLayer ?? getActiveLayer(document)
  const source = captureSelectionTransform(document, selection, layer)
  return source ? applySelectionTransform(document, source, target, angle, true, shear, symmetryAxes, symmetryCenter, layer, undefined, quad, false, optimizedRotation) : null
}

export function applySelectionTransform(document: SpriteDocument, source: SelectionTransformSource, target: SelectionRect, angle = 0, copy = false, shear?: SelectionShearTransform, symmetryAxes?: SymmetryAxes, symmetryCenter?: SymmetryCenter, targetLayer?: RasterLayer, symmetryStartPoint?: SymmetryPoint, quad?: SelectionQuad, pixelCenteredSampling = false, optimizedRotation = false): PixelEdit | null {
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
          recordCanvasPixel(destination.x, destination.y, copy
            ? compositeSelectionPixelForEdit(document, layer, edit, index, value)
            : value)
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
        if (!transparent) {
          const destinationIndex = layerIndexAt(layer, x, y)
          if (destinationIndex !== null) recordCanvasPixel(x, y, compositeSelectionPixelForEdit(document, layer, edit, destinationIndex, value))
        }
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
      if (!transparent) {
        const destinationIndex = layerIndexAt(layer, x, y)
        if (destinationIndex !== null) recordCanvasPixel(x, y, copy
          ? compositeSelectionPixelForEdit(document, layer, edit, destinationIndex, value)
          : value)
      }
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
  for (const cell of selectionTransformCells(document, source, target, angle, shear, layer, quad, pixelCenteredSampling, optimizedRotation)) {
    const sourcePoint = { x: cell.sourceIndex % document.width, y: Math.floor(cell.sourceIndex / document.width) }
    if (!isSymmetryRepresentative(sourcePoint, sourceSelection, document, symmetryAxes, symmetryCenter)) continue
    const transparent = layer.format === 'rgba'
      ? unpackColor(cell.value).a === 0
      : cell.value === 0 || getPaletteEntry(document, cell.value).color.a === 0
    if (transparent) continue
    for (const destination of symmetryPoints({ x: cell.x, y: cell.y }, document.width, document.height, symmetryAxes, symmetryCenter)) {
      const destinationIndex = layerIndexAt(layer, destination.x, destination.y)
      if (destinationIndex !== null) recordCanvasPixel(destination.x, destination.y, compositeSelectionPixelForEdit(document, layer, edit, destinationIndex, cell.value))
    }
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
  // The previous visible-bounds cache is invalid after relocating every
  // pixel. Keeping it makes layer styles compute their expanded output from
  // the pre-flip bounds and visibly clips the mirrored result.
  invalidateRasterContentBounds(layer)
  return edit.before.size > 0 ? edit : null
}
