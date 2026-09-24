import type { ExportProtection } from './export-protection'
import { DEFAULT_TOOL_RAIL, TOOL_RAIL_PREFERENCE_KEY, parseToolRail, serializeToolRail, type ToolRailPreference } from './tool-rail-preferences'
import type { ImageExportKind, SaveImageKind } from './png'
import { DEFAULT_APP_LOCALE, LANGUAGE_PREFERENCE_KEY as APP_LANGUAGE_PREFERENCE_KEY, parseAppLocale, type AppLocale } from './localization'
import { readStoredString, writeStoredString } from './storage'
import { isPixelFormat } from './pixel-format'
import type { RgbaColor } from '@shared/types-color'
import type { OutlineSettings } from '@shared/types-selection'
import type { ColorValueMode } from './color-values'
import { normalizeOutlineSettings, cloneOutlineSettings } from './outline-settings'
import { DEFAULT_THEME_PREFERENCES, THEME_PREFERENCE_KEY, loadThemePreferences, normalizeThemePreferences, resolveTheme, rgbaHex, saveThemePreferences, withThemePaletteColors, type ThemePalette, type ThemePreferences } from './theme'
import { ISO_GUIDE_BASE_SPACING, ISO_LINE_STAIR_STEP } from './isometric'

export const SAVE_FORMAT_PREFERENCE_KEY = 'moonsprite.preference.save-format'
export const SAVE_ORIGINAL_FORMAT_PREFERENCE_KEY = 'moonsprite.preference.save-original-format'
export const EXPORT_FORMAT_PREFERENCE_KEY = 'moonsprite.preference.export-format'
export const SAVE_DIRECTORY_PREFERENCE_KEY = 'moonsprite.preference.save-directory'
export const EXPORT_DIRECTORY_PREFERENCE_KEY = 'moonsprite.preference.export-directory'
export const SAVE_LOCATION_MODE_PREFERENCE_KEY = 'moonsprite.preference.save-location-mode'
export const EXPORT_LOCATION_MODE_PREFERENCE_KEY = 'moonsprite.preference.export-location-mode'
export const PASTE_TARGET_PREFERENCE_KEY = 'moonsprite.preference.paste-target'
export const LAST_SAVE_DIRECTORY_PREFERENCE_KEY = 'moonsprite.preference.last-save-directory'
export const LAST_EXPORT_DIRECTORY_PREFERENCE_KEY = 'moonsprite.preference.last-export-directory'
export const NEW_DOCUMENT_SIZE_PRESETS_KEY = 'moonsprite.preference.new-document-size-presets'
export const EXPORT_SCALE_PRESETS_KEY = 'moonsprite.preference.export-scale-presets'
export const ROTATION_INDICATOR_POSITION_KEY = 'moonsprite.preference.rotation-indicator-position'
export const EXPORT_PROTECTION_KEY = 'moonsprite.preference.export-protection'
export const REFERENCE_SCALING_KEY = 'moonsprite.preference.reference-scaling'
export const CANVAS_VIEW_SCROLLBARS_ENABLED_KEY = 'moonsprite.preference.canvas-view-scrollbars-enabled'
export const DRAWING_BRUSH_PREVIEW_ENABLED_KEY = 'moonsprite.preference.drawing-brush-preview-enabled'
export const RELATIVE_LUMINANCE_SCOPE_KEY = 'moonsprite.preference.relative-luminance-scope'
export const LANGUAGE_PREFERENCE_KEY = APP_LANGUAGE_PREFERENCE_KEY
export const RECOVERY_PREFERENCE_KEY = 'moonsprite.preference.recovery'
export const RECOVERY_MINUTES_PREFERENCE_KEY = 'moonsprite.preference.recovery-minutes'
export const RECOVERY_RETENTION_DAYS_PREFERENCE_KEY = 'moonsprite.preference.recovery-retention-days'
export const PROJECT_BACKUP_ENABLED_PREFERENCE_KEY = 'moonsprite.preference.project-backup-enabled'
export const PROJECT_BACKUP_VERSIONS_PREFERENCE_KEY = 'moonsprite.preference.project-backup-versions'
export const PROJECT_BACKUP_RETENTION_DAYS_PREFERENCE_KEY = 'moonsprite.preference.project-backup-retention-days'
export const PROJECT_BACKUP_DIRECTORY_PREFERENCE_KEY = 'moonsprite.preference.project-backup-directory'
export const LOCAL_HISTORY_ENABLED_PREFERENCE_KEY = 'moonsprite.preference.local-history-enabled'
export const LOCAL_HISTORY_LIMIT_PREFERENCE_KEY = 'moonsprite.preference.local-history-limit'
export const HISTORY_LIMIT_PREFERENCE_KEY = 'moonsprite.preference.history-limit'
export const HISTORY_LIMIT_ENABLED_PREFERENCE_KEY = 'moonsprite.preference.history-limit-enabled'
export const ZOOM_TOOL_DRAG_MODE_PREFERENCE_KEY = 'moonsprite.preference.zoom-tool-drag-mode'
export const VIEW_DRAG_SENSITIVITY_PREFERENCE_KEY = 'moonsprite.preference.view-drag-sensitivity'
export const WHEEL_ZOOM_MODE_PREFERENCE_KEY = 'moonsprite.preference.wheel-zoom-mode'
export const BRUSH_SHIFT_LINE_ENABLED_KEY = 'moonsprite.preference.brush-shift-line-enabled'
export const USE_LOCAL_CURSORS_PREFERENCE_KEY = 'moonsprite.preference.use-local-cursors'
export const PAINTING_CURSOR_TYPE_KEY = 'moonsprite.preference.painting-cursor-type'
export const CURSOR_SCALE_PREFERENCE_KEY = 'moonsprite.preference.cursor-scale'
export const CURSOR_COLOR_PREFERENCE_KEY = 'moonsprite.preference.cursor-color'
export const CURSOR_COLOR_MODE_PREFERENCE_KEY = 'moonsprite.preference.cursor-color-mode'
export const BRUSH_EDGE_THICKNESS_PREFERENCE_KEY = 'moonsprite.preference.brush-edge-thickness'
export const BRUSH_PREVIEW_MODE_PREFERENCE_KEY = 'moonsprite.preference.brush-preview-mode'
export const CHECKER_SIZE_PREFERENCE_KEY = 'moonsprite.preference.checker-size'
export const CHECKER_LIGHT_COLOR_PREFERENCE_KEY = 'moonsprite.preference.checker-light-color'
export const CHECKER_DARK_COLOR_PREFERENCE_KEY = 'moonsprite.preference.checker-dark-color'
export const PIXEL_GRID_COLOR_PREFERENCE_KEY = 'moonsprite.preference.pixel-grid-color'
export const GRID_COLOR_PREFERENCE_KEY = 'moonsprite.preference.grid-color'
export const GRID_ALIGNMENT_ENABLED_PREFERENCE_KEY = 'moonsprite.preference.grid-alignment-enabled'
export const SMART_ALIGNMENT_ENABLED_PREFERENCE_KEY = 'moonsprite.preference.smart-alignment-enabled'
export const ALIGNMENT_GUIDES_VISIBLE_PREFERENCE_KEY = 'moonsprite.preference.alignment-guides-visible'
export const ALIGNMENT_THRESHOLD_PREFERENCE_KEY = 'moonsprite.preference.alignment-threshold'
export const SLICE_COLOR_PREFERENCE_KEY = 'moonsprite.preference.slice-color'
export const FREE_TILE_INSTANCE_OUTLINE_COLOR_PREFERENCE_KEY = 'moonsprite.preference.free-tile-instance-outline-color'
export const TEXT_BOX_COLOR_PREFERENCE_KEY = 'moonsprite.preference.text-box-color'
export const CANVAS_RESIZE_COLOR_PREFERENCE_KEY = 'moonsprite.preference.canvas-resize-color'
export const SLICE_OUTLINES_VISIBLE_PREFERENCE_KEY = 'moonsprite.preference.slice-outlines-visible'
export const BRUSH_SIZE_WHEEL_REVERSED_PREFERENCE_KEY = 'moonsprite.preference.brush-size-wheel-reversed'
export const WHEEL_ZOOM_ENABLED_PREFERENCE_KEY = 'moonsprite.preference.wheel-zoom-enabled'
export const SHIFT_LINE_PREVIEW_ENABLED_PREFERENCE_KEY = 'moonsprite.preference.shift-line-preview-enabled'
export const GRADIENT_LINE_VISIBLE_PREFERENCE_KEY = 'moonsprite.preference.gradient-line-visible'
export const GRADIENT_LINE_COLOR_PREFERENCE_KEY = 'moonsprite.preference.gradient-line-color'
export const LASSO_PREVIEW_CLOSED_PREFERENCE_KEY = 'moonsprite.preference.lasso-preview-closed'
export const EYEDROPPER_QUICK_SELECT_PREFERENCE_KEY = 'moonsprite.preference.eyedropper-quick-select'
export const TOOLTIPS_ENABLED_PREFERENCE_KEY = 'moonsprite.preference.tooltips-enabled'
export const KEY_DISPLAY_ENABLED_PREFERENCE_KEY = 'moonsprite.preference.key-display-enabled'
export const KEY_DISPLAY_FUNCTION_PREFERENCE_KEY = 'moonsprite.preference.key-display-function'
export const KEY_DISPLAY_SIZE_PREFERENCE_KEY = 'moonsprite.preference.key-display-size'
export const KEY_DISPLAY_DURATION_PREFERENCE_KEY = 'moonsprite.preference.key-display-duration'
export const EYEDROPPER_SWITCH_TO_PENCIL_PREFERENCE_KEY = 'moonsprite.preference.eyedropper-switch-to-pencil'
export const EYEDROPPER_MAGNIFIER_ENABLED_PREFERENCE_KEY = 'moonsprite.preference.eyedropper-magnifier-enabled'
export const EYEDROPPER_MAGNIFIER_STYLE_PREFERENCE_KEY = 'moonsprite.preference.eyedropper-magnifier-style'
export const EYEDROPPER_MAGNIFIER_SIZE_PREFERENCE_KEY = 'moonsprite.preference.eyedropper-magnifier-size'
export const EYEDROPPER_MAGNIFIER_DISTORTION_ENABLED_PREFERENCE_KEY = 'moonsprite.preference.eyedropper-magnifier-distortion-enabled'
export const MOVE_LAYER_CONTENT_PREVIEW_ENABLED_PREFERENCE_KEY = 'moonsprite.preference.move-layer-content-preview-enabled'
export const MOVE_LAYER_CLICK_FLASH_ENABLED_PREFERENCE_KEY = 'moonsprite.preference.move-layer-click-flash-enabled'
export const MOVE_LAYER_CLICK_FLASH_DURATION_PREFERENCE_KEY = 'moonsprite.preference.move-layer-click-flash-duration'
export const SELECTION_CROSSHAIR_PREFERENCE_KEY = 'moonsprite.preference.selection-crosshair'
export const SELECTION_PREVIEW_COLOR_MODE_PREFERENCE_KEY = 'moonsprite.preference.selection-preview-color-mode'
export const SELECTION_PREVIEW_COLOR_PREFERENCE_KEY = 'moonsprite.preference.selection-preview-color'
export const SELECTION_SIZE_VISIBLE_PREFERENCE_KEY = 'moonsprite.preference.selection-size-visible'
export const BALANCED_SHIFT_LINE_ENABLED_PREFERENCE_KEY = 'moonsprite.preference.balanced-shift-line-enabled'
export const OPTIMIZED_ROTATION_ENABLED_PREFERENCE_KEY = 'moonsprite.preference.optimized-rotation-enabled'
export const LINE_DIRECTION_STEP_PREFERENCE_KEY = 'moonsprite.preference.line-direction-step'
export const LAYER_DISPLAY_COLOR_PRESETS_KEY = 'moonsprite.preference.layer-display-color-presets'
export const COLOR_EDITOR_MODES_PREFERENCE_KEY = 'moonsprite.preference.color-editor-modes'
export const PIXEL_FORMAT_PREFERENCE_KEY = 'moonsprite.preference.pixel-format'
export const ONION_SKIN_PREFERENCE_KEY = 'moonsprite.preference.onion-skin'
export const TIMELINE_HIDDEN_PREFERENCE_KEY = 'moonsprite.preference.timeline-hidden'
export const SYMMETRY_AXIS_PREFERENCE_KEY = 'moonsprite.preference.symmetry-axis'
export const ISO_VIEW_PREFERENCE_KEY = 'moonsprite.preference.iso-view'
export const ISO_VIEW_PREFERENCES_PREVIEW_EVENT = 'moonsprite:iso-view-preferences-preview'
export const TIMELAPSE_RECORDING_ENABLED_PREFERENCE_KEY = 'moonsprite.preference.timelapse-recording-enabled'
export const QUICK_COMMAND_BAR_ENABLED_PREFERENCE_KEY = 'moonsprite.preference.quick-command-bar-enabled'
export const QUICK_COMMAND_BAR_EXPANDED_PREFERENCE_KEY = 'moonsprite.preference.quick-command-bar-expanded'
export const QUICK_COMMAND_BAR_TRANSLUCENT_PREFERENCE_KEY = 'moonsprite.preference.quick-command-bar-translucent'
export const QUICK_COMMAND_PREFERENCES_KEY = 'moonsprite.preference.quick-command-items'
export const QUICK_COMMAND_BARS_PREFERENCE_KEY = 'moonsprite.preference.quick-command-bars'
export const UI_SCALE_PREFERENCE_KEY = 'moonsprite.preference.ui-scale'
export const BODY_FONT_SCALE_PREFERENCE_KEY = 'moonsprite.preference.body-font-scale'
export const TOOL_ICON_SCALE_PREFERENCE_KEY = 'moonsprite.preference.tool-icon-scale'
export const ANIMATIONS_ENABLED_PREFERENCE_KEY = 'moonsprite.preference.animations-enabled'
export const UI_MOTION_LEVEL_PREFERENCE_KEY = 'moonsprite.preference.ui-motion-level'
export const ANIMATION_PLAYBACK_RATE_PREFERENCE_KEY = 'moonsprite.preference.animation-playback-rate'
export const ANIMATION_PLAYBACK_MODE_PREFERENCE_KEY = 'moonsprite.preference.animation-playback-mode'
export const ANIMATION_RETURN_TO_START_PREFERENCE_KEY = 'moonsprite.preference.animation-return-to-start'
export const SKIP_DISABLED_FRAMES_PREFERENCE_KEY = 'moonsprite.preference.skip-disabled-frames'
export const TABLET_PREFERENCES_KEY = 'moonsprite.preference.tablet'
/** Last-used selection outline settings shared by new projects. */
export const OUTLINE_SETTINGS_PREFERENCE_KEY = 'moonsprite.preference.outline-settings'
export { THEME_PREFERENCE_KEY }

