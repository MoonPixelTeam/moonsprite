import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AnimationCelSurface } from '@shared/types-animation'
import { createDocument, createLayer, createLayerMask, writeLayerColor } from './document-model'
import { syncActiveAnimationFrame } from './animation'
import { animationTweenSource, DEFAULT_ANIMATION_TWEEN, prepareAnimationTweenFrame } from './animation-tween'

afterEach(() => vi.unstubAllGlobals())

describe('tween output allocation budget', () => {
  it.each(['frame', 'crossfade', 'morph', 'mask'] as const)('checks the %s output budget before allocating its pixels', mode => {
    const document = createDocument('budget', 2, 2, 'rgba', false)
    const layer = document.layers[0]
    writeLayerColor(document, layer, 0, { r: 255, g: 0, b: 0, a: 255 })
    syncActiveAnimationFrame(document)
    const first = document.animation!.activeFrameId
    if (mode === 'crossfade' || mode === 'morph' || mode === 'mask') {
      document.animation!.frames.push({ id: 'last', duration: 100 })
      const surface: AnimationCelSurface = { format: 'rgba', width: 1, height: 1, offsetX: 0, offsetY: 0, pixels: new Uint8ClampedArray([0, 0, 255, 255]) }
      document.animation!.cels.push({ id: 'last-cel', frameId: 'last', layerId: layer.id, surface })
    }
    if (mode === 'mask') {
      const mask = createLayerMask(layer.id, 1, 1)
      mask.pixels.set([255, 255, 255, 255])
      document.animation!.layerMasks = [{ layerId: layer.id, frameId: first, mask }]
    }
    const options = { ...DEFAULT_ANIMATION_TWEEN, frameCount: 1,
      scope: mode === 'frame' ? 'frame' as const : 'between' as const,
      betweenMode: mode === 'morph' ? 'morph' as const : 'crossfade' as const }
    const source = animationTweenSource(document, first, layer.id, options)
    const outputAllocations: number[] = []
    let accepted = 0
    // The translated frame has a 1x1 crop scratch; ignore that one allocation.
    let skipCrop = mode === 'frame'
    for (const name of ['Uint32Array', 'Uint8ClampedArray'] as const) {
      vi.stubGlobal(name, new Proxy(globalThis[name], {
        construct(target, args) {
          if (typeof args[0] === 'number') {
            if (skipCrop) skipCrop = false
            else outputAllocations.push(args[0])
          }
          return Reflect.construct(target, args)
        }
      }))
    }
    const consume = () => {
      if (mode === 'mask' && accepted++ === 0) return
      throw new Error('budget exhausted')
    }
    expect(() => prepareAnimationTweenFrame(document, source, options, 1, consume)).toThrow('budget exhausted')
    expect(outputAllocations.length).toBe(mode === 'mask' ? 1 : 0)
    expect(document.animation!.frames.length).toBe(mode === 'frame' ? 1 : 2)
  })

  it('does not allocate the next layer after the shared batch budget runs out', () => {
    const document = createDocument('shared budget', 1, 1, 'rgba', false)
    document.layers.push(createLayer('second', 1, 1, 'rgba'))
    for (const layer of document.layers) writeLayerColor(document, layer, 0, { r: 255, g: 0, b: 0, a: 255 })
    syncActiveAnimationFrame(document)
    const options = { ...DEFAULT_ANIMATION_TWEEN, scope: 'frame' as const, layerScope: 'all' as const, frameCount: 1 }
    const source = animationTweenSource(document, document.animation!.activeFrameId, document.layers[0].id, options)
    let remaining = 4
    let allocations = 0
    vi.stubGlobal('Uint32Array', new Proxy(Uint32Array, {
      construct(target, args) { allocations++; return Reflect.construct(target, args) }
    }))
    expect(() => prepareAnimationTweenFrame(document, source, options, 1, bytes => {
      if (bytes > remaining) throw new Error('budget exhausted')
      remaining -= bytes
    })).toThrow('budget exhausted')
    // Two temporary crops plus the first accepted output, no second output.
    expect(allocations).toBe(3)
  })
})
