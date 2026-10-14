import type { SelectionMask } from '@shared/types-selection'
import { isLayerEffectivelyLocked } from '@/core/document-model'
import { beginPixelEdit } from '@/core/history'
import { bezierCurvePixelPoints, filledPolygonPathPixelPoints, lineShapePixelPoints, paintShapePixelPoints, perfectPixelPathPoints } from '@/core/tools-shapes'
import { paintBrushPath } from '@/core/tools-brush'
import { useWorkspace, type DocumentSession } from '@/store/workspace'
import { activePaintLayer } from '@/store/workspace-session'
import { combineSelection, polygonSelection } from '@/core/selection'
import { CanvasInputState, type CanvasDragState as DragState, type CanvasPoint as Point } from '@/core/canvas-input'
import { symmetrySelection } from '@/core/symmetry'
import { type FreeTileSourceEditRaster } from '@/core/free-tile-edit'
import { brushAngleWithDynamics } from './canvas-stage-helpers'
interface Ports {
  readonly inputRef: import('react').RefObject<CanvasInputState>
  readonly tilemapPaintSelectionForIncoming: (incoming: SelectionMask | null, current?: DocumentSession) => SelectionMask | null
  readonly session: DocumentSession
  readonly balancedShiftLineEnabled: boolean
  readonly symmetryCenter: import('@/core/symmetry').SymmetryCenter
  readonly t: (key: import('@/locales/contracts').TranslationKey, params?: import('@/locales/contracts').TranslationParams) => string
  readonly scheduleDraw: () => void
  readonly freeTileSourceEditForDrag: (drag: DragState) => FreeTileSourceEditRaster | null
  readonly freeTileLocalPoint: (drag: DragState, point: Point) => Point
  readonly paintSelectionForDrag: (drag: DragState) => SelectionMask | null
  readonly commitFreeTileSourceDrag: (drag: DragState, label: string) => boolean
  readonly activeBrushTexture: import('@shared/types-brush').BrushTexture
  readonly activeBrushImage: import('@shared/types-brush').ImageBrush | null
  readonly proceduralAntialiasStrength: number
  readonly activeBrushPaintMode: import('@shared/types-brush').BrushPaintMode
  readonly brushPatternOrigin: (point: Point, size?: number, imageBrush?: import('@shared/types-brush').ImageBrush | null) => Point
  readonly activeBrushDither: import('@shared/types-brush').BrushDitherSettings | undefined
  readonly optimizedRotationEnabled: boolean
  readonly balancedStraightLines: boolean
}

