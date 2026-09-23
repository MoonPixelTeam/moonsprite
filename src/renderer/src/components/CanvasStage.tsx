import { paintingCursorPixelCenter } from '@/core/painting-cursor'
import { referenceNavigationActive } from './canvas-reference-input'
import { paletteSamplingShortcutActive } from '@/core/palette-sampling-shortcut'
import { useCanvasToolSession } from './useCanvasToolSession'
import { createCanvasBrushConfig } from './createCanvasBrushConfig'
import { deriveCanvasEditTargets } from './deriveCanvasEditTargets'
import { useCanvasQuickSelection } from './useCanvasQuickSelection'
import { useCanvasSymmetryControls } from './useCanvasSymmetryControls'
import { useCanvasInteractionCancel } from './useCanvasInteractionCancel'
import { createCanvasPointerDown } from './canvas-pointer-down'
import { createCanvasPointerMove } from './canvas-pointer-move'
import { createCanvasPointerUp } from './canvas-pointer-up'
import { createCanvasSamplingStart } from './canvas-sampling-start'
import { createCanvasRasterStart } from './canvas-raster-start'
import { createCanvasSymmetryMove } from './canvas-symmetry-move'
import { createCanvasAutoPan } from './canvas-auto-pan'
import { createCanvasQuickSamplingMove } from './canvas-quick-sampling-move'
import { createNavigationCanvasInput } from './canvas-input-navigation'
import { createSelectionCanvasInput } from './canvas-input-selection'
import { createSelectionBeginCanvasInput } from './canvas-input-selection-begin'
import { createTextCanvasInput } from './canvas-input-text'
import { createShapeCanvasInput } from './canvas-input-shape'
import { createBoundsCanvasInput } from './canvas-input-bounds'
import { createFreeTileCanvasInput } from './canvas-input-free-tile'
import { createSliceCanvasInput } from './canvas-input-slice'
import { createLayerMoveCanvasInput } from './canvas-input-layer-move'
import { createLineConnectionCanvasInput } from './canvas-input-line-connection'
import { createStrokeCanvasInput } from './canvas-input-stroke'
import { createFreeTileEditCanvasInput } from './canvas-input-free-tile-edit'
import { createFillCanvasInput } from './canvas-input-fill'
import { createTileCanvasInput } from './canvas-input-tile'
import { createSamplingCanvasInput } from './canvas-input-sampling'
import { createTransformCanvasInput } from './canvas-input-transform'
import { useCanvasViewportGeometry } from './useCanvasViewportGeometry'
import { useCanvasPenCursor } from './useCanvasPenCursor'
import { useCanvasSelectionTransform } from './useCanvasSelectionTransform'
import { useCanvasRotatableGeometry } from './useCanvasRotatableGeometry'
import { useCanvasSelectionOverlay } from './useCanvasSelectionOverlay'
import { useCanvasBrushOverlay } from './useCanvasBrushOverlay'
import { useCanvasRenderEngine } from './useCanvasRenderEngine'
import { useCanvasStrokeClock } from './useCanvasStrokeClock'
import { useCanvasLayerFeedback } from './useCanvasLayerFeedback'
import { useCanvasBoundsPreview } from './useCanvasBoundsPreview'
import { useCanvasTextPreview } from './useCanvasTextPreview'
import { useCanvasTileTarget } from './useCanvasTileTarget'
import { useCanvasShapeCommit } from './useCanvasShapeCommit'
import { useCanvasCursor } from './useCanvasCursor'
import { useCanvasKeyboardInput } from './useCanvasKeyboardInput'
import { useCanvasColorSampling } from './useCanvasColorSampling'
import { useCanvasMagicLifecycle } from './useCanvasMagicLifecycle'
import { useCanvasDeviceRouter } from './useCanvasDeviceRouter'
import { useCanvasPreferences } from './useCanvasPreferences'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useWorkspace, type DocumentSession } from '@/store/workspace'
import { loadEditorPreferences } from '@/core/file-preferences'
import { CanvasInputState } from '@/core/canvas-input'
import { crosshairCursorForColor } from '@/core/canvas-visuals'
import { useCanvasViewPreview } from '@/components/useCanvasViewPreview'
import { PerformanceProfiler } from '@/components/PerformanceProfiler'
import { useI18n } from '@/components/I18nProvider'
import { resolveTheme } from '@/core/theme'
import { publishSelectionSizePreview } from '@/components/selection-size-preview-events'
import rotationBackground1 from '@/assets/rotation-indicator/background-1.png'
import rotationBackground2 from '@/assets/rotation-indicator/background-2.png'
import rotationBackground3 from '@/assets/rotation-indicator/background-3.png'
import rotationBackground4 from '@/assets/rotation-indicator/background-4.png'
import rotationBackground5 from '@/assets/rotation-indicator/background-5.png'
import rotationBackground6 from '@/assets/rotation-indicator/background-6.png'
import rotationPointer from '@/assets/rotation-indicator/pointer.png'
import { renderCanvasFrame } from './canvas-render-frame'
import { canvasStageIsVisible } from './canvas-stage-visibility'
import { subscribeAnimationTweenPreview } from './animation-tween-preview'
import { useAnimationTweenPreviewDrag } from './useAnimationTweenPreviewDrag'
import { LineAnchorHistory } from './canvas-stage-helpers'
import { CANVAS_VIEW_SCROLLBAR_THICKNESS } from './useCanvasViewScrollbars'
import { CanvasViewScrollbars } from './CanvasViewScrollbars'
import { CanvasReferences, isOutsideReferenceCanvas } from './CanvasReferences'

