import { perfectPixelPathPoints } from '@/core/tools-shapes'
import { constrainLineEndpoint } from '@/core/pixel-line'
import type { TweenPathPoint } from '@/core/animation-tween'

export function extendTweenPath(path: readonly TweenPathPoint[], target: TweenPathPoint, constrained = false): readonly TweenPathPoint[] {
  const last = path[path.length - 1]
  const end = constrained ? constrainLineEndpoint(last, target) : target
  if (last.x === end.x && last.y === end.y) return path
  // Only the final run can lose a corner when extending the same stroke.
  const tail = perfectPixelPathPoints([...path.slice(-2), end])
  const result = path.slice(0, -2).map(point => ({ ...point }))
  for (const point of tail) {
    const a = result[result.length - 2], b = result[result.length - 1]
    if (a && b && (b.x - a.x) * (point.y - b.y) === (b.y - a.y) * (point.x - b.x)
      && (b.x - a.x) * (point.x - b.x) + (b.y - a.y) * (point.y - b.y) > 0) result.pop()
    result.push(point)
  }
  return result.length <= 2048 ? result : [...path]
}
