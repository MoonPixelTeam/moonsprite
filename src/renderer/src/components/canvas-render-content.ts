import { isWorkspaceResizing, recordWorkspaceResizeStage } from './workspace-resize'
import { measureRuntimeDiagnostic } from '../core/runtime-diagnostics'
import { documentDiagnosticDetail } from '../core/document-diagnostics'
import type { RgbaColor } from '@shared/types-color'
import type { SelectionRect } from '@shared/types-selection'
import type { FreeTileInstance } from '@shared/types-tiles'
import { shouldRenderPixelGrid } from '@/core/grid'
import { deviceAlignedCanvasRect } from '@/core/canvas-render-plan'
import { layerMovePreviewActive, type CanvasDragState as DragState } from '@/core/canvas-input'
import { colorLuminance } from '@/core/canvas-visuals'
import { type RasterContext2D } from '@/components/canvas-selection-renderer'
import { parseAnimationCelKey } from '@/core/animation'
import { activeTilemapCelTarget } from '@/core/tilemap-document'
import { readTilesetTilePixels, tilemapCellBounds } from '@/core/tilemap'
import { freeTileInstanceBounds, freeTileSourceForInstance, freeTileSourcePointForInstance, freeTileTileIdForInstance } from '@/core/free-tile'
import { activeFreeTileCelTarget } from '@/core/free-tile-document'
import type * as React from 'react'
import type { DocumentSession } from '@/store/workspace-types'
import { MoveLayerClickFlash, FreeTileInstanceFlash } from './canvas-stage-helpers'
import { drawAnimationTweenPreview } from './animation-tween-preview'

type FreeTileSourceRef = NonNullable<ReturnType<typeof freeTileSourceForInstance>>

