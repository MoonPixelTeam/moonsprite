import type { RasterLayer } from '@shared/types-layer'
import type { SelectionRect } from '@shared/types-selection'
import type { SpriteDocument } from '@shared/types-document'
import type { ViewState } from '@shared/types-view'
import {
  DocumentCompositeCache
} from '@/core/document-composite-cache'
import { rasterContentBounds } from '@/core/document-model'
import { selectionPreviewPixelWriter } from './canvas-selection-preview-pixels'
import {
  selectionTransformPreviewPacked,
  selectionTransformPreviewRasterPacked
} from '@/core/tools-selection-transform-raster'
import { selectionQuadBounds, transformedSelectionBounds } from '@/core/selection'
import { initialDocumentCompositePending } from '@/core/initial-document-composite'
import type { RasterContext2D } from './canvas-selection-renderer'
import {
  intersectRect,
  mergeOverlappingRects,
  pixelAlignedRect,
  selectionQuadForTarget,
  selectionPreviewRasterKey
} from './canvas-composite-cache-geometry'
import {
  type SelectionTransformCompositePreview,
  selectionOptimizedRotationEnabled,
  type SelectionPreviewSurface,
  type ClipboardPreviewSurface,
  type SelectionTransformRasterSurface,
  type DrawCompositeOptions,
  imageData,
  selectionPreviewTransformKey,
  repeatedSelectionTargets,
  shouldCacheFullCompositeSurface,
  surfaceNamespace,
  type DrawCompositeSurface,
  type DrawCompositeRegion
} from './canvas-composite-cache-surfaces'
import { CanvasCompositeBlitter } from './canvas-composite-cache-blitter'
import { CanvasSelectionBackdropCache } from './canvas-selection-backdrop-cache'

// Main canvas and auxiliary preview consume the same immutable capture. Keep
// only its latest transform, and let capture lifetime release the raster.
const sharedTransformRasters = new WeakMap<SelectionTransformRasterSurface['source'], SelectionTransformRasterSurface>()

/** Owns clipboard, transformed selection and packed raster preview resources. */
export class CanvasSelectionPreviewRenderer {
  private selectionPreview: SelectionPreviewSurface | null = null
  private clipboardPreview: ClipboardPreviewSurface | null = null
  private selectionTransformRaster: SelectionTransformRasterSurface | null = null
  constructor(
    private readonly compositeCache: DocumentCompositeCache,
    private readonly maxCacheBytes: number,
    private readonly blitter: CanvasCompositeBlitter,
    private readonly drawSurface: DrawCompositeSurface,
    private readonly drawRegion: DrawCompositeRegion
  ) {}
  clearClipboard(): void { this.clipboardPreview = null }
  clearSelection(): void { this.selectionPreview = null }
  clear(): void { this.clearClipboard(); this.clearSelection(); this.selectionTransformRaster = null }
  private selectionTransformRasterFor(document: SpriteDocument, contentRevision: number, selection: SelectionTransformCompositePreview, activeLayer: RasterLayer): SelectionTransformRasterSurface {
    const key = `${document.id}:${document.animation?.activeFrameId ?? 'static'}:${contentRevision}:${selection.layerId}:${selectionPreviewRasterKey(selection, activeLayer.format)}`
    const cached = this.selectionTransformRaster
    if (cached && cached.source === selection.source && cached.key === key) return cached
    const shared = sharedTransformRasters.get(selection.source)
    if (shared?.key === key) {
      this.selectionTransformRaster = shared
      return shared
    }
    const raster = selectionTransformPreviewRasterPacked(document, selection.source, selection.target, selection.angle, selection.shear, activeLayer, selection.quad, selectionOptimizedRotationEnabled(selection))
    const next = { source: selection.source, key, ...raster }
    this.selectionTransformRaster = next
    sharedTransformRasters.set(selection.source, next)
    return next
  }

