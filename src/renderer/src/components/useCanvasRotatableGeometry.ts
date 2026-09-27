import { centerBoundsOnCanvas } from '@/core/canvas-centered-drawing'
import { viewAlignedShapeAngle, viewAlignedShapeBounds } from '@/core/canvas-input-view-shape'
import type { SelectionMask, SelectionRect } from '@shared/types-selection'
import { DEFAULT_GRID_SETTINGS, snapSelectionBoundsToGrid } from '@/core/grid'
import { type DocumentSession } from '@/store/workspace'
import { combineSelection, rectSelection, rotatedEllipseSelection, rotatedRectSelection } from '@/core/selection'
import {
  CanvasInputState,
  centerMarqueeBoundsAtCreationPoint,
  createMarqueeResizeStart,
  quickSelectCellDragBounds,
  resizeRotatedMarqueeBounds,
  resolveMarqueeModifierMode,
  selectionRotationAngle,
  temporaryTransformOffset,
  translatedSelectionRect,
  type CanvasDragState as DragState,
  type CanvasPoint as Point
} from '@/core/canvas-input'
import { symmetrySelection } from '@/core/symmetry'
import { normalizeSelectionForTileRepeatPreview, wrapSelectionMaskForTileRepeat } from '@/core/tilemap'
interface Ports {
  readonly selectionMarqueeModifierState: (event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>) => {
    fromCenter: boolean
    proportional: boolean
    rotate: boolean
  }
  readonly inputRef: import('react').RefObject<CanvasInputState>
  readonly session: DocumentSession
  readonly alignmentPreferences: {
    gridAlignmentEnabled: boolean
    smartAlignmentEnabled: boolean
    alignmentGuidesVisible: boolean
    alignmentThreshold: number
  }
  readonly quickSelectionCellAt: (active: DocumentSession, point: Point) => SelectionRect | null
  readonly tilemapPaintSelectionForIncoming: (incoming: SelectionMask | null, current?: DocumentSession) => SelectionMask | null
  readonly scheduleDraw: () => void
  readonly liveViewRef: import('react').RefObject<import('@shared/types-view').ViewState>
  readonly selectionCornerRadius: number
  readonly symmetryCenter: import('@/core/symmetry').SymmetryCenter
}

