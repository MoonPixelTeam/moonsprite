import { createPortal } from 'react-dom'
import { lazy, Suspense, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useI18n } from '@/components/I18nProvider'
import { PanelResizeHandles, useFloatingPanel } from '@/components/floating-panel'
import { PixelUtilityIcon } from '@/components/PixelUtilityIcon'
import type { FloatingPosition } from '@/core/panel-preferences'
import type { DocumentSession } from '@/store/workspace'
import { useWorkspace } from '@/store/workspace'
import { isCanvasMiddlePanPointer } from '@/components/canvas-reference-input'
import { QuickCommandBar } from './QuickCommandBar'
import type { QuickCommandSettingsTarget } from './quick-command-registry'
import type { ShortcutId } from '@/core/shortcuts'

const LazyCanvasStage = lazy(() => import('@/components/CanvasStage').then(({ CanvasStage }) => ({ default: CanvasStage })))

interface FloatingDocumentWindowProps {
  session: DocumentSession
  initialPosition: FloatingPosition
  pinned: boolean
  stackIndex: number
  onActivate: (documentId: string) => void
  onPinnedChange: (documentId: string, pinned: boolean) => void
  onReturnToTabs: (documentId: string, visibleIndex?: number) => void
  onCloseDocument: (documentId: string) => void
  shortcutFor: (id: ShortcutId) => string
  onToggleMirror: (axis: 'horizontal' | 'vertical') => void
  onOpenAntiAlias: () => void
  onOpenOutline?: () => void
  onOpenPreferences: () => void
  onOpenCommandSettings?: (target: QuickCommandSettingsTarget) => void
}

interface FloatingTabReturnPreview {
  insertIndex: number
  left: number
  top: number
  height: number
}

interface FloatingTabDragGhost {
  left: number
  top: number
  width: number
  height: number
}

interface FloatingDocumentDragState {
  pointerId: number
  startX: number
  startY: number
  pointerOffsetX: number
  ghostWidth: number
  moved: boolean
}

const FLOATING_DOCUMENT_Z_INDEX = 181
const PINNED_DOCUMENT_Z_INDEX = 10020

