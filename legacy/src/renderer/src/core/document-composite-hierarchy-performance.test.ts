import { Buffer } from 'node:buffer'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { SpriteDocument } from '@shared/types-document'
import { createDocument, createLayer, createLayerMask, markLayerContentChanged } from './document-model'
import * as hierarchy from './document-composite-hierarchy'
import { buildLayerPanelTree } from './layer-panel-layout'
import { animationLayerZIndexes } from './document-composite-z-index'
import { buildCompositeStack, type CompositeStackItem } from './document-composite-plan'
import { compositeRegion } from './document-composite-region'
import { createDefaultLayerStyles } from './layer-styles'

// Previous complete stack builder, including the already accepted z-index cache.
const baselineStack = (document: SpriteDocument): CompositeStackItem[] => {
  const layers = new Map(document.layers.map(layer => [layer.id, layer]))
  const groups = new Map(document.groups.map(group => [group.id, group]))
  const root: CompositeStackItem[] = [], containers = [root]
  for (const node of buildLayerPanelTree({ layers: document.layers, groups: document.groups })) {
    const container = containers[node.depth]
    if (!container) continue
    containers.length = node.depth + 1
    if (node.kind === 'layer') {
      const layer = layers.get(node.id)
      if (layer) container.push({ kind: 'layer', layer })
    } else {
      const group = groups.get(node.id)
      if (!group) continue
      const item: CompositeStackItem = { kind: 'group', group, children: [] }
      container.push(item); containers[node.depth + 1] = item.children
    }
  }
  const reverse = (items: CompositeStackItem[]) => { items.reverse(); for (const item of items) if (item.kind === 'group') reverse(item.children) }
  reverse(root)
  const zIndexes = animationLayerZIndexes(document)
  const sort = (items: CompositeStackItem[]) => {
    for (const item of items) if (item.kind === 'group') sort(item.children)
    const blocks: Array<{ items: CompositeStackItem[]; zIndex: number; order: number }> = []
    for (const item of items) {
      const clips = item.kind === 'layer' ? item.layer.clippingMask === true : item.group.clippingMask === true
      if (clips && blocks.length) { blocks[blocks.length - 1].items.push(item); continue }
      blocks.push({ items: [item], zIndex: item.kind === 'layer' ? zIndexes.get(item.layer.id) ?? 0 : 0, order: blocks.length })
    }
    blocks.sort((a, b) => a.zIndex - b.zIndex || a.order - b.order)
    items.splice(0, items.length, ...blocks.flatMap(block => block.items))
  }
  sort(root)
  return root
}

const signature = (items: readonly CompositeStackItem[]): unknown[] => items.map(item => item.kind === 'layer'
  ? ['layer', item.layer.id] : ['group', item.group.id, signature(item.children)])
const fixture = (size: number, count: number, groupCount: number) => {
  const document = createDocument('hierarchy cache', size, size, 'rgba', false)
  const first = document.layers[0]
  if (first.format !== 'rgba') throw new Error('RGBA fixture required')
  const pixels = first.pixels
  new Uint32Array(pixels.buffer).fill(0x80603010)
  for (let y = 0; y < size; y += 1) for (let x = y % 7; x < size; x += 32) pixels[(y * size + x) * 4 + 3] = 0
  for (let index = 1; index < count; index += 1) {
    const layer = createLayer(`Layer ${index}`, 1, 1, 'rgba')
    layer.width = size; layer.height = size; layer.pixels = pixels
    layer.opacity = (index % 3 + 1) / 3
    if (index % 7 === 0) layer.clippingMask = true
    document.layers.push(layer)
  }
  for (let index = 0; index < groupCount; index += 1) document.groups.push({ id: `g-${index}`, name: `Group ${index}`, visible: true, locked: false, opacity: 0.8, blendMode: 'normal', parentGroupId: index % 5 ? `g-${index - 1}` : null })
  for (let index = 0; index < count; index += 1) if (groupCount) document.layers[index].groupId = `g-${index % groupCount}`
  const timeline = document.animation!
  timeline.frames = Array.from({ length: 8 }, (_, index) => ({ id: `frame-${index}`, duration: 100 }))
  timeline.activeFrameId = timeline.frames[0].id
  timeline.cels = document.layers.flatMap((layer, layerIndex) => timeline.frames.map((frame, frameIndex) => ({
    id: `${layer.id}:${frame.id}`, layerId: layer.id, frameId: frame.id, zIndex: (layerIndex + frameIndex) % 13 - 6
  })))
  markLayerContentChanged(first)
  return { document, residentRasterBytes: pixels.byteLength }
}

