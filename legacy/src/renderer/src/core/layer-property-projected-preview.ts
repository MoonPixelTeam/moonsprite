import type { SpriteDocument } from '@shared/types-document'
import type { RasterLayer } from '@shared/types-layer'
import type { SelectionRect } from '@shared/types-selection'
import type { PropertyCompositeChange } from './layer-property-composite-cache'
import { normalCompositeLayers } from './document-composite-plan'
import { compositeBufferWithModeInto } from './document-composite-raster'
import { lazyRuntimeRasterForSurface, readSurfacePackedLocal } from './runtime-raster'
import { packColor } from './raster'

/** Display-resolution sampling for a transient top-layer property preview.
 * Source pixels, the canonical compositor and exported images are untouched. */
export class LayerPropertyProjectedPreview {
  private document: SpriteDocument | null = null
  private key = ''
  private revision = -1
  private backdrop: Uint8ClampedArray | null = null
  private source: Uint8ClampedArray | null = null
  private output: Uint8ClampedArray | null = null
  constructor(private readonly maxBytes = 64 * 1024 * 1024) {}
  clear(): void { this.document = null; this.key = ''; this.backdrop = this.source = this.output = null; this.revision = -1 }

  render(document: SpriteDocument, rect: SelectionRect, width: number, height: number, revision: number,
    change: PropertyCompositeChange | null | undefined): Uint8ClampedArray | null {
    const count = width * height
    if (!change?.compositeOnly || change.revision !== revision || change.propertyOwnerIds?.length !== 1
      || width < 1 || height < 1 || count * 12 > this.maxBytes) { this.clear(); return null }
    const target = document.layers.find(layer => layer.id === change.propertyOwnerIds![0])
    if (!target) { this.clear(); return null }
    const key = `${document.animation?.activeFrameId ?? 'static'}:${document.width}:${document.height}:${target.id}:${rect.x}:${rect.y}:${rect.width}:${rect.height}:${width}:${height}`
    if (this.document !== document || this.key !== key || this.revision < change.fromRevision || this.revision > revision) this.clear()
    if (!this.backdrop || !this.source || !this.output) {
      // Include a fully transparent target in validation; fading through zero
      // must neither change the backdrop nor restart a 100-layer composite.
      const layers = normalCompositeLayers({ ...document, layers: document.layers.map(layer => layer === target ? { ...layer, opacity: 1 } : layer) }, true)
      if (!layers || layers.at(-1)?.id !== target.id) { this.clear(); return null }
      const backdrop = new Uint8ClampedArray(count * 4), source = new Uint8ClampedArray(count * 4)
      const xs = Int32Array.from({ length: width }, (_, x) => Math.floor(rect.x + (x + 0.5) * rect.width / width))
      const ys = Int32Array.from({ length: height }, (_, y) => Math.floor(rect.y + (y + 0.5) * rect.height / height))
      const palette = new Map(document.palette.map(entry => [entry.id, packColor(entry.color)]))
      for (const layer of layers) {
        this.sampleLayer(layer, xs, ys, palette, source)
        if (layer.id !== target.id) compositeBufferWithModeInto(backdrop, source, layer.opacity, layer.blendMode)
      }
      this.backdrop = backdrop; this.source = source; this.output = new Uint8ClampedArray(count * 4)
      this.document = document; this.key = key
    }
    this.revision = revision
    this.output.set(this.backdrop)
    compositeBufferWithModeInto(this.output, this.source, target.opacity, target.blendMode)
    return this.output
  }

  private sampleLayer(layer: RasterLayer, xs: Int32Array, ys: Int32Array, palette: Map<number, number>, output: Uint8ClampedArray): void {
    const packedOutput = new Uint32Array(output.buffer)
    packedOutput.fill(0)
    // Read dense RGBA/indexed storage directly, retaining the shared sparse
    // reader for lazy rasters. No full-size layer copies are needed.
    const dense = !lazyRuntimeRasterForSurface(layer) && layer.pixels.byteOffset % 4 === 0
      ? new Uint32Array(layer.pixels.buffer, layer.pixels.byteOffset, layer.pixels.byteLength / 4) : null
    for (let y = 0; y < ys.length; y++) {
      const sy = ys[y] - layer.offsetY
      if (sy < 0 || sy >= layer.height) continue
      for (let x = 0; x < xs.length; x++) {
        const sx = xs[x] - layer.offsetX
        if (sx < 0 || sx >= layer.width) continue
        const packed = dense ? dense[sy * layer.width + sx] : readSurfacePackedLocal(layer, sx, sy)
        packedOutput[y * xs.length + x] = layer.format === 'rgba' ? packed : palette.get(packed) ?? 0
      }
    }
  }
}
