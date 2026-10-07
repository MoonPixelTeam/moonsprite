import { mkdirSync, writeFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { expect, it } from 'vitest'
import { createTimelineVisualCellCache } from './animation-timeline-cell-cache'
import { createAnimationTimelineVisualTopology } from './animation-timeline-visual-topology'
import { createAnimationTimelineVisualIndex, deriveAnimationTimelineVisualState, type TimelineVisualRow, type TimelineVisualCell } from './animation-timeline-visual-state'

it('matches complete selection, mask, link and empty-slot semantics, including late reads of old snapshots', () => {
  const rows: TimelineVisualRow[] = [
    {id: 'a', ownerId: 'a', ownerKind: 'layer', kind: 'layer'},
    {id: 'b', ownerId: 'b', ownerKind: 'layer', kind: 'layer'},
    {id: 'g', ownerId: 'g', ownerKind: 'group', kind: 'group'},
    {id: 'mask-g', ownerId: 'g', ownerKind: 'group', kind: 'mask'}
  ]
  const frames = Array.from({length: 4}, (_, i) => ({id: `f${i}`}))
  const cells: TimelineVisualCell[] = [
    {id: 'a0', key: 'a:f0', ownerId: 'a', ownerKind: 'layer', frameId: 'f0', kind: 'cel'},
    {id: 'a3', key: 'a:f3', ownerId: 'a', ownerKind: 'layer', frameId: 'f3', kind: 'cel', linkSourceId: 'a0'},
    {id: 'm0', key: 'g:f0', ownerId: 'g', ownerKind: 'group', frameId: 'f0', kind: 'mask'},
    {id: 'm2', key: 'g:f2', ownerId: 'g', ownerKind: 'group', frameId: 'f2', kind: 'mask', linkSourceId: 'm0'},
    {id: 'stale', key: 'b:f1', ownerId: 'b', ownerKind: 'layer', frameId: 'f1', kind: 'cel', linkSourceId: 'missing'}
  ]
  const canonicalIndex = createAnimationTimelineVisualIndex(frames, cells)
  const topology = createAnimationTimelineVisualTopology(rows, frames, canonicalIndex)
  const cellStateCache = createTimelineVisualCellCache(topology)
  for (let i = 0; i < 128; i++) {
    const input = {rows, frames, cells, topology, canonicalIndex,
      selection: {activeLayerId: 'a', activeFrameId: `f${i % 4}`, selectedLayerIds: i & 1 ? ['a'] : [],
        selectedGroupIds: i & 2 ? ['g'] : [], selectedFrameIds: i & 4 ? ['f0', 'f2'] : [],
        selectedCellKeys: i & 8 ? ['a:f3', 'b:f2'] : [], selectedMaskCellKeys: i & 16 ? ['g:f2'] : [],
        animationCellSelectionExplicit: Boolean(i & 32)}, presentation: {presentationHidden: Boolean(i & 64)}}
    const complete = deriveAnimationTimelineVisualState(input)
    const deferred = deriveAnimationTimelineVisualState({...input, deferCellStates: true, cellStateCache})
    const next = deriveAnimationTimelineVisualState({...input, selection: {...input.selection, activeFrameId: 'f3', selectedCellKeys: ['b:f1']}, deferCellStates: true, cellStateCache})
    next.cellStateAt!(0) // Update the shared cache before reading the old snapshot.
    const {cellStateAt, ...metadata} = deferred
    expect(metadata).toEqual({...complete, cells: []})
    for (let j = topology.slots.length - 1; j >= 0; j--) {
      expect(cellStateAt!(j)).toEqual(complete.cells[j])
      expect(cellStateAt!(j)).toBe(cellStateAt!(j))
    }
    expect(cellStateAt!(-1)).toBeUndefined()
    expect(cellStateAt!(topology.slots.length)).toBeUndefined()
    expect(cellStateAt!(1.5)).toBeUndefined()
  }
})

it('bounds slot work to 300 visible cells in a sparse 100-layer, 1000-frame timeline', {timeout: 30000}, () => {
  const rows: TimelineVisualRow[] = Array.from({length: 100}, (_, i) => ({id: `l${i}`, ownerId: `l${i}`, ownerKind: 'layer', kind: 'layer'}))
  const frames = Array.from({length: 1000}, (_, i) => ({id: `f${i}`}))
  const cells: TimelineVisualCell[] = rows.map(row => ({id: `${row.id}-source`, key: `${row.id}:f0`, ownerId: row.ownerId, ownerKind: 'layer', frameId: 'f0', kind: 'cel'}))
  cells.push({id: 'last-linked', key: 'l0:f999', ownerId: 'l0', ownerKind: 'layer', frameId: 'f999', kind: 'cel', linkSourceId: 'l0-source'})
  const canonicalIndex = createAnimationTimelineVisualIndex(frames, cells)
  const topology = createAnimationTimelineVisualTopology(rows, frames, canonicalIndex)
  let slotReads = 0
  topology.slots = new Proxy(topology.slots, {get(target, key, receiver) {
    if (typeof key === 'string' && /^\d+$/.test(key)) slotReads++
    return Reflect.get(target, key, receiver)
  }})
  const sample = (deferCellStates: boolean) => {
    const times: number[] = [], cellStateCache = createTimelineVisualCellCache(topology)
    slotReads = 0
    for (let i = 0; i < 20; i++) {
      const started = performance.now()
      const state = deriveAnimationTimelineVisualState({rows, frames, cells, topology, canonicalIndex, cellStateCache, deferCellStates,
        selection: {activeLayerId: 'l0', activeFrameId: `f${i}`, selectedCellKeys: ['l0:f999']}})
      if (deferCellStates) for (let row = 0; row < 10; row++) for (let frame = 0; frame < 30; frame++) {
        const index = row * frames.length + frame
        const cell = state.cellStateAt!(index)!
        expect(cell.ownerId).toBe(`l${row}`)
        if (index === 0) expect(cell.link.directSelected).toBe(true) // Selection outside the viewport still propagates.
        state.cellStateAt!(index)
      }
      times.push(performance.now() - started)
    }
    times.sort((a, b) => a - b)
    return {medianMs: times[10], p95Ms: times[19], slotReads, retainedCellStates: cellStateCache.states.filter(Boolean).length}
  }
  const before = sample(false), after = sample(true)
  expect(before.slotReads).toBe(100 * 1000 * 20)
  expect(after.slotReads).toBe(300 * 20)
  expect(after.retainedCellStates).toBe(300)
  expect(after.medianMs).toBeLessThan(before.medianMs)
  const evidence = {layers: 100, frames: 1000, actualCels: cells.length, slots: 100000, visibleSlots: 300, updates: 20, before, after}
  mkdirSync('output/airattack-20261007-round4', {recursive: true})
  writeFileSync('output/airattack-20261007-round4/deferred-slot-evidence.json', JSON.stringify(evidence, null, 2))
  process.stdout.write(JSON.stringify(evidence) + '\n')
})
