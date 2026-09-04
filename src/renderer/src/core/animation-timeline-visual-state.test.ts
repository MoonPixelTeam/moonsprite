import { describe, expect, it } from 'vitest'
import { animationMaskAt } from './document'
import { createAnimationTimelineVisualIndex, deriveAnimationTimelineVisualState, resolveTimelineMaskVisualFlags, shouldRenderTimelineCelSelectionMarker, type TimelineVisualCell, type TimelineVisualRow } from './animation-timeline-visual-state'
import { timelineCellSlotKey } from './animation-timeline-identity'
import type { AnimationTimeline, LayerMask } from '@shared/types'

const rows: TimelineVisualRow[] = [
  { id: 'layer-a', ownerId: 'layer-a', ownerKind: 'layer', kind: 'layer' },
  { id: 'layer-b', ownerId: 'layer-b', ownerKind: 'layer', kind: 'layer' },
  { id: 'group-mask', ownerId: 'group-a', ownerKind: 'group', kind: 'mask' },
]

const frames = [{ id: 'f1' }, { id: 'f2' }, { id: 'f3' }]

const cells: TimelineVisualCell[] = [
  { id: 'a1', key: 'layer-a:f1', ownerId: 'layer-a', ownerKind: 'layer', frameId: 'f1', kind: 'cel' },
  { id: 'a2', key: 'layer-a:f2', ownerId: 'layer-a', ownerKind: 'layer', frameId: 'f2', kind: 'cel', linkSourceId: 'a1' },
  { id: 'a3', key: 'layer-a:f3', ownerId: 'layer-a', ownerKind: 'layer', frameId: 'f3', kind: 'cel', linkSourceId: 'a1' },
  { id: 'b1', key: 'layer-b:f1', ownerId: 'layer-b', ownerKind: 'layer', frameId: 'f1', kind: 'cel' },
  { id: 'mask1', key: 'group-a:f1', ownerId: 'group-a', ownerKind: 'group', frameId: 'f1', kind: 'mask' },
  { id: 'mask2', key: 'group-a:f2', ownerId: 'group-a', ownerKind: 'group', frameId: 'f2', kind: 'mask', linkSourceId: 'mask1' },
]

const cell = (state: ReturnType<typeof deriveAnimationTimelineVisualState>, key: string, kind: 'cel' | 'mask' = 'cel') => {
  const result = state.cells.find((candidate) => candidate.key === key && candidate.kind === kind)
  if (!result) throw new Error(`missing ${kind}:${key}`)
  return result
}

