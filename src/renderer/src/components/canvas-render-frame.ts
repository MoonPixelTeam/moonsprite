import { createCanvasBackground } from './canvas-render-background'
import { renderCanvasContent } from './canvas-render-content'
import { createCanvasPreviewPixels } from './canvas-render-preview-pixels'
import { createCanvasTilePreview, publishCanvasTilePreview } from './canvas-render-tile-preview'
import { createCanvasSelectionPaths } from './canvas-render-selection-paths'
import { createCanvasBrushPath } from './canvas-render-brush-path'
import { renderCanvasOutline, renderCanvasShapePreview, renderCanvasConnectedLine } from './canvas-render-shape-preview'
import { renderCanvasGradient } from './canvas-render-gradient'
import { renderCanvasTransformGuides, renderCanvasEditorGuides } from './canvas-render-guides'
import { renderCanvasSelectionPreview } from './canvas-render-selection-preview'
import { renderCanvasToolCursor } from './canvas-render-tool-cursor'
import { renderCanvasTileBrush } from './canvas-render-tile-brush'
import { renderCanvasFreeTileBrush } from './canvas-render-free-tile-brush'
import { renderCanvasBrush } from './canvas-render-brush'
import { renderCanvasAirbrush } from './canvas-render-airbrush'
import { renderCanvasStatus } from './canvas-render-status'
import { publishCanvasFramePreview } from './canvas-render-publish'
import { isWorkspaceResizing, recordWorkspaceResizeStage, recordWorkspaceResizeContext } from './workspace-resize'
import { measureRuntimeStages } from '@/core/runtime-diagnostic-stages'
import { isLayerEffectivelyLocked, isLayerEffectivelyVisible } from '@/core/document-model'
import { activeLayerMask, activePaintLayer, selectedTransformLayersAreEditable } from '@/store/workspace-session'
import { createCanvasRenderPlan, deviceAlignedCanvasRect, repeatedDeviceAlignedCanvasRect } from '@/core/canvas-render-plan'
import { canvasBackingRatioForInterfaceScale } from '@/core/canvas-interface-scale'
import { deferredSelectionPreviewOwner, temporaryMoveSuppressesToolPreview } from '@/core/canvas-input'
import { presentCanvasClickFlash } from './canvas-click-flash'
import { type RasterContext2D } from '@/components/canvas-selection-renderer'
import { canvasBackingCapacity, clearCanvasBacking, syncCanvasDisplaySize } from '@/components/canvas-display-size'
import { pixelSamplingMode } from '@/core/pixel-display'
import { tileRepeatOffsetsForViewport } from '@/core/tilemap'
import type * as React from 'react'
import type { DocumentSession } from '@/store/workspace-types'
import {
  MoveLayerClickFlash,
  FreeTileInstanceFlash,
  PolygonPathPreviewRenderCache,
  GradientCompositePreviewCache,
  GradientPreviewSurface,
  GradientPreviewCoverageCache,
  LineAnchorHistory,
  BrushPreviewStackCache,
  BrushPreviewCompositeCache,
  pointerIsOverCanvas
} from './canvas-stage-helpers'

