import type { RgbaColor } from '@shared/types-color'
import type { SelectionRect } from '@shared/types-selection'
import { DEFAULT_GRID_SETTINGS } from '@/core/grid'
import { DEFAULT_GRID_COLOR } from '@/core/file-preferences'
import { deviceAlignedCanvasRect } from '@/core/canvas-render-plan'
import { canvasResizePreviewClippedRects, canvasResizePreviewExposedRects, drawCanvasResizePreviewLayers } from '@/core/canvas-resize-preview'
import { hasSymmetry, symmetryAxisSegment, type SymmetryAxis } from '@/core/symmetry'
import { type RasterContext2D } from '@/components/canvas-selection-renderer'
import type * as React from 'react'
import type { DocumentSession } from '@/store/workspace-types'
import { symmetryGuideAxisEnabled, drawDeviceAlignedCanvasBorder } from './canvas-stage-helpers'
export function renderCanvasTransformGuides({
  session,
  context,
  clipBaseCanvas,
  symmetryAxisPreferences,
  document,
  symmetryCenter,
  originX,
  view,
  originY,
  canvasResizePreviewRef,
  deviceScale,
  baseCanvasBoundary,
  checkerboard,
  rect,
  activeTheme,
  canvasResizeColor,
  canvasWidth,
  canvasHeight
}: {
  session: DocumentSession
  context: RasterContext2D
  clipBaseCanvas: (targetContext: RasterContext2D) => void
  symmetryAxisPreferences: import('@/core/file-preferences').SymmetryAxisPreferences
  document: import('@shared/types-document').SpriteDocument
  symmetryCenter: import('@/core/symmetry').SymmetryCenter
  originX: number
  view: import('@shared/types-view').ViewState
  originY: number
  canvasResizePreviewRef: React.RefObject<import('@/store/workspace-types').CanvasResizePreview | null>
  deviceScale: import('@/core/canvas-render-plan').CanvasDeviceScale
  baseCanvasBoundary: import('@/core/canvas-render-plan').DeviceAlignedCanvasRect
  checkerboard: import('@/core/file-preferences').CheckerboardPreferences
  rect: {
    width: number
    height: number
  }
  activeTheme: import('@/core/theme').ResolvedTheme
  canvasResizeColor: RgbaColor
  canvasWidth: number
  canvasHeight: number
}) {
  if (hasSymmetry(session.symmetryAxes)) {
    context.save()
    clipBaseCanvas(context)
    context.strokeStyle = `rgb(${symmetryAxisPreferences.color.r} ${symmetryAxisPreferences.color.g} ${symmetryAxisPreferences.color.b})`
    context.globalAlpha = symmetryAxisPreferences.color.a / 255
    context.lineWidth = symmetryAxisPreferences.thickness
    context.setLineDash([])
    for (const axis of ['horizontal', 'vertical', 'diagonalUp', 'diagonalDown'] as SymmetryAxis[]) {
      if (!symmetryGuideAxisEnabled(session.symmetryAxes, axis)) continue
      const segment = symmetryAxisSegment(axis, document.width, document.height, symmetryCenter)
      if (!segment) continue
      context.beginPath()
      context.moveTo(originX + segment.start.x * view.zoom, originY + segment.start.y * view.zoom)
      context.lineTo(originX + segment.end.x * view.zoom, originY + segment.end.y * view.zoom)
      context.stroke()
    }
    const centerX = originX + symmetryCenter.x * view.zoom
    const centerY = originY + symmetryCenter.y * view.zoom
    const centerSize = Math.max(6, Math.min(12, view.zoom * 0.45))
    context.fillStyle = context.strokeStyle
    context.fillRect(centerX - centerSize / 2, centerY - centerSize / 2, centerSize, centerSize)
    context.restore()
  }
  if (canvasResizePreviewRef.current) {
    const preview = canvasResizePreviewRef.current
    const x = originX - preview.offsetX * view.zoom
    const y = originY - preview.offsetY * view.zoom
    const previewWidth = preview.width * view.zoom
    const previewHeight = preview.height * view.zoom
    const previewBoundary = deviceAlignedCanvasRect(x, y, previewWidth, previewHeight, deviceScale)
    const exposedRects = canvasResizePreviewExposedRects(
      { x: previewBoundary.left, y: previewBoundary.top, width: previewBoundary.width, height: previewBoundary.height },
      { x: baseCanvasBoundary.left, y: baseCanvasBoundary.top, width: baseCanvasBoundary.width, height: baseCanvasBoundary.height }
    )
    const clippedRects = canvasResizePreviewClippedRects(
      { x: previewBoundary.left, y: previewBoundary.top, width: previewBoundary.width, height: previewBoundary.height },
      { x: baseCanvasBoundary.left, y: baseCanvasBoundary.top, width: baseCanvasBoundary.width, height: baseCanvasBoundary.height }
    )
    drawCanvasResizePreviewLayers((layer) => {
      if (layer === 'checker') {
        if (exposedRects.length === 0) return
        context.save()
        context.beginPath()
        // The normal composite pass already rendered the old canvas. Only
        // paint the part that exists in the proposed canvas but not in the
        // old one, otherwise the preview checker would cover real pixels.
        for (const exposedRect of exposedRects) context.rect(exposedRect.x, exposedRect.y, exposedRect.width, exposedRect.height)
        context.clip()
        context.fillStyle = `rgb(${checkerboard.lightColor.r} ${checkerboard.lightColor.g} ${checkerboard.lightColor.b})`
        context.fillRect(previewBoundary.left, previewBoundary.top, previewBoundary.width, previewBoundary.height)
        const previewCheckerCell = checkerboard.size * view.zoom
        if (previewCheckerCell >= 2) {
          const firstColumn = Math.floor((Math.max(0, x) - originX) / previewCheckerCell)
          const firstRow = Math.floor((Math.max(0, y) - originY) / previewCheckerCell)
          const lastColumn = Math.ceil((Math.min(rect.width, x + previewWidth) - originX) / previewCheckerCell)
          const lastRow = Math.ceil((Math.min(rect.height, y + previewHeight) - originY) / previewCheckerCell)
          context.fillStyle = `rgb(${checkerboard.darkColor.r} ${checkerboard.darkColor.g} ${checkerboard.darkColor.b})`
          for (let row = firstRow; row < lastRow; row += 1) {
            for (let column = firstColumn; column < lastColumn; column += 1) {
              if ((column + row) % 2 === 0) continue
              context.fillRect(originX + column * previewCheckerCell, originY + row * previewCheckerCell, previewCheckerCell, previewCheckerCell)
            }
          }
        }
        context.restore()
        return
      }
      if (layer === 'content') {
        // Keep the committed composite untouched during the drag. The
        // checkerboard already covers only the newly exposed area; content
        // inside the old canvas was rendered by the normal cache pass above.
        return
      }
      if (layer === 'outside-mask') {
        if (exposedRects.length === 0 && clippedRects.length === 0) return
        context.save()
        context.fillStyle = activeTheme.variables['--theme-overlay']
        context.beginPath()
        for (const exposedRect of exposedRects) context.rect(exposedRect.x, exposedRect.y, exposedRect.width, exposedRect.height)
        for (const clippedRect of clippedRects) context.rect(clippedRect.x, clippedRect.y, clippedRect.width, clippedRect.height)
        context.clip()
        context.fillRect(previewBoundary.left, previewBoundary.top, previewBoundary.width, previewBoundary.height)
        for (const clippedRect of clippedRects) context.fillRect(clippedRect.x, clippedRect.y, clippedRect.width, clippedRect.height)
        context.restore()
        return
      }
      context.save()
      const resizeBoundaryColor = `rgb(${canvasResizeColor.r} ${canvasResizeColor.g} ${canvasResizeColor.b} / ${canvasResizeColor.a / 255})`
      context.strokeStyle = resizeBoundaryColor
      drawDeviceAlignedCanvasBorder(context, originX, originY, canvasWidth, canvasHeight, deviceScale, resizeBoundaryColor)
      context.lineWidth = 2
      context.setLineDash([])
      context.beginPath()
      context.moveTo(Math.round(x) + 0.5, 0)
      context.lineTo(Math.round(x) + 0.5, rect.height)
      context.moveTo(Math.round(x + previewWidth) + 0.5, 0)
      context.lineTo(Math.round(x + previewWidth) + 0.5, rect.height)
      context.moveTo(0, Math.round(y) + 0.5)
      context.lineTo(rect.width, Math.round(y) + 0.5)
      context.moveTo(0, Math.round(y + previewHeight) + 0.5)
      context.lineTo(rect.width, Math.round(y + previewHeight) + 0.5)
      context.stroke()
      context.restore()
    })
  }
}

