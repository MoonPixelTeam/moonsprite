import type { SelectionRect } from '@shared/types-selection'
import type { SpriteDocument } from '@shared/types-document'
import { refreshActiveAnimationFrame } from './animation'
import { documentVisibleContentBounds } from './document-composite-region'

/** Returns the union of visible composite bounds across every animation frame. */
export function documentAnimationVisibleContentBounds(document: SpriteDocument): SelectionRect | null {
  const timeline = document.animation
  if (!timeline || timeline.frames.length < 2) return documentVisibleContentBounds(document)
  const originalFrameId = timeline.activeFrameId
  let union: SelectionRect | null = null
  try {
    for (const frame of timeline.frames) {
      timeline.activeFrameId = frame.id
      // The compositor reads the document layers for its fast paths. Apply the
      // frame cel surfaces without syncing them back from the previous frame.
      refreshActiveAnimationFrame(document)
      const bounds = documentVisibleContentBounds(document)
      if (!bounds) continue
      if (!union) union = { ...bounds }
      else {
        const left = Math.min(union.x, bounds.x)
        const top = Math.min(union.y, bounds.y)
        const right = Math.max(union.x + union.width, bounds.x + bounds.width)
        const bottom = Math.max(union.y + union.height, bounds.y + bounds.height)
        union = { x: left, y: top, width: right - left, height: bottom - top }
      }
    }
  } finally {
    timeline.activeFrameId = originalFrameId
    refreshActiveAnimationFrame(document)
  }
  return union
}
