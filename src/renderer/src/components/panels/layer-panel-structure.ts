import { createTimelineLinkGroups } from './deriveTimelineLinks'
import { createAnimationTimelineVisualTopology } from '@/core/animation-timeline-visual-topology'
import type { RgbaColor } from '@shared/types-color'
import type { LayerGroup, RasterLayer } from '@shared/types-layer'
import type { AnimationTimeline } from '@shared/types-animation'
import type { DocumentSession } from '@/store/workspace'
import { buildLayerPanelTree } from '@/core/layer-panel-layout'
import { animationCelKey } from '@/core/animation'
import { createAnimationTimelineVisualIndex, type TimelineVisualCell, type TimelineVisualRow } from '@/core/animation-timeline-visual-state'
import type { LayerDisplayRow, LayerTreeNode } from './layer-panel-contracts'

/** Topology is independent of pointer position, selection and active frame. */
export function createLayerPanelStructure(session: DocumentSession, timeline: AnimationTimeline, inlineMasks = false) {
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

  const maskVisualByOwnerFrame = new Map(maskSnapshotEntries.map((entry) => [maskOwnerFrameKey(entry.ownerKind, entry.ownerId, entry.frameId), entry.mask]))

  const animationMaskLayerIds = new Set(maskSnapshotEntries.filter((entry) => entry.ownerKind === 'layer').map((entry) => entry.ownerId))

  const animationMaskGroupIds = new Set(maskSnapshotEntries.filter((entry) => entry.ownerKind === 'group').map((entry) => entry.ownerId))

  const displayRows: LayerDisplayRow[] = nodes.flatMap((node): LayerDisplayRow[] => {
    const hasMask = node.kind === 'layer' ? animationMaskLayerIds.has(node.layer.id) : animationMaskGroupIds.has(node.group.id)
    if (!hasMask || inlineMasks) return [{ kind: 'node', node }]
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

  const canonicalTimelineIndex = createAnimationTimelineVisualIndex(
    timeline.frames.map((frame) => ({ id: frame.id })),
    visualCells
  )

  const visualTopology = createAnimationTimelineVisualTopology(visualRows, timeline.frames, canonicalTimelineIndex)

  const linkedGroups = createTimelineLinkGroups({displayRows, timeline, canonicalTimelineIndex})
  const celRowByOwner = new Map<string, number>()
  const maskRowByOwner = new Map<string, number>()
  displayRows.forEach((item, row) => {
    if (item.kind === 'mask') maskRowByOwner.set(item.owner.id, row)
    else celRowByOwner.set(item.node.id, row)
  })

  return { linkedGroups, celRowByOwner, maskRowByOwner, visualTopology, layerById, groupById, freeTileSetOptions, displayColorStripeSegments, nodes, maskOwnerFrameKey,
    maskVisualByOwnerFrame, displayRows, visualRows, visualCells, canonicalTimelineIndex }
}
