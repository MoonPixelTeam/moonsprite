import type { AnimationCelSurface } from '@shared/types-animation'
import type { RasterLayer } from '@shared/types-layer'
import type { SelectionMask, SelectionQuad, SelectionRect } from '@shared/types-selection'
import type { SpriteDocument } from '@shared/types-document'
import { getActiveLayer, getPaletteEntry } from './document-model'
import { isInBounds, pixelIndex } from './raster'
import {
  selectionContains,
  selectionQuadBounds,
  selectionQuadPoint,
  selectionQuadSourcePoint,
  selectionQuadTransformFor,
  transformedSelectionBounds,
  transformedSelectionDestinationPoint,
  transformedSelectionSourcePoint,
  type SelectionShearTransform
} from './selection'
import { clampSelection } from './tools-pixel-edit'
import { type SelectionTransformSource, type TransformCell, type SelectionTransformPreviewRasterPacked } from './tools-selection-transform-types'
import { rotSpriteSelectionCells } from './tools-selection-transform-rotsprite'
import { forEachSelectedSourceOffset } from './tools-selection-transform-source'

export function selectionTransformCells(document: SpriteDocument, sourceData: SelectionTransformSource, target: SelectionRect, angle: number, shear?: SelectionShearTransform, targetLayer?: RasterLayer, quad?: SelectionQuad, pixelCenteredSampling = false, optimizedRotation = false): TransformCell[] {
  const source = sourceData.selection
  const transformedBounds = quad ? selectionQuadBounds(quad) : transformedSelectionBounds(target, angle, shear)
  const destination = clampSelection(document, {
    x: Math.floor(transformedBounds.x),
    y: Math.floor(transformedBounds.y),
    width: Math.ceil(transformedBounds.x + transformedBounds.width) - Math.floor(transformedBounds.x),
    height: Math.ceil(transformedBounds.y + transformedBounds.height) - Math.floor(transformedBounds.y)
  })
  if (!destination) return []
  const cells = new Map<number, TransformCell>()
  const layer = targetLayer ?? getActiveLayer(document)
  const isOpaqueValue = (value: number): boolean => layer.format === 'rgba'
    ? (value >>> 24) !== 0
    : value !== 0 && getPaletteEntry(document, value).color.a !== 0
  if (optimizedRotation) {
    const rotSpriteCells = rotSpriteSelectionCells(document, sourceData, target, angle, layer, shear, quad)
    if (rotSpriteCells) return rotSpriteCells
  }
  if (quad) {
    const transform = selectionQuadTransformFor(source, quad)
    const sourceTransform = sourceData.sourceQuad ? selectionQuadTransformFor(source, sourceData.sourceQuad) : null
    if (!transform || (sourceData.sourceQuad && !sourceTransform)) return []
    for (let y = destination.y; y < destination.y + destination.height; y += 1) {
      for (let x = destination.x; x < destination.x + destination.width; x += 1) {
        const normalized = selectionQuadSourcePoint(transform, { x: x + 0.5, y: y + 0.5 })
        if (!normalized || normalized.x < -1e-9 || normalized.x > 1 + 1e-9 || normalized.y < -1e-9 || normalized.y > 1 + 1e-9) continue
        const sourcePoint = sourceTransform
          ? selectionQuadPoint(sourceTransform, normalized.x, normalized.y)
          : null
        const sourceX = sourcePoint
          ? Math.floor(sourcePoint.x)
          : source.x + Math.min(source.width - 1, Math.max(0, Math.floor(normalized.x * source.width)))
        const sourceY = sourcePoint
          ? Math.floor(sourcePoint.y)
          : source.y + Math.min(source.height - 1, Math.max(0, Math.floor(normalized.y * source.height)))
        if (sourceX < source.x || sourceY < source.y || sourceX >= source.x + source.width || sourceY >= source.y + source.height) continue
        if (!selectionContains(source, sourceX, sourceY)) continue
        const sourceOffset = (sourceY - source.y) * source.width + sourceX - source.x
        const value = sourceData.values[sourceOffset]
        if (!isOpaqueValue(value)) continue
        cells.set(pixelIndex(document.width, x, y), {
          x,
          y,
          sourceIndex: pixelIndex(document.width, sourceX, sourceY),
          value
        })
      }
    }
    return [...cells.values()]
  }
  const normalizedAngle = ((angle % 360) + 360) % 360
  const pixelPreservingRotation = Boolean(
    normalizedAngle !== 0
    && !shear
    && !target.flipHorizontal
    && !target.flipVertical
    && target.width === source.width
    && target.height === source.height
  )
  if (pixelPreservingRotation) {
    const addForwardMappedCell = (sourceOffset: number): void => {
      if (!isOpaqueValue(sourceData.values[sourceOffset])) return
      const localX = sourceOffset % source.width
      const localY = Math.floor(sourceOffset / source.width)
      const mapped = transformedSelectionDestinationPoint(source, target, source.x + localX, source.y + localY, angle)
      const x = Math.floor(mapped.x)
      const y = Math.floor(mapped.y)
      if (x < destination.x || y < destination.y || x >= destination.x + destination.width || y >= destination.y + destination.height) return
      const destinationIndex = pixelIndex(document.width, x, y)
      if (cells.has(destinationIndex)) return
      cells.set(destinationIndex, {
        x,
        y,
        sourceIndex: pixelIndex(document.width, source.x + localX, source.y + localY),
        value: sourceData.values[sourceOffset]
      })
    }
    if (sourceData.opaqueOffsets.length > 0) {
      for (const sourceOffset of sourceData.opaqueOffsets) addForwardMappedCell(sourceOffset)
    } else forEachSelectedSourceOffset(sourceData, addForwardMappedCell)

    const inverseCandidates = new Map<number, TransformCell>()
    for (let y = destination.y; y < destination.y + destination.height; y += 1) {
      for (let x = destination.x; x < destination.x + destination.width; x += 1) {
        const sourcePoint = transformedSelectionSourcePoint(source, target, x, y, angle)
        if (!sourcePoint) continue
        const sourceOffset = (sourcePoint.y - source.y) * source.width + sourcePoint.x - source.x
        const value = sourceData.values[sourceOffset]
        if (!isOpaqueValue(value)) continue
        const destinationIndex = pixelIndex(document.width, x, y)
        if (cells.has(destinationIndex)) continue
        inverseCandidates.set(destinationIndex, {
          x,
          y,
          sourceIndex: pixelIndex(document.width, sourcePoint.x, sourcePoint.y),
          value
        })
      }
    }

    // Forward mapping keeps thin pixel-art contours from growing. Fill only
    // inverse-sampled points enclosed by the existing result so solid areas do
    // not develop checkerboard holes while isolated edge duplicates stay out.
    let added = true
    while (added && inverseCandidates.size > 0) {
      added = false
      const additions: Array<[number, TransformCell]> = []
      for (const [destinationIndex, cell] of inverseCandidates) {
        const neighbors = [
          [cell.x - 1, cell.y],
          [cell.x + 1, cell.y],
          [cell.x, cell.y - 1],
          [cell.x, cell.y + 1]
        ]
        let occupiedNeighbors = 0
        for (const [neighborX, neighborY] of neighbors) {
          if (!isInBounds(document.width, document.height, neighborX, neighborY)) continue
          if (cells.has(pixelIndex(document.width, neighborX, neighborY))) occupiedNeighbors += 1
        }
        if (occupiedNeighbors >= 2) additions.push([destinationIndex, cell])
      }
      for (const [destinationIndex, cell] of additions) {
        cells.set(destinationIndex, cell)
        inverseCandidates.delete(destinationIndex)
        added = true
      }
    }
    return [...cells.values()]
  }
  for (let y = destination.y; y < destination.y + destination.height; y += 1) {
    for (let x = destination.x; x < destination.x + destination.width; x += 1) {
      const sourcePoint = transformedSelectionSourcePoint(source, target, x, y, angle, shear, pixelCenteredSampling)
      if (!sourcePoint) continue
      const sourceX = Math.floor(sourcePoint.x)
      const sourceY = Math.floor(sourcePoint.y)
      if (sourceX < source.x || sourceY < source.y || sourceX >= source.x + source.width || sourceY >= source.y + source.height) continue
      const sourceIndex = pixelIndex(document.width, sourceX, sourceY)
      const sourceOffset = (sourceY - source.y) * source.width + sourceX - source.x
      cells.set(pixelIndex(document.width, x, y), { x, y, sourceIndex, value: sourceData.values[sourceOffset] })
    }
  }
  return [...cells.values()]
}

