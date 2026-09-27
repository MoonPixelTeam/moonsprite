import { describe, expect, it } from 'vitest'
import type { AnimationCelSurface } from '@shared/types-animation'
import { cloneDocumentForAnimationFrame, layerFromAnimationCel } from './animation'
import { createDocument, createLayer, getLayerStorageOrigin, setLayerStorageOrigin } from './document-model'
import { shareRasterLayer } from './layer-preview'
import { compositeAnimationFrame } from './onion-skin'
import { animationTweenCompositePreview, animationTweenSource, DEFAULT_ANIMATION_TWEEN } from './animation-tween'
import { assignRasterStorage, installRuntimeRaster, rasterStorageIdentity, readSurfacePackedLocal, surfacePixelsMaterialized } from './runtime-raster'

describe('animation preview raster ownership', () => {
  it('composites the selected layer without expanding other sparse layers', () => {
    const document = createDocument('selected sparse layer', 2, 1, 'rgba')
    const layer = document.layers[0]
    const surface = document.animation!.cels[0].surface!
    installRuntimeRaster(surface, { kind: 'sparse-tiles-v1', format: 'rgba', width: 2, height: 1, tileSize: 64, data: new Uint8Array([10, 20, 30, 255, 0, 0, 0, 0]), tileOffsets: new Int32Array([1]) })
    assignRasterStorage(layer, surface)
    setLayerStorageOrigin(layer, { x: -3, y: 4 })
    const shared = shareRasterLayer(layer)
    expect(getLayerStorageOrigin(shared)).toEqual({ x: -3, y: 4 })
    setLayerStorageOrigin(shared, { x: 2, y: 1 })
    expect(getLayerStorageOrigin(layer)).toEqual({ x: -3, y: 4 })
    expect(Array.from(compositeAnimationFrame(document, document.animation!.activeFrameId, layer.id))).toEqual([10, 20, 30, 255, 0, 0, 0, 0])
    expect(surfacePixelsMaterialized(surface)).toBe(false)
    expect(surfacePixelsMaterialized(layer)).toBe(false)
  })

  it('keeps a layer without an endpoint cel sparse during tween previews', () => {
    const document = createDocument('missing cel', 2, 1, 'rgba')
    const layer = document.layers[0]
    layer.pixels.set([10, 20, 30, 255])
    const options = { ...DEFAULT_ANIMATION_TWEEN, layerScope: 'current' as const }
    const source = animationTweenSource(document, document.animation!.activeFrameId, layer.id, options)
    document.animation!.frames.push({ id: 'other-active', duration: 100 })
    document.animation!.activeFrameId = 'other-active'
    const missing = createLayer('missing cel', 2, 1, 'rgba')
    installRuntimeRaster(missing, { kind: 'sparse-tiles-v1', format: 'rgba', width: 2, height: 1, tileSize: 64, data: new Uint8Array([255, 0, 0, 255, 0, 0, 0, 0]), tileOffsets: new Int32Array([1]) })
    document.layers.push(missing)
    const preview = animationTweenCompositePreview(document, source, options, 0, { x: 0, y: 0, width: 2, height: 1 })
    expect(Array.from(preview.pixels)).toEqual([10, 20, 30, 255, 0, 0, 0, 0])
    expect(surfacePixelsMaterialized(missing)).toBe(false)
    expect(missing.visible).toBe(true)
  })

  it.each(['rgba', 'indexed'] as const)('projects a %s cel without reading the current layer pixels', format => {
    const document = createDocument('sparse preview', 1024, 1024, format)
    const layer = document.layers[0]
    const offsets = new Int32Array(16 * 16)
    offsets[0] = 1
    const data = new Uint8Array(64 * 64 * 4)
    data.set([7, 0, 0, format === 'rgba' ? 255 : 0])
    installRuntimeRaster(layer, { kind: 'sparse-tiles-v1', format, width: 1024, height: 1024, tileSize: 64, data, tileOffsets: offsets })
    const storage = rasterStorageIdentity(layer)
    const surface: AnimationCelSurface = format === 'rgba'
      ? { format, width: 1, height: 1, offsetX: 3, offsetY: 5, pixels: new Uint8ClampedArray([9, 8, 7, 255]) }
      : { format, width: 1, height: 1, offsetX: 3, offsetY: 5, pixels: new Uint32Array([9]) }
    surface.storageOriginX = 2
    surface.storageOriginY = 4
    const projected = layerFromAnimationCel(layer, { id: 'other', layerId: layer.id, frameId: 'other', opacity: 0.5, surface })!
    expect(surfacePixelsMaterialized(layer)).toBe(false)
    expect(rasterStorageIdentity(layer)).toBe(storage)
    expect(projected.runtimeRaster).toBeUndefined()
    expect(projected.pixels).toBe(surface.pixels)
    expect(readSurfacePackedLocal(projected, 0, 0)).toBe(format === 'rgba' ? 0xff070809 : 9)
    expect(projected).toMatchObject({ width: 1, height: 1, offsetX: 3, offsetY: 5, opacity: 0.5 })
    expect(getLayerStorageOrigin(projected)).toEqual({ x: 2, y: 4 })
    projected.visible = false
    expect(layer.visible).toBe(true)
  })

  it.each(['rgba', 'indexed'] as const)('shares sparse %s storage without sharing the pixels setter', format => {
    const document = createDocument('shared preview', 1024, 1024, format)
    const layer = document.layers[0]
    const surface = document.animation!.cels[0].surface!
    const offsets = new Int32Array(16 * 16)
    offsets[0] = 1
    const data = new Uint8Array(64 * 64 * 4)
    data.set([11, 0, 0, format === 'rgba' ? 255 : 0])
    installRuntimeRaster(surface, { kind: 'sparse-tiles-v1', format, width: 1024, height: 1024, tileSize: 64, data, tileOffsets: offsets })
    assignRasterStorage(layer, surface)
    const projected = layerFromAnimationCel(layer, document.animation!.cels[0])!
    expect(surfacePixelsMaterialized(layer)).toBe(false)
    expect(surfacePixelsMaterialized(surface)).toBe(false)
    expect(rasterStorageIdentity(projected)).toBe(rasterStorageIdentity(surface))
    projected.pixels = format === 'rgba' ? new Uint8ClampedArray(4) : new Uint32Array(1)
    expect(surfacePixelsMaterialized(layer)).toBe(false)
    expect(readSurfacePackedLocal(surface, 0, 0)).toBe(format === 'rgba' ? 0xff00000b : 11)
  })

  it('clones an animation preview without expanding the original sparse document', () => {
    const document = createDocument('frame clone', 1024, 1024, 'rgba')
    const layer = document.layers[0]
    const surface = document.animation!.cels[0].surface!
    const offsets = new Int32Array(16 * 16)
    offsets[0] = 1
    const data = new Uint8Array(64 * 64 * 4)
    data.set([10, 20, 30, 255])
    installRuntimeRaster(surface, { kind: 'sparse-tiles-v1', format: 'rgba', width: 1024, height: 1024, tileSize: 64, data, tileOffsets: offsets })
    assignRasterStorage(layer, surface)
    setLayerStorageOrigin(layer, { x: 0, y: 0 })
    const preview = cloneDocumentForAnimationFrame(document, document.animation!.activeFrameId)
    expect(surfacePixelsMaterialized(layer)).toBe(false)
    expect(surfacePixelsMaterialized(surface)).toBe(false)
    expect(surfacePixelsMaterialized(preview.layers[0])).toBe(false)
    expect(readSurfacePackedLocal(preview.layers[0], 0, 0)).toBe(0xff1e140a)
    expect(preview.layers[0] === layer).toBe(false)
  })
})
