import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { DialogHeader } from '@/components/DialogHeader'
import { ModalShell } from '@/components/ModalShell'
import { PixelUtilityIcon } from '@/components/PixelUtilityIcon'
import { useI18n } from '@/components/I18nProvider'
import { DEFAULT_TOOL_RAIL, type ToolRailPreference } from '@/core/tool-rail-preferences'
import { ToolRailLayoutEditor } from './ToolRailLayoutEditor'

export function ToolRailLayoutDialog({ value, onConfirm, onClose }: {
  value: ToolRailPreference[]; onConfirm: (value: ToolRailPreference[]) => void; onClose: () => void
}) {
  const { locale, t } = useI18n()
  const [draft, setDraft] = useState(() => structuredClone(value))
  const content = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement
    content.current?.querySelector<HTMLInputElement>('input')?.focus()
    const close = (event: Event) => {
      if ((event as CustomEvent<{ target?: string }>).detail?.target === 'tool-rail-layout') onClose()
    }
    window.addEventListener('moonsprite:close-dialog', close)
    return () => {
      window.removeEventListener('moonsprite:close-dialog', close)
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus()
    }
  }, [onClose])
  return createPortal(<div className="modal-backdrop modal-overlay-backdrop tool-rail-dialog-backdrop" role="presentation" onPointerDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <ModalShell storageKey="tool-rail-layout" defaultWidth={920} defaultHeight={680} minWidth={560} minHeight={420} maxWidth={1200} maxHeight={900} fitContent={false}
      className="tool-rail-layout-modal" role="dialog" aria-modal="true" aria-label={locale === 'zh-CN' ? '自定义工具栏' : 'Customize toolbar'}>
      <DialogHeader title={locale === 'zh-CN' ? '自定义工具栏' : 'Customize toolbar'} onClose={onClose} closeLabel={t('common.close')} />
      <div className="tool-rail-dialog-body component-scrollbar" ref={content}><ToolRailLayoutEditor value={draft} onChange={setDraft} /></div>
      <footer>
        <button type="button" className="quiet-button" onClick={() => setDraft(structuredClone(DEFAULT_TOOL_RAIL))}><PixelUtilityIcon kind="restore" />{t('preferences.restoreDefaults')}</button>
        <span className="modal-footer-spacer" />
        <button type="button" className="quiet-button" onClick={onClose}>{t('preferences.cancel')}</button>
        <button type="button" className="primary-button" onClick={() => onConfirm(draft)}>{t('preferences.confirm')}</button>
      </footer>
    </ModalShell>
  </div>, document.body)
}
