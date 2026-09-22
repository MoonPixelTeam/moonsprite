import { createAnimationTimelineVisualTopology, type AnimationTimelineVisualTopology } from './animation-timeline-visual-topology'
import type { TimelineVisualCellCache } from './animation-timeline-cell-cache'
/**
 * Pure, presentation-agnostic visual state for the animation timeline.
 *
 * This module deliberately uses small DTOs instead of DocumentSession, React,
 * DOM nodes, Zustand, or CSS class names. The renderer can consume the result,
 * but it cannot be the source of truth for the result.
 */

import { parseTimelineCellKey, timelineCellSlotKey, timelineCellRefFromLegacyKey } from './animation-timeline-identity'
import type { TimelineCellKind, TimelineRowKind } from './animation-timeline-identity'
import type { TimelineCellRef, TimelineRowRef } from './animation-timeline-identity'

export type { TimelineCellKind, TimelineRowKind } from './animation-timeline-identity'
export type TimelineLinkRole = 'none' | 'source' | 'member' | 'stale'

/** A row that can be shown by a timeline renderer. */
export interface TimelineVisualRow {
  id: string
  ownerId: string
  ownerKind: 'layer' | 'group'
  kind: TimelineRowKind
}

/** A frame is intentionally smaller than AnimationFrame: duration is irrelevant here. */
export interface TimelineVisualFrame {
  id: string
}

/**
 * A cell or mask slot. linkSourceId points to another cell of the same kind;
 * chains are resolved to their root by the pure derivation function.
 */
export interface TimelineVisualCell {
  id: string
  key: string
  ownerId: string
  ownerKind: 'layer' | 'group'
  frameId: string
  kind: TimelineCellKind
  linkSourceId?: string | null
}

export interface TimelineSelectionSnapshot {
  activeLayerId: string | null
  activeFrameId: string | null
  selectedLayerIds?: readonly string[]
  selectedGroupIds?: readonly string[]
  selectedFrameIds?: readonly string[]
  selectedCellKeys?: readonly string[]
  selectedMaskCellKeys?: readonly string[]
  /**
   * Mirrors DocumentSession.animationCellSelectionExplicit. False means the
   * cel keys are implicit cells derived from a layer selection, not direct cel
   * selection. Omitted DTOs default to true for backwards-compatible callers.
   */
  animationCellSelectionExplicit?: boolean
}

/**
 * presentationHidden suppresses temporary selection/link guides only. It never
 * changes the formal selection fields in normalizedSelection. Playback keeps
 * the same selection presentation while the active row/column/current context
 * follows the moving playhead.
 */
export interface TimelinePresentationSnapshot {
  presentationHidden?: boolean
  playing?: boolean
}

export interface TimelineVisualStateInput {
  rows: readonly TimelineVisualRow[]
  frames: readonly TimelineVisualFrame[]
  cells: readonly TimelineVisualCell[]
  topology?: AnimationTimelineVisualTopology
  cellStateCache?: TimelineVisualCellCache
  canonicalIndex?: CanonicalTimelineIndex
  selection: TimelineSelectionSnapshot
  active?: {
    row: TimelineRowRef | null
    frameId: string | null
    maskEditTargetId: string | null
  }
  gesture?: {
    activeRow?: TimelineRowRef | null
    activeFrameId?: string | null
    selectedRows?: readonly TimelineRowRef[]
    selectedCells?: readonly TimelineCellRef[]
    selectedFrameIds?: readonly string[]
  } | null
  presentation?: TimelinePresentationSnapshot
}

export type TimelineVisualPriority =
  | 'invalid'
  | 'selected-cel'
  | 'selected-frame-layer'
  | 'selected-frame'
  | 'current-cel'
  | 'active-row-column'
  | 'linked-structure'
  | 'default'

