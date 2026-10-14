import type { SpriteDocument } from '@shared/types-document'
import type { RasterLayer } from '@shared/types-layer'
import type { SelectionRect } from '@shared/types-selection'
import { selectionContains } from '@/core/selection'
import { readLayerPackedAt } from '@/core/document-model'
import { compositeSelectionPixelOver } from '@/core/tools-pixel-edit'
import { compositePreviewPixel } from './canvas-composite-cache-pixel-utils'
import type { SelectionTransformCompositePreview } from './canvas-composite-cache-surfaces'
import type { CanvasSelectionBackdropCache } from './canvas-selection-backdrop-cache'

export function selectionPreviewPixelWriter(
  document: SpriteDocument,
  activeLayer: RasterLayer,
  lowerLayers: readonly RasterLayer[],
  selection: SelectionTransformCompositePreview,
  patchRect: SelectionRect,
  contentRevision: number,
  patchPixels: Uint8ClampedArray,
  palette: Map<number, SpriteDocument['palette'][number]['color']> | null,
  lowerBackdrop: CanvasSelectionBackdropCache
): (packed: number, outputOffset: number) => void {
  const patchWords = activeLayer.format === 'rgba' && activeLayer.opacity === 1 ? new Uint32Array(patchPixels.buffer) : null
  let lowerPixels: Uint8ClampedArray | undefined
  return (packed: number, outputOffset: number): void => {
    if (activeLayer.format === 'rgba') {
      if ((packed >>> 24) === 0) return
      if (patchWords && (packed >>> 24) === 255) {
        patchWords[outputOffset / 4] = packed
        return
      }
      // Compose within the active layer before applying its opacity.
      // Moved source pixels are absent from the destination backdrop.
      const offset = outputOffset / 4
      const px = patchRect.x + offset % patchRect.width
      const py = patchRect.y + Math.floor(offset / patchRect.width)
      const destination = !selection.copy && selectionContains(selection.source.selection, px, py)
        ? 0 : readLayerPackedAt(document, activeLayer, px, py) ?? 0
      packed = compositeSelectionPixelOver(document, activeLayer, destination, packed)
      lowerPixels ??= lowerBackdrop.read(document, activeLayer, lowerLayers, selection.source, selection.copy, patchRect, contentRevision)
      patchPixels.set(lowerPixels.subarray(outputOffset, outputOffset + 4), outputOffset)
    }
    compositePreviewPixel(patchPixels, outputOffset, packed, activeLayer.format, activeLayer.opacity, palette)
  }
}
