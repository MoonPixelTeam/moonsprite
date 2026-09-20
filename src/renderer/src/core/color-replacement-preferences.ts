import type { RgbaColor } from '@shared/types-color'
import { readStoredString, writeStoredString } from './storage'

export const COLOR_REPLACEMENT_PREFERENCE_KEY = 'moonsprite.color-replacement.v1'
export interface ColorReplacementPreferences {
  sourceColor: RgbaColor
  replacementColor: RgbaColor
  target: 'document' | 'selection' | 'layers' | 'frames' | 'cells' | 'palette' | `loop-section:${string}`
  previewEnabled: boolean
}
const validColor = (value: unknown): value is RgbaColor => Boolean(value && typeof value === 'object'
  && ['r', 'g', 'b', 'a'].every(key => {
    const channel = (value as Record<string, unknown>)[key]
    return typeof channel === 'number' && Number.isInteger(channel) && channel >= 0 && channel <= 255
  }))

export function loadColorReplacementPreferences(fallback: ColorReplacementPreferences): ColorReplacementPreferences {
  try {
    const saved = JSON.parse(readStoredString(COLOR_REPLACEMENT_PREFERENCE_KEY) ?? 'null')
    if (!saved || typeof saved !== 'object') return fallback
    return {
      sourceColor: validColor(saved.sourceColor) ? saved.sourceColor : fallback.sourceColor,
      replacementColor: validColor(saved.replacementColor) ? saved.replacementColor : fallback.replacementColor,
      target: typeof saved.target === 'string' && (['document', 'selection', 'layers', 'frames', 'cells', 'palette'].includes(saved.target) || saved.target.startsWith('loop-section:')) ? saved.target : fallback.target,
      previewEnabled: typeof saved.previewEnabled === 'boolean' ? saved.previewEnabled : fallback.previewEnabled
    }
  } catch { return fallback }
}

export function saveColorReplacementPreferences(preferences: ColorReplacementPreferences): void {
  if (!writeStoredString(COLOR_REPLACEMENT_PREFERENCE_KEY, JSON.stringify(preferences))) {
    console.warn('Unable to save color replacement preferences to local storage.')
  }
}
