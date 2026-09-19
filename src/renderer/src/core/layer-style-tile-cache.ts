import type { LayerStyles } from '@shared/types-layer-style'
import type { RgbaColor } from '@shared/types-color'
import type { SelectionRect } from '@shared/types-selection'
import { applyLayerStylesAt, layerStyleAffectedRect, type LayerStyleGeometry, type LayerStyleSourceReader, type LayerStyleColorResolver } from './layer-styles'
import { layerStyleCoverageAt, layerStyleCoverageTile } from './layer-style-coverage'
import { readRgbaPixel, writeRgbaPixel } from './raster'

const SIZE = 64
interface Entry { key: string; revision: number; tiles: Map<string, Uint8ClampedArray> }

/** Cache isolated post-mask effects; backdrop-dependent blending stays outside. */
export class LayerStyleTileCache {
  private entries = new WeakMap<object, Entry>()

  prepare(owner: object, key: string, revision: number, dirty: readonly SelectionRect[] | undefined, geometry: LayerStyleGeometry,
    styles: LayerStyles, readSource: LayerStyleSourceReader, resolve: LayerStyleColorResolver): LayerStyleSourceReader {
    let entry = this.entries.get(owner)
    if (!entry || entry.key !== key || (entry.revision !== revision && !dirty)) {
      entry = { key, revision, tiles: new Map() }
      this.entries.set(owner, entry)
    } else if (dirty) for (const rect of dirty) {
      const affected = layerStyleAffectedRect(rect, styles)
      for (let y = Math.floor(affected.y / SIZE); y <= Math.floor((affected.y + affected.height - 1) / SIZE); y++) {
        for (let x = Math.floor(affected.x / SIZE); x <= Math.floor((affected.x + affected.width - 1) / SIZE); x++) entry.tiles.delete(`${x}:${y}`)
      }
    }
    entry.revision = revision
    return (x, y) => {
      const bx = Math.floor(x / SIZE), by = Math.floor(y / SIZE), tileKey = `${bx}:${by}`
      let pixels = entry.tiles.get(tileKey)
      if (!pixels) {
        const rect = { x: bx * SIZE, y: by * SIZE, width: SIZE, height: SIZE }
        const radius = Math.max(styles.stroke.enabled ? styles.stroke.size : 0, styles.innerGlow.enabled ? styles.innerGlow.size : 0,
          styles.shadow.enabled ? styles.shadow.blur + Math.max(Math.abs(styles.shadow.offsetX), Math.abs(styles.shadow.offsetY)) : 0)
        const left = rect.x - radius, top = rect.y - radius, width = SIZE + radius * 2
        const samples: Array<RgbaColor | undefined> = new Array(width * width)
        const read: LayerStyleSourceReader = (sx, sy) => {
          const index = (sy - top) * width + sx - left
          if (sx < left || sy < top || sx >= left + width || sy >= top + width) return readSource(sx, sy)
          return samples[index] ??= readSource(sx, sy)
        }
        const coverage = layerStyleCoverageTile(rect, styles, (sx, sy) => read(sx, sy).a)
        pixels = new Uint8ClampedArray(SIZE * SIZE * 4)
        for (let py = 0; py < SIZE; py++) for (let px = 0; px < SIZE; px++) {
          const index = py * SIZE + px, sx = rect.x + px, sy = rect.y + py
          writeRgbaPixel(pixels, index, applyLayerStylesAt(geometry, styles, sx, sy, read(sx, sy), read, resolve, layerStyleCoverageAt(coverage, index)))
        }
        entry.tiles.set(tileKey, pixels)
      }
      return readRgbaPixel(pixels, (y - by * SIZE) * SIZE + x - bx * SIZE)
    }
  }
}
