import type { SpriteDocument } from '@shared/types-document'
import type { RasterLayer } from '@shared/types-layer'
import { compositeHierarchyNodes } from './document-composite-hierarchy'

/** Match the actual composite tree, including duplicate IDs and malformed ancestry. */
export const styledCompositeSourceFilter = (document: SpriteDocument): ((layer: RasterLayer) => boolean) => {
  const ownVisible = (layer: RasterLayer) => layer.visible && !(layer.opacity <= 0)
  if (document.groups.every(group => group.visible && !(group.opacity <= 0))) return ownVisible
  const layers = new Map(document.layers.map(layer => [layer.id, layer]))
  const groups = new Map(document.groups.map(group => [group.id, group]))
  const visibleSources = new Set<RasterLayer>()
  const containers: boolean[] = [true]
  for (const node of compositeHierarchyNodes(document)) {
    const parentVisible = containers[node.depth]
    if (parentVisible === undefined) continue
    containers.length = node.depth + 1
    if (node.kind === 'layer') {
      const layer = layers.get(node.id)
      if (layer && parentVisible && ownVisible(layer)) visibleSources.add(layer)
    } else {
      const group = groups.get(node.id)
      if (group) containers[node.depth + 1] = parentVisible && group.visible && !(group.opacity <= 0)
    }
  }
  return layer => visibleSources.has(layer)
}
