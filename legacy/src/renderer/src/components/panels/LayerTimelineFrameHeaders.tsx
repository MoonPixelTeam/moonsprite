import type { ReactNode } from 'react'
import type { LayerTimelineCellsProps } from './layer-timeline-cell-types'
import { useLayerTimelineCellWindow } from './use-layer-timeline-cell-window'

type Props = Pick<LayerTimelineCellsProps, 'timeline' | 'displayRows' | 'timelineViewportRef'> & {
  renderHeader: (frame: LayerTimelineCellsProps['timeline']['frames'][number], index: number) => ReactNode
}

/** Horizontal scrolling updates only these titles, without rerendering the
 * layer tree, selection derivation and complete panel on every window change. */
export function LayerTimelineFrameHeaders(props: Props) {
  const window = useLayerTimelineCellWindow(props)
  if (!window) return null
  return <>{props.timeline.frames.slice(window.frameStart, window.frameEnd)
    .map((frame, offset) => props.renderHeader(frame, window.frameStart + offset))}</>
}
