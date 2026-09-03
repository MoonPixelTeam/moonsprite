import type { AnimationCel, GradientStop, MoveKind, RasterLayer, RgbaColor, SelectionMask, SelectionMode, SelectionQuad, SelectionRect, ShapeRatio, SpriteDocument, TilemapCell, ToolId } from '@shared/types'
import { revertPixelEdit, type PixelEdit } from './history'
import { restoreSelectionTranslationPreview, type BrushGradientSample, type SelectionTransformLayerState, type SelectionTransformSource, type SelectionTranslationPreview } from './tools'
import { combineSelection, inverseSelectionQuadPoint, inverseTransformedSelectionPoint, rasterLinePoints, rectSelection, remapTransformedSelectionPoint, selectionBoundarySegments, selectionContains, selectionQuadBounds, selectionQuadFromRect, selectionQuadPoint, selectionQuadSourcePoint, selectionQuadTransformFor, transformedSelectionBounds, transformedSelectionControlPoints, transformedSelectionPivotPreset, type SelectionShearTransform } from './selection'
import { balancedStairLinePoints } from './pixel-line'
import { modifierShortcutHeld } from './shortcuts'
import type { TilemapEdit, TilemapSelectionMoveSource } from './tilemap'
import type { FreeTilePlacementEdit, FreeTileSourceEditSnapshot } from './free-tile-document'
import type { FreeTileInstanceTransform } from './free-tile'
import type { AlignmentGuide } from './alignment'
import type { IsoLineDirection } from './isometric'
import { POINTER_DEFAULT_PRESSURE, POINTER_PRESSURE_EPSILON, hasReliableBrushPressure, isPressurePointerType } from './pressure'

const selectionHitBoundaryCache = new WeakMap<SelectionMask, Int32Array>()

export const temporaryMoveToolAllowed = (tool: ToolId, moveKind: MoveKind = 'move'): boolean => tool !== 'selection'
  && tool !== 'shape'
  && (tool !== 'move' || moveKind !== 'move')

export const shouldUseTemporaryMoveTool = (
  tool: ToolId,
  event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>,
  shortcut: string,
  moveKind: MoveKind = 'move'
): boolean => temporaryMoveToolAllowed(tool, moveKind) && modifierShortcutHeld(event, shortcut)

export const brushLineConnectionOverridesTemporaryMove = (
  tool: ToolId,
  event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>,
  shortcut: string,
  hasAnchor: boolean
): boolean => hasAnchor
  && (tool === 'pencil' || tool === 'eraser')
  && modifierShortcutHeld(event, shortcut)

export const selectionInteractionOverridesTemporaryMove = (tool: ToolId, hit: SelectionHit, addingToSelection = false): boolean =>
  tool === 'selection' && (hit !== 'outside' || addingToSelection)

export const temporaryMoveForCanvasInteractionAllowed = (
  tool: ToolId,
  moveKind: MoveKind,
  hit: SelectionHit,
  addingToSelection = false
): boolean => temporaryMoveToolAllowed(tool, moveKind)
  && !selectionInteractionOverridesTemporaryMove(tool, hit, addingToSelection)

export const shouldUseTemporaryMoveForCanvasInteraction = (
  tool: ToolId,
  event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>,
  shortcut: string,
  moveKind: MoveKind,
  hit: SelectionHit,
  addingToSelection = false
): boolean => modifierShortcutHeld(event, shortcut)
  && temporaryMoveForCanvasInteractionAllowed(tool, moveKind, hit, addingToSelection)

export const temporaryMoveSuppressesToolPreview = (
  temporaryMoveActive: boolean,
  brushSizeAdjustmentPreviewActive = false
): boolean => temporaryMoveActive && !brushSizeAdjustmentPreviewActive

const cachedSelectionBoundarySegments = (selection: SelectionMask): Int32Array => {
  const cached = selectionHitBoundaryCache.get(selection)
  if (cached) return cached
  const segments = selectionBoundarySegments(selection)
  selectionHitBoundaryCache.set(selection, segments)
  return segments
}

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

export interface PointerClientPoint {
  clientX: number
  clientY: number
  pressure?: number
  pointerType?: string
  pressureAvailable?: boolean
  previousPressure?: number
  timeStamp?: number
}

export interface CoalescedPointerEvent extends PointerClientPoint {
  getCoalescedEvents?: () => PointerClientPoint[]
}

export interface CanvasPointerDeviceEvent {
  pointerId: number
  pointerType: string
  timeStamp: number
  pressure?: number
  buttons?: number
}

export const PEN_COMPATIBLE_MOUSE_SUPPRESSION_MS = 240

export interface AdaptedPointerPressure {
  pointerType: string
  pressure?: number
  previousPressure?: number
  pressureAvailable: boolean
}

interface PointerPressureStream {
  pointerType: string
  lastPressure?: number
  pressureAvailable: boolean
}

/**
 * Keeps device classification separate from pressure capability.  This is
 * important on Windows where some tablet stacks expose a stylus as a mouse:
 * the ordinary compatibility value (0.5) stays mouse input, while a stream
 * that emits an actual non-default/changing pressure value is promoted for
 * the rest of that pointer interaction.
 */
export class PointerPressureAdapter {
  private streams = new Map<number, PointerPressureStream>()

  adapt(event: Pick<CanvasPointerDeviceEvent, 'pointerId' | 'pointerType' | 'pressure' | 'buttons'>): AdaptedPointerPressure {
    const previous = this.streams.get(event.pointerId)
    const pointerType = event.pointerType?.trim() || previous?.pointerType || 'mouse'
    const pressure = Number.isFinite(event.pressure) ? Math.max(0, Math.min(1, event.pressure!)) : undefined
    const effectivePressure = pressure ?? previous?.lastPressure
    let pressureAvailable = previous?.pressureAvailable ?? false

    // A few WebView/tablet combinations expose the pen path but report a
    // missing/zero pressure sample (and sometimes even `buttons=0`) while the
    // tip is down. Some unsupported pen stacks instead repeat the browser's
    // compatibility value (0.5) for the whole stroke. Keep both cases on the
    // full-strength fallback until a non-default or changing sample proves
    // that its pressure axis is working. Once proven, later zero samples are
    // genuine light-pressure values and remain usable.
    const pressureChanged = previous?.lastPressure !== undefined
      && pressure !== undefined
      && Math.abs(pressure - previous.lastPressure) > POINTER_PRESSURE_EPSILON
    const pressureIsNonDefault = pressure !== undefined
      && pressure > 0
      && Math.abs(pressure - POINTER_DEFAULT_PRESSURE) > POINTER_PRESSURE_EPSILON
    if (isPressurePointerType(pointerType)) pressureAvailable = pressureAvailable || pressureChanged || pressureIsNonDefault
    else if (!pressureAvailable && hasReliableBrushPressure(pointerType, pressure, previous?.lastPressure)) pressureAvailable = true

    this.streams.set(event.pointerId, {
      pointerType,
      // Missing samples are common when a WebView drops a coalesced packet;
      // retain the last finite value so a later changing sample can still
      // prove the pressure axis.
      lastPressure: pressure ?? previous?.lastPressure,
      pressureAvailable
    })
    return {
      pointerType,
      // Reuse the last finite sample if this packet omitted pressure. This
      // avoids a one-frame full-strength jump after a dropped coalesced packet.
      ...(effectivePressure === undefined ? {} : { pressure: effectivePressure }),
      ...(previous?.lastPressure === undefined ? {} : { previousPressure: previous.lastPressure }),
      pressureAvailable
    }
  }

  release(pointerId: number): void {
    this.streams.delete(pointerId)
  }

  reset(): void {
    this.streams.clear()
  }

  isPressureCapable(pointerId: number): boolean {
    return this.streams.get(pointerId)?.pressureAvailable ?? false
  }
}

export const coalescedPointerClientPoints = (event: CoalescedPointerEvent): PointerClientPoint[] => {
  let coalesced: PointerClientPoint[] = []
  try {
    coalesced = event.getCoalescedEvents?.() ?? []
  } catch {
    coalesced = []
  }
  const points: PointerClientPoint[] = []
  const append = (point: PointerClientPoint): void => {
    if (!Number.isFinite(point.clientX) || !Number.isFinite(point.clientY)) return
    const pressure = Number.isFinite(point.pressure) ? point.pressure : undefined
    const pointerType = typeof point.pointerType === 'string' ? point.pointerType : undefined
    const timeStamp = Number.isFinite(point.timeStamp) ? point.timeStamp : undefined
    const previous = points.at(-1)
    if (previous?.clientX === point.clientX
      && previous.clientY === point.clientY
      && previous.pressure === pressure
      && previous.pointerType === pointerType
      && previous.timeStamp === timeStamp) return
    points.push({
      clientX: point.clientX,
      clientY: point.clientY,
      ...(pressure === undefined ? {} : { pressure }),
      ...(pointerType === undefined ? {} : { pointerType }),
      ...(timeStamp === undefined ? {} : { timeStamp })
    })
  }
  for (const point of coalesced) append(point)
  append(event)
  return points
}

export interface BrushSpeedState {
  clientX: number
  clientY: number
  timeStamp: number
  speed: number
}

export const BRUSH_SPEED_EMA_TIME_CONSTANT_MS = 55
export const BRUSH_SPEED_STOP_MS = 160
export const BRUSH_SPEED_LIMIT = 4000

export const beginBrushSpeedTracking = (sample: PointerClientPoint): BrushSpeedState | undefined =>
  Number.isFinite(sample.clientX) && Number.isFinite(sample.clientY) && Number.isFinite(sample.timeStamp)
    ? { clientX: sample.clientX, clientY: sample.clientY, timeStamp: sample.timeStamp!, speed: 0 }
    : undefined

export function updateBrushSpeedTracking(
  previous: BrushSpeedState | undefined,
  sample: PointerClientPoint
): { state: BrushSpeedState | undefined; speed: number } {
  const initial = beginBrushSpeedTracking(sample)
  if (!initial) return { state: previous, speed: previous?.speed ?? 0 }
  if (!previous) return { state: initial, speed: 0 }
  const elapsed = initial.timeStamp - previous.timeStamp
  if (elapsed <= 0) return { state: previous, speed: previous.speed }
  if (elapsed >= BRUSH_SPEED_STOP_MS) return { state: { ...initial, speed: 0 }, speed: 0 }
  const distance = Math.hypot(initial.clientX - previous.clientX, initial.clientY - previous.clientY)
  const instantaneous = Math.min(BRUSH_SPEED_LIMIT, distance * 1000 / elapsed)
  const alpha = 1 - Math.exp(-elapsed / BRUSH_SPEED_EMA_TIME_CONSTANT_MS)
  const speed = Math.min(BRUSH_SPEED_LIMIT, previous.speed + (instantaneous - previous.speed) * alpha)
  return { state: { ...initial, speed }, speed }
}

