import { Buffer } from 'node:buffer'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SpriteDocument } from '@shared/types-document'
import type { RasterLayer } from '@shared/types-layer'
import type { SelectionRect } from '@shared/types-selection'
import { createDocument, createLayer, createLayerMask, markLayerContentChanged, writeLayerColor } from './document-model'
import { DocumentCompositeCache } from './document-composite-cache'
import { compositeRegion } from './document-composite-region'
import * as planning from './document-composite-plan'
import type { CompositeStackItem } from './document-composite-plan'
import { createDefaultLayerStyles, hasEnabledLayerStyles } from './layer-styles'

// Preserve the immediately preceding renderStackFor implementation. Both
// variants use the real, unchanged styled-proxy preparation and pixel caches.
class PreviousCache extends DocumentCompositeCache {
  override renderStackFor(document: SpriteDocument, revision: number, sourceDirtyRect?: SelectionRect): CompositeStackItem[] | null {
    const plain = this.opacityGroupStackFor(document, revision)
    if (plain) return plain
    const stack = planning.opacityGroupCompositeStack(document, true)
    if (!stack) return null
    const source = this as unknown as {
      styledLayer(document: SpriteDocument, layer: RasterLayer, dirty?: SelectionRect): RasterLayer
    }
    const prepare = (items: CompositeStackItem[]): CompositeStackItem[] => items.map(item => item.kind === 'group'
      ? { ...item, children: prepare(item.children) }
      : hasEnabledLayerStyles(item.layer.layerStyles)
        ? { ...item, layer: source.styledLayer(document, item.layer, sourceDirtyRect) }
        : item)
    return prepare(stack)
  }
}

const fixture = (size: number, count = 100, groupCount = 20) => {
  const document = createDocument('styled plan reuse', size, size, 'rgba', false)
  const first = document.layers[0]
  if (first.format !== 'rgba') throw new Error('RGBA fixture required')
  const pixels = first.pixels
  new Uint32Array(pixels.buffer).fill(0x80603010)
  for (let y = 0; y < size; y += 1) for (let x = y % 7; x < size; x += 32) pixels[(y * size + x) * 4 + 3] = 0
  for (let index = 1; index < count; index += 1) {
    const layer = createLayer(`Layer ${index}`, 1, 1, 'rgba')
    layer.width = size; layer.height = size; layer.pixels = pixels
    layer.opacity = (index % 3 + 1) / 3
    document.layers.push(layer)
  }
  for (let index = 0; index < groupCount; index += 1) document.groups.push({
    id: `g-${index}`, name: `Group ${index}`, visible: true, locked: false,
    opacity: 0.8, blendMode: index % 3 ? 'normal' : 'multiply',
    parentGroupId: index % 5 ? `g-${index - 1}` : null
  })
  for (let index = 0; index < count; index += 1) {
    document.layers[index].groupId = `g-${index % groupCount}`
    if (index % 13 === 0) {
      const styles = createDefaultLayerStyles()
      styles.stroke = { ...styles.stroke, enabled: true, size: 1, position: 'both' }
      styles.shadow.enabled = true
      document.layers[index].layerStyles = styles
    }
  }
  const timeline = document.animation!
  timeline.frames = Array.from({ length: 8 }, (_, index) => ({ id: `frame-${index}`, duration: 100 }))
  timeline.activeFrameId = timeline.frames[0].id
  timeline.cels = document.layers.flatMap((layer, layerIndex) => timeline.frames.map((frame, frameIndex) => ({
    id: `${layer.id}:${frame.id}`, layerId: layer.id, frameId: frame.id, zIndex: (layerIndex + frameIndex) % 13 - 6
  })))
  markLayerContentChanged(first)
  return { document, residentRasterBytes: pixels.byteLength }
}

const signature = (items: readonly CompositeStackItem[] | null): unknown => items?.map(item => item.kind === 'layer'
  ? ['layer', item.layer.id, item.layer.width, item.layer.height, item.layer.offsetX, item.layer.offsetY]
  : ['group', item.group.id, signature(item.children)]) ?? null

afterEach(() => vi.restoreAllMocks())