export function useCanvasShapeCommit(ports: Ports) {
  const commitPolygonLasso = (): void => {
    const drag = ports.inputRef.current.drag
    if (drag?.kind !== 'polygon-lasso') return
    ports.inputRef.current.finish()
    const before = drag.selectionStart ?? null
    const incoming = ports.tilemapPaintSelectionForIncoming(
      symmetrySelection(
        polygonSelection(ports.session.document, drag.path ?? [], ports.balancedShiftLineEnabled),
        ports.session.document.width,
        ports.session.document.height,
        ports.session.symmetryAxes,
        ports.symmetryCenter
      )
    )
    const after = combineSelection(before, incoming, drag.selectionMode ?? ports.session.selectionMode)
    useWorkspace.getState().commitSelectionChange(before, after, ports.t('canvas.history.polygonLasso'))
    ports.scheduleDraw()
  }

  const commitShapePoints = (drag: DragState, points: readonly Point[], label: string): void => {
    const sourceEdit = ports.freeTileSourceEditForDrag(drag)
    const document = sourceEdit?.document ?? ports.session.document
    const layer = sourceEdit?.layer ?? activePaintLayer(ports.session)
    if (isLayerEffectivelyLocked(sourceEdit ? ports.session.document : document, layer)) return
    const edit = beginPixelEdit(layer.id)
    const localPoints = sourceEdit ? points.map((point) => ports.freeTileLocalPoint(drag, point)) : points
    paintShapePixelPoints(
      document,
      layer,
      edit,
      localPoints,
      drag.color ?? ports.session.primaryColor,
      sourceEdit ? (drag.freeTileEditSelection ?? null) : ports.paintSelectionForDrag(drag),
      sourceEdit ? undefined : ports.session.symmetryAxes,
      sourceEdit ? undefined : ports.symmetryCenter
    )
    if (sourceEdit) ports.commitFreeTileSourceDrag(drag, label)
    else useWorkspace.getState().commitPixelEdit(edit, label)
  }

  const commitBrushPath = (drag: DragState, points: readonly Point[], label: string): void => {
    const sourceEdit = ports.freeTileSourceEditForDrag(drag)
    const document = sourceEdit?.document ?? ports.session.document
    const layer = sourceEdit?.layer ?? activePaintLayer(ports.session)
    if (isLayerEffectivelyLocked(sourceEdit ? ports.session.document : document, layer) || points.length === 0) return
    const edit = beginPixelEdit(layer.id)
    const localPoints = sourceEdit ? points.map((point) => ports.freeTileLocalPoint(drag, point)) : points
    paintBrushPath(
      document,
      layer,
      edit,
      localPoints,
      ports.session.brushSize,
      drag.color ?? ports.session.primaryColor,
      sourceEdit ? (drag.freeTileEditSelection ?? null) : ports.paintSelectionForDrag(drag),
      ports.session.brushShape,
      ports.activeBrushTexture,
      ports.session.brushTextureScale,
      ports.activeBrushImage,
      ports.session.brushImageSettings,
      ports.proceduralAntialiasStrength,
      ports.activeBrushPaintMode,
      ports.brushPatternOrigin(localPoints[0]),
      sourceEdit ? undefined : ports.session.symmetryAxes,
      sourceEdit ? undefined : ports.symmetryCenter,
      sourceEdit ? 'off' : (ports.session.view.tileRepeatMode ?? 'off'),
      ports.activeBrushDither,
      ports.optimizedRotationEnabled,
      brushAngleWithDynamics(ports.session),
      ports.session.inkMode
    )
    if (sourceEdit) ports.commitFreeTileSourceDrag(drag, label)
    else useWorkspace.getState().commitPixelEdit(edit, label)
  }

  const commitPolygonShape = (): void => {
    const drag = ports.inputRef.current.drag
    if (drag?.kind !== 'polygon-shape') return
    ports.inputRef.current.finish()
    commitShapePoints(
      drag,
      filledPolygonPathPixelPoints(ports.session.document, drag.path ?? [], ports.balancedShiftLineEnabled),
      ports.t('canvas.history.drawPolygon')
    )
    ports.scheduleDraw()
  }

  const curveDefaultControls = (start: Point, end: Point, count: number): Point[] =>
    Array.from({ length: count }, (_, index) => {
      const amount = (index + 1) / (count + 1)
      return {
        x: Math.round(start.x + (end.x - start.x) * amount),
        y: Math.round(start.y + (end.y - start.y) * amount)
      }
    })

  const curveShapePixelPoints = (drag: DragState): readonly Point[] => {
    const end = drag.curveEnd ?? drag.last
    const points = bezierCurvePixelPoints(
      drag.start,
      drag.curveControls ?? curveDefaultControls(drag.start, end, drag.curveAnchorCount ?? ports.session.curveAnchorCount),
      end
    )
    return ports.session.perfectPixels ? perfectPixelPathPoints(points) : points
  }

  const lineShapeBrushPoints = (drag: DragState): readonly Point[] => {
    const points = lineShapePixelPoints(drag.start, drag.last, ports.balancedStraightLines)
    return ports.session.perfectPixels ? perfectPixelPathPoints(points) : points
  }

  const commitCurveShape = (): void => {
    const drag = ports.inputRef.current.drag
    if (drag?.kind !== 'curve-shape' || !drag.curveEnd) return
    ports.inputRef.current.finish()
    commitBrushPath(drag, curveShapePixelPoints(drag), ports.t('canvas.history.drawCurve'))
    ports.scheduleDraw()
  }
  return {
    commitPolygonLasso,
    commitShapePoints,
    commitBrushPath,
    commitPolygonShape,
    curveDefaultControls,
    curveShapePixelPoints,
    lineShapeBrushPoints,
    commitCurveShape
  }
}
