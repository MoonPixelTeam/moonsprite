import { Buffer } from 'node:buffer'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it, vi } from 'vitest'
import { createDocument, createLayer, writeLayerColor } from './document-model'
import { DocumentCompositeCache } from './document-composite-cache'
import { compositeRegion } from './document-composite-region'
import { createDefaultLayerStyles } from './layer-styles'

it('keeps styled moves exact without rebuilding pixels on 4K / 100 layers / 8 frames', () => {
  const document = createDocument('large styled placement', 4096, 4096, 'rgba', false)
  const background = document.layers[0]
  if (background.format !== 'rgba') throw new Error('RGBA fixture required')
  new Uint32Array(background.pixels.buffer).fill(0xff302010)
  for (let index = 0; index < 4096 * 4096; index += 97) background.pixels[index * 4] = index % 251
  document.groups = Array.from({ length: 20 }, (_, index) => ({
    id: `placement-group-${index}`, name: `Group ${index}`, visible: true, locked: false,
    opacity: 1, blendMode: 'normal' as const, parentGroupId: index % 5 ? `placement-group-${index - 1}` : null
  }))
  for (let index = 1; index < 100; index += 1) {
    const layer = createLayer(`Styled ${index}`, 32, 32, 'rgba')
    layer.groupId = document.groups[index % 20].id
    layer.offsetX = index <= 5 ? 2000 : 200 + (index % 8) * 400
    layer.offsetY = index <= 5 ? 2000 : 200 + (Math.floor(index / 8) % 8) * 400
    layer.opacity = 0.7
    layer.layerStyles = createDefaultLayerStyles()
    layer.layerStyles.stroke = { ...layer.layerStyles.stroke, enabled: true, size: 2 }
    layer.layerStyles.shadow = { ...layer.layerStyles.shadow, enabled: true, blur: 2, offsetX: 2, offsetY: 2 }
    layer.layerStyles.innerGlow = { ...layer.layerStyles.innerGlow, enabled: true, size: 2 }
    for (let y = 4; y < 28; y += 1) for (let x = 4; x < 28; x += 1) {
      if ((x + y + index) % 7) writeLayerColor(document, layer, y * 32 + x, {
        r: (index * 31 + x * 7) % 256, g: (y * 11) % 256, b: 200, a: 80 + (x * y) % 176
      })
    }
    document.layers.push(layer)
  }
  const timeline = document.animation!
  timeline.frames = Array.from({ length: 8 }, (_, index) => ({ id: `placement-frame-${index}`, duration: 100 }))
  timeline.activeFrameId = timeline.frames[0].id
  timeline.cels = document.layers.flatMap((layer, index) => timeline.frames.map((frame, frameIndex) => ({
    id: `${layer.id}:${frame.id}`, layerId: layer.id, frameId: frame.id,
    zIndex: layer === background ? -100 : (index + frameIndex) % 7 - 3
  })))
  const moving = document.layers[1], cache = new DocumentCompositeCache()
  const rect = { x: 1988, y: 1988, width: 64, height: 64 }
  let revision = 1, comparisons = 0
  const preview = (current: DocumentCompositeCache) => {
    const plan = current.movePreviewLayersFor(document, revision)
    expect(plan).not.toBeNull()
    return current.movePreviewLayerRegion(document, plan!, rect.x, rect.y, rect.width, rect.height, revision)
  }
  const check = () => {
    const actual = preview(cache)
    const expected = compositeRegion(document, rect.x, rect.y, rect.width, rect.height, new DocumentCompositeCache(), revision)
    expect(Buffer.from(actual).equals(Buffer.from(expected))).toBe(true)
    comparisons += 1
    return actual
  }
  for (const frame of timeline.frames) {
    timeline.activeFrameId = frame.id
    const original = check()
    for (const offset of [2002, 2005, 2000]) {
      moving.offsetX = offset
      cache.invalidateLayerPlacementCaches()
      const actual = check()
      expect(Buffer.from(actual).equals(Buffer.from(original))).toBe(offset === 2000)
    }
  }
  writeLayerColor(document, moving, 10 * 32 + 10, { r: 255, g: 0, b: 0, a: 255 })
  cache.invalidateStyleSources(document, { x: 2010, y: 2010, width: 1, height: 1 }, [moving.id])
  cache.invalidateLiveSourceCaches()
  revision += 1
  check()

  const batches = 32
  // Compare two correct paths: cold cache rebuild versus placement-only reuse.
  // No comparison with the incorrect stale-coordinate implementation.
  const run = (reuse: boolean) => {
    const started = performance.now()
    let checksum = 0
    for (let index = 0; index < batches; index += 1) {
      moving.offsetX = 2000 + index % 6
      const current = reuse ? cache : new DocumentCompositeCache()
      current.invalidateLayerPlacementCaches()
      const pixels = preview(current)
      checksum += pixels[1000] + pixels[1003]
    }
    return { ms: performance.now() - started, checksum }
  }
  run(false); run(true)
  const baseline: ReturnType<typeof run>[] = [], optimized: ReturnType<typeof run>[] = []
  for (let index = 0; index < 3; index += 1) {
    if (index % 2 === 0) { baseline.push(run(false)); optimized.push(run(true)) }
    else { optimized.push(run(true)); baseline.push(run(false)) }
  }
  expect(optimized.every(sample => sample.checksum === baseline[0].checksum)).toBe(true)
  const blocks = vi.spyOn(DocumentCompositeCache.prototype as unknown as {
    renderStyledLayerBlock: (...args: unknown[]) => Uint8ClampedArray
  }, 'renderStyledLayerBlock')
  let baselineBlocks: number, optimizedBlocks: number
  try {
    run(false); baselineBlocks = blocks.mock.calls.length
    blocks.mockClear()
    run(true); optimizedBlocks = blocks.mock.calls.length
  } finally { blocks.mockRestore() }
  expect(baselineBlocks).toBeGreaterThan(0)
  expect(optimizedBlocks).toBe(0)
  const median = (samples: ReturnType<typeof run>[]) => samples.map(sample => sample.ms).sort((a, b) => a - b)[1]
  const baselineMedianMs = median(baseline), optimizedMedianMs = median(optimized)
  expect(optimizedMedianMs).toBeLessThan(baselineMedianMs)
  mkdirSync(resolve('output'), { recursive: true })
  writeFileSync(resolve('output/document-composite-placement-after-20261006.json'), `${JSON.stringify({
    scenario: { canvas: '4096x4096', layers: 100, styledLayers: 99, nestedGroups: 20, frames: 8, cels: 800,
      content: 'dense nonuniform 4K background; distributed 32x32 sprites with holes, partial alpha, stroke, shadow and inner glow' },
    correctness: { exactRegionComparisons: comparisons, region: '64x64', cases: 'all frames, drag, cancellation, subsequent content edit' },
    measurement: 'warmup; three alternating samples; plan preparation plus actual 64x64 preview pixels; block counts measured separately',
    baseline: 'correct cold-cache regeneration on every placement; not the broken stale-coordinate path',
    batchesPerSample: batches, samples: { baseline, optimized }, baselineMedianMs, optimizedMedianMs,
    elapsedReductionRatio: 1 - optimizedMedianMs / baselineMedianMs,
    blockRendersPerBatch: { baseline: baselineBlocks, optimized: optimizedBlocks },
    scope: 'local move preview on a large distributed-content document; no full-frame or dense 100-layer latency claim'
  }, null, 2)}\n`)
}, 30000)
