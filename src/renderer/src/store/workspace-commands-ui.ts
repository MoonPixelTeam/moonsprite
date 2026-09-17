import { workspaceCommandRuntime } from './workspace-command-runtime'
import { configureLocalHistory } from './local-history-service'
import type { WorkspaceUiCommands } from './workspace-state'
import type { WorkspaceCommandContext } from './workspace-command-context'

export function createWorkspaceUiCommands({ get, set }: WorkspaceCommandContext<never>): WorkspaceUiCommands {
  return {
    dismissSaveProgress() { set({ saveProgress: null }) },

    cancelExport() { workspaceCommandRuntime.activeExportCancellation?.() },

    requestDialog(options) {
      return new Promise((resolve) => set({ dialog: { ...options, resolve } }))
    },

    resolveDialog(choice) {
      const dialog = get().dialog
      if (!dialog) return
      set({ dialog: null })
      dialog.resolve(choice)
    },

    setMessage(message) { set({ message }) },

    syncLocalHistoryPreferences() {
      for (const session of get().sessions) configureLocalHistory(session, window.moonSprite)
      set({ sessions: [...get().sessions] })
    }
  }
}
