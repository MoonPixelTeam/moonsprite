import {
  deviceAlignedCanvasRect,
  deviceAlignedDocumentRect,
  deviceAlignedPixelRuns,
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

/**
   * Blit a cached raster using the same per-pixel device edges as the live
   * brush preview. A single large drawImage lets the browser distribute a
   * fractional physical scale across source rows/columns, which can move a
   * pixel by one device row when the effective backing ratio is non-integer.
   */
  drawAlignedPixelRegion(context: RasterContext2D, source: CanvasImageSource, originX: number, originY: number, zoom: number, sourceX: number, sourceY: number, targetX: number, targetY: number, width: number, height: number): void {
    const dpr = typeof this.currentDevicePixelRatio === 'number' ? { x: this.currentDevicePixelRatio, y: this.currentDevicePixelRatio } : this.currentDevicePixelRatio
    const columns = deviceAlignedPixelRuns(originX, zoom, targetX, width, dpr.x)
    const rows = deviceAlignedPixelRuns(originY, zoom, targetY, height, dpr.y)
    // Cartesian pixel splitting scales as O(rows × columns). At 400%–800%
    // on a large document this can become tens of thousands of drawImage
    // calls for one frame. The browser's nearest-neighbour sampler already
    // honours the aligned outer edges, so collapse large regions to one blit
    // and reserve the exact run path for small previews where it is cheap.
    if (columns.length * rows.length > 4096) {
      const destination = this.alignedDocumentDestination(originX, originY, zoom, targetX, targetY, width, height)
      context.drawImage(source, sourceX, sourceY, width, height, destination.left, destination.top, destination.width, destination.height)
      return
    }
    for (const row of rows)
      for (const column of columns) {
        context.drawImage(source, sourceX + column.start - targetX, sourceY + row.start - targetY, column.count, row.count, column.left, row.left, column.right - column.left, row.right - row.left)
      }
  }

  requiresAlignedPixelBlit(zoom: number): boolean {
    if (!Number.isFinite(zoom) || zoom <= 0) return false
    const dpr = typeof this.currentDevicePixelRatio === 'number' ? { x: this.currentDevicePixelRatio, y: this.currentDevicePixelRatio } : this.currentDevicePixelRatio
    // Keep the common small-pixel path cheap. Once a document pixel spans at
    // least four physical pixels, a one-pixel redistribution is visible and
    // the segmented blit preserves the exact preview boundary.
    if (Math.min(zoom * dpr.x, zoom * dpr.y) < 4) return false
    const fractional = (value: number): boolean => Math.abs(value - Math.round(value)) > 0.0000001
    return fractional(zoom * dpr.x) || fractional(zoom * dpr.y)
  }
}
