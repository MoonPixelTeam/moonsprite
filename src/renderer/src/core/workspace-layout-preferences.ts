import type { ToolRailSide, WorkspaceLayout, WorkspacePanelDock, WorkspacePanelId } from '@shared/types-workspace'
import { readStoredJson, readStoredString, removeStoredValue, writeStoredJson, writeStoredString } from './storage'

export type MainWindowState = NonNullable<WorkspaceLayout['mainWindow']>

export const MAIN_WINDOW_STORAGE_KEY = 'moonsprite.main-window-state.v2'
export const INSPECTOR_WIDTH_STORAGE_KEY = 'moonsprite.inspector-width.v1'
export const INSPECTOR_WIDTH_RATIO_STORAGE_KEY = 'moonsprite.inspector-width-ratio.v1'
export const PANEL_DOCKS_STORAGE_KEY = 'moonsprite.panel-docks.v1'
export const PANEL_VISIBILITY_STORAGE_KEY = 'moonsprite.panel-visibility.v1'
export const LEGACY_LAYERS_DOCK_STORAGE_KEY = 'moonsprite.layers-dock.v1'
export const BOTTOM_DOCK_HEIGHT_STORAGE_KEY = 'moonsprite.bottom-layers-height.v1'
export const BOTTOM_DOCK_HEIGHT_RATIO_STORAGE_KEY = 'moonsprite.bottom-dock-height-ratio.v1'
export const LEFT_DOCK_WIDTH_STORAGE_KEY = 'moonsprite.left-dock-width.v1'
export const LEFT_DOCK_WIDTH_RATIO_STORAGE_KEY = 'moonsprite.left-dock-width-ratio.v1'
export const TOOL_RAIL_SIDE_STORAGE_KEY = 'moonsprite.tool-rail-side.v1'
export const INSPECTOR_LAYOUT_STORAGE_KEY = 'moonsprite.inspector-layout.v2'
export const COLOR_SQUARE_DOCK_STORAGE_KEY = 'moonsprite.color-picker-square-dock'
export const COLOR_SQUARE_ANCHOR_STORAGE_KEY = 'moonsprite.color-picker-square-anchor'
export const ACTIVE_WORKSPACE_STORAGE_KEY = 'moonsprite.active-workspace.v1'
export const FLOATING_PANEL_STORAGE_KEYS: Record<WorkspacePanelId, string> = {
  color: 'moonsprite.color-panel.v1',
  palette: 'moonsprite.palette-panel.v1',
  layers: 'moonsprite.layers-panel.v1',
  freeTileInstances: 'moonsprite.free-tile-instances-panel.v1',
  history: 'moonsprite.history-panel.v1',
  preview: 'moonsprite.preview-panel.v1',
  tileset: 'moonsprite.tileset-panel.v1',
  brushes: 'moonsprite.brushes-panel.v1'
}
export const POPUP_PANEL_STORAGE_KEYS: Record<WorkspacePanelId, string> = {
  color: 'moonsprite.popup-color-panel.v1',
  palette: 'moonsprite.popup-palette-panel.v1',
  layers: 'moonsprite.popup-layers-panel.v1',
  freeTileInstances: 'moonsprite.popup-free-tile-instances-panel.v1',
  history: 'moonsprite.popup-history-panel.v1',
  preview: 'moonsprite.popup-preview-panel.v1',
  tileset: 'moonsprite.popup-tileset-panel.v1',
  brushes: 'moonsprite.popup-brushes-panel.v1'
}

export const WORKSPACE_LAYOUT_STORAGE_KEYS = [
  MAIN_WINDOW_STORAGE_KEY,
  INSPECTOR_WIDTH_STORAGE_KEY,
  INSPECTOR_WIDTH_RATIO_STORAGE_KEY,
  PANEL_DOCKS_STORAGE_KEY,
  PANEL_VISIBILITY_STORAGE_KEY,
  LEGACY_LAYERS_DOCK_STORAGE_KEY,
  BOTTOM_DOCK_HEIGHT_STORAGE_KEY,
  BOTTOM_DOCK_HEIGHT_RATIO_STORAGE_KEY,
  LEFT_DOCK_WIDTH_STORAGE_KEY,
  LEFT_DOCK_WIDTH_RATIO_STORAGE_KEY,
  TOOL_RAIL_SIDE_STORAGE_KEY,
  INSPECTOR_LAYOUT_STORAGE_KEY,
  COLOR_SQUARE_DOCK_STORAGE_KEY,
  COLOR_SQUARE_ANCHOR_STORAGE_KEY,
  ACTIVE_WORKSPACE_STORAGE_KEY,
  ...Object.values(FLOATING_PANEL_STORAGE_KEYS),
  ...Object.values(POPUP_PANEL_STORAGE_KEYS)
] as const

