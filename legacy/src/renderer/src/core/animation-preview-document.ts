import type { SpriteDocument } from '@shared/types-document'
import { createAnimationFramePreviewDocument } from './animation'

/** One display-only shell. Its shared assets and raster storage must not be edited. */
export class AnimationPreviewDocumentCache {
  private entry: { source: SpriteDocument; frameId: string; activeFrameId: string | undefined; revision: number; document: SpriteDocument } | null = null

  get(source: SpriteDocument, frameId: string, revision: number): SpriteDocument {
    if (frameId === source.animation?.activeFrameId) {
      this.clear()
      return source
    }
    const entry = this.entry
    if (entry?.source === source && entry.frameId === frameId && entry.activeFrameId === source.animation?.activeFrameId && entry.revision === revision) return entry.document
    // Drop the previous shell before constructing the next; never accumulate
    // one cloned timeline per frame or retain obsolete source documents.
    this.clear()
    const document = createAnimationFramePreviewDocument(source, frameId)
    this.entry = { source, frameId, activeFrameId: source.animation?.activeFrameId, revision, document }
    return document
  }

  clear(): void {
    this.entry = null
  }
}