export interface TimelineNormalizedSelection {
  activeLayerId: string | null
  activeFrameId: string | null
  staleActiveLayerId: string | null
  staleActiveFrameId: string | null
  selectedLayerIds: string[]
  selectedGroupIds: string[]
  selectedFrameIds: string[]
  selectedCellKeys: string[]
  selectedMaskCellKeys: string[]
  staleLayerIds: string[]
  staleGroupIds: string[]
  staleFrameIds: string[]
  staleCellKeys: string[]
  staleMaskCellKeys: string[]
  animationCellSelectionExplicit: boolean
}

export interface TimelineVisualRowState {
  row: TimelineVisualRow
  active: boolean
  selected: boolean
  selectedByCell: boolean
  selectedByFrame: boolean
  /** Unified row contract aliases shared by layer/group/mask rows. */
  selectedByLayer?: boolean
  current?: boolean
}

export interface TimelineVisualFrameState {
  frame: TimelineVisualFrame
  active: boolean
  selected: boolean
}

export interface TimelineVisualColumnState {
  frame: TimelineVisualFrame
  active: boolean
  selected: boolean
  outlineVisible: boolean
}

export interface TimelineVisualLinkState {
  linked: boolean
  role: TimelineLinkRole
  groupId: string | null
  /** Any directly selected cel/mask in this linked group. */
  directSelected: boolean
  directSelectedVisible: boolean
  /** Any member whose frame is explicitly selected. */
  selectedByFrame: boolean
  selectedByFrameVisible: boolean
  /** The linked structure exists, independent of selection. */
  structural: boolean
  structuralVisible: boolean
}

export interface TimelineVisualCellState {
  cell: TimelineVisualCell | null
  key: string
  kind: TimelineCellKind
  ownerId: string
  ownerKind: 'layer' | 'group'
  frameId: string
  valid: boolean
  activeLayer: boolean
  activeFrame: boolean
  current: boolean
  explicitSelected: boolean
  /** Unified cell contract aliases shared by cel and mask cells. */
  selected?: boolean
  selectedByRow?: boolean
  selectedVisible: boolean
  selectedByFrame: boolean
  selectedByLayer: boolean
  selectedByFrameAndLayer: boolean
  presentationHidden: boolean
  link: TimelineVisualLinkState
  priority: TimelineVisualPriority
}

/**
 * Compatibility bridge for mask slots whose pixels are inherited from a
 * linked source cel. The renderer may not have a DTO for that inherited slot
 * yet, so it temporarily falls back to the legacy mask selection flags.
 */
export const resolveTimelineMaskVisualFlags = ({
  derived,
  legacySelected,
  legacyActive,
}: {
  derived: Pick<TimelineVisualCellState, 'valid' | 'selectedVisible' | 'current' | 'link'> | null | undefined
  legacySelected: boolean
  legacyActive: boolean
}): { selected: boolean; active: boolean } => derived?.valid
  ? { selected: derived.selectedVisible || derived.link.directSelectedVisible, active: derived.current && legacyActive }
  : { selected: legacySelected, active: legacyActive }

export interface TimelineVisualConnectorState {
  fromKey: string
  toKey: string
  kind: TimelineCellKind
  groupId: string
  bridged: boolean
  directSelected: boolean
  directSelectedVisible: boolean
  selectedByFrame: boolean
  selectedByFrameVisible: boolean
  structural: boolean
  structuralVisible: boolean
  visible: boolean
}

export interface AnimationTimelineVisualState {
  rows: readonly TimelineVisualRowState[]
  frames: readonly TimelineVisualFrameState[]
  columns: readonly TimelineVisualColumnState[]
  cells: readonly TimelineVisualCellState[]
  connectors: readonly TimelineVisualConnectorState[]
  normalizedSelection: TimelineNormalizedSelection
  selectionGuidesVisible: boolean
}

/**
 * Interior cel markers describe visible cel content. Selection/background
 * styling is rendered independently, so transparent or sparse empty slots
 * must not receive this marker merely because their row or frame is selected.
 */
export const shouldRenderTimelineCelSelectionMarker = (hasContent: boolean, selected: boolean): boolean => hasContent && selected

const unique = (values: readonly string[]): string[] => [...new Set(values)]

