import { hasReliableBrushPressure, isPressurePointerType } from './pressure'


export interface PointerClientPoint {
  clientX: number
  clientY: number
  pressure?: number
  pointerType?: string
  pressureAvailable?: boolean
  previousPressure?: number
  timeStamp?: number
}

export interface CoalescedPointerEvent extends PointerClientPoint {
  getCoalescedEvents?: () => PointerClientPoint[]
}

export interface CanvasPointerDeviceEvent {
  pointerId: number
  pointerType: string
  timeStamp: number
  pressure?: number
  buttons?: number
  button?: number
}

export const isPenPointer = (pointerType: string | undefined): boolean => pointerType === 'pen'

/** Windows Ink reports the pen tail as button 5. Some WebViews expose the
 * same eraser as the pen's eraser bit instead. */
export const isPenEraserEvent = (event: Pick<CanvasPointerDeviceEvent, 'pointerType' | 'button' | 'buttons'>): boolean => isPenPointer(event.pointerType) && (event.button === 5 || Boolean((event.buttons ?? 0) & 32))

export const isPenBarrelButtonEvent = (event: Pick<CanvasPointerDeviceEvent, 'pointerType' | 'button' | 'buttons'>): boolean => isPenPointer(event.pointerType) && (event.button === 2 || Boolean((event.buttons ?? 0) & 2))

export const PEN_COMPATIBLE_MOUSE_SUPPRESSION_MS = 240

export interface AdaptedPointerPressure {
  pointerType: string
  pressure?: number
  previousPressure?: number
  pressureAvailable: boolean
}

interface PointerPressureStream {
  pointerType: string
  lastPressure?: number
  pressureAvailable: boolean
}

/**
 * Keeps device classification separate from pressure capability.  This is
 * important on Windows where some tablet stacks expose a stylus as a mouse:
 * the ordinary compatibility value (0.5) stays mouse input, while a stream
 * that emits an actual non-default/changing pressure value is promoted for
 * the rest of that pointer interaction.
 */
export class PointerPressureAdapter {
  private streams = new Map<number, PointerPressureStream>()

  adapt(event: Pick<CanvasPointerDeviceEvent, 'pointerId' | 'pointerType' | 'pressure' | 'buttons'>): AdaptedPointerPressure {
    const previous = this.streams.get(event.pointerId)
    const pointerType = event.pointerType?.trim() || previous?.pointerType || 'mouse'
    const pressure = Number.isFinite(event.pressure) ? Math.max(0, Math.min(1, event.pressure!)) : undefined
    const effectivePressure = pressure ?? previous?.lastPressure
    let pressureAvailable = previous?.pressureAvailable ?? false

    // A few WebView/tablet combinations expose the pen path but report a
    // missing/zero pressure sample (and sometimes even `buttons=0`) while the
    // tip is down. The resolver keeps those individual samples on the
    // full-strength fallback; once a finite sample arrives it can be used
    // immediately because the pointer type already proves the device class.
    // A pointer explicitly identified as a pen/stylus is already a trusted
    // pressure device. Some Wacom/Windows Ink profiles emit the first samples
    // with a missing or unchanged pressure value; waiting for a change would
    // incorrectly disable pressure for the whole stroke. Missing samples are
    // still handled by the pressure resolver's full-strength fallback.
    if (isPressurePointerType(pointerType)) pressureAvailable = true
    else if (!pressureAvailable && hasReliableBrushPressure(pointerType, pressure, previous?.lastPressure)) pressureAvailable = true

    this.streams.set(event.pointerId, {
      pointerType,
      // Missing samples are common when a WebView drops a coalesced packet
      // retain the last finite value so a later changing sample can still
      // prove the pressure axis.
      lastPressure: pressure ?? previous?.lastPressure,
      pressureAvailable
    })
    return {
      pointerType,
      // Reuse the last finite sample if this packet omitted pressure. This
      // avoids a one-frame full-strength jump after a dropped coalesced packet.
      ...(effectivePressure === undefined ? {} : { pressure: effectivePressure }),
      ...(previous?.lastPressure === undefined ? {} : { previousPressure: previous.lastPressure }),
      pressureAvailable
    }
  }

  release(pointerId: number): void {
    this.streams.delete(pointerId)
  }

  reset(): void {
    this.streams.clear()
  }

  isPressureCapable(pointerId: number): boolean {
    return this.streams.get(pointerId)?.pressureAvailable ?? false
  }
}

export const coalescedPointerClientPoints = (event: CoalescedPointerEvent): PointerClientPoint[] => {
  let coalesced: PointerClientPoint[] = []
  try {
    coalesced = event.getCoalescedEvents?.() ?? []
  } catch {
    coalesced = []
  }
  const points: PointerClientPoint[] = []
  const append = (point: PointerClientPoint): void => {
    if (!Number.isFinite(point.clientX) || !Number.isFinite(point.clientY)) return
    const pressure = Number.isFinite(point.pressure) ? point.pressure : undefined
    const pointerType = typeof point.pointerType === 'string' ? point.pointerType : undefined
    const timeStamp = Number.isFinite(point.timeStamp) ? point.timeStamp : undefined
    const previous = points.at(-1)
    if (previous?.clientX === point.clientX && previous.clientY === point.clientY && previous.pressure === pressure && previous.pointerType === pointerType && previous.timeStamp === timeStamp) return
    points.push({
      clientX: point.clientX,
      clientY: point.clientY,
      ...(pressure === undefined ? {} : { pressure }),
      ...(pointerType === undefined ? {} : { pointerType }),
      ...(timeStamp === undefined ? {} : { timeStamp })
    })
  }
  for (const point of coalesced) append(point)
  append(event)
  return points
}

export interface BrushSpeedState {
  clientX: number
  clientY: number
  timeStamp: number
  speed: number
}

export const BRUSH_SPEED_EMA_TIME_CONSTANT_MS = 55

export const BRUSH_SPEED_STOP_MS = 160

export const BRUSH_SPEED_LIMIT = 4000

export const beginBrushSpeedTracking = (sample: PointerClientPoint): BrushSpeedState | undefined =>
  Number.isFinite(sample.clientX) && Number.isFinite(sample.clientY) && Number.isFinite(sample.timeStamp)
    ? {
        clientX: sample.clientX,
        clientY: sample.clientY,
        timeStamp: sample.timeStamp!,
        speed: 0
      }
    : undefined

export function updateBrushSpeedTracking(previous: BrushSpeedState | undefined, sample: PointerClientPoint): { state: BrushSpeedState | undefined; speed: number } {
  const initial = beginBrushSpeedTracking(sample)
  if (!initial) return { state: previous, speed: previous?.speed ?? 0 }
  if (!previous) return { state: initial, speed: 0 }
  const elapsed = initial.timeStamp - previous.timeStamp
  if (elapsed <= 0) return { state: previous, speed: previous.speed }
  if (elapsed >= BRUSH_SPEED_STOP_MS) return { state: { ...initial, speed: 0 }, speed: 0 }
  const distance = Math.hypot(initial.clientX - previous.clientX, initial.clientY - previous.clientY)
  const instantaneous = Math.min(BRUSH_SPEED_LIMIT, (distance * 1000) / elapsed)
  const alpha = 1 - Math.exp(-elapsed / BRUSH_SPEED_EMA_TIME_CONSTANT_MS)
  const speed = Math.min(BRUSH_SPEED_LIMIT, previous.speed + (instantaneous - previous.speed) * alpha)
  return { state: { ...initial, speed }, speed }
}
