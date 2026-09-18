import type { SelectionMask, SelectionRect } from '@shared/types-selection'
import { selectionContains, transformedSelectionBounds, transformedSelectionSourcePoint, type SelectionShearTransform } from './selection'

export interface SymmetryAxes {
  horizontal: boolean
  vertical: boolean
  diagonalUp: boolean
  diagonalDown: boolean
  rotational?: boolean
}

export interface SymmetryPoint { x: number; y: number }
export interface SymmetryCenter { x: number; y: number }
export type SymmetryAxis = Exclude<keyof SymmetryAxes, 'rotational'>
export type SymmetryMode = keyof SymmetryAxes
export interface SymmetryAxisSegment { start: SymmetryPoint; end: SymmetryPoint }

export const DEFAULT_SYMMETRY_AXES: SymmetryAxes = {
  horizontal: false,
  vertical: false,
  diagonalUp: false,
  diagonalDown: false,
  rotational: false
}

export const hasSymmetry = (axes: SymmetryAxes | null | undefined): boolean =>
  Boolean(axes?.horizontal || axes?.vertical || axes?.diagonalUp || axes?.diagonalDown || axes?.rotational)

export const defaultSymmetryCenter = (width: number, height: number): SymmetryCenter => ({ x: width / 2, y: height / 2 })

/** A locked symmetry axis can only be moved while the temporary Ctrl override is held. */
export const symmetryAxisDragAllowed = (locked: boolean, ctrlHeld: boolean): boolean => !locked || ctrlHeld

const resolvedCenter = (width: number, height: number, center?: SymmetryCenter | null): SymmetryCenter => center ?? defaultSymmetryCenter(width, height)
const snapHalf = (value: number): number => Math.round(value * 2) / 2
const clamp = (value: number, minimum: number, maximum: number): number => Math.max(minimum, Math.min(maximum, value))

export function moveSymmetryCenter(center: SymmetryCenter, axis: SymmetryAxis | 'center', point: SymmetryCenter, width: number, height: number): SymmetryCenter {
  let x = center.x
  let y = center.y
  if (axis === 'center') {
    x = point.x
    y = point.y
  } else if (axis === 'horizontal') y = point.y
  else if (axis === 'vertical') x = point.x
  else if (axis === 'diagonalDown') {
    const delta = (point.y - center.y - (point.x - center.x)) / 2
    x = center.x - delta
    y = center.y + delta
  } else {
    const delta = (point.x - center.x + point.y - center.y) / 2
    x = center.x + delta
    y = center.y + delta
  }
  return { x: snapHalf(clamp(x, 0, width)), y: snapHalf(clamp(y, 0, height)) }
}

const addCandidate = (points: SymmetryPoint[], x: number, y: number, width: number, height: number): void => {
  const epsilon = 1e-6
  if (x < -epsilon || y < -epsilon || x > width + epsilon || y > height + epsilon) return
  const point = { x: Math.max(0, Math.min(width, x)), y: Math.max(0, Math.min(height, y)) }
  if (!points.some((candidate) => Math.abs(candidate.x - point.x) < epsilon && Math.abs(candidate.y - point.y) < epsilon)) points.push(point)
}

export function symmetryAxisSegment(axis: SymmetryAxis, width: number, height: number, center?: SymmetryCenter | null): SymmetryAxisSegment | null {
  const pivot = resolvedCenter(width, height, center)
  if (axis === 'horizontal') return pivot.y < 0 || pivot.y > height ? null : { start: { x: 0, y: pivot.y }, end: { x: width, y: pivot.y } }
  if (axis === 'vertical') return pivot.x < 0 || pivot.x > width ? null : { start: { x: pivot.x, y: 0 }, end: { x: pivot.x, y: height } }
  const points: SymmetryPoint[] = []
  if (axis === 'diagonalDown') {
    const offset = pivot.y - pivot.x
    addCandidate(points, 0, offset, width, height)
    addCandidate(points, width, width + offset, width, height)
    addCandidate(points, -offset, 0, width, height)
    addCandidate(points, height - offset, height, width, height)
  } else {
    const sum = pivot.x + pivot.y
    addCandidate(points, 0, sum, width, height)
    addCandidate(points, width, sum - width, width, height)
    addCandidate(points, sum, 0, width, height)
    addCandidate(points, sum - height, height, width, height)
  }
  if (points.length < 2) return null
  points.sort((left, right) => left.x - right.x || left.y - right.y)
  return { start: points[0], end: points.at(-1)! }
}

const pointKey = ({ x, y }: SymmetryPoint): string => `${x}:${y}`

