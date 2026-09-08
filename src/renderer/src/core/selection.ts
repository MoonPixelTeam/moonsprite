import type { CanvasAnchor, RasterLayer, SelectionMask, SelectionMode, SelectionQuad, SelectionRect, SpriteDocument } from '@shared/types'
import { getPaletteEntry, rasterLayerPackedValueIsUniform } from './document'
import { isInBounds, packColor, pixelIndex } from './raster'
import { contiguousMatchingRegion, contiguousMatchingRegionInBounds } from './contiguous-region'
import { balancedStairLinePoints } from './pixel-line'

export const forEachRasterLinePoint = (
  from: { x: number; y: number },
  to: { x: number; y: number },
  visit: (x: number, y: number) => void
): void => {
  let x = from.x
  let y = from.y
  const dx = Math.abs(to.x - from.x)
  const dy = Math.abs(to.y - from.y)
  const stepX = from.x < to.x ? 1 : -1
  const stepY = from.y < to.y ? 1 : -1
  let error = dx - dy
  while (true) {
    visit(x, y)
    if (x === to.x && y === to.y) break
    const doubled = error * 2
    if (doubled > -dy) { error -= dy; x += stepX }
    if (doubled < dx) { error += dx; y += stepY }
  }
}

export const rasterLinePoints = (from: { x: number; y: number }, to: { x: number; y: number }): Array<{ x: number; y: number }> => {
  const points: Array<{ x: number; y: number }> = []
  forEachRasterLinePoint(from, to, (x, y) => points.push({ x, y }))
  return points
}

/** Aseprite's continuous line rasterizer, including its tie-breaking rules. */
export const continuousLinePoints = (from: { x: number; y: number }, to: { x: number; y: number }): Array<{ x: number; y: number }> => {
  const points: Array<{ x: number; y: number }> = []
  let x = from.x
  let y = from.y
  const dx = Math.abs(to.x - x)
  const sx = x < to.x ? 1 : -1
  const dy = -Math.abs(to.y - y)
  const sy = y < to.y ? 1 : -1
  let error = dx + dy

  for (;;) {
    points.push({ x, y })
    const doubled = 2 * error
    if (doubled >= dy) {
      if (x === to.x) break
      error += dy
      x += sx
    }
    if (doubled <= dx) {
      if (y === to.y) break
      error += dx
      y += sy
    }
  }
  return points
}

/** Aseprite's line-brush variant, which emits the intermediate diagonal step. */
export const continuousLinePointsWithFixForLineBrush = (from: { x: number; y: number }, to: { x: number; y: number }): Array<{ x: number; y: number }> => {
  const points: Array<{ x: number; y: number }> = []
  let x = from.x
  let y = from.y
  const dx = Math.abs(to.x - x)
  const sx = x < to.x ? 1 : -1
  const dy = -Math.abs(to.y - y)
  const sy = y < to.y ? 1 : -1
  let error = dx + dy

  for (;;) {
    let xChanged = false
    points.push({ x, y })
    const doubled = 2 * error
    if (doubled >= dy) {
      if (x === to.x) break
      error += dy
      x += sx
      xChanged = true
    }
    if (doubled <= dx) {
      if (y === to.y) break
      error += dx
      if (xChanged) points.push({ x, y })
      y += sy
    }
  }
  return points
}

export const selectionContains = (selection: SelectionMask | null | undefined, x: number, y: number): boolean => {
  if (!selection || x < selection.x || y < selection.y || x >= selection.x + selection.width || y >= selection.y + selection.height) return false
  return !selection.mask || selection.mask[(y - selection.y) * selection.width + x - selection.x] === 1
}

export const selectionPixelCount = (selection: SelectionMask | null): number => {
  if (!selection) return 0
  if (!selection.mask) return selection.width * selection.height
  return selection.mask.reduce((count, value) => count + value, 0)
}

export const cloneSelection = (selection: SelectionMask | null | undefined): SelectionMask | null =>
  selection ? { ...selection, mask: selection.mask?.slice() } : null

export const invertSelectionMask = (selection: SelectionMask | null, canvasWidth: number, canvasHeight: number): SelectionMask | null => {
  if (!selection || canvasWidth < 1 || canvasHeight < 1) return null
  const mask = new Uint8Array(canvasWidth * canvasHeight)
  let selected = 0
  for (let y = 0; y < canvasHeight; y += 1) for (let x = 0; x < canvasWidth; x += 1) {
    if (selectionContains(selection, x, y)) continue
    mask[y * canvasWidth + x] = 1
    selected += 1
  }
  return selected > 0 ? { x: 0, y: 0, width: canvasWidth, height: canvasHeight, mask } : null
}

export type SelectionFlipAxis = 'horizontal' | 'vertical'

export const flipSelectionMask = (selection: SelectionMask, axis: SelectionFlipAxis): SelectionMask => {
  if (!selection.mask) return { ...selection }
  const mask = new Uint8Array(selection.mask.length)
  for (let y = 0; y < selection.height; y += 1) {
    for (let x = 0; x < selection.width; x += 1) {
      if (selection.mask[y * selection.width + x] !== 1) continue
      const targetX = axis === 'horizontal' ? selection.width - 1 - x : x
      const targetY = axis === 'vertical' ? selection.height - 1 - y : y
      mask[targetY * selection.width + targetX] = 1
    }
  }
  return { ...selection, mask }
}

/** Returns merged local-space boundary segments as x1, y1, x2, y2 tuples. */
export const selectionBoundarySegments = (selection: SelectionMask): Int32Array => {
  const { width, height, mask } = selection
  if (!mask) return Int32Array.from([0, 0, width, 0, width, 0, width, height, width, height, 0, height, 0, height, 0, 0])
  // Aseprite keeps solid flood-filled spans as spans.  A full mask is the
  // common case for background selections; avoid the two complete edge scans
  // and return its four sides immediately.
  if (!mask.includes(0)) return Int32Array.from([0, 0, width, 0, width, 0, width, height, width, height, 0, height, 0, height, 0, 0])
  const maxCoordinates = Math.max(16, width * height * 8 + (width + height) * 8)
  let segments = new Int32Array(Math.min(maxCoordinates, Math.max(256, (width + height) * 16)))
  let length = 0
  const append = (x1: number, y1: number, x2: number, y2: number): void => {
    if (length + 4 > segments.length) {
      const expanded = new Int32Array(Math.min(maxCoordinates, segments.length * 2))
      expanded.set(segments)
      segments = expanded
    }
    segments[length++] = x1
    segments[length++] = y1
    segments[length++] = x2
    segments[length++] = y2
  }

  for (let y = 0; y <= height; y += 1) {
    let start = -1
    for (let x = 0; x <= width; x += 1) {
      const above = x < width && y > 0 && mask[(y - 1) * width + x] === 1
      const below = x < width && y < height && mask[y * width + x] === 1
      const boundary = x < width && above !== below
      if (boundary && start < 0) start = x
      else if (!boundary && start >= 0) { append(start, y, x, y); start = -1 }
    }
  }

  for (let x = 0; x <= width; x += 1) {
    let start = -1
    for (let y = 0; y <= height; y += 1) {
      const left = y < height && x > 0 && mask[y * width + x - 1] === 1
      const right = y < height && x < width && mask[y * width + x] === 1
      const boundary = y < height && left !== right
      if (boundary && start < 0) start = y
      else if (!boundary && start >= 0) { append(x, start, x, y); start = -1 }
    }
  }

  return segments.slice(0, length)
}

export const rectSelection = (x: number, y: number, width: number, height: number): SelectionMask => ({ x, y, width, height })

export const roundedRectRadius = (width: number, height: number, cornerRadius: number): number => Math.min(
  Math.max(0, Math.round(cornerRadius) || 0),
  Math.floor(Math.min(Math.max(1, width), Math.max(1, height)) / 2)
)

/** Tests a point in local rectangle coordinates, where pixel centers use offset + 0.5. */
export const roundedRectContainsPoint = (width: number, height: number, cornerRadius: number, pointX: number, pointY: number): boolean => {
  if (pointX < 0 || pointY < 0 || pointX >= width || pointY >= height) return false
  const radius = roundedRectRadius(width, height, cornerRadius)
  if (radius === 0) return true
  const innerRight = width - radius
  const innerBottom = height - radius
  if ((pointX >= radius && pointX <= innerRight) || (pointY >= radius && pointY <= innerBottom)) return true
  const centerX = pointX < radius ? radius : innerRight
  const centerY = pointY < radius ? radius : innerBottom
  const dx = pointX - centerX
  const dy = pointY - centerY
  return dx * dx + dy * dy <= radius * radius + 1e-9
}

