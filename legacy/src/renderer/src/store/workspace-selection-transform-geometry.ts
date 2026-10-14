import type { SelectionQuad } from '@shared/types-selection'
import type { SelectionRect } from '@shared/types-selection'
import { type SelectionShearTransform } from '@/core/selection'

export const selectionShearForAngle = (target: SelectionRect, angle: number): SelectionShearTransform | undefined => {
  const normalized = Math.max(-89, Math.min(89, Number.isFinite(angle) ? angle : 0))
  if (Math.abs(normalized) < 0.0001) return undefined
  return {
    axis: 'x',
    edge: 's',
    amount: Math.tan((normalized * Math.PI) / 180) * Math.max(1, target.height)
  }
}

export const selectionShearAngle = (target: SelectionRect, shear: SelectionShearTransform | undefined): number => {
  if (!shear || shear.amount === 0) return 0
  const reference = shear.axis === 'x' ? Math.max(1, target.height) : Math.max(1, target.width)
  return Math.round((Math.atan(shear.amount / reference) * 1800) / Math.PI) / 10
}

export const cloneSelectionQuad = (quad: SelectionQuad | null | undefined): SelectionQuad | null =>
  quad
    ? {
        nw: { ...quad.nw },
        ne: { ...quad.ne },
        se: { ...quad.se },
        sw: { ...quad.sw }
      }
    : null

export const translateSelectionQuad = (quad: SelectionQuad | null | undefined, deltaX: number, deltaY: number): SelectionQuad | null => {
  const cloned = cloneSelectionQuad(quad)
  if (!cloned) return null
  for (const corner of ['nw', 'ne', 'se', 'sw'] as const) {
    cloned[corner].x += deltaX
    cloned[corner].y += deltaY
  }
  return cloned
}
