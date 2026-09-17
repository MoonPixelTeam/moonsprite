import { readAppWindowLayout } from '@/platform/app-window'
import { loadMainWindowState, saveMainWindowState } from '@/core/workspace-layout-preferences'

export const persistMainWindowState = async (notifyWorkspaceLayout = true): Promise<void> => {
  const current = await readAppWindowLayout()
  if (!current) return
  const previous = loadMainWindowState()
  if (current.maximized && previous) {
    saveMainWindowState({ ...previous, maximized: true })
    if (notifyWorkspaceLayout) window.dispatchEvent(new Event('moonsprite-workspace-layout-change'))
    return
  }
  if (current.maximized) {
    if (notifyWorkspaceLayout) window.dispatchEvent(new Event('moonsprite-workspace-layout-change'))
    return
  }
  saveMainWindowState(current)
  if (notifyWorkspaceLayout) window.dispatchEvent(new Event('moonsprite-workspace-layout-change'))
}
