import type { SelectionMask, SelectionRect, SpriteDocument } from '@shared/types'
import { animationLayersAtFrame, cloneDocumentForAnimationFrame } from './animation'
import { resolveAnimationLoopSectionRange } from './animation-loop-sections'
import { compositeRegion, createDocument, getActiveLayer, getLayerIdsInGroup, isLayerEffectivelyVisible } from './document'
import { translateCurrent as tr } from './localization'
import { selectionContains } from './selection'

export type SpriteSheetLayout = 'horizontal' | 'vertical' | 'rows' | 'columns'
export type SpriteSheetConstraint = 'none' | 'fixed-columns' | 'fixed-width' | 'fixed-rows' | 'fixed-height'
export type SpriteSheetAreaTarget = 'canvas' | 'selection' | `slice:${string}`
export type SpriteSheetLayerScope = 'visible' | 'all' | 'selected'
export type SpriteSheetFrameScope = 'all' | 'selected' | `loop:${string}`

export interface SpriteSheetLayoutSettings {
  layout: SpriteSheetLayout
  constraint: SpriteSheetConstraint
  fixedColumns: number
  fixedWidth: number
  fixedRows: number
  fixedHeight: number
  mergeDuplicates: boolean
  ignoreEmpty: boolean
}

export interface SpriteSheetExportOptions extends SpriteSheetLayoutSettings {
  area: SpriteSheetAreaTarget
  layerScope: SpriteSheetLayerScope
  splitLayers: boolean
  frameScope: SpriteSheetFrameScope
  splitLoopSections: boolean
  outputFile: boolean
  name: string
  directory: string
}

export interface SpriteSheetExportSelection {
  selectedLayerIds: readonly string[]
  selectedGroupIds: readonly string[]
  selectedFrameIds: readonly string[]
  selection?: SelectionMask | null
}

export interface SpriteSheetExportTarget {
  frameIds: string[]
  layerIds: string[] | null
  suffixes: string[]
}

export interface SpriteSheetDocumentNames {
  document: string
  layer: string
}

export interface SpriteSheetBuildOptions extends SpriteSheetLayoutSettings {
  area: SelectionRect
  selection?: SelectionMask | null
  frameIds: readonly string[]
  /** Null keeps current visibility; an array isolates and reveals only those layers. */
  layerIds: readonly string[] | null
}

export interface SpriteSheetBuildResult {
  document: SpriteDocument
  itemCount: number
  sourceItemCount: number
}

export interface SpriteSheetBuildNames {
  document: string
  layer: string
}

export interface SpriteSheetLayoutMetrics {
  columns: number
  rows: number
  width: number
  height: number
}

export class EmptySpriteSheetError extends Error {}

const spriteSheetTimeline = (source: SpriteDocument) => source.animation ?? {
  frames: [{ id: 'frame-1', duration: 100 }],
  cels: [],
  groupMasks: [],
  loopSections: [],
  activeFrameId: 'frame-1',
  loop: true
}

const checkedProduct = (left: number, right: number): number => {
  const value = left * right
  if (!Number.isSafeInteger(value)) throw new Error(tr('core.spriteSheet.dimensions'))
  return value
}

