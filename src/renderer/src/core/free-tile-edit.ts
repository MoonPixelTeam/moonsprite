import type { FreeTileInstance } from '@shared/types-tiles'
import type { RasterLayer } from '@shared/types-layer'
import type { SelectionMask, SelectionRect } from '@shared/types-selection'
import type { SpriteDocument } from '@shared/types-document'
import { createLayer, getPaletteEntry, paletteColorIdForCanvas } from './document-model'
import type { FreeTileSourceEditSnapshot } from './free-tile-document'
import { freeTileInstanceInverseTransformPoint, transformFreeTileSourcePixels, type FreeTileInstanceTransform, type FreeTileSourceRef } from './free-tile'
import { relativeLuminanceColor } from './raster'
import { selectionContains, shiftSelection } from './selection'
import { readTilesetTilePixels } from './tilemap'

export interface FreeTileSourceEditRaster {
  document: SpriteDocument
  layer: RasterLayer
  before: FreeTileSourceEditSnapshot
  /** Document-space position of the temporary raster's local origin. */
  origin: { x: number; y: number }
  /** Local coordinate where the source's previous top-left pixel was inserted. */
  sourceOffset: { x: number; y: number }
  /** Instance-only orientation used to present and map the shared source. */
  instanceTransform: FreeTileInstanceTransform
  /** Previous source bounds after applying the instance orientation, relative to its anchor. */
  transformedSourceBounds: SelectionRect
}

export const freeTileSelectionToEditRaster = (
  edit: FreeTileSourceEditRaster,
  selection: SelectionMask | null
): SelectionMask | null => shiftSelection(
  selection,
  -edit.origin.x,
  -edit.origin.y,
  edit.document.width,
  edit.document.height
)

export const freeTileSelectionFromEditRaster = (
  edit: FreeTileSourceEditRaster,
  selection: SelectionMask | null,
  documentWidth: number,
  documentHeight: number
): SelectionMask | null => shiftSelection(
  selection,
  edit.origin.x,
  edit.origin.y,
  documentWidth,
  documentHeight
)

/**
 * Existing source-edit selections stay in document coordinates even when
 * transparent source padding is cropped after a transform. The current
 * instance bounds only decide whether the selection still belongs to that
 * instance; they must not trim the selection geometry again.
 */
export const freeTileSelectionForInstanceEdit = (
  selection: SelectionMask | null,
  instanceBounds?: SelectionRect
): SelectionMask | null => {
  if (!selection || !instanceBounds) return selection
  const left = Math.max(selection.x, instanceBounds.x)
  const top = Math.max(selection.y, instanceBounds.y)
  const right = Math.min(selection.x + selection.width, instanceBounds.x + instanceBounds.width)
  const bottom = Math.min(selection.y + selection.height, instanceBounds.y + instanceBounds.height)
  if (right <= left || bottom <= top) return null
  if (!selection.mask) return selection
  for (let y = top; y < bottom; y += 1) for (let x = left; x < right; x += 1) {
    if (selection.mask[(y - selection.y) * selection.width + x - selection.x] === 1) return selection
  }
  return null
}

/** Returns whether a selection contains every pixel in an instance rectangle. */
export const selectionCoversRect = (selection: SelectionMask | null, bounds: SelectionRect): boolean => {
  if (!selection
    || selection.x > bounds.x
    || selection.y > bounds.y
    || selection.x + selection.width < bounds.x + bounds.width
    || selection.y + selection.height < bounds.y + bounds.height) return false
  for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
    for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
      if (!selectionContains(selection, x, y)) return false
    }
  }
  return true
}

export const freeTileTransformTargetToEditRaster = (
  edit: FreeTileSourceEditRaster,
  target: SelectionRect
): SelectionRect => ({
  ...target,
  x: target.x - edit.origin.x,
  y: target.y - edit.origin.y,
  ...(target.flipOriginX === undefined ? {} : { flipOriginX: target.flipOriginX - edit.origin.x }),
  ...(target.flipOriginY === undefined ? {} : { flipOriginY: target.flipOriginY - edit.origin.y })
})

const sourcePixelsIntoLayer = (sourceDocument: SpriteDocument, layer: RasterLayer, pixels: Uint8ClampedArray): void => {
  if (layer.format === 'rgba') {
    if (sourceDocument.colorMode === 'grayscale') {
      for (let index = 0; index < layer.width * layer.height; index += 1) {
        const offset = index * 4
        const color = relativeLuminanceColor({ r: pixels[offset], g: pixels[offset + 1], b: pixels[offset + 2], a: pixels[offset + 3] })
        layer.pixels[offset] = color.r
        layer.pixels[offset + 1] = color.g
        layer.pixels[offset + 2] = color.b
        layer.pixels[offset + 3] = color.a
      }
    } else layer.pixels.set(pixels)
    return
  }
  for (let index = 0; index < layer.pixels.length; index += 1) {
    const offset = index * 4
    const color = { r: pixels[offset], g: pixels[offset + 1], b: pixels[offset + 2], a: pixels[offset + 3] }
    layer.pixels[index] = color.a === 0 ? 0 : paletteColorIdForCanvas(sourceDocument, color)
  }
}

