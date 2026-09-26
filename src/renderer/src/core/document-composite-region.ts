import { compositeGradientMapRegion } from './document-composite-gradient-map'
import type { AnimationCelSurface } from '@shared/types-animation'
import type { RgbaColor } from '@shared/types-color'
import type { SelectionRect } from '@shared/types-selection'
import type { SpriteDocument } from '@shared/types-document'
import { TRANSPARENT, writeRgbaPixel } from './raster'
import { lazyRuntimeRasterForSurface, readSurfacePackedLocal, readSurfaceRgbaRegion } from './runtime-raster'
import { hasEnabledLayerStyles } from './layer-styles'
import { rasterContentBounds, layerIndexAt } from './document-model'
import { type DocumentCompositeCache } from './document-composite-cache'
import { activeCelMasksByLayer, normalCompositeLayers, opacityGroupCompositeStack } from './document-composite-plan'
import { simpleClippingLayers, compositeClippingLayers } from './document-composite-clipping'
import { simpleLayerMaskLayers, compositeLayerMaskLayers } from './document-composite-mask'
import { compositeNormalLayers, compositeOpacityGroupStack } from './document-composite-raster'
import { compileCompositePointSampler, createCompositePointSampler, createCompositeSampler } from './document-composite-sampling'

export function compositeRegion(document: SpriteDocument, startX: number, startY: number, width: number, height: number, cache?: DocumentCompositeCache, revision = 0, dirtyRect?: SelectionRect, sourceDirtyRect?: SelectionRect): Uint8ClampedArray {
  const output = new Uint8ClampedArray(width * height * 4)
  if (document.groups.length === 0 && document.layers.length === 1) {
    const layer = document.layers[0]
    const activeMasks = activeCelMasksByLayer(document)
    if (!layer.visible || layer.opacity <= 0) return output
    if (layer.kind !== 'adjustment' && !hasEnabledLayerStyles(layer.layerStyles) && !activeMasks.has(layer.id) && layer.opacity === 1 && layer.format === 'rgba') {
      if (lazyRuntimeRasterForSurface(layer)) {
        return readSurfaceRgbaRegion(layer, startX - layer.offsetX, startY - layer.offsetY, width, height)
      }
      for (let y = 0; y < height; y += 1) {
        const localY = startY + y - layer.offsetY
        const localStartX = startX - layer.offsetX
        const fromX = Math.max(0, localStartX)
        const toX = Math.min(layer.width, localStartX + width)
        if (localY < 0 || localY >= layer.height || toX <= fromX) continue
        const destinationX = fromX - localStartX
        const sourceOffset = (localY * layer.width + fromX) * 4
        output.set(layer.pixels.subarray(sourceOffset, sourceOffset + (toX - fromX) * 4), (y * width + destinationX) * 4)
      }
      return output
    }
    if (layer.kind !== 'adjustment' && !hasEnabledLayerStyles(layer.layerStyles) && !activeMasks.has(layer.id) && layer.opacity === 1 && layer.format === 'indexed') {
      const palette = new Map(document.palette.map((entry) => [entry.id, entry.color]))
      for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
        const index = layerIndexAt(layer, startX + x, startY + y)
        const color = index === null ? TRANSPARENT : (palette.get(readSurfacePackedLocal(layer, index % layer.width, Math.floor(index / layer.width))) ?? TRANSPARENT)
        writeRgbaPixel(output, y * width + x, color)
      }
      return output
    }
  }
  const clippingLayers = simpleClippingLayers(document)
  if (clippingLayers) return compositeClippingLayers(document, clippingLayers, startX, startY, width, height, cache, revision, output, dirtyRect)
  const layerMaskStack = simpleLayerMaskLayers(document)
  if (layerMaskStack) return compositeLayerMaskLayers(document, layerMaskStack, startX, startY, width, height, cache, revision, output, dirtyRect)
  const normalLayers = cache ? cache.renderLayersFor(document, revision, sourceDirtyRect) : normalCompositeLayers(document)
  if (normalLayers) return compositeNormalLayers(document, normalLayers, startX, startY, width, height, cache, revision, undefined, dirtyRect)
  const opacityGroupStack = cache ? cache.opacityGroupStackFor(document, revision) : opacityGroupCompositeStack(document)
  if (opacityGroupStack) return compositeOpacityGroupStack(document, opacityGroupStack, startX, startY, width, height, cache, revision, undefined, dirtyRect)
  const gradientMapped = compositeGradientMapRegion(document, startX, startY, width, height, cache, revision, sourceDirtyRect ?? dirtyRect, output)
  if (gradientMapped) return gradientMapped
  const sample = compileCompositePointSampler(document, undefined, cache, revision, sourceDirtyRect)
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    writeRgbaPixel(output, y * width + x, sample(startX + x, startY + y, undefined))
  }
  return output
}

/**
 * Responsive counterpart used by long-running exports. The sampler is
 * compiled once, then rows are processed in small batches so the renderer can
 * repaint progress and react to cancellation while large canvases composite.
 */
export async function compositeRegionAsync(
  document: SpriteDocument,
  startX: number,
  startY: number,
  width: number,
  height: number,
  onProgress?: (value: number) => void,
  shouldCancel?: () => boolean,
  rowsPerBatch = 8
): Promise<Uint8ClampedArray> {
  const output = new Uint8ClampedArray(width * height * 4)
  const sample = createCompositePointSampler(document)
  const yieldHost = (): Promise<void> => new Promise((resolve) => {
    if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') window.setTimeout(resolve, 0)
    else setTimeout(resolve, 0)
  })
  for (let y = 0; y < height; y += 1) {
    if (shouldCancel?.()) throw new Error('MoonSprite export canceled.')
    for (let x = 0; x < width; x += 1) writeRgbaPixel(output, y * width + x, sample(startX + x, startY + y))
    onProgress?.((y + 1) / Math.max(1, height) * 100)
    if ((y + 1) % Math.max(1, rowsPerBatch) === 0 && y + 1 < height) await yieldHost()
  }
  return output
}

export function compositePixel(document: SpriteDocument, index: number): RgbaColor {
  return compositePixelWithLayerColor(document, index)
}

export function compositePixelWithLayerColor(document: SpriteDocument, index: number, layerId?: string, replacement?: RgbaColor): RgbaColor {
  return createCompositeSampler(document, layerId, replacement)(index)
}

export const compositeDocument = (document: SpriteDocument): Uint8ClampedArray => compositeRegion(document, 0, 0, document.width, document.height)

/** Returns the canvas-clipped bounds of the final visible composite. */
export function documentVisibleContentBounds(document: SpriteDocument): SelectionRect | null {
  const surface: AnimationCelSurface = {
    format: 'rgba',
    width: document.width,
    height: document.height,
    offsetX: 0,
    offsetY: 0,
    pixels: compositeDocument(document)
  }
  return rasterContentBounds(surface)
}
