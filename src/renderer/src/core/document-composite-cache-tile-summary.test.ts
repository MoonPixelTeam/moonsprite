import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { PaletteEntry } from '@shared/types-color'
import type { RasterLayer } from '@shared/types-layer'
import { createDocument, createLayer, getLayerContentRevision, markLayerContentChanged } from './document-model'
import { DocumentCompositeCache } from './document-composite-cache'
import { compositeNormalLayers } from './document-composite-raster'
import { rasterStorageIdentity, runtimeRasterForSurface, runtimeTileHasVisiblePixels } from './runtime-raster'

// Previous production algorithm, using the same palette-ID cache so the
// comparison isolates tile summaries, lookup tables and query key preparation.
class PreviousTileCache extends DocumentCompositeCache {
  private previousTiles = new WeakMap<object, Map<string, Map<number, boolean>>>()
  override tileHasVisiblePixels(layer: RasterLayer, palette: readonly PaletteEntry[], tileX: number, tileY: number, tileSize: number, revision = 0): boolean {
    const opaqueIds = layer.format === 'indexed' ? this.opaquePaletteIds(palette, revision) : undefined
    if (tileSize === runtimeRasterForSurface(layer)?.tileSize) {
      const visible = runtimeTileHasVisiblePixels(layer, tileX, tileY, opaqueIds)
      if (visible !== null) return visible
    }
    const paletteKey = layer.format === 'rgba' ? 'rgba' : palette.map(entry => `${entry.id}:${entry.color.a}`).join(',')
    const key = `${layer.format}:${layer.width}:${layer.height}:${getLayerContentRevision(layer)}:${paletteKey}:${tileSize}`
    const storage = rasterStorageIdentity(layer)
    const entries = this.previousTiles.get(storage) ?? new Map<string, Map<number, boolean>>()
    let tiles = entries.get(key)
    if (!tiles) {
      if (entries.size >= 2) entries.clear()
      tiles = new Map()
      entries.set(key, tiles)
    }
    const columns = Math.ceil(layer.width / tileSize)
    const tileIndex = tileY * columns + tileX
    const cached = tiles.get(tileIndex)
    if (cached !== undefined) return cached
    const fromX = tileX * tileSize, fromY = tileY * tileSize
    const toX = Math.min(layer.width, fromX + tileSize), toY = Math.min(layer.height, fromY + tileSize)
    let visible = false
    for (let y = fromY; y < toY && !visible; y += 1) for (let x = fromX; x < toX; x += 1) {
      const index = y * layer.width + x
      if (layer.format === 'rgba' ? layer.pixels[index * 4 + 3] > 0 : opaqueIds!.has(layer.pixels[index])) { visible = true; break }
    }
    tiles.set(tileIndex, visible)
    entries.set(key, tiles)
    this.previousTiles.set(storage, entries)
    return visible
  }
}

const palette = Array.from({ length: 256 }, (_, id) => ({
  id, name: `Color ${id}`, color: { r: id, g: id, b: 255 - id, a: id % 3 === 0 ? 0 : id % 2 === 0 ? 128 : 255 }
}))

