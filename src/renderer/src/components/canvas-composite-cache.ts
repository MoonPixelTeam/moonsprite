import type { LayerMask, RasterLayer } from '@shared/types-layer'
import type { SelectionRect } from '@shared/types-selection'
import type { SpriteDocument } from '@shared/types-document'
import type { ViewState } from '@shared/types-view'
import {
  compositeRegion
} from '@/core/document-composite-region'
import {
  DocumentCompositeCache
} from '@/core/document-composite-cache'
import {
  expandLayerStyleInvalidationRect
} from '@/core/document-composite-plan'
import { getLayerContentRevision, renderLayerMaskRegion } from '@/core/document-model'
import { applyRelativeLuminance } from '@/core/raster'
import { rasterStorageIdentity, readSurfaceRgbaRegion } from '@/core/runtime-raster'
import {
  initialDocumentCompositePending,
  initialDocumentCompositeSurface,
  registerInitialDocumentCompositeSurface
} from '@/core/initial-document-composite'
import { deviceAlignedCanvasRect } from '@/core/canvas-render-plan'
import type { CanvasPreviewInvalidation } from '@/core/canvas-preview-lifecycle'
import type { RasterContext2D } from './canvas-selection-renderer'
import {
  intersectRect,
  unionRect,
  mergeOverlappingRects,
  compositePatchMergeLimit,
  boundedDirtyRects,
  subtractRect,
  visibleDocumentRect
} from './canvas-composite-cache-geometry'
import {
  recordCanvasStage,
  type CompositeSurface,
  type CompositeRegionSurface,
  type SelectionTransformCompositePreview,
  type DrawCompositeOptions,
  invalidationRegion,
  MAX_CACHED_FRAMES,
  DEFAULT_MAX_CACHE_BYTES,
  sharedAnimationLayerSources,
  sharedAnimationCompositeSurface,
  latestSharedAnimationCompositeSurface,
  rememberSharedAnimationComposite,
  releaseSharedAnimationResources,
  shouldCacheFullCompositeSurface,
  surfaceNamespace
} from './canvas-composite-cache-surfaces'
import { imageData, gpuBlendModeFor } from './canvas-composite-cache-pixel-utils'
import { rememberCompositeSurface } from './canvas-composite-cache-utils'
import { CanvasCompositeBlitter } from './canvas-composite-cache-blitter'
import { CanvasMovePreviewRenderer } from './canvas-composite-cache-move'
import { CanvasSelectionPreviewRenderer } from './canvas-composite-cache-selection'

// CanvasStage instances are intentionally short lived when switching tabs or
// changing pane layouts. Keep the derived composite surface with the document
// so remounting a stage does not rebuild and upload a large canvas on its first
// frame. WeakMap ownership lets closed documents be collected normally.
const documentCompositeCaches = new WeakMap<SpriteDocument, CanvasCompositeCache>()

export const canvasCompositeCacheFor = (document: SpriteDocument): CanvasCompositeCache => {
  let cache = documentCompositeCaches.get(document)
  if (!cache) {
    cache = new CanvasCompositeCache()
    documentCompositeCaches.set(document, cache)
  }
  return cache
}

export const releaseCanvasCompositeCache = (document: SpriteDocument): void => {
  documentCompositeCaches.get(document)?.dispose()
  documentCompositeCaches.delete(document)
  releaseSharedAnimationResources(document)
}

export { shouldCacheFullCompositeSurface, type SelectionTransformCompositePreview } from './canvas-composite-cache-surfaces'

/** Coordinates invalidation, surface lifetime and drawing; previews own their resources. */
export class CanvasCompositeCache {
  private readonly blitter = new CanvasCompositeBlitter()
  private readonly moveRenderer: CanvasMovePreviewRenderer
  private readonly selectionRenderer: CanvasSelectionPreviewRenderer
  constructor(private readonly maxCacheBytes = DEFAULT_MAX_CACHE_BYTES) {
    this.moveRenderer = new CanvasMovePreviewRenderer(this.compositeCache, maxCacheBytes)
    this.selectionRenderer = new CanvasSelectionPreviewRenderer(this.compositeCache, maxCacheBytes, this.blitter,
      (...args) => this.drawSurface(...args), (...args) => this.drawRegion(...args))
  }
  private namespace = ''

  private lastDrawnFrameId = 'static'

  private lastDocument: SpriteDocument | null = null

  private invalidatedInitialDocuments = new WeakSet<SpriteDocument>()

  private surfaces = new Map<string, CompositeSurface>()

  private regions = new Map<string, CompositeRegionSurface>()

  private dirtyRects = new Map<string, SelectionRect[]>()

/** Raw source regions changed during a live gesture, before style expansion. */
  private placementDirtyHints = new Map<string, { rect: SelectionRect; layerIds?: readonly string[] }>()

  private sourceDirtyHints = new Map<string, { rect: SelectionRect; used: boolean }>()

/** A live stroke may already have been painted into the cached surface. */
  private livePreviewPending = new Set<string>()

