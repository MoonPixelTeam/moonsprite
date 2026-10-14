export interface EyedropperQuickSelectContext {
  enabled: boolean
  shortcutMatched: boolean
  repeat: boolean
  pointerVisible: boolean
  activeDocument: boolean
  dragActive: boolean
  spaceHeld: boolean
  modifierChordActive: boolean
  canvasContextBlocked: boolean
  interactionBlocked: boolean
}

/**
 * The optional quick eyedropper is a one-shot action. It must not steal a
 * configured shortcut from an in-progress canvas gesture or fire repeatedly
 * while the key is held.
 */
export const shouldQuickSelectEyedropper = (context: EyedropperQuickSelectContext): boolean =>
  context.enabled
  && context.shortcutMatched
  && !context.repeat
  && context.pointerVisible
  && context.activeDocument
  && !context.dragActive
  && !context.spaceHeld
  && !context.modifierChordActive
  && !context.canvasContextBlocked
  && !context.interactionBlocked
