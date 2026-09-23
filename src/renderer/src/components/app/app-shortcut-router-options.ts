import type { AppShortcutContext } from './app-shortcut-context'
import type { EditorCommandScope } from '@/core/command-context'
import type { loadShortcutBindings } from '@/core/shortcuts'
export interface Options {
  pointerPosition: () => { x: number; y: number } | null
  commandSurface: () => HTMLElement | null
  rotationIndicatorPosition: import('@/core/file-preferences').RotationIndicatorPosition
  shortcuts: ReturnType<typeof loadShortcutBindings>
  homeOpen: boolean
  outlineOpen: boolean
  openMenu: boolean
  shortcutOpen: boolean
  timelineHidden: boolean
  commandScope(): EditorCommandScope
  selectionOverride(): boolean
  onEscape(event: KeyboardEvent): void
  commands: AppShortcutContext['uiCommands']
  openAdjustment: AppShortcutContext['openAdjustment']
  publishShortcutCommand: AppShortcutContext['publishShortcutCommand']
}
