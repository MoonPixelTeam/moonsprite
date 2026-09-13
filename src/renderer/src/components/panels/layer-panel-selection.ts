import type { RgbaColor } from '@shared/types-color'
import { getDescendantGroupIds } from '@/core/document-model'
import { type DocumentSession, type LayerPropertyTarget } from '@/store/workspace'

export const sameColor = (left: RgbaColor | null, right: RgbaColor | null): boolean => left === null || right === null
  ? left === right
  : left.r === right.r && left.g === right.g && left.b === right.b && left.a === right.a

export const selectedRowsForDrag = (session: DocumentSession): { ids: string[]; groupIds: string[] } => {
  const selectedGroups = new Set(session.selectedGroupIds.length > 0 ? session.selectedGroupIds : session.selectedGroupId ? [session.selectedGroupId] : [])
  const groupIds = [...selectedGroups].filter((groupId) => !session.document.groups.some((candidate) => selectedGroups.has(candidate.id) && getDescendantGroupIds(session.document, candidate.id).includes(groupId)))
  const coveredGroups = new Set<string>()
  for (const groupId of groupIds) {
    coveredGroups.add(groupId)
    for (const descendantId of getDescendantGroupIds(session.document, groupId)) coveredGroups.add(descendantId)
  }
  const ids = session.selectedLayerIds.filter((layerId) => {
    const layer = session.document.layers.find((candidate) => candidate.id === layerId)
    return Boolean(layer && (!layer.groupId || !coveredGroups.has(layer.groupId)))
  })
  return { ids, groupIds }
}

export const selectedRowsForProperties = (session: DocumentSession): LayerPropertyTarget[] => {
  const selectedGroupIds = session.selectedGroupIds.length > 0
    ? session.selectedGroupIds
    : session.selectedGroupId ? [session.selectedGroupId] : []
  const groupIds = [...new Set(selectedGroupIds)].filter((id) => session.document.groups.some((group) => group.id === id))
  // A single selected group mirrors its descendants into selectedLayerIds for
  // whole-group commands. Those implicit members are not property-edit targets.
  const selectedLayerIds = session.selectedGroupId && groupIds.length === 1 ? [] : session.selectedLayerIds
  const layerIds = [...new Set(selectedLayerIds)].filter((id) => session.document.layers.some((layer) => layer.id === id))
  return [
    ...groupIds.map((id) => ({ id, kind: 'group' as const })),
    ...layerIds.map((id) => ({ id, kind: 'layer' as const }))
  ]
}

export /** Mask rows are editable image surfaces, not layer/group property owners.
 * A range selection can contain both kinds of rows, so callers must not
 * silently apply layer properties to only the supported subset. */
const hasUnsupportedPropertySelection = (session: DocumentSession): boolean =>
  session.selectedAnimationMaskRowKeys.length > 0
