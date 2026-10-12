import { Buffer } from 'node:buffer'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RasterLayer } from '@shared/types-layer'
import { createDocument, createLayer, markLayerContentChanged, writeLayerColor } from './document-model'
import { DocumentCompositeCache } from './document-composite-cache'
import { compositeRegion } from './document-composite-region'
import { buildCompositeStack, type CompositeStackItem } from './document-composite-plan'
import * as filtering from './document-composite-styled-source-filter'
import { createDefaultLayerStyles } from './layer-styles'

const fixture = (size: number, count = 100) => {
  const document = createDocument('hidden styled sources', size, size, 'rgba', false)
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
    id: `g-${index}`, name: `Group ${index}`, visible: index % 5 !== 0 || index === 0,
    locked: false, opacity: 1, blendMode: 'normal', parentGroupId: index % 5 ? `g-${index - 1}` : null
  })
  document.layers.forEach((layer, index) => {
    layer.groupId = `g-${index % 20}`
    layer.layerStyles = createDefaultLayerStyles()
    layer.layerStyles.stroke = { ...layer.layerStyles.stroke, enabled: true, size: 1, position: 'both' }
    layer.layerStyles.shadow.enabled = true
  })
  const timeline = document.animation!
  timeline.frames = Array.from({ length: 8 }, (_, index) => ({ id: `frame-${index}`, duration: 100 }))
  timeline.activeFrameId = timeline.frames[0].id
  timeline.cels = document.layers.flatMap((layer, layerIndex) => timeline.frames.map((frame, frameIndex) => ({
    id: `${layer.id}:${frame.id}`, layerId: layer.id, frameId: frame.id, zIndex: (layerIndex + frameIndex) % 13 - 6
  })))
  markLayerContentChanged(first)
  return { document, residentRasterBytes: pixels.byteLength }
}

const samples = <T extends { ms: number }>(baselineRun: () => T, optimizedRun: () => T) => {
  baselineRun(); optimizedRun()
  const baseline: T[] = [], optimized: T[] = []
  for (let index = 0; index < 3; index += 1) {
    if (index % 2 === 0) { baseline.push(baselineRun()); optimized.push(optimizedRun()) }
    else { optimized.push(optimizedRun()); baseline.push(baselineRun()) }
  }
  const median = (values: T[]) => values.map(value => value.ms).sort((a, b) => a - b)[1]
  const baselineMedianMs = median(baseline), optimizedMedianMs = median(optimized)
  return { samples: { baseline, optimized }, baselineMedianMs, optimizedMedianMs, elapsedReductionRatio: 1 - optimizedMedianMs / baselineMedianMs }
}

afterEach(() => vi.restoreAllMocks())

