import type { SelectionRect } from '@shared/types-selection'
import { imageData } from './canvas-composite-cache-surfaces'
import type { OpaqueSelectionRasterCanvas } from './canvas-selection-transform-cache'
import type { RasterContext2D } from './canvas-selection-renderer'

export const drawOpaqueSelectionRasterPatch = (
  context: RasterContext2D,
  canvas: OpaqueSelectionRasterCanvas['canvas'],
  patchPixels: Uint8ClampedArray,
  patch: SelectionRect,
  previewOrigin: { x: number; y: number },
  bounds: SelectionRect,
  checkpoint: (stage: string) => void
): void => {
  checkpoint('backdrop')
  context.putImageData(imageData(patchPixels, patch.width, patch.height), patch.x - previewOrigin.x, patch.y - previewOrigin.y)
  const overlap = {
    x: Math.max(bounds.x, patch.x),
    y: Math.max(bounds.y, patch.y),
    right: Math.min(bounds.x + bounds.width, patch.x + patch.width),
    bottom: Math.min(bounds.y + bounds.height, patch.y + patch.height)
  }
  if (overlap.right > overlap.x && overlap.bottom > overlap.y)
    context.drawImage(canvas, overlap.x - bounds.x, overlap.y - bounds.y, overlap.right - overlap.x, overlap.bottom - overlap.y,
      overlap.x - previewOrigin.x, overlap.y - previewOrigin.y, overlap.right - overlap.x, overlap.bottom - overlap.y)
  checkpoint('selection-pixels')
}
