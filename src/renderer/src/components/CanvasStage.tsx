import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { FreeTileInstance, RasterLayer, RgbaColor, SelectionMask, SelectionMode, SelectionQuad, SelectionRect, TilemapCell } from '@shared/types'
import { compositePixelWithLayerColor, compositeRegion, createCompositePointReplacementSampler, createCompositePointSampler, createId, createNormalCompositePointReplacementSampler, createNormalCompositePointSampler, expandLayerStyleInvalidationRect, getActiveLayer, getLayerIdsInGroup, getPaletteEntry, isLayerEffectivelyLocked, isLayerEffectivelyVisible, layerContentBounds, layerIndexAt, layerMaskDisplayColor, readLayerColor, readLayerColorAt, readLayerMaskDisplayColorAt, readLayerVisibleColorAt, renderLayerMaskRegion, resolveLayerCanvasColor } from '@/core/document'
import { beginPixelEdit, revertPixelEdit, type HistoryEntry } from '@/core/history'
import { beginCanvasToolGesture, clearCanvasToolGestures, endCanvasToolGesture } from '@/core/canvas-tool-gesture-lock'
import { blendOver, relativeLuminanceColor, TRANSPARENT, unpackColor } from '@/core/raster'
import { applyGradient, constrainGradientEndpoint, createGradientColorSampler, gradientRegionSelection, type GradientGeometryOptions } from '@/core/gradient'
import { DEFAULT_BRUSH_DITHER_SETTINGS } from '@/core/gradient-color'
import { DEFAULT_GRID_SETTINGS, gridCellBoundsAt, gridLinePositions, shouldRenderPixelGrid, snapPointToGrid, snapSelectionBoundsToGrid, snapSelectionTranslationToGrid } from '@/core/grid'
import { alignmentThresholdForZoom, resolveAlignment } from '@/core/alignment'
import { appendPerfectPixelSegment, applySelectionTransform, applySelectionTranslationPreview, bezierCurvePixelPoints, brushMaskOffsets, brushPathStampPoints, brushStampAnchor, brushStrokeInvalidationRects, captureSelectionTransform, filledPolygonPathPixelPoints, filledShapePathPixelPoints, floodFillSymmetric, inheritBrushPaintBaseline, interpolateBrushAngle, lineShapePixelPoints, outlinePixelSamples, paintBrush, paintBrushPath, paintLine, paintShape, paintShapePixelPoints, perfectPixelPathPoints, restoreSelectionTranslationPreview, shapeBoundaryPixelPoints, selectionTranslationPreviewEdit, type BrushGradientSample, type OutlinePixelSample, type SelectionTransformLayerState, type SelectionTransformSource } from '@/core/tools'
import { resolveOutlineStrokeColor } from '@/core/outline-settings'
import { applySelectionTransformLayerState, captureAnimationFrameSelectionTransformStates, selectionTransformLayerForState } from '@/core/selection-transform-targets'
import { useWorkspace, type DocumentSession } from '@/store/workspace'
import { activeLayerMask, activePaintLayer, isToolAvailableForSession, selectedTransformLayersAreEditable, selectedTransformLayersForSession } from '@/store/workspace-session'
import { startCanvasSelection } from '@/components/layer-panel-reveal'
import { DEFAULT_GRID_COLOR, ISO_VIEW_PREFERENCES_PREVIEW_EVENT, loadEditorPreferences, parseIsoViewPreferences, type BrushPreviewMode, type CheckerboardPreferences, type CursorScale, type EyedropperMagnifierStyle, type GridColorPreferences, type IsoViewPreferences, type OnionSkinPreferences, type RotationIndicatorPosition, type SelectionPreviewColorMode, type SymmetryAxisPreferences, type WheelZoomMode, type ZoomToolDragMode } from '@/core/file-preferences'
import { clampCanvasViewPan, displayedCanvasCenter, documentPointFromViewportPoint, documentPointFromViewportPointContinuous, mirrorViewportPoint, rotateViewAroundViewportPoint, rotateViewportPoint, rotationIndicatorFitsCanvas, rotationIndicatorPointBetweenPointerAndCanvasCenter, unrotatedViewportPoint, unrotateViewportPoint, viewCanvasOrigin, viewPanDeltaFromScreen, viewRotationPivot, zoomViewAroundViewportPoint } from '@/core/view-geometry'
import { createCanvasRenderPlan, deviceAlignedCanvasRect, deviceAlignedCoordinate, deviceAlignedDocumentPointAtViewport, deviceAlignedPixelRect, repeatedDeviceAlignedCanvasRect, type CanvasDeviceScale, type CanvasDeviceScaleInput } from '@/core/canvas-render-plan'
import { canvasBackingRatioForInterfaceScale, canvasClientDeltaForInterfaceScale, canvasViewportPointForInterfaceScale, canvasViewportPointToCss, canvasViewportSizeForInterfaceScale } from '@/core/canvas-interface-scale'
import { balancedStairLinePoints, constrainLineEndpoint } from '@/core/pixel-line'
import { advanceIsoAlignedStrokeSegment, isoGridLineSegment, isoGuidePixelPattern, isoGuideSegments, isoGuideSpacingForZoom, isoLineEndpoint, snapIsoPointToGridVertex, traceIsoGridPointerEdges, updateIsoAlignedStrokePath } from '@/core/isometric'
import { cloneSelection, combineSelection, lassoSelection, magicWandSelection, polygonSelection, rasterLinePoints, rectSelection, rotateSelectionTargetAroundPivot, rotatedEllipseSelection, rotatedRectSelection, selectionContains, selectionQuadBounds, selectionQuadFromRect, selectionQuadTransform, shearTransformedSelection, shiftSelection, transformedSelectionBounds, transformedSelectionCenter, transformedSelectionControlPoints, transformedSelectionPivotPreset, transformedSelectionShearDirection, transformSelectionMask, transformSelectionMaskQuad, type SelectionShearTransform } from '@/core/selection'
import { CANVAS_RESIZE_PREVIEW_EVENT, canvasResizePreviewClippedRects, canvasResizePreviewExposedRects, drawCanvasResizePreviewLayers } from '@/core/canvas-resize-preview'
import { SLICE_PREVIEW_EVENT } from '@/core/slice-preview'
import { deriveShortcutConflicts, dispatchWheelShortcutInput, loadShortcutBindings, matchingModifierShortcut, modifierShortcutHeldByBindings, shortcutBindingsFor, shortcutMatchesAnyEvent, shortcutReleasedByBindings } from '@/core/shortcuts'
import { paletteSamplingShortcutActive } from '@/core/palette-sampling-shortcut'
import { beginCanvasColorSampling, canvasColorSamplingActiveFor, canvasColorSamplingIntentActive, clearCanvasColorSamplingIntentFor, endCanvasColorSampling, registerCanvasColorSamplingSurface, routeCanvasColorSampling, routeCanvasColorSamplingIntent, setCanvasColorSamplingIntent } from '@/core/canvas-color-sampling'
import { CanvasInputState, PointerPressureAdapter, appendCanvasPathStep, beginBrushSpeedTracking, beginTemporaryCenteredMarqueeResize, brushLineConnectionOverridesTemporaryMove, canvasGestureForPreview, centerMarqueeBoundsAtCreationPoint, centeredShapeBounds, clampCanvasZoom as clampZoom, coalescedPointerClientPoints, constrainedTranslation, createCanvasPanDrag, createMarqueeResizeStart, deferredSelectionCommitInvalidationRects, deferredSelectionPreviewMaterializationRequired, deferredSelectionPreviewOwner, drawingSizePreviewTargetForDrag, floatingSelectionCopyMode, isCanvasViewNavigationDrag, isCanvasViewNavigationTool, isPendingCanvasPathGesture, isQuickSelectionSecondPress, marqueeSelectionCommit, normalizeCanvasWheelDelta, paletteSamplingShortcutStartsPrimarySample, polygonLassoClosedPathPoints, polygonLassoPreviewPoints, quickSelectCellDragBounds, redoCanvasPathStep, registerPendingCanvasGestureHistory, resizeRotatedMarqueeBounds, resizeSelectionBounds, resizeTransformedSelectionBounds, resolveMarqueeModifierMode, restoreCanvasDragAfterPan, restoreTemporaryCenteredMarqueeResize, revertCancelledCanvasDragPixelChanges, sampledForegroundColorToAdd, selectionGestureMoved, selectionHitStartsContentMove, selectionInteractionHit, selectionMarqueeUsesConstraint, selectionMovePointerDelta, selectionOverlayFrameForDrag, selectionPivotAfterResize, selectionPivotAtDragPoint, selectionPivotHit, selectionResizeHit, selectionRotationAngle, selectionFreeTransformContentHit, selectionFreeTransformHit, selectionTransformedInteractionHit, selectionTransformDeferredPreviewEnabled, selectionTransformGeometrySource, selectionTransformModifiers, selectionTransformPreviewChanged, shapeBounds, shouldClosePolygonLasso, shouldRestartFloatingSelectionForCopy, shouldReuseFloatingSelectionSourceForCopy, shouldStartCanvasPan, snapSelectionRotation, steppedCanvasZoom as steppedZoom, temporaryMoveForCanvasInteractionAllowed, temporaryMoveSuppressesToolPreview, temporaryMoveToolAllowed, temporaryTransformOffset, translatedSelectionRect, translatedSelectionTransformPreviewMask, undoActiveCanvasPathGesture, updateBrushSpeedTracking, viewDragClientDelta, wheelCanvasZoom, zoomDragModeForModifiers, zoomDragTarget, type CanvasDragState as DragState, type CanvasPoint as Point, type QuickSelectionPress, type SelectionHandle, type SelectionHit, type SelectionRotationHandle, type SelectionShearHandle } from '@/core/canvas-input'
import { canvasCursors, canvasStatusTextColor, canvasToolCursor, colorLuminance, directionalResizeCursors, directionalShearCursors, previewCursorTools, resizeCursors, rotationCursors, selectionCornerResizeCursorForPoints, selectionResizeCursorForHandle, selectionRotationCursorForPosition, selectionShearCursorForDirection, shearCursors, selectionCreationCursor, selectionCursorCornerRects, selectionPathPreviewPixelVisible, selectionPreviewPixels, selectionTransformDragCursor, transparencyColorAt } from '@/core/canvas-visuals'
import { defaultSymmetryCenter, hasSymmetry, moveSymmetryCenter, symmetryAxisDragAllowed, symmetryAxisSegment, symmetryPoints, symmetrySelection, symmetrySelectionDragDelta, transformSymmetrySelection, type SymmetryAxes, type SymmetryAxis } from '@/core/symmetry'
import { beginAdjustmentPreviewEdit, endAdjustmentPreviewEdit, hasAdjustmentPreviewController, prepareAdjustmentPreviewEdit, renderAdjustmentPreviewEdit } from '@/core/adjustment-preview-lifecycle'
import { notifyAnimationCelThumbnailPreview, notifyCanvasPreview, notifyLayerMaskThumbnailPreview, type CanvasPreviewSnapshot } from '@/core/canvas-preview-lifecycle'
import { timelineSelectionPrecedesMarquee } from '@/core/animation-timeline-focus'
import { CanvasCompositeCache } from '@/components/canvas-composite-cache'
import { OnionSkinCompositeCache } from '@/components/onion-skin-composite-cache'
import { animationFrameIdsForCellKeys, resolveCanvasMoveAnimationCellKeys, resolveCanvasMoveLayerIds, shouldUseFreeTileInstanceMove } from '@/components/canvas-move-selection'
import { drawSelectionOutline, drawSelectionSizeLabel, selectionScreenBox, selectionScreenPoint, type RasterContext2D, type SelectionBoundaryCache } from '@/components/canvas-selection-renderer'
import { useCanvasViewPreview } from '@/components/useCanvasViewPreview'
import { PerformanceProfiler } from '@/components/PerformanceProfiler'
import { useI18n } from '@/components/I18nProvider'
import { clearCanvasBacking, syncCanvasDisplaySize } from '@/components/canvas-display-size'
import { onionSkinFrameRefs } from '@/core/onion-skin'
import { resolveTheme } from '@/core/theme'
import { pixelSamplingMode } from '@/core/pixel-display'
import { preserveCanvasSelection, revealLayerInPanel } from '@/components/layer-panel-reveal'
import { layerIdsInVisualStackOrder } from '@/core/layer-panel-layout'
import { publishCanvasColorSample, publishCanvasColorSamplingCompleted } from '@/components/color-sampling-events'
import { eyedropperMagnifierPixelScale } from '@/core/eyedropper-magnifier'
import { isPressurePointerType, resolveBrushDynamics, smoothBrushSizeEnvelope } from '@/core/pressure'
import { airbrushParticleSize, airbrushSymmetryPoints, generateAirbrushParticles } from '@/core/airbrush'
import { activeBrushInputsForTool } from '@/core/brushes'
import { clampSliceRect, moveSliceRect, moveSliceRects, sliceAtPoint } from '@/core/slices'
import { animationCelKey, animationCelOffsetsForKeys, ensureAnimationDocument, parseAnimationCelKey, resolveAnimationCel } from '@/core/animation'
import { animationMaskOffsetsForLayerMove } from '@/store/workspace-layer-move'
import { activeTilemapCelTarget, applyTilemapDocumentEdit, captureTilemapSelectionMove, previewTilemapSelectionMove, tilemapEditPreviewTilePixels, writeTilemapCell } from '@/core/tilemap-document'
import { beginTilemapEdit, expandSelectionToTilemapCells, nearestTileRepeatEquivalent, normalizeSelectionForTileRepeatPreview, readTilesetTilePixels, tilemapCellBounds, tilemapCellIndexAtPoint, tilemapCellLineIndices, tilemapEditableSelectionAtPoint, tilemapSourcePointForCell, tilesetHasOnlyTransparentTile, tileRepeatContinuousPreviewPlacements, tileRepeatLinePoints, tileRepeatLineSegments, tileRepeatMappedPointForCopies, tileRepeatOffsetsForViewport, tileRepeatPreviewPlacements, wrapDocumentPointForTileRepeat, wrapSelectionMaskForTileRepeat } from '@/core/tilemap'
import { freeTileInstanceAtPoint, freeTileInstanceBounds, freeTileSourceEditTargetAtPoint, freeTileSourceForInstance, freeTileSourcePointForInstance, freeTileSourceStampOrigin, freeTileTileIdForInstance } from '@/core/free-tile'
import { activeFreeTileCelTarget, captureFreeTileSourceSnapshot, freeTileInstanceAtDocumentPoint, freeTileSourceForId } from '@/core/free-tile-document'
import { createFreeTileSourceEditRaster, freeTileSelectionForInstanceEdit, freeTileSelectionFromEditRaster, freeTileSelectionToEditRaster, freeTileSourceSnapshotFromEditRaster, freeTileTransformTargetToEditRaster, selectionCoversRect, type FreeTileSourceEditRaster } from '@/core/free-tile-edit'
import { openTextToolDialog, TEXT_TOOL_PREVIEW_EVENT, type TextToolPreviewDetail } from '@/components/text-tool-events'
import { clearTilesetTilePreview, publishTilesetTilePreview } from '@/components/tileset-preview-events'
import { FREE_TILE_INSTANCE_FLASH_EVENT, publishFreeTileInstanceFlash, type FreeTileInstanceFlashDetail } from '@/components/free-tile-instance-events'
import { publishSelectionSizePreview } from '@/components/selection-size-preview-events'
import { applyQuickToolTarget, quickToolNeedsContextualCanvasHandling } from '@/core/quick-tools'
import { currentQuickToolMatch, syncHeldShortcutModifiers, useQuickToolShortcut } from '@/components/useQuickToolShortcut'
import rotationBackground1 from '@/assets/rotation-indicator/background-1.png'
import rotationBackground2 from '@/assets/rotation-indicator/background-2.png'
import rotationBackground3 from '@/assets/rotation-indicator/background-3.png'
import rotationBackground4 from '@/assets/rotation-indicator/background-4.png'
import rotationBackground5 from '@/assets/rotation-indicator/background-5.png'
import rotationBackground6 from '@/assets/rotation-indicator/background-6.png'
import rotationPointer from '@/assets/rotation-indicator/pointer.png'
import eyedropperPointerDark from '@/assets/pixel-icons/02-Slice-2.png'
import eyedropperPointerLight from '@/assets/pixel-icons/03-Slice-3.png'
import eyedropperMagnifierFrame from '@/assets/eyedropper-magnifier-frame.svg?raw'
import eyedropperMagnifierSampledMask from '@/assets/eyedropper-magnifier-sampled-mask.svg?raw'
import eyedropperMagnifierPreviousMask from '@/assets/eyedropper-magnifier-previous-mask.svg?raw'
import selectionPivotIcon from '@/assets/pixel-icons/selection-pivot.svg'
import { cursorOverlayDescriptor, setNativeCursorVisible } from '@/platform/cursor-theme'
import { createPolygonPathRasterCache } from '@/core/canvas-input'

const nonContentPreviewDragKinds = new Set([
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
  'create-text-box',
  'transform-text-box'
])

const SELECTION_PIVOT_ICON_SIZE = 18
const SELECTION_PIVOT_ICON_OFFSET = SELECTION_PIVOT_ICON_SIZE / 2
const EYEDROPPER_MAGNIFIER_BASE_SIZE = 256
const EYEDROPPER_MAGNIFIER_VIEWPORT_SIZE = 204
const drawDeviceAlignedCanvasBorder = (
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
const selectionBoundsEqual = (left: SelectionRect, right: SelectionRect): boolean => left.x === right.x
  && left.y === right.y
  && left.width === right.width
  && left.height === right.height
const symmetryGuideAxisEnabled = (axes: SymmetryAxes, axis: SymmetryAxis): boolean =>
  Boolean(axes[axis] || (axes.rotational && (axis === 'horizontal' || axis === 'vertical')))

interface GradientPreviewSurface { canvas: OffscreenCanvas; context: OffscreenCanvasRenderingContext2D; imageData: ImageData; pixels: Uint8ClampedArray; width: number; height: number }
interface GradientPreviewCoverageCache {
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
interface SymmetryDragState { axis: SymmetryAxis | 'center'; pointerId: number }
interface MoveLayerContentPreview { layerId: string; bounds: SelectionRect; layerOffsetX: number; layerOffsetY: number }
interface MoveLayerClickFlash extends MoveLayerContentPreview { expiresAt: number }
interface FreeTileInstanceFlash { instanceId: string; expiresAt: number }
interface LineAnchorHistory {
  documentId: string
  layerId: string
  tool: 'pencil' | 'eraser'
  point: Point
  entry: HistoryEntry
  baseline: Map<number, number>
  mergeWithNext: boolean
}
interface PolygonPathPreviewRenderCache {
  sourcePath: readonly Point[] | null
  sourcePathLength: number
  balanced: boolean
  visualKey: string
  committedPointCount: number
  paths: Map<string, Path2D>
}
const SMOOTH_GRADIENT_PREVIEW_SAMPLE_LIMIT = 96_000
const DITHERED_GRADIENT_PREVIEW_SAMPLE_LIMIT = 1_500_000
const SELECTION_PATH_PREVIEW_BATCH_THRESHOLD = 32
const insideSelection = (selection: SelectionMask, point: Point): boolean => selectionContains(selection, point.x, point.y)
const pointerIsOverCanvas = (canvas: HTMLCanvasElement, pointer: { clientX: number; clientY: number; visible: boolean }): boolean => {
  if (!pointer.visible || typeof document.elementsFromPoint !== 'function') return pointer.visible
  return document.elementsFromPoint(pointer.clientX, pointer.clientY).some((element) => element === canvas)
}
const selectedTextBoxForSession = (session: DocumentSession): SelectionRect | null => {
  if (session.selectedGroupIds.length > 0 || session.selectedLayerIds.length !== 1) return null
  const layer = session.document.layers.find((candidate) => candidate.id === session.selectedLayerIds[0] && candidate.kind === 'text')
  if (!layer) return null
  const timeline = ensureAnimationDocument(session.document)
  const cel = timeline.cels.find((candidate) => candidate.layerId === layer.id && candidate.frameId === timeline.activeFrameId)
  const source = resolveAnimationCel(timeline, cel ?? null) ?? cel
  const text = source?.text
  if (!text?.boxWidth || !text.boxHeight) return null
  return {
    x: text.originX ?? source?.surface?.offsetX ?? layer.offsetX,
    y: text.originY ?? source?.surface?.offsetY ?? layer.offsetY,
    width: text.boxWidth,
    height: text.boxHeight
  }
}

const shareCanvasToolSettings = (target: DocumentSession, source: DocumentSession): DocumentSession => ({
  ...target,
  tool: source.tool,
  moveKind: source.moveKind,
  primaryColor: source.primaryColor,
  secondaryColor: source.secondaryColor,
  brushSize: source.brushSize,
  brushShape: source.brushShape,
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
  airbrushIntervalMs: source.airbrushIntervalMs
})

const timelineSelectionPrecedesCanvasMarquee = (session: DocumentSession, selection = session.selection): boolean => timelineSelectionPrecedesMarquee({
  canvasSelectionActive: Boolean(selection),
  activeMaskId: session.activeLayerMaskId,
  selectedFrameCount: session.selectedAnimationFrameIds.length,
  selectedCellCount: session.selectedAnimationCellKeys.length,
  layerSelectionExplicit: session.layerSelectionExplicit === true,
  selectedLayerCount: session.selectedLayerIds.length,
  selectedGroupCount: session.selectedGroupIds.length,
  selectedGroupId: session.selectedGroupId
})

export function CanvasStage({ session: storedSession }: { session: DocumentSession }) {
  const { t } = useI18n()
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const penCursorRef = useRef<HTMLImageElement>(null)
  const penCursorStateRef = useRef({ active: false, x: 0, y: 0 })
  const cursorPreferencesRef = useRef<{ useLocalCursors: boolean; cursorScale: CursorScale } | null>(null)
  if (!cursorPreferencesRef.current) {
    const preferences = loadEditorPreferences()
    cursorPreferencesRef.current = { useLocalCursors: preferences.useLocalCursors, cursorScale: preferences.cursorScale }
  }
  const textToolPreviewRef = useRef<import('@shared/types').AnimationCelSurface | null>(null)
  const textToolBoxRef = useRef<SelectionRect | null>(null)
  const publishedTilesetPreviewRef = useRef<string | null>(null)
  const selectionCanvasRef = useRef<HTMLCanvasElement>(null)
  const rotationSceneRef = useRef<OffscreenCanvas | null>(null)
  const checkerboardTileRef = useRef<{ key: string; canvas: OffscreenCanvas } | null>(null)
  const isoGuideTileRef = useRef<{ key: string; canvas: OffscreenCanvas } | null>(null)
  const gradientPreviewSurfaceRef = useRef<GradientPreviewSurface | null>(null)
  const gradientPreviewCoverageCacheRef = useRef<GradientPreviewCoverageCache | null>(null)
  const compositeReplacementSamplerRef = useRef<{ document: DocumentSession['document']; revision: number; layerId: string; sampler: (x: number, y: number, replacement: RgbaColor) => RgbaColor } | null>(null)
  const selectionRotationSceneRef = useRef<OffscreenCanvas | null>(null)
  const rotationIndicatorRef = useRef<HTMLDivElement>(null)
  const rotationPointerRef = useRef<HTMLDivElement>(null)
  const rotationIndicatorAnchorRef = useRef<Point | null>(null)
  const eyedropperMagnifierRef = useRef<HTMLDivElement>(null)
  const eyedropperMagnifierCanvasRef = useRef<HTMLCanvasElement>(null)
  const eyedropperMagnifierSourceRef = useRef<OffscreenCanvas | null>(null)
  const eyedropperMagnifierSampledMaskRef = useRef<HTMLSpanElement>(null)
  const eyedropperMagnifierPreviousMaskRef = useRef<HTMLSpanElement>(null)
  const eyedropperPointerDarkRef = useRef<HTMLImageElement>(null)
  const eyedropperPointerLightRef = useRef<HTMLImageElement>(null)
  const eyedropperOriginalColorRef = useRef<RgbaColor | null>(null)
  const canvasColorSampleAtClientPointRef = useRef<(clientX: number, clientY: number) => RgbaColor | null>(() => null)
  const [rotationIndicatorPosition, setRotationIndicatorPosition] = useState<RotationIndicatorPosition>(() => loadEditorPreferences().rotationIndicatorPosition)
  const [interfaceScale, setInterfaceScale] = useState(() => loadEditorPreferences().uiScale)
  const [drawingBrushPreviewEnabled, setDrawingBrushPreviewEnabled] = useState(() => loadEditorPreferences().drawingBrushPreviewEnabled)
  const [zoomToolDragMode, setZoomToolDragMode] = useState<ZoomToolDragMode>(() => loadEditorPreferences().zoomToolDragMode)
  const [viewDragSensitivity, setViewDragSensitivity] = useState(() => loadEditorPreferences().viewDragSensitivity)
  const [brushPreviewMode, setBrushPreviewMode] = useState<BrushPreviewMode>(() => loadEditorPreferences().brushPreviewMode)
  const [checkerboard, setCheckerboard] = useState<CheckerboardPreferences>(() => loadEditorPreferences().checkerboard)
  const [gridColors, setGridColors] = useState<GridColorPreferences>(() => {
    const preferences = loadEditorPreferences()
    return { pixelGridColor: preferences.pixelGridColor, gridColor: preferences.gridColor }
  })
  const [alignmentPreferences, setAlignmentPreferences] = useState(() => {
    const preferences = loadEditorPreferences()
    return {
      gridAlignmentEnabled: preferences.gridAlignmentEnabled,
      smartAlignmentEnabled: preferences.smartAlignmentEnabled,
      alignmentGuidesVisible: preferences.alignmentGuidesVisible,
      alignmentThreshold: preferences.alignmentThreshold
    }
  })
  const [sliceColor, setSliceColor] = useState<RgbaColor>(() => loadEditorPreferences().sliceColor)
  const [freeTileInstanceOutlineColor, setFreeTileInstanceOutlineColor] = useState<RgbaColor>(() => loadEditorPreferences().freeTileInstanceOutlineColor)
  const [textBoxColor, setTextBoxColor] = useState<RgbaColor>(() => loadEditorPreferences().textBoxColor)
  const [canvasResizeColor, setCanvasResizeColor] = useState<RgbaColor>(() => loadEditorPreferences().canvasResizeColor)
  const [sliceOutlinesVisible, setSliceOutlinesVisible] = useState(() => loadEditorPreferences().sliceOutlinesVisible)
  const [wheelZoomEnabled, setWheelZoomEnabled] = useState(() => loadEditorPreferences().wheelZoomEnabled)
  const [wheelZoomMode, setWheelZoomMode] = useState<WheelZoomMode>(() => loadEditorPreferences().wheelZoomMode)
  const [shiftLinePreviewEnabled, setShiftLinePreviewEnabled] = useState(() => loadEditorPreferences().shiftLinePreviewEnabled)
  const [gradientLineVisible, setGradientLineVisible] = useState(() => loadEditorPreferences().gradientLineVisible)
  const [gradientLineColor, setGradientLineColor] = useState<RgbaColor>(() => loadEditorPreferences().gradientLineColor)
  const [lassoPreviewClosed, setLassoPreviewClosed] = useState(() => loadEditorPreferences().lassoPreviewClosed)
  const [eyedropperSwitchToPencil, setEyedropperSwitchToPencil] = useState(() => loadEditorPreferences().eyedropperSwitchToPencil)
  const [eyedropperMagnifierEnabled, setEyedropperMagnifierEnabled] = useState(() => loadEditorPreferences().eyedropperMagnifierEnabled)
  const [eyedropperMagnifierStyle, setEyedropperMagnifierStyle] = useState<EyedropperMagnifierStyle>(() => loadEditorPreferences().eyedropperMagnifierStyle)
  const [eyedropperMagnifierSize, setEyedropperMagnifierSize] = useState(() => loadEditorPreferences().eyedropperMagnifierSize)
  const [eyedropperMagnifierDistortionEnabled, setEyedropperMagnifierDistortionEnabled] = useState(() => loadEditorPreferences().eyedropperMagnifierDistortionEnabled)
  const [moveLayerContentPreviewEnabled, setMoveLayerContentPreviewEnabled] = useState(() => loadEditorPreferences().moveLayerContentPreviewEnabled)
  const [moveLayerClickFlashEnabled, setMoveLayerClickFlashEnabled] = useState(() => loadEditorPreferences().moveLayerClickFlashEnabled)
  const [moveLayerClickFlashDuration, setMoveLayerClickFlashDuration] = useState(() => loadEditorPreferences().moveLayerClickFlashDuration)
  const [selectionCrosshair, setSelectionCrosshair] = useState(() => loadEditorPreferences().selectionCrosshair)
  const [selectionPreviewColorMode, setSelectionPreviewColorMode] = useState<SelectionPreviewColorMode>(() => loadEditorPreferences().selectionPreviewColorMode)
  const [selectionPreviewColor, setSelectionPreviewColor] = useState<RgbaColor>(() => loadEditorPreferences().selectionPreviewColor)
  const [selectionSizeVisible, setSelectionSizeVisible] = useState(() => loadEditorPreferences().selectionSizeVisible)
  const [balancedShiftLineEnabled, setBalancedShiftLineEnabled] = useState(() => loadEditorPreferences().balancedShiftLineEnabled)
  const [lineDirectionStep, setLineDirectionStep] = useState(() => loadEditorPreferences().lineDirectionStep)
  const [onionSkin, setOnionSkin] = useState<OnionSkinPreferences>(() => loadEditorPreferences().onionSkin)
  const [timelineHidden, setTimelineHidden] = useState(() => loadEditorPreferences().timelineHidden)
  const [symmetryAxisPreferences, setSymmetryAxisPreferences] = useState<SymmetryAxisPreferences>(() => loadEditorPreferences().symmetryAxis)
  const [isoViewPreferences, setIsoViewPreferences] = useState<IsoViewPreferences>(() => loadEditorPreferences().isoView)
  const [activeTheme, setActiveTheme] = useState(() => resolveTheme(loadEditorPreferences().theme))
  const [shortcuts, setShortcuts] = useState(loadShortcutBindings)
  const shortcutConflictState = useMemo(() => deriveShortcutConflicts(shortcuts), [shortcuts])
  const quickToolMatch = useQuickToolShortcut(shortcuts)
  const directQuickToolTarget = quickToolMatch && !quickToolNeedsContextualCanvasHandling(quickToolMatch.target) ? quickToolMatch.target : null
  const activeDocumentId = useWorkspace((state) => state.activeId)
  const activeToolSession = useWorkspace((state) => state.sessions.find((item) => item.document.id === state.activeId) ?? null)
  // Sessions are updated in place, so subscribe to the scalar that drives the
  // hover preview as well as the active session reference.
  const activeToolBrushSize = useWorkspace((state) => state.sessions.find((item) => item.document.id === state.activeId)?.brushSize ?? null)
  const localSession = applyQuickToolTarget(storedSession, directQuickToolTarget)
  const session = activeToolSession && activeToolSession.document.id !== storedSession.document.id
    ? shareCanvasToolSettings(localSession, applyQuickToolTarget(activeToolSession, directQuickToolTarget))
    : localSession
  const currentQuickTool = () => currentQuickToolMatch(shortcuts, shortcutConflictState)
  const quickToolActive = (tool: DocumentSession['tool']): boolean => currentQuickTool()?.target.tool === tool
  const quickMoveToolActive = (): boolean => currentQuickTool()?.id === 'tool.move.quick'
  const sessionWithActiveQuickTool = (current: DocumentSession): DocumentSession => {
    const match = currentQuickTool()
    return applyQuickToolTarget(current, match && !quickToolNeedsContextualCanvasHandling(match.target) ? match.target : null)
  }
  const sharedCanvasSession = (current: DocumentSession): DocumentSession => {
    const state = useWorkspace.getState()
    const active = state.sessions.find((item) => item.document.id === state.activeId)
    return active && active.document.id !== current.document.id
      ? shareCanvasToolSettings(current, sessionWithActiveQuickTool(active))
      : current
  }
  const liveInputSession = (): DocumentSession => {
    const current = useWorkspace.getState().sessions.find((item) => item.document.id === storedSession.document.id)
    if (!current) return session
    return sessionWithActiveQuickTool(sharedCanvasSession(current))
  }
  const inputRef = useRef(new CanvasInputState())
  const pressureAdapterRef = useRef(new PointerPressureAdapter())
  const quickSelectionPressRef = useRef<QuickSelectionPress | null>(null)
  const quickSelectionHandledAtRef = useRef<number | null>(null)
  const wheelBrushSizePreviewRef = useRef(false)
  const nativeWheelHandlerRef = useRef<(event: WheelEvent) => void>(() => {})
  const lastNativeWheelRef = useRef<{ at: number; delta: number; type: string } | null>(null)
  const symmetryDragRef = useRef<SymmetryDragState | null>(null)
  const rafRef = useRef<number | null>(null)
  const drawRequestRef = useRef<number | null>(null)
  // Keyboard listeners intentionally live across brush changes. Deferred draws
  // must therefore resolve the current render function instead of the brush
  // configuration that was active when the listener was registered.
  const drawRef = useRef<() => void>(() => {})
  const selectionOverlayDrawRef = useRef<() => void>(() => {})
  const stageSizeRef = useRef({ width: 0, height: 0 })
  const stageDisplaySizeRef = useRef({ width: 0, height: 0 })
  const stageSizeScaleRef = useRef(interfaceScale)
  const compositeCacheRef = useRef(new CanvasCompositeCache())
  const compositePointSamplerRef = useRef<{ document: DocumentSession['document']; revision: number; sampler: (x: number, y: number) => RgbaColor } | null>(null)
  const cursorCompositePointSamplerRef = useRef<{
    document: DocumentSession['document']
    revision: number
    activeLayerId: string
    backgroundLayersKey: string
    sampler: (x: number, y: number) => RgbaColor
  } | null>(null)
  const cursorCompositePointReplacementSamplerRef = useRef<{
    document: DocumentSession['document']
    revision: number
    layerId: string
    sampler: (x: number, y: number, replacement: RgbaColor) => RgbaColor
  } | null>(null)
  const renderDocumentSizeRef = useRef({ width: session.document.width, height: session.document.height })
  const onionSkinCacheRef = useRef(new OnionSkinCompositeCache())
  const outlinePreviewCacheRef = useRef<{ revision: number; layerId: string; selection: SelectionMask | null; preview: NonNullable<DocumentSession['outlinePreview']>; samples: OutlinePixelSample[] } | null>(null)
  const selectionBoundaryCacheRef = useRef<SelectionBoundaryCache | null>(null)
  const polygonPathPreviewRenderCacheRef = useRef<PolygonPathPreviewRenderCache | null>(null)
  const selectionOverlayVisibleRef = useRef(false)
  const selectionPreviewFrameRef = useRef<number | null>(null)
  const publishedCanvasPreviewRef = useRef<CanvasPreviewSnapshot | null>(null)
  const publishedSelectionSizePreviewRef = useRef<{ width: number; height: number } | null>(null)
  const airbrushFrameRef = useRef<number | null>(null)
  const sprayAirbrushRef = useRef<(drag: DragState) => void>(() => {})
  const adjustmentPreviewEditRef = useRef(false)
  const canvasResizePreviewRef = useRef(session.canvasResizePreview)
  const autoSlicePreviewRef = useRef<SelectionRect[] | null>(null)
  const pendingCanvasResizeRef = useRef<DocumentSession['canvasResizePreview']>(null)
  const canvasResizeFrameRef = useRef<number | null>(null)
  const moveLayerContentPreviewRef = useRef<MoveLayerContentPreview | null>(null)
  const moveLayerContentPreviewTimerRef = useRef<number | null>(null)
  const moveLayerClickFlashRef = useRef<MoveLayerClickFlash | null>(null)
  const moveLayerClickFlashTimerRef = useRef<number | null>(null)
  const freeTileInstanceFlashRef = useRef<FreeTileInstanceFlash | null>(null)
  const freeTileInstanceFlashTimerRef = useRef<number | null>(null)
  const lineAnchorHistoryRef = useRef<LineAnchorHistory | null>(null)
  const selectionPivotImageRef = useRef<HTMLImageElement | null>(null)
  useEffect(() => {
    const image = new Image(SELECTION_PIVOT_ICON_SIZE, SELECTION_PIVOT_ICON_SIZE)
    image.onload = () => selectionOverlayDrawRef.current()
    image.src = selectionPivotIcon
    selectionPivotImageRef.current = image
    return () => {
      image.onload = null
      if (selectionPivotImageRef.current === image) selectionPivotImageRef.current = null
    }
  }, [])
  canvasResizePreviewRef.current = session.canvasResizePreview
  const activeViewDrag = inputRef.current.drag?.kind === 'pan' || inputRef.current.drag?.kind === 'zoom-drag' || inputRef.current.drag?.kind === 'rotate-view'
  const { pendingViewRef, liveViewRef, zoomPreviewStartRef, applyRotationStyle, finishZoomPreview, scheduleZoomPreview, beginPanPreview, schedulePanPreview, finishPanPreview } = useCanvasViewPreview({ documentId: session.document.id, sessionView: session.view, activeViewDrag, canvasRef, selectionCanvasRef, drawRef })
  const lineAnchor = session.tool === 'eraser' ? session.lastEraserPoint : session.lastPencilPoint
  const isoGridSnapActive = session.view.isoViewEnabled === true && isoViewPreferences.snapToGrid
  const isoLineAlignmentActive = session.view.isoViewEnabled === true && (isoViewPreferences.forceLineAlignment || isoGridSnapActive)
  // Cartesian snapping follows Aseprite's closest-grid-vertex rule. The
  // isometric path has its own geometry and therefore takes precedence.
  const gridSnapActive = session.view.isoViewEnabled !== true
    && alignmentPreferences.gridAlignmentEnabled
    && session.view.showGrid
  const snapBrushPointToGrid = (
    point: Point,
    size: number,
    imageBrush: Parameters<typeof brushStampAnchor>[1] = null,
    angle = 0,
    currentSession: DocumentSession = session
  ): Point => {
    const active = currentSession.view.isoViewEnabled !== true
      && alignmentPreferences.gridAlignmentEnabled
      && currentSession.view.showGrid
    if (!active) return point
    const anchor = brushStampAnchor(size, imageBrush, angle)
    // Aseprite snaps the brush bound (pointer centre minus brush centre),
    // then restores the anchor. This matters for even-sized brushes because
    // the half-cell decision must use the bound origin, not the cursor centre.
    const vertex = snapPointToGrid({ x: point.x - anchor.x, y: point.y - anchor.y }, currentSession.view.grid ?? DEFAULT_GRID_SETTINGS)
    return { x: vertex.x + anchor.x, y: vertex.y + anchor.y }
  }
  const balancedStraightLines = balancedShiftLineEnabled || isoLineAlignmentActive
  const snapToIsoGrid = (point: Point): Point => snapIsoPointToGridVertex(point, isoViewPreferences.stairStep, isoViewPreferences.guideUnitSize, {
    x: isoViewPreferences.guideOriginX,
    y: isoViewPreferences.guideOriginY
  })
  const resolveStraightLine = (from: Point, to: Point, constrained: boolean): { from: Point; to: Point } => {
    const start = isoGridSnapActive
      ? snapToIsoGrid(from)
      : gridSnapActive
        ? snapPointToGrid(from, session.view.grid ?? DEFAULT_GRID_SETTINGS)
        : from
    if (isoGridSnapActive) return isoGridLineSegment(start, to, isoViewPreferences.stairStep)
    const target = isoLineAlignmentActive ? isoLineEndpoint(start, to, isoViewPreferences.stairStep) : constrained ? constrainLineEndpoint(start, to, lineDirectionStep) : to
    return { from: start, to: gridSnapActive ? snapPointToGrid(target, session.view.grid ?? DEFAULT_GRID_SETTINGS) : target }
  }
  const selectedLayerMask = activeLayerMask(session)
  const groupSelectionActive = session.selectedGroupIds.length > 0 || Boolean(session.selectedGroupId)
  const hasSelectedRasterLayer = Boolean(selectedLayerMask) || (session.selectedGroupIds.length === 0 && session.selectedLayerIds.some((id) => session.document.layers.some((layer) => layer.id === id)))
  const activeLayer = activePaintLayer(session)
  const selectedFreeTileSelectionTarget = (current: DocumentSession = session) => {
    const layer = activePaintLayer(current)
    if (layer.kind !== 'free-tile' || !current.selectedFreeTileInstanceId) return null
    const target = activeFreeTileCelTarget(current.document)
    if (!target || target.layer.id !== layer.id) return null
    const instance = target.freeTiles.instances.find((candidate) => candidate.id === current.selectedFreeTileInstanceId) ?? null
    const source = instance ? freeTileSourceForInstance(target.sources, instance) : null
    const sourceLayer = source ? target.layer.freeTileSources?.find((candidate) => candidate.id === source.id) : null
    if (!instance || !source || !sourceLayer || instance.visible === false || instance.locked === true || source.visible === false || sourceLayer.locked === true) return null
    return {
      target,
      instance,
      source,
      bounds: freeTileInstanceBounds(instance, target.sources, target.surface.offsetX, target.surface.offsetY)
    }
  }
  const selectedFreeTileInstances = (current: DocumentSession = session) => {
    const layer = activePaintLayer(current)
    if (layer.kind !== 'free-tile') return null
    const target = activeFreeTileCelTarget(current.document)
    if (!target || target.layer.id !== layer.id) return null
    const ids = current.selectedFreeTileInstanceIds.length > 0
      ? current.selectedFreeTileInstanceIds
      : current.selectedFreeTileInstanceId ? [current.selectedFreeTileInstanceId] : []
    const instances = ids.flatMap((id) => target.freeTiles.instances.find((candidate) => candidate.id === id) ?? [])
    return instances.length > 0 ? { target, layer, instances } : null
  }
  const selectedFreeTileInstancesBounds = (current: DocumentSession = session): SelectionRect | null => {
    const selected = selectedFreeTileInstances(current)
    if (!selected) return null
    const bounds = selected.instances.map((instance) => freeTileInstanceBounds(instance, selected.target.sources, selected.target.surface.offsetX, selected.target.surface.offsetY))
    const left = Math.min(...bounds.map((bound) => bound.x))
    const top = Math.min(...bounds.map((bound) => bound.y))
    const right = Math.max(...bounds.map((bound) => bound.x + bound.width))
    const bottom = Math.max(...bounds.map((bound) => bound.y + bound.height))
    return { x: left, y: top, width: right - left, height: bottom - top }
  }
  const activeFreeTileSelectionTarget = selectedFreeTileSelectionTarget()
  // A frame selection uses explicitly selected layers when present. With no
  // explicit layer selection, selectedTransformLayersForSession retains the
  // timeline-wide behavior and targets every editable raster layer.
  const selectedTransformLayers = selectedTransformLayersForSession(session)
  const animationFrameSelectionActive = session.selectedAnimationFrameIds.length > 0
  const animationCellSelectionActive = session.selectedAnimationCellKeys.length > 0
  const multipleAnimationSelection = animationFrameSelectionActive || animationCellSelectionActive
  const selectionLayersEditable = multipleAnimationSelection
    ? !selectedLayerMask
      && selectedTransformLayers.length > 0
      && selectedTransformLayers.every((layer) => !layer.kind
        && isLayerEffectivelyVisible(session.document, layer)
        && !isLayerEffectivelyLocked(session.document, layer))
    : selectedTransformLayersAreEditable(session, selectedTransformLayers)
      && (activeLayer.kind !== 'free-tile' || (session.freeTileMode === 'edit' && Boolean(activeFreeTileSelectionTarget)))
  // Creating a canvas selection is independent from transforming a timeline
  // selection. Tilemap layers always have a cel selected by default, so the
  // timeline transform guard must not disable the marquee tool itself.
  const tilemapSelectionCreationAllowed = session.tool === 'selection'
    && activeLayer.kind === 'tilemap'
    && isLayerEffectivelyVisible(session.document, activeLayer)
    && !isLayerEffectivelyLocked(session.document, activeLayer)
  const selectionInteractionEditable = session.tool === 'selection' ? selectionLayersEditable || tilemapSelectionCreationAllowed : false
  const selectedCanvasMoveLayerIds = resolveCanvasMoveLayerIds({
    selectedLayerIds: session.selectedLayerIds,
    selectedGroupIds: session.selectedGroupIds,
    layerIdsForGroup: (groupId) => getLayerIdsInGroup(session.document, groupId)
  })
  const hasSelectedMovableLayer = Boolean(selectedLayerMask)
    ? isLayerEffectivelyVisible(session.document, activeLayer) && !isLayerEffectivelyLocked(session.document, activeLayer)
    : selectedCanvasMoveLayerIds.some((id) => {
        const layer = session.document.layers.find((candidate) => candidate.id === id)
        return Boolean(layer && isLayerEffectivelyVisible(session.document, layer) && !isLayerEffectivelyLocked(session.document, layer))
      })
  // Sessions created before the symmetry center field was introduced may still
  // exist during hot reload. Resolve that legacy state once per render.
  const symmetryCenter = session.symmetryCenter ?? defaultSymmetryCenter(session.document.width, session.document.height)
  const fillKind = session.fillKind ?? 'bucket'
  const sliceTool = session.tool === 'move' && session.moveKind === 'slice'
  const gradientDither = session.gradientDither ?? 'none'
  const gradientStops = session.gradientFreeform && gradientDither === 'none' ? session.gradientStops : undefined
  const gradientStopsForButton = (button: number): typeof gradientStops => button === 2 && gradientStops
    ? gradientStops.slice().reverse().map((stop) => ({ position: 1 - stop.position, color: { ...stop.color } }))
    : gradientStops
  const gradientType = session.gradientType ?? 'linear'
  const radialGradientCenterModifierActive = (
    targetSession: DocumentSession,
    event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey'>
  ): boolean => targetSession.tool === 'fill'
    && (targetSession.fillKind ?? 'bucket') === 'gradient'
    && (targetSession.gradientType ?? 'linear') === 'radial'
    && Boolean(event.ctrlKey || event.metaKey)
  const gradientGeometryOptionsForDrag = (drag: Pick<DragState, 'constrain' | 'gradientFromCenter'>): GradientGeometryOptions | undefined => gradientType === 'radial'
    ? { fromCenter: Boolean(drag.gradientFromCenter), proportional: Boolean(drag.constrain) }
    : undefined
  const selectionCornerRadius = session.selectionRounded ? session.selectionCornerRadius : 0
  const shapeCornerRadius = session.shapeRounded ? session.shapeCornerRadius : 0
  const activeLayerEditable = hasSelectedRasterLayer
    && isLayerEffectivelyVisible(session.document, activeLayer)
    && !isLayerEffectivelyLocked(session.document, activeLayer)
    && isToolAvailableForSession(session, session.tool)
  const brushInputs = activeBrushInputsForTool(session.tool, fillKind, session.brushImage, session.brushTexture)
  const activeBrushImage = brushInputs.imageBrush
  const activeBrushTexture = brushInputs.texture
  const activeBrushDither = activeBrushImage ? undefined : session.brushDither ?? DEFAULT_BRUSH_DITHER_SETTINGS
  const activeBrushPaintMode = activeBrushImage?.intrinsicSize ? session.brushPaintMode : 'paint'
  const activeBrushPreviewMode = activeBrushPaintMode
  const proceduralAntialiasStrength = brushInputs.fillTextureEnabled && session.proceduralAntialias && activeBrushImage?.id.startsWith('procedural:') ? session.proceduralAntialiasStrength : 0
  const brushPatternOrigin = (point: Point, size = session.brushSize, imageBrush = activeBrushImage): Point => {
    const anchor = brushStampAnchor(size, imageBrush)
    return { x: point.x - anchor.x, y: point.y - anchor.y }
  }
  const tilemapPaintSelectionForIncoming = (incoming: SelectionMask | null, current: DocumentSession = session): SelectionMask | null => {
    if (!incoming || current.tilemapMode !== 'paint' || activePaintLayer(current).kind !== 'tilemap') return incoming
    const target = activeTilemapCelTarget(current.document)
    return target
      ? expandSelectionToTilemapCells(incoming, target.tilemap, target.surface.offsetX, target.surface.offsetY, { x: 0, y: 0, width: current.document.width, height: current.document.height })
      : incoming
  }
  const tilemapEditCellIndexAtPoint = (point: Point, current: DocumentSession = session): number | null | undefined => {
    if (current.tilemapMode !== 'edit' || activePaintLayer(current).kind !== 'tilemap') return undefined
    const target = activeTilemapCelTarget(current.document)
    const index = target ? tilemapCellIndexAtPoint(target.tilemap, target.surface.offsetX, target.surface.offsetY, point.x, point.y) : null
    return target && index !== null && target.tilemap.cells[index] ? index : null
  }
  const tilemapEditClipForCell = (cellIndex: number | undefined, current: DocumentSession = session): SelectionRect | undefined => {
    if (cellIndex === undefined) return undefined
    const target = activeTilemapCelTarget(current.document)
    if (!target?.tilemap.cells[cellIndex]) return undefined
    return tilemapCellBounds(target.tilemap, target.surface.offsetX, target.surface.offsetY, cellIndex)
  }
  const tilemapEditCreatesFirstTile = (current: DocumentSession = session): boolean => {
    if (current.tilemapMode !== 'edit' || activePaintLayer(current).kind !== 'tilemap') return false
    const target = activeTilemapCelTarget(current.document)
    const tileset = target?.layer.tilemapTilesetId
      ? current.document.tilesets?.find((candidate) => candidate.id === target.layer.tilemapTilesetId)
      : null
    return Boolean(tileset && tilesetHasOnlyTransparentTile(tileset))
  }
  const tilemapEditSelectionAtPoint = (point: Point, current: DocumentSession = session, armOutsideTiles = false): SelectionMask | null | undefined => {
    if (current.tilemapMode !== 'edit' || activePaintLayer(current).kind !== 'tilemap') return undefined
    const target = activeTilemapCelTarget(current.document)
    return target ? tilemapEditableSelectionAtPoint(
      target.tilemap,
      target.surface.offsetX,
      target.surface.offsetY,
      point,
      { x: 0, y: 0, width: current.document.width, height: current.document.height },
      current.selection,
      armOutsideTiles,
      tilemapEditCreatesFirstTile(current)
    ) : null
  }
  const paintSelectionForDrag = (drag: DragState): SelectionMask | null => drag.tilemapEditSelection ?? session.selection
  const tilemapCellAllowedBySelection = (
    target: NonNullable<ReturnType<typeof activeTilemapCelTarget>>,
    index: number,
    selection: SelectionMask | null
  ): boolean => {
    if (!selection) return true
    const bounds = tilemapCellBounds(target.tilemap, target.surface.offsetX, target.surface.offsetY, index)
    const left = Math.max(0, bounds.x, selection.x)
    const top = Math.max(0, bounds.y, selection.y)
    const right = Math.min(session.document.width, bounds.x + bounds.width, selection.x + selection.width)
    const bottom = Math.min(session.document.height, bounds.y + bounds.height, selection.y + selection.height)
    for (let y = top; y < bottom; y += 1) for (let x = left; x < right; x += 1) if (selectionContains(selection, x, y)) return true
    return false
  }
  const tilemapCellAtPoint = (point: Point, current: DocumentSession = session): TilemapCell | null | undefined => {
    if (current.tilemapMode !== 'paint' || activePaintLayer(current).kind !== 'tilemap') return undefined
    const target = activeTilemapCelTarget(current.document)
    const index = target ? tilemapCellIndexAtPoint(target.tilemap, target.surface.offsetX, target.surface.offsetY, point.x, point.y) : null
    const cell = index === null ? null : target?.tilemap.cells[index] ?? null
    return cell ? { ...cell } : null
  }
  const freeTileAtPoint = (
    point: Point,
    current: DocumentSession = session
  ): { sourceId: string; tilesetId: string; tileId: string; instance: FreeTileInstance } | null | undefined => {
    if (activePaintLayer(current).kind !== 'free-tile' || current.freeTileMode !== 'paint') return undefined
    const target = activeFreeTileCelTarget(current.document)
    const instance = target ? freeTileInstanceAtDocumentPoint(target, point.x, point.y) : null
    const source = target && instance ? freeTileSourceForInstance(target.sources, instance) : null
    const tileId = target && instance ? freeTileTileIdForInstance(target.sources, instance) : null
    return source && instance && tileId ? { sourceId: source.id, tilesetId: source.tileset.id, tileId, instance: { ...instance } } : null
  }
  const unionFreeTileDirtyRect = (current: SelectionRect | null, incoming: SelectionRect): SelectionRect => {
    if (!current) return { ...incoming }
    const left = Math.min(current.x, incoming.x)
    const top = Math.min(current.y, incoming.y)
    const right = Math.max(current.x + current.width, incoming.x + incoming.width)
    const bottom = Math.max(current.y + current.height, incoming.y + incoming.height)
    return { x: left, y: top, width: right - left, height: bottom - top }
  }
  sprayAirbrushRef.current = (drag: DragState): void => {
    if (!drag.edit) return
    const freeTileEdit = Boolean(drag.freeTileEditDocument && drag.freeTileEditLayer && drag.freeTileEditOrigin && drag.freeTileSourceId && drag.freeTileSourceBefore && drag.freeTileEditSourceOffset)
    const paintDocument = freeTileEdit ? drag.freeTileEditDocument! : session.document
    const paintLayer = freeTileEdit ? drag.freeTileEditLayer! : activePaintLayer(session)
    const origin = freeTileEdit ? drag.freeTileEditOrigin! : { x: 0, y: 0 }
    const color = drag.color ?? session.primaryColor
    const particleSize = airbrushParticleSize(session.airbrushParticleRadius)
    const particles = generateAirbrushParticles({ x: drag.last.x - origin.x, y: drag.last.y - origin.y }, {
      particleRadius: session.airbrushParticleRadius,
      scatterRadius: session.airbrushScatterRadius,
      density: session.airbrushDensity
    })
    for (const particle of particles) {
      paintBrush(paintDocument, paintLayer, drag.edit, particle.x, particle.y, particleSize, color, session.airbrushParticleShape, freeTileEdit ? drag.freeTileEditSelection ?? null : paintSelectionForDrag(drag), 'solid', 1, null, session.brushImageSettings, 0, 'paint', particle, freeTileEdit ? undefined : session.symmetryAxes, freeTileEdit ? undefined : symmetryCenter, undefined, 1, undefined, false, undefined, freeTileEdit ? 'off' : session.view.tileRepeatMode ?? 'off')
    }
    if (freeTileEdit) {
      const sourceEdit: FreeTileSourceEditRaster = {
        document: drag.freeTileEditDocument!,
        layer: drag.freeTileEditLayer!,
        before: drag.freeTileSourceBefore!,
        origin: drag.freeTileEditOrigin!,
        sourceOffset: drag.freeTileEditSourceOffset!,
        instanceTransform: drag.freeTileEditInstanceTransform ?? {},
        transformedSourceBounds: drag.freeTileEditTransformedSourceBounds ?? { x: drag.freeTileSourceBefore!.offsetX, y: drag.freeTileSourceBefore!.offsetY, width: drag.freeTileSourceBefore!.width, height: drag.freeTileSourceBefore!.height }
      }
      const cropped = freeTileSourceSnapshotFromEditRaster(sourceEdit)
      useWorkspace.getState().previewFreeTileSource(drag.freeTileSourceId!, cropped.width, cropped.height, cropped.pixels, cropped.offsetX, cropped.offsetY)
      compositeCacheRef.current.invalidateAll()
      scheduleDraw()
      return
    }
    const radius = session.airbrushScatterRadius + session.airbrushParticleRadius
    for (const rect of brushStrokeInvalidationRects(drag.last, drag.last, radius * 2 + 1, null, session.document.width, session.document.height, session.symmetryAxes, symmetryCenter, session.view.tileRepeatMode ?? 'off')) invalidateCompositeRect(rect)
    scheduleDraw()
  }
  const stageBounds = (): DOMRect => stageRef.current?.getBoundingClientRect() ?? canvasRef.current?.getBoundingClientRect() ?? new DOMRect()
  const cacheStageDisplaySize = (width: number, height: number): { width: number; height: number } => {
    const displaySize = { width: Math.max(0, width), height: Math.max(0, height) }
    stageDisplaySizeRef.current = displaySize
    stageSizeRef.current = canvasViewportSizeForInterfaceScale(displaySize.width, displaySize.height, interfaceScale)
    stageSizeScaleRef.current = interfaceScale
    return stageSizeRef.current
  }
  const stageDisplaySize = (): { width: number; height: number } => {
    const cached = stageDisplaySizeRef.current
    if (cached.width > 0 && cached.height > 0 && stageSizeScaleRef.current === interfaceScale) return cached
    const bounds = stageBounds()
    cacheStageDisplaySize(bounds.width, bounds.height)
    return stageDisplaySizeRef.current
  }
  const stageSize = (): { width: number; height: number } => {
    const cached = stageSizeRef.current
    if (cached.width > 0 && cached.height > 0 && stageSizeScaleRef.current === interfaceScale) return cached
    const bounds = stageBounds()
    return cacheStageDisplaySize(bounds.width, bounds.height)
  }
  const stagePoint = (clientX: number, clientY: number): Point => {
    const bounds = stageBounds()
    return canvasViewportPointForInterfaceScale(clientX, clientY, bounds.left, bounds.top, interfaceScale)
  }
  const hidePenCursor = (): void => {
    const wasActive = penCursorStateRef.current.active
    penCursorStateRef.current.active = false
    if (penCursorRef.current) penCursorRef.current.hidden = true
    if (!wasActive) return
    delete document.documentElement.dataset.penInput
    void setNativeCursorVisible(true).catch(() => undefined)
  }
  const refreshPenCursor = (): void => {
    const canvas = canvasRef.current
    const image = penCursorRef.current
    const pointer = penCursorStateRef.current
    if (!canvas || !image || !pointer.active) return
    const preferences = cursorPreferencesRef.current
    const descriptor = cursorOverlayDescriptor(canvas.style.cursor, preferences?.useLocalCursors ?? false, preferences?.cursorScale ?? 1, interfaceScale)
    if (!descriptor) {
      image.hidden = true
      return
    }
    if (image.dataset.source !== descriptor.source) {
      image.dataset.source = descriptor.source
      image.src = descriptor.source
    }
    image.style.width = `${descriptor.size}px`
    image.style.height = `${descriptor.size}px`
    image.style.transform = `translate3d(${pointer.x - descriptor.hotspotX}px, ${pointer.y - descriptor.hotspotY}px, 0)`
    image.hidden = false
  }
  const syncPenCursor = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    const pressurePointer = isPressurePointerType(event.pointerType) || pressureAdapterRef.current.isPressureCapable(event.pointerId)
    if (!pressurePointer) {
      hidePenCursor()
      return
    }
    const bounds = stageBounds()
    const wasActive = penCursorStateRef.current.active
    penCursorStateRef.current = {
      active: true,
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top
    }
    document.documentElement.dataset.penInput = 'true'
    if (!wasActive) void setNativeCursorVisible(false).catch(() => undefined)
    refreshPenCursor()
  }
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || typeof MutationObserver === 'undefined') return
    const observer = new MutationObserver(refreshPenCursor)
    observer.observe(canvas, { attributes: true, attributeFilter: ['style'] })
    return () => {
      observer.disconnect()
      hidePenCursor()
    }
  }, [])
  const constrainCanvasView = (view: DocumentSession['view'], size = stageSize()): DocumentSession['view'] => {
    const currentSession = useWorkspace.getState().sessions.find((item) => item.document.id === storedSession.document.id) ?? storedSession
    const activeDrag = canvasGestureForPreview(inputRef.current.drag)
    const floatingDrag = activeDrag?.floatingPaste && activeDrag.previewTarget ? activeDrag : null
    const floatingPaste = currentSession.pendingPaste
    const floatingBounds = floatingDrag
      ? transformedSelectionBounds(
          floatingDrag.previewTarget!,
          floatingDrag.previewAngle ?? floatingDrag.startAngle ?? 0,
          floatingDrag.previewShear ?? floatingDrag.transformStartShear
        )
      : floatingPaste
        ? transformedSelectionBounds(
            floatingPaste.transformTarget ?? floatingPaste.target,
            floatingPaste.transformAngle ?? 0,
            floatingPaste.transformShear
          )
        : undefined
    return clampCanvasViewPan(size.width, size.height, currentSession.document.width, currentSession.document.height, view, rotationIndicatorPosition, floatingBounds)
  }
  const modifierActive = (event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>, id: keyof typeof shortcuts): boolean => modifierShortcutHeldByBindings(event, shortcuts[id] ?? [])
  const brushLineConnectionHasPriority = (
    event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>,
    targetSession: DocumentSession = session
  ): boolean => brushLineConnectionOverridesTemporaryMove(
    targetSession.tool,
    event,
    matchingModifierShortcut(event, shortcutBindingsFor(shortcuts, 'lineConnectionMode')),
    Boolean(targetSession.tool === 'eraser' ? targetSession.lastEraserPoint : targetSession.tool === 'pencil' ? targetSession.lastPencilPoint : null)
  )
  const temporaryMoveActive = (
    event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>,
    targetSession: DocumentSession = session
  ): boolean => targetSession.freeTransformActive !== true
    && !radialGradientCenterModifierActive(targetSession, event)
    && quickMoveToolActive()
    && temporaryMoveToolAllowed(targetSession.tool, targetSession.moveKind)
    && !brushLineConnectionHasPriority(event, targetSession)
  const selectionTransformModifierState = (event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>) => selectionTransformModifiers({
    ctrlKey: modifierActive(event, 'integerSelectionScale'),
    altKey: event.altKey,
    shiftKey: modifierActive(event, 'proportionalSelectionTransform')
  })
  const currentSelectionTransformModifierState = () => selectionTransformModifierState({
    ctrlKey: inputRef.current.ctrlHeld,
    metaKey: false,
    altKey: inputRef.current.altHeld,
    shiftKey: inputRef.current.shiftHeld
  })
  const selectionMarqueeModifierState = (event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>) => {
    const activeDrag = inputRef.current.drag
    const proportional = activeDrag?.kind === 'marquee'
      ? selectionMarqueeUsesConstraint(event, Boolean(activeDrag.selectionStart), activeDrag.selectionMode ?? session.selectionMode, activeDrag.marqueeAngle !== undefined)
      : event.shiftKey
    return {
      fromCenter: Boolean(event.ctrlKey || event.metaKey),
      proportional,
      rotate: event.altKey
    }
  }
  const currentSelectionMarqueeModifierState = () => selectionMarqueeModifierState({
    ctrlKey: inputRef.current.ctrlHeld,
    metaKey: false,
    altKey: inputRef.current.altHeld,
    shiftKey: inputRef.current.shiftHeld
  })
  const lineConnectionShortcut = shortcutBindingsFor(shortcuts, 'lineConnectionMode').join('|')
  const lineConnectionConfigured = shortcutBindingsFor(shortcuts, 'lineConnectionMode').length > 0
  const lineConnectionActive = (event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>): boolean => lineConnectionConfigured && modifierActive(event, 'lineConnectionMode')
  const lineConnectionPreviewActive = (event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>): boolean => Boolean(
    !inputRef.current.drag
    && !inputRef.current.sampling
    && !inputRef.current.spaceHeld
    && !canvasResizePreviewRef.current
    && (session.tool === 'pencil' || session.tool === 'eraser')
    && lineAnchor
    && lineConnectionActive(event)
  )
  useEffect(() => {
    const refresh = (): void => setShortcuts(loadShortcutBindings())
    window.addEventListener('moonsprite:shortcuts-changed', refresh)
    return () => window.removeEventListener('moonsprite:shortcuts-changed', refresh)
  }, [])

  const applyViewRotation = (context: CanvasRenderingContext2D, width: number, height: number, view: DocumentSession['view']): void => {
    if (Math.abs(view.rotation) < 0.000001 && !view.mirrored && !view.mirroredVertical) return
    const pivot = viewRotationPivot(width, height, view.panX, view.panY, rotationIndicatorPosition)
    context.translate(pivot.x, pivot.y)
    context.rotate(view.rotation * Math.PI / 180)
    context.scale(view.mirrored ? -1 : 1, view.mirroredVertical ? -1 : 1)
    context.translate(-pivot.x, -pivot.y)
  }

  const updateRotationIndicator = (rotation: number, visible: boolean): void => {
    const indicator = rotationIndicatorRef.current
    const pointerElement = rotationPointerRef.current
    if (!indicator || !pointerElement) return
    const size = stageSize()
    const indicatorCenter = rotationIndicatorPosition === 'view' && rotationIndicatorAnchorRef.current
      ? rotationIndicatorAnchorRef.current
      : viewRotationPivot(size.width, size.height, liveViewRef.current.panX, liveViewRef.current.panY, rotationIndicatorPosition)
    const cssCenter = canvasViewportPointToCss(indicatorCenter, interfaceScale)
    indicator.hidden = !visible || !rotationIndicatorFitsCanvas(session.document.width, session.document.height, liveViewRef.current.zoom)
    indicator.style.left = `${cssCenter.x}px`
    indicator.style.top = `${cssCenter.y}px`
    pointerElement.style.transform = `rotate(${rotation}deg)`
    if (!visible) rotationIndicatorAnchorRef.current = null
  }

  useEffect(() => {
    const previewIsoViewPreferences = (event: Event): void => {
      const value = (event as CustomEvent<IsoViewPreferences>).detail
      if (!value) return
      setIsoViewPreferences(parseIsoViewPreferences(JSON.stringify(value)))
    }
    const syncPreferences = (): void => {
      const preferences = loadEditorPreferences()
      setRotationIndicatorPosition(preferences.rotationIndicatorPosition)
      setInterfaceScale(preferences.uiScale)
      setDrawingBrushPreviewEnabled(preferences.drawingBrushPreviewEnabled)
      setZoomToolDragMode(preferences.zoomToolDragMode)
      setViewDragSensitivity(preferences.viewDragSensitivity)
      setBrushPreviewMode(preferences.brushPreviewMode)
      setCheckerboard(preferences.checkerboard)
      setGridColors({ pixelGridColor: preferences.pixelGridColor, gridColor: preferences.gridColor })
      setAlignmentPreferences({
        gridAlignmentEnabled: preferences.gridAlignmentEnabled,
        smartAlignmentEnabled: preferences.smartAlignmentEnabled,
        alignmentGuidesVisible: preferences.alignmentGuidesVisible,
        alignmentThreshold: preferences.alignmentThreshold
      })
      setSliceColor(preferences.sliceColor)
      setFreeTileInstanceOutlineColor(preferences.freeTileInstanceOutlineColor)
      setTextBoxColor(preferences.textBoxColor)
      setCanvasResizeColor(preferences.canvasResizeColor)
      setSliceOutlinesVisible(preferences.sliceOutlinesVisible)
      setWheelZoomEnabled(preferences.wheelZoomEnabled)
      setWheelZoomMode(preferences.wheelZoomMode)
      setShiftLinePreviewEnabled(preferences.shiftLinePreviewEnabled)
      setGradientLineVisible(preferences.gradientLineVisible)
      setGradientLineColor(preferences.gradientLineColor)
      setLassoPreviewClosed(preferences.lassoPreviewClosed)
      setEyedropperSwitchToPencil(preferences.eyedropperSwitchToPencil)
      setEyedropperMagnifierEnabled(preferences.eyedropperMagnifierEnabled)
      setEyedropperMagnifierStyle(preferences.eyedropperMagnifierStyle)
      setEyedropperMagnifierSize(preferences.eyedropperMagnifierSize)
      setEyedropperMagnifierDistortionEnabled(preferences.eyedropperMagnifierDistortionEnabled)
      setMoveLayerContentPreviewEnabled(preferences.moveLayerContentPreviewEnabled)
      setMoveLayerClickFlashEnabled(preferences.moveLayerClickFlashEnabled)
      setMoveLayerClickFlashDuration(preferences.moveLayerClickFlashDuration)
      setSelectionCrosshair(preferences.selectionCrosshair)
      setSelectionPreviewColorMode(preferences.selectionPreviewColorMode)
      setSelectionPreviewColor(preferences.selectionPreviewColor)
      setSelectionSizeVisible(preferences.selectionSizeVisible)
      setBalancedShiftLineEnabled(preferences.balancedShiftLineEnabled)
      setLineDirectionStep(preferences.lineDirectionStep)
      setOnionSkin(preferences.onionSkin)
      setTimelineHidden(preferences.timelineHidden)
      setSymmetryAxisPreferences(preferences.symmetryAxis)
      setIsoViewPreferences(preferences.isoView)
      setActiveTheme(resolveTheme(preferences.theme))
      if (inputRef.current.drag?.alignmentGuides?.length) {
        inputRef.current.drag.alignmentGuides = []
        scheduleDraw()
      }
      cursorPreferencesRef.current = { useLocalCursors: preferences.useLocalCursors, cursorScale: preferences.cursorScale }
      refreshPenCursor()
      if (preferences.symmetryAxis.locked && !inputRef.current.ctrlHeld) symmetryDragRef.current = null
      onionSkinCacheRef.current.invalidateAll()
      if (!preferences.eyedropperMagnifierEnabled && eyedropperMagnifierRef.current) eyedropperMagnifierRef.current.hidden = true
      if (eyedropperMagnifierRef.current) eyedropperMagnifierRef.current.dataset.style = preferences.eyedropperMagnifierStyle
      if (!preferences.moveLayerContentPreviewEnabled) {
        moveLayerContentPreviewRef.current = null
        if (moveLayerContentPreviewTimerRef.current !== null) window.clearTimeout(moveLayerContentPreviewTimerRef.current)
        moveLayerContentPreviewTimerRef.current = null
        scheduleDraw()
      }
      if (!preferences.moveLayerClickFlashEnabled) {
        moveLayerClickFlashRef.current = null
        if (moveLayerClickFlashTimerRef.current !== null) window.clearTimeout(moveLayerClickFlashTimerRef.current)
        moveLayerClickFlashTimerRef.current = null
        scheduleDraw()
      }
    }
    window.addEventListener('moonsprite:preferences-changed', syncPreferences)
    window.addEventListener(ISO_VIEW_PREFERENCES_PREVIEW_EVENT, previewIsoViewPreferences)
    return () => {
      window.removeEventListener('moonsprite:preferences-changed', syncPreferences)
      window.removeEventListener(ISO_VIEW_PREFERENCES_PREVIEW_EVENT, previewIsoViewPreferences)
    }
  }, [])

  useEffect(() => {
    moveLayerContentPreviewRef.current = null
    moveLayerClickFlashRef.current = null
    freeTileInstanceFlashRef.current = null
    if (moveLayerContentPreviewTimerRef.current !== null) window.clearTimeout(moveLayerContentPreviewTimerRef.current)
    moveLayerContentPreviewTimerRef.current = null
    if (moveLayerClickFlashTimerRef.current !== null) window.clearTimeout(moveLayerClickFlashTimerRef.current)
    moveLayerClickFlashTimerRef.current = null
    if (freeTileInstanceFlashTimerRef.current !== null) window.clearTimeout(freeTileInstanceFlashTimerRef.current)
    freeTileInstanceFlashTimerRef.current = null
    return () => {
      if (moveLayerContentPreviewTimerRef.current !== null) window.clearTimeout(moveLayerContentPreviewTimerRef.current)
      if (moveLayerClickFlashTimerRef.current !== null) window.clearTimeout(moveLayerClickFlashTimerRef.current)
      if (freeTileInstanceFlashTimerRef.current !== null) window.clearTimeout(freeTileInstanceFlashTimerRef.current)
    }
  }, [session.document.id])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const currentSession = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id) ?? session
    if (activeDocumentId !== session.document.id || currentSession.tool !== 'eyedropper') {
      clearCanvasColorSamplingIntentFor(canvas)
      return
    }
    setCanvasColorSamplingIntent({
      sourceCanvas: canvas,
      onSample: (sampled, _clientX, _clientY, secondary) => {
        const state = useWorkspace.getState()
        if (secondary) state.setSecondaryColor(sampled)
        else state.setPrimaryColor(sampled)
        publishCanvasColorSample(sampled, secondary)
        publishCanvasColorSamplingCompleted()
      }
    })
    return () => clearCanvasColorSamplingIntentFor(canvas)
  }, [activeDocumentId, session.document.id, session.tool])

  useEffect(() => () => {
    if (publishedCanvasPreviewRef.current === null) return
    publishedCanvasPreviewRef.current = null
    notifyCanvasPreview(session.document.id, null)
  }, [session.document.id])

  useEffect(() => {
    const flashInstance = (event: Event): void => {
      const detail = (event as CustomEvent<FreeTileInstanceFlashDetail>).detail
      if (!moveLayerClickFlashEnabled || !detail || detail.documentId !== session.document.id) return
      if (freeTileInstanceFlashTimerRef.current !== null) window.clearTimeout(freeTileInstanceFlashTimerRef.current)
      freeTileInstanceFlashRef.current = { instanceId: detail.instanceId, expiresAt: performance.now() + moveLayerClickFlashDuration }
      scheduleDraw()
      freeTileInstanceFlashTimerRef.current = window.setTimeout(() => {
        freeTileInstanceFlashRef.current = null
        freeTileInstanceFlashTimerRef.current = null
        scheduleDraw()
      }, moveLayerClickFlashDuration)
    }
    window.addEventListener(FREE_TILE_INSTANCE_FLASH_EVENT, flashInstance)
    return () => window.removeEventListener(FREE_TILE_INSTANCE_FLASH_EVENT, flashInstance)
  }, [moveLayerClickFlashDuration, session.document.id])

  useEffect(() => {
    const updatePreview = (event: Event): void => {
      const detail = (event as CustomEvent<{ documentId: string; slices: SelectionRect[] | null }>).detail
      if (detail.documentId !== session.document.id) return
      autoSlicePreviewRef.current = detail.slices?.map((slice) => ({ ...slice })) ?? null
      scheduleDraw()
    }
    window.addEventListener(SLICE_PREVIEW_EVENT, updatePreview)
    return () => {
      window.removeEventListener(SLICE_PREVIEW_EVENT, updatePreview)
      autoSlicePreviewRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.document.id])

  useEffect(() => {
    const updatePreview = (event: Event): void => {
      const detail = (event as CustomEvent<{ documentId: string; preview: DocumentSession['canvasResizePreview'] }>).detail
      if (detail.documentId !== session.document.id) return
      canvasResizePreviewRef.current = detail.preview ? { ...detail.preview } : null
      scheduleDraw()
    }
    window.addEventListener(CANVAS_RESIZE_PREVIEW_EVENT, updatePreview)
    return () => window.removeEventListener(CANVAS_RESIZE_PREVIEW_EVENT, updatePreview)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.document.id])

  useEffect(() => {
    const releaseModifierSizing = (event?: KeyboardEvent): void => {
      inputRef.current.modifierBrushSize = null
      if (!event || !modifierActive(event, 'brushSizeWheelAdjust')) {
        wheelBrushSizePreviewRef.current = false
        scheduleDraw()
      }
    }
    const blur = (): void => releaseModifierSizing()
    window.addEventListener('keyup', releaseModifierSizing)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keyup', releaseModifierSizing)
      window.removeEventListener('blur', blur)
      if (canvasResizeFrameRef.current !== null) window.cancelAnimationFrame(canvasResizeFrameRef.current)
    }
  }, [shortcuts])

  const invalidateCompositeRect = (selection: SelectionRect | null | undefined, layerIds?: readonly string[]): void => {
    const paintTarget = activePaintLayer(session)
    compositeCacheRef.current.invalidateDocumentRect(selection, session.document, session.document.animation?.activeFrameId, layerIds?.length ? layerIds : [paintTarget.id])
  }

  const invalidateStrokeSegment = (from: Point, to: Point, size = session.brushSize, angle = 0): void => {
    for (const rect of brushStrokeInvalidationRects(
      from,
      to,
      size,
      activeBrushImage,
      session.document.width,
      session.document.height,
      session.symmetryAxes,
      symmetryCenter,
      session.view.tileRepeatMode ?? 'off',
      angle
    )) invalidateCompositeRect(rect)
  }

  const stopAirbrushTimer = (): void => {
    if (airbrushFrameRef.current !== null) window.cancelAnimationFrame(airbrushFrameRef.current)
    airbrushFrameRef.current = null
  }

  const scheduleAirbrushTimer = (): void => {
    if (airbrushFrameRef.current !== null) return
    const tick = (now: number): void => {
      airbrushFrameRef.current = null
      const drag = inputRef.current.drag
      if (drag?.kind !== 'airbrush' || !drag.edit) return
      const interval = Math.max(16, session.airbrushIntervalMs)
      let batches = 0
      while (now >= (drag.nextAirbrushAt ?? now) && batches < 4) {
        sprayAirbrushRef.current(drag)
        drag.nextAirbrushAt = (drag.nextAirbrushAt ?? now) + interval
        batches += 1
      }
      airbrushFrameRef.current = window.requestAnimationFrame(tick)
    }
    airbrushFrameRef.current = window.requestAnimationFrame(tick)
  }

  const cloneSelectionLayerStates = (layers: readonly SelectionTransformLayerState[] | undefined): SelectionTransformLayerState[] | undefined =>
    layers?.map((layer) => ({ ...layer }))

  const syncPrimarySelectionLayerState = (drag: DragState): void => {
    const primary = drag.selectionLayers?.[0]
    if (!primary) return
    drag.selectionSource = primary.source
    drag.previewEdit = primary.previewEdit
    drag.translationPreview = primary.translationPreview
  }

  const invalidateOnionSkinDragFrames = (drag: DragState): void => {
    const frameIds = [
      ...session.selectedAnimationFrameIds,
      ...(drag.selectionLayers ?? []).flatMap((layer) => layer.frameId ? [layer.frameId] : []),
      ...animationFrameIdsForCellKeys(drag.animationCellKeys ?? [])
    ]
    onionSkinCacheRef.current.invalidateFrames(frameIds)
  }

  const restoreSelectionLayerPreviews = (layers: readonly SelectionTransformLayerState[]): void => {
    for (const layer of layers) {
      if (layer.translationPreview) restoreSelectionTranslationPreview(session.document, layer.translationPreview)
      else if (layer.previewEdit) revertPixelEdit(session.document, layer.previewEdit)
    }
  }

  const symmetryStartPointForDrag = (drag: DragState): Point | undefined => {
    if (!hasSymmetry(session.symmetryAxes)) return undefined
    const source = drag.selectionSource?.selection
    const target = drag.transformStartTarget
    if (!source || !target) return drag.start
    const angle = ((drag.startAngle ?? 0) % 360 + 360) % 360
    if (angle !== 0 || drag.transformStartShear || target.flipHorizontal || target.flipVertical) return drag.start
    return {
      x: drag.start.x - (target.x - source.x),
      y: drag.start.y - (target.y - source.y)
    }
  }

  const flushSelectionPreview = (drag: DragState, render = false): void => {
    if (!drag.previewPending || !drag.selectionStart || !drag.previewTarget) return
    if (drag.tilemapSelectionMoveSource) {
      drag.previewPending = false
      if (render) draw()
      return
    }
    if (adjustmentPreviewEditRef.current) prepareAdjustmentPreviewEdit(session.document.id)
    drag.previewPending = false
    const target = { ...drag.previewTarget }
    const angle = drag.previewAngle ?? 0
    const shear = drag.previewShear ? { ...drag.previewShear } : undefined
    const quad = drag.freeTransform ? drag.previewQuad ?? drag.transformStartQuad : undefined
    const symmetryStartPoint = symmetryStartPointForDrag(drag)
    const rawTarget = drag.kind === 'move-selection'
      ? { ...drag.selectionStart, x: target.x, y: target.y }
      : target
    const transformSourceSelection = selectionTransformGeometrySource(drag) ?? drag.selectionStart
    const translatedPreviewSelection = drag.freeTransform || drag.freeTileSelectionTransform || hasSymmetry(session.symmetryAxes)
      ? undefined
      : translatedSelectionTransformPreviewMask(drag, target, angle, shear, session.document.width, session.document.height)
    const previewSelection = translatedPreviewSelection ?? (drag.freeTransform && quad
      ? transformSelectionMaskQuad(
          transformSourceSelection,
          quad,
          session.document.width,
          session.document.height,
          false,
          selectionSourceQuadForCanvas(drag)
        )
      : drag.freeTileSelectionTransform
      ? drag.kind === 'move-selection'
        ? rawTarget
        : transformSelectionMask(transformSourceSelection, target, session.document.width, session.document.height, angle, shear, false)
      : hasSymmetry(session.symmetryAxes)
        ? transformSymmetrySelection(transformSourceSelection, rawTarget, session.document.width, session.document.height, angle, shear, session.symmetryAxes, symmetryCenter, false, symmetryStartPoint)
        : drag.kind === 'move-selection'
          ? rawTarget
          : transformSelectionMask(transformSourceSelection, target, session.document.width, session.document.height, angle, shear, false))
    drag.previewSelection = previewSelection

    if (drag.kind !== 'move-selection' && drag.selectionSource) {
      if (drag.freeTileSelectionTransform) {
        const sourceEdit = drag.freeTileEditDocument
          && drag.freeTileEditLayer
          && drag.freeTileSourceBefore
          && drag.freeTileEditOrigin
          && drag.freeTileEditSourceOffset
          ? {
              document: drag.freeTileEditDocument,
              layer: drag.freeTileEditLayer,
              before: drag.freeTileSourceBefore,
              origin: drag.freeTileEditOrigin,
              sourceOffset: drag.freeTileEditSourceOffset,
              instanceTransform: drag.freeTileEditInstanceTransform ?? {},
              transformedSourceBounds: drag.freeTileEditTransformedSourceBounds ?? { x: drag.freeTileSourceBefore.offsetX, y: drag.freeTileSourceBefore.offsetY, width: drag.freeTileSourceBefore.width, height: drag.freeTileSourceBefore.height }
            }
          : null
        if (sourceEdit && drag.freeTileSourceId) {
          const localTarget = freeTileTransformTargetToEditRaster(sourceEdit, target)
          const localQuad = quad
            ? {
                nw: { x: quad.nw.x - sourceEdit.origin.x, y: quad.nw.y - sourceEdit.origin.y },
                ne: { x: quad.ne.x - sourceEdit.origin.x, y: quad.ne.y - sourceEdit.origin.y },
                se: { x: quad.se.x - sourceEdit.origin.x, y: quad.se.y - sourceEdit.origin.y },
                sw: { x: quad.sw.x - sourceEdit.origin.x, y: quad.sw.y - sourceEdit.origin.y }
              }
            : undefined
          if (drag.translationPreview) {
            restoreSelectionTranslationPreview(sourceEdit.document, drag.translationPreview)
            drag.translationPreview = null
          }
          if (drag.previewEdit) revertPixelEdit(sourceEdit.document, drag.previewEdit)
          drag.previewEdit = applySelectionTransform(
            sourceEdit.document,
            drag.selectionSource,
            localTarget,
            angle,
            Boolean(drag.copy),
            shear,
            undefined,
            undefined,
            sourceEdit.layer,
            symmetryStartPoint,
            localQuad
          )
          const cropped = freeTileSourceSnapshotFromEditRaster(sourceEdit)
          drag.appliedSelection = previewSelection
          drag.appliedPreviewTarget = { ...target }
          drag.appliedPreviewAngle = angle
          drag.appliedPreviewShear = shear ? { ...shear } : undefined
          drag.appliedPreviewQuad = cloneSelectionQuad(quad) ?? undefined
          drag.appliedPreviewPivot = drag.previewPivot ? { ...drag.previewPivot } : undefined
          useWorkspace.getState().previewFreeTileSource(
            drag.freeTileSourceId,
            cropped.width,
            cropped.height,
            cropped.pixels,
            cropped.offsetX,
            cropped.offsetY
          )
          compositeCacheRef.current.invalidateAll()
        }
      } else if (drag.deferredSelectionPreview) {
        drag.appliedSelection = drag.previewSelection
      } else {
        const previewLayerIds = drag.selectionLayers?.map((layer) => layer.layerId)
        invalidateCompositeRect(drag.selectionStart, previewLayerIds)
        invalidateCompositeRect(drag.appliedSelection, previewLayerIds)
        invalidateCompositeRect(drag.previewSelection, previewLayerIds)
        const translation = !drag.freeTransform && drag.kind === 'move-content' && !hasSymmetry(session.symmetryAxes) && angle % 360 === 0 && !drag.previewShear && !target.flipHorizontal && !target.flipVertical && target.width === drag.selectionSource.selection.width && target.height === drag.selectionSource.selection.height
        if (drag.selectionLayers?.length) {
          for (const layerState of drag.selectionLayers) {
            if (translation && !layerState.frameId) {
              const layer = selectionTransformLayerForState(session.document, layerState)
              if (!layer || layer.kind) continue
              if (layerState.translationPreview) layerState.previewEdit = null
              else if (layerState.previewEdit) { revertPixelEdit(session.document, layerState.previewEdit); layerState.previewEdit = null }
              layerState.translationPreview = applySelectionTranslationPreview(session.document, layerState.source, target, drag.copy, layerState.translationPreview, layer, undefined, session.view.tileRepeatMode)
            } else {
              if (layerState.translationPreview) {
                restoreSelectionTranslationPreview(session.document, layerState.translationPreview)
                layerState.translationPreview = null
              }
              if (layerState.previewEdit) revertPixelEdit(session.document, layerState.previewEdit)
              layerState.previewEdit = applySelectionTransformLayerState(session.document, layerState, target, angle, drag.copy, drag.previewShear, session.symmetryAxes, symmetryCenter, symmetryStartPoint, quad)
            }
          }
          syncPrimarySelectionLayerState(drag)
          invalidateOnionSkinDragFrames(drag)
        } else if (translation) {
          if (drag.translationPreview) drag.previewEdit = null
          else if (drag.previewEdit) { revertPixelEdit(session.document, drag.previewEdit); drag.previewEdit = null }
          drag.translationPreview = applySelectionTranslationPreview(session.document, drag.selectionSource, target, drag.copy, drag.translationPreview, activePaintLayer(session), tilemapEditClipForCell(drag.tilemapEditCellIndex), session.view.tileRepeatMode)
        } else {
          if (drag.translationPreview) {
            restoreSelectionTranslationPreview(session.document, drag.translationPreview)
            drag.translationPreview = null
          }
          if (drag.previewEdit) revertPixelEdit(session.document, drag.previewEdit)
          drag.previewEdit = applySelectionTransform(session.document, drag.selectionSource, target, angle, drag.copy, drag.previewShear, session.symmetryAxes, symmetryCenter, activePaintLayer(session), symmetryStartPoint, quad)
        }
        drag.appliedSelection = drag.previewSelection
        drag.appliedPreviewQuad = cloneSelectionQuad(quad) ?? undefined
      }
    }
    if (render) {
      if (adjustmentPreviewEditRef.current) renderAdjustmentPreviewEdit(session.document.id, drag.previewSelection ?? null)
      if (drag.kind === 'move-selection') drawSelectionOverlay()
      else draw()
    }
  }

  const scheduleSelectionPreview = (drag: DragState, immediate = false): void => {
    drag.previewPending = true
    if (immediate || drag.freeTileSelectionTransform === true) {
      if (selectionPreviewFrameRef.current !== null) window.cancelAnimationFrame(selectionPreviewFrameRef.current)
      selectionPreviewFrameRef.current = null
      flushSelectionPreview(drag, true)
      return
    }
    if (selectionPreviewFrameRef.current !== null) return
    selectionPreviewFrameRef.current = window.requestAnimationFrame(() => {
      selectionPreviewFrameRef.current = null
      if (inputRef.current.drag === drag) flushSelectionPreview(drag, true)
    })
  }

  const canUseDeferredSelectionPreview = (layer: RasterLayer): boolean => !activeLayerMask(session)
    && !session.view.relativeLuminance
    && !hasSymmetry(session.symmetryAxes)
    && !(layer.kind === 'tilemap' && session.tilemapMode === 'edit')
    && !hasAdjustmentPreviewController(session.document.id)
    && compositeCacheRef.current.supportsSelectionPreview(session.document, session.contentRevision, layer.id)

  const prepareDeferredFloatingSelectionPreview = (drag: DragState): void => {
    if (!drag.floatingPaste || !drag.deferredSelectionPreview || !drag.selectionSource || !drag.transformStartTarget) return
    drag.deferredSelectionRestoreTarget = { ...drag.transformStartTarget }
    drag.deferredSelectionRestoreAngle = drag.startAngle ?? 0
    drag.deferredSelectionRestoreShear = drag.transformStartShear ? { ...drag.transformStartShear } : undefined
    drag.deferredSelectionWasMaterialized = Boolean(drag.translationPreview || drag.previewEdit)
    if (drag.translationPreview) restoreSelectionTranslationPreview(session.document, drag.translationPreview)
    else if (drag.previewEdit) revertPixelEdit(session.document, drag.previewEdit)
    if (drag.deferredSelectionWasMaterialized && drag.selectionSource.origin === 'clipboard') {
      // A floating clipboard paste can switch from a materialized preview to
      // the lossless overlay path after its first transform. Rebuild the base
      // composite so a later view zoom cannot reuse pixels from the reverted
      // materialized preview as either a ghost or a missing overlay backdrop.
      compositeCacheRef.current.invalidateAll()
    } else {
      invalidateCompositeRect(drag.selectionSource.selection)
      invalidateCompositeRect(transformedSelectionBounds(drag.transformStartTarget, drag.startAngle ?? 0, drag.transformStartShear))
    }
    drag.previewEdit = null
    drag.translationPreview = null
  }

  const restoreDeferredFloatingSelectionPreview = (drag: DragState): void => {
    if (!drag.floatingPaste || !drag.deferredSelectionPreview || !drag.deferredSelectionWasMaterialized || !drag.selectionSource || !drag.deferredSelectionRestoreTarget) return
    applySelectionTransform(
      session.document,
      drag.selectionSource,
      drag.deferredSelectionRestoreTarget,
      drag.deferredSelectionRestoreAngle ?? 0,
      Boolean(drag.copy),
      drag.deferredSelectionRestoreShear,
      session.symmetryAxes,
      symmetryCenter,
      activePaintLayer(session),
      symmetryStartPointForDrag(drag)
    )
    invalidateCompositeRect(drag.selectionSource.selection)
    invalidateCompositeRect(drag.selectionStart)
  }

  const updateRotatableDragGeometry = (
    drag: DragState,
    point: Point,
    modifiers: ReturnType<typeof selectionMarqueeModifierState>
  ): { target: SelectionRect; angle: number } | null => {
    if (drag.kind !== 'marquee' && drag.kind !== 'shape') return null
    if (inputRef.current.spaceHeld && drag.transformMoveStart) drag.transformOffset = temporaryTransformOffset(drag.transformMoveStart, point)
    const offset = drag.transformOffset ?? { x: 0, y: 0 }
    const adjustedPoint = { x: point.x - offset.x, y: point.y - offset.y }
    const fixedRatio = drag.kind === 'shape' ? session.shapeRatio : null
    let bounds = drag.marqueeBounds ?? (modifiers.fromCenter
      ? centeredShapeBounds(drag.start, adjustedPoint, modifiers.proportional, fixedRatio)
      : shapeBounds(drag.start, adjustedPoint, modifiers.proportional, fixedRatio))
    let angle = drag.marqueeAngle ?? 0
    const modifierMode = resolveMarqueeModifierMode(modifiers, drag.marqueeModifierMode)
    const rotating = modifierMode === 'rotate'

    if (!rotating && drag.marqueeRotationStart) {
      const rotationBounds = drag.marqueeBounds ?? drag.marqueeRotationStart.bounds
      const resizeBounds = modifiers.fromCenter ? centerMarqueeBoundsAtCreationPoint(rotationBounds, drag.start) : rotationBounds
      drag.marqueeBounds = resizeBounds
      drag.marqueeResizeStart = createMarqueeResizeStart(resizeBounds, drag.marqueeRotationStart.lastPointer)
      drag.marqueeRotationStart = undefined
    }

    if (rotating) {
      if (!drag.marqueeRotationStart) drag.marqueeRotationStart = { pointer: adjustedPoint, lastPointer: adjustedPoint, angle, bounds: { ...bounds } }
      const rotationStart = drag.marqueeRotationStart
      bounds = rotationStart.bounds
      angle = rotationStart.angle + selectionRotationAngle(bounds, rotationStart.pointer, adjustedPoint)
      rotationStart.lastPointer = { ...adjustedPoint }
      drag.marqueeAngle = angle
    } else if (drag.marqueeResizeStart) {
      bounds = resizeRotatedMarqueeBounds(
        drag.marqueeResizeStart.bounds,
        { x: adjustedPoint.x - drag.marqueeResizeStart.pointer.x, y: adjustedPoint.y - drag.marqueeResizeStart.pointer.y },
        angle,
        drag.marqueeDirection ?? { x: 1, y: 1 },
        drag.marqueeResizeStart.fromCenter || modifiers.fromCenter,
        modifiers.proportional,
        fixedRatio
      )
      drag.marqueeBounds = bounds
    } else if (angle === 0) {
      bounds = modifiers.fromCenter
        ? centeredShapeBounds(drag.start, adjustedPoint, modifiers.proportional, fixedRatio)
        : shapeBounds(drag.start, adjustedPoint, modifiers.proportional, fixedRatio)
      drag.marqueeBounds = bounds
      drag.marqueeDirection = { x: adjustedPoint.x < drag.start.x ? -1 : 1, y: adjustedPoint.y < drag.start.y ? -1 : 1 }
    }

    const snappedBounds = drag.kind === 'marquee' && angle === 0 && alignmentPreferences.gridAlignmentEnabled && session.view.showGrid
      ? snapSelectionBoundsToGrid(bounds, session.view.grid ?? DEFAULT_GRID_SETTINGS)
      : bounds
    if (angle === 0) drag.marqueeBounds = snappedBounds
    const target = translatedSelectionRect(snappedBounds, offset)
    drag.previewTarget = target
    drag.previewAngle = angle
    return { target, angle }
  }

  const updateMarqueePreview = (
    drag: DragState,
    point: Point,
    modifiers: ReturnType<typeof selectionMarqueeModifierState>
  ): void => {
    if (drag.kind !== 'marquee') return
    if (drag.quickSelectCell) {
      const currentCell = quickSelectionCellAt(session, point)
      if (!currentCell) return
      const target = quickSelectCellDragBounds(drag.quickSelectCell, currentCell)
      const incoming = tilemapPaintSelectionForIncoming(rectSelection(target.x, target.y, target.width, target.height))
      drag.last = point
      drag.marqueeBounds = target
      drag.previewTarget = target
      drag.marqueePreviewSelection = incoming
      drag.marqueeDisplaySelection = incoming
      drag.previewSelection = combineSelection(
        drag.selectionCommitStart ?? drag.selectionStart ?? null,
        incoming,
        drag.selectionMode ?? session.selectionMode
      )
      scheduleDraw()
      return
    }
    const geometry = updateRotatableDragGeometry(drag, point, modifiers)
    if (!geometry) return
    const { target, angle } = geometry
    const repeatMode = liveViewRef.current.tileRepeatMode ?? 'off'
    const repeatedSelection = session.selectionKind === 'ellipse'
      ? rotatedEllipseSelection(target, session.document.width, session.document.height, angle, repeatMode === 'off')
      : rotatedRectSelection(target, session.document.width, session.document.height, angle, repeatMode === 'off', selectionCornerRadius)
    const transformed = repeatMode === 'off'
      ? repeatedSelection
      : wrapSelectionMaskForTileRepeat(repeatedSelection, session.document.width, session.document.height, repeatMode)
    const incoming = tilemapPaintSelectionForIncoming(transformed
      ? symmetrySelection(transformed, session.document.width, session.document.height, session.symmetryAxes, symmetryCenter)
      : null)
    drag.marqueePreviewSelection = incoming
    drag.marqueeDisplaySelection = repeatMode === 'off'
      ? incoming
      : normalizeSelectionForTileRepeatPreview(repeatedSelection, session.document.width, session.document.height, repeatMode)
    drag.previewSelection = combineSelection(drag.selectionStart ?? null, incoming, drag.selectionMode ?? session.selectionMode)
    scheduleDraw()
  }

  const updateShapePreview = (
    drag: DragState,
    point: Point,
    modifiers: ReturnType<typeof selectionMarqueeModifierState>
  ): void => {
    if (drag.kind !== 'shape') return
    updateRotatableDragGeometry(drag, point, modifiers)
    scheduleDraw()
  }

  const updateSelectionTransformPreview = (
    drag: DragState,
    point: Point,
    modifiers: ReturnType<typeof selectionTransformModifierState>
  ): void => {
    if (drag.kind !== 'transform-content' || !drag.selectionStart || !drag.handle) return
    const transformStart = drag.transformStartTarget ?? drag.selectionStart
    const target = resizeTransformedSelectionBounds(
      transformStart,
      { x: point.x - drag.start.x, y: point.y - drag.start.y },
      drag.startAngle ?? 0,
      drag.handle,
      modifiers.proportional,
      modifiers.integerScale,
      modifiers.fromCenter,
      modifiers.fromCenter ? drag.selectionPivotStart : undefined
    )
    if (drag.previewTarget?.x === target.x && drag.previewTarget.y === target.y && drag.previewTarget.width === target.width && drag.previewTarget.height === target.height && drag.previewTarget.flipHorizontal === target.flipHorizontal && drag.previewTarget.flipVertical === target.flipVertical && drag.previewTarget.flipOriginX === target.flipOriginX && drag.previewTarget.flipOriginY === target.flipOriginY) return
    if (!prepareSelectionTransformDrag(drag)) return
    drag.previewTarget = target
    drag.previewAngle = drag.startAngle ?? 0
    drag.previewShear = drag.transformStartShear ? { ...drag.transformStartShear } : undefined
    if (drag.selectionPivotStart) {
      drag.previewPivot = selectionPivotAfterResize(transformStart, target, drag.selectionPivotStart, {
        angle: drag.startAngle,
        shear: drag.transformStartShear,
        fromCenter: modifiers.fromCenter,
        custom: drag.selectionPivotCustom
      })
    }
    scheduleSelectionPreview(drag)
  }

  const updateFreeTransformPreview = (drag: DragState, point: Point): void => {
    if (!drag.freeTransform || !drag.selectionStart || !drag.handle) return
    if (drag.handle !== 'nw' && drag.handle !== 'ne' && drag.handle !== 'se' && drag.handle !== 'sw') return
    const startQuad = drag.transformStartQuad
      ?? selectionQuadFromRect(drag.transformStartTarget ?? drag.selectionStart, drag.startAngle ?? 0, drag.transformStartShear)
    const nextQuad: SelectionQuad = {
      nw: { ...startQuad.nw },
      ne: { ...startQuad.ne },
      se: { ...startQuad.se },
      sw: { ...startQuad.sw }
    }
    // Keep the frame pixel-aligned while allowing the selected corner to move
    // independently. The other three corners are copied verbatim.
    nextQuad[drag.handle] = { x: Math.round(point.x), y: Math.round(point.y) }
    if (!selectionQuadTransform(nextQuad)) return
    const target = selectionQuadBounds(nextQuad)
    const previousQuad = drag.previewQuad ?? startQuad
    if (previousQuad.nw.x === nextQuad.nw.x && previousQuad.nw.y === nextQuad.nw.y
      && previousQuad.ne.x === nextQuad.ne.x && previousQuad.ne.y === nextQuad.ne.y
      && previousQuad.se.x === nextQuad.se.x && previousQuad.se.y === nextQuad.se.y
      && previousQuad.sw.x === nextQuad.sw.x && previousQuad.sw.y === nextQuad.sw.y) return
    if (!prepareSelectionTransformDrag(drag)) return
    drag.last = point
    drag.previewQuad = nextQuad
    drag.previewTarget = target
    drag.previewAngle = 0
    drag.previewShear = undefined
    drag.previewPivot = undefined
    // Free transforms are materialized during the drag so zooming or panning
    // cannot fall back to the rectangular deferred preview.
    scheduleSelectionPreview(drag, true)
  }

  const beginSelectionAdjustmentEdit = (): void => {
    if (adjustmentPreviewEditRef.current) return
    adjustmentPreviewEditRef.current = true
    beginAdjustmentPreviewEdit(session.document.id)
  }

  const endSelectionAdjustmentEdit = (): void => {
    if (!adjustmentPreviewEditRef.current) return
    adjustmentPreviewEditRef.current = false
    endAdjustmentPreviewEdit(session.document.id)
  }

  const prepareSelectionTransformDrag = (drag: DragState): boolean => {
    if (!drag.selectionPreparationPending) return Boolean(drag.selectionSource)
    drag.selectionPreparationPending = false
    preserveCanvasSelection(session.document.id)
    beginSelectionAdjustmentEdit()
    const sourceQuadForOrigin = (origin?: Point): SelectionQuad | undefined => {
      if (!drag.freeTransform || !drag.transformStartQuad) return undefined
      const offsetX = origin?.x ?? 0
      const offsetY = origin?.y ?? 0
      return {
        nw: { x: drag.transformStartQuad.nw.x - offsetX, y: drag.transformStartQuad.nw.y - offsetY },
        ne: { x: drag.transformStartQuad.ne.x - offsetX, y: drag.transformStartQuad.ne.y - offsetY },
        se: { x: drag.transformStartQuad.se.x - offsetX, y: drag.transformStartQuad.se.y - offsetY },
        sw: { x: drag.transformStartQuad.sw.x - offsetX, y: drag.transformStartQuad.sw.y - offsetY }
      }
    }
    const ensureSourceQuad = (source: SelectionTransformSource, origin?: Point): void => {
      // A floating source can be transformed repeatedly before confirmation.
      // Its original frame must remain stable, so only initialize this once.
      if (source.sourceQuad) return
      const sourceQuad = sourceQuadForOrigin(origin)
      if (sourceQuad) source.sourceQuad = sourceQuad
    }
    if (drag.selectionSource) ensureSourceQuad(drag.selectionSource)
    if (!drag.selectionSource && drag.selectionStart) {
      const layer = activePaintLayer(session)
      if (multipleAnimationSelection) {
        if (!selectionLayersEditable) {
          endSelectionAdjustmentEdit()
          return false
        }
        drag.deferredSelectionPreview = false
        drag.selectionLayers = captureAnimationFrameSelectionTransformStates(
          session.document,
          session.selectedAnimationFrameIds,
          selectedTransformLayers.map((candidate) => candidate.id),
          drag.selectionStart,
          session.selectedAnimationCellKeys
        )
        if (drag.selectionLayers.length === 0) {
          endSelectionAdjustmentEdit()
          return false
        }
        for (const layerState of drag.selectionLayers) ensureSourceQuad(layerState.source)
        syncPrimarySelectionLayerState(drag)
      } else if (layer.kind === 'free-tile') {
        const selectedTarget = selectedFreeTileSelectionTarget()
        const scopedSelection = freeTileSelectionForInstanceEdit(drag.selectionStart, selectedTarget?.bounds)
        if (!selectedTarget || !scopedSelection) {
          endSelectionAdjustmentEdit()
          return false
        }
        const sourceEdit = createFreeTileSourceEditRaster(session.document, selectedTarget.source, selectedTarget.bounds, undefined, selectedTarget.instance)
        const localSelection = sourceEdit ? freeTileSelectionToEditRaster(sourceEdit, scopedSelection) : null
        const source = sourceEdit && localSelection
          ? captureSelectionTransform(sourceEdit.document, localSelection, sourceEdit.layer)
          : null
        if (!sourceEdit || !localSelection || !source) {
          endSelectionAdjustmentEdit()
          return false
        }
        drag.selectionStart = scopedSelection
        drag.selectionSource = source
        ensureSourceQuad(source, sourceEdit.origin)
        drag.deferredSelectionPreview = false
        drag.freeTileSelectionTransform = true
        drag.freeTileSelectionSource = cloneSelection(scopedSelection) ?? undefined
        drag.appliedSelection = cloneSelection(scopedSelection)
        drag.appliedPreviewTarget = { ...(drag.previewTarget ?? drag.transformStartTarget ?? scopedSelection) }
        drag.appliedPreviewAngle = drag.previewAngle ?? drag.startAngle ?? 0
        drag.appliedPreviewShear = drag.previewShear ? { ...drag.previewShear } : drag.transformStartShear ? { ...drag.transformStartShear } : undefined
        drag.appliedPreviewPivot = drag.previewPivot ? { ...drag.previewPivot } : undefined
        drag.freeTileSelectionPivotBefore = session.selectionPivot ? { ...session.selectionPivot } : null
        drag.freeTileSourceId = selectedTarget.source.id
        drag.freeTileInstanceId = selectedTarget.instance.id
        drag.freeTileEditDocument = sourceEdit.document
        drag.freeTileEditLayer = sourceEdit.layer
        drag.freeTileSourceBefore = sourceEdit.before
        drag.freeTileEditOrigin = sourceEdit.origin
        drag.freeTileEditSourceOffset = sourceEdit.sourceOffset
        drag.freeTileEditInstanceTransform = sourceEdit.instanceTransform
        drag.freeTileEditTransformedSourceBounds = sourceEdit.transformedSourceBounds
        drag.freeTileEditSelection = localSelection
      } else {
        const layers = selectedTransformLayersForSession(session)
        if (layers.length > 1) {
          if (!selectedTransformLayersAreEditable(session, layers)) {
            endSelectionAdjustmentEdit()
            return false
          }
          drag.deferredSelectionPreview = false
          drag.selectionLayers = layers.flatMap((layer) => {
            const source = captureSelectionTransform(session.document, drag.selectionStart!, layer)
            if (source) ensureSourceQuad(source)
            return source ? [{ layerId: layer.id, source, previewEdit: null, translationPreview: null }] : []
          })
          syncPrimarySelectionLayerState(drag)
        } else {
          drag.selectionSource = captureSelectionTransform(session.document, drag.selectionStart, layer, { cacheOpaqueOffsets: !drag.deferredSelectionPreview }) ?? undefined
          if (drag.selectionSource) ensureSourceQuad(drag.selectionSource)
        }
      }
    }
    if (!drag.selectionSource) {
      endSelectionAdjustmentEdit()
      return false
    }
    prepareDeferredFloatingSelectionPreview(drag)
    if (drag.selectionStart) renderAdjustmentPreviewEdit(session.document.id, drag.selectionStart)
    return true
  }

  useEffect(() => () => {
    if (!adjustmentPreviewEditRef.current) return
    adjustmentPreviewEditRef.current = false
    endAdjustmentPreviewEdit(session.document.id)
  }, [session.document.id])

  useEffect(() => {
    pressureAdapterRef.current.reset()
    inputRef.current.resetPointerDeviceState()
    const resetPointerDevices = (): void => {
      inputRef.current.resetPointerDeviceState()
      pressureAdapterRef.current.reset()
    }
    const handleVisibilityChange = (): void => {
      if (document.visibilityState === 'hidden') resetPointerDevices()
    }
    window.addEventListener('blur', resetPointerDevices)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.removeEventListener('blur', resetPointerDevices)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      inputRef.current.resetPointerDeviceState()
      pressureAdapterRef.current.reset()
    }
  }, [session.document.id])

  const flushCanvasResizePreview = (): void => {
    if (canvasResizeFrameRef.current !== null) {
      window.cancelAnimationFrame(canvasResizeFrameRef.current)
      canvasResizeFrameRef.current = null
    }
    const pending = pendingCanvasResizeRef.current
    pendingCanvasResizeRef.current = null
    if (pending) useWorkspace.getState().setCanvasResizePreview(pending)
  }

  const scheduleCanvasResizePreview = (preview: NonNullable<DocumentSession['canvasResizePreview']>): void => {
    pendingCanvasResizeRef.current = preview
    canvasResizePreviewRef.current = preview
    scheduleDraw()
    if (canvasResizeFrameRef.current !== null) return
    canvasResizeFrameRef.current = window.requestAnimationFrame(() => {
      canvasResizeFrameRef.current = null
      const pending = pendingCanvasResizeRef.current
      pendingCanvasResizeRef.current = null
      if (pending) useWorkspace.getState().setCanvasResizePreview(pending)
    })
  }

  const cancelActiveCanvasInteraction = (): void => {
    if (canvasColorSamplingActiveFor(canvasRef.current)) endCanvasColorSampling()
    clearCanvasToolGestures()
    stopAirbrushTimer()
    hideMoveLayerContentPreview()
    gradientPreviewCoverageCacheRef.current = null
    const drag = inputRef.current.resetInteraction()
    symmetryDragRef.current = null
    if (selectionPreviewFrameRef.current !== null) {
      window.cancelAnimationFrame(selectionPreviewFrameRef.current)
      selectionPreviewFrameRef.current = null
    }
    if (!drag) {
      endSelectionAdjustmentEdit()
      return
    }
    if (adjustmentPreviewEditRef.current) prepareAdjustmentPreviewEdit(session.document.id)
    const state = useWorkspace.getState()
    let documentChanged = false
    if (drag.selectionPreparationPending) {
      // A press without a real transform never touched document pixels.
    } else if (drag.floatingPaste && drag.deferredSelectionPreview) {
      restoreDeferredFloatingSelectionPreview(drag)
    } else if (drag.floatingPaste) {
      const target = drag.previewSelection ?? drag.selectionStart
      const hasLayerPreview = drag.selectionLayers?.some((layer) => layer.previewEdit || layer.translationPreview)
      if (target && (drag.previewEdit || drag.translationPreview || hasLayerPreview)) state.updateFloatingPastePreview(drag.previewEdit ?? null, target, drag.translationPreview, drag.previewTarget, drag.previewAngle, drag.previewShear, false, drag.selectionLayers, drag.previewQuad)
    } else if (drag.selectionLayers?.length) {
      restoreSelectionLayerPreviews(drag.selectionLayers)
      documentChanged = true
    } else if (drag.tilemapSelectionMoveSource && drag.tilemapEdit) {
      documentChanged = applyTilemapDocumentEdit(session.document, drag.tilemapEdit, 'before')
    } else if (drag.kind === 'tile-draw' && drag.tilemapEdit) {
      documentChanged = applyTilemapDocumentEdit(session.document, drag.tilemapEdit, 'before')
    } else if (drag.freeTileInstanceSelectionMove && drag.freeTilePlacementEdit) {
      state.cancelFreeTilePlacement(drag.freeTilePlacementEdit)
      documentChanged = true
    } else if ((drag.kind === 'free-tile-draw' || drag.kind === 'free-tile-instance-move') && drag.freeTilePlacementEdit) {
      state.cancelFreeTilePlacement(drag.freeTilePlacementEdit)
      documentChanged = true
    } else if (drag.freeTileSourceId && drag.freeTileSourceBefore) {
      const before = drag.freeTileSourceBefore
      documentChanged = state.previewFreeTileSource(before.sourceId, before.width, before.height, before.pixels, before.offsetX, before.offsetY)
      if (drag.freeTilePlacementEdit) state.cancelFreeTilePlacement(drag.freeTilePlacementEdit)
    } else documentChanged = revertCancelledCanvasDragPixelChanges(session.document, drag)
    if (drag.kind === 'move-layer') {
      state.cancelLayerMovePreview(session.document.id, drag)
      documentChanged = true
    }
    if (drag.kind === 'transform-text-box') {
      state.cancelTextBoxTransform()
      documentChanged = true
    }
    if ((drag.kind === 'canvas-resize' || drag.kind === 'canvas-move') && drag.canvasPreview) {
      if (canvasResizeFrameRef.current !== null) window.cancelAnimationFrame(canvasResizeFrameRef.current)
      canvasResizeFrameRef.current = null
      pendingCanvasResizeRef.current = null
      canvasResizePreviewRef.current = { ...drag.canvasPreview }
      state.setCanvasResizePreview(drag.canvasPreview)
    }
    if (drag.kind === 'pan') finishPanPreview()
    if (drag.kind === 'zoom-drag') finishZoomPreview()
    endSelectionAdjustmentEdit()
    if (documentChanged) {
      invalidateOnionSkinDragFrames(drag)
      compositeCacheRef.current.invalidateAll()
    }
    scheduleDraw()
  }

  useEffect(() => {
    const prepareEscapeCancellation = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && inputRef.current.drag) cancelActiveCanvasInteraction()
    }
    window.addEventListener('keydown', prepareEscapeCancellation, true)
    return () => window.removeEventListener('keydown', prepareEscapeCancellation, true)
  // The capture phase updates floating preview ownership before App handles Escape.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.document.id])

  useEffect(() => () => {
    publishSelectionSizePreview({ documentId: session.document.id, size: null })
  }, [session.document.id])

  const displayedSelectionPoint = (point: Point): Point => {
    const size = stageSize()
    const view = liveViewRef.current
    const pivot = viewRotationPivot(size.width, size.height, view.panX, view.panY, rotationIndicatorPosition)
    const untransformed = selectionScreenPoint(size.width, size.height, session.document.width, session.document.height, view, point)
    const mirrored = mirrorViewportPoint(untransformed, pivot, Boolean(view.mirrored), Boolean(view.mirroredVertical))
    return rotateViewportPoint(mirrored, pivot, view.rotation)
  }

  const drawSelectionOverlay = (): void => {
    const canvas = canvasRef.current
    const overlay = selectionCanvasRef.current
    if (!canvas || !overlay) return
    const currentSession = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id) ?? session
    const selectionDrag = canvasGestureForPreview(inputRef.current.drag)
    const textBoxTransform = currentSession.textBoxTransform
    const activeTextBoxDrag = inputRef.current.drag?.kind === 'transform-text-box' || inputRef.current.drag?.kind === 'create-text-box' ? inputRef.current.drag : null
    const selectedTextBox = selectedTextBoxForSession(currentSession)
    const visibleTextBox = activeTextBoxDrag?.previewTarget ?? textToolBoxRef.current ?? textBoxTransform?.bounds ?? selectedTextBox
    const creatingSelection = selectionDrag?.kind === 'marquee' || selectionDrag?.kind === 'lasso' || selectionDrag?.kind === 'polygon-lasso'
    const transformedDrag = selectionDrag && (selectionDrag.kind === 'move-content' || selectionDrag.kind === 'transform-content' || selectionDrag.kind === 'rotate-content' || selectionDrag.kind === 'shear-content')
      ? selectionDrag
      : null
    const rotatingDrag = transformedDrag?.kind === 'rotate-content' ? transformedDrag : null
    const rotatingSelection = Boolean(rotatingDrag)
    const overlayFrame = selectionOverlayFrameForDrag(currentSession.selection, selectionDrag)
    const visibleSelection = overlayFrame.selection
    const selectionSizeTarget = drawingSizePreviewTargetForDrag(selectionDrag, currentSession.shapeRatio)
    const tilemapPaintReadout = selectionSizeTarget && selectionDrag?.kind === 'marquee'
      && currentSession.tilemapMode === 'paint'
      && activePaintLayer(currentSession).kind === 'tilemap'
      ? (() => {
          const target = activeTilemapCelTarget(currentSession.document)
          const expanded = target
            ? expandSelectionToTilemapCells(
                rectSelection(selectionSizeTarget.x, selectionSizeTarget.y, selectionSizeTarget.width, selectionSizeTarget.height),
                target.tilemap,
                target.surface.offsetX,
                target.surface.offsetY,
                { x: 0, y: 0, width: currentSession.document.width, height: currentSession.document.height }
              )
            : null
          if (!target || !expanded) return null
          return {
            target: { x: expanded.x, y: expanded.y, width: expanded.width, height: expanded.height },
            columns: Math.max(1, Math.round(expanded.width / target.tilemap.tileWidth)),
            rows: Math.max(1, Math.round(expanded.height / target.tilemap.tileHeight)),
            anchor: displayedSelectionPoint({ x: expanded.x, y: expanded.y })
          }
        })()
      : null
    const selectionSizeLabelTarget = tilemapPaintReadout?.target ?? selectionSizeTarget
    const selectionSizeLabelAngle = tilemapPaintReadout ? 0 : (selectionDrag?.kind === 'marquee' || selectionDrag?.kind === 'shape'
      ? selectionDrag.previewAngle ?? selectionDrag.marqueeAngle ?? 0
      : 0)
    const rect = stageSize()
    const displaySize = stageDisplaySize()
    const dpr = canvasBackingRatioForInterfaceScale(window.devicePixelRatio || 1, interfaceScale)
    const deviceScale = syncCanvasDisplaySize(overlay, rect.width, rect.height, dpr, displaySize.width, displaySize.height)
    const displayContext = overlay.getContext('2d')
    if (!displayContext) return
    displayContext.setTransform(deviceScale.x, 0, 0, deviceScale.y, 0, 0)
    clearCanvasBacking(displayContext, overlay)
    displayContext.setTransform(deviceScale.x, 0, 0, deviceScale.y, 0, 0)
    const alignmentGuides = alignmentPreferences.alignmentGuidesVisible ? selectionDrag?.alignmentGuides ?? [] : []
    const freeTileInstancesSelectionBounds = !visibleSelection && !visibleTextBox && !currentSession.animationPlaying
      ? selectedFreeTileInstancesBounds(currentSession)
      : null
    const shouldDrawSelection = Boolean(visibleSelection || visibleTextBox || freeTileInstancesSelectionBounds || (selectionSizeVisible && selectionSizeTarget) || alignmentGuides.length)
    selectionOverlayVisibleRef.current = shouldDrawSelection
    if (!shouldDrawSelection) return
    const renderPlan = createCanvasRenderPlan(rect.width, rect.height, session.document, liveViewRef.current, rotationIndicatorPosition)
    const { rotated, sceneLeft, sceneTop, sceneWidth, sceneHeight, originX, originY, canvasWidth, canvasHeight } = renderPlan
    let context: RasterContext2D = displayContext
    if (rotated) {
      let scene = selectionRotationSceneRef.current
      const sceneBackingWidth = Math.max(1, Math.ceil(sceneWidth * deviceScale.x))
      const sceneBackingHeight = Math.max(1, Math.ceil(sceneHeight * deviceScale.y))
      if (!scene || scene.width !== sceneBackingWidth || scene.height !== sceneBackingHeight) {
        scene = new OffscreenCanvas(sceneBackingWidth, sceneBackingHeight)
        selectionRotationSceneRef.current = scene
      }
      const sceneContext = scene.getContext('2d')
      if (!sceneContext) return
      sceneContext.setTransform(deviceScale.x, 0, 0, deviceScale.y, -sceneLeft * deviceScale.x, -sceneTop * deviceScale.y)
      clearCanvasBacking(sceneContext, scene)
      sceneContext.setTransform(deviceScale.x, 0, 0, deviceScale.y, -sceneLeft * deviceScale.x, -sceneTop * deviceScale.y)
      context = sceneContext
    }
    if (alignmentGuides.length) {
      const devicePixelX = 1 / deviceScale.x
      const devicePixelY = 1 / deviceScale.y
      const alignToDevicePixelX = (value: number): number => deviceAlignedCoordinate(value, deviceScale.x)
      const alignToDevicePixelY = (value: number): number => deviceAlignedCoordinate(value, deviceScale.y)
      context.save()
      context.beginPath()
      const boundary = deviceAlignedCanvasRect(originX, originY, canvasWidth, canvasHeight, deviceScale)
      context.rect(boundary.left, boundary.top, boundary.width, boundary.height)
      context.clip()
      context.globalCompositeOperation = 'source-over'
      context.globalAlpha = 0.9
      context.fillStyle = '#2979FF'
      for (const guide of alignmentGuides) {
        if (guide.axis === 'x' && guide.position >= 0 && guide.position <= session.document.width) {
          const x = alignToDevicePixelX(originX + guide.position * liveViewRef.current.zoom) - (guide.position === session.document.width ? devicePixelX : 0)
          context.fillRect(x, boundary.top, devicePixelX, boundary.height)
        } else if (guide.axis === 'y' && guide.position >= 0 && guide.position <= session.document.height) {
          const y = alignToDevicePixelY(originY + guide.position * liveViewRef.current.zoom) - (guide.position === session.document.height ? devicePixelY : 0)
          context.fillRect(boundary.left, y, boundary.width, devicePixelY)
        }
      }
      context.restore()
    }
    const floatingTransform = currentSession.pendingPaste
    const transformedQuad = transformedDrag?.freeTransform
      ? overlayFrame.quad
      : currentSession.freeTransformActive
        ? currentSession.pendingPaste?.transformQuad ?? currentSession.freeTransformQuad ?? undefined
        : undefined
    const transformedTarget = transformedQuad
      ? selectionQuadBounds(transformedQuad)
      : transformedDrag
        ? overlayFrame.target
        : floatingTransform?.transformTarget
          ?? (currentSession.freeTransformActive ? visibleSelection ?? undefined : undefined)
    const transformedAngle = transformedQuad
      ? 0
      : transformedDrag
        ? overlayFrame.angle
        : floatingTransform?.transformAngle ?? 0
    const transformedShear = transformedQuad
      ? undefined
      : transformedDrag
        ? overlayFrame.shear
        : floatingTransform?.transformShear
    const transformedHandlePoints = transformedQuad
      ? [transformedQuad.nw, transformedQuad.ne, transformedQuad.sw, transformedQuad.se]
          .map((point) => selectionScreenPoint(rect.width, rect.height, session.document.width, session.document.height, liveViewRef.current, point))
      : transformedTarget
        ? transformedSelectionControlPoints(
            transformedTarget,
            transformedAngle,
            transformedShear
          )
            .filter((_point, index) => !currentSession.freeTransformActive || index === 0 || index === 2 || index === 5 || index === 7)
            .map((point) => selectionScreenPoint(rect.width, rect.height, session.document.width, session.document.height, liveViewRef.current, point))
        : undefined
    const transformedFramePoints = transformedQuad
      ? [transformedQuad.nw, transformedQuad.ne, transformedQuad.se, transformedQuad.sw]
          .map((point) => selectionScreenPoint(rect.width, rect.height, session.document.width, session.document.height, liveViewRef.current, point))
      : undefined
    const pivotTarget = transformedTarget ?? visibleSelection ?? undefined
    const visiblePivot = visibleSelection && !visibleTextBox && currentSession.freeTransformActive !== true && currentSession.view.showSelectionPivot !== false && !creatingSelection && pivotTarget
      ? overlayFrame.pivot
        ?? currentSession.selectionPivot
        ?? transformedSelectionPivotPreset(pivotTarget, 'center', transformedTarget ? transformedAngle : 0, transformedTarget ? transformedShear : undefined)
      : null
    const drawOverlaySelection = (selection: SelectionMask, showHandles: boolean, color?: string): void => {
      selectionBoundaryCacheRef.current = drawSelectionOutline({
        context,
        selection,
        box: selectionScreenBox(rect.width, rect.height, session.document.width, session.document.height, liveViewRef.current, selection),
        view: liveViewRef.current,
        viewportWidth: rect.width,
        viewportHeight: rect.height,
        rotationIndicatorPosition,
        cache: selectionBoundaryCacheRef.current,
        outlineDark: color ?? activeTheme.variables['--theme-selection-outline-dark'],
        outlineLight: color ?? activeTheme.variables['--theme-selection-outline-light'],
        showOutline: !rotatingSelection && currentSession.view.showSelectionOutline !== false,
        showHandles,
        handlePoints: transformedHandlePoints,
        framePoints: transformedFramePoints
      })
    }
    if (visibleTextBox) {
      const selection = rectSelection(visibleTextBox.x, visibleTextBox.y, visibleTextBox.width, visibleTextBox.height)
      drawOverlaySelection(selection, currentSession.tool === 'text' && Boolean(selectedTextBox), `rgb(${textBoxColor.r} ${textBoxColor.g} ${textBoxColor.b} / ${textBoxColor.a / 255})`)
    } else if (visibleSelection) drawOverlaySelection(visibleSelection, currentSession.tool === 'selection' && !creatingSelection)
    else if (freeTileInstancesSelectionBounds) drawOverlaySelection(rectSelection(
      freeTileInstancesSelectionBounds.x,
      freeTileInstancesSelectionBounds.y,
      freeTileInstancesSelectionBounds.width,
      freeTileInstancesSelectionBounds.height
    ), false, `rgb(${freeTileInstanceOutlineColor.r} ${freeTileInstanceOutlineColor.g} ${freeTileInstanceOutlineColor.b} / ${freeTileInstanceOutlineColor.a / 255})`)
    if (rotated) {
      displayContext.save()
      applyViewRotation(displayContext, rect.width, rect.height, liveViewRef.current)
      displayContext.imageSmoothingEnabled = false
      const scene = selectionRotationSceneRef.current!
      // Use the actual horizontal/vertical backing ratios.  The scene size
      // is rounded independently on each axis, so a single nominal DPR can
      // introduce a second fractional scale at the final composite step.
      displayContext.drawImage(scene, 0, 0, scene.width, scene.height, sceneLeft, sceneTop, scene.width / deviceScale.x, scene.height / deviceScale.y)
      displayContext.restore()
    }
    const pivotImage = selectionPivotImageRef.current
    if (visiblePivot && pivotImage?.complete && pivotImage.naturalWidth > 0) {
      const point = displayedSelectionPoint(visiblePivot)
      displayContext.save()
      displayContext.imageSmoothingEnabled = false
      displayContext.drawImage(
        pivotImage,
        Math.round(point.x) - SELECTION_PIVOT_ICON_OFFSET,
        Math.round(point.y) - SELECTION_PIVOT_ICON_OFFSET,
        SELECTION_PIVOT_ICON_SIZE,
        SELECTION_PIVOT_ICON_SIZE
      )
      displayContext.restore()
    }
    if (selectionSizeVisible && selectionSizeLabelTarget) {
      const controlPoints = transformedSelectionControlPoints(selectionSizeLabelTarget, selectionSizeLabelAngle)
      drawSelectionSizeLabel({
        context: displayContext,
        points: [controlPoints[0], controlPoints[2], controlPoints[5], controlPoints[7]].map(displayedSelectionPoint),
        selectionX: selectionSizeLabelTarget.x,
        selectionY: selectionSizeLabelTarget.y,
        selectionWidth: selectionSizeLabelTarget.width,
        selectionHeight: selectionSizeLabelTarget.height,
        viewportWidth: rect.width,
        viewportHeight: rect.height,
        startLabel: t('canvas.selectionInfo.start'),
        endLabel: t('canvas.selectionInfo.end'),
        sizeLabel: tilemapPaintReadout ? t('canvas.selectionInfo.tiles') : t('canvas.selectionInfo.size'),
        background: 'rgb(64 64 64 / 0.78)',
        foreground: '#ffffff',
        sizeWidth: tilemapPaintReadout?.columns,
        sizeHeight: tilemapPaintReadout?.rows,
        anchor: tilemapPaintReadout?.anchor
      })
    }
  }

  const draw = (): void => {
    const performanceProbe = window.__moonSpriteCanvasProbe
    const drawStartedAt = performanceProbe ? performance.now() : 0
    const canvas = canvasRef.current
    if (!canvas) return
    // Ctrl+Alt is the brush-size modifier, while Ctrl alone is the temporary
    // move tool. Keep the real paint session during the modifier preview so
    // the quick-move target cannot suppress the brush preview.
    const brushSizeAdjustmentActive = Boolean(inputRef.current.modifierBrushSize)
    const baseSession = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id) ?? session
    const sharedSession = sharedCanvasSession(baseSession)
    const currentSession = brushSizeAdjustmentActive
      ? sharedSession
      : sessionWithActiveQuickTool(sharedSession)
    const currentActiveLayer = activePaintLayer(currentSession)
    const currentLayerMask = activeLayerMask(currentSession)
    const isolatedLayerMask = currentSession.layerMaskIsolatedView ? currentLayerMask : null
    const currentHasRasterSelection = Boolean(currentLayerMask) || (currentSession.selectedGroupIds.length === 0 && currentSession.selectedLayerIds.some((id) => currentSession.document.layers.some((layer) => layer.id === id)))
    const currentSelectionLayersEditable = selectedTransformLayersAreEditable(currentSession)
    const temporaryMovePreviewActive = temporaryMoveActive({
      ctrlKey: inputRef.current.ctrlHeld,
      metaKey: false,
      altKey: inputRef.current.altHeld,
      shiftKey: inputRef.current.shiftHeld
    }, currentSession)
    const brushSizeAdjustmentPreviewActive = wheelBrushSizePreviewRef.current || brushSizeAdjustmentActive
    const canRenderToolPreview = !temporaryMoveSuppressesToolPreview(temporaryMovePreviewActive, brushSizeAdjustmentPreviewActive)
      && !canvasResizePreviewRef.current
      && (currentSession.tool === 'selection'
        ? currentSelectionLayersEditable
        : currentHasRasterSelection && isLayerEffectivelyVisible(currentSession.document, currentActiveLayer) && !isLayerEffectivelyLocked(currentSession.document, currentActiveLayer))
    const rect = stageSize()
    const displaySize = stageDisplaySize()
    const dpr = canvasBackingRatioForInterfaceScale(window.devicePixelRatio || 1, interfaceScale)
    const deviceScale = syncCanvasDisplaySize(canvas, rect.width, rect.height, dpr, displaySize.width, displaySize.height)
    const displayContext = canvas.getContext('2d')
    if (!displayContext) return
    displayContext.setTransform(deviceScale.x, 0, 0, deviceScale.y, 0, 0)
    clearCanvasBacking(displayContext, canvas)
    displayContext.setTransform(deviceScale.x, 0, 0, deviceScale.y, 0, 0)
    const document = currentSession.document
    const view = liveViewRef.current
    const activeDrag = inputRef.current.drag
    const pointerOverCanvas = pointerIsOverCanvas(canvas, inputRef.current.pointer)
    const selectionPreviewOwner = deferredSelectionPreviewOwner(activeDrag, Boolean(currentSession.pendingPaste?.previewDeferred))
    const smoothPixelSampling = pixelSamplingMode(view.zoom) === 'smooth'
    const onionSkinInvalidation = currentSession.selectedAnimationFrameIds.length > 1 && currentSession.contentInvalidation
      ? { ...currentSession.contentInvalidation, frameId: undefined }
      : currentSession.contentInvalidation
    const renderPlan = createCanvasRenderPlan(rect.width, rect.height, document, view, rotationIndicatorPosition)
    const { rotated, viewport, sceneLeft, sceneTop, sceneWidth, sceneHeight, originX, originY, canvasWidth, canvasHeight, fromX, fromY, toX, toY } = renderPlan
    let context: RasterContext2D = displayContext
    if (rotated) {
      let scene = rotationSceneRef.current
      const sceneBackingWidth = Math.max(1, Math.ceil(sceneWidth * deviceScale.x))
      const sceneBackingHeight = Math.max(1, Math.ceil(sceneHeight * deviceScale.y))
      if (!scene || scene.width !== sceneBackingWidth || scene.height !== sceneBackingHeight) {
        scene = new OffscreenCanvas(sceneBackingWidth, sceneBackingHeight)
        rotationSceneRef.current = scene
      }
      const sceneContext = scene.getContext('2d')
      if (!sceneContext) return
      sceneContext.setTransform(deviceScale.x, 0, 0, deviceScale.y, -sceneLeft * deviceScale.x, -sceneTop * deviceScale.y)
      clearCanvasBacking(sceneContext, scene)
      sceneContext.setTransform(deviceScale.x, 0, 0, deviceScale.y, -sceneLeft * deviceScale.x, -sceneTop * deviceScale.y)
      context = sceneContext
    }
    context.fillStyle = activeTheme.definition.seeds.canvasSurround
    context.fillRect(rotated ? sceneLeft : 0, rotated ? sceneTop : 0, rotated ? sceneWidth : rect.width, rotated ? sceneHeight : rect.height)
    context.save()
    // Every repeated canvas copy must use the same device-aligned period.
    // Rounding each floating-point copy origin independently can make the
    // right edge of one copy differ from the left edge of its neighbour by a
    // physical pixel, which shows up as a transient seam during previews.
    const baseCanvasBoundary = deviceAlignedCanvasRect(originX, originY, canvasWidth, canvasHeight, deviceScale)
    const renderCanvasWidth = baseCanvasBoundary.width
    const renderCanvasHeight = baseCanvasBoundary.height
    const repeatOffsets = tileRepeatOffsetsForViewport(
      viewport,
      originX,
      originY,
      canvasWidth,
      canvasHeight,
      view.tileRepeatMode ?? 'off'
    )
    const repeatCopies = repeatOffsets.map((offset) => {
      const copyBoundary = repeatedDeviceAlignedCanvasRect(baseCanvasBoundary, offset.x, offset.y)
      const copyOriginX = copyBoundary.left
      const copyOriginY = copyBoundary.top
      return {
        ...offset,
        originX: copyOriginX,
        originY: copyOriginY,
        fromX: offset.x === 0 ? fromX : Math.max(0, Math.floor((viewport.left - copyOriginX) / view.zoom)),
        fromY: offset.y === 0 ? fromY : Math.max(0, Math.floor((viewport.top - copyOriginY) / view.zoom)),
        toX: offset.x === 0 ? toX : Math.min(document.width, Math.ceil((viewport.right - copyOriginX) / view.zoom)),
        toY: offset.y === 0 ? toY : Math.min(document.height, Math.ceil((viewport.bottom - copyOriginY) / view.zoom))
      }
    })
    const baseRenderCopy = repeatCopies.find((copy) => copy.x === 0 && copy.y === 0) ?? repeatCopies[0]
    const previewOriginX = baseRenderCopy?.originX ?? baseCanvasBoundary.left
    const previewOriginY = baseRenderCopy?.originY ?? baseCanvasBoundary.top
    const canvasBoundaryFor = (copy: { x: number; y: number }): ReturnType<typeof deviceAlignedCanvasRect> =>
      repeatedDeviceAlignedCanvasRect(baseCanvasBoundary, copy.x, copy.y)
    const clipCanvasCopy = (targetContext: RasterContext2D, copy: { x: number; y: number }): void => {
      const boundary = canvasBoundaryFor(copy)
      targetContext.beginPath()
      targetContext.rect(boundary.left, boundary.top, boundary.width, boundary.height)
      targetContext.clip()
    }
    const clipBaseCanvas = (targetContext: RasterContext2D): void => {
      targetContext.beginPath()
      targetContext.rect(baseCanvasBoundary.left, baseCanvasBoundary.top, baseCanvasBoundary.width, baseCanvasBoundary.height)
      targetContext.clip()
    }
    const checkerCell = checkerboard.size * view.zoom
    const drawCheckerboard = (copy: typeof repeatCopies[number]): void => {
      const boundary = canvasBoundaryFor(copy)
      context.save()
      clipCanvasCopy(context, copy)
      context.fillStyle = `rgb(${checkerboard.lightColor.r} ${checkerboard.lightColor.g} ${checkerboard.lightColor.b})`
      context.fillRect(boundary.left, boundary.top, boundary.width, boundary.height)
      if (checkerCell >= 2) {
        const integerCell = Number.isInteger(checkerCell)
        const tileKey = `${checkerCell}:${checkerboard.lightColor.r},${checkerboard.lightColor.g},${checkerboard.lightColor.b}:${checkerboard.darkColor.r},${checkerboard.darkColor.g},${checkerboard.darkColor.b}`
        let pattern: CanvasPattern | null = null
        if (integerCell && typeof context.createPattern === 'function') {
          let tile = checkerboardTileRef.current
          const tileSize = Math.max(1, Math.round(checkerCell))
          if (!tile || tile.key !== tileKey || tile.canvas.width !== tileSize * 2 || tile.canvas.height !== tileSize * 2) {
            const canvas = new OffscreenCanvas(tileSize * 2, tileSize * 2)
            const tileContext = canvas.getContext('2d')
            if (tileContext) {
              tileContext.fillStyle = `rgb(${checkerboard.lightColor.r} ${checkerboard.lightColor.g} ${checkerboard.lightColor.b})`
              tileContext.fillRect(0, 0, tileSize * 2, tileSize * 2)
              tileContext.fillStyle = `rgb(${checkerboard.darkColor.r} ${checkerboard.darkColor.g} ${checkerboard.darkColor.b})`
              tileContext.fillRect(tileSize, 0, tileSize, tileSize)
              tileContext.fillRect(0, tileSize, tileSize, tileSize)
            }
            tile = { key: tileKey, canvas }
            checkerboardTileRef.current = tile
          }
          pattern = context.createPattern(tile.canvas, 'repeat')
          pattern?.setTransform(new DOMMatrix([1, 0, 0, 1, copy.originX, copy.originY]))
        }
        if (pattern) {
          context.fillStyle = pattern
      context.fillRect(copy.originX, copy.originY, renderCanvasWidth, renderCanvasHeight)
        } else {
          const firstColumn = Math.max(0, Math.floor((viewport.left - copy.originX) / checkerCell))
          const firstRow = Math.max(0, Math.floor((viewport.top - copy.originY) / checkerCell))
          const lastColumn = Math.min(Math.ceil(document.width / checkerboard.size), Math.ceil((viewport.right - copy.originX) / checkerCell))
          const lastRow = Math.min(Math.ceil(document.height / checkerboard.size), Math.ceil((viewport.bottom - copy.originY) / checkerCell))
          context.fillStyle = `rgb(${checkerboard.darkColor.r} ${checkerboard.darkColor.g} ${checkerboard.darkColor.b})`
          for (let row = firstRow; row < lastRow; row += 1) {
            for (let column = firstColumn; column < lastColumn; column += 1) {
              if ((column + row) % 2 === 0) continue
              context.fillRect(copy.originX + column * checkerCell, copy.originY + row * checkerCell, checkerCell, checkerCell)
            }
          }
        }
      }
      context.restore()
    }
    for (const copy of repeatCopies) drawCheckerboard(copy)

    const drawGrid = (gridX: number, gridY: number, cellWidth: number, cellHeight: number, color: RgbaColor, copy = repeatCopies[0]): void => {
      if (!copy) return
      context.save()
      clipCanvasCopy(context, copy)
      context.globalCompositeOperation = 'source-over'
      context.globalAlpha = 1
      context.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a / 255})`
      const devicePixelX = 1 / deviceScale.x
      const devicePixelY = 1 / deviceScale.y
      const alignToDevicePixelX = (value: number): number => deviceAlignedCoordinate(value, deviceScale.x)
      const alignToDevicePixelY = (value: number): number => deviceAlignedCoordinate(value, deviceScale.y)
      const visibleLeft = alignToDevicePixelX(copy.originX + copy.fromX * view.zoom)
      const visibleTop = alignToDevicePixelY(copy.originY + copy.fromY * view.zoom)
      const visibleRight = alignToDevicePixelX(copy.originX + copy.toX * view.zoom)
      const visibleBottom = alignToDevicePixelY(copy.originY + copy.toY * view.zoom)
      for (const x of gridLinePositions(gridX, cellWidth, copy.fromX, copy.toX, view.zoom)) {
        const screenX = alignToDevicePixelX(copy.originX + x * view.zoom)
        context.fillRect(screenX, visibleTop, devicePixelX, Math.max(devicePixelY, visibleBottom - visibleTop + devicePixelY))
      }
      for (const y of gridLinePositions(gridY, cellHeight, copy.fromY, copy.toY, view.zoom)) {
        const screenY = alignToDevicePixelY(copy.originY + y * view.zoom)
        context.fillRect(visibleLeft, screenY, Math.max(devicePixelX, visibleRight - visibleLeft + devicePixelX), devicePixelY)
      }
      context.restore()
    }

    const drawIsoGuides = (copy: typeof repeatCopies[number]): void => {
      const spacing = isoGuideSpacingForZoom(view.zoom, isoViewPreferences.guideUnitSize)
      const segments = isoGuideSegments(document.width, document.height, {
        left: copy.fromX,
        top: copy.fromY,
        right: copy.toX,
        bottom: copy.toY
      }, {
        spacing,
        stairStep: isoViewPreferences.stairStep,
        origin: { x: isoViewPreferences.guideOriginX, y: isoViewPreferences.guideOriginY }
      })
      if (segments.length === 0) return
      const color = isoViewPreferences.guideColors[isoViewPreferences.guideLineStyle]
      context.save()
      clipCanvasCopy(context, copy)
      context.globalCompositeOperation = 'source-over'
      context.globalAlpha = color.a / 255
      if (isoViewPreferences.guideLineStyle === 'pixel' && view.zoom >= 1 && typeof context.createPattern === 'function') {
        const tileWidth = isoViewPreferences.stairStep * spacing
        const tileHeight = spacing
        const tileArea = tileWidth * tileHeight
        if (tileWidth <= 8192 && tileHeight <= 8192 && tileArea <= 4 * 1024 * 1024) {
          const tileKey = `${isoViewPreferences.stairStep}:${spacing}:${color.r},${color.g},${color.b}`
          let tile = isoGuideTileRef.current
          if (!tile || tile.key !== tileKey || tile.canvas.width !== tileWidth || tile.canvas.height !== tileHeight) {
            const patternGeometry = isoGuidePixelPattern(isoViewPreferences.stairStep, spacing)
            const canvas = new OffscreenCanvas(patternGeometry.width, patternGeometry.height)
            const tileContext = canvas.getContext('2d')
            if (tileContext) {
              tileContext.fillStyle = `rgb(${color.r} ${color.g} ${color.b})`
              for (const pixel of patternGeometry.pixels) tileContext.fillRect(pixel.x, pixel.y, 1, 1)
            }
            tile = { key: tileKey, canvas }
            isoGuideTileRef.current = tile
          }
          const pattern = context.createPattern(tile.canvas, 'repeat')
          pattern?.setTransform(new DOMMatrix([
            view.zoom, 0, 0, view.zoom,
            copy.originX + isoViewPreferences.guideOriginX * view.zoom,
            copy.originY + isoViewPreferences.guideOriginY * view.zoom
          ]))
          if (pattern) {
            context.imageSmoothingEnabled = false
            context.fillStyle = pattern
            context.fillRect(copy.originX, copy.originY, renderCanvasWidth, renderCanvasHeight)
            context.restore()
            return
          }
        }
      }
      context.strokeStyle = `rgb(${color.r} ${color.g} ${color.b})`
      context.lineWidth = isoViewPreferences.guideThickness
      context.setLineDash([])
      context.beginPath()
      for (const segment of segments) {
        context.moveTo(copy.originX + segment.start.x * view.zoom, copy.originY + segment.start.y * view.zoom)
        context.lineTo(copy.originX + segment.end.x * view.zoom, copy.originY + segment.end.y * view.zoom)
      }
      context.stroke()
      context.restore()
    }

    for (const copy of repeatCopies) {
      if (copy.toX <= copy.fromX || copy.toY <= copy.fromY) continue
      if (!isolatedLayerMask && !timelineHidden && onionSkin.enabled && !currentSession.animationPlaying) {
        const timeline = currentSession.document.animation
        if (timeline && timeline.frames.length > 1) {
          const refs = onionSkinFrameRefs(timeline, onionSkin.previousFrames, onionSkin.nextFrames)
          onionSkinCacheRef.current.draw({
            context,
            document: currentSession.document,
            refs,
            style: onionSkin,
            originX: copy.originX,
            originY: copy.originY,
            canvasWidth: renderCanvasWidth,
            canvasHeight: renderCanvasHeight,
            fromX: copy.fromX,
            fromY: copy.fromY,
            toX: copy.toX,
            toY: copy.toY,
            zoom: view.zoom,
            revision: currentSession.contentRevision,
            invalidation: onionSkinInvalidation,
            imageSmoothingEnabled: smoothPixelSampling,
            devicePixelRatio: deviceScale
          })
        }
      }
      compositeCacheRef.current.draw({
        context,
        document,
        view,
        originX: copy.originX,
        originY: copy.originY,
        canvasWidth: renderCanvasWidth,
        canvasHeight: renderCanvasHeight,
        fromX: copy.fromX,
        fromY: copy.fromY,
        toX: copy.toX,
        toY: copy.toY,
        revision: currentSession.revision,
        contentRevision: currentSession.contentRevision,
        contentInvalidation: currentSession.contentInvalidation,
        frameId: document.animation?.activeFrameId,
        isolatedLayerMask: isolatedLayerMask ?? undefined,
        imageSmoothingEnabled: smoothPixelSampling,
        devicePixelRatio: deviceScale,
        movingLayerIds: activeDrag?.kind === 'move-layer' && !activeDrag.duplicatedLayer && activeDrag.layerContentBounds
          ? activeDrag.animationCellKeys?.length
            ? [...new Set(activeDrag.animationCellKeys.map((key) => parseAnimationCelKey(key)?.layerId).filter((id): id is string => Boolean(id)))]
            : activeDrag.layerIds
          : undefined,
        selectionPreview: selectionPreviewOwner === 'active' && activeDrag?.selectionSource && activeDrag.previewTarget
          ? {
              layerId: currentActiveLayer.id,
              source: activeDrag.selectionSource,
              target: activeDrag.previewTarget,
              angle: activeDrag.previewAngle ?? 0,
              shear: activeDrag.previewShear,
              quad: activeDrag.previewQuad,
              copy: Boolean(activeDrag.copy)
            }
          : selectionPreviewOwner === 'pending' && currentSession.pendingPaste
            ? {
                layerId: currentSession.pendingPaste.layerId,
                source: currentSession.pendingPaste.source,
                target: currentSession.pendingPaste.transformTarget ?? currentSession.pendingPaste.target,
                angle: currentSession.pendingPaste.transformAngle ?? 0,
                shear: currentSession.pendingPaste.transformShear,
                quad: currentSession.pendingPaste.transformQuad,
                copy: currentSession.pendingPaste.copy
              }
            : undefined
      })
      const textPreview = textToolPreviewRef.current
      if (textPreview?.format === 'rgba') {
        const previewCanvas = new OffscreenCanvas(textPreview.width, textPreview.height)
        const previewContext = previewCanvas.getContext('2d')
        previewContext?.putImageData(new ImageData(textPreview.pixels.slice(), textPreview.width, textPreview.height), 0, 0)
        context.save()
        clipCanvasCopy(context, copy)
        context.imageSmoothingEnabled = false
        const textBoundary = deviceAlignedCanvasRect(
          copy.originX + textPreview.offsetX * view.zoom,
          copy.originY + textPreview.offsetY * view.zoom,
          textPreview.width * view.zoom,
          textPreview.height * view.zoom,
          deviceScale
        )
        context.drawImage(
          previewCanvas,
          textBoundary.left,
          textBoundary.top,
          textBoundary.width,
          textBoundary.height
        )
        context.restore()
      }
      let moveLayerFlash = moveLayerClickFlashEnabled ? moveLayerClickFlashRef.current : null
      if (moveLayerFlash && performance.now() >= moveLayerFlash.expiresAt) {
        moveLayerClickFlashRef.current = null
        moveLayerFlash = null
      }
      if (moveLayerFlash) {
        const layer = document.layers.find((candidate) => candidate.id === moveLayerFlash.layerId)
        if (layer) {
          const currentX = moveLayerFlash.bounds.x + layer.offsetX - moveLayerFlash.layerOffsetX
          const currentY = moveLayerFlash.bounds.y + layer.offsetY - moveLayerFlash.layerOffsetY
          const visibleX = Math.max(0, Math.floor(copy.fromX), currentX)
          const visibleY = Math.max(0, Math.floor(copy.fromY), currentY)
          const visibleRight = Math.min(document.width, Math.ceil(copy.toX), currentX + moveLayerFlash.bounds.width)
          const visibleBottom = Math.min(document.height, Math.ceil(copy.toY), currentY + moveLayerFlash.bounds.height)
          const visibleWidth = Math.max(0, visibleRight - visibleX)
          const visibleHeight = Math.max(0, visibleBottom - visibleY)
          if (visibleWidth > 0 && visibleHeight > 0) {
            const flashPixels = new Uint8ClampedArray(visibleWidth * visibleHeight * 4)
            for (let y = 0; y < visibleHeight; y += 1) {
              for (let x = 0; x < visibleWidth; x += 1) {
                const source = readLayerColorAt(document, layer, visibleX + x, visibleY + y)
                if (source.a === 0) continue
                const value = colorLuminance(source) > 145 ? 0 : 255
                const index = (y * visibleWidth + x) * 4
                flashPixels[index] = value
                flashPixels[index + 1] = value
                flashPixels[index + 2] = value
                flashPixels[index + 3] = source.a
              }
            }
            const flashCanvas = new OffscreenCanvas(visibleWidth, visibleHeight)
            flashCanvas.getContext('2d')?.putImageData(new ImageData(flashPixels, visibleWidth, visibleHeight), 0, 0)
            context.save()
            clipCanvasCopy(context, copy)
            context.globalCompositeOperation = 'source-over'
            context.imageSmoothingEnabled = false
            const flashBoundary = deviceAlignedCanvasRect(
              copy.originX + visibleX * view.zoom,
              copy.originY + visibleY * view.zoom,
              visibleWidth * view.zoom,
              visibleHeight * view.zoom,
              deviceScale
            )
            context.drawImage(
              flashCanvas,
              flashBoundary.left,
              flashBoundary.top,
              flashBoundary.width,
              flashBoundary.height
            )
            context.restore()
          }
        }
      }
      let freeTileFlash = freeTileInstanceFlashRef.current
      if (freeTileFlash && performance.now() >= freeTileFlash.expiresAt) {
        freeTileInstanceFlashRef.current = null
        freeTileFlash = null
      }
      if (freeTileFlash && currentActiveLayer.kind === 'free-tile') {
        const target = activeFreeTileCelTarget(document)
        const instance = target?.freeTiles.instances.find((candidate) => candidate.id === freeTileFlash!.instanceId) ?? null
        const source = target && instance ? freeTileSourceForInstance(target.sources, instance) : null
        const tileId = target && instance ? freeTileTileIdForInstance(target.sources, instance) : null
        const pixels = source && tileId ? readTilesetTilePixels(source.tileset, tileId) : null
        if (target && instance && source && pixels && source.visible) {
          const bounds = freeTileInstanceBounds(instance, target.sources, target.surface.offsetX, target.surface.offsetY)
          const visibleX = Math.max(0, Math.floor(copy.fromX), bounds.x)
          const visibleY = Math.max(0, Math.floor(copy.fromY), bounds.y)
          const visibleRight = Math.min(document.width, Math.ceil(copy.toX), bounds.x + bounds.width)
          const visibleBottom = Math.min(document.height, Math.ceil(copy.toY), bounds.y + bounds.height)
          const visibleWidth = Math.max(0, visibleRight - visibleX)
          const visibleHeight = Math.max(0, visibleBottom - visibleY)
          if (visibleWidth > 0 && visibleHeight > 0) {
            const flashPixels = new Uint8ClampedArray(visibleWidth * visibleHeight * 4)
            for (let y = 0; y < visibleHeight; y += 1) for (let x = 0; x < visibleWidth; x += 1) {
              const sourcePoint = freeTileSourcePointForInstance(instance, source, visibleX + x, visibleY + y, target.surface.offsetX, target.surface.offsetY)
              if (!sourcePoint) continue
              const sourceOffset = (sourcePoint.y * source.tileset.tileWidth + sourcePoint.x) * 4
              const alpha = pixels[sourceOffset + 3]
              if (alpha === 0) continue
              const sourceColor = { r: pixels[sourceOffset], g: pixels[sourceOffset + 1], b: pixels[sourceOffset + 2], a: alpha }
              const value = colorLuminance(sourceColor) > 145 ? 0 : 255
              const offset = (y * visibleWidth + x) * 4
              flashPixels[offset] = value
              flashPixels[offset + 1] = value
              flashPixels[offset + 2] = value
              flashPixels[offset + 3] = alpha
            }
            const flashCanvas = new OffscreenCanvas(visibleWidth, visibleHeight)
            flashCanvas.getContext('2d')?.putImageData(new ImageData(flashPixels, visibleWidth, visibleHeight), 0, 0)
            context.save()
            clipCanvasCopy(context, copy)
            context.globalCompositeOperation = 'source-over'
            context.imageSmoothingEnabled = false
            const flashBoundary = deviceAlignedCanvasRect(
              copy.originX + visibleX * view.zoom,
              copy.originY + visibleY * view.zoom,
              visibleWidth * view.zoom,
              visibleHeight * view.zoom,
              deviceScale
            )
            context.drawImage(flashCanvas, flashBoundary.left, flashBoundary.top, flashBoundary.width, flashBoundary.height)
            context.restore()
          }
        }
      }
      if (view.showPixelGrid && shouldRenderPixelGrid(view.zoom)) drawGrid(0, 0, 1, 1, gridColors.pixelGridColor, copy)
      if (view.isoViewEnabled) drawIsoGuides(copy)
    }

    if (inputRef.current.ctrlHeld && currentActiveLayer.kind === 'tilemap') {
      const target = activeTilemapCelTarget(document)
      if (target) {
        const tilesetsById = new Map((document.tilesets ?? []).map((tileset) => [tileset.id, tileset]))
        const cellScreenWidth = target.tilemap.tileWidth * view.zoom
        const cellScreenHeight = target.tilemap.tileHeight * view.zoom
        const badgeSize = Math.max(12, Math.min(24, Math.floor(Math.min(cellScreenWidth, cellScreenHeight) - 4)))
        const fontSize = Math.max(10, Math.min(14, badgeSize - 4))
        for (const copy of repeatCopies) {
          const fromColumn = Math.max(0, Math.floor((copy.fromX - target.surface.offsetX) / target.tilemap.tileWidth))
          const fromRow = Math.max(0, Math.floor((copy.fromY - target.surface.offsetY) / target.tilemap.tileHeight))
          const toColumn = Math.min(target.tilemap.columns, Math.ceil((copy.toX - target.surface.offsetX) / target.tilemap.tileWidth))
          const toRow = Math.min(target.tilemap.rows, Math.ceil((copy.toY - target.surface.offsetY) / target.tilemap.tileHeight))
          if (toColumn <= fromColumn || toRow <= fromRow) continue
          context.save()
          clipCanvasCopy(context, copy)
          context.textAlign = 'center'
          context.textBaseline = 'middle'
          context.font = `700 ${fontSize}px ui-monospace, Consolas, monospace`
          for (let row = fromRow; row < toRow; row += 1) for (let column = fromColumn; column < toColumn; column += 1) {
            const cellIndex = row * target.tilemap.columns + column
            const cell = target.tilemap.cells[cellIndex]
            if (!cell) continue
            const tileset = tilesetsById.get(cell.tilesetId)
            const tileIndex = tileset?.tileIds.indexOf(cell.tileId) ?? -1
            if (tileIndex < 0) continue
            const bounds = tilemapCellBounds(target.tilemap, target.surface.offsetX, target.surface.offsetY, cellIndex)
            const centerX = copy.originX + (bounds.x + bounds.width / 2) * view.zoom
            const centerY = copy.originY + (bounds.y + bounds.height / 2) * view.zoom
            const left = Math.round(centerX - badgeSize / 2)
            const top = Math.round(centerY - badgeSize / 2)
            context.fillStyle = '#0000ff'
            context.fillRect(left, top, badgeSize, badgeSize)
            context.fillStyle = '#fff'
            context.fillText(String(tileIndex), left + badgeSize / 2, top + badgeSize / 2 + 0.5)
          }
          context.restore()
        }
      }
    }

    const activeLayer = activePaintLayer(currentSession)
    const cachedPointSampler = compositePointSamplerRef.current
    const compositePointSampler = cachedPointSampler && cachedPointSampler.document === document && cachedPointSampler.revision === currentSession.contentRevision
      ? cachedPointSampler.sampler
      : createNormalCompositePointSampler(document) ?? createCompositePointSampler(document)
    if (compositePointSampler !== cachedPointSampler?.sampler) compositePointSamplerRef.current = { document, revision: currentSession.contentRevision, sampler: compositePointSampler }
    const cachedReplacementSampler = compositeReplacementSamplerRef.current
    const compositePointReplacementSampler = cachedReplacementSampler
      && cachedReplacementSampler.document === document
      && cachedReplacementSampler.revision === currentSession.revision
      && cachedReplacementSampler.layerId === activeLayer.id
      ? cachedReplacementSampler.sampler
      : createNormalCompositePointReplacementSampler(document, activeLayer.id) ?? createCompositePointReplacementSampler(document, activeLayer.id)
    if (compositePointReplacementSampler !== cachedReplacementSampler?.sampler) {
      compositeReplacementSamplerRef.current = { document, revision: currentSession.revision, layerId: activeLayer.id, sampler: compositePointReplacementSampler }
    }
    const sampleCompositeForPreview = (x: number, y: number): RgbaColor => {
      if (isolatedLayerMask) return readLayerMaskDisplayColorAt(isolatedLayerMask, x, y)
      return compositePointSampler(x, y)
    }
    const previewLayerColorAt = (pixelX: number, pixelY: number, erase = false, coverage = 255, paintColor = currentSession.primaryColor, baseColor?: RgbaColor, overwrite = false): RgbaColor => {
      const layerColor = baseColor ?? readLayerColorAt(document, currentActiveLayer, pixelX, pixelY)
      const replacement = erase
        ? coverage === 255 ? TRANSPARENT : { ...layerColor, a: Math.round(layerColor.a * (1 - coverage / 255)) }
        : overwrite
          ? { ...paintColor, a: Math.round(paintColor.a * coverage / 255) }
          : coverage < 255 || (paintColor.a > 0 && paintColor.a < 255)
            ? blendOver(layerColor, { ...paintColor, a: Math.round(paintColor.a * coverage / 255) })
            : paintColor
      return resolveLayerCanvasColor(document, currentActiveLayer, replacement)
    }
    const previewColorAt = (pixelX: number, pixelY: number, erase = false, coverage = 255, paintColor = currentSession.primaryColor, baseColor?: RgbaColor, overwrite = false): RgbaColor => {
      const resolvedReplacement = previewLayerColorAt(pixelX, pixelY, erase, coverage, paintColor, baseColor, overwrite)
      return isolatedLayerMask
        ? layerMaskDisplayColor(resolvedReplacement)
        : compositePointReplacementSampler(pixelX, pixelY, resolvedReplacement)
    }
    const previewPixelRect = (pixelX: number, pixelY: number): { x: number; y: number; width: number; height: number } =>
      deviceAlignedPixelRect(previewOriginX, previewOriginY, view.zoom, pixelX, pixelY, deviceScale)
    const previewPixelPlacements = (pixelX: number, pixelY: number) => tileRepeatPreviewPlacements(
      { x: pixelX, y: pixelY },
      document.width,
      document.height,
      view.tileRepeatMode ?? 'off',
      repeatCopies
    )
    const previewPixelRects = (pixelX: number, pixelY: number): Array<{ x: number; y: number; width: number; height: number }> =>
      previewPixelPlacements(pixelX, pixelY).map(({ point, copy }) => deviceAlignedPixelRect(copy.originX, copy.originY, view.zoom, point.x, point.y, deviceScale))
    const previewPointKey = (pixelX: number, pixelY: number): string | null => {
      const mapped = tileRepeatMappedPointForCopies({ x: pixelX, y: pixelY }, document.width, document.height, view.tileRepeatMode ?? 'off', true)
      return mapped ? `${mapped.local.x}:${mapped.local.y}` : null
    }
    const fillPreviewPixelRect = (pixelRect: { x: number; y: number; width: number; height: number }, sampleX: number, sampleY: number, color: RgbaColor): void => {
      const transparency = transparencyColorAt(sampleX, sampleY, checkerboard)
      const displayColor = view.relativeLuminance ? relativeLuminanceColor(color) : color
      context.fillStyle = `rgb(${transparency.r} ${transparency.g} ${transparency.b})`
      context.fillRect(pixelRect.x, pixelRect.y, pixelRect.width, pixelRect.height)
      if (displayColor.a > 0) {
        context.fillStyle = `rgb(${displayColor.r} ${displayColor.g} ${displayColor.b} / ${displayColor.a / 255})`
        context.fillRect(pixelRect.x, pixelRect.y, pixelRect.width, pixelRect.height)
      }
    }
    const drawPreviewPixel = (pixelX: number, pixelY: number, color: RgbaColor): Array<{ x: number; y: number; width: number; height: number }> => {
      const placements = previewPixelPlacements(pixelX, pixelY)
      const pixelRects = []
      for (const { point, copy } of placements) {
        const pixelRect = deviceAlignedPixelRect(copy.originX, copy.originY, view.zoom, point.x, point.y, deviceScale)
        fillPreviewPixelRect(pixelRect, point.x, point.y, color)
        pixelRects.push(pixelRect)
      }
      return pixelRects
    }
    const pendingTilesetTilePreview: { current: { tilesetId: string; tiles: ReadonlyMap<string, Uint8ClampedArray> } | null } = { current: null }
    const queueTilesetTilePreview = (tilesetId: string | undefined, tiles: ReadonlyMap<string, Uint8ClampedArray>): void => {
      if (!tilesetId || tiles.size === 0) return
      pendingTilesetTilePreview.current = { tilesetId, tiles }
    }
    const drawTilemapEditPreviewTiles = (previewTiles: ReadonlyMap<string, Uint8ClampedArray>): boolean => {
      const target = activeTilemapCelTarget(document)
      const tilesetId = target?.layer.tilemapTilesetId
      if (!target || !tilesetId || previewTiles.size === 0) return false
      for (const copy of repeatCopies) {
        const fromColumn = Math.max(0, Math.floor((copy.fromX - target.surface.offsetX) / target.tilemap.tileWidth))
        const fromRow = Math.max(0, Math.floor((copy.fromY - target.surface.offsetY) / target.tilemap.tileHeight))
        const toColumn = Math.min(target.tilemap.columns, Math.ceil((copy.toX - target.surface.offsetX) / target.tilemap.tileWidth))
        const toRow = Math.min(target.tilemap.rows, Math.ceil((copy.toY - target.surface.offsetY) / target.tilemap.tileHeight))
        if (toColumn <= fromColumn || toRow <= fromRow) continue
        context.save()
        clipCanvasCopy(context, copy)
        for (let row = fromRow; row < toRow; row += 1) for (let column = fromColumn; column < toColumn; column += 1) {
          const cell = target.tilemap.cells[row * target.tilemap.columns + column]
          const tilePixels = cell?.tilesetId === tilesetId ? previewTiles.get(cell.tileId) : undefined
          if (!cell || !tilePixels) continue
          const startX = target.surface.offsetX + column * target.tilemap.tileWidth
          const startY = target.surface.offsetY + row * target.tilemap.tileHeight
          for (let y = 0; y < target.tilemap.tileHeight; y += 1) for (let x = 0; x < target.tilemap.tileWidth; x += 1) {
            const source = tilemapSourcePointForCell(x, y, target.tilemap.tileWidth, target.tilemap.tileHeight, cell)
            const offset = (source.y * target.tilemap.tileWidth + source.x) * 4
            const pixelX = startX + x
            const pixelY = startY + y
            const replacement = resolveLayerCanvasColor(document, activeLayer, {
              r: tilePixels[offset],
              g: tilePixels[offset + 1],
              b: tilePixels[offset + 2],
              a: tilePixels[offset + 3]
            })
            const color = isolatedLayerMask
              ? layerMaskDisplayColor(replacement)
              : compositePointReplacementSampler(pixelX, pixelY, replacement)
            const pixelRect = deviceAlignedPixelRect(copy.originX, copy.originY, view.zoom, pixelX, pixelY, deviceScale)
            const transparency = transparencyColorAt(pixelX, pixelY, checkerboard)
            const displayColor = view.relativeLuminance ? relativeLuminanceColor(color) : color
            context.fillStyle = `rgb(${transparency.r} ${transparency.g} ${transparency.b})`
            context.fillRect(pixelRect.x, pixelRect.y, pixelRect.width, pixelRect.height)
            if (displayColor.a > 0) {
              context.fillStyle = `rgb(${displayColor.r} ${displayColor.g} ${displayColor.b} / ${displayColor.a / 255})`
              context.fillRect(pixelRect.x, pixelRect.y, pixelRect.width, pixelRect.height)
            }
          }
        }
        context.restore()
      }
      return true
    }
    const customSelectionPreviewColor = selectionPreviewColorMode === 'custom'
      ? `rgb(${selectionPreviewColor.r} ${selectionPreviewColor.g} ${selectionPreviewColor.b} / ${selectionPreviewColor.a / 255})`
      : undefined
    const drawSelectionPathPreview = (
      previewPixels: Iterable<string>,
      copies = [repeatCopies.find((copy) => copy.x === 0 && copy.y === 0) ?? repeatCopies[0]],
      repeatedCoordinates = false,
      previewColor?: string
    ): void => {
      const points: Point[] = []
      for (const value of previewPixels) {
        const separator = value.indexOf(':')
        points.push({ x: Number(value.slice(0, separator)), y: Number(value.slice(separator + 1)) })
      }
      drawSelectionPathPreviewPoints(points, copies, repeatedCoordinates, previewColor)
    }
    const drawSelectionPathPreviewPoints = (
      points: Iterable<Point>,
      copies = [repeatCopies.find((copy) => copy.x === 0 && copy.y === 0) ?? repeatCopies[0]],
      repeatedCoordinates = false,
      previewColor?: string
    ): void => {
      const pointList: readonly Point[] = Array.isArray(points) ? points : Array.from(points)
      const canBatch = typeof Path2D !== 'undefined' && pointList.length >= SELECTION_PATH_PREVIEW_BATCH_THRESHOLD
      for (const copy of copies) {
        if (!copy) continue
        context.save()
        if (!repeatedCoordinates) {
          clipCanvasCopy(context, copy)
        }
        if (!canBatch) {
          for (const { x, y } of pointList) {
            const pixelRect = deviceAlignedPixelRect(copy.originX, copy.originY, view.zoom, x, y, deviceScale)
            const mapped = repeatedCoordinates
              ? tileRepeatMappedPointForCopies({ x, y }, document.width, document.height, view.tileRepeatMode ?? 'off', true)
              : null
            const samplePoint = mapped?.local ?? { x, y }
            const insideDocument = repeatedCoordinates
              ? Boolean(mapped)
              : x >= 0 && y >= 0 && x < document.width && y < document.height
            if (!selectionPathPreviewPixelVisible(pixelRect, rect.width, rect.height, insideDocument)) continue
            const sampled = sampleCompositeForPreview(samplePoint.x, samplePoint.y)
            const background = sampled.a > 0 ? sampled : transparencyColorAt(samplePoint.x, samplePoint.y, checkerboard)
            context.fillStyle = previewColor ?? (colorLuminance(background) > 145 ? activeTheme.variables['--theme-selection-outline-dark'] : activeTheme.variables['--theme-selection-outline-light'])
            context.fillRect(pixelRect.x, pixelRect.y, pixelRect.width, pixelRect.height)
          }
        } else {
          const paths = new Map<string, Path2D>()
          for (const { x, y } of pointList) {
            const pixelRect = deviceAlignedPixelRect(copy.originX, copy.originY, view.zoom, x, y, deviceScale)
            const mapped = repeatedCoordinates
              ? tileRepeatMappedPointForCopies({ x, y }, document.width, document.height, view.tileRepeatMode ?? 'off', true)
              : null
            const samplePoint = mapped?.local ?? { x, y }
            const insideDocument = repeatedCoordinates
              ? Boolean(mapped)
              : x >= 0 && y >= 0 && x < document.width && y < document.height
            if (!selectionPathPreviewPixelVisible(pixelRect, rect.width, rect.height, insideDocument)) continue
            const sampled = sampleCompositeForPreview(samplePoint.x, samplePoint.y)
            const background = sampled.a > 0 ? sampled : transparencyColorAt(samplePoint.x, samplePoint.y, checkerboard)
            const color = previewColor ?? (colorLuminance(background) > 145 ? activeTheme.variables['--theme-selection-outline-dark'] : activeTheme.variables['--theme-selection-outline-light'])
            let path = paths.get(color)
            if (!path) {
              path = new Path2D()
              paths.set(color, path)
            }
            path.rect(pixelRect.x, pixelRect.y, pixelRect.width, pixelRect.height)
          }
          for (const [color, path] of paths) {
            context.fillStyle = color
            context.fill(path)
          }
        }
        context.restore()
      }
    }
    const polygonPreviewColorKey = (color: RgbaColor): string => `${color.r},${color.g},${color.b},${color.a}`
    const polygonPathPreviewVisualKey = (copy: typeof repeatCopies[number], previewColor?: string): string => [
      document.id,
      currentSession.contentRevision,
      currentSession.revision,
      currentActiveLayer.id,
      rect.width,
      rect.height,
      originX,
      originY,
      view.zoom,
      `${deviceScale.x}:${deviceScale.y}`,
      view.rotation,
      view.mirrored ? 1 : 0,
      view.mirroredVertical ? 1 : 0,
      copy.originX,
      copy.originY,
      view.tileRepeatMode ?? 'off',
      view.relativeLuminance ? 1 : 0,
      previewColor ?? 'auto',
      checkerboard.size,
      polygonPreviewColorKey(checkerboard.lightColor),
      polygonPreviewColorKey(checkerboard.darkColor),
      activeTheme.variables['--theme-selection-outline-dark'],
      activeTheme.variables['--theme-selection-outline-light']
    ].join('|')
    const drawCachedPolygonPath = (
      cache: PolygonPathPreviewRenderCache,
      copy: typeof repeatCopies[number]
    ): void => {
      context.save()
      clipCanvasCopy(context, copy)
      for (const [color, path] of cache.paths) {
        context.fillStyle = color
        context.fill(path)
      }
      context.restore()
    }
    const cachedPolygonPathFor = (
      rasterCache: NonNullable<DragState['polygonPathRasterCache']>,
      path: readonly Point[],
      balanced: boolean,
      copy: typeof repeatCopies[number],
      previewColor?: string
    ): PolygonPathPreviewRenderCache => {
      const visualKey = polygonPathPreviewVisualKey(copy, previewColor)
      const existing = polygonPathPreviewRenderCacheRef.current
      const appendPoints = (target: PolygonPathPreviewRenderCache, start: number): void => {
        for (let index = start; index < rasterCache.committedPoints.length; index += 1) {
          const point = rasterCache.committedPoints[index]
          const pixelRect = deviceAlignedPixelRect(copy.originX, copy.originY, view.zoom, point.x, point.y, deviceScale)
          const insideDocument = point.x >= 0 && point.y >= 0 && point.x < document.width && point.y < document.height
          if (!selectionPathPreviewPixelVisible(pixelRect, rect.width, rect.height, insideDocument)) continue
          const color = previewColor ?? (() => {
            const sampled = sampleCompositeForPreview(point.x, point.y)
            const background = sampled.a > 0 ? sampled : transparencyColorAt(point.x, point.y, checkerboard)
            return colorLuminance(background) > 145
              ? activeTheme.variables['--theme-selection-outline-dark']
              : activeTheme.variables['--theme-selection-outline-light']
          })()
          let screenPath = target.paths.get(color)
          if (!screenPath) {
            screenPath = new Path2D()
            target.paths.set(color, screenPath)
          }
          screenPath.rect(pixelRect.x, pixelRect.y, pixelRect.width, pixelRect.height)
        }
        target.committedPointCount = rasterCache.committedPoints.length
      }

      if (existing
        && existing.sourcePath === path
        && existing.balanced === balanced
        && existing.visualKey === visualKey
        && path.length === existing.sourcePathLength
        && rasterCache.committedPoints.length === existing.committedPointCount) return existing
      if (existing
        && existing.sourcePath === path
        && existing.balanced === balanced
        && existing.visualKey === visualKey
        && path.length === existing.sourcePathLength + 1
        && rasterCache.committedPoints.length >= existing.committedPointCount) {
        appendPoints(existing, existing.committedPointCount)
        existing.sourcePathLength = path.length
        return existing
      }

      const next: PolygonPathPreviewRenderCache = {
        sourcePath: path,
        sourcePathLength: path.length,
        balanced,
        visualKey,
        committedPointCount: 0,
        paths: new Map()
      }
      appendPoints(next, 0)
      polygonPathPreviewRenderCacheRef.current = next
      return next
    }
    const drawSelectionCursorCorners = (pixelX: number, pixelY: number, color: string): void => {
      const pixelRect = previewPixelRect(pixelX, pixelY)
      context.save()
      context.fillStyle = color
      for (const mark of selectionCursorCornerRects(pixelRect, deviceScale.x)) context.fillRect(mark.x, mark.y, mark.width, mark.height)
      context.restore()
    }
    const drawSelectionFillPreview = (selection: SelectionMask): void => {
      const left = Math.max(selection.x, fromX)
      const top = Math.max(selection.y, fromY)
      const right = Math.min(selection.x + selection.width, toX)
      const bottom = Math.min(selection.y + selection.height, toY)
      if (right <= left || bottom <= top) return
      context.save()
      clipBaseCanvas(context)
      for (let y = top; y < bottom; y += 1) for (let x = left; x < right; x += 1) {
        if (selectionContains(selection, x, y)) {
          const sampled = sampleCompositeForPreview(x, y)
          const background = sampled.a > 0 ? sampled : transparencyColorAt(x, y, checkerboard)
          context.fillStyle = colorLuminance(background) > 145 ? activeTheme.variables['--theme-selection-outline-dark'] : activeTheme.variables['--theme-selection-outline-light']
          const pixelRect = previewPixelRect(x, y)
          context.fillRect(pixelRect.x, pixelRect.y, pixelRect.width, pixelRect.height)
        }
      }
      context.restore()
    }
    const drawBrushPathPreview = (points: readonly Point[], color: RgbaColor, erase = false, baseline?: ReadonlyMap<number, number>, selection: SelectionMask | null = session.selection): void => {
      if (points.length === 0) return
      const { x: beforeX, y: beforeY } = brushStampAnchor(session.brushSize, activeBrushImage)
      const patternOrigin = brushPatternOrigin(points[0])
      const drawn = new Set<number>()
      const overwriteImageBrushPixels = !erase && activeBrushImage?.intrinsicSize === true && activeBrushPreviewMode === 'paint'
      const tilemapTarget = currentActiveLayer.kind === 'tilemap' && (currentSession.tilemapMode === 'edit' || currentSession.tilemapMode === 'hybrid') ? activeTilemapCelTarget(document) : null
      const tilemapTileset = tilemapTarget?.layer.tilemapTilesetId
        ? document.tilesets?.find((tileset) => tileset.id === tilemapTarget.layer.tilemapTilesetId)
        : null
      const originalTilePixels = new Map<string, Uint8ClampedArray>()
      const previewTilePixels = new Map<string, Uint8ClampedArray>()
      const centers = brushPathStampPoints(points, session.brushSize, activeBrushImage)
      if (overwriteImageBrushPixels) centers.reverse()
      for (const center of centers) {
        const x = center.x
        const y = center.y
        const mask = brushMaskOffsets(session.brushSize, session.brushShape, activeBrushTexture, session.brushTextureScale, x - beforeX, y - beforeY, activeBrushImage, session.brushImageSettings, proceduralAntialiasStrength, activeBrushPreviewMode, patternOrigin.x, patternOrigin.y, activeBrushDither)
        for (const offset of mask) {
          for (const target of symmetryPoints({ x: x - beforeX + offset.x, y: y - beforeY + offset.y }, document.width, document.height, session.symmetryAxes, symmetryCenter)) {
            const mapped = tileRepeatMappedPointForCopies(target, document.width, document.height, view.tileRepeatMode ?? 'off', true)
            if (!mapped) continue
            const { x: pixelX, y: pixelY } = mapped.local
            const index = pixelY * document.width + pixelX
            if (pixelX < 0 || pixelY < 0 || pixelX >= document.width || pixelY >= document.height || drawn.has(index) || (selection && !selectionContains(selection, pixelX, pixelY))) continue
            drawn.add(index)
            const layerIndex = baseline ? layerIndexAt(activeLayer, pixelX, pixelY) : null
            const packedBase = layerIndex === null ? undefined : baseline?.get(layerIndex)
            const baseColor = packedBase === undefined
              ? undefined
              : activeLayer.format === 'rgba'
                ? unpackColor(packedBase)
                : getPaletteEntry(document, packedBase).color
            if (tilemapTarget && tilemapTileset) {
              if (currentSession.tilemapMode === 'edit' && tilesetHasOnlyTransparentTile(tilemapTileset)) {
                drawPreviewPixel(pixelX, pixelY, previewColorAt(pixelX, pixelY, erase, offset.coverage, offset.color ?? color, baseColor, overwriteImageBrushPixels))
                continue
              }
              const cellIndex = tilemapCellIndexAtPoint(tilemapTarget.tilemap, tilemapTarget.surface.offsetX, tilemapTarget.surface.offsetY, pixelX, pixelY)
              const cell = cellIndex === null ? null : tilemapTarget.tilemap.cells[cellIndex]
              if (!cell || cell.tilesetId !== tilemapTileset.id) {
                if (currentSession.tilemapMode === 'hybrid') drawPreviewPixel(pixelX, pixelY, previewColorAt(pixelX, pixelY, erase, offset.coverage, offset.color ?? color, baseColor, overwriteImageBrushPixels))
                continue
              }
              let original = originalTilePixels.get(cell.tileId)
              if (!original) {
                original = readTilesetTilePixels(tilemapTileset, cell.tileId) ?? undefined
                if (!original) continue
                originalTilePixels.set(cell.tileId, original)
              }
              let preview = previewTilePixels.get(cell.tileId)
              if (!preview) {
                preview = new Uint8ClampedArray(original)
                previewTilePixels.set(cell.tileId, preview)
              }
              const bounds = tilemapCellBounds(tilemapTarget.tilemap, tilemapTarget.surface.offsetX, tilemapTarget.surface.offsetY, cellIndex!)
              const source = tilemapSourcePointForCell(pixelX - bounds.x, pixelY - bounds.y, bounds.width, bounds.height, cell)
              const sourceOffset = (source.y * bounds.width + source.x) * 4
              const originalColor = baseColor ?? {
                r: original[sourceOffset],
                g: original[sourceOffset + 1],
                b: original[sourceOffset + 2],
                a: original[sourceOffset + 3]
              }
              const replacement = previewLayerColorAt(pixelX, pixelY, erase, offset.coverage, offset.color ?? color, originalColor, overwriteImageBrushPixels)
              preview[sourceOffset] = replacement.r
              preview[sourceOffset + 1] = replacement.g
              preview[sourceOffset + 2] = replacement.b
              preview[sourceOffset + 3] = replacement.a
            } else drawPreviewPixel(pixelX, pixelY, previewColorAt(pixelX, pixelY, erase, offset.coverage, offset.color ?? color, baseColor, overwriteImageBrushPixels))
          }
        }
      }
      if (previewTilePixels.size > 0) {
        drawTilemapEditPreviewTiles(previewTilePixels)
        queueTilesetTilePreview(tilemapTileset?.id, previewTilePixels)
      }
    }
    const drawShapeContourPreview = (
      points: Iterable<Point>,
      color: RgbaColor,
      selection: SelectionMask | null
    ): void => {
      const drawn = new Set<number>()
      if (!hasSymmetry(session.symmetryAxes)) {
        for (const point of points) {
          if (selection && !selectionContains(selection, point.x, point.y)) continue
          const key = point.y * document.width + point.x
          if (drawn.has(key)) continue
          drawn.add(key)
          drawPreviewPixel(point.x, point.y, previewColorAt(point.x, point.y, false, 255, color))
        }
        return
      }
      for (const sourcePoint of points) {
        for (const point of symmetryPoints(sourcePoint, document.width, document.height, session.symmetryAxes, symmetryCenter)) {
          if (selection && !selectionContains(selection, point.x, point.y)) continue
          const key = point.y * document.width + point.x
          if (drawn.has(key)) continue
          drawn.add(key)
          drawPreviewPixel(point.x, point.y, previewColorAt(point.x, point.y, false, 255, color))
        }
      }
    }
    const drawStrokePreview = (from: Point, to: Point, erase = false, baseline?: ReadonlyMap<number, number>, selection: SelectionMask | null = session.selection): void => {
      const points = tileRepeatLinePoints(
        from,
        to,
        document.width,
        document.height,
        view.tileRepeatMode ?? 'off',
        balancedStraightLines ? 'balanced' : 'raster'
      )
      drawBrushPathPreview(points, session.primaryColor, erase, baseline, selection)
    }

    if (session.outlinePreview) {
      const outlineLayer = activePaintLayer(currentSession)
      const cachedOutline = outlinePreviewCacheRef.current
      const outlineSamples = cachedOutline && cachedOutline.revision === session.revision && cachedOutline.layerId === outlineLayer.id && cachedOutline.selection === session.selection && cachedOutline.preview === session.outlinePreview
        ? cachedOutline.samples
        : outlinePixelSamples(document, outlineLayer, session.selection, session.outlinePreview.thickness, session.outlinePreview.position, session.outlinePreview.directions, session.outlinePreview.kernel, session.outlinePreview.backgroundColor)
      if (outlineSamples !== cachedOutline?.samples) outlinePreviewCacheRef.current = { revision: session.revision, layerId: outlineLayer.id, selection: session.selection, preview: session.outlinePreview, samples: outlineSamples }
      for (const sample of outlineSamples) {
        const pixelX = sample.index % document.width
        const pixelY = Math.floor(sample.index / document.width)
        const base = readLayerColorAt(document, outlineLayer, pixelX, pixelY)
        const outlineColor = resolveOutlineStrokeColor(session.outlinePreview, sample.referenceColor)
        const color = outlineColor.a > 0 && outlineColor.a < 255
          ? blendOver(base, outlineColor)
          : outlineColor
        const resolvedColor = resolveLayerCanvasColor(document, outlineLayer, color)
        drawPreviewPixel(pixelX, pixelY, isolatedLayerMask ? layerMaskDisplayColor(resolvedColor) : compositePixelWithLayerColor(document, sample.index, outlineLayer.id, resolvedColor))
      }
    }

    const drag = inputRef.current.drag
    if (canRenderToolPreview && drag?.kind === 'shape') {
      const shape = drag.previewTarget ?? shapeBounds(drag.start, drag.last, drag.constrain, session.shapeRatio)
      const angle = drag.previewAngle ?? 0
      const selection = paintSelectionForDrag(drag)
      drawShapeContourPreview(
        shapeBoundaryPixelPoints(shape, session.shapeKind, document.width, document.height, angle, shapeCornerRadius),
        drag.color ?? session.primaryColor,
        selection
      )
    }
    if (canRenderToolPreview && drag && (drag.kind === 'freeform-shape' || drag.kind === 'polygon-shape')) {
      const color = drag.color ?? session.primaryColor
      const selection = paintSelectionForDrag(drag)
      const path = drag.path ?? []
      const polygonCache = drag.polygonPathRasterCache ??= createPolygonPathRasterCache()
      const points = polygonLassoPreviewPoints(
        path,
        drag.last,
        drag.kind === 'polygon-shape',
        drag.kind === 'polygon-shape' ? balancedShiftLineEnabled : false,
        polygonCache
      )
      drawShapeContourPreview(points, color, selection)
    }
    if (canRenderToolPreview && drag && (drag.kind === 'line-shape' || drag.kind === 'curve-shape')) {
      const rawPoints = drag.kind === 'line-shape'
        ? lineShapePixelPoints(drag.start, drag.last, balancedStraightLines)
        : bezierCurvePixelPoints(
            drag.start,
            drag.curveControls ?? curveDefaultControls(drag.start, drag.curveEnd ?? drag.last, drag.curveAnchorCount ?? session.curveAnchorCount),
            drag.curveEnd ?? drag.last
          )
      const points = session.perfectPixels ? perfectPixelPathPoints(rawPoints) : rawPoints
      drawBrushPathPreview(points, drag.color ?? session.primaryColor, false, undefined, paintSelectionForDrag(drag))
    }
    if (canRenderToolPreview && drag?.kind === 'gradient') {
      const moved = drag.start.x !== drag.last.x || drag.start.y !== drag.last.y
      if (moved) {
        const startColor = drag.color ?? session.primaryColor
        const endColor = drag.gradientEndColor ?? session.secondaryColor
        const activeGradientStops = drag.gradientStops ?? gradientStops
        const selection = paintSelectionForDrag(drag)
        const paintRegion = drag.gradientPaintRegion
        let previewFromX = Math.min(...repeatCopies.map((copy) => copy.fromX))
        let previewFromY = Math.min(...repeatCopies.map((copy) => copy.fromY))
        let previewToX = Math.max(...repeatCopies.map((copy) => copy.toX))
        let previewToY = Math.max(...repeatCopies.map((copy) => copy.toY))
        if (selection) {
          previewFromX = Math.max(previewFromX, selection.x)
          previewFromY = Math.max(previewFromY, selection.y)
          previewToX = Math.min(previewToX, selection.x + selection.width)
          previewToY = Math.min(previewToY, selection.y + selection.height)
        }
        if (paintRegion) {
          previewFromX = Math.max(previewFromX, paintRegion.x)
          previewFromY = Math.max(previewFromY, paintRegion.y)
          previewToX = Math.min(previewToX, paintRegion.x + paintRegion.width)
          previewToY = Math.min(previewToY, paintRegion.y + paintRegion.height)
        }
        if (previewToX > previewFromX && previewToY > previewFromY) {
          const sampleGradient = createGradientColorSampler(startColor, endColor, drag.start, drag.last, gradientDither, gradientType, gradientGeometryOptionsForDrag(drag), activeGradientStops)
          const sampleCompositeReplacement = compositePointReplacementSampler
          const firstPixelRect = previewPixelRect(previewFromX, previewFromY)
          const lastPixelRect = previewPixelRect(previewToX - 1, previewToY - 1)
          const targetX = firstPixelRect.x
          const targetY = firstPixelRect.y
          const targetWidth = lastPixelRect.x + lastPixelRect.width - targetX
          const targetHeight = lastPixelRect.y + lastPixelRect.height - targetY
          const nativeSourceWidth = Math.max(1, Math.round(targetWidth * deviceScale.x))
          const nativeSourceHeight = Math.max(1, Math.round(targetHeight * deviceScale.y))
          const visibleDocumentWidth = previewToX - previewFromX
          const visibleDocumentHeight = previewToY - previewFromY
          const sourceBasisWidth = view.zoom < 1 && gradientDither !== 'none' ? visibleDocumentWidth : nativeSourceWidth
          const sourceBasisHeight = view.zoom < 1 && gradientDither !== 'none' ? visibleDocumentHeight : nativeSourceHeight
          const previewSampleLimit = view.zoom < 1 && gradientDither !== 'none'
            ? DITHERED_GRADIENT_PREVIEW_SAMPLE_LIMIT
            : view.zoom < 1 ? SMOOTH_GRADIENT_PREVIEW_SAMPLE_LIMIT : Number.POSITIVE_INFINITY
          const previewScale = Math.min(1, Math.sqrt(previewSampleLimit / (sourceBasisWidth * sourceBasisHeight)))
          const sourceWidth = Math.max(1, Math.round(sourceBasisWidth * previewScale))
          const sourceHeight = Math.max(1, Math.round(sourceBasisHeight * previewScale))
          let surface = gradientPreviewSurfaceRef.current
          if (!surface || surface.width !== sourceWidth || surface.height !== sourceHeight) {
            const surfaceCanvas = new OffscreenCanvas(sourceWidth, sourceHeight)
            const surfaceContext = surfaceCanvas.getContext('2d')
            surface = null
            if (surfaceContext) {
              const pixels = new Uint8ClampedArray(sourceWidth * sourceHeight * 4)
              surface = {
                canvas: surfaceCanvas,
                context: surfaceContext,
                imageData: new ImageData(pixels as Uint8ClampedArray<ArrayBuffer>, sourceWidth, sourceHeight),
                pixels,
                width: sourceWidth,
                height: sourceHeight
              }
              gradientPreviewSurfaceRef.current = surface
            }
          }
          if (surface) {
            const pixels = surface.pixels
            pixels.fill(0)
            const writeSample = (sampleX: number, sampleY: number, alpha: number, left: number, top: number, right: number, bottom: number, sampledGradientColor?: RgbaColor): void => {
              if (alpha <= 0 || right <= left || bottom <= top) return
              const gradientColor = sampledGradientColor ?? sampleGradient(sampleX, sampleY)
              const layerColor = readLayerColorAt(document, activeLayer, sampleX, sampleY)
              const replacement = gradientColor.a > 0 && gradientColor.a < 255 ? blendOver(layerColor, gradientColor) : gradientColor
              const resolvedReplacement = resolveLayerCanvasColor(document, activeLayer, replacement)
              const previewColor = isolatedLayerMask ? layerMaskDisplayColor(resolvedReplacement) : sampleCompositeReplacement(sampleX, sampleY, resolvedReplacement)
              const displayColor = view.relativeLuminance ? relativeLuminanceColor(previewColor) : previewColor
              const transparency = transparencyColorAt(sampleX, sampleY, checkerboard)
              const composited = displayColor.a > 0
                ? blendOver({ r: transparency.r, g: transparency.g, b: transparency.b, a: 255 }, displayColor)
                : transparency
              for (let y = top; y < bottom; y += 1) for (let x = left; x < right; x += 1) {
                const offset = (y * sourceWidth + x) * 4
                pixels[offset] = composited.r
                pixels[offset + 1] = composited.g
                pixels[offset + 2] = composited.b
                pixels[offset + 3] = alpha
              }
            }
            const previewDocumentBlockAt = (deviceX: number, deviceY: number): { fromX: number; fromY: number; toX: number; toY: number; centerX: number; centerY: number } | null => {
              if (sourceWidth === visibleDocumentWidth && sourceHeight === visibleDocumentHeight) {
                const x = previewFromX + deviceX
                const y = previewFromY + deviceY
                return { fromX: x, fromY: y, toX: x + 1, toY: y + 1, centerX: x, centerY: y }
              }
              const documentLeft = (targetX + deviceX / sourceWidth * targetWidth - originX) / view.zoom
              const documentTop = (targetY + deviceY / sourceHeight * targetHeight - originY) / view.zoom
              const documentRight = (targetX + (deviceX + 1) / sourceWidth * targetWidth - originX) / view.zoom
              const documentBottom = (targetY + (deviceY + 1) / sourceHeight * targetHeight - originY) / view.zoom
              const blockFromX = Math.max(previewFromX, Math.floor(documentLeft + 1e-9))
              const blockFromY = Math.max(previewFromY, Math.floor(documentTop + 1e-9))
              const blockToX = Math.min(previewToX, Math.ceil(documentRight - 1e-9))
              const blockToY = Math.min(previewToY, Math.ceil(documentBottom - 1e-9))
              if (blockToX <= blockFromX || blockToY <= blockFromY) return null
              return {
                fromX: blockFromX,
                fromY: blockFromY,
                toX: blockToX,
                toY: blockToY,
                centerX: Math.min(blockToX - 1, blockFromX + Math.floor((blockToX - blockFromX) / 2)),
                centerY: Math.min(blockToY - 1, blockFromY + Math.floor((blockToY - blockFromY) / 2))
              }
            }
            const averagedDitherColor = (block: NonNullable<ReturnType<typeof previewDocumentBlockAt>>, allowed?: (x: number, y: number) => boolean): RgbaColor | undefined => {
              if (gradientDither === 'none') return undefined
              let count = 0
              let alpha = 0
              let red = 0
              let green = 0
              let blue = 0
              for (let y = block.fromY; y < block.toY; y += 1) for (let x = block.fromX; x < block.toX; x += 1) {
                if (allowed && !allowed(x, y)) continue
                const color = sampleGradient(x, y)
                count += 1
                alpha += color.a
                red += color.r * color.a
                green += color.g * color.a
                blue += color.b * color.a
              }
              if (count === 0) return undefined
              return {
                r: alpha > 0 ? Math.round(red / alpha) : 0,
                g: alpha > 0 ? Math.round(green / alpha) : 0,
                b: alpha > 0 ? Math.round(blue / alpha) : 0,
                a: Math.round(alpha / count)
              }
            }
            if (view.zoom >= 1) {
              for (let y = previewFromY; y < previewToY; y += 1) for (let x = previewFromX; x < previewToX; x += 1) {
                if (selection && !selectionContains(selection, x, y)) continue
                if (paintRegion && !selectionContains(paintRegion, x, y)) continue
                const pixelRect = previewPixelRect(x, y)
                const left = Math.max(0, Math.round((pixelRect.x - targetX) * deviceScale.x))
                const top = Math.max(0, Math.round((pixelRect.y - targetY) * deviceScale.y))
                const right = Math.min(sourceWidth, Math.round((pixelRect.x + pixelRect.width - targetX) * deviceScale.x))
                const bottom = Math.min(sourceHeight, Math.round((pixelRect.y + pixelRect.height - targetY) * deviceScale.y))
                writeSample(x, y, 255, left, top, right, bottom)
              }
            } else {
              const selectionMask = selection?.mask
              const paintMask = paintRegion?.mask
              if (!selectionMask && !paintMask) {
                for (let deviceY = 0; deviceY < sourceHeight; deviceY += 1) for (let deviceX = 0; deviceX < sourceWidth; deviceX += 1) {
                  const block = previewDocumentBlockAt(deviceX, deviceY)
                  if (!block) continue
                  writeSample(block.centerX, block.centerY, 255, deviceX, deviceY, deviceX + 1, deviceY + 1, averagedDitherColor(block))
                }
              } else {
                const maskedPointAllowed = (x: number, y: number): boolean =>
                  (!selectionMask || selectionMask[(y - selection!.y) * selection!.width + x - selection!.x] === 1)
                  && (!paintMask || paintMask[(y - paintRegion!.y) * paintRegion!.width + x - paintRegion!.x] === 1)
                let coverageCache = gradientPreviewCoverageCacheRef.current
                const cacheMatches = coverageCache
                  && coverageCache.selection === selection
                  && coverageCache.paintRegion === paintRegion
                  && coverageCache.previewFromX === previewFromX
                  && coverageCache.previewFromY === previewFromY
                  && coverageCache.previewToX === previewToX
                  && coverageCache.previewToY === previewToY
                  && coverageCache.targetX === targetX
                  && coverageCache.targetY === targetY
                  && coverageCache.targetWidth === targetWidth
                  && coverageCache.targetHeight === targetHeight
                  && coverageCache.sourceWidth === sourceWidth
                  && coverageCache.sourceHeight === sourceHeight
                  && coverageCache.zoom === view.zoom
                  && coverageCache.originX === originX
                  && coverageCache.originY === originY
                  && coverageCache.deviceScale.x === deviceScale.x
                  && coverageCache.deviceScale.y === deviceScale.y
                if (!cacheMatches) {
                  const coverage = new Uint8ClampedArray(sourceWidth * sourceHeight)
                  const sampleX = new Int32Array(sourceWidth * sourceHeight)
                  const sampleY = new Int32Array(sourceWidth * sourceHeight)
                  for (let deviceY = 0; deviceY < sourceHeight; deviceY += 1) for (let deviceX = 0; deviceX < sourceWidth; deviceX += 1) {
                    const block = previewDocumentBlockAt(deviceX, deviceY)
                    if (!block) continue
                    const total = (block.toX - block.fromX) * (block.toY - block.fromY)
                    let valid = 0
                    let firstValidX = -1
                    let firstValidY = -1
                    for (let y = block.fromY; y < block.toY; y += 1) for (let x = block.fromX; x < block.toX; x += 1) {
                      if (!maskedPointAllowed(x, y)) continue
                      valid += 1
                      if (firstValidX < 0) { firstValidX = x; firstValidY = y }
                    }
                    if (valid === 0) continue
                    const offset = deviceY * sourceWidth + deviceX
                    const centerValid = maskedPointAllowed(block.centerX, block.centerY)
                    coverage[offset] = Math.round(valid / total * 255)
                    sampleX[offset] = centerValid ? block.centerX : firstValidX
                    sampleY[offset] = centerValid ? block.centerY : firstValidY
                  }
                  coverageCache = {
                    selection,
                    paintRegion,
                    previewFromX,
                    previewFromY,
                    previewToX,
                    previewToY,
                    targetX,
                    targetY,
                    targetWidth,
                    targetHeight,
                    sourceWidth,
                    sourceHeight,
                    zoom: view.zoom,
                    originX,
                    originY,
                    deviceScale,
                    coverage,
                    sampleX,
                    sampleY
                  }
                  gradientPreviewCoverageCacheRef.current = coverageCache
                }
                if (coverageCache) {
                  for (let deviceY = 0; deviceY < sourceHeight; deviceY += 1) for (let deviceX = 0; deviceX < sourceWidth; deviceX += 1) {
                    const offset = deviceY * sourceWidth + deviceX
                    const alpha = coverageCache.coverage[offset]
                    if (alpha === 0) continue
                    const block = previewDocumentBlockAt(deviceX, deviceY)
                    if (!block) continue
                    writeSample(coverageCache.sampleX[offset], coverageCache.sampleY[offset], alpha, deviceX, deviceY, deviceX + 1, deviceY + 1, averagedDitherColor(block, maskedPointAllowed))
                  }
                }
              }
            }
            surface.context.putImageData(surface.imageData, 0, 0)
            for (const copy of repeatCopies) {
              context.save()
              clipCanvasCopy(context, copy)
              context.globalCompositeOperation = 'source-over'
              context.globalAlpha = 1
              context.imageSmoothingEnabled = smoothPixelSampling
              if (smoothPixelSampling) context.imageSmoothingQuality = 'high'
                const gradientBoundary = deviceAlignedCanvasRect(
                targetX + copy.originX - originX,
                targetY + copy.originY - originY,
                targetWidth,
                targetHeight,
                deviceScale
              )
              context.drawImage(
                surface.canvas,
                0,
                0,
                sourceWidth,
                sourceHeight,
                gradientBoundary.left,
                gradientBoundary.top,
                gradientBoundary.width,
                gradientBoundary.height
              )
              context.restore()
            }
          }
        }
      }
      for (const copy of repeatCopies) {
        context.save()
        clipCanvasCopy(context, copy)
        if (gradientLineVisible) {
          context.strokeStyle = `rgb(${gradientLineColor.r} ${gradientLineColor.g} ${gradientLineColor.b} / ${gradientLineColor.a / 255})`
          context.fillStyle = context.strokeStyle
          context.lineWidth = 1
          context.setLineDash([])
          const startX = copy.originX + (drag.start.x + 0.5) * view.zoom
          const startY = copy.originY + (drag.start.y + 0.5) * view.zoom
          const endX = copy.originX + (drag.last.x + 0.5) * view.zoom
          const endY = copy.originY + (drag.last.y + 0.5) * view.zoom
          context.beginPath()
          context.moveTo(startX, startY)
          context.lineTo(endX, endY)
          context.stroke()
          context.fillRect(startX - 2, startY - 2, 5, 5)
          context.fillRect(endX - 2, endY - 2, 5, 5)
        }
        context.restore()
      }
    }
    if ((currentActiveLayer.kind !== 'tilemap' || currentSession.tilemapMode !== 'paint') && (currentActiveLayer.kind !== 'free-tile' || currentSession.freeTileMode !== 'paint') && shiftLinePreviewEnabled && lineConnectionConfigured && canRenderToolPreview && !inputRef.current.spaceHeld && !inputRef.current.sampling && (session.tool === 'pencil' || session.tool === 'eraser') && inputRef.current.shiftLinePreview && inputRef.current.pointer.visible && lineAnchor) {
      const modifiers = { ctrlKey: inputRef.current.ctrlHeld, metaKey: false, altKey: inputRef.current.altHeld, shiftKey: inputRef.current.shiftHeld }
      const repeatedPointer = tileRepeatPointAt(inputRef.current.pointer.clientX, inputRef.current.pointer.clientY) ?? inputRef.current.pointer.point
      const repeatedAnchor = nearestTileRepeatEquivalent(lineAnchor, repeatedPointer, document.width, document.height, view.tileRepeatMode ?? 'off')
      const line = resolveStraightLine(repeatedAnchor, repeatedPointer, modifierActive(modifiers, 'constrainLineDirections'))
      const anchorHistory = lineAnchorHistoryRef.current
      const baseline = anchorHistory
        && anchorHistory.documentId === session.document.id
        && anchorHistory.layerId === activeLayer.id
        && anchorHistory.tool === session.tool
        && anchorHistory.point.x === lineAnchor.x
        && anchorHistory.point.y === lineAnchor.y
        && session.history.latestUndoEntry === anchorHistory.entry
        ? anchorHistory.baseline
        : undefined
      const tilemapEditSelection = tilemapEditSelectionAtPoint(inputRef.current.pointer.point, currentSession)
      if (tilemapEditSelection !== null) drawStrokePreview(
        line.from,
        line.to,
        session.tool === 'eraser',
        baseline,
        tilemapEditSelection === undefined ? session.selection : tilemapEditSelection
      )
    }

    if (hasSymmetry(session.symmetryAxes)) {
      context.save()
      clipBaseCanvas(context)
      context.strokeStyle = `rgb(${symmetryAxisPreferences.color.r} ${symmetryAxisPreferences.color.g} ${symmetryAxisPreferences.color.b})`
      context.globalAlpha = symmetryAxisPreferences.color.a / 255
      context.lineWidth = symmetryAxisPreferences.thickness
      context.setLineDash([])
      for (const axis of (['horizontal', 'vertical', 'diagonalUp', 'diagonalDown'] as SymmetryAxis[])) {
        if (!symmetryGuideAxisEnabled(session.symmetryAxes, axis)) continue
        const segment = symmetryAxisSegment(axis, document.width, document.height, symmetryCenter)
        if (!segment) continue
        context.beginPath()
        context.moveTo(originX + segment.start.x * view.zoom, originY + segment.start.y * view.zoom)
        context.lineTo(originX + segment.end.x * view.zoom, originY + segment.end.y * view.zoom)
        context.stroke()
      }
      const centerX = originX + symmetryCenter.x * view.zoom
      const centerY = originY + symmetryCenter.y * view.zoom
      const centerSize = Math.max(6, Math.min(12, view.zoom * 0.45))
      context.fillStyle = context.strokeStyle
      context.fillRect(centerX - centerSize / 2, centerY - centerSize / 2, centerSize, centerSize)
      context.restore()
    }

    if (canvasResizePreviewRef.current) {
      const preview = canvasResizePreviewRef.current
      const x = originX - preview.offsetX * view.zoom
      const y = originY - preview.offsetY * view.zoom
      const previewWidth = preview.width * view.zoom
      const previewHeight = preview.height * view.zoom
      const previewBoundary = deviceAlignedCanvasRect(x, y, previewWidth, previewHeight, deviceScale)
      const exposedRects = canvasResizePreviewExposedRects(
        { x: previewBoundary.left, y: previewBoundary.top, width: previewBoundary.width, height: previewBoundary.height },
        { x: baseCanvasBoundary.left, y: baseCanvasBoundary.top, width: baseCanvasBoundary.width, height: baseCanvasBoundary.height }
      )
      const clippedRects = canvasResizePreviewClippedRects(
        { x: previewBoundary.left, y: previewBoundary.top, width: previewBoundary.width, height: previewBoundary.height },
        { x: baseCanvasBoundary.left, y: baseCanvasBoundary.top, width: baseCanvasBoundary.width, height: baseCanvasBoundary.height }
      )
      drawCanvasResizePreviewLayers((layer) => {
        if (layer === 'checker') {
          if (exposedRects.length === 0) return
          context.save()
          context.beginPath()
          // The normal composite pass already rendered the old canvas. Only
          // paint the part that exists in the proposed canvas but not in the
          // old one, otherwise the preview checker would cover real pixels.
          for (const exposedRect of exposedRects) context.rect(exposedRect.x, exposedRect.y, exposedRect.width, exposedRect.height)
          context.clip()
          context.fillStyle = `rgb(${checkerboard.lightColor.r} ${checkerboard.lightColor.g} ${checkerboard.lightColor.b})`
          context.fillRect(previewBoundary.left, previewBoundary.top, previewBoundary.width, previewBoundary.height)
          const previewCheckerCell = checkerboard.size * view.zoom
          if (previewCheckerCell >= 2) {
            const firstColumn = Math.floor((Math.max(0, x) - originX) / previewCheckerCell)
            const firstRow = Math.floor((Math.max(0, y) - originY) / previewCheckerCell)
            const lastColumn = Math.ceil((Math.min(rect.width, x + previewWidth) - originX) / previewCheckerCell)
            const lastRow = Math.ceil((Math.min(rect.height, y + previewHeight) - originY) / previewCheckerCell)
            context.fillStyle = `rgb(${checkerboard.darkColor.r} ${checkerboard.darkColor.g} ${checkerboard.darkColor.b})`
            for (let row = firstRow; row < lastRow; row += 1) {
              for (let column = firstColumn; column < lastColumn; column += 1) {
                if ((column + row) % 2 === 0) continue
                context.fillRect(originX + column * previewCheckerCell, originY + row * previewCheckerCell, previewCheckerCell, previewCheckerCell)
              }
            }
          }
          context.restore()
          return
        }
        if (layer === 'content') {
          // Keep the committed composite untouched during the drag. The
          // checkerboard already covers only the newly exposed area; content
          // inside the old canvas was rendered by the normal cache pass above.
          return
        }
        if (layer === 'outside-mask') {
          if (exposedRects.length === 0 && clippedRects.length === 0) return
          context.save()
          context.fillStyle = activeTheme.variables['--theme-overlay']
          context.beginPath()
          for (const exposedRect of exposedRects) context.rect(exposedRect.x, exposedRect.y, exposedRect.width, exposedRect.height)
          for (const clippedRect of clippedRects) context.rect(clippedRect.x, clippedRect.y, clippedRect.width, clippedRect.height)
          context.clip()
          context.fillRect(previewBoundary.left, previewBoundary.top, previewBoundary.width, previewBoundary.height)
          for (const clippedRect of clippedRects) context.fillRect(clippedRect.x, clippedRect.y, clippedRect.width, clippedRect.height)
          context.restore()
          return
        }
        context.save()
        const resizeBoundaryColor = `rgb(${canvasResizeColor.r} ${canvasResizeColor.g} ${canvasResizeColor.b} / ${canvasResizeColor.a / 255})`
        context.strokeStyle = resizeBoundaryColor
        drawDeviceAlignedCanvasBorder(
          context,
          originX,
          originY,
          canvasWidth,
          canvasHeight,
          deviceScale,
          resizeBoundaryColor
        )
        context.lineWidth = 2
        context.setLineDash([])
        context.beginPath()
        context.moveTo(Math.round(x) + 0.5, 0)
        context.lineTo(Math.round(x) + 0.5, rect.height)
        context.moveTo(Math.round(x + previewWidth) + 0.5, 0)
        context.lineTo(Math.round(x + previewWidth) + 0.5, rect.height)
        context.moveTo(0, Math.round(y) + 0.5)
        context.lineTo(rect.width, Math.round(y) + 0.5)
        context.moveTo(0, Math.round(y + previewHeight) + 0.5)
        context.lineTo(rect.width, Math.round(y + previewHeight) + 0.5)
        context.stroke()
        context.restore()
      })
    }
    const selectionDrag = canvasGestureForPreview(inputRef.current.drag)
    if (selectionDrag?.kind === 'marquee' && (selectionDrag.moved || selectionDrag.quickSelectCell)) {
      const displaySelection = selectionDrag.marqueeDisplaySelection ?? selectionDrag.marqueePreviewSelection
      if (displaySelection) drawSelectionPathPreview(
        selectionPreviewPixels(displaySelection),
        repeatCopies,
        Boolean(selectionDrag.marqueeDisplaySelection && (view.tileRepeatMode ?? 'off') !== 'off' && !selectionDrag.quickSelectCell),
        customSelectionPreviewColor
      )
    }
    if ((selectionDrag?.kind === 'lasso' || selectionDrag?.kind === 'polygon-lasso') && (selectionDrag.path?.length ?? 0) > 0) {
      const path = selectionDrag.path ?? []
      const symmetric = hasSymmetry(session.symmetryAxes)
      if (selectionDrag.kind === 'polygon-lasso' && !symmetric) {
        const polygonCache = selectionDrag.polygonPathRasterCache ??= createPolygonPathRasterCache()
        const previewPoints = polygonLassoPreviewPoints(path, selectionDrag.last, lassoPreviewClosed, balancedShiftLineEnabled, polygonCache)
        const baseCopy = repeatCopies.find((copy) => copy.x === 0 && copy.y === 0) ?? repeatCopies[0]
        if (baseCopy && typeof Path2D !== 'undefined') {
          const committedPointCount = polygonCache.committedPoints.length
          drawCachedPolygonPath(cachedPolygonPathFor(polygonCache, path, balancedShiftLineEnabled, baseCopy), baseCopy)
          if (previewPoints.length > committedPointCount) drawSelectionPathPreviewPoints(
            previewPoints.slice(committedPointCount),
            [baseCopy]
          )
        } else drawSelectionPathPreviewPoints(previewPoints)
      } else {
        const previewPixels = new Map<string, Point>()
        const addLine = (from: Point, to: Point): void => {
          for (const sourcePoint of rasterLinePoints(from, to)) for (const point of symmetryPoints(sourcePoint, document.width, document.height, session.symmetryAxes, symmetryCenter)) previewPixels.set(`${point.x}:${point.y}`, point)
        }
        if (selectionDrag.kind === 'polygon-lasso') {
          const polygonCache = selectionDrag.polygonPathRasterCache ??= createPolygonPathRasterCache()
          for (const sourcePoint of polygonLassoPreviewPoints(path, selectionDrag.last, lassoPreviewClosed, balancedShiftLineEnabled, polygonCache)) for (const point of symmetryPoints(sourcePoint, document.width, document.height, session.symmetryAxes, symmetryCenter)) previewPixels.set(`${point.x}:${point.y}`, point)
        } else {
          for (let index = 1; index < path.length; index += 1) addLine(path[index - 1], path[index])
          if (lassoPreviewClosed && path.length > 1) addLine(path.at(-1)!, path[0])
        }
        drawSelectionPathPreviewPoints(previewPixels.values())
      }
      const mode = selectionDrag.selectionMode ?? session.selectionMode
      const point = inputRef.current.pointer.point
      if (mode !== 'replace' && point.x >= 0 && point.y >= 0 && point.x < document.width && point.y < document.height) {
        const pixelRect = previewPixelRect(point.x, point.y)
        const sampled = sampleCompositeForPreview(point.x, point.y)
        const background = sampled.a > 0 ? sampled : transparencyColorAt(point.x, point.y, checkerboard)
        context.save()
        context.strokeStyle = colorLuminance(background) > 145 ? activeTheme.variables['--theme-selection-outline-dark'] : activeTheme.variables['--theme-selection-outline-light']
        context.lineWidth = 1
        context.strokeRect(pixelRect.x + 0.5, pixelRect.y + 0.5, Math.max(0, pixelRect.width - 1), Math.max(0, pixelRect.height - 1))
        context.restore()
      }
    }
    if (inputRef.current.drag?.kind === 'magic-preview' && inputRef.current.drag.previewSelection) {
      drawSelectionFillPreview(inputRef.current.drag.previewSelection)
      drawSelectionPathPreview(selectionPreviewPixels(inputRef.current.drag.previewSelection))
    }

    const activeSelectionCreation = selectionDrag?.kind === 'marquee' || selectionDrag?.kind === 'lasso' || selectionDrag?.kind === 'polygon-lasso'
    if (canRenderToolPreview && (!inputRef.current.drag || activeSelectionCreation) && (!inputRef.current.spaceHeld || selectionDrag?.kind === 'marquee') && !inputRef.current.sampling && inputRef.current.pointer.visible && session.tool === 'selection') {
      const pointerLocation = repeatedDocumentPointsAt(inputRef.current.pointer.clientX, inputRef.current.pointer.clientY, false, true)
      const point = pointerLocation?.local ?? inputRef.current.pointer.point
      const displayedPoint = pointerLocation?.repeated ?? point
      const selectionHit = session.selection ? selectionHitAt(inputRef.current.pointer.clientX, inputRef.current.pointer.clientY) : 'outside'
      const combinationMode = session.selectionMode !== 'replace'
      const transformInteraction = selectionHit !== 'inside' && selectionHit !== 'outside'
      const addModeInteraction = !inputRef.current.shiftHeld && session.selectionMode === 'add' && selectionHit !== 'outside'
      const creatingSelection = activeSelectionCreation || inputRef.current.shiftHeld || combinationMode || (selectionHit === 'outside' && (!session.selection || !selectionContains(session.selection, point.x, point.y)))
      if (!transformInteraction && !addModeInteraction && creatingSelection) {
        const insideDocument = point.x >= 0 && point.y >= 0 && point.x < document.width && point.y < document.height
        const sampled = insideDocument ? sampleCompositeForPreview(point.x, point.y) : { r: 74, g: 74, b: 81, a: 255 }
        const background = sampled.a > 0 ? sampled : transparencyColorAt(point.x, point.y, checkerboard)
        drawSelectionCursorCorners(displayedPoint.x, displayedPoint.y, colorLuminance(background) > 145 ? activeTheme.variables['--theme-selection-outline-dark'] : activeTheme.variables['--theme-selection-outline-light'])
      }
    }

    const activeSliceCreation = inputRef.current.drag?.kind === 'create-slice'
    if (sliceTool && (!inputRef.current.drag || activeSliceCreation) && !inputRef.current.spaceHeld && !inputRef.current.sampling && inputRef.current.pointer.visible) {
      const pointer = inputRef.current.pointer
      const point = pointer.point
      const selectedIds = currentSession.selectedSliceIds?.length ? currentSession.selectedSliceIds : currentSession.selectedSliceId ? [currentSession.selectedSliceId] : []
      const selectedSlice = selectedIds.length === 1 ? currentSession.document.slices?.find((slice) => slice.id === selectedIds[0]) ?? null : null
      const handle = selectedSlice ? sliceHandleAt(pointer.clientX, pointer.clientY, selectedSlice) : null
      const hit = sliceAtPoint(currentSession.document.slices ?? [], point.x, point.y)
      const insideDocument = point.x >= 0 && point.y >= 0 && point.x < document.width && point.y < document.height
      if (insideDocument && !handle && !hit) {
        const sampled = sampleCompositeForPreview(point.x, point.y)
        const background = sampled.a > 0 ? sampled : transparencyColorAt(point.x, point.y, checkerboard)
        drawSelectionCursorCorners(point.x, point.y, colorLuminance(background) > 145 ? activeTheme.variables['--theme-selection-outline-dark'] : activeTheme.variables['--theme-selection-outline-light'])
      }
    }

    if (canRenderToolPreview && !inputRef.current.spaceHeld && inputRef.current.pointer.visible && !inputRef.current.sampling && session.tool === 'fill' && fillKind === 'bucket') {
      const point = inputRef.current.pointer.point
      const tilemapEditSelection = tilemapEditSelectionAtPoint(point, currentSession)
      const previewSelection = tilemapEditSelection === undefined ? session.selection : tilemapEditSelection
      if (tilemapEditSelection !== null && point.x >= 0 && point.y >= 0 && point.x < document.width && point.y < document.height && (!previewSelection || selectionContains(previewSelection, point.x, point.y))) {
        for (const target of symmetryPoints(point, document.width, document.height, session.symmetryAxes, symmetryCenter)) drawPreviewPixel(target.x, target.y, previewColorAt(target.x, target.y))
      }
    }

    if (canRenderToolPreview && !inputRef.current.spaceHeld && inputRef.current.pointer.visible && !inputRef.current.sampling && (session.tool === 'shape' || session.tool === 'line') && !drag) {
      const point = inputRef.current.pointer.point
      const layer = activePaintLayer(currentSession)
      const tilemapEditSelection = tilemapEditSelectionAtPoint(point, currentSession)
      const previewSelection = tilemapEditSelection === undefined ? session.selection : tilemapEditSelection
      if (tilemapEditSelection !== null && point.x >= 0 && point.y >= 0 && point.x < document.width && point.y < document.height && !isLayerEffectivelyLocked(document, layer) && (!previewSelection || selectionContains(previewSelection, point.x, point.y))) {
        for (const target of symmetryPoints(point, document.width, document.height, session.symmetryAxes, symmetryCenter)) drawPreviewPixel(target.x, target.y, previewColorAt(target.x, target.y))
      }
    }

    const tilemapFloatingPreview = drag?.previewEdit
      ?? (drag?.translationPreview ? selectionTranslationPreviewEdit(document, drag.translationPreview) : null)
      ?? currentSession.pendingPaste?.previewEdit
      ?? (currentSession.pendingPaste?.translationPreview ? selectionTranslationPreviewEdit(document, currentSession.pendingPaste.translationPreview) : null)
    const tilemapPreviewEdit = drag?.edit ?? tilemapFloatingPreview
    const tilemapPreviewCellIndex = drag?.tilemapEditCellIndex ?? currentSession.pendingPaste?.tilemapEditCellIndex
    const hybridSelectionVariantPreview = currentSession.tilemapMode === 'hybrid'
      && (drag?.selectionSource?.origin === 'selection' || currentSession.pendingPaste?.source.origin === 'selection')
    if (currentActiveLayer.kind === 'tilemap' && (currentSession.tilemapMode === 'edit' || currentSession.tilemapMode === 'hybrid') && !tilemapEditCreatesFirstTile(currentSession) && !hybridSelectionVariantPreview && tilemapPreviewEdit) {
      const previewTiles = tilemapEditPreviewTilePixels(document, tilemapPreviewEdit, tilemapPreviewCellIndex)
      drawTilemapEditPreviewTiles(previewTiles)
      queueTilesetTilePreview(currentActiveLayer.tilemapTilesetId, previewTiles)
    }
    const nextTilesetPreview = pendingTilesetTilePreview.current
    if (nextTilesetPreview) {
      const previousTilesetId = publishedTilesetPreviewRef.current
      if (previousTilesetId && previousTilesetId !== nextTilesetPreview.tilesetId) clearTilesetTilePreview(document.id, previousTilesetId)
      publishTilesetTilePreview({ documentId: document.id, ...nextTilesetPreview })
      publishedTilesetPreviewRef.current = nextTilesetPreview.tilesetId
    } else if (publishedTilesetPreviewRef.current) {
      clearTilesetTilePreview(document.id, publishedTilesetPreviewRef.current)
      publishedTilesetPreviewRef.current = null
    }

    if (currentActiveLayer.kind === 'tilemap' && currentSession.tilemapMode === 'paint' && brushPreviewMode !== 'none' && canRenderToolPreview && !inputRef.current.spaceHeld && inputRef.current.pointer.visible && !inputRef.current.sampling && (!drag || (drag.kind === 'tile-draw' && drawingBrushPreviewEnabled)) && (session.tool === 'pencil' || session.tool === 'eraser')) {
      const target = activeTilemapCelTarget(document)
      const pointerLocation = repeatedDocumentPointsAt(inputRef.current.pointer.clientX, inputRef.current.pointer.clientY)
      const point = pointerLocation?.local ?? inputRef.current.pointer.point
      const index = target ? tilemapCellIndexAtPoint(target.tilemap, target.surface.offsetX, target.surface.offsetY, point.x, point.y) : null
      if (target && index !== null && tilemapCellAllowedBySelection(target, index, currentSession.selection)) {
        const bounds = tilemapCellBounds(target.tilemap, target.surface.offsetX, target.surface.offsetY, index)
        const selectedTileset = document.tilesets?.find((tileset) => tileset.id === currentSession.selectedTilesetId
          && tileset.tileWidth === target.tilemap.tileWidth
          && tileset.tileHeight === target.tilemap.tileHeight)
        const selectedTileId = selectedTileset?.tileIds.includes(currentSession.selectedTileId ?? '') ? currentSession.selectedTileId : null
        const previewCell: TilemapCell | null = drag?.kind === 'tile-draw'
          ? drag.tilemapCell ?? null
          : session.tool === 'eraser'
            ? null
            : selectedTileset && selectedTileId
              ? { tilesetId: selectedTileset.id, tileId: selectedTileId }
              : null
        const previewTileset = previewCell ? document.tilesets?.find((tileset) => tileset.id === previewCell.tilesetId) : null
        const previewPixels = previewCell && previewTileset
          && previewTileset.tileWidth === target.tilemap.tileWidth
          && previewTileset.tileHeight === target.tilemap.tileHeight
          ? readTilesetTilePixels(previewTileset, previewCell.tileId)
          : null
        const drawing = drag?.kind === 'tile-draw'
        const drawFullPreview = !drawing && (brushPreviewMode === 'full' || brushPreviewMode === 'full-edge')
        const drawPreviewOutline = brushPreviewMode === 'edge' || brushPreviewMode === 'full-edge' || (session.tool === 'eraser' && brushPreviewMode === 'full')
        if (session.tool === 'eraser' || previewPixels) {
          for (const copy of repeatCopies) {
            if (bounds.x + bounds.width <= copy.fromX || bounds.y + bounds.height <= copy.fromY || bounds.x >= copy.toX || bounds.y >= copy.toY) continue
            context.save()
            clipCanvasCopy(context, copy)
            if (drawFullPreview) {
              for (let y = 0; y < bounds.height; y += 1) for (let x = 0; x < bounds.width; x += 1) {
                const pixelX = bounds.x + x
                const pixelY = bounds.y + y
                if (pixelX < 0 || pixelY < 0 || pixelX >= document.width || pixelY >= document.height) continue
                const source = previewCell ? tilemapSourcePointForCell(x, y, bounds.width, bounds.height, previewCell) : { x, y }
                const offset = (source.y * bounds.width + source.x) * 4
                const replacement = resolveLayerCanvasColor(document, activeLayer, previewPixels ? {
                  r: previewPixels[offset],
                  g: previewPixels[offset + 1],
                  b: previewPixels[offset + 2],
                  a: previewPixels[offset + 3]
                } : TRANSPARENT)
                const color = isolatedLayerMask
                  ? layerMaskDisplayColor(replacement)
                  : compositePointReplacementSampler(pixelX, pixelY, replacement)
                const pixelRect = deviceAlignedPixelRect(copy.originX, copy.originY, view.zoom, pixelX, pixelY, deviceScale)
                const transparency = transparencyColorAt(pixelX, pixelY, checkerboard)
                const displayColor = view.relativeLuminance ? relativeLuminanceColor(color) : color
                context.fillStyle = `rgb(${transparency.r} ${transparency.g} ${transparency.b})`
                context.fillRect(pixelRect.x, pixelRect.y, pixelRect.width, pixelRect.height)
                if (displayColor.a > 0) {
                  context.fillStyle = `rgb(${displayColor.r} ${displayColor.g} ${displayColor.b} / ${displayColor.a / 255})`
                  context.fillRect(pixelRect.x, pixelRect.y, pixelRect.width, pixelRect.height)
                }
              }
            }
            if (drawPreviewOutline) {
              const sampled = sampleCompositeForPreview(point.x, point.y)
              context.strokeStyle = colorLuminance(sampled) > 145 ? activeTheme.variables['--theme-selection-outline-dark'] : activeTheme.variables['--theme-selection-outline-light']
              context.lineWidth = Math.max(1, Math.min(2, view.zoom / 4))
              context.strokeRect(
                copy.originX + bounds.x * view.zoom,
                copy.originY + bounds.y * view.zoom,
                bounds.width * view.zoom,
                bounds.height * view.zoom
              )
            }
            context.restore()
          }
        }
      }
    }

    if (currentActiveLayer.kind === 'free-tile' && currentSession.freeTileMode === 'paint' && brushPreviewMode !== 'none' && canRenderToolPreview && !inputRef.current.spaceHeld && inputRef.current.pointer.visible && !inputRef.current.sampling && (!drag || (drag.kind === 'free-tile-draw' && drawingBrushPreviewEnabled)) && (session.tool === 'pencil' || session.tool === 'eraser')) {
      const target = activeFreeTileCelTarget(document)
      const pointerLocation = repeatedDocumentPointsAt(inputRef.current.pointer.clientX, inputRef.current.pointer.clientY)
      const point = pointerLocation?.local ?? inputRef.current.pointer.point
      if (target && (!currentSession.selection || selectionContains(currentSession.selection, point.x, point.y))) {
        const drawing = drag?.kind === 'free-tile-draw'
        const erasing = session.tool === 'eraser'
        const instance = erasing ? freeTileInstanceAtDocumentPoint(target, point.x, point.y) : null
        const source = instance
          ? freeTileSourceForInstance(target.sources, instance)
          : freeTileSourceForId(document, target.layer, drawing ? drag.freeTileSourceId : currentSession.selectedTilesetId)
        const tileId = source?.tileset.tileIds[0] ?? null
        const origin = instance
          ? { x: instance.x, y: instance.y }
          : source ? freeTileSourceStampOrigin(point.x, point.y, source, target.surface.offsetX, target.surface.offsetY) : { x: 0, y: 0 }
        const bounds = instance
          ? freeTileInstanceBounds(instance, target.sources, target.surface.offsetX, target.surface.offsetY)
          : source ? { x: target.surface.offsetX + origin.x + source.offsetX, y: target.surface.offsetY + origin.y + source.offsetY, width: source.tileset.tileWidth, height: source.tileset.tileHeight } : { x: 0, y: 0, width: 0, height: 0 }
        const previewPixels = !erasing && source && tileId
          ? readTilesetTilePixels(source.tileset, tileId)
          : null
        const hasVisiblePixels = Boolean(previewPixels?.some((value, index) => index % 4 === 3 && value > 0))
        const drawFullPreview = !drawing && Boolean(previewPixels) && (brushPreviewMode === 'full' || brushPreviewMode === 'full-edge')
        const drawPreviewOutline = erasing || !hasVisiblePixels || brushPreviewMode === 'edge' || brushPreviewMode === 'full-edge'
        if (erasing ? instance : previewPixels) {
          for (const copy of repeatCopies) {
            if (bounds.x + bounds.width <= copy.fromX || bounds.y + bounds.height <= copy.fromY || bounds.x >= copy.toX || bounds.y >= copy.toY) continue
            context.save()
            clipCanvasCopy(context, copy)
            if (drawFullPreview && previewPixels) {
              for (let y = 0; y < bounds.height; y += 1) for (let x = 0; x < bounds.width; x += 1) {
                const pixelX = bounds.x + x
                const pixelY = bounds.y + y
                if (pixelX < 0 || pixelY < 0 || pixelX >= document.width || pixelY >= document.height) continue
                const offset = (y * bounds.width + x) * 4
                const replacement = resolveLayerCanvasColor(document, currentActiveLayer, {
                  r: previewPixels[offset],
                  g: previewPixels[offset + 1],
                  b: previewPixels[offset + 2],
                  a: previewPixels[offset + 3]
                })
                if (replacement.a === 0) continue
                const currentLayerColor = readLayerColorAt(document, currentActiveLayer, pixelX, pixelY)
                const placedLayerColor = blendOver(currentLayerColor, replacement)
                const color = isolatedLayerMask
                  ? layerMaskDisplayColor(placedLayerColor)
                  : compositePointReplacementSampler(pixelX, pixelY, placedLayerColor)
                const pixelRect = deviceAlignedPixelRect(copy.originX, copy.originY, view.zoom, pixelX, pixelY, deviceScale)
                const transparency = transparencyColorAt(pixelX, pixelY, checkerboard)
                const displayColor = view.relativeLuminance ? relativeLuminanceColor(color) : color
                context.fillStyle = `rgb(${transparency.r} ${transparency.g} ${transparency.b})`
                context.fillRect(pixelRect.x, pixelRect.y, pixelRect.width, pixelRect.height)
                if (displayColor.a > 0) {
                  context.fillStyle = `rgb(${displayColor.r} ${displayColor.g} ${displayColor.b} / ${displayColor.a / 255})`
                  context.fillRect(pixelRect.x, pixelRect.y, pixelRect.width, pixelRect.height)
                }
              }
            }
            if (drawPreviewOutline) {
              const sampled = sampleCompositeForPreview(point.x, point.y)
              context.strokeStyle = colorLuminance(sampled) > 145 ? activeTheme.variables['--theme-selection-outline-dark'] : activeTheme.variables['--theme-selection-outline-light']
              context.lineWidth = Math.max(1, Math.min(2, view.zoom / 4))
              context.strokeRect(
                copy.originX + bounds.x * view.zoom,
                copy.originY + bounds.y * view.zoom,
                bounds.width * view.zoom,
                bounds.height * view.zoom
              )
            }
            context.restore()
          }
        }
      }
    }

    if ((currentActiveLayer.kind !== 'tilemap' || currentSession.tilemapMode !== 'paint') && (currentActiveLayer.kind !== 'free-tile' || currentSession.freeTileMode !== 'paint') && brushPreviewMode !== 'none' && canRenderToolPreview && !inputRef.current.spaceHeld && inputRef.current.pointer.visible && (activeDrag?.kind === 'draw' || pointerOverCanvas) && !inputRef.current.sampling && (!drag || (drag.kind === 'draw' && drawingBrushPreviewEnabled)) && (currentSession.tool === 'pencil' || currentSession.tool === 'eraser')) {
      const pointerLocation = repeatedDocumentPointsAt(inputRef.current.pointer.clientX, inputRef.current.pointer.clientY)
      const point = pointerLocation?.local ?? inputRef.current.pointer.point
      const drawing = drag?.kind === 'draw'
      const tilemapEditSelection = drawing ? undefined : tilemapEditSelectionAtPoint(point, currentSession)
      const previewAllowed = drawing || tilemapEditSelection !== null
      const previewSelection = drawing && drag
        ? paintSelectionForDrag(drag)
        : tilemapEditSelection === undefined ? currentSession.selection : tilemapEditSelection
      const currentBrushInputs = activeBrushInputsForTool(currentSession.tool, currentSession.fillKind ?? 'bucket', currentSession.brushImage, currentSession.brushTexture)
      const currentBrushImage = currentBrushInputs.imageBrush
      const currentBrushTexture = currentBrushInputs.texture
      const currentBrushDither = currentBrushImage ? undefined : currentSession.brushDither ?? DEFAULT_BRUSH_DITHER_SETTINGS
      const currentBrushPreviewMode = currentBrushImage?.intrinsicSize ? currentSession.brushPaintMode : 'paint'
      const currentProceduralAntialiasStrength = currentBrushInputs.fillTextureEnabled && currentSession.proceduralAntialias && currentBrushImage?.id.startsWith('procedural:') ? currentSession.proceduralAntialiasStrength : 0
      const erasing = currentSession.tool === 'eraser'
      // Dynamic mappings are already resolved into the active drag's last
      // sample.  When hovering, keep the configured brush size so enabling
      // pressure does not collapse the preview to the pointer-event hover
      // pressure (usually zero).
      const previewBrushSize = drawing ? drag?.lastBrushSize ?? currentSession.brushSize : currentSession.brushSize
      const previewBrushImage = currentBrushImage
      const previewBrushAngle = drawing ? drag?.path?.at(-1)?.angle ?? 0 : 0
      const overwriteImageBrushPixels = !erasing && previewBrushImage?.intrinsicSize === true && currentBrushPreviewMode === 'paint'
      const { x: beforeX, y: beforeY } = brushStampAnchor(previewBrushSize, previewBrushImage, previewBrushAngle)
      const brushPoint = snapBrushPointToGrid(point, previewBrushSize, previewBrushImage, previewBrushAngle, currentSession)
      context.save()
      const texture = currentBrushTexture
      const patternOrigin = brushPatternOrigin(brushPoint, previewBrushSize, previewBrushImage)
      const mask = brushMaskOffsets(previewBrushSize, currentSession.brushShape, texture, currentSession.brushTextureScale, brushPoint.x - beforeX, brushPoint.y - beforeY, previewBrushImage, currentSession.brushImageSettings, currentProceduralAntialiasStrength, currentBrushPreviewMode, patternOrigin.x, patternOrigin.y, currentBrushDither, previewBrushAngle)
      const previewPoints = new Map<string, { x: number; y: number; coverage: number; color: RgbaColor }>()
      for (const offset of mask) {
        const sourcePoint = { x: brushPoint.x - beforeX + offset.x, y: brushPoint.y - beforeY + offset.y }
        previewPoints.set(`${sourcePoint.x}:${sourcePoint.y}`, { ...sourcePoint, coverage: offset.coverage, color: offset.color ?? currentSession.primaryColor })
      }
      const renderedPreviewPoints = new Map<string, { x: number; y: number; sampleX: number; sampleY: number; coverage: number; color: RgbaColor }>()
      for (const previewPoint of previewPoints.values()) {
        for (const placement of tileRepeatContinuousPreviewPlacements(previewPoint, document.width, document.height, view.tileRepeatMode ?? 'off', repeatCopies)) {
          const key = `${placement.point.x}:${placement.point.y}`
          const previous = renderedPreviewPoints.get(key)
          if (previous && previous.coverage > previewPoint.coverage) continue
          renderedPreviewPoints.set(key, {
            x: placement.point.x,
            y: placement.point.y,
            sampleX: placement.samplePoint.x,
            sampleY: placement.samplePoint.y,
            coverage: previewPoint.coverage,
            color: previewPoint.color
          })
        }
      }
      const occupied = new Set(renderedPreviewPoints.keys())
      const sampled = erasing
        ? sampleCompositeForPreview(brushPoint.x, brushPoint.y)
        : resolveLayerCanvasColor(document, currentActiveLayer, drawing ? drag?.color ?? currentSession.primaryColor : currentSession.primaryColor)
      const luminance = colorLuminance(sampled)
      context.strokeStyle = luminance > 145 ? activeTheme.variables['--theme-selection-outline-dark'] : activeTheme.variables['--theme-selection-outline-light']
      context.lineWidth = Math.max(1, Math.min(2, view.zoom / 4))
      context.beginPath()
      for (const previewPoint of renderedPreviewPoints.values()) {
        if (!previewAllowed || (previewSelection && !selectionContains(previewSelection, previewPoint.sampleX, previewPoint.sampleY))) continue
        const pixelRect = previewPixelRect(previewPoint.x, previewPoint.y)
        if (!drawing && (brushPreviewMode === 'full' || brushPreviewMode === 'full-edge')) {
          fillPreviewPixelRect(
            pixelRect,
            previewPoint.sampleX,
            previewPoint.sampleY,
            previewColorAt(previewPoint.sampleX, previewPoint.sampleY, erasing, previewPoint.coverage, previewPoint.color, undefined, overwriteImageBrushPixels)
          )
        }
        const drawPreviewOutline = brushPreviewMode === 'edge' || brushPreviewMode === 'full-edge' || (erasing && brushPreviewMode === 'full')
        if (!drawPreviewOutline) continue
        const left = !occupied.has(`${previewPoint.x - 1}:${previewPoint.y}`)
        const right = !occupied.has(`${previewPoint.x + 1}:${previewPoint.y}`)
        const top = !occupied.has(`${previewPoint.x}:${previewPoint.y - 1}`)
        const bottom = !occupied.has(`${previewPoint.x}:${previewPoint.y + 1}`)
        if (left) { context.moveTo(pixelRect.x, pixelRect.y); context.lineTo(pixelRect.x, pixelRect.y + pixelRect.height) }
        if (right) { context.moveTo(pixelRect.x + pixelRect.width, pixelRect.y); context.lineTo(pixelRect.x + pixelRect.width, pixelRect.y + pixelRect.height) }
        if (top) { context.moveTo(pixelRect.x, pixelRect.y); context.lineTo(pixelRect.x + pixelRect.width, pixelRect.y) }
        if (bottom) { context.moveTo(pixelRect.x, pixelRect.y + pixelRect.height); context.lineTo(pixelRect.x + pixelRect.width, pixelRect.y + pixelRect.height) }
      }
      if (brushPreviewMode === 'edge' || brushPreviewMode === 'full-edge' || (erasing && brushPreviewMode === 'full')) context.stroke()
      context.restore()
    }

    if (canRenderToolPreview && !inputRef.current.spaceHeld && inputRef.current.pointer.visible && !inputRef.current.sampling && session.tool === 'airbrush') {
      const pointerLocation = repeatedDocumentPointsAt(inputRef.current.pointer.clientX, inputRef.current.pointer.clientY)
      const point = pointerLocation?.local ?? inputRef.current.pointer.point
      const airbrushPoint = gridSnapActive ? snapPointToGrid(point, session.view.grid ?? DEFAULT_GRID_SETTINGS) : point
      const spraySize = session.airbrushScatterRadius * 2 + 1
      const sprayAnchor = brushStampAnchor(spraySize, null)
      const sprayMask = brushMaskOffsets(spraySize, 'round')
      const sprayPoints = new Map<string, { x: number; y: number }>()
      const spraySourcePoints = sprayMask.map((offset) => ({ x: airbrushPoint.x - sprayAnchor.x + offset.x, y: airbrushPoint.y - sprayAnchor.y + offset.y }))
      for (const target of airbrushSymmetryPoints(spraySourcePoints, document.width, document.height, session.symmetryAxes, symmetryCenter)) {
        const mapped = tileRepeatMappedPointForCopies(target, document.width, document.height, view.tileRepeatMode ?? 'off', true)
        if (mapped) sprayPoints.set(`${mapped.local.x}:${mapped.local.y}`, mapped.local)
      }
      const sampled = sampleCompositeForPreview(airbrushPoint.x, airbrushPoint.y)
      context.save()
      context.strokeStyle = colorLuminance(sampled) > 145 ? activeTheme.variables['--theme-selection-outline-dark'] : activeTheme.variables['--theme-selection-outline-light']
      context.lineWidth = Math.max(1, Math.min(2, view.zoom / 4))
      context.beginPath()
      for (const sprayPoint of sprayPoints.values()) {
        const left = !sprayPoints.has(previewPointKey(sprayPoint.x - 1, sprayPoint.y) ?? '')
        const right = !sprayPoints.has(previewPointKey(sprayPoint.x + 1, sprayPoint.y) ?? '')
        const top = !sprayPoints.has(previewPointKey(sprayPoint.x, sprayPoint.y - 1) ?? '')
        const bottom = !sprayPoints.has(previewPointKey(sprayPoint.x, sprayPoint.y + 1) ?? '')
        for (const pixelRect of previewPixelRects(sprayPoint.x, sprayPoint.y)) {
          if (left) { context.moveTo(pixelRect.x, pixelRect.y); context.lineTo(pixelRect.x, pixelRect.y + pixelRect.height) }
          if (right) { context.moveTo(pixelRect.x + pixelRect.width, pixelRect.y); context.lineTo(pixelRect.x + pixelRect.width, pixelRect.y + pixelRect.height) }
          if (top) { context.moveTo(pixelRect.x, pixelRect.y); context.lineTo(pixelRect.x + pixelRect.width, pixelRect.y) }
          if (bottom) { context.moveTo(pixelRect.x, pixelRect.y + pixelRect.height); context.lineTo(pixelRect.x + pixelRect.width, pixelRect.y + pixelRect.height) }
        }
      }
      const particleSize = airbrushParticleSize(session.airbrushParticleRadius)
      const particleAnchor = brushStampAnchor(particleSize, null)
      const particleSourcePoints = brushMaskOffsets(particleSize, session.airbrushParticleShape).map((offset) => ({
        x: point.x - particleAnchor.x + offset.x,
        y: point.y - particleAnchor.y + offset.y
      }))
      for (const target of airbrushSymmetryPoints(particleSourcePoints, document.width, document.height, session.symmetryAxes, symmetryCenter)) {
        const mapped = tileRepeatMappedPointForCopies(target, document.width, document.height, view.tileRepeatMode ?? 'off', true)
        if (mapped) drawPreviewPixel(mapped.local.x, mapped.local.y, previewColorAt(mapped.local.x, mapped.local.y))
      }
      context.stroke()
      context.restore()
    }

    if (view.showGrid && toX > fromX && toY > fromY) {
      const grid = view.grid ?? DEFAULT_GRID_SETTINGS
      for (const copy of repeatCopies) {
        if (copy.toX > copy.fromX && copy.toY > copy.fromY) drawGrid(grid.x, grid.y, grid.width, grid.height, gridColors.gridColor, copy)
      }
    }

    const moveLayerPreview = moveLayerContentPreviewEnabled ? moveLayerContentPreviewRef.current : null
    if (moveLayerPreview) {
      const layer = document.layers.find((candidate) => candidate.id === moveLayerPreview.layerId)
      if (layer) {
        const left = originX + (moveLayerPreview.bounds.x + layer.offsetX - moveLayerPreview.layerOffsetX) * view.zoom
        const top = originY + (moveLayerPreview.bounds.y + layer.offsetY - moveLayerPreview.layerOffsetY) * view.zoom
        const right = left + moveLayerPreview.bounds.width * view.zoom
        const bottom = top + moveLayerPreview.bounds.height * view.zoom
        context.save()
        context.globalCompositeOperation = 'source-over'
        context.globalAlpha = 1
        context.strokeStyle = `rgba(${DEFAULT_GRID_COLOR.r}, ${DEFAULT_GRID_COLOR.g}, ${DEFAULT_GRID_COLOR.b}, ${DEFAULT_GRID_COLOR.a / 255})`
        context.lineWidth = 1
        context.setLineDash([])
        context.strokeRect(Math.round(left) + 0.5, Math.round(top) + 0.5, Math.max(1, Math.round(right) - Math.round(left)), Math.max(1, Math.round(bottom) - Math.round(top)))
        context.restore()
      }
    }

    if (sliceTool || sliceOutlinesVisible) {
      const sliceDrag = inputRef.current.drag
      const previewSlice = sliceDrag?.kind === 'create-slice' && sliceDrag.moved ? sliceDrag.previewTarget : null
      const selectedSliceIds = new Set(sliceTool ? (currentSession.selectedSliceIds?.length ? currentSession.selectedSliceIds : currentSession.selectedSliceId ? [currentSession.selectedSliceId] : []) : [])
      const slices = currentSession.document.slices ?? []
      const drawSlice = (slice: SelectionRect, selected: boolean, handles = false): void => {
        const left = originX + slice.x * view.zoom
        const top = originY + slice.y * view.zoom
        const width = slice.width * view.zoom
        const height = slice.height * view.zoom
        context.save()
        const color = `rgb(${sliceColor.r} ${sliceColor.g} ${sliceColor.b} / ${sliceColor.a / 255})`
        context.strokeStyle = color
        context.lineWidth = selected ? 2 : 1
        context.setLineDash([])
        context.strokeRect(Math.round(left) + 0.5, Math.round(top) + 0.5, Math.max(1, Math.round(width)), Math.max(1, Math.round(height)))
        if (selected && handles) {
          context.fillStyle = color
          const handles = [[left, top], [left + width / 2, top], [left + width, top], [left, top + height / 2], [left + width, top + height / 2], [left, top + height], [left + width / 2, top + height], [left + width, top + height]]
          for (const [x, y] of handles) context.fillRect(Math.round(x) - 3, Math.round(y) - 3, 7, 7)
        }
        context.restore()
      }
      for (const slice of slices) {
        const resizePreview = sliceDrag?.kind === 'resize-slice' && sliceDrag.sliceId === slice.id ? sliceDrag.previewTarget : null
        const preview = resizePreview ?? (sliceDrag?.copy ? null : sliceDrag?.slicePreviewTargets?.[slice.id])
        drawSlice(preview ?? slice, selectedSliceIds.has(slice.id), selectedSliceIds.size === 1 && selectedSliceIds.has(slice.id))
      }
      if (sliceDrag?.copy && sliceDrag.slicePreviewTargets) for (const slice of Object.values(sliceDrag.slicePreviewTargets)) drawSlice(slice, true)
      if (previewSlice) drawSlice(previewSlice, true)
      if (autoSlicePreviewRef.current) for (const slice of autoSlicePreviewRef.current) drawSlice(slice, true)
    }

    // Keep the document boundary above selections, grids, and other previews.
    context.save()
    context.globalCompositeOperation = 'source-over'
    context.globalAlpha = 1
    drawDeviceAlignedCanvasBorder(
      context,
      originX,
      originY,
      canvasWidth,
      canvasHeight,
      deviceScale,
      activeTheme.variables['--theme-selection-outline-dark']
    )
    context.restore()

    context.restore()
    if (rotated) {
      displayContext.fillStyle = activeTheme.definition.seeds.canvasSurround
      displayContext.fillRect(0, 0, rect.width, rect.height)
      displayContext.save()
      applyViewRotation(displayContext, rect.width, rect.height, view)
      displayContext.imageSmoothingEnabled = smoothPixelSampling
      if (smoothPixelSampling) displayContext.imageSmoothingQuality = 'high'
      const scene = rotationSceneRef.current!
      // Keep the two axes tied to their actual backing ratios; using the
      // nominal scalar DPR here makes the rotated scene resample unevenly.
      displayContext.drawImage(scene, 0, 0, scene.width, scene.height, sceneLeft, sceneTop, scene.width / deviceScale.x, scene.height / deviceScale.y)
      displayContext.restore()
    }
    const statusBackgroundAt = (viewportX: number, viewportY: number): RgbaColor => {
      const point = documentPointFromViewportPoint({ x: viewportX, y: viewportY }, rect.width, rect.height, document.width, document.height, view, rotationIndicatorPosition)
      if (point.x < 0 || point.y < 0 || point.x >= document.width || point.y >= document.height) return { r: 74, g: 74, b: 81, a: 255 }
      const sampled = isolatedLayerMask ? readLayerMaskDisplayColorAt(isolatedLayerMask, point.x, point.y) : compositePointSampler(point.x, point.y)
      const background = sampled.a < 255 ? blendOver(transparencyColorAt(point.x, point.y, checkerboard), sampled) : sampled
      return view.relativeLuminance ? relativeLuminanceColor(background) : background
    }
    const statusBackgrounds = [statusBackgroundAt(72, rect.height - 16)]
    if (view.mirrored || view.mirroredVertical) statusBackgrounds.push(statusBackgroundAt(92, rect.height - 34))
    displayContext.fillStyle = canvasStatusTextColor(statusBackgrounds, activeTheme.variables['--theme-selection-outline-dark'], activeTheme.variables['--theme-selection-outline-light'])
    displayContext.font = '12px ui-monospace, SFMono-Regular, Consolas, monospace'
    const selectionSizeTarget = drawingSizePreviewTargetForDrag(inputRef.current.drag, currentSession.shapeRatio)
    const selectionSizePreview = selectionSizeTarget
      ? { width: Math.max(1, Math.round(selectionSizeTarget.width)), height: Math.max(1, Math.round(selectionSizeTarget.height)) }
      : null
    const previousSelectionSizePreview = publishedSelectionSizePreviewRef.current
    if (previousSelectionSizePreview?.width !== selectionSizePreview?.width || previousSelectionSizePreview?.height !== selectionSizePreview?.height) {
      publishedSelectionSizePreviewRef.current = selectionSizePreview
      publishSelectionSizePreview({ documentId: session.document.id, size: selectionSizePreview })
    }
    displayContext.fillText(`${document.width} x ${document.height}`, 12, rect.height - 12)
    if (view.mirrored || view.mirroredVertical) {
      const mirrorLabel = view.mirrored && view.mirroredVertical ? t('canvas.mirror.both') : view.mirrored ? t('canvas.mirror.horizontal') : t('canvas.mirror.vertical')
      displayContext.fillText(t('canvas.mirror.current', { label: mirrorLabel }), 12, rect.height - 30)
    }
    drawSelectionOverlay()
    const movingLayerIds = activeDrag?.kind === 'move-layer' && !activeDrag.duplicatedLayer && activeDrag.layerContentBounds
      ? activeDrag.animationCellKeys?.length
        ? [...new Set(activeDrag.animationCellKeys.map((key) => parseAnimationCelKey(key)?.layerId).filter((id): id is string => Boolean(id)))]
        : activeDrag.layerIds
      : undefined
    const selectionPreview = selectionPreviewOwner === 'active' && activeDrag?.selectionSource && activeDrag.previewTarget
      ? {
          layerId: currentActiveLayer.id,
          source: activeDrag.selectionSource,
          target: { ...activeDrag.previewTarget },
          angle: activeDrag.previewAngle ?? 0,
          shear: activeDrag.previewShear ? { ...activeDrag.previewShear } : undefined,
          quad: activeDrag.previewQuad ? cloneSelectionQuad(activeDrag.previewQuad) ?? undefined : undefined,
          copy: Boolean(activeDrag.copy)
        }
      : selectionPreviewOwner === 'pending' && currentSession.pendingPaste
        ? {
            layerId: currentSession.pendingPaste.layerId,
            source: currentSession.pendingPaste.source,
            target: { ...(currentSession.pendingPaste.transformTarget ?? currentSession.pendingPaste.target) },
            angle: currentSession.pendingPaste.transformAngle ?? 0,
            shear: currentSession.pendingPaste.transformShear ? { ...currentSession.pendingPaste.transformShear } : undefined,
            quad: currentSession.pendingPaste.transformQuad ? cloneSelectionQuad(currentSession.pendingPaste.transformQuad) ?? undefined : undefined,
            copy: currentSession.pendingPaste.copy
          }
        : undefined
    const publishesContentPreview = Boolean(
      currentSession.pendingPaste
      || movingLayerIds?.length
      || selectionPreview
      || (activeDrag && !nonContentPreviewDragKinds.has(activeDrag.kind))
    )
    const previewFrameId = currentSession.document.animation?.activeFrameId ?? 'static'
    const previewInvalidation = compositeCacheRef.current.consumePreviewInvalidation(previewFrameId)
    if (publishesContentPreview) {
      const snapshot: CanvasPreviewSnapshot = {
        document: currentSession.document,
        frameId: previewFrameId,
        revision: currentSession.revision,
        contentRevision: currentSession.contentRevision,
        invalidation: previewInvalidation ?? undefined,
        movingLayerIds: movingLayerIds ? [...movingLayerIds] : undefined,
        selectionPreview
      }
      publishedCanvasPreviewRef.current = snapshot
      notifyCanvasPreview(session.document.id, snapshot)
    } else if (publishedCanvasPreviewRef.current !== null) {
      publishedCanvasPreviewRef.current = null
      notifyCanvasPreview(session.document.id, null)
    }
    performanceProbe?.recordDraw(performance.now() - drawStartedAt)
  }

  const scheduleDraw = (): void => {
    const currentSession = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id) ?? session
    const currentMask = activeLayerMask(currentSession)
    const activeDrag = inputRef.current.drag
    if (activeDrag && !nonContentPreviewDragKinds.has(activeDrag.kind)) {
      if (currentMask) {
        notifyLayerMaskThumbnailPreview(session.document.id, currentMask.id)
      } else {
        const timeline = currentSession.document.animation
        const activeCel = timeline
          ? resolveAnimationCel(timeline, timeline.cels.find((cel) => cel.layerId === currentSession.document.activeLayerId && cel.frameId === timeline.activeFrameId) ?? null)
          : null
        if (activeCel) notifyAnimationCelThumbnailPreview(session.document.id, activeCel.id, currentSession.document.activeLayerId)
      }
    }
    if (drawRequestRef.current !== null) return
    drawRequestRef.current = window.requestAnimationFrame(() => {
      drawRequestRef.current = null
      drawRef.current()
    })
  }

  // A non-active pane does not receive a React prop change when the active
  // session mutates its brush size in place. Redraw it while the pointer is
  // over that pane so the shared brush preview stays live without a click.
  useEffect(() => {
    scheduleDraw()
  }, [activeToolBrushSize, session.document.id])

  useEffect(() => registerPendingCanvasGestureHistory(session.document.id, {
    undo: () => {
      if (!undoActiveCanvasPathGesture(inputRef.current)) return false
      scheduleDraw()
      return true
    },
    redo: () => {
      const drag = inputRef.current.drag
      if (!isPendingCanvasPathGesture(drag)) return false
      if (redoCanvasPathStep(drag)) scheduleDraw()
      return true
    }
  }), [session.document.id])

  useEffect(() => {
    const updateTextPreview = (event: Event): void => {
      const detail = (event as CustomEvent<TextToolPreviewDetail>).detail
      if (!detail || detail.documentId !== session.document.id) return
      textToolPreviewRef.current = detail.surface
      if (detail.box !== undefined) textToolBoxRef.current = detail.box
      scheduleDraw()
    }
    window.addEventListener(TEXT_TOOL_PREVIEW_EVENT, updateTextPreview)
    return () => window.removeEventListener(TEXT_TOOL_PREVIEW_EVENT, updateTextPreview)
  }, [session.document.id])

  useEffect(() => () => {
    const tilesetId = publishedTilesetPreviewRef.current
    if (!tilesetId) return
    publishedTilesetPreviewRef.current = null
    clearTilesetTilePreview(session.document.id, tilesetId)
  }, [session.document.id])

  drawRef.current = draw
  selectionOverlayDrawRef.current = drawSelectionOverlay

  useLayoutEffect(() => {
    const previousSize = renderDocumentSizeRef.current
    const documentSizeChanged = previousSize.width !== session.document.width || previousSize.height !== session.document.height
    if (documentSizeChanged) {
      renderDocumentSizeRef.current = { width: session.document.width, height: session.document.height }
      compositeCacheRef.current.invalidateAll()
      onionSkinCacheRef.current.invalidateAll()
      canvasResizePreviewRef.current = null
      pendingCanvasResizeRef.current = null
      if (canvasResizeFrameRef.current !== null) {
        window.cancelAnimationFrame(canvasResizeFrameRef.current)
        canvasResizeFrameRef.current = null
      }
      selectionBoundaryCacheRef.current = null
      inputRef.current.shiftLinePreview = false
      inputRef.current.sampling = false
    }
    const pointer = inputRef.current.pointer
    if (pointer.visible) {
      const point = localPointAt(pointer.clientX, pointer.clientY)
      if (point) inputRef.current.updatePointer({ point, clientX: pointer.clientX, clientY: pointer.clientY, ctrlKey: inputRef.current.ctrlHeld, altKey: inputRef.current.altHeld })
      updateCursorAt(pointer.clientX, pointer.clientY, inputRef.current.ctrlHeld, inputRef.current.altHeld, inputRef.current.shiftHeld)
    }
    scheduleDraw()
  // View rotation is rendered inside the canvas rather than by rotating the viewport element.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interfaceScale, session.document.width, session.document.height, session.view.rotation, session.view.mirrored, session.view.mirroredVertical, session.view.panX, session.view.panY, session.view.zoom])

  useLayoutEffect(() => {
    scheduleDraw()
  // Layer selection changes do not increment the document revision, but they
  // do change whether an editable text box belongs in the overlay.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.selectedLayerIds.join('\0'), session.selectedGroupIds.join('\0')])

  useEffect(() => {
    const updateShiftPreview = (active: boolean): void => {
      if (inputRef.current.shiftLinePreview === active) return
      inputRef.current.shiftLinePreview = active
      scheduleDraw()
    }
    const updateGradientModifiers = (): void => {
      const drag = inputRef.current.drag
      if (drag?.kind !== 'gradient') return
      const rawLast = drag.rawLast ?? drag.last
      const snappedLast = gridSnapActive ? snapPointToGrid(rawLast, session.view.grid ?? DEFAULT_GRID_SETTINGS) : rawLast
      const constrained = inputRef.current.shiftHeld
      const radial = gradientType === 'radial'
      drag.constrain = constrained
      drag.gradientFromCenter = radial && inputRef.current.ctrlHeld
      drag.last = !radial && constrained ? constrainGradientEndpoint(drag.start, snappedLast) : snappedLast
      scheduleDraw()
    }
    const keyDown = (event: KeyboardEvent): void => {
      const controlWasHeld = inputRef.current.ctrlHeld
      if (event.key === 'Alt') inputRef.current.altHeld = true
      if (event.key === 'Control') {
        inputRef.current.ctrlHeld = true
      }
      if (event.key === 'Shift') {
        inputRef.current.shiftHeld = true
      }
      if (event.key === 'Control' || event.key === 'Shift') updateGradientModifiers()
      const rotatableDrag = inputRef.current.drag
      if (rotatableDrag?.kind === 'marquee' || rotatableDrag?.kind === 'shape') {
        if (event.key === 'Alt') rotatableDrag.marqueeModifierMode = 'rotate'
        if (event.key === 'Control') {
          rotatableDrag.marqueeModifierMode = 'resize'
          if (!controlWasHeld && rotatableDrag.marqueeAngle !== undefined) {
            const bounds = rotatableDrag.marqueeBounds ?? rotatableDrag.marqueeRotationStart?.bounds
            if (bounds) {
              const offset = rotatableDrag.transformOffset ?? { x: 0, y: 0 }
              const pointer = inputRef.current.pointer.visible ? inputRef.current.pointer.point : rotatableDrag.last
              const transition = beginTemporaryCenteredMarqueeResize(
                bounds,
                rotatableDrag.start,
                { x: pointer.x - offset.x, y: pointer.y - offset.y },
                rotatableDrag.marqueeDirection,
                rotatableDrag.marqueeResizeStart?.fromCenter ?? true
              )
              rotatableDrag.marqueeTemporaryCenterRestore = transition.restore
              rotatableDrag.marqueeBounds = transition.bounds
              rotatableDrag.marqueeResizeStart = transition.resizeStart
              rotatableDrag.marqueeRotationStart = undefined
            }
          }
        }
      }
      const selectionNudge = event.key === 'ArrowLeft' ? { x: -1, y: 0 }
        : event.key === 'ArrowRight' ? { x: 1, y: 0 }
          : event.key === 'ArrowUp' ? { x: 0, y: -1 }
            : event.key === 'ArrowDown' ? { x: 0, y: 1 }
              : null
      const target = event.target instanceof Element ? event.target : null
      const selectionNudgeBlocked = Boolean(target?.closest('input, textarea, select, [contenteditable="true"], .modal-backdrop, .layer-list, .themed-select'))
      // Text movement takes priority over arrow navigation in the layer list.
      const textNudgeBlocked = Boolean(target?.closest('input, textarea, select, [contenteditable="true"], .modal-backdrop, .themed-select'))
      const activeTextLayer = session.tool === 'text' && session.selectedGroupIds.length === 0
        ? session.document.layers.find((layer) => layer.id === session.document.activeLayerId && layer.kind === 'text')
        : null
      if (selectionNudge && activeTextLayer && !textNudgeBlocked && !event.ctrlKey && !event.metaKey && !event.altKey && !inputRef.current.drag) {
        event.preventDefault()
        event.stopPropagation()
        useWorkspace.getState().moveLayerBy(activeTextLayer.id, selectionNudge.x, selectionNudge.y)
        scheduleDraw()
        return
      }
      if (selectionNudge && session.selection && !selectionNudgeBlocked && !event.ctrlKey && !event.metaKey && !event.altKey && !inputRef.current.drag) {
        event.preventDefault()
        event.stopPropagation()
        useWorkspace.getState().moveActiveSelectionWithSelectionHistory(selectionNudge.x, selectionNudge.y, true)
        onionSkinCacheRef.current.invalidateFrames(session.selectedAnimationFrameIds)
        scheduleDraw()
        return
      }
      if (session.tool === 'rotate' && modifierActive(event, 'resetViewRotation')) {
        const drag = inputRef.current.drag
        if (drag?.kind === 'rotate-view') {
          liveViewRef.current = { ...liveViewRef.current, rotation: 0 }
          applyRotationStyle(liveViewRef.current)
          updateRotationIndicator(0, true)
          useWorkspace.getState().setView({ rotation: 0 })
          scheduleDraw()
        }
      }
      if (shortcutMatchesAnyEvent(event, shortcutBindingsFor(shortcuts, 'tool.hand.quick'))) {
        const target = event.target as HTMLElement | null
        if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT' || target?.isContentEditable) return
        event.preventDefault()
        if (!inputRef.current.spaceHeld) {
          inputRef.current.spaceHeld = true
          inputRef.current.sampling = false
          const drag = inputRef.current.drag
          if ((drag?.kind === 'marquee' || drag?.kind === 'shape') && inputRef.current.pointer.visible) {
            drag.transformMoveStart = {
              pointer: { ...inputRef.current.pointer.point },
              offset: { ...(drag.transformOffset ?? { x: 0, y: 0 }) }
            }
          }
          if (canvasRef.current && inputRef.current.pointer.visible) {
            canvasRef.current.style.cursor = drag?.kind === 'marquee'
              ? selectionCreationCursor(selectionCrosshair, selectionInteractionEditable)
              : drag?.kind === 'shape' ? canvasToolCursor(session.tool, session.primaryColor)
                : drag?.kind === 'pan' ? canvasCursors.grabbing : canvasCursors.grab
          }
          scheduleDraw()
        }
        return
      }
      if (inputRef.current.spaceHeld) return
      if (lineConnectionConfigured && inputRef.current.pointer.visible) updateShiftPreview(lineConnectionPreviewActive(event))
      const modifierEvent = {
        ctrlKey: event.ctrlKey || inputRef.current.ctrlHeld,
        metaKey: event.metaKey,
        altKey: event.altKey || inputRef.current.altHeld,
        shiftKey: event.shiftKey || inputRef.current.shiftHeld
      }
      const modifierSizing = (activeLayer.kind !== 'tilemap' || session.tilemapMode !== 'paint') && modifierActive(modifierEvent, 'brushSizeAdjust') && (session.tool === 'pencil' || session.tool === 'airbrush' || session.tool === 'eraser')
      if (modifierSizing) {
        inputRef.current.sampling = false
        event.preventDefault()
        const pointer = inputRef.current.pointer
        if (pointer.visible) {
          if (!inputRef.current.modifierBrushSize) {
            inputRef.current.modifierBrushSize = {
              x: pointer.clientX,
              y: pointer.clientY,
              size: session.tool === 'airbrush' ? session.airbrushScatterRadius : session.brushSize
            }
          }
          updateCursorAt(pointer.clientX, pointer.clientY, modifierEvent.ctrlKey, modifierEvent.altKey, modifierEvent.shiftKey)
        }
        scheduleDraw()
      } else if (event.key === 'Alt' && inputRef.current.pointer.visible) {
        event.preventDefault()
        updateCursorAt(inputRef.current.pointer.clientX, inputRef.current.pointer.clientY, inputRef.current.ctrlHeld, true, inputRef.current.shiftHeld)
        scheduleDraw()
      } else if (event.key === 'Control' && inputRef.current.pointer.visible) {
        updateCursorAt(inputRef.current.pointer.clientX, inputRef.current.pointer.clientY, true, inputRef.current.altHeld, inputRef.current.shiftHeld)
        scheduleDraw()
      } else if (event.key === 'Shift' && inputRef.current.pointer.visible) {
        updateCursorAt(inputRef.current.pointer.clientX, inputRef.current.pointer.clientY, inputRef.current.ctrlHeld, inputRef.current.altHeld, true)
        scheduleDraw()
      }
      if ((event.key === 'Alt' || event.key === 'Control' || event.key === 'Shift') && inputRef.current.pointer.visible) {
        const drag = inputRef.current.drag
        if (drag?.kind === 'marquee' && drag.moved) updateMarqueePreview(drag, inputRef.current.pointer.point, currentSelectionMarqueeModifierState())
        else if (drag?.kind === 'shape') updateShapePreview(drag, inputRef.current.pointer.point, currentSelectionMarqueeModifierState())
        else if (drag?.kind === 'transform-content') {
          if (drag.freeTransform) updateFreeTransformPreview(drag, inputRef.current.pointer.point)
          else updateSelectionTransformPreview(drag, inputRef.current.pointer.point, currentSelectionTransformModifierState())
        }
      }
    }
    const keyUp = (event: KeyboardEvent): void => {
      inputRef.current.syncModifierKeys(event)
      const temporaryPanReleased = shortcutReleasedByBindings(event, shortcutBindingsFor(shortcuts, 'tool.hand.quick'))
      if (lineConnectionConfigured && !lineConnectionActive(event)) updateShiftPreview(false)
      if (event.key === 'Alt' || event.key === 'Control' || event.key === 'Shift') {
        if (event.key === 'Alt') { event.preventDefault(); inputRef.current.altHeld = false }
        if (event.key === 'Control') inputRef.current.ctrlHeld = false
        if (event.key === 'Shift') {
          inputRef.current.shiftHeld = false
        }
        if (event.key === 'Control' || event.key === 'Shift') updateGradientModifiers()
        const rotatableDrag = inputRef.current.drag
        if (rotatableDrag?.kind === 'marquee' || rotatableDrag?.kind === 'shape') {
          if (event.key === 'Alt' && rotatableDrag.marqueeModifierMode === 'rotate') {
            rotatableDrag.marqueeModifierMode = inputRef.current.ctrlHeld ? 'resize' : undefined
          }
          if (event.key === 'Control' && rotatableDrag.marqueeModifierMode === 'resize') {
            rotatableDrag.marqueeModifierMode = inputRef.current.altHeld ? 'rotate' : undefined
          }
          if (event.key === 'Control' && rotatableDrag.marqueeTemporaryCenterRestore) {
            const offset = rotatableDrag.transformOffset ?? { x: 0, y: 0 }
            const pointer = inputRef.current.pointer.visible ? inputRef.current.pointer.point : rotatableDrag.last
            const restored = restoreTemporaryCenteredMarqueeResize(
              rotatableDrag.marqueeTemporaryCenterRestore,
              { x: pointer.x - offset.x, y: pointer.y - offset.y }
            )
            rotatableDrag.marqueeBounds = restored.bounds
            rotatableDrag.marqueeResizeStart = restored.resizeStart
            rotatableDrag.marqueeDirection = restored.direction
            rotatableDrag.marqueeRotationStart = undefined
            rotatableDrag.marqueeTemporaryCenterRestore = undefined
          }
        }
        inputRef.current.sampling = session.tool === 'eyedropper' || quickToolActive('eyedropper')
        inputRef.current.modifierBrushSize = null
        if (event.key === 'Alt' && (inputRef.current.drag?.kind === 'marquee' || inputRef.current.drag?.kind === 'shape')) {
          const drag = inputRef.current.drag
          const bounds = drag.marqueeBounds ?? drag.marqueeRotationStart?.bounds
          if (bounds) {
            const offset = drag.transformOffset ?? { x: 0, y: 0 }
            const resizeBounds = inputRef.current.ctrlHeld ? centerMarqueeBoundsAtCreationPoint(bounds, drag.start) : bounds
            drag.marqueeBounds = resizeBounds
            drag.marqueeResizeStart = createMarqueeResizeStart(resizeBounds, { x: drag.last.x - offset.x, y: drag.last.y - offset.y })
            drag.marqueeRotationStart = undefined
          }
        }
        if (inputRef.current.pointer.visible) updateCursorAt(inputRef.current.pointer.clientX, inputRef.current.pointer.clientY, inputRef.current.ctrlHeld, inputRef.current.altHeld, inputRef.current.shiftHeld)
        else if (canvasRef.current) canvasRef.current.style.cursor = inputRef.current.sampling ? canvasCursors.eyedropper : canvasToolCursor(session.tool, session.primaryColor)
        const drag = inputRef.current.drag
        if (drag?.kind === 'marquee' && drag.moved && inputRef.current.pointer.visible) updateMarqueePreview(drag, inputRef.current.pointer.point, currentSelectionMarqueeModifierState())
        else if (drag?.kind === 'shape' && inputRef.current.pointer.visible) updateShapePreview(drag, inputRef.current.pointer.point, currentSelectionMarqueeModifierState())
        else if (drag?.kind === 'transform-content' && inputRef.current.pointer.visible) {
          if (drag.freeTransform) updateFreeTransformPreview(drag, inputRef.current.pointer.point)
          else updateSelectionTransformPreview(drag, inputRef.current.pointer.point, currentSelectionTransformModifierState())
        }
        scheduleDraw()
      }
      if (temporaryPanReleased) {
        event.preventDefault()
        inputRef.current.spaceHeld = false
        const drag = inputRef.current.drag
        if (drag) drag.transformMoveStart = undefined
        if (canvasRef.current) canvasRef.current.style.cursor = drag?.kind === 'marquee'
          ? selectionCreationCursor(selectionCrosshair, selectionInteractionEditable)
          : canvasToolCursor(session.tool, session.primaryColor)
        scheduleDraw()
      }
    }
    const cancelSampling = (): void => {
      if (inputRef.current.drag?.kind === 'sample-color') inputRef.current.finish()
      inputRef.current.sampling = false
      eyedropperOriginalColorRef.current = null
      hideEyedropperMagnifier()
    }
    const blur = (): void => {
      updateShiftPreview(false)
      cancelActiveCanvasInteraction()
      cancelSampling()
      hidePenCursor()
      if (canvasRef.current) canvasRef.current.style.cursor = canvasToolCursor(session.tool, session.primaryColor)
    }
    const visibilityChange = (): void => { if (document.hidden) blur() }
    const focus = (): void => {
      cancelSampling()
      if (canvasRef.current) canvasRef.current.style.cursor = canvasToolCursor(session.tool, session.primaryColor)
    }
    window.addEventListener('keydown', keyDown)
    window.addEventListener('keyup', keyUp)
    window.addEventListener('blur', blur)
    window.addEventListener('focus', focus)
    document.addEventListener('visibilitychange', visibilityChange)
    return () => { window.removeEventListener('keydown', keyDown); window.removeEventListener('keyup', keyUp); window.removeEventListener('blur', blur); window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', visibilityChange) }
  }, [session.tool, gradientType, lineAnchor, lineConnectionShortcut, shortcuts.brushSizeAdjust, shortcuts.resetViewRotation, shortcuts['tool.hand.quick']])

  useEffect(() => {
    scheduleDraw()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.document.id, session.revision, session.activeLayerMaskId, session.layerMaskIsolatedView, session.selectedTilesetId, session.selectedTileId, session.secondaryTileId, session.tilemapMode, session.freeTileMode, session.view.tileRepeatMode, session.view.showPixelGrid, session.view.showGrid, session.view.isoViewEnabled, session.view.grid?.x, session.view.grid?.y, session.view.grid?.width, session.view.grid?.height, session.view.relativeLuminance, session.view.mirrored, session.view.mirroredVertical, session.view.showSelectionOutline, session.view.showSelectionPivot, session.selection, session.freeTransformActive, session.freeTransformQuad?.nw.x, session.freeTransformQuad?.nw.y, session.freeTransformQuad?.ne.x, session.freeTransformQuad?.ne.y, session.freeTransformQuad?.se.x, session.freeTransformQuad?.se.y, session.freeTransformQuad?.sw.x, session.freeTransformQuad?.sw.y, session.pendingPaste?.transformQuad?.nw.x, session.pendingPaste?.transformQuad?.nw.y, session.pendingPaste?.transformQuad?.ne.x, session.pendingPaste?.transformQuad?.ne.y, session.pendingPaste?.transformQuad?.se.x, session.pendingPaste?.transformQuad?.se.y, session.pendingPaste?.transformQuad?.sw.x, session.pendingPaste?.transformQuad?.sw.y, session.selectionPivot?.x, session.selectionPivot?.y, session.outlinePreview, session.brushSize, session.brushShape, activeBrushDither?.enabled, activeBrushDither?.template, activeBrushDither?.stage, session.shapeKind, session.shapeRatio, session.fillMode, fillKind, gradientDither, session.symmetryAxes.horizontal, session.symmetryAxes.vertical, session.symmetryAxes.diagonalUp, session.symmetryAxes.diagonalDown, session.symmetryAxes.rotational, symmetryCenter.x, symmetryCenter.y, drawingBrushPreviewEnabled, brushPreviewMode, checkerboard, gridColors, alignmentPreferences.gridAlignmentEnabled, alignmentPreferences.smartAlignmentEnabled, alignmentPreferences.alignmentGuidesVisible, alignmentPreferences.alignmentThreshold, sliceColor, textBoxColor, canvasResizeColor, sliceOutlinesVisible, shiftLinePreviewEnabled, gradientLineVisible, gradientLineColor, lassoPreviewClosed, selectionCrosshair, selectionPreviewColorMode, selectionPreviewColor, selectionSizeVisible, balancedShiftLineEnabled, lineDirectionStep, lineConnectionShortcut, rotationIndicatorPosition, onionSkin, timelineHidden, symmetryAxisPreferences, isoViewPreferences, interfaceScale])

  useEffect(() => {
    scheduleDraw()
  // Free-tile instance selection is session state rather than document revision.
  // Redraw the overlay when it changes so the merged selection frame stays in sync.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.document.id, session.freeTileInstanceLayerId, session.selectedFreeTileInstanceId, session.selectedFreeTileInstanceIds.join('\\0')])

  const selectionOverlayAnimated = Boolean(session.selection || selectedTextBoxForSession(session))
  useEffect(() => {
    if (!selectionOverlayAnimated) return
    const renderSelection = (): void => {
      selectionOverlayDrawRef.current()
      const currentSession = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id)
      if (currentSession?.selection || (currentSession && selectedTextBoxForSession(currentSession))) rafRef.current = window.setTimeout(renderSelection, 160)
    }
    rafRef.current = window.setTimeout(renderSelection, 160)
    return () => {
      if (rafRef.current) window.clearTimeout(rafRef.current)
      rafRef.current = null
    }
  }, [selectionOverlayAnimated, session.document.id])

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        cacheStageDisplaySize(entry.contentRect.width, entry.contentRect.height)
        const state = useWorkspace.getState()
        state.setViewportSizeForDocument(session.document.id, stageSizeRef.current)
        const constrained = constrainCanvasView(liveViewRef.current, stageSizeRef.current)
        if (constrained.panX !== liveViewRef.current.panX || constrained.panY !== liveViewRef.current.panY) {
          liveViewRef.current = constrained
          state.setViewForDocument(session.document.id, { panX: constrained.panX, panY: constrained.panY })
        }
      }
      // ResizeObserver runs before paint. Redraw now so the browser never
      // stretches the previous canvas bitmap to the new dock layout for a frame.
      if (drawRequestRef.current !== null) window.cancelAnimationFrame(drawRequestRef.current)
      drawRequestRef.current = null
      drawRef.current()
    })
    if (stageRef.current) {
      const bounds = stageRef.current.getBoundingClientRect()
      cacheStageDisplaySize(bounds.width, bounds.height)
      const state = useWorkspace.getState()
      state.setViewportSizeForDocument(session.document.id, stageSizeRef.current)
      const constrained = constrainCanvasView(liveViewRef.current, stageSizeRef.current)
      if (constrained.panX !== liveViewRef.current.panX || constrained.panY !== liveViewRef.current.panY) {
        liveViewRef.current = constrained
        state.setViewForDocument(session.document.id, { panX: constrained.panX, panY: constrained.panY })
      }
      observer.observe(stageRef.current)
    }
    return () => {
      observer.disconnect()
      stopAirbrushTimer()
      if (drawRequestRef.current) window.cancelAnimationFrame(drawRequestRef.current)
      if (selectionPreviewFrameRef.current) window.cancelAnimationFrame(selectionPreviewFrameRef.current)
      drawRequestRef.current = null
      selectionPreviewFrameRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interfaceScale, session.document.id])

  const unrotatedStagePoint = (clientX: number, clientY: number): Point => {
    const size = stageSize()
    const view = liveViewRef.current
    const pivot = viewRotationPivot(size.width, size.height, view.panX, view.panY, rotationIndicatorPosition)
    return unrotateViewportPoint(stagePoint(clientX, clientY), pivot, view.rotation)
  }

  const repeatedDocumentPointsAt = (clientX: number, clientY: number, continuous = false, allowOutsideCopies = false): { local: Point; repeated: Point; offset: { x: number; y: number } } | null => {
    if (!canvasRef.current) return null
    const size = stageSize()
    const viewportPoint = stagePoint(clientX, clientY)
    let repeated = continuous
      ? documentPointFromViewportPointContinuous(viewportPoint, size.width, size.height, session.document.width, session.document.height, liveViewRef.current, rotationIndicatorPosition)
      : documentPointFromViewportPoint(viewportPoint, size.width, size.height, session.document.width, session.document.height, liveViewRef.current, rotationIndicatorPosition)
    if (!continuous && pixelSamplingMode(liveViewRef.current.zoom) === 'hard') {
      const origin = viewCanvasOrigin(size.width, size.height, session.document.width, session.document.height, liveViewRef.current)
      const deviceScale = {
        x: canvasRef.current.width > 0 ? canvasRef.current.width / size.width : canvasBackingRatioForInterfaceScale(window.devicePixelRatio || 1, interfaceScale),
        y: canvasRef.current.height > 0 ? canvasRef.current.height / size.height : canvasBackingRatioForInterfaceScale(window.devicePixelRatio || 1, interfaceScale)
      }
      // Use the displayed point directly after undoing rotation/mirroring.
      // Converting through document coordinates and multiplying by zoom again
      // can cross an exact device-pixel tie at high zoom due to floating-point
      // round trips, making the brush preview land one row below the pointer.
      const unrotatedPoint = unrotatedViewportPoint(viewportPoint, size.width, size.height, liveViewRef.current, rotationIndicatorPosition)
      const alignedCanvas = deviceAlignedCanvasRect(origin.x, origin.y, session.document.width * liveViewRef.current.zoom, session.document.height * liveViewRef.current.zoom, deviceScale)
      repeated = deviceAlignedDocumentPointAtViewport(
        unrotatedPoint.x,
        unrotatedPoint.y,
        alignedCanvas.left,
        alignedCanvas.top,
        liveViewRef.current.zoom,
        deviceScale
      )
    }
    const mapped = tileRepeatMappedPointForCopies(
      repeated,
      session.document.width,
      session.document.height,
      liveViewRef.current.tileRepeatMode ?? 'off',
      allowOutsideCopies
    )
    return mapped ? { local: mapped.local, repeated, offset: mapped.offset } : null
  }

  const localPointAt = (clientX: number, clientY: number, allowOutsideCopies = false): Point | null => repeatedDocumentPointsAt(clientX, clientY, false, allowOutsideCopies)?.local ?? null

  const tileRepeatPointAt = (clientX: number, clientY: number): Point | null => repeatedDocumentPointsAt(clientX, clientY)?.repeated ?? null

  const localPoint = (event: React.PointerEvent<HTMLCanvasElement>, allowOutsideCopies = false): Point | null => localPointAt(event.clientX, event.clientY, allowOutsideCopies)

  canvasColorSampleAtClientPointRef.current = (clientX, clientY) => {
    const currentSession = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id) ?? session
    const point = localPointAt(clientX, clientY)
    if (!point || point.x < 0 || point.y < 0 || point.x >= currentSession.document.width || point.y >= currentSession.document.height) return null
    const mask = activeLayerMask(currentSession)
    return mask
      ? readLayerMaskDisplayColorAt(mask, point.x, point.y)
      : cursorCompositePointSamplerFor(currentSession)(point.x, point.y)
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    return registerCanvasColorSamplingSurface({
      canvas,
      sampleAtClientPoint: (clientX, clientY) => canvasColorSampleAtClientPointRef.current(clientX, clientY),
      setSamplingCursor: (active) => {
        const current = liveInputSession()
        canvas.style.cursor = active ? canvasCursors.eyedropper : canvasToolCursor(current.tool, current.primaryColor)
      }
    })
  }, [session.document.id])

  const localContinuousPointAt = (clientX: number, clientY: number): Point | null => {
    return repeatedDocumentPointsAt(clientX, clientY, true)?.local ?? null
  }

  const quickSelectionCellAt = (active: DocumentSession, point: Point): SelectionRect | null => {
    const grid = active.view.showGrid
      ? active.view.grid ?? DEFAULT_GRID_SETTINGS
      : { x: 0, y: 0, width: checkerboard.size, height: checkerboard.size }
    return gridCellBoundsAt(point, grid, active.document.width, active.document.height)
  }

  const quickSelectCell = (event: React.MouseEvent<HTMLCanvasElement>): void => {
    if (inputRef.current.drag?.kind === 'polygon-lasso' || inputRef.current.drag?.kind === 'polygon-shape') {
      event.preventDefault()
      if (inputRef.current.drag.kind === 'polygon-shape') commitPolygonShape()
      else commitPolygonLasso()
      return
    }
    if (session.tool !== 'selection' || session.selectionKind !== 'rectangle') return
    const handledAt = quickSelectionHandledAtRef.current
    if (handledAt !== null && event.timeStamp - handledAt >= 0 && event.timeStamp - handledAt < 1000) {
      quickSelectionHandledAtRef.current = null
      event.preventDefault()
      return
    }
    const point = localPointAt(event.clientX, event.clientY)
    if (!point) return
    const state = useWorkspace.getState()
    state.commitFloatingPaste()
    const active = state.sessions.find((item) => item.document.id === session.document.id)
    if (!active || (!active.activeLayerMaskId && (active.selectedGroupIds.length > 0 || !active.selectedLayerIds.some((id) => active.document.layers.some((layer) => layer.id === id))))) return
    const layer = activePaintLayer(active)
    if (!isLayerEffectivelyVisible(active.document, layer) || isLayerEffectivelyLocked(active.document, layer)) return
    const cell = quickSelectionCellAt(active, point)
    if (!cell) return
    const before = cloneSelection(active.selection)
    const mode: SelectionMode = event.shiftKey || modifierActive(event.nativeEvent, 'addToSelection') ? 'add' : active.selectionMode
    const incoming = tilemapPaintSelectionForIncoming(rectSelection(cell.x, cell.y, cell.width, cell.height), active)
    const after = combineSelection(before, incoming, mode)
    state.commitSelectionChange(before, after, t('canvas.history.createSelection'))
    event.preventDefault()
    scheduleDraw()
  }

  const hideEyedropperMagnifier = (): void => {
    if (eyedropperMagnifierRef.current) eyedropperMagnifierRef.current.hidden = true
  }

  const updateEyedropperMagnifier = (clientX: number, clientY: number, sampled: RgbaColor): void => {
    const magnifier = eyedropperMagnifierRef.current
    const magnifierCanvas = eyedropperMagnifierCanvasRef.current
    if (!eyedropperMagnifierEnabled || !magnifier || !magnifierCanvas) return
    magnifier.dataset.style = eyedropperMagnifierStyle
    const previousColor = eyedropperOriginalColorRef.current
    const colorCss = (color: RgbaColor): string => `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a / 255})`
    const sampledMask = eyedropperMagnifierSampledMaskRef.current
    const previousMask = eyedropperMagnifierPreviousMaskRef.current
    if (sampledMask) sampledMask.style.color = colorCss(sampled)
    if (previousMask && previousColor) previousMask.style.color = colorCss(previousColor)
    magnifier.style.setProperty('--eyedropper-sampled-color', colorCss(sampled))
    magnifier.style.setProperty('--eyedropper-previous-color', colorCss(previousColor ?? sampled))
    const bounds = stageBounds()
    const localX = clientX - bounds.left
    const localY = clientY - bounds.top
    if (localX < 0 || localY < 0 || localX > bounds.width || localY > bounds.height) {
      hideEyedropperMagnifier()
      return
    }
    const magnifierWidth = EYEDROPPER_MAGNIFIER_BASE_SIZE * eyedropperMagnifierSize
    const magnifierHeight = EYEDROPPER_MAGNIFIER_BASE_SIZE * eyedropperMagnifierSize
    const horizontalInset = Math.min(6, Math.max(0, (bounds.width - magnifierWidth) / 2))
    const verticalInset = Math.min(6, Math.max(0, (bounds.height - magnifierHeight) / 2))
    const maxLeft = Math.max(horizontalInset, bounds.width - magnifierWidth - horizontalInset)
    const maxTop = Math.max(verticalInset, bounds.height - magnifierHeight - verticalInset)
    const left = Math.min(maxLeft, Math.max(horizontalInset, localX - magnifierWidth / 2))
    const preferredTop = localY - magnifierHeight - 18
    const top = preferredTop >= verticalInset
      ? preferredTop
      : Math.min(maxTop, Math.max(verticalInset, localY + 18))
    magnifier.style.left = `${left}px`
    magnifier.style.top = `${top}px`
    const context = magnifierCanvas.getContext('2d')
    if (!context) return
    const dpr = window.devicePixelRatio || 1
    const size = EYEDROPPER_MAGNIFIER_VIEWPORT_SIZE
    const sourcePixelCount = 25
    const pixelScale = eyedropperMagnifierPixelScale(liveViewRef.current.zoom, size)
    const point = localContinuousPointAt(clientX, clientY)
    if (!point) { hideEyedropperMagnifier(); return }
    const centerX = Math.floor(point.x)
    const centerY = Math.floor(point.y)
    const startX = centerX - Math.floor(sourcePixelCount / 2)
    const startY = centerY - Math.floor(sourcePixelCount / 2)
    const mask = activeLayerMask(session)
    const pixels = mask
      ? renderLayerMaskRegion(mask, startX, startY, sourcePixelCount, sourcePixelCount)
      : compositeRegion(session.document, startX, startY, sourcePixelCount, sourcePixelCount)
    magnifierCanvas.width = size * dpr
    magnifierCanvas.height = size * dpr
    context.setTransform(dpr, 0, 0, dpr, 0, 0)
    context.clearRect(0, 0, size, size)
    context.imageSmoothingEnabled = false
    let sourceCanvas = eyedropperMagnifierSourceRef.current
    if (!sourceCanvas || sourceCanvas.width !== sourcePixelCount || sourceCanvas.height !== sourcePixelCount) {
      sourceCanvas = new OffscreenCanvas(sourcePixelCount, sourcePixelCount)
      eyedropperMagnifierSourceRef.current = sourceCanvas
    }
    const sourceContext = sourceCanvas.getContext('2d')
    if (!sourceContext) return
    const displayPixels = new Uint8ClampedArray(pixels.length)
    for (let y = 0; y < sourcePixelCount; y += 1) for (let x = 0; x < sourcePixelCount; x += 1) {
      const offset = (y * sourcePixelCount + x) * 4
      const color = { r: pixels[offset], g: pixels[offset + 1], b: pixels[offset + 2], a: pixels[offset + 3] }
      const displayColor = color.a < 255 ? blendOver(transparencyColorAt(startX + x, startY + y, checkerboard), color) : color
      displayPixels[offset] = displayColor.r
      displayPixels[offset + 1] = displayColor.g
      displayPixels[offset + 2] = displayColor.b
      displayPixels[offset + 3] = displayColor.a
    }
    sourceContext.putImageData(new ImageData(displayPixels as Uint8ClampedArray<ArrayBuffer>, sourcePixelCount, sourcePixelCount), 0, 0)
    // Keep the sampled point fixed under the center pointer while the pixel
    // field follows sub-pixel pointer movement continuously. Drawing one
    // nearest-neighbour source bitmap avoids antialiased gaps between blocks.
    const sourceLeft = size / 2 + (startX - point.x) * pixelScale
    const sourceTop = size / 2 + (startY - point.y) * pixelScale
    if (!eyedropperMagnifierDistortionEnabled) {
      context.drawImage(sourceCanvas, sourceLeft, sourceTop, sourcePixelCount * pixelScale, sourcePixelCount * pixelScale)
    } else {
      const outputWidth = magnifierCanvas.width
      const outputHeight = magnifierCanvas.height
      const distortedPixels = new Uint8ClampedArray(outputWidth * outputHeight * 4)
      const outputCenter = size / 2
      // The 64 px material is displayed at an exact 4x scale. Its inner
      // opening has a 25 px radius, so the lens edge is exactly 100 CSS px.
      const outputRadius = 100
      for (let y = 0; y < outputHeight; y += 1) for (let x = 0; x < outputWidth; x += 1) {
        const outputX = (x + 0.5) / dpr
        const outputY = (y + 0.5) / dpr
        const normalizedX = (outputX - outputCenter) / outputRadius
        const normalizedY = (outputY - outputCenter) / outputRadius
        const rawRadius = Math.hypot(normalizedX, normalizedY)
        const radius = Math.min(1, rawRadius)
        const outputOffset = (y * outputWidth + x) * 4
        if (rawRadius <= 0.82) {
          const directSourceX = Math.floor((outputX - sourceLeft) / pixelScale)
          const directSourceY = Math.floor((outputY - sourceTop) / pixelScale)
          if (directSourceX < 0 || directSourceY < 0 || directSourceX >= sourcePixelCount || directSourceY >= sourcePixelCount) continue
          const directOffset = (directSourceY * sourcePixelCount + directSourceX) * 4
          distortedPixels[outputOffset] = displayPixels[directOffset]
          distortedPixels[outputOffset + 1] = displayPixels[directOffset + 1]
          distortedPixels[outputOffset + 2] = displayPixels[directOffset + 2]
          distortedPixels[outputOffset + 3] = displayPixels[directOffset + 3]
          continue
        }
        // Preserve most of the lens as an exact hard-edge magnification. Optical
        // distortion, dispersion and diffuse light are restricted to the rim.
        const edgeProgress = Math.max(0, Math.min(1, (radius - 0.82) / 0.18))
        const edgeCurve = edgeProgress * edgeProgress * (3 - 2 * edgeProgress)
        const lensFactor = 1 + edgeCurve * 0.14
        const mappedX = outputCenter + (outputX - outputCenter) * lensFactor
        const mappedY = outputCenter + (outputY - outputCenter) * lensFactor
        const sourceX = Math.floor((mappedX - sourceLeft) / pixelScale)
        const sourceY = Math.floor((mappedY - sourceTop) / pixelScale)
        if (sourceX < 0 || sourceY < 0 || sourceX >= sourcePixelCount || sourceY >= sourcePixelCount) continue
        const sourceOffset = (sourceY * sourcePixelCount + sourceX) * 4
        let red = displayPixels[sourceOffset]
        let green = displayPixels[sourceOffset + 1]
        let blue = displayPixels[sourceOffset + 2]
        if (edgeCurve > 0 && radius > 0) {
          const radialX = normalizedX / radius
          const radialY = normalizedY / radius
          const scatterDistance = edgeCurve * 6
          const redX = Math.floor((mappedX + radialX * scatterDistance - sourceLeft) / pixelScale)
          const redY = Math.floor((mappedY + radialY * scatterDistance - sourceTop) / pixelScale)
          const blueX = Math.floor((mappedX - radialX * scatterDistance - sourceLeft) / pixelScale)
          const blueY = Math.floor((mappedY - radialY * scatterDistance - sourceTop) / pixelScale)
          if (redX >= 0 && redY >= 0 && redX < sourcePixelCount && redY < sourcePixelCount) red = displayPixels[(redY * sourcePixelCount + redX) * 4]
          if (blueX >= 0 && blueY >= 0 && blueX < sourcePixelCount && blueY < sourcePixelCount) blue = displayPixels[(blueY * sourcePixelCount + blueX) * 4 + 2]
          // Add a restrained inner-rim shadow. It starts outside the untouched
          // center and is slightly heavier toward the lower-right edge.
          const directionalShade = Math.max(0, (radialX + radialY) * Math.SQRT1_2)
          const lowerEdgeShade = Math.max(0, radialY)
          const rimShadow = edgeCurve * (0.028 + directionalShade * 0.09 + lowerEdgeShade * 0.035)
          red *= 1 - rimShadow
          green *= 1 - rimShadow
          blue *= 1 - rimShadow
        }
        distortedPixels[outputOffset] = red
        distortedPixels[outputOffset + 1] = green
        distortedPixels[outputOffset + 2] = blue
        distortedPixels[outputOffset + 3] = displayPixels[sourceOffset + 3]
      }
      context.putImageData(new ImageData(distortedPixels as Uint8ClampedArray<ArrayBuffer>, outputWidth, outputHeight), 0, 0)
      // Composite the untouched center with the same scale as the rim sampler.
      // Using a fixed 17-pixel crop here made the lens shrink once the canvas
      // itself was zoomed beyond the old baseline magnification.
      context.save()
      context.beginPath()
      context.arc(outputCenter, outputCenter, 82, 0, Math.PI * 2)
      context.clip()
      context.drawImage(sourceCanvas, sourceLeft, sourceTop, sourcePixelCount * pixelScale, sourcePixelCount * pixelScale)
      context.restore()
    }
    const pointerImage = colorLuminance(sampled) < 145 ? eyedropperPointerLightRef.current : eyedropperPointerDarkRef.current
    if (pointerImage?.complete && pointerImage.naturalWidth > 0) {
      context.globalAlpha = .5
      context.drawImage(pointerImage, Math.round(size / 2 - pointerImage.naturalWidth / 2), Math.round(size / 2 - pointerImage.naturalHeight / 2))
      context.globalAlpha = 1
    } else {
      context.fillStyle = colorLuminance(sampled) < 145 ? 'rgba(255, 255, 255, .5)' : 'rgba(0, 0, 0, .5)'
      context.fillRect(Math.floor(size / 2), Math.floor(size / 2) - 5, 1, 11)
      context.fillRect(Math.floor(size / 2) - 5, Math.floor(size / 2), 11, 1)
    }
    magnifier.hidden = false
  }

  const distanceToSegment = (point: Point, start: Point, end: Point): number => {
    const dx = end.x - start.x
    const dy = end.y - start.y
    const lengthSquared = dx * dx + dy * dy
    if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y)
    const ratio = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared))
    return Math.hypot(point.x - (start.x + ratio * dx), point.y - (start.y + ratio * dy))
  }

  const symmetryAxisHitAt = (clientX: number, clientY: number, ctrlHeld = false): SymmetryAxis | 'center' | null => {
    if (!symmetryAxisDragAllowed(symmetryAxisPreferences.locked, ctrlHeld) || !hasSymmetry(session.symmetryAxes)) return null
    const point = localContinuousPointAt(clientX, clientY)
    if (!point) return null
    const centerDistance = Math.hypot(point.x - symmetryCenter.x, point.y - symmetryCenter.y)
    const centerRadius = Math.max(0.35, 9 / liveViewRef.current.zoom)
    if (centerDistance <= centerRadius) return 'center'
    const lineRadius = Math.max(0.25, Math.max(7, symmetryAxisPreferences.thickness / 2 + 4) / liveViewRef.current.zoom)
    let best: { axis: SymmetryAxis; distance: number } | null = null
    for (const axis of (['horizontal', 'vertical', 'diagonalUp', 'diagonalDown'] as SymmetryAxis[])) {
      if (!symmetryGuideAxisEnabled(session.symmetryAxes, axis)) continue
      const segment = symmetryAxisSegment(axis, session.document.width, session.document.height, symmetryCenter)
      if (!segment) continue
      const distance = distanceToSegment(point, segment.start, segment.end)
      if (distance <= lineRadius && (!best || distance < best.distance)) best = { axis, distance }
    }
    return best?.axis ?? null
  }

  const topEditableLayerAt = (point: Point) => {
    const layerById = new Map(session.document.layers.map((layer) => [layer.id, layer]))
    for (const layerId of layerIdsInVisualStackOrder(session.document.layers, session.document.groups)) {
      const layer = layerById.get(layerId)
      if (!layer) continue
      if (!isLayerEffectivelyVisible(session.document, layer) || isLayerEffectivelyLocked(session.document, layer)) continue
      if (readLayerVisibleColorAt(session.document, layer, point.x, point.y).a > 0) return layer
    }
    return null
  }

  const alignmentTargetBoundsForLayers = (excludedLayerIds: readonly string[] = []): SelectionRect[] => {
    const excluded = new Set(excludedLayerIds)
    return session.document.layers.flatMap((layer) => {
      if (excluded.has(layer.id) || !isLayerEffectivelyVisible(session.document, layer)) return []
      const bounds = layerContentBounds(session.document, layer)
      return bounds ? [bounds] : []
    })
  }

  const alignmentDragFields = (movingBounds: readonly SelectionRect[], excludedLayerIds: readonly string[] = [], snapToGridOrigin = false) => ({
    alignmentMovingBounds: movingBounds.map((bounds) => ({ ...bounds })),
    alignmentTargetBounds: alignmentTargetBoundsForLayers(excludedLayerIds),
    alignmentGridEnabled: alignmentPreferences.gridAlignmentEnabled,
    alignmentSnapToGridOrigin: snapToGridOrigin,
    alignmentSmartEnabled: alignmentPreferences.smartAlignmentEnabled,
    alignmentThreshold: alignmentPreferences.alignmentThreshold
  })

  const sameAlignmentGuides = (left: DragState['alignmentGuides'], right: DragState['alignmentGuides']): boolean => {
    if ((left?.length ?? 0) !== (right?.length ?? 0)) return false
    return (left ?? []).every((guide, index) => {
      const candidate = right?.[index]
      return Boolean(candidate && candidate.axis === guide.axis && candidate.position === guide.position && candidate.source === guide.source)
    })
  }

  const alignedDragTranslation = (drag: DragState, distance: Point): Point => {
    const gridEnabled = drag.alignmentGridEnabled === true && session.view.showGrid
    const snappedDistance = drag.alignmentSnapToGridOrigin && gridEnabled
      ? snapSelectionTranslationToGrid(drag.alignmentMovingBounds ?? [], distance, session.view.grid ?? DEFAULT_GRID_SETTINGS)
      : distance
    const result = resolveAlignment({
      movingBounds: drag.alignmentMovingBounds ?? [],
      targetBounds: drag.alignmentTargetBounds,
      delta: snappedDistance,
      canvasWidth: session.document.width,
      canvasHeight: session.document.height,
      grid: session.view.grid ?? DEFAULT_GRID_SETTINGS,
      gridEnabled: drag.alignmentSnapToGridOrigin ? false : gridEnabled,
      smartEnabled: drag.alignmentSmartEnabled === true,
      threshold: alignmentThresholdForZoom(drag.alignmentThreshold ?? alignmentPreferences.alignmentThreshold, liveViewRef.current.zoom),
      lockedAxis: drag.axisLock
    })
    if (!sameAlignmentGuides(drag.alignmentGuides, result.guides)) {
      drag.alignmentGuides = result.guides
      scheduleDraw()
    }
    return result.offset
  }

  const hideMoveLayerContentPreview = (delayMs = 0): void => {
    if (moveLayerContentPreviewTimerRef.current !== null) window.clearTimeout(moveLayerContentPreviewTimerRef.current)
    moveLayerContentPreviewTimerRef.current = null
    if (!moveLayerContentPreviewRef.current) return
    if (delayMs > 0) {
      moveLayerContentPreviewTimerRef.current = window.setTimeout(() => {
        moveLayerContentPreviewRef.current = null
        moveLayerContentPreviewTimerRef.current = null
        scheduleDraw()
      }, delayMs)
      return
    }
    moveLayerContentPreviewRef.current = null
    scheduleDraw()
  }

  const showMoveLayerContentPreview = (layer: RasterLayer): void => {
    if (!moveLayerContentPreviewEnabled) return
    const bounds = layerContentBounds(session.document, layer)
    if (!bounds) {
      hideMoveLayerContentPreview()
      return
    }
    if (moveLayerContentPreviewTimerRef.current !== null) window.clearTimeout(moveLayerContentPreviewTimerRef.current)
    moveLayerContentPreviewTimerRef.current = null
    moveLayerContentPreviewRef.current = {
      layerId: layer.id,
      bounds,
      layerOffsetX: layer.offsetX,
      layerOffsetY: layer.offsetY
    }
    scheduleDraw()
  }

  const flashMoveLayer = (layer: RasterLayer): void => {
    if (!moveLayerClickFlashEnabled) return
    const bounds = layerContentBounds(session.document, layer)
    if (!bounds) return
    if (moveLayerClickFlashTimerRef.current !== null) window.clearTimeout(moveLayerClickFlashTimerRef.current)
    moveLayerClickFlashRef.current = {
      layerId: layer.id,
      bounds,
      layerOffsetX: layer.offsetX,
      layerOffsetY: layer.offsetY,
      expiresAt: performance.now() + moveLayerClickFlashDuration
    }
    scheduleDraw()
    moveLayerClickFlashTimerRef.current = window.setTimeout(() => {
      moveLayerClickFlashRef.current = null
      moveLayerClickFlashTimerRef.current = null
      scheduleDraw()
    }, moveLayerClickFlashDuration)
  }

  const selectionHitAt = (clientX: number, clientY: number): SelectionHit => {
    const currentSession = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id) ?? session
    const textBox = currentSession.textBoxTransform?.bounds ?? selectedTextBoxForSession(currentSession)
    if ((!currentSession.selection && !textBox) || !canvasRef.current) return 'outside'
    const size = stageSize()
    const point = documentPointFromViewportPointContinuous(stagePoint(clientX, clientY), size.width, size.height, currentSession.document.width, currentSession.document.height, liveViewRef.current, rotationIndicatorPosition)
    if (textBox) {
      const resizeHit = selectionResizeHit(textBox, point, 12 / Math.max(0.0001, liveViewRef.current.zoom), 18 / Math.max(0.0001, liveViewRef.current.zoom), 5 / Math.max(0.0001, liveViewRef.current.zoom))
      if (resizeHit) return resizeHit
      return point.x >= textBox.x && point.x <= textBox.x + textBox.width && point.y >= textBox.y && point.y <= textBox.y + textBox.height ? 'inside' : 'outside'
    }
    const floating = currentSession.pendingPaste
    const selection = currentSession.selection
    if (!selection) return 'outside'
    const hitAt = (candidate: Point): SelectionHit => {
      if (currentSession.freeTransformActive) {
        const target = freeTransformQuadForSession(currentSession) ?? (floating?.transformTarget ?? selection)
        const corner = selectionFreeTransformHit(
          target,
          'nw' in target ? 0 : floating?.transformAngle ?? 0,
          'nw' in target ? undefined : floating?.transformShear,
          candidate,
          liveViewRef.current.zoom
        )
        if (corner) return corner
        const quad = 'nw' in target
          ? target
          : selectionQuadFromRect(target, floating?.transformAngle ?? 0, floating?.transformShear)
        if (selectionFreeTransformContentHit(selection, quad, candidate)) return 'inside'
        // Free transform exposes only corner handles for reshaping. Points
        // outside the frame do not fall through to the regular
        // resize/shear/rotation pipeline; transparent holes remain movable
        // because the frame, rather than the mask, owns the hit test.
        return 'outside'
      }
      return floating?.transformTarget
        ? selectionTransformedInteractionHit(
          selection,
          floating.transformTarget,
          floating.transformAngle ?? 0,
          floating.transformShear,
          candidate,
          liveViewRef.current.zoom
        )
        : selectionInteractionHit(selection, candidate, liveViewRef.current.zoom)
    }
    const directHit = hitAt(point)
    if (directHit !== 'outside') return directHit
    const mapped = tileRepeatMappedPointForCopies(
      point,
      currentSession.document.width,
      currentSession.document.height,
      liveViewRef.current.tileRepeatMode ?? 'off'
    )
    return mapped ? hitAt(mapped.local) : 'outside'
  }

  const selectionHit = (event: React.PointerEvent<HTMLCanvasElement>): SelectionHit => selectionHitAt(event.clientX, event.clientY)

  const cloneSelectionQuad = (quad: SelectionQuad | null | undefined): SelectionQuad | null => quad
    ? {
        nw: { ...quad.nw },
        ne: { ...quad.ne },
        se: { ...quad.se },
        sw: { ...quad.sw }
      }
    : null

  const selectionSourceQuadForCanvas = (drag: DragState): SelectionQuad | undefined => {
    const sourceQuad = drag.selectionSource?.sourceQuad
    if (!sourceQuad) return undefined
    const origin = drag.freeTileSelectionTransform ? drag.freeTileEditOrigin : undefined
    const offsetX = origin?.x ?? 0
    const offsetY = origin?.y ?? 0
    return {
      nw: { x: sourceQuad.nw.x + offsetX, y: sourceQuad.nw.y + offsetY },
      ne: { x: sourceQuad.ne.x + offsetX, y: sourceQuad.ne.y + offsetY },
      se: { x: sourceQuad.se.x + offsetX, y: sourceQuad.se.y + offsetY },
      sw: { x: sourceQuad.sw.x + offsetX, y: sourceQuad.sw.y + offsetY }
    }
  }

  const freeTransformQuadForSession = (currentSession: DocumentSession): SelectionQuad | null => {
    const selection = currentSession.selection
    if (!selection) return null
    const pending = currentSession.pendingPaste
    const persisted = pending?.transformQuad ?? currentSession.freeTransformQuad
    if (persisted) return cloneSelectionQuad(persisted)
    const target = pending?.transformTarget ?? selection
    return selectionQuadFromRect(target, pending?.transformAngle ?? 0, pending?.transformShear)
  }

  const selectionPivotForSession = (currentSession: DocumentSession): Point | null => {
    const selection = currentSession.selection
    if (!selection) return null
    const floating = currentSession.pendingPaste
    const target = floating?.transformTarget ?? selection
    return currentSession.selectionPivot
      ? { ...currentSession.selectionPivot }
      : transformedSelectionPivotPreset(target, 'center', floating?.transformAngle ?? 0, floating?.transformShear)
  }

  const selectionPivotHitAt = (clientX: number, clientY: number): boolean => {
    const currentSession = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id) ?? session
    if (currentSession.view.showSelectionPivot === false) return false
    const pivot = selectionPivotForSession(currentSession)
    if (!pivot) return false
    return selectionPivotHit(displayedSelectionPoint(pivot), stagePoint(clientX, clientY))
  }

  const rotationCursorForHit = (hit: SelectionRotationHandle): string => {
    const currentSession = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id) ?? session
    const floating = currentSession.pendingPaste
    const target = floating?.transformTarget ?? currentSession.selection
    if (!target) return rotationCursors[hit]
    const points = transformedSelectionControlPoints(target, floating?.transformAngle ?? 0, floating?.transformShear)
    const cornerIndex: Record<SelectionRotationHandle, number> = { 'rotate-nw': 0, 'rotate-ne': 2, 'rotate-sw': 5, 'rotate-se': 7 }
    const center = currentSession.selectionPivot
      ?? transformedSelectionPivotPreset(target, 'center', floating?.transformAngle ?? 0, floating?.transformShear)
    const displayedCorner = displayedSelectionPoint(points[cornerIndex[hit]])
    const displayedCenter = displayedSelectionPoint(center)
    return rotationCursors[selectionRotationCursorForPosition(displayedCorner, displayedCenter)]
  }

  const displayedResizeCursorForHandle = (hit: SelectionHandle, contentRotation = 0): string => {
    const view = liveViewRef.current
    return directionalResizeCursors[selectionResizeCursorForHandle(
      hit,
      contentRotation,
      view.rotation,
      Boolean(view.mirrored),
      Boolean(view.mirroredVertical)
    )]
  }

  const resizeCursorForTransform = (
    hit: SelectionHandle,
    target: SelectionRect,
    angle = 0,
    shear?: SelectionShearTransform
  ): string => {
    const displayedPoints = transformedSelectionControlPoints(target, angle, shear).map(displayedSelectionPoint)
    const cornerCursor = selectionCornerResizeCursorForPoints(hit, displayedPoints)
    return cornerCursor ? directionalResizeCursors[cornerCursor] : displayedResizeCursorForHandle(hit, angle)
  }

  const resizeCursorForHit = (hit: SelectionHandle): string => {
    const currentSession = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id) ?? session
    const floating = currentSession.pendingPaste
    const target = floating?.transformTarget ?? currentSession.selection
    return target
      ? resizeCursorForTransform(hit, target, floating?.transformAngle ?? 0, floating?.transformShear)
      : displayedResizeCursorForHandle(hit)
  }

  const shearCursorForTransform = (
    hit: SelectionShearHandle,
    target: SelectionRect,
    angle = 0,
    shear?: SelectionShearTransform
  ): string => {
    const edge = hit.slice(-1) as 'n' | 'e' | 's' | 'w'
    const direction = transformedSelectionShearDirection(target, angle, shear, edge)
    if (!direction) return shearCursors[hit]
    const origin = transformedSelectionCenter(target, angle, shear)
    const displayedOrigin = displayedSelectionPoint(origin)
    const displayedDirection = displayedSelectionPoint({ x: origin.x + direction.x, y: origin.y + direction.y })
    return directionalShearCursors[selectionShearCursorForDirection({
      x: displayedDirection.x - displayedOrigin.x,
      y: displayedDirection.y - displayedOrigin.y
    })]
  }

  const shearCursorForHit = (hit: SelectionShearHandle): string => {
    const currentSession = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id) ?? session
    const floating = currentSession.pendingPaste
    const target = floating?.transformTarget ?? currentSession.selection
    return target
      ? shearCursorForTransform(hit, target, floating?.transformAngle ?? 0, floating?.transformShear)
      : shearCursors[hit]
  }

  const selectionTransformCursorForDrag = (drag: DragState): string | null => {
    if (drag.kind === 'transform-content' && drag.handle) {
      const target = drag.previewTarget ?? drag.transformStartTarget ?? drag.selectionStart
      if (target) return resizeCursorForTransform(drag.handle, target, drag.previewAngle ?? drag.startAngle ?? 0, drag.previewShear ?? drag.transformStartShear)
      return displayedResizeCursorForHandle(drag.handle, drag.previewAngle ?? drag.startAngle ?? 0)
    }
    if (drag.kind === 'shear-content' && drag.shearHandle) {
      const target = drag.previewTarget ?? drag.transformStartTarget ?? drag.selectionStart
      if (target) return shearCursorForTransform(drag.shearHandle, target, drag.previewAngle ?? drag.startAngle ?? 0, drag.previewShear ?? drag.transformStartShear)
    }
    if (drag.kind === 'rotate-content') {
      const target = drag.previewTarget ?? drag.transformStartTarget ?? drag.selectionStart
      if (target) {
        const angle = drag.previewAngle ?? drag.startAngle ?? 0
        const pivot = drag.previewPivot ?? drag.selectionPivotStart ?? transformedSelectionPivotPreset(target, 'center', angle, drag.previewShear ?? drag.transformStartShear)
        return rotationCursors[selectionRotationCursorForPosition(displayedSelectionPoint(drag.last), displayedSelectionPoint(pivot))]
      }
    }
    return selectionTransformDragCursor(drag.kind)
  }

  const canvasResizeHitAt = (clientX: number, clientY: number): DragState['canvasEdge'] | null => {
    const preview = canvasResizePreviewRef.current
    const canvas = canvasRef.current
    if (!preview || !canvas) return null
    const size = stageSize()
    const view = liveViewRef.current
    const originX = size.width / 2 + view.panX - session.document.width * view.zoom / 2
    const originY = size.height / 2 + view.panY - session.document.height * view.zoom / 2
    const left = originX - preview.offsetX * view.zoom
    const top = originY - preview.offsetY * view.zoom
    const right = left + preview.width * view.zoom
    const bottom = top + preview.height * view.zoom
    const unrotated = unrotatedStagePoint(clientX, clientY)
    const x = unrotated.x; const y = unrotated.y
    const radius = 8
    const nearLeft = Math.abs(x - left) <= radius; const nearRight = Math.abs(x - right) <= radius
    const nearTop = Math.abs(y - top) <= radius; const nearBottom = Math.abs(y - bottom) <= radius
    if (nearTop && nearLeft) return 'nw'; if (nearTop && nearRight) return 'ne'; if (nearBottom && nearLeft) return 'sw'; if (nearBottom && nearRight) return 'se'
    if (nearTop && x >= left && x <= right) return 'n'; if (nearBottom && x >= left && x <= right) return 's'
    if (nearLeft && y >= top && y <= bottom) return 'w'; if (nearRight && y >= top && y <= bottom) return 'e'
    return null
  }

  const canvasResizeHit = (event: React.PointerEvent<HTMLCanvasElement>): DragState['canvasEdge'] | null => canvasResizeHitAt(event.clientX, event.clientY)

  const canvasResizeContainsAt = (clientX: number, clientY: number): boolean => {
    const preview = canvasResizePreviewRef.current
    const canvas = canvasRef.current
    if (!preview || !canvas) return false
    const size = stageSize()
    const view = liveViewRef.current
    const originX = size.width / 2 + view.panX - session.document.width * view.zoom / 2
    const originY = size.height / 2 + view.panY - session.document.height * view.zoom / 2
    const left = originX - preview.offsetX * view.zoom
    const top = originY - preview.offsetY * view.zoom
    const unrotated = unrotatedStagePoint(clientX, clientY)
    const x = unrotated.x
    const y = unrotated.y
    return x >= left && x <= left + preview.width * view.zoom && y >= top && y <= top + preview.height * view.zoom
  }


  const canvasResizeContains = (event: React.PointerEvent<HTMLCanvasElement>): boolean => canvasResizeContainsAt(event.clientX, event.clientY)

  const sliceScreenBox = (slice: SelectionRect): SelectionRect => {
    const size = stageSize()
    const view = liveViewRef.current
    const originX = size.width / 2 + view.panX - session.document.width * view.zoom / 2
    const originY = size.height / 2 + view.panY - session.document.height * view.zoom / 2
    return { x: originX + slice.x * view.zoom, y: originY + slice.y * view.zoom, width: slice.width * view.zoom, height: slice.height * view.zoom }
  }

  const sliceHandleAt = (clientX: number, clientY: number, slice: SelectionRect): SelectionHandle | null =>
    selectionResizeHit(sliceScreenBox(slice), unrotatedStagePoint(clientX, clientY), 6, 8, 3)

  const cursorCompositePointSamplerFor = (currentSession: DocumentSession): ((x: number, y: number) => RgbaColor) => {
    const document = currentSession.document
    const activeLayerId = document.activeLayerId
    const backgroundLayersKey = document.layers.filter((layer) => Boolean(layer.background)).map((layer) => layer.id).join('\0')
    const cached = cursorCompositePointSamplerRef.current
    if (cached
      && cached.document === document
      && cached.revision === currentSession.revision
      && cached.activeLayerId === activeLayerId
      && cached.backgroundLayersKey === backgroundLayersKey) return cached.sampler

    const hasBackground = backgroundLayersKey.length > 0
    const activeBackground = document.layers.some((layer) => layer.id === activeLayerId && Boolean(layer.background))
    // Keep sampleCompositeColor's background rule while compiling only once
    // for this document revision. The sampler still reads live pixel storage,
    // so an in-progress stroke does not need to rebuild the layer tree.
    const samplingDocument = activeBackground || !hasBackground
      ? document
      : { ...document, layers: document.layers.filter((layer) => !layer.background) }
    const sampler = createNormalCompositePointSampler(samplingDocument) ?? createCompositePointSampler(samplingDocument)
    cursorCompositePointSamplerRef.current = { document, revision: currentSession.revision, activeLayerId, backgroundLayersKey, sampler }
    return sampler
  }

  const cursorCompositePointReplacementSamplerFor = (currentSession: DocumentSession, layerId: string): ((x: number, y: number, replacement: RgbaColor) => RgbaColor) => {
    const document = currentSession.document
    const cached = cursorCompositePointReplacementSamplerRef.current
    if (cached && cached.document === document && cached.revision === currentSession.revision && cached.layerId === layerId) return cached.sampler
    const sampler = createNormalCompositePointReplacementSampler(document, layerId) ?? createCompositePointReplacementSampler(document, layerId)
    cursorCompositePointReplacementSamplerRef.current = { document, revision: currentSession.revision, layerId, sampler }
    return sampler
  }

  const updateCursorAt = (clientX: number, clientY: number, ctrlKey: boolean, altKey: boolean, shiftKey = false): void => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (inputRef.current.spaceHeld) {
      inputRef.current.sampling = false
      const drag = inputRef.current.drag
      canvas.style.cursor = drag?.kind === 'marquee'
        ? selectionCreationCursor(selectionCrosshair, selectionInteractionEditable)
        : drag?.kind === 'shape' ? canvasToolCursor(session.tool, session.primaryColor)
        : drag?.kind === 'pan' ? canvasCursors.grabbing : canvasCursors.grab
      return
    }
    const liveCursorSession = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id) ?? session
    const liveCursorGroupSelected = liveCursorSession.selectedGroupIds.length > 0 || Boolean(liveCursorSession.selectedGroupId)
    if (liveCursorGroupSelected && !isToolAvailableForSession(liveCursorSession, liveCursorSession.tool) && !isCanvasViewNavigationDrag(inputRef.current.drag)) {
      inputRef.current.sampling = false
      canvas.style.cursor = canvasCursors.unavailable
      return
    }
    const viewNavigationDrag = inputRef.current.drag
    if (isCanvasViewNavigationTool(liveCursorSession.tool)) {
      inputRef.current.sampling = false
      canvas.style.cursor = viewNavigationDrag?.kind === 'pan'
        ? canvasCursors.grabbing
        : canvasToolCursor(liveCursorSession.tool, liveCursorSession.primaryColor)
      return
    }
    const activeResizePreview = canvasResizePreviewRef.current
    if (activeResizePreview) {
      inputRef.current.sampling = false
      inputRef.current.shiftLinePreview = false
      const drag = inputRef.current.drag
      const resizeEdge = drag?.kind === 'canvas-resize' ? drag.canvasEdge : canvasResizeHitAt(clientX, clientY)
      if (resizeEdge) canvas.style.cursor = displayedResizeCursorForHandle(resizeEdge as SelectionHandle)
      else if (drag?.kind === 'canvas-move') canvas.style.cursor = canvasCursors.move
      else canvas.style.cursor = canvasResizeContainsAt(clientX, clientY) ? canvasCursors.move : canvasCursors.unavailable
      return
    }
    const cursorSession = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id) ?? session
    const freeTransformActive = cursorSession.freeTransformActive === true
    const activeDrag = inputRef.current.drag
    // A gradient gesture owns the pointer for its entire drag. In particular,
    // Alt must not turn it into the eyedropper while the gesture is active.
    if (activeDrag?.kind === 'gradient') {
      inputRef.current.sampling = false
      canvas.style.cursor = canvasToolCursor(cursorSession.tool, cursorSession.primaryColor)
      return
    }
    // Free transform exposes corner handles for reshaping and keeps the
    // regular move gesture available over the selected content.
    if (freeTransformActive && activeDrag?.freeTransform !== true) {
      const hit = selectionHitAt(clientX, clientY)
      inputRef.current.sampling = false
      canvas.style.cursor = hit in resizeCursors
        ? resizeCursorForHit(hit as SelectionHandle)
        : hit === 'inside' ? canvasCursors.move : canvasCursors.unavailable
      return
    }
    const brushSizeAdjustmentPreviewActive = Boolean(inputRef.current.modifierBrushSize)
    if (!inputRef.current.drag && !brushSizeAdjustmentPreviewActive && !session.animationPlaying && symmetryAxisHitAt(clientX, clientY, ctrlKey)) {
      inputRef.current.sampling = false
      canvas.style.cursor = canvasCursors.move
      return
    }
    // During a pointer drag the cursor is already determined by the gesture.
    // Do this before composite sampling: sampling creates a compiled layer-tree
    // reader and was needlessly paid on every marquee/lasso pointer move.
    const drag = inputRef.current.drag
    if (drag?.kind === 'move-content' || drag?.kind === 'move-selection') {
      inputRef.current.sampling = false
      canvas.style.cursor = drag.kind === 'move-content'
        ? drag.copy && !drag.floatingPaste ? canvasCursors.copy : canvasCursors.move
        : canvasCursors.selectionMove
      return
    }
    if (drag?.kind === 'move-layer') {
      inputRef.current.sampling = false
      canvas.style.cursor = drag.duplicateOnDrag ? canvasCursors.copy : canvasCursors.move
      return
    }
    if (drag?.kind === 'create-slice' || drag?.kind === 'move-slice' || drag?.kind === 'resize-slice') {
      inputRef.current.sampling = false
      canvas.style.cursor = drag.kind === 'resize-slice' && drag.handle ? displayedResizeCursorForHandle(drag.handle) : drag.kind === 'move-slice' ? drag.copy ? canvasCursors.copy : canvasCursors.move : selectionCreationCursor(selectionCrosshair)
      return
    }
    if (drag?.kind === 'transform-text-box') {
      inputRef.current.sampling = false
      canvas.style.cursor = drag.handle ? displayedResizeCursorForHandle(drag.handle) : canvasCursors.move
      return
    }
    const temporaryMoveRequested = temporaryMoveActive({ ctrlKey, metaKey: false, altKey, shiftKey })
    const transformCursor = drag?.kind === 'move-selection-pivot' ? canvasCursors.move : drag && selectionTransformCursorForDrag(drag)
    if (transformCursor) {
      inputRef.current.sampling = false
      canvas.style.cursor = transformCursor
      return
    }
    if (drag?.kind === 'marquee' || drag?.kind === 'lasso' || drag?.kind === 'polygon-lasso' || drag?.kind === 'magic-preview') {
      inputRef.current.sampling = false
      canvas.style.cursor = selectionCreationCursor(selectionCrosshair, selectionInteractionEditable)
      return
    }
    if (drag?.kind === 'shape') {
      inputRef.current.sampling = false
      canvas.style.cursor = canvasToolCursor(session.tool, session.primaryColor)
      return
    }
    const point = localPointAt(clientX, clientY)
    const insideDocument = Boolean(point && point.x >= 0 && point.y >= 0 && point.x < session.document.width && point.y < session.document.height)
    const mask = activeLayerMask(session)
    const cursorSampleProbe = window.__moonSpriteCanvasProbe
    const cursorSampleStartedAt = cursorSampleProbe?.recordOperationStage ? performance.now() : 0
    let contrastColor = insideDocument && point
      ? mask ? readLayerMaskDisplayColorAt(mask, point.x, point.y) : cursorCompositePointSamplerFor(session)(point.x, point.y)
      : session.primaryColor
    cursorSampleProbe?.recordOperationStage?.('cursor.composite-sample', performance.now() - cursorSampleStartedAt)
    if (insideDocument && point && activeLayerEditable && previewCursorTools.has(session.tool) && (!session.selection || selectionContains(session.selection, point.x, point.y))) {
      const layer = activePaintLayer(session)
      if (!isLayerEffectivelyLocked(session.document, layer)) {
        const index = point.y * session.document.width + point.x
        const source = session.tool === 'eraser' ? TRANSPARENT : session.primaryColor
        const replacement = source.a > 0 && source.a < 255 ? blendOver(readLayerColor(session.document, layer, index), source) : source
        const resolvedReplacement = resolveLayerCanvasColor(session.document, layer, replacement)
        const replacementSampleStartedAt = cursorSampleProbe?.recordOperationStage ? performance.now() : 0
        contrastColor = mask ? layerMaskDisplayColor(resolvedReplacement) : cursorCompositePointReplacementSamplerFor(session, layer.id)(point.x, point.y, resolvedReplacement)
        cursorSampleProbe?.recordOperationStage?.('cursor.replacement-sample', performance.now() - replacementSampleStartedAt)
      }
    }
    if (insideDocument && point && contrastColor.a < 255) contrastColor = blendOver(transparencyColorAt(point.x, point.y, checkerboard), contrastColor)
    const altActive = inputRef.current.altHeld || altKey
    const ctrlActive = inputRef.current.ctrlHeld || ctrlKey
    const brushSizeTool = session.tool === 'pencil' || session.tool === 'airbrush' || session.tool === 'eraser'
    const modifierSizing = brushSizeAdjustmentPreviewActive || ((activeLayer.kind !== 'tilemap' || session.tilemapMode !== 'paint') && modifierActive({ ctrlKey, metaKey: false, altKey, shiftKey }, 'brushSizeAdjust') && brushSizeTool)
    const wheelSizing = wheelBrushSizePreviewRef.current && brushSizeTool
    const selectedTextBox = selectedTextBoxForSession(session)
    const rawSelectionHit = session.tool === 'selection' || selectedTextBox ? selectionHitAt(clientX, clientY) : 'outside'
    const selectionPivotHovered = !freeTransformActive && !ctrlActive && !altActive && !shiftKey && selectionPivotHitAt(clientX, clientY)
    const addingToSelection = Boolean(session.selection && shiftKey)
    const temporaryMove = !freeTransformActive && temporaryMoveRequested && temporaryMoveForCanvasInteractionAllowed(
      session.tool,
      session.moveKind,
      rawSelectionHit,
      addingToSelection
    )
    const selectionModifierActive = shiftKey
    const selectionHit = selectionModifierActive ? 'outside' : session.selectionMode === 'replace' || session.selectionMode === 'add' || rawSelectionHit !== 'inside' ? rawSelectionHit : 'outside'
    const centeredSelectionResize = session.tool === 'selection' && selectionHit in resizeCursors
    const moveToolActive = session.tool === 'move' || temporaryMove
    const moveCopyAvailable = moveToolActive && insideDocument && Boolean(session.moveAutoSelect ? (point && (topEditableLayerAt(point) ?? (activeLayerEditable ? getActiveLayer(session.document) : null))) : activeLayerEditable)
    const selectionCopyAvailable = session.tool === 'selection' && !altActive && ctrlActive && selectionHitStartsContentMove(selectionHit, true) && selectionLayersEditable && (!session.pendingPaste || shouldRestartFloatingSelectionForCopy(session.pendingPaste.copy, true))
    const copyAvailable = (altActive && moveCopyAvailable) || selectionCopyAvailable
    const sampling = paletteSamplingShortcutActive() || session.tool === 'eyedropper' || (quickToolActive('eyedropper') && !centeredSelectionResize && !(moveToolActive && moveCopyAvailable) && !modifierSizing)
    inputRef.current.sampling = sampling
    const moveAvailable = insideDocument && hasSelectedMovableLayer && isToolAvailableForSession(session, 'move')
    const available = temporaryMove || (session.tool === 'move' && session.moveKind === 'move')
      ? moveAvailable
      : insideDocument && (session.tool === 'selection' ? selectionLayersEditable : activeLayerEditable)
    const resizeEdge = canvasResizeHitAt(clientX, clientY)
    if (modifierSizing || wheelSizing) canvas.style.cursor = canvasToolCursor('pencil', contrastColor)
    else if (resizeEdge) canvas.style.cursor = displayedResizeCursorForHandle(resizeEdge as SelectionHandle)
    else if (copyAvailable) canvas.style.cursor = canvasCursors.copy
    // Ctrl temporarily switches the eyedropper to the move tool. Keep this
    // cursor ahead of sampling so the visual feedback matches the gesture.
    else if (temporaryMove) canvas.style.cursor = available ? canvasCursors.move : canvasCursors.unavailable
    else if (sampling) canvas.style.cursor = canvasCursors.eyedropper
    else if (session.tool === 'text' && selectedTextBox && rawSelectionHit in resizeCursors) canvas.style.cursor = displayedResizeCursorForHandle(rawSelectionHit as SelectionHandle)
    else if (session.tool === 'text' && selectedTextBox && rawSelectionHit === 'inside') canvas.style.cursor = canvasCursors.move
    else if (session.tool === 'selection') {
      const hit = selectionHit
      canvas.style.cursor = freeTransformActive
        ? hit in resizeCursors ? resizeCursorForHit(hit as SelectionHandle) : canvasCursors.unavailable
        : selectionPivotHovered
          ? canvasCursors.default
          : hit in resizeCursors
          ? resizeCursorForHit(hit as SelectionHandle)
          : hit in shearCursors
            ? shearCursorForHit(hit as SelectionShearHandle)
            : hit in rotationCursors
              ? rotationCursorForHit(hit as SelectionRotationHandle)
              : hit === 'inside'
                ? canvasCursors.move
                : hit === 'edge'
                  ? canvasCursors.selectionMove
                  : selectionCreationCursor(selectionCrosshair, selectionInteractionEditable || selectionModifierActive)
    } else if (sliceTool) {
      const selectedIds = session.selectedSliceIds?.length ? session.selectedSliceIds : session.selectedSliceId ? [session.selectedSliceId] : []
      const selectedSlice = selectedIds.length === 1 ? session.document.slices?.find((slice) => slice.id === selectedIds[0]) : null
      const handle = selectedSlice ? sliceHandleAt(clientX, clientY, selectedSlice) : null
      const hit = point ? sliceAtPoint(session.document.slices ?? [], point.x, point.y) : null
      canvas.style.cursor = handle ? displayedResizeCursorForHandle(handle) : hit ? canvasCursors.move : selectionCreationCursor(selectionCrosshair, insideDocument)
    } else canvas.style.cursor = canvasToolCursor(session.tool, contrastColor, available)
  }

  const updateCursor = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    const rotatableDragModifierReleaseOnly = inputRef.current.drag?.kind === 'marquee' || inputRef.current.drag?.kind === 'shape'
    inputRef.current.syncModifierKeys(event, rotatableDragModifierReleaseOnly)
    const ctrlKey = rotatableDragModifierReleaseOnly ? inputRef.current.ctrlHeld : event.ctrlKey
    const altKey = rotatableDragModifierReleaseOnly ? inputRef.current.altHeld : event.altKey
    const shiftKey = rotatableDragModifierReleaseOnly ? inputRef.current.shiftHeld : event.shiftKey
    const allowOutsideCopies = Boolean((inputRef.current.drag?.kind === 'draw' || inputRef.current.drag?.kind === 'tile-draw') && (liveViewRef.current.tileRepeatMode ?? 'off') !== 'off')
    const point = localPointAt(event.clientX, event.clientY, allowOutsideCopies)
    if (point) inputRef.current.updatePointer({ point, clientX: event.clientX, clientY: event.clientY, ctrlKey, altKey })
    updateCursorAt(event.clientX, event.clientY, ctrlKey, altKey, shiftKey)
  }

  useEffect(() => {
    const pointer = inputRef.current.pointer
    if (!pointer.visible) {
      if (!inputRef.current.drag && canvasRef.current) canvasRef.current.style.cursor = inputRef.current.spaceHeld ? canvasCursors.grab : canvasToolCursor(session.tool, session.primaryColor)
      return
    }
    updateCursorAt(pointer.clientX, pointer.clientY, inputRef.current.ctrlHeld, inputRef.current.altHeld, inputRef.current.shiftHeld)
    scheduleDraw()
  // Cursor assets and the preview under a stationary pointer must change with the selected tool.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.tool, session.selectionKind, session.selectionMode, session.selection, session.freeTransformActive, session.freeTransformQuad?.nw.x, session.freeTransformQuad?.nw.y, session.freeTransformQuad?.ne.x, session.freeTransformQuad?.ne.y, session.freeTransformQuad?.se.x, session.freeTransformQuad?.se.y, session.freeTransformQuad?.sw.x, session.freeTransformQuad?.sw.y, session.pendingPaste?.transformQuad?.nw.x, session.pendingPaste?.transformQuad?.nw.y, session.pendingPaste?.transformQuad?.ne.x, session.pendingPaste?.transformQuad?.ne.y, session.pendingPaste?.transformQuad?.se.x, session.pendingPaste?.transformQuad?.se.y, session.pendingPaste?.transformQuad?.sw.x, session.pendingPaste?.transformQuad?.sw.y, session.primaryColor.r, session.primaryColor.g, session.primaryColor.b, session.primaryColor.a, session.animationPlaying, session.symmetryAxes.horizontal, session.symmetryAxes.vertical, session.symmetryAxes.diagonalUp, session.symmetryAxes.diagonalDown, session.symmetryAxes.rotational, symmetryCenter.x, symmetryCenter.y, symmetryAxisPreferences.locked, symmetryAxisPreferences.thickness, activeLayerEditable, selectionLayersEditable, hasSelectedMovableLayer, quickToolMatch?.id, quickToolMatch?.binding])

  const activeColor = (button = 0): RgbaColor => session.tool === 'eraser'
    ? button === 2 ? session.secondaryColor : TRANSPARENT
    : button === 2 ? session.secondaryColor : session.primaryColor

  const brushDynamicsAt = (
    pointerType: string | undefined,
    pressure: number | undefined,
    speed = 0,
    pressureAvailable?: boolean,
    previousPressure?: number
  ): { size: number; opacityScale: number; gradientAmount: number | null; angle: number } => {
    const resolved = resolveBrushDynamics(session.brushDynamics, { pointerType, pressure, speed, pressureAvailable, previousPressure }, session.brushSize)
    return activeBrushImage?.intrinsicSize ? { ...resolved, size: session.brushSize } : resolved
  }

  const brushDynamicsAtEvent = (
    event: Pick<React.PointerEvent<HTMLCanvasElement>, 'pointerId' | 'pointerType' | 'pressure' | 'buttons'>,
    speed = 0
  ): ReturnType<typeof brushDynamicsAt> => {
    const adapted = pressureAdapterRef.current.adapt(event)
    return brushDynamicsAt(adapted.pointerType, adapted.pressure, speed, adapted.pressureAvailable, adapted.previousPressure)
  }

  const sameRgbaColor = (left: RgbaColor, right: RgbaColor): boolean => left.r === right.r && left.g === right.g && left.b === right.b && left.a === right.a

  const brushGradientAt = (buttonColor: RgbaColor, gradientAmount: number | null): BrushGradientSample | undefined => {
    if (session.tool !== 'pencil' || gradientAmount === null) return undefined
    const currentIsSecondary = sameRgbaColor(buttonColor, session.secondaryColor) && !sameRgbaColor(buttonColor, session.primaryColor)
    return {
      startColor: currentIsSecondary ? session.primaryColor : session.secondaryColor,
      endColor: buttonColor,
      gradientAmount,
      dither: session.brushDynamics.gradientDither
    }
  }

  const brushLineGradient = (from: BrushGradientSample | undefined, to: BrushGradientSample | undefined) => {
    const start = from ?? to
    const end = to ?? from
    if (!start || !end) return undefined
    return {
      startColor: start.startColor,
      endColor: start.endColor,
      fromAmount: start.gradientAmount,
      toAmount: end.gradientAmount,
      dither: end.dither
    }
  }

  const advanceIsoBrushPath = (
    drag: DragState,
    rawTarget: Point,
    targetDynamics: ReturnType<typeof brushDynamicsAt>
  ) => {
    const path = drag.path
    const startSample = path?.[0]
    const endpointSample = path?.at(-1)
    if (!path || !startSample || !endpointSample) return null
    const anchorSample = path.length > 1 ? path[path.length - 2] : startSample
    const advanced = advanceIsoAlignedStrokeSegment({
      anchor: anchorSample,
      endpoint: endpointSample,
      rawAnchor: drag.isoAlignedRawAnchor,
      rawEndpoint: drag.isoAlignedRawEndpoint,
      gridVertex: drag.isoAlignedGridVertex,
      direction: drag.isoAlignedDirection ?? null,
      directionSamples: drag.isoAlignedDirectionSamples
    }, rawTarget, isoViewPreferences.stairStep, isoGridSnapActive ? {
      diagonalOnly: true,
      grid: {
        spacing: isoViewPreferences.guideUnitSize,
        origin: { x: isoViewPreferences.guideOriginX, y: isoViewPreferences.guideOriginY }
      }
    } : {})
    const lockedPoints = advanced.lockedEndpoints ?? (advanced.lockedEndpoint ? [advanced.lockedEndpoint] : [])
    const lockedSamples = lockedPoints.map((point) => ({ ...endpointSample, ...point }))
    const segmentStartSample = lockedSamples.at(-1) ?? anchorSample
    const distance = Math.max(
      Math.abs(advanced.endpoint.x - advanced.anchor.x),
      Math.abs(advanced.endpoint.y - advanced.anchor.y)
    )
    const targetSize = activeBrushImage?.intrinsicSize
      ? targetDynamics.size
      : smoothBrushSizeEnvelope(segmentStartSample.size ?? session.brushSize, targetDynamics.size, session.brushSize, distance)
    const targetColor = drag.color ?? activeColor()
    const targetGradient = drag.colorReplacement ? undefined : brushGradientAt(targetColor, targetDynamics.gradientAmount)
    const targetSample = {
      ...advanced.endpoint,
      size: targetSize,
        opacityScale: targetDynamics.opacityScale,
        angle: targetDynamics.angle,
        color: targetColor,
      gradient: targetGradient
    }
    updateIsoAlignedStrokePath(path, advanced, targetSample)
    drag.isoAlignedDirection = advanced.direction ?? undefined
    drag.isoAlignedRawAnchor = advanced.rawAnchor
    drag.isoAlignedRawEndpoint = advanced.rawEndpoint
    drag.isoAlignedGridVertex = advanced.gridVertex
    drag.isoAlignedDirectionSamples = advanced.directionSamples
    drag.lastBrushSize = targetSize
    drag.lastOpacityScale = targetDynamics.opacityScale
    drag.lastBrushColor = targetColor
    drag.lastBrushGradientActive = Boolean(targetGradient)
    return targetSample
  }

  const advanceIsoGridBrushEdges = (
    drag: DragState,
    rawTarget: Point,
    targetDynamics: ReturnType<typeof brushDynamicsAt>
  ) => {
    const traced = traceIsoGridPointerEdges(drag.isoGridPointer ?? rawTarget, rawTarget, {
      stairStep: isoViewPreferences.stairStep,
      spacing: isoViewPreferences.guideUnitSize,
      origin: { x: isoViewPreferences.guideOriginX, y: isoViewPreferences.guideOriginY },
      hoveredEdgeKey: drag.isoGridHoveredEdgeKey
    })
    drag.isoGridPointer = { ...rawTarget }
    drag.isoGridHoveredEdgeKey = traced.hoveredEdgeKey
    if (traced.edges.length === 0) return []

    const strokes = traced.edges.map((edge) => {
      const distance = Math.max(Math.abs(edge.to.x - edge.from.x), Math.abs(edge.to.y - edge.from.y))
      const targetSize = activeBrushImage?.intrinsicSize
        ? targetDynamics.size
        : smoothBrushSizeEnvelope(drag.lastBrushSize ?? session.brushSize, targetDynamics.size, session.brushSize, distance)
      const targetColor = drag.color ?? activeColor()
      const targetGradient = drag.colorReplacement ? undefined : brushGradientAt(targetColor, targetDynamics.gradientAmount)
      const stroke = {
        key: edge.key,
        from: {
          ...edge.from,
          size: drag.lastBrushSize ?? targetSize,
          opacityScale: drag.lastOpacityScale ?? targetDynamics.opacityScale,
          angle: targetDynamics.angle,
          color: targetColor,
          gradient: targetGradient
        },
        to: {
          ...edge.to,
          size: targetSize,
          opacityScale: targetDynamics.opacityScale,
          angle: targetDynamics.angle,
          color: targetColor,
          gradient: targetGradient
        }
      }
      drag.isoGridStrokeEdges ??= []
      drag.isoGridStrokeEdges.push(stroke)
      drag.path ??= []
      drag.path.push(stroke.from, stroke.to)
      drag.lastBrushSize = targetSize
      drag.lastOpacityScale = targetDynamics.opacityScale
      drag.lastBrushColor = targetColor
      drag.lastBrushGradientActive = Boolean(targetGradient)
      return stroke
    })
    return strokes
  }

  const commitPolygonLasso = (): void => {
    const drag = inputRef.current.drag
    if (drag?.kind !== 'polygon-lasso') return
    inputRef.current.finish()
    const before = drag.selectionStart ?? null
    const incoming = tilemapPaintSelectionForIncoming(symmetrySelection(polygonSelection(session.document, drag.path ?? [], balancedShiftLineEnabled), session.document.width, session.document.height, session.symmetryAxes, symmetryCenter))
    const after = combineSelection(before, incoming, drag.selectionMode ?? session.selectionMode)
    useWorkspace.getState().commitSelectionChange(before, after, t('canvas.history.polygonLasso'))
    scheduleDraw()
  }

  const freeTileSourceEditForDrag = (drag: DragState): FreeTileSourceEditRaster | null => {
    if (!drag.freeTileEditDocument || !drag.freeTileEditLayer || !drag.freeTileSourceBefore || !drag.freeTileEditOrigin || !drag.freeTileEditSourceOffset) return null
    return {
      document: drag.freeTileEditDocument,
      layer: drag.freeTileEditLayer,
      before: drag.freeTileSourceBefore,
      origin: drag.freeTileEditOrigin,
      sourceOffset: drag.freeTileEditSourceOffset,
      instanceTransform: drag.freeTileEditInstanceTransform ?? {},
      transformedSourceBounds: drag.freeTileEditTransformedSourceBounds ?? { x: drag.freeTileSourceBefore.offsetX, y: drag.freeTileSourceBefore.offsetY, width: drag.freeTileSourceBefore.width, height: drag.freeTileSourceBefore.height }
    }
  }

  const freeTileFloatingDragFields = (floating: DocumentSession['pendingPaste']): Partial<DragState> => {
    if (!floating?.freeTile) return {}
    const { freeTile } = floating
    return {
      freeTileSelectionTransform: true,
      freeTileSelectionSource: cloneSelection(freeTile.selectionSource) ?? undefined,
      freeTileSelectionPivotBefore: floating.beforeSelectionPivot ? { ...floating.beforeSelectionPivot } : null,
      freeTileSourceId: freeTile.sourceId,
      freeTileInstanceId: freeTile.instanceId,
      freeTileEditDocument: freeTile.edit.document,
      freeTileEditLayer: freeTile.edit.layer,
      freeTileSourceBefore: freeTile.edit.before,
      freeTileEditOrigin: { ...freeTile.edit.origin },
      freeTileEditSourceOffset: { ...freeTile.edit.sourceOffset },
      freeTileEditInstanceTransform: { ...freeTile.edit.instanceTransform },
      freeTileEditTransformedSourceBounds: { ...freeTile.edit.transformedSourceBounds }
    }
  }

  const freeTileLocalPoint = (drag: DragState, point: Point): Point => drag.freeTileEditOrigin
    ? { x: point.x - drag.freeTileEditOrigin.x, y: point.y - drag.freeTileEditOrigin.y }
    : point

  const commitFreeTileSourceDrag = (drag: DragState, label: string): boolean => {
    const sourceEdit = freeTileSourceEditForDrag(drag)
    if (!sourceEdit || !drag.freeTileSourceId) return false
    const after = freeTileSourceSnapshotFromEditRaster(sourceEdit)
    useWorkspace.getState().commitFreeTileSourceEdit(drag.freeTileSourceId, sourceEdit.before, after, label, drag.freeTilePlacementEdit)
    return true
  }

  const commitShapePoints = (drag: DragState, points: readonly Point[], label: string): void => {
    const sourceEdit = freeTileSourceEditForDrag(drag)
    const document = sourceEdit?.document ?? session.document
    const layer = sourceEdit?.layer ?? activePaintLayer(session)
    if (isLayerEffectivelyLocked(sourceEdit ? session.document : document, layer)) return
    const edit = beginPixelEdit(layer.id)
    const localPoints = sourceEdit ? points.map((point) => freeTileLocalPoint(drag, point)) : points
    paintShapePixelPoints(document, layer, edit, localPoints, drag.color ?? session.primaryColor, sourceEdit ? drag.freeTileEditSelection ?? null : paintSelectionForDrag(drag), sourceEdit ? undefined : session.symmetryAxes, sourceEdit ? undefined : symmetryCenter)
    if (sourceEdit) commitFreeTileSourceDrag(drag, label)
    else useWorkspace.getState().commitPixelEdit(edit, label)
  }

  const commitBrushPath = (drag: DragState, points: readonly Point[], label: string): void => {
    const sourceEdit = freeTileSourceEditForDrag(drag)
    const document = sourceEdit?.document ?? session.document
    const layer = sourceEdit?.layer ?? activePaintLayer(session)
    if (isLayerEffectivelyLocked(sourceEdit ? session.document : document, layer) || points.length === 0) return
    const edit = beginPixelEdit(layer.id)
    const localPoints = sourceEdit ? points.map((point) => freeTileLocalPoint(drag, point)) : points
    paintBrushPath(
      document,
      layer,
      edit,
      localPoints,
      session.brushSize,
      drag.color ?? session.primaryColor,
      sourceEdit ? drag.freeTileEditSelection ?? null : paintSelectionForDrag(drag),
      session.brushShape,
      activeBrushTexture,
      session.brushTextureScale,
      activeBrushImage,
      session.brushImageSettings,
      proceduralAntialiasStrength,
      activeBrushPaintMode,
      brushPatternOrigin(localPoints[0]),
      sourceEdit ? undefined : session.symmetryAxes,
      sourceEdit ? undefined : symmetryCenter,
      sourceEdit ? 'off' : session.view.tileRepeatMode ?? 'off',
      activeBrushDither
    )
    if (sourceEdit) commitFreeTileSourceDrag(drag, label)
    else useWorkspace.getState().commitPixelEdit(edit, label)
  }

  const commitPolygonShape = (): void => {
    const drag = inputRef.current.drag
    if (drag?.kind !== 'polygon-shape') return
    inputRef.current.finish()
    commitShapePoints(drag, filledPolygonPathPixelPoints(session.document, drag.path ?? [], balancedShiftLineEnabled), t('canvas.history.drawPolygon'))
    scheduleDraw()
  }

  const curveDefaultControls = (start: Point, end: Point, count: number): Point[] => Array.from({ length: count }, (_, index) => {
    const amount = (index + 1) / (count + 1)
    return {
      x: Math.round(start.x + (end.x - start.x) * amount),
      y: Math.round(start.y + (end.y - start.y) * amount)
    }
  })

  const curveShapePixelPoints = (drag: DragState): readonly Point[] => {
    const end = drag.curveEnd ?? drag.last
    const points = bezierCurvePixelPoints(drag.start, drag.curveControls ?? curveDefaultControls(drag.start, end, drag.curveAnchorCount ?? session.curveAnchorCount), end)
    return session.perfectPixels ? perfectPixelPathPoints(points) : points
  }

  const lineShapeBrushPoints = (drag: DragState): readonly Point[] => {
    const points = lineShapePixelPoints(drag.start, drag.last, balancedStraightLines)
    return session.perfectPixels ? perfectPixelPathPoints(points) : points
  }

  const commitCurveShape = (): void => {
    const drag = inputRef.current.drag
    if (drag?.kind !== 'curve-shape' || !drag.curveEnd) return
    inputRef.current.finish()
    commitBrushPath(drag, curveShapePixelPoints(drag), t('canvas.history.drawCurve'))
    scheduleDraw()
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    // Keyboard tool changes can land before React commits the next render.
    // Resolve the session at event time so the first pointer event sees them.
    let session = liveInputSession()
    const fillKind = session.fillKind ?? 'bucket'
    const gradientType = session.gradientType ?? 'linear'
    const brushInputs = activeBrushInputsForTool(session.tool, fillKind, session.brushImage, session.brushTexture)
    const activeBrushImage = brushInputs.imageBrush
    const activeBrushTexture = brushInputs.texture
    const activeBrushDither = activeBrushImage ? undefined : session.brushDither ?? DEFAULT_BRUSH_DITHER_SETTINGS
    const activeBrushPaintMode = activeBrushImage?.intrinsicSize ? session.brushPaintMode : 'paint'
    const proceduralAntialiasStrength = brushInputs.fillTextureEnabled && session.proceduralAntialias && activeBrushImage?.id.startsWith('procedural:') ? session.proceduralAntialiasStrength : 0
    const activeColor = (button = 0): RgbaColor => session.tool === 'eraser'
      ? button === 2 ? session.secondaryColor : TRANSPARENT
      : button === 2 ? session.secondaryColor : session.primaryColor
    const brushPatternOrigin = (point: Point, size = session.brushSize, imageBrush = activeBrushImage): Point => {
      const anchor = brushStampAnchor(size, imageBrush)
      return { x: point.x - anchor.x, y: point.y - anchor.y }
    }
    const brushDynamicsAtEvent = (
      pointerEvent: Pick<React.PointerEvent<HTMLCanvasElement>, 'pointerId' | 'pointerType' | 'pressure' | 'buttons'>,
      speed = 0
  ): { size: number; opacityScale: number; gradientAmount: number | null; angle: number } => {
      const adapted = pressureAdapterRef.current.adapt(pointerEvent)
      const resolved = resolveBrushDynamics(session.brushDynamics, {
        pointerType: adapted.pointerType,
        pressure: adapted.pressure,
        speed,
        pressureAvailable: adapted.pressureAvailable,
        previousPressure: adapted.previousPressure
      }, session.brushSize)
      return activeBrushImage?.intrinsicSize ? { ...resolved, size: session.brushSize } : resolved
    }
    const brushGradientAt = (buttonColor: RgbaColor, gradientAmount: number | null): BrushGradientSample | undefined => {
      if (session.tool !== 'pencil' || gradientAmount === null) return undefined
      const currentIsSecondary = sameRgbaColor(buttonColor, session.secondaryColor) && !sameRgbaColor(buttonColor, session.primaryColor)
      return {
        startColor: currentIsSecondary ? session.primaryColor : session.secondaryColor,
        endColor: buttonColor,
        gradientAmount,
        dither: session.brushDynamics.gradientDither
      }
    }
    syncHeldShortcutModifiers(event.nativeEvent)
    event.currentTarget.tabIndex = -1
    event.currentTarget.focus({ preventScroll: true })
    const state = useWorkspace.getState()
    if (zoomPreviewStartRef.current) finishZoomPreview()
    if (state.activeId !== session.document.id) { state.setActive(session.document.id); return }
    // Playback blocks document edits, but viewport navigation must remain
    // available so the canvas can still be inspected while it is playing.
    if (session.animationPlaying && event.button !== 1) return
    const preflightSession = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id) ?? session
    const preflightGroupSelected = preflightSession.selectedGroupIds.length > 0 || Boolean(preflightSession.selectedGroupId)
    const preflightToolAllowed = preflightSession.tool === 'move' || preflightSession.tool === 'hand' || preflightSession.tool === 'zoom' || preflightSession.tool === 'rotate'
    if (preflightGroupSelected && !preflightToolAllowed && event.button !== 1 && !(event.button === 0 && inputRef.current.spaceHeld)) {
      event.currentTarget.style.cursor = canvasCursors.unavailable
      event.preventDefault()
      return
    }
    beginCanvasToolGesture(event.pointerId)
    if (event.button === 1 || (event.button === 0 && inputRef.current.spaceHeld)) {
      const view = liveViewRef.current
      inputRef.current.drag = createCanvasPanDrag(
        { x: view.panX, y: view.panY },
        { x: event.clientX, y: event.clientY },
        inputRef.current.drag ?? undefined
      )
      beginPanPreview()
      event.currentTarget.setPointerCapture(event.pointerId)
      event.currentTarget.style.cursor = canvasCursors.grabbing
      event.preventDefault()
      return
    }
    // Resolve the live free-transform session before any auxiliary canvas
    // interaction (such as symmetry-axis dragging) can claim the pointer.
    // Corner handles reshape the frame; the selected content itself remains
    // movable. Middle-button/space panning has already returned above.
    const currentInteractionSession = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id) ?? session
    const liveGroupSelectionActive = currentInteractionSession.selectedGroupIds.length > 0 || Boolean(currentInteractionSession.selectedGroupId)
    const liveGroupToolAllowed = currentInteractionSession.tool === 'move' || currentInteractionSession.tool === 'hand' || currentInteractionSession.tool === 'zoom' || currentInteractionSession.tool === 'rotate'
    // Group selection is a document-level move target, not a paint target.
    // Block pixel-edit/selection gestures before they can create any drag or
    // pixel edit state; viewport navigation remains available above.
    if (liveGroupSelectionActive && !liveGroupToolAllowed) {
      event.currentTarget.style.cursor = canvasCursors.unavailable
      event.preventDefault()
      return
    }
    const freeTransformActive = currentInteractionSession.freeTransformActive === true
    if (freeTransformActive) {
      const freeTransformHit = event.button === 0 ? selectionHit(event) : 'outside'
      const freeTransformCorner = freeTransformHit === 'nw' || freeTransformHit === 'ne' || freeTransformHit === 'se' || freeTransformHit === 'sw'
      const freeTransformContent = freeTransformHit === 'inside'
      if (!(event.button === 0 && (freeTransformCorner || freeTransformContent))) {
        updateCursor(event)
        event.preventDefault()
        return
      }
    }
    const pivotSamplingHeld = paletteSamplingShortcutActive() || quickToolActive('eyedropper')
    const viewNavigationToolActive = isCanvasViewNavigationTool(session.tool)
    if (event.button === 0 && !viewNavigationToolActive && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && !pivotSamplingHeld && !freeTransformActive && selectionPivotHitAt(event.clientX, event.clientY)) {
      const currentSession = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id) ?? session
      const pivot = selectionPivotForSession(currentSession)
      const pointer = localContinuousPointAt(event.clientX, event.clientY)
      if (pivot && pointer) {
        inputRef.current.drag = { kind: 'move-selection-pivot', start: pointer, last: pointer, selectionPivotStart: pivot, previewPivot: { ...pivot } }
        event.currentTarget.setPointerCapture(event.pointerId)
        event.currentTarget.style.cursor = canvasCursors.default
        event.preventDefault()
        return
      }
    }
    const symmetryHit = event.button === 0 && !viewNavigationToolActive ? symmetryAxisHitAt(event.clientX, event.clientY, event.ctrlKey) : null
    if (symmetryHit) {
      symmetryDragRef.current = { axis: symmetryHit, pointerId: event.pointerId }
      event.currentTarget.setPointerCapture(event.pointerId)
      event.currentTarget.style.cursor = canvasCursors.move
      event.preventDefault()
      return
    }
    // A free-transform frame may extend beyond the document after a corner
    // drag. Keep the interaction alive there by falling back to continuous
    // document coordinates; regular tools retain the clipped integer path.
    const point = localPoint(event)
      ?? (freeTransformActive || viewNavigationToolActive ? localContinuousPointAt(event.clientX, event.clientY) : null)
    if (!point) return
    updateCursor(event)
    event.currentTarget.setPointerCapture(event.pointerId)
    const beginCrossCanvasSampling = (): void => {
      const sourceCanvas = canvasRef.current
      if (!sourceCanvas) return
      beginCanvasColorSampling({
        sourceCanvas,
        pointerId: event.pointerId,
        onSample: (sampled, clientX, clientY) => {
          const drag = inputRef.current.drag
          if (drag?.kind !== 'sample-color') return
          if (drag.sampleSecondary) state.setSecondaryColor(sampled)
          else state.setPrimaryColor(sampled)
          drag.sampledColor = { ...sampled }
          publishCanvasColorSample(sampled, Boolean(drag.sampleSecondary))
          inputRef.current.sampling = true
          updateEyedropperMagnifier(clientX, clientY, sampled)
        }
      })
    }
    const sampleAtPoint = (temporarySampling = true): void => {
      if (point.x < 0 || point.y < 0 || point.x >= session.document.width || point.y >= session.document.height) return
      const secondary = event.button === 2
      const sampledFreeTile = freeTileAtPoint(point)
      if (sampledFreeTile !== undefined) {
        if (sampledFreeTile) {
          state.setSelectedTile(sampledFreeTile.tilesetId, sampledFreeTile.tileId, secondary ? 'secondary' : 'primary')
          state.setFreeTileMode('paint')
        }
        inputRef.current.sampling = true
        inputRef.current.drag = { kind: 'sample-color', start: point, last: point, sampleSecondary: secondary, temporarySampling, tileSampling: true }
        hideEyedropperMagnifier()
        event.currentTarget.style.cursor = canvasCursors.eyedropper
        draw()
        return
      }
      const sampledTile = tilemapCellAtPoint(point)
      if (sampledTile !== undefined) {
        if (sampledTile) state.setSelectedTile(sampledTile.tilesetId, sampledTile.tileId, secondary ? 'secondary' : 'primary')
        inputRef.current.sampling = true
        inputRef.current.drag = { kind: 'sample-color', start: point, last: point, sampleSecondary: secondary, temporarySampling, tileSampling: true }
        hideEyedropperMagnifier()
        event.currentTarget.style.cursor = canvasCursors.eyedropper
        draw()
        return
      }
      const setSampledColor = secondary ? state.setSecondaryColor : state.setPrimaryColor
      const mask = activeLayerMask(session)
      const sampled = mask ? readLayerMaskDisplayColorAt(mask, point.x, point.y) : cursorCompositePointSamplerFor(session)(point.x, point.y)
      const previous = secondary ? session.secondaryColor : session.primaryColor
      setSampledColor(sampled)
      publishCanvasColorSample(sampled, secondary)
      eyedropperOriginalColorRef.current = { ...previous }
      inputRef.current.sampling = true
      inputRef.current.drag = { kind: 'sample-color', start: point, last: point, sampleSecondary: secondary, temporarySampling, sampledColor: { ...sampled } }
      beginCrossCanvasSampling()
      updateEyedropperMagnifier(event.clientX, event.clientY, sampled)
      event.currentTarget.style.cursor = canvasCursors.eyedropper
      draw()
    }
    const paletteSamplingHeld = paletteSamplingShortcutActive()
    if (paletteSamplingShortcutStartsPrimarySample(paletteSamplingHeld, event.button)) {
      sampleAtPoint()
      return
    }
    const selectionPriorityHit = event.button === 0 && session.selection ? selectionHit(event) : 'outside'
    const addingToSelection = Boolean(session.selection && (event.shiftKey || modifierActive(event.nativeEvent, 'addToSelection')))
    const temporaryMove = !freeTransformActive && event.button === 0
      && !radialGradientCenterModifierActive(session, event.nativeEvent)
      && quickMoveToolActive()
      && !brushLineConnectionHasPriority(event.nativeEvent)
      && temporaryMoveForCanvasInteractionAllowed(
        session.tool,
        session.moveKind,
        selectionPriorityHit,
        addingToSelection
      )
    // Tilemap paint mode owns the canvas press regardless of the global pixel
    // tool. Resolve the tileset owner before any paint-mode branch uses the
    // active layer, otherwise a stale pencil/selection tool snapshot can keep
    // drawing on the previously selected layer.
    if (!temporaryMove && (event.button === 0 || event.button === 2) && session.tilemapMode === 'paint') {
      const selectedTilesetOwnerId = session.selectedTilesetId
        ? session.document.layers.find((layer) => layer.kind === 'tilemap' && layer.tilemapTilesetId === session.selectedTilesetId)?.id
        : undefined
      state.activateTilemapLayerForDrawing(selectedTilesetOwnerId)
      session = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id) ?? session
    }
    const selectedTextBox = selectedTextBoxForSession(session)
    const textBoxHit = event.button === 0 && selectedTextBox ? selectionHit(event) : 'outside'
    if (!temporaryMove && session.tool === 'text' && selectedTextBox && textBoxHit in resizeCursors) {
      state.beginSelectedTextBoxTransform()
      inputRef.current.drag = {
        kind: 'transform-text-box',
        start: point,
        last: point,
        handle: textBoxHit as SelectionHandle,
        transformStartTarget: { ...selectedTextBox },
        previewTarget: { ...selectedTextBox }
      }
      event.currentTarget.style.cursor = displayedResizeCursorForHandle(textBoxHit as SelectionHandle)
      return
    }
    if (!temporaryMove && session.tool === 'text' && selectedTextBox && textBoxHit === 'inside') {
      state.beginSelectedTextBoxTransform()
      inputRef.current.drag = {
        kind: 'transform-text-box',
        start: point,
        last: point,
        startClient: { x: event.clientX, y: event.clientY },
        moved: false,
        transformStartTarget: { ...selectedTextBox },
        previewTarget: { ...selectedTextBox }
      }
      event.currentTarget.style.cursor = canvasCursors.move
      return
    }
    const activePolygon = inputRef.current.drag
    if (session.tool === 'selection' && activePolygon?.kind === 'polygon-lasso' && (event.button === 0 || event.button === 2)) {
      const path = activePolygon.path ?? []
      if (shouldClosePolygonLasso(path, point, event.detail)) {
        commitPolygonLasso()
        return
      }
      appendCanvasPathStep(activePolygon, point)
      activePolygon.last = point
      scheduleDraw()
      return
    }
    if (session.tool === 'shape' && activePolygon?.kind === 'polygon-shape' && (event.button === 0 || event.button === 2)) {
      const path = activePolygon.path ?? []
      if (shouldClosePolygonLasso(path, point, event.detail)) {
        commitPolygonShape()
        return
      }
      appendCanvasPathStep(activePolygon, point)
      activePolygon.last = point
      scheduleDraw()
      return
    }
    if (session.tool === 'line' && session.lineKind === 'curve' && activePolygon?.kind === 'curve-shape' && activePolygon.curvePhase === 'anchors' && (event.button === 0 || event.button === 2)) {
      // Confirmation is handled on pointer-up. Pointer-down must not change the
      // active anchor or the visible curve.
      return
    }
    const resizeEdge = canvasResizeHit(event)
    const activeResizePreview = canvasResizePreviewRef.current
    if (activeResizePreview) {
      inputRef.current.sampling = false
      inputRef.current.shiftLinePreview = false
      if (event.button === 0 && resizeEdge) {
        inputRef.current.drag = { kind: 'canvas-resize', start: point, last: point, canvasEdge: resizeEdge, canvasPreview: { ...activeResizePreview } }
      } else if (event.button === 0 && canvasResizeContains(event)) {
        inputRef.current.drag = { kind: 'canvas-move', start: point, last: point, canvasPreview: { ...activeResizePreview } }
        event.currentTarget.style.cursor = canvasCursors.move
      }
      return
    }
    const eyedropperHeld = paletteSamplingHeld || quickToolActive('eyedropper')
    const focusesRasterLayer = !groupSelectionActive && event.button === 0
      && session.tool !== 'hand'
      && session.tool !== 'zoom'
      && session.tool !== 'move'
      && session.tool !== 'eyedropper'
      && session.tool !== 'selection'
      && !eyedropperHeld
      && !temporaryMove
      && !session.activeLayerMaskId
      && (session.selectedGroupIds.length > 0 || session.selectedLayerIds.length > 1)
    const hasRasterFocus = hasSelectedRasterLayer || focusesRasterLayer || (session.tool === 'selection' && selectionLayersEditable)
    if ((activeLayer.kind !== 'tilemap' || session.tilemapMode !== 'paint') && (activeLayer.kind !== 'free-tile' || session.freeTileMode !== 'paint') && modifierActive(event.nativeEvent, 'brushSizeAdjust') && (session.tool === 'pencil' || session.tool === 'airbrush' || session.tool === 'eraser') && (session.tool === 'airbrush' || activeLayer.kind === 'tilemap' || !activeBrushImage?.intrinsicSize) && event.button === 0) {
      inputRef.current.sampling = false
      inputRef.current.drag = { kind: 'brush-size', start: point, last: point, startClient: { x: event.clientX, y: event.clientY }, startBrushSize: session.tool === 'airbrush' ? session.airbrushScatterRadius : session.brushSize }
      event.currentTarget.style.cursor = canvasToolCursor('pencil', session.primaryColor)
      return
    }
    // A held quick-tool shortcut can project a different tool onto the
    // session object. Free transform must keep selection semantics regardless
    // of that projection so a corner click cannot fall through to layer move.
    const selectionTool = freeTransformActive || session.tool === 'selection'
    const selectionMode = (): SelectionMode => event.button === 2 ? 'subtract' : (event.shiftKey || modifierActive(event.nativeEvent, 'addToSelection')) ? 'add' : session.selectionMode
    const editableLayer = activePaintLayer(session)
    const canEditLayer = hasRasterFocus && isLayerEffectivelyVisible(session.document, editableLayer) && !isLayerEffectivelyLocked(session.document, editableLayer)
    const canEditSelectionLayers = selectionTool && (selectionLayersEditable || tilemapSelectionCreationAllowed)
    const tilemapPixelEditSelection = tilemapEditSelectionAtPoint(point, session, true)
    const pixelEditSelection = tilemapPixelEditSelection === undefined ? session.selection : tilemapPixelEditSelection
    const tilemapPixelEditBlocked = tilemapPixelEditSelection === null
    const tilemapEditDragState = tilemapPixelEditSelection ? { tilemapEditSelection: tilemapPixelEditSelection } : {}
    const movableActiveLayer = getActiveLayer(session.document)
    const canMoveActiveLayer = session.selectedGroupIds.length === 0
      && session.selectedLayerIds.includes(movableActiveLayer.id)
      && isLayerEffectivelyVisible(session.document, movableActiveLayer)
      && !isLayerEffectivelyLocked(session.document, movableActiveLayer)
    const copyLayerHeld = modifierActive(event.nativeEvent, 'copyLayerOnDrag')
    const prepareFreeTileSourceEdit = (): { source: NonNullable<ReturnType<typeof freeTileSourceForId>>; instance: FreeTileInstance; placementEdit: ReturnType<typeof state.beginFreeTilePlacement>; sourceEdit: FreeTileSourceEditRaster; selection: SelectionMask | null; sourceRegion: SelectionRect } | null => {
      if (editableLayer.kind !== 'free-tile' || session.freeTileMode !== 'edit') return null
      const target = activeFreeTileCelTarget(session.document)
      if (!target) return null
      const selectedSource = freeTileSourceForId(session.document, target.layer, session.selectedTilesetId) ?? target.sources[0] ?? null
      if (!selectedSource || selectedSource.visible === false) return null
      const sourceLayer = target.layer.freeTileSources?.find((candidate) => candidate.id === selectedSource.id)
      if (sourceLayer?.locked) return null
       const editTarget = freeTileSourceEditTargetAtPoint(
         target.freeTiles,
         target.sources,
         selectedSource.id,
         point.x,
         point.y,
         target.surface.offsetX,
         target.surface.offsetY,
         session.selectedFreeTileInstanceId
       )
       if (editTarget.blockedByOtherSource) return null
       let instance = editTarget.instance
      if (instance?.visible === false || instance?.locked === true) return null
      let placementEdit: ReturnType<typeof state.beginFreeTilePlacement> = null
      if (!instance) {
        placementEdit = state.beginFreeTilePlacement()
        if (!placementEdit) return null
        const origin = freeTileSourceStampOrigin(point.x, point.y, selectedSource, target.surface.offsetX, target.surface.offsetY)
         instance = { id: createId('free-tile-instance'), sourceId: selectedSource.id, x: origin.x, y: origin.y, opacity: selectedSource.opacity, blendMode: selectedSource.blendMode }
        placementEdit.after.instances.push(instance)
        placementEdit.dirtyRect = freeTileInstanceBounds(instance, target.sources, target.surface.offsetX, target.surface.offsetY)
        if (!state.previewFreeTilePlacement(placementEdit)) return null
      }
      const bounds = freeTileInstanceBounds(instance, target.sources, target.surface.offsetX, target.surface.offsetY)
      const sourceEdit = createFreeTileSourceEditRaster(session.document, selectedSource, bounds, point, instance)
      if (!sourceEdit) {
        if (placementEdit) state.cancelFreeTilePlacement(placementEdit)
        return null
      }
      const selection = session.selection
        ? shiftSelection(session.selection, -sourceEdit.origin.x, -sourceEdit.origin.y, sourceEdit.document.width, sourceEdit.document.height)
        : null
      const sourceRegion: SelectionRect = {
        x: sourceEdit.sourceOffset.x,
        y: sourceEdit.sourceOffset.y,
        width: sourceEdit.transformedSourceBounds.width,
        height: sourceEdit.transformedSourceBounds.height
      }
      state.setSelectedFreeTileInstance(instance.id)
      return { source: selectedSource, instance, placementEdit, sourceEdit, selection, sourceRegion }
    }
    if (!freeTransformActive && (session.tool === 'move' || temporaryMove) && event.button === 0 && movableActiveLayer.kind === 'free-tile' && shouldUseFreeTileInstanceMove(movableActiveLayer.id, session.freeTileInstanceLayerId)) {
      const target = activeFreeTileCelTarget(session.document)
      const selectedInstance = target?.freeTiles.instances.find((instance) => instance.id === session.selectedFreeTileInstanceId && instance.visible !== false) ?? null
      const selectedBounds = target && selectedInstance
        ? freeTileInstanceBounds(selectedInstance, target.sources, target.surface.offsetX, target.surface.offsetY)
        : null
      const selectedHit = selectedInstance && selectedBounds
        && point.x >= selectedBounds.x && point.y >= selectedBounds.y
        && point.x < selectedBounds.x + selectedBounds.width && point.y < selectedBounds.y + selectedBounds.height
        ? selectedInstance
        : null
      const instance = selectedHit ?? (target ? freeTileInstanceAtDocumentPoint(target, point.x, point.y) : null)
      const source = target && instance ? freeTileSourceForInstance(target.sources, instance) : null
      const sourceLayer = source ? target?.layer.freeTileSources?.find((candidate) => candidate.id === source.id) : null
      if (target && instance && instance.locked !== true && source && sourceLayer?.locked !== true && canMoveActiveLayer) {
        const selectedIds = session.selectedFreeTileInstanceIds.length > 0 && session.selectedFreeTileInstanceIds.includes(instance.id)
          ? session.selectedFreeTileInstanceIds
          : [instance.id]
        const movingInstances = selectedIds.flatMap((id) => target.freeTiles.instances.find((candidate) => candidate.id === id && candidate.visible !== false && candidate.locked !== true) ?? [])
        const starts = Object.fromEntries(movingInstances.map((candidate) => [candidate.id, { x: candidate.x, y: candidate.y }]))
        if (!session.selectedFreeTileInstanceIds.includes(instance.id)) state.setSelectedFreeTileInstance(instance.id)
        publishFreeTileInstanceFlash({ documentId: session.document.id, instanceId: instance.id })
        const placementEdit = state.beginFreeTilePlacement()
        if (!placementEdit) return
        inputRef.current.drag = {
          kind: 'free-tile-instance-move',
          start: point,
          last: point,
          freeTilePlacementEdit: placementEdit,
          freeTileSourceId: source.id,
          freeTileInstanceId: instance.id,
          freeTileInstanceStart: { x: instance.x, y: instance.y },
          freeTileInstanceIds: movingInstances.map((candidate) => candidate.id),
          freeTileInstanceStarts: starts,
          startedAt: Date.now()
        }
        event.currentTarget.style.cursor = canvasCursors.move
        return
      }
    }
    if (session.tool === 'text' && event.button === 0 && !temporaryMove) {
      inputRef.current.drag = {
        kind: 'create-text-box',
        start: point,
        last: point,
        startClient: { x: event.clientX, y: event.clientY },
        moved: false,
        previewTarget: clampSliceRect(shapeBounds(point, point), session.document.width, session.document.height)
      }
      return
    }
    if (editableLayer.kind && !isToolAvailableForSession(session, temporaryMove ? 'move' : session.tool) && !canEditSelectionLayers && !eyedropperHeld) return
    if (!temporaryMove && selectionTool && (event.button === 0 || event.button === 2) && !canEditSelectionLayers && !eyedropperHeld) return
    if (!freeTransformActive && !temporaryMove && sliceTool && event.button === 0) {
      const selectedIds = session.selectedSliceIds?.length ? session.selectedSliceIds : session.selectedSliceId ? [session.selectedSliceId] : []
      const selected = selectedIds.length === 1 ? session.document.slices?.find((slice) => slice.id === selectedIds[0]) ?? null : null
      const handle = selected ? sliceHandleAt(event.clientX, event.clientY, selected) : null
      if (selected && handle && !event.shiftKey && !event.altKey) {
        inputRef.current.drag = { kind: 'resize-slice', start: point, last: point, sliceId: selected.id, sliceStart: { ...selected }, handle, previewTarget: { ...selected } }
        event.currentTarget.style.cursor = displayedResizeCursorForHandle(handle)
        return
      }
      const hit = sliceAtPoint(session.document.slices ?? [], point.x, point.y)
      if (hit) {
        if (event.shiftKey) {
          state.selectSlice(hit.id, true)
          scheduleDraw()
          return
        }
        const movingIds = selectedIds.includes(hit.id) ? selectedIds : [hit.id]
        if (!selectedIds.includes(hit.id)) state.selectSlice(hit.id)
        const starts = Object.fromEntries(movingIds.flatMap((id) => {
          const slice = session.document.slices?.find((candidate) => candidate.id === id)
          return slice ? [[id, { x: slice.x, y: slice.y, width: slice.width, height: slice.height }] as const] : []
        }))
        inputRef.current.drag = { kind: 'move-slice', start: point, last: point, startClient: { x: event.clientX, y: event.clientY }, moved: false, sliceId: hit.id, sliceIds: movingIds, sliceStart: { ...hit }, sliceStarts: starts, slicePreviewTargets: starts, previewTarget: { ...hit }, copy: event.altKey, collapseSliceSelectionOnClick: movingIds.length > 1 }
        event.currentTarget.style.cursor = event.altKey ? canvasCursors.copy : canvasCursors.move
        return
      }
      state.selectSlice(null)
      inputRef.current.drag = { kind: 'create-slice', start: point, last: point, startClient: { x: event.clientX, y: event.clientY }, moved: false, previewTarget: clampSliceRect(shapeBounds(point, point), session.document.width, session.document.height) }
      event.currentTarget.style.cursor = selectionCreationCursor(selectionCrosshair)
      return
    }
    if (!freeTransformActive && (session.tool === 'move' || temporaryMove) && event.button === 0) {
      const additiveSelection = event.shiftKey
      const hitTarget = session.moveAutoSelect || additiveSelection ? topEditableLayerAt(point) : null
      let selectedLayerIds = resolveCanvasMoveLayerIds({
        selectedLayerIds: session.selectedLayerIds,
        selectedGroupIds: session.selectedGroupIds,
        layerIdsForGroup: (groupId) => getLayerIdsInGroup(session.document, groupId)
      })
      if (additiveSelection && hitTarget) {
        state.selectMoveToolLayer(hitTarget.id, true)
        const selectedSession = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id)
        selectedLayerIds = selectedSession?.selectedLayerIds ?? selectedLayerIds
        revealLayerInPanel(session.document.id, hitTarget.id)
        if (selectedLayerIds.includes(hitTarget.id)) {
          showMoveLayerContentPreview(hitTarget)
          flashMoveLayer(hitTarget)
        }
        else hideMoveLayerContentPreview()
        return
      }
      if (!additiveSelection && selectedLayerIds.length > 1 && hitTarget && !selectedLayerIds.includes(hitTarget.id)) {
        state.selectMoveToolLayer(hitTarget.id)
        selectedLayerIds = [hitTarget.id]
        revealLayerInPanel(session.document.id, hitTarget.id)
        showMoveLayerContentPreview(hitTarget)
      }
      const frameSelectionAcrossLayers = session.selectedAnimationFrameIds.length > 0
      let selectedMovableLayers = (frameSelectionAcrossLayers ? session.document.layers.map((layer) => layer.id) : selectedLayerIds)
        .map((id) => session.document.layers.find((layer) => layer.id === id))
        .filter((layer): layer is RasterLayer => Boolean(layer && isLayerEffectivelyVisible(session.document, layer) && !isLayerEffectivelyLocked(session.document, layer)))
      let moveAllSelectedLayers = frameSelectionAcrossLayers || selectedMovableLayers.length > 1 || session.selectedGroupIds.length > 0
      const target = additiveSelection && hitTarget ? hitTarget : moveAllSelectedLayers
        ? selectedMovableLayers.find((layer) => layer.id === session.document.activeLayerId) ?? selectedMovableLayers[0]
        : session.moveAutoSelect ? (hitTarget ?? (canMoveActiveLayer ? movableActiveLayer : null)) : (canMoveActiveLayer ? movableActiveLayer : null)
      if (!target) { if (eyedropperHeld) sampleAtPoint(); return }
      flashMoveLayer(hitTarget ?? target)
      if (!additiveSelection && session.moveAutoSelect && !moveAllSelectedLayers) {
        const currentFrameId = session.document.animation?.activeFrameId
        const targetKey = currentFrameId ? animationCelKey(target.id, currentFrameId) : null
        if (!targetKey || !session.selectedAnimationCellKeys.includes(targetKey)) {
          state.selectMoveToolLayer(target.id)
          selectedLayerIds = [target.id]
          selectedMovableLayers = [target]
          moveAllSelectedLayers = false
          revealLayerInPanel(session.document.id, target.id)
          showMoveLayerContentPreview(target)
        }
      }
      const activeSession = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id) ?? session
      const currentFrameId = activeSession.document.animation?.activeFrameId
      const layerSelectionAcrossFrames = !frameSelectionAcrossLayers
        && activeSession.selectedAnimationFrameIds.length === 0
        && activeSession.selectedAnimationCellKeys.length === 0
        && activeSession.selectedAnimationMaskCellKeys.length === 0
      if (layerSelectionAcrossFrames) moveAllSelectedLayers = true
      const selectedCellKeys = resolveCanvasMoveAnimationCellKeys({
        selectedAnimationCellKeys: activeSession.selectedAnimationCellKeys,
        selectedAnimationFrameIds: activeSession.selectedAnimationFrameIds,
        selectedLayerIds: selectedMovableLayers.map((layer) => layer.id),
        allFrameIds: activeSession.document.animation?.frames.map((frame) => frame.id) ?? [],
        currentFrameId,
        targetLayerId: target.id,
        moveAllSelectedLayers,
        moveSelectedFramesAcrossLayers: frameSelectionAcrossLayers
      })
      const movableCellKeys = selectedCellKeys.filter((key) => {
        const parsed = parseAnimationCelKey(key)
        const layer = parsed ? activeSession.document.layers.find((candidate) => candidate.id === parsed.layerId) : null
        return Boolean(layer && isLayerEffectivelyVisible(activeSession.document, layer) && !isLayerEffectivelyLocked(activeSession.document, layer))
      })
      const animationCellOffsets = animationCelOffsetsForKeys(activeSession.document, movableCellKeys)
      const animationCellKeys = movableCellKeys.filter((key) => animationCellOffsets[key])
      const layerIds = (moveAllSelectedLayers ? selectedMovableLayers.map((layer) => layer.id) : [target.id]).filter((id) => {
        const layer = session.document.layers.find((candidate) => candidate.id === id)
        return Boolean(layer && isLayerEffectivelyVisible(session.document, layer) && !isLayerEffectivelyLocked(session.document, layer))
      })
      const layerOffsets = Object.fromEntries(layerIds.map((id) => {
        const layer = session.document.layers.find((candidate) => candidate.id === id)!
        return [id, { x: layer.offsetX, y: layer.offsetY }]
      }))
      const rawLayerContentBoundsById = Object.fromEntries(layerIds.map((id) => {
        const layer = session.document.layers.find((candidate) => candidate.id === id)!
        return [id, layerContentBounds(session.document, layer)]
      }))
      const layerContentBoundsById = Object.fromEntries(layerIds.map((id) => {
        const bounds = rawLayerContentBoundsById[id]
        return [id, bounds ? expandLayerStyleInvalidationRect(session.document, bounds, [id]) : null]
      }))
      const moveBounds = Object.values(layerContentBoundsById).filter((bounds): bounds is SelectionRect => Boolean(bounds))
      const selectionStart = cloneSelection(session.selection)
      const alignmentMovingBounds = [
        ...Object.values(rawLayerContentBoundsById).filter((bounds): bounds is SelectionRect => Boolean(bounds)),
        ...(selectionStart ? [selectionStart] : [])
      ]
      window.__moonSpriteCanvasProbe?.recordOperationStage?.('move-layer.bounds', 0, {
        layers: layerIds.length,
        boundedLayers: moveBounds.length,
        dirtyPixels: moveBounds.reduce((sum, bounds) => sum + bounds.width * bounds.height, 0)
      })
      inputRef.current.drag = {
        kind: 'move-layer', start: point, last: point, layerId: target.id,
        layerOffset: { x: target.offsetX, y: target.offsetY }, layerIds, layerOffsets,
        layerContentBounds: layerContentBoundsById, layerPreviewOffset: { x: 0, y: 0 }, layerFrameId: currentFrameId,
        ...alignmentDragFields(alignmentMovingBounds, layerIds),
        animationCellKeys, animationCellOffsets, animationMaskOffsets: animationMaskOffsetsForLayerMove(activeSession, layerIds, currentFrameId, animationCellKeys), duplicateOnDrag: copyLayerHeld && layerIds.length === 1 && animationCellKeys.length <= 1,
        originalSelectedLayerIds: [...selectedLayerIds], selectionStart,
        selectionPivotStart: activeSession.selectionPivot ? { ...activeSession.selectionPivot } : undefined,
        previewPivot: activeSession.selectionPivot ? { ...activeSession.selectionPivot } : undefined,
        clickLayerId: hitTarget?.id ?? session.document.activeLayerId,
        collapseLayerSelectionOnClick: !additiveSelection && (selectedLayerIds.length > 1 || activeSession.selectedAnimationCellKeys.length > 1)
      }
      preserveCanvasSelection(session.document.id)
      event.currentTarget.style.cursor = copyLayerHeld ? canvasCursors.copy : canvasCursors.move
      return
    }
    if (session.tool === 'rotate' && eyedropperHeld && (event.button === 0 || event.button === 2)) {
      sampleAtPoint()
      return
    }
    if (session.tool === 'rotate' && event.button === 0) {
      const size = stageSize()
      const pointer = stagePoint(event.clientX, event.clientY)
      const pivot = rotationIndicatorPosition === 'view'
        ? rotationIndicatorPointBetweenPointerAndCanvasCenter(size.width, size.height, pointer, displayedCanvasCenter(size.width, size.height, liveViewRef.current, rotationIndicatorPosition))
        : viewRotationPivot(size.width, size.height, liveViewRef.current.panX, liveViewRef.current.panY, rotationIndicatorPosition)
      rotationIndicatorAnchorRef.current = rotationIndicatorPosition === 'view' ? pivot : null
      const angle = Math.atan2(pointer.y - pivot.y, pointer.x - pivot.x) * 180 / Math.PI
      inputRef.current.drag = { kind: 'rotate-view', start: point, last: point, startAngle: angle, startRotation: liveViewRef.current.rotation, startPan: { x: liveViewRef.current.panX, y: liveViewRef.current.panY }, rotationPivot: pivot }
      updateRotationIndicator(liveViewRef.current.rotation, true)
      return
    }
    if (lineConnectionActive(event.nativeEvent) && hasRasterFocus && (editableLayer.kind !== 'tilemap' || session.tilemapMode !== 'paint') && (editableLayer.kind !== 'free-tile' || session.freeTileMode !== 'paint') && (session.tool === 'pencil' || session.tool === 'eraser') && lineAnchor && event.button === 0) {
      if (canEditLayer && !tilemapPixelEditBlocked) {
        const repeatMode = session.view.tileRepeatMode ?? 'off'
        const repeatedPointer = tileRepeatPointAt(event.clientX, event.clientY) ?? point
        const repeatedAnchor = nearestTileRepeatEquivalent(lineAnchor, repeatedPointer, session.document.width, session.document.height, repeatMode)
        const line = resolveStraightLine(repeatedAnchor, repeatedPointer, modifierActive(event.nativeEvent, 'constrainLineDirections'))
        const repeatedStart = line.from
        const repeatedTarget = line.to
        const target = wrapDocumentPointForTileRepeat(repeatedTarget, session.document.width, session.document.height, repeatMode)
        const anchorHistory = lineAnchorHistoryRef.current
        const reuseAnchorBaseline = Boolean(anchorHistory
          && anchorHistory.documentId === session.document.id
          && anchorHistory.layerId === editableLayer.id
          && anchorHistory.tool === session.tool
          && anchorHistory.point.x === lineAnchor.x
          && anchorHistory.point.y === lineAnchor.y
          && session.history.latestUndoEntry === anchorHistory.entry)
        const edit = beginPixelEdit(editableLayer.id)
        if (reuseAnchorBaseline && anchorHistory) inheritBrushPaintBaseline(edit, anchorHistory.baseline)
        const dynamics = brushDynamicsAtEvent(event)
        const lineColor = activeColor()
        const gradient = brushGradientAt(lineColor, dynamics.gradientAmount)
        if (editableLayer.kind === 'free-tile' && session.freeTileMode === 'edit') {
          const prepared = prepareFreeTileSourceEdit()
          if (!prepared) return
          const { source, placementEdit, sourceEdit, selection } = prepared
          const edit = beginPixelEdit(sourceEdit.layer.id)
          const localAnchor = { x: repeatedStart.x - sourceEdit.origin.x, y: repeatedStart.y - sourceEdit.origin.y }
          for (const segment of tileRepeatLineSegments(repeatedStart, repeatedTarget, session.document.width, session.document.height, repeatMode, balancedStraightLines ? 'balanced' : 'raster')) {
            paintLine(
              sourceEdit.document,
              sourceEdit.layer,
              edit,
              segment.from.x - sourceEdit.origin.x,
              segment.from.y - sourceEdit.origin.y,
              segment.to.x - sourceEdit.origin.x,
              segment.to.y - sourceEdit.origin.y,
              session.brushSize,
              lineColor,
              selection,
              session.brushShape,
              activeBrushTexture,
              session.brushTextureScale,
              activeBrushImage,
              session.brushImageSettings,
              proceduralAntialiasStrength,
              activeBrushPaintMode,
              brushPatternOrigin(localAnchor),
              balancedStraightLines ? 'balanced' : 'raster',
              undefined,
              undefined,
              undefined,
              {
                fromSize: dynamics.size,
                toSize: dynamics.size,
                fromOpacityScale: dynamics.opacityScale,
                toOpacityScale: dynamics.opacityScale,
                fromAngle: dynamics.angle,
                toAngle: dynamics.angle,
                gradient: brushLineGradient(gradient, gradient)
              },
              'off',
              activeBrushDither
            )
          }
          const label = session.tool === 'eraser' ? t('canvas.history.eraserLine') : t('canvas.history.pencilLine')
          state.commitFreeTileSourceEdit(source.id, sourceEdit.before, freeTileSourceSnapshotFromEditRaster(sourceEdit), label, placementEdit ?? undefined)
          lineAnchorHistoryRef.current = null
          if (session.tool === 'eraser') state.setLastEraserPoint(target)
          else state.setLastPencilPoint(target)
          compositeCacheRef.current.invalidateAll()
          scheduleDraw()
          return
        }
        for (const segment of tileRepeatLineSegments(repeatedStart, repeatedTarget, session.document.width, session.document.height, repeatMode, balancedStraightLines ? 'balanced' : 'raster')) {
          paintLine(session.document, editableLayer, edit, segment.from.x, segment.from.y, segment.to.x, segment.to.y, session.brushSize, lineColor, pixelEditSelection, session.brushShape, session.tool === 'pencil' || session.tool === 'eraser' ? activeBrushTexture : 'solid', session.brushTextureScale, session.tool === 'pencil' || session.tool === 'eraser' ? activeBrushImage : null, session.brushImageSettings, proceduralAntialiasStrength, activeBrushPaintMode, brushPatternOrigin(repeatedStart), balancedStraightLines ? 'balanced' : 'raster', session.symmetryAxes, symmetryCenter, undefined, {
            fromSize: dynamics.size,
            toSize: dynamics.size,
            fromOpacityScale: dynamics.opacityScale,
            toOpacityScale: dynamics.opacityScale,
            fromAngle: dynamics.angle,
            toAngle: dynamics.angle,
            gradient: brushLineGradient(gradient, gradient)
          }, repeatMode, activeBrushDither)
        }
        const label = session.tool === 'eraser' ? t('canvas.history.eraserLine') : t('canvas.history.pencilLine')
        const lineEntry = state.commitPixelEdit(edit, label, { stroke: true, durationMs: 1 })
        const mergedEntry = reuseAnchorBaseline && anchorHistory?.mergeWithNext && lineEntry ? session.history.mergeLastTwo(label) : null
        const currentEntry = mergedEntry ?? lineEntry
        const nextBaseline = reuseAnchorBaseline && anchorHistory ? new Map(anchorHistory.baseline) : new Map<number, number>()
        for (const [index, value] of edit.before) if (!nextBaseline.has(index)) nextBaseline.set(index, value)
        lineAnchorHistoryRef.current = currentEntry ? {
          documentId: session.document.id,
          layerId: editableLayer.id,
          tool: session.tool,
          point: { ...target },
          entry: currentEntry,
          baseline: nextBaseline,
          mergeWithNext: false
        } : null
        if (session.tool === 'eraser') state.setLastEraserPoint(target)
        else state.setLastPencilPoint(target)
      }
      return
    }
    if (selectionTool && (event.button === 0 || event.button === 2)) {
      const mode = selectionMode()
      const currentSelectionSession = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id) ?? session
      const freeTileSelectionTarget = selectedFreeTileSelectionTarget(currentSelectionSession)
      const freeTileSelectionBounds = freeTileSelectionTarget?.bounds
      // Keep the visible selection in document space. Source edits are scoped to
      // the selected instance later, but marquee/lasso creation must remain free
      // to cover transparent space around it.
      const currentSelection = currentSelectionSession.selection
      const freeTransformActive = currentSelectionSession.freeTransformActive === true
      const freeTransformHit = freeTransformActive ? selectionHit(event) : 'outside'
      const freeTransformCorner = freeTransformHit === 'nw' || freeTransformHit === 'ne' || freeTransformHit === 'se' || freeTransformHit === 'sw'
      const freeTransformContent = freeTransformHit === 'inside'
      if (freeTransformActive && !(event.button === 0 && (freeTransformCorner || freeTransformContent))) return
      const customSelectionPivot = currentSelectionSession.selectionPivot ? { ...currentSelectionSession.selectionPivot } : undefined
      const repeatMode = liveViewRef.current.tileRepeatMode ?? 'off'
      const tileRepeatStart = repeatMode === 'off'
        ? undefined
        : repeatedDocumentPointsAt(event.clientX, event.clientY, true)?.repeated
      const quickPress: QuickSelectionPress = {
        clientX: event.clientX,
        clientY: event.clientY,
        pointerId: event.pointerId,
        timeStamp: event.timeStamp
      }
      const quickSelectionSecondPress = !freeTransformActive && event.button === 0
        && session.selectionKind === 'rectangle'
        && !eyedropperHeld
        && isQuickSelectionSecondPress(quickSelectionPressRef.current, quickPress, event.detail)
      if (!freeTransformActive && event.button === 0 && session.selectionKind === 'rectangle') {
        quickSelectionPressRef.current = quickSelectionSecondPress ? null : quickPress
      }
      if (quickSelectionSecondPress) {
        state.commitFloatingPaste()
        const active = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id) ?? session
        const cell = quickSelectionCellAt(active, point)
        if (cell) {
          if (timelineSelectionPrecedesCanvasMarquee(active)) {
            const timeline = ensureAnimationDocument(active.document)
            state.selectAnimationCell(animationCelKey(active.document.activeLayerId, timeline.activeFrameId))
          }
          startCanvasSelection(session.document.id)
          const before = cloneSelection(active.selection)
          const incoming = tilemapPaintSelectionForIncoming(rectSelection(cell.x, cell.y, cell.width, cell.height), active)
          const baseSelection = combineSelection(before, incoming, mode)
          inputRef.current.drag = {
            kind: 'marquee',
            start: point,
            last: point,
            startClient: { x: event.clientX, y: event.clientY },
            selectionStart: before,
            selectionCommitStart: before,
            selectionMode: mode,
            previewSelection: baseSelection,
            marqueePreviewSelection: incoming,
            marqueeBounds: { ...cell },
            previewTarget: { ...cell },
            quickSelectCell: { ...cell },
            moved: false
          }
          quickSelectionHandledAtRef.current = event.timeStamp
          event.currentTarget.style.cursor = selectionCreationCursor(selectionCrosshair, selectionInteractionEditable)
          scheduleDraw()
          return
        }
      }
      const rawHit = freeTransformActive ? freeTransformHit : selectionHit(event)
      const transformInteraction = event.button === 0 && !event.shiftKey
      // Once free transform is active, the frame owns the pointer regardless
      // of the selection mode left over from marquee creation. This prevents
      // subtract/intersect modes from turning an interior drag into a new
      // selection gesture.
      const hit = freeTransformActive
        ? freeTransformHit
        : transformInteraction && (mode === 'replace' || mode === 'add' || rawHit !== 'inside') ? rawHit : 'outside'
      if (event.button === 0 && session.tool === 'selection' && rawHit === 'inside' && hit === 'inside' && session.selection) {
        state.setSelectionPropertiesActive(true)
      }
      if (eyedropperHeld && !(hit in resizeCursors)) { sampleAtPoint(); return }
      if (session.textBoxTransform && event.button === 0) {
        if (hit in resizeCursors) {
          const bounds = { ...session.textBoxTransform.bounds }
          inputRef.current.drag = { kind: 'transform-text-box', start: point, last: point, handle: hit as SelectionHandle, transformStartTarget: bounds, previewTarget: bounds }
          event.currentTarget.style.cursor = displayedResizeCursorForHandle(hit as SelectionHandle)
        }
        return
      }
      const copyRequested = modifierActive(event.nativeEvent, 'copySelectionContent')
      if (selectionLayersEditable && selectionHitStartsContentMove(hit, copyRequested) && session.selection && currentSelection) {
        let floating = session.pendingPaste
        const selectionMatchesFloatingTarget = !floating || selectionBoundsEqual(currentSelection, floating.target)
        const floatingCopyRestart = floating && shouldReuseFloatingSelectionSourceForCopy(
          floating.source.origin,
          copyRequested,
          selectionMatchesFloatingTarget,
          Boolean(floating.layers?.length || floating.freeTile)
        )
          ? {
            source: floating.source,
            transformTarget: floating.transformTarget ?? { x: floating.target.x, y: floating.target.y, width: floating.target.width, height: floating.target.height },
            transformAngle: floating.transformAngle ?? 0,
            transformShear: floating.transformShear
          }
          : null
        if (floating && !selectionMatchesFloatingTarget) {
          state.commitFloatingPaste()
          floating = null
        }
        if (editableLayer.kind === 'tilemap' && session.tilemapMode === 'paint' && floating) {
          state.commitFloatingPaste()
          floating = null
        }
        if (floating && shouldRestartFloatingSelectionForCopy(floating.copy, copyRequested)) {
          state.commitFloatingPaste()
          floating = null
        }
        const copy = floatingCopyRestart ? true : floatingSelectionCopyMode(floating?.copy ?? null, copyRequested)
        let selectionStart = cloneSelection(currentSelection)!
        if (editableLayer.kind === 'tilemap' && session.tilemapMode === 'paint') selectionStart = tilemapPaintSelectionForIncoming(selectionStart) ?? selectionStart
        const selectedFreeTileIds = session.selectedFreeTileInstanceIds.length > 0
          ? session.selectedFreeTileInstanceIds
          : session.selectedFreeTileInstanceId ? [session.selectedFreeTileInstanceId] : []
        const selectedFreeTileInstancesForMove = freeTileSelectionTarget
          ? selectedFreeTileIds.flatMap((id) => freeTileSelectionTarget.target.freeTiles.instances.find((candidate) => candidate.id === id && candidate.visible !== false && candidate.locked !== true) ?? [])
          : []
        const selectedFreeTileMoveBounds = selectedFreeTileInstancesForMove.length > 0
          ? (() => {
              const bounds = selectedFreeTileInstancesForMove.map((instance) => freeTileInstanceBounds(instance, freeTileSelectionTarget!.target.sources, freeTileSelectionTarget!.target.surface.offsetX, freeTileSelectionTarget!.target.surface.offsetY))
              const left = Math.min(...bounds.map((bound) => bound.x))
              const top = Math.min(...bounds.map((bound) => bound.y))
              const right = Math.max(...bounds.map((bound) => bound.x + bound.width))
              const bottom = Math.max(...bounds.map((bound) => bound.y + bound.height))
              return { x: left, y: top, width: right - left, height: bottom - top }
            })()
          : null
        const onlySelectedFreeTileInstance = Boolean(!floating
          && !copy
          && editableLayer.kind === 'free-tile'
          && session.freeTileMode === 'edit'
          && freeTileSelectionTarget
          && selectedFreeTileInstancesForMove.length > 0
          && selectedFreeTileIds.includes(freeTileSelectionTarget.instance.id)
          && selectedFreeTileMoveBounds
          && selectionCoversRect(selectionStart, selectedFreeTileMoveBounds))
        if (!freeTransformActive && onlySelectedFreeTileInstance && freeTileSelectionTarget) {
          const placementEdit = state.beginFreeTilePlacement()
          if (placementEdit) {
            const selectionPivotStart = currentSelectionSession.selectionPivot ? { ...currentSelectionSession.selectionPivot } : undefined
            inputRef.current.drag = {
              kind: 'move-content',
              start: point,
              last: point,
              selectionStart,
              selectionPreparationPending: false,
              copy: false,
              floatingPaste: false,
              previewSelection: selectionStart,
              appliedSelection: selectionStart,
              selectionPivotStart,
              previewPivot: selectionPivotStart,
              transformStartTarget: { x: selectionStart.x, y: selectionStart.y, width: selectionStart.width, height: selectionStart.height },
              previewTarget: { x: selectionStart.x, y: selectionStart.y, width: selectionStart.width, height: selectionStart.height },
              previewAngle: 0,
              ...alignmentDragFields([selectionStart], [editableLayer.id]),
              freeTilePlacementEdit: placementEdit,
              freeTileInstanceId: freeTileSelectionTarget.instance.id,
              freeTileInstanceStart: { x: freeTileSelectionTarget.instance.x, y: freeTileSelectionTarget.instance.y },
              freeTileInstanceIds: selectedFreeTileInstancesForMove.map((instance) => instance.id),
              freeTileInstanceStarts: Object.fromEntries(selectedFreeTileInstancesForMove.map((instance) => [instance.id, { x: instance.x, y: instance.y }])),
              freeTileInstanceSelectionMove: true
            }
            event.currentTarget.style.cursor = canvasCursors.move
            return
          }
        }
        const freeTransformQuad = freeTransformActive
          ? freeTransformQuadForSession(currentSelectionSession) ?? selectionQuadFromRect(selectionStart)
          : null
        const freeTransform = Boolean(freeTransformQuad)
        const transformTarget = freeTransformQuad
          ? selectionQuadBounds(freeTransformQuad)
          : floating?.transformTarget ?? floatingCopyRestart?.transformTarget ?? { x: selectionStart.x, y: selectionStart.y, width: selectionStart.width, height: selectionStart.height }
        const transformAngle = freeTransform ? 0 : floating?.transformAngle ?? floatingCopyRestart?.transformAngle ?? 0
        const transformShear = freeTransform ? undefined : floating?.transformShear ?? floatingCopyRestart?.transformShear
        const floatingLayers = cloneSelectionLayerStates(floating?.layers)
        const freeTileFloatingFields = freeTileFloatingDragFields(floating)
        const tilemapEditCellIndex = floating?.tilemapEditCellIndex ?? tilemapEditCellIndexAtPoint(point, currentSelectionSession)
        const tilemapSelectionMoveSource = !freeTransformActive && editableLayer.kind === 'tilemap' && session.tilemapMode === 'paint'
          ? (() => {
              const target = activeTilemapCelTarget(session.document)
              return target ? captureTilemapSelectionMove(target, selectionStart) : null
            })()
          : null
        if (editableLayer.kind === 'tilemap' && session.tilemapMode === 'edit' && tilemapEditCellIndex == null) return
        // Free-transform content movement uses the regular selection transform
        // preview even on tilemap layers. The paint-mode guard below only
        // applies to the legacy grid-snapped selection move path.
        if (!freeTransformActive && editableLayer.kind === 'tilemap' && session.tilemapMode === 'paint' && !tilemapSelectionMoveSource) return
        const alignmentMovingBounds = transformedSelectionBounds(transformTarget, transformAngle, transformShear)
        inputRef.current.drag = { kind: 'move-content', start: point, last: point, selectionStart, selectionSource: floating?.source ?? floatingCopyRestart?.source, selectionLayers: floatingLayers, selectionSourceCacheKey: session.selection, selectionPreparationPending: !tilemapSelectionMoveSource, previewEdit: floating?.previewEdit, translationPreview: floating?.translationPreview, deferredSelectionPreview: freeTransform || tilemapSelectionMoveSource || floatingLayers?.length || selectedTransformLayers.length > 1 ? false : selectionTransformDeferredPreviewEnabled('move-content', canUseDeferredSelectionPreview(editableLayer), transformAngle, transformShear), copy, floatingPaste: Boolean(floating), previewSelection: selectionStart, appliedSelection: selectionStart, selectionPivotStart: customSelectionPivot, previewPivot: customSelectionPivot, transformStartTarget: { ...transformTarget }, startAngle: transformAngle, transformStartShear: transformShear ? { ...transformShear } : undefined, previewTarget: { ...transformTarget }, previewAngle: transformAngle, previewShear: transformShear ? { ...transformShear } : undefined, freeTransform, transformStartQuad: cloneSelectionQuad(freeTransformQuad) ?? undefined, previewQuad: cloneSelectionQuad(freeTransformQuad) ?? undefined, ...alignmentDragFields([alignmentMovingBounds], selectedTransformLayers.map((layer) => layer.id), true), ...freeTileFloatingFields, ...(tileRepeatStart ? { tileRepeatStart } : {}), ...(tilemapEditCellIndex == null ? {} : { tilemapEditCellIndex }), ...(tilemapSelectionMoveSource ? { tilemapSelectionMoveSource, tilemapSelectionMoveDelta: { columns: 0, rows: 0 } } : {}) }
        event.currentTarget.style.cursor = !floating && copy ? canvasCursors.copy : canvasCursors.move
        return
      }
      if (hit === 'edge' && session.selection && currentSelection) {
        const preserveFloatingPaste = session.pendingPaste?.source.origin === 'clipboard'
        if (session.pendingPaste && !preserveFloatingPaste) state.commitFloatingPaste()
        const current = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id) ?? session
        const selectionStart = cloneSelection(current.selection)
        if (!selectionStart) return
        const selectionPivotStart = current.selectionPivot ? { ...current.selectionPivot } : undefined
        inputRef.current.drag = { kind: 'move-selection', start: point, last: point, selectionStart, previewSelection: selectionStart, selectionPivotStart, previewPivot: selectionPivotStart, floatingPasteSelectionBox: preserveFloatingPaste, ...alignmentDragFields([selectionStart], [], true), ...(tileRepeatStart ? { tileRepeatStart } : {}) }
        event.currentTarget.style.cursor = canvasCursors.selectionMove
        return
      }
      if (hit in shearCursors && session.selection && currentSelection) {
        let floating = session.pendingPaste
        if (floating && !selectionBoundsEqual(currentSelection, floating.target)) {
          state.commitFloatingPaste()
          floating = null
        }
        const selectionStart = cloneSelection(currentSelection)
        const transformTarget = floating?.transformTarget ?? { x: selectionStart!.x, y: selectionStart!.y, width: selectionStart!.width, height: selectionStart!.height }
        const transformAngle = floating?.transformAngle ?? 0
        const transformShear = floating?.transformShear
        const floatingLayers = cloneSelectionLayerStates(floating?.layers)
        inputRef.current.drag = { kind: 'shear-content', start: point, last: point, selectionStart, selectionSource: floating?.source, selectionLayers: floatingLayers, selectionSourceCacheKey: session.selection, selectionPreparationPending: true, previewEdit: floating?.previewEdit, translationPreview: floating?.translationPreview, deferredSelectionPreview: floatingLayers?.length || selectedTransformLayers.length > 1 ? false : selectionTransformDeferredPreviewEnabled('shear-content', canUseDeferredSelectionPreview(editableLayer), transformAngle, transformShear), shearHandle: hit as SelectionShearHandle, copy: floatingSelectionCopyMode(floating?.copy ?? null, modifierActive(event.nativeEvent, 'copySelectionContent')), floatingPaste: Boolean(floating), previewSelection: selectionStart, appliedSelection: selectionStart, selectionPivotStart: selectionPivotForSession(session) ?? undefined, transformStartTarget: { ...transformTarget }, startAngle: transformAngle, transformStartShear: transformShear ? { ...transformShear } : undefined, previewTarget: { ...transformTarget }, previewAngle: transformAngle, previewShear: transformShear ? { ...transformShear } : undefined, ...freeTileFloatingDragFields(floating) }
        event.currentTarget.style.cursor = shearCursorForTransform(hit as SelectionShearHandle, transformTarget, transformAngle, transformShear)
        return
      }
      if (hit in rotationCursors && session.selection && currentSelection) {
        let floating = session.pendingPaste
        if (floating && !selectionBoundsEqual(currentSelection, floating.target)) {
          state.commitFloatingPaste()
          floating = null
        }
        const selectionStart = cloneSelection(currentSelection)!
        const transformTarget = floating?.transformTarget ?? { x: selectionStart.x, y: selectionStart.y, width: selectionStart.width, height: selectionStart.height }
        const transformAngle = floating?.transformAngle ?? 0
        const transformShear = floating?.transformShear
        const floatingLayers = cloneSelectionLayerStates(floating?.layers)
        inputRef.current.drag = { kind: 'rotate-content', start: point, last: point, selectionStart, selectionSource: floating?.source, selectionLayers: floatingLayers, selectionSourceCacheKey: session.selection, selectionPreparationPending: true, previewEdit: floating?.previewEdit, translationPreview: floating?.translationPreview, deferredSelectionPreview: floatingLayers?.length || selectedTransformLayers.length > 1 ? false : selectionTransformDeferredPreviewEnabled('rotate-content', canUseDeferredSelectionPreview(editableLayer), transformAngle, transformShear), angle: transformAngle, startAngle: transformAngle, copy: floatingSelectionCopyMode(floating?.copy ?? null, modifierActive(event.nativeEvent, 'copySelectionContent')), floatingPaste: Boolean(floating), previewSelection: selectionStart, appliedSelection: selectionStart, selectionPivotStart: selectionPivotForSession(session) ?? undefined, transformStartTarget: { ...transformTarget }, transformStartShear: transformShear ? { ...transformShear } : undefined, previewTarget: { ...transformTarget }, previewAngle: transformAngle, previewShear: transformShear ? { ...transformShear } : undefined, ...freeTileFloatingDragFields(floating) }
        event.currentTarget.style.cursor = rotationCursorForHit(hit as SelectionRotationHandle)
        return
      }
      if (hit in resizeCursors && session.selection && currentSelection) {
        let floating = session.pendingPaste
        if (floating && !selectionBoundsEqual(currentSelection, floating.target)) {
          state.commitFloatingPaste()
          floating = null
        }
        const selectionStart = cloneSelection(currentSelection)
        const modifiers = selectionTransformModifierState(event.nativeEvent)
        const selectionPivotStart = selectionPivotForSession(currentSelectionSession) ?? undefined
        const freeTransform = currentSelectionSession.freeTransformActive === true
        const transformQuad = freeTransform ? freeTransformQuadForSession(currentSelectionSession) : null
        const transformTarget = transformQuad
          ? selectionQuadBounds(transformQuad)
          : floating?.transformTarget ?? { x: selectionStart!.x, y: selectionStart!.y, width: selectionStart!.width, height: selectionStart!.height }
        const transformAngle = floating?.transformAngle ?? 0
        const transformShear = floating?.transformShear
        const floatingLayers = cloneSelectionLayerStates(floating?.layers)
        inputRef.current.drag = { kind: 'transform-content', start: point, last: point, selectionStart, selectionSource: floating?.source, selectionLayers: floatingLayers, selectionSourceCacheKey: session.selection, selectionPreparationPending: true, previewEdit: floating?.previewEdit, translationPreview: floating?.translationPreview, deferredSelectionPreview: freeTransform ? false : floatingLayers?.length || selectedTransformLayers.length > 1 ? false : selectionTransformDeferredPreviewEnabled('transform-content', canUseDeferredSelectionPreview(editableLayer), transformAngle, transformShear), handle: hit as SelectionHandle, copy: floatingSelectionCopyMode(floating?.copy ?? null, modifiers.copy), floatingPaste: Boolean(floating), previewSelection: selectionStart, appliedSelection: selectionStart, selectionPivotStart, previewPivot: selectionPivotStart ? { ...selectionPivotStart } : undefined, selectionPivotCustom: Boolean(currentSelectionSession.selectionPivot), transformStartTarget: { ...transformTarget }, startAngle: freeTransform ? 0 : transformAngle, transformStartShear: freeTransform ? undefined : transformShear ? { ...transformShear } : undefined, previewTarget: { ...transformTarget }, previewAngle: freeTransform ? 0 : transformAngle, previewShear: freeTransform ? undefined : transformShear ? { ...transformShear } : undefined, freeTransform, transformStartQuad: cloneSelectionQuad(transformQuad) ?? undefined, previewQuad: cloneSelectionQuad(transformQuad) ?? undefined, ...freeTileFloatingDragFields(floating) }
        event.currentTarget.style.cursor = resizeCursorForHit(hit as SelectionHandle)
        return
      }
      if (session.pendingPaste) state.commitFloatingPaste()
      if (session.selectionKind === 'magic') {
        const before = cloneSelection(currentSelection)
        let sourceEdit: FreeTileSourceEditRaster | null = null
        let rawIncoming: SelectionMask | null = null
        if (freeTileSelectionTarget && freeTileSelectionBounds) {
          if (!selectionContains(rectSelection(freeTileSelectionBounds.x, freeTileSelectionBounds.y, freeTileSelectionBounds.width, freeTileSelectionBounds.height), point.x, point.y)) return
          sourceEdit = createFreeTileSourceEditRaster(session.document, freeTileSelectionTarget.source, freeTileSelectionBounds, point, freeTileSelectionTarget.instance)
          if (!sourceEdit) return
          const localIncoming = magicWandSelection(
            sourceEdit.document,
            sourceEdit.layer,
            point.x - sourceEdit.origin.x,
            point.y - sourceEdit.origin.y,
            session.wandTolerance,
            session.wandContiguous,
            session.wandGapClosing ? session.wandGapThreshold : 0
          )
          rawIncoming = freeTileSelectionFromEditRaster(sourceEdit, localIncoming, session.document.width, session.document.height)
        } else rawIncoming = magicWandSelection(session.document, editableLayer, point.x, point.y, session.wandTolerance, session.wandContiguous, session.wandGapClosing ? session.wandGapThreshold : 0)
        const incoming = tilemapPaintSelectionForIncoming(symmetrySelection(rawIncoming, session.document.width, session.document.height, session.symmetryAxes, symmetryCenter))
        const next = combineSelection(before, incoming, mode)
        inputRef.current.drag = {
          kind: 'magic-preview',
          start: point,
          last: point,
          selectionStart: before,
          selectionMode: mode,
          previewSelection: next,
          ...(freeTileSelectionBounds ? { freeTileSelectionBounds: { ...freeTileSelectionBounds } } : {}),
          ...(sourceEdit ? {
            freeTileEditDocument: sourceEdit.document,
            freeTileEditLayer: sourceEdit.layer,
            freeTileSourceBefore: sourceEdit.before,
            freeTileEditOrigin: sourceEdit.origin,
            freeTileEditSourceOffset: sourceEdit.sourceOffset,
            freeTileEditInstanceTransform: sourceEdit.instanceTransform,
            freeTileEditTransformedSourceBounds: sourceEdit.transformedSourceBounds
          } : {})
        }
        draw()
        return
      }
      if (session.selectionKind === 'lasso') { inputRef.current.drag = { kind: 'lasso', start: point, last: point, selectionStart: cloneSelection(currentSelection), selectionMode: mode, previewSelection: cloneSelection(currentSelection), path: [point] }; return }
      if (session.selectionKind === 'polygon-lasso') { inputRef.current.drag = { kind: 'polygon-lasso', start: point, last: point, selectionStart: cloneSelection(currentSelection), selectionMode: mode, previewSelection: cloneSelection(currentSelection), path: [point] }; return }
    }
    if (eyedropperHeld && (event.button === 0 || event.button === 2)) { sampleAtPoint(); return }
    if (shouldStartCanvasPan(session.tool)) {
      const view = liveViewRef.current
      inputRef.current.drag = createCanvasPanDrag(
        { x: view.panX, y: view.panY },
        { x: event.clientX, y: event.clientY }
      )
      beginPanPreview()
      event.currentTarget.setPointerCapture(event.pointerId)
      event.currentTarget.style.cursor = canvasCursors.grabbing
      return
    }
    if (session.tool === 'zoom') {
      const view = liveViewRef.current
      inputRef.current.drag = { kind: 'zoom-drag', start: point, last: point, startClient: { x: event.clientX, y: event.clientY }, startZoom: view.zoom }
      return
    }
    if (editableLayer.kind === 'free-tile' && session.freeTileMode === 'edit' && (session.tool === 'fill' || session.tool === 'shape' || session.tool === 'line' || session.tool === 'airbrush')) {
      if (!hasRasterFocus || !canEditLayer) return
      const prepared = prepareFreeTileSourceEdit()
      if (!prepared) return
      const { sourceEdit, placementEdit, selection, sourceRegion } = prepared
      const freeTileDragFields = {
        freeTilePlacementEdit: placementEdit ?? undefined,
        freeTileSourceId: prepared.source.id,
        freeTileInstanceId: prepared.instance.id,
        freeTileEditDocument: sourceEdit.document,
        freeTileEditLayer: sourceEdit.layer,
        freeTileSourceBefore: sourceEdit.before,
        freeTileEditOrigin: sourceEdit.origin,
        freeTileEditSourceOffset: sourceEdit.sourceOffset,
        freeTileEditInstanceTransform: sourceEdit.instanceTransform,
        freeTileEditTransformedSourceBounds: sourceEdit.transformedSourceBounds,
        freeTileEditSelection: selection,
        freeTileGradientPaintRegion: undefined
      }
      if (session.tool === 'fill') {
        const localPoint = { x: point.x - sourceEdit.origin.x, y: point.y - sourceEdit.origin.y }
        if (fillKind === 'gradient' && (event.button === 0 || event.button === 2)) {
          const paintRegion = gradientRegionSelection(sourceEdit.document, sourceEdit.layer, localPoint, session.gradientTolerance, session.gradientContiguous)
          if (!paintRegion) {
            if (placementEdit) state.cancelFreeTilePlacement(placementEdit)
            return
          }
          const drag: DragState = {
            kind: 'gradient',
            start: point,
            last: point,
            rawLast: point,
            constrain: event.shiftKey,
            gradientFromCenter: gradientType === 'radial' && Boolean(event.ctrlKey || event.metaKey),
            color: activeColor(event.button),
            gradientEndColor: event.button === 2 ? session.primaryColor : session.secondaryColor,
            gradientStops: gradientStopsForButton(event.button),
            gradientPaintRegion: shiftSelection(paintRegion, sourceEdit.origin.x, sourceEdit.origin.y, session.document.width, session.document.height),
            ...freeTileDragFields,
            freeTileGradientPaintRegion: paintRegion
          }
          inputRef.current.drag = drag
          draw()
          return
        }
        const edit = floodFillSymmetric(sourceEdit.document, sourceEdit.layer, localPoint.x, localPoint.y, activeColor(event.button), selection ?? sourceRegion, session.fillMode === 'contiguous', activeBrushImage, session.brushSize, session.brushImageSettings, activeBrushTexture, session.brushTextureScale, proceduralAntialiasStrength, activeBrushPaintMode, undefined, undefined, session.fillTolerance, session.fillMode === 'contiguous' && session.fillGapClosing ? session.fillGapThreshold : 0)
        if (edit) {
          const drag: DragState = { kind: 'free-tile-edit', start: point, last: point, edit, ...freeTileDragFields }
          commitFreeTileSourceDrag(drag, activeBrushImage || activeBrushTexture !== 'solid' ? t('canvas.history.brushFill') : session.fillMode === 'contiguous' ? t('canvas.history.contiguousFill') : t('canvas.history.nonContiguousFill'))
        } else if (placementEdit) state.cancelFreeTilePlacement(placementEdit)
        compositeCacheRef.current.invalidateAll()
        draw()
        return
      }
      if (session.tool === 'airbrush' && (event.button === 0 || event.button === 2)) {
        const airbrushPoint = gridSnapActive ? snapPointToGrid(point, session.view.grid ?? DEFAULT_GRID_SETTINGS) : point
        const drag: DragState = {
          kind: 'airbrush',
          start: airbrushPoint,
          last: airbrushPoint,
          edit: beginPixelEdit(sourceEdit.layer.id),
          color: activeColor(event.button),
          startedAt: Date.now(),
          nextAirbrushAt: performance.now() + session.airbrushIntervalMs,
          ...freeTileDragFields
        }
        inputRef.current.drag = drag
        sprayAirbrushRef.current(drag)
        scheduleAirbrushTimer()
        return
      }
      if ((session.tool === 'shape' || session.tool === 'line') && (event.button === 0 || event.button === 2)) {
        const color = activeColor(event.button)
      if (session.tool === 'shape') {
        const shapePoint = gridSnapActive ? snapPointToGrid(point, session.view.grid ?? DEFAULT_GRID_SETTINGS) : point
        const drag: DragState = session.shapeKind === 'freeform'
          ? { kind: 'freeform-shape', start: shapePoint, last: shapePoint, color, path: [shapePoint], ...freeTileDragFields }
          : session.shapeKind === 'polygon'
            ? { kind: 'polygon-shape', start: shapePoint, last: shapePoint, color, path: [shapePoint], ...freeTileDragFields }
            : { kind: 'shape', start: shapePoint, last: shapePoint, startClient: { x: event.clientX, y: event.clientY }, color, constrain: inputRef.current.shiftHeld, ...freeTileDragFields }
          inputRef.current.drag = drag
          draw()
          return
        }
        const lineStart = isoGridSnapActive
          ? snapToIsoGrid(point)
          : gridSnapActive
            ? snapPointToGrid(point, session.view.grid ?? DEFAULT_GRID_SETTINGS)
            : point
        const drag: DragState = session.lineKind === 'curve'
          ? { kind: 'curve-shape', start: lineStart, last: lineStart, color, curvePhase: 'endpoint', curveAnchorCount: session.curveAnchorCount, ...freeTileDragFields }
          : { kind: 'line-shape', start: lineStart, last: lineStart, color, ...freeTileDragFields, ...(isoGridSnapActive ? { isoAlignedGridVertex: lineStart } : {}) }
        inputRef.current.drag = drag
        draw()
        return
      }
    }
    if (session.tool === 'fill') {
      if (!canEditLayer || tilemapPixelEditBlocked) return
      const fillPoint = gridSnapActive ? snapPointToGrid(point, session.view.grid ?? DEFAULT_GRID_SETTINGS) : point
      if (fillKind === 'gradient' && (event.button === 0 || event.button === 2)) {
        if (pixelEditSelection && !selectionContains(pixelEditSelection, fillPoint.x, fillPoint.y)) return
        const gradientPaintRegion = gradientRegionSelection(session.document, editableLayer, fillPoint, session.gradientTolerance, session.gradientContiguous)
        if (!gradientPaintRegion) return
        gradientPreviewCoverageCacheRef.current = null
        inputRef.current.drag = {
          kind: 'gradient',
          start: fillPoint,
          last: fillPoint,
          rawLast: fillPoint,
          constrain: event.shiftKey,
          gradientFromCenter: gradientType === 'radial' && Boolean(event.ctrlKey || event.metaKey),
          color: activeColor(event.button),
          gradientEndColor: event.button === 2 ? session.primaryColor : session.secondaryColor,
          gradientStops: gradientStopsForButton(event.button),
          gradientPaintRegion,
          ...tilemapEditDragState
        }
        draw()
        return
      }
      const operationProbe = window.__moonSpriteCanvasProbe
      const profiler = operationProbe?.recordOperationStage
        ? { record: (stage: string, duration: number, detail?: Record<string, number | string | boolean>) => operationProbe.recordOperationStage?.(stage, duration, detail) }
        : undefined
      const edit = floodFillSymmetric(session.document, editableLayer, fillPoint.x, fillPoint.y, activeColor(event.button), pixelEditSelection, session.fillMode === 'contiguous', activeBrushImage, session.brushSize, session.brushImageSettings, activeBrushTexture, session.brushTextureScale, proceduralAntialiasStrength, activeBrushPaintMode, session.symmetryAxes, symmetryCenter, session.fillTolerance, session.fillMode === 'contiguous' && session.fillGapClosing ? session.fillGapThreshold : 0, profiler)
      if (edit) {
        const commitStartedAt = operationProbe?.recordOperationStage ? performance.now() : 0
        state.commitPixelEdit(edit, activeBrushImage || activeBrushTexture !== 'solid' ? t('canvas.history.brushFill') : session.fillMode === 'contiguous' ? t('canvas.history.contiguousFill') : t('canvas.history.nonContiguousFill'))
        operationProbe?.recordOperationStage?.('bucket.commit-total', performance.now() - commitStartedAt, {
          points: edit.before.size,
          runs: edit.runs?.length ?? 0
        })
      }
      return
    }
    if (session.tool === 'eyedropper') { sampleAtPoint(false); return }
    if (session.tool === 'selection' && (session.selectionKind === 'rectangle' || session.selectionKind === 'ellipse') && (event.button === 0 || event.button === 2)) {
      const mode = selectionMode()
      const repeatMode = liveViewRef.current.tileRepeatMode ?? 'off'
      const repeatedStart = repeatMode === 'off'
        ? point
        : repeatedDocumentPointsAt(event.clientX, event.clientY, false, true)?.repeated ?? point
      if (timelineSelectionPrecedesCanvasMarquee(session)) {
        const timeline = ensureAnimationDocument(session.document)
        state.selectAnimationCell(animationCelKey(session.document.activeLayerId, timeline.activeFrameId))
      }
      startCanvasSelection(session.document.id)
      inputRef.current.drag = { kind: 'marquee', start: repeatedStart, last: repeatedStart, startClient: { x: event.clientX, y: event.clientY }, selectionStart: cloneSelection(session.selection), selectionMode: mode, constrain: false, tileRepeatPoint: repeatedStart }
      event.currentTarget.style.cursor = selectionCreationCursor(selectionCrosshair, selectionInteractionEditable)
      return
    }
    if (session.tool === 'shape') {
      if (!canEditLayer || tilemapPixelEditBlocked || (event.button !== 0 && event.button !== 2)) return
      const color = activeColor(event.button)
      const shapePoint = gridSnapActive ? snapPointToGrid(point, session.view.grid ?? DEFAULT_GRID_SETTINGS) : point
      if (session.shapeKind === 'freeform') inputRef.current.drag = { kind: 'freeform-shape', start: shapePoint, last: shapePoint, color, path: [shapePoint], ...tilemapEditDragState }
      else if (session.shapeKind === 'polygon') inputRef.current.drag = { kind: 'polygon-shape', start: shapePoint, last: shapePoint, color, path: [shapePoint], ...tilemapEditDragState }
      else inputRef.current.drag = { kind: 'shape', start: shapePoint, last: shapePoint, startClient: { x: event.clientX, y: event.clientY }, constrain: inputRef.current.shiftHeld, ...tilemapEditDragState }
      draw()
      return
    }
    if (session.tool === 'line' && (event.button === 0 || event.button === 2)) {
      if (!canEditLayer || tilemapPixelEditBlocked) return
      const lineStart = isoGridSnapActive
        ? snapToIsoGrid(point)
        : gridSnapActive
          ? snapPointToGrid(point, session.view.grid ?? DEFAULT_GRID_SETTINGS)
          : point
      inputRef.current.drag = session.lineKind === 'curve'
        ? { kind: 'curve-shape', start: lineStart, last: lineStart, color: activeColor(event.button), curvePhase: 'endpoint', curveAnchorCount: session.curveAnchorCount, ...tilemapEditDragState }
        : { kind: 'line-shape', start: lineStart, last: lineStart, color: activeColor(event.button), ...tilemapEditDragState, ...(isoGridSnapActive ? { isoAlignedGridVertex: lineStart } : {}) }
      draw()
      return
    }
    if (session.tool === 'airbrush') {
      if (!hasRasterFocus || !canEditLayer || tilemapPixelEditBlocked || (event.button !== 0 && event.button !== 2)) return
      const airbrushPoint = gridSnapActive ? snapPointToGrid(point, session.view.grid ?? DEFAULT_GRID_SETTINGS) : point
      const drag: DragState = {
        kind: 'airbrush', start: airbrushPoint, last: airbrushPoint, edit: beginPixelEdit(editableLayer.id),
        color: activeColor(event.button), startedAt: Date.now(), nextAirbrushAt: performance.now() + session.airbrushIntervalMs,
        ...tilemapEditDragState
      }
      inputRef.current.drag = drag
      sprayAirbrushRef.current(drag)
      scheduleAirbrushTimer()
      return
    }
    if (session.tool !== 'pencil' && session.tool !== 'eraser') return
    if (!hasRasterFocus) return
    if (!canEditLayer) return
    const freeTileTarget = editableLayer.kind === 'free-tile' ? activeFreeTileCelTarget(session.document) : null
    if (freeTileTarget) {
      const selectedSource = freeTileSourceForId(session.document, freeTileTarget.layer, session.selectedTilesetId) ?? freeTileTarget.sources[0] ?? null
      if (session.freeTileMode === 'paint') {
        if (session.selection && !selectionContains(session.selection, point.x, point.y)) return
        const placementEdit = state.beginFreeTilePlacement()
        if (!placementEdit) return
        if (session.tool === 'eraser') {
          const instance = freeTileInstanceAtDocumentPoint(freeTileTarget, point.x, point.y)
          if (!instance || instance.locked === true) return
          placementEdit.after.instances = placementEdit.after.instances.filter((candidate) => candidate.id !== instance.id)
          if (session.selectedFreeTileInstanceId === instance.id) state.setSelectedFreeTileInstance(null)
          placementEdit.dirtyRect = freeTileInstanceBounds(instance, freeTileTarget.sources, freeTileTarget.surface.offsetX, freeTileTarget.surface.offsetY)
          state.previewFreeTilePlacement(placementEdit)
          inputRef.current.drag = {
            kind: 'free-tile-draw',
            start: point,
            last: point,
            freeTilePlacementEdit: placementEdit,
            freeTileInstanceId: instance.id,
            startedAt: Date.now()
          }
          scheduleDraw()
          return
        }
        if (!selectedSource) return
        const tileId = selectedSource.tileset.tileIds[0]
        if (!tileId) return
        const origin = freeTileSourceStampOrigin(point.x, point.y, selectedSource, freeTileTarget.surface.offsetX, freeTileTarget.surface.offsetY)
        const instance: FreeTileInstance = { id: createId('free-tile-instance'), sourceId: selectedSource.id, x: origin.x, y: origin.y, opacity: selectedSource.opacity, blendMode: selectedSource.blendMode }
        placementEdit.after.instances.push(instance)
        placementEdit.dirtyRect = freeTileInstanceBounds(instance, freeTileTarget.sources, freeTileTarget.surface.offsetX, freeTileTarget.surface.offsetY)
        state.previewFreeTilePlacement(placementEdit)
        state.setSelectedFreeTileInstance(instance.id)
        inputRef.current.drag = {
          kind: 'free-tile-draw',
          start: point,
          last: point,
          freeTilePlacementEdit: placementEdit,
          freeTileSourceId: selectedSource.id,
          freeTileInstanceId: instance.id,
          freeTileLastStampOrigin: origin,
          startedAt: Date.now()
        }
        scheduleDraw()
        return
      }
      const prepared = prepareFreeTileSourceEdit()
      if (!prepared) return
      const { source, instance, placementEdit, sourceEdit, selection } = prepared
      const isoPointerStart = isoGridSnapActive
        ? repeatedDocumentPointsAt(event.clientX, event.clientY, true, true)?.local ?? point
        : point
      const strokePoint = isoGridSnapActive ? snapToIsoGrid(isoPointerStart) : point
      const local = { x: strokePoint.x - sourceEdit.origin.x, y: strokePoint.y - sourceEdit.origin.y }
      const edit = beginPixelEdit(sourceEdit.layer.id)
      const patternOrigin = brushPatternOrigin(local)
      const colorReplacement = session.tool === 'eraser' && event.button === 2
        ? { source: { ...session.primaryColor }, target: { ...session.secondaryColor } }
        : undefined
      const dynamics = brushDynamicsAtEvent(event)
      const strokeColor = activeColor(event.button)
      const gradient = colorReplacement ? undefined : brushGradientAt(strokeColor, dynamics.gradientAmount)
      if (!isoGridSnapActive) paintBrush(sourceEdit.document, sourceEdit.layer, edit, local.x, local.y, dynamics.size, strokeColor, session.brushShape, selection, activeBrushTexture, session.brushTextureScale, activeBrushImage, session.brushImageSettings, proceduralAntialiasStrength, activeBrushPaintMode, patternOrigin, undefined, undefined, colorReplacement, dynamics.opacityScale, undefined, false, gradient, 'off', activeBrushDither, dynamics.angle)
      const after = freeTileSourceSnapshotFromEditRaster(sourceEdit)
      const tileId = source.tileset.tileIds[0]
      if (tileId) state.setSelectedFreeTileInstance(instance.id, undefined, event.button === 2 ? 'secondary' : 'primary')
      else state.setSelectedFreeTileInstance(instance.id)
      state.previewFreeTileSource(source.id, after.width, after.height, after.pixels, after.offsetX, after.offsetY)
      compositeCacheRef.current.invalidateAll()
      inputRef.current.drag = {
        kind: 'free-tile-edit',
        start: strokePoint,
        last: strokePoint,
        edit,
        path: isoGridSnapActive ? [] : [{ ...strokePoint, size: dynamics.size, opacityScale: dynamics.opacityScale, angle: dynamics.angle, color: strokeColor, gradient }],
        isoAlignedStroke: isoLineAlignmentActive ? session.tool : undefined,
        isoAlignedRawAnchor: isoLineAlignmentActive && !isoGridSnapActive ? isoPointerStart : undefined,
        isoAlignedRawEndpoint: isoLineAlignmentActive && !isoGridSnapActive ? isoPointerStart : undefined,
        isoAlignedDirectionSamples: isoLineAlignmentActive ? 0 : undefined,
        isoGridStrokeEdges: isoGridSnapActive ? [] : undefined,
        isoGridPointer: isoGridSnapActive ? isoPointerStart : undefined,
        isoGridHoveredEdgeKey: isoGridSnapActive ? null : undefined,
        color: strokeColor,
        colorReplacement,
        patternOrigin,
        lastBrushSize: dynamics.size,
        lastOpacityScale: dynamics.opacityScale,
        lastBrushColor: strokeColor,
        lastBrushGradientActive: Boolean(gradient),
        brushSpeed: beginBrushSpeedTracking({ clientX: event.clientX, clientY: event.clientY, timeStamp: event.timeStamp }),
        freeTilePlacementEdit: placementEdit ?? undefined,
        freeTileSourceId: source.id,
        freeTileInstanceId: instance.id,
         freeTileEditDocument: sourceEdit.document,
         freeTileEditLayer: sourceEdit.layer,
         freeTileSourceBefore: sourceEdit.before,
         freeTileEditOrigin: sourceEdit.origin,
         freeTileEditSourceOffset: sourceEdit.sourceOffset,
         freeTileEditInstanceTransform: sourceEdit.instanceTransform,
         freeTileEditTransformedSourceBounds: sourceEdit.transformedSourceBounds,
         freeTileEditSelection: selection,
         freeTileLastLocal: local,
        startedAt: Date.now()
      }
      scheduleDraw()
      return
    }
    const tilemapTarget = editableLayer.kind === 'tilemap' ? activeTilemapCelTarget(session.document) : null
    if (tilemapTarget && session.tilemapMode === 'paint') {
      const cellIndex = tilemapCellIndexAtPoint(tilemapTarget.tilemap, tilemapTarget.surface.offsetX, tilemapTarget.surface.offsetY, point.x, point.y)
      if (cellIndex === null || !tilemapCellAllowedBySelection(tilemapTarget, cellIndex, session.selection)) return
      const selectedTileset = session.document.tilesets?.find((tileset) => tileset.id === session.selectedTilesetId
        && tileset.tileWidth === tilemapTarget.tilemap.tileWidth
        && tileset.tileHeight === tilemapTarget.tilemap.tileHeight)
      const roleTileId = event.button === 2 ? session.secondaryTileId : session.selectedTileId
      const tilemapCell: TilemapCell | null = session.tool === 'eraser'
        ? null
        : selectedTileset && roleTileId && selectedTileset.tileIds.includes(roleTileId)
          ? { tilesetId: selectedTileset.id, tileId: roleTileId }
          : null
      if (session.tool === 'pencil' && !tilemapCell) return
      const tilemapEdit = beginTilemapEdit(tilemapTarget.layer.id, tilemapTarget.cel.frameId)
      if (writeTilemapCell(session.document, tilemapTarget, tilemapEdit, cellIndex, tilemapCell)) {
        invalidateCompositeRect(tilemapCellBounds(tilemapTarget.tilemap, tilemapTarget.surface.offsetX, tilemapTarget.surface.offsetY, cellIndex))
      }
      inputRef.current.drag = {
        kind: 'tile-draw',
        start: point,
        last: point,
        tilemapEdit,
        tilemapCell,
        tilemapCellIndex: cellIndex,
        startedAt: Date.now()
      }
      scheduleDraw()
      return
    }
    if (tilemapPixelEditBlocked) return
    const repeatMode = session.view.tileRepeatMode ?? 'off'
    const dynamics = brushDynamicsAtEvent(event)
    const rawRepeatedStart = tileRepeatPointAt(event.clientX, event.clientY) ?? point
    const isoRepeatedStart = isoGridSnapActive
      ? repeatedDocumentPointsAt(event.clientX, event.clientY, true, true)?.repeated ?? rawRepeatedStart
      : rawRepeatedStart
    const repeatedStart = isoGridSnapActive
      ? snapToIsoGrid(isoRepeatedStart)
      : gridSnapActive
        ? snapBrushPointToGrid(rawRepeatedStart, dynamics.size, activeBrushImage, dynamics.angle)
        : rawRepeatedStart
    const strokeStart = wrapDocumentPointForTileRepeat(repeatedStart, session.document.width, session.document.height, repeatMode)
    const edit = beginPixelEdit(editableLayer.id)
    const patternOrigin = brushPatternOrigin(strokeStart)
    const colorReplacement = session.tool === 'eraser' && event.button === 2
      ? { source: { ...session.primaryColor }, target: { ...session.secondaryColor } }
      : undefined
    const strokeColor = activeColor(event.button)
    const gradient = colorReplacement ? undefined : brushGradientAt(strokeColor, dynamics.gradientAmount)
    if (!isoGridSnapActive) {
      paintBrush(session.document, editableLayer, edit, strokeStart.x, strokeStart.y, dynamics.size, strokeColor, session.brushShape, pixelEditSelection, session.tool === 'pencil' || session.tool === 'eraser' ? activeBrushTexture : 'solid', session.brushTextureScale, session.tool === 'pencil' || session.tool === 'eraser' ? activeBrushImage : null, session.brushImageSettings, proceduralAntialiasStrength, activeBrushPaintMode, patternOrigin, session.symmetryAxes, symmetryCenter, colorReplacement, dynamics.opacityScale, undefined, false, gradient, repeatMode, activeBrushDither, dynamics.angle)
      invalidateStrokeSegment(strokeStart, strokeStart, dynamics.size, dynamics.angle)
    }
    inputRef.current.drag = {
      kind: 'draw',
      start: strokeStart,
      last: strokeStart,
      edit,
      path: isoGridSnapActive ? [] : [{ ...repeatedStart, size: dynamics.size, opacityScale: dynamics.opacityScale, angle: dynamics.angle, color: strokeColor, gradient }],
      tileRepeatPoint: repeatedStart,
      tileRepeatStart: repeatedStart,
      isoAlignedStroke: isoLineAlignmentActive ? session.tool : undefined,
      isoAlignedRawAnchor: isoLineAlignmentActive && !isoGridSnapActive ? isoRepeatedStart : undefined,
      isoAlignedRawEndpoint: isoLineAlignmentActive && !isoGridSnapActive ? isoRepeatedStart : undefined,
      isoAlignedDirectionSamples: isoLineAlignmentActive ? 0 : undefined,
      isoGridStrokeEdges: isoGridSnapActive ? [] : undefined,
      isoGridPointer: isoGridSnapActive ? isoRepeatedStart : undefined,
      isoGridHoveredEdgeKey: isoGridSnapActive ? null : undefined,
      patternOrigin,
      color: activeColor(event.button),
      colorReplacement,
      lastBrushSize: dynamics.size,
      lastOpacityScale: dynamics.opacityScale,
      lastBrushColor: strokeColor,
      lastBrushGradientActive: Boolean(gradient),
      brushSpeed: beginBrushSpeedTracking({ clientX: event.clientX, clientY: event.clientY, timeStamp: event.timeStamp }),
      startedAt: Date.now(),
      ...tilemapEditDragState
    }
    scheduleDraw()
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    const session = liveInputSession()
    const navigationShortcutActive = event.ctrlKey || event.metaKey || inputRef.current.spaceHeld || isCanvasViewNavigationTool(session.tool)
    if (canvasColorSamplingIntentActive() && !canvasColorSamplingActiveFor(canvasRef.current) && !inputRef.current.drag && !navigationShortcutActive) {
      event.currentTarget.style.cursor = canvasCursors.eyedropper
      return
    }
    const brushInputs = activeBrushInputsForTool(session.tool, session.fillKind ?? 'bucket', session.brushImage, session.brushTexture)
    const activeBrushImage = brushInputs.imageBrush
    const activeBrushTexture = brushInputs.texture
    const activeBrushDither = activeBrushImage ? undefined : session.brushDither ?? DEFAULT_BRUSH_DITHER_SETTINGS
    const activeBrushPaintMode = activeBrushImage?.intrinsicSize ? session.brushPaintMode : 'paint'
    const proceduralAntialiasStrength = brushInputs.fillTextureEnabled && session.proceduralAntialias && activeBrushImage?.id.startsWith('procedural:') ? session.proceduralAntialiasStrength : 0
    const activeColor = (button = 0): RgbaColor => session.tool === 'eraser'
      ? button === 2 ? session.secondaryColor : TRANSPARENT
      : button === 2 ? session.secondaryColor : session.primaryColor
    const brushDynamicsAt = (
      pointerType: string | undefined,
      pressure: number | undefined,
      speed = 0,
      pressureAvailable?: boolean,
      previousPressure?: number
  ): { size: number; opacityScale: number; gradientAmount: number | null; angle: number } => {
      const resolved = resolveBrushDynamics(session.brushDynamics, { pointerType, pressure, speed, pressureAvailable, previousPressure }, session.brushSize)
      return activeBrushImage?.intrinsicSize ? { ...resolved, size: session.brushSize } : resolved
    }
    const brushGradientAt = (buttonColor: RgbaColor, gradientAmount: number | null): BrushGradientSample | undefined => {
      if (session.tool !== 'pencil' || gradientAmount === null) return undefined
      const currentIsSecondary = sameRgbaColor(buttonColor, session.secondaryColor) && !sameRgbaColor(buttonColor, session.primaryColor)
      return {
        startColor: currentIsSecondary ? session.primaryColor : session.secondaryColor,
        endColor: buttonColor,
        gradientAmount,
        dither: session.brushDynamics.gradientDither
      }
    }
    syncHeldShortcutModifiers(event.nativeEvent)
    const pointerSamples = coalescedPointerClientPoints(event.nativeEvent).map((sample) => {
      const adapted = pressureAdapterRef.current.adapt({
        pointerId: event.pointerId,
        pointerType: sample.pointerType ?? event.pointerType,
        pressure: sample.pressure,
        buttons: event.buttons
      })
      return {
        ...sample,
        pointerType: adapted.pointerType,
        pressure: adapted.pressure,
        pressureAvailable: adapted.pressureAvailable,
        previousPressure: adapted.previousPressure
      }
    })
    const activeDrag = inputRef.current.drag
    if (activeDrag?.kind === 'sample-color' && routeCanvasColorSampling(event.clientX, event.clientY)) {
      inputRef.current.sampling = true
      event.currentTarget.style.cursor = canvasCursors.eyedropper
      scheduleDraw()
      return
    }
    const currentInteractionSession = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id) ?? session
    const freeTransformActive = currentInteractionSession.freeTransformActive === true
    const liveGroupSelectionActive = currentInteractionSession.selectedGroupIds.length > 0 || Boolean(currentInteractionSession.selectedGroupId)
    const liveGroupToolAllowed = currentInteractionSession.tool === 'move' || currentInteractionSession.tool === 'hand' || currentInteractionSession.tool === 'zoom' || currentInteractionSession.tool === 'rotate'
    if (liveGroupSelectionActive && !liveGroupToolAllowed && !isCanvasViewNavigationDrag(activeDrag)) {
      event.currentTarget.style.cursor = canvasCursors.unavailable
      event.preventDefault()
      return
    }
    if (freeTransformActive) {
      // A mode change can race with a pointer gesture that was started before
      // free transform became active. Stop stale content/layer/auxiliary
      // drags, while preserving panning and free-transform geometry drags
      // (corner reshape or content translation).
      const staleSymmetryDrag = symmetryDragRef.current
      if (staleSymmetryDrag) {
        symmetryDragRef.current = null
        if (event.currentTarget.hasPointerCapture(staleSymmetryDrag.pointerId)) event.currentTarget.releasePointerCapture(staleSymmetryDrag.pointerId)
      }
      const freeTransformDrag = (activeDrag?.kind === 'transform-content' || activeDrag?.kind === 'move-content') && activeDrag.freeTransform === true
      if (activeDrag && activeDrag.kind !== 'pan' && !freeTransformDrag) {
        cancelActiveCanvasInteraction()
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
        updateCursor(event)
        return
      }
    }
    if (activeDrag?.kind === 'pan' && activeDrag.startPan && activeDrag.startClient) {
      const clientDelta = viewDragClientDelta(
        { x: event.clientX, y: event.clientY },
        activeDrag.startClient,
        viewDragSensitivity
      )
      const delta = viewPanDeltaFromScreen(
        canvasClientDeltaForInterfaceScale(clientDelta.x, interfaceScale),
        canvasClientDeltaForInterfaceScale(clientDelta.y, interfaceScale),
        liveViewRef.current.rotation,
        rotationIndicatorPosition,
        liveViewRef.current.mirrored,
        liveViewRef.current.mirroredVertical
      )
      const constrained = constrainCanvasView({ ...liveViewRef.current, panX: activeDrag.startPan.x + delta.x, panY: activeDrag.startPan.y + delta.y })
      schedulePanPreview(
        constrained.panX,
        constrained.panY,
        activeDrag.startPan
      )
      event.currentTarget.style.cursor = canvasCursors.grabbing
      return
    }
    const symmetryDrag = symmetryDragRef.current
    if (symmetryDrag) {
      if (!symmetryAxisDragAllowed(symmetryAxisPreferences.locked, event.ctrlKey)) {
        const pointerId = symmetryDrag.pointerId
        symmetryDragRef.current = null
        if (event.currentTarget.hasPointerCapture(pointerId)) event.currentTarget.releasePointerCapture(pointerId)
        updateCursor(event)
        return
      }
      const point = localContinuousPointAt(event.clientX, event.clientY)
      if (point) useWorkspace.getState().setSymmetryCenter(moveSymmetryCenter(symmetryCenter, symmetryDrag.axis, point, session.document.width, session.document.height))
      event.currentTarget.style.cursor = canvasCursors.move
      scheduleDraw()
      return
    }
    const autoPanDrag = inputRef.current.drag
    if (autoPanDrag && ['marquee', 'lasso', 'polygon-lasso', 'freeform-shape', 'polygon-shape', 'line-shape', 'curve-shape', 'create-text-box', 'move-selection', 'move-selection-pivot', 'move-content', 'transform-content', 'rotate-content', 'shear-content'].includes(autoPanDrag.kind)) {
      const size = stageSize()
      const pointer = stagePoint(event.clientX, event.clientY)
      const edge = 28
      const edgeSpeed = (position: number, start: number, end: number): number => position < start + edge
        ? -Math.min(16, Math.max(2, (start + edge - position) * 0.4))
        : position > end - edge ? Math.min(16, Math.max(2, (position - (end - edge)) * 0.4)) : 0
      const screenX = edgeSpeed(pointer.x, 0, size.width)
      const screenY = edgeSpeed(pointer.y, 0, size.height)
      if (screenX !== 0 || screenY !== 0) {
        const view = liveViewRef.current
        const delta = viewPanDeltaFromScreen(-screenX, -screenY, view.rotation, rotationIndicatorPosition, view.mirrored, view.mirroredVertical)
        liveViewRef.current = constrainCanvasView({ ...view, panX: view.panX + delta.x, panY: view.panY + delta.y })
        useWorkspace.getState().setView({ panX: liveViewRef.current.panX, panY: liveViewRef.current.panY })
        applyRotationStyle(liveViewRef.current)
      }
    }
    updateCursor(event)
    inputRef.current.shiftLinePreview = lineConnectionPreviewActive(event.nativeEvent)
    const repeatMode = liveViewRef.current.tileRepeatMode ?? 'off'
    const repeatedMarquee = inputRef.current.drag?.kind === 'marquee' && !inputRef.current.drag.quickSelectCell && repeatMode !== 'off'
    const repeatedSelectionMove = (inputRef.current.drag?.kind === 'move-content' || inputRef.current.drag?.kind === 'move-selection') && repeatMode !== 'off'
    const allowOutsideCopies = Boolean((inputRef.current.drag?.kind === 'draw' || inputRef.current.drag?.kind === 'tile-draw' || repeatedMarquee || repeatedSelectionMove) && repeatMode !== 'off')
    const point = localPoint(event, allowOutsideCopies)
      ?? ((freeTransformActive || activeDrag?.freeTransform === true)
        ? localContinuousPointAt(event.clientX, event.clientY)
        : null)
    if (point) inputRef.current.updatePointer({ point, clientX: event.clientX, clientY: event.clientY, ctrlKey: event.ctrlKey, altKey: event.altKey })
    const modifierSizing = (activeLayer.kind !== 'tilemap' || session.tilemapMode !== 'paint') && (activeLayer.kind !== 'free-tile' || session.freeTileMode !== 'paint') && modifierActive(event.nativeEvent, 'brushSizeAdjust') && (session.tool === 'pencil' || session.tool === 'airbrush' || session.tool === 'eraser')
    if (modifierSizing && !inputRef.current.drag) {
      if (!inputRef.current.modifierBrushSize) inputRef.current.modifierBrushSize = { x: event.clientX, y: event.clientY, size: session.tool === 'airbrush' ? session.airbrushScatterRadius : session.brushSize }
      else {
        const delta = canvasClientDeltaForInterfaceScale(event.clientX - inputRef.current.modifierBrushSize.x, interfaceScale)
        const nextSize = inputRef.current.modifierBrushSize.size + Math.round(delta / 4)
        if (session.tool === 'airbrush') useWorkspace.getState().setAirbrushScatterRadius(nextSize)
        else useWorkspace.getState().setBrushSize(nextSize)
      }
      // The first move can initialize the modifier state after the cursor
      // update above. Refresh once more so Ctrl+Alt immediately shows the
      // pencil cursor instead of the temporary move cursor.
      updateCursor(event)
      scheduleDraw()
      return
    }
    if (!modifierSizing) inputRef.current.modifierBrushSize = null
    if (!point) return
    const drag = inputRef.current.drag
    if (!drag) { scheduleDraw(); return }
    const state = useWorkspace.getState()
    const previousPoint = drag.last
    if (drag.kind === 'brush-size' && drag.startClient) {
      drag.last = point
      const delta = canvasClientDeltaForInterfaceScale(event.clientX - drag.startClient.x, interfaceScale)
      const nextSize = (drag.startBrushSize ?? (session.tool === 'airbrush' ? session.airbrushScatterRadius : session.brushSize)) + Math.round(delta / 4)
      if (session.tool === 'airbrush') state.setAirbrushScatterRadius(nextSize)
      else state.setBrushSize(nextSize)
      event.currentTarget.style.cursor = canvasCursors.ewResize
      return
    }
    if (drag.kind === 'move-selection-pivot' && drag.selectionPivotStart) {
      const continuousPoint = localContinuousPointAt(event.clientX, event.clientY)
      if (!continuousPoint) return
      drag.last = continuousPoint
      drag.previewPivot = selectionPivotAtDragPoint(drag.selectionPivotStart, drag.start, continuousPoint)
      event.currentTarget.style.cursor = canvasCursors.move
      scheduleDraw()
      return
    }
    if (drag.kind === 'gradient') {
      inputRef.current.sampling = false
      event.currentTarget.style.cursor = canvasToolCursor(session.tool, session.primaryColor)
      drag.rawLast = point
      drag.constrain = event.shiftKey
      drag.gradientFromCenter = gradientType === 'radial' && Boolean(event.ctrlKey || event.metaKey)
      const gradientPoint = gridSnapActive ? snapPointToGrid(point, session.view.grid ?? DEFAULT_GRID_SETTINGS) : point
      drag.last = gradientType === 'linear' && event.shiftKey ? constrainGradientEndpoint(drag.start, gradientPoint) : gradientPoint
      scheduleDraw()
      return
    }
    drag.last = point
    if (drag.kind === 'sample-color') {
      if (point.x >= 0 && point.y >= 0 && point.x < session.document.width && point.y < session.document.height) {
        if (drag.tileSampling) {
          const sampledFreeTile = freeTileAtPoint(point)
          if (sampledFreeTile !== undefined) {
            if (sampledFreeTile) {
              state.setSelectedTile(sampledFreeTile.tilesetId, sampledFreeTile.tileId, drag.sampleSecondary ? 'secondary' : 'primary')
              state.setFreeTileMode('paint')
            }
            inputRef.current.sampling = true
            hideEyedropperMagnifier()
            event.currentTarget.style.cursor = canvasCursors.eyedropper
            scheduleDraw()
            return
          }
          const sampledTile = tilemapCellAtPoint(point)
          if (sampledTile) state.setSelectedTile(sampledTile.tilesetId, sampledTile.tileId, drag.sampleSecondary ? 'secondary' : 'primary')
          inputRef.current.sampling = true
          hideEyedropperMagnifier()
          event.currentTarget.style.cursor = canvasCursors.eyedropper
          scheduleDraw()
          return
        }
        const mask = activeLayerMask(session)
        const sampled = mask ? readLayerMaskDisplayColorAt(mask, point.x, point.y) : cursorCompositePointSamplerFor(session)(point.x, point.y)
        if (drag.sampleSecondary) state.setSecondaryColor(sampled)
        else state.setPrimaryColor(sampled)
        drag.sampledColor = { ...sampled }
        publishCanvasColorSample(sampled, Boolean(drag.sampleSecondary))
        inputRef.current.sampling = true
        updateEyedropperMagnifier(event.clientX, event.clientY, sampled)
      } else {
        hideEyedropperMagnifier()
      }
      event.currentTarget.style.cursor = canvasCursors.eyedropper
      scheduleDraw()
      return
    }
    if (drag.kind === 'zoom-drag' && drag.startClient) {
      const zoom = zoomDragTarget(drag.startZoom ?? session.view.zoom, canvasClientDeltaForInterfaceScale(event.clientX - drag.startClient.x, interfaceScale), zoomDragModeForModifiers(zoomToolDragMode, event.shiftKey))
      const size = stageSize()
      scheduleZoomPreview(constrainCanvasView({ ...liveViewRef.current, ...zoomViewAroundViewportPoint(
        liveViewRef.current,
        zoom,
        stagePoint(drag.startClient.x, drag.startClient.y),
        size.width,
        size.height,
        session.document.width,
        session.document.height,
        rotationIndicatorPosition
      ) }))
      return
    }
    if (drag.kind === 'rotate-view' && drag.startAngle !== undefined && drag.startRotation !== undefined) {
      const size = stageSize()
      const pointer = stagePoint(event.clientX, event.clientY)
      const resetRotation = modifierActive(event.nativeEvent, 'resetViewRotation')
      const startPan = drag.startPan ?? { x: liveViewRef.current.panX, y: liveViewRef.current.panY }
      const pivot = drag.rotationPivot ?? viewRotationPivot(size.width, size.height, startPan.x, startPan.y, rotationIndicatorPosition)
      const angle = Math.atan2(pointer.y - pivot.y, pointer.x - pivot.x) * 180 / Math.PI
      let rotation = drag.startRotation + angle - drag.startAngle
      if (modifierActive(event.nativeEvent, 'snapViewRotation')) rotation = Math.round(rotation / 45) * 45
      const normalizedRotation = resetRotation ? 0 : ((rotation % 360) + 360) % 360
      const rotatedView = rotateViewAroundViewportPoint(
        { ...liveViewRef.current, panX: startPan.x, panY: startPan.y, rotation: drag.startRotation },
        normalizedRotation,
        pivot,
        size.width,
        size.height,
        rotationIndicatorPosition
      )
      liveViewRef.current = constrainCanvasView({ ...liveViewRef.current, panX: rotatedView.panX, panY: rotatedView.panY, rotation: normalizedRotation })
      applyRotationStyle(liveViewRef.current)
      updateRotationIndicator(normalizedRotation, true)
      scheduleDraw()
      state.setView({ panX: liveViewRef.current.panX, panY: liveViewRef.current.panY, rotation: normalizedRotation })
      return
    }
    if (drag.kind === 'canvas-resize' && drag.canvasPreview && drag.canvasEdge) {
      const start = drag.canvasPreview
      let left = -start.offsetX; let top = -start.offsetY
      let right = left + start.width; let bottom = top + start.height
      if (drag.canvasEdge.includes('w')) left = Math.min(right - 1, point.x)
      if (drag.canvasEdge.includes('e')) right = Math.max(left + 1, point.x + 1)
      if (drag.canvasEdge.includes('n')) top = Math.min(bottom - 1, point.y)
      if (drag.canvasEdge.includes('s')) bottom = Math.max(top + 1, point.y + 1)
      scheduleCanvasResizePreview({ width: right - left, height: bottom - top, offsetX: -left, offsetY: -top })
      return
    }
    if (drag.kind === 'canvas-move' && drag.canvasPreview) {
      const distance = constrainedTranslation(drag, point.x - drag.start.x, point.y - drag.start.y, modifierActive(event.nativeEvent, 'constrainAxis'))
      scheduleCanvasResizePreview({
        ...drag.canvasPreview,
        offsetX: drag.canvasPreview.offsetX - distance.x,
        offsetY: drag.canvasPreview.offsetY - distance.y
      })
      event.currentTarget.style.cursor = canvasCursors.move
      return
    }
    if (drag.kind === 'free-tile-instance-move' && drag.freeTilePlacementEdit && drag.freeTileInstanceId) {
      const target = activeFreeTileCelTarget(session.document)
      if (!target || target.layer.id !== drag.freeTilePlacementEdit.layerId || target.cel.frameId !== drag.freeTilePlacementEdit.frameId) return
      const instanceIds = drag.freeTileInstanceIds?.length ? drag.freeTileInstanceIds : [drag.freeTileInstanceId]
      const instances = instanceIds.flatMap((id) => {
        const instance = drag.freeTilePlacementEdit!.after.instances.find((candidate) => candidate.id === id)
        if (!instance) return []
        const start = drag.freeTileInstanceStarts?.[id] ?? (id === drag.freeTileInstanceId ? drag.freeTileInstanceStart : undefined)
        return start ? [{ instance, start }] : []
      })
      if (instances.length === 0) return
      const distance = constrainedTranslation(drag, point.x - drag.start.x, point.y - drag.start.y, modifierActive(event.nativeEvent, 'constrainAxis'))
      let dirtyRect = drag.freeTilePlacementEdit.dirtyRect
      let changed = false
      for (const { instance, start } of instances) {
        const nextX = start.x + distance.x
        const nextY = start.y + distance.y
        if (instance.x === nextX && instance.y === nextY) continue
        const previousBounds = freeTileInstanceBounds(instance, target.sources, target.surface.offsetX, target.surface.offsetY)
        instance.x = nextX
        instance.y = nextY
        dirtyRect = unionFreeTileDirtyRect(dirtyRect, previousBounds)
        dirtyRect = unionFreeTileDirtyRect(dirtyRect, freeTileInstanceBounds(instance, target.sources, target.surface.offsetX, target.surface.offsetY))
        changed = true
      }
      if (!changed) return
      drag.freeTilePlacementEdit.dirtyRect = dirtyRect
      state.previewFreeTilePlacement(drag.freeTilePlacementEdit)
      compositeCacheRef.current.invalidateAll()
      event.currentTarget.style.cursor = canvasCursors.move
      scheduleDraw()
      return
    }
    if (drag.kind === 'move-layer' && drag.layerId && drag.layerOffset) {
      const distance = alignedDragTranslation(drag, constrainedTranslation(drag, point.x - drag.start.x, point.y - drag.start.y, modifierActive(event.nativeEvent, 'constrainAxis')))
      const distanceX = distance.x
      const distanceY = distance.y
      drag.moved = drag.moved || distanceX !== 0 || distanceY !== 0
      const previousDistance = drag.layerPreviewOffset ?? { x: 0, y: 0 }
      if (previousDistance.x === distanceX && previousDistance.y === distanceY) return
      if (drag.selectionPivotStart) drag.previewPivot = { x: drag.selectionPivotStart.x + distanceX, y: drag.selectionPivotStart.y + distanceY }
      if (drag.duplicateOnDrag && !drag.duplicatedLayerId && (distanceX !== 0 || distanceY !== 0)) {
        const duplicate = state.beginLayerMoveDuplicatePreview(session.document.id, drag.layerId, t('canvas.history.copySuffix'))
        if (duplicate) {
          drag.duplicatedLayerId = duplicate.layerId
          drag.duplicatedLayer = duplicate.layer
          drag.duplicatedAnimationCels = duplicate.animationCels
          drag.duplicatedLayerIndex = duplicate.insertionIndex
          drag.animationMaskOffsets = animationMaskOffsetsForLayerMove(session, [duplicate.layerId], ensureAnimationDocument(session.document).activeFrameId)
        }
      }
      if (!state.previewLayerMove(session.document.id, drag, distanceX, distanceY)) return
      invalidateOnionSkinDragFrames(drag)
      if (drag.layerContentBounds) {
        let dirtyPixels = 0
        for (const bounds of Object.values(drag.layerContentBounds)) {
          if (!bounds) continue
          dirtyPixels += bounds.width * bounds.height * 2
          invalidateCompositeRect(translatedSelectionRect(bounds, previousDistance))
          invalidateCompositeRect(translatedSelectionRect(bounds, distance))
        }
        window.__moonSpriteCanvasProbe?.recordOperationStage?.('move-layer.cache-invalidation', 0, { dirtyPixels })
      } else {
        compositeCacheRef.current.invalidateAll()
      }
      drag.layerPreviewOffset = { x: distanceX, y: distanceY }
      scheduleDraw()
      return
    }
    if (drag.kind === 'free-tile-draw' && drag.freeTilePlacementEdit) {
      // Placement is a click action; only the eraser keeps a continuous drag gesture.
      if (session.tool !== 'eraser') {
        scheduleDraw()
        return
      }
      const target = activeFreeTileCelTarget(session.document)
      if (!target || target.layer.id !== drag.freeTilePlacementEdit.layerId || target.cel.frameId !== drag.freeTilePlacementEdit.frameId) return
      let previous = drag.freeTileLastLocal ?? previousPoint
      let changed = false
      for (const sample of pointerSamples) {
        const samplePoint = localPointAt(sample.clientX, sample.clientY, true)
        if (!samplePoint) continue
        const points = rasterLinePoints(previous, samplePoint)
        for (let index = 1; index < points.length; index += 1) {
          const drawPoint = points[index]
          if (session.selection && !selectionContains(session.selection, drawPoint.x, drawPoint.y)) continue
          if (session.tool === 'eraser') {
            const instance = freeTileInstanceAtPoint(
              drag.freeTilePlacementEdit.after,
              target.sources,
              drawPoint.x,
              drawPoint.y,
              target.surface.offsetX,
              target.surface.offsetY
            )
            if (!instance || instance.locked === true) continue
            drag.freeTilePlacementEdit.after.instances = drag.freeTilePlacementEdit.after.instances.filter((candidate) => candidate.id !== instance.id)
            if (session.selectedFreeTileInstanceId === instance.id) state.setSelectedFreeTileInstance(null)
            drag.freeTilePlacementEdit.dirtyRect = unionFreeTileDirtyRect(
              drag.freeTilePlacementEdit.dirtyRect,
              freeTileInstanceBounds(instance, target.sources, target.surface.offsetX, target.surface.offsetY)
            )
            changed = true
            continue
          }
          const source = freeTileSourceForId(session.document, target.layer, drag.freeTileSourceId)
          if (!source) continue
          const origin = freeTileSourceStampOrigin(drawPoint.x, drawPoint.y, source, target.surface.offsetX, target.surface.offsetY)
          if (drag.freeTileLastStampOrigin?.x === origin.x && drag.freeTileLastStampOrigin.y === origin.y) continue
          const instance: FreeTileInstance = { id: createId('free-tile-instance'), sourceId: source.id, x: origin.x, y: origin.y, opacity: source.opacity, blendMode: source.blendMode }
          drag.freeTilePlacementEdit.after.instances.push(instance)
          drag.freeTileInstanceId = instance.id
          drag.freeTilePlacementEdit.dirtyRect = unionFreeTileDirtyRect(
            drag.freeTilePlacementEdit.dirtyRect,
            freeTileInstanceBounds(instance, target.sources, target.surface.offsetX, target.surface.offsetY)
          )
          drag.freeTileLastStampOrigin = origin
          changed = true
        }
        previous = samplePoint
      }
      drag.freeTileLastLocal = previous
      if (changed) {
        state.previewFreeTilePlacement(drag.freeTilePlacementEdit)
        if (drag.freeTileInstanceId && session.tool !== 'eraser') state.setSelectedFreeTileInstance(drag.freeTileInstanceId)
        compositeCacheRef.current.invalidateAll()
      }
      scheduleDraw()
      return
    }
    if (drag.kind === 'free-tile-edit' && drag.edit && drag.freeTileEditDocument && drag.freeTileEditLayer && drag.freeTileEditOrigin && drag.freeTileSourceId && drag.freeTileSourceBefore && drag.freeTileEditSourceOffset) {
      let previous = drag.freeTileLastLocal ?? { x: previousPoint.x - drag.freeTileEditOrigin.x, y: previousPoint.y - drag.freeTileEditOrigin.y }
      let previousSize = drag.lastBrushSize ?? session.brushSize
      let previousOpacity = drag.lastOpacityScale ?? 1
      if (drag.isoAlignedStroke && drag.isoGridPointer) {
        for (const sample of pointerSamples) {
          const documentPoint = repeatedDocumentPointsAt(sample.clientX, sample.clientY, true, true)?.local ?? null
          if (!documentPoint) continue
          const speedSample = updateBrushSpeedTracking(drag.brushSpeed, sample)
          drag.brushSpeed = speedSample.state
          const targetDynamics = brushDynamicsAt(sample.pointerType ?? event.pointerType, sample.pressure, speedSample.speed, sample.pressureAvailable, sample.previousPressure)
          const strokes = advanceIsoGridBrushEdges(drag, documentPoint, targetDynamics)
          for (const stroke of strokes) {
            const localFrom = { x: stroke.from.x - drag.freeTileEditOrigin.x, y: stroke.from.y - drag.freeTileEditOrigin.y }
            const localTo = { x: stroke.to.x - drag.freeTileEditOrigin.x, y: stroke.to.y - drag.freeTileEditOrigin.y }
            const fromColor = stroke.from.color ?? drag.color ?? activeColor()
            const toColor = stroke.to.color ?? fromColor
            paintLine(
              drag.freeTileEditDocument,
              drag.freeTileEditLayer,
              drag.edit,
              localFrom.x,
              localFrom.y,
              localTo.x,
              localTo.y,
              session.brushSize,
              fromColor,
              drag.freeTileEditSelection ?? null,
              session.brushShape,
              activeBrushTexture,
              session.brushTextureScale,
              activeBrushImage,
              session.brushImageSettings,
              proceduralAntialiasStrength,
              activeBrushPaintMode,
              drag.patternOrigin,
              'balanced',
              undefined,
              undefined,
              drag.colorReplacement,
              {
                fromSize: stroke.from.size ?? session.brushSize,
                toSize: stroke.to.size ?? session.brushSize,
                fromOpacityScale: stroke.from.opacityScale ?? 1,
                toOpacityScale: stroke.to.opacityScale ?? 1,
                fromAngle: stroke.from.angle ?? 0,
                toAngle: stroke.to.angle ?? 0,
                fromColor,
                toColor,
                gradient: brushLineGradient(stroke.from.gradient, stroke.to.gradient)
              },
              'off',
              activeBrushDither
            )
            previous = localTo
            previousSize = stroke.to.size ?? session.brushSize
            previousOpacity = stroke.to.opacityScale ?? 1
            drag.last = { x: stroke.to.x, y: stroke.to.y }
          }
        }
      } else if (drag.isoAlignedStroke) {
        let pathChanged = false
        for (const sample of pointerSamples) {
          const documentPoint = isoGridSnapActive
            ? repeatedDocumentPointsAt(sample.clientX, sample.clientY, true, true)?.local ?? null
            : localPointAt(sample.clientX, sample.clientY, true)
          if (!documentPoint) continue
          const speedSample = updateBrushSpeedTracking(drag.brushSpeed, sample)
          drag.brushSpeed = speedSample.state
          const targetDynamics = brushDynamicsAt(sample.pointerType ?? event.pointerType, sample.pressure, speedSample.speed, sample.pressureAvailable, sample.previousPressure)
          pathChanged = Boolean(advanceIsoBrushPath(drag, documentPoint, targetDynamics)) || pathChanged
        }
        if (pathChanged && drag.path && drag.path.length > 1) {
          revertPixelEdit(drag.freeTileEditDocument, drag.edit)
          drag.edit = beginPixelEdit(drag.freeTileEditLayer.id)
          for (let index = 1; index < drag.path.length; index += 1) {
            const from = drag.path[index - 1]
            const to = drag.path[index]
            const localFrom = { x: from.x - drag.freeTileEditOrigin.x, y: from.y - drag.freeTileEditOrigin.y }
            const localTo = { x: to.x - drag.freeTileEditOrigin.x, y: to.y - drag.freeTileEditOrigin.y }
            const fromColor = from.color ?? drag.color ?? activeColor()
            const toColor = to.color ?? fromColor
            paintLine(
              drag.freeTileEditDocument,
              drag.freeTileEditLayer,
              drag.edit,
              localFrom.x,
              localFrom.y,
              localTo.x,
              localTo.y,
              session.brushSize,
              fromColor,
              drag.freeTileEditSelection ?? null,
              session.brushShape,
              activeBrushTexture,
              session.brushTextureScale,
              activeBrushImage,
              session.brushImageSettings,
              proceduralAntialiasStrength,
              activeBrushPaintMode,
              drag.patternOrigin,
              'balanced',
              undefined,
              undefined,
              drag.colorReplacement,
              {
                fromSize: from.size ?? session.brushSize,
                toSize: to.size ?? session.brushSize,
                fromOpacityScale: from.opacityScale ?? 1,
                toOpacityScale: to.opacityScale ?? 1,
                fromAngle: from.angle ?? 0,
                toAngle: to.angle ?? 0,
                fromColor,
                toColor,
                gradient: brushLineGradient(from.gradient, to.gradient)
              },
              'off',
              activeBrushDither
            )
          }
          const endpoint = drag.path.at(-1)!
          previous = { x: endpoint.x - drag.freeTileEditOrigin.x, y: endpoint.y - drag.freeTileEditOrigin.y }
          previousSize = endpoint.size ?? session.brushSize
          previousOpacity = endpoint.opacityScale ?? 1
          drag.last = { x: endpoint.x, y: endpoint.y }
        }
      } else {
        for (const sample of pointerSamples) {
          const documentPoint = localPointAt(sample.clientX, sample.clientY, true)
          if (!documentPoint) continue
          const local = { x: documentPoint.x - drag.freeTileEditOrigin.x, y: documentPoint.y - drag.freeTileEditOrigin.y }
          const speedSample = updateBrushSpeedTracking(drag.brushSpeed, sample)
          drag.brushSpeed = speedSample.state
          const dynamics = brushDynamicsAt(sample.pointerType ?? event.pointerType, sample.pressure, speedSample.speed, sample.pressureAvailable, sample.previousPressure)
          const distance = Math.max(Math.abs(local.x - previous.x), Math.abs(local.y - previous.y))
          const size = activeBrushImage?.intrinsicSize
            ? dynamics.size
            : smoothBrushSizeEnvelope(previousSize, dynamics.size, session.brushSize, distance)
          paintLine(
            drag.freeTileEditDocument,
            drag.freeTileEditLayer,
            drag.edit,
            previous.x,
            previous.y,
            local.x,
            local.y,
            session.brushSize,
            drag.color ?? activeColor(),
            drag.freeTileEditSelection ?? null,
            session.brushShape,
            activeBrushTexture,
            session.brushTextureScale,
            activeBrushImage,
            session.brushImageSettings,
            proceduralAntialiasStrength,
            activeBrushPaintMode,
            drag.patternOrigin,
            'raster',
            undefined,
            undefined,
            drag.colorReplacement,
            { fromSize: previousSize, toSize: size, fromOpacityScale: previousOpacity, toOpacityScale: dynamics.opacityScale, fromAngle: drag.path?.at(-1)?.angle ?? 0, toAngle: dynamics.angle },
            'off',
            activeBrushDither
          )
          previous = local
          previousSize = size
          previousOpacity = dynamics.opacityScale
        }
      }
      drag.freeTileLastLocal = previous
      drag.lastBrushSize = previousSize
      drag.lastOpacityScale = previousOpacity
      const sourceEdit: FreeTileSourceEditRaster = {
        document: drag.freeTileEditDocument,
        layer: drag.freeTileEditLayer,
        before: drag.freeTileSourceBefore,
        origin: drag.freeTileEditOrigin,
        sourceOffset: drag.freeTileEditSourceOffset,
        instanceTransform: drag.freeTileEditInstanceTransform ?? {},
        transformedSourceBounds: drag.freeTileEditTransformedSourceBounds ?? { x: drag.freeTileSourceBefore.offsetX, y: drag.freeTileSourceBefore.offsetY, width: drag.freeTileSourceBefore.width, height: drag.freeTileSourceBefore.height }
      }
      const cropped = freeTileSourceSnapshotFromEditRaster(sourceEdit)
      state.previewFreeTileSource(drag.freeTileSourceId, cropped.width, cropped.height, cropped.pixels, cropped.offsetX, cropped.offsetY)
      compositeCacheRef.current.invalidateAll()
      scheduleDraw()
      return
    }
    if (drag.kind === 'tile-draw' && drag.tilemapEdit && drag.tilemapCellIndex !== undefined) {
      const target = activeTilemapCelTarget(session.document)
      if (!target || target.layer.id !== drag.tilemapEdit.layerId || target.cel.frameId !== drag.tilemapEdit.frameId) return
      let previousIndex = drag.tilemapCellIndex
      for (const sample of pointerSamples) {
        const samplePoint = localPointAt(sample.clientX, sample.clientY, true)
        if (!samplePoint) continue
        const nextIndex = tilemapCellIndexAtPoint(target.tilemap, target.surface.offsetX, target.surface.offsetY, samplePoint.x, samplePoint.y)
        if (nextIndex === null) continue
        for (const index of tilemapCellLineIndices(target.tilemap, previousIndex, nextIndex, session.view.tileRepeatMode ?? 'off')) {
          if (!tilemapCellAllowedBySelection(target, index, session.selection)) continue
          if (!writeTilemapCell(session.document, target, drag.tilemapEdit, index, drag.tilemapCell ?? null)) continue
          invalidateCompositeRect(tilemapCellBounds(target.tilemap, target.surface.offsetX, target.surface.offsetY, index))
        }
        previousIndex = nextIndex
      }
      drag.tilemapCellIndex = previousIndex
      scheduleDraw()
      return
    }
    if (drag.kind === 'draw' && drag.edit) {
      const repeatMode = session.view.tileRepeatMode ?? 'off'
      let segmentStart = drag.tileRepeatPoint ?? previousPoint
      let segmentStartSize = drag.lastBrushSize ?? session.brushSize
      let segmentStartOpacityScale = drag.lastOpacityScale ?? 1
      let segmentStartAngle = drag.path?.at(-1)?.angle ?? 0
      let segmentStartColor = drag.lastBrushColor ?? drag.color ?? activeColor()
      let segmentStartGradient = drag.path?.at(-1)?.gradient
      let rebuiltStroke = false
      const paintRepeatedSegment = (
        from: Point,
        to: Point,
        fromSize: number,
        toSize: number,
        fromOpacityScale: number,
        toOpacityScale: number,
        fromAngle: number,
        toAngle: number,
        color: RgbaColor,
        fromGradient: BrushGradientSample | undefined,
        toGradient: BrushGradientSample | undefined,
        algorithm: 'raster' | 'balanced' = 'raster'
      ): Array<{ from: Point; to: Point }> => {
        const segments = tileRepeatLineSegments(from, to, session.document.width, session.document.height, repeatMode, algorithm)
        const gradient = brushLineGradient(fromGradient, toGradient)
        const interpolate = (start: number, end: number, progress: number): number => start + (end - start) * progress
        for (const segment of segments) {
          paintLine(session.document, activePaintLayer(session), drag.edit!, segment.from.x, segment.from.y, segment.to.x, segment.to.y, session.brushSize, color, paintSelectionForDrag(drag), session.brushShape, session.tool === 'pencil' || session.tool === 'eraser' ? activeBrushTexture : 'solid', session.brushTextureScale, session.tool === 'pencil' || session.tool === 'eraser' ? activeBrushImage : null, session.brushImageSettings, proceduralAntialiasStrength, activeBrushPaintMode, drag.patternOrigin, algorithm, session.symmetryAxes, symmetryCenter, drag.colorReplacement, {
            fromSize: interpolate(fromSize, toSize, segment.fromProgress),
            toSize: interpolate(fromSize, toSize, segment.toProgress),
            fromOpacityScale: interpolate(fromOpacityScale, toOpacityScale, segment.fromProgress),
            toOpacityScale: interpolate(fromOpacityScale, toOpacityScale, segment.toProgress),
            fromAngle: interpolateBrushAngle(fromAngle, toAngle, segment.fromProgress),
            toAngle: interpolateBrushAngle(fromAngle, toAngle, segment.toProgress),
            gradient: gradient ? {
              ...gradient,
              fromAmount: interpolate(gradient.fromAmount, gradient.toAmount, segment.fromProgress),
              toAmount: interpolate(gradient.fromAmount, gradient.toAmount, segment.toProgress)
            } : undefined
          }, repeatMode, activeBrushDither)
        }
        return segments
      }
      if (drag.isoAlignedStroke && drag.isoGridPointer) {
        let paintedEdge = false
        for (const sample of pointerSamples) {
          const repeatedPoints = repeatedDocumentPointsAt(sample.clientX, sample.clientY, true, true)
          if (!repeatedPoints) continue
          const speedSample = updateBrushSpeedTracking(drag.brushSpeed, sample)
          drag.brushSpeed = speedSample.state
          const targetDynamics = brushDynamicsAt(sample.pointerType ?? event.pointerType, sample.pressure, speedSample.speed, sample.pressureAvailable, sample.previousPressure)
          const strokes = advanceIsoGridBrushEdges(drag, repeatedPoints.repeated, targetDynamics)
          for (const stroke of strokes) {
            paintRepeatedSegment(
              stroke.from,
              stroke.to,
              stroke.from.size ?? session.brushSize,
              stroke.to.size ?? session.brushSize,
              stroke.from.opacityScale ?? 1,
              stroke.to.opacityScale ?? 1,
              stroke.from.angle ?? 0,
              stroke.to.angle ?? 0,
              stroke.from.color ?? drag.color ?? activeColor(),
              stroke.from.gradient,
              stroke.to.gradient,
              'balanced'
            )
            drag.last = wrapDocumentPointForTileRepeat(stroke.to, session.document.width, session.document.height, repeatMode)
            drag.tileRepeatPoint = stroke.to
            paintedEdge = true
          }
        }
        if (paintedEdge) compositeCacheRef.current.invalidateAll()
        scheduleDraw()
        return
      }
      if (drag.isoAlignedStroke) {
        let pathChanged = false
        for (const sample of pointerSamples) {
          const repeatedPoints = repeatedDocumentPointsAt(sample.clientX, sample.clientY, isoGridSnapActive, true)
          if (!repeatedPoints) continue
          const speedSample = updateBrushSpeedTracking(drag.brushSpeed, sample)
          drag.brushSpeed = speedSample.state
          const targetDynamics = brushDynamicsAt(sample.pointerType ?? event.pointerType, sample.pressure, speedSample.speed, sample.pressureAvailable, sample.previousPressure)
          pathChanged = Boolean(advanceIsoBrushPath(drag, repeatedPoints.repeated, targetDynamics)) || pathChanged
        }
        if (!pathChanged || !drag.path || drag.path.length < 2) { scheduleDraw(); return }
        revertPixelEdit(session.document, drag.edit)
        drag.edit = beginPixelEdit(activePaintLayer(session).id)
        for (let index = 1; index < drag.path.length; index += 1) {
          const from = drag.path[index - 1]
          const to = drag.path[index]
          paintRepeatedSegment(
            from,
            to,
            from.size ?? session.brushSize,
            to.size ?? session.brushSize,
            from.opacityScale ?? 1,
            to.opacityScale ?? 1,
            from.angle ?? 0,
            to.angle ?? 0,
            from.color ?? drag.color ?? activeColor(),
            from.gradient,
            to.gradient,
            'balanced'
          )
        }
        const alignedTarget = drag.path.at(-1)!
        const localTarget = wrapDocumentPointForTileRepeat(alignedTarget, session.document.width, session.document.height, repeatMode)
        drag.last = localTarget
        drag.tileRepeatPoint = alignedTarget
        compositeCacheRef.current.invalidateAll()
        scheduleDraw()
        return
      }
      for (const sample of pointerSamples) {
        const repeatedPoints = repeatedDocumentPointsAt(sample.clientX, sample.clientY, false, true)
        if (!repeatedPoints) continue
        const rawPoint = repeatedPoints.local
        const rawRepeatedPoint = repeatedPoints.repeated
        const speedSample = updateBrushSpeedTracking(drag.brushSpeed, sample)
        drag.brushSpeed = speedSample.state
        const dynamics = brushDynamicsAt(sample.pointerType ?? event.pointerType, sample.pressure, speedSample.speed, sample.pressureAvailable, sample.previousPressure)
        const rasterDistance = Math.max(Math.abs(rawRepeatedPoint.x - segmentStart.x), Math.abs(rawRepeatedPoint.y - segmentStart.y))
        const acceptedSize = activeBrushImage?.intrinsicSize
          ? dynamics.size
          : smoothBrushSizeEnvelope(segmentStartSize, dynamics.size, session.brushSize, rasterDistance)
        const repeatedPoint = gridSnapActive
          ? snapBrushPointToGrid(rawRepeatedPoint, acceptedSize, activeBrushImage, dynamics.angle)
          : rawRepeatedPoint
        const point = gridSnapActive
          ? wrapDocumentPointForTileRepeat(repeatedPoint, session.document.width, session.document.height, repeatMode)
          : rawPoint
        const sampleColor = drag.color ?? activeColor()
        const sampleGradient = drag.colorReplacement ? undefined : brushGradientAt(sampleColor, dynamics.gradientAmount)
        const samePoint = repeatedPoint.x === segmentStart.x && repeatedPoint.y === segmentStart.y
        const sameColor = sampleColor.r === segmentStartColor.r && sampleColor.g === segmentStartColor.g && sampleColor.b === segmentStartColor.b && sampleColor.a === segmentStartColor.a
        const sameGradient = (!segmentStartGradient && !sampleGradient) || Boolean(segmentStartGradient && sampleGradient
          && segmentStartGradient.gradientAmount === sampleGradient.gradientAmount
          && segmentStartGradient.dither === sampleGradient.dither
          && sameRgbaColor(segmentStartGradient.startColor, sampleGradient.startColor)
          && sameRgbaColor(segmentStartGradient.endColor, sampleGradient.endColor))
        if (samePoint && acceptedSize === segmentStartSize && dynamics.opacityScale === segmentStartOpacityScale && sameColor && sameGradient) continue
        drag.last = point
        drag.tileRepeatPoint = repeatedPoint
        drag.lastBrushSize = acceptedSize
        drag.lastOpacityScale = dynamics.opacityScale
        drag.lastBrushColor = sampleColor
        drag.lastBrushGradientActive = Boolean(sampleGradient)
        if (session.perfectPixels) {
          const path = drag.path ?? [{ ...segmentStart, size: segmentStartSize, opacityScale: segmentStartOpacityScale, angle: segmentStartAngle, color: segmentStartColor, gradient: segmentStartGradient }]
          if (samePoint) {
            const last = path.at(-1)
            if (last) {
              last.size = acceptedSize
              last.opacityScale = Math.max(last.opacityScale ?? dynamics.opacityScale, dynamics.opacityScale)
              last.angle = dynamics.angle
              last.color = sampleColor
              last.gradient = sampleGradient
            }
          paintBrush(session.document, activePaintLayer(session), drag.edit, point.x, point.y, acceptedSize, sampleColor, session.brushShape, paintSelectionForDrag(drag), session.tool === 'pencil' || session.tool === 'eraser' ? activeBrushTexture : 'solid', session.brushTextureScale, session.tool === 'pencil' || session.tool === 'eraser' ? activeBrushImage : null, session.brushImageSettings, proceduralAntialiasStrength, activeBrushPaintMode, drag.patternOrigin, session.symmetryAxes, symmetryCenter, drag.colorReplacement, dynamics.opacityScale, undefined, false, sampleGradient, repeatMode, activeBrushDither, dynamics.angle)
          } else {
            const removedCorner = appendPerfectPixelSegment(path, { ...repeatedPoint, size: acceptedSize, opacityScale: dynamics.opacityScale, angle: dynamics.angle, color: sampleColor, gradient: sampleGradient })
            if (removedCorner) {
              revertPixelEdit(session.document, drag.edit)
              const paintLayer = activePaintLayer(session)
              const edit = beginPixelEdit(paintLayer.id)
              for (const center of path) {
                const wrapped = wrapDocumentPointForTileRepeat(center, session.document.width, session.document.height, repeatMode)
                paintBrush(session.document, paintLayer, edit, wrapped.x, wrapped.y, center.size ?? session.brushSize, center.color ?? drag.color ?? activeColor(), session.brushShape, paintSelectionForDrag(drag), session.tool === 'pencil' || session.tool === 'eraser' ? activeBrushTexture : 'solid', session.brushTextureScale, session.tool === 'pencil' || session.tool === 'eraser' ? activeBrushImage : null, session.brushImageSettings, proceduralAntialiasStrength, activeBrushPaintMode, drag.patternOrigin, session.symmetryAxes, symmetryCenter, drag.colorReplacement, center.opacityScale ?? 1, center.coverageKey, center.overrideImageBrushColor, center.gradient, repeatMode, activeBrushDither, center.angle)
              }
              drag.edit = edit
              rebuiltStroke = true
            } else {
              paintRepeatedSegment(segmentStart, repeatedPoint, segmentStartSize, acceptedSize, segmentStartOpacityScale, dynamics.opacityScale, segmentStartAngle, dynamics.angle, segmentStartColor, segmentStartGradient, sampleGradient)
            }
            drag.path = path
          }
        } else {
          paintRepeatedSegment(segmentStart, repeatedPoint, segmentStartSize, acceptedSize, segmentStartOpacityScale, dynamics.opacityScale, segmentStartAngle, dynamics.angle, segmentStartColor, segmentStartGradient, sampleGradient)
          drag.path = [{ ...repeatedPoint, size: acceptedSize, opacityScale: dynamics.opacityScale, angle: dynamics.angle, color: sampleColor, gradient: sampleGradient }]
        }
        if (rebuiltStroke) compositeCacheRef.current.invalidateAll()
        else for (const segment of tileRepeatLineSegments(segmentStart, repeatedPoint, session.document.width, session.document.height, repeatMode)) {
          invalidateStrokeSegment(segment.from, segment.to, Math.max(segmentStartSize, acceptedSize), Math.max(segmentStartAngle, dynamics.angle))
        }
        segmentStart = repeatedPoint
        segmentStartSize = acceptedSize
        segmentStartOpacityScale = dynamics.opacityScale
        segmentStartAngle = dynamics.angle
        segmentStartColor = sampleColor
        segmentStartGradient = sampleGradient
      }
      scheduleDraw(); return
    }
    if (drag.kind === 'airbrush') {
      drag.last = gridSnapActive ? snapPointToGrid(point, session.view.grid ?? DEFAULT_GRID_SETTINGS) : point
      scheduleDraw()
      return
    }
    if (drag.kind === 'shape') {
      const modifiers = currentSelectionMarqueeModifierState()
      drag.constrain = modifiers.proportional
      updateShapePreview(drag, gridSnapActive ? snapPointToGrid(point, session.view.grid ?? DEFAULT_GRID_SETTINGS) : point, modifiers)
      return
    }
    if (drag.kind === 'freeform-shape') {
      const shapePoint = gridSnapActive ? snapPointToGrid(point, session.view.grid ?? DEFAULT_GRID_SETTINGS) : point
      appendCanvasPathStep(drag, shapePoint)
      drag.last = shapePoint
      scheduleDraw()
      return
    }
    if (drag.kind === 'polygon-shape') {
      drag.last = gridSnapActive ? snapPointToGrid(point, session.view.grid ?? DEFAULT_GRID_SETTINGS) : point
      scheduleDraw()
      return
    }
    if (drag.kind === 'line-shape') {
      const line = resolveStraightLine(drag.isoAlignedGridVertex ?? drag.start, point, event.shiftKey)
      drag.start = line.from
      drag.last = line.to
      scheduleDraw()
      return
    }
    if (drag.kind === 'curve-shape') {
      const curvePoint = gridSnapActive ? snapPointToGrid(point, session.view.grid ?? DEFAULT_GRID_SETTINGS) : point
      if (drag.curvePhase === 'endpoint') drag.last = curvePoint
      else {
        const anchorIndex = drag.curveAnchorIndex ?? 0
        const controls = drag.curveControls ?? []
        for (let index = anchorIndex; index < controls.length; index += 1) controls[index] = curvePoint
        drag.curveControls = controls
      }
      drag.last = curvePoint
      scheduleDraw()
      return
    }
    if (drag.kind === 'marquee') {
      drag.moved = drag.moved || selectionGestureMoved(drag.startClient, { x: event.clientX, y: event.clientY })
      if (!drag.moved) { scheduleDraw(); return }
      const modifiers = currentSelectionMarqueeModifierState()
      drag.constrain = modifiers.proportional
      const marqueePoint = repeatedMarquee
        ? repeatedDocumentPointsAt(event.clientX, event.clientY, false, true)?.repeated ?? point
        : point
      drag.tileRepeatPoint = marqueePoint
      updateMarqueePreview(drag, marqueePoint, modifiers)
      return
    }
    if (drag.kind === 'create-text-box') {
      drag.moved = drag.moved || selectionGestureMoved(drag.startClient, { x: event.clientX, y: event.clientY })
      drag.last = point
      drag.previewTarget = clampSliceRect(shapeBounds(drag.start, point), session.document.width, session.document.height)
      scheduleDraw()
      return
    }
    if (drag.kind === 'create-slice') {
      drag.moved = drag.moved || selectionGestureMoved(drag.startClient, { x: event.clientX, y: event.clientY })
      drag.last = point
      drag.previewTarget = clampSliceRect(shapeBounds(drag.start, point), session.document.width, session.document.height)
      scheduleDraw()
      return
    }
    if (drag.kind === 'move-slice' && drag.sliceStart) {
      drag.moved = drag.moved || selectionGestureMoved(drag.startClient, { x: event.clientX, y: event.clientY })
      drag.last = point
      if (drag.sliceIds?.length && drag.sliceStarts) {
        const starts = drag.sliceIds.flatMap((id) => drag.sliceStarts?.[id] ? [drag.sliceStarts[id]] : [])
        const targets = moveSliceRects(starts, point.x - drag.start.x, point.y - drag.start.y, session.document.width, session.document.height)
        drag.slicePreviewTargets = Object.fromEntries(drag.sliceIds.map((id, index) => [id, targets[index]]).filter((entry): entry is [string, SelectionRect] => Boolean(entry[1])))
        drag.previewTarget = drag.slicePreviewTargets[drag.sliceId ?? ''] ?? targets[0]
      } else drag.previewTarget = moveSliceRect(drag.sliceStart, point.x - drag.start.x, point.y - drag.start.y, session.document.width, session.document.height)
      scheduleDraw()
      return
    }
    if (drag.kind === 'resize-slice' && drag.sliceStart && drag.handle) {
      drag.last = point
      drag.previewTarget = clampSliceRect(resizeSelectionBounds(drag.sliceStart, point, drag.handle, session.document), session.document.width, session.document.height)
      scheduleDraw()
      return
    }
    if (drag.kind === 'magic-preview') {
      const mode = drag.selectionMode ?? session.selectionMode
      let rawIncoming: SelectionMask | null
      if (drag.freeTileEditDocument && drag.freeTileEditLayer && drag.freeTileEditOrigin) {
        const bounds = drag.freeTileSelectionBounds
        const insideBounds = !bounds || (point.x >= bounds.x && point.y >= bounds.y && point.x < bounds.x + bounds.width && point.y < bounds.y + bounds.height)
        const localIncoming = insideBounds
          ? magicWandSelection(
              drag.freeTileEditDocument,
              drag.freeTileEditLayer,
              point.x - drag.freeTileEditOrigin.x,
              point.y - drag.freeTileEditOrigin.y,
              session.wandTolerance,
              session.wandContiguous,
              session.wandGapClosing ? session.wandGapThreshold : 0
            )
          : null
        const sourceEdit = freeTileSourceEditForDrag(drag)
        rawIncoming = sourceEdit
          ? freeTileSelectionFromEditRaster(sourceEdit, localIncoming, session.document.width, session.document.height)
          : null
      } else rawIncoming = magicWandSelection(session.document, activePaintLayer(session), point.x, point.y, session.wandTolerance, session.wandContiguous, session.wandGapClosing ? session.wandGapThreshold : 0)
      const incoming = tilemapPaintSelectionForIncoming(symmetrySelection(rawIncoming, session.document.width, session.document.height, session.symmetryAxes, symmetryCenter))
      drag.previewSelection = combineSelection(drag.selectionStart ?? null, incoming, mode)
      scheduleDraw()
      return
    }
    if (drag.kind === 'lasso') {
      appendCanvasPathStep(drag, point)
      scheduleDraw()
      return
    }
    if (drag.kind === 'polygon-lasso') { scheduleDraw(); return }
    if (drag.kind === 'move-content' && drag.selectionStart && drag.tilemapSelectionMoveSource) {
      const source = drag.tilemapSelectionMoveSource
      const repeatedPoint = drag.tileRepeatStart ? repeatedDocumentPointsAt(event.clientX, event.clientY, true, true)?.repeated : undefined
      const pointerDelta = selectionMovePointerDelta(drag, point, repeatedPoint)
      const dragDelta = symmetrySelectionDragDelta(drag.selectionStart, drag.start, pointerDelta, session.document.width, session.document.height, session.symmetryAxes, symmetryCenter, true)
      const distance = constrainedTranslation(drag, dragDelta.x, dragDelta.y, modifierActive(event.nativeEvent, 'constrainAxis'))
      const columns = Math.round(distance.x / source.tileWidth)
      const rows = Math.round(distance.y / source.tileHeight)
      if (drag.tilemapSelectionMoveDelta?.columns === columns && drag.tilemapSelectionMoveDelta.rows === rows) return
      if (drag.tilemapEdit) applyTilemapDocumentEdit(session.document, drag.tilemapEdit, 'before')
      drag.tilemapEdit = previewTilemapSelectionMove(session.document, source, columns, rows, Boolean(drag.copy)) ?? undefined
      drag.tilemapSelectionMoveDelta = { columns, rows }
      const deltaX = columns * source.tileWidth
      const deltaY = rows * source.tileHeight
      const start = drag.transformStartTarget ?? drag.selectionStart
      drag.previewTarget = { ...start, x: start.x + deltaX, y: start.y + deltaY }
      drag.previewSelection = shiftSelection(drag.selectionStart, deltaX, deltaY, session.document.width, session.document.height)
      drag.appliedSelection = drag.previewSelection
      if (drag.selectionPivotStart) drag.previewPivot = { x: drag.selectionPivotStart.x + deltaX, y: drag.selectionPivotStart.y + deltaY }
      compositeCacheRef.current.invalidateAll()
      scheduleDraw()
      return
    }
    if (drag.kind === 'move-selection' && drag.selectionStart) {
      const start = drag.selectionStart
      const repeatedPoint = drag.tileRepeatStart ? repeatedDocumentPointsAt(event.clientX, event.clientY, true, true)?.repeated : undefined
      const pointerDelta = selectionMovePointerDelta(drag, point, repeatedPoint)
      const dragDelta = symmetrySelectionDragDelta(start, drag.start, pointerDelta, session.document.width, session.document.height, session.symmetryAxes, symmetryCenter, true)
      let distance = constrainedTranslation(drag, dragDelta.x, dragDelta.y, modifierActive(event.nativeEvent, 'constrainAxis'))
      const tilemapTarget = activePaintLayer(session).kind === 'tilemap' && session.tilemapMode === 'paint' ? activeTilemapCelTarget(session.document) : null
      if (tilemapTarget) distance = {
        x: Math.round(distance.x / tilemapTarget.tilemap.tileWidth) * tilemapTarget.tilemap.tileWidth,
        y: Math.round(distance.y / tilemapTarget.tilemap.tileHeight) * tilemapTarget.tilemap.tileHeight
      }
      else distance = alignedDragTranslation(drag, distance)
      const target = { ...start, x: start.x + distance.x, y: start.y + distance.y }
      if (drag.previewTarget?.x === target.x && drag.previewTarget.y === target.y) return
      drag.previewTarget = target
      drag.previewAngle = 0
      if (drag.selectionPivotStart) drag.previewPivot = { x: drag.selectionPivotStart.x + distance.x, y: drag.selectionPivotStart.y + distance.y }
      scheduleSelectionPreview(drag)
      return
    }
    if (drag.kind === 'move-content'
      && drag.freeTileInstanceSelectionMove
      && drag.freeTilePlacementEdit
      && drag.freeTileInstanceId
      && drag.selectionStart) {
      const target = activeFreeTileCelTarget(session.document)
      if (!target || target.layer.id !== drag.freeTilePlacementEdit.layerId || target.cel.frameId !== drag.freeTilePlacementEdit.frameId) return
      const instanceIds = drag.freeTileInstanceIds?.length ? drag.freeTileInstanceIds : [drag.freeTileInstanceId]
      const instances = instanceIds.flatMap((id) => {
        const instance = drag.freeTilePlacementEdit!.after.instances.find((candidate) => candidate.id === id)
        if (!instance) return []
        const start = drag.freeTileInstanceStarts?.[id] ?? (id === drag.freeTileInstanceId ? drag.freeTileInstanceStart : undefined)
        return start ? [{ instance, start }] : []
      })
      if (instances.length === 0) return
      const repeatedPoint = drag.tileRepeatStart ? repeatedDocumentPointsAt(event.clientX, event.clientY, true, true)?.repeated : undefined
      const pointerDelta = selectionMovePointerDelta(drag, point, repeatedPoint)
      const dragDelta = symmetrySelectionDragDelta(drag.selectionStart, drag.start, pointerDelta, session.document.width, session.document.height, session.symmetryAxes, symmetryCenter, true)
      const distance = alignedDragTranslation(drag, constrainedTranslation(drag, dragDelta.x, dragDelta.y, modifierActive(event.nativeEvent, 'constrainAxis')))
      const nextSelection = shiftSelection(drag.selectionStart, distance.x, distance.y, session.document.width, session.document.height)
      let dirtyRect = drag.freeTilePlacementEdit.dirtyRect
      let changed = false
      for (const { instance, start } of instances) {
        const nextX = start.x + distance.x
        const nextY = start.y + distance.y
        if (instance.x === nextX && instance.y === nextY) continue
        const previousBounds = freeTileInstanceBounds(instance, target.sources, target.surface.offsetX, target.surface.offsetY)
        instance.x = nextX
        instance.y = nextY
        dirtyRect = unionFreeTileDirtyRect(dirtyRect, previousBounds)
        dirtyRect = unionFreeTileDirtyRect(dirtyRect, freeTileInstanceBounds(instance, target.sources, target.surface.offsetX, target.surface.offsetY))
        changed = true
      }
      if (!changed) return
      drag.freeTilePlacementEdit.dirtyRect = dirtyRect
      drag.last = point
      drag.previewTarget = { ...(drag.transformStartTarget ?? drag.selectionStart), x: drag.selectionStart.x + distance.x, y: drag.selectionStart.y + distance.y }
      drag.previewSelection = nextSelection
      drag.appliedSelection = nextSelection
      if (drag.selectionPivotStart) drag.previewPivot = { x: drag.selectionPivotStart.x + distance.x, y: drag.selectionPivotStart.y + distance.y }
      state.previewFreeTilePlacement(drag.freeTilePlacementEdit)
      compositeCacheRef.current.invalidateAll()
      event.currentTarget.style.cursor = canvasCursors.move
      scheduleDraw()
      return
    }
    if (drag.kind === 'move-content' && drag.freeTransform && drag.selectionStart && drag.transformStartQuad) {
      const repeatedPoint = drag.tileRepeatStart ? repeatedDocumentPointsAt(event.clientX, event.clientY, true, true)?.repeated : undefined
      const pointerDelta = selectionMovePointerDelta(drag, point, repeatedPoint)
      const dragDelta = symmetrySelectionDragDelta(drag.selectionStart, drag.start, pointerDelta, session.document.width, session.document.height, session.symmetryAxes, symmetryCenter, true)
      const distance = alignedDragTranslation(drag, constrainedTranslation(drag, dragDelta.x, dragDelta.y, modifierActive(event.nativeEvent, 'constrainAxis')))
      const nextQuad: SelectionQuad = {
        nw: { x: drag.transformStartQuad.nw.x + distance.x, y: drag.transformStartQuad.nw.y + distance.y },
        ne: { x: drag.transformStartQuad.ne.x + distance.x, y: drag.transformStartQuad.ne.y + distance.y },
        se: { x: drag.transformStartQuad.se.x + distance.x, y: drag.transformStartQuad.se.y + distance.y },
        sw: { x: drag.transformStartQuad.sw.x + distance.x, y: drag.transformStartQuad.sw.y + distance.y }
      }
      const target = selectionQuadBounds(nextQuad)
      const previousQuad = drag.previewQuad ?? drag.transformStartQuad
      if (previousQuad.nw.x === nextQuad.nw.x && previousQuad.nw.y === nextQuad.nw.y
        && previousQuad.ne.x === nextQuad.ne.x && previousQuad.ne.y === nextQuad.ne.y
        && previousQuad.se.x === nextQuad.se.x && previousQuad.se.y === nextQuad.se.y
        && previousQuad.sw.x === nextQuad.sw.x && previousQuad.sw.y === nextQuad.sw.y) return
      if (!prepareSelectionTransformDrag(drag)) return
      drag.last = point
      drag.previewTarget = target
      drag.previewQuad = nextQuad
      drag.previewAngle = 0
      drag.previewShear = undefined
      if (drag.selectionPivotStart) drag.previewPivot = { x: drag.selectionPivotStart.x + distance.x, y: drag.selectionPivotStart.y + distance.y }
      scheduleSelectionPreview(drag, true)
      return
    }
    if (drag.kind === 'move-content' && drag.selectionStart) {
      const start = drag.transformStartTarget ?? drag.selectionStart
      const repeatedPoint = drag.tileRepeatStart ? repeatedDocumentPointsAt(event.clientX, event.clientY, true, true)?.repeated : undefined
      const pointerDelta = selectionMovePointerDelta(drag, point, repeatedPoint)
      const dragDelta = symmetrySelectionDragDelta(drag.selectionStart, drag.start, pointerDelta, session.document.width, session.document.height, session.symmetryAxes, symmetryCenter, true)
      const distance = alignedDragTranslation(drag, constrainedTranslation(drag, dragDelta.x, dragDelta.y, modifierActive(event.nativeEvent, 'constrainAxis')))
      const target = { ...start, x: start.x + distance.x, y: start.y + distance.y }
      if (drag.previewTarget?.x === target.x && drag.previewTarget.y === target.y) return
      if (!prepareSelectionTransformDrag(drag)) return
      drag.previewTarget = target
      drag.previewAngle = drag.startAngle ?? 0
      drag.previewShear = drag.transformStartShear ? { ...drag.transformStartShear } : undefined
      if (drag.selectionPivotStart) drag.previewPivot = { x: drag.selectionPivotStart.x + distance.x, y: drag.selectionPivotStart.y + distance.y }
      scheduleSelectionPreview(drag, drag.freeTileSelectionTransform === true)
      return
    }
    if (drag.kind === 'transform-content' && drag.freeTransform && drag.selectionStart && drag.handle) {
      updateFreeTransformPreview(drag, point)
      return
    }
    if (drag.kind === 'transform-content' && drag.selectionStart && drag.handle) {
      updateSelectionTransformPreview(drag, point, selectionTransformModifierState(event.nativeEvent))
      return
    }
    if (drag.kind === 'transform-text-box' && drag.transformStartTarget) {
      const modifiers = selectionTransformModifierState(event.nativeEvent)
      const target = drag.handle
        ? resizeSelectionBounds(drag.transformStartTarget, point, drag.handle, session.document, modifiers.proportional, false, modifiers.fromCenter)
        : moveSliceRect(drag.transformStartTarget, point.x - drag.start.x, point.y - drag.start.y, session.document.width, session.document.height)
      drag.last = point
      drag.moved = drag.moved || selectionGestureMoved(drag.startClient, { x: event.clientX, y: event.clientY })
      if (!drag.handle && !drag.moved) return
      drag.previewTarget = clampSliceRect(target, session.document.width, session.document.height)
      state.previewTextBoxTransform(drag.previewTarget)
      compositeCacheRef.current.invalidateAll()
      scheduleDraw()
      return
    }
    if (drag.kind === 'shear-content' && drag.selectionStart && drag.shearHandle) {
      const edge = drag.shearHandle.slice(-1) as 'n' | 'e' | 's' | 'w'
      const angle = drag.startAngle ?? 0
      const direction = transformedSelectionShearDirection(
        drag.transformStartTarget ?? drag.selectionStart,
        angle,
        drag.transformStartShear,
        edge
      )
      if (!direction) return
      const deltaX = point.x - drag.start.x
      const deltaY = point.y - drag.start.y
      const localDelta = deltaX * direction.x + deltaY * direction.y
      const amount = Math.round(localDelta)
      if (drag.shearAmount === amount) return
      if (!prepareSelectionTransformDrag(drag)) return
      const transformed = shearTransformedSelection(
        drag.transformStartTarget ?? drag.selectionStart,
        angle,
        drag.transformStartShear,
        edge,
        amount,
        drag.selectionPivotStart
      )
      drag.shearAmount = amount
      drag.previewTarget = transformed.target
      drag.previewAngle = transformed.angle
      drag.previewShear = transformed.shear
      scheduleSelectionPreview(drag)
      return
    }
    if (drag.kind === 'rotate-content' && drag.selectionStart) {
      const transformTarget = drag.transformStartTarget ?? drag.selectionStart
      const startAngle = drag.startAngle ?? 0
      const pivot = drag.selectionPivotStart ?? transformedSelectionPivotPreset(transformTarget, 'center', startAngle, drag.transformStartShear)
      const rawAngle = selectionRotationAngle(transformTarget, drag.start, point, false, pivot)
      const angle = snapSelectionRotation(startAngle + rawAngle, modifierActive(event.nativeEvent, 'snapSelectionRotation'))
      const target = rotateSelectionTargetAroundPivot(transformTarget, pivot, angle - startAngle)
      if (drag.previewAngle === angle && drag.previewTarget?.x === target.x && drag.previewTarget.y === target.y) return
      if (!prepareSelectionTransformDrag(drag)) return
      drag.angle = angle
      drag.previewAngle = angle
      drag.previewTarget = target
      drag.previewShear = drag.transformStartShear ? { ...drag.transformStartShear } : undefined
      scheduleSelectionPreview(drag)
    }
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    endCanvasToolGesture(event.pointerId)
    const session = liveInputSession()
    syncHeldShortcutModifiers(event.nativeEvent)
    stopAirbrushTimer()
    const currentInteractionSession = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id) ?? session
    if (currentInteractionSession.freeTransformActive === true) {
      const staleSymmetryDrag = symmetryDragRef.current
      if (staleSymmetryDrag) {
        symmetryDragRef.current = null
        if (event.currentTarget.hasPointerCapture(staleSymmetryDrag.pointerId)) event.currentTarget.releasePointerCapture(staleSymmetryDrag.pointerId)
      }
      // A mode switch can happen after a legacy gesture has already produced a
      // preview but before the pointer is released. Do not commit that stale
      // gesture while free transform is active; free-transform corner drags
      // and content translations are the only content gestures allowed here.
      const activeDrag = inputRef.current.drag
      const freeTransformDrag = (activeDrag?.kind === 'transform-content' || activeDrag?.kind === 'move-content') && activeDrag.freeTransform === true
      if (activeDrag && activeDrag.kind !== 'pan' && !freeTransformDrag) {
        cancelActiveCanvasInteraction()
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
        updateCursor(event)
        draw()
        return
      }
    }
    if (symmetryDragRef.current) {
      symmetryDragRef.current = null
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
      updateCursor(event)
      draw()
      return
    }
    if (inputRef.current.drag?.kind === 'polygon-lasso' || inputRef.current.drag?.kind === 'polygon-shape') {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
      endSelectionAdjustmentEdit()
      scheduleDraw()
      return
    }
    const drag = inputRef.current.finish()
    if (!drag) {
      inputRef.current.resetPointerInteraction()
      updateCursor(event)
      hideEyedropperMagnifier()
      return
    }
    if (drag.kind === 'move-layer') hideMoveLayerContentPreview(220)
    if (drag.kind === 'canvas-resize' || drag.kind === 'canvas-move') flushCanvasResizePreview()
    if (selectionPreviewFrameRef.current !== null) {
      window.cancelAnimationFrame(selectionPreviewFrameRef.current)
      selectionPreviewFrameRef.current = null
    }
    const selectionPreviewWasPending = Boolean(drag.previewPending)
    flushSelectionPreview(drag)
    if (adjustmentPreviewEditRef.current && !selectionPreviewWasPending) prepareAdjustmentPreviewEdit(session.document.id)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    const state = useWorkspace.getState()
    if (drag.kind === 'pan') {
      finishPanPreview()
      const resumedDrag = currentInteractionSession.freeTransformActive === true
        ? null
        : restoreCanvasDragAfterPan(drag, localPoint(event) ?? drag.resumeDrag?.last ?? drag.last)
      if (resumedDrag) inputRef.current.drag = resumedDrag
      updateCursor(event)
      draw()
      return
    }
    if (drag.kind === 'zoom-drag') {
      const startClient = drag.startClient ?? { x: event.clientX, y: event.clientY }
      const moved = Math.abs(canvasClientDeltaForInterfaceScale(event.clientX - startClient.x, interfaceScale)) > 3
        || Math.abs(canvasClientDeltaForInterfaceScale(event.clientY - startClient.y, interfaceScale)) > 3
      if (!moved) {
        const size = stageSize()
        const view = liveViewRef.current
        const nextZoom = steppedZoom(view.zoom, event.button !== 2)
        if (nextZoom !== view.zoom) {
          scheduleZoomPreview(constrainCanvasView({ ...view, ...zoomViewAroundViewportPoint(view, nextZoom, stagePoint(event.clientX, event.clientY), size.width, size.height, session.document.width, session.document.height, rotationIndicatorPosition) }))
        }
      }
      finishZoomPreview()
      return
    }
    if (drag.kind === 'rotate-view') {
      updateRotationIndicator(liveViewRef.current.rotation, false)
      return
    }
    if (drag.kind === 'move-selection-pivot') {
      if (drag.previewPivot) state.setSelectionPivot(drag.previewPivot)
      updateCursor(event)
      draw()
      return
    }
    if (drag.kind === 'sample-color') {
      endCanvasColorSampling(event.pointerId)
      inputRef.current.sampling = false
      hideEyedropperMagnifier()
      eyedropperOriginalColorRef.current = null
      const sampledColorToAdd = sampledForegroundColorToAdd(drag, paletteSamplingShortcutActive())
      if (sampledColorToAdd) state.addPaletteColor(sampledColorToAdd)
      publishCanvasColorSamplingCompleted()
      if (!drag.temporarySampling && eyedropperSwitchToPencil) {
        state.setTool('pencil')
        event.currentTarget.style.cursor = canvasToolCursor('pencil', session.primaryColor)
      } else updateCursor(event)
      draw()
      return
    }
    if (drag.kind === 'gradient') {
      gradientPreviewCoverageCacheRef.current = null
      const moved = drag.start.x !== drag.last.x || drag.start.y !== drag.last.y
      const sourceEdit = freeTileSourceEditForDrag(drag)
      if (sourceEdit) {
        if (moved) {
          const edit = applyGradient(sourceEdit.document, sourceEdit.layer, freeTileLocalPoint(drag, drag.start), freeTileLocalPoint(drag, drag.last), drag.color ?? session.primaryColor, drag.gradientEndColor ?? session.secondaryColor, drag.freeTileEditSelection ?? null, gradientDither, drag.freeTileGradientPaintRegion, gradientType, gradientGeometryOptionsForDrag(drag), drag.gradientStops ?? gradientStops)
          if (edit) commitFreeTileSourceDrag(drag, t('canvas.history.gradient'))
          else if (drag.freeTilePlacementEdit) state.cancelFreeTilePlacement(drag.freeTilePlacementEdit)
        } else if (drag.freeTilePlacementEdit) state.cancelFreeTilePlacement(drag.freeTilePlacementEdit)
      } else if (moved) {
        const layer = activePaintLayer(session)
        if (!isLayerEffectivelyLocked(session.document, layer)) {
          const edit = applyGradient(session.document, layer, drag.start, drag.last, drag.color ?? session.primaryColor, drag.gradientEndColor ?? session.secondaryColor, paintSelectionForDrag(drag), gradientDither, drag.gradientPaintRegion, gradientType, gradientGeometryOptionsForDrag(drag), drag.gradientStops ?? gradientStops)
          if (edit) state.commitPixelEdit(edit, t('canvas.history.gradient'))
        }
      }
      draw()
      return
    }
    updateCursor(event)
    if (drag.kind === 'move-content' && drag.selectionStart && drag.tilemapSelectionMoveSource) {
      const beforeSelection = cloneSelection(drag.selectionStart)
      const afterSelection = cloneSelection(drag.previewSelection ?? null)
      const edit = drag.tilemapEdit
      const moved = Boolean(drag.tilemapSelectionMoveDelta && (drag.tilemapSelectionMoveDelta.columns !== 0 || drag.tilemapSelectionMoveDelta.rows !== 0))
      if (edit && edit.before.size > 0 && edit.after.size > 0) {
        state.commitTilemapSelectionMove(
          edit,
          beforeSelection,
          afterSelection,
          t(drag.copy ? 'workspace.history.copySelectionContent' : 'workspace.history.moveSelectionContent')
        )
      } else if (moved) state.commitSelectionChange(beforeSelection, afterSelection, t('canvas.history.moveSelectionBox'))
      if (drag.previewPivot) state.setSelectionPivot(drag.previewPivot)
      endSelectionAdjustmentEdit()
      draw()
      return
    }
    if (drag.kind === 'move-content'
      && drag.freeTileInstanceSelectionMove
      && drag.freeTilePlacementEdit
      && drag.selectionStart) {
      state.commitFreeTilePlacement(
        drag.freeTilePlacementEdit,
        t('workspace.history.moveSelectionContent'),
        {
          before: drag.selectionStart,
          after: drag.previewSelection ?? drag.selectionStart,
          beforePivot: drag.selectionPivotStart ? { ...drag.selectionPivotStart } : null,
          afterPivot: drag.previewPivot ? { ...drag.previewPivot } : null
        }
      )
      if (drag.previewPivot) state.setSelectionPivot(drag.previewPivot)
      endSelectionAdjustmentEdit()
      compositeCacheRef.current.invalidateAll()
      draw()
      return
    }
    if ((drag.kind === 'move-content' || drag.kind === 'transform-content' || drag.kind === 'rotate-content' || drag.kind === 'shear-content')
      && drag.freeTileSelectionTransform
      && drag.freeTileSourceId
      && drag.selectionStart
      && drag.previewSelection) {
      const sourceEdit = freeTileSourceEditForDrag(drag)
      const label = drag.copy
        ? t('workspace.history.copySelectionContent')
        : drag.kind === 'rotate-content'
          ? t('workspace.history.rotateSelectionContent')
          : drag.kind === 'move-content'
            ? t('workspace.history.moveSelectionContent')
            : t('workspace.history.transformSelectionContent')
      if (drag.floatingPaste) state.updateFloatingPastePreview(
        drag.previewEdit ?? null,
        drag.previewSelection,
        drag.translationPreview,
        drag.previewTarget,
        drag.previewAngle,
        drag.previewShear,
        false,
        undefined,
        drag.previewQuad
      )
      else if (sourceEdit && drag.freeTileInstanceId && drag.freeTileSelectionSource && drag.selectionSource) state.beginFreeTileFloatingSelectionTransform({
        sourceId: drag.freeTileSourceId,
        instanceId: drag.freeTileInstanceId,
        edit: sourceEdit,
        selectionSource: drag.freeTileSelectionSource,
        source: drag.selectionSource,
        previewEdit: drag.previewEdit ?? null,
        before: drag.selectionStart,
        target: drag.previewSelection,
        copy: Boolean(drag.copy),
        label,
        translationPreview: drag.translationPreview,
        transformTarget: drag.previewTarget,
        transformAngle: drag.previewAngle,
        transformShear: drag.previewShear,
        transformQuad: drag.previewQuad
      })
      if (drag.previewPivot) state.setSelectionPivot(drag.selectionPivotCustom === false ? null : drag.previewPivot)
      endSelectionAdjustmentEdit()
      compositeCacheRef.current.invalidateAll()
      draw()
      return
    }
    if (drag.kind === 'free-tile-instance-move' && drag.freeTilePlacementEdit) {
      state.commitFreeTilePlacement(drag.freeTilePlacementEdit, t('canvas.history.moveFreeTileInstance'))
      compositeCacheRef.current.invalidateAll()
      draw()
      return
    }
    if (drag.kind === 'free-tile-draw' && drag.freeTilePlacementEdit) {
      state.commitFreeTilePlacement(
        drag.freeTilePlacementEdit,
        t(session.tool === 'eraser' ? 'canvas.history.eraseFreeTiles' : 'canvas.history.placeFreeTiles')
      )
      compositeCacheRef.current.invalidateAll()
      draw()
      return
    }
    if (drag.kind === 'free-tile-edit' && drag.freeTileSourceId && drag.freeTileSourceBefore && drag.freeTileEditDocument && drag.freeTileEditLayer && drag.freeTileEditOrigin && drag.freeTileEditSourceOffset) {
      commitFreeTileSourceDrag(drag, t('canvas.history.draw'))
      lineAnchorHistoryRef.current = null
      if (session.tool === 'eraser') state.setLastEraserPoint(drag.last)
      else state.setLastPencilPoint(drag.last)
      compositeCacheRef.current.invalidateAll()
      draw()
      return
    }
    if (drag.kind === 'tile-draw' && drag.tilemapEdit) {
      state.commitTilemapEdit(
        drag.tilemapEdit,
        t(session.tool === 'eraser' ? 'canvas.history.eraseTiles' : 'canvas.history.paintTiles'),
        { stroke: true, durationMs: Math.max(1, Date.now() - (drag.startedAt ?? Date.now())) }
      )
      // The edit carries the layer that actually received the stroke. Keep
      // that layer active after commit even if React rendered the old layer
      // between pointer-down and pointer-up.
      state.activateTilemapLayerForDrawing(drag.tilemapEdit.layerId)
      draw()
      return
    }
    if (drag.kind === 'draw' && drag.edit) {
      const entry = state.commitPixelEdit(drag.edit, session.tool === 'eraser' ? t('canvas.history.eraser') : t('canvas.history.draw'), { stroke: true, durationMs: Math.max(1, Date.now() - (drag.startedAt ?? Date.now())) })
      if (entry) {
        // The edit may expand a cropped/transparent layer. In that case a
        // region patch can miss pixels outside the previous storage bounds;
        // rebuild the composite from the committed layer storage instead of
        // allowing a stale cached transparent area to survive until a later
        // visibility toggle.
        compositeCacheRef.current.invalidateAll()
      }
      const firstPathPoint = drag.path?.[0]
      const singlePoint = Boolean(firstPathPoint && drag.path?.every((point) => point.x === firstPathPoint.x && point.y === firstPathPoint.y))
      lineAnchorHistoryRef.current = entry && singlePoint ? {
        documentId: session.document.id,
        layerId: drag.edit.layerId,
        tool: session.tool === 'eraser' ? 'eraser' : 'pencil',
        point: { ...drag.last },
        entry,
        baseline: new Map(drag.edit.before),
        mergeWithNext: true
      } : null
      if (session.tool === 'eraser') state.setLastEraserPoint(drag.last)
      else state.setLastPencilPoint(drag.last)
    }
    if (drag.kind === 'airbrush' && drag.edit) {
      if (freeTileSourceEditForDrag(drag)) commitFreeTileSourceDrag(drag, t('canvas.history.airbrush'))
      else state.commitPixelEdit(drag.edit, t('canvas.history.airbrush'), { stroke: true, durationMs: Math.max(1, Date.now() - (drag.startedAt ?? Date.now())) })
    }
    if (drag.kind === 'move-layer') state.commitLayerMove(session.document.id, drag)
    if (drag.kind === 'move-layer' && drag.collapseLayerSelectionOnClick && !drag.moved && drag.clickLayerId) {
      state.selectMoveToolLayer(drag.clickLayerId)
      revealLayerInPanel(session.document.id, drag.clickLayerId)
    }
    if (drag.kind === 'move-layer' && drag.previewPivot) state.setSelectionPivot(drag.previewPivot)
    if (drag.kind === 'shape') {
      const sourceEdit = freeTileSourceEditForDrag(drag)
      const layer = sourceEdit?.layer ?? activePaintLayer(session)
      const document = sourceEdit?.document ?? session.document
      if (!isLayerEffectivelyLocked(document, layer)) {
        const edit = beginPixelEdit(layer.id)
        const bounds = drag.previewTarget ?? shapeBounds(drag.start, drag.last, drag.constrain, session.shapeRatio)
        const localBounds = sourceEdit
          ? { ...bounds, x: bounds.x - drag.freeTileEditOrigin!.x, y: bounds.y - drag.freeTileEditOrigin!.y }
          : bounds
        paintShape(document, layer, edit, localBounds, session.shapeKind, drag.color ?? session.primaryColor, sourceEdit ? drag.freeTileEditSelection ?? null : paintSelectionForDrag(drag), sourceEdit ? undefined : session.symmetryAxes, sourceEdit ? undefined : symmetryCenter, drag.previewAngle ?? 0, shapeCornerRadius)
        const ellipse = session.shapeKind === 'ellipse' || session.shapeKind === 'ellipse-outline'
        const label = ellipse ? t('canvas.history.drawEllipse') : t('canvas.history.drawRectangle')
        if (sourceEdit) commitFreeTileSourceDrag(drag, label)
        else state.commitPixelEdit(edit, label)
      }
    }
    if (drag.kind === 'freeform-shape') commitShapePoints(drag, filledShapePathPixelPoints(session.document, drag.path ?? []), t('canvas.history.drawFreeform'))
    if (drag.kind === 'line-shape') commitBrushPath(drag, lineShapeBrushPoints(drag), t('canvas.history.drawLine'))
    if (drag.kind === 'curve-shape') {
      if (drag.curvePhase === 'endpoint') {
        drag.curveEnd = drag.last
        drag.curveControls = Array.from({ length: drag.curveAnchorCount ?? session.curveAnchorCount }, () => ({ ...drag.curveEnd! }))
        drag.curveAnchorIndex = 0
        drag.curvePhase = 'anchors'
        inputRef.current.drag = drag
        scheduleDraw()
        return
      }
      const nextAnchorIndex = (drag.curveAnchorIndex ?? 0) + 1
      if (nextAnchorIndex < (drag.curveControls?.length ?? 0)) {
        drag.curveAnchorIndex = nextAnchorIndex
        inputRef.current.drag = drag
        scheduleDraw()
        return
      }
      commitBrushPath(drag, curveShapePixelPoints(drag), t('canvas.history.drawCurve'))
    }
    if (drag.kind === 'marquee') {
      const moved = drag.moved || selectionGestureMoved(drag.startClient, { x: event.clientX, y: event.clientY })
      const change = marqueeSelectionCommit(drag, session.selection, moved, session.selectionMode)
      // A timeline selection made before the first marquee is a navigation
      // context, not a multi-target transform request. Bind the new marquee
      // to the active layer/frame cel; selecting timeline targets afterwards
      // will keep the existing canvas selection and enable batch transforms.
      const timelineSelectionBeforeMarquee = timelineSelectionPrecedesCanvasMarquee(session, drag.selectionStart)
      state.commitSelectionChange(change.before, change.after, t('canvas.history.createSelection'))
      if (timelineSelectionBeforeMarquee) {
        const currentSession = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id)
        const frameId = currentSession?.document.animation?.activeFrameId
        if (currentSession && frameId) state.selectAnimationCell(animationCelKey(currentSession.document.activeLayerId, frameId))
      }
      updateCursor(event)
      scheduleDraw()
    }
    if (drag.kind === 'create-text-box') {
      const moved = drag.moved || selectionGestureMoved(drag.startClient, { x: event.clientX, y: event.clientY })
      const target = drag.previewTarget ?? clampSliceRect(shapeBounds(drag.start, drag.last), session.document.width, session.document.height)
      textToolBoxRef.current = moved ? { ...target } : null
      openTextToolDialog({
        documentId: session.document.id,
        x: moved ? target.x : drag.start.x,
        y: moved ? target.y : drag.start.y,
        ...(moved ? { width: target.width, height: target.height } : {})
      })
      scheduleDraw()
    }
    if (drag.kind === 'transform-text-box' && drag.previewTarget) {
      if (!drag.handle && !drag.moved) {
        state.cancelTextBoxTransform()
        const currentSession = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id) ?? session
        const layer = currentSession.selectedLayerIds.length === 1
          ? currentSession.document.layers.find((candidate) => candidate.id === currentSession.selectedLayerIds[0] && candidate.kind === 'text')
          : null
        const timeline = ensureAnimationDocument(currentSession.document)
        const cel = layer ? timeline.cels.find((candidate) => candidate.layerId === layer.id && candidate.frameId === timeline.activeFrameId) : null
        const source = resolveAnimationCel(timeline, cel ?? null) ?? cel
        if (layer && cel) openTextToolDialog({
          documentId: currentSession.document.id,
          layerId: layer.id,
          frameId: timeline.activeFrameId,
          x: source?.text?.originX ?? source?.surface?.offsetX ?? layer.offsetX,
          y: source?.text?.originY ?? source?.surface?.offsetY ?? layer.offsetY
        })
      } else state.commitTextBoxTransform(drag.previewTarget)
      compositeCacheRef.current.invalidateAll()
      scheduleDraw()
    }
    if (drag.kind === 'create-slice' && drag.previewTarget && (drag.moved || selectionGestureMoved(drag.startClient, { x: event.clientX, y: event.clientY }))) {
      state.createSlice(drag.previewTarget)
      scheduleDraw()
    }
    if (drag.kind === 'move-slice' && drag.sliceId) {
      const moved = drag.moved || selectionGestureMoved(drag.startClient, { x: event.clientX, y: event.clientY })
      if (!moved && drag.collapseSliceSelectionOnClick) state.selectSlice(drag.sliceId)
      else if (moved && drag.sliceIds?.length && drag.slicePreviewTargets) {
        if (drag.copy) state.duplicateSlices(drag.sliceIds, drag.slicePreviewTargets)
        else state.updateSlices(drag.slicePreviewTargets)
      } else if (moved && drag.previewTarget) state.updateSlice(drag.sliceId, drag.previewTarget)
      scheduleDraw()
    }
    if (drag.kind === 'resize-slice' && drag.sliceId && drag.previewTarget) {
      state.updateSlice(drag.sliceId, drag.previewTarget)
      scheduleDraw()
    }
    if (drag.kind === 'lasso') {
      const mode = drag.selectionMode ?? session.selectionMode
      const before = drag.selectionStart ?? null
      const incoming = tilemapPaintSelectionForIncoming(symmetrySelection(lassoSelection(session.document, drag.path ?? []), session.document.width, session.document.height, session.symmetryAxes, symmetryCenter))
      const after = combineSelection(before, incoming, mode)
      state.commitSelectionChange(before, after, t('canvas.history.lassoSelection'))
    }
    if (drag.kind === 'magic-preview' && drag.selectionStart !== undefined) state.commitSelectionChange(drag.selectionStart ?? null, drag.previewSelection ?? null, t('canvas.history.magicSelection'))
    if (drag.kind === 'move-selection' && drag.selectionStart && drag.previewSelection) {
      if (drag.floatingPasteSelectionBox) state.commitFloatingSelectionBoxMove(
        drag.selectionStart,
        drag.previewSelection,
        drag.selectionPivotStart ?? null,
        drag.previewPivot ?? null
      )
      else {
        state.commitSelectionChange(drag.selectionStart, drag.previewSelection, t('canvas.history.moveSelectionBox'))
        if (drag.previewPivot) state.setSelectionPivot(drag.previewPivot)
      }
    }
    if ((drag.kind === 'move-content' || drag.kind === 'transform-content' || drag.kind === 'rotate-content' || drag.kind === 'shear-content') && drag.selectionStart && drag.previewSelection) {
      if (drag.deferredSelectionPreview && drag.selectionSource && selectionTransformPreviewChanged(drag)) {
        const target = drag.previewTarget ?? drag.previewSelection
        const simpleTranslation = drag.kind === 'move-content'
          && (drag.previewAngle ?? 0) % 360 === 0
          && !drag.previewShear
          && target.width === drag.selectionSource.selection.width
          && target.height === drag.selectionSource.selection.height
          && !target.flipHorizontal
          && !target.flipVertical
        if (deferredSelectionPreviewMaterializationRequired(simpleTranslation, Boolean(drag.floatingPaste), drag.selectionSource.origin)) {
          drag.previewEdit = applySelectionTransform(
            session.document,
            drag.selectionSource,
            target,
            drag.previewAngle ?? 0,
            Boolean(drag.copy),
            drag.previewShear,
            session.symmetryAxes,
            symmetryCenter,
            activePaintLayer(session),
            symmetryStartPointForDrag(drag),
            drag.previewQuad
          )
          drag.deferredSelectionPreview = false
          for (const rect of deferredSelectionCommitInvalidationRects(drag)) invalidateCompositeRect(rect)
        }
      }
      const hasPixelPreview = Boolean(
        drag.previewEdit
        || drag.translationPreview?.count
        || drag.selectionLayers?.some((layer) => layer.previewEdit || layer.translationPreview?.count)
        || (drag.deferredSelectionPreview && drag.selectionSource && selectionTransformPreviewChanged(drag))
      )
      const label = !hasPixelPreview
        ? t('workspace.history.transformSelection')
        : drag.copy
        ? t('workspace.history.copySelectionContent')
        : drag.kind === 'rotate-content'
          ? t('workspace.history.rotateSelectionContent')
          : drag.kind === 'move-content'
            ? t('workspace.history.moveSelectionContent')
            : t('workspace.history.transformSelectionContent')
      if (selectionTransformPreviewChanged(drag)) {
        if (drag.floatingPaste) state.updateFloatingPastePreview(drag.previewEdit ?? null, drag.previewSelection, drag.translationPreview, drag.previewTarget, drag.previewAngle, drag.previewShear, Boolean(drag.deferredSelectionPreview), drag.selectionLayers, drag.previewQuad)
        else if (drag.selectionSource) state.beginFloatingSelectionTransform(drag.selectionSource, drag.previewEdit ?? null, drag.selectionStart, drag.previewSelection, Boolean(drag.copy), label, drag.translationPreview, drag.previewTarget, drag.previewAngle, drag.previewShear, Boolean(drag.deferredSelectionPreview), drag.tilemapEditCellIndex, drag.selectionLayers, drag.previewQuad)
        if (drag.previewPivot) state.setSelectionPivot(drag.selectionPivotCustom === false ? null : drag.previewPivot)
      }
    }
    endSelectionAdjustmentEdit()
    draw()
  }

  useEffect(() => {
    const keyDown = (event: KeyboardEvent): void => {
      const drag = inputRef.current.drag
      if (drag?.kind !== 'polygon-lasso' && drag?.kind !== 'polygon-shape' && drag?.kind !== 'curve-shape') return
      if (event.key === 'Enter') {
        if (drag.kind === 'polygon-shape') commitPolygonShape()
        else if (drag.kind === 'curve-shape') commitCurveShape()
        else commitPolygonLasso()
      }
      else if (event.key === 'Escape') { inputRef.current.finish(); scheduleDraw() }
      else return
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    window.addEventListener('keydown', keyDown, true)
    return () => window.removeEventListener('keydown', keyDown, true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.document.id, session.selectionMode])

  const onWheel = (event: WheelEvent): void => {
    const canvas = canvasRef.current
    if (!canvas) return
    const path = event.composedPath()
    const targetsCanvas = path.includes(canvas)
    const pointer = inputRef.current.pointer
    if (!targetsCanvas) {
      if (useWorkspace.getState().activeId !== session.document.id || !pointer.visible) return
      const target = event.target instanceof Element ? event.target : null
      if (target?.closest('input, textarea, select, [contenteditable="true"], .stage-canvas, .modal-backdrop, .context-menu, .panel, .workspace-panel-popup-layer')) return
    }
    const delta = normalizeCanvasWheelDelta(event as WheelEvent & { wheelDelta?: number })
    if (delta === 0) return
    const now = performance.now()
    const previous = lastNativeWheelRef.current
    if (previous && previous.type !== event.type && now - previous.at < 12 && Math.sign(previous.delta) === Math.sign(delta)) return
    lastNativeWheelRef.current = { at: now, delta, type: event.type }
    const rect = stageBounds()
    const eventPointInside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom
    const clientX = targetsCanvas || eventPointInside ? event.clientX : pointer.clientX
    const clientY = targetsCanvas || eventPointInside ? event.clientY : pointer.clientY
    const wheelModifiers = {
      ctrlKey: event.ctrlKey || inputRef.current.ctrlHeld,
      metaKey: event.metaKey,
      altKey: event.altKey || inputRef.current.altHeld,
      shiftKey: event.shiftKey || inputRef.current.shiftHeld
    }
    if ((targetsCanvas || eventPointInside) && dispatchWheelShortcutInput(canvas, wheelModifiers, delta)) {
      event.preventDefault()
      event.stopImmediatePropagation()
      return
    }
    if ((activeLayer.kind !== 'tilemap' || session.tilemapMode !== 'paint') && !canvasResizePreviewRef.current && modifierActive(wheelModifiers, 'brushSizeWheelAdjust') && (session.tool === 'pencil' || session.tool === 'airbrush' || session.tool === 'eraser') && (session.tool === 'airbrush' || activeLayer.kind === 'tilemap' || !activeBrushImage?.intrinsicSize)) {
      event.preventDefault()
      event.stopImmediatePropagation()
      wheelBrushSizePreviewRef.current = true
      if (session.tool === 'airbrush') useWorkspace.getState().setAirbrushScatterRadius(session.airbrushScatterRadius + (delta < 0 ? 1 : -1))
      else useWorkspace.getState().setBrushSize(session.brushSize + (delta < 0 ? 1 : -1))
      updateCursorAt(clientX, clientY, wheelModifiers.ctrlKey, wheelModifiers.altKey, wheelModifiers.shiftKey)
      scheduleDraw()
      return
    }
    if (inputRef.current.drag?.kind === 'pan' || !wheelZoomEnabled) return
    event.preventDefault()
    event.stopImmediatePropagation()
    const liveView = liveViewRef.current
    const oldZoom = liveView.zoom
    const newZoom = wheelCanvasZoom(oldZoom, delta, wheelZoomMode)
    if (newZoom === oldZoom) return
    const size = stageSize()
    scheduleZoomPreview(constrainCanvasView({ ...liveView, ...zoomViewAroundViewportPoint(liveView, newZoom, stagePoint(clientX, clientY), size.width, size.height, session.document.width, session.document.height, rotationIndicatorPosition) }))
  }
  nativeWheelHandlerRef.current = onWheel

  useEffect(() => {
    const listener = (event: Event): void => nativeWheelHandlerRef.current(event as WheelEvent)
    const options = { capture: true, passive: false } as AddEventListenerOptions
    window.addEventListener('wheel', listener, options)
    window.addEventListener('mousewheel', listener, options)
    return () => {
      window.removeEventListener('wheel', listener, options)
      window.removeEventListener('mousewheel', listener, options)
    }
  }, [session.document.id])

  const measurePointerInput = (kind: 'pointer-down' | 'pointer-move' | 'pointer-up', action: () => void): void => {
    const performanceProbe = window.__moonSpriteCanvasProbe
    if (!performanceProbe?.recordInput) { action(); return }
    const startedAt = performance.now()
    try { action() } finally { performanceProbe.recordInput(kind, performance.now() - startedAt) }
  }
  const pointerDown = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    // Pointer ids are reusable after a lost/canceled event. Drop any stale
    // device ownership before accepting the new interaction.
    inputRef.current.releasePointerDeviceEvent(event.nativeEvent)
    pressureAdapterRef.current.release(event.pointerId)
    if (!inputRef.current.acceptPointerDeviceEvent(event.nativeEvent, event.pointerType === 'mouse')) return
    const session = liveInputSession()
    const navigationGesture = event.button === 1
      || (event.button === 0 && (event.ctrlKey || event.metaKey || inputRef.current.spaceHeld || isCanvasViewNavigationTool(session.tool)))
    if (!navigationGesture && routeCanvasColorSamplingIntent(event.clientX, event.clientY, event.button === 2)) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    measurePointerInput('pointer-down', () => handlePointerDown(event))
    syncPenCursor(event)
  }
  const pointerMove = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    if (!inputRef.current.acceptPointerDeviceEvent(event.nativeEvent)) {
      event.preventDefault()
      return
    }
    measurePointerInput('pointer-move', () => handlePointerMove(event))
    syncPenCursor(event)
  }
  const pointerUp = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    if (!inputRef.current.acceptPointerDeviceEvent(event.nativeEvent)) return
    try {
      measurePointerInput('pointer-up', () => handlePointerUp(event))
      syncPenCursor(event)
    } finally {
      inputRef.current.releasePointerDeviceEvent(event.nativeEvent)
      pressureAdapterRef.current.release(event.pointerId)
    }
  }
  const pointerCancel = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    if (!inputRef.current.acceptPointerDeviceEvent(event.nativeEvent)) {
      event.preventDefault()
      return
    }
    const pressurePointer = isPressurePointerType(event.pointerType) || pressureAdapterRef.current.isPressureCapable(event.pointerId)
    measurePointerInput('pointer-up', () => {
      if (canvasColorSamplingActiveFor(canvasRef.current)) endCanvasColorSampling(event.pointerId)
      cancelActiveCanvasInteraction()
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
      hideEyedropperMagnifier()
      updateCursor(event)
      inputRef.current.releasePointerDeviceEvent(event.nativeEvent)
      pressureAdapterRef.current.release(event.pointerId)
      if (pressurePointer) hidePenCursor()
    })
    endCanvasToolGesture(event.pointerId)
  }
  const handlePointerLeave = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    if (canvasColorSamplingIntentActive() || canvasColorSamplingActiveFor(canvasRef.current)) {
      event.currentTarget.style.cursor = canvasCursors.eyedropper
      return
    }
    if ((inputRef.current.drag?.kind === 'draw' || inputRef.current.drag?.kind === 'tile-draw' || inputRef.current.drag?.kind === 'marquee' || inputRef.current.drag?.kind === 'move-content' || inputRef.current.drag?.kind === 'move-selection') && (liveViewRef.current.tileRepeatMode ?? 'off') !== 'off') {
      updateCursor(event)
      draw()
      return
    }
    inputRef.current.pointer.visible = false
    inputRef.current.resetPointerInteraction()
    wheelBrushSizePreviewRef.current = false
    inputRef.current.altHeld = false
    inputRef.current.ctrlHeld = false
    inputRef.current.shiftHeld = false
    hideEyedropperMagnifier()
    if (!inputRef.current.drag) event.currentTarget.style.cursor = canvasResizePreviewRef.current ? canvasCursors.unavailable : inputRef.current.spaceHeld ? canvasCursors.grab : canvasToolCursor(session.tool, session.primaryColor)
    draw()
  }
  const pointerLeave = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    if (!inputRef.current.acceptPointerDeviceEvent(event.nativeEvent)) return
    const pressurePointer = isPressurePointerType(event.pointerType) || pressureAdapterRef.current.isPressureCapable(event.pointerId)
    handlePointerLeave(event)
    inputRef.current.releasePointerDeviceEvent(event.nativeEvent)
    pressureAdapterRef.current.release(event.pointerId)
    if (pressurePointer) hidePenCursor()
  }
  const pointerEnter = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    if (!inputRef.current.acceptPointerDeviceEvent(event.nativeEvent)) return
    const session = liveInputSession()
    const navigationShortcutActive = event.ctrlKey || event.metaKey || inputRef.current.spaceHeld || isCanvasViewNavigationTool(session.tool)
    if (canvasColorSamplingIntentActive() && !navigationShortcutActive) {
      event.currentTarget.style.cursor = canvasCursors.eyedropper
      draw()
      syncPenCursor(event)
      return
    }
    updateCursor(event)
    inputRef.current.shiftLinePreview = lineConnectionPreviewActive(event.nativeEvent)
    draw()
    syncPenCursor(event)
  }

  const rotationStyle = { transform: 'none', transformOrigin: '50% 50%' }
      return <PerformanceProfiler id="CanvasStage"><div ref={stageRef} className="stage-surface"><canvas ref={canvasRef} data-document-id={session.document.id} style={rotationStyle} className={`stage-canvas ${session.tool === 'zoom' ? 'zoom-tool-canvas' : ''}`} aria-label={t('canvas.aria')} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerCancel} onDoubleClick={quickSelectCell} onPointerLeave={pointerLeave} onPointerEnter={pointerEnter} onContextMenu={(event) => event.preventDefault()} /><canvas ref={selectionCanvasRef} style={rotationStyle} className="stage-selection-overlay" aria-hidden="true" /><img ref={penCursorRef} className="stage-pen-cursor" alt="" hidden aria-hidden="true" draggable={false} /><div ref={eyedropperMagnifierRef} className="eyedropper-magnifier" data-style={eyedropperMagnifierStyle} data-size={String(eyedropperMagnifierSize)} hidden aria-hidden="true"><div className="eyedropper-magnifier-viewport"><canvas ref={eyedropperMagnifierCanvasRef} width={EYEDROPPER_MAGNIFIER_VIEWPORT_SIZE} height={EYEDROPPER_MAGNIFIER_VIEWPORT_SIZE} aria-hidden="true" /></div><span ref={eyedropperMagnifierSampledMaskRef} className="eyedropper-magnifier-color-mask eyedropper-magnifier-sampled-mask" aria-hidden="true" dangerouslySetInnerHTML={{ __html: eyedropperMagnifierSampledMask }} /><span ref={eyedropperMagnifierPreviousMaskRef} className="eyedropper-magnifier-color-mask eyedropper-magnifier-previous-mask" aria-hidden="true" dangerouslySetInnerHTML={{ __html: eyedropperMagnifierPreviousMask }} /><span className="eyedropper-magnifier-frame" aria-hidden="true" dangerouslySetInnerHTML={{ __html: eyedropperMagnifierFrame }} /><img ref={eyedropperPointerDarkRef} src={eyedropperPointerDark} alt="" aria-hidden="true" /><img ref={eyedropperPointerLightRef} src={eyedropperPointerLight} alt="" aria-hidden="true" /></div><div ref={rotationIndicatorRef} className="rotation-indicator" hidden aria-hidden="true"><span className="rotation-indicator-background">{[rotationBackground1, rotationBackground2, rotationBackground3, rotationBackground4, rotationBackground5, rotationBackground6].map((source) => <img key={source} src={source} alt="" />)}</span><span ref={rotationPointerRef} className="rotation-indicator-pointer"><img src={rotationPointer} alt="" /></span></div></div></PerformanceProfiler>
}