  private livePreviewCommitRevisions = new Map<string, number>()

  private fullPreviewInvalidationPending = false

// Several brush segments can invalidate the same source caches before the
  // next RAF. Coalesce those resets so a long eraser drag pays the rebuild
  // cost once per frame instead of once per dirty rectangle.
  private liveSourceCachesInvalidated = false

  private liveSurfaceInvalidationPending = false

  private liveRasterEdit = false

  private lastConsumedFullContentRevision = -1

  private compositeCache = new DocumentCompositeCache()

  dispose(): void {
    for (const surface of [...this.surfaces.values(), ...this.regions.values()]) {
      surface.canvas.width = 1
      surface.canvas.height = 1
    }
    this.invalidateSurface()
    this.lastDocument = null
    this.namespace = ''
    this.invalidatedInitialDocuments = new WeakSet<SpriteDocument>()
  }

  supportsSelectionPreview(document: SpriteDocument, contentRevision: number, layerId: string): boolean {
    return Boolean(this.compositeCache.renderLayersFor(document, contentRevision)?.some((layer) => layer.id === layerId))
  }

  invalidateSurface(): void {
    for (const surface of [...this.surfaces.values(), ...this.regions.values()]) this.invalidateSurfaceBitmap(surface)
    this.surfaces.clear()
    this.regions.clear()
    this.dirtyRects.clear()
    this.sourceDirtyHints.clear()
    this.placementDirtyHints.clear()
    this.livePreviewPending.clear()
    this.livePreviewCommitRevisions.clear()
    this.compositeCache.invalidateAll()
    this.moveRenderer.clear()
    this.selectionRenderer.clear()
  }

/** Drop derived placement plans while a live move mutates offsets in place. */
  invalidateLayerPlacementCaches(): void {
    this.compositeCache.invalidateLayerPlacementCaches()
  }

  invalidateAll(): void {
    if (this.lastDocument) this.invalidatedInitialDocuments.add(this.lastDocument)
    this.fullPreviewInvalidationPending = true
    this.invalidateSurface()
  }

/** Ends a live stroke that produced no committed content change. */
  clearLivePreview(document: SpriteDocument, frameId = this.lastDrawnFrameId): void {
    this.livePreviewPending.delete(`${document.id}:${frameId}`)
    this.livePreviewCommitRevisions.delete(`${document.id}:${frameId}`)
  }

/** Keeps the already-painted live surface authoritative for the commit draw.
   * The following draw still consumes any queued dirty strips when pointer-up
   * wins the RAF race, but it does not expand the edit into the whole stroke
   * bounding box a second time. */
  retainLivePreview(document: SpriteDocument, frameId: string | undefined, committedRevision: number): void {
    const key = `${document.id}:${frameId ?? this.lastDrawnFrameId}`
    this.livePreviewPending.add(key)
    this.livePreviewCommitRevisions.set(key, committedRevision)
    // Pending dirty strips have not necessarily reached the surface yet.
    // Keep them even when their bounds equal the entire committed stroke.
  }

  invalidateRect(selection: SelectionRect | null | undefined, documentWidth: number, documentHeight: number, frameId = this.lastDrawnFrameId): void {
    if (!selection) return
    const left = Math.max(0, Math.floor(selection.x))
    const top = Math.max(0, Math.floor(selection.y))
    const right = Math.min(documentWidth, Math.ceil(selection.x + selection.width))
    const bottom = Math.min(documentHeight, Math.ceil(selection.y + selection.height))
    if (right <= left || bottom <= top) return
    const dirtyRects = this.dirtyRects.get(frameId) ?? []
    dirtyRects.push({
      x: left,
      y: top,
      width: right - left,
      height: bottom - top
    })
    // Live strokes can emit hundreds of tiny regions. Keep the queue bounded
    // otherwise every subsequent frame spends more time merging old regions.
    this.dirtyRects.set(frameId, dirtyRects.length > 32 ? boundedDirtyRects(dirtyRects, 32, compositePatchMergeLimit(this.lastDocument)) : dirtyRects)
  }

