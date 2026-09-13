import { layerStyleCoverageTile } from './layer-style-coverage'
import { LayerStyleTileCache } from './layer-style-tile-cache'
import type { AnimationCelSurface } from '@shared/types-animation'
import type { BlendMode, PaletteEntry, RgbaColor } from '@shared/types-color'
import type { LayerGroup, LayerMask, RasterLayer } from '@shared/types-layer'
import type { LayerStyles } from '@shared/types-layer-style'
import type { SelectionRect } from '@shared/types-selection'
import type { SpriteDocument } from '@shared/types-document'
import { blendWithMode, blendWithModeInto, packColor, TRANSPARENT, unpackColor, writeRgbaPixel } from './raster'
import { buildLayerPanelTree } from './layer-panel-layout'
import { lazyRuntimeRasterForSurface, rasterStorageIdentity, readSurfacePackedLocal, readSurfacePackedRegion, readSurfaceRgbaRegion, runtimeRasterForSurface, runtimeTileHasVisiblePixels } from './runtime-raster'
import { applyLayerStylesAt, applySimpleLayerStylesPacked, hasEnabledLayerStyles, layerStyleAffectedRect, layerStyleBinaryStrokeMetric, layerStyleOutputBounds, layerStylesSignature, mapLayerStyleColors, resolveLayerStyles, type LayerStyleBinaryStrokeMetric, type LayerStyleGeometry } from './layer-styles'
import { animationMaskAt, resolveAnimationMask, getRasterContentRevision, rasterContentBounds, maskCoverageFromColor, layerContentBounds, getLayerContentRevision, rasterContentPaletteKey, isGroupEffectivelyVisible, isLayerEffectivelyVisible, resolveLayerCanvasColor, cacheRasterContentBounds, layerIndexAt, resolveDocumentCanvasColor } from './document-model'

const activeCelMasksByLayer = (document: SpriteDocument): Map<string, LayerMask> => {
  const timeline = document.animation
  if (!timeline) return new Map()
  return new Map(timeline.cels
    .filter((cel) => cel.frameId === timeline.activeFrameId)
    .map((cel) => [cel.layerId, animationMaskAt(timeline, cel.layerId, cel.frameId)] as const)
    .filter((entry): entry is readonly [string, LayerMask] => {
      const mask = entry[1]
      if (!mask) return false
      return mask.visible !== false && layerMaskAffectsComposite(mask)
    }))
}

