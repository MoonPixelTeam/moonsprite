import type { CompositeSurface } from './canvas-composite-cache-surfaces'

const cacheByteTotals = new WeakMap<Map<string, CompositeSurface>, number>()

export interface CompositeSurfaceBudget {
  entries: Map<CompositeSurface, { cache: Map<string, CompositeSurface>; key: string; bytes: number }>
  cacheTotals: Map<Map<string, CompositeSurface>, number>
  bytes: number
}
export const createCompositeSurfaceBudget = (): CompositeSurfaceBudget => ({ entries: new Map(), cacheTotals: new Map(), bytes: 0 })

/** Clear cross-cache bookkeeping after the owning CanvasCompositeCache drops both maps. */
export const resetCompositeSurfaceBudget = (budget: CompositeSurfaceBudget): void => {
  budget.entries.clear()
  budget.cacheTotals.clear()
  budget.bytes = 0
}

const surfaceBytes = (surface: CompositeSurface): number => surface.canvas.width * surface.canvas.height * 4 * (surface.reserveBitmapBytes ? 2 : 1)

const cacheBytes = (cache: Map<string, CompositeSurface>): number => {
  const known = cacheByteTotals.get(cache)
  if (known !== undefined) return known
  const total = [...cache.values()].reduce((sum, entry) => sum + surfaceBytes(entry), 0)
  cacheByteTotals.set(cache, total)
  return total
}

const closeSurfaceBitmap = (surface: CompositeSurface): void => {
  surface.bitmap?.close()
  surface.bitmapGeneration = (surface.bitmapGeneration ?? 0) + 1
}

const removeBudgetEntry = (budget: CompositeSurfaceBudget, surface: CompositeSurface, closeBitmap = true): void => {
  const entry = budget.entries.get(surface)
  if (!entry) return
  budget.entries.delete(surface)
  budget.bytes -= entry.bytes
  const total = (budget.cacheTotals.get(entry.cache) ?? entry.bytes) - entry.bytes
  budget.cacheTotals.set(entry.cache, total)
  cacheByteTotals.set(entry.cache, total)
  if (closeBitmap) closeSurfaceBitmap(surface)
}

const registerBudgetCache = (budget: CompositeSurfaceBudget, cache: Map<string, CompositeSurface>): void => {
  if (budget.cacheTotals.has(cache)) return
  let total = 0
  for (const [key, surface] of cache) {
    const bytes = surfaceBytes(surface)
    budget.entries.set(surface, { cache, key, bytes })
    total += bytes
  }
  budget.cacheTotals.set(cache, total)
  budget.bytes += total
  cacheByteTotals.set(cache, total)
}

export const rememberCompositeSurface = <T extends CompositeSurface>(
  cache: Map<string, T>,
  key: string,
  value: T,
  maxCacheBytes: number,
  maxCachedFrames: number,
  budget?: CompositeSurfaceBudget
): void => {
  if (!budget) {
    let totalBytes = cacheBytes(cache)
    const previous = cache.get(key)
    if (previous && previous !== value) {
      totalBytes -= surfaceBytes(previous)
      closeSurfaceBitmap(previous)
    }
    cache.delete(key)
    cache.set(key, value)
    if (previous !== value) totalBytes += surfaceBytes(value)
    while (cache.size > 1 && (cache.size > maxCachedFrames || totalBytes > maxCacheBytes)) {
      const oldestKey = cache.keys().next().value
      if (oldestKey === undefined) break
      const oldest = cache.get(oldestKey)
      if (oldest) {
        totalBytes -= surfaceBytes(oldest)
        closeSurfaceBitmap(oldest)
      }
      cache.delete(oldestKey)
    }
    cacheByteTotals.set(cache, totalBytes)
    return
  }

  registerBudgetCache(budget, cache)
  const previous = cache.get(key)
  if (previous) removeBudgetEntry(budget, previous, previous !== value)
  cache.delete(key)
  cache.set(key, value)
  const bytes = surfaceBytes(value)
  budget.entries.set(value, { cache: cache as Map<string, CompositeSurface>, key, bytes })
  budget.bytes += bytes
  budget.cacheTotals.set(cache, (budget.cacheTotals.get(cache) ?? 0) + bytes)
  cacheByteTotals.set(cache, budget.cacheTotals.get(cache)!)

  while (cache.size > maxCachedFrames && cache.size > 1) {
    const oldestKey = cache.keys().next().value
    if (oldestKey === undefined) break
    const oldest = cache.get(oldestKey)
    if (!oldest) break
    cache.delete(oldestKey)
    removeBudgetEntry(budget, oldest)
  }
  while (budget.entries.size > 1 && budget.bytes > maxCacheBytes) {
    const oldest = budget.entries.keys().next().value
    if (!oldest) break
    const entry = budget.entries.get(oldest)
    if (!entry) break
    entry.cache.delete(entry.key)
    removeBudgetEntry(budget, oldest)
  }
}
