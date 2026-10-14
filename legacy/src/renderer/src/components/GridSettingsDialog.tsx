import { useState } from 'react'
import type { GridSettings } from '@shared/types-view'
import { normalizeGridSettings } from '@/core/grid'
import { useI18n } from '@/components/I18nProvider'
import { DialogHeader } from '@/components/DialogHeader'
import { ModalShell } from '@/components/ModalShell'
import { FormField } from '@/components/FormField'
import { NumberInput } from '@/components/NumberInput'

interface GridSettingsDialogProps {
  value?: GridSettings
  onApply: (value: GridSettings) => void
  onClose: () => void
}

export function GridSettingsDialog({ value, onApply, onClose }: GridSettingsDialogProps) {
  const { t } = useI18n()
  const [draft, setDraft] = useState<GridSettings>(() => normalizeGridSettings(value))
  const update = (key: keyof GridSettings, value: number): void => {
    setDraft((current) => normalizeGridSettings({ ...current, [key]: value }))
  }

  return <div className="modal-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <ModalShell as="form" storageKey="grid-settings-v2" defaultWidth={360} defaultHeight={240} fitContentKey="grid-settings-fields-v2" minWidth={320} minHeight={230} maxWidth={480} maxHeight={360} className="grid-settings-modal" onSubmit={(event) => { event.preventDefault(); onApply(normalizeGridSettings(draft)); onClose() }} aria-labelledby="grid-settings-title">
      <DialogHeader title={t('gridSettings.title')} titleId="grid-settings-title" closeLabel={t('common.close')} onClose={onClose} />
      <div className="modal-body grid-settings-body">
        <FormField label={t('gridSettings.x')}><NumberInput live autoFocus value={draft.x} step={1} suffix="px" onFocus={(event) => event.currentTarget.select()} onValueChange={(next) => update('x', next)} /></FormField>
        <FormField label={t('gridSettings.y')}><NumberInput live value={draft.y} step={1} suffix="px" onValueChange={(next) => update('y', next)} /></FormField>
        <FormField label={t('gridSettings.width')}><NumberInput live value={draft.width} min={1} step={1} suffix="px" onValueChange={(next) => update('width', next)} /></FormField>
        <FormField label={t('gridSettings.height')}><NumberInput live value={draft.height} min={1} step={1} suffix="px" onValueChange={(next) => update('height', next)} /></FormField>
      </div>
      <footer><button type="button" className="quiet-button" onClick={onClose}>{t('common.cancel')}</button><button type="submit" className="primary-button">{t('common.done')}</button></footer>
    </ModalShell>
  </div>
}
