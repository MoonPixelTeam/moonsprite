import { describe, expect, it } from 'vitest'
import {
  DEFAULT_EDITOR_PREFERENCES,
  DEFAULT_ISO_VIEW_PREFERENCES,
  EXPORT_FORMAT_PREFERENCE_KEY,
  MOVE_LAYER_CLICK_FLASH_DURATION_PREFERENCE_KEY,
  SAVE_FORMAT_PREFERENCE_KEY,
  imageExportKindForPreference,
  loadEditorPreferences,
  parseEyedropperMagnifierSize,
  parseIsoViewPreferences,
  parseMoveLayerClickFlashDuration,
  parseUiScale,
  parseViewDragSensitivity,
  saveEditorPreferences,
  saveImageKindForPreference
} from './file-preferences'

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

describe('editor preferences boundary', () => {
  it('keeps project saves separate from supported image exports', () => {
    expect(saveImageKindForPreference('moonsprite')).toBeNull()
    expect(saveImageKindForPreference('psd')).toBe('psd')
    expect(imageExportKindForPreference('png')).toBe('png-auto')
    expect(imageExportKindForPreference('psd')).toBe('psd')
    expect(imageExportKindForPreference('unsupported')).toBe('png-auto')
  })

  it('loads stable defaults and clamps the preferences added by the editor', () => {
    const preferences = loadEditorPreferences(memoryStorage())
    expect(preferences).toMatchObject({
      saveFormat: DEFAULT_EDITOR_PREFERENCES.saveFormat,
      exportFormat: DEFAULT_EDITOR_PREFERENCES.exportFormat,
      uiScale: 1,
      viewDragSensitivity: 1,
      moveLayerClickFlashDuration: 120,
      gradientLineVisible: true,
      gradientLineColor: DEFAULT_EDITOR_PREFERENCES.gradientLineColor,
      isoView: DEFAULT_ISO_VIEW_PREFERENCES
    })
    expect(parseUiScale('1.25')).toBe(1)
    expect(parseViewDragSensitivity('1.25')).toBe(1)
    expect(parseEyedropperMagnifierSize('2')).toBe(1)
    expect(parseMoveLayerClickFlashDuration('240')).toBe(120)
  })

  it('normalizes ISO settings and keeps solid and pixel guide colors independent', () => {
    const parsed = parseIsoViewPreferences(JSON.stringify({
      guideLineStyle: 'pixel',
      guideOriginX: 12.9,
      guideOriginY: -4.9,
      guideUnitSize: 999,
      guideThickness: 20,
      guideColors: {
        solid: { r: 1, g: 2, b: 3, a: 40 },
        pixel: { r: 4, g: 5, b: 6, a: 10 }
      },
      snapToGrid: true
    }))
    expect(parsed).toMatchObject({
      guideLineStyle: 'pixel',
      guideOriginX: 12,
      guideOriginY: -4,
      guideUnitSize: 256,
      guideThickness: 8,
      snapToGrid: true,
      guideColors: {
        solid: { r: 1, g: 2, b: 3, a: 40 },
        pixel: { r: 4, g: 5, b: 6, a: 10 }
      }
    })
  })

  it('round-trips representative paths and motion settings through storage', () => {
    const storage = memoryStorage()
    saveEditorPreferences({
      ...DEFAULT_EDITOR_PREFERENCES,
      saveFormat: 'psd',
      exportFormat: 'psd',
      uiScale: 1.5,
      viewDragSensitivity: 1.5,
      moveLayerClickFlashDuration: 80,
      gradientLineVisible: false,
      gradientLineColor: { r: 12, g: 34, b: 56, a: 78 },
      isoView: { ...DEFAULT_EDITOR_PREFERENCES.isoView, snapToGrid: true }
    }, storage)

    const loaded = loadEditorPreferences(storage)
    expect(loaded.saveFormat).toBe('psd')
    expect(loaded.exportFormat).toBe('psd')
    expect(loaded.uiScale).toBe(1.5)
    expect(loaded.viewDragSensitivity).toBe(1.5)
    expect(loaded.moveLayerClickFlashDuration).toBe(80)
    expect(loaded.gradientLineVisible).toBe(false)
    expect(loaded.gradientLineColor).toEqual({ r: 12, g: 34, b: 56, a: 78 })
    expect(loaded.isoView.snapToGrid).toBe(true)
    expect(storage.getItem(SAVE_FORMAT_PREFERENCE_KEY)).toBe('psd')
    expect(storage.getItem(EXPORT_FORMAT_PREFERENCE_KEY)).toBe('psd')
    expect(storage.getItem(MOVE_LAYER_CLICK_FLASH_DURATION_PREFERENCE_KEY)).toBe('80')
  })
})