describe('styled opacity-group plan reuse', () => {
  it('reduces real plan and styled-proxy preparation on 4096² / 100 layers / 20 groups / 8 frames', () => {
    const { document, residentRasterBytes } = fixture(4096)
    const previous = new PreviousCache(), optimized = new DocumentCompositeCache()
    const batches = 2048, requestsPerFrame = 32
    const run = (cache: DocumentCompositeCache) => {
      const started = performance.now()
      let roots = 0
      for (let index = 0; index < batches; index += 1) {
        document.animation!.activeFrameId = document.animation!.frames[Math.floor(index / requestsPerFrame) % 8].id
        roots += cache.renderStackFor(document, 1)!.length
      }
      return { ms: performance.now() - started, roots }
    }
    run(previous); run(optimized)
    const baseline: ReturnType<typeof run>[] = [], improved: ReturnType<typeof run>[] = []
    for (let sample = 0; sample < 3; sample += 1) {
      if (sample % 2 === 0) { baseline.push(run(previous)); improved.push(run(optimized)) }
      else { improved.push(run(optimized)); baseline.push(run(previous)) }
    }
    const median = (samples: ReturnType<typeof run>[]) => samples.map(sample => sample.ms).sort((a, b) => a - b)[1]
    const baselineMs = median(baseline), optimizedMs = median(improved)
    expect(improved.every(sample => sample.roots === baseline[0].roots)).toBe(true)
    expect(optimizedMs).toBeLessThan(baselineMs)
    for (const frame of document.animation!.frames) {
      document.animation!.activeFrameId = frame.id
      expect(signature(optimized.renderStackFor(document, 1))).toEqual(signature(previous.renderStackFor(document, 1)))
    }
    // Count separately, so spies cannot affect measured samples.
    const countBuilds = (cache: DocumentCompositeCache) => {
      const spy = vi.spyOn(planning, 'opacityGroupCompositeStack')
      cache.invalidateAll()
      run(cache)
      const calls = spy.mock.calls.length
      spy.mockRestore()
      return calls
    }
    const baselineBuilds = countBuilds(previous), optimizedBuilds = countBuilds(optimized)
    expect(baselineBuilds).toBe(batches + batches / requestsPerFrame)
    expect(optimizedBuilds).toBe(2 * batches / requestsPerFrame)
    const evidence = {
      scenario: { canvas: '4096x4096', layers: 100, nestedGroups: 20, maximumGroupDepth: 5, frames: 8, cels: 800,
        styledLayers: 8, content: 'shared nonuniform-alpha RGBA raster, stroke/shadow, group multiply/opacity, per-frame z-index' },
      scope: 'complete renderStackFor planning with real styled proxy refresh; excludes pixel rasterization and end-to-end frame timing',
      baseline: 'immediately preceding implementation including accepted hierarchy, mask and z-index optimizations',
      residentRasterBytes, batchesPerSample: batches, requestsPerFrame, frameTransitionsPerSample: batches / requestsPerFrame,
      warmupBatchesPerVariant: batches, samples: { baseline, optimized: improved },
      baselineMedianMs: baselineMs, optimizedMedianMs: optimizedMs, elapsedReductionRatio: 1 - optimizedMs / baselineMs,
      separatelyCountedPlanBuilds: { baseline: baselineBuilds, optimized: optimizedBuilds },
      retainedPlans: 'one validated source tree per live document, replaced on revision/frame changes; no pixel copies',
      allFrameStackSignaturesEqual: true
    }
    mkdirSync(resolve('output'), { recursive: true })
    writeFileSync(resolve('output/document-composite-styled-plan-after-20261006.json'), `${JSON.stringify(evidence, null, 2)}\n`)
  }, 30000)

  it('revalidates revision, frame, live painting and full invalidation, while isolating returned trees', () => {
    const { document } = fixture(8, 8, 3)
    const cache = new DocumentCompositeCache()
    const spy = vi.spyOn(planning, 'opacityGroupCompositeStack')
    const first = cache.renderStackFor(document, 1)!
    expect(spy).toHaveBeenCalledTimes(2)
    const group = first.find(item => item.kind === 'group')!
    if (group.kind !== 'group') throw new Error('Group required')
    group.children.length = 0; first.length = 0
    expect(signature(cache.renderStackFor(document, 1))).toEqual(signature(new PreviousCache().renderStackFor(document, 1)))
    spy.mockClear()
    cache.renderStackFor(document, 1); expect(spy).not.toHaveBeenCalled()
    document.groups[0].clippingMask = true
    expect(cache.renderStackFor(document, 2)).toBeNull()
    expect(spy).toHaveBeenCalledTimes(2)
    spy.mockClear()
    expect(cache.renderStackFor(document, 2)).toBeNull(); expect(spy).not.toHaveBeenCalled()
    document.groups[0].clippingMask = false
    cache.invalidateLiveSourceCaches()
    expect(cache.renderStackFor(document, 2)).not.toBeNull(); expect(spy).toHaveBeenCalledTimes(2)
    spy.mockClear()
    document.animation!.activeFrameId = document.animation!.frames[1].id
    cache.renderStackFor(document, 2); expect(spy).toHaveBeenCalledTimes(2)
    spy.mockClear(); cache.invalidateAll()
    cache.renderStackFor(document, 2); expect(spy).toHaveBeenCalledTimes(2)
  })

  it('keeps actual pixels identical across eight frames, edits, drag/cancellation and committed structural changes', () => {
    const { document } = fixture(24, 8, 3)
    const cache = new DocumentCompositeCache()
    let revision = 1
    const check = (dirty?: SelectionRect) => {
      const actual = compositeRegion(document, 0, 0, 24, 24, cache, revision, undefined, dirty)
      const previous = compositeRegion(document, 0, 0, 24, 24, new PreviousCache(), revision)
      const fresh = compositeRegion(document, 0, 0, 24, 24)
      expect(Buffer.from(actual).equals(Buffer.from(previous))).toBe(true)
      expect(Buffer.from(actual).equals(Buffer.from(fresh))).toBe(true)
    }
    for (const frame of document.animation!.frames) { document.animation!.activeFrameId = frame.id; check(); check() }
    const layer = document.layers[0]
    for (const alpha of [255, 0, 128]) {
      writeLayerColor(document, layer, 12 * 24 + 12, { r: 20, g: 180, b: 220, a: alpha })
      cache.invalidateStyleSources(document, { x: 12, y: 12, width: 1, height: 1 }, [layer.id])
      // No tree invalidation: dirty style refresh must still happen on a hit.
      check({ x: 12, y: 12, width: 1, height: 1 })
    }
    for (const x of [2, -3, 0]) {
      layer.offsetX = x; cache.invalidateLayerPlacementCaches(); check()
    }
    document.layers[1].visible = false; revision += 1; check()
    document.groups[0].opacity = 0.3; revision += 1; check()
    document.layers[2] = { ...document.layers[2], offsetY: 2 }; revision += 1; check()
    document.layers[3].groupId = document.groups[2].id; revision += 1; check()
    document.layers[4].clippingMask = true; revision += 1; check()
    document.layers[4].clippingMask = false; revision += 1; check()
  })

  it('rebuilds a content-dependent plan after the first live stamp on an empty blended layer', () => {
    const { document } = fixture(12, 4, 2)
    const layer = document.layers[1]
    layer.pixels = new Uint8ClampedArray(12 * 12 * 4)
    layer.blendMode = 'multiply'; markLayerContentChanged(layer)
    const cache = new DocumentCompositeCache()
    const before = compositeRegion(document, 0, 0, 12, 12, cache, 1)
    writeLayerColor(document, layer, 5 * 12 + 5, { r: 10, g: 20, b: 30, a: 255 })
    cache.invalidateLiveSourceCaches()
    const after = compositeRegion(document, 0, 0, 12, 12, cache, 1)
    expect(Buffer.from(after).equals(Buffer.from(before))).toBe(false)
    expect(after).toEqual(compositeRegion(document, 0, 0, 12, 12))
  })

  it('keeps unsupported mask fallback and pending styled edits correct on cached rejection', () => {
    const { document } = fixture(12, 4, 2)
    const layer = document.layers[0]
    const mask = createLayerMask(layer.id, 12, 12)
    new Uint32Array(mask.pixels.buffer).fill(0xff808080); markLayerContentChanged(mask)
    document.animation!.layerMasks = [{ layerId: layer.id, frameId: document.animation!.activeFrameId, mask }]
    const cache = new DocumentCompositeCache()
    expect(cache.renderStackFor(document, 1)).toBeNull()
    writeLayerColor(document, layer, 4 * 12 + 4, { r: 255, g: 0, b: 0, a: 255 })
    cache.invalidateStyleSources(document, { x: 4, y: 4, width: 1, height: 1 }, [layer.id])
    expect(cache.renderStackFor(document, 1)).toBeNull()
    expect(compositeRegion(document, 0, 0, 12, 12, cache, 1)).toEqual(compositeRegion(document, 0, 0, 12, 12))
  })
})
