import { useCallback, useEffect, useRef, useState } from 'react'
import type { ColorMode } from '@shared/types-raster'
import type { ProjectBackupRecord } from '@shared/types-files'
import { decodeBrowserRasterImage } from '@/core/raster-image'
import { decodeDocumentFileAsync } from '@/core/document-files'
import { publishBrushLibraryImportPaths } from '@/core/brush-library-events'
import { isExtensionPackagePath } from '@/core/extension-packages'
import { acceptsExtensionFileDrop, routeExtensionFileDrops } from '@/core/extension-file-drop'
import { startDocumentDropService } from '@/platform/document-drop-service'
import { getRecentProjects, type RecentProject } from '@/core/home-history'
import { loadEditorPreferences } from '@/core/file-preferences'
import { type SaveAsOptions, useWorkspace } from '@/store/workspace'
import { useI18n } from '@/components/I18nProvider'

export function useAppDocumentIO({
  setHomeOpen,
  setWorkspaceDocumentId,
  runtimePreferences,
  installExtensionPackage
}: {
  setHomeOpen: (open: boolean) => void
  setWorkspaceDocumentId: (id: string) => void
  runtimePreferences: ReturnType<typeof loadEditorPreferences>
  installExtensionPackage: (filePath: string) => Promise<boolean>
}) {
  const { t } = useI18n()
  const workspace = useWorkspace.getState()
  const [recentFiles, setRecentFiles] = useState<RecentProject[]>(getRecentProjects)

  const saveActiveOperationRef = useRef<Promise<boolean> | null>(null)

  const runSaveActive = useCallback(
    (saveAs = false, options?: SaveAsOptions): Promise<boolean> => {
      if (saveActiveOperationRef.current) return saveActiveOperationRef.current
      const operation = workspace.saveActive(saveAs, options)
      saveActiveOperationRef.current = operation
      void operation.then(
        () => {
          if (saveActiveOperationRef.current === operation) saveActiveOperationRef.current = null
        },
        () => {
          if (saveActiveOperationRef.current === operation) saveActiveOperationRef.current = null
        }
      )
      return operation
    },
    [workspace]
  )

  useEffect(() => {
    const syncRecentFiles = (): void => setRecentFiles(getRecentProjects())
    window.addEventListener('moonsprite:recent-files-changed', syncRecentFiles)
    return () => window.removeEventListener('moonsprite:recent-files-changed', syncRecentFiles)
  }, [])

  const openFilesAndShowDocument = async (): Promise<void> => {
    const beforeIds = new Set(useWorkspace.getState().sessions.map((item) => item.document.id))
    await useWorkspace.getState().openFiles()
    const current = useWorkspace.getState()
    if (current.sessions.some((item) => !beforeIds.has(item.document.id))) setHomeOpen(false)
  }

  const openGalleryProject = async (filePath: string, keepHomeOpen = false): Promise<boolean> => {
    const beforeIds = new Set(useWorkspace.getState().sessions.map((item) => item.document.id))
    const opened = await useWorkspace.getState().openPath(filePath, keepHomeOpen ? undefined : { onBeforeSession: () => setHomeOpen(false) })
    const current = useWorkspace.getState()
    if (!keepHomeOpen && current.sessions.some((item) => !beforeIds.has(item.document.id))) setHomeOpen(false)
    return opened
  }

  const openHomeImage = async (imageUrl: string, name: string): Promise<boolean> => {
    try {
      const response = await fetch(imageUrl)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const bytes = new Uint8Array(await response.arrayBuffer())
      const document = await decodeBrowserRasterImage(bytes, name, response.headers.get('content-type') ?? 'image/png')
      useWorkspace.getState().addSession(document)
      setHomeOpen(false)
      return true
    } catch (error) {
      workspace.setMessage(error instanceof Error ? error.message : t('home.openFailed'))
      return false
    }
  }

  const restoreRecoveryAndShowDocument = async (id: string): Promise<boolean> => {
    const restored = await useWorkspace.getState().restoreRecovery(id)
    if (restored) setHomeOpen(false)
    return restored
  }

  const openProjectFolder = (documentId: string): void => {
    const target = useWorkspace.getState().sessions.find((item) => item.document.id === documentId)
    const sourcePath = target?.document.filePath ?? target?.document.sourceFilePath
    if (!sourcePath) {
      workspace.setMessage(t('app.project.notSaved'))
      return
    }
    void window.moonSprite
      .openProjectInFolder(sourcePath)
      .then(() => {
        workspace.setMessage(t('app.project.folderOpened'))
      })
      .catch((error) => {
        workspace.setMessage(error instanceof Error ? error.message : t('app.project.folderError'))
      })
  }

  const restoreProjectBackup = async (record: ProjectBackupRecord): Promise<boolean> => {
    const current = useWorkspace.getState().sessions.find((item) => item.document.id === useWorkspace.getState().activeId)
    if (!current?.document.filePath || !runtimePreferences.projectBackupEnabled) return false
    try {
      const bytes = await window.moonSprite.readBinary(record.filePath)
      const backupPath = /\.moonsprite\.bak$/i.test(record.filePath) ? record.filePath : `${record.filePath}.bak`
      const backup = await decodeDocumentFileAsync(bytes, backupPath)
      const restored = useWorkspace.getState().restoreProjectBackup(current.document.id, backup)
      if (restored) workspace.setMessage('已回档工程备份，可通过编辑 - 撤销返回当前版本。')
      return restored
    } catch (error) {
      workspace.setMessage(error instanceof Error ? error.message : '无法回档工程备份。')
      return false
    }
  }

  const createDocumentAndShow = async (name: string, width: number, height: number, mode: ColorMode, recordDrawing: boolean): Promise<void> => {
    const beforeIds = new Set(useWorkspace.getState().sessions.map((item) => item.document.id))
    await useWorkspace.getState().newDocument(name, width, height, mode, recordDrawing)
    const created = useWorkspace.getState().sessions.find((item) => !beforeIds.has(item.document.id))
    if (!created) return
    setHomeOpen(false)
    setWorkspaceDocumentId(created.document.id)
    const focusCanvas = (attempt = 0): void => {
      window.requestAnimationFrame(() => {
        if (useWorkspace.getState().activeId !== created.document.id) return
        const canvas = [...document.querySelectorAll<HTMLCanvasElement>('.stage-canvas')].find(
          (candidate) => candidate.dataset.documentId === created.document.id
        )
        if (canvas && !document.querySelector('.modal-backdrop')) {
          canvas.tabIndex = -1
          canvas.focus({ preventScroll: true })
          return
        }
        if (attempt < 12) focusCanvas(attempt + 1)
      })
    }
    focusCanvas()
  }

  useEffect(() => {
    let active = true
    void window.moonSprite
      .takeStartupFiles()
      .then(async (paths) => {
        for (const path of paths) {
          if (isExtensionPackagePath(path)) {
            await installExtensionPackage(path)
            continue
          }
        }
        const opened = await useWorkspace.getState().openPaths(paths.filter((path) => !isExtensionPackagePath(path)))
        if (active && opened) setHomeOpen(false)
      })
      .catch(() => {
        /* Keep the home screen available when startup arguments are invalid. */
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    void useWorkspace.getState().restoreRecoveries()
  }, [])

  useEffect(() => {
    if (!runtimePreferences.recovery) return
    // Recovery encoding walks and compresses the full dirty document on the
    // renderer thread. Keep it interval-driven so switching windows never
    // queues that work for the first frame after focus returns.
    const interval = window.setInterval(() => {
      void useWorkspace.getState().autosaveDirty()
    }, runtimePreferences.recoveryMinutes * 60_000)
    return () => window.clearInterval(interval)
  }, [runtimePreferences.recovery, runtimePreferences.recoveryMinutes])

  useEffect(() => {
    return startDocumentDropService({
      acceptsAdditionalPath: acceptsExtensionFileDrop,
      openPath: (path) => useWorkspace.getState().openPath(path),
      pathForFile: (file) => window.moonSprite.pathForFile(file),
      claimPaths: async (paths, position) => {
        paths = await routeExtensionFileDrops(paths, path => window.moonSprite.readBinary(path), message => useWorkspace.getState().setMessage(message))
        if (!paths.length) return true
        const extensionPaths = paths.filter(isExtensionPackagePath)
        const otherPaths = paths.filter((path) => !isExtensionPackagePath(path))
        if (extensionPaths.length > 0) {
          for (const path of extensionPaths) await installExtensionPackage(path)
          if (otherPaths.length === 0) return true
          const target = position ? document.elementFromPoint(position.x, position.y) : null
          if (target?.closest('[data-brush-library-dropzone]')) {
            publishBrushLibraryImportPaths(otherPaths)
            return true
          }
          if (await useWorkspace.getState().openPaths(otherPaths)) setHomeOpen(false)
          return true
        }
        const target = position ? document.elementFromPoint(position.x, position.y) : null
        if (position && paths.length === 1 && /\.gif$/i.test(paths[0])) {
          const timelineDropzone = target?.closest<HTMLElement>('.layer-animation-grid')
          if (timelineDropzone) {
            window.dispatchEvent(
              new CustomEvent('moonsprite:animation-gif-drop', {
                detail: {
                  documentId: useWorkspace.getState().activeId ?? '',
                  path: paths[0],
                  x: position.x,
                  y: position.y
                }
              })
            )
            return true
          }
        }
        if (target?.closest('[data-brush-library-dropzone]')) publishBrushLibraryImportPaths(paths)
        else if (await useWorkspace.getState().openPaths(paths)) setHomeOpen(false)
        return true
      },
      onDragOver: (paths, position) => {
        if (!position) return
        window.dispatchEvent(
          new CustomEvent('moonsprite:document-drag-over', {
            detail: { paths, x: position.x, y: position.y, documentId: useWorkspace.getState().activeId ?? '' }
          })
        )
      },
      onDragLeave: () => window.dispatchEvent(new Event('moonsprite:document-drag-leave')),
      onOpened: () => setHomeOpen(false)
    })
  }, [])
  return {
    recentFiles,
    runSaveActive,
    openFilesAndShowDocument,
    openGalleryProject,
    openHomeImage,
    restoreRecoveryAndShowDocument,
    openProjectFolder,
    restoreProjectBackup,
    createDocumentAndShow
  }
}
