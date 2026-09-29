import type { CanvasDragState, CanvasPoint } from './canvas-input'
import type { RasterLayer } from '@shared/types-layer'

export type PendingGradient = {
  drag: CanvasDragState
  targetLayer: RasterLayer
  selection?: import('@shared/types-selection').SelectionMask | null
  regionOrigin?: CanvasPoint
  regionKey?: string
  committing?: boolean
  apply: () => boolean | void
  cancel: () => void
}
const pending = new Map<string, PendingGradient>()
const listeners = new Set<() => void>()
const emit = (): void => listeners.forEach(listener => listener())

export const subscribePendingGradient = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
export const pendingGradientFor = (documentId: string): PendingGradient | null => pending.get(documentId) ?? null
export const setPendingGradient = (documentId: string, value: PendingGradient | null): void => {
  if (value) pending.set(documentId, value)
  else pending.delete(documentId)
  emit()
}

export type GradientEditHandle = 'start' | 'end' | 'move'

export function gradientEditHandle(drag: CanvasDragState, point: CanvasPoint, zoom: number, radial: boolean): GradientEditHandle | null {
  if (drag.kind !== 'gradient') return null
  const radius = Math.max(3, 9 / Math.max(zoom, 0.01))
  const distance = (a: CanvasPoint, b: CanvasPoint): number => Math.hypot(a.x - b.x, a.y - b.y)
  if (radial) {
    const center = drag.gradientRadialGeometry?.center ?? drag.start
    if (distance(point, center) <= radius) return 'move'
    return distance(point, drag.last) <= radius ? 'end' : null
  }
  if (distance(drag.start, drag.last) <= radius && distance(point, drag.last) <= radius) return 'end'
  if (distance(point, drag.start) <= radius) return 'start'
  if (distance(point, drag.last) <= radius) return 'end'
  const dx = drag.last.x - drag.start.x
  const dy = drag.last.y - drag.start.y
  const lengthSquared = dx * dx + dy * dy
  if (!lengthSquared) return null
  const position = Math.max(0, Math.min(1, ((point.x - drag.start.x) * dx + (point.y - drag.start.y) * dy) / lengthSquared))
  const nearest = { x: drag.start.x + position * dx, y: drag.start.y + position * dy }
  return distance(point, nearest) <= radius ? 'move' : null
}
