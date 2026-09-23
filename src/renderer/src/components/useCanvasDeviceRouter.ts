import { targetsCanvasSurface } from './canvas-reference-input'
import { deviceTemporaryTool, deviceSampleUsesSecondary, rightClickToolEvent, deviceRightClickAction, penEraserToolEvent } from './canvas-device-tools'
import { createCanvasTouchNavigation, type TouchNavigationPorts } from './canvas-touch-navigation'
import { measureRuntimeDiagnostic } from '../core/runtime-diagnostics'
import { createRuntimeLatencyReporter, measureRuntimeStages, runtimeEventStartTime } from '@/core/runtime-diagnostic-stages'
import { documentDiagnosticDetail } from '../core/document-diagnostics'
import { useEffect, useRef } from 'react'
import type { RasterLayer } from '@shared/types-layer'
import type { RgbaColor } from '@shared/types-color'
import { endCanvasToolGesture } from '@/core/canvas-tool-gesture-lock'
import { useWorkspace, type DocumentSession } from '@/store/workspace'
import { zoomViewAroundViewportPoint } from '@/core/view-geometry'
import { dispatchWheelShortcutInput } from '@/core/shortcuts'
import {
  canvasColorSamplingActiveFor,
  canvasColorSamplingIntentActive,
  endCanvasColorSampling,
  routeCanvasColorSamplingIntent
} from '@/core/canvas-color-sampling'
import {
  CanvasInputState,
  PointerPressureAdapter,
  clampCanvasZoom as clampZoom,
  createCanvasPanDrag,
  isCanvasViewNavigationDrag,
  isCanvasViewNavigationTool,
  normalizeCanvasWheelDelta,
  wheelCanvasZoom,
  type CanvasPoint as Point
} from '@/core/canvas-input'
import { canvasCursors, canvasToolCursor, selectionCreationCursor } from '@/core/canvas-visuals'
import { isPressurePointerType } from '@/core/pressure'

export const retainsCanvasCursorOverlayOnLeave = (
  drag: CanvasInputState['drag'],
  tileRepeatMode: import('@shared/types-raster').TileRepeatMode
): boolean => {
  if (drag?.kind === 'marquee' || drag?.kind === 'lasso' || drag?.kind === 'polygon-lasso') return true
  return (drag?.kind === 'draw' || drag?.kind === 'tile-draw' || drag?.kind === 'move-content' || drag?.kind === 'move-selection') && tileRepeatMode !== 'off'
}

/** A secondary press during a primary drawing gesture cancels that in-flight gesture. */
export const cancelsActiveCanvasDrawWithRightClick = (
  event: Pick<PointerEvent, 'button' | 'buttons'>,
  drag: CanvasInputState['drag']
): boolean => {
  return (event.button === 0 || event.button === 2) && cancelsActiveCanvasDrawWhileRightHeld(event, drag)
}

/** Browsers report a second mouse button during a captured stroke as pointermove, not pointerdown. */
export const cancelsActiveCanvasDrawWhileRightHeld = (
  event: Pick<PointerEvent, 'buttons'>,
  drag: CanvasInputState['drag']
): boolean => {
  if ((event.buttons & 3) !== 3 || !drag) return false
  return !isCanvasViewNavigationDrag(drag)
}

import type { Ports } from './canvas-device-router-ports'

