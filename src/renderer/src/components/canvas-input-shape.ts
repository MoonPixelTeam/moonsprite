import { canvasCenteredDragFields, drawingAnchorPoint } from '@/core/canvas-centered-drawing'
import type { RgbaColor } from '@shared/types-color'
import type { SelectionMask } from '@shared/types-selection'
import { isLayerEffectivelyLocked } from '@/core/document-model'
import { beginPixelEdit } from '@/core/history'
import { DEFAULT_GRID_SETTINGS, snapPointToGrid } from '@/core/grid'
import { filledShapePathPixelPoints, paintShape } from '@/core/tools-shapes'
import { useWorkspace, type DocumentSession } from '@/store/workspace'
import { activePaintLayer } from '@/store/workspace-session'
import { CanvasInputState } from '@/core/canvas-input-controller'
import { appendCanvasPathStep, shouldClosePolygonLasso } from '@/core/canvas-input-path'
import { shapeBounds } from '@/core/canvas-input-resize'
import { type CanvasDragState as DragState, type CanvasPoint as Point } from '@/core/canvas-input-contracts'
import { type FreeTileSourceEditRaster } from '@/core/free-tile-edit'

interface Ports {
  commitPolygonShape: () => void
  scheduleDraw: () => void
  gridSnapActive: boolean
  inputRef: import('react').RefObject<CanvasInputState>
  draw: () => void
  isoGridSnapActive: boolean
  snapToIsoGrid: (point: Point) => Point
  currentSelectionMarqueeModifierState: () => {
    fromCenter: boolean
    proportional: boolean
    rotate: boolean
  }
  updateShapePreview: (
    drag: DragState,
    point: Point,
    modifiers: ReturnType<
      (event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>) => {
        fromCenter: boolean
        proportional: boolean
        rotate: boolean
      }
    >
  ) => void
  resolveStraightLine: (
    from: Point,
    to: Point,
    constrained: boolean
  ) => {
    from: Point
    to: Point
  }
  freeTileSourceEditForDrag: (drag: DragState) => FreeTileSourceEditRaster | null
  paintSelectionForDrag: (drag: DragState) => SelectionMask | null
  symmetryCenter: import('@/core/symmetry').SymmetryCenter
  shapeCornerRadius: number
  t: (key: import('@/locales/contracts').TranslationKey, params?: import('@/locales/contracts').TranslationParams) => string
  commitFreeTileSourceDrag: (drag: DragState, label: string) => boolean
  commitShapePoints: (drag: DragState, points: readonly Point[], label: string) => void
  commitBrushPath: (drag: DragState, points: readonly Point[], label: string) => void
  lineShapeBrushPoints: (drag: DragState) => readonly Point[]
  curveShapePixelPoints: (drag: DragState) => readonly Point[]
}

