import type { SpriteDocument } from '@shared/types-document'

type Entry = { revision: number | undefined; contentRevision: number | undefined; references: unknown[]; signature: string; key: string }
const keys = new WeakMap<SpriteDocument, Entry>()
let serial = 0

/** Store metadata/full invalidation advances layersPanelRevision. UI/playback
 * and regional pixel writes do not alter timeline topology. Unversioned callers
 * are checked each time so low-level construction never reuses a stale key. */
export function layerPanelTopologyKey(document: SpriteDocument, revision?: number, contentRevision?: number): string {
  const timeline = document.animation
  const references = [document.layers, document.layers.length, document.groups, document.groups.length,
    timeline, timeline?.frames, timeline?.frames.length, timeline?.cels, timeline?.cels.length,
    timeline?.layerMasks, timeline?.layerMasks?.length, timeline?.groupMasks, timeline?.groupMasks?.length]
  const previous = keys.get(document)
  if (revision !== undefined && previous?.revision === revision && previous.contentRevision === contentRevision && references.every((value, index) => value === previous.references[index])) return previous.key
  const signature = [
    document.layers.map(layer => `${layer.id}:${layer.groupId ?? ''}:${layer.kind}:${layer.freeTileSetId ?? ''}:${layer.freeTileSources?.length ?? 0}`).join('\u0001'),
    document.groups.map(group => `${group.id}:${group.parentGroupId ?? ''}`).join('\u0001'),
    timeline?.frames.map(frame => `${frame.id}:${frame.duration}`).join('\u0001'),
    timeline?.cels.map(cel => `${cel.id}:${cel.layerId}:${cel.frameId}:${cel.linkedCelId ?? ''}:${cel.zIndex ?? 0}`).join('\u0001'),
    timeline?.layerMasks?.map(entry => `${entry.layerId}:${entry.frameId}:${entry.mask.id}:${entry.mask.linkedMaskId ?? ''}:${entry.mask.visible}`).join('\u0001'),
    timeline?.groupMasks?.map(entry => `${entry.groupId}:${entry.frameId}:${entry.mask.id}:${entry.mask.linkedMaskId ?? ''}:${entry.mask.visible}`).join('\u0001')
  ].join('\u0002')
  const key = previous?.signature === signature ? previous.key : `topology-${++serial}`
  keys.set(document, { revision, contentRevision, references, signature, key })
  return key
}
