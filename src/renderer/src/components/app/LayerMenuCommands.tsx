import type { ReactNode } from 'react'
import { MenuItemButton } from '@/components/MenuItemButton'
import { PixelRightIcon } from '@/components/PixelUtilityIcon'
import { useI18n } from '@/components/I18nProvider'
import { createGradientMapLayerAndEdit } from '@/components/gradient-map-layer-dialog'
import { selectedRowsForProperties, hasUnsupportedPropertySelection } from '@/components/panels/layer-panel-selection'
import { layerContextMaskStatus } from '@/components/panels/layer-context-mask-status'
import { animationGroupMaskAt, createAnimationCelLookup } from '@/core/animation'
import { animationMaskAt } from '@/core/document-model'
import { hasConfiguredLayerStyles, hasEnabledLayerStyles } from '@/core/layer-styles'
import type { ShortcutId } from '@/core/shortcuts'
import { useWorkspace } from '@/store/workspace'

export function LayerMenuCommands({ shortcutFor, closeMenu, onPanelCommand }: {
  shortcutFor: (id: ShortcutId) => string
  closeMenu: () => void
  onPanelCommand: (id: ShortcutId) => void
}) {
  const { t } = useI18n()
  // Mounted only while the menu is open; reflect selection and clipboard changes.
  const sessions = useWorkspace(state => state.sessions)
  const activeId = useWorkspace(state => state.activeId)
  const session = sessions.find(item => item.document.id === activeId) ?? null
  const styleClipboard = useWorkspace(state => state.layerStyleClipboard)
  const store = useWorkspace.getState()
  const targets = session ? selectedRowsForProperties(session) : []
  const primary = targets[0]
  const ownerFor = (target: typeof primary) => target?.kind === 'group'
    ? session?.document.groups.find(group => group.id === target.id)
    : session?.document.layers.find(layer => layer.id === target?.id)
  const owner = ownerFor(primary)
  const single = targets.length === 1
  const layer = single && primary?.kind === 'layer' ? session?.document.layers.find(item => item.id === primary.id) : null
  const group = single && primary?.kind === 'group' ? session?.document.groups.find(item => item.id === primary.id) : null
  const unsupported = Boolean(session && hasUnsupportedPropertySelection(session))
  const hasTargets = targets.length > 0 && !unsupported
  const hasStyles = hasConfiguredLayerStyles(owner?.layerStyles)
  const stylesEnabled = hasStyles && hasEnabledLayerStyles(owner?.layerStyles)
  const selectionHasStyles = targets.some(target => hasConfiguredLayerStyles(ownerFor(target)?.layerStyles))
  const stylesSupported = hasTargets && !targets.some(target => target.kind === 'layer' && session?.document.layers.find(item => item.id === target.id)?.kind === 'adjustment')
  const timeline = session?.document.animation
  const maskStatus = session && timeline && layer
    ? layerContextMaskStatus(session, timeline, createAnimationCelLookup(timeline), layer.id)
    : { canCreate: false }
  const layerMask = timeline && layer ? animationMaskAt(timeline, layer.id, timeline.activeFrameId) : null
  const groupMask = timeline && group ? animationGroupMaskAt(timeline, group.id, timeline.activeFrameId) : null
  const mask = layerMask ?? groupMask
  const plainLayer = Boolean(layer && !layer.kind && !layer.background)
  const canMergeDown = Boolean(layer && session && session.document.layers
    .filter(item => (item.groupId ?? null) === (layer.groupId ?? null))
    .findIndex(item => item.id === layer.id) > 0)
  const item = (label: string, run: () => void, id?: ShortcutId, disabled = false) => <MenuItemButton
    disabled={!session || disabled}
    onClick={() => { run(); closeMenu() }}
  >{label}{id && shortcutFor(id) && <kbd>{shortcutFor(id)}</kbd>}</MenuItemButton>
  const panelItem = (label: string, id: ShortcutId, disabled = false) => item(label, () => onPanelCommand(id), id, disabled)
  const submenu = (label: string, children: ReactNode, disabled = false) => <div className="menu-submenu">
    <MenuItemButton className="menu-submenu-trigger" aria-haspopup="menu" disabled={!session || disabled}>
      <span className="menu-submenu-label">{label}</span><span className="menu-submenu-arrow" aria-hidden="true"><PixelRightIcon /></span>
    </MenuItemButton>
    <div className="menu-popover menu-submenu-popover">{children}</div>
  </div>
  return <>
    {submenu(t('layers.create'), <>
      {item(t('layers.new'), () => { void store.addLayer() }, 'newLayer')}
      {item(t('layers.newGroup'), store.createLayerGroup, 'createLayerGroup')}
      <span className="menu-divider" />
      {item(t('gradientMap.adjustmentLayer'), () => { void createGradientMapLayerAndEdit() })}
      {panelItem(t('layers.newTilemap'), 'newTilemapLayer')}
      {panelItem(t('layers.newFreeTile'), 'newFreeTileLayer')}
      {panelItem(t('layers.newBackground'), 'newBackgroundLayer')}
    </>)}
    {item(t('layers.duplicate'), store.duplicateSelectedLayerRows, 'duplicateLayer', !hasTargets)}
    {item(t('layers.createLinkedLayer'), () => { if (layer) store.createLinkedLayer(layer.id) }, 'createLinkedLayer', !plainLayer || unsupported)}
    {submenu(t('layers.convertTo'), <>
      {item(t('layers.convertToBackground'), () => { if (layer) store.setLayerBackground(layer.id, true) }, 'convertLayerToBackground', !plainLayer || unsupported)}
      {panelItem(t('layers.convertToTilemap'), 'convertLayerToTilemap', !plainLayer || hasStyles || unsupported)}
      {item(t('layers.convertToRaster'), () => { if (layer) store.rasterizeLayer(layer.id) }, 'convertLayerToRaster', !layer || layer.kind === 'adjustment' || !(layer.background || layer.kind || hasStyles) || unsupported)}
    </>, !layer || unsupported)}
    <span className="menu-divider" />
    {item(t('app.menu.layer.mergeDown'), store.mergeActiveLayerDown, 'mergeLayerDown', !canMergeDown || unsupported)}
    {item(t('app.menu.layer.mergeSelected'), store.mergeSelectedLayers, 'mergeSelectedLayers', !hasTargets || targets.length < 2 || targets.some(target => target.kind === 'group'))}
    {item(t('app.menu.layer.mergeGroup'), store.mergeSelectedGroup, 'mergeLayerGroup', !group || unsupported)}
    {item(t('app.menu.layer.mergeVisible'), store.mergeVisibleLayers, 'mergeVisibleLayers', (session?.document.layers.length ?? 0) < 2)}
    {item(t('app.menu.layer.ungroup'), store.ungroupSelected, 'ungroupLayers', !group || unsupported)}
    {item(t('layers.expandCollapseGroup'), () => { if (group) store.toggleGroupCollapsed(group.id) }, 'toggleSelectedGroupCollapsed', !group || unsupported)}
    <span className="menu-divider" />
    {item(t(owner?.clippingMask ? 'layers.disableClippingMask' : 'layers.enableClippingMask'), () => { if (primary) store.setClippingMask(primary.kind, primary.id, !owner?.clippingMask) }, 'toggleClippingMask', !hasTargets || !single)}
    {group
      ? item(t(groupMask ? 'layers.deleteLayerGroupMask' : 'layers.createLayerGroupMask'), () => {
        if (!timeline) return
        if (groupMask) store.deleteGroupMask(group.id, timeline.activeFrameId)
        else store.createGroupMask(group.id, timeline.activeFrameId)
      }, 'toggleGroupMask', unsupported || !timeline)
      : item(t('layers.createLayerMask'), () => { if (layer) store.createLayerMasksForLayer(layer.id) }, 'toggleLayerMask', !layer || !maskStatus.canCreate || unsupported)}
    {mask && item(t(mask.moveWithOwner === false ? 'layers.enableLayerMaskMoveBinding' : 'layers.disableLayerMaskMoveBinding'), () => {
      if (layer) store.setLayerMaskMoveWithOwner(layer.id, mask.moveWithOwner === false)
      else if (group && timeline) store.setGroupMaskMoveWithOwner(group.id, timeline.activeFrameId, mask.moveWithOwner === false)
    }, undefined, unsupported)}
    <span className="menu-divider" />
    {submenu(t('layers.layerStyle'), <>
      {panelItem(t('layers.openLayerStyle'), 'openLayerStyles', !stylesSupported)}
      {item(t(stylesEnabled ? 'layers.disableLayerStyles' : 'layers.enableLayerStyles'), () => store.setLayerStylesEnabled(targets, !stylesEnabled), 'toggleLayerStyles', !stylesSupported || !hasStyles)}
      {item(t('layers.splitLayerStyles'), () => { if (layer) store.splitLayerStyles(layer.id) }, undefined, !stylesSupported || !layer || !stylesEnabled || Boolean(layer.locked))}
      <span className="menu-divider" />
      {item(t('layers.copyLayerStyle'), () => { if (primary) store.copyLayerStyles(primary.kind, primary.id) }, 'copyLayerStyles', !stylesSupported || !hasStyles)}
      {item(t('layers.pasteLayerStyle'), () => store.pasteLayerStyles(targets), 'pasteLayerStyles', !stylesSupported || !styleClipboard)}
      {item(t('layers.clearLayerStyle'), () => store.clearLayerStyles(targets), 'clearLayerStyles', !stylesSupported || !selectionHasStyles)}
    </>, !stylesSupported)}
    <span className="menu-divider" />
    {panelItem(t('layers.properties'), 'openLayerProperties', !hasTargets)}
    {item(t('common.delete'), store.deleteSelectedLayers, 'deleteLayer', !hasTargets)}
  </>
}
