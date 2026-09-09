import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  DEFAULT_COLOR_EDITOR_MODES,
  EYEDROPPER_MAGNIFIER_SIZE_VALUES,
  DEFAULT_LAYER_DISPLAY_COLOR_PRESETS,
  DEFAULT_QUICK_COMMAND_BARS,
  UI_SCALE_VALUES,
  VIEW_DRAG_SENSITIVITY_VALUES,
  loadEditorPreferences,
  parseDocumentSizePresets,
  parseExportScalePresets,
  parseAlignmentThreshold,
  parseLayerDisplayColorPresets,
  saveEditorPreferences,
  setEditorPreferencesPreview,
  type BrushPreviewMode,
  type CursorScale,
  type DocumentSizePreset,
  type EyedropperMagnifierSize,
  type EyedropperMagnifierStyle,
  type MoveLayerClickFlashDuration,
  MOVE_LAYER_CLICK_FLASH_DURATIONS,
  type QuickCommandId,
  type QuickCommandBarEdge,
  type QuickCommandBarPreference,
  type RelativeLuminanceScope,
  type RotationIndicatorPosition,
  type SelectionPreviewColorMode,
  type ToolIconScale,
  type TabletApi,
  type TabletBarrelButtonAction,
  type TabletTouchMode,
  type UiMotionLevel,
  type UiScale,
  type ViewDragSensitivity,
  type WheelZoomMode,
  type ZoomToolDragMode
} from '@/core/file-preferences'
import { PixelUtilityIcon } from '@/components/PixelUtilityIcon'
import { clearStoredValuesExcept } from '@/core/storage'
import { GALLERY_PINS_STORAGE_KEY, RECENT_PROJECTS_STORAGE_KEY } from '@/core/home-history'
import { WORKSPACE_LAYOUT_STORAGE_KEYS } from '@/core/workspace-layout-preferences'
import { AVAILABLE_APP_LOCALES, localeDisplayName, type AppLocale, type TranslationKey } from '@/core/localization'
import { ColorValueControl } from '@/components/ColorValueControl'
import { DeleteIconButton } from '@/components/DeleteIconButton'
import { DialogHeader } from '@/components/DialogHeader'
import { FormField } from '@/components/FormField'
import { useI18n } from '@/components/I18nProvider'
import { ModalShell } from '@/components/ModalShell'
import { NumberInput } from '@/components/NumberInput'
import { PixelCheckbox } from '@/components/PixelCheckbox'
import { PreferenceToggle } from '@/components/PreferenceToggle'
import { SettingsSectionHeader } from '@/components/SettingsSectionHeader'
import { SettingsNavigation } from '@/components/SettingsNavigation'
import { PreferenceSearchContext, searchText } from '@/components/PreferenceSearchContext'
import { TextInput } from '@/components/TextInput'
import { ThemedSelect } from '@/components/ThemedSelect'
import { useWorkspace } from '@/store/workspace'
import { applyThemeToDocument, resolveTheme, type ThemeVisualDefaults } from '@/core/theme'
import { ThemePreferencesSection } from './ThemePreferencesSection'
import { QUICK_COMMAND_METADATA } from '@/components/app/quick-command-registry'
import { PixelAssetIcon } from '@/components/app/editor-tools'
import { colorValueModeLabel } from '@/core/color-values'
import type { StoredExtension } from '@shared/types'

interface PreferencesDialogProps {
  initialSection?: PreferenceSection
  onClose: () => void
  onPresetChange: (documentSizes: DocumentSizePreset[], exportScales: number[]) => void
}

export type PreferenceSection = 'general' | 'quickCommands' | 'appearance' | 'theme' | 'input' | 'tablet' | 'tools' | 'files' | 'colorLayers' | 'presets' | 'extensions' | 'reset'

const PREFERENCE_SECTIONS: Array<[PreferenceSection, TranslationKey]> = [
  ['general', 'preferences.sections.general'],
  ['quickCommands', 'preferences.sections.quickCommands'],
  ['appearance', 'preferences.sections.appearance'],
  ['theme', 'preferences.sections.theme'],
  ['input', 'preferences.sections.input'],
  ['tablet', 'preferences.sections.tablet'],
  ['tools', 'preferences.sections.tools'],
  ['files', 'preferences.sections.files'],
  ['colorLayers', 'preferences.sections.colors'],
  ['presets', 'preferences.sections.presets'],
  ['extensions', 'preferences.sections.extensions'],
  ['reset', 'preferences.sections.reset']
]

const QUICK_COMMAND_SEARCH_KEYS = Object.values(QUICK_COMMAND_METADATA).flatMap(({ description, label }) => [label, description])

const PREFERENCE_SEARCH_KEYS: Record<PreferenceSection, TranslationKey[]> = {
  general: ['preferences.groups.interface', 'preferences.groups.project', 'preferences.language', 'preferences.uiScale', 'preferences.toolIconScale', 'preferences.animations', 'preferences.timelapseRecording'],
  quickCommands: ['preferences.sections.quickCommands', 'preferences.groups.quickCommandLayout', 'preferences.quickCommandBar', 'preferences.quickCommandBarTranslucent', 'preferences.quickCommandBarTranslucentHint', 'preferences.quickCommandOrderHint', 'preferences.quickCommandBarName', 'preferences.quickCommandBarEdge', ...QUICK_COMMAND_SEARCH_KEYS],
  appearance: ['preferences.groups.canvas', 'preferences.checkerSize', 'preferences.checkerColors', 'preferences.lightColor', 'preferences.darkColor', 'preferences.pixelGridColor', 'preferences.gridColor', 'preferences.sliceColor', 'preferences.freeTileInstanceOutlineColor', 'preferences.textBoxColor', 'preferences.canvasResizeColor', 'preferences.luminanceScope'],
  theme: ['preferences.groups.theme', 'preferences.theme.available', 'preferences.theme.current'],
  input: ['preferences.groups.cursor', 'preferences.localCursor', 'preferences.cursorScale', 'preferences.groups.zoom', 'preferences.wheelZoom', 'preferences.wheelZoomMode', 'preferences.zoomMode', 'preferences.viewDragSensitivity', 'preferences.position'],
  tablet: ['preferences.groups.tablet', 'preferences.tablet.api', 'preferences.tablet.touchMode', 'preferences.tablet.pressure', 'preferences.tablet.eraserTip', 'preferences.tablet.barrelButton', 'preferences.tablet.twoFingerZoom', 'preferences.tablet.twoFingerRotate', 'preferences.tablet.tilt', 'preferences.tablet.twist'],
  tools: ['preferences.groups.previews', 'preferences.brushPreview', 'preferences.drawingBrushPreview', 'preferences.selectionCrosshair', 'preferences.selectionPreviewColor', 'preferences.selectionPreviewColor.auto', 'preferences.selectionPreviewColor.custom', 'preferences.selectionPreviewCustomColor', 'preferences.selectionSizeVisible', 'preferences.moveLayerContentPreview', 'preferences.moveLayerClickFlash', 'preferences.moveLayerClickFlashDuration', 'preferences.groups.alignment', 'preferences.gridAlignment', 'preferences.gridAlignmentHint', 'preferences.smartAlignment', 'preferences.smartAlignmentHint', 'preferences.alignmentGuides', 'preferences.alignmentGuidesHint', 'preferences.alignmentThreshold', 'preferences.alignmentThresholdHint', 'preferences.groups.drawing', 'preferences.gradientLineVisible', 'preferences.gradientLineColor', 'preferences.shiftLinePreview', 'preferences.balancedLine', 'preferences.balancedLineHint', 'preferences.optimizedRotation', 'preferences.optimizedRotationHint', 'preferences.lineDirectionStep', 'preferences.lassoClosed', 'preferences.eyedropperPencil', 'preferences.groups.eyedropper', 'preferences.eyedropperQuickSelect', 'preferences.eyedropperMagnifier', 'preferences.eyedropperMagnifierSize', 'preferences.eyedropperMagnifierStyle', 'preferences.eyedropperMagnifierDistortion'],
  files: ['preferences.groups.locations', 'preferences.saveDirectory', 'preferences.exportDirectory', 'preferences.groups.formats', 'preferences.saveFormat', 'preferences.exportFormat', 'preferences.groups.recovery', 'preferences.recovery', 'preferences.recoveryRetentionDays', 'preferences.recoveryRetentionDaysHint'],
  colorLayers: ['preferences.colorModes', 'preferences.restoreDefaults'],
  presets: ['preferences.newDocumentPresets', 'preferences.addSize', 'preferences.exportScalePresets', 'preferences.addScale', 'preferences.layerColors', 'preferences.addColor', 'preferences.restoreDefaults'],
  extensions: ['preferences.groups.extensions', 'preferences.extensions.add', 'preferences.extensions.openFolder', 'preferences.extensions.empty', 'preferences.extensions.entry', 'preferences.extensions.commands', 'preferences.extensions.panels', 'preferences.extensions.menus', 'preferences.extensions.enabled', 'preferences.extensions.disabled', 'preferences.extensions.enable', 'preferences.extensions.disable', 'preferences.extensions.uninstall'],
  reset: ['preferences.resetDescription', 'preferences.resetAll']
}

