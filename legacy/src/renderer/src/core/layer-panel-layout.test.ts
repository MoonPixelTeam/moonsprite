import { describe, expect, it } from 'vitest'
import { buildLayerPanelTree, getLayerPanelAncestorGroupIds, getLayerPanelDescendantGroupIds, layerIdsInVisualStackOrder, layerPanelRevealScrollTop, resolveLayerPanelDropTarget, resolveLayerPanelEdgeDropTarget, type LayerPanelNode } from './layer-panel-layout'

const layers = [
  { id: 'background', groupId: null },
  { id: 'body', groupId: 'characters' },
  { id: 'eyes', groupId: 'characters' },
  { id: 'highlight', groupId: 'face' }
]
const groups = [
  { id: 'characters', parentGroupId: null },
  { id: 'face', parentGroupId: 'characters' }
]

describe('layer panel layout helpers', () => {
  it('uses explicit edge targets above and below the list', () => {
    expect(resolveLayerPanelEdgeDropTarget(96, 100, 500)).toEqual({ kind: 'edge', edge: 'top' })
    expect(resolveLayerPanelEdgeDropTarget(504, 100, 500)).toEqual({ kind: 'edge', edge: 'bottom' })
    expect(resolveLayerPanelEdgeDropTarget(250, 100, 500)).toBeNull()
  })

  it('centers a revealed row below the sticky animation header', () => {
    expect(layerPanelRevealScrollTop({
      scrollTop: 120,
      viewportTop: 100,
      viewportHeight: 300,
      stickyHeaderHeight: 34,
      rowTop: 350,
      rowHeight: 42
    })).toBe(224)
  })
  it('flattens nested groups in top-to-bottom display order', () => {
    expect(buildLayerPanelTree({ layers, groups })).toEqual([
      { kind: 'group', id: 'characters', depth: 0 },
      { kind: 'group', id: 'face', depth: 1 },
      { kind: 'layer', id: 'highlight', depth: 2 },
      { kind: 'layer', id: 'eyes', depth: 1 },
      { kind: 'layer', id: 'body', depth: 1 },
      { kind: 'layer', id: 'background', depth: 0 }
    ])
  })

  it('keeps grouped layers individually addressable in topmost hit-test order', () => {
    expect(layerIdsInVisualStackOrder([
      { id: 'background', groupId: null },
      { id: 'group-bottom', groupId: 'group' },
      { id: 'group-top', groupId: 'group' }
    ], [{ id: 'group', parentGroupId: null }])).toEqual(['group-top', 'group-bottom', 'background'])
  })

  it('hides descendants when a group is collapsed', () => {
    expect(buildLayerPanelTree({ layers, groups, collapsedGroupIds: ['characters'] })).toEqual([
      { kind: 'group', id: 'characters', depth: 0 },
      { kind: 'layer', id: 'background', depth: 0 }
    ])
  })

  it('keeps empty groups ordered at the top of their container', () => {
    expect(buildLayerPanelTree({
      layers: [{ id: 'background', groupId: null }],
      groups: [{ id: 'older', parentGroupId: null }, { id: 'newer', parentGroupId: null }]
    })).toEqual([
      { kind: 'group', id: 'newer', depth: 0 },
      { kind: 'group', id: 'older', depth: 0 },
      { kind: 'layer', id: 'background', depth: 0 }
    ])
  })

  it('places an empty group between ordinary layers using its persisted anchor', () => {
    expect(buildLayerPanelTree({
      layers: [{ id: 'bottom', groupId: null }, { id: 'top', groupId: null }],
      groups: [{ id: 'empty', parentGroupId: null, panelOrder: 0.25 }]
    })).toEqual([
      { kind: 'layer', id: 'top', depth: 0 },
      { kind: 'group', id: 'empty', depth: 0 },
      { kind: 'layer', id: 'bottom', depth: 0 }
    ])
  })

  it('uses the persisted anchor for non-empty groups after they are moved', () => {
    expect(buildLayerPanelTree({
      layers: [{ id: 'bottom', groupId: null }, { id: 'member', groupId: 'moved' }, { id: 'top', groupId: null }],
      groups: [{ id: 'moved', parentGroupId: null, panelOrder: 0.25 }]
    })).toEqual([
      { kind: 'layer', id: 'top', depth: 0 },
      { kind: 'group', id: 'moved', depth: 0 },
      { kind: 'layer', id: 'member', depth: 1 },
      { kind: 'layer', id: 'bottom', depth: 0 }
    ])
  })

  it('guards descendant checks against nested groups', () => {
    expect(getLayerPanelDescendantGroupIds(groups, 'characters')).toEqual(['face'])
  })

  it('returns containing groups from the immediate parent toward the root', () => {
    expect(getLayerPanelAncestorGroupIds(groups, 'face')).toEqual(['face', 'characters'])
    expect(getLayerPanelAncestorGroupIds(groups, null)).toEqual([])
  })

  it('stops ancestor traversal when damaged data contains a cycle', () => {
    expect(getLayerPanelAncestorGroupIds([
      { id: 'first', parentGroupId: 'second' },
      { id: 'second', parentGroupId: 'first' }
    ], 'first')).toEqual(['first', 'second'])
  })

  it('keeps a child layer row as an insertion target instead of promoting its parent group', () => {
    const nodes = buildLayerPanelTree({ layers, groups })
    expect(resolveLayerPanelDropTarget({ layers, groups, nodes, hit: { kind: 'layer', id: 'highlight', top: 20, bottom: 52, pointerY: 36 }, draggedLayerIds: [], draggedGroupId: 'other' })).toEqual({ kind: 'layer', id: 'highlight', insertAfter: false, depth: 2 })
  })

  it('rejects dropping a group onto itself or a descendant', () => {
    const nodes = buildLayerPanelTree({ layers, groups })
    expect(resolveLayerPanelDropTarget({ layers, groups, nodes, hit: { kind: 'group', id: 'characters', top: 0, bottom: 32, pointerY: 16 }, draggedLayerIds: [], draggedGroupId: 'characters' })).toBeNull()
    expect(resolveLayerPanelDropTarget({ layers, groups, nodes, hit: { kind: 'group', id: 'face', top: 32, bottom: 64, pointerY: 48 }, draggedLayerIds: [], draggedGroupId: 'characters' })).toBeNull()
  })

  it('keeps layer insertion depth tied to the visible row', () => {
    const nodes: LayerPanelNode[] = buildLayerPanelTree({ layers, groups })
    expect(resolveLayerPanelDropTarget({ layers, groups, nodes, hit: { kind: 'layer', id: 'body', top: 96, bottom: 128, pointerY: 100 }, draggedLayerIds: ['background'] })).toEqual({ kind: 'layer', id: 'body', insertAfter: true, depth: 1 })
  })

  it('uses a dragged source row as an insertion anchor only while copying', () => {
    const nodes: LayerPanelNode[] = buildLayerPanelTree({ layers, groups })
    const input = {
      layers,
      groups,
      nodes,
      hit: { kind: 'layer' as const, id: 'background', top: 96, bottom: 128, pointerY: 124 },
      draggedLayerIds: ['background']
    }
    expect(resolveLayerPanelDropTarget(input)).toBeNull()
    expect(resolveLayerPanelDropTarget({ ...input, copying: true })).toEqual({ kind: 'layer', id: 'background', insertAfter: false, depth: 0 })
  })

  it('treats a group row as an explicit container target while dragging layers over it', () => {
    const nodes: LayerPanelNode[] = buildLayerPanelTree({ layers, groups })
    expect(resolveLayerPanelDropTarget({
      layers,
      groups,
      nodes,
      hit: { kind: 'group', id: 'characters', top: 0, bottom: 32, pointerY: 16 },
      draggedLayerIds: ['background']
    })).toEqual({ kind: 'group', id: 'characters', depth: 1 })
  })

  it('splits every nested group title into above, container and below targets', () => {
    const nodes: LayerPanelNode[] = buildLayerPanelTree({ layers, groups })
    const base = { layers, groups, nodes, draggedLayerIds: [], draggedGroupId: 'other' }
    expect(resolveLayerPanelDropTarget({ ...base, hit: { kind: 'group', id: 'face', top: 32, bottom: 64, pointerY: 34 } })).toEqual({ kind: 'above-group', id: 'face', insertAfter: true, depth: 1 })
    expect(resolveLayerPanelDropTarget({ ...base, hit: { kind: 'group', id: 'face', top: 32, bottom: 64, pointerY: 48 } })).toEqual({ kind: 'group', id: 'face', depth: 2 })
    expect(resolveLayerPanelDropTarget({ ...base, hit: { kind: 'group', id: 'face', top: 32, bottom: 64, pointerY: 62 } })).toEqual({ kind: 'above-group', id: 'face', insertAfter: false, depth: 1 })
  })
})