export const DEFAULT_PANEL_DOCKS: Record<WorkspacePanelId, WorkspacePanelDock> = {
  color: 'left', palette: 'left', layers: 'bottom', freeTileInstances: 'bottom', history: 'right', preview: 'right', tileset: 'right', brushes: 'right'
}
export const DEFAULT_PANEL_VISIBILITY: Record<WorkspacePanelId, boolean> = {
  color: true, palette: true, layers: true, freeTileInstances: false, history: true, preview: true, tileset: false, brushes: false
}

export function workspacePanelDockPresence(
  panelDocks: Partial<Record<WorkspacePanelId, WorkspacePanelDock>>,
  panelVisibility: Partial<Record<WorkspacePanelId, boolean>>
): Record<Exclude<WorkspacePanelDock, 'floating'>, boolean> {
  const visiblePanelIds = (Object.keys(DEFAULT_PANEL_DOCKS) as WorkspacePanelId[]).filter((id) => panelVisibility[id])
  const dockFor = (id: WorkspacePanelId): WorkspacePanelDock => panelDocks[id] ?? DEFAULT_PANEL_DOCKS[id]
  return {
    left: visiblePanelIds.some((id) => dockFor(id) === 'left'),
    right: visiblePanelIds.some((id) => dockFor(id) === 'right'),
    bottom: visiblePanelIds.some((id) => dockFor(id) === 'bottom')
  }
}

export const DEFAULT_INSPECTOR_WIDTH = 300
export const DEFAULT_LEFT_DOCK_WIDTH = 280
export const DEFAULT_BOTTOM_DOCK_HEIGHT = 220
export const MINIMUM_SIDE_DOCK_WIDTH = 32
export const MINIMUM_BOTTOM_DOCK_HEIGHT = 48
export const DEFAULT_INSPECTOR_WIDTH_RATIO = DEFAULT_INSPECTOR_WIDTH / 1440
export const DEFAULT_LEFT_DOCK_WIDTH_RATIO = DEFAULT_LEFT_DOCK_WIDTH / 1440
export const DEFAULT_BOTTOM_DOCK_HEIGHT_RATIO = DEFAULT_BOTTOM_DOCK_HEIGHT / 800

const clamp = (value: unknown, fallback: number, minimum: number, maximum: number): number => {
  if (value === null || value === undefined || value === '') return fallback
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback
}

const validRatio = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? Math.max(0, Math.min(1, number)) : null
}

const finiteNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

const validToolRailSide = (value: unknown): ToolRailSide | null => {
  return value === 'left' || value === 'right' || value === 'top' || value === 'bottom' ? value : null
}

export function dockSizeRatio(size: unknown, parentSize: number, fallbackRatio: number): number {
  if (size === null || size === undefined || size === '') return fallbackRatio
  const number = Number(size)
  if (!Number.isFinite(number) || number < 0 || !Number.isFinite(parentSize) || parentSize <= 0) return fallbackRatio
  return Math.max(0, Math.min(1, number / parentSize))
}

export function resolveDockSizeRatio(storedRatio: unknown, legacySize: unknown, parentSize: number, fallbackRatio: number): number {
  return validRatio(storedRatio) ?? dockSizeRatio(legacySize, parentSize, fallbackRatio)
}

export function dockSizeFromRatio(ratio: unknown, parentSize: number, fallbackRatio: number): number {
  return (validRatio(ratio) ?? fallbackRatio) * Math.max(1, parentSize)
}

export function constrainInspectorWidth(width: unknown, viewportWidth: number): number {
  return clamp(width, DEFAULT_INSPECTOR_WIDTH, MINIMUM_SIDE_DOCK_WIDTH, Math.max(MINIMUM_SIDE_DOCK_WIDTH, viewportWidth - 220))
}

export function constrainLeftDockWidth(width: unknown, viewportWidth: number): number {
  return clamp(width, DEFAULT_LEFT_DOCK_WIDTH, 0, Math.max(0, viewportWidth))
}

