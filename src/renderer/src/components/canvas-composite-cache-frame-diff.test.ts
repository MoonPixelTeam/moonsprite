import { describe, it, expect } from 'vitest'
import { computeFrameDiff, invalidateFrameDiffCache } from './canvas-composite-cache-frame-diff'
import type { SpriteDocument } from '@shared/types-document'

describe('Frame differential caching', () => {
  it('detects no changes between identical frames', () => {
    const document: SpriteDocument = {
      id: 'test-doc',
      width: 128,
      height: 128,
      layers: [
        { id: 'layer1', name: 'Layer 1', kind: 'raster', format: 'rgba', width: 128, height: 128, offsetX: 0, offsetY: 0, pixels: new Uint32Array(128 * 128), opacity: 1, blendMode: 'normal', visible: true }
      ],
      animation: {
        frames: [
          {
            id: 'frame1',
            duration: 100
          },
          {
            id: 'frame2',
            duration: 100
          }
        ],
        cels: [
          { id: 'cel1', layerId: 'layer1', frameId: 'frame1', surface: { format: 'rgba', width: 128, height: 128, offsetX: 0, offsetY: 0, pixels: new Uint32Array(128 * 128) } },
          { id: 'cel1', layerId: 'layer1', frameId: 'frame2', surface: { format: 'rgba', width: 128, height: 128, offsetX: 0, offsetY: 0, pixels: new Uint32Array(128 * 128) } }
        ],
        activeFrameId: 'frame1',
        loop: true
      },
      groups: [],
      palette: []
    } as any

    const diff = computeFrameDiff(document, 'frame1', 'frame2')

    expect(diff.changedLayerIds.size).toBe(0)
    expect(diff.dirtyRects.length).toBe(0)
  })

  it('detects changed cel between frames', () => {
    const document: SpriteDocument = {
      id: 'test-doc',
      width: 128,
      height: 128,
      layers: [
        { id: 'layer1', name: 'Layer 1', kind: 'raster', format: 'rgba', width: 128, height: 128, offsetX: 0, offsetY: 0, pixels: new Uint32Array(128 * 128), opacity: 1, blendMode: 'normal', visible: true }
      ],
      animation: {
        frames: [
          {
            id: 'frame1',
            duration: 100
          },
          {
            id: 'frame2',
            duration: 100
          }
        ],
        cels: [
          { id: 'cel1', layerId: 'layer1', frameId: 'frame1', surface: { format: 'rgba', width: 64, height: 64, offsetX: 0, offsetY: 0, pixels: new Uint32Array(64 * 64) } },
          { id: 'cel2', layerId: 'layer1', frameId: 'frame2', surface: { format: 'rgba', width: 64, height: 64, offsetX: 32, offsetY: 32, pixels: new Uint32Array(64 * 64) } }
        ],
        activeFrameId: 'frame1',
        loop: true
      },
      groups: [],
      palette: []
    } as any

    const diff = computeFrameDiff(document, 'frame1', 'frame2')

    expect(diff.changedLayerIds.size).toBe(1)
    expect(diff.changedLayerIds.has('layer1')).toBe(true)
    expect(diff.dirtyRects.length).toBeGreaterThan(0)
  })

  it('merges overlapping dirty rects', () => {
    const document: SpriteDocument = {
      id: 'test-doc',
      width: 256,
      height: 256,
      layers: [
        { id: 'layer1', name: 'Layer 1', kind: 'raster', format: 'rgba', width: 256, height: 256, offsetX: 0, offsetY: 0, pixels: new Uint32Array(256 * 256), opacity: 1, blendMode: 'normal', visible: true },
        { id: 'layer2', name: 'Layer 2', kind: 'raster', format: 'rgba', width: 256, height: 256, offsetX: 0, offsetY: 0, pixels: new Uint32Array(256 * 256), opacity: 1, blendMode: 'normal', visible: true }
      ],
      animation: {
        frames: [
          {
            id: 'frame1',
            duration: 100
          },
          {
            id: 'frame2',
            duration: 100
          }
        ],
        cels: [
          { id: 'cel1', layerId: 'layer1', frameId: 'frame1', surface: { format: 'rgba', width: 64, height: 64, offsetX: 0, offsetY: 0, pixels: new Uint32Array(64 * 64) } },
          { id: 'cel2', layerId: 'layer1', frameId: 'frame2', surface: { format: 'rgba', width: 64, height: 64, offsetX: 0, offsetY: 0, pixels: new Uint32Array(64 * 64) } },
          { id: 'cel3', layerId: 'layer2', frameId: 'frame1', surface: { format: 'rgba', width: 64, height: 64, offsetX: 32, offsetY: 32, pixels: new Uint32Array(64 * 64) } },
          { id: 'cel4', layerId: 'layer2', frameId: 'frame2', surface: { format: 'rgba', width: 64, height: 64, offsetX: 32, offsetY: 32, pixels: new Uint32Array(64 * 64) } }
        ],
        activeFrameId: 'frame1',
        loop: true
      },
      groups: [],
      palette: []
    } as any

    const diff = computeFrameDiff(document, 'frame1', 'frame2')

    expect(diff.changedLayerIds.size).toBe(2)
    // Should merge overlapping rects into fewer regions
    expect(diff.dirtyRects.length).toBeLessThanOrEqual(2)
  })

  it('caches computed diffs', () => {
    const document: SpriteDocument = {
      id: 'test-doc',
      width: 128,
      height: 128,
      layers: [
        { id: 'layer1', name: 'Layer 1', kind: 'raster', format: 'rgba', width: 128, height: 128, offsetX: 0, offsetY: 0, pixels: new Uint32Array(128 * 128), opacity: 1, blendMode: 'normal', visible: true }
      ],
      animation: {
        frames: [
          {
            id: 'frame1',
            duration: 100
          },
          {
            id: 'frame2',
            duration: 100
          }
        ],
        cels: [
          { id: 'cel1', layerId: 'layer1', frameId: 'frame1', surface: { format: 'rgba', width: 128, height: 128, offsetX: 0, offsetY: 0, pixels: new Uint32Array(128 * 128) } },
          { id: 'cel2', layerId: 'layer1', frameId: 'frame2', surface: { format: 'rgba', width: 128, height: 128, offsetX: 0, offsetY: 0, pixels: new Uint32Array(128 * 128) } }
        ],
        activeFrameId: 'frame1',
        loop: true
      },
      groups: [],
      palette: []
    } as any

    const diff1 = computeFrameDiff(document, 'frame1', 'frame2')
    const diff2 = computeFrameDiff(document, 'frame1', 'frame2')

    // Should return the same cached object
    expect(diff1).toBe(diff2)
  })

  it('invalidates cache when requested', () => {
    const document: SpriteDocument = {
      id: 'test-doc',
      width: 128,
      height: 128,
      layers: [
        { id: 'layer1', name: 'Layer 1', kind: 'raster', format: 'rgba', width: 128, height: 128, offsetX: 0, offsetY: 0, pixels: new Uint32Array(128 * 128), opacity: 1, blendMode: 'normal', visible: true }
      ],
      animation: {
        frames: [
          {
            id: 'frame1',
            duration: 100
          },
          {
            id: 'frame2',
            duration: 100
          }
        ],
        cels: [
          { id: 'cel1', layerId: 'layer1', frameId: 'frame1', surface: { format: 'rgba', width: 128, height: 128, offsetX: 0, offsetY: 0, pixels: new Uint32Array(128 * 128) } },
          { id: 'cel2', layerId: 'layer1', frameId: 'frame2', surface: { format: 'rgba', width: 128, height: 128, offsetX: 0, offsetY: 0, pixels: new Uint32Array(128 * 128) } }
        ],
        activeFrameId: 'frame1',
        loop: true
      },
      groups: [],
      palette: []
    } as any

    const diff1 = computeFrameDiff(document, 'frame1', 'frame2')
    invalidateFrameDiffCache(document)
    const diff2 = computeFrameDiff(document, 'frame1', 'frame2')

    // Should compute a new diff object after invalidation
    expect(diff1).not.toBe(diff2)
    // But content should be the same
    expect(diff1.changedLayerIds.size).toBe(diff2.changedLayerIds.size)
  })
})
