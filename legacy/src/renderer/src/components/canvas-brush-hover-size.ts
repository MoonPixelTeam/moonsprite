import type { BrushDynamicsSettings } from '@/core/pressure'

/** Hover has no meaningful pressure; show the configured minimum footprint. */
export function canvasBrushHoverSize(session: { brushSize: number; brushDynamics: BrushDynamicsSettings }): number {
  const mapping = session.brushDynamics.effects.size
  return mapping.sensor === 'pressure'
    ? Math.max(1, Math.round(session.brushSize * mapping.outputMin / 100))
    : session.brushSize
}