export const ellipseSelection = (x: number, y: number, width: number, height: number): SelectionMask => {
  const normalizedWidth = Math.max(1, width)
  const normalizedHeight = Math.max(1, height)
  const centerX = (normalizedWidth - 1) / 2
  const centerY = (normalizedHeight - 1) / 2
  const radiusX = Math.max(0.5, normalizedWidth / 2)
  const radiusY = Math.max(0.5, normalizedHeight / 2)
  const mask = new Uint8Array(normalizedWidth * normalizedHeight)
  for (let offsetY = 0; offsetY < normalizedHeight; offsetY += 1) for (let offsetX = 0; offsetX < normalizedWidth; offsetX += 1) {
    const dx = (offsetX - centerX) / radiusX
    const dy = (offsetY - centerY) / radiusY
    if ((dx * dx) + (dy * dy) <= 1) mask[offsetY * normalizedWidth + offsetX] = 1
  }
  return { x, y, width: normalizedWidth, height: normalizedHeight, mask }
}

export const rotatedEllipseSelection = (
  target: SelectionRect,
  canvasWidth: number,
  canvasHeight: number,
  angle = 0,
  clipToCanvas = true
): SelectionMask | null => {
  const normalizedTarget = { ...target, width: Math.max(1, target.width), height: Math.max(1, target.height) }
  const bounds = rotatedSelectionBounds(normalizedTarget, angle)
  const x = clipToCanvas ? Math.max(0, bounds.x) : bounds.x
  const y = clipToCanvas ? Math.max(0, bounds.y) : bounds.y
  const right = clipToCanvas ? Math.min(canvasWidth, bounds.x + bounds.width) : bounds.x + bounds.width
  const bottom = clipToCanvas ? Math.min(canvasHeight, bounds.y + bounds.height) : bounds.y + bounds.height
  if (right <= x || bottom <= y) return null

  const width = right - x
  const height = bottom - y
  const mask = new Uint8Array(width * height)
  const centerX = normalizedTarget.x + normalizedTarget.width / 2
  const centerY = normalizedTarget.y + normalizedTarget.height / 2
  const radiusX = Math.max(0.5, normalizedTarget.width / 2)
  const radiusY = Math.max(0.5, normalizedTarget.height / 2)
  const radians = angle * Math.PI / 180
  const cosine = snapRotationValue(Math.cos(-radians))
  const sine = snapRotationValue(Math.sin(-radians))
  let selected = 0

  for (let destinationY = y; destinationY < bottom; destinationY += 1) {
    for (let destinationX = x; destinationX < right; destinationX += 1) {
      const offsetX = destinationX + 0.5 - centerX
      const offsetY = destinationY + 0.5 - centerY
      const localX = offsetX * cosine - offsetY * sine
      const localY = offsetX * sine + offsetY * cosine
      const normalizedX = localX / radiusX
      const normalizedY = localY / radiusY
      if ((normalizedX * normalizedX) + (normalizedY * normalizedY) > 1) continue
      mask[(destinationY - y) * width + destinationX - x] = 1
      selected += 1
    }
  }

  return trimSelectionMaskBounds(x, y, width, height, mask, selected)
}

export const rotatedRectSelection = (
  target: SelectionRect,
  canvasWidth: number,
  canvasHeight: number,
  angle = 0,
  clipToCanvas = true,
  cornerRadius = 0
): SelectionMask | null => {
  const normalizedTarget = { ...target, width: Math.max(1, target.width), height: Math.max(1, target.height) }
  const radius = roundedRectRadius(normalizedTarget.width, normalizedTarget.height, cornerRadius)
  const normalizedAngle = ((angle % 360) + 360) % 360
  const bounds = rotatedSelectionBounds(normalizedTarget, angle)
  const x = clipToCanvas ? Math.max(0, bounds.x) : bounds.x
  const y = clipToCanvas ? Math.max(0, bounds.y) : bounds.y
  const right = clipToCanvas ? Math.min(canvasWidth, bounds.x + bounds.width) : bounds.x + bounds.width
  const bottom = clipToCanvas ? Math.min(canvasHeight, bounds.y + bounds.height) : bounds.y + bounds.height
  if (right <= x || bottom <= y) return null
  if (radius === 0 && (normalizedAngle < 1e-9 || Math.abs(normalizedAngle - 360) < 1e-9)) return { x, y, width: right - x, height: bottom - y }

  const width = right - x
  const height = bottom - y
  const mask = new Uint8Array(width * height)
  const centerX = normalizedTarget.x + normalizedTarget.width / 2
  const centerY = normalizedTarget.y + normalizedTarget.height / 2
  const halfWidth = normalizedTarget.width / 2
  const halfHeight = normalizedTarget.height / 2
  const radians = angle * Math.PI / 180
  const cosine = snapRotationValue(Math.cos(-radians))
  const sine = snapRotationValue(Math.sin(-radians))
  let selected = 0

  for (let destinationY = y; destinationY < bottom; destinationY += 1) {
    for (let destinationX = x; destinationX < right; destinationX += 1) {
      const offsetX = destinationX + 0.5 - centerX
      const offsetY = destinationY + 0.5 - centerY
      const localX = offsetX * cosine - offsetY * sine
      const localY = offsetX * sine + offsetY * cosine
      if (Math.abs(localX) >= halfWidth - 1e-9 || Math.abs(localY) >= halfHeight - 1e-9) continue
      if (radius > 0 && !roundedRectContainsPoint(normalizedTarget.width, normalizedTarget.height, radius, localX + halfWidth, localY + halfHeight)) continue
      mask[(destinationY - y) * width + destinationX - x] = 1
      selected += 1
    }
  }

  if (radius === 0 && normalizedTarget.width > 2 && normalizedTarget.height > 2 && Math.abs(normalizedAngle % 90) > 1e-9) {
    const cornerTips: number[] = []
    for (let offsetY = 0; offsetY < height; offsetY += 1) {
      for (let offsetX = 0; offsetX < width; offsetX += 1) {
        const index = offsetY * width + offsetX
        if (mask[index] !== 1) continue
        let neighbors = 0
        if (offsetX > 0 && mask[index - 1] === 1) neighbors += 1
        if (offsetX + 1 < width && mask[index + 1] === 1) neighbors += 1
        if (offsetY > 0 && mask[index - width] === 1) neighbors += 1
        if (offsetY + 1 < height && mask[index + width] === 1) neighbors += 1
        if (neighbors <= 1) cornerTips.push(index)
      }
    }
    for (const index of cornerTips) {
      mask[index] = 0
      selected -= 1
    }
  }

  return trimSelectionMaskBounds(x, y, width, height, mask, selected)
}

export const maskFromPoints = (points: Array<{ x: number; y: number }>): SelectionMask | null => {
  if (points.length === 0) return null
  let minX = points[0].x; let maxX = points[0].x; let minY = points[0].y; let maxY = points[0].y
  for (const point of points) { minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x); minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y) }
  const width = maxX - minX + 1
  const height = maxY - minY + 1
  const mask = new Uint8Array(width * height)
  for (const point of points) mask[(point.y - minY) * width + point.x - minX] = 1
  return { x: minX, y: minY, width, height, mask }
}

const snapRotationValue = (value: number): number => {
  const rounded = Math.round(value)
  return Math.abs(value - rounded) < 1e-9 ? rounded : value
}

