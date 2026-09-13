import type { RasterLayer } from '@shared/types-layer'
import type { SelectionQuad, SelectionRect } from '@shared/types-selection'
import type { SpriteDocument } from '@shared/types-document'
import { pixelIndex } from './raster'
import {
  selectionQuadBounds,
  selectionQuadPoint,
  selectionQuadSourcePoint,
  selectionQuadTransformFor,
  transformedSelectionDestinationPoint,
  type SelectionShearTransform
} from './selection'
import { RotSpriteSource, ROTSPRITE_SCALE } from './rotsprite-source'
import { type SelectionTransformSource, type TransformCell } from './tools-selection-transform-types'

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
export const rotSpriteSelectionCells = (
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
