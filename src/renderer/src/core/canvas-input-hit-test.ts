import type { SelectionMask, SelectionQuad, SelectionRect } from '@shared/types-selection'
import {
  inverseSelectionQuadPoint,
  inverseTransformedSelectionPoint,
  remapTransformedSelectionPoint,
  selectionContains,
  transformedSelectionControlPoints,
  transformedSelectionPivotPreset,
  type SelectionShearTransform
} from './selection'
import type { SelectionHit } from './canvas-input-state'
import { cachedSelectionBoundarySegments } from './canvas-input-state'
import { type CanvasPoint, type SelectionHandle, type SelectionRotationHandle, type SelectionShearHandle } from './canvas-input-contracts'

export const SELECTION_RESIZE_HIT_RADIUS = 12

export const SELECTION_CORNER_RESIZE_HIT_RADIUS = 18

export const SELECTION_CORNER_OUTWARD_RESIZE_HIT_RADIUS = 5

export const SELECTION_PIVOT_HIT_RADIUS = 10

export const selectionPivotHit = (pivot: CanvasPoint, point: CanvasPoint, radius = SELECTION_PIVOT_HIT_RADIUS): boolean => Math.abs(point.x - pivot.x) <= radius && Math.abs(point.y - pivot.y) <= radius

const roundedDocumentPixelDelta = (value: number): number => Math.sign(value) * Math.round(Math.abs(value))

export const selectionPivotAtDragPoint = (pivotStart: CanvasPoint, pointerStart: CanvasPoint, pointer: CanvasPoint): CanvasPoint => ({
  x: pivotStart.x + roundedDocumentPixelDelta(pointer.x - pointerStart.x),
  y: pivotStart.y + roundedDocumentPixelDelta(pointer.y - pointerStart.y)
})

export const selectionPivotAfterResize = (
  sourceTarget: SelectionRect,
  destinationTarget: SelectionRect,
  pivot: CanvasPoint,
  options: {
    angle?: number
    shear?: SelectionShearTransform
    fromCenter?: boolean
    custom?: boolean
  } = {}
): CanvasPoint => {
  const angle = options.angle ?? 0
  if (options.fromCenter) return { ...pivot }
  return options.custom ? remapTransformedSelectionPoint(sourceTarget, destinationTarget, pivot, angle, options.shear) : transformedSelectionPivotPreset(destinationTarget, 'center', angle, options.shear)
}

export const selectionResizeHit = (box: { x: number; y: number; width: number; height: number }, point: CanvasPoint, radius: number, cornerRadius = radius, outwardCornerRadius = cornerRadius): SelectionHandle | null => {
  const left = box.x
  const right = box.x + box.width
  const top = box.y
  const bottom = box.y + box.height
  const centerX = box.x + box.width / 2
  const centerY = box.y + box.height / 2
  const nearCorner = (handle: SelectionHandle, x: number, y: number): boolean => {
    const inOuterQuadrant = handle === 'nw' ? point.x <= x && point.y <= y : handle === 'ne' ? point.x >= x && point.y <= y : handle === 'se' ? point.x >= x && point.y >= y : point.x <= x && point.y >= y
    const hitRadius = inOuterQuadrant ? outwardCornerRadius : cornerRadius
    return Math.abs(point.x - x) <= hitRadius && Math.abs(point.y - y) <= hitRadius
  }

  // 角点优先。边中段会明确避开两个角点，避免缩放与旋转命中区重叠。
  const corners: Array<[SelectionHandle, number, number]> = [
    ['nw', left, top],
    ['ne', right, top],
    ['sw', left, bottom],
    ['se', right, bottom]
  ]
  for (const [handle, x, y] of corners) if (nearCorner(handle, x, y)) return handle

  // 边缩放只命中四个可见中点，不得让整条边都变成缩放区。
  const candidates: Array<[SelectionHandle, number, number]> = [
    ['n', centerX, top],
    ['s', centerX, bottom],
    ['w', left, centerY],
    ['e', right, centerY]
  ]
  let nearest: SelectionHandle | null = null
  let nearestDistance = Number.POSITIVE_INFINITY
  for (const [handle, x, y] of candidates) {
    if (Math.abs(point.x - x) > radius || Math.abs(point.y - y) > radius) continue
    const distance = (point.x - x) ** 2 + (point.y - y) ** 2
    if (distance < nearestDistance) {
      nearest = handle
      nearestDistance = distance
    }
  }
  return nearest
}