export const buildFreeTileFlashPixels = (instance: FreeTileInstance, source: FreeTileSourceRef, pixels: Uint8ClampedArray, bounds: SelectionRect, offsetX: number, offsetY: number): Uint8ClampedArray => {
  const width = Math.max(0, bounds.width), height = Math.max(0, bounds.height)
  const output = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const sourcePoint = freeTileSourcePointForInstance(instance, source, bounds.x + x, bounds.y + y, offsetX, offsetY)
    if (!sourcePoint) continue
    const sourceOffset = (sourcePoint.y * source.tileset.tileWidth + sourcePoint.x) * 4
    const alpha = pixels[sourceOffset + 3]
    if (alpha === 0) continue
    const value = colorLuminance({ r: pixels[sourceOffset], g: pixels[sourceOffset + 1], b: pixels[sourceOffset + 2], a: alpha }) > 145 ? 0 : 255
    const offset = (y * width + x) * 4
    output[offset] = value
    output[offset + 1] = value
    output[offset + 2] = value
    output[offset + 3] = alpha
  }
  return output
}
export function renderCanvasContent({
  repeatCopies,
  isolatedLayerMask,
  currentSession,
  context,
  renderCanvasWidth,
  renderCanvasHeight,
  view,
  smoothPixelSampling,
  deviceScale,
  compositeCacheRef,
  document,
  pixelSamplingQuality,
  viewPreviewActive,
  activeDrag,
  selectionPreviewOwner,
  currentActiveLayer,
  textToolPreviewRef,
  clipCanvasCopy,
  moveLayerClickFlashEnabled,
  moveLayerClickFlashRef,
  clickFlashCacheRef,
  freeTileInstanceFlashRef,
  drawGrid,
  gridColors,
  drawIsoGuides,
  inputRef
}: {
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
  isolatedLayerMask: import('@shared/types-layer').LayerMask | null
  currentSession: DocumentSession
  context: RasterContext2D
  renderCanvasWidth: number
  renderCanvasHeight: number
  view: import('@shared/types-view').ViewState
  smoothPixelSampling: boolean
  deviceScale: import('@/core/canvas-render-plan').CanvasDeviceScale
  compositeCacheRef: React.RefObject<import('@/components/canvas-composite-cache').CanvasCompositeCache>
  document: import('@shared/types-document').SpriteDocument
  pixelSamplingQuality: 'high' | 'low'
  viewPreviewActive: boolean
  activeDrag: DragState | null
  selectionPreviewOwner: 'active' | 'pending' | null
  currentActiveLayer: import('@shared/types-layer').RasterLayer
  textToolPreviewRef: React.RefObject<import('@shared/types-animation').AnimationCelSurface | null>
  clipCanvasCopy: (
    targetContext: RasterContext2D,
    copy: {
      x: number
      y: number
    }
  ) => void
  moveLayerClickFlashEnabled: boolean
  moveLayerClickFlashRef: React.RefObject<MoveLayerClickFlash | null>
  clickFlashCacheRef: React.RefObject<import('@/components/canvas-click-flash').CanvasClickFlashCache>
  freeTileInstanceFlashRef: React.RefObject<FreeTileInstanceFlash | null>
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
  drawIsoGuides: (copy: { x: number; y: number; originX: number; originY: number; fromX: number; fromY: number; toX: number; toY: number }) => void
  inputRef: React.RefObject<import('@/core/canvas-input').CanvasInputState>
}) {
  // Build repeat-invariant overlay resources once per canvas paint. Text and
  // tilemap overlays are drawn for every repeat copy, so allocating a canvas
  // or searching a tileset array inside that loop multiplies work with the
  // repeat count (large tilemap views can have dozens of copies).
  const textPreview = textToolPreviewRef.current
  const textPreviewCanvas = textPreview?.format === 'rgba'
    ? (() => {
        const canvas = new OffscreenCanvas(textPreview.width, textPreview.height)
        canvas.getContext('2d')?.putImageData(new ImageData(textPreview.pixels.slice(), textPreview.width, textPreview.height), 0, 0)
        return canvas
      })()
    : null
  let freeTileFlash = freeTileInstanceFlashRef.current
  if (freeTileFlash && performance.now() >= freeTileFlash.expiresAt) {
    freeTileInstanceFlashRef.current = null
    freeTileFlash = null
  }
  const freeTileOverlay = (() => {
    if (!freeTileFlash || currentActiveLayer.kind !== 'free-tile') return null
    const target = activeFreeTileCelTarget(document)
    const instance = target?.freeTiles.instances.find((candidate) => candidate.id === freeTileFlash!.instanceId) ?? null
    const source = target && instance ? freeTileSourceForInstance(target.sources, instance) : null
    const tileId = target && instance ? freeTileTileIdForInstance(target.sources, instance) : null
    const pixels = source && tileId ? readTilesetTilePixels(source.tileset, tileId) : null
    if (!target || !instance || !source || !pixels || !source.visible) return null
    const bounds = freeTileInstanceBounds(instance, target.sources, target.surface.offsetX, target.surface.offsetY)
    const left = Math.max(0, bounds.x), top = Math.max(0, bounds.y)
    const right = Math.min(document.width, bounds.x + bounds.width), bottom = Math.min(document.height, bounds.y + bounds.height)
    const visibleBounds = { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) }
    if (!visibleBounds.width || !visibleBounds.height) return null
    const flashPixels = buildFreeTileFlashPixels(instance, source, pixels, visibleBounds, target.surface.offsetX, target.surface.offsetY)
    const canvas = new OffscreenCanvas(visibleBounds.width, visibleBounds.height)
    canvas.getContext('2d')?.putImageData(new ImageData(flashPixels as Uint8ClampedArray<ArrayBuffer>, visibleBounds.width, visibleBounds.height), 0, 0)
    return { canvas, bounds: visibleBounds }
  })()
  let paintedMoveLayerFlash: MoveLayerClickFlash | null = null
  for (const copy of repeatCopies) {
    if (copy.toX <= copy.fromX || copy.toY <= copy.fromY) continue
    const compositeStarted = isWorkspaceResizing() ? performance.now() : 0
    measureRuntimeDiagnostic(
      'canvas.composite',
      () =>
        compositeCacheRef.current.draw({
          context,
          document,
          view,
          originX: copy.originX,
          originY: copy.originY,
          canvasWidth: renderCanvasWidth,
          canvasHeight: renderCanvasHeight,
          fromX: copy.fromX,
          fromY: copy.fromY,
          toX: copy.toX,
          toY: copy.toY,
          revision: currentSession.revision,
          contentRevision: currentSession.contentRevision,
          contentInvalidation: currentSession.contentInvalidation,
          frameId: document.animation?.activeFrameId,
          isolatedLayerMask: isolatedLayerMask ?? undefined,
          imageSmoothingEnabled: smoothPixelSampling,
          imageSmoothingQuality: pixelSamplingQuality,
          fastViewPreview: viewPreviewActive,
          liveRasterEdit: activeDrag?.kind === 'draw' || activeDrag?.kind === 'airbrush' || activeDrag?.kind === 'liquify' || activeDrag?.kind === 'smooth',
          animationPlayback: currentSession.animationPlaying,
          devicePixelRatio: deviceScale,
          movingLayerIds:
            layerMovePreviewActive(activeDrag) && !activeDrag.duplicatedLayer
              ? activeDrag.animationCellKeys?.length
                ? [...new Set(activeDrag.animationCellKeys.map((key) => parseAnimationCelKey(key)?.layerId).filter((id): id is string => Boolean(id)))]
                : activeDrag.layerIds
              : undefined,
          selectionPreview:
            selectionPreviewOwner === 'active' && activeDrag?.selectionSource && activeDrag.previewTarget
              ? {
                  layerId: currentActiveLayer.id,
                  source: activeDrag.selectionSource,
                  target: activeDrag.previewTarget,
                  angle: activeDrag.previewAngle ?? 0,
                  shear: activeDrag.previewShear,
                  quad: activeDrag.previewQuad,
                  copy: Boolean(activeDrag.copy),
                  optimizedRotation: currentSession.selectionRotationAlgorithm === 'rotsprite'
                }
              : selectionPreviewOwner === 'pending' && currentSession.pendingPaste
                ? {
                    layerId: currentSession.pendingPaste.layerId,
                    source: currentSession.pendingPaste.source,
                    target: currentSession.pendingPaste.transformTarget ?? currentSession.pendingPaste.target,
                    angle: currentSession.pendingPaste.transformAngle ?? 0,
                    shear: currentSession.pendingPaste.transformShear,
                    quad: currentSession.pendingPaste.transformQuad,
                    copy: currentSession.pendingPaste.copy,
                    optimizedRotation: currentSession.selectionRotationAlgorithm === 'rotsprite'
                  }
                : undefined
        }),
      () => ({ ...documentDiagnosticDetail(document), tool: currentSession.tool, gesture: activeDrag?.kind ?? 'none' })
    )
    if (compositeStarted) recordWorkspaceResizeStage('composite', performance.now() - compositeStarted)
    context.save()
    clipCanvasCopy(context, copy)
    drawAnimationTweenPreview(context, currentSession.document.id, copy.originX, copy.originY, view.zoom, deviceScale)
    context.restore()
    if (textPreview && textPreviewCanvas) {
      context.save()
      clipCanvasCopy(context, copy)
      context.imageSmoothingEnabled = false
      const textBoundary = deviceAlignedCanvasRect(
        copy.originX + textPreview.offsetX * view.zoom,
        copy.originY + textPreview.offsetY * view.zoom,
        textPreview.width * view.zoom,
        textPreview.height * view.zoom,
        deviceScale
      )
      context.drawImage(textPreviewCanvas, textBoundary.left, textBoundary.top, textBoundary.width, textBoundary.height)
      context.restore()
    }
    let moveLayerFlash = moveLayerClickFlashEnabled ? moveLayerClickFlashRef.current : null
    if (moveLayerFlash && moveLayerFlash.expiresAt !== null && performance.now() >= moveLayerFlash.expiresAt) {
      moveLayerClickFlashRef.current = null
      moveLayerFlash = null
    }
    if (moveLayerFlash) {
      const layer = document.layers.find((candidate) => candidate.id === moveLayerFlash.layerId)
      if (layer) {
        const currentX = moveLayerFlash.bounds.x + layer.offsetX - moveLayerFlash.layerOffsetX
        const currentY = moveLayerFlash.bounds.y + layer.offsetY - moveLayerFlash.layerOffsetY
        const visibleX = Math.max(0, Math.floor(copy.fromX), currentX)
        const visibleY = Math.max(0, Math.floor(copy.fromY), currentY)
        const visibleRight = Math.min(document.width, Math.ceil(copy.toX), currentX + moveLayerFlash.bounds.width)
        const visibleBottom = Math.min(document.height, Math.ceil(copy.toY), currentY + moveLayerFlash.bounds.height)
        const visibleWidth = Math.max(0, visibleRight - visibleX)
        const visibleHeight = Math.max(0, visibleBottom - visibleY)
        if (visibleWidth > 0 && visibleHeight > 0) {
          context.save()
          clipCanvasCopy(context, copy)
          context.globalCompositeOperation = 'source-over'
          context.imageSmoothingEnabled = false
          const layerOffsetX = layer.offsetX,
            layerOffsetY = layer.offsetY
          const frameId = document.animation?.activeFrameId
          const ready = clickFlashCacheRef.current.draw(context, {
            contentKey: `${document.id}:${currentSession.contentRevision}:${frameId}:${layer.id}:${layerOffsetX}:${layerOffsetY}`,
            region: { x: visibleX, y: visibleY, width: visibleWidth, height: visibleHeight },
            originX: copy.originX,
            originY: copy.originY,
            zoom: view.zoom,
            deviceScale,
            layer,
            palette: document.palette
          })
          if (ready) paintedMoveLayerFlash = moveLayerFlash
          context.restore()
        }
      }
    }
    if (freeTileOverlay) {
        const visibleX = Math.max(Math.floor(copy.fromX), freeTileOverlay.bounds.x)
        const visibleY = Math.max(Math.floor(copy.fromY), freeTileOverlay.bounds.y)
        const visibleRight = Math.min(Math.ceil(copy.toX), freeTileOverlay.bounds.x + freeTileOverlay.bounds.width)
        const visibleBottom = Math.min(Math.ceil(copy.toY), freeTileOverlay.bounds.y + freeTileOverlay.bounds.height)
        const visibleWidth = Math.max(0, visibleRight - visibleX)
        const visibleHeight = Math.max(0, visibleBottom - visibleY)
        if (visibleWidth > 0 && visibleHeight > 0) {
          context.save()
          clipCanvasCopy(context, copy)
          context.globalCompositeOperation = 'source-over'
          context.imageSmoothingEnabled = false
          const flashBoundary = deviceAlignedCanvasRect(
            copy.originX + visibleX * view.zoom,
            copy.originY + visibleY * view.zoom,
            visibleWidth * view.zoom,
            visibleHeight * view.zoom,
            deviceScale
          )
          context.drawImage(freeTileOverlay.canvas, visibleX - freeTileOverlay.bounds.x, visibleY - freeTileOverlay.bounds.y, visibleWidth, visibleHeight, flashBoundary.left, flashBoundary.top, flashBoundary.width, flashBoundary.height)
          context.restore()
        }
    }
    if (view.showPixelGrid && shouldRenderPixelGrid(view.zoom)) drawGrid(0, 0, 1, 1, gridColors.pixelGridColor, copy)
    if (view.isoViewEnabled) drawIsoGuides(copy)
  }
  if (inputRef.current.ctrlHeld && currentActiveLayer.kind === 'tilemap') {
    const target = activeTilemapCelTarget(document)
    if (target) {
      const tileIndexesByTilesetId = new Map<string, Map<string, number>>()
      for (const tileset of document.tilesets ?? []) {
        const indexes = new Map<string, number>()
        for (let index = 0; index < tileset.tileIds.length; index += 1) if (!indexes.has(tileset.tileIds[index])) indexes.set(tileset.tileIds[index], index)
        tileIndexesByTilesetId.set(tileset.id, indexes)
      }
      const cellScreenWidth = target.tilemap.tileWidth * view.zoom
      const cellScreenHeight = target.tilemap.tileHeight * view.zoom
      const badgeSize = Math.max(12, Math.min(24, Math.floor(Math.min(cellScreenWidth, cellScreenHeight) - 4)))
      const fontSize = Math.max(10, Math.min(14, badgeSize - 4))
      for (const copy of repeatCopies) {
        const fromColumn = Math.max(0, Math.floor((copy.fromX - target.surface.offsetX) / target.tilemap.tileWidth))
        const fromRow = Math.max(0, Math.floor((copy.fromY - target.surface.offsetY) / target.tilemap.tileHeight))
        const toColumn = Math.min(target.tilemap.columns, Math.ceil((copy.toX - target.surface.offsetX) / target.tilemap.tileWidth))
        const toRow = Math.min(target.tilemap.rows, Math.ceil((copy.toY - target.surface.offsetY) / target.tilemap.tileHeight))
        if (toColumn <= fromColumn || toRow <= fromRow) continue
        context.save()
        clipCanvasCopy(context, copy)
        context.textAlign = 'center'
        context.textBaseline = 'middle'
        context.font = `700 ${fontSize}px ui-monospace, Consolas, monospace`
        for (let row = fromRow; row < toRow; row += 1)
          for (let column = fromColumn; column < toColumn; column += 1) {
            const cellIndex = row * target.tilemap.columns + column
            const cell = target.tilemap.cells[cellIndex]
            if (!cell) continue
            const tileIndex = tileIndexesByTilesetId.get(cell.tilesetId)?.get(cell.tileId) ?? -1
            if (tileIndex < 0) continue
            const bounds = tilemapCellBounds(target.tilemap, target.surface.offsetX, target.surface.offsetY, cellIndex)
            const centerX = copy.originX + (bounds.x + bounds.width / 2) * view.zoom
            const centerY = copy.originY + (bounds.y + bounds.height / 2) * view.zoom
            const left = Math.round(centerX - badgeSize / 2)
            const top = Math.round(centerY - badgeSize / 2)
            context.fillStyle = '#0000ff'
            context.fillRect(left, top, badgeSize, badgeSize)
            context.fillStyle = '#fff'
            context.fillText(String(tileIndex), left + badgeSize / 2, top + badgeSize / 2 + 0.5)
          }
        context.restore()
      }
    }
  }
  return { paintedMoveLayerFlash }
}
