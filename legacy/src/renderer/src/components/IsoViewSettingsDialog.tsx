import { useEffect, useRef, useState } from 'react'
import { ColorValueControl } from '@/components/ColorValueControl'
import { DialogHeader } from '@/components/DialogHeader'
import { FormField } from '@/components/FormField'
import { LivePreviewToggle } from '@/components/LivePreviewToggle'
import { ModalShell } from '@/components/ModalShell'
import { NumberInput } from '@/components/NumberInput'
import { PreferenceToggle } from '@/components/PreferenceToggle'
import { SegmentedControl } from '@/components/SegmentedControl'
import { useI18n } from '@/components/I18nProvider'
import { MAX_ISO_GUIDE_THICKNESS, MAX_ISO_GUIDE_UNIT_SIZE, MAX_ISO_STAIR_STEP, MIN_ISO_GUIDE_THICKNESS, MIN_ISO_GUIDE_UNIT_SIZE, MIN_ISO_STAIR_STEP, parseIsoViewPreferences, type IsoViewPreferences } from '@/core/file-preferences'

interface IsoViewSettingsDialogProps {
  value: IsoViewPreferences
  onApply: (value: IsoViewPreferences) => void
  onClose: () => void
  onPreview: (value: IsoViewPreferences) => void
}

const copyPreferences = (value: IsoViewPreferences): IsoViewPreferences => ({
  ...value,
  guideColors: {
    solid: { ...value.guideColors.solid },
    pixel: { ...value.guideColors.pixel }
  }
})

export function IsoViewSettingsDialog({ value, onApply, onClose, onPreview }: IsoViewSettingsDialogProps) {
  const { t } = useI18n()
  const baselineRef = useRef<IsoViewPreferences>(copyPreferences(value))
  const settledRef = useRef(false)
  const onPreviewRef = useRef(onPreview)
  const [draft, setDraft] = useState<IsoViewPreferences>(() => copyPreferences(baselineRef.current))
  const [previewEnabled, setPreviewEnabled] = useState(true)
  onPreviewRef.current = onPreview
  const preview = (next: IsoViewPreferences): void => onPreviewRef.current(copyPreferences(next))
  const update = (next: IsoViewPreferences): void => {
    const normalized = parseIsoViewPreferences(JSON.stringify(next))
    setDraft(normalized)
    if (previewEnabled) preview(normalized)
  }
  const togglePreview = (checked: boolean): void => {
    setPreviewEnabled(checked)
    preview(checked ? draft : baselineRef.current)
  }
  const cancel = (): void => {
    settledRef.current = true
    preview(baselineRef.current)
    onClose()
  }
  const apply = (): void => {
    settledRef.current = true
    onApply(copyPreferences(draft))
    onClose()
  }
  useEffect(() => () => {
    if (!settledRef.current) preview(baselineRef.current)
  }, [])
  const guideColor = draft.guideColors[draft.guideLineStyle]

  return <div className="modal-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) cancel() }}>
    <ModalShell as="form" storageKey="iso-view-settings-v4" placement="stage-top-left" defaultWidth={400} defaultHeight={410} fitContentKey="iso-view-settings-fields-v3" minWidth={360} minHeight={370} maxWidth={520} maxHeight={520} className="iso-view-settings-modal" onSubmit={(event) => { event.preventDefault(); apply() }} aria-labelledby="iso-view-settings-title">
      <DialogHeader title={t('isoViewSettings.title')} titleId="iso-view-settings-title" closeLabel={t('common.close')} onClose={cancel} />
      <div className="modal-body iso-view-settings-body">
        <FormField layout="inline" label={t('isoViewSettings.stairStep')} tooltip={t('isoViewSettings.stairStepDescription')}><NumberInput live value={draft.stairStep} min={MIN_ISO_STAIR_STEP} max={MAX_ISO_STAIR_STEP} step={1} suffix=":1" onValueChange={(stairStep) => update({ ...draft, stairStep })} /></FormField>
        <FormField layout="inline" label={t('isoViewSettings.guideLineStyle')}><SegmentedControl className="iso-guide-line-style-control" label={t('isoViewSettings.guideLineStyle')} value={draft.guideLineStyle} options={[{ value: 'solid', label: t('isoViewSettings.guideLineStyle.solid') }, { value: 'pixel', label: t('isoViewSettings.guideLineStyle.pixel') }]} onChange={(guideLineStyle) => update({ ...draft, guideLineStyle })} /></FormField>
        <FormField layout="inline" label={t('isoViewSettings.guideOrigin')}><div className="iso-guide-origin-fields"><span><span aria-hidden="true">X</span><NumberInput live aria-label={t('isoViewSettings.guideOriginX')} value={draft.guideOriginX} step={1} suffix="px" onValueChange={(guideOriginX) => update({ ...draft, guideOriginX })} /></span><span><span aria-hidden="true">Y</span><NumberInput live aria-label={t('isoViewSettings.guideOriginY')} value={draft.guideOriginY} step={1} suffix="px" onValueChange={(guideOriginY) => update({ ...draft, guideOriginY })} /></span></div></FormField>
        <FormField layout="inline" label={t('isoViewSettings.guideUnitSize')}><NumberInput live value={draft.guideUnitSize} min={MIN_ISO_GUIDE_UNIT_SIZE} max={MAX_ISO_GUIDE_UNIT_SIZE} step={1} suffix="px" onValueChange={(guideUnitSize) => update({ ...draft, guideUnitSize })} /></FormField>
        <FormField layout="inline" label={t('isoViewSettings.guideColor')}><ColorValueControl color={guideColor} density="regular" storageKey={`iso-view-guide-color-${draft.guideLineStyle}`} inPalette={false} fillWithColor label={t('isoViewSettings.guideColor')} onChange={(nextGuideColor) => update({ ...draft, guideColors: { ...draft.guideColors, [draft.guideLineStyle]: nextGuideColor } })} /></FormField>
        <FormField layout="inline" label={t('isoViewSettings.guideThickness')}><NumberInput live disabled={draft.guideLineStyle === 'pixel'} value={draft.guideThickness} min={MIN_ISO_GUIDE_THICKNESS} max={MAX_ISO_GUIDE_THICKNESS} step={1} suffix="px" onValueChange={(guideThickness) => update({ ...draft, guideThickness })} /></FormField>
        <PreferenceToggle checked={draft.forceLineAlignment} label={t('isoViewSettings.forceLineAlignment')} tooltip={t('isoViewSettings.forceLineAlignmentDescription', { step: draft.stairStep })} onChange={(forceLineAlignment) => update({ ...draft, forceLineAlignment })} />
        <PreferenceToggle checked={draft.snapToGrid} label={t('isoViewSettings.snapToGrid')} tooltip={t('isoViewSettings.snapToGridDescription')} onChange={(snapToGrid) => update({ ...draft, snapToGrid })} />
      </div>
      <footer><LivePreviewToggle checked={previewEnabled} onChange={togglePreview} /><span className="modal-footer-spacer" /><button type="button" className="quiet-button" onClick={cancel}>{t('common.cancel')}</button><button type="submit" className="primary-button">{t('common.done')}</button></footer>
    </ModalShell>
  </div>
}
