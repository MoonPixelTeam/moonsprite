import { isWorkspaceResizing, recordWorkspaceResizeStage, recordWorkspaceResizeContext } from './workspace-resize'
import { createLinearDitherPreviewSampler } from '../core/gradient-dither-preview'
import { measureRuntimeDiagnostic, recordRuntimeDiagnostic } from '../core/runtime-diagnostics'
import { documentDiagnosticDetail } from '../core/document-diagnostics'
import { createGradientCompositePreview, compositeGradientPreviewAt, fillGradientPreviewBlock, gradientReplacementColor } from '@/core/gradient-preview'
import { drawMagicWandPreview } from './canvas-magic-preview'
import type { RgbaColor } from '@shared/types-color'
import type { SelectionMask, SelectionRect } from '@shared/types-selection'
import type { TilemapCell } from '@shared/types-tiles'
import { getPaletteEntry, isLayerEffectivelyLocked, isLayerEffectivelyVisible, layerIndexAt, layerMaskDisplayColor, readLayerColorAt, readLayerMaskDisplayColorAt, resolveLayerCanvasColor } from '@/core/document-model'
import { compositePixelWithLayerColor, compositeRegion, createCompositePointReplacementSampler, createCompositePointSampler, createNormalCompositePointReplacementSampler, createNormalCompositePointSampler } from '@/core/document-composite'
import { blendOver, relativeLuminanceColor, TRANSPARENT, unpackColor } from '@/core/raster'
import { createGradientColorSampler, resolveRadialGradientGeometry } from '@/core/gradient'
import { DEFAULT_BRUSH_DITHER_SETTINGS } from '@/core/gradient-color'
import { applyInkColor, resolveInkStampColor } from '@/core/ink'
import { DEFAULT_GRID_SETTINGS, gridLinePositions, shouldRenderPixelGrid, snapPointToGrid } from '@/core/grid'
import { bezierCurvePixelPoints, lineShapePixelPoints, perfectPixelPathPoints, shapeBoundaryPixelPoints } from '@/core/tools-shapes'
import { selectionTranslationPreviewEdit } from '@/core/tools-selection-transform'
import { brushMaskOffsets, brushPathStampPoints, brushStampAnchor, solidBrushPreviewRowSpans } from '@/core/tools-brush'
import { outlinePixelSamples } from '@/core/tools-outline'
import { resolveOutlineStrokeColor } from '@/core/outline-settings'
import { activeLayerMask, activePaintLayer, selectedTransformLayersAreEditable } from '@/store/workspace-session'
import { animationLoopSectionAtFrame } from '@/core/animation-loop-sections'
import { DEFAULT_GRID_COLOR } from '@/core/file-preferences'
import { documentPointFromViewportPoint } from '@/core/view-geometry'
import { createCanvasRenderPlan, deviceAlignedCanvasRect, deviceAlignedCoordinate, deviceAlignedPixelRect, repeatedDeviceAlignedCanvasRect } from '@/core/canvas-render-plan'
import { canvasBackingRatioForInterfaceScale } from '@/core/canvas-interface-scale'
import { isoGuidePixelPattern, isoGuideSegments, isoGuideSpacingForZoom } from '@/core/isometric'
import { rasterLinePoints, selectionContains } from '@/core/selection'
import { canvasResizePreviewClippedRects, canvasResizePreviewExposedRects, drawCanvasResizePreviewLayers } from '@/core/canvas-resize-preview'
import { canvasGestureForPreview, deferredSelectionPreviewOwner, drawingSizePreviewTargetForDrag, layerMovePreviewActive, polygonLassoPreviewPoints, shapeBounds, temporaryMoveSuppressesToolPreview, type CanvasDragState as DragState, type CanvasPoint as Point } from '@/core/canvas-input'
import { canvasStatusTextColor, colorLuminance, selectionCursorCornerRects, selectionPathPreviewPixelVisible, selectionPreviewPixels, transparencyColorAt } from '@/core/canvas-visuals'
import { hasSymmetry, symmetryAxisSegment, symmetryPoints, type SymmetryAxis } from '@/core/symmetry'
import { notifyCanvasPreview, type CanvasPreviewSnapshot } from '@/core/canvas-preview-lifecycle'
import { presentCanvasClickFlash } from './canvas-click-flash'
import { type RasterContext2D } from '@/components/canvas-selection-renderer'
import { canvasBackingCapacity, clearCanvasBacking, syncCanvasDisplaySize } from '@/components/canvas-display-size'
import { onionSkinFrameRefs } from '@/core/onion-skin'
import { pixelSamplingMode } from '@/core/pixel-display'
import { airbrushParticleSize, airbrushSymmetryPoints } from '@/core/airbrush'
import { activeBrushInputsForTool } from '@/core/brushes'
import { sliceAtPoint } from '@/core/slices'
import { parseAnimationCelKey } from '@/core/animation'
import { activeTilemapCelTarget, tilemapEditPreviewTilePixels } from '@/core/tilemap-document'
import { nearestTileRepeatEquivalent, readTilesetTilePixels, tilemapCellBounds, tilemapCellIndexAtPoint, tilemapSourcePointForCell, tilesetHasOnlyTransparentTile, tileRepeatContinuousPreviewPlacements, tileRepeatLinePoints, tileRepeatMappedPointForCopies, tileRepeatOffsetsForViewport, tileRepeatPreviewPlacements } from '@/core/tilemap'
import { freeTileInstanceBounds, freeTileSourceForInstance, freeTileSourcePointForInstance, freeTileSourceStampOrigin, freeTileTileIdForInstance } from '@/core/free-tile'
import { activeFreeTileCelTarget, freeTileInstanceAtDocumentPoint, freeTileSourceForId } from '@/core/free-tile-document'
import { clearTilesetTilePreview, publishTilesetTilePreview } from '@/components/tileset-preview-events'
import { publishSelectionSizePreview } from '@/components/selection-size-preview-events'
import { createPolygonPathRasterCache } from '@/core/canvas-input'
import { brushPreviewAllowedDuringDrag } from '@/core/canvas-input'
import type * as React from 'react'
import type { DocumentSession } from '@/store/workspace-types'
import { MoveLayerClickFlash, FreeTileInstanceFlash, PolygonPathPreviewRenderCache, GradientCompositePreviewCache, GradientPreviewSurface, GradientPreviewCoverageCache, LineAnchorHistory, BrushPreviewStackCache, BrushPreviewCompositeCache, pointerIsOverCanvas, SELECTION_PATH_PREVIEW_BATCH_THRESHOLD, brushBaseAngle, DITHERED_GRADIENT_PREVIEW_SAMPLE_LIMIT, SMOOTH_GRADIENT_PREVIEW_SAMPLE_LIMIT, symmetryGuideAxisEnabled, drawDeviceAlignedCanvasBorder, nonContentPreviewDragKinds } from './canvas-stage-helpers'

