import { readStoredString, writeStoredJson, writeStoredString } from './storage'
import type { AppLocale } from './localization'
import { shortcutGroupLabelsByLocale, shortcutLabelsByLocale } from '@/locales/shortcuts'
import { CYCLING_TOOL_SHORTCUT_IDS, QUICK_TOOL_SHORTCUT_IDS, type QuickToolShortcutId } from './tool-shortcut-ids'

export { CYCLING_TOOL_SHORTCUT_IDS, QUICK_TOOL_SHORTCUT_IDS } from './tool-shortcut-ids'
export type { CyclingToolShortcutId, QuickToolShortcutId } from './tool-shortcut-ids'

export const SHORTCUTS_KEY = 'moonsprite.shortcuts.v1'
export const SHORTCUTS_V2_KEY = 'moonsprite.shortcuts.v2'
export const SHORTCUTS_CHANGED_EVENT = 'moonsprite:shortcuts-changed'
export const POLYGON_LASSO_SHORTCUT_MIGRATION_KEY = 'moonsprite.shortcuts.migration.polygon-lasso-shift-q'
export const GRID_SHORTCUT_MIGRATION_KEY = 'moonsprite.shortcuts.migration.grid-shortcuts'
export const REPLACE_COLOR_SHORTCUT_MIGRATION_KEY = 'moonsprite.shortcuts.migration.replace-color-ctrl-shift-k'
export const POPUP_PANEL_SHORTCUT_MIGRATION_KEY = 'moonsprite.shortcuts.migration.popup-panel-12345'
export const BRUSH_PANEL_SHORTCUT_MIGRATION_KEY = 'moonsprite.shortcuts.migration.brush-panel-6'
export const ANIMATION_PLAYBACK_SHORTCUT_MIGRATION_KEY = 'moonsprite.shortcuts.migration.animation-playback-enter'

