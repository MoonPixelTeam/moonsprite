import type { RgbaColor } from '@shared/types-color'
import { readLayerMaskDisplayColorAt } from '@/core/document-model'
import { blendOver, relativeLuminanceColor } from '@/core/raster'
import { documentPointFromViewportPoint } from '@/core/view-geometry'
import { drawingSizePreviewTargetForDrag } from '@/core/canvas-input'
import { canvasStatusTextColor, transparencyColorAt } from '@/core/canvas-visuals'
import { publishSelectionSizePreview } from '@/components/selection-size-preview-events'
import type * as React from 'react'
import type { DocumentSession } from '@/store/workspace-types'

const CANVAS_STATUS_TEXT_BOTTOM_INSET = 12

/** Keeps the canvas status text clear of visible in-stage controls. */
export function canvasStatusTextBaselineY(viewportHeight: number, bottomSafeArea: number): number {
  return viewportHeight - CANVAS_STATUS_TEXT_BOTTOM_INSET - Math.max(0, bottomSafeArea)
}

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
  brushPreviewDrawRef,
  canvasStatusBottomInset
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
    toolDetails?: string | null
  } | null>
  session: DocumentSession
  t: (key: import('@/locales/contracts').TranslationKey, params?: import('@/locales/contracts').TranslationParams) => string
  drawSelectionOverlay: () => void
  brushPreviewDrawRef: React.RefObject<() => void>
  canvasStatusBottomInset: number
}) {
  const statusBaselineY = canvasStatusTextBaselineY(rect.height, canvasStatusBottomInset)
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
  const statusBackgrounds = [statusBackgroundAt(72, statusBaselineY - 4)]
  if (view.mirrored || view.mirroredVertical) statusBackgrounds.push(statusBackgroundAt(92, statusBaselineY - 22))
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
  const drag = inputRef.current.drag
  const point = inputRef.current.pointer.point
  const toolNames: Record<string, string> = {
    pencil: '铅笔', brush: '画笔', eraser: '橡皮擦', line: '直线', shape: '形状', fill: '填充',
    gradient: '渐变', picker: '取色器', move: '移动', marquee: '矩形选区', lasso: '套索',
    magicWand: '魔棒', crop: '裁剪', text: '文字', slice: '切片', zoom: '缩放', hand: '抓手',
    rotate: '旋转', liquify: '液化', smooth: '平滑', tile: '图块', symmetry: '对称'
  }
  const toolLabel = toolNames[session.tool] ?? session.tool
  const formatPoint = (value: { x: number; y: number }): string => `(${Math.round(value.x)}, ${Math.round(value.y)})`
  const toolDetails = (() => {
    const cursor = `工具：${toolLabel} · 光标 ${formatPoint(point)}`
    if (!drag) return cursor
    const dx = drag.last.x - drag.start.x
    const dy = drag.last.y - drag.start.y
    const size = ` · 尺寸 ${Math.abs(Math.round(dx))} × ${Math.abs(Math.round(dy))}`
    if (drag.kind === 'line-shape') {
      const angle = ((Math.atan2(-dy, dx) * 180 / Math.PI) + 360) % 360
      return `${cursor} · 起点 ${formatPoint(drag.start)} · 终点 ${formatPoint(drag.last)} · 角度 ${angle.toFixed(1)}° · 长度 ${Math.hypot(dx, dy).toFixed(1)}`
    }
    if (drag.kind === 'shape' || drag.kind === 'freeform-shape' || drag.kind === 'marquee' || drag.kind === 'create-text-box' || drag.kind === 'create-slice')
      return `${cursor} · 起点 ${formatPoint(drag.start)} · 终点 ${formatPoint(drag.last)}${size}`
    return `${cursor} · 起点 ${formatPoint(drag.start)} · 位移 (${Math.round(dx)}, ${Math.round(dy)})`
  })()
  if (previousSelectionSizePreview?.width !== selectionSizePreview?.width || previousSelectionSizePreview?.height !== selectionSizePreview?.height) {
    publishedSelectionSizePreviewRef.current = selectionSizePreview ? { ...selectionSizePreview, toolDetails } : null
    publishSelectionSizePreview({ documentId: session.document.id, size: selectionSizePreview, toolDetails })
  } else if (previousSelectionSizePreview?.toolDetails !== toolDetails) {
    publishSelectionSizePreview({ documentId: session.document.id, size: selectionSizePreview, toolDetails })
  }
  displayContext.fillText(`${document.width} x ${document.height}`, 12, statusBaselineY)
  if (view.mirrored || view.mirroredVertical) {
    const mirrorLabel =
      view.mirrored && view.mirroredVertical ? t('canvas.mirror.both') : view.mirrored ? t('canvas.mirror.horizontal') : t('canvas.mirror.vertical')
    displayContext.fillText(t('canvas.mirror.current', { label: mirrorLabel }), 12, statusBaselineY - 18)
  }
  drawSelectionOverlay()
  // Keep the brush cursor on its own surface. This call is cheap and also
  // clears the overlay when a tool/view change makes the fast path invalid.
  brushPreviewDrawRef.current()
}
