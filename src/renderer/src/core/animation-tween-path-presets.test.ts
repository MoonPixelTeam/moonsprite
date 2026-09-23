import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { loadTweenPathPresets, saveTweenPathPreset, TWEEN_PATH_PRESETS_KEY } from './animation-tween-path-presets'

const path = [{ x: 0, y: 0 }, { x: 12, y: -4 }, { x: 24, y: 8 }]
beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

it('persists named relative paths and returns independent copies without an anchor', () => {
  const input = path.map((point) => ({ ...point }))
  const saved = saveTweenPathPreset('  Jump  ', input)
  input[1].x = 900
  saved[0].path[2].y = 900
  const reopened = loadTweenPathPresets()
  expect(reopened[0]).toEqual({ id: expect.any(String), name: 'Jump', path })
  expect(reopened[0]).not.toHaveProperty('anchor')
  reopened[0].path[1].x = 600
  expect(loadTweenPathPresets()[0].path).toEqual(path)
})

it('merges the latest library and rejects duplicate names without replacing any path', () => {
  saveTweenPathPreset('Jump', path)
  saveTweenPathPreset('Walk', path)
  const before = localStorage.getItem(TWEEN_PATH_PRESETS_KEY)
  expect(() => saveTweenPathPreset(' jump ', [{ x: 0, y: 0 }, { x: 90, y: 0 }])).toThrow()
  expect(localStorage.getItem(TWEEN_PATH_PRESETS_KEY)).toBe(before)
  expect(loadTweenPathPresets().map((item) => item.name)).toEqual(['Jump', 'Walk'])
})

it.each(['{bad json', '{"version":2,"paths":[]}', '{"version":1,"paths":[{"id":"x","name":"bad","path":[{"x":1,"y":1}]}]}'])('preserves unreadable stored data: %s', (raw) => {
  localStorage.setItem(TWEEN_PATH_PRESETS_KEY, raw)
  expect(() => loadTweenPathPresets()).toThrow()
  expect(() => saveTweenPathPreset('New', path)).toThrow()
  expect(localStorage.getItem(TWEEN_PATH_PRESETS_KEY)).toBe(raw)
})

it('reports storage quota failures and preserves the previous library', () => {
  saveTweenPathPreset('First', path)
  const before = localStorage.getItem(TWEEN_PATH_PRESETS_KEY)
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError') })
  expect(() => saveTweenPathPreset('Second', path)).toThrow()
  expect(localStorage.getItem(TWEEN_PATH_PRESETS_KEY)).toBe(before)
})

it('rejects empty, fractional, oversized and malformed paths before saving', () => {
  for (const invalid of [[], [{ x: 0, y: 0 }], [{ x: 1, y: 0 }, { x: 2, y: 0 }], [{ x: 0, y: 0 }, { x: 0.5, y: 0 }], [{ x: 0, y: 0 }, { x: 20000, y: 0 }], Array.from({ length: 2049 }, (_, x) => ({ x, y: 0 }))]) {
    expect(() => saveTweenPathPreset('Invalid', invalid)).toThrow()
  }
  expect(() => saveTweenPathPreset(' ', path)).toThrow()
  expect(loadTweenPathPresets()).toEqual([])
})
