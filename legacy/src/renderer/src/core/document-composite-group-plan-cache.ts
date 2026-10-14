import type { SpriteDocument } from '@shared/types-document'
import { opacityGroupCompositeStack, type CompositeStackItem } from './document-composite-plan'

type GroupPlans = {
  revision: number
  frameId: string
  plain?: CompositeStackItem[] | null
  styled?: CompositeStackItem[] | null
}

/** Keep only the current frame/revision's validated source trees per document. */
export class DocumentCompositeGroupPlanCache {
  private plans = new WeakMap<SpriteDocument, GroupPlans>()

  clear(): void {
    this.plans = new WeakMap()
  }

  get(document: SpriteDocument, revision: number, allowNormalLayerStyles = false): CompositeStackItem[] | null {
    const frameId = document.animation?.activeFrameId ?? 'static'
    let cached = this.plans.get(document)
    if (!cached || cached.revision !== revision || cached.frameId !== frameId) {
      cached = { revision, frameId }
      this.plans.set(document, cached)
    }
    const key = allowNormalLayerStyles ? 'styled' : 'plain'
    // Cache rejected plans too, without consuming pending style dirtiness.
    if (cached[key] === undefined) cached[key] = opacityGroupCompositeStack(document, allowNormalLayerStyles)
    return cached[key]
  }
}
