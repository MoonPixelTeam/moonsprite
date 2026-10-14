export type RangeValueKind = 'number' | 'percentage'

const clampRangeValue = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value))

export const rangeValueWithShiftStep = (
  value: number,
  min: number,
  max: number,
  step: number,
  kind: RangeValueKind,
  shiftKey: boolean
): number => {
  const clamped = clampRangeValue(value, min, max)
  if (!shiftKey || clamped === min || clamped === max) return clamped
  const modifierStep = kind === 'percentage' ? 10 : 5
  const effectiveStep = Math.max(Number.isFinite(step) && step > 0 ? step : 1, modifierStep)
  return clampRangeValue(Math.round(clamped / effectiveStep) * effectiveStep, min, max)
}
