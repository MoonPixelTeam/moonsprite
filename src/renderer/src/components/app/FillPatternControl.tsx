import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { FillPatternMode, FillPatternSettings } from '@shared/types-brush'
import type { TranslationKey } from '@/core/localization'
import { DEFAULT_FILL_PATTERN_SETTINGS, MAX_PATTERN_STAMPS, normalizeFillPatternSettings } from '@/core/pattern-fill-settings'
import { ModalShell } from '../ModalShell'
import { DialogHeader } from '../DialogHeader'
import { NumberInput } from '../NumberInput'
import { FormField } from '../FormField'
import { CheckboxField } from '../CheckboxField'
import { RangeField } from '../RangeField'
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
  const [draft, setDraft] = useState(() => normalizeFillPatternSettings(settings))
  const update = (patch: Partial<FillPatternSettings>) => setDraft((current) => normalizeFillPatternSettings(patch, current))
  const range = (key: keyof FillPatternSettings, label: TranslationKey, min: number, max: number, suffix?: string, disabled = false, step = 1) => (
    <RangeField key={key} density="compact" label={t(label)} min={min} max={max} step={step} suffix={suffix} value={draft[key] as number} disabled={disabled} onChange={(value) => update({ [key]: value })} />
  )
  const count = (key: 'randomCount' | 'regularCount', label: TranslationKey) => (
    <FormField key={key} layout="inline" label={t(label)}><NumberInput aria-label={t(label)} value={draft[key]} min={0} max={MAX_PATTERN_STAMPS} onValueChange={(value) => update({ [key]: value })} /></FormField>
  )
  return createPortal(<div className="modal-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <ModalShell as="form" storageKey="fill-pattern-settings-v3" className="fill-pattern-settings-modal" defaultWidth={560} defaultHeight={620} minWidth={420} minHeight={360} maxWidth={860} maxHeight={900} role="dialog" aria-modal="true" aria-label={t('toolOptions.fillPatternSettings')} onKeyDownCapture={(event) => { if (event.key === 'Escape') { event.stopPropagation(); event.preventDefault(); onClose() } }} onSubmit={(event) => { event.preventDefault(); onChange(draft); onClose() }}>
      <DialogHeader title={t('toolOptions.fillPatternSettings')} closeLabel={t('common.close')} onClose={onClose} />
      <div className="modal-body fill-pattern-dialog-body component-scrollbar">
        <div className="fill-pattern-parameters">
          {mode === 'random' ? <>
            {range('randomDensity', 'toolOptions.fillRandomDensity', 0, 1000, '%', draft.randomCount > 0)}
            {count('randomCount', 'toolOptions.fillRandomCount')}
            {range('randomSpacing', 'toolOptions.fillRandomSpacing', 0, 4096, 'px')}
            {range('randomScaleMin', 'toolOptions.fillScaleMin', 1, draft.randomScaleMax, '%')}
            {range('randomScaleMax', 'toolOptions.fillScaleMax', draft.randomScaleMin, 1000, '%')}
            <CheckboxField checked={draft.randomRotate} label={t('toolOptions.fillRotate')} onChange={(randomRotate) => update({ randomRotate })} />
            {range('randomAngle', 'toolOptions.fillRandomAngle', 0, 180, '°', !draft.randomRotate)}
            <CheckboxField checked={draft.randomOverlap} label={t('toolOptions.fillRandomOverlap')} onChange={(randomOverlap) => update({ randomOverlap })} />
            {range('randomColor', 'toolOptions.fillColorRandomness', 0, 100, '%')}
            {range('randomBrightness', 'toolOptions.fillBrightnessRandomness', 0, 100, '%')}
          </> : <>
            {count('regularCount', 'toolOptions.fillRegularCount')}
            {range('regularScale', 'toolOptions.fillRegularScale', 1, 1000, '%')}
            {range('regularAngle', 'toolOptions.fillRegularAngle', -180, 180, '°')}
            <CheckboxField checked={draft.regularOverlap} label={t('toolOptions.fillRegularOverlap')} onChange={(regularOverlap) => update({ regularOverlap })} />
            {range('regularSpacingX', 'toolOptions.fillRegularSpacingX', draft.regularOverlap ? -4096 : 0, 4096, 'px')}
            {range('regularSpacingY', 'toolOptions.fillRegularSpacingY', draft.regularOverlap ? -4096 : 0, 4096, 'px')}
            {range('regularRowOffset', 'toolOptions.fillRowOffset', 0, 100, '%')}
          </>}
        </div>
      </div>
      <footer><button type="button" className="quiet-button" onClick={() => setDraft({ ...DEFAULT_FILL_PATTERN_SETTINGS })}>{t('toolOptions.fillPatternReset')}</button><button type="button" className="quiet-button" onClick={onClose}>{t('common.cancel')}</button><button type="submit" className="primary-button">{t('common.apply')}</button></footer>
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
