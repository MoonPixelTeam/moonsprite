import { ExportDialogHost, type ExportDialogHandle } from '@/components/app/ExportDialogHost'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ImageResizeInterpolation } from '@shared/types-raster'
import type { AdjustmentKind } from '@/core/adjustments'
import { preloadCanvasStage } from '@/components/app/EditorCanvasHost'
import { publishCanvasResizePreview } from '@/core/canvas-resize-preview'
import { detectDocumentPixelScale } from '@/core/image-scale-detection'
import { NewDocumentDialog } from '@/components/NewDocumentDialog'
import { CanvasResizeDialog } from '@/components/CanvasResizeDialog'
import { ColorReplacementDialog } from '@/components/ColorReplacementDialog'
import { ImageResizeDialog } from '@/components/ImageResizeDialog'
import { OutlineDialog } from '@/components/OutlineDialog'
import { AntiAliasDialog } from '@/components/AntiAliasDialog'
import { AdjustmentDialog } from '@/components/dialogs/AdjustmentDialog'
import { LcdScreenDialog } from '@/components/dialogs/LcdScreenDialog'
import { SaveAsDialog } from '@/components/dialogs/SaveAsDialog'
import { SpriteSheetImportDialog } from '@/components/dialogs/SpriteSheetImportDialog'
import { SpriteSheetExportDialog } from '@/components/dialogs/SpriteSheetExportDialog'
import { GridSettingsDialog } from '@/components/GridSettingsDialog'
import { IsoViewSettingsDialog } from '@/components/IsoViewSettingsDialog'
import { ProjectInfoDialog } from '@/components/ProjectInfoDialog'
import { ProjectRollbackDialog } from '@/components/ProjectRollbackDialog'
import { ProjectTimelapseDialog } from '@/components/TimelapseDialog'
import { SAVE_FORMAT_PREFERENCE_KEY, loadEditorPreferences, outputDirectoryForOperation, saveDirectoryForNewDocument } from '@/core/file-preferences'
import { readStoredString } from '@/core/storage'
import { documentSaveTarget } from '@/core/document-save-policy'
import { parentDirectoryFromPath } from '@/core/export-settings'
import { type ExportOptions, type SaveAsOptions, useWorkspace } from '@/store/workspace'
import { useI18n } from '@/components/I18nProvider'
import type { DocumentSession } from '@/store/workspace'
import type { useAppPreferences } from './useAppPreferences'
import type { useAppDocumentIO } from './useAppDocumentIO'
const saveAsFormatForPreference = (value: string | null): SaveAsOptions['format'] => {
  if (value === 'ase' || value === 'aseprite' || value === 'jpeg' || value === 'webp' || value === 'svg' || value === 'ico' || value === 'psd') return value
  if (value === 'png') return 'png-auto'
  return 'moonsprite'
}
interface Options {
  session: DocumentSession | null
  runtimePreferences: ReturnType<typeof loadEditorPreferences>
  defaultFileDirectories: ReturnType<typeof useAppPreferences>['defaultFileDirectories']
  runSaveActive: ReturnType<typeof useAppDocumentIO>['runSaveActive']
  exportScalePresets: ReturnType<typeof useAppPreferences>['exportScalePresets']
  applyIsoViewPreferences: ReturnType<typeof useAppPreferences>['applyIsoViewPreferences']
  previewIsoViewPreferences: ReturnType<typeof useAppPreferences>['previewIsoViewPreferences']
  restoreProjectBackup: ReturnType<typeof useAppDocumentIO>['restoreProjectBackup']
  documentSizePresets: ReturnType<typeof useAppPreferences>['documentSizePresets']
  createDocumentAndShow: ReturnType<typeof useAppDocumentIO>['createDocumentAndShow']
}

