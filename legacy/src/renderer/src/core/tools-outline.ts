import type { AntiAliasColorSource } from '@shared/types-brush'
import type { OutlineDirections, OutlineKernel, OutlinePosition, SelectionMask } from '@shared/types-selection'
import type { RasterLayer } from '@shared/types-layer'
import type { RgbaColor } from '@shared/types-color'
import type { SpriteDocument } from '@shared/types-document'
import { ensureLayerCoversCanvas, isLayerEffectivelyLocked, layerContentBounds, layerIndexAt, readLayerColorAt } from './document-model'
import { compositeRegion } from './document-composite'
import { beginPixelEdit, recordPixel, type PixelEdit } from './history'
import { colorEquals, packColor, pixelIndex, relativeLuminanceColor } from './raster'
import { selectionContains } from './selection'
import { allOutlineDirections, DEFAULT_OUTLINE_SMART_HUE_DARKNESS, outlineDirectionForOffset, outlineKernelContainsOffset, resolveOutlineStrokeColor } from './outline-settings'
import { paintLayerValue } from './tools-pixel-edit'

export interface OutlinePixelSample {
  index: number
  referenceColor: RgbaColor
}

interface OutlinePixelCandidate extends OutlinePixelSample {
  distance: number
  rank: number
}

const setOutlinePixelCandidate = (
  candidates: Map<number, OutlinePixelCandidate>,
  index: number,
  referenceColor: RgbaColor,
  distance: number,
  rank: number
): void => {
  const current = candidates.get(index)
  if (current && (current.distance < distance || (current.distance === distance && current.rank <= rank))) return
  candidates.set(index, { index, referenceColor, distance, rank })
}

/** Returns the exact pixels and source colors that a preview and the committed outline will paint. */
export function outlinePixelSamples(
  document: SpriteDocument,
  layer: RasterLayer,
  selection: SelectionMask | null,
  thickness: number,
  position: OutlinePosition,
  directions: OutlineDirections = allOutlineDirections(),
  kernel: OutlineKernel = 'square',
  backgroundColor: RgbaColor = { r: 0, g: 0, b: 0, a: 0 },
  sourceColor: RgbaColor | null = null
): OutlinePixelSample[] {
  const radius = Math.max(1, Math.min(64, Math.round(thickness)))
  const sourceBounds = selection ?? layerContentBounds(document, layer)
  if (!sourceBounds) return []
  const left = Math.max(0, sourceBounds.x - radius)
  const top = Math.max(0, sourceBounds.y - radius)
  const right = Math.min(document.width, sourceBounds.x + sourceBounds.width + radius)
  const bottom = Math.min(document.height, sourceBounds.y + sourceBounds.height + radius)
  if (right <= left || bottom <= top) return []
  const width = right - left
  const height = bottom - top
  const isSource = (x: number, y: number): boolean => {
    if (x < left || y < top || x >= right || y >= bottom || (selection && !selectionContains(selection, x, y))) return false
    const color = readLayerColorAt(document, layer, x, y)
    if (sourceColor) return color.a > 0 && colorEquals(color, sourceColor)
    return color.a > 0 && !colorEquals(color, backgroundColor)
  }
  const result = new Map<number, OutlinePixelSample>()
  const boundary: Array<{ x: number; y: number; color: RgbaColor }> = []
  for (let y = top; y < bottom; y += 1) for (let x = left; x < right; x += 1) {
    if (!isSource(x, y)) continue
    let edge = false
    for (let dy = -1; dy <= 1 && !edge; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
      if ((dx !== 0 || dy !== 0) && !isSource(x + dx, y + dy)) { edge = true; break }
    }
    if (edge) boundary.push({ x, y, color: readLayerColorAt(document, layer, x, y) })
  }

  if (position !== 'inside') {
    const clipped = new Map<number, OutlinePixelCandidate>()
    const unclipped = new Map<number, OutlinePixelCandidate>()
    const diameter = radius * 2 + 1
    for (const source of boundary) for (let dy = -radius; dy <= radius; dy += 1) for (let dx = -radius; dx <= radius; dx += 1) {
      if (!outlineKernelContainsOffset(dx, dy, radius, kernel)) continue
      const direction = outlineDirectionForOffset(dx, dy)
      if (!direction || !directions[direction]) continue
      const targetX = source.x + dx
      const targetY = source.y + dy
      if (targetX < 0 || targetY < 0 || targetX >= document.width || targetY >= document.height || isSource(targetX, targetY)) continue
      const index = pixelIndex(document.width, targetX, targetY)
      if (!sourceColor && readLayerColorAt(document, layer, targetX, targetY).a !== 0) continue
      const distance = dx * dx + dy * dy
      const rank = (-dy + radius) * diameter + (-dx + radius)
      setOutlinePixelCandidate(unclipped, index, source.color, distance, rank)
      if (selection && selectionContains(selection, targetX, targetY)) setOutlinePixelCandidate(clipped, index, source.color, distance, rank)
    }
    // Prefer clipping to the selection. A tight content selection has no room for an
    // outside stroke, so fall back to adjacent canvas pixels instead of doing nothing.
    for (const sample of (selection && clipped.size > 0 ? clipped : unclipped).values()) result.set(sample.index, { index: sample.index, referenceColor: sample.referenceColor })
  }

  if (position !== 'outside' && boundary.length > 0) {
    const innerRadius = Math.max(0, radius - 1)
    for (const source of boundary) {
      let allowedEdge = false
      for (let dy = -1; dy <= 1 && !allowedEdge; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0 || isSource(source.x + dx, source.y + dy) || !outlineKernelContainsOffset(dx, dy, 1, kernel)) continue
        const direction = outlineDirectionForOffset(dx, dy)
        if (direction && directions[direction]) { allowedEdge = true; break }
      }
      if (!allowedEdge) continue
      for (let dy = -innerRadius; dy <= innerRadius; dy += 1) for (let dx = -innerRadius; dx <= innerRadius; dx += 1) {
        if (dx !== 0 || dy !== 0) {
          if (!outlineKernelContainsOffset(dx, dy, innerRadius, kernel)) continue
          const direction = outlineDirectionForOffset(-dx, -dy)
          if (!direction || !directions[direction]) continue
        }
        const targetX = source.x + dx
        const targetY = source.y + dy
        if (targetX < left || targetY < top || targetX >= right || targetY >= bottom || !isSource(targetX, targetY)) continue
        const index = pixelIndex(document.width, targetX, targetY)
        if (!result.has(index)) result.set(index, { index, referenceColor: readLayerColorAt(document, layer, targetX, targetY) })
      }
    }
  }
  return [...result.values()]
}

