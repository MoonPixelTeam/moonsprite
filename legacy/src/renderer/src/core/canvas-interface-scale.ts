export interface CanvasViewportSize {
  width: number
  height: number
}

export interface CanvasViewportPoint {
  x: number
  y: number
}

function normalizedInterfaceScale(scale: number): number {
  return Number.isFinite(scale) && scale > 0 ? scale : 1
}

export function canvasViewportSizeForInterfaceScale(width: number, height: number, scale: number): CanvasViewportSize {
  const normalizedScale = normalizedInterfaceScale(scale)
  return {
    width: Math.max(0, width) * normalizedScale,
    height: Math.max(0, height) * normalizedScale
  }
}

export function canvasViewportPointForInterfaceScale(
  clientX: number,
  clientY: number,
  viewportLeft: number,
  viewportTop: number,
  scale: number
): CanvasViewportPoint {
  const normalizedScale = normalizedInterfaceScale(scale)
  return {
    x: (clientX - viewportLeft) * normalizedScale,
    y: (clientY - viewportTop) * normalizedScale
  }
}

export function canvasBackingRatioForInterfaceScale(devicePixelRatio: number, scale: number): number {
  const normalizedDevicePixelRatio = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1
  return normalizedDevicePixelRatio / normalizedInterfaceScale(scale)
}

export function canvasClientDeltaForInterfaceScale(delta: number, scale: number): number {
  return delta * normalizedInterfaceScale(scale)
}

export function canvasViewportPointToCss(point: CanvasViewportPoint, scale: number): CanvasViewportPoint {
  const normalizedScale = normalizedInterfaceScale(scale)
  return { x: point.x / normalizedScale, y: point.y / normalizedScale }
}
