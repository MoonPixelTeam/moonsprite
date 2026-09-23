import { brushPreviewNeedsComposite } from './canvas-brush-layer-preview'
import { CanvasAdaptiveOutline, alignCanvasStrokePath } from './canvas-adaptive-outline'
import type { RgbaColor } from '@shared/types-color'
import { readLayerColorAt, resolveLayerCanvasColor } from '@/core/document-model'
import { compositeRegion } from '@/core/document-composite'
import { blendOver } from '@/core/raster'
import { DEFAULT_BRUSH_DITHER_SETTINGS } from '@/core/gradient-color'
import { applyInkColor, resolveInkStampColor } from '@/core/ink'
import { brushMaskOffsets, brushStampAnchor, solidBrushPreviewRowSpans } from '@/core/tools-brush'
import { selectionContains } from '@/core/selection'
import { type CanvasDragState as DragState } from '@/core/canvas-input'
import { transparencyColorAt } from '@/core/canvas-visuals'
import { type RasterContext2D } from '@/components/canvas-selection-renderer'
import { activeBrushInputsForTool } from '@/core/brushes'
import { tileRepeatContinuousPreviewPlacements } from '@/core/tilemap'
import type * as React from 'react'
import type { DocumentSession } from '@/store/workspace-types'
import { BrushPreviewStackCache, BrushPreviewCompositeCache, brushBaseAngle } from './canvas-stage-helpers'
import { brushOpacityScale } from '@/core/pressure'
export function renderCanvasBrush({
  currentActiveLayer,
  currentSession,
  brushPreviewMode,
  brushEdgeColor,
  brushEdgeThickness = 1,
  canRenderToolPreview,
  inputRef,
  activeDrag,
  pointerOverCanvas,
  drag,
  drawingBrushPreviewEnabled,
  brushPreviewOverlaySupported,
  repeatedDocumentPointsAt,
  tilemapEditSelectionAtPoint,
  paintSelectionForDrag,
  snapBrushPointToGrid,
  context,
  brushPatternOrigin,
  view,
  optimizedRotationEnabled,
  checkerboard,
  sampleCompositeForPreview,
  document,
  previewPixelRect,
  activeTheme,
  repeatCopies,
  fromX,
  fromY,
  toX,
  toY,
  brushPreviewStackCacheRef,
  brushPreviewCompositeCacheRef,
  previewColorAt,
  fillPreviewPixelRects
}: {
  currentActiveLayer: import('@shared/types-layer').RasterLayer
  currentSession: DocumentSession
  brushPreviewMode: import('@/core/file-preferences').BrushPreviewMode
  brushEdgeColor?: RgbaColor
  brushEdgeThickness: number
  canRenderToolPreview: boolean
  inputRef: React.RefObject<import('@/core/canvas-input').CanvasInputState>
  activeDrag: DragState | null
  pointerOverCanvas: () => boolean
  drag: DragState | null
  drawingBrushPreviewEnabled: boolean
  brushPreviewOverlaySupported: (currentSession: import('@/store/workspace-types').DocumentSession) => boolean
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
  tilemapEditSelectionAtPoint: (
    point: import('@/core/canvas-input').CanvasPoint,
    current?: import('@/store/workspace-types').DocumentSession,
    armOutsideTiles?: boolean
  ) => import('@shared/types-selection').SelectionMask | null | undefined
  paintSelectionForDrag: (drag: import('@/core/canvas-input').CanvasDragState) => import('@shared/types-selection').SelectionMask | null
  snapBrushPointToGrid: (
    point: import('@/core/canvas-input').CanvasPoint,
    size: number,
    imageBrush?: import('@shared/types-brush').ImageBrush | null | undefined,
    angle?: number,
    currentSession?: import('@/store/workspace-types').DocumentSession
  ) => import('@/core/canvas-input').CanvasPoint
  context: RasterContext2D
  brushPatternOrigin: (
    point: import('@/core/canvas-input').CanvasPoint,
    size?: number,
    imageBrush?: import('@shared/types-brush').ImageBrush | null
  ) => import('@/core/canvas-input').CanvasPoint
  view: import('@shared/types-view').ViewState
  optimizedRotationEnabled: boolean
  checkerboard: import('@/core/file-preferences').CheckerboardPreferences
  sampleCompositeForPreview: (x: number, y: number) => RgbaColor
  document: import('@shared/types-document').SpriteDocument
  previewPixelRect: (
    pixelX: number,
    pixelY: number
  ) => {
    x: number
    y: number
    width: number
    height: number
  }
  activeTheme: import('@/core/theme').ResolvedTheme
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
  fromX: number
  fromY: number
  toX: number
  toY: number
  brushPreviewStackCacheRef: React.RefObject<BrushPreviewStackCache | null>
  brushPreviewCompositeCacheRef: React.RefObject<BrushPreviewCompositeCache | null>
  previewColorAt: (
    pixelX: number,
    pixelY: number,
    erase?: boolean,
    coverage?: number,
    paintColor?: RgbaColor,
    baseColor?: RgbaColor,
    overwrite?: boolean
  ) => RgbaColor
  fillPreviewPixelRects: (
    entries: ReadonlyArray<{
      pixelRect: {
        x: number
        y: number
        width: number
        height: number
      }
      sampleX: number
      sampleY: number
      color: RgbaColor
    }>
  ) => void
}) {
  if (
    (currentActiveLayer.kind !== 'tilemap' || currentSession.tilemapMode !== 'paint') &&
    (currentActiveLayer.kind !== 'free-tile' || currentSession.freeTileMode !== 'paint') &&
    brushPreviewMode !== 'none' &&
    canRenderToolPreview &&
    !inputRef.current.spaceHeld &&
    inputRef.current.pointer.visible &&
    !inputRef.current.sampling &&
    (!drag || (drag.kind === 'draw' && drawingBrushPreviewEnabled)) &&
    (currentSession.tool === 'pencil' || currentSession.tool === 'eraser' || currentSession.tool === 'line') &&
    !brushPreviewOverlaySupported(currentSession) &&
    // Hit testing can flush browser rendering work. Only pay for it when an
    // idle brush preview needs it; navigation and active strokes do not.
    (activeDrag?.kind === 'draw' || pointerOverCanvas())
  ) {
    const pointerLocation = repeatedDocumentPointsAt(inputRef.current.pointer.clientX, inputRef.current.pointer.clientY)
    const point = pointerLocation?.local ?? inputRef.current.pointer.point
    const drawing = drag?.kind === 'draw'
    const tilemapEditSelection = drawing ? undefined : tilemapEditSelectionAtPoint(point, currentSession)
    const previewAllowed = drawing || tilemapEditSelection !== null
    // A selection limits the actual stroke, not the idle brush cursor.
    // Keep the full brush visible until the pointer is pressed.
    const previewSelection = drawing && drag ? paintSelectionForDrag(drag) : null
    const currentBrushInputs = activeBrushInputsForTool(
      currentSession.tool,
      currentSession.fillKind ?? 'bucket',
      currentSession.brushImage,
      currentSession.brushTexture
    )
    const currentBrushImage = currentBrushInputs.imageBrush
    const currentBrushTexture = currentBrushInputs.texture
    const currentBrushDither = currentBrushImage ? undefined : (currentSession.brushDither ?? DEFAULT_BRUSH_DITHER_SETTINGS)
    const currentBrushPreviewMode = currentBrushImage?.intrinsicSize ? currentSession.brushPaintMode : 'paint'
    const currentProceduralAntialiasStrength =
      currentBrushInputs.fillTextureEnabled && currentSession.proceduralAntialias && currentBrushImage?.id.startsWith('procedural:')
        ? currentSession.proceduralAntialiasStrength
        : 0
    const erasing = currentSession.tool === 'eraser'
    // Dynamic mappings are already resolved into the active drag's last
    // sample.  When hovering, keep the configured brush size so enabling
    // pressure does not collapse the preview to the pointer-event hover
    // pressure (usually zero).
    const previewBrushSize = drawing ? (drag?.lastBrushSize ?? currentSession.brushSize) : currentSession.brushSize
    const previewBrushImage = currentBrushImage
    const previewBrushAngle = drawing ? (drag?.path?.at(-1)?.angle ?? brushBaseAngle(currentSession)) : brushBaseAngle(currentSession)
    const overwriteImageBrushPixels = !erasing && previewBrushImage?.intrinsicSize === true && currentBrushPreviewMode === 'paint'
    const { x: beforeX, y: beforeY } = brushStampAnchor(previewBrushSize, previewBrushImage, previewBrushAngle, currentSession.brushShape)
    const brushPoint = snapBrushPointToGrid(point, previewBrushSize, previewBrushImage, previewBrushAngle, currentSession)
    context.save()
    const outline = new CanvasAdaptiveOutline()
    const texture = currentBrushTexture
    const patternOrigin = brushPatternOrigin(brushPoint, previewBrushSize, previewBrushImage)
    const drawPreviewOutline = brushPreviewMode === 'edge' || brushPreviewMode === 'full-edge' || (erasing && brushPreviewMode === 'full')
    const solidPreviewSpans =
      !previewBrushImage &&
      texture === 'solid' &&
      !currentBrushDither?.enabled &&
      previewAllowed &&
      !previewSelection &&
      (view.tileRepeatMode ?? 'off') === 'off'
        ? solidBrushPreviewRowSpans(previewBrushSize, currentSession.brushShape, previewBrushAngle, optimizedRotationEnabled)
        : null
    const compositeFilledPreview = !drawing && (brushPreviewMode === 'full' || brushPreviewMode === 'full-edge')
      && brushPreviewNeedsComposite(document, currentActiveLayer.id)
    const directFullPreview = Boolean(
      !drawing && !compositeFilledPreview &&
        solidPreviewSpans &&
        currentSession.tool === 'pencil' &&
        currentSession.inkMode === 'simple' &&
        (brushPreviewMode === 'full' || brushPreviewMode === 'full-edge')
    )
    // Full-edge keeps an outline during a stroke. It uses the same exact
    // row-span geometry as the hover cursor, so drawing does not fall back
    // to the per-pixel Map/Set preview path.
    const fastSolidPreview = Boolean(!compositeFilledPreview && solidPreviewSpans && (brushPreviewMode === 'edge' || directFullPreview || drawPreviewOutline))

    // A drawing pencil in `full` mode has no cursor overlay by design. The
    // old path still built the complete mask/maps/set every frame before
    // discovering there was nothing to draw, which was especially costly
    // for 128px brushes.
    if (drawing && !drawPreviewOutline) {
      // No drawing-time preview work is required.
    } else if (fastSolidPreview && solidPreviewSpans) {
      const rowBounds = solidPreviewSpans.map((span) => ({
        y: brushPoint.y - beforeY + span.y,
        left: brushPoint.x - beforeX + span.left,
        right: brushPoint.x - beforeX + span.right
      }))

      if (directFullPreview) {
        const displayColor = resolveLayerCanvasColor(document, currentActiveLayer, currentSession.primaryColor)
        const previewColor = { ...displayColor, a: Math.round(displayColor.a * brushOpacityScale(1, currentSession.brushOpacity)) }
        context.fillStyle = `rgb(${previewColor.r} ${previewColor.g} ${previewColor.b} / ${previewColor.a / 255})`
        context.beginPath()
        for (const row of rowBounds) {
          if (row.y < 0 || row.y >= document.height) continue
          const left = Math.max(0, row.left)
          const right = Math.min(document.width - 1, row.right)
          if (right < left) continue
          const first = previewPixelRect(left, row.y)
          const last = previewPixelRect(right, row.y)
          context.rect(first.x, first.y, last.x + last.width - first.x, first.height)
        }
        context.fill()
      }

      if (drawPreviewOutline) {
        const clippedRows = rowBounds.map((row) =>
          row.y < 0 || row.y >= document.height ? null : { ...row, left: Math.max(0, row.left), right: Math.min(document.width - 1, row.right) }
        )
        const horizontalSegment = (left: number, right: number, y: number, bottom: boolean): void => {
          if (right < left) return
          const first = previewPixelRect(left, y)
          const last = previewPixelRect(right, y)
          const edgeY = bottom ? first.y + first.height : first.y
          context.moveTo(first.x, edgeY)
          context.lineTo(last.x + last.width, edgeY)
        }
        const exposedHorizontal = (
          row: { left: number; right: number; y: number },
          neighbor: { left: number; right: number; y: number } | null,
          bottom: boolean
        ): void => {
          if (!neighbor || neighbor.right < neighbor.left) {
            horizontalSegment(row.left, row.right, row.y, bottom)
            return
          }
          if (neighbor.left > row.left) horizontalSegment(row.left, Math.min(row.right, neighbor.left - 1), row.y, bottom)
          if (neighbor.right < row.right) horizontalSegment(Math.max(row.left, neighbor.right + 1), row.right, row.y, bottom)
        }
        context.lineWidth = brushEdgeThickness
        alignCanvasStrokePath(context)
        context.beginPath()
        for (let rowIndex = 0; rowIndex < clippedRows.length; rowIndex += 1) {
          const row = clippedRows[rowIndex]
          if (!row || row.right < row.left) continue
          const first = previewPixelRect(row.left, row.y)
          const last = previewPixelRect(row.right, row.y)
          outline.include({ x: first.x, y: first.y, width: last.x + last.width - first.x, height: first.height })
          context.moveTo(first.x, first.y)
          context.lineTo(first.x, first.y + first.height)
          context.moveTo(last.x + last.width, last.y)
          context.lineTo(last.x + last.width, last.y + last.height)
          const previous = rowIndex > 0 && clippedRows[rowIndex - 1]?.y === row.y - 1 ? clippedRows[rowIndex - 1] : null
          const next = rowIndex + 1 < clippedRows.length && clippedRows[rowIndex + 1]?.y === row.y + 1 ? clippedRows[rowIndex + 1] : null
          exposedHorizontal(row, previous, false)
          exposedHorizontal(row, next, true)
        }
        outline.stroke(context, undefined, brushEdgeColor)
      }
    } else {
      const mask = brushMaskOffsets(
        previewBrushSize,
        currentSession.brushShape,
        texture,
        currentSession.brushTextureScale,
        brushPoint.x - beforeX,
        brushPoint.y - beforeY,
        previewBrushImage,
        currentSession.brushImageSettings,
        currentProceduralAntialiasStrength,
        currentBrushPreviewMode,
        patternOrigin.x,
        patternOrigin.y,
        currentBrushDither,
        previewBrushAngle,
        optimizedRotationEnabled
      )
      const previewPoints = new Map<string, { x: number; y: number; coverage: number; color: RgbaColor }>()
      for (const offset of mask) {
        const sourcePoint = { x: brushPoint.x - beforeX + offset.x, y: brushPoint.y - beforeY + offset.y }
        previewPoints.set(`${sourcePoint.x}:${sourcePoint.y}`, {
          ...sourcePoint,
          coverage: offset.coverage,
          color: offset.color ?? currentSession.primaryColor
        })
      }
      const renderedPreviewPoints = new Map<string, { x: number; y: number; sampleX: number; sampleY: number; coverage: number; color: RgbaColor }>()
      for (const previewPoint of previewPoints.values()) {
        for (const placement of tileRepeatContinuousPreviewPlacements(
          previewPoint,
          document.width,
          document.height,
          view.tileRepeatMode ?? 'off',
          repeatCopies
        )) {
          const key = `${placement.point.x}:${placement.point.y}`
          const previous = renderedPreviewPoints.get(key)
          if (previous && previous.coverage > previewPoint.coverage) continue
          renderedPreviewPoints.set(key, {
            x: placement.point.x,
            y: placement.point.y,
            sampleX: placement.samplePoint.x,
            sampleY: placement.samplePoint.y,
            coverage: previewPoint.coverage,
            color: previewPoint.color
          })
        }
      }
      const occupied = new Set(renderedPreviewPoints.keys())
      const previewFillRects: Array<{
        pixelRect: { x: number; y: number; width: number; height: number }
        sampleX: number
        sampleY: number
        color: RgbaColor
      }> = []
      const cacheableSolidHover =
        !drawing &&
        !previewBrushImage &&
        texture === 'solid' &&
        !currentBrushDither?.enabled &&
        !previewSelection &&
        (view.tileRepeatMode ?? 'off') === 'off' &&
        currentSession.tool === 'pencil' &&
        (brushPreviewMode === 'full' || brushPreviewMode === 'full-edge')
      const stackCacheAllowed =
        cacheableSolidHover &&
        document.groups.length === 0 &&
        currentActiveLayer.kind !== 'tilemap' &&
        currentActiveLayer.kind !== 'free-tile' &&
        currentActiveLayer.opacity === 1 &&
        currentActiveLayer.blendMode === 'normal' &&
        currentActiveLayer.clippingMask !== true &&
        !currentActiveLayer.layerStyles &&
        document.layers.every((layer) => layer.opacity >= 0 && layer.blendMode === 'normal' && layer.clippingMask !== true && !layer.layerStyles)
      const activeStackIndex = stackCacheAllowed ? document.layers.findIndex((layer) => layer.id === currentActiveLayer.id) : -1
      const visibleStackX = Math.max(0, Math.floor(fromX))
      const visibleStackY = Math.max(0, Math.floor(fromY))
      const visibleStackWidth = Math.max(0, Math.min(document.width, Math.ceil(toX)) - visibleStackX)
      const visibleStackHeight = Math.max(0, Math.min(document.height, Math.ceil(toY)) - visibleStackY)
      let stackCache = brushPreviewStackCacheRef.current
      if (stackCacheAllowed && activeStackIndex >= 0 && visibleStackWidth > 0 && visibleStackHeight > 0) {
        const stackSignature = `${document.id}:${currentSession.contentRevision}:${currentActiveLayer.id}:${visibleStackX}:${visibleStackY}:${visibleStackWidth}:${visibleStackHeight}`
        if (!stackCache || stackCache.signature !== stackSignature) {
          const makeSubset = (layers: typeof document.layers): typeof document => ({
            ...document,
            layers,
            activeLayerId: layers[0]?.id ?? document.activeLayerId
          })
          stackCache = {
            signature: stackSignature,
            x: visibleStackX,
            y: visibleStackY,
            width: visibleStackWidth,
            height: visibleStackHeight,
            lower: compositeRegion(makeSubset(document.layers.slice(0, activeStackIndex)), visibleStackX, visibleStackY, visibleStackWidth, visibleStackHeight),
            upper: compositeRegion(makeSubset(document.layers.slice(activeStackIndex + 1)), visibleStackX, visibleStackY, visibleStackWidth, visibleStackHeight)
          }
          brushPreviewStackCacheRef.current = stackCache
        }
      } else if (!stackCacheAllowed) {
        brushPreviewStackCacheRef.current = null
        stackCache = null
      }
      const cacheSignature = cacheableSolidHover
        ? `${document.id}:${currentSession.contentRevision}:${currentActiveLayer.id}:${currentSession.inkMode}:${currentSession.primaryColor.r},${currentSession.primaryColor.g},${currentSession.primaryColor.b},${currentSession.primaryColor.a}:${currentSession.brushShape}:${previewBrushAngle}`
        : ''
      let previewColorCache = brushPreviewCompositeCacheRef.current
      if (cacheableSolidHover && (!previewColorCache || previewColorCache.signature !== cacheSignature)) {
        previewColorCache = { signature: cacheSignature, colors: new Map() }
        brushPreviewCompositeCacheRef.current = previewColorCache
      }
      const cachedPreviewColorAt = (pixelX: number, pixelY: number): RgbaColor => {
        if (
          stackCache &&
          pixelX >= stackCache.x &&
          pixelY >= stackCache.y &&
          pixelX < stackCache.x + stackCache.width &&
          pixelY < stackCache.y + stackCache.height
        ) {
          const offset = ((pixelY - stackCache.y) * stackCache.width + (pixelX - stackCache.x)) * 4
          const lower = { r: stackCache.lower[offset], g: stackCache.lower[offset + 1], b: stackCache.lower[offset + 2], a: stackCache.lower[offset + 3] }
          const upper = { r: stackCache.upper[offset], g: stackCache.upper[offset + 1], b: stackCache.upper[offset + 2], a: stackCache.upper[offset + 3] }
          const activeLayerColor = readLayerColorAt(document, currentActiveLayer, pixelX, pixelY)
          const stampedColor = resolveInkStampColor(currentSession.inkMode, currentSession.primaryColor)
          const replacement = applyInkColor(currentSession.inkMode, activeLayerColor, stampedColor) ?? activeLayerColor
          const resolvedReplacement = resolveLayerCanvasColor(document, currentActiveLayer, replacement)
          const composited = blendOver(blendOver(lower, resolvedReplacement), upper)
          if (!previewColorCache) return composited
          previewColorCache.colors.set(pixelY * document.width + pixelX, composited)
          return composited
        }
        if (!previewColorCache) return previewColorAt(pixelX, pixelY, erasing, 255, currentSession.primaryColor, undefined, overwriteImageBrushPixels)
        const key = pixelY * document.width + pixelX
        const cached = previewColorCache.colors.get(key)
        if (cached) return cached
        const color = previewColorAt(pixelX, pixelY, erasing, 255, currentSession.primaryColor, undefined, overwriteImageBrushPixels)
        previewColorCache.colors.set(key, color)
        return color
      }
      for (const previewPoint of renderedPreviewPoints.values()) {
        if (!previewAllowed || (previewSelection && !selectionContains(previewSelection, previewPoint.sampleX, previewPoint.sampleY))) continue
        const pixelRect = previewPixelRect(previewPoint.x, previewPoint.y)
        if (!drawing && (brushPreviewMode === 'full' || brushPreviewMode === 'full-edge')) {
          previewFillRects.push({
            pixelRect,
            sampleX: previewPoint.sampleX,
            sampleY: previewPoint.sampleY,
            color: cacheableSolidHover
              ? cachedPreviewColorAt(previewPoint.sampleX, previewPoint.sampleY)
              : previewColorAt(
                  previewPoint.sampleX,
                  previewPoint.sampleY,
                  erasing,
                  previewPoint.coverage,
                  previewPoint.color,
                  undefined,
                  overwriteImageBrushPixels
                )
          })
        }
      }
      // Composited colors replace document pixels, so they must use the
      // document grid. The half-device-pixel stroke offset applies only to
      // the outline; applying it to fills shifts upper layers under the cursor.
      fillPreviewPixelRects(previewFillRects)
      if (drawPreviewOutline) {
        context.lineWidth = brushEdgeThickness
        alignCanvasStrokePath(context)
        context.beginPath()
        for (const previewPoint of renderedPreviewPoints.values()) {
          if (!previewAllowed || (previewSelection && !selectionContains(previewSelection, previewPoint.sampleX, previewPoint.sampleY))) continue
          const pixelRect = previewPixelRect(previewPoint.x, previewPoint.y)
          const left = !occupied.has(`${previewPoint.x - 1}:${previewPoint.y}`)
          const right = !occupied.has(`${previewPoint.x + 1}:${previewPoint.y}`)
          const top = !occupied.has(`${previewPoint.x}:${previewPoint.y - 1}`)
          const bottom = !occupied.has(`${previewPoint.x}:${previewPoint.y + 1}`)
          if (left || right || top || bottom) outline.include(pixelRect)
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
        outline.stroke(context, undefined, brushEdgeColor)
      }
    }
    context.restore()
  }
}