const parseCellKey = (key: string): { ownerId: string; frameId: string } | null => {
  const separator = key.lastIndexOf(':')
  if (separator <= 0 || separator === key.length - 1) return null
  return { ownerId: key.slice(0, separator), frameId: key.slice(separator + 1) }
}

const resolveCellRef = (
  key: string,
  kind: TimelineCellKind,
  index: CanonicalTimelineIndex,
): { kind: TimelineCellKind; ownerKind: 'layer' | 'group'; ownerId: string; frameId: string } | null => {
  const typed = parseTimelineCellKey(key)
  if (typed) return typed.kind === kind ? typed : null
  const parsed = timelineCellRefFromLegacyKey(key, kind, 'layer')
  if (!parsed) return null
  const bySlot = kind === 'cel' ? index.celByOwnerFrame : index.maskByOwnerFrame
  if (bySlot.has(ownerFrameKey(kind, 'layer', parsed.ownerId, parsed.frameId))) return parsed
  if (bySlot.has(ownerFrameKey(kind, 'group', parsed.ownerId, parsed.frameId))) return { ...parsed, ownerKind: 'group' }
  return parsed
}

const cellMapKey = (
  kind: TimelineCellKind,
  ownerKind: 'layer' | 'group',
  ownerId: string,
  frameId: string,
): string => timelineCellSlotKey({ kind, ownerKind, ownerId, frameId })
const cellIdKey = (kind: TimelineCellKind, id: string): string => `${kind}:${id}`

type TimelineResolutionStatus = 'root' | 'resolved' | 'stale'

export interface CanonicalTimelineIndex {
  celById: ReadonlyMap<string, TimelineVisualCell>
  celByOwnerFrame: ReadonlyMap<string, TimelineVisualCell>
  maskById: ReadonlyMap<string, TimelineVisualCell>
  maskByOwnerFrame: ReadonlyMap<string, TimelineVisualCell>
  frameIndexById: ReadonlyMap<string, number>
  celRootById: ReadonlyMap<string, string | null>
  maskRootById: ReadonlyMap<string, string | null>
  membersByRoot: ReadonlyMap<string, readonly TimelineVisualCell[]>
  cellsByFrame: ReadonlyMap<string, readonly TimelineVisualCell[]>
  resolutionStatus: ReadonlyMap<string, TimelineResolutionStatus>
}

const ownerFrameKey = (kind: TimelineCellKind, ownerKind: 'layer' | 'group', ownerId: string, frameId: string): string =>
  timelineCellSlotKey({ kind, ownerKind, ownerId, frameId })

