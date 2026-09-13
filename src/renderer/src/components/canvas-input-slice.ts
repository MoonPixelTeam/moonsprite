import type { SelectionRect } from '@shared/types-selection'
import { useWorkspace, type DocumentSession } from '@/store/workspace'
import { CanvasInputState } from '@/core/canvas-input-controller'
import { resizeSelectionBounds, shapeBounds } from '@/core/canvas-input-resize'
import { selectionGestureMoved } from '@/core/canvas-input-preview'
import { type CanvasDragState as DragState, type CanvasPoint as Point, type SelectionHandle } from '@/core/canvas-input-contracts'
import { canvasCursors, selectionCreationCursor } from '@/core/canvas-visuals'
import { clampSliceRect, moveSliceRect, moveSliceRects, sliceAtPoint } from '@/core/slices'

interface Ports {
  sliceTool: boolean
  sliceHandleAt: (clientX: number, clientY: number, slice: SelectionRect) => SelectionHandle | null
  inputRef: import('react').RefObject<CanvasInputState>
  displayedResizeCursorForHandle: (hit: SelectionHandle, contentRotation?: number) => string
  scheduleDraw: () => void
  selectionCrosshair: boolean
}

export function createSliceCanvasInput(ports: Ports) {
  function beginSlice({
    freeTransformActive,
    temporaryMove,
    event,
    session,
    point,
    state
  }: {
    freeTransformActive: boolean
    temporaryMove: boolean
    event: React.PointerEvent<HTMLCanvasElement>
    session: DocumentSession
    point: Point
    state: ReturnType<typeof useWorkspace.getState>
  }): boolean {
    const { sliceTool, sliceHandleAt, inputRef, displayedResizeCursorForHandle, scheduleDraw, selectionCrosshair } = ports
    if (!freeTransformActive && !temporaryMove && sliceTool && event.button === 0) {
      const selectedIds = session.selectedSliceIds?.length ? session.selectedSliceIds : session.selectedSliceId ? [session.selectedSliceId] : []
      const selected = selectedIds.length === 1 ? (session.document.slices?.find((slice) => slice.id === selectedIds[0]) ?? null) : null
      const handle = selected ? sliceHandleAt(event.clientX, event.clientY, selected) : null
      if (selected && handle && !event.shiftKey && !event.altKey) {
        inputRef.current.drag = {
          kind: 'resize-slice',
          start: point,
          last: point,
          sliceId: selected.id,
          sliceStart: { ...selected },
          handle,
          previewTarget: { ...selected }
        }
        event.currentTarget.style.cursor = displayedResizeCursorForHandle(handle)
        return true
      }
      const hit = sliceAtPoint(session.document.slices ?? [], point.x, point.y)
      if (hit) {
        if (event.shiftKey) {
          state.selectSlice(hit.id, true)
          scheduleDraw()
          return true
        }
        const movingIds = selectedIds.includes(hit.id) ? selectedIds : [hit.id]
        if (!selectedIds.includes(hit.id)) state.selectSlice(hit.id)
        const starts = Object.fromEntries(
          movingIds.flatMap((id) => {
            const slice = session.document.slices?.find((candidate) => candidate.id === id)
            return slice ? [[id, { x: slice.x, y: slice.y, width: slice.width, height: slice.height }] as const] : []
          })
        )
        inputRef.current.drag = {
          kind: 'move-slice',
          start: point,
          last: point,
          startClient: { x: event.clientX, y: event.clientY },
          moved: false,
          sliceId: hit.id,
          sliceIds: movingIds,
          sliceStart: { ...hit },
          sliceStarts: starts,
          slicePreviewTargets: starts,
          previewTarget: { ...hit },
          copy: event.altKey,
          collapseSliceSelectionOnClick: movingIds.length > 1
        }
        event.currentTarget.style.cursor = event.altKey ? canvasCursors.copy : canvasCursors.move
        return true
      }
      state.selectSlice(null)
      inputRef.current.drag = {
        kind: 'create-slice',
        start: point,
        last: point,
        startClient: { x: event.clientX, y: event.clientY },
        moved: false,
        previewTarget: clampSliceRect(shapeBounds(point, point), session.document.width, session.document.height)
      }
      event.currentTarget.style.cursor = selectionCreationCursor(selectionCrosshair)
      return true
    }
    return false
  }

  function moveSliceCreation({
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
    const { scheduleDraw } = ports
    if (drag.kind === 'create-slice') {
      drag.moved = drag.moved || selectionGestureMoved(drag.startClient, { x: event.clientX, y: event.clientY })
      drag.last = point
      drag.previewTarget = clampSliceRect(shapeBounds(drag.start, point), session.document.width, session.document.height)
      scheduleDraw()
      return true
    }
    return false
  }

  function moveSlice({
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
    const { scheduleDraw } = ports
    if (drag.kind === 'move-slice' && drag.sliceStart) {
      drag.moved = drag.moved || selectionGestureMoved(drag.startClient, { x: event.clientX, y: event.clientY })
      drag.last = point
      if (drag.sliceIds?.length && drag.sliceStarts) {
        const starts = drag.sliceIds.flatMap((id) => (drag.sliceStarts?.[id] ? [drag.sliceStarts[id]] : []))
        const targets = moveSliceRects(starts, point.x - drag.start.x, point.y - drag.start.y, session.document.width, session.document.height)
        drag.slicePreviewTargets = Object.fromEntries(
          drag.sliceIds.map((id, index) => [id, targets[index]]).filter((entry): entry is [string, SelectionRect] => Boolean(entry[1]))
        )
        drag.previewTarget = drag.slicePreviewTargets[drag.sliceId ?? ''] ?? targets[0]
      } else
        drag.previewTarget = moveSliceRect(drag.sliceStart, point.x - drag.start.x, point.y - drag.start.y, session.document.width, session.document.height)
      scheduleDraw()
      return true
    }
    return false
  }

  function moveSliceResize({ drag, point, session }: { drag: DragState; point: Point; session: DocumentSession }): boolean {
    const { scheduleDraw } = ports
    if (drag.kind === 'resize-slice' && drag.sliceStart && drag.handle) {
      drag.last = point
      drag.previewTarget = clampSliceRect(
        resizeSelectionBounds(drag.sliceStart, point, drag.handle, session.document),
        session.document.width,
        session.document.height
      )
      scheduleDraw()
      return true
    }
    return false
  }

  function endSliceCreation({
    drag,
    event,
    state
  }: {
    drag: DragState
    event: React.PointerEvent<HTMLCanvasElement>
    state: ReturnType<typeof useWorkspace.getState>
  }): boolean {
    const { scheduleDraw } = ports
    if (drag.kind === 'create-slice' && drag.previewTarget && (drag.moved || selectionGestureMoved(drag.startClient, { x: event.clientX, y: event.clientY }))) {
      state.createSlice(drag.previewTarget)
      scheduleDraw()
    }
    return false
  }

  function endSliceMove({
    drag,
    event,
    state
  }: {
    drag: DragState
    event: React.PointerEvent<HTMLCanvasElement>
    state: ReturnType<typeof useWorkspace.getState>
  }): boolean {
    const { scheduleDraw } = ports
    if (drag.kind === 'move-slice' && drag.sliceId) {
      const moved = drag.moved || selectionGestureMoved(drag.startClient, { x: event.clientX, y: event.clientY })
      if (!moved && drag.collapseSliceSelectionOnClick) state.selectSlice(drag.sliceId)
      else if (moved && drag.sliceIds?.length && drag.slicePreviewTargets) {
        if (drag.copy) state.duplicateSlices(drag.sliceIds, drag.slicePreviewTargets)
        else state.updateSlices(drag.slicePreviewTargets)
      } else if (moved && drag.previewTarget) state.updateSlice(drag.sliceId, drag.previewTarget)
      scheduleDraw()
    }
    return false
  }

  function endSliceResize({ drag, state }: { drag: DragState; state: ReturnType<typeof useWorkspace.getState> }): boolean {
    const { scheduleDraw } = ports
    if (drag.kind === 'resize-slice' && drag.sliceId && drag.previewTarget) {
      state.updateSlice(drag.sliceId, drag.previewTarget)
      scheduleDraw()
    }
    return false
  }
  return { beginSlice, moveSliceCreation, moveSlice, moveSliceResize, endSliceCreation, endSliceMove, endSliceResize }
}
