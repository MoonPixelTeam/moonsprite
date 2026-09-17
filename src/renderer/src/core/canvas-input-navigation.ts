import type { ToolId } from '@shared/types-brush'
import { type CanvasPoint, type CanvasDragState } from './canvas-input-contracts'

export const createCanvasPanDrag = (startPan: CanvasPoint, startClient: CanvasPoint, resumeDrag?: CanvasDragState): CanvasDragState => ({
  kind: 'pan',
  start: { x: 0, y: 0 },
  last: { x: 0, y: 0 },
  startPan: { ...startPan },
  startClient: { ...startClient },
  resumeDrag: resumeDrag?.kind === 'polygon-lasso' ? resumeDrag : undefined
})

export const viewDragClientDelta = (currentClient: CanvasPoint, startClient: CanvasPoint, sensitivity = 1): CanvasPoint => {
  const scale = Number.isFinite(sensitivity) && sensitivity > 0 ? sensitivity : 1
  return {
    x: (currentClient.x - startClient.x) * scale,
    y: (currentClient.y - startClient.y) * scale
  }
}

export const restoreCanvasDragAfterPan = (panDrag: CanvasDragState, pointer: CanvasPoint): CanvasDragState | null =>
  panDrag.kind === 'pan' && panDrag.resumeDrag?.kind === 'polygon-lasso' ? { ...panDrag.resumeDrag, last: { ...pointer } } : null

export const clampCanvasZoom = (zoom: number): number => Math.max(0.0625, Math.min(64, zoom))

export const CANVAS_ZOOM_LEVELS = [0.0625, 0.083333, 0.125, 0.166667, 0.25, 0.333333, 0.5, 0.666667, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32, 48, 64] as const

export const steppedCanvasZoom = (zoom: number, zoomIn: boolean): number => {
  const epsilon = 0.000001
  if (zoomIn) return CANVAS_ZOOM_LEVELS.find((level) => level > zoom + epsilon) ?? 64
  for (let index = CANVAS_ZOOM_LEVELS.length - 1; index >= 0; index -= 1) if (CANVAS_ZOOM_LEVELS[index] < zoom - epsilon) return CANVAS_ZOOM_LEVELS[index]
  return 0.0625
}

export const normalizeCanvasWheelDelta = (event: { deltaX?: number; deltaY?: number; deltaMode?: number; wheelDelta?: number }): number => {
  const deltaY = Number.isFinite(event.deltaY) ? event.deltaY! : 0
  const deltaX = Number.isFinite(event.deltaX) ? event.deltaX! : 0
  const legacyDelta = Number.isFinite(event.wheelDelta) ? -event.wheelDelta! : 0
  const rawDelta = deltaY !== 0 ? deltaY : deltaX !== 0 ? deltaX : legacyDelta
  if (rawDelta === 0) return 0
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 800 : 1
  return rawDelta * unit
}

export const wheelCanvasZoom = (zoom: number, deltaY: number, mode: 'smooth' | 'stepped'): number => (mode === 'stepped' ? steppedCanvasZoom(zoom, deltaY < 0) : clampCanvasZoom(zoom * 2 ** (-deltaY / 480)))

export const zoomDragTarget = (startZoom: number, horizontalDistance: number, mode: 'smooth' | 'stepped'): number => {
  if (mode === 'smooth') return clampCanvasZoom(startZoom * 2 ** (horizontalDistance / 96))
  const steps = Math.trunc(horizontalDistance / 24)
  let zoom = startZoom
  for (let index = 0; index < Math.abs(steps); index += 1) zoom = steppedCanvasZoom(zoom, steps > 0)
  return zoom
}

export const zoomDragModeForModifiers = (defaultMode: 'smooth' | 'stepped', shiftKey: boolean): 'smooth' | 'stepped' => (shiftKey ? 'stepped' : defaultMode)

export const isCanvasViewNavigationTool = (tool: ToolId): boolean => tool === 'hand' || tool === 'zoom' || tool === 'rotate'

export const playbackCanvasNavigationTool = (tool: ToolId): 'hand' | 'zoom' | 'rotate' => (tool === 'zoom' || tool === 'rotate' ? tool : 'hand')

export const isCanvasViewNavigationDrag = (drag: Pick<CanvasDragState, 'kind'> | null | undefined): boolean => drag?.kind === 'pan' || drag?.kind === 'zoom-drag' || drag?.kind === 'rotate-view'

export const shouldStartCanvasPan = (tool: string): boolean => tool === 'hand'