describe('composite hierarchy reuse', () => {
  it('reduces complete stack preparation on 4096², 100 layers, 20 nested groups and 8 frames', () => {
    const { document, residentRasterBytes } = fixture(4096, 100, 20)
    const batches = 1024
    const run = (optimized: boolean) => {
      const started = performance.now()
      let roots = 0
      for (let index = 0; index < batches; index += 1) {
        document.animation!.activeFrameId = document.animation!.frames[index % 8].id
        roots += (optimized ? buildCompositeStack(document) : baselineStack(document)).length
      }
      return { ms: performance.now() - started, roots }
    }
    run(false); run(true)
    const baseline: ReturnType<typeof run>[] = [], optimized: ReturnType<typeof run>[] = []
    for (let sample = 0; sample < 3; sample += 1) {
      if (sample % 2 === 0) { baseline.push(run(false)); optimized.push(run(true)) }
      else { optimized.push(run(true)); baseline.push(run(false)) }
    }
    const median = (samples: ReturnType<typeof run>[]) => samples.map(sample => sample.ms).sort((a, b) => a - b)[1]
    const baselineMs = median(baseline), optimizedMs = median(optimized)
    for (const frame of document.animation!.frames) {
      document.animation!.activeFrameId = frame.id
      expect(signature(buildCompositeStack(document))).toEqual(signature(baselineStack(document)))
    }
    expect(optimized.every(sample => sample.roots === baseline[0].roots)).toBe(true)
    expect(optimizedMs).toBeLessThan(baselineMs)
    const evidence = {
      scenario: { canvas: '4096x4096', layers: 100, nestedGroups: 20, maximumGroupDepth: 5, frames: 8, cels: 800, content: 'shared nonuniform-alpha RGBA raster, clipping layers and frame-specific z-index' },
      scope: 'complete composite stack preparation; excludes pixel rendering',
      baseline: 'previous stack builder with accepted z-index cache', residentRasterBytes,
      batchesPerSample: batches, warmupBatchesPerVariant: batches, samples: { baseline, optimized },
      baselineMedianMs: baselineMs, optimizedMedianMs: optimizedMs, elapsedReductionRatio: 1 - optimizedMs / baselineMs,
      allFrameStackSignaturesEqual: true
    }
    mkdirSync(resolve('output'), { recursive: true })
    writeFileSync(resolve('output/document-composite-hierarchy-after-20261006.json'), `${JSON.stringify(evidence, null, 2)}\n`)
  }, 30000)

  it('tracks order, membership, parent and panel anchor changes, including malformed groups', () => {
    const { document } = fixture(4, 8, 4)
    const check = () => {
      expect(hierarchy.compositeHierarchyNodes(document)).toEqual(buildLayerPanelTree({ layers: document.layers, groups: document.groups }))
      expect(signature(buildCompositeStack(document))).toEqual(signature(baselineStack(document)))
    }
    check(); check()
    document.layers.reverse(); check(); document.layers.reverse(); check()
    document.layers[0].groupId = null; check()
    document.layers[0].groupId = 'missing'; check()
    document.layers[0].id = 'renamed-layer'; check()
    document.groups[0].panelOrder = 2.5; check()
    document.groups[0].panelOrder = NaN; check(); check()
    document.groups[1].parentGroupId = null; check()
    document.groups[1].parentGroupId = 'missing'; check()
    document.groups[1].parentGroupId = document.groups[1].id; check()
    document.groups[1].parentGroupId = document.groups[2].id; document.groups[2].parentGroupId = document.groups[1].id; check()
    document.groups[0].id = 'renamed-group'; check()
    document.groups.reverse(); check()
    document.groups.push({ ...document.groups[0] }); check(); document.groups.pop(); check()
    document.layers = [...document.layers]; document.groups = [...document.groups]; check()
    const layer = createLayer('added', 1, 1, 'rgba')
    document.layers.push(layer); check(); document.layers.pop(); check()
    document.groups = []; check()
    document.layers = []; check()
  })

  it('reuses IDs while reading current layer objects, styles, clipping and frame z-index', () => {
    const { document } = fixture(4, 4, 2)
    const nodes = hierarchy.compositeHierarchyNodes(document)
    const before = buildCompositeStack(document)
    before.length = 0
    document.layers[0] = { ...document.layers[0], opacity: 0.1, visible: false, offsetX: -3, clippingMask: true }
    document.groups[0] = { ...document.groups[0], opacity: 0.6 }
    document.layers[1].layerStyles = createDefaultLayerStyles()
    document.layers[1].layerStyles!.stroke.enabled = true
    expect(hierarchy.compositeHierarchyNodes(document)).toBe(nodes)
    for (const frame of document.animation!.frames) {
      document.animation!.activeFrameId = frame.id
      expect(signature(buildCompositeStack(document))).toEqual(signature(baselineStack(document)))
    }
    const checkObjects = (items: readonly CompositeStackItem[]) => {
      for (const item of items) {
        if (item.kind === 'layer') expect(item.layer).toBe(document.layers.find(layer => layer.id === item.layer.id))
        else { expect(item.group).toBe(document.groups.find(group => group.id === item.group.id)); checkObjects(item.children) }
      }
    }
    checkObjects(buildCompositeStack(document))
    expect(Object.isFrozen(nodes)).toBe(true)
    expect(nodes.every(node => Object.isFrozen(node))).toBe(true)
  })

  it('matches real nested, styled, masked and clipped composite pixels in all eight frames', () => {
    const { document } = fixture(24, 8, 3)
    const styles = createDefaultLayerStyles()
    styles.stroke = { ...styles.stroke, enabled: true, size: 1, position: 'both' }
    document.layers[3].layerStyles = styles
    const mask = createLayerMask(document.layers[0].id, 24, 24)
    new Uint32Array(mask.pixels.buffer).fill(0xff808080); markLayerContentChanged(mask)
    document.animation!.layerMasks = document.animation!.frames.map(frame => ({ layerId: document.layers[0].id, frameId: frame.id, mask }))
    for (const frame of document.animation!.frames) {
      document.animation!.activeFrameId = frame.id
      const optimized = compositeRegion(document, 0, 0, 24, 24)
      const spy = vi.spyOn(hierarchy, 'compositeHierarchyNodes').mockImplementation(doc => buildLayerPanelTree({ layers: doc.layers, groups: doc.groups }))
      try {
        const baseline = compositeRegion(document, 0, 0, 24, 24)
        expect(spy).toHaveBeenCalled()
        expect(Buffer.from(optimized).equals(Buffer.from(baseline))).toBe(true)
      } finally { spy.mockRestore() }
    }
  })
})