export const DEFAULT_SHORTCUTS = {
  openHome: '',
  newDocument: 'Ctrl+N',
  openDocument: 'Ctrl+O',
  closeDocument: 'Ctrl+W',
  openProjectFolder: '',
  exportDocument: 'Ctrl+E',
  exportAllFrames: '',
  exportSpriteSheet: '',
  openTimelapse: '',
  openProjectInfo: '',
  openScriptFolder: '',
  'tool.pencil': 'B',
  'tool.pencil.quick': '',
  'tool.airbrush': 'J',
  'tool.airbrush.quick': '',
  'tool.eraser': 'E',
  'tool.eraser.quick': '',
  'tool.selection': 'M',
  'tool.selection.quick': '',
  'tool.selection.ellipse': 'Shift+M',
  'tool.selection.ellipse.quick': '',
  'tool.move': 'V',
  'tool.move.quick': 'Ctrl',
  'tool.slice': 'Shift+C',
  'tool.slice.quick': '',
  'tool.shape': 'U',
  'tool.shape.quick': '',
  'tool.line': '',
  'tool.line.quick': '',
  'tool.text': 'T',
  'tool.text.quick': '',
  'tool.curve': '',
  'tool.curve.quick': '',
  'tool.shape.rectangleOutline': '',
  'tool.shape.rectangleOutline.quick': '',
  'tool.shape.rectangle': '',
  'tool.shape.rectangle.quick': '',
  'tool.shape.ellipseOutline': '',
  'tool.shape.ellipseOutline.quick': '',
  'tool.shape.ellipse': '',
  'tool.shape.ellipse.quick': '',
  'tool.shape.freeform': '',
  'tool.shape.freeform.quick': '',
  'tool.shape.polygon': '',
  'tool.shape.polygon.quick': '',
  'tool.fill': 'G',
  'tool.fill.quick': '',
  'tool.fill.gradient': 'Shift+G',
  'tool.fill.gradient.quick': '',
  'tool.eyedropper': 'I',
  'tool.eyedropper.quick': 'Alt',
  'tool.hand': 'H',
  'tool.hand.quick': 'Space',
  'tool.zoom': 'Z',
  'tool.zoom.quick': '',
  'tool.rotate': 'R',
  'tool.rotate.quick': '',
  lasso: 'Q',
  'lasso.quick': '',
  polygonLasso: 'Shift+Q',
  'polygonLasso.quick': '',
  magic: 'W',
  'magic.quick': '',
  canvasResize: 'C',
  imageResize: 'Ctrl+Alt+I',
  transform: 'Ctrl+T',
  outline: 'Shift+O',
  adjustmentColorBalance: '',
  adjustmentBrightnessContrast: '',
  adjustmentHueSaturation: 'Ctrl+U',
  adjustmentCurves: 'Ctrl+M',
  openShortcutSettings: '',
  openPreferences: '',
  flipVertical: 'Shift+V',
  flipHorizontal: 'Shift+H',
  selectAll: 'Ctrl+A',
  invertSelection: 'Ctrl+Shift+I',
  deselect: 'Ctrl+D',
  deleteSelection: '',
  selectionModeReplace: '',
  selectionModeAdd: '',
  selectionModeSubtract: '',
  selectionModeIntersect: '',
  selectAllSlices: '',
  openAutoSlice: '',
  openSliceProperties: '',
  copy: 'Ctrl+C',
  cut: 'Ctrl+X',
  paste: 'Ctrl+V',
  pasteAsNewLayer: 'Ctrl+Shift+V',
  pasteAsNewDocument: '',
  save: 'Ctrl+S',
  saveAs: 'Ctrl+Shift+S',
  undo: 'Ctrl+Z',
  redo: 'Ctrl+Shift+Z',
  relativeLuminance: 'Ctrl+Y',
  advancedMode: 'Ctrl+F',
  fillForeground: 'F',
  addForegroundToPalette: 'Alt+S',
  swapForegroundBackground: 'X',
  replaceColor: 'Ctrl+Shift+K',
  convertColorMode: '',
  convertColorModeRgba: '',
  convertColorModeIndexed: '',
  convertColorModeGrayscale: '',
  cropCanvas: '',
  trimCanvas: '',
  createBrushFromSelection: 'Ctrl+B',
  togglePaletteEditLock: '',
  extractPaletteColors: '',
  togglePaletteColorSync: '',
  reversePaletteColors: '',
  createPaletteGradient: '',
  createPaletteHueGradient: '',
  sortPaletteHue: '',
  sortPaletteSaturation: '',
  sortPaletteBrightness: '',
  sortPaletteLuminance: '',
  sortPaletteRed: '',
  sortPaletteGreen: '',
  sortPaletteBlue: '',
  sortPaletteAlpha: '',
  paletteSortAscending: '',
  paletteSortDescending: '',
  paletteSwatchTiny: '',
  paletteSwatchSmall: '',
  paletteSwatchMedium: '',
  paletteSwatchLarge: '',
  paletteSwatchHuge: '',
  savePalette: '',
  openPaletteFolder: '',
  refreshPalettes: '',
  newLayer: 'Shift+N',
  createLayerGroup: 'Ctrl+G',
  newTilemapLayer: '',
  newFreeTileLayer: '',
  newBackgroundLayer: '',
  createLinkedLayer: '',
  convertLayerToBackground: '',
  convertLayerToTilemap: '',
  convertLayerToRaster: '',
  openLayerProperties: '',
  openLayerStyles: '',
  toggleLayerStyles: '',
  copyLayerStyles: '',
  pasteLayerStyles: '',
  clearLayerStyles: '',
  toggleLayerMask: '',
  toggleGroupMask: '',
  openLayerSettings: '',
  toggleClippingMask: 'Ctrl+Alt+G',
  toggleSelectedLayerVisibility: '',
  toggleSelectedLayerLock: '',
  toggleSelectedGroupCollapsed: '',
  duplicateLayer: '',
  mergeLayerDown: '',
  mergeSelectedLayers: '',
  mergeLayerGroup: '',
  mergeVisibleLayers: '',
  ungroupLayers: 'Ctrl+Shift+G',
  deleteLayer: 'Delete',
  mirrorView: 'Ctrl+Shift+M',
  mirrorViewVertical: 'Ctrl+Shift+Alt+M',
  toggleGrid: "Ctrl+Shift+'",
  toggleCustomGrid: "Ctrl+'",
  toggleIsoView: '',
  toggleSelectionOutline: 'Ctrl+H',
  toggleSliceOutlines: '',
  tileRepeatOff: '',
  tileRepeatBoth: '',
  tileRepeatX: '',
  tileRepeatY: '',
  rotateViewClockwise90: '',
  rotateViewCounterClockwise90: '',
  viewZoom100: '',
  viewZoom200: '',
  viewZoom400: '',
  viewZoom800: '',
  viewZoom3200: '',
  resetView: '',
  toggleColorPanel: '',
  togglePalettePanel: '',
  toggleLayersPanel: '',
  togglePreviewPanel: '',
  toggleTilesetPanel: '',
  toggleBrushLibraryPanel: '',
  popupColorPanel: '1',
  popupPalettePanel: '2',
  popupLayersPanel: '3',
  popupPreviewPanel: '4',
  popupTilesetPanel: '5',
  popupBrushLibraryPanel: '6',
  toggleTimeline: '',
  openGridSettings: '',
  openIsoViewSettings: '',
  toolRailLeft: '',
  toolRailRight: '',
  toolRailTop: '',
  toolRailBottom: '',
  saveWorkspaceLayout: '',
  resetWorkspaceLayout: '',
  openWorkspaceManager: '',
  openComponentLibrary: '',
  openLatestRelease: '',
  openAbout: '',
  brushSizeDecrease: '[',
  brushSizeIncrease: ']',
  copySelectionContent: 'Ctrl',
  copyLayerOnDrag: 'Alt',
  constrainAxis: 'Shift',
  addToSelection: 'Shift',
  proportionalSelectionTransform: 'Shift',
  integerSelectionScale: 'Ctrl',
  snapSelectionRotation: 'Shift',
  snapViewRotation: 'Shift',
  resetViewRotation: 'Ctrl',
  brushSizeAdjust: 'Ctrl+Alt',
  brushSizeWheelAdjust: 'Ctrl',
  lineConnectionMode: 'Shift',
  constrainLineDirections: 'Ctrl+Shift',
  brushShapeRound: 'Ctrl+1',
  brushShapeSquare: 'Ctrl+2',
  brushShapeLine: 'Ctrl+3',
  togglePerfectPixels: '',
  toggleContiguous: '',
  toggleSmartClosure: '',
  toggleRoundedCorners: '',
  toggleFixedRatio: '',
  toggleMoveAutoSelect: '',
  toggleSymmetryHorizontal: '',
  toggleSymmetryVertical: '',
  toggleSymmetryDiagonalUp: '',
  toggleSymmetryDiagonalDown: '',
  toggleSymmetryRotational: '',
  resetSymmetryCenter: '',
  tilemapModeEdit: '',
  tilemapModeCreate: '',
  tilemapModeHybrid: '',
  tilemapModePaint: '',
  freeTileModeEdit: '',
  freeTileModePaint: '',
  addFreeTileSource: '',
  deleteTilesetSelection: '',
  openFreeTileSourceProperties: '',
  showOnlyFreeTileInstance: '',
  openFreeTileInstanceProperties: '',
  rotateFreeTileInstance90: '',
  mirrorFreeTileInstanceHorizontal: '',
  mirrorFreeTileInstanceVertical: '',
  deleteFreeTileInstances: '',
  importBrushImage: '',
  createBrushFolder: '',
  openBrushFolder: '',
  refreshBrushLibrary: '',
  brushLibraryParentFolder: '',
  brushSwatchSmall: '',
  brushSwatchMedium: '',
  brushSwatchLarge: '',
  deleteBrushSelection: '',
  addAnimationFrame: 'Alt+N',
  addLinkedAnimationFrame: 'Alt+M',
  addBlankAnimationFrame: 'Alt+B',
  deleteAnimationFrame: 'Alt+C',
  enableAnimationFrames: '',
  disableAnimationFrames: '',
  toggleAnimationFramesDisabled: '',
  copyAnimationCel: 'Ctrl+D',
  copyAnimationFrames: '',
  pasteAnimationFrames: '',
  pasteAnimationCels: '',
  copyAnimationMasks: '',
  pasteAnimationMasks: '',
  connectAnimationCels: '',
  disconnectAnimationCels: '',
  connectAnimationMasks: '',
  disconnectAnimationMasks: '',
  toggleAnimationMask: '',
  createAnimationLoopSection: '',
  openAnimationFrameProperties: '',
  playAnimationLoopSection: '',
  openAnimationLoopSectionProperties: '',
  deleteAnimationLoopSection: '',
  openAnimationCelProperties: '',
  toggleAnimationPlayback: 'Enter',
  animationPlaybackOnce: '',
  animationPlaybackAll: '',
  animationPlaybackTag: '',
  toggleAnimationReturnToStart: '',
  animationPlaybackSpeed025: '',
  animationPlaybackSpeed050: '',
  animationPlaybackSpeed100: '',
  animationPlaybackSpeed150: '',
  animationPlaybackSpeed200: '',
  animationPlaybackSpeed300: '',
  previousAnimationFrame: '',
  nextAnimationFrame: ''
} as const