/** Returns the exact pixels that a preview and the committed outline will paint. */
export function outlinePixelIndices(
  document: SpriteDocument,
  layer: RasterLayer,
  selection: SelectionMask | null,
  thickness: number,
  position: OutlinePosition,
  directions: OutlineDirections = allOutlineDirections(),
  kernel: OutlineKernel = 'square',
  backgroundColor: RgbaColor = { r: 0, g: 0, b: 0, a: 0 }
): number[] {
  return outlinePixelSamples(document, layer, selection, thickness, position, directions, kernel, backgroundColor).map((sample) => sample.index)
}

export function outlineSelection(
  document: SpriteDocument,
  layer: RasterLayer,
  selection: SelectionMask | null,
  color: RgbaColor,
  thickness: number,
  position: OutlinePosition,
  directions: OutlineDirections = allOutlineDirections(),
  kernel: OutlineKernel = 'square',
  smartHue = false,
  smartHueDarkness = DEFAULT_OUTLINE_SMART_HUE_DARKNESS,
  backgroundColor: RgbaColor = { r: 0, g: 0, b: 0, a: 0 },
  followOpacity = false
): PixelEdit | null {
  if (isLayerEffectivelyLocked(document, layer)) return null
  if (!ensureLayerCoversCanvas(document, layer)) return null
  const edit = beginPixelEdit(layer.id)
  const colorSettings = { color, smartHue, smartHueDarkness, followOpacity }
  for (const sample of outlinePixelSamples(document, layer, selection, thickness, position, directions, kernel, backgroundColor)) {
    const x = sample.index % document.width
    const y = Math.floor(sample.index / document.width)
    const index = layerIndexAt(layer, x, y)
    if (index !== null) recordPixel(document, layer, edit, index, paintLayerValue(document, layer, edit, index, resolveOutlineStrokeColor(colorSettings, sample.referenceColor)))
  }
  return edit.before.size > 0 ? edit : null
}

/**
 * Paints a stroke along the inside edge of the selection itself. Unlike
 * outlineSelection(), this intentionally does not require opaque source
 * pixels, so an empty or transparent selection can still be stroked.
 */
