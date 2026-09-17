export type WorkspacePanelId = 'color' | 'palette' | 'layers' | 'freeTileInstances' | 'history' | 'preview' | 'tileset' | 'brushes'

export type WorkspacePanelDock = 'right' | 'left' | 'bottom' | 'floating'

export type ToolRailSide = 'left' | 'right' | 'top' | 'bottom'

export interface WorkspaceLayout {
  panelDocks: Record<WorkspacePanelId, WorkspacePanelDock>
  /** Optional for backward compatibility with workspaces saved before panel visibility was persisted. */
  panelVisibility?: Partial<Record<WorkspacePanelId, boolean>>
  inspectorWidth: number
  leftDockWidth: number
  bottomDockHeight: number
  /** Side ratios are retained for legacy migration; bottom height continues to use its ratio. */
  inspectorWidthRatio?: number
  leftDockWidthRatio?: number
  bottomDockHeightRatio?: number
  toolRailSide: ToolRailSide
  previewOpen: boolean
  inspectorLayout: string | null
  colorSquareDock: string | null
  colorSquareAnchor: string | null
  floatingPanels: Record<WorkspacePanelId, string | null>
  mainWindow: { x: number; y: number; width: number; height: number; maximized: boolean } | null
}

export interface StoredWorkspace {
  id: string
  name: string
  filePath: string
  updatedAt: string
  builtIn: boolean
  layout: WorkspaceLayout
  initialLayout: WorkspaceLayout
}

export interface WorkspaceListing {
  directoryPath: string
  workspaces: StoredWorkspace[]
}