  drawClipboardPreview(
    context: RasterContext2D,
    document: SpriteDocument,
    view: ViewState,
    originX: number,
    originY: number,
    canvasWidth: number,
    canvasHeight: number,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    frameKey: string,
    frameId: string,
    contentRevision: number,
    contentInvalidation: DrawCompositeOptions['contentInvalidation'],
    imageSmoothingEnabled: boolean,
    selection: SelectionTransformCompositePreview
  ): boolean {
    const source = selection.source
    const target = selection.target
    if (source.origin !== 'clipboard' || !selection.copy) return false

    const layers = this.compositeCache.renderLayersFor(document, contentRevision)
    if (!layers) return false
    const layerIndex = layers.findIndex((layer) => layer.id === selection.layerId)
    if (layerIndex < 0 || layerIndex !== layers.length - 1) return false
    const activeLayer = this.compositeCache.sourceLayerFor(layers[layerIndex])
    if (activeLayer.kind === 'text' || activeLayer.format !== 'rgba' || activeLayer.opacity !== 1 || activeLayer.blendMode !== 'normal' || rasterContentBounds(activeLayer, document.palette) !== null) return false

    const directSource = selection.angle % 360 === 0 && !selection.shear && !selection.quad && !target.flipHorizontal && !target.flipVertical && target.width === source.selection.width && target.height === source.selection.height
    const previewKey = directSource ? `direct:${source.selection.width}:${source.selection.height}` : selectionPreviewRasterKey(selection, activeLayer.format)
    let preview = this.clipboardPreview
    if (!preview || preview.source !== source || preview.key !== previewKey) {
      let width: number
      let height: number
      let pixels: Uint8ClampedArray
      if (directSource) {
        width = source.selection.width
        height = source.selection.height
        const rgba = new Uint8ClampedArray(source.values.buffer as ArrayBuffer, source.values.byteOffset, source.values.byteLength)
        pixels = rgba
        if (source.selection.mask) {
          pixels = new Uint8ClampedArray(rgba.length)
          const words = new Uint32Array(pixels.buffer)
          for (let index = 0; index < source.selection.mask.length; index += 1) {
            if (source.selection.mask[index] === 1) words[index] = source.values[index]
          }
        }
      } else {
        const raster = this.selectionTransformRasterFor(document, contentRevision, selection, activeLayer)
        width = raster.width
        height = raster.height
        pixels = new Uint8ClampedArray(raster.pixels.buffer as ArrayBuffer, raster.pixels.byteOffset, raster.pixels.byteLength)
      }
      const canvas = new OffscreenCanvas(width, height)
      canvas.getContext('2d')?.putImageData(imageData(pixels, width, height), 0, 0)
      preview = { source, key: previewKey, canvas }
      this.clipboardPreview = preview
    }

    const initialCompositeIsPending = contentRevision === 0 && initialDocumentCompositePending(document, frameId)
    if (shouldCacheFullCompositeSurface(document.width, document.height, this.maxCacheBytes) && !initialCompositeIsPending) {
      this.drawSurface(context, document, view, originX, originY, canvasWidth, canvasHeight, fromX, fromY, toX, toY, frameKey, frameId, contentRevision, contentInvalidation, undefined, imageSmoothingEnabled)
    } else {
      this.drawRegion(context, document, view, originX, originY, fromX, fromY, toX, toY, frameKey, frameId, contentRevision, contentInvalidation, undefined, imageSmoothingEnabled)
    }
    for (const repeatedTarget of repeatedSelectionTargets(selection, document, view)) {
      const repeatedQuad = selectionQuadForTarget(selection, repeatedTarget)
      const drawRect = directSource ? repeatedTarget : pixelAlignedRect(repeatedQuad ? selectionQuadBounds(repeatedQuad) : transformedSelectionBounds(repeatedTarget, selection.angle, selection.shear))
      const destination = this.blitter.alignedDestination(originX + drawRect.x * view.zoom, originY + drawRect.y * view.zoom, drawRect.width * view.zoom, drawRect.height * view.zoom)
      context.drawImage(preview.canvas, 0, 0, preview.canvas.width, preview.canvas.height, destination.left, destination.top, destination.width, destination.height)
    }
    return true
  }