export function outlineSelectionBoundary(
  document: SpriteDocument,
  layer: RasterLayer,
  selection: SelectionMask | null,
  color: RgbaColor,
  thickness: number,
  directions: OutlineDirections = allOutlineDirections(),
  kernel: OutlineKernel = 'square',
  smartHue = false,
  smartHueDarkness = DEFAULT_OUTLINE_SMART_HUE_DARKNESS,
  followOpacity = false
): PixelEdit | null {
  if (!selection || isLayerEffectivelyLocked(document, layer)) return null
  if (!ensureLayerCoversCanvas(document, layer)) return null
  const radius = Math.max(1, Math.min(64, Math.round(thickness)))
  const left = Math.max(0, selection.x)
  const top = Math.max(0, selection.y)
  const right = Math.min(document.width, selection.x + selection.width)
  const bottom = Math.min(document.height, selection.y + selection.height)
  if (right <= left || bottom <= top) return null
  const colorSettings = { color, smartHue, smartHueDarkness, followOpacity }
  const edit = beginPixelEdit(layer.id)
  for (let y = top; y < bottom; y += 1) for (let x = left; x < right; x += 1) {
    if (!selectionContains(selection, x, y)) continue
    let nearOutside = false
    for (let dy = -radius; dy <= radius && !nearOutside; dy += 1) for (let dx = -radius; dx <= radius; dx += 1) {
      if (dx === 0 && dy === 0 || !outlineKernelContainsOffset(dx, dy, radius, kernel)) continue
      const direction = outlineDirectionForOffset(dx, dy)
      if (!direction || !directions[direction]) continue
      if (!selectionContains(selection, x + dx, y + dy)) { nearOutside = true; break }
    }
    if (!nearOutside) continue
    const index = layerIndexAt(layer, x, y)
    if (index === null) continue
    const referenceColor = readLayerColorAt(document, layer, x, y)
    recordPixel(document, layer, edit, index, paintLayerValue(document, layer, edit, index, resolveOutlineStrokeColor(colorSettings, referenceColor)))
  }
  return edit.before.size > 0 ? edit : null
}

