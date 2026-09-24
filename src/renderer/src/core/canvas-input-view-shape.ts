import type { ShapeRatio } from '@shared/types-brush'
import type { CanvasPoint } from './canvas-input-contracts'
import { centeredShapeBounds, shapeBounds } from './canvas-input-resize'
import { rotateViewportPoint, type ViewGeometryState } from './view-geometry'

/** Document angle whose axes are horizontal/vertical in the displayed view. */
export function viewAlignedShapeAngle(view: Pick<ViewGeometryState, 'rotation' | 'mirrored' | 'mirroredVertical'>): number {
  // A single reflection reverses the rotation; two reflections preserve it.
  const angle = Boolean(view.mirrored) !== Boolean(view.mirroredVertical) ? view.rotation : -view.rotation
  return ((angle % 360) + 540) % 360 - 180
}

/** Size in the displayed axes, then return a document-space rotation box. */
export function viewAlignedShapeBounds(start: CanvasPoint, end: CanvasPoint, angle: number, fromCenter: boolean, proportional = false, ratio: ShapeRatio | null = null) {
  const localEnd = rotateViewportPoint(end, start, -angle)
  const point = angle === 0 ? end : {
    x: start.x + Math.round(localEnd.x - start.x),
    y: start.y + Math.round(localEnd.y - start.y)
  }
  const localBounds = fromCenter ? centeredShapeBounds(start, point, proportional, ratio) : shapeBounds(start, point, proportional, ratio)
  // Input points address pixels; rotate their centers, not their top-left edges.
  const center = rotateViewportPoint(
    { x: localBounds.x + localBounds.width / 2, y: localBounds.y + localBounds.height / 2 },
    { x: start.x + 0.5, y: start.y + 0.5 },
    angle
  )
  return {
    bounds: angle === 0 ? localBounds : { ...localBounds, x: center.x - localBounds.width / 2, y: center.y - localBounds.height / 2 },
    direction: { x: point.x < start.x ? -1 as const : 1 as const, y: point.y < start.y ? -1 as const : 1 as const }
  }
}
