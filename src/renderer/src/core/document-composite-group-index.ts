import type { LayerGroup } from '@shared/types-layer'
import type { SpriteDocument } from '@shared/types-document'

/** Reuses group ID lookup tables while preserving array replacement and append invalidation. */
export class DocumentCompositeGroupIndex {
  private indexes = new WeakMap<SpriteDocument, { groups: readonly LayerGroup[]; count: number; byId: Map<string, LayerGroup> }>()

  get(document: SpriteDocument): Map<string, LayerGroup> {
    const cached = this.indexes.get(document)
    if (cached && cached.groups === document.groups && cached.count === document.groups.length) return cached.byId
    const byId = new Map(document.groups.map((group) => [group.id, group]))
    this.indexes.set(document, { groups: document.groups, count: document.groups.length, byId })
    return byId
  }

  clear(): void {
    this.indexes = new WeakMap()
  }
}
