import { useEffect, useState } from 'react'
import { FormField } from '@/components/FormField'
import { ThemedSelect } from '@/components/ThemedSelect'
import { useI18n } from '@/components/I18nProvider'
import { loadEyedropperSource, saveEyedropperSource, type EyedropperSource } from '@/core/eyedropper-source'

export function EyedropperSourceControl() {
  const { t } = useI18n()
  const [source, setSource] = useState(loadEyedropperSource)
  useEffect(() => {
    const refresh = () => setSource(loadEyedropperSource())
    window.addEventListener('moonsprite:preferences-changed', refresh)
    return () => window.removeEventListener('moonsprite:preferences-changed', refresh)
  }, [])
  return <FormField layout="inline" label={t('toolOptions.eyedropperSource')} tooltip={t('toolOptions.eyedropperSourceHint')}>
    <ThemedSelect<EyedropperSource> value={source} label={t('toolOptions.eyedropperSource')} density="compact" groups={[{ label: t('toolOptions.eyedropperSource'), options: [
      { value: 'composite', label: t('toolOptions.eyedropperSourceComposite'), description: t('toolOptions.eyedropperSourceCompositeHint') },
      { value: 'current-layer', label: t('toolOptions.eyedropperSourceLayer'), description: t('toolOptions.eyedropperSourceLayerHint') }
    ] }]} showOptionTooltips onChange={value => { setSource(value); saveEyedropperSource(value) }} />
  </FormField>
}
