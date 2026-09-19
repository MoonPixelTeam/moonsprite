import { describe, expect, it } from 'vitest'
import { clearStoredValuesExcept } from './storage'
import {
  ACTIVE_WORKSPACE_STORAGE_KEY,
  BOTTOM_DOCK_HEIGHT_STORAGE_KEY,
  COLOR_SQUARE_DOCK_STORAGE_KEY,
  LEFT_DOCK_WIDTH_STORAGE_KEY,
  DEFAULT_PANEL_DOCKS,
  DEFAULT_PANEL_VISIBILITY,
  FLOATING_PANEL_STORAGE_KEYS,
  MAIN_WINDOW_STORAGE_KEY,
  PANEL_DOCKS_STORAGE_KEY,
  PANEL_VISIBILITY_STORAGE_KEY,
  POPUP_PANEL_STORAGE_KEYS,
  TOOL_RAIL_SIDE_STORAGE_KEY,
  WORKSPACE_LAYOUT_STORAGE_KEYS,
  constrainLeftDockWidth,
  loadLeftDockWidth
} from './workspace-layout-preferences'
import { DEFAULT_INSPECTOR_ORDER } from './panel-layout'

const memoryStorage = (): Storage => {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value) },
    removeItem: (key) => { values.delete(key) },
    clear: () => { values.clear() },
    key: (index) => [...values.keys()][index] ?? null,
    get length() { return values.size }
  }
}

describe('workspace layout storage boundary', () => {
  it('allows the left dock to use the full available width without arbitrary limits', () => {
    const storage = memoryStorage()
    storage.setItem(LEFT_DOCK_WIDTH_STORAGE_KEY, '960')

    expect(loadLeftDockWidth(storage)).toBe(960)
    expect(constrainLeftDockWidth(4, 1200)).toBe(4)
    expect(constrainLeftDockWidth(960, 1200)).toBe(960)
    expect(constrainLeftDockWidth(1400, 1200)).toBe(1200)
  })

  it('preserves every workspace layout value while unrelated preferences are cleared', () => {
    const storage = memoryStorage()
    for (const key of WORKSPACE_LAYOUT_STORAGE_KEYS) storage.setItem(key, `layout:${key}`)
    storage.setItem('moonsprite.preference.example', 'reset-me')

    clearStoredValuesExcept(WORKSPACE_LAYOUT_STORAGE_KEYS, storage)

    for (const key of WORKSPACE_LAYOUT_STORAGE_KEYS) expect(storage.getItem(key)).toBe(`layout:${key}`)
    expect(storage.getItem('moonsprite.preference.example')).toBeNull()
  })

  it('covers the persisted workspace identity, panel placement, window, and detached panel positions', () => {
    const keys = new Set<string>(WORKSPACE_LAYOUT_STORAGE_KEYS)
    const requiredKeys = [
      ACTIVE_WORKSPACE_STORAGE_KEY,
      MAIN_WINDOW_STORAGE_KEY,
      PANEL_DOCKS_STORAGE_KEY,
      PANEL_VISIBILITY_STORAGE_KEY,
      BOTTOM_DOCK_HEIGHT_STORAGE_KEY,
      TOOL_RAIL_SIDE_STORAGE_KEY,
      COLOR_SQUARE_DOCK_STORAGE_KEY,
      ...Object.values(FLOATING_PANEL_STORAGE_KEYS),
      ...Object.values(POPUP_PANEL_STORAGE_KEYS)
    ]
    for (const key of requiredKeys) expect(keys.has(key)).toBe(true)
  })

  it('keeps the built-in workspace compact with preview below history and brushes hidden', () => {
    expect(DEFAULT_PANEL_DOCKS.preview).toBe('right')
    expect(DEFAULT_PANEL_VISIBILITY.brushes).toBe(false)
    expect(DEFAULT_INSPECTOR_ORDER.indexOf('preview')).toBe(DEFAULT_INSPECTOR_ORDER.indexOf('history') + 1)
  })
})
