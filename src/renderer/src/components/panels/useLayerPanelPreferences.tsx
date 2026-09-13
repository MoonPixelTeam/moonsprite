import { type LayerSettingsEditorHandle } from './LayerSettingsEditor'
import { type LayerSettingsState } from './layer-panel-settings'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Tileset } from '@shared/types-tiles'
import { useFloatingPanel } from '@/components/floating-panel'
import { observeToolbarExtent } from '@/components/toolbar-extent'
import { loadEditorPreferences, saveEditorPreferences } from '@/core/file-preferences'
import { formatShortcutBindingsForLocale, loadShortcutBindings, shortcutBindingsFor, type ShortcutId } from '@/core/shortcuts'
import { useWorkspace, type DocumentSession } from '@/store/workspace'
import { useI18n } from '@/components/I18nProvider'
import {
  LAYER_DENSITY_ORDER as layerDensityOrder,
  loadFreeTileInstancePanelLayout,
  loadLayerDensity,
  loadLayerQuickActions,
  loadLayerSideDockAutoHide,
  saveLayerDensity,
  saveLayerQuickActions,
  saveLayerSideDockAutoHide,
  type FreeTileInstancePanelLayout,
  type LayerDisplayDensity
} from '@/core/layer-panel-preferences'
import type { AnimationContextMenu } from './layer-panel-contracts'
const layerLabelWidthKey = 'moonsprite.layers.label-width'
export const layerLabelWidthLimits = { min: 140, max: 2_000 }
const clampLayerLabelWidth = (value: number): number => Math.max(layerLabelWidthLimits.min, Math.min(layerLabelWidthLimits.max, Math.round(value)))
const loadLayerLabelWidth = (): number => clampLayerLabelWidth(Number(localStorage.getItem(layerLabelWidthKey)) || 190)
interface Options {
  session: DocumentSession
  loopSectionLayout: {
    items: import('@/components/panels/layer-timeline-layout').AnimationLoopSectionLayout[]
    laneCount: number
  }
  animationLoopSectionTrackRef: import('react').RefObject<HTMLDivElement | null>
  layerListRef: import('react').RefObject<HTMLDivElement | null>
  layerAnimationToolbarRef: import('react').RefObject<HTMLDivElement | null>
  floating: ReturnType<typeof useFloatingPanel>
  docked: boolean
  timeline: import('@shared/types-animation').AnimationTimeline
  setAnimationMenu: import('react').Dispatch<import('react').SetStateAction<AnimationContextMenu | null>>
}

