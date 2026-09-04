import { useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  DEFAULT_SHORTCUT_BINDINGS,
  SHORTCUT_GROUPS,
  assignShortcutBinding,
  cloneShortcutBindings,
  createShortcutSettingsFile,
  deriveShortcutConflicts,
  findShortcutBindingOwners,
  formatShortcutBindingsForLocale,
  importShortcutBindings,
  mouseShortcutKey,
  mouseShortcutText,
  removeShortcutBinding,
  resetShortcutBindings,
  shortcutBindingBlocked,
  shortcutDisplayText,
  shortcutGroupLabels,
  shortcutIdsMayShareBinding,
  shortcutLabels,
  shortcutText,
  wheelShortcutText,
  type ShortcutBindings,
  type ShortcutGroupId,
  type ShortcutId
} from '@/core/shortcuts'
import { normalizeCanvasWheelDelta } from '@/core/canvas-input'
import { ModalShell } from '@/components/ModalShell'
import { DialogHeader } from '@/components/DialogHeader'
import { SettingsNavigation } from '@/components/SettingsNavigation'
import { TextInput } from '@/components/TextInput'
import { PixelUtilityIcon } from '@/components/PixelUtilityIcon'
import { useI18n } from '@/components/I18nProvider'
import { useFloatingWindowStack } from '@/components/floating-panel'

interface ShortcutDialogProps {
  shortcuts: ShortcutBindings
  onSave: (next: ShortcutBindings) => void
  onClose: () => void
}

interface ImportNotice {
  tone: 'success' | 'error'
  text: string
}

interface ShortcutEditorState {
  id: ShortcutId
  index?: number
}

interface ShortcutRecorderProps {
  editor: ShortcutEditorState
  labels: Record<ShortcutId, string>
  shortcuts: ShortcutBindings
  onApply: (value: string) => void
  onClose: () => void
}

const WHEEL_CAPTURE_GESTURE_GAP_MS = 160

