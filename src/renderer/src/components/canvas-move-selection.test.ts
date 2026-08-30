import { describe, expect, it } from 'vitest'
import { animationCelKey } from '@/core/animation'
import { animationFrameIdsForCellKeys, resolveCanvasMoveAnimationCellKeys, resolveCanvasMoveLayerIds, shouldUseFreeTileInstanceMove } from './canvas-move-selection'

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
