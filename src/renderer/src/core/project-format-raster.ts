import { type RasterLayer } from '@shared/types-layer'
import { type RasterFormat, type RuntimeRasterTiles } from '@shared/types-raster'
import { type SpriteDocument } from '@shared/types-document'
import { getLayerStorageOrigin, setLayerStorageOrigin } from './document-model'
import {
  type RasterDataEncoding,
  SPARSE_TILE_SIZE,
  SPARSE_TILE_HEADER_BYTES,
  SPARSE_TILE_ENTRY_BYTES,
  SPARSE_TILE_MAGIC
} from './project-format-manifest-types'

export const toU8 = (array: Uint8ClampedArray | Uint32Array): Uint8Array => new Uint8Array(array.buffer, array.byteOffset, array.byteLength)

interface EncodedRasterData {
  data: Uint8Array
  encoding: RasterDataEncoding
}

export interface DecodedRasterData {
  pixels: Uint8ClampedArray | Uint32Array
  width: number
  height: number
  storageOffsetX: number
  storageOffsetY: number
  runtimeRaster?: RuntimeRasterTiles
}

const tileContainsContent = (pixels: Uint8ClampedArray | Uint32Array, format: RasterFormat, width: number, startX: number, startY: number, tileWidth: number, tileHeight: number): boolean => {
  for (let y = 0; y < tileHeight; y += 1) {
    let index = (startY + y) * width + startX
    const end = index + tileWidth
    if (format === 'rgba' && pixels instanceof Uint8ClampedArray) {
      for (; index < end; index += 1) {
        const offset = index * 4
        if (pixels[offset] !== 0 || pixels[offset + 1] !== 0 || pixels[offset + 2] !== 0 || pixels[offset + 3] !== 0) return true
      }
    } else if (format === 'indexed' && pixels instanceof Uint32Array) {
      for (; index < end; index += 1) if (pixels[index] !== 0) return true
    }
  }
  return false
}

export const encodeSparseRasterData = (pixels: Uint8ClampedArray | Uint32Array, format: RasterFormat, width: number, height: number): EncodedRasterData => {
  const raw = toU8(pixels)
  const tiles: Array<{
    x: number
    y: number
    width: number
    height: number
    data: Uint8Array
  }> = []
  let payloadBytes = 0
  for (let y = 0; y < height; y += SPARSE_TILE_SIZE)
    for (let x = 0; x < width; x += SPARSE_TILE_SIZE) {
      const tileWidth = Math.min(SPARSE_TILE_SIZE, width - x)
      const tileHeight = Math.min(SPARSE_TILE_SIZE, height - y)
      if (!tileContainsContent(pixels, format, width, x, y, tileWidth, tileHeight)) continue
      const bytes = new Uint8Array(tileWidth * tileHeight * 4)
      for (let row = 0; row < tileHeight; row += 1) {
        const sourceOffset = ((y + row) * width + x) * 4
        bytes.set(raw.subarray(sourceOffset, sourceOffset + tileWidth * 4), row * tileWidth * 4)
      }
      tiles.push({ x, y, width: tileWidth, height: tileHeight, data: bytes })
      payloadBytes += bytes.byteLength
    }
  const encodedBytes = SPARSE_TILE_HEADER_BYTES + tiles.length * SPARSE_TILE_ENTRY_BYTES + payloadBytes
  if (encodedBytes >= raw.byteLength) return { data: raw, encoding: 'raw' }
  const data = new Uint8Array(encodedBytes)
  const view = new DataView(data.buffer)
  view.setUint32(0, SPARSE_TILE_MAGIC, true)
  view.setUint16(4, SPARSE_TILE_SIZE, true)
  view.setUint8(6, format === 'rgba' ? 1 : 2)
  view.setUint32(8, width, true)
  view.setUint32(12, height, true)
  view.setUint32(16, tiles.length, true)
  view.setUint32(20, payloadBytes, true)
  let entryOffset = SPARSE_TILE_HEADER_BYTES
  let dataOffset = SPARSE_TILE_HEADER_BYTES + tiles.length * SPARSE_TILE_ENTRY_BYTES
  for (const tile of tiles) {
    view.setUint32(entryOffset, tile.x, true)
    view.setUint32(entryOffset + 4, tile.y, true)
    view.setUint16(entryOffset + 8, tile.width, true)
    view.setUint16(entryOffset + 10, tile.height, true)
    view.setUint32(entryOffset + 12, dataOffset, true)
    data.set(tile.data, dataOffset)
    entryOffset += SPARSE_TILE_ENTRY_BYTES
    dataOffset += tile.data.byteLength
  }
  return { data, encoding: 'sparse-tiles-v1' }
}

