import type { DocumentSession } from './workspace-types'
import { antiAliasSelection } from '@/core/tools-outline'
import { isLayerEffectivelyLocked } from '@/core/document-model'
import { syncActiveAnimationFrame } from '@/core/animation'
import { activePaintLayer } from './workspace-session'
import { activeSession } from './workspace-access'
import { tr } from './workspace-translation'
import type { WorkspaceViewSelectionCommands } from './workspace-state'
import type { WorkspaceCommandContext } from './workspace-command-context'
import { commitSelectedEffectInSession, invalidateAntiAliasPreview, restoreAntiAliasPreviewState, selectedEffectTargets, selectionEffectUsesMultipleTargets, syncSelectionEffectTarget } from './workspace-selection-effects-support'

type AntiAliasCommandContext = Omit<WorkspaceCommandContext<'commitPixelEdit' | 'mutateActive'>, 'services'>

export function createSelectionAntiAliasCommands({ get, set, recording }: AntiAliasCommandContext): Pick<WorkspaceViewSelectionCommands, 'antiAliasSelection' | 'previewAntiAliasSelection' | 'restoreAntiAliasPreview'> {
  const { recordDocumentOperation } = recording
  return {
    antiAliasSelection(color, autoColorOpacity, includeInteriorColors, colorSource) {
      const session = activeSession(get())
      if (!session) return false
      if (selectionEffectUsesMultipleTargets(session)) {
        let applied = false
        get().mutateActive((active) => {
          const targets = selectedEffectTargets(active)
          if (targets.some((target) => isLayerEffectivelyLocked(active.document, target.layer))) return
          applied = Boolean(commitSelectedEffectInSession(recordDocumentOperation, active, tr('workspace.history.antiAlias'), (target) =>
            antiAliasSelection(active.document, target.layer, active.selection, color, autoColorOpacity, includeInteriorColors, colorSource)))
        }, false)
        if (!applied) set({ message: tr('workspace.outline.noContent') })
        return applied
      }
      const layer = activePaintLayer(session)
      if (isLayerEffectivelyLocked(session.document, layer)) {
        set({ message: tr('workspace.clipboard.layerLocked') })
        return false
      }
      const edit = antiAliasSelection(session.document, layer, session.selection, color, autoColorOpacity, includeInteriorColors, colorSource)
      if (!edit) {
        set({ message: tr('workspace.outline.noContent') })
        return false
      }
      get().commitPixelEdit(edit, tr('workspace.history.antiAlias'))
      return true
    },
    previewAntiAliasSelection(color, autoColorOpacity, includeInteriorColors, colorSource, previous = null) {
      const state = get()
      const changedSessions = new Set<DocumentSession>()
      if (previous) {
        const previousSession = state.sessions.find((candidate) => candidate.document.id === previous.documentId)
        if (previousSession) {
          restoreAntiAliasPreviewState(previousSession, previous)
          invalidateAntiAliasPreview(previousSession)
          changedSessions.add(previousSession)
        }
      }
      const session = activeSession(state)
      if (!session) {
        if (changedSessions.size > 0) set({ sessions: [...state.sessions] })
        return null
      }
      const targets = selectedEffectTargets(session)
      if (targets.length === 0 || targets.some((target) => isLayerEffectivelyLocked(session.document, target.layer))) {
        if (changedSessions.size > 0) set({ sessions: [...state.sessions] })
        return null
      }
      const edits = targets.flatMap((target) => {
        const edit = antiAliasSelection(session.document, target.layer, session.selection, color, autoColorOpacity, includeInteriorColors, colorSource)
        syncSelectionEffectTarget(session, target)
        if (!edit) return []
        if (target.frameId) edit.frameId = target.frameId
        return [edit]
      })
      if (edits.length === 0) {
        if (changedSessions.size > 0) set({ sessions: [...state.sessions] })
        return null
      }
      syncActiveAnimationFrame(session.document)
      invalidateAntiAliasPreview(session)
      changedSessions.add(session)
      set({ sessions: [...state.sessions] })
      return { documentId: session.document.id, edits }
    },
    restoreAntiAliasPreview(preview) {
      if (!preview) return
      const state = get()
      const session = state.sessions.find((candidate) => candidate.document.id === preview.documentId)
      if (!session) return
      restoreAntiAliasPreviewState(session, preview)
      invalidateAntiAliasPreview(session)
      set({ sessions: [...state.sessions] })
    }
  }
}
