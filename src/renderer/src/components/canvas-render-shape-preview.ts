import type { RgbaColor } from '@shared/types-color'
import type { SelectionMask } from '@shared/types-selection'
import { layerMaskDisplayColor, readLayerColorAt, resolveLayerCanvasColor } from '@/core/document-model'
import { compositePixelWithLayerColor } from '@/core/document-composite'
import { blendOver } from '@/core/raster'
import { bezierCurvePixelPoints, lineShapePixelPoints, perfectPixelPathPoints, shapeBoundaryPixelPoints } from '@/core/tools-shapes'
import { outlinePixelSamples } from '@/core/tools-outline'
import { resolveOutlineStrokeColor } from '@/core/outline-settings'
import { activePaintLayer } from '@/store/workspace-session'
import { polygonLassoPreviewPoints, shapeBounds, type CanvasDragState as DragState, type CanvasPoint as Point } from '@/core/canvas-input'
import { nearestTileRepeatEquivalent } from '@/core/tilemap'
import { createPolygonPathRasterCache } from '@/core/canvas-input'
import type * as React from 'react'
import type { DocumentSession } from '@/store/workspace-types'
import { LineAnchorHistory } from './canvas-stage-helpers'
export function renderCanvasOutline({
  session,
  currentSession,
  outlinePreviewCacheRef,
  document,
  drawPreviewPixel,
  isolatedLayerMask
}: {
  session: DocumentSession
  currentSession: DocumentSession
  outlinePreviewCacheRef: React.RefObject<{
    revision: number
    layerId: string
    selection: import('@shared/types-selection').SelectionMask | null
    preview: import('@/store/workspace-types').OutlinePreview
    samples: import('@/core/tools-outline').OutlinePixelSample[]
  } | null>
  document: import('@shared/types-document').SpriteDocument
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
  isolatedLayerMask: import('@shared/types-layer').LayerMask | null
}) {
  if (session.outlinePreview) {
    const outlineLayer = activePaintLayer(currentSession)
    const cachedOutline = outlinePreviewCacheRef.current
    const outlineSamples =
      cachedOutline &&
      cachedOutline.revision === session.revision &&
      cachedOutline.layerId === outlineLayer.id &&
      cachedOutline.selection === session.selection &&
      cachedOutline.preview === session.outlinePreview
        ? cachedOutline.samples
        : outlinePixelSamples(
            document,
            outlineLayer,
            session.selection,
            session.outlinePreview.thickness,
            session.outlinePreview.position,
            session.outlinePreview.directions,
            session.outlinePreview.kernel,
            session.outlinePreview.backgroundColor
          )
    if (outlineSamples !== cachedOutline?.samples)
      outlinePreviewCacheRef.current = {
        revision: session.revision,
        layerId: outlineLayer.id,
        selection: session.selection,
        preview: session.outlinePreview,
        samples: outlineSamples
      }
    for (const sample of outlineSamples) {
      const pixelX = sample.index % document.width
      const pixelY = Math.floor(sample.index / document.width)
      const base = readLayerColorAt(document, outlineLayer, pixelX, pixelY)
      const outlineColor = resolveOutlineStrokeColor(session.outlinePreview, sample.referenceColor)
      const color = outlineColor.a > 0 && outlineColor.a < 255 ? blendOver(base, outlineColor) : outlineColor
      const resolvedColor = resolveLayerCanvasColor(document, outlineLayer, color)
      drawPreviewPixel(
        pixelX,
        pixelY,
        isolatedLayerMask ? layerMaskDisplayColor(resolvedColor) : compositePixelWithLayerColor(document, sample.index, outlineLayer.id, resolvedColor)
      )
    }
  }
}

export function renderCanvasShapePreview({
  canRenderToolPreview,
  drag,
  session,
  paintSelectionForDrag,
  drawShapeContourPreview,
  document,
  shapeCornerRadius,
  balancedShiftLineEnabled,
  balancedStraightLines,
  curveDefaultControls,
  drawBrushPathPreview
}: {
  canRenderToolPreview: boolean
  drag: DragState | null
  session: DocumentSession
  paintSelectionForDrag: (drag: import('@/core/canvas-input').CanvasDragState) => import('@shared/types-selection').SelectionMask | null
  drawShapeContourPreview: (points: Iterable<Point>, color: RgbaColor, selection: SelectionMask | null) => void
  document: import('@shared/types-document').SpriteDocument
  shapeCornerRadius: number
  balancedShiftLineEnabled: boolean
  balancedStraightLines: boolean
  curveDefaultControls: (
    start: import('@/core/canvas-input').CanvasPoint,
    end: import('@/core/canvas-input').CanvasPoint,
    count: number
  ) => import('@/core/canvas-input').CanvasPoint[]
  drawBrushPathPreview: (
    points: readonly Point[],
    color: RgbaColor,
    erase?: boolean,
    baseline?: ReadonlyMap<number, number>,
    selection?: SelectionMask | null
  ) => void
}) {
  if (canRenderToolPreview && drag?.kind === 'shape') {
    const shape = drag.previewTarget ?? shapeBounds(drag.start, drag.last, drag.constrain, session.shapeRatio)
    const angle = drag.previewAngle ?? 0
    const selection = paintSelectionForDrag(drag)
    drawShapeContourPreview(
      shapeBoundaryPixelPoints(shape, session.shapeKind, document.width, document.height, angle, shapeCornerRadius),
      drag.color ?? session.primaryColor,
      selection
    )
  }
  if (canRenderToolPreview && drag && (drag.kind === 'freeform-shape' || drag.kind === 'polygon-shape')) {
    const color = drag.color ?? session.primaryColor
    const selection = paintSelectionForDrag(drag)
    const path = drag.path ?? []
    const polygonCache = (drag.polygonPathRasterCache ??= createPolygonPathRasterCache())
    const points = polygonLassoPreviewPoints(
      path,
      drag.last,
      drag.kind === 'polygon-shape',
      drag.kind === 'polygon-shape' ? balancedShiftLineEnabled : false,
      polygonCache
    )
    drawShapeContourPreview(points, color, selection)
  }
  if (canRenderToolPreview && drag && (drag.kind === 'line-shape' || drag.kind === 'curve-shape')) {
    const rawPoints =
      drag.kind === 'line-shape'
        ? lineShapePixelPoints(drag.start, drag.last, balancedStraightLines)
        : bezierCurvePixelPoints(
            drag.start,
            drag.curveControls ?? curveDefaultControls(drag.start, drag.curveEnd ?? drag.last, drag.curveAnchorCount ?? session.curveAnchorCount),
            drag.curveEnd ?? drag.last
          )
    const points = session.perfectPixels ? perfectPixelPathPoints(rawPoints) : rawPoints
    drawBrushPathPreview(points, drag.color ?? session.primaryColor, false, undefined, paintSelectionForDrag(drag))
  }
}

