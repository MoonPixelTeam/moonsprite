import type { AnimationCel, AnimationTimeline } from '@shared/types-animation'
import type { SpriteDocument } from '@shared/types-document'

interface CelOrderMetadata {
  cel: AnimationCel
  id: string
  layerId: string
  frameId: string
  linkedCelId: AnimationCel['linkedCelId']
  zIndex: AnimationCel['zIndex']
}

interface OrderIndex {
  cels: AnimationCel[]
  metadata: CelOrderMetadata[]
  byId: Map<string, AnimationCel> | null
  byFrame: Map<string, ReadonlyMap<string, number>>
}

const indexes = new WeakMap<AnimationTimeline, OrderIndex>()

const currentIndex = (timeline: AnimationTimeline): OrderIndex => {
  const cached = indexes.get(timeline)
  const cels = timeline.cels
  if (cached && cached.cels === cels && cached.metadata.length === cels.length) {
    let valid = true
    for (let index = 0; index < cels.length; index += 1) {
      const cel = cels[index], before = cached.metadata[index]
      if (cel !== before.cel || cel.id !== before.id || cel.layerId !== before.layerId || cel.frameId !== before.frameId || cel.linkedCelId !== before.linkedCelId || !Object.is(cel.zIndex, before.zIndex)) {
        valid = false
        break
      }
    }
    if (valid) return cached
  }
  const next: OrderIndex = {
    cels,
    metadata: cels.map(cel => ({ cel, id: cel.id, layerId: cel.layerId, frameId: cel.frameId, linkedCelId: cel.linkedCelId, zIndex: cel.zIndex })),
    byId: null,
    byFrame: new Map()
  }
  indexes.set(timeline, next)
  return next
}

/** Reuses ordering metadata only; raster data and placement are never serialized. */
export const animationLayerZIndexes = (document: SpriteDocument): Map<string, number> => {
  const timeline = document.animation
  if (!timeline) return new Map()
  const index = currentIndex(timeline)
  const cached = index.byFrame.get(timeline.activeFrameId)
  if (cached) return new Map(cached)
  const result = new Map<string, number>()
  for (const cel of timeline.cels) {
    if (cel.frameId !== timeline.activeFrameId) continue
    const visited = new Set<string>()
    let source = cel
    while (source.linkedCelId && !visited.has(source.id)) {
      visited.add(source.id)
      if (!index.byId) index.byId = new Map(timeline.cels.map(candidate => [candidate.id, candidate]))
      const linked = index.byId.get(source.linkedCelId)
      if (!linked || linked.layerId !== cel.layerId) break
      source = linked
    }
    const numeric = Number(source.zIndex)
    result.set(cel.layerId, Number.isFinite(numeric) ? Math.max(-999, Math.min(999, Math.trunc(numeric))) : 0)
  }
  // Cache only populated frames: invalid frame IDs must not accumulate entries.
  if (result.size > 0) index.byFrame.set(timeline.activeFrameId, result)
  return new Map(result)
}
