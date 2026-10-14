import type { SelectionMask, SelectionQuad } from '@shared/types-selection'
import { type PixelEdit } from './history'


export interface SelectionTransformSource {
  selection: SelectionMask
  values: Uint32Array
  selectedOffsets: Uint32Array
  opaqueOffsets: Uint32Array
  opaqueIndices: Uint32Array
  opaqueValues: Uint32Array
  origin?: 'selection' | 'clipboard'
  /**
   * Exact frame occupied by the captured pixels. When present, a free
   * transform maps this frame to the next target quad instead of assuming the
   * captured selection bounds are an axis-aligned rectangle.
   */
  sourceQuad?: SelectionQuad
}

export interface SelectionTranslationPreview {
  layerId: string
  marks: Uint8Array
  canvasIndices: Uint32Array
  indices: Uint32Array
  before: Uint32Array
  count: number
}

export interface SelectionTransformLayerState {
  layerId: string
  frameId?: string
  source: SelectionTransformSource
  previewEdit: PixelEdit | null
  translationPreview: SelectionTranslationPreview | null
}

export interface TransformCell { x: number; y: number; sourceIndex: number; value: number }

export interface SelectionTransformPreviewRasterPacked {
  width: number
  height: number
  pixels: Uint32Array
}