export type RotationIndicatorPosition = 'view' | 'canvas' | 'pointer-left'
export type RelativeLuminanceScope = 'canvas' | 'app'
export type ZoomToolDragMode = 'smooth' | 'stepped'
export type WheelZoomMode = 'smooth' | 'stepped'
export const VIEW_DRAG_SENSITIVITY_VALUES = [0.5, 0.75, 1, 1.5, 2] as const
export type ViewDragSensitivity = typeof VIEW_DRAG_SENSITIVITY_VALUES[number]
export type PaintingCursorType = 'simple' | 'sprite' | 'sprite-unscaled'
export type CursorScale = 1 | 1.25 | 1.5 | 2 | 3 | 4
export type CursorColorMode = 'auto' | 'custom'
export type MoveLayerClickFlashDuration = 80 | 120 | 180
export const MOVE_LAYER_CLICK_FLASH_DURATIONS: readonly MoveLayerClickFlashDuration[] = [80, 120, 180]
export type KeyDisplayDuration = 800 | 1400 | 2000 | 3000
export const KEY_DISPLAY_DURATIONS: readonly KeyDisplayDuration[] = [800, 1400, 2000, 3000]
export const UI_SCALE_VALUES = [0.75, 1, 1.25, 1.5, 2] as const
export type UiScale = typeof UI_SCALE_VALUES[number]
/** Display-only scale for interface body text; it intentionally does not scale canvas or icons. */
export const BODY_FONT_SCALE_VALUES = [0.85, 1, 1.15, 1.3] as const
export type BodyFontScale = typeof BODY_FONT_SCALE_VALUES[number]
export type ToolIconScale = 1 | 2
export type UiMotionLevel = 'off' | 'subtle' | 'normal' | 'full'
export type TimelinePlaybackModePreference = 'once' | 'all' | 'tag'
export const UI_MOTION_LEVELS: readonly UiMotionLevel[] = ['off', 'subtle', 'normal', 'full']
export const ANIMATION_PLAYBACK_RATES = [0.25, 0.5, 1, 1.5, 2, 3] as const
export type TabletApi = 'auto' | 'windows-ink' | 'disabled'
export type TabletTouchMode = 'navigate' | 'draw' | 'disabled'
export type TabletBarrelButtonAction = 'eraser' | 'eyedropper' | 'hand' | 'disabled'
export const RIGHT_CLICK_ACTIONS = ['background', 'foreground-eyedropper', 'eraser', 'hand', 'rectangle', 'lasso', 'select-layer-move'] as const
export type RightClickAction = typeof RIGHT_CLICK_ACTIONS[number]
export const parseRightClickAction = (value: unknown): RightClickAction =>
  RIGHT_CLICK_ACTIONS.includes(value as RightClickAction) ? value as RightClickAction : 'background'

export interface TabletPreferences {
  api: TabletApi
  pressureEnabled: boolean
  tiltEnabled: boolean
  twistEnabled: boolean
  eraserTipEnabled: boolean
  barrelButtonAction: TabletBarrelButtonAction
  rightClickAction: RightClickAction
  touchMode: TabletTouchMode
  twoFingerZoomEnabled: boolean
  twoFingerRotateEnabled: boolean
  assistPanel: 'auto' | 'on' | 'off'
  gestureUndoEnabled: boolean
  rotationSnapEnabled: boolean
  longPressEyedropper: boolean
}
export const DEFAULT_TABLET_PREFERENCES: TabletPreferences = {
  api: 'auto',
  pressureEnabled: true,
  tiltEnabled: false,
  twistEnabled: false,
  eraserTipEnabled: true,
  barrelButtonAction: 'eraser',
  rightClickAction: 'background',
  touchMode: 'navigate',
  twoFingerZoomEnabled: true,
  twoFingerRotateEnabled: false,
  assistPanel: 'auto', gestureUndoEnabled: true,
  rotationSnapEnabled: true, longPressEyedropper: false
}
export type BrushPreviewMode = 'none' | 'edge' | 'full' | 'full-edge'
export type { PixelFormat } from '@shared/types-raster'
import type { PixelFormat } from '@shared/types-raster'
export type SelectionPreviewColorMode = 'auto' | 'custom'
export type EyedropperMagnifierStyle = 'pixel' | 'line'
export const EYEDROPPER_MAGNIFIER_SIZE_VALUES = [0.5, 0.75, 1, 1.25] as const
export type EyedropperMagnifierSize = typeof EYEDROPPER_MAGNIFIER_SIZE_VALUES[number]
export type CheckerSize = number

export const QUICK_COMMAND_IDS = [
  'cut', 'copy', 'copyMerged', 'paste', 'pasteToCurrentCell', 'pasteAsNewDocument', 'pasteAsNewLayer', 'deleteContent', 'quickOutline', 'outline',
  'selectionFlipHorizontal',
  'selectionFlipVertical',
  'canvasMirrorHorizontal',
  'canvasMirrorVertical',
  'invertSelection',
  'customGrid',
  'tileRepeatX',
  'tileRepeatY',
  'tileRepeatBoth',
  'undo',
  'redo',
  'selectAll',
  'deselect',
  'pixelGrid',
  'selectionOutline',
  'relativeLuminance',
  'resetView',
  'fillForeground',
  'deleteSelection',
  'quickAntiAlias',
  'swapForegroundBackground',
  'createBrushFromSelection',
  'rotateViewClockwise90',
  'rotateViewCounterClockwise90',
  'detectImageScale',
  'centerSelectionBoth',
  'centerSelectionHorizontal',
  'centerSelectionVertical'
] as const

export type QuickCommandId = typeof QUICK_COMMAND_IDS[number]

export interface QuickCommandPreference {
  id: QuickCommandId
  enabled: boolean
}

export type QuickCommandBarEdge = 'top' | 'right' | 'bottom' | 'left' | 'none'

export interface QuickCommandBarPreference {
  id: string
  name: string
  edge: QuickCommandBarEdge
  position: number
  expanded: boolean
  commands: QuickCommandPreference[]
}

const DEFAULT_QUICK_COMMAND_GROUPS: readonly (readonly QuickCommandId[])[] = [
  ['selectionFlipHorizontal', 'selectionFlipVertical', 'canvasMirrorHorizontal', 'canvasMirrorVertical', 'invertSelection', 'customGrid', 'tileRepeatBoth', 'relativeLuminance', 'detectImageScale', 'centerSelectionBoth', 'centerSelectionHorizontal', 'centerSelectionVertical', 'quickAntiAlias'],
  ['undo', 'redo', 'cut', 'copy', 'copyMerged', 'paste', 'pasteToCurrentCell', 'pasteAsNewDocument', 'pasteAsNewLayer', 'deleteContent', 'fillForeground', 'quickOutline', 'outline', 'selectionFlipHorizontal', 'selectionFlipVertical', 'centerSelectionBoth', 'centerSelectionHorizontal', 'centerSelectionVertical', 'quickAntiAlias'],
  ['selectionFlipHorizontal'],
  ['selectionFlipHorizontal']
]

const PREVIOUS_DEFAULT_QUICK_COMMAND_GROUPS: readonly (readonly QuickCommandId[])[] = [
  DEFAULT_QUICK_COMMAND_GROUPS[0],
  ['tileRepeatX', 'tileRepeatY', 'pixelGrid', 'selectionOutline', 'resetView'],
  ['undo', 'redo', 'fillForeground', 'deleteSelection', 'swapForegroundBackground'],
  ['selectAll', 'deselect', 'createBrushFromSelection', 'rotateViewClockwise90', 'rotateViewCounterClockwise90']
]

const EARLIER_DEFAULT_QUICK_COMMAND_GROUPS: readonly (readonly QuickCommandId[])[] = [
  DEFAULT_QUICK_COMMAND_GROUPS[0],
  ['undo', 'redo', 'relativeLuminance', 'resetView', 'rotateViewClockwise90', 'rotateViewCounterClockwise90'],
  ['tileRepeatX', 'tileRepeatY', 'pixelGrid', 'selectionOutline', 'fillForeground'],
  ['selectAll', 'deselect', 'deleteSelection', 'swapForegroundBackground', 'createBrushFromSelection']
]

const RECENT_DEFAULT_QUICK_COMMAND_GROUPS: readonly (readonly QuickCommandId[])[] = [
  DEFAULT_QUICK_COMMAND_GROUPS[0],
  ['undo', 'redo', 'relativeLuminance', 'resetView', 'rotateViewClockwise90', 'rotateViewCounterClockwise90'],
  DEFAULT_QUICK_COMMAND_GROUPS[2],
  DEFAULT_QUICK_COMMAND_GROUPS[3]
]

const createQuickCommandPreferences = (enabledIds: readonly QuickCommandId[]): QuickCommandPreference[] => {
  const enabled = new Set(enabledIds)
  return [...enabledIds, ...QUICK_COMMAND_IDS.filter(id => !enabled.has(id))].map((id) => ({ id, enabled: enabled.has(id) }))
}

export const DEFAULT_QUICK_COMMAND_PREFERENCES: QuickCommandPreference[] = createQuickCommandPreferences(DEFAULT_QUICK_COMMAND_GROUPS[0])

const LEGACY_DEFAULT_QUICK_COMMAND_ENABLED_IDS = new Set<QuickCommandId>([
  'selectionFlipHorizontal',
  'selectionFlipVertical',
  'canvasMirrorHorizontal',
  'canvasMirrorVertical',
  'invertSelection',
  'customGrid',
  'tileRepeatX',
  'tileRepeatY',
  'tileRepeatBoth',
  'relativeLuminance',
  'detectImageScale',
  'centerSelectionBoth',
  'centerSelectionHorizontal',
  'centerSelectionVertical'
])

const QUICK_COMMAND_ID_SET = new Set<string>(QUICK_COMMAND_IDS)

export function parseQuickCommandPreferences(value: string | null): QuickCommandPreference[] {
  const fallback = (): QuickCommandPreference[] => DEFAULT_QUICK_COMMAND_PREFERENCES.map((item) => ({ ...item }))
  if (!value) return fallback()
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) return fallback()
    const seen = new Set<QuickCommandId>()
    const preferences: QuickCommandPreference[] = []
    for (const candidate of parsed) {
      if (!candidate || typeof candidate !== 'object') continue
      const id = (candidate as { id?: unknown }).id
      if (typeof id !== 'string' || !QUICK_COMMAND_ID_SET.has(id) || seen.has(id as QuickCommandId)) continue
      seen.add(id as QuickCommandId)
      preferences.push({ id: id as QuickCommandId, enabled: (candidate as { enabled?: unknown }).enabled === true })
    }
    if (preferences.length === 0) return fallback()
    for (const item of DEFAULT_QUICK_COMMAND_PREFERENCES) if (!seen.has(item.id)) preferences.push({ ...item })
    if (!preferences.some((item) => item.enabled)) preferences[0] = { ...preferences[0], enabled: true }
    return preferences
  } catch {
    return fallback()
  }
}

export const DEFAULT_QUICK_COMMAND_BARS: QuickCommandBarPreference[] = DEFAULT_QUICK_COMMAND_GROUPS.map((group, index) => ({
  id: `quick-command-bar-${index + 1}`,
  name: ['默认快捷指令栏', '编辑快捷指令栏', '快捷指令栏1', '快捷指令栏2'][index],
  edge: index === 0 ? 'top' : 'none',
  position: 0.5,
  expanded: false,
  commands: createQuickCommandPreferences(group)
}))

const QUICK_COMMAND_EDGE_SET = new Set<QuickCommandBarEdge>(['top', 'right', 'bottom', 'left', 'none'])
const isLegacyDefaultQuickCommandBar = (bar: QuickCommandBarPreference): boolean => bar.commands.length === QUICK_COMMAND_IDS.length && bar.commands.every((item) => item.enabled === LEGACY_DEFAULT_QUICK_COMMAND_ENABLED_IDS.has(item.id))
const isQuickCommandGroup = (bar: QuickCommandBarPreference, group: readonly QuickCommandId[]): boolean => {
  const enabled = new Set(group)
  return bar.commands.length === QUICK_COMMAND_IDS.length && bar.commands.every((item) => item.enabled === enabled.has(item.id))
}
const normalizeQuickCommandBar = (candidate: unknown, index: number, fallbackCommands: QuickCommandPreference[]): QuickCommandBarPreference | null => {
  if (!candidate || typeof candidate !== 'object') return null
  const value = candidate as Partial<QuickCommandBarPreference>
  const commands = parseQuickCommandPreferences(JSON.stringify(value.commands))
  const edge = QUICK_COMMAND_EDGE_SET.has(value.edge as QuickCommandBarEdge) ? value.edge as QuickCommandBarEdge : 'top'
  const position = typeof value.position === 'number' && Number.isFinite(value.position) ? Math.min(1, Math.max(0, value.position)) : 0.5
  return {
    id: typeof value.id === 'string' && value.id.trim() ? value.id : `quick-command-bar-${index + 1}`,
    name: typeof value.name === 'string' && value.name.trim() ? value.name.trim().slice(0, 32) : DEFAULT_QUICK_COMMAND_BARS[index].name,
    edge,
    position,
    expanded: value.expanded === true,
    commands: Array.isArray(value.commands) ? commands : fallbackCommands.map((item) => ({ ...item }))
  }
}

