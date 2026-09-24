import type { SpriteDocument } from '@shared/types-document'
import type { SelectionRect } from '@shared/types-selection'
import type { RgbaColor } from '@shared/types-color'
import type { DocumentCompositeCache } from './document-composite-cache'
import { compileCompositePointSampler } from './document-composite-sampling'
import { packColor, unpackColor, writeRgbaPixel } from './raster'
import { compositeMovePreviewLayersInto } from './document-composite-raster'

type Read = (x: number, y: number) => RgbaColor
export interface PropertyCompositeMemo {
  targets: ReadonlySet<string>
  read(owner: object, slot: string, source: Read): Read
}
export interface PropertyCompositeChange {
  compositeOnly?: true
  propertyOwnerIds?: readonly string[]
  fromRevision: number
  revision: number
}

/** Exact, bounded backdrop/source reuse across a chain of property-only edits.
 * Neither document pixels nor the final rounding/blending rules are changed. */
export class LayerPropertyCompositeCache {
  private document: SpriteDocument | null = null
  private revision = -1
  private key = ''
  private bytes = 0
  private entries = new Map<object, Map<string, { pixels: Uint32Array; valid: Uint8Array }>>()
  private backdrop: { key: string; pixels: Uint8ClampedArray } | null = null
  constructor(private readonly maxBytes = 64 * 1024 * 1024) {}
  clear(): void { this.document = null; this.key = ''; this.bytes = 0; this.entries.clear(); this.backdrop = null }

  render(document: SpriteDocument, rect: SelectionRect, revision: number, change: PropertyCompositeChange | null | undefined,
    cache: DocumentCompositeCache): Uint8ClampedArray | null {
    if (!change?.compositeOnly || change.revision !== revision || !change.propertyOwnerIds?.length) { this.clear(); return null }
    const targets = new Set(change.propertyOwnerIds)
    const key = `${document.animation?.activeFrameId ?? 'static'}:${document.width}:${document.height}:${rect.x}:${rect.y}:${rect.width}:${rect.height}:${[...targets].sort().join(',')}`
    if (this.document !== document || this.key !== key || this.revision < change.fromRevision || this.revision > revision) this.clear()
    this.document = document; this.key = key; this.revision = revision
    const count = rect.width * rect.height
    // On very large views, avoid changing to a slower point path if even the
    // backdrop cannot fit. Ordinary scanline composition remains available.
    // Flat backgrounds need four bytes per pixel, not the five used by the
    // lazy point cache. A complete 4096px backdrop fits the 64 MiB budget.
    if (count * 4 > this.maxBytes) return null
    const flat = cache.movePreviewLayersFor(document, revision)
    if (flat && [...targets].every(id => flat.some(layer => layer.id === id))) {
      const first = flat.findIndex(layer => targets.has(layer.id))
      const prefix = flat.slice(0, first), prefixKey = prefix.map(layer => layer.id).join(',')
      if (this.backdrop?.key !== prefixKey) {
        if (this.backdrop) this.bytes -= this.backdrop.pixels.byteLength
        this.backdrop = null
        if (this.bytes + count * 4 > this.maxBytes) return null
        const pixels = new Uint8ClampedArray(count * 4)
        compositeMovePreviewLayersInto(document, prefix, rect.x, rect.y, rect.width, rect.height, revision, cache, pixels)
        this.backdrop = { key: prefixKey, pixels }; this.bytes += pixels.byteLength
      }
      const output = this.backdrop.pixels.slice()
      compositeMovePreviewLayersInto(document, flat.slice(first), rect.x, rect.y, rect.width, rect.height, revision, cache, output)
      return output
    }
    // Do not replace the vectorized normal/group compositor with per-pixel
    // callbacks. Even warm point caches are slower for these supported plans.
    if (count * 5 > this.maxBytes || cache.renderLayersFor(document, revision) || cache.opacityGroupStackFor(document, revision)) return null
    const memo: PropertyCompositeMemo = { targets, read: (owner, slot, source) => {
      let slots = this.entries.get(owner)
      let entry = slots?.get(slot)
      return (x, y) => {
        if (x < rect.x || y < rect.y || x >= rect.x + rect.width || y >= rect.y + rect.height) return source(x, y)
        if (!entry) {
          if (this.bytes + count * 5 > this.maxBytes) return source(x, y)
          entry = { pixels: new Uint32Array(count), valid: new Uint8Array(count) }
          slots = this.entries.get(owner)
          if (!slots) { slots = new Map(); this.entries.set(owner, slots) }
          slots.set(slot, entry); this.bytes += count * 5
        }
        const { pixels, valid } = entry
        const index = (y - rect.y) * rect.width + x - rect.x
        if (!valid[index]) { pixels[index] = packColor(source(x, y)); valid[index] = 1 }
        return unpackColor(pixels[index])
      }
    } }
    const sample = compileCompositePointSampler(document, undefined, cache, revision, undefined, false, undefined, memo)
    const output = new Uint8ClampedArray(count * 4)
    for (let y = 0; y < rect.height; y++) for (let x = 0; x < rect.width; x++) {
      writeRgbaPixel(output, y * rect.width + x, sample(rect.x + x, rect.y + y, undefined))
    }
    return output
  }
}