  invalidateDocumentRect(selection: SelectionRect | null | undefined, document: SpriteDocument, frameId = this.lastDrawnFrameId, affectedOwnerIds?: readonly string[]): void {
    if (!selection) return
    this.invalidatedInitialDocuments.add(document)
    if (!this.liveSourceCachesInvalidated) {
      this.compositeCache.invalidateLiveSourceCaches()
      this.liveSourceCachesInvalidated = true
    }
    this.compositeCache.invalidateStyleSources(document, selection, affectedOwnerIds)
    const expanded = expandLayerStyleInvalidationRect(document, selection, affectedOwnerIds)
    // The document has already changed, but the cached surface has not been
    // painted yet. Keep this as a normal dirty region so live strokes remain
    // visible while the pointer is down. `retainLivePreview` is the explicit
    // opt-in used only after a preview surface has actually been painted.
    this.invalidateRect(expanded, document.width, document.height, frameId)
    const previous = this.sourceDirtyHints.get(frameId)
    const next = { ...selection }
    const rect =
      previous && !previous.used
        ? (() => {
            const union = unionRect(previous.rect, next)
            const previousArea = Math.max(1, previous.rect.width * previous.rect.height)
            const nextArea = Math.max(1, next.width * next.height)
            const unionArea = Math.max(1, union.width * union.height)
            // Keep the source hint local when a stroke spans a large area. The
            // dirty-rect list above already records every touched region; a
            // giant hint only makes each composite scan unrelated pixels.
            return unionArea <= (previousArea + nextArea) * 3 ? union : next
          })()
        : next
    this.sourceDirtyHints.set(frameId, { rect, used: false })
    // Live edits keep the content revision stable until pointer-up. Mark the
    // existing surface directly so the next frame consumes the dirty region
    // even though the revision-based invalidation path is not involved yet.
    if (!this.liveSurfaceInvalidationPending) {
      this.liveSurfaceInvalidationPending = true
      for (const surface of [...this.surfaces.values(), ...this.regions.values()]) {
        const pending = [...(surface.pendingDirtyRects ?? []), expanded]
        surface.pendingDirtyRects = pending.length > 32 ? boundedDirtyRects(pending, 32, compositePatchMergeLimit(document)) : pending
      }
    }
  }

/** Redraw translated output without treating the old/new positions as pixel edits.
   * Rectangles already include layer-style extents at the move boundary. */
  invalidateDocumentPlacementRect(rect: SelectionRect, document: SpriteDocument, frameId = this.lastDrawnFrameId, layerIds?: readonly string[]): void {
    this.invalidatedInitialDocuments.add(document)
    this.compositeCache.invalidateLayerPlacementCaches()
    this.compositeCache.invalidateLayerPlacementSources(document, rect, layerIds)
    this.invalidateRect(rect, document.width, document.height, frameId)
    const previous = this.placementDirtyHints.get(frameId)
    this.placementDirtyHints.set(frameId, {
      rect: previous ? unionRect(previous.rect, rect) : { ...rect },
      layerIds: previous ? (previous.layerIds && layerIds ? [...new Set([...previous.layerIds, ...layerIds])] : undefined) : layerIds
    })
    for (const surface of [...this.surfaces.values(), ...this.regions.values()]) {
      const pending = [...(surface.pendingDirtyRects ?? []), rect]
      surface.pendingDirtyRects = pending.length > 32 ? boundedDirtyRects(pending, 32, compositePatchMergeLimit(document)) : pending
    }
  }

  consumePreviewInvalidation(frameId = this.lastDrawnFrameId): CanvasPreviewInvalidation | null {
    const placement = this.placementDirtyHints.get(frameId)
    this.placementDirtyHints.delete(frameId)
    if (this.fullPreviewInvalidationPending) {
      this.fullPreviewInvalidationPending = false
      this.sourceDirtyHints.delete(frameId)
      return { kind: 'full' }
    }
    const hint = this.sourceDirtyHints.get(frameId)
    this.sourceDirtyHints.delete(frameId)
    if (hint)
      return {
        kind: 'region',
        rect: placement ? unionRect(hint.rect, placement.rect) : { ...hint.rect }
      }
    return placement
      ? {
          kind: 'region',
          rect: { ...placement.rect },
          placementOnly: true,
          layerIds: placement.layerIds
        }
      : null
  }

