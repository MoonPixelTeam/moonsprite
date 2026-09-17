import type { AnimationCelSurface } from '@shared/types-animation'
import type { RasterFormat, RuntimeRasterTiles } from '@shared/types-raster'
import type { RasterLayer } from '@shared/types-layer'
import type { SpriteDocument } from '@shared/types-document'
import { beginRuntimeDiagnosticOperation, runtimeDiagnosticsActive } from './runtime-diagnostics'

type RasterSurface = RasterLayer | AnimationCelSurface
type RasterPixels = Uint8ClampedArray | Uint32Array

export interface RuntimeRasterVisibleBounds { x: number; y: number; width: number; height: number }

interface RuntimeRasterState {
  runtime: RuntimeRasterTiles | null
  pixels: RasterPixels | null
}

const states = new WeakMap<object, RuntimeRasterState>()
const materializedByRuntime = new WeakMap<RuntimeRasterTiles, RasterPixels>()
const rgbaVisibleTiles = new WeakMap<RuntimeRasterTiles, Map<number, boolean>>()
const indexedVisibleTiles = new WeakMap<RuntimeRasterTiles, WeakMap<object, Map<number, boolean>>>()
const rgbaVisibleBounds = new WeakMap<RuntimeRasterTiles, RuntimeRasterVisibleBounds | null>()
const indexedVisibleBounds = new WeakMap<RuntimeRasterTiles, WeakMap<object, RuntimeRasterVisibleBounds | null>>()
const nonZeroIndexedPixels = new Set<number>()

const blankPixels = (format: RasterFormat): RasterPixels => format === 'rgba' ? new Uint8ClampedArray(4) : new Uint32Array(1)

const materializeRuntimeRaster = (runtime: RuntimeRasterTiles): RasterPixels => {
  const cached = materializedByRuntime.get(runtime)
  if (cached) return cached
  const expandedBytes = runtime.width * runtime.height * 4
  const diagnostic = runtimeDiagnosticsActive() && expandedBytes >= 8 * 1024 * 1024
    ? beginRuntimeDiagnosticOperation('raster.materialize', {
        width: runtime.width,
        height: runtime.height,
        expandedBytes,
        storedBytes: runtime.data.byteLength + runtime.tileOffsets.byteLength
      }, 500)
    : null
  try {
    const bytes = new Uint8Array(expandedBytes)
    const columns = Math.ceil(runtime.width / runtime.tileSize)
    for (let slot = 0; slot < runtime.tileOffsets.length; slot += 1) {
      const encodedOffset = runtime.tileOffsets[slot]
      if (encodedOffset === 0) continue
      const tileX = slot % columns
      const tileY = Math.floor(slot / columns)
      const startX = tileX * runtime.tileSize
      const startY = tileY * runtime.tileSize
      const tileWidth = Math.min(runtime.tileSize, runtime.width - startX)
      const tileHeight = Math.min(runtime.tileSize, runtime.height - startY)
      const dataOffset = encodedOffset - 1
      for (let row = 0; row < tileHeight; row += 1) {
        const sourceOffset = dataOffset + row * tileWidth * 4
        const targetOffset = ((startY + row) * runtime.width + startX) * 4
        bytes.set(runtime.data.subarray(sourceOffset, sourceOffset + tileWidth * 4), targetOffset)
      }
    }
    const pixels = runtime.format === 'rgba' ? new Uint8ClampedArray(bytes.buffer) : new Uint32Array(bytes.buffer)
    materializedByRuntime.set(runtime, pixels)
    diagnostic?.finish('ok')
    return pixels
  } catch (error) {
    diagnostic?.finish('error', { message: error instanceof Error ? error.message : String(error) })
    throw error
  }
}

const installAccessor = (surface: RasterSurface, state: RuntimeRasterState): void => {
  states.set(surface, state)
  Object.defineProperty(surface, 'pixels', {
    configurable: true,
    enumerable: true,
    get(): RasterPixels {
      if (!state.pixels) state.pixels = state.runtime ? materializeRuntimeRaster(state.runtime) : blankPixels(surface.format)
      return state.pixels
    },
    set(value: RasterPixels): void {
      state.pixels = value
      state.runtime = null
      delete surface.runtimeRaster
    }
  })
}

