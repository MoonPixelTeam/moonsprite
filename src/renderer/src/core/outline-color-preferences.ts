import type { RgbaColor } from '@shared/types-color'
import { normalizeOutlineSettings } from './outline-settings'
import { readStoredJson, writeStoredJson } from './storage'

export const OUTLINE_COLOR_PREFERENCE_KEY = 'moonsprite.outline-color.v1'

export function loadOutlineColorPreferences(foreground: RgbaColor): { rememberLastSelectedColor: boolean; color: RgbaColor } {
  const saved = readStoredJson<{ rememberLastSelectedColor?: boolean; color?: RgbaColor } | null>(OUTLINE_COLOR_PREFERENCE_KEY, null)
  const rememberLastSelectedColor = saved?.rememberLastSelectedColor === true
  const color = rememberLastSelectedColor ? normalizeOutlineSettings(saved, foreground)!.color : foreground
  return { rememberLastSelectedColor, color: { ...color } }
}

export function saveOutlineColorPreferences(rememberLastSelectedColor: boolean, color: RgbaColor): void {
  if (!writeStoredJson(OUTLINE_COLOR_PREFERENCE_KEY, { rememberLastSelectedColor, color })) {
    console.warn('Unable to save outline color preferences to local storage.')
  }
}
