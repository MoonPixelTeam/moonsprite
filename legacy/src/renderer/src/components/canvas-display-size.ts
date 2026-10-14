import type { CanvasDeviceScale } from '@/core/canvas-render-plan'

const displayScales = new WeakMap<HTMLCanvasElement, CanvasDeviceScale>()

export function canvasBackingCapacity(required: number, current: number, reserve: boolean): number {
  return reserve ? Math.max(current, Math.ceil(required / 128) * 128) : required
}

/** Reuse the GPU surface until capacity is exceeded; exact crops remain the caller's responsibility. */
export function resizeOffscreenCanvas(canvas: OffscreenCanvas | null, width: number, height: number, reserve = false): OffscreenCanvas {
  const backingWidth = canvasBackingCapacity(width, canvas?.width ?? 0, reserve)
  const backingHeight = canvasBackingCapacity(height, canvas?.height ?? 0, reserve)
  if (!canvas) return new OffscreenCanvas(backingWidth, backingHeight)
  if (canvas.width !== backingWidth) canvas.width = backingWidth
  if (canvas.height !== backingHeight) canvas.height = backingHeight
  return canvas
}

export const canvasDisplayDeviceScale = (canvas: HTMLCanvasElement, fallback: number): CanvasDeviceScale =>
  displayScales.get(canvas) ?? { x: fallback, y: fallback }

export function syncCanvasDisplaySize(canvas: HTMLCanvasElement, width: number, height: number, dpr: number, cssWidth = width, cssHeight = height, reserve = false): CanvasDeviceScale {
  const displayWidth = Math.max(0, width)
  const displayHeight = Math.max(0, height)
  const renderedCssWidth = Math.max(0, cssWidth)
  const renderedCssHeight = Math.max(0, cssHeight)
  const pixelRatio = Number.isFinite(dpr) && dpr > 0 ? dpr : 1
  const backingWidth = canvasBackingCapacity(Math.max(1, Math.round(displayWidth * pixelRatio)), canvas.width, reserve)
  const backingHeight = canvasBackingCapacity(Math.max(1, Math.round(displayHeight * pixelRatio)), canvas.height, reserve)
  // Spare pixels extend outside the clipped viewport; they must never stretch
  // to fit it. Keep a constant physical scale while reusing the allocation.
  const cssWidthValue = `${reserve && displayWidth > 0 ? backingWidth / pixelRatio * renderedCssWidth / displayWidth : renderedCssWidth}px`
  const cssHeightValue = `${reserve && displayHeight > 0 ? backingHeight / pixelRatio * renderedCssHeight / displayHeight : renderedCssHeight}px`

  // Keep the last rendered CSS size fixed until the next draw. Otherwise a
  // percentage-sized canvas stretches its previous bitmap while a pane resizes.
  if (canvas.style.width !== cssWidthValue) canvas.style.width = cssWidthValue
  if (canvas.style.height !== cssHeightValue) canvas.style.height = cssHeightValue

  if (canvas.width !== backingWidth) canvas.width = backingWidth
  if (canvas.height !== backingHeight) canvas.height = backingHeight
  const scale = {
    x: !reserve && displayWidth > 0 ? backingWidth / displayWidth : pixelRatio,
    y: !reserve && displayHeight > 0 ? backingHeight / displayHeight : pixelRatio
  }
  displayScales.set(canvas, scale)
  return scale
}

/**
 * Clear every pixel in a canvas backing store, regardless of the logical
 * transform currently installed on its 2D context.  A logical clear can miss
 * the final row/column when the backing size was rounded from a fractional
 * CSS size; those stale pixels become visible after a later zoom or pan.
 */
export function clearCanvasBacking(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  canvas: { width: number; height: number }
): void {
  context.save()
  context.setTransform(1, 0, 0, 1, 0, 0)
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.restore()
}