export const installRuntimeRaster = (surface: RasterSurface, runtime: RuntimeRasterTiles): void => {
  surface.runtimeRaster = runtime
  installAccessor(surface, { runtime, pixels: null })
}

export const rehydrateRuntimeRasterSurface = (surface: RasterSurface): void => {
  if (surface.runtimeRaster) installRuntimeRaster(surface, surface.runtimeRaster)
}

export const rehydrateRuntimeRasterDocument = (document: SpriteDocument): void => {
  for (const layer of document.layers) rehydrateRuntimeRasterSurface(layer)
  for (const cel of document.animation?.cels ?? []) if (cel.surface) rehydrateRuntimeRasterSurface(cel.surface)
}

export const prepareRuntimeRasterDocumentForTransfer = (document: SpriteDocument): void => {
  const prepare = (surface: RasterSurface): void => {
    const state = states.get(surface)
    if (!state?.runtime) return
    const materialized = state.pixels ?? materializedByRuntime.get(state.runtime)
    if (materialized) {
      Object.defineProperty(surface, 'pixels', {
        configurable: true,
        enumerable: true,
        writable: true,
        value: materialized
      })
      delete surface.runtimeRaster
      states.delete(surface)
      return
    }
    surface.runtimeRaster = state.runtime
    Object.defineProperty(surface, 'pixels', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: blankPixels(surface.format)
    })
    states.delete(surface)
  }
  for (const layer of document.layers) prepare(layer)
  for (const cel of document.animation?.cels ?? []) if (cel.surface) prepare(cel.surface)
}

export const runtimeRasterForSurface = (surface: RasterSurface): RuntimeRasterTiles | null => states.get(surface)?.runtime ?? surface.runtimeRaster ?? null

export const lazyRuntimeRasterForSurface = (surface: RasterSurface): RuntimeRasterTiles | null => {
  const runtime = runtimeRasterForSurface(surface)
  return runtime && !materializedByRuntime.has(runtime) ? runtime : null
}

export const rasterStorageIdentity = (surface: RasterSurface): object => {
  return lazyRuntimeRasterForSurface(surface) ?? surface.pixels
}

export const surfacePixelsMaterialized = (surface: RasterSurface): boolean => {
  const state = states.get(surface)
  return !state?.runtime || state.pixels !== null || materializedByRuntime.has(state.runtime)
}

export const materializeSurfacePixels = (surface: RasterSurface): RasterPixels => surface.pixels

export const detachRuntimeRaster = (surface: RasterSurface): RasterPixels => {
  const pixels = surface.pixels
  const state = states.get(surface)
  if (state) {
    state.runtime = null
    state.pixels = pixels
  }
  delete surface.runtimeRaster
  return pixels
}

export const assignRasterStorage = (target: RasterSurface, source: RasterSurface, copyPixels = false): void => {
  const runtime = !copyPixels ? runtimeRasterForSurface(source) : null
  if (runtime && !materializedByRuntime.has(runtime)) installRuntimeRaster(target, runtime)
  else target.pixels = copyPixels ? source.pixels.slice() as RasterPixels : source.pixels
}

const runtimeByteOffset = (runtime: RuntimeRasterTiles, x: number, y: number): number | null => {
  if (x < 0 || y < 0 || x >= runtime.width || y >= runtime.height) return null
  const columns = Math.ceil(runtime.width / runtime.tileSize)
  const tileX = Math.floor(x / runtime.tileSize)
  const tileY = Math.floor(y / runtime.tileSize)
  const encodedOffset = runtime.tileOffsets[tileY * columns + tileX]
  if (encodedOffset === 0) return null
  const tileWidth = Math.min(runtime.tileSize, runtime.width - tileX * runtime.tileSize)
  return encodedOffset - 1 + ((y % runtime.tileSize) * tileWidth + x % runtime.tileSize) * 4
}

export const readSurfacePackedLocal = (surface: RasterSurface, x: number, y: number): number => {
  if (x < 0 || y < 0 || x >= surface.width || y >= surface.height) return 0
  const runtime = runtimeRasterForSurface(surface)
  if (runtime && !materializedByRuntime.has(runtime)) {
    const offset = runtimeByteOffset(runtime, x, y)
    if (offset === null) return 0
    return (runtime.data[offset] | (runtime.data[offset + 1] << 8) | (runtime.data[offset + 2] << 16) | (runtime.data[offset + 3] << 24)) >>> 0
  }
  const index = y * surface.width + x
  if (surface.format === 'indexed') return surface.pixels[index]
  const offset = index * 4
  return (surface.pixels[offset] | (surface.pixels[offset + 1] << 8) | (surface.pixels[offset + 2] << 16) | (surface.pixels[offset + 3] << 24)) >>> 0
}

