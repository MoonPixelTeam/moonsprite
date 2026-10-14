import { normalizeShortcut, SHORTCUT_IDS, shortcutBindingBlocked, shortcutBindingsFor, type ShortcutBindings, type ShortcutConflictState, type ShortcutId } from './shortcuts'

/** Match the recorded chord, independent of which key was released last. */
export function keyDisplayShortcut(keys: readonly string[], shortcuts: ShortcutBindings, conflicts: ShortcutConflictState): ShortcutId | undefined {
  const aliases: Record<string, string> = { Control: 'Ctrl', Meta: 'Win', ' ': 'Space' }
  const parts = keys.map((key) => aliases[key] ?? key)
  // Several ordinary keys in one gesture are not a single shortcut.
  if (parts.filter((part) => !['Ctrl', 'Win', 'Alt', 'Shift', 'Space'].includes(part)).length > 1) return undefined
  const chord = normalizeShortcut(parts.join('+')).toLowerCase()
  if (!chord) return undefined
  return SHORTCUT_IDS.find((id) => shortcutBindingsFor(shortcuts, id).some((binding) =>
    !shortcutBindingBlocked(conflicts, id, binding) && normalizeShortcut(binding).toLowerCase() === chord
  ))
}

/** Return a compact, user-facing label for a keyboard event. */
export function keyDisplayLabel(key: string, locale = 'zh-CN'): string {
  const mouseLabels = locale === 'zh-CN'
    ? { MouseLeft: '鼠标左键', MouseRight: '鼠标右键', MouseMiddle: '鼠标中键', MouseBack: '鼠标侧键 1', MouseForward: '鼠标侧键 2' }
    : { MouseLeft: 'Left Mouse', MouseRight: 'Right Mouse', MouseMiddle: 'Middle Mouse', MouseBack: 'Mouse Button 4', MouseForward: 'Mouse Button 5' }
  const labels: Record<string, string> = {
    Control: 'Ctrl', Meta: 'Win', Alt: 'Alt', Shift: 'Shift',
    Enter: 'Enter', Escape: 'Esc', Tab: 'Tab', ' ': 'Space', Space: 'Space',
    Backspace: 'Backspace', Delete: 'Del', Insert: 'Ins',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
    PageUp: 'PageUp', PageDown: 'PageDown', Home: 'Home', End: 'End',
    ...mouseLabels
  }
  return labels[key] ?? (key.length === 1 ? key.toUpperCase() : key)
}

/** A released ordinary key completes one chord, even while modifiers remain held. */
export function keyDisplayCompletesGesture(key: string, heldCount: number): boolean {
  return !['Control', 'Meta', 'Alt', 'Shift'].includes(key) || heldCount === 0
}

export interface KeyDisplayKeydownState {
  isTrusted: boolean
  syntheticWheelWithModifier: boolean
  enabled: boolean
  activeDocument: boolean
  repeat: boolean
  blockedTarget: boolean
}

/** Keyboard display is document-scoped, not pointer-scoped. */
export function keyDisplayKeydownAccepted(state: KeyDisplayKeydownState): boolean {
  return (state.isTrusted || state.syntheticWheelWithModifier)
    && state.enabled
    && state.activeDocument
    && !state.repeat
    && !state.blockedTarget
}
