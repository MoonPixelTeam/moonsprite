import type { RasterLayer } from '@shared/types-layer'
import type { SelectionRect } from '@shared/types-selection'
import { useWorkspace, type DocumentSession } from '@/store/workspace'
import { CanvasInputState } from '@/core/canvas-input-controller'
import { resizeSelectionBounds, shapeBounds } from '@/core/canvas-input-resize'
import { selectionGestureMoved } from '@/core/canvas-input-preview'
import { type CanvasDragState as DragState, type CanvasPoint as Point, type SelectionHandle } from '@/core/canvas-input-contracts'
import { type SelectionHit } from '@/core/canvas-input-state'
import { canvasCursors, resizeCursors } from '@/core/canvas-visuals'
import { ensureAnimationDocument, resolveAnimationCel } from '@/core/animation'
import { openTextToolDialog } from '@/components/text-tool-events'
import { sameBoxPreview } from './canvas-box-preview'

interface Ports {
  inputRef: import('react').RefObject<CanvasInputState>
  displayedResizeCursorForHandle: (hit: SelectionHandle, contentRotation?: number) => string
  textLayerAt: (point: Point) => RasterLayer | null
  scheduleDraw: () => void
  selectionTransformModifierState: (event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>) => {
    proportional: boolean
    integerScale: boolean
    fromCenter: boolean
    copy: false
  }
  compositeCacheRef: import('react').RefObject<import('@/components/canvas-composite-cache').CanvasCompositeCache>
  textToolBoxRef: import('react').RefObject<SelectionRect | null>
}

