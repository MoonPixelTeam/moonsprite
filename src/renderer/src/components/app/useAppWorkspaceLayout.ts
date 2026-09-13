import { persistMainWindowState } from './app-window-state'
import { beginDocumentPaneDockResize } from './document-pane-dock-resize'
import type { DocumentPaneNode } from '@/core/document-pane-layout'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { StoredWorkspace, ToolRailSide, WorkspaceLayout } from '@shared/types-workspace'
import type { PanelDock, WorkspacePanelId } from '@/components/WorkspacePanels'
import { beginWorkspaceResize, endWorkspaceResize, createResizeFrame } from '@/components/workspace-resize'
import { EDITOR_SHORTCUT_COMMAND_EVENT, type EditorShortcutCommandDetail } from '@/core/command-context'
import { type ShortcutId } from '@/core/shortcuts'
import { readStoredString, writeStoredString } from '@/core/storage'
import { applyAppWindowLayout } from '@/platform/app-window'
import {
  ACTIVE_WORKSPACE_STORAGE_KEY,
  BOTTOM_DOCK_HEIGHT_RATIO_STORAGE_KEY,
  BOTTOM_DOCK_HEIGHT_STORAGE_KEY,
  COLOR_SQUARE_ANCHOR_STORAGE_KEY,
  COLOR_SQUARE_DOCK_STORAGE_KEY,
  constrainBottomDockHeight,
  constrainInspectorWidth,
  constrainLeftDockWidth,
  DEFAULT_BOTTOM_DOCK_HEIGHT_RATIO,
  DEFAULT_INSPECTOR_WIDTH_RATIO,
  DEFAULT_LEFT_DOCK_WIDTH_RATIO,
  DEFAULT_PANEL_DOCKS,
  dockSizeRatio,
  FLOATING_PANEL_STORAGE_KEYS,
  INSPECTOR_LAYOUT_STORAGE_KEY,
  INSPECTOR_WIDTH_RATIO_STORAGE_KEY,
  INSPECTOR_WIDTH_STORAGE_KEY,
  LEFT_DOCK_WIDTH_RATIO_STORAGE_KEY,
  LEFT_DOCK_WIDTH_STORAGE_KEY,
  resolveDockSizeRatio,
  TOOL_RAIL_SIDE_STORAGE_KEY,
  loadBottomDockHeight,
  loadInspectorWidth,
  loadLeftDockWidth,
  loadMainWindowState,
  loadPanelDocks,
  loadPanelVisibility,
  loadToolRailSide,
  normalizeWorkspaceLayout,
  readLayoutStorage,
  saveMainWindowState,
  savePanelDocks,
  savePanelVisibility,
  toolRailDockTargetAtPointer,
  workspaceDockSizesForParent,
  workspacePanelDockPresence,
  writeLayoutStorage
} from '@/core/workspace-layout-preferences'
import { useWorkspace } from '@/store/workspace'
import { useI18n } from '@/components/I18nProvider'
import type { DocumentSession } from '@/store/workspace'
const workspaceDockParentSize = (workArea: HTMLElement | null): { width: number; height: number } => {
  const editorBounds = workArea?.parentElement?.getBoundingClientRect()
  const workBounds = workArea?.getBoundingClientRect()
  return {
    width: Math.max(1, editorBounds?.width ?? window.innerWidth),
    height: Math.max(1, workBounds?.height ?? window.innerHeight - 99)
  }
}

const defaultPanelDocks: Record<WorkspacePanelId, PanelDock> = { ...DEFAULT_PANEL_DOCKS }

const defaultInspectorLayout = JSON.stringify({
  order: ['palette', 'color', 'layers', 'freeTileInstances', 'history', 'preview', 'tileset', 'brushes'],
  verticalWeights: { color: 330, palette: 620, layers: 560, freeTileInstances: 180, history: 220, preview: 220, tileset: 280, brushes: 240 },
  bottomWeights: { color: 280, palette: 280, layers: 720, freeTileInstances: 300, history: 320, preview: 280, tileset: 360, brushes: 320 }
})

