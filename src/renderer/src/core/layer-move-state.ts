import type { AnimationCel } from '@shared/types-animation'
import type { RasterLayer } from '@shared/types-layer'
import type { SelectionMask, SelectionRect } from '@shared/types-selection'

type Point = { x: number; y: number }

/** Document movement state shared by previews and commit/cancel operations. */
export interface LayerMoveState {
  selectionStart?: SelectionMask | null
  layerId?: string
  layerOffset?: Point
  layerIds?: string[]
  layerOffsets?: Record<string, Point>
  layerContentBounds?: Record<string, SelectionRect | null>
  layerPreviewOffset?: Point
  animationMaskOffsets?: Record<string, Point>
  layerFrameId?: string
  animationCellKeys?: string[]
  animationCellOffsets?: Record<string, Point>
  duplicatedLayerId?: string
  duplicatedLayer?: RasterLayer
  duplicatedAnimationCels?: AnimationCel[]
  duplicatedLayerIndex?: number
  originalSelectedLayerIds?: string[]
}
