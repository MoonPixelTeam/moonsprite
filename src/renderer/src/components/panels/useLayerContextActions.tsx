import type { Tileset } from '@shared/types-tiles'
import type { RgbaColor } from '@shared/types-color'
import { LayerPropertyEditor } from './LayerPropertyEditor'
import { createPortal } from 'react-dom'
import { LayerStyleDialog } from '@/components/LayerStyleDialog'
import { BackgroundLayerDialog } from '@/components/BackgroundLayerDialog'
import { TilemapLayerDialog } from '@/components/TilemapLayerDialog'
import { FreeTileLayerDialog } from '@/components/FreeTileLayerDialog'
import { type LayerPropertyEditorHandle } from './LayerPropertyEditor'
import { selectedRowsForProperties, hasUnsupportedPropertySelection } from './layer-panel-selection'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { LayerGroup, RasterLayer } from '@shared/types-layer'
import { Tooltip } from '@/components/Tooltip'
import { openTextToolDialog } from '@/components/text-tool-events'
import { animationMaskAt, animationMaskSlotAt } from '@/core/document-model'
import { animationCelHasContent, animationGroupMaskAt } from '@/core/animation'
import { type ShortcutId } from '@/core/shortcuts'
import { useWorkspace, type DocumentSession } from '@/store/workspace'
import { useI18n } from '@/components/I18nProvider'
import { PixelUtilityIcon } from '@/components/PixelUtilityIcon'
import { hasConfiguredLayerStyles, hasEnabledLayerStyles } from '@/core/layer-styles'
import type {
  LayerFormTarget,
  LayerContextMenu,
  LayerCreateContextMenu,
  LayerStyleDialogState,
  LayerStyleDragState,
  LayerTreeNode
} from './layer-panel-contracts'
import { LayerContextMenuItem } from './LayerContextMenuItem'

interface Options {
  session: DocumentSession
  celLookup: import('@/core/animation').AnimationCelLookup
  timeline: import('@shared/types-animation').AnimationTimeline
  shortcutHint: (...ids: ShortcutId[]) => import('react').JSX.Element | null
  layerById: Map<string, RasterLayer>

  clippingMaskTooltip: import('react').JSX.Element
  layerMaskTooltip: import('react').JSX.Element
  emptyLayerMaskCelTooltip: import('react').JSX.Element
  layerStyleClipboard: import('@shared/types-layer-style').LayerStyles | null
  availableTilemapTilesets: Tileset[]
  freeTileSetOptions: {
    id: string
    name: string
    sourceCount: number
  }[]
  layerDisplayColorPresets: RgbaColor[]
}