/** Visit existing row storage without allocating a region or materializing sparse tiles.
 * packedBytes is true for RGBA bytes and sparse indexed IDs encoded as four bytes;
 * dense indexed rows expose Uint32 IDs directly. Coordinates are surface-local.
 */
export const visitSurfaceRasterRows = (
  surface: RasterSurface, x: number, y: number, width: number, height: number,
  visit: (data: Uint8Array | RasterPixels, offset: number, count: number, x: number, y: number, packedBytes: boolean) => void
): void => {
  const left = Math.max(0, x), top = Math.max(0, y)
  const right = Math.min(surface.width, x + width), bottom = Math.min(surface.height, y + height)
  if (right <= left || bottom <= top) return
  const runtime = lazyRuntimeRasterForSurface(surface)
  if (runtime) {
    const columns = Math.ceil(runtime.width / runtime.tileSize)
    const fromTileX = Math.floor(left / runtime.tileSize), toTileX = Math.floor((right - 1) / runtime.tileSize)
    const fromTileY = Math.floor(top / runtime.tileSize), toTileY = Math.floor((bottom - 1) / runtime.tileSize)
    for (let tileY = fromTileY; tileY <= toTileY; tileY += 1) for (let tileX = fromTileX; tileX <= toTileX; tileX += 1) {
      const encodedOffset = runtime.tileOffsets[tileY * columns + tileX]
      if (!encodedOffset) continue
      const tileLeft = tileX * runtime.tileSize, tileTop = tileY * runtime.tileSize
      const tileWidth = Math.min(runtime.tileSize, runtime.width - tileLeft)
      const copyLeft = Math.max(left, tileLeft), copyRight = Math.min(right, tileLeft + tileWidth)
      const copyTop = Math.max(top, tileTop), copyBottom = Math.min(bottom, tileTop + Math.min(runtime.tileSize, runtime.height - tileTop))
      for (let row = copyTop; row < copyBottom; row += 1) {
        visit(runtime.data, encodedOffset - 1 + ((row - tileTop) * tileWidth + copyLeft - tileLeft) * 4, copyRight - copyLeft, copyLeft, row, true)
      }
    }
    return
  }
  const pixels = surface.pixels
  const packedBytes = surface.format === 'rgba'
  const stride = packedBytes ? 4 : 1
  for (let row = top; row < bottom; row += 1) visit(pixels, (row * surface.width + left) * stride, right - left, left, row, packedBytes)
}

