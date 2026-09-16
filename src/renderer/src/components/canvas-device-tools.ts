import type { TabletPreferences } from '@/core/file-preferences'
import { isPenBarrelButtonEvent, isPenEraserEvent } from '@/core/canvas-input'
import type { ToolId } from '@shared/types-brush'
import type { DocumentSession } from '@/store/workspace'

type DeviceEvent = { pointerType: string; button: number; buttons: number }

export function deviceTemporaryTool(event: DeviceEvent, preferences: TabletPreferences): ToolId | null {
  if (event.pointerType === 'pen' && preferences.api === 'disabled') return null
  if (preferences.eraserTipEnabled && isPenEraserEvent(event)) return 'eraser'
  if ((event.button === 2 || (event.buttons & 2) !== 0) && preferences.rightClickAction === 'foreground-eyedropper') return 'eyedropper'
  if (!isPenBarrelButtonEvent(event)) return null
  return preferences.barrelButtonAction === 'disabled' ? null : preferences.barrelButtonAction
}

export function withDeviceTemporaryTool(session: DocumentSession, tool: ToolId | null): DocumentSession {
  if (!tool || tool === session.tool) return session
  return { ...session, tool, ...(tool === 'eraser' ? { brushSize: session.brushProfiles.eraser.brushSize } : {}) }
}

export const deviceSampleUsesSecondary = (button: number, temporaryTool: ToolId | null): boolean =>
  button === 2 && temporaryTool !== 'eyedropper'