  draw({
    context,
    document,
    view,
    originX,
    originY,
    canvasWidth,
    canvasHeight,
    fromX,
    fromY,
    toX,
    toY,
    revision,
    contentRevision = revision,
    contentInvalidation = null,
    frameId,
    isolatedLayerMask,
    imageSmoothingEnabled = false,
    imageSmoothingQuality = 'high',
    fastViewPreview = false,
    liveRasterEdit = false,
    animationPlayback = false,
    animationConsumerOnly = false,
    devicePixelRatio = 1,
    movingLayerIds,
    selectionPreview
  }: DrawCompositeOptions): void {
    this.liveRasterEdit = liveRasterEdit
    // The previous frame has consumed all live source invalidations. Allow
    // the next pointer batch to invalidate once again.
    this.liveSourceCachesInvalidated = false
    this.liveSurfaceInvalidationPending = false
    this.blitter.currentDevicePixelRatio = devicePixelRatio
    this.lastDocument = document
    // A full content invalidation cannot be repaired by dirty-rect uploads:
    // styled layers may have output outside the edited pixels, and an old
    // surface/bitmap can otherwise remain visible until a later move. Clear
    // every derived surface exactly once for this content revision.
    if (contentInvalidation?.kind === 'full' && contentInvalidation.revision === contentRevision && this.lastConsumedFullContentRevision !== contentRevision) {
      this.lastConsumedFullContentRevision = contentRevision
      this.invalidatedInitialDocuments.add(document)
      this.invalidateSurface()
    }
    const effectiveFrameId = frameId ?? document.animation?.activeFrameId ?? 'static'
    this.lastDrawnFrameId = effectiveFrameId
    const namespace = surfaceNamespace(document, view, isolatedLayerMask)
    if (this.namespace !== namespace) {
      this.namespace = namespace
      // A namespace change invalidates rendered surfaces, but it does not
      // mean the document content changed. Keep the one-time initial
      // composite available for a first draw of a newly loaded document.
      this.invalidateSurface()
    }
    const frameKey = `${namespace}:${effectiveFrameId}`
    // Animation cels are materialized after the document shell can already
    // have produced an initial composite. Never reuse that early snapshot for
    // an animated document: it may be blank even though the active cel has
    // since been loaded, which otherwise makes the canvas recover only after
    // an unrelated visibility toggle.
    if (document.animation && contentRevision === 0) this.invalidatedInitialDocuments.add(document)
    const liveSourceDirtyHint = this.sourceDirtyHints.get(effectiveFrameId)
    const liveSourceDirtyRect = liveSourceDirtyHint?.rect
    // A single draw pass can render several tile-repeat copies. Keep the hint
    // available to every copy; a later edit resets it in invalidateDocumentRect.
    if (liveSourceDirtyHint) liveSourceDirtyHint.used = true
    // The last committed edit remains attached to the session throughout a
    // drag. Its source change has already been consumed before this placement.
    const committedSourceDirtyRect = this.placementDirtyHints.has(effectiveFrameId) ? undefined : invalidationRegion(contentInvalidation)
    const sourceDirtyRect = liveSourceDirtyRect && committedSourceDirtyRect ? unionRect(liveSourceDirtyRect, committedSourceDirtyRect) : (liveSourceDirtyRect ?? committedSourceDirtyRect)

    const boundary = deviceAlignedCanvasRect(originX, originY, canvasWidth, canvasHeight, devicePixelRatio)
    context.save()
    context.beginPath()
    context.rect(boundary.left, boundary.top, boundary.width, boundary.height)
    context.clip()
    context.imageSmoothingEnabled = imageSmoothingEnabled
    if (imageSmoothingEnabled) context.imageSmoothingQuality = imageSmoothingQuality
    if (!isolatedLayerMask && movingLayerIds?.length && this.moveRenderer.drawMovePreview(context, document, view, originX, originY, fromX, fromY, toX, toY, effectiveFrameId, contentRevision, movingLayerIds)) {
      context.restore()
      return
    }
    this.moveRenderer.clearRaster()
    if (
      !isolatedLayerMask &&
      !view.relativeLuminance &&
      selectionPreview &&
      this.selectionRenderer.drawClipboardPreview(context, document, view, originX, originY, canvasWidth, canvasHeight, fromX, fromY, toX, toY, frameKey, effectiveFrameId, contentRevision, contentInvalidation, imageSmoothingEnabled, selectionPreview)
    ) {
      context.restore()
      return
    }
    this.selectionRenderer.clearClipboard()
    if (!isolatedLayerMask && !view.relativeLuminance && selectionPreview && this.selectionRenderer.drawSelectionPreview(context, document, view, originX, originY, fromX, fromY, toX, toY, effectiveFrameId, contentRevision, selectionPreview)) {
      context.restore()
      return
    }
    this.selectionRenderer.clearSelection()
    const initialCompositeIsPending = contentRevision === 0 && !isolatedLayerMask && !view.relativeLuminance && initialDocumentCompositePending(document, effectiveFrameId)
    if (isolatedLayerMask || (shouldCacheFullCompositeSurface(document.width, document.height, this.maxCacheBytes) && !initialCompositeIsPending))
      this.drawSurface(
        context,
        document,
        view,
        originX,
        originY,
        canvasWidth,
        canvasHeight,
        fromX,
        fromY,
        toX,
        toY,
        frameKey,
        effectiveFrameId,
        contentRevision,
        contentInvalidation,
        sourceDirtyRect,
        imageSmoothingEnabled,
        isolatedLayerMask,
        fastViewPreview,
        animationPlayback,
        animationConsumerOnly
      )
    else
      this.drawRegion(
        context,
        document,
        view,
        originX,
        originY,
        fromX,
        fromY,
        toX,
        toY,
        frameKey,
        effectiveFrameId,
        contentRevision,
        contentInvalidation,
        sourceDirtyRect,
        imageSmoothingEnabled,
        isolatedLayerMask,
        fastViewPreview,
        animationPlayback
      )
    context.restore()
  }

/** Build a GPU-backed snapshot once; panning can then sample it without
   * repeatedly uploading a large CPU-backed OffscreenCanvas texture. */
  private scheduleSurfaceBitmap(surface: CompositeSurface): void {
    if (surface.transient || this.liveRasterEdit) return
    if (surface.canvas.width * surface.canvas.height < 256 * 256) return
    if (surface.bitmap || surface.bitmapPending || typeof createImageBitmap !== 'function') return
    const revision = surface.revision
    const generation = surface.bitmapGeneration ?? 0
    surface.bitmapPending = createImageBitmap(surface.canvas)
      .then((bitmap) => {
        if (surface.revision === revision && (surface.bitmapGeneration ?? 0) === generation) surface.bitmap = bitmap
        else bitmap.close()
      })
      .catch(() => {
        // Browsers without enough GPU memory fall back to the OffscreenCanvas.
      })
      .finally(() => {
        surface.bitmapPending = undefined
      })
  }

