import { isWorkspaceResizing, recordWorkspaceResizeStage } from './workspace-resize'
import { measureRuntimeDiagnostic } from '../core/runtime-diagnostics'
import { documentDiagnosticDetail } from '../core/document-diagnostics'
import type { RgbaColor } from '@shared/types-color'
import type { SelectionRect } from '@shared/types-selection'
import { shouldRenderPixelGrid } from '@/core/grid'
import { animationLoopSectionAtFrame } from '@/core/animation-loop-sections'
import { deviceAlignedCanvasRect } from '@/core/canvas-render-plan'
import { layerMovePreviewActive, type CanvasDragState as DragState } from '@/core/canvas-input'
import { colorLuminance } from '@/core/canvas-visuals'
import { type RasterContext2D } from '@/components/canvas-selection-renderer'
import { onionSkinFrameRefs } from '@/core/onion-skin'
import { parseAnimationCelKey } from '@/core/animation'
import { activeTilemapCelTarget } from '@/core/tilemap-document'
import { readTilesetTilePixels, tilemapCellBounds } from '@/core/tilemap'
import { freeTileInstanceBounds, freeTileSourceForInstance, freeTileSourcePointForInstance, freeTileTileIdForInstance } from '@/core/free-tile'
import { activeFreeTileCelTarget } from '@/core/free-tile-document'
import type * as React from 'react'
import type { DocumentSession } from '@/store/workspace-types'
import { MoveLayerClickFlash, FreeTileInstanceFlash } from './canvas-stage-helpers'
export function renderCanvasContent({
  repeatCopies,
  isolatedLayerMask,
  timelineHidden,
  onionSkin,
  currentSession,
  onionSkinCacheRef,
  context,
  renderCanvasWidth,
  renderCanvasHeight,
  view,
  onionSkinInvalidation,
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
  timelineHidden: boolean
  onionSkin: import('@/core/file-preferences').OnionSkinPreferences
  currentSession: DocumentSession
  onionSkinCacheRef: React.RefObject<import('@/components/onion-skin-composite-cache').OnionSkinCompositeCache>
  context: RasterContext2D
  renderCanvasWidth: number
  renderCanvasHeight: number
  view: import('@shared/types-view').ViewState
  onionSkinInvalidation:
    | {
        kind: 'full'
        fromRevision: number
        revision: number
        frameId: undefined
      }
    | ({
        kind: 'full'
      } & {
        fromRevision: number
        revision: number
      })
    | ({
        kind: 'region'
        frameId?: string
        rect: SelectionRect
      } & {
        fromRevision: number
        revision: number
      })
    | null
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
  let paintedMoveLayerFlash: MoveLayerClickFlash | null = null
  for (const copy of repeatCopies) {
    if (copy.toX <= copy.fromX || copy.toY <= copy.fromY) continue
    if (!isolatedLayerMask && !timelineHidden && onionSkin.enabled && !currentSession.animationPlaying) {
      const timeline = currentSession.document.animation
      if (timeline && timeline.frames.length > 1) {
        const loopSection = animationLoopSectionAtFrame(timeline, timeline.activeFrameId)
        const refs = onionSkinFrameRefs(timeline, onionSkin.previousFrames, onionSkin.nextFrames, loopSection)
        onionSkinCacheRef.current.draw({
          context,
          document: currentSession.document,
          refs,
          style: onionSkin,
          originX: copy.originX,
          originY: copy.originY,
          canvasWidth: renderCanvasWidth,
          canvasHeight: renderCanvasHeight,
          fromX: copy.fromX,
          fromY: copy.fromY,
          toX: copy.toX,
          toY: copy.toY,
          zoom: view.zoom,
          revision: currentSession.contentRevision,
          invalidation: onionSkinInvalidation,
          imageSmoothingEnabled: smoothPixelSampling,
          devicePixelRatio: deviceScale
        })
      }
    }
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
    const textPreview = textToolPreviewRef.current
    if (textPreview?.format === 'rgba') {
      const previewCanvas = new OffscreenCanvas(textPreview.width, textPreview.height)
      const previewContext = previewCanvas.getContext('2d')
      previewContext?.putImageData(new ImageData(textPreview.pixels.slice(), textPreview.width, textPreview.height), 0, 0)
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
      context.drawImage(previewCanvas, textBoundary.left, textBoundary.top, textBoundary.width, textBoundary.height)
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
    let freeTileFlash = freeTileInstanceFlashRef.current
    if (freeTileFlash && performance.now() >= freeTileFlash.expiresAt) {
      freeTileInstanceFlashRef.current = null
      freeTileFlash = null
    }
    if (freeTileFlash && currentActiveLayer.kind === 'free-tile') {
      const target = activeFreeTileCelTarget(document)
      const instance = target?.freeTiles.instances.find((candidate) => candidate.id === freeTileFlash!.instanceId) ?? null
      const source = target && instance ? freeTileSourceForInstance(target.sources, instance) : null
      const tileId = target && instance ? freeTileTileIdForInstance(target.sources, instance) : null
      const pixels = source && tileId ? readTilesetTilePixels(source.tileset, tileId) : null
      if (target && instance && source && pixels && source.visible) {
        const bounds = freeTileInstanceBounds(instance, target.sources, target.surface.offsetX, target.surface.offsetY)
        const visibleX = Math.max(0, Math.floor(copy.fromX), bounds.x)
        const visibleY = Math.max(0, Math.floor(copy.fromY), bounds.y)
        const visibleRight = Math.min(document.width, Math.ceil(copy.toX), bounds.x + bounds.width)
        const visibleBottom = Math.min(document.height, Math.ceil(copy.toY), bounds.y + bounds.height)
        const visibleWidth = Math.max(0, visibleRight - visibleX)
        const visibleHeight = Math.max(0, visibleBottom - visibleY)
        if (visibleWidth > 0 && visibleHeight > 0) {
          const flashPixels = new Uint8ClampedArray(visibleWidth * visibleHeight * 4)
          for (let y = 0; y < visibleHeight; y += 1)
            for (let x = 0; x < visibleWidth; x += 1) {
              const sourcePoint = freeTileSourcePointForInstance(instance, source, visibleX + x, visibleY + y, target.surface.offsetX, target.surface.offsetY)
              if (!sourcePoint) continue
              const sourceOffset = (sourcePoint.y * source.tileset.tileWidth + sourcePoint.x) * 4
              const alpha = pixels[sourceOffset + 3]
              if (alpha === 0) continue
              const sourceColor = { r: pixels[sourceOffset], g: pixels[sourceOffset + 1], b: pixels[sourceOffset + 2], a: alpha }
              const value = colorLuminance(sourceColor) > 145 ? 0 : 255
              const offset = (y * visibleWidth + x) * 4
              flashPixels[offset] = value
              flashPixels[offset + 1] = value
              flashPixels[offset + 2] = value
              flashPixels[offset + 3] = alpha
            }
          const flashCanvas = new OffscreenCanvas(visibleWidth, visibleHeight)
          flashCanvas.getContext('2d')?.putImageData(new ImageData(flashPixels, visibleWidth, visibleHeight), 0, 0)
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
          context.drawImage(flashCanvas, flashBoundary.left, flashBoundary.top, flashBoundary.width, flashBoundary.height)
          context.restore()
        }
      }
    }
    if (view.showPixelGrid && shouldRenderPixelGrid(view.zoom)) drawGrid(0, 0, 1, 1, gridColors.pixelGridColor, copy)
    if (view.isoViewEnabled) drawIsoGuides(copy)
  }
  if (inputRef.current.ctrlHeld && currentActiveLayer.kind === 'tilemap') {
    const target = activeTilemapCelTarget(document)
    if (target) {
      const tilesetsById = new Map((document.tilesets ?? []).map((tileset) => [tileset.id, tileset]))
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
            const tileset = tilesetsById.get(cell.tilesetId)
            const tileIndex = tileset?.tileIds.indexOf(cell.tileId) ?? -1
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
