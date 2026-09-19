import { CanvasAdaptiveOutline, alignCanvasStrokePath } from './canvas-adaptive-outline'
import type { RgbaColor } from '@shared/types-color'
import type { TilemapCell } from '@shared/types-tiles'
import { layerMaskDisplayColor, resolveLayerCanvasColor } from '@/core/document-model'
import { relativeLuminanceColor, TRANSPARENT } from '@/core/raster'
import { deviceAlignedPixelRect } from '@/core/canvas-render-plan'
import { type CanvasDragState as DragState } from '@/core/canvas-input'
import { colorLuminance, transparencyColorAt } from '@/core/canvas-visuals'
import { type RasterContext2D } from '@/components/canvas-selection-renderer'
import { activeTilemapCelTarget } from '@/core/tilemap-document'
import { readTilesetTilePixels, tilemapCellBounds, tilemapCellIndexAtPoint, tilemapSourcePointForCell } from '@/core/tilemap'
import type * as React from 'react'
import type { DocumentSession } from '@/store/workspace-types'
export function renderCanvasTileBrush({
  currentActiveLayer,
  currentSession,
  brushPreviewMode,
  brushEdgeColor,
  brushEdgeThickness = 1,
  canRenderToolPreview,
  inputRef,
  drag,
  drawingBrushPreviewEnabled,
  session,
  document,
  repeatedDocumentPointsAt,
  paintSelectionForDrag,
  tilemapCellAllowedBySelection,
  repeatCopies,
  context,
  clipCanvasCopy,
  activeLayer,
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
  brushEdgeColor?: RgbaColor
  brushEdgeThickness: number
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
  tilemapCellAllowedBySelection: (
    target: import('@/core/tilemap-document').TilemapCelTarget,
    index: number,
    selection: import('@shared/types-selection').SelectionMask | null
  ) => boolean
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
  activeLayer: import('@shared/types-layer').RasterLayer
  isolatedLayerMask: import('@shared/types-layer').LayerMask | null
  compositePointReplacementSampler: (x: number, y: number, replacement: RgbaColor) => RgbaColor
  view: import('@shared/types-view').ViewState
  deviceScale: import('@/core/canvas-render-plan').CanvasDeviceScale
  checkerboard: import('@/core/file-preferences').CheckerboardPreferences
  sampleCompositeForPreview: (x: number, y: number) => RgbaColor
  activeTheme: import('@/core/theme').ResolvedTheme
}) {
  if (
    currentActiveLayer.kind === 'tilemap' &&
    currentSession.tilemapMode === 'paint' &&
    brushPreviewMode !== 'none' &&
    canRenderToolPreview &&
    !inputRef.current.spaceHeld &&
    inputRef.current.pointer.visible &&
    !inputRef.current.sampling &&
    (!drag || (drag.kind === 'tile-draw' && drawingBrushPreviewEnabled)) &&
    (session.tool === 'pencil' || session.tool === 'eraser')
  ) {
    const target = activeTilemapCelTarget(document)
    const pointerLocation = repeatedDocumentPointsAt(inputRef.current.pointer.clientX, inputRef.current.pointer.clientY)
    const point = pointerLocation?.local ?? inputRef.current.pointer.point
    const index = target ? tilemapCellIndexAtPoint(target.tilemap, target.surface.offsetX, target.surface.offsetY, point.x, point.y) : null
    const drawing = drag?.kind === 'tile-draw'
    const previewSelection = drawing && drag ? paintSelectionForDrag(drag) : null
    if (target && index !== null && tilemapCellAllowedBySelection(target, index, previewSelection)) {
      const bounds = tilemapCellBounds(target.tilemap, target.surface.offsetX, target.surface.offsetY, index)
      const selectedTileset = document.tilesets?.find(
        (tileset) =>
          tileset.id === currentSession.selectedTilesetId && tileset.tileWidth === target.tilemap.tileWidth && tileset.tileHeight === target.tilemap.tileHeight
      )
      const selectedTileId = selectedTileset?.tileIds.includes(currentSession.selectedTileId ?? '') ? currentSession.selectedTileId : null
      const previewCell: TilemapCell | null =
        drag?.kind === 'tile-draw'
          ? (drag.tilemapCell ?? null)
          : session.tool === 'eraser'
            ? null
            : selectedTileset && selectedTileId
              ? { tilesetId: selectedTileset.id, tileId: selectedTileId }
              : null
      const previewTileset = previewCell ? document.tilesets?.find((tileset) => tileset.id === previewCell.tilesetId) : null
      const previewPixels =
        previewCell && previewTileset && previewTileset.tileWidth === target.tilemap.tileWidth && previewTileset.tileHeight === target.tilemap.tileHeight
          ? readTilesetTilePixels(previewTileset, previewCell.tileId)
          : null
      const drawFullPreview = !drawing && (brushPreviewMode === 'full' || brushPreviewMode === 'full-edge')
      const drawPreviewOutline = brushPreviewMode === 'edge' || brushPreviewMode === 'full-edge' || (session.tool === 'eraser' && brushPreviewMode === 'full')
      if (session.tool === 'eraser' || previewPixels) {
        for (const copy of repeatCopies) {
          if (bounds.x + bounds.width <= copy.fromX || bounds.y + bounds.height <= copy.fromY || bounds.x >= copy.toX || bounds.y >= copy.toY) continue
          context.save()
          clipCanvasCopy(context, copy)
          if (drawFullPreview) {
            for (let y = 0; y < bounds.height; y += 1)
              for (let x = 0; x < bounds.width; x += 1) {
                const pixelX = bounds.x + x
                const pixelY = bounds.y + y
                if (pixelX < 0 || pixelY < 0 || pixelX >= document.width || pixelY >= document.height) continue
                const source = previewCell ? tilemapSourcePointForCell(x, y, bounds.width, bounds.height, previewCell) : { x, y }
                const offset = (source.y * bounds.width + source.x) * 4
                const replacement = resolveLayerCanvasColor(
                  document,
                  activeLayer,
                  previewPixels
                    ? {
                        r: previewPixels[offset],
                        g: previewPixels[offset + 1],
                        b: previewPixels[offset + 2],
                        a: previewPixels[offset + 3]
                      }
                    : TRANSPARENT
                )
                const color = isolatedLayerMask ? layerMaskDisplayColor(replacement) : compositePointReplacementSampler(pixelX, pixelY, replacement)
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
            context.lineWidth = brushEdgeThickness
            alignCanvasStrokePath(context)
            const outline = new CanvasAdaptiveOutline()
            const rect = { x: copy.originX + bounds.x * view.zoom, y: copy.originY + bounds.y * view.zoom, width: bounds.width * view.zoom, height: bounds.height * view.zoom }
            outline.include(rect)
            context.beginPath()
            context.rect(rect.x, rect.y, rect.width, rect.height)
            outline.stroke(context, undefined, brushEdgeColor)
          }
          context.restore()
        }
      }
    }
  }
}
