import type { SelectionQuad, SelectionRect } from '@shared/types-selection'
import { applySelectionTransform, applySelectionTranslationCommit } from '@/core/tools-selection-transform'
import { useWorkspace, type DocumentSession } from '@/store/workspace'
import { activePaintLayer } from '@/store/workspace-session'
import {
  rotateSelectionTargetAroundPivot,
  selectionQuadBounds,
  shearTransformedSelection,
  transformedSelectionPivotPreset,
  transformedSelectionShearDirection
} from '@/core/selection'
import { constrainedTranslation, selectionMovePointerDelta, selectionRotationAngle, snapSelectionRotation } from '@/core/canvas-input-resize'
import {
  deferredSelectionCommitInvalidationRects,
  deferredSelectionPreviewMaterializationRequired,
  selectionTransformPreviewChanged
} from '@/core/canvas-input-preview'
import { type CanvasDragState as DragState, type CanvasPoint as Point } from '@/core/canvas-input-contracts'
import { symmetrySelectionDragDelta } from '@/core/symmetry'

interface Ports {
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
  symmetryCenter: import('@/core/symmetry').SymmetryCenter
  alignedDragTranslation: (drag: DragState, distance: Point) => Point
  modifierActive: (event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>, id: import('@/core/shortcuts').ShortcutId) => boolean
  prepareSelectionTransformDrag: (drag: DragState) => boolean
  scheduleSelectionPreview: (drag: DragState, immediate?: boolean) => void
  updateFreeTransformPreview: (drag: DragState, point: Point) => void
  updateSelectionTransformPreview: (
    drag: DragState,
    point: Point,
    modifiers: ReturnType<
      (event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>) => {
        proportional: boolean
        integerScale: boolean
        fromCenter: boolean
        copy: false
      }
    >
  ) => void
  selectionTransformModifierState: (event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>) => {
    proportional: boolean
    integerScale: boolean
    fromCenter: boolean
    copy: false
  }
  symmetryStartPointForDrag: (drag: DragState) => Point | undefined
  invalidateCompositeRect: (selection: SelectionRect | null | undefined, layerIds?: readonly string[]) => void
  t: (key: import('@/locales/contracts').TranslationKey, params?: import('@/locales/contracts').TranslationParams) => string
}

