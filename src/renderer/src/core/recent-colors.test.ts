import { beforeEach, expect, it, vi } from 'vitest'
import { loadRecentColors, rememberRecentColors, RECENT_COLORS_KEY } from './recent-colors'
import { persistColorRolePreferences, flushColorRolePreferences, DEFAULT_COLOR_ROLE_PREFERENCES } from './color-role-preferences'
import { loadEditorPreferences, saveEditorPreferences } from './file-preferences'
beforeEach(() => { flushColorRolePreferences(); localStorage.clear() })
it('keeps 24 unique RGBA colors, moving reused colors first and surviving reload', () => {
  const colors = Array.from({ length: 30 }, (_, r) => ({ r, g: 0, b: 0, a: 255 }))
  rememberRecentColors(colors)
  expect(loadRecentColors()).toHaveLength(24)
  rememberRecentColors([colors[10], { ...colors[10], a: 128 }])
  expect(loadRecentColors().slice(0, 2)).toEqual([{ ...colors[10], a: 128 }, colors[10]])
  expect(loadRecentColors().filter(color => color.r === 10 && color.a === 255)).toHaveLength(1)
})
it('does not record colors when selecting or persisting color roles', () => {
  vi.useFakeTimers()
  try {
    persistColorRolePreferences({ r: 1, g: 2, b: 3, a: 255 }, DEFAULT_COLOR_ROLE_PREFERENCES.secondary)
    persistColorRolePreferences({ r: 4, g: 5, b: 6, a: 255 }, DEFAULT_COLOR_ROLE_PREFERENCES.secondary)
    expect(loadRecentColors()).toEqual([])
    vi.advanceTimersByTime(100)
    expect(loadRecentColors()).toEqual([])
  } finally { vi.useRealTimers() }
})
it('rejects invalid saved data and defaults the visibility switch on', () => {
  localStorage.setItem(RECENT_COLORS_KEY, '[null,{"r":999}]')
  expect(loadRecentColors()).toEqual([])
  expect(loadEditorPreferences().recentColorsVisible).toBe(true)
  saveEditorPreferences({ ...loadEditorPreferences(), recentColorsVisible: false })
  expect(loadEditorPreferences().recentColorsVisible).toBe(false)
})
