import type { LayerGroup } from '@shared/types-layer'
import { bench, describe } from 'vitest'
import { compositeRegion, createDocument, createLayer, createLayerMask, DocumentCompositeCache } from './document'

const CANVAS_SIZE = 800
const LAYER_COUNT = 24
const GROUP_COUNT = 6

const document = createDocument('complex composite benchmark', CANVAS_SIZE, CANVAS_SIZE, 'rgba')
document.layers = []
document.groups = Array.from({ length: GROUP_COUNT }, (_, index): LayerGroup => ({
  id: `group-${index}`,
  name: `Group ${index}`,
  parentGroupId: index >= 3 ? `group-${index - 3}` : null,
  visible: true,
  locked: false,
  opacity: 1,
  blendMode: 'normal'
}))

for (let layerIndex = 0; layerIndex < LAYER_COUNT; layerIndex += 1) {
  const layer = createLayer(`Layer ${layerIndex}`, CANVAS_SIZE, CANVAS_SIZE, 'rgba')
  if (layer.format !== 'rgba') throw new Error('RGBA benchmark layer required')
  layer.groupId = `group-${layerIndex % GROUP_COUNT}`
  const colorOffset = layerIndex % 3
  for (let y = layerIndex % 8; y < CANVAS_SIZE; y += 8) {
    for (let x = 0; x < CANVAS_SIZE; x += 1) {
      const offset = (y * CANVAS_SIZE + x) * 4
      layer.pixels[offset + colorOffset] = 64 + layerIndex * 7
      layer.pixels[offset + 3] = 96 + layerIndex * 5
    }
  }
  document.layers.push(layer)
}
document.activeLayerId = document.layers.at(-1)!.id

describe('complex document compositing', () => {
  bench('composite 800x800 with 24 grouped layers', () => {
    compositeRegion(document, 0, 0, CANVAS_SIZE, CANVAS_SIZE)
  }, { iterations: 3, warmupIterations: 1 })

  bench('composite 64x64 dirty region with 24 grouped layers', () => {
    compositeRegion(document, 368, 368, 64, 64)
  }, { iterations: 10, warmupIterations: 2 })
})

const largeDocument = createDocument('large dirty region benchmark', 4000, 2000, 'rgba')
const largeCache = new DocumentCompositeCache()

describe('large document dirty-region compositing', () => {
  bench('composite 64x64 without scanning the full 4000x2000 layer', () => {
    compositeRegion(largeDocument, 1968, 968, 64, 64, largeCache, 1)
  }, { iterations: 10, warmupIterations: 2 })
})

const createGroupedOpacityDocument = (groupVisible: boolean, groupOpacity = 0.3, groupBlendMode: LayerGroup['blendMode'] = 'normal') => {
  const groupedDocument = createDocument('group opacity move benchmark', CANVAS_SIZE, CANVAS_SIZE, 'rgba')
  groupedDocument.layers = []
  groupedDocument.groups = [
    { id: 'group-a', name: 'Group A', parentGroupId: null, panelOrder: 12, visible: groupVisible, locked: false, opacity: groupOpacity, blendMode: groupBlendMode },
    { id: 'group-b', name: 'Group B', parentGroupId: null, panelOrder: 9, visible: true, locked: false, opacity: 1, blendMode: 'normal' }
  ]
  for (let layerIndex = 0; layerIndex < 12; layerIndex += 1) {
    const layer = createLayer(`Layer ${layerIndex}`, CANVAS_SIZE, CANVAS_SIZE, 'rgba')
    if (layer.format !== 'rgba') throw new Error('RGBA benchmark layer required')
    layer.groupId = layerIndex < 3 ? 'group-a' : 'group-b'
    const channel = layerIndex % 3
    for (let y = layerIndex; y < CANVAS_SIZE; y += 48) {
      for (let x = 0; x < CANVAS_SIZE; x += 1) {
        const offset = (y * CANVAS_SIZE + x) * 4
        layer.pixels[offset + channel] = 160 + layerIndex * 6
        layer.pixels[offset + 3] = 255
      }
    }
    groupedDocument.layers.push(layer)
  }
  groupedDocument.activeLayerId = groupedDocument.layers.at(-1)!.id
  return groupedDocument
}

const hiddenOpacityDocument = createGroupedOpacityDocument(false)
const visibleOpacityDocument = createGroupedOpacityDocument(true)
const multiplyOpacityDocument = createGroupedOpacityDocument(true, 0.32, 'multiply')
const defaultOpacityDocument = createGroupedOpacityDocument(true, 1)
const legacyMaskedOpacityDocument = createGroupedOpacityDocument(true)
const legacyMask = createLayerMask('group-a', CANVAS_SIZE, CANVAS_SIZE, 'group')
legacyMaskedOpacityDocument.animation!.groupMasks = [{
  groupId: 'group-a',
  frameId: legacyMaskedOpacityDocument.animation!.activeFrameId,
  mask: legacyMask
}]
const groupedOpacityCache = new DocumentCompositeCache()

describe('group opacity dirty-region compositing', () => {
  bench('composite 256x256 with a hidden 30% group', () => {
    compositeRegion(hiddenOpacityDocument, 272, 272, 256, 256, groupedOpacityCache, 1)
  }, { iterations: 10, warmupIterations: 2 })

  bench('composite 256x256 with a visible 30% group', () => {
    compositeRegion(visibleOpacityDocument, 272, 272, 256, 256, groupedOpacityCache, 1)
  }, { iterations: 10, warmupIterations: 2 })

  bench('composite 256x256 with a visible 32% multiply group', () => {
    compositeRegion(multiplyOpacityDocument, 272, 272, 256, 256, groupedOpacityCache, 1)
  }, { iterations: 10, warmupIterations: 2 })

  bench('composite 256x256 with visible 100% groups', () => {
    compositeRegion(defaultOpacityDocument, 272, 272, 256, 256, groupedOpacityCache, 1)
  }, { iterations: 10, warmupIterations: 2 })

  bench('composite 256x256 with a neutral legacy group mask', () => {
    compositeRegion(legacyMaskedOpacityDocument, 272, 272, 256, 256, groupedOpacityCache, 1)
  }, { iterations: 10, warmupIterations: 2 })
})