export function useCanvasDeviceRouter(ports: Ports) {
  const pressureAdapterRef = useRef(new PointerPressureAdapter())
  const middlePenPointerRef = useRef<number | null>(null)

  const touchNavigationPortsRef = useRef<TouchNavigationPorts | null>(null)

  const touchNavigationRef = useRef<ReturnType<typeof createCanvasTouchNavigation> | null>(null)

  if (!touchNavigationRef.current) touchNavigationRef.current = createCanvasTouchNavigation(() => touchNavigationPortsRef.current!)

  const touchNavigation = touchNavigationRef.current

  const wheelBrushSizePreviewRef = useRef(false)

  const nativeWheelHandlerRef = useRef<(event: WheelEvent) => void>(() => {})
  const inputWaitRef = useRef<ReturnType<typeof createRuntimeLatencyReporter> | null>(null)
  inputWaitRef.current ??= createRuntimeLatencyReporter('canvas.input.wait')
  useEffect(() => () => inputWaitRef.current?.flush(), [])

  const lastNativeWheelRef = useRef<{ at: number; delta: number; type: string } | null>(null)

  useEffect(() => {
    middlePenPointerRef.current = null
    pressureAdapterRef.current.reset()
    ports.inputRef.current.resetPointerDeviceState()
    touchNavigation.reset()
    const resetPointerDevices = (): void => {
      middlePenPointerRef.current = null
      ports.inputRef.current.resetPointerDeviceState()
      pressureAdapterRef.current.reset()
      touchNavigation.reset()
    }
    const handleVisibilityChange = (): void => {
      if (document.visibilityState === 'hidden') resetPointerDevices()
    }
    window.addEventListener('blur', resetPointerDevices)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      middlePenPointerRef.current = null
      window.removeEventListener('blur', resetPointerDevices)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      ports.inputRef.current.resetPointerDeviceState()
      pressureAdapterRef.current.reset()
      touchNavigation.reset()
    }
  }, [ports.session.document.id])

  const onWheel = (event: WheelEvent): void => {
    const canvas = ports.canvasRef.current
    if (!canvas) return
    const path = event.composedPath()
    const targetsCanvas = targetsCanvasSurface(path, canvas)
    const pointer = ports.inputRef.current.pointer
    if (!targetsCanvas) {
      if (useWorkspace.getState().activeId !== ports.session.document.id || !pointer.visible) return
      const target = event.target instanceof Element ? event.target : null
      if (
        target?.closest(
          'input, textarea, select, [contenteditable="true"], .stage-canvas, .modal-backdrop, .context-menu, .panel, .workspace-panel-popup-layer'
        )
      )
        return
    }
    const delta = normalizeCanvasWheelDelta(event as WheelEvent & { wheelDelta?: number })
    if (delta === 0) return
    const now = performance.now()
    const previous = lastNativeWheelRef.current
    if (previous && previous.type !== event.type && now - previous.at < 12 && Math.sign(previous.delta) === Math.sign(delta)) return
    lastNativeWheelRef.current = { at: now, delta, type: event.type }
    inputWaitRef.current?.record(runtimeEventStartTime(event.timeStamp), () => ({ documentId: ports.session.document.id, input: 'wheel' }))
    const rect = ports.stageBounds()
    const eventPointInside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom
    if (ports.keyDisplayEnabled && (targetsCanvas || eventPointInside)) {
      ports.keyDisplayWheelRef.current = true
    }
    const clientX = targetsCanvas || eventPointInside ? event.clientX : pointer.clientX
    const clientY = targetsCanvas || eventPointInside ? event.clientY : pointer.clientY
    const wheelModifiers = {
      ctrlKey: event.ctrlKey || ports.inputRef.current.ctrlHeld,
      metaKey: event.metaKey,
      altKey: event.altKey || ports.inputRef.current.altHeld,
      shiftKey: event.shiftKey || ports.inputRef.current.shiftHeld
    }
    const liveSession = ports.liveInputSession()
    if ((targetsCanvas || eventPointInside) && dispatchWheelShortcutInput(canvas, wheelModifiers, delta)) {
      event.preventDefault()
      event.stopImmediatePropagation()
      return
    }
    if (
      (ports.activeLayer.kind !== 'tilemap' || liveSession.tilemapMode !== 'paint') &&
      !ports.canvasResizePreviewRef.current &&
      ports.modifierActive(wheelModifiers, 'brushSizeWheelAdjust') &&
      (liveSession.tool === 'pencil' ||
        liveSession.tool === 'line' ||
        liveSession.tool === 'airbrush' ||
        liveSession.tool === 'eraser' ||
        liveSession.tool === 'smooth' ||
        (liveSession.tool === 'selection' && liveSession.selectionKind === 'brush') ||
        liveSession.tool === 'liquify') &&
      (liveSession.tool === 'smooth' ||
        (liveSession.tool === 'selection' && liveSession.selectionKind === 'brush') ||
        liveSession.tool === 'airbrush' ||
        liveSession.tool === 'liquify' ||
        ports.activeLayer.kind === 'tilemap' ||
        !liveSession.brushImage?.intrinsicSize)
    ) {
      event.preventDefault()
      event.stopImmediatePropagation()
      wheelBrushSizePreviewRef.current = true
      const sizeStep = (delta < 0 ? 1 : -1) * (ports.brushSizeWheelReversed ? -1 : 1)
      if (liveSession.tool === 'airbrush') useWorkspace.getState().setAirbrushScatterRadius(liveSession.airbrushScatterRadius + sizeStep)
      else if (liveSession.tool === 'liquify') useWorkspace.getState().setLiquifyRadius(liveSession.liquifyRadius + sizeStep)
      else useWorkspace.getState().setBrushSize(liveSession.brushSize + sizeStep)
      ports.updateCursorAt(clientX, clientY, wheelModifiers.ctrlKey, wheelModifiers.altKey, wheelModifiers.shiftKey)
      ports.scheduleDraw()
      return
    }
    if (ports.inputRef.current.drag?.kind === 'pan' || !ports.wheelZoomEnabled) return
    event.preventDefault()
    event.stopImmediatePropagation()
    const liveView = ports.liveViewRef.current
    const oldZoom = liveView.zoom
    const newZoom = wheelCanvasZoom(oldZoom, delta, ports.wheelZoomMode)
    if (newZoom === oldZoom) return
    const size = ports.stageSize()
    ports.scheduleZoomPreview(
      ports.constrainCanvasView({
        ...liveView,
        ...zoomViewAroundViewportPoint(
          liveView,
          newZoom,
          ports.stagePoint(clientX, clientY),
          size.width,
          size.height,
          ports.session.document.width,
          ports.session.document.height,
          ports.rotationIndicatorPosition
        )
      })
    )
  }

  nativeWheelHandlerRef.current = (event) => measureRuntimeDiagnostic('canvas.wheel', () => onWheel(event),
    () => ({ documentId: ports.session.document.id, zoom: ports.liveViewRef.current.zoom }))

  useEffect(() => {
    const listener = (event: Event): void => nativeWheelHandlerRef.current(event as WheelEvent)
    const options = { capture: true, passive: false } as AddEventListenerOptions
    window.addEventListener('wheel', listener, options)
    window.addEventListener('mousewheel', listener, options)
    return () => {
      window.removeEventListener('wheel', listener, options)
      window.removeEventListener('mousewheel', listener, options)
    }
  }, [ports.session.document.id])

  const measurePointerInput = (kind: 'pointer-down' | 'pointer-move' | 'pointer-up', action: () => void): void => {
    const performanceProbe = window.__moonSpriteCanvasProbe
    const startedAt = performanceProbe?.recordInput ? performance.now() : 0
    try {
      measureRuntimeDiagnostic(`canvas.${kind}`, action, () => {
        const current = ports.liveInputSession()
        return { ...documentDiagnosticDetail(current.document), tool: current.tool }
      })
    } finally {
      performanceProbe?.recordInput?.(kind, performance.now() - startedAt)
    }
  }

  touchNavigationPortsRef.current = {
    read: () => ({
      preferences: ports.tabletPreferences,
      view: { ...ports.session.view, ...ports.liveViewRef.current },
      documentSize: ports.session.document,
      viewportSize: ports.stageSize(),
      rotationIndicatorPosition: ports.rotationIndicatorPosition
    }),
    beginPan: (point) => {
      const view = ports.liveViewRef.current
      ports.inputRef.current.drag = createCanvasPanDrag({ x: view.panX, y: view.panY }, point)
      ports.beginPanPreview()
    },
    endPan: (commit) => {
      if (ports.inputRef.current.drag?.kind !== 'pan') return
      ports.inputRef.current.finish()
      if (commit) ports.finishPanPreview()
    },
    preview: (geometry) => {
      const view = { ...ports.session.view, ...geometry }
      ports.liveViewRef.current = view
      ports.applyRotationStyle(view)
      ports.scheduleZoomPreview(view)
    },
    finishPinch: (commitRotation) => {
      const rotation = ports.liveViewRef.current.rotation
      ports.finishZoomPreview()
      if (commitRotation) useWorkspace.getState().setViewForDocument(ports.session.document.id, { rotation })
    },
    constrain: (view, size) => ports.constrainCanvasView({ ...ports.session.view, ...view }, size),
    clampZoom,
    grabbingCursor: canvasCursors.grabbing
  }

  const pointerDown = (event: React.PointerEvent<HTMLCanvasElement>): void => measureRuntimeStages('canvas.pointer-down.total', checkpoint => {
    inputWaitRef.current?.record(runtimeEventStartTime(event.timeStamp), () => ({ documentId: ports.session.document.id, input: 'pointer-down', pointerType: event.pointerType }))
    if (event.pointerType === 'touch' && touchNavigation.down(event)) return
    if (event.pointerType === 'pen' && ports.tabletPreferences.api === 'disabled') return
    // Back/forward side buttons belong to shortcuts, never to a paint stroke.
    if (event.button === 3 || event.button === 4) return
    if (event.pointerType === 'pen' && ports.inputRef.current.auxiliaryMouseGestureActive()) return
    if (event.pointerType === 'pen' && event.button === 5 && !ports.tabletPreferences.eraserTipEnabled) return
    if (event.buttons & 4) {
      if (event.pointerType === 'pen') middlePenPointerRef.current = event.pointerId
      if (event.button !== 1) event = Object.assign(Object.create(event), { button: 1 })
    }
    if (!(event.pointerType === 'pen' && ports.inputRef.current.temporaryRightClickAction) && cancelsActiveCanvasDrawWithRightClick(event.nativeEvent, ports.inputRef.current.drag)) {
      // Do this before the normal right-click mapping so the secondary press
      // cannot start a second tool gesture while the primary stroke is being
      // rolled back.
      ports.cancelActiveCanvasInteraction()
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
      ports.hideEyedropperMagnifier()
      event.preventDefault()
      event.stopPropagation()
      ports.updateCursor(event)
      return
    }
    // Pointer ids are reusable after a lost/canceled event. Drop any stale
    // device ownership before accepting the new interaction.
    ports.inputRef.current.releasePointerDeviceEvent(event.nativeEvent)
    pressureAdapterRef.current.release(event.pointerId)
    if (!ports.inputRef.current.acceptPointerDeviceEvent(event.nativeEvent, event.pointerType === 'mouse')) return
    ports.inputRef.current.clearTemporaryTool()
    const deviceTool = deviceTemporaryTool(event, ports.tabletPreferences)
    if (deviceTool) ports.inputRef.current.setTemporaryTool(event.pointerId, deviceTool)
    const rightAction = deviceRightClickAction(event, ports.tabletPreferences)
    if (event.button === 2 && rightAction !== 'background' && !(event.pointerType === 'pen' && (event.buttons & 32))) {
      ports.inputRef.current.temporaryRightClickAction = rightAction
    }
    event = rightClickToolEvent(penEraserToolEvent(event, ports.tabletPreferences), ports.inputRef.current.temporaryRightClickAction)
    const session = ports.liveInputSession()
    const navigationGesture =
      event.button === 1 ||
      (event.button === 0 &&
        (session.animationPlaying || event.ctrlKey || event.metaKey || ports.inputRef.current.spaceHeld || isCanvasViewNavigationTool(session.tool)))
    if (!navigationGesture && routeCanvasColorSamplingIntent(event.clientX, event.clientY, deviceSampleUsesSecondary(event.button, deviceTool))) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    checkpoint('device-routing')
    measurePointerInput('pointer-down', () => ports.handlePointerDown(event))
    checkpoint('tool-handler')
    ports.syncPenCursor(event)
    checkpoint('cursor')
  }, () => ({ documentId: ports.session.document.id, tool: ports.session.tool }))

  const pointerMove = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    if (touchNavigation.move(event)) return
    if (event.pointerType === 'pen' && ports.tabletPreferences.api === 'disabled') return
    const auxiliaryPress = event.pointerType === 'mouse' && ((event.button === 1 && Boolean(event.buttons & 4)) || (event.button === 2 && Boolean(event.buttons & 2)))
    if (!ports.inputRef.current.acceptPointerDeviceEvent(event.nativeEvent, auxiliaryPress)) {
      // Compatibility mouse packets must not clear the live pen cursor/tool.
      event.preventDefault()
      return
    }
    // Pointer Events represent chorded button transitions as pointermove:
    // the pen can remain in contact while its middle/side button changes.
    if (event.button === 1 || (event.pointerType === 'pen' && ((event.buttons & 4) || middlePenPointerRef.current === event.pointerId))) {
      if ((event.buttons & 4) && ports.inputRef.current.drag?.kind !== 'pan') {
        pointerDown(event)
        return
      }
      if (!(event.buttons & 4) && ports.inputRef.current.drag?.kind === 'pan') {
        pointerUp(event)
        return
      }
    }
    if (!(event.pointerType === 'pen' && ports.inputRef.current.temporaryRightClickAction) && cancelsActiveCanvasDrawWhileRightHeld(event.nativeEvent, ports.inputRef.current.drag)) {
      ports.cancelActiveCanvasInteraction()
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
      ports.hideEyedropperMagnifier()
      event.preventDefault()
      event.stopPropagation()
      ports.updateCursor(event)
      return
    }
    const deviceTool = deviceTemporaryTool(event, ports.tabletPreferences)
    if (!ports.inputRef.current.temporaryRightClickAction) {
      if (deviceTool) ports.inputRef.current.setTemporaryTool(event.pointerId, deviceTool)
      else ports.inputRef.current.clearTemporaryTool(event.pointerId)
    }
    inputWaitRef.current?.record(runtimeEventStartTime(event.timeStamp), () => ({ documentId: ports.session.document.id, input: 'pointer-move', pointerType: event.pointerType }))
    measurePointerInput('pointer-move', () => ports.handlePointerMove(rightClickToolEvent(penEraserToolEvent(event, ports.tabletPreferences), ports.inputRef.current.temporaryRightClickAction)))
    ports.syncPenCursor(event)
  }

  const pointerUp = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    if (touchNavigation.up(event)) return
    if (event.pointerType === 'pen' && ports.tabletPreferences.api === 'disabled') return
    if (event.pointerType === 'pen' && ports.inputRef.current.auxiliaryMouseGestureActive()) return
    if (!ports.inputRef.current.acceptPointerDeviceEvent(event.nativeEvent)) return
    inputWaitRef.current?.record(runtimeEventStartTime(event.timeStamp), () => ({ documentId: ports.session.document.id, input: 'pointer-up', pointerType: event.pointerType }))
    try {
      measurePointerInput('pointer-up', () => ports.handlePointerUp(rightClickToolEvent(penEraserToolEvent(event, ports.tabletPreferences), ports.inputRef.current.temporaryRightClickAction)))
      ports.syncPenCursor(event)
    } finally {
      if (middlePenPointerRef.current === event.pointerId) middlePenPointerRef.current = null
      ports.inputRef.current.releasePointerDeviceEvent(event.nativeEvent)
      pressureAdapterRef.current.release(event.pointerId)
      ports.inputRef.current.clearTemporaryTool(event.pointerId)
      ports.inputRef.current.clearTemporaryEraser(event.pointerId)
    }
  }

  const pointerCancel = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    if (event.pointerType === 'pen' && ports.inputRef.current.auxiliaryMouseGestureActive()) return
    if (middlePenPointerRef.current === event.pointerId) middlePenPointerRef.current = null
    if (event.pointerType === 'touch') {
      if (touchNavigation.up(event, true)) return
    }
    ports.inputRef.current.clearTemporaryTool(event.pointerId)
    ports.inputRef.current.clearTemporaryEraser(event.pointerId)
    if (!ports.inputRef.current.acceptPointerDeviceEvent(event.nativeEvent)) {
      event.preventDefault()
      return
    }
    const pressurePointer = isPressurePointerType(event.pointerType) || pressureAdapterRef.current.isPressureCapable(event.pointerId)
    measurePointerInput('pointer-up', () => {
      if (canvasColorSamplingActiveFor(ports.canvasRef.current)) endCanvasColorSampling(event.pointerId)
      ports.cancelActiveCanvasInteraction()
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
      ports.hideEyedropperMagnifier()
      ports.updateCursor(event)
      // Cancellation can happen without a matching pointer-up (for example
      // when the middle-button capture is interrupted). Ensure the detached
      // brush-preview canvas is cleared in that path as well.
      ports.scheduleBrushPreviewOverlay()
      ports.inputRef.current.releasePointerDeviceEvent(event.nativeEvent)
      pressureAdapterRef.current.release(event.pointerId)
      if (pressurePointer) ports.hidePenCursor()
    })
    endCanvasToolGesture(event.pointerId)
  }

  const handlePointerLeave = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    if (canvasColorSamplingIntentActive() || canvasColorSamplingActiveFor(ports.canvasRef.current)) {
      event.currentTarget.style.cursor = canvasCursors.eyedropper
      return
    }
    const selectionCreationDrag =
      ports.inputRef.current.drag?.kind === 'marquee' || ports.inputRef.current.drag?.kind === 'lasso' || ports.inputRef.current.drag?.kind === 'polygon-lasso'
    if (selectionCreationDrag) {
      // Pointer capture keeps the selection gesture alive outside the canvas.
      // Do not clear the pointer used by the canvas cursor preview here; doing
      // so makes the cursor vanish until the pointer re-enters the canvas.
      event.currentTarget.style.cursor = selectionCreationCursor(ports.selectionCrosshair, ports.selectionInteractionEditable, true, ports.useLocalCursors)
      ports.draw()
      return
    }
    if (
      (ports.inputRef.current.drag?.kind === 'draw' ||
        ports.inputRef.current.drag?.kind === 'tile-draw' ||
        ports.inputRef.current.drag?.kind === 'move-content' ||
        ports.inputRef.current.drag?.kind === 'move-selection') &&
      (ports.liveViewRef.current.tileRepeatMode ?? 'off') !== 'off'
    ) {
      ports.updateCursor(event)
      ports.draw()
      return
    }
    ports.inputRef.current.pointer.visible = false
    ports.inputRef.current.resetPointerInteraction()
    wheelBrushSizePreviewRef.current = false
    ports.inputRef.current.altHeld = false
    ports.inputRef.current.ctrlHeld = false
    ports.inputRef.current.shiftHeld = false
    if (ports.quickEyedropperOriginalColorRef.current) ports.flushEyedropperSampleColor()
    ports.hideEyedropperMagnifier()
    ports.quickEyedropperOriginalColorRef.current = null
    ports.quickEyedropperSuppressedRef.current = false
    if (!ports.inputRef.current.drag)
      event.currentTarget.style.cursor = ports.canvasResizePreviewRef.current
        ? canvasCursors.unavailable
        : ports.inputRef.current.spaceHeld
          ? canvasCursors.grab
          : canvasToolCursor(
              ports.session.tool === 'selection' && ports.session.selectionKind === 'brush'
                ? 'pencil'
                : ports.session.tool,
              ports.session.primaryColor
            )
    if (ports.brushPreviewOverlaySupported(ports.session)) ports.scheduleBrushPreviewOverlay()
    else ports.draw()
  }

  const pointerLeave = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    if (event.pointerType === 'pen' && ports.inputRef.current.auxiliaryMouseGestureActive()) return
    if (!ports.inputRef.current.acceptPointerDeviceEvent(event.nativeEvent)) return
    const retainsOverlay = retainsCanvasCursorOverlayOnLeave(
      ports.inputRef.current.drag,
      ports.liveViewRef.current.tileRepeatMode ?? 'off'
    )
    handlePointerLeave(event)
    if (retainsOverlay) return
    ports.inputRef.current.releasePointerDeviceEvent(event.nativeEvent)
    pressureAdapterRef.current.release(event.pointerId)
    // Both pen cursors and the mouse auto-contrast cursor are stage overlays.
    // Once a normal hover leaves the canvas, keeping either overlay visible
    // leaves a stale cursor inside the surrounding view.
    ports.hidePenCursor()
  }

  const pointerEnter = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    if (!ports.inputRef.current.acceptPointerDeviceEvent(event.nativeEvent)) return
    const session = ports.liveInputSession()
    const navigationShortcutActive =
      session.animationPlaying || event.ctrlKey || event.metaKey || ports.inputRef.current.spaceHeld || isCanvasViewNavigationTool(session.tool)
    if (canvasColorSamplingIntentActive() && !navigationShortcutActive) {
      event.currentTarget.style.cursor = canvasCursors.eyedropper
      ports.draw()
      ports.syncPenCursor(event)
      return
    }
    ports.updateCursor(event)
    ports.inputRef.current.shiftLinePreview = ports.lineConnectionPreviewActive(event.nativeEvent)
    if (ports.brushPreviewOverlaySupported(session)) ports.scheduleBrushPreviewOverlay()
    else ports.draw()
    ports.syncPenCursor(event)
  }
  return { pressureAdapterRef, wheelBrushSizePreviewRef, pointerDown, pointerMove, pointerUp, pointerCancel, pointerLeave, pointerEnter }
}
