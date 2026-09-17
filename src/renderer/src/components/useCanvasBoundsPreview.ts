import { useEffect, useRef } from 'react'
import type { SelectionRect } from '@shared/types-selection'
import { useWorkspace, type DocumentSession } from '@/store/workspace'
import { CANVAS_RESIZE_PREVIEW_EVENT } from '@/core/canvas-resize-preview'
import { SLICE_PREVIEW_EVENT } from '@/core/slice-preview'
import { type CanvasDragState as DragState, type CanvasPoint as Point } from '@/core/canvas-input'
interface Ports {
  readonly session: DocumentSession
  readonly scheduleDraw: () => void
  readonly canvasRef: import('react').RefObject<HTMLCanvasElement | null>
  readonly stageSize: () => {
    width: number
    height: number
  }
  readonly liveViewRef: import('react').RefObject<import('@shared/types-view').ViewState>
  readonly unrotatedStagePoint: (clientX: number, clientY: number) => Point
}

export function useCanvasBoundsPreview(ports: Ports) {
  const canvasResizePreviewRef = useRef(ports.session.canvasResizePreview)

  const autoSlicePreviewRef = useRef<SelectionRect[] | null>(null)

  const pendingCanvasResizeRef = useRef<DocumentSession['canvasResizePreview']>(null)

  const canvasResizeFrameRef = useRef<number | null>(null)

  canvasResizePreviewRef.current = ports.session.canvasResizePreview

  useEffect(() => {
    const updatePreview = (event: Event): void => {
      const detail = (event as CustomEvent<{ documentId: string; slices: SelectionRect[] | null }>).detail
      if (detail.documentId !== ports.session.document.id) return
      autoSlicePreviewRef.current = detail.slices?.map((slice) => ({ ...slice })) ?? null
      ports.scheduleDraw()
    }
    window.addEventListener(SLICE_PREVIEW_EVENT, updatePreview)
    return () => {
      window.removeEventListener(SLICE_PREVIEW_EVENT, updatePreview)
      autoSlicePreviewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ports.session.document.id])

  useEffect(() => {
    const updatePreview = (event: Event): void => {
      const detail = (event as CustomEvent<{ documentId: string; preview: DocumentSession['canvasResizePreview'] }>).detail
      if (detail.documentId !== ports.session.document.id) return
      canvasResizePreviewRef.current = detail.preview ? { ...detail.preview } : null
      ports.scheduleDraw()
    }
    window.addEventListener(CANVAS_RESIZE_PREVIEW_EVENT, updatePreview)
    return () => window.removeEventListener(CANVAS_RESIZE_PREVIEW_EVENT, updatePreview)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ports.session.document.id])

  const flushCanvasResizePreview = (): void => {
    if (canvasResizeFrameRef.current !== null) {
      window.cancelAnimationFrame(canvasResizeFrameRef.current)
      canvasResizeFrameRef.current = null
    }
    const pending = pendingCanvasResizeRef.current
    pendingCanvasResizeRef.current = null
    if (pending) useWorkspace.getState().setCanvasResizePreview(pending)
  }

  const scheduleCanvasResizePreview = (preview: NonNullable<DocumentSession['canvasResizePreview']>): void => {
    pendingCanvasResizeRef.current = preview
    canvasResizePreviewRef.current = preview
    ports.scheduleDraw()
    if (canvasResizeFrameRef.current !== null) return
    canvasResizeFrameRef.current = window.requestAnimationFrame(() => {
      canvasResizeFrameRef.current = null
      const pending = pendingCanvasResizeRef.current
      pendingCanvasResizeRef.current = null
      if (pending) useWorkspace.getState().setCanvasResizePreview(pending)
    })
  }

  const canvasResizeHitAt = (clientX: number, clientY: number): DragState['canvasEdge'] | null => {
    const preview = canvasResizePreviewRef.current
    const canvas = ports.canvasRef.current
    if (!preview || !canvas) return null
    const size = ports.stageSize()
    const view = ports.liveViewRef.current
    const originX = size.width / 2 + view.panX - (ports.session.document.width * view.zoom) / 2
    const originY = size.height / 2 + view.panY - (ports.session.document.height * view.zoom) / 2
    const left = originX - preview.offsetX * view.zoom
    const top = originY - preview.offsetY * view.zoom
    const right = left + preview.width * view.zoom
    const bottom = top + preview.height * view.zoom
    const unrotated = ports.unrotatedStagePoint(clientX, clientY)
    const x = unrotated.x
    const y = unrotated.y
    const radius = 8
    const nearLeft = Math.abs(x - left) <= radius
    const nearRight = Math.abs(x - right) <= radius
    const nearTop = Math.abs(y - top) <= radius
    const nearBottom = Math.abs(y - bottom) <= radius
    if (nearTop && nearLeft) return 'nw'
    if (nearTop && nearRight) return 'ne'
    if (nearBottom && nearLeft) return 'sw'
    if (nearBottom && nearRight) return 'se'
    if (nearTop && x >= left && x <= right) return 'n'
    if (nearBottom && x >= left && x <= right) return 's'
    if (nearLeft && y >= top && y <= bottom) return 'w'
    if (nearRight && y >= top && y <= bottom) return 'e'
    return null
  }

  const canvasResizeHit = (event: React.PointerEvent<HTMLCanvasElement>): DragState['canvasEdge'] | null => canvasResizeHitAt(event.clientX, event.clientY)

  const canvasResizeContainsAt = (clientX: number, clientY: number): boolean => {
    const preview = canvasResizePreviewRef.current
    const canvas = ports.canvasRef.current
    if (!preview || !canvas) return false
    const size = ports.stageSize()
    const view = ports.liveViewRef.current
    const originX = size.width / 2 + view.panX - (ports.session.document.width * view.zoom) / 2
    const originY = size.height / 2 + view.panY - (ports.session.document.height * view.zoom) / 2
    const left = originX - preview.offsetX * view.zoom
    const top = originY - preview.offsetY * view.zoom
    const unrotated = ports.unrotatedStagePoint(clientX, clientY)
    const x = unrotated.x
    const y = unrotated.y
    return x >= left && x <= left + preview.width * view.zoom && y >= top && y <= top + preview.height * view.zoom
  }

  const canvasResizeContains = (event: React.PointerEvent<HTMLCanvasElement>): boolean => canvasResizeContainsAt(event.clientX, event.clientY)
  return {
    canvasResizePreviewRef,
    autoSlicePreviewRef,
    pendingCanvasResizeRef,
    canvasResizeFrameRef,
    flushCanvasResizePreview,
    scheduleCanvasResizePreview,
    canvasResizeHitAt,
    canvasResizeHit,
    canvasResizeContainsAt,
    canvasResizeContains
  }
}
