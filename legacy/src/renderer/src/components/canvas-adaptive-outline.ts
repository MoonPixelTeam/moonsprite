import { canvasAdaptiveContrast } from './canvas-adaptive-contrast'
import type { RasterContext2D } from './canvas-selection-renderer'
import type { RgbaColor } from '@shared/types-color'

/**
 * Align an axis-aligned canvas path to physical pixel centres before stroking.
 * Canvas strokes are centred on their path, so a one-pixel line drawn exactly
 * on a pixel boundary is antialiased across two rows/columns.  An odd physical
 * stroke width needs a half-pixel offset; even widths already sit on edges.
 */
export const alignCanvasStrokePath = (context: RasterContext2D): void => {
  const matrix = context.getTransform?.()
  if (!matrix || typeof context.translate !== 'function') return
  const scaleX = Math.hypot(matrix.a, matrix.b)
  const scaleY = Math.hypot(matrix.c, matrix.d)
  const offsetX = Number.isFinite(scaleX) && scaleX > 0 && Math.round(context.lineWidth * scaleX) % 2 === 1 ? 0.5 / scaleX : 0
  const offsetY = Number.isFinite(scaleY) && scaleY > 0 && Math.round(context.lineWidth * scaleY) % 2 === 1 ? 0.5 / scaleY : 0
  if (offsetX !== 0 || offsetY !== 0) context.translate(offsetX, offsetY)
}

/** Collect bounds from the actual preview geometry, including repeat copies. */
export class CanvasAdaptiveOutline {
  private left = Infinity
  private top = Infinity
  private right = -Infinity
  private bottom = -Infinity

  include(rect: { x: number; y: number; width: number; height: number }): void {
    this.left = Math.min(this.left, rect.x)
    this.top = Math.min(this.top, rect.y)
    this.right = Math.max(this.right, rect.x + rect.width)
    this.bottom = Math.max(this.bottom, rect.y + rect.height)
  }

  stroke(context: RasterContext2D, backdrop?: HTMLCanvasElement, color?: RgbaColor): void {
    if (this.left === Infinity) return
    // Cover the stroke and device-aligned rounding before the contrast helper
    // projects these local bounds through the current view transform.
    const padding = context.lineWidth + 1
    context.strokeStyle = color
      ? `rgb(${color.r} ${color.g} ${color.b} / ${color.a / 255})`
      : canvasAdaptiveContrast(context, {
          x: this.left - padding,
          y: this.top - padding,
          width: this.right - this.left + padding * 2,
          height: this.bottom - this.top + padding * 2
        }, backdrop)
    context.stroke()
  }
}
