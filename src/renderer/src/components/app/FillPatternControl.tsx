import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { FillPatternMode, FillPatternSettings, ImageBrush } from '@shared/types-brush'
import type { RgbaColor } from '@shared/types-color'
import type { TranslationKey } from '@/core/localization'
import { DEFAULT_FILL_PATTERN_SETTINGS, MAX_PATTERN_STAMPS, normalizeFillPatternSettings } from '@/core/pattern-fill-settings'
import { createImageFillSampler } from '@/core/pattern-fill-sampler'
import { ModalShell } from '../ModalShell'
import { DialogHeader } from '../DialogHeader'
import { NumberInput } from '../NumberInput'
import { FormField } from '../FormField'
import { CheckboxField } from '../CheckboxField'
import { PixelUtilityIcon } from '../PixelUtilityIcon'
import { ThemedSelect } from '../ThemedSelect'
import './fill-pattern.css'

type Translate = (key: TranslationKey) => string
interface Props {
  mode: FillPatternMode
  settings: FillPatternSettings
  brush: ImageBrush
  foreground: RgbaColor
  onModeChange: (mode: FillPatternMode) => void
  onChange: (settings: Partial<FillPatternSettings>) => void
  t: Translate
}

function PatternPreview({ brush, foreground, mode, settings, t }: Pick<Props, 'brush' | 'foreground' | 'settings' | 't'> & { mode: 'random' | 'regular' }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const context = ref.current?.getContext('2d')
    if (!context) return
    // A representative area, not a full document recomposite. Cap explicit preview counts.
    const side = Math.max(128, Math.min(2048, Math.max(brush.width, brush.height) * 6))
    const sampleSettings = { ...settings, randomCount: Math.min(2500, settings.randomCount), regularCount: Math.min(2500, settings.regularCount) }
    const { sample } = createImageFillSampler(brush, 1, undefined, 0, 'pattern-source', { x: 0, y: 0 }, { x: 0, y: 0, width: side, height: side }, mode, sampleSettings, foreground)
    const image = context.createImageData(192, 192)
    for (let y = 0; y < 192; y++) for (let x = 0; x < 192; x++) {
      const value = sample(Math.floor(x * side / 192), Math.floor(y * side / 192))
      const color = value.color ?? foreground
      const index = (y * 192 + x) * 4
      image.data[index] = color.r; image.data[index + 1] = color.g; image.data[index + 2] = color.b
      image.data[index + 3] = Math.round(color.a * value.coverage / 255)
    }
    context.putImageData(image, 0, 0)
  }, [brush, foreground, mode, settings])
  return <figure className="fill-pattern-preview"><canvas ref={ref} width={192} height={192} aria-label={t('toolOptions.fillPatternPreview')} /><figcaption>{t('toolOptions.fillPatternPreview')}</figcaption></figure>
}