export type SelectionHandle = 'nw' | 'n' | 'ne' | 'w' | 'e' | 'sw' | 's' | 'se'
export type SelectionRotationHandle = 'rotate-ne' | 'rotate-se' | 'rotate-sw' | 'rotate-nw'
export type SelectionShearHandle = 'shear-n' | 'shear-e' | 'shear-s' | 'shear-w'
export type SelectionHit = 'inside' | 'edge' | 'outside' | SelectionRotationHandle | SelectionShearHandle | SelectionHandle
export const SELECTION_RESIZE_HIT_RADIUS = 12
export const SELECTION_CORNER_RESIZE_HIT_RADIUS = 18
export const SELECTION_CORNER_OUTWARD_RESIZE_HIT_RADIUS = 5
export const SELECTION_PIVOT_HIT_RADIUS = 10

export const selectionPivotHit = (
  pivot: CanvasPoint,
  point: CanvasPoint,
  radius = SELECTION_PIVOT_HIT_RADIUS
): boolean => Math.abs(point.x - pivot.x) <= radius && Math.abs(point.y - pivot.y) <= radius

const roundedDocumentPixelDelta = (value: number): number => Math.sign(value) * Math.round(Math.abs(value))

export const selectionPivotAtDragPoint = (
  pivotStart: CanvasPoint,
  pointerStart: CanvasPoint,
  pointer: CanvasPoint
): CanvasPoint => ({
  x: pivotStart.x + roundedDocumentPixelDelta(pointer.x - pointerStart.x),
  y: pivotStart.y + roundedDocumentPixelDelta(pointer.y - pointerStart.y)
})

export const selectionPivotAfterResize = (
  sourceTarget: SelectionRect,
  destinationTarget: SelectionRect,
  pivot: CanvasPoint,
  options: { angle?: number; shear?: SelectionShearTransform; fromCenter?: boolean; custom?: boolean } = {}
): CanvasPoint => {
  const angle = options.angle ?? 0
  if (options.fromCenter) return { ...pivot }
  return options.custom
    ? remapTransformedSelectionPoint(sourceTarget, destinationTarget, pivot, angle, options.shear)
    : transformedSelectionPivotPreset(destinationTarget, 'center', angle, options.shear)
}

export const selectionResizeHit = (
  box: { x: number; y: number; width: number; height: number },
  point: CanvasPoint,
  radius: number,
  cornerRadius = radius,
  outwardCornerRadius = cornerRadius
): SelectionHandle | null => {
  const left = box.x
  const right = box.x + box.width
  const top = box.y
  const bottom = box.y + box.height
  const centerX = box.x + box.width / 2
  const centerY = box.y + box.height / 2
  const nearCorner = (handle: SelectionHandle, x: number, y: number): boolean => {
    const inOuterQuadrant = handle === 'nw'
      ? point.x <= x && point.y <= y
      : handle === 'ne'
        ? point.x >= x && point.y <= y
        : handle === 'se'
          ? point.x >= x && point.y >= y
          : point.x <= x && point.y >= y
    const hitRadius = inOuterQuadrant ? outwardCornerRadius : cornerRadius
    return Math.abs(point.x - x) <= hitRadius && Math.abs(point.y - y) <= hitRadius
  }

  // 角点优先。边中段会明确避开两个角点，避免缩放与旋转命中区重叠。
  const corners: Array<[SelectionHandle, number, number]> = [
    ['nw', left, top], ['ne', right, top], ['sw', left, bottom], ['se', right, bottom]
  ]
  for (const [handle, x, y] of corners) if (nearCorner(handle, x, y)) return handle

  // 边缩放只命中四个可见中点，不得让整条边都变成缩放区。
  const candidates: Array<[SelectionHandle, number, number]> = [
    ['n', centerX, top], ['s', centerX, bottom], ['w', left, centerY], ['e', right, centerY]
  ]
  let nearest: SelectionHandle | null = null
  let nearestDistance = Number.POSITIVE_INFINITY
  for (const [handle, x, y] of candidates) {
    if (Math.abs(point.x - x) > radius || Math.abs(point.y - y) > radius) continue
    const distance = (point.x - x) ** 2 + (point.y - y) ** 2
    if (distance < nearestDistance) {
      nearest = handle
      nearestDistance = distance
    }
  }
  return nearest
}

