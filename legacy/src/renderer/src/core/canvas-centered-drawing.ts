import type { SelectionRect } from '@shared/types-selection'
import type { ShapeRatio } from '@shared/types-brush'
import type { CanvasDragState, CanvasPoint } from './canvas-input-contracts'
import { centeredShapeBounds } from './canvas-input-resize'

type CanvasSize = { width: number; height: number }

/** Match canvas parity so integer pixel edges have the exact canvas center. */
export function centerBoundsOnCanvas(bounds: SelectionRect, canvas: CanvasSize, anchor: CanvasPoint = { x: canvas.width / 2, y: canvas.height / 2 }): SelectionRect {
  const dimension = (value: number, canvasValue: number): number => {
    const minimum = canvasValue % 2 === 0 ? 2 : 1
    return Math.max(minimum, Math.round((value - minimum) / 2) * 2 + minimum)
  }
  const width = dimension(bounds.width, Math.round(anchor.x * 2))
  const height = dimension(bounds.height, Math.round(anchor.y * 2))
  return { x: anchor.x - width / 2, y: anchor.y - height / 2, width, height }
}

export function canvasCenteredDragFields(enabled: boolean, canvas: CanvasSize, point: CanvasPoint, proportional = false, ratio: ShapeRatio | null = null, anchor: CanvasPoint = { x: canvas.width / 2, y: canvas.height / 2 }): Partial<CanvasDragState> {
  if (!enabled) return {}
  const start = { x: anchor.x - 0.5, y: anchor.y - 0.5 }
  const bounds = centerBoundsOnCanvas(centeredShapeBounds(start, point, proportional, ratio), canvas, anchor)
  return { start, drawingAnchor: { ...anchor }, canvasCenterSize: { width: canvas.width, height: canvas.height }, marqueeBounds: bounds, previewTarget: bounds, previewAngle: 0 }
}


export function drawingAnchorPoint(session: { document: CanvasSize; drawingAnchor?: CanvasPoint }): CanvasPoint {
  const anchor = session.drawingAnchor ?? { x: 0.5, y: 0.5 }
  return { x: Math.round(anchor.x * session.document.width * 2) / 2, y: Math.round(anchor.y * session.document.height * 2) / 2 }
}

export function drawingAnchorActive(session: { drawFromCanvasCenter: boolean; tool: string; selectionKind: string; shapeKind: string }): boolean {
  return session.drawFromCanvasCenter && ((session.tool === 'selection' && ['rectangle', 'ellipse'].includes(session.selectionKind)) || (session.tool === 'shape' && ['rectangle', 'rectangle-outline', 'ellipse', 'ellipse-outline'].includes(session.shapeKind)))
}
