export interface EyedropperQuickSelectContext {
  enabled: boolean
  key: string
  altHeld: boolean
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
 * The optional Alt-only eyedropper is a one-shot action. It must not steal Alt
 * from an in-progress canvas gesture or fire repeatedly while the key is held.
 */
export const shouldQuickSelectEyedropper = (context: EyedropperQuickSelectContext): boolean =>
  context.enabled
  && context.key === 'Alt'
  && context.altHeld
  && !context.repeat
  && context.pointerVisible
  && context.activeDocument
  && !context.dragActive
  && !context.spaceHeld
  && !context.modifierChordActive
  && !context.canvasContextBlocked
  && !context.interactionBlocked
