/** Global memory manager for coordinating all caches in the renderer. */

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
  private providers = new Set<CacheProvider>()
  private softLimitBytes = DEFAULT_SOFT_LIMIT_BYTES
  private hardLimitBytes = DEFAULT_HARD_LIMIT_BYTES
  private lastCheckBytes = 0
  private pressureCallbacks = new Set<(level: MemoryPressureLevel) => void>()

  constructor(softLimitBytes?: number, hardLimitBytes?: number) {
    if (softLimitBytes !== undefined) this.softLimitBytes = softLimitBytes
    if (hardLimitBytes !== undefined) this.hardLimitBytes = hardLimitBytes
  }

  register(provider: CacheProvider): () => void {
    this.providers.add(provider)
    return () => this.providers.delete(provider)
  }

  onMemoryPressure(callback: (level: MemoryPressureLevel) => void): () => void {
    this.pressureCallbacks.add(callback)
    return () => this.pressureCallbacks.delete(callback)
  }

  snapshot(): CacheSnapshot[] {
    return Array.from(this.providers).map(provider => provider.snapshot())
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
    const providers = Array.from(this.providers).filter(p => p.trim)
    if (providers.length === 0) return 0

    let freedBytes = 0
    const currentTotal = this.totalBytes()
    if (currentTotal <= targetBytes) return 0

    const neededBytes = currentTotal - targetBytes
    const perProviderTarget = Math.ceil(neededBytes / providers.length)

    for (const provider of providers) {
      if (!provider.trim) continue
      const freed = provider.trim(perProviderTarget)
      freedBytes += freed
      if (this.totalBytes() <= targetBytes) break
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
    for (const provider of this.providers) {
      if (provider.clear) provider.clear()
    }
  }

  dispose(): void {
    this.providers.clear()
    this.pressureCallbacks.clear()
  }
}

export const globalCacheManager = new GlobalCacheManager()
