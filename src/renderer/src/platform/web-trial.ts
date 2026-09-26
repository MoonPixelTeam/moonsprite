import { createBrowserApi } from './browser-api'
import { useWorkspace } from '@/store/workspace'

export async function installTauriApi(): Promise<void> {
  if (window.moonSprite) return
  window.moonSprite = createBrowserApi()
  document.documentElement.dataset.productTarget = 'web-trial'
  window.addEventListener('beforeunload', (event) => {
    if (!useWorkspace.getState().sessions.some((session) => session.document.dirty)) return
    event.preventDefault()
    event.returnValue = ''
  })
}
