import { Buffer } from 'node:buffer'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SpriteDocument } from '@shared/types-document'
import { DocumentCompositeCache } from './document-composite-cache'
import { compositeRegion } from './document-composite-region'
import * as model from './document-model'
import * as support from './document-composite-styled-support'
import { createDefaultLayerStyles, hasEnabledLayerStyles } from './layer-styles'

// Exact support predicates from the immediately preceding renderLayersFor.
const previousSupport = (document: SpriteDocument): boolean => {
  const group = document.groups.some(group => model.isGroupEffectivelyVisible(document, group) && (group.blendMode !== 'normal'
    || group.opacity !== 1 || group.cumulativeBlend === true || group.clippingMask === true || hasEnabledLayerStyles(group.layerStyles)))
  const layer = document.layers.some(layer => model.isLayerEffectivelyVisible(document, layer) && layer.opacity > 0
    && (layer.kind === 'adjustment' || layer.clippingMask === true || layer.blendMode !== 'normal'))
  return group || layer
}

const fixture = (size: number, count = 100, groupCount = 20) => {
  const document = model.createDocument('styled support', size, size, 'rgba', false)
  const first = document.layers[0]
  if (first.format !== 'rgba') throw new Error('RGBA fixture required')
  const pixels = first.pixels
  new Uint32Array(pixels.buffer).fill(0x80603010)
  for (let y = 0; y < size; y += 1) for (let x = y % 7; x < size; x += 32) pixels[(y * size + x) * 4 + 3] = 0
  for (let index = 1; index < count; index += 1) {
    const layer = model.createLayer(`Layer ${index}`, 1, 1, 'rgba')
    layer.width = size; layer.height = size; layer.pixels = pixels
    layer.opacity = (index % 3 + 1) / 3
    document.layers.push(layer)
  }
  for (let index = 0; index < groupCount; index += 1) document.groups.push({
    id: `g-${index}`, name: `Group ${index}`, visible: true, locked: false, opacity: 1,
    blendMode: 'normal', parentGroupId: index ? `g-${index - 1}` : null
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
  model.markLayerContentChanged(first)
  return { document, residentRasterBytes: pixels.byteLength }
}

afterEach(() => vi.restoreAllMocks())

describe('styled support feature-first checks', () => {
  it('reduces support validation and full renderLayersFor preparation on a populated 4K / 100-layer / 8-frame document', () => {
    const { document, residentRasterBytes } = fixture(4096)
    const batches = 2048, dispatchBatches = 256
    const optimizedSupport = support.hasUnsupportedStyledCompositeFeatures
    const runSupport = (check: typeof previousSupport) => {
      const started = performance.now()
      let rejected = 0
      for (let index = 0; index < batches; index += 1) {
        document.animation!.activeFrameId = document.animation!.frames[index % 8].id
        rejected += Number(check(document))
      }
      return { ms: performance.now() - started, rejected }
    }
    // Identical spy dispatch in both variants; only the support predicate
    // changes. The complete path and real styled proxies run without stubs.
    const dispatch = vi.spyOn(support, 'hasUnsupportedStyledCompositeFeatures')
    const previousCache = new DocumentCompositeCache(), optimizedCache = new DocumentCompositeCache()
    let revision = 0
    const runDispatch = (optimized: boolean) => {
      dispatch.mockImplementation(optimized ? optimizedSupport : previousSupport)
      const cache = optimized ? optimizedCache : previousCache
      const started = performance.now()
      let layers = 0
      for (let index = 0; index < dispatchBatches; index += 1) {
        document.animation!.activeFrameId = document.animation!.frames[index % 8].id
        layers += cache.renderLayersFor(document, ++revision)!.length
      }
      return { ms: performance.now() - started, layers }
    }
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
    const validation = samples(() => runSupport(previousSupport), () => runSupport(optimizedSupport))
    const fullPreparation = samples(() => runDispatch(false), () => runDispatch(true))
    dispatch.mockRestore()
    expect(validation.optimizedMedianMs).toBeLessThan(validation.baselineMedianMs)
    expect(fullPreparation.optimizedMedianMs).toBeLessThan(fullPreparation.baselineMedianMs)
    expect(fullPreparation.samples.optimized.every(sample => sample.layers === 100 * dispatchBatches)).toBe(true)
    // Instrument separately from timed samples.
    const groupVisibility = vi.spyOn(model, 'isGroupEffectivelyVisible')
    const layerVisibility = vi.spyOn(model, 'isLayerEffectivelyVisible')
    previousSupport(document)
    const previousCalls = groupVisibility.mock.calls.length + layerVisibility.mock.calls.length
    groupVisibility.mockClear(); layerVisibility.mockClear()
    optimizedSupport(document)
    const optimizedCalls = groupVisibility.mock.calls.length + layerVisibility.mock.calls.length
    expect(previousCalls).toBe(120); expect(optimizedCalls).toBe(0)
    const evidence = {
      scenario: { canvas: '4096x4096', layers: 100, nestedGroups: 20, maximumGroupDepth: 20, frames: 8, cels: 800, styledLayers: 8,
        content: 'shared nonuniform-alpha RGBA raster, stroke/shadow, normal groups and per-frame z-index' },
      baseline: 'immediately preceding renderer, including accepted hierarchy and styled-group plan caches', residentRasterBytes,
      supportValidation: { batchesPerSample: batches, ...validation },
      fullRenderLayersForPreparation: { batchesPerSample: dispatchBatches, newRevisionEachCall: true, ...fullPreparation },
      scope: 'support validation and full real renderLayersFor preparation; excludes pixel rasterization and end-to-end frame timing',
      separatelyCountedVisibilityCallsPerValidation: { baseline: previousCalls, optimized: optimizedCalls },
      method: 'warm up both variants; three alternating samples; unchanged full dispatch with identical spy overhead in both variants',
      addedPersistentCachesOrPixelCopies: 0
    }
    mkdirSync(resolve('output'), { recursive: true })
    writeFileSync(resolve('output/document-composite-styled-support-after-20261006.json'), `${JSON.stringify(evidence, null, 2)}\n`)
  }, 30000)

  it('preserves feature, visibility, opacity and malformed ancestor decisions', () => {
    const { document } = fixture(4, 8, 4)
    const check = () => expect(support.hasUnsupportedStyledCompositeFeatures(document)).toBe(previousSupport(document))
    check()
    for (const visibility of [true, false]) {
      document.groups[0].visible = visibility
      for (const opacity of [1, 0.5, 0, -1, NaN]) {
        document.groups[3].opacity = opacity; check()
      }
      document.groups[3].opacity = 1
      for (const blendMode of ['normal', 'multiply'] as const) { document.groups[3].blendMode = blendMode; check() }
      document.groups[3].blendMode = 'normal'
      for (const key of ['clippingMask', 'cumulativeBlend'] as const) {
        document.groups[3][key] = true; check(); document.groups[3][key] = false
      }
      document.groups[3].layerStyles = createDefaultLayerStyles()
      document.groups[3].layerStyles!.stroke.enabled = true; check()
      document.groups[3].layerStyles = undefined
      const layer = document.layers[3]
      for (const opacity of [1, 0, -1, NaN]) for (const visible of [true, false]) {
        layer.opacity = opacity; layer.visible = visible
        layer.blendMode = 'multiply'; check(); layer.blendMode = 'normal'
        layer.clippingMask = true; check(); layer.clippingMask = false
        layer.kind = 'adjustment'; check(); layer.kind = undefined
      }
      layer.opacity = 1; layer.visible = true
    }
    document.layers[3].blendMode = 'multiply'
    document.groups[3].parentGroupId = 'missing'; check()
    document.groups[3].parentGroupId = document.groups[3].id; check()
    document.groups[2].parentGroupId = document.groups[3].id
    document.groups[3].parentGroupId = document.groups[2].id; check()
    document.layers[3].groupId = 'missing'; check()
    document.groups = []; check()
    document.layers = []; check()
  })

  it('preserves real pixels and path choices across all eight frames and unsupported feature changes', () => {
    const { document } = fixture(24, 8, 4)
    const optimizedSupport = support.hasUnsupportedStyledCompositeFeatures
    const dispatch = vi.spyOn(support, 'hasUnsupportedStyledCompositeFeatures')
    const draw = (previous: boolean) => {
      dispatch.mockImplementation(previous ? previousSupport : optimizedSupport)
      const cache = new DocumentCompositeCache()
      const pixels = compositeRegion(document, 0, 0, 24, 24, cache, 1)
      return { pixels, usesStyledLayers: Boolean(cache.renderLayersFor(document, 1)) }
    }
    const check = () => {
      const baseline = draw(true), optimized = draw(false)
      expect(optimized.usesStyledLayers).toBe(baseline.usesStyledLayers)
      expect(Buffer.from(optimized.pixels).equals(Buffer.from(baseline.pixels))).toBe(true)
    }
    for (const frame of document.animation!.frames) { document.animation!.activeFrameId = frame.id; check() }
    const layer = document.layers[3], group = document.groups[3]
    layer.clippingMask = true; check(); layer.clippingMask = false
    layer.blendMode = 'multiply'; check(); layer.blendMode = 'normal'
    group.opacity = 0.7; check(); group.opacity = 1
    group.cumulativeBlend = true; check(); group.cumulativeBlend = false
    group.layerStyles = createDefaultLayerStyles(); group.layerStyles.shadow.enabled = true; check()
    document.groups[0].visible = false; check()
    document.groups[0].visible = true; group.layerStyles = undefined
    model.writeLayerColor(document, document.layers[0], 12 * 24 + 12, { r: 10, g: 240, b: 60, a: 255 }); check()
    document.layers[0].offsetX = -2; check()
    document.layers[0].offsetX = 0; check()
  })
})
