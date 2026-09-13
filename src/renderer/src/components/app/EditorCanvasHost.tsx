import { useShallow } from 'zustand/react/shallow'
import { createPortal, flushSync } from 'react-dom'
import { memo, Suspense, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type DragEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { PerformanceProfiler } from '@/components/PerformanceProfiler'
import { PixelUtilityIcon } from '@/components/PixelUtilityIcon'
import { createDocumentPaneLayout, insertDocumentPane, resizeDocumentPane, type DocumentPaneDirection, type DocumentPaneNode, type DocumentPaneOrientation, type DocumentPanePlacement } from '@/core/document-pane-layout'
import { clearDocumentPaneDockPreview, documentPaneDockPreviewBar, subscribeDocumentPaneDockPreviewBar, updateDocumentPaneDockPreview } from './document-pane-dock-preview'
import { paneDockTargetAtPoint, type DocumentPaneDockTarget } from './document-pane-hit-test'
import { beginDocumentPaneResize } from './document-pane-resize'
import { canvasColorSamplingIntentActive } from '@/core/canvas-color-sampling'
import { QuickCommandBar } from './QuickCommandBar'
import { useWorkspace } from '@/store/workspace'
import { useI18n } from '@/components/I18nProvider'
import type { ShortcutId } from '@/core/shortcuts'
import type { QuickCommandSettingsTarget } from './quick-command-registry'

import { DocumentCanvas } from './document-canvas'
export { preloadCanvasStage } from './document-canvas'

interface EditorCanvasHostProps {
  documentPaneLayout: DocumentPaneNode | null
  workspaceDocumentId: string | null
  paneOnlyDocumentIds: readonly string[]
  onDocumentPaneLayoutChange: (layout: DocumentPaneNode | null) => void
  onDocumentPaneMove: (documentId: string, targetPaneId: string, direction: DocumentPaneDirection) => void
  onDocumentPaneReturnToTabs: (documentId: string, visibleIndex: number) => void
  onDocumentPaneFloat?: (documentId: string, anchor: { x: number; y: number }) => void
  shortcutFor: (id: ShortcutId) => string
  onToggleMirror: (axis: 'horizontal' | 'vertical') => void
  onOpenAntiAlias: () => void
  onOpenPreferences: () => void
  onOpenCommandSettings?: (target: QuickCommandSettingsTarget) => void
}

interface PaneTabReturnPreview {
  insertIndex: number
  left: number
  top: number
  height: number
}

interface PaneDragPreview {
  pointerX: number
  pointerY: number
  pointerOffsetX: number
  pointerOffsetY: number
  width: number
  height: number
  name: string
}

interface PaneDragState {
  documentId: string
  name: string
  pointerId: number
  startX: number
  startY: number
  lastX: number
  lastY: number
  pointerOffsetX: number
  pointerOffsetY: number
  width: number
  height: number
  moved: boolean
  ghostVisible: boolean
  dockTarget: DocumentPaneDockTarget | null
  dockPreviewSurface: HTMLElement | null
  captureTarget: HTMLElement | null
}

const positionPaneDragGhost = (pointerX: number, pointerY: number, pointerOffsetX: number, pointerOffsetY: number): void => {
  const ghost = document.querySelector<HTMLElement>('[data-document-pane-drag-ghost="true"]')
  if (!ghost) return
  ghost.style.left = `${pointerX - pointerOffsetX}px`
  ghost.style.top = `${pointerY - pointerOffsetY}px`
}

export const EditorCanvasHost = memo(function EditorCanvasHost({ documentPaneLayout, workspaceDocumentId, paneOnlyDocumentIds, onDocumentPaneLayoutChange, onDocumentPaneMove, onDocumentPaneReturnToTabs, onDocumentPaneFloat, shortcutFor, onToggleMirror, onOpenAntiAlias, onOpenPreferences, onOpenCommandSettings }: EditorCanvasHostProps) {
  const { t } = useI18n()
  useWorkspace(useShallow((state) => state.sessions.flatMap(({ document }) => [document.id, document.name, document.dirty])))
  const sessions = useWorkspace.getState().sessions
  const activeId = useWorkspace((state) => documentPaneLayout ? state.activeId : null)
  const stageRootRef = useRef<HTMLDivElement | null>(null)
  const paneResizeRef = useRef<{ splitId: string; pointerId: number; captureTarget: HTMLElement; gesture: ReturnType<typeof beginDocumentPaneResize> } | null>(null)
  const paneDragRef = useRef<PaneDragState | null>(null)
  const paneTabReturnRef = useRef<PaneTabReturnPreview | null>(null)
  const paneMovePreviewRef = useRef<DocumentPanePlacement | null>(null)
  const dockPreviewBand = useSyncExternalStore(subscribeDocumentPaneDockPreviewBar, documentPaneDockPreviewBar, documentPaneDockPreviewBar)
  const [paneDragPreview, setPaneDragPreview] = useState<PaneDragPreview | null>(null)
  const [paneTabReturnPreview, setPaneTabReturnPreview] = useState<PaneTabReturnPreview | null>(null)
  const [paneContextMenu, setPaneContextMenu] = useState<{ documentId: string; x: number; y: number } | null>(null)
  const layoutRef = useRef(documentPaneLayout)
  const session = sessions.find((item) => item.document.id === workspaceDocumentId) ?? null
  useEffect(() => {
    if (documentPaneLayout) return
    const root = stageRootRef.current
    if (!root) return
    const applyActiveStage = (id: string | null): void => {
      for (const element of root.querySelectorAll<HTMLElement>('.document-tab-stage')) {
        const isActive = element.dataset.documentId === id
        element.classList.toggle('is-active', isActive)
        element.setAttribute('aria-hidden', String(!isActive))
      }
    }
    applyActiveStage(useWorkspace.getState().activeId)
    return useWorkspace.subscribe((state, previous) => {
      if (state.activeId !== previous.activeId) applyActiveStage(state.activeId)
    })
  }, [documentPaneLayout])
  useEffect(() => { layoutRef.current = documentPaneLayout }, [documentPaneLayout])
  useEffect(() => {
    const closeOutside = (event: PointerEvent): void => {
      if (event.target instanceof Element && !event.target.closest('.document-pane-context-menu')) setPaneContextMenu(null)
    }
    const close = (): void => setPaneContextMenu(null)
    window.addEventListener('pointerdown', closeOutside, true)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('pointerdown', closeOutside, true)
      window.removeEventListener('blur', close)
    }
  }, [])

  useEffect(() => {
    const clearPaneMovePreview = (drag: PaneDragState): void => {
      clearDocumentPaneDockPreview(drag.dockPreviewSurface)
      drag.dockPreviewSurface = null
      paneMovePreviewRef.current = null
    }
    const move = (event: PointerEvent): void => {
      const resize = paneResizeRef.current
      if (resize && resize.pointerId === event.pointerId) {
        event.preventDefault()
        resize.gesture.move(event)
        return
      }
      const drag = paneDragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >= 5) {
        drag.moved = true
        drag.ghostVisible = true
        document.documentElement.classList.add('document-pane-dragging')
        setPaneDragPreview({
          pointerX: event.clientX,
          pointerY: event.clientY,
          pointerOffsetX: drag.pointerOffsetX,
          pointerOffsetY: drag.pointerOffsetY,
          width: drag.width,
          height: drag.height,
          name: drag.name
        })
      }
      if (!drag.moved) return
      event.preventDefault()
      const previousPoint = { x: drag.lastX, y: drag.lastY }
      drag.lastX = event.clientX
      drag.lastY = event.clientY
      if (drag.ghostVisible) positionPaneDragGhost(event.clientX, event.clientY, drag.pointerOffsetX, drag.pointerOffsetY)
      const tabStrip = document.querySelector<HTMLElement>('.tab-strip')
      const tabStripBounds = tabStrip?.getBoundingClientRect()
      const insideTabStrip = Boolean(tabStripBounds && event.clientX >= tabStripBounds.left && event.clientX <= tabStripBounds.right && event.clientY >= tabStripBounds.top && event.clientY <= tabStripBounds.bottom)
      if (insideTabStrip && tabStripBounds) {
        const tabs = [...document.querySelectorAll<HTMLButtonElement>('.document-tab')]
        const insertIndex = tabs.findIndex((tab) => event.clientX < tab.getBoundingClientRect().left + tab.getBoundingClientRect().width / 2)
        const normalizedIndex = insertIndex < 0 ? tabs.length : insertIndex
        const insertionLeft = normalizedIndex < tabs.length ? tabs[normalizedIndex].getBoundingClientRect().left : tabs.at(-1)?.getBoundingClientRect().right ?? tabStripBounds.left + 4
        const preview = { insertIndex: normalizedIndex, left: insertionLeft - 1, top: tabStripBounds.top + 3, height: Math.max(12, tabStripBounds.height - 6) }
        const previousPreview = paneTabReturnRef.current
        paneTabReturnRef.current = preview
        if (!previousPreview || previousPreview.insertIndex !== preview.insertIndex || previousPreview.left !== preview.left) setPaneTabReturnPreview(preview)
        drag.dockTarget = null
        clearPaneMovePreview(drag)
        return
      }
      paneTabReturnRef.current = null
      setPaneTabReturnPreview(null)
      const hit = paneDockTargetAtPoint(event.clientX, event.clientY, { currentTarget: drag.dockTarget, previousPoint, excludePaneId: drag.documentId })
      if (!hit.target || !hit.direction) {
        drag.dockTarget = null
        clearPaneMovePreview(drag)
        return
      }
      const placement = { documentId: drag.documentId, targetPaneId: hit.target.paneId, direction: hit.direction }
      const preview = updateDocumentPaneDockPreview(drag.dockPreviewSurface, hit.pane, hit.direction)
      drag.dockPreviewSurface = preview.surface
      drag.dockTarget = preview.visible ? hit.target : null
      paneMovePreviewRef.current = preview.visible ? placement : null
    }
    const end = (event: PointerEvent, cancelled = false): void => {
      const resize = paneResizeRef.current
      if (resize && resize.pointerId === event.pointerId) {
        paneResizeRef.current = null
        if (!cancelled) resize.gesture.move(event)
        resize.gesture.finish(cancelled, ratio => {
          const current = layoutRef.current
          if (!current) return
          const next = resizeDocumentPane(current, resize.splitId, ratio)
          layoutRef.current = next
          flushSync(() => onDocumentPaneLayoutChange(next))
        })
        if (resize.captureTarget.hasPointerCapture?.(event.pointerId)) resize.captureTarget.releasePointerCapture(event.pointerId)
        return
      }
      const drag = paneDragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      if (drag.captureTarget?.hasPointerCapture(event.pointerId)) drag.captureTarget.releasePointerCapture(event.pointerId)
      const tabReturn = paneTabReturnRef.current
      const movePreview = paneMovePreviewRef.current
      clearDocumentPaneDockPreview(drag.dockPreviewSurface)
      document.documentElement.classList.remove('document-pane-dragging')
      paneDragRef.current = null
      paneTabReturnRef.current = null
      paneMovePreviewRef.current = null
      flushSync(() => {
        setPaneDragPreview(null)
        setPaneTabReturnPreview(null)
      })
      if (!cancelled && drag.moved && tabReturn) {
        onDocumentPaneReturnToTabs(drag.documentId, tabReturn.insertIndex)
        return
      }
      if (!cancelled && drag.moved && movePreview) onDocumentPaneMove(movePreview.documentId, movePreview.targetPaneId, movePreview.direction)
    }
    window.addEventListener('pointermove', move)
    const cancel = (event: PointerEvent): void => end(event, true)
    const lostCapture = (event: PointerEvent): void => {
      if (paneResizeRef.current?.pointerId === event.pointerId) end(event, true)
    }
    window.addEventListener('pointerup', end, true)
    window.addEventListener('pointercancel', cancel, true)
    window.addEventListener('lostpointercapture', lostCapture, true)
    const mouseUp = (event: MouseEvent): void => {
      const resize = paneResizeRef.current
      if (resize) {
        end({ pointerId: resize.pointerId, clientX: event.clientX, clientY: event.clientY } as PointerEvent)
        return
      }
      const drag = paneDragRef.current
      if (!drag) return
      end({ pointerId: drag.pointerId, clientX: event.clientX, clientY: event.clientY } as PointerEvent)
    }
    const blur = (): void => {
      const resize = paneResizeRef.current
      if (resize) end({ pointerId: resize.pointerId } as PointerEvent, true)
      const drag = paneDragRef.current
      if (!drag) return
      end({ pointerId: drag.pointerId, clientX: drag.lastX, clientY: drag.lastY } as PointerEvent, true)
    }
    window.addEventListener('mouseup', mouseUp, true)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end, true)
      window.removeEventListener('pointercancel', cancel, true)
      window.removeEventListener('lostpointercapture', lostCapture, true)
      window.removeEventListener('mouseup', mouseUp, true)
      window.removeEventListener('blur', blur)
      const resize = paneResizeRef.current
      paneResizeRef.current = null
      resize?.gesture.finish(true, () => {})
      if (resize?.captureTarget.hasPointerCapture?.(resize.pointerId)) resize.captureTarget.releasePointerCapture(resize.pointerId)
      clearDocumentPaneDockPreview(paneDragRef.current?.dockPreviewSurface ?? null)
      document.documentElement.classList.remove('document-pane-dragging')
    }
  }, [onDocumentPaneLayoutChange, onDocumentPaneMove, onDocumentPaneReturnToTabs])

  const dropDocumentIntoWorkspace = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault()
    event.stopPropagation()
    const documentId = event.dataTransfer.getData('application/x-moonsprite-document')
    if (!session || !documentId || documentId === session.document.id || !sessions.some((item) => item.document.id === documentId)) return
    const current = layoutRef.current ?? createDocumentPaneLayout(session.document.id)
    const next = insertDocumentPane(current, session.document.id, documentId, 'right')
    layoutRef.current = next
    onDocumentPaneLayoutChange(next)
  }
  const beginSplitResize = (event: ReactPointerEvent<HTMLDivElement>, splitId: string, orientation: DocumentPaneOrientation, ratio: number): void => {
    if (event.button !== 0 || paneResizeRef.current) return
    const container = event.currentTarget.parentElement
    if (!container) return
    paneResizeRef.current = { splitId, pointerId: event.pointerId, captureTarget: event.currentTarget, gesture: beginDocumentPaneResize(container, orientation, ratio, event) }
    event.currentTarget.setPointerCapture?.(event.pointerId)
    event.preventDefault()
  }
  const beginPaneDrag = (event: ReactPointerEvent<HTMLElement>, documentId: string): void => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button')) return
    const captureTarget = event.currentTarget.closest<HTMLElement>('.stage-wrap') ?? event.currentTarget
    const bounds = event.currentTarget.getBoundingClientRect()
    const width = Math.min(240, Math.max(120, bounds.width))
    const horizontalRatio = bounds.width > 0 ? (event.clientX - bounds.left) / bounds.width : 0.5
    const name = useWorkspace.getState().sessions.find((item) => item.document.id === documentId)?.document.name ?? ''
    paneDragRef.current = { documentId, name, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, lastX: event.clientX, lastY: event.clientY, pointerOffsetX: Math.max(0, Math.min(width, horizontalRatio * width)), pointerOffsetY: Math.max(0, Math.min(bounds.height, event.clientY - bounds.top)), width, height: bounds.height, moved: false, ghostVisible: false, dockTarget: null, dockPreviewSurface: null, captureTarget }
    paneTabReturnRef.current = null
    captureTarget.setPointerCapture?.(event.pointerId)
    event.preventDefault()
  }
  const renderNode = (node: DocumentPaneNode): ReactNode => {
    if (node.kind === 'leaf') {
      const paneSession = sessions.find((item) => item.document.id === node.documentId)
      if (!paneSession) return null
      const showPaneHeader = paneOnlyDocumentIds.includes(paneSession.document.id)
      return <section key={node.id} data-document-pane-id={node.id} className={`document-pane ${activeId === paneSession.document.id ? 'active' : ''} ${showPaneHeader ? '' : 'main-tab-pane'}`} onPointerDownCapture={(event) => { if (canvasColorSamplingIntentActive() && (event.target as Element).closest('canvas.stage-canvas')) return; const workspace = useWorkspace.getState(); workspace.syncCanvasToolSettings(paneSession.document.id); workspace.setActive(paneSession.document.id) }} onWheelCapture={() => useWorkspace.getState().setActive(paneSession.document.id)}>
        {showPaneHeader && <header onPointerDown={(event) => beginPaneDrag(event, paneSession.document.id)} onContextMenu={(event) => { if (!onDocumentPaneFloat) return; event.preventDefault(); event.stopPropagation(); useWorkspace.getState().setActive(paneSession.document.id); setPaneContextMenu({ documentId: paneSession.document.id, x: event.clientX, y: event.clientY }) }}><PixelUtilityIcon kind="image" /><span>{paneSession.document.name}</span>{paneSession.document.dirty && <i />}<button title={t('common.close')} aria-label={t('tabs.closeAria', { name: paneSession.document.name })} onClick={() => { void useWorkspace.getState().closeDocument(paneSession.document.id) }}><PixelUtilityIcon kind="close" /></button></header>}
        <div className="document-pane-canvas"><QuickCommandBar documentId={paneSession.document.id} shortcutFor={shortcutFor} onToggleMirror={onToggleMirror} onOpenAntiAlias={onOpenAntiAlias} onOpenPreferences={onOpenPreferences} onOpenCommandSettings={onOpenCommandSettings} /><div className="document-pane-canvas-content"><DocumentCanvas documentId={paneSession.document.id} /></div></div>
      </section>
    }
    const splitStyle: CSSProperties = node.orientation === 'horizontal'
      ? { gridTemplateColumns: `minmax(0, ${node.ratio}fr) 6px minmax(0, ${1 - node.ratio}fr)` }
      : { gridTemplateRows: `minmax(0, ${node.ratio}fr) 6px minmax(0, ${1 - node.ratio}fr)` }
    return <div key={node.id} className={`document-pane-split ${node.orientation}`} style={splitStyle} data-document-split-id={node.id}>
      <div className="document-pane-split-child">{renderNode(node.first)}</div>
      <div className="document-pane-resizer" role="separator" aria-orientation={node.orientation === 'horizontal' ? 'vertical' : 'horizontal'} onPointerDown={(event) => beginSplitResize(event, node.id, node.orientation, node.ratio)} />
      <div className="document-pane-split-child">{renderNode(node.second)}</div>
    </div>
  }

  const content = documentPaneLayout
    ? <div className="split-workspace">{renderNode(documentPaneLayout)}</div>
    : session ? <div ref={stageRootRef} className="document-pane-target" data-document-pane-id={session.document.id}>{sessions.map((item) => {
      const isActive = item.document.id === session.document.id
      return <div key={item.document.id} data-document-id={item.document.id} className={`document-tab-stage ${isActive ? 'is-active' : ''}`} aria-hidden={!isActive}>
        <QuickCommandBar documentId={item.document.id} shortcutFor={shortcutFor} onToggleMirror={onToggleMirror} onOpenAntiAlias={onOpenAntiAlias} onOpenPreferences={onOpenPreferences} onOpenCommandSettings={onOpenCommandSettings} />
        <div className="document-pane-canvas-content"><DocumentCanvas documentId={item.document.id} /></div>
      </div>
    })}</div> : null

  return <PerformanceProfiler id="EditorCanvasHost"><div className={`stage-wrap ${documentPaneLayout ? 'has-split' : ''}`} onDragOver={(event) => { if (event.dataTransfer.types.includes('application/x-moonsprite-document')) { event.preventDefault(); event.dataTransfer.dropEffect = 'move' } }} onDrop={dropDocumentIntoWorkspace}><Suspense fallback={<div aria-hidden="true" />}>{content}</Suspense></div>{paneDragPreview && createPortal(<div className="document-tab-drag-layer" aria-hidden="true">{paneTabReturnPreview && <div className="document-pane-tab-return-preview" style={{ left: paneTabReturnPreview.left, top: paneTabReturnPreview.top, height: paneTabReturnPreview.height }} />}<div className="document-tab-drag-ghost" data-document-pane-drag-ghost="true" style={{ left: paneDragPreview.pointerX - paneDragPreview.pointerOffsetX, top: paneDragPreview.pointerY - paneDragPreview.pointerOffsetY, width: paneDragPreview.width, height: paneDragPreview.height }}><PixelUtilityIcon kind="image" /><span>{paneDragPreview.name}</span></div></div>, document.body)}{dockPreviewBand && createPortal(<div className="document-pane-dock-preview-layer" aria-hidden="true"><div className="document-pane-dock-preview-band" data-direction={dockPreviewBand.direction} style={{ left: dockPreviewBand.left, top: dockPreviewBand.top, width: dockPreviewBand.width, height: dockPreviewBand.height }} /></div>, document.body)}{paneContextMenu && onDocumentPaneFloat && createPortal(<div className="context-menu document-pane-context-menu" role="menu" aria-label={t('tabs.contextAria')} style={{ left: Math.min(paneContextMenu.x, Math.max(8, window.innerWidth - 232)), top: Math.min(paneContextMenu.y, Math.max(8, window.innerHeight - 72)) }}><button className="context-menu-item" type="button" role="menuitem" onClick={() => { onDocumentPaneFloat(paneContextMenu.documentId, { x: paneContextMenu.x, y: paneContextMenu.y }); setPaneContextMenu(null) }}><PixelUtilityIcon kind="move" /><span>{t('tabs.floatDocument')}</span></button></div>, document.body)}</PerformanceProfiler>
})
