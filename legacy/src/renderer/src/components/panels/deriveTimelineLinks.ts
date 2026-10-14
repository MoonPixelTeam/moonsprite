import { animationCelKey } from '@/core/animation'
import { type DocumentSession } from '@/store/workspace'
import { timelineCellSlotKey } from '@/core/animation-timeline-identity'
import type { LayerDisplayRow } from './layer-panel-contracts'
interface Options {
  readonly groups?: ReturnType<typeof createTimelineLinkGroups>
  readonly displayRows: LayerDisplayRow[]
  readonly timeline: import('@shared/types-animation').AnimationTimeline
  readonly canonicalTimelineIndex: import('@/core/animation-timeline-visual-state').CanonicalTimelineIndex
  readonly showLayerSelectionAcrossTimeline: boolean
  readonly session: DocumentSession
  readonly renderedMaskCellKeySet: Set<string>
  readonly renderedCellKeySet: Set<string>
  readonly renderedFrameIdSet: Set<string>
  readonly selectionVisible: boolean
}

type LinkGroups = ReturnType<typeof createTimelineLinkGroups>
// A group list belongs to one panel topology. Selection and playhead changes
// do not change its membership, adjacency or bridge geometry.
const geometryCache = new WeakMap<LinkGroups, ReturnType<typeof createLinkGeometry>>()

function createLinkGeometry(groups: LinkGroups, timeline: Options['timeline']) {
  const linkedMaskSlotVisuals = new Map<string, { withPrevious: boolean; withNext: boolean }>()
  const linkedCelMemberKeys = new Set<string>()
  const entries = groups.map(group => {
    const groupKey = `${group.kind}:${group.ownerKind}:${group.layerId}:${group.sourceId}`
    const cellKeys = group.frameIndexes.map(index => animationCelKey(group.layerId, timeline.frames[index].id))
    const memberKeys = cellKeys.map(key => `${group.kind}|${key}`)
    for (const key of memberKeys) linkedCelMemberKeys.add(key)
    const bridgeEndKeys: string[] = []
    const connectors: Array<{ key: string; groupKey: string; row: number; start: number; end: number }> = []
    const blocks: Array<{ key: string; groupKey: string; row: number; start: number; span: number }> = []
    let start = group.frameIndexes[0]
    for (let index = 0; index < group.frameIndexes.length; index++) {
      const frameIndex = group.frameIndexes[index]
      const next = group.frameIndexes[index + 1]
      if (group.kind === 'mask') linkedMaskSlotVisuals.set(
        timelineCellSlotKey({kind: 'mask', ownerKind: group.ownerKind, ownerId: group.layerId, frameId: timeline.frames[frameIndex].id}),
        {withPrevious: index > 0 && group.frameIndexes[index - 1] === frameIndex - 1, withNext: next === frameIndex + 1})
      if (next === frameIndex + 1) continue
      blocks.push({key: `${group.layerId}:${group.sourceId}:${start}`, groupKey, row: group.row, start, span: frameIndex - start + 1})
      if (next > frameIndex + 1) {
        connectors.push({key: `${group.layerId}:${group.sourceId}:${frameIndex}-${next}`, groupKey, row: group.row, start: frameIndex, end: next})
        for (let frame = frameIndex; frame < next; frame++) bridgeEndKeys.push(`${group.kind}|${animationCelKey(group.layerId, timeline.frames[frame].id)}`)
      }
      start = next
    }
    const frameIds = group.frameIndexes.map(index => timeline.frames[index].id)
    return {group, cellKeys, memberKeys, bridgeEndKeys, frameIds, blocks, connectors}
  })
  return {entries, linkedMaskSlotVisuals, linkedCelMemberKeys}
}
export function deriveTimelineLinks({
  groups,
  displayRows,
  timeline,
  canonicalTimelineIndex,
  showLayerSelectionAcrossTimeline,
  session,
  renderedMaskCellKeySet,
  renderedCellKeySet,
  renderedFrameIdSet,
  selectionVisible
}: Options) {
  const selectedLayers = new Set(session.selectedLayerIds)
  const linkGroups = groups ?? createTimelineLinkGroups({displayRows, timeline, canonicalTimelineIndex})
  let geometry = geometryCache.get(linkGroups)
  if (!geometry) {
    geometry = createLinkGeometry(linkGroups, timeline)
    geometryCache.set(linkGroups, geometry)
  }
  const {linkedMaskSlotVisuals, linkedCelMemberKeys} = geometry
  const linkedCelBridgeEndKeys = new Set<string>()
  const selectedLinkedCelMemberKeys = new Set<string>()
  const linkedCelBlocks: Array<typeof geometry.entries[number]['blocks'][number] & {selected: boolean; layerSelected: boolean}> = []
  const linkedCelConnectors: Array<typeof geometry.entries[number]['connectors'][number] & {selected: boolean; layerSelected: boolean}> = []
  for (const entry of geometry.entries) {
    const {group} = entry
    const layerSelected = group.kind !== 'mask' && showLayerSelectionAcrossTimeline && selectedLayers.has(group.layerId) && !session.selectedGroupId
    const selectedCells = group.kind === 'mask' ? renderedMaskCellKeySet : renderedCellKeySet
    const selected = selectionVisible && (
      Boolean(session.layerSelectionExplicit && layerSelected)
      || entry.frameIds.some((frameId, index) => renderedFrameIdSet.has(frameId) || selectedCells.has(entry.cellKeys[index]))
    )
    for (const block of entry.blocks) linkedCelBlocks.push({...block, selected, layerSelected})
    if (!selected) continue
    for (const key of entry.memberKeys) selectedLinkedCelMemberKeys.add(key)
    for (const key of entry.bridgeEndKeys) linkedCelBridgeEndKeys.add(key)
    for (const connector of entry.connectors) linkedCelConnectors.push({...connector, selected, layerSelected})
  }
  return { linkedMaskSlotVisuals, linkedCelBridgeEndKeys, linkedCelBlocks, linkedCelConnectors, linkedCelMemberKeys, selectedLinkedCelMemberKeys }
}

