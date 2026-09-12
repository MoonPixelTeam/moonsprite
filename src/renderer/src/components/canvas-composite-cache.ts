import type { BlendMode, LayerMask, RasterLayer, SelectionQuad, SelectionRect, SpriteDocument, ViewState } from '@shared/types'
import { compositeRegion, DocumentCompositeCache, expandLayerStyleInvalidationRect, getLayerContentRevision, rasterContentBounds, readLayerPackedAt, renderLayerMaskRegion, type CompositeStackItem } from '@/core/document'
import { applyRelativeLuminance } from '@/core/raster'
import { rasterStorageIdentity, readSurfacePackedRegion, readSurfaceRgbaRegion } from '@/core/runtime-raster'
import { selectionTransformPreviewPacked, selectionTransformPreviewRasterPacked, type SelectionTransformSource } from '@/core/tools'
import { selectionQuadBounds, transformedSelectionBounds } from '@/core/selection'
import { translatedSelectionRect } from '@/core/canvas-input'
import { normalizeSelectionForTileRepeatPreview, tileRepeatDocumentOffsets } from '@/core/tilemap'
import { initialDocumentCompositePending, initialDocumentCompositeSurface, registerInitialDocumentCompositeSurface } from '@/core/initial-document-composite'
import { deviceAlignedCanvasRect, deviceAlignedDocumentRect, deviceAlignedPixelRuns, type CanvasDeviceScaleInput } from '@/core/canvas-render-plan'
import { hasEnabledLayerStyles } from '@/core/layer-styles'
import type { CanvasPreviewInvalidation, CanvasPreviewSelection } from '@/core/canvas-preview-lifecycle'
import type { RasterContext2D } from './canvas-selection-renderer'

const recordCanvasStage = (stage: string, startedAt: number, detail?: Record<string, number | string | boolean>): void => {
  if (typeof window === 'undefined' || !window.__moonSpriteCanvasProbe?.recordOperationStage) return
  window.__moonSpriteCanvasProbe.recordOperationStage(stage, performance.now() - startedAt, detail)
}

interface CompositeSurface {
  canvas: OffscreenCanvas
  /** GPU-friendly snapshot used for view navigation when available. */
  bitmap?: ImageBitmap
  bitmapPending?: Promise<void>
  /** Invalidates asynchronous bitmap captures that started before a write. */
  bitmapGeneration?: number
  revision: number
  pendingDirtyRects?: SelectionRect[]
  transient?: boolean
}

interface CompositeRegionSurface extends CompositeSurface {
  x: number
  y: number
  width: number
  height: number
}

interface AnimationLayerSource {
  source: CanvasImageSource
  revision: number
  width: number
  height: number
  bytes: number
}

interface MovePreviewSurface {
  key: string
  x: number
  y: number
  width: number
  height: number
  basePixels: Uint8ClampedArray
  outputPixels: Uint8ClampedArray
  luminancePixels?: Uint8ClampedArray
  movingLayers: SpriteDocument['layers']
  upperLayers: SpriteDocument['layers']
  canvas: OffscreenCanvas
}

interface GpuMovePreviewSurface {
  key: string
  x: number
  y: number
  width: number
  height: number
  canvas: OffscreenCanvas
  baseCanvas: OffscreenCanvas
  movingLayers: SpriteDocument['layers']
  upperLayers: SpriteDocument['layers']
  groupCanvases: Map<string, OffscreenCanvas>
  /** Cached source-over runs that do not change during the move gesture. */
  layerRunCanvases: Map<string, OffscreenCanvas>
  sources: Map<string, OffscreenCanvas>
}

export type SelectionTransformCompositePreview = CanvasPreviewSelection

const selectionOptimizedRotationEnabled = (selection: SelectionTransformCompositePreview): boolean => (
  selection.optimizedRotation === true
)

interface SelectionPreviewSurface {
  key: string
  x: number
  y: number
  width: number
  height: number
  lowerLayers: SpriteDocument['layers']
  upperLayers: SpriteDocument['layers']
  baseCanvas: CanvasImageSource
  baseDocumentX: number
  baseDocumentY: number
  canvas: OffscreenCanvas
  previousPatchRects: SelectionRect[]
  source: SelectionTransformSource | null
  transformKey: string
}

interface ClipboardPreviewSurface {
  source: SelectionTransformSource
  key: string
  canvas: OffscreenCanvas
}

interface SelectionTransformRasterSurface {
  source: SelectionTransformSource
  key: string
  width: number
  height: number
  pixels: Uint32Array
}

interface DrawCompositeOptions {
  context: RasterContext2D
  document: SpriteDocument
  view: ViewState
  originX: number
  originY: number
  canvasWidth: number
  canvasHeight: number
  fromX: number
  fromY: number
  toX: number
  toY: number
  revision: number
  contentRevision?: number
  contentInvalidation?: {
    kind: 'full' | 'region'
    fromRevision: number
    revision: number
    frameId?: string
    rect?: SelectionRect
  } | null
  frameId?: string
  isolatedLayerMask?: LayerMask
  imageSmoothingEnabled?: boolean
  /** Quality used while resampling the cached bitmap into the viewport. */
  imageSmoothingQuality?: ImageSmoothingQuality
  /** Skip per-pixel alignment work while an interactive view preview is active. */
  fastViewPreview?: boolean
  /** Prefer browser compositing for animation frames that use a supported stack. */
  animationPlayback?: boolean
  /** Reuse the editor's latest frame instead of competing to build one. */
  animationConsumerOnly?: boolean
  /** Effective device pixels per logical canvas unit used by the caller's context. */
  devicePixelRatio?: CanvasDeviceScaleInput
  movingLayerIds?: readonly string[]
  selectionPreview?: SelectionTransformCompositePreview
  /** Schedules another paint when a large invalidation was split across frames. */
  requestRedraw?: () => void
}

const invalidationRegion = (invalidation: DrawCompositeOptions['contentInvalidation']): SelectionRect | undefined =>
  invalidation?.kind === 'region' ? invalidation.rect : undefined

const MAX_SURFACE_DIMENSION = 8192
const MAX_CACHED_FRAMES = 32
const DEFAULT_MAX_CACHE_BYTES = 128 * 1024 * 1024
const CACHE_VERSION = 10
interface SharedAnimationCompositeState {
  entries: Map<string, { canvas: OffscreenCanvas; contentRevision: number; bytes: number }>
  bytes: number
}
const sharedAnimationComposites = new WeakMap<SpriteDocument, SharedAnimationCompositeState>()
interface SharedAnimationLayerSourceState {
  entries: Map<object, AnimationLayerSource>
  bytes: number
}
const sharedAnimationLayerSources = new WeakMap<SpriteDocument, SharedAnimationLayerSourceState>()
const sharedAnimationCompositeSurface = (document: SpriteDocument, frameId: string, contentRevision: number): OffscreenCanvas | null => {
  const state = sharedAnimationComposites.get(document)
  const entry = state?.entries.get(frameId)
  if (!state || !entry || entry.contentRevision !== contentRevision) return null
  state.entries.delete(frameId)
  state.entries.set(frameId, entry)
  return entry.canvas
}
const latestSharedAnimationCompositeSurface = (document: SpriteDocument, contentRevision: number): OffscreenCanvas | null => {
  const entries = sharedAnimationComposites.get(document)?.entries
  if (!entries) return null
  const values = [...entries.values()]
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (values[index].contentRevision === contentRevision) return values[index].canvas
  }
  return null
}
const rememberSharedAnimationComposite = (document: SpriteDocument, frameId: string, contentRevision: number, canvas: OffscreenCanvas): void => {
  let state = sharedAnimationComposites.get(document)
  if (!state) {
    state = { entries: new Map(), bytes: 0 }
    sharedAnimationComposites.set(document, state)
  }
  const previous = state.entries.get(frameId)
  if (previous) state.bytes -= previous.bytes
  const bytes = canvas.width * canvas.height * 4
  state.entries.delete(frameId)
  state.entries.set(frameId, { canvas, contentRevision, bytes })
  state.bytes += bytes
  while (state.entries.size > 1 && (state.entries.size > MAX_CACHED_FRAMES || state.bytes > DEFAULT_MAX_CACHE_BYTES)) {
    const oldestFrameId = state.entries.keys().next().value!
    const oldest = state.entries.get(oldestFrameId)
    if (oldest) state.bytes -= oldest.bytes
    state.entries.delete(oldestFrameId)
  }
}
const imageData = (pixels: Uint8ClampedArray, width: number, height: number): ImageData =>
  new ImageData(pixels as Uint8ClampedArray<ArrayBuffer>, width, height)

const gpuBlendModeFor = (mode: BlendMode): GlobalCompositeOperation | null => {
  if (mode === 'normal') return 'source-over'
  const supported: Partial<Record<BlendMode, GlobalCompositeOperation>> = {
    darken: 'darken',
    multiply: 'multiply',
    'color-burn': 'color-burn',
    lighten: 'lighten',
    screen: 'screen',
    'color-dodge': 'color-dodge',
    overlay: 'overlay',
    'hard-light': 'hard-light',
    'soft-light': 'soft-light',
    difference: 'difference',
    exclusion: 'exclusion',
    hue: 'hue',
    saturation: 'saturation',
    color: 'color',
    luminosity: 'luminosity'
  }
  return supported[mode] ?? null
}


const intersectRect = (left: SelectionRect, right: SelectionRect): SelectionRect | null => {
  const x = Math.max(left.x, right.x)
  const y = Math.max(left.y, right.y)
  const toX = Math.min(left.x + left.width, right.x + right.width)
  const toY = Math.min(left.y + left.height, right.y + right.height)
  return toX > x && toY > y ? { x, y, width: toX - x, height: toY - y } : null
}

const unionRect = (left: SelectionRect, right: SelectionRect): SelectionRect => {
  const x = Math.min(left.x, right.x)
  const y = Math.min(left.y, right.y)
  const toX = Math.max(left.x + left.width, right.x + right.width)
  const toY = Math.max(left.y + left.height, right.y + right.height)
  return { x, y, width: toX - x, height: toY - y }
}