export function useLayerContextActions({
  session,
  celLookup,
  timeline,
  shortcutHint,
  layerById,
  clippingMaskTooltip,
  layerMaskTooltip,
  emptyLayerMaskCelTooltip,
  layerStyleClipboard,
  availableTilemapTilesets,
  freeTileSetOptions,
  layerDisplayColorPresets
}: Options) {
  const { t } = useI18n()
  const store = useWorkspace.getState()
  const propertyEditorRef = useRef<LayerPropertyEditorHandle>(null)

  const [contextMenu, setContextMenu] = useState<LayerContextMenu | null>(null)

  const [layerCreateMenu, setLayerCreateMenu] = useState<LayerCreateContextMenu | null>(null)

  const [backgroundLayerDialogOpen, setBackgroundLayerDialogOpen] = useState(false)

  const [tilemapLayerDialog, setTilemapLayerDialog] = useState<{ mode: 'create' } | { mode: 'convert'; layerId: string } | null>(null)

  const [freeTileLayerDialogOpen, setFreeTileLayerDialogOpen] = useState(false)

  const [layerStyleDialog, setLayerStyleDialog] = useState<LayerStyleDialogState | null>(null)

  const layerStyleDragRef = useRef<LayerStyleDragState | null>(null)

  const suppressLayerStyleClickRef = useRef(false)

  const [layerStyleDrag, setLayerStyleDrag] = useState<LayerStyleDragState | null>(null)

  const editLayer = (layer: RasterLayer): void => propertyEditorRef.current?.open([{ kind: 'layer', id: layer.id }])

  const editGroup = (group: LayerGroup): void => propertyEditorRef.current?.open([{ kind: 'group', id: group.id }])

  const editSelectedRows = (frozenTargets?: readonly LayerFormTarget[]): void => {
    const current = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id) ?? session
    const targets = frozenTargets ?? selectedRowsForProperties(current)
    if (targets.length > 1) propertyEditorRef.current?.open(targets)
  }

  const editLayerRow = (layer: RasterLayer): void => {
    const selectedTargets = selectedRowsForProperties(session)
    if (selectedTargets.length > 1 && selectedTargets.some((target) => target.kind === 'layer' && target.id === layer.id)) {
      editSelectedRows()
      return
    }
    if (layer.kind === 'text') {
      const cel = celLookup.resolve(celLookup.at(layer.id, timeline.activeFrameId))
      openTextToolDialog({
        documentId: session.document.id,
        layerId: layer.id,
        frameId: timeline.activeFrameId,
        x: cel?.surface?.offsetX ?? layer.offsetX,
        y: cel?.surface?.offsetY ?? layer.offsetY
      })
      return
    }
    editLayer(layer)
  }

  const editGroupRowForGroup = (group: LayerGroup): void => {
    const selectedTargets = selectedRowsForProperties(session)
    if (selectedTargets.length > 1 && selectedTargets.some((target) => target.kind === 'group' && target.id === group.id)) editSelectedRows()
    else editGroup(group)
  }

  const editGroupRow = (group: LayerGroup | Extract<LayerTreeNode, { kind: 'group' }>): void => editGroupRowForGroup('group' in group ? group.group : group)

  useEffect(() => {
    const targetAtPointer = (x: number, y: number): LayerFormTarget | null => {
      if (typeof document.elementFromPoint !== 'function') return null
      const row = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-layer-id], [data-group-id]')
      if (row?.dataset.layerId) return { kind: 'layer', id: row.dataset.layerId }
      if (row?.dataset.groupId) return { kind: 'group', id: row.dataset.groupId }
      return null
    }
    const move = (event: PointerEvent): void => {
      const drag = layerStyleDragRef.current
      if (!drag) return
      const moved = drag.moved || Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >= 4
      const hovered = moved ? targetAtPointer(event.clientX, event.clientY) : null
      const target = hovered && (hovered.kind !== drag.source.kind || hovered.id !== drag.source.id) ? hovered : null
      const next = { ...drag, target, x: event.clientX, y: event.clientY, moved }
      layerStyleDragRef.current = next
      setLayerStyleDrag(next)
    }
    const finish = (event: PointerEvent): void => {
      const drag = layerStyleDragRef.current
      if (!drag) return
      layerStyleDragRef.current = null
      setLayerStyleDrag(null)
      if (drag.moved) {
        suppressLayerStyleClickRef.current = true
        window.setTimeout(() => {
          suppressLayerStyleClickRef.current = false
        }, 0)
      }
      if (event.type !== 'pointerup' || !drag.moved || !drag.target) return
      const active = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id)
      const source =
        drag.source.kind === 'layer'
          ? active?.document.layers.find((layer) => layer.id === drag.source.id)
          : active?.document.groups.find((group) => group.id === drag.source.id)
      if (source?.layerStyles) useWorkspace.getState().setLayerStylesForTargets([drag.target], source.layerStyles, 'paste')
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      layerStyleDragRef.current = null
    }
  }, [session.document.id])

  const openLayerContextMenu = (event: React.MouseEvent, kind: 'layer' | 'group', id: string): void => {
    event.preventDefault()
    event.stopPropagation()
    const wasEditingLayerMask = Boolean(session.activeLayerMaskId)
    // Preserve an existing mixed/multi row selection when the context menu is
    // opened on one of its members.  The previous selectedGroupId check
    // forced a replace-selection whenever a group was still the active row,
    // so creating a group from the context menu silently dropped the other
    // explicitly selected layers.  A non-selected target still becomes the
    // sole context selection, and mask editing keeps its existing escape path.
    if (kind === 'layer' && (wasEditingLayerMask || !session.selectedLayerIds.includes(id))) store.selectLayer(id)
    if (kind === 'group' && (wasEditingLayerMask || !session.selectedGroupIds.includes(id))) store.selectGroup(id)
    const current = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id) ?? session
    const source = { kind, id } as LayerFormTarget
    const selectedTargets = selectedRowsForProperties(current)
    const sourceIsSelected = selectedTargets.some((target) => target.kind === source.kind && target.id === source.id)
    setLayerCreateMenu(null)
    setContextMenu({
      kind,
      id,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 232)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 540)),
      propertyTargets: sourceIsSelected ? selectedTargets : [source],
      propertySelectionIncludesUnsupported: sourceIsSelected && hasUnsupportedPropertySelection(current)
    })
  }

  const openLayerCreateContextMenu = (event: React.MouseEvent): void => {
    event.preventDefault()
    event.stopPropagation()
    setContextMenu(null)
    setLayerCreateMenu({
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 232)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 190))
    })
  }

  const closeContextMenu = (): void => {
    setContextMenu(null)
    setLayerCreateMenu(null)
  }

  const openBackgroundLayerDialog = (): void => {
    setBackgroundLayerDialogOpen(true)
    closeContextMenu()
  }

  const openTilemapLayerDialog = (): void => {
    setTilemapLayerDialog({ mode: 'create' })
    closeContextMenu()
  }

  const openFreeTileLayerDialog = (): void => {
    setFreeTileLayerDialogOpen(true)
    closeContextMenu()
  }

  const layerCreationMenuItems = (): ReactNode => (
    <>
      <LayerContextMenuItem
        icon="plus"
        label={t('layers.new')}
        shortcut={shortcutHint('newLayer')}
        onClick={() => {
          void store.addLayer()
          closeContextMenu()
        }}
      />
      <LayerContextMenuItem
        icon="newFolder"
        label={t('layers.newGroup')}
        shortcut={shortcutHint('createLayerGroup')}
        onClick={() => {
          store.createLayerGroup()
          closeContextMenu()
        }}
      />
      <LayerContextMenuItem icon="tilemap" label={t('layers.newTilemap')} shortcut={shortcutHint('newTilemapLayer')} onClick={openTilemapLayerDialog} />
      <Tooltip
        className="layer-menu-tooltip"
        content={
          <>
            <strong>{t('layers.newFreeTile')}</strong>
            <span>{t('layers.newFreeTileDescription')}</span>
          </>
        }
      >
        <LayerContextMenuItem icon="freeTile" label={t('layers.newFreeTile')} shortcut={shortcutHint('newFreeTileLayer')} onClick={openFreeTileLayerDialog} />
      </Tooltip>
      <LayerContextMenuItem icon="image" label={t('layers.newBackground')} shortcut={shortcutHint('newBackgroundLayer')} onClick={openBackgroundLayerDialog} />
    </>
  )

  const openTilemapConversionDialog = (): void => {
    if (contextMenu?.kind !== 'layer') return
    setTilemapLayerDialog({ mode: 'convert', layerId: contextMenu.id })
    closeContextMenu()
  }

  const duplicateContextSelection = (): void => {
    store.duplicateSelectedLayerRows()
    closeContextMenu()
  }

  const deleteContextSelection = (): void => {
    store.deleteSelectedLayers()
    closeContextMenu()
  }

  const contextMenuPropertySelection = (): { source: LayerFormTarget | null; targets: LayerFormTarget[]; usesSelection: boolean } => {
    if (!contextMenu) return { source: null, targets: [], usesSelection: false }
    const source = { kind: contextMenu.kind, id: contextMenu.id } as LayerFormTarget
    return {
      source,
      targets: contextMenu.propertyTargets,
      usesSelection: contextMenu.propertyTargets.some((target) => target.kind === source.kind && target.id === source.id)
    }
  }

  const openProperties = (): void => {
    const selection = contextMenuPropertySelection()
    if (!selection.source || contextMenu?.propertySelectionIncludesUnsupported) return
    if (selection.targets.length > 1) {
      editSelectedRows(selection.targets)
      closeContextMenu()
      return
    }
    const source = selection.source
    if (source.kind === 'group') {
      const group = session.document.groups.find((item) => item.id === source.id)
      if (group) editGroup(group)
    } else {
      const layer = session.document.layers.find((item) => item.id === source.id)
      if (layer) editLayer(layer)
    }
    closeContextMenu()
  }

  const openLayerStyles = (): void => {
    if (!contextMenu) return
    const source = { kind: contextMenu.kind, id: contextMenu.id } as LayerFormTarget
    const selectedTargets = selectedRowsForProperties(session)
    const targets =
      selectedTargets.length > 1 && selectedTargets.some((target) => target.kind === source.kind && target.id === source.id) ? selectedTargets : [source]
    setLayerStyleDialog({ source, targets })
    closeContextMenu()
  }

  const contextMenuStyleTargets = contextMenu
    ? (() => {
        const source = { kind: contextMenu.kind, id: contextMenu.id } as LayerFormTarget
        const selectedTargets = selectedRowsForProperties(session)
        return selectedTargets.length > 1 && selectedTargets.some((target) => target.kind === source.kind && target.id === source.id)
          ? selectedTargets
          : [source]
      })()
    : []

  const copyContextLayerStyles = (): void => {
    if (contextMenu) store.copyLayerStyles(contextMenu.kind, contextMenu.id)
    closeContextMenu()
  }

  const pasteContextLayerStyles = (): void => {
    store.pasteLayerStyles(contextMenuStyleTargets)
    closeContextMenu()
  }

  const clearContextLayerStyles = (): void => {
    store.clearLayerStyles(contextMenuStyleTargets)
    closeContextMenu()
  }

  const contextMenuClippingMaskEnabled =
    contextMenu?.kind === 'layer'
      ? session.document.layers.find((layer) => layer.id === contextMenu.id)?.clippingMask === true
      : contextMenu?.kind === 'group'
        ? session.document.groups.find((group) => group.id === contextMenu.id)?.clippingMask === true
        : false

  const contextMenuLayer = contextMenu?.kind === 'layer' ? (session.document.layers.find((layer) => layer.id === contextMenu.id) ?? null) : null

  const contextMenuStyleOwner =
    contextMenu?.kind === 'layer'
      ? contextMenuLayer
      : contextMenu?.kind === 'group'
        ? (session.document.groups.find((group) => group.id === contextMenu.id) ?? null)
        : null

  const contextMenuOwnerHasStyles = hasConfiguredLayerStyles(contextMenuStyleOwner?.layerStyles)

  const contextMenuOwnerStylesEnabled = contextMenuOwnerHasStyles && hasEnabledLayerStyles(contextMenuStyleOwner?.layerStyles)

  const contextMenuSelectionHasStyles = contextMenuStyleTargets.some((target) => {
    const owner =
      target.kind === 'layer'
        ? session.document.layers.find((layer) => layer.id === target.id)
        : session.document.groups.find((group) => group.id === target.id)
    return hasConfiguredLayerStyles(owner?.layerStyles)
  })

  const contextMenuLayerHasStyles = Boolean(contextMenuLayer && hasConfiguredLayerStyles(contextMenuLayer.layerStyles))

  const contextMenuPropertyTargets = contextMenuPropertySelection()

  const contextMenuPropertiesDisabled = !contextMenuPropertyTargets.source || Boolean(contextMenu?.propertySelectionIncludesUnsupported)

  const toggleContextLayerStyles = (): void => {
    store.setLayerStylesEnabled(contextMenuStyleTargets, !contextMenuOwnerStylesEnabled)
    closeContextMenu()
  }

  const contextMenuCanConvertToBackground = Boolean(contextMenuLayer && !contextMenuLayer.kind && !contextMenuLayer.background)

  const contextMenuCanConvertToTilemap = Boolean(contextMenuLayer && !contextMenuLayer.kind && !contextMenuLayerHasStyles)

  const contextMenuCanConvertToRaster = Boolean(contextMenuLayer && (contextMenuLayer.background || contextMenuLayer.kind || contextMenuLayerHasStyles))

  const contextMenuCanCreateLinkedLayer = Boolean(contextMenuLayer && !contextMenuLayer.kind && !contextMenuLayer.background)

  const tilemapConversionLayer = tilemapLayerDialog?.mode === 'convert' ? (layerById.get(tilemapLayerDialog.layerId) ?? null) : null

  const contextMenuGroupMask = contextMenu?.kind === 'group' ? animationGroupMaskAt(timeline, contextMenu.id, timeline.activeFrameId) : null

  const contextMenuLayerMask = contextMenu?.kind === 'layer' ? animationMaskAt(timeline, contextMenu.id, timeline.activeFrameId) : null

  const contextMenuLayerMaskStatus = (() => {
    if (contextMenu?.kind !== 'layer') return { hasContent: false, canCreate: false }
    let hasContent = false
    let canCreate = false
    for (const cel of timeline.cels) {
      if (cel.layerId !== contextMenu.id) continue
      const source = celLookup.resolve(cel) ?? cel
      if (!animationCelHasContent(source, session.document.palette)) continue
      hasContent = true
      if (!animationMaskSlotAt(timeline, cel.layerId, cel.frameId)) canCreate = true
    }
    return { hasContent, canCreate }
  })()

  const layerStyleOwner =
    layerStyleDialog?.source.kind === 'layer'
      ? (session.document.layers.find((layer) => layer.id === layerStyleDialog.source.id) ?? null)
      : layerStyleDialog?.source.kind === 'group'
        ? (session.document.groups.find((group) => group.id === layerStyleDialog.source.id) ?? null)
        : null

  const layerStyleIndicatorTooltip = (
    <>
      <strong>{t('layers.layerStyle')}</strong>
      <span>{t('layers.layerStyleIndicatorDescription')}</span>
    </>
  )

  const beginLayerStyleDrag = (event: React.PointerEvent<HTMLElement>, target: LayerFormTarget): void => {
    event.preventDefault()
    event.stopPropagation()
    if (event.button !== 0 || !event.altKey) return
    const drag = { source: target, target: null, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, moved: false }
    layerStyleDragRef.current = drag
    setLayerStyleDrag(drag)
  }

  const openLayerStyleFromIndicator = (event: React.MouseEvent<HTMLElement>, target: LayerFormTarget): void => {
    event.preventDefault()
    event.stopPropagation()
    if (suppressLayerStyleClickRef.current) {
      suppressLayerStyleClickRef.current = false
      return
    }
    setLayerStyleDialog({ source: target, targets: [target] })
  }

  const layerStyleIndicator = (target: LayerFormTarget): ReactNode => (
    <Tooltip className="layer-status-icon-tooltip" content={layerStyleIndicatorTooltip}>
      <span
        className="layer-style-indicator"
        role="button"
        tabIndex={0}
        aria-label={t('layers.openLayerStyle')}
        onPointerDown={(event) => beginLayerStyleDrag(event, target)}
        onDoubleClick={(event) => event.stopPropagation()}
        onClick={(event) => openLayerStyleFromIndicator(event, target)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          event.stopPropagation()
          setLayerStyleDialog({ source: target, targets: [target] })
        }}
      >
        <PixelUtilityIcon kind="layerStyle" />
      </span>
    </Tooltip>
  )

  const toggleContextClippingMask = (): void => {
    if (!contextMenu) return
    store.setClippingMask(contextMenu.kind, contextMenu.id, !contextMenuClippingMaskEnabled)
    closeContextMenu()
  }
  const layerContextSurfaces = (
    <>
      {layerCreateMenu &&
        createPortal(
          <div
            className="layer-context-menu layer-create-context-menu"
            style={{ left: layerCreateMenu.x, top: layerCreateMenu.y }}
            role="menu"
            aria-label={t('layers.create')}
            onPointerDown={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.preventDefault()}
          >
            {layerCreationMenuItems()}
          </div>,
          document.body
        )}
      {contextMenu &&
        createPortal(
          <div
            className="layer-context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            role="menu"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div className={`menu-submenu layer-new-submenu ${contextMenu.x + 440 > window.innerWidth - 8 ? 'open-left' : ''}`}>
              <button type="button" className="menu-submenu-trigger" aria-haspopup="menu">
                <span className="layer-context-icon">
                  <PixelUtilityIcon kind="plus" />
                </span>
                <span className="menu-submenu-label">{t('layers.create')}</span>
                <span className="menu-submenu-arrow" aria-hidden="true">
                  <PixelUtilityIcon kind="right" />
                </span>
              </button>
              <div className="context-menu menu-popover menu-submenu-popover" role="menu" aria-label={t('layers.create')}>
                {layerCreationMenuItems()}
              </div>
            </div>
            <LayerContextMenuItem icon="copy" label={t('layers.duplicate')} shortcut={shortcutHint('duplicateLayer')} onClick={duplicateContextSelection} />
            {contextMenu.kind === 'layer' && (
              <Tooltip
                className="layer-menu-tooltip"
                content={
                  <>
                    <strong>{t('layers.createLinkedLayer')}</strong>
                    <span>{t('layers.linkedLayerDescription')}</span>
                  </>
                }
              >
                <LayerContextMenuItem
                  icon="linkedLayer"
                  label={t('layers.createLinkedLayer')}
                  shortcut={shortcutHint('createLinkedLayer')}
                  disabled={!contextMenuCanCreateLinkedLayer}
                  onClick={() => {
                    store.createLinkedLayer(contextMenu.id)
                    closeContextMenu()
                  }}
                />
              </Tooltip>
            )}
            {contextMenu.kind === 'layer' && contextMenuLayer && (
              <div className={`menu-submenu layer-new-submenu ${contextMenu.x + 440 > window.innerWidth - 8 ? 'open-left' : ''}`}>
                <button type="button" className="menu-submenu-trigger" aria-haspopup="menu">
                  <span className="layer-context-icon">
                    <PixelUtilityIcon kind="convertTo" />
                  </span>
                  <span className="menu-submenu-label">{t('layers.convertTo')}</span>
                  <span className="menu-submenu-arrow" aria-hidden="true">
                    <PixelUtilityIcon kind="right" />
                  </span>
                </button>
                <div className="context-menu menu-popover menu-submenu-popover" role="menu" aria-label={t('layers.convertTo')}>
                  <Tooltip
                    className="layer-menu-tooltip"
                    content={
                      <>
                        <strong>{t('layers.convertToBackground')}</strong>
                        <span>{t('layers.backgroundDescription')}</span>
                      </>
                    }
                  >
                    <LayerContextMenuItem
                      icon="image"
                      label={t('layers.convertToBackground')}
                      shortcut={shortcutHint('convertLayerToBackground')}
                      disabled={!contextMenuCanConvertToBackground}
                      onClick={() => {
                        store.setLayerBackground(contextMenu.id, true)
                        closeContextMenu()
                      }}
                    />
                  </Tooltip>
                  <Tooltip
                    className="layer-menu-tooltip"
                    content={
                      <>
                        <strong>{t('layers.convertToTilemap')}</strong>
                        <span>{t('layers.convertTilemapDialogDescription')}</span>
                      </>
                    }
                  >
                    <LayerContextMenuItem
                      icon="tilemap"
                      label={t('layers.convertToTilemap')}
                      shortcut={shortcutHint('convertLayerToTilemap')}
                      disabled={!contextMenuCanConvertToTilemap}
                      onClick={openTilemapConversionDialog}
                    />
                  </Tooltip>
                  <Tooltip
                    className="layer-menu-tooltip"
                    content={
                      <>
                        <strong>{t('layers.convertToRaster')}</strong>
                        <span>{t('layers.rasterizeLayerDescription')}</span>
                      </>
                    }
                  >
                    <LayerContextMenuItem
                      icon="image"
                      label={t('layers.convertToRaster')}
                      shortcut={shortcutHint('convertLayerToRaster')}
                      disabled={!contextMenuCanConvertToRaster}
                      onClick={() => {
                        store.rasterizeLayer(contextMenu.id)
                        closeContextMenu()
                      }}
                    />
                  </Tooltip>
                </div>
              </div>
            )}
            {contextMenu.kind === 'layer' && (
              <LayerContextMenuItem
                icon="mergeDown"
                label={t(session.selectedLayerIds.length > 1 ? 'app.menu.layer.mergeSelected' : 'app.menu.layer.mergeDown')}
                shortcut={shortcutHint(session.selectedLayerIds.length > 1 ? 'mergeSelectedLayers' : 'mergeLayerDown')}
                onClick={() => {
                  session.selectedLayerIds.length > 1 ? store.mergeSelectedLayers() : store.mergeActiveLayerDown()
                  closeContextMenu()
                }}
              />
            )}
            {contextMenu.kind === 'group' && (
              <>
                <LayerContextMenuItem
                  icon="folderOpen"
                  label={t('layers.expandCollapseGroup')}
                  onClick={() => {
                    store.toggleGroupCollapsed(contextMenu.id)
                    closeContextMenu()
                  }}
                />
                <LayerContextMenuItem
                  icon="mergeDown"
                  label={t('app.menu.layer.mergeGroup')}
                  shortcut={shortcutHint('mergeLayerGroup')}
                  onClick={() => {
                    store.mergeSelectedGroup()
                    closeContextMenu()
                  }}
                />
                <LayerContextMenuItem
                  icon="ungroupFolder"
                  label={t('app.menu.layer.ungroup')}
                  shortcut={shortcutHint('ungroupLayers')}
                  onClick={() => {
                    store.ungroupSelected()
                    closeContextMenu()
                  }}
                />
              </>
            )}
            <LayerContextMenuItem
              icon="mergeVisible"
              label={t('app.menu.layer.mergeVisible')}
              shortcut={shortcutHint('mergeVisibleLayers')}
              onClick={() => {
                store.mergeVisibleLayers()
                closeContextMenu()
              }}
            />
            <span className="context-menu-divider" role="separator" />
            <Tooltip className="layer-menu-tooltip" content={clippingMaskTooltip}>
              <LayerContextMenuItem
                icon="clippingMask"
                label={t(contextMenuClippingMaskEnabled ? 'layers.disableClippingMask' : 'layers.enableClippingMask')}
                shortcut={shortcutHint('toggleClippingMask')}
                onClick={toggleContextClippingMask}
              />
            </Tooltip>
            {contextMenu.kind === 'layer' && (
              <Tooltip className="layer-menu-tooltip" content={contextMenuLayerMaskStatus.hasContent ? layerMaskTooltip : emptyLayerMaskCelTooltip}>
                <LayerContextMenuItem
                  icon="layerMask"
                  label={t('layers.createLayerMask')}
                  shortcut={shortcutHint('toggleLayerMask')}
                  disabled={!contextMenuLayerMaskStatus.canCreate}
                  onClick={() => {
                    store.createLayerMasksForLayer(contextMenu.id)
                    closeContextMenu()
                  }}
                />
              </Tooltip>
            )}
            {contextMenu.kind === 'layer' && contextMenuLayerMask && (
              <LayerContextMenuItem
                icon="link"
                label={t(contextMenuLayerMask.moveWithOwner === false ? 'layers.enableLayerMaskMoveBinding' : 'layers.disableLayerMaskMoveBinding')}
                onClick={() => {
                  store.setLayerMaskMoveWithOwner(contextMenu.id, contextMenuLayerMask.moveWithOwner === false)
                  closeContextMenu()
                }}
              />
            )}
            {contextMenu.kind === 'group' && (
              <Tooltip className="layer-menu-tooltip" content={layerMaskTooltip}>
                <LayerContextMenuItem
                  icon="layerMask"
                  label={t(contextMenuGroupMask ? 'layers.deleteLayerGroupMask' : 'layers.createLayerGroupMask')}
                  shortcut={shortcutHint('toggleGroupMask')}
                  onClick={() => {
                    if (contextMenuGroupMask) store.deleteGroupMask(contextMenu.id, timeline.activeFrameId)
                    else store.createGroupMask(contextMenu.id, timeline.activeFrameId)
                    closeContextMenu()
                  }}
                />
              </Tooltip>
            )}
            {contextMenu.kind === 'group' && contextMenuGroupMask && (
              <LayerContextMenuItem
                icon="link"
                label={t(contextMenuGroupMask.moveWithOwner === false ? 'layers.enableLayerMaskMoveBinding' : 'layers.disableLayerMaskMoveBinding')}
                onClick={() => {
                  store.setGroupMaskMoveWithOwner(contextMenu.id, timeline.activeFrameId, contextMenuGroupMask.moveWithOwner === false)
                  closeContextMenu()
                }}
              />
            )}
            <span className="context-menu-divider" role="separator" />
            <LayerContextMenuItem icon="layerStyle" label={t('layers.layerStyle')} shortcut={shortcutHint('openLayerStyles')} onClick={openLayerStyles} />
            {contextMenu.kind === 'layer' && (
              <LayerContextMenuItem
                icon="layerStyle"
                label={t('layers.splitLayerStyles')}
                disabled={!contextMenuOwnerStylesEnabled || contextMenuStyleOwner?.locked === true}
                onClick={() => {
                  store.splitLayerStyles(contextMenu.id)
                  closeContextMenu()
                }}
              />
            )}
            {contextMenuOwnerHasStyles && (
              <LayerContextMenuItem
                icon={contextMenuOwnerStylesEnabled ? 'eyeOff' : 'eye'}
                label={t(contextMenuOwnerStylesEnabled ? 'layers.disableLayerStyles' : 'layers.enableLayerStyles')}
                shortcut={shortcutHint('toggleLayerStyles')}
                onClick={toggleContextLayerStyles}
              />
            )}
            <LayerContextMenuItem
              icon="copy"
              label={t('layers.copyLayerStyle')}
              shortcut={shortcutHint('copyLayerStyles')}
              disabled={!contextMenuOwnerHasStyles}
              onClick={copyContextLayerStyles}
            />
            <LayerContextMenuItem
              icon="paste"
              label={t('layers.pasteLayerStyle')}
              shortcut={shortcutHint('pasteLayerStyles')}
              disabled={!layerStyleClipboard}
              onClick={pasteContextLayerStyles}
            />
            <LayerContextMenuItem
              icon="clearRecords"
              label={t('layers.clearLayerStyle')}
              shortcut={shortcutHint('clearLayerStyles')}
              disabled={!contextMenuSelectionHasStyles}
              onClick={clearContextLayerStyles}
            />
            <span className="context-menu-divider" role="separator" />
            <LayerContextMenuItem
              icon="properties"
              label={t('layers.properties')}
              shortcut={shortcutHint('openLayerProperties')}
              disabled={contextMenuPropertiesDisabled}
              onClick={openProperties}
            />
            <LayerContextMenuItem icon="delete" label={t('common.delete')} shortcut={shortcutHint('deleteLayer')} onClick={deleteContextSelection} danger />
          </div>,
          document.body
        )}
      {backgroundLayerDialogOpen &&
        createPortal(
          <BackgroundLayerDialog onClose={() => setBackgroundLayerDialogOpen(false)} onCreate={(pattern) => store.createBackgroundLayer(pattern)} />,
          document.body
        )}
      {tilemapLayerDialog &&
        (tilemapLayerDialog.mode === 'create' || tilemapConversionLayer) &&
        createPortal(
          <TilemapLayerDialog
            documentWidth={session.document.width}
            documentHeight={session.document.height}
            mode={tilemapLayerDialog.mode}
            initialName={tilemapConversionLayer?.name}
            tilesets={availableTilemapTilesets}
            onClose={() => setTilemapLayerDialog(null)}
            onConfirm={(options) =>
              tilemapLayerDialog.mode === 'create' ? store.createTilemapLayer(options) : store.convertLayerToTilemap(tilemapLayerDialog.layerId, options)
            }
          />,
          document.body
        )}
      {freeTileLayerDialogOpen &&
        createPortal(
          <FreeTileLayerDialog sets={freeTileSetOptions} onClose={() => setFreeTileLayerDialogOpen(false)} onConfirm={store.createFreeTileLayer} />,
          document.body
        )}
      <LayerPropertyEditor
        key={session.document.id}
        ref={propertyEditorRef}
        documentId={session.document.id}
        layerDisplayColorPresets={layerDisplayColorPresets}
      />
      {layerStyleDialog && layerStyleOwner && (
        <LayerStyleDialog
          key={`${layerStyleDialog.source.kind}:${layerStyleDialog.source.id}:${layerStyleDialog.targets.map((target) => `${target.kind}:${target.id}`).join('|')}`}
          ownerKind={layerStyleDialog.source.kind}
          owner={layerStyleOwner}
          targets={layerStyleDialog.targets}
          onClose={() => setLayerStyleDialog(null)}
        />
      )}
    </>
  )

  return {
    layerContextSurfaces,
    propertyEditorRef,
    setContextMenu,
    setLayerCreateMenu,
    setBackgroundLayerDialogOpen,
    setTilemapLayerDialog,
    setFreeTileLayerDialogOpen,
    setLayerStyleDialog,
    layerStyleDrag,
    editLayer,
    editGroup,
    editSelectedRows,
    editLayerRow,
    editGroupRow,
    openLayerContextMenu,
    openLayerCreateContextMenu,
    openBackgroundLayerDialog,
    openTilemapLayerDialog,
    openFreeTileLayerDialog,
    layerStyleIndicator
  }
}
