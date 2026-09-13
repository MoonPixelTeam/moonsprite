import { canvasAdaptiveContrast } from './canvas-adaptive-contrast'
import type { RgbaColor } from '@shared/types-color'
import { DEFAULT_GRID_SETTINGS, snapPointToGrid } from '@/core/grid'
import { brushMaskOffsets, brushStampAnchor } from '@/core/tools-brush'
import { selectionContains } from '@/core/selection'
import { type CanvasDragState as DragState } from '@/core/canvas-input'
import { colorLuminance } from '@/core/canvas-visuals'
import { type RasterContext2D } from '@/components/canvas-selection-renderer'
import { airbrushParticleSize, airbrushSymmetryPoints } from '@/core/airbrush'
import { tileRepeatMappedPointForCopies } from '@/core/tilemap'
import { brushPreviewAllowedDuringDrag } from '@/core/canvas-input'
import type * as React from 'react'
import type { DocumentSession } from '@/store/workspace-types'
export function renderCanvasAirbrush({
  canRenderToolPreview,
  inputRef,
  session,
  drag,
  drawingBrushPreviewEnabled,
  repeatedDocumentPointsAt,
  paintSelectionForDrag,
  gridSnapActive,
  document,
  symmetryCenter,
  view,
  sampleCompositeForPreview,
  context,
  activeTheme,
  previewPointKey,
  previewPixelRects,
  drawPreviewPixel,
  previewColorAt
}: {
  canRenderToolPreview: boolean
  inputRef: React.RefObject<import('@/core/canvas-input').CanvasInputState>
  session: DocumentSession
  drag: DragState | null
  drawingBrushPreviewEnabled: boolean
  repeatedDocumentPointsAt: (
    clientX: number,
    clientY: number,
    continuous?: boolean,
    allowOutsideCopies?: boolean
  ) => {
    local: import('@/core/canvas-input').CanvasPoint
    repeated: import('@/core/canvas-input').CanvasPoint
    offset: {
      x: number
      y: number
    }
  } | null
  paintSelectionForDrag: (drag: import('@/core/canvas-input').CanvasDragState) => import('@shared/types-selection').SelectionMask | null
  gridSnapActive: boolean
  document: import('@shared/types-document').SpriteDocument
  symmetryCenter: import('@/core/symmetry').SymmetryCenter
  view: import('@shared/types-view').ViewState
  sampleCompositeForPreview: (x: number, y: number) => RgbaColor
  context: RasterContext2D
  activeTheme: import('@/core/theme').ResolvedTheme
  previewPointKey: (pixelX: number, pixelY: number) => string | null
  previewPixelRects: (
    pixelX: number,
    pixelY: number
  ) => Array<{
    x: number
    y: number
    width: number
    height: number
  }>
  drawPreviewPixel: (
    pixelX: number,
    pixelY: number,
    color: RgbaColor
  ) => Array<{
    x: number
    y: number
    width: number
    height: number
  }>
  previewColorAt: (
    pixelX: number,
    pixelY: number,
    erase?: boolean,
    coverage?: number,
    paintColor?: RgbaColor,
    baseColor?: RgbaColor,
    overwrite?: boolean
  ) => RgbaColor
}) {
  if (
    canRenderToolPreview &&
    !inputRef.current.spaceHeld &&
    inputRef.current.pointer.visible &&
    !inputRef.current.sampling &&
    session.tool === 'airbrush' &&
    brushPreviewAllowedDuringDrag(drag, 'airbrush', drawingBrushPreviewEnabled)
  ) {
    const pointerLocation = repeatedDocumentPointsAt(inputRef.current.pointer.clientX, inputRef.current.pointer.clientY)
    const point = pointerLocation?.local ?? inputRef.current.pointer.point
    const airbrushDrag = drag?.kind === 'airbrush' ? drag : null
    const previewSelection = airbrushDrag ? paintSelectionForDrag(airbrushDrag) : null
    const airbrushPoint = gridSnapActive ? snapPointToGrid(point, session.view.grid ?? DEFAULT_GRID_SETTINGS) : point
    const spraySize = session.airbrushScatterRadius * 2 + 1
    const sprayAnchor = brushStampAnchor(spraySize, null)
    const sprayMask = brushMaskOffsets(spraySize, 'round')
    const sprayPoints = new Map<string, { x: number; y: number }>()
    const spraySourcePoints = sprayMask.map((offset) => ({ x: airbrushPoint.x - sprayAnchor.x + offset.x, y: airbrushPoint.y - sprayAnchor.y + offset.y }))
    for (const target of airbrushSymmetryPoints(spraySourcePoints, document.width, document.height, session.symmetryAxes, symmetryCenter)) {
      const mapped = tileRepeatMappedPointForCopies(target, document.width, document.height, view.tileRepeatMode ?? 'off', true)
      if (mapped && (!previewSelection || selectionContains(previewSelection, mapped.local.x, mapped.local.y)))
        sprayPoints.set(`${mapped.local.x}:${mapped.local.y}`, mapped.local)
    }
    const sampled = sampleCompositeForPreview(airbrushPoint.x, airbrushPoint.y)
    context.save()
    context.strokeStyle =
      colorLuminance(sampled) > 145 ? activeTheme.variables['--theme-selection-outline-dark'] : activeTheme.variables['--theme-selection-outline-light']
    context.lineWidth = Math.max(1, Math.min(2, view.zoom / 4))
    context.beginPath()
    let outlineLeft = Infinity, outlineTop = Infinity, outlineRight = -Infinity, outlineBottom = -Infinity
    for (const sprayPoint of sprayPoints.values()) {
      const left = !sprayPoints.has(previewPointKey(sprayPoint.x - 1, sprayPoint.y) ?? '')
      const right = !sprayPoints.has(previewPointKey(sprayPoint.x + 1, sprayPoint.y) ?? '')
      const top = !sprayPoints.has(previewPointKey(sprayPoint.x, sprayPoint.y - 1) ?? '')
      const bottom = !sprayPoints.has(previewPointKey(sprayPoint.x, sprayPoint.y + 1) ?? '')
      if (!left && !right && !top && !bottom) continue
      for (const pixelRect of previewPixelRects(sprayPoint.x, sprayPoint.y)) {
        outlineLeft = Math.min(outlineLeft, pixelRect.x)
        outlineTop = Math.min(outlineTop, pixelRect.y)
        outlineRight = Math.max(outlineRight, pixelRect.x + pixelRect.width)
        outlineBottom = Math.max(outlineBottom, pixelRect.y + pixelRect.height)
        if (left) {
          context.moveTo(pixelRect.x, pixelRect.y)
          context.lineTo(pixelRect.x, pixelRect.y + pixelRect.height)
        }
        if (right) {
          context.moveTo(pixelRect.x + pixelRect.width, pixelRect.y)
          context.lineTo(pixelRect.x + pixelRect.width, pixelRect.y + pixelRect.height)
        }
        if (top) {
          context.moveTo(pixelRect.x, pixelRect.y)
          context.lineTo(pixelRect.x + pixelRect.width, pixelRect.y)
        }
        if (bottom) {
          context.moveTo(pixelRect.x, pixelRect.y + pixelRect.height)
          context.lineTo(pixelRect.x + pixelRect.width, pixelRect.y + pixelRect.height)
        }
      }
    }
    const particleSize = airbrushParticleSize(session.airbrushParticleRadius)
    const particleAnchor = brushStampAnchor(particleSize, null)
    const particleSourcePoints = brushMaskOffsets(
      particleSize,
      session.airbrushParticleShape,
      'solid',
      1,
      0,
      0,
      null,
      undefined,
      0,
      'paint',
      0,
      0,
      undefined,
      session.airbrushParticleShape === 'round' ? 0 : session.airbrushParticleAngle
    ).map((offset) => ({
      x: point.x - particleAnchor.x + offset.x,
      y: point.y - particleAnchor.y + offset.y
    }))
    for (const target of airbrushSymmetryPoints(particleSourcePoints, document.width, document.height, session.symmetryAxes, symmetryCenter)) {
      const mapped = tileRepeatMappedPointForCopies(target, document.width, document.height, view.tileRepeatMode ?? 'off', true)
      if (mapped && (!previewSelection || selectionContains(previewSelection, mapped.local.x, mapped.local.y)))
        drawPreviewPixel(mapped.local.x, mapped.local.y, previewColorAt(mapped.local.x, mapped.local.y))
    }
    if (outlineRight > outlineLeft && outlineBottom > outlineTop) {
      const padding = context.lineWidth + 1
      context.strokeStyle = canvasAdaptiveContrast(context, {
        x: outlineLeft - padding, y: outlineTop - padding,
        width: outlineRight - outlineLeft + padding * 2, height: outlineBottom - outlineTop + padding * 2
      })
      context.stroke()
    }
    context.restore()
  }
}