export function constrainBottomDockHeight(height: unknown, availableHeight: number): number {
  return clamp(height, DEFAULT_BOTTOM_DOCK_HEIGHT, MINIMUM_BOTTOM_DOCK_HEIGHT, Math.max(MINIMUM_BOTTOM_DOCK_HEIGHT, Math.min(520, availableHeight - 43 - 150)))
}

export function workspaceDockSizesForParent(preferredInspectorWidth: number, preferredLeftDockWidth: number, bottomDockHeightRatio: number, parentWidth: number, parentHeight: number): { inspectorWidth: number; leftDockWidth: number; bottomDockHeight: number } {
  return {
    inspectorWidth: constrainInspectorWidth(preferredInspectorWidth, parentWidth),
    leftDockWidth: constrainLeftDockWidth(preferredLeftDockWidth, parentWidth),
    bottomDockHeight: constrainBottomDockHeight(dockSizeFromRatio(bottomDockHeightRatio, parentHeight, DEFAULT_BOTTOM_DOCK_HEIGHT_RATIO), parentHeight)
  }
}

export function loadToolRailSide(storage?: Storage): ToolRailSide {
  return validToolRailSide(readStoredString(TOOL_RAIL_SIDE_STORAGE_KEY, storage)) ?? 'right'
}

export function toolRailDockTargetAtPointer(pointerX: number, pointerY: number, viewportWidth: number, viewportHeight: number): ToolRailSide {
  const width = Math.max(1, viewportWidth)
  const height = Math.max(1, viewportHeight)
  const x = Math.max(0, Math.min(width, pointerX))
  const y = Math.max(0, Math.min(height, pointerY))
  const candidates: Array<{ side: ToolRailSide; distance: number }> = [
    { side: 'left', distance: x },
    { side: 'right', distance: width - x },
    { side: 'top', distance: y },
    { side: 'bottom', distance: height - y }
  ]
  return candidates.reduce((nearest, candidate) => candidate.distance < nearest.distance ? candidate : nearest).side
}

export function loadInspectorWidth(viewportWidth: number, storage?: Storage): number {
  return constrainInspectorWidth(readStoredString(INSPECTOR_WIDTH_STORAGE_KEY, storage), viewportWidth)
}

export function loadPanelDocks(storage?: Storage): Record<WorkspacePanelId, WorkspacePanelDock> {
  const stored = readStoredJson<Partial<Record<WorkspacePanelId, WorkspacePanelDock>> | null>(PANEL_DOCKS_STORAGE_KEY, null, storage)
  const next = { ...DEFAULT_PANEL_DOCKS }
  for (const id of Object.keys(next) as WorkspacePanelId[]) {
    const dock = stored?.[id]
    if (dock === 'right' || dock === 'left' || dock === 'bottom' || dock === 'floating') next[id] = dock
  }
  if (!stored && readStoredString(LEGACY_LAYERS_DOCK_STORAGE_KEY, storage) === 'bottom') next.layers = 'bottom'
  return next
}

export function loadPanelVisibility(storage?: Storage): Record<WorkspacePanelId, boolean> {
  const stored = readStoredJson<Partial<Record<WorkspacePanelId, boolean>> | null>(PANEL_VISIBILITY_STORAGE_KEY, null, storage)
  const next = { ...DEFAULT_PANEL_VISIBILITY }
  if (!stored) return next
  for (const id of Object.keys(next) as WorkspacePanelId[]) if (typeof stored[id] === 'boolean') next[id] = stored[id]!
  return next
}

export function loadBottomDockHeight(storage?: Storage): number {
  return clamp(readStoredString(BOTTOM_DOCK_HEIGHT_STORAGE_KEY, storage), DEFAULT_BOTTOM_DOCK_HEIGHT, MINIMUM_BOTTOM_DOCK_HEIGHT, 520)
}

export function loadLeftDockWidth(storage?: Storage): number {
  return clamp(readStoredString(LEFT_DOCK_WIDTH_STORAGE_KEY, storage), DEFAULT_LEFT_DOCK_WIDTH, 0, Number.MAX_SAFE_INTEGER)
}

export function loadMainWindowState(storage?: Storage): MainWindowState | null {
  const value = readStoredJson<Partial<MainWindowState> | null>(MAIN_WINDOW_STORAGE_KEY, null, storage)
  if (!value) return null
  const numbers = [value.x, value.y, value.width, value.height]
  if (!numbers.every((item) => typeof item === 'number' && Number.isFinite(item))) return null
  if (value.width! < 640 || value.height! < 400 || value.width! > 32_768 || value.height! > 32_768) return null
  return { x: value.x!, y: value.y!, width: value.width!, height: value.height!, maximized: value.maximized === true }
}