export const encodeRuntimeRasterData = (runtime: RuntimeRasterTiles): EncodedRasterData => {
  const tileColumns = Math.ceil(runtime.width / runtime.tileSize)
  const slots = Array.from(runtime.tileOffsets.entries()).filter((entry) => entry[1] !== 0)
  const entriesEnd = SPARSE_TILE_HEADER_BYTES + slots.length * SPARSE_TILE_ENTRY_BYTES
  const data = new Uint8Array(entriesEnd + runtime.data.byteLength)
  const view = new DataView(data.buffer)
  view.setUint32(0, SPARSE_TILE_MAGIC, true)
  view.setUint16(4, runtime.tileSize, true)
  view.setUint8(6, runtime.format === 'rgba' ? 1 : 2)
  view.setUint32(8, runtime.width, true)
  view.setUint32(12, runtime.height, true)
  view.setUint32(16, slots.length, true)
  view.setUint32(20, runtime.data.byteLength, true)
  let payloadOffset = entriesEnd
  for (let index = 0; index < slots.length; index += 1) {
    const [slot, encodedOffset] = slots[index]
    const tileX = slot % tileColumns
    const tileY = Math.floor(slot / tileColumns)
    const x = tileX * runtime.tileSize
    const y = tileY * runtime.tileSize
    const entryOffset = SPARSE_TILE_HEADER_BYTES + index * SPARSE_TILE_ENTRY_BYTES
    view.setUint32(entryOffset, x, true)
    view.setUint32(entryOffset + 4, y, true)
    const tileWidth = Math.min(runtime.tileSize, runtime.width - x)
    const tileHeight = Math.min(runtime.tileSize, runtime.height - y)
    const tileBytes = tileWidth * tileHeight * 4
    view.setUint16(entryOffset + 8, tileWidth, true)
    view.setUint16(entryOffset + 10, tileHeight, true)
    view.setUint32(entryOffset + 12, payloadOffset, true)
    data.set(runtime.data.subarray(encodedOffset - 1, encodedOffset - 1 + tileBytes), payloadOffset)
    payloadOffset += tileBytes
  }
  return { data, encoding: 'sparse-tiles-v1' }
}

export const decodeSparseRasterData = (data: Uint8Array, format: RasterFormat, width: number, height: number): DecodedRasterData | null => {
  if (data.byteLength < SPARSE_TILE_HEADER_BYTES) return null
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  if (view.getUint32(0, true) !== SPARSE_TILE_MAGIC || view.getUint16(4, true) !== SPARSE_TILE_SIZE) return null
  if (view.getUint8(6) !== (format === 'rgba' ? 1 : 2) || view.getUint32(8, true) !== width || view.getUint32(12, true) !== height) return null
  const tileCount = view.getUint32(16, true)
  const payloadBytes = view.getUint32(20, true)
  const entriesEnd = SPARSE_TILE_HEADER_BYTES + tileCount * SPARSE_TILE_ENTRY_BYTES
  const outputByteLength = width * height * 4
  const tileColumns = Math.ceil(width / SPARSE_TILE_SIZE)
  const tileRows = Math.ceil(height / SPARSE_TILE_SIZE)
  if (!Number.isSafeInteger(entriesEnd) || entriesEnd > data.byteLength || payloadBytes !== data.byteLength - entriesEnd) return null
  if (!Number.isSafeInteger(outputByteLength) || outputByteLength < 0 || tileCount > tileColumns * tileRows) return null
  const tileOffsets = new Int32Array(tileColumns * tileRows)
  let expectedDataOffset = entriesEnd
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let index = 0; index < tileCount; index += 1) {
    const entryOffset = SPARSE_TILE_HEADER_BYTES + index * SPARSE_TILE_ENTRY_BYTES
    const x = view.getUint32(entryOffset, true)
    const y = view.getUint32(entryOffset + 4, true)
    const tileWidth = view.getUint16(entryOffset + 8, true)
    const tileHeight = view.getUint16(entryOffset + 10, true)
    const dataOffset = view.getUint32(entryOffset + 12, true)
    if (!tileWidth || !tileHeight || x >= width || y >= height || x % SPARSE_TILE_SIZE !== 0 || y % SPARSE_TILE_SIZE !== 0 || dataOffset !== expectedDataOffset) return null
    if (tileWidth !== Math.min(SPARSE_TILE_SIZE, width - x) || tileHeight !== Math.min(SPARSE_TILE_SIZE, height - y)) return null
    const slot = (y / SPARSE_TILE_SIZE) * tileColumns + x / SPARSE_TILE_SIZE
    if (tileOffsets[slot] !== 0) return null
    const tileBytes = tileWidth * tileHeight * 4
    if (dataOffset + tileBytes > data.byteLength) return null
    tileOffsets[slot] = dataOffset - entriesEnd + 1
    expectedDataOffset += tileBytes
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x + tileWidth - 1)
    maxY = Math.max(maxY, y + tileHeight - 1)
  }
  if (expectedDataOffset !== data.byteLength) return null
  const runtimeRaster: RuntimeRasterTiles = {
    kind: 'sparse-tiles-v1',
    format,
    width,
    height,
    tileSize: SPARSE_TILE_SIZE,
    data: data.slice(entriesEnd),
    tileOffsets,
    visibleBounds: maxX < minX || maxY < minY ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
  }
  return {
    pixels: format === 'rgba' ? new Uint8ClampedArray(4) : new Uint32Array(1),
    width,
    height,
    storageOffsetX: 0,
    storageOffsetY: 0,
    runtimeRaster
  }
}

