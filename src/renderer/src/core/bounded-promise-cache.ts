/** Eviction only drops the cache reference; in-flight callers keep their
 * promise. Failures are removed so a transient asset error can be retried. */
export class BoundedPromiseCache<K, V> {
  private entries = new Map<K, Promise<V>>()
  constructor(private readonly limit: number) {
    if (!Number.isInteger(limit) || limit < 1) throw new Error('Invalid promise cache limit')
  }
  get size(): number { return this.entries.size }
  getOrCreate(key: K, create: () => Promise<V>): Promise<V> {
    const cached = this.entries.get(key)
    if (cached) { this.entries.delete(key); this.entries.set(key, cached); return cached }
    const pending = create()
    this.entries.set(key, pending)
    while (this.entries.size > this.limit) this.entries.delete(this.entries.keys().next().value!)
    void pending.catch(() => { if (this.entries.get(key) === pending) this.entries.delete(key) })
    return pending
  }
}