export function createShapeCanvasInput(ports: Ports) {
  function extendPolygonShape({
    session,
    activePolygon,
    event,
    point
  }: {
    session: DocumentSession
    activePolygon: DragState | null
    event: React.PointerEvent<HTMLCanvasElement>
    point: Point
  }): boolean {
    const { commitPolygonShape, scheduleDraw } = ports
    if (session.tool === 'shape' && activePolygon?.kind === 'polygon-shape' && (event.button === 0 || event.button === 2)) {
      const path = activePolygon.path ?? []
      if (shouldClosePolygonLasso(path, point, event.detail)) {
        commitPolygonShape()
        return true
      }
      appendCanvasPathStep(activePolygon, point)
      activePolygon.last = point
      scheduleDraw()
      return true
    }
    return false
  }

  function extendCurve({
    session,
    activePolygon,
    event
  }: {
    session: DocumentSession
    activePolygon: DragState | null
    event: React.PointerEvent<HTMLCanvasElement>
  }): boolean {
    const {} = ports
    if (
      session.tool === 'line' &&
      session.lineKind === 'curve' &&
      activePolygon?.kind === 'curve-shape' &&
      activePolygon.curvePhase === 'anchors' &&
      (event.button === 0 || event.button === 2)
    ) {
      return true
    }
    return false
  }

  function beginShape({
    session,
    canEditLayer,
    tilemapPixelEditBlocked,
    event,
    activeColor,
    point,
    tilemapEditDragState
  }: {
    session: DocumentSession
    canEditLayer: boolean
    tilemapPixelEditBlocked: boolean
    event: React.PointerEvent<HTMLCanvasElement>
    activeColor: (button?: number) => RgbaColor
    point: Point
    tilemapEditDragState:
      | {
          tilemapEditSelection: SelectionMask
        }
      | {
          tilemapEditSelection?: undefined
        }
  }): boolean {
    const { gridSnapActive, inputRef, draw } = ports
    if (session.tool === 'shape') {
      if (!canEditLayer || tilemapPixelEditBlocked || (event.button !== 0 && event.button !== 2)) return true
      const color = activeColor(event.button)
      const shapePoint = gridSnapActive ? snapPointToGrid(point, session.view.grid ?? DEFAULT_GRID_SETTINGS) : point
      if (session.shapeKind === 'freeform')
        inputRef.current.drag = { kind: 'freeform-shape', start: shapePoint, last: shapePoint, color, path: [shapePoint], ...tilemapEditDragState }
      else if (session.shapeKind === 'polygon')
        inputRef.current.drag = { kind: 'polygon-shape', start: shapePoint, last: shapePoint, color, path: [shapePoint], ...tilemapEditDragState }
      else
        inputRef.current.drag = {
          kind: 'shape',
          start: shapePoint,
          last: shapePoint,
          startClient: { x: event.clientX, y: event.clientY },
          constrain: inputRef.current.shiftHeld,
          ...canvasCenteredDragFields(session.drawFromCanvasCenter, session.document, shapePoint, inputRef.current.shiftHeld, session.shapeRatio, drawingAnchorPoint(session)),
          ...tilemapEditDragState
        }
      draw()
      return true
    }
    return false
  }

  function beginLine({
    session,
    event,
    canEditLayer,
    tilemapPixelEditBlocked,
    point,
    activeColor,
    tilemapEditDragState
  }: {
    session: DocumentSession
    event: React.PointerEvent<HTMLCanvasElement>
    canEditLayer: boolean
    tilemapPixelEditBlocked: boolean
    point: Point
    activeColor: (button?: number) => RgbaColor
    tilemapEditDragState:
      | {
          tilemapEditSelection: SelectionMask
        }
      | {
          tilemapEditSelection?: undefined
        }
  }): boolean {
    const { isoGridSnapActive, snapToIsoGrid, gridSnapActive, inputRef, draw } = ports
    if (session.tool === 'line' && (event.button === 0 || event.button === 2)) {
      if (!canEditLayer || tilemapPixelEditBlocked) return true
      const lineStart = isoGridSnapActive ? snapToIsoGrid(point) : gridSnapActive ? snapPointToGrid(point, session.view.grid ?? DEFAULT_GRID_SETTINGS) : point
      inputRef.current.drag =
        session.lineKind === 'curve'
          ? {
              kind: 'curve-shape',
              start: lineStart,
              last: lineStart,
              color: activeColor(event.button),
              curvePhase: 'endpoint',
              curveAnchorCount: session.curveAnchorCount,
              ...tilemapEditDragState
            }
          : {
              kind: 'line-shape',
              start: lineStart,
              last: lineStart,
              color: activeColor(event.button),
              ...tilemapEditDragState,
              ...(isoGridSnapActive ? { isoAlignedGridVertex: lineStart } : {})
            }
      draw()
      return true
    }
    return false
  }

  function moveShape({ drag, point, session }: { drag: DragState; point: Point; session: DocumentSession }): boolean {
    const { currentSelectionMarqueeModifierState, updateShapePreview, gridSnapActive } = ports
    if (drag.kind === 'shape') {
      const modifiers = currentSelectionMarqueeModifierState()
      drag.constrain = modifiers.proportional
      updateShapePreview(drag, gridSnapActive ? snapPointToGrid(point, session.view.grid ?? DEFAULT_GRID_SETTINGS) : point, modifiers)
      return true
    }
    return false
  }

  function moveFreeform({ drag, point, session }: { drag: DragState; point: Point; session: DocumentSession }): boolean {
    const { gridSnapActive, scheduleDraw } = ports
    if (drag.kind === 'freeform-shape') {
      const shapePoint = gridSnapActive ? snapPointToGrid(point, session.view.grid ?? DEFAULT_GRID_SETTINGS) : point
      appendCanvasPathStep(drag, shapePoint)
      drag.last = shapePoint
      scheduleDraw()
      return true
    }
    return false
  }

  function movePolygonShape({ drag, point, session }: { drag: DragState; point: Point; session: DocumentSession }): boolean {
    const { gridSnapActive, scheduleDraw } = ports
    if (drag.kind === 'polygon-shape') {
      drag.last = gridSnapActive ? snapPointToGrid(point, session.view.grid ?? DEFAULT_GRID_SETTINGS) : point
      scheduleDraw()
      return true
    }
    return false
  }

  function moveLine({ drag, point, event }: { drag: DragState; point: Point; event: React.PointerEvent<HTMLCanvasElement> }): boolean {
    const { resolveStraightLine, scheduleDraw } = ports
    if (drag.kind === 'line-shape') {
      const line = resolveStraightLine(drag.isoAlignedGridVertex ?? drag.start, point, event.shiftKey)
      drag.start = line.from
      drag.last = line.to
      scheduleDraw()
      return true
    }
    return false
  }

  function moveCurve({ drag, point, session }: { drag: DragState; point: Point; session: DocumentSession }): boolean {
    const { gridSnapActive, scheduleDraw } = ports
    if (drag.kind === 'curve-shape') {
      const curvePoint = gridSnapActive ? snapPointToGrid(point, session.view.grid ?? DEFAULT_GRID_SETTINGS) : point
      if (drag.curvePhase === 'endpoint') drag.last = curvePoint
      else {
        const anchorIndex = drag.curveAnchorIndex ?? 0
        const controls = drag.curveControls ?? []
        for (let index = anchorIndex; index < controls.length; index += 1) controls[index] = curvePoint
        drag.curveControls = controls
      }
      drag.last = curvePoint
      scheduleDraw()
      return true
    }
    return false
  }

  function endShape({ drag, session, state }: { drag: DragState; session: DocumentSession; state: ReturnType<typeof useWorkspace.getState> }): boolean {
    const { freeTileSourceEditForDrag, paintSelectionForDrag, symmetryCenter, shapeCornerRadius, t, commitFreeTileSourceDrag } = ports
    if (drag.kind === 'shape') {
      const sourceEdit = freeTileSourceEditForDrag(drag)
      const layer = sourceEdit?.layer ?? activePaintLayer(session)
      const document = sourceEdit?.document ?? session.document
      if (!isLayerEffectivelyLocked(document, layer)) {
        const edit = beginPixelEdit(layer.id)
        const bounds = drag.previewTarget ?? shapeBounds(drag.start, drag.last, drag.constrain, session.shapeRatio)
        const localBounds = sourceEdit ? { ...bounds, x: bounds.x - drag.freeTileEditOrigin!.x, y: bounds.y - drag.freeTileEditOrigin!.y } : bounds
        paintShape(
          document,
          layer,
          edit,
          localBounds,
          session.shapeKind,
          drag.color ?? session.primaryColor,
          sourceEdit ? (drag.freeTileEditSelection ?? null) : paintSelectionForDrag(drag),
          sourceEdit ? undefined : session.symmetryAxes,
          sourceEdit ? undefined : symmetryCenter,
          drag.previewAngle ?? 0,
          shapeCornerRadius,
          session.brushSize
        )
        const ellipse = session.shapeKind === 'ellipse' || session.shapeKind === 'ellipse-outline'
        const label = ellipse ? t('canvas.history.drawEllipse') : t('canvas.history.drawRectangle')
        if (sourceEdit) commitFreeTileSourceDrag(drag, label)
        else state.commitPixelEdit(edit, label)
      }
    }
    return false
  }

  function endFreeform({ drag, session }: { drag: DragState; session: DocumentSession }): boolean {
    const { commitShapePoints, t } = ports
    if (drag.kind === 'freeform-shape') commitShapePoints(drag, filledShapePathPixelPoints(session.document, drag.path ?? []), t('canvas.history.drawFreeform'))
    return false
  }

  function endLine({ drag }: { drag: DragState }): boolean {
    const { commitBrushPath, lineShapeBrushPoints, t } = ports
    if (drag.kind === 'line-shape') commitBrushPath(drag, lineShapeBrushPoints(drag), t('canvas.history.drawLine'))
    return false
  }

  function endCurve({ drag, session }: { drag: DragState; session: DocumentSession }): boolean {
    const { inputRef, scheduleDraw, commitBrushPath, curveShapePixelPoints, t } = ports
    if (drag.kind === 'curve-shape') {
      if (drag.curvePhase === 'endpoint') {
        drag.curveEnd = drag.last
        drag.curveControls = Array.from({ length: drag.curveAnchorCount ?? session.curveAnchorCount }, () => ({ ...drag.curveEnd! }))
        drag.curveAnchorIndex = 0
        drag.curvePhase = 'anchors'
        inputRef.current.drag = drag
        scheduleDraw()
        return true
      }
      const nextAnchorIndex = (drag.curveAnchorIndex ?? 0) + 1
      if (nextAnchorIndex < (drag.curveControls?.length ?? 0)) {
        drag.curveAnchorIndex = nextAnchorIndex
        inputRef.current.drag = drag
        scheduleDraw()
        return true
      }
      commitBrushPath(drag, curveShapePixelPoints(drag), t('canvas.history.drawCurve'))
    }
    return false
  }
  return {
    extendPolygonShape,
    extendCurve,
    beginShape,
    beginLine,
    moveShape,
    moveFreeform,
    movePolygonShape,
    moveLine,
    moveCurve,
    endShape,
    endFreeform,
    endLine,
    endCurve
  }
}
