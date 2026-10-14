import { useLayoutEffect, useMemo, useRef } from 'react'
import type { LayerTimelineCellsProps } from './layer-timeline-cell-types'

/** A memoized cell must dispatch through the latest selection and gesture. */
export function useTimelineCellActions(panel: LayerTimelineCellsProps) {
  const latest = useRef(panel)
  useLayoutEffect(() => { latest.current = panel })
  return useMemo(() => ({
    beginAnimationCelDrag: ((...args) => latest.current.beginAnimationCelDrag(...args)) as LayerTimelineCellsProps['beginAnimationCelDrag'],
    beginAnimationMaskDrag: ((...args) => latest.current.beginAnimationMaskDrag(...args)) as LayerTimelineCellsProps['beginAnimationMaskDrag'],
    beginAnimationGroupCelDrag: ((...args) => latest.current.beginAnimationGroupCelDrag(...args)) as LayerTimelineCellsProps['beginAnimationGroupCelDrag'],
    updateAnimationItemCursor: ((...args) => latest.current.updateAnimationItemCursor(...args)) as LayerTimelineCellsProps['updateAnimationItemCursor'],
    openCelMenu: ((...args) => latest.current.openCelMenu(...args)) as LayerTimelineCellsProps['openCelMenu'],
    openCelProperties: ((...args) => latest.current.openCelProperties(...args)) as LayerTimelineCellsProps['openCelProperties'],
    animationGestures: {
      clickSuppressed: () => latest.current.animationGestures.clickSuppressed(),
      hitsSelectionOutline: ((...args) => latest.current.animationGestures.hitsSelectionOutline(...args)) as LayerTimelineCellsProps['animationGestures']['hitsSelectionOutline'],
      beginAnimationFrameDrag: ((...args) => latest.current.animationGestures.beginAnimationFrameDrag(...args)) as LayerTimelineCellsProps['animationGestures']['beginAnimationFrameDrag']
    }
  }), [])
}
