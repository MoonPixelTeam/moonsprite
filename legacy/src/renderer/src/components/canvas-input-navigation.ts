import { useWorkspace, type DocumentSession } from '@/store/workspace'
import {
  displayedCanvasCenter,
  rotateViewAroundViewportPoint,
  rotationIndicatorPointBetweenPointerAndCanvasCenter,
  rotationIndicatorPointLeftOfPointer,
  snapViewRotation,
  viewPanDeltaFromScreen,
  viewRotationPivot,
  zoomViewAroundViewportPoint
} from '@/core/view-geometry'
import { canvasClientDeltaForInterfaceScale } from '@/core/canvas-interface-scale'
import { CanvasInputState } from '@/core/canvas-input-controller'
import {
  createCanvasPanDrag,
  restoreCanvasDragAfterPan,
  shouldStartCanvasPan,
  steppedCanvasZoom as steppedZoom,
  viewDragClientDelta,
  zoomDragModeForModifiers,
  zoomDragTarget
} from '@/core/canvas-input-navigation'
import { type CanvasDragState as DragState, type CanvasPoint as Point } from '@/core/canvas-input-contracts'
import { canvasCursors } from '@/core/canvas-visuals'

interface Ports {
  inputRef: import('react').RefObject<CanvasInputState>
  liveViewRef: import('react').RefObject<import('@shared/types-view').ViewState>
  beginPanPreview: () => void
  scheduleBrushPreviewOverlay: () => void
  stageSize: () => {
    width: number
    height: number
  }
  stagePoint: (clientX: number, clientY: number) => Point
  rotationIndicatorPosition: import('@/core/file-preferences').RotationIndicatorPosition
  rotationIndicatorAnchorRef: import('react').RefObject<Point | null>
  updateRotationIndicator: (rotation: number, visible: boolean) => void
  viewDragSensitivity: 0.5 | 0.75 | 1 | 1.5 | 2
  interfaceScale: import('@/core/file-preferences').UiScale
  constrainCanvasView: (
    view: DocumentSession['view'],
    size?: {
      width: number
      height: number
    }
  ) => DocumentSession['view']
  schedulePanPreview: (panX: number, panY: number, startPan: Point) => void
  zoomToolDragMode: import('@/core/file-preferences').ZoomToolDragMode
  scheduleZoomPreview: (next: import('@shared/types-view').ViewState) => void
  modifierActive: (event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>, id: import('@/core/shortcuts').ShortcutId) => boolean
  applyRotationStyle: (_view: import('@shared/types-view').ViewState) => void
  scheduleDraw: () => void
  finishPanPreview: () => import('@shared/types-view').ViewState
  localPoint: (event: React.PointerEvent<HTMLCanvasElement>, allowOutsideCopies?: boolean) => Point | null
  updateCursor: (event: React.PointerEvent<HTMLCanvasElement>) => void
  finishZoomPreview: () => import('@shared/types-view').ViewState
}

