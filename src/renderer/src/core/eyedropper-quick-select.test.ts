import { describe, expect, it } from 'vitest'
import { shouldQuickSelectEyedropper, type EyedropperQuickSelectContext } from './eyedropper-quick-select'

const context = (patch: Partial<EyedropperQuickSelectContext> = {}): EyedropperQuickSelectContext => ({
  enabled: true,
  key: 'Alt',
  altHeld: true,
  repeat: false,
  pointerVisible: true,
  activeDocument: true,
  dragActive: false,
  spaceHeld: false,
  modifierChordActive: false,
  canvasContextBlocked: false,
  interactionBlocked: false,
  ...patch
})

describe('eyedropper quick select', () => {
  it('allows one-shot sampling when Alt is first pressed over the active canvas', () => {
    expect(shouldQuickSelectEyedropper(context())).toBe(true)
  })

  it.each([
    ['preference disabled', { enabled: false }],
    ['another key', { key: 'Control' }],
    ['Alt not held', { altHeld: false }],
    ['repeated keydown', { repeat: true }],
    ['pointer outside', { pointerVisible: false }],
    ['inactive document', { activeDocument: false }],
    ['canvas drag active', { dragActive: true }],
    ['temporary pan active', { spaceHeld: true }],
    ['another modifier forms a chord', { modifierChordActive: true }],
    ['the active tool owns Alt', { canvasContextBlocked: true }],
    ['dialog or text input active', { interactionBlocked: true }]
  ])('does not sample with %s', (_label, patch) => {
    expect(shouldQuickSelectEyedropper(context(patch))).toBe(false)
  })
})
