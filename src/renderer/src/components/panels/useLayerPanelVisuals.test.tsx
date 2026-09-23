import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { createDocument, createLayer } from '@/core/document-model'
import { animationCelKey, ensureAnimationDocument } from '@/core/animation'
import { useWorkspace } from '@/store/workspace'
import { deriveLayerPanelVisuals, type LayerPanelVisualOptions } from './deriveLayerPanelVisuals'
import { createLayerPanelStructure } from './layer-panel-structure'
import { useLayerPanelVisuals } from './useLayerPanelVisuals'
import { createTimelineVisualCellCache } from '@/core/animation-timeline-cell-cache'

afterEach(() => { cleanup(); useWorkspace.setState({sessions: [], activeId: null}) })

const visualData = (value: ReturnType<typeof deriveLayerPanelVisuals>) =>
  Object.fromEntries(Object.entries(value).filter(([, entry]) => typeof entry !== 'function'))

function setup(layerCount = 4, frameCount = 12): LayerPanelVisualOptions {
  const doc = createDocument('timeline cache', 1, 1, 'rgba')
  for (let i = 1; i < layerCount; i++) doc.layers.push(createLayer(`Layer ${i}`, 1, 1, 'rgba'))
  const timeline = ensureAnimationDocument(doc)
  timeline.frames = Array.from({length: frameCount}, (_, i) => ({id: `f${i}`, duration: 100}))
  timeline.activeFrameId = 'f0'
  timeline.cels = doc.layers.flatMap(layer => timeline.frames.map((frame, i) => ({
    id: `${layer.id}-${frame.id}`, layerId: layer.id, frameId: frame.id,
    linkedCelId: i % 3 === 1 ? `${layer.id}-f${i - 1}` : null
  })))
  useWorkspace.getState().addSession(doc)
  const session = useWorkspace.getState().sessions[0]
  const keys = doc.layers.slice(0, 2).flatMap(layer => timeline.frames.slice(0, 3).map(frame => animationCelKey(layer.id, frame.id)))
  session.selectedAnimationCellKeys = keys
  session.animationCellSelectionExplicit = true
  return { session, timeline, timelineActiveContext: session.timelineActiveContext,
    animationGestureActiveTarget: null, animationGestureSelection: null, selectionOutlineVisible: true,
    selectedAnimationGroupCellKeys: [], animationCellSelectionOutlineVisible: true,
    animationCelDragAnchorKey: keys[0], animationCelDropTargetKey: keys[0],
    gesture: {kind: 'cel', button: 0, sourceAnchorKey: keys[0], cellKeys: keys, preserveSelection: false,
      startX: 0, startY: 0, moved: true, canMove: true, pendingSelection: false, longPressed: false,
      longPressTimer: null, lastSelectionTarget: keys[0]}
  }
}

it('reuses the grid during movement while matching uncached preview and link semantics', () => {
  const options = setup()
  const {result, rerender} = renderHook(useLayerPanelVisuals, {initialProps: options})
  const initial = result.current
  for (const frame of options.timeline.frames.slice(3, 8)) {
    const next = {...options, animationCelDropTargetKey: animationCelKey(options.session.document.layers[1].id, frame.id)}
    rerender(next)
    expect(result.current.timelineVisualState).toBe(initial.timelineVisualState)
    expect(result.current.linkedCelBlocks).toBe(initial.linkedCelBlocks)
    expect(visualData(result.current)).toEqual(visualData(deriveLayerPanelVisuals(next)))
  }
  rerender({...options, animationGestureSelection: {kind: 'cel', keys: [options.animationCelDragAnchorKey!]}})
  expect(result.current.timelineVisualState).not.toBe(initial.timelineVisualState)
  expect(result.current.displayRows).toBe(initial.displayRows)
})

it('invalidates topology for in-place content/metadata edits and collapsed groups', () => {
  const options = setup()
  const {session, timeline} = options
  const {result, rerender} = renderHook(useLayerPanelVisuals, {initialProps: options})
  for (const change of [
    () => { timeline.cels[1].linkedCelId = null; session.contentRevision++ },
    () => { timeline.frames.reverse(); session.layersPanelRevision++ },
    () => { session.document.groups.push({id: 'g', name: 'G', visible: true, locked: false, opacity: 1, blendMode: 'normal'}); session.document.layers[0].groupId = 'g'; session.layersPanelRevision++ },
    () => { session.collapsedGroupIds = ['g'] }
  ]) {
    const oldRows = result.current.displayRows
    change()
    rerender({...options})
    expect(result.current.displayRows).not.toBe(oldRows)
    expect(visualData(result.current)).toEqual(visualData(deriveLayerPanelVisuals(options)))
  }
})