export type ShortcutId = keyof typeof DEFAULT_SHORTCUTS
export type ShortcutMap = Record<string, string>
export type ShortcutBindings = Record<ShortcutId, string[]>

export interface ShortcutSettingsFile {
  format: 'moonsprite-shortcuts'
  version: 2
  bindings: Partial<Record<ShortcutId, string[]>>
}

export const SHORTCUT_IDS = Object.keys(DEFAULT_SHORTCUTS) as ShortcutId[]
export const DEFAULT_SHORTCUT_BINDINGS = Object.fromEntries(
  SHORTCUT_IDS.map((id) => [id, DEFAULT_SHORTCUTS[id] ? [normalizeShortcut(DEFAULT_SHORTCUTS[id])] : []])
) as ShortcutBindings

const TOOL_SHORTCUT_GROUP = CYCLING_TOOL_SHORTCUT_IDS.flatMap((id, index) => [id, QUICK_TOOL_SHORTCUT_IDS[index]]) as ShortcutId[]

export function normalizeShortcut(value: string): string {
  const parts = value.split('+').map((part) => part.trim()).filter(Boolean)
  const modifiers = ['Ctrl', 'Alt', 'Shift'].filter((modifier) => parts.some((part) => part.toLowerCase() === modifier.toLowerCase()))
  const key = parts.find((part) => !['ctrl', 'alt', 'shift'].includes(part.toLowerCase()))
  return [...modifiers, ...(key ? [key.length === 1 ? key.toUpperCase() : key] : [])].join('+')
}

