import { useEffect } from 'react'
import { shouldHandleAnimationPlaybackShortcut } from '@/core/command-context'
import { shortcutBindingBlocked, shortcutBindingsFor, shortcutMatchesEvent, type ShortcutBindings, type ShortcutConflictState } from '@/core/shortcuts'
import { useWorkspace } from '@/store/workspace'

interface Options {
  homeOpen: boolean
  openMenu: string | null
  popupPanelId: string | null
  timelineHidden: boolean
  shortcutConflictState: ShortcutConflictState
  shortcuts: ShortcutBindings
}

// Isolate this global listener from App's render scope and its document snapshots.
export function useAppPlaybackShortcut({ homeOpen, openMenu, popupPanelId, timelineHidden, shortcutConflictState, shortcuts }: Options): void {
  useEffect(() => {
    const keydown = (event: KeyboardEvent): void => {
      const playbackMatched = shortcutBindingsFor(shortcuts, 'toggleAnimationPlayback').some(
        (shortcut) => !shortcutBindingBlocked(shortcutConflictState, 'toggleAnimationPlayback', shortcut) && shortcutMatchesEvent(event, shortcut)
      )
      if (!playbackMatched) return
      const target = event.target instanceof Element ? event.target : null
      const state = useWorkspace.getState()
      const active = state.sessions.find((item) => item.document.id === state.activeId) ?? null
      const isInteractiveTarget = Boolean(
        target?.closest('input, textarea, select, button, [contenteditable="true"], [role="button"], [role="menuitem"], [role="option"]')
      )
      const hasBlockingSurface = Boolean(
        openMenu ||
          popupPanelId ||
          document.querySelector(
            '.modal-backdrop, .context-menu, .tool-flyout, .brush-library, .brush-size-popover, .pressure-popover, .themed-select-popover, .palette-operation-dialog, .palette-library-popover, .palette-actions-popover, .workspace-panel-popup-layer'
          )
      )
      if (
        !shouldHandleAnimationPlaybackShortcut({
          defaultPrevented: event.defaultPrevented,
          repeat: event.repeat,
          hasSession: Boolean(active),
          frameCount: active?.document.animation?.frames.length ?? 0,
          homeOpen,
          timelineHidden: timelineHidden,
          hasSelection: Boolean(active?.selection),
          hasTextBoxTransform: Boolean(active?.textBoxTransform),
          isInteractiveTarget,
          hasBlockingSurface
        })
      )
        return
      event.preventDefault()
      event.stopPropagation()
      state.setAnimationPlaying(!active!.animationPlaying)
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [homeOpen, openMenu, popupPanelId, timelineHidden, shortcutConflictState, shortcuts])
}
