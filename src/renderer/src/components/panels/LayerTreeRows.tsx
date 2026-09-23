import { memo } from 'react'
import { hasConfiguredLayerStyles } from '@/core/layer-styles'
import { LayerTreeRow } from './LayerTreeRow'
import type { LayerTreeRowsProps } from './layer-tree-row-types'
import { useLayerTreeRowActions } from './useLayerTreeRowActions'

interface RowProps {
  panel: LayerTreeRowsProps
  rowIndex: number
  renderKey: string | null
}

const CachedRow = memo(function CachedRow({ panel, rowIndex }: RowProps) {
  return <LayerTreeRow panel={panel} displayRow={panel.displayRows[rowIndex]} rowIndex={rowIndex} />
}, (previous, next) => next.renderKey !== null && previous.renderKey === next.renderKey && previous.panel.t === next.panel.t)

/** Cache ordinary raster row controls; pixels and another row's focus are not row UI. */
function rasterRowRenderKey(panel: LayerTreeRowsProps, rowIndex: number): string | null {
  const row = panel.displayRows[rowIndex]
  if (row.kind === 'mask' || row.node.kind !== 'layer') return null
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

export function LayerTreeRows(props: LayerTreeRowsProps) {
  const actions = useLayerTreeRowActions(props)
  const panel = { ...props, ...actions }
  return <>{' '}{panel.displayRows.map((row, rowIndex) => <CachedRow
    key={row.kind === 'mask' ? `mask:${row.ownerKind}:${row.owner.id}` : row.node.kind === 'group' ? `group:${row.node.group.id}` : `layer:${row.node.layer.id}`}
    panel={panel} rowIndex={rowIndex} renderKey={rasterRowRenderKey(panel, rowIndex)}
  />)}</>
}
