import type { SelectionQuad, SelectionRect } from '@shared/types-selection'
import type { SelectionShearTransform } from './selection'
import type { SelectionTransformSource } from './tools-selection-transform-types'

// Captures are immutable. Keep one bounded result per capture, shared by the
// displayed preview and commit; releasing the capture releases its raster.
const rasters = new WeakMap<SelectionTransformSource, { key: string; pixels: Uint32Array }>()

export function cachedSelectionTransformRaster(
  source: SelectionTransformSource, target: SelectionRect, bounds: SelectionRect,
  angle: number, shear: SelectionShearTransform | undefined, quad: SelectionQuad | undefined,
  optimized: boolean, create: () => Uint32Array
): Uint32Array {
  const key = [target.x, target.y, target.width, target.height, target.flipHorizontal, target.flipVertical,
    target.flipOriginX, target.flipOriginY, bounds.x, bounds.y, bounds.width, bounds.height,
    angle, shear?.axis, shear?.amount, shear?.edge, optimized,
    quad?.nw.x, quad?.nw.y, quad?.ne.x, quad?.ne.y, quad?.se.x, quad?.se.y, quad?.sw.x, quad?.sw.y].join(':')
  const cached = rasters.get(source)
  if (cached?.key === key) return cached.pixels
  const pixels = create()
  if (pixels.byteLength <= 64 * 1024 * 1024) rasters.set(source, { key, pixels })
  else rasters.delete(source)
  return pixels
}
