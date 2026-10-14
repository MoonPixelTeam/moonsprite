import type { RgbaColor } from '@shared/types-color'
import { layerMaskDisplayColor, resolveLayerCanvasColor } from '@/core/document-model'
import { relativeLuminanceColor } from '@/core/raster'
import { selectionTranslationPreviewEdit } from '@/core/tools-selection-transform'
import { deviceAlignedPixelRect } from '@/core/canvas-render-plan'
import { type CanvasDragState as DragState } from '@/core/canvas-input'
import { transparencyColorAt } from '@/core/canvas-visuals'
import { type RasterContext2D } from '@/components/canvas-selection-renderer'
import { activeTilemapCelTarget, tilemapEditPreviewTilePixels } from '@/core/tilemap-document'
import { tilemapSourcePointForCell } from '@/core/tilemap'
import { clearTilesetTilePreview, publishTilesetTilePreview } from '@/components/tileset-preview-events'
import type * as React from 'react'
import type { DocumentSession } from '@/store/workspace-types'
export function createCanvasTilePreview({
  document,
  repeatCopies,
  context,
  clipCanvasCopy,
  activeLayer,
  isolatedLayerMask,
  compositePointReplacementSampler,
  view,
  deviceScale,
  checkerboard
}: {
  document: import('@shared/types-document').SpriteDocument
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
}) {
  const pendingTilesetTilePreview: { current: { tilesetId: string; tiles: ReadonlyMap<string, Uint8ClampedArray> } | null } = { current: null }
  const queueTilesetTilePreview = (tilesetId: string | undefined, tiles: ReadonlyMap<string, Uint8ClampedArray>): void => {
    if (!tilesetId || tiles.size === 0) return
    pendingTilesetTilePreview.current = { tilesetId, tiles }
  }
  const drawTilemapEditPreviewTiles = (previewTiles: ReadonlyMap<string, Uint8ClampedArray>): boolean => {
    const target = activeTilemapCelTarget(document)
    const tilesetId = target?.layer.tilemapTilesetId
    if (!target || !tilesetId || previewTiles.size === 0) return false
    for (const copy of repeatCopies) {
      const fromColumn = Math.max(0, Math.floor((copy.fromX - target.surface.offsetX) / target.tilemap.tileWidth))
      const fromRow = Math.max(0, Math.floor((copy.fromY - target.surface.offsetY) / target.tilemap.tileHeight))
      const toColumn = Math.min(target.tilemap.columns, Math.ceil((copy.toX - target.surface.offsetX) / target.tilemap.tileWidth))
      const toRow = Math.min(target.tilemap.rows, Math.ceil((copy.toY - target.surface.offsetY) / target.tilemap.tileHeight))
      if (toColumn <= fromColumn || toRow <= fromRow) continue
      context.save()
      clipCanvasCopy(context, copy)
      for (let row = fromRow; row < toRow; row += 1)
        for (let column = fromColumn; column < toColumn; column += 1) {
          const cell = target.tilemap.cells[row * target.tilemap.columns + column]
          const tilePixels = cell?.tilesetId === tilesetId ? previewTiles.get(cell.tileId) : undefined
          if (!cell || !tilePixels) continue
          const startX = target.surface.offsetX + column * target.tilemap.tileWidth
          const startY = target.surface.offsetY + row * target.tilemap.tileHeight
          for (let y = 0; y < target.tilemap.tileHeight; y += 1)
            for (let x = 0; x < target.tilemap.tileWidth; x += 1) {
              const source = tilemapSourcePointForCell(x, y, target.tilemap.tileWidth, target.tilemap.tileHeight, cell)
              const offset = (source.y * target.tilemap.tileWidth + source.x) * 4
              const pixelX = startX + x
              const pixelY = startY + y
              const replacement = resolveLayerCanvasColor(document, activeLayer, {
                r: tilePixels[offset],
                g: tilePixels[offset + 1],
                b: tilePixels[offset + 2],
                a: tilePixels[offset + 3]
              })
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
      context.restore()
    }
    return true
  }
  return { pendingTilesetTilePreview, queueTilesetTilePreview, drawTilemapEditPreviewTiles }
}

export function publishCanvasTilePreview({
  drag,
  document,
  currentSession,
  currentActiveLayer,
  tilemapEditCreatesFirstTile,
  drawTilemapEditPreviewTiles,
  queueTilesetTilePreview,
  pendingTilesetTilePreview,
  publishedTilesetPreviewRef
}: {
  drag: DragState | null
  document: import('@shared/types-document').SpriteDocument
  currentSession: DocumentSession
  currentActiveLayer: import('@shared/types-layer').RasterLayer
  tilemapEditCreatesFirstTile: (current?: import('@/store/workspace-types').DocumentSession) => boolean
  drawTilemapEditPreviewTiles: (previewTiles: ReadonlyMap<string, Uint8ClampedArray>) => boolean
  queueTilesetTilePreview: (tilesetId: string | undefined, tiles: ReadonlyMap<string, Uint8ClampedArray>) => void
  pendingTilesetTilePreview: {
    current: {
      tilesetId: string
      tiles: ReadonlyMap<string, Uint8ClampedArray>
    } | null
  }
  publishedTilesetPreviewRef: React.RefObject<string | null>
}) {
  const tilemapFloatingPreview =
    drag?.previewEdit ??
    (drag?.translationPreview ? selectionTranslationPreviewEdit(document, drag.translationPreview) : null) ??
    currentSession.pendingPaste?.previewEdit ??
    (currentSession.pendingPaste?.translationPreview ? selectionTranslationPreviewEdit(document, currentSession.pendingPaste.translationPreview) : null)
  const tilemapPreviewEdit = drag?.edit ?? tilemapFloatingPreview
  const tilemapPreviewCellIndex = drag?.tilemapEditCellIndex ?? currentSession.pendingPaste?.tilemapEditCellIndex
  const hybridSelectionVariantPreview =
    currentSession.tilemapMode === 'hybrid' && (drag?.selectionSource?.origin === 'selection' || currentSession.pendingPaste?.source.origin === 'selection')
  if (
    currentActiveLayer.kind === 'tilemap' &&
    (currentSession.tilemapMode === 'edit' || currentSession.tilemapMode === 'hybrid') &&
    !tilemapEditCreatesFirstTile(currentSession) &&
    !hybridSelectionVariantPreview &&
    tilemapPreviewEdit
  ) {
    const previewTiles = tilemapEditPreviewTilePixels(document, tilemapPreviewEdit, tilemapPreviewCellIndex)
    drawTilemapEditPreviewTiles(previewTiles)
    queueTilesetTilePreview(currentActiveLayer.tilemapTilesetId, previewTiles)
  }
  const nextTilesetPreview = pendingTilesetTilePreview.current
  if (nextTilesetPreview) {
    const previousTilesetId = publishedTilesetPreviewRef.current
    if (previousTilesetId && previousTilesetId !== nextTilesetPreview.tilesetId) clearTilesetTilePreview(document.id, previousTilesetId)
    publishTilesetTilePreview({ documentId: document.id, ...nextTilesetPreview })
    publishedTilesetPreviewRef.current = nextTilesetPreview.tilesetId
  } else if (publishedTilesetPreviewRef.current) {
    clearTilesetTilePreview(document.id, publishedTilesetPreviewRef.current)
    publishedTilesetPreviewRef.current = null
  }
}
