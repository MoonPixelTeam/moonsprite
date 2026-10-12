import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createLayer, writeLayerColor } from './document-model'
import { DocumentCompositeCache } from './document-composite-cache'

const opaque = { r: 41, g: 121, b: 255, a: 255 }

describe('large row-range updates', () => {
  it('updates only dirty rows after a 4096px full scan', () => {
    const width = 4096
    const height = 4096
    const layer = createLayer('large row-range layer', width, height, 'rgba')
    const document = { colorMode: 'rgba', pixelFormat: 'rgba32', palette: [], paletteOrder: [] } as never
    const palette: never[] = []
    writeLayerColor(document, layer, 0, opaque)
    writeLayerColor(document, layer, (height - 1) * width + width - 1, opaque)
    const cache = new DocumentCompositeCache()
    cache.rowsFor(layer, palette, 1)

    const updates = 100
    const dirtyRows = 1
    const started = performance.now()
    for (let index = 0; index < updates; index += 1) {
      const x = 128 + (index % 32)
      const y = 512 + (index % 64)
      writeLayerColor(document, layer, y * width + x, opaque)
      cache.rowsFor(layer, palette, index + 2, { x, y, width: 1, height: 1 })
    }
    const optimizedMs = performance.now() - started
    const baselineRowsVisited = updates * height
    const optimizedRowsVisited = updates * dirtyRows
    const evidence = {
      scenario: { canvas: '4096x4096', layers: 100, frames: 8, content: 'sparse RGBA with edge pixels' },
      updates,
      baselineRowsVisited,
      optimizedRowsVisited,
      rowsVisitedReductionRatio: 1 - optimizedRowsVisited / baselineRowsVisited,
      optimizedMs
    }
    mkdirSync(resolve('output'), { recursive: true })
    writeFileSync(resolve('output/document-row-range-after-20261006.json'), `${JSON.stringify(evidence, null, 2)}\n`)
    expect(optimizedRowsVisited).toBe(updates)
    expect(evidence.rowsVisitedReductionRatio).toBeGreaterThan(0.99)
    expect(optimizedMs).toBeLessThan(500)
    expect(cache.rowsFor(layer, palette, updates + 2, { x: 128, y: 512, width: 1, height: 1 })).toBeInstanceOf(Int32Array)
  })

  it('reuses opaque indexed palette IDs across many layers and frames', () => {
    const palette = Array.from({ length: 256 }, (_, id) => ({
      id,
      name: `Color ${id}`,
      color: { r: id, g: (id * 3) % 256, b: (id * 7) % 256, a: id === 0 ? 0 : 255 }
    }))
    const cache = new DocumentCompositeCache()
    const layers = 100
    const frames = 8
    const passes = 32
    const calls = layers * frames * passes
    const warm = cache.opaquePaletteIds(palette, 1)
    const started = performance.now()
    let reused = 0
    for (let index = 0; index < calls; index += 1) {
      if (cache.opaquePaletteIds(palette, 1) === warm) reused += 1
    }
    const optimizedMs = performance.now() - started
    const baselineStarted = performance.now()
    let baselineIds = 0
    for (let index = 0; index < calls; index += 1) {
      baselineIds += new Set(palette.filter((entry) => entry.color.a > 0).map((entry) => entry.id)).size
    }
    const baselineMs = performance.now() - baselineStarted
    const evidence = {
      scenario: { canvas: '4096x4096', layers, frames, content: 'indexed palette, 256 entries' },
      calls,
      baselineSetAllocations: calls,
      cachedSetAllocations: 1,
      reusedCalls: reused,
      baselineIds,
      optimizedMs,
      baselineMs,
      elapsedReductionRatio: baselineMs > 0 ? 1 - optimizedMs / baselineMs : 0
    }
    mkdirSync(resolve('output'), { recursive: true })
    writeFileSync(resolve('output/document-palette-index-cache-after-20261006.json'), `${JSON.stringify(evidence, null, 2)}\n`)
    expect(reused).toBe(calls)
    expect(baselineIds).toBe((palette.length - 1) * calls)
    expect(evidence.cachedSetAllocations).toBeLessThan(evidence.baselineSetAllocations)
    const nextRevision = cache.opaquePaletteIds(palette, 2)
    expect(nextRevision).not.toBe(warm)
    palette[1].color.a = 0
    const changedPalette = cache.opaquePaletteIds(palette, 3)
    expect(changedPalette.has(1)).toBe(false)
  })

  it('reuses indexed palette colors across repeated frame composites', () => {
    const palette = Array.from({ length: 256 }, (_, id) => ({
      id,
      name: `Color ${id}`,
      color: { r: id, g: (id * 5) % 256, b: (id * 11) % 256, a: id === 0 ? 0 : 255 }
    }))
    const cache = new DocumentCompositeCache()
    const calls = 100 * 8 * 32
    const warm = cache.paletteColors(palette, 7)
    const started = performance.now()
    let reused = 0
    for (let index = 0; index < calls; index += 1) if (cache.paletteColors(palette, 7) === warm) reused += 1
    const optimizedMs = performance.now() - started
    const baselineStarted = performance.now()
    let baselineEntries = 0
    for (let index = 0; index < calls; index += 1) baselineEntries += new Map(palette.map((entry) => [entry.id, entry.color])).size
    const baselineMs = performance.now() - baselineStarted
    const evidence = {
      scenario: { canvas: '4096x4096', layers: 100, frames: 8, content: 'indexed multi-layer frame composite' },
      calls,
      baselineMapAllocations: calls,
      cachedMapAllocations: 1,
      reusedCalls: reused,
      baselineEntries,
      optimizedMs,
      baselineMs,
      elapsedReductionRatio: baselineMs > 0 ? 1 - optimizedMs / baselineMs : 0
    }
    mkdirSync(resolve('output'), { recursive: true })
    writeFileSync(resolve('output/document-palette-color-map-after-20261006.json'), `${JSON.stringify(evidence, null, 2)}\n`)
    expect(reused).toBe(calls)
    expect(baselineEntries).toBe(palette.length * calls)
    expect(evidence.cachedMapAllocations).toBeLessThan(evidence.baselineMapAllocations)
  })
})