export interface CanvasRenderContext {
  resources: {
    canvasRef: React.RefObject<HTMLCanvasElement | null>
    inputRef: React.RefObject<import('@/core/canvas-input').CanvasInputState>
    wheelBrushSizePreviewRef: React.RefObject<boolean>
    canvasResizePreviewRef: React.RefObject<import('@/store/workspace-types').CanvasResizePreview | null>
    liveViewRef: React.RefObject<import('@shared/types-view').ViewState>
    zoomPreviewStartRef: React.RefObject<import('@shared/types-view').ViewState | null>
    rotationSceneRef: React.RefObject<OffscreenCanvas | null>
    checkerboardTileRef: React.RefObject<{ key: string; canvas: OffscreenCanvas; } | null>
    isoGuideTileRef: React.RefObject<{ key: string; canvas: OffscreenCanvas; } | null>
    onionSkinCacheRef: React.RefObject<import('@/components/onion-skin-composite-cache').OnionSkinCompositeCache>
    compositeCacheRef: React.RefObject<import('@/components/canvas-composite-cache').CanvasCompositeCache>
    textToolPreviewRef: React.RefObject<import('@shared/types-animation').AnimationCelSurface | null>
    moveLayerClickFlashRef: React.RefObject<MoveLayerClickFlash | null>
    clickFlashCacheRef: React.RefObject<import('@/components/canvas-click-flash').CanvasClickFlashCache>
    freeTileInstanceFlashRef: React.RefObject<FreeTileInstanceFlash | null>
    compositePointSamplerRef: React.RefObject<{ document: import('@shared/types-document').SpriteDocument; revision: number; sampler: (x: number, y: number) => import('@shared/types-color').RgbaColor; } | null>
    compositeReplacementSamplerRef: React.RefObject<{ document: import('@shared/types-document').SpriteDocument; revision: number; layerId: string; sampler: (x: number, y: number, replacement: import('@shared/types-color').RgbaColor) => import('@shared/types-color').RgbaColor; } | null>
    polygonPathPreviewRenderCacheRef: React.RefObject<PolygonPathPreviewRenderCache | null>
    outlinePreviewCacheRef: React.RefObject<{ revision: number; layerId: string; selection: import('@shared/types-selection').SelectionMask | null; preview: import('@/store/workspace-types').OutlinePreview; samples: import('@/core/tools-outline').OutlinePixelSample[]; } | null>
    gradientPreviewDiagnosticsRef: React.RefObject<{ record(key: string, detail: import('@/core/runtime-diagnostics').RuntimeDiagnosticDetail, timing: import('@/core/gradient-preview-diagnostics').GradientPreviewTiming): void; flush: () => void; } | null>
    gradientCompositePreviewCacheRef: React.RefObject<GradientCompositePreviewCache | null>
    gradientPreviewSurfaceRef: React.RefObject<GradientPreviewSurface | null>
    gradientPreviewCoverageCacheRef: React.RefObject<GradientPreviewCoverageCache | null>
    gradientPreviewInputAtRef: React.RefObject<number>
    lineAnchorHistoryRef: React.RefObject<LineAnchorHistory | null>
    publishedTilesetPreviewRef: React.RefObject<string | null>
    brushPreviewStackCacheRef: React.RefObject<BrushPreviewStackCache | null>
    brushPreviewCompositeCacheRef: React.RefObject<BrushPreviewCompositeCache | null>
    moveLayerContentPreviewRef: React.RefObject<import('@/components/canvas-move-selection').CanvasMoveLayerContentPreview | null>
    autoSlicePreviewRef: React.RefObject<import('@shared/types-selection').SelectionRect[] | null>
    publishedSelectionSizePreviewRef: React.RefObject<{ width: number; height: number; } | null>
    brushPreviewDrawRef: React.RefObject<() => void>
    publishedCanvasPreviewRef: React.RefObject<import('@/core/canvas-preview-lifecycle').CanvasPreviewSnapshot | null>
    moveLayerClickFlashTimerRef: React.RefObject<number | null>
  }
  settings: {
    session: import('@/store/workspace-types').DocumentSession
    interfaceScale: 0.75 | 1 | 1.5 | 2
    rotationIndicatorPosition: import('@/core/file-preferences').RotationIndicatorPosition
    activeTheme: import('@/core/theme').ResolvedTheme
    checkerboard: import('@/core/file-preferences').CheckerboardPreferences
    isoViewPreferences: import('@/core/file-preferences').IsoViewPreferences
    timelineHidden: boolean
    onionSkin: import('@/core/file-preferences').OnionSkinPreferences
    moveLayerClickFlashEnabled: boolean
    gridColors: import('@/core/file-preferences').GridColorPreferences
    selectionPreviewColorMode: import('@/core/file-preferences').SelectionPreviewColorMode
    selectionPreviewColor: import('@shared/types-color').RgbaColor
    activeBrushImage: import('@shared/types-brush').ImageBrush | null
    activeBrushPreviewMode: import('@shared/types-brush').BrushPaintMode
    activeBrushTexture: import('@shared/types-brush').BrushTexture
    proceduralAntialiasStrength: number
    activeBrushDither: import('@shared/types-brush').BrushDitherSettings | undefined
    optimizedRotationEnabled: boolean
    symmetryCenter: import('@/core/symmetry').SymmetryCenter
    balancedStraightLines: boolean
    shapeCornerRadius: number
    balancedShiftLineEnabled: boolean
    gradientStops: import('@shared/types-brush').GradientStop[] | undefined
    gradientDither: import('@shared/types-brush').GradientDither
    gradientType: import('@shared/types-brush').GradientType
    gradientLineVisible: boolean
    gradientLineColor: import('@shared/types-color').RgbaColor
    shiftLinePreviewEnabled: boolean
    lineConnectionConfigured: boolean
    lineAnchor: { x: number; y: number; } | null
    symmetryAxisPreferences: import('@/core/file-preferences').SymmetryAxisPreferences
    canvasResizeColor: import('@shared/types-color').RgbaColor
    lassoPreviewClosed: boolean
    sliceTool: boolean
    fillKind: import('@shared/types-brush').FillKind
    brushPreviewMode: import('@/core/file-preferences').BrushPreviewMode
    drawingBrushPreviewEnabled: boolean
    gridSnapActive: boolean
    moveLayerContentPreviewEnabled: boolean
    sliceOutlinesVisible: boolean
    sliceColor: import('@shared/types-color').RgbaColor
    t: ReturnType<typeof import('./I18nProvider').useI18n>['t']
    activeDocumentId: string | null
  }
  geometry: {
    sharedCanvasSession: (current: import('@/store/workspace-types').DocumentSession) => import('@/store/workspace-types').DocumentSession
    sessionWithActiveQuickTool: (current: import('@/store/workspace-types').DocumentSession) => import('@/store/workspace-types').DocumentSession
    temporaryMoveActive: (event: Pick<KeyboardEvent, "altKey" | "ctrlKey" | "metaKey" | "shiftKey">, targetSession?: import('@/store/workspace-types').DocumentSession) => boolean
    stageSize: () => { width: number; height: number; }
    stageDisplaySize: () => { width: number; height: number; }
    brushPatternOrigin: (point: import('@/core/canvas-input').CanvasPoint, size?: number, imageBrush?: import('@shared/types-brush').ImageBrush | null) => import('@/core/canvas-input').CanvasPoint
    paintSelectionForDrag: (drag: import('@/core/canvas-input').CanvasDragState) => import('@shared/types-selection').SelectionMask | null
    curveDefaultControls: (start: import('@/core/canvas-input').CanvasPoint, end: import('@/core/canvas-input').CanvasPoint, count: number) => import('@/core/canvas-input').CanvasPoint[]
    gradientGeometryOptionsForDrag: (drag: Pick<import('@/core/canvas-input').CanvasDragState, "constrain" | "gradientAngle" | "gradientFromCenter" | "gradientRadialGeometry">) => import('@/core/gradient-color').GradientGeometryOptions | undefined
    tileRepeatPointAt: (clientX: number, clientY: number) => import('@/core/canvas-input').CanvasPoint | null
    resolveStraightLine: (from: import('@/core/canvas-input').CanvasPoint, to: import('@/core/canvas-input').CanvasPoint, constrained: boolean) => { from: import('@/core/canvas-input').CanvasPoint; to: import('@/core/canvas-input').CanvasPoint; }
    modifierActive: (event: Pick<KeyboardEvent, "altKey" | "ctrlKey" | "metaKey" | "shiftKey">, id: "addAnimationFrame" | "addBlankAnimationFrame" | "addForegroundToPalette" | "addFreeTileSource" | "addLinkedAnimationFrame" | "addToSelection" | "adjustmentBrightnessContrast" | "adjustmentColorBalance" | "adjustmentCurves" | "adjustmentHueSaturation" | "advancedMode" | "animationPlaybackAll" | "animationPlaybackOnce" | "animationPlaybackSpeed025" | "animationPlaybackSpeed050" | "animationPlaybackSpeed100" | "animationPlaybackSpeed150" | "animationPlaybackSpeed200" | "animationPlaybackSpeed300" | "animationPlaybackTag" | "brushLibraryParentFolder" | "brushShapeLine" | "brushShapeRound" | "brushShapeSquare" | "brushSizeAdjust" | "brushSizeDecrease" | "brushSizeIncrease" | "brushSizeWheelAdjust" | "brushSwatchLarge" | "brushSwatchMedium" | "brushSwatchSmall" | "canvasResize" | "clearLayerStyles" | "closeDocument" | "connectAnimationCels" | "connectAnimationMasks" | "constrainAxis" | "constrainLineDirections" | "convertColorMode" | "convertColorModeGrayscale" | "convertColorModeIndexed" | "convertColorModeRgba" | "convertLayerToBackground" | "convertLayerToRaster" | "convertLayerToTilemap" | "copy" | "copyAnimationCel" | "copyAnimationFrames" | "copyAnimationMasks" | "copyLayerOnDrag" | "copyLayerStyles" | "copySelectionContent" | "createAnimationLoopSection" | "createBrushFolder" | "createBrushFromSelection" | "createLayerGroup" | "createLinkedLayer" | "createPaletteGradient" | "createPaletteHueGradient" | "cropCanvas" | "cut" | "deleteAnimationFrame" | "deleteAnimationLoopSection" | "deleteBrushSelection" | "deleteFreeTileInstances" | "deleteLayer" | "deleteSelection" | "deleteTilesetSelection" | "deselect" | "disableAnimationFrames" | "disconnectAnimationCels" | "disconnectAnimationMasks" | "duplicateLayer" | "enableAnimationFrames" | "exportAllFrames" | "exportDocument" | "exportSpriteSheet" | "extractPaletteColors" | "fillForeground" | "flipHorizontal" | "flipVertical" | "freeTileModeEdit" | "freeTileModePaint" | "imageResize" | "importBrushImage" | "integerSelectionScale" | "invertSelection" | "lasso" | "lasso.quick" | "lineConnectionMode" | "magic" | "magic.quick" | "mergeLayerDown" | "mergeLayerGroup" | "mergeSelectedLayers" | "mergeVisibleLayers" | "mirrorFreeTileInstanceHorizontal" | "mirrorFreeTileInstanceVertical" | "mirrorView" | "mirrorViewVertical" | "newBackgroundLayer" | "newDocument" | "newFreeTileLayer" | "newLayer" | "newTilemapLayer" | "nextAnimationFrame" | "openAbout" | "openAnimationCelProperties" | "openAnimationFrameProperties" | "openAnimationLoopSectionProperties" | "openAutoSlice" | "openBrushFolder" | "openComponentLibrary" | "openDocument" | "openFreeTileInstanceProperties" | "openFreeTileSourceProperties" | "openGridSettings" | "openHome" | "openIsoViewSettings" | "openLatestRelease" | "openLayerProperties" | "openLayerSettings" | "openLayerStyles" | "openPaletteFolder" | "openPreferences" | "openProjectFolder" | "openProjectInfo" | "openScriptFolder" | "openShortcutSettings" | "openSliceProperties" | "openTimelapse" | "openWorkspaceManager" | "outline" | "outlineSelectionInside" | "paletteSortAscending" | "paletteSortDescending" | "paletteSwatchHuge" | "paletteSwatchLarge" | "paletteSwatchMedium" | "paletteSwatchSmall" | "paletteSwatchTiny" | "paste" | "pasteAnimationCels" | "pasteAnimationFrames" | "pasteAnimationMasks" | "pasteAsNewDocument" | "pasteAsNewLayer" | "pasteLayerStyles" | "playAnimationLoopSection" | "polygonLasso" | "polygonLasso.quick" | "popupBrushLibraryPanel" | "popupColorPanel" | "popupLayersPanel" | "popupPalettePanel" | "popupPreviewPanel" | "popupTilesetPanel" | "previousAnimationFrame" | "proportionalSelectionTransform" | "quickOutline" | "redo" | "refreshBrushLibrary" | "refreshPalettes" | "relativeLuminance" | "replaceColor" | "resetSymmetryCenter" | "resetView" | "resetViewRotation" | "resetWorkspaceLayout" | "reversePaletteColors" | "rotateFreeTileInstance90" | "rotateViewClockwise90" | "rotateViewCounterClockwise90" | "save" | "saveAs" | "savePalette" | "saveWorkspaceLayout" | "selectAll" | "selectAllSlices" | "selectionModeAdd" | "selectionModeIntersect" | "selectionModeReplace" | "selectionModeSubtract" | "showOnlyFreeTileInstance" | "snapSelectionRotation" | "snapViewRotation" | "sortPaletteAlpha" | "sortPaletteBlue" | "sortPaletteBrightness" | "sortPaletteGreen" | "sortPaletteHue" | "sortPaletteLuminance" | "sortPaletteRed" | "sortPaletteSaturation" | "swapForegroundBackground" | "tileRepeatBoth" | "tileRepeatOff" | "tileRepeatX" | "tileRepeatY" | "tilemapModeCreate" | "tilemapModeEdit" | "tilemapModeHybrid" | "tilemapModePaint" | "toggleAnimationFramesDisabled" | "toggleAnimationMask" | "toggleAnimationPlayback" | "toggleAnimationReturnToStart" | "toggleBrushLibraryPanel" | "toggleClippingMask" | "toggleColorPanel" | "toggleContiguous" | "toggleCustomGrid" | "toggleFixedRatio" | "toggleGrid" | "toggleGroupMask" | "toggleIsoView" | "toggleLayerMask" | "toggleLayerStyles" | "toggleLayersPanel" | "toggleMoveAutoSelect" | "toggleOnionSkin" | "togglePaletteColorSync" | "togglePaletteEditLock" | "togglePalettePanel" | "togglePerfectPixels" | "togglePreviewPanel" | "toggleRoundedCorners" | "toggleSelectedGroupCollapsed" | "toggleSelectedLayerLock" | "toggleSelectedLayerVisibility" | "toggleSelectionOutline" | "toggleSliceOutlines" | "toggleSmartClosure" | "toggleSymmetryDiagonalDown" | "toggleSymmetryDiagonalUp" | "toggleSymmetryHorizontal" | "toggleSymmetryRotational" | "toggleSymmetryVertical" | "toggleTilesetPanel" | "toggleTimeline" | "tool.airbrush" | "tool.airbrush.quick" | "tool.curve" | "tool.curve.quick" | "tool.eraser" | "tool.eraser.quick" | "tool.eyedropper" | "tool.eyedropper.quick" | "tool.fill" | "tool.fill.gradient" | "tool.fill.gradient.quick" | "tool.fill.quick" | "tool.hand" | "tool.hand.quick" | "tool.line" | "tool.line.quick" | "tool.liquify" | "tool.liquify.quick" | "tool.move" | "tool.move.quick" | "tool.pencil" | "tool.pencil.quick" | "tool.rotate" | "tool.rotate.quick" | "tool.selection" | "tool.selection.ellipse" | "tool.selection.ellipse.quick" | "tool.selection.quick" | "tool.shape" | "tool.shape.ellipse" | "tool.shape.ellipse.quick" | "tool.shape.ellipseOutline" | "tool.shape.ellipseOutline.quick" | "tool.shape.freeform" | "tool.shape.freeform.quick" | "tool.shape.polygon" | "tool.shape.polygon.quick" | "tool.shape.quick" | "tool.shape.rectangle" | "tool.shape.rectangle.quick" | "tool.shape.rectangleOutline" | "tool.shape.rectangleOutline.quick" | "tool.slice" | "tool.slice.quick" | "tool.smooth" | "tool.smooth.quick" | "tool.text" | "tool.text.quick" | "tool.zoom" | "tool.zoom.quick" | "toolRailBottom" | "toolRailLeft" | "toolRailRight" | "toolRailTop" | "transform" | "trimCanvas" | "undo" | "ungroupLayers" | "viewZoom100" | "viewZoom200" | "viewZoom3200" | "viewZoom400" | "viewZoom800") => boolean
    tilemapEditSelectionAtPoint: (point: import('@/core/canvas-input').CanvasPoint, current?: import('@/store/workspace-types').DocumentSession, armOutsideTiles?: boolean) => import('@shared/types-selection').SelectionMask | null | undefined
    quickSelectCell: (event: React.MouseEvent<HTMLCanvasElement, MouseEvent>) => void
    repeatedDocumentPointsAt: (clientX: number, clientY: number, continuous?: boolean, allowOutsideCopies?: boolean) => { local: import('@/core/canvas-input').CanvasPoint; repeated: import('@/core/canvas-input').CanvasPoint; offset: { x: number; y: number; }; } | null
    selectionHit: (event: React.PointerEvent<HTMLCanvasElement>) => import('@/core/canvas-input').SelectionHit
    selectionHitAt: (clientX: number, clientY: number) => import('@/core/canvas-input').SelectionHit
    sliceHandleAt: (clientX: number, clientY: number, slice: import('@shared/types-selection').SelectionRect) => import('@/core/canvas-input').SelectionHandle | null
    tilemapEditCreatesFirstTile: (current?: import('@/store/workspace-types').DocumentSession) => boolean
    tilemapCellAllowedBySelection: (target: import('@/core/tilemap-document').TilemapCelTarget, index: number, selection: import('@shared/types-selection').SelectionMask | null) => boolean
    brushPreviewOverlaySupported: (currentSession: import('@/store/workspace-types').DocumentSession) => boolean
    snapBrushPointToGrid: (point: import('@/core/canvas-input').CanvasPoint, size: number, imageBrush?: import('@shared/types-brush').ImageBrush | null | undefined, angle?: number, currentSession?: import('@/store/workspace-types').DocumentSession) => import('@/core/canvas-input').CanvasPoint
    applyViewRotation: (context: CanvasRenderingContext2D, width: number, height: number, view: import('@shared/types-view').ViewState) => void
    drawSelectionOverlay: () => void
    cloneSelectionQuad: (quad: import('@shared/types-selection').SelectionQuad | null | undefined) => import('@shared/types-selection').SelectionQuad | null
    scheduleDraw: () => void
  }
  readSession: () => DocumentSession
}

