import type { LayerGroup, RasterLayer } from '@shared/types-layer'
import type { LayerStyles } from '@shared/types-layer-style'
import { cloneLayerStyles, layerStylesHistoryBytes } from '@/core/layer-styles'

export const layerHistoryBytes = (layer: RasterLayer): number => layer.pixels.byteLength + layerStylesHistoryBytes(layer.layerStyles) + (layer.adjustment ? 64 + layer.adjustment.gradientMap.stops.length * 24 : 0)

export const groupHistoryBytes = (group: LayerGroup): number => 96 + layerStylesHistoryBytes(group.layerStyles)

export const assignLayerStyles = (layer: RasterLayer | LayerGroup, styles: LayerStyles | undefined): void => {
  const next = cloneLayerStyles(styles)
  if (next) layer.layerStyles = next
  else delete layer.layerStyles
}
