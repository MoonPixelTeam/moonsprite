import { useEffect, useState } from 'react'
import type { WorkspacePanelId } from '@shared/types-workspace'
import { loadEditorPreferences, saveEditorPreferences, type TabletPreferences } from '@/core/file-preferences'

export function updateTabletPreferences(change: Partial<TabletPreferences>) {
  const prefs = loadEditorPreferences()
  saveEditorPreferences({ ...prefs, tablet: { ...prefs.tablet, ...change } })
  window.dispatchEvent(new Event('moonsprite:preferences-changed'))
}

/** Only controls initial panel visibility. All panel interaction stays shared. */
export function useTabletWorkspace(setVisible: (id: WorkspacePanelId, visible: boolean) => void) {
  const [mode, setMode] = useState(() => loadEditorPreferences().tablet.assistPanel)
  useEffect(() => {
    const sync = () => setMode(loadEditorPreferences().tablet.assistPanel)
    window.addEventListener('moonsprite:preferences-changed', sync)
    return () => window.removeEventListener('moonsprite:preferences-changed', sync)
  }, [])
  useEffect(() => {
    if (mode !== 'auto') { setVisible('tabletAssist', mode === 'on'); return }
    // Consume detection once so manually closing the panel remains effective.
    const detect = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') return
      window.removeEventListener('pointerdown', detect, true)
      setVisible('tabletAssist', true)
    }
    window.addEventListener('pointerdown', detect, { capture: true, passive: true })
    return () => window.removeEventListener('pointerdown', detect, true)
  }, [mode, setVisible])
}
