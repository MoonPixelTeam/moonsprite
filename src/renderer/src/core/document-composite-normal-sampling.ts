import type { RgbaColor } from '@shared/types-color'
import type { RasterLayer } from '@shared/types-layer'
import type { SpriteDocument } from '@shared/types-document'
import { TRANSPARENT, unpackColor } from './raster'
import { readSurfacePackedLocal } from './runtime-raster'
import { layerIndexAt } from './document-model'
import { normalCompositeLayers } from './document-composite-plan'

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