export function spriteSheetLayoutMetrics(
  itemCount: number,
  cellWidth: number,
  cellHeight: number,
  settings: Pick<SpriteSheetLayoutSettings, 'layout' | 'constraint' | 'fixedColumns' | 'fixedWidth' | 'fixedRows' | 'fixedHeight'>
): SpriteSheetLayoutMetrics {
  if (!Number.isSafeInteger(itemCount) || itemCount < 1) throw new Error(tr('core.spriteSheet.noItems'))
  if (!Number.isSafeInteger(cellWidth) || !Number.isSafeInteger(cellHeight) || cellWidth < 1 || cellHeight < 1) {
    throw new Error(tr('core.spriteSheet.invalidArea'))
  }
  if (settings.layout === 'horizontal') {
    return { columns: itemCount, rows: 1, width: checkedProduct(cellWidth, itemCount), height: cellHeight }
  }
  if (settings.layout === 'vertical') {
    return { columns: 1, rows: itemCount, width: cellWidth, height: checkedProduct(cellHeight, itemCount) }
  }

  if (settings.layout === 'rows' && settings.constraint === 'fixed-width') {
    const requestedWidth = Math.trunc(settings.fixedWidth)
    if (!Number.isSafeInteger(requestedWidth)) throw new Error(tr('core.spriteSheet.dimensions'))
    const width = Math.max(cellWidth, requestedWidth)
    const columns = Math.max(1, Math.floor(width / cellWidth))
    const rows = Math.ceil(itemCount / columns)
    return { columns, rows, width, height: checkedProduct(cellHeight, rows) }
  }

  if (settings.layout === 'rows') {
    const requestedColumns = Math.trunc(settings.fixedColumns)
    if (!Number.isSafeInteger(requestedColumns)) throw new Error(tr('core.spriteSheet.dimensions'))
    const columns = settings.constraint === 'fixed-columns' ? Math.max(1, requestedColumns) : itemCount
    const rows = Math.ceil(itemCount / columns)
    return {
      columns,
      rows,
      width: checkedProduct(cellWidth, columns),
      height: checkedProduct(cellHeight, rows)
    }
  }

  if (settings.constraint === 'fixed-height') {
    const requestedHeight = Math.trunc(settings.fixedHeight)
    if (!Number.isSafeInteger(requestedHeight)) throw new Error(tr('core.spriteSheet.dimensions'))
    const height = Math.max(cellHeight, requestedHeight)
    const rows = Math.max(1, Math.floor(height / cellHeight))
    const columns = Math.ceil(itemCount / rows)
    return { columns, rows, width: checkedProduct(cellWidth, columns), height }
  }

  const requestedRows = Math.trunc(settings.fixedRows)
  if (!Number.isSafeInteger(requestedRows)) throw new Error(tr('core.spriteSheet.dimensions'))
  const rows = settings.constraint === 'fixed-rows' ? Math.max(1, requestedRows) : itemCount
  const columns = Math.ceil(itemCount / rows)
  return {
    columns,
    rows,
    width: checkedProduct(cellWidth, columns),
    height: checkedProduct(cellHeight, rows)
  }
}

export function resolveSpriteSheetArea(source: SpriteDocument, target: SpriteSheetAreaTarget, selection?: SelectionMask | null): SelectionRect {
  if (target === 'canvas') return { x: 0, y: 0, width: source.width, height: source.height }
  if (target === 'selection') {
    if (!selection) throw new Error(tr('core.spriteSheet.selectionMissing'))
    return { x: selection.x, y: selection.y, width: selection.width, height: selection.height }
  }
  const slice = (source.slices ?? []).find((candidate) => `slice:${candidate.id}` === target)
  if (!slice) throw new Error(tr('core.spriteSheet.areaMissing'))
  return { x: slice.x, y: slice.y, width: slice.width, height: slice.height }
}

export function resolveSpriteSheetLayerIds(
  source: SpriteDocument,
  scope: SpriteSheetLayerScope,
  selection: Pick<SpriteSheetExportSelection, 'selectedLayerIds' | 'selectedGroupIds'>
): string[] {
  if (scope === 'all') return source.layers.map((layer) => layer.id)
  if (scope === 'visible') return source.layers.filter((layer) => isLayerEffectivelyVisible(source, layer)).map((layer) => layer.id)
  const selected = new Set(selection.selectedLayerIds)
  for (const groupId of selection.selectedGroupIds) for (const layerId of getLayerIdsInGroup(source, groupId)) selected.add(layerId)
  if (selected.size === 0 && source.activeLayerId) selected.add(source.activeLayerId)
  return source.layers.filter((layer) => selected.has(layer.id)).map((layer) => layer.id)
}