describe('deriveAnimationTimelineVisualState', () => {
  it('indexes linked mask slots with mask identity for panel lookups', () => {
    const index = createAnimationTimelineVisualIndex(frames, cells)
    const sourceKey = timelineCellSlotKey({ kind: 'mask', ownerKind: 'group', ownerId: 'group-a', frameId: 'f1' })
    const memberKey = timelineCellSlotKey({ kind: 'mask', ownerKind: 'group', ownerId: 'group-a', frameId: 'f2' })

    expect(index.maskByOwnerFrame.get(sourceKey)?.id).toBe('mask1')
    expect(index.maskByOwnerFrame.get(memberKey)?.id).toBe('mask2')
    expect(index.maskRootById.get('mask2')).toBe('mask1')
  })

  it('does not render an interior marker for sparse or transparent slots', () => {
    // The renderer passes visible-content state, including linked-source
    // resolution, rather than cel-object existence.
    expect(shouldRenderTimelineCelSelectionMarker(false, true)).toBe(false)
    expect(shouldRenderTimelineCelSelectionMarker(false, false)).toBe(false)
    expect(shouldRenderTimelineCelSelectionMarker(true, true)).toBe(true)
    expect(shouldRenderTimelineCelSelectionMarker(true, false)).toBe(false)
  })

  it('keeps mask selection and active state for a linked member inheriting its source mask', () => {
    const sourceMask = { id: 'mask-source', ownerKind: 'cel', ownerId: 'layer-a', width: 1, height: 1, offsetX: 0, offsetY: 0, format: 'rgba', pixels: new Uint8ClampedArray(4) } as LayerMask
    const memberMask = { ...sourceMask, id: 'mask-member', linkedMaskId: sourceMask.id, pixels: new Uint8ClampedArray(4) }
    const timeline: AnimationTimeline = {
      frames: [{ id: 'f1', duration: 100 }, { id: 'f2', duration: 100 }],
      cels: [
        { id: 'source', layerId: 'layer-a', frameId: 'f1' },
        { id: 'member', layerId: 'layer-a', frameId: 'f2', linkedCelId: 'source' },
      ],
      layerMasks: [
        { layerId: 'layer-a', frameId: 'f1', mask: sourceMask },
        { layerId: 'layer-a', frameId: 'f2', mask: memberMask },
      ],
      activeFrameId: 'f2',
      loop: true,
    }

    expect(animationMaskAt(timeline, 'layer-a', 'f2')?.id).toBe('mask-source')
    expect(resolveTimelineMaskVisualFlags({ derived: undefined, legacySelected: true, legacyActive: true })).toEqual({ selected: true, active: true })
    expect(resolveTimelineMaskVisualFlags({
      derived: { valid: true, selectedVisible: false, current: true, link: { linked: false, role: 'none', groupId: null, directSelected: false, directSelectedVisible: false, selectedByFrame: false, selectedByFrameVisible: false, structural: false, structuralVisible: false } },
      legacySelected: false,
      legacyActive: false,
    }).active).toBe(false)
    expect(resolveTimelineMaskVisualFlags({
      derived: { valid: false, selectedVisible: false, current: true, link: { linked: true, role: 'member', groupId: null, directSelected: false, directSelectedVisible: false, selectedByFrame: false, selectedByFrameVisible: false, structural: true, structuralVisible: true } },
      legacySelected: true,
      legacyActive: true,
    })).toEqual({ selected: true, active: true })
  })

  it('derives one active layer/frame and the current cel without any DOM state', () => {
    const state = deriveAnimationTimelineVisualState({
      rows,
      frames,
      cells,
      selection: { activeLayerId: 'layer-a', activeFrameId: 'f2' },
    })

    expect(state.rows.find((row) => row.row.id === 'layer-a')?.active).toBe(true)
    expect(state.frames.find((frame) => frame.frame.id === 'f2')?.active).toBe(true)
    expect(cell(state, 'layer-a:f2').current).toBe(true)
    expect(cell(state, 'layer-a:f1').current).toBe(false)
    expect(cell(state, 'layer-a:f2').priority).toBe('current-cel')
  })

  it('supports single and multiple frame selection and derives the frame×layer cross product', () => {
    const state = deriveAnimationTimelineVisualState({
      rows,
      frames,
      cells,
      selection: {
        activeLayerId: 'layer-a',
        activeFrameId: 'f1',
        selectedLayerIds: ['layer-a'],
        selectedFrameIds: ['f1', 'f3'],
      },
    })

    expect(state.normalizedSelection.selectedFrameIds).toEqual(['f1', 'f3'])
    expect(cell(state, 'layer-a:f1').selectedByFrameAndLayer).toBe(true)
    expect(cell(state, 'layer-a:f3').selectedByFrameAndLayer).toBe(true)
    expect(cell(state, 'layer-b:f1').selectedByFrameAndLayer).toBe(false)
    expect(cell(state, 'layer-a:f1').priority).toBe('selected-frame-layer')
  })

  it('derives temporary drag selection from the supplied snapshot', () => {
    const state = deriveAnimationTimelineVisualState({
      rows,
      frames,
      cells,
      selection: {
        activeLayerId: 'layer-a',
        activeFrameId: 'f1',
        selectedFrameIds: ['f3'],
      },
    })

    expect(state.frames.find((frame) => frame.frame.id === 'f3')?.selected).toBe(true)
    expect(cell(state, 'layer-a:f3').selectedByFrame).toBe(true)
    expect(cell(state, 'layer-a:f1').selectedByFrame).toBe(false)
  })

  it('supports single and multiple ordinary cel selection without clearing formal frame/layer selection', () => {
    const state = deriveAnimationTimelineVisualState({
      rows,
      frames,
      cells,
      selection: {
        activeLayerId: 'layer-a',
        activeFrameId: 'f2',
        selectedLayerIds: ['layer-a', 'layer-b'],
        selectedFrameIds: ['f1'],
        selectedCellKeys: ['layer-a:f1', 'layer-b:f1'],
      },
    })

    expect(state.normalizedSelection.selectedLayerIds).toEqual(['layer-a', 'layer-b'])
    expect(state.normalizedSelection.selectedCellKeys).toEqual(['layer-a:f1', 'layer-b:f1'])
    expect(cell(state, 'layer-a:f1').explicitSelected).toBe(true)
    expect(cell(state, 'layer-b:f1').explicitSelected).toBe(true)
    expect(cell(state, 'layer-a:f1').priority).toBe('selected-cel')
  })

  it('maps mask selection separately while using the same owner/frame slot model', () => {
    const state = deriveAnimationTimelineVisualState({
      rows,
      frames,
      cells,
      selection: {
        activeLayerId: 'layer-a',
        activeFrameId: 'f2',
        selectedMaskCellKeys: ['group-a:f1', 'group-a:f2'],
      },
    })

    expect(state.normalizedSelection.selectedMaskCellKeys).toEqual(['group-a:f1', 'group-a:f2'])
    expect(cell(state, 'group-a:f1', 'mask').explicitSelected).toBe(true)
    expect(cell(state, 'group-a:f2', 'mask').explicitSelected).toBe(true)
    expect(cell(state, 'group-a:f1', 'mask').kind).toBe('mask')
    expect(state.cells.find((candidate) => candidate.key === 'group-a:f1' && candidate.kind === 'cel')).toBeUndefined()
  })

  it('keeps mask selection direct when ordinary cel selection is implicit', () => {
    const state = deriveAnimationTimelineVisualState({
      rows,
      frames,
      cells,
      selection: {
        activeLayerId: 'layer-a',
        activeFrameId: 'f1',
        selectedMaskCellKeys: ['group-a:f2'],
        animationCellSelectionExplicit: false,
      },
    })

    expect(cell(state, 'group-a:f2', 'mask').explicitSelected).toBe(true)
    expect(cell(state, 'group-a:f2', 'mask').selectedVisible).toBe(true)
    expect(cell(state, 'group-a:f1', 'mask').link.directSelected).toBe(true)
  })

  it('derives linked source/member groups, selected propagation, and cross-frame connectors', () => {
    const state = deriveAnimationTimelineVisualState({
      rows,
      frames,
      cells,
      selection: {
        activeLayerId: 'layer-a',
        activeFrameId: 'f2',
        selectedCellKeys: ['layer-a:f2'],
      },
    })

    expect(cell(state, 'layer-a:f1').link.role).toBe('source')
    expect(cell(state, 'layer-a:f2').link.role).toBe('member')
    expect(cell(state, 'layer-a:f2').link.directSelected).toBe(true)
    expect(cell(state, 'layer-a:f3').link.directSelected).toBe(true)
    expect(cell(state, 'layer-a:f3').link.directSelectedVisible).toBe(true)
    expect(cell(state, 'layer-a:f3').link.selectedByFrame).toBe(false)
    expect(cell(state, 'layer-a:f3').link.structural).toBe(true)
    expect(cell(state, 'layer-a:f3').link.structuralVisible).toBe(true)
    expect(state.connectors).toEqual(expect.arrayContaining([
      expect.objectContaining({ fromKey: 'layer-a:f1', toKey: 'layer-a:f2', groupId: 'a1', directSelected: true, directSelectedVisible: true }),
      expect.objectContaining({ fromKey: 'layer-a:f2', toKey: 'layer-a:f3', groupId: 'a1', directSelected: true, directSelectedVisible: true }),
    ]))
  })

  it('distinguishes frame-only linked highlighting from direct cel selection', () => {
    const state = deriveAnimationTimelineVisualState({
      rows,
      frames,
      cells,
      selection: {
        activeLayerId: 'layer-b',
        activeFrameId: 'f1',
        selectedFrameIds: ['f2'],
      },
    })

    expect(cell(state, 'layer-a:f1').link.directSelected).toBe(false)
    expect(cell(state, 'layer-a:f2').link.directSelected).toBe(false)
    expect(cell(state, 'layer-a:f1').link.selectedByFrame).toBe(true)
    expect(cell(state, 'layer-a:f1').link.selectedByFrameVisible).toBe(true)
    expect(cell(state, 'layer-a:f2').priority).toBe('selected-frame')
    expect(cell(state, 'layer-a:f1').link.structuralVisible).toBe(true)
  })

  it('hides temporary selection/link presentation while keeping formal selection intact', () => {
    const state = deriveAnimationTimelineVisualState({
      rows,
      frames,
      cells,
      selection: {
        activeLayerId: 'layer-a',
        activeFrameId: 'f2',
        selectedCellKeys: ['layer-a:f2'],
      },
      presentation: { presentationHidden: true },
    })

    expect(state.selectionGuidesVisible).toBe(false)
    expect(state.normalizedSelection.selectedCellKeys).toEqual(['layer-a:f2'])
    expect(cell(state, 'layer-a:f2').explicitSelected).toBe(true)
    expect(cell(state, 'layer-a:f2').selectedVisible).toBe(false)
    expect(cell(state, 'layer-a:f2').current).toBe(true)
    expect(cell(state, 'layer-a:f2').priority).toBe('current-cel')
    expect(state.connectors.every((connector) => connector.visible === true)).toBe(true)
    expect(state.connectors.every((connector) => connector.directSelectedVisible === false)).toBe(true)
    expect(state.connectors.every((connector) => connector.selectedByFrameVisible === false)).toBe(true)
  })

  it('keeps selection guides visible during playback while active context follows the playhead', () => {
    const state = deriveAnimationTimelineVisualState({
      rows,
      frames,
      cells,
      selection: {
        activeLayerId: 'layer-a',
        activeFrameId: 'f3',
        selectedFrameIds: ['f1', 'f2'],
        selectedCellKeys: ['layer-a:f1'],
      },
      presentation: { playing: true },
    })

    expect(state.selectionGuidesVisible).toBe(true)
    expect(cell(state, 'layer-a:f1').explicitSelected).toBe(true)
    expect(cell(state, 'layer-a:f1').selectedVisible).toBe(true)
    expect(cell(state, 'layer-a:f3').activeFrame).toBe(true)
    expect(cell(state, 'layer-a:f3').current).toBe(true)
    expect(cell(state, 'layer-a:f3').link.structuralVisible).toBe(true)
  })

  it('marks invalid active layer/frame deterministically and never classifies a cell as current', () => {
    const state = deriveAnimationTimelineVisualState({
      rows,
      frames,
      cells,
      selection: { activeLayerId: 'missing-layer', activeFrameId: 'missing-frame' },
    })

    expect(state.normalizedSelection.activeLayerId).toBeNull()
    expect(state.normalizedSelection.activeFrameId).toBeNull()
    expect(state.normalizedSelection.staleActiveLayerId).toBe('missing-layer')
    expect(state.normalizedSelection.staleActiveFrameId).toBe('missing-frame')
    expect(state.rows.every((row) => row.active === false)).toBe(true)
    expect(state.frames.every((frame) => frame.active === false)).toBe(true)
    expect(state.cells.every((candidate) => candidate.current === false)).toBe(true)
  })

  it('keeps implicit layer-derived cel keys separate from direct cel selection', () => {
    const state = deriveAnimationTimelineVisualState({
      rows,
      frames,
      cells,
      selection: {
        activeLayerId: 'layer-a',
        activeFrameId: 'f1',
        selectedLayerIds: ['layer-a'],
        selectedCellKeys: ['layer-a:f1'],
        animationCellSelectionExplicit: false,
      },
    })

    expect(state.normalizedSelection.animationCellSelectionExplicit).toBe(false)
    expect(state.normalizedSelection.selectedCellKeys).toEqual(['layer-a:f1'])
    expect(cell(state, 'layer-a:f1').explicitSelected).toBe(false)
    expect(cell(state, 'layer-a:f1').selectedByLayer).toBe(true)
    expect(cell(state, 'layer-a:f1').priority).toBe('current-cel')
  })

  it('does not treat an implicit empty slot as a direct cel selection', () => {
    const state = deriveAnimationTimelineVisualState({
      rows,
      frames,
      cells,
      selection: {
        activeLayerId: 'layer-b',
        activeFrameId: 'f2',
        selectedLayerIds: ['layer-b'],
        selectedCellKeys: ['layer-b:f2'],
        animationCellSelectionExplicit: false,
      },
    })

    const emptySlot = cell(state, 'layer-b:f2')
    expect(emptySlot.valid).toBe(true)
    expect(emptySlot.explicitSelected).toBe(false)
    expect(emptySlot.selectedByLayer).toBe(true)
  })

  it('emits adjacent and bridged connectors, marking only gaps as bridged', () => {
    const sparseFrames = [{ id: 'f1' }, { id: 'f2' }, { id: 'f3' }, { id: 'f4' }]
    const sparseCells: TimelineVisualCell[] = [
      { id: 's1', key: 'layer-a:f1', ownerId: 'layer-a', ownerKind: 'layer', frameId: 'f1', kind: 'cel' },
      { id: 's3', key: 'layer-a:f3', ownerId: 'layer-a', ownerKind: 'layer', frameId: 'f3', kind: 'cel', linkSourceId: 's1' },
      { id: 's4', key: 'layer-a:f4', ownerId: 'layer-a', ownerKind: 'layer', frameId: 'f4', kind: 'cel', linkSourceId: 's1' },
    ]
    const state = deriveAnimationTimelineVisualState({
      rows,
      frames: sparseFrames,
      cells: sparseCells,
      selection: { activeLayerId: 'layer-a', activeFrameId: 'f1' },
    })

    expect(state.connectors).toEqual([
      expect.objectContaining({ fromKey: 'layer-a:f1', toKey: 'layer-a:f3', bridged: true }),
      expect.objectContaining({ fromKey: 'layer-a:f3', toKey: 'layer-a:f4', bridged: false }),
    ])
  })

  it('keeps large timelines indexed without regressing linked selection propagation', () => {
    const largeFrames = Array.from({ length: 1200 }, (_, index) => ({ id: `frame-${index}` }))
    const largeCells: TimelineVisualCell[] = largeFrames.map((frame, index) => ({
      id: `large-${index}`,
      key: `layer-a:${frame.id}`,
      ownerId: 'layer-a',
      ownerKind: 'layer',
      frameId: frame.id,
      kind: 'cel',
      ...(index > 0 ? { linkSourceId: 'large-0' } : {}),
    }))
    const state = deriveAnimationTimelineVisualState({
      rows: [rows[0]],
      frames: largeFrames,
      cells: largeCells,
      selection: { activeLayerId: 'layer-a', activeFrameId: 'frame-0', selectedCellKeys: ['layer-a:frame-1199'] },
    })

    expect(state.cells).toHaveLength(1200)
    expect(state.cells.at(-1)?.link.directSelected).toBe(true)
    expect(state.connectors).toHaveLength(1199)
  })

  it('filters stale frame/cel/mask keys and malformed keys deterministically', () => {
    const state = deriveAnimationTimelineVisualState({
      rows,
      frames,
      cells,
      selection: {
        activeLayerId: 'layer-a',
        activeFrameId: 'f1',
        selectedFrameIds: ['f2', 'missing-frame', 'f2'],
        selectedCellKeys: ['layer-a:f1', 'layer-a:missing-frame', 'bad-key'],
        selectedMaskCellKeys: ['group-a:f1', 'group-a:f3', 'missing'],
      },
    })

    expect(state.normalizedSelection.selectedFrameIds).toEqual(['f2'])
    expect(state.normalizedSelection.staleFrameIds).toEqual(['missing-frame'])
    expect(state.normalizedSelection.selectedCellKeys).toEqual(['layer-a:f1'])
    expect(state.normalizedSelection.staleCellKeys).toEqual(['layer-a:missing-frame', 'bad-key'])
    expect(state.normalizedSelection.selectedMaskCellKeys).toEqual(['group-a:f1'])
    expect(state.normalizedSelection.staleMaskCellKeys).toEqual(['group-a:f3', 'missing'])
  })

  it('does not leak the previous snapshot when switching frames', () => {
    const before = deriveAnimationTimelineVisualState({
      rows,
      frames,
      cells,
      selection: { activeLayerId: 'layer-a', activeFrameId: 'f3' },
    })
    const after = deriveAnimationTimelineVisualState({
      rows,
      frames,
      cells,
      selection: { activeLayerId: 'layer-a', activeFrameId: 'f1' },
    })

    expect(cell(before, 'layer-a:f3').activeFrame).toBe(true)
    expect(cell(after, 'layer-a:f3').activeFrame).toBe(false)
    expect(cell(after, 'layer-a:f1').activeFrame).toBe(true)
    expect(cell(after, 'layer-a:f3').current).toBe(false)
  })

  it('keeps cel links same-layer and resolves cross-frame members canonically', () => {
    const state = deriveAnimationTimelineVisualState({
      rows: [rows[0], rows[1]],
      frames,
      cells: [
        { id: 'root', key: 'layer-a:f1', ownerId: 'layer-a', ownerKind: 'layer', frameId: 'f1', kind: 'cel' },
        { id: 'member', key: 'layer-a:f2', ownerId: 'layer-a', ownerKind: 'layer', frameId: 'f2', kind: 'cel', linkSourceId: 'root' },
        { id: 'cross-layer', key: 'layer-b:f2', ownerId: 'layer-b', ownerKind: 'layer', frameId: 'f2', kind: 'cel', linkSourceId: 'root' },
      ],
      selection: { activeLayerId: 'layer-a', activeFrameId: 'f2', selectedCellKeys: ['layer-a:f2'] },
    })

    expect(cell(state, 'layer-a:f2').link.role).toBe('member')
    expect(cell(state, 'layer-a:f2').link.groupId).toBe('root')
    expect(cell(state, 'layer-a:f2').link.directSelected).toBe(true)
    expect(cell(state, 'layer-b:f2').link.role).toBe('stale')
    expect(cell(state, 'layer-b:f2').link.groupId).toBeNull()
    expect(state.connectors).toHaveLength(1)
  })

  it('marks missing and cyclic links stale without propagating selection', () => {
    const state = deriveAnimationTimelineVisualState({
      rows: [rows[0]],
      frames,
      cells: [
        { id: 'cycle-a', key: 'layer-a:f1', ownerId: 'layer-a', ownerKind: 'layer', frameId: 'f1', kind: 'cel', linkSourceId: 'cycle-b' },
        { id: 'cycle-b', key: 'layer-a:f2', ownerId: 'layer-a', ownerKind: 'layer', frameId: 'f2', kind: 'cel', linkSourceId: 'cycle-a' },
        { id: 'missing', key: 'layer-a:f3', ownerId: 'layer-a', ownerKind: 'layer', frameId: 'f3', kind: 'cel', linkSourceId: 'not-present' },
      ],
      selection: { activeLayerId: 'layer-a', activeFrameId: 'f1', selectedCellKeys: ['layer-a:f1'] },
    })

    expect(cell(state, 'layer-a:f1').link.role).toBe('stale')
    expect(cell(state, 'layer-a:f2').link.role).toBe('stale')
    expect(cell(state, 'layer-a:f3').link.role).toBe('stale')
    expect(state.connectors).toEqual([])
  })

  it('isolates group masks from cel masks while resolving mask chains', () => {
    const maskRows: TimelineVisualRow[] = [
      rows[0],
      { id: 'layer-a-mask', ownerId: 'layer-a', ownerKind: 'layer', kind: 'mask' },
      { id: 'layer-b-mask', ownerId: 'layer-b', ownerKind: 'layer', kind: 'mask' },
      rows[2],
    ]
    const state = deriveAnimationTimelineVisualState({
      rows: maskRows,
      frames,
      cells: [
        { id: 'cel-mask-root', key: 'layer-a:f1', ownerId: 'layer-a', ownerKind: 'layer', frameId: 'f1', kind: 'mask' },
        { id: 'cel-mask-member', key: 'layer-a:f2', ownerId: 'layer-a', ownerKind: 'layer', frameId: 'f2', kind: 'mask', linkSourceId: 'cel-mask-root' },
        { id: 'cel-mask-cross-owner', key: 'layer-b:f3', ownerId: 'layer-b', ownerKind: 'layer', frameId: 'f3', kind: 'mask', linkSourceId: 'cel-mask-root' },
        { id: 'group-mask', key: 'group-a:f1', ownerId: 'group-a', ownerKind: 'group', frameId: 'f1', kind: 'mask' },
        { id: 'cross-kind', key: 'group-a:f2', ownerId: 'group-a', ownerKind: 'group', frameId: 'f2', kind: 'mask', linkSourceId: 'cel-mask-root' },
      ],
      selection: { activeLayerId: 'layer-a', activeFrameId: 'f2', selectedMaskCellKeys: ['layer-a:f2'] },
    })

    expect(cell(state, 'layer-a:f2', 'mask').link.role).toBe('member')
    expect(cell(state, 'layer-a:f2', 'mask').link.directSelected).toBe(true)
    expect(cell(state, 'layer-b:f3', 'mask').link.role).toBe('member')
    expect(cell(state, 'group-a:f2', 'mask').link.role).toBe('stale')
    expect(state.connectors).toHaveLength(2)
  })

  it('does not activate an owner layer when only its mask cell is selected', () => {
    const state = deriveAnimationTimelineVisualState({
      rows: [rows[0], { id: 'layer-a-mask', ownerId: 'layer-a', ownerKind: 'layer', kind: 'mask' }],
      frames,
      cells: [
        { id: 'cel', key: 'layer-a:f1', ownerId: 'layer-a', ownerKind: 'layer', frameId: 'f1', kind: 'cel' },
        { id: 'mask', key: 'layer-a:f1', ownerId: 'layer-a', ownerKind: 'layer', frameId: 'f1', kind: 'mask' },
      ],
      selection: { activeLayerId: null, activeFrameId: 'f1', selectedMaskCellKeys: ['layer-a:f1'] },
    })
    const ownerRow = state.rows.find((entry) => entry.row.kind === 'layer')
    const maskRow = state.rows.find((entry) => entry.row.kind === 'mask')
    expect(ownerRow?.active).toBe(false)
    expect(ownerRow?.selectedByCell).toBe(false)
    expect(maskRow?.selectedByCell).toBe(true)
    expect(cell(state, 'layer-a:f1', 'cel').current).toBe(false)
    expect(cell(state, 'layer-a:f1', 'mask').explicitSelected).toBe(true)
  })

  it('highlights mask cells for a selected frame even when the mask slot is empty', () => {
    const state = deriveAnimationTimelineVisualState({
      rows: [rows[0], { id: 'layer-a-mask', ownerId: 'layer-a', ownerKind: 'layer', kind: 'mask' }],
      frames,
      cells: [
        { id: 'cel', key: 'layer-a:f1', ownerId: 'layer-a', ownerKind: 'layer', frameId: 'f1', kind: 'cel' },
        { id: 'mask', key: 'layer-a:f1', ownerId: 'layer-a', ownerKind: 'layer', frameId: 'f1', kind: 'mask' },
      ],
      selection: { activeLayerId: null, activeFrameId: 'f1', selectedFrameIds: ['f2'] },
    })
    expect(state.frames.find((entry) => entry.frame.id === 'f2')?.selected).toBe(true)
    expect(cell(state, 'layer-a:f2', 'mask').valid).toBe(false)
    expect(cell(state, 'layer-a:f2', 'mask').selectedByFrame).toBe(true)
  })

  it('keeps duplicate linked members deterministic and connectors unique', () => {
    const state = deriveAnimationTimelineVisualState({
      rows: [rows[0]],
      frames,
      cells: [
        { id: 'root', key: 'layer-a:f1', ownerId: 'layer-a', ownerKind: 'layer', frameId: 'f1', kind: 'cel' },
        { id: 'member-a', key: 'layer-a:f2', ownerId: 'layer-a', ownerKind: 'layer', frameId: 'f2', kind: 'cel', linkSourceId: 'root' },
        { id: 'member-b', key: 'layer-a:f2', ownerId: 'layer-a', ownerKind: 'layer', frameId: 'f2', kind: 'cel', linkSourceId: 'root' },
      ],
      selection: { activeLayerId: 'layer-a', activeFrameId: 'f1' },
    })

    expect(state.cells.filter((candidate) => candidate.key === 'layer-a:f2' && candidate.kind === 'cel')).toHaveLength(1)
    expect(state.connectors).toHaveLength(1)
  })

  it('handles a 10k-frame indexed snapshot without resolver recursion', () => {
    const largeFrames = Array.from({ length: 10_000 }, (_, index) => ({ id: `frame-${index}` }))
    const state = deriveAnimationTimelineVisualState({
      rows: [rows[0]],
      frames: largeFrames,
      cells: [
        { id: 'large-root', key: 'layer-a:frame-0', ownerId: 'layer-a', ownerKind: 'layer', frameId: 'frame-0', kind: 'cel' },
        { id: 'large-last', key: 'layer-a:frame-9999', ownerId: 'layer-a', ownerKind: 'layer', frameId: 'frame-9999', kind: 'cel', linkSourceId: 'large-root' },
      ],
      selection: { activeLayerId: 'layer-a', activeFrameId: 'frame-9999', selectedCellKeys: ['layer-a:frame-9999'] },
    })

    expect(state.cells).toHaveLength(10_000)
    expect(state.connectors).toHaveLength(1)
    expect(state.cells.at(-1)?.link.directSelected).toBe(true)
  })

  it('compresses a 10k-member link chain to linear resolution', () => {
    const count = 10_000
    const chainFrames = Array.from({ length: count }, (_, index) => ({ id: `chain-${index}` }))
    const chainCells: TimelineVisualCell[] = chainFrames.map((frame, index) => ({
      id: `chain-cell-${index}`,
      key: `layer-a:${frame.id}`,
      ownerId: 'layer-a',
      ownerKind: 'layer' as const,
      frameId: frame.id,
      kind: 'cel' as const,
      ...(index > 0 ? { linkSourceId: `chain-cell-${index - 1}` } : {}),
    }))
    const state = deriveAnimationTimelineVisualState({
      rows: [rows[0]],
      frames: chainFrames,
      cells: chainCells,
      selection: { activeLayerId: 'layer-a', activeFrameId: 'chain-9999', selectedCellKeys: ['layer-a:chain-9999'] },
    })

    expect(state.connectors).toHaveLength(count - 1)
    expect(state.cells.at(-1)?.link.groupId).toBe('chain-cell-0')
    expect(state.cells.at(-1)?.link.directSelected).toBe(true)
  })

  it('keeps typed cel and mask ids isolated when malformed ids collide', () => {
    const state = deriveAnimationTimelineVisualState({
      rows: [rows[0], { id: 'layer-a-mask', ownerId: 'layer-a', ownerKind: 'layer', kind: 'mask' }],
      frames,
      cells: [
        { id: 'same-id', key: 'layer-a:f1', ownerId: 'layer-a', ownerKind: 'layer', frameId: 'f1', kind: 'cel' },
        { id: 'cel-member', key: 'layer-a:f2', ownerId: 'layer-a', ownerKind: 'layer', frameId: 'f2', kind: 'cel', linkSourceId: 'same-id' },
        { id: 'same-id', key: 'layer-a:f1', ownerId: 'layer-a', ownerKind: 'layer', frameId: 'f1', kind: 'mask' },
        { id: 'mask-member', key: 'layer-a:f2', ownerId: 'layer-a', ownerKind: 'layer', frameId: 'f2', kind: 'mask', linkSourceId: 'same-id' },
      ],
      selection: { activeLayerId: 'layer-a', activeFrameId: 'f2', selectedMaskCellKeys: ['layer-a:f2'] },
    })

    expect(cell(state, 'layer-a:f2', 'cel').link.role).toBe('member')
    expect(cell(state, 'layer-a:f2', 'mask').link.role).toBe('member')
    expect(state.connectors.filter((connector) => connector.kind === 'cel')).toHaveLength(1)
    expect(state.connectors.filter((connector) => connector.kind === 'mask')).toHaveLength(1)
  })

  it('uses first-wins for same-kind duplicate ids across different slots', () => {
    const state = deriveAnimationTimelineVisualState({
      rows: [rows[0]],
      frames,
      cells: [
        { id: 'duplicate', key: 'layer-a:f1', ownerId: 'layer-a', ownerKind: 'layer', frameId: 'f1', kind: 'cel' },
        { id: 'duplicate', key: 'layer-a:f2', ownerId: 'layer-a', ownerKind: 'layer', frameId: 'f2', kind: 'cel', linkSourceId: 'duplicate' },
      ],
      selection: { activeLayerId: 'layer-a', activeFrameId: 'f1' },
    })

    expect(cell(state, 'layer-a:f1').cell?.id).toBe('duplicate')
    expect(cell(state, 'layer-a:f2').cell).toBeNull()
    expect(state.connectors).toEqual([])
  })

  it('pre-aggregates selected owners for wide row sets', () => {
    const wideRows: TimelineVisualRow[] = Array.from({ length: 200 }, (_, index) => ({
      id: `layer-${index}`,
      ownerId: `layer-${index}`,
      ownerKind: 'layer',
      kind: 'layer',
    }))
    const wideFrames = [{ id: 'f1' }, { id: 'f2' }]
    const wideCells: TimelineVisualCell[] = [
      ...wideRows.map((row) => ({ id: `${row.ownerId}-f1`, key: `${row.ownerId}:f1`, ownerId: row.ownerId, ownerKind: 'layer' as const, frameId: 'f1', kind: 'cel' as const })),
      { id: 'mask-wide', key: 'layer-0:f2', ownerId: 'layer-0', ownerKind: 'layer' as const, frameId: 'f2', kind: 'mask' as const },
    ]
    const state = deriveAnimationTimelineVisualState({
      rows: [...wideRows, { id: 'layer-0-mask', ownerId: 'layer-0', ownerKind: 'layer', kind: 'mask' }],
      frames: wideFrames,
      cells: wideCells,
      selection: {
        activeLayerId: 'layer-0',
        activeFrameId: 'f1',
        selectedFrameIds: ['f1'],
        selectedCellKeys: wideRows.map((row) => `${row.ownerId}:f1`),
        selectedMaskCellKeys: ['layer-0:f2'],
      },
      presentation: { presentationHidden: true },
    })

    expect(state.rows.find((row) => row.row.ownerId === 'layer-199')?.selectedByCell).toBe(true)
    expect(state.rows.find((row) => row.row.ownerId === 'layer-199')?.selectedByFrame).toBe(true)
    expect(state.rows.find((row) => row.row.ownerId === 'layer-0' && row.row.kind === 'mask')?.selectedByCell).toBe(true)
    expect(state.selectionGuidesVisible).toBe(false)
    expect(state.cells.find((cell) => cell.key === 'layer-0:f1' && cell.kind === 'cel')?.explicitSelected).toBe(true)
  })
})
