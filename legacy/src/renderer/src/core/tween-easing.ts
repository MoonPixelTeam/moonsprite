export type TweenEasing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'custom'
export type TweenCurve = readonly [number, number, number, number]
export const DEFAULT_TWEEN_CURVE: TweenCurve = [0.42, 0, 0.58, 1]
/** Exact cubic representations of the existing polynomial presets (X(t) = t). */
export const TWEEN_PRESET_CURVES: Record<Exclude<TweenEasing, 'custom'>, TweenCurve> = {
  linear: [1 / 3, 1 / 3, 2 / 3, 2 / 3],
  'ease-in': [1 / 3, 0, 2 / 3, 1 / 3],
  'ease-out': [1 / 3, 2 / 3, 2 / 3, 1],
  'ease-in-out': [1 / 3, 0, 2 / 3, 1]
}

export function validTweenCurve(value: unknown): value is TweenCurve {
  return Array.isArray(value) && value.length === 4 && value.every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1)
}

/** Solve time on the cubic's X axis before reading progress on its Y axis. */
export function tweenProgress(progress: number, easing: TweenEasing, curve: TweenCurve = DEFAULT_TWEEN_CURVE): number {
  const t = Math.max(0, Math.min(1, progress))
  if (t === 0 || t === 1) return t
  if (easing === 'ease-in') return t * t
  if (easing === 'ease-out') return 1 - (1 - t) ** 2
  if (easing === 'ease-in-out') return t * t * (3 - 2 * t)
  if (easing !== 'custom') return t
  const [x1, y1, x2, y2] = validTweenCurve(curve) ? curve : DEFAULT_TWEEN_CURVE
  const cubic = (u: number, a: number, b: number) => 3 * (1 - u) ** 2 * u * a + 3 * (1 - u) * u * u * b + u ** 3
  let low = 0, high = 1
  for (let i = 0; i < 32; i++) {
    const mid = (low + high) / 2
    if (cubic(mid, x1, x2) < t) low = mid
    else high = mid
  }
  return cubic((low + high) / 2, y1, y2)
}
