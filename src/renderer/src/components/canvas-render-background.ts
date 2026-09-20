import type { RgbaColor } from '@shared/types-color'
import { gridLinePositions } from '@/core/grid'
import { deviceAlignedCanvasRect, deviceAlignedCoordinate } from '@/core/canvas-render-plan'
import { isoGuidePixelPattern, isoGuideSegments, isoGuideSpacingForZoom } from '@/core/isometric'
import { type RasterContext2D } from '@/components/canvas-selection-renderer'
import type * as React from 'react'
export function createCanvasBackground({
  checkerboard,
  view,
  repeatCopies,
  canvasBoundaryFor,
  context,
  clipCanvasCopy,
  checkerboardTileRef,
  renderCanvasWidth,
  renderCanvasHeight,
  viewport,
  document,
  deviceScale,
  isoViewPreferences,
  isoGuideTileRef
}: {
  checkerboard: import('@/core/file-preferences').CheckerboardPreferences
  view: import('@shared/types-view').ViewState
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
  canvasBoundaryFor: (copy: { x: number; y: number }) => ReturnType<typeof deviceAlignedCanvasRect>
  context: RasterContext2D
  clipCanvasCopy: (
    targetContext: RasterContext2D,
    copy: {
      x: number
      y: number
    }
  ) => void
  checkerboardTileRef: React.RefObject<{
    key: string
    canvas: OffscreenCanvas
  } | null>
  renderCanvasWidth: number
  renderCanvasHeight: number
  viewport: import('@/core/view-geometry').ViewportBounds
  document: import('@shared/types-document').SpriteDocument
  deviceScale: import('@/core/canvas-render-plan').CanvasDeviceScale
  isoViewPreferences: import('@/core/file-preferences').IsoViewPreferences
  isoGuideTileRef: React.RefObject<{
    key: string
    canvas: OffscreenCanvas
  } | null>
}) {
  const checkerCell = checkerboard.size * view.zoom
  const drawCheckerboard = (copy: (typeof repeatCopies)[number]): void => {
    const boundary = canvasBoundaryFor(copy)
    context.save()
    clipCanvasCopy(context, copy)
    context.fillStyle = `rgb(${checkerboard.lightColor.r} ${checkerboard.lightColor.g} ${checkerboard.lightColor.b})`
    context.fillRect(boundary.left, boundary.top, boundary.width, boundary.height)
    if (checkerCell >= 2) {
      const tileKey = `checker-v2:${checkerboard.lightColor.r},${checkerboard.lightColor.g},${checkerboard.lightColor.b}:${checkerboard.darkColor.r},${checkerboard.darkColor.g},${checkerboard.darkColor.b}`
      let pattern: CanvasPattern | null = null
      if (typeof context.createPattern === 'function') {
        let tile = checkerboardTileRef.current
        // A fixed tile also covers fractional zoom. Rebuilding or individually
        // drawing thousands of small squares stalls navigation at overview scale.
        const tileSize = 1
        if (!tile || tile.key !== tileKey || tile.canvas.width !== tileSize * 2 || tile.canvas.height !== tileSize * 2) {
          const canvas = new OffscreenCanvas(tileSize * 2, tileSize * 2)
          const tileContext = canvas.getContext('2d')
          if (tileContext) {
            tileContext.fillStyle = `rgb(${checkerboard.lightColor.r} ${checkerboard.lightColor.g} ${checkerboard.lightColor.b})`
            tileContext.fillRect(0, 0, tileSize * 2, tileSize * 2)
            tileContext.fillStyle = `rgb(${checkerboard.darkColor.r} ${checkerboard.darkColor.g} ${checkerboard.darkColor.b})`
            tileContext.fillRect(tileSize, 0, tileSize, tileSize)
            tileContext.fillRect(0, tileSize, tileSize, tileSize)
          }
          tile = { key: tileKey, canvas }
          checkerboardTileRef.current = tile
        }
        pattern = context.createPattern(tile.canvas, 'repeat')
        pattern?.setTransform(new DOMMatrix([checkerCell, 0, 0, checkerCell, copy.originX, copy.originY]))
      }
      if (pattern) {
        context.imageSmoothingEnabled = false
        context.fillStyle = pattern
        context.fillRect(copy.originX, copy.originY, renderCanvasWidth, renderCanvasHeight)
      } else {
        const firstColumn = Math.max(0, Math.floor((viewport.left - copy.originX) / checkerCell))
        const firstRow = Math.max(0, Math.floor((viewport.top - copy.originY) / checkerCell))
        const lastColumn = Math.min(Math.ceil(document.width / checkerboard.size), Math.ceil((viewport.right - copy.originX) / checkerCell))
        const lastRow = Math.min(Math.ceil(document.height / checkerboard.size), Math.ceil((viewport.bottom - copy.originY) / checkerCell))
        context.fillStyle = `rgb(${checkerboard.darkColor.r} ${checkerboard.darkColor.g} ${checkerboard.darkColor.b})`
        for (let row = firstRow; row < lastRow; row += 1) {
          for (let column = firstColumn; column < lastColumn; column += 1) {
            if ((column + row) % 2 === 0) continue
            context.fillRect(copy.originX + column * checkerCell, copy.originY + row * checkerCell, checkerCell, checkerCell)
          }
        }
      }
    }
    context.restore()
  }
  for (const copy of repeatCopies) drawCheckerboard(copy)
  const drawGrid = (gridX: number, gridY: number, cellWidth: number, cellHeight: number, color: RgbaColor, copy = repeatCopies[0]): void => {
    if (!copy) return
    context.save()
    clipCanvasCopy(context, copy)
    context.globalCompositeOperation = 'source-over'
    context.globalAlpha = 1
    context.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a / 255})`
    const devicePixelX = 1 / deviceScale.x
    const devicePixelY = 1 / deviceScale.y
    const alignToDevicePixelX = (value: number): number => deviceAlignedCoordinate(value, deviceScale.x)
    const alignToDevicePixelY = (value: number): number => deviceAlignedCoordinate(value, deviceScale.y)
    const visibleLeft = alignToDevicePixelX(copy.originX + copy.fromX * view.zoom)
    const visibleTop = alignToDevicePixelY(copy.originY + copy.fromY * view.zoom)
    const visibleRight = alignToDevicePixelX(copy.originX + copy.toX * view.zoom)
    const visibleBottom = alignToDevicePixelY(copy.originY + copy.toY * view.zoom)
    for (const x of gridLinePositions(gridX, cellWidth, copy.fromX, copy.toX, view.zoom)) {
      const screenX = alignToDevicePixelX(copy.originX + x * view.zoom)
      context.fillRect(screenX, visibleTop, devicePixelX, Math.max(devicePixelY, visibleBottom - visibleTop + devicePixelY))
    }
    for (const y of gridLinePositions(gridY, cellHeight, copy.fromY, copy.toY, view.zoom)) {
      const screenY = alignToDevicePixelY(copy.originY + y * view.zoom)
      context.fillRect(visibleLeft, screenY, Math.max(devicePixelX, visibleRight - visibleLeft + devicePixelX), devicePixelY)
    }
    context.restore()
  }
  const drawIsoGuides = (copy: (typeof repeatCopies)[number]): void => {
    const spacing = isoGuideSpacingForZoom(view.zoom, isoViewPreferences.guideUnitSize)
    const segments = isoGuideSegments(
      document.width,
      document.height,
      {
        left: copy.fromX,
        top: copy.fromY,
        right: copy.toX,
        bottom: copy.toY
      },
      {
        spacing,
        stairStep: isoViewPreferences.stairStep,
        origin: { x: isoViewPreferences.guideOriginX, y: isoViewPreferences.guideOriginY }
      }
    )
    if (segments.length === 0) return
    const color = isoViewPreferences.guideColors[isoViewPreferences.guideLineStyle]
    context.save()
    clipCanvasCopy(context, copy)
    context.globalCompositeOperation = 'source-over'
    context.globalAlpha = color.a / 255
    if (isoViewPreferences.guideLineStyle === 'pixel' && view.zoom >= 1 && typeof context.createPattern === 'function') {
      const tileWidth = isoViewPreferences.stairStep * spacing
      const tileHeight = spacing
      const tileArea = tileWidth * tileHeight
      if (tileWidth <= 8192 && tileHeight <= 8192 && tileArea <= 4 * 1024 * 1024) {
        const tileKey = `${isoViewPreferences.stairStep}:${spacing}:${color.r},${color.g},${color.b}`
        let tile = isoGuideTileRef.current
        if (!tile || tile.key !== tileKey || tile.canvas.width !== tileWidth || tile.canvas.height !== tileHeight) {
          const patternGeometry = isoGuidePixelPattern(isoViewPreferences.stairStep, spacing)
          const canvas = new OffscreenCanvas(patternGeometry.width, patternGeometry.height)
          const tileContext = canvas.getContext('2d')
          if (tileContext) {
            tileContext.fillStyle = `rgb(${color.r} ${color.g} ${color.b})`
            for (const pixel of patternGeometry.pixels) tileContext.fillRect(pixel.x, pixel.y, 1, 1)
          }
          tile = { key: tileKey, canvas }
          isoGuideTileRef.current = tile
        }
        const pattern = context.createPattern(tile.canvas, 'repeat')
        pattern?.setTransform(
          new DOMMatrix([
            view.zoom,
            0,
            0,
            view.zoom,
            copy.originX + isoViewPreferences.guideOriginX * view.zoom,
            copy.originY + isoViewPreferences.guideOriginY * view.zoom
          ])
        )
        if (pattern) {
          context.imageSmoothingEnabled = false
          context.fillStyle = pattern
          context.fillRect(copy.originX, copy.originY, renderCanvasWidth, renderCanvasHeight)
          context.restore()
          return
        }
      }
    }
    context.strokeStyle = `rgb(${color.r} ${color.g} ${color.b})`
    context.lineWidth = isoViewPreferences.guideThickness
    context.setLineDash([])
    context.beginPath()
    for (const segment of segments) {
      context.moveTo(copy.originX + segment.start.x * view.zoom, copy.originY + segment.start.y * view.zoom)
      context.lineTo(copy.originX + segment.end.x * view.zoom, copy.originY + segment.end.y * view.zoom)
    }
    context.stroke()
    context.restore()
  }
  return { drawGrid, drawIsoGuides }
}
