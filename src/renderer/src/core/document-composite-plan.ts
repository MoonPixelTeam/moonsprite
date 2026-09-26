import type { LayerGroup, LayerMask, RasterLayer } from '@shared/types-layer'
import type { SelectionRect } from '@shared/types-selection'
import type { SpriteDocument } from '@shared/types-document'
import { unpackColor } from './raster'
import { buildLayerPanelTree } from './layer-panel-layout'
import { rasterStorageIdentity, readSurfacePackedLocal } from './runtime-raster'
import { hasEnabledLayerStyles, layerStyleAffectedRect } from './layer-styles'
import {
  animationMaskAt,
  resolveAnimationMask,
  getRasterContentRevision,
  rasterContentBounds,
  maskCoverageFromColor,
  layerContentBounds
} from './document-model'


export const activeCelMasksByLayer = (document: SpriteDocument, previewMaskId?: string, includeNeutral = false): Map<string, LayerMask> => {
  const timeline = document.animation
  if (!timeline) return new Map()
  return new Map(timeline.cels
    .filter((cel) => cel.frameId === timeline.activeFrameId)
    .map((cel) => [cel.layerId, animationMaskAt(timeline, cel.layerId, cel.frameId)] as const)
    .filter((entry): entry is readonly [string, LayerMask] => {
      const mask = entry[1]
      if (!mask) return false
      return mask.visible !== false && (includeNeutral || mask.id === previewMaskId || layerMaskAffectsComposite(mask))
    }))
}

export const activeGroupMasksByGroup = (document: SpriteDocument, previewMaskId?: string, includeNeutral = false): Map<string, LayerMask> => {
  const timeline = document.animation
  if (!timeline) return new Map()
  return new Map((timeline.groupMasks ?? [])
    .filter((entry) => entry.frameId === timeline.activeFrameId)
    .map((entry) => [entry.groupId, resolveAnimationMask(timeline, entry.mask)] as const)
    .filter((entry): entry is readonly [string, LayerMask] => Boolean(entry[1] && entry[1].visible !== false && (includeNeutral || entry[1].id === previewMaskId || layerMaskAffectsComposite(entry[1])))))
}

const layerMaskCompositeEffects = new WeakMap<LayerMask, { storage: object; contentRevision: number; affects: boolean }>()

const layerMaskAffectsComposite = (mask: LayerMask): boolean => {
  const storage = rasterStorageIdentity(mask)
  const contentRevision = getRasterContentRevision(storage)
  const cached = layerMaskCompositeEffects.get(mask)
  if (cached && cached.storage === storage && cached.contentRevision === contentRevision) return cached.affects
  const bounds = rasterContentBounds(mask)
  let affects = false
  if (bounds) {
    for (let y = bounds.y; y < bounds.y + bounds.height && !affects; y += 1) {
      for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
        if (maskCoverageFromColor(unpackColor(readSurfacePackedLocal(mask, x, y))) !== 255) {
          affects = true
          break
        }
      }
    }
  }
  layerMaskCompositeEffects.set(mask, { storage, contentRevision, affects })
  return affects
}

export const unionSelectionRects = (left: SelectionRect, right: SelectionRect): SelectionRect => {
  const x = Math.min(left.x, right.x)
  const y = Math.min(left.y, right.y)
  const toX = Math.max(left.x + left.width, right.x + right.width)
  const toY = Math.max(left.y + left.height, right.y + right.height)
  return { x, y, width: toX - x, height: toY - y }
}

/** Includes every styled pixel that can change when a source region is edited. */
export function expandLayerStyleInvalidationRect(document: SpriteDocument, rect: SelectionRect, affectedOwnerIds?: readonly string[]): SelectionRect {
  const requestedIds = affectedOwnerIds?.length ? new Set(affectedOwnerIds) : null
  const groupById = new Map(document.groups.map((group) => [group.id, group]))
  const branches: Array<{ styles: LayerGroup['layerStyles'] | RasterLayer['layerStyles']; groupId: string | null }> = []
  for (const layer of document.layers) {
    if (!requestedIds || requestedIds.has(layer.id)) branches.push({ styles: layer.layerStyles, groupId: layer.groupId ?? null })
  }
  if (requestedIds) for (const group of document.groups) {
    if (requestedIds.has(group.id)) branches.push({ styles: group.layerStyles, groupId: group.parentGroupId ?? null })
  }
  // Mask edits and other derived surfaces do not always expose their owner ID to
  // the renderer. Falling back to all branches keeps styled ancestors correct.
  if (branches.length === 0 && requestedIds) {
    for (const layer of document.layers) branches.push({ styles: layer.layerStyles, groupId: layer.groupId ?? null })
  }
  let affected = { ...rect }
  for (const branch of branches) {
    let branchRect = layerStyleAffectedRect(rect, branch.styles)
    const visited = new Set<string>()
    let groupId = branch.groupId
    while (groupId && !visited.has(groupId)) {
      visited.add(groupId)
      const group = groupById.get(groupId)
      if (!group) break
      branchRect = layerStyleAffectedRect(branchRect, group.layerStyles)
      groupId = group.parentGroupId ?? null
    }
    affected = unionSelectionRects(affected, branchRect)
  }
  return affected
}

export type CompositeStackItem =
  | { kind: 'layer'; layer: RasterLayer }
  | { kind: 'group'; group: LayerGroup; children: CompositeStackItem[] }

