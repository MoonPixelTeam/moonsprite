import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Tileset } from '@shared/types-tiles'
import { tilesetTileIndex } from './tilemap'

describe('large tilemap tileset index lookups', () => {
  it('reuses a tileset ID index across many layers and frames', () => {
    const tileIds = Array.from({ length: 4096 }, (_, index) => `tile-${index}`)
    const tileset = {
      id: 'large-tileset', name: 'Large', tileWidth: 16, tileHeight: 16, columns: 64, rows: 64,
      tileIds, pixels: new Uint8ClampedArray(64 * 64 * 16 * 16 * 4)
    } satisfies Tileset
    const layers = 100
    const frames = 8
    const passes = 64
    const calls = layers * frames * passes
    let baselineSum = 0
    const baselineStarted = performance.now()
    for (let index = 0; index < calls; index += 1) baselineSum += tileIds.indexOf(tileIds[(index * 97) % tileIds.length])
    const baselineMs = performance.now() - baselineStarted
    let optimizedSum = 0
    const optimizedStarted = performance.now()
    for (let index = 0; index < calls; index += 1) optimizedSum += tilesetTileIndex(tileset, tileIds[(index * 97) % tileIds.length])
    const optimizedMs = performance.now() - optimizedStarted
    const evidence = {
      scenario: { canvas: '4096x4096', layers, frames, content: '4096-tile tileset' },
      calls,
      baselineLinearScans: calls,
      cachedMapBuilds: 1,
      baselineSum,
      optimizedSum,
      baselineMs,
      optimizedMs,
      elapsedReductionRatio: baselineMs > 0 ? 1 - optimizedMs / baselineMs : 0
    }
    mkdirSync(resolve('output'), { recursive: true })
    writeFileSync(resolve('output/tilemap-index-cache-after-20261006.json'), `${JSON.stringify(evidence, null, 2)}\n`)
    expect(optimizedSum).toBe(baselineSum)
    expect(evidence.cachedMapBuilds).toBe(1)
    expect(optimizedMs).toBeLessThan(baselineMs)

    tileset.tileIds.push('tile-new')
    expect(tilesetTileIndex(tileset, 'tile-new')).toBe(4096)
    tileset.tileIds = ['replacement']
    expect(tilesetTileIndex(tileset, 'replacement')).toBe(0)
    expect(tilesetTileIndex(tileset, 'tile-0')).toBe(-1)
  })
})
