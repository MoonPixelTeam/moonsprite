import { afterEach, expect, it, vi } from 'vitest'
import { loadEditorPreferences, saveEditorPreferences } from './file-preferences'
import { applyThemeToDocument, installSystemThemeSync, normalizeThemePreferences, resolveTheme, type ThemePreferences } from './theme'

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear() })

it('persists opt-in and follows live system changes without replacing a manual theme', () => {
  let light = false
  const listeners = new Set<() => void>()
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    get matches() { return light },
    addEventListener: (_event: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_event: string, listener: () => void) => listeners.delete(listener)
  })))
  expect(normalizeThemePreferences({ activeThemeId: 'dark' }).followSystem).toBeUndefined()
  const initial = loadEditorPreferences()
  saveEditorPreferences({ ...initial, theme: { ...initial.theme, followSystem: true } })
  let preferences: ThemePreferences = loadEditorPreferences().theme
  expect(preferences.followSystem).toBe(true)
  applyThemeToDocument(preferences)
  expect(document.documentElement.dataset.themeId).toBe('dark')
  const changed = vi.fn()
  window.addEventListener('moonsprite:preferences-changed', changed)
  const dispose = installSystemThemeSync(() => preferences)
  try {
    light = true
    listeners.forEach(listener => listener())
    expect(document.documentElement.dataset.themeId).toBe('light')
    expect(resolveTheme(preferences).definition.id).toBe('light')
    expect(changed).toHaveBeenCalledTimes(1)
    light = false
    listeners.forEach(listener => listener())
    expect(document.documentElement.dataset.themeId).toBe('dark')
    preferences = { activeThemeId: 'light', customThemes: [] }
    applyThemeToDocument(preferences)
    listeners.forEach(listener => listener())
    expect(document.documentElement.dataset.themeId).toBe('light')
    expect(changed).toHaveBeenCalledTimes(2)
  } finally {
    dispose()
    window.removeEventListener('moonsprite:preferences-changed', changed)
  }
  expect(listeners.size).toBe(0)
})

it('falls back to DARK when system appearance is unavailable', () => {
  vi.stubGlobal('matchMedia', undefined)
  expect(resolveTheme({ activeThemeId: 'light', followSystem: true, customThemes: [] }).definition.id).toBe('dark')
  expect(() => installSystemThemeSync(() => ({ activeThemeId: 'dark', customThemes: [] }))()).not.toThrow()
})
