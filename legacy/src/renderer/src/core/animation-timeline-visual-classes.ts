import type {
  TimelineVisualCellState,
  TimelineVisualColumnState,
  TimelineVisualFrameState,
  TimelineVisualRowState,
} from './animation-timeline-visual-state'
import type { TimelineRowRef } from './animation-timeline-identity'

export interface TimelineVisualClassFlags {
  active: boolean
  selected: boolean
  current: boolean
  selectedByFrame: boolean
  selectedByRow: boolean
  frameActive: boolean
  frameSelected: boolean
  outlineVisible: boolean
}

export type TimelineVisualDto = TimelineVisualRowState | TimelineVisualCellState

export const timelineRowVisualClasses = (
  state: TimelineVisualRowState | undefined,
  guidesVisible: boolean,
  activeRow?: TimelineRowRef | null,
): TimelineVisualClassFlags => ({
  active: activeRow
    ? state?.row.kind === activeRow.kind && state.row.ownerKind === activeRow.ownerKind && state.row.ownerId === activeRow.ownerId
    : state?.active === true,
  selected: guidesVisible && state?.selected === true,
  current: false,
  selectedByFrame: state?.selectedByFrame === true,
  selectedByRow: state?.selectedByCell === true,
  frameActive: false,
  frameSelected: false,
  outlineVisible: guidesVisible && state?.selected === true,
})

export const timelineCellVisualClasses = (
  state: TimelineVisualCellState | undefined,
  frame: TimelineVisualFrameState | TimelineVisualColumnState | undefined,
  guidesVisible: boolean,
): TimelineVisualClassFlags => ({
  active: state?.activeLayer === true,
  selected: guidesVisible && state?.selectedVisible === true,
  current: state?.current === true,
  selectedByFrame: state?.selectedByFrame === true,
  selectedByRow: state?.selectedByLayer === true,
  frameActive: frame?.active === true,
  // Frame selection is a column semantic and remains true while temporary
  // selection guides are hidden (e.g. during playback). `outlineVisible`
  // below is the presentation-only gate.
  frameSelected: frame?.selected === true,
  outlineVisible: guidesVisible && (state?.selectedVisible === true || frame?.selected === true),
})

/** Unified adapter entry point for layer/group/mask rows and cel/mask cells. */
export const timelineVisualClasses = (
  state: TimelineVisualDto | undefined,
  frame: TimelineVisualFrameState | TimelineVisualColumnState | undefined,
  guidesVisible: boolean,
  activeRow?: TimelineRowRef | null,
): TimelineVisualClassFlags => {
  if (!state) return timelineRowVisualClasses(undefined, guidesVisible, activeRow)
  if ('row' in state) return timelineRowVisualClasses(state, guidesVisible, activeRow)
  return timelineCellVisualClasses(state, frame, guidesVisible)
}
