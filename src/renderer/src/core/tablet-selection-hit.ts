import type { CanvasPoint } from './canvas-input-contracts'
import type { SelectionHandle } from './canvas-input-state'

/** Keep a 44 CSS-pixel target while resolving overlapping handles by distance. */
export function tabletSelectionHandleHit(point: CanvasPoint, handles: readonly { handle: SelectionHandle; point: CanvasPoint }[], zoom: number): SelectionHandle | null {
  let closest: SelectionHandle | null = null, best = (22 / Math.max(0.0001, zoom)) ** 2
  for (const item of handles) {
    const distance = (point.x - item.point.x) ** 2 + (point.y - item.point.y) ** 2
    if (distance < best) { best = distance; closest = item.handle }
  }
  return closest
}
