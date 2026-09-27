import { createCanvasPivotInput } from './canvas-pivot-input'
import { canvasCenteredDragFields, drawingAnchorPoint } from '@/core/canvas-centered-drawing'
import type { SelectionMask, SelectionMode } from '@shared/types-selection'
import { useWorkspace, type DocumentSession } from '@/store/workspace'
import { activePaintLayer } from '@/store/workspace-session'
import { startCanvasSelection } from '@/components/layer-panel-reveal'
import { cloneSelection, combineSelection, selectionMaskFromVisitedPixels } from '@/core/selection'
import { moveSelectionBrush } from './canvas-selection-brush-gesture'
import { CanvasInputState } from '@/core/canvas-input-controller'
import { appendCanvasPathStep, marqueeSelectionCommit, shouldClosePolygonLasso } from '@/core/canvas-input-path'
import { constrainedTranslation, selectionMovePointerDelta } from '@/core/canvas-input-resize'
import { selectionGestureMoved } from '@/core/canvas-input-preview'
import { type CanvasDragState as DragState, type CanvasPoint as Point } from '@/core/canvas-input-contracts'
import { type SelectionHit } from '@/core/canvas-input-state'
import { canvasCursors, selectionCreationCursor } from '@/core/canvas-visuals'
import { symmetrySelection, symmetrySelectionDragDelta } from '@/core/symmetry'
import { activeTilemapCelTarget } from '@/core/tilemap-document'
import { repeatedLassoSelection } from '@/core/repeated-selection'

interface Ports {
  selectionHit: (event: React.PointerEvent<HTMLCanvasElement>) => SelectionHit
  updateCursor: (event: React.PointerEvent<HTMLCanvasElement>) => void
  selectionPivotHitAt: (clientX: number, clientY: number) => boolean
  selectionPivotForSession: (currentSession: DocumentSession) => Point | null
  localContinuousPointAt: (clientX: number, clientY: number) => Point | null
  inputRef: import('react').RefObject<CanvasInputState>
  commitPolygonLasso: () => void
  scheduleDraw: () => void
  liveViewRef: import('react').RefObject<import('@shared/types-view').ViewState>
  repeatedDocumentPointsAt: (
    clientX: number,
    clientY: number,
    continuous?: boolean,
    allowOutsideCopies?: boolean
  ) => {
    local: Point
    repeated: Point
    offset: {
      x: number
      y: number
    }
  } | null
  selectionCrosshair: boolean
  useLocalCursors?: boolean
  selectionInteractionEditable: boolean
  currentSelectionMarqueeModifierState: () => {
    fromCenter: boolean
    proportional: boolean
    rotate: boolean
  }
  updateMarqueePreview: (
    drag: DragState,
    point: Point,
    modifiers: ReturnType<
      (event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>) => {
        fromCenter: boolean
        proportional: boolean
        rotate: boolean
      }
    >,
    finalize?: boolean
  ) => void
  symmetryCenter: import('@/core/symmetry').SymmetryCenter
  modifierActive: (event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>, id: import('@/core/shortcuts').ShortcutId) => boolean
  alignedDragTranslation: (drag: DragState, distance: Point) => Point
  scheduleSelectionPreview: (drag: DragState, immediate?: boolean) => void
  draw: () => void
  t: (key: import('@/locales/contracts').TranslationKey, params?: import('@/locales/contracts').TranslationParams) => string
  tilemapPaintSelectionForIncoming: (incoming: SelectionMask | null, current?: DocumentSession) => SelectionMask | null
  optimizedRotationEnabled: boolean
}

