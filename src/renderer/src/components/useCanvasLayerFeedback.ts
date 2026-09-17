import { useEffect, useRef } from 'react'
import type { RasterLayer } from '@shared/types-layer'
import type { SelectionRect } from '@shared/types-selection'
import {
  cachedLayerContentBounds,
  isLayerEffectivelyLocked,
  isLayerEffectivelyVisible,
  layerContentBounds,
  readLayerVisibleColorAt
} from '@/core/document-model'
import { DEFAULT_GRID_SETTINGS, snapSelectionTranslationToGrid } from '@/core/grid'
import { alignmentThresholdForZoom, resolveAlignment } from '@/core/alignment'
import { useWorkspace, type DocumentSession } from '@/store/workspace'
import { type CanvasDragState as DragState, type CanvasPoint as Point } from '@/core/canvas-input'
import { CanvasClickFlashCache } from './canvas-click-flash'
import { canvasMoveLayerContentPreview } from '@/components/canvas-move-selection'
import { layerIdsInVisualStackOrder } from '@/core/layer-panel-layout'
import { FREE_TILE_INSTANCE_FLASH_EVENT, type FreeTileInstanceFlashDetail } from '@/components/free-tile-instance-events'
import { MoveLayerContentPreview, MoveLayerClickFlash, FreeTileInstanceFlash } from './canvas-stage-helpers'
interface Ports {
  readonly session: DocumentSession
  readonly moveLayerClickFlashEnabled: boolean
  readonly moveLayerClickFlashDuration: import('@/core/file-preferences').MoveLayerClickFlashDuration
  readonly scheduleDraw: () => void
  readonly alignmentPreferences: {
    gridAlignmentEnabled: boolean
    smartAlignmentEnabled: boolean
    alignmentGuidesVisible: boolean
    alignmentThreshold: number
  }
  readonly liveViewRef: import('react').RefObject<import('@shared/types-view').ViewState>
  readonly moveLayerContentPreviewEnabled: boolean
}

