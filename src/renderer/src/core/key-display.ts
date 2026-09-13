/** Return a compact, user-facing label for a keyboard event. */
export function keyDisplayLabel(key: string): string {
  const labels: Record<string, string> = {
    Control: 'Ctrl', Meta: 'Win', Alt: 'Alt', Shift: 'Shift',
    Enter: 'Enter', Escape: 'Esc', Tab: 'Tab', ' ': 'Space', Space: 'Space',
    Backspace: 'Backspace', Delete: 'Del', Insert: 'Ins',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
    PageUp: 'PageUp', PageDown: 'PageDown', Home: 'Home', End: 'End'
  }
  return labels[key] ?? (key.length === 1 ? key.toUpperCase() : key)
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