export const rotatedSelectionBounds = (target: SelectionRect, angle = 0): SelectionRect => {
  if (target.width < 1 || target.height < 1) return { ...target }
  const normalizedAngle = ((angle % 360) + 360) % 360
  if (normalizedAngle === 0) return { ...target }

  const radians = normalizedAngle * Math.PI / 180
  const cosine = snapRotationValue(Math.cos(radians))
  const sine = snapRotationValue(Math.sin(radians))
  const centerX = target.x + target.width / 2
  const centerY = target.y + target.height / 2
  const corners = [
    { x: target.x, y: target.y },
    { x: target.x + target.width, y: target.y },
    { x: target.x + target.width, y: target.y + target.height },
    { x: target.x, y: target.y + target.height }
  ].map(({ x, y }) => ({
    x: snapRotationValue(centerX + (x - centerX) * cosine - (y - centerY) * sine),
    y: snapRotationValue(centerY + (x - centerX) * sine + (y - centerY) * cosine)
  }))
  const x = Math.floor(Math.min(...corners.map((corner) => corner.x)))
  const y = Math.floor(Math.min(...corners.map((corner) => corner.y)))
  const right = Math.ceil(Math.max(...corners.map((corner) => corner.x)))
  const bottom = Math.ceil(Math.max(...corners.map((corner) => corner.y)))
  return { x, y, width: right - x, height: bottom - y }
}

export interface SelectionShearTransform {
  axis: 'x' | 'y'
  edge: 'n' | 'e' | 's' | 'w'
  amount: number
}

const transformedSelectionPoint = (
  target: SelectionRect,
  normalizedX: number,
  normalizedY: number,
  angle = 0,
  shear?: SelectionShearTransform
): { x: number; y: number } => {
  let destinationX = target.x + normalizedX * target.width
  let destinationY = target.y + normalizedY * target.height
  if (shear?.axis === 'x') destinationX += shear.amount * (shear.edge === 'n' ? 1 - normalizedY : normalizedY)
  else if (shear?.axis === 'y') destinationY += shear.amount * (shear.edge === 'w' ? 1 - normalizedX : normalizedX)
  const radians = angle * Math.PI / 180
  const cosine = snapRotationValue(Math.cos(radians))
  const sine = snapRotationValue(Math.sin(radians))
  const centerX = target.x + target.width / 2
  const centerY = target.y + target.height / 2
  const offsetX = destinationX - centerX
  const offsetY = destinationY - centerY
  return {
    x: snapRotationValue(centerX + offsetX * cosine - offsetY * sine),
    y: snapRotationValue(centerY + offsetX * sine + offsetY * cosine)
  }
}

export const inverseTransformedSelectionPoint = (
  target: SelectionRect,
  point: { x: number; y: number },
  angle = 0,
  shear?: SelectionShearTransform
): { x: number; y: number } => {
  const radians = angle * Math.PI / 180
  const cosine = snapRotationValue(Math.cos(radians))
  const sine = snapRotationValue(Math.sin(radians))
  const centerX = target.x + target.width / 2
  const centerY = target.y + target.height / 2
  const offsetX = point.x - centerX
  const offsetY = point.y - centerY
  let localX = centerX + offsetX * cosine + offsetY * sine
  let localY = centerY - offsetX * sine + offsetY * cosine
  if (shear?.axis === 'x') {
    const normalizedY = (localY - target.y) / Math.max(1, target.height)
    localX -= shear.amount * (shear.edge === 'n' ? 1 - normalizedY : normalizedY)
  } else if (shear?.axis === 'y') {
    const normalizedX = (localX - target.x) / Math.max(1, target.width)
    localY -= shear.amount * (shear.edge === 'w' ? 1 - normalizedX : normalizedX)
  }
  return { x: snapRotationValue(localX), y: snapRotationValue(localY) }
}

export const remapTransformedSelectionPoint = (
  sourceTarget: SelectionRect,
  destinationTarget: SelectionRect,
  point: { x: number; y: number },
  sourceAngle = 0,
  sourceShear?: SelectionShearTransform,
  destinationAngle = sourceAngle,
  destinationShear = sourceShear
): { x: number; y: number } => {
  const localPoint = inverseTransformedSelectionPoint(sourceTarget, point, sourceAngle, sourceShear)
  let normalizedX = sourceTarget.width === 0 ? 0.5 : (localPoint.x - sourceTarget.x) / sourceTarget.width
  let normalizedY = sourceTarget.height === 0 ? 0.5 : (localPoint.y - sourceTarget.y) / sourceTarget.height
  if (Boolean(sourceTarget.flipHorizontal) !== Boolean(destinationTarget.flipHorizontal)) normalizedX = 1 - normalizedX
  if (Boolean(sourceTarget.flipVertical) !== Boolean(destinationTarget.flipVertical)) normalizedY = 1 - normalizedY
  return transformedSelectionPoint(destinationTarget, normalizedX, normalizedY, destinationAngle, destinationShear)
}

export const transformedSelectionControlPoints = (
  target: SelectionRect,
  angle = 0,
  shear?: SelectionShearTransform
): Array<{ x: number; y: number }> => [
  [0, 0], [0.5, 0], [1, 0],
  [0, 0.5], [1, 0.5],
  [0, 1], [0.5, 1], [1, 1]
].map(([normalizedX, normalizedY]) => transformedSelectionPoint(target, normalizedX, normalizedY, angle, shear))

/** Projective transform used by the free-transform tool. Quad points use
 * document edge coordinates and are ordered clockwise (nw, ne, se, sw). */
export interface SelectionQuadTransform {
  forward: readonly number[]
  inverse: readonly number[]
  quad?: SelectionQuad
}

const solveSelectionQuadLinearSystem = (matrix: number[][], values: number[]): number[] | null => {
  const size = values.length
  const augmented = matrix.map((row, index) => [...row, values[index]])
  for (let column = 0; column < size; column += 1) {
    let pivot = column
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row
    }
    if (!Number.isFinite(augmented[pivot][column]) || Math.abs(augmented[pivot][column]) < 1e-10) return null
    if (pivot !== column) [augmented[pivot], augmented[column]] = [augmented[column], augmented[pivot]]
    const divisor = augmented[column][column]
    for (let current = column; current <= size; current += 1) augmented[column][current] /= divisor
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue
      const factor = augmented[row][column]
      if (Math.abs(factor) < 1e-14) continue
      for (let current = column; current <= size; current += 1) augmented[row][current] -= factor * augmented[column][current]
    }
  }
  const result = augmented.map((row) => row[size])
  return result.every(Number.isFinite) ? result : null
}

const selectionQuadHomography = (
  source: readonly { x: number; y: number }[],
  destination: readonly { x: number; y: number }[]
): number[] | null => {
  if (source.length !== 4 || destination.length !== 4) return null
  const matrix: number[][] = []
  const values: number[] = []
  for (let index = 0; index < 4; index += 1) {
    const from = source[index]
    const to = destination[index]
    matrix.push([from.x, from.y, 1, 0, 0, 0, -from.x * to.x, -from.y * to.x])
    values.push(to.x)
    matrix.push([0, 0, 0, from.x, from.y, 1, -from.x * to.y, -from.y * to.y])
    values.push(to.y)
  }
  return solveSelectionQuadLinearSystem(matrix, values)
}

const applySelectionQuadHomography = (
  coefficients: readonly number[],
  x: number,
  y: number
): { x: number; y: number } | null => {
  const denominator = coefficients[6] * x + coefficients[7] * y + 1
  if (!Number.isFinite(denominator) || Math.abs(denominator) < 1e-10) return null
  const nextX = (coefficients[0] * x + coefficients[1] * y + coefficients[2]) / denominator
  const nextY = (coefficients[3] * x + coefficients[4] * y + coefficients[5]) / denominator
  return Number.isFinite(nextX) && Number.isFinite(nextY) ? { x: nextX, y: nextY } : null
}

const selectionQuadCorners = (quad: SelectionQuad): Array<{ x: number; y: number }> => [
  quad.nw, quad.ne, quad.se, quad.sw
]

const selectionQuadIsConvex = (quad: SelectionQuad): boolean => {
  const corners = selectionQuadCorners(quad)
  let orientation = 0
  for (let index = 0; index < corners.length; index += 1) {
    const a = corners[index]
    const b = corners[(index + 1) % corners.length]
    const c = corners[(index + 2) % corners.length]
    if (![a.x, a.y, b.x, b.y, c.x, c.y].every(Number.isFinite)) return false
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
    if (Math.abs(cross) < 1e-9) return false
    const nextOrientation = Math.sign(cross)
    if (orientation === 0) orientation = nextOrientation
    else if (orientation !== nextOrientation) return false
  }
  return true
}

