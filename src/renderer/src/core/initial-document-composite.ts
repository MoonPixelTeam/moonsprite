import type { SpriteDocument } from '@shared/types-document'

interface InitialDocumentComposite {
  width: number
  height: number
  frameId: string
  completeFrame?: boolean
  pixels?: Uint8ClampedArray
  canvas?: OffscreenCanvas
}

const initialComposites = new WeakMap<SpriteDocument, InitialDocumentComposite>()
const pendingInitialComposites = new WeakMap<SpriteDocument, { frameId: string; pending: Promise<void> }>()
const initialCompositeListeners = new WeakMap<SpriteDocument, Set<() => void>>()
const MAX_INITIAL_COMPOSITE_DIMENSION = 8192
const MAX_INITIAL_COMPOSITE_BYTES = 128 * 1024 * 1024

export const releaseInitialDocumentComposite = (document: SpriteDocument): void => {
  const composite = initialComposites.get(document)
  if (composite?.canvas) {
    composite.canvas.width = 1
    composite.canvas.height = 1
  }
  initialComposites.delete(document)
  pendingInitialComposites.delete(document)
  initialCompositeListeners.delete(document)
}

export const canPrepareInitialDocumentComposite = (width: number, height: number): boolean =>
  width > 0 && height > 0
  && width <= MAX_INITIAL_COMPOSITE_DIMENSION
  && height <= MAX_INITIAL_COMPOSITE_DIMENSION
  && width * height * 4 <= MAX_INITIAL_COMPOSITE_BYTES

const notifyInitialCompositeListeners = (document: SpriteDocument): void => {
  const listeners = initialCompositeListeners.get(document)
  if (listeners) {
    initialCompositeListeners.delete(document)
    for (const listener of listeners) listener()
  }
}

const initialCompositeFrameId = (document: SpriteDocument, frameId?: string): string => frameId ?? document.animation?.activeFrameId ?? 'static'

export const registerInitialDocumentComposite = (document: SpriteDocument, pixels: Uint8ClampedArray, frameId?: string, options: { completeFrame?: boolean } = {}): void => {
  if (!canPrepareInitialDocumentComposite(document.width, document.height) || pixels.byteLength !== document.width * document.height * 4) return
  initialComposites.set(document, { width: document.width, height: document.height, frameId: initialCompositeFrameId(document, frameId), pixels, completeFrame: options.completeFrame })
  notifyInitialCompositeListeners(document)
}

export const registerInitialDocumentCompositeSurface = (document: SpriteDocument, canvas: OffscreenCanvas, frameId?: string): void => {
  if (!canPrepareInitialDocumentComposite(document.width, document.height) || canvas.width !== document.width || canvas.height !== document.height) return
  initialComposites.set(document, { width: document.width, height: document.height, frameId: initialCompositeFrameId(document, frameId), canvas })
  notifyInitialCompositeListeners(document)
}

export const registerPendingInitialDocumentComposite = (document: SpriteDocument, pending: Promise<void>, frameId?: string): void => {
  const entry = { frameId: initialCompositeFrameId(document, frameId), pending }
  pendingInitialComposites.set(document, entry)
  void pending.finally(() => {
    if (pendingInitialComposites.get(document) === entry) {
      pendingInitialComposites.delete(document)
      notifyInitialCompositeListeners(document)
    }
  }).catch(() => undefined)
}

export const initialDocumentCompositePending = (document: SpriteDocument, frameId?: string): boolean => {
  const entry = pendingInitialComposites.get(document)
  return Boolean(entry && entry.frameId === initialCompositeFrameId(document, frameId))
}

export const subscribeInitialDocumentComposite = (document: SpriteDocument, listener: () => void): (() => void) => {
  if (initialComposites.has(document)) {
    listener()
    return () => undefined
  }
  const listeners = initialCompositeListeners.get(document) ?? new Set<() => void>()
  listeners.add(listener)
  initialCompositeListeners.set(document, listeners)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) initialCompositeListeners.delete(document)
  }
}

export const initialDocumentComposite = (document: SpriteDocument, frameId?: string): InitialDocumentComposite | null => {
  const composite = initialComposites.get(document)
  return composite
    && composite.width === document.width
    && composite.height === document.height
    && composite.frameId === initialCompositeFrameId(document, frameId)
    ? composite
    : null
}

export const initialDocumentCompositeSurface = (document: SpriteDocument, frameId?: string): OffscreenCanvas | null => {
  const composite = initialDocumentComposite(document, frameId)
  if (!composite) return null
  if (composite.canvas) return composite.canvas
  if (!composite.pixels) return null
  const canvas = new OffscreenCanvas(composite.width, composite.height)
  const context = canvas.getContext('2d')
  if (!context) return null
  context.putImageData(new ImageData(composite.pixels as Uint8ClampedArray<ArrayBuffer>, composite.width, composite.height), 0, 0)
  composite.canvas = canvas
  composite.pixels = undefined
  return canvas
}
