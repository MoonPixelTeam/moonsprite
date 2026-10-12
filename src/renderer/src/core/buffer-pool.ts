import { globalCacheManager } from './global-cache-manager'

/** Reuses explicitly released scratch buffers. Returned document/image pixels
 * remain caller-owned and must never be released while readers retain them. */

interface PooledBuffer {
  buffer: Uint8ClampedArray
  size: number
  lastUsed: number
}

export class BufferPool {
  private pools = new Map<number, PooledBuffer[]>()
  private allocations = new WeakSet<ArrayBufferLike>()
  private pooled = new Set<ArrayBufferLike>()
  private bytes = 0
  private unregister?: () => void
  private readonly maxBuffersPerSize = 4
  private readonly maxBuffers = 64
  constructor(private readonly maxBytes = 64 * 1024 * 1024) {
    if (!Number.isFinite(maxBytes) || maxBytes < 0) throw new Error('Invalid composite buffer pool byte limit')
  }

  /**
   * Acquire a buffer of at least the requested size.
   * Returns a reused buffer if available, otherwise allocates new.
   */
  acquire(minBytes: number): Uint8ClampedArray {
    // Arbitrary region sizes are reusable too. Keep the logical length exact
    // and avoid retaining a huge allocation for a tiny request.
    let poolSize = minBytes
    for (const size of this.pools.keys()) {
      if (size >= minBytes && size <= minBytes * 4 && (!this.pools.has(poolSize) || size < poolSize)) poolSize = size
    }

    const pool = this.pools.get(poolSize)
    if (pool && pool.length > 0) {
      const pooled = pool.pop()!
      if (!pool.length) this.pools.delete(poolSize)
      this.pooled.delete(pooled.buffer.buffer)
      this.bytes -= pooled.size
      if (!this.pooled.size) { this.unregister?.(); this.unregister = undefined }

      // Compositing starts with transparent pixels and ImageData requires an
      // exact logical length, even when the backing allocation is larger.
      const buffer = pooled.buffer.subarray(0, minBytes)
      buffer.fill(0)
      return buffer
    }

    // Allocate new buffer
    const buffer = new Uint8ClampedArray(minBytes)
    this.allocations.add(buffer.buffer)
    return buffer
  }

  /**
   * Release a buffer back to the pool for reuse.
   */
  release(buffer: Uint8ClampedArray): void {
    const size = buffer.buffer.byteLength
    if (!this.allocations.has(buffer.buffer) || this.pooled.has(buffer.buffer) || !size || size > this.maxBytes) return
    const poolSize = size
    while (this.bytes + size > this.maxBytes || this.pooled.size >= this.maxBuffers) this.trim(Math.max(size, this.bytes + size - this.maxBytes))

    let pool = this.pools.get(poolSize)
    if (!pool) {
      pool = []
      this.pools.set(poolSize, pool)
    }

    // Limit pool size to prevent unbounded growth
    if (pool.length >= this.maxBuffersPerSize) {
      // Evict oldest buffer
      pool.sort((a, b) => a.lastUsed - b.lastUsed)
      const oldest = pool.shift()!
      this.bytes -= oldest.size
      this.pooled.delete(oldest.buffer.buffer)
    }

    pool.push({
      buffer: new Uint8ClampedArray(buffer.buffer),
      size,
      lastUsed: performance.now()
    })
    this.bytes += size
    this.pooled.add(buffer.buffer)
    this.unregister ??= globalCacheManager.register({
      name: 'CompositeBufferPool',
      snapshot: () => ({ name: 'CompositeBufferPool', cachedBytes: this.bytes, itemCount: this.pooled.size }),
      trim: bytes => this.trim(bytes), clear: () => this.clear()
    })
  }

  trim(targetBytes: number): number {
    const before = this.bytes
    for (const [size, pool] of this.pools) {
      while (pool.length && before - this.bytes < targetBytes) {
        const entry = pool.shift()!
        this.bytes -= size
        this.pooled.delete(entry.buffer.buffer)
      }
      if (!pool.length) this.pools.delete(size)
      if (before - this.bytes >= targetBytes) break
    }
    if (!this.pooled.size) { this.unregister?.(); this.unregister = undefined }
    return before - this.bytes
  }

  /**
   * Clear all pooled buffers (for memory pressure situations)
   */
  clear(): void {
    this.pools.clear()
    this.pooled.clear()
    this.bytes = 0
    this.unregister?.()
    this.unregister = undefined
  }

  /**
   * Get current pool statistics
   */
  getStats(): { totalBuffers: number; totalBytes: number; bySize: Map<number, number> } {
    let totalBuffers = 0
    let totalBytes = 0
    const bySize = new Map<number, number>()

    for (const [size, pool] of this.pools) {
      const count = pool.length
      totalBuffers += count
      totalBytes += size * count
      bySize.set(size, count)
    }

    return { totalBuffers, totalBytes, bySize }
  }
}

// Global singleton instance
export const globalBufferPool = new BufferPool()

/**
 * Helper to acquire a buffer with automatic calculation from dimensions
 */
export const acquireCompositeBuffer = (width: number, height: number): Uint8ClampedArray => {
  return globalBufferPool.acquire(width * height * 4)
}

/**
 * Helper to release a composite buffer
 */
export const releaseCompositeBuffer = (buffer: Uint8ClampedArray): void => {
  globalBufferPool.release(buffer)
}
