import type { RgbaColor } from '@shared/types-color'
import { layerMaskDisplayColor, readLayerColorAt, readLayerMaskDisplayColorAt, resolveLayerCanvasColor } from '@/core/document-model'
import {
  createCompositePointReplacementSampler,
  createCompositePointSampler,
  createNormalCompositePointReplacementSampler,
  createNormalCompositePointSampler
} from '@/core/document-composite'
import { blendOver, relativeLuminanceColor, TRANSPARENT } from '@/core/raster'
import { applyInkColor, resolveInkStampColor } from '@/core/ink'
import { activePaintLayer } from '@/store/workspace-session'
import { deviceAlignedPixelRect } from '@/core/canvas-render-plan'
import { transparencyColorAt } from '@/core/canvas-visuals'
import { type RasterContext2D } from '@/components/canvas-selection-renderer'
import { tileRepeatMappedPointForCopies, tileRepeatPreviewPlacements } from '@/core/tilemap'
import { brushOpacityScale } from '@/core/pressure'
import type * as React from 'react'
import type { DocumentSession } from '@/store/workspace-types'

export const canvasPreviewDisplayColor = (color: RgbaColor, relativeLuminance: boolean, onionColor: RgbaColor | null = null): RgbaColor => {
  const foreground = relativeLuminance ? relativeLuminanceColor(color) : color
  return onionColor ? blendOver(onionColor, foreground) : foreground
}

export const brushPreviewCoverage = (coverage: number, brushOpacity: number): number =>
  Math.round(Math.max(0, Math.min(255, coverage)) * brushOpacityScale(1, brushOpacity))