export const SHORTCUT_GROUPS = {
  file: ['openHome', 'newDocument', 'openDocument', 'closeDocument', 'openProjectInfo', 'save', 'saveAs', 'exportDocument', 'exportAllFrames', 'exportSpriteSheet', 'openProjectFolder', 'openTimelapse', 'openScriptFolder'],
  edit: ['undo', 'redo', 'copy', 'cut', 'paste', 'pasteAsNewLayer', 'pasteAsNewDocument'],
  selection: ['selectAll', 'invertSelection', 'deselect', 'deleteSelection', 'transform', 'flipHorizontal', 'flipVertical', 'outline', 'toggleSelectionOutline', 'createBrushFromSelection', 'selectionModeReplace', 'selectionModeAdd', 'selectionModeSubtract', 'selectionModeIntersect', 'selectAllSlices', 'openAutoSlice', 'openSliceProperties'],
  image: ['canvasResize', 'imageResize', 'convertColorMode', 'convertColorModeRgba', 'convertColorModeIndexed', 'convertColorModeGrayscale', 'cropCanvas', 'trimCanvas'],
  color: ['fillForeground', 'addForegroundToPalette', 'swapForegroundBackground', 'replaceColor', 'adjustmentColorBalance', 'adjustmentBrightnessContrast', 'adjustmentHueSaturation', 'adjustmentCurves', 'togglePaletteEditLock', 'extractPaletteColors', 'togglePaletteColorSync', 'reversePaletteColors', 'createPaletteGradient', 'createPaletteHueGradient', 'sortPaletteHue', 'sortPaletteSaturation', 'sortPaletteBrightness', 'sortPaletteLuminance', 'sortPaletteRed', 'sortPaletteGreen', 'sortPaletteBlue', 'sortPaletteAlpha', 'paletteSortAscending', 'paletteSortDescending', 'paletteSwatchTiny', 'paletteSwatchSmall', 'paletteSwatchMedium', 'paletteSwatchLarge', 'paletteSwatchHuge', 'savePalette', 'openPaletteFolder', 'refreshPalettes'],
  layers: ['newLayer', 'createLayerGroup', 'newTilemapLayer', 'newFreeTileLayer', 'newBackgroundLayer', 'createLinkedLayer', 'convertLayerToBackground', 'convertLayerToTilemap', 'convertLayerToRaster', 'openLayerProperties', 'toggleClippingMask', 'toggleSelectedLayerVisibility', 'toggleSelectedLayerLock', 'toggleSelectedGroupCollapsed', 'toggleLayerMask', 'toggleGroupMask', 'openLayerStyles', 'toggleLayerStyles', 'copyLayerStyles', 'pasteLayerStyles', 'clearLayerStyles', 'duplicateLayer', 'mergeLayerDown', 'mergeSelectedLayers', 'mergeLayerGroup', 'mergeVisibleLayers', 'ungroupLayers', 'deleteLayer', 'openLayerSettings'],
  animation: ['toggleAnimationPlayback', 'animationPlaybackOnce', 'animationPlaybackAll', 'animationPlaybackTag', 'toggleAnimationReturnToStart', 'animationPlaybackSpeed025', 'animationPlaybackSpeed050', 'animationPlaybackSpeed100', 'animationPlaybackSpeed150', 'animationPlaybackSpeed200', 'animationPlaybackSpeed300', 'previousAnimationFrame', 'nextAnimationFrame', 'addAnimationFrame', 'addLinkedAnimationFrame', 'addBlankAnimationFrame', 'deleteAnimationFrame', 'enableAnimationFrames', 'disableAnimationFrames', 'toggleAnimationFramesDisabled', 'copyAnimationCel', 'copyAnimationFrames', 'pasteAnimationFrames', 'pasteAnimationCels', 'copyAnimationMasks', 'pasteAnimationMasks', 'connectAnimationCels', 'disconnectAnimationCels', 'connectAnimationMasks', 'disconnectAnimationMasks', 'toggleAnimationMask', 'createAnimationLoopSection', 'openAnimationFrameProperties', 'playAnimationLoopSection', 'openAnimationLoopSectionProperties', 'deleteAnimationLoopSection', 'openAnimationCelProperties'],
  view: ['relativeLuminance', 'toggleGrid', 'toggleCustomGrid', 'toggleIsoView', 'toggleSliceOutlines', 'openGridSettings', 'openIsoViewSettings', 'tileRepeatOff', 'tileRepeatBoth', 'tileRepeatX', 'tileRepeatY', 'mirrorView', 'mirrorViewVertical', 'rotateViewClockwise90', 'rotateViewCounterClockwise90', 'viewZoom100', 'viewZoom200', 'viewZoom400', 'viewZoom800', 'viewZoom3200', 'resetView'],
  interface: ['popupColorPanel', 'popupPalettePanel', 'popupLayersPanel', 'popupPreviewPanel', 'popupTilesetPanel', 'popupBrushLibraryPanel', 'toggleColorPanel', 'togglePalettePanel', 'toggleLayersPanel', 'togglePreviewPanel', 'toggleTilesetPanel', 'toggleBrushLibraryPanel', 'toggleTimeline', 'toolRailLeft', 'toolRailRight', 'toolRailTop', 'toolRailBottom', 'saveWorkspaceLayout', 'resetWorkspaceLayout', 'openWorkspaceManager', 'advancedMode', 'openShortcutSettings', 'openPreferences'],
  tools: [...TOOL_SHORTCUT_GROUP, 'brushShapeRound', 'brushShapeSquare', 'brushShapeLine', 'togglePerfectPixels', 'toggleContiguous', 'toggleSmartClosure', 'toggleRoundedCorners', 'toggleFixedRatio', 'toggleMoveAutoSelect', 'toggleSymmetryHorizontal', 'toggleSymmetryVertical', 'toggleSymmetryDiagonalUp', 'toggleSymmetryDiagonalDown', 'toggleSymmetryRotational', 'resetSymmetryCenter', 'brushSizeDecrease', 'brushSizeIncrease'],
  tiles: ['tilemapModeEdit', 'tilemapModeCreate', 'tilemapModeHybrid', 'tilemapModePaint', 'freeTileModeEdit', 'freeTileModePaint', 'addFreeTileSource', 'deleteTilesetSelection', 'openFreeTileSourceProperties', 'showOnlyFreeTileInstance', 'openFreeTileInstanceProperties', 'rotateFreeTileInstance90', 'mirrorFreeTileInstanceHorizontal', 'mirrorFreeTileInstanceVertical', 'deleteFreeTileInstances'],
  brushes: ['importBrushImage', 'createBrushFolder', 'openBrushFolder', 'refreshBrushLibrary', 'brushLibraryParentFolder', 'brushSwatchSmall', 'brushSwatchMedium', 'brushSwatchLarge', 'deleteBrushSelection'],
  modifiers: ['brushSizeAdjust', 'brushSizeWheelAdjust', 'lineConnectionMode', 'constrainLineDirections', 'copySelectionContent', 'addToSelection', 'proportionalSelectionTransform', 'integerSelectionScale', 'snapSelectionRotation', 'copyLayerOnDrag', 'constrainAxis', 'snapViewRotation', 'resetViewRotation'],
  help: ['openComponentLibrary', 'openLatestRelease', 'openAbout']
} as const satisfies Record<string, ReadonlyArray<ShortcutId>>

export type ShortcutGroupId = keyof typeof SHORTCUT_GROUPS

export const SHORTCUT_GROUP_LABELS = shortcutGroupLabelsByLocale['zh-CN']
export const SHORTCUT_LABELS = shortcutLabelsByLocale['zh-CN']
export const shortcutGroupLabels = (locale: AppLocale): Record<ShortcutGroupId, string> => shortcutGroupLabelsByLocale[locale]
export const shortcutLabels = (locale: AppLocale): Record<ShortcutId, string> => shortcutLabelsByLocale[locale]

export function modifierShortcutMatches(event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>, shortcut: string): boolean {
  const keys = shortcut.toLowerCase().split('+').map((key) => key.trim()).filter(Boolean)
  if (keys.length === 0 || keys.some((key) => !['ctrl', 'alt', 'shift'].includes(key))) return false
  const wantsCtrl = keys.includes('ctrl')
  const wantsAlt = keys.includes('alt')
  const wantsShift = keys.includes('shift')
  return Boolean(event.ctrlKey || event.metaKey) === wantsCtrl && Boolean(event.altKey) === wantsAlt && Boolean(event.shiftKey) === wantsShift
}

export function modifierShortcutHeld(event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>, shortcut: string): boolean {
  const keys = shortcut.toLowerCase().split('+').map((key) => key.trim()).filter(Boolean)
  if (keys.length === 0 || keys.some((key) => !['ctrl', 'alt', 'shift'].includes(key))) return false
  return (!keys.includes('ctrl') || Boolean(event.ctrlKey || event.metaKey))
    && (!keys.includes('alt') || Boolean(event.altKey))
    && (!keys.includes('shift') || Boolean(event.shiftKey))
}

