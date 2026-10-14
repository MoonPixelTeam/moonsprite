import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import type { AnimationCel, AnimationCelSurface } from '@shared/types-animation'
import type { PaletteEntry } from '@shared/types-color'
import type { SelectionMask } from '@shared/types-selection'
import { animationCelContentSelection } from './animation'
import { animationCelSelectionCacheStats } from './animation-cel-content-cache'
import { installRuntimeRaster, readSurfacePackedLocal, surfacePixelsMaterialized } from './runtime-raster'
import { createDocument, markRasterStorageContentChanged, markRasterSurfaceContentChanged, rasterContentBounds } from './document-model'

const baselineSelection = (cel: AnimationCel, palette: readonly PaletteEntry[], canvasWidth: number, canvasHeight: number, warmBounds = false): SelectionMask | null => {
  const surface = cel.surface
  if (!surface) return null
  const sourceLeft = Math.max(0, -surface.offsetX)
  const sourceTop = Math.max(0, -surface.offsetY)
  const sourceRight = Math.min(surface.width, canvasWidth - surface.offsetX)
  const sourceBottom = Math.min(surface.height, canvasHeight - surface.offsetY)
  if (sourceRight <= sourceLeft || sourceBottom <= sourceTop) return null
  const opaqueIds = surface.format === 'indexed' && palette.length ? new Set(palette.filter((entry) => entry.color.a > 0).map((entry) => entry.id)) : undefined
  const opaqueAt = (x: number, y: number): boolean => {
    const packed = readSurfacePackedLocal(surface, x, y)
    return surface.format === 'rgba' ? (packed >>> 24) > 0 : opaqueIds ? opaqueIds.has(packed) : packed !== 0
  }
  let minX = sourceRight, minY = sourceBottom, maxX = -1, maxY = -1
  const bounds = warmBounds ? rasterContentBounds(surface, palette) : undefined
  if (bounds) {
    minX = bounds.x; minY = bounds.y; maxX = bounds.x + bounds.width - 1; maxY = bounds.y + bounds.height - 1
  } else {
    for (let y = sourceTop; y < sourceBottom; y += 1) for (let x = sourceLeft; x < sourceRight; x += 1) if (opaqueAt(x, y)) {
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
    }
  }
  if (maxX < minX || maxY < minY) return null
  const width = maxX - minX + 1, height = maxY - minY + 1, mask = new Uint8Array(width * height)
  let selected = 0
  for (let y = minY; y <= maxY; y += 1) for (let x = minX; x <= maxX; x += 1) if (opaqueAt(x, y)) { mask[(y - minY) * width + x - minX] = 1; selected += 1 }
  const selection = { x: surface.offsetX + minX, y: surface.offsetY + minY, width, height }
  return selected === width * height ? selection : { ...selection, mask }
}

