import type { ShortcutId } from './shortcuts'

export type EditorCommandScope = 'canvas' | 'layers' | 'palette' | 'tileset' | 'brushes'

export const COMMAND_SCOPE_EVENT = 'moonsprite:command-scope'
export const TILESET_DELETE_COMMAND_EVENT = 'moonsprite:delete-tileset-selection'
export const BRUSH_LIBRARY_DELETE_COMMAND_EVENT = 'moonsprite:delete-brush-selection'
export const EDITOR_SHORTCUT_COMMAND_EVENT = 'moonsprite:editor-shortcut-command'
export const LIQUIFY_RESET_COMMAND_EVENT = 'moonsprite:liquify-reset'

export interface EditorShortcutCommandDetail {
  documentId: string
  id: ShortcutId
}

export interface LiquifyResetCommandDetail {
  documentId: string
}

export type DeleteCommandTarget = 'selection' | 'animation' | 'free-tile-instance' | 'layers' | 'palette' | 'tileset' | 'brushes' | null
export type CopyCommandTarget = 'selection' | 'layers' | null

export interface AnimationDeleteSelectionContext {
  selectedFrameCount: number
  selectedCellCount: number
  selectedMaskCellCount: number
  selectedMaskRowCount?: number
  cellSelectionExplicit: boolean
}

export const hasAnimationDeleteSelection = (context: AnimationDeleteSelectionContext): boolean =>
  context.selectedFrameCount > 0
  || context.selectedMaskCellCount > 0
  || (context.selectedMaskRowCount ?? 0) > 0
  || (context.cellSelectionExplicit && context.selectedCellCount > 0)

export function resolveDeleteCommand(scope: EditorCommandScope, hasSelection: boolean, hasAnimationSelection = false, hasFreeTileInstanceSelection = false): DeleteCommandTarget {
  if (scope === 'layers' && hasFreeTileInstanceSelection) return 'free-tile-instance'
  // A canvas selection owns Delete even when the last focused surface is the
  // timeline and one or more cels/frames are selected. The timeline selection
  // remains available for deletion when no canvas selection is active.
  if (scope === 'layers' && hasSelection && hasAnimationSelection) return 'selection'
  if (scope === 'layers' && hasAnimationSelection) return 'animation'
  if (scope === 'layers') return 'layers'
  if (scope === 'palette') return 'palette'
  if (scope === 'tileset') return 'tileset'
  if (scope === 'brushes') return 'brushes'
  if (hasSelection) return 'selection'
  return hasFreeTileInstanceSelection ? 'free-tile-instance' : null
}

export function resolveCopyCommand(scope: EditorCommandScope, hasSelection: boolean): CopyCommandTarget {
  if (scope === 'layers') return 'layers'
  return scope === 'canvas' && hasSelection ? 'selection' : null
}

export const shouldTriggerDeleteCommand = (configuredShortcutMatches: boolean, key: string): boolean =>
  configuredShortcutMatches || key === 'Backspace'

export const shouldHandleGlobalSelectionEnter = (outlineOpen: boolean, hasSelection: boolean): boolean =>
  !outlineOpen && hasSelection

export interface AnimationPlaybackShortcutContext {
  defaultPrevented: boolean
  repeat: boolean
  hasSession: boolean
  frameCount: number
  homeOpen: boolean
  timelineHidden: boolean
  hasSelection: boolean
  hasTextBoxTransform: boolean
  isInteractiveTarget: boolean
  hasBlockingSurface: boolean
}

export const shouldHandleAnimationPlaybackShortcut = (context: AnimationPlaybackShortcutContext): boolean =>
  !context.defaultPrevented
  && !context.repeat
  && context.hasSession
  && context.frameCount > 1
  && !context.homeOpen
  && !context.timelineHidden
  && !context.hasSelection
  && !context.hasTextBoxTransform
  && !context.isInteractiveTarget
  && !context.hasBlockingSurface

export interface AnimationFrameStepKeyContext {
  key: string
  hasSelection: boolean
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  altKey: boolean
}

export const animationFrameStepDirection = (context: AnimationFrameStepKeyContext): -1 | 1 | null => {
  if (context.ctrlKey || context.metaKey || context.altKey) return null
  const key = context.key.toLowerCase()
  if (key === ',' || key === '，') return -1
  if (key === '.' || key === '。') return 1
  if (context.hasSelection || context.shiftKey) return null
  if (key === 'arrowleft') return -1
  if (key === 'arrowright') return 1
  return null
}
