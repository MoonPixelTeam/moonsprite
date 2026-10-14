import type { SpriteDocument } from '@shared/types-document'
import { CanvasCompositeCache } from './canvas-composite-cache'
import { releaseSharedAnimationResources } from './canvas-composite-cache-surfaces'

// CanvasStage instances are intentionally short lived when switching tabs or
// changing pane layouts. Keep the derived composite surface with the document
// so remounting a stage does not rebuild and upload a large canvas on its first
// frame. WeakMap ownership lets closed documents be collected normally.
const documentCompositeCaches = new WeakMap<SpriteDocument, CanvasCompositeCache>()

export const existingCanvasCompositeCache = (document: SpriteDocument): CanvasCompositeCache | undefined => documentCompositeCaches.get(document)

export const canvasCompositeCacheFor = (document: SpriteDocument): CanvasCompositeCache => {
  let cache = documentCompositeCaches.get(document)
  if (!cache) {
    cache = new CanvasCompositeCache()
    documentCompositeCaches.set(document, cache)
  }
  return cache
}

export const releaseCanvasCompositeCache = (document: SpriteDocument): void => {
  documentCompositeCaches.get(document)?.dispose()
  documentCompositeCaches.delete(document)
  releaseSharedAnimationResources(document)
}