export function selectionTransformPreviewPacked(
  document: SpriteDocument,
  source: SelectionTransformSource,
  target: SelectionRect,
  startX: number,
  startY: number,
  width: number,
  height: number,
  angle = 0,
  shear?: SelectionShearTransform,
  targetLayer?: RasterLayer,
  reusable?: Uint32Array,
  quad?: SelectionQuad,
  optimizedRotation = false
): Uint32Array {
  const size = Math.max(0, width * height)
  const output = reusable?.length === size ? reusable : new Uint32Array(size)
  output.fill(0)
  if (width <= 0 || height <= 0) return output
  const layer = targetLayer ?? getActiveLayer(document)
  const simpleInverseTransform = angle % 360 === 0 && !shear && !quad
  if (simpleInverseTransform) {
    const right = Math.min(document.width, startX + width, Math.ceil(target.x + target.width))
    const bottom = Math.min(document.height, startY + height, Math.ceil(target.y + target.height))
    const left = Math.max(0, startX, Math.floor(target.x))
    const top = Math.max(0, startY, Math.floor(target.y))
    for (let y = top; y < bottom; y += 1) for (let x = left; x < right; x += 1) {
      const sourcePoint = transformedSelectionSourcePoint(source.selection, target, x, y)
      if (!sourcePoint) continue
      const sourceOffset = (sourcePoint.y - source.selection.y) * source.selection.width + sourcePoint.x - source.selection.x
      output[(y - startY) * width + x - startX] = source.values[sourceOffset]
    }
    return output
  }
  for (const cell of selectionTransformCells(document, source, target, angle, shear, layer, quad, false, optimizedRotation)) {
    if (cell.x < startX || cell.y < startY || cell.x >= startX + width || cell.y >= startY + height) continue
    output[(cell.y - startY) * width + cell.x - startX] = cell.value
  }
  return output
}

