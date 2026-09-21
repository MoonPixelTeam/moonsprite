import { type PixelSource } from '@/components/pixel-source'
import { memo, useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { AnimationCel, AnimationCelSurface } from '@shared/types-animation'
import type { LayerMask } from '@shared/types-layer'
import type { PaletteEntry } from '@shared/types-color'
import { animationMaskAt, getRasterContentRevision } from '@/core/document-model'
import { animationCelHasContent, createAnimationCelLookup } from '@/core/animation'
import { renderAnimationCelThumbnailPixels, renderLayerMaskThumbnailPixels } from '@/core/animation-thumbnail'
import { useWorkspace } from '@/store/workspace'
import { useI18n } from '@/components/I18nProvider'
import { rasterStorageIdentity } from '@/core/runtime-raster'
import { notifyAnimationCelThumbnailPreview, notifyLayerMaskThumbnailPreview, registerAnimationCelThumbnailPreviewListener, registerLayerMaskThumbnailPreviewListener } from '@/core/canvas-preview-lifecycle'

export const celContentCache = new WeakMap<object, Map<string, { revision: number; storageRevision: number; value: boolean }>>()

export const celThumbnailCache = new WeakMap<object, Map<string, { revision: number; storageRevision: number; pixels: Uint8ClampedArray }>>()

export const scheduleThumbnailRender = (render: () => void): (() => void) => {
  let timeoutId: number | null = null
  if (typeof window.requestAnimationFrame !== 'function') {
    timeoutId = window.setTimeout(render, 0)
    return () => { if (timeoutId !== null) window.clearTimeout(timeoutId) }
  }
  let frameId: number | null = window.requestAnimationFrame(() => {
    frameId = null
    timeoutId = window.setTimeout(render, 0)
  })
  return () => {
    if (frameId !== null) window.cancelAnimationFrame(frameId)
    if (timeoutId !== null) window.clearTimeout(timeoutId)
  }
}

export const paletteVisibilityKey = (palette: readonly PaletteEntry[]): string => palette.map((entry) => `${entry.id}:${entry.color.a}`).join(',')

export const paletteRenderKey = (palette: readonly PaletteEntry[]): string => palette.map((entry) => `${entry.id}:${entry.color.r},${entry.color.g},${entry.color.b},${entry.color.a}`).join('|')

export const cachedCelHasContent = (cel: AnimationCel | null, palette: readonly PaletteEntry[], revision = 0): boolean => {
  const surface = cel?.surface
  if (!surface) return false
  const key = surface.format === 'rgba' ? 'rgba' : paletteVisibilityKey(palette)
  const storage = rasterStorageIdentity(surface)
  const storageRevision = getRasterContentRevision(storage)
  const entries = celContentCache.get(storage) ?? new Map<string, { revision: number; storageRevision: number; value: boolean }>()
  const cached = entries.get(key)
  if (cached && cached.storageRevision === storageRevision && (revision === 0 || cached.revision === revision)) return cached.value
  const value = animationCelHasContent(cel, palette)
  entries.set(key, { revision, storageRevision, value })
  celContentCache.set(storage, entries)
  return value
}

export function CelThumbnail({ documentId, layerId, celSource, palette, revision, documentWidth, documentHeight, thumbnailSize, sharedCheckerboard = false, framing = 'content' }: { documentId: string; layerId: string; celSource: PixelSource<AnimationCel>; palette: readonly PaletteEntry[]; revision: number; documentWidth: number; documentHeight: number; thumbnailSize: number; sharedCheckerboard?: boolean; framing?: 'content' | 'canvas' }) {
  const cel = celSource()
  const storage = cel.surface ? rasterStorageIdentity(cel.surface) : null
  const storageRevision = storage ? getRasterContentRevision(storage) : 0
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let cancelScheduledRender: (() => void) | null = null
    const draw = (surface: AnimationCelSurface, livePalette: readonly PaletteEntry[], opacity: number, bypassCache = false): void => {
      cancelScheduledRender?.()
      cancelScheduledRender = scheduleThumbnailRender(() => {
        const canvas = ref.current
        if (!canvas) return
        if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) return
        try {
          // Pixels are already sampled on the CPU; these tiny canvases only
          // receive putImageData. Keep them software-backed so dozens of cels
          // do not add GPU layers to every main-canvas compositing update.
          const context = canvas.getContext('2d', { willReadFrequently: true })
          if (!context) return
          const key = `${documentWidth}:${documentHeight}:${canvas.width}:${surface.width}:${surface.height}:${surface.offsetX}:${surface.offsetY}:${opacity}:${sharedCheckerboard}:${framing}:${surface.format === 'rgba' ? 'rgba' : paletteRenderKey(livePalette)}`
          const storage = rasterStorageIdentity(surface)
          const storageRevision = getRasterContentRevision(storage)
          const entries = celThumbnailCache.get(storage) ?? new Map<string, { revision: number; storageRevision: number; pixels: Uint8ClampedArray }>()
          const cached = entries.get(key)
          const pixels = !bypassCache && cached && cached.storageRevision === storageRevision && (revision === 0 || cached.revision === revision)
            ? cached.pixels
            : renderAnimationCelThumbnailPixels(documentWidth, documentHeight, canvas.width, surface, livePalette, opacity, sharedCheckerboard, framing)
          if (!bypassCache && (!cached || pixels !== cached.pixels)) {
            entries.set(key, { revision, storageRevision, pixels })
            celThumbnailCache.set(storage, entries)
          }
          const image = context.createImageData(canvas.width, canvas.height)
          image.data.set(pixels)
          context.putImageData(image, 0, 0)
        } catch {
          // Canvas rendering is unavailable in a few test and recovery environments.
        }
      })
    }
    if (cel.surface) draw(cel.surface, palette, cel.opacity ?? 1)
    const unregisterPreview = registerAnimationCelThumbnailPreviewListener(documentId, (activeCelId, activeLayerId) => {
      if (activeLayerId !== layerId || cel.id !== activeCelId) return
      const current = useWorkspace.getState().sessions.find((item) => item.document.id === documentId)
      if (!current) return
      const liveLayer = current.document.layers.find((layer) => layer.id === activeLayerId)
      if (liveLayer) draw(liveLayer, current.document.palette, cel.opacity ?? 1, true)
    })
    return () => {
      unregisterPreview()
      cancelScheduledRender?.()
    }
  }, [cel, documentHeight, documentId, documentWidth, layerId, palette, revision, storage, storageRevision, thumbnailSize, sharedCheckerboard, framing])
  return <span className={`cel-thumbnail${sharedCheckerboard ? ' shared-checkerboard' : ''}`} aria-hidden="true"><canvas ref={ref} width={thumbnailSize} height={thumbnailSize} /></span>
}

