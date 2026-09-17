import type { SpriteDocument } from '@shared/types-document'
import { createAnimationMaskLookup, findLayerMask, getLayerIdsInGroup } from '@/core/document-model'
import { activateAnimationFrame, animationCelKey, ensureAnimationDocument, parseAnimationCelKey } from '@/core/animation'
import { type LayerPanelRowMoveTarget } from '@/core/layer-operations'
import { buildLayerPanelTree } from '@/core/layer-panel-layout'
import type { TimelineRowRef } from '@/core/animation-timeline-identity'
import { exitLayerMaskEditing } from './workspace-session'
import type { DocumentSession } from './workspace-types'
import { ensureTileSelection } from './workspace-tile-selection'
import { ensureFreeTileInstanceSelection, clearFreeTileInstanceSelection } from './workspace-free-tile-selection'

export const selectedGroupRows = (session: DocumentSession): string[] =>
  session.selectedGroupIds.length > 0 ? [...session.selectedGroupIds] : session.selectedGroupId ? [session.selectedGroupId] : []

export const selectedDirectLayerRows = (session: DocumentSession): string[] =>
  // Descendant layers are implicit only for a pure single-group selection.
  // Mixed group + layer selections keep their explicit layer ids; an active
  // group context must never hide those ids from grouping, moving, or range
  // insertion commands.
  session.selectedGroupId
    && selectedGroupRows(session).length === 1
    && session.selectedLayerIds.length === 0
    ? []
    : [...session.selectedLayerIds]

export const timelineRowsEqual = (left: TimelineRowRef | null, right: TimelineRowRef | null): boolean =>
  left === right || Boolean(left && right
    && left.kind === right.kind
    && left.ownerKind === right.ownerKind
    && left.ownerId === right.ownerId)

export const setTimelineActiveContext = (
  session: DocumentSession,
  row: TimelineRowRef,
  frameId = session.document.animation?.activeFrameId ?? null,
  maskEditTargetId: string | null = row.kind === 'mask' ? session.activeLayerMaskId : null
): void => {
  const current = session.timelineActiveContext
  if (timelineRowsEqual(current.row, row) && current.frameId === frameId && current.maskEditTargetId === maskEditTargetId) return
  session.timelineActiveContext = { row: { ...row }, frameId, maskEditTargetId }
}

export const ensureLayerSelection = (session: DocumentSession): void => {
  const validLayerIds = new Set(session.document.layers.map((layer) => layer.id))
  const validGroupIds = new Set(session.document.groups.map((group) => group.id))
  session.selectedLayerIds = [...new Set(session.selectedLayerIds)].filter((id) => validLayerIds.has(id))
  session.selectedGroupIds = [...new Set(session.selectedGroupIds)].filter((id) => validGroupIds.has(id))
  if (!session.selectedGroupId || !validGroupIds.has(session.selectedGroupId) || !session.selectedGroupIds.includes(session.selectedGroupId)) {
    session.selectedGroupId = null
  }

  const fallbackLayerId = validLayerIds.has(session.document.activeLayerId)
    ? session.document.activeLayerId
    : session.selectedLayerIds.at(-1) ?? session.document.layers.at(-1)?.id
  if (fallbackLayerId && session.document.activeLayerId !== fallbackLayerId) session.document.activeLayerId = fallbackLayerId

  const animationSelectionActive = session.selectedAnimationFrameIds.length > 0
    || session.selectedAnimationCellKeys.length > 0
    || session.selectedAnimationMaskCellKeys.length > 0
    || session.selectedAnimationMaskRowKeys.length > 0
  // `selectedLayerIds` also preserves the implicit active editing target for
  // existing commands.  Its visual treatment is controlled separately by
  // `layerSelectionExplicit`.
  if (!animationSelectionActive && session.selectedLayerIds.length === 0 && session.selectedGroupIds.length === 0 && fallbackLayerId) {
    session.selectedLayerIds = [fallbackLayerId]
  }
  const anchorIsValid = session.layerSelectionAnchorId
    && (validLayerIds.has(session.layerSelectionAnchorId) || validGroupIds.has(session.layerSelectionAnchorId))
  if (!anchorIsValid) {
    session.layerSelectionAnchorId = session.selectedGroupIds.at(-1) ?? session.selectedLayerIds.at(-1) ?? fallbackLayerId ?? null
  }
  ensureTileSelection(session)
  ensureFreeTileInstanceSelection(session)
}

