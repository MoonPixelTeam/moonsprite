import { type GradientCompositePreview } from '@/core/gradient-preview'
import type { RgbaColor } from '@shared/types-color'
import type { SelectionMask, SelectionRect } from '@shared/types-selection'
import { type HistoryEntry } from '@/core/history'
import { type DocumentSession } from '@/store/workspace'
import { deviceAlignedCanvasRect, type CanvasDeviceScale, type CanvasDeviceScaleInput } from '@/core/canvas-render-plan'
import { selectionContains } from '@/core/selection'
import { type CanvasPoint as Point } from '@/core/canvas-input'
import { type SymmetryAxes, type SymmetryAxis } from '@/core/symmetry'
import { timelineSelectionPrecedesMarquee } from '@/core/animation-timeline-focus'
import { type CanvasClickFlashTiming } from './canvas-click-flash'
import { type CanvasMoveLayerContentPreview } from '@/components/canvas-move-selection'
import { type RasterContext2D } from '@/components/canvas-selection-renderer'
import { ensureAnimationDocument, resolveAnimationCel } from '@/core/animation'

export const nonContentPreviewDragKinds = new Set([
  'pan',
  'zoom-drag',
  'rotate-view',
  'move-selection-pivot',
  'sample-color',
  'brush-size',
  'marquee',
  'lasso',
  'polygon-lasso',
  'magic-preview',
  'create-slice',
  'move-slice',
  'resize-slice',
  'create-text-box'
])

export const SELECTION_PIVOT_ICON_SIZE = 18

export const SELECTION_PIVOT_ICON_OFFSET = SELECTION_PIVOT_ICON_SIZE / 2

export const EYEDROPPER_MAGNIFIER_BASE_SIZE = 256

export const EYEDROPPER_MAGNIFIER_VIEWPORT_SIZE = 204

export const drawDeviceAlignedCanvasBorder = (
  context: RasterContext2D,
  originX: number,
  originY: number,
  width: number,
  height: number,
  devicePixelRatio: CanvasDeviceScaleInput,
  color: string
): void => {
  const dpr = typeof devicePixelRatio === 'number'
    ? { x: Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1, y: Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1 }
    : devicePixelRatio
  const boundary = deviceAlignedCanvasRect(originX, originY, width, height, dpr)
  // Use one physical pixel for the outline. Drawing four filled edges avoids
  // strokeRect's half-pixel expansion when the scaled canvas size is fractional.
  context.fillStyle = color
  context.fillRect(boundary.left, boundary.top, boundary.width, 1 / dpr.y)
  context.fillRect(boundary.left, boundary.bottom - 1 / dpr.y, boundary.width, 1 / dpr.y)
  context.fillRect(boundary.left, boundary.top, 1 / dpr.x, boundary.height)
  context.fillRect(boundary.right - 1 / dpr.x, boundary.top, 1 / dpr.x, boundary.height)
}

export const selectionBoundsEqual = (left: SelectionRect, right: SelectionRect): boolean => left.x === right.x
  && left.y === right.y
  && left.width === right.width
  && left.height === right.height

export const symmetryGuideAxisEnabled = (axes: SymmetryAxes, axis: SymmetryAxis): boolean =>
  Boolean(axes[axis] || (axes.rotational && (axis === 'horizontal' || axis === 'vertical')))

export const brushBaseAngle = (session: Pick<DocumentSession, 'brushShape' | 'brushAngle' | 'brushSize'>): number =>
  session.brushSize <= 1 ? 0 : session.brushShape === 'square' || session.brushShape === 'line' ? Math.round(session.brushAngle) : 0

export const brushAngleWithDynamics = (session: Pick<DocumentSession, 'brushShape' | 'brushAngle' | 'brushSize'>, dynamicAngle = 0): number => {
  const angle = brushBaseAngle(session) + dynamicAngle
  return ((angle + 180) % 360 + 360) % 360 - 180
}

export interface GradientPreviewSurface { canvas: OffscreenCanvas; context: OffscreenCanvasRenderingContext2D; imageData: ImageData; pixels: Uint8ClampedArray; width: number; height: number }

export interface GradientCompositePreviewCache extends GradientCompositePreview {
  key: string
  replacementSampler?: (x: number, y: number, replacement: RgbaColor) => RgbaColor
}

export interface GradientPreviewCoverageCache {
  selection: SelectionMask | null | undefined
  paintRegion: SelectionMask | null | undefined
  previewFromX: number
  previewFromY: number
  previewToX: number
  previewToY: number
  targetX: number
  targetY: number
  targetWidth: number
  targetHeight: number
  sourceWidth: number
  sourceHeight: number
  zoom: number
  originX: number
  originY: number
  deviceScale: CanvasDeviceScale
  coverage: Uint8ClampedArray
  sampleX: Int32Array
  sampleY: Int32Array
}

export interface BrushPreviewCompositeCache {
  signature: string
  colors: Map<number, RgbaColor>
}

export interface BrushPreviewStackCache {
  signature: string
  x: number
  y: number
  width: number
  height: number
  lower: Uint8ClampedArray
  upper: Uint8ClampedArray
}

export interface SymmetryDragState {
  axis: SymmetryAxis | 'center'
  pointerId: number
  /** Latest transient center, kept outside React props while dragging. */
  center: { x: number; y: number }
  previewFrame: number | null
}

export type MoveLayerContentPreview = CanvasMoveLayerContentPreview

export interface MoveLayerClickFlash extends MoveLayerContentPreview, CanvasClickFlashTiming {}

export interface FreeTileInstanceFlash { instanceId: string; expiresAt: number }

export interface LineAnchorHistory {
  documentId: string
  layerId: string
  tool: 'pencil' | 'eraser'
  point: Point
  entry: HistoryEntry
  baseline: Map<number, number>
  mergeWithNext: boolean
}

