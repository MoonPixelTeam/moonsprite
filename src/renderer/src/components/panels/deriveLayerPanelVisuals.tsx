import { deriveTimelineLinks } from './deriveTimelineLinks'
import type { AnimationPointerDrag } from './animation-gesture-types'
import type { RgbaColor } from '@shared/types-color'
import type { LayerGroup, RasterLayer } from '@shared/types-layer'
import { buildLayerPanelTree } from '@/core/layer-panel-layout'
import { animationCelKey, parseAnimationCelKey } from '@/core/animation'
import { type DocumentSession } from '@/store/workspace'
import {
  createAnimationTimelineVisualIndex,
  deriveAnimationTimelineVisualState,
  type TimelineVisualCell,
  type TimelineVisualRow
} from '@/core/animation-timeline-visual-state'
import { resolveTimelineFocusState } from '@/core/animation-timeline-focus'
import { timelineCellSlotKey, timelineRowKey, type TimelineCellRef, type TimelineRowRef } from '@/core/animation-timeline-identity'
import type { LayerDisplayRow, LayerTreeNode } from './layer-panel-contracts'

interface Options {
  session: DocumentSession
  timeline: import('@shared/types-animation').AnimationTimeline
  animationGestureActiveTarget: import('@/components/panels/animation-gesture-types').AnimationGestureActiveTarget | null
  timelineActiveContext: import('@/store/workspace-types').TimelineActiveContext
  animationGestureSelection: import('@/components/panels/animation-gesture-types').AnimationGestureSelection | null
  selectionOutlineVisible: boolean
  selectedAnimationGroupCellKeys: string[]
  gesture: Readonly<AnimationPointerDrag> | null
  animationCelDragAnchorKey: string | null
  animationCelDropTargetKey: string | null
  animationCellSelectionOutlineVisible: boolean
}