export const PROJECT_PREVIEW_MAX_DIMENSION = 512

const LARGE_PROJECT_STORAGE_PIXELS = 32 * 1024 * 1024

type DecodedRasterSurface = RasterLayer | NonNullable<NonNullable<SpriteDocument['animation']>['cels'][number]['surface']>

export const compactProjectRasterStorage = (document: SpriteDocument, minimumStoredPixels = LARGE_PROJECT_STORAGE_PIXELS): void => {
  const surfaces: DecodedRasterSurface[] = [...document.layers, ...(document.animation?.cels.flatMap((cel) => (cel.surface ? [cel.surface] : [])) ?? [])]
  const uniquePixels = new Set(surfaces.map((surface) => surface.pixels))
  const storedPixels = [...uniquePixels].reduce((total, pixels) => total + (pixels instanceof Uint8ClampedArray ? pixels.length / 4 : pixels.length), 0)
  if (storedPixels < minimumStoredPixels) return

  const opaquePaletteIds = new Set(document.palette.filter((entry) => entry.color.a > 0).map((entry) => entry.id))
  const layers = new Set<RasterLayer>(document.layers)
  const surfacesByPixels = new Map<DecodedRasterSurface['pixels'], DecodedRasterSurface[]>()
  for (const surface of surfaces) {
    const entries = surfacesByPixels.get(surface.pixels) ?? []
    entries.push(surface)
    surfacesByPixels.set(surface.pixels, entries)
  }

  for (const entries of surfacesByPixels.values()) {
    const source = entries[0]
    if (entries.some((surface) => surface.format !== source.format || surface.width !== source.width || surface.height !== source.height)) continue
    let minX = source.width
    let minY = source.height
    let maxX = -1
    let maxY = -1
    for (let y = 0; y < source.height; y += 1) {
      let left = 0
      let right = source.width - 1
      if (source.format === 'rgba') {
        const rowOffset = y * source.width * 4
        while (left <= right && source.pixels[rowOffset + left * 4 + 3] === 0) left += 1
        while (right >= left && source.pixels[rowOffset + right * 4 + 3] === 0) right -= 1
      } else {
        const rowOffset = y * source.width
        while (left <= right && !opaquePaletteIds.has(source.pixels[rowOffset + left])) left += 1
        while (right >= left && !opaquePaletteIds.has(source.pixels[rowOffset + right])) right -= 1
      }
      if (right < left) continue
      minX = Math.min(minX, left)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, right)
      maxY = y
    }

    const empty = maxX < minX || maxY < minY
    const width = empty ? 1 : maxX - minX + 1
    const height = empty ? 1 : maxY - minY + 1
    if (!empty && width * height > source.width * source.height * 0.9) continue
    const pixels = source.format === 'rgba' ? new Uint8ClampedArray(width * height * 4) : new Uint32Array(width * height)
    if (!empty) {
      for (let y = 0; y < height; y += 1) {
        if (source.format === 'rgba' && pixels instanceof Uint8ClampedArray) {
          const start = ((minY + y) * source.width + minX) * 4
          pixels.set(source.pixels.subarray(start, start + width * 4), y * width * 4)
        } else if (source.format === 'indexed' && pixels instanceof Uint32Array) {
          const start = (minY + y) * source.width + minX
          pixels.set(source.pixels.subarray(start, start + width), y * width)
        }
      }
    }
    for (const surface of entries) {
      const layerStorageOrigin = layers.has(surface as RasterLayer) ? getLayerStorageOrigin(surface as RasterLayer) : null
      surface.width = width
      surface.height = height
      if (!empty) {
        surface.offsetX += minX
        surface.offsetY += minY
        if ('storageOriginX' in surface) surface.storageOriginX = (surface.storageOriginX ?? 0) + minX
        if ('storageOriginY' in surface) surface.storageOriginY = (surface.storageOriginY ?? 0) + minY
        if (layerStorageOrigin)
          setLayerStorageOrigin(surface as RasterLayer, {
            x: layerStorageOrigin.x + minX,
            y: layerStorageOrigin.y + minY
          })
      }
      if (surface.format === 'rgba' && pixels instanceof Uint8ClampedArray) surface.pixels = pixels
      if (surface.format === 'indexed' && pixels instanceof Uint32Array) surface.pixels = pixels
    }
  }
}

export const rasterDataEncoding = (value: unknown): RasterDataEncoding | null => (value === undefined || value === 'raw' ? 'raw' : value === 'sparse-tiles-v1' ? value : null)
