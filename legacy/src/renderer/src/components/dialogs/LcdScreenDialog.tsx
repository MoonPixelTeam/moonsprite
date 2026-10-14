import { useState } from 'react'
import { DialogHeader } from '@/components/DialogHeader'
import { FormField } from '@/components/FormField'
import { ModalShell } from '@/components/ModalShell'
import { NumberInput } from '@/components/NumberInput'
import { useI18n } from '@/components/I18nProvider'
import { normalizeLcdScreenFilterOptions, type LcdScreenFilterOptions } from '@/core/filter-presets'

export function LcdScreenDialog({ onClose, onApply }: { onClose: () => void; onApply: (options: LcdScreenFilterOptions) => void }) {
  const { t } = useI18n()
  const [width, setWidth] = useState(1)
  const [height, setHeight] = useState(1)

  return <div className="modal-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <ModalShell as="form" storageKey="lcd-screen-filter" defaultWidth={420} defaultHeight={300} minWidth={360} minHeight={240} maxWidth={600} maxHeight={460} className="lcd-screen-modal" role="dialog" aria-modal="true" aria-labelledby="lcd-screen-title" onSubmit={(event) => { event.preventDefault(); onApply(normalizeLcdScreenFilterOptions({ width, height })); onClose() }}>
      <DialogHeader eyebrow="LCD FILTER" title={t('filter.lcdScreenDialogTitle')} titleId="lcd-screen-title" closeLabel={t('common.close')} onClose={onClose} />
      <div className="modal-body lcd-screen-modal-body">
        <p className="modal-note">{t('filter.lcdScreenDialogHint')}</p>
        <div className="lcd-screen-size-grid">
          <FormField label={t('common.width')}><NumberInput autoFocus min={1} max={64} suffix="px" value={width} onValueChange={(value) => setWidth(Math.max(1, Math.round(value)))} /></FormField>
          <FormField label={t('common.height')}><NumberInput min={1} max={64} suffix="px" value={height} onValueChange={(value) => setHeight(Math.max(1, Math.round(value)))} /></FormField>
        </div>
      </div>
      <footer><span className="modal-footer-spacer" /><button type="button" className="quiet-button" onClick={onClose}>{t('common.cancel')}</button><button type="submit" className="primary-button">{t('common.apply')}</button></footer>
    </ModalShell>
  </div>
}
