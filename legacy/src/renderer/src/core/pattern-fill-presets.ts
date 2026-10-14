import type { FillPatternSettings } from '@shared/types-brush'
import { DEFAULT_FILL_PATTERN_SETTINGS, normalizeFillPatternSettings } from './pattern-fill-settings'
import { createId } from './document-model'
import { translateCurrent as tr, type TranslationKey } from './localization'
import { getStorage, writeStoredJson } from './storage'

export type PatternPresetMode = 'random' | 'regular'
export interface FillPatternPreset { id: string; name: string; mode: PatternPresetMode; settings: Partial<FillPatternSettings> }
export const FILL_PATTERN_PRESETS_KEY = 'moonsprite.fill-pattern-presets.v1'
export function patternModeSettings(mode: PatternPresetMode, settings: FillPatternSettings): Partial<FillPatternSettings> {
  return Object.fromEntries(Object.entries(settings).filter(([key]) => key.startsWith(mode)))
}
const builtin = (id: string, mode: PatternPresetMode, label: TranslationKey, patch: Partial<FillPatternSettings>) => ({
  id, mode, label, settings: patternModeSettings(mode, normalizeFillPatternSettings(patch))
})
export const BUILTIN_FILL_PATTERN_PRESETS = [
  builtin('natural', 'random', 'toolOptions.fillPresetNatural', {}),
  builtin('sparse', 'random', 'toolOptions.fillPresetSparse', { randomDensity: 25, randomOverlap: false }),
  builtin('dense', 'random', 'toolOptions.fillPresetDense', { randomDensity: 250 }),
  builtin('tiles', 'regular', 'toolOptions.fillPresetTiles', {}),
  builtin('wide-spaced', 'regular', 'toolOptions.fillPresetWideSpaced', { regularSpacingX: 8, regularSpacingY: 8 }),
  builtin('spaced', 'regular', 'toolOptions.fillPresetSpaced', { regularSpacingX: 4, regularSpacingY: 4 })
]

function validSettings(mode: PatternPresetMode, settings: unknown): settings is Partial<FillPatternSettings> {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return false
  const expected = patternModeSettings(mode, DEFAULT_FILL_PATTERN_SETTINGS)
  const normalized = normalizeFillPatternSettings(settings)
  return Object.entries(expected).every(([key, value]) =>
    key in settings && typeof settings[key as keyof typeof settings] === typeof value
    && settings[key as keyof typeof settings] === normalized[key as keyof FillPatternSettings])
}

/** Fail visibly on unreadable libraries; never replace user presets with an empty fallback. */
export function loadFillPatternPresets(storage?: Storage): FillPatternPreset[] {
  try {
    const target = getStorage(storage)
    if (!target) throw new Error('Storage unavailable')
    const raw = target.getItem(FILL_PATTERN_PRESETS_KEY)
    if (raw === null) return []
    const data = JSON.parse(raw)
    if (data?.version !== 1 || !Array.isArray(data.presets) || data.presets.length > 64) throw new Error('Invalid library')
    const ids = new Set<string>(), names = new Set<string>()
    for (const item of data.presets) {
      if (!item || (item.mode !== 'random' && item.mode !== 'regular') || typeof item.id !== 'string' || !item.id || item.id.length > 100
        || typeof item.name !== 'string' || !item.name.trim() || item.name !== item.name.trim() || item.name.length > 80
        || !validSettings(item.mode, item.settings) || ids.has(item.id) || names.has(item.mode + ':' + item.name.toLowerCase())) throw new Error('Invalid preset')
      ids.add(item.id); names.add(item.mode + ':' + item.name.toLowerCase())
    }
    return data.presets.map((preset: FillPatternPreset) => ({ ...preset, settings: patternModeSettings(preset.mode, normalizeFillPatternSettings(preset.settings)) }))
  } catch { throw new Error(tr('toolOptions.fillPresetReadFailed')) }
}

export function saveFillPatternPreset(mode: PatternPresetMode, name: string, settings: FillPatternSettings, id?: string, storage?: Storage): FillPatternPreset[] {
  const trimmed = name.trim()
  if (!trimmed || trimmed.length > 80) throw new Error(tr('toolOptions.fillPresetNameInvalid'))
  const presets = loadFillPatternPresets(storage)
  if (id && !presets.some(p => p.id === id && p.mode === mode)) throw new Error(tr('toolOptions.fillPresetReadFailed'))
  if (presets.some(p => p.mode === mode && p.id !== id && p.name.toLowerCase() === trimmed.toLowerCase())) throw new Error(tr('toolOptions.fillPresetNameExists'))
  if (!id && presets.length >= 64) throw new Error(tr('toolOptions.fillPresetFull'))
  const preset = { id: id ?? createId('fill-preset'), name: trimmed, mode, settings: patternModeSettings(mode, normalizeFillPatternSettings(settings)) }
  const next = id ? presets.map(p => p.id === id ? preset : p) : [...presets, preset]
  if (!writeStoredJson(FILL_PATTERN_PRESETS_KEY, { version: 1, presets: next }, storage)) throw new Error(tr('toolOptions.fillPresetSaveFailed'))
  return next
}

export function deleteFillPatternPreset(id: string, storage?: Storage): FillPatternPreset[] {
  const next = loadFillPatternPresets(storage).filter(p => p.id !== id)
  if (!writeStoredJson(FILL_PATTERN_PRESETS_KEY, { version: 1, presets: next }, storage)) throw new Error(tr('toolOptions.fillPresetSaveFailed'))
  return next
}
