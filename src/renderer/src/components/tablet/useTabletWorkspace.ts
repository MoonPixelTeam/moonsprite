import { useEffect, useState } from 'react'
import { loadEditorPreferences, saveEditorPreferences, type TabletPreferences } from '@/core/file-preferences'
import { resetTabletInteraction, tabletPanelMode, TABLET_INTERACTION_EVENT } from '@/core/tablet-interaction'
import { useTabletPanelGestures } from './useTabletPanelGestures'
import { applyToolIconScale } from '@/platform/ui-scale'

export function updateTabletPreferences(change: Partial<TabletPreferences>) {
  const prefs = loadEditorPreferences()
  saveEditorPreferences({ ...prefs, tablet: { ...prefs.tablet, ...change } })
  window.dispatchEvent(new Event('moonsprite:preferences-changed'))
}
export function useTabletWorkspace() {
  const [preferences, setPreferences] = useState(() => loadEditorPreferences().tablet)
  const [detected, setDetected] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches)
  useEffect(() => {
    const sync = () => setPreferences(loadEditorPreferences().tablet)
    const detect = (event: PointerEvent) => { if (event.pointerType === 'touch') setDetected(true) }
    window.addEventListener('moonsprite:preferences-changed', sync)
    window.addEventListener('pointerdown', detect, { passive: true })
    return () => { window.removeEventListener('moonsprite:preferences-changed', sync); window.removeEventListener('pointerdown', detect) }
  }, [])
  const enabled = preferences.touchUi === 'on' || (preferences.touchUi !== 'off' && detected)
  useTabletPanelGestures(enabled)
  useEffect(() => {
    document.documentElement.dataset.tabletUi = String(enabled)
    applyToolIconScale(loadEditorPreferences().toolIconScale)
    const syncMode = () => { document.documentElement.dataset.tabletPanelMode = tabletPanelMode() }
    syncMode(); window.addEventListener(TABLET_INTERACTION_EVENT, syncMode)
    if (!enabled) resetTabletInteraction()
    return () => {
      window.removeEventListener(TABLET_INTERACTION_EVENT, syncMode)
      delete document.documentElement.dataset.tabletUi
      delete document.documentElement.dataset.tabletPanelMode
      applyToolIconScale(loadEditorPreferences().toolIconScale)
    }
  }, [enabled])
  return { enabled, preferences }
}
