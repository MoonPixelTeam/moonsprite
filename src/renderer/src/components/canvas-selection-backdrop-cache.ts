import type { SpriteDocument } from '@shared/types-document'
import type { RasterLayer } from '@shared/types-layer'
import type { SelectionRect } from '@shared/types-selection'
import type { DocumentCompositeCache } from '@/core/document-composite-cache'
import { readLayerPackedAt } from '@/core/document-model'
import type { SelectionTransformSource } from '@/core/tools-selection-transform'
import { compositePreviewPixel } from './canvas-composite-cache-pixel-utils'

const TILE_SIZE = 256
const MAX_BYTES = 16 * 1024 * 1024
type Tile = { rect: SelectionRect; pixels: Uint8ClampedArray }

/** The layers below the moving pixels stay unchanged throughout a transform.
 * Cache their exact software-composited bytes; never substitute Canvas blending.
 * Ownership follows the preview surface, so cancellation/revision invalidation
 * also releases these tiles. Each surface retains at most 16 MiB. */
export class CanvasSelectionBackdropCache {
  private source: SelectionTransformSource | null = null
  private copy = false
  private key = ''
  private tiles = new Map<string, Tile>()
  private bytes = 0

  constructor(private readonly composite: DocumentCompositeCache, private readonly maxBytes = MAX_BYTES, private readonly lowerOnly = false) {}

  get retainedBytes(): number { return this.bytes }

  read(document: SpriteDocument, layer: RasterLayer, lowerLayers: readonly RasterLayer[], source: SelectionTransformSource, copy: boolean, rect: SelectionRect, revision: number): Uint8ClampedArray {
    const key = `${document.id}:${document.animation?.activeFrameId ?? 'static'}:${revision}:${layer.id}`
    if (this.source !== source || this.copy !== copy || this.key !== key) {
      this.tiles.clear()
      this.bytes = 0
      this.source = source
      this.copy = copy
      this.key = key
    }
    const compose = (bounds: SelectionRect): Uint8ClampedArray => {
      const pixels = this.composite.normalLayerRegion(document, lowerLayers, bounds.x, bounds.y, bounds.width, bounds.height, revision)
      if (this.lowerOnly) return pixels
      const selection = source.selection
      const palette = layer.format === 'indexed' ? new Map(document.palette.map(entry => [entry.id, entry.color])) : null
      for (let row = 0; row < bounds.height; row++) for (let col = 0; col < bounds.width; col++) {
        const px = bounds.x + col, py = bounds.y + row
        const removed = !copy && px >= selection.x && py >= selection.y
          && px < selection.x + selection.width && py < selection.y + selection.height
          && (!selection.mask || selection.mask[(py - selection.y) * selection.width + px - selection.x] === 1)
        if (!removed) compositePreviewPixel(pixels, (row * bounds.width + col) * 4, readLayerPackedAt(document, layer, px, py) ?? 0, layer.format, layer.opacity, palette)
      }
      return pixels
    }
    // Small edits must not pay for a whole tile or retain an unused backdrop.
    if (rect.width * rect.height < 16 * 1024) return compose(rect)
    const output = new Uint8ClampedArray(rect.width * rect.height * 4)
    for (let y = Math.floor(rect.y / TILE_SIZE) * TILE_SIZE; y < rect.y + rect.height; y += TILE_SIZE) {
      for (let x = Math.floor(rect.x / TILE_SIZE) * TILE_SIZE; x < rect.x + rect.width; x += TILE_SIZE) {
        const tileKey = `${x}:${y}`
        let tile = this.tiles.get(tileKey)
        if (tile) {
          this.tiles.delete(tileKey)
          this.tiles.set(tileKey, tile)
        } else {
          const bounds = { x, y, width: Math.min(TILE_SIZE, document.width - x), height: Math.min(TILE_SIZE, document.height - y) }
          const pixels = compose(bounds)
          tile = { rect: bounds, pixels }
          while (this.bytes + pixels.byteLength > this.maxBytes && this.tiles.size) {
            const oldestKey = this.tiles.keys().next().value!
            this.bytes -= this.tiles.get(oldestKey)!.pixels.byteLength
            this.tiles.delete(oldestKey)
          }
          if (pixels.byteLength <= this.maxBytes) {
            this.tiles.set(tileKey, tile)
            this.bytes += pixels.byteLength
          }
        }
        const left = Math.max(x, rect.x), right = Math.min(x + tile.rect.width, rect.x + rect.width)
        const top = Math.max(y, rect.y), bottom = Math.min(y + tile.rect.height, rect.y + rect.height)
        for (let row = top; row < bottom; row++) {
          const from = ((row - y) * tile.rect.width + left - x) * 4
          output.set(tile.pixels.subarray(from, from + (right - left) * 4), ((row - rect.y) * rect.width + left - rect.x) * 4)
        }
      }
    }
    return output
  }
}
