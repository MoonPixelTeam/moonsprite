import { Buffer } from 'node:buffer'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SpriteDocument } from '@shared/types-document'
import { DocumentCompositeCache } from './document-composite-cache'
import { DocumentCompositeSimplePlanCache } from './document-composite-simple-plan-cache'
import { compositeRegion } from './document-composite-region'
import * as clipping from './document-composite-clipping'
import * as masking from './document-composite-mask'
import { createDocument, createLayer, createLayerMask, markLayerContentChanged, writeLayerColor } from './document-model'
import { createDefaultLayerStyles } from './layer-styles'

// Previous dispatch: both selectors were called directly on every region.
class PreviousSimplePlans extends DocumentCompositeSimplePlanCache {
  override clippingFor(document: SpriteDocument) { return clipping.simpleClippingLayers(document) }
  override masksFor(document: SpriteDocument) { return masking.simpleLayerMaskLayers(document) }
}
class PreviousCache extends DocumentCompositeCache {
  override readonly simpleLayerPlans = new PreviousSimplePlans()
}

type Scenario = 'flat-clipping' | 'flat-masks' | 'grouped-masks-clipping'
const fixture = (size: number, scenario: Scenario, count = 100) => {
  const document = createDocument(scenario, size, size, 'rgba', false)
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
  if (scenario !== 'flat-masks') document.layers.forEach((layer, index) => { layer.clippingMask = index % 7 === 1 })
  if (scenario === 'grouped-masks-clipping') {
    const groupCount = Math.min(count, 20)
    for (let index = 0; index < groupCount; index += 1) document.groups.push({
      id: `g-${index}`, name: `Group ${index}`, visible: true, locked: false, opacity: 0.8,
      blendMode: index % 3 ? 'normal' : 'multiply', parentGroupId: index % 5 ? `g-${index - 1}` : null
    })
    document.layers.forEach((layer, index) => { layer.groupId = `g-${index % groupCount}` })
  }
  const timeline = document.animation!
  timeline.frames = Array.from({ length: 8 }, (_, index) => ({ id: `frame-${index}`, duration: 100 }))
  timeline.activeFrameId = timeline.frames[0].id
  timeline.cels = document.layers.flatMap((layer, layerIndex) => timeline.frames.map((frame, frameIndex) => ({
    id: `${layer.id}:${frame.id}`, layerId: layer.id, frameId: frame.id, zIndex: (layerIndex + frameIndex) % 13 - 6
  })))
  let maskBytes = 0
  if (scenario !== 'flat-clipping') {
    const baseMask = createLayerMask(first.id, size, size)
    new Uint32Array(baseMask.pixels.buffer).fill(0xff808080)
    for (let y = 0; y < size; y += 1) for (let x = y % 7; x < size; x += 32) baseMask.pixels[(y * size + x) * 4] = 32
    maskBytes = baseMask.pixels.byteLength
    timeline.layerMasks = document.layers.filter((_, index) => index % 2 === 0).flatMap(layer => timeline.frames.map(frame => ({
      layerId: layer.id, frameId: frame.id, mask: { ...baseMask, id: `${layer.id}:${frame.id}:mask`, ownerId: layer.id }
    })))
    markLayerContentChanged(baseMask)
  }
  markLayerContentChanged(first)
  return { document, residentRasterBytes: pixels.byteLength, residentMaskBytes: maskBytes }
}

const planSignature = (plans: DocumentCompositeSimplePlanCache, document: SpriteDocument, revision: number) => ({
  clipping: plans.clippingFor(document, revision)?.map(layer => layer.id) ?? null,
  masks: (() => {
    const stack = plans.masksFor(document, revision)
    return stack ? { layers: stack.layers.map(layer => layer.id), masks: [...stack.masks].map(([id, mask]) => [id, mask.id]) } : null
  })()
})
const samples = <T extends { ms: number }>(baselineRun: () => T, optimizedRun: () => T) => {
  baselineRun(); optimizedRun()
  const baseline: T[] = [], optimized: T[] = []
  for (let sample = 0; sample < 3; sample += 1) {
    if (sample % 2 === 0) { baseline.push(baselineRun()); optimized.push(optimizedRun()) }
    else { optimized.push(optimizedRun()); baseline.push(baselineRun()) }
  }
  const median = (values: T[]) => values.map(value => value.ms).sort((a, b) => a - b)[1]
  const baselineMedianMs = median(baseline), optimizedMedianMs = median(optimized)
  return { samples: { baseline, optimized }, baselineMedianMs, optimizedMedianMs, elapsedReductionRatio: 1 - optimizedMedianMs / baselineMedianMs }
}

