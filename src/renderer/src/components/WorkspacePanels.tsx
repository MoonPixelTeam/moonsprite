import { ReferenceImagePanel, ReferenceImageWindows } from './panels/ReferenceImagePanel'
import { useReferenceImages } from './panels/reference-image-state'
import { beginWorkspaceResize, endWorkspaceResize, createResizeFrame } from './workspace-resize'
import { Fragment, memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentProps, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { useWorkspace, type DocumentSession } from '@/store/workspace'
import { ColorPanel } from '@/components/panels/ColorPanel'
import { FreeTileInstancesPanel } from '@/components/panels/FreeTileInstancesPanel'
import { HistoryPanel } from '@/components/panels/HistoryPanel'
import { LayersPanel } from '@/components/panels/LayersPanel'
import { PalettePanel } from '@/components/panels/PalettePanel'
import { PreviewPanel } from '@/components/panels/PreviewPanel'
import { TilesetPanel } from '@/components/panels/TilesetPanel'
import { BrushLibraryPanel } from '@/components/panels/BrushLibraryPanel'
import { useBrushLibrary } from '@/components/app/useBrushLibrary'
import { PixelUtilityIcon } from '@/components/PixelUtilityIcon'
import type { DockDragProps } from '@/components/workspace-panel-types'
import { readStoredString, removeStoredValue, saveFloatingPosition, writeStoredString } from '@/core/panel-preferences'
import { activeFreeTileCelTarget } from '@/core/free-tile-document'
import { loadFreeTileInstancePanelLayout, type FreeTileInstancePanelLayout } from '@/core/layer-panel-preferences'
import { bottomPanelFlex, COLOR_SQUARE_ANCHOR_STORAGE_KEY, COLOR_SQUARE_DOCK_STORAGE_KEY, DEFAULT_BOTTOM_WIDTHS, DEFAULT_INSPECTOR_ORDER, DEFAULT_INSPECTOR_SIZES, INSPECTOR_LAYOUT_STORAGE_KEY, MINIMUM_BOTTOM_WIDTHS, MINIMUM_INSPECTOR_SIZES, loadInspectorLayout, moveInspectorPanel, proportionalPanelFlex, type WorkspacePanelId } from '@/core/panel-layout'
import { FLOATING_PANEL_STORAGE_KEYS } from '@/core/workspace-layout-preferences'
import { brushPanelRenderKey, colorPanelRenderKey, layersPanelRenderKey, palettePanelRenderKey, previewPanelRenderKey, tilesetPanelRenderKey } from '@/core/panel-render-keys'
import { FloatingDockPreview } from './floating-panel'
import { createPanelDockIntent, panelDockZoneAt, PANEL_DRAG_THRESHOLD, type PanelDockZone } from './panel-docking'
import type { FixedPanelDock, PanelDock } from './floating-panel'
import { PerformanceProfiler } from './PerformanceProfiler'
import { PopupPanelWindow, type PopupPanelAnchor } from './PopupPanelWindow'
import { useI18n } from './I18nProvider'

export type { PanelDock } from './floating-panel'
export type { WorkspacePanelId } from '@/core/panel-layout'
const notifyWorkspaceLayoutChanged = (): void => { window.dispatchEvent(new Event('moonsprite-workspace-layout-change')) }
const workspacePanelDraggingClass = 'workspace-panel-dragging'

type InspectorDockTarget =
  | { kind: 'dock'; dock: FixedPanelDock; id?: WorkspacePanelId; insertAfter: boolean }
  | { kind: 'floating' }
interface InspectorDockHit {
  target: Extract<InspectorDockTarget, { kind: 'dock' }>
  preview: React.CSSProperties | null
}
type SquareAnchor = 'start' | 'end'
type PanelRenderProps<T> = T & { renderKey: string }
const samePanelRender = <T extends { renderKey: string; docked?: boolean; sideDocked?: boolean }>(previous: T, next: T): boolean =>
  previous.renderKey === next.renderKey && previous.docked === next.docked && previous.sideDocked === next.sideDocked

const samePanelOrder = (left: readonly WorkspacePanelId[], right: readonly WorkspacePanelId[]): boolean =>
  left.length === right.length && left.every((id, index) => id === right[index])

const MemoColorPanel = memo(function MemoColorPanel({ renderKey: _renderKey, ...props }: PanelRenderProps<ComponentProps<typeof ColorPanel>>) {
  return <ColorPanel {...props} />
}, samePanelRender)

const MemoPalettePanel = memo(function MemoPalettePanel({ renderKey: _renderKey, ...props }: PanelRenderProps<ComponentProps<typeof PalettePanel>>) {
  return <PalettePanel {...props} />
}, samePanelRender)

const MemoLayersPanel = memo(function MemoLayersPanel({ renderKey: _renderKey, ...props }: PanelRenderProps<ComponentProps<typeof LayersPanel>>) {
  return <LayersPanel {...props} />
}, samePanelRender)

const MemoFreeTileInstancesPanel = memo(function MemoFreeTileInstancesPanel({ renderKey: _renderKey, ...props }: PanelRenderProps<ComponentProps<typeof FreeTileInstancesPanel>>) {
  return <FreeTileInstancesPanel {...props} />
}, samePanelRender)

const MemoPreviewPanel = memo(function MemoPreviewPanel({ renderKey: _renderKey, ...props }: PanelRenderProps<ComponentProps<typeof PreviewPanel>>) {
  return <PreviewPanel {...props} />
}, (previous, next) => samePanelRender(previous, next) && previous.relativeLuminanceInPreview === next.relativeLuminanceInPreview && previous.relativeLuminanceOverride === next.relativeLuminanceOverride)

const MemoTilesetPanel = memo(function MemoTilesetPanel({ renderKey: _renderKey, ...props }: PanelRenderProps<ComponentProps<typeof TilesetPanel>>) {
  return <TilesetPanel {...props} />
}, samePanelRender)

export function inspectorDockHitAtPoint(movingId: WorkspacePanelId, clientX: number, clientY: number, current?: PanelDockZone | null): InspectorDockHit | null {
  const zone = panelDockZoneAt(clientX, clientY, movingId, current)
  return zone ? { target: { kind: 'dock', dock: zone.dock, id: zone.id, insertAfter: zone.insertAfter }, preview: zone.preview } : null
}

export function InspectorPanels({ session, panelVisibility, onClosePreview, panelDocks, leftDockHost, bottomDockHost, onPanelDockChange, onPanelVisibilityChange, relativeLuminanceInPreview = true, popupPanelId = null, onPopupPanelClose }: {
  session: DocumentSession
  panelVisibility: Record<WorkspacePanelId, boolean>
  onClosePreview: () => void
  panelDocks: Record<WorkspacePanelId, PanelDock>
  leftDockHost: HTMLElement | null
  bottomDockHost: HTMLElement | null
  onPanelDockChange: (id: WorkspacePanelId, dock: PanelDock) => void
  onPanelVisibilityChange: (id: WorkspacePanelId, visible: boolean) => void
  relativeLuminanceInPreview?: boolean
  popupPanelId?: WorkspacePanelId | null
  onPopupPanelClose?: () => void
}) {
  const { t } = useI18n()
  const brushLibrary = useBrushLibrary(session)
  const panelLabels: Record<WorkspacePanelId, string> = { color: t('panel.color'), palette: t('panel.palette'), layers: t('panel.layers'), freeTileInstances: t('panel.freeTileInstances'), history: t('panel.history'), preview: t('panel.preview'), reference: t('panel.reference'), tileset: t('panel.tileset'), brushes: t('panel.brushes') }
  const panelDockLabels: Record<PanelDock, string> = { left: t('panel.dock.left'), right: t('panel.dock.right'), bottom: t('panel.dock.bottom'), floating: t('panel.dock.floating') }
  const panelStateKey = useWorkspace((state) => {
    const current = state.sessions.find((item) => item.document.id === session.document.id) ?? session
    return [
      colorPanelRenderKey(current),
      palettePanelRenderKey(current),
      layersPanelRenderKey(current),
      previewPanelRenderKey(current),
      tilesetPanelRenderKey(current),
      brushPanelRenderKey(current)
    ].join('::')
  })
  void panelStateKey
  const initialLayout = useMemo(loadInspectorLayout, [])
  const [initialSquareSizing, setInitialSquareSizing] = useState(initialLayout.squarePanels.length > 0)
  const [order, setOrder] = useState<WorkspacePanelId[]>(initialLayout.order)
  const [verticalWeights, setVerticalWeights] = useState<Record<WorkspacePanelId, number>>(initialLayout.verticalWeights)
  const [bottomWeights, setBottomWeights] = useState<Record<WorkspacePanelId, number>>(initialLayout.bottomWeights)
  const [colorSquareDock, setColorSquareDock] = useState<FixedPanelDock | null>(() => {
    const stored = readStoredString(COLOR_SQUARE_DOCK_STORAGE_KEY)
    return stored === 'left' || stored === 'right' || stored === 'bottom' ? stored : null
  })
  const [colorSquareAnchor, setColorSquareAnchor] = useState<SquareAnchor>(() => readStoredString(COLOR_SQUARE_ANCHOR_STORAGE_KEY) === 'start' ? 'start' : 'end')
  const [draggingPanel, setDraggingPanel] = useState<WorkspacePanelId | null>(null)
  const [detachPreview, setDetachPreview] = useState<React.CSSProperties | null>(null)
  const [panelContextMenu, setPanelContextMenu] = useState<{ id: WorkspacePanelId; x: number; y: number; bounds: { left: number; top: number; width: number; height: number } } | null>(null)
  const [previewRelativeLuminanceOverride, setPreviewRelativeLuminanceOverride] = useState<boolean | null>(null)
  const referenceRelativeLuminance = useReferenceImages((state) => state.relativeLuminance)
  const [freeTileInstancePanelLayout, setFreeTileInstancePanelLayout] = useState<FreeTileInstancePanelLayout>(loadFreeTileInstancePanelLayout)
  const verticalWeightsRef = useRef(verticalWeights)
  const bottomWeightsRef = useRef(bottomWeights)
  const orderRef = useRef(order)
  const colorSquareDockRef = useRef<FixedPanelDock | null>(colorSquareDock)
  const detachPreviewRef = useRef<React.CSSProperties | null>(null)
  const popupPanelAnchorRef = useRef<PopupPanelAnchor>({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
  const resizeRef = useRef<{ upper: WorkspacePanelId; dock: 'left' | 'right'; startY: number; startSizes: Record<WorkspacePanelId, number> } | null>(null)
  const bottomResizeRef = useRef<{ leading: WorkspacePanelId; trailing: WorkspacePanelId; startX: number; startWidths: Record<WorkspacePanelId, number> } | null>(null)
  const previewRelativeLuminance = previewRelativeLuminanceOverride ?? (session.view.relativeLuminance && relativeLuminanceInPreview)
  const contextRelativeLuminance = panelContextMenu?.id === 'reference' ? referenceRelativeLuminance : previewRelativeLuminance
  const dockDragRef = useRef<{ id: WorkspacePanelId; startX: number; startY: number; detach: (clientX: number, clientY: number, continueDrag?: boolean) => void; moved: boolean } | null>(null)
  const instancePanelAutoOpenRef = useRef<{ key: string; count: number; layout: FreeTileInstancePanelLayout } | null>(null)
  const activeFreeTileTarget = freeTileInstancePanelLayout === 'separate' ? activeFreeTileCelTarget(session.document) : null
  const activeFreeTileInstanceCount = activeFreeTileTarget?.freeTiles.instances.length ?? 0
  const activeFreeTileInstanceKey = activeFreeTileTarget
    ? `${session.document.id}:${activeFreeTileTarget.layer.id}:${activeFreeTileTarget.cel.frameId}`
    : `${session.document.id}:none`
  verticalWeightsRef.current = verticalWeights
  bottomWeightsRef.current = bottomWeights
  orderRef.current = order
  colorSquareDockRef.current = colorSquareDock

  useEffect(() => {
    const rememberPointer = (event: PointerEvent): void => {
      if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return
      popupPanelAnchorRef.current = { x: event.clientX, y: event.clientY }
    }
    window.addEventListener('pointermove', rememberPointer, true)
    window.addEventListener('pointerdown', rememberPointer, true)
    return () => {
      window.removeEventListener('pointermove', rememberPointer, true)
      window.removeEventListener('pointerdown', rememberPointer, true)
    }
  }, [])

  useEffect(() => {
    if (!panelContextMenu) return
    const dismiss = (event: PointerEvent): void => {
      if ((event.target as HTMLElement | null)?.closest('.workspace-panel-context-menu')) return
      setPanelContextMenu(null)
    }
    const close = (): void => setPanelContextMenu(null)
    window.addEventListener('pointerdown', dismiss)
    window.addEventListener('blur', close)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('pointerdown', dismiss)
      window.removeEventListener('blur', close)
      window.removeEventListener('resize', close)
    }
  }, [panelContextMenu])

  useEffect(() => setPreviewRelativeLuminanceOverride(null), [session.document.id])

  useEffect(() => {
    const refresh = (): void => setFreeTileInstancePanelLayout(loadFreeTileInstancePanelLayout())
    window.addEventListener('moonsprite:preferences-changed', refresh)
    return () => window.removeEventListener('moonsprite:preferences-changed', refresh)
  }, [])

  useEffect(() => {
    const previous = instancePanelAutoOpenRef.current
    instancePanelAutoOpenRef.current = { key: activeFreeTileInstanceKey, count: activeFreeTileInstanceCount, layout: freeTileInstancePanelLayout }
    if (freeTileInstancePanelLayout !== 'separate' || activeFreeTileInstanceCount === 0) {
      if (panelVisibility.freeTileInstances) onPanelVisibilityChange('freeTileInstances', false)
      if (popupPanelId === 'freeTileInstances') onPopupPanelClose?.()
      return
    }
    const shouldOpen = !previous
      || previous.layout !== 'separate'
      || previous.key !== activeFreeTileInstanceKey
      || previous.count === 0
      || activeFreeTileInstanceCount > previous.count
    if (shouldOpen && !panelVisibility.freeTileInstances) onPanelVisibilityChange('freeTileInstances', true)
  }, [activeFreeTileInstanceCount, activeFreeTileInstanceKey, freeTileInstancePanelLayout, onPanelVisibilityChange, onPopupPanelClose, panelVisibility.freeTileInstances, popupPanelId])

  const openPanelContextMenu = (id: WorkspacePanelId, event: ReactMouseEvent<HTMLElement>): void => {
    const header = (event.target as HTMLElement).closest('header')
    if (id !== 'preview' && (!header || header.parentElement !== event.currentTarget)) return
    event.preventDefault()
    event.stopPropagation()
    const bounds = event.currentTarget.getBoundingClientRect()
    setPanelContextMenu({
      id,
      x: Math.max(4, Math.min(window.innerWidth - 228, event.clientX)),
      y: Math.max(4, Math.min(window.innerHeight - (id === 'preview' ? 266 : 226), event.clientY)),
      bounds: { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height }
    })
  }

  const movePanelFromMenu = (id: WorkspacePanelId, dock: PanelDock): void => {
    const bounds = panelContextMenu?.id === id ? panelContextMenu.bounds : { left: 24, top: 72, width: 280, height: 260 }
    if (dock === 'floating') {
      const width = Math.max(180, Math.min(window.innerWidth - 12, bounds.width))
      const height = Math.max(120, Math.min(window.innerHeight - 12, bounds.height))
      saveFloatingPosition(FLOATING_PANEL_STORAGE_KEYS[id], {
        x: Math.max(6, Math.min(window.innerWidth - width - 6, bounds.left + 18)),
        y: Math.max(6, Math.min(window.innerHeight - height - 6, bounds.top + 18)),
        width,
        height
      }, { width: window.innerWidth, height: window.innerHeight })
    } else {
      removeStoredValue(FLOATING_PANEL_STORAGE_KEYS[id])
    }
    onPanelVisibilityChange(id, true)
    onPanelDockChange(id, dock)
    if (popupPanelId === id) onPopupPanelClose?.()
    notifyWorkspaceLayoutChanged()
    setPanelContextMenu(null)
  }
  const dockFor = (id: WorkspacePanelId): PanelDock => panelDocks[id] ?? (id === 'preview' ? 'floating' : 'right')
  const activePopupPanelId = popupPanelId && dockFor(popupPanelId) !== 'floating' ? popupPanelId : null

  const persistLayout = (nextOrder = order, nextVerticalWeights = verticalWeightsRef.current, nextBottomWeights = bottomWeightsRef.current): void => {
    try {
      writeStoredString(INSPECTOR_LAYOUT_STORAGE_KEY, JSON.stringify({ order: nextOrder, verticalWeights: nextVerticalWeights, bottomWeights: nextBottomWeights, squarePanels: initialSquareSizing ? initialLayout.squarePanels : [] }))
      notifyWorkspaceLayoutChanged()
    } catch { /* Ignore unavailable renderer storage. */ }
  }
  useLayoutEffect(() => {
    if (!initialSquareSizing) return
    const slots = [...document.querySelectorAll<HTMLElement>('.inspector-panel-group[data-inspector-panel-id]')]
    const squares = slots.filter(slot => initialLayout.squarePanels.includes(slot.dataset.inspectorPanelId as WorkspacePanelId))
    if (squares.length !== initialLayout.squarePanels.length || squares.some(slot => slot.getBoundingClientRect().height <= 0)) return
    const colorSlot = squares.find(slot => slot.dataset.inspectorPanelId === 'color')
    const colorField = colorSlot?.querySelector<HTMLElement>('.color-field-slot')
    if (colorSlot && colorField) {
      const slotBounds = colorSlot.getBoundingClientRect()
      const fieldBounds = colorField.getBoundingClientRect()
      // Only the picking field is square; retain the header, strips, color
      // values, padding and separator at their measured heights.
      const height = slotBounds.height - fieldBounds.height + fieldBounds.width
      colorSlot.style.setProperty('flex', `0 0 ${height}px`, 'important')
      colorSlot.style.aspectRatio = 'auto'
    }
    // The preset supplies starting geometry only. Convert it once to the same
    // proportional weights used by freely resizable panels, then discard locks.
    const measured = { ...verticalWeightsRef.current }
    for (const slot of slots) {
      const id = slot.dataset.inspectorPanelId as WorkspacePanelId
      measured[id] = slot.getBoundingClientRect().height
    }
    colorSlot?.style.removeProperty('flex')
    colorSlot?.style.removeProperty('aspect-ratio')
    verticalWeightsRef.current = measured
    setVerticalWeights(measured)
    setInitialSquareSizing(false)
    writeStoredString(INSPECTOR_LAYOUT_STORAGE_KEY, JSON.stringify({
      order: orderRef.current, verticalWeights: measured, bottomWeights: bottomWeightsRef.current, squarePanels: []
    }))
    notifyWorkspaceLayoutChanged()
  }, [initialSquareSizing, initialLayout, leftDockHost, bottomDockHost, panelDocks, panelVisibility])
  useEffect(() => {
    if (freeTileInstancePanelLayout !== 'separate' || activeFreeTileInstanceCount === 0 || !panelVisibility.freeTileInstances) return
    const layersDock = dockFor('layers')
    if (layersDock === 'left' || layersDock === 'right' || layersDock === 'bottom') {
      if (dockFor('freeTileInstances') !== layersDock) onPanelDockChange('freeTileInstances', layersDock)
    }
    const nextOrder = moveInspectorPanel(orderRef.current, 'freeTileInstances', 'layers', true)
    if (samePanelOrder(nextOrder, orderRef.current)) return
    orderRef.current = nextOrder
    setOrder(nextOrder)
    persistLayout(nextOrder, verticalWeightsRef.current, bottomWeightsRef.current)
  }, [activeFreeTileInstanceCount, activeFreeTileInstanceKey, freeTileInstancePanelLayout, onPanelDockChange, order, panelDocks, panelVisibility.freeTileInstances])
  const setSquareDock = (dock: FixedPanelDock | null, anchor: SquareAnchor = colorSquareAnchor): void => {
    setColorSquareDock(dock)
    if (dock) {
      setColorSquareAnchor(anchor)
      writeStoredString(COLOR_SQUARE_DOCK_STORAGE_KEY, dock)
      writeStoredString(COLOR_SQUARE_ANCHOR_STORAGE_KEY, anchor)
    } else {
      removeStoredValue(COLOR_SQUARE_DOCK_STORAGE_KEY)
      removeStoredValue(COLOR_SQUARE_ANCHOR_STORAGE_KEY)
    }
    notifyWorkspaceLayoutChanged()
  }
  useEffect(() => {
    let lastPoint: { x: number; y: number } | null = null
    const intent = createPanelDockIntent(zone => {
      detachPreviewRef.current = zone?.preview ?? null
      setDetachPreview(zone?.preview ?? null)
    })
    const previewWeights = (weights: Record<WorkspacePanelId, number>, dock: FixedPanelDock): void => {
      const slots = [...document.querySelectorAll<HTMLElement>(`[data-panel-dock-content="${dock}"] [data-inspector-panel-id]`)]
      const ids = slots.map(slot => slot.dataset.inspectorPanelId as WorkspacePanelId)
      const fillId = ids.includes('layers') ? 'layers' : ids.find(id => id !== 'color' || colorSquareDockRef.current !== 'bottom') ?? ids[0]
      for (const slot of slots) {
        const id = slot.dataset.inspectorPanelId as WorkspacePanelId
        const locked = id === 'color' && colorSquareDockRef.current === dock
        slot.style.flex = locked ? `0 0 ${weights[id]}px` : dock === 'bottom' ? bottomPanelFlex(weights[id], id === fillId) : proportionalPanelFlex(weights[id])
        slot.style.setProperty('--locked-size', `${weights[id]}px`)
      }
    }
    const applyMove = (event: { clientX: number; clientY: number; altKey?: boolean }): void => {
      const bottomResize = bottomResizeRef.current
      if (bottomResize) {
        if (Math.abs(event.clientX - bottomResize.startX) > 1 && colorSquareDockRef.current === 'bottom') setSquareDock(null)
        const total = bottomResize.startWidths[bottomResize.leading] + bottomResize.startWidths[bottomResize.trailing]
        const minimumLeading = MINIMUM_BOTTOM_WIDTHS[bottomResize.leading]
        const minimumTrailing = MINIMUM_BOTTOM_WIDTHS[bottomResize.trailing]
        const leading = Math.max(minimumLeading, Math.min(total - minimumTrailing, bottomResize.startWidths[bottomResize.leading] + event.clientX - bottomResize.startX))
        const next = { ...bottomResize.startWidths, [bottomResize.leading]: leading, [bottomResize.trailing]: total - leading }
        bottomWeightsRef.current = next
        previewWeights(next, 'bottom')
        return
      }
      const drag = resizeRef.current
      if (drag) {
        if (Math.abs(event.clientY - drag.startY) > 1 && colorSquareDockRef.current === drag.dock) setSquareDock(null)
        const start = drag.startSizes
        const desired = Math.max(MINIMUM_INSPECTOR_SIZES[drag.upper], start[drag.upper] + event.clientY - drag.startY)
        const delta = desired - start[drag.upper]
        const next = { ...start, [drag.upper]: desired }
        const dockOrder = orderRef.current.filter((id) => dockFor(id) === drag.dock && panelVisibility[id])
        const upperIndex = dockOrder.indexOf(drag.upper)
        const lowerPanels = dockOrder.slice(upperIndex + 1)
        if (delta > 0) {
          let remaining = delta
          for (const id of lowerPanels) {
            const available = Math.max(0, next[id] - MINIMUM_INSPECTOR_SIZES[id])
            const consumed = Math.min(available, remaining)
            next[id] -= consumed
            remaining -= consumed
            if (remaining <= 0) break
          }
        } else if (delta < 0 && lowerPanels[0]) {
          next[lowerPanels[0]] += -delta
        }
        verticalWeightsRef.current = next
        previewWeights(next, drag.dock)
        return
      }
      const dockDrag = dockDragRef.current
      if (!dockDrag) return
      if (!dockDrag.moved && Math.hypot(event.clientX - dockDrag.startX, event.clientY - dockDrag.startY) < PANEL_DRAG_THRESHOLD) return
      lastPoint = { x: event.clientX, y: event.clientY }
      dockDrag.moved = true
      setDraggingPanel(dockDrag.id)
      intent.update(event.altKey ? null : panelDockZoneAt(event.clientX, event.clientY, dockDrag.id, intent.active))
      if (intent.active) return
      {
        const source = document.querySelector<HTMLElement>(`[data-inspector-panel-id="${dockDrag.id}"]`)?.getBoundingClientRect()
        // A small title-bar drag within the original panel is not a detach.
        if (!event.altKey && source && event.clientX >= source.left && event.clientX <= source.right && event.clientY >= source.top && event.clientY <= source.bottom) {
          detachPreviewRef.current = null
          setDetachPreview(null)
          return
        }
        const width = source?.width ?? 280
        const height = source?.height ?? verticalWeightsRef.current[dockDrag.id]
        const preview = {
          position: 'fixed',
          left: Math.max(0, Math.min(window.innerWidth - Math.min(width, 120), event.clientX - Math.min(80, width / 2))),
          top: Math.max(0, Math.min(window.innerHeight - 32, event.clientY - 16)),
          width,
          height
        } satisfies React.CSSProperties
        detachPreviewRef.current = preview
        setDetachPreview(preview)
        return
      }
    }
    const frame = createResizeFrame(applyMove)
    const move = (event: PointerEvent): void => {
      if (resizeRef.current || bottomResizeRef.current) frame.push(event)
      else applyMove(event)
    }
    const up = (event: PointerEvent): void => {
      const resizing = Boolean(resizeRef.current || bottomResizeRef.current)
      frame.flush()
      if (resizeRef.current) setVerticalWeights(verticalWeightsRef.current)
      if (bottomResizeRef.current) setBottomWeights(bottomWeightsRef.current)
      if (resizeRef.current) persistLayout(orderRef.current, verticalWeightsRef.current)
      if (bottomResizeRef.current) persistLayout(orderRef.current, verticalWeightsRef.current, bottomWeightsRef.current)
      const dockDrag = dockDragRef.current
      const target: InspectorDockTarget | null = dockDrag?.moved && event.type === 'pointerup'
        ? !event.altKey && intent.active
          ? { kind: 'dock', dock: intent.active.dock, id: intent.active.id, insertAfter: intent.active.insertAfter }
          : detachPreviewRef.current ? { kind: 'floating' } : null
        : null
      if (dockDrag?.moved && target?.kind === 'dock') {
        const nextOrder = moveInspectorPanel(orderRef.current, dockDrag.id, target.id, target.insertAfter)
        const currentDock = dockFor(dockDrag.id)
        const currentDockOrder = orderRef.current.filter((id) => dockFor(id) === currentDock)
        const nextDockOrder = nextOrder.filter((id) => dockFor(id) === target.dock)
        const sameDockPosition = currentDock === target.dock && samePanelOrder(currentDockOrder, nextDockOrder)
        if (!sameDockPosition) {
          orderRef.current = nextOrder
          setOrder(nextOrder)
          persistLayout(nextOrder, verticalWeightsRef.current)
          onPanelDockChange(dockDrag.id, target.dock)
          if (dockDrag.id === 'color') setSquareDock(null)
        }
      } else if (dockDrag?.moved && target?.kind === 'floating') {
        dockDrag.detach(event.clientX, event.clientY, false)
        onPanelDockChange(dockDrag.id, 'floating')
        if (dockDrag.id === 'color') setSquareDock(null)
      } else if (dockDrag?.moved) persistLayout(orderRef.current, verticalWeightsRef.current)
      resizeRef.current = null
      bottomResizeRef.current = null
      if (resizing) endWorkspaceResize()
      intent.clear()
      dockDragRef.current = null
      detachPreviewRef.current = null
      setDetachPreview(null)
      setDraggingPanel(null)
      document.documentElement.classList.remove(workspacePanelDraggingClass)
    }
    const keydown = (event: KeyboardEvent): void => {
      if (!dockDragRef.current) return
      if (event.key === 'Alt' && dockDragRef.current.moved && lastPoint) applyMove(new PointerEvent('pointermove', { clientX: lastPoint.x, clientY: lastPoint.y, altKey: true }))
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); up(new PointerEvent('pointercancel')) }
      // A shortcut may synchronously replace the docked panel with a popup.
      // Finish the pending workspace drag first so the old panel cannot leave
      // a stale drag ref that hides every later panel toggle.
      if (event.key !== 'Alt' && event.key !== 'Escape') up(new PointerEvent('pointercancel'))
    }
    const blur = (): void => { if (dockDragRef.current || resizeRef.current || bottomResizeRef.current) up(new PointerEvent('pointercancel')) }
    const keyup = (event: KeyboardEvent): void => {
      if (event.key === 'Alt' && dockDragRef.current?.moved && lastPoint) applyMove(new PointerEvent('pointermove', { clientX: lastPoint.x, clientY: lastPoint.y }))
    }
    window.addEventListener('keyup', keyup, true)
    window.addEventListener('keydown', keydown, true)
    window.addEventListener('blur', blur)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      intent.clear()
      window.removeEventListener('keyup', keyup, true)
      window.removeEventListener('keydown', keydown, true)
      frame.cancel()
      if (resizeRef.current || bottomResizeRef.current) endWorkspaceResize()
      window.removeEventListener('blur', blur)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      document.documentElement.classList.remove(workspacePanelDraggingClass)
    }
  }, [onPanelDockChange, panelDocks, panelVisibility])

  const restoreColorSquare = (preferBottom = false): void => {
    const currentDock = dockFor('color')
    const targetDock: FixedPanelDock = preferBottom ? 'bottom' : currentDock === 'left' || currentDock === 'right' || currentDock === 'bottom' ? currentDock : 'bottom'
    // A docked panel keeps its current order. The edge only decides which
    // boundary remains fixed while the square size consumes sibling space.
    const nextOrder = currentDock === targetDock ? orderRef.current : moveInspectorPanel(orderRef.current, 'color')
    const dockOrder = nextOrder.filter((id) => panelVisibility[id]).filter((id) => (id === 'color' ? targetDock : dockFor(id)) === targetDock)
    const colorIndex = dockOrder.indexOf('color')
    const anchor: SquareAnchor = colorIndex >= 0 && colorIndex === dockOrder.length - 1 ? 'end' : 'start'
    if (currentDock === targetDock && colorSquareDockRef.current === targetDock && colorSquareAnchor === anchor) {
      const currentPanel = document.querySelector<HTMLElement>(`[data-panel-dock-content="${targetDock}"] [data-inspector-panel-id="color"] .color-panel`)
      const currentField = currentPanel?.querySelector<HTMLElement>('.color-field-slot')
      const currentFieldBounds = currentField?.getBoundingClientRect()
      if (currentFieldBounds && Math.abs(currentFieldBounds.width - currentFieldBounds.height) <= 1) {
        // The visible geometry is already correct. Re-locking here would
        // change flex distribution and cause a one-frame layout flash.
        return
      }
    }

    orderRef.current = nextOrder
    setOrder(nextOrder)
    if (targetDock !== currentDock) onPanelDockChange('color', targetDock)
    setSquareDock(null)
    persistLayout(nextOrder, verticalWeightsRef.current, bottomWeightsRef.current)

    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const slot = document.querySelector<HTMLElement>(`[data-panel-dock-content="${targetDock}"] [data-inspector-panel-id="color"]`)
      const panel = slot?.querySelector<HTMLElement>('.color-panel')
      const fieldSlot = panel?.querySelector<HTMLElement>('.color-field-slot')
      const host = slot?.closest<HTMLElement>(`[data-panel-dock-content="${targetDock}"]`)
      if (!slot || !panel || !fieldSlot || !host) return
      const panelBounds = panel.getBoundingClientRect()
      const fieldBounds = fieldSlot.getBoundingClientRect()
      const hostBounds = host.getBoundingClientRect()
      const activeSiblings = nextOrder.filter((id) => id !== 'color' && panelVisibility[id] && dockFor(id) === targetDock)

      if (targetDock === 'bottom') {
        const reservedWidth = activeSiblings.reduce((total, id) => total + MINIMUM_BOTTOM_WIDTHS[id], 0) + activeSiblings.length * 7
        const maximumWidth = Math.max(MINIMUM_BOTTOM_WIDTHS.color, hostBounds.width - reservedWidth)
        const targetWidth = Math.max(MINIMUM_BOTTOM_WIDTHS.color, Math.min(maximumWidth, Math.round(panelBounds.width - fieldBounds.width + fieldBounds.height)))
        const next = { ...bottomWeightsRef.current, color: targetWidth }
        bottomWeightsRef.current = next
        setBottomWeights(next)
        setSquareDock('bottom', anchor)
        persistLayout(nextOrder, verticalWeightsRef.current, next)
        return
      }

      const reservedHeight = activeSiblings.reduce((total, id) => total + MINIMUM_INSPECTOR_SIZES[id], 0) + activeSiblings.length * 7
      const maximumHeight = Math.max(MINIMUM_INSPECTOR_SIZES.color, hostBounds.height - reservedHeight)
      const dockOrder = nextOrder.filter((id) => panelVisibility[id]).filter((id) => dockFor(id) === targetDock)
      const colorHasFollowingPanel = dockOrder.indexOf('color') < dockOrder.length - 1
      const separatorAllowance = colorHasFollowingPanel ? 7 : 0
      const targetHeight = Math.max(MINIMUM_INSPECTOR_SIZES.color, Math.min(maximumHeight, Math.round(panelBounds.height - fieldBounds.height + fieldBounds.width + separatorAllowance)))
      const next = { ...verticalWeightsRef.current, color: targetHeight }
      verticalWeightsRef.current = next
      setVerticalWeights(next)
      setSquareDock(targetDock, anchor)
      persistLayout(nextOrder, next, bottomWeightsRef.current)
    }))
  }

  const panelFor = (id: WorkspacePanelId, docked: boolean, dock?: PanelDock, popup = false, popupDragStart?: (event: ReactPointerEvent<HTMLElement>) => void) => {
    const dockProps: DockDragProps = popup
      ? { docked: true, onPanelContextMenu: (event) => openPanelContextMenu(id, event), onDockDragStart: (event) => popupDragStart?.(event) }
      : id === 'freeTileInstances'
        ? { docked, onPanelContextMenu: (event) => openPanelContextMenu(id, event) }
        : { docked, onFloatingDock: (dock, placement) => {
          if (placement) {
            const next = moveInspectorPanel(orderRef.current, id, placement.id, placement.insertAfter)
            orderRef.current = next
            setOrder(next)
            persistLayout(next, verticalWeightsRef.current)
          }
          onPanelDockChange(id, dock)
        }, onPanelContextMenu: (event) => openPanelContextMenu(id, event), onDockDragStart: (event, detach) => {
      if (event.button !== 0 || (event.target as HTMLElement).closest('button, input, select')) return
      dockDragRef.current = { id, startX: event.clientX, startY: event.clientY, detach, moved: false }
      document.documentElement.classList.add(workspacePanelDraggingClass)
      event.preventDefault()
    } }
    const panel = id === 'color'
      ? <MemoColorPanel renderKey={colorPanelRenderKey(session)} session={session} onRestoreSquare={popup ? undefined : restoreColorSquare} {...dockProps} />
      : id === 'palette'
        ? <MemoPalettePanel renderKey={palettePanelRenderKey(session)} session={session} {...dockProps} />
        : id === 'layers'
          ? <MemoLayersPanel renderKey={layersPanelRenderKey(session)} session={session} sideDocked={dock === 'left' || dock === 'right'} {...dockProps} />
          : id === 'freeTileInstances'
            ? <MemoFreeTileInstancesPanel renderKey={layersPanelRenderKey(session)} session={session} {...dockProps} />
          : id === 'history'
            ? <HistoryPanel session={session} {...dockProps} />
          : id === 'reference'
            ? <ReferenceImagePanel onClose={popup ? onPopupPanelClose ?? (() => onPanelVisibilityChange('reference', false)) : () => onPanelVisibilityChange('reference', false)} {...dockProps} />
          : id === 'brushes'
            ? <BrushLibraryPanel session={session} controller={brushLibrary} {...dockProps} />
            : id === 'tileset'
              ? <MemoTilesetPanel renderKey={tilesetPanelRenderKey(session)} session={session} {...dockProps} />
              : <MemoPreviewPanel renderKey={previewPanelRenderKey(session)} session={session} onClose={popup ? onPopupPanelClose ?? onClosePreview : onClosePreview} relativeLuminanceInPreview={relativeLuminanceInPreview} relativeLuminanceOverride={previewRelativeLuminanceOverride} {...dockProps} />
    return <PerformanceProfiler id={`Panel:${id}`}>{panel}</PerformanceProfiler>
  }

  const completeOrder = [...order, ...DEFAULT_INSPECTOR_ORDER.filter((id) => !order.includes(id))]
  const activeOrder = completeOrder.filter((id) => panelVisibility[id])
  const renderDock = (dock: FixedPanelDock) => {
    const dockOrder = activeOrder.filter((id) => id !== activePopupPanelId && dockFor(id) === dock)
    const horizontal = dock === 'bottom'
    const bottomFillId = horizontal
      ? dockOrder.includes('layers')
        ? 'layers'
        : dockOrder.find((id) => id !== 'color' || colorSquareDock !== 'bottom') ?? dockOrder[0]
      : undefined
    return <div className={horizontal ? 'bottom-panel-stack' : 'inspector-stack'} data-panel-dock-content={dock}>{dockOrder.map((id, index) => {
      const nextId = dockOrder[index + 1]
      const squareLocked = id === 'color' && colorSquareDock === dock
      return <Fragment key={id}><div className={`${horizontal ? 'bottom-panel-group' : 'inspector-panel-group'} ${!horizontal && initialSquareSizing && initialLayout.squarePanels.includes(id) ? 'workspace-square-panel' : ''} ${draggingPanel === id ? 'dock-dragging' : ''} ${squareLocked && (horizontal || dockOrder.length > 1) ? 'square-locked' : ''}`} data-inspector-panel-id={id} style={horizontal ? { flex: squareLocked ? `0 0 ${bottomWeights[id]}px` : bottomPanelFlex(bottomWeights[id], id === bottomFillId), minWidth: MINIMUM_BOTTOM_WIDTHS[id], '--locked-size': `${bottomWeights[id]}px` } as React.CSSProperties : { flex: squareLocked ? `0 0 ${verticalWeights[id]}px` : proportionalPanelFlex(verticalWeights[id]), minHeight: MINIMUM_INSPECTOR_SIZES[id] + (index < dockOrder.length - 1 ? 7 : 0), '--locked-size': `${verticalWeights[id]}px` } as React.CSSProperties}>
        <div className="inspector-panel-slot">{panelFor(id, true, dock)}</div>
        {!horizontal && index < dockOrder.length - 1 && <div className="panel-resizer" role="separator" aria-orientation="horizontal" aria-label={t('panel.resizeHeight', { panel: panelLabels[id] })} onPointerDown={(event) => {
          const measured = { ...verticalWeightsRef.current }
          for (const panelSlot of document.querySelectorAll<HTMLElement>(`[data-panel-dock-content="${dock}"] [data-inspector-panel-id]`)) {
            const slotId = panelSlot.dataset.inspectorPanelId as WorkspacePanelId | undefined
            const content = panelSlot.querySelector<HTMLElement>(':scope > .inspector-panel-slot')
            if (slotId && content) measured[slotId] = content.getBoundingClientRect().height
          }
          beginWorkspaceResize()
          resizeRef.current = { upper: id, dock, startY: event.clientY, startSizes: measured }
          event.currentTarget.setPointerCapture?.(event.pointerId)
          event.preventDefault()
        }}><span /></div>}
      </div>{horizontal && nextId && <div className="bottom-panel-resizer" role="separator" aria-orientation="vertical" aria-label={t('panel.resizeWidth', { first: panelLabels[id], second: panelLabels[nextId] })} onPointerDown={(event) => {
        const measured = { ...bottomWeightsRef.current }
        for (const slot of document.querySelectorAll<HTMLElement>('[data-panel-dock-content="bottom"] [data-inspector-panel-id]')) {
          const slotId = slot.dataset.inspectorPanelId as WorkspacePanelId | undefined
          if (slotId) measured[slotId] = slot.getBoundingClientRect().width
        }
        beginWorkspaceResize()
        bottomResizeRef.current = { leading: id, trailing: nextId, startX: event.clientX, startWidths: measured }
        event.currentTarget.setPointerCapture?.(event.pointerId)
        event.preventDefault()
      }}><span /></div>}</Fragment>
    })}</div>
  }

  return <PerformanceProfiler id="InspectorPanels"><>
    {createPortal(<ReferenceImageWindows />, document.body)}
    {renderDock('right')}
    {leftDockHost && createPortal(renderDock('left'), leftDockHost)}
    {bottomDockHost && createPortal(renderDock('bottom'), bottomDockHost)}
    {createPortal(<>{activeOrder.filter((id) => dockFor(id) === 'floating').map((id) => <span className="floating-panel-host" key={id}>{panelFor(id, false, 'floating')}</span>)}</>, document.body)}
    {activePopupPanelId && createPortal(<PopupPanelWindow
      key={activePopupPanelId}
      id={activePopupPanelId}
      anchor={popupPanelAnchorRef.current}
      label={panelLabels[activePopupPanelId]}
      onClose={() => onPopupPanelClose?.()}
      renderPanel={(startDrag) => panelFor(activePopupPanelId, true, undefined, true, startDrag)}
    />, document.body)}
    <FloatingDockPreview style={detachPreview} />
    {panelContextMenu && createPortal(<div className="context-menu workspace-panel-context-menu" role="menu" aria-label={t('panel.settings', { panel: panelLabels[panelContextMenu.id] })} style={{ left: panelContextMenu.x, top: panelContextMenu.y }} onContextMenu={(event) => event.preventDefault()}>
      <button className="context-menu-item" type="button" role="menuitem" onClick={() => { onPanelVisibilityChange(panelContextMenu.id, false); if (popupPanelId === panelContextMenu.id) onPopupPanelClose?.(); setPanelContextMenu(null) }}><PixelUtilityIcon kind="eyeOff" /><span>{t('panel.hide', { panel: panelLabels[panelContextMenu.id] })}</span></button>
      <span className="context-menu-divider" />
      {panelContextMenu.id !== 'freeTileInstances' && (['left', 'right', 'bottom', 'floating'] as PanelDock[]).map((dock) => <button key={dock} className="context-menu-item" type="button" role="menuitemradio" aria-checked={dockFor(panelContextMenu.id) === dock} onClick={() => movePanelFromMenu(panelContextMenu.id, dock)}>{dockFor(panelContextMenu.id) === dock ? <PixelUtilityIcon kind="check" /> : <PixelUtilityIcon kind="move" />}<span>{panelDockLabels[dock]}</span></button>)}
      {(panelContextMenu.id === 'preview' || panelContextMenu.id === 'reference') && <><span className="context-menu-divider" /><button className="context-menu-item" type="button" role="menuitemcheckbox" aria-checked={contextRelativeLuminance} onClick={() => { if (panelContextMenu.id === 'reference') useReferenceImages.getState().toggleRelativeLuminance(); else setPreviewRelativeLuminanceOverride(!previewRelativeLuminance); setPanelContextMenu(null) }}>{contextRelativeLuminance ? <PixelUtilityIcon kind="check" /> : <span />}<span>{t(panelContextMenu.id === 'reference' ? 'reference.relativeBrightness' : 'preview.relativeLuminance')}</span></button></>}
    </div>, document.body)}
  </></PerformanceProfiler>
}
