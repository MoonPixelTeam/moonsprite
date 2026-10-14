import { CANVAS_VIEWPORT_EVENT } from './canvas-viewport-events'
import { isWorkspaceResizing, onWorkspaceResizeEnd, recordWorkspaceResizeStage } from './workspace-resize'
import { useEffect, useRef } from 'react'
import { measureRuntimeDiagnostic, runtimeDiagnosticsActive } from '@/core/runtime-diagnostics'
import { createRuntimeLatencyReporter } from '@/core/runtime-diagnostic-stages'
import { useWorkspace, type DocumentSession } from '@/store/workspace'
import {
  preserveViewOnViewportChange,
  type ViewportPlacement,
  clampCanvasViewPan,
  documentPointFromViewportPoint,
  documentPointFromViewportPointContinuous,
  mirrorViewportPoint,
  rotateViewportPoint,
  rotationIndicatorFitsCanvas,
  unrotatedViewportPoint,
  unrotateViewportPoint,
  viewCanvasOrigin,
  viewRotationPivot
} from '@/core/view-geometry'
import { deviceAlignedCanvasPlacement, deviceAlignedRepeatedPointAtViewport } from '@/core/canvas-render-plan'
import {
  canvasBackingRatioForInterfaceScale,
  canvasClientDeltaForInterfaceScale,
  canvasViewportPointForInterfaceScale,
  canvasViewportPointToCss,
  canvasViewportSizeForInterfaceScale
} from '@/core/canvas-interface-scale'
import { transformedSelectionBounds } from '@/core/selection'
import { CanvasInputState, canvasGestureForPreview, type CanvasPoint as Point } from '@/core/canvas-input'
import { selectionScreenPoint } from '@/components/canvas-selection-renderer'
import { canvasDisplayDeviceScale } from '@/components/canvas-display-size'
import { pixelSamplingMode } from '@/core/pixel-display'
import { tileRepeatMappedPointForCopies } from '@/core/tilemap'
interface Ports {
  readonly interfaceScale: import('@/core/file-preferences').UiScale
  readonly stageRef: import('react').RefObject<HTMLDivElement | null>
  readonly canvasRef: import('react').RefObject<HTMLCanvasElement | null>
  readonly storedSession: DocumentSession
  readonly inputRef: import('react').RefObject<CanvasInputState>
  readonly rotationIndicatorPosition: import('@/core/file-preferences').RotationIndicatorPosition
  readonly liveViewRef: import('react').RefObject<import('@shared/types-view').ViewState>
  readonly session: DocumentSession
  readonly pendingViewRef: import('react').RefObject<Partial<import('@shared/types-view').ViewState> | null>
  readonly scheduleDraw: () => void
  readonly drawNow: () => void
}

