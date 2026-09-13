import { drawMagicWandPreview } from './canvas-magic-preview'
import type { RgbaColor } from '@shared/types-color'
import { rasterLinePoints, selectionContains } from '@/core/selection'
import { canvasGestureForPreview, polygonLassoPreviewPoints, type CanvasDragState as DragState, type CanvasPoint as Point } from '@/core/canvas-input'
import { selectionPreviewPixels, transparencyColorAt } from '@/core/canvas-visuals'
import { hasSymmetry, symmetryPoints } from '@/core/symmetry'
import { type RasterContext2D } from '@/components/canvas-selection-renderer'
import { createPolygonPathRasterCache } from '@/core/canvas-input'
import type * as React from 'react'
import type { DocumentSession } from '@/store/workspace-types'
import { PolygonPathPreviewRenderCache } from './canvas-stage-helpers'
export function renderCanvasSelectionPreview({
  inputRef,
  drawSelectionPathPreview,
  repeatCopies,
  view,
  customSelectionPreviewColor,
  session,
  lassoPreviewClosed,
  balancedShiftLineEnabled,
  drawCachedPolygonPath,
  cachedPolygonPathFor,
  drawSelectionPathPreviewPoints,
  document,
  symmetryCenter,
  previewPixelRect,
  sampleCompositeForPreview,
  checkerboard,
  context,
  selectionPreviewColorForBackground,
  clipBaseCanvas,
  previewOriginX,
  previewOriginY,
  selectionPreviewColorMode,
  canRenderToolPreview,
  repeatedDocumentPointsAt,
  selectionHitAt,
  drawSelectionCursorCorners
}: {
  inputRef: React.RefObject<import('@/core/canvas-input').CanvasInputState>
  drawSelectionPathPreview: (
    previewPixels: Iterable<string>,
    copies?: {
      x: number
      y: number
      originX: number
      originY: number
      fromX: number
      fromY: number
      toX: number
      toY: number
    }[],
    repeatedCoordinates?: boolean,
    previewColor?: string
  ) => void
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
  view: import('@shared/types-view').ViewState
  customSelectionPreviewColor: string | undefined
  session: DocumentSession
  lassoPreviewClosed: boolean
  balancedShiftLineEnabled: boolean
  drawCachedPolygonPath: (
    cache: PolygonPathPreviewRenderCache,
    copy: {
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
  cachedPolygonPathFor: (
    rasterCache: NonNullable<DragState['polygonPathRasterCache']>,
    path: readonly Point[],
    balanced: boolean,
    copy: {
      x: number
      y: number
      originX: number
      originY: number
      fromX: number
      fromY: number
      toX: number
      toY: number
    },
    previewColor?: string
  ) => PolygonPathPreviewRenderCache
  drawSelectionPathPreviewPoints: (
    points: Iterable<Point>,
    copies?: {
      x: number
      y: number
      originX: number
      originY: number
      fromX: number
      fromY: number
      toX: number
      toY: number
    }[],
    repeatedCoordinates?: boolean,
    previewColor?: string
  ) => void
  document: import('@shared/types-document').SpriteDocument
  symmetryCenter: import('@/core/symmetry').SymmetryCenter
  previewPixelRect: (
    pixelX: number,
    pixelY: number
  ) => {
    x: number
    y: number
    width: number
    height: number
  }
  sampleCompositeForPreview: (x: number, y: number) => RgbaColor
  checkerboard: import('@/core/file-preferences').CheckerboardPreferences
  context: RasterContext2D
  selectionPreviewColorForBackground: (background: RgbaColor) => string
  clipBaseCanvas: (targetContext: RasterContext2D) => void
  previewOriginX: number
  previewOriginY: number
  selectionPreviewColorMode: import('@/core/file-preferences').SelectionPreviewColorMode
  canRenderToolPreview: boolean
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
  selectionHitAt: (clientX: number, clientY: number) => import('@/core/canvas-input').SelectionHit
  drawSelectionCursorCorners: (pixelX: number, pixelY: number, color: string) => void
}) {
  const selectionDrag = canvasGestureForPreview(inputRef.current.drag)
  if (selectionDrag?.kind === 'marquee' && (selectionDrag.moved || selectionDrag.quickSelectCell)) {
    const displaySelection = selectionDrag.marqueeDisplaySelection ?? selectionDrag.marqueePreviewSelection
    if (displaySelection)
      drawSelectionPathPreview(
        selectionPreviewPixels(displaySelection),
        repeatCopies,
        Boolean(selectionDrag.marqueeDisplaySelection && (view.tileRepeatMode ?? 'off') !== 'off' && !selectionDrag.quickSelectCell),
        customSelectionPreviewColor
      )
  }
  if ((selectionDrag?.kind === 'lasso' || selectionDrag?.kind === 'polygon-lasso') && (selectionDrag.path?.length ?? 0) > 0) {
    const path = selectionDrag.path ?? []
    const symmetric = hasSymmetry(session.symmetryAxes)
    if (selectionDrag.kind === 'polygon-lasso' && !symmetric) {
      const polygonCache = (selectionDrag.polygonPathRasterCache ??= createPolygonPathRasterCache())
      const previewPoints = polygonLassoPreviewPoints(path, selectionDrag.last, lassoPreviewClosed, balancedShiftLineEnabled, polygonCache)
      const baseCopy = repeatCopies.find((copy) => copy.x === 0 && copy.y === 0) ?? repeatCopies[0]
      if (baseCopy && typeof Path2D !== 'undefined') {
        const committedPointCount = polygonCache.committedPoints.length
        drawCachedPolygonPath(cachedPolygonPathFor(polygonCache, path, balancedShiftLineEnabled, baseCopy), baseCopy)
        if (previewPoints.length > committedPointCount) drawSelectionPathPreviewPoints(previewPoints.slice(committedPointCount), [baseCopy])
      } else drawSelectionPathPreviewPoints(previewPoints)
    } else {
      const previewPixels = new Map<string, Point>()
      const addLine = (from: Point, to: Point): void => {
        for (const sourcePoint of rasterLinePoints(from, to))
          for (const point of symmetryPoints(sourcePoint, document.width, document.height, session.symmetryAxes, symmetryCenter))
            previewPixels.set(`${point.x}:${point.y}`, point)
      }
      if (selectionDrag.kind === 'polygon-lasso') {
        const polygonCache = (selectionDrag.polygonPathRasterCache ??= createPolygonPathRasterCache())
        for (const sourcePoint of polygonLassoPreviewPoints(path, selectionDrag.last, lassoPreviewClosed, balancedShiftLineEnabled, polygonCache))
          for (const point of symmetryPoints(sourcePoint, document.width, document.height, session.symmetryAxes, symmetryCenter))
            previewPixels.set(`${point.x}:${point.y}`, point)
      } else {
        for (let index = 1; index < path.length; index += 1) addLine(path[index - 1], path[index])
        if (lassoPreviewClosed && path.length > 1) addLine(path.at(-1)!, path[0])
      }
      drawSelectionPathPreviewPoints(previewPixels.values())
    }
    const mode = selectionDrag.selectionMode ?? session.selectionMode
    const point = inputRef.current.pointer.point
    if (mode !== 'replace' && point.x >= 0 && point.y >= 0 && point.x < document.width && point.y < document.height) {
      const pixelRect = previewPixelRect(point.x, point.y)
      const sampled = sampleCompositeForPreview(point.x, point.y)
      const background = sampled.a > 0 ? sampled : transparencyColorAt(point.x, point.y, checkerboard)
      context.save()
      context.strokeStyle = selectionPreviewColorForBackground(background)
      context.lineWidth = 1
      context.strokeRect(pixelRect.x + 0.5, pixelRect.y + 0.5, Math.max(0, pixelRect.width - 1), Math.max(0, pixelRect.height - 1))
      context.restore()
    }
  }
  const magicPreview = inputRef.current.drag
  if (magicPreview?.kind === 'magic-preview' && magicPreview.previewSelection) {
    const startedAt = performance.now()
    const previewPoint = magicPreview.last
    const sampled = sampleCompositeForPreview(previewPoint.x, previewPoint.y)
    const background = sampled.a > 0 ? sampled : transparencyColorAt(previewPoint.x, previewPoint.y, checkerboard)
    const magicPreviewColor = customSelectionPreviewColor ?? selectionPreviewColorForBackground(background)
    context.save()
    clipBaseCanvas(context)
    drawMagicWandPreview(
      context,
      magicPreview.previewSelection,
      magicPreview.magicPreviewRectangles,
      magicPreview.magicPreviewBitmap,
      previewOriginX,
      previewOriginY,
      view.zoom,
      magicPreviewColor,
      selectionPreviewColorMode !== 'custom'
    )
    context.restore()
    window.__moonSpriteCanvasProbe?.recordOperationStage?.('magic-wand.preview-render', performance.now() - startedAt)
  }
  const activeSelectionCreation = selectionDrag?.kind === 'marquee' || selectionDrag?.kind === 'lasso' || selectionDrag?.kind === 'polygon-lasso'
  const selectionCreationPointerVisible = inputRef.current.pointer.visible || activeSelectionCreation
  if (
    (canRenderToolPreview || activeSelectionCreation) &&
    (!inputRef.current.drag || activeSelectionCreation) &&
    (!inputRef.current.spaceHeld || selectionDrag?.kind === 'marquee') &&
    !inputRef.current.sampling &&
    selectionCreationPointerVisible &&
    session.tool === 'selection'
  ) {
    const pointerLocation = inputRef.current.pointer.visible
      ? repeatedDocumentPointsAt(inputRef.current.pointer.clientX, inputRef.current.pointer.clientY, false, true)
      : null
    const point = pointerLocation?.local ?? (activeSelectionCreation ? selectionDrag.last : inputRef.current.pointer.point)
    const displayedPoint = pointerLocation?.repeated ?? point
    const selectionHit = session.selection ? selectionHitAt(inputRef.current.pointer.clientX, inputRef.current.pointer.clientY) : 'outside'
    const combinationMode = session.selectionMode !== 'replace'
    const transformInteraction = selectionHit !== 'inside' && selectionHit !== 'outside'
    const addModeInteraction = !inputRef.current.shiftHeld && session.selectionMode === 'add' && selectionHit !== 'outside'
    const creatingSelection =
      activeSelectionCreation ||
      inputRef.current.shiftHeld ||
      combinationMode ||
      (selectionHit === 'outside' && (!session.selection || !selectionContains(session.selection, point.x, point.y)))
    if (!transformInteraction && !addModeInteraction && creatingSelection) {
      const insideDocument = point.x >= 0 && point.y >= 0 && point.x < document.width && point.y < document.height
      const sampled = insideDocument ? sampleCompositeForPreview(point.x, point.y) : { r: 74, g: 74, b: 81, a: 255 }
      const background = sampled.a > 0 ? sampled : transparencyColorAt(point.x, point.y, checkerboard)
      drawSelectionCursorCorners(displayedPoint.x, displayedPoint.y, selectionPreviewColorForBackground(background))
    }
  }
}