const knownShortcutIds = new Set<string>(SHORTCUT_IDS)
const legacyQuickToolAliases = {
  temporaryMove: 'tool.move.quick',
  temporaryEyedropper: 'tool.eyedropper.quick',
  temporaryPan: 'tool.hand.quick'
} as const satisfies Record<string, QuickToolShortcutId>

export function parseShortcutJson(value: string | null): ShortcutMap {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const record = parsed as Record<string, unknown>
    const result: ShortcutMap = {}
    for (const [key, shortcut] of Object.entries(record)) {
      if (knownShortcutIds.has(key) && typeof shortcut === 'string') result[key] = shortcut
    }
    for (const [legacyId, id] of Object.entries(legacyQuickToolAliases)) {
      const shortcut = record[legacyId]
      if (result[id] === undefined && typeof shortcut === 'string') result[id] = shortcut
    }
    return result
  } catch {
    return {}
  }
}

function loadLegacyShortcuts(storage?: Storage): ShortcutMap {
  const saved = parseShortcutJson(readStoredString(SHORTCUTS_KEY, storage))
  // 旧版垂直镜像默认键与 Ctrl+Alt 调整笔刷尺寸重叠，只迁移未被用户改过的旧默认值。
  if (saved.mirrorViewVertical === 'Ctrl+Alt+M' && (saved.brushSizeAdjust === undefined || saved.brushSizeAdjust === DEFAULT_SHORTCUTS.brushSizeAdjust)) saved.mirrorViewVertical = DEFAULT_SHORTCUTS.mirrorViewVertical
  if (readStoredString(POLYGON_LASSO_SHORTCUT_MIGRATION_KEY, storage) !== 'done') {
    if (saved.polygonLasso === '') saved.polygonLasso = DEFAULT_SHORTCUTS.polygonLasso
    writeStoredString(POLYGON_LASSO_SHORTCUT_MIGRATION_KEY, 'done', storage)
  }
  if (readStoredString(GRID_SHORTCUT_MIGRATION_KEY, storage) !== 'done') {
    if (saved.toggleGrid === '') saved.toggleGrid = DEFAULT_SHORTCUTS.toggleGrid
    writeStoredString(GRID_SHORTCUT_MIGRATION_KEY, 'done', storage)
  }
  if (readStoredString(REPLACE_COLOR_SHORTCUT_MIGRATION_KEY, storage) !== 'done') {
    if (saved.replaceColor === 'Ctrl+Alt+R') saved.replaceColor = DEFAULT_SHORTCUTS.replaceColor
    writeStoredString(REPLACE_COLOR_SHORTCUT_MIGRATION_KEY, 'done', storage)
  }
  if (readStoredString(POPUP_PANEL_SHORTCUT_MIGRATION_KEY, storage) !== 'done') {
    for (const id of ['popupColorPanel', 'popupPalettePanel', 'popupLayersPanel', 'popupPreviewPanel', 'popupTilesetPanel'] as const) {
      if (saved[id] === undefined || saved[id] === '') saved[id] = DEFAULT_SHORTCUTS[id]
    }
    writeStoredString(POPUP_PANEL_SHORTCUT_MIGRATION_KEY, 'done', storage)
  }
  if (readStoredString(BRUSH_PANEL_SHORTCUT_MIGRATION_KEY, storage) !== 'done') {
    if (saved.popupBrushLibraryPanel === undefined || saved.popupBrushLibraryPanel === '') saved.popupBrushLibraryPanel = DEFAULT_SHORTCUTS.popupBrushLibraryPanel
    writeStoredString(BRUSH_PANEL_SHORTCUT_MIGRATION_KEY, 'done', storage)
  }
  if (readStoredString(ANIMATION_PLAYBACK_SHORTCUT_MIGRATION_KEY, storage) !== 'done') {
    if (saved.toggleAnimationPlayback === '') saved.toggleAnimationPlayback = DEFAULT_SHORTCUTS.toggleAnimationPlayback
    writeStoredString(ANIMATION_PLAYBACK_SHORTCUT_MIGRATION_KEY, 'done', storage)
  }
  return { ...DEFAULT_SHORTCUTS, ...saved }
}

export function cloneShortcutBindings(shortcuts: ShortcutBindings): ShortcutBindings {
  return Object.fromEntries(SHORTCUT_IDS.map((id) => [id, [...(shortcuts[id] ?? [])]])) as ShortcutBindings
}

export function normalizeShortcutBindings(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const normalized = normalizeShortcut(value.trim())
    const key = normalized.toLowerCase()
    if (!normalized || seen.has(key)) continue
    seen.add(key)
    result.push(normalized)
  }
  return result
}

export function shortcutBindingsFromMap(shortcuts: ShortcutMap): ShortcutBindings {
  return Object.fromEntries(SHORTCUT_IDS.map((id) => {
    const value = shortcuts[id] === undefined ? DEFAULT_SHORTCUTS[id] : shortcuts[id]
    return [id, value.trim() ? [normalizeShortcut(value)] : []]
  })) as ShortcutBindings
}

export function shortcutPrimaryMap(shortcuts: ShortcutBindings): ShortcutMap {
  return Object.fromEntries(SHORTCUT_IDS.map((id) => [id, shortcuts[id]?.[0] ?? '']))
}

export function shortcutBindingsFor(shortcuts: ShortcutBindings, id: ShortcutId): readonly string[] {
  return shortcuts[id] ?? DEFAULT_SHORTCUT_BINDINGS[id]
}

export function shortcutPrimary(shortcuts: ShortcutBindings, id: ShortcutId): string {
  return shortcutBindingsFor(shortcuts, id)[0] ?? ''
}

