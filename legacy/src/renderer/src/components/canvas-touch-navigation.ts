import type { TabletPreferences, RotationIndicatorPosition } from '@/core/file-preferences'
import { rotateViewAroundViewportPoint, viewPanDeltaFromScreen, zoomViewAroundViewportPoint, type ViewGeometryState } from '@/core/view-geometry'

type Point = { x: number; y: number }
type Size = { width: number; height: number }
export interface TouchEvent {
  pointerType: string; pointerId: number; clientX: number; clientY: number
  currentTarget: Pick<HTMLCanvasElement, 'setPointerCapture' | 'hasPointerCapture' | 'releasePointerCapture' | 'style'>
  preventDefault(): void
}
export interface TouchNavigationPorts {
  read(): {
    preferences: Pick<TabletPreferences, 'api' | 'touchMode' | 'twoFingerZoomEnabled' | 'twoFingerRotateEnabled'> & Partial<Pick<TabletPreferences, 'gestureUndoEnabled' | 'rotationSnapEnabled' | 'longPressEyedropper'>>
    view: ViewGeometryState; documentSize: Size; viewportSize: Size; rotationIndicatorPosition: RotationIndicatorPosition
  }
  beginPan(point: Point): void
  endPan(commit: boolean): void
  preview(view: ViewGeometryState): void
  finishPinch(commitRotation: boolean): void
  constrain(view: ViewGeometryState, size: Size): ViewGeometryState
  clampZoom(zoom: number): number
  viewportPoint?(point: Point): Point
  grabbingCursor: string
  cancelDrawing?(): void
  blocked?(): boolean
  history?(action: 'undo' | 'redo'): void
  sample?(event: TouchEvent): void
  feedback?(message: 'sampling' | 'holding' | 'clear' | 'snap'): void
}
const centerOf = (p: Point[]): Point => ({ x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 })
const distanceOf = (p: Point[]) => Math.max(1, Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y))
const angleOf = (p: Point[]) => Math.atan2(p[1].y - p[0].y, p[1].x - p[0].x) * 180 / Math.PI
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

