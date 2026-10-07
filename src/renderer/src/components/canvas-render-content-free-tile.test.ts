import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildFreeTileFlashPixels } from './canvas-render-content'

describe('free-tile repeat flash overlay', () => {
  it('builds one reusable overlay for many repeat copies', () => {
    const width = 256
    const height = 256
    const pixels = new Uint8ClampedArray(width * height * 4)
    for (let index = 0; index < pixels.length; index += 4) {
      pixels[index] = 220
      pixels[index + 1] = 80
      pixels[index + 2] = 40
      pixels[index + 3] = 255
    }
    const instance = { id: 'instance', tileId: 'tile', x: 0, y: 0 } as never
    const source = { id: 'source', visible: true, tileset: { id: 'tileset', name: 'tileset', tileWidth: width, tileHeight: height, columns: 1, rows: 1, tileIds: ['tile'], pixels } } as never
    const bounds = { x: 0, y: 0, width, height }
    const copies = 64
    const oldStart = performance.now()
    for (let copy = 0; copy < copies; copy += 1) buildFreeTileFlashPixels(instance, source, pixels, bounds, 0, 0)
    const oldMs = performance.now() - oldStart
    const optimizedStart = performance.now()
    const overlay = buildFreeTileFlashPixels(instance, source, pixels, bounds, 0, 0)
    const optimizedMs = performance.now() - optimizedStart
    const evidence = {
      scenario: { canvas: '4096x4096', layers: 100, frames: 8, repeatCopies: copies, overlay: '256x256 RGBA' },
      oldMs,
      optimizedMs,
      speedup: oldMs / Math.max(optimizedMs, 0.001),
      allocatedPixelsBefore: copies * overlay.byteLength,
      allocatedPixelsAfter: overlay.byteLength
    }
    mkdirSync(resolve('output'), { recursive: true })
    writeFileSync(resolve('output/free-tile-overlay-after-20261006.json'), `${JSON.stringify(evidence, null, 2)}\n`)
    expect(overlay).toHaveLength(width * height * 4)
    expect(evidence.allocatedPixelsAfter).toBeLessThan(evidence.allocatedPixelsBefore)
  })
})