export function formatShortcutBindings(shortcuts: readonly string[]): string {
  return shortcuts.join(' / ')
}

export function shortcutDisplayText(shortcut: string, locale: AppLocale): string {
  const labels = locale === 'zh-CN'
    ? { WheelUp: '滚轮向上', WheelDown: '滚轮向下', MouseMiddle: '鼠标中键', MouseBack: '鼠标侧键 1', MouseForward: '鼠标侧键 2' }
    : { WheelUp: 'Wheel Up', WheelDown: 'Wheel Down', MouseMiddle: 'Middle Mouse', MouseBack: 'Mouse Button 4', MouseForward: 'Mouse Button 5' }
  return shortcut.split('+').map((part) => labels[part as keyof typeof labels] ?? part).join('+')
}

export function formatShortcutBindingsForLocale(shortcuts: readonly string[], locale: AppLocale): string {
  return shortcuts.map((shortcut) => shortcutDisplayText(shortcut, locale)).join(' / ')
}

function shortcutBindingOverrides(shortcuts: ShortcutBindings): Partial<Record<ShortcutId, string[]>> {
  const result: Partial<Record<ShortcutId, string[]>> = {}
  for (const id of SHORTCUT_IDS) {
    const current = normalizeShortcutBindings(shortcuts[id] ?? [])
    const defaults = DEFAULT_SHORTCUT_BINDINGS[id]
    if (current.length === defaults.length && current.every((value, index) => value === defaults[index])) continue
    result[id] = current
  }
  return result
}

export function createShortcutSettingsFile(shortcuts: ShortcutBindings): ShortcutSettingsFile {
  return { format: 'moonsprite-shortcuts', version: 2, bindings: shortcutBindingOverrides(shortcuts) }
}

type ParsedShortcutEntries = Array<[ShortcutId, string[]]>

function parseShortcutEntries(value: string | null): ParsedShortcutEntries | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    const record = parsed as Record<string, unknown>
    const source = record.format === 'moonsprite-shortcuts' && record.version === 2
      ? record.bindings
      : parsed
    if (!source || typeof source !== 'object' || Array.isArray(source)) return null
    const entries: ParsedShortcutEntries = []
    const parsedIds = new Set<ShortcutId>()
    const normalizedValues = (rawValue: unknown): string[] | null => typeof rawValue === 'string'
      ? [rawValue]
      : Array.isArray(rawValue) && rawValue.every((item) => typeof item === 'string')
        ? rawValue as string[]
        : null
    for (const [key, rawValue] of Object.entries(source)) {
      if (!knownShortcutIds.has(key)) continue
      const values = normalizedValues(rawValue)
      if (!values) continue
      const id = key as ShortcutId
      entries.push([id, normalizeShortcutBindings(values)])
      parsedIds.add(id)
    }
    for (const [legacyId, id] of Object.entries(legacyQuickToolAliases)) {
      if (parsedIds.has(id)) continue
      const values = normalizedValues((source as Record<string, unknown>)[legacyId])
      if (values) entries.push([id, normalizeShortcutBindings(values)])
    }
    return entries
  } catch {
    return null
  }
}

const cyclingToolShortcutIds = new Set<ShortcutId>(CYCLING_TOOL_SHORTCUT_IDS)
const quickToolShortcutIds = new Set<ShortcutId>(QUICK_TOOL_SHORTCUT_IDS)
const contextualModifierShortcutIds = new Set<ShortcutId>(SHORTCUT_GROUPS.modifiers)

export function shortcutIdsMayShareBinding(first: ShortcutId, second: ShortcutId): boolean {
  if (first === second) return true
  if (cyclingToolShortcutIds.has(first) && cyclingToolShortcutIds.has(second)) return true
  if (contextualModifierShortcutIds.has(first) && contextualModifierShortcutIds.has(second)) return true
  if ((quickToolShortcutIds.has(first) && contextualModifierShortcutIds.has(second))
    || (contextualModifierShortcutIds.has(first) && quickToolShortcutIds.has(second))) return true
  return (first === 'deselect' && second === 'copyAnimationCel')
    || (first === 'copyAnimationCel' && second === 'deselect')
}

export function findShortcutBindingOwners(shortcuts: ShortcutBindings, shortcut: string, excludingId?: ShortcutId): ShortcutId[] {
  const key = normalizeShortcut(shortcut).toLowerCase()
  if (!key) return []
  return SHORTCUT_IDS.filter((id) => id !== excludingId && shortcutBindingsFor(shortcuts, id).some((value) => normalizeShortcut(value).toLowerCase() === key))
}

export interface ShortcutAssignmentResult {
  shortcuts: ShortcutBindings
  displaced: ShortcutId[]
}

export function assignShortcutBinding(
  shortcuts: ShortcutBindings,
  id: ShortcutId,
  shortcut: string,
  replaceIndex?: number
): ShortcutAssignmentResult {
  const next = cloneShortcutBindings(shortcuts)
  const normalized = normalizeShortcut(shortcut.trim())
  const target = [...shortcutBindingsFor(next, id)]
  const insertionIndex = replaceIndex === undefined ? target.length : Math.max(0, Math.min(replaceIndex, target.length))
  if (replaceIndex !== undefined && replaceIndex < target.length) target.splice(replaceIndex, 1)
  if (!normalized) {
    next[id] = normalizeShortcutBindings(target)
    return { shortcuts: next, displaced: [] }
  }
  const key = normalized.toLowerCase()
  const withoutDuplicate = target.filter((value) => normalizeShortcut(value).toLowerCase() !== key)
  withoutDuplicate.splice(Math.min(insertionIndex, withoutDuplicate.length), 0, normalized)
  next[id] = normalizeShortcutBindings(withoutDuplicate)

  const displaced: ShortcutId[] = []
  for (const otherId of SHORTCUT_IDS) {
    if (otherId === id || shortcutIdsMayShareBinding(id, otherId)) continue
    const filtered = shortcutBindingsFor(next, otherId).filter((value) => normalizeShortcut(value).toLowerCase() !== key)
    if (filtered.length === shortcutBindingsFor(next, otherId).length) continue
    next[otherId] = filtered
    displaced.push(otherId)
  }
  return { shortcuts: next, displaced }
}

