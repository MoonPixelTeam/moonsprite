import { Buffer } from 'node:buffer'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { SpriteDocument } from '@shared/types-document'
import type { LayerMask } from '@shared/types-layer'
import { animationMaskAt, createDocument, createLayer, createLayerMask, markLayerContentChanged, resolveAnimationMask } from './document-model'
import { createCompositeMaskLookup } from './document-composite-mask-lookup'
import * as plan from './document-composite-plan'
import { compositeRegion } from './document-composite-region'
import { createDefaultLayerStyles } from './layer-styles'

const baselineCelMasks = (document: SpriteDocument): Map<string, LayerMask> => {
  const timeline = document.animation!
  return new Map(timeline.cels.filter(cel => cel.frameId === timeline.activeFrameId)
    .map(cel => [cel.layerId, animationMaskAt(timeline, cel.layerId, cel.frameId)] as const)
    .filter((entry): entry is readonly [string, LayerMask] => Boolean(entry[1] && entry[1].visible !== false)))
}
const baselineGroupMasks = (document: SpriteDocument): Map<string, LayerMask> => {
  const timeline = document.animation!
  return new Map((timeline.groupMasks ?? []).filter(entry => entry.frameId === timeline.activeFrameId)
    .map(entry => [entry.groupId, resolveAnimationMask(timeline, entry.mask)] as const)
    .filter((entry): entry is readonly [string, LayerMask] => Boolean(entry[1] && entry[1].visible !== false)))
}

const fixture = (size: number, layers: number, groups: number) => {
  const document = createDocument('mask lookup', size, size, 'rgba', false)
  const firstLayer = document.layers[0]
  if (firstLayer.format !== 'rgba') throw new Error('RGBA fixture required')
  const pixels = firstLayer.pixels
  new Uint32Array(pixels.buffer).fill(0xff604020)
  const maskPixels = new Uint8ClampedArray(size * size * 4)
  new Uint32Array(maskPixels.buffer).fill(0xffffffff)
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 128) {
    const index = (y * size + (x + y) % size) * 4
    maskPixels[index] = maskPixels[index + 1] = maskPixels[index + 2] = 128
  }
  for (let index = 1; index < layers; index += 1) {
    const layer = createLayer(`Layer ${index}`, 1, 1, 'rgba')
    layer.width = size; layer.height = size; layer.pixels = pixels
    document.layers.push(layer)
  }
  for (let index = 0; index < groups; index += 1) document.groups.push({ id: `g-${index}`, name: `Group ${index}`, visible: true, locked: false, opacity: 0.8, blendMode: 'normal', parentGroupId: null })
  for (let index = 0; index < layers; index += 1) if (groups) document.layers[index].groupId = document.groups[index % groups].id
  const timeline = document.animation!
  timeline.frames = Array.from({ length: 8 }, (_, index) => ({ id: `f-${index}`, duration: 100 }))
  timeline.activeFrameId = timeline.frames[0].id
  timeline.cels = document.layers.flatMap(layer => timeline.frames.map(frame => ({ id: `${layer.id}:${frame.id}`, layerId: layer.id, frameId: frame.id, surface: { format: 'rgba' as const, width: size, height: size, offsetX: 0, offsetY: 0, pixels } })))
  let idReads = 0
  const maskIds: Array<{ mask: LayerMask; id: string }> = []
  const makeMask = (ownerId: string, frame: number, group: boolean) => {
    const mask = createLayerMask(ownerId, 1, 1, group ? 'group' : 'cel')
    const id = `${group ? 'group' : 'layer'}:${ownerId}:${frame}`
    mask.width = size; mask.height = size; mask.pixels = maskPixels
    if (frame > 0) mask.linkedMaskId = `${group ? 'group' : 'layer'}:${ownerId}:${frame - 1}`
    mask.id = id
    maskIds.push({ mask, id })
    return mask
  }
  timeline.layerMasks = document.layers.flatMap(layer => timeline.frames.map((frame, index) => ({ layerId: layer.id, frameId: frame.id, mask: makeMask(layer.id, index, false) })))
  timeline.groupMasks = document.groups.flatMap(group => timeline.frames.map((frame, index) => ({ groupId: group.id, frameId: frame.id, mask: makeMask(group.id, index, true) })))
  markLayerContentChanged(document.layers[0]); markLayerContentChanged(timeline.layerMasks[0].mask)
  return { document, residentRasterBytes: pixels.byteLength + maskPixels.byteLength, reads: () => idReads,
    instrument: () => { for (const { mask, id } of maskIds) Object.defineProperty(mask, 'id', { configurable: true, enumerable: true, get: () => { idReads += 1; return id } }) }
  }
}

