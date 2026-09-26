import { REFERENCE_SCALING_KEY } from './file-preferences'
import { DEFAULT_QUICK_COMMAND_BARS, parseQuickCommandBars } from './file-preferences'
import { describe, expect, it } from 'vitest'
it('uses named editing defaults and preserves custom quick command bars', () => {
  const bars = parseQuickCommandBars(null)
  expect(bars.map(bar => bar.name)).toEqual(['默认快捷指令栏', '编辑快捷指令栏', '快捷指令栏1', '快捷指令栏2'])
  expect(bars.map(bar => bar.edge)).toEqual(['top', 'none', 'none', 'none'])
  expect(bars[1].commands.filter(item => item.enabled).slice(0, 6).map(item => item.id)).toEqual(['undo', 'redo', 'cut', 'copy', 'copyMerged', 'paste'])
  const custom = structuredClone(DEFAULT_QUICK_COMMAND_BARS)
  custom[1].name = '我的编辑'
  custom[1].edge = 'left'
  custom[1].commands = custom[1].commands.map(item => ({ ...item, enabled: item.id === 'copy' }))
  expect(parseQuickCommandBars(JSON.stringify(custom))[1]).toEqual(custom[1])
  expect(parseQuickCommandBars(JSON.stringify(bars))).toEqual(bars)
})
import {
  DEFAULT_EDITOR_PREFERENCES,
  DEFAULT_ISO_VIEW_PREFERENCES,
  CANVAS_VIEW_SCROLLBARS_ENABLED_KEY,
  HISTORY_LIMIT_PREFERENCE_KEY,
  HISTORY_LIMIT_ENABLED_PREFERENCE_KEY,
  historyEntryLimit,
  ANIMATION_PLAYBACK_MODE_PREFERENCE_KEY,
  BODY_FONT_SCALE_PREFERENCE_KEY,
  ANIMATION_PLAYBACK_RATE_PREFERENCE_KEY,
  ANIMATION_RETURN_TO_START_PREFERENCE_KEY,
  SKIP_DISABLED_FRAMES_PREFERENCE_KEY,
  EXPORT_FORMAT_PREFERENCE_KEY,
  EYEDROPPER_QUICK_SELECT_PREFERENCE_KEY,
  KEY_DISPLAY_DURATION_PREFERENCE_KEY,
  TOOLTIPS_ENABLED_PREFERENCE_KEY,
  PROJECT_BACKUP_ENABLED_PREFERENCE_KEY,
  PROJECT_BACKUP_RETENTION_DAYS_PREFERENCE_KEY,
  PROJECT_BACKUP_DIRECTORY_PREFERENCE_KEY,
  PROJECT_BACKUP_VERSIONS_PREFERENCE_KEY,
  PASTE_TARGET_PREFERENCE_KEY,
  MOVE_LAYER_CLICK_FLASH_DURATION_PREFERENCE_KEY,
  SAVE_FORMAT_PREFERENCE_KEY,
  imageExportKindForPreference,
  loadEditorPreferences,
  parseTabletPreferences,
  parseEyedropperMagnifierSize,
  parseIsoViewPreferences,
  parseKeyDisplayDuration,
  parseKeyDisplaySize,
  parseMoveLayerClickFlashDuration,
  parseOutlineSettingsPreference,
  parseBodyFontScale,
  parseBrushEdgeThickness,
  parseCursorColorMode,
  parseUiScale,
  parseViewDragSensitivity,
  parsePasteTarget,
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

it('defaults new save and export locations to the most recently chosen folders', () => {
  const preferences = loadEditorPreferences(memoryStorage())
  expect(preferences.saveLocationMode).toBe('recent')
  expect(preferences.exportLocationMode).toBe('recent')
})

it('uses the requested cursor and magnifier defaults while preserving saved choices', () => {
  const storage = memoryStorage()
  const defaults = loadEditorPreferences(storage)
  expect(defaults.paintingCursorShape).toBe('cross')
  expect(defaults.rotationIndicatorPosition).toBe('pointer-left')
  expect(defaults.eyedropperMagnifierDistortionEnabled).toBe(false)
  expect(defaults.quickCommandBars[1].edge).toBe('none')
  saveEditorPreferences({ ...defaults, paintingCursorShape: 'cross', rotationIndicatorPosition: 'view', eyedropperMagnifierDistortionEnabled: true }, storage)
  expect(loadEditorPreferences(storage)).toMatchObject({ paintingCursorShape: 'cross', rotationIndicatorPosition: 'view', eyedropperMagnifierDistortionEnabled: true })
})

describe('editor preferences boundary', () => {
  it('shows the selection pointer by default and preserves saved choices', () => {
    const storage = memoryStorage()
    expect(DEFAULT_EDITOR_PREFERENCES.selectionCrosshair).toBe(true)
    expect(loadEditorPreferences(storage).selectionCrosshair).toBe(true)
    for (const selectionCrosshair of [false, true]) {
      saveEditorPreferences({ ...DEFAULT_EDITOR_PREFERENCES, selectionCrosshair }, storage)
      expect(loadEditorPreferences(storage).selectionCrosshair).toBe(selectionCrosshair)
    }
  })

  it('shows canvas view scrollbars by default and persists an opt-out', () => {
    const storage = memoryStorage()
    expect(loadEditorPreferences(storage).canvasViewScrollbarsEnabled).toBe(true)
    saveEditorPreferences({ ...DEFAULT_EDITOR_PREFERENCES, canvasViewScrollbarsEnabled: false }, storage)
    expect(storage.getItem(CANVAS_VIEW_SCROLLBARS_ENABLED_KEY)).toBe('false')
    expect(loadEditorPreferences(storage).canvasViewScrollbarsEnabled).toBe(false)
  })

  it('remembers the default paste target and normalizes unsupported values', () => {
    const storage = memoryStorage()
    expect(loadEditorPreferences(storage).pasteTarget).toBe('current-cell')
    expect(parsePasteTarget('unsupported')).toBe('current-cell')
    saveEditorPreferences({ ...DEFAULT_EDITOR_PREFERENCES, pasteTarget: 'new-layer' }, storage)
    expect(storage.getItem(PASTE_TARGET_PREFERENCE_KEY)).toBe('new-layer')
    expect(loadEditorPreferences(storage).pasteTarget).toBe('new-layer')
  })

  it('defaults to unlimited steps and remembers the count while the limit is off', () => {
    const storage = memoryStorage()
    // Older settings only stored a count; the new opt-in switch defaults off.
    storage.setItem(HISTORY_LIMIT_PREFERENCE_KEY, '42')
    const preferences = loadEditorPreferences(storage)
    expect(preferences.historyLimitEnabled).toBe(false)
    expect(historyEntryLimit(preferences)).toBe(Infinity)
    saveEditorPreferences({ ...preferences, historyLimitEnabled: true }, storage)
    expect(historyEntryLimit(loadEditorPreferences(storage))).toBe(42)
    saveEditorPreferences({ ...loadEditorPreferences(storage), historyLimitEnabled: false }, storage)
    const reopened = loadEditorPreferences(storage)
    expect(reopened.historyLimit).toBe(42)
    expect(historyEntryLimit(reopened)).toBe(Infinity)
  })

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
      bodyFontScale: 1,
      viewDragSensitivity: 1,
      moveLayerClickFlashDuration: 120,
      keyDisplayDuration: 1400,
      tooltipsEnabled: true,
      gradientLineVisible: true,
      gradientLineColor: DEFAULT_EDITOR_PREFERENCES.gradientLineColor,
      eyedropperQuickSelect: false,
      projectBackupEnabled: true,
      projectBackupVersions: 10,
      projectBackupRetentionDays: 30,
      projectBackupDirectory: '',
      localHistoryEnabled: false,
      localHistoryLimit: 50,
      historyLimit: 1000,
      historyLimitEnabled: false,
      cursorColorMode: 'auto',
      cursorColor: { r: 255, g: 255, b: 255, a: 255 },
      brushEdgeThickness: 1,
      isoView: DEFAULT_ISO_VIEW_PREFERENCES
    })
    expect(parseUiScale('1.25')).toBe(1.25)
    expect(parseBodyFontScale('1.3')).toBe(1.3)
    expect(parseBodyFontScale('1.5')).toBe(1)
    expect(parseViewDragSensitivity('1.25')).toBe(1)
    expect(parseEyedropperMagnifierSize('2')).toBe(1)
    expect(parseMoveLayerClickFlashDuration('240')).toBe(120)
    expect(parseKeyDisplaySize(null)).toBe(1.3)
    expect(parseKeyDisplaySize('invalid')).toBe(1.3)
    expect(parseKeyDisplaySize('2.5')).toBe(2.5)
    expect(parseKeyDisplaySize('1.3')).toBe(1.3)
    expect(parseKeyDisplaySize('0.75')).toBe(0.75)
    expect(parseKeyDisplaySize('1')).toBe(1.3)
    expect(parseKeyDisplaySize('1.4')).toBe(1.9)
    expect(parseKeyDisplaySize('1.9')).toBe(1.9)
    expect(parseKeyDisplayDuration('2000')).toBe(2000)
    expect(parseKeyDisplayDuration('9999')).toBe(1400)
    expect(parseCursorColorMode('custom')).toBe('custom')
    expect(parseCursorColorMode('invalid')).toBe('auto')
    expect(parseBrushEdgeThickness('4')).toBe(4)
    expect(parseBrushEdgeThickness('99')).toBe(8)
    expect(parseBrushEdgeThickness('0')).toBe(1)
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
      saveLocationMode: 'recent',
      exportLocationMode: 'recent',
      lastSaveDirectory: 'D:/recent-saves',
      lastExportDirectory: 'D:/recent-exports',
      uiScale: 1.5,
      bodyFontScale: 1.15,
      viewDragSensitivity: 1.5,
      moveLayerClickFlashDuration: 80,
      keyDisplayDuration: 3000,
      tooltipsEnabled: false,
      gradientLineVisible: false,
      gradientLineColor: { r: 12, g: 34, b: 56, a: 78 },
      eyedropperQuickSelect: true,
      projectBackupEnabled: false,
      projectBackupVersions: 6,
      projectBackupRetentionDays: 90,
      projectBackupDirectory: 'D:/MoonSprite backups',
      localHistoryEnabled: true,
      localHistoryLimit: 999,
      historyLimit: 1234,
      historyLimitEnabled: true,
      animationPlaybackRate: 1.5,
      animationPlaybackMode: 'tag',
      animationReturnToStart: true,
      skipDisabledFrames: false,
      isoView: { ...DEFAULT_EDITOR_PREFERENCES.isoView, snapToGrid: true },
      cursorColorMode: 'custom',
      cursorColor: { r: 12, g: 34, b: 56, a: 200 },
      brushEdgeThickness: 4
    }, storage)

    const loaded = loadEditorPreferences(storage)
    expect(loaded.saveFormat).toBe('psd')
    expect(loaded.exportFormat).toBe('psd')
    expect(loaded.pasteTarget).toBe('current-cell')
    expect(loaded.saveLocationMode).toBe('recent')
    expect(loaded.exportLocationMode).toBe('recent')
    expect(loaded.lastSaveDirectory).toBe('D:/recent-saves')
    expect(loaded.lastExportDirectory).toBe('D:/recent-exports')
    expect(loaded.uiScale).toBe(1.5)
    expect(loaded.bodyFontScale).toBe(1.15)
    expect(loaded.viewDragSensitivity).toBe(1.5)
    expect(loaded.moveLayerClickFlashDuration).toBe(80)
    expect(loaded.keyDisplayDuration).toBe(3000)
    expect(loaded.tooltipsEnabled).toBe(false)
    expect(loaded.gradientLineVisible).toBe(false)
    expect(loaded.gradientLineColor).toEqual({ r: 12, g: 34, b: 56, a: 78 })
    expect(loaded.eyedropperQuickSelect).toBe(true)
    expect(loaded.projectBackupEnabled).toBe(false)
    expect(loaded.projectBackupVersions).toBe(6)
    expect(loaded.projectBackupRetentionDays).toBe(90)
    expect(loaded.projectBackupDirectory).toBe('D:/MoonSprite backups')
    expect(loaded.localHistoryEnabled).toBe(true)
    expect(loaded.localHistoryLimit).toBe(200)
    expect(loaded.historyLimit).toBe(1234)
    expect(loaded.historyLimitEnabled).toBe(true)
    expect(loaded.cursorColorMode).toBe('custom')
    expect(loaded.cursorColor).toEqual({ r: 12, g: 34, b: 56, a: 200 })
    expect(loaded.brushEdgeThickness).toBe(4)
    expect(historyEntryLimit(loaded)).toBe(1234)
    expect(loaded.animationPlaybackRate).toBe(1.5)
    expect(loaded.animationPlaybackMode).toBe('tag')
    expect(loaded.animationReturnToStart).toBe(true)
    expect(loaded.skipDisabledFrames).toBe(false)
    expect(loaded.isoView.snapToGrid).toBe(true)
    expect(storage.getItem(SAVE_FORMAT_PREFERENCE_KEY)).toBe('psd')
    expect(storage.getItem(EXPORT_FORMAT_PREFERENCE_KEY)).toBe('psd')
    expect(storage.getItem(BODY_FONT_SCALE_PREFERENCE_KEY)).toBe('1.15')
    expect(storage.getItem(MOVE_LAYER_CLICK_FLASH_DURATION_PREFERENCE_KEY)).toBe('80')
    expect(storage.getItem(KEY_DISPLAY_DURATION_PREFERENCE_KEY)).toBe('3000')
    expect(storage.getItem(TOOLTIPS_ENABLED_PREFERENCE_KEY)).toBe('false')
    expect(storage.getItem(EYEDROPPER_QUICK_SELECT_PREFERENCE_KEY)).toBe('true')
    expect(storage.getItem(PROJECT_BACKUP_ENABLED_PREFERENCE_KEY)).toBe('false')
    expect(storage.getItem(PROJECT_BACKUP_VERSIONS_PREFERENCE_KEY)).toBe('6')
    expect(storage.getItem(PROJECT_BACKUP_RETENTION_DAYS_PREFERENCE_KEY)).toBe('90')
    expect(storage.getItem(PROJECT_BACKUP_DIRECTORY_PREFERENCE_KEY)).toBe('D:/MoonSprite backups')
    expect(storage.getItem(HISTORY_LIMIT_PREFERENCE_KEY)).toBe('1234')
    expect(storage.getItem(HISTORY_LIMIT_ENABLED_PREFERENCE_KEY)).toBe('true')
    expect(storage.getItem(ANIMATION_PLAYBACK_RATE_PREFERENCE_KEY)).toBe('1.5')
    expect(storage.getItem(ANIMATION_PLAYBACK_MODE_PREFERENCE_KEY)).toBe('tag')
    expect(storage.getItem(ANIMATION_RETURN_TO_START_PREFERENCE_KEY)).toBe('true')
    expect(storage.getItem(SKIP_DISABLED_FRAMES_PREFERENCE_KEY)).toBe('false')
  })
})

