import type { RasterLayer } from '@shared/types-layer'
import type { SelectionMask } from '@shared/types-selection'
import type { SpriteDocument } from '@shared/types-document'
import { getActiveLayer } from './document-model'
import { pixelIndex } from './raster'
import { flipSelectionMask, type SelectionFlipAxis } from './selection'
import { readSurfacePackedRegion } from './runtime-raster'
import { clampSelectionMask } from './tools-pixel-edit'
import { type SelectionTransformSource } from './tools-selection-transform-types'

const SELECTION_OFFSET_CACHE_LIMIT = 262_144

export const forEachSelectedSourceOffset = (source: SelectionTransformSource, callback: (offset: number) => void): void => {
  if (source.selectedOffsets.length > 0) {
    for (const offset of source.selectedOffsets) callback(offset)
    return
  }
  const { mask, width, height } = source.selection
  const size = width * height
  if (!mask) {
    for (let offset = 0; offset < size; offset += 1) callback(offset)
    return
  }
  for (let offset = 0; offset < size; offset += 1) if (mask[offset] === 1) callback(offset)
}

const flippedSelectionOffset = (offset: number, width: number, height: number, axis: SelectionFlipAxis): number => {
  const x = offset % width
  const y = Math.floor(offset / width)
  return axis === 'horizontal' ? y * width + width - 1 - x : (height - 1 - y) * width + x
}

export function flipSelectionTransformSource(source: SelectionTransformSource, axis: SelectionFlipAxis): SelectionTransformSource {
  const { width, height } = source.selection
  const values = new Uint32Array(source.values.length)
  for (let offset = 0; offset < source.values.length; offset += 1) values[flippedSelectionOffset(offset, width, height, axis)] = source.values[offset]
  const selectedOffsets = Uint32Array.from(source.selectedOffsets, (offset) => flippedSelectionOffset(offset, width, height, axis))
  const opaque = Array.from(source.opaqueOffsets, (offset, index) => ({
    offset: flippedSelectionOffset(offset, width, height, axis),
    value: source.opaqueValues[index]
  })).sort((left, right) => left.offset - right.offset)
  const sourceQuad = source.sourceQuad
    ? axis === 'horizontal'
      ? {
          nw: { ...source.sourceQuad.ne },
          ne: { ...source.sourceQuad.nw },
          se: { ...source.sourceQuad.sw },
          sw: { ...source.sourceQuad.se }
        }
      : {
          nw: { ...source.sourceQuad.sw },
          ne: { ...source.sourceQuad.se },
          se: { ...source.sourceQuad.ne },
          sw: { ...source.sourceQuad.nw }
        }
    : undefined
  return {
    selection: flipSelectionMask(source.selection, axis),
    values,
    selectedOffsets,
    opaqueOffsets: Uint32Array.from(opaque, (item) => item.offset),
    // These indices remain tied to the original clear region while the
    // destination offsets and values follow the mirrored floating content.
    opaqueIndices: source.opaqueIndices.slice(),
    opaqueValues: Uint32Array.from(opaque, (item) => item.value),
    origin: source.origin,
    sourceQuad
  }
}

export function captureSelectionTransform(document: SpriteDocument, selection: SelectionMask, targetLayer?: RasterLayer, options?: { cacheOpaqueOffsets?: boolean; preserveOutsideCanvas?: boolean }): SelectionTransformSource | null {
  const layer = targetLayer ?? getActiveLayer(document)
  const source = options?.preserveOutsideCanvas
    ? { ...selection, mask: selection.mask?.slice() }
    : clampSelectionMask(document, selection)
  if (!source) return null
  const size = source.width * source.height
  const values = readSurfacePackedRegion(layer, source.x - layer.offsetX, source.y - layer.offsetY, source.width, source.height)
  const opaquePaletteIds = layer.format === 'indexed'
    ? new Set(document.palette.filter((entry) => entry.id !== 0 && entry.color.a !== 0).map((entry) => entry.id))
    : null
  const isOpaque = (value: number): boolean => layer.format === 'rgba' ? (value >>> 24) !== 0 : opaquePaletteIds!.has(value)
  if (size > SELECTION_OFFSET_CACHE_LIMIT && options?.cacheOpaqueOffsets === false) {
    return {
      selection: source,
      values,
      selectedOffsets: new Uint32Array(0),
      opaqueOffsets: new Uint32Array(0),
      opaqueIndices: new Uint32Array(0),
      opaqueValues: new Uint32Array(0),
      origin: 'selection'
    }
  }
  if (size > SELECTION_OFFSET_CACHE_LIMIT) {
    let opaqueCount = 0
    for (let offset = 0; offset < size; offset += 1) {
      if ((!source.mask || source.mask[offset] === 1) && isOpaque(values[offset])) opaqueCount += 1
    }
    const opaqueOffsets = new Uint32Array(opaqueCount)
    const opaqueIndices = new Uint32Array(opaqueCount)
    const opaqueValues = new Uint32Array(opaqueCount)
    let opaqueIndex = 0
    for (let offset = 0; offset < size; offset += 1) {
      if ((source.mask && source.mask[offset] !== 1) || !isOpaque(values[offset])) continue
      opaqueOffsets[opaqueIndex] = offset
      opaqueIndices[opaqueIndex] = pixelIndex(document.width, source.x + offset % source.width, source.y + Math.floor(offset / source.width))
      opaqueValues[opaqueIndex] = values[offset]
      opaqueIndex += 1
    }
    return {
      selection: source,
      values,
      selectedOffsets: new Uint32Array(0),
      opaqueOffsets,
      opaqueIndices,
      opaqueValues,
      origin: 'selection'
    }
  }
  const selectedCapacity = source.mask ? source.mask.reduce((count, selected) => count + (selected === 1 ? 1 : 0), 0) : size
  const selectedOffsets = new Uint32Array(selectedCapacity)
  const opaqueOffsets = new Uint32Array(selectedCapacity)
  const opaqueIndices = new Uint32Array(selectedCapacity)
  const opaqueValues = new Uint32Array(selectedCapacity)
  let selectedCount = 0
  let opaqueCount = 0
  for (let offset = 0; offset < size; offset += 1) {
    if (source.mask && source.mask[offset] !== 1) continue
    selectedOffsets[selectedCount++] = offset
    const value = values[offset]
    if (!isOpaque(value)) continue
    opaqueOffsets[opaqueCount] = offset
    opaqueIndices[opaqueCount] = pixelIndex(document.width, source.x + offset % source.width, source.y + Math.floor(offset / source.width))
    opaqueValues[opaqueCount] = value
    opaqueCount += 1
  }
  return {
    selection: source,
    values,
    selectedOffsets,
    opaqueOffsets: opaqueOffsets.slice(0, opaqueCount),
    opaqueIndices: opaqueIndices.slice(0, opaqueCount),
    opaqueValues: opaqueValues.slice(0, opaqueCount),
    origin: 'selection'
  }
}
