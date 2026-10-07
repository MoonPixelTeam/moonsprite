import { animationCelKey } from '@/core/animation'
import { getRasterContentRevision } from '@/core/document-model'
import { rasterStorageIdentity } from '@/core/runtime-raster'
import { timelineCellSlotKey, timelineRowKey } from '@/core/animation-timeline-identity'
import type { LayerTimelineCellsProps as Props } from './layer-timeline-cell-types'

export const sameTimelineCellState = (a: readonly unknown[], b: readonly unknown[]): boolean =>
  a.length === b.length && a.every((value, index) => Object.is(value, b[index]))

/** Copy mutable document revision values; never compare an old session object in place. */
export function timelineCellRenderScope(p: Props): readonly unknown[] {
  return [p.session.document.id, p.session.layersPanelRevision,
    p.session.document.width, p.session.document.height, p.session.document.palette, p.t,
    p.showCelThumbnails, p.celThumbnailSize, p.showLinkedCelVisuals, p.showLinkedVisuals,
    p.timelineVisualState.selectionGuidesVisible, p.selectionOutlineVisible, p.animationCelDragActive,
    p.focusState.frameFocus, p.maskVisualSelectionActive, p.groupVisualSelectionActive,
    p.ordinaryCelSelectionVisible, p.suppressCellSelectionGuides, p.hasNonRowAnimationItemSelection,
    p.onlyImplicitLayerCellSelection, p.explicitMultiLayerSelection, p.session.layerSelectionExplicit,
    p.selectedCellTargets.length > 0, p.renderedCellKeys.length === 0,
    Boolean(p.animationCelDragAnchorKey && p.draggingAnimationCellKeys.length > 1)]
}

export function timelineCellRenderState(p: Props, row: Props['displayRows'][number], frameId: string, index: number,
  scope: readonly unknown[], draggingFrames: ReadonlySet<string>, draggingCells: ReadonlySet<string>): readonly unknown[] | null {
  // Mask cells retain their full renderer, including isolated-mask controls.
  if (row.kind !== 'node') return null
  if (row.node.kind === 'group') {
    const groupId = row.node.group.id
    const key = animationCelKey(groupId, frameId)
    const visualRow = p.visualRowStateByKey.get(timelineRowKey({kind: 'group', ownerKind: 'group', ownerId: row.node.id}))
    const frame = p.visualFrameStateById.get(frameId)
    return [scope, index, groupId, frameId, visualRow?.active, visualRow?.selected,
      frame?.active, frame?.selected, p.session.animationPlaying,
      p.selectedAnimationGroupCellKeySet.has(key), p.animationCelDropTargetKey === key]
  }
  const layerId = row.node.layer.id
  const key = animationCelKey(layerId, frameId)
  const cel = p.celLookup.resolve(p.celLookup.at(layerId, frameId))
  const storage = cel?.surface ? rasterStorageIdentity(cel.surface) : null
  const cell = p.visualCellStateAtSlot(timelineCellSlotKey({kind: 'cel', ownerKind: 'layer', ownerId: layerId, frameId}))
  const visualRow = p.visualRowStateByKey.get(timelineRowKey({kind: 'layer', ownerKind: 'layer', ownerId: layerId}))
  const frame = p.visualFrameStateById.get(frameId)
  const contentRevision = p.renderedCellKeySet.has(key) ||
    (p.session.document.activeLayerId === layerId && p.timeline.activeFrameId === frameId)
    ? (p.activeContentRevision ?? p.session.contentRevision)
    : 0
  return [scope, index, layerId, frameId, row.node.layer.name, row.node.layer.kind,
    visualRow?.selected, frame?.active, frame?.selected,
    cell?.current, cell?.selectedVisible, cell?.selectedByFrame, cell?.selectedByLayer, cell?.link.selectedByFrameVisible,
    p.selectedCellLayerIds.has(layerId), p.selectedCellFrameIds.has(frameId),
    p.playbackActiveLayerId === layerId, p.visualActiveLayerId === layerId, p.renderedCellKeySet.has(key),
    p.linkedCelMemberKeys.has(`cel|${key}`), p.linkedCelBridgeEndKeys.has(`cel|${key}`), p.selectedLinkedCelMemberKeys.has(`cel|${key}`),
    draggingFrames.has(frameId), p.draggingAnimationCellKind === 'cel' && draggingCells.has(key),
    !p.animationCelDragActive && p.animationCelDropTargetKey === key,
    contentRevision, cel, cel?.surface, storage, storage ? getRasterContentRevision(storage) : 0]
}


/** Overlay-only movement does not change the grid's cells or event dispatchers. */
export function timelineGridRenderState(p: Props, scope: readonly unknown[]): readonly unknown[] {
  return [scope, p.timeline, p.timeline.frames, p.displayRows, p.visualRowStateByKey, p.visualFrameStateById,
    p.timelineVisualState, p.visualCellStateAtSlot, p.maskVisualByOwnerFrame, p.linkedMaskSlotVisuals,
    p.linkedCelMemberKeys, p.selectedLinkedCelMemberKeys, p.linkedCelBridgeEndKeys,
    p.visualSelectedFrameIdSet, p.visualSelectedMaskCellKeySet, p.renderedCellKeySet,
    p.selectedCellFrameIds, p.selectedMaskCellFrameIds, p.selectedActivityFrameIds,
    p.selectedCellLayerIds, p.selectedMaskActivityLayerIds, p.focusState,
    p.frameSelectionActiveForOutline, p.cellSelectionActive, p.showActiveFrameColumn, p.altCopyReady,
    p.visualActiveLayerId, p.playbackActiveLayerId, p.renderedFrameIds,
    p.draggingAnimationCellKind, p.draggingAnimationCellKeys, p.draggingAnimationFrameIds,
    p.animationCelDragActive ? null : p.animationCelDropTargetKey, p.animationCelDragAnchorKey,
    [...p.selectedAnimationGroupCellKeySet].join('\0'),
    p.session.document.activeLayerId, p.session.activeLayerMaskId, p.session.layerMaskIsolatedView,
    p.session.animationPlaying, p.session.selectedAnimationMaskRowKeys, p.session.selectedLayerIds,
    p.session.selectedAnimationFrameIds, p.activeContentRevision ?? 0]
}
