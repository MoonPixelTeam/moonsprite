import { describe, expect, it } from 'vitest'
import type { AnimationCelSurface } from '@shared/types-animation'
import type { RgbaLayer } from '@shared/types-layer'
import type { RuntimeRasterTiles } from '@shared/types-raster'
import { compositeRegion, createDocument, markLayerContentChanged } from './document'
import {
  assignRasterStorage,
  cachedRuntimeRasterVisibleBounds,
  installRuntimeRaster,
  prepareRuntimeRasterMetadata,
  prepareRuntimeRasterDocumentForTransfer,
  rasterStorageIdentity,
  readSurfacePackedLocal,
  readSurfacePackedRegion,
  readSurfaceRgbaRegion,
  rehydrateRuntimeRasterDocument,
  runtimeRasterForSurface,
  runtimeRasterResidentBytes,
  runtimeRasterVisibleBounds,
  surfacePixelsMaterialized,
  visitSurfaceRasterRows
} from './runtime-raster'

const rgbaRuntime = (): RuntimeRasterTiles => ({
  kind: 'sparse-tiles-v1',
  format: 'rgba',
  width: 4,
  height: 4,
  tileSize: 2,
  data: new Uint8Array([
    1, 2, 3, 4, 5, 6, 7, 8,
    9, 10, 11, 12, 13, 14, 15, 16
  ]),
  tileOffsets: new Int32Array([1, 0, 0, 0])
})

const rgbaLayer = (): RgbaLayer => ({
  id: 'layer-runtime', name: 'runtime', description: '', visible: true, locked: false,
  opacity: 1, blendMode: 'normal', width: 4, height: 4, offsetX: 0, offsetY: 0,
  format: 'rgba', pixels: new Uint8ClampedArray(4)
})

describe('runtime sparse raster', () => {
  it('reads present and absent tiles without materializing the full surface', () => {
    const layer = rgbaLayer()
    installRuntimeRaster(layer, rgbaRuntime())

    expect(surfacePixelsMaterialized(layer)).toBe(false)
    expect(readSurfacePackedLocal(layer, 0, 0)).toBe(0x04030201)
    expect(readSurfacePackedLocal(layer, 1, 1)).toBe(0x100f0e0d)
    expect(readSurfacePackedLocal(layer, 3, 0)).toBe(0)
    expect(surfacePixelsMaterialized(layer)).toBe(false)
  })



  it('copies a clipped RGBA region directly from sparse tile bytes', () => {
    const layer = rgbaLayer()
    installRuntimeRaster(layer, rgbaRuntime())

    expect(Array.from(readSurfaceRgbaRegion(layer, -1, 0, 4, 2))).toEqual([
      0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 0, 0, 0, 0,
      0, 0, 0, 0, 9, 10, 11, 12, 13, 14, 15, 16, 0, 0, 0, 0
    ])
    expect(surfacePixelsMaterialized(layer)).toBe(false)
  })

  it('shares runtime storage and materializes only when pixels are requested', () => {
    const layer = rgbaLayer()
    installRuntimeRaster(layer, rgbaRuntime())
    const surface: AnimationCelSurface = { format: 'rgba', width: 4, height: 4, offsetX: 0, offsetY: 0, pixels: new Uint8ClampedArray(4) }
    assignRasterStorage(surface, layer)

    expect(rasterStorageIdentity(surface)).toBe(rasterStorageIdentity(layer))
    expect(surfacePixelsMaterialized(surface)).toBe(false)
    expect(layer.pixels).toHaveLength(64)
    expect(surfacePixelsMaterialized(layer)).toBe(true)
    layer.pixels[0] = 99
    expect(surface.pixels).toBe(layer.pixels)
    expect(readSurfacePackedLocal(surface, 0, 0) & 0xff).toBe(99)
  })

  it('preserves lazy storage through worker transfer preparation and rehydration', () => {
    const document = createDocument('runtime transfer', 4, 4, 'rgba')
    const layer = document.layers[0] as RgbaLayer
    installRuntimeRaster(layer, rgbaRuntime())
    const cel = document.animation!.cels[0]
    cel.surface = { format: 'rgba', width: 4, height: 4, offsetX: 0, offsetY: 0, pixels: new Uint8ClampedArray(4) }
    assignRasterStorage(cel.surface, layer)

    prepareRuntimeRasterDocumentForTransfer(document)
    expect(layer.pixels).toHaveLength(4)
    rehydrateRuntimeRasterDocument(document)

    expect(surfacePixelsMaterialized(layer)).toBe(false)
    expect(runtimeRasterForSurface(cel.surface)).toBe(runtimeRasterForSurface(layer))
    expect(readSurfacePackedLocal(layer, 1, 0)).toBe(0x08070605)
  })



  it('detaches runtime storage when a layer becomes editable', () => {
    const layer = rgbaLayer()
    installRuntimeRaster(layer, rgbaRuntime())
    markLayerContentChanged(layer)

    expect(runtimeRasterForSurface(layer)).toBeNull()
    expect(layer.pixels).toHaveLength(64)
  })



  it('composites sparse RGBA pixels without materializing the source layer', () => {
    const document = createDocument('runtime composite', 4, 4, 'rgba')
    const layer = document.layers[0] as RgbaLayer
    installRuntimeRaster(layer, rgbaRuntime())
    installRuntimeRaster(document.animation!.cels[0].surface!, runtimeRasterForSurface(layer)!)

    expect(Array.from(compositeRegion(document, 0, 0, 4, 1))).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 0, 0, 0, 0, 0, 0, 0, 0
    ])
    expect(surfacePixelsMaterialized(layer)).toBe(false)
  })
})


describe('native raster row traversal', () => {
  it('clips sparse rows and skips absent tiles without materializing storage', () => {
    const layer = rgbaLayer()
    const runtime = rgbaRuntime()
    const unaligned = new Uint8Array(runtime.data.length + 1)
    unaligned.set(runtime.data, 1)
    runtime.data = unaligned.subarray(1)
    installRuntimeRaster(layer, runtime)
    const samples: number[][] = []
    visitSurfaceRasterRows(layer, 1, -2, 10, 10, (data, offset, count, x, y, packedBytes) => {
      expect(packedBytes).toBe(true)
      samples.push([x, y, count, ...data.subarray(offset, offset + count * 4)])
    })
    expect(samples).toEqual([[1, 0, 1, 5, 6, 7, 8], [1, 1, 1, 13, 14, 15, 16]])
    expect(surfacePixelsMaterialized(layer)).toBe(false)
  })

  it('visits dense indexed IDs directly and clips ranges outside the surface', () => {
    const layer = createDocument('indexed rows', 4, 4, 'indexed').layers[0]
    layer.pixels[5] = 500
    const rows: number[][] = []
    visitSurfaceRasterRows(layer, 1, 1, 5, 1, (data, offset, count, x, y, packedBytes) => {
      expect(packedBytes).toBe(false)
      rows.push([x, y, ...data.subarray(offset, offset + count)])
    })
    expect(rows).toEqual([[1, 1, 500, 0, 0]])
    visitSurfaceRasterRows(layer, 10, 10, 1, 1, () => { throw new Error('Outside rows must not be visited') })
  })
})
