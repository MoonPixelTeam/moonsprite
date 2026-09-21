import { activateAnimationFrame, ensureAnimationDocument, linkAnimationFrameCels, restoreAnimationCels } from '@/core/animation'
import type { DocumentSession } from './workspace-types'
import { cloneAnimationCelsForLayerIds } from './workspace-animation-clone'
import { clearAnimationItemSelection } from './workspace-animation-selection'
import { captureAnimationSelectionHistory, restoreAnimationSelectionHistory } from './workspace-animation-selection-history'
import { tr } from './workspace-translation'

/** Reuse the next frame without inserting or shifting timeline columns. */
export function linkCelsInRightFrame(session: DocumentSession, sourceFrameId: string, layerIds: string[]): boolean {
  const timeline = ensureAnimationDocument(session.document)
  const previousFrameId = timeline.activeFrameId
  const rightFrame = timeline.frames[timeline.frames.findIndex(frame => frame.id === sourceFrameId) + 1]
  if (!rightFrame) return false
  const before = cloneAnimationCelsForLayerIds(session.document, layerIds)
  const selectionBefore = captureAnimationSelectionHistory(session)
  linkAnimationFrameCels(session.document, sourceFrameId, rightFrame.id, layerIds)
  const after = cloneAnimationCelsForLayerIds(session.document, layerIds)
  activateAnimationFrame(session.document, rightFrame.id)
  clearAnimationItemSelection(session)
  session.animationPlaying = false
  session.activeLayerMaskId = null
  session.selection = null
  session.selectionPivot = null
  const selectionAfter = captureAnimationSelectionHistory(session)
  session.history.push({
    label: tr('workspace.history.addLinkedAnimationFrame'),
    bytes: [...before, ...after].reduce((sum, cel) => sum + (cel.surface?.pixels.byteLength ?? 0) + 128, 0),
    undo: () => {
      restoreAnimationCels(session.document, before)
      activateAnimationFrame(session.document, previousFrameId)
      restoreAnimationSelectionHistory(session, selectionBefore)
    },
    redo: () => {
      restoreAnimationCels(session.document, after)
      activateAnimationFrame(session.document, rightFrame.id)
      restoreAnimationSelectionHistory(session, selectionAfter)
    }
  })
  return true
}
