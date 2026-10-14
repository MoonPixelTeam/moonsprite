import { Buffer } from 'node:buffer'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { SpriteDocument } from '@shared/types-document'
import type { AnimationCel } from '@shared/types-animation'
import { createDocument, createLayer, createLayerMask, markLayerContentChanged } from './document-model'
import * as zIndex from './document-composite-z-index'
import { buildCompositeStack } from './document-composite-plan'
import { compositeRegion } from './document-composite-region'
import { createDefaultLayerStyles } from './layer-styles'

// Reference algorithm from document-composite-plan before this optimization.
const baselineZIndexes = (document: SpriteDocument): Map<string, number> => {
  const timeline = document.animation
  if (!timeline) return new Map()
  const byId = new Map(timeline.cels.map(cel => [cel.id, cel]))
  const result = new Map<string, number>()
  for (const cel of timeline.cels) {
    if (cel.frameId !== timeline.activeFrameId) continue
    const visited = new Set<string>()
    let source = cel
    while (source.linkedCelId && !visited.has(source.id)) {
      visited.add(source.id)
      const linked = byId.get(source.linkedCelId)
      if (!linked || linked.layerId !== cel.layerId) break
      source = linked
    }
    const numeric = Number(source.zIndex)
    result.set(cel.layerId, Number.isFinite(numeric) ? Math.max(-999, Math.min(999, Math.trunc(numeric))) : 0)
  }
  return result
}

const fixture = (size: number, count: number) => {
  const document = createDocument('cel z index', size, size, 'rgba', false)
  const first = document.layers[0]
  if (first.format !== 'rgba') throw new Error('RGBA fixture required')
  const pixels = first.pixels
  new Uint32Array(pixels.buffer).fill(0x80602010)
  for (let y = 0; y < size; y += 1) for (let x = y % 11; x < size; x += 64) pixels[(y * size + x) * 4 + 3] = 0
  for (let index = 1; index < count; index += 1) {
    const layer = createLayer(`Layer ${index}`, 1, 1, 'rgba')
    layer.width = size; layer.height = size; layer.pixels = pixels
    layer.opacity = (index % 3 + 1) / 3
    document.layers.push(layer)
  }
  const timeline = document.animation!
  timeline.frames = Array.from({ length: 8 }, (_, index) => ({ id: `frame-${index}`, duration: 100 }))
  timeline.activeFrameId = timeline.frames[0].id
  timeline.cels = document.layers.flatMap((layer, layerIndex) => timeline.frames.map((frame, frameIndex) => ({
    id: `${layer.id}:${frame.id}`, layerId: layer.id, frameId: frame.id,
    zIndex: (layerIndex % 13) - 6,
    linkedCelId: frameIndex > 0 ? `${layer.id}:${timeline.frames[frameIndex - 1].id}` : null,
    surface: { format: 'rgba' as const, width: size, height: size, offsetX: 0, offsetY: 0, pixels }
  })))
  markLayerContentChanged(first)
  return { document, residentRasterBytes: pixels.byteLength }
}

