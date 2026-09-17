import type { TabletPreferences, RotationIndicatorPosition } from '@/core/file-preferences'
import { rotateViewAroundViewportPoint, viewPanDeltaFromScreen, zoomViewAroundViewportPoint, type ViewGeometryState } from '@/core/view-geometry'

type Point = { x: number; y: number }
type Size = { width: number; height: number }
interface TouchEvent {
  pointerType: string
  pointerId: number
  clientX: number
  clientY: number
  currentTarget: Pick<HTMLCanvasElement, 'setPointerCapture' | 'hasPointerCapture' | 'releasePointerCapture' | 'style'>
  preventDefault(): void
}
export interface TouchNavigationPorts {
  read(): {
    preferences: Pick<TabletPreferences, 'api' | 'touchMode' | 'twoFingerZoomEnabled' | 'twoFingerRotateEnabled'>
    view: ViewGeometryState
    documentSize: Size
    viewportSize: Size
    rotationIndicatorPosition: RotationIndicatorPosition
  }
  beginPan(point: Point): void
  endPan(commit: boolean): void
  preview(view: ViewGeometryState): void
  finishPinch(commitRotation: boolean): void
  constrain(view: ViewGeometryState, size: Size): ViewGeometryState
  clampZoom(zoom: number): number
  grabbingCursor: string
}

const centerOf = (points: Point[]): Point => ({ x: points.reduce((sum, p) => sum + p.x, 0) / points.length, y: points.reduce((sum, p) => sum + p.y, 0) / points.length })
const distanceOf = (points: Point[]): number => Math.max(1, Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y))
const angleOf = (points: Point[]): number => Math.atan2(points[1].y - points[0].y, points[1].x - points[0].x) * 180 / Math.PI

/** Owns pointer membership and pinch snapshots. It cannot access document commands. */
export function createCanvasTouchNavigation(readPorts: () => TouchNavigationPorts) {
  const pointers = new Map<number, Point>()
  let gesture: { center: Point; distance: number; angle: number; view: ViewGeometryState } | null = null
  const reset = (): void => { pointers.clear(); gesture = null }
  const capturePan = (event: TouchEvent, id: number, point: Point): void => {
    const ports = readPorts()
    ports.beginPan(point)
    event.currentTarget.setPointerCapture(id)
    event.currentTarget.style.cursor = ports.grabbingCursor
  }
  return {
    reset,
    down(event: TouchEvent): boolean {
      const ports = readPorts(), state = ports.read(), prefs = state.preferences
      if (event.pointerType !== 'touch' || prefs.touchMode === 'disabled' || prefs.api === 'disabled') return event.pointerType === 'touch'
      if (prefs.touchMode === 'draw') return false
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (pointers.size === 1) {
        gesture = null
        capturePan(event, event.pointerId, { x: event.clientX, y: event.clientY })
        event.preventDefault()
      } else if (pointers.size === 2) {
        ports.endPan(true)
        const points = [...pointers.values()]
        gesture = { center: centerOf(points), distance: distanceOf(points), angle: angleOf(points), view: { ...ports.read().view } }
        event.currentTarget.setPointerCapture(event.pointerId)
        event.preventDefault()
      }
      return true
    },
    move(event: TouchEvent): boolean {
      if (event.pointerType !== 'touch') return false
      const ports = readPorts(), state = ports.read(), prefs = state.preferences
      if (prefs.api === 'disabled' || prefs.touchMode === 'disabled') { event.preventDefault(); return true }
      if (pointers.has(event.pointerId)) pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (!gesture || pointers.size < 2) return false
      const points = [...pointers.values()], center = centerOf(points), size = state.viewportSize
      let next = gesture.view
      if (prefs.twoFingerZoomEnabled) next = zoomViewAroundViewportPoint(next, ports.clampZoom(gesture.view.zoom * distanceOf(points) / gesture.distance), gesture.center, size.width, size.height, state.documentSize.width, state.documentSize.height, state.rotationIndicatorPosition)
      const pan = viewPanDeltaFromScreen(center.x - gesture.center.x, center.y - gesture.center.y, gesture.view.rotation, state.rotationIndicatorPosition, Boolean(gesture.view.mirrored), Boolean(gesture.view.mirroredVertical))
      next = { ...next, panX: next.panX + pan.x, panY: next.panY + pan.y }
      if (prefs.twoFingerRotateEnabled) {
        const rotation = gesture.view.rotation + angleOf(points) - gesture.angle
        const rotated = rotateViewAroundViewportPoint(next, rotation, center, size.width, size.height, state.rotationIndicatorPosition)
        next = { ...next, panX: rotated.panX, panY: rotated.panY, rotation }
      }
      ports.preview(ports.constrain(next, size))
      event.currentTarget.style.cursor = ports.grabbingCursor
      event.preventDefault()
      return true
    },
    up(event: TouchEvent, canceled = false): boolean {
      if (event.pointerType !== 'touch') return false
      const ports = readPorts(), prefs = ports.read().preferences
      pointers.delete(event.pointerId)
      if (prefs.api === 'disabled' || prefs.touchMode === 'disabled') { event.preventDefault(); return true }
      if (prefs.touchMode !== 'navigate') return false
      if (canceled) {
        reset()
        ports.endPan(false)
        ports.finishPinch(false)
      } else if (gesture) {
        if (pointers.size === 0) {
          gesture = null
          ports.finishPinch(prefs.twoFingerRotateEnabled)
        } else if (pointers.size === 1) {
          gesture = null
          const [id, point] = [...pointers][0]
          capturePan(event, id, point)
        }
      } else return false // The canvas completes the remaining one-finger pan.
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
      event.preventDefault()
      return true
    }
  }
}
