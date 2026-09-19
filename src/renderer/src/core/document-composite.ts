/** Stable public entry. Implementations live in the responsibility modules below. */
export { expandLayerStyleInvalidationRect, type CompositeStackItem, normalCompositeLayers } from './document-composite-plan'
export { DocumentCompositeCache } from './document-composite-cache'
export { compositeMovePreviewLayersInto } from './document-composite-raster'
export {
  compositeRegion,
  compositeRegionAsync,
  compositePixel,
  compositePixelWithLayerColor,
  compositeDocument,
  documentVisibleContentBounds
} from './document-composite-region'
export { documentAnimationVisibleContentBounds } from './document-animation-content-bounds'
export {
  createCompositePointSampler,
  createNormalCompositePointSampler,
  createCompositePointReplacementSampler,
  createNormalCompositePointReplacementSampler,
  createCompositeSampler
} from './document-composite-sampling'
