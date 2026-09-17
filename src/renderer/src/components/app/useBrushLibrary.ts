import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ImageBrush, ProjectBrush } from '@shared/types-brush'
import type { StoredBrush, StoredBrushFolder } from '@shared/types-library'
import { decodeImageBrush } from '@/core/brushes'
import { BRUSH_LIBRARY_CHANGED_EVENT, BRUSH_LIBRARY_IMPORT_PATHS_EVENT, type BrushLibraryImportPathsDetail } from '@/core/brush-library-events'
import { brushFolderContains } from '@/core/brush-folder-tree'
import { importBrushPaths as importBrushImagePaths } from '@/platform/brush-library-service'
import { useWorkspace, type DocumentSession } from '@/store/workspace'
import { useI18n } from '@/components/I18nProvider'

export interface LoadedBrush {
  stored: StoredBrush | null
  brush: ImageBrush
  project?: boolean
}

export interface BrushLibraryController {
  brushes: LoadedBrush[]
  localBrushes: LoadedBrush[]
  projectBrushes: LoadedBrush[]
  folders: StoredBrushFolder[]
  directoryPath: string
  loaded: boolean
  refresh(): Promise<LoadedBrush[]>
  importFromPicker(): Promise<void>
  importPaths(paths: readonly string[]): Promise<void>
  createFolder(name: string, parentFolderId?: string | null): Promise<StoredBrushFolder>
  renameFolder(id: string, name: string): Promise<StoredBrushFolder>
  deleteFolder(folder: StoredBrushFolder): Promise<void>
  moveBrushesToFolder(items: readonly LoadedBrush[], folderId: string | null): Promise<void>
  deleteBrushes(items: readonly LoadedBrush[]): Promise<void>
  reorderLocalBrushes(ids: readonly string[]): Promise<void>
}

