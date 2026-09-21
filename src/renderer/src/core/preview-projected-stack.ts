import type { SpriteDocument } from '@shared/types-document'
import type { RasterLayer } from '@shared/types-layer'
import { activeCelMasksByLayer, activeGroupMasksByGroup, buildCompositeStack, type CompositeStackItem } from './document-composite-plan'
import { blendWithModeInto } from './raster'
import { readSurfacePackedLocal } from './runtime-raster'

type Project = (xs: Int32Array, ys: Int32Array, output: Uint8ClampedArray) => void

/** Group/clipping isolation uses only the projected dirty rectangle, never a
 * full-size cel. All compositing levels preserve the editor's blend semantics. */
export function createProjectedStackRenderer(document: SpriteDocument, layerRenderer: (layer: RasterLayer) => Project): Project {
  const stack = buildCompositeStack(document)
  const masks = activeCelMasksByLayer(document, undefined, true)
  const groupMasks = activeGroupMasksByGroup(document, undefined, true)
  const readers = new Map(document.layers.map(layer => [layer.id, layerRenderer(layer)]))
  const owner = (item: CompositeStackItem) => item.kind === 'layer' ? item.layer : item.group
  const maskFor = (item: CompositeStackItem) => item.kind === 'layer' ? masks.get(item.layer.id) : groupMasks.get(item.group.id)
  return (xs, ys, output) => {
    const blend = (dst: Uint8ClampedArray, src: Uint8ClampedArray, item: CompositeStackItem, onlyWhere?: Uint8ClampedArray) => {
      const { opacity, blendMode } = owner(item)
      for (let i = 0; i < dst.length; i += 4) {
        if (!src[i + 3] || (onlyWhere && !onlyWhere[i + 3])) continue
        if (opacity === 1 && (!dst[i + 3] || (blendMode === 'normal' && src[i + 3] === 255))) dst.set(src.subarray(i, i + 4), i)
        else blendWithModeInto(dst, i, dst[i], dst[i + 1], dst[i + 2], dst[i + 3], src[i], src[i + 1], src[i + 2], src[i + 3], opacity, blendMode)
      }
    }
    const applyMask = (pixels: Uint8ClampedArray, item: CompositeStackItem) => {
      const mask = maskFor(item)
      if (!mask) return
      for (let y = 0; y < ys.length; y++) for (let x = 0; x < xs.length; x++) {
        const packed = readSurfacePackedLocal(mask, xs[x] - mask.offsetX, ys[y] - mask.offsetY)
        if (packed >>> 24) { const i = (y * xs.length + x) * 4 + 3; pixels[i] = Math.round(pixels[i] * (packed & 255) / 255) }
      }
    }
    const isolated = (item: CompositeStackItem): Uint8ClampedArray => {
      const pixels = new Uint8ClampedArray(output.length)
      if (!owner(item).visible) return pixels
      if (item.kind === 'layer') readers.get(item.layer.id)!(xs, ys, pixels)
      else container(item.children, pixels)
      applyMask(pixels, item)
      return pixels
    }
    const regular = (item: CompositeStackItem, dst: Uint8ClampedArray, clipped = false) => {
      const settings = owner(item)
      if (!settings.visible || settings.opacity <= 0) return
      if (item.kind === 'group' && item.group.cumulativeBlend) {
        const source = isolated(item), cumulative = dst.slice()
        container(item.children, cumulative)
        applyMask(cumulative, item)
        blend(dst, cumulative, item, source)
      } else if (!clipped && item.kind === 'group' && settings.blendMode === 'normal' && settings.opacity === 1 && !maskFor(item)) container(item.children, dst)
      else blend(dst, isolated(item), item)
    }
    function container(items: CompositeStackItem[], dst: Uint8ClampedArray): void {
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        let last = i
        while (last + 1 < items.length && owner(items[last + 1]).clippingMask) last++
        if (last === i) { regular(item, dst); continue }
        if (owner(item).visible && owner(item).opacity > 0) {
          const base = isolated(item), clipped = base.slice()
          for (let p = 3; p < clipped.length; p += 4) if (clipped[p]) clipped[p] = 255
          for (let j = i + 1; j <= last; j++) regular(items[j], clipped, true)
          for (let p = 3; p < clipped.length; p += 4) clipped[p] = base[p]
          blend(dst, clipped, item)
        }
        i = last
      }
    }
    output.fill(0)
    container(stack, output)
  }
}
