import { useEffect, useState } from 'react'
import { DIAGNOSTIC_MODE_CHANGED, loadDiagnosticMode, saveDiagnosticMode, type DiagnosticMode } from '@/core/diagnostic-preferences'
import { FormField } from '@/components/FormField'
import { ThemedSelect } from '@/components/ThemedSelect'
import { useI18n } from '@/components/I18nProvider'

export function DiagnosticPreferencesField() {
  const { t } = useI18n()
  const [mode, setMode] = useState(loadDiagnosticMode)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const refresh = () => setMode(loadDiagnosticMode())
    window.addEventListener(DIAGNOSTIC_MODE_CHANGED, refresh)
    window.addEventListener('moonsprite:preferences-changed', refresh)
    return () => {
      window.removeEventListener(DIAGNOSTIC_MODE_CHANGED, refresh)
      window.removeEventListener('moonsprite:preferences-changed', refresh)
    }
  }, [])
  return <>
    <FormField className="preference-field" label={t('preferences.diagnostics.mode')} tooltip={t('preferences.diagnostics.hint')}>
      <ThemedSelect<DiagnosticMode> value={mode} label={t('preferences.diagnostics.mode')} groups={[{
        label: t('preferences.diagnostics.mode'), options: [
          { value: 'off', label: t('preferences.diagnostics.off') },
          { value: 'memory', label: t('preferences.diagnostics.memory') },
          { value: 'full', label: t('preferences.diagnostics.full') }
        ]
      }]} onChange={value => { const saved = saveDiagnosticMode(value); setFailed(!saved); if (saved) setMode(value) }} />
    </FormField>
    {failed && <p role="alert">{t('preferences.diagnostics.saveFailed')}</p>}
  </>
}
