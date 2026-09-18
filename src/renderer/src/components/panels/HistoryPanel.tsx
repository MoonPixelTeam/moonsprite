import { PixelUtilityIcon } from '@/components/PixelUtilityIcon'
import { writeStoredString } from '@/core/storage'
import { HistoryDisplaySettings } from './HistoryDisplaySettings'
import { HISTORY_DISPLAY_KEY, historyDisplayType, historyDisplayOptions, readHiddenHistoryTypes } from './history-display-options'
import { useEffect, useRef, useState } from 'react'
import { FloatingDockPreview, PanelResizeHandles, useFloatingPanel } from '@/components/floating-panel'
import { useI18n } from '@/components/I18nProvider'
import type { DockDragProps } from '@/components/workspace-panel-types'
import { useWorkspace, type DocumentSession } from '@/store/workspace'

export function HistoryPanel({ session, docked = false, onDockDragStart, onPanelContextMenu, onFloatingDock }: { session: DocumentSession } & DockDragProps) {
  const { t, locale } = useI18n()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [hidden, setHidden] = useState(readHiddenHistoryTypes)
  const changeHidden = (next: string[]): void => {
    if (!writeStoredString(HISTORY_DISPLAY_KEY, JSON.stringify(next))) useWorkspace.getState().setMessage('历史记录显示设置无法保存。')
    setHidden(next)
    window.dispatchEvent(new Event('moonsprite:history-display-changed'))
  }
  useEffect(() => {
    const refresh = (): void => setHidden(readHiddenHistoryTypes())
    window.addEventListener('moonsprite:history-display-changed', refresh)
    window.addEventListener('storage', refresh)
    return () => { window.removeEventListener('moonsprite:history-display-changed', refresh); window.removeEventListener('storage', refresh) }
  }, [])
  const historyRevision = useWorkspace((state) => state.sessions.find((item) => item.document.id === session.document.id)?.history.revision ?? session.history.revision)
  const currentSession = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id) ?? session
  const timeline = currentSession.history.timeline
  const currentRef = useRef<HTMLButtonElement>(null)
  const defaultPosition = { x: Math.max(8, window.innerWidth - 320), y: 96, width: 300, height: 420 }
  const floating = useFloatingPanel(docked ? null : defaultPosition, false, true, 'moonsprite.history-panel.v1', true, onFloatingDock, docked)

  useEffect(() => {
    currentRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [historyRevision, timeline.position])

  const renderEntry = (position: number, label: string) => {
    const selected = timeline.position === position
    const future = position > timeline.position
    return <button
      key={`${position}:${label}`}
      ref={selected ? currentRef : undefined}
      className={`history-entry ${selected ? 'selected' : ''} ${future ? 'future' : ''}`}
      type="button"
      role="option"
      aria-selected={selected}
      data-history-position={position}
      onClick={() => { if (!selected) useWorkspace.getState().setHistoryPosition(position) }}
    >
      <span className="history-entry-marker" aria-hidden="true" />
      <span className="history-entry-label">{label}</span>
    </button>
  }

  return <><section ref={floating.ref} className={`panel history-panel ${floating.style ? 'floating-panel' : ''}`} style={floating.style} onPointerDown={floating.bringToFront} onContextMenu={onPanelContextMenu}>
    <header aria-label={t('panel.history')} onPointerDown={(event) => floating.style ? floating.startDrag(event) : onDockDragStart?.(event, floating.startDetachedDrag)}>
      <span className="history-panel-heading"><strong>{t('panel.history')}</strong><small aria-label={t('history.position', { current: timeline.position, total: timeline.entries.length })}>（{timeline.position}/{timeline.entries.length}）</small></span>
      <span className="panel-actions" onPointerDown={(event) => event.stopPropagation()}>
      <button type="button" className={settingsOpen ? 'active' : ''} title="历史记录显示设置" aria-label="历史记录显示设置" aria-expanded={settingsOpen} onClick={() => setSettingsOpen(true)}><PixelUtilityIcon kind="properties" /></button>
      </span>
    </header>
    <div className="history-list component-scrollbar" role="listbox" aria-label={t('history.listAria')}>
      {renderEntry(0, t('history.start'))}
      {timeline.entries.filter((entry) => !hidden.includes(historyDisplayType(entry.label))).map((entry) => renderEntry(entry.position, entry.label))}
    </div>
    {floating.style && <PanelResizeHandles onResize={floating.startResize} />}
  </section><FloatingDockPreview style={floating.dockPreview} />
  {settingsOpen && <HistoryDisplaySettings options={historyDisplayOptions(locale, timeline.entries.map((entry) => entry.label), hidden)} hidden={hidden} onChange={changeHidden} onClose={() => setSettingsOpen(false)} />}
  </>
}