type PreferenceOrderKind = 'color-mode' | 'quick-command'

interface PreferencePointerDrag {
  kind: PreferenceOrderKind
  id: string
  barId?: string
  pointerId: number
  captureTarget: HTMLElement
}

function reorderPreferenceItems<T>(items: T[], sourceId: string, targetId: string, insertAfter: boolean, itemId: (item: T) => string): T[] {
  const sourceIndex = items.findIndex((item) => itemId(item) === sourceId)
  if (sourceIndex < 0 || sourceId === targetId) return items
  const next = [...items]
  const [item] = next.splice(sourceIndex, 1)
  const targetIndex = next.findIndex((candidate) => itemId(candidate) === targetId)
  if (targetIndex < 0) return items
  next.splice(targetIndex + (insertAfter ? 1 : 0), 0, item)
  return next.every((candidate, index) => itemId(candidate) === itemId(items[index])) ? items : next
}

function PreferenceGroup({ actions, children, className = '', title }: { actions?: ReactNode; children: ReactNode; className?: string; title: ReactNode }) {
  return <section className={`preference-settings-group ${className}`.trim()}>
    <SettingsSectionHeader title={title} actions={actions} />
    <div className="preference-settings-group-body">{children}</div>
  </section>
}

export function PreferencesDialog({ initialSection = 'general', onClose, onPresetChange }: PreferencesDialogProps) {
  const { locale, t } = useI18n()
  const [section, setSection] = useState<PreferenceSection>(initialSection)
  const [query, setQuery] = useState('')
  const [preferences, setPreferences] = useState(loadEditorPreferences)
  const [defaultDirectories, setDefaultDirectories] = useState({ saveDirectory: 'gallery', exportDirectory: 'exports' })
  const [extensions, setExtensions] = useState<StoredExtension[]>([])
  const [extensionsLoading, setExtensionsLoading] = useState(false)
  const [extensionBusyId, setExtensionBusyId] = useState<string | null>(null)
  const [draggedPreferenceItem, setDraggedPreferenceItem] = useState<{ kind: PreferenceOrderKind; id: string; barId?: string } | null>(null)
  const [collapsedQuickCommandBars, setCollapsedQuickCommandBars] = useState<Set<string>>(() => new Set(preferences.quickCommandBars.filter((bar) => bar.edge === 'none').map((bar) => bar.id)))
  const preferencePointerDragRef = useRef<PreferencePointerDrag | null>(null)
  const update = <K extends keyof typeof preferences>(key: K, value: typeof preferences[K]): void => setPreferences((current) => ({ ...current, [key]: value }))
  const updateDocumentSize = (index: number, key: keyof DocumentSizePreset, value: number): void => update('documentSizePresets', preferences.documentSizePresets.map((preset, presetIndex) => presetIndex === index ? { ...preset, [key]: value } : preset))
  const updateLayerColorPreset = (index: number, color: typeof preferences.layerDisplayColorPresets[number]): void => update('layerDisplayColorPresets', preferences.layerDisplayColorPresets.map((preset, presetIndex) => presetIndex === index ? { ...color, a: 255 } : preset))
  const setVisualOverride = (key: keyof ThemeVisualDefaults, color: typeof preferences.pixelGridColor): void => setPreferences((current) => {
    const theme = { ...current.theme, visualOverrides: { ...current.theme.visualOverrides, [key]: { ...color } } }
    if (key === 'checkerLight') return { ...current, theme, checkerboard: { ...current.checkerboard, lightColor: { ...color, a: 255 } } }
    if (key === 'checkerDark') return { ...current, theme, checkerboard: { ...current.checkerboard, darkColor: { ...color, a: 255 } } }
    if (key === 'pixelGrid') return { ...current, theme, pixelGridColor: { ...color } }
    if (key === 'customGrid') return { ...current, theme, gridColor: { ...color } }
    return { ...current, theme }
  })
  const clearVisualOverrides = (keys: Array<keyof ThemeVisualDefaults>): void => setPreferences((current) => {
    const visualOverrides = { ...(current.theme.visualOverrides ?? {}) }
    for (const key of keys) delete visualOverrides[key]
    const theme = { ...current.theme, visualOverrides }
    const visual = resolveTheme(theme).visualDefaults
    return {
      ...current,
      theme,
      checkerboard: { ...current.checkerboard, lightColor: keys.includes('checkerLight') ? { ...visual.checkerLight } : current.checkerboard.lightColor, darkColor: keys.includes('checkerDark') ? { ...visual.checkerDark } : current.checkerboard.darkColor },
      pixelGridColor: keys.includes('pixelGrid') ? { ...visual.pixelGrid } : current.pixelGridColor,
      gridColor: keys.includes('customGrid') ? { ...visual.customGrid } : current.gridColor
    }
  })
  const moveColorMode = (mode: string, targetMode: string, insertAfter: boolean): void => setPreferences((current) => {
    const next = reorderPreferenceItems(current.colorEditorModes, mode, targetMode, insertAfter, (item) => item.mode)
    if (next === current.colorEditorModes) return current
    return { ...current, colorEditorModes: next }
  })
  const updateQuickCommandBar = (barId: string, patch: Partial<QuickCommandBarPreference>): void => {
    setPreferences((current) => ({
      ...current,
      quickCommandBars: current.quickCommandBars.map((bar) => bar.id === barId ? { ...bar, ...patch } : bar)
    }))
    if (patch.edge !== undefined) {
      setCollapsedQuickCommandBars((current) => {
        const next = new Set(current)
        if (patch.edge === 'none') next.add(barId)
        else next.delete(barId)
        if (next.size === current.size && (patch.edge === 'none' ? current.has(barId) : !current.has(barId))) return current
        return next
      })
    }
  }
  const toggleQuickCommandBarCollapsed = (barId: string): void => setCollapsedQuickCommandBars((current) => {
    const next = new Set(current)
    if (next.has(barId)) next.delete(barId)
    else next.add(barId)
    return next
  })
  const moveQuickCommand = (barId: string, id: QuickCommandId, targetId: QuickCommandId, insertAfter: boolean): void => setPreferences((current) => {
    const bar = current.quickCommandBars.find((candidate) => candidate.id === barId)
    if (!bar) return current
    const next = reorderPreferenceItems(bar.commands, id, targetId, insertAfter, (item) => item.id)
    if (next === bar.commands) return current
    return { ...current, quickCommandBars: current.quickCommandBars.map((candidate) => candidate.id === barId ? { ...candidate, commands: next } : candidate) }
  })
  const beginPreferencePointerDrag = (event: React.PointerEvent<HTMLElement>, kind: PreferenceOrderKind, id: string, barId?: string): void => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    preferencePointerDragRef.current = { kind, id, barId, pointerId: event.pointerId, captureTarget: event.currentTarget }
    setDraggedPreferenceItem({ kind, id, barId })
  }
  useEffect(() => {
    setEditorPreferencesPreview(preferences)
    applyThemeToDocument(preferences.theme)
    window.dispatchEvent(new Event('moonsprite:preferences-changed'))
  }, [preferences])
  useEffect(() => {
    setSection(initialSection)
  }, [initialSection])
  useEffect(() => {
    if (typeof window.moonSprite?.getDefaultFileDirectories !== 'function') return
    let active = true
    void window.moonSprite.getDefaultFileDirectories().then((directories) => {
      if (active) setDefaultDirectories(directories)
    }).catch(() => undefined)
    return () => { active = false }
  }, [])
  const refreshExtensions = useCallback(async (): Promise<void> => {
    if (typeof window.moonSprite?.listExtensions !== 'function') return
    setExtensionsLoading(true)
    try {
      const listing = await window.moonSprite.listExtensions()
      setExtensions(listing.extensions)
    } catch (error) {
      useWorkspace.getState().setMessage(error instanceof Error ? error.message : t('preferences.extensions.operationFailed'))
    } finally {
      setExtensionsLoading(false)
    }
  }, [t])
  useEffect(() => {
    void refreshExtensions()
    const onExtensionsChanged = (): void => { void refreshExtensions() }
    window.addEventListener('moonsprite:extensions-changed', onExtensionsChanged)
    return () => window.removeEventListener('moonsprite:extensions-changed', onExtensionsChanged)
  }, [refreshExtensions])
  useEffect(() => () => {
    setEditorPreferencesPreview(null)
    applyThemeToDocument(loadEditorPreferences().theme)
    window.dispatchEvent(new Event('moonsprite:preferences-changed'))
  }, [])
  useEffect(() => {
    const move = (event: PointerEvent): void => {
      const drag = preferencePointerDragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      const selector = `[data-preference-order-kind="${drag.kind}"]`
      const row = (typeof document.elementsFromPoint === 'function' ? document.elementsFromPoint(event.clientX, event.clientY) : [])
        .map((element) => element.closest<HTMLElement>(selector))
        .find((element): element is HTMLElement => Boolean(element))
        ?? (event.target instanceof Element ? event.target.closest<HTMLElement>(selector) : null)
      const targetId = row?.dataset.preferenceOrderId
      if (!row || !targetId || targetId === drag.id) return
      const bounds = row.getBoundingClientRect()
      const insertAfter = event.clientY >= bounds.top + bounds.height / 2
      if (drag.kind === 'color-mode') moveColorMode(drag.id, targetId, insertAfter)
      else if (drag.barId && row.dataset.quickCommandBarId === drag.barId) moveQuickCommand(drag.barId, drag.id as QuickCommandId, targetId as QuickCommandId, insertAfter)
      event.preventDefault()
    }
    const end = (event: PointerEvent): void => {
      const drag = preferencePointerDragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      if (drag.captureTarget.hasPointerCapture(event.pointerId)) drag.captureTarget.releasePointerCapture(event.pointerId)
      preferencePointerDragRef.current = null
      setDraggedPreferenceItem(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
  }, [])
  const recoveryValue = preferences.recovery ? String(preferences.recoveryMinutes) : 'off'
  const choosePreferenceDirectory = async (kind: 'saveDirectory' | 'exportDirectory'): Promise<void> => {
    if (typeof window.moonSprite?.chooseDirectory !== 'function') return
    const currentPath = preferences[kind] || defaultDirectories[kind]
    try {
      const result = await window.moonSprite.chooseDirectory(currentPath)
      if (!result.canceled && result.directoryPath) update(kind, result.directoryPath)
    } catch {
      useWorkspace.getState().setMessage(t('preferences.directorySelectFailed'))
    }
  }
  const chooseExtension = async (): Promise<void> => {
    try {
      const extension = await window.moonSprite.chooseAndInstallExtension()
      if (!extension) return
      await refreshExtensions()
      window.dispatchEvent(new Event('moonsprite:extensions-changed'))
      useWorkspace.getState().setMessage(t('preferences.extensions.installSuccess', { name: extension.name }))
    } catch (error) {
      useWorkspace.getState().setMessage(error instanceof Error ? error.message : t('preferences.extensions.installFailed'))
    }
  }
  const openExtensionFolder = async (): Promise<void> => {
    try {
      await window.moonSprite.openExtensionFolder()
    } catch (error) {
      useWorkspace.getState().setMessage(error instanceof Error ? error.message : t('preferences.extensions.operationFailed'))
    }
  }
  const toggleExtension = async (extension: StoredExtension): Promise<void> => {
    if (extensionBusyId) return
    setExtensionBusyId(extension.id)
    try {
      const updated = await window.moonSprite.setExtensionEnabled(extension.id, !extension.enabled)
      setExtensions((current) => current.map((item) => item.id === updated.id ? updated : item))
      window.dispatchEvent(new Event('moonsprite:extensions-changed'))
    } catch (error) {
      useWorkspace.getState().setMessage(error instanceof Error ? error.message : t('preferences.extensions.operationFailed'))
    } finally {
      setExtensionBusyId(null)
    }
  }
  const uninstallExtension = async (extension: StoredExtension): Promise<void> => {
    const choice = await useWorkspace.getState().requestDialog({
      title: t('preferences.extensions.uninstallTitle'),
      message: t('preferences.extensions.uninstallMessage', { name: extension.name }),
      detail: t('preferences.extensions.path', { path: extension.filePath }),
      choices: [
        { id: 'cancel', label: t('preferences.cancel'), tone: 'quiet' },
        { id: 'uninstall', label: t('preferences.extensions.uninstall'), tone: 'danger' }
      ]
    })
    if (choice !== 'uninstall' || extensionBusyId) return
    setExtensionBusyId(extension.id)
    try {
      await window.moonSprite.uninstallExtension(extension.id)
      await refreshExtensions()
      window.dispatchEvent(new Event('moonsprite:extensions-changed'))
    } catch (error) {
      useWorkspace.getState().setMessage(error instanceof Error ? error.message : t('preferences.extensions.operationFailed'))
    } finally {
      setExtensionBusyId(null)
    }
  }
  const persist = (): void => {
    const documentSizePresets = parseDocumentSizePresets(JSON.stringify(preferences.documentSizePresets))
    const exportScalePresets = parseExportScalePresets(JSON.stringify(preferences.exportScalePresets))
    const layerDisplayColorPresets = parseLayerDisplayColorPresets(JSON.stringify(preferences.layerDisplayColorPresets))
    setPreferences((current) => ({ ...current, documentSizePresets, exportScalePresets, layerDisplayColorPresets }))
    saveEditorPreferences({ ...preferences, documentSizePresets, exportScalePresets, layerDisplayColorPresets })
    window.dispatchEvent(new Event('moonsprite:preferences-changed'))
    onPresetChange(documentSizePresets, exportScalePresets)
  }
  const resetAllSettings = async (): Promise<void> => {
    const choice = await useWorkspace.getState().requestDialog({
      title: t('preferences.resetDialog.title'),
      message: t('preferences.resetDialog.message'),
      detail: t('preferences.resetDialog.detail'),
      choices: [
        { id: 'cancel', label: t('preferences.cancel'), tone: 'quiet' },
        { id: 'reset', label: t('preferences.resetAll'), tone: 'danger' }
      ]
    })
    if (choice !== 'reset') return
    clearStoredValuesExcept([RECENT_PROJECTS_STORAGE_KEY, GALLERY_PINS_STORAGE_KEY, ...WORKSPACE_LAYOUT_STORAGE_KEYS])
    setEditorPreferencesPreview(null)
    const defaults = loadEditorPreferences()
    setPreferences(defaults)
    onPresetChange(defaults.documentSizePresets, defaults.exportScalePresets)
    applyThemeToDocument(defaults.theme)
    window.dispatchEvent(new Event('moonsprite:preferences-changed'))
  }
  const toggle = (label: string, checked: boolean, onChange: (checked: boolean) => void, tooltip?: string) => <PreferenceToggle label={label} checked={checked} onChange={onChange} tooltip={tooltip} />
  const normalizedQuery = query.trim().toLocaleLowerCase(locale)
  const preferenceSectionMatches = useMemo(() => new Map(PREFERENCE_SECTIONS.map(([value, labelKey]) => [value, !normalizedQuery || [t(labelKey), ...PREFERENCE_SEARCH_KEYS[value].map((key) => t(key))].some((label) => label.toLocaleLowerCase(locale).includes(normalizedQuery))])), [locale, normalizedQuery, t])
  const visiblePreferenceSections = PREFERENCE_SECTIONS
  const hasPreferenceMatches = !normalizedQuery || Array.from(preferenceSectionMatches.values()).some(Boolean)
  const preferenceSearch = useMemo(() => ({ query: normalizedQuery, matches: (value: ReactNode) => !normalizedQuery || (() => {
    const text = searchText(value)
    return text.toLocaleLowerCase(locale).includes(normalizedQuery)
  })() }), [locale, normalizedQuery])
  /* Keep every category visible while searching; unmatched categories are
     muted so the user can still open and inspect them. */
  useEffect(() => {
    if (!normalizedQuery || preferenceSectionMatches.get(section)) return
    const first = PREFERENCE_SECTIONS.find(([value]) => preferenceSectionMatches.get(value))?.[0]
    if (first) setSection(first)
  }, [normalizedQuery, preferenceSectionMatches, section])

  return <div className="modal-backdrop" role="presentation"><ModalShell storageKey="preferences" defaultWidth={720} defaultHeight={560} minWidth={620} minHeight={460} fitContent={false} className="settings-modal" role="dialog" aria-label={t('preferences.title')}>
    <DialogHeader eyebrow={t('preferences.eyebrow')} title={t('preferences.title')} closeLabel={t('common.close')} onClose={onClose} />
    <div className="settings-layout"><aside className="preference-settings-sidebar"><div className="preference-sidebar-search"><TextInput className="preference-search" placeholder={t('preferences.search')} value={query} onChange={(event) => setQuery(event.target.value)} /></div><SettingsNavigation label={t('preferences.title')} value={section} items={visiblePreferenceSections.map(([value, labelKey]) => ({ value, label: t(labelKey), muted: Boolean(normalizedQuery && !preferenceSectionMatches.get(value)) }))} onChange={setSection} /></aside><PreferenceSearchContext.Provider value={preferenceSearch}><main className="component-scrollbar">
      {!hasPreferenceMatches ? <p className="preference-search-empty">{t('preferences.searchNoResults')}</p> : <>
      {section === 'general' && <>
        <PreferenceGroup title={t('preferences.groups.interface')}>
          <FormField className="preference-field" label={t('preferences.language')}><ThemedSelect value={preferences.language} groups={[{ label: t('preferences.languageGroup'), options: AVAILABLE_APP_LOCALES.map((value) => ({ value, label: localeDisplayName(value, locale) })) }]} label={t('preferences.language')} onChange={(value) => update('language', value as AppLocale)} /></FormField>
          <FormField className="preference-field" label={t('preferences.uiScale')}><ThemedSelect value={String(preferences.uiScale)} groups={[{ label: t('preferences.uiScaleGroup'), options: UI_SCALE_VALUES.map((value) => ({ value: String(value), label: `${Math.round(value * 100)}%`, description: value === 0.75 ? t('preferences.uiScaleFractionalHint') : undefined })) }]} label={t('preferences.uiScale')} onChange={(value) => update('uiScale', Number(value) as UiScale)} /></FormField>
          <FormField className="preference-field" label={t('preferences.toolIconScale')}><ThemedSelect value={String(preferences.toolIconScale)} groups={[{ label: t('preferences.toolIconScaleGroup'), options: [{ value: '1', label: t('preferences.toolIconScale.normal') }, { value: '2', label: t('preferences.toolIconScale.large') }] }]} label={t('preferences.toolIconScale')} onChange={(value) => update('toolIconScale', Number(value) as ToolIconScale)} /></FormField>
          <FormField className="preference-field" label={t('preferences.animations')} hint={t('preferences.animationsHint')}><ThemedSelect value={preferences.uiMotionLevel} groups={[{ label: t('preferences.animationsGroup'), options: [
            { value: 'off', label: t('preferences.animationsLevel.off'), description: t('preferences.animationsLevel.offHint') },
            { value: 'subtle', label: t('preferences.animationsLevel.subtle'), description: t('preferences.animationsLevel.subtleHint') },
            { value: 'normal', label: t('preferences.animationsLevel.normal'), description: t('preferences.animationsLevel.normalHint') },
            { value: 'full', label: t('preferences.animationsLevel.full'), description: t('preferences.animationsLevel.fullHint') }
          ] }]} label={t('preferences.animations')} onChange={(value) => {
            const uiMotionLevel = value as UiMotionLevel
            setPreferences((current) => ({ ...current, uiMotionLevel, animationsEnabled: uiMotionLevel !== 'off' }))
          }} /></FormField>
        </PreferenceGroup>
        <PreferenceGroup title={t('preferences.groups.project')}>
          {toggle(t('preferences.timelapseRecording'), preferences.timelapseRecordingEnabled, (value) => update('timelapseRecordingEnabled', value), t('preferences.timelapseRecordingHint'))}
        </PreferenceGroup>
      </>}
      {section === 'quickCommands' && <PreferenceGroup title={t('preferences.groups.quickCommandLayout')} actions={<button type="button" className="quiet-button" onClick={() => update('quickCommandBars', DEFAULT_QUICK_COMMAND_BARS.map((bar, index) => ({ ...bar, name: t('preferences.quickCommandDefaultName', { index: index + 1 }), commands: bar.commands.map((item) => ({ ...item })) })))}><PixelUtilityIcon kind="restore" />{t('preferences.restoreDefaults')}</button>}>
        {toggle(t('preferences.quickCommandBar'), preferences.quickCommandBarEnabled, (value) => update('quickCommandBarEnabled', value), t('preferences.quickCommandBarHint'))}
        {toggle(t('preferences.quickCommandBarTranslucent'), preferences.quickCommandBarTranslucent, (value) => update('quickCommandBarTranslucent', value), t('preferences.quickCommandBarTranslucentHint'))}
        <p className="preference-quick-command-hint">{t('preferences.quickCommandOrderHint')}</p>
        <div className="preference-quick-command-bars">{preferences.quickCommandBars.map((bar) => {
          const collapsed = collapsedQuickCommandBars.has(bar.id)
          return <section className={`preference-quick-command-bar ${collapsed ? 'collapsed' : ''}`} key={bar.id}>
          <header className="preference-quick-command-bar-header"><TextInput className="preference-quick-command-bar-name" aria-label={t('preferences.quickCommandBarName')} value={bar.name} maxLength={32} onChange={(event) => updateQuickCommandBar(bar.id, { name: event.target.value })} /><ThemedSelect value={bar.edge} groups={[{ label: t('preferences.quickCommandBarEdge'), options: [{ value: 'top' as QuickCommandBarEdge, label: t('common.top') }, { value: 'right' as QuickCommandBarEdge, label: t('common.right') }, { value: 'bottom' as QuickCommandBarEdge, label: t('common.bottom') }, { value: 'left' as QuickCommandBarEdge, label: t('common.left') }, { value: 'none' as QuickCommandBarEdge, label: t('common.close') }] }]} label={t('preferences.quickCommandBarEdge')} onChange={(edge) => updateQuickCommandBar(bar.id, { edge })} /><button type="button" className="icon-button preference-quick-command-collapse" aria-label={t(collapsed ? 'quickCommands.expand' : 'quickCommands.collapse')} title={t(collapsed ? 'quickCommands.expand' : 'quickCommands.collapse')} onClick={() => toggleQuickCommandBarCollapsed(bar.id)}><PixelUtilityIcon kind={collapsed ? 'down' : 'up'} /></button></header>
          {!collapsed && <div className="preference-quick-command-list">{bar.commands.map((item) => {
            const metadata = QUICK_COMMAND_METADATA[item.id]
            const enabledCount = bar.commands.filter((candidate) => candidate.enabled).length
            const label = t(metadata.label)
            return <div className={`preference-quick-command-row reorderable-list-row ${draggedPreferenceItem?.kind === 'quick-command' && draggedPreferenceItem.id === item.id && (draggedPreferenceItem.barId === bar.id) ? 'dragging' : ''}`} data-preference-order-kind="quick-command" data-preference-order-id={item.id} data-quick-command-bar-id={bar.id} data-quick-command-id={item.id} key={item.id} title={t(metadata.description)}><button type="button" className="quick-command-drag-handle reorderable-list-handle" aria-label={`${label} ${t('home.reorderHint')}`} title={t('home.reorderHint')} onPointerDown={(event) => beginPreferencePointerDrag(event, 'quick-command', item.id, bar.id)}><PixelUtilityIcon kind="move" /></button><span className="preference-quick-command-icon">{metadata.iconSource ? <PixelAssetIcon src={metadata.iconSource} /> : <PixelUtilityIcon kind={metadata.icon} />}</span><span className="preference-quick-command-name">{label}</span><PixelCheckbox aria-label={t('preferences.quickCommandEnabledAria', { command: label })} checked={item.enabled} disabled={item.enabled && enabledCount === 1} onChange={() => updateQuickCommandBar(bar.id, { commands: bar.commands.map((candidate) => candidate.id === item.id ? { ...candidate, enabled: !candidate.enabled } : candidate) })} /></div>
          })}</div>}
        </section>
        })}</div>
      </PreferenceGroup>}
      {section === 'appearance' && <>
        <PreferenceGroup title={t('preferences.groups.canvas')}>
          <FormField className="preference-field" label={t('preferences.checkerSize')}><NumberInput aria-label={t('preferences.checkerSize')} min={1} max={256} suffix="px" value={preferences.checkerboard.size} onValueChange={(size) => update('checkerboard', { ...preferences.checkerboard, size: Math.round(size) })} /></FormField>
          <FormField className="preference-field" label={t('preferences.luminanceScope')}><ThemedSelect value={preferences.relativeLuminanceScope} groups={[{ label: t('preferences.luminanceScopeGroup'), options: [{ value: 'canvas', label: t('preferences.luminanceScope.canvas') }, { value: 'app', label: t('preferences.luminanceScope.app') }] }]} label={t('preferences.luminanceScope')} onChange={(value) => update('relativeLuminanceScope', value as RelativeLuminanceScope)} /></FormField>
          <div className="preference-checker-colors"><SettingsSectionHeader className="preference-checker-color-heading" title={t('preferences.checkerColors')} actions={<button type="button" className="quiet-button" onClick={() => clearVisualOverrides(['checkerLight', 'checkerDark'])}><PixelUtilityIcon kind="restore" />{t('preferences.theme.restore')}</button>} /><div className="preference-color-value-list"><ColorValueControl color={preferences.checkerboard.lightColor} density="regular" onChange={(lightColor) => setVisualOverride('checkerLight', { ...lightColor, a: 255 })} label={t('preferences.checkerColors')} roleLabel={t('preferences.lightColor')} fillWithColor /><ColorValueControl color={preferences.checkerboard.darkColor} density="regular" onChange={(darkColor) => setVisualOverride('checkerDark', { ...darkColor, a: 255 })} label={t('preferences.checkerColors')} roleLabel={t('preferences.darkColor')} fillWithColor /></div></div>
          <div className="preference-visual-color-grid"><div className="preference-checker-colors preference-grid-colors"><SettingsSectionHeader className="preference-checker-color-heading" title={t('preferences.pixelGridColor')} actions={<button type="button" className="quiet-button" onClick={() => clearVisualOverrides(['pixelGrid'])}><PixelUtilityIcon kind="restore" />{t('preferences.theme.restore')}</button>} /><div className="preference-grid-color-list"><ColorValueControl color={preferences.pixelGridColor} density="regular" onChange={(color) => setVisualOverride('pixelGrid', color)} label={t('preferences.pixelGridColor')} roleLabel={t('preferences.pixelGridColor')} fillWithColor inPalette={false} /></div></div><div className="preference-checker-colors preference-grid-colors"><SettingsSectionHeader className="preference-checker-color-heading" title={t('preferences.gridColor')} actions={<button type="button" className="quiet-button" onClick={() => clearVisualOverrides(['customGrid'])}><PixelUtilityIcon kind="restore" />{t('preferences.theme.restore')}</button>} /><div className="preference-grid-color-list"><ColorValueControl color={preferences.gridColor} density="regular" onChange={(color) => setVisualOverride('customGrid', color)} label={t('preferences.gridColor')} roleLabel={t('preferences.gridColor')} fillWithColor inPalette={false} /></div></div><div className="preference-checker-colors preference-grid-colors"><SettingsSectionHeader className="preference-checker-color-heading" title={t('preferences.sliceColor')} /><div className="preference-grid-color-list"><ColorValueControl color={preferences.sliceColor} density="regular" onChange={(sliceColor) => update('sliceColor', sliceColor)} label={t('preferences.sliceColor')} roleLabel={t('preferences.sliceColor')} fillWithColor inPalette={false} /></div></div><div className="preference-checker-colors preference-grid-colors"><SettingsSectionHeader className="preference-checker-color-heading" title={t('preferences.textBoxColor')} /><div className="preference-grid-color-list"><ColorValueControl color={preferences.textBoxColor} density="regular" onChange={(textBoxColor) => update('textBoxColor', textBoxColor)} label={t('preferences.textBoxColor')} roleLabel={t('preferences.textBoxColor')} fillWithColor inPalette={false} /></div></div><div className="preference-checker-colors preference-grid-colors"><SettingsSectionHeader className="preference-checker-color-heading" title={t('preferences.canvasResizeColor')} /><div className="preference-grid-color-list"><ColorValueControl color={preferences.canvasResizeColor} density="regular" onChange={(canvasResizeColor) => update('canvasResizeColor', canvasResizeColor)} label={t('preferences.canvasResizeColor')} roleLabel={t('preferences.canvasResizeColor')} fillWithColor inPalette={false} /></div></div></div>
          <FormField className="preference-field preference-free-tile-outline-field" label={t('preferences.freeTileInstanceOutlineColor')}><ColorValueControl color={preferences.freeTileInstanceOutlineColor} density="regular" onChange={(freeTileInstanceOutlineColor) => update('freeTileInstanceOutlineColor', freeTileInstanceOutlineColor)} label={t('preferences.freeTileInstanceOutlineColor')} roleLabel={t('preferences.freeTileInstanceOutlineColor')} fillWithColor inPalette={false} /></FormField>
        </PreferenceGroup>
      </>}
      {section === 'theme' && <ThemePreferencesSection preferences={preferences} onChange={setPreferences} />}
      {section === 'input' && <>
        <PreferenceGroup title={t('preferences.groups.cursor')}>
          {toggle(t('preferences.localCursor'), !preferences.useLocalCursors, (value) => update('useLocalCursors', !value), t('preferences.localCursorHint'))}
          <FormField className="preference-field" label={t('preferences.cursorScale')}><ThemedSelect value={String(preferences.cursorScale)} groups={[{ label: t('preferences.cursorScaleGroup'), options: [{ value: '1', label: '100%' }, { value: '1.25', label: '125%' }, { value: '1.5', label: '150%' }, { value: '2', label: '200%' }] }]} label={t('preferences.cursorScale')} disabled={preferences.useLocalCursors} onChange={(value) => update('cursorScale', Number(value) as CursorScale)} /></FormField>
        </PreferenceGroup>
        <PreferenceGroup title={t('preferences.groups.zoom')}>
          {toggle(t('preferences.wheelZoom'), preferences.wheelZoomEnabled, (value) => update('wheelZoomEnabled', value))}
          <FormField className="preference-field" label={t('preferences.wheelZoomMode')}><ThemedSelect value={preferences.wheelZoomMode} groups={[{ label: t('preferences.wheelZoomModeGroup'), options: [{ value: 'smooth', label: t('preferences.wheelZoomMode.smooth') }, { value: 'stepped', label: t('preferences.wheelZoomMode.stepped') }] }]} label={t('preferences.wheelZoomMode')} disabled={!preferences.wheelZoomEnabled} onChange={(value) => update('wheelZoomMode', value as WheelZoomMode)} /></FormField>
          <FormField className="preference-field" label={t('preferences.zoomMode')}><ThemedSelect value={preferences.zoomToolDragMode} groups={[{ label: t('preferences.zoomModeGroup'), options: [{ value: 'smooth', label: t('preferences.zoomMode.smooth') }, { value: 'stepped', label: t('preferences.zoomMode.stepped') }] }]} label={t('preferences.zoomMode')} onChange={(value) => update('zoomToolDragMode', value as ZoomToolDragMode)} /></FormField>
          <FormField className="preference-field" label={t('preferences.viewDragSensitivity')}><ThemedSelect value={String(preferences.viewDragSensitivity)} groups={[{ label: t('preferences.viewDragSensitivityGroup'), options: VIEW_DRAG_SENSITIVITY_VALUES.map((value) => ({ value: String(value), label: `${value}x` })) }]} label={t('preferences.viewDragSensitivity')} onChange={(value) => update('viewDragSensitivity', Number(value) as ViewDragSensitivity)} /></FormField>
          <FormField className="preference-field" label={t('preferences.position')}><ThemedSelect value={preferences.rotationIndicatorPosition} groups={[{ label: t('preferences.positionGroup'), options: [{ value: 'view', label: t('preferences.position.view') }, { value: 'canvas', label: t('preferences.position.canvas') }, { value: 'pointer-left', label: t('preferences.position.pointerLeft') }] }]} label={t('preferences.position')} onChange={(value) => update('rotationIndicatorPosition', value as RotationIndicatorPosition)} /></FormField>
        </PreferenceGroup>
      </>}
      {section === 'tablet' && <PreferenceGroup title={t('preferences.groups.tablet')}>
          <FormField className="preference-field" label={t('preferences.tablet.api')} tooltip={t('preferences.tablet.apiHint')}><ThemedSelect value={preferences.tablet.api} groups={[{ label: t('preferences.tablet.apiGroup'), options: [{ value: 'auto', label: t('preferences.tablet.api.auto') }, { value: 'windows-ink', label: t('preferences.tablet.api.windowsInk') }, { value: 'disabled', label: t('preferences.tablet.api.disabled') }] }]} label={t('preferences.tablet.api')} onChange={(value) => update('tablet', { ...preferences.tablet, api: value as TabletApi })} /></FormField>
          <FormField className="preference-field" label={t('preferences.tablet.touchMode')}><ThemedSelect value={preferences.tablet.touchMode} groups={[{ label: t('preferences.tablet.touchModeGroup'), options: [{ value: 'navigate', label: t('preferences.tablet.touchMode.navigate') }, { value: 'draw', label: t('preferences.tablet.touchMode.draw') }, { value: 'disabled', label: t('preferences.tablet.touchMode.disabled') }] }]} label={t('preferences.tablet.touchMode')} onChange={(value) => update('tablet', { ...preferences.tablet, touchMode: value as TabletTouchMode })} /></FormField>
          {toggle(t('preferences.tablet.pressure'), preferences.tablet.pressureEnabled, (value) => update('tablet', { ...preferences.tablet, pressureEnabled: value }), t('preferences.tablet.pressureHint'))}
          {toggle(t('preferences.tablet.eraserTip'), preferences.tablet.eraserTipEnabled, (value) => update('tablet', { ...preferences.tablet, eraserTipEnabled: value }))}
          <FormField className="preference-field" label={t('preferences.tablet.barrelButton')}><ThemedSelect value={preferences.tablet.barrelButtonAction} groups={[{ label: t('preferences.tablet.barrelButtonGroup'), options: [{ value: 'eraser', label: t('preferences.tablet.barrelButton.eraser') }, { value: 'eyedropper', label: t('preferences.tablet.barrelButton.eyedropper') }, { value: 'hand', label: t('preferences.tablet.barrelButton.hand') }, { value: 'disabled', label: t('preferences.tablet.barrelButton.disabled') }] }]} label={t('preferences.tablet.barrelButton')} onChange={(value) => update('tablet', { ...preferences.tablet, barrelButtonAction: value as TabletBarrelButtonAction })} /></FormField>
          {toggle(t('preferences.tablet.twoFingerZoom'), preferences.tablet.twoFingerZoomEnabled, (value) => update('tablet', { ...preferences.tablet, twoFingerZoomEnabled: value }))}
          {toggle(t('preferences.tablet.twoFingerRotate'), preferences.tablet.twoFingerRotateEnabled, (value) => update('tablet', { ...preferences.tablet, twoFingerRotateEnabled: value }))}
          {toggle(t('preferences.tablet.tilt'), preferences.tablet.tiltEnabled, (value) => update('tablet', { ...preferences.tablet, tiltEnabled: value }))}
          {toggle(t('preferences.tablet.twist'), preferences.tablet.twistEnabled, (value) => update('tablet', { ...preferences.tablet, twistEnabled: value }))}
        </PreferenceGroup>}
      {section === 'tools' && <>
        <PreferenceGroup title={t('preferences.groups.previews')}>
          <FormField className="preference-field" label={t('preferences.brushPreview')}><ThemedSelect value={preferences.brushPreviewMode} groups={[{ label: t('preferences.brushPreviewGroup'), options: [{ value: 'none', label: t('preferences.brushPreview.none') }, { value: 'edge', label: t('preferences.brushPreview.edge') }, { value: 'full', label: t('preferences.brushPreview.full') }, { value: 'full-edge', label: t('preferences.brushPreview.fullEdge') }] }]} label={t('preferences.brushPreview')} onChange={(value) => update('brushPreviewMode', value as BrushPreviewMode)} /></FormField>
          {preferences.brushPreviewMode === 'full-edge' && toggle(t('preferences.drawingBrushPreview'), preferences.drawingBrushPreviewEnabled, (value) => update('drawingBrushPreviewEnabled', value))}
          {toggle(t('preferences.selectionCrosshair'), preferences.selectionCrosshair, (value) => update('selectionCrosshair', value))}
          <FormField className="preference-field" label={t('preferences.selectionPreviewColor')}><ThemedSelect value={preferences.selectionPreviewColorMode} groups={[{ label: t('preferences.selectionPreviewColorGroup'), options: [{ value: 'auto', label: t('preferences.selectionPreviewColor.auto') }, { value: 'custom', label: t('preferences.selectionPreviewColor.custom') }] }]} label={t('preferences.selectionPreviewColor')} onChange={(value) => update('selectionPreviewColorMode', value as SelectionPreviewColorMode)} /></FormField>
          {preferences.selectionPreviewColorMode === 'custom' && <FormField className="preference-field" label={t('preferences.selectionPreviewCustomColor')}><ColorValueControl color={preferences.selectionPreviewColor} density="regular" onChange={(selectionPreviewColor) => update('selectionPreviewColor', selectionPreviewColor)} label={t('preferences.selectionPreviewCustomColor')} roleLabel={t('preferences.selectionPreviewCustomColor')} fillWithColor inPalette={false} /></FormField>}
          {toggle(t('preferences.selectionSizeVisible'), preferences.selectionSizeVisible, (value) => update('selectionSizeVisible', value))}
          {toggle(t('preferences.moveLayerContentPreview'), preferences.moveLayerContentPreviewEnabled, (value) => update('moveLayerContentPreviewEnabled', value), t('preferences.moveLayerContentPreviewHint'))}
          {toggle(t('preferences.moveLayerClickFlash'), preferences.moveLayerClickFlashEnabled, (value) => update('moveLayerClickFlashEnabled', value), t('preferences.moveLayerClickFlashHint'))}
          <FormField className="preference-field" label={t('preferences.moveLayerClickFlashDuration')} tooltip={t('preferences.moveLayerClickFlashDurationHint')}><ThemedSelect value={String(preferences.moveLayerClickFlashDuration)} groups={[{ label: t('preferences.moveLayerClickFlashDurationGroup'), options: MOVE_LAYER_CLICK_FLASH_DURATIONS.map((duration) => ({ value: String(duration), label: t(duration === 80 ? 'preferences.moveLayerClickFlashDuration.fast' : duration === 180 ? 'preferences.moveLayerClickFlashDuration.long' : 'preferences.moveLayerClickFlashDuration.standard') })) }]} label={t('preferences.moveLayerClickFlashDuration')} disabled={!preferences.moveLayerClickFlashEnabled} onChange={(value) => update('moveLayerClickFlashDuration', Number(value) as MoveLayerClickFlashDuration)} /></FormField>
        </PreferenceGroup>
        <PreferenceGroup title={t('preferences.groups.alignment')}>
          {toggle(t('preferences.gridAlignment'), preferences.gridAlignmentEnabled, (value) => update('gridAlignmentEnabled', value), t('preferences.gridAlignmentHint'))}
          {toggle(t('preferences.smartAlignment'), preferences.smartAlignmentEnabled, (value) => update('smartAlignmentEnabled', value), t('preferences.smartAlignmentHint'))}
          {toggle(t('preferences.alignmentGuides'), preferences.alignmentGuidesVisible, (value) => update('alignmentGuidesVisible', value), t('preferences.alignmentGuidesHint'))}
          <FormField className="preference-field" label={t('preferences.alignmentThreshold')} tooltip={t('preferences.alignmentThresholdHint')}><NumberInput aria-label={t('preferences.alignmentThreshold')} min={1} max={32} suffix="px" value={preferences.alignmentThreshold} disabled={!preferences.gridAlignmentEnabled && !preferences.smartAlignmentEnabled} onValueChange={(value) => update('alignmentThreshold', parseAlignmentThreshold(String(value)))} /></FormField>
        </PreferenceGroup>
        <PreferenceGroup title={t('preferences.groups.drawing')}>
          {toggle(t('preferences.gradientLineVisible'), preferences.gradientLineVisible, (value) => update('gradientLineVisible', value))}
          <FormField className="preference-field" label={t('preferences.gradientLineColor')}><ColorValueControl color={preferences.gradientLineColor} density="regular" onChange={(gradientLineColor) => update('gradientLineColor', gradientLineColor)} label={t('preferences.gradientLineColor')} roleLabel={t('preferences.gradientLineColor')} fillWithColor inPalette={false} disabled={!preferences.gradientLineVisible} /></FormField>
          {toggle(t('preferences.shiftLinePreview'), preferences.shiftLinePreviewEnabled, (value) => update('shiftLinePreviewEnabled', value))}
          {toggle(t('preferences.balancedLine'), preferences.balancedShiftLineEnabled, (value) => update('balancedShiftLineEnabled', value), t('preferences.balancedLineHint'))}
          {toggle(t('preferences.optimizedRotation'), preferences.optimizedRotationEnabled, (value) => update('optimizedRotationEnabled', value), t('preferences.optimizedRotationHint'))}
          <FormField className="preference-field" label={t('preferences.lineDirectionStep')} tooltip={t('preferences.lineDirectionStepHint')}><NumberInput aria-label={t('preferences.lineDirectionStep')} min={1} max={16} value={preferences.lineDirectionStep} onValueChange={(value) => update('lineDirectionStep', Math.round(value))} /></FormField>
          {toggle(t('preferences.lassoClosed'), preferences.lassoPreviewClosed, (value) => update('lassoPreviewClosed', value))}
          {toggle(t('preferences.eyedropperPencil'), preferences.eyedropperSwitchToPencil, (value) => update('eyedropperSwitchToPencil', value))}
        </PreferenceGroup>
        <PreferenceGroup title={t('preferences.groups.eyedropper')}>
          {toggle(t('preferences.eyedropperQuickSelect'), preferences.eyedropperQuickSelect, (value) => update('eyedropperQuickSelect', value), t('preferences.eyedropperQuickSelectHint'))}
          {toggle(t('preferences.eyedropperMagnifier'), preferences.eyedropperMagnifierEnabled, (value) => update('eyedropperMagnifierEnabled', value), t('preferences.eyedropperMagnifierHint'))}
          {preferences.eyedropperMagnifierEnabled && <FormField className="preference-field" label={t('preferences.eyedropperMagnifierSize')}><ThemedSelect value={String(preferences.eyedropperMagnifierSize)} groups={[{ label: t('preferences.eyedropperMagnifierSizeGroup'), options: EYEDROPPER_MAGNIFIER_SIZE_VALUES.map((value) => ({ value: String(value), label: t(value === 0.5 ? 'preferences.eyedropperMagnifierSize.minimum' : value === 0.75 ? 'preferences.eyedropperMagnifierSize.small' : value === 1.25 ? 'preferences.eyedropperMagnifierSize.large' : 'preferences.eyedropperMagnifierSize.medium') })) }]} label={t('preferences.eyedropperMagnifierSize')} onChange={(value) => update('eyedropperMagnifierSize', Number(value) as EyedropperMagnifierSize)} /></FormField>}
          <FormField className="preference-field" label={t('preferences.eyedropperMagnifierStyle')} tooltip={t('preferences.eyedropperMagnifierStyleHint')}><ThemedSelect value={preferences.eyedropperMagnifierStyle} groups={[{ label: t('preferences.eyedropperMagnifierStyleGroup'), options: [{ value: 'pixel', label: t('preferences.eyedropperMagnifierStyle.pixel') }, { value: 'line', label: t('preferences.eyedropperMagnifierStyle.line') }] }]} label={t('preferences.eyedropperMagnifierStyle')} onChange={(value) => update('eyedropperMagnifierStyle', value as EyedropperMagnifierStyle)} /></FormField>
          {toggle(t('preferences.eyedropperMagnifierDistortion'), preferences.eyedropperMagnifierDistortionEnabled, (value) => update('eyedropperMagnifierDistortionEnabled', value), t('preferences.eyedropperMagnifierDistortionHint'))}
        </PreferenceGroup>
      </>}
      {section === 'files' && <>
        <PreferenceGroup title={t('preferences.groups.locations')}>
        <FormField className="preference-field preference-path-field" label={t('preferences.saveDirectory')} hint={preferences.saveDirectory ? t('preferences.directory.custom') : t('preferences.directory.default')}><div className="preference-path-control"><TextInput readOnly value={preferences.saveDirectory || defaultDirectories.saveDirectory} title={preferences.saveDirectory || defaultDirectories.saveDirectory} /><button type="button" className="icon-button" title={t('preferences.chooseDirectory')} aria-label={t('preferences.chooseSaveDirectory')} onClick={() => void choosePreferenceDirectory('saveDirectory')}><PixelUtilityIcon kind="folderOpen" /></button><button type="button" className="icon-button" title={t('preferences.restoreDefaultDirectory')} aria-label={t('preferences.restoreDefaultSaveDirectory')} disabled={!preferences.saveDirectory} onClick={() => update('saveDirectory', '')}><PixelUtilityIcon kind="restore" /></button></div></FormField>
        <FormField className="preference-field preference-path-field" label={t('preferences.exportDirectory')} hint={preferences.exportDirectory ? t('preferences.directory.custom') : t('preferences.directory.default')}><div className="preference-path-control"><TextInput readOnly value={preferences.exportDirectory || defaultDirectories.exportDirectory} title={preferences.exportDirectory || defaultDirectories.exportDirectory} /><button type="button" className="icon-button" title={t('preferences.chooseDirectory')} aria-label={t('preferences.chooseExportDirectory')} onClick={() => void choosePreferenceDirectory('exportDirectory')}><PixelUtilityIcon kind="folderOpen" /></button><button type="button" className="icon-button" title={t('preferences.restoreDefaultDirectory')} aria-label={t('preferences.restoreDefaultExportDirectory')} disabled={!preferences.exportDirectory} onClick={() => update('exportDirectory', '')}><PixelUtilityIcon kind="restore" /></button></div></FormField>
        </PreferenceGroup>
        <PreferenceGroup title={t('preferences.groups.formats')}>
        <FormField className="preference-field" label={t('preferences.saveFormat')}><ThemedSelect value={preferences.saveFormat} groups={[{ label: t('preferences.saveFormatGroup'), options: [{ value: 'moonsprite', label: '.moonsprite' }, { value: 'png', label: '.png' }, { value: 'jpeg', label: '.jpg / .jpeg' }, { value: 'webp', label: '.webp' }, { value: 'psd', label: '.psd' }, { value: 'ase', label: '.ase' }, { value: 'aseprite', label: '.aseprite' }] }]} label={t('preferences.saveFormat')} onChange={(value) => update('saveFormat', value)} /></FormField>
        <FormField className="preference-field" label={t('preferences.exportFormat')}><ThemedSelect value={preferences.exportFormat} groups={[{ label: t('preferences.exportFormatGroup'), options: [{ value: 'png', label: 'PNG' }, { value: 'jpeg', label: 'JPEG' }, { value: 'webp', label: 'WebP' }, { value: 'svg', label: 'SVG' }, { value: 'gif', label: 'GIF' }, { value: 'psd', label: 'PSD' }] }]} label={t('preferences.exportFormat')} onChange={(value) => update('exportFormat', value)} /></FormField>
        </PreferenceGroup>
        <PreferenceGroup title={t('preferences.groups.recovery')}>
        <FormField className="preference-field" label={t('preferences.recovery')}><ThemedSelect value={recoveryValue} groups={[{ label: t('preferences.recoveryGroup'), options: [{ value: 'off', label: t('preferences.recovery.off') }, { value: '0.5', label: t('preferences.recovery.seconds30') }, { value: '1', label: t('preferences.recovery.minutes1') }, { value: '2', label: t('preferences.recovery.minutes2') }, { value: '5', label: t('preferences.recovery.minutes5') }, { value: '10', label: t('preferences.recovery.minutes10') }] }]} label={t('preferences.recovery')} onChange={(value) => setPreferences((current) => value === 'off' ? { ...current, recovery: false } : { ...current, recovery: true, recoveryMinutes: Number(value) })} /></FormField>
        <FormField className="preference-field" label={t('preferences.recoveryRetentionDays')} hint={t('preferences.recoveryRetentionDaysHint')}><NumberInput min={1} max={365} suffix={t('preferences.daysSuffix')} value={preferences.recoveryRetentionDays} onValueChange={(value) => update('recoveryRetentionDays', Math.round(value))} /></FormField>
        </PreferenceGroup>
      </>}
      {section === 'colorLayers' && <div className="preference-presets preference-color-layer-settings"><section className="preference-color-settings"><SettingsSectionHeader title={t('preferences.colorModes')} actions={<button type="button" className="quiet-button" onClick={() => update('colorEditorModes', DEFAULT_COLOR_EDITOR_MODES.map((item) => ({ ...item })))}><PixelUtilityIcon kind="restore" />{t('preferences.restoreDefaults')}</button>} /><div className="preference-color-mode-list">{preferences.colorEditorModes.map((item, index) => {
        const enabledCount = preferences.colorEditorModes.filter((candidate) => candidate.enabled).length
        const modeName = colorValueModeLabel(item.mode)
        return <div className={`preference-color-mode-row reorderable-list-row ${draggedPreferenceItem?.kind === 'color-mode' && draggedPreferenceItem.id === item.mode ? 'dragging' : ''}`} data-preference-order-kind="color-mode" data-preference-order-id={item.mode} data-color-mode={item.mode} key={item.mode}><button type="button" className="color-mode-drag-handle reorderable-list-handle" aria-label={`${modeName} ${t('home.reorderHint')}`} title={t('home.reorderHint')} onPointerDown={(event) => beginPreferencePointerDrag(event, 'color-mode', item.mode)}><PixelUtilityIcon kind="move" /></button><span className="color-mode-name">{modeName}</span><PixelCheckbox className="color-mode-visibility" aria-label={item.enabled ? `${item.mode} enabled` : `${item.mode} disabled`} checked={item.enabled} disabled={item.enabled && enabledCount === 1} onChange={() => update('colorEditorModes', preferences.colorEditorModes.map((candidate) => candidate.mode === item.mode ? { ...candidate, enabled: !candidate.enabled } : candidate))} /></div>
      })}</div></section></div>}
      {section === 'presets' && <div className="preference-presets"><section><SettingsSectionHeader title={t('preferences.newDocumentPresets')} actions={<button type="button" onClick={() => update('documentSizePresets', [...preferences.documentSizePresets, { width: 64, height: 64 }])}><PixelUtilityIcon kind="plus" />{t('preferences.addSize')}</button>} /><div className="preference-preset-grid">{preferences.documentSizePresets.map((preset, index) => <div className="document-size-preset-row" key={index}><NumberInput density="compact" aria-label={t('preferences.presetWidthAria', { index: index + 1 })} min={1} max={16384} suffix="px" value={preset.width} onValueChange={(value) => updateDocumentSize(index, 'width', value)} /><span>x</span><NumberInput density="compact" aria-label={t('preferences.presetHeightAria', { index: index + 1 })} min={1} max={16384} suffix="px" value={preset.height} onValueChange={(value) => updateDocumentSize(index, 'height', value)} /><DeleteIconButton aria-label={t('preferences.deleteSizeAria', { width: preset.width, height: preset.height })} disabled={preferences.documentSizePresets.length === 1} onClick={() => update('documentSizePresets', preferences.documentSizePresets.filter((_, presetIndex) => presetIndex !== index))} /></div>)}</div></section><section><SettingsSectionHeader title={t('preferences.exportScalePresets')} actions={<button type="button" onClick={() => update('exportScalePresets', [...preferences.exportScalePresets, 100])}><PixelUtilityIcon kind="plus" />{t('preferences.addScale')}</button>} /><div className="preference-preset-grid export-scale-preset-grid">{preferences.exportScalePresets.map((scale, index) => <div className="export-scale-preset-row" key={index}><NumberInput density="compact" aria-label={t('preferences.exportScaleAria', { index: index + 1 })} min={1} max={6400} suffix="%" value={scale} onValueChange={(value) => update('exportScalePresets', preferences.exportScalePresets.map((currentScale, scaleIndex) => scaleIndex === index ? value : currentScale))} /><DeleteIconButton aria-label={t('preferences.deleteScaleAria', { scale })} disabled={preferences.exportScalePresets.length === 1} onClick={() => update('exportScalePresets', preferences.exportScalePresets.filter((_, scaleIndex) => scaleIndex !== index))} /></div>)}</div></section><section className="preference-layer-settings preference-checker-colors"><SettingsSectionHeader title={t('preferences.layerColors')} actions={<><button type="button" className="quiet-button" aria-label={t('preferences.restoreDefaults')} onClick={() => update('layerDisplayColorPresets', DEFAULT_LAYER_DISPLAY_COLOR_PRESETS.map((color) => ({ ...color })))}><PixelUtilityIcon kind="restore" /><span>{t('preferences.restoreDefaults')}</span></button><button type="button" className="quiet-button" disabled={preferences.layerDisplayColorPresets.length >= 12} onClick={() => update('layerDisplayColorPresets', [...preferences.layerDisplayColorPresets, { r: 117, g: 117, b: 117, a: 255 }])}><PixelUtilityIcon kind="plus" /><span>{t('preferences.addColor')}</span></button></>} /><div className="preference-layer-color-grid">{preferences.layerDisplayColorPresets.map((color, index) => <div className="preference-layer-color-row" key={index}><ColorValueControl color={color} density="regular" onChange={(value) => updateLayerColorPreset(index, value)} label={t('preferences.layerColorAria', { index: index + 1 })} storageKey="layer-preset" fillWithColor /><DeleteIconButton size="regular" aria-label={t('preferences.deleteLayerColorAria', { index: index + 1 })} disabled={preferences.layerDisplayColorPresets.length === 1} onClick={() => update('layerDisplayColorPresets', preferences.layerDisplayColorPresets.filter((_, presetIndex) => presetIndex !== index))} /></div>)}</div></section></div>}
      {section === 'extensions' && <PreferenceGroup title={t('preferences.groups.extensions')} actions={<><button type="button" onClick={() => void chooseExtension()} disabled={extensionsLoading || extensionBusyId !== null}><PixelUtilityIcon kind="import" />{t('preferences.extensions.add')}</button><button type="button" onClick={() => void openExtensionFolder()}><PixelUtilityIcon kind="folderOpen" />{t('preferences.extensions.openFolder')}</button></>}>
        {extensionsLoading && extensions.length === 0 ? <p className="preference-search-empty">{t('preferences.extensions.loading')}</p> : extensions.length === 0 ? <p className="preference-search-empty">{t('preferences.extensions.empty')}</p> : <div className="preference-extension-list">{extensions.map((extension) => <article className={`preference-extension-row${extension.enabled ? '' : ' disabled'}`} key={extension.id}>
          <div className="preference-extension-info">
            <header className="preference-extension-heading">
              <div className="preference-extension-identity"><div className="preference-extension-title"><strong>{extension.name}</strong><span>{t('preferences.extensions.versionShort', { version: extension.version })}</span></div>{extension.author && <span className="preference-extension-author">{extension.author}</span>}</div>
              <span className="preference-extension-state">{extension.enabled ? t('preferences.extensions.enabled') : t('preferences.extensions.disabled')}</span>
            </header>
            {extension.description && <p className="preference-extension-description">{extension.description}</p>}
            <div className="preference-extension-stats">
              <span title={extension.commands.map((command) => command.name).join(', ')}>{t('preferences.extensions.commandsShort', { count: extension.commands.length })}</span>
              <span title={extension.panels.map((panel) => panel.name).join(', ')}>{t('preferences.extensions.panelsShort', { count: extension.panels.length })}</span>
              <span title={[...extension.menuItems.map((item) => item.menu), ...extension.topMenus.map((menu) => menu.name)].join(', ')}>{t('preferences.extensions.menusShort', { count: extension.menuItems.length + extension.topMenus.length })}</span>
            </div>
            <dl className="preference-extension-details">
              <div><dt>{t('preferences.extensions.idLabel')}</dt><dd title={extension.id}>{extension.id}</dd></div>
              {extension.entry && <div><dt>{t('preferences.extensions.entryLabel')}</dt><dd title={extension.entry}>{extension.entry}</dd></div>}
              <div className="preference-extension-location"><dt>{t('preferences.extensions.pathLabel')}</dt><dd title={extension.filePath}>{extension.filePath}</dd></div>
            </dl>
          </div>
          <div className="preference-extension-actions"><PreferenceToggle className="preference-extension-toggle" label={t('preferences.extensions.enable')} checked={extension.enabled} disabled={extensionBusyId !== null} onChange={() => void toggleExtension(extension)} /><button type="button" className="danger-button" disabled={extensionBusyId !== null} onClick={() => void uninstallExtension(extension)}><PixelUtilityIcon kind="delete" />{t('preferences.extensions.uninstall')}</button></div>
        </article>)}</div>}
      </PreferenceGroup>}
      {section === 'reset' && <><p>{t('preferences.resetDescription')}</p><button className="danger-button" onClick={() => void resetAllSettings()}>{t('preferences.resetAll')}</button></>}
      </>}
    </main></PreferenceSearchContext.Provider></div>
    <footer><button className="quiet-button" onClick={onClose}>{t('preferences.cancel')}</button><button className="quiet-button" onClick={persist}>{t('preferences.apply')}</button><button className="primary-button" onClick={() => { persist(); onClose() }}>{t('preferences.confirm')}</button></footer>
  </ModalShell></div>
}
