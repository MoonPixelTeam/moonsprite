import type { LayerGroup } from '@shared/types-layer'
import type { SpriteDocument } from '@shared/types-document'

export interface OpacityGroupCacheEntry {
  canvas: OffscreenCanvas
  revision: number
  groupId: string
  childLayerIds: readonly string[]
}

const opacityGroupCache = new WeakMap<LayerGroup, OpacityGroupCacheEntry>()

export const getCachedOpacityGroup = (
  group: LayerGroup,
  documentRevision: number,
  childLayerIds: readonly string[]
): OffscreenCanvas | null => {
  const cached = opacityGroupCache.get(group)
  if (!cached || cached.revision !== documentRevision) return null

  // Verify child layer set hasn't changed
  if (cached.childLayerIds.length !== childLayerIds.length) return null
  for (let i = 0; i < childLayerIds.length; i++) {
    if (cached.childLayerIds[i] !== childLayerIds[i]) return null
  }

  return cached.canvas
}

export const cacheOpacityGroup = (
  group: LayerGroup,
  canvas: OffscreenCanvas,
  documentRevision: number,
  childLayerIds: readonly string[]
): void => {
  opacityGroupCache.set(group, {
    canvas,
    revision: documentRevision,
    groupId: group.id,
    childLayerIds: [...childLayerIds]
  })
}

export const invalidateOpacityGroupCache = (group: LayerGroup): void => {
  opacityGroupCache.delete(group)
}

/** Release canvas resources when a document closes. */
export const releaseOpacityGroupCaches = (document: SpriteDocument): void => {
  for (const group of document.groups) {
    const cached = opacityGroupCache.get(group)
    if (cached) {
      cached.canvas.width = 1
      cached.canvas.height = 1
      opacityGroupCache.delete(group)
    }
  }
}
