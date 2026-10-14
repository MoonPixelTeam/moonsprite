import type { SpriteDocument } from '@shared/types-document'
import type { SelectionRect } from '@shared/types-selection'
import type { DocumentCompositeCache } from '@/core/document-composite-cache'
import type { SelectionTransformSource } from '@/core/tools-selection-transform-types'
import { normalCompositeLayers } from '@/core/document-composite-plan'
import { selectionBackdropKey } from './canvas-selection-backdrop-key'
import { CanvasSelectionBackdropCache } from './canvas-selection-backdrop-cache'

interface PreparedBackdrop {
  revision: number
  frameId: string | undefined
  layerId: string
  sourceKey: string
  cache: CanvasSelectionBackdropCache
}
const prepared = new WeakMap<SpriteDocument, PreparedBackdrop>()
const sourceKey = (document: SpriteDocument, layerId: string): string | null => {
  const layers = normalCompositeLayers(document)
  const index = layers?.findIndex(layer => layer.id === layerId) ?? -1
  return layers && index >= 0 ? selectionBackdropKey(document, layers.slice(0, index)) : null
}

export function preparedSelectionBackdrop(document: SpriteDocument, layerId: string, _revision: number): CanvasSelectionBackdropCache | undefined {
  const entry = prepared.get(document)
  return entry?.layerId === layerId && entry.frameId === document.animation?.activeFrameId
    && entry.sourceKey === sourceKey(document, layerId) ? entry.cache : undefined
}

/** Bounded idle work, cancelled by invalidating input or cleanup; never changes document pixels. */
export function scheduleSelectionBackdrop(composite: DocumentCompositeCache, document: SpriteDocument, layerId: string, revision: number, selection: SelectionRect, isCurrent: () => boolean): () => void {
  const left = Math.max(0, Math.floor(selection.x) - 16), top = Math.max(0, Math.floor(selection.y) - 16)
  const right = Math.min(document.width, Math.ceil(selection.x + selection.width) + 16)
  const bottom = Math.min(document.height, Math.ceil(selection.y + selection.height) + 16)
  if ((right - left) * (bottom - top) > 4 * 1024 * 1024 || right <= left || bottom <= top) return () => {}
  let cancelled = false, handle = 0, x = left, y = top
  const requestIdle = typeof window.requestIdleCallback === 'function'
    ? window.requestIdleCallback.bind(window)
    : typeof globalThis.requestIdleCallback === 'function' ? globalThis.requestIdleCallback.bind(globalThis) : null
  const cancelIdle = typeof window.cancelIdleCallback === 'function'
    ? window.cancelIdleCallback.bind(window)
    : typeof globalThis.cancelIdleCallback === 'function' ? globalThis.cancelIdleCallback.bind(globalThis) : null
  const idle = requestIdle !== null
  const key = sourceKey(document, layerId), frameId = document.animation?.activeFrameId
  if (key === null) return () => {}
  let entry: PreparedBackdrop | undefined
  let layers: ReturnType<DocumentCompositeCache['normalLayersFor']> = null
  const empty = new Uint32Array(0)
  const source: SelectionTransformSource = { selection, values: empty, selectedOffsets: empty, opaqueOffsets: empty, opaqueIndices: empty, opaqueValues: empty, origin: 'selection' }
  const cancel = () => {
    cancelled = true
    if (idle) cancelIdle!(handle)
    else window.clearTimeout(handle)
    window.removeEventListener('keydown', cancel, true)
  }
  const queue = () => { handle = idle ? requestIdle!(run) : window.setTimeout(run, 16) }
  const run = () => {
    if (cancelled || !isCurrent() || key !== sourceKey(document, layerId) || frameId !== document.animation?.activeFrameId) { cancel(); return }
    if (!entry) {
      layers = composite.normalLayersFor(document, revision)
      const index = layers?.findIndex(layer => layer.id === layerId) ?? -1
      if (!layers || index < 0) { cancel(); return }
      layers = layers.slice(0, index)
      entry = { revision, frameId, layerId, sourceKey: key, cache: preparedSelectionBackdrop(document, layerId, revision) ?? new CanvasSelectionBackdropCache(composite, undefined, true) }
      prepared.set(document, entry)
    }
    const layer = document.layers.find(candidate => candidate.id === layerId)!
    const until = performance.now() + 6
    do {
      entry.cache.read(document, layer, layers!, source, false, { x, y, width: Math.min(64, right - x), height: Math.min(16, bottom - y) }, revision)
      x += 64
      if (x >= right) { x = left; y += 16 }
    } while (y < bottom && performance.now() < until)
    if (y < bottom) queue()
    else cancel()
  }
  window.addEventListener('keydown', cancel, true)
  queue()
  return cancel
}
