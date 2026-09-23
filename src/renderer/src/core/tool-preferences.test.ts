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
      brushOpacity: 100,
      brushPaintMode: 'paint',
      drawFromCanvasCenter: false,
      shapeRounded: false,
      selectionRounded: false,
      selectionRotationAlgorithm: 'fast',
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
      brushOpacity: 42,
      lineKind: 'curve',
      curveAnchorCount: 6,
      drawingAnchor: { x: 0.25, y: 0.75 },
      drawingAnchorVisible: false,
      drawFromCanvasCenter: true,
      shapeRounded: true,
      shapeCornerRadius: 12,
      selectionRounded: true,
      selectionCornerRadius: 7,
      selectionRotationAlgorithm: 'rotsprite',
      gradientType: 'radial'
    }, storage)

    expect(loadToolSettings(storage)).toMatchObject({
      shapeKind: 'polygon',
      brushOpacity: 42,
      lineKind: 'curve',
      curveAnchorCount: 6,
      drawingAnchor: { x: 0.25, y: 0.75 },
      drawingAnchorVisible: false,
      drawFromCanvasCenter: true,
      shapeRounded: true,
      shapeCornerRadius: 12,
      selectionRounded: true,
      selectionCornerRadius: 7,
      selectionRotationAlgorithm: 'rotsprite',
      gradientType: 'radial'
    })
  })




})
