import { useEffect, useState } from 'react'
import { ISO_VIEW_PREFERENCES_PREVIEW_EVENT, loadEditorPreferences, parseIsoViewPreferences, type IsoViewPreferences } from '@/core/file-preferences'

/** One owner for the persisted canvas preference snapshot and transient iso preview.
 * Consumers receive values, never individual preference setters. */
export function useCanvasPreferences() {
  const [preferences, setPreferences] = useState(loadEditorPreferences)
  useEffect(() => {
    const refresh = (): void => setPreferences(loadEditorPreferences())
    const preview = (event: Event): void => {
      const value = (event as CustomEvent<IsoViewPreferences>).detail
      if (value) setPreferences(current => ({ ...current, isoView: parseIsoViewPreferences(JSON.stringify(value)) }))
    }
    window.addEventListener('moonsprite:preferences-changed', refresh)
    window.addEventListener(ISO_VIEW_PREFERENCES_PREVIEW_EVENT, preview)
    return () => {
      window.removeEventListener('moonsprite:preferences-changed', refresh)
      window.removeEventListener(ISO_VIEW_PREFERENCES_PREVIEW_EVENT, preview)
    }
  }, [])
  return preferences
}