export function parseQuickCommandBars(value: string | null, legacyCommands = DEFAULT_QUICK_COMMAND_PREFERENCES): QuickCommandBarPreference[] {
  const fallback = (): QuickCommandBarPreference[] => DEFAULT_QUICK_COMMAND_BARS.map((bar) => ({ ...bar, commands: bar.commands.map((item) => ({ ...item })) }))
  if (!value) return fallback()
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) return fallback()
    const bars: QuickCommandBarPreference[] = []
    const seen = new Set<string>()
    for (let index = 0; index < parsed.length && bars.length < 4; index += 1) {
      const bar = normalizeQuickCommandBar(parsed[index], index, legacyCommands)
      if (!bar || seen.has(bar.id)) continue
      seen.add(bar.id)
      bars.push(bar)
    }
    if (bars.length === 0) return fallback()
    bars.forEach((bar, index) => {
      const oldDefaultName = /^快捷指令栏\s*\d+$/.test(bar.name) || /^Quick Command Bar\s*\d+$/i.test(bar.name)
      if (!oldDefaultName) return
      bar.name = DEFAULT_QUICK_COMMAND_BARS[index].name
      if (index === 1 && isQuickCommandGroup(bar, ['undo', 'redo', 'resetView', 'rotateViewClockwise90', 'rotateViewCounterClockwise90'])) {
        bar.commands = createQuickCommandPreferences(DEFAULT_QUICK_COMMAND_GROUPS[1])
        if (bar.edge === 'none') bar.edge = 'bottom'
      }
    })
    if (bars.length === 1 && isLegacyDefaultQuickCommandBar(bars[0])) {
      bars[0] = { ...bars[0], edge: 'top', commands: DEFAULT_QUICK_COMMAND_BARS[0].commands.map((item) => ({ ...item })) }
    }
    if (bars.length === DEFAULT_QUICK_COMMAND_BARS.length && (bars.every((bar, index) => isQuickCommandGroup(bar, PREVIOUS_DEFAULT_QUICK_COMMAND_GROUPS[index])) || bars.every((bar, index) => isQuickCommandGroup(bar, EARLIER_DEFAULT_QUICK_COMMAND_GROUPS[index])) || bars.every((bar, index) => isQuickCommandGroup(bar, RECENT_DEFAULT_QUICK_COMMAND_GROUPS[index])))) {
      bars.splice(0, bars.length, ...DEFAULT_QUICK_COMMAND_BARS.map((bar, index) => ({ ...bars[index], name: bars[index].name, edge: bars[index].edge, position: bars[index].position, expanded: bars[index].expanded, commands: bar.commands.map((item) => ({ ...item })) })))
    }
    for (let index = bars.length; index < DEFAULT_QUICK_COMMAND_BARS.length; index += 1) {
      const template = DEFAULT_QUICK_COMMAND_BARS[index]
      let id = template.id
      let suffix = 1
      while (seen.has(id)) id = `${template.id}-${suffix++}`
      seen.add(id)
      bars.push({ ...template, id, commands: template.commands.map((item) => ({ ...item })) })
    }
    return bars
  } catch {
    return fallback()
  }
}

export interface CheckerboardPreferences {
  size: CheckerSize
  lightColor: RgbaColor
  darkColor: RgbaColor
}

export const DEFAULT_CHECKERBOARD_PREFERENCES: CheckerboardPreferences = {
  size: 16,
  lightColor: { r: 192, g: 192, b: 192, a: 255 },
  darkColor: { r: 128, g: 128, b: 128, a: 255 }
}

export const DEFAULT_PIXEL_GRID_COLOR: RgbaColor = { r: 69, g: 77, b: 92, a: 143 }
export const DEFAULT_GRID_COLOR: RgbaColor = { r: 0, g: 0, b: 255, a: 255 }
export const DEFAULT_SLICE_COLOR: RgbaColor = { r: 0, g: 0, b: 255, a: 255 }
export const DEFAULT_FREE_TILE_INSTANCE_OUTLINE_COLOR: RgbaColor = { r: 0, g: 0, b: 255, a: 255 }
export const DEFAULT_TEXT_BOX_COLOR: RgbaColor = { r: 0, g: 0, b: 255, a: 255 }
export const DEFAULT_CANVAS_RESIZE_COLOR: RgbaColor = { r: 0, g: 0, b: 255, a: 255 }
export const DEFAULT_SELECTION_PREVIEW_COLOR: RgbaColor = { r: 0, g: 0, b: 255, a: 255 }
export const DEFAULT_CURSOR_COLOR: RgbaColor = { r: 255, g: 255, b: 255, a: 255 }
export const DEFAULT_GRADIENT_LINE_COLOR: RgbaColor = { r: 0, g: 0, b: 255, a: 255 }

export function parseRotationIndicatorPosition(value: string | null): RotationIndicatorPosition {
  return value === 'canvas' || value === 'view' ? value : 'pointer-left'
}

export function parseDrawingBrushPreviewEnabled(value: string | null): boolean {
  return value !== 'false'
}

export function parseRelativeLuminanceScope(value: string | null): RelativeLuminanceScope {
  return value === 'app' ? 'app' : 'canvas'
}

export function parseZoomToolDragMode(value: string | null): ZoomToolDragMode {
  return value === 'smooth' ? 'smooth' : 'stepped'
}

export function parseViewDragSensitivity(value: string | null): ViewDragSensitivity {
  const parsed = Number(value)
  return VIEW_DRAG_SENSITIVITY_VALUES.includes(parsed as ViewDragSensitivity) ? parsed as ViewDragSensitivity : 1
}

export function parseWheelZoomMode(value: string | null): WheelZoomMode {
  return value === 'smooth' ? 'smooth' : 'stepped'
}

export function parseBrushShiftLineEnabled(value: string | null): boolean {
  return value !== 'false'
}

export function parsePaintingCursorType(value: string | null): PaintingCursorType {
  return value === 'sprite' || value === 'sprite-unscaled' ? value : 'simple'
}

export function parseCursorScale(value: string | null): CursorScale {
  const parsed = Number(value)
  return parsed === 1.25 || parsed === 1.5 || parsed === 2 || parsed === 3 || parsed === 4 ? parsed : 1
}

export function parseCursorColorMode(value: string | null): CursorColorMode {
  return value === 'custom' ? 'custom' : 'auto'
}

export function parseBrushEdgeThickness(value: string | null): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(1, Math.min(8, Math.round(parsed))) : 1
}

export function parseKeyDisplaySize(value: string | null): number {
  const parsed = Number(value)
  if (parsed === 0.75 || parsed === 1.3 || parsed === 1.9 || parsed === 2.5) return parsed
  // Preserve older saved sizes; the former compact standard is now Small.
  if (parsed === 1 || parsed === 1.25) return 1.3
  if (parsed === 1.4 || parsed === 1.5 || parsed === 1.8) return 1.9
  return 1.3
}

export function parseKeyDisplayDuration(value: string | null): KeyDisplayDuration {
  const parsed = Number(value)
  return KEY_DISPLAY_DURATIONS.includes(parsed as KeyDisplayDuration) ? parsed as KeyDisplayDuration : 1400
}

export function parseUiScale(value: string | null): UiScale {
  const parsed = Number(value)
  return UI_SCALE_VALUES.includes(parsed as UiScale) ? parsed as UiScale : 1
}

export function parseBodyFontScale(value: string | null): BodyFontScale {
  const parsed = Number(value)
  return BODY_FONT_SCALE_VALUES.includes(parsed as BodyFontScale) ? parsed as BodyFontScale : 1
}

export function parseToolIconScale(value: string | null): ToolIconScale {
  return value === '2' ? 2 : 1
}

export function parseBrushPreviewMode(value: string | null): BrushPreviewMode {
  return value === 'none' || value === 'edge' || value === 'full' || value === 'full-edge' ? value : 'full'
}

export function parsePixelFormat(value: string | null): PixelFormat {
  return isPixelFormat(value) ? value : 'rgba32'
}

export function parseSelectionPreviewColorMode(value: string | null): SelectionPreviewColorMode {
  return value === 'custom' ? 'custom' : 'auto'
}

export function parseEyedropperMagnifierStyle(value: string | null): EyedropperMagnifierStyle {
  return value === 'line' ? 'line' : 'pixel'
}

export function parseEyedropperMagnifierSize(value: string | null): EyedropperMagnifierSize {
  const parsed = Number(value)
  return EYEDROPPER_MAGNIFIER_SIZE_VALUES.includes(parsed as EyedropperMagnifierSize) ? parsed as EyedropperMagnifierSize : 1
}

export function parseCheckerSize(value: string | null): CheckerSize {
  if (value === null || value.trim() === '') return DEFAULT_CHECKERBOARD_PREFERENCES.size
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(1, Math.min(256, Math.round(parsed))) : DEFAULT_CHECKERBOARD_PREFERENCES.size
}

export function parseLineDirectionStep(value: string | null): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(1, Math.min(16, Math.round(parsed))) : 1
}

export function parseAnimationPlaybackRate(value: string | null): number {
  const parsed = Number(value)
  return ANIMATION_PLAYBACK_RATES.includes(parsed as typeof ANIMATION_PLAYBACK_RATES[number]) ? parsed : 1
}

export function parseAnimationPlaybackMode(value: string | null): TimelinePlaybackModePreference | null {
  return value === 'once' || value === 'all' || value === 'tag' ? value : null
}