describe('composite cel z index reuse', () => {
  it('reduces repeated order resolution across 4096², 100 layers and 8 frames', () => {
    const { document, residentRasterBytes } = fixture(4096, 100)
    const batches = 2048
    const run = (optimized: boolean) => {
      const started = performance.now()
      let hits = 0, sum = 0
      for (let index = 0; index < batches; index += 1) {
        document.animation!.activeFrameId = document.animation!.frames[index % 8].id
        const result = optimized ? zIndex.animationLayerZIndexes(document) : baselineZIndexes(document)
        hits += result.size
        for (const value of result.values()) sum += value
      }
      return { ms: performance.now() - started, hits, sum }
    }
    run(false); run(true)
    const baseline: ReturnType<typeof run>[] = [], optimized: ReturnType<typeof run>[] = []
    for (let sample = 0; sample < 3; sample += 1) {
      if (sample % 2 === 0) { baseline.push(run(false)); optimized.push(run(true)) }
      else { optimized.push(run(true)); baseline.push(run(false)) }
    }
    for (const frame of document.animation!.frames) {
      document.animation!.activeFrameId = frame.id
      expect(zIndex.animationLayerZIndexes(document)).toEqual(baselineZIndexes(document))
    }
    const median = (samples: ReturnType<typeof run>[]) => samples.map(sample => sample.ms).sort((a, b) => a - b)[1]
    const baselineMs = median(baseline), optimizedMs = median(optimized)
    expect(optimized.every(sample => sample.hits === baseline[0].hits && sample.sum === baseline[0].sum)).toBe(true)
    expect(optimizedMs).toBeLessThan(baselineMs)
    const evidence = {
      scenario: { canvas: '4096x4096', layers: 100, frames: 8, cels: 800, content: 'shared nonuniform-alpha RGBA raster and seven-link cel chains' },
      scope: 'z-index planning, excluding raster composition', residentRasterBytes, batchesPerSample: batches,
      warmupBatchesPerVariant: batches, samples: { baseline, optimized },
      baselineMedianMs: baselineMs, optimizedMedianMs: optimizedMs,
      elapsedReductionRatio: 1 - optimizedMs / baselineMs, allFrameMapsEqual: true
    }
    mkdirSync(resolve('output'), { recursive: true })
    writeFileSync(resolve('output/document-composite-z-index-after-20261006.json'), `${JSON.stringify(evidence, null, 2)}\n`)
  }, 30000)

  it('tracks in-place cel edits, array replacements and same-length reorderings', () => {
    const { document } = fixture(4, 2)
    const timeline = document.animation!
    const check = () => { for (const frame of timeline.frames) { timeline.activeFrameId = frame.id; expect(zIndex.animationLayerZIndexes(document)).toEqual(baselineZIndexes(document)) } }
    check()
    const first = timeline.cels[0], linked = timeline.cels[7]
    for (const value of [22.7, -5000, 5000, Infinity, NaN, 0, undefined]) { first.zIndex = value; check() }
    const before = first.zIndex
    first.zIndex = 19; check(); first.zIndex = before; check(); first.zIndex = 19; check()
    linked.linkedCelId = null; linked.zIndex = -20; check()
    linked.linkedCelId = first.id; check()
    first.id = 'renamed'; check()
    linked.linkedCelId = first.id; check()
    linked.layerId = timeline.cels[8].layerId; check()
    linked.frameId = timeline.frames[0].id; check()
    timeline.cels[0] = { ...first, zIndex: -15 }; check()
    timeline.cels.reverse(); check()
    timeline.cels = [...timeline.cels]; check()
    const extra: AnimationCel = { id: 'extra', layerId: document.layers[0].id, frameId: timeline.frames[0].id, zIndex: 35 }
    timeline.cels.push(extra); check(); timeline.cels.pop(); check()
    timeline.activeFrameId = 'missing'
    expect(zIndex.animationLayerZIndexes(document).size).toBe(0)
    timeline.activeFrameId = timeline.frames[0].id
    const returned = zIndex.animationLayerZIndexes(document)
    returned.clear()
    expect(zIndex.animationLayerZIndexes(document)).toEqual(baselineZIndexes(document))
    check()
  })

  it('keeps composite-specific broken-link and cycle fallback semantics', () => {
    const { document } = fixture(4, 2)
    const timeline = document.animation!, first = timeline.cels[0], second = timeline.cels[1], last = timeline.cels[7]
    first.zIndex = 31; second.zIndex = -12; last.zIndex = 55
    const check = () => { for (const frame of timeline.frames) { timeline.activeFrameId = frame.id; expect(zIndex.animationLayerZIndexes(document)).toEqual(baselineZIndexes(document)) } }
    first.linkedCelId = 'missing'; check()
    first.linkedCelId = timeline.cels[8].id; check()
    first.linkedCelId = second.id; check()
    first.linkedCelId = first.id; check()
    first.linkedCelId = null
    timeline.cels.push({ ...second, zIndex: 7, linkedCelId: null }); check()
  })

  it('preserves group, clipping and styled composition pixels in all eight frames', () => {
    const { document } = fixture(24, 8)
    document.groups.push({ id: 'group', name: 'Group', visible: true, locked: false, opacity: 0.8, blendMode: 'normal' })
    document.layers[1].groupId = 'group'; document.layers[2].groupId = 'group'
    document.layers[2].clippingMask = true
    const styles = createDefaultLayerStyles()
    styles.stroke = { ...styles.stroke, enabled: true, size: 1, position: 'both' }
    document.layers[3].layerStyles = styles
    const mask = createLayerMask(document.layers[0].id, 24, 24)
    new Uint32Array(mask.pixels.buffer).fill(0xff808080); markLayerContentChanged(mask)
    document.animation!.layerMasks = document.animation!.frames.map(frame => ({ layerId: document.layers[0].id, frameId: frame.id, mask }))
    for (const frame of document.animation!.frames) {
      document.animation!.activeFrameId = frame.id
      const optimizedStack = buildCompositeStack(document)
      const optimizedPixels = compositeRegion(document, 0, 0, 24, 24)
      const spy = vi.spyOn(zIndex, 'animationLayerZIndexes').mockImplementation(baselineZIndexes)
      try {
        expect(buildCompositeStack(document)).toEqual(optimizedStack)
        const baselinePixels = compositeRegion(document, 0, 0, 24, 24)
        expect(spy).toHaveBeenCalled()
        expect(Buffer.from(optimizedPixels).equals(Buffer.from(baselinePixels))).toBe(true)
      } finally { spy.mockRestore() }
    }
  })
})
