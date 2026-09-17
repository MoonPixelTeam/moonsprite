import type { LayerGroup, RasterLayer } from '@shared/types-layer'
import type { LayerStyles } from '@shared/types-layer-style'
import { cloneLayerStyles, layerStylesHistoryBytes } from '@/core/layer-styles'

export const layerHistoryBytes = (layer: RasterLayer): number => layer.pixels.byteLength + layerStylesHistoryBytes(layer.layerStyles)

export const groupHistoryBytes = (group: LayerGroup): number => 96 + layerStylesHistoryBytes(group.layerStyles)

export const assignLayerStyles = (layer: RasterLayer | LayerGroup, styles: LayerStyles | undefined): void => {
  const next = cloneLayerStyles(styles)
  if (next) layer.layerStyles = next
  else delete layer.layerStyles
}
