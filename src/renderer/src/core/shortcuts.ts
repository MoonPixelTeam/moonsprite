import { DEFAULT_SHORTCUTS, SHORTCUT_GROUPS, type ShortcutId, type ShortcutMap, type ShortcutBindings, type ShortcutSettingsFile } from './shortcut-contracts'
export { DEFAULT_SHORTCUTS, SHORTCUT_GROUPS } from './shortcut-contracts'
export type { ShortcutId, ShortcutMap, ShortcutBindings, ShortcutSettingsFile, ShortcutGroupId } from './shortcut-contracts'
import { readStoredString, writeStoredJson, writeStoredString } from './storage'
import type { AppLocale } from './localization'
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

export const SHORTCUT_IDS = Object.keys(DEFAULT_SHORTCUTS) as ShortcutId[]
export const DEFAULT_SHORTCUT_BINDINGS = Object.fromEntries(
  SHORTCUT_IDS.map((id) => [id, DEFAULT_SHORTCUTS[id] ? [normalizeShortcut(DEFAULT_SHORTCUTS[id])] : []])
) as ShortcutBindings

export function normalizeShortcut(value: string): string {
  const parts = value.split('+').map((part) => part.trim()).filter(Boolean)
  const modifiers = ['Ctrl', 'Alt', 'Shift', 'Win', 'Space'].filter((modifier) => parts.some((part) => part.toLowerCase() === modifier.toLowerCase()))
  const key = parts.find((part) => !['ctrl', 'alt', 'shift', 'win', 'space'].includes(part.toLowerCase()))
  return [...modifiers, ...(key ? [key.length === 1 ? key.toUpperCase() : key] : [])].join('+')
}

export function modifierShortcutMatches(event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>, shortcut: string): boolean {
  const keys = shortcut.toLowerCase().split('+').map((key) => key.trim()).filter(Boolean)
  if (keys.length === 0 || keys.some((key) => !['ctrl', 'alt', 'shift'].includes(key))) return false
  const wantsCtrl = keys.includes('ctrl')
  const wantsAlt = keys.includes('alt')
  const wantsShift = keys.includes('shift')
  return Boolean(event.ctrlKey || event.metaKey) === wantsCtrl && Boolean(event.altKey) === wantsAlt && Boolean(event.shiftKey) === wantsShift
}

export function modifierShortcutHeld(event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>, shortcut: string, heldParts?: ReadonlySet<string>): boolean {
  const keys = normalizeShortcut(shortcut).split('+').filter(Boolean)
  return keys.length > 0 && keys.every((key) => {
    if (key === 'Ctrl') return Boolean(event.ctrlKey)
    if (key === 'Win') return Boolean(event.metaKey)
    if (key === 'Alt') return Boolean(event.altKey)
    if (key === 'Shift') return Boolean(event.shiftKey)
    return !['WheelUp', 'WheelDown', 'MouseDoubleLeft'].includes(key) && Boolean(heldParts?.has(key))
  })
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
    ? { WheelUp: '滚轮向上', WheelDown: '滚轮向下', MouseLeft: '鼠标左键', MouseRight: '鼠标右键', MouseMiddle: '鼠标中键', MouseDoubleLeft: '鼠标左键双击', MouseBack: '鼠标侧键 1', MouseForward: '鼠标侧键 2' }
    : { WheelUp: 'Wheel Up', WheelDown: 'Wheel Down', MouseLeft: 'Left Mouse', MouseRight: 'Right Mouse', MouseMiddle: 'Middle Mouse', MouseDoubleLeft: 'Double Left Mouse', MouseBack: 'Mouse Button 4', MouseForward: 'Mouse Button 5' }
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

export function shortcutRequiresHold(id: ShortcutId): boolean {
  return contextualModifierShortcutIds.has(id) || quickToolShortcutIds.has(id)
}

export function shortcutBindingSupported(id: ShortcutId, binding: string): boolean {
  const parts = normalizeShortcut(binding).split('+')
  if (parts.includes('Escape')) return false
  return !shortcutRequiresHold(id) || !parts.some((part) => ['WheelUp', 'WheelDown', 'MouseDoubleLeft', 'MouseLeft', 'MouseRight'].includes(part))
}

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
  if (!shortcutBindingSupported(id, normalized)) return { shortcuts: next, displaced: [] }
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
  return entries && entries.every(([id, bindings]) => bindings.every((binding) => shortcutBindingSupported(id, binding))) ? applyShortcutEntries(entries) : null
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

export function shortcutText(event: KeyboardEvent, heldParts?: ReadonlySet<string>): string {
  const key = keyboardEventKey(event)
  const modifiers = [event.ctrlKey ? 'Ctrl' : '', event.altKey ? 'Alt' : '', event.shiftKey ? 'Shift' : '', event.metaKey ? 'Win' : '', heldParts?.has('Space') && key !== 'Space' ? 'Space' : ''].filter(Boolean)
  const isModifier = key === 'Control' || key === 'Meta' || key === 'Alt' || key === 'Shift'
  const ordinaryKey = isModifier ? '' : key.length === 1 ? key.toUpperCase() : key
  return [...modifiers, ...(ordinaryKey ? [ordinaryKey] : [])].join('+')
}

export function wheelShortcutKey(delta: number): 'WheelUp' | 'WheelDown' | '' {
  return delta < 0 ? 'WheelUp' : delta > 0 ? 'WheelDown' : ''
}

export function wheelShortcutText(
  event: Pick<WheelEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>,
  delta: number,
  heldParts?: ReadonlySet<string>
): string {
  const key = wheelShortcutKey(delta)
  if (!key) return ''
  const modifiers = [event.ctrlKey ? 'Ctrl' : '', event.altKey ? 'Alt' : '', event.shiftKey ? 'Shift' : '', event.metaKey ? 'Win' : '', heldParts?.has('Space') ? 'Space' : ''].filter(Boolean)
  return [...modifiers, key].join('+')
}

export type MouseShortcutKey = 'MouseLeft' | 'MouseRight' | 'MouseMiddle' | 'MouseBack' | 'MouseForward'

export function mouseShortcutKey(button: number): MouseShortcutKey | '' {
  if (button === 0) return 'MouseLeft'
  if (button === 1) return 'MouseMiddle'
  if (button === 2) return 'MouseRight'
  if (button === 3) return 'MouseBack'
  if (button === 4) return 'MouseForward'
  return ''
}

export function mouseDoubleClickShortcutText(
  event: Pick<MouseEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>,
  heldParts?: ReadonlySet<string>
): string {
  const modifiers = [event.ctrlKey ? 'Ctrl' : '', event.altKey ? 'Alt' : '', event.shiftKey ? 'Shift' : '', event.metaKey ? 'Win' : '', heldParts?.has('Space') ? 'Space' : ''].filter(Boolean)
  return [...modifiers, 'MouseDoubleLeft'].join('+')
}

export function mouseShortcutText(
  event: Pick<MouseEvent, 'button' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>,
  heldParts?: ReadonlySet<string>
): string {
  const key = mouseShortcutKey(event.button)
  if (!key) return ''
  const modifiers = [event.ctrlKey ? 'Ctrl' : '', event.altKey ? 'Alt' : '', event.shiftKey ? 'Shift' : '', event.metaKey ? 'Win' : '', heldParts?.has('Space') ? 'Space' : ''].filter(Boolean)
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
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    altKey: event.altKey,
    shiftKey: event.shiftKey,
    bubbles: true,
    cancelable: true,
    composed: true
  }))
}

