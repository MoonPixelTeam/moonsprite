import { describe, expect, it } from 'vitest'
import type { LayerGroup } from '@shared/types'
import { createDocument, createLayer, getActiveLayer } from './document'
import { HistoryStack } from './history'
import { assignLayersToGroup, assignLayersToRoot, canMoveGroupInto, createLayerGroup, moveGroupToRootEdge, moveLayerPanelRows, moveLayersToRootEdge, positionGroupNextToLayer, reorderGroup, reorderLayers, ungroupSelected, type LayerOperationState } from './layer-operations'
import { buildLayerPanelTree } from './layer-panel-layout'

const group = (id: string, parentGroupId: string | null = null): LayerGroup => ({ id, name: id, parentGroupId, visible: true, locked: false, opacity: 1, blendMode: 'normal' })

const createState = (): LayerOperationState => {
  const document = createDocument('layer operations', 2, 2, 'rgba')
  return { document, selectedLayerIds: [document.activeLayerId], selectedGroupId: null }
}

describe('layer operations', () => {
  it('rejects a group drop into itself or one of its descendants', () => {
    const state = createState()
    state.document.groups.push(group('parent'), group('child', 'parent'))
    expect(canMoveGroupInto(state.document, 'parent', 'parent')).toBe(false)
    expect(canMoveGroupInto(state.document, 'parent', 'child')).toBe(false)
    expect(reorderGroup(state, 'parent', 'child')).toBeNull()
  })

  it('creates and ungroups a selected layer with reversible structure history', () => {
    const state = createState()
    const layer = getActiveLayer(state.document)
    const create = createLayerGroup(state, 'group-created', 'Created')
    expect(layer.groupId).toBe('group-created')
    expect(state.selectedGroupId).toBe('group-created')
    create?.undo()
    expect(layer.groupId).toBeNull()
    create?.redo()
    expect(layer.groupId).toBe('group-created')

    const ungroup = ungroupSelected(state)
    expect(state.document.groups).toHaveLength(0)
    expect(layer.groupId).toBeNull()
    ungroup?.undo()
    expect(state.document.groups.map((item) => item.id)).toEqual(['group-created'])
    expect(layer.groupId).toBe('group-created')
  })

  it('wraps all explicitly selected layers even when an active group is also present', () => {
    const state = createState()
    const first = getActiveLayer(state.document)
    const second = createLayer('Second', 2, 2, 'rgba')
    state.document.layers.push(second)
    state.document.groups.push(group('existing'))
    state.selectedLayerIds = [first.id, second.id]
    state.selectedGroupId = 'existing'
    state.selectedGroupIds = ['existing']

    const create = createLayerGroup(state, 'group-created', 'Created')

    expect(create).not.toBeNull()
    expect(first.groupId).toBe('group-created')
    expect(second.groupId).toBe('group-created')
    expect(state.selectedGroupId).toBe('group-created')
    create?.undo()
    expect(first.groupId).toBeNull()
    expect(second.groupId).toBeNull()
  })



  it('moves mixed panel rows atomically without changing their visible order or selection', () => {
    const state = createState()
    const layer = getActiveLayer(state.document)
    state.document.groups.push({ ...group('source'), panelOrder: 1 }, { ...group('target'), panelOrder: -1 })
    state.selectedLayerIds = [layer.id]
    state.selectedGroupIds = ['source']
    const beforeSelection = { layers: [...state.selectedLayerIds], groups: [...state.selectedGroupIds] }

    const move = moveLayerPanelRows(state, [layer.id], ['source'], { kind: 'group', id: 'target' })

    expect(buildLayerPanelTree(state.document).map((node) => node.id)).toEqual(['target', 'source', layer.id])
    expect(state.document.groups.find((item) => item.id === 'source')?.parentGroupId).toBe('target')
    expect(state.document.layers.find((item) => item.id === layer.id)?.groupId).toBe('target')
    expect(state.selectedLayerIds).toEqual(beforeSelection.layers)
    expect(state.selectedGroupIds).toEqual(beforeSelection.groups)
    move?.undo()
    expect(buildLayerPanelTree(state.document).filter((node) => node.depth === 0).map((node) => node.id)).toEqual(['source', layer.id, 'target'])
    move?.redo()
    expect(buildLayerPanelTree(state.document).map((node) => node.id)).toEqual(['target', 'source', layer.id])
  })



  it('moves a group beside a layer at any nested depth', () => {
    const state = createState()
    const target = getActiveLayer(state.document)
    target.groupId = 'nested'
    state.document.groups.push(
      group('parent'),
      group('nested', 'parent'),
      group('moving')
    )

    const history = moveLayerPanelRows(state, [], ['moving'], { kind: 'row', rowKind: 'layer', id: target.id, position: 'above' })

    expect(state.document.groups.find((item) => item.id === 'moving')?.parentGroupId).toBe('nested')
    expect(buildLayerPanelTree(state.document).map((node) => `${node.depth}:${node.id}`)).toEqual([
      '0:parent', '1:nested', '2:moving', `2:${target.id}`
    ])
    history?.undo()
    expect(state.document.groups.find((item) => item.id === 'moving')?.parentGroupId).toBeNull()
  })
})
