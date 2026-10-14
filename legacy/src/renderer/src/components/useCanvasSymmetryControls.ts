import { useRef } from 'react'
import { type DocumentSession } from '@/store/workspace'
import { type CanvasPoint as Point } from '@/core/canvas-input'
import { hasSymmetry, symmetryAxisDragAllowed, symmetryAxisSegment, type SymmetryAxis } from '@/core/symmetry'
import { SymmetryDragState, symmetryGuideAxisEnabled } from './canvas-stage-helpers'
interface Ports {
  readonly symmetryAxisPreferences: import('@/core/file-preferences').SymmetryAxisPreferences
  readonly session: DocumentSession
  readonly localContinuousPointAt: (clientX: number, clientY: number) => Point | null
  readonly symmetryCenter: import('@/core/symmetry').SymmetryCenter
  readonly liveViewRef: import('react').RefObject<import('@shared/types-view').ViewState>
}

export function useCanvasSymmetryControls(ports: Ports) {
  const symmetryDragRef = useRef<SymmetryDragState | null>(null)

  const distanceToSegment = (point: Point, start: Point, end: Point): number => {
    const dx = end.x - start.x
    const dy = end.y - start.y
    const lengthSquared = dx * dx + dy * dy
    if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y)
    const ratio = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared))
    return Math.hypot(point.x - (start.x + ratio * dx), point.y - (start.y + ratio * dy))
  }

  const symmetryAxisHitAt = (clientX: number, clientY: number, ctrlHeld = false): SymmetryAxis | 'center' | null => {
    if (!symmetryAxisDragAllowed(ports.symmetryAxisPreferences.locked, ctrlHeld) || !hasSymmetry(ports.session.symmetryAxes)) return null
    const point = ports.localContinuousPointAt(clientX, clientY)
    if (!point) return null
    const centerDistance = Math.hypot(point.x - ports.symmetryCenter.x, point.y - ports.symmetryCenter.y)
    const centerRadius = Math.max(0.35, 9 / ports.liveViewRef.current.zoom)
    if (centerDistance <= centerRadius) return 'center'
    const lineRadius = Math.max(0.25, Math.max(7, ports.symmetryAxisPreferences.thickness / 2 + 4) / ports.liveViewRef.current.zoom)
    let best: { axis: SymmetryAxis; distance: number } | null = null
    for (const axis of ['horizontal', 'vertical', 'diagonalUp', 'diagonalDown'] as SymmetryAxis[]) {
      if (!symmetryGuideAxisEnabled(ports.session.symmetryAxes, axis)) continue
      const segment = symmetryAxisSegment(axis, ports.session.document.width, ports.session.document.height, ports.symmetryCenter)
      if (!segment) continue
      const distance = distanceToSegment(point, segment.start, segment.end)
      if (distance <= lineRadius && (!best || distance < best.distance)) best = { axis, distance }
    }
    return best?.axis ?? null
  }
  return { symmetryDragRef, symmetryAxisHitAt }
}
