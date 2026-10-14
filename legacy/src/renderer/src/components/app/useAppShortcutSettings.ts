import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  deriveShortcutConflicts,
  loadShortcutBindings,
  saveShortcutBindings as persistShortcutBindings,
  shortcutDisplayText,
  shortcutPrimary,
  type ShortcutBindings,
  type ShortcutId
} from '@/core/shortcuts'
import { useI18n } from '@/components/I18nProvider'

export function useAppShortcutSettings() {
  const { locale } = useI18n()
  const [shortcuts, setShortcuts] = useState<ShortcutBindings>(loadShortcutBindings)

  const saveShortcuts = (next: ShortcutBindings): void => {
    setShortcuts(next)
    persistShortcutBindings(next)
  }

  const shortcutConflictState = useMemo(() => deriveShortcutConflicts(shortcuts), [shortcuts])

  const shortcutFor = useCallback((id: ShortcutId): string => shortcutDisplayText(shortcutPrimary(shortcuts, id), locale), [locale, shortcuts])

  useEffect(() => {
    const syncShortcuts = (): void => setShortcuts(loadShortcutBindings())
    window.addEventListener('moonsprite:shortcuts-changed', syncShortcuts)
    return () => window.removeEventListener('moonsprite:shortcuts-changed', syncShortcuts)
  }, [])
  return { shortcuts, saveShortcuts, shortcutConflictState, shortcutFor }
}