it('defaults reference scaling to smooth and persists hard edges with invalid-value fallback', () => {
  const storage = memoryStorage()
  expect(loadEditorPreferences(storage).referenceScaling).toBe('smooth')
  saveEditorPreferences({ ...DEFAULT_EDITOR_PREFERENCES, referenceScaling: 'pixelated' }, storage)
  expect(loadEditorPreferences(storage).referenceScaling).toBe('pixelated')
  storage.setItem(REFERENCE_SCALING_KEY, 'invalid')
  expect(loadEditorPreferences(storage).referenceScaling).toBe('smooth')
})

it('persists the pixel cross and migrates old alignment into the pixel toggle', () => {
  const storage = memoryStorage()
  storage.setItem('moonsprite.preference.painting-cursor-type', 'sprite')
  expect(loadEditorPreferences(storage).paintingCursorAlignToPixel).toBe(true)
  saveEditorPreferences({ ...loadEditorPreferences(storage), paintingCursorShape: 'pixel-cross', paintingCursorAlignToPixel: false }, storage)
  expect(loadEditorPreferences(storage)).toMatchObject({ paintingCursorShape: 'pixel-cross', paintingCursorAlignToPixel: false })
  storage.setItem('moonsprite.preference.painting-cursor-shape', 'dot')
  expect(loadEditorPreferences(storage).paintingCursorShape).toBe('dot')
})