function ShortcutRecorder({ editor, labels, shortcuts, onApply, onClose }: ShortcutRecorderProps) {
  const { locale, t } = useI18n()
  const original = editor.index === undefined ? '' : shortcuts[editor.id]?.[editor.index] ?? ''
  const [candidate, setCandidate] = useState(original)
  const candidateRef = useRef(original)
  const wheelCaptureRef = useRef<{ at: number } | null>(null)
  const recorderRef = useRef<HTMLElement>(null)
  const recorderWindowStack = useFloatingWindowStack(recorderRef)
  const updateCandidate = (value: string): void => {
    if (candidateRef.current === value) return
    candidateRef.current = value
    setCandidate(value)
  }
  const suppressMouseShortcutButton = (event: ReactMouseEvent<HTMLInputElement> | ReactPointerEvent<HTMLInputElement>): boolean => {
    if (!mouseShortcutKey(event.button)) return false
    event.preventDefault()
    event.stopPropagation()
    return true
  }
  const owners = useMemo(
    () => findShortcutBindingOwners(shortcuts, candidate, editor.id),
    [candidate, editor.id, shortcuts]
  )
  const sharedOwners = owners.filter((id) => shortcutIdsMayShareBinding(editor.id, id))
  const displacedOwners = owners.filter((id) => !shortcutIdsMayShareBinding(editor.id, id))
  const assignment = displacedOwners.length > 0
    ? t('shortcuts.assignedTo', { commands: displacedOwners.map((id) => labels[id]).join(t('shortcuts.labelSeparator')) })
    : sharedOwners.length > 0
      ? t('shortcuts.sharedWith', { commands: sharedOwners.map((id) => labels[id]).join(t('shortcuts.labelSeparator')) })
      : t('shortcuts.available')

  return createPortal(<div className="modal-backdrop shortcut-recorder-backdrop" role="presentation" onPointerDown={(event) => {
    if (event.target === event.currentTarget) onClose()
  }}>
    <section ref={recorderRef} className="modal shortcut-recorder-modal" role="dialog" aria-modal="true" aria-label={editor.index === undefined ? t('shortcuts.addTitle') : t('shortcuts.changeTitle')} style={{ zIndex: recorderWindowStack.zIndex }} onPointerDownCapture={recorderWindowStack.bringToFront} onFocusCapture={recorderWindowStack.bringToFront}>
      <DialogHeader eyebrow={t('shortcuts.eyebrow')} title={labels[editor.id]} closeLabel={t('common.close')} onClose={onClose} />
      <div className="shortcut-recorder-body">
        <label>
          <span>{t('shortcuts.key')}</span>
          <TextInput
            autoFocus
            className="shortcut-recorder-input"
            data-shortcut-recorder="true"
            placeholder={t('shortcuts.unset')}
            readOnly
            value={shortcutDisplayText(candidate, locale)}
            onKeyDown={(event) => {
              event.preventDefault()
              event.stopPropagation()
              if (event.key === 'Escape') {
                onClose()
                return
              }
              const modifierOnly = ['Control', 'Meta', 'Alt', 'Shift'].includes(event.key)
              const wheelCaptureActive = wheelCaptureRef.current && performance.now() - wheelCaptureRef.current.at < WHEEL_CAPTURE_GESTURE_GAP_MS
              if (event.repeat || (modifierOnly && wheelCaptureActive)) return
              wheelCaptureRef.current = null
              updateCandidate(shortcutText(event.nativeEvent))
            }}
            onWheel={(event) => {
              event.preventDefault()
              event.stopPropagation()
              const shortcut = wheelShortcutText(event.nativeEvent, normalizeCanvasWheelDelta(event.nativeEvent))
              if (!shortcut) return
              const now = performance.now()
              if (wheelCaptureRef.current && now - wheelCaptureRef.current.at < WHEEL_CAPTURE_GESTURE_GAP_MS) {
                wheelCaptureRef.current.at = now
                return
              }
              wheelCaptureRef.current = { at: now }
              updateCandidate(shortcut)
            }}
            onPointerDown={(event) => {
              const shortcut = mouseShortcutText(event.nativeEvent)
              if (!shortcut || !suppressMouseShortcutButton(event)) return
              event.currentTarget.focus()
              wheelCaptureRef.current = null
              updateCandidate(shortcut)
            }}
            onPointerUp={(event) => { suppressMouseShortcutButton(event) }}
            onAuxClick={(event) => { suppressMouseShortcutButton(event) }}
          />
        </label>
        <p className={displacedOwners.length > 0 ? 'shortcut-assignment transfer' : 'shortcut-assignment'}>
          <span>{t('shortcuts.currentAssignment')}</span>
          <strong>{assignment}</strong>
        </p>
      </div>
      <footer>
        <button type="button" className="quiet-button" onClick={() => { wheelCaptureRef.current = null; updateCandidate('') }}>{t('shortcuts.clear')}</button>
        <button type="button" className="quiet-button" onClick={onClose}>{t('common.cancel')}</button>
        <button type="button" className="primary-button" disabled={!candidate.trim() && editor.index === undefined} onClick={() => onApply(candidate)}>
          {editor.index === undefined ? t('shortcuts.add') : t('shortcuts.change')}
        </button>
      </footer>
    </section>
  </div>, document.body)
}

