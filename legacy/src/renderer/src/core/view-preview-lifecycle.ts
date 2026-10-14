import type { ViewState } from '@shared/types-view'

type ViewPreviewFlusher = () => void
type ViewPreviewListener = (view: ViewState) => void

const flushers = new Map<string, Set<ViewPreviewFlusher>>()
const listeners = new Map<string, Set<ViewPreviewListener>>()

export const registerViewPreviewFlusher = (documentId: string, flusher: ViewPreviewFlusher): (() => void) => {
  const documentFlushers = flushers.get(documentId) ?? new Set<ViewPreviewFlusher>()
  documentFlushers.add(flusher)
  flushers.set(documentId, documentFlushers)
  return () => {
    documentFlushers.delete(flusher)
    if (documentFlushers.size === 0) flushers.delete(documentId)
  }
}

export const flushViewPreview = (documentId: string): void => {
  for (const flusher of [...(flushers.get(documentId) ?? [])]) flusher()
}

export const registerViewPreviewListener = (documentId: string, listener: ViewPreviewListener): (() => void) => {
  const documentListeners = listeners.get(documentId) ?? new Set<ViewPreviewListener>()
  documentListeners.add(listener)
  listeners.set(documentId, documentListeners)
  return () => {
    documentListeners.delete(listener)
    if (documentListeners.size === 0) listeners.delete(documentId)
  }
}

export const notifyViewPreview = (documentId: string, view: ViewState): void => {
  for (const listener of [...(listeners.get(documentId) ?? [])]) listener(view)
}