export function renderCanvasConnectedLine({
  currentActiveLayer,
  currentSession,
  shiftLinePreviewEnabled,
  lineConnectionConfigured,
  canRenderToolPreview,
  inputRef,
  session,
  lineAnchor,
  tileRepeatPointAt,
  document,
  view,
  resolveStraightLine,
  modifierActive,
  lineAnchorHistoryRef,
  activeLayer,
  tilemapEditSelectionAtPoint,
  drawStrokePreview
}: {
  currentActiveLayer: import('@shared/types-layer').RasterLayer
  currentSession: DocumentSession
  shiftLinePreviewEnabled: boolean
  lineConnectionConfigured: boolean
  canRenderToolPreview: boolean
  inputRef: React.RefObject<import('@/core/canvas-input').CanvasInputState>
  session: DocumentSession
  lineAnchor: {
    x: number
    y: number
  } | null
  tileRepeatPointAt: (clientX: number, clientY: number) => import('@/core/canvas-input').CanvasPoint | null
  document: import('@shared/types-document').SpriteDocument
  view: import('@shared/types-view').ViewState
  resolveStraightLine: (
    from: import('@/core/canvas-input').CanvasPoint,
    to: import('@/core/canvas-input').CanvasPoint,
    constrained: boolean
  ) => {
    from: import('@/core/canvas-input').CanvasPoint
    to: import('@/core/canvas-input').CanvasPoint
  }
  modifierActive: (event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>, id: import('@/core/shortcuts').ShortcutId) => boolean
  lineAnchorHistoryRef: React.RefObject<LineAnchorHistory | null>
  activeLayer: import('@shared/types-layer').RasterLayer
  tilemapEditSelectionAtPoint: (
    point: import('@/core/canvas-input').CanvasPoint,
    current?: import('@/store/workspace-types').DocumentSession,
    armOutsideTiles?: boolean
  ) => import('@shared/types-selection').SelectionMask | null | undefined
  drawStrokePreview: (from: Point, to: Point, erase?: boolean, baseline?: ReadonlyMap<number, number>, selection?: SelectionMask | null) => void
}) {
  if (
    (currentActiveLayer.kind !== 'tilemap' || currentSession.tilemapMode !== 'paint') &&
    (currentActiveLayer.kind !== 'free-tile' || currentSession.freeTileMode !== 'paint') &&
    shiftLinePreviewEnabled &&
    lineConnectionConfigured &&
    canRenderToolPreview &&
    !inputRef.current.spaceHeld &&
    !inputRef.current.sampling &&
    !inputRef.current.drag &&
    (session.tool === 'pencil' || session.tool === 'eraser') &&
    inputRef.current.shiftLinePreview &&
    inputRef.current.pointer.visible &&
    lineAnchor
  ) {
    const modifiers = { ctrlKey: inputRef.current.ctrlHeld, metaKey: false, altKey: inputRef.current.altHeld, shiftKey: inputRef.current.shiftHeld }
    const repeatedPointer = tileRepeatPointAt(inputRef.current.pointer.clientX, inputRef.current.pointer.clientY) ?? inputRef.current.pointer.point
    const repeatedAnchor = nearestTileRepeatEquivalent(lineAnchor, repeatedPointer, document.width, document.height, view.tileRepeatMode ?? 'off')
    const line = resolveStraightLine(repeatedAnchor, repeatedPointer, modifierActive(modifiers, 'constrainLineDirections'))
    const anchorHistory = lineAnchorHistoryRef.current
    const baseline =
      anchorHistory &&
      anchorHistory.documentId === session.document.id &&
      anchorHistory.layerId === activeLayer.id &&
      anchorHistory.tool === session.tool &&
      anchorHistory.point.x === lineAnchor.x &&
      anchorHistory.point.y === lineAnchor.y &&
      session.history.latestUndoEntry === anchorHistory.entry
        ? anchorHistory.baseline
        : undefined
    const tilemapEditSelection = tilemapEditSelectionAtPoint(inputRef.current.pointer.point, currentSession)
    if (tilemapEditSelection !== null) drawStrokePreview(line.from, line.to, session.tool === 'eraser', baseline, tilemapEditSelection)
  }
}