const parseHexColor = (value: string | null, fallback: RgbaColor): RgbaColor => {
  const match = value?.trim().match(/^#?([0-9a-f]{6})([0-9a-f]{2})?$/i)
  if (!match) return { ...fallback }
  const rgb = Number.parseInt(match[1], 16)
  return { r: (rgb >> 16) & 255, g: (rgb >> 8) & 255, b: rgb & 255, a: match[2] ? Number.parseInt(match[2], 16) : 255 }
}

const colorHex = (color: RgbaColor): string => `#${[color.r, color.g, color.b, color.a].map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, '0')).join('')}`

export function loadCheckerboardPreferences(storage?: Storage): CheckerboardPreferences {
  const get = (key: string): string | null => readStoredString(key, storage)
  return {
    size: parseCheckerSize(get(CHECKER_SIZE_PREFERENCE_KEY)),
    lightColor: parseHexColor(get(CHECKER_LIGHT_COLOR_PREFERENCE_KEY), DEFAULT_CHECKERBOARD_PREFERENCES.lightColor),
    darkColor: parseHexColor(get(CHECKER_DARK_COLOR_PREFERENCE_KEY), DEFAULT_CHECKERBOARD_PREFERENCES.darkColor)
  }
}

export interface GridColorPreferences {
  pixelGridColor: RgbaColor
  gridColor: RgbaColor
}

export function loadGridColorPreferences(storage?: Storage): GridColorPreferences {
  const get = (key: string): string | null => readStoredString(key, storage)
  return {
    pixelGridColor: parseHexColor(get(PIXEL_GRID_COLOR_PREFERENCE_KEY), DEFAULT_PIXEL_GRID_COLOR),
    gridColor: parseHexColor(get(GRID_COLOR_PREFERENCE_KEY), DEFAULT_GRID_COLOR)
  }
}

export interface DocumentSizePreset { width: number; height: number }

export const DEFAULT_DOCUMENT_SIZE_PRESETS: DocumentSizePreset[] = [
  { width: 16, height: 16 }, { width: 32, height: 32 }, { width: 64, height: 64 },
  { width: 128, height: 128 }, { width: 256, height: 256 }, { width: 320, height: 180 }
]
export const DEFAULT_EXPORT_SCALE_PRESETS = [100, 200, 400, 1000, 2000]
export const DEFAULT_LAYER_DISPLAY_COLOR_PRESETS: RgbaColor[] = [
  { r: 239, g: 83, b: 80, a: 255 },
  { r: 255, g: 167, b: 38, a: 255 },
  { r: 253, g: 216, b: 53, a: 255 },
  { r: 102, g: 187, b: 106, a: 255 },
  { r: 38, g: 198, b: 218, a: 255 },
  { r: 41, g: 121, b: 255, a: 255 },
  { r: 171, g: 71, b: 188, a: 255 }
]
export interface ColorEditorModePreference { mode: ColorValueMode; enabled: boolean }
export const DEFAULT_COLOR_EDITOR_MODES: ColorEditorModePreference[] = [
  { mode: 'hsv', enabled: true },
  { mode: 'rgb', enabled: true },
  { mode: 'lab', enabled: true },
  { mode: 'gray', enabled: true },
  { mode: 'palette', enabled: true },
  { mode: 'hsl', enabled: false },
  { mode: 'cmyk', enabled: false }
]
const LEGACY_DEFAULT_COLOR_EDITOR_MODES: ColorValueMode[] = ['rgb', 'hsv', 'hsl', 'gray', 'lab', 'cmyk']
export type OnionSkinScope = 'current-layer' | 'all-layers'

export interface OnionSkinPreferences {
  enabled: boolean
  scope: OnionSkinScope
  showDuringPlayback: boolean
  previousFrames: number
  nextFrames: number
  previousOpacity: number
  nextOpacity: number
  previousColor: RgbaColor
  nextColor: RgbaColor
}
export const DEFAULT_ONION_SKIN_PREFERENCES: OnionSkinPreferences = {
  enabled: false,
  scope: 'current-layer',
  showDuringPlayback: true,
  previousFrames: 1,
  nextFrames: 1,
  previousOpacity: 35,
  nextOpacity: 35,
  previousColor: { r: 239, g: 83, b: 80, a: 255 },
  nextColor: { r: 41, g: 121, b: 255, a: 255 }
}

export interface SymmetryAxisPreferences {
  locked: boolean
  color: RgbaColor
  thickness: number
}

export const MIN_SYMMETRY_AXIS_THICKNESS = 1
export const MAX_SYMMETRY_AXIS_THICKNESS = 8

export const DEFAULT_SYMMETRY_AXIS_PREFERENCES: SymmetryAxisPreferences = {
  locked: false,
  color: { r: 0, g: 0, b: 255, a: 255 },
  thickness: 1
}

export type IsoGuideLineStyle = 'solid' | 'pixel'

export interface IsoViewPreferences {
  stairStep: number
  guideLineStyle: IsoGuideLineStyle
  guideOriginX: number
  guideOriginY: number
  guideUnitSize: number
  guideColors: Record<IsoGuideLineStyle, RgbaColor>
  guideThickness: number
  forceLineAlignment: boolean
  snapToGrid: boolean
}

export const MIN_ISO_STAIR_STEP = 1
export const MAX_ISO_STAIR_STEP = 16
export const MIN_ISO_GUIDE_UNIT_SIZE = 1
export const MAX_ISO_GUIDE_UNIT_SIZE = 256
export const MIN_ISO_GUIDE_THICKNESS = 1
export const MAX_ISO_GUIDE_THICKNESS = 8
export const ISO_PIXEL_GUIDE_DEFAULT_ALPHA = 26
const LEGACY_DEFAULT_ISO_GUIDE_COLOR = { r: 41, g: 121, b: 255 }

export const DEFAULT_ISO_VIEW_PREFERENCES: IsoViewPreferences = {
  stairStep: ISO_LINE_STAIR_STEP,
  guideLineStyle: 'solid',
  guideOriginX: 0,
  guideOriginY: 0,
  guideUnitSize: ISO_GUIDE_BASE_SPACING,
  guideColors: {
    solid: { r: 57, g: 255, b: 20, a: 160 },
    pixel: { r: 57, g: 255, b: 20, a: ISO_PIXEL_GUIDE_DEFAULT_ALPHA }
  },
  guideThickness: 1,
  forceLineAlignment: true,
  snapToGrid: false
}

export type SaveFormatPreference = 'moonsprite' | 'png' | 'jpeg' | 'webp' | 'svg' | 'ico' | 'psd' | 'ase' | 'aseprite'
export type ExportFormatPreference = 'png' | 'jpeg' | 'webp' | 'svg' | 'gif' | 'bmp' | 'ico' | 'psd'
export type SaveLocationMode = 'recent' | 'fixed'
export type PasteTarget = 'current-cell' | 'new-layer' | 'new-project'

export interface EditorPreferences {
  toolRail: ToolRailPreference[]
  language: AppLocale
  uiScale: UiScale
  bodyFontScale: BodyFontScale
  toolIconScale: ToolIconScale
  uiMotionLevel: UiMotionLevel
  animationsEnabled: boolean
  animationPlaybackRate: number
  animationPlaybackMode: TimelinePlaybackModePreference | null
  animationReturnToStart: boolean
  skipDisabledFrames: boolean
  saveFormat: SaveFormatPreference
  saveOriginalFormat: boolean
  exportFormat: ExportFormatPreference
  /** Whether new unsaved projects start from the shared recent output folder or the fixed folder. */
  saveLocationMode: SaveLocationMode
  exportLocationMode: SaveLocationMode
  pasteTarget: PasteTarget
  saveDirectory: string
  exportDirectory: string
  /** Location remembered by Save and Save As. */
  lastSaveDirectory: string
  /** Shared location remembered by every export operation. */
  lastExportDirectory: string
  recovery: boolean
  recoveryMinutes: number
  recoveryRetentionDays: number
  projectBackupEnabled: boolean
  projectBackupVersions: number
  projectBackupRetentionDays: number
  projectBackupDirectory: string
  /** Keeps undo snapshots in the app data directory instead of project files. */
  localHistoryEnabled: boolean
  localHistoryLimit: number
  /** Maximum number of undoable history steps kept per open project. */
  historyLimit: number
  historyLimitEnabled: boolean
  documentSizePresets: DocumentSizePreset[]
  exportScalePresets: number[]
  rotationIndicatorPosition: RotationIndicatorPosition
  exportProtection: ExportProtection
  referenceScaling: 'smooth' | 'pixelated'
  canvasViewScrollbarsEnabled: boolean
  drawingBrushPreviewEnabled: boolean
  relativeLuminanceScope: RelativeLuminanceScope
  zoomToolDragMode: ZoomToolDragMode
  viewDragSensitivity: ViewDragSensitivity
  brushShiftLineEnabled: boolean
  paintingCursorShape: 'cross' | 'dot'
  paintingCursorType: PaintingCursorType
  useLocalCursors: boolean
  cursorScale: CursorScale
  cursorColorMode: CursorColorMode
  cursorColor: RgbaColor
  brushEdgeThickness: number
  brushPreviewMode: BrushPreviewMode
  checkerboard: CheckerboardPreferences
  pixelGridColor: RgbaColor
  gridColor: RgbaColor
  gridAlignmentEnabled: boolean
  smartAlignmentEnabled: boolean
  alignmentGuidesVisible: boolean
  alignmentThreshold: number
  sliceColor: RgbaColor
  freeTileInstanceOutlineColor: RgbaColor
  textBoxColor: RgbaColor
  canvasResizeColor: RgbaColor
  sliceOutlinesVisible: boolean
  brushSizeWheelReversed: boolean
  wheelZoomEnabled: boolean
  wheelZoomMode: WheelZoomMode
  shiftLinePreviewEnabled: boolean
  gradientLineVisible: boolean
  gradientLineColor: RgbaColor
  lassoPreviewClosed: boolean
  eyedropperQuickSelect: boolean
  tooltipsEnabled: boolean
  keyDisplayEnabled: boolean
  keyDisplayFunction: boolean
  keyDisplaySize: number
  keyDisplayDuration: KeyDisplayDuration
  eyedropperSwitchToPencil: boolean
  eyedropperMagnifierEnabled: boolean
  eyedropperMagnifierStyle: EyedropperMagnifierStyle
  eyedropperMagnifierSize: EyedropperMagnifierSize
  eyedropperMagnifierDistortionEnabled: boolean
  moveLayerContentPreviewEnabled: boolean
  moveLayerClickFlashEnabled: boolean
  moveLayerClickFlashDuration: MoveLayerClickFlashDuration
  selectionCrosshair: boolean
  selectionPreviewColorMode: SelectionPreviewColorMode
  selectionPreviewColor: RgbaColor
  selectionSizeVisible: boolean
  balancedShiftLineEnabled: boolean
  optimizedRotationEnabled: boolean
  lineDirectionStep: number
  layerDisplayColorPresets: RgbaColor[]
  colorEditorModes: ColorEditorModePreference[]
  pixelFormat: PixelFormat
  onionSkin: OnionSkinPreferences
  timelineHidden: boolean
  symmetryAxis: SymmetryAxisPreferences
  isoView: IsoViewPreferences
  timelapseRecordingEnabled: boolean
  quickCommandBarEnabled: boolean
  quickCommandBarExpanded: boolean
  quickCommandBarTranslucent: boolean
  quickCommandPreferences: QuickCommandPreference[]
  quickCommandBars: QuickCommandBarPreference[]
  tablet: TabletPreferences
  outlineSettings: OutlineSettings | null
  theme: ThemePreferences
}

export const DEFAULT_EDITOR_PREFERENCES: EditorPreferences = {
  toolRail: DEFAULT_TOOL_RAIL,
  language: DEFAULT_APP_LOCALE,
  uiScale: 1,
  bodyFontScale: 1,
  toolIconScale: 1,
  uiMotionLevel: 'subtle',
  animationsEnabled: true,
  animationPlaybackRate: 1,
  animationPlaybackMode: null,
  animationReturnToStart: false,
  skipDisabledFrames: true,
  saveFormat: 'moonsprite',
  saveOriginalFormat: true,
  exportFormat: 'png',
  saveLocationMode: 'recent',
  exportLocationMode: 'recent',
  pasteTarget: 'current-cell',
  saveDirectory: '',
  exportDirectory: '',
  lastSaveDirectory: '',
  lastExportDirectory: '',
  recovery: true,
  recoveryMinutes: 5,
  recoveryRetentionDays: 7,
  projectBackupEnabled: true,
  projectBackupVersions: 10,
  projectBackupRetentionDays: 30,
  projectBackupDirectory: '',
  localHistoryEnabled: false,
  localHistoryLimit: 50,
  historyLimit: 1000,
  historyLimitEnabled: false,
  documentSizePresets: DEFAULT_DOCUMENT_SIZE_PRESETS,
  exportScalePresets: DEFAULT_EXPORT_SCALE_PRESETS,
  rotationIndicatorPosition: 'pointer-left',
  exportProtection: 'off',
  referenceScaling: 'smooth',
  canvasViewScrollbarsEnabled: true,
  drawingBrushPreviewEnabled: true,
  relativeLuminanceScope: 'canvas',
  zoomToolDragMode: 'stepped',
  viewDragSensitivity: 1,
  brushShiftLineEnabled: true,
  paintingCursorShape: 'dot',
  paintingCursorType: 'simple',
  useLocalCursors: false,
  cursorScale: 1,
  cursorColorMode: 'auto',
  cursorColor: DEFAULT_CURSOR_COLOR,
  brushEdgeThickness: 1,
  brushPreviewMode: 'full',
  checkerboard: DEFAULT_CHECKERBOARD_PREFERENCES,
  pixelGridColor: DEFAULT_PIXEL_GRID_COLOR,
  gridColor: DEFAULT_GRID_COLOR,
  gridAlignmentEnabled: false,
  smartAlignmentEnabled: false,
  alignmentGuidesVisible: false,
  alignmentThreshold: 6,
  sliceColor: DEFAULT_SLICE_COLOR,
  freeTileInstanceOutlineColor: DEFAULT_FREE_TILE_INSTANCE_OUTLINE_COLOR,
  textBoxColor: DEFAULT_TEXT_BOX_COLOR,
  canvasResizeColor: DEFAULT_CANVAS_RESIZE_COLOR,
  sliceOutlinesVisible: true,
  brushSizeWheelReversed: false,
  wheelZoomEnabled: true,
  wheelZoomMode: 'stepped',
  shiftLinePreviewEnabled: true,
  gradientLineVisible: true,
  gradientLineColor: DEFAULT_GRADIENT_LINE_COLOR,
  lassoPreviewClosed: false,
  eyedropperQuickSelect: false,
  tooltipsEnabled: true,
  keyDisplayEnabled: false,
  keyDisplayFunction: false,
  keyDisplaySize: 1.3,
  keyDisplayDuration: 1400,
  eyedropperSwitchToPencil: false,
  eyedropperMagnifierEnabled: true,
  eyedropperMagnifierStyle: 'pixel',
  eyedropperMagnifierSize: 1,
  eyedropperMagnifierDistortionEnabled: false,
  moveLayerContentPreviewEnabled: true,
  moveLayerClickFlashEnabled: true,
  moveLayerClickFlashDuration: 120,
  selectionCrosshair: false,
  selectionPreviewColorMode: 'auto',
  selectionPreviewColor: DEFAULT_SELECTION_PREVIEW_COLOR,
  selectionSizeVisible: true,
  balancedShiftLineEnabled: true,
  optimizedRotationEnabled: true,
  lineDirectionStep: 1,
  layerDisplayColorPresets: DEFAULT_LAYER_DISPLAY_COLOR_PRESETS,
  colorEditorModes: DEFAULT_COLOR_EDITOR_MODES,
  pixelFormat: 'rgba32',
  onionSkin: DEFAULT_ONION_SKIN_PREFERENCES,
  timelineHidden: false,
  symmetryAxis: DEFAULT_SYMMETRY_AXIS_PREFERENCES,
  isoView: DEFAULT_ISO_VIEW_PREFERENCES,
  timelapseRecordingEnabled: false,
  quickCommandBarEnabled: true,
  quickCommandBarExpanded: false,
  quickCommandBarTranslucent: false,
  quickCommandPreferences: DEFAULT_QUICK_COMMAND_PREFERENCES,
  quickCommandBars: DEFAULT_QUICK_COMMAND_BARS,
  tablet: DEFAULT_TABLET_PREFERENCES,
  outlineSettings: null,
  theme: DEFAULT_THEME_PREFERENCES
}

let previewPreferences: EditorPreferences | null = null

export function setEditorPreferencesPreview(preferences: EditorPreferences | null): void {
  previewPreferences = preferences
}

const sameColor = (a: RgbaColor, b: RgbaColor): boolean => a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a
const copyPreferences = (preferences: EditorPreferences): EditorPreferences => structuredClone(preferences)

const migrateLegacyThemeColors = (theme: ThemePreferences, get: (key: string) => string | null, checkerboard: CheckerboardPreferences, grid: GridColorPreferences, onionSkin: OnionSkinPreferences, symmetryAxis: SymmetryAxisPreferences): ThemePreferences => {
  if (get(THEME_PREFERENCE_KEY) !== null) return theme
  const colors: Partial<ThemePalette> = {}
  if (get(CHECKER_LIGHT_COLOR_PREFERENCE_KEY) !== null) colors.checkerLight = rgbaHex(checkerboard.lightColor)
  if (get(CHECKER_DARK_COLOR_PREFERENCE_KEY) !== null) colors.checkerDark = rgbaHex(checkerboard.darkColor)
  if (get(PIXEL_GRID_COLOR_PREFERENCE_KEY) !== null) colors.pixelGrid = rgbaHex(grid.pixelGridColor)
  if (get(GRID_COLOR_PREFERENCE_KEY) !== null) colors.customGrid = rgbaHex(grid.gridColor)
  if (get(ONION_SKIN_PREFERENCE_KEY) !== null) {
    colors.onionPrevious = rgbaHex(onionSkin.previousColor)
    colors.onionNext = rgbaHex(onionSkin.nextColor)
  }
  if (get(SYMMETRY_AXIS_PREFERENCE_KEY) !== null) colors.symmetryAxis = rgbaHex(symmetryAxis.color)
  return Object.keys(colors).length > 0 ? withThemePaletteColors(theme, colors) : theme
}

const effectiveThemeColors = (theme: ThemePreferences, get: (key: string) => string | null, storage?: Storage): { theme: ThemePreferences; checkerboard: CheckerboardPreferences; grid: GridColorPreferences; onionSkin: OnionSkinPreferences; symmetryAxis: SymmetryAxisPreferences } => {
  const storedCheckerboard = loadCheckerboardPreferences(storage)
  const storedGrid = loadGridColorPreferences(storage)
  const storedOnionSkin = parseOnionSkinPreferences(get(ONION_SKIN_PREFERENCE_KEY))
  const storedSymmetryAxis = parseSymmetryAxisPreferences(get(SYMMETRY_AXIS_PREFERENCE_KEY))
  const migrated = migrateLegacyThemeColors(theme, get, storedCheckerboard, storedGrid, storedOnionSkin, storedSymmetryAxis)
  const finalTheme = normalizeThemePreferences(migrated)
  const finalResolved = resolveTheme(finalTheme)
  return {
    theme: finalTheme,
    checkerboard: { size: parseCheckerSize(get(CHECKER_SIZE_PREFERENCE_KEY)), lightColor: { ...finalResolved.visualDefaults.checkerLight }, darkColor: { ...finalResolved.visualDefaults.checkerDark } },
    grid: { pixelGridColor: { ...finalResolved.visualDefaults.pixelGrid }, gridColor: { ...finalResolved.visualDefaults.customGrid } },
    onionSkin: { ...storedOnionSkin, previousColor: { ...finalResolved.visualDefaults.onionPrevious }, nextColor: { ...finalResolved.visualDefaults.onionNext } },
    symmetryAxis: { ...storedSymmetryAxis, color: { ...finalResolved.visualDefaults.symmetryAxis } }
  }
}

const themeWithInferredVisualColors = (preferences: EditorPreferences): ThemePreferences => {
  const theme = normalizeThemePreferences(preferences.theme)
  const defaults = resolveTheme(theme).visualDefaults
  const values: Array<[keyof Pick<ThemePalette, 'checkerLight' | 'checkerDark' | 'pixelGrid' | 'customGrid' | 'onionPrevious' | 'onionNext' | 'symmetryAxis'>, RgbaColor, RgbaColor]> = [
    ['checkerLight', preferences.checkerboard.lightColor, defaults.checkerLight],
    ['checkerDark', preferences.checkerboard.darkColor, defaults.checkerDark],
    ['pixelGrid', preferences.pixelGridColor, defaults.pixelGrid],
    ['customGrid', preferences.gridColor, defaults.customGrid],
    ['onionPrevious', preferences.onionSkin.previousColor, defaults.onionPrevious],
    ['onionNext', preferences.onionSkin.nextColor, defaults.onionNext],
    ['symmetryAxis', preferences.symmetryAxis.color, defaults.symmetryAxis]
  ]
  const colors: Partial<ThemePalette> = {}
  for (const [key, value, fallback] of values) {
    if (!sameColor(value, fallback)) colors[key] = rgbaHex(value)
  }
  return Object.keys(colors).length > 0 ? withThemePaletteColors(theme, colors) : theme
}

const boundedInteger = (value: unknown, max: number): number | null => {
  const parsed = typeof value === 'number' ? value : Number.NaN
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= max ? Math.round(parsed) : null
}

export function parseDocumentSizePresets(value: string | null): DocumentSizePreset[] {
  try {
    const parsed = JSON.parse(value ?? 'null') as unknown
    if (!Array.isArray(parsed)) return DEFAULT_DOCUMENT_SIZE_PRESETS.map((preset) => ({ ...preset }))
    const seen = new Set<string>()
    const presets = parsed.flatMap((candidate) => {
      if (!candidate || typeof candidate !== 'object') return []
      const width = boundedInteger((candidate as Partial<DocumentSizePreset>).width, 16384)
      const height = boundedInteger((candidate as Partial<DocumentSizePreset>).height, 16384)
      if (!width || !height || seen.has(`${width}x${height}`)) return []
      seen.add(`${width}x${height}`)
      return [{ width, height }]
    })
    return presets.length > 0 ? presets : DEFAULT_DOCUMENT_SIZE_PRESETS.map((preset) => ({ ...preset }))
  } catch {
    return DEFAULT_DOCUMENT_SIZE_PRESETS.map((preset) => ({ ...preset }))
  }
}

export function parseExportScalePresets(value: string | null): number[] {
  try {
    const parsed = JSON.parse(value ?? 'null') as unknown
    if (!Array.isArray(parsed)) return [...DEFAULT_EXPORT_SCALE_PRESETS]
    const presets = [...new Set(parsed.map((candidate) => boundedInteger(candidate, 6400)).filter((candidate): candidate is number => candidate !== null))]
    return presets.length > 0 ? presets : [...DEFAULT_EXPORT_SCALE_PRESETS]
  } catch {
    return [...DEFAULT_EXPORT_SCALE_PRESETS]
  }
}

export function parseLayerDisplayColorPresets(value: string | null): RgbaColor[] {
  const fallback = (): RgbaColor[] => DEFAULT_LAYER_DISPLAY_COLOR_PRESETS.map((color) => ({ ...color }))
  try {
    const parsed = JSON.parse(value ?? 'null') as unknown
    if (!Array.isArray(parsed)) return fallback()
    const seen = new Set<string>()
    const colors: RgbaColor[] = []
    for (const candidate of parsed) {
      if (!candidate || typeof candidate !== 'object') continue
      const value = candidate as Partial<RgbaColor>
      const channels = [value.r, value.g, value.b]
      if (channels.some((channel) => typeof channel !== 'number' || !Number.isFinite(channel) || channel < 0 || channel > 255)) continue
      const color = { r: Math.round(value.r!), g: Math.round(value.g!), b: Math.round(value.b!), a: 255 }
      const key = `${color.r}:${color.g}:${color.b}`
      if (seen.has(key)) continue
      seen.add(key)
      colors.push(color)
      if (colors.length === 12) break
    }
    return colors.length > 0 ? colors : fallback()
  } catch {
    return fallback()
  }
}

export function parseColorEditorModes(value: string | null): ColorEditorModePreference[] {
  const supported = DEFAULT_COLOR_EDITOR_MODES.map(({ mode }) => mode)
  try {
    const parsed = JSON.parse(value ?? 'null') as unknown
    if (!Array.isArray(parsed)) return DEFAULT_COLOR_EDITOR_MODES.map((item) => ({ ...item }))
    const seen = new Set<ColorValueMode>()
    const result: ColorEditorModePreference[] = []
    for (const candidate of parsed) {
      if (!candidate || typeof candidate !== 'object') continue
      const item = candidate as Partial<ColorEditorModePreference>
      if (!supported.includes(item.mode as ColorValueMode) || seen.has(item.mode as ColorValueMode)) continue
      seen.add(item.mode as ColorValueMode)
      result.push({ mode: item.mode as ColorValueMode, enabled: item.enabled !== false })
    }
    const legacyDefaults = result.length === LEGACY_DEFAULT_COLOR_EDITOR_MODES.length
      && result.every((item, index) => item.mode === LEGACY_DEFAULT_COLOR_EDITOR_MODES[index] && item.enabled)
    if (legacyDefaults) return DEFAULT_COLOR_EDITOR_MODES.map((item) => ({ ...item }))
    for (const item of DEFAULT_COLOR_EDITOR_MODES) if (!seen.has(item.mode)) result.push({ ...item })
    if (!result.some((item) => item.enabled)) result[0].enabled = true
    return result
  } catch {
    return DEFAULT_COLOR_EDITOR_MODES.map((item) => ({ ...item }))
  }
}

export function parseOnionSkinPreferences(value: string | null): OnionSkinPreferences {
  try {
    const parsed = JSON.parse(value ?? 'null') as Partial<OnionSkinPreferences> | null
    if (!parsed || typeof parsed !== 'object') throw new Error('invalid onion skin preferences')
    const count = (candidate: unknown, fallback: number): number => typeof candidate === 'number' && Number.isFinite(candidate) ? Math.max(0, Math.min(8, Math.round(candidate))) : fallback
    const opacity = (candidate: unknown, fallback: number): number => typeof candidate === 'number' && Number.isFinite(candidate) ? Math.max(0, Math.min(100, Math.round(candidate))) : fallback
    return {
      enabled: parsed.enabled === true,
      scope: parsed.scope === 'all-layers' ? 'all-layers' : 'current-layer',
      // Existing preferences predate this option. Preserve the new default
      // rather than treating their missing field as an explicit opt-out.
      showDuringPlayback: parsed.showDuringPlayback !== false,
      previousFrames: count(parsed.previousFrames, DEFAULT_ONION_SKIN_PREFERENCES.previousFrames),
      nextFrames: count(parsed.nextFrames, DEFAULT_ONION_SKIN_PREFERENCES.nextFrames),
      previousOpacity: opacity(parsed.previousOpacity, DEFAULT_ONION_SKIN_PREFERENCES.previousOpacity),
      nextOpacity: opacity(parsed.nextOpacity, DEFAULT_ONION_SKIN_PREFERENCES.nextOpacity),
      previousColor: parseHexColor(typeof parsed.previousColor === 'object' ? colorHex(parsed.previousColor as RgbaColor) : null, DEFAULT_ONION_SKIN_PREFERENCES.previousColor),
      nextColor: parseHexColor(typeof parsed.nextColor === 'object' ? colorHex(parsed.nextColor as RgbaColor) : null, DEFAULT_ONION_SKIN_PREFERENCES.nextColor)
    }
  } catch {
    return { ...DEFAULT_ONION_SKIN_PREFERENCES, previousColor: { ...DEFAULT_ONION_SKIN_PREFERENCES.previousColor }, nextColor: { ...DEFAULT_ONION_SKIN_PREFERENCES.nextColor } }
  }
}

export function parseSymmetryAxisPreferences(value: string | null): SymmetryAxisPreferences {
  const fallback = (): SymmetryAxisPreferences => ({
    ...DEFAULT_SYMMETRY_AXIS_PREFERENCES,
    color: { ...DEFAULT_SYMMETRY_AXIS_PREFERENCES.color }
  })
  try {
    const parsed = JSON.parse(value ?? 'null') as (Partial<SymmetryAxisPreferences> & { opacity?: unknown }) | null
    if (!parsed || typeof parsed !== 'object') return fallback()
    const storedColor = parsed.color && typeof parsed.color === 'object' ? parsed.color as Partial<RgbaColor> : null
    const channels = storedColor ? [storedColor.r, storedColor.g, storedColor.b] : []
    const legacyOpacity = typeof parsed.opacity === 'number' && Number.isFinite(parsed.opacity)
      ? Math.max(0, Math.min(100, parsed.opacity))
      : null
    const alpha = legacyOpacity !== null
      ? Math.round(legacyOpacity * 255 / 100)
      : typeof storedColor?.a === 'number' && Number.isFinite(storedColor.a) && storedColor.a >= 0 && storedColor.a <= 255
        ? Math.round(storedColor.a)
        : DEFAULT_SYMMETRY_AXIS_PREFERENCES.color.a
    const color = channels.length === 3 && channels.every((channel) => typeof channel === 'number' && Number.isFinite(channel) && channel >= 0 && channel <= 255)
      ? { r: Math.round(storedColor!.r!), g: Math.round(storedColor!.g!), b: Math.round(storedColor!.b!), a: alpha }
      : { ...DEFAULT_SYMMETRY_AXIS_PREFERENCES.color, a: alpha }
    const thickness = typeof parsed.thickness === 'number' && Number.isFinite(parsed.thickness)
      ? Math.max(MIN_SYMMETRY_AXIS_THICKNESS, Math.min(MAX_SYMMETRY_AXIS_THICKNESS, Math.round(parsed.thickness)))
      : DEFAULT_SYMMETRY_AXIS_PREFERENCES.thickness
    return { locked: parsed.locked === true, color, thickness }
  } catch {
    return fallback()
  }
}

export function parseIsoViewPreferences(value: string | null): IsoViewPreferences {
  const fallback = (): IsoViewPreferences => ({
    ...DEFAULT_ISO_VIEW_PREFERENCES,
    guideColors: {
      solid: { ...DEFAULT_ISO_VIEW_PREFERENCES.guideColors.solid },
      pixel: { ...DEFAULT_ISO_VIEW_PREFERENCES.guideColors.pixel }
    }
  })
  try {
    const parsed = JSON.parse(value ?? 'null') as (Partial<IsoViewPreferences> & { guideColor?: Partial<RgbaColor> }) | null
    if (!parsed || typeof parsed !== 'object') return fallback()
    const guideLineStyle: IsoGuideLineStyle = parsed.guideLineStyle === 'pixel' ? 'pixel' : 'solid'
    const normalizeGuideColor = (candidate: unknown): RgbaColor | null => {
      if (!candidate || typeof candidate !== 'object') return null
      const storedColor = candidate as Partial<RgbaColor>
      const channels = [storedColor.r, storedColor.g, storedColor.b, storedColor.a]
      if (!channels.every((channel) => typeof channel === 'number' && Number.isFinite(channel) && channel >= 0 && channel <= 255)) return null
      const color = { r: Math.round(storedColor.r!), g: Math.round(storedColor.g!), b: Math.round(storedColor.b!), a: Math.round(storedColor.a!) }
      return color.r === LEGACY_DEFAULT_ISO_GUIDE_COLOR.r
        && color.g === LEGACY_DEFAULT_ISO_GUIDE_COLOR.g
        && color.b === LEGACY_DEFAULT_ISO_GUIDE_COLOR.b
        ? { ...DEFAULT_ISO_VIEW_PREFERENCES.guideColors[guideLineStyle], a: color.a }
        : color
    }
    const storedGuideColors = parsed.guideColors && typeof parsed.guideColors === 'object'
      ? parsed.guideColors as Partial<Record<IsoGuideLineStyle, unknown>>
      : null
    const legacyGuideColor = normalizeGuideColor(parsed.guideColor)
    const guideColors = {
      solid: normalizeGuideColor(storedGuideColors?.solid)
        ?? (guideLineStyle === 'solid' ? legacyGuideColor : null)
        ?? { ...DEFAULT_ISO_VIEW_PREFERENCES.guideColors.solid },
      pixel: normalizeGuideColor(storedGuideColors?.pixel)
        ?? (guideLineStyle === 'pixel' ? legacyGuideColor : null)
        ?? { ...DEFAULT_ISO_VIEW_PREFERENCES.guideColors.pixel }
    }
    const guideThickness = typeof parsed.guideThickness === 'number' && Number.isFinite(parsed.guideThickness)
      ? Math.max(MIN_ISO_GUIDE_THICKNESS, Math.min(MAX_ISO_GUIDE_THICKNESS, Math.round(parsed.guideThickness)))
      : DEFAULT_ISO_VIEW_PREFERENCES.guideThickness
    const stairStep = typeof parsed.stairStep === 'number' && Number.isFinite(parsed.stairStep)
      ? Math.max(MIN_ISO_STAIR_STEP, Math.min(MAX_ISO_STAIR_STEP, Math.round(parsed.stairStep)))
      : DEFAULT_ISO_VIEW_PREFERENCES.stairStep
    const guideOriginX = typeof parsed.guideOriginX === 'number' && Number.isFinite(parsed.guideOriginX)
      ? Math.trunc(parsed.guideOriginX)
      : DEFAULT_ISO_VIEW_PREFERENCES.guideOriginX
    const guideOriginY = typeof parsed.guideOriginY === 'number' && Number.isFinite(parsed.guideOriginY)
      ? Math.trunc(parsed.guideOriginY)
      : DEFAULT_ISO_VIEW_PREFERENCES.guideOriginY
    const guideUnitSize = typeof parsed.guideUnitSize === 'number' && Number.isFinite(parsed.guideUnitSize)
      ? Math.max(MIN_ISO_GUIDE_UNIT_SIZE, Math.min(MAX_ISO_GUIDE_UNIT_SIZE, Math.round(parsed.guideUnitSize)))
      : DEFAULT_ISO_VIEW_PREFERENCES.guideUnitSize
    return {
      stairStep,
      guideLineStyle,
      guideOriginX,
      guideOriginY,
      guideUnitSize,
      guideColors,
      guideThickness,
      forceLineAlignment: parsed.forceLineAlignment !== false,
      snapToGrid: parsed.snapToGrid === true
    }
  } catch {
    return fallback()
  }
}

export function imageExportKindForPreference(value: string | null): ImageExportKind {
  if (value === 'gif') return 'gif'
  if (value === 'jpeg') return 'jpeg'
  if (value === 'webp') return 'webp'
  if (value === 'svg') return 'svg'
  if (value === 'bmp') return 'bmp'
  if (value === 'psd') return 'psd'
  if (value === 'ico') return 'ico'
  if (value === 'png-rgba') return 'png-rgba'
  return 'png-auto'
}

export function saveImageKindForPreference(value: string | null): SaveImageKind | null {
  if (value === 'moonsprite' || !value) return null
  if (value === 'ase' || value === 'aseprite') return value
  if (value === 'jpeg') return 'jpeg'
  if (value === 'webp') return 'webp'
  if (value === 'svg') return 'svg'
  if (value === 'psd') return 'psd'
  if (value === 'ico') return 'ico'
  if (value === 'png') return 'png-auto'
  return null
}

function parseSaveFormat(value: string | null): SaveFormatPreference {
  return value === 'png' || value === 'jpeg' || value === 'webp' || value === 'svg' || value === 'ico' || value === 'psd' || value === 'ase' || value === 'aseprite' ? value : 'moonsprite'
}

function parseExportFormat(value: string | null): ExportFormatPreference {
  return value === 'jpeg' || value === 'webp' || value === 'svg' || value === 'gif' || value === 'bmp' || value === 'ico' || value === 'psd' ? value : 'png'
}

function parseDirectoryPreference(value: string | null): string {
  return value?.trim() ?? ''
}

function parseSaveLocationMode(value: string | null): SaveLocationMode {
  return value === 'fixed' ? 'fixed' : 'recent'
}

export function parsePasteTarget(value: string | null): PasteTarget {
  return value === 'new-layer' || value === 'new-project' ? value : 'current-cell'
}

/** Default folder for an unsaved project; saved projects always keep their own file path. */
export function saveDirectoryForNewDocument(preferences: Pick<EditorPreferences, 'saveLocationMode' | 'saveDirectory' | 'lastSaveDirectory'>): string {
  return preferences.saveLocationMode === 'recent' && preferences.lastSaveDirectory
    ? preferences.lastSaveDirectory
    : preferences.saveDirectory
}

/** The one shared location used to prefill every export-like operation. */
export function outputDirectoryForOperation(preferences: Pick<EditorPreferences, 'exportLocationMode' | 'lastExportDirectory' | 'exportDirectory'>): string {
  return preferences.exportLocationMode === 'recent' && preferences.lastExportDirectory
    ? preferences.lastExportDirectory
    : preferences.exportDirectory
}

export function parseRecoveryMinutes(value: string | null): number {
  if (!value?.trim()) return DEFAULT_EDITOR_PREFERENCES.recoveryMinutes
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0.5, Math.min(60, parsed)) : DEFAULT_EDITOR_PREFERENCES.recoveryMinutes
}

