import { Buffer } from 'node:buffer'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RgbaColor } from '@shared/types-color'
import { createDocument, createLayer, createLayerMask, markLayerContentChanged, writeLayerColor } from './document-model'
import { DocumentCompositeCache } from './document-composite-cache'
import { compileCompositePointSampler } from './document-composite-sampling'
import * as deferred from './document-composite-deferred-value'
import { createDefaultLayerStyles } from './layer-styles'
import { normalizeGradientMap } from './gradient-map'

// Eager evaluation reproduces the previous leaf/group bounds preparation.
// Both variants use identical compiler and sampling code, with the same spy
// dispatch overhead. No source/bounds/pixel preparation is stubbed out.
const eagerValue: typeof deferred.deferredCompositeValue = <T>(read: () => T) => {
  const value = read()
  return () => value
}

const fixture = (size: number, count = 100) => {
  const document = createDocument('hidden subtree bounds', size, size, 'rgba', false)
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
  for (let index = 0; index < 20; index += 1) document.groups.push({
    id: `g-${index}`, name: `Group ${index}`, visible: index % 5 !== 0 || index === 0, locked: false,
    opacity: 0.8, blendMode: index % 3 ? 'normal' : 'multiply', parentGroupId: index % 5 ? `g-${index - 1}` : null
  })
  document.layers.forEach((layer, index) => {
    layer.groupId = `g-${index % 20}`
    layer.clippingMask = index % 7 === 1
    if (index % 20 >= 5 && index % 13 === 0) {
      layer.layerStyles = createDefaultLayerStyles()
      layer.layerStyles.stroke.enabled = true
      layer.layerStyles.shadow.enabled = true
    }
  })
  const timeline = document.animation!
  timeline.frames = Array.from({ length: 8 }, (_, index) => ({ id: `frame-${index}`, duration: 100 }))
  timeline.activeFrameId = timeline.frames[0].id
  timeline.cels = document.layers.flatMap((layer, layerIndex) => timeline.frames.map((frame, frameIndex) => ({
    id: `${layer.id}:${frame.id}`, layerId: layer.id, frameId: frame.id, zIndex: (layerIndex + frameIndex) % 13 - 6
  })))
  const mask = createLayerMask(first.id, 1, 1)
  mask.pixels.set([80, 80, 80, 255]); markLayerContentChanged(mask)
  timeline.layerMasks = timeline.frames.map(frame => ({ layerId: first.id, frameId: frame.id, mask }))
  markLayerContentChanged(first)
  return { document, residentRasterBytes: pixels.byteLength }
}

const rasterize = (sample: ReturnType<typeof compileCompositePointSampler>, size = 8, replacement?: RgbaColor) => {
  const pixels = new Uint8ClampedArray(size * size * 4)
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
    const color = sample(x - 1, y - 1, replacement)
    pixels.set([color.r, color.g, color.b, color.a], (y * size + x) * 4)
  }
  return pixels
}

afterEach(() => vi.restoreAllMocks())

