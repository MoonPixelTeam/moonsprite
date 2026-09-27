import { createLinearDitherPreviewSampler } from '../core/gradient-dither-preview'
import { createGradientReplacementSampler } from '@/core/gradient-preview-sampling'
import { createGradientCompositePreview, compositeGradientPreviewAt, fillGradientPreviewBlock, gradientReplacementColor } from '@/core/gradient-preview'
import type { RgbaColor } from '@shared/types-color'
import { layerMaskDisplayColor, readLayerColorAt, resolveLayerCanvasColor } from '@/core/document-model'
import { blendOver, relativeLuminanceColor } from '@/core/raster'
import { createGradientColorSampler, resolveRadialGradientGeometry } from '@/core/gradient'
import { deviceAlignedCanvasRect } from '@/core/canvas-render-plan'
import { selectionContains } from '@/core/selection'
import { type CanvasDragState as DragState } from '@/core/canvas-input'
import { transparencyColorAt } from '@/core/canvas-visuals'
import { type RasterContext2D } from '@/components/canvas-selection-renderer'
import type * as React from 'react'
import type { DocumentSession } from '@/store/workspace-types'
import {
  GradientCompositePreviewCache,
  GradientPreviewSurface,
  GradientPreviewCoverageCache,
  DITHERED_GRADIENT_PREVIEW_SAMPLE_LIMIT,
  SMOOTH_GRADIENT_PREVIEW_SAMPLE_LIMIT
} from './canvas-stage-helpers'
export function renderCanvasGradient({
  canRenderToolPreview,
  drag,
  session,
  gradientStops,
  paintSelectionForDrag,
  repeatCopies,
  gradientPreviewDiagnosticsRef,
  document,
  activeLayer,
  isolatedLayerMask,
  gradientCompositePreviewCacheRef,
  currentSession,
  gradientDither,
  gradientType,
  gradientGeometryOptionsForDrag,
  compositePointReplacementSampler,
  previewPixelRect,
  deviceScale,
  view,
  gradientPreviewSurfaceRef,
  checkerboard,
  originX,
  originY,
  gradientPreviewCoverageCacheRef,
  context,
  clipCanvasCopy,
  smoothPixelSampling,
  gradientPreviewInputAtRef,
  gradientLineVisible,
  gradientLineColor
}: {
  canRenderToolPreview: boolean
  drag: DragState | null
  session: DocumentSession
  gradientStops: import('@shared/types-brush').GradientStop[] | undefined
  paintSelectionForDrag: (drag: import('@/core/canvas-input').CanvasDragState) => import('@shared/types-selection').SelectionMask | null
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
  gradientPreviewDiagnosticsRef: React.RefObject<{
    record(
      key: string,
      detail: import('@/core/runtime-diagnostics').RuntimeDiagnosticDetail,
      timing: import('@/core/gradient-preview-diagnostics').GradientPreviewTiming
    ): void
    flush: () => void
  } | null>
  document: import('@shared/types-document').SpriteDocument
  activeLayer: import('@shared/types-layer').RasterLayer
  isolatedLayerMask: import('@shared/types-layer').LayerMask | null
  gradientCompositePreviewCacheRef: React.RefObject<GradientCompositePreviewCache | null>
  currentSession: DocumentSession
  gradientDither: import('@shared/types-brush').GradientDither
  gradientType: import('@shared/types-brush').GradientType
  gradientGeometryOptionsForDrag: (
    drag: Pick<import('@/core/canvas-input').CanvasDragState, 'constrain' | 'gradientAngle' | 'gradientFromCenter' | 'gradientRadialGeometry'>
  ) => import('@/core/gradient-color').GradientGeometryOptions | undefined
  compositePointReplacementSampler: (x: number, y: number, replacement: RgbaColor) => RgbaColor
  previewPixelRect: (
    pixelX: number,
    pixelY: number
  ) => {
    x: number
    y: number
    width: number
    height: number
  }
  deviceScale: import('@/core/canvas-render-plan').CanvasDeviceScale
  view: import('@shared/types-view').ViewState
  gradientPreviewSurfaceRef: React.RefObject<GradientPreviewSurface | null>
  checkerboard: import('@/core/file-preferences').CheckerboardPreferences
  originX: number
  originY: number
  gradientPreviewCoverageCacheRef: React.RefObject<GradientPreviewCoverageCache | null>
  context: RasterContext2D
  clipCanvasCopy: (
    targetContext: RasterContext2D,
    copy: {
      x: number
      y: number
    }
  ) => void
  smoothPixelSampling: boolean
  gradientPreviewInputAtRef: React.RefObject<number>
  gradientLineVisible: boolean
  gradientLineColor: RgbaColor
}) {
  if (canRenderToolPreview && drag?.kind === 'gradient') {
    const moved = drag.start.x !== drag.last.x || drag.start.y !== drag.last.y
    if (moved) {
      const startColor = drag.color ?? session.primaryColor
      const endColor = drag.gradientEndColor ?? session.secondaryColor
      const activeGradientStops = drag.gradientStops ?? gradientStops
      const selection = paintSelectionForDrag(drag)
      const paintRegion = drag.gradientPaintRegion
      let previewFromX = Math.min(...repeatCopies.map((copy) => copy.fromX))
      let previewFromY = Math.min(...repeatCopies.map((copy) => copy.fromY))
      let previewToX = Math.max(...repeatCopies.map((copy) => copy.toX))
      let previewToY = Math.max(...repeatCopies.map((copy) => copy.toY))
      if (selection) {
        previewFromX = Math.max(previewFromX, selection.x)
        previewFromY = Math.max(previewFromY, selection.y)
        previewToX = Math.min(previewToX, selection.x + selection.width)
        previewToY = Math.min(previewToY, selection.y + selection.height)
      }
      if (paintRegion) {
        previewFromX = Math.max(previewFromX, paintRegion.x)
        previewFromY = Math.max(previewFromY, paintRegion.y)
        previewToX = Math.min(previewToX, paintRegion.x + paintRegion.width)
        previewToY = Math.min(previewToY, paintRegion.y + paintRegion.height)
      }
      if (previewToX > previewFromX && previewToY > previewFromY) {
        const gradientDiagnostic = gradientPreviewDiagnosticsRef.current
        const gradientPreviewStartedAt = gradientDiagnostic ? performance.now() : 0
        const activeIndex = document.layers.indexOf(activeLayer)
        const canUseStaticComposite =
          !isolatedLayerMask &&
          activeIndex >= 0 &&
          !activeLayer.background &&
          activeLayer.visible &&
          activeLayer.opacity === 1 &&
          activeLayer.blendMode === 'normal' &&
          activeLayer.clippingMask !== true &&
          !activeLayer.layerStyles
        let staticComposite = gradientCompositePreviewCacheRef.current
        let sampleCompositeReplacement = compositePointReplacementSampler
        const opaqueReplacement =
          document.colorMode === 'rgba' &&
          activeLayer.format === 'rgba' &&
          startColor.a === 255 &&
          endColor.a === 255 &&
          (activeGradientStops?.every((stop) => stop.color.a === 255) ?? true)
        if (canUseStaticComposite) {
          const staticKey = `${document.id}:${currentSession.revision}:${activeLayer.id}:${document.width}x${document.height}:${previewFromX},${previewFromY},${previewToX},${previewToY}:${opaqueReplacement}`
          if (!staticComposite || staticComposite.key !== staticKey) {
            staticComposite = {
              key: staticKey,
              ...createGradientCompositePreview(
                document,
                activeIndex,
                {
                  x: previewFromX,
                  y: previewFromY,
                  width: previewToX - previewFromX,
                  height: previewToY - previewFromY
                },
                opaqueReplacement
              )
            }
            gradientCompositePreviewCacheRef.current = staticComposite
          }
        } else if (!isolatedLayerMask) {
          const key = `replacement:${document.id}:${currentSession.revision}:${activeLayer.id}:${document.width}x${document.height}:${previewFromX},${previewFromY},${previewToX},${previewToY}`
          let cached = gradientCompositePreviewCacheRef.current
          if (!cached || cached.key !== key) {
            const bounds = { x: previewFromX, y: previewFromY, width: previewToX - previewFromX, height: previewToY - previewFromY }
            cached = { key, ...bounds, lower: null, upper: null,
              replacementSampler: createGradientReplacementSampler(document, activeLayer.id, bounds) }
            gradientCompositePreviewCacheRef.current = cached
          }
          sampleCompositeReplacement = cached.replacementSampler ?? compositePointReplacementSampler
          staticComposite = null
        } else {
          staticComposite = null
          gradientCompositePreviewCacheRef.current = null
        }
        const sampleGradient = createGradientColorSampler(
          startColor,
          endColor,
          drag.start,
          drag.last,
          gradientDither,
          gradientType,
          gradientGeometryOptionsForDrag(drag),
          activeGradientStops
        )
        const firstPixelRect = previewPixelRect(previewFromX, previewFromY)
        const lastPixelRect = previewPixelRect(previewToX - 1, previewToY - 1)
        const targetX = firstPixelRect.x
        const targetY = firstPixelRect.y
        const targetWidth = lastPixelRect.x + lastPixelRect.width - targetX
        const targetHeight = lastPixelRect.y + lastPixelRect.height - targetY
        const nativeSourceWidth = Math.max(1, Math.round(targetWidth * deviceScale.x))
        const nativeSourceHeight = Math.max(1, Math.round(targetHeight * deviceScale.y))
        const visibleDocumentWidth = previewToX - previewFromX
        const visibleDocumentHeight = previewToY - previewFromY
        const useLinearDitherAverages = gradientType === 'linear' && gradientDither !== 'none' && !selection?.mask && !paintRegion?.mask
        const useDocumentDitherSurface = view.zoom < 1 && gradientDither !== 'none' && !useLinearDitherAverages
        const sourceBasisWidth = useDocumentDitherSurface ? visibleDocumentWidth : nativeSourceWidth
        const sourceBasisHeight = useDocumentDitherSurface ? visibleDocumentHeight : nativeSourceHeight
        const previewSampleLimit =
          view.zoom < 1 && gradientDither !== 'none'
            ? DITHERED_GRADIENT_PREVIEW_SAMPLE_LIMIT
            : view.zoom < 1
              ? SMOOTH_GRADIENT_PREVIEW_SAMPLE_LIMIT
              : Number.POSITIVE_INFINITY
        const previewScale = Math.min(1, Math.sqrt(previewSampleLimit / (sourceBasisWidth * sourceBasisHeight)))
        const sourceWidth = Math.max(1, Math.round(sourceBasisWidth * previewScale))
        const sourceHeight = Math.max(1, Math.round(sourceBasisHeight * previewScale))
        let surface = gradientPreviewSurfaceRef.current
        if (!surface || surface.width !== sourceWidth || surface.height !== sourceHeight) {
          const surfaceCanvas = new OffscreenCanvas(sourceWidth, sourceHeight)
          const surfaceContext = surfaceCanvas.getContext('2d')
          surface = null
          if (surfaceContext) {
            const pixels = new Uint8ClampedArray(sourceWidth * sourceHeight * 4)
            surface = {
              canvas: surfaceCanvas,
              context: surfaceContext,
              imageData: new ImageData(pixels as Uint8ClampedArray<ArrayBuffer>, sourceWidth, sourceHeight),
              pixels,
              width: sourceWidth,
              height: sourceHeight
            }
            gradientPreviewSurfaceRef.current = surface
          }
        }
        if (surface) {
          const gradientPrepareEndedAt = gradientDiagnostic ? performance.now() : 0
          const pixels = surface.pixels
          pixels.fill(0)
          const pixelWords = new Uint32Array(pixels.buffer, pixels.byteOffset, pixels.byteLength / 4)
          const writeSample = (
            sampleX: number,
            sampleY: number,
            alpha: number,
            left: number,
            top: number,
            right: number,
            bottom: number,
            sampledGradientColor?: RgbaColor
          ): void => {
            if (alpha <= 0 || right <= left || bottom <= top) return
            const gradientColor = sampledGradientColor ?? sampleGradient(sampleX, sampleY)
            const replacement =
              gradientColor.a === 255 ? gradientColor : gradientReplacementColor(readLayerColorAt(document, activeLayer, sampleX, sampleY), gradientColor)
            const resolvedReplacement = resolveLayerCanvasColor(document, activeLayer, replacement)
            const previewColor = staticComposite
              ? compositeGradientPreviewAt(staticComposite, sampleX, sampleY, resolvedReplacement)
              : isolatedLayerMask
                ? layerMaskDisplayColor(resolvedReplacement)
                : sampleCompositeReplacement(sampleX, sampleY, resolvedReplacement)
            const displayColor = view.relativeLuminance ? relativeLuminanceColor(previewColor) : previewColor
            const transparency = transparencyColorAt(sampleX, sampleY, checkerboard)
            const composited =
              displayColor.a === 255
                ? displayColor
                : displayColor.a > 0
                  ? blendOver({ r: transparency.r, g: transparency.g, b: transparency.b, a: 255 }, displayColor)
                  : transparency
            fillGradientPreviewBlock(pixelWords, sourceWidth, left, top, right, bottom, { ...composited, a: alpha })
          }
          const previewDocumentBlockAt = (
            deviceX: number,
            deviceY: number
          ): { fromX: number; fromY: number; toX: number; toY: number; centerX: number; centerY: number } | null => {
            if (sourceWidth === visibleDocumentWidth && sourceHeight === visibleDocumentHeight) {
              const x = previewFromX + deviceX
              const y = previewFromY + deviceY
              return { fromX: x, fromY: y, toX: x + 1, toY: y + 1, centerX: x, centerY: y }
            }
            const documentLeft = (targetX + (deviceX / sourceWidth) * targetWidth - originX) / view.zoom
            const documentTop = (targetY + (deviceY / sourceHeight) * targetHeight - originY) / view.zoom
            const documentRight = (targetX + ((deviceX + 1) / sourceWidth) * targetWidth - originX) / view.zoom
            const documentBottom = (targetY + ((deviceY + 1) / sourceHeight) * targetHeight - originY) / view.zoom
            const blockFromX = Math.max(previewFromX, Math.floor(documentLeft + 1e-9))
            const blockFromY = Math.max(previewFromY, Math.floor(documentTop + 1e-9))
            const blockToX = Math.min(previewToX, Math.ceil(documentRight - 1e-9))
            const blockToY = Math.min(previewToY, Math.ceil(documentBottom - 1e-9))
            if (blockToX <= blockFromX || blockToY <= blockFromY) return null
            return {
              fromX: useLinearDitherAverages ? Math.max(previewFromX, documentLeft) : blockFromX,
              fromY: useLinearDitherAverages ? Math.max(previewFromY, documentTop) : blockFromY,
              toX: useLinearDitherAverages ? Math.min(previewToX, documentRight) : blockToX,
              toY: useLinearDitherAverages ? Math.min(previewToY, documentBottom) : blockToY,
              centerX: Math.min(blockToX - 1, blockFromX + Math.floor((blockToX - blockFromX) / 2)),
              centerY: Math.min(blockToY - 1, blockFromY + Math.floor((blockToY - blockFromY) / 2))
            }
          }
          const averageLinearDither = useLinearDitherAverages
            ? createLinearDitherPreviewSampler(startColor, endColor, drag.start, drag.last, gradientDither, previewFromX, previewToX, activeGradientStops)
            : null
          const averagedDitherColor = (
            block: NonNullable<ReturnType<typeof previewDocumentBlockAt>>,
            allowed?: (x: number, y: number) => boolean
          ): RgbaColor | undefined => {
            if (gradientDither === 'none') return undefined
            if (averageLinearDither && !allowed) return averageLinearDither(block)
            let count = 0
            let alpha = 0
            let red = 0
            let green = 0
            let blue = 0
            for (let y = block.fromY; y < block.toY; y += 1)
              for (let x = block.fromX; x < block.toX; x += 1) {
                if (allowed && !allowed(x, y)) continue
                const color = sampleGradient(x, y)
                count += 1
                alpha += color.a
                red += color.r * color.a
                green += color.g * color.a
                blue += color.b * color.a
              }
            if (count === 0) return undefined
            return {
              r: alpha > 0 ? Math.round(red / alpha) : 0,
              g: alpha > 0 ? Math.round(green / alpha) : 0,
              b: alpha > 0 ? Math.round(blue / alpha) : 0,
              a: Math.round(alpha / count)
            }
          }
          if (view.zoom >= 1) {
            for (let y = previewFromY; y < previewToY; y += 1)
              for (let x = previewFromX; x < previewToX; x += 1) {
                if (selection && !selectionContains(selection, x, y)) continue
                if (paintRegion && !selectionContains(paintRegion, x, y)) continue
                const pixelRect = previewPixelRect(x, y)
                const left = Math.max(0, Math.round((pixelRect.x - targetX) * deviceScale.x))
                const top = Math.max(0, Math.round((pixelRect.y - targetY) * deviceScale.y))
                const right = Math.min(sourceWidth, Math.round((pixelRect.x + pixelRect.width - targetX) * deviceScale.x))
                const bottom = Math.min(sourceHeight, Math.round((pixelRect.y + pixelRect.height - targetY) * deviceScale.y))
                writeSample(x, y, 255, left, top, right, bottom)
              }
          } else {
            const selectionMask = selection?.mask
            const paintMask = paintRegion?.mask
            if (averageLinearDither && opaqueReplacement && staticComposite && !view.relativeLuminance) {
              // Axis bounds do not depend on the other axis. Compute them
              // once per row/column, rather than allocating a block and
              // converting coordinates for every display pixel.
              const columns = Array.from({ length: sourceWidth }, (_, x) => previewDocumentBlockAt(x, 0))
              const block = { fromX: 0, fromY: 0, toX: 0, toY: 0 }
              for (let deviceY = 0; deviceY < sourceHeight; deviceY++) {
                const row = previewDocumentBlockAt(0, deviceY)
                if (!row) continue
                if (!staticComposite.upper) {
                  averageLinearDither.writeRow(row.fromY, row.toY, columns, pixelWords, deviceY * sourceWidth)
                  continue
                }
                block.fromY = row.fromY
                block.toY = row.toY
                for (let deviceX = 0; deviceX < sourceWidth; deviceX++) {
                  const column = columns[deviceX]
                  if (!column) continue
                  block.fromX = column.fromX
                  block.toX = column.toX
                  const gradientColor = averageLinearDither(block)
                  const color = staticComposite.upper ? compositeGradientPreviewAt(staticComposite, column.centerX, row.centerY, gradientColor) : gradientColor
                  pixelWords[deviceY * sourceWidth + deviceX] = (255 << 24) | (color.b << 16) | (color.g << 8) | color.r
                }
              }
            } else if (!selectionMask && !paintMask) {
              for (let deviceY = 0; deviceY < sourceHeight; deviceY += 1)
                for (let deviceX = 0; deviceX < sourceWidth; deviceX += 1) {
                  const block = previewDocumentBlockAt(deviceX, deviceY)
                  if (!block) continue
                  writeSample(block.centerX, block.centerY, 255, deviceX, deviceY, deviceX + 1, deviceY + 1, averagedDitherColor(block))
                }
            } else {
              const maskedPointAllowed = (x: number, y: number): boolean =>
                (!selectionMask || selectionMask[(y - selection!.y) * selection!.width + x - selection!.x] === 1) &&
                (!paintMask || paintMask[(y - paintRegion!.y) * paintRegion!.width + x - paintRegion!.x] === 1)
              let coverageCache = gradientPreviewCoverageCacheRef.current
              const cacheMatches =
                coverageCache &&
                coverageCache.selection === selection &&
                coverageCache.paintRegion === paintRegion &&
                coverageCache.previewFromX === previewFromX &&
                coverageCache.previewFromY === previewFromY &&
                coverageCache.previewToX === previewToX &&
                coverageCache.previewToY === previewToY &&
                coverageCache.targetX === targetX &&
                coverageCache.targetY === targetY &&
                coverageCache.targetWidth === targetWidth &&
                coverageCache.targetHeight === targetHeight &&
                coverageCache.sourceWidth === sourceWidth &&
                coverageCache.sourceHeight === sourceHeight &&
                coverageCache.zoom === view.zoom &&
                coverageCache.originX === originX &&
                coverageCache.originY === originY &&
                coverageCache.deviceScale.x === deviceScale.x &&
                coverageCache.deviceScale.y === deviceScale.y
              if (!cacheMatches) {
                const coverage = new Uint8ClampedArray(sourceWidth * sourceHeight)
                const sampleX = new Int32Array(sourceWidth * sourceHeight)
                const sampleY = new Int32Array(sourceWidth * sourceHeight)
                for (let deviceY = 0; deviceY < sourceHeight; deviceY += 1)
                  for (let deviceX = 0; deviceX < sourceWidth; deviceX += 1) {
                    const block = previewDocumentBlockAt(deviceX, deviceY)
                    if (!block) continue
                    const total = (block.toX - block.fromX) * (block.toY - block.fromY)
                    let valid = 0
                    let firstValidX = -1
                    let firstValidY = -1
                    for (let y = block.fromY; y < block.toY; y += 1)
                      for (let x = block.fromX; x < block.toX; x += 1) {
                        if (!maskedPointAllowed(x, y)) continue
                        valid += 1
                        if (firstValidX < 0) {
                          firstValidX = x
                          firstValidY = y
                        }
                      }
                    if (valid === 0) continue
                    const offset = deviceY * sourceWidth + deviceX
                    const centerValid = maskedPointAllowed(block.centerX, block.centerY)
                    coverage[offset] = Math.round((valid / total) * 255)
                    sampleX[offset] = centerValid ? block.centerX : firstValidX
                    sampleY[offset] = centerValid ? block.centerY : firstValidY
                  }
                coverageCache = {
                  selection,
                  paintRegion,
                  previewFromX,
                  previewFromY,
                  previewToX,
                  previewToY,
                  targetX,
                  targetY,
                  targetWidth,
                  targetHeight,
                  sourceWidth,
                  sourceHeight,
                  zoom: view.zoom,
                  originX,
                  originY,
                  deviceScale,
                  coverage,
                  sampleX,
                  sampleY
                }
                gradientPreviewCoverageCacheRef.current = coverageCache
              }
              if (coverageCache) {
                for (let deviceY = 0; deviceY < sourceHeight; deviceY += 1)
                  for (let deviceX = 0; deviceX < sourceWidth; deviceX += 1) {
                    const offset = deviceY * sourceWidth + deviceX
                    const alpha = coverageCache.coverage[offset]
                    if (alpha === 0) continue
                    const block = previewDocumentBlockAt(deviceX, deviceY)
                    if (!block) continue
                    writeSample(
                      coverageCache.sampleX[offset],
                      coverageCache.sampleY[offset],
                      alpha,
                      deviceX,
                      deviceY,
                      deviceX + 1,
                      deviceY + 1,
                      averagedDitherColor(block, maskedPointAllowed)
                    )
                  }
              }
            }
          }
          const gradientRasterEndedAt = gradientDiagnostic ? performance.now() : 0
          surface.context.putImageData(surface.imageData, 0, 0)
          for (const copy of repeatCopies) {
            context.save()
            clipCanvasCopy(context, copy)
            context.globalCompositeOperation = 'source-over'
            context.globalAlpha = 1
            context.imageSmoothingEnabled = smoothPixelSampling
            if (smoothPixelSampling) context.imageSmoothingQuality = 'high'
            const gradientBoundary = deviceAlignedCanvasRect(
              targetX + copy.originX - originX,
              targetY + copy.originY - originY,
              targetWidth,
              targetHeight,
              deviceScale
            )
            context.drawImage(
              surface.canvas,
              0,
              0,
              sourceWidth,
              sourceHeight,
              gradientBoundary.left,
              gradientBoundary.top,
              gradientBoundary.width,
              gradientBoundary.height
            )
            context.restore()
          }
          if (gradientDiagnostic && gradientPreviewInputAtRef.current > 0) {
            const endedAt = performance.now()
            const path =
              view.zoom >= 1 ? 'document-pixels' : useLinearDitherAverages ? 'linear-periodic' : gradientDither === 'none' ? 'smooth' : 'sampled-dither'
            const composite =
              opaqueReplacement && staticComposite && !view.relativeLuminance && useLinearDitherAverages && view.zoom < 1
                ? 'direct-opaque'
                : staticComposite
                  ? 'static-stack'
                  : 'per-pixel-stack'
            gradientDiagnostic.record(
              `${path}:${composite}:${gradientDither}:${document.width}:${document.height}:${view.zoom}`,
              {
                path,
                composite,
                dither: gradientDither,
                type: gradientType,
                zoom: view.zoom,
                width: document.width,
                height: document.height,
                stops: activeGradientStops?.length ?? 2,
                selectionMask: Boolean(selection?.mask),
                paintMask: Boolean(paintRegion?.mask),
                sourcePixels: sourceWidth * sourceHeight,
                visiblePixels: visibleDocumentWidth * visibleDocumentHeight,
                layers: document.layers.length,
                backgroundLayer: Boolean(activeLayer.background),
                worker: false
              },
              {
                prepare: gradientPrepareEndedAt - gradientPreviewStartedAt,
                raster: gradientRasterEndedAt - gradientPrepareEndedAt,
                upload: endedAt - gradientRasterEndedAt,
                total: endedAt - gradientPreviewStartedAt,
                inputLag: gradientPreviewInputAtRef.current ? endedAt - gradientPreviewInputAtRef.current : 0
              }
            )
            gradientPreviewInputAtRef.current = 0
          }
        }
      }
    }
    for (const copy of repeatCopies) {
      context.save()
      clipCanvasCopy(context, copy)
      if (gradientLineVisible) {
        context.strokeStyle = `rgb(${gradientLineColor.r} ${gradientLineColor.g} ${gradientLineColor.b} / ${gradientLineColor.a / 255})`
        context.fillStyle = context.strokeStyle
        context.lineWidth = 1
        context.setLineDash([])
        const startX = copy.originX + (drag.start.x + 0.5) * view.zoom
        const startY = copy.originY + (drag.start.y + 0.5) * view.zoom
        const endX = copy.originX + (drag.last.x + 0.5) * view.zoom
        const endY = copy.originY + (drag.last.y + 0.5) * view.zoom
        context.beginPath()
        if (gradientType === 'radial') {
          const geometry = resolveRadialGradientGeometry(drag.start, drag.last, gradientGeometryOptionsForDrag(drag))
          const centerX = copy.originX + (geometry.center.x + 0.5) * view.zoom
          const centerY = copy.originY + (geometry.center.y + 0.5) * view.zoom
          context.save()
          context.translate(centerX, centerY)
          context.rotate(((geometry.angle ?? 0) * Math.PI) / 180)
          context.ellipse(0, 0, Math.max(0.5, geometry.radiusX * view.zoom), Math.max(0.5, geometry.radiusY * view.zoom), 0, 0, Math.PI * 2)
          context.restore()
        } else {
          context.moveTo(startX, startY)
          context.lineTo(endX, endY)
        }
        context.stroke()
        if (gradientType === 'radial') {
          const geometry = resolveRadialGradientGeometry(drag.start, drag.last, gradientGeometryOptionsForDrag(drag))
          const centerX = copy.originX + (geometry.center.x + 0.5) * view.zoom
          const centerY = copy.originY + (geometry.center.y + 0.5) * view.zoom
          context.fillRect(centerX - 2, centerY - 2, 5, 5)
        } else {
          context.fillRect(startX - 2, startY - 2, 5, 5)
          context.fillRect(endX - 2, endY - 2, 5, 5)
        }
      }
      context.restore()
    }
  }
}
