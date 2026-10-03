import { useMemo } from 'react'
import { deriveLayerPanelVisuals, type LayerPanelVisualOptions } from './deriveLayerPanelVisuals'
import { createLayerPanelStructure } from './layer-panel-structure'
import { createCelDragPreview } from './animation-cel-drag-preview'
import { createTimelineVisualCellCache } from '@/core/animation-timeline-cell-cache'

export function useLayerPanelVisuals(options: LayerPanelVisualOptions) {
  const {session, timeline, inlineMasks, gesture} = options
  // Document objects and timeline arrays are mutated in place. Rebuilding the
  // complete row×frame topology from the content revision made every brush
  // stroke pay for all timeline slots again. Build a small topology key from
  // the fields that actually affect panel structure/link geometry; pixel-only
  // edits keep the existing structure and update their thumbnails through the
  // cell content revision instead.
  const topologyKey = [
    inlineMasks ? 'inline' : 'rows',
    session.collapsedGroupIds.join('\u0000'),
    session.document.layers.map((layer) => `${layer.id}:${layer.groupId ?? ''}:${layer.kind}:${layer.freeTileSetId ?? ''}:${layer.freeTileSources?.length ?? 0}`).join('\u0001'),
    session.document.groups.map((group) => `${group.id}:${group.parentGroupId ?? ''}`).join('\u0001'),
    timeline.frames.map((frame) => frame.id).join('\u0001'),
    timeline.cels.map((cel) => `${cel.id}:${cel.layerId}:${cel.frameId}:${cel.linkedCelId ?? ''}`).join('\u0001'),
    (timeline.layerMasks ?? []).map((entry) => `${entry.layerId}:${entry.frameId}:${entry.mask.id}:${entry.mask.linkedMaskId ?? ''}`).join('\u0001'),
    (timeline.groupMasks ?? []).map((entry) => `${entry.groupId}:${entry.frameId}:${entry.mask.id}:${entry.mask.linkedMaskId ?? ''}`).join('\u0001')
  ].join('\u0002')
  const structure = useMemo(() => createLayerPanelStructure(session, timeline, inlineMasks), [session.document, timeline, topologyKey])
  const cellStateCache = useMemo(() => createTimelineVisualCellCache(structure.visualTopology), [structure])
  const visuals = useMemo(() => deriveLayerPanelVisuals({...options, structure, cellStateCache, animationCelDropTargetKey: null}), [
    // Pixel revisions are intentionally absent here. The derived flags and
    // link geometry are unchanged by a brush stroke; rendered cells observe
    // their live raster revision separately. Keeping the session object or
    // revision in this list rebuilt every row×frame state on every stroke.
    structure,
    session.document.activeLayerId, timeline.activeFrameId, session.activeLayerMaskId,
    session.animationCellSelectionExplicit, session.animationPlaying, session.layerMaskIsolatedView,
    session.layerSelectionExplicit, session.selectedAnimationCellKeys, session.selectedAnimationFrameIds,
    session.selectedAnimationMaskCellKeys, session.selectedAnimationMaskRowKeys, session.selectedGroupId,
    session.selectedGroupIds, session.selectedLayerIds, options.timelineActiveContext,
    options.animationGestureActiveTarget, options.animationGestureSelection, options.selectionOutlineVisible,
    options.selectedAnimationGroupCellKeys, gesture?.kind, options.animationCellSelectionOutlineVisible
  ])
  const previewAt = useMemo(() => createCelDragPreview(structure.displayRows, timeline.frames, gesture, options.animationCelDragAnchorKey),
    [structure, gesture, options.animationCelDragAnchorKey])
  const preview = previewAt(options.animationCelDropTargetKey)
  return preview ? {...visuals, animationCelDragPreview: preview, animationCelDragActive: true, animationCelSelectionBoxes: [preview]} : visuals
}
