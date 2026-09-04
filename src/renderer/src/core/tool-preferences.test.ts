import { describe, expect, it } from 'vitest'
import { TOOL_SETTINGS_KEY, defaultToolSettings, loadToolSettings, saveToolSettings } from './tool-preferences'

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

describe('tool preferences boundary', () => {
  it('loads defaults and recovers from malformed persisted settings', () => {
    const storage = memoryStorage()
    expect(loadToolSettings(storage)).toMatchObject({
      brushSize: 1,
      brushPaintMode: 'paint',
      shapeRounded: false,
      selectionRounded: false,
      gradientType: 'linear'
    })
    storage.setItem(TOOL_SETTINGS_KEY, '{bad')
    expect(loadToolSettings(storage)).toMatchObject(defaultToolSettings)
  })

  it('round-trips the shape, selection and gradient controls together', () => {
    const storage = memoryStorage()
    saveToolSettings({
      ...defaultToolSettings,
      shapeKind: 'polygon',
      lineKind: 'curve',
      curveAnchorCount: 6,
      shapeRounded: true,
      shapeCornerRadius: 12,
      selectionRounded: true,
      selectionCornerRadius: 7,
      gradientType: 'radial'
    }, storage)

    expect(loadToolSettings(storage)).toMatchObject({
      shapeKind: 'polygon',
      lineKind: 'curve',
      curveAnchorCount: 6,
      shapeRounded: true,
      shapeCornerRadius: 12,
      selectionRounded: true,
      selectionCornerRadius: 7,
      gradientType: 'radial'
    })
  })




})