const MAX_LOCAL_PATCH_MERGE_PIXELS = 64 * 1024

const mergeOverlappingRects = (rects: readonly SelectionRect[]): SelectionRect[] => {
  // A long brush stroke produces a chain of slightly overlapping stamps. A
  // plain transitive merge turns that chain into one huge bounding box, which
  // makes a large multi-layer canvas recompose thousands of times more pixels
  // than were actually touched. Keep the rectangles separate when the union
  // has a large amount of untouched area; every rectangle is still processed,
  // so this only changes the work shape, never the painted result.
  const maxUnionWasteRatio = 3
  const merged: SelectionRect[] = []
  for (const source of rects) {
    let candidate = source
    for (let index = merged.length - 1; index >= 0; index -= 1) {
      const previous = merged[index]
      const union = unionRect(candidate, previous)
      const candidateArea = Math.max(1, candidate.width * candidate.height)
      const previousArea = Math.max(1, previous.width * previous.height)
      const unionArea = Math.max(1, union.width * union.height)
      const overlaps = Boolean(intersectRect(candidate, previous))
      // Large solid brushes expose several narrow, disjoint edge strips as a
      // stamp moves. Uploading every strip separately is cheap in JavaScript
      // but creates many GPU texture updates per pointer sample. Batch any
      // fragments whose complete local patch remains small; for larger areas,
      // retain the low-waste overlap rule so diagonal strokes stay sparse.
      if (!overlaps && unionArea > MAX_LOCAL_PATCH_MERGE_PIXELS) continue
      if (unionArea > MAX_LOCAL_PATCH_MERGE_PIXELS && unionArea > (candidateArea + previousArea) * maxUnionWasteRatio) continue
      candidate = union
      merged.splice(index, 1)
      index = merged.length
    }
    merged.push(candidate)
  }
  return merged
}

const subtractRect = (source: SelectionRect, removed: SelectionRect): SelectionRect[] => {
  const overlap = intersectRect(source, removed)
  if (!overlap) return [source]
  const result: SelectionRect[] = []
  const sourceRight = source.x + source.width
  const sourceBottom = source.y + source.height
  const overlapRight = overlap.x + overlap.width
  const overlapBottom = overlap.y + overlap.height
  if (overlap.y > source.y) result.push({ x: source.x, y: source.y, width: source.width, height: overlap.y - source.y })
  if (overlapBottom < sourceBottom) result.push({ x: source.x, y: overlapBottom, width: source.width, height: sourceBottom - overlapBottom })
  if (overlap.x > source.x) result.push({ x: source.x, y: overlap.y, width: overlap.x - source.x, height: overlap.height })
  if (overlapRight < sourceRight) result.push({ x: overlapRight, y: overlap.y, width: sourceRight - overlapRight, height: overlap.height })
  return result
}

const visibleDocumentRect = (document: SpriteDocument, fromX: number, fromY: number, toX: number, toY: number): SelectionRect | null => {
  const x = Math.max(0, Math.floor(fromX))
  const y = Math.max(0, Math.floor(fromY))
  const right = Math.min(document.width, Math.ceil(toX))
  const bottom = Math.min(document.height, Math.ceil(toY))
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null
}

const pixelAlignedRect = (rect: SelectionRect): SelectionRect => {
  const x = Math.floor(rect.x)
  const y = Math.floor(rect.y)
  return {
    x,
    y,
    width: Math.ceil(rect.x + rect.width) - x,
    height: Math.ceil(rect.y + rect.height) - y
  }
}

const selectionQuadKey = (quad?: SelectionQuad): string => quad
  ? [quad.nw.x, quad.nw.y, quad.ne.x, quad.ne.y, quad.se.x, quad.se.y, quad.sw.x, quad.sw.y].join(',')
  : ''

const translatedSelectionQuad = (quad: SelectionQuad | undefined, offsetX: number, offsetY: number): SelectionQuad | undefined => quad
  ? {
      nw: { x: quad.nw.x + offsetX, y: quad.nw.y + offsetY },
      ne: { x: quad.ne.x + offsetX, y: quad.ne.y + offsetY },
      se: { x: quad.se.x + offsetX, y: quad.se.y + offsetY },
      sw: { x: quad.sw.x + offsetX, y: quad.sw.y + offsetY }
    }
  : undefined

const selectionQuadForTarget = (
  selection: SelectionTransformCompositePreview,
  target: SelectionRect
): SelectionQuad | undefined => translatedSelectionQuad(
  selection.quad,
  target.x - selection.target.x,
  target.y - selection.target.y
)

const selectionPreviewRasterKey = (selection: SelectionTransformCompositePreview, layerFormat: RasterLayer['format']): string => {
  const { target, shear } = selection
  return [
    target.x - Math.floor(target.x),
    target.y - Math.floor(target.y),
    target.width,
    target.height,
    target.flipHorizontal ? 1 : 0,
    target.flipVertical ? 1 : 0,
    Number.isFinite(target.flipOriginX) ? target.flipOriginX! - target.x : '',
    Number.isFinite(target.flipOriginY) ? target.flipOriginY! - target.y : '',
    selection.angle,
    shear?.axis ?? '',
    shear?.edge ?? '',
    shear?.amount ?? '',
    selectionQuadKey(selection.quad),
    selectionQuadKey(selection.source.sourceQuad),
    selectionOptimizedRotationEnabled(selection) ? 1 : 0,
    layerFormat
  ].join(':')
}

const compositePreviewPixel = (
  output: Uint8ClampedArray,
  outputOffset: number,
  packed: number,
  layerFormat: RasterLayer['format'],
  layerOpacity: number,
  palette: Map<number, SpriteDocument['palette'][number]['color']> | null
): void => {
  const indexedColor = layerFormat === 'indexed' ? palette?.get(packed) : undefined
  const r = indexedColor?.r ?? (packed & 0xff)
  const g = indexedColor?.g ?? (packed >>> 8 & 0xff)
  const b = indexedColor?.b ?? (packed >>> 16 & 0xff)
  const a = indexedColor?.a ?? (layerFormat === 'rgba' ? packed >>> 24 & 0xff : 0)
  if (a === 0) return
  const bottomAlpha = output[outputOffset + 3]
  if (layerOpacity === 1 && (bottomAlpha === 0 || a === 255)) {
    output[outputOffset] = r
    output[outputOffset + 1] = g
    output[outputOffset + 2] = b
    output[outputOffset + 3] = a
    return
  }
  const topAlpha = a / 255 * layerOpacity
  const baseAlpha = bottomAlpha / 255
  const outputAlpha = topAlpha + baseAlpha * (1 - topAlpha)
  if (outputAlpha <= 0) return
  output[outputOffset] = Math.round((r * topAlpha + output[outputOffset] * baseAlpha * (1 - topAlpha)) / outputAlpha)
  output[outputOffset + 1] = Math.round((g * topAlpha + output[outputOffset + 1] * baseAlpha * (1 - topAlpha)) / outputAlpha)
  output[outputOffset + 2] = Math.round((b * topAlpha + output[outputOffset + 2] * baseAlpha * (1 - topAlpha)) / outputAlpha)
  output[outputOffset + 3] = Math.round(outputAlpha * 255)
}

const selectionPreviewTransformKey = (selection: SelectionTransformCompositePreview, tileRepeatMode: NonNullable<ViewState['tileRepeatMode']>): string => {
  const { target, shear } = selection
  return [
    target.x, target.y, target.width, target.height,
    target.flipHorizontal ? 1 : 0,
    target.flipVertical ? 1 : 0,
    target.flipOriginX ?? '',
    target.flipOriginY ?? '',
    selection.angle,
    shear?.axis ?? '',
    shear?.edge ?? '',
    shear?.amount ?? '',
    selectionQuadKey(selection.quad),
    selectionQuadKey(selection.source.sourceQuad),
    selectionOptimizedRotationEnabled(selection) ? 1 : 0,
    selection.copy ? 1 : 0,
    tileRepeatMode
  ].join(':')
}

const repeatedSelectionTargets = (
  selection: SelectionTransformCompositePreview,
  document: SpriteDocument,
  view: ViewState
): SelectionRect[] => {
  const tileRepeatMode = view.tileRepeatMode ?? 'off'
  const normalizedTarget = tileRepeatMode === 'off'
    ? selection.target
    : normalizeSelectionForTileRepeatPreview(selection.target, document.width, document.height, tileRepeatMode) ?? selection.target
  return tileRepeatDocumentOffsets(document.width, document.height, tileRepeatMode)
    .map((offset) => translatedSelectionRect(normalizedTarget, offset))
}

const repeatedLayers = (
  layers: readonly SpriteDocument['layers'][number][],
  document: SpriteDocument,
  view: ViewState
): SpriteDocument['layers'] => {
  const repeated: SpriteDocument['layers'] = []
  for (const offset of tileRepeatDocumentOffsets(document.width, document.height, view.tileRepeatMode ?? 'off')) {
    for (const layer of layers) {
      repeated.push(offset.x === 0 && offset.y === 0
        ? layer
        : { ...layer, offsetX: layer.offsetX + offset.x, offsetY: layer.offsetY + offset.y })
    }
  }
  return repeated
}

export const shouldCacheFullCompositeSurface = (width: number, height: number, maxCacheBytes = DEFAULT_MAX_CACHE_BYTES): boolean =>
  width > 0 && height > 0 && width <= MAX_SURFACE_DIMENSION && height <= MAX_SURFACE_DIMENSION && width * height * 4 <= maxCacheBytes

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