export function createNavigationCanvasInput(ports: Ports) {
  function beginPan({
    event,
    playbackNavigationTool
  }: {
    event: React.PointerEvent<HTMLCanvasElement>
    playbackNavigationTool: 'hand' | 'rotate' | 'zoom' | null
  }): boolean {
    const { inputRef, liveViewRef, beginPanPreview, scheduleBrushPreviewOverlay } = ports
    if (event.button === 1 || (event.button === 0 && (inputRef.current.spaceHeld || playbackNavigationTool === 'hand'))) {
      const view = liveViewRef.current
      inputRef.current.drag = createCanvasPanDrag({ x: view.panX, y: view.panY }, { x: event.clientX, y: event.clientY }, inputRef.current.drag ?? undefined)
      beginPanPreview()
      event.currentTarget.setPointerCapture(event.pointerId)
      event.currentTarget.style.cursor = canvasCursors.grabbing
      // Middle-button/Space panning must hide the smooth-brush overlay even
      // when the pointer does not move after the gesture starts.
      scheduleBrushPreviewOverlay()
      // Selection corners live on the main canvas, not the brush overlay.
      // Retire them on press even if no pointermove follows.
      ports.scheduleDraw()
      event.preventDefault()
      return true
    }
    return false
  }

  function beginRotation({ session, event, point }: { session: DocumentSession; event: React.PointerEvent<HTMLCanvasElement>; point: Point }): boolean {
    const { stageSize, stagePoint, rotationIndicatorPosition, liveViewRef, rotationIndicatorAnchorRef, inputRef, updateRotationIndicator } = ports
    if (session.tool === 'rotate' && event.button === 0) {
      const size = stageSize()
      const pointer = stagePoint(event.clientX, event.clientY)
      const pivot =
        rotationIndicatorPosition === 'view'
          ? rotationIndicatorPointBetweenPointerAndCanvasCenter(
              size.width,
              size.height,
              pointer,
              displayedCanvasCenter(size.width, size.height, liveViewRef.current, rotationIndicatorPosition)
            )
          : rotationIndicatorPosition === 'pointer-left'
            ? rotationIndicatorPointLeftOfPointer(size.width, size.height, pointer)
            : viewRotationPivot(size.width, size.height, liveViewRef.current.panX, liveViewRef.current.panY, rotationIndicatorPosition)
      rotationIndicatorAnchorRef.current = rotationIndicatorPosition !== 'canvas' ? pivot : null
      const angle = (Math.atan2(pointer.y - pivot.y, pointer.x - pivot.x) * 180) / Math.PI
      inputRef.current.drag = {
        kind: 'rotate-view',
        start: point,
        last: point,
        startAngle: angle,
        startRotation: liveViewRef.current.rotation,
        startPan: { x: liveViewRef.current.panX, y: liveViewRef.current.panY },
        rotationPivot: pivot
      }
      updateRotationIndicator(liveViewRef.current.rotation, true)
      return true
    }
    return false
  }

  function beginHandPan({ session, event }: { session: DocumentSession; event: React.PointerEvent<HTMLCanvasElement> }): boolean {
    const { liveViewRef, inputRef, beginPanPreview } = ports
    if (shouldStartCanvasPan(session.tool)) {
      const view = liveViewRef.current
      inputRef.current.drag = createCanvasPanDrag({ x: view.panX, y: view.panY }, { x: event.clientX, y: event.clientY })
      beginPanPreview()
      event.currentTarget.setPointerCapture(event.pointerId)
      event.currentTarget.style.cursor = canvasCursors.grabbing
      return true
    }
    return false
  }

  function beginZoom({ session, point, event }: { session: DocumentSession; point: Point; event: React.PointerEvent<HTMLCanvasElement> }): boolean {
    const { liveViewRef, inputRef } = ports
    if (session.tool === 'zoom') {
      const view = liveViewRef.current
      inputRef.current.drag = { kind: 'zoom-drag', start: point, last: point, startClient: { x: event.clientX, y: event.clientY }, startZoom: view.zoom }
      return true
    }
    return false
  }

  function movePan({ navigationDrag, event }: { navigationDrag: DragState | null; event: React.PointerEvent<HTMLCanvasElement> }): boolean {
    const { viewDragSensitivity, interfaceScale, liveViewRef, rotationIndicatorPosition, constrainCanvasView, schedulePanPreview } = ports
    if (navigationDrag?.kind === 'pan' && navigationDrag.startPan && navigationDrag.startClient) {
      const clientDelta = viewDragClientDelta({ x: event.clientX, y: event.clientY }, navigationDrag.startClient, viewDragSensitivity)
      const delta = viewPanDeltaFromScreen(
        canvasClientDeltaForInterfaceScale(clientDelta.x, interfaceScale),
        canvasClientDeltaForInterfaceScale(clientDelta.y, interfaceScale),
        liveViewRef.current.rotation,
        rotationIndicatorPosition,
        liveViewRef.current.mirrored,
        liveViewRef.current.mirroredVertical
      )
      const constrained = constrainCanvasView({ ...liveViewRef.current, panX: navigationDrag.startPan.x + delta.x, panY: navigationDrag.startPan.y + delta.y })
      schedulePanPreview(constrained.panX, constrained.panY, navigationDrag.startPan)
      event.currentTarget.style.cursor = canvasCursors.grabbing
      return true
    }
    return false
  }

  function moveZoom({ drag, session, event }: { drag: DragState; session: DocumentSession; event: React.PointerEvent<HTMLCanvasElement> }): boolean {
    const { interfaceScale, zoomToolDragMode, stageSize, scheduleZoomPreview, constrainCanvasView, liveViewRef, stagePoint, rotationIndicatorPosition } = ports
    if (drag.kind === 'zoom-drag' && drag.startClient) {
      const zoom = zoomDragTarget(
        drag.startZoom ?? session.view.zoom,
        canvasClientDeltaForInterfaceScale(event.clientX - drag.startClient.x, interfaceScale),
        zoomDragModeForModifiers(zoomToolDragMode, event.shiftKey)
      )
      const size = stageSize()
      scheduleZoomPreview(
        constrainCanvasView({
          ...liveViewRef.current,
          ...zoomViewAroundViewportPoint(
            liveViewRef.current,
            zoom,
            stagePoint(drag.startClient.x, drag.startClient.y),
            size.width,
            size.height,
            session.document.width,
            session.document.height,
            rotationIndicatorPosition
          )
        })
      )
      return true
    }
    return false
  }

  function moveRotation({
    drag,
    event,
    state
  }: {
    drag: DragState
    event: React.PointerEvent<HTMLCanvasElement>
    state: ReturnType<typeof useWorkspace.getState>
  }): boolean {
    const {
      stageSize,
      stagePoint,
      modifierActive,
      liveViewRef,
      rotationIndicatorPosition,
      constrainCanvasView,
      applyRotationStyle,
      updateRotationIndicator,
      scheduleDraw
    } = ports
    if (drag.kind === 'rotate-view' && drag.startAngle !== undefined && drag.startRotation !== undefined) {
      const size = stageSize()
      const pointer = stagePoint(event.clientX, event.clientY)
      const resetRotation = modifierActive(event.nativeEvent, 'resetViewRotation')
      const startPan = drag.startPan ?? { x: liveViewRef.current.panX, y: liveViewRef.current.panY }
      const pivot = drag.rotationPivot ?? viewRotationPivot(size.width, size.height, startPan.x, startPan.y, rotationIndicatorPosition)
      const angle = (Math.atan2(pointer.y - pivot.y, pointer.x - pivot.x) * 180) / Math.PI
      let rotation = drag.startRotation + angle - drag.startAngle
      if (modifierActive(event.nativeEvent, 'snapViewRotation')) rotation = snapViewRotation(rotation)
      const normalizedRotation = resetRotation ? 0 : ((rotation % 360) + 360) % 360
      const rotatedView = rotateViewAroundViewportPoint(
        { ...liveViewRef.current, panX: startPan.x, panY: startPan.y, rotation: drag.startRotation },
        normalizedRotation,
        pivot,
        size.width,
        size.height,
        rotationIndicatorPosition
      )
      liveViewRef.current = constrainCanvasView({ ...liveViewRef.current, panX: rotatedView.panX, panY: rotatedView.panY, rotation: normalizedRotation })
      applyRotationStyle(liveViewRef.current)
      updateRotationIndicator(normalizedRotation, true)
      scheduleDraw()
      state.setView({ panX: liveViewRef.current.panX, panY: liveViewRef.current.panY, rotation: normalizedRotation })
      return true
    }
    return false
  }

  function endPan({
    drag,
    currentInteractionSession,
    event
  }: {
    drag: DragState
    currentInteractionSession: DocumentSession
    event: React.PointerEvent<HTMLCanvasElement>
  }): boolean {
    const { finishPanPreview, localPoint, inputRef, updateCursor, scheduleBrushPreviewOverlay, scheduleDraw } = ports
    if (drag.kind === 'pan') {
      finishPanPreview()
      const resumedDrag =
        currentInteractionSession.freeTransformActive === true ? null : restoreCanvasDragAfterPan(drag, localPoint(event) ?? drag.resumeDrag?.last ?? drag.last)
      if (resumedDrag) inputRef.current.drag = resumedDrag
      updateCursor(event)
      // The pan drag owns the pointer while the view moves. Once it ends,
      // redraw the separate brush-preview surface so a smooth-brush preview
      // can return immediately (or stay cleared when another drag resumes).
      scheduleBrushPreviewOverlay()
      // Commit the pan on the next frame so pointer-up does not synchronously
      // block the primary mouse stream with a full canvas repaint.
      scheduleDraw()
      return true
    }
    return false
  }

  function endZoom({ drag, event, session }: { drag: DragState; event: React.PointerEvent<HTMLCanvasElement>; session: DocumentSession }): boolean {
    const { interfaceScale, stageSize, liveViewRef, scheduleZoomPreview, constrainCanvasView, stagePoint, rotationIndicatorPosition, finishZoomPreview } = ports
    if (drag.kind === 'zoom-drag') {
      const startClient = drag.startClient ?? { x: event.clientX, y: event.clientY }
      const moved =
        Math.abs(canvasClientDeltaForInterfaceScale(event.clientX - startClient.x, interfaceScale)) > 3 ||
        Math.abs(canvasClientDeltaForInterfaceScale(event.clientY - startClient.y, interfaceScale)) > 3
      if (!moved) {
        const size = stageSize()
        const view = liveViewRef.current
        const nextZoom = steppedZoom(view.zoom, event.button !== 2)
        if (nextZoom !== view.zoom) {
          scheduleZoomPreview(
            constrainCanvasView({
              ...view,
              ...zoomViewAroundViewportPoint(
                view,
                nextZoom,
                stagePoint(event.clientX, event.clientY),
                size.width,
                size.height,
                session.document.width,
                session.document.height,
                rotationIndicatorPosition
              )
            })
          )
        }
      }
      finishZoomPreview()
      return true
    }
    return false
  }

  function endRotation({ drag }: { drag: DragState }): boolean {
    const { updateRotationIndicator, liveViewRef } = ports
    if (drag.kind === 'rotate-view') {
      updateRotationIndicator(liveViewRef.current.rotation, false)
      return true
    }
    return false
  }
  return { beginPan, beginRotation, beginHandPan, beginZoom, movePan, moveZoom, moveRotation, endPan, endZoom, endRotation }
}
