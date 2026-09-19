import type { LayerMoveState } from './layer-move-state'
import type { GradientStop, LiquifyMode } from '@shared/types-brush'
import type { RasterLayer } from '@shared/types-layer'
import type { RgbaColor } from '@shared/types-color'
import type { SelectionMask, SelectionMode, SelectionQuad, SelectionRect } from '@shared/types-selection'
import type { SpriteDocument } from '@shared/types-document'
import type { TilemapCell } from '@shared/types-tiles'
import { type PixelEdit } from './history'
import {
  type SelectionTransformLayerState,
  type SelectionTransformSource,
  type SelectionTranslationPreview
} from './tools-selection-transform-types'
import { type BrushGradientSample } from './tools-pixel-edit'
import { type SelectionShearTransform } from './selection'
import type { TilemapEdit, TilemapSelectionMoveSource } from './tilemap'
import type { FreeTilePlacementEdit, FreeTileSourceEditSnapshot } from './free-tile-document'
import type { FreeTileInstanceTransform } from './free-tile'
import type { AlignmentGuide } from './alignment'
import type { IsoLineDirection } from './isometric'
import type { LiquifyPushStroke } from './liquify'
import { type PolygonPathRasterCache } from './canvas-input-path'
import { type BrushSpeedState } from './canvas-input-pointer'

export interface CanvasPoint {
  x: number
  y: number
}

export interface CanvasStrokePoint extends CanvasPoint {
  size?: number
  opacityScale?: number
  angle?: number
  color?: RgbaColor
  gradient?: BrushGradientSample
  coverageKey?: string
  overrideImageBrushColor?: boolean
}

export interface CanvasIsoGridStrokeEdge {
  key: string
  from: CanvasStrokePoint
  to: CanvasStrokePoint
}

export type SelectionHandle = 'nw' | 'n' | 'ne' | 'w' | 'e' | 'sw' | 's' | 'se'

export type SelectionRotationHandle = 'rotate-ne' | 'rotate-se' | 'rotate-sw' | 'rotate-nw'

export type SelectionShearHandle = 'shear-n' | 'shear-e' | 'shear-s' | 'shear-w'