export interface PolygonPathPreviewRenderCache {
  sourcePath: readonly Point[] | null
  sourcePathLength: number
  balanced: boolean
  visualKey: string
  committedPointCount: number
  paths: Map<string, Path2D>
}

export const SMOOTH_GRADIENT_PREVIEW_SAMPLE_LIMIT = 96_000

export const DITHERED_GRADIENT_PREVIEW_SAMPLE_LIMIT = 1_500_000

export const SELECTION_PATH_PREVIEW_BATCH_THRESHOLD = 32

export const insideSelection = (selection: SelectionMask, point: Point): boolean => selectionContains(selection, point.x, point.y)

export const pointerIsOverCanvas = (canvas: HTMLCanvasElement, pointer: { clientX: number; clientY: number; visible: boolean }): boolean => {
  if (!pointer.visible || typeof document.elementsFromPoint !== 'function') return pointer.visible
  return document.elementsFromPoint(pointer.clientX, pointer.clientY).some((element) => element === canvas)
}

export const selectedTextBoxForSession = (session: DocumentSession): SelectionRect | null => {
  if (session.selectedGroupIds.length > 0 || session.selectedLayerIds.length !== 1) return null
  const layer = session.document.layers.find((candidate) => candidate.id === session.selectedLayerIds[0] && candidate.kind === 'text')
  if (!layer) return null
  const timeline = ensureAnimationDocument(session.document)
  const cel = timeline.cels.find((candidate) => candidate.layerId === layer.id && candidate.frameId === timeline.activeFrameId)
  const source = resolveAnimationCel(timeline, cel ?? null) ?? cel
  const text = source?.text
  if (text?.layoutMode !== 'box' || !text.boxWidth || !text.boxHeight) return null
  return {
    x: text.originX ?? source?.surface?.offsetX ?? layer.offsetX,
    y: text.originY ?? source?.surface?.offsetY ?? layer.offsetY,
    width: text.boxWidth,
    height: text.boxHeight
  }
}

export const shareCanvasToolSettings = (target: DocumentSession, source: DocumentSession): DocumentSession => ({
  ...target,
  tool: source.tool,
  moveKind: source.moveKind,
  primaryColor: source.primaryColor,
  secondaryColor: source.secondaryColor,
  brushSize: source.brushSize,
  brushShape: source.brushShape,
  brushAngle: source.brushAngle,
  brushDither: source.brushDither,
  brushTexture: source.brushTexture,
  brushTextureScale: source.brushTextureScale,
  brushPaintMode: source.brushPaintMode,
  brushImageId: source.brushImageId,
  brushImage: source.brushImage,
  brushImageTemporary: source.brushImageTemporary,
  brushImageSettings: source.brushImageSettings,
  brushProfiles: source.brushProfiles,
  proceduralBrushSettings: source.proceduralBrushSettings,
  proceduralAntialias: source.proceduralAntialias,
  proceduralAntialiasStrength: source.proceduralAntialiasStrength,
  brushDynamics: source.brushDynamics,
  brushPressure: source.brushPressure,
  shapeKind: source.shapeKind,
  lineKind: source.lineKind,
  curveAnchorCount: source.curveAnchorCount,
  shapeRatio: source.shapeRatio,
  shapeRounded: source.shapeRounded,
  shapeCornerRadius: source.shapeCornerRadius,
  fillMode: source.fillMode,
  fillKind: source.fillKind,
  fillTolerance: source.fillTolerance,
  fillGapClosing: source.fillGapClosing,
  fillGapThreshold: source.fillGapThreshold,
  gradientTolerance: source.gradientTolerance,
  gradientContiguous: source.gradientContiguous,
  gradientType: source.gradientType,
  gradientDither: source.gradientDither,
  gradientFreeform: source.gradientFreeform,
  gradientStops: source.gradientStops,
  moveAutoSelect: source.moveAutoSelect,
  selectionKind: source.selectionKind,
  selectionMode: source.selectionMode,
  selectionRounded: source.selectionRounded,
  selectionCornerRadius: source.selectionCornerRadius,
  wandTolerance: source.wandTolerance,
  wandContiguous: source.wandContiguous,
  wandGapClosing: source.wandGapClosing,
  wandGapThreshold: source.wandGapThreshold,
  perfectPixels: source.perfectPixels,
  symmetryAxes: source.symmetryAxes,
  symmetryAxesInitialized: source.symmetryAxesInitialized,
  airbrushParticleRadius: source.airbrushParticleRadius,
  airbrushParticleShape: source.airbrushParticleShape,
  airbrushScatterRadius: source.airbrushScatterRadius,
  airbrushDensity: source.airbrushDensity,
  airbrushIntervalMs: source.airbrushIntervalMs,
  liquifyRadius: source.liquifyRadius,
  liquifyMode: source.liquifyMode,
  liquifyStrength: source.liquifyStrength,
  liquifySmoothing: source.liquifySmoothing,
  liquifySmoothingStrength: source.liquifySmoothingStrength,
})

export const timelineSelectionPrecedesCanvasMarquee = (session: DocumentSession, selection = session.selection): boolean => timelineSelectionPrecedesMarquee({
  canvasSelectionActive: Boolean(selection),
  activeMaskId: session.activeLayerMaskId,
  selectedFrameCount: session.selectedAnimationFrameIds.length,
  selectedCellCount: session.selectedAnimationCellKeys.length,
  layerSelectionExplicit: session.layerSelectionExplicit === true,
  selectedLayerCount: session.selectedLayerIds.length,
  selectedGroupCount: session.selectedGroupIds.length,
  selectedGroupId: session.selectedGroupId
})
