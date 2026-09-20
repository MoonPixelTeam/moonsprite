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
  private scratch: OffscreenCanvas | null = null
  dispose(): void {
    if (this.scratch) { this.scratch.width = 0; this.scratch.height = 0 }
    this.scratch = null
  }
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
    // Nearest-neighbour scaling is separable. Preserve the exact integer
    // device edges while avoiding the rows × columns draw-call explosion.
    // One scratch surface is reused; it holds only the current visible crop.
    if (columns.length * rows.length > 4096) {
      const left = columns[0].left
      const right = columns[columns.length - 1].right
      const physicalWidth = Math.round((right - left) * scale.x)
      if (!this.scratch) this.scratch = new OffscreenCanvas(physicalWidth, height)
      if (this.scratch.width !== physicalWidth) this.scratch.width = physicalWidth
      if (this.scratch.height !== height) this.scratch.height = height
      const scratchContext = this.scratch.getContext('2d')
      if (scratchContext) {
        scratchContext.clearRect(0, 0, physicalWidth, height)
        scratchContext.imageSmoothingEnabled = false
        for (const column of columns) {
          const x = Math.round((column.left - left) * scale.x)
          const end = Math.round((column.right - left) * scale.x)
          if (end > x) scratchContext.drawImage(source, sourceX + column.start - targetX, sourceY, column.count, height, x, 0, end - x, height)
        }
        for (const row of rows) {
          if (row.right > row.left) context.drawImage(this.scratch, 0, row.start - targetY, physicalWidth, row.count,
            left, row.left, right - left, row.right - row.left)
        }
        return
      }
    }
    for (const row of rows) for (const column of columns) {
      if (column.right <= column.left || row.right <= row.left) continue
      context.drawImage(source, sourceX + column.start - targetX, sourceY + row.start - targetY, column.count, row.count,
        column.left, row.left, column.right - column.left, row.right - row.left)
    }
  }

  requiresAlignedPixelBlit(zoom: number): boolean {
    if (!Number.isFinite(zoom) || zoom <= 0) return false
    const dpr = typeof this.currentDevicePixelRatio === 'number' ? { x: this.currentDevicePixelRatio, y: this.currentDevicePixelRatio } : this.currentDevicePixelRatio
    // Fractional magnification must share the brush preview's pixel grid.
    if (Math.min(zoom * dpr.x, zoom * dpr.y) < 1) return false
    const fractional = (value: number): boolean => Math.abs(value - Math.round(value)) > 0.0000001
    return fractional(zoom * dpr.x) || fractional(zoom * dpr.y)
  }
}
