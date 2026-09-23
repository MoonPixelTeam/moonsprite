import type { RgbaColor } from '@shared/types-color'
import type { SelectionMask } from '@shared/types-selection'
import { getPaletteEntry, layerIndexAt } from '@/core/document-model'
import { unpackColor } from '@/core/raster'
import { brushMaskOffsets, brushPathStampPoints, brushStampAnchor } from '@/core/tools-brush'
import { deviceAlignedPixelRect } from '@/core/canvas-render-plan'
import { selectionContains } from '@/core/selection'
import { type CanvasPoint as Point } from '@/core/canvas-input'
import { hasSymmetry, symmetryPoints } from '@/core/symmetry'
import { activeTilemapCelTarget } from '@/core/tilemap-document'
import {
  readTilesetTilePixels,
  tilemapCellBounds,
  tilemapCellIndexAtPoint,
  tilemapSourcePointForCell,
  tilesetHasOnlyTransparentTile,
  tileRepeatLinePoints,
  tileRepeatMappedPointForCopies
} from '@/core/tilemap'
import type { DocumentSession } from '@/store/workspace-types'
import { brushBaseAngle } from './canvas-stage-helpers'
import { solidBrushPathSpans, visitSolidBrushPathColors } from './canvas-solid-brush-path'
export function createCanvasBrushPath({
  session,
  activeBrushImage,
  brushPatternOrigin,
  activeBrushPreviewMode,
  currentActiveLayer,
  currentSession,
  document,
  previewPixelPlacements,
  view,
  deviceScale,
  activeBrushTexture,
  proceduralAntialiasStrength,
  activeBrushDither,
  optimizedRotationEnabled,
  symmetryCenter,
  activeLayer,
  previewColorAt,
  previewLayerColorAt,
  drawTilemapEditPreviewTiles,
  queueTilesetTilePreview,
  fillPreviewPixelRects,
  drawPreviewPixel,
  balancedStraightLines
}: {
  session: DocumentSession
  activeBrushImage: import('@shared/types-brush').ImageBrush | null
  brushPatternOrigin: (
    point: import('@/core/canvas-input').CanvasPoint,
    size?: number,
    imageBrush?: import('@shared/types-brush').ImageBrush | null
  ) => import('@/core/canvas-input').CanvasPoint
  activeBrushPreviewMode: import('@shared/types-brush').BrushPaintMode
  currentActiveLayer: import('@shared/types-layer').RasterLayer
  currentSession: DocumentSession
  document: import('@shared/types-document').SpriteDocument
  previewPixelPlacements: (
    pixelX: number,
    pixelY: number
  ) => {
    point: {
      x: number
      y: number
    }
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
  }[]
  view: import('@shared/types-view').ViewState
  deviceScale: import('@/core/canvas-render-plan').CanvasDeviceScale
  activeBrushTexture: import('@shared/types-brush').BrushTexture
  proceduralAntialiasStrength: number
  activeBrushDither: import('@shared/types-brush').BrushDitherSettings | undefined
  optimizedRotationEnabled: boolean
  symmetryCenter: import('@/core/symmetry').SymmetryCenter
  activeLayer: import('@shared/types-layer').RasterLayer
  previewColorAt: (
    pixelX: number,
    pixelY: number,
    erase?: boolean,
    coverage?: number,
    paintColor?: RgbaColor,
    baseColor?: RgbaColor,
    overwrite?: boolean
  ) => RgbaColor
  previewLayerColorAt: (
    pixelX: number,
    pixelY: number,
    erase?: boolean,
    coverage?: number,
    paintColor?: RgbaColor,
    baseColor?: RgbaColor,
    overwrite?: boolean
  ) => RgbaColor
  drawTilemapEditPreviewTiles: (previewTiles: ReadonlyMap<string, Uint8ClampedArray>) => boolean
  queueTilesetTilePreview: (tilesetId: string | undefined, tiles: ReadonlyMap<string, Uint8ClampedArray>) => void
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
    }>,
    preserveOnionSkin?: boolean
  ) => void
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
  balancedStraightLines: boolean
}) {
  const drawBrushPathPreview = (
    points: readonly Point[],
    color: RgbaColor,
    erase = false,
    baseline?: ReadonlyMap<number, number>,
    selection: SelectionMask | null = session.selection
  ): void => {
    if (points.length === 0) return
    const previewAngle = (points.at(-1) as Point & { angle?: number }).angle ?? brushBaseAngle(session)
    const { x: beforeX, y: beforeY } = brushStampAnchor(session.brushSize, activeBrushImage, previewAngle, session.brushShape)
    const patternOrigin = brushPatternOrigin(points[0])
    const drawn = new Set<number>()
    const overwriteImageBrushPixels = !erase && activeBrushImage?.intrinsicSize === true && activeBrushPreviewMode === 'paint'
    const tilemapTarget =
      currentActiveLayer.kind === 'tilemap' && (currentSession.tilemapMode === 'edit' || currentSession.tilemapMode === 'hybrid')
        ? activeTilemapCelTarget(document)
        : null
    const tilemapTileset = tilemapTarget?.layer.tilemapTilesetId
      ? document.tilesets?.find((tileset) => tileset.id === tilemapTarget.layer.tilemapTilesetId)
      : null
    const originalTilePixels = new Map<string, Uint8ClampedArray>()
    const previewTilePixels = new Map<string, Uint8ClampedArray>()
    const previewFillRects: Array<{ pixelRect: { x: number; y: number; width: number; height: number }; sampleX: number; sampleY: number; color: RgbaColor }> =
      []
    const queuePreviewPixel = (pixelX: number, pixelY: number, color: RgbaColor): void => {
      for (const { point, copy } of previewPixelPlacements(pixelX, pixelY)) {
        previewFillRects.push({
          pixelRect: deviceAlignedPixelRect(copy.originX, copy.originY, view.zoom, point.x, point.y, deviceScale),
          sampleX: point.x,
          sampleY: point.y,
          color
        })
      }
    }
    const centers = brushPathStampPoints(points, session.brushSize, activeBrushImage, previewAngle, session.brushShape)
    const exactSolidSpans = session.brushShape === 'round' || (session.brushShape === 'square' && previewAngle % 90 === 0)
      || (session.brushShape === 'line' && previewAngle % 360 === 0)
    if (!activeBrushImage && activeBrushTexture === 'solid' && !activeBrushDither?.enabled && exactSolidSpans
      && !hasSymmetry(session.symmetryAxes) && (view.tileRepeatMode ?? 'off') === 'off' && !tilemapTarget
      && Math.min(view.zoom * deviceScale.x, view.zoom * deviceScale.y) >= 1) {
      const spans = solidBrushPathSpans(centers, session.brushSize, session.brushShape, previewAngle, optimizedRotationEnabled, document.width, document.height)
      visitSolidBrushPathColors(spans, selection, (x, y) => {
        const index = baseline ? layerIndexAt(activeLayer, x, y) : null
        const packed = index === null ? undefined : baseline?.get(index)
        const base = packed === undefined ? undefined : activeLayer.format === 'rgba' ? unpackColor(packed) : getPaletteEntry(document, packed).color
        return previewColorAt(x, y, erase, 255, color, base, Boolean(baseline && base && base.r === color.r && base.g === color.g && base.b === color.b && base.a === color.a))
      }, (left, right, y, color) => {
        for (const { point, copy } of previewPixelPlacements(left, y)) {
          const first = deviceAlignedPixelRect(copy.originX, copy.originY, view.zoom, point.x, point.y, deviceScale)
          const last = deviceAlignedPixelRect(copy.originX, copy.originY, view.zoom, point.x + right - left, point.y, deviceScale)
          previewFillRects.push({ pixelRect: { ...first, width: last.x + last.width - first.x }, sampleX: point.x, sampleY: point.y, color })
        }
      })
      fillPreviewPixelRects(previewFillRects, erase)
      return
    }
    if (overwriteImageBrushPixels) centers.reverse()
    for (const center of centers) {
      const x = center.x
      const y = center.y
      const mask = brushMaskOffsets(
        session.brushSize,
        session.brushShape,
        activeBrushTexture,
        session.brushTextureScale,
        x - beforeX,
        y - beforeY,
        activeBrushImage,
        session.brushImageSettings,
        proceduralAntialiasStrength,
        activeBrushPreviewMode,
        patternOrigin.x,
        patternOrigin.y,
        activeBrushDither,
        previewAngle,
        optimizedRotationEnabled
      )
      for (const offset of mask) {
        for (const target of symmetryPoints(
          { x: x - beforeX + offset.x, y: y - beforeY + offset.y },
          document.width,
          document.height,
          session.symmetryAxes,
          symmetryCenter
        )) {
          const mapped = tileRepeatMappedPointForCopies(target, document.width, document.height, view.tileRepeatMode ?? 'off', true)
          if (!mapped) continue
          const { x: pixelX, y: pixelY } = mapped.local
          const index = pixelY * document.width + pixelX
          if (
            pixelX < 0 ||
            pixelY < 0 ||
            pixelX >= document.width ||
            pixelY >= document.height ||
            drawn.has(index) ||
            (selection && !selectionContains(selection, pixelX, pixelY))
          )
            continue
          drawn.add(index)
          const layerIndex = baseline ? layerIndexAt(activeLayer, pixelX, pixelY) : null
          const packedBase = layerIndex === null ? undefined : baseline?.get(layerIndex)
          const baseColor =
            packedBase === undefined ? undefined : activeLayer.format === 'rgba' ? unpackColor(packedBase) : getPaletteEntry(document, packedBase).color
          if (tilemapTarget && tilemapTileset) {
            if (currentSession.tilemapMode === 'edit' && tilesetHasOnlyTransparentTile(tilemapTileset)) {
              queuePreviewPixel(
                pixelX,
                pixelY,
                previewColorAt(pixelX, pixelY, erase, offset.coverage, offset.color ?? color, baseColor, overwriteImageBrushPixels || Boolean(baseline && baseColor && (offset.color ?? color).r === baseColor.r && (offset.color ?? color).g === baseColor.g && (offset.color ?? color).b === baseColor.b && (offset.color ?? color).a === baseColor.a))
              )
              continue
            }
            const cellIndex = tilemapCellIndexAtPoint(tilemapTarget.tilemap, tilemapTarget.surface.offsetX, tilemapTarget.surface.offsetY, pixelX, pixelY)
            const cell = cellIndex === null ? null : tilemapTarget.tilemap.cells[cellIndex]
            if (!cell || cell.tilesetId !== tilemapTileset.id) {
              if (currentSession.tilemapMode === 'hybrid')
                queuePreviewPixel(
                  pixelX,
                  pixelY,
                  previewColorAt(pixelX, pixelY, erase, offset.coverage, offset.color ?? color, baseColor, overwriteImageBrushPixels || Boolean(baseline && baseColor && (offset.color ?? color).r === baseColor.r && (offset.color ?? color).g === baseColor.g && (offset.color ?? color).b === baseColor.b && (offset.color ?? color).a === baseColor.a))
                )
              continue
            }
            let original = originalTilePixels.get(cell.tileId)
            if (!original) {
              original = readTilesetTilePixels(tilemapTileset, cell.tileId) ?? undefined
              if (!original) continue
              originalTilePixels.set(cell.tileId, original)
            }
            let preview = previewTilePixels.get(cell.tileId)
            if (!preview) {
              preview = new Uint8ClampedArray(original)
              previewTilePixels.set(cell.tileId, preview)
            }
            const bounds = tilemapCellBounds(tilemapTarget.tilemap, tilemapTarget.surface.offsetX, tilemapTarget.surface.offsetY, cellIndex!)
            const source = tilemapSourcePointForCell(pixelX - bounds.x, pixelY - bounds.y, bounds.width, bounds.height, cell)
            const sourceOffset = (source.y * bounds.width + source.x) * 4
            const originalColor = baseColor ?? {
              r: original[sourceOffset],
              g: original[sourceOffset + 1],
              b: original[sourceOffset + 2],
              a: original[sourceOffset + 3]
            }
            const replacement = previewLayerColorAt(pixelX, pixelY, erase, offset.coverage, offset.color ?? color, originalColor, overwriteImageBrushPixels)
            preview[sourceOffset] = replacement.r
            preview[sourceOffset + 1] = replacement.g
            preview[sourceOffset + 2] = replacement.b
            preview[sourceOffset + 3] = replacement.a
          } else
            queuePreviewPixel(
              pixelX,
              pixelY,
              previewColorAt(pixelX, pixelY, erase, offset.coverage, offset.color ?? color, baseColor, overwriteImageBrushPixels || Boolean(baseline && baseColor && (offset.color ?? color).r === baseColor.r && (offset.color ?? color).g === baseColor.g && (offset.color ?? color).b === baseColor.b && (offset.color ?? color).a === baseColor.a))
            )
        }
      }
    }
    if (previewTilePixels.size > 0) {
      drawTilemapEditPreviewTiles(previewTilePixels)
      queueTilesetTilePreview(tilemapTileset?.id, previewTilePixels)
    }
    fillPreviewPixelRects(previewFillRects, erase)
  }
  const drawShapeContourPreview = (points: Iterable<Point>, color: RgbaColor, selection: SelectionMask | null): void => {
    const drawn = new Set<string>()
    const drawPoint = (point: Point): void => {
      const key = `${point.x}:${point.y}`
      if (drawn.has(key)) return
      drawn.add(key)
      if (point.x < 0 || point.y < 0 || point.x >= document.width || point.y >= document.height) {
        return
      } else if (!selection || selectionContains(selection, point.x, point.y)) {
        drawPreviewPixel(point.x, point.y, previewColorAt(point.x, point.y, false, 255, color))
      }
    }
    if (!hasSymmetry(session.symmetryAxes)) {
      for (const point of points) drawPoint(point)
      return
    }
    for (const sourcePoint of points) {
      for (const point of symmetryPoints(sourcePoint, document.width, document.height, session.symmetryAxes, symmetryCenter, false)) drawPoint(point)
    }
  }
  const drawStrokePreview = (from: Point, to: Point, erase = false, baseline?: ReadonlyMap<number, number>, selection: SelectionMask | null = null): void => {
    const points = tileRepeatLinePoints(from, to, document.width, document.height, view.tileRepeatMode ?? 'off', balancedStraightLines ? 'balanced' : 'raster')
    drawBrushPathPreview(points, session.primaryColor, erase, baseline, selection)
  }
  return { drawBrushPathPreview, drawShapeContourPreview, drawStrokePreview }
}