export function removeShortcutBinding(shortcuts: ShortcutBindings, id: ShortcutId, index: number): ShortcutBindings {
  const next = cloneShortcutBindings(shortcuts)
  next[id] = shortcutBindingsFor(next, id).filter((_, bindingIndex) => bindingIndex !== index)
  return next
}

export function resetShortcutBindings(shortcuts: ShortcutBindings, id: ShortcutId): ShortcutBindings {
  let next = cloneShortcutBindings(shortcuts)
  next[id] = []
  for (const shortcut of DEFAULT_SHORTCUT_BINDINGS[id]) next = assignShortcutBinding(next, id, shortcut).shortcuts
  return next
}

function applyShortcutEntries(entries: ParsedShortcutEntries): ShortcutBindings {
  let shortcuts = cloneShortcutBindings(DEFAULT_SHORTCUT_BINDINGS)
  for (const [id, values] of entries) {
    shortcuts[id] = []
    for (const value of values) shortcuts = assignShortcutBinding(shortcuts, id, value).shortcuts
  }
  return shortcuts
}

export function importShortcutBindings(value: string): ShortcutBindings | null {
  const entries = parseShortcutEntries(value)
  return entries ? applyShortcutEntries(entries) : null
}

export function loadShortcutBindings(storage?: Storage): ShortcutBindings {
  const savedV2 = parseShortcutEntries(readStoredString(SHORTCUTS_V2_KEY, storage))
  if (savedV2) return applyShortcutEntries(savedV2)
  const migrated = shortcutBindingsFromMap(loadLegacyShortcuts(storage))
  writeStoredJson(SHORTCUTS_V2_KEY, createShortcutSettingsFile(migrated), storage)
  return migrated
}

export function loadShortcuts(storage?: Storage): ShortcutMap {
  return shortcutPrimaryMap(loadShortcutBindings(storage))
}

export function saveShortcutBindings(shortcuts: ShortcutBindings, storage?: Storage): void {
  const normalized = Object.fromEntries(SHORTCUT_IDS.map((id) => [id, normalizeShortcutBindings(shortcuts[id] ?? [])])) as ShortcutBindings
  writeStoredJson(SHORTCUTS_V2_KEY, createShortcutSettingsFile(normalized), storage)
  writeStoredJson(SHORTCUTS_KEY, shortcutPrimaryMap(normalized), storage)
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SHORTCUTS_CHANGED_EVENT))
}

export function saveShortcuts(shortcuts: ShortcutMap, storage?: Storage): void {
  saveShortcutBindings(shortcutBindingsFromMap(shortcuts), storage)
}

export function keyboardEventKey(event: KeyboardEvent): string {
  if (event.code === 'Space') return 'Space'
  if (event.code === 'Quote') return "'"
  if (['Process', 'Unidentified', 'Dead'].includes(event.key) && /^Key[A-Z]$/.test(event.code)) return event.code.slice(3)
  return event.key
}

export function isFunctionKey(key: string): boolean {
  return /^F(?:[1-9]|1[0-2])$/i.test(key)
}

export function shortcutText(event: KeyboardEvent): string {
  const key = keyboardEventKey(event)
  const modifiers = [event.ctrlKey || event.metaKey ? 'Ctrl' : '', event.altKey ? 'Alt' : '', event.shiftKey ? 'Shift' : ''].filter(Boolean)
  const isModifier = key === 'Control' || key === 'Meta' || key === 'Alt' || key === 'Shift'
  const ordinaryKey = isModifier ? '' : key.length === 1 ? key.toUpperCase() : key
  return [...modifiers, ...(ordinaryKey ? [ordinaryKey] : [])].join('+')
}

export function wheelShortcutKey(delta: number): 'WheelUp' | 'WheelDown' | '' {
  return delta < 0 ? 'WheelUp' : delta > 0 ? 'WheelDown' : ''
}

export function wheelShortcutText(
  event: Pick<WheelEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>,
  delta: number
): string {
  const key = wheelShortcutKey(delta)
  if (!key) return ''
  const modifiers = [event.ctrlKey || event.metaKey ? 'Ctrl' : '', event.altKey ? 'Alt' : '', event.shiftKey ? 'Shift' : ''].filter(Boolean)
  return [...modifiers, key].join('+')
}

export type MouseShortcutKey = 'MouseMiddle' | 'MouseBack' | 'MouseForward'

export function mouseShortcutKey(button: number): MouseShortcutKey | '' {
  if (button === 1) return 'MouseMiddle'
  if (button === 3) return 'MouseBack'
  if (button === 4) return 'MouseForward'
  return ''
}

export function mouseShortcutText(
  event: Pick<MouseEvent, 'button' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>
): string {
  const key = mouseShortcutKey(event.button)
  if (!key) return ''
  const modifiers = [event.ctrlKey || event.metaKey ? 'Ctrl' : '', event.altKey ? 'Alt' : '', event.shiftKey ? 'Shift' : ''].filter(Boolean)
  return [...modifiers, key].join('+')
}

export function dispatchMouseShortcutInput(
  target: EventTarget,
  event: Pick<MouseEvent, 'button' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>,
  type: 'keydown' | 'keyup'
): boolean {
  const key = mouseShortcutKey(event.button)
  if (!key) return false
  return !target.dispatchEvent(new KeyboardEvent(type, {
    key,
    code: key,
    ctrlKey: event.ctrlKey || event.metaKey,
    metaKey: false,
    altKey: event.altKey,
    shiftKey: event.shiftKey,
    bubbles: true,
    cancelable: true,
    composed: true
  }))
}