export function parseRecoveryRetentionDays(value: string | null): number {
  if (!value?.trim()) return DEFAULT_EDITOR_PREFERENCES.recoveryRetentionDays
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(1, Math.min(365, Math.round(parsed))) : DEFAULT_EDITOR_PREFERENCES.recoveryRetentionDays
}

export function parseProjectBackupVersions(value: string | null): number {
  if (!value?.trim()) return DEFAULT_EDITOR_PREFERENCES.projectBackupVersions
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(1, Math.min(10, Math.round(parsed))) : DEFAULT_EDITOR_PREFERENCES.projectBackupVersions
}

export function parseLocalHistoryLimit(value: string | null): number {
  if (!value?.trim()) return DEFAULT_EDITOR_PREFERENCES.localHistoryLimit
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(1, Math.min(200, Math.round(parsed))) : DEFAULT_EDITOR_PREFERENCES.localHistoryLimit
}

export function parseHistoryLimit(value: string | null): number {
  if (!value?.trim()) return DEFAULT_EDITOR_PREFERENCES.historyLimit
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(1, Math.min(10000, Math.round(parsed))) : DEFAULT_EDITOR_PREFERENCES.historyLimit
}

export const historyEntryLimit = (preferences: Pick<EditorPreferences, 'historyLimitEnabled' | 'historyLimit'>): number =>
  preferences.historyLimitEnabled ? parseHistoryLimit(String(preferences.historyLimit)) : Infinity

