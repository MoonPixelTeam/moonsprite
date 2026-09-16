import { useAppInformationDialogs } from '@/components/app/useAppInformationDialogs'
import { useAppDocumentDialogs } from '@/components/app/useAppDocumentDialogs'
import { useAppSettingsDialogs } from '@/components/app/useAppSettingsDialogs'
import { useAppDocumentPanes } from '@/components/app/useAppDocumentPanes'
import { useAppWorkspaceLayout } from '@/components/app/useAppWorkspaceLayout'
import { useAppPreferences } from '@/components/app/useAppPreferences'
import { useAppCommandScope } from '@/components/app/useAppCommandScope'
import { useAppShortcutSettings } from '@/components/app/useAppShortcutSettings'
import { useAppViewMode } from '@/components/app/useAppViewMode'
import { useAppExtensions } from '@/components/app/useAppExtensions'
import { useAppDocumentIO } from '@/components/app/useAppDocumentIO'
import { useAppWindowLifecycle } from '@/components/app/useAppWindowLifecycle'
import { useAppShortcutRouter } from '@/components/app/useAppShortcutRouter'
import { useAppScriptRuntime } from '@/components/app/useAppScriptRuntime'
import { TextToolHost } from '@/components/app/TextToolHost'
import { lazy, Suspense, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2 } from 'lucide-react'
import { AppMenuBar } from '@/components/app/AppMenuBar'
import { ExtensionPanelHost } from '@/components/extensions/ExtensionPanelHost'
import { ExtensionRuntimeHost } from '@/components/extensions/ExtensionRuntimeHost'
import { AppWindowTitleBar } from '@/components/app/AppWindowTitleBar'
import { DocumentTabs } from '@/components/app/DocumentTabs'
import { EditorStatusBar } from '@/components/app/EditorStatusBar'
import { BrushDynamicsTelemetryCapture } from '@/components/app/BrushDynamicsTelemetryCapture'
import { EditorWorkspaceShell } from '@/components/app/EditorWorkspaceShell'
import { FloatingDocumentWindow } from '@/components/app/FloatingDocumentWindow'
import { appCoordinatorRenderKey } from '@/components/app/app-render-keys'
import { OpenProgressOverlay } from '@/components/OpenProgressOverlay'
import { SaveProgressOverlay } from '@/components/SaveProgressOverlay'
import { ProjectRollbackProgressOverlay } from '@/components/ProjectRollbackProgressOverlay'
import { WorkspaceManagerDialog } from '@/components/WorkspaceManagerDialog'
import { DialogHeader } from '@/components/DialogHeader'
import { FormField } from '@/components/FormField'
import { ModalShell } from '@/components/ModalShell'
import { PixelUtilityIcon } from '@/components/PixelUtilityIcon'
import { TextInput } from '@/components/TextInput'
import { useAppPlaybackShortcut } from '@/components/app/useAppPlaybackShortcut'
import { executeExtensionCommand } from '@/core/extension-runtime'
import { formatBytes } from '@/core/resource-policy'
import { saveProgress } from '@/core/save-progress'
import { openRuntimeDiagnosticLogs } from '@/platform/runtime-diagnostics'
import { useWorkspace } from '@/store/workspace'
import { useI18n } from '@/components/I18nProvider'
import './styles.css'

const LazyHomeWorkspace = lazy(() => import('@/components/HomeWorkspace').then(({ HomeWorkspace }) => ({ default: HomeWorkspace })))

