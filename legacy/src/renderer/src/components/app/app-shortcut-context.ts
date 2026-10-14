import type { DocumentSession } from '@/store/workspace'
import type { EditorCommandScope } from '@/core/command-context'
import type { AdjustmentKind } from '@/core/adjustments'
import type { WorkspacePanelId } from '@/components/WorkspacePanels'
import { type ShortcutId } from '@/core/shortcuts'
import { useWorkspace } from '@/store/workspace'
import { useI18n } from '@/components/I18nProvider'
export interface AppShortcutContext {
  pointerPosition: () => { x: number; y: number } | null
  commandSurface: () => HTMLElement | null
  rotationIndicatorPosition: import('@/core/file-preferences').RotationIndicatorPosition
  event: KeyboardEvent
  heldShortcutParts: Set<string>
  key: string
  target: HTMLElement | null
  commandKey: boolean
  isTextEntry: boolean
  keyboardSurfaceBlocked: boolean
  workspace: ReturnType<typeof useWorkspace.getState>
  session: DocumentSession | null
  t: ReturnType<typeof useI18n>['t']
  matches: (id: ShortcutId) => boolean
  runCommand: (id: ShortcutId, command: () => void, allowRepeat?: boolean) => boolean
  adjustBrushSize: (delta: number) => void
  homeOpen: boolean
  outlineOpen: boolean
  timelineHidden: boolean
  commandScope: () => EditorCommandScope
  selectionOverride: () => boolean
  uiCommands: Partial<Record<ShortcutId, () => void>>
  openAdjustment: (kind: AdjustmentKind) => void
  publishShortcutCommand: (id: ShortcutId, panelId?: WorkspacePanelId) => void
}
