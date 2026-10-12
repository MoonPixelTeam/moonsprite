import type { StyledLayerBlock } from './document-composite-style-types'
import { globalCacheManager, type CacheProvider } from './global-cache-manager'

export const DEFAULT_STYLE_CACHE_BYTES = 64 * 1024 * 1024
interface Reservation { owner: WeakRef<BudgetedStyleBlockMap>; key: string; bytes: number }

/** Shared by direct layer blocks and isolated layer/group effects in one renderer.
 * Weak owners prevent the LRU from keeping source layers/documents alive. */
export class LayerStyleCacheBudget {
  private lru = new Map<Reservation, true>()
  private bytes = 0
  private lastTouched?: Reservation
  private evictionCount = 0
  private unregister?: () => void

  constructor(readonly limitBytes = DEFAULT_STYLE_CACHE_BYTES) {
    if (!Number.isFinite(limitBytes) || limitBytes < 0) throw new Error('Invalid layer style cache byte limit')
  }

  private asCacheProvider(): CacheProvider {
    return {
      name: 'LayerStyleCache',
      snapshot: () => ({
        name: 'LayerStyleCache',
        cachedBytes: this.bytes,
        itemCount: this.lru.size,
        evictions: this.evictionCount
      }),
      trim: (targetBytes: number) => {
        const initialBytes = this.bytes
        let freedBytes = 0
        while (freedBytes < targetBytes && this.lru.size > 0) {
          const oldest = this.lru.keys().next().value
          if (!oldest) break
          const owner = oldest.owner.deref()
          if (owner) owner.delete(oldest.key)
          else this.remove(oldest)
          freedBytes = initialBytes - this.bytes
          this.evictionCount += 1
        }
        return freedBytes
      },
      clear: () => this.clear()
    }
  }

  snapshot() { return { limitBytes: this.limitBytes, cachedBytes: this.bytes, blockCount: this.lru.size, evictions: this.evictionCount } }

  touch(entry: Reservation): void {
    if (this.lastTouched === entry) return
    this.lru.delete(entry)
    this.lru.set(entry, true)
    this.lastTouched = entry
  }

  add(entry: Reservation): void {
    // Empty and abandoned render-time instances own no bytes. Register only
    // while used; disposal can be followed by React effect reactivation.
    this.unregister ??= globalCacheManager.register(this.asCacheProvider())
    this.bytes += entry.bytes
    this.touch(entry)
    while (this.bytes > this.limitBytes) {
      const oldest = this.lru.keys().next().value
      if (!oldest) break
      const owner = oldest.owner.deref()
      if (owner) owner.delete(oldest.key)
      else this.remove(oldest)
      this.evictionCount += 1
    }
  }

  remove(entry: Reservation): void {
    if (this.lru.delete(entry)) this.bytes -= entry.bytes
    if (this.lastTouched === entry) this.lastTouched = undefined
  }

  clear(): void {
    for (const entry of this.lru.keys()) {
      const owner = entry.owner.deref()
      if (owner) owner.delete(entry.key)
      else this.remove(entry)
    }
    this.unregister?.()
    this.unregister = undefined
  }

  dispose(): void {
    this.clear()
  }
}

/** Map-compatible storage so existing dirty-region updates retain their rules. */
export class BudgetedStyleBlockMap extends Map<string, StyledLayerBlock> {
  private reservations = new Map<string, Reservation>()
  constructor(private readonly budget: LayerStyleCacheBudget) { super() }

  override get(key: string): StyledLayerBlock | undefined {
    const block = super.get(key)
    const entry = this.reservations.get(key)
    if (entry) this.budget.touch(entry)
    return block
  }

  override set(key: string, block: StyledLayerBlock): this {
    this.delete(key)
    const bytes = block.pixels.byteLength
    if (bytes === 0 || bytes > this.budget.limitBytes) return this
    super.set(key, block)
    const entry = { owner: new WeakRef(this), key, bytes }
    this.reservations.set(key, entry)
    this.budget.add(entry)
    return this
  }

  override delete(key: string): boolean {
    const entry = this.reservations.get(key)
    if (entry) { this.budget.remove(entry); this.reservations.delete(key) }
    return super.delete(key)
  }

  override clear(): void {
    for (const entry of this.reservations.values()) this.budget.remove(entry)
    this.reservations.clear()
    super.clear()
  }
}