export function createCanvasPreviewPixels({
  currentSession,
  compositePointSamplerRef,
  document,
  compositeReplacementSamplerRef,
  isolatedLayerMask,
  currentActiveLayer,
  previewOriginX,
  previewOriginY,
  view,
  deviceScale,
  repeatCopies,
  checkerboard,
  context
}: {
  currentSession: DocumentSession
  compositePointSamplerRef: React.RefObject<{
    document: import('@shared/types-document').SpriteDocument
    revision: number
    sampler: (x: number, y: number) => import('@shared/types-color').RgbaColor
  } | null>
  document: import('@shared/types-document').SpriteDocument
  compositeReplacementSamplerRef: React.RefObject<{
    document: import('@shared/types-document').SpriteDocument
    revision: number
    layerId: string
    sampler: (x: number, y: number, replacement: import('@shared/types-color').RgbaColor) => import('@shared/types-color').RgbaColor
  } | null>
  isolatedLayerMask: import('@shared/types-layer').LayerMask | null
  currentActiveLayer: import('@shared/types-layer').RasterLayer
  previewOriginX: number
  previewOriginY: number
  view: import('@shared/types-view').ViewState
  deviceScale: import('@/core/canvas-render-plan').CanvasDeviceScale
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
  checkerboard: import('@/core/file-preferences').CheckerboardPreferences
  context: RasterContext2D
}) {
  const activeLayer = activePaintLayer(currentSession)
  const cachedPointSampler = compositePointSamplerRef.current
  const compositePointSampler =
    cachedPointSampler && cachedPointSampler.document === document && cachedPointSampler.revision === currentSession.contentRevision
      ? cachedPointSampler.sampler
      : (createNormalCompositePointSampler(document) ?? createCompositePointSampler(document))
  if (compositePointSampler !== cachedPointSampler?.sampler)
    compositePointSamplerRef.current = { document, revision: currentSession.contentRevision, sampler: compositePointSampler }
  const cachedReplacementSampler = compositeReplacementSamplerRef.current
  const compositePointReplacementSampler =
    cachedReplacementSampler &&
    cachedReplacementSampler.document === document &&
    cachedReplacementSampler.revision === currentSession.revision &&
    cachedReplacementSampler.layerId === activeLayer.id
      ? cachedReplacementSampler.sampler
      : (createNormalCompositePointReplacementSampler(document, activeLayer.id) ?? createCompositePointReplacementSampler(document, activeLayer.id))
  if (compositePointReplacementSampler !== cachedReplacementSampler?.sampler) {
    compositeReplacementSamplerRef.current = { document, revision: currentSession.revision, layerId: activeLayer.id, sampler: compositePointReplacementSampler }
  }
  const sampleCompositeForPreview = (x: number, y: number): RgbaColor => {
    if (isolatedLayerMask) return readLayerMaskDisplayColorAt(isolatedLayerMask, x, y)
    return compositePointSampler(x, y)
  }
  const previewLayerColorAt = (
    pixelX: number,
    pixelY: number,
    erase = false,
    coverage = 255,
    paintColor = currentSession.primaryColor,
    baseColor?: RgbaColor,
    overwrite = false
  ): RgbaColor => {
    const layerColor = baseColor ?? readLayerColorAt(document, currentActiveLayer, pixelX, pixelY)
    const effectiveCoverage = brushPreviewCoverage(coverage, currentSession.brushOpacity)
    const inkMode = currentSession.tool === 'pencil' || currentSession.tool === 'eraser' || currentSession.tool === 'line' ? currentSession.inkMode : 'simple'
    const stampedColor = resolveInkStampColor(inkMode, paintColor, effectiveCoverage)
    const replacement = erase
      ? effectiveCoverage === 255
        ? TRANSPARENT
        : { ...layerColor, a: Math.round(layerColor.a * (1 - effectiveCoverage / 255)) }
      : inkMode !== 'simple'
        ? (applyInkColor(inkMode, layerColor, stampedColor) ?? layerColor)
        : overwrite
          ? stampedColor
          : effectiveCoverage < 255 || (paintColor.a > 0 && paintColor.a < 255)
            ? blendOver(layerColor, { ...paintColor, a: Math.round((paintColor.a * effectiveCoverage) / 255) })
            : paintColor
    return resolveLayerCanvasColor(document, currentActiveLayer, replacement)
  }
  const previewColorAt = (
    pixelX: number,
    pixelY: number,
    erase = false,
    coverage = 255,
    paintColor = currentSession.primaryColor,
    baseColor?: RgbaColor,
    overwrite = false
  ): RgbaColor => {
    const resolvedReplacement = previewLayerColorAt(pixelX, pixelY, erase, coverage, paintColor, baseColor, overwrite)
    return isolatedLayerMask ? layerMaskDisplayColor(resolvedReplacement) : compositePointReplacementSampler(pixelX, pixelY, resolvedReplacement)
  }
  const previewPixelRect = (pixelX: number, pixelY: number): { x: number; y: number; width: number; height: number } =>
    deviceAlignedPixelRect(previewOriginX, previewOriginY, view.zoom, pixelX, pixelY, deviceScale)
  const previewPixelPlacements = (pixelX: number, pixelY: number) =>
    tileRepeatPreviewPlacements({ x: pixelX, y: pixelY }, document.width, document.height, view.tileRepeatMode ?? 'off', repeatCopies)
  const previewPixelRects = (pixelX: number, pixelY: number): Array<{ x: number; y: number; width: number; height: number }> =>
    previewPixelPlacements(pixelX, pixelY).map(({ point, copy }) =>
      deviceAlignedPixelRect(copy.originX, copy.originY, view.zoom, point.x, point.y, deviceScale)
    )
  const previewPointKey = (pixelX: number, pixelY: number): string | null => {
    const mapped = tileRepeatMappedPointForCopies({ x: pixelX, y: pixelY }, document.width, document.height, view.tileRepeatMode ?? 'off', true)
    return mapped ? `${mapped.local.x}:${mapped.local.y}` : null
  }
  const fillPreviewPixelRect = (
    pixelRect: { x: number; y: number; width: number; height: number },
    sampleX: number,
    sampleY: number,
    color: RgbaColor,
    onionColor: RgbaColor | null = null
  ): void => {
    const transparency = transparencyColorAt(sampleX, sampleY, checkerboard)
    const displayColor = canvasPreviewDisplayColor(color, Boolean(view.relativeLuminance), onionColor)
    const opaque = blendOver(transparency, displayColor)
    context.fillStyle = `rgb(${opaque.r} ${opaque.g} ${opaque.b})`
    context.fillRect(pixelRect.x, pixelRect.y, pixelRect.width, pixelRect.height)
  }
  /**
   * Fill a brush preview as a small set of paths instead of one canvas
   * operation per document pixel. Independent transformed fillRects can
   * expose a one-device-pixel seam between rows at fractional DPR/zoom;
   * sharing a path lets the rasterizer resolve touching edges as one region.
   */
  const fillPreviewPixelRects = (
    entries: ReadonlyArray<{ pixelRect: { x: number; y: number; width: number; height: number }; sampleX: number; sampleY: number; color: RgbaColor }>,
    _preserveOnionSkin = false
  ): void => {
    if (entries.length === 0) return
    if (typeof Path2D === 'undefined') {
      for (const entry of entries) {
        fillPreviewPixelRect(entry.pixelRect, entry.sampleX, entry.sampleY, entry.color)
      }
      return
    }
    const foregrounds = new Map<string, Path2D>()
    const addRect = (paths: Map<string, Path2D>, key: string, pixelRect: { x: number; y: number; width: number; height: number }): void => {
      let path = paths.get(key)
      if (!path) {
        path = new Path2D()
        paths.set(key, path)
      }
      path.rect(pixelRect.x, pixelRect.y, pixelRect.width, pixelRect.height)
    }
    for (const entry of entries) {
      const transparency = transparencyColorAt(entry.sampleX, entry.sampleY, checkerboard)
      const displayColor = canvasPreviewDisplayColor(entry.color, Boolean(view.relativeLuminance))
      const opaque = blendOver(transparency, displayColor)
      addRect(foregrounds, `rgb(${opaque.r} ${opaque.g} ${opaque.b})`, entry.pixelRect)
    }
    for (const [fillStyle, path] of foregrounds) {
      context.fillStyle = fillStyle
      context.fill(path)
    }
  }
  const drawPreviewPixel = (pixelX: number, pixelY: number, color: RgbaColor): Array<{ x: number; y: number; width: number; height: number }> => {
    const placements = previewPixelPlacements(pixelX, pixelY)
    const pixelRects = []
    for (const { point, copy } of placements) {
      const pixelRect = deviceAlignedPixelRect(copy.originX, copy.originY, view.zoom, point.x, point.y, deviceScale)
      fillPreviewPixelRect(pixelRect, point.x, point.y, color)
      pixelRects.push(pixelRect)
    }
    return pixelRects
  }
  return {
    activeLayer,
    compositePointSampler,
    compositePointReplacementSampler,
    sampleCompositeForPreview,
    previewLayerColorAt,
    previewColorAt,
    previewPixelRect,
    previewPixelPlacements,
    previewPixelRects,
    previewPointKey,
    fillPreviewPixelRects,
    drawPreviewPixel
  }
}
