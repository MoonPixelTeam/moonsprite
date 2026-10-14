import type { SpriteDocument } from '@shared/types-document'
import { isLayerEffectivelyVisible } from '@/core/document-model'

/** Filled previews below visible layers must use document compositing. */
export function brushPreviewHasUpperLayers(document: SpriteDocument, layerId: string): boolean {
  const index = document.layers.findIndex(layer => layer.id === layerId)
  return document.layers.slice(index + 1).some(layer => isLayerEffectivelyVisible(document, layer) && layer.opacity > 0)
}

/** Raw cursor paint is valid only when the active layer needs no stack effects. */
export function brushPreviewNeedsComposite(document: SpriteDocument, layerId: string): boolean {
  const layer = document.layers.find(layer => layer.id === layerId)
  return !layer || layer.blendMode !== 'normal' || layer.opacity !== 1
    || Boolean(layer.groupId || layer.clippingMask || layer.layerStyles)
    || brushPreviewHasUpperLayers(document, layerId)
}
