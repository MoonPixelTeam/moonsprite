/** Coordinates explicitly registered renderer caches. These byte totals do
 * not include document pixels, browser native memory or unregistered caches. */

export interface CacheSnapshot {
  name: string
  cachedBytes: number
  itemCount: number
  evictions?: number
}

export interface CacheProvider {
  name: string
  snapshot: () => CacheSnapshot
  /** Evict least-recently-used entries to free approximately targetBytes. */
  trim?: (targetBytes: number) => number
  /** Clear all entries. */
  clear?: () => void
}

export interface MemoryPressureLevel {
  level: 'none' | 'moderate' | 'critical'
  /** Total bytes across all caches. */
  totalBytes: number
  /** Configured soft limit. */
  softLimitBytes: number
  /** Configured hard limit. */
  hardLimitBytes: number
}

const DEFAULT_SOFT_LIMIT_BYTES = 256 * 1024 * 1024  // 256MB
const DEFAULT_HARD_LIMIT_BYTES = 512 * 1024 * 1024  // 512MB

export class GlobalCacheManager {
  private providers = new Set<WeakRef<CacheProvider>>()
  private softLimitBytes = DEFAULT_SOFT_LIMIT_BYTES
  private hardLimitBytes = DEFAULT_HARD_LIMIT_BYTES
  private lastCheckBytes = 0
  private pressureCallbacks = new Set<(level: MemoryPressureLevel) => void>()

  constructor(softLimitBytes?: number, hardLimitBytes?: number) {
    if (softLimitBytes !== undefined) this.softLimitBytes = softLimitBytes
    if (hardLimitBytes !== undefined) this.hardLimitBytes = hardLimitBytes
  }

  register(provider: CacheProvider): () => void {
    if (this.providers.size >= 256) this.liveProviders()
    const reference = new WeakRef(provider)
    this.providers.add(reference)
    // The owner's unsubscribe keeps the provider alive, while the manager does
    // not keep an abandoned document/cache owner alive.
    return () => { if (reference.deref() === provider) this.providers.delete(reference) }
  }

  private liveProviders(): CacheProvider[] {
    const live: CacheProvider[] = []
    for (const reference of this.providers) {
      const provider = reference.deref()
      if (provider) live.push(provider)
      else this.providers.delete(reference)
    }
    return live
  }

  onMemoryPressure(callback: (level: MemoryPressureLevel) => void): () => void {
    this.pressureCallbacks.add(callback)
    return () => this.pressureCallbacks.delete(callback)
  }

  snapshot(): CacheSnapshot[] {
    return this.liveProviders().map(provider => provider.snapshot())
  }

  totalBytes(): number {
    return this.snapshot().reduce((sum, snap) => sum + snap.cachedBytes, 0)
  }

  checkMemoryPressure(): MemoryPressureLevel {
    const totalBytes = this.totalBytes()
    this.lastCheckBytes = totalBytes

    const level: MemoryPressureLevel['level'] =
      totalBytes >= this.hardLimitBytes ? 'critical'
      : totalBytes >= this.softLimitBytes ? 'moderate'
      : 'none'

    const result: MemoryPressureLevel = {
      level,
      totalBytes,
      softLimitBytes: this.softLimitBytes,
      hardLimitBytes: this.hardLimitBytes
    }

    if (level !== 'none') {
      for (const callback of this.pressureCallbacks) callback(result)
    }

    return result
  }

  trimToTarget(targetBytes: number): number {
    const providers = this.liveProviders().map(provider => ({ provider, bytes: provider.snapshot().cachedBytes }))
    let remaining = providers.reduce((sum, item) => sum + item.bytes, 0) - Math.max(0, targetBytes)
    let freedBytes = 0
    for (const { provider, bytes } of providers.sort((a, b) => b.bytes - a.bytes)) {
      if (remaining <= 0) break
      if (!provider.trim || bytes <= 0) continue
      // Re-read only this provider after trimming. This remains linear in
      // snapshot calls and doesn't trust a provider's estimate of freed bytes.
      provider.trim(Math.min(bytes, remaining))
      const freed = Math.max(0, bytes - provider.snapshot().cachedBytes)
      freedBytes += freed
      remaining -= freed
    }
    return freedBytes
  }

  handleMemoryPressure(): number {
    const pressure = this.checkMemoryPressure()
    if (pressure.level === 'none') return 0

    const targetBytes = pressure.level === 'critical'
      ? this.softLimitBytes * 0.7  // Drop to 70% of soft limit on critical
      : this.softLimitBytes * 0.85  // Drop to 85% of soft limit on moderate

    return this.trimToTarget(targetBytes)
  }

  clearAll(): void {
    for (const provider of this.liveProviders()) {
      if (provider.clear) provider.clear()
    }
  }

  dispose(): void {
    this.providers.clear()
    this.pressureCallbacks.clear()
  }
}

/** Starts the low-frequency safety valve for renderer caches. The individual
 * caches still enforce their own budgets; this catches future providers that
 * only expose a global budget. */
export const installGlobalCachePressureMonitor = (intervalMs = 30_000): (() => void) => {
  if (typeof window === 'undefined' || typeof window.setInterval !== 'function') return () => {}
  const timer = window.setInterval(() => { globalCacheManager.handleMemoryPressure() }, intervalMs)
  return () => window.clearInterval(timer)
}

export const globalCacheManager = new GlobalCacheManager()