/** Rasterizes a transform in local coordinates so integer movement can reuse the same pixels. */
export function selectionTransformPreviewRasterPacked(
  document: SpriteDocument,
  source: SelectionTransformSource,
  target: SelectionRect,
  angle = 0,
  shear?: SelectionShearTransform,
  targetLayer?: RasterLayer,
  quad?: SelectionQuad,
  optimizedRotation = false
): SelectionTransformPreviewRasterPacked {
  const transformedBounds = quad ? selectionQuadBounds(quad) : transformedSelectionBounds(target, angle, shear)
  const left = Math.floor(transformedBounds.x)
  const top = Math.floor(transformedBounds.y)
  const right = Math.ceil(transformedBounds.x + transformedBounds.width)
  const bottom = Math.ceil(transformedBounds.y + transformedBounds.height)
  const width = Math.max(0, right - left)
  const height = Math.max(0, bottom - top)
  if (width === 0 || height === 0) return { width, height, pixels: new Uint32Array(0) }

  const shiftX = -left
  const shiftY = -top
  const shiftedTarget: SelectionRect = {
    ...target,
    x: target.x + shiftX,
    y: target.y + shiftY,
    ...(Number.isFinite(target.flipOriginX) ? { flipOriginX: target.flipOriginX! + shiftX } : {}),
    ...(Number.isFinite(target.flipOriginY) ? { flipOriginY: target.flipOriginY! + shiftY } : {})
  }
  const shiftedQuad = quad
    ? {
        nw: { x: quad.nw.x + shiftX, y: quad.nw.y + shiftY },
        ne: { x: quad.ne.x + shiftX, y: quad.ne.y + shiftY },
        se: { x: quad.se.x + shiftX, y: quad.se.y + shiftY },
        sw: { x: quad.sw.x + shiftX, y: quad.sw.y + shiftY }
      }
    : undefined
  const shiftedSource: SelectionTransformSource = {
    ...source,
    selection: {
      ...source.selection,
      x: source.selection.x + shiftX,
      y: source.selection.y + shiftY
    },
    sourceQuad: source.sourceQuad
      ? {
          nw: { x: source.sourceQuad.nw.x + shiftX, y: source.sourceQuad.nw.y + shiftY },
          ne: { x: source.sourceQuad.ne.x + shiftX, y: source.sourceQuad.ne.y + shiftY },
          se: { x: source.sourceQuad.se.x + shiftX, y: source.sourceQuad.se.y + shiftY },
          sw: { x: source.sourceQuad.sw.x + shiftX, y: source.sourceQuad.sw.y + shiftY }
        }
      : undefined
  }
  const localDocument = {
    width,
    height,
    palette: document.palette
  } as SpriteDocument
  return {
    width,
    height,
    pixels: selectionTransformPreviewPacked(
      localDocument,
      shiftedSource,
      shiftedTarget,
      0,
      0,
      width,
      height,
      angle,
      shear,
      targetLayer,
      undefined,
      shiftedQuad,
      optimizedRotation
    )
  }
}