/** Paints the one-pixel diagonal gaps shared by horizontal and vertical outlines. */
export function antiAliasSelection(
  document: SpriteDocument,
  layer: RasterLayer,
  selection: SelectionMask | null,
  color: RgbaColor | null,
  autoColorOpacity = 50,
  includeInteriorColors = false,
  colorSource: AntiAliasColorSource = 'automatic'
): PixelEdit | null {
  if (isLayerEffectivelyLocked(document, layer)) return null
  if (!ensureLayerCoversCanvas(document, layer)) return null
  const paletteColors = colorSource === 'palette'
    ? document.paletteOrder.flatMap((id) => {
      const entry = document.palette.find((candidate) => candidate.id === id)
      return entry && entry.id !== 0 && entry.color.a > 0 ? [entry.color] : []
    })
    : []
  const canvasColors = colorSource === 'canvas' ? collectAntiAliasCanvasColors(document) : []
  const regionByIndex = new Map<number, number>()
  const interiorRegions: Array<{ color: RgbaColor; area: number; touchesTransparent: boolean }> = []
  if (includeInteriorColors) {
    const sourceBounds = selection ?? layerContentBounds(document, layer)
    if (sourceBounds) {
      const left = Math.max(0, sourceBounds.x)
      const top = Math.max(0, sourceBounds.y)
      const right = Math.min(document.width, sourceBounds.x + sourceBounds.width)
      const bottom = Math.min(document.height, sourceBounds.y + sourceBounds.height)
      const visited = new Set<number>()
      const regionNeighbors = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const
      const contourNeighbors = [-1, 0, 1] as const
      const inScope = (x: number, y: number): boolean => x >= left && y >= top && x < right && y < bottom && (!selection || selectionContains(selection, x, y))
      for (let y = top; y < bottom; y += 1) for (let x = left; x < right; x += 1) {
        if (!inScope(x, y)) continue
        const startIndex = pixelIndex(document.width, x, y)
        if (visited.has(startIndex)) continue
        const startColor = readLayerColorAt(document, layer, x, y)
        if (startColor.a === 0) continue
        const regionId = interiorRegions.length
        const queue = [startIndex]
        let area = 0
        let touchesTransparent = false
        visited.add(startIndex)
        while (queue.length > 0) {
          const currentIndex = queue.pop()!
          const currentX = currentIndex % document.width
          const currentY = Math.floor(currentIndex / document.width)
          regionByIndex.set(currentIndex, regionId)
          area += 1
          for (const dy of contourNeighbors) for (const dx of contourNeighbors) {
            if (dx === 0 && dy === 0) continue
            const neighborX = currentX + dx
            const neighborY = currentY + dy
            if (!inScope(neighborX, neighborY) || readLayerColorAt(document, layer, neighborX, neighborY).a === 0) {
              touchesTransparent = true
              continue
            }
          }
          for (const [dx, dy] of regionNeighbors) {
            const neighborX = currentX + dx
            const neighborY = currentY + dy
            if (!inScope(neighborX, neighborY)) continue
            const neighborIndex = pixelIndex(document.width, neighborX, neighborY)
            if (visited.has(neighborIndex) || !colorEquals(readLayerColorAt(document, layer, neighborX, neighborY), startColor)) continue
            visited.add(neighborIndex)
            queue.push(neighborIndex)
          }
        }
        interiorRegions.push({ color: startColor, area, touchesTransparent })
      }
    }
  }
  const intersections = new Map<number, { horizontal: OutlinePixelSample; vertical: OutlinePixelSample; preferredColor: RgbaColor | null }>()
  const collectIntersections = (sourceColor: RgbaColor | null): void => {
    const horizontal = outlinePixelSamples(document, layer, selection, 1, 'outside', {
      nw: false, n: false, ne: false,
      w: true, e: true,
      sw: false, s: false, se: false
    }, 'square', { r: 0, g: 0, b: 0, a: 0 }, sourceColor)
    const vertical = new Map(outlinePixelSamples(document, layer, selection, 1, 'outside', {
      nw: false, n: true, ne: false,
      w: false, e: false,
      sw: false, s: true, se: false
    }, 'square', { r: 0, g: 0, b: 0, a: 0 }, sourceColor).map((sample) => [sample.index, sample]))
    for (const sample of horizontal) {
      if (!antiAliasTargetInScope(document, selection, sample.index)) continue
      const verticalSample = vertical.get(sample.index)
      if (!verticalSample) continue
      intersections.set(sample.index, { horizontal: sample, vertical: verticalSample, preferredColor: sourceColor })
    }
  }
  collectIntersections(null)
  if (includeInteriorColors && interiorRegions.length > 0) {
    const horizontal = new Map<number, OutlinePixelSample>()
    const vertical = new Map<number, OutlinePixelSample>()
    const sourceBounds = selection ?? layerContentBounds(document, layer)
    if (sourceBounds) {
      const left = Math.max(0, sourceBounds.x)
      const top = Math.max(0, sourceBounds.y)
      const right = Math.min(document.width, sourceBounds.x + sourceBounds.width)
      const bottom = Math.min(document.height, sourceBounds.y + sourceBounds.height)
      const addCandidate = (targetX: number, targetY: number, targetMap: Map<number, OutlinePixelSample>, sourceIndex: number, sourceColor: RgbaColor): void => {
        if (targetX < left || targetY < top || targetX >= right || targetY >= bottom || (selection && !selectionContains(selection, targetX, targetY))) return
        const targetIndex = pixelIndex(document.width, targetX, targetY)
        const targetRegionId = regionByIndex.get(targetIndex)
        const sourceRegionId = regionByIndex.get(sourceIndex)
        if (sourceRegionId === undefined || targetRegionId === undefined || sourceRegionId === targetRegionId) return
        const sourceRegion = interiorRegions[sourceRegionId]
        const targetRegion = interiorRegions[targetRegionId]
        if (targetRegion.area < sourceRegion.area || targetRegion.area === sourceRegion.area && targetRegionId < sourceRegionId) return
        targetMap.set(targetIndex, { index: targetIndex, referenceColor: sourceColor })
      }
      for (const [sourceIndex, sourceRegionId] of regionByIndex) {
        const sourceX = sourceIndex % document.width
        const sourceY = Math.floor(sourceIndex / document.width)
        const sourceColor = interiorRegions[sourceRegionId].color
        addCandidate(sourceX - 1, sourceY, horizontal, sourceIndex, sourceColor)
        addCandidate(sourceX + 1, sourceY, horizontal, sourceIndex, sourceColor)
        addCandidate(sourceX, sourceY - 1, vertical, sourceIndex, sourceColor)
        addCandidate(sourceX, sourceY + 1, vertical, sourceIndex, sourceColor)
      }
      for (const [index, horizontalSample] of horizontal) {
        const verticalSample = vertical.get(index)
        if (verticalSample) intersections.set(index, { horizontal: horizontalSample, vertical: verticalSample, preferredColor: null })
      }
    }
  }
  const edit = beginPixelEdit(layer.id)
  for (const { horizontal, vertical, preferredColor } of intersections.values()) {
    const sample = horizontal
    const x = sample.index % document.width
    const y = Math.floor(sample.index / document.width)
    const index = layerIndexAt(layer, x, y)
    if (index === null) continue
    const targetColor = readLayerColorAt(document, layer, x, y)
    const useTargetAsReference = colorSource !== 'automatic' && targetColor.a > 0 && !colorEquals(targetColor, sample.referenceColor)
    const firstReference = useTargetAsReference ? targetColor : sample.referenceColor
    const secondReference = useTargetAsReference ? sample.referenceColor : vertical.referenceColor
    const automaticColor = automaticAntiAliasColor(document, layer, selection, x, y, firstReference, secondReference, targetColor, colorSource, paletteColors, canvasColors)
    const resolvedColor = color ?? (colorSource === 'automatic' ? applyAntiAliasOpacity(automaticColor, autoColorOpacity) : automaticColor)
    recordPixel(document, layer, edit, index, paintLayerValue(document, layer, edit, index, resolvedColor))
  }
  return edit.before.size > 0 ? edit : null
}

