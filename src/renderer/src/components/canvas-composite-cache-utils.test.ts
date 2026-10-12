import { describe, expect, it, vi } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { CompositeSurface } from './canvas-composite-cache-surfaces'
import { createCompositeSurfaceBudget, rememberCompositeSurface, resetCompositeSurfaceBudget } from './canvas-composite-cache-utils'

const surface = (width = 10, height = 10): CompositeSurface => ({
  canvas: { width, height } as OffscreenCanvas,
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

  it('shares one byte budget across full-frame and region caches', () => {
    const full = surface()
    const region = surface()
    const surfaces = new Map([['frame', full]])
    const regions = new Map<string, CompositeSurface>()
    const budget = createCompositeSurfaceBudget()
    rememberCompositeSurface(surfaces, 'frame', full, 600, 10, budget)
    rememberCompositeSurface(regions, 'region', region, 600, 10, budget)
    expect([...surfaces.keys()]).toEqual([])
    expect([...regions.keys()]).toEqual(['region'])
    expect(budget.bytes).toBe(400)
    expect(full.bitmap?.close).toHaveBeenCalledOnce()
  })

  it('keeps a recency refresh from closing the reused bitmap', () => {
    const current = surface()
    const cache = new Map([['frame', current]])
    const budget = createCompositeSurfaceBudget()
    rememberCompositeSurface(cache, 'frame', current, 800, 10, budget)
    expect(current.bitmap?.close).not.toHaveBeenCalled()
  })

  it('accounts for replacement and reset without retaining stale bytes', () => {
    const first = surface(20)
    const replacement = surface(20)
    const cache = new Map<string, CompositeSurface>()
    const budget = createCompositeSurfaceBudget()
    rememberCompositeSurface(cache, 'frame', first, 10_000, 10, budget)
    rememberCompositeSurface(cache, 'frame', replacement, 10_000, 10, budget)
    expect(first.bitmap?.close).toHaveBeenCalledOnce()
    expect(budget.bytes).toBe(20 * 10 * 4)
    expect(budget.entries.size).toBe(1)
    resetCompositeSurfaceBudget(budget)
    expect(budget.bytes).toBe(0)
    expect(budget.entries.size).toBe(0)
    expect(budget.cacheTotals.size).toBe(0)
  })

  it('measures one 64 MiB budget across 2048px multi-frame surfaces and regions', () => {
    const maxCacheBytes = 64 * 1024 * 1024
    const fullFrames = new Map<string, CompositeSurface>()
    const regions = new Map<string, CompositeSurface>()
    const budget = createCompositeSurfaceBudget()
    for (let index = 0; index < 4; index += 1) {
      rememberCompositeSurface(fullFrames, `frame-${index}`, surface(2048, 2048), maxCacheBytes, 12, budget)
    }
    for (let index = 0; index < 4; index += 1) {
      rememberCompositeSurface(regions, `region-${index}`, surface(1024, 1024), maxCacheBytes, 12, budget)
    }
    const separateUpperBound = 4 * 2048 * 2048 * 4 + 4 * 1024 * 1024 * 4
    const evidence = {
      scenario: { canvas: '4096x4096', layers: 100, frames: 8, fullSurface: '2048x2048 RGBA', regionSurface: '1024x1024 RGBA' },
      separateUpperBoundBytes: separateUpperBound,
      sharedBudgetBytes: budget.bytes,
      sharedEntryCount: budget.entries.size,
      reductionRatio: 1 - budget.bytes / separateUpperBound
    }
    mkdirSync(resolve('output'), { recursive: true })
    writeFileSync(resolve('output/composite-surface-budget-after-20261006.json'), `${JSON.stringify(evidence, null, 2)}\n`)
    expect(budget.bytes).toBeLessThanOrEqual(maxCacheBytes)
    expect(budget.bytes).toBeLessThan(separateUpperBound)
  })
})
