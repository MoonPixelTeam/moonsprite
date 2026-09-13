import { useCallback, useState } from 'react'
import type { QuickCommandSettingsTarget } from '@/components/app/quick-command-registry'
import { PreferencesDialog, type PreferenceSection } from '@/components/dialogs/PreferencesDialog'
import { ShortcutDialog } from '@/components/dialogs/ShortcutDialog'
import { type ShortcutBindings } from '@/core/shortcuts'
import type { useAppPreferences } from './useAppPreferences'

interface Options {
  setGridSettingsOpen: (open: boolean) => void
  setDocumentSizePresets: ReturnType<typeof useAppPreferences>['setDocumentSizePresets']
  setExportScalePresets: ReturnType<typeof useAppPreferences>['setExportScalePresets']
  shortcuts: ShortcutBindings
  saveShortcuts: (shortcuts: ShortcutBindings) => void
}

export function useAppSettingsDialogs({ setGridSettingsOpen, setDocumentSizePresets, setExportScalePresets, shortcuts, saveShortcuts }: Options) {
  const [preferencesOpen, setPreferencesOpen] = useState(false)
  const [preferencesInitialSection, setPreferencesInitialSection] = useState<PreferenceSection>('general')
  const [shortcutOpen, setShortcutOpen] = useState(false)
  const openPreferences = useCallback((section: PreferenceSection = 'general'): void => {
    setPreferencesInitialSection(section)
    setPreferencesOpen(true)
  }, [])
  const openQuickCommandPreferences = useCallback((): void => openPreferences('quickCommands'), [openPreferences])
  const openQuickCommandSettings = useCallback(
    (target: QuickCommandSettingsTarget): void => {
      if (target === 'grid') setGridSettingsOpen(true)
      else openPreferences('appearance')
    },
    [openPreferences]
  )
  const appSettingsDialogsSurface = (
    <>
      {preferencesOpen && (
        <PreferencesDialog
          initialSection={preferencesInitialSection}
          onClose={() => setPreferencesOpen(false)}
          onPresetChange={(documentSizes, exportScales) => {
            setDocumentSizePresets(documentSizes)
            setExportScalePresets(exportScales)
          }}
        />
      )}
      {shortcutOpen && <ShortcutDialog shortcuts={shortcuts} onSave={saveShortcuts} onClose={() => setShortcutOpen(false)} />}
    </>
  )
  return {
    preferencesOpen,
    setPreferencesOpen,
    shortcutOpen,
    setShortcutOpen,
    openPreferences,
    openQuickCommandPreferences,
    openQuickCommandSettings,
    appSettingsDialogsSurface
  }
}
