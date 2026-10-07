/**
 * Buffer Pool for Uint8ClampedArray reuse
 *
 * Reduces GC pressure by reusing buffers for common canvas sizes.
 * Critical for 4K+ canvas operations that would otherwise allocate 64MB+ per composite.
 */

interface PooledBuffer {
  buffer: Uint8ClampedArray
  size: number
  lastUsed: number
}

class BufferPool {
  private pools = new Map<number, PooledBuffer[]>()
  private readonly maxBuffersPerSize = 4
  private readonly commonSizes = [
    256 * 256 * 4,      // 256x256
    512 * 512 * 4,      // 512x512
    1024 * 1024 * 4,    // 1024x1024
    2048 * 2048 * 4,    // 2048x2048
    4096 * 4096 * 4,    // 4096x4096 (64MB)
  ]

  /**
   * Acquire a buffer of at least the requested size.
   * Returns a reused buffer if available, otherwise allocates new.
   */
  acquire(minBytes: number): Uint8ClampedArray {
    // Find the smallest common size that fits
    const poolSize = this.commonSizes.find(size => size >= minBytes) ?? minBytes

    const pool = this.pools.get(poolSize)
    if (pool && pool.length > 0) {
      const pooled = pool.pop()!
      pooled.lastUsed = performance.now()

      // Compositing starts with transparent pixels and ImageData requires an
      // exact logical length, even when the backing allocation is larger.
      const buffer = pooled.buffer.subarray(0, minBytes)
      buffer.fill(0)
      return buffer
    }

    // Allocate new buffer
    return new Uint8ClampedArray(minBytes)
  }

  /**
   * Release a buffer back to the pool for reuse.
   */
  release(buffer: Uint8ClampedArray): void {
    const size = buffer.byteLength

    // Only pool common sizes
    const poolSize = this.commonSizes.find(s => s === size)
    if (!poolSize) return

    let pool = this.pools.get(poolSize)
    if (!pool) {
      pool = []
      this.pools.set(poolSize, pool)
    }

    // Limit pool size to prevent unbounded growth
    if (pool.length >= this.maxBuffersPerSize) {
      // Evict oldest buffer
      pool.sort((a, b) => a.lastUsed - b.lastUsed)
      pool.shift()
    }

    pool.push({
      buffer,
      size,
      lastUsed: performance.now()
    })
  }

  /**
   * Clear all pooled buffers (for memory pressure situations)
   */
  clear(): void {
    this.pools.clear()
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