export function ShortcutDialog({ shortcuts, onSave, onClose }: ShortcutDialogProps) {
  const { locale, t } = useI18n()
  const groupLabels = shortcutGroupLabels(locale)
  const labels = shortcutLabels(locale)
  const [draftShortcuts, setDraftShortcuts] = useState<ShortcutBindings>(() => cloneShortcutBindings(shortcuts))
  const [section, setSection] = useState<ShortcutGroupId>('tools')
  const [query, setQuery] = useState('')
  const [importNotice, setImportNotice] = useState<ImportNotice | null>(null)
  const [editor, setEditor] = useState<ShortcutEditorState | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const conflictState = useMemo(() => deriveShortcutConflicts(draftShortcuts), [draftShortcuts])
  const normalizedQuery = query.trim().toLocaleLowerCase(locale)
  const shortcutGroupMatches = useMemo(() => new Map((Object.keys(SHORTCUT_GROUPS) as ShortcutGroupId[]).map((groupId) => [groupId, !normalizedQuery || SHORTCUT_GROUPS[groupId].some((id) => {
    const shortcut = formatShortcutBindingsForLocale(draftShortcuts[id] ?? [], locale)
    return [labels[id], shortcut, groupLabels[groupId], id].some((value) => value.toLocaleLowerCase(locale).includes(normalizedQuery))
  })])), [draftShortcuts, groupLabels, labels, locale, normalizedQuery])
  const visibleCommands = useMemo(() => {
    const groupId = section
    return SHORTCUT_GROUPS[groupId].map((id) => ({ id, matches: !normalizedQuery || (() => {
      const shortcut = formatShortcutBindingsForLocale(draftShortcuts[id] ?? [], locale)
      return [labels[id], shortcut, id].some((value) => value.toLocaleLowerCase(locale).includes(normalizedQuery))
    })() }))
  }, [draftShortcuts, groupLabels, labels, locale, normalizedQuery, section])

  const importShortcuts = async (file: File | undefined): Promise<void> => {
    if (!file) return
    try {
      const imported = importShortcutBindings(await file.text())
      if (!imported) throw new Error('invalid shortcut file')
      setDraftShortcuts(imported)
      setEditor(null)
      setImportNotice({ tone: 'success', text: t('shortcuts.importSuccess') })
    } catch {
      setImportNotice({ tone: 'error', text: t('shortcuts.importError') })
    }
  }
  const exportShortcuts = async (): Promise<void> => {
    try {
      const result = await window.moonSprite.saveShortcutFile('moonsprite-shortcuts.json')
      if (result.canceled || !result.filePath) return
      const bytes = new TextEncoder().encode(JSON.stringify(createShortcutSettingsFile(draftShortcuts), null, 2))
      await window.moonSprite.writeBinaryAtomic(result.filePath, bytes)
      setImportNotice(null)
    } catch {
      setImportNotice({ tone: 'error', text: t('shortcuts.exportError') })
    }
  }
  const applyEditor = (value: string): void => {
    if (!editor) return
    const result = assignShortcutBinding(draftShortcuts, editor.id, value, editor.index)
    setDraftShortcuts(result.shortcuts)
    setEditor(null)
    setImportNotice(result.displaced.length > 0 ? {
      tone: 'success',
      text: t('shortcuts.reassigned', {
        shortcut: shortcutDisplayText(value, locale),
        commands: result.displaced.map((id) => labels[id]).join(t('shortcuts.labelSeparator'))
      })
    } : null)
  }
  const conflictSummary = conflictState.conflicts.map((item) => t('shortcuts.conflictItem', {
    shortcut: shortcutDisplayText(item.shortcut, locale),
    winner: labels[item.winner],
    blocked: item.conflicting.map((id) => labels[id]).join(t('shortcuts.labelSeparator'))
  })).join(t('shortcuts.conflictSeparator'))

  return <div className="modal-backdrop" role="presentation">
    <ModalShell storageKey="shortcuts" defaultWidth={800} defaultHeight={620} className="settings-modal shortcut-settings-modal" role="dialog" aria-label={t('shortcuts.title')}>
      <DialogHeader eyebrow={t('shortcuts.eyebrow')} title={t('shortcuts.title')} closeLabel={t('common.close')} onClose={onClose} />
      <div className="settings-layout">
        <aside className="shortcut-settings-sidebar">
          <div className="shortcut-sidebar-search">
            <TextInput className="shortcut-search" placeholder={t('shortcuts.search')} aria-label={t('shortcuts.searchGlobal')} value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          <SettingsNavigation label={t('shortcuts.title')} value={section} items={(Object.keys(SHORTCUT_GROUPS) as ShortcutGroupId[]).map((value) => ({ value, label: groupLabels[value], muted: Boolean(normalizedQuery && !shortcutGroupMatches.get(value)) }))} onChange={setSection} />
        </aside>
        <main className="shortcut-settings-content component-scrollbar">
          <header className="shortcut-content-header">
            <strong>{normalizedQuery ? t('shortcuts.resultsTitle') : groupLabels[section]}</strong>
            <span>{t('shortcuts.commandCount', { count: visibleCommands.length })}</span>
          </header>
          {importNotice && <p className={`shortcut-import-notice ${importNotice.tone}`} role={importNotice.tone === 'success' ? 'status' : 'alert'}>{importNotice.text}</p>}
          {conflictSummary && <p className="shortcut-conflict">{conflictSummary}</p>}
          {visibleCommands.length === 0 ? <p className="shortcut-empty">{t('shortcuts.noResults')}</p> : <div className="shortcut-list">
            {visibleCommands.map(({ id, matches }) => {
              const bindings = draftShortcuts[id] ?? []
              const defaults = DEFAULT_SHORTCUT_BINDINGS[id]
              const customized = bindings.length !== defaults.length || bindings.some((value, index) => value !== defaults[index])
              const blockedOwner = conflictState.blocked[id]
              return <div className={`shortcut-command-row${customized ? ' customized' : ''}${blockedOwner ? ' conflicted' : ''}${normalizedQuery && !matches ? ' search-unmatched' : ''}`} key={id}>
                <div className="shortcut-command-name">
                  <strong>{labels[id]}</strong>
                </div>
                <div className="shortcut-command-bindings">
                  {bindings.length === 0 && <span className="shortcut-unset">{t('shortcuts.unset')}</span>}
                  {bindings.map((binding, index) => {
                    const blocked = shortcutBindingBlocked(conflictState, id, binding)
                    const conflictTitle = blockedOwner ? t('shortcuts.conflictHint', { winner: labels[blockedOwner] }) : undefined
                    const bindingDisplay = shortcutDisplayText(binding, locale)
                    return <div className={`shortcut-binding${blocked ? ' conflicted' : ''}`} title={blocked ? conflictTitle : undefined} key={`${binding}:${index}`}>
                      <button type="button" className="shortcut-key" title={t('shortcuts.changeAria', { shortcut: bindingDisplay, label: labels[id] })} aria-label={t('shortcuts.changeAria', { shortcut: bindingDisplay, label: labels[id] })} onClick={() => setEditor({ id, index })}><kbd>{bindingDisplay}</kbd></button>
                      <button type="button" className="shortcut-icon-button" title={t('shortcuts.deleteAria', { shortcut: bindingDisplay, label: labels[id] })} aria-label={t('shortcuts.deleteAria', { shortcut: bindingDisplay, label: labels[id] })} onClick={() => { setImportNotice(null); setDraftShortcuts(removeShortcutBinding(draftShortcuts, id, index)) }}><PixelUtilityIcon kind="delete" /></button>
                    </div>
                  })}
                </div>
                <div className="shortcut-command-actions">
                  <button type="button" className="shortcut-add-button" title={t('shortcuts.addAria', { label: labels[id] })} aria-label={t('shortcuts.addAria', { label: labels[id] })} onClick={() => setEditor({ id })}><PixelUtilityIcon kind="plus" /></button>
                  <button type="button" className="shortcut-reset-button" disabled={!customized} title={t('shortcuts.resetAria', { label: labels[id] })} aria-label={t('shortcuts.resetAria', { label: labels[id] })} onClick={() => { setImportNotice(null); setDraftShortcuts(resetShortcutBindings(draftShortcuts, id)) }}><PixelUtilityIcon kind="restore" /></button>
                </div>
              </div>
            })}
          </div>}
        </main>
      </div>
      <footer>
        <input ref={importInputRef} hidden type="file" accept="application/json,.json" onChange={(event) => { void importShortcuts(event.target.files?.[0]); event.currentTarget.value = '' }} />
        <button className="quiet-button" onClick={() => importInputRef.current?.click()}><PixelUtilityIcon kind="folderOpen" scale={2} />{t('shortcuts.import')}</button>
        <button className="quiet-button" onClick={() => { void exportShortcuts() }}><PixelUtilityIcon kind="export" scale={2} />{t('shortcuts.export')}</button>
        <button className="quiet-button" onClick={() => { setImportNotice(null); setDraftShortcuts(cloneShortcutBindings(DEFAULT_SHORTCUT_BINDINGS)) }}>{t('common.reset')}</button>
        <button className="primary-button" onClick={() => { onSave(cloneShortcutBindings(draftShortcuts)); onClose() }}>{t('common.done')}</button>
      </footer>
    </ModalShell>
    {editor && <ShortcutRecorder editor={editor} labels={labels} shortcuts={draftShortcuts} onApply={applyEditor} onClose={() => setEditor(null)} />}
  </div>
}