const loopFrameIds = (source: SpriteDocument, loopSectionId: string): string[] => {
  const timeline = spriteSheetTimeline(source)
  const section = (timeline.loopSections ?? []).find((candidate) => candidate.id === loopSectionId)
  if (!section) throw new Error(tr('core.spriteSheet.loopMissing'))
  const range = resolveAnimationLoopSectionRange(timeline, section)
  if (!range) throw new Error(tr('core.spriteSheet.loopMissing'))
  const ids = timeline.frames.slice(range.startIndex, range.endIndex + 1).map((frame) => frame.id)
  return section.direction === 'reverse' ? ids.reverse() : ids
}

const scopedFrameIds = (
  source: SpriteDocument,
  scope: SpriteSheetFrameScope,
  selectedFrameIds: readonly string[]
): string[] => {
  const timeline = spriteSheetTimeline(source)
  if (scope.startsWith('loop:')) return loopFrameIds(source, scope.slice('loop:'.length))
  if (scope === 'all') return timeline.frames.map((frame) => frame.id)
  const selected = new Set(selectedFrameIds)
  const ids = timeline.frames.filter((frame) => selected.has(frame.id)).map((frame) => frame.id)
  return ids.length > 0 ? ids : [timeline.activeFrameId]
}

export function createSpriteSheetExportTargets(
  source: SpriteDocument,
  selection: SpriteSheetExportSelection,
  options: Pick<SpriteSheetExportOptions, 'layerScope' | 'splitLayers' | 'frameScope' | 'splitLoopSections'>
): SpriteSheetExportTarget[] {
  const timeline = spriteSheetTimeline(source)
  const scopedLayers = resolveSpriteSheetLayerIds(source, options.layerScope, selection)
  const layerTargets = options.splitLayers
    ? scopedLayers.map((layerId) => ({ layerIds: [layerId], suffix: source.layers.find((layer) => layer.id === layerId)?.name ?? layerId }))
    : [{ layerIds: options.layerScope === 'visible' ? null : scopedLayers, suffix: null }]
  const frameTargets = options.splitLoopSections
    ? (timeline.loopSections ?? []).flatMap((section) => {
        const range = resolveAnimationLoopSectionRange(timeline, section)
        if (!range) return []
        const frameIds = timeline.frames.slice(range.startIndex, range.endIndex + 1).map((frame) => frame.id)
        return [{ frameIds: section.direction === 'reverse' ? frameIds.reverse() : frameIds, suffix: section.name }]
      })
    : [{ frameIds: scopedFrameIds(source, options.frameScope, selection.selectedFrameIds), suffix: null }]

  return layerTargets.flatMap((layerTarget) => frameTargets.map((frameTarget) => ({
    frameIds: frameTarget.frameIds,
    layerIds: layerTarget.layerIds,
    suffixes: [layerTarget.suffix, frameTarget.suffix].filter((value): value is string => Boolean(value))
  })))
}

export function buildSpriteSheetExportDocument(
  source: SpriteDocument,
  options: SpriteSheetExportOptions,
  selection: SpriteSheetExportSelection,
  names: SpriteSheetBuildNames
): SpriteSheetBuildResult {
  const area = resolveSpriteSheetArea(source, options.area, selection.selection)
  const targets = createSpriteSheetExportTargets(source, selection, options)
  if (targets.length === 0) throw new Error(tr('core.spriteSheet.noItems'))
  const parts = targets.flatMap((target) => {
    try {
      return [createSpriteSheetDocument(source, names, {
        ...options,
        area,
        selection: options.area === 'selection' ? selection.selection : null,
        frameIds: target.frameIds,
        layerIds: target.layerIds
      })]
    } catch (error) {
      if (options.ignoreEmpty && error instanceof EmptySpriteSheetError) return []
      throw error
    }
  })
  return stackSpriteSheetDocuments(parts, names)
}

