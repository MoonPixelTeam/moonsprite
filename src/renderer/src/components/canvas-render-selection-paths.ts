import type { RgbaColor } from '@shared/types-color'
import { deviceAlignedPixelRect } from '@/core/canvas-render-plan'
import { type CanvasDragState as DragState, type CanvasPoint as Point } from '@/core/canvas-input'
import { colorLuminance, selectionCursorCornerRects, selectionPathPreviewPixelVisible, transparencyColorAt } from '@/core/canvas-visuals'
import { type RasterContext2D } from '@/components/canvas-selection-renderer'
import { tileRepeatMappedPointForCopies } from '@/core/tilemap'
import type * as React from 'react'
import type { DocumentSession } from '@/store/workspace-types'
import { PolygonPathPreviewRenderCache, SELECTION_PATH_PREVIEW_BATCH_THRESHOLD } from './canvas-stage-helpers'
export function createCanvasSelectionPaths({
  selectionPreviewColorMode,
  selectionPreviewColor,
  repeatCopies,
  context,
  clipCanvasCopy,
  view,
  deviceScale,
  document,
  rect,
  sampleCompositeForPreview,
  checkerboard,
  currentSession,
  currentActiveLayer,
  originX,
  originY,
  polygonPathPreviewRenderCacheRef,
  previewPixelRect
}: {
  selectionPreviewColorMode: import('@/core/file-preferences').SelectionPreviewColorMode
  selectionPreviewColor: RgbaColor
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
  view: import('@shared/types-view').ViewState
  deviceScale: import('@/core/canvas-render-plan').CanvasDeviceScale
  document: import('@shared/types-document').SpriteDocument
  rect: {
    width: number
    height: number
  }
  sampleCompositeForPreview: (x: number, y: number) => RgbaColor
  checkerboard: import('@/core/file-preferences').CheckerboardPreferences
  currentSession: DocumentSession
  currentActiveLayer: import('@shared/types-layer').RasterLayer
  originX: number
  originY: number
  polygonPathPreviewRenderCacheRef: React.RefObject<PolygonPathPreviewRenderCache | null>
  previewPixelRect: (
    pixelX: number,
    pixelY: number
  ) => {
    x: number
    y: number
    width: number
    height: number
  }
}) {
  const customSelectionPreviewColor =
    selectionPreviewColorMode === 'custom'
      ? `rgb(${selectionPreviewColor.r} ${selectionPreviewColor.g} ${selectionPreviewColor.b} / ${selectionPreviewColor.a / 255})`
      : undefined
  // All selection-creation previews (marquee, lasso, polygon and magic
  // wand) use the same contrast rule. Keep the automatic colors strictly
  // black/white so a preview never inherits theme colors or changes hue.
  const selectionPreviewColorForBackground = (background: RgbaColor): string =>
    customSelectionPreviewColor ?? (colorLuminance(background) > 145 ? '#000000' : '#ffffff')
  const drawSelectionPathPreview = (
    previewPixels: Iterable<string>,
    copies = [repeatCopies.find((copy) => copy.x === 0 && copy.y === 0) ?? repeatCopies[0]],
    repeatedCoordinates = false,
    previewColor?: string
  ): void => {
    const points: Point[] = []
    for (const value of previewPixels) {
      const separator = value.indexOf(':')
      points.push({ x: Number(value.slice(0, separator)), y: Number(value.slice(separator + 1)) })
    }
    drawSelectionPathPreviewPoints(points, copies, repeatedCoordinates, previewColor)
  }
  const drawSelectionPathPreviewPoints = (
    points: Iterable<Point>,
    copies = [repeatCopies.find((copy) => copy.x === 0 && copy.y === 0) ?? repeatCopies[0]],
    repeatedCoordinates = false,
    previewColor?: string
  ): void => {
    const pointList: readonly Point[] = Array.isArray(points) ? points : Array.from(points)
    const canBatch = typeof Path2D !== 'undefined' && pointList.length >= SELECTION_PATH_PREVIEW_BATCH_THRESHOLD
    for (const copy of copies) {
      if (!copy) continue
      context.save()
      if (!repeatedCoordinates) {
        clipCanvasCopy(context, copy)
      }
      if (!canBatch) {
        for (const { x, y } of pointList) {
          const pixelRect = deviceAlignedPixelRect(copy.originX, copy.originY, view.zoom, x, y, deviceScale)
          const mapped = repeatedCoordinates
            ? tileRepeatMappedPointForCopies({ x, y }, document.width, document.height, view.tileRepeatMode ?? 'off', true)
            : null
          const samplePoint = mapped?.local ?? { x, y }
          const insideDocument = repeatedCoordinates ? Boolean(mapped) : x >= 0 && y >= 0 && x < document.width && y < document.height
          if (!selectionPathPreviewPixelVisible(pixelRect, rect.width, rect.height, insideDocument)) continue
          const sampled = sampleCompositeForPreview(samplePoint.x, samplePoint.y)
          const background = sampled.a > 0 ? sampled : transparencyColorAt(samplePoint.x, samplePoint.y, checkerboard)
          context.fillStyle = previewColor ?? selectionPreviewColorForBackground(background)
          context.fillRect(pixelRect.x, pixelRect.y, pixelRect.width, pixelRect.height)
        }
      } else {
        const paths = new Map<string, Path2D>()
        for (const { x, y } of pointList) {
          const pixelRect = deviceAlignedPixelRect(copy.originX, copy.originY, view.zoom, x, y, deviceScale)
          const mapped = repeatedCoordinates
            ? tileRepeatMappedPointForCopies({ x, y }, document.width, document.height, view.tileRepeatMode ?? 'off', true)
            : null
          const samplePoint = mapped?.local ?? { x, y }
          const insideDocument = repeatedCoordinates ? Boolean(mapped) : x >= 0 && y >= 0 && x < document.width && y < document.height
          if (!selectionPathPreviewPixelVisible(pixelRect, rect.width, rect.height, insideDocument)) continue
          const sampled = sampleCompositeForPreview(samplePoint.x, samplePoint.y)
          const background = sampled.a > 0 ? sampled : transparencyColorAt(samplePoint.x, samplePoint.y, checkerboard)
          const color = previewColor ?? selectionPreviewColorForBackground(background)
          let path = paths.get(color)
          if (!path) {
            path = new Path2D()
            paths.set(color, path)
          }
          path.rect(pixelRect.x, pixelRect.y, pixelRect.width, pixelRect.height)
        }
        for (const [color, path] of paths) {
          context.fillStyle = color
          context.fill(path)
        }
      }
      context.restore()
    }
  }
  const polygonPreviewColorKey = (color: RgbaColor): string => `${color.r},${color.g},${color.b},${color.a}`
  const polygonPathPreviewVisualKey = (copy: (typeof repeatCopies)[number], previewColor?: string): string =>
    [
      document.id,
      currentSession.contentRevision,
      currentSession.revision,
      currentActiveLayer.id,
      rect.width,
      rect.height,
      originX,
      originY,
      view.zoom,
      `${deviceScale.x}:${deviceScale.y}`,
      view.rotation,
      view.mirrored ? 1 : 0,
      view.mirroredVertical ? 1 : 0,
      copy.originX,
      copy.originY,
      view.tileRepeatMode ?? 'off',
      view.relativeLuminance ? 1 : 0,
      previewColor ?? customSelectionPreviewColor ?? 'auto',
      checkerboard.size,
      polygonPreviewColorKey(checkerboard.lightColor),
      polygonPreviewColorKey(checkerboard.darkColor),
      selectionPreviewColorMode
    ].join('|')
  const drawCachedPolygonPath = (cache: PolygonPathPreviewRenderCache, copy: (typeof repeatCopies)[number]): void => {
    context.save()
    clipCanvasCopy(context, copy)
    for (const [color, path] of cache.paths) {
      context.fillStyle = color
      context.fill(path)
    }
    context.restore()
  }
  const cachedPolygonPathFor = (
    rasterCache: NonNullable<DragState['polygonPathRasterCache']>,
    path: readonly Point[],
    balanced: boolean,
    copy: (typeof repeatCopies)[number],
    previewColor?: string
  ): PolygonPathPreviewRenderCache => {
    const visualKey = polygonPathPreviewVisualKey(copy, previewColor)
    const existing = polygonPathPreviewRenderCacheRef.current
    const appendPoints = (target: PolygonPathPreviewRenderCache, start: number): void => {
      for (let index = start; index < rasterCache.committedPoints.length; index += 1) {
        const point = rasterCache.committedPoints[index]
        const pixelRect = deviceAlignedPixelRect(copy.originX, copy.originY, view.zoom, point.x, point.y, deviceScale)
        const insideDocument = point.x >= 0 && point.y >= 0 && point.x < document.width && point.y < document.height
        if (!selectionPathPreviewPixelVisible(pixelRect, rect.width, rect.height, insideDocument)) continue
        const color =
          previewColor ??
          (() => {
            const sampled = sampleCompositeForPreview(point.x, point.y)
            const background = sampled.a > 0 ? sampled : transparencyColorAt(point.x, point.y, checkerboard)
            return selectionPreviewColorForBackground(background)
          })()
        let screenPath = target.paths.get(color)
        if (!screenPath) {
          screenPath = new Path2D()
          target.paths.set(color, screenPath)
        }
        screenPath.rect(pixelRect.x, pixelRect.y, pixelRect.width, pixelRect.height)
      }
      target.committedPointCount = rasterCache.committedPoints.length
    }

    if (
      existing &&
      existing.sourcePath === path &&
      existing.balanced === balanced &&
      existing.visualKey === visualKey &&
      path.length === existing.sourcePathLength &&
      rasterCache.committedPoints.length === existing.committedPointCount
    )
      return existing
    if (
      existing &&
      existing.sourcePath === path &&
      existing.balanced === balanced &&
      existing.visualKey === visualKey &&
      path.length === existing.sourcePathLength + 1 &&
      rasterCache.committedPoints.length >= existing.committedPointCount
    ) {
      appendPoints(existing, existing.committedPointCount)
      existing.sourcePathLength = path.length
      return existing
    }

    const next: PolygonPathPreviewRenderCache = {
      sourcePath: path,
      sourcePathLength: path.length,
      balanced,
      visualKey,
      committedPointCount: 0,
      paths: new Map()
    }
    appendPoints(next, 0)
    polygonPathPreviewRenderCacheRef.current = next
    return next
  }
  const drawSelectionCursorCorners = (pixelX: number, pixelY: number, color: string): void => {
    const pixelRect = previewPixelRect(pixelX, pixelY)
    context.save()
    context.fillStyle = color
    for (const mark of selectionCursorCornerRects(pixelRect, deviceScale.x)) context.fillRect(mark.x, mark.y, mark.width, mark.height)
    context.restore()
  }
  return {
    customSelectionPreviewColor,
    selectionPreviewColorForBackground,
    drawSelectionPathPreview,
    drawSelectionPathPreviewPoints,
    drawCachedPolygonPath,
    cachedPolygonPathFor,
    drawSelectionCursorCorners
  }
}