interface SymmetryMatrix {
  xx: number
  xy: number
  yx: number
  yy: number
}

interface SymmetryOrbitPoint {
  point: SymmetryPoint
  matrix: SymmetryMatrix
}

const IDENTITY_SYMMETRY_MATRIX: SymmetryMatrix = { xx: 1, xy: 0, yx: 0, yy: 1 }

const multiplySymmetryMatrices = (left: SymmetryMatrix, right: SymmetryMatrix): SymmetryMatrix => ({
  xx: left.xx * right.xx + left.xy * right.yx,
  xy: left.xx * right.xy + left.xy * right.yy,
  yx: left.yx * right.xx + left.yy * right.yx,
  yy: left.yx * right.xy + left.yy * right.yy
})

const transformSymmetryDelta = (matrix: SymmetryMatrix, delta: SymmetryPoint): SymmetryPoint => ({
  x: matrix.xx * delta.x + matrix.xy * delta.y,
  y: matrix.yx * delta.x + matrix.yy * delta.y
})

function enabledSymmetryMatrices(axes: SymmetryAxes): SymmetryMatrix[] {
  const matrices: SymmetryMatrix[] = []
  if (axes.horizontal) matrices.push({ xx: 1, xy: 0, yx: 0, yy: -1 })
  if (axes.vertical) matrices.push({ xx: -1, xy: 0, yx: 0, yy: 1 })
  if (axes.diagonalDown) matrices.push({ xx: 0, xy: 1, yx: 1, yy: 0 })
  if (axes.diagonalUp) matrices.push({ xx: 0, xy: -1, yx: -1, yy: 0 })
  if (axes.rotational) matrices.push({ xx: 0, xy: -1, yx: 1, yy: 0 })
  return matrices
}

function symmetryOrbit(point: SymmetryPoint, width: number, height: number, axes: SymmetryAxes | null | undefined, center?: SymmetryCenter | null, clipToCanvas = true): SymmetryOrbitPoint[] {
  if (width <= 0 || height <= 0 || !hasSymmetry(axes)) {
    return !clipToCanvas || (point.x >= 0 && point.y >= 0 && point.x < width && point.y < height)
      ? [{ point: { ...point }, matrix: IDENTITY_SYMMETRY_MATRIX }]
      : []
  }
  const transforms = enabledSymmetryMatrices(axes!)
  const pivot = resolvedCenter(width, height, center)
  const delta = { x: point.x + 0.5 - pivot.x, y: point.y + 0.5 - pivot.y }
  const result: SymmetryOrbitPoint[] = []
  const queue: SymmetryMatrix[] = [IDENTITY_SYMMETRY_MATRIX]
  const seenMatrices = new Set<string>()
  const seenPoints = new Set<string>()
  // Compose the finite square-symmetry group (at most eight matrices), not
  // rounded pixels: half-pixel pivots can otherwise create unbounded drift.
  for (let index = 0; index < queue.length; index += 1) {
    const matrix = queue[index]
    const matrixKey = `${matrix.xx}:${matrix.xy}:${matrix.yx}:${matrix.yy}`
    if (seenMatrices.has(matrixKey)) continue
    seenMatrices.add(matrixKey)
    const transformed = transformSymmetryDelta(matrix, delta)
    const candidate = index === 0 ? { ...point } : {
      x: Math.round(pivot.x + transformed.x - 0.5),
      y: Math.round(pivot.y + transformed.y - 0.5)
    }
    const key = pointKey(candidate)
    if (!seenPoints.has(key)) {
      seenPoints.add(key)
      if (!clipToCanvas || (candidate.x >= 0 && candidate.y >= 0 && candidate.x < width && candidate.y < height)) {
        result.push({ point: candidate, matrix })
      }
    }
    // Even coincident or clipped pixels may have distinct transforms.
    for (const transform of transforms) queue.push(multiplySymmetryMatrices(transform, matrix))
  }
  return result
}

/** Returns the complete, de-duplicated orbit of a pixel under the enabled canvas-centered symmetries. */
export function symmetryPoints(point: SymmetryPoint, width: number, height: number, axes: SymmetryAxes | null | undefined, center?: SymmetryCenter | null, clipToCanvas = true): SymmetryPoint[] {
  return symmetryOrbit(point, width, height, axes, center, clipToCanvas).map((candidate) => candidate.point)
}

const isRotationalOnly = (axes: SymmetryAxes | null | undefined): boolean => Boolean(
  axes?.rotational
  && !axes.horizontal
  && !axes.vertical
  && !axes.diagonalUp
  && !axes.diagonalDown
)

