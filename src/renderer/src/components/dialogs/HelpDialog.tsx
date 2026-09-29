import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/Button'
import { TextInput } from '@/components/TextInput'
import { SettingsNavigation } from '@/components/SettingsNavigation'
import { SettingsSection } from '@/components/SettingsSection'
import { DialogHeader } from '@/components/DialogHeader'
import { ModalShell } from '@/components/ModalShell'
import { useI18n } from '@/components/I18nProvider'
import type { ShortcutId } from '@/core/shortcuts'
import { shortcutLabels } from '@/locales/shortcut-labels'
import { helpArticles } from './help-content'
import { tipsArticles } from './tips-content'
import './help-dialog.css'

interface HelpDialogProps {
  mode?: 'help' | 'tips'
  onClose: () => void
  onOpenShortcuts: () => void
  onOpenDiagnostics: () => void
  shortcutFor: (id: ShortcutId) => string
}

export function HelpDialog({ mode = 'help', onClose, onOpenShortcuts, onOpenDiagnostics, shortcutFor }: HelpDialogProps) {
  const { locale, t } = useI18n()
  const language = locale === 'zh-CN' ? 0 : 1
  const labels = shortcutLabels(locale)
  const text = (zh: string, en: string) => language === 0 ? zh : en
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState(mode === 'help' ? 'first-art' : 'modifier-brushSizeAdjust')
  const articles = mode === 'help' ? helpArticles : tipsArticles
  const articleRef = useRef<HTMLElement>(null)
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  const results = articles.filter(article => {
    const content = [article.title[language], ...article.steps.map(step => step[language]), article.tip[language], ...article.shortcuts.flatMap(id => [labels[id], shortcutFor(id)])].join(' ').toLocaleLowerCase()
    return words.every(word => content.includes(word))
  })
  const selected = results.find(article => article.id === selectedId) ?? results[0]
  const categories = [
    ['start', mode === 'tips' ? text('修饰操作', 'Modifiers') : text('入门与保存', 'Getting started')],
    ['create', mode === 'tips' ? text('快捷操作', 'Quick actions') : text('创作操作', 'Creating artwork')],
    ['fix', mode === 'tips' ? text('特色功能', 'Features') : text('遇到问题', 'Troubleshooting')]
  ] as const
  const openAction = (action: () => void) => { onClose(); action() }

  return createPortal(<div className="modal-backdrop modal-overlay-backdrop" role="presentation" onPointerDown={event => { if (event.target === event.currentTarget) onClose() }} onKeyDown={event => {
    if (event.key === 'Escape') { event.stopPropagation(); onClose() }
  }}>
    <ModalShell storageKey={`usage-${mode}`} className="help-modal" defaultWidth={920} defaultHeight={720}
      minWidth={360} minHeight={340} maxWidth={1100} maxHeight={900} fitContent={false}
      role="dialog" aria-modal="true" aria-labelledby="usage-help-title">
      <DialogHeader titleId="usage-help-title" title={mode === 'tips' ? text('使用技巧', 'Tips & tricks') : text('使用帮助', 'User guide')}
        onClose={onClose} closeLabel={t('common.close')} />
      <div className="help-search">
        <label htmlFor="usage-help-search">{mode === 'tips' ? text('搜索技巧', 'Search tips') : text('搜索帮助', 'Search help')}</label>
        <TextInput id="usage-help-search" type="search" autoFocus value={query}
          placeholder={mode === 'tips' ? text('例如：Shift、笔刷、补间、缩时', 'Try: Shift, brush, tween, timelapse') : text('例如：撤销、选区、导出、画不出来', 'Try: undo, selection, export, strokes')}
          onChange={event => { setQuery(event.target.value); articleRef.current?.scrollTo?.(0, 0) }} />
        <span role="status">{text(`${results.length} 篇`, `${results.length} articles`)}</span>
      </div>
      {selected ? <div className="help-layout">
        <div className="help-topics component-scrollbar">
          {categories.map(([id, label]) => {
            const articles = results.filter(article => article.category === id)
            return articles.length > 0 && <section key={id} className="help-topic-group">
              <SettingsNavigation label={label} value={selected.id}
                items={articles.map(article => ({ value: article.id, label: article.title[language] }))}
                onChange={id => { setSelectedId(id); articleRef.current?.scrollTo?.(0, 0) }} />
            </section>
          })}
        </div>
        <article className="help-article component-scrollbar" ref={articleRef} aria-labelledby="help-article-title" tabIndex={0}>
          <div className="help-article-heading"><span className="eyebrow">{categories.find(([id]) => id === selected.category)?.[1]}</span><h3 id="help-article-title">{selected.title[language]}</h3></div>
          <ol>{selected.steps.map((step, index) => <li key={`${selected.id}-${index}`}>{step[language]}</li>)}</ol>
          {selected.tip[language] && <aside className="help-tip"><strong>{text('操作提示', 'Tip')}</strong><p>{selected.tip[language]}</p></aside>}
          {selected.shortcuts.length > 0 && <SettingsSection className="help-shortcut-section" title={text('相关快捷键 · 当前设置', 'Related shortcuts · current settings')}>
          <dl className="help-shortcuts">{selected.shortcuts.map(id => <div key={id}>
            <dt>{labels[id]}</dt>
            <dd><kbd>{shortcutFor(id) || text('未设置', 'Not assigned')}</kbd></dd>
          </div>)}</dl></SettingsSection>}
        </article>
      </div> : <div className="help-empty"><h3>{text('没有找到相关内容', 'No matching articles')}</h3>
        <p>{text('试试更短的词，例如“保存”或“移动”，也可以清空搜索浏览全部主题。', 'Try a shorter term such as “save” or “move”, or clear the search to browse all topics.')}</p>
        <Button onClick={() => setQuery('')}>{text('查看全部主题', 'Show all topics')}</Button>
      </div>}
      <footer className="help-footer">
        <div className="help-footer-tools"><Button onClick={() => openAction(onOpenShortcuts)}>{text('快捷键设置', 'Shortcut settings')}</Button>
        <Button onClick={() => openAction(onOpenDiagnostics)}>{t('app.menu.help.diagnostics')}</Button></div>
        <Button variant="primary" onClick={onClose}>{t('common.close')}</Button>
      </footer>
    </ModalShell>
  </div>, document.querySelector('.app-shell') ?? document.body)
}
