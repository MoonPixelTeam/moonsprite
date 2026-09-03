import { describe, expect, it } from 'vitest'
import { animationCelKey } from './animation'
import { animationSelectionTargetPairs } from './selection-transform-targets'

describe('animation selection transform targets', () => {
  it('merges selected cells with selected frame/layer combinations', () => {
    expect(animationSelectionTargetPairs(
      ['frame-1', 'frame-2'],
      ['layer-a', 'layer-b'],
      [animationCelKey('layer-b', 'frame-2'), animationCelKey('layer-c', 'frame-3')]
    )).toEqual([
      { layerId: 'layer-b', frameId: 'frame-2' },
      { layerId: 'layer-c', frameId: 'frame-3' },
      { layerId: 'layer-a', frameId: 'frame-1' },
      { layerId: 'layer-b', frameId: 'frame-1' },
      { layerId: 'layer-a', frameId: 'frame-2' }
    ])
  })

  it('deduplicates a cell that is also covered by the frame selection', () => {
    expect(animationSelectionTargetPairs(
      ['frame-1'],
      ['layer-a'],
      [animationCelKey('layer-a', 'frame-1')]
    )).toEqual([{ layerId: 'layer-a', frameId: 'frame-1' }])
  })
})
