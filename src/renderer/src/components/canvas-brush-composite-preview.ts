import type { RgbaColor } from '@shared/types-color'
import { readLayerColorAt, resolveLayerCanvasColor } from '@/core/document-model'
import { applyInkColor, resolveInkStampColor } from '@/core/ink'
import { blendOver, TRANSPARENT } from '@/core/raster'
import { brushOpacityScale } from '@/core/pressure'
import type { DocumentSession } from '@/store/workspace-types'
import type { RasterLayer } from '@shared/types-layer'
import type { BrushPreviewCompositeCache } from './canvas-stage-helpers'
import type { CanvasOverlayDamage } from './canvas-overlay-damage'

export function createCompositeBrushPreviewColorAt(
  currentSession: DocumentSession,
  activeLayer: RasterLayer,
  sampler: (x: number, y: number, replacement: RgbaColor) => RgbaColor,
  cacheRef: { current: BrushPreviewCompositeCache | null }
): (x: number, y: number) => RgbaColor {
  const opacity = brushOpacityScale(1, currentSession.brushOpacity)
  const signature = `${currentSession.document.id}:${currentSession.revision}:${activeLayer.id}:${currentSession.primaryColor.r},${currentSession.primaryColor.g},${currentSession.primaryColor.b},${currentSession.primaryColor.a}:${currentSession.brushOpacity}`
  if (!cacheRef.current || cacheRef.current.signature !== signature) cacheRef.current = { signature, colors: new Map() }
  return (x, y) => {
    const cache = cacheRef.current!
    const key = y * currentSession.document.width + x
    const cached = cache.colors.get(key)
    if (cached) return cached
    const destination = readLayerColorAt(currentSession.document, activeLayer, x, y)
    const source = resolveInkStampColor(currentSession.inkMode, currentSession.primaryColor, 255, opacity)
    const replacement = applyInkColor(currentSession.inkMode, destination, source) ?? destination
    const resolvedReplacement = resolveLayerCanvasColor(currentSession.document, activeLayer, replacement)
    const result = sampler(x, y, resolvedReplacement) ?? blendOver(TRANSPARENT, resolvedReplacement)
    cache.colors.set(key, result)
    return result
  }
}

export function drawCompositeBrushPreviewPixels(
  context: CanvasRenderingContext2D,
  rows: ReadonlyArray<{ y: number; left: number; right: number }>,
  renderPlan: { originX: number; originY: number },
  zoom: number,
  deviceScale: { x: number; y: number },
  colorAt: (x: number, y: number) => RgbaColor,
  pixelRect: (originX: number, originY: number, zoom: number, x: number, y: number, deviceScale: { x: number; y: number }) => { x: number; y: number; width: number; height: number },
  damage: CanvasOverlayDamage,
  edgeThickness: number
): void {
  for (const row of rows) for (let x = row.left; x <= row.right; x += 1) {
    const pixel = pixelRect(renderPlan.originX, renderPlan.originY, zoom, x, row.y, deviceScale)
    const color = colorAt(x, row.y)
    context.fillStyle = `rgb(${color.r} ${color.g} ${color.b} / ${color.a / 255})`
    context.fillRect(pixel.x, pixel.y, pixel.width, pixel.height)
    damage.include(pixel, deviceScale, edgeThickness + 2)
  }
}
