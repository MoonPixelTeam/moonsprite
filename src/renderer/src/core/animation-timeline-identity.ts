/**
 * Canonical, typed identities used by the animation timeline.
 *
 * Legacy timeline keys (`ownerId:frameId`) intentionally remain at file and
 * UI boundaries only.  Internal maps/sets should use these identities so a
 * cel and a mask slot with the same owner/frame can never collide.
 */

export type TimelineOwnerKind = 'layer' | 'group'
export type TimelineRowKind = 'layer' | 'group' | 'mask'
export type TimelineCellKind = 'cel' | 'mask'

export type TimelineRowRef =
  | { kind: 'layer'; ownerKind: 'layer'; ownerId: string }
  | { kind: 'group'; ownerKind: 'group'; ownerId: string }
  | { kind: 'mask'; ownerKind: TimelineOwnerKind; ownerId: string }

export interface TimelineCellRef {
  kind: TimelineCellKind
  ownerKind: TimelineOwnerKind
  ownerId: string
  frameId: string
}

// The version prefix leaves room for future key format changes while keeping
// keys human-readable in logs and snapshots. JSON encoding makes arbitrary
// ids (including ':' and '|') round-trip without delimiter collisions.
const KEY_VERSION = 'tl1'

const encode = (parts: readonly string[]): string => `${KEY_VERSION}:${JSON.stringify(parts)}`

// Hot-path slot key. Length-prefixing is collision-free for arbitrary ids but
// avoids JSON parsing/stringifying in the row×frame visual derivation loops.
const lengthPrefixed = (value: string): string => `${value.length}:${value}`

const decode = (key: string): string[] | null => {
  if (!key.startsWith(`${KEY_VERSION}:`)) return null
  try {
    const value: unknown = JSON.parse(key.slice(KEY_VERSION.length + 1))
    if (!Array.isArray(value) || value.some((part) => typeof part !== 'string')) return null
    return value as string[]
  } catch {
    return null
  }
}

export const timelineRowKey = (ref: TimelineRowRef): string => encode([ref.kind, ref.ownerKind, ref.ownerId])

export const timelineCellKey = (ref: TimelineCellRef): string =>
  encode([ref.kind, ref.ownerKind, ref.ownerId, ref.frameId])

export const timelineCellSlotKey = (ref: TimelineCellRef): string =>
  `${lengthPrefixed(ref.kind)}${lengthPrefixed(ref.ownerKind)}${lengthPrefixed(ref.ownerId)}${lengthPrefixed(ref.frameId)}`

export const parseTimelineRowKey = (key: string): TimelineRowRef | null => {
  const parts = decode(key)
  if (!parts || parts.length !== 3) return null
  const [kind, ownerKind, ownerId] = parts
  if (!ownerId) return null
  if (kind === 'layer' && ownerKind === 'layer') return { kind, ownerKind, ownerId }
  if (kind === 'group' && ownerKind === 'group') return { kind, ownerKind, ownerId }
  if (kind === 'mask' && (ownerKind === 'layer' || ownerKind === 'group')) {
    return { kind, ownerKind, ownerId }
  }
  return null
}

export const parseTimelineCellKey = (key: string): TimelineCellRef | null => {
  const parts = decode(key)
  if (!parts || parts.length !== 4) return null
  const [kind, ownerKind, ownerId, frameId] = parts
  if (!ownerId || !frameId || (ownerKind !== 'layer' && ownerKind !== 'group')) return null
  if (kind !== 'cel' && kind !== 'mask') return null
  return { kind, ownerKind, ownerId, frameId }
}

/** Adapt a legacy `ownerId:frameId` key when its row/cell kind is known. */
export const timelineCellRefFromLegacyKey = (
  key: string,
  kind: TimelineCellKind,
  ownerKind: TimelineOwnerKind,
): TimelineCellRef | null => {
  const typed = parseTimelineCellKey(key)
  if (typed) return typed.kind === kind && typed.ownerKind === ownerKind ? typed : null
  // A key carrying our version prefix is malformed typed data, not a legacy
  // owner:frame key; never reinterpret it at the compatibility boundary.
  if (key.startsWith(`${KEY_VERSION}:`)) return null
  const separator = key.lastIndexOf(':')
  if (separator <= 0 || separator === key.length - 1) return null
  return {
    kind,
    ownerKind,
    ownerId: key.slice(0, separator),
    frameId: key.slice(separator + 1),
  }
}

/** Construct a visual ref for an empty mask slot without creating a document cel. */
export const timelineMaskSlotRef = (ownerKind: TimelineOwnerKind, ownerId: string, frameId: string): TimelineCellRef => ({
  kind: 'mask',
  ownerKind,
  ownerId,
  frameId,
})
