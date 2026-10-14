import { describe, expect, it, vi } from 'vitest'
import type { CompositeSurface } from './canvas-composite-cache-surfaces'
import { createCompositeSurfaceBudget, rememberCompositeSurface, resetCompositeSurfaceBudget } from './canvas-composite-cache-utils'

const surface = (reserveBitmapBytes = false): CompositeSurface => ({
  canvas: { width: 2048, height: 2048 } as OffscreenCanvas,
  reserveBitmapBytes,
  revision: 1,
})

describe('canvas and bitmap reservations', () => {
  it('reserves the pending bitmap and evicts full frames and windows under one budget', () => {
    const limit = 64 * 1024 * 1024, budget = createCompositeSurfaceBudget()
    const frames = new Map<string, CompositeSurface>(), regions = new Map<string, CompositeSurface>()
    const first = surface(true), second = surface(true), region = surface()
    first.bitmap = { close: vi.fn() } as unknown as ImageBitmap
    second.bitmapPending = Promise.resolve()
    rememberCompositeSurface(frames, 'first', first, limit, 256, budget)
    rememberCompositeSurface(frames, 'second', second, limit, 256, budget)
    expect(budget.bytes).toBe(limit)
    rememberCompositeSurface(regions, 'window', region, limit, 256, budget)
    expect(frames.has('first')).toBe(false)
    expect(frames.has('second')).toBe(true)
    expect(first.bitmap.close).toHaveBeenCalledOnce()
    expect(budget.bytes).toBe(48 * 1024 * 1024)
    expect(budget.entries.size).toBe(2)
    expect(first.bitmapGeneration).toBe(1)
  })

  it('keeps the reservation stable through bitmap completion and cache refresh', () => {
    const limit = 64 * 1024 * 1024, budget = createCompositeSurfaceBudget()
    const frames = new Map<string, CompositeSurface>(), current = surface(true)
    rememberCompositeSurface(frames, 'frame', current, limit, 256, budget)
    current.bitmap = { close: vi.fn() } as unknown as ImageBitmap
    rememberCompositeSurface(frames, 'frame', current, limit, 256, budget)
    expect(budget.bytes).toBe(32 * 1024 * 1024)
    expect(current.bitmap.close).not.toHaveBeenCalled()
    frames.clear(); resetCompositeSurfaceBudget(budget)
    expect(budget.bytes).toBe(0)
    expect(budget.entries.size).toBe(0)
  })
})
