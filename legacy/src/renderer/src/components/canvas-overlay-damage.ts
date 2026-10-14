import type { CanvasDeviceScale } from '@/core/canvas-render-plan'
import type { RasterContext2D } from './canvas-selection-renderer'

/** Keep damage in backing pixels so DPR changes cannot leave the old outline. */
export class CanvasOverlayDamage {
  private bounds: { left: number; top: number; right: number; bottom: number } | null = null

  clear(context: RasterContext2D, canvas: { width: number; height: number }): void {
    const area = this.bounds ?? { left: 0, top: 0, right: canvas.width, bottom: canvas.height }
    context.save()
    context.setTransform(1, 0, 0, 1, 0, 0)
    context.clearRect(area.left, area.top, area.right - area.left, area.bottom - area.top)
    context.restore()
    this.bounds = null
  }

  include(rect: { x: number; y: number; width: number; height: number }, scale: CanvasDeviceScale, padding: number): void {
    const area = { left: Math.floor((rect.x - padding) * scale.x), top: Math.floor((rect.y - padding) * scale.y),
      right: Math.ceil((rect.x + rect.width + padding) * scale.x), bottom: Math.ceil((rect.y + rect.height + padding) * scale.y) }
    const old = this.bounds
    this.bounds = old ? { left: Math.min(old.left, area.left), top: Math.min(old.top, area.top),
      right: Math.max(old.right, area.right), bottom: Math.max(old.bottom, area.bottom) } : area
  }
}