export function useBrushLibrary(session: DocumentSession | null): BrushLibraryController {
  const { t } = useI18n()
  const [localBrushes, setLocalBrushes] = useState<LoadedBrush[]>([])
  const [folders, setFolders] = useState<StoredBrushFolder[]>([])
  const [directoryPath, setDirectoryPath] = useState('brushes')
  const [loaded, setLoaded] = useState(false)

  const projectBrushes = useMemo<LoadedBrush[]>(() => (session?.document.customBrushes ?? []).map((brush: ProjectBrush) => ({
    project: true,
    stored: null,
    brush: { ...brush, coverage: brush.coverage.slice(), colors: brush.colors?.slice(), intrinsicSize: true }
  })), [session?.document.customBrushes])
  const brushes = useMemo(() => [...localBrushes, ...projectBrushes], [localBrushes, projectBrushes])

  const refresh = useCallback(async (): Promise<LoadedBrush[]> => {
    try {
      const listing = await window.moonSprite.listBrushes()
      setDirectoryPath(listing.directoryPath)
      setFolders(listing.folders ?? [])
      const loadedBrushes = await Promise.all(listing.brushes.map(async (stored): Promise<LoadedBrush | null> => {
        try {
          const bytes = await window.moonSprite.readBinary(stored.filePath)
          return { stored, brush: await decodeImageBrush(stored, bytes) }
        } catch (error) {
          useWorkspace.getState().setMessage(error instanceof Error
            ? t('brush.loadError', { name: stored.name, error: error.message })
            : t('brush.loadErrorSimple', { name: stored.name }))
          return null
        }
      }))
      const next = loadedBrushes.filter((item): item is LoadedBrush => item !== null)
      setLocalBrushes(next)
      setLoaded(true)
      return next
    } catch (error) {
      useWorkspace.getState().setMessage(error instanceof Error ? error.message : t('brush.folderReadError'))
      setLoaded(true)
      return []
    }
  }, [t])

  useEffect(() => { void refresh() }, [refresh])

  useEffect(() => {
    const handleChanged = (): void => { void refresh() }
    window.addEventListener(BRUSH_LIBRARY_CHANGED_EVENT, handleChanged)
    return () => window.removeEventListener(BRUSH_LIBRARY_CHANGED_EVENT, handleChanged)
  }, [refresh])

  useEffect(() => {
    if (!session?.brushImageId || session.brushImageTemporary) return
    const brush = brushes.find((item) => item.brush.id === session.brushImageId)?.brush
    if (brush && session.brushImage?.id !== brush.id) useWorkspace.getState().setBrushImage(brush)
  }, [brushes, session?.brushImage?.id, session?.brushImageId, session?.brushImageTemporary])

  const importPaths = useCallback(async (paths: readonly string[]): Promise<void> => {
    if (paths.length === 0) return
    const workspace = useWorkspace.getState()
    const result = await importBrushImagePaths(window.moonSprite, paths)
    const next = await refresh()
    const lastStored = result.imported.at(-1)
    const selected = lastStored ? next.find((item) => item.stored?.id === lastStored.id) : null
    if (selected) workspace.setBrushImage(selected.brush)
    if (result.failures.length > 0) {
      const first = result.failures[0].error.message
      workspace.setMessage(result.imported.length > 0
        ? t('brush.importPartial', { imported: result.imported.length, failed: result.failures.length, error: first })
        : first)
    } else if (result.imported.length > 0) {
      workspace.setMessage(t('brush.imported', { count: result.imported.length }))
    }
  }, [refresh, t])

  useEffect(() => {
    const handleImport = (event: Event): void => {
      const paths = (event as CustomEvent<BrushLibraryImportPathsDetail>).detail?.paths ?? []
      void importPaths(paths)
    }
    window.addEventListener(BRUSH_LIBRARY_IMPORT_PATHS_EVENT, handleImport)
    return () => window.removeEventListener(BRUSH_LIBRARY_IMPORT_PATHS_EVENT, handleImport)
  }, [importPaths])

  const importFromPicker = useCallback(async (): Promise<void> => {
    const result = await window.moonSprite.openBrushImages()
    if (!result.canceled) await importPaths(result.filePaths)
  }, [importPaths])

  const createFolder = useCallback(async (name: string, parentFolderId: string | null = null): Promise<StoredBrushFolder> => {
    try {
      const folder = await window.moonSprite.createBrushFolder(name, parentFolderId)
      await refresh()
      useWorkspace.getState().setMessage(t('brush.folderCreated', { name: name.trim() }))
      return folder
    } catch (error) {
      useWorkspace.getState().setMessage(error instanceof Error ? error.message : t('brush.folderCreateError'))
      throw error
    }
  }, [refresh, t])

  const renameFolder = useCallback(async (id: string, name: string): Promise<StoredBrushFolder> => {
    try {
      const folder = await window.moonSprite.renameBrushFolder(id, name)
      await refresh()
      useWorkspace.getState().setMessage(t('brush.folderRenamed', { name: folder.name }))
      return folder
    } catch (error) {
      useWorkspace.getState().setMessage(error instanceof Error ? error.message : t('brush.folderRenameError'))
      throw error
    }
  }, [refresh, t])

  const deleteFolder = useCallback(async (folder: StoredBrushFolder): Promise<void> => {
    const workspace = useWorkspace.getState()
    const choice = await workspace.requestDialog({
      title: t('brush.deleteFolderTitle'),
      message: t('brush.deleteFolderMessage', { name: folder.name }),
      detail: t('brush.deleteFolderDetail'),
      choices: [{ id: 'cancel', label: t('common.cancel'), tone: 'quiet' }, { id: 'delete', label: t('common.delete'), tone: 'danger' }]
    })
    if (choice !== 'delete') return
    const deletedBrushIds = new Set(localBrushes.filter((item) => {
      return brushFolderContains(folder.id, item.stored?.folderId)
    }).map((item) => item.brush.id))
    try {
      await window.moonSprite.deleteBrushFolder(folder.id)
      await refresh()
      const active = useWorkspace.getState().sessions.find((candidate) => candidate.document.id === session?.document.id)
      if (active?.brushImageId && deletedBrushIds.has(active.brushImageId)) workspace.setBrushImage(null)
      workspace.setMessage(t('brush.folderDeleted', { name: folder.name }))
    } catch (error) {
      workspace.setMessage(error instanceof Error ? error.message : t('brush.folderDeleteError'))
    }
  }, [localBrushes, refresh, session?.document.id, t])

  const moveBrushesToFolder = useCallback(async (items: readonly LoadedBrush[], folderId: string | null): Promise<void> => {
    const localItems = items.filter((item): item is LoadedBrush & { stored: StoredBrush } => Boolean(item.stored))
    if (localItems.length === 0) return
    try {
      for (const item of localItems) await window.moonSprite.moveBrush(item.stored.id, folderId)
      await refresh()
      useWorkspace.getState().setMessage(t('brush.movedToFolder'))
    } catch (error) {
      useWorkspace.getState().setMessage(error instanceof Error ? error.message : t('brush.moveError'))
      await refresh()
    }
  }, [refresh, t])

  const deleteBrushes = useCallback(async (items: readonly LoadedBrush[]): Promise<void> => {
    if (items.length === 0) return
    const workspace = useWorkspace.getState()
    const label = items.length === 1 ? items[0].brush.name : t('brush.multipleName', { count: items.length })
    const choice = await workspace.requestDialog({
      title: t('brush.deleteTitle'),
      message: t('brush.deleteMessage', { name: label }),
      detail: t('brush.deleteDetail'),
      choices: [{ id: 'cancel', label: t('common.cancel'), tone: 'quiet' }, { id: 'delete', label: t('common.delete'), tone: 'danger' }]
    })
    if (choice !== 'delete') return
    try {
      for (const item of items) {
        if (item.project) workspace.deleteProjectBrush(item.brush.id)
        else if (item.stored) await window.moonSprite.deleteBrush(item.stored.id)
        if (useWorkspace.getState().sessions.find((candidate) => candidate.document.id === session?.document.id)?.brushImageId === item.brush.id) workspace.setBrushImage(null)
      }
      await refresh()
      workspace.setMessage(items.length === 1 ? t('brush.deleted', { name: label }) : t('brush.deletedMultiple', { count: items.length }))
    } catch (error) {
      workspace.setMessage(error instanceof Error ? error.message : t('brush.deleteError'))
    }
  }, [refresh, session?.document.id, t])

  const reorderLocalBrushes = useCallback(async (ids: readonly string[]): Promise<void> => {
    const byId = new Map(localBrushes.flatMap((item) => item.stored ? [[item.stored.id, item] as const] : []))
    const next = ids.flatMap((id) => {
      const item = byId.get(id)
      return item ? [item] : []
    })
    if (next.length !== localBrushes.length) return
    setLocalBrushes(next)
    try {
      await window.moonSprite.setBrushOrder([...ids])
    } catch (error) {
      useWorkspace.getState().setMessage(error instanceof Error ? error.message : t('brush.orderError'))
      await refresh()
    }
  }, [localBrushes, refresh, t])

  return { brushes, localBrushes, projectBrushes, folders, directoryPath, loaded, refresh, importFromPicker, importPaths, createFolder, renameFolder, deleteFolder, moveBrushesToFolder, deleteBrushes, reorderLocalBrushes }
}
