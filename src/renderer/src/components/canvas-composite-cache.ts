import type { LayerMask, RasterLayer, SelectionQuad, SelectionRect, SpriteDocument, ViewState } from '@shared/types'
import { compositeRegion, DocumentCompositeCache, expandLayerStyleInvalidationRect, rasterContentBounds, readLayerPackedAt, renderLayerMaskRegion } from '@/core/document'
import { applyRelativeLuminance } from '@/core/raster'
import { selectionTransformPreviewPacked, selectionTransformPreviewRasterPacked, type SelectionTransformSource } from '@/core/tools'
import { selectionQuadBounds, transformedSelectionBounds } from '@/core/selection'
import { translatedSelectionRect } from '@/core/canvas-input'
import { normalizeSelectionForTileRepeatPreview, tileRepeatDocumentOffsets } from '@/core/tilemap'
import { initialDocumentCompositePending, initialDocumentCompositeSurface, registerInitialDocumentCompositeSurface } from '@/core/initial-document-composite'
import { deviceAlignedCanvasRect, deviceAlignedDocumentRect, deviceAlignedPixelRuns, type CanvasDeviceScaleInput } from '@/core/canvas-render-plan'
import type { CanvasPreviewInvalidation, CanvasPreviewSelection } from '@/core/canvas-preview-lifecycle'
import type { RasterContext2D } from './canvas-selection-renderer'

const recordCanvasStage = (stage: string, startedAt: number, detail?: Record<string, number | string | boolean>): void => {
  if (typeof window === 'undefined' || !window.__moonSpriteCanvasProbe?.recordOperationStage) return
  window.__moonSpriteCanvasProbe.recordOperationStage(stage, performance.now() - startedAt, detail)
}

interface CompositeSurface {
  canvas: OffscreenCanvas
  revision: number
  pendingDirtyRects?: SelectionRect[]
}

interface CompositeRegionSurface extends CompositeSurface {
  x: number
  y: number
  width: number
  height: number
}

interface MovePreviewSurface {
  key: string
  x: number
  y: number
  width: number
  height: number
  basePixels: Uint8ClampedArray
  outputPixels: Uint8ClampedArray
  movingLayers: SpriteDocument['layers']
  canvas: OffscreenCanvas
}

export type SelectionTransformCompositePreview = CanvasPreviewSelection

interface SelectionPreviewSurface {
  key: string
  x: number
  y: number
  width: number
  height: number
  lowerLayers: SpriteDocument['layers']
  upperLayers: SpriteDocument['layers']
  baseCanvas: OffscreenCanvas
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
  /** Effective device pixels per logical canvas unit used by the caller's context. */
  devicePixelRatio?: CanvasDeviceScaleInput
  movingLayerIds?: readonly string[]
  selectionPreview?: SelectionTransformCompositePreview
}

const invalidationRegion = (invalidation: DrawCompositeOptions['contentInvalidation']): SelectionRect | undefined =>
  invalidation?.kind === 'region' ? invalidation.rect : undefined

const MAX_SURFACE_DIMENSION = 8192
const MAX_CACHED_FRAMES = 32
const DEFAULT_MAX_CACHE_BYTES = 128 * 1024 * 1024
const CACHE_VERSION = 10
const imageData = (pixels: Uint8ClampedArray, width: number, height: number): ImageData =>
  new ImageData(pixels as Uint8ClampedArray<ArrayBuffer>, width, height)

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

