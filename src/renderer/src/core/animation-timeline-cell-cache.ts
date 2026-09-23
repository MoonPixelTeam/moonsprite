import type { AnimationTimelineVisualTopology } from './animation-timeline-visual-topology'
import type { TimelineVisualCellState } from './animation-timeline-visual-state'

/** Optional allocation cache owned by one immutable timeline topology. */
export function createTimelineVisualCellCache(topology: AnimationTimelineVisualTopology) {
  return { topology, signatures: new Uint16Array(topology.slots.length), states: new Array<TimelineVisualCellState | undefined>(topology.slots.length) }
}

export type TimelineVisualCellCache = ReturnType<typeof createTimelineVisualCellCache>
