import { useEffect, useRef } from 'react'
import type { ViewState } from '@shared/types'
import type { CanvasPoint as Point } from '@/core/canvas-input'
import { useWorkspace } from '@/store/workspace'
import { notifyViewPreview, registerViewPreviewFlusher } from '@/core/view-preview-lifecycle'

interface CanvasViewPreviewOptions {
  documentId: string
  sessionView: ViewState
  activeViewDrag: boolean
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  selectionCanvasRef: React.RefObject<HTMLCanvasElement | null>
  drawRef: React.RefObject<() => void>
  requestDrawRef: React.RefObject<() => void>
}

export function useCanvasViewPreview({ documentId, sessionView, activeViewDrag, canvasRef, selectionCanvasRef, drawRef, requestDrawRef }: CanvasViewPreviewOptions) {
  const pendingViewRef = useRef<Partial<ViewState> | null>(null)
  const liveViewRef = useRef(sessionView)
  const viewFrameRef = useRef<number | null>(null)
  const zoomPreviewStartRef = useRef<ViewState | null>(null)
  const zoomCommitTimerRef = useRef<number | null>(null)
  const panPreviewFrameRef = useRef<number | null>(null)
  const pendingPanPreviewOffsetRef = useRef<Point | null>(null)
  const appliedRotationStyleRef = useRef('')
  const flushPreviewRef = useRef<() => void>(() => {})

  if (!activeViewDrag) liveViewRef.current = { ...sessionView, ...pendingViewRef.current }

  const applyRotationStyle = (_view: ViewState): void => {
    const styleKey = 'internal-canvas-rotation'
    if (appliedRotationStyleRef.current === styleKey) return
    appliedRotationStyleRef.current = styleKey
    for (const canvas of [canvasRef.current, selectionCanvasRef.current]) {
      if (!canvas) continue
      canvas.style.transform = 'none'
      canvas.style.transformOrigin = '50% 50%'
      canvas.style.willChange = ''
    }
  }

  const finishZoomPreview = (): ViewState => {
    const view = { ...liveViewRef.current }
    if (!zoomPreviewStartRef.current) return view
    const needsFinalDraw = viewFrameRef.current !== null
    if (viewFrameRef.current !== null) window.cancelAnimationFrame(viewFrameRef.current)
    if (zoomCommitTimerRef.current !== null) window.clearTimeout(zoomCommitTimerRef.current)
    viewFrameRef.current = null
    zoomCommitTimerRef.current = null
    zoomPreviewStartRef.current = null
    liveViewRef.current = view
    applyRotationStyle(view)
    useWorkspace.getState().setViewForDocument(documentId, { zoom: view.zoom, panX: view.panX, panY: view.panY })
    pendingViewRef.current = null
    if (needsFinalDraw) drawRef.current()
    return view
  }

  const scheduleZoomPreview = (next: ViewState): void => {
    if (!zoomPreviewStartRef.current) zoomPreviewStartRef.current = { ...liveViewRef.current }
    liveViewRef.current = next
    pendingViewRef.current = next
    if (viewFrameRef.current === null) {
      viewFrameRef.current = window.requestAnimationFrame(() => {
        viewFrameRef.current = null
        if (!zoomPreviewStartRef.current) return
        applyRotationStyle(liveViewRef.current)
        drawRef.current()
        notifyViewPreview(documentId, liveViewRef.current)
      })
    }
    if (zoomCommitTimerRef.current !== null) window.clearTimeout(zoomCommitTimerRef.current)
    zoomCommitTimerRef.current = window.setTimeout(finishZoomPreview, 120)
  }

  const beginPanPreview = (): void => {
    if (zoomPreviewStartRef.current) finishZoomPreview()
    pendingPanPreviewOffsetRef.current = null
  }

  const schedulePanPreview = (panX: number, panY: number, startPan: Point): void => {
    liveViewRef.current = { ...liveViewRef.current, panX, panY }
    pendingViewRef.current = { ...liveViewRef.current }
    pendingPanPreviewOffsetRef.current = { x: panX - startPan.x, y: panY - startPan.y }
    // Frame changes and navigation share the CanvasStage scheduler. Using a
    // second draw request here can render the same expensive animation frame
    // twice in one display interval when its playback timer fires mid-pan.
    requestDrawRef.current()
    if (panPreviewFrameRef.current !== null) return
    panPreviewFrameRef.current = window.requestAnimationFrame(() => {
      panPreviewFrameRef.current = null
      const pending = pendingPanPreviewOffsetRef.current
      pendingPanPreviewOffsetRef.current = null
      if (pending) notifyViewPreview(documentId, liveViewRef.current)
    })
  }

  const finishPanPreview = (): ViewState => {
    const view = { ...liveViewRef.current }
    if (panPreviewFrameRef.current !== null) window.cancelAnimationFrame(panPreviewFrameRef.current)
    panPreviewFrameRef.current = null
    pendingPanPreviewOffsetRef.current = null
    applyRotationStyle(view)
    useWorkspace.getState().setViewForDocument(documentId, { panX: view.panX, panY: view.panY })
    pendingViewRef.current = null
    return view
  }

  flushPreviewRef.current = () => {
    if (zoomPreviewStartRef.current) finishZoomPreview()
    else if (pendingViewRef.current) finishPanPreview()
  }

  const cancelViewPreviews = (): void => {
    if (viewFrameRef.current !== null) window.cancelAnimationFrame(viewFrameRef.current)
    if (zoomCommitTimerRef.current !== null) window.clearTimeout(zoomCommitTimerRef.current)
    if (panPreviewFrameRef.current !== null) window.cancelAnimationFrame(panPreviewFrameRef.current)
    viewFrameRef.current = null
    zoomCommitTimerRef.current = null
    zoomPreviewStartRef.current = null
    panPreviewFrameRef.current = null
    pendingPanPreviewOffsetRef.current = null
    pendingViewRef.current = null
  }

  useEffect(() => {
    const unregister = registerViewPreviewFlusher(documentId, () => flushPreviewRef.current())
    return () => {
      unregister()
      cancelViewPreviews()
    }
  // The refs owned by this hook survive ordinary redraws. Only a document
  // switch or unmount may discard its pending view preview.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId])

  return {
    pendingViewRef,
    liveViewRef,
    zoomPreviewStartRef,
    applyRotationStyle,
    finishZoomPreview,
    scheduleZoomPreview,
    beginPanPreview,
    schedulePanPreview,
    finishPanPreview,
    cancelViewPreviews
  }
}
