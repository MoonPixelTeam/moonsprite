import type { SpriteDocument } from '@shared/types-document'
import { isLayerEffectivelyVisible } from '@/core/document-model'

/** Filled previews below visible layers must use document compositing. */
export function brushPreviewHasUpperLayers(document: SpriteDocument, layerId: string): boolean {
  const index = document.layers.findIndex(layer => layer.id === layerId)
  return document.layers.slice(index + 1).some(layer => isLayerEffectivelyVisible(document, layer) && layer.opacity > 0)
}
