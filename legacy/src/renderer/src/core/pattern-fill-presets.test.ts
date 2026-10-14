import { afterEach, expect, it, vi } from 'vitest'
import { DEFAULT_FILL_PATTERN_SETTINGS as defaults } from './pattern-fill-settings'
import { deleteFillPatternPreset, FILL_PATTERN_PRESETS_KEY, loadFillPatternPresets, saveFillPatternPreset } from './pattern-fill-presets'

afterEach(() => { localStorage.clear(); vi.restoreAllMocks() })
it('loads legacy presets without retaining retired settings', () => {
  const [preset] = saveFillPatternPreset('random', 'Legacy', defaults)
  localStorage.setItem(FILL_PATTERN_PRESETS_KEY, JSON.stringify({ version: 1, presets: [{ ...preset, settings: { ...preset.settings, randomScaleMin: 20, randomRotate: true, randomColor: 80 } }] }))
  expect(loadFillPatternPresets()).toEqual([preset])
  saveFillPatternPreset('random', 'Legacy', defaults, preset.id)
  expect(JSON.parse(localStorage.getItem(FILL_PATTERN_PRESETS_KEY)!).presets).toEqual([preset])
})
it('persists mode-specific settings, updates by id, and preserves other presets on delete', () => {
  const [random] = saveFillPatternPreset('random', ' Scatter ', { ...defaults, randomDensity: 37 })
  saveFillPatternPreset('regular', 'Scatter', { ...defaults, regularRowOffset: 50 })
  saveFillPatternPreset('random', 'Renamed', { ...defaults, randomDensity: 85 }, random.id)
  const loaded = loadFillPatternPresets()
  expect(loaded[0]).toMatchObject({ id: random.id, name: 'Renamed', settings: { randomDensity: 85 } })
  expect(loaded[0].settings).not.toHaveProperty('regularRowOffset')
  expect(deleteFillPatternPreset(random.id)).toEqual([loaded[1]])
  expect(loadFillPatternPresets()).toEqual([loaded[1]])
})
it('rejects duplicate names without replacing existing settings', () => {
  saveFillPatternPreset('random', 'Scatter', defaults)
  const before = localStorage.getItem(FILL_PATTERN_PRESETS_KEY)
  expect(() => saveFillPatternPreset('random', ' scatter ', { ...defaults, randomDensity: 3 })).toThrow()
  expect(localStorage.getItem(FILL_PATTERN_PRESETS_KEY)).toBe(before)
})
it.each(['{broken', '{"version":2,"presets":[]}', '{"version":1,"presets":[{"id":"x","name":"X","mode":"random","settings":{}}]}'])('preserves unreadable or future storage: %s', raw => {
  localStorage.setItem(FILL_PATTERN_PRESETS_KEY, raw)
  expect(() => loadFillPatternPresets()).toThrow()
  expect(() => saveFillPatternPreset('regular', 'New', defaults)).toThrow()
  expect(() => deleteFillPatternPreset('x')).toThrow()
  expect(localStorage.getItem(FILL_PATTERN_PRESETS_KEY)).toBe(raw)
})
it('reports failed writes and keeps the previous library', () => {
  saveFillPatternPreset('random', 'First', defaults)
  const before = localStorage.getItem(FILL_PATTERN_PRESETS_KEY)
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
  expect(() => saveFillPatternPreset('regular', 'Second', defaults)).toThrow()
  expect(localStorage.getItem(FILL_PATTERN_PRESETS_KEY)).toBe(before)
})