const animationLayerZIndexes = (document: SpriteDocument): Map<string, number> => {
  const timeline = document.animation
  if (!timeline) return new Map()
  const byId = new Map(timeline.cels.map((cel) => [cel.id, cel]))
  const result = new Map<string, number>()
  for (const cel of timeline.cels) {
    if (cel.frameId !== timeline.activeFrameId) continue
    const visited = new Set<string>()
    let source = cel
    while (source.linkedCelId && !visited.has(source.id)) {
      visited.add(source.id)
      const linked = byId.get(source.linkedCelId)
      if (!linked || linked.layerId !== cel.layerId) break
      source = linked
    }
    const numeric = Number(source.zIndex)
    result.set(cel.layerId, Number.isFinite(numeric) ? Math.max(-999, Math.min(999, Math.trunc(numeric))) : 0)
  }
  return result
}

/** Sort bottom-to-top composite blocks without separating clipping layers from their base. */
const sortCompositeContainerByZ = (items: CompositeStackItem[], layerZIndexes: ReadonlyMap<string, number>): void => {
  for (const item of items) if (item.kind === 'group') sortCompositeContainerByZ(item.children, layerZIndexes)
  const blocks: Array<{ items: CompositeStackItem[]; zIndex: number; order: number }> = []
  for (const item of items) {
    const clipsToLower = item.kind === 'layer' ? item.layer.clippingMask === true : item.group.clippingMask === true
    if (clipsToLower && blocks.length > 0) {
      blocks[blocks.length - 1].items.push(item)
      continue
    }
    blocks.push({ items: [item], zIndex: item.kind === 'layer' ? layerZIndexes.get(item.layer.id) ?? 0 : 0, order: blocks.length })
  }
  blocks.sort((left, right) => left.zIndex - right.zIndex || left.order - right.order)
  items.splice(0, items.length, ...blocks.flatMap((block) => block.items))
}

/** Uses the visible layer-panel order as the single source of truth for compositing order. */
export const buildCompositeStack = (document: SpriteDocument): CompositeStackItem[] => {
  const layerById = new Map(document.layers.map((layer) => [layer.id, layer]))
  const groupById = new Map(document.groups.map((group) => [group.id, group]))
  const root: CompositeStackItem[] = []
  const containers: CompositeStackItem[][] = [root]

  for (const node of buildLayerPanelTree({ layers: document.layers, groups: document.groups })) {
    const container = containers[node.depth]
    if (!container) continue
    containers.length = node.depth + 1
    if (node.kind === 'layer') {
      const layer = layerById.get(node.id)
      if (layer) container.push({ kind: 'layer', layer })
      continue
    }
    const group = groupById.get(node.id)
    if (!group) continue
    const item: CompositeStackItem = { kind: 'group', group, children: [] }
    container.push(item)
    containers[node.depth + 1] = item.children
  }

  const reverseContainers = (items: CompositeStackItem[]): void => {
    items.reverse()
    for (const item of items) if (item.kind === 'group') reverseContainers(item.children)
  }
  reverseContainers(root)
  sortCompositeContainerByZ(root, animationLayerZIndexes(document))
  return root
}

export const normalCompositeLayers = (document: SpriteDocument, allowLayerBlendModes = false): RasterLayer[] | null => {
  const activeMasks = activeCelMasksByLayer(document)
  const activeGroupMasks = activeGroupMasksByGroup(document)
  const flatten = (items: readonly CompositeStackItem[]): RasterLayer[] | null => {
    const layers: RasterLayer[] = []
    for (const item of items) {
      if (item.kind === 'layer') {
        if (!item.layer.visible || item.layer.opacity <= 0) continue
        if (activeMasks.has(item.layer.id)) return null
        if (item.layer.clippingMask === true || (item.layer.kind === 'adjustment' || hasEnabledLayerStyles(item.layer.layerStyles))) return null
        if (item.layer.blendMode !== 'normal') {
          // An empty non-normal layer has no effect and must not force the
          // whole document onto the opacity-group compositor.
          if (!layerContentBounds(document, item.layer)) continue
          if (!allowLayerBlendModes) return null
        }
        layers.push(item.layer)
        continue
      }
      if (!item.group.visible || item.group.opacity <= 0) continue
      const children = flatten(item.children)
      if (!children) return null
      if (children.length === 0) continue
      if (activeGroupMasks.has(item.group.id)) return null
      if (item.group.blendMode !== 'normal'
        || item.group.opacity !== 1
        || item.group.cumulativeBlend === true
        || item.group.clippingMask === true
        || hasEnabledLayerStyles(item.group.layerStyles)) return null
      layers.push(...children)
    }
    return layers
  }
  return flatten(buildCompositeStack(document))
}

export const opacityGroupCompositeStack = (document: SpriteDocument): CompositeStackItem[] | null => {
  const activeMasks = activeCelMasksByLayer(document)
  const activeGroupMasks = activeGroupMasksByGroup(document)
  const prepare = (items: readonly CompositeStackItem[]): CompositeStackItem[] | null => {
    const prepared: CompositeStackItem[] = []
    for (const item of items) {
      if (item.kind === 'layer') {
        if (!item.layer.visible || item.layer.opacity <= 0) continue
        if (activeMasks.has(item.layer.id)) return null
        if (item.layer.clippingMask === true || (item.layer.kind === 'adjustment' || hasEnabledLayerStyles(item.layer.layerStyles))) return null
        if (item.layer.blendMode !== 'normal') {
          if (layerContentBounds(document, item.layer)) prepared.push(item)
          continue
        }
        prepared.push(item)
        continue
      }
      if (!item.group.visible || item.group.opacity <= 0) continue
      const children = prepare(item.children)
      if (!children) return null
      if (children.length === 0) continue
      if (activeGroupMasks.has(item.group.id)) return null
      if (item.group.cumulativeBlend === true
        || item.group.clippingMask === true
        || hasEnabledLayerStyles(item.group.layerStyles)) return null
      prepared.push({ ...item, children })
    }
    return prepared
  }
  return prepare(buildCompositeStack(document))
}