const renderSpriteSheetItem = (
  source: SpriteDocument,
  frameId: string,
  area: SelectionRect,
  layerIds: readonly string[] | null,
  selection?: SelectionMask | null
): Uint8ClampedArray => {
  const frameDocument = cloneDocumentForAnimationFrame(source, frameId)
  const frameLayers = animationLayersAtFrame(frameDocument, frameId)
  const isolated = layerIds === null ? null : new Set(layerIds)
  const allLayersSelected = isolated?.size === source.layers.length && source.layers.every((layer) => isolated.has(layer.id))
  const relevantGroupIds = new Set<string>()
  for (const layer of source.layers) {
    if (!isolated?.has(layer.id)) continue
    const visited = new Set<string>()
    let groupId = layer.groupId ?? null
    while (groupId && !visited.has(groupId)) {
      visited.add(groupId)
      relevantGroupIds.add(groupId)
      groupId = source.groups.find((group) => group.id === groupId)?.parentGroupId ?? null
    }
  }
  const layers = isolated === null
    ? frameLayers
    : frameLayers.map((layer) => ({
        ...layer,
        visible: isolated.has(layer.id),
        ...(!allLayersSelected ? { clippingMask: false } : {})
      }))
  const groups = isolated === null
    ? frameDocument.groups
    : frameDocument.groups.map((group) => ({
        ...group,
        visible: relevantGroupIds.has(group.id),
        ...(!allLayersSelected ? { clippingMask: false } : {})
      }))
  const pixels = compositeRegion({ ...frameDocument, layers, groups }, area.x, area.y, area.width, area.height)
  if (selection) {
    for (let y = 0; y < area.height; y += 1) for (let x = 0; x < area.width; x += 1) {
      if (selectionContains(selection, area.x + x, area.y + y)) continue
      pixels[(y * area.width + x) * 4 + 3] = 0
    }
  }
  return pixels
}

const isEmptyItem = (pixels: Uint8ClampedArray): boolean => {
  for (let offset = 3; offset < pixels.length; offset += 4) if (pixels[offset] !== 0) return false
  return true
}

const pixelsHash = (pixels: Uint8ClampedArray): number => {
  let hash = 0x811c9dc5
  for (const value of pixels) hash = Math.imul(hash ^ value, 0x01000193)
  return hash >>> 0
}

const pixelsEqual = (left: Uint8ClampedArray, right: Uint8ClampedArray): boolean => {
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) if (left[index] !== right[index]) return false
  return true
}

const filterSpriteSheetItems = (
  items: Uint8ClampedArray[],
  ignoreEmpty: boolean,
  mergeDuplicates: boolean
): Uint8ClampedArray[] => {
  const filtered = ignoreEmpty ? items.filter((pixels) => !isEmptyItem(pixels)) : items
  if (!mergeDuplicates) return filtered
  const buckets = new Map<number, Uint8ClampedArray[]>()
  const unique: Uint8ClampedArray[] = []
  for (const pixels of filtered) {
    const hash = pixelsHash(pixels)
    const matches = buckets.get(hash) ?? []
    if (matches.some((candidate) => pixelsEqual(candidate, pixels))) continue
    matches.push(pixels)
    buckets.set(hash, matches)
    unique.push(pixels)
  }
  return unique
}

