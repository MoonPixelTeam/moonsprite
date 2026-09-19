import type { BlendMode } from '@shared/types-color'
import type { LayerGroup, RasterLayer } from '@shared/types-layer'
import type { SpriteDocument } from '@shared/types-document'
import { animationLayersAtFrame, ensureAnimationDocument, refreshActiveAnimationFrame, syncActiveAnimationFrame } from './animation'
import { compositeDocument } from './document-composite'
import { createId, createLayer, getDescendantGroupIds, isLayerEffectivelyLocked, paletteColorIdForCanvas } from './document-model'
import { applyRelativeLuminance } from './raster'
import { translateCurrent as tr } from './localization'

export interface LayerMergeSuccess {
  ok: true
  layerId: string
  removedLayerIds: string[]
  removedGroupIds: string[]
}

export type LayerMergeResult = LayerMergeSuccess | { ok: false; reason: string }

interface MergedLayerProperties {
  groupId: string | null
  visible: boolean
  locked: boolean
  opacity: number
  blendMode: BlendMode
  clippingMask?: boolean
}

function createMergedLayer(document: SpriteDocument, name: string, pixels: Uint8ClampedArray, properties: MergedLayerProperties): RasterLayer {
  const layer = createLayer(name, document.width, document.height, document.colorMode)
  layer.groupId = properties.groupId
  layer.visible = properties.visible
  layer.locked = properties.locked
  layer.opacity = properties.opacity
  layer.blendMode = properties.blendMode
  if (properties.clippingMask === true) layer.clippingMask = true
  if (layer.format === 'rgba') {
    layer.pixels.set(document.colorMode === 'grayscale' ? applyRelativeLuminance(pixels.slice()) : pixels)
  } else {
    for (let index = 0; index < layer.pixels.length; index += 1) {
      const offset = index * 4
      layer.pixels[index] = paletteColorIdForCanvas(document, {
        r: pixels[offset],
        g: pixels[offset + 1],
        b: pixels[offset + 2],
        a: pixels[offset + 3]
      })
    }
  }
  return layer
}

function compositeLayers(document: SpriteDocument, layers: RasterLayer[]): Uint8ClampedArray {
  const temporary: SpriteDocument = {
    ...document,
    layers: layers.map((layer) => ({ ...layer, groupId: null } as RasterLayer)),
    groups: [],
    activeLayerId: layers.at(-1)?.id ?? document.activeLayerId
  }
  return compositeDocument(temporary)
}

/** Bake every frame before changing the source layer tree or timeline slots. */
function renderMergedFrames(document: SpriteDocument, name: string, properties: MergedLayerProperties, render: (frame: SpriteDocument) => Uint8ClampedArray) {
  syncActiveAnimationFrame(document)
  const timeline = ensureAnimationDocument(document)
  return timeline.frames.map((frame) => {
    const frameDocument = {
      ...document,
      layers: animationLayersAtFrame(document, frame.id),
      animation: { ...timeline, activeFrameId: frame.id }
    }
    return { frameId: frame.id, layer: createMergedLayer(document, name, render(frameDocument), properties) }
  })
}

function installMergedFrames(document: SpriteDocument, merged: RasterLayer, frames: ReturnType<typeof renderMergedFrames>, removedLayerIds: readonly string[]): void {
  // The layer tree has already changed: do not normalize it until all output
  // slots exist, or non-active frames would be filled with blank cels.
  const timeline = document.animation!
  const removed = new Set(removedLayerIds)
  timeline.cels = timeline.cels.filter((cel) => !removed.has(cel.layerId))
  for (const { frameId, layer } of frames) {
    const geometry = { width: layer.width, height: layer.height, offsetX: layer.offsetX, offsetY: layer.offsetY }
    timeline.cels.push({
      id: createId('cel'), layerId: merged.id, frameId, opacity: layer.opacity,
      surface: layer.format === 'rgba'
        ? { ...geometry, format: 'rgba', pixels: layer.pixels }
        : { ...geometry, format: 'indexed', pixels: layer.pixels }
    })
  }
  refreshActiveAnimationFrame(document)
}

export function mergeRasterLayers(document: SpriteDocument, layerIds: string[]): LayerMergeResult {
  const requested = new Set(layerIds)
  const layers = document.layers.filter((layer) => requested.has(layer.id))
  if (layers.length < 2) return { ok: false, reason: tr('core.layerMerge.needTwo') }
  const parentGroupId = layers[0].groupId ?? null
  if (!layers.every((layer) => (layer.groupId ?? null) === parentGroupId)) return { ok: false, reason: tr('core.layerMerge.sameLevel') }
  if (layers.some((layer) => !layer.visible)) return { ok: false, reason: tr('core.layerMerge.hidden') }
  if (layers.some((layer) => isLayerEffectivelyLocked(document, layer))) return { ok: false, reason: tr('core.layerMerge.locked') }
  const indexes = layers.map((layer) => document.layers.indexOf(layer)).sort((left, right) => left - right)
  if (indexes.at(-1)! - indexes[0] + 1 !== indexes.length) return { ok: false, reason: tr('core.layerMerge.contiguous') }

  const topLayer = layers.at(-1)!
  const mergedFrames = renderMergedFrames(document, tr('core.layerMerge.nameSuffix', { name: topLayer.name }), {
    groupId: parentGroupId, visible: true, locked: false, opacity: 1, blendMode: 'normal'
  }, (frame) => compositeLayers(frame, frame.layers.filter((layer) => requested.has(layer.id))))
  const merged = mergedFrames.find((frame) => frame.frameId === document.animation!.activeFrameId)!.layer
  const removedLayerIds = layers.map((layer) => layer.id)
  document.layers = document.layers.filter((layer) => !requested.has(layer.id))
  document.layers.splice(indexes[0], 0, merged)
  document.activeLayerId = merged.id
  installMergedFrames(document, merged, mergedFrames, removedLayerIds)
  return { ok: true, layerId: merged.id, removedLayerIds, removedGroupIds: [] }
}

