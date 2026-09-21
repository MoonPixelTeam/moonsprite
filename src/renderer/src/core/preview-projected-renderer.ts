import type { SpriteDocument } from '@shared/types-document'
import type { RgbaColor } from '@shared/types-color'
import type { RasterLayer } from '@shared/types-layer'
import { activeCelMasksByLayer, activeGroupMasksByGroup, normalCompositeLayers } from './document-composite-plan'
import { createPreviewPointSampler, supportsIncrementalPreview } from './preview-point-sampler'
import { lazyRuntimeRasterForSurface, readSurfacePackedLocal } from './runtime-raster'
import { createProjectedStackRenderer } from './preview-projected-stack'

/** Render a projected rectangle in layer/scanline order, like the software
 * scale-down renderer. Source coordinates skip unsampled rows and columns. */
export function createPreviewProjectedRenderer(document: SpriteDocument, isolatedLayer?: RasterLayer, sharedPalette?: Map<number, RgbaColor>): (xs: Int32Array, ys: Int32Array, output: Uint8ClampedArray) => void {
  const plain = !isolatedLayer && supportsIncrementalPreview(document)
    && document.layers.every(layer => layer.blendMode === 'normal' && !layer.clippingMask)
    && !activeCelMasksByLayer(document, undefined, true).size
    && !activeGroupMasksByGroup(document, undefined, true).size
  const layers = isolatedLayer ? [isolatedLayer] : plain ? normalCompositeLayers(document) : null
  const palette = sharedPalette ?? new Map(document.palette.map(entry => [entry.id, entry.color]))
  if (!layers && supportsIncrementalPreview(document)) return createProjectedStackRenderer(document, layer =>
    createPreviewProjectedRenderer(document, { ...layer, opacity: 1 }, palette))
  const fallback = layers ? null : createPreviewPointSampler(document)
  return (xs: Int32Array, ys: Int32Array, output: Uint8ClampedArray): void => {
    output.fill(0)
    if (!layers) {
      if (!fallback) return
      for (let y = 0; y < ys.length; y++) for (let x = 0; x < xs.length; x++) {
        if (xs[x] < 0 || ys[y] < 0 || xs[x] >= document.width || ys[y] >= document.height) continue
        const c = fallback(xs[x], ys[y]), i = (y * xs.length + x) * 4
        output[i] = c.r; output[i + 1] = c.g; output[i + 2] = c.b; output[i + 3] = c.a
      }
      return
    }
    for (const layer of layers) {
      let left = 0, right = xs.length, top = 0, bottom = ys.length
      while (left < right && xs[left] < Math.max(0, layer.offsetX)) left++
      while (right > left && xs[right - 1] >= Math.min(document.width, layer.offsetX + layer.width)) right--
      while (top < bottom && ys[top] < Math.max(0, layer.offsetY)) top++
      while (bottom > top && ys[bottom - 1] >= Math.min(document.height, layer.offsetY + layer.height)) bottom--
      if (left === right || top === bottom) continue
      // Resolve storage once per layer, without materializing sparse cels.
      const dense = lazyRuntimeRasterForSurface(layer) ? null : layer.pixels
      for (let y = top; y < bottom; y++) {
        const row = (ys[y] - layer.offsetY) * layer.width
        for (let x = left; x < right; x++) {
          const index = row + xs[x] - layer.offsetX
          let c: RgbaColor | undefined
          let packed: number
          if (!dense) packed = readSurfacePackedLocal(layer, xs[x] - layer.offsetX, ys[y] - layer.offsetY)
          else if (layer.format === 'indexed') packed = dense[index]
          else { const p = index * 4; packed = dense[p] | dense[p + 1] << 8 | dense[p + 2] << 16 | dense[p + 3] << 24 }
          if (layer.format === 'indexed') c = palette.get(packed)
          const a = layer.format === 'indexed' ? c?.a ?? 0 : packed >>> 24
          if (!a) continue
          const r = c?.r ?? packed & 255, g = c?.g ?? packed >>> 8 & 255, b = c?.b ?? packed >>> 16 & 255
          const i = (y * xs.length + x) * 4
          if (layer.opacity === 1 && (!output[i + 3] || a === 255)) {
            output[i] = r; output[i + 1] = g; output[i + 2] = b; output[i + 3] = a
          } else {
            const sa = a / 255 * layer.opacity, da = output[i + 3] / 255, alpha = sa + da * (1 - sa)
            output[i] = Math.round((r * sa + output[i] * da * (1 - sa)) / alpha)
            output[i + 1] = Math.round((g * sa + output[i + 1] * da * (1 - sa)) / alpha)
            output[i + 2] = Math.round((b * sa + output[i + 2] * da * (1 - sa)) / alpha)
            output[i + 3] = Math.round(alpha * 255)
          }
        }
      }
    }
  }
}
