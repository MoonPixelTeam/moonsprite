import { useState } from 'react'
import type { TweenPathPoint } from '@/core/animation-tween'
import { loadTweenPathPresets, saveTweenPathPreset, type TweenPathPreset } from '@/core/animation-tween-path-presets'
import { Button } from './Button'
import { TextInput } from './TextInput'
import { ThemedSelect } from './ThemedSelect'
import { FormField } from './FormField'
import { useI18n } from './I18nProvider'

export function AnimationTweenPathPresets({ path, busy, onLoad }: { path: readonly TweenPathPoint[]; busy: boolean; onLoad(path: TweenPathPoint[]): void }) {
  const { t } = useI18n()
  const [library, setLibrary] = useState<{ presets: TweenPathPreset[]; error: string }>(() => {
    try { return { presets: loadTweenPathPresets(), error: '' } }
    catch (cause) { return { presets: [], error: cause instanceof Error ? cause.message : String(cause) } }
  })
  const [name, setName] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [message, setMessage] = useState('')
  const failure = (cause: unknown) => { setMessage(''); setLibrary((current) => ({ ...current, error: cause instanceof Error ? cause.message : String(cause) })) }
  const hasPath = path.length > 1 && path.some((point) => point.x !== 0 || point.y !== 0)
  return <div className="tween-path-presets">
    <div className="tween-path-preset-row">
      <FormField label={t('timeline.tween.pathName')}><TextInput aria-label={t('timeline.tween.pathName')} value={name} maxLength={80} disabled={busy} onChange={(event) => setName(event.target.value)} /></FormField>
      <Button disabled={busy || !hasPath || !name.trim()} onClick={() => {
        try {
          const presets = saveTweenPathPreset(name, path)
          setLibrary({ presets, error: '' }); setSelectedId(presets.at(-1)!.id); setName(''); setMessage(t('timeline.tween.pathSaved'))
        } catch (cause) { failure(cause) }
      }}>{t('timeline.tween.pathSave')}</Button>
      <FormField label={t('timeline.tween.pathLibrary')}><ThemedSelect label={t('timeline.tween.pathLibrary')} value={selectedId} disabled={busy || !library.presets.length} density="regular" popoverClassName="tween-path-library-popover" preserveAnimationSelection
        groups={[{ label: t('timeline.tween.pathLibrary'), options: [{ value: '', label: t('timeline.tween.pathChoose') }, ...library.presets.map(preset => ({ value: preset.id, label: preset.name }))] }]}
        onChange={(value) => { setSelectedId(value); setMessage('') }}
      /></FormField>
      <Button disabled={busy || !selectedId} onClick={() => {
        try {
          const presets = loadTweenPathPresets(), preset = presets.find((item) => item.id === selectedId)
          if (!preset) { setSelectedId(''); setLibrary({ presets, error: t('timeline.tween.pathLibraryReadFailed') }); return }
          onLoad(preset.path); setLibrary({ presets, error: '' }); setMessage(t('timeline.tween.pathLoaded'))
        } catch (cause) { failure(cause) }
      }}>{t('timeline.tween.pathLoad')}</Button>
    </div>
    <p className="modal-note">{t('timeline.tween.pathReuseHint')}</p>
    {library.error && <p className="modal-note" role="alert">{library.error}</p>}
    {message && <p className="modal-note" role="status">{message}</p>}
  </div>
}
