import { beforeEach, expect, it, vi } from 'vitest'
import { loadOutlineColorPreferences, OUTLINE_COLOR_PREFERENCE_KEY, saveOutlineColorPreferences } from './outline-color-preferences'

const foreground = { r: 12, g: 34, b: 56, a: 255 }
const chosen = { r: 200, g: 150, b: 100, a: 128 }
beforeEach(() => localStorage.clear())

it('defaults to the current foreground with remembering disabled', () => {
  expect(loadOutlineColorPreferences(foreground)).toEqual({ rememberLastSelectedColor: false, color: foreground })
  saveOutlineColorPreferences(false, chosen)
  expect(loadOutlineColorPreferences(foreground).color).toEqual(foreground)
  expect(loadOutlineColorPreferences(chosen).color).toEqual(chosen)
})

it('restores the last selected color only while enabled, independently of foreground changes', () => {
  saveOutlineColorPreferences(true, chosen)
  const restored = loadOutlineColorPreferences(foreground)
  expect(restored).toEqual({ rememberLastSelectedColor: true, color: chosen })
  restored.color.r = 0
  expect(loadOutlineColorPreferences(foreground).color).toEqual(chosen)
  saveOutlineColorPreferences(false, foreground)
  expect(loadOutlineColorPreferences(chosen)).toEqual({ rememberLastSelectedColor: false, color: chosen })
})

it('falls back safely for corrupt preferences and missing remembered colors', () => {
  localStorage.setItem(OUTLINE_COLOR_PREFERENCE_KEY, '{')
  expect(loadOutlineColorPreferences(foreground).color).toEqual(foreground)
  localStorage.setItem(OUTLINE_COLOR_PREFERENCE_KEY, JSON.stringify({ rememberLastSelectedColor: true }))
  expect(loadOutlineColorPreferences(foreground).color).toEqual(foreground)
})

it('reports persistence failures', () => {
  const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Full') })
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
  try {
    saveOutlineColorPreferences(true, chosen)
    expect(warning).toHaveBeenCalledOnce()
  } finally { write.mockRestore(); warning.mockRestore() }
})
