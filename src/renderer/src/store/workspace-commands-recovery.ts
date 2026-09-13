import { loadEditorPreferences } from '@/core/file-preferences'
import type { WorkspaceRecoveryCommands } from './workspace-state'
import type { WorkspaceCommandContext } from './workspace-command-context'

import { tr } from './workspace-translation'

export function createWorkspaceRecoveryCommands({ get, set , services: { recoveryService } }: WorkspaceCommandContext<'addSession', 'recoveryService'>): WorkspaceRecoveryCommands {
  return {
    async restoreRecoveries() {
      try {
        const recoveries = await recoveryService.list(window.moonSprite, loadEditorPreferences().recoveryRetentionDays)
        set({ recoveryRecords: recoveries })
      } catch {
        set({ recoveryRecords: [], message: tr('workspace.recovery.readError') })
      }
    },

    async restoreRecovery(id) {
      const record = get().recoveryRecords.find((item) => item.id === id)
      if (!record) return false
      try {
        const document = await recoveryService.restore(window.moonSprite, record)
        get().addSession(document, { recoveryOriginId: record.id })
        set({ message: tr('workspace.recovery.restored', { name: record.name }) })
        return true
      } catch {
        set({ message: tr('workspace.recovery.restoreError', { name: record.name }) })
        return false
      }
    },

    async autosaveDirty() {
      const dirty = get().sessions
        .filter((session) => session.document.dirty && !session.recoverySuppressed)
        .map((session) => ({ id: session.recoveryOriginId ?? session.document.id, document: session.document }))
      try {
        await recoveryService.autosave(window.moonSprite, dirty)
      } catch (error) {
        console.error('MoonSprite recovery autosave failed', error)
        set({ message: tr('workspace.recovery.autosaveError') })
      }
    },

    async discardRecovery(id) {
      const session = get().sessions.find((item) => item.document.id === id || item.recoveryOriginId === id)
      if (session) {
        session.recoverySuppressed = true
        set({ sessions: [...get().sessions] })
      }
      try {
        await recoveryService.discard(window.moonSprite, id)
        set((state) => {
          const recoveredSession = state.sessions.find((item) => item.recoveryOriginId === id)
          if (recoveredSession) recoveredSession.recoveryOriginId = null
          return {
            recoveryRecords: state.recoveryRecords.filter((item) => item.id !== id),
            ...(recoveredSession ? { sessions: [...state.sessions] } : {})
          }
        })
      } catch (error) {
        console.error('MoonSprite recovery discard failed', error)
        set({ message: tr('workspace.recovery.discardError') })
      }
    }
  }
}