const activeGroupMasksByGroup = (document: SpriteDocument): Map<string, LayerMask> => {
  const timeline = document.animation
  if (!timeline) return new Map()
  return new Map((timeline.groupMasks ?? [])
    .filter((entry) => entry.frameId === timeline.activeFrameId)
    .map((entry) => [entry.groupId, resolveAnimationMask(timeline, entry.mask)] as const)
    .filter((entry): entry is readonly [string, LayerMask] => Boolean(entry[1] && entry[1].visible !== false && layerMaskAffectsComposite(entry[1]))))
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

const unionSelectionRects = (left: SelectionRect, right: SelectionRect): SelectionRect => {
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
const buildCompositeStack = (document: SpriteDocument): CompositeStackItem[] => {
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
        if (item.layer.clippingMask === true || hasEnabledLayerStyles(item.layer.layerStyles)) return null
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

const opacityGroupCompositeStack = (document: SpriteDocument): CompositeStackItem[] | null => {
  const activeMasks = activeCelMasksByLayer(document)
  const activeGroupMasks = activeGroupMasksByGroup(document)
  const prepare = (items: readonly CompositeStackItem[]): CompositeStackItem[] | null => {
    const prepared: CompositeStackItem[] = []
    for (const item of items) {
      if (item.kind === 'layer') {
        if (!item.layer.visible || item.layer.opacity <= 0) continue
        if (activeMasks.has(item.layer.id)) return null
        if (item.layer.clippingMask === true || hasEnabledLayerStyles(item.layer.layerStyles)) return null
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

interface BinaryDistanceField {
  bounds: SelectionRect
  distances: Uint8Array
}

const UNREACHABLE_BINARY_DISTANCE = 0xff

const incrementBinaryDistance = (value: number): number =>
  value >= UNREACHABLE_BINARY_DISTANCE ? UNREACHABLE_BINARY_DISTANCE : value + 1

const expandLocalRect = (rect: SelectionRect, amount: number): SelectionRect => ({
  x: rect.x - amount,
  y: rect.y - amount,
  width: rect.width + amount * 2,
  height: rect.height + amount * 2
})

// Layer style radii are capped at 32px. A byte is enough for every useful
// distance and keeps the cached field half the size of the old Uint16 field.
const binaryChebyshevDistanceFieldFromMask = (
  bounds: SelectionRect,
  maskBounds: SelectionRect,
  mask: Uint8Array,
  seed: 0 | 255
): BinaryDistanceField => {
  const distances = new Uint8Array(bounds.width * bounds.height)
  distances.fill(seed === 0 ? 0 : UNREACHABLE_BINARY_DISTANCE)
  const overlapLeft = Math.max(bounds.x, maskBounds.x)
  const overlapTop = Math.max(bounds.y, maskBounds.y)
  const overlapRight = Math.min(bounds.x + bounds.width, maskBounds.x + maskBounds.width)
  const overlapBottom = Math.min(bounds.y + bounds.height, maskBounds.y + maskBounds.height)
  for (let y = overlapTop; y < overlapBottom; y += 1) {
    const sourceRow = (y - maskBounds.y) * maskBounds.width
    const targetRow = (y - bounds.y) * bounds.width
    for (let x = overlapLeft; x < overlapRight; x += 1) {
      const targetIndex = targetRow + x - bounds.x
      if (mask[sourceRow + x - maskBounds.x] === seed) distances[targetIndex] = 0
      else if (seed === 0) distances[targetIndex] = UNREACHABLE_BINARY_DISTANCE
    }
  }
  for (let y = 0; y < bounds.height; y += 1) for (let x = 0; x < bounds.width; x += 1) {
    const index = y * bounds.width + x
    let distance = distances[index]
    if (x > 0) distance = Math.min(distance, incrementBinaryDistance(distances[index - 1]))
    if (y > 0) {
      const previousRow = index - bounds.width
      distance = Math.min(distance, incrementBinaryDistance(distances[previousRow]))
      if (x > 0) distance = Math.min(distance, incrementBinaryDistance(distances[previousRow - 1]))
      if (x + 1 < bounds.width) distance = Math.min(distance, incrementBinaryDistance(distances[previousRow + 1]))
    }
    distances[index] = distance
  }
  for (let y = bounds.height - 1; y >= 0; y -= 1) for (let x = bounds.width - 1; x >= 0; x -= 1) {
    const index = y * bounds.width + x
    let distance = distances[index]
    if (x + 1 < bounds.width) distance = Math.min(distance, incrementBinaryDistance(distances[index + 1]))
    if (y + 1 < bounds.height) {
      const nextRow = index + bounds.width
      distance = Math.min(distance, incrementBinaryDistance(distances[nextRow]))
      if (x > 0) distance = Math.min(distance, incrementBinaryDistance(distances[nextRow - 1]))
      if (x + 1 < bounds.width) distance = Math.min(distance, incrementBinaryDistance(distances[nextRow + 1]))
    }
    distances[index] = distance
  }
  return { bounds, distances }
}

const binaryAxisDistanceFieldFromMask = (
  bounds: SelectionRect,
  maskBounds: SelectionRect,
  mask: Uint8Array,
  seed: 0 | 255,
  metric: Exclude<LayerStyleBinaryStrokeMetric, 'square'>
): BinaryDistanceField => {
  const distances = new Uint8Array(bounds.width * bounds.height)
  distances.fill(seed === 0 ? 0 : UNREACHABLE_BINARY_DISTANCE)
  const overlapLeft = Math.max(bounds.x, maskBounds.x)
  const overlapTop = Math.max(bounds.y, maskBounds.y)
  const overlapRight = Math.min(bounds.x + bounds.width, maskBounds.x + maskBounds.width)
  const overlapBottom = Math.min(bounds.y + bounds.height, maskBounds.y + maskBounds.height)
  for (let y = overlapTop; y < overlapBottom; y += 1) {
    const sourceRow = (y - maskBounds.y) * maskBounds.width
    const targetRow = (y - bounds.y) * bounds.width
    for (let x = overlapLeft; x < overlapRight; x += 1) {
      const targetIndex = targetRow + x - bounds.x
      if (mask[sourceRow + x - maskBounds.x] === seed) distances[targetIndex] = 0
      else if (seed === 0) distances[targetIndex] = UNREACHABLE_BINARY_DISTANCE
    }
  }
  const horizontal = metric === 'horizontal' || metric === 'cardinal'
  const vertical = metric === 'vertical' || metric === 'cardinal'

  if (horizontal) for (let y = 0; y < bounds.height; y += 1) {
    let distance = UNREACHABLE_BINARY_DISTANCE
    for (let x = 0; x < bounds.width; x += 1) {
      const index = y * bounds.width + x
      distance = distances[index] === 0 ? 0 : incrementBinaryDistance(distance)
      distances[index] = distance
    }
    distance = UNREACHABLE_BINARY_DISTANCE
    for (let x = bounds.width - 1; x >= 0; x -= 1) {
      const index = y * bounds.width + x
      distance = distances[index] === 0 ? 0 : incrementBinaryDistance(distance)
      if (distance < distances[index]) distances[index] = distance
    }
  }

  if (vertical) for (let x = 0; x < bounds.width; x += 1) {
    let distance = UNREACHABLE_BINARY_DISTANCE
    for (let y = 0; y < bounds.height; y += 1) {
      const index = y * bounds.width + x
      distance = distances[index] === 0 ? 0 : incrementBinaryDistance(distance)
      if (distance < distances[index]) distances[index] = distance
    }
    distance = UNREACHABLE_BINARY_DISTANCE
    for (let y = bounds.height - 1; y >= 0; y -= 1) {
      const index = y * bounds.width + x
      distance = distances[index] === 0 ? 0 : incrementBinaryDistance(distance)
      if (distance < distances[index]) distances[index] = distance
    }
  }
  return { bounds, distances }
}

const binaryDistanceFieldFromMaskMetric = (
  bounds: SelectionRect,
  maskBounds: SelectionRect,
  mask: Uint8Array,
  seed: 0 | 255,
  metric: LayerStyleBinaryStrokeMetric
): BinaryDistanceField => metric === 'square'
  ? binaryChebyshevDistanceFieldFromMask(bounds, maskBounds, mask, seed)
  : binaryAxisDistanceFieldFromMask(bounds, maskBounds, mask, seed, metric)

interface LocalBinaryStyleFields {
  shadow: BinaryDistanceField | null
  innerGlow: BinaryDistanceField | null
  strokeOutside: BinaryDistanceField | null
  strokeInside: BinaryDistanceField | null
}

/** Packed style evaluation is only valid when every enabled geometric effect
 * has a matching distance field. Custom stroke direction masks deliberately
 * fall back to the pixel-accurate evaluator. */
const hasCompleteBinaryStyleCoverage = (
  styles: LayerStyles,
  fields: Pick<LocalBinaryStyleFields, 'shadow' | 'innerGlow' | 'strokeOutside' | 'strokeInside'> | null
): boolean => Boolean(fields)
  && (!styles.shadow.enabled || styles.shadow.blur <= 0 || Boolean(fields!.shadow))
  && (!styles.innerGlow.enabled || Boolean(fields!.innerGlow))
  && (!styles.stroke.enabled || styles.stroke.position === 'inside' || Boolean(fields!.strokeOutside))
  && (!styles.stroke.enabled || styles.stroke.position === 'outside' || Boolean(fields!.strokeInside))

const localTranslatedRect = (rect: SelectionRect, x: number, y: number): SelectionRect => ({
  x: rect.x + x,
  y: rect.y + y,
  width: rect.width,
  height: rect.height
})

const localBinaryStyleFields = (
  document: SpriteDocument,
  layer: RasterLayer,
  affected: SelectionRect,
  styles: LayerStyles,
  strokeMetric: LayerStyleBinaryStrokeMetric | null
): LocalBinaryStyleFields | null => {
  const indexedAlpha = layer.format === 'indexed'
    ? new Map(document.palette.map((entry) => [entry.id, entry.color.a]))
    : null
  const rgbaPixels = layer.format === 'rgba' && !lazyRuntimeRasterForSurface(layer)
    ? layer.pixels
    : null
  const alphaAt = (x: number, y: number): number => {
    if (x < 0 || y < 0 || x >= layer.width || y >= layer.height) return 0
    const sourceIndex = y * layer.width + x
    if (rgbaPixels) return rgbaPixels[sourceIndex * 4 + 3]
    const packed = readSurfacePackedLocal(layer, x, y)
    return layer.format === 'rgba' ? packed >>> 24 : (indexedAlpha!.get(packed) ?? 0)
  }
  let dependencyBounds: SelectionRect | null = null
  const include = (rect: SelectionRect): void => {
    dependencyBounds = dependencyBounds ? unionSelectionRects(dependencyBounds, rect) : rect
  }
  const shadowBounds = styles.shadow.enabled && styles.shadow.blur > 0
    ? expandLocalRect(localTranslatedRect(affected, -styles.shadow.offsetX, -styles.shadow.offsetY), styles.shadow.blur)
    : null
  const innerGlowBounds = styles.innerGlow.enabled
    ? expandLocalRect(affected, styles.innerGlow.size)
    : null
  const strokeBounds = strokeMetric && styles.stroke.enabled
    ? expandLocalRect(affected, styles.stroke.size)
    : null
  if (shadowBounds) include(shadowBounds)
  if (innerGlowBounds) include(innerGlowBounds)
  if (strokeBounds) include(strokeBounds)
  const dependencies = dependencyBounds as SelectionRect | null
  if (dependencies === null) return { shadow: null, innerGlow: null, strokeOutside: null, strokeInside: null }

  const dependencyMask = new Uint8Array(Math.max(0, dependencies.width * dependencies.height))
  for (let y = dependencies.y; y < dependencies.y + dependencies.height; y += 1) {
    const row = (y - dependencies.y) * dependencies.width
    for (let x = dependencies.x; x < dependencies.x + dependencies.width; x += 1) {
      const alpha = alphaAt(x, y)
      if (alpha !== 0 && alpha !== 255) return null
      dependencyMask[row + x - dependencies.x] = alpha
    }
  }
  type FieldRequest = { bounds: SelectionRect; seed: 0 | 255; metric: LayerStyleBinaryStrokeMetric }
  const requests = {
    shadow: shadowBounds ? { bounds: shadowBounds, seed: 255 as const, metric: 'square' as const } : null,
    innerGlow: innerGlowBounds ? { bounds: innerGlowBounds, seed: 0 as const, metric: 'square' as const } : null,
    strokeOutside: strokeBounds && strokeMetric && styles.stroke.position !== 'inside'
      ? { bounds: strokeBounds, seed: 255 as const, metric: strokeMetric }
      : null,
    strokeInside: strokeBounds && strokeMetric && styles.stroke.position !== 'outside'
      ? { bounds: strokeBounds, seed: 0 as const, metric: strokeMetric }
      : null
  }
  const groupedBounds = new Map<string, { bounds: SelectionRect; seed: 0 | 255; metric: LayerStyleBinaryStrokeMetric }>()
  for (const request of Object.values(requests) as Array<FieldRequest | null>) {
    if (!request) continue
    const key = `${request.seed}:${request.metric}`
    const group = groupedBounds.get(key)
    groupedBounds.set(key, group
      ? { ...group, bounds: unionSelectionRects(group.bounds, request.bounds) }
      : request)
  }
  const groupedFields = new Map<string, BinaryDistanceField>()
  for (const [key, request] of groupedBounds) {
    groupedFields.set(key, binaryDistanceFieldFromMaskMetric(request.bounds, dependencies, dependencyMask, request.seed, request.metric))
  }
  const fieldFor = (request: FieldRequest | null): BinaryDistanceField | null => request
    ? groupedFields.get(`${request.seed}:${request.metric}`) ?? null
    : null
  const shadow = fieldFor(requests.shadow)
  const innerGlow = fieldFor(requests.innerGlow)
  const strokeOutside = fieldFor(requests.strokeOutside)
  const strokeInside = fieldFor(requests.strokeInside)
  return { shadow, innerGlow, strokeOutside, strokeInside }
}

const distanceFieldAt = (field: BinaryDistanceField | null, x: number, y: number): number => {
  if (!field) return UNREACHABLE_BINARY_DISTANCE
  const localX = x - field.bounds.x
  const localY = y - field.bounds.y
  if (localX < 0 || localY < 0 || localX >= field.bounds.width || localY >= field.bounds.height) return UNREACHABLE_BINARY_DISTANCE
  return field.distances[localY * field.bounds.width + localX]
}

const localRectForLayer = (rect: SelectionRect, layer: RasterLayer): SelectionRect => ({
  x: rect.x - layer.offsetX,
  y: rect.y - layer.offsetY,
  width: rect.width,
  height: rect.height
})

const visibleBoundsWithinLocalRect = (document: SpriteDocument, layer: RasterLayer, rect: SelectionRect): SelectionRect | null => {
  const left = Math.max(0, Math.floor(rect.x))
  const top = Math.max(0, Math.floor(rect.y))
  const right = Math.min(layer.width, Math.ceil(rect.x + rect.width))
  const bottom = Math.min(layer.height, Math.ceil(rect.y + rect.height))
  if (right <= left || bottom <= top) return null
  const indexedAlpha = layer.format === 'indexed'
    ? new Map(document.palette.map((entry) => [entry.id, entry.color.a]))
    : null
  const rgbaPixels = layer.format === 'rgba' && !lazyRuntimeRasterForSurface(layer)
    ? layer.pixels
    : null
  let minX = right
  let minY = bottom
  let maxX = left - 1
  let maxY = top - 1
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const sourceIndex = y * layer.width + x
      const alpha = rgbaPixels
        ? rgbaPixels[sourceIndex * 4 + 3]
        : (() => {
            const packed = readSurfacePackedLocal(layer, x, y)
            return layer.format === 'rgba' ? packed >>> 24 : (indexedAlpha!.get(packed) ?? 0)
          })()
      if (alpha === 0) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }
  return maxX < minX || maxY < minY ? null : {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1
  }
}

/**
 * Updates a known content bound from a source dirty region without rescanning
 * the whole layer. The previous bound is intentionally retained when pixels
 * are erased from its edge; it is a safe superset and avoids a full scan on
 * every stroke. A later edit that reaches a new edge expands the superset.
 */
const incrementalContentBounds = (
  document: SpriteDocument,
  layer: RasterLayer,
  previous: SelectionRect | null,
  dirtyLocal: SelectionRect
): SelectionRect | null => {
  const changedBounds = visibleBoundsWithinLocalRect(document, layer, dirtyLocal)
  if (!previous) return changedBounds
  return changedBounds ? unionSelectionRects(previous, changedBounds) : { ...previous }
}

const intersectRect = (left: SelectionRect, right: SelectionRect): SelectionRect | null => {
  const x = Math.max(left.x, right.x)
  const y = Math.max(left.y, right.y)
  const rightEdge = Math.min(left.x + left.width, right.x + right.width)
  const bottomEdge = Math.min(left.y + left.height, right.y + right.height)
  return rightEdge > x && bottomEdge > y
    ? { x, y, width: rightEdge - x, height: bottomEdge - y }
    : null
}

const STYLED_LAYER_BLOCK_SIZE = 64

const STYLED_LAYER_PROXY = Symbol('moonSpriteStyledLayerProxy')

const EMPTY_STYLED_LAYER_PIXELS = new Uint8ClampedArray(4)

interface StyledLayerBlock {
  x: number
  y: number
  width: number
  height: number
  pixels: Uint8ClampedArray
}

interface StyledLayerBlockCache {
  sourceLayer: RasterLayer
  storage: object
  colorMode: SpriteDocument['colorMode']
  styleKey: string
  paletteKey: string
  styles: LayerStyles
  resolvedStyles: LayerStyles
  resolveStyleColor: (color: RgbaColor) => RgbaColor
  palette: Map<number, RgbaColor> | null
  palettePacked: Map<number, number> | null
  contentRevision: number
  sourceContentBounds: SelectionRect | null
  sourceWidth: number
  sourceHeight: number
  localX: number
  localY: number
  width: number
  height: number
  blocks: Map<string, StyledLayerBlock>
  layer: RasterLayer
}

type StyledLayerProxy = RasterLayer & {
  [STYLED_LAYER_PROXY]?: StyledLayerBlockCache
}

const styledLayerBlockCacheFor = (layer: RasterLayer): StyledLayerBlockCache | undefined =>
  (layer as StyledLayerProxy)[STYLED_LAYER_PROXY]

export class DocumentCompositeCache {
  private rowRanges = new WeakMap<object, Map<string, { contentRevision: number; ranges: Int32Array }>>()
  private visibleTiles = new WeakMap<object, Map<string, Map<number, boolean>>>()
  private normalLayerPlans = new WeakMap<SpriteDocument, { revision: number; frameId: string; layers: RasterLayer[] | null }>()
  private movePreviewLayerPlans = new WeakMap<SpriteDocument, { revision: number; frameId: string; layers: RasterLayer[] | null }>()
  private styledLayerPlans = new WeakMap<SpriteDocument, { revision: number; frameId: string; layers: RasterLayer[] | null }>()
  private opacityGroupPlans = new WeakMap<SpriteDocument, { revision: number; frameId: string; items: CompositeStackItem[] | null }>()
  private styledLayerBlocks = new WeakMap<RasterLayer, StyledLayerBlockCache>()
  private isolatedStyleTiles = new LayerStyleTileCache()
  private trackedStyleDocuments = new WeakSet<SpriteDocument>()
  private pendingStyleSources = new WeakMap<object, SelectionRect>()
  private styleSourceBounds = new WeakMap<RasterLayer, { storage: object; key: string; revision: number; bounds: SelectionRect | null }>()

  private compiledStyleSourceBounds(document: SpriteDocument, layer: RasterLayer, fallback?: SelectionRect): SelectionRect | null {
    const dirty = this.trackedStyleDocuments.has(document) ? this.pendingStyleSources.get(layer) : fallback
    const storage = rasterStorageIdentity(layer), revision = getLayerContentRevision(layer)
    const key = `${layer.width}:${layer.height}:${rasterContentPaletteKey(layer, document.palette)}`
    const cached = this.styleSourceBounds.get(layer)
    let bounds: SelectionRect | null
    if (!cached || cached.storage !== storage || cached.key !== key) bounds = rasterContentBounds(layer, document.palette)
    else if (dirty) {
      const local = localRectForLayer(dirty, layer), previous = cached.bounds
      // An interior edit cannot change the exact outer bounds. At an edge,
      // recompute exactly: group gradient geometry must also shrink on erase.
      bounds = previous && local.x > previous.x && local.y > previous.y
        && local.x + local.width < previous.x + previous.width && local.y + local.height < previous.y + previous.height
        ? previous : visibleBoundsWithinLocalRect(document, layer, { x: 0, y: 0, width: layer.width, height: layer.height })
    } else bounds = cached.revision === revision ? cached.bounds : rasterContentBounds(layer, document.palette)
    this.styleSourceBounds.set(layer, { storage, key, revision, bounds })
    return bounds ? { ...bounds, x: layer.offsetX + bounds.x, y: layer.offsetY + bounds.y } : null
  }

  compositeSourceBounds(document: SpriteDocument, layer: RasterLayer, dirty?: SelectionRect): SelectionRect | null {
    return this.compiledStyleSourceBounds(document, layer, dirty)
  }

  /** Keep source ownership and every edit until the relevant cache consumes it. */
  invalidateStyleSources(document: SpriteDocument, rect: SelectionRect, ownerIds?: readonly string[]): void {
    this.trackedStyleDocuments.add(document)
    const ids = ownerIds ? new Set(ownerIds) : null
    if (ids) for (const [ownerId, mask] of [...activeCelMasksByLayer(document), ...activeGroupMasksByGroup(document)]) {
      if (ids.has(mask.id)) ids.add(ownerId)
    }
    const owners: Array<RasterLayer | LayerGroup> = [...document.layers, ...document.groups]
    for (const owner of owners) {
      if (ids && !ids.has(owner.id)) continue
      let current: RasterLayer | LayerGroup | undefined = owner
      let affected = rect
      const visited = new Set<string>()
      while (current && !visited.has(current.id)) {
        visited.add(current.id)
        const previous = this.pendingStyleSources.get(current)
        this.pendingStyleSources.set(current, previous ? unionSelectionRects(previous, affected) : { ...affected })
        affected = layerStyleAffectedRect(affected, current.layerStyles)
        const parentId: string | null | undefined = 'parentGroupId' in current ? current.parentGroupId : (current as RasterLayer).groupId
        current = document.groups.find(group => group.id === parentId)
      }
    }
  }

  private takeStyleSourceDirty(document: SpriteDocument, owner: object, fallback?: SelectionRect): SelectionRect | undefined {
    if (!this.trackedStyleDocuments.has(document)) return fallback
    const rect = this.pendingStyleSources.get(owner)
    this.pendingStyleSources.delete(owner)
    return rect
  }

  isolatedStyleReader(document: SpriteDocument, owner: RasterLayer | LayerGroup, geometry: LayerStyleGeometry, styles: LayerStyles,
    read: (x: number, y: number) => RgbaColor, resolve: (color: RgbaColor) => RgbaColor, revision: number, fallback?: SelectionRect): (x: number, y: number) => RgbaColor {
    const dirty = this.takeStyleSourceDirty(document, owner, fallback)
    const key = `${document.animation?.activeFrameId ?? 'static'}:${document.colorMode}:${geometry.x},${geometry.y},${geometry.width},${geometry.height}:${layerStylesSignature(styles)}:${document.palette.map(entry => `${entry.id},${entry.color.r},${entry.color.g},${entry.color.b},${entry.color.a}`).join(';')}`
    return this.isolatedStyleTiles.prepare(owner, key, revision, dirty, geometry, styles, read, resolve)
  }

  invalidateAll(): void {
    this.rowRanges = new WeakMap()
    this.visibleTiles = new WeakMap()
    this.normalLayerPlans = new WeakMap()
    this.movePreviewLayerPlans = new WeakMap()
    this.styledLayerPlans = new WeakMap()
    this.opacityGroupPlans = new WeakMap()
    this.styledLayerBlocks = new WeakMap()
    this.isolatedStyleTiles = new LayerStyleTileCache()
    this.pendingStyleSources = new WeakMap()
    this.trackedStyleDocuments = new WeakSet()
    this.styleSourceBounds = new WeakMap()
  }

  /** Drop source-derived visibility indexes while a live stroke mutates pixels. */
  invalidateLiveSourceCaches(): void {
    this.rowRanges = new WeakMap()
    this.visibleTiles = new WeakMap()
  }

  /** A translation preserves a layer's own style pixels, but changes the
   * composite inside ancestor groups and masks that do not follow the owner. */
  invalidateLayerPlacementSources(document: SpriteDocument, rect: SelectionRect, layerIds?: readonly string[]): void {
    const ids = layerIds ? new Set(layerIds) : null
    const affected = new Set<string>()
    for (const layer of document.layers) {
      if (ids && !ids.has(layer.id)) continue
      if (layer.groupId) affected.add(layer.groupId)
      const mask = document.animation ? animationMaskAt(document.animation, layer.id, document.animation.activeFrameId) : null
      if (layer.clippingMask || mask?.moveWithOwner === false) affected.add(layer.id)
    }
    if (affected.size) this.invalidateStyleSources(document, rect, [...affected])
  }

  /** Drop placement plans while a live move mutates layer offsets in place. */
  invalidateLayerPlacementCaches(): void {
    // Normal and GPU move plans keep references to the live layer objects, so
    // their offsets are read on every composite. Styled plans, however,
    // contain derived proxy objects whose offsets must be rebuilt.
    this.styledLayerPlans = new WeakMap()
  }

  normalLayersFor(document: SpriteDocument, revision: number, sourceDirtyRect?: SelectionRect): RasterLayer[] | null {
    const frameId = document.animation?.activeFrameId ?? 'static'
    const cached = this.normalLayerPlans.get(document)
    if (cached && cached.revision === revision && cached.frameId === frameId) {
      return cached.layers
    }
    const layers = normalCompositeLayers(document)
    this.normalLayerPlans.set(document, { revision, frameId, layers })
    return layers
  }

  renderLayersFor(document: SpriteDocument, revision: number, sourceDirtyRect?: SelectionRect): RasterLayer[] | null {
    const normal = this.normalLayersFor(document, revision, sourceDirtyRect)
    if (normal) return normal
    const frameId = document.animation?.activeFrameId ?? 'static'
    const cached = this.styledLayerPlans.get(document)
    // Live paint mutates the active surface before the document revision is
    // committed. A dirty source region must therefore refresh styled proxies
    // even while the outer revision remains unchanged.
    const cachedSourcesAreCurrent = cached?.layers === null || cached?.layers?.every((layer) => {
      const styled = styledLayerBlockCacheFor(layer)
      return !styled || styled.contentRevision === getLayerContentRevision(styled.sourceLayer)
    })
    if (cached && cached.revision === revision && cached.frameId === frameId && !sourceDirtyRect && cachedSourcesAreCurrent
      && !document.layers.some(layer => this.pendingStyleSources.has(layer))) return cached.layers
    const unsupportedGroup = document.groups.some((group) => isGroupEffectivelyVisible(document, group) && (group.blendMode !== 'normal'
      || group.opacity !== 1
      || group.cumulativeBlend === true
      || group.clippingMask === true
      || hasEnabledLayerStyles(group.layerStyles)))
    const unsupportedLayer = document.layers.some((layer) => isLayerEffectivelyVisible(document, layer) && layer.opacity > 0 && (layer.clippingMask === true || layer.blendMode !== 'normal'))
    const hasMasks = activeCelMasksByLayer(document).size > 0 || activeGroupMasksByGroup(document).size > 0
    if (unsupportedGroup || unsupportedLayer || hasMasks) {
      this.styledLayerPlans.set(document, { revision, frameId, layers: null })
      return null
    }
    const preparedLayers = document.layers.map((layer) => hasEnabledLayerStyles(layer.layerStyles)
      ? this.styledLayer(document, layer, sourceDirtyRect)
      : layer)
    const layers = normalCompositeLayers({ ...document, layers: preparedLayers })
    this.styledLayerPlans.set(document, { revision, frameId, layers })
    return layers
  }

  /**
   * Returns a flat, bottom-to-top stack for move previews. Unlike the normal
   * render plan this permits a layer blend mode, but still rejects every
   * group/layer feature whose result depends on the surrounding stack.
   */
  movePreviewLayersFor(document: SpriteDocument, revision: number): RasterLayer[] | null {
    const frameId = document.animation?.activeFrameId ?? 'static'
    const cached = this.movePreviewLayerPlans.get(document)
    if (cached && cached.revision === revision && cached.frameId === frameId) return cached.layers
    const layers = normalCompositeLayers(document, true)
    this.movePreviewLayerPlans.set(document, { revision, frameId, layers })
    return layers
  }

  /** Returns the editable source behind a styled render proxy. */
  sourceLayerFor(layer: RasterLayer): RasterLayer {
    return styledLayerBlockCacheFor(layer)?.sourceLayer ?? layer
  }

  opacityGroupStackFor(document: SpriteDocument, revision: number): CompositeStackItem[] | null {
    const frameId = document.animation?.activeFrameId ?? 'static'
    const cached = this.opacityGroupPlans.get(document)
    if (cached && cached.revision === revision && cached.frameId === frameId) return cached.items
    const items = opacityGroupCompositeStack(document)
    this.opacityGroupPlans.set(document, { revision, frameId, items })
    return items
  }

  private invalidateStyledLayerBlocks(cache: StyledLayerBlockCache, rect: SelectionRect): void {
    const affected = rect
    const fromX = Math.floor(affected.x / STYLED_LAYER_BLOCK_SIZE)
    const fromY = Math.floor(affected.y / STYLED_LAYER_BLOCK_SIZE)
    const toX = Math.floor((affected.x + affected.width - 1) / STYLED_LAYER_BLOCK_SIZE)
    const toY = Math.floor((affected.y + affected.height - 1) / STYLED_LAYER_BLOCK_SIZE)
    for (let blockY = fromY; blockY <= toY; blockY += 1) for (let blockX = fromX; blockX <= toX; blockX += 1) {
      cache.blocks.delete(`${blockX}:${blockY}`)
    }
  }

  private styledLayerBlockProxy(document: SpriteDocument, sourceLayer: RasterLayer, sourceDirtyRect?: SelectionRect): RasterLayer {
    sourceDirtyRect = this.takeStyleSourceDirty(document, sourceLayer, sourceDirtyRect)
    const styleKey = layerStylesSignature(sourceLayer.layerStyles)
    const paletteKey = sourceLayer.format === 'indexed'
      ? document.palette.map((entry) => `${entry.id}:${entry.color.r}:${entry.color.g}:${entry.color.b}:${entry.color.a}`).join(',')
      : ''
    const storage = rasterStorageIdentity(sourceLayer)
    const contentRevision = getLayerContentRevision(sourceLayer)
    let cached = this.styledLayerBlocks.get(sourceLayer)
    if (!cached
      || cached.storage !== storage
      || cached.colorMode !== document.colorMode
      || cached.styleKey !== styleKey
      || cached.paletteKey !== paletteKey
      || cached.sourceWidth !== sourceLayer.width
      || cached.sourceHeight !== sourceLayer.height
      || cached.sourceLayer.format !== sourceLayer.format) {
      const styles = resolveLayerStyles(sourceLayer.layerStyles)
      const resolvedStyles = mapLayerStyleColors(styles, (color) => resolveLayerCanvasColor(document, sourceLayer, color))
      const sourceContentBounds = rasterContentBounds(sourceLayer, document.palette)
      const outputBounds = layerStyleOutputBounds(sourceContentBounds, resolvedStyles)
      const localX = outputBounds?.x ?? 0
      const localY = outputBounds?.y ?? 0
      const width = Math.max(1, outputBounds?.width ?? 1)
      const height = Math.max(1, outputBounds?.height ?? 1)
      const layer = {
        ...sourceLayer,
        format: 'rgba' as const,
        width,
        height,
        offsetX: sourceLayer.offsetX + localX,
        offsetY: sourceLayer.offsetY + localY,
        pixels: EMPTY_STYLED_LAYER_PIXELS,
        runtimeRaster: undefined,
        layerStyles: undefined
      } as RasterLayer
      cached = {
        sourceLayer,
        storage,
        colorMode: document.colorMode,
        styleKey,
        paletteKey,
        styles,
        resolvedStyles,
        resolveStyleColor: (color) => resolveLayerCanvasColor(document, sourceLayer, color),
        palette: sourceLayer.format === 'indexed' ? new Map(document.palette.map((entry) => [entry.id, entry.color])) : null,
        palettePacked: sourceLayer.format === 'indexed' ? new Map(document.palette.map((entry) => [entry.id, packColor(entry.color)])) : null,
        contentRevision,
        sourceContentBounds,
        sourceWidth: sourceLayer.width,
        sourceHeight: sourceLayer.height,
        localX,
        localY,
        width,
        height,
        blocks: new Map(),
        layer
      }
      this.styledLayerBlocks.set(sourceLayer, cached)
    }
    if (!cached) throw new Error('styled layer cache was not created')
    if (cached.contentRevision !== contentRevision || sourceDirtyRect) {
      let localBounds: SelectionRect | null
      if (sourceDirtyRect) {
        const dirtyLocal = localRectForLayer(sourceDirtyRect, sourceLayer)
        localBounds = incrementalContentBounds(document, sourceLayer, cached.sourceContentBounds, dirtyLocal)
        const outputBounds = layerStyleOutputBounds(localBounds, cached.resolvedStyles)
        const localX = outputBounds?.x ?? 0
        const localY = outputBounds?.y ?? 0
        const width = Math.max(1, outputBounds?.width ?? 1)
        const height = Math.max(1, outputBounds?.height ?? 1)
        // Unchanged fixed tiles remain valid when the visible output grows.
        this.invalidateStyledLayerBlocks(cached, layerStyleAffectedRect(dirtyLocal, cached.resolvedStyles))
        cached.localX = localX
        cached.localY = localY
        cached.width = width
        cached.height = height
      } else {
        localBounds = rasterContentBounds(sourceLayer, document.palette)
        const outputBounds = layerStyleOutputBounds(localBounds, cached.resolvedStyles)
        const localX = outputBounds?.x ?? 0
        const localY = outputBounds?.y ?? 0
        const width = Math.max(1, outputBounds?.width ?? 1)
        const height = Math.max(1, outputBounds?.height ?? 1)
        cached.blocks.clear()
        cached.localX = localX
        cached.localY = localY
        cached.width = width
        cached.height = height
      }
      cached.sourceContentBounds = localBounds
      cached.contentRevision = contentRevision
    }

    cached.sourceLayer = sourceLayer
    Object.assign(cached.layer, {
      ...sourceLayer,
      format: 'rgba' as const,
      width: cached.width,
      height: cached.height,
      offsetX: sourceLayer.offsetX + cached.localX,
      offsetY: sourceLayer.offsetY + cached.localY,
      pixels: EMPTY_STYLED_LAYER_PIXELS,
      runtimeRaster: undefined,
      layerStyles: undefined
    })
    Object.defineProperty(cached.layer, STYLED_LAYER_PROXY, {
      configurable: true,
      enumerable: true,
      value: cached
    })
    return cached.layer
  }

  private renderStyledLayerBlock(document: SpriteDocument, cache: StyledLayerBlockCache, block: StyledLayerBlock): Uint8ClampedArray {
    const pixels = new Uint8ClampedArray(block.width * block.height * 4)
    const sourceLayer = cache.sourceLayer
    const styles = cache.resolvedStyles
    const sourceBounds = { x: 0, y: 0, width: sourceLayer.width, height: sourceLayer.height }
    const rendersOutsideSource = styles.shadow.enabled
      || (styles.stroke.enabled && styles.stroke.position !== 'inside')
    if (!rendersOutsideSource && !intersectRect(block, sourceBounds)) return pixels

    const readSourcePacked = (x: number, y: number): number => {
      if (x < 0 || y < 0 || x >= sourceLayer.width || y >= sourceLayer.height) return 0
      const packed = readSurfacePackedLocal(sourceLayer, x, y)
      return sourceLayer.format === 'rgba' ? packed : (cache.palettePacked!.get(packed) ?? 0)
    }
    const readSource = (x: number, y: number): RgbaColor => {
      if (x < 0 || y < 0 || x >= sourceLayer.width || y >= sourceLayer.height) return TRANSPARENT
      const packed = readSurfacePackedLocal(sourceLayer, x, y)
      return sourceLayer.format === 'rgba' ? unpackColor(packed) : (cache.palette!.get(packed) ?? TRANSPARENT)
    }
    const binaryStrokeMetric = styles.stroke.enabled ? layerStyleBinaryStrokeMetric(styles.stroke) : null
    const localFields = localBinaryStyleFields(document, sourceLayer, block, styles, binaryStrokeMetric)
    const alphaCoverage = localFields ? undefined : layerStyleCoverageTile(block, styles, (x, y) => readSourcePacked(x, y) >>> 24)
    const completeCoverage = localFields ? hasCompleteBinaryStyleCoverage(styles, localFields)
      : Boolean(alphaCoverage && (!styles.stroke.enabled || ((styles.stroke.position === 'inside' || alphaCoverage.outsideStroke) && (styles.stroke.position === 'outside' || alphaCoverage.insideStroke))))
    const canUsePackedStyle = completeCoverage
      && !styles.stroke.enabled
      && !styles.stroke.smartHue
      && !styles.colorOverlay.enabled
      && !styles.gradientOverlay.enabled
      && (styles.shadow.enabled || styles.innerGlow.enabled || styles.stroke.enabled)

    const geometry = { x: 0, y: 0, width: sourceLayer.width, height: sourceLayer.height }

    for (let y = 0; y < block.height; y += 1) for (let x = 0; x < block.width; x += 1) {
      const sourceX = block.x + x
      const sourceY = block.y + y
      const sourcePacked = readSourcePacked(sourceX, sourceY)
      const sourceColor = sourceLayer.format === 'rgba' ? unpackColor(sourcePacked) : (cache.palette!.get(sourcePacked) ?? TRANSPARENT)
      if (!rendersOutsideSource && sourceColor.a === 0) continue
      const shadowDistanceAtPixel = localFields?.shadow
        ? distanceFieldAt(localFields.shadow, sourceX - styles.shadow.offsetX, sourceY - styles.shadow.offsetY)
        : 0
      const innerGlowDistanceAtPixel = localFields?.innerGlow
        ? distanceFieldAt(localFields.innerGlow, sourceX, sourceY)
        : 0
      const shadowCoverage = localFields?.shadow
        ? shadowDistanceAtPixel <= styles.shadow.blur ? 1 - shadowDistanceAtPixel / (styles.shadow.blur + 1) : 0
        : alphaCoverage?.shadow?.[y * block.width + x]
      const innerGlowCoverage = localFields?.innerGlow
        ? innerGlowDistanceAtPixel <= styles.innerGlow.size
          ? (styles.innerGlow.size - innerGlowDistanceAtPixel + 1) / styles.innerGlow.size
          : 0
        : alphaCoverage?.innerGlow?.[y * block.width + x]
      const outsideStrokeCoverage = localFields?.strokeOutside
        ? distanceFieldAt(localFields.strokeOutside, sourceX, sourceY) <= styles.stroke.size ? 1 : 0
        : alphaCoverage?.outsideStroke?.[y * block.width + x]
      const insideStrokeCoverage = localFields?.strokeInside
        ? distanceFieldAt(localFields.strokeInside, sourceX, sourceY) <= styles.stroke.size ? 1 : 0
        : alphaCoverage?.insideStroke?.[y * block.width + x]
      if (canUsePackedStyle) {
        const packed = applySimpleLayerStylesPacked(
          styles,
          sourceX,
          sourceY,
          sourcePacked,
          readSource,
          shadowCoverage,
          innerGlowCoverage,
          outsideStrokeCoverage,
          insideStrokeCoverage
        )
        if (packed !== null) {
          writeRgbaPixel(pixels, y * block.width + x, unpackColor(packed))
          continue
        }
      }
      writeRgbaPixel(pixels, y * block.width + x, applyLayerStylesAt(
        geometry,
        styles,
        sourceX,
        sourceY,
        sourceColor,
        readSource,
        cache.resolveStyleColor,
        {
          shadow: shadowCoverage,
          innerGlow: innerGlowCoverage,
          // The directed stroke sampler owns both geometry and the optional
          // follow-opacity alpha. Coverage tiles cannot represent that
          // source choice without changing the result at diagonal corners.
          outsideStroke: styles.stroke.enabled ? undefined : outsideStrokeCoverage,
          insideStroke: styles.stroke.enabled ? undefined : insideStrokeCoverage
        }
      ))
    }
    return pixels
  }

  private styledLayerBlockFor(document: SpriteDocument, cache: StyledLayerBlockCache, blockX: number, blockY: number): StyledLayerBlock {
    const key = `${blockX}:${blockY}`
    const cached = cache.blocks.get(key)
    if (cached) return cached
    const x = blockX * STYLED_LAYER_BLOCK_SIZE
    const y = blockY * STYLED_LAYER_BLOCK_SIZE
    const block: StyledLayerBlock = {
      x,
      y,
      width: STYLED_LAYER_BLOCK_SIZE,
      height: STYLED_LAYER_BLOCK_SIZE,
      pixels: new Uint8ClampedArray(0)
    }
    block.pixels = this.renderStyledLayerBlock(document, cache, block)
    cache.blocks.set(key, block)
    return block
  }

  compositeStyledLayerInto(document: SpriteDocument, layer: RasterLayer, startX: number, startY: number, width: number, height: number, output: Uint8ClampedArray): void {
    const cache = styledLayerBlockCacheFor(layer)
    if (!cache || !layer.visible || layer.opacity <= 0) return
    const left = Math.max(startX, layer.offsetX)
    const top = Math.max(startY, layer.offsetY)
    const right = Math.min(startX + width, layer.offsetX + cache.width)
    const bottom = Math.min(startY + height, layer.offsetY + cache.height)
    if (right <= left || bottom <= top) return
    const fromBlockX = Math.floor((left - cache.sourceLayer.offsetX) / STYLED_LAYER_BLOCK_SIZE)
    const toBlockX = Math.floor((right - 1 - cache.sourceLayer.offsetX) / STYLED_LAYER_BLOCK_SIZE)
    const fromBlockY = Math.floor((top - cache.sourceLayer.offsetY) / STYLED_LAYER_BLOCK_SIZE)
    const toBlockY = Math.floor((bottom - 1 - cache.sourceLayer.offsetY) / STYLED_LAYER_BLOCK_SIZE)
    const opacity = layer.opacity
    for (let blockY = fromBlockY; blockY <= toBlockY; blockY += 1) for (let blockX = fromBlockX; blockX <= toBlockX; blockX += 1) {
      const block = this.styledLayerBlockFor(document, cache, blockX, blockY)
      const blockLeft = layer.offsetX + block.x - cache.localX
      const blockTop = layer.offsetY + block.y - cache.localY
      const overlapLeft = Math.max(left, blockLeft)
      const overlapTop = Math.max(top, blockTop)
      const overlapRight = Math.min(right, blockLeft + block.width)
      const overlapBottom = Math.min(bottom, blockTop + block.height)
      if (overlapRight <= overlapLeft || overlapBottom <= overlapTop) continue
      for (let documentY = overlapTop; documentY < overlapBottom; documentY += 1) {
        const sourceOffset = ((documentY - blockTop) * block.width + overlapLeft - blockLeft) * 4
        const outputOffset = ((documentY - startY) * width + overlapLeft - startX) * 4
        if (opacity === 1) {
          compositeRgbaRowWithOpaqueSpans(output, block.pixels, sourceOffset, outputOffset, overlapRight - overlapLeft)
          continue
        }
        let sourcePixelOffset = sourceOffset
        let targetPixelOffset = outputOffset
        for (let documentX = overlapLeft; documentX < overlapRight; documentX += 1) {
          const sourceAlpha = block.pixels[sourcePixelOffset + 3]
          if (sourceAlpha > 0) {
            const bottomAlpha = output[targetPixelOffset + 3]
            const topAlpha = sourceAlpha / 255 * opacity
            const baseAlpha = bottomAlpha / 255
            const outputAlpha = topAlpha + baseAlpha * (1 - topAlpha)
            if (outputAlpha > 0) {
              output[targetPixelOffset] = Math.round((block.pixels[sourcePixelOffset] * topAlpha + output[targetPixelOffset] * baseAlpha * (1 - topAlpha)) / outputAlpha)
              output[targetPixelOffset + 1] = Math.round((block.pixels[sourcePixelOffset + 1] * topAlpha + output[targetPixelOffset + 1] * baseAlpha * (1 - topAlpha)) / outputAlpha)
              output[targetPixelOffset + 2] = Math.round((block.pixels[sourcePixelOffset + 2] * topAlpha + output[targetPixelOffset + 2] * baseAlpha * (1 - topAlpha)) / outputAlpha)
              output[targetPixelOffset + 3] = Math.round(outputAlpha * 255)
            }
          }
          sourcePixelOffset += 4
          targetPixelOffset += 4
        }
      }
    }
  }

  private styledLayer(document: SpriteDocument, sourceLayer: RasterLayer, sourceDirtyRect?: SelectionRect): RasterLayer {
    return this.styledLayerBlockProxy(document, sourceLayer, sourceDirtyRect)
  }


  normalLayerRegion(document: SpriteDocument, layers: readonly RasterLayer[], startX: number, startY: number, width: number, height: number, revision: number): Uint8ClampedArray {
    return compositeNormalLayers(document, layers, startX, startY, width, height, this, revision)
  }

  compositeNormalLayersInto(document: SpriteDocument, layers: readonly RasterLayer[], startX: number, startY: number, width: number, height: number, revision: number, output: Uint8ClampedArray): void {
    compositeNormalLayers(document, layers, startX, startY, width, height, this, revision, output)
  }

  movePreviewLayerRegion(document: SpriteDocument, layers: readonly RasterLayer[], startX: number, startY: number, width: number, height: number, revision: number): Uint8ClampedArray {
    const output = new Uint8ClampedArray(width * height * 4)
    compositeMovePreviewLayersInto(document, layers, startX, startY, width, height, revision, this, output)
    return output
  }

  compositeMovePreviewLayersInto(document: SpriteDocument, layers: readonly RasterLayer[], startX: number, startY: number, width: number, height: number, revision: number, output: Uint8ClampedArray): void {
    compositeMovePreviewLayersInto(document, layers, startX, startY, width, height, revision, this, output)
  }

  rowsFor(layer: RasterLayer, palette: readonly PaletteEntry[], _revision: number, dirtyRect?: SelectionRect): Int32Array {
    const paletteKey = layer.format === 'rgba' ? 'rgba' : palette.map((entry) => `${entry.id}:${entry.color.a}`).join(',')
    const key = `${layer.format}:${layer.width}:${layer.height}:${paletteKey}`
    const storage = rasterStorageIdentity(layer)
    const entries = this.rowRanges.get(storage) ?? new Map<string, { contentRevision: number; ranges: Int32Array }>()
    const cached = entries.get(key)
    const contentRevision = getLayerContentRevision(layer)
    if (cached?.contentRevision === contentRevision && !dirtyRect) return cached.ranges
    const ranges = cached?.ranges ?? new Int32Array(layer.height * 2)
    const opaqueIds = layer.format === 'indexed' ? new Set(palette.filter((entry) => entry.color.a > 0).map((entry) => entry.id)) : null
    const rgbaPixels = layer.format === 'rgba' && !lazyRuntimeRasterForSurface(layer)
      ? layer.pixels
      : null
    const visibleAt = (x: number, y: number): boolean => {
      const index = y * layer.width + x
      return rgbaPixels ? rgbaPixels[index * 4 + 3] > 0 : layer.format === 'rgba'
        ? layer.pixels[index * 4 + 3] > 0
        : opaqueIds!.has(layer.pixels[index])
    }
    const scanRange = (y: number, fromX: number, toX: number): { left: number; right: number } => {
      // Only the first and last visible pixels define the row bounds. A filled
      // 4K row needs two alpha reads, not a scan through all 4000 interior pixels.
      let left = fromX
      while (left < toX && !visibleAt(left, y)) left += 1
      if (left === toX) return { left: toX, right: fromX }
      let right = toX
      while (right > left + 1 && !visibleAt(right - 1, y)) right -= 1
      return { left, right }
    }
    const scanRow = (y: number): void => {
      const result = scanRange(y, 0, layer.width)
      ranges[y * 2] = result.left
      ranges[y * 2 + 1] = result.right
    }
    const updateRow = (y: number, dirtyLeft: number, dirtyRight: number): void => {
      if (dirtyRight <= dirtyLeft) return
      const oldLeft = ranges[y * 2]
      const oldRight = ranges[y * 2 + 1]
      const dirty = scanRange(y, dirtyLeft, dirtyRight)
      if (oldRight <= oldLeft) {
        ranges[y * 2] = dirty.left
        ranges[y * 2 + 1] = dirty.right
        return
      }

      let nextLeft = layer.width
      let nextRight = 0
      const dirtyHasPixels = dirty.right > dirty.left
      // Pixels outside the dirty interval are unchanged. Preserve a known
      // edge immediately when it is outside that interval; only rescan an
      // unchanged tail when an old edge was erased inside the interval.
      if (oldLeft < dirtyLeft || oldLeft >= dirtyRight) nextLeft = oldLeft
      else if (dirtyHasPixels) nextLeft = dirty.left
      else if (oldRight > dirtyRight) nextLeft = scanRange(y, dirtyRight, oldRight).left

      if (oldRight > dirtyRight || oldRight <= dirtyLeft) nextRight = oldRight
      else if (dirtyHasPixels) nextRight = dirty.right
      else if (oldLeft < dirtyLeft) nextRight = scanRange(y, oldLeft, dirtyLeft).right

      ranges[y * 2] = nextLeft
      ranges[y * 2 + 1] = nextRight
    }
    if (cached && dirtyRect) {
      const top = Math.max(0, Math.floor(dirtyRect.y - layer.offsetY))
      const bottom = Math.min(layer.height, Math.ceil(dirtyRect.y + dirtyRect.height - layer.offsetY))
      const dirtyLeft = Math.max(0, Math.floor(dirtyRect.x - layer.offsetX))
      const dirtyRight = Math.min(layer.width, Math.ceil(dirtyRect.x + dirtyRect.width - layer.offsetX))
      for (let y = top; y < bottom; y += 1) updateRow(y, dirtyLeft, dirtyRight)
    } else {
      for (let y = 0; y < layer.height; y += 1) scanRow(y)
    }
    let minX = layer.width
    let minY = layer.height
    let maxX = -1
    let maxY = -1
    for (let y = 0; y < layer.height; y += 1) {
      const left = ranges[y * 2]
      const right = ranges[y * 2 + 1]
      if (right > left) {
        minX = Math.min(minX, left)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, right - 1)
        maxY = y
      }
    }
    cacheRasterContentBounds(layer, palette, maxX < minX || maxY < minY ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 })
    if (entries.size >= 4 && !entries.has(key)) entries.clear()
    entries.set(key, { contentRevision, ranges })
    this.rowRanges.set(storage, entries)
    return ranges
  }

  tileHasVisiblePixels(layer: RasterLayer, palette: readonly PaletteEntry[], tileX: number, tileY: number, tileSize: number): boolean {
    const opaqueIds = layer.format === 'indexed' ? new Set(palette.filter((entry) => entry.color.a > 0).map((entry) => entry.id)) : undefined
    if (tileSize === runtimeRasterForSurface(layer)?.tileSize) {
      const visible = runtimeTileHasVisiblePixels(layer, tileX, tileY, opaqueIds)
      if (visible !== null) return visible
    }
    const paletteKey = layer.format === 'rgba' ? 'rgba' : palette.map((entry) => `${entry.id}:${entry.color.a}`).join(',')
    const key = `${layer.format}:${layer.width}:${layer.height}:${getLayerContentRevision(layer)}:${paletteKey}:${tileSize}`
    const storage = rasterStorageIdentity(layer)
    const entries = this.visibleTiles.get(storage) ?? new Map<string, Map<number, boolean>>()
    let tiles = entries.get(key)
    if (!tiles) {
      if (entries.size >= 2) entries.clear()
      tiles = new Map()
      entries.set(key, tiles)
    }
    const columns = Math.ceil(layer.width / tileSize)
    const tileIndex = tileY * columns + tileX
    const cached = tiles.get(tileIndex)
    if (cached !== undefined) return cached
    const fromX = tileX * tileSize
    const fromY = tileY * tileSize
    const toX = Math.min(layer.width, fromX + tileSize)
    const toY = Math.min(layer.height, fromY + tileSize)
    let visible = false
    for (let y = fromY; y < toY && !visible; y += 1) for (let x = fromX; x < toX; x += 1) {
      const index = y * layer.width + x
      if (layer.format === 'rgba' ? layer.pixels[index * 4 + 3] > 0 : opaqueIds!.has(layer.pixels[index])) { visible = true; break }
    }
    tiles.set(tileIndex, visible)
    entries.set(key, tiles)
    this.visibleTiles.set(storage, entries)
    return visible
  }
}

const MAX_ROW_RANGE_SCAN_PIXELS = 1024 * 1024

const COMPOSITE_TILE_SIZE = 64

/** Copies opaque spans in one operation while preserving transparent and translucent pixels. */
const compositeRgbaRowWithOpaqueSpans = (
  output: Uint8ClampedArray<ArrayBufferLike>,
  source: Uint8Array<ArrayBufferLike> | Uint8ClampedArray<ArrayBufferLike>,
  sourceOffset: number,
  outputOffset: number,
  pixelCount: number
): void => {
  let pixel = 0
  while (pixel < pixelCount) {
    const sourcePixelOffset = sourceOffset + pixel * 4
    const sourceAlpha = source[sourcePixelOffset + 3]
    if (sourceAlpha === 0) {
      pixel += 1
      continue
    }
    if (sourceAlpha === 255) {
      const spanStart = pixel
      pixel += 1
      while (pixel < pixelCount && source[sourceOffset + pixel * 4 + 3] === 255) pixel += 1
      output.set(
        source.subarray(sourceOffset + spanStart * 4, sourceOffset + pixel * 4),
        outputOffset + spanStart * 4
      )
      continue
    }

    const targetPixelOffset = outputOffset + pixel * 4
    const bottomAlpha = output[targetPixelOffset + 3]
    const topAlpha = sourceAlpha / 255
    const bottomAlphaNormalized = bottomAlpha / 255
    const outputAlpha = topAlpha + bottomAlphaNormalized * (1 - topAlpha)
    if (outputAlpha > 0) {
      output[targetPixelOffset] = Math.round((source[sourcePixelOffset] * topAlpha + output[targetPixelOffset] * bottomAlphaNormalized * (1 - topAlpha)) / outputAlpha)
      output[targetPixelOffset + 1] = Math.round((source[sourcePixelOffset + 1] * topAlpha + output[targetPixelOffset + 1] * bottomAlphaNormalized * (1 - topAlpha)) / outputAlpha)
      output[targetPixelOffset + 2] = Math.round((source[sourcePixelOffset + 2] * topAlpha + output[targetPixelOffset + 2] * bottomAlphaNormalized * (1 - topAlpha)) / outputAlpha)
      output[targetPixelOffset + 3] = Math.round(outputAlpha * 255)
    }
    pixel += 1
  }
}

const compositeNormalLayers = (document: SpriteDocument, layers: readonly RasterLayer[], startX: number, startY: number, width: number, height: number, cache?: DocumentCompositeCache, revision = 0, output: Uint8ClampedArray<ArrayBufferLike> = new Uint8ClampedArray(width * height * 4), dirtyRect?: SelectionRect): Uint8ClampedArray => {
  const paletteById = new Map(document.palette.map((entry) => [entry.id, entry.color]))
  for (const layer of layers) {
    if (cache && styledLayerBlockCacheFor(layer)) {
      cache.compositeStyledLayerInto(document, layer, startX, startY, width, height, output)
      continue
    }
    const runtime = lazyRuntimeRasterForSurface(layer)
    const rgbaPixels = !runtime && layer.format === 'rgba' ? layer.pixels : null
    const indexedPixels = !runtime && layer.format === 'indexed' ? layer.pixels : null
    const runtimeOpaqueIds = layer.format === 'indexed' ? new Set(document.palette.filter((entry) => entry.color.a > 0).map((entry) => entry.id)) : undefined
    const layerLeft = Math.max(startX, layer.offsetX)
    const top = Math.max(startY, layer.offsetY)
    const layerRight = Math.min(startX + width, layer.offsetX + layer.width)
    const bottom = Math.min(startY + height, layer.offsetY + layer.height)
    if (layerRight <= layerLeft || bottom <= top) continue
    const opacity = layer.opacity
    const rowRanges = !runtime && layer.width * layer.height <= MAX_ROW_RANGE_SCAN_PIXELS ? cache?.rowsFor(layer, document.palette, revision, dirtyRect) : undefined
    const largeLayerTiles = Boolean(runtime) || (!rowRanges && Boolean(cache))
    const tileSize = runtime?.tileSize ?? (largeLayerTiles ? COMPOSITE_TILE_SIZE : Math.max(layer.width, layer.height))
    const runtimeTileColumns = runtime ? Math.ceil(runtime.width / runtime.tileSize) : 0
    const fromTileX = largeLayerTiles ? Math.floor((layerLeft - layer.offsetX) / tileSize) : 0
    const toTileX = largeLayerTiles ? Math.floor((layerRight - 1 - layer.offsetX) / tileSize) : 0
    const fromTileY = largeLayerTiles ? Math.floor((top - layer.offsetY) / tileSize) : 0
    const toTileY = largeLayerTiles ? Math.floor((bottom - 1 - layer.offsetY) / tileSize) : 0
    for (let tileY = fromTileY; tileY <= toTileY; tileY += 1) for (let tileX = fromTileX; tileX <= toTileX; tileX += 1) {
      if (largeLayerTiles) {
        const visible = runtime
          ? runtimeTileHasVisiblePixels(layer, tileX, tileY, runtimeOpaqueIds)
          : cache!.tileHasVisiblePixels(layer, document.palette, tileX, tileY, tileSize)
        if (!visible) continue
      }
      const tileLeft = layer.offsetX + tileX * tileSize
      const tileTop = layer.offsetY + tileY * tileSize
      const tileRight = Math.min(layer.offsetX + layer.width, tileLeft + tileSize)
      const tileBottom = Math.min(layer.offsetY + layer.height, tileTop + tileSize)
      const runtimeTileWidth = runtime ? Math.min(runtime.tileSize, runtime.width - tileX * runtime.tileSize) : 0
      const runtimeTileDataOffset = runtime
        ? runtime.tileOffsets[tileY * runtimeTileColumns + tileX] - 1
        : 0
      for (let documentY = Math.max(top, tileTop); documentY < Math.min(bottom, tileBottom); documentY += 1) {
        const localY = documentY - layer.offsetY
        const left = rowRanges ? Math.max(layerLeft, layer.offsetX + rowRanges[localY * 2]) : Math.max(layerLeft, tileLeft)
        const right = rowRanges ? Math.min(layerRight, layer.offsetX + rowRanges[localY * 2 + 1]) : Math.min(layerRight, tileRight)
        if (right <= left) continue
        let sourceIndex = (documentY - layer.offsetY) * layer.width + left - layer.offsetX
        let outputOffset = ((documentY - startY) * width + left - startX) * 4
        const runtimeRowDataOffset = runtime
          ? runtimeTileDataOffset + ((localY - tileY * runtime.tileSize) * runtimeTileWidth + left - tileLeft) * 4
          : 0
        if (opacity === 1 && rgbaPixels) {
          compositeRgbaRowWithOpaqueSpans(output, rgbaPixels, sourceIndex * 4, outputOffset, right - left)
          continue
        }
        if (opacity === 1 && runtime?.format === 'rgba') {
          compositeRgbaRowWithOpaqueSpans(output, runtime.data, runtimeRowDataOffset, outputOffset, right - left)
          continue
        }
        let runtimeSourceOffset = runtimeRowDataOffset
        for (let documentX = left; documentX < right; documentX += 1, sourceIndex += 1, outputOffset += 4) {
        let sourceR: number
        let sourceG: number
        let sourceB: number
        let sourceA: number
        if (rgbaPixels) {
          const sourceOffset = sourceIndex * 4
          sourceR = rgbaPixels[sourceOffset]
          sourceG = rgbaPixels[sourceOffset + 1]
          sourceB = rgbaPixels[sourceOffset + 2]
          sourceA = rgbaPixels[sourceOffset + 3]
        } else {
          let packed: number
          if (runtime) {
            packed = (runtime.data[runtimeSourceOffset] | (runtime.data[runtimeSourceOffset + 1] << 8) | (runtime.data[runtimeSourceOffset + 2] << 16) | (runtime.data[runtimeSourceOffset + 3] << 24)) >>> 0
            runtimeSourceOffset += 4
          } else packed = indexedPixels?.[sourceIndex] ?? readSurfacePackedLocal(layer, sourceIndex % layer.width, Math.floor(sourceIndex / layer.width))
          if (layer.format === 'rgba') {
            sourceR = packed & 0xff
            sourceG = (packed >>> 8) & 0xff
            sourceB = (packed >>> 16) & 0xff
            sourceA = (packed >>> 24) & 0xff
          } else {
            const source = paletteById.get(packed) ?? TRANSPARENT
            sourceR = source.r
            sourceG = source.g
            sourceB = source.b
            sourceA = source.a
          }
        }
        if (sourceA === 0) continue
        const bottomA = output[outputOffset + 3]
        if (opacity === 1 && (bottomA === 0 || sourceA === 255)) {
          output[outputOffset] = sourceR
          output[outputOffset + 1] = sourceG
          output[outputOffset + 2] = sourceB
          output[outputOffset + 3] = sourceA
          continue
        }
        const topAlpha = sourceA / 255 * opacity
        const bottomAlpha = bottomA / 255
        const outputAlpha = topAlpha + bottomAlpha * (1 - topAlpha)
        if (outputAlpha <= 0) continue
        output[outputOffset] = Math.round((sourceR * topAlpha + output[outputOffset] * bottomAlpha * (1 - topAlpha)) / outputAlpha)
        output[outputOffset + 1] = Math.round((sourceG * topAlpha + output[outputOffset + 1] * bottomAlpha * (1 - topAlpha)) / outputAlpha)
        output[outputOffset + 2] = Math.round((sourceB * topAlpha + output[outputOffset + 2] * bottomAlpha * (1 - topAlpha)) / outputAlpha)
        output[outputOffset + 3] = Math.round(outputAlpha * 255)
        }
      }
    }
  }
  return output
}

const compositeNormalBufferInto = (output: Uint8ClampedArray<ArrayBufferLike>, source: Uint8ClampedArray<ArrayBufferLike>, opacity: number): void => {
  for (let offset = 0; offset < source.length; offset += 4) {
    const sourceA = source[offset + 3]
    if (sourceA === 0) continue
    const bottomA = output[offset + 3]
    if (opacity === 1 && (bottomA === 0 || sourceA === 255)) {
      output[offset] = source[offset]
      output[offset + 1] = source[offset + 1]
      output[offset + 2] = source[offset + 2]
      output[offset + 3] = sourceA
      continue
    }
    const topAlpha = sourceA / 255 * opacity
    const bottomAlpha = bottomA / 255
    const outputAlpha = topAlpha + bottomAlpha * (1 - topAlpha)
    if (outputAlpha <= 0) continue
    output[offset] = Math.round((source[offset] * topAlpha + output[offset] * bottomAlpha * (1 - topAlpha)) / outputAlpha)
    output[offset + 1] = Math.round((source[offset + 1] * topAlpha + output[offset + 1] * bottomAlpha * (1 - topAlpha)) / outputAlpha)
    output[offset + 2] = Math.round((source[offset + 2] * topAlpha + output[offset + 2] * bottomAlpha * (1 - topAlpha)) / outputAlpha)
    output[offset + 3] = Math.round(outputAlpha * 255)
  }
}

/** Composites a plain raster layer with its own blend mode without falling back
 * to the per-pixel recursive document sampler. */
const compositeLayerWithModeInto = (
  document: SpriteDocument,
  layer: RasterLayer,
  startX: number,
  startY: number,
  width: number,
  height: number,
  output: Uint8ClampedArray<ArrayBufferLike>
): void => {
  const left = Math.max(startX, layer.offsetX)
  const top = Math.max(startY, layer.offsetY)
  const right = Math.min(startX + width, layer.offsetX + layer.width)
  const bottom = Math.min(startY + height, layer.offsetY + layer.height)
  if (right <= left || bottom <= top) return
  const paletteById = layer.format === 'indexed'
    ? new Map(document.palette.map((entry) => [entry.id, entry.color]))
    : null
  const opacity = layer.opacity
  const sourceWidth = right - left
  const sourceHeight = bottom - top
  const directRgbaPixels = layer.format === 'rgba' && !lazyRuntimeRasterForSurface(layer)
    ? layer.pixels
    : null
  const sourceRgba = layer.format === 'rgba' && !directRgbaPixels
    ? readSurfaceRgbaRegion(layer, left - layer.offsetX, top - layer.offsetY, sourceWidth, sourceHeight)
    : null
  const sourceIndexed = layer.format === 'indexed'
    ? readSurfacePackedRegion(layer, left - layer.offsetX, top - layer.offsetY, sourceWidth, sourceHeight)
    : null
  for (let row = 0; row < sourceHeight; row += 1) {
    let sourceOffset = row * sourceWidth * 4
    let directSourceOffset = ((top + row - layer.offsetY) * layer.width + left - layer.offsetX) * 4
    let sourceIndex = row * sourceWidth
    let outputOffset = ((top + row - startY) * width + left - startX) * 4
    for (let column = 0; column < sourceWidth; column += 1, sourceOffset += 4, sourceIndex += 1, outputOffset += 4) {
      const sourceRgbaPixels = directRgbaPixels ?? sourceRgba
      const sourceRgbaOffset = directRgbaPixels ? directSourceOffset : sourceOffset
      let sourceR: number
      let sourceG: number
      let sourceB: number
      let sourceA: number
      if (sourceRgbaPixels) {
        sourceR = sourceRgbaPixels[sourceRgbaOffset]
        sourceG = sourceRgbaPixels[sourceRgbaOffset + 1]
        sourceB = sourceRgbaPixels[sourceRgbaOffset + 2]
        sourceA = sourceRgbaPixels[sourceRgbaOffset + 3]
      } else {
        const source = paletteById!.get(sourceIndexed![sourceIndex]) ?? TRANSPARENT
        sourceR = source.r
        sourceG = source.g
        sourceB = source.b
        sourceA = source.a
      }
      directSourceOffset += 4
      if (sourceA === 0) continue
      const bottomAlpha = output[outputOffset + 3]
      if (opacity === 1 && bottomAlpha === 0) {
        output[outputOffset] = sourceR
        output[outputOffset + 1] = sourceG
        output[outputOffset + 2] = sourceB
        output[outputOffset + 3] = sourceA
        continue
      }
      blendWithModeInto(
        output,
        outputOffset,
        output[outputOffset],
        output[outputOffset + 1],
        output[outputOffset + 2],
        bottomAlpha,
        sourceR,
        sourceG,
        sourceB,
        sourceA,
        opacity,
        layer.blendMode
      )
    }
  }
}

/** Composites the simple layer stack used by the live move preview. Groups
 * have already been flattened and validated, so layer blend modes can be
 * applied in the same bottom-to-top order as the document compositor. */
export const compositeMovePreviewLayersInto = (
  document: SpriteDocument,
  layers: readonly RasterLayer[],
  startX: number,
  startY: number,
  width: number,
  height: number,
  revision: number,
  cache: DocumentCompositeCache,
  output: Uint8ClampedArray<ArrayBufferLike>
): void => {
  let normalLayers: RasterLayer[] = []
  const flushNormalLayers = (): void => {
    if (normalLayers.length === 0) return
    compositeNormalLayers(document, normalLayers, startX, startY, width, height, cache, revision, output)
    normalLayers = []
  }
  for (const layer of layers) {
    if (layer.blendMode === 'normal') {
      normalLayers.push(layer)
      continue
    }
    flushNormalLayers()
    compositeLayerWithModeInto(document, layer, startX, startY, width, height, output)
  }
  flushNormalLayers()
}

const compositeBufferWithModeInto = (
  output: Uint8ClampedArray<ArrayBufferLike>,
  source: Uint8ClampedArray<ArrayBufferLike>,
  opacity: number,
  blendMode: BlendMode
): void => {
  if (blendMode === 'normal') {
    compositeNormalBufferInto(output, source, opacity)
    return
  }
  for (let offset = 0; offset < source.length; offset += 4) {
    const sourceA = source[offset + 3]
    if (sourceA === 0) continue
    const bottomA = output[offset + 3]
    if (opacity === 1 && bottomA === 0) {
      output[offset] = source[offset]
      output[offset + 1] = source[offset + 1]
      output[offset + 2] = source[offset + 2]
      output[offset + 3] = sourceA
      continue
    }
    const blended = blendWithMode(
      { r: output[offset], g: output[offset + 1], b: output[offset + 2], a: bottomA },
      { r: source[offset], g: source[offset + 1], b: source[offset + 2], a: sourceA },
      opacity,
      blendMode
    )
    output[offset] = blended.r
    output[offset + 1] = blended.g
    output[offset + 2] = blended.b
    output[offset + 3] = blended.a
  }
}

const compositeOpacityGroupStack = (
  document: SpriteDocument,
  items: readonly CompositeStackItem[],
  startX: number,
  startY: number,
  width: number,
  height: number,
  cache?: DocumentCompositeCache,
  revision = 0,
  output: Uint8ClampedArray<ArrayBufferLike> = new Uint8ClampedArray(width * height * 4),
  dirtyRect?: SelectionRect
): Uint8ClampedArray => {
  let layerBatch: RasterLayer[] = []
  const flushLayers = (): void => {
    if (layerBatch.length === 0) return
    compositeNormalLayers(document, layerBatch, startX, startY, width, height, cache, revision, output, dirtyRect)
    layerBatch = []
  }
  for (const item of items) {
    if (item.kind === 'layer') {
      if (item.layer.blendMode === 'normal') layerBatch.push(item.layer)
      else {
        flushLayers()
        compositeLayerWithModeInto(document, item.layer, startX, startY, width, height, output)
      }
      continue
    }
    flushLayers()
    if (item.group.opacity === 1 && item.group.blendMode === 'normal') {
      compositeOpacityGroupStack(document, item.children, startX, startY, width, height, cache, revision, output, dirtyRect)
      continue
    }
    const groupOutput = compositeOpacityGroupStack(document, item.children, startX, startY, width, height, cache, revision, undefined, dirtyRect)
    compositeBufferWithModeInto(output, groupOutput, item.group.opacity, item.group.blendMode)
  }
  flushLayers()
  return output
}

export function compositeRegion(document: SpriteDocument, startX: number, startY: number, width: number, height: number, cache?: DocumentCompositeCache, revision = 0, dirtyRect?: SelectionRect, sourceDirtyRect?: SelectionRect): Uint8ClampedArray {
  const output = new Uint8ClampedArray(width * height * 4)
  if (document.groups.length === 0 && document.layers.length === 1) {
    const layer = document.layers[0]
    const activeMasks = activeCelMasksByLayer(document)
    if (!layer.visible || layer.opacity <= 0) return output
    if (!hasEnabledLayerStyles(layer.layerStyles) && !activeMasks.has(layer.id) && layer.opacity === 1 && layer.format === 'rgba') {
      if (lazyRuntimeRasterForSurface(layer)) {
        return readSurfaceRgbaRegion(layer, startX - layer.offsetX, startY - layer.offsetY, width, height)
      }
      for (let y = 0; y < height; y += 1) {
        const localY = startY + y - layer.offsetY
        const localStartX = startX - layer.offsetX
        const fromX = Math.max(0, localStartX)
        const toX = Math.min(layer.width, localStartX + width)
        if (localY < 0 || localY >= layer.height || toX <= fromX) continue
        const destinationX = fromX - localStartX
        const sourceOffset = (localY * layer.width + fromX) * 4
        output.set(layer.pixels.subarray(sourceOffset, sourceOffset + (toX - fromX) * 4), (y * width + destinationX) * 4)
      }
      return output
    }
    if (!hasEnabledLayerStyles(layer.layerStyles) && !activeMasks.has(layer.id) && layer.opacity === 1 && layer.format === 'indexed') {
      const palette = new Map(document.palette.map((entry) => [entry.id, entry.color]))
      for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
        const index = layerIndexAt(layer, startX + x, startY + y)
        const color = index === null ? TRANSPARENT : (palette.get(readSurfacePackedLocal(layer, index % layer.width, Math.floor(index / layer.width))) ?? TRANSPARENT)
        writeRgbaPixel(output, y * width + x, color)
      }
      return output
    }
  }
  const normalLayers = cache ? cache.renderLayersFor(document, revision, sourceDirtyRect) : normalCompositeLayers(document)
  if (normalLayers) return compositeNormalLayers(document, normalLayers, startX, startY, width, height, cache, revision, undefined, dirtyRect)
  const opacityGroupStack = cache ? cache.opacityGroupStackFor(document, revision) : opacityGroupCompositeStack(document)
  if (opacityGroupStack) return compositeOpacityGroupStack(document, opacityGroupStack, startX, startY, width, height, cache, revision, undefined, dirtyRect)
  const sample = compileCompositePointSampler(document, undefined, cache, revision, sourceDirtyRect)
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    writeRgbaPixel(output, y * width + x, sample(startX + x, startY + y, undefined))
  }
  return output
}

/**
 * Responsive counterpart used by long-running exports. The sampler is
 * compiled once, then rows are processed in small batches so the renderer can
 * repaint progress and react to cancellation while large canvases composite.
 */
export async function compositeRegionAsync(
  document: SpriteDocument,
  startX: number,
  startY: number,
  width: number,
  height: number,
  onProgress?: (value: number) => void,
  shouldCancel?: () => boolean,
  rowsPerBatch = 8
): Promise<Uint8ClampedArray> {
  const output = new Uint8ClampedArray(width * height * 4)
  const sample = createCompositePointSampler(document)
  const yieldHost = (): Promise<void> => new Promise((resolve) => {
    if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') window.setTimeout(resolve, 0)
    else setTimeout(resolve, 0)
  })
  for (let y = 0; y < height; y += 1) {
    if (shouldCancel?.()) throw new Error('MoonSprite export canceled.')
    for (let x = 0; x < width; x += 1) writeRgbaPixel(output, y * width + x, sample(startX + x, startY + y))
    onProgress?.((y + 1) / Math.max(1, height) * 100)
    if ((y + 1) % Math.max(1, rowsPerBatch) === 0 && y + 1 < height) await yieldHost()
  }
  return output
}

export function compositePixel(document: SpriteDocument, index: number): RgbaColor {
  return compositePixelWithLayerColor(document, index)
}

type CompositePointReplacementSampler = (x: number, y: number, replacement: RgbaColor | undefined) => RgbaColor

const compileCompositePointSampler = (document: SpriteDocument, layerId?: string, styleCache?: DocumentCompositeCache, revision = 0, sourceDirtyRect?: SelectionRect): CompositePointReplacementSampler => {
  const paletteById = new Map(document.palette.map((entry) => [entry.id, entry.color]))
  type CompiledItem = { styleReader?: (x: number, y: number) => RgbaColor } & (
    | { kind: 'layer'; layer: RasterLayer; read: CompositePointReplacementSampler; resolveStyleColor: (color: RgbaColor) => RgbaColor; styles?: ReturnType<typeof resolveLayerStyles>; outputBounds: SelectionRect | null }
    | { kind: 'group'; group: LayerGroup; children: CompiledItem[]; resolveStyleColor: (color: RgbaColor) => RgbaColor; styles?: ReturnType<typeof resolveLayerStyles>; geometry: LayerStyleGeometry; outputBounds: SelectionRect | null })
  const mergeBounds = (bounds: readonly (SelectionRect | null)[]): SelectionRect | null => {
    let result: SelectionRect | null = null
    for (const boundsEntry of bounds) if (boundsEntry) result = result ? unionSelectionRects(result, boundsEntry) : { ...boundsEntry }
    return result
  }
  const compileLayer = (layer: RasterLayer): CompiledItem => {
    const readIndex = (x: number, y: number): number | null => layerIndexAt(layer, x, y)
    let readSource: CompositePointReplacementSampler
    if (layer.format === 'rgba') {
      readSource = (x, y) => { const local = readIndex(x, y); return local === null ? TRANSPARENT : unpackColor(readSurfacePackedLocal(layer, local % layer.width, Math.floor(local / layer.width))) }
    } else {
      readSource = (x, y) => { const local = readIndex(x, y); return local === null ? TRANSPARENT : (paletteById.get(readSurfacePackedLocal(layer, local % layer.width, Math.floor(local / layer.width))) ?? TRANSPARENT) }
    }
    const resolveStyleColor = (styleColor: RgbaColor): RgbaColor => resolveLayerCanvasColor(document, layer, styleColor)
    const styles = hasEnabledLayerStyles(layer.layerStyles)
      ? mapLayerStyleColors(resolveLayerStyles(layer.layerStyles), resolveStyleColor)
      : undefined
    const outputBounds = layerStyleOutputBounds(styleCache ? styleCache.compositeSourceBounds(document, layer, sourceDirtyRect) : layerContentBounds(document, layer), styles)
    if (layer.id !== layerId) return { kind: 'layer', layer, read: readSource, resolveStyleColor, ...(styles ? { styles } : {}), outputBounds }
    return {
      kind: 'layer',
      layer,
      resolveStyleColor,
      ...(styles ? { styles } : {}),
      outputBounds,
      read: (x, y, replacement) => replacement === undefined
        ? readSource(x, y, replacement)
        : x >= 0 && y >= 0 && x < document.width && y < document.height ? replacement : TRANSPARENT
    }
  }
  const compileContainer = (items: readonly CompositeStackItem[]): CompiledItem[] => items.map((item) => {
    if (item.kind === 'layer') return compileLayer(item.layer)
    const children = compileContainer(item.children)
    const sourceBounds = mergeBounds(children.filter((child) => itemVisibleBeforeCompile(child)).map((child) => child.outputBounds))
    const geometry = sourceBounds ?? { x: 0, y: 0, width: document.width, height: document.height }
    const resolveStyleColor = (styleColor: RgbaColor): RgbaColor => resolveDocumentCanvasColor(document, styleColor)
    const styles = hasEnabledLayerStyles(item.group.layerStyles)
      ? mapLayerStyleColors(resolveLayerStyles(item.group.layerStyles), resolveStyleColor)
      : undefined
    return { kind: 'group', group: item.group, children, resolveStyleColor, ...(styles ? { styles } : {}), geometry, outputBounds: layerStyleOutputBounds(sourceBounds, styles) }
  })
  const itemVisibleBeforeCompile = (item: CompiledItem): boolean => item.kind === 'layer'
    ? item.layer.visible && item.layer.opacity > 0
    : item.group.visible && item.group.opacity > 0

  const root = compileContainer(buildCompositeStack(document))
  const activeMasks = activeCelMasksByLayer(document)
  const activeGroupMasks = activeGroupMasksByGroup(document)
  const itemMask = (item: CompiledItem): LayerMask | undefined => item.kind === 'layer' ? activeMasks.get(item.layer.id) : activeGroupMasks.get(item.group.id)
  const readMaskCoverage = (mask: LayerMask, x: number, y: number, replacement: RgbaColor | undefined): number => {
    if (mask.id === layerId && replacement !== undefined) return maskCoverageFromColor(replacement)
    const index = layerIndexAt(mask, x, y)
    if (index === null) return 255
    const offset = index * 4
    return mask.pixels[offset + 3] === 0 ? 255 : mask.pixels[offset]
  }
  const applyItemMask = (item: CompiledItem, source: RgbaColor, x: number, y: number, replacement: RgbaColor | undefined): RgbaColor => {
    const mask = itemMask(item)
    if (!mask || source.a === 0) return source
    return { ...source, a: Math.round(source.a * readMaskCoverage(mask, x, y, replacement) / 255) }
  }
  const clipsToLowerSibling = (item: CompiledItem): boolean => item.kind === 'layer' ? item.layer.clippingMask === true : item.group.clippingMask === true
  const itemVisible = (item: CompiledItem): boolean => item.kind === 'layer' ? item.layer.visible : item.group.visible
  const itemOpacity = (item: CompiledItem): number => item.kind === 'layer' ? item.layer.opacity : item.group.opacity
  const itemBlendMode = (item: CompiledItem): BlendMode => item.kind === 'layer' ? item.layer.blendMode : item.group.blendMode
  function isolatedItemSource(item: CompiledItem, x: number, y: number, replacement: RgbaColor | undefined): RgbaColor {
    if (!itemVisible(item)) return TRANSPARENT
    return item.kind === 'group'
      ? applyItemMask(item, compositeContainer(item.children, x, y, replacement), x, y, replacement)
      : applyItemMask(item, item.read(x, y, replacement), x, y, replacement)
  }
  function isolatedItemColor(item: CompiledItem, x: number, y: number, replacement: RgbaColor | undefined): RgbaColor {
    if (item.styles && styleCache && replacement === undefined) {
      if (!item.styleReader) {
        const owner = item.kind === 'layer' ? item.layer : item.group
        const geometry = item.kind === 'layer' ? { x: item.layer.offsetX, y: item.layer.offsetY, width: item.layer.width, height: item.layer.height } : item.geometry
        item.styleReader = styleCache.isolatedStyleReader(document, owner, geometry, item.styles,
          (sx, sy) => isolatedItemSource(item, sx, sy, undefined), item.resolveStyleColor, revision, sourceDirtyRect)
      }
      return item.styleReader(x, y)
    }
    const source = isolatedItemSource(item, x, y, replacement)
    if (!item.styles) return source
    const geometry = item.kind === 'layer' ? item.layer : item.geometry
    return applyLayerStylesAt(geometry, item.styles, x, y, source, (sourceX, sourceY) => isolatedItemSource(item, sourceX, sourceY, undefined), item.resolveStyleColor)
  }
  function compositeIsolatedSource(backdrop: RgbaColor, item: CompiledItem, source: RgbaColor): RgbaColor {
    const opacity = itemOpacity(item)
    if (source.a === 0 || opacity <= 0) return backdrop
    const blendMode = itemBlendMode(item)
    return opacity === 1 && (backdrop.a === 0 || (blendMode === 'normal' && source.a === 255))
      ? source
      : blendWithMode(backdrop, source, opacity, blendMode)
  }
  function compositeRegularItem(backdrop: RgbaColor, item: CompiledItem, x: number, y: number, replacement: RgbaColor | undefined): RgbaColor {
    if (!itemVisible(item) || itemOpacity(item) <= 0) return backdrop
    if (item.kind === 'layer') return compositeIsolatedSource(backdrop, item, isolatedItemColor(item, x, y, replacement))
    if (item.group.cumulativeBlend === true && !item.styles) {
      const isolatedColor = isolatedItemColor(item, x, y, replacement)
      if (isolatedColor.a === 0) return backdrop
      const cumulativeColor = applyItemMask(item, compositeContainer(item.children, x, y, replacement, backdrop), x, y, replacement)
      return blendWithMode(backdrop, cumulativeColor, item.group.opacity, item.group.blendMode)
    }
    if (item.group.blendMode === 'normal' && item.group.opacity === 1 && !itemMask(item) && !item.styles) return compositeContainer(item.children, x, y, replacement, backdrop)
    return compositeIsolatedSource(backdrop, item, isolatedItemColor(item, x, y, replacement))
  }
  function compositeClippedMember(backdrop: RgbaColor, item: CompiledItem, x: number, y: number, replacement: RgbaColor | undefined): RgbaColor {
    if (!itemVisible(item) || itemOpacity(item) <= 0) return backdrop
    if (item.kind === 'layer') return compositeIsolatedSource(backdrop, item, isolatedItemColor(item, x, y, replacement))
    if (item.group.cumulativeBlend === true && !item.styles) {
      const isolatedColor = isolatedItemColor(item, x, y, replacement)
      if (isolatedColor.a === 0) return backdrop
      const cumulativeColor = applyItemMask(item, compositeContainer(item.children, x, y, replacement, backdrop), x, y, replacement)
      return blendWithMode(backdrop, cumulativeColor, item.group.opacity, item.group.blendMode)
    }
    return compositeIsolatedSource(backdrop, item, isolatedItemColor(item, x, y, replacement))
  }
  function compositeContainer(items: CompiledItem[], x: number, y: number, replacement: RgbaColor | undefined, backdrop: RgbaColor = TRANSPARENT): RgbaColor {
    let color = backdrop
    for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
      const item = items[itemIndex]
      if (items[itemIndex + 1] && clipsToLowerSibling(items[itemIndex + 1])) {
        let lastClippedIndex = itemIndex
        while (items[lastClippedIndex + 1] && clipsToLowerSibling(items[lastClippedIndex + 1])) lastClippedIndex += 1
        const baseSource = isolatedItemColor(item, x, y, replacement)
        if (baseSource.a > 0 && itemVisible(item) && itemOpacity(item) > 0) {
          let stackColor: RgbaColor = { ...baseSource, a: 255 }
          for (let clippedIndex = itemIndex + 1; clippedIndex <= lastClippedIndex; clippedIndex += 1) {
            stackColor = compositeClippedMember(stackColor, items[clippedIndex], x, y, replacement)
          }
          color = compositeIsolatedSource(color, item, { ...stackColor, a: baseSource.a })
        }
        itemIndex = lastClippedIndex
      } else {
        color = compositeRegularItem(color, item, x, y, replacement)
      }
    }
    return color
  }
  return (x, y, replacement) => compositeContainer(root, x, y, replacement)
}

/** Composites a pixel while optionally substituting one layer's source color. */
export function createCompositePointSampler(document: SpriteDocument, layerId?: string, replacement?: RgbaColor): (x: number, y: number) => RgbaColor {
  const sample = compileCompositePointSampler(document, layerId)
  return (x, y) => sample(x, y, replacement)
}

/** Uses spatial buckets when the document can be composited as ordinary visible layers. */
export function createNormalCompositePointSampler(document: SpriteDocument): ((x: number, y: number) => RgbaColor) | null {
  const layers = normalCompositeLayers(document)
  if (!layers) return null
  const tileSize = 512
  const columns = Math.max(1, Math.ceil(document.width / tileSize))
  const rows = Math.max(1, Math.ceil(document.height / tileSize))
  const buckets = Array.from({ length: columns * rows }, () => [] as RasterLayer[])
  for (const layer of layers) {
    const left = Math.max(0, layer.offsetX)
    const top = Math.max(0, layer.offsetY)
    const right = Math.min(document.width, layer.offsetX + layer.width)
    const bottom = Math.min(document.height, layer.offsetY + layer.height)
    if (right <= left || bottom <= top) continue
    const fromColumn = Math.floor(left / tileSize)
    const toColumn = Math.min(columns - 1, Math.floor((right - 1) / tileSize))
    const fromRow = Math.floor(top / tileSize)
    const toRow = Math.min(rows - 1, Math.floor((bottom - 1) / tileSize))
    for (let row = fromRow; row <= toRow; row += 1) for (let column = fromColumn; column <= toColumn; column += 1) buckets[row * columns + column].push(layer)
  }
  const paletteById = new Map(document.palette.map((entry) => [entry.id, entry.color]))
  return (x, y) => {
    if (x < 0 || y < 0 || x >= document.width || y >= document.height) return TRANSPARENT
    let outputR = 0
    let outputG = 0
    let outputB = 0
    let outputA = 0
    const column = Math.min(columns - 1, Math.floor(x / tileSize))
    const row = Math.min(rows - 1, Math.floor(y / tileSize))
    for (const layer of buckets[row * columns + column]) {
      const index = layerIndexAt(layer, x, y)
      if (index === null) continue
      const packed = readSurfacePackedLocal(layer, index % layer.width, Math.floor(index / layer.width))
      const source = layer.format === 'rgba' ? unpackColor(packed) : (paletteById.get(packed) ?? TRANSPARENT)
      if (source.a === 0 || layer.opacity <= 0) continue
      if (layer.opacity === 1 && (outputA === 0 || source.a === 255)) {
        outputR = source.r
        outputG = source.g
        outputB = source.b
        outputA = source.a
        continue
      }
      const topAlpha = source.a / 255 * layer.opacity
      const bottomAlpha = outputA / 255
      const nextAlpha = topAlpha + bottomAlpha * (1 - topAlpha)
      if (nextAlpha <= 0) continue
      outputR = Math.round((source.r * topAlpha + outputR * bottomAlpha * (1 - topAlpha)) / nextAlpha)
      outputG = Math.round((source.g * topAlpha + outputG * bottomAlpha * (1 - topAlpha)) / nextAlpha)
      outputB = Math.round((source.b * topAlpha + outputB * bottomAlpha * (1 - topAlpha)) / nextAlpha)
      outputA = Math.round(nextAlpha * 255)
    }
    return { r: outputR, g: outputG, b: outputB, a: outputA }
  }
}

/** Composites document coordinates while accepting a different replacement color for every point. */
export function createCompositePointReplacementSampler(document: SpriteDocument, layerId: string): (x: number, y: number, replacement: RgbaColor) => RgbaColor {
  const sample = compileCompositePointSampler(document, layerId)
  return (x, y, replacement) => sample(x, y, replacement)
}

/** Uses spatially bucketed normal layers when replacement preview compositing does not need the full group tree. */
export function createNormalCompositePointReplacementSampler(document: SpriteDocument, layerId: string): ((x: number, y: number, replacement: RgbaColor) => RgbaColor) | null {
  const layers = normalCompositeLayers(document)
  if (!layers?.some((layer) => layer.id === layerId)) return null
  const tileSize = 512
  const columns = Math.max(1, Math.ceil(document.width / tileSize))
  const rows = Math.max(1, Math.ceil(document.height / tileSize))
  const buckets = Array.from({ length: columns * rows }, () => [] as RasterLayer[])
  for (const layer of layers) {
    const left = layer.id === layerId ? 0 : Math.max(0, layer.offsetX)
    const top = layer.id === layerId ? 0 : Math.max(0, layer.offsetY)
    const right = layer.id === layerId ? document.width : Math.min(document.width, layer.offsetX + layer.width)
    const bottom = layer.id === layerId ? document.height : Math.min(document.height, layer.offsetY + layer.height)
    if (right <= left || bottom <= top) continue
    const fromColumn = Math.floor(left / tileSize)
    const toColumn = Math.min(columns - 1, Math.floor((right - 1) / tileSize))
    const fromRow = Math.floor(top / tileSize)
    const toRow = Math.min(rows - 1, Math.floor((bottom - 1) / tileSize))
    for (let row = fromRow; row <= toRow; row += 1) for (let column = fromColumn; column <= toColumn; column += 1) {
      buckets[row * columns + column].push(layer)
    }
  }
  const paletteById = new Map(document.palette.map((entry) => [entry.id, entry.color]))
  const readSource = (layer: RasterLayer, x: number, y: number, replacement: RgbaColor): RgbaColor => {
    if (layer.id === layerId) return replacement
    const index = layerIndexAt(layer, x, y)
    if (index === null) return TRANSPARENT
    const packed = readSurfacePackedLocal(layer, index % layer.width, Math.floor(index / layer.width))
    return layer.format === 'rgba' ? unpackColor(packed) : (paletteById.get(packed) ?? TRANSPARENT)
  }
  return (x, y, replacement) => {
    if (x < 0 || y < 0 || x >= document.width || y >= document.height) return TRANSPARENT
    let outputR = 0
    let outputG = 0
    let outputB = 0
    let outputA = 0
    const column = Math.min(columns - 1, Math.floor(x / tileSize))
    const row = Math.min(rows - 1, Math.floor(y / tileSize))
    for (const layer of buckets[row * columns + column]) {
      const source = readSource(layer, x, y, replacement)
      if (source.a === 0 || layer.opacity <= 0) continue
      if (layer.opacity === 1 && (outputA === 0 || source.a === 255)) {
        outputR = source.r
        outputG = source.g
        outputB = source.b
        outputA = source.a
        continue
      }
      const topAlpha = source.a / 255 * layer.opacity
      const bottomAlpha = outputA / 255
      const nextAlpha = topAlpha + bottomAlpha * (1 - topAlpha)
      if (nextAlpha <= 0) continue
      outputR = Math.round((source.r * topAlpha + outputR * bottomAlpha * (1 - topAlpha)) / nextAlpha)
      outputG = Math.round((source.g * topAlpha + outputG * bottomAlpha * (1 - topAlpha)) / nextAlpha)
      outputB = Math.round((source.b * topAlpha + outputB * bottomAlpha * (1 - topAlpha)) / nextAlpha)
      outputA = Math.round(nextAlpha * 255)
    }
    return { r: outputR, g: outputG, b: outputB, a: outputA }
  }
}

/** Composites document coordinates through the same compiled layer tree. */
export function createCompositeSampler(document: SpriteDocument, layerId?: string, replacement?: RgbaColor): (index: number) => RgbaColor {
  const samplePoint = createCompositePointSampler(document, layerId, replacement)
  return (index) => samplePoint(index % document.width, Math.floor(index / document.width))
}

export function compositePixelWithLayerColor(document: SpriteDocument, index: number, layerId?: string, replacement?: RgbaColor): RgbaColor {
  return createCompositeSampler(document, layerId, replacement)(index)
}

export const compositeDocument = (document: SpriteDocument): Uint8ClampedArray => compositeRegion(document, 0, 0, document.width, document.height)

/** Returns the canvas-clipped bounds of the final visible composite. */
export function documentVisibleContentBounds(document: SpriteDocument): SelectionRect | null {
  const surface: AnimationCelSurface = {
    format: 'rgba',
    width: document.width,
    height: document.height,
    offsetX: 0,
    offsetY: 0,
    pixels: compositeDocument(document)
  }
  return rasterContentBounds(surface)
}
