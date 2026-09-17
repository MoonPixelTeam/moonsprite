import { createPortal, flushSync } from 'react-dom'
import { memo, useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from 'react'
import { PerformanceProfiler } from '@/components/PerformanceProfiler'
import { useI18n } from '@/components/I18nProvider'
import { documentTabsRenderKey } from '@/components/app/app-render-keys'
import type { DocumentPaneDirection, DocumentPanePlacement } from '@/core/document-pane-layout'
import { captureDocumentPaneDockTargets, paneDockTargetAtPoint, type DocumentPaneDockTarget } from './document-pane-hit-test'
import { clearDocumentPaneDockPreview, documentPaneDockPreviewBar, subscribeDocumentPaneDockPreviewBar, updateDocumentPaneDockPreview } from './document-pane-dock-preview'
import { documentTabCloseRange, type DocumentTabCloseScope } from './document-tab-close-range'
import { useWorkspace } from '@/store/workspace'
import { PixelUtilityIcon } from '@/components/PixelUtilityIcon'

interface DocumentTabsProps {
  homeOpen: boolean
  hiddenDocumentIds: readonly string[]
  onNew: () => void
  onActivate: (documentId: string) => void
  onContextActivate: (documentId: string) => void
  onSplit: (placement: DocumentPanePlacement) => void
  onFloat?: (documentId: string, anchor: { x: number; y: number }) => void
  onDockDebug?: (state: DocumentTabDockDebugState | null) => void
}

export interface DocumentTabDockDebugState {
  draggedDocumentId: string
  targetDocumentId: string | null
  direction: DocumentPaneDirection | null
  magnetVisible: boolean
}

interface DocumentTabDragPreview {
  name: string
  pointerX: number
  pointerY: number
  width: number
  height: number
  pointerOffsetX: number
  pointerOffsetY: number
}

interface DocumentTabDragState {
  id: string
  name: string
  pointerId: number
  startX: number
  startY: number
  lastX: number
  lastY: number
  direction: -1 | 1
  pointerOffsetX: number
  pointerOffsetY: number
  width: number
  height: number
  moved: boolean
  insideTabStrip: boolean
  detached: boolean
  insertIndex: number | null
  splitPreview: DocumentPanePlacement | null
  dockTarget: DocumentPaneDockTarget | null
  dockTargets: readonly DocumentPaneDockTarget[] | null
  dockPreviewSurface: HTMLElement | null
  captureTarget: HTMLElement | null
  previewVisible: boolean
}

const clearDocumentTabDockPreview = (drag: DocumentTabDragState): void => {
  clearDocumentPaneDockPreview(drag.dockPreviewSurface)
  drag.dockPreviewSurface = null
}

const updateDocumentTabDockPreview = (drag: DocumentTabDragState, pane: HTMLElement | null, direction: DocumentPaneDirection | null): boolean => {
  const preview = updateDocumentPaneDockPreview(drag.dockPreviewSurface, pane, direction)
  drag.dockPreviewSurface = preview.surface
  return preview.visible
}

const captureTabPositions = (): Map<string, number> => new Map(
  [...document.querySelectorAll<HTMLButtonElement>('.document-tab')]
    .flatMap((tab) => tab.dataset.documentId ? [[tab.dataset.documentId, tab.getBoundingClientRect().left] as const] : [])
)

const documentTabById = (documentId: string): HTMLButtonElement | null =>
  [...document.querySelectorAll<HTMLButtonElement>('.document-tab')].find((tab) => tab.dataset.documentId === documentId) ?? null

const draggedTabGhost = (): HTMLElement | null => document.querySelector<HTMLElement>('[data-document-tab-drag-ghost="true"]')

const positionDraggedTabGhost = (pointerX: number, pointerY: number, pointerOffsetX: number, pointerOffsetY: number): void => {
  const ghost = draggedTabGhost()
  if (!ghost) return
  ghost.style.left = `${pointerX - pointerOffsetX}px`
  ghost.style.top = `${pointerY - pointerOffsetY}px`
}

const resetDraggedTabPosition = (documentId: string): void => {
  const tab = documentTabById(documentId)
  if (!tab) return
  tab.style.transform = ''
}

const positionDraggedTab = (documentId: string, pointerX: number, pointerOffsetX: number, tabStrip: HTMLElement): void => {
  const tab = documentTabById(documentId)
  if (!tab) return
  const stripBounds = tabStrip.getBoundingClientRect()
  const baseLeft = stripBounds.left + tab.offsetLeft - tabStrip.scrollLeft
  tab.style.transform = `translateX(${pointerX - pointerOffsetX - baseLeft}px)`
}

const uiMotionEnabled = (): boolean => (
  document.documentElement.dataset.uiMotion !== 'off'
  && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
)

const animateTabPositions = (before: Map<string, number>, draggedDocumentId: string): void => {
  if (!uiMotionEnabled()) return
  window.requestAnimationFrame(() => {
    if (!uiMotionEnabled()) return
    for (const tab of document.querySelectorAll<HTMLButtonElement>('.document-tab')) {
      const documentId = tab.dataset.documentId
      if (documentId === draggedDocumentId) continue
      const previousLeft = documentId ? before.get(documentId) : undefined
      if (previousLeft === undefined || typeof tab.animate !== 'function') continue
      const offset = previousLeft - tab.getBoundingClientRect().left
      if (Math.abs(offset) < 0.5) continue
      for (const animation of tab.getAnimations()) animation.cancel()
      tab.animate(
        [{ transform: `translateX(${offset}px)` }, { transform: 'translateX(0)' }],
        { duration: 75, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }
      )
    }
  })
}

export const DocumentTabs = memo(function DocumentTabs({ homeOpen, hiddenDocumentIds, onNew, onActivate, onContextActivate, onSplit, onFloat, onDockDebug }: DocumentTabsProps) {
  const { t } = useI18n()
  const renderKey = useWorkspace(documentTabsRenderKey)
  const [contextMenu, setContextMenu] = useState<{ documentId: string; x: number; y: number } | null>(null)
  const dockPreviewBand = useSyncExternalStore(subscribeDocumentPaneDockPreviewBar, documentPaneDockPreviewBar, documentPaneDockPreviewBar)
  const [dragPreview, setDragPreview] = useState<DocumentTabDragPreview | null>(null)
  const [dragVisual, setDragVisual] = useState<{ id: string; detached: boolean } | null>(null)
  const dragRef = useRef<DocumentTabDragState | null>(null)
  const suppressClickRef = useRef(false)
  const state = useWorkspace.getState()

  useEffect(() => {
    const syncMotion = (): void => {
      if (uiMotionEnabled()) return
      for (const tab of document.querySelectorAll<HTMLButtonElement>('.document-tab')) {
        for (const animation of tab.getAnimations?.() ?? []) animation.cancel()
      }
    }
    window.addEventListener('moonsprite:preferences-changed', syncMotion)
    syncMotion()
    return () => window.removeEventListener('moonsprite:preferences-changed', syncMotion)
  }, [])

  useEffect(() => {
    const move = (event: PointerEvent): void => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >= 5) {
        drag.moved = true
        setDragVisual({ id: drag.id, detached: false })
        document.documentElement.classList.add('document-tabs-dragging')
        drag.captureTarget?.setPointerCapture?.(event.pointerId)
      }
      if (!drag.moved) return
      event.preventDefault()
      if (event.clientX > drag.lastX + 0.5) drag.direction = 1
      else if (event.clientX < drag.lastX - 0.5) drag.direction = -1
      drag.lastX = event.clientX
      drag.lastY = event.clientY
      const tabStrip = document.querySelector<HTMLElement>('.tab-strip')
      const tabStripBounds = tabStrip?.getBoundingClientRect()
      const insideTabStrip = Boolean(tabStripBounds && event.clientX >= tabStripBounds.left && event.clientX <= tabStripBounds.right && event.clientY >= tabStripBounds.top && event.clientY <= tabStripBounds.bottom)
      if (insideTabStrip && tabStrip) {
        if (drag.detached) {
          drag.detached = false
          setDragVisual({ id: drag.id, detached: false })
        }
        drag.previewVisible = false
        setDragPreview(null)
        clearDocumentTabDockPreview(drag)
        drag.splitPreview = null
        drag.dockTarget = null
        drag.dockTargets = null
        onDockDebug?.({ draggedDocumentId: drag.id, targetDocumentId: null, direction: null, magnetVisible: false })
        drag.insideTabStrip = true
        const tabs = [...document.querySelectorAll<HTMLButtonElement>('.document-tab')].filter((tab) => tab.dataset.documentId !== drag.id)
        const threshold = drag.direction > 0 ? 0.3 : 0.7
        const insertIndex = tabs.findIndex((tab) => event.clientX < tab.getBoundingClientRect().left + tab.getBoundingClientRect().width * threshold)
        drag.insertIndex = insertIndex < 0 ? tabs.length : insertIndex
        const sessions = useWorkspace.getState().sessions
        const hidden = new Set(hiddenDocumentIds)
        const visible = sessions.filter((item) => !hidden.has(item.document.id))
        const source = visible.find((item) => item.document.id === drag.id)
        if (source) {
          const remaining = visible.filter((item) => item.document.id !== drag.id)
          remaining.splice(Math.max(0, Math.min(remaining.length, drag.insertIndex)), 0, source)
          const nextVisibleIds = remaining.map((item) => item.document.id)
          const currentVisibleIds = visible.map((item) => item.document.id)
          if (nextVisibleIds.some((id, index) => id !== currentVisibleIds[index])) {
            const positions = captureTabPositions()
            const hiddenSessions = sessions.filter((item) => hidden.has(item.document.id))
            flushSync(() => useWorkspace.getState().reorderSessions([...remaining, ...hiddenSessions].map((item) => item.document.id)))
            animateTabPositions(positions, drag.id)
          }
        }
        positionDraggedTab(drag.id, event.clientX, drag.pointerOffsetX, tabStrip)
        return
      }
      drag.insideTabStrip = false
      drag.insertIndex = null
      if (!drag.detached) {
        drag.detached = true
        setDragVisual({ id: drag.id, detached: true })
      }
      if (!drag.dockTargets) drag.dockTargets = captureDocumentPaneDockTargets()
      const hit = paneDockTargetAtPoint(event.clientX, event.clientY, { currentTarget: drag.dockTarget, strictPoint: true, targets: drag.dockTargets })
      const workspace = useWorkspace.getState()
      const fallbackTargetId = hit.target?.paneId === drag.id && hit.direction
        ? workspace.sessions.find((item) => item.document.id !== drag.id && !hiddenDocumentIds.includes(item.document.id))?.document.id ?? null
        : null
      const targetId = fallbackTargetId ?? hit.target?.paneId ?? null
      const canSplit = Boolean(targetId && targetId !== drag.id)
      const nextSplitPreview = hit.target && hit.direction && canSplit && targetId
        ? {
            documentId: drag.id,
            targetPaneId: targetId,
            direction: hit.direction,
            ...(hit.target.paneId !== targetId ? { previewPaneId: hit.target.paneId } : {})
          }
        : null
      const magnetVisible = updateDocumentTabDockPreview(drag, nextSplitPreview ? hit.pane : null, nextSplitPreview?.direction ?? null)
      const visibleSplitPreview = magnetVisible ? nextSplitPreview : null
      onDockDebug?.({
        draggedDocumentId: drag.id,
        targetDocumentId: hit.target?.paneId ?? null,
        direction: hit.direction,
        magnetVisible
      })
      drag.dockTarget = visibleSplitPreview && hit.target ? hit.target : null
      if (visibleSplitPreview?.documentId !== drag.splitPreview?.documentId || visibleSplitPreview?.targetPaneId !== drag.splitPreview?.targetPaneId || visibleSplitPreview?.direction !== drag.splitPreview?.direction || visibleSplitPreview?.previewPaneId !== drag.splitPreview?.previewPaneId) {
        drag.splitPreview = visibleSplitPreview
      }
      if (!drag.previewVisible) {
        drag.previewVisible = true
        setDragPreview({
          name: drag.name,
          pointerX: event.clientX,
          pointerY: event.clientY,
          width: drag.width,
          height: drag.height,
          pointerOffsetX: drag.pointerOffsetX,
          pointerOffsetY: drag.pointerOffsetY
        })
      } else {
        positionDraggedTabGhost(event.clientX, event.clientY, drag.pointerOffsetX, drag.pointerOffsetY)
      }
    }
    const end = (event: PointerEvent, cancelled = false): void => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      const splitPreview = drag.splitPreview
      const commitSplit = !cancelled && drag.moved && !drag.insideTabStrip && Boolean(splitPreview)
      drag.previewVisible = false
      clearDocumentTabDockPreview(drag)
      dragRef.current = null
      if (drag.moved) {
        suppressClickRef.current = true
        window.setTimeout(() => { suppressClickRef.current = false }, 0)
      }
      if (drag.captureTarget && typeof drag.captureTarget.hasPointerCapture === 'function' && drag.captureTarget.hasPointerCapture(event.pointerId)) drag.captureTarget.releasePointerCapture(event.pointerId)
      resetDraggedTabPosition(drag.id)
      document.documentElement.classList.remove('document-tabs-dragging')
      flushSync(() => {
        onDockDebug?.(null)
        setDragPreview(null)
        setDragVisual(null)
        if (commitSplit && splitPreview) onSplit(splitPreview)
      })
    }
    window.addEventListener('pointermove', move)
    const up = (event: PointerEvent): void => end(event)
    const cancel = (event: PointerEvent): void => end(event, true)
    const mouseUp = (event: MouseEvent): void => {
      const drag = dragRef.current
      if (!drag) return
      end({ pointerId: drag.pointerId, clientX: event.clientX, clientY: event.clientY } as PointerEvent)
    }
    const blur = (): void => {
      const drag = dragRef.current
      if (!drag) return
      end({ pointerId: drag.pointerId, clientX: drag.lastX, clientY: drag.lastY } as PointerEvent, true)
    }
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
      if (dragRef.current) resetDraggedTabPosition(dragRef.current.id)
      if (dragRef.current) clearDocumentTabDockPreview(dragRef.current)
      onDockDebug?.(null)
      document.documentElement.classList.remove('document-tabs-dragging')
    }
  }, [hiddenDocumentIds, onDockDebug, onSplit])

  useEffect(() => {
    const closeOutside = (event: PointerEvent): void => {
      if (event.target instanceof Element && !event.target.closest('.document-tab, .document-tab-context-menu')) setContextMenu(null)
    }
    const close = (event?: Event): void => {
      const target = (event as CustomEvent<{ target?: string }> | undefined)?.detail?.target
      if (!target || target === 'popover') setContextMenu(null)
    }
    window.addEventListener('pointerdown', closeOutside, true)
    window.addEventListener('blur', close)
    window.addEventListener('moonsprite:close-dialog', close)
    return () => {
      window.removeEventListener('pointerdown', closeOutside, true)
      window.removeEventListener('blur', close)
      window.removeEventListener('moonsprite:close-dialog', close)
    }
  }, [])

  const beginDrag = (event: ReactPointerEvent<HTMLButtonElement>, documentId: string): void => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('.tab-close')) return
    const documentName = useWorkspace.getState().sessions.find((item) => item.document.id === documentId)?.document.name ?? ''
    const bounds = event.currentTarget.getBoundingClientRect()
    const captureTarget = event.currentTarget.closest<HTMLElement>('.tab-strip') ?? event.currentTarget
    dragRef.current = { id: documentId, name: documentName, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, lastX: event.clientX, lastY: event.clientY, direction: 1, pointerOffsetX: event.clientX - bounds.left, pointerOffsetY: event.clientY - bounds.top, width: bounds.width, height: bounds.height, moved: false, insideTabStrip: true, detached: false, insertIndex: null, splitPreview: null, dockTarget: null, dockTargets: null, dockPreviewSurface: null, captureTarget, previewVisible: false }
    onDockDebug?.({ draggedDocumentId: documentId, targetDocumentId: null, direction: null, magnetVisible: false })
  }
  const openProjectFolder = (documentId: string): void => {
    const workspace = useWorkspace.getState()
    const target = workspace.sessions.find((item) => item.document.id === documentId)
    const sourcePath = target?.document.filePath ?? target?.document.sourceFilePath
    setContextMenu(null)
    if (!sourcePath) {
      workspace.setMessage(t('tabs.unsavedFolder'))
      return
    }
    void window.moonSprite.openProjectInFolder(sourcePath).then(() => {
      workspace.setMessage(t('tabs.openedFolder'))
    }).catch((error) => {
      workspace.setMessage(error instanceof Error ? error.message : t('tabs.openFolderFailed'))
    })
  }
  const duplicateDocumentView = async (documentId: string): Promise<void> => {
    const workspace = useWorkspace.getState()
    const target = workspace.sessions.find((item) => item.document.id === documentId)
    const sourcePath = target?.document.filePath ?? target?.document.sourceFilePath
    setContextMenu(null)
    if (!sourcePath) {
      workspace.setMessage(t('tabs.noDuplicatePath'))
      return
    }
    onContextActivate(documentId)
    const opened = await workspace.openPath(sourcePath, { duplicate: true })
    if (!opened) workspace.setMessage(t('tabs.duplicateFailed'))
  }
  const closeTabRange = async (documentId: string, scope: DocumentTabCloseScope): Promise<void> => {
    const visibleDocumentIds = useWorkspace.getState().sessions
      .filter((item) => !hiddenDocumentIds.includes(item.document.id))
      .map((item) => item.document.id)
    const documentIds = documentTabCloseRange(visibleDocumentIds, documentId, scope)
    setContextMenu(null)
    for (const targetId of documentIds) {
      await useWorkspace.getState().closeDocument(targetId)
      if (useWorkspace.getState().sessions.some((item) => item.document.id === targetId)) break
    }
  }
  const visibleSessions = state.sessions.filter((item) => !hiddenDocumentIds.includes(item.document.id))

  return <PerformanceProfiler id="DocumentTabs"><>
    {visibleSessions.map((item) => <button
      key={item.document.id}
      className={`document-tab ${item.document.id === state.activeId && !homeOpen ? 'active' : ''} ${dragVisual?.id === item.document.id ? 'dragging' : ''} ${dragVisual?.id === item.document.id && dragVisual.detached ? 'detached' : ''}`}
      data-document-id={item.document.id}
      onPointerDown={(event) => { if (event.button === 1) { event.preventDefault(); return }; beginDrag(event, item.document.id) }}
      onAuxClick={(event) => { if (event.button !== 1) return; event.preventDefault(); event.stopPropagation(); setContextMenu(null); void useWorkspace.getState().closeDocument(item.document.id) }}
      onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); onContextActivate(item.document.id); setContextMenu({ documentId: item.document.id, x: event.clientX, y: event.clientY }) }}
      onClick={(event) => { if (suppressClickRef.current || dragRef.current?.moved) { event.preventDefault(); return }; onActivate(item.document.id) }}
    >
      <PixelUtilityIcon kind="image" className="document-tab-leading-icon" />
      <span>{item.document.name}</span>
      {item.document.dirty && <i />}
      <span className="tab-close" role="button" tabIndex={0} aria-label={t('tabs.closeAria', { name: item.document.name })} onClick={(event) => { event.stopPropagation(); void useWorkspace.getState().closeDocument(item.document.id) }}><PixelUtilityIcon kind="close" /></span>
    </button>)}
      <button className="new-tab-button" aria-label={t('tabs.newProject')} title={t('tabs.newProject')} onClick={onNew}><PixelUtilityIcon kind="plus" /></button>
    {contextMenu && createPortal(<div className="context-menu document-tab-context-menu" role="menu" aria-label={t('tabs.contextAria')} style={{ left: Math.min(contextMenu.x, Math.max(8, window.innerWidth - 232)), top: Math.min(contextMenu.y, Math.max(8, window.innerHeight - 300)) }}>
      <button className="context-menu-item" role="menuitem" onClick={() => { void useWorkspace.getState().closeDocument(contextMenu.documentId); setContextMenu(null) }}><PixelUtilityIcon kind="close" /><span>{t('common.close')}</span></button>
      <span className="context-menu-divider" role="separator" />
      <button className="context-menu-item" role="menuitem" onClick={() => { void closeTabRange(contextMenu.documentId, 'left') }}><PixelUtilityIcon kind="close" /><span>{t('tabs.closeLeft')}</span></button>
      <button className="context-menu-item" role="menuitem" onClick={() => { void closeTabRange(contextMenu.documentId, 'right') }}><PixelUtilityIcon kind="close" /><span>{t('tabs.closeRight')}</span></button>
      <button className="context-menu-item" role="menuitem" onClick={() => { void closeTabRange(contextMenu.documentId, 'others') }}><PixelUtilityIcon kind="close" /><span>{t('tabs.closeOthers')}</span></button>
      <span className="context-menu-divider" role="separator" />
      <button className="context-menu-item" role="menuitem" onClick={() => { void duplicateDocumentView(contextMenu.documentId) }}><PixelUtilityIcon kind="copy" /><span>{t('tabs.duplicateView')}</span></button>
      {onFloat && <button className="context-menu-item" role="menuitem" onClick={() => { onFloat(contextMenu.documentId, { x: contextMenu.x, y: contextMenu.y }); setContextMenu(null) }}><PixelUtilityIcon kind="move" /><span>{t('tabs.floatDocument')}</span></button>}
      <button className="context-menu-item" role="menuitem" onClick={() => openProjectFolder(contextMenu.documentId)}><PixelUtilityIcon kind="folderOpen" /><span>{t('app.menu.file.openFolder')}</span></button>
    </div>, document.body)}
    {dragPreview && createPortal(<div className="document-tab-drag-layer" aria-hidden="true">
      <div className="document-tab-drag-ghost" data-document-tab-drag-ghost="true" style={{ left: dragPreview.pointerX - dragPreview.pointerOffsetX, top: dragPreview.pointerY - dragPreview.pointerOffsetY, width: dragPreview.width, height: dragPreview.height }}><PixelUtilityIcon kind="image" /><span>{dragPreview.name}</span></div>
    </div>, document.body)}
    {dockPreviewBand && createPortal(<div className="document-pane-dock-preview-layer" aria-hidden="true"><div className="document-pane-dock-preview-band" data-direction={dockPreviewBand.direction} style={{ left: dockPreviewBand.left, top: dockPreviewBand.top, width: dockPreviewBand.width, height: dockPreviewBand.height }} /></div>, document.body)}
  </></PerformanceProfiler>
})
