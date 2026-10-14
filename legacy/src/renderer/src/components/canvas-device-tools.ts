import type { TabletPreferences, RightClickAction } from '@/core/file-preferences'
import { isPenBarrelButtonEvent, isPenEraserEvent } from '@/core/canvas-input'
import type { ToolId } from '@shared/types-brush'
import type { DocumentSession } from '@/store/workspace'

type DeviceEvent = { pointerType: string; button: number; buttons: number }

export function deviceRightClickAction(event: DeviceEvent, preferences: TabletPreferences): RightClickAction {
  if (isPenBarrelButtonEvent(event) && preferences.rightClickAction === 'background' && preferences.barrelButtonAction !== 'disabled') {
    return preferences.barrelButtonAction === 'eyedropper' ? 'foreground-eyedropper' : preferences.barrelButtonAction
  }
  return preferences.rightClickAction
}

export function penEraserToolEvent<T extends DeviceEvent>(event: T, preferences: TabletPreferences): T {
  if (!preferences.eraserTipEnabled || !isPenEraserEvent(event)) return event
  return Object.assign(Object.create(event), { button: event.button === 5 ? 0 : event.button, buttons: (event.buttons & ~32) | (event.buttons & 32 ? 1 : 0) })
}

export function deviceTemporaryTool(event: DeviceEvent, preferences: TabletPreferences): ToolId | null {
  if (event.pointerType === 'pen' && preferences.api === 'disabled') return null
  if (preferences.eraserTipEnabled && isPenEraserEvent(event)) return 'eraser'
  if (event.button === 2 || (event.buttons & 2) !== 0) {
    const tool = rightClickTool(preferences.rightClickAction)
    if (tool) return tool
  }
  if (!isPenBarrelButtonEvent(event)) return null
  return preferences.barrelButtonAction === 'disabled' ? null : preferences.barrelButtonAction
}

export function withDeviceTemporaryTool(session: DocumentSession, tool: ToolId | null, action: RightClickAction | null = null): DocumentSession {
  if (action === 'rectangle' || action === 'lasso') return { ...session, tool: 'selection', selectionKind: action, selectionMode: 'replace' }
  if (action === 'select-layer-move') return { ...session, tool: 'move', moveKind: 'move', moveAutoSelect: true, selectedLayerIds: [], selectedGroupIds: [], selectedGroupId: null, selectedAnimationFrameIds: [], selectedAnimationCellKeys: [], layerSelectionExplicit: false }
  if (!tool || tool === session.tool) return session
  return { ...session, tool, ...(tool === 'eraser' ? { brushSize: session.brushProfiles.eraser.brushSize } : {}) }
}

export const deviceSampleUsesSecondary = (button: number, temporaryTool: ToolId | null): boolean =>
  button === 2 && temporaryTool !== 'eyedropper'


export function rightClickTool(action: RightClickAction): ToolId | null {
  switch (action) {
    case 'foreground-eyedropper': return 'eyedropper'
    case 'eraser': return 'eraser'
    case 'hand': return 'hand'
    case 'rectangle':
    case 'lasso': return 'selection'
    case 'select-layer-move': return 'move'
    default: return null
  }
}

/** Route a configured right-button gesture through the tool's primary action. */
export function rightClickToolEvent<T extends { button: number; buttons: number }>(event: T, action: RightClickAction | null): T {
  if (!action || action === 'background') return event
  return Object.assign(Object.create(event), { button: event.button === 2 ? 0 : event.button, buttons: (event.buttons & 2) ? (event.buttons & ~2) | 1 : event.buttons })
}