export function useAppDocumentDialogs({
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
}: Options) {
  const { t } = useI18n()
  const workspace = useWorkspace.getState()
  const [newOpen, setNewOpen] = useState(false)
  const [canvasResizeOpen, setCanvasResizeOpen] = useState(false)
  const [imageResizeOpen, setImageResizeOpen] = useState(false)
  const [outlineOpen, setOutlineOpen] = useState(false)
  const [antiAliasOpen, setAntiAliasOpen] = useState(false)
  const [lcdScreenOpen, setLcdScreenOpen] = useState(false)
  const [colorReplacementOpen, setColorReplacementOpen] = useState(false)
  const [adjustmentOpen, setAdjustmentOpen] = useState(false)
  const [adjustmentKind, setAdjustmentKind] = useState<AdjustmentKind>('brightness-contrast')
  const [gridSettingsOpen, setGridSettingsOpen] = useState(false)
  const [isoViewSettingsOpen, setIsoViewSettingsOpen] = useState(false)
  const [projectInfoOpen, setProjectInfoOpen] = useState(false)
  const [projectRollbackOpen, setProjectRollbackOpen] = useState(false)
  const [timelapseOpen, setTimelapseOpen] = useState(false)
  const [spriteSheetImportOpen, setSpriteSheetImportOpen] = useState(false)
  const [spriteSheetImportSourceId, setSpriteSheetImportSourceId] = useState<string | null>(null)
  const openSpriteSheetImport = () => { setSpriteSheetImportSourceId(session?.document.id ?? null); setSpriteSheetImportOpen(true) }
  const spriteSheetImportSession = workspace.sessions.find(item => item.document.id === spriteSheetImportSourceId) ?? null
  const [spriteSheetExportSourceId, setSpriteSheetExportSourceId] = useState<string | null>(null)
  const exportDialogRef = useRef<ExportDialogHandle>(null)
  const openExport = (target?: NonNullable<ExportOptions['target']>): void => exportDialogRef.current?.open(target)
  const [saveAsOpen, setSaveAsOpen] = useState(false)
  const spriteSheetExportOpen = spriteSheetExportSourceId !== null
  const spriteSheetExportSession = spriteSheetExportSourceId
    ? (workspace.sessions.find((item) => item.document.id === spriteSheetExportSourceId) ?? null)
    : null
  useEffect(() => {
    if (session?.view.isoViewEnabled === true) setIsoViewSettingsOpen(true)
  }, [session?.view.isoViewEnabled])
  const openColorReplacement = useCallback((): void => {
    if (useWorkspace.getState().activeId) setColorReplacementOpen(true)
  }, [])
  const openSaveAs = (): void => {
    if (!session) return
    setSaveAsOpen(true)
  }
  useEffect(() => {
    if (!newOpen) return
    preloadCanvasStage()
    void window.moonSprite.getResourceInfo()
  }, [newOpen])
  const openNewDocumentFromTab = useCallback((): void => setNewOpen(true), [])
  const appDocumentDialogsSurface = (
    <>
      {saveAsOpen && session && (
        <SaveAsDialog
          initialName={session.document.name.replace(/\.(moonsprite|aseprite|ase|png|jpe?g|webp|ico|psd)$/i, '') || 'MoonSprite-project'}
          initialFormat={runtimePreferences.saveOriginalFormat ? documentSaveTarget(session.document)?.format ?? saveAsFormatForPreference(readStoredString(SAVE_FORMAT_PREFERENCE_KEY)) : 'moonsprite'}
          initialDirectory={saveDirectoryForNewDocument(runtimePreferences) || defaultFileDirectories.saveDirectory}
          localGalleryDirectory={defaultFileDirectories.saveDirectory}
          projectRootDirectory={parentDirectoryFromPath(session.document.filePath ?? session.document.sourceFilePath ?? '')}
          exportScalePresets={exportScalePresets}
          onClose={() => setSaveAsOpen(false)}
          onSave={(options) => runSaveActive(true, options)}
        />
      )}
      {spriteSheetImportOpen && <SpriteSheetImportDialog key={spriteSheetImportSourceId ?? 'empty'} session={spriteSheetImportSession} onClose={() => setSpriteSheetImportOpen(false)} onChoose={async () => {
        const id = await workspace.chooseSpriteSheetImportSource()
        if (id) setSpriteSheetImportSourceId(id)
      }} />}
      {spriteSheetExportOpen && spriteSheetExportSession && (
        <SpriteSheetExportDialog
          key={spriteSheetExportSession.document.id}
          session={spriteSheetExportSession}
          defaultDirectory={outputDirectoryForOperation(runtimePreferences) || defaultFileDirectories.exportDirectory}
          localGalleryDirectory={defaultFileDirectories.saveDirectory}
          projectRootDirectory={parentDirectoryFromPath(spriteSheetExportSession.document.filePath ?? spriteSheetExportSession.document.sourceFilePath ?? '')}
          onClose={() => setSpriteSheetExportSourceId(null)}
          onClosePreview={workspace.closeSpriteSheetPreview}
          onExport={(options) => workspace.exportSpriteSheet(options, spriteSheetExportSession.document.id)}
          onPreview={workspace.previewSpriteSheet}
        />
      )}
      <ExportDialogHost ref={exportDialogRef} defaultFileDirectories={defaultFileDirectories} exportScalePresets={exportScalePresets} />
      {adjustmentOpen && <AdjustmentDialog kind={adjustmentKind} onClose={() => setAdjustmentOpen(false)} />}
      {lcdScreenOpen && session && (
        <LcdScreenDialog
          onClose={() => setLcdScreenOpen(false)}
          onApply={(options) => {
            void workspace.applyLcdScreenFilter(options)
          }}
        />
      )}
      {colorReplacementOpen && session && <ColorReplacementDialog key={session.document.id} onClose={() => setColorReplacementOpen(false)} />}
      {session && gridSettingsOpen && (
        <GridSettingsDialog value={session.view.grid} onApply={(grid) => workspace.setView({ grid })} onClose={() => setGridSettingsOpen(false)} />
      )}
      {session && isoViewSettingsOpen && (
        <IsoViewSettingsDialog
          value={runtimePreferences.isoView}
          onApply={applyIsoViewPreferences}
          onPreview={previewIsoViewPreferences}
          onClose={() => setIsoViewSettingsOpen(false)}
        />
      )}
      {session && projectInfoOpen && <ProjectInfoDialog document={session.document} onClose={() => setProjectInfoOpen(false)} />}
      {session && projectRollbackOpen && runtimePreferences.projectBackupEnabled && session.document.filePath && (
        <ProjectRollbackDialog projectPath={session.document.filePath} onClose={() => setProjectRollbackOpen(false)} onRestore={restoreProjectBackup} />
      )}
      {session && timelapseOpen && (
        <ProjectTimelapseDialog
          key={session.document.id}
          documentName={session.document.name}
          defaultDirectory={outputDirectoryForOperation(runtimePreferences) || defaultFileDirectories.exportDirectory}
          documentId={session.document.id}
          onChange={(settings) => workspace.setTimelapseSettings(settings)}
          onClear={() => {
            void workspace
              .requestDialog({
                title: t('timelapse.clear'),
                message: t('timelapse.clearConfirm'),
                choices: [
                  { id: 'cancel', label: t('common.cancel'), tone: 'quiet' },
                  { id: 'clear', label: t('timelapse.confirmClear'), tone: 'danger' }
                ]
              })
              .then((choice) => {
                if (choice === 'clear') workspace.clearTimelapse()
              })
          }}
          onExport={(format, options) => workspace.exportTimelapse(format, options)}
          onClose={() => setTimelapseOpen(false)}
        />
      )}
      <NewDocumentDialog
        open={newOpen}
        presets={documentSizePresets}
        onClose={() => setNewOpen(false)}
        onCreate={(name, width, height, mode, recordDrawing) => void createDocumentAndShow(name, width, height, mode, recordDrawing)}
      />
      {session && (
        <CanvasResizeDialog
          open={canvasResizeOpen}
          documentId={session.document.id}
          currentWidth={session.document.width}
          currentHeight={session.document.height}
          onClose={() => {
            workspace.setCanvasResizePreview(null)
            setCanvasResizeOpen(false)
          }}
          onResize={async (width, height, anchor, offsetX, offsetY, trimOutside) => {
            await workspace.resizeActiveCanvas(width, height, anchor, offsetX, offsetY, trimOutside)
            workspace.setCanvasResizePreview(null)
          }}
          onPreview={(preview) => {
            workspace.setCanvasResizePreview(preview)
            publishCanvasResizePreview(session.document.id, preview)
          }}
          preview={session.canvasResizePreview}
        />
      )}
      {session && (
        <ImageResizeDialog
          open={imageResizeOpen}
          currentWidth={session.document.width}
          currentHeight={session.document.height}
          onClose={() => setImageResizeOpen(false)}
          onResize={(width, height, interpolation: ImageResizeInterpolation) => workspace.resizeActiveImage(width, height, interpolation)}
          onDetectScale={() => detectDocumentPixelScale(session.document)}
        />
      )}
      {session && <OutlineDialog open={outlineOpen} session={session} onClose={() => setOutlineOpen(false)} />}
      {session && antiAliasOpen && <AntiAliasDialog session={session} onClose={() => setAntiAliasOpen(false)} />}
    </>
  )
  return {
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
    openSpriteSheetImport,
    spriteSheetImportOpen,
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
  }
}
