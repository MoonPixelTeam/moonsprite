import { useState } from 'react'
import { createPortal } from 'react-dom'
import { DialogHeader } from '@/components/DialogHeader'
import { ModalShell } from '@/components/ModalShell'
import { PixelCheckbox } from '@/components/PixelCheckbox'
import { TextInput } from '@/components/TextInput'

export function HistoryDisplaySettings({ options, hidden, onChange, onClose }: {
  options: Array<{ id: string; label: string }>; hidden: readonly string[]; onChange: (hidden: string[]) => void; onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const visible = options.filter((option) => option.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  return createPortal(<div className="modal-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose() }} onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); onClose() } }}>
    <ModalShell storageKey="history-display" defaultWidth={480} defaultHeight={540} minWidth={320} minHeight={320} fitContent={false} className="history-display-modal" role="dialog" aria-modal="true" aria-label="历史记录显示设置">
      <DialogHeader title="历史记录显示设置" closeLabel="关闭" onClose={onClose} />
      <div className="modal-body history-display-body">
        <p>关闭的操作类型将从历史记录列表隐藏，不影响撤销和重做。</p>
        <TextInput aria-label="搜索历史记录类型" placeholder="搜索操作类型" value={query} onChange={(event) => setQuery(event.target.value)} />
        <div className="history-display-actions"><button type="button" className="quiet-button" onClick={() => onChange([])}>全部显示</button><button type="button" className="quiet-button" onClick={() => onChange(options.map((option) => option.id))}>全部隐藏</button><span>{options.length - options.filter((option) => hidden.includes(option.id)).length}/{options.length} 已显示</span></div>
        <div className="history-display-list component-scrollbar">
          {visible.map((option) => <label key={option.id}><PixelCheckbox checked={!hidden.includes(option.id)} onChange={() => onChange(hidden.includes(option.id) ? hidden.filter((id) => id !== option.id) : [...hidden, option.id])} /><span>{option.label}</span></label>)}
          {visible.length === 0 && <p>没有匹配的操作类型</p>}
        </div>
      </div>
      <footer><span className="modal-footer-spacer" /><button type="button" className="primary-button" onClick={onClose}>完成</button></footer>
    </ModalShell>
  </div>, document.body)
}
