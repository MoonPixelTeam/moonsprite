import type { RgbaColor } from '@shared/types-color'
import { readStoredJson, writeStoredJson } from './storage'
export const RECENT_COLORS_KEY = 'moonsprite.recent-colors.v1'
export const recentColorKey = (color: RgbaColor): string => `${color.r},${color.g},${color.b},${color.a}`
export function loadRecentColors(storage?: Storage): RgbaColor[] {
  const value = readStoredJson<unknown>(RECENT_COLORS_KEY, [], storage)
  if (!Array.isArray(value)) return []
  return value.filter((color): color is RgbaColor => color && ['r', 'g', 'b', 'a'].every(key => Number.isInteger(color[key]) && color[key] >= 0 && color[key] <= 255)).slice(0, 24)
}
export function rememberRecentColors(colors: RgbaColor[], storage?: Storage): void {
  let recent = loadRecentColors(storage)
  if (colors.length === 1 && recent[0] && recentColorKey(recent[0]) === recentColorKey(colors[0])) return
  for (const color of colors) recent = [{ ...color }, ...recent.filter(item => recentColorKey(item) !== recentColorKey(color))].slice(0, 24)
  writeStoredJson(RECENT_COLORS_KEY, recent, storage)
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('moonsprite:recent-colors-changed'))
}
