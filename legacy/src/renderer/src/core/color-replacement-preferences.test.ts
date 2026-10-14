import { afterEach, expect, it } from 'vitest'
import { COLOR_REPLACEMENT_PREFERENCE_KEY, loadColorReplacementPreferences, saveColorReplacementPreferences, type ColorReplacementPreferences } from './color-replacement-preferences'

const fallback: ColorReplacementPreferences = {
  rememberLastSelectedColor: true,
  sourceColor: { r: 255, g: 0, b: 0, a: 255 }, replacementColor: { r: 0, g: 255, b: 0, a: 255 }, target: 'layers', previewEnabled: false
}
afterEach(() => localStorage.removeItem(COLOR_REPLACEMENT_PREFERENCE_KEY))

it('restores both colors, live preview, and scope independently of the next active swatches', () => {
  const saved: ColorReplacementPreferences = { ...fallback, target: 'frames', previewEnabled: true }
  saveColorReplacementPreferences(saved)
  expect(loadColorReplacementPreferences({ ...fallback, sourceColor: fallback.replacementColor })).toEqual(saved)
})

it('keeps unavailable scopes and validates corrupt stored settings', () => {
  saveColorReplacementPreferences({ ...fallback, target: 'loop-section:old-project' })
  expect(loadColorReplacementPreferences(fallback).target).toBe('loop-section:old-project')
  localStorage.setItem(COLOR_REPLACEMENT_PREFERENCE_KEY, JSON.stringify({ sourceColor: { r: -1 }, target: 'everything', previewEnabled: 'true' }))
  expect(loadColorReplacementPreferences(fallback)).toEqual(fallback)
})