export const selectionQuadTransformFor = (
  source: SelectionRect,
  quad: SelectionQuad
): SelectionQuadTransform | null => {
  if (source.width <= 0 || source.height <= 0 || !selectionQuadIsConvex(quad)) return null
  const sourcePoints = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]
  const destinationPoints = selectionQuadCorners(quad)
  const forward = selectionQuadHomography(sourcePoints, destinationPoints)
  const inverse = selectionQuadHomography(destinationPoints, sourcePoints)
  return forward && inverse
    ? {
        forward,
        inverse,
        quad: {
          nw: { ...quad.nw },
          ne: { ...quad.ne },
          se: { ...quad.se },
          sw: { ...quad.sw }
        }
      }
    : null
}

/** Builds a unit-square transform for callers that do not have a source rect. */
export const selectionQuadTransform = (quad: SelectionQuad): SelectionQuadTransform | null =>
  selectionQuadTransformFor({ x: 0, y: 0, width: 1, height: 1 }, quad)

export const selectionQuadPoint = (
  quadOrTransform: SelectionQuad | SelectionQuadTransform,
  normalizedX: number,
  normalizedY: number,
  transform?: SelectionQuadTransform | null
): { x: number; y: number } | null => {
  const resolved = 'forward' in quadOrTransform ? quadOrTransform : transform
  if (resolved) return applySelectionQuadHomography(resolved.forward, normalizedX, normalizedY)
  if ('forward' in quadOrTransform) return null
  const generated = selectionQuadTransform(quadOrTransform)
  return generated ? applySelectionQuadHomography(generated.forward, normalizedX, normalizedY) : null
}

export const selectionQuadSourcePoint = (
  transform: SelectionQuadTransform,
  point: { x: number; y: number }
): { x: number; y: number } | null => applySelectionQuadHomography(transform.inverse, point.x, point.y)

export const inverseSelectionQuadPoint = (
  quadOrTransform: SelectionQuad | SelectionQuadTransform,
  point: { x: number; y: number }
): { x: number; y: number } | null => {
  const transform = 'inverse' in quadOrTransform ? quadOrTransform : selectionQuadTransform(quadOrTransform)
  return transform ? selectionQuadSourcePoint(transform, point) : null
}

export const selectionQuadFromRect = (
  target: SelectionRect,
  angle = 0,
  shear?: SelectionShearTransform
): SelectionQuad => {
  const points = transformedSelectionControlPoints(target, angle, shear)
  return { nw: points[0], ne: points[2], se: points[7], sw: points[5] }
}

export const selectionQuadBounds = (quad: SelectionQuad): SelectionRect => {
  const points = selectionQuadCorners(quad)
  const x = Math.floor(Math.min(...points.map((point) => point.x)))
  const y = Math.floor(Math.min(...points.map((point) => point.y)))
  const right = Math.ceil(Math.max(...points.map((point) => point.x)))
  const bottom = Math.ceil(Math.max(...points.map((point) => point.y)))
  return { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) }
}

// Short aliases keep the geometry helpers convenient for canvas interaction
// code while the prefixed names remain the canonical public API.
export const quadFromRect = selectionQuadFromRect
export const quadBounds = selectionQuadBounds
export const quadPoint = selectionQuadPoint
export const inverseQuadPoint = inverseSelectionQuadPoint

/** Rasterizes a masked selection into an arbitrary convex four-corner frame. */
export const transformSelectionMaskQuad = (
  source: SelectionMask,
  quad: SelectionQuad,
  canvasWidth: number,
  canvasHeight: number,
  clipToCanvas = true,
  sourceQuad?: SelectionQuad
): SelectionMask | null => {
  const transform = selectionQuadTransformFor(source, quad)
  const sourceTransform = sourceQuad ? selectionQuadTransformFor(source, sourceQuad) : null
  if (!transform || (sourceQuad && !sourceTransform)) return null
  const bounds = selectionQuadBounds(quad)
  const x = clipToCanvas ? Math.max(0, bounds.x) : bounds.x
  const y = clipToCanvas ? Math.max(0, bounds.y) : bounds.y
  const right = clipToCanvas ? Math.min(canvasWidth, bounds.x + bounds.width) : bounds.x + bounds.width
  const bottom = clipToCanvas ? Math.min(canvasHeight, bounds.y + bounds.height) : bounds.y + bounds.height
  if (right <= x || bottom <= y) return null
  const width = right - x
  const height = bottom - y
  const mask = new Uint8Array(width * height)
  let selected = 0
  for (let destinationY = y; destinationY < bottom; destinationY += 1) {
    for (let destinationX = x; destinationX < right; destinationX += 1) {
      const normalized = selectionQuadSourcePoint(transform, { x: destinationX + 0.5, y: destinationY + 0.5 })
      if (!normalized || normalized.x < -1e-9 || normalized.x > 1 + 1e-9 || normalized.y < -1e-9 || normalized.y > 1 + 1e-9) continue
      const sourcePoint = sourceTransform ? selectionQuadPoint(sourceTransform, normalized.x, normalized.y) : null
      const sourceX = sourcePoint
        ? Math.floor(sourcePoint.x)
        : source.x + Math.min(source.width - 1, Math.max(0, Math.floor(normalized.x * source.width)))
      const sourceY = sourcePoint
        ? Math.floor(sourcePoint.y)
        : source.y + Math.min(source.height - 1, Math.max(0, Math.floor(normalized.y * source.height)))
      if (sourceX < source.x || sourceY < source.y || sourceX >= source.x + source.width || sourceY >= source.y + source.height) continue
      if (!selectionContains(source, sourceX, sourceY)) continue
      mask[(destinationY - y) * width + destinationX - x] = 1
      selected += 1
    }
  }
  return trimSelectionMaskBounds(x, y, width, height, mask, selected)
}

export const transformedSelectionCenter = (
  target: SelectionRect,
  angle = 0,
  shear?: SelectionShearTransform
): { x: number; y: number } => {
  const points = transformedSelectionControlPoints(target, angle, shear)
  const corners = [points[0], points[2], points[5], points[7]]
  return {
    x: snapRotationValue(corners.reduce((sum, point) => sum + point.x, 0) / corners.length),
    y: snapRotationValue(corners.reduce((sum, point) => sum + point.y, 0) / corners.length)
  }
}

type SelectionPivotAxisPosition = 'start' | 'center' | 'end'

const selectionPivotAxisPositions: Record<CanvasAnchor, readonly [SelectionPivotAxisPosition, SelectionPivotAxisPosition]> = {
  nw: ['start', 'start'],
  n: ['center', 'start'],
  ne: ['end', 'start'],
  w: ['start', 'center'],
  center: ['center', 'center'],
  e: ['end', 'center'],
  sw: ['start', 'end'],
  s: ['center', 'end'],
  se: ['end', 'end']
}

const selectionPivotPixelCenter = (size: number, position: SelectionPivotAxisPosition): number => {
  const lastPixelCenter = Math.max(0.5, size - 0.5)
  if (position === 'start') return 0.5
  if (position === 'end') return lastPixelCenter
  return Math.min(lastPixelCenter, Math.floor(size / 2) + 0.5)
}

export const transformedSelectionPivotPreset = (
  target: SelectionRect,
  preset: CanvasAnchor,
  angle = 0,
  shear?: SelectionShearTransform
): { x: number; y: number } => {
  const [horizontal, vertical] = selectionPivotAxisPositions[preset]
  return transformedSelectionPoint(
    target,
    selectionPivotPixelCenter(target.width, horizontal) / Math.max(1, target.width),
    selectionPivotPixelCenter(target.height, vertical) / Math.max(1, target.height),
    angle,
    shear
  )
}

export const transformedSelectionShearDirection = (
  target: SelectionRect,
  angle: number,
  shear: SelectionShearTransform | undefined,
  edge: SelectionShearTransform['edge']
): { x: number; y: number } | null => {
  const points = transformedSelectionControlPoints(target, angle, shear)
  const from = points[0]
  const to = edge === 'n' || edge === 's' ? points[2] : points[5]
  const deltaX = to.x - from.x
  const deltaY = to.y - from.y
  const length = Math.hypot(deltaX, deltaY)
  return length < 1e-9 ? null : { x: deltaX / length, y: deltaY / length }
}