export const readSurfacePackedRegion = (surface: RasterSurface, x: number, y: number, width: number, height: number): Uint32Array => {
  const output = new Uint32Array(Math.max(0, width * height))
  if (width <= 0 || height <= 0) return output
  const left = Math.max(0, x)
  const top = Math.max(0, y)
  const right = Math.min(surface.width, x + width)
  const bottom = Math.min(surface.height, y + height)
  if (right <= left || bottom <= top) return output

  const runtime = lazyRuntimeRasterForSurface(surface)
  if (runtime) {
    const columns = Math.ceil(runtime.width / runtime.tileSize)
    const fromTileX = Math.floor(left / runtime.tileSize)
    const toTileX = Math.floor((right - 1) / runtime.tileSize)
    const fromTileY = Math.floor(top / runtime.tileSize)
    const toTileY = Math.floor((bottom - 1) / runtime.tileSize)
    for (let tileY = fromTileY; tileY <= toTileY; tileY += 1) for (let tileX = fromTileX; tileX <= toTileX; tileX += 1) {
      const encodedOffset = runtime.tileOffsets[tileY * columns + tileX]
      if (encodedOffset === 0) continue
      const tileLeft = tileX * runtime.tileSize
      const tileTop = tileY * runtime.tileSize
      const tileWidth = Math.min(runtime.tileSize, runtime.width - tileLeft)
      const copyLeft = Math.max(left, tileLeft)
      const copyTop = Math.max(top, tileTop)
      const copyRight = Math.min(right, tileLeft + tileWidth)
      const copyBottom = Math.min(bottom, tileTop + Math.min(runtime.tileSize, runtime.height - tileTop))
      for (let sourceY = copyTop; sourceY < copyBottom; sourceY += 1) {
        let sourceOffset = encodedOffset - 1 + ((sourceY - tileTop) * tileWidth + copyLeft - tileLeft) * 4
        let targetOffset = (sourceY - y) * width + copyLeft - x
        const copyWidth = copyRight - copyLeft
        const absoluteByteOffset = runtime.data.byteOffset + sourceOffset
        if (absoluteByteOffset % 4 === 0) {
          output.set(new Uint32Array(runtime.data.buffer as ArrayBuffer, absoluteByteOffset, copyWidth), targetOffset)
          continue
        }
        for (let sourceX = copyLeft; sourceX < copyRight; sourceX += 1) {
          output[targetOffset] = (runtime.data[sourceOffset] | (runtime.data[sourceOffset + 1] << 8) | (runtime.data[sourceOffset + 2] << 16) | (runtime.data[sourceOffset + 3] << 24)) >>> 0
          sourceOffset += 4
          targetOffset += 1
        }
      }
    }
    return output
  }

  if (surface.format === 'indexed') {
    for (let sourceY = top; sourceY < bottom; sourceY += 1) {
      const sourceOffset = sourceY * surface.width + left
      output.set(surface.pixels.subarray(sourceOffset, sourceOffset + right - left), (sourceY - y) * width + left - x)
    }
    return output
  }

  if (surface.pixels.byteOffset % 4 === 0) {
    const words = new Uint32Array(surface.pixels.buffer as ArrayBuffer, surface.pixels.byteOffset, surface.pixels.byteLength / 4)
    for (let sourceY = top; sourceY < bottom; sourceY += 1) {
      const sourceOffset = sourceY * surface.width + left
      output.set(words.subarray(sourceOffset, sourceOffset + right - left), (sourceY - y) * width + left - x)
    }
    return output
  }

  for (let sourceY = top; sourceY < bottom; sourceY += 1) {
    let sourceOffset = (sourceY * surface.width + left) * 4
    let targetOffset = (sourceY - y) * width + left - x
    for (let sourceX = left; sourceX < right; sourceX += 1) {
      output[targetOffset] = (surface.pixels[sourceOffset] | (surface.pixels[sourceOffset + 1] << 8) | (surface.pixels[sourceOffset + 2] << 16) | (surface.pixels[sourceOffset + 3] << 24)) >>> 0
      sourceOffset += 4
      targetOffset += 1
    }
  }
  return output
}

/** Reads an RGBA surface region without packing each pixel through Uint32Array. */
export const readSurfaceRgbaRegion = (surface: RasterSurface, x: number, y: number, width: number, height: number): Uint8ClampedArray => {
  const outputWidth = Math.max(0, width)
  const outputHeight = Math.max(0, height)
  const output = new Uint8ClampedArray(outputWidth * outputHeight * 4)
  if (surface.format !== 'rgba' || outputWidth === 0 || outputHeight === 0) return output
  const left = Math.max(0, x)
  const top = Math.max(0, y)
  const right = Math.min(surface.width, x + width)
  const bottom = Math.min(surface.height, y + height)
  if (right <= left || bottom <= top) return output

  const runtime = lazyRuntimeRasterForSurface(surface)
  if (runtime) {
    const columns = Math.ceil(runtime.width / runtime.tileSize)
    const fromTileX = Math.floor(left / runtime.tileSize)
    const toTileX = Math.floor((right - 1) / runtime.tileSize)
    const fromTileY = Math.floor(top / runtime.tileSize)
    const toTileY = Math.floor((bottom - 1) / runtime.tileSize)
    for (let tileY = fromTileY; tileY <= toTileY; tileY += 1) for (let tileX = fromTileX; tileX <= toTileX; tileX += 1) {
      const encodedOffset = runtime.tileOffsets[tileY * columns + tileX]
      if (encodedOffset === 0) continue
      const tileLeft = tileX * runtime.tileSize
      const tileTop = tileY * runtime.tileSize
      const tileWidth = Math.min(runtime.tileSize, runtime.width - tileLeft)
      const tileHeight = Math.min(runtime.tileSize, runtime.height - tileTop)
      const copyLeft = Math.max(left, tileLeft)
      const copyTop = Math.max(top, tileTop)
      const copyRight = Math.min(right, tileLeft + tileWidth)
      const copyBottom = Math.min(bottom, tileTop + tileHeight)
      const copyWidth = copyRight - copyLeft
      if (copyWidth <= 0 || copyBottom <= copyTop) continue
      for (let sourceY = copyTop; sourceY < copyBottom; sourceY += 1) {
        const sourceOffset = encodedOffset - 1 + ((sourceY - tileTop) * tileWidth + copyLeft - tileLeft) * 4
        const targetOffset = ((sourceY - y) * outputWidth + copyLeft - x) * 4
        output.set(runtime.data.subarray(sourceOffset, sourceOffset + copyWidth * 4), targetOffset)
      }
    }
    return output
  }

  for (let sourceY = top; sourceY < bottom; sourceY += 1) {
    const sourceOffset = (sourceY * surface.width + left) * 4
    const targetOffset = ((sourceY - y) * outputWidth + left - x) * 4
    output.set(surface.pixels.subarray(sourceOffset, sourceOffset + (right - left) * 4), targetOffset)
  }
  return output
}

