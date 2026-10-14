import { describe, expect, it } from 'vitest'
import { cachedLayerContentBounds, createDocument, writeLayerColor } from '@/core/document'
import { beginPixelEdit } from '@/core/history'
import { paintBrush } from '@/core/tools'
import { animationCelKey } from '@/core/animation'
import { animationFrameIdsForCellKeys, canvasMoveLayerContentPreview, resolveCanvasMoveAnimationCellKeys, resolveCanvasMoveLayerIds, shouldUseFreeTileInstanceMove } from './canvas-move-selection'

describe('canvas move layer selection', () => {
  it('expands selected groups into every descendant layer for canvas movement', () => {
    expect(resolveCanvasMoveLayerIds({
      selectedLayerIds: ['outside-layer'],
      selectedGroupIds: ['group-a'],
      layerIdsForGroup: (groupId) => groupId === 'group-a' ? ['group-layer-a', 'nested-layer'] : []
    })).toEqual(['outside-layer', 'group-layer-a', 'nested-layer'])
  })

  it('preserves an explicit cross-frame cell selection', () => {
    const selectedAnimationCellKeys = [
      animationCelKey('layer-a', 'frame-a'),
      animationCelKey('layer-b', 'frame-b')
    ]

    expect(resolveCanvasMoveAnimationCellKeys({
      selectedAnimationCellKeys,
      selectedAnimationFrameIds: [],
      selectedLayerIds: ['layer-a', 'layer-b'],
      allFrameIds: ['frame-a', 'frame-b', 'frame-c'],
      currentFrameId: 'frame-b',
      targetLayerId: 'layer-b',
      moveAllSelectedLayers: true
    })).toEqual(selectedAnimationCellKeys)
  })

  it('moves every frame for a multi-layer selection instead of implicit current-frame cels', () => {
    const layers = ['layer-a', 'layer-b']
    const frames = ['frame-1', 'frame-2', 'frame-3']
    const keys = resolveCanvasMoveAnimationCellKeys({
      selectedAnimationCellKeys: layers.map((layerId) => animationCelKey(layerId, 'frame-2')),
      selectedAnimationFrameIds: [],
      selectedLayerIds: layers,
      allFrameIds: frames,
      currentFrameId: 'frame-2',
      targetLayerId: 'layer-a',
      moveAllSelectedLayers: true
    })

    expect(keys).toEqual(layers.flatMap((layerId) => frames.map((frameId) => animationCelKey(layerId, frameId))))
  })

  it('moves every frame for an explicitly selected single layer', () => {
    const frames = ['frame-1', 'frame-2', 'frame-3']
    expect(resolveCanvasMoveAnimationCellKeys({
      selectedAnimationCellKeys: [],
      selectedAnimationFrameIds: [],
      selectedLayerIds: ['layer-a'],
      allFrameIds: frames,
      currentFrameId: 'frame-2',
      targetLayerId: 'layer-a',
      moveAllSelectedLayers: true
    })).toEqual(frames.map((frameId) => animationCelKey('layer-a', frameId)))
  })

  it('keeps an implicit active animation target scoped to its current cel', () => {
    expect(resolveCanvasMoveAnimationCellKeys({
      selectedAnimationCellKeys: [],
      selectedAnimationFrameIds: [],
      selectedLayerIds: [],
      allFrameIds: ['frame-1', 'frame-2'],
      currentFrameId: 'frame-2',
      targetLayerId: 'layer-a',
      moveAllSelectedLayers: false
    })).toEqual([animationCelKey('layer-a', 'frame-2')])
  })

  it('keeps the whole layer selection when frame columns are also selected', () => {
    const frames = ['frame-1', 'frame-2', 'frame-3']
    expect(resolveCanvasMoveAnimationCellKeys({
      selectedAnimationCellKeys: [],
      selectedAnimationFrameIds: ['frame-1', 'frame-2'],
      selectedLayerIds: ['layer-a', 'layer-b'],
      allFrameIds: frames,
      currentFrameId: 'frame-2',
      targetLayerId: 'layer-a',
      moveAllSelectedLayers: true
    })).toEqual(['layer-a', 'layer-b'].flatMap((layerId) => frames.map((frameId) => animationCelKey(layerId, frameId))))
  })

  it('keeps single-layer frame selection scoped to the selected frames', () => {
    const keys = resolveCanvasMoveAnimationCellKeys({
      selectedAnimationCellKeys: [animationCelKey('layer-a', 'frame-2')],
      selectedAnimationFrameIds: ['frame-2'],
      selectedLayerIds: ['layer-a'],
      allFrameIds: ['frame-1', 'frame-2', 'frame-3'],
      currentFrameId: 'frame-2',
      targetLayerId: 'layer-a',
      moveAllSelectedLayers: false
    })

    expect(keys).toEqual([animationCelKey('layer-a', 'frame-2')])
  })

  it('maps a frame multi-selection to the target layer without creating a cel selection', () => {
    expect(resolveCanvasMoveAnimationCellKeys({
      selectedAnimationCellKeys: [],
      selectedAnimationFrameIds: ['frame-a', 'frame-c'],
      selectedLayerIds: ['layer-a'],
      allFrameIds: ['frame-a', 'frame-b', 'frame-c'],
      currentFrameId: 'frame-c',
      targetLayerId: 'layer-a',
      moveAllSelectedLayers: false
    })).toEqual([
      animationCelKey('layer-a', 'frame-a'),
      animationCelKey('layer-a', 'frame-c')
    ])
  })

  it('moves an explicitly selected frame column across editable layers', () => {
    expect(resolveCanvasMoveAnimationCellKeys({
      selectedAnimationCellKeys: [],
      selectedAnimationFrameIds: ['frame-a', 'frame-c'],
      selectedLayerIds: ['layer-a', 'layer-b'],
      allFrameIds: ['frame-a', 'frame-b', 'frame-c'],
      currentFrameId: 'frame-c',
      targetLayerId: 'layer-a',
      moveAllSelectedLayers: true,
      moveSelectedFramesAcrossLayers: true
    })).toEqual([
      animationCelKey('layer-a', 'frame-a'),
      animationCelKey('layer-a', 'frame-c'),
      animationCelKey('layer-b', 'frame-a'),
      animationCelKey('layer-b', 'frame-c')
    ])
  })

  it('deduplicates animation frame ids for preview cache invalidation', () => {
    expect(animationFrameIdsForCellKeys([
      animationCelKey('layer-a', 'frame-a'),
      animationCelKey('layer-b', 'frame-a'),
      animationCelKey('layer-a', 'frame-b'),
      'invalid'
    ])).toEqual(['frame-a', 'frame-b'])
  })

  it('moves Free Tile instances only while their instance-layer view is open', () => {
    expect(shouldUseFreeTileInstanceMove('free-layer', null)).toBe(false)
    expect(shouldUseFreeTileInstanceMove('free-layer', 'other-layer')).toBe(false)
    expect(shouldUseFreeTileInstanceMove('free-layer', 'free-layer')).toBe(true)
  })
})