export function dispatchMouseDoubleClickShortcutInput(
  target: EventTarget,
  event: Pick<MouseEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>
): boolean {
  const init: KeyboardEventInit = {
    key: 'MouseDoubleLeft',
    code: 'MouseDoubleLeft',
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
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
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
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

export function shortcutMatchesEvent(event: KeyboardEvent, shortcut: string, heldParts?: ReadonlySet<string>): boolean {
  return shortcut.trim() !== '' && normalizeShortcut(shortcutText(event, heldParts)).toLowerCase() === normalizeShortcut(shortcut).toLowerCase()
}

export function shortcutMatchesAnyEvent(event: KeyboardEvent, shortcuts: readonly string[]): boolean {
  return shortcuts.some((shortcut) => shortcutMatchesEvent(event, shortcut))
}

export function shortcutReleasedByEvent(event: KeyboardEvent, shortcut: string): boolean {
  const parts = normalizeShortcut(shortcut).split('+').filter(Boolean)
  const released = keyboardEventKey(event).toLowerCase()
  if (released === 'control') return parts.includes('Ctrl')
  if (released === 'meta') return parts.includes('Win')
  if (released === 'alt') return parts.includes('Alt')
  if (released === 'shift') return parts.includes('Shift')
  return parts.some((part) => !['Ctrl', 'Alt', 'Shift', 'Win'].includes(part) && part.toLowerCase() === released)
}

export function shortcutReleasedByBindings(event: KeyboardEvent, shortcuts: readonly string[]): boolean {
  return shortcuts.some((shortcut) => shortcutReleasedByEvent(event, shortcut))
}

export function shortcutKeyPart(event: KeyboardEvent): string {
  const key = keyboardEventKey(event)
  if (key === 'Control') return 'Ctrl'
  if (key === 'Meta') return 'Win'
  if (key === 'Alt' || key === 'Shift') return key
  return key.length === 1 ? key.toUpperCase() : key
}

export function shortcutHeldByKeyParts(heldParts: ReadonlySet<string>, shortcut: string): boolean {
  const parts = normalizeShortcut(shortcut).split('+').filter(Boolean)
  return parts.length > 0 && parts.every((part) => !['WheelUp', 'WheelDown', 'MouseDoubleLeft'].includes(part) && heldParts.has(part))
}

export function modifierShortcutHeldByBindings(
  event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>,
  shortcuts: readonly string[],
  heldParts?: ReadonlySet<string>
): boolean {
  return shortcuts.some((shortcut) => modifierShortcutHeld(event, shortcut, heldParts))
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
