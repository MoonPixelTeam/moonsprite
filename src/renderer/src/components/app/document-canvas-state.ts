import type { DocumentSession } from '@/store/workspace-types'

/** Small immutable snapshot; pixel buffers and entire documents never become render keys. */
export const canvasSessionRenderState = (session: DocumentSession | undefined): readonly unknown[] => session ? [
  session,
  session.document,
  session.uiRevision,
  session.revision,
  session.contentRevision,
  session.layersPanelRevision,
  session.document.activeLayerId,
  session.document.animation?.activeFrameId,
  session.animationPlaying,
  session.selectedLayerIds.join('\0'),
  session.selectedGroupIds.join('\0'),
  session.selectedAnimationCellKeys.join('\0'),
  session.selectedAnimationFrameIds.join('\0'),
  session.activeLayerMaskId,
  session.layerMaskIsolatedView,
  session.selection,
  session.pendingPaste,
  session.tool,
  session.brushSize,
  session.view.zoom,
  session.view.panX,
  session.view.panY,
  session.view.rotation
] : []