export function createTextCanvasInput(ports: Ports) {
  function beginTextResize({
    temporaryMove,
    textCopyTarget,
    session,
    selectedTextBox,
    textBoxHit,
    state,
    point,
    event
  }: {
    temporaryMove: boolean
    textCopyTarget: RasterLayer | null
    session: DocumentSession
    selectedTextBox: SelectionRect | null
    textBoxHit: SelectionHit
    state: ReturnType<typeof useWorkspace.getState>
    point: Point
    event: React.PointerEvent<HTMLCanvasElement>
  }): boolean {
    const { inputRef, displayedResizeCursorForHandle } = ports
    if (!temporaryMove && !textCopyTarget && session.tool === 'text' && selectedTextBox && textBoxHit in resizeCursors) {
      state.beginSelectedTextBoxTransform()
      inputRef.current.drag = {
        kind: 'transform-text-box',
        start: point,
        last: point,
        handle: textBoxHit as SelectionHandle,
        transformStartTarget: { ...selectedTextBox },
        previewTarget: { ...selectedTextBox }
      }
      event.currentTarget.style.cursor = displayedResizeCursorForHandle(textBoxHit as SelectionHandle)
      return true
    }
    return false
  }

  function beginTextMove({
    temporaryMove,
    textCopyTarget,
    session,
    selectedTextBox,
    textBoxHit,
    state,
    point,
    event
  }: {
    temporaryMove: boolean
    textCopyTarget: RasterLayer | null
    session: DocumentSession
    selectedTextBox: SelectionRect | null
    textBoxHit: SelectionHit
    state: ReturnType<typeof useWorkspace.getState>
    point: Point
    event: React.PointerEvent<HTMLCanvasElement>
  }): boolean {
    const { inputRef } = ports
    if (!temporaryMove && !textCopyTarget && session.tool === 'text' && selectedTextBox && textBoxHit === 'inside') {
      state.beginSelectedTextBoxTransform()
      inputRef.current.drag = {
        kind: 'transform-text-box',
        start: point,
        last: point,
        startClient: { x: event.clientX, y: event.clientY },
        moved: false,
        transformStartTarget: { ...selectedTextBox },
        previewTarget: { ...selectedTextBox }
      }
      event.currentTarget.style.cursor = canvasCursors.move
      return true
    }
    return false
  }

  function beginText({
    session,
    event,
    temporaryMove,
    textCopyTarget,
    point,
    state
  }: {
    session: DocumentSession
    event: React.PointerEvent<HTMLCanvasElement>
    temporaryMove: boolean
    textCopyTarget: RasterLayer | null
    point: Point
    state: ReturnType<typeof useWorkspace.getState>
  }): boolean {
    const { textLayerAt, inputRef } = ports
    if (session.tool === 'text' && event.button === 0 && !temporaryMove && !textCopyTarget) {
      // Text behaves as a direct-edit tool: hitting an existing visible text
      // layer opens its editor instead of starting a new text box.
      const textTarget = textLayerAt(point)
      if (textTarget?.kind === 'text') {
        const timeline = ensureAnimationDocument(session.document)
        const cel = timeline.cels.find((candidate) => candidate.layerId === textTarget.id && candidate.frameId === timeline.activeFrameId)
        const source = resolveAnimationCel(timeline, cel ?? null) ?? cel
        if (cel && source?.text) {
          state.selectMoveToolLayer(textTarget.id)
          openTextToolDialog({
            documentId: session.document.id,
            layerId: textTarget.id,
            frameId: timeline.activeFrameId,
            x: source.surface?.offsetX ?? source.text.originX ?? textTarget.offsetX,
            y: source.surface?.offsetY ?? source.text.originY ?? textTarget.offsetY
          })
          return true
        }
      }
      inputRef.current.drag = {
        kind: 'create-text-box',
        start: point,
        last: point,
        startClient: { x: event.clientX, y: event.clientY },
        moved: false,
        previewTarget: shapeBounds(point, point)
      }
      return true
    }
    return false
  }

  function moveTextCreation({ drag, event, point }: { drag: DragState; event: React.PointerEvent<HTMLCanvasElement>; point: Point }): boolean {
    const { scheduleDraw } = ports
    if (drag.kind === 'create-text-box') {
      drag.moved = drag.moved || selectionGestureMoved(drag.startClient, { x: event.clientX, y: event.clientY })
      drag.last = point
      const target = shapeBounds(drag.start, point)
      if (sameBoxPreview(drag.previewTarget, target)) return true
      drag.previewTarget = target
      scheduleDraw()
      return true
    }
    return false
  }

  function moveTextTransform({
    drag,
    event,
    point,
    session,
    state
  }: {
    drag: DragState
    event: React.PointerEvent<HTMLCanvasElement>
    point: Point
    session: DocumentSession
    state: ReturnType<typeof useWorkspace.getState>
  }): boolean {
    const { selectionTransformModifierState, compositeCacheRef, scheduleDraw } = ports
    if (drag.kind === 'transform-text-box' && drag.transformStartTarget) {
      const modifiers = selectionTransformModifierState(event.nativeEvent)
      const target = drag.handle
        ? resizeSelectionBounds(drag.transformStartTarget, point, drag.handle, session.document, modifiers.proportional, false, modifiers.fromCenter)
        : {
            ...drag.transformStartTarget,
            x: Math.round(drag.transformStartTarget.x + point.x - drag.start.x),
            y: Math.round(drag.transformStartTarget.y + point.y - drag.start.y)
          }
      drag.last = point
      drag.moved = drag.moved || selectionGestureMoved(drag.startClient, { x: event.clientX, y: event.clientY })
      if (!drag.handle && !drag.moved) return true
      if (sameBoxPreview(drag.previewTarget, target)) return true
      const layerId = session.textBoxTransform?.layerId ?? session.selectedLayerIds[0]
      const layer = session.document.layers.find(item => item.id === layerId)
      const before = layer ? { x: layer.offsetX, y: layer.offsetY, width: layer.width, height: layer.height } : drag.previewTarget
      drag.previewTarget = target
      state.previewTextBoxTransform(drag.previewTarget)
      // Text reflow affects only its old/new raster extents. Translation reuses
      // the same pixels; neither operation should drop the whole document cache.
      if (before) compositeCacheRef.current.invalidateDocumentRect(before, session.document)
      if (layer) compositeCacheRef.current.invalidateDocumentRect({ x: layer.offsetX, y: layer.offsetY, width: layer.width, height: layer.height }, session.document)
      scheduleDraw()
      return true
    }
    return false
  }

  function endTextCreation({ drag, event, session }: { drag: DragState; event: React.PointerEvent<HTMLCanvasElement>; session: DocumentSession }): boolean {
    const { textToolBoxRef, scheduleDraw } = ports
    if (drag.kind === 'create-text-box') {
      const moved = drag.moved || selectionGestureMoved(drag.startClient, { x: event.clientX, y: event.clientY })
      const target = drag.previewTarget ?? shapeBounds(drag.start, drag.last)
      textToolBoxRef.current = moved ? { ...target } : null
      openTextToolDialog({
        documentId: session.document.id,
        x: moved ? target.x : drag.start.x,
        y: moved ? target.y : drag.start.y,
        ...(moved ? { width: target.width, height: target.height } : {})
      })
      scheduleDraw()
    }
    return false
  }

  function endTextTransform({ drag, state, session }: { drag: DragState; state: ReturnType<typeof useWorkspace.getState>; session: DocumentSession }): boolean {
    const { compositeCacheRef, scheduleDraw } = ports
    if (drag.kind === 'transform-text-box' && drag.previewTarget) {
      if (!drag.handle && !drag.moved) {
        state.cancelTextBoxTransform()
        const currentSession = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id) ?? session
        const layer =
          currentSession.selectedLayerIds.length === 1
            ? currentSession.document.layers.find((candidate) => candidate.id === currentSession.selectedLayerIds[0] && candidate.kind === 'text')
            : null
        const timeline = ensureAnimationDocument(currentSession.document)
        const cel = layer ? timeline.cels.find((candidate) => candidate.layerId === layer.id && candidate.frameId === timeline.activeFrameId) : null
        const source = resolveAnimationCel(timeline, cel ?? null) ?? cel
        if (layer && cel)
          openTextToolDialog({
            documentId: currentSession.document.id,
            layerId: layer.id,
            frameId: timeline.activeFrameId,
            // The rendered cel surface is the current placement. Text metadata can
            // be stale while a duplicated layer move is being finalized, so it must
            // never pull an existing text layer back to its pre-move origin.
            x: source?.surface?.offsetX ?? source?.text?.originX ?? layer.offsetX,
            y: source?.surface?.offsetY ?? source?.text?.originY ?? layer.offsetY
          })
      } else state.commitTextBoxTransform(drag.previewTarget)
      if (drag.transformStartTarget) compositeCacheRef.current.invalidateDocumentRect(drag.transformStartTarget, session.document)
      compositeCacheRef.current.invalidateDocumentRect(drag.previewTarget, session.document)
      scheduleDraw()
    }
    return false
  }
  return { beginTextResize, beginTextMove, beginText, moveTextCreation, moveTextTransform, endTextCreation, endTextTransform }
}