export const clearAnimationMaskContext = (session: DocumentSession, preserveRowSelection = false): void => {
  session.selectedAnimationMaskCellKeys = []
  session.animationMaskCellSelectionAnchorKey = null
  if (!preserveRowSelection) session.selectedAnimationMaskRowKeys = []
  session.activeLayerMaskId = null
  session.layerMaskIsolatedView = false
  exitLayerMaskEditing(session)
}

export const clearAnimationItemSelection = (session: DocumentSession, preserveMaskRowSelection = false): void => {
  session.selectedAnimationFrameIds = []
  session.animationFrameSelectionAnchorId = null
  session.selectedAnimationCellKeys = []
  session.animationCellSelectionAnchorKey = null
  session.animationCellSelectionExplicit = false
  clearAnimationMaskContext(session, preserveMaskRowSelection)
}

export interface AnimationSelectionNormalizationOptions {
  /** Keep layer×frame cel slots selectable even when the slot is currently empty. */
  preserveEmptyCelSlots?: boolean
}

/**
 * Single cleanup boundary for timeline selection state. This function only
 * changes session/document activity context; it never touches dirty,
 * contentRevision, or history. Selection modes remain mutually exclusive for
 * frame vs ordinary/mask cel selection, while layer/group selection is allowed
 * to coexist with frame selection.
 */