export interface CanvasDragState extends LayerMoveState {
  kind:
    | 'draw'
    | 'tile-draw'
    | 'free-tile-draw'
    | 'free-tile-edit'
    | 'free-tile-instance-move'
    | 'airbrush'
    | 'liquify'
    | 'smooth'
    | 'selection-brush'
    | 'shape'
    | 'freeform-shape'
    | 'polygon-shape'
    | 'line-shape'
    | 'curve-shape'
    | 'gradient'
    | 'marquee'
    | 'lasso'
    | 'polygon-lasso'
    | 'magic-preview'
    | 'sample-color'
    | 'move-content'
    | 'move-selection'
    | 'move-selection-pivot'
    | 'transform-content'
    | 'rotate-content'
    | 'shear-content'
    | 'move-layer'
    | 'create-text-box'
    | 'transform-text-box'
    | 'create-slice'
    | 'move-slice'
    | 'resize-slice'
    | 'brush-size'
    | 'canvas-resize'
    | 'canvas-move'
    | 'zoom-drag'
    | 'rotate-view'
    | 'pan'
  start: CanvasPoint
  last: CanvasPoint
  edit?: PixelEdit
  perfectPixelCommittedEdit?: PixelEdit
  perfectPixelStablePathLength?: number
  smoothStroke?: { visited: Set<number> }
  /** Coverage collected while creating a selection with the selection brush. */
  selectionBrushStroke?: { visited: Set<number> }
  liquifyCompound?: boolean
  liquifyMode?: LiquifyMode
  liquifySamplePoint?: CanvasPoint
  liquifyPushStroke?: LiquifyPushStroke
  tilemapEdit?: TilemapEdit
  tilemapCell?: TilemapCell | null
  tilemapCellIndex?: number
  tilemapEditCellIndex?: number
  tilemapEditSelection?: SelectionMask
  tilemapSelectionMoveSource?: TilemapSelectionMoveSource
  tilemapSelectionMoveDelta?: { columns: number; rows: number }
  freeTilePlacementEdit?: FreeTilePlacementEdit
  freeTileSourceId?: string
  freeTileInstanceId?: string
  freeTileInstanceStart?: CanvasPoint
  freeTileInstanceIds?: string[]
  freeTileInstanceStarts?: Record<string, CanvasPoint>
  freeTileInstanceSelectionMove?: boolean
  freeTileEditDocument?: SpriteDocument
  freeTileEditLayer?: RasterLayer
  freeTileSourceBefore?: FreeTileSourceEditSnapshot
  freeTileEditOrigin?: CanvasPoint
  freeTileEditSourceOffset?: CanvasPoint
  freeTileEditInstanceTransform?: FreeTileInstanceTransform
  freeTileEditTransformedSourceBounds?: SelectionRect
  freeTileEditSelection?: SelectionMask | null
  freeTileSelectionBounds?: SelectionRect
  freeTileSelectionTransform?: boolean
  freeTileSelectionSource?: SelectionMask
  freeTileSelectionPivotBefore?: CanvasPoint | null
  freeTileGradientPaintRegion?: SelectionMask | null
  freeTileLastLocal?: CanvasPoint
  freeTileLastStampOrigin?: CanvasPoint
  tileRepeatPoint?: CanvasPoint
  tileRepeatStart?: CanvasPoint
  selectionMode?: SelectionMode
  magicWorkerPending?: boolean
  magicRequest?: (point: { x: number; y: number }) => void
  magicRelease?: () => void
  magicPreviewRectangles?: Int32Array | null
  magicPreviewBitmap?: ImageBitmap | null
  magicRequestToken?: number
  magicCommitOnResolve?: boolean
  startPan?: CanvasPoint
  handle?: SelectionHandle
  shearHandle?: SelectionShearHandle
  shearAmount?: number
  angle?: number
  selectionSource?: SelectionTransformSource
  selectionLayers?: SelectionTransformLayerState[]
  selectionSourceCacheKey?: SelectionMask
  previewEdit?: PixelEdit | null
  copy?: boolean
  startClient?: CanvasPoint
  startBrushSize?: number
  startZoom?: number
  startRotation?: number
  startAngle?: number
  rotationPivot?: CanvasPoint
  patternOrigin?: CanvasPoint
  constrain?: boolean
  path?: CanvasStrokePoint[]
  pathRedo?: CanvasStrokePoint[]
  polygonPathRasterCache?: PolygonPathRasterCache
  isoAlignedStroke?: 'pencil' | 'eraser'
  isoAlignedDirection?: IsoLineDirection
  isoAlignedRawAnchor?: CanvasPoint
  isoAlignedRawEndpoint?: CanvasPoint
  isoAlignedGridVertex?: CanvasPoint
  isoAlignedDirectionSamples?: number
  isoGridStrokeEdges?: CanvasIsoGridStrokeEdge[]
  isoGridPointer?: CanvasPoint
  isoGridHoveredEdgeKey?: string | null
  curvePhase?: 'endpoint' | 'anchors'
  curveEnd?: CanvasPoint
  curveControls?: CanvasPoint[]
  curveAnchorIndex?: number
  curveAnchorCount?: number
  canvasEdge?: 'n' | 'e' | 's' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
  canvasPreview?: {
    width: number
    height: number
    offsetX: number
    offsetY: number
  }
  floatingPaste?: boolean
  floatingPasteSelectionBox?: boolean
  previewSelection?: SelectionMask | null
  appliedSelection?: SelectionMask | null
  previewTarget?: SelectionRect
  previewAngle?: number
  previewShear?: SelectionShearTransform
  /** Projective free-transform geometry. The rectangle fields remain the
   * conservative bounds used by legacy transform code and invalidation. */
  freeTransform?: boolean
  transformStartQuad?: SelectionQuad
  previewQuad?: SelectionQuad
  appliedPreviewTarget?: SelectionRect
  appliedPreviewAngle?: number
  appliedPreviewShear?: SelectionShearTransform
  appliedPreviewQuad?: SelectionQuad
  appliedPreviewPivot?: CanvasPoint
  selectionPivotStart?: CanvasPoint
  previewPivot?: CanvasPoint
  selectionPivotCustom?: boolean
  transformStartTarget?: SelectionRect
  transformStartShear?: SelectionShearTransform
  transformOffset?: CanvasPoint
  transformMoveStart?: { pointer: CanvasPoint; offset: CanvasPoint }
  drawingAnchor?: CanvasPoint
  drawingAnchorMove?: boolean
  canvasCenterSize?: { width: number; height: number }
  marqueeBounds?: SelectionRect
  marqueeAngle?: number
  marqueeModifierMode?: MarqueeModifierMode
  marqueeRotationStart?: {
    pointer: CanvasPoint
    lastPointer: CanvasPoint
    angle: number
    bounds: SelectionRect
  }
  marqueeResizeStart?: {
    pointer: CanvasPoint
    bounds: SelectionRect
    fromCenter: boolean
  }
  marqueeTemporaryCenterRestore?: MarqueeTemporaryCenterRestore
  marqueeDirection?: { x: -1 | 1; y: -1 | 1 }
  marqueePreviewSelection?: SelectionMask | null
  marqueeDisplaySelection?: SelectionMask | null
  quickSelectCell?: SelectionRect
  selectionCommitStart?: SelectionMask | null
  previewPending?: boolean
  selectionPreparationPending?: boolean
  deferredSelectionPreview?: boolean
  deferredSelectionRestoreTarget?: SelectionRect
  deferredSelectionRestoreAngle?: number
  deferredSelectionRestoreShear?: SelectionShearTransform
  deferredSelectionWasMaterialized?: boolean
  translationPreview?: SelectionTranslationPreview | null
  alignmentMovingBounds?: SelectionRect[]
  alignmentTargetBounds?: SelectionRect[]
  alignmentGuides?: AlignmentGuide[]
  alignmentGridEnabled?: boolean
  alignmentSnapToGridOrigin?: boolean
  alignmentSmartEnabled?: boolean
  alignmentThreshold?: number
  duplicateOnDrag?: boolean
  clickLayerId?: string
  sliceId?: string
  sliceStart?: SelectionRect
  sliceIds?: string[]
  sliceStarts?: Record<string, SelectionRect>
  slicePreviewTargets?: Record<string, SelectionRect>
  collapseSliceSelectionOnClick?: boolean
  collapseLayerSelectionOnClick?: boolean
  color?: RgbaColor
  colorReplacement?: { source: RgbaColor; target: RgbaColor }
  lastBrushSize?: number
  lastOpacityScale?: number
  lastBrushColor?: RgbaColor
  lastBrushGradientActive?: boolean
  preserveLineAnchorOnNoop?: boolean
  brushSpeed?: BrushSpeedState
  gradientEndColor?: RgbaColor
  gradientStops?: GradientStop[]
  gradientPaintRegion?: SelectionMask | null
  gradientFromCenter?: boolean
  gradientAngle?: number
  gradientRadialGeometry?: {
    center: CanvasPoint
    radiusX: number
    radiusY: number
  }
  gradientRotationStart?: {
    pointer: CanvasPoint
    angle: number
    geometry: { center: CanvasPoint; radiusX: number; radiusY: number }
  }
  axisLock?: 'x' | 'y'
  sampleSecondary?: boolean
  tileSampling?: boolean
  temporarySampling?: boolean
  sampledColor?: RgbaColor
  moved?: boolean
  startedAt?: number
  nextAirbrushAt?: number
  resumeDrag?: CanvasDragState
  /** Raw pointer endpoint retained while gradient geometry modifiers change. */
  rawLast?: CanvasPoint
}

export type MarqueeModifierMode = 'rotate' | 'resize'

export interface MarqueeTemporaryCenterRestore {
  bounds: SelectionRect
  direction?: { x: -1 | 1; y: -1 | 1 }
  fromCenter: boolean
}
