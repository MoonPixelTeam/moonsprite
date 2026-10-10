import type { SpriteDocument } from '@shared/types-document'
import type { RasterLayer } from '@shared/types-layer'
import { simpleClippingLayers } from './document-composite-clipping'
import { simpleLayerMaskLayers, type SimpleLayerMaskStack } from './document-composite-mask'
import { groupEffectsPlan, type GroupEffectsPlan } from './document-composite-group-effects'

type SimplePlans = {
  revision: number
  frameId: string
  clipping?: RasterLayer[] | null
  masks?: SimpleLayerMaskStack | null
  groupEffects?: GroupEffectsPlan | null
}

/** Cache accepted and rejected flat paths without retaining frame history or copying pixels. */
export class DocumentCompositeSimplePlanCache {
  private plans = new WeakMap<SpriteDocument, SimplePlans>()

  clear(): void {
    this.plans = new WeakMap()
  }

  invalidate(document: SpriteDocument): void {
    this.plans.delete(document)
  }

  private entry(document: SpriteDocument, revision: number): SimplePlans {
    const frameId = document.animation?.activeFrameId ?? 'static'
    let cached = this.plans.get(document)
    if (!cached || cached.revision !== revision || cached.frameId !== frameId) {
      cached = { revision, frameId }
      this.plans.set(document, cached)
    }
    return cached
  }

  clippingFor(document: SpriteDocument, revision: number): RasterLayer[] | null {
    const cached = this.entry(document, revision)
    if (cached.clipping === undefined) cached.clipping = simpleClippingLayers(document)
    return cached.clipping
  }

  masksFor(document: SpriteDocument, revision: number): SimpleLayerMaskStack | null {
    const cached = this.entry(document, revision)
    if (cached.masks === undefined) cached.masks = simpleLayerMaskLayers(document)
    return cached.masks
  }

  groupEffectsFor(document: SpriteDocument, revision: number): GroupEffectsPlan | null {
    const cached = this.entry(document, revision)
    if (cached.groupEffects === undefined) cached.groupEffects = groupEffectsPlan(document)
    return cached.groupEffects
  }
}