export function mergeLayerDown(document: SpriteDocument, layerId: string): LayerMergeResult {
  const active = document.layers.find((layer) => layer.id === layerId)
  if (!active) return { ok: false, reason: tr('core.layerMerge.activeMissing') }
  const siblings = document.layers.filter((layer) => (layer.groupId ?? null) === (active.groupId ?? null))
  const index = siblings.findIndex((layer) => layer.id === active.id)
  if (index <= 0) return { ok: false, reason: tr('core.layerMerge.belowMissing') }
  return mergeRasterLayers(document, [siblings[index - 1].id, active.id])
}

export function mergeLayerGroup(document: SpriteDocument, groupId: string): LayerMergeResult {
  const group = document.groups.find((candidate) => candidate.id === groupId)
  if (!group) return { ok: false, reason: tr('core.layerMerge.groupMissing') }
  const removedGroupIds = [groupId, ...getDescendantGroupIds(document, groupId)]
  const groupIds = new Set(removedGroupIds)
  const layers = document.layers.filter((layer) => Boolean(layer.groupId && groupIds.has(layer.groupId)))
  if (layers.length === 0) return { ok: false, reason: tr('core.layerMerge.emptyGroup') }
  if (group.locked || layers.some((layer) => isLayerEffectivelyLocked(document, layer))) return { ok: false, reason: tr('core.layerMerge.groupLocked') }

  const groupCopies = document.groups
    .filter((candidate) => groupIds.has(candidate.id))
    .map((candidate): LayerGroup => candidate.id === groupId
      ? { ...candidate, parentGroupId: null, visible: true, locked: false, opacity: 1, blendMode: 'normal' }
      : { ...candidate })
  const sourceIds = new Set(layers.map((layer) => layer.id))
  const mergedFrames = renderMergedFrames(document, group.name, {
    groupId: group.parentGroupId ?? null,
    visible: group.visible,
    locked: group.locked,
    opacity: group.opacity,
    blendMode: group.blendMode,
    clippingMask: group.clippingMask === true
  }, (frame) => compositeDocument({
    ...frame,
    layers: frame.layers.filter((layer) => sourceIds.has(layer.id)),
    groups: groupCopies,
    activeLayerId: layers.at(-1)!.id
  }))
  const merged = mergedFrames.find((frame) => frame.frameId === document.animation!.activeFrameId)!.layer
  const indexes = layers.map((layer) => document.layers.indexOf(layer))
  const insertionIndex = Math.min(...indexes)
  const removedLayerIds = layers.map((layer) => layer.id)
  const removedLayerSet = new Set(removedLayerIds)
  document.layers = document.layers.filter((layer) => !removedLayerSet.has(layer.id))
  document.layers.splice(insertionIndex, 0, merged)
  document.groups = document.groups.filter((candidate) => !groupIds.has(candidate.id))
  document.activeLayerId = merged.id
  installMergedFrames(document, merged, mergedFrames, removedLayerIds)
  return { ok: true, layerId: merged.id, removedLayerIds, removedGroupIds }
}

function removeEmptyGroups(document: SpriteDocument): string[] {
  const removed: string[] = []
  let changed = true
  while (changed) {
    changed = false
    for (const group of [...document.groups]) {
      const hasLayer = document.layers.some((layer) => layer.groupId === group.id)
      const hasChild = document.groups.some((candidate) => candidate.parentGroupId === group.id)
      if (hasLayer || hasChild) continue
      document.groups = document.groups.filter((candidate) => candidate.id !== group.id)
      removed.push(group.id)
      changed = true
    }
  }
  return removed
}

export function mergeVisibleLayers(document: SpriteDocument): LayerMergeResult {
  const visibleLayers = document.layers.filter((layer) => {
    if (!layer.visible) return false
    let groupId = layer.groupId ?? null
    const visited = new Set<string>()
    while (groupId && !visited.has(groupId)) {
      visited.add(groupId)
      const group = document.groups.find((candidate) => candidate.id === groupId)
      if (!group || !group.visible) return false
      groupId = group.parentGroupId ?? null
    }
    return true
  })
  if (visibleLayers.length < 2) return { ok: false, reason: tr('core.layerMerge.visibleNeedTwo') }
  if (visibleLayers.some((layer) => isLayerEffectivelyLocked(document, layer))) return { ok: false, reason: tr('core.layerMerge.visibleLocked') }

  const mergedFrames = renderMergedFrames(document, tr('core.layerMerge.visibleName'), {
    groupId: null, visible: true, locked: false, opacity: 1, blendMode: 'normal'
  }, compositeDocument)
  const merged = mergedFrames.find((frame) => frame.frameId === document.animation!.activeFrameId)!.layer
  const removedLayerIds = visibleLayers.map((layer) => layer.id)
  const removedLayerSet = new Set(removedLayerIds)
  document.layers = document.layers.filter((layer) => !removedLayerSet.has(layer.id))
  document.layers.push(merged)
  const removedGroupIds = removeEmptyGroups(document)
  document.activeLayerId = merged.id
  installMergedFrames(document, merged, mergedFrames, removedLayerIds)
  return { ok: true, layerId: merged.id, removedLayerIds, removedGroupIds }
}
