import type { RgbaColor } from '@shared/types-color'
import type { LayerMask, RasterLayer } from '@shared/types-layer'
import type { SelectionRect } from '@shared/types-selection'
import type { SpriteDocument } from '@shared/types-document'
import type { DocumentCompositeCache } from './document-composite-cache'
import { activeCelMasksByLayer, activeGroupMasksByGroup, buildCompositeStack, type CompositeStackItem } from './document-composite-plan'
import { compositeBufferWithModeInto, compositeNormalLayers } from './document-composite-raster'
import { normalizeDocumentColor, resolveDocumentCanvasColor } from './document-model'
import { hasEnabledLayerStyles, resolveLayerStyles } from './layer-styles'

export interface GroupEffectsPlan {
  items: readonly CompositeStackItem[]
  layerMasks: ReadonlyMap<string, LayerMask>
  groupMasks: ReadonlyMap<string, LayerMask>
  overlays: ReadonlyMap<string, RgbaColor>
}

/** CPU-only block path; backdrop-dependent and spatial effects keep the reference sampler. */
export function groupEffectsPlan(document: SpriteDocument): GroupEffectsPlan | null {
  if (document.colorMode !== 'rgba' || (document.pixelFormat && document.pixelFormat !== 'rgba32')
    || !document.groups.length || (!document.animation?.groupMasks?.length
      && !document.groups.some(group => hasEnabledLayerStyles(group.layerStyles)))) return null
  const layerMasks = activeCelMasksByLayer(document)
  const groupMasks = activeGroupMasksByGroup(document)
  const overlays = new Map<string, RgbaColor>()
  const items = buildCompositeStack(document)
  let hasGroupEffect = false
  const supported = (entries: readonly CompositeStackItem[]): boolean => entries.every(item => {
    const owner = item.kind === 'layer' ? item.layer : item.group
    if (!owner.visible || owner.opacity <= 0) return true
    if (owner.clippingMask) return false
    if (item.kind === 'layer') return item.layer.format === 'rgba' && item.layer.kind !== 'adjustment' && !hasEnabledLayerStyles(owner.layerStyles)
    if (item.group.cumulativeBlend) return false
    if (hasEnabledLayerStyles(owner.layerStyles)) {
      const styles = resolveLayerStyles(owner.layerStyles)
      if (!styles.colorOverlay.enabled || styles.stroke.enabled || styles.shadow.enabled
        || styles.innerGlow.enabled || styles.gradientMap?.enabled || styles.gradientOverlay.enabled) return false
      overlays.set(owner.id, normalizeDocumentColor(document, resolveDocumentCanvasColor(document, styles.colorOverlay.color)))
      hasGroupEffect = true
    }
    hasGroupEffect ||= groupMasks.has(owner.id)
    return supported(item.children)
  })
  return supported(items) && hasGroupEffect ? { items, layerMasks, groupMasks, overlays } : null
}

const applyMask = (pixels: Uint8ClampedArray, mask: LayerMask | undefined, x: number, y: number, width: number, height: number): void => {
  if (!mask) return
  const left = Math.max(x, mask.offsetX), top = Math.max(y, mask.offsetY)
  const right = Math.min(x + width, mask.offsetX + mask.width), bottom = Math.min(y + height, mask.offsetY + mask.height)
  const source = mask.pixels
  for (let py = top; py < bottom; py++) for (let px = left; px < right; px++) {
    const sourceOffset = ((py - mask.offsetY) * mask.width + px - mask.offsetX) * 4
    // Match the point sampler: transparent/outside mask pixels are neutral.
    if (!source[sourceOffset + 3]) continue
    const offset = ((py - y) * width + px - x) * 4 + 3
    pixels[offset] = Math.round(pixels[offset] * source[sourceOffset] / 255)
  }
}