/** Paints a frame from explicit resources, settings and geometry.
 * The renderer never subscribes to or retrieves the global workspace. */
export function renderCanvasFrame(frame: CanvasRenderContext): void {
  const { canvasRef, inputRef, wheelBrushSizePreviewRef, canvasResizePreviewRef, liveViewRef, zoomPreviewStartRef, rotationSceneRef, checkerboardTileRef, isoGuideTileRef, onionSkinCacheRef, compositeCacheRef, textToolPreviewRef, moveLayerClickFlashRef, clickFlashCacheRef, freeTileInstanceFlashRef, compositePointSamplerRef, compositeReplacementSamplerRef, polygonPathPreviewRenderCacheRef, outlinePreviewCacheRef, gradientPreviewDiagnosticsRef, gradientCompositePreviewCacheRef, gradientPreviewSurfaceRef, gradientPreviewCoverageCacheRef, gradientPreviewInputAtRef, lineAnchorHistoryRef, publishedTilesetPreviewRef, brushPreviewStackCacheRef, brushPreviewCompositeCacheRef, moveLayerContentPreviewRef, autoSlicePreviewRef, publishedSelectionSizePreviewRef, brushPreviewDrawRef, publishedCanvasPreviewRef, moveLayerClickFlashTimerRef } = frame.resources
  const { session, interfaceScale, rotationIndicatorPosition, activeTheme, checkerboard, isoViewPreferences, timelineHidden, onionSkin, moveLayerClickFlashEnabled, gridColors, selectionPreviewColorMode, selectionPreviewColor, activeBrushImage, activeBrushPreviewMode, activeBrushTexture, proceduralAntialiasStrength, activeBrushDither, optimizedRotationEnabled, symmetryCenter, balancedStraightLines, shapeCornerRadius, balancedShiftLineEnabled, gradientStops, gradientDither, gradientType, gradientLineVisible, gradientLineColor, shiftLinePreviewEnabled, lineConnectionConfigured, lineAnchor, symmetryAxisPreferences, canvasResizeColor, lassoPreviewClosed, sliceTool, fillKind, brushPreviewMode, drawingBrushPreviewEnabled, gridSnapActive, moveLayerContentPreviewEnabled, sliceOutlinesVisible, sliceColor, t, activeDocumentId } = frame.settings
  const { sharedCanvasSession, sessionWithActiveQuickTool, temporaryMoveActive, stageSize, stageDisplaySize, brushPatternOrigin, paintSelectionForDrag, curveDefaultControls, gradientGeometryOptionsForDrag, tileRepeatPointAt, resolveStraightLine, modifierActive, tilemapEditSelectionAtPoint, quickSelectCell, repeatedDocumentPointsAt, selectionHit, selectionHitAt, sliceHandleAt, tilemapEditCreatesFirstTile, tilemapCellAllowedBySelection, brushPreviewOverlaySupported, snapBrushPointToGrid, applyViewRotation, drawSelectionOverlay, cloneSelectionQuad, scheduleDraw } = frame.geometry

    const performanceProbe = window.__moonSpriteCanvasProbe
    const drawStartedAt = performance.now()
    let paintedMoveLayerFlash: MoveLayerClickFlash | null = null
    const canvas = canvasRef.current
    if (!canvas) return
    // Ctrl+Alt is the brush-size modifier, while Ctrl alone is the temporary
    // move tool. Keep the real paint session during the modifier preview so
    // the quick-move target cannot suppress the brush preview.
    const brushSizeAdjustmentActive = Boolean(inputRef.current.modifierBrushSize)
    const baseSession = frame.readSession()
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
    const canRenderToolPreview = !currentSession.animationPlaying
      && !temporaryMoveSuppressesToolPreview(temporaryMovePreviewActive, brushSizeAdjustmentPreviewActive)
      && !canvasResizePreviewRef.current
      && (currentSession.tool === 'selection'
        ? currentSelectionLayersEditable
        : currentHasRasterSelection && isLayerEffectivelyVisible(currentSession.document, currentActiveLayer) && !isLayerEffectivelyLocked(currentSession.document, currentActiveLayer))
    const rect = stageSize()
    const displaySize = stageDisplaySize()
    const dpr = canvasBackingRatioForInterfaceScale(window.devicePixelRatio || 1, interfaceScale)
    const previousBackingWidth = canvas.width, previousBackingHeight = canvas.height
    const backingStarted = isWorkspaceResizing() ? performance.now() : 0
    const deviceScale = syncCanvasDisplaySize(canvas, rect.width, rect.height, dpr, displaySize.width, displaySize.height, isWorkspaceResizing())
    if (backingStarted) {
      recordWorkspaceResizeStage('backing', performance.now() - backingStarted)
      if (canvas.width !== previousBackingWidth || canvas.height !== previousBackingHeight) recordWorkspaceResizeStage('allocation', performance.now() - backingStarted)
    }
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
    // View gestures (zoom, pan, and rotate) redraw the cached bitmap every
    // frame. Keep the interactive path cheap and atomic: the cache skips its
    // per-pixel alignment blit while this flag is set, and rotated scenes use
    // a low-cost sampling kernel. The exact aligned frame is rendered once
    // after the gesture commits.
    const viewPreviewActive = isWorkspaceResizing() || activeDrag?.kind === 'pan'
      || activeDrag?.kind === 'zoom-drag'
      || activeDrag?.kind === 'rotate-view'
      || zoomPreviewStartRef.current !== null
    const pixelSamplingQuality: ImageSmoothingQuality = viewPreviewActive ? 'low' : 'high'
    const onionSkinInvalidation = currentSession.selectedAnimationFrameIds.length > 1 && currentSession.contentInvalidation
      ? { ...currentSession.contentInvalidation, frameId: undefined }
      : currentSession.contentInvalidation
    const renderPlan = createCanvasRenderPlan(rect.width, rect.height, document, view, rotationIndicatorPosition)
    const { rotated, viewport, sceneLeft, sceneTop, sceneWidth, sceneHeight, originX, originY, canvasWidth, canvasHeight, fromX, fromY, toX, toY } = renderPlan
    let context: RasterContext2D = displayContext
    if (rotated) {
      let scene = rotationSceneRef.current
      const sceneBackingWidth = canvasBackingCapacity(Math.max(1, Math.ceil(sceneWidth * deviceScale.x)), scene?.width ?? 0, isWorkspaceResizing())
      const sceneBackingHeight = canvasBackingCapacity(Math.max(1, Math.ceil(sceneHeight * deviceScale.y)), scene?.height ?? 0, isWorkspaceResizing())
      if (!scene || scene.width !== sceneBackingWidth || scene.height !== sceneBackingHeight) {
        scene = new OffscreenCanvas(sceneBackingWidth, sceneBackingHeight)
        rotationSceneRef.current = scene
      }
      const sceneContext = scene.getContext('2d')
      if (!sceneContext) return
      sceneContext.setTransform(deviceScale.x, 0, 0, deviceScale.y, -sceneLeft * deviceScale.x, -sceneTop * deviceScale.y)
      clearCanvasBacking(sceneContext, scene)
      // Keep rounded physical edges opaque so rotated interpolation cannot
      // blend transparent pixels into diagonal seams during zoom previews.
      sceneContext.save()
      sceneContext.setTransform(1, 0, 0, 1, 0, 0)
      sceneContext.fillStyle = activeTheme.definition.seeds.canvasSurround
      sceneContext.fillRect(0, 0, scene.width, scene.height)
      sceneContext.restore()
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
          const loopSection = animationLoopSectionAtFrame(timeline, timeline.activeFrameId)
          const refs = onionSkinFrameRefs(timeline, onionSkin.previousFrames, onionSkin.nextFrames, loopSection)
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
      const compositeStarted = isWorkspaceResizing() ? performance.now() : 0
      measureRuntimeDiagnostic('canvas.composite', () => compositeCacheRef.current.draw({
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
        imageSmoothingQuality: pixelSamplingQuality,
        fastViewPreview: viewPreviewActive,
        liveRasterEdit: activeDrag?.kind === 'draw' || activeDrag?.kind === 'airbrush' || activeDrag?.kind === 'liquify' || activeDrag?.kind === 'smooth',
        animationPlayback: currentSession.animationPlaying,
        devicePixelRatio: deviceScale,
        movingLayerIds: layerMovePreviewActive(activeDrag) && !activeDrag.duplicatedLayer
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
              copy: Boolean(activeDrag.copy),
              optimizedRotation: currentSession.selectionRotationAlgorithm === 'rotsprite'
            }
          : selectionPreviewOwner === 'pending' && currentSession.pendingPaste
            ? {
                layerId: currentSession.pendingPaste.layerId,
                source: currentSession.pendingPaste.source,
                target: currentSession.pendingPaste.transformTarget ?? currentSession.pendingPaste.target,
                angle: currentSession.pendingPaste.transformAngle ?? 0,
                shear: currentSession.pendingPaste.transformShear,
                quad: currentSession.pendingPaste.transformQuad,
                copy: currentSession.pendingPaste.copy,
                optimizedRotation: currentSession.selectionRotationAlgorithm === 'rotsprite'
              }
            : undefined
      }), () => ({ ...documentDiagnosticDetail(document), tool: currentSession.tool, gesture: activeDrag?.kind ?? 'none' }))
      if (compositeStarted) recordWorkspaceResizeStage('composite', performance.now() - compositeStarted)
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
      if (moveLayerFlash && moveLayerFlash.expiresAt !== null && performance.now() >= moveLayerFlash.expiresAt) {
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
            context.save()
            clipCanvasCopy(context, copy)
            context.globalCompositeOperation = 'source-over'
            context.imageSmoothingEnabled = false
            const layerOffsetX = layer.offsetX, layerOffsetY = layer.offsetY
            const frameId = document.animation?.activeFrameId
            const ready = clickFlashCacheRef.current.draw(context, {
              contentKey: `${document.id}:${currentSession.contentRevision}:${frameId}:${layer.id}:${layerOffsetX}:${layerOffsetY}`,
              region: { x: visibleX, y: visibleY, width: visibleWidth, height: visibleHeight },
              originX: copy.originX, originY: copy.originY, zoom: view.zoom, deviceScale,
              layer, palette: document.palette
            })
            if (ready) paintedMoveLayerFlash = moveLayerFlash
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
      const inkMode = currentSession.tool === 'pencil' || currentSession.tool === 'eraser' || currentSession.tool === 'line'
        ? currentSession.inkMode
        : 'simple'
      const stampedColor = resolveInkStampColor(inkMode, paintColor, coverage)
      const replacement = erase
        ? coverage === 255 ? TRANSPARENT : { ...layerColor, a: Math.round(layerColor.a * (1 - coverage / 255)) }
        : inkMode !== 'simple'
          ? applyInkColor(inkMode, layerColor, stampedColor) ?? layerColor
          : overwrite
            ? stampedColor
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
    /**
     * Fill a brush preview as a small set of paths instead of one canvas
     * operation per document pixel. Independent transformed fillRects can
     * expose a one-device-pixel seam between rows at fractional DPR/zoom;
     * sharing a path lets the rasterizer resolve touching edges as one region.
     */
    const fillPreviewPixelRects = (entries: ReadonlyArray<{ pixelRect: { x: number; y: number; width: number; height: number }; sampleX: number; sampleY: number; color: RgbaColor }>): void => {
      if (entries.length === 0) return
      if (typeof Path2D === 'undefined') {
        for (const entry of entries) fillPreviewPixelRect(entry.pixelRect, entry.sampleX, entry.sampleY, entry.color)
        return
      }
      const backgrounds = new Map<string, Path2D>()
      const foregrounds = new Map<string, Path2D>()
      const addRect = (paths: Map<string, Path2D>, key: string, pixelRect: { x: number; y: number; width: number; height: number }): void => {
        let path = paths.get(key)
        if (!path) {
          path = new Path2D()
          paths.set(key, path)
        }
        path.rect(pixelRect.x, pixelRect.y, pixelRect.width, pixelRect.height)
      }
      for (const entry of entries) {
        const transparency = transparencyColorAt(entry.sampleX, entry.sampleY, checkerboard)
        addRect(backgrounds, `rgb(${transparency.r} ${transparency.g} ${transparency.b})`, entry.pixelRect)
        const displayColor = view.relativeLuminance ? relativeLuminanceColor(entry.color) : entry.color
        if (displayColor.a > 0) {
          addRect(foregrounds, `rgb(${displayColor.r} ${displayColor.g} ${displayColor.b} / ${displayColor.a / 255})`, entry.pixelRect)
        }
      }
      for (const [fillStyle, path] of backgrounds) {
        context.fillStyle = fillStyle
        context.fill(path)
      }
      for (const [fillStyle, path] of foregrounds) {
        context.fillStyle = fillStyle
        context.fill(path)
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
    // All selection-creation previews (marquee, lasso, polygon and magic
    // wand) use the same contrast rule. Keep the automatic colors strictly
    // black/white so a preview never inherits theme colors or changes hue.
    const selectionPreviewColorForBackground = (background: RgbaColor): string =>
      customSelectionPreviewColor
        ?? (colorLuminance(background) > 145 ? '#000000' : '#ffffff')
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
            context.fillStyle = previewColor ?? selectionPreviewColorForBackground(background)
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
            const color = previewColor ?? selectionPreviewColorForBackground(background)
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
      previewColor ?? customSelectionPreviewColor ?? 'auto',
      checkerboard.size,
      polygonPreviewColorKey(checkerboard.lightColor),
      polygonPreviewColorKey(checkerboard.darkColor),
      selectionPreviewColorMode
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
            return selectionPreviewColorForBackground(background)
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
    const drawBrushPathPreview = (points: readonly Point[], color: RgbaColor, erase = false, baseline?: ReadonlyMap<number, number>, selection: SelectionMask | null = session.selection): void => {
      if (points.length === 0) return
      const previewAngle = (points.at(-1) as Point & { angle?: number }).angle ?? brushBaseAngle(session)
      const { x: beforeX, y: beforeY } = brushStampAnchor(session.brushSize, activeBrushImage, previewAngle, session.brushShape)
      const patternOrigin = brushPatternOrigin(points[0])
      const drawn = new Set<number>()
      const overwriteImageBrushPixels = !erase && activeBrushImage?.intrinsicSize === true && activeBrushPreviewMode === 'paint'
      const tilemapTarget = currentActiveLayer.kind === 'tilemap' && (currentSession.tilemapMode === 'edit' || currentSession.tilemapMode === 'hybrid') ? activeTilemapCelTarget(document) : null
      const tilemapTileset = tilemapTarget?.layer.tilemapTilesetId
        ? document.tilesets?.find((tileset) => tileset.id === tilemapTarget.layer.tilemapTilesetId)
        : null
      const originalTilePixels = new Map<string, Uint8ClampedArray>()
      const previewTilePixels = new Map<string, Uint8ClampedArray>()
      const previewFillRects: Array<{ pixelRect: { x: number; y: number; width: number; height: number }; sampleX: number; sampleY: number; color: RgbaColor }> = []
      const queuePreviewPixel = (pixelX: number, pixelY: number, color: RgbaColor): void => {
        for (const { point, copy } of previewPixelPlacements(pixelX, pixelY)) {
          previewFillRects.push({
            pixelRect: deviceAlignedPixelRect(copy.originX, copy.originY, view.zoom, point.x, point.y, deviceScale),
            sampleX: point.x,
            sampleY: point.y,
            color
          })
        }
      }
      const centers = brushPathStampPoints(points, session.brushSize, activeBrushImage, previewAngle, session.brushShape)
      if (overwriteImageBrushPixels) centers.reverse()
      for (const center of centers) {
        const x = center.x
        const y = center.y
        const mask = brushMaskOffsets(session.brushSize, session.brushShape, activeBrushTexture, session.brushTextureScale, x - beforeX, y - beforeY, activeBrushImage, session.brushImageSettings, proceduralAntialiasStrength, activeBrushPreviewMode, patternOrigin.x, patternOrigin.y, activeBrushDither, previewAngle, optimizedRotationEnabled)
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
                queuePreviewPixel(pixelX, pixelY, previewColorAt(pixelX, pixelY, erase, offset.coverage, offset.color ?? color, baseColor, overwriteImageBrushPixels))
                continue
              }
              const cellIndex = tilemapCellIndexAtPoint(tilemapTarget.tilemap, tilemapTarget.surface.offsetX, tilemapTarget.surface.offsetY, pixelX, pixelY)
              const cell = cellIndex === null ? null : tilemapTarget.tilemap.cells[cellIndex]
              if (!cell || cell.tilesetId !== tilemapTileset.id) {
                if (currentSession.tilemapMode === 'hybrid') queuePreviewPixel(pixelX, pixelY, previewColorAt(pixelX, pixelY, erase, offset.coverage, offset.color ?? color, baseColor, overwriteImageBrushPixels))
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
            } else queuePreviewPixel(pixelX, pixelY, previewColorAt(pixelX, pixelY, erase, offset.coverage, offset.color ?? color, baseColor, overwriteImageBrushPixels))
          }
        }
      }
      if (previewTilePixels.size > 0) {
        drawTilemapEditPreviewTiles(previewTilePixels)
        queueTilesetTilePreview(tilemapTileset?.id, previewTilePixels)
      }
      fillPreviewPixelRects(previewFillRects)
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
    const drawStrokePreview = (from: Point, to: Point, erase = false, baseline?: ReadonlyMap<number, number>, selection: SelectionMask | null = null): void => {
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
          const gradientDiagnostic = gradientPreviewDiagnosticsRef.current
          const gradientPreviewStartedAt = gradientDiagnostic ? performance.now() : 0
          const activeIndex = document.layers.indexOf(activeLayer)
          const canUseStaticComposite = !isolatedLayerMask
            && activeIndex >= 0
            && !activeLayer.background
            && activeLayer.visible
            && activeLayer.opacity === 1
            && activeLayer.blendMode === 'normal'
            && activeLayer.clippingMask !== true
            && !activeLayer.layerStyles
          let staticComposite = gradientCompositePreviewCacheRef.current
          const opaqueReplacement = document.colorMode === 'rgba' && activeLayer.format === 'rgba'
            && startColor.a === 255 && endColor.a === 255 && (activeGradientStops?.every((stop) => stop.color.a === 255) ?? true)
          if (canUseStaticComposite) {
            const staticKey = `${document.id}:${currentSession.revision}:${activeLayer.id}:${document.width}x${document.height}:${previewFromX},${previewFromY},${previewToX},${previewToY}:${opaqueReplacement}`
            if (!staticComposite || staticComposite.key !== staticKey) {
              staticComposite = {
                key: staticKey,
                ...createGradientCompositePreview(document, activeIndex, {
                  x: previewFromX, y: previewFromY, width: previewToX - previewFromX, height: previewToY - previewFromY
                }, opaqueReplacement)
              }
              gradientCompositePreviewCacheRef.current = staticComposite
            }
          } else {
            staticComposite = null
            gradientCompositePreviewCacheRef.current = null
          }
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
          const useLinearDitherAverages = gradientType === 'linear' && gradientDither !== 'none' && !selection?.mask && !paintRegion?.mask
          const useDocumentDitherSurface = view.zoom < 1 && gradientDither !== 'none' && !useLinearDitherAverages
          const sourceBasisWidth = useDocumentDitherSurface ? visibleDocumentWidth : nativeSourceWidth
          const sourceBasisHeight = useDocumentDitherSurface ? visibleDocumentHeight : nativeSourceHeight
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
            const gradientPrepareEndedAt = gradientDiagnostic ? performance.now() : 0
            const pixels = surface.pixels
            pixels.fill(0)
            const pixelWords = new Uint32Array(pixels.buffer, pixels.byteOffset, pixels.byteLength / 4)
            const writeSample = (sampleX: number, sampleY: number, alpha: number, left: number, top: number, right: number, bottom: number, sampledGradientColor?: RgbaColor): void => {
              if (alpha <= 0 || right <= left || bottom <= top) return
              const gradientColor = sampledGradientColor ?? sampleGradient(sampleX, sampleY)
              const replacement = gradientColor.a === 255 ? gradientColor
                : gradientReplacementColor(readLayerColorAt(document, activeLayer, sampleX, sampleY), gradientColor)
              const resolvedReplacement = resolveLayerCanvasColor(document, activeLayer, replacement)
              const previewColor = staticComposite
                ? compositeGradientPreviewAt(staticComposite, sampleX, sampleY, resolvedReplacement)
                : isolatedLayerMask ? layerMaskDisplayColor(resolvedReplacement) : sampleCompositeReplacement(sampleX, sampleY, resolvedReplacement)
              const displayColor = view.relativeLuminance ? relativeLuminanceColor(previewColor) : previewColor
              const transparency = transparencyColorAt(sampleX, sampleY, checkerboard)
              const composited = displayColor.a === 255 ? displayColor : displayColor.a > 0
                ? blendOver({ r: transparency.r, g: transparency.g, b: transparency.b, a: 255 }, displayColor)
                : transparency
              fillGradientPreviewBlock(pixelWords, sourceWidth, left, top, right, bottom, { ...composited, a: alpha })
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
                fromX: useLinearDitherAverages ? Math.max(previewFromX, documentLeft) : blockFromX,
                fromY: useLinearDitherAverages ? Math.max(previewFromY, documentTop) : blockFromY,
                toX: useLinearDitherAverages ? Math.min(previewToX, documentRight) : blockToX,
                toY: useLinearDitherAverages ? Math.min(previewToY, documentBottom) : blockToY,
                centerX: Math.min(blockToX - 1, blockFromX + Math.floor((blockToX - blockFromX) / 2)),
                centerY: Math.min(blockToY - 1, blockFromY + Math.floor((blockToY - blockFromY) / 2))
              }
            }
            const averageLinearDither = useLinearDitherAverages
              ? createLinearDitherPreviewSampler(startColor, endColor, drag.start, drag.last, gradientDither, previewFromX, previewToX, activeGradientStops)
              : null
            const averagedDitherColor = (block: NonNullable<ReturnType<typeof previewDocumentBlockAt>>, allowed?: (x: number, y: number) => boolean): RgbaColor | undefined => {
              if (gradientDither === 'none') return undefined
              if (averageLinearDither && !allowed) return averageLinearDither(block)
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
              if (averageLinearDither && opaqueReplacement && staticComposite && !view.relativeLuminance) {
                // Axis bounds do not depend on the other axis. Compute them
                // once per row/column, rather than allocating a block and
                // converting coordinates for every display pixel.
                const columns = Array.from({ length: sourceWidth }, (_, x) => previewDocumentBlockAt(x, 0))
                const block = { fromX: 0, fromY: 0, toX: 0, toY: 0 }
                for (let deviceY = 0; deviceY < sourceHeight; deviceY++) {
                  const row = previewDocumentBlockAt(0, deviceY)
                  if (!row) continue
                  if (!staticComposite.upper) {
                    averageLinearDither.writeRow(row.fromY, row.toY, columns, pixelWords, deviceY * sourceWidth)
                    continue
                  }
                  block.fromY = row.fromY; block.toY = row.toY
                  for (let deviceX = 0; deviceX < sourceWidth; deviceX++) {
                    const column = columns[deviceX]
                    if (!column) continue
                    block.fromX = column.fromX; block.toX = column.toX
                    const gradientColor = averageLinearDither(block)
                    const color = staticComposite.upper
                      ? compositeGradientPreviewAt(staticComposite, column.centerX, row.centerY, gradientColor)
                      : gradientColor
                    pixelWords[deviceY * sourceWidth + deviceX] = (255 << 24) | (color.b << 16) | (color.g << 8) | color.r
                  }
                }
              } else if (!selectionMask && !paintMask) {
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
            const gradientRasterEndedAt = gradientDiagnostic ? performance.now() : 0
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
            if (gradientDiagnostic && gradientPreviewInputAtRef.current > 0) {
              const endedAt = performance.now()
              const path = view.zoom >= 1 ? 'document-pixels' : useLinearDitherAverages ? 'linear-periodic' : gradientDither === 'none' ? 'smooth' : 'sampled-dither'
              const composite = opaqueReplacement && staticComposite && !view.relativeLuminance && useLinearDitherAverages && view.zoom < 1 ? 'direct-opaque'
                : staticComposite ? 'static-stack' : 'per-pixel-stack'
              gradientDiagnostic.record(`${path}:${composite}:${gradientDither}:${document.width}:${document.height}:${view.zoom}`, {
                path, composite, dither: gradientDither, type: gradientType, zoom: view.zoom,
                width: document.width, height: document.height, stops: activeGradientStops?.length ?? 2,
                selectionMask: Boolean(selection?.mask), paintMask: Boolean(paintRegion?.mask),
                sourcePixels: sourceWidth * sourceHeight, visiblePixels: visibleDocumentWidth * visibleDocumentHeight,
                layers: document.layers.length, backgroundLayer: Boolean(activeLayer.background), worker: false
              }, {
                prepare: gradientPrepareEndedAt - gradientPreviewStartedAt,
                raster: gradientRasterEndedAt - gradientPrepareEndedAt,
                upload: endedAt - gradientRasterEndedAt, total: endedAt - gradientPreviewStartedAt,
                inputLag: gradientPreviewInputAtRef.current ? endedAt - gradientPreviewInputAtRef.current : 0
              })
              gradientPreviewInputAtRef.current = 0
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
          if (gradientType === 'radial') {
            const geometry = resolveRadialGradientGeometry(drag.start, drag.last, gradientGeometryOptionsForDrag(drag))
            const centerX = copy.originX + (geometry.center.x + 0.5) * view.zoom
            const centerY = copy.originY + (geometry.center.y + 0.5) * view.zoom
            context.save()
            context.translate(centerX, centerY)
            context.rotate((geometry.angle ?? 0) * Math.PI / 180)
            context.ellipse(0, 0, Math.max(0.5, geometry.radiusX * view.zoom), Math.max(0.5, geometry.radiusY * view.zoom), 0, 0, Math.PI * 2)
            context.restore()
          } else {
            context.moveTo(startX, startY)
            context.lineTo(endX, endY)
          }
          context.stroke()
          if (gradientType === 'radial') {
            const geometry = resolveRadialGradientGeometry(drag.start, drag.last, gradientGeometryOptionsForDrag(drag))
            const centerX = copy.originX + (geometry.center.x + 0.5) * view.zoom
            const centerY = copy.originY + (geometry.center.y + 0.5) * view.zoom
            context.fillRect(centerX - 2, centerY - 2, 5, 5)
          } else {
            context.fillRect(startX - 2, startY - 2, 5, 5)
            context.fillRect(endX - 2, endY - 2, 5, 5)
          }
        }
        context.restore()
      }
    }
    if ((currentActiveLayer.kind !== 'tilemap' || currentSession.tilemapMode !== 'paint') && (currentActiveLayer.kind !== 'free-tile' || currentSession.freeTileMode !== 'paint') && shiftLinePreviewEnabled && lineConnectionConfigured && canRenderToolPreview && !inputRef.current.spaceHeld && !inputRef.current.sampling && !inputRef.current.drag && (session.tool === 'pencil' || session.tool === 'eraser') && inputRef.current.shiftLinePreview && inputRef.current.pointer.visible && lineAnchor) {
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
        tilemapEditSelection
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
        context.strokeStyle = selectionPreviewColorForBackground(background)
        context.lineWidth = 1
        context.strokeRect(pixelRect.x + 0.5, pixelRect.y + 0.5, Math.max(0, pixelRect.width - 1), Math.max(0, pixelRect.height - 1))
        context.restore()
      }
    }
    const magicPreview = inputRef.current.drag
    if (magicPreview?.kind === 'magic-preview' && magicPreview.previewSelection) {
      const startedAt = performance.now()
      const previewPoint = magicPreview.last
      const sampled = sampleCompositeForPreview(previewPoint.x, previewPoint.y)
      const background = sampled.a > 0 ? sampled : transparencyColorAt(previewPoint.x, previewPoint.y, checkerboard)
      const magicPreviewColor = customSelectionPreviewColor ?? selectionPreviewColorForBackground(background)
      context.save()
      clipBaseCanvas(context)
      drawMagicWandPreview(
        context,
        magicPreview.previewSelection,
        magicPreview.magicPreviewRectangles,
        magicPreview.magicPreviewBitmap,
        previewOriginX,
        previewOriginY,
        view.zoom,
        magicPreviewColor,
        selectionPreviewColorMode !== 'custom'
      )
      context.restore()
      window.__moonSpriteCanvasProbe?.recordOperationStage?.('magic-wand.preview-render', performance.now() - startedAt)
    }

    const activeSelectionCreation = selectionDrag?.kind === 'marquee' || selectionDrag?.kind === 'lasso' || selectionDrag?.kind === 'polygon-lasso'
    const selectionCreationPointerVisible = inputRef.current.pointer.visible || activeSelectionCreation
    if ((canRenderToolPreview || activeSelectionCreation) && (!inputRef.current.drag || activeSelectionCreation) && (!inputRef.current.spaceHeld || selectionDrag?.kind === 'marquee') && !inputRef.current.sampling && selectionCreationPointerVisible && session.tool === 'selection') {
      const pointerLocation = inputRef.current.pointer.visible
        ? repeatedDocumentPointsAt(inputRef.current.pointer.clientX, inputRef.current.pointer.clientY, false, true)
        : null
      const point = pointerLocation?.local ?? (activeSelectionCreation ? selectionDrag.last : inputRef.current.pointer.point)
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
        drawSelectionCursorCorners(displayedPoint.x, displayedPoint.y, selectionPreviewColorForBackground(background))
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
        drawSelectionCursorCorners(point.x, point.y, selectionPreviewColorForBackground(background))
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
      const drawing = drag?.kind === 'tile-draw'
      const previewSelection = drawing && drag ? paintSelectionForDrag(drag) : null
      if (target && index !== null && tilemapCellAllowedBySelection(target, index, previewSelection)) {
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
      const drawing = drag?.kind === 'free-tile-draw'
      const previewSelection = drawing && drag ? paintSelectionForDrag(drag) : null
      if (target && (!previewSelection || selectionContains(previewSelection, point.x, point.y))) {
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

    if ((currentActiveLayer.kind !== 'tilemap' || currentSession.tilemapMode !== 'paint') && (currentActiveLayer.kind !== 'free-tile' || currentSession.freeTileMode !== 'paint') && brushPreviewMode !== 'none' && canRenderToolPreview && !inputRef.current.spaceHeld && inputRef.current.pointer.visible && (activeDrag?.kind === 'draw' || pointerOverCanvas) && !inputRef.current.sampling && (!drag || (drag.kind === 'draw' && drawingBrushPreviewEnabled)) && (currentSession.tool === 'pencil' || currentSession.tool === 'eraser') && !brushPreviewOverlaySupported(currentSession)) {
      const pointerLocation = repeatedDocumentPointsAt(inputRef.current.pointer.clientX, inputRef.current.pointer.clientY)
      const point = pointerLocation?.local ?? inputRef.current.pointer.point
      const drawing = drag?.kind === 'draw'
      const tilemapEditSelection = drawing ? undefined : tilemapEditSelectionAtPoint(point, currentSession)
      const previewAllowed = drawing || tilemapEditSelection !== null
      // A selection limits the actual stroke, not the idle brush cursor.
      // Keep the full brush visible until the pointer is pressed.
      const previewSelection = drawing && drag ? paintSelectionForDrag(drag) : null
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
      const previewBrushAngle = drawing ? drag?.path?.at(-1)?.angle ?? brushBaseAngle(currentSession) : brushBaseAngle(currentSession)
      const overwriteImageBrushPixels = !erasing && previewBrushImage?.intrinsicSize === true && currentBrushPreviewMode === 'paint'
      const { x: beforeX, y: beforeY } = brushStampAnchor(previewBrushSize, previewBrushImage, previewBrushAngle, currentSession.brushShape)
      const brushPoint = snapBrushPointToGrid(point, previewBrushSize, previewBrushImage, previewBrushAngle, currentSession)
      context.save()
      const texture = currentBrushTexture
      const patternOrigin = brushPatternOrigin(brushPoint, previewBrushSize, previewBrushImage)
      const drawPreviewOutline = brushPreviewMode === 'edge' || brushPreviewMode === 'full-edge' || (erasing && brushPreviewMode === 'full')
      const solidPreviewSpans = !previewBrushImage
        && texture === 'solid'
        && !currentBrushDither?.enabled
        && previewAllowed
        && !previewSelection
        && (view.tileRepeatMode ?? 'off') === 'off'
        ? solidBrushPreviewRowSpans(previewBrushSize, currentSession.brushShape, previewBrushAngle, optimizedRotationEnabled)
        : null
      // Keep the hover path independent of layer position. The preview is a
      // transient cursor overlay, so every editable raster layer receives the
      // same fast geometry treatment instead of only the topmost layer.
      const directFullPreview = Boolean(
        !drawing
        && solidPreviewSpans
        && currentSession.tool === 'pencil'
        && currentSession.inkMode === 'simple'
        && (brushPreviewMode === 'full' || brushPreviewMode === 'full-edge')
      )
      // Full-edge keeps an outline during a stroke. It uses the same exact
      // row-span geometry as the hover cursor, so drawing does not fall back
      // to the per-pixel Map/Set preview path.
      const fastSolidPreview = Boolean(solidPreviewSpans && (brushPreviewMode === 'edge' || directFullPreview || drawPreviewOutline))

      // A drawing pencil in `full` mode has no cursor overlay by design. The
      // old path still built the complete mask/maps/set every frame before
      // discovering there was nothing to draw, which was especially costly
      // for 128px brushes.
      if (drawing && !drawPreviewOutline) {
        // No drawing-time preview work is required.
      } else if (fastSolidPreview && solidPreviewSpans) {
        const sampled = erasing
          ? drawing ? transparencyColorAt(brushPoint.x, brushPoint.y, checkerboard) : sampleCompositeForPreview(brushPoint.x, brushPoint.y)
          : resolveLayerCanvasColor(document, currentActiveLayer, currentSession.primaryColor)
        const luminance = colorLuminance(sampled)
        const rowBounds = solidPreviewSpans.map((span) => ({
          y: brushPoint.y - beforeY + span.y,
          left: brushPoint.x - beforeX + span.left,
          right: brushPoint.x - beforeX + span.right
        }))

        if (directFullPreview) {
          const displayColor = resolveLayerCanvasColor(document, currentActiveLayer, currentSession.primaryColor)
          context.fillStyle = `rgb(${displayColor.r} ${displayColor.g} ${displayColor.b} / ${displayColor.a / 255})`
          context.beginPath()
          for (const row of rowBounds) {
            if (row.y < 0 || row.y >= document.height) continue
            const left = Math.max(0, row.left)
            const right = Math.min(document.width - 1, row.right)
            if (right < left) continue
            const first = previewPixelRect(left, row.y)
            const last = previewPixelRect(right, row.y)
            context.rect(first.x, first.y, last.x + last.width - first.x, first.height)
          }
          context.fill()
        }

        if (drawPreviewOutline) {
          const clippedRows = rowBounds.map((row) => row.y < 0 || row.y >= document.height
            ? null
            : { ...row, left: Math.max(0, row.left), right: Math.min(document.width - 1, row.right) })
          const horizontalSegment = (left: number, right: number, y: number, bottom: boolean): void => {
            if (right < left) return
            const first = previewPixelRect(left, y)
            const last = previewPixelRect(right, y)
            const edgeY = bottom ? first.y + first.height : first.y
            context.moveTo(first.x, edgeY)
            context.lineTo(last.x + last.width, edgeY)
          }
          const exposedHorizontal = (row: { left: number; right: number; y: number }, neighbor: { left: number; right: number; y: number } | null, bottom: boolean): void => {
            if (!neighbor || neighbor.right < neighbor.left) {
              horizontalSegment(row.left, row.right, row.y, bottom)
              return
            }
            if (neighbor.left > row.left) horizontalSegment(row.left, Math.min(row.right, neighbor.left - 1), row.y, bottom)
            if (neighbor.right < row.right) horizontalSegment(Math.max(row.left, neighbor.right + 1), row.right, row.y, bottom)
          }
          context.strokeStyle = luminance > 145 ? activeTheme.variables['--theme-selection-outline-dark'] : activeTheme.variables['--theme-selection-outline-light']
          context.lineWidth = Math.max(1, Math.min(2, view.zoom / 4))
          context.beginPath()
          for (let rowIndex = 0; rowIndex < clippedRows.length; rowIndex += 1) {
            const row = clippedRows[rowIndex]
            if (!row || row.right < row.left) continue
            const first = previewPixelRect(row.left, row.y)
            const last = previewPixelRect(row.right, row.y)
            context.moveTo(first.x, first.y)
            context.lineTo(first.x, first.y + first.height)
            context.moveTo(last.x + last.width, last.y)
            context.lineTo(last.x + last.width, last.y + last.height)
            const previous = rowIndex > 0 && clippedRows[rowIndex - 1]?.y === row.y - 1 ? clippedRows[rowIndex - 1] : null
            const next = rowIndex + 1 < clippedRows.length && clippedRows[rowIndex + 1]?.y === row.y + 1 ? clippedRows[rowIndex + 1] : null
            exposedHorizontal(row, previous, false)
            exposedHorizontal(row, next, true)
          }
          context.stroke()
        }
      } else {
        const mask = brushMaskOffsets(previewBrushSize, currentSession.brushShape, texture, currentSession.brushTextureScale, brushPoint.x - beforeX, brushPoint.y - beforeY, previewBrushImage, currentSession.brushImageSettings, currentProceduralAntialiasStrength, currentBrushPreviewMode, patternOrigin.x, patternOrigin.y, currentBrushDither, previewBrushAngle, optimizedRotationEnabled)
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
        const previewFillRects: Array<{ pixelRect: { x: number; y: number; width: number; height: number }; sampleX: number; sampleY: number; color: RgbaColor }> = []
        const sampled = erasing
          ? drawing ? transparencyColorAt(brushPoint.x, brushPoint.y, checkerboard) : sampleCompositeForPreview(brushPoint.x, brushPoint.y)
          : resolveLayerCanvasColor(document, currentActiveLayer, drawing ? drag?.color ?? currentSession.primaryColor : currentSession.primaryColor)
        const luminance = colorLuminance(sampled)
        context.strokeStyle = luminance > 145 ? activeTheme.variables['--theme-selection-outline-dark'] : activeTheme.variables['--theme-selection-outline-light']
        context.lineWidth = Math.max(1, Math.min(2, view.zoom / 4))
        context.beginPath()
        const cacheableSolidHover = !drawing
          && !previewBrushImage
          && texture === 'solid'
          && !currentBrushDither?.enabled
          && !previewSelection
          && (view.tileRepeatMode ?? 'off') === 'off'
          && currentSession.tool === 'pencil'
          && (brushPreviewMode === 'full' || brushPreviewMode === 'full-edge')
        const stackCacheAllowed = cacheableSolidHover
          && document.groups.length === 0
          && currentActiveLayer.kind !== 'tilemap'
          && currentActiveLayer.kind !== 'free-tile'
          && currentActiveLayer.opacity === 1
          && currentActiveLayer.blendMode === 'normal'
          && currentActiveLayer.clippingMask !== true
          && !currentActiveLayer.layerStyles
          && document.layers.every((layer) => layer.opacity >= 0 && layer.blendMode === 'normal' && layer.clippingMask !== true && !layer.layerStyles)
        const activeStackIndex = stackCacheAllowed ? document.layers.findIndex((layer) => layer.id === currentActiveLayer.id) : -1
        const visibleStackX = Math.max(0, Math.floor(fromX))
        const visibleStackY = Math.max(0, Math.floor(fromY))
        const visibleStackWidth = Math.max(0, Math.min(document.width, Math.ceil(toX)) - visibleStackX)
        const visibleStackHeight = Math.max(0, Math.min(document.height, Math.ceil(toY)) - visibleStackY)
        let stackCache = brushPreviewStackCacheRef.current
        if (stackCacheAllowed && activeStackIndex >= 0 && visibleStackWidth > 0 && visibleStackHeight > 0) {
          const stackSignature = `${document.id}:${currentSession.contentRevision}:${currentActiveLayer.id}:${visibleStackX}:${visibleStackY}:${visibleStackWidth}:${visibleStackHeight}`
          if (!stackCache || stackCache.signature !== stackSignature) {
            const makeSubset = (layers: typeof document.layers): typeof document => ({
              ...document,
              layers,
              activeLayerId: layers[0]?.id ?? document.activeLayerId
            })
            stackCache = {
              signature: stackSignature,
              x: visibleStackX,
              y: visibleStackY,
              width: visibleStackWidth,
              height: visibleStackHeight,
              lower: compositeRegion(makeSubset(document.layers.slice(0, activeStackIndex)), visibleStackX, visibleStackY, visibleStackWidth, visibleStackHeight),
              upper: compositeRegion(makeSubset(document.layers.slice(activeStackIndex + 1)), visibleStackX, visibleStackY, visibleStackWidth, visibleStackHeight)
            }
            brushPreviewStackCacheRef.current = stackCache
          }
        } else if (!stackCacheAllowed) {
          brushPreviewStackCacheRef.current = null
          stackCache = null
        }
        const cacheSignature = cacheableSolidHover
          ? `${document.id}:${currentSession.contentRevision}:${currentActiveLayer.id}:${currentSession.inkMode}:${currentSession.primaryColor.r},${currentSession.primaryColor.g},${currentSession.primaryColor.b},${currentSession.primaryColor.a}:${currentSession.brushShape}:${previewBrushAngle}`
          : ''
        let previewColorCache = brushPreviewCompositeCacheRef.current
        if (cacheableSolidHover && (!previewColorCache || previewColorCache.signature !== cacheSignature)) {
          previewColorCache = { signature: cacheSignature, colors: new Map() }
          brushPreviewCompositeCacheRef.current = previewColorCache
        }
        const cachedPreviewColorAt = (pixelX: number, pixelY: number): RgbaColor => {
          if (stackCache && pixelX >= stackCache.x && pixelY >= stackCache.y && pixelX < stackCache.x + stackCache.width && pixelY < stackCache.y + stackCache.height) {
            const offset = ((pixelY - stackCache.y) * stackCache.width + (pixelX - stackCache.x)) * 4
            const lower = { r: stackCache.lower[offset], g: stackCache.lower[offset + 1], b: stackCache.lower[offset + 2], a: stackCache.lower[offset + 3] }
            const upper = { r: stackCache.upper[offset], g: stackCache.upper[offset + 1], b: stackCache.upper[offset + 2], a: stackCache.upper[offset + 3] }
            const activeLayerColor = readLayerColorAt(document, currentActiveLayer, pixelX, pixelY)
            const stampedColor = resolveInkStampColor(currentSession.inkMode, currentSession.primaryColor)
            const replacement = applyInkColor(currentSession.inkMode, activeLayerColor, stampedColor) ?? activeLayerColor
            const resolvedReplacement = resolveLayerCanvasColor(document, currentActiveLayer, replacement)
            const composited = blendOver(blendOver(lower, resolvedReplacement), upper)
            if (!previewColorCache) return composited
            previewColorCache.colors.set(pixelY * document.width + pixelX, composited)
            return composited
          }
          if (!previewColorCache) return previewColorAt(pixelX, pixelY, erasing, 255, currentSession.primaryColor, undefined, overwriteImageBrushPixels)
          const key = pixelY * document.width + pixelX
          const cached = previewColorCache.colors.get(key)
          if (cached) return cached
          const color = previewColorAt(pixelX, pixelY, erasing, 255, currentSession.primaryColor, undefined, overwriteImageBrushPixels)
          previewColorCache.colors.set(key, color)
          return color
        }
        for (const previewPoint of renderedPreviewPoints.values()) {
          if (!previewAllowed || (previewSelection && !selectionContains(previewSelection, previewPoint.sampleX, previewPoint.sampleY))) continue
          const pixelRect = previewPixelRect(previewPoint.x, previewPoint.y)
          if (!drawing && (brushPreviewMode === 'full' || brushPreviewMode === 'full-edge')) {
            previewFillRects.push({
              pixelRect,
              sampleX: previewPoint.sampleX,
              sampleY: previewPoint.sampleY,
              color: cacheableSolidHover
                ? cachedPreviewColorAt(previewPoint.sampleX, previewPoint.sampleY)
                : previewColorAt(previewPoint.sampleX, previewPoint.sampleY, erasing, previewPoint.coverage, previewPoint.color, undefined, overwriteImageBrushPixels)
            })
          }
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
        fillPreviewPixelRects(previewFillRects)
        if (brushPreviewMode === 'edge' || brushPreviewMode === 'full-edge' || (erasing && brushPreviewMode === 'full')) context.stroke()
      }
      context.restore()
    }

    if (canRenderToolPreview && !inputRef.current.spaceHeld && inputRef.current.pointer.visible && !inputRef.current.sampling && session.tool === 'airbrush' && brushPreviewAllowedDuringDrag(drag, 'airbrush', drawingBrushPreviewEnabled)) {
      const pointerLocation = repeatedDocumentPointsAt(inputRef.current.pointer.clientX, inputRef.current.pointer.clientY)
      const point = pointerLocation?.local ?? inputRef.current.pointer.point
      const airbrushDrag = drag?.kind === 'airbrush' ? drag : null
      const previewSelection = airbrushDrag ? paintSelectionForDrag(airbrushDrag) : null
      const airbrushPoint = gridSnapActive ? snapPointToGrid(point, session.view.grid ?? DEFAULT_GRID_SETTINGS) : point
      const spraySize = session.airbrushScatterRadius * 2 + 1
      const sprayAnchor = brushStampAnchor(spraySize, null)
      const sprayMask = brushMaskOffsets(spraySize, 'round')
      const sprayPoints = new Map<string, { x: number; y: number }>()
      const spraySourcePoints = sprayMask.map((offset) => ({ x: airbrushPoint.x - sprayAnchor.x + offset.x, y: airbrushPoint.y - sprayAnchor.y + offset.y }))
      for (const target of airbrushSymmetryPoints(spraySourcePoints, document.width, document.height, session.symmetryAxes, symmetryCenter)) {
        const mapped = tileRepeatMappedPointForCopies(target, document.width, document.height, view.tileRepeatMode ?? 'off', true)
        if (mapped && (!previewSelection || selectionContains(previewSelection, mapped.local.x, mapped.local.y))) sprayPoints.set(`${mapped.local.x}:${mapped.local.y}`, mapped.local)
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
      const particleSourcePoints = brushMaskOffsets(particleSize, session.airbrushParticleShape, 'solid', 1, 0, 0, null, undefined, 0, 'paint', 0, 0, undefined, session.airbrushParticleShape === 'round' ? 0 : session.airbrushParticleAngle).map((offset) => ({
        x: point.x - particleAnchor.x + offset.x,
        y: point.y - particleAnchor.y + offset.y
      }))
      for (const target of airbrushSymmetryPoints(particleSourcePoints, document.width, document.height, session.symmetryAxes, symmetryCenter)) {
        const mapped = tileRepeatMappedPointForCopies(target, document.width, document.height, view.tileRepeatMode ?? 'off', true)
        if (mapped && (!previewSelection || selectionContains(previewSelection, mapped.local.x, mapped.local.y))) drawPreviewPixel(mapped.local.x, mapped.local.y, previewColorAt(mapped.local.x, mapped.local.y))
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
      // A rotated pixel grid no longer maps 1:1 to device pixels. Keeping the
      // hard sampler used by unrotated high-zoom views turns every diagonal
      // edge into a staircase. Smooth only this display-only composite; the
      // document bitmap and all saved/exported pixels remain untouched. A
      // mirror-only view keeps the normal hard-pixel behaviour.
      const rotationNeedsSmoothing = Math.abs(view.rotation) > 0.000001
      displayContext.imageSmoothingEnabled = rotationNeedsSmoothing || smoothPixelSampling
      if (displayContext.imageSmoothingEnabled) displayContext.imageSmoothingQuality = viewPreviewActive ? 'low' : 'high'
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
    // Keep the brush cursor on its own surface. This call is cheap and also
    // clears the overlay when a tool/view change makes the fast path invalid.
    brushPreviewDrawRef.current()
    const movingLayerIds = layerMovePreviewActive(activeDrag) && !activeDrag.duplicatedLayer
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
          copy: Boolean(activeDrag.copy),
          optimizedRotation: currentSession.selectionRotationAlgorithm === 'rotsprite'
        }
      : selectionPreviewOwner === 'pending' && currentSession.pendingPaste
        ? {
            layerId: currentSession.pendingPaste.layerId,
            source: currentSession.pendingPaste.source,
            target: { ...(currentSession.pendingPaste.transformTarget ?? currentSession.pendingPaste.target) },
            angle: currentSession.pendingPaste.transformAngle ?? 0,
            shear: currentSession.pendingPaste.transformShear ? { ...currentSession.pendingPaste.transformShear } : undefined,
            quad: currentSession.pendingPaste.transformQuad ? cloneSelectionQuad(currentSession.pendingPaste.transformQuad) ?? undefined : undefined,
            copy: currentSession.pendingPaste.copy,
            optimizedRotation: currentSession.selectionRotationAlgorithm === 'rotsprite'
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
        selectionPreview,
        deferAuxiliaryDraw: activeDrag?.kind === 'draw' || activeDrag?.kind === 'airbrush'
      }
      publishedCanvasPreviewRef.current = snapshot
      notifyCanvasPreview(session.document.id, snapshot)
    } else if (publishedCanvasPreviewRef.current !== null) {
      publishedCanvasPreviewRef.current = null
      notifyCanvasPreview(session.document.id, null)
    }
    if (isWorkspaceResizing()) {
      recordWorkspaceResizeStage('main', performance.now() - drawStartedAt)
      recordWorkspaceResizeContext({ width: document.width, height: document.height, layers: document.layers.length, zoom: view.zoom })
    }
    const drawDuration = drawStartedAt ? performance.now() - drawStartedAt : 0
    if (drawDuration >= 50) recordRuntimeDiagnostic('operation-stage', 'canvas.stage.draw', {
      bitmapPolicy: 'defer-live-v1',
      tool: currentSession.tool,
      gesture: activeDrag?.kind ?? 'none',
      documentId: document.id,
      durationMs: Math.round(drawDuration * 10) / 10,
      width: document.width,
      height: document.height,
      layers: document.layers.length,
      contentRevision: currentSession.contentRevision,
      active: activeDocumentId === session.document.id
    })
    performanceProbe?.recordDraw(drawDuration)
    // Slow selection/composition must not consume the flash before it is visible.
    if (paintedMoveLayerFlash && moveLayerClickFlashRef.current === paintedMoveLayerFlash
      && presentCanvasClickFlash(paintedMoveLayerFlash, performance.now())) {
      const flash = paintedMoveLayerFlash
      moveLayerClickFlashTimerRef.current = window.setTimeout(() => {
        if (moveLayerClickFlashRef.current !== flash) return
        moveLayerClickFlashRef.current = null
        moveLayerClickFlashTimerRef.current = null
        scheduleDraw()
      }, flash.duration)
    }

}