export function transformRgbaSelectionSurface(
  surface: Extract<AnimationCelSurface, { format: 'rgba' }>,
  sourceSelection: SelectionRect,
  target: SelectionRect,
  angle = 0,
  shear?: SelectionShearTransform
): Extract<AnimationCelSurface, { format: 'rgba' }> {
  const destinationBounds = transformedSelectionBounds(target, angle, shear)
  const left = Math.min(sourceSelection.x, destinationBounds.x)
  const top = Math.min(sourceSelection.y, destinationBounds.y)
  const right = Math.max(sourceSelection.x + sourceSelection.width, destinationBounds.x + destinationBounds.width)
  const bottom = Math.max(sourceSelection.y + sourceSelection.height, destinationBounds.y + destinationBounds.height)
  const shiftX = -left
  const shiftY = -top
  const width = Math.max(1, right - left)
  const height = Math.max(1, bottom - top)
  const virtualDocument = { width, height, palette: [] } as unknown as SpriteDocument
  const virtualLayer: RasterLayer = {
    id: 'text-transform', name: '', visible: true, locked: false, opacity: 1, blendMode: 'normal',
    format: 'rgba', width: 1, height: 1, offsetX: 0, offsetY: 0, pixels: new Uint8ClampedArray(4)
  }
  const shiftedSource: SelectionMask = {
    x: sourceSelection.x + shiftX,
    y: sourceSelection.y + shiftY,
    width: sourceSelection.width,
    height: sourceSelection.height
  }
  const values = new Uint32Array(shiftedSource.width * shiftedSource.height)
  const selectedOffsets = new Uint32Array(values.length)
  const opaqueOffsets: number[] = []
  const opaqueIndices: number[] = []
  const opaqueValues: number[] = []
  for (let localY = 0; localY < shiftedSource.height; localY += 1) {
    for (let localX = 0; localX < shiftedSource.width; localX += 1) {
      const offset = localY * shiftedSource.width + localX
      selectedOffsets[offset] = offset
      const sourceX = sourceSelection.x + localX - surface.offsetX
      const sourceY = sourceSelection.y + localY - surface.offsetY
      if (sourceX < 0 || sourceY < 0 || sourceX >= surface.width || sourceY >= surface.height) continue
      const pixelOffset = (sourceY * surface.width + sourceX) * 4
      const value = surface.pixels[pixelOffset]
        | surface.pixels[pixelOffset + 1] << 8
        | surface.pixels[pixelOffset + 2] << 16
        | surface.pixels[pixelOffset + 3] << 24
      values[offset] = value >>> 0
      if (surface.pixels[pixelOffset + 3] === 0) continue
      opaqueOffsets.push(offset)
      opaqueIndices.push(pixelIndex(width, shiftedSource.x + localX, shiftedSource.y + localY))
      opaqueValues.push(value >>> 0)
    }
  }
  const sourceData: SelectionTransformSource = {
    selection: shiftedSource,
    values,
    selectedOffsets,
    opaqueOffsets: Uint32Array.from(opaqueOffsets),
    opaqueIndices: Uint32Array.from(opaqueIndices),
    opaqueValues: Uint32Array.from(opaqueValues)
  }
  const shiftedTarget = { ...target, x: target.x + shiftX, y: target.y + shiftY }
  const shiftedBounds = transformedSelectionBounds(shiftedTarget, angle, shear)
  const pixels = new Uint8ClampedArray(shiftedBounds.width * shiftedBounds.height * 4)
  for (const cell of selectionTransformCells(virtualDocument, sourceData, shiftedTarget, angle, shear, virtualLayer)) {
    const localX = cell.x - shiftedBounds.x
    const localY = cell.y - shiftedBounds.y
    if (localX < 0 || localY < 0 || localX >= shiftedBounds.width || localY >= shiftedBounds.height) continue
    const offset = (localY * shiftedBounds.width + localX) * 4
    pixels[offset] = cell.value & 0xff
    pixels[offset + 1] = (cell.value >>> 8) & 0xff
    pixels[offset + 2] = (cell.value >>> 16) & 0xff
    pixels[offset + 3] = (cell.value >>> 24) & 0xff
  }
  return {
    format: 'rgba',
    width: shiftedBounds.width,
    height: shiftedBounds.height,
    offsetX: shiftedBounds.x - shiftX,
    offsetY: shiftedBounds.y - shiftY,
    pixels
  }
}