const createBuiltInDefaultWorkspace = (name: string): StoredWorkspace => ({
  id: 'builtin-default',
  name,
  filePath: '',
  updatedAt: '',
  builtIn: true,
  layout: {
    panelDocks: { ...defaultPanelDocks },
    panelVisibility: { color: true, palette: true, layers: true, freeTileInstances: false, history: true, preview: true, tileset: false, brushes: false },
    inspectorWidth: 300,
    leftDockWidth: 280,
    bottomDockHeight: 220,
    inspectorWidthRatio: DEFAULT_INSPECTOR_WIDTH_RATIO,
    leftDockWidthRatio: DEFAULT_LEFT_DOCK_WIDTH_RATIO,
    bottomDockHeightRatio: DEFAULT_BOTTOM_DOCK_HEIGHT_RATIO,
    toolRailSide: 'right',
    previewOpen: true,
    inspectorLayout: defaultInspectorLayout,
    colorSquareDock: 'left',
    colorSquareAnchor: 'end',
    floatingPanels: { color: null, palette: null, layers: null, freeTileInstances: null, history: null, preview: null, tileset: null, brushes: null },
    mainWindow: null
  },
  initialLayout: {
    panelDocks: { ...defaultPanelDocks },
    panelVisibility: { color: true, palette: true, layers: true, freeTileInstances: false, history: true, preview: true, tileset: false, brushes: false },
    inspectorWidth: 300,
    leftDockWidth: 280,
    bottomDockHeight: 220,
    inspectorWidthRatio: DEFAULT_INSPECTOR_WIDTH_RATIO,
    leftDockWidthRatio: DEFAULT_LEFT_DOCK_WIDTH_RATIO,
    bottomDockHeightRatio: DEFAULT_BOTTOM_DOCK_HEIGHT_RATIO,
    toolRailSide: 'right',
    previewOpen: true,
    inspectorLayout: defaultInspectorLayout,
    colorSquareDock: 'left',
    colorSquareAnchor: 'end',
    floatingPanels: { color: null, palette: null, layers: null, freeTileInstances: null, history: null, preview: null, tileset: null, brushes: null },
    mainWindow: null
  }
})

