import {
  deviceAlignedCanvasRect,
  deviceAlignedDocumentRect,
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
   * Preserve the document-to-device affine transform even when the visible
   * source rectangle changes. Rounding both destination endpoints first
   * stretches each crop by a different scale and redistributes interior pixels.
   * Nearest-neighbour sampling of these continuous edges already implements
   * ceil(edge - 0.5), the tie rule shared by brush previews and hit testing.
   */
  drawAlignedPixelRegion(context: RasterContext2D, source: CanvasImageSource, originX: number, originY: number, zoom: number, sourceX: number, sourceY: number, targetX: number, targetY: number, width: number, height: number): void {
    context.drawImage(source, sourceX, sourceY, width, height,
      originX + targetX * zoom, originY + targetY * zoom, width * zoom, height * zoom)
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