afterEach(() => vi.restoreAllMocks())

describe('simple composite route plan reuse', () => {
  it('reduces accepted/rejected planning and actual small-region composite time on 4K / 100 layers / 8 frames', () => {
    const scenarios: unknown[] = []
    for (const scenario of ['flat-clipping', 'flat-masks', 'grouped-masks-clipping'] as const) {
      const { document, residentRasterBytes, residentMaskBytes } = fixture(4096, scenario)
      const previous = new PreviousSimplePlans(), optimized = new DocumentCompositeSimplePlanCache()
      const batches = 1024, requestsPerFrame = 32
      const run = (plans: DocumentCompositeSimplePlanCache) => {
        const started = performance.now()
        let accepted = 0
        for (let index = 0; index < batches; index += 1) {
          document.animation!.activeFrameId = document.animation!.frames[Math.floor(index / requestsPerFrame) % 8].id
          accepted += Number(Boolean(plans.clippingFor(document, 1))) + Number(Boolean(plans.masksFor(document, 1)))
        }
        return { ms: performance.now() - started, accepted }
      }
      const result = samples(() => run(previous), () => run(optimized))
      expect(result.optimizedMedianMs).toBeLessThan(result.baselineMedianMs)
      expect(result.samples.optimized.every(sample => sample.accepted === result.samples.baseline[0].accepted)).toBe(true)
      for (const frame of document.animation!.frames) {
        document.animation!.activeFrameId = frame.id
        expect(planSignature(optimized, document, 1)).toEqual(planSignature(previous, document, 1))
      }
      const countCalls = (plans: DocumentCompositeSimplePlanCache) => {
        plans.clear()
        const clip = vi.spyOn(clipping, 'simpleClippingLayers'), mask = vi.spyOn(masking, 'simpleLayerMaskLayers')
        run(plans)
        const calls = { clipping: clip.mock.calls.length, masks: mask.mock.calls.length }
        clip.mockRestore(); mask.mockRestore()
        return calls
      }
      const selectorCalls = { baseline: countCalls(previous), optimized: countCalls(optimized) }
      expect(selectorCalls.optimized).toEqual({ clipping: batches / requestsPerFrame, masks: batches / requestsPerFrame })
      let actualRegionComposition: unknown = null
      if (scenario === 'grouped-masks-clipping') {
        const oldCache = new PreviousCache(), newCache = new DocumentCompositeCache()
        const regionBatches = 128, regionRequestsPerFrame = 16
        const draw = (cache: DocumentCompositeCache) => {
          const started = performance.now()
          let checksum = 0
          for (let index = 0; index < regionBatches; index += 1) {
            document.animation!.activeFrameId = document.animation!.frames[Math.floor(index / regionRequestsPerFrame) % 8].id
            const pixels = compositeRegion(document, 100 + index % 3, 100, 4, 4, cache, 1)
            checksum += pixels[0] + pixels[3]
          }
          return { ms: performance.now() - started, checksum }
        }
        const actual = samples(() => draw(oldCache), () => draw(newCache))
        expect(actual.samples.optimized.every(sample => sample.checksum === actual.samples.baseline[0].checksum)).toBe(true)
        expect(actual.optimizedMedianMs).toBeLessThan(actual.baselineMedianMs)
        actualRegionComposition = { region: '4x4', batchesPerSample: regionBatches, requestsPerFrame: regionRequestsPerFrame, ...actual }
        for (const frame of document.animation!.frames) {
          document.animation!.activeFrameId = frame.id
          expect(compositeRegion(document, 100, 100, 4, 4, newCache, 1)).toEqual(compositeRegion(document, 100, 100, 4, 4, oldCache, 1))
        }
      }
      scenarios.push({ scenario, canvas: '4096x4096', layers: 100, groups: document.groups.length, frames: 8, cels: 800,
        maskSlots: document.animation!.layerMasks?.length ?? 0, residentRasterBytes, residentMaskBytes,
        batchesPerSample: batches, requestsPerFrame, ...result, separatelyCountedSelectorCalls: selectorCalls,
        allFramePlansEqual: true, actualRegionComposition })
    }
    mkdirSync(resolve('output'), { recursive: true })
    writeFileSync(resolve('output/document-composite-simple-plan-after-20261006.json'), `${JSON.stringify({
      baseline: 'immediately preceding renderer including all previously accepted composite optimizations',
      method: 'warmup, three alternating samples; operation counts measured separately', scenarios,
      scope: 'route selection plus actual 4x4 region composition on grouped scenario; no full-canvas or frame-latency claim',
      retention: 'one current revision/frame entry per weakly held document; live/full/dirty-source invalidation; no pixel copies'
    }, null, 2)}\n`)
  }, 30000)

  it('reuses and replaces plans on revision/frame changes and explicit invalidation', () => {
    const { document } = fixture(8, 'flat-clipping', 8)
    const cache = new DocumentCompositeCache()
    const spy = vi.spyOn(clipping, 'simpleClippingLayers')
    const first = cache.simpleLayerPlans.clippingFor(document, 1)
    expect(cache.simpleLayerPlans.clippingFor(document, 1)).toBe(first)
    expect(spy).toHaveBeenCalledTimes(1)
    document.animation!.activeFrameId = document.animation!.frames[1].id
    cache.simpleLayerPlans.clippingFor(document, 1); expect(spy).toHaveBeenCalledTimes(2)
    document.layers[1].blendMode = 'multiply'
    expect(cache.simpleLayerPlans.clippingFor(document, 2)).toBeNull()
    expect(cache.simpleLayerPlans.clippingFor(document, 2)).toBeNull(); expect(spy).toHaveBeenCalledTimes(3)
    document.layers[1].blendMode = 'normal'
    cache.invalidateLiveSourceCaches()
    expect(cache.simpleLayerPlans.clippingFor(document, 2)).not.toBeNull(); expect(spy).toHaveBeenCalledTimes(4)
    cache.invalidateAll(); cache.simpleLayerPlans.clippingFor(document, 2); expect(spy).toHaveBeenCalledTimes(5)
    document.animation = undefined
    cache.simpleLayerPlans.clippingFor(document, 2); expect(spy).toHaveBeenCalledTimes(6)
  })

  it.each<Scenario>(['flat-clipping', 'flat-masks', 'grouped-masks-clipping'])('preserves all-frame pixels, live edits, moves and committed structural changes: %s', scenario => {
    const { document } = fixture(16, scenario, 8)
    const cache = new DocumentCompositeCache(), previous = new PreviousCache()
    let revision = 1
    const check = (dirty = false) => {
      const sourceDirty = dirty ? { x: 0, y: 0, width: 16, height: 16 } : undefined
      const actual = compositeRegion(document, 0, 0, 16, 16, cache, revision, undefined, sourceDirty)
      const expected = compositeRegion(document, 0, 0, 16, 16, previous, revision, undefined, sourceDirty)
      expect(Buffer.from(actual).equals(Buffer.from(expected))).toBe(true)
    }
    for (const frame of document.animation!.frames) { document.animation!.activeFrameId = frame.id; check(); check() }
    const mask = document.animation!.layerMasks?.find(entry => entry.frameId === document.animation!.activeFrameId)?.mask
    if (mask) {
      for (const value of [255, 0, 128]) {
        new Uint32Array(mask.pixels.buffer).fill((0xff000000 | value | value << 8 | value << 16) >>> 0)
        markLayerContentChanged(mask)
        check(true) // Neutral-to-effective and effective-to-neutral, same revision.
      }
      mask.offsetX = -2; cache.invalidateLayerPlacementCaches(); previous.invalidateLayerPlacementCaches(); check()
      mask.offsetX = 0; check()
      mask.visible = false; revision += 1; check()
      mask.visible = true; revision += 1; check()
      mask.linkedMaskId = 'missing'; revision += 1; check()
    }
    writeLayerColor(document, document.layers[0], 8 * 16 + 8, { r: 0, g: 220, b: 100, a: 255 })
    cache.invalidateLiveSourceCaches(); previous.invalidateLiveSourceCaches(); check(true)
    for (const x of [2, -2, 0]) {
      document.layers[0].offsetX = x
      cache.invalidateLayerPlacementCaches(); previous.invalidateLayerPlacementCaches(); check()
    }
    document.layers.reverse(); revision += 1; check()
    document.layers[1] = { ...document.layers[1], opacity: 0.2 }; revision += 1; check()
    document.layers[2].visible = false; revision += 1; check()
    document.layers[2].visible = true; revision += 1; check()
    document.layers[3].clippingMask = !document.layers[3].clippingMask; revision += 1; check()
    document.layers[4].layerStyles = createDefaultLayerStyles()
    document.layers[4].layerStyles!.stroke.enabled = true; revision += 1; check()
    document.layers[4].layerStyles = undefined; revision += 1; check()
    document.groups = []; document.layers.forEach(layer => { layer.groupId = null }); revision += 1; check()
  })
})
