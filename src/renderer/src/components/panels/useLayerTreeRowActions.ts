import { useLayoutEffect, useMemo, useRef } from 'react'
import type { LayerTreeRowsProps } from './layer-tree-row-types'

/** Cached row markup must still dispatch through the latest selection/gesture. */
export function useLayerTreeRowActions(panel: LayerTreeRowsProps) {
  const latest = useRef(panel)
  useLayoutEffect(() => { latest.current = panel })
  return useMemo(() => ({
    onMaskContextMenu: ((...args) => latest.current.onMaskContextMenu?.(...args)) as NonNullable<LayerTreeRowsProps['onMaskContextMenu']>,
    beginLayerDrag: ((event, id) => latest.current.beginLayerDrag(event, id)) as LayerTreeRowsProps['beginLayerDrag'],
    editLayerRow: ((layer) => {
      const current = latest.current.session.document.layers.find((item) => item.id === layer.id)
      if (current) latest.current.editLayerRow(current)
    }) as LayerTreeRowsProps['editLayerRow'],
    beginLayerPanelToggle: ((...args) => latest.current.beginLayerPanelToggle(...args)) as LayerTreeRowsProps['beginLayerPanelToggle'],
    continueLayerPanelToggle: ((...args) => latest.current.continueLayerPanelToggle(...args)) as LayerTreeRowsProps['continueLayerPanelToggle'],
    endLayerPanelToggle: ((...args) => latest.current.endLayerPanelToggle(...args)) as LayerTreeRowsProps['endLayerPanelToggle'],
    finishLayerPanelToggleClick: ((...args) => latest.current.finishLayerPanelToggleClick(...args)) as LayerTreeRowsProps['finishLayerPanelToggleClick'],
    handleLayerAutoLinkPointerDown: ((...args) => latest.current.handleLayerAutoLinkPointerDown(...args)) as LayerTreeRowsProps['handleLayerAutoLinkPointerDown'],
    continueLayerAutoLinkToggle: ((...args) => latest.current.continueLayerAutoLinkToggle(...args)) as LayerTreeRowsProps['continueLayerAutoLinkToggle'],
    endLayerAutoLinkToggle: ((...args) => latest.current.endLayerAutoLinkToggle(...args)) as LayerTreeRowsProps['endLayerAutoLinkToggle'],
    finishLayerAutoLinkClick: ((...args) => latest.current.finishLayerAutoLinkClick(...args)) as LayerTreeRowsProps['finishLayerAutoLinkClick'],
    handleLayerAutoLinkKeyDown: ((...args) => latest.current.handleLayerAutoLinkKeyDown(...args)) as LayerTreeRowsProps['handleLayerAutoLinkKeyDown']
  }), [])
}