/** Builds all canonical timeline indexes once for one visual-state snapshot. */
export const createAnimationTimelineVisualIndex = (
  frames: readonly TimelineVisualFrame[],
  cells: readonly TimelineVisualCell[],
): CanonicalTimelineIndex => {
  const frameIndexById = new Map<string, number>()
  frames.forEach((frame, index) => frameIndexById.set(frame.id, index))
  const celById = new Map<string, TimelineVisualCell>()
  const celByOwnerFrame = new Map<string, TimelineVisualCell>()
  const maskById = new Map<string, TimelineVisualCell>()
  const maskByOwnerFrame = new Map<string, TimelineVisualCell>()
  // Keep the first entry for duplicate slots. This makes malformed snapshots
  // deterministic and prevents duplicate members/connectors from leaking.
  for (const cell of cells) {
    if (!frameIndexById.has(cell.frameId)) continue
    const byId = cell.kind === 'cel' ? celById : maskById
    const bySlot = cell.kind === 'cel' ? celByOwnerFrame : maskByOwnerFrame
    if (byId.has(cell.id)) continue
    byId.set(cell.id, cell)
    const slot = ownerFrameKey(cell.kind, cell.ownerKind, cell.ownerId, cell.frameId)
    if (!bySlot.has(slot)) bySlot.set(slot, cell)
  }
  const celRootById = new Map<string, string | null>()
  const maskRootById = new Map<string, string | null>()
  const resolutionStatus = new Map<string, TimelineResolutionStatus>()
  const membersByRoot = new Map<string, TimelineVisualCell[]>()
  const cellsByFrame = new Map<string, TimelineVisualCell[]>()
  const resolveKind = (cellsById: ReadonlyMap<string, TimelineVisualCell>, rootMap: Map<string, string | null>): void => {
    const state = new Map<string, TimelineResolutionStatus>()
    const roots = new Map<string, string | null>()
    const resolve = (start: TimelineVisualCell): void => {
      const startKey = cellIdKey(start.kind, start.id)
      if (state.has(startKey)) return
      const path: TimelineVisualCell[] = []
      const seen = new Map<string, number>()
      let current = start
      let rootId: string | null = null
      let stale = false
      while (true) {
        const currentKey = cellIdKey(current.kind, current.id)
        const known = state.get(currentKey)
        if (known) {
          rootId = roots.get(currentKey) ?? null
          stale = known === 'stale'
          break
        }
        const cycleAt = seen.get(currentKey)
        if (cycleAt !== undefined) {
          stale = true
          for (let i = cycleAt; i < path.length; i += 1) {
            const cycleKey = cellIdKey(path[i].kind, path[i].id)
            state.set(cycleKey, 'stale')
            roots.set(cycleKey, null)
          }
          break
        }
        seen.set(currentKey, path.length)
        path.push(current)
        if (!current.linkSourceId) {
          rootId = current.id
          break
        }
        const source = cellsById.get(current.linkSourceId)
        const validSource = source
          && source.kind === current.kind
          && source.ownerKind === current.ownerKind
          && (current.kind !== 'cel' || source.ownerId === current.ownerId)
          && (current.kind !== 'mask' || source.ownerKind === current.ownerKind)
        if (!validSource) {
          stale = true
          break
        }
        current = source
      }
      for (const node of path) {
        const key = cellIdKey(node.kind, node.id)
        if (state.has(key)) continue
        state.set(key, stale ? 'stale' : node.id === rootId ? 'root' : 'resolved')
        roots.set(key, stale ? null : rootId)
      }
    }
    for (const cell of cellsById.values()) resolve(cell)
    for (const [key, status] of state) {
      resolutionStatus.set(key, status)
      const separator = key.indexOf(':')
      const id = key.slice(separator + 1)
      rootMap.set(id, roots.get(key) ?? null)
    }
  }
  resolveKind(celById, celRootById)
  resolveKind(maskById, maskRootById)
  for (const cell of celByOwnerFrame.values()) {
    const frameCells = cellsByFrame.get(cell.frameId) ?? []
    frameCells.push(cell)
    cellsByFrame.set(cell.frameId, frameCells)
    const rootId = celRootById.get(cell.id)
    if (!rootId || rootId === cell.id || resolutionStatus.get(cellIdKey('cel', cell.id)) === 'stale') continue
    const groupKey = cellIdKey('cel', rootId)
    const members = membersByRoot.get(groupKey) ?? []
    members.push(cell)
    membersByRoot.set(groupKey, members)
  }
  for (const cell of maskByOwnerFrame.values()) {
    const frameCells = cellsByFrame.get(cell.frameId) ?? []
    frameCells.push(cell)
    cellsByFrame.set(cell.frameId, frameCells)
    const rootId = maskRootById.get(cell.id)
    if (!rootId || rootId === cell.id || resolutionStatus.get(cellIdKey('mask', cell.id)) === 'stale') continue
    const groupKey = cellIdKey('mask', rootId)
    const members = membersByRoot.get(groupKey) ?? []
    members.push(cell)
    membersByRoot.set(groupKey, members)
  }
  // Include roots in linked groups so source/member classification is shared.
  for (const [groupKey, members] of [...membersByRoot]) {
    const separator = groupKey.indexOf(':')
    const kind = groupKey.slice(0, separator) as TimelineCellKind
    const id = groupKey.slice(separator + 1)
    const root = (kind === 'cel' ? celById : maskById).get(id)
    if (root) members.unshift(root)
    if (root) {
      const rootMap = root.kind === 'cel' ? celRootById : maskRootById
      rootMap.set(root.id, root.id)
      resolutionStatus.set(cellIdKey(root.kind, root.id), 'root')
    }
    membersByRoot.set(groupKey, members)
  }
  return { celById, celByOwnerFrame, maskById, maskByOwnerFrame, frameIndexById, celRootById, maskRootById, membersByRoot, cellsByFrame, resolutionStatus }
}