export const normalizeAnimationSelection = (
  session: DocumentSession,
  options: AnimationSelectionNormalizationOptions = {}
): void => {
  const timeline = session.document.animation
  if (!timeline) {
    session.selectedAnimationFrameIds = []
    session.selectedAnimationCellKeys = []
    session.selectedAnimationMaskCellKeys = []
    session.selectedAnimationMaskRowKeys = []
    session.animationFrameSelectionAnchorId = null
    session.animationCellSelectionAnchorKey = null
    session.animationMaskCellSelectionAnchorKey = null
    session.animationCellSelectionExplicit = false
    return
  }
  const layerIds = new Set(session.document.layers.map((layer) => layer.id))
  const groupIds = new Set(session.document.groups.map((group) => group.id))
  const frameIds = new Set(timeline.frames.map((frame) => frame.id))
  const preserveEmptyCelSlots = options.preserveEmptyCelSlots === true
  const normalCelKeys = new Set(timeline.cels.map((cel) => animationCelKey(cel.layerId, cel.frameId)))
  const maskOwnerKeys = new Set<string>()
  for (const entry of timeline.layerMasks ?? []) maskOwnerKeys.add(`layer:${entry.layerId}`)
  for (const entry of timeline.groupMasks ?? []) maskOwnerKeys.add(`group:${entry.groupId}`)
  const validCelKey = (key: string): boolean => {
    const target = parseAnimationCelKey(key)
    return Boolean(target && layerIds.has(target.layerId) && frameIds.has(target.frameId) && (preserveEmptyCelSlots || normalCelKeys.has(key)))
  }
  const validMaskKey = (key: string): boolean => {
    const target = parseAnimationCelKey(key)
    return Boolean(target
      && frameIds.has(target.frameId)
      && (layerIds.has(target.layerId) ? maskOwnerKeys.has(`layer:${target.layerId}`) : groupIds.has(target.layerId) && maskOwnerKeys.has(`group:${target.layerId}`)))
  }
  const uniqueValid = (values: readonly string[], valid: (value: string) => boolean): string[] => [...new Set(values)].filter(valid)

  session.selectedLayerIds = uniqueValid(session.selectedLayerIds, (id) => layerIds.has(id))
  session.selectedGroupIds = uniqueValid(session.selectedGroupIds, (id) => groupIds.has(id))
  session.selectedAnimationFrameIds = uniqueValid(session.selectedAnimationFrameIds, (id) => frameIds.has(id))
  session.selectedAnimationCellKeys = uniqueValid(session.selectedAnimationCellKeys, validCelKey)
  session.selectedAnimationMaskCellKeys = uniqueValid(session.selectedAnimationMaskCellKeys, validMaskKey)
  session.selectedAnimationMaskRowKeys = uniqueValid(session.selectedAnimationMaskRowKeys, (key) => {
    const separator = key.indexOf(':')
    if (separator <= 0) return false
    const kind = key.slice(0, separator)
    const id = key.slice(separator + 1)
    return (kind === 'layer' ? layerIds : kind === 'group' ? groupIds : new Set<string>()).has(id)
  })

  const activeLayerId = layerIds.has(session.document.activeLayerId)
    ? session.document.activeLayerId
    : session.selectedLayerIds.at(-1) ?? session.document.layers.at(-1)?.id ?? null
  if (activeLayerId) session.document.activeLayerId = activeLayerId
  const activeFrameId = frameIds.has(timeline.activeFrameId)
    ? timeline.activeFrameId
    : timeline.frames[0]?.id ?? null
  if (activeFrameId && timeline.activeFrameId !== activeFrameId) {
    // This repair is intentionally restricted to explicit normalization
    // boundaries; mutateActive() must not silently switch frame surfaces on
    // high-frequency preview or pointer-update paths.
    activateAnimationFrame(session.document, activeFrameId)
  }

  if (session.selectedAnimationFrameIds.length > 0) {
    session.selectedAnimationCellKeys = []
    session.selectedAnimationMaskCellKeys = []
    // Frame selection may coexist with the explicitly selected mask row;
    // retain that row identity/context while clearing cel-level selections.
    session.animationCellSelectionExplicit = false
  } else if (session.selectedAnimationCellKeys.length > 0) {
    session.selectedAnimationMaskCellKeys = []
    session.selectedAnimationMaskRowKeys = []
    session.animationCellSelectionExplicit = session.animationCellSelectionExplicit === true
  } else if (session.selectedAnimationMaskCellKeys.length > 0) {
    session.selectedAnimationCellKeys = []
    session.selectedAnimationMaskRowKeys = []
    session.animationCellSelectionExplicit = false
  } else {
    session.animationCellSelectionExplicit = false
  }

  session.animationFrameSelectionAnchorId = session.selectedAnimationFrameIds.includes(session.animationFrameSelectionAnchorId ?? '')
    ? session.animationFrameSelectionAnchorId
    : session.selectedAnimationFrameIds.at(-1) ?? null
  session.animationCellSelectionAnchorKey = session.selectedAnimationCellKeys.includes(session.animationCellSelectionAnchorKey ?? '')
    ? session.animationCellSelectionAnchorKey
    : session.selectedAnimationCellKeys.at(-1) ?? null
  session.animationMaskCellSelectionAnchorKey = session.selectedAnimationMaskCellKeys.includes(session.animationMaskCellSelectionAnchorKey ?? '')
    ? session.animationMaskCellSelectionAnchorKey
    : session.selectedAnimationMaskCellKeys.at(-1) ?? null

  if (!session.selectedGroupId || !session.selectedGroupIds.includes(session.selectedGroupId)) session.selectedGroupId = null
  if (session.selectedGroupIds.length !== 1) session.selectedGroupId = null
  if (session.selectedLayerIds.length === 0
    && session.selectedGroupIds.length === 0
    && session.selectedAnimationFrameIds.length === 0
    && session.selectedAnimationCellKeys.length === 0
    && session.selectedAnimationMaskCellKeys.length === 0
    && session.selectedAnimationMaskRowKeys.length === 0
    && activeLayerId) session.selectedLayerIds = [activeLayerId]
  if (session.layerSelectionAnchorId && !layerIds.has(session.layerSelectionAnchorId) && !groupIds.has(session.layerSelectionAnchorId)) {
    session.layerSelectionAnchorId = session.selectedGroupIds.at(-1) ?? session.selectedLayerIds.at(-1) ?? activeLayerId
  }
  if (session.activeLayerMaskId && !findLayerMask(session.document, session.activeLayerMaskId)) session.activeLayerMaskId = null
}

export const clearAnimationLoopPlayback = (session: DocumentSession): void => {
  session.animationPlaybackLoopSectionId = null
  session.animationPlaybackLoopIteration = 0
  session.animationPlaybackLoopSectionRepeatIndefinitely = false
  session.animationPlaybackLoopStack = []
  session.animationPlaybackTagCycleSectionId = null
}

