import type { SelectionQuad, SelectionRect } from '@shared/types-selection'
import type { ViewState } from '@shared/types-view'
import type { SelectionHandle } from '@/core/canvas-input'
import { directionalResizeCursors, selectionResizeCursorForDirection, selectionResizeCursorForHandle, selectionCornerResizeCursorForPoints } from '@/core/canvas-visuals'
import { transformedSelectionControlPoints, type SelectionShearTransform } from '@/core/selection'

type Point = { x: number; y: number }
export function selectionHandleCursor(
  hit: SelectionHandle, view: ViewState, display: (point: Point) => Point,
  target?: SelectionRect, angle = 0, shear?: SelectionShearTransform, quad?: SelectionQuad | null
): string {
  if (quad && (hit === 'nw' || hit === 'ne' || hit === 'sw' || hit === 'se')) {
    const opposite = { nw: 'se', ne: 'sw', sw: 'ne', se: 'nw' } as const
    const point = display(quad[hit]), other = display(quad[opposite[hit]])
    const direction = { x: point.x - other.x, y: point.y - other.y }
    if (Math.hypot(direction.x, direction.y) > 1e-9) return directionalResizeCursors[selectionResizeCursorForDirection(direction)]
  }
  // Plain rectangles keep stable corner directions regardless of aspect ratio,
  // including when an existing marquee becomes a floating transform.
  if (target && (shear || target.flipHorizontal || target.flipVertical)) {
    const direction = selectionCornerResizeCursorForPoints(hit, transformedSelectionControlPoints(target, angle, shear).map(display))
    if (direction) return directionalResizeCursors[direction]
  }
  return directionalResizeCursors[selectionResizeCursorForHandle(hit, angle, view.rotation, Boolean(view.mirrored), Boolean(view.mirroredVertical))]
}
