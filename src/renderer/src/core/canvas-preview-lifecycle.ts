import type { SelectionQuad, SelectionRect, SpriteDocument } from '@shared/types'
import type { SelectionShearTransform } from './selection'
import type { SelectionTransformSource } from './tools'

export interface CanvasPreviewSelection {
  layerId: string
  source: SelectionTransformSource
  target: SelectionRect
  angle: number
  shear?: SelectionShearTransform
  /** Exact projective frame used by free transform previews. */
  quad?: SelectionQuad
  copy: boolean
}

export type CanvasPreviewInvalidation =
  | { kind: 'full' }
  | { kind: 'region'; rect: SelectionRect }

export interface CanvasPreviewSnapshot {
  document: SpriteDocument
  frameId: string
  revision: number
  contentRevision: number
  invalidation?: CanvasPreviewInvalidation
  movingLayerIds?: readonly string[]
  selectionPreview?: CanvasPreviewSelection
}

type CanvasPreviewListener = (snapshot: CanvasPreviewSnapshot | null) => void

const listeners = new Map<string, Set<CanvasPreviewListener>>()

export const registerCanvasPreviewListener = (documentId: string, listener: CanvasPreviewListener): (() => void) => {
  const documentListeners = listeners.get(documentId) ?? new Set<CanvasPreviewListener>()
  documentListeners.add(listener)
  listeners.set(documentId, documentListeners)
  return () => {
    documentListeners.delete(listener)
    if (documentListeners.size === 0) listeners.delete(documentId)
  }
}

export const notifyCanvasPreview = (documentId: string, snapshot: CanvasPreviewSnapshot | null): void => {
  for (const listener of [...(listeners.get(documentId) ?? [])]) listener(snapshot)
}
