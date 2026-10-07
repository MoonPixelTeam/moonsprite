import { Buffer } from 'node:buffer'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDocument, createLayer, markLayerContentChanged, writeLayerColor } from './document-model'
import { DocumentCompositeCache } from './document-composite-cache'
import { compositeRegion } from './document-composite-region'
import * as plan from './document-composite-plan'
import { compositeHierarchyNodes } from './document-composite-hierarchy'
import * as layout from './layer-panel-layout'
import { createDefaultLayerStyles } from './layer-styles'

const fixture = (size: number, count = 100) => {
  const document = createDocument('styled hierarchy identity', size, size, 'rgba', false)
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
    id: `g-${index}`, name: `Group ${index}`, visible: true, locked: false, opacity: 1,
    blendMode: 'normal', parentGroupId: index ? `g-${index - 1}` : null
  })
  document.layers.forEach((layer, index) => {
    layer.groupId = `g-${index % 20}`
    if (index % 13 === 0) {
      layer.layerStyles = createDefaultLayerStyles()
      layer.layerStyles.stroke = { ...layer.layerStyles.stroke, enabled: true, size: 1, position: 'both' }
      layer.layerStyles.shadow.enabled = true
    }
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

const sampleTimes = <T extends { ms: number }>(baselineRun: () => T, optimizedRun: () => T) => {
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

describe('styled proxy hierarchy cache identity', () => {
  it('reduces full styled plan preparation and real region composition on 4K / 100 layers / 20 nested groups / 8 frames', () => {
    const { document, residentRasterBytes } = fixture(4096)
    const normal = plan.normalCompositeLayers
    const dispatch = vi.spyOn(plan, 'normalCompositeLayers')
    const caches = [new DocumentCompositeCache(), new DocumentCompositeCache()]
    const select = (optimized: boolean) => {
      // Ignoring the owner exactly restores the previous temporary-document
      // hierarchy cache misses. Both modes have identical spy overhead.
      dispatch.mockImplementation((doc, allow, owner) => optimized ? normal(doc, allow, owner) : normal(doc, allow))
      return caches[Number(optimized)]
    }
    let revision = 0
    const batches = 1024, regionBatches = 128
    const prepare = (optimized: boolean) => {
      const cache = select(optimized), started = performance.now()
      let layers = 0
      for (let index = 0; index < batches; index += 1) {
        document.animation!.activeFrameId = document.animation!.frames[index % 8].id
        layers += cache.renderLayersFor(document, ++revision)!.length
      }
      return { ms: performance.now() - started, layers }
    }
    const preparation = sampleTimes(() => prepare(false), () => prepare(true))
    expect(preparation.optimizedMedianMs).toBeLessThan(preparation.baselineMedianMs)
    expect(preparation.samples.optimized.every(sample => sample.layers === 100 * batches)).toBe(true)
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
    const actualRegionComposition = sampleTimes(() => draw(false), () => draw(true))
    expect(actualRegionComposition.optimizedMedianMs).toBeLessThan(actualRegionComposition.baselineMedianMs)
    expect(actualRegionComposition.samples.optimized.every(sample => sample.checksum === actualRegionComposition.samples.baseline[0].checksum)).toBe(true)
    const countBuilds = (optimized: boolean) => {
      const spy = vi.spyOn(layout, 'buildLayerPanelTree')
      prepare(optimized)
      const calls = spy.mock.calls.length
      spy.mockRestore()
      return calls
    }
    const treeBuilds = { baseline: countBuilds(false), optimized: countBuilds(true) }
    expect(treeBuilds).toEqual({ baseline: batches, optimized: 0 })
    mkdirSync(resolve('output'), { recursive: true })
    writeFileSync(resolve('output/document-composite-styled-hierarchy-after-20261006.json'), `${JSON.stringify({
      scenario: { canvas: '4096x4096', layers: 100, nestedGroups: 20, maximumDepth: 20, frames: 8, cels: 800,
        styledLayers: 8, content: 'shared nonuniform-alpha RGBA, stroke/shadow and frame-specific z-index' }, residentRasterBytes,
      baseline: 'immediately preceding renderLayersFor; original-source hierarchy cache retained but proxy-document cache misses restored',
      method: 'warmup and three alternating samples; identical dispatch overhead; real proxies and real pixels; counts measured separately',
      preparation: { batchesPerSample: batches, ...preparation },
      actualRegionComposition: { region: '4x4', batchesPerSample: regionBatches, ...actualRegionComposition },
      separatelyCountedHierarchyBuilds: treeBuilds,
      scope: 'complete renderLayersFor preparation and actual 4x4 region composition; new revision/frame each call; no full-frame claim',
      retention: 'existing weak cache and structural ID snapshots reused; no new persistent cache or pixel copies'
    }, null, 2)}\n`)
  }, 30000)

  it('validates derived structure independently of its cache owner and keeps current proxy objects', () => {
    const { document } = fixture(4, 8)
    const nodes = compositeHierarchyNodes(document)
    const proxy = { ...document, layers: document.layers.map(layer => ({ ...layer, layerStyles: undefined })) }
    expect(compositeHierarchyNodes(proxy, document)).toBe(nodes)
    const check = () => {
      expect(compositeHierarchyNodes(proxy, document)).toEqual(layout.buildLayerPanelTree({ layers: proxy.layers, groups: proxy.groups }))
      expect(plan.normalCompositeLayers(proxy, false, document)).toEqual(plan.normalCompositeLayers(proxy))
      for (const layer of plan.normalCompositeLayers(proxy, false, document) ?? []) {
        expect(layer).toBe(proxy.layers.filter(candidate => candidate.id === layer.id).at(-1))
      }
      expect(compositeHierarchyNodes(document)).toEqual(layout.buildLayerPanelTree({ layers: document.layers, groups: document.groups }))
    }
    proxy.layers.reverse(); check()
    proxy.layers[0].groupId = null; check()
    proxy.layers[0].id = 'proxy-renamed'; check()
    proxy.layers[0] = { ...proxy.layers[0], offsetX: -2 }; check()
    proxy.groups = proxy.groups.map(group => ({ ...group }))
    proxy.groups[1].parentGroupId = 'missing'; check()
    proxy.groups[0].panelOrder = NaN; check()
    proxy.groups[2].parentGroupId = proxy.groups[3].id
    proxy.groups[3].parentGroupId = proxy.groups[2].id; check()
    proxy.layers.push({ ...proxy.layers[0] }); check()
    proxy.groups = []; proxy.layers.forEach(layer => { layer.groupId = null }); check()
    const first = plan.normalCompositeLayers(proxy, false, document)!
    first.length = 0
    expect(plan.normalCompositeLayers(proxy, false, document)!.length).toBe(proxy.layers.length)
  })

  it('preserves all-frame style pixels through live edits, drag/cancellation, source replacement and structural changes', () => {
    const { document } = fixture(16, 8)
    const normal = plan.normalCompositeLayers
    const dispatch = vi.spyOn(plan, 'normalCompositeLayers')
    const previous = new DocumentCompositeCache(), optimized = new DocumentCompositeCache()
    let revision = 1
    const check = (dirty = false) => {
      const sourceDirty = dirty ? { x: 0, y: 0, width: 16, height: 16 } : undefined
      dispatch.mockImplementation((doc, allow) => normal(doc, allow))
      const expected = compositeRegion(document, 0, 0, 16, 16, previous, revision, undefined, sourceDirty)
      dispatch.mockImplementation(normal)
      const actual = compositeRegion(document, 0, 0, 16, 16, optimized, revision, undefined, sourceDirty)
      expect(Buffer.from(actual).equals(Buffer.from(expected))).toBe(true)
    }
    for (const frame of document.animation!.frames) { document.animation!.activeFrameId = frame.id; check(); check() }
    for (const alpha of [255, 0, 128]) {
      writeLayerColor(document, document.layers[0], 8 * 16 + 8, { r: 10, g: 240, b: 50, a: alpha })
      for (const cache of [previous, optimized]) {
        cache.invalidateLiveSourceCaches()
        cache.invalidateStyleSources(document, { x: 8, y: 8, width: 1, height: 1 }, [document.layers[0].id])
      }
      check(true)
    }
    for (const x of [2, -3, 0]) {
      document.layers[0].offsetX = x
      previous.invalidateLayerPlacementCaches(); optimized.invalidateLayerPlacementCaches(); check()
    }
    document.layers.reverse(); revision += 1; check()
    document.layers[0] = { ...document.layers[0], opacity: 0.2 }; revision += 1; check()
    document.layers[1].groupId = document.groups[3].id; revision += 1; check()
    document.groups[1].parentGroupId = null; revision += 1; check()
    document.layers[2].visible = false; revision += 1; check()
    document.layers[3].clippingMask = true; revision += 1; check()
    document.groups[0].opacity = 0.5; revision += 1; check()
  })
})