export function FloatingDocumentWindow({ session, initialPosition, pinned, stackIndex, onActivate, onPinnedChange, onReturnToTabs, onCloseDocument, shortcutFor, onToggleMirror, onOpenAntiAlias, onOpenOutline, onOpenPreferences, onOpenCommandSettings }: FloatingDocumentWindowProps) {
  const { t } = useI18n()
  const floating = useFloatingPanel(initialPosition, false, false, undefined, true, undefined, false, { minWidth: 280, minHeight: 200 })
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [tabReturnPreview, setTabReturnPreview] = useState<FloatingTabReturnPreview | null>(null)
  const [tabDragGhost, setTabDragGhost] = useState<FloatingTabDragGhost | null>(null)
  const dragRef = useRef<FloatingDocumentDragState | null>(null)
  const tabReturnPreviewRef = useRef<FloatingTabReturnPreview | null>(null)
  const active = useWorkspace((state) => state.activeId === session.document.id)

  useEffect(() => {
    const closeOutside = (event: PointerEvent): void => {
      if (event.target instanceof Element && !event.target.closest('.floating-document-context-menu')) setContextMenu(null)
    }
    const close = (): void => setContextMenu(null)
    window.addEventListener('pointerdown', closeOutside, true)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('pointerdown', closeOutside, true)
      window.removeEventListener('blur', close)
    }
  }, [])

  useEffect(() => {
    const clearPreview = (): void => {
      tabReturnPreviewRef.current = null
      setTabReturnPreview(null)
      setTabDragGhost(null)
    }
    const move = (event: PointerEvent): void => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >= 5) drag.moved = true
      if (!drag.moved) return
      const tabStrip = document.querySelector<HTMLElement>('.tab-strip')
      const bounds = tabStrip?.getBoundingClientRect()
      if (!bounds || event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) {
        if (tabReturnPreviewRef.current) clearPreview()
        return
      }
      const tabs = [...document.querySelectorAll<HTMLButtonElement>('.document-tab')]
      const index = tabs.findIndex((tab) => event.clientX < tab.getBoundingClientRect().left + tab.getBoundingClientRect().width / 2)
      const insertIndex = index < 0 ? tabs.length : index
      const left = insertIndex < tabs.length
        ? tabs[insertIndex].getBoundingClientRect().left - 1
        : (tabs.at(-1)?.getBoundingClientRect().right ?? bounds.left + 4) - 1
      const next = { insertIndex, left, top: bounds.top + 3, height: Math.max(12, bounds.height - 6) }
      const current = tabReturnPreviewRef.current
      if (!current || current.insertIndex !== next.insertIndex || current.left !== next.left || current.top !== next.top || current.height !== next.height) {
        tabReturnPreviewRef.current = next
        setTabReturnPreview(next)
      }
      setTabDragGhost({
        left: Math.max(bounds.left, Math.min(bounds.right - drag.ghostWidth, event.clientX - drag.pointerOffsetX)),
        top: bounds.top,
        width: drag.ghostWidth,
        height: bounds.height
      })
    }
    const end = (event: PointerEvent, cancelled = false): void => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      const preview = tabReturnPreviewRef.current
      dragRef.current = null
      clearPreview()
      if (!cancelled && drag.moved && preview) onReturnToTabs(session.document.id, preview.insertIndex)
    }
    const up = (event: PointerEvent): void => end(event)
    const cancel = (event: PointerEvent): void => end(event, true)
    const mouseUp = (event: MouseEvent): void => {
      const drag = dragRef.current
      if (drag) end({ pointerId: drag.pointerId, clientX: event.clientX, clientY: event.clientY } as PointerEvent)
    }
    const blur = (): void => {
      const drag = dragRef.current
      if (drag) end({ pointerId: drag.pointerId } as PointerEvent, true)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up, true)
    window.addEventListener('pointercancel', cancel, true)
    window.addEventListener('mouseup', mouseUp, true)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up, true)
      window.removeEventListener('pointercancel', cancel, true)
      window.removeEventListener('mouseup', mouseUp, true)
      window.removeEventListener('blur', blur)
    }
  }, [onReturnToTabs, session.document.id])

  const activate = (event?: ReactPointerEvent<HTMLElement>): void => {
    if (!event || !isCanvasMiddlePanPointer(event)) onActivate(session.document.id)
    floating.bringToFront()
  }
  const beginDrag = (event: ReactPointerEvent<HTMLElement>): void => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button')) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const ghostWidth = Math.min(240, Math.max(120, bounds.width))
    const horizontalRatio = bounds.width > 0 ? Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)) : 0.5
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, pointerOffsetX: horizontalRatio * ghostWidth, ghostWidth, moved: false }
    floating.startDrag(event)
  }
  const layer = pinned
    ? PINNED_DOCUMENT_Z_INDEX + Math.min(stackIndex, 20)
    : FLOATING_DOCUMENT_Z_INDEX + Math.min(stackIndex, 8)

  return createPortal(<>
    <section ref={floating.ref} className={`floating-document-window ${active ? 'active' : ''} ${pinned ? 'pinned' : ''} ${tabReturnPreview ? 'returning-to-tabs' : ''}`} style={{ ...floating.style, zIndex: layer }} aria-label={t('tabs.floatingAria', { name: session.document.name })} aria-hidden={tabReturnPreview ? true : undefined} onPointerDownCapture={activate}>
      <header onPointerDown={beginDrag} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); activate(); setContextMenu({ x: event.clientX, y: event.clientY }) }}>
        <PixelUtilityIcon kind="image" />
        <span>{session.document.name}</span>
        {session.document.dirty && <i />}
        <button type="button" className="floating-document-pin" title={t(pinned ? 'tabs.unpinFloating' : 'tabs.pinFloating')} aria-label={t(pinned ? 'tabs.unpinFloating' : 'tabs.pinFloating')} aria-pressed={pinned} onClick={() => onPinnedChange(session.document.id, !pinned)}><PixelUtilityIcon kind="pin" /></button>
        <button type="button" title={t('tabs.returnToTabs')} aria-label={t('tabs.returnToTabs')} onClick={() => onReturnToTabs(session.document.id)}><PixelUtilityIcon kind="move" /></button>
      </header>
      <div className="document-pane-canvas"><QuickCommandBar documentId={session.document.id} shortcutFor={shortcutFor} onToggleMirror={onToggleMirror} onOpenAntiAlias={onOpenAntiAlias} onOpenOutline={onOpenOutline} onOpenPreferences={onOpenPreferences} onOpenCommandSettings={onOpenCommandSettings} /><div className="document-pane-canvas-content"><Suspense fallback={<div aria-hidden="true" />}><LazyCanvasStage session={session} /></Suspense></div></div>
      <PanelResizeHandles onResize={floating.startResize} />
    </section>
    {tabReturnPreview && <div className="document-pane-tab-return-preview floating-document-tab-return-preview" aria-hidden="true" style={{ left: tabReturnPreview.left, top: tabReturnPreview.top, height: tabReturnPreview.height }} />}
    {tabDragGhost && <div className="document-tab-drag-ghost floating-document-tab-ghost" aria-hidden="true" style={{ left: tabDragGhost.left, top: tabDragGhost.top, width: tabDragGhost.width, height: tabDragGhost.height }}><PixelUtilityIcon kind="image" /><span>{session.document.name}</span></div>}
    {contextMenu && <div className="context-menu floating-document-context-menu" role="menu" aria-label={t('tabs.contextAria')} style={{ left: Math.min(contextMenu.x, Math.max(8, window.innerWidth - 232)), top: Math.min(contextMenu.y, Math.max(8, window.innerHeight - 142)) }}>
      <button className="context-menu-item" type="button" role="menuitemcheckbox" aria-checked={pinned} onClick={() => { setContextMenu(null); onPinnedChange(session.document.id, !pinned) }}><PixelUtilityIcon kind="pin" /><span>{t(pinned ? 'tabs.unpinFloating' : 'tabs.pinFloating')}</span></button>
      <span className="context-menu-divider" />
      <button className="context-menu-item" type="button" role="menuitem" onClick={() => { setContextMenu(null); onReturnToTabs(session.document.id) }}><PixelUtilityIcon kind="move" /><span>{t('tabs.returnToTabs')}</span></button>
      <button className="context-menu-item" type="button" role="menuitem" onClick={() => { setContextMenu(null); onCloseDocument(session.document.id) }}><PixelUtilityIcon kind="close" /><span>{t('common.close')}</span></button>
    </div>}
  </>, document.body)
}