export const createFreeTileSourceEditRaster = (
  sourceDocument: SpriteDocument,
  source: FreeTileSourceRef,
  instanceBounds?: SelectionRect,
  editPoint?: { x: number; y: number },
  instance?: Pick<FreeTileInstance, 'rotation' | 'flipHorizontal' | 'flipVertical'>,
  compact = false
): FreeTileSourceEditRaster | null => {
  const tileset = source.tileset
  const tileId = tileset.tileIds[0]
  if (!tileId) return null
  const before = readTilesetTilePixels(tileset, tileId)
  if (!before) return null
  const instanceTransform: FreeTileInstanceTransform = {
    ...(instance?.rotation ? { rotation: instance.rotation } : {}),
    ...(instance?.flipHorizontal ? { flipHorizontal: true } : {}),
    ...(instance?.flipVertical ? { flipVertical: true } : {})
  }
  const transformedSource = transformFreeTileSourcePixels(
    before,
    tileset.tileWidth,
    tileset.tileHeight,
    source.offsetX,
    source.offsetY,
    instanceTransform
  )
  const padding = Math.max(16, Math.min(128, Math.max(sourceDocument.width, sourceDocument.height)))
  const sourceX = instanceBounds?.x ?? Math.floor((sourceDocument.width - transformedSource.bounds.width) / 2)
  const sourceY = instanceBounds?.y ?? Math.floor((sourceDocument.height - transformedSource.bounds.height) / 2)
  const editX = Math.floor(editPoint?.x ?? sourceX)
  const editY = Math.floor(editPoint?.y ?? sourceY)
  const left = Math.min(compact ? sourceX : 0, sourceX, editX) - padding
  const top = Math.min(compact ? sourceY : 0, sourceY, editY) - padding
  const right = Math.max(compact ? sourceX : sourceDocument.width, sourceX + transformedSource.bounds.width, editX + 1) + padding
  const bottom = Math.max(compact ? sourceY : sourceDocument.height, sourceY + transformedSource.bounds.height, editY + 1) + padding
  const width = right - left
  const height = bottom - top
  const origin = { x: left, y: top }
  const sourceOffset = { x: sourceX - origin.x, y: sourceY - origin.y }
  const layer = createLayer('Free Tile Source', width, height, sourceDocument.colorMode)
  layer.offsetX = 0
  layer.offsetY = 0

  const sourceLayer = createLayer('Free Tile Source Pixels', transformedSource.bounds.width, transformedSource.bounds.height, sourceDocument.colorMode)
  sourcePixelsIntoLayer(sourceDocument, sourceLayer, transformedSource.pixels)
  const targetX = sourceOffset.x
  const targetY = sourceOffset.y
  if (layer.format === 'rgba' && sourceLayer.format === 'rgba') {
    for (let y = 0; y < sourceLayer.height; y += 1) {
      const from = y * sourceLayer.width * 4
      const to = ((targetY + y) * layer.width + targetX) * 4
      layer.pixels.set(sourceLayer.pixels.subarray(from, from + sourceLayer.width * 4), to)
    }
  } else if (layer.format === 'indexed' && sourceLayer.format === 'indexed') {
    for (let y = 0; y < sourceLayer.height; y += 1) {
      const from = y * sourceLayer.width
      const to = (targetY + y) * layer.width + targetX
      layer.pixels.set(sourceLayer.pixels.subarray(from, from + sourceLayer.width), to)
    }
  }
  return {
    before: {
      sourceId: source.id,
      tilesetId: tileset.id,
      width: tileset.tileWidth,
      height: tileset.tileHeight,
      pixels: before,
      offsetX: source.offsetX,
      offsetY: source.offsetY
    },
    layer,
    origin,
    sourceOffset,
    instanceTransform,
    transformedSourceBounds: transformedSource.bounds,
    document: {
      ...sourceDocument,
      width,
      height,
      layers: [layer],
      groups: [],
      activeLayerId: layer.id,
      animation: undefined
    }
  }
}

export interface CroppedFreeTileSource {
  pixels: Uint8ClampedArray
  width: number
  height: number
  offsetX: number
  offsetY: number
  empty: boolean
}