export function createTransformCanvasInput(ports: Ports) {
  function moveFreeTransform({
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
    const { repeatedDocumentPointsAt, symmetryCenter, alignedDragTranslation, modifierActive, prepareSelectionTransformDrag, scheduleSelectionPreview } = ports
    if (drag.kind === 'move-content' && drag.freeTransform && drag.selectionStart && drag.transformStartQuad) {
      const repeatedPoint = drag.tileRepeatStart ? repeatedDocumentPointsAt(event.clientX, event.clientY, true, true)?.repeated : undefined
      const pointerDelta = selectionMovePointerDelta(drag, point, repeatedPoint)
      const dragDelta = symmetrySelectionDragDelta(
        drag.selectionStart,
        drag.start,
        pointerDelta,
        session.document.width,
        session.document.height,
        session.symmetryAxes,
        symmetryCenter,
        true
      )
      const distance = alignedDragTranslation(drag, constrainedTranslation(drag, dragDelta.x, dragDelta.y, modifierActive(event.nativeEvent, 'constrainAxis')))
      const nextQuad: SelectionQuad = {
        nw: { x: drag.transformStartQuad.nw.x + distance.x, y: drag.transformStartQuad.nw.y + distance.y },
        ne: { x: drag.transformStartQuad.ne.x + distance.x, y: drag.transformStartQuad.ne.y + distance.y },
        se: { x: drag.transformStartQuad.se.x + distance.x, y: drag.transformStartQuad.se.y + distance.y },
        sw: { x: drag.transformStartQuad.sw.x + distance.x, y: drag.transformStartQuad.sw.y + distance.y }
      }
      const target = selectionQuadBounds(nextQuad)
      const previousQuad = drag.previewQuad ?? drag.transformStartQuad
      if (
        previousQuad.nw.x === nextQuad.nw.x &&
        previousQuad.nw.y === nextQuad.nw.y &&
        previousQuad.ne.x === nextQuad.ne.x &&
        previousQuad.ne.y === nextQuad.ne.y &&
        previousQuad.se.x === nextQuad.se.x &&
        previousQuad.se.y === nextQuad.se.y &&
        previousQuad.sw.x === nextQuad.sw.x &&
        previousQuad.sw.y === nextQuad.sw.y
      )
        return true
      if (!prepareSelectionTransformDrag(drag)) return true
      drag.last = point
      drag.previewTarget = target
      drag.previewQuad = nextQuad
      drag.previewAngle = 0
      drag.previewShear = undefined
      if (drag.selectionPivotStart) drag.previewPivot = { x: drag.selectionPivotStart.x + distance.x, y: drag.selectionPivotStart.y + distance.y }
      scheduleSelectionPreview(drag, true)
      return true
    }
    return false
  }

  function moveContent({
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
    const { repeatedDocumentPointsAt, symmetryCenter, alignedDragTranslation, modifierActive, prepareSelectionTransformDrag, scheduleSelectionPreview } = ports
    if (drag.kind === 'move-content' && drag.selectionStart) {
      const start = drag.transformStartTarget ?? drag.selectionStart
      const repeatedPoint = drag.tileRepeatStart ? repeatedDocumentPointsAt(event.clientX, event.clientY, true, true)?.repeated : undefined
      const pointerDelta = selectionMovePointerDelta(drag, point, repeatedPoint)
      const dragDelta = symmetrySelectionDragDelta(
        drag.selectionStart,
        drag.start,
        pointerDelta,
        session.document.width,
        session.document.height,
        session.symmetryAxes,
        symmetryCenter,
        true
      )
      const distance = alignedDragTranslation(drag, constrainedTranslation(drag, dragDelta.x, dragDelta.y, modifierActive(event.nativeEvent, 'constrainAxis')))
      const target = { ...start, x: start.x + distance.x, y: start.y + distance.y }
      if (drag.previewTarget?.x === target.x && drag.previewTarget.y === target.y) return true
      if (!prepareSelectionTransformDrag(drag)) return true
      drag.previewTarget = target
      drag.previewAngle = drag.startAngle ?? 0
      drag.previewShear = drag.transformStartShear ? { ...drag.transformStartShear } : undefined
      if (drag.selectionPivotStart) drag.previewPivot = { x: drag.selectionPivotStart.x + distance.x, y: drag.selectionPivotStart.y + distance.y }
      scheduleSelectionPreview(drag, drag.freeTileSelectionTransform === true)
      return true
    }
    return false
  }

  function resizeFreeTransform({ drag, point }: { drag: DragState; point: Point }): boolean {
    const { updateFreeTransformPreview } = ports
    if (drag.kind === 'transform-content' && drag.freeTransform && drag.selectionStart && drag.handle) {
      updateFreeTransformPreview(drag, point)
      return true
    }
    return false
  }

  function resizeContent({ drag, point, event }: { drag: DragState; point: Point; event: React.PointerEvent<HTMLCanvasElement> }): boolean {
    const { updateSelectionTransformPreview, selectionTransformModifierState } = ports
    if (drag.kind === 'transform-content' && drag.selectionStart && drag.handle) {
      updateSelectionTransformPreview(drag, point, selectionTransformModifierState(event.nativeEvent))
      return true
    }
    return false
  }

  function shearContent({ drag, point }: { drag: DragState; point: Point }): boolean {
    const { prepareSelectionTransformDrag, scheduleSelectionPreview } = ports
    if (drag.kind === 'shear-content' && drag.selectionStart && drag.shearHandle) {
      const edge = drag.shearHandle.slice(-1) as 'n' | 'e' | 's' | 'w'
      const angle = drag.startAngle ?? 0
      const direction = transformedSelectionShearDirection(drag.transformStartTarget ?? drag.selectionStart, angle, drag.transformStartShear, edge)
      if (!direction) return true
      const deltaX = point.x - drag.start.x
      const deltaY = point.y - drag.start.y
      const localDelta = deltaX * direction.x + deltaY * direction.y
      const amount = Math.round(localDelta)
      if (drag.shearAmount === amount) return true
      if (!prepareSelectionTransformDrag(drag)) return true
      const transformed = shearTransformedSelection(
        drag.transformStartTarget ?? drag.selectionStart,
        angle,
        drag.transformStartShear,
        edge,
        amount,
        drag.selectionPivotStart
      )
      drag.shearAmount = amount
      drag.previewTarget = transformed.target
      drag.previewAngle = transformed.angle
      drag.previewShear = transformed.shear
      scheduleSelectionPreview(drag)
      return true
    }
    return false
  }

  function rotateContent({ drag, point, event }: { drag: DragState; point: Point; event: React.PointerEvent<HTMLCanvasElement> }): boolean {
    const { modifierActive, prepareSelectionTransformDrag, scheduleSelectionPreview } = ports
    if (drag.kind === 'rotate-content' && drag.selectionStart) {
      const transformTarget = drag.transformStartTarget ?? drag.selectionStart
      const startAngle = drag.startAngle ?? 0
      const pivot = drag.selectionPivotStart ?? transformedSelectionPivotPreset(transformTarget, 'center', startAngle, drag.transformStartShear)
      const rawAngle = selectionRotationAngle(transformTarget, drag.start, point, false, pivot)
      const angle = snapSelectionRotation(startAngle + rawAngle, modifierActive(event.nativeEvent, 'snapSelectionRotation'))
      const target = rotateSelectionTargetAroundPivot(transformTarget, pivot, angle - startAngle)
      if (drag.previewAngle === angle && drag.previewTarget?.x === target.x && drag.previewTarget.y === target.y) return true
      if (!prepareSelectionTransformDrag(drag)) return true
      drag.angle = angle
      drag.previewAngle = angle
      drag.previewTarget = target
      drag.previewShear = drag.transformStartShear ? { ...drag.transformStartShear } : undefined
      scheduleSelectionPreview(drag)
    }
    return false
  }

  function endContentTransform({
    drag,
    session,
    state
  }: {
    drag: DragState
    session: DocumentSession
    state: ReturnType<typeof useWorkspace.getState>
  }): boolean {
    const { symmetryCenter, symmetryStartPointForDrag, invalidateCompositeRect, t } = ports
    if (
      (drag.kind === 'move-content' || drag.kind === 'transform-content' || drag.kind === 'rotate-content' || drag.kind === 'shear-content') &&
      drag.selectionStart &&
      drag.previewSelection
    ) {
      if (drag.deferredSelectionPreview && drag.selectionSource && selectionTransformPreviewChanged(drag)) {
        const target = drag.previewTarget ?? drag.previewSelection
        const simpleTranslation =
          drag.kind === 'move-content' &&
          (drag.previewAngle ?? 0) % 360 === 0 &&
          !drag.previewShear &&
          target.width === drag.selectionSource.selection.width &&
          target.height === drag.selectionSource.selection.height &&
          !target.flipHorizontal &&
          !target.flipVertical
        if (deferredSelectionPreviewMaterializationRequired(simpleTranslation, Boolean(drag.floatingPaste), drag.selectionSource.origin)) {
          drag.previewEdit = simpleTranslation
            ? applySelectionTranslationCommit(session.document, drag.selectionSource, target, Boolean(drag.copy), activePaintLayer(session), session.view.tileRepeatMode)
            : applySelectionTransform(
                session.document,
                drag.selectionSource,
                target,
                drag.previewAngle ?? 0,
                Boolean(drag.copy),
                drag.previewShear,
                session.symmetryAxes,
                symmetryCenter,
                activePaintLayer(session),
                symmetryStartPointForDrag(drag),
                drag.previewQuad,
                false,
                session.selectionRotationAlgorithm === 'rotsprite'
              )
          drag.deferredSelectionPreview = false
          for (const rect of deferredSelectionCommitInvalidationRects(drag)) invalidateCompositeRect(rect)
        }
      }
      const hasPixelPreview = Boolean(
        drag.previewEdit ||
          drag.translationPreview?.count ||
          drag.selectionLayers?.some((layer) => layer.previewEdit || layer.translationPreview?.count) ||
          (drag.deferredSelectionPreview && drag.selectionSource && selectionTransformPreviewChanged(drag))
      )
      const label = !hasPixelPreview
        ? t('workspace.history.transformSelection')
        : drag.copy
          ? t('workspace.history.copySelectionContent')
          : drag.kind === 'rotate-content'
            ? t('workspace.history.rotateSelectionContent')
            : drag.kind === 'move-content'
              ? t('workspace.history.moveSelectionContent')
              : t('workspace.history.transformSelectionContent')
      if (selectionTransformPreviewChanged(drag)) {
        if (drag.floatingPaste)
          state.updateFloatingPastePreview(
            drag.previewEdit ?? null,
            drag.previewSelection,
            drag.translationPreview,
            drag.previewTarget,
            drag.previewAngle,
            drag.previewShear,
            Boolean(drag.deferredSelectionPreview),
            drag.selectionLayers,
            drag.previewQuad
          )
        else if (drag.selectionSource)
          state.beginFloatingSelectionTransform(
            drag.selectionSource,
            drag.previewEdit ?? null,
            drag.selectionStart,
            drag.previewSelection,
            Boolean(drag.copy),
            label,
            drag.translationPreview,
            drag.previewTarget,
            drag.previewAngle,
            drag.previewShear,
            Boolean(drag.deferredSelectionPreview),
            drag.tilemapEditCellIndex,
            drag.selectionLayers,
            drag.previewQuad
          )
        if (drag.previewPivot) state.setSelectionPivot(drag.selectionPivotCustom === false ? null : drag.previewPivot)
      }
    }
    return false
  }
  return { moveFreeTransform, moveContent, resizeFreeTransform, resizeContent, shearContent, rotateContent, endContentTransform }
}