export class CanvasCompositeCache {
  /**
   * Device-pixel ratio used by the most recent draw.  Cache composition is
   * synchronous; keeping it on the instance lets all preview paths use the
   * same canonical screen rectangle without threading another argument
   * through every private renderer.
   */
  private currentDevicePixelRatio: CanvasDeviceScaleInput = 1
  private namespace = ''
  private lastDrawnFrameId = 'static'
  private lastDocument: SpriteDocument | null = null
  private invalidatedInitialDocuments = new WeakSet<SpriteDocument>()
  private surfaces = new Map<string, CompositeSurface>()
  private regions = new Map<string, CompositeRegionSurface>()
  private dirtyRects = new Map<string, SelectionRect[]>()
  /** Raw source regions changed during a live gesture, before style expansion. */
  private sourceDirtyHints = new Map<string, { rect: SelectionRect; used: boolean }>()
  /** A live stroke may already have been painted into the cached surface. */
  private livePreviewPending = new Set<string>()
  private livePreviewCommitRevisions = new Map<string, number>()
  private fullPreviewInvalidationPending = false
  private lastConsumedFullContentRevision = -1
  private compositeCache = new DocumentCompositeCache()
  private movePreview: MovePreviewSurface | null = null
  /**
   * A browser-composited move preview for the flat stack path.  It is kept
   * separate from the pixel-accurate preview so a failed GPU operation can
   * never expose a partially rendered surface.
   */
  private gpuMovePreview: GpuMovePreviewSurface | null = null
  private selectionPreview: SelectionPreviewSurface | null = null
  private clipboardPreview: ClipboardPreviewSurface | null = null
  private selectionTransformRaster: SelectionTransformRasterSurface | null = null

  constructor(private readonly maxCacheBytes = DEFAULT_MAX_CACHE_BYTES) {}

  supportsSelectionPreview(document: SpriteDocument, contentRevision: number, layerId: string): boolean {
    return Boolean(this.compositeCache.renderLayersFor(document, contentRevision)?.some((layer) => layer.id === layerId))
  }

  invalidateSurface(): void {
    for (const surface of [...this.surfaces.values(), ...this.regions.values()]) surface.bitmap?.close()
    this.surfaces.clear()
    this.regions.clear()
    this.dirtyRects.clear()
    this.sourceDirtyHints.clear()
    this.livePreviewPending.clear()
    this.livePreviewCommitRevisions.clear()
    this.compositeCache.invalidateAll()
    this.movePreview = null
    this.gpuMovePreview = null
    this.selectionPreview = null
    this.clipboardPreview = null
    this.selectionTransformRaster = null
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
    dirtyRects.push({ x: left, y: top, width: right - left, height: bottom - top })
    this.dirtyRects.set(frameId, dirtyRects)
  }

  invalidateDocumentRect(selection: SelectionRect | null | undefined, document: SpriteDocument, frameId = this.lastDrawnFrameId, affectedOwnerIds?: readonly string[]): void {
    if (!selection) return
    this.invalidatedInitialDocuments.add(document)
    this.compositeCache.invalidateLiveSourceCaches()
    this.compositeCache.invalidateStyleSources(document, selection, affectedOwnerIds)
    const expanded = expandLayerStyleInvalidationRect(document, selection, affectedOwnerIds)
    // The document has already changed, but the cached surface has not been
    // painted yet. Keep this as a normal dirty region so live strokes remain
    // visible while the pointer is down. `retainLivePreview` is the explicit
    // opt-in used only after a preview surface has actually been painted.
    this.invalidateRect(expanded, document.width, document.height, frameId)
    const previous = this.sourceDirtyHints.get(frameId)
    const next = { ...selection }
    const rect = previous && !previous.used
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
    for (const surface of [...this.surfaces.values(), ...this.regions.values()]) {
      surface.pendingDirtyRects = [...(surface.pendingDirtyRects ?? []), expanded]
    }
  }

  consumePreviewInvalidation(frameId = this.lastDrawnFrameId): CanvasPreviewInvalidation | null {
    if (this.fullPreviewInvalidationPending) {
      this.fullPreviewInvalidationPending = false
      this.sourceDirtyHints.delete(frameId)
      return { kind: 'full' }
    }
    const hint = this.sourceDirtyHints.get(frameId)
    if (!hint) return null
    this.sourceDirtyHints.delete(frameId)
    return { kind: 'region', rect: { ...hint.rect } }
  }

  draw({ context, document, view, originX, originY, canvasWidth, canvasHeight, fromX, fromY, toX, toY, revision, contentRevision = revision, contentInvalidation = null, frameId, isolatedLayerMask, imageSmoothingEnabled = false, imageSmoothingQuality = 'high', fastViewPreview = false, animationPlayback = false, animationConsumerOnly = false, devicePixelRatio = 1, movingLayerIds, selectionPreview }: DrawCompositeOptions): void {
    this.currentDevicePixelRatio = devicePixelRatio
    this.lastDocument = document
    // A full content invalidation cannot be repaired by dirty-rect uploads:
    // styled layers may have output outside the edited pixels, and an old
    // surface/bitmap can otherwise remain visible until a later move. Clear
    // every derived surface exactly once for this content revision.
    if (contentInvalidation?.kind === 'full'
      && contentInvalidation.revision === contentRevision
      && this.lastConsumedFullContentRevision !== contentRevision) {
      this.lastConsumedFullContentRevision = contentRevision
      this.invalidatedInitialDocuments.add(document)
      this.invalidateSurface()
    }
    const effectiveFrameId = frameId ?? document.animation?.activeFrameId ?? 'static'
    this.lastDrawnFrameId = effectiveFrameId
    const namespace = this.surfaceNamespace(document, view, isolatedLayerMask)
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
    const committedSourceDirtyRect = invalidationRegion(contentInvalidation)
    const sourceDirtyRect = liveSourceDirtyRect && committedSourceDirtyRect
      ? unionRect(liveSourceDirtyRect, committedSourceDirtyRect)
      : liveSourceDirtyRect ?? committedSourceDirtyRect

    const boundary = deviceAlignedCanvasRect(originX, originY, canvasWidth, canvasHeight, devicePixelRatio)
    context.save()
    context.beginPath()
    context.rect(boundary.left, boundary.top, boundary.width, boundary.height)
    context.clip()
    context.imageSmoothingEnabled = imageSmoothingEnabled
    if (imageSmoothingEnabled) context.imageSmoothingQuality = imageSmoothingQuality
    if (!isolatedLayerMask && movingLayerIds?.length && this.drawMovePreview(context, document, view, originX, originY, fromX, fromY, toX, toY, effectiveFrameId, contentRevision, movingLayerIds)) {
      context.restore()
      return
    }
    this.movePreview = null
    if (!isolatedLayerMask && !view.relativeLuminance && selectionPreview && this.drawClipboardPreview(context, document, view, originX, originY, canvasWidth, canvasHeight, fromX, fromY, toX, toY, frameKey, effectiveFrameId, contentRevision, contentInvalidation, imageSmoothingEnabled, selectionPreview)) {
      context.restore()
      return
    }
    this.clipboardPreview = null
    if (!isolatedLayerMask && !view.relativeLuminance && selectionPreview && this.drawSelectionPreview(context, document, view, originX, originY, fromX, fromY, toX, toY, effectiveFrameId, contentRevision, selectionPreview)) {
      context.restore()
      return
    }
    this.selectionPreview = null
    const initialCompositeIsPending = contentRevision === 0 && !isolatedLayerMask && !view.relativeLuminance && initialDocumentCompositePending(document, effectiveFrameId)
    if (isolatedLayerMask || (shouldCacheFullCompositeSurface(document.width, document.height, this.maxCacheBytes) && !initialCompositeIsPending)) this.drawSurface(context, document, view, originX, originY, canvasWidth, canvasHeight, fromX, fromY, toX, toY, frameKey, effectiveFrameId, contentRevision, contentInvalidation, sourceDirtyRect, imageSmoothingEnabled, isolatedLayerMask, fastViewPreview, animationPlayback, animationConsumerOnly)
    else this.drawRegion(context, document, view, originX, originY, fromX, fromY, toX, toY, frameKey, effectiveFrameId, contentRevision, contentInvalidation, sourceDirtyRect, imageSmoothingEnabled, isolatedLayerMask, fastViewPreview, animationPlayback)
    context.restore()
  }

  private alignedDestination(originX: number, originY: number, width: number, height: number): ReturnType<typeof deviceAlignedCanvasRect> {
    return deviceAlignedCanvasRect(originX, originY, width, height, this.currentDevicePixelRatio)
  }

  private alignedDocumentDestination(originX: number, originY: number, zoom: number, x: number, y: number, width: number, height: number): ReturnType<typeof deviceAlignedDocumentRect> {
    return deviceAlignedDocumentRect(originX, originY, zoom, x, y, width, height, this.currentDevicePixelRatio)
  }

  /**
   * Blit a cached raster using the same per-pixel device edges as the live
   * brush preview. A single large drawImage lets the browser distribute a
   * fractional physical scale across source rows/columns, which can move a
   * pixel by one device row when the effective backing ratio is non-integer.
   */
  private drawAlignedPixelRegion(
    context: RasterContext2D,
    source: CanvasImageSource,
    originX: number,
    originY: number,
    zoom: number,
    sourceX: number,
    sourceY: number,
    targetX: number,
    targetY: number,
    width: number,
    height: number
  ): void {
    const dpr = typeof this.currentDevicePixelRatio === 'number'
      ? { x: this.currentDevicePixelRatio, y: this.currentDevicePixelRatio }
      : this.currentDevicePixelRatio
    const columns = deviceAlignedPixelRuns(originX, zoom, targetX, width, dpr.x)
    const rows = deviceAlignedPixelRuns(originY, zoom, targetY, height, dpr.y)
    // Cartesian pixel splitting scales as O(rows × columns). At 400%–800%
    // on a large document this can become tens of thousands of drawImage
    // calls for one frame. The browser's nearest-neighbour sampler already
    // honours the aligned outer edges, so collapse large regions to one blit
    // and reserve the exact run path for small previews where it is cheap.
    if (columns.length * rows.length > 4096) {
      const destination = this.alignedDocumentDestination(originX, originY, zoom, targetX, targetY, width, height)
      context.drawImage(
        source,
        sourceX,
        sourceY,
        width,
        height,
        destination.left,
        destination.top,
        destination.width,
        destination.height
      )
      return
    }
    for (const row of rows) for (const column of columns) {
      context.drawImage(
        source,
        sourceX + column.start - targetX,
        sourceY + row.start - targetY,
        column.count,
        row.count,
        column.left,
        row.left,
        column.right - column.left,
        row.right - row.left
      )
    }
  }