export const applyLayerRowSelection = (
  session: DocumentSession,
  layerIds: readonly string[],
  groupIds: readonly string[],
  focus: { kind: 'layer' | 'group'; id: string },
  options: { preserveMaskRowSelection?: boolean } = {},
): void => {
  session.layerSelectionExplicit = true
  clearAnimationMaskContext(session, options.preserveMaskRowSelection === true)
  // Selecting a normal layer row leaves Free Tile instance editing. Instance
  // selection is entered explicitly through the instance-layer view or an
  // instance row, so it must not change the meaning of layer-level commands
  // such as Delete.
  session.freeTileInstanceLayerId = null
  clearFreeTileInstanceSelection(session)
  const selectedLayers = [...new Set(layerIds)].filter((id) => session.document.layers.some((layer) => layer.id === id))
  const selectedGroups = [...new Set(groupIds)].filter((id) => session.document.groups.some((group) => group.id === id))
  session.selectedGroupIds = selectedGroups
  if (selectedGroups.length === 1 && selectedLayers.length === 0) {
    session.selectedGroupId = selectedGroups[0]
    // A group row is its own selection target.  Descendant layers are
    // resolved lazily by selectedTransformLayersForSession and group
    // commands; mirroring them into selectedLayerIds makes the timeline and
    // canvas appear to have every child selected as well.
    session.selectedLayerIds = []
  } else {
    session.selectedGroupId = null
    session.selectedLayerIds = selectedLayers
  }
  if (focus.kind === 'layer' && session.document.layers.some((layer) => layer.id === focus.id)) session.document.activeLayerId = focus.id
  else if (focus.kind === 'group') {
    const member = session.document.layers.find((layer) => getLayerIdsInGroup(session.document, focus.id).includes(layer.id))
    if (member) session.document.activeLayerId = member.id
  }
  const activeLayer = session.document.layers.find((layer) => layer.id === session.document.activeLayerId)
  const ownedTilesetId = activeLayer?.kind === 'tilemap'
    ? activeLayer.tilemapTilesetId
    : activeLayer?.kind === 'free-tile' ? activeLayer.freeTileSources?.[0]?.tilesetId : undefined
  const ownedTileset = ownedTilesetId
    ? session.document.tilesets?.find((tileset) => tileset.id === ownedTilesetId)
    : null
  if (ownedTileset) {
    session.selectedTilesetId = ownedTileset.id
    session.selectedTileId = ownedTileset.tileIds.includes(session.selectedTileId ?? '') ? session.selectedTileId : ownedTileset.tileIds[0] ?? null
    session.secondaryTileId = ownedTileset.tileIds.includes(session.secondaryTileId ?? '') ? session.secondaryTileId : ownedTileset.tileIds[0] ?? null
  }
}

export const selectedRowInsertionTarget = (session: DocumentSession): LayerPanelRowMoveTarget => {
  const selectedGroups = new Set(selectedGroupRows(session))
  const selectedLayers = new Set(selectedDirectLayerRows(session))
  const row = buildLayerPanelTree({ layers: session.document.layers, groups: session.document.groups })
    .find((node) => node.kind === 'group' ? selectedGroups.has(node.id) : selectedLayers.has(node.id))
  return row
    ? { kind: 'row', rowKind: row.kind, id: row.id, position: 'above' }
    : { kind: 'edge', edge: 'top' }
}

export const insertionTargetParent = (document: SpriteDocument, target: LayerPanelRowMoveTarget): string | null => {
  if (target.kind !== 'row' || !target.id || !target.rowKind) return null
  return target.rowKind === 'group'
    ? document.groups.find((group) => group.id === target.id)?.parentGroupId ?? null
    : document.layers.find((layer) => layer.id === target.id)?.groupId ?? null
}

export type AnimationLayerPanelSelectionRow =
  | { kind: 'layer'; id: string }
  | { kind: 'group'; id: string }
  | { kind: 'mask'; ownerKind: 'layer' | 'group'; id: string }

export const animationLayerPanelSelectionRows = (session: DocumentSession): AnimationLayerPanelSelectionRow[] => {
  const timeline = ensureAnimationDocument(session.document)
  const maskLookup = createAnimationMaskLookup(timeline)
  const maskOwners = new Set<string>()
  for (const cel of timeline.cels) {
    if (maskLookup.has(animationCelKey(cel.layerId, cel.frameId))) maskOwners.add(`layer:${cel.layerId}`)
  }
  for (const entry of timeline.groupMasks ?? []) maskOwners.add(`group:${entry.groupId}`)
  return buildLayerPanelTree({
    layers: session.document.layers,
    groups: session.document.groups,
    collapsedGroupIds: session.collapsedGroupIds
  }).flatMap((node): AnimationLayerPanelSelectionRow[] => {
    const ownerKind = node.kind
    const rows: AnimationLayerPanelSelectionRow[] = []
    if (maskOwners.has(`${ownerKind}:${node.id}`)) rows.push({ kind: 'mask', ownerKind, id: node.id })
    rows.push({ kind: ownerKind, id: node.id })
    return rows
  })
}
