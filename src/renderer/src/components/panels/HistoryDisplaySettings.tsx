import { useI18n } from '@/components/I18nProvider'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { DialogHeader } from '@/components/DialogHeader'
import { ModalShell } from '@/components/ModalShell'
import { PixelCheckbox } from '@/components/PixelCheckbox'
import { TextInput } from '@/components/TextInput'

export function HistoryDisplaySettings({ options, hidden, onChange, onClose }: {
  options: Array<{ id: string; label: string }>; hidden: readonly string[]; onChange: (hidden: string[]) => void; onClose: () => void
}) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const visible = options.filter((option) => option.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  return createPortal(<div className="modal-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose() }} onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); onClose() } }}>
    <ModalShell storageKey="history-display" defaultWidth={480} defaultHeight={540} minWidth={320} minHeight={320} fitContent={false} className="history-display-modal" role="dialog" aria-modal="true" aria-label={t('history.display.title')}>
      <DialogHeader title={t('history.display.title')} closeLabel={t('componentLibrary.preview.close')} onClose={onClose} />
      <div className="modal-body history-display-body">
        <p>{t('history.display.hint')}</p>
        <TextInput aria-label={t('history.display.searchAria')} placeholder={t('history.display.search')} value={query} onChange={(event) => setQuery(event.target.value)} />
        <div className="history-display-actions"><button type="button" className="quiet-button" onClick={() => onChange([])}>{t('history.display.showAll')}</button><button type="button" className="quiet-button" onClick={() => onChange(options.map((option) => option.id))}>{t('history.display.hideAll')}</button><span>{t('history.display.shown', { shown: options.length - options.filter((option) => hidden.includes(option.id)).length, total: options.length })}</span></div>
        <div className="history-display-list component-scrollbar">
          {visible.map((option) => <label key={option.id}><PixelCheckbox checked={!hidden.includes(option.id)} onChange={() => onChange(hidden.includes(option.id) ? hidden.filter((id) => id !== option.id) : [...hidden, option.id])} /><span>{option.label}</span></label>)}
          {visible.length === 0 && <p>{t('history.display.noMatch')}</p>}
        </div>
      </div>
      <footer><span className="modal-footer-spacer" /><button type="button" className="primary-button" onClick={onClose}>{t('componentLibrary.done')}</button></footer>
    </ModalShell>
  </div>, document.body)
}
