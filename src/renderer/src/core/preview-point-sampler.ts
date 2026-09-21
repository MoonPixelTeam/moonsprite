import type { SpriteDocument } from '@shared/types-document'
import { compileCompositePointSampler, createNormalCompositePointSampler } from './document-composite-sampling'
import { activeCelMasksByLayer, activeGroupMasksByGroup } from './document-composite-plan'
import { hasEnabledLayerStyles } from './layer-styles'

export const supportsIncrementalPreview = (document: SpriteDocument): boolean =>
  !document.layers.some(layer => hasEnabledLayerStyles(layer.layerStyles))
  && !document.groups.some(group => hasEnabledLayerStyles(group.layerStyles))

/** Same blend/group/mask semantics as the editor, without scanning source pixels
 * for content bounds or neutral masks. Only styles require exact content bounds. */
export function createPreviewPointSampler(document: SpriteDocument) {
  if (!supportsIncrementalPreview(document)) return null
  // Avoid the generic group dispatcher for the common 100-layer normal stack.
  // Check masks without scanning their pixels before entering the fast path.
  if (document.layers.every(layer => layer.blendMode === 'normal' && !layer.clippingMask)
    && document.groups.every(group => group.blendMode === 'normal' && group.opacity === 1 && !group.cumulativeBlend && !group.clippingMask)
    && !activeCelMasksByLayer(document, undefined, true).size && !activeGroupMasksByGroup(document, undefined, true).size) {
    const sample = createNormalCompositePointSampler(document)
    if (sample) return sample
  }
  const sample = compileCompositePointSampler(document, undefined, undefined, 0, undefined, true)
  return (x: number, y: number) => sample(x, y, undefined)
}