export function CanvasStage({ session: storedSession }: { session: DocumentSession }) {
  const { t } = useI18n()
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const selectionCanvasRef = useRef<HTMLCanvasElement>(null)
  const canvasPreferences = useCanvasPreferences()
  const rotationIndicatorPosition = canvasPreferences.rotationIndicatorPosition
  const interfaceScale = canvasPreferences.uiScale
  const drawingBrushPreviewEnabled = canvasPreferences.drawingBrushPreviewEnabled
  const zoomToolDragMode = canvasPreferences.zoomToolDragMode
  const viewDragSensitivity = canvasPreferences.viewDragSensitivity
  const tabletPreferences = canvasPreferences.tablet
  const brushPreviewMode = canvasPreferences.brushPreviewMode
  const cursorColorMode = canvasPreferences.cursorColorMode
  const cursorColor = canvasPreferences.cursorColor
  const brushEdgeColor = cursorColorMode === 'custom' ? cursorColor : undefined
  const brushEdgeThickness = canvasPreferences.brushEdgeThickness
  const canvasCursorStyle = cursorColorMode === 'custom'
    ? { '--cursor-crosshair': crosshairCursorForColor(cursorColor) } as CSSProperties
    : undefined
  const checkerboard = canvasPreferences.checkerboard
  const gridColors = useMemo(() => {
    const preferences = canvasPreferences
    return { pixelGridColor: preferences.pixelGridColor, gridColor: preferences.gridColor }
  }, [canvasPreferences])
  const alignmentPreferences = useMemo(() => {
    const preferences = canvasPreferences
    return {
      gridAlignmentEnabled: preferences.gridAlignmentEnabled,
      smartAlignmentEnabled: preferences.smartAlignmentEnabled,
      alignmentGuidesVisible: preferences.alignmentGuidesVisible,
      alignmentThreshold: preferences.alignmentThreshold
    }
  }, [canvasPreferences])
  const sliceColor = canvasPreferences.sliceColor
  const freeTileInstanceOutlineColor = canvasPreferences.freeTileInstanceOutlineColor
  const textBoxColor = canvasPreferences.textBoxColor
  const canvasResizeColor = canvasPreferences.canvasResizeColor
  const sliceOutlinesVisible = canvasPreferences.sliceOutlinesVisible
  const wheelZoomEnabled = canvasPreferences.wheelZoomEnabled
  const wheelZoomMode = canvasPreferences.wheelZoomMode
  const shiftLinePreviewEnabled = canvasPreferences.shiftLinePreviewEnabled
  const gradientLineVisible = canvasPreferences.gradientLineVisible
  const gradientLineColor = canvasPreferences.gradientLineColor
  const lassoPreviewClosed = canvasPreferences.lassoPreviewClosed
  const eyedropperQuickSelect = canvasPreferences.eyedropperQuickSelect
  const keyDisplayEnabled = canvasPreferences.keyDisplayEnabled
  const keyDisplaySize = canvasPreferences.keyDisplaySize
  const keyDisplayDuration = canvasPreferences.keyDisplayDuration
  const eyedropperSwitchToPencil = canvasPreferences.eyedropperSwitchToPencil
  const moveLayerContentPreviewEnabled = canvasPreferences.moveLayerContentPreviewEnabled
  const moveLayerClickFlashEnabled = canvasPreferences.moveLayerClickFlashEnabled
  const moveLayerClickFlashDuration = canvasPreferences.moveLayerClickFlashDuration
  const selectionCrosshair = canvasPreferences.selectionCrosshair
  const selectionPreviewColorMode = canvasPreferences.selectionPreviewColorMode
  const selectionPreviewColor = canvasPreferences.selectionPreviewColor
  const selectionSizeVisible = canvasPreferences.selectionSizeVisible
  const balancedShiftLineEnabled = canvasPreferences.balancedShiftLineEnabled
  const optimizedRotationEnabled = canvasPreferences.optimizedRotationEnabled
  const lineDirectionStep = canvasPreferences.lineDirectionStep
  const onionSkin = canvasPreferences.onionSkin
  const timelineHidden = canvasPreferences.timelineHidden
  const symmetryAxisPreferences = canvasPreferences.symmetryAxis
  const isoViewPreferences = canvasPreferences.isoView
  const activeTheme = useMemo(() => resolveTheme(canvasPreferences.theme), [canvasPreferences])
  const {
    shortcuts,
    shortcutConflictState,
    quickToolMatch,
    activeDocumentId,
    activeToolBrushSize,
    session,
    quickToolActive,
    quickMoveToolActive,
    sessionWithActiveQuickTool,
    sharedCanvasSession,
    liveInputSession,
    modifierActive,
    brushLineConnectionHasPriority,
    temporaryMoveActive,
    selectionTransformModifierState,
    currentSelectionTransformModifierState,
    selectionMarqueeModifierState,
    currentSelectionMarqueeModifierState,
    lineConnectionShortcut,
    lineConnectionConfigured,
    lineConnectionActive,
    lineConnectionPreviewActive
  } = useCanvasToolSession({
    get storedSession() { return storedSession },
    get inputRef() { return inputRef },
    get radialGradientCenterModifierActive() { return radialGradientCenterModifierActive },
    get canvasResizePreviewRef() { return canvasResizePreviewRef },
    get lineAnchor() { return lineAnchor }
  })

  const inputRef = useRef(new CanvasInputState())
  // Keyboard listeners intentionally live across brush changes. Deferred draws
  // must therefore resolve the current render function instead of the brush
  // configuration that was active when the listener was registered.
  const drawRef = useRef<() => void>(() => {})
  const requestDrawRef = useRef<() => void>(() => {})
  const selectionOverlayDrawRef = useRef<() => void>(() => {})
  const publishedSelectionSizePreviewRef = useRef<{ width: number; height: number } | null>(null)
  const lineAnchorHistoryRef = useRef<LineAnchorHistory | null>(null)
  const activeViewDrag = inputRef.current.drag?.kind === 'pan' || inputRef.current.drag?.kind === 'zoom-drag' || inputRef.current.drag?.kind === 'rotate-view'
  const {
    pendingViewRef,
    liveViewRef,
    zoomPreviewStartRef,
    applyRotationStyle,
    finishZoomPreview,
    scheduleZoomPreview,
    beginPanPreview,
    schedulePanPreview,
    finishPanPreview
  } = useCanvasViewPreview({
    documentId: session.document.id,
    sessionView: session.view,
    activeViewDrag,
    canvasRef,
    selectionCanvasRef,
    requestDrawRef
  })
  const [horizontalScrollbarVisible, setHorizontalScrollbarVisible] = useState(false)
  const canvasStatusBottomInset = canvasPreferences.canvasViewScrollbarsEnabled && horizontalScrollbarVisible
    ? CANVAS_VIEW_SCROLLBAR_THICKNESS
    : 0
  const {
    lineAnchor,
    isoGridSnapActive,
    isoLineAlignmentActive,
    gridSnapActive,
    brushLineGradient,
    sameRgbaColor,
    advanceIsoBrushPath,
    advanceIsoGridBrushEdges,
    snapBrushPointToGrid,
    balancedStraightLines,
    snapToIsoGrid,
    resolveStraightLine,
    symmetryCenter,
    fillKind,
    sliceTool,
    gradientDither,
    gradientStops,
    gradientStopsForButton,
    gradientType,
    radialGradientCenterModifierActive,
    gradientGeometryOptionsForDrag,
    updateGradientDragGeometry,
    selectionCornerRadius,
    shapeCornerRadius,
    activeBrushImage,
    activeBrushTexture,
    activeBrushDither,
    activeBrushPaintMode,
    activeBrushPreviewMode,
    proceduralAntialiasStrength,
    brushPatternOrigin
  } = createCanvasBrushConfig({
    get session() { return session },
    get isoViewPreferences() { return isoViewPreferences },
    get alignmentPreferences() { return alignmentPreferences },
    get canvasPreferences() { return canvasPreferences },
    get balancedShiftLineEnabled() { return balancedShiftLineEnabled },
    get lineDirectionStep() { return lineDirectionStep }
  })

  const {
    selectedFreeTileSelectionTarget,
    selectedFreeTileInstancesBounds,
    tilemapPaintSelectionForIncoming,
    tilemapEditCellIndexAtPoint,
    tilemapEditClipForCell,
    tilemapEditCreatesFirstTile,
    tilemapEditSelectionAtPoint,
    paintSelectionForDrag,
    tilemapCellAllowedBySelection,
    tilemapCellAtPoint,
    freeTileAtPoint,
    unionFreeTileDirtyRect,
    freeTileSourceEditForDrag,
    freeTileFloatingDragFields,
    freeTileLocalPoint,
    commitFreeTileSourceDrag
  } = useCanvasTileTarget({
    get session() { return session }
  })
  const {
    groupSelectionActive,
    hasSelectedRasterLayer,
    activeLayer,
    selectedTransformLayers,
    multipleAnimationSelection,
    selectionLayersEditable,
    tilemapSelectionCreationAllowed,
    selectionInteractionEditable,
    hasSelectedMovableLayer,
    activeLayerEditable
  } = deriveCanvasEditTargets({
    get session() { return session },
    get selectedFreeTileSelectionTarget() { return selectedFreeTileSelectionTarget }
  })

  const {
    rotationIndicatorRef,
    rotationPointerRef,
    rotationIndicatorAnchorRef,
    stageBounds,
    stageDisplaySize,
    stageSize,
    stagePoint,
    constrainCanvasView,
    applyViewRotation,
    updateRotationIndicator,
    displayedSelectionPoint,
    unrotatedStagePoint,
    repeatedDocumentPointsAt,
    localPointAt,
    tileRepeatPointAt,
    localPoint,
    localContinuousPointAt
  } = useCanvasViewportGeometry({
    get interfaceScale() { return interfaceScale },
    get stageRef() { return stageRef },
    get canvasRef() { return canvasRef },
    get storedSession() { return storedSession },
    get inputRef() { return inputRef },
    get rotationIndicatorPosition() { return rotationIndicatorPosition },
    get liveViewRef() { return liveViewRef },
    get session() { return session },
    get pendingViewRef() { return pendingViewRef },
    drawNow: () => drawRef.current(),
    get scheduleDraw() { return scheduleDraw }
  })

  const { penCursorRef, adaptiveCursorRef, cursorPreferencesRef, hidePenCursor, refreshPenCursor, syncPenCursor } = useCanvasPenCursor({
    paintingPoint: point => paintingCursorPixelCenter(point, stageSize(), session.document, liveViewRef.current, rotationIndicatorPosition, interfaceScale),
    get canvasRef() { return canvasRef },
    get interfaceScale() { return interfaceScale },
    get pressureAdapterRef() { return pressureAdapterRef },
    get stageBounds() { return stageBounds }
  })

  const {
    cancelSelectionPreview,
    adjustmentPreviewEditRef,
    cloneSelectionLayerStates,
    restoreSelectionLayerPreviews,
    symmetryStartPointForDrag,
    flushSelectionPreview,
    scheduleSelectionPreview,
    canUseDeferredSelectionPreview,
    restoreDeferredFloatingSelectionPreview,
    updateSelectionTransformPreview,
    updateFreeTransformPreview,
    endSelectionAdjustmentEdit,
    prepareSelectionTransformDrag,
    cloneSelectionQuad,
    freeTransformQuadForSession,
    selectionPivotForSession,
    selectionPivotHitAt
  } = useCanvasSelectionTransform({
    get session() { return session },
    get draw() { return draw },
    get symmetryCenter() { return symmetryCenter },
    get compositeCacheRef() { return compositeCacheRef },
    get invalidateCompositeRect() { return invalidateCompositeRect },
    get invalidateOnionSkinDragFrames() { return invalidateOnionSkinDragFrames },
    get tilemapEditClipForCell() { return tilemapEditClipForCell },
    get drawSelectionOverlay() { return drawSelectionOverlay },
    get inputRef() { return inputRef },
    get selectionTransformModifierState() { return selectionTransformModifierState },
    get multipleAnimationSelection() { return multipleAnimationSelection },
    get selectionLayersEditable() { return selectionLayersEditable },
    get selectedTransformLayers() { return selectedTransformLayers },
    get selectedFreeTileSelectionTarget() { return selectedFreeTileSelectionTarget },
    get displayedSelectionPoint() { return displayedSelectionPoint },
    get stagePoint() { return stagePoint }
  })

  const { updateMarqueePreview, updateShapePreview } = useCanvasRotatableGeometry({
    get selectionMarqueeModifierState() { return selectionMarqueeModifierState },
    get inputRef() { return inputRef },
    get session() { return session },
    get alignmentPreferences() { return alignmentPreferences },
    get quickSelectionCellAt() { return quickSelectionCellAt },
    get tilemapPaintSelectionForIncoming() { return tilemapPaintSelectionForIncoming },
    get scheduleDraw() { return scheduleDraw },
    get liveViewRef() { return liveViewRef },
    get selectionCornerRadius() { return selectionCornerRadius },
    get symmetryCenter() { return symmetryCenter }
  })

  const { selectionBoundaryCacheRef, polygonPathPreviewRenderCacheRef, drawSelectionOverlay } = useCanvasSelectionOverlay({
    get selectionOverlayDrawRef() { return selectionOverlayDrawRef },
    get canvasRef() { return canvasRef },
    get selectionCanvasRef() { return selectionCanvasRef },
    get session() { return session },
    get inputRef() { return inputRef },
    get textToolBoxRef() { return textToolBoxRef },
    get displayedSelectionPoint() { return displayedSelectionPoint },
    get stageSize() { return stageSize },
    get stageDisplaySize() { return stageDisplaySize },
    get interfaceScale() { return interfaceScale },
    get alignmentPreferences() { return alignmentPreferences },
    get selectedFreeTileInstancesBounds() { return selectedFreeTileInstancesBounds },
    get selectionSizeVisible() { return selectionSizeVisible },
    get liveViewRef() { return liveViewRef },
    get rotationIndicatorPosition() { return rotationIndicatorPosition },
    get activeTheme() { return activeTheme },
    get textBoxColor() { return textBoxColor },
    get freeTileInstanceOutlineColor() { return freeTileInstanceOutlineColor },
    get applyViewRotation() { return applyViewRotation },
    get t() { return t }
  })

  const {
    brushPreviewCanvasRef,
    brushPreviewDrawRef,
    brushPreviewCompositeCacheRef,
    brushPreviewStackCacheRef,
    brushPreviewOverlaySupported,
    scheduleBrushPreviewOverlay
  } = useCanvasBrushOverlay({
    get canvasRef() { return canvasRef },
    get inputRef() { return inputRef },
    get brushPreviewMode() { return brushPreviewMode },
    get brushEdgeColor() { return brushEdgeColor },
    get brushEdgeThickness() { return brushEdgeThickness },
    get drawingBrushPreviewEnabled() { return drawingBrushPreviewEnabled },
    get liveViewRef() { return liveViewRef },
    get repeatedDocumentPointsAt() { return repeatedDocumentPointsAt },
    get session() { return session },
    get stageSize() { return stageSize },
    get stageDisplaySize() { return stageDisplaySize },
    get interfaceScale() { return interfaceScale },
    get rotationIndicatorPosition() { return rotationIndicatorPosition },
    get applyViewRotation() { return applyViewRotation },
    get optimizedRotationEnabled() { return optimizedRotationEnabled },
    get snapBrushPointToGrid() { return snapBrushPointToGrid },
    get cursorCompositePointSamplerFor() { return cursorCompositePointSamplerFor },
    get activeTheme() { return activeTheme },
    get scheduleDraw() { return scheduleDraw },
    get activeToolBrushSize() { return activeToolBrushSize },
    get temporaryMoveActive() { return temporaryMoveActive }
  })

  const {
    publishedTilesetPreviewRef,
    rotationSceneRef,
    checkerboardTileRef,
    isoGuideTileRef,
    gradientPreviewSurfaceRef,
    gradientPreviewInputAtRef,
    gradientPreviewDiagnosticsRef,
    gradientCompositePreviewCacheRef,
    gradientPreviewCoverageCacheRef,
    compositeReplacementSamplerRef,
    compositeCacheRef,
    compositePointSamplerRef,
    onionSkinCacheRef,
    outlinePreviewCacheRef,
    publishedCanvasPreviewRef,
    invalidateCompositeRect,
    invalidateStrokeSegment,
    invalidateOnionSkinDragFrames,
    scheduleDraw,
    cursorCompositePointSamplerFor,
    cursorCompositePointReplacementSamplerFor
  } = useCanvasRenderEngine({
    get canvasRef() { return canvasRef },
    get storedSession() { return storedSession },
    get session() { return session },
    get activeBrushImage() { return activeBrushImage },
    get symmetryCenter() { return symmetryCenter },
    get inputRef() { return inputRef },
    get drawRef() { return drawRef },
    get requestDrawRef() { return requestDrawRef },
    get canvasResizePreviewRef() { return canvasResizePreviewRef },
    get pendingCanvasResizeRef() { return pendingCanvasResizeRef },
    get canvasResizeFrameRef() { return canvasResizeFrameRef },
    get selectionBoundaryCacheRef() { return selectionBoundaryCacheRef },
    get localPointAt() { return localPointAt },
    get updateCursorAt() { return updateCursorAt },
    get interfaceScale() { return interfaceScale },
    get activeBrushDither() { return activeBrushDither },
    get fillKind() { return fillKind },
    get gradientDither() { return gradientDither },
    get drawingBrushPreviewEnabled() { return drawingBrushPreviewEnabled },
    get brushPreviewMode() { return brushPreviewMode },
    get checkerboard() { return checkerboard },
    get gridColors() { return gridColors },
    get alignmentPreferences() { return alignmentPreferences },
    get sliceColor() { return sliceColor },
    get textBoxColor() { return textBoxColor },
    get canvasResizeColor() { return canvasResizeColor },
    get sliceOutlinesVisible() { return sliceOutlinesVisible },
    get shiftLinePreviewEnabled() { return shiftLinePreviewEnabled },
    get gradientLineVisible() { return gradientLineVisible },
    get gradientLineColor() { return gradientLineColor },
    get lassoPreviewClosed() { return lassoPreviewClosed },
    get selectionCrosshair() { return selectionCrosshair },
    get selectionPreviewColorMode() { return selectionPreviewColorMode },
    get selectionPreviewColor() { return selectionPreviewColor },
    get selectionSizeVisible() { return selectionSizeVisible },
    get balancedShiftLineEnabled() { return balancedShiftLineEnabled },
    get lineDirectionStep() { return lineDirectionStep },
    get lineConnectionShortcut() { return lineConnectionShortcut },
    get rotationIndicatorPosition() { return rotationIndicatorPosition },
    get onionSkin() { return onionSkin },
    get timelineHidden() { return timelineHidden },
    get symmetryAxisPreferences() { return symmetryAxisPreferences },
    get isoViewPreferences() { return isoViewPreferences },
    get optimizedRotationEnabled() { return optimizedRotationEnabled }
  })

  const { sprayAirbrushRef, applyLiquifyHoldRef, stopAirbrushTimer, scheduleAirbrushTimer, stopLiquifyTimer, scheduleLiquifyTimer } = useCanvasStrokeClock({
    get session() { return session },
    get paintSelectionForDrag() { return paintSelectionForDrag },
    get symmetryCenter() { return symmetryCenter },
    get compositeCacheRef() { return compositeCacheRef },
    get scheduleDraw() { return scheduleDraw },
    get invalidateCompositeRect() { return invalidateCompositeRect },
    get inputRef() { return inputRef },
    get liveInputSession() { return liveInputSession },
    get requestDrawRef() { return requestDrawRef }
  })

  const {
    moveLayerContentPreviewRef,
    moveLayerContentPreviewTimerRef,
    clickFlashCacheRef,
    moveLayerClickFlashRef,
    moveLayerClickFlashTimerRef,
    freeTileInstanceFlashRef,
    topEditableLayerAt,
    alignmentDragFields,
    alignedDragTranslation,
    hideMoveLayerContentPreview,
    showMoveLayerContentPreview,
    flashMoveLayer
  } = useCanvasLayerFeedback({
    get session() { return session },
    get moveLayerClickFlashEnabled() { return moveLayerClickFlashEnabled },
    get moveLayerClickFlashDuration() { return moveLayerClickFlashDuration },
    get scheduleDraw() { return scheduleDraw },
    get alignmentPreferences() { return alignmentPreferences },
    get liveViewRef() { return liveViewRef },
    get moveLayerContentPreviewEnabled() { return moveLayerContentPreviewEnabled }
  })

  const {
    canvasResizePreviewRef,
    autoSlicePreviewRef,
    pendingCanvasResizeRef,
    canvasResizeFrameRef,
    flushCanvasResizePreview,
    scheduleCanvasResizePreview,
    canvasResizeHitAt,
    canvasResizeHit,
    canvasResizeContainsAt,
    canvasResizeContains
  } = useCanvasBoundsPreview({
    get session() { return session },
    get scheduleDraw() { return scheduleDraw },
    get canvasRef() { return canvasRef },
    get stageSize() { return stageSize },
    get liveViewRef() { return liveViewRef },
    get unrotatedStagePoint() { return unrotatedStagePoint }
  })

  const { textToolPreviewRef, textToolBoxRef, textLayerAt, sliceHandleAt } = useCanvasTextPreview({
    get session() { return session },
    get scheduleDraw() { return scheduleDraw },
    get stageSize() { return stageSize },
    get liveViewRef() { return liveViewRef },
    get unrotatedStagePoint() { return unrotatedStagePoint }
  })

  const {
    commitPolygonLasso,
    commitShapePoints,
    commitBrushPath,
    commitPolygonShape,
    curveDefaultControls,
    curveShapePixelPoints,
    lineShapeBrushPoints,
    commitCurveShape
  } = useCanvasShapeCommit({
    get inputRef() { return inputRef },
    get tilemapPaintSelectionForIncoming() { return tilemapPaintSelectionForIncoming },
    get session() { return session },
    get balancedShiftLineEnabled() { return balancedShiftLineEnabled },
    get symmetryCenter() { return symmetryCenter },
    get t() { return t },
    get scheduleDraw() { return scheduleDraw },
    get freeTileSourceEditForDrag() { return freeTileSourceEditForDrag },
    get freeTileLocalPoint() { return freeTileLocalPoint },
    get paintSelectionForDrag() { return paintSelectionForDrag },
    get commitFreeTileSourceDrag() { return commitFreeTileSourceDrag },
    get activeBrushTexture() { return activeBrushTexture },
    get activeBrushImage() { return activeBrushImage },
    get proceduralAntialiasStrength() { return proceduralAntialiasStrength },
    get activeBrushPaintMode() { return activeBrushPaintMode },
    get brushPatternOrigin() { return brushPatternOrigin },
    get activeBrushDither() { return activeBrushDither },
    get optimizedRotationEnabled() { return optimizedRotationEnabled },
    get balancedStraightLines() { return balancedStraightLines }
  })

  const {
    selectionHitAt,
    selectionHit,
    rotationCursorForHit,
    displayedResizeCursorForHandle,
    resizeCursorForHit,
    shearCursorForTransform,
    updateCursorAt,
    updateCursor
  } = useCanvasCursor({
    get useLocalCursors() { return canvasPreferences.useLocalCursors },
    get session() { return session },
    get canvasRef() { return canvasRef },
    get stageSize() { return stageSize },
    get stagePoint() { return stagePoint },
    get liveViewRef() { return liveViewRef },
    get rotationIndicatorPosition() { return rotationIndicatorPosition },
    get freeTransformQuadForSession() { return freeTransformQuadForSession },
    get displayedSelectionPoint() { return displayedSelectionPoint },
    get inputRef() { return inputRef },
    get selectionCrosshair() { return selectionCrosshair },
    get selectionInteractionEditable() { return selectionInteractionEditable },
    get quickToolActive() { return quickToolActive },
    get canvasResizePreviewRef() { return canvasResizePreviewRef },
    get canvasResizeHitAt() { return canvasResizeHitAt },
    get canvasResizeContainsAt() { return canvasResizeContainsAt },
    get symmetryAxisHitAt() { return symmetryAxisHitAt },
    get symmetryDragRef() { return symmetryDragRef },
    get temporaryMoveActive() { return temporaryMoveActive },
    get localPointAt() { return localPointAt },
    get cursorCompositePointSamplerFor() { return cursorCompositePointSamplerFor },
    get activeLayerEditable() { return activeLayerEditable },
    get cursorCompositePointReplacementSamplerFor() { return cursorCompositePointReplacementSamplerFor },
    get checkerboard() { return checkerboard },
    get activeLayer() { return activeLayer },
    get modifierActive() { return modifierActive },
    get wheelBrushSizePreviewRef() { return wheelBrushSizePreviewRef },
    get selectionPivotHitAt() { return selectionPivotHitAt },
    get topEditableLayerAt() { return topEditableLayerAt },
    get selectionLayersEditable() { return selectionLayersEditable },
    get textLayerAt() { return textLayerAt },
    get updateRotationIndicator() { return updateRotationIndicator },
    get hasSelectedMovableLayer() { return hasSelectedMovableLayer },
    get sliceTool() { return sliceTool },
    get sliceHandleAt() { return sliceHandleAt },
    get scheduleDraw() { return scheduleDraw },
    get symmetryCenter() { return symmetryCenter },
    get symmetryAxisPreferences() { return symmetryAxisPreferences },
    get quickToolMatch() { return quickToolMatch }
  })

  const { keyDisplayEntries, keyDisplayWheelRef } = useCanvasKeyboardInput({
    get useLocalCursors() { return canvasPreferences.useLocalCursors },
    get keyDisplayEnabled() { return keyDisplayEnabled },
    get inputRef() { return inputRef },
    get modifierActive() { return modifierActive },
    get wheelBrushSizePreviewRef() { return wheelBrushSizePreviewRef },
    get scheduleDraw() { return scheduleDraw },
    get session() { return session },
    get canvasResizeFrameRef() { return canvasResizeFrameRef },
    get shortcuts() { return shortcuts },
    get updateGradientDragGeometry() { return updateGradientDragGeometry },
    get liveInputSession() { return liveInputSession },
    get shortcutConflictState() { return shortcutConflictState },
    get eyedropperQuickSelect() { return eyedropperQuickSelect },
    get quickEyedropperActiveRef() { return quickEyedropperActiveRef },
    get quickEyedropperSuppressedRef() { return quickEyedropperSuppressedRef },
    get quickEyedropperOriginalColorRef() { return quickEyedropperOriginalColorRef },
    get eyedropperLens() { return eyedropperLens },
    get hideEyedropperMagnifier() { return hideEyedropperMagnifier },
    get sameRgbaColor() { return sameRgbaColor },
    get activeDocumentId() { return activeDocumentId },
    get onionSkinCacheRef() { return onionSkinCacheRef },
    get liveViewRef() { return liveViewRef },
    get applyRotationStyle() { return applyRotationStyle },
    get updateRotationIndicator() { return updateRotationIndicator },
    get canvasRef() { return canvasRef },
    get selectionCrosshair() { return selectionCrosshair },
    get selectionInteractionEditable() { return selectionInteractionEditable },
    get scheduleBrushPreviewOverlay() { return scheduleBrushPreviewOverlay },
    get lineConnectionConfigured() { return lineConnectionConfigured },
    get lineConnectionPreviewActive() { return lineConnectionPreviewActive },
    get activeLayer() { return activeLayer },
    get brushPreviewOverlaySupported() { return brushPreviewOverlaySupported },
    get canvasResizePreviewRef() { return canvasResizePreviewRef },
    get canvasColorSampleAtClientPointRef() { return canvasColorSampleAtClientPointRef },
    get updateEyedropperMagnifier() { return updateEyedropperMagnifier },
    get quickToolActive() { return quickToolActive },
    get updateCursorAt() { return updateCursorAt },
    get updateMarqueePreview() { return updateMarqueePreview },
    get currentSelectionMarqueeModifierState() { return currentSelectionMarqueeModifierState },
    get updateShapePreview() { return updateShapePreview },
    get updateFreeTransformPreview() { return updateFreeTransformPreview },
    get updateSelectionTransformPreview() { return updateSelectionTransformPreview },
    get currentSelectionTransformModifierState() { return currentSelectionTransformModifierState },
    get keyDisplayDuration() { return keyDisplayDuration },
    get lineConnectionActive() { return lineConnectionActive },
    get flushEyedropperSampleColor() { return flushEyedropperSampleColor },
    get cancelActiveCanvasInteraction() { return cancelActiveCanvasInteraction },
    get hidePenCursor() { return hidePenCursor },
    get gradientType() { return gradientType },
    get lineAnchor() { return lineAnchor },
    get lineConnectionShortcut() { return lineConnectionShortcut }
  })

  const {
    quickEyedropperOriginalColorRef,
    quickEyedropperActiveRef,
    quickEyedropperSuppressedRef,
    canvasColorSampleAtClientPointRef,
    eyedropperLens,
    hideEyedropperMagnifier,
    queueEyedropperSampleColor,
    flushEyedropperSampleColor,
    updateEyedropperMagnifier
  } = useCanvasColorSampling({
    get canvasRef() { return canvasRef },
    get session() { return session },
    get activeDocumentId() { return activeDocumentId },
    get localPointAt() { return localPointAt },
    get cursorCompositePointSamplerFor() { return cursorCompositePointSamplerFor },
    get liveInputSession() { return liveInputSession },
    get stageBounds() { return stageBounds },
    get localContinuousPointAt() { return localContinuousPointAt },
    get liveViewRef() { return liveViewRef },
    get checkerboard() { return checkerboard }
  })

  const { magicGestureRef, magicWandWorkerRef, magicPreviewFlash } = useCanvasMagicLifecycle({
    get session() { return session },
    get inputRef() { return inputRef },
    get commitPolygonShape() { return commitPolygonShape },
    get commitCurveShape() { return commitCurveShape },
    get commitPolygonLasso() { return commitPolygonLasso },
    get scheduleDraw() { return scheduleDraw }
  })

  const { pressureAdapterRef, wheelBrushSizePreviewRef, pointerDown, pointerMove, pointerUp, pointerCancel, pointerLeave, pointerEnter } =
    useCanvasDeviceRouter({
    get useLocalCursors() { return canvasPreferences.useLocalCursors },
      get inputRef() { return inputRef },
      get session() { return session },
      get canvasRef() { return canvasRef },
      get stageBounds() { return stageBounds },
      get keyDisplayEnabled() { return keyDisplayEnabled },
      get keyDisplayWheelRef() { return keyDisplayWheelRef },
      get activeLayer() { return activeLayer },
      get canvasResizePreviewRef() { return canvasResizePreviewRef },
      get modifierActive() { return modifierActive },
      get activeBrushImage() { return activeBrushImage },
      get updateCursorAt() { return updateCursorAt },
      get scheduleDraw() { return scheduleDraw },
      get brushSizeWheelReversed() { return canvasPreferences.brushSizeWheelReversed },
      get wheelZoomEnabled() { return wheelZoomEnabled },
      get liveViewRef() { return liveViewRef },
      get wheelZoomMode() { return wheelZoomMode },
      get stageSize() { return stageSize },
      get scheduleZoomPreview() { return scheduleZoomPreview },
      get constrainCanvasView() { return constrainCanvasView },
      get stagePoint() { return stagePoint },
      get rotationIndicatorPosition() { return rotationIndicatorPosition },
      get liveInputSession() { return liveInputSession },
      get tabletPreferences() { return tabletPreferences },
      get beginPanPreview() { return beginPanPreview },
      get finishPanPreview() { return finishPanPreview },
      get applyRotationStyle() { return applyRotationStyle },
      get finishZoomPreview() { return finishZoomPreview },
      get handlePointerDown() { return handlePointerDown },
      get syncPenCursor() { return syncPenCursor },
      get handlePointerMove() { return handlePointerMove },
      get handlePointerUp() { return handlePointerUp },
      get cancelActiveCanvasInteraction() { return cancelActiveCanvasInteraction },
      get hideEyedropperMagnifier() { return hideEyedropperMagnifier },
      get updateCursor() { return updateCursor },
      get scheduleBrushPreviewOverlay() { return scheduleBrushPreviewOverlay },
      get hidePenCursor() { return hidePenCursor },
      get selectionCrosshair() { return selectionCrosshair },
      get selectionInteractionEditable() { return selectionInteractionEditable },
      get draw() { return draw },
      get quickEyedropperOriginalColorRef() { return quickEyedropperOriginalColorRef },
      get flushEyedropperSampleColor() { return flushEyedropperSampleColor },
      get quickEyedropperSuppressedRef() { return quickEyedropperSuppressedRef },
      get brushPreviewOverlaySupported() { return brushPreviewOverlaySupported },
      get lineConnectionPreviewActive() { return lineConnectionPreviewActive }
    })

  useEffect(() => {
    const syncPreferences = (): void => {
      const preferences = loadEditorPreferences()
      if (inputRef.current.drag?.alignmentGuides?.length) {
        inputRef.current.drag.alignmentGuides = []
        scheduleDraw()
      }
      cursorPreferencesRef.current = preferences
      refreshPenCursor()
      if (preferences.symmetryAxis.locked && !inputRef.current.ctrlHeld) symmetryDragRef.current = null
      onionSkinCacheRef.current.invalidateAll()
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
    return () => {
      window.removeEventListener('moonsprite:preferences-changed', syncPreferences)
    }
  }, [])
  const { cancelActiveCanvasInteraction } = useCanvasInteractionCancel({
    get magicGestureRef() { return magicGestureRef },
    get canvasRef() { return canvasRef },
    get stopAirbrushTimer() { return stopAirbrushTimer },
    get stopLiquifyTimer() { return stopLiquifyTimer },
    get updateRotationIndicator() { return updateRotationIndicator },
    get liveViewRef() { return liveViewRef },
    get hideMoveLayerContentPreview() { return hideMoveLayerContentPreview },
    get gradientPreviewCoverageCacheRef() { return gradientPreviewCoverageCacheRef },
    get gradientCompositePreviewCacheRef() { return gradientCompositePreviewCacheRef },
    get inputRef() { return inputRef },
    get symmetryDragRef() { return symmetryDragRef },
    get cancelSelectionPreview() { return cancelSelectionPreview },
    get endSelectionAdjustmentEdit() { return endSelectionAdjustmentEdit },
    get adjustmentPreviewEditRef() { return adjustmentPreviewEditRef },
    get session() { return session },
    get restoreDeferredFloatingSelectionPreview() { return restoreDeferredFloatingSelectionPreview },
    get restoreSelectionLayerPreviews() { return restoreSelectionLayerPreviews },
    get canvasResizeFrameRef() { return canvasResizeFrameRef },
    get pendingCanvasResizeRef() { return pendingCanvasResizeRef },
    get canvasResizePreviewRef() { return canvasResizePreviewRef },
    get finishPanPreview() { return finishPanPreview },
    get finishZoomPreview() { return finishZoomPreview },
    get invalidateOnionSkinDragFrames() { return invalidateOnionSkinDragFrames },
    get compositeCacheRef() { return compositeCacheRef },
    get scheduleDraw() { return scheduleDraw }
  })

  useEffect(
    () => () => {
      publishSelectionSizePreview({ documentId: session.document.id, size: null })
    },
    [session.document.id]
  )
  useEffect(() => subscribeAnimationTweenPreview(session.document.id, () => scheduleDraw()), [session.document.id])

  const draw = (): void => {
    if (!canvasStageIsVisible(canvasRef.current, useWorkspace.getState().activeId)) return
    renderCanvasFrame({
      resources: {
        canvasRef,
        inputRef,
        wheelBrushSizePreviewRef,
        magicPreviewFlash,
        canvasResizePreviewRef,
        liveViewRef,
        zoomPreviewStartRef,
        rotationSceneRef,
        checkerboardTileRef,
        isoGuideTileRef,
        onionSkinCacheRef,
        compositeCacheRef,
        textToolPreviewRef,
        moveLayerClickFlashRef,
        clickFlashCacheRef,
        freeTileInstanceFlashRef,
        compositePointSamplerRef,
        compositeReplacementSamplerRef,
        polygonPathPreviewRenderCacheRef,
        outlinePreviewCacheRef,
        gradientPreviewDiagnosticsRef,
        gradientCompositePreviewCacheRef,
        gradientPreviewSurfaceRef,
        gradientPreviewCoverageCacheRef,
        gradientPreviewInputAtRef,
        lineAnchorHistoryRef,
        publishedTilesetPreviewRef,
        brushPreviewStackCacheRef,
        brushPreviewCompositeCacheRef,
        moveLayerContentPreviewRef,
        autoSlicePreviewRef,
        publishedSelectionSizePreviewRef,
        brushPreviewDrawRef,
        publishedCanvasPreviewRef,
        moveLayerClickFlashTimerRef
      },
      settings: {
        useLocalCursors: canvasPreferences.useLocalCursors,
        session,
        interfaceScale,
        rotationIndicatorPosition,
        activeTheme,
        checkerboard,
        isoViewPreferences,
        timelineHidden,
        onionSkin,
        moveLayerClickFlashEnabled,
        gridColors,
        selectionPreviewColorMode,
        selectionPreviewColor,
        brushEdgeColor,
        brushEdgeThickness,
        activeBrushImage,
        activeBrushPreviewMode,
        activeBrushTexture,
        proceduralAntialiasStrength,
        activeBrushDither,
        optimizedRotationEnabled,
        symmetryCenter,
        balancedStraightLines,
        shapeCornerRadius,
        balancedShiftLineEnabled,
        gradientStops,
        gradientDither,
        gradientType,
        gradientLineVisible,
        gradientLineColor,
        shiftLinePreviewEnabled,
        lineConnectionConfigured,
        lineAnchor,
        symmetryAxisPreferences,
        canvasResizeColor,
        lassoPreviewClosed,
        sliceTool,
        fillKind,
        brushPreviewMode,
        drawingBrushPreviewEnabled,
        canvasStatusBottomInset,
        gridSnapActive,
        moveLayerContentPreviewEnabled,
        sliceOutlinesVisible,
        sliceColor,
        t,
        activeDocumentId
      },
      geometry: {
        sharedCanvasSession,
        sessionWithActiveQuickTool,
        temporaryMoveActive,
        stageSize,
        stageDisplaySize,
        brushPatternOrigin,
        paintSelectionForDrag,
        curveDefaultControls,
        gradientGeometryOptionsForDrag,
        tileRepeatPointAt,
        resolveStraightLine,
        modifierActive,
        tilemapEditSelectionAtPoint,
        repeatedDocumentPointsAt,
        selectionHitAt,
        sliceHandleAt,
        tilemapEditCreatesFirstTile,
        tilemapCellAllowedBySelection,
        brushPreviewOverlaySupported,
        snapBrushPointToGrid,
        applyViewRotation,
        drawSelectionOverlay,
        cloneSelectionQuad,
        scheduleDraw
      },
      readSession: () => useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id) ?? session
    })
  }

  drawRef.current = draw
  const { quickSelectionPressRef, quickSelectionHandledAtRef, quickSelectionCellAt, quickSelectCell } = useCanvasQuickSelection({
    get checkerboard() { return checkerboard },
    get inputRef() { return inputRef },
    get commitPolygonShape() { return commitPolygonShape },
    get commitPolygonLasso() { return commitPolygonLasso },
    get session() { return session },
    get localPointAt() { return localPointAt },
    get modifierActive() { return modifierActive },
    get tilemapPaintSelectionForIncoming() { return tilemapPaintSelectionForIncoming },
    get t() { return t },
    get scheduleDraw() { return scheduleDraw }
  })

  const { symmetryDragRef, symmetryAxisHitAt } = useCanvasSymmetryControls({
    get symmetryAxisPreferences() { return symmetryAxisPreferences },
    get session() { return session },
    get localContinuousPointAt() { return localContinuousPointAt },
    get symmetryCenter() { return symmetryCenter },
    get liveViewRef() { return liveViewRef }
  })

  const navigationInput = createNavigationCanvasInput({
    get inputRef() { return inputRef },
    get liveViewRef() { return liveViewRef },
    get beginPanPreview() { return beginPanPreview },
    get scheduleBrushPreviewOverlay() { return scheduleBrushPreviewOverlay },
    get stageSize() { return stageSize },
    get stagePoint() { return stagePoint },
    get rotationIndicatorPosition() { return rotationIndicatorPosition },
    get rotationIndicatorAnchorRef() { return rotationIndicatorAnchorRef },
    get updateRotationIndicator() { return updateRotationIndicator },
    get viewDragSensitivity() { return viewDragSensitivity },
    get interfaceScale() { return interfaceScale },
    get constrainCanvasView() { return constrainCanvasView },
    get schedulePanPreview() { return schedulePanPreview },
    get zoomToolDragMode() { return zoomToolDragMode },
    get scheduleZoomPreview() { return scheduleZoomPreview },
    get modifierActive() { return modifierActive },
    get applyRotationStyle() { return applyRotationStyle },
    get scheduleDraw() { return scheduleDraw },
    get finishPanPreview() { return finishPanPreview },
    get localPoint() { return localPoint },
    get updateCursor() { return updateCursor },
    get finishZoomPreview() { return finishZoomPreview }
  })

  const selectionInput = createSelectionCanvasInput({
    get useLocalCursors() { return canvasPreferences.useLocalCursors },
    get selectionHit() { return selectionHit },
    get updateCursor() { return updateCursor },
    get selectionPivotHitAt() { return selectionPivotHitAt },
    get selectionPivotForSession() { return selectionPivotForSession },
    get localContinuousPointAt() { return localContinuousPointAt },
    get inputRef() { return inputRef },
    get commitPolygonLasso() { return commitPolygonLasso },
    get scheduleDraw() { return scheduleDraw },
    get liveViewRef() { return liveViewRef },
    get repeatedDocumentPointsAt() { return repeatedDocumentPointsAt },
    get selectionCrosshair() { return selectionCrosshair },
    get selectionInteractionEditable() { return selectionInteractionEditable },
    get currentSelectionMarqueeModifierState() { return currentSelectionMarqueeModifierState },
    get updateMarqueePreview() { return updateMarqueePreview },
    get symmetryCenter() { return symmetryCenter },
    get modifierActive() { return modifierActive },
    get alignedDragTranslation() { return alignedDragTranslation },
    get scheduleSelectionPreview() { return scheduleSelectionPreview },
    get draw() { return draw },
    get t() { return t },
    get tilemapPaintSelectionForIncoming() { return tilemapPaintSelectionForIncoming },
    get optimizedRotationEnabled() { return optimizedRotationEnabled }
  })

  const selectionBeginInput = createSelectionBeginCanvasInput({
    get updateMarqueePreview() { return updateMarqueePreview },
    get currentSelectionMarqueeModifierState() { return currentSelectionMarqueeModifierState },
    get useLocalCursors() { return canvasPreferences.useLocalCursors },
    get selectedFreeTileSelectionTarget() { return selectedFreeTileSelectionTarget },
    get selectionHit() { return selectionHit },
    get liveViewRef() { return liveViewRef },
    get repeatedDocumentPointsAt() { return repeatedDocumentPointsAt },
    get quickSelectionPressRef() { return quickSelectionPressRef },
    get quickSelectionCellAt() { return quickSelectionCellAt },
    get tilemapPaintSelectionForIncoming() { return tilemapPaintSelectionForIncoming },
    get inputRef() { return inputRef },
    get quickSelectionHandledAtRef() { return quickSelectionHandledAtRef },
    get selectionCrosshair() { return selectionCrosshair },
    get selectionInteractionEditable() { return selectionInteractionEditable },
    get scheduleDraw() { return scheduleDraw },
    get displayedResizeCursorForHandle() { return displayedResizeCursorForHandle },
    get modifierActive() { return modifierActive },
    get selectionLayersEditable() { return selectionLayersEditable },
    get alignmentDragFields() { return alignmentDragFields },
    get freeTransformQuadForSession() { return freeTransformQuadForSession },
    get cloneSelectionLayerStates() { return cloneSelectionLayerStates },
    get freeTileFloatingDragFields() { return freeTileFloatingDragFields },
    get tilemapEditCellIndexAtPoint() { return tilemapEditCellIndexAtPoint },
    get selectedTransformLayers() { return selectedTransformLayers },
    get canUseDeferredSelectionPreview() { return canUseDeferredSelectionPreview },
    get cloneSelectionQuad() { return cloneSelectionQuad },
    get selectionPivotForSession() { return selectionPivotForSession },
    get shearCursorForTransform() { return shearCursorForTransform },
    get rotationCursorForHit() { return rotationCursorForHit },
    get selectionTransformModifierState() { return selectionTransformModifierState },
    get resizeCursorForHit() { return resizeCursorForHit },
    get symmetryCenter() { return symmetryCenter },
    get selectionPreviewColorMode() { return selectionPreviewColorMode },
    get selectionPreviewColor() { return selectionPreviewColor },
    get magicGestureRef() { return magicGestureRef },
    get t() { return t },
    get drawSelectionOverlay() { return drawSelectionOverlay },
    get magicWandWorkerRef() { return magicWandWorkerRef },
    get magicPreviewFlash() { return magicPreviewFlash },
    get optimizedRotationEnabled() { return optimizedRotationEnabled }
  })

  const textInput = createTextCanvasInput({
    get inputRef() { return inputRef },
    get displayedResizeCursorForHandle() { return displayedResizeCursorForHandle },
    get textLayerAt() { return textLayerAt },
    get scheduleDraw() { return scheduleDraw },
    get selectionTransformModifierState() { return selectionTransformModifierState },
    get compositeCacheRef() { return compositeCacheRef },
    get textToolBoxRef() { return textToolBoxRef }
  })

  const shapeInput = createShapeCanvasInput({
    get commitPolygonShape() { return commitPolygonShape },
    get scheduleDraw() { return scheduleDraw },
    get gridSnapActive() { return gridSnapActive },
    get inputRef() { return inputRef },
    get draw() { return draw },
    get isoGridSnapActive() { return isoGridSnapActive },
    get snapToIsoGrid() { return snapToIsoGrid },
    get currentSelectionMarqueeModifierState() { return currentSelectionMarqueeModifierState },
    get updateShapePreview() { return updateShapePreview },
    get resolveStraightLine() { return resolveStraightLine },
    get freeTileSourceEditForDrag() { return freeTileSourceEditForDrag },
    get paintSelectionForDrag() { return paintSelectionForDrag },
    get symmetryCenter() { return symmetryCenter },
    get shapeCornerRadius() { return shapeCornerRadius },
    get t() { return t },
    get commitFreeTileSourceDrag() { return commitFreeTileSourceDrag },
    get commitShapePoints() { return commitShapePoints },
    get commitBrushPath() { return commitBrushPath },
    get lineShapeBrushPoints() { return lineShapeBrushPoints },
    get curveShapePixelPoints() { return curveShapePixelPoints }
  })

  const boundsInput = createBoundsCanvasInput({
    get inputRef() { return inputRef },
    get canvasResizeContains() { return canvasResizeContains },
    get scheduleCanvasResizePreview() { return scheduleCanvasResizePreview },
    get modifierActive() { return modifierActive }
  })

  const freeTileInput = createFreeTileCanvasInput({
    get inputRef() { return inputRef },
    get scheduleDraw() { return scheduleDraw },
    get isoGridSnapActive() { return isoGridSnapActive },
    get repeatedDocumentPointsAt() { return repeatedDocumentPointsAt },
    get snapToIsoGrid() { return snapToIsoGrid },
    get optimizedRotationEnabled() { return optimizedRotationEnabled },
    get compositeCacheRef() { return compositeCacheRef },
    get isoLineAlignmentActive() { return isoLineAlignmentActive },
    get modifierActive() { return modifierActive },
    get unionFreeTileDirtyRect() { return unionFreeTileDirtyRect },
    get localPointAt() { return localPointAt },
    get symmetryCenter() { return symmetryCenter },
    get alignedDragTranslation() { return alignedDragTranslation },
    get t() { return t },
    get endSelectionAdjustmentEdit() { return endSelectionAdjustmentEdit },
    get draw() { return draw },
    get freeTileSourceEditForDrag() { return freeTileSourceEditForDrag },
    get commitFreeTileSourceDrag() { return commitFreeTileSourceDrag },
    get lineAnchorHistoryRef() { return lineAnchorHistoryRef }
  })

  const sliceInput = createSliceCanvasInput({
    get useLocalCursors() { return canvasPreferences.useLocalCursors },
    get sliceTool() { return sliceTool },
    get sliceHandleAt() { return sliceHandleAt },
    get inputRef() { return inputRef },
    get displayedResizeCursorForHandle() { return displayedResizeCursorForHandle },
    get scheduleDraw() { return scheduleDraw },
    get selectionCrosshair() { return selectionCrosshair }
  })

  const layerMoveInput = createLayerMoveCanvasInput({
    get topEditableLayerAt() { return topEditableLayerAt },
    get showMoveLayerContentPreview() { return showMoveLayerContentPreview },
    get flashMoveLayer() { return flashMoveLayer },
    get hideMoveLayerContentPreview() { return hideMoveLayerContentPreview },
    get inputRef() { return inputRef },
    get alignmentDragFields() { return alignmentDragFields },
    get alignedDragTranslation() { return alignedDragTranslation },
    get modifierActive() { return modifierActive },
    get t() { return t },
    get compositeCacheRef() { return compositeCacheRef },
    get invalidateOnionSkinDragFrames() { return invalidateOnionSkinDragFrames },
    get invalidateCompositeRect() { return invalidateCompositeRect },
    get scheduleDraw() { return scheduleDraw }
  })

  const lineConnectionInput = createLineConnectionCanvasInput({
    get lineConnectionActive() { return lineConnectionActive },
    get lineAnchor() { return lineAnchor },
    get tileRepeatPointAt() { return tileRepeatPointAt },
    get resolveStraightLine() { return resolveStraightLine },
    get modifierActive() { return modifierActive },
    get lineAnchorHistoryRef() { return lineAnchorHistoryRef },
    get balancedStraightLines() { return balancedStraightLines },
    get brushLineGradient() { return brushLineGradient },
    get optimizedRotationEnabled() { return optimizedRotationEnabled },
    get t() { return t },
    get compositeCacheRef() { return compositeCacheRef },
    get scheduleDraw() { return scheduleDraw },
    get symmetryCenter() { return symmetryCenter },
    get inputRef() { return inputRef }
  })

  const strokeInput = createStrokeCanvasInput({
    get inputRef() { return inputRef },
    get optimizedRotationEnabled() { return optimizedRotationEnabled },
    get scheduleDraw() { return scheduleDraw },
    get localContinuousPointAt() { return localContinuousPointAt },
    get applyLiquifyHoldRef() { return applyLiquifyHoldRef },
    get scheduleLiquifyTimer() { return scheduleLiquifyTimer },
    get gridSnapActive() { return gridSnapActive },
    get sprayAirbrushRef() { return sprayAirbrushRef },
    get scheduleAirbrushTimer() { return scheduleAirbrushTimer },
    get canvasPreferences() { return canvasPreferences },
    get repeatedDocumentPointsAt() { return repeatedDocumentPointsAt },
    get invalidateStrokeSegment() { return invalidateStrokeSegment },
    get invalidateCompositeRect() { return invalidateCompositeRect },
    get compositeCacheRef() { return compositeCacheRef },
    get t() { return t },
    get lineAnchorHistoryRef() { return lineAnchorHistoryRef },
    get freeTileSourceEditForDrag() { return freeTileSourceEditForDrag },
    get commitFreeTileSourceDrag() { return commitFreeTileSourceDrag }
  })

  const freeTileEditInput = createFreeTileEditCanvasInput({
    get gradientStopsForButton() { return gradientStopsForButton },
    get inputRef() { return inputRef },
    get draw() { return draw },
    get commitFreeTileSourceDrag() { return commitFreeTileSourceDrag },
    get t() { return t },
    get compositeCacheRef() { return compositeCacheRef },
    get gridSnapActive() { return gridSnapActive },
    get sprayAirbrushRef() { return sprayAirbrushRef },
    get scheduleAirbrushTimer() { return scheduleAirbrushTimer },
    get isoGridSnapActive() { return isoGridSnapActive },
    get snapToIsoGrid() { return snapToIsoGrid },
    get repeatedDocumentPointsAt() { return repeatedDocumentPointsAt },
    get advanceIsoGridBrushEdges() { return advanceIsoGridBrushEdges },
    get brushLineGradient() { return brushLineGradient },
    get optimizedRotationEnabled() { return optimizedRotationEnabled },
    get localPointAt() { return localPointAt },
    get advanceIsoBrushPath() { return advanceIsoBrushPath },
    get scheduleDraw() { return scheduleDraw }
  })

  const fillInput = createFillCanvasInput({
    get invalidateCompositeRect() { return invalidateCompositeRect },
    get gridSnapActive() { return gridSnapActive },
    get gradientPreviewCoverageCacheRef() { return gradientPreviewCoverageCacheRef },
    get inputRef() { return inputRef },
    get gradientStopsForButton() { return gradientStopsForButton },
    get draw() { return draw },
    get symmetryCenter() { return symmetryCenter },
    get t() { return t },
    get gradientPreviewDiagnosticsRef() { return gradientPreviewDiagnosticsRef },
    get gradientPreviewInputAtRef() { return gradientPreviewInputAtRef },
    get updateGradientDragGeometry() { return updateGradientDragGeometry },
    get scheduleDraw() { return scheduleDraw },
    get freeTileSourceEditForDrag() { return freeTileSourceEditForDrag },
    get freeTileLocalPoint() { return freeTileLocalPoint },
    get gradientDither() { return gradientDither },
    get gradientType() { return gradientType },
    get gradientGeometryOptionsForDrag() { return gradientGeometryOptionsForDrag },
    get gradientStops() { return gradientStops },
    get commitFreeTileSourceDrag() { return commitFreeTileSourceDrag },
    get paintSelectionForDrag() { return paintSelectionForDrag }
  })

  const tileInput = createTileCanvasInput({
    get tilemapCellAllowedBySelection() { return tilemapCellAllowedBySelection },
    get invalidateCompositeRect() { return invalidateCompositeRect },
    get inputRef() { return inputRef },
    get scheduleDraw() { return scheduleDraw },
    get localPointAt() { return localPointAt },
    get repeatedDocumentPointsAt() { return repeatedDocumentPointsAt },
    get symmetryCenter() { return symmetryCenter },
    get modifierActive() { return modifierActive },
    get compositeCacheRef() { return compositeCacheRef },
    get t() { return t },
    get endSelectionAdjustmentEdit() { return endSelectionAdjustmentEdit },
    get draw() { return draw }
  })

  const samplingInput = createSamplingCanvasInput({
    get freeTileAtPoint() { return freeTileAtPoint },
    get inputRef() { return inputRef },
    get hideEyedropperMagnifier() { return hideEyedropperMagnifier },
    get tilemapCellAtPoint() { return tilemapCellAtPoint },
    get cursorCompositePointSamplerFor() { return cursorCompositePointSamplerFor },
    get queueEyedropperSampleColor() { return queueEyedropperSampleColor },
    get updateEyedropperMagnifier() { return updateEyedropperMagnifier },
    get flushEyedropperSampleColor() { return flushEyedropperSampleColor },
    get eyedropperLens() { return eyedropperLens },
    get eyedropperSwitchToPencil() { return eyedropperSwitchToPencil },
    get updateCursor() { return updateCursor },
    get draw() { return draw }
  })

  const transformInput = createTransformCanvasInput({
    get repeatedDocumentPointsAt() { return repeatedDocumentPointsAt },
    get symmetryCenter() { return symmetryCenter },
    get alignedDragTranslation() { return alignedDragTranslation },
    get modifierActive() { return modifierActive },
    get prepareSelectionTransformDrag() { return prepareSelectionTransformDrag },
    get scheduleSelectionPreview() { return scheduleSelectionPreview },
    get updateFreeTransformPreview() { return updateFreeTransformPreview },
    get updateSelectionTransformPreview() { return updateSelectionTransformPreview },
    get selectionTransformModifierState() { return selectionTransformModifierState },
    get symmetryStartPointForDrag() { return symmetryStartPointForDrag },
    get invalidateCompositeRect() { return invalidateCompositeRect },
    get t() { return t }
  })
  const startSampling = createCanvasSamplingStart({
    get canvasRef() { return canvasRef },
    get inputRef() { return inputRef },
    get queueEyedropperSampleColor() { return queueEyedropperSampleColor },
    get updateEyedropperMagnifier() { return updateEyedropperMagnifier },
    get updateRotationIndicator() { return updateRotationIndicator },
    get liveViewRef() { return liveViewRef },
    get freeTileAtPoint() { return freeTileAtPoint },
    get hideEyedropperMagnifier() { return hideEyedropperMagnifier },
    get draw() { return draw },
    get tilemapCellAtPoint() { return tilemapCellAtPoint },
    get cursorCompositePointSamplerFor() { return cursorCompositePointSamplerFor },
    get eyedropperLens() { return eyedropperLens }
  })
  const startRaster = createCanvasRasterStart({
    get tileRepeatPointAt() { return tileRepeatPointAt },
    get isoGridSnapActive() { return isoGridSnapActive },
    get repeatedDocumentPointsAt() { return repeatedDocumentPointsAt },
    get snapToIsoGrid() { return snapToIsoGrid },
    get gridSnapActive() { return gridSnapActive },
    get snapBrushPointToGrid() { return snapBrushPointToGrid },
    get symmetryCenter() { return symmetryCenter },
    get optimizedRotationEnabled() { return optimizedRotationEnabled },
    get invalidateStrokeSegment() { return invalidateStrokeSegment },
    get inputRef() { return inputRef },
    get isoLineAlignmentActive() { return isoLineAlignmentActive },
    get scheduleDraw() { return scheduleDraw }
  })
  const moveSymmetry = createCanvasSymmetryMove({
    get symmetryDragRef() { return symmetryDragRef },
    get symmetryAxisPreferences() { return symmetryAxisPreferences },
    get updateCursor() { return updateCursor },
    get localContinuousPointAt() { return localContinuousPointAt },
    get symmetryCenter() { return symmetryCenter },
    get scheduleDraw() { return scheduleDraw }
  })
  const autoPanSelection = createCanvasAutoPan({
    get inputRef() { return inputRef },
    get stageSize() { return stageSize },
    get stagePoint() { return stagePoint },
    get liveViewRef() { return liveViewRef },
    get rotationIndicatorPosition() { return rotationIndicatorPosition },
    get constrainCanvasView() { return constrainCanvasView },
    get applyRotationStyle() { return applyRotationStyle }
  })
  const moveQuickSampling = createCanvasQuickSamplingMove({
    get quickEyedropperActiveRef() { return quickEyedropperActiveRef },
    get eyedropperQuickSelect() { return eyedropperQuickSelect },
    get inputRef() { return inputRef },
    get quickEyedropperSuppressedRef() { return quickEyedropperSuppressedRef },
    get canvasResizePreviewRef() { return canvasResizePreviewRef },
    get canvasColorSampleAtClientPointRef() { return canvasColorSampleAtClientPointRef },
    get quickEyedropperOriginalColorRef() { return quickEyedropperOriginalColorRef },
    get eyedropperLens() { return eyedropperLens },
    get queueEyedropperSampleColor() { return queueEyedropperSampleColor },
    get updateEyedropperMagnifier() { return updateEyedropperMagnifier }
  })
  const handlePointerDown = createCanvasPointerDown({
    get magicGestureRef() { return magicGestureRef },
    get liveInputSession() { return liveInputSession },
    get pressureAdapterRef() { return pressureAdapterRef },
    get sameRgbaColor() { return sameRgbaColor },
    get zoomPreviewStartRef() { return zoomPreviewStartRef },
    get finishZoomPreview() { return finishZoomPreview },
    get inputRef() { return inputRef },
    get navigationInput() { return navigationInput },
    get selectionInput() { return selectionInput },
    get quickToolActive() { return quickToolActive },
    get selectionPivotHitAt() { return selectionPivotHitAt },
    get symmetryAxisHitAt() { return symmetryAxisHitAt },
    get symmetryDragRef() { return symmetryDragRef },
    get localPoint() { return localPoint },
    get localContinuousPointAt() { return localContinuousPointAt },
    get activeLayer() { return activeLayer },
    get modifierActive() { return modifierActive },
    get updateCursor() { return updateCursor },
    get startSampling() { return startSampling },
    get selectionHit() { return selectionHit },
    get radialGradientCenterModifierActive() { return radialGradientCenterModifierActive },
    get quickMoveToolActive() { return quickMoveToolActive },
    get brushLineConnectionHasPriority() { return brushLineConnectionHasPriority },
    get textLayerAt() { return textLayerAt },
    get textInput() { return textInput },
    get shapeInput() { return shapeInput },
    get canvasResizeHit() { return canvasResizeHit },
    get canvasResizePreviewRef() { return canvasResizePreviewRef },
    get boundsInput() { return boundsInput },
    get groupSelectionActive() { return groupSelectionActive },
    get hasSelectedRasterLayer() { return hasSelectedRasterLayer },
    get selectionLayersEditable() { return selectionLayersEditable },
    get tilemapSelectionCreationAllowed() { return tilemapSelectionCreationAllowed },
    get tilemapEditSelectionAtPoint() { return tilemapEditSelectionAtPoint },
    get freeTileInput() { return freeTileInput },
    get sliceTool() { return sliceTool },
    get sliceInput() { return sliceInput },
    get layerMoveInput() { return layerMoveInput },
    get lineConnectionActive() { return lineConnectionActive },
    get lineAnchor() { return lineAnchor },
    get lineConnectionInput() { return lineConnectionInput },
    get selectionBeginInput() { return selectionBeginInput },
    get strokeInput() { return strokeInput },
    get freeTileEditInput() { return freeTileEditInput },
    get fillInput() { return fillInput },
    get tileInput() { return tileInput },
    get startRaster() { return startRaster }
  })
  const handlePointerMove = createCanvasPointerMove({
    get useLocalCursors() { return canvasPreferences.useLocalCursors },
    get inputRef() { return inputRef },
    get navigationInput() { return navigationInput },
    get liveInputSession() { return liveInputSession },
    get canvasRef() { return canvasRef },
    get tabletPreferences() { return tabletPreferences },
    get pressureAdapterRef() { return pressureAdapterRef },
    get updateRotationIndicator() { return updateRotationIndicator },
    get liveViewRef() { return liveViewRef },
    get symmetryDragRef() { return symmetryDragRef },
    get cancelActiveCanvasInteraction() { return cancelActiveCanvasInteraction },
    get updateCursor() { return updateCursor },
    get moveSymmetry() { return moveSymmetry },
    get autoPanSelection() { return autoPanSelection },
    get lineConnectionPreviewActive() { return lineConnectionPreviewActive },
    get localPoint() { return localPoint },
    get repeatedDocumentPointsAt() { return repeatedDocumentPointsAt },
    get localContinuousPointAt() { return localContinuousPointAt },
    get selectionCrosshair() { return selectionCrosshair },
    get activeLayer() { return activeLayer },
    get modifierActive() { return modifierActive },
    get interfaceScale() { return interfaceScale },
    get brushPreviewOverlaySupported() { return brushPreviewOverlaySupported },
    get scheduleBrushPreviewOverlay() { return scheduleBrushPreviewOverlay },
    get scheduleDraw() { return scheduleDraw },
    get moveQuickSampling() { return moveQuickSampling },
    get selectionInput() { return selectionInput },
    get fillInput() { return fillInput },
    get strokeInput() { return strokeInput },
    get samplingInput() { return samplingInput },
    get boundsInput() { return boundsInput },
    get freeTileInput() { return freeTileInput },
    get layerMoveInput() { return layerMoveInput },
    get freeTileEditInput() { return freeTileEditInput },
    get tileInput() { return tileInput },
    get shapeInput() { return shapeInput },
    get textInput() { return textInput },
    get sliceInput() { return sliceInput },
    get transformInput() { return transformInput }
  })
  const handlePointerUp = createCanvasPointerUp({
    get liveInputSession() { return liveInputSession },
    get stopAirbrushTimer() { return stopAirbrushTimer },
    get stopLiquifyTimer() { return stopLiquifyTimer },
    get symmetryDragRef() { return symmetryDragRef },
    get inputRef() { return inputRef },
    get cancelActiveCanvasInteraction() { return cancelActiveCanvasInteraction },
    get updateCursor() { return updateCursor },
    get draw() { return draw },
    get endSelectionAdjustmentEdit() { return endSelectionAdjustmentEdit },
    get scheduleDraw() { return scheduleDraw },
    get hideEyedropperMagnifier() { return hideEyedropperMagnifier },
    get hideMoveLayerContentPreview() { return hideMoveLayerContentPreview },
    get flushCanvasResizePreview() { return flushCanvasResizePreview },
    get cancelSelectionPreview() { return cancelSelectionPreview },
    get flushSelectionPreview() { return flushSelectionPreview },
    get adjustmentPreviewEditRef() { return adjustmentPreviewEditRef },
    get navigationInput() { return navigationInput },
    get selectionInput() { return selectionInput },
    get samplingInput() { return samplingInput },
    get fillInput() { return fillInput },
    get tileInput() { return tileInput },
    get freeTileInput() { return freeTileInput },
    get strokeInput() { return strokeInput },
    get layerMoveInput() { return layerMoveInput },
    get shapeInput() { return shapeInput },
    get textInput() { return textInput },
    get sliceInput() { return sliceInput },
    get transformInput() { return transformInput }
  })

  const tweenPreviewDrag = useAnimationTweenPreviewDrag({
    documentId: () => session.document.id,
    moveToolActive: () => liveInputSession().tool === 'move' && !inputRef.current.spaceHeld && !inputRef.current.drag && !liveInputSession().animationPlaying,
    pointAt: (x, y) => repeatedDocumentPointsAt(x, y, true, true)
  })
  const rotationStyle = { transform: 'none', transformOrigin: '50% 50%' }
  return (
    <PerformanceProfiler id="CanvasStage">
      <div ref={stageRef} className="stage-surface">
        <canvas
          ref={canvasRef}
          data-document-id={session.document.id}
          style={{ ...rotationStyle, ...canvasCursorStyle }}
          className={`stage-canvas ${session.tool === 'zoom' ? 'zoom-tool-canvas' : ''}`}
          aria-label={t('canvas.aria')}
          onPointerDown={(event) => { if (event.pointerType === 'touch' || event.ctrlKey || event.metaKey || (event.pointerType === 'pen' && tabletPreferences.api === 'disabled') || !tweenPreviewDrag.pointerDown(event)) pointerDown(event) }}
          onPointerMove={(event) => { if (!tweenPreviewDrag.pointerMove(event)) pointerMove(event) }}
          onPointerUp={(event) => { if (!tweenPreviewDrag.pointerUp(event)) pointerUp(event) }}
          onPointerCancel={(event) => { if (!tweenPreviewDrag.pointerCancel(event)) pointerCancel(event) }}
          onLostPointerCapture={(event) => tweenPreviewDrag.pointerCancel(event)}
          onDoubleClick={quickSelectCell}
          onPointerLeave={pointerLeave}
          onPointerEnter={pointerEnter}
          onContextMenu={(event) => event.preventDefault()}
        />
        <canvas ref={selectionCanvasRef} style={rotationStyle} className="stage-selection-overlay" aria-hidden="true" />
        <canvas ref={brushPreviewCanvasRef} style={rotationStyle} className="stage-brush-preview-overlay" aria-hidden="true" />
        <img ref={penCursorRef} className="stage-pen-cursor" alt="" hidden aria-hidden="true" draggable={false} />
        <span ref={adaptiveCursorRef} className="stage-pen-cursor stage-adaptive-cursor" hidden aria-hidden="true" />
        {eyedropperLens.overlay}
        <CanvasReferences stageRef={stageRef} documentId={session.document.id}
          viewport={{ width: session.viewportSize.width, height: session.viewportSize.height, documentWidth: session.document.width, documentHeight: session.document.height, view: session.view, interfaceScale, rotationIndicatorPosition }}
          navigationActive={() => referenceNavigationActive(inputRef.current.spaceHeld, liveInputSession().tool, liveInputSession().animationPlaying)}
          onNavigatePointerDown={(event) => {
            const canvas = canvasRef.current
            if (!canvas || !(event.button === 1 || (event.button === 0 && (event.ctrlKey || event.metaKey || referenceNavigationActive(inputRef.current.spaceHeld, liveInputSession().tool, liveInputSession().animationPlaying))))) return false
            pointerDown(Object.assign(Object.create(event), { currentTarget: canvas, target: canvas }))
            return true
          }}
          samplingActive={() => liveInputSession().tool === 'eyedropper' || quickToolActive('eyedropper') || paletteSamplingShortcutActive()}
          transformModifiers={(event) => ({ ...selectionTransformModifierState(event), constrainAxis: modifierActive(event, 'constrainAxis') })}
          snapRotation={(event) => modifierActive(event.nativeEvent, 'snapSelectionRotation')} isOutside={(x, y) => isOutsideReferenceCanvas(localPointAt(x, y), session.document.width, session.document.height)} />
        {canvasPreferences.canvasViewScrollbarsEnabled && <CanvasViewScrollbars
          documentId={session.document.id}
          documentWidth={session.document.width} documentHeight={session.document.height}
          viewportWidth={session.viewportSize.width} viewportHeight={session.viewportSize.height}
          view={session.view} rotationIndicatorPosition={rotationIndicatorPosition}
          ariaLabel={t('canvas.aria')}
          onHorizontalVisibilityChange={setHorizontalScrollbarVisible}
        />}
        {keyDisplayEnabled && keyDisplayEntries.length > 0 && (
          <div
            className="canvas-key-display"
            style={{ transform: `scale(${keyDisplaySize})`, '--key-display-duration': `${keyDisplayDuration}ms` } as CSSProperties}
            aria-live="polite"
            aria-label={t('canvas.keyDisplay')}
          >
            {keyDisplayEntries.map((entry) => (
              <span className="canvas-key-display-item" key={entry.id}>
                {entry.label}
              </span>
            ))}
          </div>
        )}
        <div ref={rotationIndicatorRef} className="rotation-indicator" hidden aria-hidden="true">
          <span className="rotation-indicator-background">
            {[rotationBackground1, rotationBackground2, rotationBackground3, rotationBackground4, rotationBackground5, rotationBackground6].map((source) => (
              <img key={source} src={source} alt="" />
            ))}
          </span>
          <span ref={rotationPointerRef} className="rotation-indicator-pointer">
            <img src={rotationPointer} alt="" />
          </span>
        </div>
      </div>
    </PerformanceProfiler>
  )
}
