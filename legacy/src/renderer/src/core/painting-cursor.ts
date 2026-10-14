import { documentPointFromViewportPointContinuous, viewportPointFromDocumentPointContinuous, type ViewGeometryState } from './view-geometry'
import type { RotationIndicatorPosition } from './file-preferences'

export function paintingCursorPixelCenter(point: { x: number; y: number }, size: { width: number; height: number }, document: { width: number; height: number }, view: ViewGeometryState, position: RotationIndicatorPosition, interfaceScale: number) {
  const local = documentPointFromViewportPointContinuous({ x: point.x * interfaceScale, y: point.y * interfaceScale }, size.width, size.height, document.width, document.height, view, position)
  const center = viewportPointFromDocumentPointContinuous({ x: Math.floor(local.x) + 0.5, y: Math.floor(local.y) + 0.5 }, size.width, size.height, document.width, document.height, view, position)
  return { x: center.x / interfaceScale, y: center.y / interfaceScale }
}