export function createSpriteSheetDocument(
  source: SpriteDocument,
  names: SpriteSheetDocumentNames,
  options: SpriteSheetBuildOptions
): SpriteSheetBuildResult {
  const timeline = spriteSheetTimeline(source)
  const availableFrames = new Set(timeline.frames.map((frame) => frame.id))
  const frameIds = options.frameIds.filter((frameId) => availableFrames.has(frameId))
  if (frameIds.length === 0) throw new Error(tr('core.spriteSheet.noFrames'))
  const area = options.area
  if (!Number.isSafeInteger(area.x) || !Number.isSafeInteger(area.y) || !Number.isSafeInteger(area.width) || !Number.isSafeInteger(area.height)
    || area.width < 1 || area.height < 1 || area.x < 0 || area.y < 0 || area.x + area.width > source.width || area.y + area.height > source.height) {
    throw new Error(tr('core.spriteSheet.invalidArea'))
  }

  const rendered = frameIds.map((frameId) => renderSpriteSheetItem(source, frameId, area, options.layerIds, options.selection))
  const items = filterSpriteSheetItems(rendered, options.ignoreEmpty, options.mergeDuplicates)
  if (items.length === 0) throw new EmptySpriteSheetError(tr('core.spriteSheet.noItems'))
  const metrics = spriteSheetLayoutMetrics(items.length, area.width, area.height, options)
  const sheet = createDocument(names.document, metrics.width, metrics.height, 'rgba')
  const layer = getActiveLayer(sheet)
  if (layer.format !== 'rgba') throw new Error(tr('core.spriteSheet.rgbaRequired'))
  layer.name = names.layer

  const sourceRowBytes = area.width * 4
  items.forEach((pixels, index) => {
    const row = options.layout === 'columns' ? index % metrics.rows : Math.floor(index / metrics.columns)
    const column = options.layout === 'columns' ? Math.floor(index / metrics.rows) : index % metrics.columns
    for (let y = 0; y < area.height; y += 1) {
      const sourceOffset = y * sourceRowBytes
      const targetOffset = ((row * area.height + y) * metrics.width + column * area.width) * 4
      layer.pixels.set(pixels.subarray(sourceOffset, sourceOffset + sourceRowBytes), targetOffset)
    }
  })

  return { document: sheet, itemCount: items.length, sourceItemCount: frameIds.length }
}

export function stackSpriteSheetDocuments(
  parts: readonly SpriteSheetBuildResult[],
  names: SpriteSheetDocumentNames
): SpriteSheetBuildResult {
  if (parts.length === 0) throw new EmptySpriteSheetError(tr('core.spriteSheet.noItems'))
  if (parts.length === 1) {
    const result = parts[0]
    result.document.name = names.document
    getActiveLayer(result.document).name = names.layer
    return result
  }
  const width = Math.max(...parts.map((part) => part.document.width))
  let height = 0
  let itemCount = 0
  let sourceItemCount = 0
  for (const part of parts) {
    height += part.document.height
    itemCount += part.itemCount
    sourceItemCount += part.sourceItemCount
    if (!Number.isSafeInteger(height) || !Number.isSafeInteger(itemCount) || !Number.isSafeInteger(sourceItemCount)) {
      throw new Error(tr('core.spriteSheet.dimensions'))
    }
  }
  const document = createDocument(names.document, width, height, 'rgba')
  const layer = getActiveLayer(document)
  if (layer.format !== 'rgba') throw new Error(tr('core.spriteSheet.rgbaRequired'))
  layer.name = names.layer
  let offsetY = 0
  for (const part of parts) {
    const sourceLayer = getActiveLayer(part.document)
    if (sourceLayer.format !== 'rgba') throw new Error(tr('core.spriteSheet.rgbaRequired'))
    const sourceRowBytes = part.document.width * 4
    for (let y = 0; y < part.document.height; y += 1) {
      const sourceOffset = y * sourceRowBytes
      const targetOffset = ((offsetY + y) * width) * 4
      layer.pixels.set(sourceLayer.pixels.subarray(sourceOffset, sourceOffset + sourceRowBytes), targetOffset)
    }
    offsetY += part.document.height
  }
  return { document, itemCount, sourceItemCount }
}

export function createHorizontalSpriteSheetDocument(
  source: SpriteDocument,
  names: SpriteSheetDocumentNames
): SpriteDocument {
  const frames = spriteSheetTimeline(source).frames
  return createSpriteSheetDocument(source, names, {
    layout: 'horizontal',
    constraint: 'none',
    fixedColumns: 1,
    fixedWidth: source.width,
    fixedRows: 1,
    fixedHeight: source.height,
    mergeDuplicates: false,
    ignoreEmpty: false,
    area: { x: 0, y: 0, width: source.width, height: source.height },
    frameIds: frames.map((frame) => frame.id),
    layerIds: null
  }).document
}
