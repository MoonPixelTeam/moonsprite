import type { LayerStyles } from '@shared/types-layer-style'
import type { RgbaColor } from '@shared/types-color'
import type { SelectionRect } from '@shared/types-selection'
import { applyLayerStylesAt, layerStyleAffectedRect, type LayerStyleGeometry, type LayerStyleSourceReader, type LayerStyleColorResolver } from './layer-styles'
import { layerStyleCoverageAt, layerStyleCoverageTile } from './layer-style-coverage'
import { readRgbaPixel, writeRgbaPixel } from './raster'

import { STYLED_LAYER_BLOCK_SIZE as DEFAULT_SIZE, dynamicStyledLayerBlockSize, type StyledLayerBlock } from './document-composite-style-types'
import { appendStyleDirtyRect, refreshStyledLayerBlock } from './layer-style-dirty-regions'
import { intersectRect } from './document-composite-style-geometry'
import { BudgetedStyleBlockMap, LayerStyleCacheBudget } from './layer-style-cache-budget'

interface Entry { key: string; revision: number; tiles: Map<string, StyledLayerBlock>; blockSize: number }

/** Cache isolated post-mask effects; backdrop-dependent blending stays outside. */
export class LayerStyleTileCache {
  private entries = new WeakMap<object, Entry>()
  constructor(private readonly budget = new LayerStyleCacheBudget()) {}

  /** Property edits do not alter a layer's isolated, post-mask source pixels. */
  retainRevision(owner: object, fromRevision: number, revision: number): void {
    const entry = this.entries.get(owner)
    if (entry && entry.revision >= fromRevision && entry.revision <= revision) entry.revision = revision
  }

  prepare(owner: object, key: string, revision: number, dirty: readonly SelectionRect[] | undefined, geometry: LayerStyleGeometry,
    styles: LayerStyles, readSource: LayerStyleSourceReader, resolve: LayerStyleColorResolver): LayerStyleSourceReader {
    const SIZE = dynamicStyledLayerBlockSize(styles)
    let entry = this.entries.get(owner)
    if (!entry || entry.key !== key || entry.blockSize !== SIZE || (entry.revision !== revision && !dirty)) {
      entry?.tiles.clear()
      entry = { key, revision, tiles: new BudgetedStyleBlockMap(this.budget), blockSize: SIZE }
      this.entries.set(owner, entry)
    } else if (dirty) for (const rect of dirty) {
      const affected = layerStyleAffectedRect(rect, styles)
      for (let y = Math.floor(affected.y / SIZE); y <= Math.floor((affected.y + affected.height - 1) / SIZE); y++) {
        for (let x = Math.floor(affected.x / SIZE); x <= Math.floor((affected.x + affected.width - 1) / SIZE); x++) {
          const tile = entry.tiles.get(`${x}:${y}`)
          if (!tile) continue
          const dirtyRect = intersectRect(tile, affected)
          if (dirtyRect) appendStyleDirtyRect(tile.dirtyRects ??= [], dirtyRect)
        }
      }
    }
    entry.revision = revision
    const render = (rect: SelectionRect): Uint8ClampedArray => {
      const radius = Math.max(styles.stroke.enabled ? styles.stroke.size : 0, styles.innerGlow.enabled ? styles.innerGlow.size : 0,
        styles.shadow.enabled ? styles.shadow.blur + Math.max(Math.abs(styles.shadow.offsetX), Math.abs(styles.shadow.offsetY)) : 0)
      const left = rect.x - radius, top = rect.y - radius
      const width = rect.width + radius * 2, height = rect.height + radius * 2
      const samples: Array<RgbaColor | undefined> = new Array(width * height)
      const read: LayerStyleSourceReader = (sx, sy) => {
        const index = (sy - top) * width + sx - left
        if (sx < left || sy < top || sx >= left + width || sy >= top + height) return readSource(sx, sy)
        return samples[index] ??= readSource(sx, sy)
      }
      const coverage = layerStyleCoverageTile(rect, styles, (sx, sy) => read(sx, sy).a)
      const pixels = new Uint8ClampedArray(rect.width * rect.height * 4)
      for (let py = 0; py < rect.height; py++) for (let px = 0; px < rect.width; px++) {
        const index = py * rect.width + px, sx = rect.x + px, sy = rect.y + py
        writeRgbaPixel(pixels, index, applyLayerStylesAt(geometry, styles, sx, sy, read(sx, sy), read, resolve, layerStyleCoverageAt(coverage, index)))
      }
      return pixels
    }
    return (x, y) => {
      const bx = Math.floor(x / SIZE), by = Math.floor(y / SIZE), tileKey = `${bx}:${by}`
      let tile = entry.tiles.get(tileKey)
      if (!tile) {
        const rect = { x: bx * SIZE, y: by * SIZE, width: SIZE, height: SIZE }
        tile = { ...rect, pixels: render(rect) }
        entry.tiles.set(tileKey, tile)
      } else refreshStyledLayerBlock(tile, render)
      return readRgbaPixel(tile.pixels, (y - by * SIZE) * SIZE + x - bx * SIZE)
    }
  }
}
