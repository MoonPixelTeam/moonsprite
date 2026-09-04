import { describe, expect, it } from 'vitest'
import { resolveTimelineFocusState, timelineSelectionPrecedesMarquee } from './animation-timeline-focus'
import type { TimelineCellRef } from './animation-timeline-identity'

const cel = (ownerId: string, frameId: string): TimelineCellRef => ({ kind: 'cel', ownerKind: 'layer', ownerId, frameId })
const mask = (ownerId: string, frameId: string): TimelineCellRef => ({ kind: 'mask', ownerKind: 'layer', ownerId, frameId })

describe('resolveTimelineFocusState', () => {
  it('distinguishes explicit layer focus from the implicit active cursor', () => {
    const explicit = resolveTimelineFocusState({
      activeLayerId: 'a', activeFrameId: 'f3', activeMaskId: null,
      layerSelectionExplicit: true, selectedLayerIds: ['a']
    })
    expect(explicit.mode).toBe('explicit-layer')
    expect(explicit.explicitLayerFocus).toBe(true)

    const cursor = resolveTimelineFocusState({
      activeLayerId: 'a', activeFrameId: 'f3', activeMaskId: null,
      layerSelectionExplicit: false, selectedLayerIds: ['a']
    })
    expect(cursor.mode).toBe('implicit-cursor')
    expect(cursor.explicitLayerFocus).toBe(false)
  })

  it('prioritizes mask cell/row context over frame and cel selections', () => {
    const state = resolveTimelineFocusState({
      activeLayerId: 'a', activeFrameId: 'f3', activeMaskId: 'm3', layerSelectionExplicit: false,
      selectedFrameIds: ['f3'], selectedCellRefs: [cel('a', 'f3')], selectedMaskCellRefs: [mask('a', 'f3')]
    })
    expect(state.mode).toBe('mask-cell')
    expect(state.maskFocus).toBe(true)
    expect(state.cell?.kind).toBe('mask')
  })

  it('resolves a mask row without inventing a layer selection', () => {
    const state = resolveTimelineFocusState({
      activeLayerId: 'a', activeFrameId: 'f3', activeMaskId: null, layerSelectionExplicit: false,
      selectedMaskRowRefs: [{ kind: 'mask', ownerKind: 'layer', ownerId: 'a' }]
    })
    expect(state.mode).toBe('mask-row')
    expect(state.owner).toEqual({ kind: 'mask', ownerKind: 'layer', ownerId: 'a' })
    expect(state.explicitLayerFocus).toBe(false)
  })

  it('keeps stale active mask editing in mask-cell mode', () => {
    const state = resolveTimelineFocusState({
      activeLayerId: 'a', activeFrameId: 'f3', activeMaskId: 'mask-3', layerSelectionExplicit: false
    })
    expect(state.maskFocus).toBe(true)
    expect(state.mode).toBe('mask-cell')
  })
})

describe('timelineSelectionPrecedesMarquee', () => {
  const input = {
    canvasSelectionActive: false,
    activeMaskId: null,
    selectedFrameCount: 0,
    selectedCellCount: 0,
    layerSelectionExplicit: false,
    selectedLayerCount: 1,
    selectedGroupCount: 0,
    selectedGroupId: null
  }

  it('collapses an existing timeline selection only when starting the first canvas marquee', () => {
    expect(timelineSelectionPrecedesMarquee({ ...input, selectedFrameCount: 2 })).toBe(true)
    expect(timelineSelectionPrecedesMarquee({ ...input, selectedCellCount: 2 })).toBe(true)
    expect(timelineSelectionPrecedesMarquee({ ...input, selectedLayerCount: 2 })).toBe(true)
    expect(timelineSelectionPrecedesMarquee({ ...input, selectedFrameCount: 2, canvasSelectionActive: true })).toBe(false)
    expect(timelineSelectionPrecedesMarquee({ ...input, selectedFrameCount: 2, activeMaskId: 'mask-a' })).toBe(false)
    expect(timelineSelectionPrecedesMarquee(input)).toBe(false)
  })
})
