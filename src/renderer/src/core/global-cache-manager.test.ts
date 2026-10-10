import { afterEach, expect, it, vi } from 'vitest'
import { GlobalCacheManager, globalCacheManager, installGlobalCachePressureMonitor } from './global-cache-manager'

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

it('trims a skewed provider distribution to the target with linear snapshot calls', () => {
  const manager = new GlobalCacheManager(100, 200)
  const sizes = [180, 0, 0, 0, 0, 0, 0, 0]
  let snapshots = 0
  const retain = sizes.map((_, index) => manager.register({
    name: String(index), snapshot: () => { snapshots++; return { name: String(index), cachedBytes: sizes[index], itemCount: 1 } },
    trim: bytes => { const freed = Math.min(bytes, sizes[index]); sizes[index] -= freed; return freed }
  }))
  expect(manager.handleMemoryPressure()).toBe(95)
  expect(sizes.reduce((a, b) => a + b, 0)).toBe(85)
  expect(snapshots).toBe(17)
  retain.forEach(unregister => unregister())
})

it('measures actual release and proceeds to other providers when one cannot trim', () => {
  const manager = new GlobalCacheManager()
  const stuck = { name: 'pinned', snapshot: () => ({ name: 'pinned', cachedBytes: 100, itemCount: 1 }), trim: () => 100 }
  let bytes = 50
  const free = { name: 'free', snapshot: () => ({ name: 'free', cachedBytes: bytes, itemCount: 1 }), trim: () => { bytes = 0; return 0 } }
  const off = [manager.register(stuck), manager.register(free)]
  expect(manager.trimToTarget(100)).toBe(50)
  expect(manager.totalBytes()).toBe(100)
  off.forEach(unregister => unregister())
})

it('runs the production pressure valve at low frequency and cleans up its timer', () => {
  vi.useFakeTimers()
  const handle = vi.spyOn(globalCacheManager, 'handleMemoryPressure').mockReturnValue(0)
  const stop = installGlobalCachePressureMonitor()
  vi.advanceTimersByTime(29_999)
  expect(handle).not.toHaveBeenCalled()
  vi.advanceTimersByTime(1)
  expect(handle).toHaveBeenCalledOnce()
  stop(); stop()
  vi.advanceTimersByTime(60_000)
  expect(handle).toHaveBeenCalledOnce()
})

it('the production timer actually trims registered caches when pressure rises', () => {
  vi.useFakeTimers()
  let bytes = 300 * 1024 * 1024
  const unregister = globalCacheManager.register({
    name: 'pressure fixture', snapshot: () => ({ name: 'pressure fixture', cachedBytes: bytes, itemCount: 1 }),
    trim: target => { bytes -= target; return target }
  })
  const stop = installGlobalCachePressureMonitor()
  try {
    vi.advanceTimersByTime(30_000)
    expect(bytes).toBeCloseTo(256 * 1024 * 1024 * 0.85)
  } finally { stop(); unregister() }
})