/** Crops transparent padding while preserving the source anchor through the returned offset. */
export const cropFreeTileSourceRaster = (sourceDocument: SpriteDocument, layer: RasterLayer, bounds?: SelectionRect): CroppedFreeTileSource => {
  const scanLeft = bounds ? Math.max(0, Math.floor(bounds.x)) : 0
  const scanTop = bounds ? Math.max(0, Math.floor(bounds.y)) : 0
  const scanRight = bounds ? Math.min(layer.width, Math.ceil(bounds.x + bounds.width)) : layer.width
  const scanBottom = bounds ? Math.min(layer.height, Math.ceil(bounds.y + bounds.height)) : layer.height
  const palette = layer.format === 'indexed' ? new Map(sourceDocument.palette.map(entry => [entry.id, entry.color])) : null
  const colorAt = (index: number) => palette?.get(layer.pixels[index]) ?? getPaletteEntry(sourceDocument, layer.pixels[index]).color
  let left = layer.width
  let top = layer.height
  let right = -1
  let bottom = -1
  for (let y = scanTop; y < scanBottom; y += 1) for (let x = scanLeft; x < scanRight; x += 1) {
    const index = y * layer.width + x
    if ((layer.format === 'rgba' ? layer.pixels[index * 4 + 3] : colorAt(index).a) === 0) continue
    left = Math.min(left, x)
    top = Math.min(top, y)
    right = Math.max(right, x)
    bottom = Math.max(bottom, y)
  }
  if (right < left || bottom < top) return { pixels: new Uint8ClampedArray(4), width: 1, height: 1, offsetX: 0, offsetY: 0, empty: true }
  const width = right - left + 1
  const height = bottom - top + 1
  const pixels = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    const from = ((top + y) * layer.width + left) * 4
    if (layer.format === 'rgba') pixels.set(layer.pixels.subarray(from, from + width * 4), y * width * 4)
    else for (let x = 0; x < width; x++) {
      const color = colorAt((top + y) * layer.width + left + x)
      const offset = (y * width + x) * 4
      pixels[offset] = color.r; pixels[offset + 1] = color.g; pixels[offset + 2] = color.b; pixels[offset + 3] = color.a
    }
  }
  return { pixels, width, height, offsetX: left, offsetY: top, empty: false }
}

export const freeTileSourceSnapshotFromEditRaster = (edit: FreeTileSourceEditRaster, dirtyRect?: SelectionRect): FreeTileSourceEditSnapshot => {
  // The edit starts blank except for the source. Brush edits track all touched
  // pixels, so source bounds plus the cumulative dirty rectangle contain every
  // possible non-transparent pixel, including growth beyond the original tile.
  const leftBound = Math.min(edit.sourceOffset.x, dirtyRect?.x ?? edit.sourceOffset.x)
  const topBound = Math.min(edit.sourceOffset.y, dirtyRect?.y ?? edit.sourceOffset.y)
  const bounds = dirtyRect ? {
    x: leftBound, y: topBound,
    width: Math.max(edit.sourceOffset.x + edit.transformedSourceBounds.width, dirtyRect.x + dirtyRect.width) - leftBound,
    height: Math.max(edit.sourceOffset.y + edit.transformedSourceBounds.height, dirtyRect.y + dirtyRect.height) - topBound
  } : undefined
  const cropped = cropFreeTileSourceRaster(edit.document, edit.layer, bounds)
  if (cropped.empty) {
    return {
      sourceId: edit.before.sourceId,
      tilesetId: edit.before.tilesetId,
      width: 1,
      height: 1,
      pixels: cropped.pixels,
      offsetX: 0,
      offsetY: 0
    }
  }
  const transformedX = edit.transformedSourceBounds.x + cropped.offsetX - edit.sourceOffset.x
  const transformedY = edit.transformedSourceBounds.y + cropped.offsetY - edit.sourceOffset.y
  if (!edit.instanceTransform.rotation && !edit.instanceTransform.flipHorizontal && !edit.instanceTransform.flipVertical) {
    return { sourceId: edit.before.sourceId, tilesetId: edit.before.tilesetId,
      width: cropped.width, height: cropped.height, pixels: cropped.pixels, offsetX: transformedX, offsetY: transformedY }
  }
  let left = Number.POSITIVE_INFINITY
  let top = Number.POSITIVE_INFINITY
  let right = Number.NEGATIVE_INFINITY
  let bottom = Number.NEGATIVE_INFINITY
  for (const y of [0, cropped.height - 1]) for (const x of [0, cropped.width - 1]) {
    const point = freeTileInstanceInverseTransformPoint(edit.instanceTransform, transformedX + x, transformedY + y)
    left = Math.min(left, point.x)
    top = Math.min(top, point.y)
    right = Math.max(right, point.x)
    bottom = Math.max(bottom, point.y)
  }
  const width = right - left + 1
  const height = bottom - top + 1
  const pixels = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < cropped.height; y += 1) for (let x = 0; x < cropped.width; x += 1) {
    const point = freeTileInstanceInverseTransformPoint(edit.instanceTransform, transformedX + x, transformedY + y)
    const sourceOffset = (y * cropped.width + x) * 4
    const targetOffset = ((point.y - top) * width + point.x - left) * 4
    pixels[targetOffset] = cropped.pixels[sourceOffset]
    pixels[targetOffset + 1] = cropped.pixels[sourceOffset + 1]
    pixels[targetOffset + 2] = cropped.pixels[sourceOffset + 2]
    pixels[targetOffset + 3] = cropped.pixels[sourceOffset + 3]
  }
  return {
    sourceId: edit.before.sourceId,
    tilesetId: edit.before.tilesetId,
    width,
    height,
    pixels,
    offsetX: left,
    offsetY: top
  }
}

export const freeTileSourcePixelsFromRaster = (sourceDocument: SpriteDocument, layer: RasterLayer): Uint8ClampedArray =>
  cropFreeTileSourceRaster(sourceDocument, layer).pixels
