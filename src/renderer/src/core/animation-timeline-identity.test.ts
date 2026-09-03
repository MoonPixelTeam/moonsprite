import { describe, expect, it } from 'vitest'
import {
  parseTimelineCellKey,
  parseTimelineRowKey,
  timelineCellKey,
  timelineCellSlotKey,
  timelineCellRefFromLegacyKey,
  timelineMaskSlotRef,
  timelineRowKey,
} from './animation-timeline-identity'
import { createAnimationTimelineVisualIndex } from './animation-timeline-visual-state'

describe('animation timeline typed identity', () => {
  it('keeps ordinary and mask cells distinct for the same owner/frame', () => {
    const cel = timelineCellKey({ kind: 'cel', ownerKind: 'layer', ownerId: 'owner', frameId: 'frame' })
    const mask = timelineCellKey({ kind: 'mask', ownerKind: 'layer', ownerId: 'owner', frameId: 'frame' })
    expect(cel).not.toBe(mask)
    expect(parseTimelineCellKey(cel)).toEqual({ kind: 'cel', ownerKind: 'layer', ownerId: 'owner', frameId: 'frame' })
    expect(parseTimelineCellKey(mask)).toEqual({ kind: 'mask', ownerKind: 'layer', ownerId: 'owner', frameId: 'frame' })
  })

  it('keeps layer masks and group masks distinct', () => {
    const layerMask = timelineRowKey({ kind: 'mask', ownerKind: 'layer', ownerId: 'same' })
    const groupMask = timelineRowKey({ kind: 'mask', ownerKind: 'group', ownerId: 'same' })
    expect(layerMask).not.toBe(groupMask)
    expect(parseTimelineRowKey(layerMask)).toEqual({ kind: 'mask', ownerKind: 'layer', ownerId: 'same' })
    expect(parseTimelineRowKey(groupMask)).toEqual({ kind: 'mask', ownerKind: 'group', ownerId: 'same' })
  })

  it('adapts legacy owner:frame keys only at the typed boundary', () => {
    expect(timelineCellRefFromLegacyKey('owner:frame', 'mask', 'group')).toEqual({
      kind: 'mask',
      ownerKind: 'group',
      ownerId: 'owner',
      frameId: 'frame',
    })
    const typedMask = timelineCellKey({ kind: 'mask', ownerKind: 'layer', ownerId: 'owner', frameId: 'frame' })
    expect(timelineCellRefFromLegacyKey(typedMask, 'cel', 'layer')).toBeNull()
  })

  it('supports ids containing separators and empty mask slots without materializing a cel', () => {
    const ref = timelineMaskSlotRef('layer', 'owner:with:colon', 'frame|with|pipe')
    const key = timelineCellKey(ref)
    expect(parseTimelineCellKey(key)).toEqual(ref)
  })

  it('keeps layer and group owner slots distinct in the canonical index', () => {
    const index = createAnimationTimelineVisualIndex(
      [{ id: 'frame' }],
      [
        { id: 'layer-cel', key: 'same:frame', ownerKind: 'layer', ownerId: 'same', frameId: 'frame', kind: 'cel' },
        { id: 'group-cel', key: 'same:frame', ownerKind: 'group', ownerId: 'same', frameId: 'frame', kind: 'cel' },
      ],
    )
    expect(index.celByOwnerFrame.size).toBe(2)
  })

  it('keeps linked layer-mask and group-mask slots distinct', () => {
    const layerMask = timelineCellSlotKey({ kind: 'mask', ownerKind: 'layer', ownerId: 'same', frameId: 'frame' })
    const groupMask = timelineCellSlotKey({ kind: 'mask', ownerKind: 'group', ownerId: 'same', frameId: 'frame' })
    expect(layerMask).not.toBe(groupMask)
  })
})
