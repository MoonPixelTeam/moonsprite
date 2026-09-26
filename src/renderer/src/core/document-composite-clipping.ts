import type { RasterLayer } from '@shared/types-layer'
import type { SelectionRect } from '@shared/types-selection'
import type { SpriteDocument } from '@shared/types-document'
import { hasEnabledLayerStyles } from './layer-styles'
import { activeCelMasksByLayer, activeGroupMasksByGroup, buildCompositeStack } from './document-composite-plan'
import { compositeBufferWithModeInto, compositeNormalLayers } from './document-composite-raster'
import type { DocumentCompositeCache } from './document-composite-cache'

/** Returns flat ordinary layers that can use the block clipping compositor. */
export const simpleClippingLayers = (document: SpriteDocument): RasterLayer[] | null => {
  if (!document.layers.some(layer => layer.clippingMask === true) && !document.groups.some(group => group.clippingMask === true)) return null
  const activeMasks = activeCelMasksByLayer(document)
  if (activeGroupMasksByGroup(document).size > 0) return null
  const layers: RasterLayer[] = []
  let hasClippingLayer = false
  for (const item of buildCompositeStack(document)) {
    if (item.kind === 'group') return null
    const layer = item.layer
    if (activeMasks.has(layer.id) || (layer.kind === 'adjustment' || hasEnabledLayerStyles(layer.layerStyles)) || layer.blendMode !== 'normal') return null
    hasClippingLayer ||= layer.clippingMask === true
    layers.push(layer)
  }
  return hasClippingLayer ? layers : null
}

/**
 * Composites ordinary clipping chains without the recursive point sampler.
 * The base source is made opaque while clipped layers are blended into it;
 * the base alpha is restored before the chain is merged into the backdrop.
 */
export const compositeClippingLayers = (
  document: SpriteDocument,
  layers: readonly RasterLayer[],
  startX: number,
  startY: number,
  width: number,
  height: number,
  cache?: DocumentCompositeCache,
  revision = 0,
  output: Uint8ClampedArray<ArrayBufferLike> = new Uint8ClampedArray(width * height * 4),
  dirtyRect?: SelectionRect
): Uint8ClampedArray => {
  let chainPixels: Uint8ClampedArray | null = null
  let baseAlpha: Uint8Array | null = null
  let normalBatch: RasterLayer[] = []
  const flushNormalBatch = (): void => {
    if (normalBatch.length === 0) return
    compositeNormalLayers(document, normalBatch, startX, startY, width, height, cache, revision, output, dirtyRect)
    normalBatch = []
  }
  const compositeChain = (base: RasterLayer, clipped: readonly RasterLayer[]): void => {
    if (!base.visible || base.opacity <= 0) return
    chainPixels ??= new Uint8ClampedArray(width * height * 4)
    baseAlpha ??= new Uint8Array(width * height)
    chainPixels.fill(0)
    const rawBase = base.opacity === 1 ? base : { ...base, opacity: 1 }
    compositeNormalLayers(document, [rawBase], startX, startY, width, height, cache, revision, chainPixels, dirtyRect)
    let hasVisibleBase = false
    for (let pixel = 0; pixel < baseAlpha.length; pixel += 1) {
      const alphaOffset = pixel * 4 + 3
      const alpha = chainPixels[alphaOffset]
      baseAlpha[pixel] = alpha
      if (alpha > 0) {
        chainPixels[alphaOffset] = 255
        hasVisibleBase = true
      }
    }
    if (!hasVisibleBase) return
    const visibleClipped = clipped.filter((layer) => layer.visible && layer.opacity > 0)
    if (visibleClipped.length > 0) compositeNormalLayers(document, visibleClipped, startX, startY, width, height, cache, revision, chainPixels, dirtyRect)
    for (let pixel = 0; pixel < baseAlpha.length; pixel += 1) chainPixels[pixel * 4 + 3] = baseAlpha[pixel]
    compositeBufferWithModeInto(output, chainPixels, base.opacity, 'normal')
  }
  for (let index = 0; index < layers.length; index += 1) {
    const base = layers[index]
    if (layers[index + 1]?.clippingMask !== true) {
      normalBatch.push(base)
      continue
    }
    flushNormalBatch()
    const clipped: RasterLayer[] = []
    while (index + 1 < layers.length && layers[index + 1].clippingMask === true) clipped.push(layers[++index])
    compositeChain(base, clipped)
  }
  flushNormalBatch()
  return output
}
