import { beforeEach, expect, it } from 'vitest'
import { hideGradientMapBuiltin, loadHiddenGradientMapPresets, deleteGradientMapPreset, GRADIENT_MAP_BUILTINS, GRADIENT_MAP_PRESETS_KEY, loadGradientMapPresets, saveGradientMapPreset } from './gradient-map-presets'

beforeEach(() => localStorage.clear())
it('persists independent copies of the entire mapping settings and merges newly saved presets', () => {
  const settings = { ...GRADIENT_MAP_BUILTINS[1].settings, reverse: true, dither: 'bayer-4' as const, mode: 'steps' as const }
  saveGradientMapPreset('Silver', settings)
  saveGradientMapPreset('Gold', GRADIENT_MAP_BUILTINS[2].settings)
  const loaded = loadGradientMapPresets()
  expect(loaded.map(preset => preset.name)).toEqual(['Silver', 'Gold'])
  expect(loaded[0].settings).toEqual(settings)
  loaded[0].settings.stops[0].color.r = 255
  expect(loadGradientMapPresets()[0].settings).toEqual(settings)
})
it('keeps corrupt stored data intact and reports read/write errors', () => {
  localStorage.setItem(GRADIENT_MAP_PRESETS_KEY, 'broken')
  expect(() => saveGradientMapPreset('New', GRADIENT_MAP_BUILTINS[0].settings)).toThrow()
  expect(localStorage.getItem(GRADIENT_MAP_PRESETS_KEY)).toBe('broken')
  expect(() => saveGradientMapPreset('New', GRADIENT_MAP_BUILTINS[0].settings, { getItem: () => null, setItem: () => { throw new Error('quota') } })).toThrow('quota')
})

it('deletes only the requested saved preset and keeps the rest after reopening', () => {
  saveGradientMapPreset('Silver', GRADIENT_MAP_BUILTINS[1].settings)
  saveGradientMapPreset('Gold', GRADIENT_MAP_BUILTINS[2].settings)
  deleteGradientMapPreset('Silver')
  expect(loadGradientMapPresets().map(preset => preset.name)).toEqual(['Gold'])
})

it('remembers removed built-in presets without modifying their definitions', () => {
  hideGradientMapBuiltin('gradientMap.silver')
  expect(loadHiddenGradientMapPresets()).toEqual(['gradientMap.silver'])
  expect(GRADIENT_MAP_BUILTINS.some(preset => preset.nameKey === 'gradientMap.silver')).toBe(true)
  expect(loadGradientMapPresets()).toEqual([])
})
