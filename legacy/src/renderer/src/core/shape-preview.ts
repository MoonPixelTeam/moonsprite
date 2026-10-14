import type { ShapeKind } from '@shared/types-brush'
import type { SelectionRect } from '@shared/types-selection'
import { rotatedSelectionBounds } from './selection'
import { rotatedShapePixelPoints, shapeBoundaryPixelPoints } from './tools-shapes'

/** Rasterize the complete contour in a local domain, never at the document edge. */
export function unboundedShapePreview(bounds: SelectionRect, kind: ShapeKind, angle = 0, radius = 0, strokeWidth = 1) {
  const extent = rotatedSelectionBounds(bounds, angle)
  const x = Math.floor(extent.x) - 2
  const y = Math.floor(extent.y) - 2
  const width = Math.ceil(extent.width) + 4
  const height = Math.ceil(extent.height) + 4
  const local = { ...bounds, x: bounds.x - x, y: bounds.y - y }
  const points = strokeWidth > 1 && (kind === 'rectangle-outline' || kind === 'ellipse-outline')
    ? rotatedShapePixelPoints(local, kind, width, height, angle, radius, strokeWidth)
    : shapeBoundaryPixelPoints(local, kind, width, height, angle, radius)
  return points.map(point => ({ ...point, x: point.x + x, y: point.y + y }))
}