const applyOverlay = (pixels: Uint8ClampedArray, color: RgbaColor | undefined, document: SpriteDocument, x: number, y: number, width: number, height: number): void => {
  if (!color || color.a <= 0) return
  const amount = color.a / 255
  const left = Math.max(0, x), top = Math.max(0, y)
  const right = Math.min(document.width, x + width), bottom = Math.min(document.height, y + height)
  for (let py = top; py < bottom; py++) for (let px = left; px < right; px++) {
    const offset = ((py - y) * width + px - x) * 4
    if (!pixels[offset + 3]) continue
    pixels[offset] = Math.round(pixels[offset] + (color.r - pixels[offset]) * amount)
    pixels[offset + 1] = Math.round(pixels[offset + 1] + (color.g - pixels[offset + 1]) * amount)
    pixels[offset + 2] = Math.round(pixels[offset + 2] + (color.b - pixels[offset + 2]) * amount)
  }
}

/** Isolate children, then mask, overlay and blend; bound temporary storage by nesting depth. */
export function compositeGroupEffectsRegion(document: SpriteDocument, plan: GroupEffectsPlan, startX: number, startY: number,
  width: number, height: number, cache: DocumentCompositeCache | undefined, revision: number,
  output: Uint8ClampedArray, dirtyRect?: SelectionRect): Uint8ClampedArray {
  const tileSize = 256
  const tileBuffer = new Uint8ClampedArray(Math.min(width, tileSize) * Math.min(height, tileSize) * 4)
  const scratch: Uint8ClampedArray[] = []
  for (let ty = 0; ty < height; ty += tileSize) for (let tx = 0; tx < width; tx += tileSize) {
    const w = Math.min(tileSize, width - tx), h = Math.min(tileSize, height - ty)
    const x = startX + tx, y = startY + ty, bytes = w * h * 4
    const tile = tileBuffer.subarray(0, bytes)
    tile.fill(0)
    const isolate = (depth: number): Uint8ClampedArray => {
      if (!scratch[depth] || scratch[depth].length < bytes) scratch[depth] = new Uint8ClampedArray(bytes)
      const pixels = scratch[depth].subarray(0, bytes)
      pixels.fill(0)
      return pixels
    }
    const render = (items: readonly CompositeStackItem[], target: Uint8ClampedArray, depth: number): void => {
      let batch: RasterLayer[] = []
      const flush = (): void => {
        if (batch.length) compositeNormalLayers(document, batch, x, y, w, h, cache, revision, target, dirtyRect)
        batch = []
      }
      for (const item of items) {
        const owner = item.kind === 'layer' ? item.layer : item.group
        if (!owner.visible || owner.opacity <= 0) continue
        const mask = (item.kind === 'layer' ? plan.layerMasks : plan.groupMasks).get(owner.id)
        if (item.kind === 'layer' && !mask && owner.blendMode === 'normal') {
          batch.push(item.layer)
          continue
        }
        flush()
        if (item.kind === 'group' && !mask && !plan.overlays.has(owner.id) && owner.opacity === 1 && owner.blendMode === 'normal') {
          render(item.children, target, depth)
          continue
        }
        const isolated = isolate(depth)
        if (item.kind === 'group') render(item.children, isolated, depth + 1)
        // This short-lived raw proxy has no stable cache identity. Read only
        // the tile instead of rebuilding whole-layer row summaries for it.
        else compositeNormalLayers(document, [{ ...item.layer, opacity: 1, blendMode: 'normal' }], x, y, w, h, undefined, revision, isolated, dirtyRect)
        applyMask(isolated, mask, x, y, w, h)
        if (item.kind === 'group') applyOverlay(isolated, plan.overlays.get(owner.id), document, x, y, w, h)
        compositeBufferWithModeInto(target, isolated, owner.opacity, owner.blendMode)
      }
      flush()
    }
    render(plan.items, tile, 0)
    for (let row = 0; row < h; row++) output.set(tile.subarray(row * w * 4, (row + 1) * w * 4), ((ty + row) * width + tx) * 4)
  }
  return output
}
