import type { BlendMode } from '@shared/types-color'
import type { LayerMask, RasterLayer } from '@shared/types-layer'
import type { SelectionRect } from '@shared/types-selection'
import type { SpriteDocument } from '@shared/types-document'
import type { ViewState } from '@shared/types-view'
import {
  type SelectionTransformSource
} from '@/core/tools-selection-transform-types'
import {
  translatedSelectionRect
} from '@/core/canvas-input-preview'
import { normalizeSelectionForTileRepeatPreview, tileRepeatDocumentOffsets } from '@/core/tilemap'
import { type CanvasDeviceScaleInput } from '@/core/canvas-render-plan'
import type { CanvasPreviewSelection } from '@/core/canvas-preview-lifecycle'
import type { RasterContext2D } from './canvas-selection-renderer'
import { selectionQuadKey } from './canvas-composite-cache-geometry'

export const recordCanvasStage = (stage: string, startedAt: number, detail?: Record<string, number | string | boolean>): void => {
  if (typeof window === 'undefined' || !window.__moonSpriteCanvasProbe?.recordOperationStage) return
  window.__moonSpriteCanvasProbe.recordOperationStage(stage, performance.now() - startedAt, detail)
}

export interface CompositeSurface {
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

export interface CompositeRegionSurface extends CompositeSurface {
  x: number
  y: number
  width: number
  height: number
}

export interface AnimationLayerSource {
  source: CanvasImageSource
  revision: number
  width: number
  height: number
  bytes: number
}

export interface MovePreviewSurface {
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

export interface GpuMovePreviewSurface {
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

export const selectionOptimizedRotationEnabled = (selection: SelectionTransformCompositePreview): boolean => selection.optimizedRotation === true

export interface SelectionPreviewSurface {
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

export interface ClipboardPreviewSurface {
  source: SelectionTransformSource
  key: string
  canvas: OffscreenCanvas
}

export interface SelectionTransformRasterSurface {
  source: SelectionTransformSource
  key: string
  width: number
  height: number
  pixels: Uint32Array
}

export interface DrawCompositeOptions {
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
  /** Pixels are still being edited; defer optional full-surface bitmap copies. */
  liveRasterEdit?: boolean
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

export const invalidationRegion = (invalidation: DrawCompositeOptions['contentInvalidation']): SelectionRect | undefined => (invalidation?.kind === 'region' ? invalidation.rect : undefined)

export const MAX_SURFACE_DIMENSION = 8192

export const MAX_CACHED_FRAMES = 32

export const DEFAULT_MAX_CACHE_BYTES = 128 * 1024 * 1024

export const CACHE_VERSION = 10

export interface SharedAnimationCompositeState {
  entries: Map<string, { canvas: OffscreenCanvas; contentRevision: number; bytes: number }>
  bytes: number
}

export const sharedAnimationComposites = new WeakMap<SpriteDocument, SharedAnimationCompositeState>()

export interface SharedAnimationLayerSourceState {
  entries: Map<object, AnimationLayerSource>
  bytes: number
}

export const sharedAnimationLayerSources = new WeakMap<SpriteDocument, SharedAnimationLayerSourceState>()

/** Explicitly release browser-backed animation resources when a document closes. */
export const releaseSharedAnimationResources = (document: SpriteDocument): void => {
  const composites = sharedAnimationComposites.get(document)
  if (composites) {
    for (const entry of composites.entries.values()) {
      entry.canvas.width = 1
      entry.canvas.height = 1
    }
    composites.entries.clear()
    composites.bytes = 0
    sharedAnimationComposites.delete(document)
  }
  const sources = sharedAnimationLayerSources.get(document)
  if (sources) {
    for (const entry of sources.entries.values()) {
      if (typeof ImageBitmap !== 'undefined' && entry.source instanceof ImageBitmap) entry.source.close()
      else if (typeof OffscreenCanvas !== 'undefined' && entry.source instanceof OffscreenCanvas) {
        entry.source.width = 1
        entry.source.height = 1
      }
    }
    sources.entries.clear()
    sources.bytes = 0
    sharedAnimationLayerSources.delete(document)
  }
}

export const sharedAnimationCompositeSurface = (document: SpriteDocument, frameId: string, contentRevision: number): OffscreenCanvas | null => {
  const state = sharedAnimationComposites.get(document)
  const entry = state?.entries.get(frameId)
  if (!state || !entry || entry.contentRevision !== contentRevision) return null
  state.entries.delete(frameId)
  state.entries.set(frameId, entry)
  return entry.canvas
}

export const latestSharedAnimationCompositeSurface = (document: SpriteDocument, contentRevision: number): OffscreenCanvas | null => {
  const entries = sharedAnimationComposites.get(document)?.entries
  if (!entries) return null
  const values = [...entries.values()]
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (values[index].contentRevision === contentRevision) return values[index].canvas
  }
  return null
}

export const rememberSharedAnimationComposite = (document: SpriteDocument, frameId: string, contentRevision: number, canvas: OffscreenCanvas): void => {
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

export const imageData = (pixels: Uint8ClampedArray, width: number, height: number): ImageData => new ImageData(pixels as Uint8ClampedArray<ArrayBuffer>, width, height)

export const gpuBlendModeFor = (mode: BlendMode): GlobalCompositeOperation | null => {
  // Canvas blends interpolate the source color by backdrop alpha before
  // source-over. MoonSprite's canonical blendWithMode does not. Even matching
  // operation names therefore change translucent pixels during a preview.
  return mode === 'normal' ? 'source-over' : null
}

export const compositePreviewPixel = (output: Uint8ClampedArray, outputOffset: number, packed: number, layerFormat: RasterLayer['format'], layerOpacity: number, palette: Map<number, SpriteDocument['palette'][number]['color']> | null): void => {
  const indexedColor = layerFormat === 'indexed' ? palette?.get(packed) : undefined
  const r = indexedColor?.r ?? packed & 0xff
  const g = indexedColor?.g ?? (packed >>> 8) & 0xff
  const b = indexedColor?.b ?? (packed >>> 16) & 0xff
  const a = indexedColor?.a ?? (layerFormat === 'rgba' ? (packed >>> 24) & 0xff : 0)
  if (a === 0) return
  const bottomAlpha = output[outputOffset + 3]
  if (layerOpacity === 1 && (bottomAlpha === 0 || a === 255)) {
    output[outputOffset] = r
    output[outputOffset + 1] = g
    output[outputOffset + 2] = b
    output[outputOffset + 3] = a
    return
  }
  const topAlpha = (a / 255) * layerOpacity
  const baseAlpha = bottomAlpha / 255
  const outputAlpha = topAlpha + baseAlpha * (1 - topAlpha)
  if (outputAlpha <= 0) return
  output[outputOffset] = Math.round((r * topAlpha + output[outputOffset] * baseAlpha * (1 - topAlpha)) / outputAlpha)
  output[outputOffset + 1] = Math.round((g * topAlpha + output[outputOffset + 1] * baseAlpha * (1 - topAlpha)) / outputAlpha)
  output[outputOffset + 2] = Math.round((b * topAlpha + output[outputOffset + 2] * baseAlpha * (1 - topAlpha)) / outputAlpha)
  output[outputOffset + 3] = Math.round(outputAlpha * 255)
}

export const selectionPreviewTransformKey = (selection: SelectionTransformCompositePreview, tileRepeatMode: NonNullable<ViewState['tileRepeatMode']>): string => {
  const { target, shear } = selection
  return [
    target.x,
    target.y,
    target.width,
    target.height,
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

export const repeatedSelectionTargets = (selection: SelectionTransformCompositePreview, document: SpriteDocument, view: ViewState): SelectionRect[] => {
  const tileRepeatMode = view.tileRepeatMode ?? 'off'
  const normalizedTarget = tileRepeatMode === 'off' ? selection.target : (normalizeSelectionForTileRepeatPreview(selection.target, document.width, document.height, tileRepeatMode) ?? selection.target)
  return tileRepeatDocumentOffsets(document.width, document.height, tileRepeatMode).map((offset) => translatedSelectionRect(normalizedTarget, offset))
}

export const repeatedLayers = (layers: readonly SpriteDocument['layers'][number][], document: SpriteDocument, view: ViewState): SpriteDocument['layers'] => {
  const repeated: SpriteDocument['layers'] = []
  for (const offset of tileRepeatDocumentOffsets(document.width, document.height, view.tileRepeatMode ?? 'off')) {
    for (const layer of layers) {
      repeated.push(
        offset.x === 0 && offset.y === 0
          ? layer
          : {
              ...layer,
              offsetX: layer.offsetX + offset.x,
              offsetY: layer.offsetY + offset.y
            }
      )
    }
  }
  return repeated
}

export const shouldCacheFullCompositeSurface = (width: number, height: number, maxCacheBytes = DEFAULT_MAX_CACHE_BYTES): boolean =>
  width > 0 && height > 0 && width <= MAX_SURFACE_DIMENSION && height <= MAX_SURFACE_DIMENSION && width * height * 4 <= maxCacheBytes

export function surfaceNamespace(document: SpriteDocument, view: Pick<ViewState, 'relativeLuminance'>, isolatedLayerMask?: LayerMask): string {
    return `${CACHE_VERSION}:${document.id}:${isolatedLayerMask ? `mask:${isolatedLayerMask.id}` : view.relativeLuminance ? 'luminance' : 'color'}`
  }

/** Selection previews need the background drawing capability, not the cache owner. */
export type DrawCompositeSurface = (
  context: RasterContext2D, document: SpriteDocument, view: ViewState,
  originX: number, originY: number, canvasWidth: number, canvasHeight: number,
  fromX: number, fromY: number, toX: number, toY: number,
  key: string, frameId: string, contentRevision: number,
  invalidation: DrawCompositeOptions['contentInvalidation'],
  sourceDirtyRect: SelectionRect | undefined, imageSmoothingEnabled: boolean,
  isolatedLayerMask?: LayerMask, fastViewPreview?: boolean, animationPlayback?: boolean,
  animationConsumerOnly?: boolean, render?: boolean
) => CompositeSurface

export type DrawCompositeRegion = (
  context: RasterContext2D, document: SpriteDocument, view: ViewState,
  originX: number, originY: number, fromX: number, fromY: number, toX: number, toY: number,
  key: string, frameId: string, contentRevision: number,
  invalidation: DrawCompositeOptions['contentInvalidation'],
  sourceDirtyRect: SelectionRect | undefined, imageSmoothingEnabled?: boolean,
  isolatedLayerMask?: LayerMask, fastViewPreview?: boolean, animationPlayback?: boolean, render?: boolean
) => CompositeRegionSurface | null
