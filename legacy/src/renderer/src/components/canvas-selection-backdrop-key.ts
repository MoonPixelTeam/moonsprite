import type { SpriteDocument } from '@shared/types-document'
import type { RasterLayer } from '@shared/types-layer'
import { getLayerContentRevision } from '@/core/document-model'
import { rasterStorageIdentity } from '@/core/runtime-raster'

const storageIds = new WeakMap<object, number>()
let nextStorageId = 0
/** Only inputs actually read by the normal lower-stack compositor belong here. */
export function selectionBackdropKey(document: SpriteDocument, layers: readonly RasterLayer[]): string {
  const indexed = layers.some(layer => layer.format === 'indexed')
  const palette = indexed ? document.palette.map(({ id, color: c }) => [id, c.r, c.g, c.b, c.a].join(':')).join(',') : ''
  return [document.id, document.width, document.height, document.animation?.activeFrameId, palette,
    ...layers.map(layer => {
      const storage = rasterStorageIdentity(layer)
      let id = storageIds.get(storage)
      if (id === undefined) { id = ++nextStorageId; storageIds.set(storage, id) }
      return [layer.id, id, getLayerContentRevision(layer), layer.format, layer.width, layer.height,
        layer.offsetX, layer.offsetY, layer.opacity, layer.visible, layer.blendMode].join(':')
    })].join('|')
}