export function parseProjectBackupRetentionDays(value: string | null): number {
  if (!value?.trim()) return DEFAULT_EDITOR_PREFERENCES.projectBackupRetentionDays
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(1, Math.min(365, Math.round(parsed))) : DEFAULT_EDITOR_PREFERENCES.projectBackupRetentionDays
}

export function parseMoveLayerClickFlashDuration(value: string | null): MoveLayerClickFlashDuration {
  const parsed = Number(value)
  return MOVE_LAYER_CLICK_FLASH_DURATIONS.includes(parsed as MoveLayerClickFlashDuration)
    ? parsed as MoveLayerClickFlashDuration
    : DEFAULT_EDITOR_PREFERENCES.moveLayerClickFlashDuration
}

export function parseUiMotionLevel(value: string | null): UiMotionLevel {
  return UI_MOTION_LEVELS.includes(value as UiMotionLevel) ? value as UiMotionLevel : DEFAULT_EDITOR_PREFERENCES.uiMotionLevel
}

export function parseAlignmentThreshold(value: string | null): number {
  if (!value?.trim()) return DEFAULT_EDITOR_PREFERENCES.alignmentThreshold
  const parsed = Number(value)
  return Number.isFinite(parsed)
    ? Math.max(1, Math.min(32, Math.round(parsed)))
    : DEFAULT_EDITOR_PREFERENCES.alignmentThreshold
}

export function parseTabletPreferences(value: string | null): TabletPreferences {
  try {
    const parsed = JSON.parse(value ?? 'null') as (Partial<TabletPreferences> & { touchUi?: unknown }) | null
    if (!parsed || typeof parsed !== 'object') throw new Error('invalid tablet preferences')
    const api: TabletApi = parsed.api === 'windows-ink' || parsed.api === 'disabled' ? parsed.api : 'auto'
    const touchMode: TabletTouchMode = parsed.touchMode === 'draw' || parsed.touchMode === 'disabled' ? parsed.touchMode : 'navigate'
    const barrelButtonAction: TabletBarrelButtonAction = parsed.barrelButtonAction === 'eyedropper' || parsed.barrelButtonAction === 'hand' || parsed.barrelButtonAction === 'disabled' ? parsed.barrelButtonAction : 'eraser'
    return {
      api,
      pressureEnabled: parsed.pressureEnabled !== false,
      tiltEnabled: parsed.tiltEnabled === true,
      twistEnabled: parsed.twistEnabled === true,
      eraserTipEnabled: parsed.eraserTipEnabled !== false,
      barrelButtonAction,
      rightClickAction: parseRightClickAction(parsed.rightClickAction),
      touchMode,
      twoFingerZoomEnabled: parsed.twoFingerZoomEnabled !== false,
      twoFingerRotateEnabled: parsed.twoFingerRotateEnabled === true,
      assistPanel: (parsed.assistPanel ?? parsed.touchUi) === 'on' ? 'on' : (parsed.assistPanel ?? parsed.touchUi) === 'off' ? 'off' : 'auto',
      gestureUndoEnabled: parsed.gestureUndoEnabled !== false,
      rotationSnapEnabled: parsed.rotationSnapEnabled !== false,
      longPressEyedropper: parsed.longPressEyedropper === true
    }
  } catch {
    return { ...DEFAULT_TABLET_PREFERENCES }
  }
}

/** Parse the software-wide outline defaults without inventing a setting when none was saved. */
export function parseOutlineSettingsPreference(value: string | null): OutlineSettings | null {
  if (!value?.trim()) return null
  try {
    return normalizeOutlineSettings(JSON.parse(value))
  } catch {
    return null
  }
}

