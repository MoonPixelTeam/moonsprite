import type { RasterLayer } from '@shared/types-layer'
import type { SelectionRect } from '@shared/types-selection'
import type { SpriteDocument } from '@shared/types-document'
import { layerContentBounds } from '@/core/document-model'
import { animationCelKey, parseAnimationCelKey } from '@/core/animation'

interface CanvasMoveAnimationCellSelection {
  selectedAnimationCellKeys: readonly string[]
  selectedAnimationFrameIds: readonly string[]
  selectedLayerIds: readonly string[]
  allFrameIds?: readonly string[]
  currentFrameId: string | null | undefined
  targetLayerId: string
  moveAllSelectedLayers: boolean
  moveSelectedFramesAcrossLayers?: boolean
}

interface CanvasMoveLayerSelection {
  selectedLayerIds: readonly string[]
  selectedGroupIds: readonly string[]
  layerIdsForGroup: (groupId: string) => readonly string[]
}

export function resolveCanvasMoveLayerIds({ selectedLayerIds, selectedGroupIds, layerIdsForGroup }: CanvasMoveLayerSelection): string[] {
  const resolved = new Set(selectedLayerIds)
  for (const groupId of selectedGroupIds) for (const layerId of layerIdsForGroup(groupId)) resolved.add(layerId)
  return [...resolved]
}

export const shouldUseFreeTileInstanceMove = (activeLayerId: string, freeTileInstanceLayerId: string | null | undefined): boolean =>
  freeTileInstanceLayerId === activeLayerId

export const animationFrameIdsForCellKeys = (keys: readonly string[]): string[] => [...new Set(keys.flatMap((key) => {
  const target = parseAnimationCelKey(key)
  return target ? [target.frameId] : []
}))]

export function resolveCanvasMoveAnimationCellKeys({
  selectedAnimationCellKeys,
  selectedAnimationFrameIds,
  selectedLayerIds,
  allFrameIds,
  currentFrameId,
  targetLayerId,
  moveAllSelectedLayers,
  moveSelectedFramesAcrossLayers = false
}: CanvasMoveAnimationCellSelection): string[] {
  if (!currentFrameId) return []
  const targetKey = animationCelKey(targetLayerId, currentFrameId)
  if (moveSelectedFramesAcrossLayers && selectedAnimationFrameIds.length > 0 && selectedLayerIds.length > 0) {
    const selectedFrames = new Set(selectedAnimationFrameIds)
    return selectedLayerIds.flatMap((layerId) => allFrameIds
      ?.filter((frameId) => selectedFrames.has(frameId))
      .map((frameId) => animationCelKey(layerId, frameId)) ?? [])
  }
  // A multi-layer selection is a document-level selection. Moving it must
  // affect every animation frame, even though selecting a layer also creates
  // implicit current-frame cel selections for timeline highlighting.
  const parsedSelectedKeys = selectedAnimationCellKeys.map(parseAnimationCelKey)
  const implicitCurrentFrameLayerSelection = selectedAnimationCellKeys.length === selectedLayerIds.length
    && parsedSelectedKeys.every((parsed) => Boolean(parsed && parsed.frameId === currentFrameId && selectedLayerIds.includes(parsed.layerId)))
  if (moveAllSelectedLayers
    && selectedLayerIds.length > 0
    && (selectedAnimationCellKeys.length === 0 || implicitCurrentFrameLayerSelection)
    && (allFrameIds?.length ?? 0) > 0) {
    return selectedLayerIds.flatMap((layerId) => allFrameIds!.map((frameId) => animationCelKey(layerId, frameId)))
  }
  if (selectedAnimationCellKeys.includes(targetKey)) return [...selectedAnimationCellKeys]
  if (selectedAnimationFrameIds.length > 1) return selectedAnimationFrameIds.map((frameId) => animationCelKey(targetLayerId, frameId))
  if (moveAllSelectedLayers) return selectedLayerIds.map((layerId) => animationCelKey(layerId, currentFrameId))
  return [targetKey]
}


export interface CanvasMoveLayerContentPreview {
  layerId: string
  bounds: SelectionRect
  layerOffsetX: number
  layerOffsetY: number
}

/** Refresh on every move-tool press, including a press on the already selected cel. */
export function canvasMoveLayerContentPreview(document: SpriteDocument, layer: RasterLayer): CanvasMoveLayerContentPreview | null {
  const bounds = layerContentBounds(document, layer)
  return bounds ? { layerId: layer.id, bounds, layerOffsetX: layer.offsetX, layerOffsetY: layer.offsetY } : null
}