export default function App() {
  const { t } = useI18n()
  const coordinatorRenderKey = useWorkspace(appCoordinatorRenderKey)
  const workspace = useWorkspace.getState()
  const scriptRuntime = useAppScriptRuntime()
  const { scripts: luaScripts, loading: luaScriptsLoading, loadFailed: luaScriptsLoadFailed, refresh: refreshLuaScripts, run: runLuaScript } = scriptRuntime
  const [resourceLabel, setResourceLabel] = useState('')
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [homeOpen, setHomeOpen] = useState(false)
  const session = workspace.sessions.find((item) => item.document.id === workspace.activeId) ?? null
  const {
    paneOnlyDocumentIds,
    workspaceDocumentId,
    setWorkspaceDocumentId,
    floatingDocuments,
    hiddenDocumentIds,
    visibleDocumentPaneLayout,
    activateDocumentTab,
    contextActivateDocumentTab,
    splitDocumentFromTab,
    updateDocumentPaneLayout,
    moveDocumentPaneView,
    floatDocument,
    activateFloatingDocument,
    setFloatingDocumentPinned,
    returnFloatingDocumentToTabs,
    closeFloatingDocument,
    returnDocumentPaneToTabs
  } = useAppDocumentPanes({ setHomeOpen })
  const {
    defaultFileDirectories,
    documentSizePresets,
    setDocumentSizePresets,
    exportScalePresets,
    setExportScalePresets,
    relativeLuminanceScope,
    runtimePreferences,
    toggleTimelineVisibility,
    toggleSliceOutlinesVisibility,
    toggleAlignmentPreference,
    applyIsoViewPreferences,
    previewIsoViewPreferences
  } = useAppPreferences({ relativeLuminance: session?.view.relativeLuminance ?? false })
  const { shortcuts, saveShortcuts, shortcutConflictState, shortcutFor } = useAppShortcutSettings()
  const { commandScopeRef, commandSurfaceRef, pointerPositionRef, selectionCommandOverrideRef } = useAppCommandScope()
  const { advancedMode, advancedModeNotice, advancedModeNoticeShortcut, cycleAdvancedMode, toggleMirrorView, editorOnly } = useAppViewMode({
    homeOpen,
    session,
    shortcutFor
  })
  const {
    workspaceSaveOpen,
    setWorkspaceSaveOpen,
    workspaceManagerOpen,
    setWorkspaceManagerOpen,
    workspaceSaveName,
    setWorkspaceSaveName,
    savedWorkspaces,
    activeWorkspaceId,
    workspaceDirectory,
    workspaceBusy,
    panelVisibility,
    popupPanelId,
    setPopupPanelId,
    inspectorWidth,
    panelDocks,
    bottomLayersHeight,
    bottomDockHost,
    setBottomDockHost,
    leftDockWidth,
    leftDockHost,
    setLeftDockHost,
    toolRailSide,
    toolRailDockPreview,
    workspaceLayoutRevision,
    workAreaRef,
    updatePanelDock,
    updatePanelVisibility,
    publishShortcutCommand,
    togglePopupPanel,
    updateToolRailSide,
    dockedPopupPanelId,
    hasLeftDock,
    hasBottomDock,
    hasRightDock,
    loadSavedWorkspaces,
    applyWorkspaceLayout,
    saveWorkspace,
    resetCurrentWorkspace,
    deleteSavedWorkspace,
    beginToolRailDrag,
    beginLeftDockResize,
    beginBottomDockResize,
    beginInspectorResize,
    closePreviewPanel,
    editorColumns,
    editorRows,
    editorAreas
  } = useAppWorkspaceLayout({ homeOpen, documentId: session?.document.id ?? null, documentPaneLayout: visibleDocumentPaneLayout, onDocumentPaneLayoutChange: updateDocumentPaneLayout })
  const {
    extensions,
    extensionPanelVisibility,
    extensionPanelContributions,
    extensionToolContributions,
    setExtensionPanelVisible,
    toggleExtensionPanel,
    openLuaScriptFolder,
    installExtensionPackage
  } = useAppExtensions({ session, openMenu, setOpenMenu, refreshLuaScripts })
  const {
    recentFiles,
    runSaveActive,
    openFilesAndShowDocument,
    openGalleryProject,
    openHomeImage,
    restoreRecoveryAndShowDocument,
    openProjectFolder,
    restoreProjectBackup,
    createDocumentAndShow
  } = useAppDocumentIO({ setHomeOpen, setWorkspaceDocumentId, runtimePreferences, installExtensionPackage })
  const {} = useAppWindowLifecycle()
  const {
    aboutOpen,
    setAboutOpen,
    componentLibraryOpen,
    setComponentLibraryOpen,
    latestReleaseOpen,
    setLatestReleaseOpen,
    setUsageStatisticsOpen,
    openLatestRelease,
    appInformationDialogsSurface
  } = useAppInformationDialogs()
  const {
    newOpen,
    setNewOpen,
    canvasResizeOpen,
    setCanvasResizeOpen,
    imageResizeOpen,
    setImageResizeOpen,
    outlineOpen,
    setOutlineOpen,
    setAntiAliasOpen,
    lcdScreenOpen,
    setLcdScreenOpen,
    colorReplacementOpen,
    setColorReplacementOpen,
    adjustmentOpen,
    setAdjustmentOpen,
    setAdjustmentKind,
    gridSettingsOpen,
    setGridSettingsOpen,
    isoViewSettingsOpen,
    setIsoViewSettingsOpen,
    projectInfoOpen,
    setProjectInfoOpen,
    projectRollbackOpen,
    setProjectRollbackOpen,
    timelapseOpen,
    setTimelapseOpen,
    setSpriteSheetExportSourceId,
    exportDialogRef,
    openExport,
    saveAsOpen,
    setSaveAsOpen,
    spriteSheetExportOpen,
    openColorReplacement,
    openSaveAs,
    openNewDocumentFromTab,
    appDocumentDialogsSurface
  } = useAppDocumentDialogs({
    session,
    runtimePreferences,
    defaultFileDirectories,
    runSaveActive,
    exportScalePresets,
    applyIsoViewPreferences,
    previewIsoViewPreferences,
    restoreProjectBackup,
    documentSizePresets,
    createDocumentAndShow
  })
  const {
    preferencesOpen,
    setPreferencesOpen,
    shortcutOpen,
    setShortcutOpen,
    extensionSettingsOpen,
    openExtensionSettings,
    closeExtensionSettings,
    openPreferences,
    openQuickCommandPreferences,
    openQuickCommandSettings,
    appSettingsDialogsSurface
  } = useAppSettingsDialogs({ setGridSettingsOpen, setDocumentSizePresets, setExportScalePresets, shortcuts, saveShortcuts, extensions })

  void coordinatorRenderKey

  useEffect(() => {
    const closeTransientPopovers = (event: PointerEvent): void => {
      if (!(event.target instanceof Element)) return
      // The workspace menu is portalled to document.body so it can escape the tab strip.
      // Treat both its trigger and its portalled content as part of the same menu surface.
      if (!event.target.closest('.menu-strip, .workspace-top-control, .workspace-popover')) setOpenMenu(null)
    }
    window.addEventListener('pointerdown', closeTransientPopovers, true)
    return () => window.removeEventListener('pointerdown', closeTransientPopovers, true)
  }, [])

  useAppPlaybackShortcut({ homeOpen, openMenu, popupPanelId, timelineHidden: runtimePreferences.timelineHidden, shortcutConflictState, shortcuts })

  useEffect(() => {
    void window.moonSprite.getResourceInfo().then((info) => setResourceLabel(t('app.resource.freeMemory', { value: formatBytes(info.freeBytes) })))
  }, [t])
  const closeMenu = (): void => setOpenMenu(null)
  const documentTabsVisible = workspace.sessions.length > 0
  useAppShortcutRouter({
    shortcuts,
    homeOpen,
    outlineOpen,
    openMenu: Boolean(openMenu),
    shortcutOpen,
    timelineHidden: runtimePreferences.timelineHidden,
    commandScope: () => commandScopeRef.current,
    selectionOverride: () => selectionCommandOverrideRef.current,
    onEscape: (event) => {
      const hasPaletteSurface = Boolean(
        document.querySelector('.palette-operation-dialog, .palette-library-popover, .palette-actions-popover, .palette-library-context')
      )
      const hasOwnedPopover = Boolean(document.querySelector('.document-tab-context-menu, .tool-flyout, .brush-library, .brush-size-popover'))
      const dialogChoice =
        workspace.dialog?.choices.find((choice) => choice.id === 'cancel')?.id ?? workspace.dialog?.choices.find((choice) => choice.tone === 'quiet')?.id
      if (workspace.dialog && dialogChoice) workspace.resolveDialog(dialogChoice)
      else if (saveProgress.getSnapshot().phase !== 'hidden') saveProgress.dismiss()
      else if (workspace.saveProgress) {
        if (!workspace.saveProgress.requiresConfirmation) workspace.cancelExport()
        else workspace.dismissSaveProgress()
      } else if (adjustmentOpen) window.dispatchEvent(new CustomEvent('moonsprite:close-dialog', { detail: { target: 'adjustment' } }))
      else if (document.querySelector('.layer-modal')) window.dispatchEvent(new CustomEvent('moonsprite:close-dialog', { detail: { target: 'layers' } }))
      else if (hasPaletteSurface) window.dispatchEvent(new CustomEvent('moonsprite:close-dialog', { detail: { target: 'palette' } }))
      else if (newOpen) setNewOpen(false)
      else if (canvasResizeOpen) setCanvasResizeOpen(false)
      else if (imageResizeOpen) setImageResizeOpen(false)
      else if (outlineOpen) setOutlineOpen(false)
      else if (lcdScreenOpen) setLcdScreenOpen(false)
      else if (colorReplacementOpen) setColorReplacementOpen(false)
      else if (extensionSettingsOpen) closeExtensionSettings()
      else if (preferencesOpen) setPreferencesOpen(false)
      else if (shortcutOpen) setShortcutOpen(false)
      else if (aboutOpen) setAboutOpen(false)
      else if (componentLibraryOpen) setComponentLibraryOpen(false)
      else if (latestReleaseOpen) setLatestReleaseOpen(false)
      else if (gridSettingsOpen) setGridSettingsOpen(false)
      else if (isoViewSettingsOpen) setIsoViewSettingsOpen(false)
      else if (timelapseOpen) setTimelapseOpen(false)
      else if (projectInfoOpen) setProjectInfoOpen(false)
      else if (projectRollbackOpen) setProjectRollbackOpen(false)
      else if (scriptRuntime.closeTopDialog()) {
        /* Script dialogs own their close action. */
      } else if (spriteSheetExportOpen) setSpriteSheetExportSourceId(null)
      else if (exportDialogRef.current?.closeIfOpen()) {
        /* Export owner handles its own closing state. */
      } else if (saveAsOpen) setSaveAsOpen(false)
      else if (workspaceSaveOpen) setWorkspaceSaveOpen(false)
      else if (workspaceManagerOpen) setWorkspaceManagerOpen(false)
      else if (openMenu) setOpenMenu(null)
      else if (popupPanelId) setPopupPanelId(null)
      else if (hasOwnedPopover) window.dispatchEvent(new CustomEvent('moonsprite:close-dialog', { detail: { target: 'popover' } }))
      else if (session?.pendingPaste) {
        workspace.commitFloatingPaste()
        const active = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id)
        if (active?.selection) workspace.commitSelectionChange(active.selection, null, t('app.selection.completeHistory'))
      } else if (session?.textBoxTransform) workspace.cancelTextBoxTransform()
      else workspace.setSelection(null)
      event.preventDefault()
      event.stopPropagation()
      return
    },
    openAdjustment: (kind) => {
      setAdjustmentKind(kind)
      setAdjustmentOpen(true)
    },
    pointerPosition: () => pointerPositionRef.current,
    commandSurface: () => commandSurfaceRef.current,
    rotationIndicatorPosition: runtimePreferences.rotationIndicatorPosition,
    publishShortcutCommand,
    commands: {
      saveAs: () => {
        if (session && !homeOpen) openSaveAs()
      },
      openHome: () => setHomeOpen(true),
      newDocument: () => setNewOpen(true),
      openDocument: () => {
        void openFilesAndShowDocument()
      },
      exportDocument: openExport,
      exportAllFrames: () => openExport('frames'),
      exportSpriteSheet: () => {
        if (session) setSpriteSheetExportSourceId(session.document.id)
      },
      openProjectFolder: () => {
        if (session) openProjectFolder(session.document.id)
      },
      openTimelapse: () => {
        if (session) setTimelapseOpen(true)
      },
      openProjectInfo: () => {
        if (session) setProjectInfoOpen(true)
      },
      openScriptFolder: () => {
        void openLuaScriptFolder()
      },
      replaceColor: () => {
        if (session) setColorReplacementOpen(true)
      },
      openShortcutSettings: () => setShortcutOpen(true),
      openPreferences: () => openPreferences(),
      canvasResize: () => {
        if (session) setCanvasResizeOpen(true)
      },
      imageResize: () => {
        if (session) setImageResizeOpen(true)
      },
      mirrorView: () => {
        if (session) toggleMirrorView('horizontal')
      },
      mirrorViewVertical: () => {
        if (session) toggleMirrorView('vertical')
      },
      toggleSliceOutlines: toggleSliceOutlinesVisibility,
      openGridSettings: () => {
        if (session) setGridSettingsOpen(true)
      },
      openIsoViewSettings: () => {
        if (session) setIsoViewSettingsOpen(true)
      },
      toggleColorPanel: () => updatePanelVisibility('color', !panelVisibility.color),
      togglePalettePanel: () => updatePanelVisibility('palette', !panelVisibility.palette),
      toggleLayersPanel: () => updatePanelVisibility('layers', !panelVisibility.layers),
      togglePreviewPanel: () => updatePanelVisibility('preview', !panelVisibility.preview),
      toggleTilesetPanel: () => updatePanelVisibility('tileset', !panelVisibility.tileset),
      toggleBrushLibraryPanel: () => updatePanelVisibility('brushes', !panelVisibility.brushes),
      popupColorPanel: () => togglePopupPanel('color'),
      popupPalettePanel: () => togglePopupPanel('palette'),
      popupLayersPanel: () => togglePopupPanel('layers'),
      popupPreviewPanel: () => togglePopupPanel('preview'),
      popupTilesetPanel: () => togglePopupPanel('tileset'),
      popupBrushLibraryPanel: () => togglePopupPanel('brushes'),
      toggleTimeline: toggleTimelineVisibility,
      toolRailLeft: () => updateToolRailSide('left'),
      toolRailRight: () => updateToolRailSide('right'),
      toolRailTop: () => updateToolRailSide('top'),
      toolRailBottom: () => updateToolRailSide('bottom'),
      saveWorkspaceLayout: () => {
        setWorkspaceSaveName('')
        setWorkspaceSaveOpen(true)
      },
      resetWorkspaceLayout: () => {
        void resetCurrentWorkspace()
      },
      openWorkspaceManager: () => {
        void loadSavedWorkspaces()
        setWorkspaceManagerOpen(true)
      },
      openComponentLibrary: () => setComponentLibraryOpen(true),
      openLatestRelease: () => openLatestRelease(),
      openAbout: () => setAboutOpen(true),
      advancedMode: () => cycleAdvancedMode(),
      outline: () => {
        if (session) setOutlineOpen(true)
      }
    }
  })
  return (
    <main
      className={`app-shell ${session?.view.showPixelGrid ? 'pixel-grid-on' : ''} ${editorOnly ? 'advanced-mode' : ''} ${advancedMode === 'tool-options' ? 'advanced-tool-options' : ''} ${advancedMode === 'canvas-only' ? 'advanced-canvas-only' : ''} ${documentTabsVisible ? '' : 'no-document-tabs'}`}
    >
      <AppWindowTitleBar />
      <BrushDynamicsTelemetryCapture documentId={session?.document.id ?? null} />

      {appDocumentDialogsSurface}

      <AppMenuBar
        openMenu={openMenu}
        setOpenMenu={setOpenMenu}
        shortcutFor={shortcutFor}
        homeOpen={homeOpen}
        panelVisibility={panelVisibility}
        timelineHidden={runtimePreferences.timelineHidden}
        sliceOutlinesVisible={runtimePreferences.sliceOutlinesVisible}
        alignmentPreferences={{
          gridAlignmentEnabled: runtimePreferences.gridAlignmentEnabled,
          smartAlignmentEnabled: runtimePreferences.smartAlignmentEnabled,
          alignmentGuidesVisible: runtimePreferences.alignmentGuidesVisible
        }}
        toolRailSide={toolRailSide}
        advancedModeActive={advancedMode !== null}
        luaScriptRunning={scriptRuntime.busy}
        luaScripts={luaScripts}
        luaScriptsLoading={luaScriptsLoading}
        luaScriptsLoadFailed={luaScriptsLoadFailed}
        extensions={extensions}
        extensionPanelVisibility={extensionPanelVisibility}
        recentFiles={recentFiles}
        onHome={() => setHomeOpen(true)}
        onNew={() => setNewOpen(true)}
        onOpen={() => {
          void openFilesAndShowDocument()
        }}
        onOpenRecent={(filePath) => {
          void openGalleryProject(filePath)
        }}
        onSave={() => {
          void runSaveActive()
        }}
        onSaveAs={openSaveAs}
        onExport={() => openExport()}
        onExportAllFrames={() => openExport('frames')}
        onExportSpriteSheet={() => {
          if (session) setSpriteSheetExportSourceId(session.document.id)
        }}
        onOpenTimelapse={() => setTimelapseOpen(true)}
        onOpenProjectInfo={() => setProjectInfoOpen(true)}
        projectRollbackEnabled={Boolean(session?.document.filePath && runtimePreferences.projectBackupEnabled)}
        onOpenProjectRollback={() => setProjectRollbackOpen(true)}
        onRunLuaScript={(scriptId) => {
          void runLuaScript(scriptId)
        }}
        onOpenLuaScriptFolder={() => {
          void openLuaScriptFolder()
        }}
        onToggleExtensionPanel={toggleExtensionPanel}
        onOpenProjectFolder={openProjectFolder}
        onOpenOutline={() => setOutlineOpen(true)}
        onOpenAntiAlias={() => setAntiAliasOpen(true)}
        onOpenColorReplacement={() => setColorReplacementOpen(true)}
        onOpenAdjustment={(kind) => {
          setAdjustmentKind(kind)
          setAdjustmentOpen(true)
        }}
        onOpenLcdScreenFilter={() => setLcdScreenOpen(true)}
        onOpenShortcuts={() => setShortcutOpen(true)}
        onOpenPreferences={() => openPreferences()}
        onOpenExtensionSettings={openExtensionSettings}
        onOpenCanvasResize={() => setCanvasResizeOpen(true)}
        onOpenImageResize={() => setImageResizeOpen(true)}
        onOpenGridSettings={() => setGridSettingsOpen(true)}
        onOpenIsoViewSettings={() => setIsoViewSettingsOpen(true)}
        onToggleMirror={toggleMirrorView}
        onTogglePanel={(id) => updatePanelVisibility(id, !panelVisibility[id])}
        onToggleTimeline={toggleTimelineVisibility}
        onToggleSliceOutlines={toggleSliceOutlinesVisibility}
        onToggleAlignmentPreference={toggleAlignmentPreference}
        onToolRailSideChange={updateToolRailSide}
        onCycleAdvancedMode={cycleAdvancedMode}
        onOpenComponentLibrary={() => setComponentLibraryOpen(true)}
        onOpenLatestRelease={openLatestRelease}
        onOpenUsageStatistics={() => setUsageStatisticsOpen(true)}
        onOpenDiagnostics={() => {
          void openRuntimeDiagnosticLogs().catch((error) => workspace.setMessage(error instanceof Error ? error.message : String(error)))
        }}
        onOpenAbout={() => setAboutOpen(true)}
      />

      {documentTabsVisible && (
        <section className="tab-strip" aria-label={t('app.documentTabs.aria')}>
          <DocumentTabs
            homeOpen={homeOpen}
            hiddenDocumentIds={hiddenDocumentIds}
            onNew={openNewDocumentFromTab}
            onActivate={activateDocumentTab}
            onContextActivate={contextActivateDocumentTab}
            onSplit={splitDocumentFromTab}
            onFloat={floatDocument}
          />
          <span className="workspace-top-control workspace-tab-control">
            <button
              type="button"
              className={`icon-button ${openMenu === 'workspace' ? 'active' : ''}`}
              title={t('app.workspace.aria')}
              aria-label={t('app.workspace.aria')}
              aria-expanded={openMenu === 'workspace'}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => {
                setOpenMenu(openMenu === 'workspace' ? null : 'workspace')
                if (openMenu !== 'workspace') void loadSavedWorkspaces()
              }}
            >
              <PixelUtilityIcon kind="workspace" />
            </button>
            {openMenu === 'workspace' &&
              createPortal(
                <div className="workspace-popover" role="menu" aria-label={t('app.workspace.aria')}>
                  <button
                    type="button"
                    role="menuitem"
                    onPointerDown={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      setWorkspaceSaveName('')
                      setWorkspaceSaveOpen(true)
                      closeMenu()
                    }}
                  >
                    {t('app.workspace.new')}
                    {shortcutFor('saveWorkspaceLayout') && <kbd>{shortcutFor('saveWorkspaceLayout')}</kbd>}
                  </button>
                  <span className="workspace-popover-divider" />
                  {savedWorkspaces.map((saved) => (
                    <button
                      key={saved.id}
                      type="button"
                      role="menuitem"
                      className={saved.id === activeWorkspaceId ? 'selected-workspace' : ''}
                      title={t('app.workspace.loadTitle', { name: saved.name })}
                      onPointerDown={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        void applyWorkspaceLayout(saved)
                        closeMenu()
                      }}
                    >
                      <span className="menu-check">{saved.id === activeWorkspaceId && <PixelUtilityIcon kind="check" />}</span>
                      <span>{saved.name}</span>
                    </button>
                  ))}
                  <span className="workspace-popover-divider" />
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!activeWorkspaceId}
                    onPointerDown={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      void resetCurrentWorkspace()
                      closeMenu()
                    }}
                  >
                    {t('app.workspace.resetCurrent')}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onPointerDown={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      setWorkspaceManagerOpen(true)
                      closeMenu()
                    }}
                  >
                    {t('app.workspace.manage')}
                    {shortcutFor('openWorkspaceManager') && <kbd>{shortcutFor('openWorkspaceManager')}</kbd>}
                  </button>
                </div>,
                document.body
              )}
          </span>
        </section>
      )}

      {session && !homeOpen ? (
        <EditorWorkspaceShell
          editorOnly={editorOnly}
          editorColumns={editorColumns}
          leftDockWidth={leftDockWidth}
          inspectorWidth={inspectorWidth}
          editorRows={editorRows}
          editorAreas={editorAreas}
          toolRailSide={toolRailSide}
          toolRailDockPreview={toolRailDockPreview}
          onToolRailGrip={beginToolRailDrag}
          hasLeftDock={hasLeftDock}
          leftDockHost={leftDockHost}
          setLeftDockHost={setLeftDockHost}
          onLeftDockResize={beginLeftDockResize}
          workAreaRef={workAreaRef}
          hasBottomDock={hasBottomDock}
          bottomDockHeight={bottomLayersHeight}
          bottomDockHost={bottomDockHost}
          setBottomDockHost={setBottomDockHost}
          onBottomDockResize={beginBottomDockResize}
          documentPaneLayout={visibleDocumentPaneLayout}
          workspaceDocumentId={workspaceDocumentId}
          paneOnlyDocumentIds={paneOnlyDocumentIds}
          onDocumentPaneLayoutChange={updateDocumentPaneLayout}
          onDocumentPaneMove={moveDocumentPaneView}
          onDocumentPaneReturnToTabs={returnDocumentPaneToTabs}
          onDocumentPaneFloat={floatDocument}
          hasRightDock={hasRightDock}
          onInspectorResize={beginInspectorResize}
          session={session}
          workspaceLayoutRevision={workspaceLayoutRevision}
          panelVisibility={panelVisibility}
          popupPanelId={dockedPopupPanelId}
          onPopupPanelClose={() => setPopupPanelId(null)}
          onClosePreview={closePreviewPanel}
          panelDocks={panelDocks}
          onPanelDockChange={updatePanelDock}
          onPanelVisibilityChange={updatePanelVisibility}
          relativeLuminanceInPreview={relativeLuminanceScope === 'app'}
          onOpenColorReplacement={openColorReplacement}
          onOpenAntiAlias={() => setAntiAliasOpen(true)}
          onOpenPreferences={openQuickCommandPreferences}
          onOpenCommandSettings={openQuickCommandSettings}
          shortcutFor={shortcutFor}
          onToggleMirror={toggleMirrorView}
          extensionTools={extensionToolContributions}
        />
      ) : (
        <Suspense fallback={<div aria-hidden="true" />}>
          <LazyHomeWorkspace
            onNew={() => setNewOpen(true)}
            onOpen={() => void openFilesAndShowDocument()}
            onOpenProject={openGalleryProject}
            onOpenImage={openHomeImage}
            onRestoreRecovery={restoreRecoveryAndShowDocument}
            onOpenLatestRelease={openLatestRelease}
          />
        </Suspense>
      )}

      {floatingDocuments.map((item, stackIndex) => {
        const floatingSession = workspace.sessions.find((candidate) => candidate.document.id === item.documentId)
        return floatingSession ? (
          <FloatingDocumentWindow
            key={item.documentId}
            session={floatingSession}
            initialPosition={item.initialPosition}
            pinned={item.pinned}
            stackIndex={stackIndex}
            onActivate={activateFloatingDocument}
            onPinnedChange={setFloatingDocumentPinned}
            onReturnToTabs={returnFloatingDocumentToTabs}
            onCloseDocument={closeFloatingDocument}
            shortcutFor={shortcutFor}
            onToggleMirror={toggleMirrorView}
            onOpenAntiAlias={() => setAntiAliasOpen(true)}
            onOpenPreferences={openQuickCommandPreferences}
            onOpenCommandSettings={openQuickCommandSettings}
          />
        ) : null
      })}
      <ExtensionPanelHost
        contributions={extensionPanelContributions}
        visibility={extensionPanelVisibility}
        documentAvailable={Boolean(session)}
        commandRunning={scriptRuntime.busy}
        onVisibilityChange={setExtensionPanelVisible}
        onRunCommand={(extensionId, command) => {
          const extension = extensions.find((candidate) => candidate.id === extensionId)
          if (extension) executeExtensionCommand(extension, command, { runLua: (scriptId) => { void runLuaScript(scriptId) }, openSettings: openExtensionSettings })
        }}
      />
      <ExtensionRuntimeHost
        extensions={extensions}
        session={session}
        homeOpen={homeOpen}
        onRunLuaScript={(scriptId) => { void runLuaScript(scriptId) }}
        onOpenSettings={openExtensionSettings}
      />

      <EditorStatusBar homeOpen={homeOpen} resourceLabel={resourceLabel} />
      <OpenProgressOverlay />
      <ProjectRollbackProgressOverlay />
      <SaveProgressOverlay />
      {advancedModeNotice && (
        <div className="advanced-mode-notice" role="status" aria-live="polite">
          <strong>{advancedModeNotice}</strong>
          <small>
            {advancedModeNotice === t('app.advanced.enabled') ? `${advancedModeNoticeShortcut} ${t('app.advanced.restore')}` : advancedModeNoticeShortcut}
          </small>
        </div>
      )}
      {workspace.saveProgress &&
        createPortal(
          <div
            className={`modal-backdrop save-progress-backdrop ${workspace.saveProgress.requiresConfirmation ? 'is-complete' : 'is-running'}`}
            role="presentation"
          >
            <ModalShell
              storageKey="save-progress"
              defaultWidth={280}
              defaultHeight={workspace.saveProgress.requiresConfirmation ? 190 : 142}
              fitContentKey={workspace.saveProgress.requiresConfirmation ? 'complete' : 'progress'}
              minWidth={250}
              minHeight={workspace.saveProgress.requiresConfirmation ? 176 : 132}
              className="save-progress-modal"
              role="dialog"
              aria-modal="true"
              aria-live="polite"
              aria-labelledby="save-progress-title"
            >
              <header>
                <div className="save-progress-heading">
                  <span className="save-progress-icon" aria-hidden="true">
                    {workspace.saveProgress.requiresConfirmation ? <CheckCircle2 size={20} /> : <span className="save-progress-animation" />}
                  </span>
                  <div>
                    <span className="eyebrow">FILE OPERATION</span>
                    <h2 id="save-progress-title">{workspace.saveProgress.title}</h2>
                  </div>
                </div>
                {!workspace.saveProgress.requiresConfirmation && (
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={t('app.progress.close', { title: workspace.saveProgress.title })}
                    onClick={() => workspace.cancelExport()}
                  >
                    <PixelUtilityIcon kind="close" />
                  </button>
                )}
              </header>
              <div className="save-progress-body">
                <strong>{workspace.saveProgress.label}</strong>
                <div
                  className={`save-progress-track ${workspace.saveProgress.value >= 100 ? 'is-full' : ''}`}
                  aria-label={t('app.progress.aria', { title: workspace.saveProgress.title, value: workspace.saveProgress.value })}
                >
                  <i style={{ width: `${workspace.saveProgress.value}%` }} />
                </div>
                <div className="save-progress-meta">
                  <span>{t(workspace.saveProgress.requiresConfirmation ? 'app.progress.complete' : 'app.progress.processing')}</span>
                  <small>{workspace.saveProgress.value}%</small>
                </div>
              </div>
              {workspace.saveProgress.requiresConfirmation && (
                <footer>
                  <button type="button" className="primary-button" onClick={() => workspace.dismissSaveProgress()}>
                    {t('timelapse.confirmExport')}
                  </button>
                </footer>
              )}
            </ModalShell>
          </div>,
          document.body
        )}
      {workspace.dialog && (
        <div className="modal-backdrop dialog-backdrop" role="presentation">
          <ModalShell
            storageKey="confirm-content-v2"
            fitContentKey={`${workspace.dialog.title}:${workspace.dialog.choices.length}:${workspace.dialog.detail?.length ?? 0}`}
            defaultWidth={420}
            defaultHeight={220}
            minHeight={0}
            resizable={false}
            className={`confirm-modal${workspace.dialog.choices.some((choice) => choice.id === 'overwrite-all' || choice.id === 'rename-all') ? ' confirm-modal-bulk-actions' : ''}`}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="app-dialog-title"
          >
            <DialogHeader eyebrow="MOONSPRITE" title={workspace.dialog.title} titleId="app-dialog-title" />
            <div className="confirm-content">
              <strong>{workspace.dialog.message}</strong>
              {workspace.dialog.detail && <p>{workspace.dialog.detail}</p>}
            </div>
            <footer>
              {workspace.dialog.choices.map((choice) => (
                <button
                  key={choice.id}
                  className={choice.tone === 'primary' ? 'primary-button' : choice.tone === 'danger' ? 'danger-button' : 'quiet-button'}
                  onClick={() => workspace.resolveDialog(choice.id)}
                >
                  {choice.label}
                </button>
              ))}
            </footer>
          </ModalShell>
        </div>
      )}

      {appInformationDialogsSurface}

      {scriptRuntime.dialogs}

      <TextToolHost />
      {workspaceSaveOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget && !workspaceBusy) setWorkspaceSaveOpen(false)
          }}
        >
          <ModalShell
            as="form"
            storageKey="workspace-save"
            defaultWidth={420}
            defaultHeight={330}
            className="workspace-save-dialog"
            onSubmit={(event) => {
              event.preventDefault()
              void saveWorkspace(workspaceSaveName)
            }}
          >
            <DialogHeader
              eyebrow="WORKSPACE"
              title={t('app.workspace.saveTitle')}
              closeLabel={t('common.close')}
              closeDisabled={workspaceBusy}
              onClose={() => setWorkspaceSaveOpen(false)}
            />
            <div className="modal-body">
              <FormField label={t('app.workspace.name')}>
                <TextInput
                  autoFocus
                  maxLength={96}
                  value={workspaceSaveName}
                  placeholder={t('app.workspace.namePlaceholder')}
                  onChange={(event) => setWorkspaceSaveName(event.target.value)}
                />
              </FormField>
              <p className="modal-note">{t('app.workspace.saveHint')}</p>
              <p className="modal-note">{t('app.workspace.folder', { path: workspaceDirectory || 'workspaces' })}</p>
            </div>
            <footer>
              <button type="button" className="quiet-button" disabled={workspaceBusy} onClick={() => setWorkspaceSaveOpen(false)}>
                {t('common.cancel')}
              </button>
              <button type="submit" className="primary-button" disabled={workspaceBusy || !workspaceSaveName.trim()}>
                <PixelUtilityIcon kind="save" />
                {t('common.save')}
              </button>
            </footer>
          </ModalShell>
        </div>
      )}
      {workspaceManagerOpen && (
        <WorkspaceManagerDialog
          activeWorkspaceId={activeWorkspaceId}
          directory={workspaceDirectory}
          workspaces={savedWorkspaces}
          onClose={() => setWorkspaceManagerOpen(false)}
          onLoad={(saved) => {
            void applyWorkspaceLayout(saved)
          }}
          onDelete={(saved) => {
            void deleteSavedWorkspace(saved)
          }}
          onOpenFolder={() => {
            void window.moonSprite.openWorkspaceFolder()
          }}
          onCreate={() => {
            setWorkspaceManagerOpen(false)
            setWorkspaceSaveName('')
            setWorkspaceSaveOpen(true)
          }}
        />
      )}

      {appSettingsDialogsSurface}
    </main>
  )
}
