import type { SpriteDocument } from '@shared/types-document'
import type { RasterLayer } from '@shared/types-layer'
import type { PixelEdit, PixelEditPoints } from './history'
import { invalidateRasterContentBounds, markLayerContentChanged, normalizeLayerPackedValue, writeLayerPacked } from './document-model'

/** Flood-fill visits each destination once. Store those unique writes directly
 * in the existing point-history format instead of building two numeric Maps. */
export const createFillPixelRecorder = (document: SpriteDocument, layer: RasterLayer, edit: PixelEdit, maxPoints: number) => {
  let points: PixelEditPoints | undefined
  return (index: number, current: number, value: number): void => {
    const next = normalizeLayerPackedValue(document, layer, value)
    if (current === next) return
    if (!points || points.count === points.indices.length) {
      const capacity = Math.min(maxPoints, points ? points.indices.length * 2 : 1024)
      const expanded: PixelEditPoints = {
        indices: new Uint32Array(capacity), before: new Uint32Array(capacity), after: new Uint32Array(capacity), count: points?.count ?? 0
      }
      if (points) {
        expanded.indices.set(points.indices); expanded.before.set(points.before); expanded.after.set(points.after)
      }
      points = expanded
      edit.points = points
    }
    if (!edit.dirtyRect) markLayerContentChanged(layer)
    invalidateRasterContentBounds(layer)
    const offset = points.count++
    points.indices[offset] = index; points.before[offset] = current; points.after[offset] = next
    const x = index % layer.width + layer.offsetX, y = Math.floor(index / layer.width) + layer.offsetY
    if (!edit.dirtyRect) edit.dirtyRect = { x, y, width: 1, height: 1 }
    else {
      const dirty = edit.dirtyRect
      const left = Math.min(dirty.x, x), top = Math.min(dirty.y, y)
      const right = Math.max(dirty.x + dirty.width, x + 1), bottom = Math.max(dirty.y + dirty.height, y + 1)
      dirty.x = left; dirty.y = top; dirty.width = right - left; dirty.height = bottom - top
    }
    writeLayerPacked(document, layer, index, next)
  }
}