export const rotationHandles = (box: { x: number; y: number; width: number; height: number }): Array<[SelectionRotationHandle, number, number]> => {
  const offset = 22
  return [
    ['rotate-ne', box.x + box.width + offset, box.y - offset],
    ['rotate-se', box.x + box.width + offset, box.y + box.height + offset],
    ['rotate-sw', box.x - offset, box.y + box.height + offset],
    ['rotate-nw', box.x - offset, box.y - offset]
  ]
}

// 旋转只占用角点附近的紧凑区域，避免阻挡套索继续选择周边像素。
export const ROTATION_HANDLE_HIT_RADIUS = 28

export const selectionShearHit = (box: { x: number; y: number; width: number; height: number }, point: CanvasPoint, scale = 1): SelectionShearHandle | null => {
  const safeScale = Math.max(0.0001, scale)
  const inner = SELECTION_RESIZE_HIT_RADIUS * safeScale
  const outer = ROTATION_HANDLE_HIT_RADIUS * safeScale
  const centerX = box.x + box.width / 2
  const centerY = box.y + box.height / 2
  const right = box.x + box.width
  const bottom = box.y + box.height
  if (point.y < box.y - inner && point.y >= box.y - outer && Math.abs(point.x - centerX) <= outer) return 'shear-n'
  if (point.y > bottom + inner && point.y <= bottom + outer && Math.abs(point.x - centerX) <= outer) return 'shear-s'
  if (point.x < box.x - inner && point.x >= box.x - outer && Math.abs(point.y - centerY) <= outer) return 'shear-w'
  if (point.x > right + inner && point.x <= right + outer && Math.abs(point.y - centerY) <= outer) return 'shear-e'
  return null
}

export const selectionRotationHit = (box: { x: number; y: number; width: number; height: number }, point: CanvasPoint, scale = 1): SelectionRotationHandle | null => {
  const safeScale = Math.max(0.0001, scale)
  const within = point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height
  if (within) return null
  if (selectionResizeHit(box, point, SELECTION_RESIZE_HIT_RADIUS * safeScale, SELECTION_CORNER_RESIZE_HIT_RADIUS * safeScale, SELECTION_CORNER_OUTWARD_RESIZE_HIT_RADIUS * safeScale)) return null

  const left = box.x
  const right = box.x + box.width
  const top = box.y
  const bottom = box.y + box.height
  let nearest: SelectionRotationHandle | null = null
  let nearestDistance = Number.POSITIVE_INFINITY
  const handles: Array<[SelectionRotationHandle, number, number]> = [
    ['rotate-ne', right, top],
    ['rotate-se', right, bottom],
    ['rotate-sw', left, bottom],
    ['rotate-nw', left, top]
  ]
  for (const [handle, handleX, handleY] of handles) {
    if (Math.abs(point.x - handleX) > ROTATION_HANDLE_HIT_RADIUS * safeScale || Math.abs(point.y - handleY) > ROTATION_HANDLE_HIT_RADIUS * safeScale) continue
    const distance = (point.x - handleX) ** 2 + (point.y - handleY) ** 2
    if (distance < nearestDistance) {
      nearest = handle
      nearestDistance = distance
    }
  }
  return nearest
}