  private invalidateSurfaceBitmap(surface: CompositeSurface): void {
    surface.bitmap?.close()
    surface.bitmap = undefined
    surface.bitmapGeneration = (surface.bitmapGeneration ?? 0) + 1
    // Invalidating pixels does not cancel createImageBitmap. Keep its promise
    // until it settles so later frames cannot enqueue overlapping full copies.
  }

  private rememberAnimationLayerSource(document: SpriteDocument, identity: object, source: CanvasImageSource, layer: RasterLayer, revision: number): void {
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
    const bytes = layer.width * layer.height * 4
    if (bytes > this.maxCacheBytes) return
    state.entries.delete(identity)
    state.entries.set(identity, {
      source,
      revision,
      width: layer.width,
      height: layer.height,
      bytes
    })
    state.bytes += bytes
    while (state.entries.size > 1 && state.bytes > this.maxCacheBytes) {
      const oldestIdentity = state.entries.keys().next().value!
      const oldest = state.entries.get(oldestIdentity)
      if (oldest) {
        state.bytes -= oldest.bytes
        if (typeof ImageBitmap !== 'undefined' && oldest.source instanceof ImageBitmap) oldest.source.close()
      }
      state.entries.delete(oldestIdentity)
    }
  }

  private animationLayerSourceFor(document: SpriteDocument, layer: RasterLayer): CanvasImageSource | null {
    if (layer.format !== 'rgba' || layer.width <= 0 || layer.height <= 0) return null
    const identity = rasterStorageIdentity(layer)
    const revision = getLayerContentRevision(layer)
    const state = sharedAnimationLayerSources.get(document)
    const cached = state?.entries.get(identity)
    if (cached && cached.revision === revision && cached.width === layer.width && cached.height === layer.height) {
      state!.entries.delete(identity)
      state!.entries.set(identity, cached)
      return cached.source
    }
    if (cached) {
      state!.entries.delete(identity)
      state!.bytes -= cached.bytes
    }
    try {
      const startedAt = window.__moonSpriteCanvasProbe?.recordOperationStage ? performance.now() : 0
      const canvas = new OffscreenCanvas(layer.width, layer.height)
      const sourceContext = canvas.getContext('2d')
      if (!sourceContext) return null
      sourceContext.imageSmoothingEnabled = false
      const expectedBytes = layer.width * layer.height * 4
      const pixels = layer.pixels.length === expectedBytes ? (layer.pixels as Uint8ClampedArray) : readSurfaceRgbaRegion(layer, 0, 0, layer.width, layer.height)
      sourceContext.putImageData(imageData(pixels, layer.width, layer.height), 0, 0)
      recordCanvasStage('canvas.animation-layer-upload', startedAt, {
        pixels: layer.width * layer.height
      })
      this.rememberAnimationLayerSource(document, identity, canvas, layer, revision)
      return canvas
    } catch {
      return null
    }
  }

/**
   * Animation playback is read-only, so supported frame stacks can be blended
   * by Canvas2D after each cel storage has been uploaded once. This removes the
   * O(visible pixels × layers) JavaScript composite from the playback clock.
   */
  private createAnimationCompositeCanvas(document: SpriteDocument, contentRevision: number, x: number, y: number, width: number, height: number): OffscreenCanvas | null {
    const layers = this.compositeCache.renderLayersFor(document, contentRevision)
    if (!layers || layers.some((layer) => layer.format !== 'rgba' || !gpuBlendModeFor(layer.blendMode))) return null
    try {
      const startedAt = window.__moonSpriteCanvasProbe?.recordOperationStage ? performance.now() : 0
      const canvas = new OffscreenCanvas(width, height)
      const target = canvas.getContext('2d')
      if (!target) return null
      target.imageSmoothingEnabled = false
      target.globalCompositeOperation = 'source-over'
      target.globalAlpha = 1
      target.clearRect(0, 0, width, height)
      for (const layer of layers) {
        if (!layer.visible || layer.opacity <= 0) continue
        const operation = gpuBlendModeFor(layer.blendMode)
        const source = this.animationLayerSourceFor(document, layer)
        if (!operation || !source) return null
        target.globalCompositeOperation = operation
        if (target.globalCompositeOperation !== operation) return null
        target.globalAlpha = layer.opacity
        target.drawImage(source, 0, 0, layer.width, layer.height, layer.offsetX - x, layer.offsetY - y, layer.width, layer.height)
      }
      target.globalAlpha = 1
      target.globalCompositeOperation = 'source-over'
      if (target.globalCompositeOperation !== 'source-over') return null
      recordCanvasStage('canvas.animation-gpu-composite', startedAt, {
        pixels: width * height,
        layers: layers.length
      })
      return canvas
    } catch {
      return null
    }
  }

