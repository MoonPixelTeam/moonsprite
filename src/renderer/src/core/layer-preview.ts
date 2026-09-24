import type { RasterLayer } from '@shared/types-layer'
import { getLayerStorageOrigin, setLayerStorageOrigin } from './document-model'
import { shareRasterSurface } from './runtime-raster'

/** Shallow metadata copy for read-only previews, preserving lazy storage and its origin. */
export const shareRasterLayer = (layer: RasterLayer): RasterLayer => {
  const shared = shareRasterSurface(layer)
  setLayerStorageOrigin(shared, getLayerStorageOrigin(layer))
  return shared
}