export const runtimeTileHasVisiblePixels = (surface: RasterSurface, tileX: number, tileY: number, opaquePaletteIds?: ReadonlySet<number>): boolean | null => {
  const runtime = runtimeRasterForSurface(surface)
  if (!runtime || materializedByRuntime.has(runtime)) return null
  const columns = Math.ceil(runtime.width / runtime.tileSize)
  const rows = Math.ceil(runtime.height / runtime.tileSize)
  if (tileX < 0 || tileY < 0 || tileX >= columns || tileY >= rows) return false
  const tileIndex = tileY * columns + tileX
  const visibilityKey = opaquePaletteIds ?? nonZeroIndexedPixels
  const cachedTiles = runtime.format === 'rgba'
    ? rgbaVisibleTiles.get(runtime)
    : indexedVisibleTiles.get(runtime)?.get(visibilityKey)
  const cached = cachedTiles?.get(tileIndex)
  if (cached !== undefined) return cached
  const encodedOffset = runtime.tileOffsets[tileIndex]
  if (encodedOffset === 0) return false
  const startX = tileX * runtime.tileSize
  const startY = tileY * runtime.tileSize
  const tileWidth = Math.min(runtime.tileSize, runtime.width - startX)
  const tileHeight = Math.min(runtime.tileSize, runtime.height - startY)
  const dataOffset = encodedOffset - 1
  const pixelCount = tileWidth * tileHeight
  if (surface.format === 'rgba') {
    let visible = false
    for (let index = 0; index < pixelCount; index += 1) if (runtime.data[dataOffset + index * 4 + 3] > 0) { visible = true; break }
    const entries = cachedTiles ?? new Map<number, boolean>()
    entries.set(tileIndex, visible)
    rgbaVisibleTiles.set(runtime, entries)
    return visible
  }
  let visible = false
  for (let index = 0; index < pixelCount; index += 1) {
    const offset = dataOffset + index * 4
    const value = (runtime.data[offset] | (runtime.data[offset + 1] << 8) | (runtime.data[offset + 2] << 16) | (runtime.data[offset + 3] << 24)) >>> 0
    if (opaquePaletteIds ? opaquePaletteIds.has(value) : value !== 0) { visible = true; break }
  }
  const byKey = indexedVisibleTiles.get(runtime) ?? new WeakMap<object, Map<number, boolean>>()
  const entries = cachedTiles ?? new Map<number, boolean>()
  entries.set(tileIndex, visible)
  byKey.set(visibilityKey, entries)
  indexedVisibleTiles.set(runtime, byKey)
  return visible
}

export const cachedRuntimeRasterVisibleBounds = (surface: RasterSurface, opaquePaletteIds?: ReadonlySet<number>): RuntimeRasterVisibleBounds | null | undefined => {
  const runtime = runtimeRasterForSurface(surface)
  if (!runtime || materializedByRuntime.has(runtime)) return undefined
  if (runtime.format === 'rgba' && Object.hasOwn(runtime, 'visibleBounds')) return runtime.visibleBounds ?? null
  const visibilityKey = opaquePaletteIds ?? nonZeroIndexedPixels
  if (runtime.format === 'rgba' && rgbaVisibleBounds.has(runtime)) return rgbaVisibleBounds.get(runtime)!
  const indexedBoundsByKey = runtime.format === 'indexed' ? indexedVisibleBounds.get(runtime) : undefined
  if (indexedBoundsByKey?.has(visibilityKey)) return indexedBoundsByKey.get(visibilityKey)!
  return undefined
}