/** Returns the quadrant used as the representative region for a four-way rotation. */
const rotationalSector = (point: SymmetryPoint, width: number, height: number, center?: SymmetryCenter | null): number => {
  const pivot = resolvedCenter(width, height, center)
  const dx = point.x + 0.5 - pivot.x
  const dy = point.y + 0.5 - pivot.y
  const epsilon = 1e-9
  if (Math.abs(dx) < epsilon && Math.abs(dy) < epsilon) return -1
  if (Math.abs(dx) < epsilon) return dy < 0 ? 0 : 2
  if (Math.abs(dy) < epsilon) return dx >= 0 ? 1 : 3
  if (dx >= 0) return dy < 0 ? 1 : 2
  return dy < 0 ? 0 : 3
}

const selectionMaskFromPoints = (points: SymmetryPoint[]): SelectionMask | null => {
  if (points.length === 0) return null
  let left = points[0].x
  let top = points[0].y
  let right = points[0].x
  let bottom = points[0].y
  for (const point of points) {
    left = Math.min(left, point.x)
    top = Math.min(top, point.y)
    right = Math.max(right, point.x)
    bottom = Math.max(bottom, point.y)
  }
  const width = right - left + 1
  const height = bottom - top + 1
  const mask = new Uint8Array(width * height)
  for (const point of points) mask[(point.y - top) * width + point.x - left] = 1
  return { x: left, y: top, width, height, mask }
}

/** Returns the side of a rotationally symmetric selection that contains the pressed pixel. */
export function symmetrySelectionDragRegion(selection: SelectionMask, startPoint: SymmetryPoint, width: number, height: number, axes: SymmetryAxes | null | undefined, center?: SymmetryCenter | null): SelectionMask | null {
  if (!isRotationalOnly(axes) || !selectionContains(selection, startPoint.x, startPoint.y)) return null
  const startSector = rotationalSector(startPoint, width, height, center)
  const points: SymmetryPoint[] = []
  for (let y = selection.y; y < selection.y + selection.height; y += 1) {
    for (let x = selection.x; x < selection.x + selection.width; x += 1) {
      if (!selectionContains(selection, x, y)) continue
      const sector = rotationalSector({ x, y }, width, height, center)
      if (sector === startSector || (startSector === -1 && sector === -1)) points.push({ x, y })
    }
  }
  return selectionMaskFromPoints(points)
}

/** Translates one pressed rotational region and generates its complete symmetry closure. */
export function translateSymmetrySelection(selection: SelectionMask, target: SelectionRect, width: number, height: number, axes: SymmetryAxes | null | undefined, center: SymmetryCenter | null | undefined, startPoint: SymmetryPoint, clipToCanvas = true): SelectionMask | null {
  if (!isRotationalOnly(axes)
    || target.width !== selection.width
    || target.height !== selection.height
    || target.flipHorizontal
    || target.flipVertical
    || !Number.isInteger(target.x - selection.x)
    || !Number.isInteger(target.y - selection.y)) return null
  const region = symmetrySelectionDragRegion(selection, startPoint, width, height, axes, center)
  if (!region) return null
  const deltaX = target.x - selection.x
  const deltaY = target.y - selection.y
  const points: SymmetryPoint[] = []
  const seen = new Set<string>()
  const append = (point: SymmetryPoint): void => {
    if (clipToCanvas && (point.x < 0 || point.y < 0 || point.x >= width || point.y >= height)) return
    const key = pointKey(point)
    if (seen.has(key)) return
    seen.add(key)
    points.push(point)
  }
  for (let y = region.y; y < region.y + region.height; y += 1) {
    for (let x = region.x; x < region.x + region.width; x += 1) {
      if (!selectionContains(region, x, y)) continue
      for (const destination of symmetryPoints({ x: x + deltaX, y: y + deltaY }, width, height, axes, center, clipToCanvas)) append(destination)
    }
  }
  return selectionMaskFromPoints(points)
}

/** Maps a drag from the pressed mirror region into the canonical region transformed by transformSymmetrySelection. */
export function symmetrySelectionDragDelta(selection: SelectionMask, startPoint: SymmetryPoint, delta: SymmetryPoint, width: number, height: number, axes: SymmetryAxes | null | undefined, center?: SymmetryCenter | null, followPressedRegion = false): SymmetryPoint {
  if (!hasSymmetry(axes)) return { ...delta }
  if (followPressedRegion && isRotationalOnly(axes) && selectionContains(selection, startPoint.x, startPoint.y)) return { ...delta }
  const orbit = symmetryOrbit(startPoint, width, height, axes, center, false)
  const selectedCandidates = orbit.filter((candidate) => selectionContains(selection, candidate.point.x, candidate.point.y))
  const candidates = selectedCandidates.length > 0 ? selectedCandidates : orbit
  if (candidates.length === 0) return { ...delta }
  const representative = candidates.reduce((current, candidate) => {
    const currentKey = current.point.y * width + current.point.x
    const candidateKey = candidate.point.y * width + candidate.point.x
    return candidateKey < currentKey ? candidate : current
  })
  return transformSymmetryDelta(representative.matrix, delta)
}

