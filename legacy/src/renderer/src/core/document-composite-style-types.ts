import type { RgbaColor } from '@shared/types-color'
import type { RasterLayer } from '@shared/types-layer'
import type { LayerStyles } from '@shared/types-layer-style'
import type { SelectionRect } from '@shared/types-selection'
import type { SpriteDocument } from '@shared/types-document'


export const STYLED_LAYER_BLOCK_SIZE = 64

/** Compute adaptive block size based on layer style properties. */
export const dynamicStyledLayerBlockSize = (styles: LayerStyles): number => {
  const shadowRadius = styles.shadow.enabled
    ? styles.shadow.blur + Math.max(Math.abs(styles.shadow.offsetX), Math.abs(styles.shadow.offsetY))
    : 0
  const innerGlowRadius = styles.innerGlow.enabled ? styles.innerGlow.size : 0
  const strokeRadius = styles.stroke.enabled ? styles.stroke.size : 0

  const maxRadius = Math.max(shadowRadius, innerGlowRadius, strokeRadius)

  if (maxRadius > 64) return 1024
  if (maxRadius > 16) return 512
  return 256
}

export const STYLED_LAYER_PROXY = Symbol('moonSpriteStyledLayerProxy')

export const EMPTY_STYLED_LAYER_PIXELS = new Uint8ClampedArray(4)

export interface StyledLayerBlock {
  x: number
  y: number
  width: number
  height: number
  pixels: Uint8ClampedArray
  dirtyRects?: SelectionRect[]
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
  canvasClipKey?: string
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
