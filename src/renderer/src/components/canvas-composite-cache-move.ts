import type { RasterLayer } from '@shared/types-layer'
import type { SpriteDocument } from '@shared/types-document'
import type { ViewState } from '@shared/types-view'
import {
  DocumentCompositeCache
} from '@/core/document-composite-cache'
import { getLayerContentRevision } from '@/core/document-model'
import { applyRelativeLuminance } from '@/core/raster'
import type { RasterContext2D } from './canvas-selection-renderer'
import { type MovePreviewSurface, imageData, repeatedLayers } from './canvas-composite-cache-surfaces'
import { CanvasGpuMovePreview } from './canvas-composite-cache-gpu'
import type { CanvasCompositeBlitter } from './canvas-composite-cache-blitter'

/** Owns both exact and GPU movement previews for one canvas cache. */
export class CanvasMovePreviewRenderer {
  private movePreview: MovePreviewSurface | null = null
  private readonly gpu: CanvasGpuMovePreview
  constructor(private readonly compositeCache: DocumentCompositeCache, private readonly maxCacheBytes: number, private readonly blitter: CanvasCompositeBlitter) {
    this.gpu = new CanvasGpuMovePreview(maxCacheBytes)
  }
  clearRaster(): void { this.movePreview = null }
  clear(): void { this.clearRaster(); this.gpu.clear() }
  private drawSurface(context: RasterContext2D, canvas: OffscreenCanvas, view: ViewState, originX: number, originY: number, x: number, y: number, width: number, height: number): void {
    const axisAligned = Math.abs(view.rotation) < 0.000001 && !view.mirrored && !view.mirroredVertical
    if (axisAligned && this.blitter.requiresAlignedPixelBlit(view.zoom) && !context.imageSmoothingEnabled) {
      this.blitter.drawAlignedPixelRegion(context, canvas, originX, originY, view.zoom, 0, 0, x, y, width, height)
      return
    }
    context.drawImage(canvas, 0, 0, width, height,
      originX + x * view.zoom, originY + y * view.zoom, width * view.zoom, height * view.zoom)
  }
  drawMovePreview(
    context: RasterContext2D,
    document: SpriteDocument,
    view: ViewState,
    originX: number,
    originY: number,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    frameId: string,
    contentRevision: number,
    movingLayerIds: readonly string[]
  ): boolean {
    const x = Math.max(0, Math.floor(fromX))
    const y = Math.max(0, Math.floor(fromY))
    const right = Math.min(document.width, Math.ceil(toX))
    const bottom = Math.min(document.height, Math.ceil(toY))
    const width = right - x
    const height = bottom - y
    if (width <= 0 || height <= 0) return true
    const movingIds = new Set(movingLayerIds)
    const layers = this.compositeCache.movePreviewLayersFor(document, contentRevision) ?? this.compositeCache.renderLayersFor(document, contentRevision)
    if (!layers) {
      // A group with its own opacity/blend mode must be isolated before it is
      // applied to the backdrop. The recursive GPU stack preserves that
      // boundary while keeping unsupported group features on the exact path.
      const stack = this.compositeCache.opacityGroupStackFor(document, contentRevision)
      if (!stack || width * height * 8 > this.maxCacheBytes) return false
      const stackKey = `group:${document.id}:${frameId}:${contentRevision}:${x}:${y}:${width}:${height}:${view.tileRepeatMode ?? 'off'}:${movingLayerIds.join(',')}:${this.gpu.gpuStackSignature(stack)}`
      const gpuCanvas = this.gpu.drawGpuStackMovePreview(document, view, x, y, width, height, stackKey, stack, movingLayerIds)
      if (gpuCanvas) {
        this.drawSurface(context, gpuCanvas, view, originX, originY, x, y, width, height)
        return true
      }
      this.gpu.clear()
      return false
    }
    // A simple group stack can still be previewed when one of its top layers
    // uses a blend mode. The old normal-only plan rejected that case and
    // forced every pointer move through a full document recomposition.
    const movingLayers = layers.filter((layer) => movingIds.has(layer.id))
    if (movingLayers.length !== movingIds.size) return false
    const firstMovingIndex = layers.findIndex((layer) => movingIds.has(layer.id))
    let lastMovingIndex = -1
    for (let index = layers.length - 1; index >= 0; index -= 1) {
      if (movingIds.has(layers[index].id)) {
        lastMovingIndex = index
        break
      }
    }
    if (firstMovingIndex < 0 || lastMovingIndex < firstMovingIndex || layers.slice(firstMovingIndex, lastMovingIndex + 1).some((layer) => !movingIds.has(layer.id))) return false
    if (width * height * 8 > this.maxCacheBytes) return false
    // Include each participating layer's source revision. A styled layer is
    // rendered through a proxy, so a flip/paste can change that proxy while
    // the move preview surface still has the same document revision. Without
    // this component, the first move after mirroring reuses the old preview
    // and leaves stale/cropped style pixels behind.
    const previewLayerRevision = (layer: RasterLayer): string => `${layer.id}:${getLayerContentRevision(this.compositeCache.sourceLayerFor(layer))}`
    const key = `${document.id}:${frameId}:${contentRevision}:${x}:${y}:${width}:${height}:${view.tileRepeatMode ?? 'off'}:${movingLayers.map(previewLayerRevision).join(',')}:${layers
      .slice(lastMovingIndex + 1)
      .map(previewLayerRevision)
      .join(',')}`
    let preview = this.movePreview
    if (!preview || preview.key !== key) {
      const basePixels = this.compositeCache.movePreviewLayerRegion(document, layers.slice(0, firstMovingIndex), x, y, width, height, contentRevision)
      preview = {
        key,
        x,
        y,
        width,
        height,
        basePixels,
        outputPixels: new Uint8ClampedArray(basePixels.length),
        movingLayers,
        upperLayers: layers.slice(lastMovingIndex + 1),
        canvas: new OffscreenCanvas(width, height)
      }
      this.movePreview = preview
    }
    // Preserve committed blend/alpha semantics at every zoom. Reuse the
    // stationary backdrop and only recompose the moving and upper layers.
    this.gpu.clear()
    preview.outputPixels.set(preview.basePixels)
    this.compositeCache.compositeMovePreviewLayersInto(document, repeatedLayers(preview.movingLayers, document, view), x, y, width, height, contentRevision, preview.outputPixels)
    if (preview.upperLayers.length > 0) this.compositeCache.compositeMovePreviewLayersInto(document, preview.upperLayers, x, y, width, height, contentRevision, preview.outputPixels)
    const displayPixels = view.relativeLuminance ? (preview.luminancePixels ??= new Uint8ClampedArray(preview.outputPixels.length)) : preview.outputPixels
    if (displayPixels !== preview.outputPixels) {
      displayPixels.set(preview.outputPixels)
      applyRelativeLuminance(displayPixels)
    }
    preview.canvas.getContext('2d')?.putImageData(imageData(displayPixels, width, height), 0, 0)
    this.drawSurface(context, preview.canvas, view, originX, originY, x, y, width, height)
    return true
  }
}