export function useCanvasLayerFeedback(ports: Ports) {
  const moveLayerContentPreviewRef = useRef<MoveLayerContentPreview | null>(null)

  const moveLayerContentPreviewTimerRef = useRef<number | null>(null)

  const clickFlashCacheRef = useRef(new CanvasClickFlashCache())

  const moveLayerClickFlashRef = useRef<MoveLayerClickFlash | null>(null)

  const moveLayerClickFlashTimerRef = useRef<number | null>(null)

  const freeTileInstanceFlashRef = useRef<FreeTileInstanceFlash | null>(null)

  const freeTileInstanceFlashTimerRef = useRef<number | null>(null)

  const layerHitOrderCacheRef = useRef<{ document: object; revision: number; order: string[]; layers: Map<string, RasterLayer> } | null>(null)

  useEffect(() => {
    moveLayerContentPreviewRef.current = null
    clickFlashCacheRef.current.clear()
    moveLayerClickFlashRef.current = null
    freeTileInstanceFlashRef.current = null
    if (moveLayerContentPreviewTimerRef.current !== null) window.clearTimeout(moveLayerContentPreviewTimerRef.current)
    moveLayerContentPreviewTimerRef.current = null
    if (moveLayerClickFlashTimerRef.current !== null) window.clearTimeout(moveLayerClickFlashTimerRef.current)
    moveLayerClickFlashTimerRef.current = null
    if (freeTileInstanceFlashTimerRef.current !== null) window.clearTimeout(freeTileInstanceFlashTimerRef.current)
    freeTileInstanceFlashTimerRef.current = null
    return () => {
      clickFlashCacheRef.current.clear()
      if (moveLayerContentPreviewTimerRef.current !== null) window.clearTimeout(moveLayerContentPreviewTimerRef.current)
      if (moveLayerClickFlashTimerRef.current !== null) window.clearTimeout(moveLayerClickFlashTimerRef.current)
      if (freeTileInstanceFlashTimerRef.current !== null) window.clearTimeout(freeTileInstanceFlashTimerRef.current)
    }
  }, [ports.session.document.id])

  useEffect(() => {
    const flashInstance = (event: Event): void => {
      const detail = (event as CustomEvent<FreeTileInstanceFlashDetail>).detail
      if (!ports.moveLayerClickFlashEnabled || !detail || detail.documentId !== ports.session.document.id) return
      if (freeTileInstanceFlashTimerRef.current !== null) window.clearTimeout(freeTileInstanceFlashTimerRef.current)
      freeTileInstanceFlashRef.current = { instanceId: detail.instanceId, expiresAt: performance.now() + ports.moveLayerClickFlashDuration }
      ports.scheduleDraw()
      freeTileInstanceFlashTimerRef.current = window.setTimeout(() => {
        freeTileInstanceFlashRef.current = null
        freeTileInstanceFlashTimerRef.current = null
        ports.scheduleDraw()
      }, ports.moveLayerClickFlashDuration)
    }
    window.addEventListener(FREE_TILE_INSTANCE_FLASH_EVENT, flashInstance)
    return () => window.removeEventListener(FREE_TILE_INSTANCE_FLASH_EVENT, flashInstance)
  }, [ports.moveLayerClickFlashDuration, ports.session.document.id])

  const topEditableLayerAt = (point: Point) => {
    const currentSession = useWorkspace.getState().sessions.find((item) => item.document.id === ports.session.document.id) ?? ports.session
    const cached = layerHitOrderCacheRef.current
    const hitCache =
      cached && cached.document === currentSession.document && cached.revision === currentSession.revision
        ? cached
        : (() => {
            const next = {
              document: currentSession.document,
              revision: currentSession.revision,
              order: layerIdsInVisualStackOrder(currentSession.document.layers, currentSession.document.groups),
              layers: new Map(currentSession.document.layers.map((layer) => [layer.id, layer]))
            }
            layerHitOrderCacheRef.current = next
            return next
          })()
    for (const layerId of hitCache.order) {
      const layer = hitCache.layers.get(layerId)
      if (!layer) continue
      if (!isLayerEffectivelyVisible(currentSession.document, layer) || isLayerEffectivelyLocked(currentSession.document, layer)) continue
      const bounds = cachedLayerContentBounds(currentSession.document, layer)
      if (
        bounds !== undefined &&
        (!bounds || point.x < bounds.x || point.y < bounds.y || point.x >= bounds.x + bounds.width || point.y >= bounds.y + bounds.height)
      )
        continue
      if (readLayerVisibleColorAt(currentSession.document, layer, point.x, point.y).a > 0) return layer
    }
    return null
  }

  const alignmentTargetBoundsForLayers = (excludedLayerIds: readonly string[] = []): SelectionRect[] => {
    const excluded = new Set(excludedLayerIds)
    return ports.session.document.layers.flatMap((layer) => {
      if (excluded.has(layer.id) || !isLayerEffectivelyVisible(ports.session.document, layer)) return []
      const bounds = layerContentBounds(ports.session.document, layer)
      return bounds ? [bounds] : []
    })
  }

  const alignmentDragFields = (movingBounds: readonly SelectionRect[], excludedLayerIds: readonly string[] = [], snapToGridOrigin = false) => ({
    alignmentMovingBounds: movingBounds.map((bounds) => ({ ...bounds })),
    alignmentTargetBounds: ports.alignmentPreferences.smartAlignmentEnabled ? alignmentTargetBoundsForLayers(excludedLayerIds) : [],
    alignmentGridEnabled: ports.alignmentPreferences.gridAlignmentEnabled,
    alignmentSnapToGridOrigin: snapToGridOrigin,
    alignmentSmartEnabled: ports.alignmentPreferences.smartAlignmentEnabled,
    alignmentThreshold: ports.alignmentPreferences.alignmentThreshold
  })

  const sameAlignmentGuides = (left: DragState['alignmentGuides'], right: DragState['alignmentGuides']): boolean => {
    if ((left?.length ?? 0) !== (right?.length ?? 0)) return false
    return (left ?? []).every((guide, index) => {
      const candidate = right?.[index]
      return Boolean(candidate && candidate.axis === guide.axis && candidate.position === guide.position && candidate.source === guide.source)
    })
  }

  const alignedDragTranslation = (drag: DragState, distance: Point): Point => {
    const gridEnabled = drag.alignmentGridEnabled === true && ports.session.view.showGrid
    const snappedDistance =
      drag.alignmentSnapToGridOrigin && gridEnabled
        ? snapSelectionTranslationToGrid(drag.alignmentMovingBounds ?? [], distance, ports.session.view.grid ?? DEFAULT_GRID_SETTINGS)
        : distance
    const result = resolveAlignment({
      movingBounds: drag.alignmentMovingBounds ?? [],
      targetBounds: drag.alignmentTargetBounds,
      delta: snappedDistance,
      canvasWidth: ports.session.document.width,
      canvasHeight: ports.session.document.height,
      grid: ports.session.view.grid ?? DEFAULT_GRID_SETTINGS,
      gridEnabled: drag.alignmentSnapToGridOrigin ? false : gridEnabled,
      smartEnabled: drag.alignmentSmartEnabled === true,
      threshold: alignmentThresholdForZoom(drag.alignmentThreshold ?? ports.alignmentPreferences.alignmentThreshold, ports.liveViewRef.current.zoom),
      lockedAxis: drag.axisLock
    })
    if (!sameAlignmentGuides(drag.alignmentGuides, result.guides)) {
      drag.alignmentGuides = result.guides
      ports.scheduleDraw()
    }
    return result.offset
  }

  const hideMoveLayerContentPreview = (delayMs = 0): void => {
    if (moveLayerContentPreviewTimerRef.current !== null) window.clearTimeout(moveLayerContentPreviewTimerRef.current)
    moveLayerContentPreviewTimerRef.current = null
    if (!moveLayerContentPreviewRef.current) return
    if (delayMs > 0) {
      moveLayerContentPreviewTimerRef.current = window.setTimeout(() => {
        moveLayerContentPreviewRef.current = null
        moveLayerContentPreviewTimerRef.current = null
        ports.scheduleDraw()
      }, delayMs)
      return
    }
    moveLayerContentPreviewRef.current = null
    ports.scheduleDraw()
  }

  const showMoveLayerContentPreview = (layer: RasterLayer): void => {
    if (!ports.moveLayerContentPreviewEnabled) return
    if (moveLayerContentPreviewTimerRef.current !== null) window.clearTimeout(moveLayerContentPreviewTimerRef.current)
    moveLayerContentPreviewTimerRef.current = null
    const currentSession = useWorkspace.getState().sessions.find((item) => item.document.id === ports.session.document.id) ?? ports.session
    const currentLayer = currentSession.document.layers.find((item) => item.id === layer.id)
    moveLayerContentPreviewRef.current = currentLayer ? canvasMoveLayerContentPreview(currentSession.document, currentLayer) : null
    ports.scheduleDraw()
  }

  const flashMoveLayer = (layer: RasterLayer): void => {
    if (!ports.moveLayerClickFlashEnabled) return
    const cachedBounds = cachedLayerContentBounds(ports.session.document, layer)
    const bounds = cachedBounds === null ? null : (cachedBounds ?? { x: layer.offsetX, y: layer.offsetY, width: layer.width, height: layer.height })
    if (!bounds) return
    if (moveLayerClickFlashTimerRef.current !== null) window.clearTimeout(moveLayerClickFlashTimerRef.current)
    moveLayerClickFlashRef.current = {
      layerId: layer.id,
      bounds,
      layerOffsetX: layer.offsetX,
      layerOffsetY: layer.offsetY,
      duration: ports.moveLayerClickFlashDuration,
      expiresAt: null
    }
    moveLayerClickFlashTimerRef.current = null
    ports.scheduleDraw()
  }
  return {
    moveLayerContentPreviewRef,
    moveLayerContentPreviewTimerRef,
    clickFlashCacheRef,
    moveLayerClickFlashRef,
    moveLayerClickFlashTimerRef,
    freeTileInstanceFlashRef,
    topEditableLayerAt,
    alignmentDragFields,
    alignedDragTranslation,
    hideMoveLayerContentPreview,
    showMoveLayerContentPreview,
    flashMoveLayer
  }
}