/**
 * Derives all timeline row/frame/cel/link visuals from one explicit snapshot.
 * Priority is deterministic: directly selected cel/mask (including linked-group
 * propagation), frame×layer selection, frame-only selection, current cel, active
 * row/column, linked structure, then default. Invalid slots never become
 * current or visible selections. Formal selection remains in
 * normalizedSelection even when temporary guides are hidden or playback is active.
 * Connectors include both adjacent linked members and members separated by one
 * or more empty frames; bridged distinguishes the latter for rendering.
 */
export const deriveAnimationTimelineVisualState = (
  input: TimelineVisualStateInput,
): AnimationTimelineVisualState => {
  const rows = input.rows
  const frames = input.frames
  const cells = input.cells
  const gestureCells = input.gesture?.selectedCells
  const selection: TimelineSelectionSnapshot = input.gesture
    ? {
        ...input.selection,
        activeFrameId: input.gesture.activeFrameId ?? input.active?.frameId ?? input.selection.activeFrameId,
        selectedFrameIds: input.gesture.selectedFrameIds ?? [],
        selectedCellKeys: gestureCells?.filter((cell) => cell.kind === 'cel').map((cell) => `${cell.ownerId}:${cell.frameId}`) ?? [],
        selectedMaskCellKeys: gestureCells?.filter((cell) => cell.kind === 'mask').map((cell) => `${cell.ownerId}:${cell.frameId}`) ?? [],
      }
    : { ...input.selection, activeFrameId: input.active?.frameId ?? input.selection.activeFrameId }
  const presentationHidden = input.presentation?.presentationHidden === true
  // Playing changes the active frame, not the user's selection. Keep guides
  // visible during playback so frame/cel/layer multi-selection remains stable.
  const selectionGuidesVisible = !presentationHidden

  const index = input.canonicalIndex ?? createAnimationTimelineVisualIndex(frames, cells)
  const topology = input.topology ?? createAnimationTimelineVisualTopology(rows, frames, index)
  const { frameIds, layerIds, groupIds, validNormalSlots, validMaskSlots } = topology

  const normalizeIds = (values: readonly string[] | undefined, valid: ReadonlySet<string>): { values: string[]; stale: string[] } => {
    const valuesOut: string[] = []
    const stale: string[] = []
    for (const value of unique(values ?? [])) {
      if (valid.has(value)) valuesOut.push(value)
      else stale.push(value)
    }
    return { values: valuesOut, stale }
  }
  const normalizedLayers = normalizeIds(selection.selectedLayerIds, layerIds)
  const normalizedGroups = normalizeIds(selection.selectedGroupIds, groupIds)
  const normalizedFrames = normalizeIds(selection.selectedFrameIds, frameIds)
  // Invalid active ids are deliberately normalized to null rather than
  // falling back implicitly. This is deterministic and prevents an invalid
  // cell from ever being classified as current.
  const normalizedActiveLayerId = selection.activeLayerId && layerIds.has(selection.activeLayerId) ? selection.activeLayerId : null
  const normalizedActiveFrameId = selection.activeFrameId && frameIds.has(selection.activeFrameId) ? selection.activeFrameId : null

  const normalizeCellKeys = (
    values: readonly string[] | undefined,
    validSlots: ReadonlySet<string>,
  ): { values: string[]; stale: string[] } => {
    const valuesOut: string[] = []
    const stale: string[] = []
    for (const key of unique(values ?? [])) {
      const parsed = parseCellKey(key)
      if (parsed && validSlots.has(key)) valuesOut.push(key)
      else stale.push(key)
    }
    return { values: valuesOut, stale }
  }
  const normalizedCells = normalizeCellKeys(selection.selectedCellKeys, validNormalSlots)
  const normalizedMasks = normalizeCellKeys(selection.selectedMaskCellKeys, validMaskSlots)
  const normalizedSelection: TimelineNormalizedSelection = {
    activeLayerId: normalizedActiveLayerId,
    activeFrameId: normalizedActiveFrameId,
    staleActiveLayerId: selection.activeLayerId && !normalizedActiveLayerId ? selection.activeLayerId : null,
    staleActiveFrameId: selection.activeFrameId && !normalizedActiveFrameId ? selection.activeFrameId : null,
    selectedLayerIds: normalizedLayers.values,
    selectedGroupIds: normalizedGroups.values,
    selectedFrameIds: normalizedFrames.values,
    selectedCellKeys: normalizedCells.values,
    selectedMaskCellKeys: normalizedMasks.values,
    staleLayerIds: normalizedLayers.stale,
    staleGroupIds: normalizedGroups.stale,
    staleFrameIds: normalizedFrames.stale,
    staleCellKeys: normalizedCells.stale,
    staleMaskCellKeys: normalizedMasks.stale,
    animationCellSelectionExplicit: selection.animationCellSelectionExplicit !== false,
  }

  const selectedLayerSet = new Set(normalizedLayers.values)
  const selectedGroupSet = new Set(normalizedGroups.values)
  const selectedFrameSet = new Set(normalizedFrames.values)
  const selectedCellSet = new Set(normalizedCells.values)
  const selectedMaskSet = new Set(normalizedMasks.values)
  const directCellSelectionEnabled = normalizedSelection.animationCellSelectionExplicit
  const selectedKeysForKind = (kind: TimelineCellKind): ReadonlySet<string> => kind === 'mask' ? selectedMaskSet : selectedCellSet

  const directSelectedGroups = new Set<string>()
  const selectedByFrameGroups = new Set<string>()
  const selectedByFrameAndLayerGroups = new Set<string>()
  const markDirectGroups = (kind: TimelineCellKind, keys: ReadonlySet<string>): void => {
    if (kind === 'cel' && !directCellSelectionEnabled) return
    const bySlot = kind === 'cel' ? index.celByOwnerFrame : index.maskByOwnerFrame
    const roots = kind === 'cel' ? index.celRootById : index.maskRootById
    for (const key of keys) {
      const parsed = resolveCellRef(key, kind, index)
      if (!parsed) continue
      const cell = bySlot.get(ownerFrameKey(kind, parsed.ownerKind, parsed.ownerId, parsed.frameId))
      if (!cell) continue
      const rootId = roots.get(cell.id)
      if (!rootId || index.resolutionStatus.get(cellIdKey(kind, cell.id)) === 'stale') continue
      directSelectedGroups.add(cellIdKey(kind, rootId))
    }
  }
  markDirectGroups('cel', selectedCellSet)
  markDirectGroups('mask', selectedMaskSet)
  for (const frameId of selectedFrameSet) {
    for (const member of index.cellsByFrame.get(frameId) ?? []) {
      const kind = member.kind
      const roots = kind === 'cel' ? index.celRootById : index.maskRootById
      const rootId = roots.get(member.id)
      if (!rootId || index.resolutionStatus.get(cellIdKey(kind, member.id)) === 'stale') continue
      const groupKey = cellIdKey(kind, rootId)
      selectedByFrameGroups.add(groupKey)
      const ownerSelected = member.ownerKind === 'layer' ? selectedLayerSet.has(member.ownerId) : selectedGroupSet.has(member.ownerId)
      if (ownerSelected) selectedByFrameAndLayerGroups.add(groupKey)
    }
  }

  // Pre-aggregate row selection once. This keeps row derivation O(R) instead
  // of reparsing every selected key for every row.
  // Row identity includes the rendered row kind. A mask cell selection must
  // never be projected onto its ordinary owner layer row (or vice versa).
  const selectedOwnerSet = new Set<string>()
  const selectedOwnerFrameSet = new Set<string>()
  const selectedOwnerWithFrameSet = new Set<string>()
  const addSelectedOwner = (ownerKind: 'layer' | 'group', ownerId: string, frameId: string, kind: TimelineRowKind): void => {
    const ownerKey = `${ownerKind}:${ownerId}`
    const rowKey = `${ownerKey}:${kind}`
    selectedOwnerSet.add(rowKey)
    if (selectedFrameSet.has(frameId)) {
      selectedOwnerFrameSet.add(`${rowKey}:${frameId}`)
    }
  }
  for (const key of selectedCellSet) {
    const parsed = parseCellKey(key)
    if (parsed) addSelectedOwner('layer', parsed.ownerId, parsed.frameId, 'layer')
  }
  for (const key of selectedMaskSet) {
    const parsed = resolveCellRef(key, 'mask', index)
    if (!parsed) continue
    addSelectedOwner(parsed.ownerKind, parsed.ownerId, parsed.frameId, 'mask')
  }
  for (const ownerFrameKeyValue of selectedOwnerFrameSet) {
    const separator = ownerFrameKeyValue.lastIndexOf(':')
    if (separator > 0) selectedOwnerWithFrameSet.add(ownerFrameKeyValue.slice(0, separator))
  }

  const activeRow = input.gesture?.activeRow ?? input.active?.row ?? null
  const rowStates: TimelineVisualRowState[] = rows.map((row) => {
    const selected = row.ownerKind === 'layer' ? selectedLayerSet.has(row.ownerId) : selectedGroupSet.has(row.ownerId)
    const ownerKey = `${row.ownerKind}:${row.ownerId}`
    const rowKey = `${ownerKey}:${row.kind}`
    const selectedByCell = selectedOwnerSet.has(rowKey)
    const selectedByFrame = selectedOwnerWithFrameSet.has(rowKey)
    const active = activeRow
      ? row.kind === activeRow.kind && row.ownerKind === activeRow.ownerKind && row.ownerId === activeRow.ownerId
      : row.ownerKind === 'layer' && row.ownerId === normalizedActiveLayerId
    const selectedByLayer = row.ownerKind === 'layer' ? selectedLayerSet.has(row.ownerId) : selectedGroupSet.has(row.ownerId)
    const current = active && normalizedActiveFrameId !== null
    return { row, active, selected, selectedByCell, selectedByFrame, selectedByLayer, current }
  })
  const frameStates: TimelineVisualFrameState[] = frames.map((frame) => ({
    frame,
    active: frame.id === normalizedActiveFrameId,
    selected: selectedFrameSet.has(frame.id),
  }))
  const columns: TimelineVisualColumnState[] = frameStates.map((state) => ({
    frame: state.frame,
    active: state.active,
    selected: state.selected,
    outlineVisible: state.selected && selectionGuidesVisible,
  }))

  const cellStates: TimelineVisualCellState[] = []
  const cellCache = input.cellStateCache?.topology === topology ? input.cellStateCache : undefined
  for (let slotIndex = 0; slotIndex < topology.slots.length; slotIndex++) {
    const {row, frame, key, kind, cell, valid, groupId, groupKey, linked, role} = topology.slots[slotIndex]
    const activeLayer = row.ownerKind === 'layer' && row.ownerId === normalizedActiveLayerId
    const activeFrame = frame.id === normalizedActiveFrameId
    // A mask cell is current only when the mask row itself is the active row;
    // selecting its owner layer must not leak current-cel visuals into the
    // mask timeline.
    const rowIsActiveContext = activeRow
      ? row.kind === activeRow.kind && row.ownerKind === activeRow.ownerKind && row.ownerId === activeRow.ownerId
      : row.kind === 'layer' && activeLayer
    const current = rowIsActiveContext && activeFrame
    // Mask selection is always explicit. The Store's false flag only makes
    // ordinary cel keys implicit; it must not hide selected mask cells.
    const explicitSelected = kind === 'mask' ? selectedMaskSet.has(key) : directCellSelectionEnabled && selectedCellSet.has(key)
    const cellSelectedByFrame = selectedFrameSet.has(frame.id)
    const selectedByLayer = row.ownerKind === 'layer' ? selectedLayerSet.has(row.ownerId) : selectedGroupSet.has(row.ownerId)
    const cellSelectedByFrameAndLayer = cellSelectedByFrame && selectedByLayer
    const directSelected = groupKey ? directSelectedGroups.has(groupKey) : false
    const linkedSelectedByFrame = groupKey ? selectedByFrameGroups.has(groupKey) : false
    const linkedSelectedByFrameAndLayer = groupKey ? selectedByFrameAndLayerGroups.has(groupKey) : false
    const selectedVisible = explicitSelected && selectionGuidesVisible
    const signature = Number(activeLayer) | Number(activeFrame) << 1 | Number(current) << 2 | Number(explicitSelected) << 3
      | Number(cellSelectedByFrame) << 4 | Number(selectedByLayer) << 5 | Number(directSelected) << 6
      | Number(linkedSelectedByFrame) << 7 | Number(linkedSelectedByFrameAndLayer) << 8 | Number(selectionGuidesVisible) << 9
    const cached = cellCache?.states[slotIndex]
    if (cached && cellCache!.signatures[slotIndex] === signature) { cellStates.push(cached); continue }
    const link: TimelineVisualLinkState = {
      linked,
      role,
      groupId,
      directSelected,
      directSelectedVisible: directSelected && selectionGuidesVisible,
      selectedByFrame: linkedSelectedByFrame,
      selectedByFrameVisible: linkedSelectedByFrame && selectionGuidesVisible,
      structural: linked,
      // Structural linked blocks are persistent relationship markers, not
      // temporary selection guides, so they remain visible while drawing or
      // playing; direct/frame emphasis follows selectionGuidesVisible.
      structuralVisible: linked,
    }
    let priority: TimelineVisualPriority = 'default'
    if (!valid) priority = 'invalid'
    else if (selectedVisible || link.directSelectedVisible) priority = 'selected-cel'
    else if (cellSelectedByFrameAndLayer || (linkedSelectedByFrameAndLayer && selectionGuidesVisible)) priority = 'selected-frame-layer'
    else if ((cellSelectedByFrame || linkedSelectedByFrame) && selectionGuidesVisible) priority = 'selected-frame'
    else if (current) priority = 'current-cel'
    else if (activeLayer || activeFrame) priority = 'active-row-column'
    else if (linked && selectionGuidesVisible) priority = 'linked-structure'
    const state: TimelineVisualCellState = {
      cell,
      key,
      kind,
      ownerId: row.ownerId,
      ownerKind: row.ownerKind,
      frameId: frame.id,
      valid,
      activeLayer,
      activeFrame,
      current,
      explicitSelected,
      selected: selectedVisible || link.directSelectedVisible,
      selectedByRow: selectedByLayer,
      selectedVisible,
      selectedByFrame: cellSelectedByFrame,
      selectedByLayer,
      selectedByFrameAndLayer: cellSelectedByFrameAndLayer,
      presentationHidden: !selectionGuidesVisible,
      link,
      priority,
    }
    cellStates.push(state)
    if (cellCache) { cellCache.signatures[slotIndex] = signature; cellCache.states[slotIndex] = state }
  }

  const connectors: TimelineVisualConnectorState[] = []
  for (const {groupKey, groupId, from, to, bridged} of topology.connectors) {
    const directSelected = directSelectedGroups.has(groupKey)
    const selectedByFrame = selectedByFrameGroups.has(groupKey)
    connectors.push({
      fromKey: from.key,
      toKey: to.key,
      kind: from.kind,
      groupId,
      bridged,
      directSelected,
      directSelectedVisible: directSelected && selectionGuidesVisible,
      selectedByFrame,
      selectedByFrameVisible: selectedByFrame && selectionGuidesVisible,
      structural: true,
      structuralVisible: true,
      // Adjacent and bridged connectors are both emitted. The bridged flag
      // lets the future renderer choose a distinct gap style without losing
      // contiguous relationship geometry.
      visible: true,
    })
  }

  return { rows: rowStates, frames: frameStates, columns, cells: cellStates, connectors, normalizedSelection, selectionGuidesVisible }
}