export const rotateSelectionTargetAroundPivot = (
  target: SelectionRect,
  pivot: { x: number; y: number },
  angleDelta: number
): SelectionRect => {
  const radians = angleDelta * Math.PI / 180
  const cosine = snapRotationValue(Math.cos(radians))
  const sine = snapRotationValue(Math.sin(radians))
  const centerX = target.x + target.width / 2
  const centerY = target.y + target.height / 2
  const offsetX = centerX - pivot.x
  const offsetY = centerY - pivot.y
  const rotatedCenterX = pivot.x + offsetX * cosine - offsetY * sine
  const rotatedCenterY = pivot.y + offsetX * sine + offsetY * cosine
  const deltaX = snapRotationValue(rotatedCenterX - centerX)
  const deltaY = snapRotationValue(rotatedCenterY - centerY)
  return {
    ...target,
    x: snapRotationValue(target.x + deltaX),
    y: snapRotationValue(target.y + deltaY),
    ...(Number.isFinite(target.flipOriginX) ? { flipOriginX: snapRotationValue(target.flipOriginX! + deltaX) } : {}),
    ...(Number.isFinite(target.flipOriginY) ? { flipOriginY: snapRotationValue(target.flipOriginY! + deltaY) } : {})
  }
}

export interface TransformedSelectionGeometry {
  target: SelectionRect
  angle: number
  shear?: SelectionShearTransform
}

const shiftedSelectionPoint = (
  point: { x: number; y: number },
  delta: { x: number; y: number }
): { x: number; y: number } => ({ x: point.x + delta.x, y: point.y + delta.y })

const remappedFlipOrigin = (
  origin: number | undefined,
  sourceStart: number,
  sourceSize: number,
  targetStart: number,
  targetSize: number
): number | undefined => Number.isFinite(origin)
  ? origin! <= sourceStart + sourceSize / 2 ? targetStart : targetStart + targetSize
  : undefined

export const shearTransformedSelection = (
  target: SelectionRect,
  angle: number,
  shear: SelectionShearTransform | undefined,
  edge: SelectionShearTransform['edge'],
  amount: number,
  pivot?: { x: number; y: number }
): TransformedSelectionGeometry => {
  if (amount === 0) return { target: { ...target }, angle, shear: shear ? { ...shear } : undefined }

  const points = transformedSelectionControlPoints(target, angle, shear)
  let topLeft = points[0]
  let topRight = points[2]
  let bottomLeft = points[5]
  const startHorizontalAxis = { x: topRight.x - topLeft.x, y: topRight.y - topLeft.y }
  const startVerticalAxis = { x: bottomLeft.x - topLeft.x, y: bottomLeft.y - topLeft.y }
  const radians = angle * Math.PI / 180
  const cosine = snapRotationValue(Math.cos(radians))
  const sine = snapRotationValue(Math.sin(radians))
  if (pivot) {
    const horizontalShear = edge === 'n' || edge === 's'
    const determinant = startHorizontalAxis.x * startVerticalAxis.y - startHorizontalAxis.y * startVerticalAxis.x
    const direction = horizontalShear ? startHorizontalAxis : startVerticalAxis
    const directionLength = Math.hypot(direction.x, direction.y)
    if (Math.abs(determinant) < 1e-9 || directionLength < 1e-9) return { target: { ...target }, angle, shear: shear ? { ...shear } : undefined }
    const axisCoordinate = (point: { x: number; y: number }): number => {
      const offsetX = point.x - points[0].x
      const offsetY = point.y - points[0].y
      return horizontalShear
        ? (startHorizontalAxis.x * offsetY - startHorizontalAxis.y * offsetX) / determinant
        : (offsetX * startVerticalAxis.y - offsetY * startVerticalAxis.x) / determinant
    }
    const pivotCoordinate = axisCoordinate(pivot)
    const edgeCoordinate = edge === 'n' || edge === 'w' ? 0 : 1
    const edgeDistance = edgeCoordinate - pivotCoordinate
    if (Math.abs(edgeDistance) < 1e-9) return { target: { ...target }, angle, shear: shear ? { ...shear } : undefined }
    const directionX = direction.x / directionLength
    const directionY = direction.y / directionLength
    const shearPointAroundPivot = (point: { x: number; y: number }): { x: number; y: number } => {
      const displacement = amount * (axisCoordinate(point) - pivotCoordinate) / edgeDistance
      return { x: point.x + displacement * directionX, y: point.y + displacement * directionY }
    }
    topLeft = shearPointAroundPivot(topLeft)
    topRight = shearPointAroundPivot(topRight)
    bottomLeft = shearPointAroundPivot(bottomLeft)
  } else {
    const delta = edge === 'n' || edge === 's'
      ? { x: amount * cosine, y: amount * sine }
      : { x: -amount * sine, y: amount * cosine }
    if (edge === 'n') {
      topLeft = shiftedSelectionPoint(topLeft, delta)
      topRight = shiftedSelectionPoint(topRight, delta)
    } else if (edge === 's') {
      bottomLeft = shiftedSelectionPoint(bottomLeft, delta)
    } else if (edge === 'w') {
      topLeft = shiftedSelectionPoint(topLeft, delta)
      bottomLeft = shiftedSelectionPoint(bottomLeft, delta)
    } else {
      topRight = shiftedSelectionPoint(topRight, delta)
    }
  }

  const horizontalAxis = { x: topRight.x - topLeft.x, y: topRight.y - topLeft.y }
  const verticalAxis = { x: bottomLeft.x - topLeft.x, y: bottomLeft.y - topLeft.y }
  const horizontalShear = edge === 'n' || edge === 's'
  let axisCosine: number
  let axisSine: number
  let width: number
  let height: number
  let shearAmount: number
  if (horizontalShear) {
    width = Math.hypot(horizontalAxis.x, horizontalAxis.y)
    if (width < 1e-9) return { target: { ...target }, angle, shear: shear ? { ...shear } : undefined }
    axisCosine = horizontalAxis.x / width
    axisSine = horizontalAxis.y / width
    height = -axisSine * verticalAxis.x + axisCosine * verticalAxis.y
    shearAmount = axisCosine * verticalAxis.x + axisSine * verticalAxis.y
  } else {
    height = Math.hypot(verticalAxis.x, verticalAxis.y)
    if (height < 1e-9) return { target: { ...target }, angle, shear: shear ? { ...shear } : undefined }
    axisCosine = verticalAxis.y / height
    axisSine = -verticalAxis.x / height
    width = axisCosine * horizontalAxis.x + axisSine * horizontalAxis.y
    shearAmount = -axisSine * horizontalAxis.x + axisCosine * horizontalAxis.y
  }
  if (width < 1 || height < 1) return { target: { ...target }, angle, shear: shear ? { ...shear } : undefined }
  const centerX = topLeft.x + axisCosine * width / 2 - axisSine * height / 2
  const centerY = topLeft.y + axisSine * width / 2 + axisCosine * height / 2
  const nextTarget: SelectionRect = {
    x: snapRotationValue(centerX - width / 2),
    y: snapRotationValue(centerY - height / 2),
    width: snapRotationValue(width),
    height: snapRotationValue(height)
  }
  if (target.flipHorizontal) {
    nextTarget.flipHorizontal = true
    nextTarget.flipOriginX = remappedFlipOrigin(target.flipOriginX, target.x, target.width, nextTarget.x, nextTarget.width)
  }
  if (target.flipVertical) {
    nextTarget.flipVertical = true
    nextTarget.flipOriginY = remappedFlipOrigin(target.flipOriginY, target.y, target.height, nextTarget.y, nextTarget.height)
  }
  const nextShearAmount = snapRotationValue(shearAmount)
  const nextAngle = snapRotationValue(Math.atan2(axisSine, axisCosine) * 180 / Math.PI)
  return {
    target: nextTarget,
    angle: nextAngle === 0 ? 0 : nextAngle,
    shear: Math.abs(nextShearAmount) < 1e-9
      ? undefined
      : horizontalShear
        ? { axis: 'x', edge: 's', amount: nextShearAmount }
        : { axis: 'y', edge: 'e', amount: nextShearAmount }
  }
}

