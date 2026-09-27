import { RecentColors } from './RecentColors'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ColorPicker, type ColorPickerConfig, type ColorPickerScheme } from '@/components/ColorPicker'
import { FloatingDockPreview, PanelResizeHandles, useFloatingPanel } from '@/components/floating-panel'
import type { DockDragProps } from '@/components/workspace-panel-types'
import { parseColorPickerConfig, readStoredString, saveColorPickerConfig } from '@/core/panel-preferences'
import { visiblePaletteColors } from '@/core/palette-layout'
import { useWorkspace, type DocumentSession } from '@/store/workspace'
import { useI18n } from '@/components/I18nProvider'
import { PixelUtilityIcon } from '@/components/PixelUtilityIcon'
import { paletteSamplingShortcutActive } from '@/core/palette-sampling-shortcut'
import { loadShortcuts } from '@/core/shortcuts'
import { publishCanvasColorSample, publishCanvasColorSamplingCompleted } from '@/components/color-sampling-events'
import { usePanelColorSampling } from '@/components/usePanelColorSampling'
import { activeTilemapCelTarget } from '@/core/tilemap-document'
import { TilesetTileThumbnail } from '@/components/TilesetTileThumbnail'

export function ColorPanel({ session, docked = false, onDockDragStart, onPanelContextMenu, onFloatingDock, onRestoreSquare }: { session: DocumentSession } & DockDragProps) {
  const { t } = useI18n()
  const setPrimary = useWorkspace((state) => state.setPrimaryColor)
  const setSecondary = useWorkspace((state) => state.setSecondaryColor)
  const addPaletteColor = useWorkspace((state) => state.addPaletteColor)
  const panelColorSampling = usePanelColorSampling(session.tool)
  const floating = useFloatingPanel(null, false, true, 'moonsprite.color-panel.v1', true, onFloatingDock, docked)
  const schemeButtonRef = useRef<HTMLButtonElement>(null)
  const schemeMenuRef = useRef<HTMLSpanElement>(null)
  const [schemeMenuOpen, setSchemeMenuOpen] = useState(false)
  const [shortcuts, setShortcuts] = useState(loadShortcuts)
  const [schemeMenuPosition, setSchemeMenuPosition] = useState({ left: 8, top: 8 })
  const hueStepPresets = [
    { value: 0, label: t('color.continuous') },
    { value: 6, label: t('color.segments', { count: 6 }) },
    { value: 12, label: t('color.segments', { count: 12 }) },
    { value: 24, label: t('color.segments', { count: 24 }) },
    { value: 36, label: t('color.segments', { count: 36 }) }
  ]
  const colorStepPresets = [
    { value: 0, label: t('color.continuous') },
    { value: 5, label: t('color.levels', { count: 5 }) },
    { value: 9, label: t('color.levels', { count: 9 }) },
    { value: 15, label: t('color.levels', { count: 15 }) }
  ]
  const hueStepValues = hueStepPresets.map((preset) => preset.value)
  const colorStepValues = colorStepPresets.map((preset) => preset.value)
  const [pickerConfig, setPickerConfig] = useState<ColorPickerConfig>(() => {
    return parseColorPickerConfig(readStoredString('moonsprite.color-picker-config'), readStoredString('moonsprite.color-picker-scheme'), hueStepValues, colorStepValues)
  })
  const schemeOptions: Array<{ value: ColorPickerScheme; label: string }> = [
    { value: 'moon-ring', label: t('color.scheme.moonRing') },
    { value: 'sv-square', label: t('color.scheme.svSquare') },
    { value: 'hs-square', label: t('color.scheme.hsSquare') },
    { value: 'wheel', label: t('color.scheme.wheel') },
    { value: 'normal-map', label: t('color.scheme.normalMap') }
  ]
  const paletteColors = visiblePaletteColors(session.document.palette, session.document.paletteOrder)
  const tilemapTarget = activeTilemapCelTarget(session.document)
  const selectedTileset = session.tilemapMode === 'paint' && tilemapTarget
    ? session.document.tilesets?.find((tileset) => tileset.id === session.selectedTilesetId
      && tileset.tileWidth === tilemapTarget.tilemap.tileWidth
      && tileset.tileHeight === tilemapTarget.tilemap.tileHeight) ?? null
    : null
  const primaryTileId = selectedTileset?.tileIds.includes(session.selectedTileId ?? '') ? session.selectedTileId : selectedTileset?.tileIds[0] ?? null
  const secondaryTileId = selectedTileset?.tileIds.includes(session.secondaryTileId ?? '') ? session.secondaryTileId : selectedTileset?.tileIds[0] ?? null
  const tileRoleControls = selectedTileset && primaryTileId && secondaryTileId ? <div className="tile-role-controls">
    {([
      { role: 'primary' as const, tileId: primaryTileId, label: t('tileset.foregroundTile') },
      { role: 'secondary' as const, tileId: secondaryTileId, label: t('tileset.backgroundTile') }
    ]).map(({ role, tileId, label }) => {
      const index = selectedTileset.tileIds.indexOf(tileId)
      return <button key={role} type="button" className={`tile-role-value-control ${role}`} title={t('tileset.tileRoleHint')} onClick={() => useWorkspace.getState().setSelectedTile(selectedTileset.id, tileId, role)}>
        <span className="tile-role-thumbnail"><TilesetTileThumbnail tileset={selectedTileset} tileId={tileId} /></span>
        <strong>{label}</strong>
        <small>#{index}</small>
      </button>
    })}
  </div> : undefined

  useLayoutEffect(() => {
    if (!schemeMenuOpen) return
    const button = schemeButtonRef.current?.getBoundingClientRect()
    const menu = schemeMenuRef.current?.getBoundingClientRect()
    const panel = floating.ref.current?.getBoundingClientRect()
    if (!button || !menu || !panel) return
    const leftOfPanel = panel.left - menu.width - 6
    const rightOfPanel = panel.right + 6
    const left = leftOfPanel >= 8
      ? leftOfPanel
      : rightOfPanel + menu.width <= window.innerWidth - 8
        ? rightOfPanel
        : Math.max(8, Math.min(window.innerWidth - menu.width - 8, button.right - menu.width))
    setSchemeMenuPosition({
      left,
      top: Math.max(8, Math.min(window.innerHeight - menu.height - 8, panel.top))
    })
  }, [schemeMenuOpen])

  useEffect(() => {
    if (!schemeMenuOpen) return
    const close = (event: PointerEvent): void => {
      const target = event.target as Node
      if (!schemeButtonRef.current?.contains(target) && !schemeMenuRef.current?.contains(target)) setSchemeMenuOpen(false)
    }
    window.addEventListener('pointerdown', close, true)
    return () => window.removeEventListener('pointerdown', close, true)
  }, [schemeMenuOpen])

  useEffect(() => {
    const refresh = (): void => setShortcuts(loadShortcuts())
    window.addEventListener('moonsprite:shortcuts-changed', refresh)
    return () => window.removeEventListener('moonsprite:shortcuts-changed', refresh)
  }, [])

  const completeColorSampling = (event: React.PointerEvent<HTMLElement>): void => {
    const target = event.target instanceof Element ? event.target : null
    if (!target?.closest('.color-field-interaction, .hue-strip-input, .value-strip-input, .alpha-strip-input')) return
    const active = useWorkspace.getState().sessions.find((candidate) => candidate.document.id === session.document.id)
    if (!active || !panelColorSampling.activeForEvent(event.nativeEvent)) return
    const secondary = event.button === 2
    const sampled = secondary ? active.secondaryColor : active.primaryColor
    publishCanvasColorSample(sampled, secondary)
    if (!secondary && paletteSamplingShortcutActive()) useWorkspace.getState().addPaletteColor(sampled)
    publishCanvasColorSamplingCompleted()
  }

  const updatePickerConfig = (changes: Partial<ColorPickerConfig>): void => {
    setPickerConfig((current) => {
      const next = { ...current, ...changes }
      saveColorPickerConfig(next)
      return next
    })
  }
  const restoreSquare = (): void => {
    const panel = floating.ref.current
    const fieldSlot = panel?.querySelector<HTMLElement>('.color-field-slot')
    if (!panel || !fieldSlot) return
    if (floating.style) {
      const panelBounds = panel.getBoundingClientRect()
      if (onRestoreSquare && panelBounds.top >= window.innerHeight * 0.55 && panelBounds.bottom >= window.innerHeight - 72) {
        onRestoreSquare(true)
        return
      }
      const fieldBounds = fieldSlot.getBoundingClientRect()
      const targetHeight = Math.round(panelBounds.height - fieldBounds.height + fieldBounds.width)
      if (Math.abs(panelBounds.height - targetHeight) <= 1) return
      floating.resizeTo(panelBounds.width, targetHeight)
      return
    }
    onRestoreSquare?.()
  }

  return <><section ref={floating.ref} className={`panel color-panel ${panelColorSampling.active ? 'panel-color-sampling' : ''} ${floating.style ? 'floating-panel' : ''}`} style={floating.style} onPointerDown={floating.bringToFront} onPointerUp={completeColorSampling} onContextMenu={onPanelContextMenu}>
<header aria-label={t('panel.color')} onPointerDown={(event) => floating.style ? floating.startDrag(event) : onDockDragStart?.(event, floating.startDetachedDrag)}><strong>{t('panel.color')}</strong><PanelActions className="color-scheme-control"><button type="button" title={t('color.restoreSquare')} aria-label={t('color.restoreSquare')} onClick={restoreSquare}><PixelUtilityIcon kind="paletteCenter" /></button><button ref={schemeButtonRef} type="button" className={schemeMenuOpen ? 'active' : ''} title={t('color.changeScheme')} aria-label={t('color.changeScheme')} aria-expanded={schemeMenuOpen} onClick={() => setSchemeMenuOpen((open) => !open)}><PixelUtilityIcon kind="moreLines" /></button></PanelActions></header>
    <ColorPicker footer={<RecentColors onPrimary={setPrimary} onSecondary={setSecondary} />} wheelHue color={session.primaryColor} secondaryColor={session.secondaryColor} onChange={setPrimary} onSecondaryChange={setSecondary} paletteColors={paletteColors} onAddPaletteColor={addPaletteColor} addToPaletteShortcut={shortcuts.addForegroundToPalette} roleControls={tileRoleControls} config={pickerConfig} />
    {floating.style && <PanelResizeHandles onResize={floating.startResize} />}
  </section><FloatingDockPreview style={floating.dockPreview} />
  {schemeMenuOpen && createPortal(<span ref={schemeMenuRef} className="color-scheme-popover" role="menu" aria-label={t('color.schemeAria')} style={schemeMenuPosition}>
    <span className="color-scheme-options">{schemeOptions.map((option) => <button key={option.value} type="button" role="menuitemradio" aria-checked={pickerConfig.scheme === option.value} className={pickerConfig.scheme === option.value ? 'selected' : ''} onClick={() => updatePickerConfig({ scheme: option.value })}><i className={`color-scheme-preview preview-${option.value}`} aria-hidden="true" /><span>{option.label}</span>{pickerConfig.scheme === option.value && <PixelUtilityIcon kind="check" />}</button>)}</span>
    {pickerConfig.scheme === 'moon-ring' && <span className="color-scheme-settings"><span className="color-preset-group"><span className="color-preset-label">{t('color.moonCenter')}</span><span className="color-preset-options"><button type="button" className={pickerConfig.moonField !== 'hsl-triangle' ? 'selected' : ''} onClick={() => updatePickerConfig({ moonField: 'hsv-square' })}>{t('color.hsvSquare')}</button><button type="button" className={pickerConfig.moonField === 'hsl-triangle' ? 'selected' : ''} onClick={() => updatePickerConfig({ moonField: 'hsl-triangle' })}>{t('color.hslTriangle')}</button></span></span></span>}
    <span className="color-scheme-settings">
      <span className="color-preset-group"><span className="color-preset-label color-setting-tooltip" data-tip={t('color.hueSnapHint')}>{t('color.hueSnap')}</span><span className="color-preset-options">{hueStepPresets.map((preset) => <button key={preset.value} type="button" className={pickerConfig.hueSteps === preset.value ? 'selected' : ''} aria-pressed={pickerConfig.hueSteps === preset.value} onClick={() => updatePickerConfig({ hueSteps: preset.value })}>{preset.label}</button>)}</span></span>
      <span className="color-preset-group"><span className="color-preset-label color-setting-tooltip" data-tip={t('color.colorLevelsHint')}>{t('color.colorLevels')}</span><span className="color-preset-options">{colorStepPresets.map((preset) => <button key={preset.value} type="button" className={pickerConfig.colorSteps === preset.value ? 'selected' : ''} aria-pressed={pickerConfig.colorSteps === preset.value} onClick={() => updatePickerConfig({ colorSteps: preset.value })}>{preset.label}</button>)}</span></span>
    </span>
  </span>, document.body)}
  </>
}
import { PanelActions } from './PanelActions'