export const drawLayerMaskThumbnail = (canvas: HTMLCanvasElement, mask: LayerMask, documentWidth: number, documentHeight: number): void => {
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) return
  try {
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return
    const pixels = renderLayerMaskThumbnailPixels(documentWidth, documentHeight, canvas.width, canvas.height, mask)
    const image = context.createImageData(canvas.width, canvas.height)
    image.data.set(pixels)
    context.putImageData(image, 0, 0)
  } catch {
    // Canvas rendering is unavailable in a few test and recovery environments.
  }
}

export function LayerMaskThumbnail({ maskSource, revision, documentWidth, documentHeight, thumbnailSize }: { maskSource: PixelSource<LayerMask>; revision: number | string; documentWidth: number; documentHeight: number; thumbnailSize: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    return scheduleThumbnailRender(() => drawLayerMaskThumbnail(canvas, maskSource(), documentWidth, documentHeight))
  }, [maskSource, revision, documentWidth, documentHeight, thumbnailSize])
  return <canvas className="layer-mask-thumbnail" ref={ref} width={thumbnailSize} height={thumbnailSize} aria-hidden="true" />
}

export function ActiveLayerMaskThumbnail({ documentId, ownerId, frameId, maskSource, revision, documentWidth, documentHeight, thumbnailSize }: { documentId: string; ownerId: string; frameId: string; maskSource: PixelSource<LayerMask>; revision: number; documentWidth: number; documentHeight: number; thumbnailSize: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let cancelScheduledRender: (() => void) | null = null
    const liveSession = () => useWorkspace.getState().sessions.find((item) => item.document.id === documentId)
    const render = (): void => {
      cancelScheduledRender?.()
      cancelScheduledRender = scheduleThumbnailRender(() => {
        const canvas = ref.current
        const current = liveSession()
        const timeline = current?.document.animation
        const liveMask = timeline ? animationMaskAt(timeline, ownerId, frameId) : null
        if (canvas) drawLayerMaskThumbnail(canvas, liveMask ?? maskSource(), documentWidth, documentHeight)
      })
    }
    const belongsToActiveMaskGroup = (): boolean => {
      const current = liveSession()
      const timeline = current?.document.animation
      if (!current?.activeLayerMaskId || !timeline) return false
      return animationMaskAt(timeline, ownerId, frameId)?.id === current.activeLayerMaskId
    }
    render()
    const unregisterPreview = registerLayerMaskThumbnailPreviewListener(documentId, (activeMaskId) => {
      const current = liveSession()
      const timeline = current?.document.animation
      if (!timeline || animationMaskAt(timeline, ownerId, frameId)?.id !== activeMaskId || !belongsToActiveMaskGroup()) return
      render()
    })
    return () => {
      unregisterPreview()
      cancelScheduledRender?.()
    }
  }, [documentHeight, documentId, documentWidth, frameId, maskSource, ownerId, revision, thumbnailSize])
  return <canvas className="layer-mask-thumbnail" ref={ref} width={thumbnailSize} height={thumbnailSize} aria-hidden="true" />
}