export interface CanvasDragState {
  kind: 'draw' | 'tile-draw' | 'free-tile-draw' | 'free-tile-edit' | 'free-tile-instance-move' | 'airbrush' | 'shape' | 'freeform-shape' | 'polygon-shape' | 'line-shape' | 'curve-shape' | 'gradient' | 'marquee' | 'lasso' | 'polygon-lasso' | 'magic-preview' | 'sample-color' | 'move-content' | 'move-selection' | 'move-selection-pivot' | 'transform-content' | 'rotate-content' | 'shear-content' | 'move-layer' | 'create-text-box' | 'transform-text-box' | 'create-slice' | 'move-slice' | 'resize-slice' | 'brush-size' | 'canvas-resize' | 'canvas-move' | 'zoom-drag' | 'rotate-view' | 'pan'
  start: CanvasPoint
  last: CanvasPoint
  edit?: PixelEdit
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
  selectionStart?: SelectionMask | null
  selectionMode?: SelectionMode
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
  canvasPreview?: { width: number; height: number; offsetX: number; offsetY: number }
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
  marqueeBounds?: SelectionRect
  marqueeAngle?: number
  marqueeModifierMode?: MarqueeModifierMode
  marqueeRotationStart?: { pointer: CanvasPoint; lastPointer: CanvasPoint; angle: number; bounds: SelectionRect }
  marqueeResizeStart?: { pointer: CanvasPoint; bounds: SelectionRect; fromCenter: boolean }
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
  layerId?: string
  layerOffset?: CanvasPoint
  layerIds?: string[]
  layerOffsets?: Record<string, CanvasPoint>
  layerContentBounds?: Record<string, SelectionRect | null>
  layerPreviewOffset?: CanvasPoint
  animationMaskOffsets?: Record<string, CanvasPoint>
  alignmentMovingBounds?: SelectionRect[]
  alignmentTargetBounds?: SelectionRect[]
  alignmentGuides?: AlignmentGuide[]
  alignmentGridEnabled?: boolean
  alignmentSmartEnabled?: boolean
  alignmentThreshold?: number
  layerFrameId?: string
  animationCellKeys?: string[]
  animationCellOffsets?: Record<string, CanvasPoint>
  duplicateOnDrag?: boolean
  duplicatedLayerId?: string
  duplicatedLayer?: RasterLayer
  duplicatedAnimationCels?: AnimationCel[]
  duplicatedLayerIndex?: number
  originalSelectedLayerIds?: string[]
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
  brushSpeed?: BrushSpeedState
  gradientEndColor?: RgbaColor
  gradientStops?: GradientStop[]
  gradientPaintRegion?: SelectionMask | null
  gradientFromCenter?: boolean
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

export const sampledForegroundColorToAdd = (drag: Pick<CanvasDragState, 'kind' | 'sampleSecondary' | 'sampledColor'>, shortcutHeld: boolean): RgbaColor | null =>
  shortcutHeld && drag.kind === 'sample-color' && !drag.sampleSecondary && drag.sampledColor ? { ...drag.sampledColor } : null

export const paletteSamplingShortcutStartsPrimarySample = (shortcutHeld: boolean, button: number): boolean =>
  shortcutHeld && button === 0

export interface CachedSelectionTransformSource {
  document: SpriteDocument
  contentRevision: number
  layerId: string
  selection: SelectionMask
  source: SelectionTransformSource
}

export const cachedSelectionTransformSource = (
  cached: CachedSelectionTransformSource | null | undefined,
  document: SpriteDocument,
  contentRevision: number,
  layerId: string,
  selection: SelectionMask | null | undefined
): SelectionTransformSource | null => cached
  && cached.document === document
  && cached.contentRevision === contentRevision
  && cached.layerId === layerId
  && cached.selection === selection
  ? cached.source
  : null

export const deferredSelectionCommitInvalidationRects = (
  drag: Pick<CanvasDragState, 'selectionSource' | 'selectionStart' | 'previewSelection'>
): SelectionRect[] => [
  drag.selectionSource?.selection,
  drag.selectionStart,
  drag.previewSelection
].filter((selection): selection is SelectionRect => Boolean(selection))

export const selectionTransformGeometrySource = (
  drag: Pick<CanvasDragState, 'freeTileSelectionTransform' | 'freeTileSelectionSource' | 'selectionSource' | 'selectionStart'>
): SelectionMask | null => {
  if (drag.freeTileSelectionTransform) return drag.freeTileSelectionSource ?? drag.selectionStart ?? null
  const source = drag.selectionSource?.selection
  if (!source) return drag.selectionStart ?? null
  return drag.selectionSource?.origin === 'clipboard'
    ? { x: source.x, y: source.y, width: source.width, height: source.height }
    : source
}

export type MarqueeModifierMode = 'rotate' | 'resize'

export interface MarqueeTemporaryCenterRestore {
  bounds: SelectionRect
  direction?: { x: -1 | 1; y: -1 | 1 }
  fromCenter: boolean
}

export const resolveMarqueeModifierMode = (
  modifiers: { fromCenter: boolean; rotate: boolean },
  preferredMode?: MarqueeModifierMode
): MarqueeModifierMode | null => {
  if (preferredMode === 'rotate' && modifiers.rotate) return 'rotate'
  if (preferredMode === 'resize' && modifiers.fromCenter) return 'resize'
  if (modifiers.rotate) return 'rotate'
  if (modifiers.fromCenter) return 'resize'
  return null
}

export const revertCancelledCanvasDragPixelChanges = (document: SpriteDocument, drag: CanvasDragState): boolean => {
  if (drag.floatingPaste) return false
  if (drag.translationPreview) {
    const changed = drag.translationPreview.count > 0
    restoreSelectionTranslationPreview(document, drag.translationPreview)
    return changed
  }
  const edit = drag.kind === 'draw' || drag.kind === 'airbrush' ? drag.edit : drag.previewEdit
  if (!edit) return false
  const changed = edit.before.size > 0 || Boolean(edit.runs?.length)
  revertPixelEdit(document, edit)
  return changed
}

export const selectionGestureMoved = (start: CanvasPoint | undefined, end: CanvasPoint, threshold = 3): boolean =>
  Boolean(start && (Math.abs(end.x - start.x) > threshold || Math.abs(end.y - start.y) > threshold))

const selectionCreationKinds = new Set<CanvasDragState['kind']>(['marquee', 'lasso', 'polygon-lasso'])
const selectionPreviewKinds = new Set<CanvasDragState['kind']>(['magic-preview', 'move-selection', 'move-content', 'transform-content', 'rotate-content', 'shear-content'])
const selectionContentTransformKinds = new Set<CanvasDragState['kind']>(['move-content', 'transform-content', 'rotate-content', 'shear-content'])

export type SelectionContentTransformKind = 'move-content' | 'transform-content' | 'rotate-content' | 'shear-content'

export const selectionTransformDeferredPreviewEnabled = (
  kind: SelectionContentTransformKind,
  supported: boolean,
  angle = 0,
  shear?: SelectionShearTransform
): boolean => supported && (kind !== 'transform-content' || (angle % 360 === 0 && !shear))

export const deferredSelectionPreviewMaterializationRequired = (
  simpleTranslation: boolean,
  floatingPaste: boolean,
  sourceOrigin?: SelectionTransformSource['origin']
): boolean => !simpleTranslation && !(floatingPaste && sourceOrigin === 'clipboard')

export const deferredSelectionPreviewOwner = (
  drag: Pick<CanvasDragState, 'kind' | 'selectionPreparationPending' | 'deferredSelectionPreview' | 'selectionSource' | 'previewTarget'> | null | undefined,
  pendingDeferred: boolean
): 'active' | 'pending' | null => {
  if (!drag || !selectionContentTransformKinds.has(drag.kind) || drag.selectionPreparationPending) return pendingDeferred ? 'pending' : null
  return drag.deferredSelectionPreview && drag.selectionSource && drag.previewTarget ? 'active' : null
}

export const canvasGestureForPreview = (drag: CanvasDragState | null | undefined): CanvasDragState | null =>
  drag?.kind === 'pan' && drag.resumeDrag?.kind === 'polygon-lasso' ? drag.resumeDrag : drag ?? null

export const marqueePreviewTargetForDrag = (drag: CanvasDragState | null | undefined): SelectionRect | null => {
  const previewDrag = canvasGestureForPreview(drag)
  return previewDrag?.kind === 'marquee' && (previewDrag.moved || previewDrag.quickSelectCell)
    ? previewDrag.previewTarget ?? previewDrag.marqueeBounds ?? null
    : null
}

/** Returns the current geometry used by the canvas size readout while a
 * rectangle/ellipse, line, or curve is being drawn. */
export const drawingSizePreviewTargetForDrag = (
  drag: CanvasDragState | null | undefined,
  shapeRatio: ShapeRatio | null = null
): SelectionRect | null => {
  const previewDrag = canvasGestureForPreview(drag)
  if (!previewDrag) return null
  if (previewDrag.kind === 'marquee') return marqueePreviewTargetForDrag(previewDrag)
  if (previewDrag.kind === 'shape') {
    const hasMoved = previewDrag.start.x !== previewDrag.last.x || previewDrag.start.y !== previewDrag.last.y
    if (!previewDrag.previewTarget && !hasMoved) return null
    return previewDrag.previewTarget ?? shapeBounds(previewDrag.start, previewDrag.last, previewDrag.constrain, shapeRatio)
  }
  if (previewDrag.kind === 'line-shape') {
    if (previewDrag.start.x === previewDrag.last.x && previewDrag.start.y === previewDrag.last.y) return null
    return shapeBounds(previewDrag.start, previewDrag.last)
  }
  if (previewDrag.kind === 'curve-shape') {
    const end = previewDrag.curveEnd ?? previewDrag.last
    if (!previewDrag.curveEnd && previewDrag.start.x === end.x && previewDrag.start.y === end.y) return null
    return shapeBounds(previewDrag.start, end)
  }
  return null
}

export const selectionOverlayMaskForDrag = (
  currentSelection: SelectionMask | null,
  drag: CanvasDragState | null | undefined
): SelectionMask | null => {
  const previewDrag = canvasGestureForPreview(drag)
  if (!previewDrag) return currentSelection
  if (previewDrag.kind === 'marquee' && previewDrag.quickSelectCell) return null
  if (selectionCreationKinds.has(previewDrag.kind)) return previewDrag.selectionStart ?? null
  if (selectionPreviewKinds.has(previewDrag.kind)) return previewDrag.previewSelection ?? currentSelection
  return currentSelection
}

export interface SelectionOverlayFrame {
  selection: SelectionMask | null
  target?: SelectionRect
  angle: number
  shear?: SelectionShearTransform
  quad?: SelectionQuad
  pivot?: CanvasPoint
}

/** Keeps Free Tile pixels and transform chrome on the same applied preview update. */
export const selectionOverlayFrameForDrag = (
  currentSelection: SelectionMask | null,
  drag: CanvasDragState | null | undefined
): SelectionOverlayFrame => {
  const previewDrag = canvasGestureForPreview(drag)
  const transformed = previewDrag && selectionContentTransformKinds.has(previewDrag.kind) ? previewDrag : null
  const useAppliedFreeTileFrame = Boolean(
    transformed?.freeTileSelectionTransform
    && transformed.appliedPreviewTarget
  )
  return {
    selection: useAppliedFreeTileFrame
      ? transformed?.appliedSelection === undefined ? currentSelection : transformed.appliedSelection
      : selectionOverlayMaskForDrag(currentSelection, previewDrag),
    target: transformed
      ? useAppliedFreeTileFrame
        ? transformed.appliedPreviewTarget
        : transformed.previewTarget ?? transformed.transformStartTarget ?? transformed.selectionStart ?? undefined
      : undefined,
    angle: transformed
      ? useAppliedFreeTileFrame
        ? transformed.appliedPreviewAngle ?? transformed.previewAngle ?? transformed.startAngle ?? 0
        : transformed.previewAngle ?? transformed.startAngle ?? 0
      : 0,
    shear: transformed
      ? useAppliedFreeTileFrame
        ? transformed.appliedPreviewShear
        : transformed.previewShear ?? transformed.transformStartShear
      : undefined,
    quad: transformed
      ? useAppliedFreeTileFrame
        ? transformed.appliedPreviewQuad
        : transformed.previewQuad ?? transformed.transformStartQuad
      : undefined,
    pivot: previewDrag
      ? useAppliedFreeTileFrame
        ? transformed?.appliedPreviewPivot
        : previewDrag.previewPivot
      : undefined
  }
}

export const createCanvasPanDrag = (
  startPan: CanvasPoint,
  startClient: CanvasPoint,
  resumeDrag?: CanvasDragState
): CanvasDragState => ({
  kind: 'pan',
  start: { x: 0, y: 0 },
  last: { x: 0, y: 0 },
  startPan: { ...startPan },
  startClient: { ...startClient },
  resumeDrag: resumeDrag?.kind === 'polygon-lasso' ? resumeDrag : undefined
})

export const viewDragClientDelta = (
  currentClient: CanvasPoint,
  startClient: CanvasPoint,
  sensitivity = 1
): CanvasPoint => {
  const scale = Number.isFinite(sensitivity) && sensitivity > 0 ? sensitivity : 1
  return {
    x: (currentClient.x - startClient.x) * scale,
    y: (currentClient.y - startClient.y) * scale
  }
}

export const restoreCanvasDragAfterPan = (
  panDrag: CanvasDragState,
  pointer: CanvasPoint
): CanvasDragState | null => panDrag.kind === 'pan' && panDrag.resumeDrag?.kind === 'polygon-lasso'
  ? { ...panDrag.resumeDrag, last: { ...pointer } }
  : null

export const appendPolygonLassoVertex = (path: readonly CanvasPoint[], point: CanvasPoint): CanvasPoint[] => {
  const last = path.at(-1)
  return last?.x === point.x && last.y === point.y ? [...path] : [...path, { ...point }]
}

const PENDING_CANVAS_PATH_KINDS = new Set<CanvasDragState['kind']>(['freeform-shape', 'polygon-shape', 'lasso', 'polygon-lasso'])

export const isPendingCanvasPathGesture = (drag: CanvasDragState | null | undefined): drag is CanvasDragState =>
  Boolean(drag && PENDING_CANVAS_PATH_KINDS.has(drag.kind))

export const appendCanvasPathStep = (drag: CanvasDragState, point: CanvasStrokePoint): boolean => {
  if (!isPendingCanvasPathGesture(drag)) return false
  const path = drag.path ?? []
  const last = path.at(-1)
  if (last?.x === point.x && last.y === point.y) return false
  if (drag.kind === 'polygon-lasso' || drag.kind === 'polygon-shape') {
    path.push({ ...point })
    drag.path = path
  } else drag.path = [...path, { ...point }]
  drag.pathRedo = undefined
  return true
}

export const undoCanvasPathStep = (drag: CanvasDragState | null | undefined): boolean => {
  if (!isPendingCanvasPathGesture(drag)) return false
  const path = drag.path ?? []
  const point = path.at(-1)
  if (!point) return false
  drag.path = path.slice(0, -1)
  drag.pathRedo = [...(drag.pathRedo ?? []), { ...point }]
  return true
}

export const redoCanvasPathStep = (drag: CanvasDragState | null | undefined): boolean => {
  if (!isPendingCanvasPathGesture(drag)) return false
  const redo = drag.pathRedo ?? []
  const point = redo.at(-1)
  if (!point) return false
  drag.path = [...(drag.path ?? []), { ...point }]
  drag.pathRedo = redo.length > 1 ? redo.slice(0, -1) : undefined
  return true
}

export interface PendingCanvasGestureHistoryController {
  undo(): boolean
  redo(): boolean
}

const pendingCanvasGestureHistory = new Map<string, PendingCanvasGestureHistoryController>()

export const registerPendingCanvasGestureHistory = (
  documentId: string,
  controller: PendingCanvasGestureHistoryController
): (() => void) => {
  pendingCanvasGestureHistory.set(documentId, controller)
  return () => {
    if (pendingCanvasGestureHistory.get(documentId) === controller) pendingCanvasGestureHistory.delete(documentId)
  }
}

export const consumePendingCanvasGestureHistory = (documentId: string, direction: 'undo' | 'redo'): boolean =>
  pendingCanvasGestureHistory.get(documentId)?.[direction]() ?? false

export const shouldClosePolygonLasso = (path: readonly CanvasPoint[], point: CanvasPoint, clickCount: number): boolean =>
  path.length >= 3 && (clickCount >= 2 || (path[0].x === point.x && path[0].y === point.y))

export interface PolygonPathRasterCache {
  balanced: boolean
  sourcePath: readonly CanvasPoint[]
  sourcePathLength: number
  committedPoints: CanvasPoint[]
  previewPoints: CanvasPoint[]
}

export const createPolygonPathRasterCache = (): PolygonPathRasterCache => ({
  balanced: false,
  sourcePath: [],
  sourcePathLength: 0,
  committedPoints: [],
  previewPoints: []
})

const appendPolygonLinePoints = (
  output: CanvasPoint[],
  from: CanvasPoint,
  to: CanvasPoint,
  balanced: boolean
): void => {
  output.push(...(balanced ? balancedStairLinePoints(from, to) : rasterLinePoints(from, to)))
}

const preparePolygonPathRasterCache = (
  path: readonly CanvasPoint[],
  balanced: boolean,
  cache: PolygonPathRasterCache
): void => {
  if (cache.sourcePath === path && cache.sourcePathLength === path.length && cache.balanced === balanced) return
  const previousPath = cache.sourcePath
  const previousPathLength = cache.sourcePathLength
  const canAppend = cache.balanced === balanced
    && previousPathLength > 0
    && path.length === previousPathLength + 1
    && path[0] === previousPath[0]
    && path[previousPathLength - 1] === previousPath[previousPathLength - 1]
  if (canAppend) {
    const previousPointCount = cache.committedPoints.length
    appendPolygonLinePoints(cache.committedPoints, path[path.length - 2], path[path.length - 1], balanced)
    cache.previewPoints.length = previousPointCount
    for (let index = previousPointCount; index < cache.committedPoints.length; index += 1) cache.previewPoints.push(cache.committedPoints[index])
  }
  else {
    cache.committedPoints.length = 0
    for (let index = 1; index < path.length; index += 1) appendPolygonLinePoints(cache.committedPoints, path[index - 1], path[index], balanced)
    cache.previewPoints.length = 0
    for (const point of cache.committedPoints) cache.previewPoints.push(point)
  }
  cache.sourcePath = path
  cache.sourcePathLength = path.length
  cache.balanced = balanced
}

export const polygonLassoPreviewPoints = (
  path: readonly CanvasPoint[],
  pointer: CanvasPoint,
  closePreview: boolean,
  balanced = false,
  cache?: PolygonPathRasterCache
): CanvasPoint[] => {
  if (path.length === 0) return []
  if (cache) {
    preparePolygonPathRasterCache(path, balanced, cache)
    const points = cache.previewPoints
    points.length = cache.committedPoints.length
    appendPolygonLinePoints(points, path.at(-1)!, pointer, balanced)
    if (closePreview && path.length > 1) appendPolygonLinePoints(points, pointer, path[0], balanced)
    return points
  }
  const linePoints = balanced ? balancedStairLinePoints : rasterLinePoints
  const points: CanvasPoint[] = []
  for (let index = 1; index < path.length; index += 1) points.push(...linePoints(path[index - 1], path[index]))
  points.push(...linePoints(path.at(-1)!, pointer))
  if (closePreview && path.length > 1) points.push(...linePoints(pointer, path[0]))
  return points
}

export const polygonLassoClosedPathPoints = (path: readonly CanvasPoint[], balanced = false, cache?: PolygonPathRasterCache): CanvasPoint[] => {
  if (path.length < 2) return path.map((point) => ({ ...point }))
  if (cache) {
    preparePolygonPathRasterCache(path, balanced, cache)
    const points = cache.previewPoints
    points.length = cache.committedPoints.length
    appendPolygonLinePoints(points, path.at(-1)!, path[0], balanced)
    return points
  }
  const linePoints = balanced ? balancedStairLinePoints : rasterLinePoints
  const points: CanvasPoint[] = []
  for (let index = 1; index < path.length; index += 1) points.push(...linePoints(path[index - 1], path[index]))
  points.push(...linePoints(path.at(-1)!, path[0]))
  return points
}

export const shouldRestartFloatingSelectionForCopy = (_floatingCopy: boolean, copyRequested: boolean): boolean =>
  copyRequested

export const shouldReuseFloatingSelectionSourceForCopy = (
  sourceOrigin: SelectionTransformSource['origin'],
  copyRequested: boolean,
  selectionMatchesTarget: boolean,
  hasCompositeSource: boolean
): boolean => (sourceOrigin === 'clipboard' || sourceOrigin === 'selection')
  && copyRequested
  && selectionMatchesTarget
  && !hasCompositeSource

export const floatingSelectionCopyMode = (floatingCopy: boolean | null, copyRequested: boolean): boolean =>
  floatingCopy ?? copyRequested

export const finalizeMarqueeSelection = (
  before: SelectionMask | null,
  preview: SelectionMask | null,
  moved: boolean,
  mode: SelectionMode
): SelectionMask | null => moved ? preview : mode === 'replace' ? null : before

export const quickSelectCellSelection = (
  before: SelectionMask | null,
  cell: SelectionRect,
  mode: SelectionMode
): SelectionMask | null => combineSelection(before, rectSelection(cell.x, cell.y, cell.width, cell.height), mode)

export const quickSelectCellDragBounds = (
  startCell: SelectionRect,
  currentCell: SelectionRect
): SelectionRect => {
  const x = Math.min(startCell.x, currentCell.x)
  const y = Math.min(startCell.y, currentCell.y)
  const right = Math.max(startCell.x + startCell.width, currentCell.x + currentCell.width)
  const bottom = Math.max(startCell.y + startCell.height, currentCell.y + currentCell.height)
  return { x, y, width: right - x, height: bottom - y }
}

export interface QuickSelectionPress {
  clientX: number
  clientY: number
  pointerId: number
  timeStamp: number
}

export const isQuickSelectionSecondPress = (
  previous: QuickSelectionPress | null | undefined,
  current: QuickSelectionPress,
  eventDetail: number
): boolean => {
  if (eventDetail >= 2) return true
  if (!previous || previous.pointerId !== current.pointerId) return false
  const elapsed = current.timeStamp - previous.timeStamp
  if (elapsed < 0 || elapsed > 500) return false
  const distanceX = current.clientX - previous.clientX
  const distanceY = current.clientY - previous.clientY
  return distanceX * distanceX + distanceY * distanceY <= 36
}

export const marqueeSelectionCommit = (
  drag: Pick<CanvasDragState, 'selectionStart' | 'selectionMode' | 'previewSelection' | 'quickSelectCell' | 'selectionCommitStart'>,
  currentSelection: SelectionMask | null,
  moved: boolean,
  fallbackMode: SelectionMode
): { before: SelectionMask | null; after: SelectionMask | null } => {
  if (drag.quickSelectCell) {
    return {
      before: drag.selectionCommitStart ?? null,
      after: drag.previewSelection ?? drag.selectionStart ?? null
    }
  }
  const before = drag.selectionStart ?? null
  return {
    before,
    after: finalizeMarqueeSelection(before, drag.previewSelection ?? currentSelection, moved, drag.selectionMode ?? fallbackMode)
  }
}

export interface CanvasPointerState {
  point: CanvasPoint
  clientX: number
  clientY: number
  ctrlKey: boolean
  altKey: boolean
  visible: boolean
}

const EMPTY_POINTER: CanvasPointerState = {
  point: { x: 0, y: 0 },
  clientX: 0,
  clientY: 0,
  ctrlKey: false,
  altKey: false,
  visible: false
}

export class CanvasInputState {
  drag: CanvasDragState | null = null
  pointer: CanvasPointerState = { ...EMPTY_POINTER, point: { ...EMPTY_POINTER.point } }
  sampling = false
  altHeld = false
  ctrlHeld = false
  shiftHeld = false
  spaceHeld = false
  shiftLinePreview = false
  modifierBrushSize: { x: number; y: number; size: number } | null = null
  private penPointerId: number | null = null
  private lastPenPointerTime = Number.NEGATIVE_INFINITY
  private pressurePointerIds = new Set<number>()