describe('lazy packed tile visibility summaries', () => {
  it.each(['rgba', 'indexed'] as const)('preserves edge tiles and invalidates %s edits', format => {
    const layer = createLayer('edge', 130, 65, format)
    const cache = new DocumentCompositeCache()
    expect(cache.tileHasVisiblePixels(layer, palette, 2, 1, 64, 1)).toBe(false)
    if (layer.format === 'rgba') layer.pixels[(64 * 130 + 129) * 4 + 3] = 128
    else layer.pixels[64 * 130 + 129] = 2
    markLayerContentChanged(layer)
    expect(cache.tileHasVisiblePixels(layer, palette, 2, 1, 64, 2)).toBe(true)
    expect(cache.tileHasVisiblePixels(layer, palette, 1, 1, 64, 2)).toBe(false)
    expect(cache.tileHasVisiblePixels(layer, palette, 3, 1, 64, 2)).toBe(false)
    layer.pixels.fill(0)
    markLayerContentChanged(layer)
    expect(cache.tileHasVisiblePixels(layer, palette, 2, 1, 64, 3)).toBe(false)
    cache.invalidateAll()
    expect(cache.tileHasVisiblePixels(layer, palette, 2, 1, 64, 3)).toBe(false)
  })

  it('handles missing IDs, sparse large IDs and live palette edits', () => {
    const layer = createLayer('indexed', 2, 1, 'indexed')
    const livePalette = [{ id: 1, name: 'color', color: { r: 1, g: 2, b: 3, a: 0 } }]
    layer.pixels[0] = 200
    const cache = new DocumentCompositeCache()
    expect(cache.tileHasVisiblePixels(layer, livePalette, 0, 0, 64, 1)).toBe(false)
    livePalette.push({ id: 200, name: 'new', color: { r: 4, g: 5, b: 6, a: 128 } })
    cache.invalidateLiveSourceCaches()
    expect(cache.tileHasVisiblePixels(layer, livePalette, 0, 0, 64, 1)).toBe(true)
    livePalette[1].color.a = 0
    expect(cache.tileHasVisiblePixels(layer, livePalette, 0, 0, 64, 2)).toBe(false)
    livePalette.push({ id: 0x100000, name: 'sparse ID', color: { r: 2, g: 3, b: 4, a: 255 } })
    layer.pixels[0] = 0x100000
    markLayerContentChanged(layer)
    expect(cache.tileHasVisiblePixels(layer, livePalette, 0, 0, 64, 3)).toBe(true)
  })

  it('measures real 4K indexed layers over eight frames, including rendered pixels', () => {
    const document = createDocument('linked indexed benchmark', 1, 1, 'indexed', false)
    document.width = document.height = 4096
    document.palette = palette
    // 100 layers per frame share two linked cel buffers (128 MiB). The report
    // records sharing explicitly; this avoids a fictitious 50 GiB fixture.
    const buffers = Array.from({ length: 2 }, (_, variant) => {
      const pixels = new Uint32Array(4096 * 4096)
      for (let y = 0; y < 4096; y += 64) for (let x = 0; x < 4096; x += 64) {
        if ((x / 64 + y / 64 + variant) % 3 === 0) pixels[(y + 63) * 4096 + x + 63] = variant + 1
        else if ((x / 64 + y / 64) % 5 === 0) pixels[y * 4096 + x] = 3 // transparent palette entry
      }
      return pixels
    })
    const frameLayers = Array.from({ length: 8 }, (_, frame) => Array.from({ length: 100 }, (_, index): RasterLayer => ({
      ...createLayer(`layer-${index}`, 1, 1, 'indexed'),
      format: 'indexed', width: 4096, height: 4096, pixels: buffers[(index + frame) % 2]
    })))
    const query = (cache: DocumentCompositeCache, allTiles: boolean): number => {
      let visible = 0
      const sets = allTiles ? [frameLayers[0].slice(0, 2)] : frameLayers
      const extent = allTiles ? 32 : 4
      for (const layers of sets) for (const layer of layers) for (let y = 0; y < extent; y += 1) for (let x = 0; x < extent; x += 1) {
        visible += Number(cache.tileHasVisiblePixels(layer, palette, x, y, 64, 1))
      }
      return visible
    }
    const time = (run: () => number) => {
      const start = performance.now()
      const result = run()
      return { ms: performance.now() - start, result }
    }
    const coldBefore = time(() => query(new PreviousTileCache(), true))
    const coldAfter = time(() => query(new DocumentCompositeCache(), true))
    expect(coldAfter.result).toBe(coldBefore.result)
    const before = new PreviousTileCache(), after = new DocumentCompositeCache()
    query(before, false)
    query(after, false)
    const querySamples = Array.from({ length: 5 }, (_, index) => {
      const runBefore = () => time(() => query(before, false))
      const runAfter = () => time(() => query(after, false))
      const [old, next] = index % 2 === 0 ? [runBefore(), runAfter()] : (() => { const next = runAfter(); return [runBefore(), next] })()
      expect(next.result).toBe(old.result)
      return { beforeMs: old.ms, afterMs: next.ms }
    })
    const render = (cache: DocumentCompositeCache): number => {
      let checksum = 0
      for (const layers of frameLayers) checksum += compositeNormalLayers(document, layers, 0, 0, 256, 256, cache, 1)[(63 * 256 + 63) * 4 + 3]
      return checksum
    }
    for (const layers of frameLayers) {
      const expected = compositeNormalLayers(document, layers, 0, 0, 256, 256, before, 1)
      const actual = compositeNormalLayers(document, layers, 0, 0, 256, 256, after, 1)
      expect(Buffer.compare(Buffer.from(actual), Buffer.from(expected))).toBe(0)
    }
    const renderSamples = Array.from({ length: 3 }, (_, index) => {
      let old: ReturnType<typeof time>, next: ReturnType<typeof time>
      if (index % 2 === 0) { old = time(() => render(before)); next = time(() => render(after)) }
      else { next = time(() => render(after)); old = time(() => render(before)) }
      expect(next.result).toBe(old.result)
      return { beforeMs: old.ms, afterMs: next.ms }
    })
    const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
    const summarize = (samples: typeof querySamples) => {
      const beforeMs = median(samples.map(sample => sample.beforeMs)), afterMs = median(samples.map(sample => sample.afterMs))
      return { beforeMs, afterMs, reduction: 1 - afterMs / beforeMs, samples }
    }
    const evidence = {
      scenario: { canvas: [4096, 4096], layers: 100, frames: 8, uniqueLinkedBuffers: 2, rasterBytes: 128 * 1024 * 1024,
        content: 'empty tiles, transparent palette IDs, sparse opaque/translucent edge pixels', renderViewport: [256, 256] },
      coldFullLayerQuery: { beforeMs: coldBefore.ms, afterMs: coldAfter.ms, tiles: 2048 },
      repeatedViewportQueries: { callsPerSample: 12800, ...summarize(querySamples) },
      eightFrameComposite: summarize(renderSamples),
      summaryBytesPer4KLayer: Math.ceil(64 * 64 / 4),
      renderedPixelsEqualForAllEightFrames: true,
      scope: 'CPU tile queries and real raster composition; not desktop GPU or end-to-end interaction latency'
    }
    mkdirSync(resolve('output'), { recursive: true })
    writeFileSync(resolve('output/document-tile-summary-after-20261006.json'), `${JSON.stringify(evidence, null, 2)}\n`)
    expect(evidence.repeatedViewportQueries.reduction).toBeGreaterThan(0.1)
    expect(evidence.eightFrameComposite.reduction).toBeGreaterThan(0.1)
  }, 30000)
})
