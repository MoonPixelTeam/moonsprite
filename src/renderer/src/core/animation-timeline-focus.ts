import type { TimelineCellRef, TimelineOwnerKind, TimelineRowRef } from './animation-timeline-identity'

export type TimelineFocusMode =
  | 'explicit-layer'
  | 'explicit-group'
  | 'mask-row'
  | 'mask-cell'
  | 'frame'
  | 'cel'
  | 'implicit-cursor'
  | 'none'

export interface TimelineFocusInput {
  activeLayerId: string | null
  activeFrameId: string | null
  activeMaskId: string | null
  layerSelectionExplicit: boolean
  selectedLayerIds?: readonly string[]
  selectedGroupIds?: readonly string[]
  selectedGroupId?: string | null
  selectedFrameIds?: readonly string[]
  selectedCellRefs?: readonly TimelineCellRef[]
  selectedMaskCellRefs?: readonly TimelineCellRef[]
  selectedMaskRowRefs?: readonly TimelineRowRef[]
}

export interface TimelineFocusState {
  mode: TimelineFocusMode
  owner: TimelineRowRef | null
  cell: TimelineCellRef | null
  activeLayerId: string | null
  activeFrameId: string | null
  activeMaskId: string | null
  explicitLayerFocus: boolean
  maskFocus: boolean
  frameFocus: boolean
  celFocus: boolean
  implicitCursor: boolean
}

export interface TimelineMarqueeTransitionInput {
  canvasSelectionActive: boolean
  activeMaskId: string | null
  selectedFrameCount: number
  selectedCellCount: number
  layerSelectionExplicit: boolean
  selectedLayerCount: number
  selectedGroupCount: number
  selectedGroupId: string | null
}

const last = <T>(items: readonly T[] | undefined): T | null => items && items.length > 0 ? items[items.length - 1] ?? null : null

const rowForLayer = (id: string): TimelineRowRef => ({ kind: 'layer', ownerKind: 'layer', ownerId: id })
const rowForGroup = (id: string): TimelineRowRef => ({ kind: 'group', ownerKind: 'group', ownerId: id })

export const timelineSelectionPrecedesMarquee = (input: TimelineMarqueeTransitionInput): boolean => !input.canvasSelectionActive
  && input.activeMaskId === null
  && (input.selectedFrameCount > 0
    || input.selectedCellCount > 0
    || input.layerSelectionExplicit
    || input.selectedLayerCount > 1
    || input.selectedGroupCount > 0
    || input.selectedGroupId !== null)

/**
 * Resolve the renderer's single timeline focus from the session's raw fields.
 * Implicit `[activeLayerId]` fallback selections are intentionally excluded
 * from explicit layer focus when `layerSelectionExplicit` is false.
 */
export const resolveTimelineFocusState = (input: TimelineFocusInput): TimelineFocusState => {
  const selectedLayers = input.selectedLayerIds ?? []
  const selectedGroups = input.selectedGroupIds ?? []
  const selectedGroupId = input.selectedGroupId ?? null
  const explicitLayerFocus = input.layerSelectionExplicit === true
    && (selectedLayers.length > 0 || selectedGroups.length > 0 || selectedGroupId !== null)
  const frameFocus = (input.selectedFrameIds?.length ?? 0) > 0
  const selectedMaskCell = last(input.selectedMaskCellRefs)
  const selectedMaskRow = last(input.selectedMaskRowRefs)
  const maskFocus = !explicitLayerFocus
    && (selectedMaskCell !== null || selectedMaskRow !== null || input.activeMaskId !== null)
  const selectedCel = last(input.selectedCellRefs)
  const celFocus = !explicitLayerFocus && !maskFocus && selectedCel !== null

  let mode: TimelineFocusMode = 'none'
  let owner: TimelineRowRef | null = null
  let cell: TimelineCellRef | null = null
  if (explicitLayerFocus) {
    if (selectedGroupId) {
      mode = 'explicit-group'
      owner = rowForGroup(selectedGroupId)
    } else if (selectedGroups.length > 0) {
      mode = 'explicit-group'
      owner = rowForGroup(last(selectedGroups)!)
    } else if (selectedLayers.length > 0) {
      mode = 'explicit-layer'
      owner = rowForLayer(last(selectedLayers)!)
    }
  } else if (maskFocus) {
    if (selectedMaskCell) {
      mode = 'mask-cell'
      cell = selectedMaskCell
      owner = { kind: 'mask', ownerKind: selectedMaskCell.ownerKind, ownerId: selectedMaskCell.ownerId }
    } else if (selectedMaskRow) {
      mode = 'mask-row'
      owner = selectedMaskRow
    } else if (input.activeMaskId !== null) {
      // Editing can retain a canonical mask id for one render before the
      // corresponding row/cell selection is restored. Keep this as mask
      // focus instead of returning an inconsistent `mode: none` state.
      mode = 'mask-cell'
    }
  } else if (celFocus) {
    mode = 'cel'
    cell = selectedCel
    owner = selectedCel.ownerKind === 'group'
      ? { kind: 'group', ownerKind: 'group', ownerId: selectedCel.ownerId }
      : { kind: 'layer', ownerKind: 'layer', ownerId: selectedCel.ownerId }
  } else if (frameFocus) {
    mode = 'frame'
  } else if (input.activeLayerId !== null || input.activeFrameId !== null) {
    mode = 'implicit-cursor'
    // Keep the document cursor's owner explicit for visual derivation.  This
    // is not a layer *selection* (layerSelectionExplicit remains false), but
    // it still identifies the row/cell that should carry current activity
    // after a blank-click clears formal selection.
    if (input.activeLayerId !== null) owner = rowForLayer(input.activeLayerId)
  }

  return {
    mode,
    owner,
    cell,
    activeLayerId: input.activeLayerId,
    activeFrameId: input.activeFrameId,
    activeMaskId: input.activeMaskId,
    explicitLayerFocus,
    maskFocus,
    frameFocus,
    celFocus,
    implicitCursor: mode === 'implicit-cursor'
  }
}

export const timelineMaskOwner = (ownerKind: TimelineOwnerKind, ownerId: string): TimelineRowRef => ({
  kind: 'mask',
  ownerKind,
  ownerId
})