function PatternDialog({ mode, settings, brush, foreground, onChange, onClose, t }: Omit<Props, 'mode' | 'onModeChange'> & { mode: 'random' | 'regular'; onClose: () => void }) {
  const [draft, setDraft] = useState(() => normalizeFillPatternSettings(settings))
  const update = (patch: Partial<FillPatternSettings>) => setDraft((current) => normalizeFillPatternSettings(patch, current))
  const number = (key: keyof FillPatternSettings, label: TranslationKey, min: number, max: number, suffix?: string, disabled = false) => <FormField key={key} layout="inline" label={t(label)}><NumberInput aria-label={t(label)} value={draft[key] as number} min={min} max={max} suffix={suffix} disabled={disabled} onValueChange={(value) => update({ [key]: value })} /></FormField>
  return createPortal(<div className="modal-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <ModalShell as="form" storageKey="fill-pattern-settings-v2" className="fill-pattern-settings-modal" defaultWidth={740} defaultHeight={660} minWidth={480} minHeight={400} maxWidth={980} maxHeight={900} role="dialog" aria-modal="true" aria-label={t('toolOptions.fillPatternSettings')} onKeyDownCapture={(event) => { if (event.key === 'Escape') { event.stopPropagation(); event.preventDefault(); onClose() } }} onSubmit={(event) => { event.preventDefault(); onChange(draft); onClose() }}>
      <DialogHeader title={t('toolOptions.fillPatternSettings')} closeLabel={t('common.close')} onClose={onClose} />
      <div className="modal-body fill-pattern-dialog-body component-scrollbar">
        <PatternPreview brush={brush} foreground={foreground} mode={mode} settings={draft} t={t} />
        <div className="fill-pattern-parameters">
          {mode === 'random' ? <>
            {number('randomSeed', 'toolOptions.fillRandomSeed', 0, 0x7fffffff)}
            {number('randomDensity', 'toolOptions.fillRandomDensity', 0, 1000, '%', draft.randomCount > 0)}
            {number('randomCount', 'toolOptions.fillRandomCount', 0, MAX_PATTERN_STAMPS)}
            {number('randomSpacing', 'toolOptions.fillRandomSpacing', 0, 4096, 'px')}
            {number('randomScaleMin', 'toolOptions.fillScaleMin', 1, draft.randomScaleMax, '%')}
            {number('randomScaleMax', 'toolOptions.fillScaleMax', draft.randomScaleMin, 1000, '%')}
            <CheckboxField checked={draft.randomRotate} label={t('toolOptions.fillRotate')} onChange={(randomRotate) => update({ randomRotate })} />
            {number('randomAngle', 'toolOptions.fillRandomAngle', 0, 180, '°', !draft.randomRotate)}
            <CheckboxField checked={draft.randomOverlap} label={t('toolOptions.fillRandomOverlap')} onChange={(randomOverlap) => update({ randomOverlap })} />
            {number('randomColor', 'toolOptions.fillColorRandomness', 0, 100, '%')}
            {number('randomBrightness', 'toolOptions.fillBrightnessRandomness', 0, 100, '%')}
          </> : <>
            {number('regularCount', 'toolOptions.fillRegularCount', 0, MAX_PATTERN_STAMPS)}
            {number('regularScale', 'toolOptions.fillRegularScale', 1, 1000, '%')}
            {number('regularAngle', 'toolOptions.fillRegularAngle', -180, 180, '°')}
            <CheckboxField checked={draft.regularOverlap} label={t('toolOptions.fillRegularOverlap')} onChange={(regularOverlap) => update({ regularOverlap })} />
            {number('regularSpacingX', 'toolOptions.fillRegularSpacingX', draft.regularOverlap ? -4096 : 0, 4096, 'px')}
            {number('regularSpacingY', 'toolOptions.fillRegularSpacingY', draft.regularOverlap ? -4096 : 0, 4096, 'px')}
            {number('regularRowOffset', 'toolOptions.fillRowOffset', 0, 100, '%')}
          </>}
          <p className="fill-pattern-hint">{t(mode === 'random' ? 'toolOptions.fillPatternHint' : 'toolOptions.fillPatternRegularHint')} {t('toolOptions.fillPatternLimited')}</p>
        </div>
      </div>
      <footer><button type="button" className="quiet-button" onClick={() => setDraft({ ...DEFAULT_FILL_PATTERN_SETTINGS })}>{t('toolOptions.fillPatternReset')}</button><button type="button" className="quiet-button" onClick={onClose}>{t('common.cancel')}</button><button type="submit" className="primary-button">{t('common.apply')}</button></footer>
    </ModalShell>
  </div>, document.body)
}

export function FillPatternControl(props: Props) {
  const [open, setOpen] = useState(false)
  const { mode, t } = props
  const groups = [{ label: t('toolOptions.fillPatternMode'), options: ([['default', 'toolOptions.fillPatternDefault'], ['random', 'toolOptions.fillPatternRandom'], ['regular', 'toolOptions.fillPatternRegular']] as const).map(([value, label]) => ({ value, label: t(label) })) }]
  return <span className="fill-pattern-controls">
    <ThemedSelect<FillPatternMode> density="compact" value={mode ?? 'default'} groups={groups} label={t('toolOptions.fillPatternMode')} popoverWidth={160} onChange={(value) => { setOpen(false); props.onModeChange(value) }} />
    {mode && mode !== 'default' && <><button type="button" className="icon-button" aria-label={t('toolOptions.fillPatternSettings')} title={t('toolOptions.fillPatternSettings')} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}><PixelUtilityIcon kind="properties" /></button>{open && <PatternDialog {...props} mode={mode} onClose={() => setOpen(false)} />}</>}
  </span>
}
