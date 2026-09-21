import { type HistoryEntry } from '@/core/history'
import { findLayerMask } from '@/core/document-model'
import { activateAnimationFrame } from '@/core/animation'
import { enterLayerMaskEditing, exitLayerMaskEditing } from './workspace-session'
import type { DocumentSession, TimelineActiveContext } from './workspace-types'

export type AnimationSelectionHistorySnapshot = {
  selectedLayerIds: string[]
  layerSelectionExplicit: boolean
  selectedGroupId: string | null
  selectedGroupIds: string[]
  selectedAnimationFrameIds: string[]
  animationFrameSelectionAnchorId: string | null
  selectedAnimationCellKeys: string[]
  animationCellSelectionAnchorKey: string | null
  animationCellSelectionExplicit: boolean
  selectedAnimationMaskCellKeys: string[]
  selectedAnimationMaskRowKeys: string[]
  animationMaskCellSelectionAnchorKey: string | null
  activeLayerId: string
  activeFrameId: string | null
  activeLayerMaskId: string | null
  layerMaskIsolatedView: boolean
  timelineActiveContext: TimelineActiveContext
}

export const captureAnimationSelectionHistory = (session: DocumentSession): AnimationSelectionHistorySnapshot => ({
  selectedLayerIds: [...session.selectedLayerIds],
  layerSelectionExplicit: session.layerSelectionExplicit === true,
  selectedGroupId: session.selectedGroupId,
  selectedGroupIds: [...session.selectedGroupIds],
  selectedAnimationFrameIds: [...session.selectedAnimationFrameIds],
  animationFrameSelectionAnchorId: session.animationFrameSelectionAnchorId,
  selectedAnimationCellKeys: [...session.selectedAnimationCellKeys],
  animationCellSelectionAnchorKey: session.animationCellSelectionAnchorKey,
  animationCellSelectionExplicit: session.animationCellSelectionExplicit,
  selectedAnimationMaskCellKeys: [...session.selectedAnimationMaskCellKeys],
  selectedAnimationMaskRowKeys: [...session.selectedAnimationMaskRowKeys],
  animationMaskCellSelectionAnchorKey: session.animationMaskCellSelectionAnchorKey,
  activeLayerId: session.document.activeLayerId,
  activeFrameId: session.document.animation?.activeFrameId ?? null,
  activeLayerMaskId: session.activeLayerMaskId,
  layerMaskIsolatedView: session.layerMaskIsolatedView,
  timelineActiveContext: {
    row: session.timelineActiveContext.row ? { ...session.timelineActiveContext.row } : null,
    frameId: session.timelineActiveContext.frameId,
    maskEditTargetId: session.timelineActiveContext.maskEditTargetId
  }
})

export const restoreAnimationSelectionHistory = (session: DocumentSession, snapshot: AnimationSelectionHistorySnapshot): void => {
  session.selectedLayerIds = [...snapshot.selectedLayerIds]
  session.layerSelectionExplicit = snapshot.layerSelectionExplicit === true
  session.selectedGroupId = snapshot.selectedGroupId
  session.selectedGroupIds = [...snapshot.selectedGroupIds]
  session.selectedAnimationFrameIds = [...snapshot.selectedAnimationFrameIds]
  session.animationFrameSelectionAnchorId = snapshot.animationFrameSelectionAnchorId
  session.selectedAnimationCellKeys = [...snapshot.selectedAnimationCellKeys]
  session.animationCellSelectionAnchorKey = snapshot.animationCellSelectionAnchorKey
  session.animationCellSelectionExplicit = snapshot.animationCellSelectionExplicit
  session.selectedAnimationMaskCellKeys = [...snapshot.selectedAnimationMaskCellKeys]
  session.selectedAnimationMaskRowKeys = [...snapshot.selectedAnimationMaskRowKeys]
  session.animationMaskCellSelectionAnchorKey = snapshot.animationMaskCellSelectionAnchorKey
  session.document.activeLayerId = snapshot.activeLayerId
  if (snapshot.activeFrameId) activateAnimationFrame(session.document, snapshot.activeFrameId)
  session.activeLayerMaskId = snapshot.activeLayerMaskId
  session.layerMaskIsolatedView = snapshot.layerMaskIsolatedView
  if (snapshot.activeLayerMaskId && findLayerMask(session.document, snapshot.activeLayerMaskId)) enterLayerMaskEditing(session)
  else exitLayerMaskEditing(session)
  session.timelineActiveContext = {
    row: snapshot.timelineActiveContext.row ? { ...snapshot.timelineActiveContext.row } : null,
    frameId: snapshot.timelineActiveContext.frameId,
    maskEditTargetId: snapshot.timelineActiveContext.maskEditTargetId
  }
}

export const historyEntryWithAnimationSelection = (
  session: DocumentSession,
  entry: HistoryEntry,
  before: AnimationSelectionHistorySnapshot,
  after: AnimationSelectionHistorySnapshot
): HistoryEntry => {
  const restore = (snapshot: AnimationSelectionHistorySnapshot): void => {
    restoreAnimationSelectionHistory(session, snapshot)
    // History commands invalidate content after applying the entry.
    if (entry.documentChanged !== false && entry.contentChanged !== false) {
      session.selectionGuidesPreservedAtContentRevision = session.contentRevision + 1
    }
  }
  return {
    ...entry,
    bytes: entry.bytes + 64 + (before.selectedAnimationCellKeys.length + before.selectedAnimationMaskCellKeys.length + after.selectedAnimationCellKeys.length + after.selectedAnimationMaskCellKeys.length) * 16,
    undo: () => { entry.undo(); restore(before) },
    redo: () => { entry.redo(); restore(after) }
  }
}