const mergeOverlappingRects = (rects: readonly SelectionRect[]): SelectionRect[] => {
  const merged: SelectionRect[] = []
  for (const source of rects) {
    let candidate = source
    for (let index = merged.length - 1; index >= 0; index -= 1) {
      if (!intersectRect(candidate, merged[index])) continue
      candidate = unionRect(candidate, merged[index])
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
  private fullPreviewInvalidationPending = false
  private compositeCache = new DocumentCompositeCache()
  private movePreview: MovePreviewSurface | null = null
  private selectionPreview: SelectionPreviewSurface | null = null
  private clipboardPreview: ClipboardPreviewSurface | null = null
  private selectionTransformRaster: SelectionTransformRasterSurface | null = null

  constructor(private readonly maxCacheBytes = DEFAULT_MAX_CACHE_BYTES) {}

  supportsSelectionPreview(document: SpriteDocument, contentRevision: number, layerId: string): boolean {
    return Boolean(this.compositeCache.renderLayersFor(document, contentRevision)?.some((layer) => layer.id === layerId))
  }

  invalidateSurface(): void {
    this.surfaces.clear()
    this.regions.clear()
    this.dirtyRects.clear()
    this.sourceDirtyHints.clear()
    this.compositeCache.invalidateAll()
    this.movePreview = null
    this.selectionPreview = null
    this.clipboardPreview = null
    this.selectionTransformRaster = null
  }

  invalidateAll(): void {
    if (this.lastDocument) this.invalidatedInitialDocuments.add(this.lastDocument)
    this.fullPreviewInvalidationPending = true
    this.invalidateSurface()
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
    this.invalidateRect(expandLayerStyleInvalidationRect(document, selection, affectedOwnerIds), document.width, document.height, frameId)
    const previous = this.sourceDirtyHints.get(frameId)
    const rect = previous && !previous.used ? unionRect(previous.rect, selection) : { ...selection }
    this.sourceDirtyHints.set(frameId, { rect, used: false })
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

  draw({ context, document, view, originX, originY, canvasWidth, canvasHeight, fromX, fromY, toX, toY, revision, contentRevision = revision, contentInvalidation = null, frameId, isolatedLayerMask, imageSmoothingEnabled = false, devicePixelRatio = 1, movingLayerIds, selectionPreview }: DrawCompositeOptions): void {
    this.currentDevicePixelRatio = devicePixelRatio
    this.lastDocument = document
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
    if (imageSmoothingEnabled) context.imageSmoothingQuality = 'high'
    if (!isolatedLayerMask && !view.relativeLuminance && movingLayerIds?.length && this.drawMovePreview(context, document, view, originX, originY, fromX, fromY, toX, toY, effectiveFrameId, contentRevision, movingLayerIds)) {
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
    if (isolatedLayerMask || (shouldCacheFullCompositeSurface(document.width, document.height, this.maxCacheBytes) && !initialCompositeIsPending)) this.drawSurface(context, document, view, originX, originY, canvasWidth, canvasHeight, fromX, fromY, toX, toY, frameKey, effectiveFrameId, contentRevision, contentInvalidation, sourceDirtyRect, imageSmoothingEnabled, isolatedLayerMask)
    else this.drawRegion(context, document, view, originX, originY, fromX, fromY, toX, toY, frameKey, effectiveFrameId, contentRevision, contentInvalidation, sourceDirtyRect, imageSmoothingEnabled, isolatedLayerMask)
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
    source: OffscreenCanvas,
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
      selection.quad
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
      let baseCanvas: OffscreenCanvas
      let baseDocumentX: number
      let baseDocumentY: number
      if (shouldCacheFullCompositeSurface(document.width, document.height, this.maxCacheBytes)) {
        const surface = this.drawSurface(context, document, view, originX, originY, document.width * view.zoom, document.height * view.zoom, fromX, fromY, toX, toY, frameKey, frameId, contentRevision, null, undefined, false, undefined, false)
        baseCanvas = surface.canvas
        baseDocumentX = 0
        baseDocumentY = 0
      } else {
        const region = this.drawRegion(context, document, view, originX, originY, fromX, fromY, toX, toY, frameKey, frameId, contentRevision, null, undefined, false, undefined, false)
        if (!region) return false
        baseCanvas = region.canvas
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
            const transformed = selectionTransformPreviewPacked(document, selection.source, selectionTargets[targetIndex], patchRect.x, patchRect.y, patchRect.width, patchRect.height, selection.angle, selection.shear, activeLayer, undefined, selectionQuads[targetIndex])
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
    const layers = this.compositeCache.renderLayersFor(document, contentRevision)
    if (!layers) return false
    const movingIds = new Set(movingLayerIds)
    const movingLayers = layers.filter((layer) => movingIds.has(layer.id))
    if (movingLayers.length !== movingIds.size) return false
    const firstMovingIndex = layers.findIndex((layer) => movingIds.has(layer.id))
    if (firstMovingIndex < 0 || layers.slice(firstMovingIndex).some((layer) => !movingIds.has(layer.id))) return false
    if (width * height * 8 > this.maxCacheBytes) return false
    const key = `${document.id}:${frameId}:${contentRevision}:${x}:${y}:${width}:${height}:${view.tileRepeatMode ?? 'off'}:${movingLayers.map((layer) => layer.id).join(',')}`
    let preview = this.movePreview
    if (!preview || preview.key !== key) {
      const basePixels = this.compositeCache.normalLayerRegion(document, layers.slice(0, firstMovingIndex), x, y, width, height, contentRevision)
      preview = {
        key, x, y, width, height, basePixels,
        outputPixels: new Uint8ClampedArray(basePixels.length),
        movingLayers,
        canvas: new OffscreenCanvas(width, height)
      }
      this.movePreview = preview
    }
    preview.outputPixels.set(preview.basePixels)
    this.compositeCache.compositeNormalLayersInto(document, repeatedLayers(preview.movingLayers, document, view), x, y, width, height, contentRevision, preview.outputPixels)
    preview.canvas.getContext('2d')?.putImageData(imageData(preview.outputPixels, width, height), 0, 0)
    const destination = this.alignedDocumentDestination(originX, originY, view.zoom, x, y, width, height)
    context.drawImage(preview.canvas, 0, 0, width, height, destination.left, destination.top, destination.width, destination.height)
    return true
  }

  private surfaceNamespace(document: SpriteDocument, view: Pick<ViewState, 'relativeLuminance'>, isolatedLayerMask?: LayerMask): string {
    return `${CACHE_VERSION}:${document.id}:${isolatedLayerMask ? `mask:${isolatedLayerMask.id}` : view.relativeLuminance ? 'luminance' : 'color'}`
  }

  private drawSurface(context: RasterContext2D, document: SpriteDocument, view: ViewState, originX: number, originY: number, canvasWidth: number, canvasHeight: number, fromX: number, fromY: number, toX: number, toY: number, key: string, frameId: string, contentRevision: number, invalidation: DrawCompositeOptions['contentInvalidation'], sourceDirtyRect: SelectionRect | undefined, imageSmoothingEnabled: boolean, isolatedLayerMask?: LayerMask, render = true): CompositeSurface {
    let surface = this.surfaces.get(key)
    const canApplyInvalidation = surface
      && surface.revision !== contentRevision
      && invalidation?.revision === contentRevision
      && invalidation.fromRevision === surface.revision
    if (surface && surface.revision !== contentRevision) {
      if (canApplyInvalidation && invalidation?.kind === 'region') {
        if ((isolatedLayerMask || (invalidation.frameId ?? frameId) === frameId) && invalidation.rect) {
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
      const canvas = initialSurface ?? new OffscreenCanvas(document.width, document.height)
      if (!initialSurface) {
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
      surface = { canvas, revision: contentRevision }
      this.remember(this.surfaces, key, surface)
      this.dirtyRects.delete(frameId)
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
      surface.pendingDirtyRects = pendingDirtyRects.length > 0 ? mergeOverlappingRects(pendingDirtyRects) : undefined
      recordCanvasStage('canvas.cache-invalidation', invalidationStartedAt, {
        dirtyRects: dirtyRects.length,
        dirtyPixels: dirtyRects.reduce((sum, rect) => sum + rect.width * rect.height, 0)
      })
      const surfaceContext = surface.canvas.getContext('2d')
      if (surfaceContext) for (const rect of mergeOverlappingRects(dirtyRects)) {
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
    }
    const visibleWidth = Math.max(0, toX - fromX)
    const visibleHeight = Math.max(0, toY - fromY)
    if (render && visibleWidth > 0 && visibleHeight > 0) {
      const destination = this.alignedDocumentDestination(originX, originY, view.zoom, fromX, fromY, visibleWidth, visibleHeight)
      if (this.requiresAlignedPixelBlit(view.zoom) && !imageSmoothingEnabled) {
        this.drawAlignedPixelRegion(context, surface.canvas, originX, originY, view.zoom, fromX, fromY, fromX, fromY, visibleWidth, visibleHeight)
      } else {
        context.drawImage(
          surface.canvas,
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

  private drawRegion(context: RasterContext2D, document: SpriteDocument, view: ViewState, originX: number, originY: number, fromX: number, fromY: number, toX: number, toY: number, key: string, frameId: string, contentRevision: number, invalidation: DrawCompositeOptions['contentInvalidation'], sourceDirtyRect: SelectionRect | undefined, imageSmoothingEnabled = false, isolatedLayerMask?: LayerMask, render = true): CompositeRegionSurface | null {
    const x = Math.max(0, Math.floor(fromX))
    const y = Math.max(0, Math.floor(fromY))
    const right = Math.min(document.width, Math.ceil(toX))
    const bottom = Math.min(document.height, Math.ceil(toY))
    const width = Math.max(0, right - x)
    const height = Math.max(0, bottom - y)
    if (width === 0 || height === 0) return null
    let region = this.regions.get(key)
    const sameGeometry = region && region.x === x && region.y === y && region.width === width && region.height === height
    if (!sameGeometry) {
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
      const canvas = new OffscreenCanvas(width, height)
      canvas.getContext('2d')?.putImageData(imageData(pixels, width, height), 0, 0)
      region = { canvas, revision: contentRevision, x, y, width, height }
      this.remember(this.regions, key, region)
      this.dirtyRects.delete(frameId)
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
          const pending = this.dirtyRects.get(frameId) ?? []
          pending.push(isolatedLayerMask ? invalidationRect : expandLayerStyleInvalidationRect(document, invalidationRect))
          this.dirtyRects.set(frameId, pending)
        } else {
          this.dirtyRects.set(frameId, [{ x, y, width, height }])
        }
        region.revision = contentRevision
      }
      const visibleRect = { x, y, width, height }
      const dirtyRects = mergeOverlappingRects(this.dirtyRects.get(frameId) ?? [])
        .map((rect) => intersectRect(rect, visibleRect))
        .filter((rect): rect is SelectionRect => Boolean(rect))
      recordCanvasStage('canvas.cache-invalidation', invalidationStartedAt, {
        dirtyRects: dirtyRects.length,
        dirtyPixels: dirtyRects.reduce((sum, rect) => sum + rect.width * rect.height, 0)
      })
      const regionContext = region.canvas.getContext('2d')
      if (regionContext) for (const rect of dirtyRects) {
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
    }
    if (!region) return null
    if (render) {
      const destination = this.alignedDocumentDestination(originX, originY, view.zoom, x, y, width, height)
      if (this.requiresAlignedPixelBlit(view.zoom) && !imageSmoothingEnabled) {
        this.drawAlignedPixelRegion(context, region.canvas, originX, originY, view.zoom, 0, 0, x, y, width, height)
      } else {
        context.drawImage(region.canvas, 0, 0, width, height, destination.left, destination.top, destination.width, destination.height)
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
    while (cache.size > 1 && (cache.size > MAX_CACHED_FRAMES || cacheBytes() > this.maxCacheBytes)) cache.delete(cache.keys().next().value!)
  }
}