  acceptPointerDeviceEvent(event: CanvasPointerDeviceEvent, forceMouseTakeover = false): boolean {
    const pointerType = event.pointerType || 'mouse'
    // Some Windows tablet stacks expose the stylus as a mouse in WebView.
    // Treat a proven pressure-bearing stream like a pen for compatibility
    // mouse suppression, but never promote the browser's ordinary 0.5 mouse
    // value here (hasReliableBrushPressure rejects it without a prior change).
    const pressurePointer = this.pressurePointerIds.has(event.pointerId)
      || isPressurePointerType(pointerType)
      || hasReliableBrushPressure(pointerType, event.pressure)
    if (pressurePointer) {
      this.pressurePointerIds.add(event.pointerId)
      this.penPointerId = event.pointerId
      this.lastPenPointerTime = Number.isFinite(event.timeStamp) ? event.timeStamp : this.lastPenPointerTime
      return true
    }
    if (pointerType !== 'mouse') {
      this.penPointerId = null
      return true
    }
    if (this.penPointerId === null) return true
    const elapsed = event.timeStamp - this.lastPenPointerTime
    const followsPen = !Number.isFinite(elapsed) || elapsed < 0 || elapsed <= PEN_COMPATIBLE_MOUSE_SUPPRESSION_MS
    if (!forceMouseTakeover && followsPen) return false
    this.penPointerId = null
    return true
  }

  releasePointerDeviceEvent(event: Pick<CanvasPointerDeviceEvent, 'pointerId' | 'pointerType'>): void {
    this.pressurePointerIds.delete(event.pointerId)
    if (event.pointerId === this.penPointerId) {
      this.penPointerId = null
      this.lastPenPointerTime = Number.NEGATIVE_INFINITY
    }
  }

  /**
   * Clears device ownership after a lost pointer, window blur, or document
   * switch. Pointer Events do not guarantee a matching cancel/up event in
   * those cases, so a later pointerId reuse must start a fresh session.
   */
  resetPointerDeviceState(): void {
    this.pressurePointerIds.clear()
    this.penPointerId = null
    this.lastPenPointerTime = Number.NEGATIVE_INFINITY
  }

  penPointerIsActive(): boolean {
    return this.penPointerId !== null
  }

  begin(drag: CanvasDragState): CanvasDragState {
    this.drag = drag
    return drag
  }

  finish(): CanvasDragState | null {
    const drag = this.drag
    this.drag = null
    return drag
  }

  updatePointer(pointer: Omit<CanvasPointerState, 'visible'>): void {
    this.pointer = { ...pointer, point: { ...pointer.point }, visible: true }
  }

  clearPointer(): void {
    this.pointer.visible = false
  }

  resetPointerInteraction(): void {
    this.sampling = false
    this.shiftLinePreview = false
    this.modifierBrushSize = null
  }

  resetInteraction(): CanvasDragState | null {
    const drag = this.finish()
    this.pointer.visible = false
    this.sampling = false
    this.altHeld = false
    this.ctrlHeld = false
    this.shiftHeld = false
    this.spaceHeld = false
    this.shiftLinePreview = false
    this.modifierBrushSize = null
    return drag
  }

