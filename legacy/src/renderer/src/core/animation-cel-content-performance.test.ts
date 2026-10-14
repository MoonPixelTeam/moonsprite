import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { AnimationCelSurface } from '@shared/types-animation'
import { animationCelHasContent } from './animation'
import { animationCelContentCacheStats, resetAnimationCelContentCacheStats } from './animation-cel-content-cache'
import { createDocument, createSparseLayer, markRasterStorageContentChanged } from './document-model'

const baselineHasContent = (surface: AnimationCelSurface): boolean => {
  if (surface.format === 'rgba') {
    for (let index = 3; index < surface.pixels.length; index += 4) if (surface.pixels[index] > 0) return true
    return false
  }
  return surface.pixels.some((pixel) => pixel !== 0)
}

describe('animation cel content cache', () => {
  it('reuses shared 4096² cel scans across 100 layers and 8 frames', () => {
    const width = 4096
    const height = 4096
    const document = createDocument('4096 cel content cache', width, height, 'rgba', false)
    for (let index = 1; index < 100; index += 1) document.layers.push(createSparseLayer(`Layer ${index}`, 'rgba'))
    const timeline = document.animation!
    for (let index = 1; index < 8; index += 1) timeline.frames.push({ id: `frame-${index + 1}`, duration: 100 })

    const firstPixels = new Uint8ClampedArray(width * height * 4)
    const secondPixels = new Uint8ClampedArray(width * height * 4)
    firstPixels[firstPixels.length - 1] = 255
    secondPixels[secondPixels.length - 1] = 255
    markRasterStorageContentChanged(firstPixels)
    markRasterStorageContentChanged(secondPixels)
    const firstSurface: AnimationCelSurface = { format: 'rgba', width, height, offsetX: 0, offsetY: 0, pixels: firstPixels }
    const secondSurface: AnimationCelSurface = { format: 'rgba', width, height, offsetX: 0, offsetY: 0, pixels: secondPixels }
    timeline.cels = document.layers.flatMap((layer, layerIndex) => timeline.frames.map((frame, frameIndex) => ({
      id: `${layer.id}:${frame.id}`,
      layerId: layer.id,
      frameId: frame.id,
      surface: (layerIndex + frameIndex) % 2 === 0 ? firstSurface : secondSurface,
      opacity: 1
    })))

    // A full 4096² tail scan is intentionally expensive; 64 calls already
    // exercises the shared-storage path while keeping CI below its timeout.
    const calls = 64
    const baselineStarted = performance.now()
    let baselineHits = 0
    let baselineScans = 0
    for (let index = 0; index < calls; index += 1) {
      const cel = timeline.cels[index % timeline.cels.length]
      baselineHits += Number(baselineHasContent(cel.surface!))
      baselineScans += 1
    }
    const baselineMs = performance.now() - baselineStarted

    resetAnimationCelContentCacheStats()
    const optimizedStarted = performance.now()
    let optimizedHits = 0
    for (let index = 0; index < calls; index += 1) {
      const cel = timeline.cels[index % timeline.cels.length]
      optimizedHits += Number(animationCelHasContent(cel, document.palette))
    }
    const optimizedMs = performance.now() - optimizedStarted
    const optimizedStats = animationCelContentCacheStats()

    const changedCel = timeline.cels[0]
    firstPixels[firstPixels.length - 1] = 0
    markRasterStorageContentChanged(firstPixels)
    expect(animationCelHasContent(changedCel, document.palette)).toBe(false)
    firstPixels[firstPixels.length - 1] = 255
    markRasterStorageContentChanged(firstPixels)
    expect(animationCelHasContent(changedCel, document.palette)).toBe(true)

    const evidence = {
      scenario: { canvas: '4096x4096', layers: 100, frames: 8, cels: 800, content: 'two shared RGBA storage buffers with tail pixels' },
      calls,
      storageBytes: firstPixels.byteLength + secondPixels.byteLength,
      baselineScans,
      optimizedScans: optimizedStats.pixelScans,
      optimizedCacheHits: optimizedStats.cacheHits,
      optimizedCacheMisses: optimizedStats.cacheMisses,
      baselineMs,
      optimizedMs,
      elapsedReductionRatio: baselineMs > 0 ? 1 - optimizedMs / baselineMs : 0,
      revisionInvalidationVerified: true
    }
    mkdirSync(resolve('output'), { recursive: true })
    writeFileSync(resolve('output/animation-cel-content-cache-after-20261006.json'), `${JSON.stringify(evidence, null, 2)}\n`)

    expect(optimizedHits).toBe(baselineHits)
    expect(optimizedStats.pixelScans).toBe(2)
    expect(optimizedStats.cacheHits).toBe(calls - 2)
    expect(optimizedMs).toBeLessThan(baselineMs)
  }, 30000)

  it('separates indexed palette visibility and invalidates after storage revision changes', () => {
    const surface: AnimationCelSurface = { format: 'indexed', width: 2, height: 1, offsetX: 0, offsetY: 0, pixels: new Uint32Array([7, 0]) }
    const cel = { id: 'indexed-content', layerId: 'layer', frameId: 'frame', surface }
    const opaque = [{ id: 7, name: 'visible', color: { r: 1, g: 2, b: 3, a: 255 } }]
    const transparent = [{ id: 7, name: 'transparent', color: { r: 1, g: 2, b: 3, a: 0 } }]
    markRasterStorageContentChanged(surface.pixels)
    expect(animationCelHasContent(cel, opaque)).toBe(true)
    expect(animationCelHasContent(cel, transparent)).toBe(false)
    surface.pixels[1] = 7
    markRasterStorageContentChanged(surface.pixels)
    expect(animationCelHasContent(cel, transparent)).toBe(false)
    expect(animationCelHasContent(cel, opaque)).toBe(true)
  })
})
