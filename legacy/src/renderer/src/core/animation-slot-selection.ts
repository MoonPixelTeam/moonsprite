import { animationCelKey, parseAnimationCelKey } from './animation'

/** Selected slots reverse in timeline order independently within each row. */
export function animationReversedSlotTargets(keys: readonly string[], frameIds: readonly string[]): Map<string, string> {
  const indexes = new Map(frameIds.map((id, index) => [id, index]))
  const rows = new Map<string, string[]>()
  for (const key of new Set(keys)) {
    const slot = parseAnimationCelKey(key)
    if (!slot || !indexes.has(slot.frameId)) continue
    const row = rows.get(slot.layerId) ?? []
    row.push(slot.frameId)
    rows.set(slot.layerId, row)
  }
  const targets = new Map<string, string>()
  for (const [layerId, frames] of rows) {
    frames.sort((a, b) => indexes.get(a)! - indexes.get(b)!)
    frames.forEach((frameId, index) => {
      const target = frames[frames.length - 1 - index]
      if (target !== frameId) targets.set(animationCelKey(layerId, frameId), target)
    })
  }
  return targets
}

/** Selection is a rectangle of slots, regardless of whether they hold content. */
export function animationSlotRange(ownerIds: readonly string[], frameIds: readonly string[], anchorKey: string, targetKey: string): string[] {
  const anchor = parseAnimationCelKey(anchorKey)
  const target = parseAnimationCelKey(targetKey)
  if (!anchor || !target) return [targetKey]
  const aRow = ownerIds.indexOf(anchor.layerId), bRow = ownerIds.indexOf(target.layerId)
  const aFrame = frameIds.indexOf(anchor.frameId), bFrame = frameIds.indexOf(target.frameId)
  if (Math.min(aRow, bRow, aFrame, bFrame) < 0) return [targetKey]
  return ownerIds.slice(Math.min(aRow, bRow), Math.max(aRow, bRow) + 1).flatMap((id) =>
    frameIds.slice(Math.min(aFrame, bFrame), Math.max(aFrame, bFrame) + 1).map((frameId) => animationCelKey(id, frameId)))
}

/** Linking also fills empty gaps between selected endpoints, per owner. */
export function animationLinkSlotKeys(keys: readonly string[], ownerIds: readonly string[], frameIds: readonly string[], hasContent: (key: string) => boolean): string[] {
  const selected = new Set<string>()
  const spans = new Map<string, { first: number; last: number }>()
  for (const key of keys) {
    const target = parseAnimationCelKey(key)
    if (!target || !ownerIds.includes(target.layerId)) continue
    const index = frameIds.indexOf(target.frameId)
    if (index < 0) continue
    selected.add(key)
    const span = spans.get(target.layerId)
    spans.set(target.layerId, { first: Math.min(span?.first ?? index, index), last: Math.max(span?.last ?? index, index) })
  }
  for (const [ownerId, span] of spans) for (let i = span.first + 1; i < span.last; i++) {
    const key = animationCelKey(ownerId, frameIds[i])
    if (!hasContent(key)) selected.add(key)
  }
  return [...selected]
}

export function animationSlotsCanLink(keys: readonly string[], hasContent: (key: string) => boolean): boolean {
  const owners = new Map<string, { count: number; content: boolean }>()
  for (const key of new Set(keys)) {
    const target = parseAnimationCelKey(key)
    if (!target) continue
    const state = owners.get(target.layerId) ?? { count: 0, content: false }
    state.count++
    state.content ||= hasContent(key)
    owners.set(target.layerId, state)
  }
  return [...owners.values()].some((state) => state.count > 1 && state.content)
}
