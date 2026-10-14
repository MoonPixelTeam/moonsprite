import type { SpriteDocument } from '@shared/types-document'
import type { RasterLayer } from '@shared/types-layer'
import type { AnimationCelSurface } from '@shared/types-animation'
import type { SelectionRect } from '@shared/types-selection'
import { cacheRasterContentBounds, rasterContentBounds } from './document-model'
import { rasterStorageIdentity } from './runtime-raster'

export interface DecodedRasterBounds {
  surface: RasterLayer | AnimationCelSurface
  bounds: SelectionRect | null
}

/** Transfer cached bounds with the same surface references as the document.
 * Dense rasters otherwise lose this cache at the worker boundary, forcing
 * thumbnails to scan every layer again immediately after the editor opens. */
export const prepareDecodedRasterBounds = (document: SpriteDocument): DecodedRasterBounds[] => {
  const result: DecodedRasterBounds[] = []
  const seen = new Map<object, Set<string>>()
  const prepare = (surface: DecodedRasterBounds['surface']): void => {
    const storage = rasterStorageIdentity(surface)
    const key = `${surface.format}:${surface.width}:${surface.height}`
    const dimensions = seen.get(storage) ?? new Set<string>()
    if (dimensions.has(key)) return
    dimensions.add(key)
    seen.set(storage, dimensions)
    result.push({ surface, bounds: rasterContentBounds(surface, document.palette) })
  }
  for (const layer of document.layers) prepare(layer)
  for (const cel of document.animation?.cels ?? []) if (cel.surface) prepare(cel.surface)
  return result
}

export const restoreDecodedRasterBounds = (document: SpriteDocument, entries: readonly DecodedRasterBounds[]): void => {
  for (const { surface, bounds } of entries) cacheRasterContentBounds(surface, document.palette, bounds)
}
