import type { DocumentSession } from '@/store/workspace'
import type { AnimationCelLookup } from '@/core/animation'
import type { AnimationTimeline } from '@shared/types-animation'
import { animationCelHasContent } from '@/core/animation'
import { animationMaskSlotAt } from '@/core/document-model'

/** Summarize whether a layer has maskable content and an unmasked frame. */
export function layerContextMaskStatus(
  session: DocumentSession,
  timeline: AnimationTimeline,
  celLookup: AnimationCelLookup,
  layerId: string | null
): { hasContent: boolean; canCreate: boolean } {
  if (!layerId) return { hasContent: false, canCreate: false }
  if (session.document.layers.find(layer => layer.id === layerId)?.kind === 'adjustment') {
    return { hasContent: true, canCreate: timeline.frames.some(frame => !animationMaskSlotAt(timeline, layerId, frame.id)) }
  }
  let hasContent = false
  let canCreate = false
  for (const cel of timeline.cels) {
    if (cel.layerId !== layerId) continue
    const source = celLookup.resolve(cel) ?? cel
    if (!animationCelHasContent(source, session.document.palette)) continue
    hasContent = true
    if (!animationMaskSlotAt(timeline, cel.layerId, cel.frameId)) canCreate = true
  }
  return { hasContent, canCreate }
}