describe('animation cel content selection cache', () => {
  it.each(['rgba', 'indexed'] as const)('matches the original %s selection through edits, palette changes and clipping', (format) => {
    const surface: AnimationCelSurface = format === 'rgba'
      ? { format, width: 4, height: 2, offsetX: 0, offsetY: 0, pixels: new Uint8ClampedArray(32) }
      : { format, width: 4, height: 2, offsetX: 0, offsetY: 0, pixels: new Uint32Array(8) }
    const cel = { id: 'content', layerId: 'layer', frameId: 'frame', surface }
    if (format === 'rgba') { surface.pixels[3] = 255; surface.pixels[31] = 255 } else { surface.pixels[0] = 7; surface.pixels[7] = 7 }
    markRasterSurfaceContentChanged(surface)
    const palette = [{ id: 7, name: 'ink', color: { r: 1, g: 2, b: 3, a: 255 } }]
    const check = () => expect(animationCelContentSelection(cel, palette, 4, 2)).toEqual(baselineSelection(cel, palette, 4, 2))
    check(); check()
    const returned = animationCelContentSelection(cel, palette, 4, 2)!
    returned.mask!.fill(0)
    structuredClone(returned, { transfer: [returned.mask!.buffer] })
    check()
    for (const x of [-5, -3, -2, -1, 0, 1, 2, 3, 5]) for (const y of [-2, -1, 0, 1, 2]) {
      surface.offsetX = x; surface.offsetY = y; check()
    }
    surface.offsetX = 0; surface.offsetY = 0
    surface.pixels.fill(0); markRasterSurfaceContentChanged(surface); check()
    if (format === 'rgba') surface.pixels[7] = 255; else surface.pixels[1] = 7
    markRasterSurfaceContentChanged(surface); check()
    palette[0].color.a = 0; check()
    palette[0].color.a = 255; check()
    expect(animationCelContentSelection(cel, [], 4, 2)).toEqual(baselineSelection(cel, [], 4, 2))
  })

  it('keeps construction writes and runtime raster edits visible without materializing sparse tiles', () => {
    const surface: AnimationCelSurface = { format: 'rgba', width: 4, height: 2, offsetX: 0, offsetY: 0, pixels: new Uint8ClampedArray(32) }
    const cel = { id: 'runtime', layerId: 'layer', frameId: 'frame', surface }
    expect(animationCelContentSelection(cel, [], 4, 2)).toBeNull()
    surface.pixels[3] = 255
    expect(animationCelContentSelection(cel, [], 4, 2)).toEqual({ x: 0, y: 0, width: 1, height: 1 })
    const data = new Uint8Array(32); data[31] = 255
    installRuntimeRaster(surface, { kind: 'sparse-tiles-v1', format: 'rgba', width: 4, height: 2, tileSize: 4, data, tileOffsets: new Int32Array([1]) })
    expect(animationCelContentSelection(cel, [], 4, 2)).toEqual({ x: 3, y: 1, width: 1, height: 1 })
    expect(surfacePixelsMaterialized(surface)).toBe(false)
    surface.pixels.fill(0); markRasterSurfaceContentChanged(surface)
    expect(animationCelContentSelection(cel, [], 4, 2)).toBeNull()
  })

  it('evicts masks across independent storage at the total 4 MiB budget', () => {
    const cels = Array.from({ length: 6 }, (_, index) => {
      const surface: AnimationCelSurface = { format: 'indexed', width: 1024, height: 1024, offsetX: 0, offsetY: 0, pixels: new Uint32Array(1024 * 1024) }
      surface.pixels[0] = 7; surface.pixels[surface.pixels.length - 1] = 7
      markRasterSurfaceContentChanged(surface)
      return { id: `budget-${index}`, layerId: 'layer', frameId: 'frame', surface }
    })
    const palette = [{ id: 7, name: 'ink', color: { r: 0, g: 0, b: 0, a: 255 } }]
    const before = animationCelSelectionCacheStats()
    for (const cel of cels) {
      expect(animationCelContentSelection(cel, palette, 1024, 1024)?.mask?.byteLength).toBe(1024 * 1024)
      expect(animationCelSelectionCacheStats().bytes).toBeLessThanOrEqual(4 * 1024 * 1024)
    }
    expect(animationCelSelectionCacheStats().evictions).toBeGreaterThan(before.evictions)
    const builds = animationCelSelectionCacheStats().builds
    expect(animationCelContentSelection(cels[0], palette, 1024, 1024)?.mask?.[0]).toBe(1)
    expect(animationCelSelectionCacheStats().builds).toBe(builds + 1)
  })
  it('reuses a complex mask across 100 layers and 8 frames on a 4096² shared surface', () => {
    const width = 4096, height = 4096
    const document = createDocument('4096 cel selection', width, height, 'rgba', false)
    const pixels = new Uint8ClampedArray(width * height * 4)
    const contentLeft = 1536, contentTop = 1536, contentSize = 1024
    for (let y = contentTop; y < contentTop + contentSize; y += 1) for (let x = contentLeft; x < contentLeft + contentSize; x += 1) {
      if ((x + y) % 7 === 0) continue
      pixels[(y * width + x) * 4 + 3] = 255
    }
    markRasterStorageContentChanged(pixels)
    const surface: AnimationCelSurface = { format: 'rgba', width, height, offsetX: 0, offsetY: 0, pixels }
    const cels: AnimationCel[] = Array.from({ length: 800 }, (_, index) => ({ id: `cel-${index}`, layerId: `layer-${Math.floor(index / 8)}`, frameId: `frame-${index % 8}`, surface: { ...surface } }))
    expect(rasterContentBounds(surface, document.palette)).toEqual({ x: contentLeft, y: contentTop, width: contentSize, height: contentSize })
    const calls = 64
    const baselineStarted = performance.now()
    const baselineResults = Array.from({ length: calls }, (_, index) => baselineSelection(cels[(index * 13) % cels.length], document.palette, width, height, true))
    const baselineMs = performance.now() - baselineStarted
    const beforeStats = animationCelSelectionCacheStats()
    const optimizedStarted = performance.now()
    const optimizedResults = Array.from({ length: calls }, (_, index) => animationCelContentSelection(cels[(index * 13) % cels.length], document.palette, width, height))
    const optimizedMs = performance.now() - optimizedStarted
    const afterStats = animationCelSelectionCacheStats()
    for (let index = 0; index < calls; index += 1) {
      const actual = optimizedResults[index]!, expected = baselineResults[index]!
      expect({ ...actual, mask: undefined }).toEqual({ ...expected, mask: undefined })
      expect(Buffer.from(actual.mask!).equals(Buffer.from(expected.mask!))).toBe(true)
    }
    expect(optimizedResults[0]?.mask).toBeDefined()
    expect(optimizedResults[0]?.mask).not.toBe(optimizedResults[1]?.mask)
    const evidence = {
      scenario: { canvas: '4096x4096', layers: 100, frames: 8, cels: 800, content: 'one shared RGBA surface with 1024x1024 non-rectangular content' },
      calls,
      sampledCels: calls,
      distinctFramesSampled: new Set(Array.from({ length: calls }, (_, index) => cels[(index * 13) % cels.length].frameId)).size,
      storageBytes: pixels.byteLength,
      baseline: 'previous optimization: cached bounds plus pixel mask scan per call',
      baselineMaskBuilds: calls,
      optimizedBoundsScans: 0,
      warmBoundsProvided: true,
      optimizedMaskBuilds: afterStats.builds - beforeStats.builds,
      optimizedCacheHits: afterStats.hits - beforeStats.hits,
      retainedCacheBytes: afterStats.bytes,
      totalMaskCacheBudgetBytes: 4 * 1024 * 1024,
      optimizedMaskCopies: calls,
      baselineMs,
      optimizedMs,
      elapsedReductionRatio: baselineMs > 0 ? 1 - optimizedMs / baselineMs : 0,
      resultsEquivalent: true
    }
    mkdirSync(resolve('output'), { recursive: true })
    writeFileSync(resolve('output/animation-cel-selection-mask-cache-after-20261006.json'), `${JSON.stringify(evidence, null, 2)}\n`)
    expect(afterStats.builds - beforeStats.builds).toBe(1)
    expect(afterStats.hits - beforeStats.hits).toBe(calls - 1)
    expect(optimizedMs).toBeLessThan(baselineMs)
  }, 30000)

  it('refines bounds when a cel crosses the canvas edge', () => {
    const surface: AnimationCelSurface = { format: 'rgba', width: 4, height: 1, offsetX: -2, offsetY: 0, pixels: new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 0]) }
    markRasterStorageContentChanged(surface.pixels)
    const selection = animationCelContentSelection({ id: 'edge', layerId: 'layer', frameId: 'frame', surface }, [], 2, 1)
    expect(selection).toEqual({ x: 0, y: 0, width: 1, height: 1 })
  })

  it('keeps independent placement metadata and new storage out of shared mask entries', () => {
    const surface: AnimationCelSurface = { format: 'indexed', width: 3, height: 1, offsetX: 0, offsetY: 0, pixels: new Uint32Array([7, 0, 7]) }
    markRasterSurfaceContentChanged(surface)
    const cel = { id: 'placement', layerId: 'layer', frameId: 'frame', surface }
    const palette = [{ id: 7, name: 'ink', color: { r: 0, g: 0, b: 0, a: 255 } }]
    expect(animationCelContentSelection(cel, palette, 100, 100)?.x).toBe(0)
    const sharing = { ...cel, surface: { ...surface, offsetX: 20, offsetY: 30 } }
    expect(animationCelContentSelection(sharing, palette, 100, 100)).toEqual({ x: 20, y: 30, width: 3, height: 1, mask: new Uint8Array([1, 0, 1]) })
    cel.surface.pixels = new Uint32Array([0, 7, 0]); markRasterSurfaceContentChanged(cel.surface)
    expect(animationCelContentSelection(cel, palette, 100, 100)).toEqual({ x: 1, y: 0, width: 1, height: 1 })
    sharing.surface.width = 1; sharing.surface.height = 3
    expect(animationCelContentSelection(sharing, palette, 100, 100)).toEqual({ x: 20, y: 30, width: 1, height: 3, mask: new Uint8Array([1, 0, 1]) })
  })

  it('preserves indexed sparse palette semantics without materializing storage', () => {
    const surface: AnimationCelSurface = { format: 'indexed', width: 2, height: 1, offsetX: 0, offsetY: 0, pixels: new Uint32Array(1) }
    installRuntimeRaster(surface, { kind: 'sparse-tiles-v1', format: 'indexed', width: 2, height: 1, tileSize: 2, data: new Uint8Array([7, 0, 0, 0, 0, 0, 0, 0]), tileOffsets: new Int32Array([1]) })
    const cel = { id: 'sparse indexed', layerId: 'layer', frameId: 'frame', surface }
    const palette = [{ id: 7, name: 'ink', color: { r: 0, g: 0, b: 0, a: 0 } }]
    expect(animationCelContentSelection(cel, palette, 2, 1)).toBeNull()
    palette[0].color.a = 255
    expect(animationCelContentSelection(cel, palette, 2, 1)).toEqual({ x: 0, y: 0, width: 1, height: 1 })
    expect(animationCelContentSelection(cel, [], 2, 1)).toEqual({ x: 0, y: 0, width: 1, height: 1 })
    expect(surfacePixelsMaterialized(surface)).toBe(false)
  })

  it('reuses immutable sparse 4096² storage across all 800 cel queries', () => {
    const surface: AnimationCelSurface = { format: 'rgba', width: 4096, height: 4096, offsetX: 0, offsetY: 0, pixels: new Uint8ClampedArray(4) }
    const data = new Uint8Array(64 * 64 * 4); data[data.length - 1] = 255
    const tileOffsets = new Int32Array(64 * 64); tileOffsets[tileOffsets.length - 1] = 1
    installRuntimeRaster(surface, { kind: 'sparse-tiles-v1', format: 'rgba', width: 4096, height: 4096, tileSize: 64, data, tileOffsets })
    const before = animationCelSelectionCacheStats()
    for (let index = 0; index < 800; index += 1) {
      const cel = { id: `sparse-${index}`, layerId: `layer-${Math.floor(index / 8)}`, frameId: `frame-${index % 8}`, surface }
      expect(animationCelContentSelection(cel, [], 4096, 4096)).toEqual({ x: 4095, y: 4095, width: 1, height: 1 })
    }
    const after = animationCelSelectionCacheStats()
    expect(after.builds - before.builds).toBe(1)
    expect(after.hits - before.hits).toBe(799)
    expect(surfacePixelsMaterialized(surface)).toBe(false)
  })

  it('bypasses retention for masks larger than the total budget', () => {
    const width = 2050, height = 2050
    const surface: AnimationCelSurface = { format: 'rgba', width, height, offsetX: 0, offsetY: 0, pixels: new Uint8ClampedArray(width * height * 4) }
    surface.pixels[3] = 255; surface.pixels[surface.pixels.length - 1] = 255
    markRasterSurfaceContentChanged(surface)
    const cel = { id: 'oversized', layerId: 'layer', frameId: 'frame', surface }
    const before = animationCelSelectionCacheStats()
    const result = animationCelContentSelection(cel, [], width, height)!
    expect(result.mask!.byteLength).toBe(width * height)
    expect(result.mask![0]).toBe(1); expect(result.mask!.at(-1)).toBe(1)
    const after = animationCelSelectionCacheStats()
    expect(after.bytes).toBe(before.bytes)
    expect(after.entries).toBe(before.entries)
  })
})
