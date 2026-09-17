import type { AnimationCel } from '@shared/types-animation'
import type { SpriteDocument } from '@shared/types-document'
import { cloneAnimationCel, ensureAnimationDocument, syncActiveAnimationFrame } from '@/core/animation'

export const cloneAnimationCelsForLayerIds = (document: SpriteDocument, layerIds: readonly string[], frameId?: string): AnimationCel[] => {
  syncActiveAnimationFrame(document)
  const ids = new Set(layerIds)
  const timeline = ensureAnimationDocument(document)
  return timeline.cels
    .filter((cel) => ids.has(cel.layerId) && (!frameId || cel.frameId === frameId))
    .map(cloneAnimationCel)
}