export function useLayerPanelPreferences({
  session,
  loopSectionLayout,
  animationLoopSectionTrackRef,
  layerListRef,
  layerAnimationToolbarRef,
  floating,
  docked,
  timeline,
  setAnimationMenu
}: Options) {
  const { locale } = useI18n()
  const store = useWorkspace.getState()
  const layerSettingsEditorRef = useRef<LayerSettingsEditorHandle>(null)

  const [layerDisplayColorPresets, setLayerDisplayColorPresets] = useState(() => loadEditorPreferences().layerDisplayColorPresets)

  const [shortcuts, setShortcuts] = useState(() => loadShortcutBindings())

  const shortcutHint = (...ids: ShortcutId[]) => {
    const value = ids
      .map((id) => formatShortcutBindingsForLocale(shortcutBindingsFor(shortcuts, id), locale))
      .filter(Boolean)
      .join(' / ')
    return value ? <kbd aria-hidden="true">{value}</kbd> : null
  }

  const [layerSettings, setLayerSettings] = useState<LayerSettingsState>(() => {
    const preferences = loadEditorPreferences()
    return {
      density: loadLayerDensity(),
      onionSkin: preferences.onionSkin,
      timelineHidden: preferences.timelineHidden,
      sideDockAutoHide: loadLayerSideDockAutoHide(),
      skipDisabledFrames: preferences.skipDisabledFrames,
      quickActions: loadLayerQuickActions()
    }
  })

  const [layerLabelWidth, setLayerLabelWidth] = useState(loadLayerLabelWidth)

  const [layerDensity, setLayerDensity] = useState<LayerDisplayDensity>(loadLayerDensity)

  const [freeTileInstancePanelLayout, setFreeTileInstancePanelLayout] = useState<FreeTileInstancePanelLayout>(loadFreeTileInstancePanelLayout)

  const freeTileInstanceLayer = session.freeTileInstanceLayerId
    ? (session.document.layers.find((layer) => layer.id === session.freeTileInstanceLayerId && layer.kind === 'free-tile') ?? null)
    : null

  const integratedFreeTileInstanceLayer = freeTileInstancePanelLayout === 'integrated' ? freeTileInstanceLayer : null

  const visibleLoopSectionLaneCount = !integratedFreeTileInstanceLayer && !layerSettings.timelineHidden ? loopSectionLayout.laneCount : 0

  const availableTilemapTilesets: Tileset[] = (session.document.tilesets ?? []).filter((tileset) =>
    session.document.layers.some((layer) => layer.kind === 'tilemap' && layer.tilemapTilesetId === tileset.id)
  )

  const showLinkedCelVisuals = layerDensityOrder.indexOf(layerDensity) < layerDensityOrder.indexOf('detailed')

  const showLinkedVisuals = showLinkedCelVisuals

  const showCelThumbnails = layerDensityOrder.indexOf(layerDensity) >= layerDensityOrder.indexOf('detailed')

  const celThumbnailSize = layerDensity === 'detailed' ? 46 : layerDensity === 'expanded' ? 64 : layerDensity === 'large' ? 88 : 120

  const syncAnimationLoopSectionScroll = (): void => {
    if (!animationLoopSectionTrackRef.current || !layerListRef.current) return
    animationLoopSectionTrackRef.current.style.transform = `translate3d(${-layerListRef.current.scrollLeft}px, 0, 0)`
  }

  useLayoutEffect(() => {
    const toolbar = layerAnimationToolbarRef.current
    const header = toolbar?.closest('header')
    const panel = floating.ref.current
    if (!toolbar || !header || !panel) return
    return observeToolbarExtent(panel, header, toolbar)
  }, [docked, integratedFreeTileInstanceLayer?.id, layerDensity, layerSettings.timelineHidden, session.document.id])

  useLayoutEffect(() => {
    syncAnimationLoopSectionScroll()
  }, [layerLabelWidth, timeline.frames.length, timeline.loopSections, visibleLoopSectionLaneCount])

  useEffect(() => {
    if (!session.freeTileInstanceLayerId) return
    if (!freeTileInstanceLayer || session.document.activeLayerId !== session.freeTileInstanceLayerId) store.setFreeTileInstanceLayerView(null)
  }, [freeTileInstanceLayer, session.document.activeLayerId, session.document.id, session.freeTileInstanceLayerId, store])

  useEffect(() => {
    const refreshLayout = (): void => setFreeTileInstancePanelLayout(loadFreeTileInstancePanelLayout())
    window.addEventListener('moonsprite:preferences-changed', refreshLayout)
    return () => window.removeEventListener('moonsprite:preferences-changed', refreshLayout)
  }, [])

  const openLayerSettings = (): void => {
    const preferences = loadEditorPreferences()
    setLayerSettings({
      density: layerDensity,
      onionSkin: preferences.onionSkin,
      timelineHidden: preferences.timelineHidden,
      sideDockAutoHide: loadLayerSideDockAutoHide(),
      skipDisabledFrames: preferences.skipDisabledFrames,
      quickActions: loadLayerQuickActions()
    })
    layerSettingsEditorRef.current?.open()
  }

  const applyLayerSettings = (next: LayerSettingsState): void => {
    if (layerSettings.timelineHidden && next.timelineHidden && next.onionSkin !== layerSettings.onionSkin) return
    setLayerSettings(next)
    setLayerDensity(next.density)
    saveLayerDensity(next.density)
    saveLayerSideDockAutoHide(next.sideDockAutoHide)
    saveLayerQuickActions(next.quickActions)
    saveEditorPreferences({
      ...loadEditorPreferences(),
      onionSkin: next.onionSkin,
      timelineHidden: next.timelineHidden,
      skipDisabledFrames: next.skipDisabledFrames
    })
    if (next.timelineHidden) {
      store.setAnimationPlaying(false)
      store.clearAnimationSelection()
      setAnimationMenu(null)
    }
    window.dispatchEvent(new Event('moonsprite:preferences-changed'))
  }

  const toggleOnionSkin = (): void => {
    const current = loadEditorPreferences().onionSkin
    applyLayerSettings({
      density: layerDensity,
      onionSkin: { ...current, enabled: !current.enabled },
      timelineHidden: layerSettings.timelineHidden,
      sideDockAutoHide: layerSettings.sideDockAutoHide,
      skipDisabledFrames: layerSettings.skipDisabledFrames,
      quickActions: layerSettings.quickActions
    })
  }

  const setStoredLayerLabelWidth = (value: number): void => {
    const next = clampLayerLabelWidth(value)
    setLayerLabelWidth(next)
    localStorage.setItem(layerLabelWidthKey, String(next))
  }

  const beginLayerLabelResize = (event: React.PointerEvent<HTMLElement>): void => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    document.body.classList.add('layer-column-resizing')
    const startX = event.clientX
    const startWidth = layerLabelWidth
    const move = (moveEvent: PointerEvent): void => setStoredLayerLabelWidth(startWidth + moveEvent.clientX - startX)
    const end = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      document.body.classList.remove('layer-column-resizing')
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }

  const changeLayerDensity = (direction: -1 | 1): void => {
    setLayerDensity((current) => {
      const index = layerDensityOrder.indexOf(current)
      const next = layerDensityOrder[Math.max(0, Math.min(layerDensityOrder.length - 1, index + direction))]
      saveLayerDensity(next)
      window.dispatchEvent(new Event('moonsprite:preferences-changed'))
      return next
    })
  }

  const handleLayerPanelWheel = (event: React.WheelEvent<HTMLElement>): void => {
    if (event.altKey && (event.deltaX !== 0 || event.deltaY !== 0)) {
      event.preventDefault()
      event.stopPropagation()
      if (layerListRef.current) layerListRef.current.scrollLeft += event.deltaX || event.deltaY
      return
    }
    if (!event.ctrlKey || event.deltaY === 0) return
    event.preventDefault()
    event.stopPropagation()
    changeLayerDensity(event.deltaY < 0 ? 1 : -1)
  }

  useEffect(
    () => () => {
      document.body.classList.remove('layer-column-resizing')
    },
    []
  )

  useEffect(() => {
    const refreshPresets = (): void => setLayerDisplayColorPresets(loadEditorPreferences().layerDisplayColorPresets)
    window.addEventListener('moonsprite:preferences-changed', refreshPresets)
    return () => window.removeEventListener('moonsprite:preferences-changed', refreshPresets)
  }, [])

  useEffect(() => {
    const refreshShortcuts = (): void => setShortcuts(loadShortcutBindings())
    window.addEventListener('moonsprite:shortcuts-changed', refreshShortcuts)
    return () => window.removeEventListener('moonsprite:shortcuts-changed', refreshShortcuts)
  }, [])
  return {
    layerSettingsEditorRef,
    layerDisplayColorPresets,
    shortcuts,
    shortcutHint,
    layerSettings,
    layerLabelWidth,
    layerDensity,
    freeTileInstancePanelLayout,
    integratedFreeTileInstanceLayer,
    visibleLoopSectionLaneCount,
    availableTilemapTilesets,
    showLinkedCelVisuals,
    showLinkedVisuals,
    showCelThumbnails,
    celThumbnailSize,
    syncAnimationLoopSectionScroll,
    openLayerSettings,
    applyLayerSettings,
    toggleOnionSkin,
    setStoredLayerLabelWidth,
    beginLayerLabelResize,
    handleLayerPanelWheel
  }
}
