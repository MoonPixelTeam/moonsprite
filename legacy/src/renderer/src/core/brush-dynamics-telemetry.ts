export interface BrushDynamicsTelemetrySnapshot {
  documentId: string
  pressure: number | null
  speed: number
  pointerType: string | null
  active: boolean
}

type BrushDynamicsTelemetryListener = () => void

let snapshot: BrushDynamicsTelemetrySnapshot | null = null
let pendingSnapshot: BrushDynamicsTelemetrySnapshot | null = null
let frameHandle: number | null = null
const listeners = new Set<BrushDynamicsTelemetryListener>()

const notify = (): void => {
  frameHandle = null
  if (pendingSnapshot) {
    snapshot = pendingSnapshot
    pendingSnapshot = null
  }
  for (const listener of listeners) listener()
}

const scheduleNotify = (): void => {
  if (frameHandle !== null) return
  if (typeof globalThis.requestAnimationFrame === 'function') {
    frameHandle = globalThis.requestAnimationFrame(notify)
    return
  }
  frameHandle = globalThis.setTimeout(notify, 0) as unknown as number
}

export const publishBrushDynamicsTelemetry = (next: BrushDynamicsTelemetrySnapshot): void => {
  pendingSnapshot = {
    documentId: next.documentId,
    pressure: Number.isFinite(next.pressure) ? Math.max(0, Math.min(100, next.pressure!)) : null,
    speed: Number.isFinite(next.speed) ? Math.max(0, next.speed) : 0,
    pointerType: typeof next.pointerType === 'string' && next.pointerType.length > 0 ? next.pointerType : null,
    active: next.active
  }
  scheduleNotify()
}

export const getBrushDynamicsTelemetry = (): BrushDynamicsTelemetrySnapshot | null => snapshot

export const subscribeBrushDynamicsTelemetry = (listener: BrushDynamicsTelemetryListener): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const clearBrushDynamicsTelemetry = (): void => {
  pendingSnapshot = null
  snapshot = null
  scheduleNotify()
}

export const brushDynamicsTelemetry = {
  publish: publishBrushDynamicsTelemetry,
  get: getBrushDynamicsTelemetry,
  subscribe: subscribeBrushDynamicsTelemetry,
  clear: clearBrushDynamicsTelemetry
}
