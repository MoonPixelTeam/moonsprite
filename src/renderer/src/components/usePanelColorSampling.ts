import { useCallback, useEffect, useState } from 'react'
import type { ToolId } from '@shared/types-brush'
import { paletteSamplingShortcutActive } from '@/core/palette-sampling-shortcut'
import { loadShortcutBindings, modifierShortcutHeldByBindings, shortcutBindingsFor } from '@/core/shortcuts'
import { useQuickToolShortcut } from '@/components/useQuickToolShortcut'

type ModifierState = Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>

const EMPTY_MODIFIERS: ModifierState = {
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false
}

const modifierState = (event: ModifierState): ModifierState => ({
  ctrlKey: event.ctrlKey,
  metaKey: event.metaKey,
  altKey: event.altKey,
  shiftKey: event.shiftKey
})

export const panelColorSamplingActive = (
  tool: ToolId,
  modifiers: ModifierState,
  quickEyedropperShortcuts: readonly string[],
  paletteSamplingActive = false,
  heldQuickEyedropperActive = false
): boolean => tool === 'eyedropper'
  || paletteSamplingActive
  || heldQuickEyedropperActive
  || modifierShortcutHeldByBindings(modifiers, quickEyedropperShortcuts)

export function usePanelColorSampling(tool: ToolId): {
  active: boolean
  activeForEvent: (event: ModifierState) => boolean
} {
  const [shortcuts, setShortcuts] = useState(loadShortcutBindings)
  const [modifiers, setModifiers] = useState<ModifierState>(EMPTY_MODIFIERS)
  const quickToolMatch = useQuickToolShortcut(shortcuts)

  useEffect(() => {
    const updateModifiers = (event: KeyboardEvent): void => setModifiers(modifierState(event))
    const clearModifiers = (): void => setModifiers(EMPTY_MODIFIERS)
    const refreshShortcuts = (): void => setShortcuts(loadShortcutBindings())
    const visibilityChange = (): void => { if (document.hidden) clearModifiers() }
    window.addEventListener('keydown', updateModifiers)
    window.addEventListener('keyup', updateModifiers)
    window.addEventListener('blur', clearModifiers)
    window.addEventListener('moonsprite:shortcuts-changed', refreshShortcuts)
    document.addEventListener('visibilitychange', visibilityChange)
    return () => {
      window.removeEventListener('keydown', updateModifiers)
      window.removeEventListener('keyup', updateModifiers)
      window.removeEventListener('blur', clearModifiers)
      window.removeEventListener('moonsprite:shortcuts-changed', refreshShortcuts)
      document.removeEventListener('visibilitychange', visibilityChange)
    }
  }, [])

  const quickEyedropperShortcuts = shortcutBindingsFor(shortcuts, 'tool.eyedropper.quick')
  const heldQuickEyedropperActive = quickToolMatch?.target.tool === 'eyedropper'
  const activeForEvent = useCallback((event: ModifierState): boolean => panelColorSamplingActive(
    tool,
    event,
    quickEyedropperShortcuts,
    paletteSamplingShortcutActive(),
    heldQuickEyedropperActive
  ), [heldQuickEyedropperActive, quickEyedropperShortcuts, tool])

  return {
    active: panelColorSamplingActive(tool, modifiers, quickEyedropperShortcuts, paletteSamplingShortcutActive(), heldQuickEyedropperActive),
    activeForEvent
  }
}