export const transformedSelectionBounds = (target: SelectionRect, angle = 0, shear?: SelectionShearTransform): SelectionRect => {
  if (!shear || shear.amount === 0) return rotatedSelectionBounds(target, angle)
  const radians = angle * Math.PI / 180
  const cosine = snapRotationValue(Math.cos(radians))
  const sine = snapRotationValue(Math.sin(radians))
  const centerX = target.x + target.width / 2
  const centerY = target.y + target.height / 2
  const corners = [
    { x: target.x, y: target.y, axisPosition: 0 },
    { x: target.x + target.width, y: target.y, axisPosition: 0 },
    { x: target.x + target.width, y: target.y + target.height, axisPosition: 1 },
    { x: target.x, y: target.y + target.height, axisPosition: 1 }
  ].map((corner) => {
    let shearedX = corner.x
    let shearedY = corner.y
    if (shear.axis === 'x') shearedX += shear.amount * (shear.edge === 'n' ? 1 - corner.axisPosition : corner.axisPosition)
    else {
      const horizontalPosition = corner.x === target.x ? 0 : 1
      shearedY += shear.amount * (shear.edge === 'w' ? 1 - horizontalPosition : horizontalPosition)
    }
    return {
      x: snapRotationValue(centerX + (shearedX - centerX) * cosine - (shearedY - centerY) * sine),
      y: snapRotationValue(centerY + (shearedX - centerX) * sine + (shearedY - centerY) * cosine)
    }
  })
  const x = Math.floor(Math.min(...corners.map((corner) => corner.x)))
  const y = Math.floor(Math.min(...corners.map((corner) => corner.y)))
  const right = Math.ceil(Math.max(...corners.map((corner) => corner.x)))
  const bottom = Math.ceil(Math.max(...corners.map((corner) => corner.y)))
  return { x, y, width: right - x, height: bottom - y }
}

export const transformedSelectionSourcePoint = (
  source: SelectionMask,
  target: SelectionRect,
  x: number,
  y: number,
  angle = 0,
  shear?: SelectionShearTransform,
  pixelCenteredSampling = false
): { x: number; y: number } | null => {
  if (target.width < 1 || target.height < 1) return null
  const radians = angle * Math.PI / 180
  const cosine = snapRotationValue(Math.cos(-radians))
  const sine = snapRotationValue(Math.sin(-radians))
  const centerX = target.x + target.width / 2
  const centerY = target.y + target.height / 2
  const offsetX = x + 0.5 - centerX
  const offsetY = y + 0.5 - centerY
  const unrotatedX = centerX + offsetX * cosine - offsetY * sine
  const unrotatedY = centerY + offsetX * sine + offsetY * cosine
  let mappedDestinationX = unrotatedX
  let mappedDestinationY = unrotatedY
  if (shear?.axis === 'x') {
    const axisPosition = (mappedDestinationY - target.y) / target.height
    mappedDestinationX -= shear.amount * (shear.edge === 'n' ? 1 - axisPosition : axisPosition)
  } else if (shear?.axis === 'y') {
    const axisPosition = (mappedDestinationX - target.x) / target.width
    mappedDestinationY -= shear.amount * (shear.edge === 'w' ? 1 - axisPosition : axisPosition)
  }
  const normalizedX = (mappedDestinationX - target.x) / target.width
  const normalizedY = (mappedDestinationY - target.y) / target.height
  if (normalizedX < -1e-9 || normalizedX > 1 + 1e-9 || normalizedY < -1e-9 || normalizedY > 1 + 1e-9) return null
  // Cross-boundary resizing uses the dragged edge/point as the mirror axis.
  // For a left/top axis the source direction stays forward; for a right/bottom
  // axis it runs backward. This avoids silently falling back to the rectangle
  // center when a side or corner has crossed its opposite edge.
  const axisMapped = (normalized: number, start: number, size: number, axis: number | undefined): number => {
    if (!Number.isFinite(axis)) return 1 - normalized
    return axis! <= start + 1e-9 ? normalized : axis! >= start + size - 1e-9 ? 1 - normalized : 1 - normalized
  }
  const mappedX = target.flipHorizontal ? axisMapped(normalizedX, target.x, target.width, target.flipOriginX) : normalizedX
  const mappedY = target.flipVertical ? axisMapped(normalizedY, target.y, target.height, target.flipOriginY) : normalizedY
  const centerOffset = pixelCenteredSampling ? 0.5 : 0
  const sourceX = Math.min(source.x + source.width - 1, Math.max(source.x, source.x + Math.floor(mappedX * source.width - centerOffset)))
  const sourceY = Math.min(source.y + source.height - 1, Math.max(source.y, source.y + Math.floor(mappedY * source.height - centerOffset)))
  return selectionContains(source, sourceX, sourceY) ? { x: sourceX, y: sourceY } : null
}

export const transformedSelectionDestinationPoint = (
  source: SelectionMask,
  target: SelectionRect,
  sourceX: number,
  sourceY: number,
  angle = 0,
  shear?: SelectionShearTransform
): { x: number; y: number } => {
  let normalizedX = (sourceX + 0.5 - source.x) / source.width
  let normalizedY = (sourceY + 0.5 - source.y) / source.height
  if (target.flipHorizontal) normalizedX = 1 - normalizedX
  if (target.flipVertical) normalizedY = 1 - normalizedY
  return transformedSelectionPoint(target, normalizedX, normalizedY, angle, shear)
}

function trimSelectionMaskBounds(
  x: number,
  y: number,
  width: number,
  height: number,
  mask: Uint8Array,
  selected: number
): SelectionMask | null {
  if (selected === 0) return null
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let localY = 0; localY < height; localY += 1) {
    for (let localX = 0; localX < width; localX += 1) {
      if (mask[localY * width + localX] === 0) continue
      minX = Math.min(minX, localX)
      minY = Math.min(minY, localY)
      maxX = Math.max(maxX, localX)
      maxY = Math.max(maxY, localY)
    }
  }
  if (minX === 0 && minY === 0 && maxX === width - 1 && maxY === height - 1) return { x, y, width, height, mask }
  const trimmedWidth = maxX - minX + 1
  const trimmedHeight = maxY - minY + 1
  const trimmedMask = new Uint8Array(trimmedWidth * trimmedHeight)
  for (let localY = minY; localY <= maxY; localY += 1) {
    const sourceOffset = localY * width + minX
    const targetOffset = (localY - minY) * trimmedWidth
    trimmedMask.set(mask.subarray(sourceOffset, sourceOffset + trimmedWidth), targetOffset)
  }
  return { x: x + minX, y: y + minY, width: trimmedWidth, height: trimmedHeight, mask: trimmedMask }
}

export const transformSelectionMask = (
  source: SelectionMask,
  target: SelectionRect,
  canvasWidth: number,
  canvasHeight: number,
  angle = 0,
  shear?: SelectionShearTransform,
  clipToCanvas = true
): SelectionMask | null => {
  const bounds = transformedSelectionBounds(target, angle, shear)
  const x = clipToCanvas ? Math.max(0, bounds.x) : bounds.x
  const y = clipToCanvas ? Math.max(0, bounds.y) : bounds.y
  const right = clipToCanvas ? Math.min(canvasWidth, bounds.x + bounds.width) : bounds.x + bounds.width
  const bottom = clipToCanvas ? Math.min(canvasHeight, bounds.y + bounds.height) : bounds.y + bounds.height
  if (right <= x || bottom <= y) return null
  const width = right - x
  const height = bottom - y
  if (!source.mask && angle === 0 && !shear) return { x, y, width, height }

  const mask = new Uint8Array(width * height)
  let selected = 0
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
    for (let localY = 0; localY < source.height; localY += 1) {
      for (let localX = 0; localX < source.width; localX += 1) {
        if (!selectionContains(source, source.x + localX, source.y + localY)) continue
        const destination = transformedSelectionDestinationPoint(source, target, source.x + localX, source.y + localY, angle)
        const destinationX = Math.floor(destination.x)
        const destinationY = Math.floor(destination.y)
        if (destinationX < x || destinationY < y || destinationX >= right || destinationY >= bottom) continue
        const destinationOffset = (destinationY - y) * width + destinationX - x
        if (mask[destinationOffset] === 1) continue
        mask[destinationOffset] = 1
        selected += 1
      }
    }

    const inverseCandidates = new Uint8Array(width * height)
    for (let destinationY = y; destinationY < bottom; destinationY += 1) {
      for (let destinationX = x; destinationX < right; destinationX += 1) {
        if (!transformedSelectionSourcePoint(source, target, destinationX, destinationY, angle)) continue
        const destinationOffset = (destinationY - y) * width + destinationX - x
        if (mask[destinationOffset] === 0) inverseCandidates[destinationOffset] = 1
      }
    }

    let added = true
    while (added) {
      added = false
      const additions: number[] = []
      for (let localY = 0; localY < height; localY += 1) {
        for (let localX = 0; localX < width; localX += 1) {
          const offset = localY * width + localX
          if (inverseCandidates[offset] === 0) continue
          let occupiedNeighbors = 0
          if (localX > 0 && mask[offset - 1] === 1) occupiedNeighbors += 1
          if (localX + 1 < width && mask[offset + 1] === 1) occupiedNeighbors += 1
          if (localY > 0 && mask[offset - width] === 1) occupiedNeighbors += 1
          if (localY + 1 < height && mask[offset + width] === 1) occupiedNeighbors += 1
          if (occupiedNeighbors >= 2) additions.push(offset)
        }
      }
      for (const offset of additions) {
        mask[offset] = 1
        inverseCandidates[offset] = 0
        selected += 1
        added = true
      }
    }
    return trimSelectionMaskBounds(x, y, width, height, mask, selected)
  }
  for (let destinationY = y; destinationY < bottom; destinationY += 1) {
    for (let destinationX = x; destinationX < right; destinationX += 1) {
      const sourcePoint = transformedSelectionSourcePoint(source, target, destinationX, destinationY, angle, shear)
      if (!sourcePoint) continue
      mask[(destinationY - y) * width + destinationX - x] = 1
      selected += 1
    }
  }
  return trimSelectionMaskBounds(x, y, width, height, mask, selected)
}

