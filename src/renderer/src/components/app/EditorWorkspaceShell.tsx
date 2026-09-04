import { memo, type CSSProperties, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import type { ToolRailSide } from '@shared/types'
import type { DocumentSession } from '@/store/workspace'
import { InspectorPanels, type PanelDock, type WorkspacePanelId } from '@/components/WorkspacePanels'
import { PerformanceProfiler } from '@/components/PerformanceProfiler'
import { EditorCanvasHost } from './EditorCanvasHost'
import { EditorToolOptions } from './EditorToolOptions'
import { EditorToolRail } from './EditorToolRail'
import { useI18n } from '@/components/I18nProvider'
import { useAnimationPlaybackClock } from '@/components/useAnimationPlaybackClock'
import type { DocumentPaneDirection, DocumentPaneNode } from '@/core/document-pane-layout'
import type { QuickCommandSettingsTarget } from './quick-command-registry'
import type { ShortcutId } from '@/core/shortcuts'

interface EditorWorkspaceShellProps {
  editorOnly: boolean
  editorColumns: string
  editorRows: string
  editorAreas: string
  toolRailSide: ToolRailSide
  toolRailDockPreview: ToolRailSide | null
  onToolRailGrip: (event: ReactPointerEvent<HTMLButtonElement>) => void
  hasLeftDock: boolean
  leftDockHost: HTMLElement | null
  setLeftDockHost: (host: HTMLElement | null) => void
  onLeftDockResize: (event: ReactPointerEvent<HTMLDivElement>) => void
  workAreaRef: RefObject<HTMLElement | null>
  hasBottomDock: boolean
  bottomDockHeight: number
  bottomDockHost: HTMLElement | null
  setBottomDockHost: (host: HTMLElement | null) => void
  onBottomDockResize: (event: ReactPointerEvent<HTMLDivElement>) => void
  documentPaneLayout: DocumentPaneNode | null
  workspaceDocumentId: string | null
  paneOnlyDocumentIds: readonly string[]
  onDocumentPaneLayoutChange: (layout: DocumentPaneNode | null) => void
  onDocumentPaneMove: (documentId: string, targetPaneId: string, direction: DocumentPaneDirection) => void
  onDocumentPaneReturnToTabs: (documentId: string, visibleIndex: number) => void
  onDocumentPaneFloat: (documentId: string, anchor: { x: number; y: number }) => void
  hasRightDock: boolean
  onInspectorResize: (event: ReactPointerEvent<HTMLDivElement>) => void
  session: DocumentSession
  workspaceLayoutRevision: number
  panelVisibility: Record<WorkspacePanelId, boolean>
  popupPanelId: WorkspacePanelId | null
  onPopupPanelClose: () => void
  onClosePreview: () => void
  panelDocks: Record<WorkspacePanelId, PanelDock>
  onPanelDockChange: (id: WorkspacePanelId, dock: PanelDock) => void
  onPanelVisibilityChange: (id: WorkspacePanelId, visible: boolean) => void
  relativeLuminanceInPreview: boolean
  onOpenColorReplacement: () => void
  onOpenAntiAlias: () => void
  onOpenPreferences: () => void
  onOpenCommandSettings?: (target: QuickCommandSettingsTarget) => void
  shortcutFor: (id: ShortcutId) => string
  onToggleMirror: (axis: 'horizontal' | 'vertical') => void
}

export const EditorWorkspaceShell = memo(function EditorWorkspaceShell({
  editorOnly,
  editorColumns,
  editorRows,
  editorAreas,
  toolRailSide,
  toolRailDockPreview,
  onToolRailGrip,
  hasLeftDock,
  leftDockHost,
  setLeftDockHost,
  onLeftDockResize,
  workAreaRef,
  hasBottomDock,
  bottomDockHeight,
  bottomDockHost,
  setBottomDockHost,
  onBottomDockResize,
  documentPaneLayout,
  workspaceDocumentId,
  paneOnlyDocumentIds,
  onDocumentPaneLayoutChange,
  onDocumentPaneMove,
  onDocumentPaneReturnToTabs,
  onDocumentPaneFloat,
  hasRightDock,
  onInspectorResize,
  session,
  workspaceLayoutRevision,
  panelVisibility,
  popupPanelId,
  onPopupPanelClose,
  onClosePreview,
  panelDocks,
  onPanelDockChange,
  onPanelVisibilityChange,
  relativeLuminanceInPreview,
  onOpenColorReplacement,
  onOpenAntiAlias,
  onOpenPreferences,
  onOpenCommandSettings,
  shortcutFor,
  onToggleMirror
}: EditorWorkspaceShellProps) {
  const { t } = useI18n()
  useAnimationPlaybackClock(session.document.id)
  return <PerformanceProfiler id="EditorWorkspaceShell"><section className="editor-layout" style={{ gridTemplateColumns: editorOnly ? 'minmax(0, 1fr)' : editorColumns, gridTemplateRows: editorOnly ? 'minmax(0, 1fr)' : editorRows, gridTemplateAreas: editorOnly ? '"work"' : editorAreas }}>
    <EditorToolRail side={toolRailSide} onGripPointerDown={onToolRailGrip} />
    {hasLeftDock && <aside ref={setLeftDockHost} className="left-panel-dock" data-panel-dock-zone="left" />}
    {hasLeftDock && <div className="left-dock-resizer" role="separator" aria-orientation="vertical" aria-label={t('workspaceDock.resizeLeft')} onPointerDown={onLeftDockResize}><span aria-hidden="true" /></div>}
    <section ref={workAreaRef} className={`work-area ${hasBottomDock ? 'has-bottom-layers' : ''}`} style={{ '--bottom-layers-height': `${bottomDockHeight}px` } as CSSProperties}>
      <EditorToolOptions onOpenColorReplacement={onOpenColorReplacement} />
      <EditorCanvasHost documentPaneLayout={documentPaneLayout} workspaceDocumentId={workspaceDocumentId} paneOnlyDocumentIds={paneOnlyDocumentIds} onDocumentPaneLayoutChange={onDocumentPaneLayoutChange} onDocumentPaneMove={onDocumentPaneMove} onDocumentPaneReturnToTabs={onDocumentPaneReturnToTabs} onDocumentPaneFloat={onDocumentPaneFloat} shortcutFor={shortcutFor} onToggleMirror={onToggleMirror} onOpenAntiAlias={onOpenAntiAlias} onOpenPreferences={onOpenPreferences} onOpenCommandSettings={onOpenCommandSettings} />
      {hasBottomDock && <div className="bottom-layers-resizer" role="separator" aria-orientation="horizontal" aria-label={t('workspaceDock.resizeBottom')} onPointerDown={onBottomDockResize}><span /></div>}
      {hasBottomDock && <div ref={setBottomDockHost} className="bottom-layers-dock" data-panel-dock-zone="bottom" />}
    </section>
    {hasRightDock && <div className="inspector-resizer" role="separator" aria-orientation="vertical" aria-label={t('workspaceDock.resizeRight')} onPointerDown={onInspectorResize}><span aria-hidden="true" /></div>}
    <aside className={`inspector ${hasRightDock ? '' : 'inspector-empty'}`} {...(hasRightDock ? { 'data-panel-dock-zone': 'right' } : {})}>
      <InspectorPanels key={workspaceLayoutRevision} session={session} panelVisibility={panelVisibility} onClosePreview={onClosePreview} panelDocks={panelDocks} leftDockHost={leftDockHost} bottomDockHost={bottomDockHost} onPanelDockChange={onPanelDockChange} onPanelVisibilityChange={onPanelVisibilityChange} relativeLuminanceInPreview={relativeLuminanceInPreview} popupPanelId={popupPanelId} onPopupPanelClose={onPopupPanelClose} />
    </aside>
    {toolRailDockPreview && <div className={`tool-rail-dock-preview ${toolRailDockPreview}`} aria-hidden="true" />}
  </section></PerformanceProfiler>
})