export function createSelectionCanvasInput(ports: Ports) {
  const { beginPivot, movePivot, endPivot } = createCanvasPivotInput(ports)
  function routeFreeTransform({ freeTransformActive, event }: { freeTransformActive: boolean; event: React.PointerEvent<HTMLCanvasElement> }): boolean {
    const { selectionHit, updateCursor } = ports
    if (freeTransformActive) {
      const freeTransformHit = event.button === 0 ? selectionHit(event) : 'outside'
      const freeTransformCorner = freeTransformHit === 'nw' || freeTransformHit === 'ne' || freeTransformHit === 'se' || freeTransformHit === 'sw'
      const freeTransformContent = freeTransformHit === 'inside'
      if (!(event.button === 0 && (freeTransformCorner || freeTransformContent))) {
        updateCursor(event)
        event.preventDefault()
        return true
      }
    }
    return false
  }

  function extendPolygonLasso({
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
    const { commitPolygonLasso, scheduleDraw } = ports
    if (session.tool === 'selection' && activePolygon?.kind === 'polygon-lasso' && (event.button === 0 || event.button === 2)) {
      const path = activePolygon.path ?? []
      if (shouldClosePolygonLasso(path, point, event.detail)) {
        commitPolygonLasso()
        return true
      }
      appendCanvasPathStep(activePolygon, point)
      activePolygon.last = point
      scheduleDraw()
      return true
    }
    return false
  }

  function beginMarquee({
    session,
    event,
    selectionMode,
    point,
    state
  }: {
    session: DocumentSession
    event: React.PointerEvent<HTMLCanvasElement>
    selectionMode: () => SelectionMode
    point: Point
    state: ReturnType<typeof useWorkspace.getState>
  }): boolean {
    const { liveViewRef, repeatedDocumentPointsAt, inputRef, selectionCrosshair, selectionInteractionEditable } = ports
    if (
      session.tool === 'selection' &&
      (session.selectionKind === 'rectangle' || session.selectionKind === 'ellipse') &&
      (event.button === 0 || event.button === 2)
    ) {
      const mode = selectionMode()
      const repeatMode = liveViewRef.current.tileRepeatMode ?? 'off'
      const repeatedStart = repeatMode === 'off' ? point : (repeatedDocumentPointsAt(event.clientX, event.clientY, false, true)?.repeated ?? point)
      state.clearAnimationSelection(true)
      startCanvasSelection(session.document.id)
      inputRef.current.drag = {
        kind: 'marquee',
        start: repeatedStart,
        last: repeatedStart,
        startClient: { x: event.clientX, y: event.clientY },
        selectionStart: cloneSelection(session.selection),
        selectionMode: mode,
        constrain: false,
        tileRepeatPoint: repeatedStart,
        ...canvasCenteredDragFields(session.drawFromCanvasCenter, session.document, repeatedStart, false, null, drawingAnchorPoint(session))
      }
      ports.updateMarqueePreview(inputRef.current.drag, repeatedStart, ports.currentSelectionMarqueeModifierState())
      event.currentTarget.style.cursor = selectionCreationCursor(selectionCrosshair, selectionInteractionEditable, true, ports.useLocalCursors)
      return true
    }
    return false
  }

  function moveMarquee({
    drag,
    event,
    repeatedMarquee,
    point
  }: {
    drag: DragState
    event: React.PointerEvent<HTMLCanvasElement>
    repeatedMarquee: boolean
    point: Point
  }): boolean {
    const { scheduleDraw, currentSelectionMarqueeModifierState, repeatedDocumentPointsAt, updateMarqueePreview } = ports
    if (drag.kind === 'marquee') {
      drag.moved = drag.moved || selectionGestureMoved(drag.startClient, { x: event.clientX, y: event.clientY })
      if (!drag.moved) {
        scheduleDraw()
        return true
      }
      const modifiers = currentSelectionMarqueeModifierState()
      drag.constrain = modifiers.proportional
      const marqueePoint = repeatedMarquee ? (repeatedDocumentPointsAt(event.clientX, event.clientY, false, true)?.repeated ?? point) : point
      drag.tileRepeatPoint = marqueePoint
      updateMarqueePreview(drag, marqueePoint, modifiers)
      return true
    }
    return false
  }

  function moveMagic({ drag, point, previousPoint }: { drag: DragState; point: Point; previousPoint: Point }): boolean {
    const {} = ports
    if (drag.kind === 'magic-preview') {
      if (point.x !== previousPoint.x || point.y !== previousPoint.y) drag.magicRequest?.(point)
      return true
    }
    return false
  }

  function moveLasso({ drag, event, point }: { drag: DragState; event: React.PointerEvent<HTMLCanvasElement>; point: Point }): boolean {
    const { scheduleDraw, repeatedDocumentPointsAt } = ports
    if (drag.kind === 'lasso') {
      const lassoPoint = drag.tileRepeatStart
        ? (repeatedDocumentPointsAt(event.clientX, event.clientY, false, true)?.repeated ?? point)
        : point
      appendCanvasPathStep(drag, lassoPoint)
      scheduleDraw()
      return true
    }
    return false
  }

  function moveBrush({ drag, session, point, event }: { drag: DragState; session: DocumentSession; point: Point; event: React.PointerEvent<HTMLCanvasElement> }): boolean {
    const { optimizedRotationEnabled, scheduleDraw, liveViewRef, repeatedDocumentPointsAt } = ports
    const repeatMode = liveViewRef.current.tileRepeatMode ?? 'off'
    const brushPoint = repeatMode === 'off' ? point : (repeatedDocumentPointsAt(event.clientX, event.clientY, false, true)?.repeated ?? drag.last)
    if (!moveSelectionBrush(drag, session, brushPoint, optimizedRotationEnabled, repeatMode)) return false
    scheduleDraw()
    return true
  }

  function movePolygonLasso({ drag }: { drag: DragState }): boolean {
    const { scheduleDraw } = ports
    if (drag.kind === 'polygon-lasso') {
      scheduleDraw()
      return true
    }
    return false
  }

  function moveSelection({
    drag,
    event,
    point,
    session
  }: {
    drag: DragState
    event: React.PointerEvent<HTMLCanvasElement>
    point: Point
    session: DocumentSession
  }): boolean {
    const { repeatedDocumentPointsAt, symmetryCenter, modifierActive, alignedDragTranslation, scheduleSelectionPreview } = ports
    if (drag.kind === 'move-selection' && drag.selectionStart) {
      const start = drag.selectionStart
      const repeatedPoint = drag.tileRepeatStart ? repeatedDocumentPointsAt(event.clientX, event.clientY, true, true)?.repeated : undefined
      const pointerDelta = selectionMovePointerDelta(drag, point, repeatedPoint)
      const dragDelta = symmetrySelectionDragDelta(
        start,
        drag.start,
        pointerDelta,
        session.document.width,
        session.document.height,
        session.symmetryAxes,
        symmetryCenter,
        true
      )
      let distance = constrainedTranslation(drag, dragDelta.x, dragDelta.y, modifierActive(event.nativeEvent, 'constrainAxis'))
      const tilemapTarget = activePaintLayer(session).kind === 'tilemap' && session.tilemapMode === 'paint' ? activeTilemapCelTarget(session.document) : null
      if (tilemapTarget)
        distance = {
          x: Math.round(distance.x / tilemapTarget.tilemap.tileWidth) * tilemapTarget.tilemap.tileWidth,
          y: Math.round(distance.y / tilemapTarget.tilemap.tileHeight) * tilemapTarget.tilemap.tileHeight
        }
      else distance = alignedDragTranslation(drag, distance)
      const target = { ...start, x: start.x + distance.x, y: start.y + distance.y }
      if (drag.previewTarget?.x === target.x && drag.previewTarget.y === target.y) return true
      drag.previewTarget = target
      drag.previewAngle = 0
      if (drag.selectionPivotStart) drag.previewPivot = { x: drag.selectionPivotStart.x + distance.x, y: drag.selectionPivotStart.y + distance.y }
      scheduleSelectionPreview(drag)
      return true
    }
    return false
  }

  function endMarquee({
    drag,
    event,
    session,
    state
  }: {
    drag: DragState
    event: React.PointerEvent<HTMLCanvasElement>
    session: DocumentSession
    state: ReturnType<typeof useWorkspace.getState>
  }): boolean {
    const { t, updateCursor, scheduleDraw } = ports
    if (drag.kind === 'marquee') {
      const moved = drag.moved || selectionGestureMoved(drag.startClient, { x: event.clientX, y: event.clientY })
      if (moved && !drag.quickSelectCell) ports.updateMarqueePreview(drag, drag.last, ports.currentSelectionMarqueeModifierState(), true)
      const change = marqueeSelectionCommit(drag, session.selection, moved, session.selectionMode)
      if (session.temporaryBrushCapture) {
        if (change.after) state.finishTemporaryBrushCapture(change.after)
        updateCursor(event)
        scheduleDraw()
        return true
      }
      state.commitSelectionChange(change.before, change.after, t('canvas.history.createSelection'))
      updateCursor(event)
      scheduleDraw()
    }
    return false
  }

  function endLasso({ drag, session, state }: { drag: DragState; session: DocumentSession; state: ReturnType<typeof useWorkspace.getState> }): boolean {
    const { tilemapPaintSelectionForIncoming, symmetryCenter, liveViewRef, t } = ports
    if (drag.kind === 'lasso') {
      const mode = drag.selectionMode ?? session.selectionMode
      const before = drag.selectionStart ?? null
      const path = drag.path ?? []
      const repeatMode = liveViewRef.current.tileRepeatMode ?? 'off'
      const incomingSelection = repeatedLassoSelection(session.document, path, repeatMode)
      const incoming = tilemapPaintSelectionForIncoming(
        symmetrySelection(
          incomingSelection,
          session.document.width,
          session.document.height,
          session.symmetryAxes,
          symmetryCenter
        )
      )
      const after = combineSelection(before, incoming, mode)
      state.commitSelectionChange(before, after, t('canvas.history.lassoSelection'))
    }
    return false
  }

  function endBrush({ drag, session, state }: { drag: DragState; session: DocumentSession; state: ReturnType<typeof useWorkspace.getState> }): boolean {
    const { tilemapPaintSelectionForIncoming, symmetryCenter, t } = ports
    if (drag.kind === 'selection-brush') {
      const incoming = tilemapPaintSelectionForIncoming(
        symmetrySelection(selectionMaskFromVisitedPixels(drag.selectionBrushStroke?.visited ?? new Set(), session.document.width), session.document.width, session.document.height, session.symmetryAxes, symmetryCenter)
      )
      const before = drag.selectionStart ?? null
      const after = combineSelection(before, incoming, drag.selectionMode ?? session.selectionMode)
      state.commitSelectionChange(before, after, t('canvas.history.createSelection'))
      return true
    }
    return false
  }

  function endMagic({ drag }: { drag: DragState }): boolean {
    const {} = ports
    if (drag.kind === 'magic-preview') drag.magicRelease?.()
    return false
  }

  function endSelectionMove({ drag, state }: { drag: DragState; state: ReturnType<typeof useWorkspace.getState> }): boolean {
    const { t } = ports
    if (drag.kind === 'move-selection' && drag.selectionStart && drag.previewSelection) {
      if (drag.floatingPasteSelectionBox)
        state.commitFloatingSelectionBoxMove(drag.selectionStart, drag.previewSelection, drag.selectionPivotStart ?? null, drag.previewPivot ?? null)
      else {
        state.commitSelectionChange(drag.selectionStart, drag.previewSelection, t('canvas.history.moveSelectionBox'))
        if (drag.previewPivot) {
        if (drag.drawingAnchorMove) state.setDrawingAnchor(drag.previewPivot)
        else state.setSelectionPivot(drag.previewPivot)
      }
      }
    }
    return false
  }
  return {
    routeFreeTransform,
    beginPivot,
    extendPolygonLasso,
    beginMarquee,
    movePivot,
    moveMarquee,
    moveMagic,
    moveLasso,
    moveBrush,
    movePolygonLasso,
    moveSelection,
    endPivot,
    endMarquee,
    endLasso,
    endBrush,
    endMagic,
    endSelectionMove
  }
}
