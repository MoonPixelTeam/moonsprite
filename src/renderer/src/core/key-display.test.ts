import { describe, expect, it } from 'vitest'
import { keyDisplayKeydownAccepted, keyDisplayLabel, keyDisplayShortcut } from './key-display'
import { deriveShortcutConflicts, shortcutBindingsFromMap } from './shortcuts'

describe('key display shortcut actions', () => {
  const shortcuts = shortcutBindingsFromMap({})
  const conflicts = deriveShortcutConflicts(shortcuts)

  it('matches the complete recorded chord regardless of modifier order or key case', () => {
    expect(keyDisplayShortcut(['Control', 'z'], shortcuts, conflicts)).toBe('undo')
    expect(keyDisplayShortcut(['z', 'Control'], shortcuts, conflicts)).toBe('undo')
    expect(keyDisplayShortcut(['Control', 'Shift', 'Z'], shortcuts, conflicts)).toBe('redo')
    expect(keyDisplayShortcut(['z'], shortcuts, conflicts)).toBe('tool.zoom')
    expect(keyDisplayShortcut([' '], shortcuts, conflicts)).toBe('tool.hand.quick')
  })

  it('uses customized bindings, including secondary bindings', () => {
    const custom = { ...shortcuts, undo: ['Ctrl+F10', 'Alt+F10'] }
    const customConflicts = deriveShortcutConflicts(custom)
    expect(keyDisplayShortcut(['Alt', 'F10'], custom, customConflicts)).toBe('undo')
    expect(keyDisplayShortcut(['Control', 'z'], custom, customConflicts)).toBeUndefined()
  })

  it('does not show an action for unknown keys or multiple ordinary keys', () => {
    expect(keyDisplayShortcut(['F24'], shortcuts, conflicts)).toBeUndefined()
    expect(keyDisplayShortcut(['Control', 'z', 's'], shortcuts, conflicts)).toBeUndefined()
    expect(keyDisplayShortcut([], shortcuts, conflicts)).toBeUndefined()
  })

  it('uses the winning action when configured shortcuts conflict', () => {
    const custom = { ...shortcuts, 'tool.zoom': ['Ctrl+Z'] }
    const customConflicts = deriveShortcutConflicts(custom)
    expect(customConflicts.blockedBindings['tool.zoom']).toBeDefined()
    expect(keyDisplayShortcut(['Control', 'z'], custom, customConflicts)).toBe('undo')
  })
})

describe('key display labels', () => {
  it('uses compact labels for common modifier and navigation keys', () => {
    expect(keyDisplayLabel('Control')).toBe('Ctrl')
    expect(keyDisplayLabel('ArrowLeft')).toBe('←')
    expect(keyDisplayLabel(' ')).toBe('Space')
  })

  it('normalizes printable keys without changing longer names', () => {
    expect(keyDisplayLabel('a')).toBe('A')
    expect(keyDisplayLabel('F12')).toBe('F12')
  })

  it('accepts active-document keyboard input without requiring pointer hover', () => {
    expect(keyDisplayKeydownAccepted({
      isTrusted: true,
      syntheticWheelWithModifier: false,
      enabled: true,
      activeDocument: true,
      repeat: false,
      blockedTarget: false
    })).toBe(true)
    expect(keyDisplayKeydownAccepted({
      isTrusted: true,
      syntheticWheelWithModifier: false,
      enabled: true,
      activeDocument: true,
      repeat: false,
      blockedTarget: true
    })).toBe(false)
  })
})