describe('move layer content feedback after erasing', () => {
  it('refreshes the same selected cel after its boundary is erased, without switching layers', () => {
    const document = createDocument('erase then click same cel', 16, 16, 'rgba')
    const layer = document.layers[0]
    const color = { r: 255, g: 40, b: 10, a: 255 }
    for (const [x, y] of [[1, 1], [8, 7], [14, 14]]) writeLayerColor(document, layer, y * 16 + x, color)
    const key = animationCelKey(layer.id, document.animation!.activeFrameId)
    const selectedAnimationCellKeys = [key]
    const click = () => {
      expect(selectedAnimationCellKeys).toContain(key)
      return canvasMoveLayerContentPreview(document, layer)
    }
    expect(click()?.bounds).toEqual({ x: 1, y: 1, width: 14, height: 14 })
    const edit = beginPixelEdit(layer.id)
    paintBrush(document, layer, edit, 1, 1, 1, { r: 0, g: 0, b: 0, a: 0 }, 'square')
    paintBrush(document, layer, edit, 14, 14, 1, { r: 0, g: 0, b: 0, a: 0 }, 'square')
    expect(cachedLayerContentBounds(document, layer)).toBeUndefined()
    expect(click()?.bounds).toEqual({ x: 8, y: 7, width: 1, height: 1 })
    expect(cachedLayerContentBounds(document, layer)).toEqual({ x: 8, y: 7, width: 1, height: 1 })
    expect(click()?.bounds).toEqual({ x: 8, y: 7, width: 1, height: 1 })
    expect(document.activeLayerId).toBe(layer.id)
    paintBrush(document, layer, edit, 8, 7, 1, { r: 0, g: 0, b: 0, a: 0 }, 'square')
    expect(click()).toBeNull()
    writeLayerColor(document, layer, 3 * 16 + 4, color)
    layer.offsetX = -6; layer.offsetY = 20
    expect(click()).toEqual({ layerId: layer.id, bounds: { x: -2, y: 23, width: 1, height: 1 }, layerOffsetX: -6, layerOffsetY: 20 })
  })
})