  private drawSurface(
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
    key: string,
    frameId: string,
    contentRevision: number,
    invalidation: DrawCompositeOptions['contentInvalidation'],
    sourceDirtyRect: SelectionRect | undefined,
    imageSmoothingEnabled: boolean,
    isolatedLayerMask?: LayerMask,
    _fastViewPreview = false,
    animationPlayback = false,
    animationConsumerOnly = false,
    render = true
  ): CompositeSurface {
    // Layer styles depend on the current cel surface and cannot use the
    // playback shared/GPU snapshot safely across frame swaps.
    const patchMergeLimit = compositePatchMergeLimit(document)
    const animationFastPath = animationPlayback && patchMergeLimit === undefined
    let surface = this.surfaces.get(key)
    // Playback often starts after the editor already rendered the current
    // frame through the normal path. Publish that surface immediately so the
    // first navigation event cannot trigger a redundant frame composite.
    if (surface && animationFastPath && !isolatedLayerMask && !view.relativeLuminance && !sharedAnimationCompositeSurface(document, frameId, contentRevision)) {
      rememberSharedAnimationComposite(document, frameId, contentRevision, surface.canvas)
    }
    const canApplyInvalidation = surface && surface.revision !== contentRevision && invalidation?.revision === contentRevision && invalidation.fromRevision <= surface.revision
    const liveKey = `${document.id}:${frameId}`
    // A live stroke can enqueue several invalidation rectangles while the
    // document revision is still unchanged. The presence of a live-preview
    // marker alone must not suppress those redraws; only an explicitly
    // retained preview for this committed revision is authoritative.
    const livePreviewAlreadyPainted = !isolatedLayerMask && this.livePreviewPending.has(liveKey) && this.livePreviewCommitRevisions.get(liveKey) === contentRevision
    if (surface && surface.revision !== contentRevision) {
      if (canApplyInvalidation && invalidation?.kind === 'region') {
        if (!livePreviewAlreadyPainted && (isolatedLayerMask || (invalidation.frameId ?? frameId) === frameId) && invalidation.rect) {
          if (isolatedLayerMask) this.invalidateRect(invalidation.rect, document.width, document.height, frameId)
          else this.invalidateDocumentRect(invalidation.rect, document, frameId)
        }
      } else {
        surface.pendingDirtyRects = [{ x: 0, y: 0, width: document.width, height: document.height }]
        this.dirtyRects.delete(frameId)
      }
      surface.revision = contentRevision
    }
    if (!surface || surface.canvas.width !== document.width || surface.canvas.height !== document.height) {
      const initialSurface = !isolatedLayerMask && !view.relativeLuminance && contentRevision === 0 && !this.invalidatedInitialDocuments.has(document) ? initialDocumentCompositeSurface(document, frameId) : null
      const exactSharedAnimationSurface = !initialSurface && animationFastPath && !isolatedLayerMask && !view.relativeLuminance ? sharedAnimationCompositeSurface(document, frameId, contentRevision) : null
      const sharedAnimationSurface = exactSharedAnimationSurface ?? (animationConsumerOnly ? latestSharedAnimationCompositeSurface(document, contentRevision) : null)
      const transientFallback = Boolean(!exactSharedAnimationSurface && sharedAnimationSurface)
      const animationSurface =
        !initialSurface && !sharedAnimationSurface && animationFastPath && !animationConsumerOnly && !isolatedLayerMask && !view.relativeLuminance
          ? this.createAnimationCompositeCanvas(document, contentRevision, 0, 0, document.width, document.height)
          : null
      const canvas = initialSurface ?? sharedAnimationSurface ?? animationSurface ?? new OffscreenCanvas(document.width, document.height)
      if (!initialSurface && !sharedAnimationSurface && !animationSurface) {
        const pixels = isolatedLayerMask
          ? renderLayerMaskRegion(isolatedLayerMask, 0, 0, document.width, document.height)
          : compositeRegion(document, 0, 0, document.width, document.height, this.compositeCache, contentRevision, undefined, sourceDirtyRect)
        if (!isolatedLayerMask && view.relativeLuminance) applyRelativeLuminance(pixels)
        canvas.getContext('2d')?.putImageData(imageData(pixels, document.width, document.height), 0, 0)
        if (!isolatedLayerMask && !view.relativeLuminance && contentRevision === 0 && !this.invalidatedInitialDocuments.has(document)) registerInitialDocumentCompositeSurface(document, canvas, frameId)
      }
      if (animationFastPath && !animationConsumerOnly && !isolatedLayerMask && !view.relativeLuminance) rememberSharedAnimationComposite(document, frameId, contentRevision, canvas)
      surface = {
        canvas,
        revision: contentRevision,
        transient: transientFallback
      }
      if (!transientFallback) rememberCompositeSurface(this.surfaces, key, surface, this.maxCacheBytes, MAX_CACHED_FRAMES)
      this.dirtyRects.delete(frameId)
      this.clearLivePreview(document, frameId)
    } else {
      const invalidationStartedAt = window.__moonSpriteCanvasProbe?.recordOperationStage ? performance.now() : 0
      const visibleRect = visibleDocumentRect(document, fromX, fromY, toX, toY)
      const invalidRects = mergeOverlappingRects([...(surface.pendingDirtyRects ?? []), ...(this.dirtyRects.get(frameId) ?? [])], patchMergeLimit)
      const dirtyRects: SelectionRect[] = []
      const pendingDirtyRects: SelectionRect[] = []
      for (const rect of invalidRects) {
        const visibleDirtyRect = visibleRect ? intersectRect(rect, visibleRect) : null
        if (!visibleDirtyRect) {
          pendingDirtyRects.push(rect)
          continue
        }
        dirtyRects.push(visibleDirtyRect)
        pendingDirtyRects.push(...subtractRect(rect, visibleDirtyRect))
      }
      // Complete every visible dirty region before presenting this frame.
      // Splitting a committed fill/undo into 64K-pixel horizontal bands exposed
      // intermediate cache contents as a top-to-bottom wipe. Offscreen areas
      // remain lazy, and unchanged pixels are still excluded from recomposition.
      const activeRects = mergeOverlappingRects(dirtyRects, patchMergeLimit)
      // A visible viewport can split every incoming rect into up to four
      // offscreen pieces. Keep that deferred queue bounded as well; otherwise
      // a long stroke slowly turns each frame into a larger merge/recompose.
      surface.pendingDirtyRects = pendingDirtyRects.length > 0 ? boundedDirtyRects(pendingDirtyRects, 32, patchMergeLimit) : undefined
      if (activeRects.length > 0) this.invalidateSurfaceBitmap(surface)
      recordCanvasStage('canvas.cache-invalidation', invalidationStartedAt, {
        dirtyRects: activeRects.length,
        dirtyPixels: activeRects.reduce((sum, rect) => sum + rect.width * rect.height, 0)
      })
      const surfaceContext = surface.canvas.getContext('2d')
      if (surfaceContext)
        for (const rect of activeRects) {
          const compositeStartedAt = window.__moonSpriteCanvasProbe?.recordOperationStage ? performance.now() : 0
          const pixels = isolatedLayerMask
            ? renderLayerMaskRegion(isolatedLayerMask, rect.x, rect.y, rect.width, rect.height)
            : compositeRegion(document, rect.x, rect.y, rect.width, rect.height, this.compositeCache, contentRevision, rect, sourceDirtyRect)
          if (!isolatedLayerMask && view.relativeLuminance) applyRelativeLuminance(pixels)
          recordCanvasStage('canvas.recompose', compositeStartedAt, {
            pixels: rect.width * rect.height
          })
          const uploadStartedAt = window.__moonSpriteCanvasProbe?.recordOperationStage ? performance.now() : 0
          surfaceContext.putImageData(imageData(pixels, rect.width, rect.height), rect.x, rect.y)
          recordCanvasStage('canvas.pixel-upload', uploadStartedAt, {
            pixels: rect.width * rect.height
          })
        }
      this.dirtyRects.delete(frameId)
      // A live preview may have marked this frame as already painted so the
      // committed edit does not get recomposed twice in the same draw. Once
      // the surface has consumed its dirty rectangles, clear that guard
      // otherwise a later undo/redo invalidation can be skipped and leave the
      // old pixels visible even though the document has been restored.
      this.clearLivePreview(document, frameId)
    }
    // Building an ImageBitmap copies the whole surface to the GPU. During a
    // live brush stroke that copy competes with the small dirty-rect upload on
    // every pointer frame, so defer it until the committed frame is stable.
    if (!livePreviewAlreadyPainted) this.scheduleSurfaceBitmap(surface)
    const visibleWidth = Math.max(0, toX - fromX)
    const visibleHeight = Math.max(0, toY - fromY)
    if (render && visibleWidth > 0 && visibleHeight > 0) {
      // Cached composites must stay one affine blit. Splitting a large view
      // into pixel runs turns pan and zoom into thousands of draw calls.
      context.drawImage(surface.bitmap ?? surface.canvas, fromX, fromY, visibleWidth, visibleHeight,
        originX + fromX * view.zoom, originY + fromY * view.zoom, visibleWidth * view.zoom, visibleHeight * view.zoom)
    }
    return surface
  }

