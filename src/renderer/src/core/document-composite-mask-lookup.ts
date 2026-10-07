import type { AnimationTimeline } from '@shared/types-animation'
import type { LayerMask } from '@shared/types-layer'

/** A batch-local index: current links are read on every resolve, with no retained snapshots. */
export const createCompositeMaskLookup = (timeline: AnimationTimeline) => {
  let slots: { layers: Map<string, Map<string, LayerMask>>; groups: Map<string, Map<string, LayerMask>> } | undefined
  const add = (owners: Map<string, Map<string, LayerMask>>, owner: string, frame: string, mask: LayerMask) => {
    const frames = owners.get(owner) ?? new Map<string, LayerMask>()
    // Match animationMaskSlotAt's first slot occurrence and layer-before-group priority.
    if (!frames.has(frame)) frames.set(frame, mask)
    owners.set(owner, frames)
  }
  const slotsFor = () => {
    if (slots) return slots
    const layers = new Map<string, Map<string, LayerMask>>()
    const groups = new Map<string, Map<string, LayerMask>>()
    for (const entry of timeline.layerMasks ?? []) add(layers, entry.layerId, entry.frameId, entry.mask)
    for (const entry of timeline.groupMasks ?? []) add(groups, entry.groupId, entry.frameId, entry.mask)
    slots = { layers, groups }
    return slots
  }
  let byId: Map<string, LayerMask> | undefined
  const resolve = (mask: LayerMask | null): LayerMask | null => {
    if (!mask?.linkedMaskId) return mask
    if (!byId) {
      byId = new Map()
      for (const entry of timeline.layerMasks ?? []) byId.set(entry.mask.id, entry.mask)
      for (const entry of timeline.groupMasks ?? []) byId.set(entry.mask.id, entry.mask)
    }
    const visited = new Set<string>()
    let current = mask
    while (current.linkedMaskId) {
      if (visited.has(current.id)) return mask
      visited.add(current.id)
      const linked = byId.get(current.linkedMaskId)
      if (!linked) return mask
      current = linked
    }
    return current
  }
  return {
    at: (owner: string, frame: string): LayerMask | null => {
      const slots = slotsFor()
      return resolve(slots.layers.get(owner)?.get(frame) ?? slots.groups.get(owner)?.get(frame) ?? null)
    },
    resolve
  }
}
