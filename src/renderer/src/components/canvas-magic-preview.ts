import type { SelectionMask } from '@shared/types-selection'
import type { RasterContext2D } from './canvas-selection-renderer'

/** One bitmap or bounded merged rectangles, never a per-pixel composite sample. */
export const drawMagicWandPreview = (
  context: RasterContext2D, selection: SelectionMask, rectangles: Int32Array | null | undefined,
  bitmap: ImageBitmap | null | undefined, originX: number, originY: number, zoom: number, color?: string | null,
  automaticContrast = false
): void => {
  context.save()
  context.imageSmoothingEnabled = false
  context.globalCompositeOperation = 'source-over'
  context.fillStyle = color ?? '#ffffff'
  const x = originX + selection.x * zoom
  const y = originY + selection.y * zoom
  if (bitmap) {
    // Automatic black previews arrive from the worker as a white alpha mask.
    // Filter the source image only, preserving the bounded single-draw path.
    if (automaticContrast && color === '#000000') context.filter = 'brightness(0)'
    context.drawImage(bitmap, x, y, selection.width * zoom, selection.height * zoom)
  }
  else if (rectangles) {
    context.beginPath()
    for (let i = 0; i < rectangles.length; i += 4) {
      context.rect(x + rectangles[i] * zoom, y + rectangles[i + 1] * zoom, rectangles[i + 2] * zoom, rectangles[i + 3] * zoom)
    }
    context.fill()
  }
  context.restore()
}
