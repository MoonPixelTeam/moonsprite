import { CANVAS_VIEWPORT_EVENT, type CanvasViewportDetail } from './canvas-viewport-events'
import { useEffect, useState } from 'react'
import type { ViewState } from '@shared/types-view'
import type { RotationIndicatorPosition } from '@/core/file-preferences'
import { canvasViewScrollbarMetrics, panCanvasViewFromScrollbar } from '@/core/view-geometry'
import { registerViewPreviewListener } from '@/core/view-preview-lifecycle'
import { useWorkspace } from '@/store/workspace'

/** Must stay aligned with --stage-view-scrollbar-thickness in styles.css. */
export const CANVAS_VIEW_SCROLLBAR_THICKNESS = 10

interface CanvasViewScrollbarOptions {
  documentId: string
  documentWidth: number
  documentHeight: number
  viewportWidth: number
  viewportHeight: number
  view: ViewState
  rotationIndicatorPosition: RotationIndicatorPosition
}

const viewKey = (view: ViewState): string => [view.zoom, view.panX, view.panY, view.rotation, view.mirrored, view.mirroredVertical].join(':')

export function useCanvasViewScrollbars(options: CanvasViewScrollbarOptions) {
  const [layout, setLayout] = useState<CanvasViewportDetail | null>(null)
  useEffect(() => {
    const update = (event: Event) => {
      const detail = (event as CustomEvent<CanvasViewportDetail>).detail
      if (detail.documentId === options.documentId) { setLayout(detail); setPreview(null) }
    }
    window.addEventListener(CANVAS_VIEWPORT_EVENT, update)
    return () => window.removeEventListener(CANVAS_VIEWPORT_EVENT, update)
  }, [options.documentId])
  useEffect(() => setLayout(null), [options.documentId, options.viewportWidth, options.viewportHeight, options.view])
  const viewportWidth = layout?.width ?? options.viewportWidth
  const viewportHeight = layout?.height ?? options.viewportHeight
  const storedViewKey = viewKey(options.view)
  const [preview, setPreview] = useState<{ documentId: string; baseKey: string; view: ViewState } | null>(null)
  const activeView = preview?.documentId === options.documentId && preview.baseKey === storedViewKey ? preview.view : layout?.view ?? options.view
  const metrics = canvasViewScrollbarMetrics(
    viewportWidth,
    viewportHeight,
    options.documentWidth,
    options.documentHeight,
    activeView,
    options.rotationIndicatorPosition
  )

  useEffect(() => registerViewPreviewListener(options.documentId, (nextView) => {
    setPreview({ documentId: options.documentId, baseKey: storedViewKey, view: nextView })
  }), [options.documentId, storedViewKey])

  const scroll = (axis: 'horizontal' | 'vertical', position: number): void => {
    const currentPosition = axis === 'horizontal' ? metrics.horizontal.position : metrics.vertical.position
    if (Math.abs(position - currentPosition) < 0.0005) return
    const next = panCanvasViewFromScrollbar(
      viewportWidth,
      viewportHeight,
      options.documentWidth,
      options.documentHeight,
      activeView,
      options.rotationIndicatorPosition,
      axis,
      position
    )
    useWorkspace.getState().setViewForDocument(options.documentId, { panX: next.panX, panY: next.panY })
  }

  return {
    horizontal: { ...metrics.horizontal, onChange: (position: number) => scroll('horizontal', position) },
    vertical: { ...metrics.vertical, onChange: (position: number) => scroll('vertical', position) }
  }
}
