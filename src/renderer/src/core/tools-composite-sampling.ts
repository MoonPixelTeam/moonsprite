import type { RgbaColor } from '@shared/types-color'
import type { SpriteDocument } from '@shared/types-document'
import { compositeRegion } from './document-composite'
import { isInBounds } from './raster'

export const sampleCompositeColor = (document: SpriteDocument, x: number, y: number, activeLayerId?: string): RgbaColor => {
  if (!isInBounds(document.width, document.height, x, y)) return { r: 0, g: 0, b: 0, a: 0 }
  const activeBackground = activeLayerId
    ? document.layers.some((layer) => layer.id === activeLayerId && layer.background)
    : true
  const samplingDocument = activeBackground || !document.layers.some((layer) => layer.background)
    ? document
    : { ...document, layers: document.layers.filter((layer) => !layer.background) }
  const pixels = compositeRegion(samplingDocument, x, y, 1, 1)
  return { r: pixels[0], g: pixels[1], b: pixels[2], a: pixels[3] }
}
