import type { TileRepeatMode } from '@shared/types-raster'
import { tileRepeatDocumentOffsets } from '@/core/tilemap'
import { deviceAlignedPixelRect, type CanvasDeviceScale } from '@/core/canvas-render-plan'

/** Render canonical stroke coverage on every displayed tile, as painted pixels are rendered. */
export function drawBrushCoverageOverlay(context: Pick<CanvasRenderingContext2D, 'fillRect'>, covered: ReadonlySet<number>, width: number, height: number, mode: TileRepeatMode, originX: number, originY: number, zoom: number, deviceScale: CanvasDeviceScale, outside?: Iterable<{ x: number; y: number }>): void {
  if (mode === 'off' && outside) for (const point of outside) {
    const pixel = deviceAlignedPixelRect(originX, originY, zoom, point.x, point.y, deviceScale)
    context.fillRect(pixel.x, pixel.y, pixel.width, pixel.height)
  }
  for (const offset of tileRepeatDocumentOffsets(width, height, mode)) for (const key of covered) {
    const pixel = deviceAlignedPixelRect(originX, originY, zoom, key % width + offset.x, Math.floor(key / width) + offset.y, deviceScale)
    context.fillRect(pixel.x, pixel.y, pixel.width, pixel.height)
  }
}