  private requiresAlignedPixelBlit(zoom: number): boolean {
    if (!Number.isFinite(zoom) || zoom <= 0) return false
    const dpr = typeof this.currentDevicePixelRatio === 'number'
      ? { x: this.currentDevicePixelRatio, y: this.currentDevicePixelRatio }
      : this.currentDevicePixelRatio
    // Keep the common small-pixel path cheap. Once a document pixel spans at
    // least four physical pixels, a one-pixel redistribution is visible and
    // the segmented blit preserves the exact preview boundary.
    if (Math.min(zoom * dpr.x, zoom * dpr.y) < 4) return false
    const fractional = (value: number): boolean => Math.abs(value - Math.round(value)) > 0.0000001
    return fractional(zoom * dpr.x) || fractional(zoom * dpr.y)
  }

  private selectionTransformRasterFor(
    document: SpriteDocument,
    contentRevision: number,
    selection: SelectionTransformCompositePreview,
    activeLayer: RasterLayer
  ): SelectionTransformRasterSurface {
    const key = `${document.id}:${contentRevision}:${selection.layerId}:${selectionPreviewRasterKey(selection, activeLayer.format)}`
    const cached = this.selectionTransformRaster
    if (cached && cached.source === selection.source && cached.key === key) return cached
    const raster = selectionTransformPreviewRasterPacked(
      document,
      selection.source,
      selection.target,
      selection.angle,
      selection.shear,
      activeLayer,
      selection.quad,
      selectionOptimizedRotationEnabled(selection)
    )
    const next = { source: selection.source, key, ...raster }
    this.selectionTransformRaster = next
    return next
  }