export interface CanvasRenderContext {
  resources: {
    canvasRef: React.RefObject<HTMLCanvasElement | null>
    inputRef: React.RefObject<import('@/core/canvas-input').CanvasInputState>
    wheelBrushSizePreviewRef: React.RefObject<boolean>
    canvasResizePreviewRef: React.RefObject<import('@/store/workspace-types').CanvasResizePreview | null>
    liveViewRef: React.RefObject<import('@shared/types-view').ViewState>
    zoomPreviewStartRef: React.RefObject<import('@shared/types-view').ViewState | null>
    rotationSceneRef: React.RefObject<OffscreenCanvas | null>
    checkerboardTileRef: React.RefObject<{ key: string; canvas: OffscreenCanvas } | null>
    isoGuideTileRef: React.RefObject<{ key: string; canvas: OffscreenCanvas } | null>
    onionSkinCacheRef: React.RefObject<import('@/components/onion-skin-composite-cache').OnionSkinCompositeCache>
    compositeCacheRef: React.RefObject<import('@/components/canvas-composite-cache').CanvasCompositeCache>
    textToolPreviewRef: React.RefObject<import('@shared/types-animation').AnimationCelSurface | null>
    moveLayerClickFlashRef: React.RefObject<MoveLayerClickFlash | null>
    clickFlashCacheRef: React.RefObject<import('@/components/canvas-click-flash').CanvasClickFlashCache>
    freeTileInstanceFlashRef: React.RefObject<FreeTileInstanceFlash | null>
    compositePointSamplerRef: React.RefObject<{
      document: import('@shared/types-document').SpriteDocument
      revision: number
      sampler: (x: number, y: number) => import('@shared/types-color').RgbaColor
    } | null>
    compositeReplacementSamplerRef: React.RefObject<{
      document: import('@shared/types-document').SpriteDocument
      revision: number
      layerId: string
      sampler: (x: number, y: number, replacement: import('@shared/types-color').RgbaColor) => import('@shared/types-color').RgbaColor
    } | null>
    polygonPathPreviewRenderCacheRef: React.RefObject<PolygonPathPreviewRenderCache | null>
    outlinePreviewCacheRef: React.RefObject<{
      revision: number
      layerId: string
      selection: import('@shared/types-selection').SelectionMask | null
      preview: import('@/store/workspace-types').OutlinePreview
      samples: import('@/core/tools-outline').OutlinePixelSample[]
    } | null>
    gradientPreviewDiagnosticsRef: React.RefObject<{
      record(
        key: string,
        detail: import('@/core/runtime-diagnostics').RuntimeDiagnosticDetail,
        timing: import('@/core/gradient-preview-diagnostics').GradientPreviewTiming
      ): void
      flush: () => void
    } | null>
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
    publishedSelectionSizePreviewRef: React.RefObject<{ width: number; height: number } | null>
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
    lineAnchor: { x: number; y: number } | null
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
    temporaryMoveActive: (
      event: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>,
      targetSession?: import('@/store/workspace-types').DocumentSession
    ) => boolean
    stageSize: () => { width: number; height: number }
    stageDisplaySize: () => { width: number; height: number }
    brushPatternOrigin: (
      point: import('@/core/canvas-input').CanvasPoint,
      size?: number,
      imageBrush?: import('@shared/types-brush').ImageBrush | null
    ) => import('@/core/canvas-input').CanvasPoint
    paintSelectionForDrag: (drag: import('@/core/canvas-input').CanvasDragState) => import('@shared/types-selection').SelectionMask | null
    curveDefaultControls: (
      start: import('@/core/canvas-input').CanvasPoint,
      end: import('@/core/canvas-input').CanvasPoint,
      count: number
    ) => import('@/core/canvas-input').CanvasPoint[]
    gradientGeometryOptionsForDrag: (
      drag: Pick<import('@/core/canvas-input').CanvasDragState, 'constrain' | 'gradientAngle' | 'gradientFromCenter' | 'gradientRadialGeometry'>
    ) => import('@/core/gradient-color').GradientGeometryOptions | undefined
    tileRepeatPointAt: (clientX: number, clientY: number) => import('@/core/canvas-input').CanvasPoint | null
    resolveStraightLine: (
      from: import('@/core/canvas-input').CanvasPoint,
      to: import('@/core/canvas-input').CanvasPoint,
      constrained: boolean
    ) => { from: import('@/core/canvas-input').CanvasPoint; to: import('@/core/canvas-input').CanvasPoint }
    modifierActive: (
      event: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>,
      id:
        | 'addAnimationFrame'
        | 'addBlankAnimationFrame'
        | 'addForegroundToPalette'
        | 'addFreeTileSource'
        | 'addLinkedAnimationFrame'
        | 'addToSelection'
        | 'adjustmentBrightnessContrast'
        | 'adjustmentColorBalance'
        | 'adjustmentCurves'
        | 'adjustmentHueSaturation'
        | 'advancedMode'
        | 'animationPlaybackAll'
        | 'animationPlaybackOnce'
        | 'animationPlaybackSpeed025'
        | 'animationPlaybackSpeed050'
        | 'animationPlaybackSpeed100'
        | 'animationPlaybackSpeed150'
        | 'animationPlaybackSpeed200'
        | 'animationPlaybackSpeed300'
        | 'animationPlaybackTag'
        | 'brushLibraryParentFolder'
        | 'brushShapeLine'
        | 'brushShapeRound'
        | 'brushShapeSquare'
        | 'brushSizeAdjust'
        | 'brushSizeDecrease'
        | 'brushSizeIncrease'
        | 'brushSizeWheelAdjust'
        | 'brushSwatchLarge'
        | 'brushSwatchMedium'
        | 'brushSwatchSmall'
        | 'canvasResize'
        | 'clearLayerStyles'
        | 'closeDocument'
        | 'connectAnimationCels'
        | 'connectAnimationMasks'
        | 'constrainAxis'
        | 'constrainLineDirections'
        | 'convertColorMode'
        | 'convertColorModeGrayscale'
        | 'convertColorModeIndexed'
        | 'convertColorModeRgba'
        | 'convertLayerToBackground'
        | 'convertLayerToRaster'
        | 'convertLayerToTilemap'
        | 'copy'
        | 'copyAnimationCel'
        | 'copyAnimationFrames'
        | 'copyAnimationMasks'
        | 'copyLayerOnDrag'
        | 'copyLayerStyles'
        | 'copySelectionContent'
        | 'createAnimationLoopSection'
        | 'createBrushFolder'
        | 'createBrushFromSelection'
        | 'createLayerGroup'
        | 'createLinkedLayer'
        | 'createPaletteGradient'
        | 'createPaletteHueGradient'
        | 'cropCanvas'
        | 'cut'
        | 'deleteAnimationFrame'
        | 'deleteAnimationLoopSection'
        | 'deleteBrushSelection'
        | 'deleteFreeTileInstances'
        | 'deleteLayer'
        | 'deleteSelection'
        | 'deleteTilesetSelection'
        | 'deselect'
        | 'disableAnimationFrames'
        | 'disconnectAnimationCels'
        | 'disconnectAnimationMasks'
        | 'duplicateLayer'
        | 'enableAnimationFrames'
        | 'exportAllFrames'
        | 'exportDocument'
        | 'exportSpriteSheet'
        | 'extractPaletteColors'
        | 'fillForeground'
        | 'flipHorizontal'
        | 'flipVertical'
        | 'freeTileModeEdit'
        | 'freeTileModePaint'
        | 'imageResize'
        | 'importBrushImage'
        | 'integerSelectionScale'
        | 'invertSelection'
        | 'lasso'
        | 'lasso.quick'
        | 'lineConnectionMode'
        | 'magic'
        | 'magic.quick'
        | 'mergeLayerDown'
        | 'mergeLayerGroup'
        | 'mergeSelectedLayers'
        | 'mergeVisibleLayers'
        | 'mirrorFreeTileInstanceHorizontal'
        | 'mirrorFreeTileInstanceVertical'
        | 'mirrorView'
        | 'mirrorViewVertical'
        | 'newBackgroundLayer'
        | 'newDocument'
        | 'newFreeTileLayer'
        | 'newLayer'
        | 'newTilemapLayer'
        | 'nextAnimationFrame'
        | 'openAbout'
        | 'openAnimationCelProperties'
        | 'openAnimationFrameProperties'
        | 'openAnimationLoopSectionProperties'
        | 'openAutoSlice'
        | 'openBrushFolder'
        | 'openComponentLibrary'
        | 'openDocument'
        | 'openFreeTileInstanceProperties'
        | 'openFreeTileSourceProperties'
        | 'openGridSettings'
        | 'openHome'
        | 'openIsoViewSettings'
        | 'openLatestRelease'
        | 'openLayerProperties'
        | 'openLayerSettings'
        | 'openLayerStyles'
        | 'openPaletteFolder'
        | 'openPreferences'
        | 'openProjectFolder'
        | 'openProjectInfo'
        | 'openScriptFolder'
        | 'openShortcutSettings'
        | 'openSliceProperties'
        | 'openTimelapse'
        | 'openWorkspaceManager'
        | 'outline'
        | 'outlineSelectionInside'
        | 'paletteSortAscending'
        | 'paletteSortDescending'
        | 'paletteSwatchHuge'
        | 'paletteSwatchLarge'
        | 'paletteSwatchMedium'
        | 'paletteSwatchSmall'
        | 'paletteSwatchTiny'
        | 'paste'
        | 'pasteAnimationCels'
        | 'pasteAnimationFrames'
        | 'pasteAnimationMasks'
        | 'pasteAsNewDocument'
        | 'pasteAsNewLayer'
        | 'pasteLayerStyles'
        | 'playAnimationLoopSection'
        | 'polygonLasso'
        | 'polygonLasso.quick'
        | 'popupBrushLibraryPanel'
        | 'popupColorPanel'
        | 'popupLayersPanel'
        | 'popupPalettePanel'
        | 'popupPreviewPanel'
        | 'popupTilesetPanel'
        | 'previousAnimationFrame'
        | 'proportionalSelectionTransform'
        | 'quickOutline'
        | 'redo'
        | 'refreshBrushLibrary'
        | 'refreshPalettes'
        | 'relativeLuminance'
        | 'replaceColor'
        | 'resetSymmetryCenter'
        | 'resetView'
        | 'resetViewRotation'
        | 'resetWorkspaceLayout'
        | 'reversePaletteColors'
        | 'rotateFreeTileInstance90'
        | 'rotateViewClockwise90'
        | 'rotateViewCounterClockwise90'
        | 'save'
        | 'saveAs'
        | 'savePalette'
        | 'saveWorkspaceLayout'
        | 'selectAll'
        | 'selectAllSlices'
        | 'selectionModeAdd'
        | 'selectionModeIntersect'
        | 'selectionModeReplace'
        | 'selectionModeSubtract'
        | 'showOnlyFreeTileInstance'
        | 'snapSelectionRotation'
        | 'snapViewRotation'
        | 'sortPaletteAlpha'
        | 'sortPaletteBlue'
        | 'sortPaletteBrightness'
        | 'sortPaletteGreen'
        | 'sortPaletteHue'
        | 'sortPaletteLuminance'
        | 'sortPaletteRed'
        | 'sortPaletteSaturation'
        | 'swapForegroundBackground'
        | 'tileRepeatBoth'
        | 'tileRepeatOff'
        | 'tileRepeatX'
        | 'tileRepeatY'
        | 'tilemapModeCreate'
        | 'tilemapModeEdit'
        | 'tilemapModeHybrid'
        | 'tilemapModePaint'
        | 'toggleAnimationFramesDisabled'
        | 'toggleAnimationMask'
        | 'toggleAnimationPlayback'
        | 'toggleAnimationReturnToStart'
        | 'toggleBrushLibraryPanel'
        | 'toggleClippingMask'
        | 'toggleColorPanel'
        | 'toggleContiguous'
        | 'toggleCustomGrid'
        | 'toggleFixedRatio'
        | 'toggleGrid'
        | 'toggleGroupMask'
        | 'toggleIsoView'
        | 'toggleLayerMask'
        | 'toggleLayerStyles'
        | 'toggleLayersPanel'
        | 'toggleMoveAutoSelect'
        | 'toggleOnionSkin'
        | 'togglePaletteColorSync'
        | 'togglePaletteEditLock'
        | 'togglePalettePanel'
        | 'togglePerfectPixels'
        | 'togglePreviewPanel'
        | 'toggleRoundedCorners'
        | 'toggleSelectedGroupCollapsed'
        | 'toggleSelectedLayerLock'
        | 'toggleSelectedLayerVisibility'
        | 'toggleSelectionOutline'
        | 'toggleSliceOutlines'
        | 'toggleSmartClosure'
        | 'toggleSymmetryDiagonalDown'
        | 'toggleSymmetryDiagonalUp'
        | 'toggleSymmetryHorizontal'
        | 'toggleSymmetryRotational'
        | 'toggleSymmetryVertical'
        | 'toggleTilesetPanel'
        | 'toggleTimeline'
        | 'tool.airbrush'
        | 'tool.airbrush.quick'
        | 'tool.curve'
        | 'tool.curve.quick'
        | 'tool.eraser'
        | 'tool.eraser.quick'
        | 'tool.eyedropper'
        | 'tool.eyedropper.quick'
        | 'tool.fill'
        | 'tool.fill.gradient'
        | 'tool.fill.gradient.quick'
        | 'tool.fill.quick'
        | 'tool.hand'
        | 'tool.hand.quick'
        | 'tool.line'
        | 'tool.line.quick'
        | 'tool.liquify'
        | 'tool.liquify.quick'
        | 'tool.move'
        | 'tool.move.quick'
        | 'tool.pencil'
        | 'tool.pencil.quick'
        | 'tool.rotate'
        | 'tool.rotate.quick'
        | 'tool.selection'
        | 'tool.selection.ellipse'
        | 'tool.selection.ellipse.quick'
        | 'tool.selection.quick'
        | 'tool.shape'
        | 'tool.shape.ellipse'
        | 'tool.shape.ellipse.quick'
        | 'tool.shape.ellipseOutline'
        | 'tool.shape.ellipseOutline.quick'
        | 'tool.shape.freeform'
        | 'tool.shape.freeform.quick'
        | 'tool.shape.polygon'
        | 'tool.shape.polygon.quick'
        | 'tool.shape.quick'
        | 'tool.shape.rectangle'
        | 'tool.shape.rectangle.quick'
        | 'tool.shape.rectangleOutline'
        | 'tool.shape.rectangleOutline.quick'
        | 'tool.slice'
        | 'tool.slice.quick'
        | 'tool.smooth'
        | 'tool.smooth.quick'
        | 'tool.text'
        | 'tool.text.quick'
        | 'tool.zoom'
        | 'tool.zoom.quick'
        | 'toolRailBottom'
        | 'toolRailLeft'
        | 'toolRailRight'
        | 'toolRailTop'
        | 'transform'
        | 'trimCanvas'
        | 'undo'
        | 'ungroupLayers'
        | 'viewZoom100'
        | 'viewZoom200'
        | 'viewZoom3200'
        | 'viewZoom400'
        | 'viewZoom800'
    ) => boolean
    tilemapEditSelectionAtPoint: (
      point: import('@/core/canvas-input').CanvasPoint,
      current?: import('@/store/workspace-types').DocumentSession,
      armOutsideTiles?: boolean
    ) => import('@shared/types-selection').SelectionMask | null | undefined
    repeatedDocumentPointsAt: (
      clientX: number,
      clientY: number,
      continuous?: boolean,
      allowOutsideCopies?: boolean
    ) => { local: import('@/core/canvas-input').CanvasPoint; repeated: import('@/core/canvas-input').CanvasPoint; offset: { x: number; y: number } } | null
    selectionHitAt: (clientX: number, clientY: number) => import('@/core/canvas-input').SelectionHit
    sliceHandleAt: (
      clientX: number,
      clientY: number,
      slice: import('@shared/types-selection').SelectionRect
    ) => import('@/core/canvas-input').SelectionHandle | null
    tilemapEditCreatesFirstTile: (current?: import('@/store/workspace-types').DocumentSession) => boolean
    tilemapCellAllowedBySelection: (
      target: import('@/core/tilemap-document').TilemapCelTarget,
      index: number,
      selection: import('@shared/types-selection').SelectionMask | null
    ) => boolean
    brushPreviewOverlaySupported: (currentSession: import('@/store/workspace-types').DocumentSession) => boolean
    snapBrushPointToGrid: (
      point: import('@/core/canvas-input').CanvasPoint,
      size: number,
      imageBrush?: import('@shared/types-brush').ImageBrush | null | undefined,
      angle?: number,
      currentSession?: import('@/store/workspace-types').DocumentSession
    ) => import('@/core/canvas-input').CanvasPoint
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
  measureRuntimeStages('canvas.stage.draw', checkpoint => renderFrame(frame, checkpoint), () => {
    const session = frame.readSession()
    return { documentId: session.document.id, tool: session.tool, contentRevision: session.contentRevision,
      zoom: frame.resources.liveViewRef.current.zoom, gesture: frame.resources.inputRef.current.drag?.kind ?? 'none',
      viewPreview: frame.resources.zoomPreviewStartRef.current !== null, timingScope: 'cpu-submit',
      width: session.document.width, height: session.document.height,
      active: frame.settings.activeDocumentId === session.document.id }
  })
}

function renderFrame(frame: CanvasRenderContext, checkpoint: (stage: string) => void): void {
  const {
    canvasRef,
    inputRef,
    wheelBrushSizePreviewRef,
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
  } = frame.resources
  const {
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
    gridSnapActive,
    moveLayerContentPreviewEnabled,
    sliceOutlinesVisible,
    sliceColor,
    t
  } = frame.settings
  const {
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
  } = frame.geometry

  const performanceProbe = window.__moonSpriteCanvasProbe
  const drawStartedAt = performance.now()
  const canvas = canvasRef.current
  if (!canvas) return
  // Ctrl+Alt is the brush-size modifier, while Ctrl alone is the temporary
  // move tool. Keep the real paint session during the modifier preview so
  // the quick-move target cannot suppress the brush preview.
  const brushSizeAdjustmentActive = Boolean(inputRef.current.modifierBrushSize)
  const baseSession = frame.readSession()
  const sharedSession = sharedCanvasSession(baseSession)
  const currentSession = brushSizeAdjustmentActive ? sharedSession : sessionWithActiveQuickTool(sharedSession)
  const currentActiveLayer = activePaintLayer(currentSession)
  const currentLayerMask = activeLayerMask(currentSession)
  const isolatedLayerMask = currentSession.layerMaskIsolatedView ? currentLayerMask : null
  const currentHasRasterSelection =
    Boolean(currentLayerMask) ||
    (currentSession.selectedGroupIds.length === 0 &&
      currentSession.selectedLayerIds.some((id) => currentSession.document.layers.some((layer) => layer.id === id)))
  const currentSelectionLayersEditable = selectedTransformLayersAreEditable(currentSession)
  const temporaryMovePreviewActive = temporaryMoveActive(
    {
      ctrlKey: inputRef.current.ctrlHeld,
      metaKey: false,
      altKey: inputRef.current.altHeld,
      shiftKey: inputRef.current.shiftHeld
    },
    currentSession
  )
  const brushSizeAdjustmentPreviewActive = wheelBrushSizePreviewRef.current || brushSizeAdjustmentActive
  const canRenderToolPreview =
    !currentSession.animationPlaying &&
    !temporaryMoveSuppressesToolPreview(temporaryMovePreviewActive, brushSizeAdjustmentPreviewActive) &&
    !canvasResizePreviewRef.current &&
    (currentSession.tool === 'selection'
      ? currentSelectionLayersEditable
      : currentHasRasterSelection &&
        isLayerEffectivelyVisible(currentSession.document, currentActiveLayer) &&
        !isLayerEffectivelyLocked(currentSession.document, currentActiveLayer))
  checkpoint('session-prepare')
  const rect = stageSize()
  const displaySize = stageDisplaySize()
  const dpr = canvasBackingRatioForInterfaceScale(window.devicePixelRatio || 1, interfaceScale)
  const previousBackingWidth = canvas.width,
    previousBackingHeight = canvas.height
  const backingStarted = isWorkspaceResizing() ? performance.now() : 0
  const deviceScale = syncCanvasDisplaySize(canvas, rect.width, rect.height, dpr, displaySize.width, displaySize.height, isWorkspaceResizing())
  checkpoint('viewport-backing')
  if (backingStarted) {
    recordWorkspaceResizeStage('backing', performance.now() - backingStarted)
    if (canvas.width !== previousBackingWidth || canvas.height !== previousBackingHeight)
      recordWorkspaceResizeStage('allocation', performance.now() - backingStarted)
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
  const viewPreviewActive =
    isWorkspaceResizing() ||
    activeDrag?.kind === 'pan' ||
    activeDrag?.kind === 'zoom-drag' ||
    activeDrag?.kind === 'rotate-view' ||
    zoomPreviewStartRef.current !== null
  const pixelSamplingQuality: ImageSmoothingQuality = viewPreviewActive ? 'low' : 'high'
  const onionSkinInvalidation =
    currentSession.selectedAnimationFrameIds.length > 1 && currentSession.contentInvalidation
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
  const repeatOffsets = tileRepeatOffsetsForViewport(viewport, originX, originY, canvasWidth, canvasHeight, view.tileRepeatMode ?? 'off')
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
  checkpoint('view-geometry')
  const { drawGrid, drawIsoGuides } = createCanvasBackground({
    checkerboard,
    view,
    repeatCopies,
    canvasBoundaryFor,
    context,
    clipCanvasCopy,
    checkerboardTileRef,
    renderCanvasWidth,
    renderCanvasHeight,
    viewport,
    document,
    deviceScale,
    isoViewPreferences,
    isoGuideTileRef
  })
  checkpoint('background')
  const { paintedMoveLayerFlash } = renderCanvasContent({
    repeatCopies,
    isolatedLayerMask,
    timelineHidden,
    onionSkin,
    currentSession,
    onionSkinCacheRef,
    context,
    renderCanvasWidth,
    renderCanvasHeight,
    view,
    onionSkinInvalidation,
    smoothPixelSampling,
    deviceScale,
    compositeCacheRef,
    document,
    pixelSamplingQuality,
    viewPreviewActive,
    activeDrag,
    selectionPreviewOwner,
    currentActiveLayer,
    textToolPreviewRef,
    clipCanvasCopy,
    moveLayerClickFlashEnabled,
    moveLayerClickFlashRef,
    clickFlashCacheRef,
    freeTileInstanceFlashRef,
    drawGrid,
    gridColors,
    drawIsoGuides,
    inputRef
  })
  checkpoint('content')
  const {
    activeLayer,
    compositePointSampler,
    compositePointReplacementSampler,
    sampleCompositeForPreview,
    previewLayerColorAt,
    previewColorAt,
    previewPixelRect,
    previewPixelPlacements,
    previewPixelRects,
    previewPointKey,
    fillPreviewPixelRects,
    drawPreviewPixel
  } = createCanvasPreviewPixels({
    currentSession,
    compositePointSamplerRef,
    document,
    compositeReplacementSamplerRef,
    isolatedLayerMask,
    currentActiveLayer,
    previewOriginX,
    previewOriginY,
    view,
    deviceScale,
    repeatCopies,
    checkerboard,
    context
  })
  const { pendingTilesetTilePreview, queueTilesetTilePreview, drawTilemapEditPreviewTiles } = createCanvasTilePreview({
    document,
    repeatCopies,
    context,
    clipCanvasCopy,
    activeLayer,
    isolatedLayerMask,
    compositePointReplacementSampler,
    view,
    deviceScale,
    checkerboard
  })
  const {
    customSelectionPreviewColor,
    selectionPreviewColorForBackground,
    drawSelectionPathPreview,
    drawSelectionPathPreviewPoints,
    drawCachedPolygonPath,
    cachedPolygonPathFor,
    drawSelectionCursorCorners
  } = createCanvasSelectionPaths({
    selectionPreviewColorMode,
    selectionPreviewColor,
    repeatCopies,
    context,
    clipCanvasCopy,
    view,
    deviceScale,
    document,
    rect,
    sampleCompositeForPreview,
    checkerboard,
    currentSession,
    currentActiveLayer,
    originX,
    originY,
    polygonPathPreviewRenderCacheRef,
    previewPixelRect
  })
  const { drawBrushPathPreview, drawShapeContourPreview, drawStrokePreview } = createCanvasBrushPath({
    session,
    activeBrushImage,
    brushPatternOrigin,
    activeBrushPreviewMode,
    currentActiveLayer,
    currentSession,
    document,
    previewPixelPlacements,
    view,
    deviceScale,
    activeBrushTexture,
    proceduralAntialiasStrength,
    activeBrushDither,
    optimizedRotationEnabled,
    symmetryCenter,
    activeLayer,
    previewColorAt,
    previewLayerColorAt,
    drawTilemapEditPreviewTiles,
    queueTilesetTilePreview,
    fillPreviewPixelRects,
    drawPreviewPixel,
    balancedStraightLines
  })
  renderCanvasOutline({ session, currentSession, outlinePreviewCacheRef, document, drawPreviewPixel, isolatedLayerMask })

  const drag = inputRef.current.drag
  renderCanvasShapePreview({
    canRenderToolPreview,
    drag,
    session,
    paintSelectionForDrag,
    drawShapeContourPreview,
    document,
    shapeCornerRadius,
    balancedShiftLineEnabled,
    balancedStraightLines,
    curveDefaultControls,
    drawBrushPathPreview
  })
  renderCanvasGradient({
    canRenderToolPreview,
    drag,
    session,
    gradientStops,
    paintSelectionForDrag,
    repeatCopies,
    gradientPreviewDiagnosticsRef,
    document,
    activeLayer,
    isolatedLayerMask,
    gradientCompositePreviewCacheRef,
    currentSession,
    gradientDither,
    gradientType,
    gradientGeometryOptionsForDrag,
    compositePointReplacementSampler,
    previewPixelRect,
    deviceScale,
    view,
    gradientPreviewSurfaceRef,
    checkerboard,
    originX,
    originY,
    gradientPreviewCoverageCacheRef,
    context,
    clipCanvasCopy,
    smoothPixelSampling,
    gradientPreviewInputAtRef,
    gradientLineVisible,
    gradientLineColor
  })
  renderCanvasConnectedLine({
    currentActiveLayer,
    currentSession,
    shiftLinePreviewEnabled,
    lineConnectionConfigured,
    canRenderToolPreview,
    inputRef,
    session,
    lineAnchor,
    tileRepeatPointAt,
    document,
    view,
    resolveStraightLine,
    modifierActive,
    lineAnchorHistoryRef,
    activeLayer,
    tilemapEditSelectionAtPoint,
    drawStrokePreview
  })
  renderCanvasTransformGuides({
    session,
    context,
    clipBaseCanvas,
    symmetryAxisPreferences,
    document,
    symmetryCenter,
    originX,
    view,
    originY,
    canvasResizePreviewRef,
    deviceScale,
    baseCanvasBoundary,
    checkerboard,
    rect,
    activeTheme,
    canvasResizeColor,
    canvasWidth,
    canvasHeight
  })
  renderCanvasSelectionPreview({
    inputRef,
    drawSelectionPathPreview,
    repeatCopies,
    view,
    customSelectionPreviewColor,
    session,
    lassoPreviewClosed,
    balancedShiftLineEnabled,
    drawCachedPolygonPath,
    cachedPolygonPathFor,
    drawSelectionPathPreviewPoints,
    document,
    symmetryCenter,
    previewPixelRect,
    sampleCompositeForPreview,
    checkerboard,
    context,
    selectionPreviewColorForBackground,
    clipBaseCanvas,
    previewOriginX,
    previewOriginY,
    selectionPreviewColorMode,
    canRenderToolPreview,
    repeatedDocumentPointsAt,
    selectionHitAt,
    drawSelectionCursorCorners
  })
  renderCanvasToolCursor({
    inputRef,
    sliceTool,
    currentSession,
    sliceHandleAt,
    document,
    sampleCompositeForPreview,
    checkerboard,
    drawSelectionCursorCorners,
    selectionPreviewColorForBackground,
    canRenderToolPreview,
    session,
    fillKind,
    tilemapEditSelectionAtPoint,
    symmetryCenter,
    drawPreviewPixel,
    previewColorAt,
    drag
  })
  publishCanvasTilePreview({
    drag,
    document,
    currentSession,
    currentActiveLayer,
    tilemapEditCreatesFirstTile,
    drawTilemapEditPreviewTiles,
    queueTilesetTilePreview,
    pendingTilesetTilePreview,
    publishedTilesetPreviewRef
  })
  renderCanvasTileBrush({
    currentActiveLayer,
    currentSession,
    brushPreviewMode,
    canRenderToolPreview,
    inputRef,
    drag,
    drawingBrushPreviewEnabled,
    session,
    document,
    repeatedDocumentPointsAt,
    paintSelectionForDrag,
    tilemapCellAllowedBySelection,
    repeatCopies,
    context,
    clipCanvasCopy,
    activeLayer,
    isolatedLayerMask,
    compositePointReplacementSampler,
    view,
    deviceScale,
    checkerboard,
    sampleCompositeForPreview,
    activeTheme
  })
  renderCanvasFreeTileBrush({
    currentActiveLayer,
    currentSession,
    brushPreviewMode,
    canRenderToolPreview,
    inputRef,
    drag,
    drawingBrushPreviewEnabled,
    session,
    document,
    repeatedDocumentPointsAt,
    paintSelectionForDrag,
    repeatCopies,
    context,
    clipCanvasCopy,
    isolatedLayerMask,
    compositePointReplacementSampler,
    view,
    deviceScale,
    checkerboard,
    sampleCompositeForPreview,
    activeTheme
  })
  renderCanvasBrush({
    currentActiveLayer,
    currentSession,
    brushPreviewMode,
    canRenderToolPreview,
    inputRef,
    activeDrag,
    pointerOverCanvas,
    drag,
    drawingBrushPreviewEnabled,
    brushPreviewOverlaySupported,
    repeatedDocumentPointsAt,
    tilemapEditSelectionAtPoint,
    paintSelectionForDrag,
    snapBrushPointToGrid,
    context,
    brushPatternOrigin,
    view,
    optimizedRotationEnabled,
    checkerboard,
    sampleCompositeForPreview,
    document,
    previewPixelRect,
    activeTheme,
    repeatCopies,
    fromX,
    fromY,
    toX,
    toY,
    brushPreviewStackCacheRef,
    brushPreviewCompositeCacheRef,
    previewColorAt,
    fillPreviewPixelRects
  })
  renderCanvasAirbrush({
    canRenderToolPreview,
    inputRef,
    session,
    drag,
    drawingBrushPreviewEnabled,
    repeatedDocumentPointsAt,
    paintSelectionForDrag,
    gridSnapActive,
    document,
    symmetryCenter,
    view,
    sampleCompositeForPreview,
    context,
    activeTheme,
    previewPointKey,
    previewPixelRects,
    drawPreviewPixel,
    previewColorAt
  })
  renderCanvasEditorGuides({
    view,
    toX,
    fromX,
    toY,
    fromY,
    repeatCopies,
    drawGrid,
    gridColors,
    moveLayerContentPreviewEnabled,
    moveLayerContentPreviewRef,
    document,
    originX,
    originY,
    context,
    sliceTool,
    sliceOutlinesVisible,
    inputRef,
    currentSession,
    sliceColor,
    autoSlicePreviewRef,
    canvasWidth,
    canvasHeight,
    deviceScale,
    activeTheme
  })

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
  renderCanvasStatus({
    rect,
    document,
    view,
    rotationIndicatorPosition,
    isolatedLayerMask,
    compositePointSampler,
    checkerboard,
    displayContext,
    activeTheme,
    inputRef,
    currentSession,
    publishedSelectionSizePreviewRef,
    session,
    t,
    drawSelectionOverlay,
    brushPreviewDrawRef
  })
  checkpoint('overlays')
  publishCanvasFramePreview({
    activeDrag,
    selectionPreviewOwner,
    currentActiveLayer,
    cloneSelectionQuad,
    currentSession,
    compositeCacheRef,
    publishedCanvasPreviewRef,
    session
  })
  if (isWorkspaceResizing()) {
    recordWorkspaceResizeStage('main', performance.now() - drawStartedAt)
    recordWorkspaceResizeContext({ width: document.width, height: document.height, layers: document.layers.length, zoom: view.zoom })
  }
  checkpoint('publish')
  const drawDuration = drawStartedAt ? performance.now() - drawStartedAt : 0
  performanceProbe?.recordDraw(drawDuration)
  // Slow selection/composition must not consume the flash before it is visible.
  if (paintedMoveLayerFlash && moveLayerClickFlashRef.current === paintedMoveLayerFlash && presentCanvasClickFlash(paintedMoveLayerFlash, performance.now())) {
    const flash = paintedMoveLayerFlash
    moveLayerClickFlashTimerRef.current = window.setTimeout(() => {
      if (moveLayerClickFlashRef.current !== flash) return
      moveLayerClickFlashRef.current = null
      moveLayerClickFlashTimerRef.current = null
      scheduleDraw()
    }, flash.duration)
  }
}
