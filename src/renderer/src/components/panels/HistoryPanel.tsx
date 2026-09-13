import { useEffect, useRef } from 'react'
import { FloatingDockPreview, PanelResizeHandles, useFloatingPanel } from '@/components/floating-panel'
import { useI18n } from '@/components/I18nProvider'
import type { DockDragProps } from '@/components/workspace-panel-types'
import { useWorkspace, type DocumentSession } from '@/store/workspace'

export function HistoryPanel({ session, docked = false, onDockDragStart, onPanelContextMenu, onFloatingDock }: { session: DocumentSession } & DockDragProps) {
  const { t } = useI18n()
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
      <strong>{t('panel.history')}</strong>
      <small aria-label={t('history.position', { current: timeline.position, total: timeline.entries.length })}>{timeline.position}/{timeline.entries.length}</small>
    </header>
    <div className="history-list component-scrollbar" role="listbox" aria-label={t('history.listAria')}>
      {renderEntry(0, t('history.start'))}
      {timeline.entries.map((entry) => renderEntry(entry.position, entry.label))}
    </div>
    {floating.style && <PanelResizeHandles onResize={floating.startResize} />}
  </section><FloatingDockPreview style={floating.dockPreview} /></>
}