export const combineSelection = (current: SelectionMask | null, incoming: SelectionMask | null, mode: SelectionMode): SelectionMask | null => {
  if (mode === 'replace') return incoming ? { ...incoming, mask: incoming.mask?.slice() } : null
  if (!current) return mode === 'add' ? (incoming ? { ...incoming, mask: incoming.mask?.slice() } : null) : null
  if (!incoming) return mode === 'subtract' ? { ...current, mask: current.mask?.slice() } : null
  const minX = Math.min(current.x, incoming.x); const minY = Math.min(current.y, incoming.y)
  const maxX = Math.max(current.x + current.width, incoming.x + incoming.width); const maxY = Math.max(current.y + current.height, incoming.y + incoming.height)
  const width = maxX - minX; const height = maxY - minY; const mask = new Uint8Array(width * height)
  let selected = 0
  for (let y = minY; y < maxY; y += 1) for (let x = minX; x < maxX; x += 1) {
    const a = selectionContains(current, x, y); const b = selectionContains(incoming, x, y)
    if ((mode === 'add' && (a || b)) || (mode === 'subtract' && a && !b) || (mode === 'intersect' && a && b)) {
      mask[(y - minY) * width + x - minX] = 1
      selected += 1
    }
  }
  return trimSelectionMaskBounds(minX, minY, width, height, mask, selected)
}

export const packedColorMatchesTolerance = (a: number, b: number, tolerance: number): boolean =>
  Math.max(
    Math.abs((a & 0xff) - (b & 0xff)),
    Math.abs(((a >>> 8) & 0xff) - ((b >>> 8) & 0xff)),
    Math.abs(((a >>> 16) & 0xff) - ((b >>> 16) & 0xff)),
    Math.abs((a >>> 24) - (b >>> 24))
  ) <= tolerance

export const magicWandSelection = (document: SpriteDocument, layer: RasterLayer, startX: number, startY: number, tolerance = 0, contiguous = true, gapClosingThreshold = 0): SelectionMask | null => {
  if (!isInBounds(document.width, document.height, startX, startY)) return null
  const normalizedTolerance = Math.max(0, Math.min(255, Math.round(tolerance)))
  const palette = layer.format === 'indexed'
    ? new Map(document.palette.map((entry) => [entry.id, packColor(getPaletteEntry(document, entry.id).color)]))
    : null
  // The hot path is deliberately kept on packed typed-array values. Reading four
  // separate channels through readLayerPacked for every flood-fill neighbor adds
  // measurable overhead on noisy images.
  const packedPixels = layer.format === 'rgba'
    ? new Uint32Array(layer.pixels.buffer, layer.pixels.byteOffset, layer.pixels.byteLength / 4)
    : null
  const directCanvasPixels = layer.offsetX === 0 && layer.offsetY === 0
    && layer.width === document.width && layer.height === document.height
  const packedAt = (index: number): number => {
    if (directCanvasPixels) return packedPixels ? packedPixels[index] : palette!.get(layer.pixels[index]) ?? 0
    const documentX = index % document.width
    const documentY = Math.floor(index / document.width)
    const localX = documentX - layer.offsetX
    const localY = documentY - layer.offsetY
    if (localX < 0 || localY < 0 || localX >= layer.width || localY >= layer.height) return 0
    const localIndex = localY * layer.width + localX
    return packedPixels ? packedPixels[localIndex] : palette!.get(layer.pixels[localIndex]) ?? 0
  }
  const target = packedAt(pixelIndex(document.width, startX, startY))
  const matches = (index: number): boolean => packedColorMatchesTolerance(packedAt(index), target, normalizedTolerance)
  const layerCoversCanvas = layer.offsetX <= 0
    && layer.offsetY <= 0
    && layer.offsetX + layer.width >= document.width
    && layer.offsetY + layer.height >= document.height
  if (layerCoversCanvas) {
    const localIndex = (startY - layer.offsetY) * layer.width + startX - layer.offsetX
    const rawTarget = layer.format === 'rgba' ? target : layer.pixels[localIndex]
    if (rasterLayerPackedValueIsUniform(layer, rawTarget)) {
      return { x: 0, y: 0, width: document.width, height: document.height }
    }
  }
  const total = document.width * document.height
  let selected: Uint8Array<ArrayBufferLike> = new Uint8Array(total)
  let selectedWidth = document.width
  let selectedHeight = document.height
  let selectedOriginX = 0
  let selectedOriginY = 0
  let minX = document.width; let maxX = -1; let minY = document.height; let maxY = -1
  const add = (index: number): void => {
    selected[index] = 1
    const x = selectedOriginX + index % selectedWidth; const y = selectedOriginY + Math.floor(index / selectedWidth)
    if (x < minX) minX = x; if (x > maxX) maxX = x
    if (y < minY) minY = y; if (y > maxY) maxY = y
  }
  if (!contiguous) {
    for (let index = 0; index < total; index += 1) if (matches(index)) add(index)
  } else {
    const targetAlpha = target >>> 24
    const left = Math.max(0, layer.offsetX)
    const top = Math.max(0, layer.offsetY)
    const right = Math.min(document.width, layer.offsetX + layer.width)
    const bottom = Math.min(document.height, layer.offsetY + layer.height)
    const bounds = targetAlpha > normalizedTolerance && right > left && bottom > top
      ? { x: left, y: top, width: right - left, height: bottom - top }
      : undefined
    const local = bounds
      ? contiguousMatchingRegionInBounds(document.width, document.height, startX, startY, matches, gapClosingThreshold, bounds)
      : null
    if (local) {
      selected = local.region
      selectedWidth = local.bounds.width
      selectedHeight = local.bounds.height
      selectedOriginX = local.bounds.x
      selectedOriginY = local.bounds.y
      for (let index = 0; index < selected.length; index += 1) if (selected[index] === 1) add(index)
    } else {
      const region = contiguousMatchingRegion(document.width, document.height, startX, startY, matches, gapClosingThreshold)
      if (region) for (let index = 0; index < total; index += 1) if (region[index] === 1) add(index)
    }
  }
  if (maxX < minX || maxY < minY) return null
  const width = maxX - minX + 1; const height = maxY - minY + 1
  const mask = new Uint8Array(width * height)
  for (let y = minY; y <= maxY; y += 1) {
    const sourceStart = (y - selectedOriginY) * selectedWidth + minX - selectedOriginX
    const targetStart = (y - minY) * width
    for (let x = 0; x < width; x += 1) mask[targetStart + x] = selected[sourceStart + x]
  }
  return { x: minX, y: minY, width, height, mask }
}

interface LassoScanlineEdge {
  yMin: number
  yMax: number
  xAtMinY: number
  slope: number
}

type LassoBoundaryVisitor = (select: (x: number, y: number) => void) => void

/**
 * Rasterizes a lasso with an active-edge scanline. The previous implementation
 * tested every pixel against every path point, which became quadratic in the
 * number of vertices for large polygon tools. Boundary pixels are written
 * separately so the existing closed-edge semantics remain intact.
 */