export const selectionInteractionHit = (selection: SelectionMask, point: CanvasPoint, zoom: number): SelectionHit => {
  const safeZoom = Math.max(0.0001, zoom)
  const resizeHit = selectionResizeHit(selection, point, SELECTION_RESIZE_HIT_RADIUS / safeZoom, SELECTION_CORNER_RESIZE_HIT_RADIUS / safeZoom, SELECTION_CORNER_OUTWARD_RESIZE_HIT_RADIUS / safeZoom)
  if (resizeHit) return resizeHit

  const shearHit = selectionShearHit(selection, point, 1 / safeZoom)
  if (shearHit) return shearHit

  const rotationHit = selectionRotationHit(selection, point, 1 / safeZoom)
  if (rotationHit) return rotationHit

  return selectionContentHit(selection, point, safeZoom)
}

export const selectionHitStartsContentMove = (hit: SelectionHit, copyRequested: boolean): boolean => hit === 'inside' || (copyRequested && hit === 'edge')

const selectionContentHit = (selection: SelectionMask, point: CanvasPoint, zoom: number): 'inside' | 'edge' | 'outside' => {
  const safeZoom = Math.max(0.0001, zoom)

  const edgeRadius = 8 / safeZoom
  const localX = point.x - selection.x
  const localY = point.y - selection.y
  const segments = cachedSelectionBoundarySegments(selection)
  for (let index = 0; index < segments.length; index += 4) {
    const x1 = segments[index]
    const y1 = segments[index + 1]
    const x2 = segments[index + 2]
    const y2 = segments[index + 3]
    const closestX = Math.max(Math.min(x1, x2), Math.min(Math.max(x1, x2), localX))
    const closestY = Math.max(Math.min(y1, y2), Math.min(Math.max(y1, y2), localY))
    if (Math.hypot(localX - closestX, localY - closestY) <= edgeRadius) return 'edge'
  }
  return selectionContains(selection, Math.floor(point.x), Math.floor(point.y)) ? 'inside' : 'outside'
}

export const selectionTransformedInteractionHit = (selection: SelectionMask, target: SelectionRect, angle: number, shear: SelectionShearTransform | undefined, point: CanvasPoint, zoom: number): SelectionHit => {
  const safeZoom = Math.max(0.0001, zoom)
  const localPoint = inverseTransformedSelectionPoint(target, point, angle, shear)
  const resizeHit = selectionResizeHit(target, localPoint, SELECTION_RESIZE_HIT_RADIUS / safeZoom, SELECTION_CORNER_RESIZE_HIT_RADIUS / safeZoom, SELECTION_CORNER_OUTWARD_RESIZE_HIT_RADIUS / safeZoom)
  if (resizeHit) return resizeHit

  const shearHit = selectionShearHit(target, localPoint, 1 / safeZoom)
  if (shearHit) return shearHit

  const rotationHit = selectionRotationHit(target, localPoint, 1 / safeZoom)
  if (rotationHit) return rotationHit

  return selectionContentHit(selection, point, safeZoom)
}

/**
 * Free transform intentionally exposes only the four corner handles. Keep the
 * same CSS-pixel hit sizes as regular selection handles, but never let an edge
 * midpoint, shear band, or rotation region start this interaction.
 */