export function useCanvasRotatableGeometry(ports: Ports) {
  const updateRotatableDragGeometry = (
    drag: DragState,
    point: Point,
    modifiers: ReturnType<typeof ports.selectionMarqueeModifierState>
  ): { target: SelectionRect; angle: number } | null => {
    if (drag.kind !== 'marquee' && drag.kind !== 'shape') return null
    const fixedCenter = drag.canvasCenterSize
    const fromCenter = Boolean(fixedCenter) || modifiers.fromCenter
    if (fixedCenter) drag.transformOffset = { x: 0, y: 0 }
    if (!fixedCenter && ports.inputRef.current.spaceHeld && drag.transformMoveStart) drag.transformOffset = temporaryTransformOffset(drag.transformMoveStart, point)
    const offset = drag.transformOffset ?? { x: 0, y: 0 }
    const adjustedPoint = { x: point.x - offset.x, y: point.y - offset.y }
    const fixedRatio = drag.kind === 'shape' ? ports.session.shapeRatio : null
    const viewAngle = drag.marqueeViewAngle ??= viewAlignedShapeAngle(ports.liveViewRef.current)
    const creation = viewAlignedShapeBounds(drag.start, adjustedPoint, viewAngle, fromCenter, modifiers.proportional, fixedRatio)
    let bounds = drag.marqueeBounds ?? creation.bounds
    let angle = drag.marqueeAngle ?? viewAngle
    const modifierMode = resolveMarqueeModifierMode(modifiers, drag.marqueeModifierMode)
    const rotating = modifierMode === 'rotate'

    if (!rotating && drag.marqueeRotationStart) {
      const rotationBounds = drag.marqueeBounds ?? drag.marqueeRotationStart.bounds
      const resizeBounds = fromCenter ? centerMarqueeBoundsAtCreationPoint(rotationBounds, drag.start) : rotationBounds
      drag.marqueeBounds = resizeBounds
      drag.marqueeResizeStart = createMarqueeResizeStart(resizeBounds, drag.marqueeRotationStart.lastPointer)
      drag.marqueeRotationStart = undefined
    }

    if (rotating) {
      if (!drag.marqueeRotationStart) drag.marqueeRotationStart = { pointer: adjustedPoint, lastPointer: adjustedPoint, angle, bounds: { ...bounds } }
      const rotationStart = drag.marqueeRotationStart
      bounds = rotationStart.bounds
      angle = rotationStart.angle + selectionRotationAngle(bounds, rotationStart.pointer, adjustedPoint)
      rotationStart.lastPointer = { ...adjustedPoint }
      drag.marqueeAngle = angle
    } else if (drag.marqueeResizeStart) {
      bounds = resizeRotatedMarqueeBounds(
        drag.marqueeResizeStart.bounds,
        { x: adjustedPoint.x - drag.marqueeResizeStart.pointer.x, y: adjustedPoint.y - drag.marqueeResizeStart.pointer.y },
        angle,
        drag.marqueeDirection ?? { x: 1, y: 1 },
        drag.marqueeResizeStart.fromCenter || fromCenter,
        modifiers.proportional,
        fixedRatio
      )
      drag.marqueeBounds = bounds
    } else {
      bounds = creation.bounds
      drag.marqueeBounds = bounds
      drag.marqueeDirection = creation.direction
    }

    const snappedBounds =
      drag.kind === 'marquee' && angle === 0 && ports.alignmentPreferences.gridAlignmentEnabled && ports.session.view.showGrid
        ? snapSelectionBoundsToGrid(bounds, ports.session.view.grid ?? DEFAULT_GRID_SETTINGS)
        : bounds
    const centeredBounds = fixedCenter ? centerBoundsOnCanvas(snappedBounds, fixedCenter, drag.drawingAnchor) : snappedBounds
    if (angle === 0 || fixedCenter) drag.marqueeBounds = centeredBounds
    const target = translatedSelectionRect(centeredBounds, offset)
    drag.previewTarget = target
    drag.previewAngle = angle
    return { target, angle }
  }

  const updateMarqueePreview = (drag: DragState, point: Point, modifiers: ReturnType<typeof ports.selectionMarqueeModifierState>, finalize = false): void => {
    if (drag.kind !== 'marquee') return
    if (drag.quickSelectCell) {
      const currentCell = ports.quickSelectionCellAt(ports.session, point)
      if (!currentCell) return
      const target = quickSelectCellDragBounds(drag.quickSelectCell, currentCell)
      const incoming = ports.tilemapPaintSelectionForIncoming(rectSelection(target.x, target.y, target.width, target.height))
      drag.last = point
      drag.marqueeBounds = target
      drag.previewTarget = target
      drag.marqueePreviewSelection = incoming
      drag.marqueeDisplaySelection = incoming
      drag.previewSelection = combineSelection(
        drag.selectionCommitStart ?? drag.selectionStart ?? null,
        incoming,
        drag.selectionMode ?? ports.session.selectionMode
      )
      ports.scheduleDraw()
      return
    }
    const geometry = finalize && drag.previewTarget
      ? { target: drag.previewTarget, angle: drag.previewAngle ?? 0 }
      : updateRotatableDragGeometry(drag, point, modifiers)
    if (!geometry) return
    const { target, angle } = geometry
    const repeatMode = ports.liveViewRef.current.tileRepeatMode ?? 'off'
    if (!finalize && repeatMode === 'off') {
      ports.scheduleDraw()
      return
    }
    const repeatedSelection =
      ports.session.selectionKind === 'ellipse'
        ? rotatedEllipseSelection(target, ports.session.document.width, ports.session.document.height, angle, repeatMode === 'off')
        : rotatedRectSelection(target, ports.session.document.width, ports.session.document.height, angle, repeatMode === 'off', ports.selectionCornerRadius)
    const transformed =
      repeatMode === 'off'
        ? repeatedSelection
        : wrapSelectionMaskForTileRepeat(repeatedSelection, ports.session.document.width, ports.session.document.height, repeatMode)
    const incoming = ports.tilemapPaintSelectionForIncoming(
      transformed
        ? symmetrySelection(transformed, ports.session.document.width, ports.session.document.height, ports.session.symmetryAxes, ports.symmetryCenter)
        : null
    )
    drag.marqueePreviewSelection = incoming
    drag.marqueeDisplaySelection =
      repeatMode === 'off'
        ? incoming
        : normalizeSelectionForTileRepeatPreview(repeatedSelection, ports.session.document.width, ports.session.document.height, repeatMode)
    drag.previewSelection = combineSelection(drag.selectionStart ?? null, incoming, drag.selectionMode ?? ports.session.selectionMode)
    ports.scheduleDraw()
  }

  const updateShapePreview = (drag: DragState, point: Point, modifiers: ReturnType<typeof ports.selectionMarqueeModifierState>): void => {
    if (drag.kind !== 'shape') return
    updateRotatableDragGeometry(drag, point, modifiers)
    ports.scheduleDraw()
  }
  return { updateMarqueePreview, updateShapePreview }
}