export const runtimeRasterVisibleBounds = (surface: RasterSurface, opaquePaletteIds?: ReadonlySet<number>): RuntimeRasterVisibleBounds | null | undefined => {
  const cached = cachedRuntimeRasterVisibleBounds(surface, opaquePaletteIds)
  if (cached !== undefined) return cached
  const runtime = runtimeRasterForSurface(surface)
  if (!runtime || materializedByRuntime.has(runtime)) return undefined
  const visibilityKey = opaquePaletteIds ?? nonZeroIndexedPixels
  const indexedBoundsByKey = runtime.format === 'indexed' ? indexedVisibleBounds.get(runtime) : undefined
  const columns = Math.ceil(runtime.width / runtime.tileSize)
  let minX = runtime.width
  let minY = runtime.height
  let maxX = -1
  let maxY = -1
  for (let slot = 0; slot < runtime.tileOffsets.length; slot += 1) {
    const encodedOffset = runtime.tileOffsets[slot]
    if (encodedOffset === 0) continue
    const tileX = slot % columns
    const tileY = Math.floor(slot / columns)
    const startX = tileX * runtime.tileSize
    const startY = tileY * runtime.tileSize
    const tileWidth = Math.min(runtime.tileSize, runtime.width - startX)
    const tileHeight = Math.min(runtime.tileSize, runtime.height - startY)
    const dataOffset = encodedOffset - 1
    for (let y = 0; y < tileHeight; y += 1) for (let x = 0; x < tileWidth; x += 1) {
      const offset = dataOffset + (y * tileWidth + x) * 4
      const visible = runtime.format === 'rgba'
        ? runtime.data[offset + 3] > 0
        : opaquePaletteIds
          ? opaquePaletteIds.has((runtime.data[offset] | (runtime.data[offset + 1] << 8) | (runtime.data[offset + 2] << 16) | (runtime.data[offset + 3] << 24)) >>> 0)
          : (runtime.data[offset] | runtime.data[offset + 1] | runtime.data[offset + 2] | runtime.data[offset + 3]) !== 0
      if (!visible) continue
      minX = Math.min(minX, startX + x)
      minY = Math.min(minY, startY + y)
      maxX = Math.max(maxX, startX + x)
      maxY = Math.max(maxY, startY + y)
    }
  }
  const bounds = maxX < minX || maxY < minY ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
  if (runtime.format === 'rgba') {
    runtime.visibleBounds = bounds
    rgbaVisibleBounds.set(runtime, bounds)
  }
  else {
    const byKey = indexedBoundsByKey ?? new WeakMap<object, RuntimeRasterVisibleBounds | null>()
    byKey.set(visibilityKey, bounds)
    indexedVisibleBounds.set(runtime, byKey)
  }
  return bounds
}

export const prepareRuntimeRasterMetadata = (document: SpriteDocument): void => {
  const seen = new Set<RuntimeRasterTiles>()
  const prepare = (surface: RasterSurface): void => {
    const runtime = runtimeRasterForSurface(surface)
    if (!runtime || seen.has(runtime)) return
    seen.add(runtime)
    if (runtime.format === 'rgba') runtimeRasterVisibleBounds(surface)
  }
  for (const layer of document.layers) prepare(layer)
  for (const cel of document.animation?.cels ?? []) if (cel.surface) prepare(cel.surface)
}

export const runtimeRasterResidentBytes = (document: SpriteDocument): number => {
  const identities = new Set<object>()
  let bytes = 0
  const collect = (surface: RasterSurface): void => {
    const runtime = runtimeRasterForSurface(surface)
    if (runtime && !materializedByRuntime.has(runtime)) {
      if (identities.has(runtime)) return
      identities.add(runtime)
      bytes += runtime.data.byteLength + runtime.tileOffsets.byteLength
      return
    }
    const pixels = surface.pixels
    if (identities.has(pixels)) return
    identities.add(pixels)
    bytes += pixels.byteLength
  }
  for (const layer of document.layers) collect(layer)
  for (const cel of document.animation?.cels ?? []) if (cel.surface) collect(cel.surface)
  return bytes
}