describe('batch composite mask indexes', () => {
  it('reduces planning work across 4096², 100 layers, 20 groups and 8 frames', () => {
    const { document, residentRasterBytes, reads, instrument } = fixture(4096, 100, 20)
    const timeline = document.animation!
    const batches = 128
    const run = (optimized: boolean) => {
      const before = reads(), started = performance.now()
      let hits = 0
      for (let index = 0; index < batches; index += 1) {
        timeline.activeFrameId = timeline.frames[index % 8].id
        hits += (optimized ? plan.activeCelMasksByLayer(document, undefined, true) : baselineCelMasks(document)).size
        hits += (optimized ? plan.activeGroupMasksByGroup(document, undefined, true) : baselineGroupMasks(document)).size
      }
      return { ms: performance.now() - started, idReads: reads() - before, hits }
    }
    // Warm both variants, then alternate their order to reduce JIT/order bias.
    run(false); run(true)
    const baseline: ReturnType<typeof run>[] = [], optimized: ReturnType<typeof run>[] = []
    for (let sample = 0; sample < 3; sample += 1) {
      if (sample % 2 === 0) { baseline.push(run(false)); optimized.push(run(true)) }
      else { optimized.push(run(true)); baseline.push(run(false)) }
    }
    instrument()
    const baselineReads = run(false).idReads, optimizedReads = run(true).idReads
    for (const frame of timeline.frames) {
      timeline.activeFrameId = frame.id
      const layers = plan.activeCelMasksByLayer(document, undefined, true), groups = plan.activeGroupMasksByGroup(document, undefined, true)
      expect(layers.size).toBe(baselineCelMasks(document).size); expect(groups.size).toBe(baselineGroupMasks(document).size)
      for (const [key, mask] of baselineCelMasks(document)) expect(layers.get(key)).toBe(mask)
      for (const [key, mask] of baselineGroupMasks(document)) expect(groups.get(key)).toBe(mask)
    }
    const median = (samples: ReturnType<typeof run>[]) => samples.map(sample => sample.ms).sort((a, b) => a - b)[1]
    const baselineMs = median(baseline), optimizedMs = median(optimized)
    expect(optimized.every(sample => sample.hits === baseline[0].hits)).toBe(true)
    expect(optimizedReads).toBeLessThan(baselineReads)
    expect(optimizedMs).toBeLessThan(baselineMs)
    const evidence = {
      scenario: { canvas: '4096x4096', layers: 100, groups: 20, frames: 8, cels: 800, masks: 960, content: 'shared RGBA raster, nonuniform masks, seven-link mask chains' },
      scope: 'active mask planning, excluding pixel composition', residentRasterBytes, batchesPerSample: batches,
      warmupBatchesPerVariant: batches, timingWithoutInstrumentation: true,
      samples: { baseline: baseline.map(({ ms, hits }) => ({ ms, hits })), optimized: optimized.map(({ ms, hits }) => ({ ms, hits })) },
      idReadsMeasuredSeparately: { baseline: baselineReads, optimized: optimizedReads },
      baselineMedianMs: baselineMs, optimizedMedianMs: optimizedMs,
      elapsedReductionRatio: 1 - optimizedMs / baselineMs,
      idReadReductionRatio: 1 - optimizedReads / baselineReads,
      allFrameMaskReferencesEqual: true
    }
    mkdirSync(resolve('output'), { recursive: true })
    writeFileSync(resolve('output/document-composite-mask-lookup-after-20261006.json'), `${JSON.stringify(evidence, null, 2)}\n`)
  }, 30000)

  it('preserves links, duplicates, group fallback, broken links and cycles', () => {
    const { document } = fixture(4, 2, 1)
    const timeline = document.animation!
    const first = timeline.layerMasks![0], linked = timeline.layerMasks![7]
    const check = () => {
      const lookup = createCompositeMaskLookup(timeline)
      for (const entry of timeline.layerMasks ?? []) {
        expect(lookup.at(entry.layerId, entry.frameId)).toBe(animationMaskAt(timeline, entry.layerId, entry.frameId))
        expect(lookup.resolve(entry.mask)).toBe(resolveAnimationMask(timeline, entry.mask))
      }
      for (const entry of timeline.groupMasks ?? []) {
        expect(lookup.at(entry.groupId, entry.frameId)).toBe(animationMaskAt(timeline, entry.groupId, entry.frameId))
        expect(lookup.resolve(entry.mask)).toBe(resolveAnimationMask(timeline, entry.mask))
      }
    }
    check()
    linked.mask.linkedMaskId = 'missing'; check()
    linked.mask.linkedMaskId = first.mask.id; first.mask.linkedMaskId = linked.mask.id; check()
    first.mask.linkedMaskId = null
    linked.mask.linkedMaskId = timeline.groupMasks![0].mask.id; check()
    timeline.layerMasks!.unshift({ ...first, mask: createLayerMask(first.layerId, 1, 1) }); check()
    timeline.groupMasks!.push({ groupId: first.layerId, frameId: first.frameId, mask: createLayerMask(first.layerId, 1, 1, 'group') }); check()
    timeline.layerMasks = []; check()
    timeline.layerMasks = [first]; check()
    expect(createCompositeMaskLookup(timeline).resolve(null)).toBeNull()
  })

  it('preserves visible, neutral and preview masks across edits', () => {
    const { document } = fixture(4, 2, 1)
    const timeline = document.animation!, mask = timeline.layerMasks![0].mask
    expect(plan.activeCelMasksByLayer(document).get(document.layers[0].id)).toBe(mask)
    mask.visible = false
    expect(plan.activeCelMasksByLayer(document).has(document.layers[0].id)).toBe(false)
    mask.visible = true
    new Uint32Array(mask.pixels.buffer).fill(0xffffffff); markLayerContentChanged(mask)
    expect(plan.activeCelMasksByLayer(document).size).toBe(0)
    expect(plan.activeCelMasksByLayer(document, mask.id).get(document.layers[0].id)).toBe(mask)
    expect(plan.activeCelMasksByLayer(document, undefined, true).size).toBe(2)
    mask.pixels[0] = mask.pixels[1] = mask.pixels[2] = 0; markLayerContentChanged(mask)
    expect(plan.activeCelMasksByLayer(document).size).toBe(2)
    timeline.layerMasks = []; timeline.groupMasks = []
    expect(plan.activeCelMasksByLayer(document).size).toBe(0)
    expect(plan.activeGroupMasksByGroup(document).size).toBe(0)
  })

  it('matches real styled and masked composite pixels in all eight frames', () => {
    const { document } = fixture(24, 8, 2)
    const styles = createDefaultLayerStyles()
    styles.stroke = { ...styles.stroke, enabled: true, size: 1, position: 'both' }
    document.layers[3].layerStyles = styles
    document.layers[2].clippingMask = true
    document.layers[0].opacity = 0.7
    for (const frame of document.animation!.frames) {
      document.animation!.activeFrameId = frame.id
      const optimized = compositeRegion(document, 0, 0, 24, 24)
      const layerSpy = vi.spyOn(plan, 'activeCelMasksByLayer').mockImplementation(baselineCelMasks)
      const groupSpy = vi.spyOn(plan, 'activeGroupMasksByGroup').mockImplementation(baselineGroupMasks)
      try {
        const baseline = compositeRegion(document, 0, 0, 24, 24)
        expect(layerSpy).toHaveBeenCalled(); expect(groupSpy).toHaveBeenCalled()
        expect(Buffer.from(optimized).equals(Buffer.from(baseline))).toBe(true)
      } finally { layerSpy.mockRestore(); groupSpy.mockRestore() }
    }
  })
})