  drawSelectionPreview(
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
    selection: SelectionTransformCompositePreview
  ): boolean {
    const x = Math.max(0, Math.floor(fromX))
    const y = Math.max(0, Math.floor(fromY))
    const right = Math.min(document.width, Math.ceil(toX))
    const bottom = Math.min(document.height, Math.ceil(toY))
    const width = right - x
    const height = bottom - y
    if (width <= 0 || height <= 0) return true
    const layers = this.compositeCache.renderLayersFor(document, contentRevision)
    if (!layers) return false
    const layerIndex = layers.findIndex((layer) => layer.id === selection.layerId)
    if (layerIndex < 0) return false
    const activeLayer = this.compositeCache.sourceLayerFor(layers[layerIndex])
    const key = `${document.id}:${frameId}:${contentRevision}:${selection.layerId}`
    let preview = this.selectionPreview
    const viewportCovered = preview && x >= preview.x && y >= preview.y && right <= preview.x + preview.width && bottom <= preview.y + preview.height
    if (!preview || preview.key !== key || !viewportCovered) {
      const lowerLayers = layers.slice(0, layerIndex)
      const upperLayers = layers.slice(layerIndex + 1)
      const namespace = surfaceNamespace(document, view)
      const frameKey = `${namespace}:${frameId}`
      let baseCanvas: CanvasImageSource
      let baseDocumentX: number
      let baseDocumentY: number
      if (shouldCacheFullCompositeSurface(document.width, document.height, this.maxCacheBytes)) {
        const surface = this.drawSurface(
          context,
          document,
          view,
          originX,
          originY,
          document.width * view.zoom,
          document.height * view.zoom,
          fromX,
          fromY,
          toX,
          toY,
          frameKey,
          frameId,
          contentRevision,
          null,
          undefined,
          false,
          undefined,
          false,
          false,
          false,
          false
        )
        baseCanvas = surface.bitmap ?? surface.canvas
        baseDocumentX = 0
        baseDocumentY = 0
      } else {
        const region = this.drawRegion(context, document, view, originX, originY, fromX, fromY, toX, toY, frameKey, frameId, contentRevision, null, undefined, false, undefined, false, false, false)
        if (!region) return false
        baseCanvas = region.bitmap ?? region.canvas
        baseDocumentX = region.x
        baseDocumentY = region.y
      }
      const canvas = new OffscreenCanvas(width, height)
      const previewContext = canvas.getContext('2d')
      if (!previewContext) return false
      previewContext.imageSmoothingEnabled = false
      previewContext.drawImage(baseCanvas, x - baseDocumentX, y - baseDocumentY, width, height, 0, 0, width, height)
      preview = {
        backdrop: new CanvasSelectionBackdropCache(this.compositeCache),
        key,
        x,
        y,
        width,
        height,
        lowerLayers,
        upperLayers,
        baseCanvas,
        baseDocumentX,
        baseDocumentY,
        canvas,
        lowerBackdrop: new CanvasSelectionBackdropCache(this.compositeCache, undefined, true),
        previousPatchRects: [],
        source: null,
        transformKey: ''
      }
      this.selectionPreview = preview
    }
    const tileRepeatMode = view.tileRepeatMode ?? 'off'
    const transformKey = selectionPreviewTransformKey(selection, tileRepeatMode)
    const previewChanged = preview.source !== selection.source || preview.transformKey !== transformKey
    const selectionTargets = repeatedSelectionTargets(selection, document, view)
    const selectionQuads = selectionTargets.map((target) => selectionQuadForTarget(selection, target))
    const currentBounds = selectionTargets.map((target, index) => pixelAlignedRect(selectionQuads[index] ? selectionQuadBounds(selectionQuads[index]!) : transformedSelectionBounds(target, selection.angle, selection.shear)))
    const sourceSelection = selection.source.selection
    const patchRects = mergeOverlappingRects([...(!selection.copy ? [sourceSelection] : []), ...currentBounds].map(pixelAlignedRect))
    const visibleRect = { x, y, width, height }
    const patchUpdateRect =
      tileRepeatMode === 'off'
        ? visibleRect
        : {
            x: preview.x,
            y: preview.y,
            width: preview.width,
            height: preview.height
          }
    const visiblePatchRects = patchRects.map((rect) => intersectRect(rect, patchUpdateRect)).filter((rect): rect is SelectionRect => Boolean(rect))
    const previewContext = preview.canvas.getContext('2d')
    if (!previewContext) return false
    if (previewChanged) {
      for (const previousRect of preview.previousPatchRects) {
        const localX = previousRect.x - preview.x
        const localY = previousRect.y - preview.y
        previewContext.clearRect(localX, localY, previousRect.width, previousRect.height)
        previewContext.drawImage(preview.baseCanvas, previousRect.x - preview.baseDocumentX, previousRect.y - preview.baseDocumentY, previousRect.width, previousRect.height, localX, localY, previousRect.width, previousRect.height)
      }
      const palette = activeLayer.format === 'indexed' ? new Map(document.palette.map((entry) => [entry.id, entry.color])) : null
      const transformedRaster = this.selectionTransformRasterFor(document, contentRevision, selection, activeLayer)
      for (const patchRect of visiblePatchRects) {
        const patchPixels = preview.backdrop.read(document, activeLayer, preview.lowerLayers, selection.source, selection.copy, patchRect, contentRevision)
        const writePreviewPixel = selectionPreviewPixelWriter(document, activeLayer, preview.lowerLayers, selection, patchRect, contentRevision, patchPixels, palette, preview.lowerBackdrop)
        for (let targetIndex = 0; targetIndex < selectionTargets.length; targetIndex += 1) {
          const transformedRect = currentBounds[targetIndex]
          const overlap = intersectRect(transformedRect, patchRect)
          if (!overlap) continue
          if (transformedRaster.width !== transformedRect.width || transformedRaster.height !== transformedRect.height) {
            const transformed = selectionTransformPreviewPacked(
              document,
              selection.source,
              selectionTargets[targetIndex],
              patchRect.x,
              patchRect.y,
              patchRect.width,
              patchRect.height,
              selection.angle,
              selection.shear,
              activeLayer,
              undefined,
              selectionQuads[targetIndex],
              selectionOptimizedRotationEnabled(selection)
            )
            for (let offset = 0; offset < transformed.length; offset += 1) {
              const outputOffset = offset * 4
              writePreviewPixel(transformed[offset], outputOffset)
            }
            continue
          }
          for (let pixelY = overlap.y; pixelY < overlap.y + overlap.height; pixelY += 1)
            for (let pixelX = overlap.x; pixelX < overlap.x + overlap.width; pixelX += 1) {
              const rasterOffset = (pixelY - transformedRect.y) * transformedRaster.width + pixelX - transformedRect.x
              const packed = transformedRaster.pixels[rasterOffset]
              const outputOffset = ((pixelY - patchRect.y) * patchRect.width + pixelX - patchRect.x) * 4
              writePreviewPixel(packed, outputOffset)
            }
        }
        if (preview.upperLayers.length > 0) this.compositeCache.compositeNormalLayersInto(document, preview.upperLayers, patchRect.x, patchRect.y, patchRect.width, patchRect.height, contentRevision, patchPixels)
        previewContext.putImageData(imageData(patchPixels, patchRect.width, patchRect.height), patchRect.x - preview.x, patchRect.y - preview.y)
      }
      preview.previousPatchRects = visiblePatchRects.map((rect) => ({
        ...rect
      }))
      preview.source = selection.source
      preview.transformKey = transformKey
    }
    const drawRect = intersectRect(
      {
        x: preview.x,
        y: preview.y,
        width: preview.width,
        height: preview.height
      },
      visibleRect
    )
    if (!drawRect) return true
    const destination = this.blitter.alignedDestination(originX + drawRect.x * view.zoom, originY + drawRect.y * view.zoom, drawRect.width * view.zoom, drawRect.height * view.zoom)
    context.drawImage(preview.canvas, drawRect.x - preview.x, drawRect.y - preview.y, drawRect.width, drawRect.height, destination.left, destination.top, destination.width, destination.height)
    return true
  }
}
