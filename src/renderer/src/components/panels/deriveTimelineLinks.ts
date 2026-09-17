import { animationCelKey } from '@/core/animation'
import { type DocumentSession } from '@/store/workspace'
import { timelineCellSlotKey } from '@/core/animation-timeline-identity'
import type { LayerDisplayRow } from './layer-panel-contracts'
interface Options {
  readonly displayRows: LayerDisplayRow[]
  readonly timeline: import('@shared/types-animation').AnimationTimeline
  readonly canonicalTimelineIndex: import('@/core/animation-timeline-visual-state').CanonicalTimelineIndex
  readonly showLayerSelectionAcrossTimeline: boolean
  readonly session: DocumentSession
  readonly renderedMaskCellKeySet: Set<string>
  readonly renderedCellKeySet: Set<string>
  readonly renderedFrameIdSet: Set<string>
  readonly playbackActiveLayerId: string | null
  readonly visualActiveFrameIndex: number
}
export function deriveTimelineLinks({
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
}: Options) {
  const linkedCelGroups = displayRows.flatMap((displayRow, row) => {
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
        frameIndexSet: new Set(frameIndexes),
        layerSelected:
          displayRow.kind === 'mask' ? false : showLayerSelectionAcrossTimeline && session.selectedLayerIds.includes(owner.id) && !session.selectedGroupId
      }))
  })

  const linkedGroupKey = (group: { kind: 'cel' | 'mask'; ownerKind: 'layer' | 'group'; layerId: string; sourceId: string }): string =>
    `${group.kind}:${group.ownerKind}:${group.layerId}:${group.sourceId}`

  const groupCellKey = (group: { kind: 'cel' | 'mask'; layerId: string }, frameId: string): string => animationCelKey(group.layerId, frameId)

  const selectedLinkedCelGroups = new Set<string>()

  for (const group of linkedCelGroups) {
    const selectedCells = group.kind === 'mask' ? renderedMaskCellKeySet : renderedCellKeySet
    let selected = false
    for (const frameIndex of group.frameIndexes) {
      const frameId = timeline.frames[frameIndex].id
      if (renderedFrameIdSet.has(frameId) || selectedCells.has(groupCellKey(group, frameId))) {
        selected = true
        break
      }
    }
    if (selected) selectedLinkedCelGroups.add(linkedGroupKey(group))
  }

  const highlightedLinkedCelGroups = new Set([
    ...selectedLinkedCelGroups,
    ...linkedCelGroups
      // The active layer/frame is an implicit visual focus. When that slot is
      // part of a linked run, keep the run highlighted even before the user
      // explicitly selects a cel or layer row.
      .filter(
        (group) => (group.layerSelected || (group.kind === 'cel' && group.layerId === playbackActiveLayerId)) && group.frameIndexSet.has(visualActiveFrameIndex)
      )
      .map(linkedGroupKey)
  ])

  const linkedMaskSlotVisuals = new Map<string, { withPrevious: boolean; withNext: boolean }>()

  for (const group of linkedCelGroups) {
    if (group.kind !== 'mask') continue
    for (let index = 0; index < group.frameIndexes.length; index += 1) {
      const frameIndex = group.frameIndexes[index]
      linkedMaskSlotVisuals.set(
        timelineCellSlotKey({ kind: 'mask', ownerKind: group.ownerKind, ownerId: group.layerId, frameId: timeline.frames[frameIndex].id }),
        {
          withPrevious: index > 0 && group.frameIndexes[index - 1] === frameIndex - 1,
          withNext: index + 1 < group.frameIndexes.length && group.frameIndexes[index + 1] === frameIndex + 1
        }
      )
    }
  }

  const linkedCelBridgeEndKeys = new Set(
    linkedCelGroups.flatMap((group) => {
      if (!highlightedLinkedCelGroups.has(linkedGroupKey(group))) return []
      return group.frameIndexes.flatMap((frameIndex, index) => {
        const nextFrameIndex = group.frameIndexes[index + 1]
        // Suppress every interior divider crossed by a visible bridge,
        // including unrelated or empty cells between its linked endpoints.
        return nextFrameIndex > frameIndex + 1
          ? timeline.frames.slice(frameIndex, nextFrameIndex).map((frame) => `${group.kind}|${animationCelKey(group.layerId, frame.id)}`)
          : []
      })
    })
  )

  const linkedCelBlocks = linkedCelGroups.flatMap((group) => {
    const blocks: Array<{ key: string; groupKey: string; row: number; start: number; span: number; selected: boolean; layerSelected: boolean }> = []
    const groupKey = linkedGroupKey(group)
    let start = group.frameIndexes[0]
    let previous = start
    for (let index = 1; index <= group.frameIndexes.length; index += 1) {
      const current = group.frameIndexes[index]
      if (current === previous + 1) {
        previous = current
        continue
      }
      const span = previous - start + 1
      blocks.push({
        key: `${group.layerId}:${group.sourceId}:${start}`,
        groupKey,
        row: group.row,
        start,
        span,
        selected: highlightedLinkedCelGroups.has(groupKey),
        layerSelected: group.layerSelected
      })
      start = current
      previous = current
    }
    return blocks
  })

  const linkedCelConnectors = linkedCelGroups.flatMap((group) => {
    const groupKey = linkedGroupKey(group)
    if (!highlightedLinkedCelGroups.has(groupKey)) return []
    return group.frameIndexes.flatMap((frameIndex, index) => {
      const nextFrameIndex = group.frameIndexes[index + 1]
      return nextFrameIndex > frameIndex + 1
        ? [
            {
              key: `${group.layerId}:${group.sourceId}:${frameIndex}-${nextFrameIndex}`,
              groupKey,
              row: group.row,
              start: frameIndex,
              end: nextFrameIndex,
              selected: highlightedLinkedCelGroups.has(groupKey),
              layerSelected: group.layerSelected
            }
          ]
        : []
    })
  })

  // Membership and adjacency are separate visual states: an isolated cel in a
  // linked group still needs to sit above the bridge layer so its thumbnail is
  // visible at enlarged densities.
  const linkedCelMemberKeys = new Set(
    linkedCelGroups.flatMap((group) =>
      group.frameIndexes.map((frameIndex) => `${group.kind}|${animationCelKey(group.layerId, timeline.frames[frameIndex].id)}`)
    )
  )
  return { linkedMaskSlotVisuals, linkedCelBridgeEndKeys, linkedCelBlocks, linkedCelConnectors, linkedCelMemberKeys }
}
