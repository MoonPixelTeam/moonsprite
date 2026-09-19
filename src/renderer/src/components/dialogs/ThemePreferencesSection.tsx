import { useSyncExternalStore, type CSSProperties } from 'react'
import { PreferenceToggle } from '@/components/PreferenceToggle'
import { useI18n } from '@/components/I18nProvider'
import { SettingsSectionHeader } from '@/components/SettingsSectionHeader'
import type { EditorPreferences } from '@/core/file-preferences'
import { BUILT_IN_THEMES, resolveTheme, themeById, subscribeSystemTheme, systemThemeId, type ThemePreferences } from '@/core/theme'

interface ThemePreferencesSectionProps { preferences: EditorPreferences; onChange: (preferences: EditorPreferences) => void }

const applyThemePreferences = (preferences: EditorPreferences, theme: ThemePreferences): EditorPreferences => {
  const visual = resolveTheme(theme).visualDefaults
  return { ...preferences, theme, checkerboard: { ...preferences.checkerboard, lightColor: { ...visual.checkerLight }, darkColor: { ...visual.checkerDark } }, pixelGridColor: { ...visual.pixelGrid }, gridColor: { ...visual.customGrid }, onionSkin: { ...preferences.onionSkin, previousColor: { ...visual.onionPrevious }, nextColor: { ...visual.onionNext } }, symmetryAxis: { ...preferences.symmetryAxis, color: { ...visual.symmetryAxis } } }
}

export function ThemePreferencesSection({ preferences, onChange }: ThemePreferencesSectionProps) {
  const { t } = useI18n()
  useSyncExternalStore(subscribeSystemTheme, systemThemeId, () => 'dark')
  const current = themeById(preferences.theme)
  const setTheme = (activeThemeId: string): void => onChange(applyThemePreferences(preferences, { activeThemeId, customThemes: [] }))
  return <div className="theme-preferences theme-preferences-expanded">
    <PreferenceToggle checked={preferences.theme.followSystem === true} label={t('preferences.theme.followSystem')} tooltip={t('preferences.theme.followSystemHint')} onChange={(followSystem) => onChange(applyThemePreferences(preferences, { ...preferences.theme, followSystem }))} />
    <section className="theme-picker-section">
      <SettingsSectionHeader title={t('preferences.theme.current')} actions={<span className="theme-current-name">{current.name}</span>} />
      <div className="theme-picker-grid" role="listbox" aria-label={t('preferences.theme.available')}>
        {BUILT_IN_THEMES.map((theme) => {
          const resolved = resolveTheme({ activeThemeId: theme.id, customThemes: [] })
          const previewVariables = Object.fromEntries(Object.entries(resolved.variables).filter(([name]) => name.startsWith('--theme-'))) as CSSProperties
          const selected = theme.id === current.id
          return <button key={theme.id} type="button" role="option" aria-selected={selected} className={`theme-option ${selected ? 'selected' : ''}`} onClick={() => setTheme(theme.id)}>
            <span className="theme-option-preview" style={previewVariables} aria-hidden="true">
              <i className="theme-preview-topbar"><b /><b /><b /></i>
              <i className="theme-preview-main">
                <b className="theme-preview-rail"><em /><em /><em /><em /></b>
                <b className="theme-preview-workspace"><em /><em /><em /></b>
                <b className="theme-preview-panel"><em /><em /><em /></b>
              </i>
              <i className="theme-preview-selection" />
            </span>
            <span className="theme-option-label"><strong>{theme.name}</strong><small>{selected ? t('preferences.theme.current') : t('preferences.theme.available')}</small></span>
          </button>
        })}
      </div>
    </section>
  </div>
}