export function useCanvasViewportGeometry(ports: Ports) {
  const rotationIndicatorRef = useRef<HTMLDivElement>(null)

  const rotationPointerRef = useRef<HTMLDivElement>(null)

  const rotationIndicatorAnchorRef = useRef<Point | null>(null)

  const stageSizeRef = useRef({ width: 0, height: 0 })

  const stageDisplaySizeRef = useRef({ width: 0, height: 0 })

  const stageSizeScaleRef = useRef(ports.interfaceScale)

  const stageBounds = (): DOMRect => ports.stageRef.current?.getBoundingClientRect() ?? ports.canvasRef.current?.getBoundingClientRect() ?? new DOMRect()

  const cacheStageDisplaySize = (width: number, height: number): { width: number; height: number } => {
    const displaySize = { width: Math.max(0, width), height: Math.max(0, height) }
    stageDisplaySizeRef.current = displaySize
    stageSizeRef.current = canvasViewportSizeForInterfaceScale(displaySize.width, displaySize.height, ports.interfaceScale)
    stageSizeScaleRef.current = ports.interfaceScale
    return stageSizeRef.current
  }

  const stageDisplaySize = (): { width: number; height: number } => {
    const cached = stageDisplaySizeRef.current
    if (cached.width > 0 && cached.height > 0 && stageSizeScaleRef.current === ports.interfaceScale) return cached
    const bounds = stageBounds()
    cacheStageDisplaySize(bounds.width, bounds.height)
    return stageDisplaySizeRef.current
  }

  const stageSize = (): { width: number; height: number } => {
    const cached = stageSizeRef.current
    if (cached.width > 0 && cached.height > 0 && stageSizeScaleRef.current === ports.interfaceScale) return cached
    const bounds = stageBounds()
    return cacheStageDisplaySize(bounds.width, bounds.height)
  }

  const stagePoint = (clientX: number, clientY: number): Point => {
    const bounds = stageBounds()
    return canvasViewportPointForInterfaceScale(clientX, clientY, bounds.left, bounds.top, ports.interfaceScale)
  }

  const constrainCanvasView = (view: DocumentSession['view'], size = stageSize()): DocumentSession['view'] => {
    const currentSession = useWorkspace.getState().sessions.find((item) => item.document.id === ports.storedSession.document.id) ?? ports.storedSession
    const activeDrag = canvasGestureForPreview(ports.inputRef.current.drag)
    const floatingDrag = activeDrag?.floatingPaste && activeDrag.previewTarget ? activeDrag : null
    const floatingPaste = currentSession.pendingPaste
    const floatingBounds = floatingDrag
      ? transformedSelectionBounds(
          floatingDrag.previewTarget!,
          floatingDrag.previewAngle ?? floatingDrag.startAngle ?? 0,
          floatingDrag.previewShear ?? floatingDrag.transformStartShear
        )
      : floatingPaste
        ? transformedSelectionBounds(floatingPaste.transformTarget ?? floatingPaste.target, floatingPaste.transformAngle ?? 0, floatingPaste.transformShear)
        : undefined
    return clampCanvasViewPan(
      size.width,
      size.height,
      currentSession.document.width,
      currentSession.document.height,
      view,
      ports.rotationIndicatorPosition,
      floatingBounds
    )
  }

  const applyViewRotation = (context: CanvasRenderingContext2D, width: number, height: number, view: DocumentSession['view']): void => {
    if (Math.abs(view.rotation) < 0.000001 && !view.mirrored && !view.mirroredVertical) return
    const pivot = viewRotationPivot(width, height, view.panX, view.panY, ports.rotationIndicatorPosition)
    context.translate(pivot.x, pivot.y)
    context.rotate((view.rotation * Math.PI) / 180)
    context.scale(view.mirrored ? -1 : 1, view.mirroredVertical ? -1 : 1)
    context.translate(-pivot.x, -pivot.y)
  }

  const updateRotationIndicator = (rotation: number, visible: boolean): void => {
    const indicator = rotationIndicatorRef.current
    const pointerElement = rotationPointerRef.current
    if (!indicator || !pointerElement) return
    const size = stageSize()
    const indicatorCenter =
      ports.rotationIndicatorPosition !== 'canvas' && rotationIndicatorAnchorRef.current
        ? rotationIndicatorAnchorRef.current
        : viewRotationPivot(size.width, size.height, ports.liveViewRef.current.panX, ports.liveViewRef.current.panY, ports.rotationIndicatorPosition)
    const cssCenter = canvasViewportPointToCss(indicatorCenter, ports.interfaceScale)
    indicator.hidden = !visible || !rotationIndicatorFitsCanvas(ports.session.document.width, ports.session.document.height, ports.liveViewRef.current.zoom)
    indicator.style.left = `${cssCenter.x}px`
    indicator.style.top = `${cssCenter.y}px`
    pointerElement.style.transform = `rotate(${rotation}deg)`
    if (!visible) rotationIndicatorAnchorRef.current = null
  }

  const displayedSelectionPoint = (point: Point): Point => {
    const size = stageSize()
    const view = ports.liveViewRef.current
    const pivot = viewRotationPivot(size.width, size.height, view.panX, view.panY, ports.rotationIndicatorPosition)
    const untransformed = selectionScreenPoint(size.width, size.height, ports.session.document.width, ports.session.document.height, view, point)
    const mirrored = mirrorViewportPoint(untransformed, pivot, Boolean(view.mirrored), Boolean(view.mirroredVertical))
    return rotateViewportPoint(mirrored, pivot, view.rotation)
  }

  useEffect(() => {
    let placement: ViewportPlacement | null = null
    let layoutViewPending = false
    let resizeFrame: number | null = null
    const observerReports = createRuntimeLatencyReporter('canvas.viewport.observer', 0, 'notification-count')
    const syncViewport = (): void => {
      const state = useWorkspace.getState()
      const current = state.sessions.find((item) => item.document.id === ports.session.document.id)
      if (!current) return
      const size = stageSizeRef.current
      const view = { ...ports.liveViewRef.current }
      if (current.viewportSize.width !== size.width || current.viewportSize.height !== size.height) {
        state.setViewportSizeForDocument(ports.session.document.id, size)
      }
      if (current.view.panX !== view.panX || current.view.panY !== view.panY) {
        state.setViewForDocument(ports.session.document.id, { panX: view.panX, panY: view.panY })
      }
      if (layoutViewPending) {
        ports.pendingViewRef.current = null
        layoutViewPending = false
      }
    }
    const updateSize = (bounds: DOMRectReadOnly): boolean => {
      if (bounds.width <= 0 || bounds.height <= 0) return false
      const size = cacheStageDisplaySize(bounds.width, bounds.height)
      const next: ViewportPlacement = {
        left: canvasClientDeltaForInterfaceScale(bounds.left, ports.interfaceScale),
        top: canvasClientDeltaForInterfaceScale(bounds.top, ports.interfaceScale),
        width: size.width,
        height: size.height
      }
      if (placement && placement.left === next.left && placement.top === next.top &&
        placement.width === next.width && placement.height === next.height) return false
      if (placement) {
        ports.liveViewRef.current = preserveViewOnViewportChange(ports.liveViewRef.current, placement, next, ports.rotationIndicatorPosition)
        // Survive unrelated React updates during a dock gesture (e.g. playback).
        // The shared view hook consumes this pending view until it is published.
        ports.pendingViewRef.current = { ...ports.liveViewRef.current }
        layoutViewPending = true
      }
      placement = next
      window.dispatchEvent(new CustomEvent(CANVAS_VIEWPORT_EVENT, { detail: { documentId: ports.session.document.id, width: size.width, height: size.height, view: { ...ports.liveViewRef.current } } }))
      // Local geometry remains live. Publish once when the layout gesture ends
      // instead of notifying all document/store subscribers on every resize.
      return true
    }
    const stopListening = onWorkspaceResizeEnd(() => {
      const bounds = ports.stageRef.current?.getBoundingClientRect()
      if (bounds) updateSize(bounds)
      syncViewport()
      ports.drawNow()
    })
    const observer = new ResizeObserver((entries) => {
      const deliveredAt = runtimeDiagnosticsActive() ? performance.now() : null
      observerReports.record(deliveredAt, () => ({ documentId: ports.session.document.id, observer: 'canvas-stage', pendingFrame: resizeFrame !== null }))
      if (!entries.length || ports.stageRef.current?.dataset.canvasResizeFrozen === 'true') return
      // ResizeObserver runs before paint. Correct the backing surface now, so
      // the browser cannot paint the old canvas stretched into the new layout.
      const started = isWorkspaceResizing() ? performance.now() : 0
      const bounds = ports.stageRef.current?.getBoundingClientRect()
      if (!bounds || !updateSize(bounds)) return
      ports.drawNow()
      if (started) recordWorkspaceResizeStage('observer', performance.now() - started)
      if (resizeFrame !== null) return
      // Only Store publication is deferred; it can trigger React layout work.
      resizeFrame = window.requestAnimationFrame(() => measureRuntimeDiagnostic('canvas.viewport.update', () => {
        resizeFrame = null
        if (ports.stageRef.current?.dataset.canvasResizeFrozen === 'true') return
        if (!isWorkspaceResizing()) syncViewport()
      }, () => ({ documentId: ports.session.document.id, observer: 'canvas-stage', width: stageSizeRef.current.width, height: stageSizeRef.current.height })))
    })
    if (ports.stageRef.current) {
      const bounds = ports.stageRef.current.getBoundingClientRect()
      updateSize(bounds)
      if (!isWorkspaceResizing()) syncViewport()
      observer.observe(ports.stageRef.current)
    }
    return () => {
      observer.disconnect()
      observerReports.flush()
      if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame)
      stopListening()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ports.interfaceScale, ports.session.document.id, ports.rotationIndicatorPosition])

  const unrotatedStagePoint = (clientX: number, clientY: number): Point => {
    const size = stageSize()
    const view = ports.liveViewRef.current
    const pivot = viewRotationPivot(size.width, size.height, view.panX, view.panY, ports.rotationIndicatorPosition)
    return unrotateViewportPoint(stagePoint(clientX, clientY), pivot, view.rotation)
  }

  const repeatedDocumentPointsAt = (
    clientX: number,
    clientY: number,
    continuous = false,
    allowOutsideCopies = false
  ): { local: Point; repeated: Point; offset: { x: number; y: number } } | null => {
    if (!ports.canvasRef.current) return null
    const size = stageSize()
    const viewportPoint = stagePoint(clientX, clientY)
    let repeated = continuous
      ? documentPointFromViewportPointContinuous(
          viewportPoint,
          size.width,
          size.height,
          ports.session.document.width,
          ports.session.document.height,
          ports.liveViewRef.current,
          ports.rotationIndicatorPosition
        )
      : documentPointFromViewportPoint(
          viewportPoint,
          size.width,
          size.height,
          ports.session.document.width,
          ports.session.document.height,
          ports.liveViewRef.current,
          ports.rotationIndicatorPosition
        )
    if (pixelSamplingMode(ports.liveViewRef.current.zoom) === 'hard') {
      const origin = viewCanvasOrigin(size.width, size.height, ports.session.document.width, ports.session.document.height, ports.liveViewRef.current)
      const deviceScale = canvasDisplayDeviceScale(
        ports.canvasRef.current,
        canvasBackingRatioForInterfaceScale(window.devicePixelRatio || 1, ports.interfaceScale)
      )
      // Use the displayed point directly after undoing rotation/mirroring.
      // Converting through document coordinates and multiplying by zoom again
      // can cross an exact device-pixel tie at high zoom due to floating-point
      // round trips, making the brush preview land one row below the pointer.
      const unrotatedPoint = unrotatedViewportPoint(viewportPoint, size.width, size.height, ports.liveViewRef.current, ports.rotationIndicatorPosition)
      const alignedCanvas = deviceAlignedCanvasPlacement(
        origin.x,
        origin.y,
        ports.session.document.width * ports.liveViewRef.current.zoom,
        ports.session.document.height * ports.liveViewRef.current.zoom,
        deviceScale
      )
      repeated = deviceAlignedRepeatedPointAtViewport(unrotatedPoint, alignedCanvas,
        ports.session.document.width, ports.session.document.height, ports.liveViewRef.current.zoom,
        deviceScale, ports.liveViewRef.current.tileRepeatMode, continuous)
    }
    const mapped = tileRepeatMappedPointForCopies(
      repeated,
      ports.session.document.width,
      ports.session.document.height,
      ports.liveViewRef.current.tileRepeatMode ?? 'off',
      allowOutsideCopies
    )
    return mapped ? { local: mapped.local, repeated, offset: mapped.offset } : null
  }

  const localPointAt = (clientX: number, clientY: number, allowOutsideCopies = false): Point | null =>
    repeatedDocumentPointsAt(clientX, clientY, false, allowOutsideCopies)?.local ?? null

  const tileRepeatPointAt = (clientX: number, clientY: number): Point | null => repeatedDocumentPointsAt(clientX, clientY)?.repeated ?? null

  const localPoint = (event: React.PointerEvent<HTMLCanvasElement>, allowOutsideCopies = false): Point | null =>
    localPointAt(event.clientX, event.clientY, allowOutsideCopies)

  const localContinuousPointAt = (clientX: number, clientY: number): Point | null => {
    return repeatedDocumentPointsAt(clientX, clientY, true)?.local ?? null
  }
  return {
    rotationIndicatorRef,
    rotationPointerRef,
    rotationIndicatorAnchorRef,
    stageBounds,
    stageDisplaySize,
    stageSize,
    stagePoint,
    constrainCanvasView,
    applyViewRotation,
    updateRotationIndicator,
    displayedSelectionPoint,
    unrotatedStagePoint,
    repeatedDocumentPointsAt,
    localPointAt,
    tileRepeatPointAt,
    localPoint,
    localContinuousPointAt
  }
}