export const selectionFreeTransformHit = (target: SelectionRect | SelectionQuad, angle: number, shear: SelectionShearTransform | undefined, point: CanvasPoint, zoom: number): SelectionHandle | null => {
  const safeZoom = Math.max(0.0001, zoom)
  if ('nw' in target) {
    // A free-transform frame can be rotated or perspective-skewed, so global
    // x/y quadrants do not identify the corner reliably. Invert the quad first
    // and use normalized coordinates to determine whether the pointer is on
    // the outside side of that corner. The final distance check remains in
    // document coordinates, keeping the hit radius stable under zoom.
    const normalized = inverseSelectionQuadPoint(target, point)
    const corners: Array<[SelectionHandle, { x: number; y: number }, (u: number, v: number) => boolean]> = [
      ['nw', target.nw, (u, v) => u <= 0 && v <= 0],
      ['ne', target.ne, (u, v) => u >= 1 && v <= 0],
      ['sw', target.sw, (u, v) => u <= 0 && v >= 1],
      ['se', target.se, (u, v) => u >= 1 && v >= 1]
    ]
    let nearest: SelectionHandle | null = null
    let nearestDistance = Number.POSITIVE_INFINITY
    for (const [handle, corner, isOutward] of corners) {
      const distance = Math.hypot(point.x - corner.x, point.y - corner.y)
      if (!Number.isFinite(distance)) continue
      if (normalized) {
        const inCornerQuadrant =
          handle === 'nw' ? normalized.x < 0.5 && normalized.y < 0.5 : handle === 'ne' ? normalized.x > 0.5 && normalized.y < 0.5 : handle === 'se' ? normalized.x > 0.5 && normalized.y > 0.5 : normalized.x < 0.5 && normalized.y > 0.5
        if (!inCornerQuadrant) continue
      }
      const outward = normalized ? isOutward(normalized.x, normalized.y) : false
      const radius = (outward ? SELECTION_CORNER_OUTWARD_RESIZE_HIT_RADIUS : SELECTION_CORNER_RESIZE_HIT_RADIUS) / safeZoom
      if (distance > radius || distance >= nearestDistance) continue
      nearest = handle
      nearestDistance = distance
    }
    return nearest
  }
  const localPoint = inverseTransformedSelectionPoint(target, point, angle, shear)
  const controlPoints = transformedSelectionControlPoints(target, angle, shear)
  const corners: Array<[SelectionHandle, { x: number; y: number }, (local: CanvasPoint) => boolean, (local: CanvasPoint) => boolean]> = [
    ['nw', controlPoints[0], (local) => local.x < target.x + target.width / 2 && local.y < target.y + target.height / 2, (local) => local.x <= target.x && local.y <= target.y],
    ['ne', controlPoints[2], (local) => local.x > target.x + target.width / 2 && local.y < target.y + target.height / 2, (local) => local.x >= target.x + target.width && local.y <= target.y],
    ['sw', controlPoints[5], (local) => local.x < target.x + target.width / 2 && local.y > target.y + target.height / 2, (local) => local.x <= target.x && local.y >= target.y + target.height],
    ['se', controlPoints[7], (local) => local.x > target.x + target.width / 2 && local.y > target.y + target.height / 2, (local) => local.x >= target.x + target.width && local.y >= target.y + target.height]
  ]
  if (!localPoint) return null
  let nearest: SelectionHandle | null = null
  let nearestDistance = Number.POSITIVE_INFINITY
  for (const [handle, corner, inCornerQuadrant, isOutward] of corners) {
    if (!inCornerQuadrant(localPoint)) continue
    const distance = Math.hypot(point.x - corner.x, point.y - corner.y)
    const radius = (isOutward(localPoint) ? SELECTION_CORNER_OUTWARD_RESIZE_HIT_RADIUS : SELECTION_CORNER_RESIZE_HIT_RADIUS) / safeZoom
    if (!Number.isFinite(distance) || distance > radius || distance >= nearestDistance) continue
    nearest = handle
    nearestDistance = distance
  }
  return nearest
}

/**
 * Tests whether a point is inside the frame area of a free-transform
 * frame. Corner handles are resolved separately by selectionFreeTransformHit
 * this helper only answers the move-content question.
 */
export const selectionFreeTransformContentHit = (_selection: SelectionMask, target: SelectionQuad, point: CanvasPoint): boolean => {
  const normalized = inverseSelectionQuadPoint(target, point)
  if (!normalized || !Number.isFinite(normalized.x) || !Number.isFinite(normalized.y)) return false
  const epsilon = 1e-7
  // The frame, rather than the current rasterized mask, owns this hit test.
  // A transformed mask is cropped to its non-empty pixels, so using it here
  // makes transparent holes (and the newly exposed area after a resize) stop
  // the move gesture. Free transform must be movable from any point inside
  // the visible quadrilateral, including transparent pixels.
  return normalized.x >= -epsilon && normalized.x <= 1 + epsilon && normalized.y >= -epsilon && normalized.y <= 1 + epsilon
}