export function loadEditorPreferences(storage?: Storage): EditorPreferences {
  if (!storage && previewPreferences) return copyPreferences(previewPreferences)
  const get = (key: string): string | null => readStoredString(key, storage)
  const theme = effectiveThemeColors(loadThemePreferences(storage), get, storage)
  const storedMotionLevel = get(UI_MOTION_LEVEL_PREFERENCE_KEY)
  const legacyAnimationsEnabled = get(ANIMATIONS_ENABLED_PREFERENCE_KEY)
  const uiMotionLevel = storedMotionLevel !== null
    ? parseUiMotionLevel(storedMotionLevel)
    : legacyAnimationsEnabled === 'false' ? 'off' : legacyAnimationsEnabled === 'true' ? 'subtle' : DEFAULT_EDITOR_PREFERENCES.uiMotionLevel
  return {
    language: parseAppLocale(get(LANGUAGE_PREFERENCE_KEY)),
    uiScale: parseUiScale(get(UI_SCALE_PREFERENCE_KEY)),
    bodyFontScale: parseBodyFontScale(get(BODY_FONT_SCALE_PREFERENCE_KEY)),
    toolIconScale: parseToolIconScale(get(TOOL_ICON_SCALE_PREFERENCE_KEY)),
    uiMotionLevel,
    animationsEnabled: uiMotionLevel !== 'off',
    animationPlaybackRate: parseAnimationPlaybackRate(get(ANIMATION_PLAYBACK_RATE_PREFERENCE_KEY)),
    animationPlaybackMode: parseAnimationPlaybackMode(get(ANIMATION_PLAYBACK_MODE_PREFERENCE_KEY)),
    animationReturnToStart: get(ANIMATION_RETURN_TO_START_PREFERENCE_KEY) === 'true',
    skipDisabledFrames: get(SKIP_DISABLED_FRAMES_PREFERENCE_KEY) !== 'false',
    saveFormat: parseSaveFormat(get(SAVE_FORMAT_PREFERENCE_KEY)),
    saveOriginalFormat: get(SAVE_ORIGINAL_FORMAT_PREFERENCE_KEY) !== 'false',
    exportFormat: parseExportFormat(get(EXPORT_FORMAT_PREFERENCE_KEY)),
    saveLocationMode: parseSaveLocationMode(get(SAVE_LOCATION_MODE_PREFERENCE_KEY)),
    exportLocationMode: parseSaveLocationMode(get(EXPORT_LOCATION_MODE_PREFERENCE_KEY)),
    pasteTarget: parsePasteTarget(get(PASTE_TARGET_PREFERENCE_KEY)),
    saveDirectory: parseDirectoryPreference(get(SAVE_DIRECTORY_PREFERENCE_KEY)),
    exportDirectory: parseDirectoryPreference(get(EXPORT_DIRECTORY_PREFERENCE_KEY)),
    lastSaveDirectory: parseDirectoryPreference(get(LAST_SAVE_DIRECTORY_PREFERENCE_KEY)),
    lastExportDirectory: parseDirectoryPreference(get(LAST_EXPORT_DIRECTORY_PREFERENCE_KEY)) || parseDirectoryPreference(get(EXPORT_DIRECTORY_PREFERENCE_KEY)),
    recovery: get(RECOVERY_PREFERENCE_KEY) !== 'false',
    recoveryMinutes: parseRecoveryMinutes(get(RECOVERY_MINUTES_PREFERENCE_KEY)),
    recoveryRetentionDays: parseRecoveryRetentionDays(get(RECOVERY_RETENTION_DAYS_PREFERENCE_KEY)),
    projectBackupEnabled: get(PROJECT_BACKUP_ENABLED_PREFERENCE_KEY) !== 'false',
    projectBackupVersions: parseProjectBackupVersions(get(PROJECT_BACKUP_VERSIONS_PREFERENCE_KEY)),
    projectBackupRetentionDays: parseProjectBackupRetentionDays(get(PROJECT_BACKUP_RETENTION_DAYS_PREFERENCE_KEY)),
    projectBackupDirectory: parseDirectoryPreference(get(PROJECT_BACKUP_DIRECTORY_PREFERENCE_KEY)),
    localHistoryEnabled: get(LOCAL_HISTORY_ENABLED_PREFERENCE_KEY) === 'true',
    localHistoryLimit: parseLocalHistoryLimit(get(LOCAL_HISTORY_LIMIT_PREFERENCE_KEY)),
    historyLimit: parseHistoryLimit(get(HISTORY_LIMIT_PREFERENCE_KEY)),
    historyLimitEnabled: get(HISTORY_LIMIT_ENABLED_PREFERENCE_KEY) === 'true',
    documentSizePresets: parseDocumentSizePresets(get(NEW_DOCUMENT_SIZE_PRESETS_KEY)),
    exportScalePresets: parseExportScalePresets(get(EXPORT_SCALE_PRESETS_KEY)),
    rotationIndicatorPosition: parseRotationIndicatorPosition(get(ROTATION_INDICATOR_POSITION_KEY)),
    exportProtection: get(EXPORT_PROTECTION_KEY) === 'blur-noise' ? 'blur-noise' : get(EXPORT_PROTECTION_KEY) === 'blur' ? 'blur' : 'off',
    referenceScaling: get(REFERENCE_SCALING_KEY) === 'pixelated' ? 'pixelated' : 'smooth',
    canvasViewScrollbarsEnabled: get(CANVAS_VIEW_SCROLLBARS_ENABLED_KEY) !== 'false',
    drawingBrushPreviewEnabled: parseDrawingBrushPreviewEnabled(get(DRAWING_BRUSH_PREVIEW_ENABLED_KEY)),
    relativeLuminanceScope: parseRelativeLuminanceScope(get(RELATIVE_LUMINANCE_SCOPE_KEY)),
    zoomToolDragMode: parseZoomToolDragMode(get(ZOOM_TOOL_DRAG_MODE_PREFERENCE_KEY)),
    viewDragSensitivity: parseViewDragSensitivity(get(VIEW_DRAG_SENSITIVITY_PREFERENCE_KEY)),
    brushShiftLineEnabled: parseBrushShiftLineEnabled(get(BRUSH_SHIFT_LINE_ENABLED_KEY)),
    paintingCursorShape: get('moonsprite.preference.painting-cursor-shape') === 'cross' ? 'cross' : 'dot',
    paintingCursorType: parsePaintingCursorType(get(PAINTING_CURSOR_TYPE_KEY)),
    useLocalCursors: get(USE_LOCAL_CURSORS_PREFERENCE_KEY) === 'true',
    cursorScale: parseCursorScale(get(CURSOR_SCALE_PREFERENCE_KEY)),
    cursorColorMode: parseCursorColorMode(get(CURSOR_COLOR_MODE_PREFERENCE_KEY)),
    cursorColor: parseHexColor(get(CURSOR_COLOR_PREFERENCE_KEY), DEFAULT_CURSOR_COLOR),
    brushEdgeThickness: parseBrushEdgeThickness(get(BRUSH_EDGE_THICKNESS_PREFERENCE_KEY)),
    brushPreviewMode: parseBrushPreviewMode(get(BRUSH_PREVIEW_MODE_PREFERENCE_KEY)),
    checkerboard: theme.checkerboard,
    pixelGridColor: theme.grid.pixelGridColor,
    gridColor: theme.grid.gridColor,
    gridAlignmentEnabled: get(GRID_ALIGNMENT_ENABLED_PREFERENCE_KEY) === 'true',
    smartAlignmentEnabled: get(SMART_ALIGNMENT_ENABLED_PREFERENCE_KEY) === 'true',
    alignmentGuidesVisible: get(ALIGNMENT_GUIDES_VISIBLE_PREFERENCE_KEY) === 'true',
    alignmentThreshold: parseAlignmentThreshold(get(ALIGNMENT_THRESHOLD_PREFERENCE_KEY)),
    sliceColor: parseHexColor(get(SLICE_COLOR_PREFERENCE_KEY), DEFAULT_SLICE_COLOR),
    freeTileInstanceOutlineColor: parseHexColor(get(FREE_TILE_INSTANCE_OUTLINE_COLOR_PREFERENCE_KEY), DEFAULT_FREE_TILE_INSTANCE_OUTLINE_COLOR),
    textBoxColor: parseHexColor(get(TEXT_BOX_COLOR_PREFERENCE_KEY), DEFAULT_TEXT_BOX_COLOR),
    canvasResizeColor: parseHexColor(get(CANVAS_RESIZE_COLOR_PREFERENCE_KEY), DEFAULT_CANVAS_RESIZE_COLOR),
    sliceOutlinesVisible: get(SLICE_OUTLINES_VISIBLE_PREFERENCE_KEY) !== 'false',
    brushSizeWheelReversed: get(BRUSH_SIZE_WHEEL_REVERSED_PREFERENCE_KEY) === 'true',
    wheelZoomEnabled: get(WHEEL_ZOOM_ENABLED_PREFERENCE_KEY) !== 'false',
    wheelZoomMode: parseWheelZoomMode(get(WHEEL_ZOOM_MODE_PREFERENCE_KEY)),
    shiftLinePreviewEnabled: get(SHIFT_LINE_PREVIEW_ENABLED_PREFERENCE_KEY) !== 'false',
    gradientLineVisible: get(GRADIENT_LINE_VISIBLE_PREFERENCE_KEY) !== 'false',
    gradientLineColor: parseHexColor(get(GRADIENT_LINE_COLOR_PREFERENCE_KEY), DEFAULT_GRADIENT_LINE_COLOR),
    lassoPreviewClosed: get(LASSO_PREVIEW_CLOSED_PREFERENCE_KEY) === 'true',
    eyedropperQuickSelect: get(EYEDROPPER_QUICK_SELECT_PREFERENCE_KEY) === 'true',
    tooltipsEnabled: get(TOOLTIPS_ENABLED_PREFERENCE_KEY) !== 'false',
    keyDisplayEnabled: get(KEY_DISPLAY_ENABLED_PREFERENCE_KEY) === 'true',
    keyDisplayFunction: get(KEY_DISPLAY_FUNCTION_PREFERENCE_KEY) === 'true',
    keyDisplaySize: parseKeyDisplaySize(get(KEY_DISPLAY_SIZE_PREFERENCE_KEY)),
    keyDisplayDuration: parseKeyDisplayDuration(get(KEY_DISPLAY_DURATION_PREFERENCE_KEY)),
    eyedropperSwitchToPencil: get(EYEDROPPER_SWITCH_TO_PENCIL_PREFERENCE_KEY) === 'true',
    eyedropperMagnifierEnabled: get(EYEDROPPER_MAGNIFIER_ENABLED_PREFERENCE_KEY) !== 'false',
    eyedropperMagnifierStyle: parseEyedropperMagnifierStyle(get(EYEDROPPER_MAGNIFIER_STYLE_PREFERENCE_KEY)),
    eyedropperMagnifierSize: parseEyedropperMagnifierSize(get(EYEDROPPER_MAGNIFIER_SIZE_PREFERENCE_KEY)),
    eyedropperMagnifierDistortionEnabled: get(EYEDROPPER_MAGNIFIER_DISTORTION_ENABLED_PREFERENCE_KEY) === 'true',
    moveLayerContentPreviewEnabled: get(MOVE_LAYER_CONTENT_PREVIEW_ENABLED_PREFERENCE_KEY) !== 'false',
    moveLayerClickFlashEnabled: get(MOVE_LAYER_CLICK_FLASH_ENABLED_PREFERENCE_KEY) !== 'false',
    moveLayerClickFlashDuration: parseMoveLayerClickFlashDuration(get(MOVE_LAYER_CLICK_FLASH_DURATION_PREFERENCE_KEY)),
    selectionCrosshair: get(SELECTION_CROSSHAIR_PREFERENCE_KEY) === 'true',
    selectionPreviewColorMode: parseSelectionPreviewColorMode(get(SELECTION_PREVIEW_COLOR_MODE_PREFERENCE_KEY)),
    selectionPreviewColor: parseHexColor(get(SELECTION_PREVIEW_COLOR_PREFERENCE_KEY), DEFAULT_SELECTION_PREVIEW_COLOR),
    selectionSizeVisible: get(SELECTION_SIZE_VISIBLE_PREFERENCE_KEY) !== 'false',
    balancedShiftLineEnabled: get(BALANCED_SHIFT_LINE_ENABLED_PREFERENCE_KEY) !== 'false',
    optimizedRotationEnabled: get(OPTIMIZED_ROTATION_ENABLED_PREFERENCE_KEY) !== 'false',
    lineDirectionStep: parseLineDirectionStep(get(LINE_DIRECTION_STEP_PREFERENCE_KEY)),
    layerDisplayColorPresets: parseLayerDisplayColorPresets(get(LAYER_DISPLAY_COLOR_PRESETS_KEY)),
    colorEditorModes: parseColorEditorModes(get(COLOR_EDITOR_MODES_PREFERENCE_KEY)),
    pixelFormat: parsePixelFormat(get(PIXEL_FORMAT_PREFERENCE_KEY)),
    onionSkin: theme.onionSkin,
    timelineHidden: get(TIMELINE_HIDDEN_PREFERENCE_KEY) === 'true',
    symmetryAxis: theme.symmetryAxis,
    isoView: parseIsoViewPreferences(get(ISO_VIEW_PREFERENCE_KEY)),
    timelapseRecordingEnabled: get(TIMELAPSE_RECORDING_ENABLED_PREFERENCE_KEY) === 'true',
    quickCommandBarEnabled: get(QUICK_COMMAND_BAR_ENABLED_PREFERENCE_KEY) !== 'false',
    quickCommandBarExpanded: get(QUICK_COMMAND_BAR_EXPANDED_PREFERENCE_KEY) === 'true',
    quickCommandBarTranslucent: get(QUICK_COMMAND_BAR_TRANSLUCENT_PREFERENCE_KEY) === 'true',
    quickCommandPreferences: parseQuickCommandPreferences(get(QUICK_COMMAND_PREFERENCES_KEY)),
    toolRail: parseToolRail(get(TOOL_RAIL_PREFERENCE_KEY)),
    quickCommandBars: parseQuickCommandBars(get(QUICK_COMMAND_BARS_PREFERENCE_KEY), parseQuickCommandPreferences(get(QUICK_COMMAND_PREFERENCES_KEY))),
    tablet: parseTabletPreferences(get(TABLET_PREFERENCES_KEY)),
    outlineSettings: parseOutlineSettingsPreference(get(OUTLINE_SETTINGS_PREFERENCE_KEY)),
    theme: theme.theme
  }
}

