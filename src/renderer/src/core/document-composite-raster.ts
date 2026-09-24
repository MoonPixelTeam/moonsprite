import type { BlendMode } from '@shared/types-color'
import type { RasterLayer } from '@shared/types-layer'
import type { SelectionRect } from '@shared/types-selection'
import type { SpriteDocument } from '@shared/types-document'
import { blendWithMode, blendWithModeInto, TRANSPARENT } from './raster'
import {
  lazyRuntimeRasterForSurface,
  readSurfacePackedLocal,
  readSurfacePackedRegion,
  readSurfaceRgbaRegion,
  runtimeTileHasVisiblePixels
} from './runtime-raster'
import { type DocumentCompositeCache } from './document-composite-cache'
import { styledLayerBlockCacheFor } from './document-composite-style-types'
import { type CompositeStackItem } from './document-composite-plan'

const MAX_ROW_RANGE_SCAN_PIXELS = 1024 * 1024

const COMPOSITE_TILE_SIZE = 64

/** Copies opaque spans in one operation while preserving transparent and translucent pixels. */
export const compositeRgbaRowWithOpaqueSpans = (
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

export const compositeNormalLayers = (document: SpriteDocument, layers: readonly RasterLayer[], startX: number, startY: number, width: number, height: number, cache?: DocumentCompositeCache, revision = 0, output: Uint8ClampedArray<ArrayBufferLike> = new Uint8ClampedArray(width * height * 4), dirtyRect?: SelectionRect): Uint8ClampedArray => {
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

export const compositeBufferWithModeInto = (
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

export const compositeOpacityGroupStack = (
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