export function deriveLayerPanelVisuals({
  session,
  timeline,
  animationGestureActiveTarget,
  timelineActiveContext,
  animationGestureSelection,
  selectionOutlineVisible,
  selectedAnimationGroupCellKeys,
  gesture,
  animationCelDragAnchorKey,
  animationCelDropTargetKey,
  animationCellSelectionOutlineVisible
}: Options) {
  const layerById = new Map(session.document.layers.map((layer) => [layer.id, layer]))

  const groupById = new Map(session.document.groups.map((group) => [group.id, group]))

  const freeTileSetOptions = [
    ...session.document.layers
      .reduce((sets, layer) => {
        if (layer.kind !== 'free-tile' || !layer.freeTileSetId || sets.has(layer.freeTileSetId)) return sets
        sets.set(layer.freeTileSetId, { id: layer.freeTileSetId, name: layer.name, sourceCount: layer.freeTileSources?.length ?? 0 })
        return sets
      }, new Map<string, { id: string; name: string; sourceCount: number }>())
      .values()
  ]

  const displayColorStripeSegments = (
    target: RasterLayer | LayerGroup,
    kind: 'layer' | 'group',
    depth: number
  ): Array<{ color: RgbaColor; left: number; width: number }> => {
    let groupId = kind === 'group' ? target.id : ((target as RasterLayer).groupId ?? null)
    const visited = new Set<string>()
    const ancestry: LayerGroup[] = []
    while (groupId && !visited.has(groupId)) {
      visited.add(groupId)
      const group = groupById.get(groupId)
      if (!group) break
      ancestry.push(group)
      groupId = group.parentGroupId ?? null
    }
    const groups = ancestry.slice().reverse()
    const ownColor = target.displayColor
    const colorsByLevel: Array<RgbaColor | undefined> = []
    if (groups.every((group) => !group.displayColor) && !ownColor) return []
    if (groups.every((group) => !group.displayColor)) {
      colorsByLevel.push(...Array.from({ length: depth + 1 }, () => ownColor))
    } else {
      let currentColor: RgbaColor | undefined
      for (let level = 0; level <= depth; level += 1) {
        const groupColor = groups[level]?.displayColor
        if (groupColor) currentColor = groupColor
        if (level === depth && ownColor) currentColor = ownColor
        colorsByLevel.push(currentColor)
      }
    }
    return colorsByLevel.flatMap((color, level) => (color ? [{ color, left: level === 0 ? 0 : 4 + (level - 1) * 14, width: level === 0 ? 4 : 14 }] : []))
  }

  const nodes = buildLayerPanelTree({
    layers: session.document.layers,
    groups: session.document.groups,
    collapsedGroupIds: session.collapsedGroupIds
  })
    .map((node): LayerTreeNode | null => {
      if (node.kind === 'layer') {
        const layer = layerById.get(node.id)
        return layer ? { ...node, layer } : null
      }
      const group = groupById.get(node.id)
      return group ? { ...node, group } : null
    })
    .filter((node): node is LayerTreeNode => node !== null)

  const maskOwnerFrameKey = (ownerKind: 'layer' | 'group', ownerId: string, frameId: string): string => `${ownerKind}:${ownerId}:${frameId}`

  const maskSnapshotEntries = [
    ...(timeline.layerMasks ?? []).map((entry) => ({
      ownerKind: 'layer' as const,
      ownerId: entry.layerId,
      frameId: entry.frameId,
      mask: entry.mask,
      linkSourceId: entry.mask.linkedMaskId ?? null
    })),
    ...(timeline.groupMasks ?? []).map((entry) => ({
      ownerKind: 'group' as const,
      ownerId: entry.groupId,
      frameId: entry.frameId,
      mask: entry.mask,
      linkSourceId: entry.mask.linkedMaskId ?? null
    }))
  ]

  // A formal layer/group row selection owns the panel focus. Treat any mask
  // data left from the previous render as stale until that selection settles.
  // Mask-row and mask-cell selections clear these row-selection fields, so
  // they continue to own the visual context below.
  const toTimelineCellRef = (key: string, kind: 'cel' | 'mask'): TimelineCellRef | null => {
    const parsed = parseAnimationCelKey(key)
    if (!parsed) return null
    const ownerKind = session.document.layers.some((layer) => layer.id === parsed.layerId)
      ? 'layer'
      : session.document.groups.some((group) => group.id === parsed.layerId)
        ? 'group'
        : null
    return ownerKind ? { kind, ownerKind, ownerId: parsed.layerId, frameId: parsed.frameId } : null
  }

  const toTimelineMaskRowRef = (key: string): TimelineRowRef | null => {
    const separator = key.indexOf(':')
    if (separator <= 0) return null
    const ownerKind = key.slice(0, separator)
    const ownerId = key.slice(separator + 1)
    if (ownerKind === 'layer' && session.document.layers.some((layer) => layer.id === ownerId)) return { kind: 'mask', ownerKind, ownerId }
    if (ownerKind === 'group' && session.document.groups.some((group) => group.id === ownerId)) return { kind: 'mask', ownerKind, ownerId }
    return null
  }

  const gestureActiveRow: TimelineRowRef | null =
    animationGestureActiveTarget?.kind === 'mask'
      ? {
          kind: 'mask',
          ownerKind: session.document.layers.some((layer) => layer.id === animationGestureActiveTarget.layerId) ? 'layer' : 'group',
          ownerId: animationGestureActiveTarget.layerId
        }
      : animationGestureActiveTarget?.kind === 'cel'
        ? session.document.groups.some((group) => group.id === animationGestureActiveTarget.layerId)
          ? { kind: 'group', ownerKind: 'group', ownerId: animationGestureActiveTarget.layerId }
          : { kind: 'layer', ownerKind: 'layer', ownerId: animationGestureActiveTarget.layerId }
        : null

  const timelineActiveRow = gestureActiveRow ?? timelineActiveContext.row

  const focusState = resolveTimelineFocusState({
    activeLayerId: session.document.activeLayerId,
    activeFrameId: timeline.activeFrameId,
    activeMaskId: session.activeLayerMaskId,
    // A transient cel/mask gesture owns timeline focus immediately, even when
    // the previous layer selection is still mirrored in the session.
    layerSelectionExplicit: session.layerSelectionExplicit === true && animationGestureSelection?.kind !== 'cel' && animationGestureSelection?.kind !== 'mask',
    selectedLayerIds: session.selectedLayerIds,
    selectedGroupIds: session.selectedGroupIds,
    selectedGroupId: session.selectedGroupId,
    selectedFrameIds: session.selectedAnimationFrameIds,
    selectedCellRefs: [...session.selectedAnimationCellKeys, ...(animationGestureSelection?.kind === 'cel' ? animationGestureSelection.keys : [])].flatMap(
      (key) => {
        const ref = toTimelineCellRef(key, 'cel')
        return ref ? [ref] : []
      }
    ),
    selectedMaskCellRefs: [
      ...session.selectedAnimationMaskCellKeys,
      ...(animationGestureSelection?.kind === 'mask' ? animationGestureSelection.keys : [])
    ].flatMap((key) => {
      const ref = toTimelineCellRef(key, 'mask')
      return ref ? [ref] : []
    }),
    selectedMaskRowRefs: session.selectedAnimationMaskRowKeys.flatMap((key) => {
      const ref = toTimelineMaskRowRef(key)
      return ref ? [ref] : []
    })
  })

  const explicitLayerFocus = focusState.explicitLayerFocus

  // Mask activity is an independent editing context. Do not let a stale
  // ordinary-layer selection hide it during frame changes or playback.
  const maskContextActive = timelineActiveRow?.kind === 'mask'

  const activeMaskOwnerKey = timelineActiveRow?.kind === 'mask' ? `${timelineActiveRow.ownerKind}:${timelineActiveRow.ownerId}` : null

  const maskVisualByOwnerFrame = new Map(maskSnapshotEntries.map((entry) => [maskOwnerFrameKey(entry.ownerKind, entry.ownerId, entry.frameId), entry.mask]))

  const animationMaskLayerIds = new Set(maskSnapshotEntries.filter((entry) => entry.ownerKind === 'layer').map((entry) => entry.ownerId))

  const animationMaskGroupIds = new Set(maskSnapshotEntries.filter((entry) => entry.ownerKind === 'group').map((entry) => entry.ownerId))

  const displayRows: LayerDisplayRow[] = nodes.flatMap((node): LayerDisplayRow[] => {
    const hasMask = node.kind === 'layer' ? animationMaskLayerIds.has(node.layer.id) : animationMaskGroupIds.has(node.group.id)
    if (!hasMask) return [{ kind: 'node', node }]
    const owner = node.kind === 'layer' ? node.layer : node.group
    return [
      { kind: 'mask', ownerKind: node.kind, owner, depth: node.depth },
      { kind: 'node', node }
    ]
  })

  // Keep timeline semantics in the pure core derivation. JSX below only maps
  // the resulting row/frame/cel states to visual classes and data attributes.
  const visualRows: TimelineVisualRow[] = displayRows.map((displayRow) =>
    displayRow.kind === 'mask'
      ? { id: `mask:${displayRow.ownerKind}:${displayRow.owner.id}`, ownerId: displayRow.owner.id, ownerKind: displayRow.ownerKind, kind: 'mask' }
      : displayRow.node.kind === 'group'
        ? { id: displayRow.node.id, ownerId: displayRow.node.id, ownerKind: 'group', kind: 'group' }
        : { id: displayRow.node.id, ownerId: displayRow.node.layer.id, ownerKind: 'layer', kind: 'layer' }
  )

  const maskRows = new Set(
    displayRows
      .filter((displayRow): displayRow is Extract<LayerDisplayRow, { kind: 'mask' }> => displayRow.kind === 'mask')
      .map((displayRow) => maskOwnerFrameKey(displayRow.ownerKind, displayRow.owner.id, ''))
  )

  const rawMaskVisualEntries = maskSnapshotEntries.filter((entry) => maskRows.has(maskOwnerFrameKey(entry.ownerKind, entry.ownerId, '')))

  const maskVisualIdByMaskId = new Map<string, string>()

  for (const entry of rawMaskVisualEntries)
    if (!maskVisualIdByMaskId.has(entry.mask.id)) maskVisualIdByMaskId.set(entry.mask.id, `mask-slot:${entry.ownerKind}:${entry.ownerId}:${entry.frameId}`)

  const visualCells: TimelineVisualCell[] = [
    ...timeline.cels.map((cel) => ({
      id: cel.id,
      key: animationCelKey(cel.layerId, cel.frameId),
      ownerId: cel.layerId,
      ownerKind: 'layer' as const,
      frameId: cel.frameId,
      kind: 'cel' as const,
      linkSourceId: cel.linkedCelId ?? null
    })),
    ...rawMaskVisualEntries.map((entry) => ({
      id: `mask-slot:${entry.ownerKind}:${entry.ownerId}:${entry.frameId}`,
      key: animationCelKey(entry.ownerId, entry.frameId),
      ownerId: entry.ownerId,
      ownerKind: entry.ownerKind,
      frameId: entry.frameId,
      kind: 'mask' as const,
      linkSourceId: entry.linkSourceId ? (maskVisualIdByMaskId.get(entry.linkSourceId) ?? null) : null
    }))
  ]

  const visualSelectedFrameIds = animationGestureSelection
    ? animationGestureSelection.kind === 'frame'
      ? animationGestureSelection.ids
      : []
    : session.selectedAnimationFrameIds

  const visualSelectedFrameIdSet = new Set(visualSelectedFrameIds)

  const visualSelectedCellKeys = animationGestureSelection
    ? animationGestureSelection.kind === 'cel'
      ? animationGestureSelection.keys
      : []
    : session.selectedAnimationCellKeys

  const visualSelectedMaskCellKeys = animationGestureSelection
    ? animationGestureSelection.kind === 'mask'
      ? animationGestureSelection.keys
      : []
    : session.selectedAnimationMaskCellKeys

  // Store selection keeps descendant layer ids mirrored for whole-group
  // commands.  Those implicit members must not leak into timeline visuals.
  const effectiveSelectedGroupIds =
    session.selectedGroupIds.length > 0 ? [...new Set(session.selectedGroupIds)] : session.selectedGroupId ? [session.selectedGroupId] : []

  const contextGroupId = timelineActiveRow?.kind === 'group' ? timelineActiveRow.ownerId : null

  const visualContextGroupIds = effectiveSelectedGroupIds.length > 0 ? effectiveSelectedGroupIds : contextGroupId ? [contextGroupId] : []

  // A group-only selection remains the sole layer/timeline owner even while
  // the active frame or frame-column selection changes.  When layer ids are
  // also explicitly selected, this is a mixed row selection and those rows
  // must remain visible as selected in the timeline.
  // A group-only selection uses the group row as the visual owner and keeps
  // its implicit descendants out of the timeline.  Mixed group + layer
  // selections are explicit row selections, so both sides must remain
  // visible and receive the same selected styling.
  const groupVisualSelectionActive = session.selectedLayerIds.length === 0 && (effectiveSelectedGroupIds.length > 0 || contextGroupId !== null)

  const hasNonRowAnimationItemSelection =
    Boolean(animationGestureSelection) ||
    session.selectedAnimationFrameIds.length > 0 ||
    session.selectedAnimationCellKeys.length > 0 ||
    session.selectedAnimationMaskCellKeys.length > 0

  // A pending ordinary-cel gesture is already a single-cell interaction,
  // even before pointer-up commits it to the Store. Do not keep painting the
  // previous multi-layer selection underneath the cell being pressed.
  const visualSelectedLayerIds = groupVisualSelectionActive || animationGestureSelection?.kind === 'cel' ? [] : session.selectedLayerIds

  const gestureActiveFrameId = animationGestureActiveTarget?.frameId ?? null

  const visualActiveFrameId = gestureActiveFrameId ?? timeline.activeFrameId

  // A selected group owns the timeline focus. Its descendant activeLayerId is
  // an internal document cursor only and must not light a child current-cel.
  // A transient ordinary/group gesture owns the preview immediately; stale
  // formal mask context must not suppress its active/current visuals.
  const gestureOverridesMaskContext =
    animationGestureSelection?.kind === 'cel' ||
    (animationGestureActiveTarget?.kind === 'cel' && session.document.groups.some((group) => group.id === animationGestureActiveTarget.layerId))

  const maskVisualSelectionActive = (maskContextActive || animationGestureSelection?.kind === 'mask') && !gestureOverridesMaskContext

  // Frame focus suppresses only single-cel current markers; the document's
  // active layer row remains the ambient activity context beneath the column
  // selection.
  const visualActiveLayerId = timelineActiveRow?.kind === 'layer' ? timelineActiveRow.ownerId : null

  // Playback still paints the current ordinary cel even when a mask row is
  // retained as the user's selection context. This is a playback indicator,
  // not a change to the editing focus.
  const playbackActiveLayerId =
    groupVisualSelectionActive || timelineActiveRow?.kind === 'group'
      ? null
      : session.animationPlaying && session.document.layers.some((layer) => layer.id === session.document.activeLayerId)
      ? session.document.activeLayerId
      : visualActiveLayerId

  const visualActiveFrameIndex = timeline.frames.findIndex((frame) => frame.id === visualActiveFrameId)

  const canonicalTimelineIndex = createAnimationTimelineVisualIndex(
    timeline.frames.map((frame) => ({ id: frame.id })),
    visualCells
  )

  const derivedTimelineVisualState = deriveAnimationTimelineVisualState({
    rows: visualRows,
    frames: timeline.frames.map((frame) => ({ id: frame.id })),
    cells: visualCells,
    canonicalIndex: canonicalTimelineIndex,
    selection: {
      activeLayerId: visualActiveLayerId,
      activeFrameId: visualActiveFrameId,
      selectedLayerIds: visualSelectedLayerIds,
      selectedGroupIds: visualContextGroupIds,
      selectedFrameIds: visualSelectedFrameIds,
      selectedCellKeys: visualSelectedCellKeys,
      selectedMaskCellKeys: visualSelectedMaskCellKeys,
      animationCellSelectionExplicit: animationGestureSelection?.kind === 'cel' || session.animationCellSelectionExplicit
    },
    // Focus is resolved once from the session contract above.  Passing the
    // resolved row lets the pure derivation keep mask rows/cells current even
    // when visualActiveLayerId is intentionally null in mask mode.
    active: {
      row: timelineActiveRow,
      frameId: visualActiveFrameId,
      maskEditTargetId: timelineActiveContext.maskEditTargetId
    },
    presentation: { presentationHidden: !selectionOutlineVisible, playing: session.animationPlaying }
  })

  const timelineVisualState = {
    ...derivedTimelineVisualState,
    rows: derivedTimelineVisualState.rows.map((state) => ({
      ...state,
      active: state.row.ownerKind === 'group' ? state.selected : groupVisualSelectionActive && state.row.ownerKind === 'layer' ? false : state.active,
      selectedByCell: groupVisualSelectionActive && state.row.ownerKind === 'layer' ? false : state.selectedByCell
    }))
  }

  const visualRowStateByKey = new Map(
    timelineVisualState.rows.map((state) => [
      state.row.kind === 'mask'
        ? timelineRowKey({ kind: 'mask', ownerKind: state.row.ownerKind, ownerId: state.row.ownerId })
        : state.row.kind === 'group'
          ? timelineRowKey({ kind: 'group', ownerKind: 'group', ownerId: state.row.ownerId })
          : timelineRowKey({ kind: 'layer', ownerKind: 'layer', ownerId: state.row.ownerId }),
      state
    ])
  )

  const visualCellStateBySlot = new Map(
    timelineVisualState.cells.map((state) => [
      timelineCellSlotKey({ kind: state.kind, ownerKind: state.ownerKind, ownerId: state.ownerId, frameId: state.frameId }),
      state
    ])
  )

  const visualFrameStateById = new Map(timelineVisualState.frames.map((state) => [state.frame.id, state]))

  const displayRowGridTemplate = ['var(--animation-header-height)', ...displayRows.map(() => 'var(--layer-row-height)')].join(' ')

  const displayRowTop = (rowIndex: number): string => `calc(var(--animation-header-height) + ${Math.max(0, rowIndex)} * var(--layer-row-height))`

  const displayRowSpanHeight = (_start: number, span: number): string => `calc(${Math.max(0, span)} * var(--layer-row-height))`

  const renderedFrameIds = animationGestureSelection
    ? animationGestureSelection.kind === 'frame'
      ? animationGestureSelection.ids
      : []
    : session.selectedAnimationFrameIds

  const renderedCellKeys = animationGestureSelection
    ? animationGestureSelection.kind === 'cel'
      ? animationGestureSelection.keys
      : []
    : session.selectedAnimationCellKeys

  const selectedMaskCellKeys = animationGestureSelection
    ? animationGestureSelection.kind === 'mask'
      ? animationGestureSelection.keys
      : []
    : session.selectedAnimationMaskCellKeys

  const renderedFrameIdSet = new Set(renderedFrameIds)

  const isolatedMaskCellKey =
    session.layerMaskIsolatedView && session.activeLayerMaskId
      ? (displayRows.flatMap((displayRow) => {
          if (displayRow.kind !== 'mask') return []
          const mask = maskVisualByOwnerFrame.get(maskOwnerFrameKey(displayRow.ownerKind, displayRow.owner.id, visualActiveFrameId)) ?? null
          return mask?.id === session.activeLayerMaskId ? [animationCelKey(displayRow.owner.id, visualActiveFrameId)] : []
        })[0] ?? null)
      : null

  // A stale mask focus can survive the first render of a normal-cel gesture.
  // The current gesture owns the visual selection mode, so never render the
  // mask slot together with an ordinary cel selection.
  const maskSelectionIsActive =
    animationGestureSelection?.kind === 'mask' ||
    (!animationGestureSelection &&
      renderedCellKeys.length === 0 &&
      (selectedMaskCellKeys.length > 0 || session.activeLayerMaskId !== null || session.layerMaskIsolatedView))

  const renderedMaskCellKeys = maskSelectionIsActive ? [...new Set([...selectedMaskCellKeys, ...(isolatedMaskCellKey ? [isolatedMaskCellKey] : [])])] : []

  const renderedCellKeySet = new Set(renderedCellKeys)

  const renderedMaskCellKeySet = new Set(renderedMaskCellKeys)

  const visualSelectedMaskCellKeySet = new Set(visualSelectedMaskCellKeys)

  // Derive activity from selected cel coordinates without changing the
  // explicit selection mode stored in the session.
  const ordinaryCellTargets = [...renderedCellKeys, ...selectedAnimationGroupCellKeys]
    .map((key) => parseAnimationCelKey(key))
    .filter((target): target is { layerId: string; frameId: string } => Boolean(target))

  const maskCellTargets = renderedMaskCellKeys
    .map((key) => parseAnimationCelKey(key))
    .filter((target): target is { layerId: string; frameId: string } => Boolean(target))

  const selectedCellTargets = [...ordinaryCellTargets, ...maskCellTargets]

  // Mask-only selections must not project a column guide onto ordinary layer
  // rows. Keep the aggregate set used by ordinary-cell rendering scoped to
  // ordinary cel targets; mask cells render their own owner-gated activity.
  const selectedCellFrameIds = new Set(ordinaryCellTargets.map((target) => target.frameId))

  const selectedMaskCellFrameIds = new Set(maskCellTargets.map((target) => target.frameId))

  const selectedActivityFrameIds = new Set([...selectedCellFrameIds, ...selectedMaskCellFrameIds])

  const selectedCellLayerIds = new Set(ordinaryCellTargets.map((target) => target.layerId))

  const selectedMaskCellLayerIds = new Set(maskCellTargets.map((target) => target.layerId))

  // Masks are rendered on separate rows, so retain the complete selected
  // owner/frame domain when projecting cel activity onto mask rows.
  const selectedMaskActivityLayerIds = new Set([...selectedCellLayerIds, ...selectedMaskCellLayerIds])

  const cellSelectionActive = selectionOutlineVisible && selectedCellTargets.length > 0

  const ordinaryCelSelectionVisible =
    cellSelectionActive && renderedCellKeys.length > 0 && (session.animationCellSelectionExplicit || animationGestureSelection?.kind === 'cel')

  const hasMultipleCellSelection = renderedCellKeys.length + renderedMaskCellKeys.length > 1

  const hasMultipleLayerSelection = session.selectedLayerIds.length > 1

  const implicitLayerCellKeys = new Set(session.selectedLayerIds.map((layerId) => animationCelKey(layerId, visualActiveFrameId)))

  // Selecting multiple layers also mirrors their active-frame cels into the
  // session. Those keys are an implementation detail of row selection, not a
  // real cel selection, so they must not suppress the full-row highlight.
  const onlyImplicitLayerCellSelection =
    session.layerSelectionExplicit === true &&
    animationGestureSelection === null &&
    hasMultipleLayerSelection &&
    renderedMaskCellKeys.length === 0 &&
    renderedCellKeys.length === implicitLayerCellKeys.size &&
    renderedCellKeys.every((key) => implicitLayerCellKeys.has(key))

  const explicitMultiLayerSelection =
    session.layerSelectionExplicit === true &&
    hasMultipleLayerSelection &&
    session.selectedLayerIds.length > 1 &&
    session.selectedGroupIds.length === 0 &&
    session.selectedGroupId === null

  // Suppress the active-frame guide only while the multi-cel selection is
  // visibly shown. Hidden formal selections must still leave the normal
  // active frame/cel context visible.
  const suppressCellSelectionGuides = selectionOutlineVisible && hasMultipleCellSelection && !hasMultipleLayerSelection

  const layerSelectionActive =
    session.layerSelectionExplicit &&
    selectionOutlineVisible &&
    renderedFrameIds.length === 0 &&
    renderedCellKeys.length === 0 &&
    renderedMaskCellKeys.length === 0

  const showLayerSelectionAcrossTimeline = layerSelectionActive || onlyImplicitLayerCellSelection || explicitMultiLayerSelection

  const selectedFrameIndexes = timeline.frames.map((frame, index) => (renderedFrameIdSet.has(frame.id) ? index : -1)).filter((index) => index >= 0)

  const selectedCellFrameIndexes = timeline.frames
    .map((frame, index) => (cellSelectionActive && selectedActivityFrameIds.has(frame.id) ? index : -1))
    .filter((index) => index >= 0)

  const selectedCellFrameRanges = selectedCellFrameIndexes.reduce<Array<{ start: number; span: number }>>((ranges, index) => {
    const previous = ranges.at(-1)
    if (previous && index === previous.start + previous.span) previous.span += 1
    else ranges.push({ start: index, span: 1 })
    return ranges
  }, [])

  const selectedCellLayerRows = displayRows.flatMap((displayRow, row) => {
    const ownerId = displayRow.kind === 'node' && displayRow.node.kind === 'layer' ? displayRow.node.layer.id : null
    return cellSelectionActive && ownerId && selectedCellLayerIds.has(ownerId) ? [row] : []
  })

  const timelineActiveFrameIndex = visualActiveFrameIndex

  // The playback playhead must follow activeFrameId just like the canvas.
  // Selection guides remain visible while playing.
  // The playhead column is a frame-wide activity guide.  It intentionally
  // spans ordinary and mask rows; owner-specific mask markers are gated below.
  const showActiveFrameColumn = timelineActiveFrameIndex >= 0

  const selectedFrameRanges = selectedFrameIndexes.reduce<Array<{ start: number; span: number }>>((ranges, index) => {
    const previous = ranges.at(-1)
    if (previous && index === previous.start + previous.span) previous.span += 1
    else ranges.push({ start: index, span: 1 })
    return ranges
  }, [])

  const activeCelPreviewKind =
    gesture?.kind === 'mask'
      ? 'mask'
      : gesture?.kind === 'cel' || gesture?.kind === 'group-cel'
        ? 'cel'
        : animationGestureSelection?.kind === 'mask'
          ? 'mask'
          : animationGestureSelection?.kind === 'cel'
            ? 'cel'
            : null

  const selectedCelPositions = displayRows.flatMap((displayRow, row) => {
    if (displayRow.kind === 'mask') {
      if (activeCelPreviewKind === 'cel') return []
      return timeline.frames.flatMap((frame, column) => {
        return renderedMaskCellKeySet.has(animationCelKey(displayRow.owner.id, frame.id)) ? [{ row, column }] : []
      })
    }
    if (activeCelPreviewKind === 'mask') return []
    if (displayRow.kind !== 'node') return []
    if (displayRow.node.kind === 'group') {
      // Group cells are interaction targets only; their selection is shown by
      // the group row/timeline background, not by an independent cel box.
      return []
    }
    const layerNode = displayRow.node as Extract<LayerTreeNode, { kind: 'layer' }>
    const layerId = layerNode.layer.id
    return timeline.frames.flatMap((frame, column) => (renderedCellKeySet.has(animationCelKey(layerId, frame.id)) ? [{ row, column }] : []))
  })

  const selectedCelRow = selectedCelPositions.length > 0 ? Math.min(...selectedCelPositions.map((position) => position.row)) : -1

  const selectedCelColumn = selectedCelPositions.length > 0 ? Math.min(...selectedCelPositions.map((position) => position.column)) : -1

  const selectedCelRowSpan = selectedCelPositions.length > 0 ? Math.max(...selectedCelPositions.map((position) => position.row)) - selectedCelRow + 1 : 0

  const selectedCelColumnSpan =
    selectedCelPositions.length > 0 ? Math.max(...selectedCelPositions.map((position) => position.column)) - selectedCelColumn + 1 : 0

  const animationDisplayRowByLayerId = new Map<string, number>()

  const animationDisplayRowByMaskOwnerId = new Map<string, number>()

  displayRows.forEach((displayRow, row) => {
    if (displayRow.kind === 'node' && displayRow.node.kind === 'layer') animationDisplayRowByLayerId.set(displayRow.node.layer.id, row)
    if (displayRow.kind === 'mask') animationDisplayRowByMaskOwnerId.set(displayRow.owner.id, row)
  })

  const animationFrameIndexById = new Map(timeline.frames.map((frame, index) => [frame.id, index]))

  const animationCelDragPreview = (() => {
    const drag = gesture
    const dragKind = drag?.kind
    const dragKeys = drag && (drag.kind === 'cel' || drag.kind === 'mask') ? drag.cellKeys : []
    if ((dragKind !== 'cel' && dragKind !== 'mask') || !animationCelDragAnchorKey || !animationCelDropTargetKey || dragKeys.length === 0) return null
    const anchor = parseAnimationCelKey(animationCelDragAnchorKey)
    const target = parseAnimationCelKey(animationCelDropTargetKey)
    if (!anchor || !target) return null
    const rowForDragKey = (key: { layerId: string }): number | undefined =>
      dragKind === 'mask' ? animationDisplayRowByMaskOwnerId.get(key.layerId) : animationDisplayRowByLayerId.get(key.layerId)
    const anchorRow = rowForDragKey(anchor)
    const targetRow = rowForDragKey(target)
    const anchorColumn = animationFrameIndexById.get(anchor.frameId)
    const targetColumn = animationFrameIndexById.get(target.frameId)
    if (anchorRow === undefined || targetRow === undefined || anchorColumn === undefined || targetColumn === undefined) return null
    const sourcePositions = dragKeys.flatMap((key) => {
      const parsed = parseAnimationCelKey(key)
      if (!parsed) return []
      const row = rowForDragKey(parsed)
      const column = animationFrameIndexById.get(parsed.frameId)
      return row === undefined || column === undefined ? [] : [{ row, column }]
    })
    if (sourcePositions.length === 0) return null
    const sourceRow = Math.min(...sourcePositions.map((position) => position.row))
    const sourceColumn = Math.min(...sourcePositions.map((position) => position.column))
    return {
      row: sourceRow + targetRow - anchorRow,
      column: sourceColumn + targetColumn - anchorColumn,
      rowSpan: Math.max(...sourcePositions.map((position) => position.row)) - sourceRow + 1,
      columnSpan: Math.max(...sourcePositions.map((position) => position.column)) - sourceColumn + 1
    }
  })()

  const animationCelDragActive = animationCelDragPreview !== null

  const shouldShowAnimationCellSelectionOutline =
    selectionOutlineVisible &&
    !onlyImplicitLayerCellSelection &&
    (session.layerMaskIsolatedView ||
      animationCellSelectionOutlineVisible ||
      animationGestureSelection?.kind === 'cel' ||
      animationGestureSelection?.kind === 'mask')
  const { linkedMaskSlotVisuals, linkedCelBridgeEndKeys, linkedCelBlocks, linkedCelConnectors, linkedCelMemberKeys } = deriveTimelineLinks({
    displayRows,
    timeline,
    canonicalTimelineIndex,
    showLayerSelectionAcrossTimeline,
    session,
    renderedMaskCellKeySet,
    renderedCellKeySet,
    renderedFrameIdSet,
    playbackActiveLayerId,
    visualActiveFrameIndex
  })

  const selectedAnimationMaskOwners = new Set(session.selectedAnimationMaskRowKeys)

  const frameSelectionActiveForOutline = focusState.frameFocus || animationGestureSelection?.kind === 'frame'

  const selectedAnimationOutlineRows = displayRows.flatMap((displayRow, row) => {
    if (!timelineVisualState.selectionGuidesVisible) return []
    if (displayRow.kind === 'mask')
      return !frameSelectionActiveForOutline && selectedAnimationMaskOwners.has(`${displayRow.ownerKind}:${displayRow.owner.id}`) ? [row] : []
    const visualRow = timelineVisualState.rows[row]
    if (!layerSelectionActive || !visualRow?.selected) return []
    if (displayRow.node.kind === 'group') return effectiveSelectedGroupIds.includes(displayRow.node.group.id) ? [row] : []
    return session.selectedGroupId ? [] : [row]
  })

  // In mask mode the owner layer must not become the active row, but the
  // mask's own row still needs the timeline-wide active background. Resolve
  // that row explicitly instead of using an off-grid sentinel.
  const activeMaskAnimationRow =
    maskVisualSelectionActive && activeMaskOwnerKey
      ? displayRows.findIndex((displayRow) => displayRow.kind === 'mask' && `${displayRow.ownerKind}:${displayRow.owner.id}` === activeMaskOwnerKey)
      : -1

  const activeLayerAnimationRow = maskVisualSelectionActive
    ? activeMaskAnimationRow
    : displayRows.findIndex((displayRow) => displayRow.kind === 'node' && displayRow.node.kind === 'layer' && displayRow.node.layer.id === visualActiveLayerId)

  const activeAnimationLayerRow = groupVisualSelectionActive
    ? displayRows.findIndex(
        (displayRow) => displayRow.kind === 'node' && displayRow.node.kind === 'group' && effectiveSelectedGroupIds.includes(displayRow.node.id)
      )
    : activeLayerAnimationRow >= 0
      ? activeLayerAnimationRow
      : timelineVisualState.rows.findIndex((visualRow) => visualRow.row.ownerKind === 'group' && visualRow.active)

  const layerSelectionStart = selectedAnimationOutlineRows.length > 0 ? Math.min(...selectedAnimationOutlineRows) : 0

  const layerSelectionSpan = selectedAnimationOutlineRows.length > 0 ? Math.max(...selectedAnimationOutlineRows) - layerSelectionStart + 1 : 1
  return {
    layerById,
    freeTileSetOptions,
    displayColorStripeSegments,
    nodes,
    maskOwnerFrameKey,
    focusState,
    activeMaskOwnerKey,
    maskVisualByOwnerFrame,
    displayRows,
    visualSelectedFrameIdSet,
    effectiveSelectedGroupIds,
    groupVisualSelectionActive,
    hasNonRowAnimationItemSelection,
    gestureActiveFrameId,
    visualActiveFrameId,
    maskVisualSelectionActive,
    visualActiveLayerId,
    playbackActiveLayerId,
    timelineVisualState,
    visualRowStateByKey,
    visualCellStateBySlot,
    visualFrameStateById,
    displayRowGridTemplate,
    displayRowTop,
    displayRowSpanHeight,
    renderedFrameIds,
    renderedCellKeys,
    renderedCellKeySet,
    visualSelectedMaskCellKeySet,
    selectedCellTargets,
    selectedCellFrameIds,
    selectedMaskCellFrameIds,
    selectedActivityFrameIds,
    selectedCellLayerIds,
    selectedMaskActivityLayerIds,
    cellSelectionActive,
    ordinaryCelSelectionVisible,
    onlyImplicitLayerCellSelection,
    explicitMultiLayerSelection,
    suppressCellSelectionGuides,
    layerSelectionActive,
    selectedCellFrameRanges,
    selectedCellLayerRows,
    timelineActiveFrameIndex,
    showActiveFrameColumn,
    selectedFrameRanges,
    selectedCelPositions,
    selectedCelRow,
    selectedCelColumn,
    selectedCelRowSpan,
    selectedCelColumnSpan,
    animationCelDragPreview,
    animationCelDragActive,
    shouldShowAnimationCellSelectionOutline,
    linkedMaskSlotVisuals,
    linkedCelBridgeEndKeys,
    linkedCelBlocks,
    linkedCelConnectors,
    linkedCelMemberKeys,
    frameSelectionActiveForOutline,
    selectedAnimationOutlineRows,
    activeAnimationLayerRow,
    layerSelectionStart,
    layerSelectionSpan
  }
}
