import type { SpriteDocument } from '@shared/types-document'
import type { RasterLayer } from '@shared/types-layer'
import type { SelectionRect } from '@shared/types-selection'
import { layerContentBounds, readLayerColorAt } from './document-model'

/** Find occupied pixels inside the canvas, not the intersection of an off-canvas bounding box. */
export function layerCanvasContentBounds(document: SpriteDocument, layer: RasterLayer): SelectionRect | null {
  const bounds = layerContentBounds(document, layer)
  if (!bounds) return null
  if (bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= document.width && bounds.y + bounds.height <= document.height) return bounds
  let left = document.width, top = document.height, right = -1, bottom = -1
  for (let y = Math.max(0, bounds.y); y < Math.min(document.height, bounds.y + bounds.height); y++) {
    for (let x = Math.max(0, bounds.x); x < Math.min(document.width, bounds.x + bounds.width); x++) {
      if (readLayerColorAt(document, layer, x, y).a === 0) continue
      left = Math.min(left, x); right = Math.max(right, x)
      top = Math.min(top, y); bottom = y
    }
  }
  return right < left ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 }
}
