import { describe, expect, it } from 'vitest'
import { DEFAULT_LAYER_QUICK_ACTIONS, LAYER_QUICK_ACTIONS_STORAGE_KEY, loadLayerQuickActions, normalizeLayerQuickActions, saveLayerQuickActions } from './layer-panel-preferences'

const memoryStorage = (): Storage => {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value) },
    removeItem: (key) => { values.delete(key) },
    clear: () => { values.clear() },
    key: (index) => [...values.keys()][index] ?? null,
    get length() { return values.size }
  }
}

describe('layer quick actions preferences', () => {
  it('keeps the existing five layer header commands enabled by default', () => {
    expect(loadLayerQuickActions()).toEqual(DEFAULT_LAYER_QUICK_ACTIONS)
  })

  it('drops invalid and duplicate actions while retaining newly added commands', () => {
    const actions = normalizeLayerQuickActions([
      { id: 'deleteLayer', enabled: true },
      { id: 'deleteLayer', enabled: false },
      { id: 'not-a-command', enabled: true },
      { id: 'newLayer', enabled: false }
    ])
    expect(actions.slice(0, 2)).toEqual([
      { id: 'deleteLayer', enabled: true },
      { id: 'newLayer', enabled: false }
    ])
    expect(actions).toHaveLength(DEFAULT_LAYER_QUICK_ACTIONS.length)
  })

  it('round-trips a reordered command list through storage', () => {
    const storage = memoryStorage()
    saveLayerQuickActions([{ id: 'deleteLayer', enabled: true }, { id: 'newLayer', enabled: true }], storage)
    expect(storage.getItem(LAYER_QUICK_ACTIONS_STORAGE_KEY)).toContain('deleteLayer')
    expect(loadLayerQuickActions(storage).slice(0, 2)).toEqual([
      { id: 'deleteLayer', enabled: true },
      { id: 'newLayer', enabled: true }
    ])
  })
})
