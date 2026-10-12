import type { SpriteDocument } from '@shared/types-document'
import { buildLayerPanelTree, type LayerPanelNode } from './layer-panel-layout'

interface HierarchyEntry {
  layers: Array<{ id: string; groupId: string | null | undefined }>
  groups: Array<{ id: string; parentGroupId: string | null | undefined; panelOrder: number | undefined }>
  nodes: readonly Readonly<LayerPanelNode>[]
}

const hierarchies = new WeakMap<SpriteDocument, HierarchyEntry>()

/** Reuses hierarchy IDs only, so pixel/placement/style edits never retain old layer objects. */
export const compositeHierarchyNodes = (document: SpriteDocument, cacheOwner = document): readonly Readonly<LayerPanelNode>[] => {
  // Derived style documents may borrow their source's cache identity. Always
  // validate the actual input structure, including proxy IDs and membership.
  const cached = hierarchies.get(cacheOwner)
  if (cached && cached.layers.length === document.layers.length && cached.groups.length === document.groups.length) {
    let valid = true
    for (let index = 0; index < document.layers.length; index += 1) {
      const layer = document.layers[index], before = cached.layers[index]
      if (layer.id !== before.id || layer.groupId !== before.groupId) { valid = false; break }
    }
    if (valid) for (let index = 0; index < document.groups.length; index += 1) {
      const group = document.groups[index], before = cached.groups[index]
      if (group.id !== before.id || group.parentGroupId !== before.parentGroupId || !Object.is(group.panelOrder, before.panelOrder)) { valid = false; break }
    }
    if (valid) return cached.nodes
  }
  const next: HierarchyEntry = {
    layers: document.layers.map(layer => ({ id: layer.id, groupId: layer.groupId })),
    groups: document.groups.map(group => ({ id: group.id, parentGroupId: group.parentGroupId, panelOrder: group.panelOrder })),
    nodes: Object.freeze(buildLayerPanelTree({ layers: document.layers, groups: document.groups }).map(node => Object.freeze(node)))
  }
  hierarchies.set(cacheOwner, next)
  return next.nodes
}
