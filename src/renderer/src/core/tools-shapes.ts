import type { RasterLayer } from '@shared/types-layer'
import type { RgbaColor } from '@shared/types-color'
import type { SelectionMask, SelectionRect } from '@shared/types-selection'
import type { ShapeKind } from '@shared/types-brush'
import type { SpriteDocument } from '@shared/types-document'
import { layerIndexAt } from './document-model'
import { recordPixel, type PixelEdit } from './history'
import { lassoSelection, polygonSelection, rasterLinePoints, rotatedEllipseSelection, rotatedRectSelection, rotatedSelectionBounds, roundedRectContainsPoint, roundedRectRadius, selectionContains } from './selection'
import { balancedStairLinePoints } from './pixel-line'
import { symmetryPoints, type SymmetryAxes, type SymmetryCenter } from './symmetry'
import { interpolateRgbaColor } from './gradient-color'
import { BrushGradientSample, interpolateBrushAngle, ensureLayerCoversEditRect, insideSelection, paintLayerValue, BrushMaskPoint } from './tools-pixel-edit'

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
  cornerRadius = 0,
  strokeWidth = 1
): void {
  const points = rotatedShapePixelPoints(bounds, kind, document.width, document.height, angle, cornerRadius, strokeWidth)
  if (points.length === 0) return
  const destinations = points.flatMap((point) => symmetryPoints(point, document.width, document.height, symmetryAxes, symmetryCenter))
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity
  for (const point of destinations) {
    left = Math.min(left, point.x)
    top = Math.min(top, point.y)
    right = Math.max(right, point.x + 1)
    bottom = Math.max(bottom, point.y + 1)
  }
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
  cornerRadius = 0,
  strokeWidth = 1
): BrushMaskPoint[] {
  if (kind === 'freeform' || kind === 'polygon') return []
  const thickness = Number.isFinite(strokeWidth) ? Math.max(1, Math.min(128, Math.round(strokeWidth))) : 1
  if (thickness > 1 && (kind === 'rectangle-outline' || kind === 'ellipse-outline')) {
    const filledKind = kind === 'ellipse-outline' ? 'ellipse' : 'rectangle'
    const outer = rotatedShapePixelPoints(bounds, filledKind, canvasWidth, canvasHeight, angle, cornerRadius)
    const innerBounds = { x: bounds.x + thickness, y: bounds.y + thickness, width: bounds.width - thickness * 2, height: bounds.height - thickness * 2 }
    if (innerBounds.width <= 0 || innerBounds.height <= 0) return outer
    const inner = rotatedShapePixelPoints(innerBounds, filledKind, canvasWidth, canvasHeight, angle, Math.max(0, cornerRadius - thickness))
    const rows = new Map<number, Set<number>>()
    for (const point of inner) {
      let row = rows.get(point.y)
      if (!row) { row = new Set(); rows.set(point.y, row) }
      row.add(point.x)
    }
    return outer.filter(point => !rows.get(point.y)?.has(point.x))
  }
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