/** One touch sequence owns either drawing, navigation or sampling until all contacts end. */
export function createCanvasTouchNavigation(readPorts: () => TouchNavigationPorts) {
  const pointers = new Map<number, { point: Point; start: Point; event: TouchEvent }>()
  const ignored = new Set<number>()
  let gesture: { ids: number[]; center: Point; distance: number; angle: number; view: ViewGeometryState } | null = null
  let initial: ViewGeometryState | null = null
  let started = 0, maximum = 0, moved = false, navigated = false, pen = false, penReleased = -Infinity
  let drawing = false, sampling = false
  let hold: ReturnType<typeof setTimeout> | undefined
  const clearHold = () => { clearTimeout(hold); hold = undefined; readPorts().feedback?.('clear') }
  const release = (event: TouchEvent) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) }
  const reset = () => {
    clearHold()
    for (const { event } of pointers.values()) release(event)
    pointers.clear(); ignored.clear(); gesture = null; initial = null
    drawing = sampling = navigated = moved = false; maximum = 0
  }
  const snapshot = () => {
    const ids = [...pointers.keys()].slice(0, 2), points = ids.map(id => pointers.get(id)!.point)
    gesture = { ids, center: centerOf(points), distance: distanceOf(points), angle: angleOf(points), view: { ...readPorts().read().view } }
  }
  const capturePan = (event: TouchEvent, id: number, point: Point) => {
    readPorts().beginPan(point)
    event.currentTarget.setPointerCapture(id)
    event.currentTarget.style.cursor = readPorts().grabbingCursor
  }
  return {
    reset,
    isSampling: (pointerId: number) => sampling && pointers.has(pointerId),
    penDown() {
      if (pointers.size) {
        if (drawing || sampling) readPorts().cancelDrawing?.()
        else { readPorts().endPan(true); readPorts().finishPinch(true) }
        const ids = [...pointers.keys()]
        reset(); ids.forEach(id => ignored.add(id))
      }
      pen = true
    },
    penUp() { pen = false; penReleased = performance.now() },
    clearDevices() { reset(); pen = false; penReleased = -Infinity },
    down(event: TouchEvent): boolean {
      if (event.pointerType !== 'touch') return false
      // React clears currentTarget after dispatch; long-press/cancel must keep the surface.
      event = Object.assign(Object.create(event), { currentTarget: event.currentTarget })
      ignored.delete(event.pointerId)
      const ports = readPorts(), { preferences: prefs } = ports.read()
      if (prefs.touchMode === 'disabled' || pen || performance.now() - penReleased < 180 || ports.blocked?.()) {
        ignored.add(event.pointerId); event.preventDefault(); return true
      }
      if (pointers.size && (sampling || (drawing && (performance.now() - started > 160 || moved)))) {
        ignored.add(event.pointerId); event.preventDefault(); return true
      }
      const point = { x: event.clientX, y: event.clientY }
      pointers.set(event.pointerId, { point, start: point, event })
      maximum = Math.max(maximum, pointers.size)
      if (pointers.size === 1) {
        started = performance.now(); initial = { ...ports.read().view }; moved = navigated = false
        drawing = prefs.touchMode === 'draw'
        if (drawing) return false
        capturePan(event, event.pointerId, point)
        if (prefs.longPressEyedropper && ports.sample) {
          ports.feedback?.('holding')
          hold = setTimeout(() => {
            hold = undefined
            if (pointers.size !== 1 || moved || pen) return
            ports.endPan(false); sampling = true
            ports.sample?.(event); ports.feedback?.('sampling')
          }, 450)
        }
      } else {
        clearHold()
        if (drawing) { ports.cancelDrawing?.(); drawing = false }
        if (pointers.size === 2) { ports.endPan(true); snapshot(); for (const id of pointers.keys()) event.currentTarget.setPointerCapture(id) }
        event.currentTarget.setPointerCapture(event.pointerId)
      }
      event.preventDefault(); return true
    },
    move(event: TouchEvent): boolean {
      if (event.pointerType !== 'touch') return false
      if (ignored.has(event.pointerId) || pen || readPorts().read().preferences.touchMode === 'disabled') { event.preventDefault(); return true }
      const contact = pointers.get(event.pointerId)
      if (!contact) return false
      contact.point = { x: event.clientX, y: event.clientY }
      if (distance(contact.point, contact.start) > 7) { moved = true; clearHold() }
      if (drawing || sampling) return false
      if (!gesture) return !moved
      const ports = readPorts(), state = ports.read(), prefs = state.preferences
      const points = gesture.ids.map(id => pointers.get(id)!.point)
      if (!moved) return true
      navigated = true
      const center = centerOf(points), size = state.viewportSize
      const anchor = ports.viewportPoint?.(gesture.center) ?? gesture.center
      const localCenter = ports.viewportPoint?.(center) ?? center
      let next = gesture.view
      if (prefs.twoFingerZoomEnabled) next = zoomViewAroundViewportPoint(next, ports.clampZoom(gesture.view.zoom * distanceOf(points) / gesture.distance), anchor, size.width, size.height, state.documentSize.width, state.documentSize.height, state.rotationIndicatorPosition)
      const pan = viewPanDeltaFromScreen(center.x - gesture.center.x, center.y - gesture.center.y, gesture.view.rotation, state.rotationIndicatorPosition, Boolean(gesture.view.mirrored), Boolean(gesture.view.mirroredVertical))
      next = { ...next, panX: next.panX + pan.x, panY: next.panY + pan.y }
      if (prefs.twoFingerRotateEnabled) {
        const delta = ((angleOf(points) - gesture.angle + 540) % 360) - 180
        let rotation = gesture.view.rotation + delta
        const snapped = Math.round(rotation / 90) * 90
        if (prefs.rotationSnapEnabled !== false && Math.abs(rotation - snapped) <= 3) { rotation = snapped; ports.feedback?.('snap') }
        const rotated = rotateViewAroundViewportPoint(next, rotation, localCenter, size.width, size.height, state.rotationIndicatorPosition)
        next = { ...next, panX: rotated.panX, panY: rotated.panY, rotation }
      }
      ports.preview(ports.constrain(next, size)); event.preventDefault(); return true
    },
    up(event: TouchEvent, canceled = false): boolean {
      if (event.pointerType !== 'touch') return false
      if (ignored.delete(event.pointerId)) { release(event); return true }
      if (!pointers.has(event.pointerId)) return readPorts().read().preferences.touchMode === 'disabled'
      const ports = readPorts(), prefs = ports.read().preferences
      clearHold()
      const contact = pointers.get(event.pointerId)!
      if (distance(contact.start, { x: event.clientX, y: event.clientY }) > 7) moved = true
      const ownedDrawing = drawing || sampling
      pointers.delete(event.pointerId)
      if (canceled) {
        if (ownedDrawing) ports.cancelDrawing?.()
        else {
          ports.endPan(false)
          if (initial) ports.preview(initial)
          ports.finishPinch(false)
        }
        const remaining = [...pointers.keys()]
        reset(); remaining.forEach(id => ignored.add(id)); release(event); return true
      }
      if (ownedDrawing) { if (!pointers.size) reset(); return false }
      if (pointers.size === 0) {
        const tap = !moved && !navigated && performance.now() - started <= 300 && (maximum === 2 || maximum === 3)
        const fingers = maximum
        ports.endPan(true); ports.finishPinch(prefs.twoFingerRotateEnabled)
        reset(); release(event)
        if (tap && prefs.gestureUndoEnabled !== false) ports.history?.(fingers === 2 ? 'undo' : 'redo')
        return true
      }
      if (gesture?.ids.includes(event.pointerId)) {
        ports.finishPinch(prefs.twoFingerRotateEnabled)
        if (pointers.size >= 2) snapshot()
        else {
          gesture = null
          const [id, contact] = [...pointers][0]
          capturePan(event, id, contact.point)
        }
      }
      release(event); event.preventDefault(); return true
    }
  }
}