  private drawRegion(
    context: RasterContext2D,
    document: SpriteDocument,
    view: ViewState,
    originX: number,
    originY: number,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    key: string,
    frameId: string,
    contentRevision: number,
    invalidation: DrawCompositeOptions['contentInvalidation'],
    sourceDirtyRect: SelectionRect | undefined,
    imageSmoothingEnabled = false,
    isolatedLayerMask?: LayerMask,
    _fastViewPreview = false,
    animationPlayback = false,
    render = true
  ): CompositeRegionSurface | null {
    const patchMergeLimit = compositePatchMergeLimit(document)
    const animationFastPath = animationPlayback && patchMergeLimit === undefined
    const x = Math.max(0, Math.floor(fromX))
    const y = Math.max(0, Math.floor(fromY))
    const right = Math.min(document.width, Math.ceil(toX))
    const bottom = Math.min(document.height, Math.ceil(toY))
    const width = Math.max(0, right - x)
    const height = Math.max(0, bottom - y)
    if (width === 0 || height === 0) return null
    let region = this.regions.get(key)
    const liveKey = `${document.id}:${frameId}`
    const livePreviewAlreadyPainted = !isolatedLayerMask && this.livePreviewPending.has(liveKey) && this.livePreviewCommitRevisions.get(liveKey) === contentRevision
    const sameGeometry = region && region.x === x && region.y === y && region.width === width && region.height === height
    if (!sameGeometry) {
      const animationSurface = animationFastPath && !isolatedLayerMask && !view.relativeLuminance ? this.createAnimationCompositeCanvas(document, contentRevision, x, y, width, height) : null
      const canvas = animationSurface ?? new OffscreenCanvas(width, height)
      if (!animationSurface) {
        const pixels = isolatedLayerMask ? renderLayerMaskRegion(isolatedLayerMask, x, y, width, height) : compositeRegion(document, x, y, width, height, this.compositeCache, contentRevision, undefined, sourceDirtyRect)
        if (!isolatedLayerMask && view.relativeLuminance) applyRelativeLuminance(pixels)
        canvas.getContext('2d')?.putImageData(imageData(pixels, width, height), 0, 0)
      }
      region = { canvas, revision: contentRevision, x, y, width, height }
      rememberCompositeSurface(this.regions, key, region, this.maxCacheBytes, MAX_CACHED_FRAMES)
      this.dirtyRects.delete(frameId)
      this.clearLivePreview(document, frameId)
    } else if (region) {
      const invalidationStartedAt = window.__moonSpriteCanvasProbe?.recordOperationStage ? performance.now() : 0
      const invalidationRect = invalidation?.kind === 'region' ? invalidation.rect : undefined
      const canApplyInvalidation =
        region.revision !== contentRevision &&
        invalidation?.revision === contentRevision &&
        invalidation.fromRevision === region.revision &&
        invalidation.kind === 'region' &&
        Boolean(invalidationRect) &&
        (isolatedLayerMask || (invalidation.frameId ?? frameId) === frameId)
      if (region.revision !== contentRevision) {
        if (canApplyInvalidation && invalidationRect) {
          if (!livePreviewAlreadyPainted) {
            const pending = this.dirtyRects.get(frameId) ?? []
            pending.push(isolatedLayerMask ? invalidationRect : expandLayerStyleInvalidationRect(document, invalidationRect))
            this.dirtyRects.set(frameId, pending.length > 32 ? boundedDirtyRects(pending, 32, patchMergeLimit) : pending)
          }
        } else {
          this.dirtyRects.set(frameId, [{ x, y, width, height }])
        }
        region.revision = contentRevision
      }
      const visibleRect = { x, y, width, height }
      const dirtyRects = mergeOverlappingRects(this.dirtyRects.get(frameId) ?? [], patchMergeLimit)
        .map((rect) => intersectRect(rect, visibleRect))
        .filter((rect): rect is SelectionRect => Boolean(rect))
      const activeRects = dirtyRects
      if (activeRects.length > 0) this.invalidateSurfaceBitmap(region)
      recordCanvasStage('canvas.cache-invalidation', invalidationStartedAt, {
        dirtyRects: activeRects.length,
        dirtyPixels: activeRects.reduce((sum, rect) => sum + rect.width * rect.height, 0)
      })
      const regionContext = region.canvas.getContext('2d')
      if (regionContext)
        for (const rect of activeRects) {
          const compositeStartedAt = window.__moonSpriteCanvasProbe?.recordOperationStage ? performance.now() : 0
          const pixels = isolatedLayerMask
            ? renderLayerMaskRegion(isolatedLayerMask, rect.x, rect.y, rect.width, rect.height)
            : compositeRegion(document, rect.x, rect.y, rect.width, rect.height, this.compositeCache, contentRevision, rect, sourceDirtyRect)
          if (!isolatedLayerMask && view.relativeLuminance) applyRelativeLuminance(pixels)
          recordCanvasStage('canvas.recompose', compositeStartedAt, {
            pixels: rect.width * rect.height
          })
          const uploadStartedAt = window.__moonSpriteCanvasProbe?.recordOperationStage ? performance.now() : 0
          regionContext.putImageData(imageData(pixels, rect.width, rect.height), rect.x - x, rect.y - y)
          recordCanvasStage('canvas.pixel-upload', uploadStartedAt, {
            pixels: rect.width * rect.height
          })
        }
      this.dirtyRects.delete(frameId)
      this.clearLivePreview(document, frameId)
    }
    if (!region) return null
    if (!livePreviewAlreadyPainted) this.scheduleSurfaceBitmap(region)
    if (render) {
      context.drawImage(region.bitmap ?? region.canvas, 0, 0, width, height,
        originX + x * view.zoom, originY + y * view.zoom, width * view.zoom, height * view.zoom)
    }
    return region
  }

}