it.each(['frame', 'cel'] as const)('reuses link geometry while extending a %s marquee and refreshes it after unlinking', kind => {
  const options = {...setup(), gesture: null, animationCelDropTargetKey: null}
  const {session, timeline} = options
  const layerId = session.document.layers[0].id
  const range = (frameIds: string[]) => ({...options, animationGestureSelection: kind === 'frame'
    ? {kind: 'frame' as const, ids: frameIds}
    : {kind: 'cel' as const, keys: frameIds.map(id => animationCelKey(layerId, id))}})
  const {result, rerender} = renderHook(useLayerPanelVisuals, {initialProps: range(['f0'])})
  const members = result.current.linkedCelMemberKeys
  const maskSlots = result.current.linkedMaskSlotVisuals
  expect(result.current.selectedLinkedCelMemberKeys.has(`cel|${layerId}:f1`)).toBe(true)
  rerender(range(['f2']))
  expect(result.current.linkedCelMemberKeys).toBe(members)
  expect(result.current.linkedMaskSlotVisuals).toBe(maskSlots)
  expect(result.current.selectedLinkedCelMemberKeys.has(`cel|${layerId}:f1`)).toBe(false)
  rerender(range(['f0', 'f1', 'f2']))
  expect(result.current.linkedCelMemberKeys).toBe(members)
  expect(result.current.selectedLinkedCelMemberKeys.has(`cel|${layerId}:f1`)).toBe(true)
  timeline.cels[1].linkedCelId = null
  session.contentRevision++
  rerender(range(['f0', 'f1', 'f2']))
  expect(result.current.linkedCelMemberKeys).not.toBe(members)
  expect(result.current.linkedCelMemberKeys.has(`cel|${layerId}:f1`)).toBe(false)
})

it('measures repeated movement and range selection on a 24 by 120 timeline', () => {
  const options = setup(24, 120)
  const targets = options.timeline.frames.slice(10, 30).map(frame => ({...options,
    animationCelDropTargetKey: animationCelKey(options.session.document.layers[2].id, frame.id)}))
  const {result, rerender} = renderHook(useLayerPanelVisuals, {initialProps: options})
  const grid = result.current.timelineVisualState
  const measure = (run: () => void) => { const start = performance.now(); run(); return performance.now() - start }
  const baseline = measure(() => { for (const target of targets) deriveLayerPanelVisuals(target) })
  const cached = measure(() => { for (const target of targets) rerender(target) })
  expect(result.current.timelineVisualState).toBe(grid)
  const structure = createLayerPanelStructure(options.session, options.timeline)
  const ranges = targets.map((target, i) => ({...target, animationGestureSelection: {
    kind: 'frame' as const, ids: options.timeline.frames.slice(0, i + 10).map(frame => frame.id)
  }}))
  const rangeBefore = measure(() => { for (const range of ranges) deriveLayerPanelVisuals(range) })
  const rangeAfter = measure(() => { for (const range of ranges) deriveLayerPanelVisuals({...range, structure}) })
  const cellStateCache = createTimelineVisualCellCache(structure.visualTopology)
  let previous = deriveLayerPanelVisuals({...ranges[0], structure, cellStateCache}).timelineVisualState.cells
  let reused = 0
  const rangeCached = measure(() => { for (const range of ranges) {
    const current = deriveLayerPanelVisuals({...range, structure, cellStateCache}).timelineVisualState.cells
    reused += current.filter((cell, index) => cell === previous[index]).length
    previous = current
  } })
  expect(reused).toBeGreaterThan(2880 * ranges.length * 0.9)
  expect(previous).toEqual(deriveLayerPanelVisuals({...ranges.at(-1)!, structure}).timelineVisualState.cells)
  process.stdout.write(`Range state cache: ${rangeAfter.toFixed(1)} -> ${rangeCached.toFixed(1)} ms; reused ${reused}/${2880 * ranges.length} cell states\n`)
  process.stdout.write(`Timeline 2880 slots / 20 updates: move ${baseline.toFixed(1)} -> ${cached.toFixed(1)} ms; range derivation ${rangeBefore.toFixed(1)} -> ${rangeAfter.toFixed(1)} ms\n`)
})


it('maps a cel range to sorted visible positions without including hidden or stale owners', () => {
  const options = setup()
  const doc = options.session.document
  const a = doc.layers[0].id, b = doc.layers[1].id
  doc.groups.push({id: 'g', name: 'Group', visible: true, locked: false, opacity: 1, blendMode: 'normal'})
  doc.layers[2].groupId = 'g'
  options.session.collapsedGroupIds = ['g']
  const keys = [animationCelKey(a, 'f2'), animationCelKey(b, 'f1'), animationCelKey(a, 'f0'),
    animationCelKey(a, 'f2'), animationCelKey(doc.layers[2].id, 'f1'), 'missing:f0', `${a}:missing`]
  const selectionOptions = {...options, gesture: null, animationCelDropTargetKey: null,
    animationGestureSelection: {kind: 'cel' as const, keys}}
  const {result} = renderHook(useLayerPanelVisuals, {initialProps: selectionOptions})
  const row = (id: string) => result.current.displayRows.findIndex(item => item.kind === 'node' && item.node.id === id)
  expect(result.current.selectedCelPositions).toEqual([
    {row: row(a), column: 0}, {row: row(a), column: 2}, {row: row(b), column: 1}
  ].sort((left, right) => left.row - right.row || left.column - right.column))
})