export function saveEditorPreferences(preferences: EditorPreferences, storage?: Storage): void {
  const theme = themeWithInferredVisualColors(preferences)
  const uiMotionLevel: UiMotionLevel = preferences.animationsEnabled === false
    ? 'off'
    : parseUiMotionLevel(preferences.uiMotionLevel)
  const values: Record<string, string> = {
    [LANGUAGE_PREFERENCE_KEY]: preferences.language,
    [UI_SCALE_PREFERENCE_KEY]: String(parseUiScale(String(preferences.uiScale))),
    [BODY_FONT_SCALE_PREFERENCE_KEY]: String(parseBodyFontScale(String(preferences.bodyFontScale))),
    [TOOL_ICON_SCALE_PREFERENCE_KEY]: String(parseToolIconScale(String(preferences.toolIconScale))),
    [ANIMATIONS_ENABLED_PREFERENCE_KEY]: String(uiMotionLevel !== 'off'),
    [UI_MOTION_LEVEL_PREFERENCE_KEY]: uiMotionLevel,
    [ANIMATION_PLAYBACK_RATE_PREFERENCE_KEY]: String(parseAnimationPlaybackRate(String(preferences.animationPlaybackRate))),
    [ANIMATION_PLAYBACK_MODE_PREFERENCE_KEY]: preferences.animationPlaybackMode ?? '',
    [ANIMATION_RETURN_TO_START_PREFERENCE_KEY]: String(preferences.animationReturnToStart),
    [SKIP_DISABLED_FRAMES_PREFERENCE_KEY]: String(preferences.skipDisabledFrames),
    [SAVE_FORMAT_PREFERENCE_KEY]: preferences.saveFormat,
    [SAVE_ORIGINAL_FORMAT_PREFERENCE_KEY]: String(preferences.saveOriginalFormat),
    [PIXEL_FORMAT_PREFERENCE_KEY]: preferences.pixelFormat,
    [EXPORT_FORMAT_PREFERENCE_KEY]: preferences.exportFormat,
    [SAVE_LOCATION_MODE_PREFERENCE_KEY]: preferences.saveLocationMode,
    [EXPORT_LOCATION_MODE_PREFERENCE_KEY]: preferences.exportLocationMode,
    [PASTE_TARGET_PREFERENCE_KEY]: parsePasteTarget(preferences.pasteTarget),
    [SAVE_DIRECTORY_PREFERENCE_KEY]: parseDirectoryPreference(preferences.saveDirectory),
    [EXPORT_DIRECTORY_PREFERENCE_KEY]: parseDirectoryPreference(preferences.exportDirectory),
    [LAST_SAVE_DIRECTORY_PREFERENCE_KEY]: parseDirectoryPreference(preferences.lastSaveDirectory),
    [LAST_EXPORT_DIRECTORY_PREFERENCE_KEY]: parseDirectoryPreference(preferences.lastExportDirectory),
    [RECOVERY_PREFERENCE_KEY]: String(preferences.recovery),
    [RECOVERY_MINUTES_PREFERENCE_KEY]: String(parseRecoveryMinutes(String(preferences.recoveryMinutes))),
    [RECOVERY_RETENTION_DAYS_PREFERENCE_KEY]: String(parseRecoveryRetentionDays(String(preferences.recoveryRetentionDays))),
    [PROJECT_BACKUP_ENABLED_PREFERENCE_KEY]: String(preferences.projectBackupEnabled),
    [PROJECT_BACKUP_VERSIONS_PREFERENCE_KEY]: String(parseProjectBackupVersions(String(preferences.projectBackupVersions))),
    [PROJECT_BACKUP_RETENTION_DAYS_PREFERENCE_KEY]: String(parseProjectBackupRetentionDays(String(preferences.projectBackupRetentionDays))),
    [PROJECT_BACKUP_DIRECTORY_PREFERENCE_KEY]: parseDirectoryPreference(preferences.projectBackupDirectory),
    [LOCAL_HISTORY_ENABLED_PREFERENCE_KEY]: String(preferences.localHistoryEnabled),
    [LOCAL_HISTORY_LIMIT_PREFERENCE_KEY]: String(parseLocalHistoryLimit(String(preferences.localHistoryLimit))),
    [HISTORY_LIMIT_PREFERENCE_KEY]: String(parseHistoryLimit(String(preferences.historyLimit))),
    [HISTORY_LIMIT_ENABLED_PREFERENCE_KEY]: String(preferences.historyLimitEnabled === true),
    [NEW_DOCUMENT_SIZE_PRESETS_KEY]: JSON.stringify(parseDocumentSizePresets(JSON.stringify(preferences.documentSizePresets))),
    [EXPORT_SCALE_PRESETS_KEY]: JSON.stringify(parseExportScalePresets(JSON.stringify(preferences.exportScalePresets))),
    [ROTATION_INDICATOR_POSITION_KEY]: preferences.rotationIndicatorPosition,
    [EXPORT_PROTECTION_KEY]: preferences.exportProtection,
    [REFERENCE_SCALING_KEY]: preferences.referenceScaling,
    [CANVAS_VIEW_SCROLLBARS_ENABLED_KEY]: String(preferences.canvasViewScrollbarsEnabled),
    [DRAWING_BRUSH_PREVIEW_ENABLED_KEY]: String(preferences.drawingBrushPreviewEnabled),
    [RELATIVE_LUMINANCE_SCOPE_KEY]: preferences.relativeLuminanceScope,
    [ZOOM_TOOL_DRAG_MODE_PREFERENCE_KEY]: preferences.zoomToolDragMode,
    [VIEW_DRAG_SENSITIVITY_PREFERENCE_KEY]: String(parseViewDragSensitivity(String(preferences.viewDragSensitivity))),
    [BRUSH_SHIFT_LINE_ENABLED_KEY]: String(preferences.brushShiftLineEnabled),
    ['moonsprite.preference.painting-cursor-shape']: preferences.paintingCursorShape,
    [PAINTING_CURSOR_TYPE_KEY]: preferences.paintingCursorType,
    [USE_LOCAL_CURSORS_PREFERENCE_KEY]: String(preferences.useLocalCursors),
    [CURSOR_SCALE_PREFERENCE_KEY]: String(preferences.cursorScale),
    [CURSOR_COLOR_MODE_PREFERENCE_KEY]: parseCursorColorMode(preferences.cursorColorMode),
    [CURSOR_COLOR_PREFERENCE_KEY]: colorHex(preferences.cursorColor),
    [BRUSH_EDGE_THICKNESS_PREFERENCE_KEY]: String(parseBrushEdgeThickness(String(preferences.brushEdgeThickness))),
    [BRUSH_PREVIEW_MODE_PREFERENCE_KEY]: preferences.brushPreviewMode,
    [CHECKER_SIZE_PREFERENCE_KEY]: String(preferences.checkerboard.size),
    [CHECKER_LIGHT_COLOR_PREFERENCE_KEY]: colorHex(preferences.checkerboard.lightColor),
    [CHECKER_DARK_COLOR_PREFERENCE_KEY]: colorHex(preferences.checkerboard.darkColor),
    [PIXEL_GRID_COLOR_PREFERENCE_KEY]: colorHex(preferences.pixelGridColor),
    [GRID_COLOR_PREFERENCE_KEY]: colorHex(preferences.gridColor),
    [GRID_ALIGNMENT_ENABLED_PREFERENCE_KEY]: String(preferences.gridAlignmentEnabled),
    [SMART_ALIGNMENT_ENABLED_PREFERENCE_KEY]: String(preferences.smartAlignmentEnabled),
    [ALIGNMENT_GUIDES_VISIBLE_PREFERENCE_KEY]: String(preferences.alignmentGuidesVisible),
    [ALIGNMENT_THRESHOLD_PREFERENCE_KEY]: String(parseAlignmentThreshold(String(preferences.alignmentThreshold))),
    [SLICE_COLOR_PREFERENCE_KEY]: colorHex(preferences.sliceColor),
    [FREE_TILE_INSTANCE_OUTLINE_COLOR_PREFERENCE_KEY]: colorHex(preferences.freeTileInstanceOutlineColor),
    [TEXT_BOX_COLOR_PREFERENCE_KEY]: colorHex(preferences.textBoxColor),
    [CANVAS_RESIZE_COLOR_PREFERENCE_KEY]: colorHex(preferences.canvasResizeColor),
    [SLICE_OUTLINES_VISIBLE_PREFERENCE_KEY]: String(preferences.sliceOutlinesVisible),
    [BRUSH_SIZE_WHEEL_REVERSED_PREFERENCE_KEY]: String(preferences.brushSizeWheelReversed),
    [WHEEL_ZOOM_ENABLED_PREFERENCE_KEY]: String(preferences.wheelZoomEnabled),
    [WHEEL_ZOOM_MODE_PREFERENCE_KEY]: preferences.wheelZoomMode,
    [SHIFT_LINE_PREVIEW_ENABLED_PREFERENCE_KEY]: String(preferences.shiftLinePreviewEnabled),
    [GRADIENT_LINE_VISIBLE_PREFERENCE_KEY]: String(preferences.gradientLineVisible),
    [GRADIENT_LINE_COLOR_PREFERENCE_KEY]: colorHex(preferences.gradientLineColor),
    [LASSO_PREVIEW_CLOSED_PREFERENCE_KEY]: String(preferences.lassoPreviewClosed),
    [EYEDROPPER_QUICK_SELECT_PREFERENCE_KEY]: String(preferences.eyedropperQuickSelect),
    [TOOLTIPS_ENABLED_PREFERENCE_KEY]: String(preferences.tooltipsEnabled),
    [KEY_DISPLAY_ENABLED_PREFERENCE_KEY]: String(preferences.keyDisplayEnabled),
    [KEY_DISPLAY_FUNCTION_PREFERENCE_KEY]: String(preferences.keyDisplayFunction),
    [KEY_DISPLAY_SIZE_PREFERENCE_KEY]: String(parseKeyDisplaySize(String(preferences.keyDisplaySize))),
    [KEY_DISPLAY_DURATION_PREFERENCE_KEY]: String(parseKeyDisplayDuration(String(preferences.keyDisplayDuration))),
    [EYEDROPPER_SWITCH_TO_PENCIL_PREFERENCE_KEY]: String(preferences.eyedropperSwitchToPencil),
    [EYEDROPPER_MAGNIFIER_ENABLED_PREFERENCE_KEY]: String(preferences.eyedropperMagnifierEnabled),
    [EYEDROPPER_MAGNIFIER_STYLE_PREFERENCE_KEY]: preferences.eyedropperMagnifierStyle,
    [EYEDROPPER_MAGNIFIER_SIZE_PREFERENCE_KEY]: String(parseEyedropperMagnifierSize(String(preferences.eyedropperMagnifierSize))),
    [EYEDROPPER_MAGNIFIER_DISTORTION_ENABLED_PREFERENCE_KEY]: String(preferences.eyedropperMagnifierDistortionEnabled),
    [MOVE_LAYER_CONTENT_PREVIEW_ENABLED_PREFERENCE_KEY]: String(preferences.moveLayerContentPreviewEnabled),
    [MOVE_LAYER_CLICK_FLASH_ENABLED_PREFERENCE_KEY]: String(preferences.moveLayerClickFlashEnabled),
    [MOVE_LAYER_CLICK_FLASH_DURATION_PREFERENCE_KEY]: String(parseMoveLayerClickFlashDuration(String(preferences.moveLayerClickFlashDuration))),
    [SELECTION_CROSSHAIR_PREFERENCE_KEY]: String(preferences.selectionCrosshair),
    [SELECTION_PREVIEW_COLOR_MODE_PREFERENCE_KEY]: parseSelectionPreviewColorMode(preferences.selectionPreviewColorMode),
    [SELECTION_PREVIEW_COLOR_PREFERENCE_KEY]: colorHex(preferences.selectionPreviewColor),
    [SELECTION_SIZE_VISIBLE_PREFERENCE_KEY]: String(preferences.selectionSizeVisible),
    [BALANCED_SHIFT_LINE_ENABLED_PREFERENCE_KEY]: String(preferences.balancedShiftLineEnabled),
    [OPTIMIZED_ROTATION_ENABLED_PREFERENCE_KEY]: String(preferences.optimizedRotationEnabled),
    [LINE_DIRECTION_STEP_PREFERENCE_KEY]: String(parseLineDirectionStep(String(preferences.lineDirectionStep))),
    [LAYER_DISPLAY_COLOR_PRESETS_KEY]: JSON.stringify(parseLayerDisplayColorPresets(JSON.stringify(preferences.layerDisplayColorPresets))),
    [COLOR_EDITOR_MODES_PREFERENCE_KEY]: JSON.stringify(parseColorEditorModes(JSON.stringify(preferences.colorEditorModes))),
    [ONION_SKIN_PREFERENCE_KEY]: JSON.stringify(parseOnionSkinPreferences(JSON.stringify(preferences.onionSkin))),
    [TIMELINE_HIDDEN_PREFERENCE_KEY]: String(preferences.timelineHidden),
    [SYMMETRY_AXIS_PREFERENCE_KEY]: JSON.stringify(parseSymmetryAxisPreferences(JSON.stringify(preferences.symmetryAxis))),
    [ISO_VIEW_PREFERENCE_KEY]: JSON.stringify(parseIsoViewPreferences(JSON.stringify(preferences.isoView))),
    [TIMELAPSE_RECORDING_ENABLED_PREFERENCE_KEY]: String(preferences.timelapseRecordingEnabled),
    [QUICK_COMMAND_BAR_ENABLED_PREFERENCE_KEY]: String(preferences.quickCommandBarEnabled),
    [QUICK_COMMAND_BAR_EXPANDED_PREFERENCE_KEY]: String(preferences.quickCommandBarExpanded),
    [QUICK_COMMAND_BAR_TRANSLUCENT_PREFERENCE_KEY]: String(preferences.quickCommandBarTranslucent),
    [QUICK_COMMAND_PREFERENCES_KEY]: JSON.stringify(parseQuickCommandPreferences(JSON.stringify(preferences.quickCommandPreferences))),
    [TOOL_RAIL_PREFERENCE_KEY]: serializeToolRail(preferences.toolRail),
    [QUICK_COMMAND_BARS_PREFERENCE_KEY]: JSON.stringify(parseQuickCommandBars(JSON.stringify(preferences.quickCommandBars), preferences.quickCommandPreferences)),
    [TABLET_PREFERENCES_KEY]: JSON.stringify(parseTabletPreferences(JSON.stringify(preferences.tablet))),
    [OUTLINE_SETTINGS_PREFERENCE_KEY]: preferences.outlineSettings ? JSON.stringify(cloneOutlineSettings(normalizeOutlineSettings(preferences.outlineSettings)!)) : ''
  }
  for (const [key, value] of Object.entries(values)) writeStoredString(key, value, storage)
  saveThemePreferences(theme, storage)
}