describe('deferred composite content bounds', () => {
  it('reduces compilation plus actual 4x4 sampling on 4K / 100 layers / 20 groups / 8 frames with 75 hidden layers', () => {
    const { document, residentRasterBytes } = fixture(4096)
    const optimizedValue = deferred.deferredCompositeValue
    const dispatch = vi.spyOn(deferred, 'deferredCompositeValue')
    const previousCache = new DocumentCompositeCache(), optimizedCache = new DocumentCompositeCache()
    const batches = 512
    const run = (optimized: boolean) => {
      dispatch.mockImplementation(optimized ? optimizedValue : eagerValue)
      const started = performance.now()
      let checksum = 0
      for (let index = 0; index < batches; index += 1) {
        document.animation!.activeFrameId = document.animation!.frames[index % 8].id
        const sample = compileCompositePointSampler(document, undefined, optimized ? optimizedCache : previousCache, 1)
        for (let y = 100; y < 104; y += 1) for (let x = 100; x < 104; x += 1) {
          const color = sample(x, y, undefined)
          checksum += color.r + color.g + color.b + color.a
        }
      }
      return { ms: performance.now() - started, checksum }
    }
    run(false); run(true)
    const baseline: ReturnType<typeof run>[] = [], optimized: ReturnType<typeof run>[] = []
    for (let index = 0; index < 3; index += 1) {
      if (index % 2 === 0) { baseline.push(run(false)); optimized.push(run(true)) }
      else { optimized.push(run(true)); baseline.push(run(false)) }
    }
    const median = (values: ReturnType<typeof run>[]) => values.map(value => value.ms).sort((a, b) => a - b)[1]
    const baselineMedianMs = median(baseline), optimizedMedianMs = median(optimized)
    expect(optimizedMedianMs).toBeLessThan(baselineMedianMs)
    expect(optimized.every(value => value.checksum === baseline[0].checksum)).toBe(true)
    const countBounds = (optimized: boolean) => {
      dispatch.mockImplementation(optimized ? optimizedValue : eagerValue)
      const cache = new DocumentCompositeCache()
      const spy = vi.spyOn(cache, 'compositeSourceBounds')
      const sample = compileCompositePointSampler(document, undefined, cache, 1)
      const duringCompile = spy.mock.calls.length
      sample(100, 100, undefined); sample(101, 101, undefined)
      const afterTwoPoints = spy.mock.calls.length
      spy.mockRestore()
      return { duringCompile, afterTwoPoints }
    }
    const boundsQueries = { baseline: countBounds(false), optimized: countBounds(true) }
    expect(boundsQueries.baseline).toEqual({ duringCompile: 100, afterTwoPoints: 100 })
    expect(boundsQueries.optimized).toEqual({ duringCompile: 25, afterTwoPoints: 25 })
    // With all owners visible, no deferred values should be allocated.
    document.groups.forEach(group => { group.visible = true })
    document.layers.forEach(layer => { layer.layerStyles = undefined })
    dispatch.mockClear()
    compileCompositePointSampler(document, undefined, optimizedCache, 2)
    expect(dispatch).not.toHaveBeenCalled()
    const visibleBaseline: ReturnType<typeof run>[] = [], visibleOptimized: ReturnType<typeof run>[] = []
    run(false); run(true)
    for (let index = 0; index < 3; index += 1) {
      if (index % 2 === 0) { visibleBaseline.push(run(false)); visibleOptimized.push(run(true)) }
      else { visibleOptimized.push(run(true)); visibleBaseline.push(run(false)) }
    }
    const allVisible = { condition: 'same current visible-path code in both modes; noise control, not a previous-code regression comparison',
      baselineMedianMs: median(visibleBaseline), optimizedMedianMs: median(visibleOptimized),
      samples: { baseline: visibleBaseline, optimized: visibleOptimized }, deferredValuesAllocated: 0 }
    expect(visibleOptimized.every(sample => sample.checksum === visibleBaseline[0].checksum)).toBe(true)
    const evidence = {
      scenario: { canvas: '4096x4096', layers: 100, hiddenThroughAncestor: 75, nestedGroups: 20, maximumDepth: 5,
        frames: 8, cels: 800, content: 'shared nonuniform-alpha RGBA, nested blend/opacity, clipping, layer mask, hidden stroke/shadow' },
      baseline: 'previous eager leaf and group bounds evaluation, including all accepted composite optimizations', residentRasterBytes,
      scope: 'compileCompositePointSampler plus real 4x4 pixel sampling on every batch; no full-frame latency claim',
      batchesPerSample: batches, warmupBatchesPerVariant: batches, samples: { baseline, optimized },
      baselineMedianMs, optimizedMedianMs, elapsedReductionRatio: 1 - optimizedMedianMs / baselineMedianMs,
      separatelyCountedSourceBoundsQueriesPerSampler: boundsQueries,
      allVisibleControl: allVisible,
      retention: 'sampler-local values only; unchanged full node order and adjustment flags; no persistent document cache or pixel copies'
    }
    mkdirSync(resolve('output'), { recursive: true })
    writeFileSync(resolve('output/document-composite-deferred-bounds-after-20261006.json'), `${JSON.stringify(evidence, null, 2)}\n`)
  }, 30000)

  it('matches eager pixels through all frames, hidden/zero-opacity clip bases, adjustment flags, styles and edits', () => {
    const { document } = fixture(16, 20)
    const optimizedValue = deferred.deferredCompositeValue
    const dispatch = vi.spyOn(deferred, 'deferredCompositeValue')
    const check = () => {
      dispatch.mockImplementation(eagerValue)
      const baseline = rasterize(compileCompositePointSampler(document, undefined, new DocumentCompositeCache(), 1))
      dispatch.mockImplementation(optimizedValue)
      const optimized = rasterize(compileCompositePointSampler(document, undefined, new DocumentCompositeCache(), 1))
      expect(Buffer.from(optimized).equals(Buffer.from(baseline))).toBe(true)
    }
    for (const frame of document.animation!.frames) { document.animation!.activeFrameId = frame.id; check() }
    document.layers[0].visible = false; check(); document.layers[0].visible = true
    document.layers[0].opacity = 0; check(); document.layers[0].opacity = 1
    document.groups[0].opacity = 0; check(); document.groups[0].opacity = 0.7
    document.groups[0].layerStyles = createDefaultLayerStyles()
    document.groups[0].layerStyles.shadow.enabled = true; check()
    document.groups[0].layerStyles = undefined
    const adjustment = document.layers[6]
    adjustment.kind = 'adjustment'
    adjustment.adjustment = { kind: 'gradient-map', enabled: true, gradientMap: normalizeGradientMap({ reverse: true }) }
    document.groups[0].cumulativeBlend = true; check()
    document.groups[5].visible = true; check()
    adjustment.visible = false; check()
    document.layers[0].offsetX = -2; check()
    document.layers[0].offsetX = 0
    writeLayerColor(document, document.layers[0], 3 * 16 + 3, { r: 240, g: 10, b: 80, a: 255 }); check()
  })

  it('preserves replacement, geometry-only and static/property memo sampling', () => {
    const { document } = fixture(12, 20)
    const optimizedValue = deferred.deferredCompositeValue
    const dispatch = vi.spyOn(deferred, 'deferredCompositeValue')
    for (const geometryOnly of [false, true]) for (const target of [document.layers[0].id, document.layers[6].id, document.animation!.layerMasks![0].mask.id]) {
      const compile = (previous: boolean) => {
        dispatch.mockImplementation(previous ? eagerValue : optimizedValue)
        return compileCompositePointSampler(document, target, undefined, 1, undefined, geometryOnly, read => read,
          { targets: new Set([target]), read: (_owner, _slot, read) => read })
      }
      const baseline = compile(true), optimized = compile(false)
      for (const alpha of [0, 128, 255]) {
        const replacement = { r: 200, g: 30, b: 80, a: alpha }
        expect(rasterize(optimized, 8, replacement)).toEqual(rasterize(baseline, 8, replacement))
      }
      expect(rasterize(optimized)).toEqual(rasterize(baseline))
    }
  })

  it('retains hidden clipping bases and still reads visibility changes on the compiled sampler', () => {
    const document = createDocument('hidden clip base', 4, 4, 'rgba', false)
    const background = document.layers[0]
    const base = createLayer('base', 4, 4, 'rgba'), clipped = createLayer('clipped', 4, 4, 'rgba')
    base.visible = false; clipped.clippingMask = true
    document.layers.push(base, clipped)
    writeLayerColor(document, background, 0, { r: 0, g: 0, b: 255, a: 255 })
    writeLayerColor(document, base, 0, { r: 20, g: 20, b: 20, a: 255 })
    writeLayerColor(document, clipped, 0, { r: 255, g: 0, b: 0, a: 255 })
    const sample = compileCompositePointSampler(document)
    expect(sample(0, 0, undefined)).toEqual({ r: 0, g: 0, b: 255, a: 255 })
    base.visible = true
    expect(sample(0, 0, undefined)).toEqual({ r: 255, g: 0, b: 0, a: 255 })
    base.opacity = 0
    expect(sample(0, 0, undefined)).toEqual({ r: 0, g: 0, b: 255, a: 255 })
  })
})
