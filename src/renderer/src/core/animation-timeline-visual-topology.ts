import type { CanonicalTimelineIndex, TimelineVisualCell, TimelineVisualFrame, TimelineVisualRow, TimelineLinkRole } from './animation-timeline-visual-state'
import { timelineCellSlotKey, type TimelineCellKind } from './animation-timeline-identity'

const cellMapKey = (kind: TimelineCellKind, ownerKind: 'layer' | 'group', ownerId: string, frameId: string): string =>
  timelineCellSlotKey({kind, ownerKind, ownerId, frameId})
const cellIdKey = (kind: TimelineCellKind, id: string): string => `${kind}:${id}`

/** Immutable layout/link facts shared by consecutive selection derivations.
 * Rebuild with the canonical index whenever document topology changes. */
export function createAnimationTimelineVisualTopology(rows: readonly TimelineVisualRow[], frames: readonly TimelineVisualFrame[], index: CanonicalTimelineIndex) {
  const frameIds = new Set(frames.map((frame) => frame.id))
  const layerIds = new Set(rows.filter((row) => row.ownerKind === 'layer').map((row) => row.ownerId))
  const groupIds = new Set(rows.filter((row) => row.ownerKind === 'group').map((row) => row.ownerId))
  const cellBySlot = new Map<string, TimelineVisualCell>()
  const rowByCellSlot = new Map<string, TimelineVisualRow>()
  for (const row of rows) rowByCellSlot.set(`${row.ownerKind}:${row.ownerId}:${row.kind === 'mask' ? 'mask' : 'cel'}`, row)
  for (const cell of [...index.celByOwnerFrame.values(), ...index.maskByOwnerFrame.values()]) {
    const row = rowByCellSlot.get(`${cell.ownerKind}:${cell.ownerId}:${cell.kind}`)
    if (!row) continue
    cellBySlot.set(cellMapKey(cell.kind, cell.ownerKind, cell.ownerId, cell.frameId), cell)
  }

  const validNormalSlots = new Set<string>()
  const validMaskSlots = new Set<string>()
  for (const row of rows) for (const frame of frames) {
    const key = `${row.ownerId}:${frame.id}`
    if (row.kind === 'mask') {
      if (cellBySlot.has(cellMapKey('mask', row.ownerKind, row.ownerId, frame.id))) validMaskSlots.add(key)
    } else if (row.ownerKind === 'layer') validNormalSlots.add(key)
  }

  const linkInfo = new Map<string, { root: TimelineVisualCell | null; stale: boolean }>()
  for (const cell of [...index.celById.values(), ...index.maskById.values()]) {
    const rootId = cell.kind === 'cel' ? index.celRootById.get(cell.id) : index.maskRootById.get(cell.id)
    const status = index.resolutionStatus.get(cellIdKey(cell.kind, cell.id))
    const root = rootId ? (cell.kind === 'cel' ? index.celById : index.maskById).get(rootId) ?? null : null
    linkInfo.set(cellIdKey(cell.kind, cell.id), { root: status === 'stale' ? null : root && root.id !== cell.id ? root : null, stale: status === 'stale' })
  }
  const groupMembers = new Map<string, TimelineVisualCell[]>()
  for (const [groupKey, members] of index.membersByRoot) {
    groupMembers.set(groupKey, [...members])
  }
  for (const [groupKey, members] of groupMembers) {
    const root = members[0]
    if (root) linkInfo.set(cellIdKey(root.kind, root.id), { root, stale: false })
  }

  const slots: Array<{ row: TimelineVisualRow; frame: TimelineVisualFrame; key: string; slotKey: string;
    kind: TimelineCellKind; cell: TimelineVisualCell | null; valid: boolean; groupId: string | null;
    groupKey: string | null; linked: boolean; role: TimelineLinkRole }> = []
  for (const row of rows) for (const frame of frames) {
    const key = `${row.ownerId}:${frame.id}`
    const kind: TimelineCellKind = row.kind === 'mask' ? 'mask' : 'cel'
    const cell = cellBySlot.get(cellMapKey(kind, row.ownerKind, row.ownerId, frame.id)) ?? null
    const valid = kind === 'mask' ? cell !== null : row.ownerKind === 'layer'
    const info = cell ? linkInfo.get(cellIdKey(cell.kind, cell.id)) : undefined
    const groupId = info?.root?.id ?? null
    const groupKey = groupId ? cellIdKey(kind, groupId) : null
    const linked = Boolean(cell?.linkSourceId || (groupKey ? (groupMembers.get(groupKey)?.length ?? 0) > 1 : false))
    const role: TimelineLinkRole = info?.stale ? 'stale' : !linked ? 'none' : info?.root?.id === cell?.id ? 'source' : 'member'
    slots.push({row, frame, key, slotKey: cellMapKey(kind, row.ownerKind, row.ownerId, frame.id), kind, cell, valid,
      groupId: info?.stale ? null : groupId, groupKey, linked, role})
  }
  const connectors = [...groupMembers].flatMap(([groupKey, members]) => {
    const groupId = members[0]?.id ?? groupKey
    const ordered = [...members].sort((a, b) => (index.frameIndexById.get(a.frameId) ?? -1) - (index.frameIndexById.get(b.frameId) ?? -1))
    return ordered.slice(1).map((to, i) => ({groupKey, groupId, from: ordered[i], to,
      bridged: (index.frameIndexById.get(to.frameId) ?? 0) - (index.frameIndexById.get(ordered[i].frameId) ?? 0) > 1}))
  })
  return {frameIds, layerIds, groupIds, validNormalSlots, validMaskSlots, slots, connectors}
}
export type AnimationTimelineVisualTopology = ReturnType<typeof createAnimationTimelineVisualTopology>
