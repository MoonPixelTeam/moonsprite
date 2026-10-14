import { memo, useRef } from 'react'
import { hasConfiguredLayerStyles } from '@/core/layer-styles'
import { getGroupLockingAncestor } from '@/core/document-model'
import { getLayerPanelAncestorGroupIds } from '@/core/layer-panel-layout'
import { LayerTreeRow } from './LayerTreeRow'
import type { LayerTreeRowsProps } from './layer-tree-row-types'
import { useLayerTreeRowActions } from './useLayerTreeRowActions'
import { timelineCellElement, type TimelineCellElementCache } from './timeline-cell-element-cache'

interface RowProps {
  read: () => {panel: LayerTreeRowsProps; rowIndex: number}
  renderKey: string | null
}

// Keep each render's snapshot behind a reader: passing the entire panel to
// every row makes React dev diagnostics compare the full timeline per row.
const CachedRow = memo(function CachedRow({read}: RowProps) {
  const {panel, rowIndex} = read()
  return <LayerTreeRow read={() => ({panel, displayRow: panel.displayRows[rowIndex], rowIndex})} />
}, (previous, next) => next.renderKey !== null && previous.renderKey === next.renderKey && previous.read().panel.t === next.read().panel.t)

/** Cache ordinary raster row controls; pixels and another row's focus are not row UI. */
function rowRenderKey(panel: LayerTreeRowsProps, rowIndex: number): string | null {
  const row = panel.displayRows[rowIndex]
  if (row.kind === 'mask') return null
  if (row.node.kind === 'group') {
    const group = row.node.group
    // Styled and mask rows keep their existing complete render path.
    if (hasConfiguredLayerStyles(group.layerStyles)) return null
    const visual = panel.timelineVisualState.rows[rowIndex]
    const ownerKey = `group:${group.id}`
    const drop = panel.dropTarget && 'id' in panel.dropTarget && panel.dropTarget.id === group.id ? panel.dropTarget : null
    const lockingAncestor = getGroupLockingAncestor(panel.session.document, group)
    const inheritedHidden = getLayerPanelAncestorGroupIds(panel.session.document.groups, group.parentGroupId)
      .some(id => panel.session.document.groups.find(candidate => candidate.id === id)?.visible === false)
    return JSON.stringify([
      panel.thumbnailSize, panel.session.document.id, panel.session.layersPanelRevision ?? panel.session.revision,
      group.id, rowIndex, row.node.depth, group.name, group.description, group.visible, group.locked,
      group.opacity, group.blendMode, group.clippingMask, panel.session.collapsedGroupIds.includes(group.id),
      lockingAncestor?.id, lockingAncestor?.name, inheritedHidden,
      panel.displayColorStripeSegments(group, 'group', row.node.depth),
      Boolean((visual?.active && panel.activeMaskOwnerKey !== ownerKey) || (panel.thumbnailSize && panel.activeMaskOwnerKey === ownerKey)),
      panel.timelineVisualState.selectionGuidesVisible && visual?.selected === true
        && ((panel.effectiveSelectedGroupIds.length > 0 && !panel.hasNonRowAnimationItemSelection) || panel.layerSelectionActive),
      panel.draggingGroupId === group.id, drop?.kind, drop?.kind === 'above-group' ? drop.insertAfter : null,
      panel.layerStyleDrag?.target?.kind === 'group' && panel.layerStyleDrag.target.id === group.id
    ])
  }
  const layer = row.node.layer
  if (layer.kind || hasConfiguredLayerStyles(layer.layerStyles)) return null
  const visual = panel.timelineVisualState.rows[rowIndex]
  const drop = panel.dropTarget?.kind === 'layer' && panel.dropTarget.id === layer.id ? panel.dropTarget : null
  const styleDrop = panel.layerStyleDrag?.target
  return JSON.stringify([
    panel.thumbnailSize,
    Boolean(panel.thumbnailSize && panel.activeMaskOwnerKey === `layer:${layer.id}`),
    panel.session.document.id, panel.session.layersPanelRevision ?? panel.session.revision,
    layer.id, rowIndex, row.node.depth, layer.name, layer.description, layer.visible, layer.locked,
    layer.opacity, layer.blendMode, layer.background, layer.linkedContentId, layer.clippingMask,
    layer.displayColor, panel.liveAutoLinkById.get(layer.id) === true,
    !panel.maskVisualSelectionActive && visual?.active === true && panel.activeMaskOwnerKey !== `layer:${layer.id}`,
    panel.timelineVisualState.selectionGuidesVisible && panel.layerSelectionActive && visual?.selected === true,
    !panel.maskVisualSelectionActive && panel.ordinaryCelSelectionVisible && visual?.selectedByCell === true,
    panel.draggingIds.includes(layer.id), drop?.insertAfter,
    styleDrop?.kind === 'layer' && styleDrop.id === layer.id
  ])
}

export function LayerTreeRows({read}: {read: () => LayerTreeRowsProps}) {
  const props = read()
  const actions = useLayerTreeRowActions(props)
  const panel = { ...props, ...actions }
  const previous = useRef<TimelineCellElementCache>(new Map())
  const next: TimelineCellElementCache = new Map()
  const elements = panel.displayRows.map((row, rowIndex) => {
    const key = row.kind === 'mask' ? `mask:${row.ownerKind}:${row.owner.id}` : row.node.kind === 'group' ? `group:${row.node.group.id}` : `layer:${row.node.layer.id}`
    const renderKey = rowRenderKey(panel, rowIndex)
    // Skip both JSX allocation and React reconciliation for unchanged rows.
    // The action proxies continue to read the latest committed panel.
    return timelineCellElement(previous.current, next, key, renderKey === null ? null : [panel.t, renderKey],
      () => <CachedRow key={key} read={() => ({panel, rowIndex})} renderKey={renderKey} />)
  })
  previous.current = next
  return <>{' '}{elements}</>
}
