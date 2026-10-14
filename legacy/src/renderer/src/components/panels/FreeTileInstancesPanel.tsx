import { useEffect, useRef, useState } from 'react'
import { FloatingDockPreview, PanelResizeHandles, useFloatingPanel } from '@/components/floating-panel'
import { useI18n } from '@/components/I18nProvider'
import { FreeTileInstanceLayers } from '@/components/panels/FreeTileInstanceLayers'
import { FreeTileInstancePanelSettings } from '@/components/panels/FreeTileInstancePanelSettings'
import type { DockDragProps } from '@/components/workspace-panel-types'
import { activeFreeTileCelTarget } from '@/core/free-tile-document'
import { loadLayerDensity, type FreeTileInstancePanelLayout, type LayerDisplayDensity } from '@/core/layer-panel-preferences'
import { useWorkspace, type DocumentSession } from '@/store/workspace'

type FreeTileInstancesPanelProps = { session: DocumentSession } & DockDragProps

export function FreeTileInstancesPanel({ session, docked = false, onDockDragStart, onPanelContextMenu, onFloatingDock }: FreeTileInstancesPanelProps) {
  const { t } = useI18n()
  const floating = useFloatingPanel(null, false, true, 'moonsprite.free-tile-instances-panel.v1', true, onFloatingDock, docked)
  const listRef = useRef<HTMLDivElement>(null)
  const [density, setDensity] = useState<LayerDisplayDensity>(loadLayerDensity)
  const activeLayer = session.document.layers.find((layer) => layer.id === session.document.activeLayerId && layer.kind === 'free-tile') ?? null
  const target = activeLayer ? activeFreeTileCelTarget(session.document) : null
  const panelTitle = activeLayer ? t('freeTiles.instanceLayersTitle', { name: activeLayer.name }) : t('panel.freeTileInstances')
  const setFreeTileInstanceLayerView = useWorkspace((state) => state.setFreeTileInstanceLayerView)

  useEffect(() => {
    const refresh = (): void => setDensity(loadLayerDensity())
    window.addEventListener('moonsprite:preferences-changed', refresh)
    return () => window.removeEventListener('moonsprite:preferences-changed', refresh)
  }, [])

  const handleLayoutChange = (layout: FreeTileInstancePanelLayout): void => {
    if (layout === 'integrated' && activeLayer) setFreeTileInstanceLayerView(activeLayer.id)
  }

  return <><section ref={floating.ref} className={`panel layers-panel free-tile-instances-panel layer-density-${density} ${floating.style ? 'floating-panel' : ''}`} data-command-scope="layers" style={floating.style} onPointerDown={floating.bringToFront} onContextMenu={onPanelContextMenu}>
    <header aria-label={panelTitle} onPointerDown={(event) => floating.style ? floating.startDrag(event) : onDockDragStart?.(event, floating.startDetachedDrag)}>
      <strong className="layer-panel-title">{panelTitle}</strong>
      <span className="panel-actions" onPointerDown={(event) => event.stopPropagation()}><FreeTileInstancePanelSettings onLayoutChange={handleLayoutChange} /></span>
    </header>
    {activeLayer && target ? <FreeTileInstanceLayers session={session} layer={activeLayer} listRef={listRef} /> : <div ref={listRef} className="layer-list free-tile-instance-layer-view component-scrollbar"><div className="free-tile-instance-empty">{t('freeTiles.noInstances')}</div></div>}
    {floating.style && <PanelResizeHandles onResize={floating.startResize} />}
  </section><FloatingDockPreview style={floating.dockPreview} /></>
}