export function useAppWorkspaceLayout({ homeOpen, session, documentPaneLayout, onDocumentPaneLayoutChange }: {
  homeOpen: boolean
  session: DocumentSession | null
  documentPaneLayout: DocumentPaneNode | null
  onDocumentPaneLayoutChange: (layout: DocumentPaneNode | null) => void
}) {
  const { t } = useI18n()
  const workspace = useWorkspace.getState()
  const builtInDefaultWorkspace = useMemo(() => createBuiltInDefaultWorkspace(t('app.workspace.default')), [t])

  const [workspaceSaveOpen, setWorkspaceSaveOpen] = useState(false)

  const [workspaceManagerOpen, setWorkspaceManagerOpen] = useState(false)

  const [workspaceSaveName, setWorkspaceSaveName] = useState('')

  const [savedWorkspaces, setSavedWorkspaces] = useState<StoredWorkspace[]>([])

  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null)

  const [workspaceDirectory, setWorkspaceDirectory] = useState('')

  const [workspaceBusy, setWorkspaceBusy] = useState(false)

  const [panelVisibility, setPanelVisibility] = useState<Record<WorkspacePanelId, boolean>>(loadPanelVisibility)

  const [popupPanelId, setPopupPanelId] = useState<WorkspacePanelId | null>(null)

  const initialDockParentSize = workspaceDockParentSize(null)

  const [inspectorWidth, setInspectorWidth] = useState(() => loadInspectorWidth(window.innerWidth))

  const [panelDocks, setPanelDocks] = useState<Record<WorkspacePanelId, PanelDock>>(loadPanelDocks)

  const [bottomLayersHeight, setBottomLayersHeight] = useState(loadBottomDockHeight)

  const [bottomDockHost, setBottomDockHost] = useState<HTMLElement | null>(null)

  const [leftDockWidth, setLeftDockWidth] = useState(loadLeftDockWidth)

  const [leftDockHost, setLeftDockHost] = useState<HTMLElement | null>(null)

  const [toolRailSide, setToolRailSide] = useState<ToolRailSide>(loadToolRailSide)

  const [toolRailDockPreview, setToolRailDockPreview] = useState<ToolRailSide | null>(null)

  const [workspaceLayoutRevision, setWorkspaceLayoutRevision] = useState(0)

  const resizeStart = useRef<{ x: number; width: number; parentWidth: number } | null>(null)
  const paneDockResizeRef = useRef<ReturnType<typeof beginDocumentPaneDockResize>>(null)
  const paneLayoutRef = useRef({ layout: documentPaneLayout, change: onDocumentPaneLayoutChange })
  paneLayoutRef.current = { layout: documentPaneLayout, change: onDocumentPaneLayoutChange }

  const bottomLayersResizeStart = useRef<{ y: number; height: number; parentHeight: number } | null>(null)

  const bottomLayersHeightRef = useRef(bottomLayersHeight)

  const preferredBottomLayersHeightRef = useRef(bottomLayersHeight)

  const bottomLayersHeightRatioRef = useRef(
    resolveDockSizeRatio(
      readStoredString(BOTTOM_DOCK_HEIGHT_RATIO_STORAGE_KEY),
      bottomLayersHeight,
      initialDockParentSize.height,
      DEFAULT_BOTTOM_DOCK_HEIGHT_RATIO
    )
  )

  const leftDockResizeStart = useRef<{ x: number; width: number; parentWidth: number } | null>(null)

  const leftDockWidthRef = useRef(leftDockWidth)

  const preferredLeftDockWidthRef = useRef(leftDockWidth)

  const leftDockWidthRatioRef = useRef(dockSizeRatio(leftDockWidth, initialDockParentSize.width, DEFAULT_LEFT_DOCK_WIDTH_RATIO))

  const toolRailDrag = useRef<{ startX: number; startY: number; moved: boolean; target: ToolRailSide } | null>(null)

  const activeWorkspaceRef = useRef<StoredWorkspace | null>(null)

  const workspaceApplyInProgress = useRef(false)

  const workspaceAutoSaveTimer = useRef<number | null>(null)

  const workspaceAutoSaveQueue = useRef<Promise<void>>(Promise.resolve())

  const [workspaceLayoutChange, setWorkspaceLayoutChange] = useState(0)

  const workAreaRef = useRef<HTMLElement>(null)

  const inspectorWidthRef = useRef(inspectorWidth)

  const preferredInspectorWidthRef = useRef(inspectorWidth)

  const inspectorWidthRatioRef = useRef(dockSizeRatio(inspectorWidth, initialDockParentSize.width, DEFAULT_INSPECTOR_WIDTH_RATIO))

  useEffect(() => setPopupPanelId(null), [homeOpen, session?.document.id])

  const updatePanelDock = useCallback((id: WorkspacePanelId, dock: PanelDock): void => {
    setPanelDocks((current) => {
      const next = { ...current, [id]: dock }
      savePanelDocks(next)
      return next
    })
  }, [])

  const updatePanelVisibility = useCallback((id: WorkspacePanelId, visible: boolean): void => {
    setPanelVisibility((current) => {
      if (current[id] === visible) return current
      const next = { ...current, [id]: visible }
      savePanelVisibility(next)
      return next
    })
  }, [])

  const publishShortcutCommand = useCallback(
    (id: ShortcutId, panelId?: WorkspacePanelId): void => {
      const documentId = useWorkspace.getState().activeId
      if (!documentId) return
      const publish = (): void => {
        window.dispatchEvent(new CustomEvent<EditorShortcutCommandDetail>(EDITOR_SHORTCUT_COMMAND_EVENT, { detail: { documentId, id } }))
      }
      if (panelId && !panelVisibility[panelId]) {
        updatePanelVisibility(panelId, true)
        window.setTimeout(publish, 0)
        return
      }
      publish()
    },
    [panelVisibility, updatePanelVisibility]
  )

  useEffect(() => {
    const showPanel = (event: Event): void => {
      const id = (event as CustomEvent<{ id?: WorkspacePanelId }>).detail?.id
      if (id && id in DEFAULT_PANEL_DOCKS) updatePanelVisibility(id, true)
    }
    const hidePanel = (event: Event): void => {
      const id = (event as CustomEvent<{ id?: WorkspacePanelId }>).detail?.id
      if (!id || !(id in DEFAULT_PANEL_DOCKS)) return
      updatePanelVisibility(id, false)
      setPopupPanelId((current) => (current === id ? null : current))
    }
    const togglePanel = (event: Event): void => {
      const id = (event as CustomEvent<{ id?: WorkspacePanelId }>).detail?.id
      if (!id || !(id in DEFAULT_PANEL_DOCKS)) return
      const open = panelVisibility[id] || popupPanelId === id
      updatePanelVisibility(id, !open)
      if (open) setPopupPanelId((current) => (current === id ? null : current))
    }
    const setPanel = (event: Event): void => {
      const detail = (event as CustomEvent<{ id?: WorkspacePanelId; visible?: boolean; dock?: PanelDock }>).detail
      const id = detail?.id
      if (!id || !(id in DEFAULT_PANEL_DOCKS)) return
      if (typeof detail.visible === 'boolean') updatePanelVisibility(id, detail.visible)
      if (detail.dock && ['left', 'right', 'bottom', 'floating'].includes(detail.dock)) updatePanelDock(id, detail.dock)
      if (detail.visible === false) setPopupPanelId((current) => (current === id ? null : current))
    }
    window.addEventListener('moonsprite:show-workspace-panel', showPanel)
    window.addEventListener('moonsprite:hide-workspace-panel', hidePanel)
    window.addEventListener('moonsprite:toggle-workspace-panel', togglePanel)
    window.addEventListener('moonsprite:set-workspace-panel', setPanel)
    return () => {
      window.removeEventListener('moonsprite:show-workspace-panel', showPanel)
      window.removeEventListener('moonsprite:hide-workspace-panel', hidePanel)
      window.removeEventListener('moonsprite:toggle-workspace-panel', togglePanel)
      window.removeEventListener('moonsprite:set-workspace-panel', setPanel)
    }
  }, [panelVisibility, popupPanelId, updatePanelDock, updatePanelVisibility])

  const togglePopupPanel = useCallback(
    (id: WorkspacePanelId): void => {
      if (panelDocks[id] === 'floating') return
      setPopupPanelId((current) => (current === id ? null : id))
    },
    [panelDocks]
  )

  useEffect(() => {
    if (popupPanelId && panelDocks[popupPanelId] === 'floating') setPopupPanelId(null)
  }, [panelDocks, popupPanelId])

  const updateToolRailSide = useCallback((side: ToolRailSide): void => {
    setToolRailSide(side)
    writeStoredString(TOOL_RAIL_SIDE_STORAGE_KEY, side)
  }, [])

  const previewOpen = panelVisibility.preview

  const dockedPopupPanelId = popupPanelId && panelDocks[popupPanelId] !== 'floating' ? popupPanelId : null

  const dockPresenceVisibility: Record<WorkspacePanelId, boolean> =
    dockedPopupPanelId && panelVisibility[dockedPopupPanelId] ? { ...panelVisibility, [dockedPopupPanelId]: false } : panelVisibility

  const visibleDocks = workspacePanelDockPresence(panelDocks, dockPresenceVisibility)

  const hasLeftDock = visibleDocks.left

  const hasBottomDock = visibleDocks.bottom

  const hasRightDock = visibleDocks.right

  const captureWorkspaceLayout = useCallback(
    (): WorkspaceLayout => ({
      panelDocks: { ...panelDocks },
      panelVisibility: { ...panelVisibility },
      inspectorWidth: preferredInspectorWidthRef.current,
      leftDockWidth: preferredLeftDockWidthRef.current,
      bottomDockHeight: preferredBottomLayersHeightRef.current,
      inspectorWidthRatio: inspectorWidthRatioRef.current,
      leftDockWidthRatio: leftDockWidthRatioRef.current,
      bottomDockHeightRatio: bottomLayersHeightRatioRef.current,
      toolRailSide,
      previewOpen,
      inspectorLayout: readLayoutStorage(INSPECTOR_LAYOUT_STORAGE_KEY),
      colorSquareDock: readLayoutStorage(COLOR_SQUARE_DOCK_STORAGE_KEY),
      colorSquareAnchor: readLayoutStorage(COLOR_SQUARE_ANCHOR_STORAGE_KEY),
      floatingPanels: Object.fromEntries(
        (Object.keys(FLOATING_PANEL_STORAGE_KEYS) as WorkspacePanelId[]).map((id) => [id, readLayoutStorage(FLOATING_PANEL_STORAGE_KEYS[id])])
      ) as Record<WorkspacePanelId, string | null>,
      mainWindow: loadMainWindowState()
    }),
    [bottomLayersHeight, inspectorWidth, leftDockWidth, panelDocks, panelVisibility, previewOpen, toolRailSide]
  )

  const loadSavedWorkspaces = useCallback(async (): Promise<StoredWorkspace[]> => {
    try {
      const listing = await window.moonSprite.listWorkspaces()
      setWorkspaceDirectory(listing.directoryPath)
      const localized = listing.workspaces.map((workspace) => (workspace.builtIn ? { ...workspace, name: t('app.workspace.default') } : workspace))
      setSavedWorkspaces(localized)
      return localized
    } catch (error) {
      useWorkspace.getState().setMessage(error instanceof Error ? error.message : t('app.workspace.readError'))
      return []
    }
  }, [t])

  const applySavedMainWindow = async (state: WorkspaceLayout['mainWindow']): Promise<void> => {
    if (!state) return
    saveMainWindowState(state)
    try {
      // Repeating unmaximize -> resize -> maximize redraws the whole native window.
      // The platform adapter skips that work when the saved maximized state already matches.
      await applyAppWindowLayout(state)
    } catch {
      workspace.setMessage(t('app.workspace.windowRestoreError'))
    }
  }

  const applyWorkspaceLayout = async (saved: StoredWorkspace, announce = true): Promise<void> => {
    workspaceApplyInProgress.current = true
    const layout = saved.layout
    const dockParentSize = workspaceDockParentSize(workAreaRef.current)
    const normalized = normalizeWorkspaceLayout(layout, dockParentSize.width, dockParentSize.height)
    const nextPanelDocks: Record<WorkspacePanelId, PanelDock> = normalized.panelDocks
    const nextInspectorWidth = normalized.inspectorWidth
    const nextLeftDockWidth = normalized.leftDockWidth
    const nextBottomHeight = normalized.bottomDockHeight
    const nextToolRailSide: ToolRailSide = normalized.toolRailSide
    savePanelDocks(nextPanelDocks)
    savePanelVisibility(normalized.panelVisibility)
    writeStoredString(INSPECTOR_WIDTH_STORAGE_KEY, String(Math.round(nextInspectorWidth)))
    writeStoredString(LEFT_DOCK_WIDTH_STORAGE_KEY, String(Math.round(nextLeftDockWidth)))
    writeStoredString(BOTTOM_DOCK_HEIGHT_STORAGE_KEY, String(Math.round(nextBottomHeight)))
    writeStoredString(INSPECTOR_WIDTH_RATIO_STORAGE_KEY, String(normalized.inspectorWidthRatio))
    writeStoredString(LEFT_DOCK_WIDTH_RATIO_STORAGE_KEY, String(normalized.leftDockWidthRatio))
    writeStoredString(BOTTOM_DOCK_HEIGHT_RATIO_STORAGE_KEY, String(normalized.bottomDockHeightRatio))
    writeStoredString(TOOL_RAIL_SIDE_STORAGE_KEY, nextToolRailSide)
    writeLayoutStorage(INSPECTOR_LAYOUT_STORAGE_KEY, layout.inspectorLayout)
    writeLayoutStorage(COLOR_SQUARE_DOCK_STORAGE_KEY, layout.colorSquareDock)
    writeLayoutStorage(COLOR_SQUARE_ANCHOR_STORAGE_KEY, layout.colorSquareAnchor)
    for (const id of Object.keys(FLOATING_PANEL_STORAGE_KEYS) as WorkspacePanelId[])
      writeLayoutStorage(FLOATING_PANEL_STORAGE_KEYS[id], layout.floatingPanels?.[id] ?? null)
    inspectorWidthRef.current = nextInspectorWidth
    preferredInspectorWidthRef.current = nextInspectorWidth
    inspectorWidthRatioRef.current = normalized.inspectorWidthRatio
    leftDockWidthRef.current = nextLeftDockWidth
    preferredLeftDockWidthRef.current = nextLeftDockWidth
    leftDockWidthRatioRef.current = normalized.leftDockWidthRatio
    bottomLayersHeightRef.current = nextBottomHeight
    preferredBottomLayersHeightRef.current = nextBottomHeight
    bottomLayersHeightRatioRef.current = normalized.bottomDockHeightRatio
    setInspectorWidth(nextInspectorWidth)
    setLeftDockWidth(nextLeftDockWidth)
    setBottomLayersHeight(nextBottomHeight)
    setPanelDocks(nextPanelDocks)
    setPanelVisibility(normalized.panelVisibility)
    setToolRailSide(nextToolRailSide)
    setWorkspaceLayoutRevision((revision) => revision + 1)
    setActiveWorkspaceId(saved.id)
    activeWorkspaceRef.current = saved
    writeStoredString(ACTIVE_WORKSPACE_STORAGE_KEY, saved.id)
    try {
      await applySavedMainWindow(layout.mainWindow)
      if (announce) workspace.setMessage(t('app.workspace.loaded', { name: saved.name }))
    } finally {
      window.setTimeout(() => {
        workspaceApplyInProgress.current = false
      }, 0)
    }
  }

  const saveWorkspace = async (name: string, id: string | null = null): Promise<void> => {
    const trimmedName = name.trim()
    if (!trimmedName) return
    setWorkspaceBusy(true)
    try {
      await persistMainWindowState()
      const saved = await window.moonSprite.saveWorkspace(id, trimmedName, captureWorkspaceLayout())
      setActiveWorkspaceId(saved.id)
      activeWorkspaceRef.current = saved
      writeStoredString(ACTIVE_WORKSPACE_STORAGE_KEY, saved.id)
      setWorkspaceSaveName(saved.name)
      await loadSavedWorkspaces()
      workspace.setMessage(t('app.workspace.saved', { name: saved.name }))
      setWorkspaceSaveOpen(false)
    } catch (error) {
      workspace.setMessage(error instanceof Error ? error.message : t('app.workspace.saveError'))
    } finally {
      setWorkspaceBusy(false)
    }
  }

  const resetCurrentWorkspace = async (): Promise<void> => {
    const current = activeWorkspaceRef.current
    if (!current || current.id !== activeWorkspaceId) {
      workspace.setMessage(t('app.workspace.loadFirst'))
      return
    }
    if (workspaceAutoSaveTimer.current !== null) {
      window.clearTimeout(workspaceAutoSaveTimer.current)
      workspaceAutoSaveTimer.current = null
    }
    workspaceApplyInProgress.current = true
    try {
      const reset = await window.moonSprite.saveWorkspace(current.id, current.name, current.initialLayout)
      await applyWorkspaceLayout(reset, false)
      setSavedWorkspaces((items) => items.map((item) => (item.id === reset.id ? reset : item)))
      workspace.setMessage(t('app.workspace.reset', { name: current.name }))
    } catch (error) {
      workspaceApplyInProgress.current = false
      workspace.setMessage(error instanceof Error ? error.message : t('app.workspace.resetError'))
    }
  }

  const deleteSavedWorkspace = async (saved: StoredWorkspace): Promise<void> => {
    if (saved.builtIn) {
      workspace.setMessage(t('app.workspace.builtInDelete'))
      return
    }
    const choice = await workspace.requestDialog({
      title: t('app.workspace.deleteTitle'),
      message: t('app.workspace.deleteMessage', { name: saved.name }),
      detail: t('app.workspace.deleteDetail'),
      choices: [
        { id: 'cancel', label: t('common.cancel'), tone: 'quiet' },
        { id: 'delete', label: t('common.delete'), tone: 'danger' }
      ]
    })
    if (choice !== 'delete') return
    try {
      await window.moonSprite.deleteWorkspace(saved.id)
      if (activeWorkspaceId === saved.id) {
        const fallback = savedWorkspaces.find((item) => item.builtIn) ?? builtInDefaultWorkspace
        await applyWorkspaceLayout(fallback, false)
      }
      await loadSavedWorkspaces()
      workspace.setMessage(t('app.workspace.deleted', { name: saved.name }))
    } catch (error) {
      workspace.setMessage(error instanceof Error ? error.message : t('app.workspace.deleteError'))
    }
  }

  useEffect(() => {
    let disposed = false
    void (async () => {
      const workspaces = await loadSavedWorkspaces()
      if (disposed) return
      const rememberedId = readStoredString(ACTIVE_WORKSPACE_STORAGE_KEY)
      const initial = workspaces.find((item) => item.id === rememberedId) ?? workspaces.find((item) => item.builtIn) ?? builtInDefaultWorkspace
      await applyWorkspaceLayout(initial, false)
    })()
    return () => {
      disposed = true
    }
  }, [])

  useEffect(() => {
    const notifyLayoutChange = (): void => setWorkspaceLayoutChange((revision) => revision + 1)
    window.addEventListener('moonsprite-workspace-layout-change', notifyLayoutChange)
    return () => window.removeEventListener('moonsprite-workspace-layout-change', notifyLayoutChange)
  }, [])

  useEffect(() => {
    const active = activeWorkspaceRef.current
    if (!active || active.id !== activeWorkspaceId || workspaceApplyInProgress.current) return
    if (workspaceAutoSaveTimer.current !== null) window.clearTimeout(workspaceAutoSaveTimer.current)
    workspaceAutoSaveTimer.current = window.setTimeout(() => {
      workspaceAutoSaveTimer.current = null
      const target = activeWorkspaceRef.current
      if (!target || target.id !== activeWorkspaceId || workspaceApplyInProgress.current) return
      workspaceAutoSaveQueue.current = workspaceAutoSaveQueue.current
        .catch(() => {})
        .then(async () => {
          if (activeWorkspaceRef.current?.id !== target.id || workspaceApplyInProgress.current) return
          await persistMainWindowState(false)
          const saved = await window.moonSprite.saveWorkspace(target.id, target.name, captureWorkspaceLayout())
          activeWorkspaceRef.current = saved
          setSavedWorkspaces((current) => current.map((item) => (item.id === saved.id ? saved : item)))
        })
        .catch(() => {
          workspace.setMessage(t('app.workspace.autosaveError'))
        })
    }, 320)
    return () => {
      if (workspaceAutoSaveTimer.current !== null) {
        window.clearTimeout(workspaceAutoSaveTimer.current)
        workspaceAutoSaveTimer.current = null
      }
    }
  }, [
    activeWorkspaceId,
    bottomLayersHeight,
    captureWorkspaceLayout,
    inspectorWidth,
    leftDockWidth,
    panelDocks,
    panelVisibility,
    previewOpen,
    toolRailSide,
    workspaceLayoutChange,
    workspaceLayoutRevision
  ])

  useEffect(() => {
    const move = (event: PointerEvent): void => {
      const drag = toolRailDrag.current
      if (!drag) return
      if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 4) return
      drag.moved = true
      drag.target = toolRailDockTargetAtPointer(event.clientX, event.clientY, window.innerWidth, window.innerHeight)
      setToolRailDockPreview(drag.target)
    }
    const up = (): void => {
      const drag = toolRailDrag.current
      if (drag?.moved) {
        setToolRailSide(drag.target)
        writeStoredString(TOOL_RAIL_SIDE_STORAGE_KEY, drag.target)
      }
      toolRailDrag.current = null
      setToolRailDockPreview(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [])

  useEffect(() => {
    const frame = createResizeFrame((event) => {
      const workArea = workAreaRef.current
      const layout = workArea?.parentElement
      const right = resizeStart.current
      const left = leftDockResizeStart.current
      const bottom = bottomLayersResizeStart.current
      if (right) {
        const next = constrainInspectorWidth(right.width - (event.clientX - right.x), right.parentWidth)
        inspectorWidthRef.current = preferredInspectorWidthRef.current = next
        inspectorWidthRatioRef.current = dockSizeRatio(next, right.parentWidth, DEFAULT_INSPECTOR_WIDTH_RATIO)
        layout?.style.setProperty('--inspector-width', `${next}px`)
      } else if (left) {
        const next = constrainLeftDockWidth(left.width + event.clientX - left.x, left.parentWidth)
        leftDockWidthRef.current = preferredLeftDockWidthRef.current = next
        leftDockWidthRatioRef.current = dockSizeRatio(next, left.parentWidth, DEFAULT_LEFT_DOCK_WIDTH_RATIO)
        layout?.style.setProperty('--left-dock-width', `${next}px`)
      } else if (bottom) {
        const next = constrainBottomDockHeight(bottom.height - (event.clientY - bottom.y), bottom.parentHeight)
        bottomLayersHeightRef.current = preferredBottomLayersHeightRef.current = next
        bottomLayersHeightRatioRef.current = dockSizeRatio(next, bottom.parentHeight, DEFAULT_BOTTOM_DOCK_HEIGHT_RATIO)
        workArea?.style.setProperty('--bottom-layers-height', `${next}px`)
      }
      paneDockResizeRef.current?.update()
    })
    const move = (event: PointerEvent): void => {
      if (resizeStart.current || leftDockResizeStart.current || bottomLayersResizeStart.current) frame.push(event)
    }
    const up = (): void => {
      const resizing = Boolean(resizeStart.current || leftDockResizeStart.current || bottomLayersResizeStart.current)
      frame.flush()
      if (resizeStart.current) {
        setInspectorWidth(inspectorWidthRef.current)
        writeStoredString(INSPECTOR_WIDTH_STORAGE_KEY, String(Math.round(inspectorWidthRef.current)))
        writeStoredString(INSPECTOR_WIDTH_RATIO_STORAGE_KEY, String(inspectorWidthRatioRef.current))
      }
      if (leftDockResizeStart.current) {
        setLeftDockWidth(leftDockWidthRef.current)
        writeStoredString(LEFT_DOCK_WIDTH_STORAGE_KEY, String(Math.round(leftDockWidthRef.current)))
        writeStoredString(LEFT_DOCK_WIDTH_RATIO_STORAGE_KEY, String(leftDockWidthRatioRef.current))
      }
      if (bottomLayersResizeStart.current) {
        setBottomLayersHeight(bottomLayersHeightRef.current)
        writeStoredString(BOTTOM_DOCK_HEIGHT_STORAGE_KEY, String(Math.round(bottomLayersHeightRef.current)))
        writeStoredString(BOTTOM_DOCK_HEIGHT_RATIO_STORAGE_KEY, String(bottomLayersHeightRatioRef.current))
      }
      resizeStart.current = leftDockResizeStart.current = null
      bottomLayersResizeStart.current = null
      const paneResize = paneDockResizeRef.current
      paneDockResizeRef.current = null
      if (paneResize) {
        const next = paneResize.finish()
        if (next !== paneLayoutRef.current.layout) paneLayoutRef.current.change(next)
      }
      if (resizing) endWorkspaceResize()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    window.addEventListener('blur', up)
    return () => {
      frame.cancel()
      paneDockResizeRef.current?.finish(true)
      paneDockResizeRef.current = null
      if (resizeStart.current || leftDockResizeStart.current || bottomLayersResizeStart.current) endWorkspaceResize()
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      window.removeEventListener('blur', up)
    }
  }, [])

  useEffect(() => {
    let frame: number | null = null
    const resize = (): void => {
      if (frame !== null) window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        frame = null
        const parentSize = workspaceDockParentSize(workAreaRef.current)
        const {
          inspectorWidth: nextInspector,
          leftDockWidth: nextLeft,
          bottomDockHeight: nextBottom
        } = workspaceDockSizesForParent(
          preferredInspectorWidthRef.current,
          preferredLeftDockWidthRef.current,
          bottomLayersHeightRatioRef.current,
          parentSize.width,
          parentSize.height
        )
        inspectorWidthRef.current = nextInspector
        leftDockWidthRef.current = nextLeft
        bottomLayersHeightRef.current = nextBottom
        preferredBottomLayersHeightRef.current = nextBottom
        setInspectorWidth(nextInspector)
        setLeftDockWidth(nextLeft)
        setBottomLayersHeight(nextBottom)
      })
    }
    window.addEventListener('resize', resize)
    return () => {
      window.removeEventListener('resize', resize)
      if (frame !== null) window.cancelAnimationFrame(frame)
    }
  }, [])

  const beginToolRailDrag = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>): void => {
      if (event.button !== 0) return
      toolRailDrag.current = { startX: event.clientX, startY: event.clientY, moved: false, target: toolRailSide }
      event.currentTarget.setPointerCapture?.(event.pointerId)
      event.preventDefault()
    },
    [toolRailSide]
  )

  const beginLeftDockResize = useCallback(
    (event: React.PointerEvent<HTMLDivElement>): void => {
      if (event.button !== 0) return
      paneDockResizeRef.current = beginDocumentPaneDockResize(workAreaRef.current, paneLayoutRef.current.layout, 'left')
      beginWorkspaceResize()
      leftDockResizeStart.current = { x: event.clientX, width: leftDockWidthRef.current, parentWidth: workspaceDockParentSize(workAreaRef.current).width }
      event.currentTarget.setPointerCapture?.(event.pointerId)
      event.preventDefault()
    },
    [leftDockWidth]
  )

  const beginBottomDockResize = useCallback(
    (event: React.PointerEvent<HTMLDivElement>): void => {
      if (event.button !== 0) return
      paneDockResizeRef.current = beginDocumentPaneDockResize(workAreaRef.current, paneLayoutRef.current.layout, 'bottom')
      beginWorkspaceResize()
      bottomLayersResizeStart.current = {
        y: event.clientY,
        height: bottomLayersHeightRef.current,
        parentHeight: workspaceDockParentSize(workAreaRef.current).height
      }
      event.currentTarget.setPointerCapture?.(event.pointerId)
      event.preventDefault()
    },
    [bottomLayersHeight]
  )

  const beginInspectorResize = useCallback(
    (event: React.PointerEvent<HTMLDivElement>): void => {
      if (event.button !== 0) return
      paneDockResizeRef.current = beginDocumentPaneDockResize(workAreaRef.current, paneLayoutRef.current.layout, 'right')
      beginWorkspaceResize()
      resizeStart.current = { x: event.clientX, width: inspectorWidthRef.current, parentWidth: workspaceDockParentSize(workAreaRef.current).width }
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [inspectorWidth]
  )

  const closePreviewPanel = useCallback((): void => updatePanelVisibility('preview', false), [updatePanelVisibility])

  const editorAreaColumns = [
    ...(toolRailSide === 'left' ? ['var(--tool-rail-column-size)'] : []),
    ...(hasLeftDock ? ['var(--left-dock-width)', '6px'] : []),
    'minmax(0, 1fr)',
    ...(hasRightDock ? ['6px', 'var(--inspector-width)'] : []),
    ...(toolRailSide === 'right' ? ['var(--tool-rail-column-size)'] : [])
  ]

  const editorAreaNames = [
    ...(toolRailSide === 'left' ? ['toolrail'] : []),
    ...(hasLeftDock ? ['leftdock', 'leftresize'] : []),
    'work',
    ...(hasRightDock ? ['rightresize', 'rightdock'] : []),
    ...(toolRailSide === 'right' ? ['toolrail'] : [])
  ]

  const editorColumns = editorAreaColumns.join(' ')

  const editorMainAreaRow = editorAreaNames.join(' ')

  const editorToolRailAreaRow = editorAreaNames.map(() => 'toolrail').join(' ')

  const editorRows =
    toolRailSide === 'top'
      ? 'var(--tool-rail-row-size) minmax(0, 1fr)'
      : toolRailSide === 'bottom'
        ? 'minmax(0, 1fr) var(--tool-rail-row-size)'
        : 'minmax(0, 1fr)'

  const editorAreas =
    toolRailSide === 'top'
      ? `"${editorToolRailAreaRow}" "${editorMainAreaRow}"`
      : toolRailSide === 'bottom'
        ? `"${editorMainAreaRow}" "${editorToolRailAreaRow}"`
        : `"${editorMainAreaRow}"`
  return {
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
  }
}
