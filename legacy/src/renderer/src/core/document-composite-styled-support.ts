import type { SpriteDocument } from '@shared/types-document'
import { isGroupEffectivelyVisible, isLayerEffectivelyVisible } from './document-model'
import { hasEnabledLayerStyles } from './layer-styles'

/** Check feature flags before walking ancestors of potential fallback owners. */
export const hasUnsupportedStyledCompositeFeatures = (document: SpriteDocument): boolean => {
  const unsupportedGroup = document.groups.some(group => (group.blendMode !== 'normal'
    || group.opacity !== 1
    || group.cumulativeBlend === true
    || group.clippingMask === true
    || hasEnabledLayerStyles(group.layerStyles)) && isGroupEffectivelyVisible(document, group))
  const unsupportedLayer = document.layers.some(layer => layer.opacity > 0
    && (layer.kind === 'adjustment' || layer.clippingMask === true || layer.blendMode !== 'normal')
    && isLayerEffectivelyVisible(document, layer))
  return unsupportedGroup || unsupportedLayer
}
