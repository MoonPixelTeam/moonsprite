import type { SpriteDocument } from '@shared/types-document'
import type { RasterLayer } from '@shared/types-layer'
import type { SelectionRect } from '@shared/types-selection'
import { activeCelMasksByLayer, activeGroupMasksByGroup, buildCompositeStack, type CompositeStackItem } from './document-composite-plan'
import { type DocumentCompositeCache } from './document-composite-cache'
import { compositeNormalLayers } from './document-composite-raster'
import { createGradientMapPackedSampler } from './gradient-map'
import { hasEnabledLayerStyles } from './layer-styles'

/** Block path for normal-blend maps; unsupported stack features keep the reference compositor. */
export function compositeGradientMapRegion(document: SpriteDocument, startX: number, startY: number, width: number, height: number, cache?: DocumentCompositeCache, revision = 0, dirtyRect?: SelectionRect, output?: Uint8ClampedArray): Uint8ClampedArray | null {
  if (document.colorMode !== 'rgba' || (document.pixelFormat && document.pixelFormat !== 'rgba32')) return null
  if (!document.layers.some(layer => (layer.kind === 'adjustment' && layer.adjustment?.enabled) || (hasEnabledLayerStyles(layer.layerStyles) && layer.layerStyles?.gradientMap?.enabled))) return null
  const masks = activeCelMasksByLayer(document)
  const groupMasks = activeGroupMasksByGroup(document)
  const stack = buildCompositeStack(document)
  const supported = (items: CompositeStackItem[]): boolean => items.every(item => {
    const owner = item.kind === 'layer' ? item.layer : item.group
    if (!owner.visible || owner.opacity <= 0) return true
    if (owner.clippingMask || owner.blendMode !== 'normal') return false
    if (item.kind === 'group') return !item.group.cumulativeBlend && !groupMasks.has(owner.id) && !hasEnabledLayerStyles(owner.layerStyles) && supported(item.children)
    const styles = owner.layerStyles
    if (masks.has(owner.id) && item.layer.kind !== 'adjustment') return false
    return !hasEnabledLayerStyles(styles) || Boolean(styles?.gradientMap?.enabled && !styles.stroke.enabled && !styles.shadow.enabled && !styles.innerGlow.enabled && !styles.colorOverlay.enabled && !styles.gradientOverlay.enabled)
  })
  if (!supported(stack)) return null
  const proxy = (pixels: Uint8ClampedArray, opacity: number): RasterLayer => ({ id: 'gradient-map-block', name: '', format: 'rgba', visible: true, locked: false, blendMode: 'normal', opacity, width, height, offsetX: startX, offsetY: startY, pixels })
  const containsAdjustment = (items: CompositeStackItem[]): boolean => items.some(item => item.kind === 'group' ? containsAdjustment(item.children) : Boolean(item.layer.visible && item.layer.opacity > 0 && item.layer.kind === 'adjustment' && item.layer.adjustment?.enabled))
  const mapInto = (pixels: Uint8ClampedArray, layer: RasterLayer, opacity: number): void => {
    const sample = createGradientMapPackedSampler(layer.kind === 'adjustment' ? layer.adjustment!.gradientMap : layer.layerStyles!.gradientMap!)
    const mask = masks.get(layer.id)
    for (let y = 0, offset = 0; y < height; y++) for (let x = 0; x < width; x++, offset += 4) {
      const px = startX + x, py = startY + y
      if (!pixels[offset + 3] || px < 0 || py < 0 || px >= document.width || py >= document.height) continue
      let amount = opacity
      if (mask && px >= mask.offsetX && py >= mask.offsetY && px < mask.offsetX + mask.width && py < mask.offsetY + mask.height) {
        const index = ((py - mask.offsetY) * mask.width + px - mask.offsetX) * 4
        if (mask.pixels[index + 3]) amount *= mask.pixels[index] / 255
      }
      if (amount <= 0) continue
      const rgb = sample(pixels[offset], pixels[offset + 1], pixels[offset + 2], px, py)
      pixels[offset] = Math.round(pixels[offset] * (1 - amount) + (rgb & 255) * amount)
      pixels[offset + 1] = Math.round(pixels[offset + 1] * (1 - amount) + ((rgb >>> 8) & 255) * amount)
      pixels[offset + 2] = Math.round(pixels[offset + 2] * (1 - amount) + ((rgb >>> 16) & 255) * amount)
    }
  }
  const render = (items: CompositeStackItem[], output: Uint8ClampedArray = new Uint8ClampedArray(width * height * 4)): Uint8ClampedArray => {
    for (const item of items) {
      const owner = item.kind === 'layer' ? item.layer : item.group
      if (!owner.visible || owner.opacity <= 0) continue
      if (item.kind === 'group') {
        if (owner.opacity === 1 && !containsAdjustment(item.children)) render(item.children, output)
        else compositeNormalLayers(document, [proxy(render(item.children), owner.opacity)], startX, startY, width, height, undefined, revision, output)
        continue
      }
      const layer = item.layer
      if (layer.kind === 'adjustment') {
        if (layer.adjustment?.enabled) mapInto(output, layer, layer.opacity)
      } else if (hasEnabledLayerStyles(layer.layerStyles) && layer.layerStyles?.gradientMap?.enabled) {
          const source = compositeNormalLayers(document, [{ ...layer, opacity: 1, layerStyles: undefined }], startX, startY, width, height)
          mapInto(source, layer, 1)
          compositeNormalLayers(document, [proxy(source, layer.opacity)], startX, startY, width, height, undefined, revision, output)
      } else compositeNormalLayers(document, [layer], startX, startY, width, height, cache, revision, output, dirtyRect)
    }
    return output
  }
  return render(stack, output)
}
