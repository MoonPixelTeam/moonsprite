import { useCallback, useEffect, useRef, useState } from 'react'
import {
  EXPORT_SCALE_PRESETS_KEY,
  ISO_VIEW_PREFERENCES_PREVIEW_EVENT,
  NEW_DOCUMENT_SIZE_PRESETS_KEY,
  RELATIVE_LUMINANCE_SCOPE_KEY,
  loadEditorPreferences,
  parseDocumentSizePresets,
  parseExportScalePresets,
  parseRelativeLuminanceScope,
  saveEditorPreferences,
  type IsoViewPreferences,
  type RelativeLuminanceScope
} from '@/core/file-preferences'
import { applyThemeToDocument } from '@/core/theme'
import { readStoredString } from '@/core/storage'
import { applyCursorPreferences } from '@/platform/cursor-theme'
import { applyToolIconScale, applyUiScale } from '@/platform/ui-scale'
type AlignmentPreferenceKey = 'gridAlignmentEnabled' | 'smartAlignmentEnabled' | 'alignmentGuidesVisible'

export function useAppPreferences({ relativeLuminance }: { relativeLuminance: boolean }) {
  const [defaultFileDirectories, setDefaultFileDirectories] = useState({ saveDirectory: 'gallery', exportDirectory: 'exports' })

  const [documentSizePresets, setDocumentSizePresets] = useState(() => parseDocumentSizePresets(readStoredString(NEW_DOCUMENT_SIZE_PRESETS_KEY)))

  const [exportScalePresets, setExportScalePresets] = useState(() => parseExportScalePresets(readStoredString(EXPORT_SCALE_PRESETS_KEY)))

  const [relativeLuminanceScope, setRelativeLuminanceScope] = useState<RelativeLuminanceScope>(() =>
    parseRelativeLuminanceScope(readStoredString(RELATIVE_LUMINANCE_SCOPE_KEY))
  )

  const [runtimePreferences, setRuntimePreferences] = useState(loadEditorPreferences)

  const appliedThemeFingerprintRef = useRef(JSON.stringify(runtimePreferences.theme))

  useEffect(() => {
    const syncPreferences = (): void => {
      const next = loadEditorPreferences()
      setRuntimePreferences(next)
      setRelativeLuminanceScope(next.relativeLuminanceScope)
      const themeFingerprint = JSON.stringify(next.theme)
      if (themeFingerprint !== appliedThemeFingerprintRef.current) {
        appliedThemeFingerprintRef.current = themeFingerprint
        applyThemeToDocument(next.theme)
      }
      document.documentElement.dataset.uiMotion = next.uiMotionLevel
    }
    window.addEventListener('moonsprite:preferences-changed', syncPreferences)
    return () => window.removeEventListener('moonsprite:preferences-changed', syncPreferences)
  }, [])

  const toggleTimelineVisibility = useCallback((): void => {
    const next = { ...runtimePreferences, timelineHidden: !runtimePreferences.timelineHidden }
    saveEditorPreferences(next)
    setRuntimePreferences(next)
    window.dispatchEvent(new Event('moonsprite:preferences-changed'))
  }, [runtimePreferences])

  const toggleSliceOutlinesVisibility = useCallback((): void => {
    const next = { ...runtimePreferences, sliceOutlinesVisible: !runtimePreferences.sliceOutlinesVisible }
    saveEditorPreferences(next)
    setRuntimePreferences(next)
    window.dispatchEvent(new Event('moonsprite:preferences-changed'))
  }, [runtimePreferences])

  const toggleAlignmentPreference = useCallback(
    (key: AlignmentPreferenceKey): void => {
      const next = { ...runtimePreferences, [key]: !runtimePreferences[key] }
      saveEditorPreferences(next)
      setRuntimePreferences(next)
      window.dispatchEvent(new Event('moonsprite:preferences-changed'))
    },
    [runtimePreferences]
  )

  const applyIsoViewPreferences = useCallback(
    (isoView: IsoViewPreferences): void => {
      const next = { ...runtimePreferences, isoView }
      saveEditorPreferences(next)
      setRuntimePreferences(next)
      window.dispatchEvent(new Event('moonsprite:preferences-changed'))
    },
    [runtimePreferences]
  )

  const previewIsoViewPreferences = useCallback((isoView: IsoViewPreferences): void => {
    window.dispatchEvent(new CustomEvent(ISO_VIEW_PREFERENCES_PREVIEW_EVENT, { detail: isoView }))
  }, [])

  useEffect(() => {
    let disposed = false
    void window.moonSprite.getDefaultFileDirectories().then((directories) => {
      if (!disposed) setDefaultFileDirectories(directories)
    })
    return () => {
      disposed = true
    }
  }, [])

  useEffect(() => {
    void applyCursorPreferences(runtimePreferences.useLocalCursors, runtimePreferences.cursorScale).catch(() => {
      // The CSS defaults remain usable when a custom cursor image cannot be decoded.
    })
  }, [runtimePreferences.cursorScale, runtimePreferences.useLocalCursors])

  useEffect(() => {
    void applyUiScale(runtimePreferences.uiScale).catch(() => {
      // Native WebView zoom can be unavailable in browser previews.
    })
  }, [runtimePreferences.uiScale])

  useEffect(() => {
    applyToolIconScale(runtimePreferences.toolIconScale)
  }, [runtimePreferences.toolIconScale])

  useEffect(() => {
    const enabled = Boolean(relativeLuminance && relativeLuminanceScope === 'app')
    document.body.classList.toggle('relative-luminance-app', enabled)
    return () => {
      document.body.classList.remove('relative-luminance-app')
    }
  }, [relativeLuminanceScope, relativeLuminance])
  return {
    defaultFileDirectories,
    documentSizePresets,
    setDocumentSizePresets,
    exportScalePresets,
    setExportScalePresets,
    relativeLuminanceScope,
    runtimePreferences,
    toggleTimelineVisibility,
    toggleSliceOutlinesVisibility,
    toggleAlignmentPreference,
    applyIsoViewPreferences,
    previewIsoViewPreferences
  }
}