const antiAliasTargetInScope = (document: SpriteDocument, selection: SelectionMask | null, index: number): boolean => {
  if (!selection) return true
  return selectionContains(selection, index % document.width, Math.floor(index / document.width))
}

const applyAntiAliasOpacity = (color: RgbaColor, opacityPercent: number): RgbaColor => ({
  ...color,
  a: Math.round(color.a * Math.max(0, Math.min(100, opacityPercent)) / 100)
})

/** Matches the editor's relative-lightness view, represented as 0..255. */
const antiAliasLuminance = (color: RgbaColor): number => relativeLuminanceColor(color).r

const collectAntiAliasCanvasColors = (document: SpriteDocument): RgbaColor[] => {
  const pixels = compositeRegion(document, 0, 0, document.width, document.height)
  const colors = new Map<number, RgbaColor>()
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const color = { r: pixels[offset], g: pixels[offset + 1], b: pixels[offset + 2], a: pixels[offset + 3] }
    if (color.a > 0) colors.set(packColor(color), color)
  }
  return [...colors.values()]
}

const nearestAntiAliasIntermediateColor = (
  left: RgbaColor,
  right: RgbaColor,
  candidates: readonly RgbaColor[],
  excludedColor: RgbaColor | null
): RgbaColor | null => {
  const leftLuminance = antiAliasLuminance(left)
  const rightLuminance = antiAliasLuminance(right)
  const minimum = Math.min(leftLuminance, rightLuminance)
  const maximum = Math.max(leftLuminance, rightLuminance)
  const target = (leftLuminance + rightLuminance) / 2
  const usable = candidates.filter((candidate) => candidate.a > 0 && (!excludedColor || !colorEquals(candidate, excludedColor)))
  const intermediate = usable.filter((candidate) => {
    const luminance = antiAliasLuminance(candidate)
    return luminance > minimum && luminance < maximum
  })
  const pool = intermediate.length > 0 ? intermediate : usable
  return [...pool].sort((candidate, other) => {
    const distance = Math.abs(antiAliasLuminance(candidate) - target)
    const otherDistance = Math.abs(antiAliasLuminance(other) - target)
    return distance - otherDistance
  })[0] ?? null
}

const automaticAntiAliasColor = (
  document: SpriteDocument,
  layer: RasterLayer,
  selection: SelectionMask | null,
  x: number,
  y: number,
  horizontalReference: RgbaColor,
  verticalReference: RgbaColor,
  excludedColor: RgbaColor | null = null,
  colorSource: AntiAliasColorSource = 'automatic',
  paletteColors: readonly RgbaColor[] = [],
  canvasColors: readonly RgbaColor[] = []
): RgbaColor => {
  if (colorSource === 'palette' && paletteColors.length > 0) {
    return nearestAntiAliasIntermediateColor(horizontalReference, verticalReference, paletteColors, excludedColor) ?? paletteColors[0]
  }
  if (colorSource === 'canvas' && canvasColors.length > 0) {
    return nearestAntiAliasIntermediateColor(horizontalReference, verticalReference, canvasColors, excludedColor) ?? horizontalReference
  }
  const candidates = new Map<number, { color: RgbaColor; count: number; distance: number; rank: number }>()
  let rank = 0
  for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
    if (dx === 0 && dy === 0) continue
    const sourceX = x + dx
    const sourceY = y + dy
    if (selection && !selectionContains(selection, sourceX, sourceY)) continue
    const candidate = sampleCompositeColor(document, sourceX, sourceY, layer.id)
    if (candidate.a === 0 || (excludedColor && colorEquals(candidate, excludedColor))) continue
    const key = packColor(candidate)
    const current = candidates.get(key)
    if (current) current.count += 1
    else candidates.set(key, { color: candidate, count: 1, distance: Math.abs(dx) + Math.abs(dy), rank })
    rank += 1
  }
  return [...candidates.values()].sort((left, right) => right.count - left.count || left.distance - right.distance || left.rank - right.rank)[0]?.color ?? horizontalReference
}

import { sampleCompositeColor } from './tools-composite-sampling'
