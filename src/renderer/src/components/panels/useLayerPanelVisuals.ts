import { useMemo } from 'react'
import { deriveLayerPanelVisuals, type LayerPanelVisualOptions } from './deriveLayerPanelVisuals'
import { createLayerPanelStructure } from './layer-panel-structure'
import { createCelDragPreview } from './animation-cel-drag-preview'
import { createTimelineVisualCellCache } from '@/core/animation-timeline-cell-cache'

export function useLayerPanelVisuals(options: LayerPanelVisualOptions) {
  const {session, timeline, inlineMasks, gesture} = options
  // Region invalidations are pixel-only edits. Full/unspecified revisions can
  // also carry in-place timeline topology changes (for example link edits),
  // so they retain the existing structure invalidation contract.
  // A playback frame swap invalidates the canvas composite, but not the
  // timeline topology. Structural commands still advance layersPanelRevision.
  const topologyContentRevision = session.animationPlaying || session.contentInvalidation?.kind === 'region' ? 0 : session.contentRevision
  // Document objects mutate in place: structure revisions, not object
  // identity alone, invalidate topology after edits, undo/redo and metadata
  // changes. Pixel content revisions are handled by the cell grid below.
  const structure = useMemo(() => createLayerPanelStructure(session, timeline, inlineMasks), [
    session.document, topologyContentRevision, session.layersPanelRevision, session.collapsedGroupIds,
    timeline, timeline.cels, timeline.frames, timeline.layerMasks, timeline.groupMasks,
    session.animationPlaying, inlineMasks
  ])
  const cellStateCache = useMemo(() => createTimelineVisualCellCache(structure.visualTopology), [structure])
  const visuals = useMemo(() => deriveLayerPanelVisuals({...options, structure, cellStateCache, animationCelDropTargetKey: null}), [
    structure, session, session.revision, session.layersPanelRevision,
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
