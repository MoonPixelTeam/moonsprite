import type { AnimationCel } from '@shared/types-animation'
import type { LayerMask } from '@shared/types-layer'
import type { SpriteDocument } from '@shared/types-document'
import { createId } from '@/core/document-model'
import { ensureAnimationDocument } from '@/core/animation'
import { createFreeTileCelData } from '@/core/free-tile'

export type AnimationMaskOwnerKind = 'layer' | 'group'

export interface AnimationMaskSlotSnapshot {
  ownerId: string
  frameId: string
  ownerKind: AnimationMaskOwnerKind
  mask: LayerMask | null
}

export const animationMaskOwnerKind = (document: SpriteDocument, ownerId: string): AnimationMaskOwnerKind | null =>
  document.layers.some((layer) => layer.id === ownerId) ? 'layer' : document.groups.some((group) => group.id === ownerId) ? 'group' : null

export const directAnimationMaskAt = (document: SpriteDocument, ownerId: string, frameId: string): LayerMask | null => {
  const timeline = ensureAnimationDocument(document)
  const kind = animationMaskOwnerKind(document, ownerId)
  if (kind === 'layer') return (timeline.layerMasks ?? []).find((entry) => entry.layerId === ownerId && entry.frameId === frameId)?.mask ?? null
  if (kind === 'group') return (timeline.groupMasks ?? []).find((entry) => entry.groupId === ownerId && entry.frameId === frameId)?.mask ?? null
  return null
}

export const cloneAnimationMaskForOwner = (source: LayerMask, ownerKind: AnimationMaskOwnerKind, ownerStorageId: string, options: { id?: string; preserveLink?: boolean } = {}): LayerMask => ({
  ...source,
  id: options.id ?? source.id,
  ownerKind: ownerKind === 'layer' ? 'cel' : 'group',
  ownerId: ownerStorageId,
  linkedMaskId: options.preserveLink === false ? null : source.linkedMaskId,
  pixels: new Uint8ClampedArray(source.pixels)
})

export const ensureAnimationCelSlot = (document: SpriteDocument, layerId: string, frameId: string): { cel: AnimationCel; created: boolean } | null => {
  const timeline = ensureAnimationDocument(document)
  const existing = timeline.cels.find((candidate) => candidate.layerId === layerId && candidate.frameId === frameId)
  const layer = document.layers.find((candidate) => candidate.id === layerId)
  if (!layer || !timeline.frames.some((frame) => frame.id === frameId)) return null
  // Every cel belonging to a free-tile layer must carry its own instance
  // container. The source tileset remains owned by the layer and is therefore
  // shared across all animation frames, while instances stay frame-local.
  if (existing) {
    if (layer.kind === 'free-tile' && !existing.freeTiles) existing.freeTiles = createFreeTileCelData()
    return { cel: existing, created: false }
  }
  const cel: AnimationCel = {
    id: createId('cel'),
    layerId,
    frameId,
    opacity: layer.opacity,
    surface: layer.format === 'rgba'
      ? { format: 'rgba', width: 1, height: 1, offsetX: 0, offsetY: 0, pixels: new Uint8ClampedArray(4) }
      : { format: 'indexed', width: 1, height: 1, offsetX: 0, offsetY: 0, pixels: new Uint32Array(1) }
  }
  if (layer.kind === 'free-tile') cel.freeTiles = createFreeTileCelData()
  timeline.cels.push(cel)
  return { cel, created: true }
}

export const setAnimationMaskSlot = (document: SpriteDocument, ownerId: string, frameId: string, mask: LayerMask | null): void => {
  const timeline = ensureAnimationDocument(document)
  const ownerKind = animationMaskOwnerKind(document, ownerId)
  if (ownerKind === 'layer') {
    if (!document.layers.some((layer) => layer.id === ownerId) || !timeline.frames.some((frame) => frame.id === frameId)) return
    timeline.layerMasks = (timeline.layerMasks ?? []).filter((entry) => entry.layerId !== ownerId || entry.frameId !== frameId)
    if (mask) timeline.layerMasks.push({ layerId: ownerId, frameId, mask: cloneAnimationMaskForOwner(mask, ownerKind, ownerId) })
    return
  }
  if (ownerKind !== 'group') return
  timeline.groupMasks = (timeline.groupMasks ?? []).filter((entry) => entry.groupId !== ownerId || entry.frameId !== frameId)
  if (mask) {
    timeline.groupMasks.push({ groupId: ownerId, frameId, mask: cloneAnimationMaskForOwner(mask, ownerKind, ownerId) })
  }
}

export const animationMaskSlotSnapshot = (document: SpriteDocument, ownerId: string, frameId: string): AnimationMaskSlotSnapshot | null => {
  const ownerKind = animationMaskOwnerKind(document, ownerId)
  if (!ownerKind) return null
  const mask = directAnimationMaskAt(document, ownerId, frameId)
  return { ownerId, frameId, ownerKind, mask: mask ? cloneAnimationMaskForOwner(mask, ownerKind, mask.ownerId) : null }
}

export const restoreAnimationMaskSlots = (document: SpriteDocument, snapshots: readonly AnimationMaskSlotSnapshot[]): void => {
  const timeline = ensureAnimationDocument(document)
  for (const snapshot of snapshots) {
    setAnimationMaskSlot(document, snapshot.ownerId, snapshot.frameId, snapshot.mask)
  }
}