describe('visible styled-source preparation', () => {
  it('reduces real plan preparation and actual 4x4 composition on 4K / 100 styled layers / 20 groups / 8 frames', () => {
    const { document, residentRasterBytes } = fixture(4096)
    const currentFilter = filtering.styledCompositeSourceFilter
    const dispatch = vi.spyOn(filtering, 'styledCompositeSourceFilter')
    const caches = [new DocumentCompositeCache(), new DocumentCompositeCache()]
    const select = (optimized: boolean) => {
      // The prior map prepared every styled layer. Identical factory spy
      // overhead in both modes; real style proxies and pixels are preserved.
      dispatch.mockImplementation(optimized ? currentFilter : () => () => true)
      return caches[Number(optimized)]
    }
    let revision = 0
    const batches = 512, regionBatches = 128
    const prepare = (optimized: boolean) => {
      const cache = select(optimized), started = performance.now()
      let layers = 0
      for (let index = 0; index < batches; index += 1) {
        document.animation!.activeFrameId = document.animation!.frames[index % 8].id
        layers += cache.renderLayersFor(document, ++revision)!.length
      }
      return { ms: performance.now() - started, layers }
    }
    const preparation = samples(() => prepare(false), () => prepare(true))
    expect(preparation.optimizedMedianMs).toBeLessThan(preparation.baselineMedianMs)
    expect(preparation.samples.optimized.every(sample => sample.layers === 25 * batches)).toBe(true)
    const draw = (optimized: boolean) => {
      const cache = select(optimized), started = performance.now()
      let checksum = 0
      for (let index = 0; index < regionBatches; index += 1) {
        document.animation!.activeFrameId = document.animation!.frames[index % 8].id
        const pixels = compositeRegion(document, 100, 100, 4, 4, cache, ++revision)
        checksum += pixels[0] + pixels[3]
      }
      return { ms: performance.now() - started, checksum }
    }
    const composition = samples(() => draw(false), () => draw(true))
    expect(composition.optimizedMedianMs).toBeLessThan(composition.baselineMedianMs)
    expect(composition.samples.optimized.every(sample => sample.checksum === composition.samples.baseline[0].checksum)).toBe(true)
    const countProxies = (optimized: boolean) => {
      const cache = select(optimized)
      const privateCache = cache as unknown as { styledLayer(sourceDocument: typeof document, layer: RasterLayer): RasterLayer }
      const prepareSpy = vi.spyOn(privateCache, 'styledLayer')
      cache.renderLayersFor(document, ++revision)
      const calls = prepareSpy.mock.calls.length
      prepareSpy.mockRestore()
      return calls
    }
    const proxyPreparations = { baseline: countProxies(false), optimized: countProxies(true) }
    expect(proxyPreparations).toEqual({ baseline: 100, optimized: 25 })
    mkdirSync(resolve('output'), { recursive: true })
    writeFileSync(resolve('output/document-composite-styled-source-after-20261006.json'), `${JSON.stringify({
      scenario: { canvas: '4096x4096', layers: 100, styledLayers: 100, hiddenThroughAncestor: 75, nestedGroups: 20,
        maximumDepth: 5, frames: 8, cels: 800, content: 'shared nonuniform-alpha RGBA, stroke/shadow, nested hidden branches and per-frame z-index' },
      residentRasterBytes, baseline: 'immediately preceding styled proxy map, with accepted hierarchy cache identity retained',
      method: 'warmup; three alternating samples; identical factory dispatch; real proxies and pixels; counts measured separately',
      preparation: { batchesPerSample: batches, ...preparation },
      actualRegionComposition: { region: '4x4', batchesPerSample: regionBatches, ...composition },
      separatelyCountedStyleProxyPreparationsPerPlan: proxyPreparations,
      scope: 'complete styled plan preparation and actual 4x4 composition; revision/frame change every call; no full-frame latency claim',
      retention: 'temporary source set only; no persistent visibility cache or pixel copies; hidden pending edits retained until reveal'
    }, null, 2)}\n`)
  }, 30000)

  it('matches actual tree visibility, including duplicate IDs, cycles, missing parents and zero opacity', () => {
    const { document } = fixture(4, 20)
    const check = () => {
      const expected = new Set<RasterLayer>()
      const visit = (items: CompositeStackItem[]) => {
        for (const item of items) {
          const owner = item.kind === 'layer' ? item.layer : item.group
          if (!owner.visible || owner.opacity <= 0) continue
          if (item.kind === 'layer') expected.add(item.layer)
          else visit(item.children)
        }
      }
      visit(buildCompositeStack(document))
      const filter = filtering.styledCompositeSourceFilter(document)
      for (const layer of document.layers) expect(filter(layer)).toBe(expected.has(layer))
    }
    check()
    document.layers[0].visible = false; check()
    document.layers[0].visible = true; document.layers[0].opacity = 0; check()
    document.layers[0].opacity = NaN; check(); document.layers[0].opacity = 1
    document.groups[1].opacity = 0; check(); document.groups[1].opacity = 1
    document.groups[1].parentGroupId = 'missing'; check()
    document.groups[2].parentGroupId = document.groups[3].id
    document.groups[3].parentGroupId = document.groups[2].id; check()
    document.layers.push({ ...document.layers[0] }); check()
    document.groups.push({ ...document.groups[5], visible: true }); check()
    document.layers.reverse(); document.groups.reverse(); check()
  })

  it('preserves all-frame pixels, hidden edits/reveal, zero-opacity transitions, moves and source replacement', () => {
    const { document } = fixture(16, 20)
    const hidden = document.layers[5]
    hidden.pixels = hidden.pixels.slice(); markLayerContentChanged(hidden)
    const currentFilter = filtering.styledCompositeSourceFilter
    const dispatch = vi.spyOn(filtering, 'styledCompositeSourceFilter')
    const previous = new DocumentCompositeCache(), optimized = new DocumentCompositeCache()
    let revision = 1
    const check = (dirty = false) => {
      const sourceDirty = dirty ? { x: 0, y: 0, width: 16, height: 16 } : undefined
      dispatch.mockImplementation(() => () => true)
      const expected = compositeRegion(document, 0, 0, 16, 16, previous, revision, undefined, sourceDirty)
      dispatch.mockImplementation(currentFilter)
      const actual = compositeRegion(document, 0, 0, 16, 16, optimized, revision, undefined, sourceDirty)
      expect(Buffer.from(actual).equals(Buffer.from(expected))).toBe(true)
    }
    for (const frame of document.animation!.frames) { document.animation!.activeFrameId = frame.id; check(); check() }
    const visiblePlan = optimized.renderLayersFor(document, revision)
    writeLayerColor(document, hidden, 8 * 16 + 8, { r: 255, g: 10, b: 30, a: 255 })
    for (const cache of [previous, optimized]) cache.invalidateStyleSources(document, { x: 8, y: 8, width: 1, height: 1 }, [hidden.id])
    dispatch.mockClear()
    expect(optimized.renderLayersFor(document, revision)).toBe(visiblePlan)
    expect(dispatch).not.toHaveBeenCalled()
    document.groups[5].visible = true; revision += 1; check()
    document.groups[5].visible = false; revision += 1; check()
    document.layers[0].opacity = 0; revision += 1; check()
    document.layers[0].opacity = 0.7; revision += 1; check()
    writeLayerColor(document, document.layers[0], 6 * 16 + 6, { r: 0, g: 230, b: 90, a: 255 })
    for (const cache of [previous, optimized]) cache.invalidateLiveSourceCaches()
    check(true)
    for (const x of [2, -3, 0]) {
      document.layers[0].offsetX = x
      previous.invalidateLayerPlacementCaches(); optimized.invalidateLayerPlacementCaches(); check()
    }
    document.layers[0] = { ...document.layers[0], opacity: 0.2 }; revision += 1; check()
    document.layers[5].groupId = document.groups[1].id; revision += 1; check()
    document.layers.reverse(); revision += 1; check()
  })
})