export function saveMainWindowState(state: MainWindowState, storage?: Storage): void {
  writeStoredJson(MAIN_WINDOW_STORAGE_KEY, state, storage)
}

export function savePanelDocks(panelDocks: Record<WorkspacePanelId, WorkspacePanelDock>, storage?: Storage): void {
  writeStoredJson(PANEL_DOCKS_STORAGE_KEY, panelDocks, storage)
}

export function savePanelVisibility(panelVisibility: Record<WorkspacePanelId, boolean>, storage?: Storage): void {
  writeStoredJson(PANEL_VISIBILITY_STORAGE_KEY, panelVisibility, storage)
}

export function readLayoutStorage(key: string, storage?: Storage): string | null {
  return readStoredString(key, storage)
}

export function writeLayoutStorage(key: string, value: string | null, storage?: Storage): void {
  if (value === null) removeStoredValue(key, storage)
  else writeStoredString(key, value, storage)
}

export interface NormalizedWorkspaceLayout {
  panelDocks: Record<WorkspacePanelId, WorkspacePanelDock>
  panelVisibility: Record<WorkspacePanelId, boolean>
  inspectorWidth: number
  leftDockWidth: number
  bottomDockHeight: number
  inspectorWidthRatio: number
  leftDockWidthRatio: number
  bottomDockHeightRatio: number
  toolRailSide: ToolRailSide
  previewOpen: boolean
}

export function normalizeWorkspaceLayout(layout: WorkspaceLayout, viewportWidth: number, availableHeight = 800): NormalizedWorkspaceLayout {
  const panelDocks = { ...DEFAULT_PANEL_DOCKS }
  for (const id of Object.keys(panelDocks) as WorkspacePanelId[]) {
    const dock = layout.panelDocks?.[id]
    if (dock === 'left' || dock === 'right' || dock === 'bottom' || dock === 'floating') panelDocks[id] = dock
  }
  const panelVisibility = { ...DEFAULT_PANEL_VISIBILITY }
  if (layout.panelVisibility) {
    for (const id of Object.keys(panelVisibility) as WorkspacePanelId[]) if (typeof layout.panelVisibility[id] === 'boolean') panelVisibility[id] = layout.panelVisibility[id]!
  } else {
    panelVisibility.preview = layout.previewOpen !== false
  }
  const inspectorWidth = constrainInspectorWidth(finiteNumber(layout.inspectorWidth) ?? dockSizeFromRatio(layout.inspectorWidthRatio, viewportWidth, DEFAULT_INSPECTOR_WIDTH_RATIO), viewportWidth)
  const leftDockWidth = constrainLeftDockWidth(finiteNumber(layout.leftDockWidth) ?? dockSizeFromRatio(layout.leftDockWidthRatio, viewportWidth, DEFAULT_LEFT_DOCK_WIDTH_RATIO), viewportWidth)
  const legacyBottomDockHeight = constrainBottomDockHeight(layout.bottomDockHeight, availableHeight)
  const inspectorWidthRatio = dockSizeRatio(inspectorWidth, viewportWidth, DEFAULT_INSPECTOR_WIDTH_RATIO)
  const leftDockWidthRatio = dockSizeRatio(leftDockWidth, viewportWidth, DEFAULT_LEFT_DOCK_WIDTH_RATIO)
  const bottomDockHeightRatio = resolveDockSizeRatio(layout.bottomDockHeightRatio, legacyBottomDockHeight, availableHeight, DEFAULT_BOTTOM_DOCK_HEIGHT_RATIO)
  return {
    panelDocks,
    panelVisibility,
    inspectorWidth,
    leftDockWidth,
    bottomDockHeight: constrainBottomDockHeight(dockSizeFromRatio(bottomDockHeightRatio, availableHeight, DEFAULT_BOTTOM_DOCK_HEIGHT_RATIO), availableHeight),
    inspectorWidthRatio,
    leftDockWidthRatio,
    bottomDockHeightRatio,
    toolRailSide: validToolRailSide(layout.toolRailSide) ?? 'right',
    previewOpen: panelVisibility.preview
  }
}
