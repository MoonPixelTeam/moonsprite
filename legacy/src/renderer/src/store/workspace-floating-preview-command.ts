import type { WorkspaceCommandContext } from './workspace-command-context'
import type { WorkspaceViewSelectionCommands } from './workspace-state'
import { cloneSelectionMask } from './workspace-session'
import { clearFloatingSelectionBoxHistory, syncFloatingPrimaryLayerState } from './workspace-view-selection-helpers'
import { cloneSelectionQuad } from './workspace-selection-transform-geometry'
import { markFloatingOverlayChanged, markFloatingPreviewChanged } from './workspace-floating-preview'

/** Update the visible floating transform without recording a document edit. */
export function createFloatingPreviewCommand(
  get: WorkspaceCommandContext<'mutateActive'>['get']
): WorkspaceViewSelectionCommands['updateFloatingPastePreview'] {
  return (edit, target, translationPreview = null, transformTarget, transformAngle, transformShear, previewDeferred = false, layers, transformQuad) => {
    get().mutateActive((session) => {
      if (!session.pendingPaste) return
      session.pendingPaste.restoredFromDeselect = false
      const previousTarget = session.pendingPaste.target
      clearFloatingSelectionBoxHistory(session.pendingPaste)
      if (layers) session.pendingPaste.layers = layers
      session.pendingPaste.previewEdit = edit
      session.pendingPaste.translationPreview = translationPreview
      session.pendingPaste.previewDeferred = session.pendingPaste.layers?.length ? false : previewDeferred
      session.pendingPaste.target = cloneSelectionMask(target)!
      if (transformTarget) session.pendingPaste.transformTarget = { ...transformTarget }
      else if ((session.pendingPaste.transformAngle ?? 0) % 360 === 0 && !session.pendingPaste.transformShear) {
        session.pendingPaste.transformTarget = {
          x: target.x,
          y: target.y,
          width: target.width,
          height: target.height
        }
      }
      if (transformAngle !== undefined) session.pendingPaste.transformAngle = transformAngle
      if (transformShear !== undefined) session.pendingPaste.transformShear = { ...transformShear }
      else if (transformAngle !== undefined) session.pendingPaste.transformShear = undefined
      if (transformQuad !== undefined) session.pendingPaste.transformQuad = cloneSelectionQuad(transformQuad) ?? undefined
      syncFloatingPrimaryLayerState(session.pendingPaste)
      session.selection = cloneSelectionMask(target)
      if (session.pendingPaste.previewDeferred) markFloatingOverlayChanged(session)
      else markFloatingPreviewChanged(session, previousTarget, target)
    }, false)
  }
}