  syncModifierKeys(event: Pick<PointerEvent, 'altKey' | 'ctrlKey' | 'shiftKey'>, releaseOnly = false): void {
    if (releaseOnly) {
      this.altHeld = this.altHeld && event.altKey
      this.ctrlHeld = this.ctrlHeld && event.ctrlKey
      this.shiftHeld = this.shiftHeld && event.shiftKey
      return
    }
    this.altHeld = event.altKey
    this.ctrlHeld = event.ctrlKey
    this.shiftHeld = event.shiftKey
  }
}

export const undoActiveCanvasPathGesture = (input: CanvasInputState): boolean => {
  const drag = input.drag
  if (!isPendingCanvasPathGesture(drag)) return false
  const changed = undoCanvasPathStep(drag)
  if (!changed || (drag.path?.length ?? 0) === 0) input.finish()
  return true
}

export const clampCanvasZoom = (zoom: number): number => Math.max(0.0625, Math.min(64, zoom))

export const CANVAS_ZOOM_LEVELS = [0.0625, 0.083333, 0.125, 0.166667, 0.25, 0.333333, 0.5, 0.666667, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32, 48, 64] as const

export const steppedCanvasZoom = (zoom: number, zoomIn: boolean): number => {
  const epsilon = 0.000001
  if (zoomIn) return CANVAS_ZOOM_LEVELS.find((level) => level > zoom + epsilon) ?? 64
  for (let index = CANVAS_ZOOM_LEVELS.length - 1; index >= 0; index -= 1) if (CANVAS_ZOOM_LEVELS[index] < zoom - epsilon) return CANVAS_ZOOM_LEVELS[index]
  return 0.0625
}

export const normalizeCanvasWheelDelta = (event: {
  deltaX?: number
  deltaY?: number
  deltaMode?: number
  wheelDelta?: number
}): number => {
  const deltaY = Number.isFinite(event.deltaY) ? event.deltaY! : 0
  const deltaX = Number.isFinite(event.deltaX) ? event.deltaX! : 0
  const legacyDelta = Number.isFinite(event.wheelDelta) ? -event.wheelDelta! : 0
  const rawDelta = deltaY !== 0 ? deltaY : deltaX !== 0 ? deltaX : legacyDelta
  if (rawDelta === 0) return 0
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 800 : 1
  return rawDelta * unit
}

export const wheelCanvasZoom = (zoom: number, deltaY: number, mode: 'smooth' | 'stepped'): number =>
  mode === 'stepped'
    ? steppedCanvasZoom(zoom, deltaY < 0)
    : clampCanvasZoom(zoom * 2 ** (-deltaY / 480))

export const zoomDragTarget = (startZoom: number, horizontalDistance: number, mode: 'smooth' | 'stepped'): number => {
  if (mode === 'smooth') return clampCanvasZoom(startZoom * 2 ** (horizontalDistance / 96))
  const steps = Math.trunc(horizontalDistance / 24)
  let zoom = startZoom
  for (let index = 0; index < Math.abs(steps); index += 1) zoom = steppedCanvasZoom(zoom, steps > 0)
  return zoom
}

export const zoomDragModeForModifiers = (defaultMode: 'smooth' | 'stepped', shiftKey: boolean): 'smooth' | 'stepped' => shiftKey ? 'stepped' : defaultMode

export const shouldStartCanvasPan = (tool: string): boolean => tool === 'hand'

export const rotationHandles = (box: { x: number; y: number; width: number; height: number }): Array<[SelectionRotationHandle, number, number]> => {
  const offset = 22
  return [
    ['rotate-ne', box.x + box.width + offset, box.y - offset],
    ['rotate-se', box.x + box.width + offset, box.y + box.height + offset],
    ['rotate-sw', box.x - offset, box.y + box.height + offset],
    ['rotate-nw', box.x - offset, box.y - offset]
  ]
}

// 旋转只占用角点附近的紧凑区域，避免阻挡套索继续选择周边像素。
export const ROTATION_HANDLE_HIT_RADIUS = 28

export const selectionShearHit = (
  box: { x: number; y: number; width: number; height: number },
  point: CanvasPoint,
  scale = 1
): SelectionShearHandle | null => {
  const safeScale = Math.max(0.0001, scale)
  const inner = SELECTION_RESIZE_HIT_RADIUS * safeScale
  const outer = ROTATION_HANDLE_HIT_RADIUS * safeScale
  const centerX = box.x + box.width / 2
  const centerY = box.y + box.height / 2
  const right = box.x + box.width
  const bottom = box.y + box.height
  if (point.y < box.y - inner && point.y >= box.y - outer && Math.abs(point.x - centerX) <= outer) return 'shear-n'
  if (point.y > bottom + inner && point.y <= bottom + outer && Math.abs(point.x - centerX) <= outer) return 'shear-s'
  if (point.x < box.x - inner && point.x >= box.x - outer && Math.abs(point.y - centerY) <= outer) return 'shear-w'
  if (point.x > right + inner && point.x <= right + outer && Math.abs(point.y - centerY) <= outer) return 'shear-e'
  return null
}

export const selectionRotationHit = (
  box: { x: number; y: number; width: number; height: number },
  point: CanvasPoint,
  scale = 1
): SelectionRotationHandle | null => {
  const safeScale = Math.max(0.0001, scale)
  const within = point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height
  if (within) return null
  if (selectionResizeHit(
    box,
    point,
    SELECTION_RESIZE_HIT_RADIUS * safeScale,
    SELECTION_CORNER_RESIZE_HIT_RADIUS * safeScale,
    SELECTION_CORNER_OUTWARD_RESIZE_HIT_RADIUS * safeScale
  )) return null

  const left = box.x
  const right = box.x + box.width
  const top = box.y
  const bottom = box.y + box.height
  let nearest: SelectionRotationHandle | null = null
  let nearestDistance = Number.POSITIVE_INFINITY
  const handles: Array<[SelectionRotationHandle, number, number]> = [
    ['rotate-ne', right, top],
    ['rotate-se', right, bottom],
    ['rotate-sw', left, bottom],
    ['rotate-nw', left, top]
  ]
  for (const [handle, handleX, handleY] of handles) {
    if (Math.abs(point.x - handleX) > ROTATION_HANDLE_HIT_RADIUS * safeScale || Math.abs(point.y - handleY) > ROTATION_HANDLE_HIT_RADIUS * safeScale) continue
    const distance = (point.x - handleX) ** 2 + (point.y - handleY) ** 2
    if (distance < nearestDistance) { nearest = handle; nearestDistance = distance }
  }
  return nearest
}

export const selectionInteractionHit = (
  selection: SelectionMask,
  point: CanvasPoint,
  zoom: number
): SelectionHit => {
  const safeZoom = Math.max(0.0001, zoom)
  const resizeHit = selectionResizeHit(
    selection,
    point,
    SELECTION_RESIZE_HIT_RADIUS / safeZoom,
    SELECTION_CORNER_RESIZE_HIT_RADIUS / safeZoom,
    SELECTION_CORNER_OUTWARD_RESIZE_HIT_RADIUS / safeZoom
  )
  if (resizeHit) return resizeHit

  const shearHit = selectionShearHit(selection, point, 1 / safeZoom)
  if (shearHit) return shearHit

  const rotationHit = selectionRotationHit(selection, point, 1 / safeZoom)
  if (rotationHit) return rotationHit

  return selectionContentHit(selection, point, safeZoom)
}

export const selectionHitStartsContentMove = (
  hit: SelectionHit,
  copyRequested: boolean
): boolean => hit === 'inside' || (copyRequested && hit === 'edge')

const selectionContentHit = (
  selection: SelectionMask,
  point: CanvasPoint,
  zoom: number
): 'inside' | 'edge' | 'outside' => {
  const safeZoom = Math.max(0.0001, zoom)

  const edgeRadius = 8 / safeZoom
  const localX = point.x - selection.x
  const localY = point.y - selection.y
  const segments = cachedSelectionBoundarySegments(selection)
  for (let index = 0; index < segments.length; index += 4) {
    const x1 = segments[index]
    const y1 = segments[index + 1]
    const x2 = segments[index + 2]
    const y2 = segments[index + 3]
    const closestX = Math.max(Math.min(x1, x2), Math.min(Math.max(x1, x2), localX))
    const closestY = Math.max(Math.min(y1, y2), Math.min(Math.max(y1, y2), localY))
    if (Math.hypot(localX - closestX, localY - closestY) <= edgeRadius) return 'edge'
  }
  return selectionContains(selection, Math.floor(point.x), Math.floor(point.y)) ? 'inside' : 'outside'
}

export const selectionTransformedInteractionHit = (
  selection: SelectionMask,
  target: SelectionRect,
  angle: number,
  shear: SelectionShearTransform | undefined,
  point: CanvasPoint,
  zoom: number
): SelectionHit => {
  const safeZoom = Math.max(0.0001, zoom)
  const localPoint = inverseTransformedSelectionPoint(target, point, angle, shear)
  const resizeHit = selectionResizeHit(
    target,
    localPoint,
    SELECTION_RESIZE_HIT_RADIUS / safeZoom,
    SELECTION_CORNER_RESIZE_HIT_RADIUS / safeZoom,
    SELECTION_CORNER_OUTWARD_RESIZE_HIT_RADIUS / safeZoom
  )
  if (resizeHit) return resizeHit

  const shearHit = selectionShearHit(target, localPoint, 1 / safeZoom)
  if (shearHit) return shearHit

  const rotationHit = selectionRotationHit(target, localPoint, 1 / safeZoom)
  if (rotationHit) return rotationHit

  return selectionContentHit(selection, point, safeZoom)
}

/**
 * Free transform intentionally exposes only the four corner handles. Keep the
 * same CSS-pixel hit sizes as regular selection handles, but never let an edge
 * midpoint, shear band, or rotation region start this interaction.
 */
export const selectionFreeTransformHit = (
  target: SelectionRect | SelectionQuad,
  angle: number,
  shear: SelectionShearTransform | undefined,
  point: CanvasPoint,
  zoom: number
): SelectionHandle | null => {
  const safeZoom = Math.max(0.0001, zoom)
  if ('nw' in target) {
    // A free-transform frame can be rotated or perspective-skewed, so global
    // x/y quadrants do not identify the corner reliably. Invert the quad first
    // and use normalized coordinates to determine whether the pointer is on
    // the outside side of that corner. The final distance check remains in
    // document coordinates, keeping the hit radius stable under zoom.
    const normalized = inverseSelectionQuadPoint(target, point)
    const corners: Array<[SelectionHandle, { x: number; y: number }, (u: number, v: number) => boolean]> = [
      ['nw', target.nw, (u, v) => u <= 0 && v <= 0],
      ['ne', target.ne, (u, v) => u >= 1 && v <= 0],
      ['sw', target.sw, (u, v) => u <= 0 && v >= 1],
      ['se', target.se, (u, v) => u >= 1 && v >= 1]
    ]
    let nearest: SelectionHandle | null = null
    let nearestDistance = Number.POSITIVE_INFINITY
    for (const [handle, corner, isOutward] of corners) {
      const distance = Math.hypot(point.x - corner.x, point.y - corner.y)
      if (!Number.isFinite(distance)) continue
      if (normalized) {
        const inCornerQuadrant = handle === 'nw'
          ? normalized.x < 0.5 && normalized.y < 0.5
          : handle === 'ne'
            ? normalized.x > 0.5 && normalized.y < 0.5
            : handle === 'se'
              ? normalized.x > 0.5 && normalized.y > 0.5
              : normalized.x < 0.5 && normalized.y > 0.5
        if (!inCornerQuadrant) continue
      }
      const outward = normalized ? isOutward(normalized.x, normalized.y) : false
      const radius = (outward ? SELECTION_CORNER_OUTWARD_RESIZE_HIT_RADIUS : SELECTION_CORNER_RESIZE_HIT_RADIUS) / safeZoom
      if (distance > radius || distance >= nearestDistance) continue
      nearest = handle
      nearestDistance = distance
    }
    return nearest
  }
  const localPoint = inverseTransformedSelectionPoint(target, point, angle, shear)
  const controlPoints = transformedSelectionControlPoints(target, angle, shear)
  const corners: Array<[SelectionHandle, { x: number; y: number }, (local: CanvasPoint) => boolean, (local: CanvasPoint) => boolean]> = [
    ['nw', controlPoints[0], (local) => local.x < target.x + target.width / 2 && local.y < target.y + target.height / 2, (local) => local.x <= target.x && local.y <= target.y],
    ['ne', controlPoints[2], (local) => local.x > target.x + target.width / 2 && local.y < target.y + target.height / 2, (local) => local.x >= target.x + target.width && local.y <= target.y],
    ['sw', controlPoints[5], (local) => local.x < target.x + target.width / 2 && local.y > target.y + target.height / 2, (local) => local.x <= target.x && local.y >= target.y + target.height],
    ['se', controlPoints[7], (local) => local.x > target.x + target.width / 2 && local.y > target.y + target.height / 2, (local) => local.x >= target.x + target.width && local.y >= target.y + target.height]
  ]
  if (!localPoint) return null
  let nearest: SelectionHandle | null = null
  let nearestDistance = Number.POSITIVE_INFINITY
  for (const [handle, corner, inCornerQuadrant, isOutward] of corners) {
    if (!inCornerQuadrant(localPoint)) continue
    const distance = Math.hypot(point.x - corner.x, point.y - corner.y)
    const radius = (isOutward(localPoint) ? SELECTION_CORNER_OUTWARD_RESIZE_HIT_RADIUS : SELECTION_CORNER_RESIZE_HIT_RADIUS) / safeZoom
    if (!Number.isFinite(distance) || distance > radius || distance >= nearestDistance) continue
    nearest = handle
    nearestDistance = distance
  }
  return nearest
}

/**
 * Tests whether a point is inside the frame area of a free-transform
 * frame. Corner handles are resolved separately by selectionFreeTransformHit;
 * this helper only answers the move-content question.
 */
export const selectionFreeTransformContentHit = (
  _selection: SelectionMask,
  target: SelectionQuad,
  point: CanvasPoint
): boolean => {
  const normalized = inverseSelectionQuadPoint(target, point)
  if (!normalized || !Number.isFinite(normalized.x) || !Number.isFinite(normalized.y)) return false
  const epsilon = 1e-7
  // The frame, rather than the current rasterized mask, owns this hit test.
  // A transformed mask is cropped to its non-empty pixels, so using it here
  // makes transparent holes (and the newly exposed area after a resize) stop
  // the move gesture. Free transform must be movable from any point inside
  // the visible quadrilateral, including transparent pixels.
  return normalized.x >= -epsilon && normalized.x <= 1 + epsilon
    && normalized.y >= -epsilon && normalized.y <= 1 + epsilon
}

export const selectionTransformModifiers = (
  modifiers: { ctrlKey: boolean; metaKey?: boolean; altKey?: boolean; shiftKey: boolean }
): { proportional: boolean; integerScale: boolean; fromCenter: boolean; copy: false } => {
  return {
    proportional: modifiers.shiftKey,
    integerScale: Boolean(modifiers.ctrlKey || modifiers.metaKey),
    fromCenter: Boolean(modifiers.altKey),
    copy: false
  }
}

export const selectionTransformPreviewChanged = (drag: CanvasDragState): boolean => {
  const start = drag.transformStartTarget ?? drag.selectionStart
  const target = drag.previewTarget
  if (!start || !target) return false
  if (start.x !== target.x || start.y !== target.y || start.width !== target.width || start.height !== target.height
    || start.flipHorizontal !== target.flipHorizontal || start.flipVertical !== target.flipVertical
    || start.flipOriginX !== target.flipOriginX || start.flipOriginY !== target.flipOriginY) return true
  const startQuad = drag.transformStartQuad
  const previewQuad = drag.previewQuad
  if (startQuad || previewQuad) {
    if (!startQuad || !previewQuad) return true
    for (const corner of ['nw', 'ne', 'se', 'sw'] as const) {
      if (startQuad[corner].x !== previewQuad[corner].x || startQuad[corner].y !== previewQuad[corner].y) return true
    }
  }
  const normalizeAngle = (value: number): number => ((value % 360) + 360) % 360
  if (normalizeAngle(drag.startAngle ?? 0) !== normalizeAngle(drag.previewAngle ?? drag.startAngle ?? 0)) return true
  const startShear = drag.transformStartShear?.amount === 0 ? undefined : drag.transformStartShear
  const previewShear = drag.previewShear?.amount === 0 ? undefined : drag.previewShear
  return startShear?.axis !== previewShear?.axis || startShear?.edge !== previewShear?.edge || startShear?.amount !== previewShear?.amount
}

export const translatedSelectionRect = (rect: SelectionRect, offset: CanvasPoint): SelectionRect => ({
  ...rect,
  x: rect.x + offset.x,
  y: rect.y + offset.y,
  ...(Number.isFinite(rect.flipOriginX) ? { flipOriginX: rect.flipOriginX! + offset.x } : {}),
  ...(Number.isFinite(rect.flipOriginY) ? { flipOriginY: rect.flipOriginY! + offset.y } : {})
})

const selectionShearsEqual = (left: SelectionShearTransform | undefined, right: SelectionShearTransform | undefined): boolean =>
  left === right || Boolean(left && right && left.axis === right.axis && left.edge === right.edge && left.amount === right.amount)

/** Reuses an already transformed mask when a drag only changes its integer position. */
export const translatedSelectionTransformPreviewMask = (
  drag: Pick<CanvasDragState, 'kind' | 'selectionStart' | 'transformStartTarget' | 'startAngle' | 'transformStartShear'>,
  target: SelectionRect,
  angle: number,
  shear: SelectionShearTransform | undefined,
  canvasWidth: number,
  canvasHeight: number
): SelectionMask | undefined => {
  const selection = drag.selectionStart
  const startTarget = drag.transformStartTarget
  const startAngle = drag.startAngle ?? 0
  if (drag.kind !== 'move-content' || !selection || !startTarget || angle !== startAngle || !selectionShearsEqual(shear, drag.transformStartShear)) return undefined

  const delta = { x: target.x - startTarget.x, y: target.y - startTarget.y }
  if (!Number.isInteger(delta.x) || !Number.isInteger(delta.y)) return undefined
  const translatedTarget = translatedSelectionRect(startTarget, delta)
  if (target.width !== translatedTarget.width
    || target.height !== translatedTarget.height
    || Boolean(target.flipHorizontal) !== Boolean(translatedTarget.flipHorizontal)
    || Boolean(target.flipVertical) !== Boolean(translatedTarget.flipVertical)
    || (target.flipHorizontal && target.flipOriginX !== translatedTarget.flipOriginX)
    || (target.flipVertical && target.flipOriginY !== translatedTarget.flipOriginY)) return undefined

  const startBounds = transformedSelectionBounds(startTarget, startAngle, drag.transformStartShear)
  const targetBounds = transformedSelectionBounds(target, angle, shear)
  const withinCanvas = (bounds: SelectionRect): boolean => bounds.x >= 0
    && bounds.y >= 0
    && bounds.x + bounds.width <= canvasWidth
    && bounds.y + bounds.height <= canvasHeight
  if (!withinCanvas(startBounds) || !withinCanvas(targetBounds)) return undefined

  return {
    ...selection,
    x: selection.x + delta.x,
    y: selection.y + delta.y
  }
}

export const temporaryTransformOffset = (
  start: { pointer: CanvasPoint; offset: CanvasPoint },
  point: CanvasPoint
): CanvasPoint => ({
  x: start.offset.x + point.x - start.pointer.x,
  y: start.offset.y + point.y - start.pointer.y
})

export const createMarqueeResizeStart = (
  bounds: SelectionRect,
  pointer: CanvasPoint,
  fromCenter = true
): { pointer: CanvasPoint; bounds: SelectionRect; fromCenter: boolean } => ({
  pointer: { ...pointer },
  bounds: { ...bounds },
  fromCenter
})

export const centerMarqueeBoundsAtCreationPoint = (
  bounds: SelectionRect,
  creationPoint: CanvasPoint
): SelectionRect => {
  return {
    ...bounds,
    x: creationPoint.x - Math.floor(bounds.width / 2),
    y: creationPoint.y - Math.floor(bounds.height / 2)
  }
}

export const beginTemporaryCenteredMarqueeResize = (
  bounds: SelectionRect,
  creationPoint: CanvasPoint,
  pointer: CanvasPoint,
  direction?: { x: -1 | 1; y: -1 | 1 },
  restoreFromCenter = true
): {
  bounds: SelectionRect
  resizeStart: { pointer: CanvasPoint; bounds: SelectionRect; fromCenter: boolean }
  restore: MarqueeTemporaryCenterRestore
} => {
  const centeredBounds = centerMarqueeBoundsAtCreationPoint(bounds, creationPoint)
  return {
    bounds: centeredBounds,
    resizeStart: createMarqueeResizeStart(centeredBounds, pointer),
    restore: {
      bounds: { ...bounds },
      direction: direction ? { ...direction } : undefined,
      fromCenter: restoreFromCenter
    }
  }
}

export const restoreTemporaryCenteredMarqueeResize = (
  restore: MarqueeTemporaryCenterRestore,
  pointer: CanvasPoint
): {
  bounds: SelectionRect
  resizeStart: { pointer: CanvasPoint; bounds: SelectionRect; fromCenter: boolean }
  direction?: { x: -1 | 1; y: -1 | 1 }
} => ({
  bounds: { ...restore.bounds },
  resizeStart: createMarqueeResizeStart(restore.bounds, pointer, restore.fromCenter),
  direction: restore.direction ? { ...restore.direction } : undefined
})

export const resizeRotatedMarqueeBounds = (
  start: SelectionRect,
  pointerDelta: CanvasPoint,
  angle: number,
  direction: { x: -1 | 1; y: -1 | 1 },
  fromCenter = false,
  proportional = false,
  fixedRatio: ShapeRatio | null = null
): SelectionRect => {
  const radians = angle * Math.PI / 180
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  const localX = pointerDelta.x * cosine + pointerDelta.y * sine
  const localY = -pointerDelta.x * sine + pointerDelta.y * cosine
  const centeredSize = (size: number, localDelta: number, axisDirection: -1 | 1): number => {
    const minimum = size % 2 === 0 ? 2 : 1
    return Math.max(minimum, size + Math.round(localDelta * axisDirection) * 2)
  }
  let width = fromCenter
    ? centeredSize(start.width, localX, direction.x)
    : Math.max(1, Math.round(start.width + localX * direction.x))
  let height = fromCenter
    ? centeredSize(start.height, localY, direction.y)
    : Math.max(1, Math.round(start.height + localY * direction.y))
  const ratio = fixedRatio && Number.isFinite(fixedRatio.width) && Number.isFinite(fixedRatio.height)
    ? Math.max(0.001, fixedRatio.width / fixedRatio.height)
    : proportional ? 1 : null
  if (ratio !== null) {
    const widthDriven = Math.abs(localX) / ratio >= Math.abs(localY)
    if (widthDriven) height = Math.max(1, Math.round(width / ratio))
    else width = Math.max(1, Math.round(height * ratio))
    if (fromCenter) {
      const matchParity = (size: number, startSize: number): number => {
        const minimum = startSize % 2 === 0 ? 2 : 1
        let matched = Math.max(minimum, size)
        if (Math.abs(matched - startSize) % 2 !== 0) matched = matched > minimum ? matched - 1 : matched + 1
        return matched
      }
      width = matchParity(width, start.width)
      height = matchParity(height, start.height)
    }
  }
  if (fromCenter) {
    const centerX = start.x + start.width / 2
    const centerY = start.y + start.height / 2
    return { x: centerX - width / 2, y: centerY - height / 2, width, height }
  }
  return {
    x: direction.x < 0 ? start.x + start.width - width : start.x,
    y: direction.y < 0 ? start.y + start.height - height : start.y,
    width,
    height
  }
}

export const selectionRotationAngle = (
  selection: SelectionRect,
  start: CanvasPoint,
  point: CanvasPoint,
  snap = false,
  pivot?: CanvasPoint
): number => {
  const centerX = pivot?.x ?? selection.x + selection.width / 2
  const centerY = pivot?.y ?? selection.y + selection.height / 2
  const startAngle = Math.atan2(start.y - centerY, start.x - centerX)
  const rawAngle = (Math.atan2(point.y - centerY, point.x - centerX) - startAngle) * 180 / Math.PI
  return snapSelectionRotation(rawAngle, snap)
}

export const selectionMarqueeUsesConstraint = (
  modifiers: { ctrlKey: boolean; metaKey?: boolean; shiftKey: boolean },
  hasSelection: boolean,
  mode: SelectionMode,
  afterRotation = false
): boolean => {
  if (afterRotation && !modifiers.shiftKey) return false
  return modifiers.shiftKey && (!hasSelection || mode !== 'add')
}

export const snapSelectionRotation = (angle: number, enabled: boolean): number =>
  enabled ? Math.round(angle / 45) * 45 : angle

export const shapeBounds = (start: CanvasPoint, end: CanvasPoint, constrain = false, fixedRatio: ShapeRatio | null = null): SelectionRect => {
  const ratio = fixedRatio && Number.isFinite(fixedRatio.width) && Number.isFinite(fixedRatio.height)
    ? Math.max(0.001, fixedRatio.width / fixedRatio.height)
    : constrain ? 1 : null
  if (ratio === null) {
    const x = Math.min(start.x, end.x)
    const y = Math.min(start.y, end.y)
    return { x, y, width: Math.abs(end.x - start.x) + 1, height: Math.abs(end.y - start.y) + 1 }
  }
  const deltaX = end.x - start.x
  const deltaY = end.y - start.y
  const absoluteX = Math.abs(deltaX)
  const absoluteY = Math.abs(deltaY)
  const widthMajor = absoluteX / ratio >= absoluteY
  const widthDistance = widthMajor ? absoluteX : Math.round(absoluteY * ratio)
  const heightDistance = widthMajor ? Math.round(absoluteX / ratio) : absoluteY
  return shapeBounds(start, {
    x: start.x + (deltaX < 0 ? -widthDistance : widthDistance),
    y: start.y + (deltaY < 0 ? -heightDistance : heightDistance)
  })
}

export const centeredShapeBounds = (center: CanvasPoint, end: CanvasPoint, constrain = false, fixedRatio: ShapeRatio | null = null): SelectionRect => {
  const ratio = fixedRatio && Number.isFinite(fixedRatio.width) && Number.isFinite(fixedRatio.height)
    ? Math.max(0.001, fixedRatio.width / fixedRatio.height)
    : constrain ? 1 : null
  let distanceX = Math.abs(end.x - center.x)
  let distanceY = Math.abs(end.y - center.y)
  if (ratio !== null) {
    const widthMajor = distanceX / ratio >= distanceY
    if (widthMajor) distanceY = Math.round(distanceX / ratio)
    else distanceX = Math.round(distanceY * ratio)
  }
  const directionX = end.x < center.x ? -1 : 1
  const directionY = end.y < center.y ? -1 : 1
  const adjustedEnd = { x: center.x + directionX * distanceX, y: center.y + directionY * distanceY }
  return shapeBounds({ x: center.x * 2 - adjustedEnd.x, y: center.y * 2 - adjustedEnd.y }, adjustedEnd)
}

export const constrainedTranslation = (drag: CanvasDragState, deltaX: number, deltaY: number, shift: boolean): CanvasPoint => {
  if (!shift) {
    drag.axisLock = undefined
    return { x: deltaX, y: deltaY }
  }
  const absoluteX = Math.abs(deltaX)
  const absoluteY = Math.abs(deltaY)
  if (!drag.axisLock && (absoluteX !== 0 || absoluteY !== 0)) drag.axisLock = absoluteX >= absoluteY ? 'x' : 'y'
  if (drag.axisLock === 'x' && absoluteY > absoluteX * 1.2) drag.axisLock = 'y'
  if (drag.axisLock === 'y' && absoluteX > absoluteY * 1.2) drag.axisLock = 'x'
  return drag.axisLock === 'x' ? { x: deltaX, y: 0 } : { x: 0, y: deltaY }
}

export const selectionMovePointerDelta = (
  drag: Pick<CanvasDragState, 'start' | 'tileRepeatStart'>,
  point: CanvasPoint,
  repeatedPoint?: CanvasPoint | null
): CanvasPoint => {
  const useRepeatedPoint = Boolean(drag.tileRepeatStart && repeatedPoint)
  const start = useRepeatedPoint ? drag.tileRepeatStart! : drag.start
  const current = useRepeatedPoint ? repeatedPoint! : point
  return {
    x: Math.floor(current.x) - Math.floor(start.x),
    y: Math.floor(current.y) - Math.floor(start.y)
  }
}

export const resizeSelectionBounds = (
  start: SelectionRect,
  point: CanvasPoint,
  handle: SelectionHandle,
  _bounds: { width: number; height: number },
  proportional = false,
  integerScale = false,
  fromCenter = false
): SelectionRect => {
  const originalLeft = start.x
  const originalTop = start.y
  const originalRight = start.x + start.width
  const originalBottom = start.y + start.height
  const targetX = point.x
  const targetY = point.y
  let left = originalLeft
  let top = originalTop
  let right = originalRight
  let bottom = originalBottom
  let flipHorizontal = Boolean(start.flipHorizontal)
  let flipVertical = Boolean(start.flipVertical)
  let flipOriginX = start.flipOriginX
  let flipOriginY = start.flipOriginY
  let crossedHorizontal = false
  let crossedVertical = false
  if (fromCenter && (handle.includes('w') || handle.includes('e'))) {
    const center = (originalLeft + originalRight) / 2
    const signedWidth = handle.includes('w')
      ? start.width + (originalLeft - targetX) * 2
      : start.width + (targetX - originalRight) * 2
    const minimum = start.width % 2 === 0 ? 2 : 1
    const width = Math.max(minimum, Math.abs(Math.round(signedWidth)))
    crossedHorizontal = signedWidth < 0
    left = center - width / 2
    right = center + width / 2
    flipHorizontal = crossedHorizontal ? !Boolean(start.flipHorizontal) : Boolean(start.flipHorizontal)
    flipOriginX = crossedHorizontal ? center : (flipHorizontal ? start.flipOriginX : undefined)
  } else if (handle.includes('w')) {
    crossedHorizontal = targetX > originalRight
    left = crossedHorizontal ? originalRight : Math.min(originalRight - 1, targetX)
    right = crossedHorizontal ? Math.max(originalRight + 1, targetX) : originalRight
    flipHorizontal = crossedHorizontal ? !Boolean(start.flipHorizontal) : Boolean(start.flipHorizontal)
    flipOriginX = crossedHorizontal ? targetX : (flipHorizontal ? start.flipOriginX : undefined)
  }
  else if (handle.includes('e')) {
    crossedHorizontal = targetX < originalLeft
    left = crossedHorizontal ? Math.min(originalLeft - 1, targetX) : originalLeft
    right = crossedHorizontal ? originalLeft : Math.max(originalLeft + 1, targetX)
    flipHorizontal = crossedHorizontal ? !Boolean(start.flipHorizontal) : Boolean(start.flipHorizontal)
    flipOriginX = crossedHorizontal ? targetX : (flipHorizontal ? start.flipOriginX : undefined)
  }
  if (fromCenter && (handle.includes('n') || handle.includes('s'))) {
    const center = (originalTop + originalBottom) / 2
    const signedHeight = handle.includes('n')
      ? start.height + (originalTop - targetY) * 2
      : start.height + (targetY - originalBottom) * 2
    const minimum = start.height % 2 === 0 ? 2 : 1
    const height = Math.max(minimum, Math.abs(Math.round(signedHeight)))
    crossedVertical = signedHeight < 0
    top = center - height / 2
    bottom = center + height / 2
    flipVertical = crossedVertical ? !Boolean(start.flipVertical) : Boolean(start.flipVertical)
    flipOriginY = crossedVertical ? center : (flipVertical ? start.flipOriginY : undefined)
  } else if (handle.includes('n')) {
    crossedVertical = targetY > originalBottom
    top = crossedVertical ? originalBottom : Math.min(originalBottom - 1, targetY)
    bottom = crossedVertical ? Math.max(originalBottom + 1, targetY) : originalBottom
    flipVertical = crossedVertical ? !Boolean(start.flipVertical) : Boolean(start.flipVertical)
    flipOriginY = crossedVertical ? targetY : (flipVertical ? start.flipOriginY : undefined)
  }
  else if (handle.includes('s')) {
    crossedVertical = targetY < originalTop
    top = crossedVertical ? Math.min(originalTop - 1, targetY) : originalTop
    bottom = crossedVertical ? originalTop : Math.max(originalTop + 1, targetY)
    flipVertical = crossedVertical ? !Boolean(start.flipVertical) : Boolean(start.flipVertical)
    flipOriginY = crossedVertical ? targetY : (flipVertical ? start.flipOriginY : undefined)
  }

  if (proportional || integerScale) {
    const rawWidth = right - left
    const rawHeight = bottom - top
    const aspect = start.width / start.height
    const horizontalHandle = handle.includes('w') || handle.includes('e')
    const verticalHandle = handle.includes('n') || handle.includes('s')
    const widthDriven = horizontalHandle && !verticalHandle
      ? true
      : verticalHandle && !horizontalHandle
        ? false
        : rawWidth / start.width >= rawHeight / start.height
    let width = proportional
      ? (widthDriven ? rawWidth : Math.max(1, Math.round(rawHeight * aspect)))
      : rawWidth
    let height = proportional
      ? (widthDriven ? Math.max(1, Math.round(rawWidth / aspect)) : rawHeight)
      : rawHeight
    if (integerScale) {
      if (proportional) {
        const scale = Math.max(1, Math.round(widthDriven ? (rawWidth + (fromCenter ? 0 : 1)) / start.width : (rawHeight + (fromCenter ? 0 : 1)) / start.height))
        width = start.width * scale
        height = start.height * scale
      } else {
        if (horizontalHandle) width = start.width * Math.max(1, Math.round((rawWidth + (fromCenter ? 0 : 1)) / start.width))
        if (verticalHandle) height = start.height * Math.max(1, Math.round((rawHeight + (fromCenter ? 0 : 1)) / start.height))
      }
    }

    if (fromCenter) {
      const matchParity = (size: number, startSize: number): number => {
        const minimum = startSize % 2 === 0 ? 2 : 1
        let matched = Math.max(minimum, Math.round(size))
        if (Math.abs(matched - startSize) % 2 !== 0) matched = matched > minimum ? matched - 1 : matched + 1
        return matched
      }
      width = matchParity(width, start.width)
      height = matchParity(height, start.height)
      const centerX = (originalLeft + originalRight) / 2
      const centerY = (originalTop + originalBottom) / 2
      left = centerX - width / 2
      right = centerX + width / 2
      top = centerY - height / 2
      bottom = centerY + height / 2
    } else {

      if (handle.includes('w')) {
        if (crossedHorizontal) { left = originalRight; right = originalRight + width }
        else { left = originalRight - width; right = originalRight }
      } else if (handle.includes('e')) {
        if (crossedHorizontal) { left = originalLeft - width; right = originalLeft }
        else { left = originalLeft; right = originalLeft + width }
      }
      else {
        const center = (left + right) / 2
        left = Math.round(center - width / 2)
        right = left + width
      }
      if (handle.includes('n')) {
        if (crossedVertical) { top = originalBottom; bottom = originalBottom + height }
        else { top = originalBottom - height; bottom = originalBottom }
      } else if (handle.includes('s')) {
        if (crossedVertical) { top = originalTop - height; bottom = originalTop }
        else { top = originalTop; bottom = originalTop + height }
      }
      else {
        const center = (top + bottom) / 2
        top = Math.round(center - height / 2)
        bottom = top + height
      }
    }
  }
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
    ...(flipHorizontal ? { flipHorizontal: true } : {}),
    ...(flipVertical ? { flipVertical: true } : {}),
    ...(flipHorizontal && Number.isFinite(flipOriginX) ? { flipOriginX } : {}),
    ...(flipVertical && Number.isFinite(flipOriginY) ? { flipOriginY } : {})
  }
}

