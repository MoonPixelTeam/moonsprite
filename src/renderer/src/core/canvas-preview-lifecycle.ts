import type { SelectionQuad, SelectionRect } from '@shared/types-selection'
import type { SpriteDocument } from '@shared/types-document'
import type { SelectionShearTransform } from './selection'
import type { SelectionTransformSource } from './tools-selection-transform'

export interface CanvasPreviewSelection {
  layerId: string
  source: SelectionTransformSource
  target: SelectionRect
  angle: number
  shear?: SelectionShearTransform
  /** Exact projective frame used by free transform previews. */
  quad?: SelectionQuad
  copy: boolean
  /** Whether non-right-angle selection rotations use the RotSprite path. */
  optimizedRotation?: boolean
}

export type CanvasPreviewInvalidation =
  | { kind: 'full' }
  | { kind: 'region'; rect: SelectionRect; placementOnly?: boolean; layerIds?: readonly string[] }

export interface CanvasPreviewSnapshot {
  document: SpriteDocument
  frameId: string
  revision: number
  contentRevision: number
  invalidation?: CanvasPreviewInvalidation
  movingLayerIds?: readonly string[]
  selectionPreview?: CanvasPreviewSelection
  /** High-frequency raster edits are shown by the editor immediately; auxiliary canvases catch up after commit. */
  deferAuxiliaryDraw?: boolean
}

type CanvasPreviewListener = (snapshot: CanvasPreviewSnapshot | null) => void
type LayerMaskThumbnailPreviewListener = (maskId: string) => void
type AnimationCelThumbnailPreviewListener = (celId: string, layerId: string) => void

const listeners = new Map<string, Set<CanvasPreviewListener>>()
const layerMaskThumbnailListeners = new Map<string, Set<LayerMaskThumbnailPreviewListener>>()
const animationCelThumbnailListeners = new Map<string, Set<AnimationCelThumbnailPreviewListener>>()

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

export const registerLayerMaskThumbnailPreviewListener = (documentId: string, listener: LayerMaskThumbnailPreviewListener): (() => void) => {
  const documentListeners = layerMaskThumbnailListeners.get(documentId) ?? new Set<LayerMaskThumbnailPreviewListener>()
  documentListeners.add(listener)
  layerMaskThumbnailListeners.set(documentId, documentListeners)
  return () => {
    documentListeners.delete(listener)
    if (documentListeners.size === 0) layerMaskThumbnailListeners.delete(documentId)
  }
}

export const notifyLayerMaskThumbnailPreview = (documentId: string, maskId: string): void => {
  for (const listener of [...(layerMaskThumbnailListeners.get(documentId) ?? [])]) listener(maskId)
}

export const registerAnimationCelThumbnailPreviewListener = (documentId: string, listener: AnimationCelThumbnailPreviewListener): (() => void) => {
  const documentListeners = animationCelThumbnailListeners.get(documentId) ?? new Set<AnimationCelThumbnailPreviewListener>()
  documentListeners.add(listener)
  animationCelThumbnailListeners.set(documentId, documentListeners)
  return () => {
    documentListeners.delete(listener)
    if (documentListeners.size === 0) animationCelThumbnailListeners.delete(documentId)
  }
}

export const notifyAnimationCelThumbnailPreview = (documentId: string, celId: string, layerId: string): void => {
  for (const listener of [...(animationCelThumbnailListeners.get(documentId) ?? [])]) listener(celId, layerId)
}