export function createTimelineLinkGroups({displayRows, timeline, canonicalTimelineIndex}: Pick<Options, 'displayRows' | 'timeline' | 'canonicalTimelineIndex'>) {
  return displayRows.flatMap((displayRow, row) => {
    const owner = displayRow.kind === 'node' && displayRow.node.kind === 'layer' ? displayRow.node.layer : displayRow.kind === 'mask' ? displayRow.owner : null
    if (!owner) return []
    const bySource = new Map<string, number[]>()
    timeline.frames.forEach((frame, frameIndex) => {
      const slot =
        displayRow.kind === 'mask'
          ? canonicalTimelineIndex.maskByOwnerFrame.get(
              timelineCellSlotKey({ kind: 'mask', ownerKind: displayRow.ownerKind, ownerId: owner.id, frameId: frame.id })
            )
          : canonicalTimelineIndex.celByOwnerFrame.get(timelineCellSlotKey({ kind: 'cel', ownerKind: 'layer', ownerId: owner.id, frameId: frame.id }))
      const sourceId = slot
        ? ((displayRow.kind === 'mask' ? canonicalTimelineIndex.maskRootById.get(slot.id) : canonicalTimelineIndex.celRootById.get(slot.id)) ?? slot.id)
        : null
      if (!sourceId) return
      const indexes = bySource.get(sourceId) ?? []
      indexes.push(frameIndex)
      bySource.set(sourceId, indexes)
    })
    return [...bySource.entries()]
      .filter(([, frameIndexes]) => frameIndexes.length > 1)
      .map(([sourceId, frameIndexes]) => ({
        kind: displayRow.kind === 'mask' ? ('mask' as const) : ('cel' as const),
        ownerKind: displayRow.kind === 'mask' ? displayRow.ownerKind : ('layer' as const),
        layerId: owner.id,
        row,
        sourceId,
        frameIndexes,
        frameIndexSet: new Set(frameIndexes)
      }))
  })

 }
