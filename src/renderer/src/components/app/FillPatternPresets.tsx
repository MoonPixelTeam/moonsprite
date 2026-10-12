import { useState } from 'react'
import type { FillPatternSettings } from '@shared/types-brush'
import type { TranslationKey } from '@/core/localization'
import { BUILTIN_FILL_PATTERN_PRESETS, deleteFillPatternPreset, loadFillPatternPresets, saveFillPatternPreset, type FillPatternPreset, type PatternPresetMode } from '@/core/pattern-fill-presets'
import { ThemedSelect } from '../ThemedSelect'
import { TextInput } from '../TextInput'
import { FormField } from '../FormField'
import { PixelUtilityIcon } from '../PixelUtilityIcon'

export function FillPatternPresets({ mode, settings, onSelect, t }: {
  mode: PatternPresetMode; settings: FillPatternSettings; onSelect: (settings: Partial<FillPatternSettings>) => void; t: (key: TranslationKey) => string
}) {
  const [library, setLibrary] = useState(() => {
    try { return { presets: loadFillPatternPresets(), error: '' } }
    catch (error) { return { presets: [] as FillPatternPreset[], error: (error as Error).message } }
  })
  const [selected, setSelected] = useState('custom')
  const [name, setName] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const builtins = BUILTIN_FILL_PATTERN_PRESETS.filter(p => p.mode === mode)
  const users = library.presets.filter(p => p.mode === mode)
  const userPreset = users.find(p => p.id === selected)
  const selectedPreset = userPreset ?? builtins.find(p => p.id === selected)
  const editableKeys: (keyof FillPatternSettings)[] = mode === 'random' ? ['randomDensity', 'randomCount', 'randomSpacing', 'randomOverlap'] : ['regularCount', 'regularSpacingX', 'regularSpacingY', 'regularOverlap']
  const modified = selectedPreset && editableKeys.some(key => settings[key] !== selectedPreset.settings[key])
  const replace = Boolean(userPreset && name.trim().toLowerCase() === userPreset.name.toLowerCase())
  const save = () => {
    try {
      const presets = saveFillPatternPreset(mode, name, settings, replace ? userPreset?.id : undefined)
      setLibrary({ presets, error: '' })
      setSelected(presets.find(p => p.mode === mode && p.name === name.trim())!.id)
      setName(name.trim())
      setConfirmDelete(false)
    } catch (error) { setLibrary(current => ({ ...current, error: (error as Error).message })) }
  }
  const remove = () => {
    if (!userPreset) return
    try {
      setLibrary({ presets: deleteFillPatternPreset(userPreset.id), error: '' })
      setSelected('custom'); setName(''); setConfirmDelete(false)
    } catch (error) { setLibrary(current => ({ ...current, error: (error as Error).message })) }
  }
  return <section className="fill-pattern-presets" aria-label={t('toolOptions.fillPresets')}>
    <FormField className="export-preset-field fill-pattern-preset-field" label={t('toolOptions.fillPresets')} tooltip={t('toolOptions.fillPresetHint')}>
      <div className="export-preset-control">
        <ThemedSelect label={t('toolOptions.fillPresets')} value={selected} groups={[
          { label: t('toolOptions.fillPresetBuiltins'), options: [{ value: 'custom', label: t('toolOptions.fillPresetCustom') }, ...builtins.map(p => ({ value: p.id, label: t(p.label) }))] },
          { label: t('toolOptions.fillPresetUsers'), options: users.map(p => ({ value: p.id, label: p.name })) }
        ]} renderSelected={option => <>{option.label}{modified ? t('toolOptions.fillPresetModified') : ''}</>} onChange={id => {
          setSelected(id); setConfirmDelete(false)
          const preset = users.find(p => p.id === id) ?? builtins.find(p => p.id === id)
          setName(users.find(p => p.id === id)?.name ?? '')
          if (preset) onSelect(preset.settings)
        }} />
        <div className="preset-row">
          <TextInput className="preset-name-input" aria-label={t('toolOptions.fillPresetName')} placeholder={t('toolOptions.fillPresetName')} value={name} maxLength={80}
            onChange={event => { setName(event.target.value); setConfirmDelete(false) }} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); save() } }} />
          <button type="button" className="quiet-button" disabled={!name.trim()} title={t(replace ? 'toolOptions.fillPresetUpdate' : 'toolOptions.fillPresetSaveNew')} onClick={save}>{t('app.export.savePreset')}</button>
          <button type="button" className="icon-button preset-delete" disabled={!userPreset}
            title={t('toolOptions.fillPresetDelete')} aria-label={t('toolOptions.fillPresetDelete')} onClick={() => setConfirmDelete(true)}><PixelUtilityIcon kind="delete" /></button>
        </div>
        {confirmDelete && <div className="fill-pattern-delete-confirm">
          <span>{userPreset?.name}</span>
          <button type="button" className="quiet-button" onClick={remove}>{t('toolOptions.fillPresetConfirmDelete')}</button>
          <button type="button" className="quiet-button" onClick={() => setConfirmDelete(false)}>{t('common.cancel')}</button>
        </div>}
      </div>
    </FormField>
    {library.error && <p role="alert" className="fill-pattern-hint">{library.error}</p>}
  </section>
}