const rasterizeLassoSelection = (
  document: SpriteDocument,
  path: readonly { x: number; y: number }[],
  visitBoundary?: LassoBoundaryVisitor,
  clip?: SelectionRect,
  extraPoint?: { x: number; y: number }
): SelectionMask | null => {
  const pathLength = path.length + (extraPoint ? 1 : 0)
  if (pathLength < 3) return null
  const pointAt = (index: number): { x: number; y: number } => index < path.length ? path[index] : extraPoint!

  let pathMinX = Number.POSITIVE_INFINITY
  let pathMaxX = Number.NEGATIVE_INFINITY
  let pathMinY = Number.POSITIVE_INFINITY
  let pathMaxY = Number.NEGATIVE_INFINITY
  for (let index = 0; index < pathLength; index += 1) {
    const point = pointAt(index)
    pathMinX = Math.min(pathMinX, point.x)
    pathMaxX = Math.max(pathMaxX, point.x)
    pathMinY = Math.min(pathMinY, point.y)
    pathMaxY = Math.max(pathMaxY, point.y)
  }

  const clipMinX = clip ? Math.ceil(clip.x) : 0
  const clipMaxX = clip ? Math.floor(clip.x + clip.width - 1) : document.width - 1
  const clipMinY = clip ? Math.ceil(clip.y) : 0
  const clipMaxY = clip ? Math.floor(clip.y + clip.height - 1) : document.height - 1
  const minX = Math.max(0, pathMinX, clipMinX)
  const maxX = Math.min(document.width - 1, pathMaxX, clipMaxX)
  const minY = Math.max(0, pathMinY, clipMinY)
  const maxY = Math.min(document.height - 1, pathMaxY, clipMaxY)
  if (maxX < minX || maxY < minY) return null

  const width = maxX - minX + 1
  const height = maxY - minY + 1
  const mask = new Uint8Array(width * height)
  let hasSelected = false
  let selectedMinX = document.width
  let selectedMaxX = -1
  let selectedMinY = document.height
  let selectedMaxY = -1
  const select = (x: number, y: number): void => {
    if (x < minX || y < minY || x > maxX || y > maxY) return
    const offset = (y - minY) * width + x - minX
    if (mask[offset] === 1) return
    mask[offset] = 1
    hasSelected = true
    if (x < selectedMinX) selectedMinX = x
    if (x > selectedMaxX) selectedMaxX = x
    if (y < selectedMinY) selectedMinY = y
    if (y > selectedMaxY) selectedMaxY = y
  }
  const fillRange = (left: number, right: number, y: number): void => {
    if (y < minY || y > maxY) return
    const clippedLeft = Math.max(minX, left)
    const clippedRight = Math.min(maxX, right)
    if (clippedRight < clippedLeft) return
    const rowOffset = (y - minY) * width
    mask.fill(1, rowOffset + clippedLeft - minX, rowOffset + clippedRight - minX + 1)
    hasSelected = true
    if (clippedLeft < selectedMinX) selectedMinX = clippedLeft
    if (clippedRight > selectedMaxX) selectedMaxX = clippedRight
    if (y < selectedMinY) selectedMinY = y
    if (y > selectedMaxY) selectedMaxY = y
  }

  const starts = new Map<number, LassoScanlineEdge[]>()
  const edges: LassoScanlineEdge[] = []
  for (let index = 0; index < pathLength; index += 1) {
    const from = pointAt(index)
    const to = pointAt((index + 1) % pathLength)
    select(from.x, from.y)
    if (from.y === to.y) {
      const left = Math.ceil(Math.min(from.x, to.x))
      const right = Math.floor(Math.max(from.x, to.x))
      fillRange(left, right, from.y)
      continue
    }
    const lower = from.y < to.y ? from : to
    const upper = from.y < to.y ? to : from
    const edge: LassoScanlineEdge = {
      yMin: lower.y,
      yMax: upper.y,
      xAtMinY: lower.x,
      slope: (upper.x - lower.x) / (upper.y - lower.y)
    }
    edges.push(edge)
    const bucket = starts.get(edge.yMin)
    if (bucket) bucket.push(edge)
    else starts.set(edge.yMin, [edge])
  }
  visitBoundary?.(select)

  const active: LassoScanlineEdge[] = edges.filter((edge) => edge.yMin < minY && edge.yMax > minY)
  const intersections: number[] = []
  for (let y = minY; y <= maxY; y += 1) {
    const bucket = starts.get(y)
    if (bucket) active.push(...bucket)
    let activeLength = 0
    for (const edge of active) if (edge.yMax > y) active[activeLength++] = edge
    active.length = activeLength
    intersections.length = 0
    for (const edge of active) {
      const x = edge.xAtMinY + (y - edge.yMin) * edge.slope
      intersections.push(x)
      const roundedX = Math.round(x)
      if (Math.abs(x - roundedX) < 1e-9) select(roundedX, y)
    }
    intersections.sort((left, right) => left - right)
    for (let index = 0; index + 1 < intersections.length; index += 2) {
      const left = Math.max(minX, Math.floor(intersections[index]) + 1)
      const right = Math.min(maxX, Math.ceil(intersections[index + 1]) - 1)
      fillRange(left, right, y)
    }
  }

  if (!hasSelected) return null
  const trimmedWidth = selectedMaxX - selectedMinX + 1
  const trimmedHeight = selectedMaxY - selectedMinY + 1
  if (selectedMinX === minX && selectedMaxX === maxX && selectedMinY === minY && selectedMaxY === maxY) return { x: minX, y: minY, width, height, mask }
  const trimmed = new Uint8Array(trimmedWidth * trimmedHeight)
  for (let y = selectedMinY; y <= selectedMaxY; y += 1) {
    const sourceStart = (y - minY) * width + selectedMinX - minX
    const targetStart = (y - selectedMinY) * trimmedWidth
    trimmed.set(mask.subarray(sourceStart, sourceStart + trimmedWidth), targetStart)
  }
  return { x: selectedMinX, y: selectedMinY, width: trimmedWidth, height: trimmedHeight, mask: trimmed }
}

export const lassoSelection = (document: SpriteDocument, path: readonly { x: number; y: number }[]): SelectionMask | null =>
  rasterizeLassoSelection(document, path)

const visitPolygonBoundary = (
  vertices: readonly { x: number; y: number }[],
  extraPoint: { x: number; y: number } | undefined,
  balanced: boolean,
  select: (x: number, y: number) => void
): void => {
  const pathLength = vertices.length + (extraPoint ? 1 : 0)
  const pointAt = (index: number): { x: number; y: number } => index < vertices.length ? vertices[index] : extraPoint!
  for (let index = 0; index < pathLength; index += 1) {
    const from = pointAt(index)
    const to = pointAt((index + 1) % pathLength)
    if (balanced) {
      for (const point of balancedStairLinePoints(from, to)) select(point.x, point.y)
    } else forEachRasterLinePoint(from, to, select)
  }
}

export const polygonSelection = (
  document: SpriteDocument,
  vertices: readonly { x: number; y: number }[],
  balanced = false
): SelectionMask | null => rasterizeLassoSelection(document, vertices, (select) => visitPolygonBoundary(vertices, undefined, balanced, select))

/** Rasterizes a live polygon without allocating a new vertices array per pointer move. */
export const polygonSelectionPreview = (
  document: SpriteDocument,
  vertices: readonly { x: number; y: number }[],
  pointer: { x: number; y: number },
  balanced = false,
  clip?: SelectionRect
): SelectionMask | null => rasterizeLassoSelection(
  document,
  vertices,
  (select) => visitPolygonBoundary(vertices, pointer, balanced, select),
  clip,
  pointer
)

export const shiftSelection = (selection: SelectionMask | null, offsetX: number, offsetY: number, width: number, height: number): SelectionMask | null => {
  if (!selection) return null
  const points: Array<{ x: number; y: number }> = []
  for (let y = selection.y; y < selection.y + selection.height; y += 1) for (let x = selection.x; x < selection.x + selection.width; x += 1) {
    if (!selectionContains(selection, x, y)) continue
    const nextX = x + offsetX; const nextY = y + offsetY
    if (isInBounds(width, height, nextX, nextY)) points.push({ x: nextX, y: nextY })
  }
  return maskFromPoints(points)
}
