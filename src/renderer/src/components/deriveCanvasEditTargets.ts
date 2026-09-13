import type { FreeTileInstance } from '@shared/types-tiles'
import type { SelectionRect } from '@shared/types-selection'
import { getLayerIdsInGroup, isLayerEffectivelyLocked, isLayerEffectivelyVisible } from '@/core/document-model'
import { type DocumentSession } from '@/store/workspace'
import {
  activeLayerMask,
  activePaintLayer,
  isToolAvailableForSession,
  selectedTransformLayersAreEditable,
  selectedTransformLayersForSession
} from '@/store/workspace-session'
import { resolveCanvasMoveLayerIds } from '@/components/canvas-move-selection'
interface Ports {
  readonly session: DocumentSession
  readonly selectedFreeTileSelectionTarget: (current?: DocumentSession) => {
    target: import('@/core/free-tile-document').FreeTileCelTarget
    instance: FreeTileInstance
    source: import('@/core/free-tile').FreeTileSourceRef
    bounds: SelectionRect
  } | null
}

export function deriveCanvasEditTargets(ports: Ports) {
  const selectedLayerMask = activeLayerMask(ports.session)

  const groupSelectionActive = ports.session.selectedGroupIds.length > 0 || Boolean(ports.session.selectedGroupId)

  const hasSelectedRasterLayer =
    Boolean(selectedLayerMask) ||
    (ports.session.selectedGroupIds.length === 0 && ports.session.selectedLayerIds.some((id) => ports.session.document.layers.some((layer) => layer.id === id)))

  const activeLayer = activePaintLayer(ports.session)

  const activeFreeTileSelectionTarget = ports.selectedFreeTileSelectionTarget()

  // A frame selection uses explicitly selected layers when present. With no
  // explicit layer selection, selectedTransformLayersForSession retains the
  // timeline-wide behavior and targets every editable raster layer.
  const selectedTransformLayers = selectedTransformLayersForSession(ports.session)

  const animationFrameSelectionActive = ports.session.selectedAnimationFrameIds.length > 0

  const animationCellSelectionActive = ports.session.selectedAnimationCellKeys.length > 0

  const multipleAnimationSelection = animationFrameSelectionActive || animationCellSelectionActive

  const selectionLayersEditable = multipleAnimationSelection
    ? !selectedLayerMask &&
      selectedTransformLayers.length > 0 &&
      selectedTransformLayers.every(
        (layer) => !layer.kind && isLayerEffectivelyVisible(ports.session.document, layer) && !isLayerEffectivelyLocked(ports.session.document, layer)
      )
    : selectedTransformLayersAreEditable(ports.session, selectedTransformLayers) &&
      (activeLayer.kind !== 'free-tile' || (ports.session.freeTileMode === 'edit' && Boolean(activeFreeTileSelectionTarget)))

  // Creating a canvas selection is independent from transforming a timeline
  // selection. Tilemap layers always have a cel selected by default, so the
  // timeline transform guard must not disable the marquee tool itself.
  const tilemapSelectionCreationAllowed =
    ports.session.tool === 'selection' &&
    activeLayer.kind === 'tilemap' &&
    isLayerEffectivelyVisible(ports.session.document, activeLayer) &&
    !isLayerEffectivelyLocked(ports.session.document, activeLayer)

  const selectionInteractionEditable = ports.session.tool === 'selection' ? selectionLayersEditable || tilemapSelectionCreationAllowed : false

  const selectedCanvasMoveLayerIds = resolveCanvasMoveLayerIds({
    selectedLayerIds: ports.session.selectedLayerIds,
    selectedGroupIds: ports.session.selectedGroupIds,
    layerIdsForGroup: (groupId) => getLayerIdsInGroup(ports.session.document, groupId)
  })

  const hasSelectedMovableLayer = Boolean(selectedLayerMask)
    ? isLayerEffectivelyVisible(ports.session.document, activeLayer) && !isLayerEffectivelyLocked(ports.session.document, activeLayer)
    : selectedCanvasMoveLayerIds.some((id) => {
        const layer = ports.session.document.layers.find((candidate) => candidate.id === id)
        return Boolean(layer && isLayerEffectivelyVisible(ports.session.document, layer) && !isLayerEffectivelyLocked(ports.session.document, layer))
      })

  const activeLayerEditable =
    hasSelectedRasterLayer &&
    isLayerEffectivelyVisible(ports.session.document, activeLayer) &&
    !isLayerEffectivelyLocked(ports.session.document, activeLayer) &&
    isToolAvailableForSession(ports.session, ports.session.tool)
  return {
    groupSelectionActive,
    hasSelectedRasterLayer,
    activeLayer,
    selectedTransformLayers,
    multipleAnimationSelection,
    selectionLayersEditable,
    tilemapSelectionCreationAllowed,
    selectionInteractionEditable,
    hasSelectedMovableLayer,
    activeLayerEditable
  }
}
