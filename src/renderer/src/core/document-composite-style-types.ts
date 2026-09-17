import type { RgbaColor } from '@shared/types-color'
import type { RasterLayer } from '@shared/types-layer'
import type { LayerStyles } from '@shared/types-layer-style'
import type { SelectionRect } from '@shared/types-selection'
import type { SpriteDocument } from '@shared/types-document'


export const STYLED_LAYER_BLOCK_SIZE = 64

export const STYLED_LAYER_PROXY = Symbol('moonSpriteStyledLayerProxy')

export const EMPTY_STYLED_LAYER_PIXELS = new Uint8ClampedArray(4)

export interface StyledLayerBlock {
  x: number
  y: number
  width: number
  height: number
  pixels: Uint8ClampedArray
}

export interface StyledLayerBlockCache {
  sourceLayer: RasterLayer
  storage: object
  colorMode: SpriteDocument['colorMode']
  styleKey: string
  paletteKey: string
  styles: LayerStyles
  resolvedStyles: LayerStyles
  resolveStyleColor: (color: RgbaColor) => RgbaColor
  palette: Map<number, RgbaColor> | null
  palettePacked: Map<number, number> | null
  contentRevision: number
  sourceContentBounds: SelectionRect | null
  sourceWidth: number
  sourceHeight: number
  localX: number
  localY: number
  width: number
  height: number
  blocks: Map<string, StyledLayerBlock>
  layer: RasterLayer
}

type StyledLayerProxy = RasterLayer & {
  [STYLED_LAYER_PROXY]?: StyledLayerBlockCache
}

export const styledLayerBlockCacheFor = (layer: RasterLayer): StyledLayerBlockCache | undefined =>
  (layer as StyledLayerProxy)[STYLED_LAYER_PROXY]
