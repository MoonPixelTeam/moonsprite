import {
  deviceAlignedCanvasRect,
  deviceAlignedDocumentRect,
  deviceAlignedPixelRuns,
  normalizeCanvasDeviceScale,
  type CanvasDeviceScaleInput
} from '@/core/canvas-render-plan'
import type { RasterContext2D } from './canvas-selection-renderer'



/** Owns device alignment shared by cached surfaces and previews. */
export class CanvasCompositeBlitter {
  currentDevicePixelRatio: CanvasDeviceScaleInput = 1
  alignedDestination(originX: number, originY: number, width: number, height: number): ReturnType<typeof deviceAlignedCanvasRect> {
    return deviceAlignedCanvasRect(originX, originY, width, height, this.currentDevicePixelRatio)
  }

  alignedDocumentDestination(originX: number, originY: number, zoom: number, x: number, y: number, width: number, height: number): ReturnType<typeof deviceAlignedDocumentRect> {
    return deviceAlignedDocumentRect(originX, originY, zoom, x, y, width, height, this.currentDevicePixelRatio)
  }

  /** Keep every source pixel on the same device grid as brush previews.
   * Integer device edges avoid antialiased crop borders and repeat seams.
   * Equal-width pixels are batched without stretching across unequal runs.
   */
  drawAlignedPixelRegion(context: RasterContext2D, source: CanvasImageSource, originX: number, originY: number, zoom: number, sourceX: number, sourceY: number, targetX: number, targetY: number, width: number, height: number): void {
    const scale = normalizeCanvasDeviceScale(this.currentDevicePixelRatio)
    const columns = deviceAlignedPixelRuns(originX, zoom, targetX, width, scale.x)
    const rows = deviceAlignedPixelRuns(originY, zoom, targetY, height, scale.y)
    for (const row of rows) for (const column of columns) {
      if (column.right <= column.left || row.right <= row.left) continue
      context.drawImage(source, sourceX + column.start - targetX, sourceY + row.start - targetY, column.count, row.count,
        column.left, row.left, column.right - column.left, row.right - row.left)
    }
  }

  requiresAlignedPixelBlit(zoom: number): boolean {
    if (!Number.isFinite(zoom) || zoom <= 0) return false
    const dpr = typeof this.currentDevicePixelRatio === 'number' ? { x: this.currentDevicePixelRatio, y: this.currentDevicePixelRatio } : this.currentDevicePixelRatio
    // At high fractional magnification, preserve the continuous scale rather
    // than stretching rounded crop endpoints: one redistributed device pixel
    // is visible beside the brush preview.
    if (Math.min(zoom * dpr.x, zoom * dpr.y) < 4) return false
    const fractional = (value: number): boolean => Math.abs(value - Math.round(value)) > 0.0000001
    return fractional(zoom * dpr.x) || fractional(zoom * dpr.y)
  }
}