export function symmetrySelection(selection: SelectionMask | null, width: number, height: number, axes: SymmetryAxes | null | undefined, center?: SymmetryCenter | null): SelectionMask | null {
  if (!selection) return null
  if (!hasSymmetry(axes)) return { ...selection, mask: selection.mask?.slice() }
  const points: SymmetryPoint[] = []
  let left = width
  let top = height
  let right = -1
  let bottom = -1
  const seen = new Set<string>()
  for (let y = selection.y; y < selection.y + selection.height; y += 1) {
    for (let x = selection.x; x < selection.x + selection.width; x += 1) {
      if (!selectionContains(selection, x, y)) continue
      for (const point of symmetryPoints({ x, y }, width, height, axes, center)) {
        const key = pointKey(point)
        if (seen.has(key)) continue
        seen.add(key)
        points.push(point)
        left = Math.min(left, point.x)
        top = Math.min(top, point.y)
        right = Math.max(right, point.x)
        bottom = Math.max(bottom, point.y)
      }
    }
  }
  if (points.length === 0) return null
  const maskWidth = right - left + 1
  const maskHeight = bottom - top + 1
  const mask = new Uint8Array(maskWidth * maskHeight)
  for (const point of points) mask[(point.y - top) * maskWidth + point.x - left] = 1
  return { x: left, y: top, width: maskWidth, height: maskHeight, mask }
}

const isSelectionSymmetryRepresentative = (point: SymmetryPoint, selection: SelectionMask, width: number, height: number, axes: SymmetryAxes, center?: SymmetryCenter | null, clipToCanvas = true): boolean => {
  const currentKey = point.y * width + point.x
  return symmetryPoints(point, width, height, axes, center, clipToCanvas)
    .filter((candidate) => selectionContains(selection, candidate.x, candidate.y))
    .every((candidate) => currentKey <= candidate.y * width + candidate.x)
}

/** Transforms one fundamental selection region and mirrors the result without duplicating an already symmetric source. */
export function transformSymmetrySelection(selection: SelectionMask, target: SelectionRect, width: number, height: number, angle = 0, shear?: SelectionShearTransform, axes?: SymmetryAxes | null, center?: SymmetryCenter | null, clipToCanvas = true, startPoint?: SymmetryPoint): SelectionMask | null {
  const normalizedAngle = ((angle % 360) + 360) % 360
  if (startPoint && normalizedAngle === 0 && !shear) {
    const translated = translateSymmetrySelection(selection, target, width, height, axes, center, startPoint, clipToCanvas)
    if (translated) return translated
  }
  const bounds = transformedSelectionBounds(target, angle, shear)
  const left = clipToCanvas ? Math.max(0, bounds.x) : bounds.x
  const top = clipToCanvas ? Math.max(0, bounds.y) : bounds.y
  const right = clipToCanvas ? Math.min(width, bounds.x + bounds.width) : bounds.x + bounds.width
  const bottom = clipToCanvas ? Math.min(height, bounds.y + bounds.height) : bounds.y + bounds.height
  if (right <= left || bottom <= top) return null
  const points: SymmetryPoint[] = []
  const seen = new Set<string>()
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const sourcePoint = transformedSelectionSourcePoint(selection, target, x, y, angle, shear)
      if (!sourcePoint || (axes && hasSymmetry(axes) && !isSelectionSymmetryRepresentative(sourcePoint, selection, width, height, axes, center, clipToCanvas))) continue
      for (const destination of symmetryPoints({ x, y }, width, height, axes, center, clipToCanvas)) {
        const key = pointKey(destination)
        if (seen.has(key)) continue
        seen.add(key)
        points.push(destination)
      }
    }
  }
  if (points.length === 0) return null
  const minX = Math.min(...points.map((point) => point.x))
  const minY = Math.min(...points.map((point) => point.y))
  const maxX = Math.max(...points.map((point) => point.x))
  const maxY = Math.max(...points.map((point) => point.y))
  const mask = new Uint8Array((maxX - minX + 1) * (maxY - minY + 1))
  for (const point of points) mask[(point.y - minY) * (maxX - minX + 1) + point.x - minX] = 1
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1, mask }
}
