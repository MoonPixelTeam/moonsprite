import type { FillPatternSettings } from '@shared/types-brush'

export const MAX_PATTERN_STAMPS = 100000
export const DEFAULT_FILL_PATTERN_SETTINGS: FillPatternSettings = {
  randomSeed: 1, randomDensity: 100, randomCount: 0, randomSpacing: 0,
  randomScaleMin: 50, randomScaleMax: 150, randomRotate: true,
  randomAngle: 180, randomOverlap: true, randomColor: 0, randomBrightness: 0,
  regularCount: 0, regularScale: 100, regularSpacingX: 0, regularSpacingY: 0,
  regularAngle: 0, regularOverlap: false, regularRowOffset: 0
}

export function normalizeFillPatternSettings(patch?: Partial<FillPatternSettings> | null, fallback = DEFAULT_FILL_PATTERN_SETTINGS): FillPatternSettings {
  const number = (key: keyof FillPatternSettings, min: number, max: number): number => {
    const value = patch?.[key]
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(value))) : fallback[key] as number
  }
  const bool = (key: 'randomRotate' | 'randomOverlap' | 'regularOverlap'): boolean => typeof patch?.[key] === 'boolean' ? patch[key] : fallback[key]
  const scaleMin = number('randomScaleMin', 1, 1000)
  const scaleMax = number('randomScaleMax', 1, 1000)
  return {
    randomSeed: number('randomSeed', 0, 0x7fffffff), randomDensity: number('randomDensity', 0, 1000),
    randomCount: number('randomCount', 0, MAX_PATTERN_STAMPS), randomSpacing: number('randomSpacing', 0, 4096),
    randomScaleMin: Math.min(scaleMin, scaleMax), randomScaleMax: Math.max(scaleMin, scaleMax),
    randomRotate: bool('randomRotate'), randomAngle: number('randomAngle', 0, 180), randomOverlap: bool('randomOverlap'),
    randomColor: number('randomColor', 0, 100), randomBrightness: number('randomBrightness', 0, 100),
    regularCount: number('regularCount', 0, MAX_PATTERN_STAMPS), regularScale: number('regularScale', 1, 1000),
    regularSpacingX: number('regularSpacingX', -4096, 4096), regularSpacingY: number('regularSpacingY', -4096, 4096),
    regularAngle: number('regularAngle', -180, 180), regularOverlap: bool('regularOverlap'), regularRowOffset: number('regularRowOffset', 0, 100)
  }
}
