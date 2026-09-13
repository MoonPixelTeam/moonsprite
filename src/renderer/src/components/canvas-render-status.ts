import type { RgbaColor } from '@shared/types-color'
import { readLayerMaskDisplayColorAt } from '@/core/document-model'
import { blendOver, relativeLuminanceColor } from '@/core/raster'
import { documentPointFromViewportPoint } from '@/core/view-geometry'
import { drawingSizePreviewTargetForDrag } from '@/core/canvas-input'
import { canvasStatusTextColor, transparencyColorAt } from '@/core/canvas-visuals'
import { publishSelectionSizePreview } from '@/components/selection-size-preview-events'
import type * as React from 'react'
import type { DocumentSession } from '@/store/workspace-types'
export function renderCanvasStatus({
  rect,
  document,
  view,
  rotationIndicatorPosition,
  isolatedLayerMask,
  compositePointSampler,
  checkerboard,
  displayContext,
  activeTheme,
  inputRef,
  currentSession,
  publishedSelectionSizePreviewRef,
  session,
  t,
  drawSelectionOverlay,
  brushPreviewDrawRef
}: {
  rect: {
    width: number
    height: number
  }
  document: import('@shared/types-document').SpriteDocument
  view: import('@shared/types-view').ViewState
  rotationIndicatorPosition: import('@/core/file-preferences').RotationIndicatorPosition
  isolatedLayerMask: import('@shared/types-layer').LayerMask | null
  compositePointSampler: (x: number, y: number) => RgbaColor
  checkerboard: import('@/core/file-preferences').CheckerboardPreferences
  displayContext: CanvasRenderingContext2D
  activeTheme: import('@/core/theme').ResolvedTheme
  inputRef: React.RefObject<import('@/core/canvas-input').CanvasInputState>
  currentSession: DocumentSession
  publishedSelectionSizePreviewRef: React.RefObject<{
    width: number
    height: number
  } | null>
  session: DocumentSession
  t: (key: import('@/locales/contracts').TranslationKey, params?: import('@/locales/contracts').TranslationParams) => string
  drawSelectionOverlay: () => void
  brushPreviewDrawRef: React.RefObject<() => void>
}) {
  const statusBackgroundAt = (viewportX: number, viewportY: number): RgbaColor => {
    const point = documentPointFromViewportPoint(
      { x: viewportX, y: viewportY },
      rect.width,
      rect.height,
      document.width,
      document.height,
      view,
      rotationIndicatorPosition
    )
    if (point.x < 0 || point.y < 0 || point.x >= document.width || point.y >= document.height) return { r: 74, g: 74, b: 81, a: 255 }
    const sampled = isolatedLayerMask ? readLayerMaskDisplayColorAt(isolatedLayerMask, point.x, point.y) : compositePointSampler(point.x, point.y)
    const background = sampled.a < 255 ? blendOver(transparencyColorAt(point.x, point.y, checkerboard), sampled) : sampled
    return view.relativeLuminance ? relativeLuminanceColor(background) : background
  }
  const statusBackgrounds = [statusBackgroundAt(72, rect.height - 16)]
  if (view.mirrored || view.mirroredVertical) statusBackgrounds.push(statusBackgroundAt(92, rect.height - 34))
  displayContext.fillStyle = canvasStatusTextColor(
    statusBackgrounds,
    activeTheme.variables['--theme-selection-outline-dark'],
    activeTheme.variables['--theme-selection-outline-light']
  )
  displayContext.font = '12px ui-monospace, SFMono-Regular, Consolas, monospace'
  const selectionSizeTarget = drawingSizePreviewTargetForDrag(inputRef.current.drag, currentSession.shapeRatio)
  const selectionSizePreview = selectionSizeTarget
    ? { width: Math.max(1, Math.round(selectionSizeTarget.width)), height: Math.max(1, Math.round(selectionSizeTarget.height)) }
    : null
  const previousSelectionSizePreview = publishedSelectionSizePreviewRef.current
  if (previousSelectionSizePreview?.width !== selectionSizePreview?.width || previousSelectionSizePreview?.height !== selectionSizePreview?.height) {
    publishedSelectionSizePreviewRef.current = selectionSizePreview
    publishSelectionSizePreview({ documentId: session.document.id, size: selectionSizePreview })
  }
  displayContext.fillText(`${document.width} x ${document.height}`, 12, rect.height - 12)
  if (view.mirrored || view.mirroredVertical) {
    const mirrorLabel =
      view.mirrored && view.mirroredVertical ? t('canvas.mirror.both') : view.mirrored ? t('canvas.mirror.horizontal') : t('canvas.mirror.vertical')
    displayContext.fillText(t('canvas.mirror.current', { label: mirrorLabel }), 12, rect.height - 30)
  }
  drawSelectionOverlay()
  // Keep the brush cursor on its own surface. This call is cheap and also
  // clears the overlay when a tool/view change makes the fast path invalid.
  brushPreviewDrawRef.current()
}
