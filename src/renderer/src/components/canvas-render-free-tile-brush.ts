import { CanvasAdaptiveOutline } from './canvas-adaptive-outline'
import type { RgbaColor } from '@shared/types-color'
import { layerMaskDisplayColor, readLayerColorAt, resolveLayerCanvasColor } from '@/core/document-model'
import { blendOver, relativeLuminanceColor } from '@/core/raster'
import { deviceAlignedPixelRect } from '@/core/canvas-render-plan'
import { selectionContains } from '@/core/selection'
import { type CanvasDragState as DragState } from '@/core/canvas-input'
import { colorLuminance, transparencyColorAt } from '@/core/canvas-visuals'
import { type RasterContext2D } from '@/components/canvas-selection-renderer'
import { readTilesetTilePixels } from '@/core/tilemap'
import { freeTileInstanceBounds, freeTileSourceForInstance, freeTileSourceStampOrigin } from '@/core/free-tile'
import { activeFreeTileCelTarget, freeTileInstanceAtDocumentPoint, freeTileSourceForId } from '@/core/free-tile-document'
import type * as React from 'react'
import type { DocumentSession } from '@/store/workspace-types'
export function renderCanvasFreeTileBrush({
  currentActiveLayer,
  currentSession,
  brushPreviewMode,
  canRenderToolPreview,
  inputRef,
  drag,
  drawingBrushPreviewEnabled,
  session,
  document,
  repeatedDocumentPointsAt,
  paintSelectionForDrag,
  repeatCopies,
  context,
  clipCanvasCopy,
  isolatedLayerMask,
  compositePointReplacementSampler,
  view,
  deviceScale,
  checkerboard,
  sampleCompositeForPreview,
  activeTheme
}: {
  currentActiveLayer: import('@shared/types-layer').RasterLayer
  currentSession: DocumentSession
  brushPreviewMode: import('@/core/file-preferences').BrushPreviewMode
  canRenderToolPreview: boolean
  inputRef: React.RefObject<import('@/core/canvas-input').CanvasInputState>
  drag: DragState | null
  drawingBrushPreviewEnabled: boolean
  session: DocumentSession
  document: import('@shared/types-document').SpriteDocument
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
  context: RasterContext2D
  clipCanvasCopy: (
    targetContext: RasterContext2D,
    copy: {
      x: number
      y: number
    }
  ) => void
  isolatedLayerMask: import('@shared/types-layer').LayerMask | null
  compositePointReplacementSampler: (x: number, y: number, replacement: RgbaColor) => RgbaColor
  view: import('@shared/types-view').ViewState
  deviceScale: import('@/core/canvas-render-plan').CanvasDeviceScale
  checkerboard: import('@/core/file-preferences').CheckerboardPreferences
  sampleCompositeForPreview: (x: number, y: number) => RgbaColor
  activeTheme: import('@/core/theme').ResolvedTheme
}) {
  if (
    currentActiveLayer.kind === 'free-tile' &&
    currentSession.freeTileMode === 'paint' &&
    brushPreviewMode !== 'none' &&
    canRenderToolPreview &&
    !inputRef.current.spaceHeld &&
    inputRef.current.pointer.visible &&
    !inputRef.current.sampling &&
    (!drag || (drag.kind === 'free-tile-draw' && drawingBrushPreviewEnabled)) &&
    (session.tool === 'pencil' || session.tool === 'eraser')
  ) {
    const target = activeFreeTileCelTarget(document)
    const pointerLocation = repeatedDocumentPointsAt(inputRef.current.pointer.clientX, inputRef.current.pointer.clientY)
    const point = pointerLocation?.local ?? inputRef.current.pointer.point
    const drawing = drag?.kind === 'free-tile-draw'
    const previewSelection = drawing && drag ? paintSelectionForDrag(drag) : null
    if (target && (!previewSelection || selectionContains(previewSelection, point.x, point.y))) {
      const erasing = session.tool === 'eraser'
      const instance = erasing ? freeTileInstanceAtDocumentPoint(target, point.x, point.y) : null
      const source = instance
        ? freeTileSourceForInstance(target.sources, instance)
        : freeTileSourceForId(document, target.layer, drawing ? drag.freeTileSourceId : currentSession.selectedTilesetId)
      const tileId = source?.tileset.tileIds[0] ?? null
      const origin = instance
        ? { x: instance.x, y: instance.y }
        : source
          ? freeTileSourceStampOrigin(point.x, point.y, source, target.surface.offsetX, target.surface.offsetY)
          : { x: 0, y: 0 }
      const bounds = instance
        ? freeTileInstanceBounds(instance, target.sources, target.surface.offsetX, target.surface.offsetY)
        : source
          ? {
              x: target.surface.offsetX + origin.x + source.offsetX,
              y: target.surface.offsetY + origin.y + source.offsetY,
              width: source.tileset.tileWidth,
              height: source.tileset.tileHeight
            }
          : { x: 0, y: 0, width: 0, height: 0 }
      const previewPixels = !erasing && source && tileId ? readTilesetTilePixels(source.tileset, tileId) : null
      const hasVisiblePixels = Boolean(previewPixels?.some((value, index) => index % 4 === 3 && value > 0))
      const drawFullPreview = !drawing && Boolean(previewPixels) && (brushPreviewMode === 'full' || brushPreviewMode === 'full-edge')
      const drawPreviewOutline = erasing || !hasVisiblePixels || brushPreviewMode === 'edge' || brushPreviewMode === 'full-edge'
      if (erasing ? instance : previewPixels) {
        for (const copy of repeatCopies) {
          if (bounds.x + bounds.width <= copy.fromX || bounds.y + bounds.height <= copy.fromY || bounds.x >= copy.toX || bounds.y >= copy.toY) continue
          context.save()
          clipCanvasCopy(context, copy)
          if (drawFullPreview && previewPixels) {
            for (let y = 0; y < bounds.height; y += 1)
              for (let x = 0; x < bounds.width; x += 1) {
                const pixelX = bounds.x + x
                const pixelY = bounds.y + y
                if (pixelX < 0 || pixelY < 0 || pixelX >= document.width || pixelY >= document.height) continue
                const offset = (y * bounds.width + x) * 4
                const replacement = resolveLayerCanvasColor(document, currentActiveLayer, {
                  r: previewPixels[offset],
                  g: previewPixels[offset + 1],
                  b: previewPixels[offset + 2],
                  a: previewPixels[offset + 3]
                })
                if (replacement.a === 0) continue
                const currentLayerColor = readLayerColorAt(document, currentActiveLayer, pixelX, pixelY)
                const placedLayerColor = blendOver(currentLayerColor, replacement)
                const color = isolatedLayerMask ? layerMaskDisplayColor(placedLayerColor) : compositePointReplacementSampler(pixelX, pixelY, placedLayerColor)
                const pixelRect = deviceAlignedPixelRect(copy.originX, copy.originY, view.zoom, pixelX, pixelY, deviceScale)
                const transparency = transparencyColorAt(pixelX, pixelY, checkerboard)
                const displayColor = view.relativeLuminance ? relativeLuminanceColor(color) : color
                context.fillStyle = `rgb(${transparency.r} ${transparency.g} ${transparency.b})`
                context.fillRect(pixelRect.x, pixelRect.y, pixelRect.width, pixelRect.height)
                if (displayColor.a > 0) {
                  context.fillStyle = `rgb(${displayColor.r} ${displayColor.g} ${displayColor.b} / ${displayColor.a / 255})`
                  context.fillRect(pixelRect.x, pixelRect.y, pixelRect.width, pixelRect.height)
                }
              }
          }
          if (drawPreviewOutline) {
            context.lineWidth = Math.max(1, Math.min(2, view.zoom / 4))
            const outline = new CanvasAdaptiveOutline()
            const rect = { x: copy.originX + bounds.x * view.zoom, y: copy.originY + bounds.y * view.zoom, width: bounds.width * view.zoom, height: bounds.height * view.zoom }
            outline.include(rect)
            context.beginPath()
            context.rect(rect.x, rect.y, rect.width, rect.height)
            outline.stroke(context)
          }
          context.restore()
        }
      }
    }
  }
}
