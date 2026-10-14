import type { AnimationCel, AnimationTimeline } from '@shared/types-animation'

interface CachedResolver {
  cels: readonly AnimationCel[]
  count: number
  byId: Map<string, AnimationCel>
  resolve: (cel: AnimationCel | null) => AnimationCel | null
}

const resolvers = new WeakMap<AnimationTimeline, CachedResolver>()

/** Reuses the cel ID map while following current link fields on every resolve. */
export const resolveAnimationCelCached = (timeline: AnimationTimeline, cel: AnimationCel | null): AnimationCel | null => {
  if (!cel?.linkedCelId) return cel
  let cached = resolvers.get(timeline)
  if (!cached || cached.cels !== timeline.cels || cached.count !== timeline.cels.length) {
    const byId = new Map(timeline.cels.map((candidate) => [candidate.id, candidate]))
    cached = {
      cels: timeline.cels,
      count: timeline.cels.length,
      byId,
      resolve: (candidate) => {
        if (!candidate || !candidate.linkedCelId) return candidate
        const visited = new Set<string>()
        let current = candidate
        while (current.linkedCelId) {
          if (visited.has(current.id)) return candidate
          visited.add(current.id)
          const linked = byId.get(current.linkedCelId)
          if (!linked || linked.layerId !== candidate.layerId) return candidate
          current = linked
        }
        return current
      }
    }
    resolvers.set(timeline, cached)
  }
  return cached.resolve(cel)
}
