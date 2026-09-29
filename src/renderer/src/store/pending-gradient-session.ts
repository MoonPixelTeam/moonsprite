import { createCompositePointSampler } from '@/core/document-composite'
import { gradientRegionSelection } from '@/core/gradient'
import { isLayerEffectivelyLocked } from '@/core/document-model'
import type { PendingGradient } from '@/core/canvas-gradient-confirmation'
import { activePaintLayer } from './workspace-session'
import type { DocumentSession } from './workspace-types'

export function captureGradientContext(session: DocumentSession) {
  return { document: session.document, revision: session.contentRevision,
    frameId: session.document.animation?.activeFrameId, layer: activePaintLayer(session),
    selection: session.selection, maskId: session.activeLayerMaskId,
    width: session.document.width, height: session.document.height }
}
export function gradientContextMatches(context: ReturnType<typeof captureGradientContext>, session: DocumentSession): boolean {
  return session.document === context.document && session.contentRevision === context.revision
    && session.document.animation?.activeFrameId === context.frameId
    && activePaintLayer(session) === context.layer && session.selection === context.selection
    && session.activeLayerMaskId === context.maskId && !session.animationPlaying
    && session.document.width === context.width && session.document.height === context.height
    && !isLayerEffectivelyLocked(session.document, context.layer)
}

// Keep the original seed: moving the gradient handles changes its geometry,
// not the color-matched region selected when drawing began.
export function refreshPendingGradientRegion(pending: PendingGradient, session: DocumentSession): void {
  const key = `${session.gradientTolerance}:${session.gradientContiguous}:${session.fillReference}:${session.fillConnectivity}`
  if (pending.regionKey === key) return
  const seed = pending.regionOrigin ?? pending.drag.start
  pending.drag.gradientPaintRegion = gradientRegionSelection(session.document, pending.targetLayer, seed,
    session.gradientTolerance, session.gradientContiguous, {
      sourceColorAt: session.fillReference === 'visible-layers' ? createCompositePointSampler(session.document) : undefined,
      connectivity: session.fillConnectivity
    })
  pending.regionKey = key
}