  private drawClipboardPreview(
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
    if (source.origin !== 'clipboard'
      || !selection.copy) return false

    const layers = this.compositeCache.renderLayersFor(document, contentRevision)
    if (!layers) return false
    const layerIndex = layers.findIndex((layer) => layer.id === selection.layerId)
    if (layerIndex < 0 || layerIndex !== layers.length - 1) return false
    const activeLayer = this.compositeCache.sourceLayerFor(layers[layerIndex])
    if (activeLayer.kind === 'text'
      || activeLayer.format !== 'rgba'
      || activeLayer.opacity !== 1
      || activeLayer.blendMode !== 'normal'
      || rasterContentBounds(activeLayer, document.palette) !== null) return false

    const directSource = selection.angle % 360 === 0
      && !selection.shear
      && !selection.quad
      && !target.flipHorizontal
      && !target.flipVertical
      && target.width === source.selection.width
      && target.height === source.selection.height
    const previewKey = directSource
      ? `direct:${source.selection.width}:${source.selection.height}`
      : selectionPreviewRasterKey(selection, activeLayer.format)
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
      const drawRect = directSource
        ? repeatedTarget
        : pixelAlignedRect(repeatedQuad
          ? selectionQuadBounds(repeatedQuad)
          : transformedSelectionBounds(repeatedTarget, selection.angle, selection.shear))
      const destination = this.alignedDestination(
        originX + drawRect.x * view.zoom,
        originY + drawRect.y * view.zoom,
        drawRect.width * view.zoom,
        drawRect.height * view.zoom
      )
      context.drawImage(
        preview.canvas,
        0,
        0,
        preview.canvas.width,
        preview.canvas.height,
        destination.left,
        destination.top,
        destination.width,
        destination.height
      )
    }
    return true
  }

  /** Upload a layer once so subsequent move frames can use browser compositing. */
  private gpuLayerSourceFor(surface: GpuMovePreviewSurface, document: SpriteDocument, layer: RasterLayer): OffscreenCanvas | null {
    const cached = surface.sources.get(layer.id)
    if (cached) return cached
    if (layer.width <= 0 || layer.height <= 0 || layer.width * layer.height * 4 > this.maxCacheBytes) return null
    try {
      const canvas = new OffscreenCanvas(layer.width, layer.height)
      const sourceContext = canvas.getContext('2d')
      if (!sourceContext) return null
      sourceContext.imageSmoothingEnabled = false
      let pixels: Uint8ClampedArray
      if (layer.format === 'rgba') {
        pixels = readSurfaceRgbaRegion(layer, 0, 0, layer.width, layer.height)
      } else {
        const packed = readSurfacePackedRegion(layer, 0, 0, layer.width, layer.height)
        const palette = new Map(document.palette.map((entry) => [entry.id, entry.color]))
        pixels = new Uint8ClampedArray(layer.width * layer.height * 4)
        for (let index = 0; index < packed.length; index += 1) {
          const color = palette.get(packed[index])
          if (!color) continue
          const offset = index * 4
          pixels[offset] = color.r
          pixels[offset + 1] = color.g
          pixels[offset + 2] = color.b
          pixels[offset + 3] = color.a
        }
      }
      sourceContext.putImageData(imageData(pixels, layer.width, layer.height), 0, 0)
      surface.sources.set(layer.id, canvas)
      return canvas
    } catch {
      return null
    }
  }

  /**
   * Draw a validated flat layer list into an offscreen target. Returning
   * false is deliberately strict: a browser that cannot honour one blend
   * operation must use the complete CPU preview, never a partial frame.
   */
  private drawGpuLayerList(target: OffscreenCanvasRenderingContext2D, surface: GpuMovePreviewSurface, document: SpriteDocument, layers: readonly RasterLayer[], originX: number, originY: number): boolean {
    try {
      for (const layer of layers) {
        const operation = gpuBlendModeFor(layer.blendMode)
        if (!operation || !layer.visible || layer.opacity <= 0) return false
        const source = this.gpuLayerSourceFor(surface, document, layer)
        if (!source) return false
        target.globalCompositeOperation = operation
        if (target.globalCompositeOperation !== operation) return false
        target.globalAlpha = layer.opacity
        target.drawImage(source, 0, 0, layer.width, layer.height, layer.offsetX - originX, layer.offsetY - originY, layer.width, layer.height)
      }
      target.globalAlpha = 1
      target.globalCompositeOperation = 'source-over'
      return target.globalCompositeOperation === 'source-over'
    } catch {
      target.globalAlpha = 1
      target.globalCompositeOperation = 'source-over'
      return false
    }
  }

  private drawGpuMovePreview(
    document: SpriteDocument,
    view: ViewState,
    x: number,
    y: number,
    width: number,
    height: number,
    key: string,
    basePixels: Uint8ClampedArray,
    movingLayers: readonly RasterLayer[],
    upperLayers: readonly RasterLayer[]
  ): OffscreenCanvas | null {
    if (view.relativeLuminance) return null
    let surface = this.gpuMovePreview
    if (!surface || surface.key !== key) {
      try {
        const baseCanvas = new OffscreenCanvas(width, height)
        const baseContext = baseCanvas.getContext('2d')
        const canvas = new OffscreenCanvas(width, height)
        if (!baseContext || !canvas.getContext('2d')) return null
        baseContext.putImageData(imageData(basePixels, width, height), 0, 0)
        surface = { key, x, y, width, height, canvas, baseCanvas, movingLayers: [...movingLayers], upperLayers: [...upperLayers], groupCanvases: new Map(), layerRunCanvases: new Map(), sources: new Map() }
        this.gpuMovePreview = surface
      } catch {
        return null
      }
    }
    const target = surface.canvas.getContext('2d')
    if (!target) return null
    try {
      target.globalCompositeOperation = 'source-over'
      if (target.globalCompositeOperation !== 'source-over') return null
      target.globalAlpha = 1
      target.imageSmoothingEnabled = false
      target.clearRect(0, 0, width, height)
      target.drawImage(surface.baseCanvas, 0, 0, width, height, 0, 0, width, height)
      if (!this.drawGpuLayerList(target, surface, document, repeatedLayers(movingLayers, document, view), x, y)) return null
      if (upperLayers.length > 0) {
        if (upperLayers.every((layer) => layer.blendMode === 'normal')) {
          const upperCanvas = this.gpuStaticLayerRunCanvas(surface, document, upperLayers, x, y)
          if (!upperCanvas) return null
          target.globalCompositeOperation = 'source-over'
          target.globalAlpha = 1
          target.drawImage(upperCanvas, 0, 0, width, height, 0, 0, width, height)
        } else if (!this.drawGpuLayerList(target, surface, document, upperLayers, x, y)) return null
      }
      target.globalAlpha = 1
      target.globalCompositeOperation = 'source-over'
      return target.globalCompositeOperation === 'source-over' ? surface.canvas : null
    } catch {
      target.globalAlpha = 1
      target.globalCompositeOperation = 'source-over'
      return null
    }
  }

  /**
   * A flat move preview does not need an intermediate output canvas. Draw the
   * cached backdrop and the moved layers directly into the already clipped
   * editor target, matching Aseprite's extra-cel render flow.
   */
  private drawGpuMovePreviewDirect(
    context: RasterContext2D,
    document: SpriteDocument,
    view: ViewState,
    originX: number,
    originY: number,
    x: number,
    y: number,
    width: number,
    height: number,
    key: string,
    basePixels: Uint8ClampedArray,
    movingLayers: readonly RasterLayer[],
    upperLayers: readonly RasterLayer[]
  ): boolean {
    if (view.relativeLuminance) return false
    let surface = this.gpuMovePreview
    if (!surface || surface.key !== key) {
      try {
        const baseCanvas = new OffscreenCanvas(width, height)
        const baseContext = baseCanvas.getContext('2d')
        const canvas = new OffscreenCanvas(width, height)
        if (!baseContext || !canvas.getContext('2d')) return false
        baseContext.imageSmoothingEnabled = false
        baseContext.putImageData(imageData(basePixels, width, height), 0, 0)
        surface = { key, x, y, width, height, canvas, baseCanvas, movingLayers: [...movingLayers], upperLayers: [...upperLayers], groupCanvases: new Map(), layerRunCanvases: new Map(), sources: new Map() }
        this.gpuMovePreview = surface
      } catch {
        return false
      }
    }
    try {
      context.save()
      context.imageSmoothingEnabled = false
      context.globalCompositeOperation = 'source-over'
      if (context.globalCompositeOperation !== 'source-over') {
        context.restore()
        return false
      }
      context.globalAlpha = 1
      const destination = this.alignedDestination(originX, originY, width * view.zoom, height * view.zoom)
      context.drawImage(surface.baseCanvas, 0, 0, width, height, destination.left, destination.top, destination.width, destination.height)
      if (!this.drawGpuLayerListOnScreen(context, surface, document, repeatedLayers(movingLayers, document, view), originX, originY, view.zoom)) {
        context.restore()
        return false
      }
      if (upperLayers.length > 0) {
        const upperIsSourceOver = upperLayers.every((layer) => layer.blendMode === 'normal')
        const upperDrawn = upperIsSourceOver
          ? this.drawGpuStaticLayerRunOnScreen(context, surface, document, upperLayers, originX, originY, view.zoom)
          : this.drawGpuLayerListOnScreen(context, surface, document, upperLayers, originX, originY, view.zoom)
        if (!upperDrawn) {
          context.restore()
          return false
        }
      }
      context.globalAlpha = 1
      context.globalCompositeOperation = 'source-over'
      const valid = context.globalCompositeOperation === 'source-over'
      context.restore()
      return valid
    } catch {
      context.restore()
      return false
    }
  }

  private drawGpuLayerListOnScreen(target: RasterContext2D, surface: GpuMovePreviewSurface, document: SpriteDocument, layers: readonly RasterLayer[], originX: number, originY: number, zoom: number): boolean {
    try {
      for (const layer of layers) {
        const operation = gpuBlendModeFor(layer.blendMode)
        if (!operation || !layer.visible || layer.opacity <= 0) return false
        const source = this.gpuLayerSourceFor(surface, document, layer)
        if (!source) return false
        target.globalCompositeOperation = operation
        if (target.globalCompositeOperation !== operation) return false
        target.globalAlpha = layer.opacity
        const destination = this.alignedDestination(
          originX + layer.offsetX * zoom,
          originY + layer.offsetY * zoom,
          layer.width * zoom,
          layer.height * zoom
        )
        target.drawImage(source, 0, 0, layer.width, layer.height, destination.left, destination.top, destination.width, destination.height)
      }
      target.globalAlpha = 1
      target.globalCompositeOperation = 'source-over'
      return target.globalCompositeOperation === 'source-over'
    } catch {
      target.globalAlpha = 1
      target.globalCompositeOperation = 'source-over'
      return false
    }
  }

  /**
   * Cache a contiguous source-over run for the duration of one move gesture.
   * A moved layer never enters this cache, so changing its offset cannot leave
   * stale pixels behind. The enclosing GPU surface key includes the document
   * revision and blend settings, which invalidates the run after a real edit.
   */
  private gpuStaticLayerRunCanvas(
    surface: GpuMovePreviewSurface,
    document: SpriteDocument,
    layers: readonly RasterLayer[],
    originX: number,
    originY: number
  ): OffscreenCanvas | null {
    if (layers.length === 0) return null
    const key = `run:${originX}:${originY}:${layers.map((layer) => `${layer.id}:${layer.opacity}`).join(',')}`
    let canvas = surface.layerRunCanvases.get(key)
    if (canvas) return canvas
    try {
      canvas = new OffscreenCanvas(surface.width, surface.height)
      const context = canvas.getContext('2d')
      if (!context) return null
      context.imageSmoothingEnabled = false
      context.globalCompositeOperation = 'source-over'
      context.globalAlpha = 1
      context.clearRect(0, 0, surface.width, surface.height)
      if (!this.drawGpuLayerList(context, surface, document, layers, originX, originY)) return null
      surface.layerRunCanvases.set(key, canvas)
      return canvas
    } catch {
      return null
    }
  }

  private drawGpuStaticLayerRunOnScreen(
    target: RasterContext2D,
    surface: GpuMovePreviewSurface,
    document: SpriteDocument,
    layers: readonly RasterLayer[],
    originX: number,
    originY: number,
    zoom: number
  ): boolean {
    const canvas = this.gpuStaticLayerRunCanvas(surface, document, layers, originX, originY)
    if (!canvas) return false
    const destination = this.alignedDestination(originX, originY, surface.width * zoom, surface.height * zoom)
    target.globalCompositeOperation = 'source-over'
    target.globalAlpha = 1
    target.drawImage(canvas, 0, 0, surface.width, surface.height, destination.left, destination.top, destination.width, destination.height)
    return true
  }

  private gpuStackContainsLayers(items: readonly CompositeStackItem[], movingLayerIds: readonly string[]): boolean {
    const available = new Set<string>()
    const visit = (entries: readonly CompositeStackItem[]): void => {
      for (const item of entries) {
        if (item.kind === 'layer') available.add(item.layer.id)
        else visit(item.children)
      }
    }
    visit(items)
    return movingLayerIds.every((id) => available.has(id))
  }

  private gpuStackSignature(items: readonly CompositeStackItem[]): string {
    return items.map((item) => item.kind === 'layer'
      ? `l:${item.layer.id}:${item.layer.blendMode}:${item.layer.opacity}`
      : `g:${item.group.id}:${item.group.blendMode}:${item.group.opacity}[${this.gpuStackSignature(item.children)}]`).join(';')
  }

  /** Render groups into isolated textures so their blend mode remains local to the group. */
  private drawGpuStackItems(target: OffscreenCanvasRenderingContext2D, surface: GpuMovePreviewSurface, document: SpriteDocument, items: readonly CompositeStackItem[], originX: number, originY: number, movingLayerIds: ReadonlySet<string>): boolean {
    try {
      const staticRun: RasterLayer[] = []
      const flushStaticRun = (): boolean => {
        if (staticRun.length === 0) return true
        const runCanvas = this.gpuStaticLayerRunCanvas(surface, document, staticRun, originX, originY)
        staticRun.length = 0
        if (!runCanvas) return false
        target.globalCompositeOperation = 'source-over'
        if (target.globalCompositeOperation !== 'source-over') return false
        target.globalAlpha = 1
        target.drawImage(runCanvas, 0, 0, surface.width, surface.height, 0, 0, surface.width, surface.height)
        return true
      }
      for (const item of items) {
        if (item.kind === 'layer') {
          if (item.layer.blendMode === 'normal' && !movingLayerIds.has(item.layer.id)) {
            if (!item.layer.visible || item.layer.opacity <= 0) continue
            staticRun.push(item.layer)
            continue
          }
          if (!flushStaticRun()) return false
          const operation = gpuBlendModeFor(item.layer.blendMode)
          if (!operation || !item.layer.visible || item.layer.opacity <= 0) return false
          const source = this.gpuLayerSourceFor(surface, document, item.layer)
          if (!source) return false
          target.globalCompositeOperation = operation
          if (target.globalCompositeOperation !== operation) return false
          target.globalAlpha = item.layer.opacity
          target.drawImage(source, 0, 0, item.layer.width, item.layer.height, item.layer.offsetX - originX, item.layer.offsetY - originY, item.layer.width, item.layer.height)
          continue
        }
        if (!flushStaticRun()) return false
        if (item.group.opacity <= 0 || !item.group.visible) continue
        if (item.group.blendMode === 'normal' && item.group.opacity === 1) {
          if (!this.drawGpuStackItems(target, surface, document, item.children, originX, originY, movingLayerIds)) return false
          continue
        }
        let groupCanvas = surface.groupCanvases.get(item.group.id)
        if (!groupCanvas || groupCanvas.width !== surface.width || groupCanvas.height !== surface.height) {
          groupCanvas = new OffscreenCanvas(surface.width, surface.height)
          surface.groupCanvases.set(item.group.id, groupCanvas)
        }
        const groupContext = groupCanvas.getContext('2d')
        if (!groupContext) return false
        groupContext.imageSmoothingEnabled = false
        groupContext.globalCompositeOperation = 'source-over'
        if (groupContext.globalCompositeOperation !== 'source-over') return false
        groupContext.globalAlpha = 1
        groupContext.clearRect(0, 0, surface.width, surface.height)
        if (!this.drawGpuStackItems(groupContext, surface, document, item.children, originX, originY, movingLayerIds)) return false
        const operation = gpuBlendModeFor(item.group.blendMode)
        if (!operation) return false
        target.globalCompositeOperation = operation
        if (target.globalCompositeOperation !== operation) return false
        target.globalAlpha = item.group.opacity
        target.drawImage(groupCanvas, 0, 0, surface.width, surface.height, 0, 0, surface.width, surface.height)
      }
      if (!flushStaticRun()) return false
      target.globalAlpha = 1
      target.globalCompositeOperation = 'source-over'
      return target.globalCompositeOperation === 'source-over'
    } catch {
      target.globalAlpha = 1
      target.globalCompositeOperation = 'source-over'
      return false
    }
  }

  private drawGpuStackMovePreview(
    document: SpriteDocument,
    view: ViewState,
    x: number,
    y: number,
    width: number,
    height: number,
    key: string,
    stack: readonly CompositeStackItem[],
    movingLayerIds: readonly string[]
  ): OffscreenCanvas | null {
    if (view.relativeLuminance || !this.gpuStackContainsLayers(stack, movingLayerIds)) return null
    let surface = this.gpuMovePreview
    if (!surface || surface.key !== key) {
      try {
        const canvas = new OffscreenCanvas(width, height)
        if (!canvas.getContext('2d')) return null
        surface = {
          key, x, y, width, height, canvas,
          baseCanvas: new OffscreenCanvas(width, height),
          movingLayers: [], upperLayers: [], groupCanvases: new Map(), layerRunCanvases: new Map(), sources: new Map()
        }
        this.gpuMovePreview = surface
      } catch {
        return null
      }
    }
    const target = surface.canvas.getContext('2d')
    if (!target) return null
    try {
      target.imageSmoothingEnabled = false
      target.globalCompositeOperation = 'source-over'
      if (target.globalCompositeOperation !== 'source-over') return null
      target.globalAlpha = 1
      target.clearRect(0, 0, width, height)
      if (!this.drawGpuStackItems(target, surface, document, stack, x, y, new Set(movingLayerIds))) return null
      target.globalAlpha = 1
      target.globalCompositeOperation = 'source-over'
      return target.globalCompositeOperation === 'source-over' ? surface.canvas : null
    } catch {
      target.globalAlpha = 1
      target.globalCompositeOperation = 'source-over'
      return null
    }
  }

  private drawSelectionPreview(context: RasterContext2D, document: SpriteDocument, view: ViewState, originX: number, originY: number, fromX: number, fromY: number, toX: number, toY: number, frameId: string, contentRevision: number, selection: SelectionTransformCompositePreview): boolean {
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
    const viewportCovered = preview
      && x >= preview.x
      && y >= preview.y
      && right <= preview.x + preview.width
      && bottom <= preview.y + preview.height
    if (!preview || preview.key !== key || !viewportCovered) {
      const lowerLayers = layers.slice(0, layerIndex)
      const upperLayers = layers.slice(layerIndex + 1)
      const namespace = this.surfaceNamespace(document, view)
      const frameKey = `${namespace}:${frameId}`
      let baseCanvas: CanvasImageSource
      let baseDocumentX: number
      let baseDocumentY: number
      if (shouldCacheFullCompositeSurface(document.width, document.height, this.maxCacheBytes)) {
        const surface = this.drawSurface(context, document, view, originX, originY, document.width * view.zoom, document.height * view.zoom, fromX, fromY, toX, toY, frameKey, frameId, contentRevision, null, undefined, false, undefined, false, false, false, false)
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
      previewContext.drawImage(
        baseCanvas,
        x - baseDocumentX,
        y - baseDocumentY,
        width,
        height,
        0,
        0,
        width,
        height
      )
      preview = {
        key, x, y, width, height,
        lowerLayers, upperLayers, baseCanvas, baseDocumentX, baseDocumentY,
        canvas,
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
    const currentBounds = selectionTargets.map((target, index) => pixelAlignedRect(selectionQuads[index]
      ? selectionQuadBounds(selectionQuads[index]!)
      : transformedSelectionBounds(target, selection.angle, selection.shear)))
    const sourceSelection = selection.source.selection
    const patchRects = mergeOverlappingRects([
      ...(!selection.copy ? [sourceSelection] : []),
      ...currentBounds
    ].map(pixelAlignedRect))
    const visibleRect = { x, y, width, height }
    const patchUpdateRect = tileRepeatMode === 'off'
      ? visibleRect
      : { x: preview.x, y: preview.y, width: preview.width, height: preview.height }
    const visiblePatchRects = patchRects
      .map((rect) => intersectRect(rect, patchUpdateRect))
      .filter((rect): rect is SelectionRect => Boolean(rect))
    const previewContext = preview.canvas.getContext('2d')
    if (!previewContext) return false
    if (previewChanged) {
      for (const previousRect of preview.previousPatchRects) {
        const localX = previousRect.x - preview.x
        const localY = previousRect.y - preview.y
        previewContext.clearRect(localX, localY, previousRect.width, previousRect.height)
        previewContext.drawImage(
          preview.baseCanvas,
          previousRect.x - preview.baseDocumentX,
          previousRect.y - preview.baseDocumentY,
          previousRect.width,
          previousRect.height,
          localX,
          localY,
          previousRect.width,
          previousRect.height
        )
      }
      const palette = activeLayer.format === 'indexed' ? new Map(document.palette.map((entry) => [entry.id, entry.color])) : null
      const transformedRaster = this.selectionTransformRasterFor(document, contentRevision, selection, activeLayer)
      for (const patchRect of visiblePatchRects) {
        const patchPixels = new Uint8ClampedArray(this.compositeCache.normalLayerRegion(document, preview.lowerLayers, patchRect.x, patchRect.y, patchRect.width, patchRect.height, contentRevision))
        for (let localY = 0; localY < patchRect.height; localY += 1) for (let localX = 0; localX < patchRect.width; localX += 1) {
          const pixelX = patchRect.x + localX
          const pixelY = patchRect.y + localY
          const selected = !selection.copy
            && pixelX >= sourceSelection.x && pixelY >= sourceSelection.y
            && pixelX < sourceSelection.x + sourceSelection.width && pixelY < sourceSelection.y + sourceSelection.height
            && (!sourceSelection.mask || sourceSelection.mask[(pixelY - sourceSelection.y) * sourceSelection.width + pixelX - sourceSelection.x] === 1)
          const packed = selected ? 0 : readLayerPackedAt(document, activeLayer, pixelX, pixelY) ?? 0
          const outputOffset = (localY * patchRect.width + localX) * 4
          compositePreviewPixel(patchPixels, outputOffset, packed, activeLayer.format, activeLayer.opacity, palette)
        }
        for (let targetIndex = 0; targetIndex < selectionTargets.length; targetIndex += 1) {
          const transformedRect = currentBounds[targetIndex]
          const overlap = intersectRect(transformedRect, patchRect)
          if (!overlap) continue
          if (transformedRaster.width !== transformedRect.width || transformedRaster.height !== transformedRect.height) {
            const transformed = selectionTransformPreviewPacked(document, selection.source, selectionTargets[targetIndex], patchRect.x, patchRect.y, patchRect.width, patchRect.height, selection.angle, selection.shear, activeLayer, undefined, selectionQuads[targetIndex], selectionOptimizedRotationEnabled(selection))
            for (let offset = 0; offset < transformed.length; offset += 1) {
              const outputOffset = offset * 4
              compositePreviewPixel(patchPixels, outputOffset, transformed[offset], activeLayer.format, activeLayer.opacity, palette)
            }
            continue
          }
          for (let pixelY = overlap.y; pixelY < overlap.y + overlap.height; pixelY += 1) for (let pixelX = overlap.x; pixelX < overlap.x + overlap.width; pixelX += 1) {
            const rasterOffset = (pixelY - transformedRect.y) * transformedRaster.width + pixelX - transformedRect.x
            const packed = transformedRaster.pixels[rasterOffset]
            const outputOffset = ((pixelY - patchRect.y) * patchRect.width + pixelX - patchRect.x) * 4
            compositePreviewPixel(patchPixels, outputOffset, packed, activeLayer.format, activeLayer.opacity, palette)
          }
        }
        if (preview.upperLayers.length > 0) this.compositeCache.compositeNormalLayersInto(document, preview.upperLayers, patchRect.x, patchRect.y, patchRect.width, patchRect.height, contentRevision, patchPixels)
        previewContext.putImageData(imageData(patchPixels, patchRect.width, patchRect.height), patchRect.x - preview.x, patchRect.y - preview.y)
      }
      preview.previousPatchRects = visiblePatchRects.map((rect) => ({ ...rect }))
      preview.source = selection.source
      preview.transformKey = transformKey
    }
    const drawRect = intersectRect({ x: preview.x, y: preview.y, width: preview.width, height: preview.height }, visibleRect)
    if (!drawRect) return true
    const destination = this.alignedDestination(
      originX + drawRect.x * view.zoom,
      originY + drawRect.y * view.zoom,
      drawRect.width * view.zoom,
      drawRect.height * view.zoom
    )
    context.drawImage(
      preview.canvas,
      drawRect.x - preview.x,
      drawRect.y - preview.y,
      drawRect.width,
      drawRect.height,
      destination.left,
      destination.top,
      destination.width,
      destination.height
    )
    return true
  }

  private drawMovePreview(context: RasterContext2D, document: SpriteDocument, view: ViewState, originX: number, originY: number, fromX: number, fromY: number, toX: number, toY: number, frameId: string, contentRevision: number, movingLayerIds: readonly string[]): boolean {
    const x = Math.max(0, Math.floor(fromX))
    const y = Math.max(0, Math.floor(fromY))
    const right = Math.min(document.width, Math.ceil(toX))
    const bottom = Math.min(document.height, Math.ceil(toY))
    const width = right - x
    const height = bottom - y
    if (width <= 0 || height <= 0) return true
    const movingIds = new Set(movingLayerIds)
    const layers = this.compositeCache.movePreviewLayersFor(document, contentRevision)
    if (!layers) {
      // A group with its own opacity/blend mode must be isolated before it is
      // applied to the backdrop. The recursive GPU stack preserves that
      // boundary while keeping unsupported group features on the exact path.
      const stack = this.compositeCache.opacityGroupStackFor(document, contentRevision)
      if (!stack || width * height * 8 > this.maxCacheBytes) return false
      const stackKey = `group:${document.id}:${frameId}:${contentRevision}:${x}:${y}:${width}:${height}:${view.tileRepeatMode ?? 'off'}:${movingLayerIds.join(',')}:${this.gpuStackSignature(stack)}`
      const gpuCanvas = this.drawGpuStackMovePreview(document, view, x, y, width, height, stackKey, stack, movingLayerIds)
      if (gpuCanvas) {
        const destination = this.alignedDocumentDestination(originX, originY, view.zoom, x, y, width, height)
        context.drawImage(gpuCanvas, 0, 0, width, height, destination.left, destination.top, destination.width, destination.height)
        return true
      }
      this.gpuMovePreview = null
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
    const previewLayerRevision = (layer: RasterLayer): string => `${layer.id}:${getLayerContentRevision(layer)}`
    const key = `${document.id}:${frameId}:${contentRevision}:${x}:${y}:${width}:${height}:${view.tileRepeatMode ?? 'off'}:${movingLayers.map(previewLayerRevision).join(',')}:${layers.slice(lastMovingIndex + 1).map(previewLayerRevision).join(',')}`
    let preview = this.movePreview
    if (!preview || preview.key !== key) {
      const basePixels = this.compositeCache.movePreviewLayerRegion(document, layers.slice(0, firstMovingIndex), x, y, width, height, contentRevision)
      preview = {
        key, x, y, width, height, basePixels,
        outputPixels: new Uint8ClampedArray(basePixels.length),
        movingLayers,
        upperLayers: layers.slice(lastMovingIndex + 1),
        canvas: new OffscreenCanvas(width, height)
      }
      this.movePreview = preview
    }
    const hasBlendMode = layers.some((layer) => layer.blendMode !== 'normal')
    const gpuKey = `${key}:${layers.map((layer) => `${layer.id}:${layer.blendMode}:${layer.opacity}`).join(',')}`
    if (hasBlendMode && !view.relativeLuminance) {
      if (this.drawGpuMovePreviewDirect(context, document, view, originX, originY, x, y, width, height, gpuKey, preview.basePixels, preview.movingLayers, preview.upperLayers)) return true
      const gpuCanvas = this.drawGpuMovePreview(document, view, x, y, width, height, gpuKey, preview.basePixels, preview.movingLayers, preview.upperLayers)
      if (gpuCanvas) {
        const destination = this.alignedDocumentDestination(originX, originY, view.zoom, x, y, width, height)
        context.drawImage(gpuCanvas, 0, 0, width, height, destination.left, destination.top, destination.width, destination.height)
        return true
      }
      this.gpuMovePreview = null
    } else {
      this.gpuMovePreview = null
    }
    preview.outputPixels.set(preview.basePixels)
    this.compositeCache.compositeMovePreviewLayersInto(document, repeatedLayers(preview.movingLayers, document, view), x, y, width, height, contentRevision, preview.outputPixels)
    if (preview.upperLayers.length > 0) this.compositeCache.compositeMovePreviewLayersInto(document, preview.upperLayers, x, y, width, height, contentRevision, preview.outputPixels)
    const displayPixels = view.relativeLuminance
      ? (preview.luminancePixels ??= new Uint8ClampedArray(preview.outputPixels.length))
      : preview.outputPixels
    if (displayPixels !== preview.outputPixels) {
      displayPixels.set(preview.outputPixels)
      applyRelativeLuminance(displayPixels)
    }
    preview.canvas.getContext('2d')?.putImageData(imageData(displayPixels, width, height), 0, 0)
    const destination = this.alignedDocumentDestination(originX, originY, view.zoom, x, y, width, height)
    context.drawImage(preview.canvas, 0, 0, width, height, destination.left, destination.top, destination.width, destination.height)
    return true
  }

  private surfaceNamespace(document: SpriteDocument, view: Pick<ViewState, 'relativeLuminance'>, isolatedLayerMask?: LayerMask): string {
    return `${CACHE_VERSION}:${document.id}:${isolatedLayerMask ? `mask:${isolatedLayerMask.id}` : view.relativeLuminance ? 'luminance' : 'color'}`
  }

  /** Build a GPU-backed snapshot once; panning can then sample it without
   * repeatedly uploading a large CPU-backed OffscreenCanvas texture. */
  private scheduleSurfaceBitmap(surface: CompositeSurface): void {
    if (surface.transient) return
    if (surface.canvas.width * surface.canvas.height < 256 * 256) return
    if (surface.bitmap || surface.bitmapPending || typeof createImageBitmap !== 'function') return
    const revision = surface.revision
    const generation = surface.bitmapGeneration ?? 0
    surface.bitmapPending = createImageBitmap(surface.canvas).then((bitmap) => {
      if (surface.revision === revision && (surface.bitmapGeneration ?? 0) === generation) surface.bitmap = bitmap
      else bitmap.close()
    }).catch(() => {
      // Browsers without enough GPU memory fall back to the OffscreenCanvas.
    }).finally(() => {
      surface.bitmapPending = undefined
    })
  }

  private invalidateSurfaceBitmap(surface: CompositeSurface): void {
    surface.bitmap?.close()
    surface.bitmap = undefined
    surface.bitmapGeneration = (surface.bitmapGeneration ?? 0) + 1
    surface.bitmapPending = undefined
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
    state.entries.set(identity, { source, revision, width: layer.width, height: layer.height, bytes })
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
      const pixels = layer.pixels.length === expectedBytes
        ? layer.pixels as Uint8ClampedArray
        : readSurfaceRgbaRegion(layer, 0, 0, layer.width, layer.height)
      sourceContext.putImageData(imageData(pixels, layer.width, layer.height), 0, 0)
      recordCanvasStage('canvas.animation-layer-upload', startedAt, { pixels: layer.width * layer.height })
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
      recordCanvasStage('canvas.animation-gpu-composite', startedAt, { pixels: width * height, layers: layers.length })
      return canvas
    } catch {
      return null
    }
  }

  private drawSurface(context: RasterContext2D, document: SpriteDocument, view: ViewState, originX: number, originY: number, canvasWidth: number, canvasHeight: number, fromX: number, fromY: number, toX: number, toY: number, key: string, frameId: string, contentRevision: number, invalidation: DrawCompositeOptions['contentInvalidation'], sourceDirtyRect: SelectionRect | undefined, imageSmoothingEnabled: boolean, isolatedLayerMask?: LayerMask, fastViewPreview = false, animationPlayback = false, animationConsumerOnly = false, render = true): CompositeSurface {
    // Layer styles depend on the current cel surface and cannot use the
    // playback shared/GPU snapshot safely across frame swaps.
    const animationFastPath = animationPlayback
      && !document.layers.some((layer) => hasEnabledLayerStyles(layer.layerStyles))
      && !document.groups.some((group) => hasEnabledLayerStyles(group.layerStyles))
    let surface = this.surfaces.get(key)
    // Playback often starts after the editor already rendered the current
    // frame through the normal path. Publish that surface immediately so the
    // first navigation event cannot trigger a redundant frame composite.
    if (surface && animationFastPath && !isolatedLayerMask && !view.relativeLuminance
      && !sharedAnimationCompositeSurface(document, frameId, contentRevision)) {
      rememberSharedAnimationComposite(document, frameId, contentRevision, surface.canvas)
    }
    const canApplyInvalidation = surface
      && surface.revision !== contentRevision
      && invalidation?.revision === contentRevision
      && invalidation.fromRevision === surface.revision
    const liveKey = `${document.id}:${frameId}`
    // A live stroke can enqueue several invalidation rectangles while the
    // document revision is still unchanged. The presence of a live-preview
    // marker alone must not suppress those redraws; only an explicitly
    // retained preview for this committed revision is authoritative.
    const livePreviewAlreadyPainted = !isolatedLayerMask && this.livePreviewPending.has(liveKey)
      && this.livePreviewCommitRevisions.get(liveKey) === contentRevision
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
      const initialSurface = !isolatedLayerMask && !view.relativeLuminance && contentRevision === 0
        && !this.invalidatedInitialDocuments.has(document)
        ? initialDocumentCompositeSurface(document, frameId)
        : null
      const exactSharedAnimationSurface = !initialSurface && animationFastPath && !isolatedLayerMask && !view.relativeLuminance
        ? sharedAnimationCompositeSurface(document, frameId, contentRevision)
        : null
      const sharedAnimationSurface = exactSharedAnimationSurface ?? (animationConsumerOnly
        ? latestSharedAnimationCompositeSurface(document, contentRevision)
        : null)
      const transientFallback = Boolean(!exactSharedAnimationSurface && sharedAnimationSurface)
      const animationSurface = !initialSurface && !sharedAnimationSurface && animationFastPath && !animationConsumerOnly && !isolatedLayerMask && !view.relativeLuminance
        ? this.createAnimationCompositeCanvas(document, contentRevision, 0, 0, document.width, document.height)
        : null
      const canvas = initialSurface ?? sharedAnimationSurface ?? animationSurface ?? new OffscreenCanvas(document.width, document.height)
      if (!initialSurface && !sharedAnimationSurface && !animationSurface) {
        const pixels = isolatedLayerMask
          ? renderLayerMaskRegion(isolatedLayerMask, 0, 0, document.width, document.height)
          : compositeRegion(
            document,
            0,
            0,
            document.width,
            document.height,
            this.compositeCache,
            contentRevision,
            undefined,
            sourceDirtyRect
          )
        if (!isolatedLayerMask && view.relativeLuminance) applyRelativeLuminance(pixels)
        canvas.getContext('2d')?.putImageData(imageData(pixels, document.width, document.height), 0, 0)
        if (!isolatedLayerMask && !view.relativeLuminance && contentRevision === 0 && !this.invalidatedInitialDocuments.has(document)) registerInitialDocumentCompositeSurface(document, canvas, frameId)
      }
      if (animationFastPath && !animationConsumerOnly && !isolatedLayerMask && !view.relativeLuminance) rememberSharedAnimationComposite(document, frameId, contentRevision, canvas)
      surface = { canvas, revision: contentRevision, transient: transientFallback }
      if (!transientFallback) this.remember(this.surfaces, key, surface)
      this.dirtyRects.delete(frameId)
      this.clearLivePreview(document, frameId)
    } else {
      const invalidationStartedAt = window.__moonSpriteCanvasProbe?.recordOperationStage ? performance.now() : 0
      const visibleRect = visibleDocumentRect(document, fromX, fromY, toX, toY)
      const invalidRects = mergeOverlappingRects([
        ...(surface.pendingDirtyRects ?? []),
        ...(this.dirtyRects.get(frameId) ?? [])
      ])
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
      const activeRects = mergeOverlappingRects(dirtyRects)
      surface.pendingDirtyRects = pendingDirtyRects.length > 0 ? mergeOverlappingRects(pendingDirtyRects) : undefined
      if (activeRects.length > 0) this.invalidateSurfaceBitmap(surface)
      recordCanvasStage('canvas.cache-invalidation', invalidationStartedAt, {
        dirtyRects: activeRects.length,
        dirtyPixels: activeRects.reduce((sum, rect) => sum + rect.width * rect.height, 0)
      })
      const surfaceContext = surface.canvas.getContext('2d')
      if (surfaceContext) for (const rect of activeRects) {
        const compositeStartedAt = window.__moonSpriteCanvasProbe?.recordOperationStage ? performance.now() : 0
        const pixels = isolatedLayerMask
          ? renderLayerMaskRegion(isolatedLayerMask, rect.x, rect.y, rect.width, rect.height)
          : compositeRegion(
            document,
            rect.x,
            rect.y,
            rect.width,
            rect.height,
            this.compositeCache,
            contentRevision,
            rect,
            sourceDirtyRect
          )
        if (!isolatedLayerMask && view.relativeLuminance) applyRelativeLuminance(pixels)
        recordCanvasStage('canvas.recompose', compositeStartedAt, { pixels: rect.width * rect.height })
        const uploadStartedAt = window.__moonSpriteCanvasProbe?.recordOperationStage ? performance.now() : 0
        surfaceContext.putImageData(imageData(pixels, rect.width, rect.height), rect.x, rect.y)
        recordCanvasStage('canvas.pixel-upload', uploadStartedAt, { pixels: rect.width * rect.height })
      }
      this.dirtyRects.delete(frameId)
      // A live preview may have marked this frame as already painted so the
      // committed edit does not get recomposed twice in the same draw. Once
      // the surface has consumed its dirty rectangles, clear that guard;
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
      const destination = this.alignedDocumentDestination(originX, originY, view.zoom, fromX, fromY, visibleWidth, visibleHeight)
      // The segmented pixel blit is only valid in an axis-aligned scene. Once
      // the cached bitmap is rotated or mirrored, every segment becomes an
      // independent filtered edge in the outer scene and produces diagonal
      // seams (while also multiplying drawImage calls). Use one contiguous
      // bitmap draw for transformed views; it is both artifact-free and much
      // cheaper during 400%–800% navigation.
      const axisAlignedView = Math.abs(view.rotation) < 0.000001 && !view.mirrored && !view.mirroredVertical
      if (!fastViewPreview && axisAlignedView && this.requiresAlignedPixelBlit(view.zoom) && !imageSmoothingEnabled) {
        this.drawAlignedPixelRegion(context, surface.bitmap ?? surface.canvas, originX, originY, view.zoom, fromX, fromY, fromX, fromY, visibleWidth, visibleHeight)
      } else {
        context.drawImage(
          surface.bitmap ?? surface.canvas,
          fromX,
          fromY,
          visibleWidth,
          visibleHeight,
          destination.left,
          destination.top,
          destination.width,
          destination.height
        )
      }
    }
    return surface
  }

  private drawRegion(context: RasterContext2D, document: SpriteDocument, view: ViewState, originX: number, originY: number, fromX: number, fromY: number, toX: number, toY: number, key: string, frameId: string, contentRevision: number, invalidation: DrawCompositeOptions['contentInvalidation'], sourceDirtyRect: SelectionRect | undefined, imageSmoothingEnabled = false, isolatedLayerMask?: LayerMask, fastViewPreview = false, animationPlayback = false, render = true): CompositeRegionSurface | null {
    const animationFastPath = animationPlayback
      && !document.layers.some((layer) => hasEnabledLayerStyles(layer.layerStyles))
      && !document.groups.some((group) => hasEnabledLayerStyles(group.layerStyles))
    const x = Math.max(0, Math.floor(fromX))
    const y = Math.max(0, Math.floor(fromY))
    const right = Math.min(document.width, Math.ceil(toX))
    const bottom = Math.min(document.height, Math.ceil(toY))
    const width = Math.max(0, right - x)
    const height = Math.max(0, bottom - y)
    if (width === 0 || height === 0) return null
    let region = this.regions.get(key)
    const liveKey = `${document.id}:${frameId}`
    const livePreviewAlreadyPainted = !isolatedLayerMask && this.livePreviewPending.has(liveKey)
      && this.livePreviewCommitRevisions.get(liveKey) === contentRevision
    const sameGeometry = region && region.x === x && region.y === y && region.width === width && region.height === height
    if (!sameGeometry) {
      const animationSurface = animationFastPath && !isolatedLayerMask && !view.relativeLuminance
        ? this.createAnimationCompositeCanvas(document, contentRevision, x, y, width, height)
        : null
      const canvas = animationSurface ?? new OffscreenCanvas(width, height)
      if (!animationSurface) {
        const pixels = isolatedLayerMask
          ? renderLayerMaskRegion(isolatedLayerMask, x, y, width, height)
          : compositeRegion(
            document,
            x,
            y,
            width,
            height,
            this.compositeCache,
            contentRevision,
            undefined,
            sourceDirtyRect
          )
        if (!isolatedLayerMask && view.relativeLuminance) applyRelativeLuminance(pixels)
        canvas.getContext('2d')?.putImageData(imageData(pixels, width, height), 0, 0)
      }
      region = { canvas, revision: contentRevision, x, y, width, height }
      this.remember(this.regions, key, region)
      this.dirtyRects.delete(frameId)
      this.clearLivePreview(document, frameId)
    } else if (region) {
      const invalidationStartedAt = window.__moonSpriteCanvasProbe?.recordOperationStage ? performance.now() : 0
      const invalidationRect = invalidation?.kind === 'region' ? invalidation.rect : undefined
      const canApplyInvalidation = region.revision !== contentRevision
        && invalidation?.revision === contentRevision
        && invalidation.fromRevision === region.revision
        && invalidation.kind === 'region'
        && Boolean(invalidationRect)
        && (isolatedLayerMask || (invalidation.frameId ?? frameId) === frameId)
      if (region.revision !== contentRevision) {
        if (canApplyInvalidation && invalidationRect) {
          if (!livePreviewAlreadyPainted) {
            const pending = this.dirtyRects.get(frameId) ?? []
            pending.push(isolatedLayerMask ? invalidationRect : expandLayerStyleInvalidationRect(document, invalidationRect))
            this.dirtyRects.set(frameId, pending)
          }
        } else {
          this.dirtyRects.set(frameId, [{ x, y, width, height }])
        }
        region.revision = contentRevision
      }
      const visibleRect = { x, y, width, height }
      const dirtyRects = mergeOverlappingRects(this.dirtyRects.get(frameId) ?? [])
        .map((rect) => intersectRect(rect, visibleRect))
        .filter((rect): rect is SelectionRect => Boolean(rect))
      const activeRects = dirtyRects
      if (activeRects.length > 0) this.invalidateSurfaceBitmap(region)
      recordCanvasStage('canvas.cache-invalidation', invalidationStartedAt, {
        dirtyRects: activeRects.length,
        dirtyPixels: activeRects.reduce((sum, rect) => sum + rect.width * rect.height, 0)
      })
      const regionContext = region.canvas.getContext('2d')
      if (regionContext) for (const rect of activeRects) {
        const compositeStartedAt = window.__moonSpriteCanvasProbe?.recordOperationStage ? performance.now() : 0
        const pixels = isolatedLayerMask
          ? renderLayerMaskRegion(isolatedLayerMask, rect.x, rect.y, rect.width, rect.height)
          : compositeRegion(
            document,
            rect.x,
            rect.y,
            rect.width,
            rect.height,
            this.compositeCache,
            contentRevision,
            rect,
            sourceDirtyRect
          )
        if (!isolatedLayerMask && view.relativeLuminance) applyRelativeLuminance(pixels)
        recordCanvasStage('canvas.recompose', compositeStartedAt, { pixels: rect.width * rect.height })
        const uploadStartedAt = window.__moonSpriteCanvasProbe?.recordOperationStage ? performance.now() : 0
        regionContext.putImageData(imageData(pixels, rect.width, rect.height), rect.x - x, rect.y - y)
        recordCanvasStage('canvas.pixel-upload', uploadStartedAt, { pixels: rect.width * rect.height })
      }
      this.dirtyRects.delete(frameId)
      this.clearLivePreview(document, frameId)
    }
    if (!region) return null
    if (!livePreviewAlreadyPainted) this.scheduleSurfaceBitmap(region)
    if (render) {
      const destination = this.alignedDocumentDestination(originX, originY, view.zoom, x, y, width, height)
      const axisAlignedView = Math.abs(view.rotation) < 0.000001 && !view.mirrored && !view.mirroredVertical
      if (!fastViewPreview && axisAlignedView && this.requiresAlignedPixelBlit(view.zoom) && !imageSmoothingEnabled) {
        this.drawAlignedPixelRegion(context, region.bitmap ?? region.canvas, originX, originY, view.zoom, 0, 0, x, y, width, height)
      } else {
        context.drawImage(region.bitmap ?? region.canvas, 0, 0, width, height, destination.left, destination.top, destination.width, destination.height)
      }
    }
    return region
  }

  private remember<T extends CompositeSurface>(cache: Map<string, T>, key: string, value: T): void {
    cache.delete(key)
    cache.set(key, value)
    const cacheBytes = (): number => {
      let total = 0
      for (const entry of cache.values()) total += entry.canvas.width * entry.canvas.height * 4
      return total
    }
    while (cache.size > 1 && (cache.size > MAX_CACHED_FRAMES || cacheBytes() > this.maxCacheBytes)) {
      const oldestKey = cache.keys().next().value!
      cache.get(oldestKey)?.bitmap?.close()
      cache.delete(oldestKey)
    }
  }
}
