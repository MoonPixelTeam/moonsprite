import type { CanvasDeviceScale } from '@/core/canvas-render-plan'

export function syncCanvasDisplaySize(canvas: HTMLCanvasElement, width: number, height: number, dpr: number, cssWidth = width, cssHeight = height): CanvasDeviceScale {
  const displayWidth = Math.max(0, width)
  const displayHeight = Math.max(0, height)
  const renderedCssWidth = Math.max(0, cssWidth)
  const renderedCssHeight = Math.max(0, cssHeight)
  const pixelRatio = Number.isFinite(dpr) && dpr > 0 ? dpr : 1
  const cssWidthValue = `${renderedCssWidth}px`
  const cssHeightValue = `${renderedCssHeight}px`

  // Keep the last rendered CSS size fixed until the next draw. Otherwise a
  // percentage-sized canvas stretches its previous bitmap while a pane resizes.
  if (canvas.style.width !== cssWidthValue) canvas.style.width = cssWidthValue
  if (canvas.style.height !== cssHeightValue) canvas.style.height = cssHeightValue

  const backingWidth = Math.max(1, Math.round(displayWidth * pixelRatio))
  const backingHeight = Math.max(1, Math.round(displayHeight * pixelRatio))
  if (canvas.width !== backingWidth) canvas.width = backingWidth
  if (canvas.height !== backingHeight) canvas.height = backingHeight
  return {
    x: displayWidth > 0 ? backingWidth / displayWidth : pixelRatio,
    y: displayHeight > 0 ? backingHeight / displayHeight : pixelRatio
  }
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
