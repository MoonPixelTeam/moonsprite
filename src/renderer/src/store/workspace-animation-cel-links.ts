import type { AnimationCel, AnimationTimeline } from '@shared/types-animation'
import type { SelectionMask } from '@shared/types-selection'
import { cloneAnimationCel, resolveAnimationCel } from '@/core/animation'
import { clipAnimationCelToSelection } from './workspace-animation-cel-conversion'

/** Rebase each copied link group onto a member included in the clipboard. */
export function snapshotLinkedAnimationCels(timeline: AnimationTimeline, cels: readonly AnimationCel[], selection?: SelectionMask | null): AnimationCel[] {
  const selected = new Set(cels.map(cel => cel.id))
  const roots = new Map<string, string>()
  return cels.map(cel => {
    const source = resolveAnimationCel(timeline, cel) ?? cel
    const root = roots.get(source.id) ?? (selected.has(source.id) ? source.id : cel.id)
    roots.set(source.id, root)
    const snapshot = { ...cloneAnimationCel(source), id: cel.id, layerId: cel.layerId, frameId: cel.frameId, opacity: cel.opacity, zIndex: cel.zIndex }
    const result = selection ? clipAnimationCelToSelection(snapshot, selection) : snapshot
    result.linkedCelId = cel.id === root ? null : root
    return result
  })
}

/** Capture before detaching overwritten slots; promote a surviving group member. */
export function detachAnimationPasteTargets(timeline: AnimationTimeline, destinations: readonly AnimationCel[]): { before: AnimationCel[]; targets: AnimationCel[] } {
  const ids = new Set(destinations.map(cel => cel.id))
  const roots = new Set(destinations.map(cel => (resolveAnimationCel(timeline, cel) ?? cel).id))
  const groups = new Map<string, AnimationCel[]>()
  for (const cel of timeline.cels) {
    const root = (resolveAnimationCel(timeline, cel) ?? cel).id
    if (!roots.has(root)) continue
    const members = groups.get(root) ?? []
    members.push(cel)
    groups.set(root, members)
  }
  const targets = [...groups.values()].flat()
  const before = targets.map(cloneAnimationCel)
  for (const [root, members] of groups) {
    const remaining = members.filter(cel => !ids.has(cel.id))
    if (!ids.has(root) || !remaining.length) continue
    const source = resolveAnimationCel(timeline, members[0]) ?? members[0]
    const replacement = remaining[0]
    for (const cel of remaining) {
      cel.linkedCelId = cel === replacement ? null : replacement.id
      cel.surface = source.surface
      cel.opacity = source.opacity
      cel.zIndex = source.zIndex
      cel.text = source.text
      cel.tilemap = source.tilemap
      cel.freeTiles = source.freeTiles
    }
  }
  for (const cel of destinations) cel.linkedCelId = null
  return { before, targets }
}
