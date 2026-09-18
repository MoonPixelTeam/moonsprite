import type { SelectionHit } from '@/core/canvas-input-state'
import type { TileRepeatMode } from '@shared/types-raster'
import type { SelectionMask, SelectionMode } from '@shared/types-selection'
import type { DocumentSession } from '@/store/workspace'
import type { CanvasDragState, CanvasPoint } from '@/core/canvas-input-contracts'
import { cloneSelection } from '@/core/selection'
import { collectSmoothBrushArea } from '@/core/smooth-brush'
import { brushAngleWithDynamics } from './canvas-stage-helpers'

export function moveSelectionBrush(drag: CanvasDragState, session: DocumentSession, point: CanvasPoint, optimizedRotation: boolean, repeatMode: TileRepeatMode): boolean {
  if (drag.kind !== 'selection-brush' || !drag.selectionBrushStroke) return false
  collectSmoothBrushArea(session.document, drag.selectionBrushStroke, drag.last, point,
    session.brushSize, null, session.brushShape, brushAngleWithDynamics(session), optimizedRotation, repeatMode)
  drag.last = point
  return true
}

export function beginSelectionBrush(session: DocumentSession, point: CanvasPoint, selection: SelectionMask | null, mode: SelectionMode, optimizedRotation: boolean, repeatMode: TileRepeatMode): CanvasDragState {
  const drag: CanvasDragState = {
    kind: 'selection-brush', start: point, last: point,
    selectionStart: cloneSelection(selection), selectionMode: mode,
    selectionBrushStroke: { visited: new Set<number>() }
  }
  moveSelectionBrush(drag, session, point, optimizedRotation, repeatMode)
  return drag
}

export function selectionBrushOwnsPointer(freeTransformActive: boolean, hit: SelectionHit): boolean {
  return !freeTransformActive && hit === 'outside'
}
