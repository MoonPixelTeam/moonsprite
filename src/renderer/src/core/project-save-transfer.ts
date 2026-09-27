import type { SpriteDocument } from '@shared/types-document'
import { prepareRuntimeRasterDocumentForTransfer, shareRasterSurface } from './runtime-raster'

/** Copy surface wrappers only; postMessage takes the sole pixel snapshot.
 * Preparing the live document would remove its lazy accessors. Preparing these
 * wrappers keeps sparse storage sparse, and drops stale tiles for dense edits.
 */
export const projectDocumentForWorkerTransfer = (document: SpriteDocument): SpriteDocument => {
  const transfer: SpriteDocument = {
    ...document,
    layers: document.layers.map(layer => shareRasterSurface(layer)),
    ...(document.animation ? {
      animation: {
        ...document.animation,
        cels: document.animation.cels.map(cel => ({
          ...cel,
          ...(cel.surface ? { surface: shareRasterSurface(cel.surface) } : {})
        }))
      }
    } : {})
  }
  prepareRuntimeRasterDocumentForTransfer(transfer)
  return transfer
}