export function renderCanvasEditorGuides({
  view,
  toX,
  fromX,
  toY,
  fromY,
  repeatCopies,
  drawGrid,
  gridColors,
  moveLayerContentPreviewEnabled,
  moveLayerContentPreviewRef,
  document,
  originX,
  originY,
  context,
  sliceTool,
  sliceOutlinesVisible,
  inputRef,
  currentSession,
  sliceColor,
  autoSlicePreviewRef,
  canvasWidth,
  canvasHeight,
  deviceScale,
  activeTheme
}: {
  view: import('@shared/types-view').ViewState
  toX: number
  fromX: number
  toY: number
  fromY: number
  repeatCopies: {
    x: number
    y: number
    originX: number
    originY: number
    fromX: number
    fromY: number
    toX: number
    toY: number
  }[]
  drawGrid: (
    gridX: number,
    gridY: number,
    cellWidth: number,
    cellHeight: number,
    color: RgbaColor,
    copy?: {
      x: number
      y: number
      originX: number
      originY: number
      fromX: number
      fromY: number
      toX: number
      toY: number
    }
  ) => void
  gridColors: import('@/core/file-preferences').GridColorPreferences
  moveLayerContentPreviewEnabled: boolean
  moveLayerContentPreviewRef: React.RefObject<import('@/components/canvas-move-selection').CanvasMoveLayerContentPreview | null>
  document: import('@shared/types-document').SpriteDocument
  originX: number
  originY: number
  context: RasterContext2D
  sliceTool: boolean
  sliceOutlinesVisible: boolean
  inputRef: React.RefObject<import('@/core/canvas-input').CanvasInputState>
  currentSession: DocumentSession
  sliceColor: RgbaColor
  autoSlicePreviewRef: React.RefObject<SelectionRect[] | null>
  canvasWidth: number
  canvasHeight: number
  deviceScale: import('@/core/canvas-render-plan').CanvasDeviceScale
  activeTheme: import('@/core/theme').ResolvedTheme
}) {
  if (view.showGrid && toX > fromX && toY > fromY) {
    const grid = view.grid ?? DEFAULT_GRID_SETTINGS
    for (const copy of repeatCopies) {
      if (copy.toX > copy.fromX && copy.toY > copy.fromY) drawGrid(grid.x, grid.y, grid.width, grid.height, gridColors.gridColor, copy)
    }
  }
  const moveLayerPreview = moveLayerContentPreviewEnabled ? moveLayerContentPreviewRef.current : null
  if (moveLayerPreview) {
    const layer = document.layers.find((candidate) => candidate.id === moveLayerPreview.layerId)
    if (layer) {
      const left = originX + (moveLayerPreview.bounds.x + layer.offsetX - moveLayerPreview.layerOffsetX) * view.zoom
      const top = originY + (moveLayerPreview.bounds.y + layer.offsetY - moveLayerPreview.layerOffsetY) * view.zoom
      const right = left + moveLayerPreview.bounds.width * view.zoom
      const bottom = top + moveLayerPreview.bounds.height * view.zoom
      context.save()
      context.globalCompositeOperation = 'source-over'
      context.globalAlpha = 1
      context.strokeStyle = `rgba(${DEFAULT_GRID_COLOR.r}, ${DEFAULT_GRID_COLOR.g}, ${DEFAULT_GRID_COLOR.b}, ${DEFAULT_GRID_COLOR.a / 255})`
      context.lineWidth = 1
      context.setLineDash([])
      context.strokeRect(
        Math.round(left) + 0.5,
        Math.round(top) + 0.5,
        Math.max(1, Math.round(right) - Math.round(left)),
        Math.max(1, Math.round(bottom) - Math.round(top))
      )
      context.restore()
    }
  }
  if (sliceTool || sliceOutlinesVisible) {
    const sliceDrag = inputRef.current.drag
    const previewSlice = sliceDrag?.kind === 'create-slice' && sliceDrag.moved ? sliceDrag.previewTarget : null
    const selectedSliceIds = new Set(
      sliceTool
        ? currentSession.selectedSliceIds?.length
          ? currentSession.selectedSliceIds
          : currentSession.selectedSliceId
            ? [currentSession.selectedSliceId]
            : []
        : []
    )
    const slices = currentSession.document.slices ?? []
    const drawSlice = (slice: SelectionRect, selected: boolean, handles = false): void => {
      const left = originX + slice.x * view.zoom
      const top = originY + slice.y * view.zoom
      const width = slice.width * view.zoom
      const height = slice.height * view.zoom
      context.save()
      const color = `rgb(${sliceColor.r} ${sliceColor.g} ${sliceColor.b} / ${sliceColor.a / 255})`
      context.strokeStyle = color
      context.lineWidth = selected ? 2 : 1
      context.setLineDash([])
      context.strokeRect(Math.round(left) + 0.5, Math.round(top) + 0.5, Math.max(1, Math.round(width)), Math.max(1, Math.round(height)))
      if (selected && handles) {
        context.fillStyle = color
        const handles = [
          [left, top],
          [left + width / 2, top],
          [left + width, top],
          [left, top + height / 2],
          [left + width, top + height / 2],
          [left, top + height],
          [left + width / 2, top + height],
          [left + width, top + height]
        ]
        for (const [x, y] of handles) context.fillRect(Math.round(x) - 3, Math.round(y) - 3, 7, 7)
      }
      context.restore()
    }
    for (const slice of slices) {
      const resizePreview = sliceDrag?.kind === 'resize-slice' && sliceDrag.sliceId === slice.id ? sliceDrag.previewTarget : null
      const preview = resizePreview ?? (sliceDrag?.copy ? null : sliceDrag?.slicePreviewTargets?.[slice.id])
      drawSlice(preview ?? slice, selectedSliceIds.has(slice.id), selectedSliceIds.size === 1 && selectedSliceIds.has(slice.id))
    }
    if (sliceDrag?.copy && sliceDrag.slicePreviewTargets) for (const slice of Object.values(sliceDrag.slicePreviewTargets)) drawSlice(slice, true)
    if (previewSlice) drawSlice(previewSlice, true)
    if (autoSlicePreviewRef.current) for (const slice of autoSlicePreviewRef.current) drawSlice(slice, true)
  }
  // Keep the document boundary above selections, grids, and other previews.
  context.save()
  context.globalCompositeOperation = 'source-over'
  context.globalAlpha = 1
  drawDeviceAlignedCanvasBorder(context, originX, originY, canvasWidth, canvasHeight, deviceScale, activeTheme.variables['--theme-selection-outline-dark'])
  context.restore()
}
