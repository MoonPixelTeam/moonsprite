import type { RasterLayer } from '@shared/types-layer'
import type { SpriteDocument } from '@shared/types-document'
import { cachedLayerContentBounds, getLayerContentRevision } from '@/core/document-model'
import { rasterStorageIdentity, readSurfaceRgbaRegion } from '@/core/runtime-raster'
import { recordCanvasStage, sharedAnimationLayerSources, type AnimationLayerSource } from './canvas-composite-cache-surfaces'
import { imageData } from './canvas-composite-cache-pixel-utils'

const rememberAnimationLayerSource = (document: SpriteDocument, identity: object, source: CanvasImageSource, layer: RasterLayer, revision: number, sourceX: number, sourceY: number, sourceWidth: number, sourceHeight: number, maxCacheBytes: number): void => {
    let state = sharedAnimationLayerSources.get(document)
    if (!state) {
      state = { entries: new Map(), bytes: 0 }
      sharedAnimationLayerSources.set(document, state)
    }
    const previous = state.entries.get(identity)
    if (previous) {
      state.bytes -= previous.bytes
      if (previous.source !== source && typeof ImageBitmap !== 'undefined' && previous.source instanceof ImageBitmap) previous.source.close()
    }
    const bytes = sourceWidth * sourceHeight * 4
    if (bytes > maxCacheBytes) return
    state.entries.delete(identity)
    state.entries.set(identity, {
      source,
      revision,
      width: sourceWidth,
      height: sourceHeight,
      bytes,
      sourceX,
      sourceY,
      layerWidth: layer.width,
      layerHeight: layer.height
    })
    state.bytes += bytes
    while (state.entries.size > 1 && state.bytes > maxCacheBytes) {
      const oldestIdentity = state.entries.keys().next().value!
      const oldest = state.entries.get(oldestIdentity)
      if (oldest) {
        state.bytes -= oldest.bytes
        if (typeof ImageBitmap !== 'undefined' && oldest.source instanceof ImageBitmap) oldest.source.close()
      }
      state.entries.delete(oldestIdentity)
    }
  }

export const animationLayerSourceFor = (document: SpriteDocument, layer: RasterLayer, maxCacheBytes: number): AnimationLayerSource | null => {
    if (layer.format !== 'rgba' || layer.width <= 0 || layer.height <= 0) return null
    const identity = rasterStorageIdentity(layer)
    const revision = getLayerContentRevision(layer)
    const state = sharedAnimationLayerSources.get(document)
    const cached = state?.entries.get(identity)
    if (cached && cached.revision === revision && cached.layerWidth === layer.width && cached.layerHeight === layer.height) {
      state!.entries.delete(identity)
      state!.entries.set(identity, cached)
      return cached
    }
    if (cached) {
      state!.entries.delete(identity)
      state!.bytes -= cached.bytes
    }
    try {
      const startedAt = window.__moonSpriteCanvasProbe?.recordOperationStage ? performance.now() : 0
      const contentBounds = cachedLayerContentBounds(document, layer)
      if (contentBounds === null) return null
      const sourceX = contentBounds?.x !== undefined ? contentBounds.x - layer.offsetX : 0
      const sourceY = contentBounds?.y !== undefined ? contentBounds.y - layer.offsetY : 0
      const sourceWidth = contentBounds?.width ?? layer.width
      const sourceHeight = contentBounds?.height ?? layer.height
      const canvas = new OffscreenCanvas(sourceWidth, sourceHeight)
      const sourceContext = canvas.getContext('2d')
      if (!sourceContext) return null
      sourceContext.imageSmoothingEnabled = false
      // Reading `pixels` on a runtime-backed sparse layer materializes the
      // entire canvas. Keep the lazy storage lazy and upload through the
      // region reader instead.
      const pixels = readSurfaceRgbaRegion(layer, sourceX, sourceY, sourceWidth, sourceHeight)
      sourceContext.putImageData(imageData(pixels, sourceWidth, sourceHeight), 0, 0)
      recordCanvasStage('canvas.animation-layer-upload', startedAt, {
        pixels: sourceWidth * sourceHeight,
        sourceX, sourceY, sourceWidth, sourceHeight
      })
      rememberAnimationLayerSource(document, identity, canvas, layer, revision, sourceX, sourceY, sourceWidth, sourceHeight, maxCacheBytes)
      return { source: canvas, revision, width: sourceWidth, height: sourceHeight, bytes: sourceWidth * sourceHeight * 4, sourceX, sourceY, layerWidth: layer.width, layerHeight: layer.height }
    } catch {
      return null
    }
  }