export const useTimelineThumbnailContentSync = (documentId: string): void => {
  useEffect(() => {
    let lastContentRevision = useWorkspace.getState().sessions.find((item) => item.document.id === documentId)?.contentRevision
    return useWorkspace.subscribe((state) => {
      const current = state.sessions.find((item) => item.document.id === documentId)
      if (!current || current.contentRevision === lastContentRevision) return
      lastContentRevision = current.contentRevision
      if (current.activeLayerMaskId) {
        notifyLayerMaskThumbnailPreview(documentId, current.activeLayerMaskId)
        return
      }
      const timeline = current.document.animation
      if (!timeline) return
      const activeLayer = current.document.layers.find((layer) => layer.id === current.document.activeLayerId)
      if (!activeLayer) return
      const layerIds = activeLayer.linkedContentId
        ? current.document.layers.filter((layer) => layer.linkedContentId === activeLayer.linkedContentId).map((layer) => layer.id)
        : [activeLayer.id]
      const lookup = createAnimationCelLookup(timeline)
      for (const layerId of new Set(layerIds)) {
        const cel = lookup.resolve(lookup.at(layerId, timeline.activeFrameId))
        if (cel) notifyAnimationCelThumbnailPreview(documentId, cel.id, layerId)
      }
    })
  }, [documentId])
}

function AnimationCelContentView({ active, documentId, layerId, celSource, palette, revision, documentWidth, documentHeight, thumbnailSize, showThumbnail, selectionMarker, sharedCheckerboard = false }: {
  active: boolean
  documentId: string
  layerId: string
  celSource: PixelSource<AnimationCel>
  palette: readonly PaletteEntry[]
  revision: number
  documentWidth: number
  documentHeight: number
  thumbnailSize: number
  showThumbnail: boolean
  selectionMarker: boolean
  sharedCheckerboard?: boolean
}) {
  const cel = celSource()
  // Batch edits mutate inactive cels in place without rerendering the panel.
  // Observe each cel's storage/version so only changed previews redraw.
  const [liveRevision] = useWorkspace(useShallow((state) => {
    const storage = cel.surface ? rasterStorageIdentity(cel.surface) : null
    return [
      active ? state.sessions.find((item) => item.document.id === documentId)?.contentRevision ?? revision : revision,
      storage,
      storage ? getRasterContentRevision(storage) : 0
    ] as const
  }))
  const liveSession = active ? useWorkspace.getState().sessions.find((item) => item.document.id === documentId) : null
  const livePalette = liveSession?.document.palette ?? palette
  const hasContent = cachedCelHasContent(cel, livePalette, liveRevision)
  if (!hasContent) return null
  return showThumbnail
    ? <CelThumbnail documentId={documentId} layerId={layerId} celSource={celSource} palette={livePalette} revision={liveRevision} documentWidth={liveSession?.document.width ?? documentWidth} documentHeight={liveSession?.document.height ?? documentHeight} thumbnailSize={thumbnailSize} sharedCheckerboard={sharedCheckerboard} />
    : <span className={`cel-content-marker ${selectionMarker ? 'selection-marker' : ''}`} />
}

export const AnimationCelContent = memo(AnimationCelContentView)

export function ActiveFrameSync({ documentId, frameIds, containerRef, suppressActiveGuide, activeFrameIdOverride }: {
  documentId: string
  frameIds: readonly string[]
  containerRef: { current: HTMLDivElement | null }
  suppressActiveGuide: boolean
  activeFrameIdOverride?: string | null
}) {
  const { t } = useI18n()
  const storeActiveFrameId = useWorkspace((state) => state.sessions.find((item) => item.document.id === documentId)?.document.animation?.activeFrameId ?? frameIds[0] ?? '')
  const activeFrameId = activeFrameIdOverride ?? storeActiveFrameId
  const activeFrameIndex = Math.max(0, frameIds.indexOf(activeFrameId))
  void activeFrameId
  void activeFrameIndex
  void containerRef
  void suppressActiveGuide
  return <span>{t('timeline.frameNumber', { number: activeFrameIndex + 1 })}</span>
}
