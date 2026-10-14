import type { AnimationCel } from '@shared/types-animation'
import type { SpriteDocument } from '@shared/types-document'
import type { SelectionRect } from '@shared/types-selection'
import { markRasterSurfaceContentChanged, paletteColorIdForCanvas } from './document-model'
import { freeTileInstanceBounds, freeTileSourceForInstance, freeTileSourceRefs, renderFreeTileSurface } from './free-tile'

export const unionFreeTileSourceRects = (a: SelectionRect | null, b: SelectionRect): SelectionRect => {
  if (!a) return { ...b }
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y)
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y }
}

/** Cel-local bounds include every sibling, even when it is rotated or hidden. */
export function freeTileSourceCelBounds(document: SpriteDocument, sourceId: string): Map<AnimationCel, SelectionRect> {
  const result = new Map<AnimationCel, SelectionRect>()
  for (const cel of document.animation?.cels ?? []) {
    const layer = document.layers.find(layer => layer.id === cel.layerId && layer.kind === 'free-tile')
    if (!layer || !cel.freeTiles || !cel.surface) continue
    const sources = freeTileSourceRefs(layer.freeTileSources, document.tilesets ?? [])
    let bounds: SelectionRect | null = null
    for (const instance of cel.freeTiles.instances) {
      const source = freeTileSourceForInstance(sources, instance)
      if (source?.id !== sourceId && source?.tileset.id !== sourceId) continue
      bounds = unionFreeTileSourceRects(bounds, freeTileInstanceBounds(instance, sources))
    }
    if (bounds) result.set(cel, bounds)
  }
  return result
}

/** Redraw overlaps in painter order, keeping the existing full cel buffer. */
export function refreshFreeTileSourceRegions(document: SpriteDocument, sourceId: string, before: Map<AnimationCel, SelectionRect>): SelectionRect | null {
  const after = freeTileSourceCelBounds(document, sourceId)
  let dirty: SelectionRect | null = null
  for (const [cel, previous] of before) after.set(cel, unionFreeTileSourceRects(after.get(cel) ?? null, previous))
  for (const [cel, bounds] of after) {
    const surface = cel.surface, layer = document.layers.find(layer => layer.id === cel.layerId)
    if (!surface || !cel.freeTiles || !layer) continue
    const x = Math.max(0, bounds.x), y = Math.max(0, bounds.y)
    const width = Math.min(surface.width, bounds.x + bounds.width) - x
    const height = Math.min(surface.height, bounds.y + bounds.height) - y
    if (width <= 0 || height <= 0) continue
    const patch = renderFreeTileSurface({ ...cel.freeTiles, instances: cel.freeTiles.instances.map(instance => ({ ...instance, x: instance.x - x, y: instance.y - y })) },
      freeTileSourceRefs(layer.freeTileSources, document.tilesets ?? []), document.colorMode, width, height, 0, 0,
      document.colorMode === 'indexed' ? color => paletteColorIdForCanvas(document, color) : undefined)
    // Materialize sparse storage once before changing the owned pixel array.
    markRasterSurfaceContentChanged(surface)
    const stride = surface.format === 'rgba' ? 4 : 1
    for (let row = 0; row < height; row++) surface.pixels.set(patch.pixels.subarray(row * width * stride, (row + 1) * width * stride), ((y + row) * surface.width + x) * stride)
    dirty = unionFreeTileSourceRects(dirty, { x: x + surface.offsetX, y: y + surface.offsetY, width, height })
  }
  return dirty
}
