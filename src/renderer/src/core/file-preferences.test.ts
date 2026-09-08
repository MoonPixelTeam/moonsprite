import { describe, expect, it } from 'vitest'
import {
  DEFAULT_EDITOR_PREFERENCES,
  DEFAULT_ISO_VIEW_PREFERENCES,
  ANIMATION_PLAYBACK_MODE_PREFERENCE_KEY,
  ANIMATION_PLAYBACK_RATE_PREFERENCE_KEY,
  ANIMATION_RETURN_TO_START_PREFERENCE_KEY,
  SKIP_DISABLED_FRAMES_PREFERENCE_KEY,
  EXPORT_FORMAT_PREFERENCE_KEY,
  MOVE_LAYER_CLICK_FLASH_DURATION_PREFERENCE_KEY,
  SAVE_FORMAT_PREFERENCE_KEY,
  imageExportKindForPreference,
  loadEditorPreferences,
  parseTabletPreferences,
  parseEyedropperMagnifierSize,
  parseIsoViewPreferences,
  parseMoveLayerClickFlashDuration,
  parseOutlineSettingsPreference,
  parseUiScale,
  parseViewDragSensitivity,
  saveEditorPreferences,
  saveImageKindForPreference
} from './file-preferences'
import { defaultOutlineSettings } from './outline-settings'

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
  it('keeps tablet settings backward compatible and normalizes unsupported values', () => {
    expect(parseTabletPreferences(null)).toEqual(DEFAULT_EDITOR_PREFERENCES.tablet)
    expect(parseTabletPreferences(JSON.stringify({ api: 'invalid', touchMode: 'invalid', barrelButtonAction: 'invalid', pressureEnabled: false, twoFingerZoomEnabled: false }))).toMatchObject({
      api: 'auto',
      touchMode: 'navigate',
      barrelButtonAction: 'eraser',
      pressureEnabled: false,
      twoFingerZoomEnabled: false
    })
  })

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

  it('persists the last-used outline settings as a software preference', () => {
    const storage = memoryStorage()
    const outlineSettings = {
      ...defaultOutlineSettings({ r: 255, g: 0, b: 0, a: 255 }),
      color: { r: 12, g: 34, b: 56, a: 200 },
      thickness: 3,
      position: 'inside' as const
    }
    saveEditorPreferences({ ...DEFAULT_EDITOR_PREFERENCES, outlineSettings }, storage)
    expect(loadEditorPreferences(storage).outlineSettings).toMatchObject(outlineSettings)
    expect(parseOutlineSettingsPreference(null)).toBeNull()
    expect(parseOutlineSettingsPreference('{bad json')).toBeNull()
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
      animationPlaybackRate: 1.5,
      animationPlaybackMode: 'tag',
      animationReturnToStart: true,
      skipDisabledFrames: false,
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
    expect(loaded.animationPlaybackRate).toBe(1.5)
    expect(loaded.animationPlaybackMode).toBe('tag')
    expect(loaded.animationReturnToStart).toBe(true)
    expect(loaded.skipDisabledFrames).toBe(false)
    expect(loaded.isoView.snapToGrid).toBe(true)
    expect(storage.getItem(SAVE_FORMAT_PREFERENCE_KEY)).toBe('psd')
    expect(storage.getItem(EXPORT_FORMAT_PREFERENCE_KEY)).toBe('psd')
    expect(storage.getItem(MOVE_LAYER_CLICK_FLASH_DURATION_PREFERENCE_KEY)).toBe('80')
    expect(storage.getItem(ANIMATION_PLAYBACK_RATE_PREFERENCE_KEY)).toBe('1.5')
    expect(storage.getItem(ANIMATION_PLAYBACK_MODE_PREFERENCE_KEY)).toBe('tag')
    expect(storage.getItem(ANIMATION_RETURN_TO_START_PREFERENCE_KEY)).toBe('true')
    expect(storage.getItem(SKIP_DISABLED_FRAMES_PREFERENCE_KEY)).toBe('false')
  })
})
