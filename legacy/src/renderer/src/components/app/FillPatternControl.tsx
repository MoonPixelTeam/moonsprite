import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { FillPatternMode, FillPatternSettings } from '@shared/types-brush'
import type { TranslationKey } from '@/core/localization'
import { DEFAULT_FILL_PATTERN_SETTINGS, MAX_PATTERN_STAMPS, normalizeFillPatternSettings } from '@/core/pattern-fill-settings'
import { ModalShell } from '../ModalShell'
import { DialogHeader } from '../DialogHeader'
import { CheckboxField } from '../CheckboxField'
import { FormField } from '../FormField'
import { FillPatternNumberField } from './FillPatternNumberField'
import { FillPatternPresets } from './FillPatternPresets'
import { PixelUtilityIcon } from '../PixelUtilityIcon'
import { ThemedSelect } from '../ThemedSelect'
import './fill-pattern.css'

type Translate = (key: TranslationKey) => string
interface Props {
  mode: FillPatternMode
  settings: FillPatternSettings
  onOpen: () => void
  onModeChange: (mode: FillPatternMode) => void
  onChange: (settings: Partial<FillPatternSettings>) => void
  t: Translate
}

export function FillPatternDialog({ mode, settings, onChange, onClose, t }: Omit<Pick<Props, 'mode' | 'settings' | 'onChange' | 't'>, 'mode'> & { mode: 'random' | 'regular'; onClose: () => void }) {
  const [draft, setDraft] = useState(() => {
    const initial = normalizeFillPatternSettings(settings)
    if (initial.randomSpacing > 0) initial.randomOverlap = false
    if (!initial.regularOverlap) {
      initial.regularSpacingX = Math.max(0, initial.regularSpacingX)
      initial.regularSpacingY = Math.max(0, initial.regularSpacingY)
    }
    return initial
  })
  const [customCount, setCustomCount] = useState(() => settings[mode === 'random' ? 'randomCount' : 'regularCount'] > 0)
  const update = (patch: Partial<FillPatternSettings>) => setDraft(current => normalizeFillPatternSettings(patch, current))
  const modeSettings = (source: FillPatternSettings) => Object.fromEntries(Object.entries(source).filter(([key]) => key.startsWith(mode))) as Partial<FillPatternSettings>
  const effectiveSettings = () => {
    const effective = { ...draft, regularRowOffset: 0 }
    effective[mode === 'random' ? 'randomCount' : 'regularCount'] = customCount ? Math.max(1, draft[mode === 'random' ? 'randomCount' : 'regularCount']) : 0
    if (effective.randomOverlap) effective.randomSpacing = 0
    if (!effective.regularOverlap) {
      effective.regularSpacingX = Math.max(0, effective.regularSpacingX)
      effective.regularSpacingY = Math.max(0, effective.regularSpacingY)
    }
    return effective
  }
  const selectSettings = (patch: Partial<FillPatternSettings>) => {
    setDraft(current => normalizeFillPatternSettings(patch, current))
    setCustomCount((patch[mode === 'random' ? 'randomCount' : 'regularCount'] ?? 0) > 0)
  }
  const apply = () => {
    onChange(modeSettings(effectiveSettings()))
    onClose()
  }
  const range = (key: keyof FillPatternSettings, label: TranslationKey, min: number, max: number, suffix?: string, hint?: TranslationKey) => (
    <FillPatternNumberField key={key} label={t(label)} hint={hint ? t(hint) : undefined} value={Math.max(min, draft[key] as number)} min={min} max={max} suffix={suffix} onChange={value => update({ [key]: value })} />
  )
  const count = (key: 'randomCount' | 'regularCount', label: TranslationKey) => (
    range(key, label, 1, MAX_PATTERN_STAMPS)
  )
  const row = (label: TranslationKey, children: ReactNode) => <FormField className="fill-pattern-property" layout="inline" label={t(label)}>
    <div className="fill-pattern-property-controls">{children}</div>
  </FormField>
  return createPortal(<div className="modal-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <ModalShell as="form" storageKey="fill-pattern-settings-v7" className="fill-pattern-settings-modal" defaultWidth={520} defaultHeight={440} minWidth={420} minHeight={300} maxWidth={860} maxHeight={900} role="dialog" aria-modal="true" aria-label={t('toolOptions.fillPatternSettings')} onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); event.preventDefault(); onClose() } }} onSubmit={(event) => { event.preventDefault(); apply() }}>
      <DialogHeader title={t(mode === 'random' ? 'toolOptions.fillPatternRandom' : 'toolOptions.fillPatternRegular')} closeLabel={t('common.close')} onClose={onClose} />
      <div className="modal-body fill-pattern-dialog-body component-scrollbar">
        <FillPatternPresets mode={mode} settings={effectiveSettings()} onSelect={selectSettings} t={t} />
        <div className="fill-pattern-parameters">
          {mode === 'random' ? <>
            {row('toolOptions.fillPropertyAmount', <>
              <CheckboxField checked={customCount} label={t('toolOptions.fillUseRandomCount')} tooltip={t('toolOptions.fillRandomCountHint')} onChange={setCustomCount} />
              {customCount ? count('randomCount', 'toolOptions.fillRandomCount') : range('randomDensity', 'toolOptions.fillRandomDensity', 0, 1000, '%', 'toolOptions.fillDensityHint')}
            </>)}
            {row('toolOptions.fillPropertySpacing', <>
              <CheckboxField checked={draft.randomOverlap && draft.randomSpacing === 0} label={t('toolOptions.fillRandomOverlap')} onChange={(randomOverlap) => update({ randomOverlap, ...(randomOverlap ? { randomSpacing: 0 } : {}) })} />
              {(!draft.randomOverlap || draft.randomSpacing > 0) && range('randomSpacing', 'toolOptions.fillRandomSpacing', 0, 4096, 'px')}
            </>)}
          </> : <>
            {row('toolOptions.fillPropertyAmount', <>
              <CheckboxField checked={customCount} label={t('toolOptions.fillLimitRegularCount')} tooltip={t('toolOptions.fillRegularCountHint')} onChange={setCustomCount} />
              {customCount ? count('regularCount', 'toolOptions.fillRegularCount') : <span className="fill-pattern-auto-value">{t('toolOptions.fillAutomaticCoverage')}</span>}
            </>)}
            {row('toolOptions.fillPropertySpacing', <>
              <div className="fill-pattern-linked-values">
                {range('regularSpacingX', 'toolOptions.fillRegularSpacingX', draft.regularOverlap ? -4096 : 0, 4096, 'px', 'toolOptions.fillSpacingHint')}
                {range('regularSpacingY', 'toolOptions.fillRegularSpacingY', draft.regularOverlap ? -4096 : 0, 4096, 'px', 'toolOptions.fillSpacingHint')}
              </div>
              <CheckboxField checked={draft.regularOverlap} label={t('toolOptions.fillRegularOverlap')} tooltip={t('toolOptions.fillSpacingHint')} onChange={(regularOverlap) => update({ regularOverlap, ...(!regularOverlap ? { regularSpacingX: Math.max(0, draft.regularSpacingX), regularSpacingY: Math.max(0, draft.regularSpacingY) } : {}) })} />
            </>)}
          </>}
        </div>
      </div>
      <footer><button type="button" className="quiet-button" onClick={() => selectSettings(modeSettings(DEFAULT_FILL_PATTERN_SETTINGS))}>{t('toolOptions.fillPatternReset')}</button><button type="button" className="quiet-button" onClick={onClose}>{t('common.cancel')}</button><button type="submit" className="primary-button">{t('common.apply')}</button></footer>
    </ModalShell>
  </div>, document.body)
}

export function FillPatternControl(props: Props) {
  const { mode, t } = props
  const groups = [{ label: t('toolOptions.fillPatternMode'), options: ([['default', 'toolOptions.fillPatternDefault'], ['random', 'toolOptions.fillPatternRandom'], ['regular', 'toolOptions.fillPatternRegular']] as const).map(([value, label]) => ({ value, label: t(label) })) }]
  return <span className="fill-pattern-controls">
    <ThemedSelect<FillPatternMode> density="compact" value={mode ?? 'default'} groups={groups} label={t('toolOptions.fillPatternMode')} popoverWidth={160} onChange={props.onModeChange} />
    {mode && mode !== 'default' && <button type="button" className="icon-button" aria-label={t('toolOptions.fillPatternSettings')} title={t('toolOptions.fillPatternSettings')} aria-haspopup="dialog" onClick={props.onOpen}><PixelUtilityIcon kind="properties" /></button>}
  </span>
}
