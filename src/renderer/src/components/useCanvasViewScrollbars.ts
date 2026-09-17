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
  const storedViewKey = viewKey(options.view)
  const [preview, setPreview] = useState<{ baseKey: string; view: ViewState } | null>(null)
  const activeView = preview?.baseKey === storedViewKey ? preview.view : options.view
  const metrics = canvasViewScrollbarMetrics(
    options.viewportWidth,
    options.viewportHeight,
    options.documentWidth,
    options.documentHeight,
    activeView,
    options.rotationIndicatorPosition
  )

  useEffect(() => registerViewPreviewListener(options.documentId, (nextView) => {
    setPreview({ baseKey: storedViewKey, view: nextView })
  }), [options.documentId, storedViewKey])

  const scroll = (axis: 'horizontal' | 'vertical', position: number): void => {
    const currentPosition = axis === 'horizontal' ? metrics.horizontal.position : metrics.vertical.position
    if (Math.abs(position - currentPosition) < 0.0005) return
    const next = panCanvasViewFromScrollbar(
      options.viewportWidth,
      options.viewportHeight,
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