export const resizeTransformedSelectionBounds = (
  start: SelectionRect,
  pointerDelta: CanvasPoint,
  angle: number,
  handle: SelectionHandle,
  proportional = false,
  integerScale = false,
  fromCenter = false,
  pivot?: CanvasPoint
): SelectionRect => {
  const radians = angle * Math.PI / 180
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  const localDelta = {
    x: pointerDelta.x * cosine + pointerDelta.y * sine,
    y: -pointerDelta.x * sine + pointerDelta.y * cosine
  }
  const handlePoint = {
    x: handle.includes('w') ? 0 : handle.includes('e') ? start.width : start.width / 2,
    y: handle.includes('n') ? 0 : handle.includes('s') ? start.height : start.height / 2
  }
  if (fromCenter && pivot) {
    const startCenter = { x: start.x + start.width / 2, y: start.y + start.height / 2 }
    const pivotOffset = { x: pivot.x - startCenter.x, y: pivot.y - startCenter.y }
    const localPivot = {
      x: start.width / 2 + pivotOffset.x * cosine + pivotOffset.y * sine,
      y: start.height / 2 - pivotOffset.x * sine + pivotOffset.y * cosine
    }
    const horizontalHandle = handle.includes('w') || handle.includes('e')
    const verticalHandle = handle.includes('n') || handle.includes('s')
    const axisScale = (handleCoordinate: number, delta: number, pivotCoordinate: number, affected: boolean): number => {
      if (!affected) return 1
      const startDistance = handleCoordinate - pivotCoordinate
      return Math.abs(startDistance) < 1e-9 ? 1 : (handleCoordinate + delta - pivotCoordinate) / startDistance
    }
    const rawScaleX = axisScale(handlePoint.x, localDelta.x, localPivot.x, horizontalHandle)
    const rawScaleY = axisScale(handlePoint.y, localDelta.y, localPivot.y, verticalHandle)
    const scaleSign = (value: number): number => value < 0 ? -1 : 1
    let width: number
    let height: number
    let signX = scaleSign(rawScaleX)
    let signY = scaleSign(rawScaleY)
    if (proportional) {
      const widthDriven = horizontalHandle && !verticalHandle
        ? true
        : verticalHandle && !horizontalHandle
          ? false
          : Math.abs(rawScaleX) >= Math.abs(rawScaleY)
      let magnitude = Math.abs(widthDriven ? rawScaleX : rawScaleY)
      if (integerScale) magnitude = Math.max(1, Math.round(magnitude))
      width = integerScale ? start.width * magnitude : Math.max(1, Math.round(start.width * magnitude))
      height = integerScale ? start.height * magnitude : Math.max(1, Math.round(start.height * magnitude))
      if (!horizontalHandle) signX = 1
      if (!verticalHandle) signY = 1
    } else {
      const widthMagnitude = integerScale && horizontalHandle ? Math.max(1, Math.round(Math.abs(rawScaleX))) : Math.abs(rawScaleX)
      const heightMagnitude = integerScale && verticalHandle ? Math.max(1, Math.round(Math.abs(rawScaleY))) : Math.abs(rawScaleY)
      width = horizontalHandle ? Math.max(1, Math.round(start.width * widthMagnitude)) : start.width
      height = verticalHandle ? Math.max(1, Math.round(start.height * heightMagnitude)) : start.height
    }
    const signedScaleX = signX * width / start.width
    const signedScaleY = signY * height / start.height
    const localCenterFromPivot = {
      x: (start.width / 2 - localPivot.x) * signedScaleX,
      y: (start.height / 2 - localPivot.y) * signedScaleY
    }
    const center = {
      x: pivot.x + localCenterFromPivot.x * cosine - localCenterFromPivot.y * sine,
      y: pivot.y + localCenterFromPivot.x * sine + localCenterFromPivot.y * cosine
    }
    const flipHorizontal = signX < 0 ? !Boolean(start.flipHorizontal) : Boolean(start.flipHorizontal)
    const flipVertical = signY < 0 ? !Boolean(start.flipVertical) : Boolean(start.flipVertical)
    const target: SelectionRect = {
      x: center.x - width / 2,
      y: center.y - height / 2,
      width,
      height,
      ...(flipHorizontal ? { flipHorizontal: true } : {}),
      ...(flipVertical ? { flipVertical: true } : {})
    }
    if (flipHorizontal) target.flipOriginX = signX < 0
      ? target.x + target.width / 2
      : Number.isFinite(start.flipOriginX) && start.flipOriginX! <= startCenter.x ? target.x : target.x + target.width
    if (flipVertical) target.flipOriginY = signY < 0
      ? target.y + target.height / 2
      : Number.isFinite(start.flipOriginY) && start.flipOriginY! <= startCenter.y ? target.y : target.y + target.height
    return target
  }
  const localStart: SelectionRect = {
    x: 0,
    y: 0,
    width: start.width,
    height: start.height,
    ...(start.flipHorizontal ? {
      flipHorizontal: true,
      flipOriginX: Number.isFinite(start.flipOriginX) && start.flipOriginX! <= start.x + start.width / 2 ? 0 : start.width
    } : {}),
    ...(start.flipVertical ? {
      flipVertical: true,
      flipOriginY: Number.isFinite(start.flipOriginY) && start.flipOriginY! <= start.y + start.height / 2 ? 0 : start.height
    } : {})
  }
  const resized = resizeSelectionBounds(
    localStart,
    { x: handlePoint.x + localDelta.x, y: handlePoint.y + localDelta.y },
    handle,
    { width: Number.POSITIVE_INFINITY, height: Number.POSITIVE_INFINITY },
    proportional,
    integerScale,
    fromCenter
  )
  const localCenterShift = {
    x: resized.x + resized.width / 2 - start.width / 2,
    y: resized.y + resized.height / 2 - start.height / 2
  }
  const center = {
    x: start.x + start.width / 2 + localCenterShift.x * cosine - localCenterShift.y * sine,
    y: start.y + start.height / 2 + localCenterShift.x * sine + localCenterShift.y * cosine
  }
  const target: SelectionRect = {
    x: center.x - resized.width / 2,
    y: center.y - resized.height / 2,
    width: resized.width,
    height: resized.height,
    ...(resized.flipHorizontal ? { flipHorizontal: true } : {}),
    ...(resized.flipVertical ? { flipVertical: true } : {})
  }
  if (resized.flipHorizontal) target.flipOriginX = resized.flipOriginX! <= resized.x + resized.width / 2 ? target.x : target.x + target.width
  if (resized.flipVertical) target.flipOriginY = resized.flipOriginY! <= resized.y + resized.height / 2 ? target.y : target.y + target.height
  return target
}
