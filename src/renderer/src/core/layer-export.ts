import type { RasterLayer } from '@shared/types-layer'
import type { SpriteDocument } from '@shared/types-document'

/** Builds an isolated visual document without changing the source document. */
export const documentForLayerExport = (document: SpriteDocument, layerId?: string): SpriteDocument => {
  if (!layerId || !document.layers.some((layer) => layer.id === layerId)) return document
  const visibleGroups = new Set<string>()
  let groupId = document.layers.find((layer) => layer.id === layerId)?.groupId ?? null
  while (groupId) {
    if (visibleGroups.has(groupId)) break
    visibleGroups.add(groupId)
    groupId = document.groups.find((group) => group.id === groupId)?.parentGroupId ?? null
  }
  return {
    ...document,
    layers: document.layers.map((layer) => ({ ...layer, visible: layer.id === layerId && layer.visible })),
    groups: document.groups.map((group) => ({ ...group, visible: visibleGroups.has(group.id) && group.visible }))
  }
}

export const layerExportableLayers = (document: SpriteDocument, layerId?: string): RasterLayer[] => layerId
  ? document.layers.filter((layer) => layer.id === layerId)
  : [...document.layers]
