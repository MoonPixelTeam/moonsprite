import type { LayerMask, RasterLayer } from '@shared/types-layer'
import type { SelectionRect } from '@shared/types-selection'
import type { SpriteDocument } from '@shared/types-document'
import { hasEnabledLayerStyles } from './layer-styles'
import { activeCelMasksByLayer, activeGroupMasksByGroup, buildCompositeStack } from './document-composite-plan'
import { compositeBufferWithModeInto, compositeNormalLayers } from './document-composite-raster'
import { layerIndexAt, maskCoverageFromColor, rasterContentBounds } from './document-model'
import { readSurfacePackedLocal } from './runtime-raster'
import { unpackColor } from './raster'
import type { DocumentCompositeCache } from './document-composite-cache'

export interface SimpleLayerMaskStack {
  layers: RasterLayer[]
  masks: ReadonlyMap<string, LayerMask>
}

/** Returns flat ordinary layers whose active masks can be applied in a block. */
export const simpleLayerMaskLayers = (document: SpriteDocument): SimpleLayerMaskStack | null => {
  if (!document.animation?.layerMasks?.length) return null
  const masks = activeCelMasksByLayer(document)
  if (masks.size === 0 || activeGroupMasksByGroup(document).size > 0) return null
  const layers: RasterLayer[] = []
  for (const item of buildCompositeStack(document)) {
    if (item.kind === 'group') return null
    const layer = item.layer
    if (layer.clippingMask === true || hasEnabledLayerStyles(layer.layerStyles) || layer.blendMode !== 'normal') return null
    layers.push(layer)
  }
  return { layers, masks }
}

const applyLayerMaskToPixels = (
  pixels: Uint8ClampedArray,
  mask: LayerMask,
  startX: number,
  startY: number,
  width: number,
  height: number
): void => {
  const localBounds = rasterContentBounds(mask)
  if (!localBounds) return
  const left = Math.max(startX, mask.offsetX + localBounds.x)
  const top = Math.max(startY, mask.offsetY + localBounds.y)
  const right = Math.min(startX + width, mask.offsetX + localBounds.x + localBounds.width)
  const bottom = Math.min(startY + height, mask.offsetY + localBounds.y + localBounds.height)
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const maskIndex = layerIndexAt(mask, x, y)
      if (maskIndex === null) continue
      const packed = readSurfacePackedLocal(mask, maskIndex % mask.width, Math.floor(maskIndex / mask.width))
      const coverage = maskCoverageFromColor(unpackColor(packed))
      if (coverage === 255) continue
      const alphaOffset = ((y - startY) * width + x - startX) * 4 + 3
      pixels[alphaOffset] = Math.round(pixels[alphaOffset] * coverage / 255)
    }
  }
}

/** Composites ordinary layer masks without recursively sampling the document. */
export const compositeLayerMaskLayers = (
  document: SpriteDocument,
  stack: SimpleLayerMaskStack,
  startX: number,
  startY: number,
  width: number,
  height: number,
  cache?: DocumentCompositeCache,
  revision = 0,
  output: Uint8ClampedArray<ArrayBufferLike> = new Uint8ClampedArray(width * height * 4),
  dirtyRect?: SelectionRect
): Uint8ClampedArray => {
  let maskedPixels: Uint8ClampedArray | null = null
  let normalBatch: RasterLayer[] = []
  const flushNormalBatch = (): void => {
    if (normalBatch.length === 0) return
    compositeNormalLayers(document, normalBatch, startX, startY, width, height, cache, revision, output, dirtyRect)
    normalBatch = []
  }
  for (const layer of stack.layers) {
    const mask = stack.masks.get(layer.id)
    if (!mask) {
      normalBatch.push(layer)
      continue
    }
    flushNormalBatch()
    if (!layer.visible || layer.opacity <= 0) continue
    maskedPixels ??= new Uint8ClampedArray(width * height * 4)
    maskedPixels.fill(0)
    const rawLayer = layer.opacity === 1 ? layer : { ...layer, opacity: 1 }
    compositeNormalLayers(document, [rawLayer], startX, startY, width, height, cache, revision, maskedPixels, dirtyRect)
    applyLayerMaskToPixels(maskedPixels, mask, startX, startY, width, height)
    compositeBufferWithModeInto(output, maskedPixels, layer.opacity, 'normal')
  }
  flushNormalBatch()
  return output
}
