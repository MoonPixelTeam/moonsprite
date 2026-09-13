import { canvasAdaptiveContrast } from './canvas-adaptive-contrast'
import type { RasterContext2D } from './canvas-selection-renderer'

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

  stroke(context: RasterContext2D, backdrop?: HTMLCanvasElement): void {
    if (this.left === Infinity) return
    // Cover the stroke and device-aligned rounding before the contrast helper
    // projects these local bounds through the current view transform.
    const padding = context.lineWidth + 1
    context.strokeStyle = canvasAdaptiveContrast(context, {
      x: this.left - padding,
      y: this.top - padding,
      width: this.right - this.left + padding * 2,
      height: this.bottom - this.top + padding * 2
    }, backdrop)
    context.stroke()
  }
}
