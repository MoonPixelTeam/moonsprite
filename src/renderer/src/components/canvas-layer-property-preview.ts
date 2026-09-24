import { normalizeCanvasDeviceScale } from '@/core/canvas-render-plan'
import { LayerPropertyProjectedPreview } from '@/core/layer-property-projected-preview'
import type { DrawCompositeOptions } from './canvas-composite-cache-surfaces'
import { recordCanvasStage } from './canvas-composite-cache-surfaces'
import { visibleDocumentRect } from './canvas-composite-cache-geometry'
import { imageData } from './canvas-composite-cache-pixel-utils'

export class CanvasLayerPropertyPreview {
  private readonly pixels = new LayerPropertyProjectedPreview()
  private canvas: OffscreenCanvas | null = null
  clear(): void { this.pixels.clear(); this.canvas = null }
  draw(options: DrawCompositeOptions): boolean {
    const { document, view, context, contentInvalidation: change, contentRevision = 0, devicePixelRatio = 1 } = options
    const scale = normalizeCanvasDeviceScale(devicePixelRatio)
    if (!change?.propertyPreview || !change.compositeOnly || change.revision !== contentRevision
      || options.isolatedLayerMask || options.liveRasterEdit || options.animationPlayback || options.movingLayerIds?.length || options.selectionPreview
      || view.relativeLuminance || view.rotation !== 0 || view.mirrored || view.mirroredVertical
      || view.zoom * Math.max(scale.x, scale.y) > 0.5) { this.clear(); return false }
    const rect = visibleDocumentRect(document, options.fromX, options.fromY, options.toX, options.toY)
    if (!rect || rect.width * rect.height < 512 * 512) { this.clear(); return false }
    const width = Math.max(1, Math.ceil(rect.width * view.zoom * scale.x))
    const height = Math.max(1, Math.ceil(rect.height * view.zoom * scale.y))
    const started = window.__moonSpriteCanvasProbe?.recordOperationStage ? performance.now() : 0
    const pixels = this.pixels.render(document, rect, width, height, contentRevision, change)
    if (!pixels) return false
    if (!this.canvas || this.canvas.width !== width || this.canvas.height !== height) this.canvas = new OffscreenCanvas(width, height)
    const target = this.canvas.getContext('2d')
    if (!target) { this.clear(); return false }
    target.putImageData(imageData(pixels, width, height), 0, 0)
    context.imageSmoothingEnabled = false
    context.drawImage(this.canvas, 0, 0, width, height,
      options.originX + rect.x * view.zoom, options.originY + rect.y * view.zoom, rect.width * view.zoom, rect.height * view.zoom)
    recordCanvasStage('canvas.property-preview', started, { sourcePixels: rect.width * rect.height, displayPixels: width * height })
    return true
  }
}
