import type { FillPatternSettings } from '@shared/types-brush'

export const MAX_PATTERN_STAMPS = 100000
export const DEFAULT_FILL_PATTERN_SETTINGS: FillPatternSettings = {
  randomDensity: 100, randomCount: 0, randomSpacing: 0, randomOverlap: true,
  regularCount: 0, regularSpacingX: 0, regularSpacingY: 0,
  regularOverlap: false, regularRowOffset: 0
}

export function normalizeFillPatternSettings(patch?: Partial<FillPatternSettings> | null, fallback = DEFAULT_FILL_PATTERN_SETTINGS): FillPatternSettings {
  const number = (key: keyof FillPatternSettings, min: number, max: number): number => {
    const value = patch?.[key]
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(value))) : fallback[key] as number
  }
  const bool = (key: 'randomOverlap' | 'regularOverlap'): boolean => typeof patch?.[key] === 'boolean' ? patch[key] : fallback[key]
  return {
    randomDensity: number('randomDensity', 0, 1000),
    randomCount: number('randomCount', 0, MAX_PATTERN_STAMPS), randomSpacing: number('randomSpacing', 0, 4096),
    randomOverlap: bool('randomOverlap'),
    regularCount: number('regularCount', 0, MAX_PATTERN_STAMPS),
    regularSpacingX: number('regularSpacingX', -4096, 4096), regularSpacingY: number('regularSpacingY', -4096, 4096),
    regularOverlap: bool('regularOverlap'), regularRowOffset: number('regularRowOffset', 0, 100)
  }
}
