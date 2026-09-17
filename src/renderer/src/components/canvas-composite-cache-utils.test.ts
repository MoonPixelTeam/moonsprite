import { describe, expect, it, vi } from 'vitest'
import type { CompositeSurface } from './canvas-composite-cache-surfaces'
import { rememberCompositeSurface } from './canvas-composite-cache-utils'

const surface = (width = 10): CompositeSurface => ({
  canvas: { width, height: 10 } as OffscreenCanvas,
  bitmap: { close: vi.fn() } as unknown as ImageBitmap,
  revision: 0
})

describe('composite surface eviction', () => {
  it('stops evicting once the remaining surfaces fit the byte budget', () => {
    const first = surface()
    const second = surface()
    const third = surface()
    const cache = new Map([['first', first], ['second', second]])
    rememberCompositeSurface(cache, 'third', third, 800, 10)
    expect([...cache.keys()]).toEqual(['second', 'third'])
    expect(first.bitmap?.close).toHaveBeenCalledOnce()
    expect(second.bitmap?.close).not.toHaveBeenCalled()
    expect(third.bitmap?.close).not.toHaveBeenCalled()
  })

  it('refreshes recency and enforces the frame limit', () => {
    const first = surface()
    const second = surface()
    const cache = new Map([['first', first], ['second', second]])
    rememberCompositeSurface(cache, 'first', first, 10000, 2)
    rememberCompositeSurface(cache, 'third', surface(), 10000, 2)
    expect([...cache.keys()]).toEqual(['first', 'third'])
    expect(second.bitmap?.close).toHaveBeenCalledOnce()
    expect(first.bitmap?.close).not.toHaveBeenCalled()
  })

  it('retains the latest surface even when it alone exceeds the budget', () => {
    const latest = surface(100)
    const cache = new Map([['first', surface()]])
    rememberCompositeSurface(cache, 'latest', latest, 800, 10)
    expect([...cache.values()]).toEqual([latest])
    expect(latest.bitmap?.close).not.toHaveBeenCalled()
  })
})