export function dispatchWheelShortcutInput(
  target: EventTarget,
  event: Pick<WheelEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>,
  delta: number
): boolean {
  const key = wheelShortcutKey(delta)
  if (!key) return false
  const init: KeyboardEventInit = {
    key,
    code: key,
    ctrlKey: event.ctrlKey || event.metaKey,
    metaKey: false,
    altKey: event.altKey,
    shiftKey: event.shiftKey,
    bubbles: true,
    cancelable: true,
    composed: true
  }
  const consumed = !target.dispatchEvent(new KeyboardEvent('keydown', init))
  target.dispatchEvent(new KeyboardEvent('keyup', init))
  return consumed
}

export function shortcutMatchesEvent(event: KeyboardEvent, shortcut: string): boolean {
  return shortcut.trim() !== '' && normalizeShortcut(shortcutText(event)).toLowerCase() === normalizeShortcut(shortcut).toLowerCase()
}

export function shortcutMatchesAnyEvent(event: KeyboardEvent, shortcuts: readonly string[]): boolean {
  return shortcuts.some((shortcut) => shortcutMatchesEvent(event, shortcut))
}

export function shortcutReleasedByEvent(event: KeyboardEvent, shortcut: string): boolean {
  const parts = normalizeShortcut(shortcut).split('+').filter(Boolean)
  const released = keyboardEventKey(event).toLowerCase()
  if (released === 'control' || released === 'meta') return parts.includes('Ctrl')
  if (released === 'alt') return parts.includes('Alt')
  if (released === 'shift') return parts.includes('Shift')
  return parts.some((part) => !['Ctrl', 'Alt', 'Shift'].includes(part) && part.toLowerCase() === released)
}

export function shortcutReleasedByBindings(event: KeyboardEvent, shortcuts: readonly string[]): boolean {
  return shortcuts.some((shortcut) => shortcutReleasedByEvent(event, shortcut))
}

export function shortcutKeyPart(event: KeyboardEvent): string {
  const key = keyboardEventKey(event)
  if (key === 'Control' || key === 'Meta') return 'Ctrl'
  if (key === 'Alt' || key === 'Shift') return key
  return key.length === 1 ? key.toUpperCase() : key
}

export function shortcutHeldByKeyParts(heldParts: ReadonlySet<string>, shortcut: string): boolean {
  const parts = normalizeShortcut(shortcut).split('+').filter(Boolean)
  return parts.length > 0 && parts.every((part) => heldParts.has(part))
}

export function modifierShortcutHeldByBindings(
  event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>,
  shortcuts: readonly string[]
): boolean {
  return shortcuts.some((shortcut) => modifierShortcutHeld(event, shortcut))
}

export function matchingModifierShortcut(
  event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>,
  shortcuts: readonly string[]
): string {
  return shortcuts.find((shortcut) => modifierShortcutHeld(event, shortcut)) ?? ''
}

export interface ShortcutConflict {
  shortcut: string
  winner: ShortcutId
  conflicting: ShortcutId[]
}

export interface ShortcutConflictState {
  conflicts: ShortcutConflict[]
  blocked: Partial<Record<ShortcutId, ShortcutId>>
  blockedBindings: Partial<Record<ShortcutId, Record<string, ShortcutId>>>
}

function coerceShortcutBindings(shortcuts: ShortcutBindings | ShortcutMap): ShortcutBindings {
  const values = Object.values(shortcuts)
  if (values.some((value) => Array.isArray(value))) {
    return Object.fromEntries(SHORTCUT_IDS.map((id) => {
      const value = (shortcuts as Partial<ShortcutBindings>)[id]
      return [id, Array.isArray(value) ? normalizeShortcutBindings(value) : [...DEFAULT_SHORTCUT_BINDINGS[id]]]
    })) as ShortcutBindings
  }
  return shortcutBindingsFromMap(shortcuts as ShortcutMap)
}

export function deriveShortcutConflicts(shortcuts: ShortcutBindings | ShortcutMap): ShortcutConflictState {
  const bindings = coerceShortcutBindings(shortcuts)
  const orderedIds = Object.values(SHORTCUT_GROUPS).flat() as ShortcutId[]
  const byShortcut = new Map<string, Array<{ id: ShortcutId; shortcut: string }>>()
  for (const id of orderedIds) {
    for (const shortcut of shortcutBindingsFor(bindings, id)) {
      const key = normalizeShortcut(shortcut).toLowerCase()
      if (!key) continue
      byShortcut.set(key, [...(byShortcut.get(key) ?? []), { id, shortcut }])
    }
  }
  const conflicts: ShortcutConflict[] = []
  const blocked: Partial<Record<ShortcutId, ShortcutId>> = {}
  const blockedBindings: ShortcutConflictState['blockedBindings'] = {}
  for (const [key, entries] of byShortcut) {
    if (entries.length < 2) continue
    const accepted: ShortcutId[] = []
    const conflictsByWinner = new Map<ShortcutId, Set<ShortcutId>>()
    for (const entry of entries) {
      const winner = accepted.find((candidate) => !shortcutIdsMayShareBinding(candidate, entry.id))
      if (!winner) {
        accepted.push(entry.id)
        continue
      }
      blocked[entry.id] ??= winner
      blockedBindings[entry.id] = { ...(blockedBindings[entry.id] ?? {}), [key]: winner }
      const conflicting = conflictsByWinner.get(winner) ?? new Set<ShortcutId>()
      conflicting.add(entry.id)
      conflictsByWinner.set(winner, conflicting)
    }
    for (const [winner, conflicting] of conflictsByWinner) {
      conflicts.push({ shortcut: entries[0].shortcut, winner, conflicting: [...conflicting] })
    }
  }
  return { conflicts, blocked, blockedBindings }
}

export function shortcutBindingBlocked(
  conflictState: ShortcutConflictState,
  id: ShortcutId,
  shortcut: string
): boolean {
  return Boolean(conflictState.blockedBindings[id]?.[normalizeShortcut(shortcut).toLowerCase()])
}
