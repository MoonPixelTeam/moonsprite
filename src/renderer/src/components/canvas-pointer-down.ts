import { createCanvasSamplingStart } from './canvas-sampling-start'
import { createCanvasRasterStart } from './canvas-raster-start'
import { createNavigationCanvasInput } from './canvas-input-navigation'
import { createSelectionCanvasInput } from './canvas-input-selection'
import { createSelectionBeginCanvasInput } from './canvas-input-selection-begin'
import { measureRuntimeDiagnostic } from '@/core/runtime-diagnostics'
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
import type { FreeTileInstance } from '@shared/types-tiles'
import type { RasterLayer } from '@shared/types-layer'
import type { RgbaColor } from '@shared/types-color'
import type { SelectionMask, SelectionMode, SelectionRect } from '@shared/types-selection'
import { createId, getActiveLayer, isLayerEffectivelyLocked, isLayerEffectivelyVisible } from '@/core/document-model'
import { beginCanvasToolGesture } from '@/core/canvas-tool-gesture-lock'
import { TRANSPARENT } from '@/core/raster'
import { DEFAULT_BRUSH_DITHER_SETTINGS } from '@/core/gradient-color'
import { brushStampAnchor } from '@/core/tools-brush'
import { type BrushGradientSample } from '@/core/tools-pixel-edit'
import { useWorkspace, type DocumentSession } from '@/store/workspace'
import { activePaintLayer, isToolAvailableForSession } from '@/store/workspace-session'
import { shiftSelection } from '@/core/selection'
import { paletteSamplingShortcutActive } from '@/core/palette-sampling-shortcut'
import {
  CanvasInputState,
  PointerPressureAdapter,
  isCanvasViewNavigationTool,
  paletteSamplingShortcutStartsPrimarySample,
  playbackCanvasNavigationTool,
  shouldStartCanvasPan,
  temporaryMoveForCanvasInteractionAllowed,
  type CanvasDragState as DragState,
  type CanvasPoint as Point,
  type SelectionHit
} from '@/core/canvas-input'
import { canvasCursors, canvasToolCursor, resizeCursors } from '@/core/canvas-visuals'
import { type SymmetryAxis } from '@/core/symmetry'
import { shouldUseFreeTileInstanceMove } from '@/components/canvas-move-selection'
import { brushOpacityScale, resolveBrushDynamics } from '@/core/pressure'
import { activeBrushInputsForTool } from '@/core/brushes'
import { ensureAnimationDocument } from '@/core/animation'
import { activeTilemapCelTarget } from '@/core/tilemap-document'
import { freeTileInstanceBounds, freeTileSourceEditTargetAtPoint, freeTileSourceForInstance, freeTileSourceStampOrigin } from '@/core/free-tile'
import { activeFreeTileCelTarget, freeTileCelTargetAt, freeTileInstanceAtDocumentPoint, freeTileSourceForId } from '@/core/free-tile-document'
import { createFreeTileSourceEditRaster, type FreeTileSourceEditRaster } from '@/core/free-tile-edit'
import { syncHeldShortcutModifiers } from '@/components/useQuickToolShortcut'
import { SymmetryDragState, selectedTextBoxForSession } from './canvas-stage-helpers'
interface Ports {
  magicGestureRef: import('react').RefObject<{
    cancel: (redraw?: boolean) => void
    drag: DragState
  } | null>
  liveInputSession: () => DocumentSession
  pressureAdapterRef: import('react').RefObject<PointerPressureAdapter>
  sameRgbaColor: (left: RgbaColor, right: RgbaColor) => boolean
  zoomPreviewStartRef: import('react').RefObject<import('@shared/types-view').ViewState | null>
  finishZoomPreview: () => import('@shared/types-view').ViewState
  inputRef: import('react').RefObject<CanvasInputState>
  navigationInput: ReturnType<typeof createNavigationCanvasInput>
  selectionInput: ReturnType<typeof createSelectionCanvasInput>
  quickToolActive: (tool: DocumentSession['tool']) => boolean
  selectionPivotHitAt: (clientX: number, clientY: number) => boolean
  symmetryAxisHitAt: (clientX: number, clientY: number, ctrlHeld?: boolean) => SymmetryAxis | 'center' | null
  symmetryDragRef: import('react').RefObject<SymmetryDragState | null>
  localPoint: (event: React.PointerEvent<HTMLCanvasElement>, allowOutsideCopies?: boolean) => Point | null
  localContinuousPointAt: (clientX: number, clientY: number) => Point | null
  activeLayer: RasterLayer
  modifierActive: (event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>, id: import('@/core/shortcuts').ShortcutId) => boolean
  updateCursor: (event: React.PointerEvent<HTMLCanvasElement>) => void
  startSampling: ReturnType<typeof createCanvasSamplingStart>
  selectionHit: (event: React.PointerEvent<HTMLCanvasElement>) => SelectionHit
  radialGradientCenterModifierActive: (targetSession: DocumentSession, event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey'>) => boolean
  quickMoveToolActive: () => boolean
  brushLineConnectionHasPriority: (event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>, targetSession?: DocumentSession) => boolean
  textLayerAt: (point: Point) => RasterLayer | null
  textInput: ReturnType<typeof createTextCanvasInput>
  shapeInput: ReturnType<typeof createShapeCanvasInput>
  canvasResizeHit: (event: React.PointerEvent<HTMLCanvasElement>) => DragState['canvasEdge'] | null
  canvasResizePreviewRef: import('react').RefObject<import('@/store/workspace').CanvasResizePreview | null>
  boundsInput: ReturnType<typeof createBoundsCanvasInput>
  groupSelectionActive: boolean
  hasSelectedRasterLayer: boolean
  selectionLayersEditable: boolean
  tilemapSelectionCreationAllowed: boolean
  tilemapEditSelectionAtPoint: (point: Point, current?: DocumentSession, armOutsideTiles?: boolean) => SelectionMask | null | undefined
  freeTileInput: ReturnType<typeof createFreeTileCanvasInput>
  sliceTool: boolean
  sliceInput: ReturnType<typeof createSliceCanvasInput>
  layerMoveInput: ReturnType<typeof createLayerMoveCanvasInput>
  lineConnectionActive: (event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>) => boolean
  lineAnchor: {
    x: number
    y: number
  } | null
  lineConnectionInput: ReturnType<typeof createLineConnectionCanvasInput>
  selectionBeginInput: ReturnType<typeof createSelectionBeginCanvasInput>
  strokeInput: ReturnType<typeof createStrokeCanvasInput>
  freeTileEditInput: ReturnType<typeof createFreeTileEditCanvasInput>
  fillInput: ReturnType<typeof createFillCanvasInput>
  tileInput: ReturnType<typeof createTileCanvasInput>
  startRaster: ReturnType<typeof createCanvasRasterStart>
}

export function createCanvasPointerDown(ports: Ports) {
  return (event: React.PointerEvent<HTMLCanvasElement>): void => {
    const {
      magicGestureRef,
      liveInputSession,
      pressureAdapterRef,
      sameRgbaColor,
      zoomPreviewStartRef,
      finishZoomPreview,
      inputRef,
      navigationInput,
      selectionInput,
      quickToolActive,
      selectionPivotHitAt,
      symmetryAxisHitAt,
      symmetryDragRef,
      localPoint,
      localContinuousPointAt,
      activeLayer,
      modifierActive,
      updateCursor,
      startSampling,
      selectionHit,
      radialGradientCenterModifierActive,
      quickMoveToolActive,
      brushLineConnectionHasPriority,
      textLayerAt,
      textInput,
      shapeInput,
      canvasResizeHit,
      canvasResizePreviewRef,
      boundsInput,
      groupSelectionActive,
      hasSelectedRasterLayer,
      selectionLayersEditable,
      tilemapSelectionCreationAllowed,
      tilemapEditSelectionAtPoint,
      freeTileInput,
      sliceTool,
      sliceInput,
      layerMoveInput,
      lineConnectionActive,
      lineAnchor,
      lineConnectionInput,
      selectionBeginInput,
      strokeInput,
      freeTileEditInput,
      fillInput,
      tileInput,
      startRaster
    } = ports

    magicGestureRef.current?.cancel()
    // Keyboard tool changes can land before React commits the next render.
    // Resolve the session at event time so the first pointer event sees them.
    let session = liveInputSession()
    const fillKind = session.fillKind ?? 'bucket'
    const gradientType = session.gradientType ?? 'linear'
    const brushInputs = activeBrushInputsForTool(session.tool, fillKind, session.brushImage, session.brushTexture)
    const activeBrushImage = brushInputs.imageBrush
    const activeBrushTexture = brushInputs.texture
    const activeBrushDither = activeBrushImage ? undefined : (session.brushDither ?? DEFAULT_BRUSH_DITHER_SETTINGS)
    const activeBrushPaintMode = activeBrushImage?.intrinsicSize ? session.brushPaintMode : 'paint'
    const proceduralAntialiasStrength =
      brushInputs.fillTextureEnabled && session.proceduralAntialias && activeBrushImage?.id.startsWith('procedural:') ? session.proceduralAntialiasStrength : 0
    const activeColor = (button = 0): RgbaColor =>
      session.tool === 'eraser' ? (button === 2 ? session.secondaryColor : TRANSPARENT) : button === 2 ? session.secondaryColor : session.primaryColor
    const brushPatternOrigin = (point: Point, size = session.brushSize, imageBrush = activeBrushImage): Point => {
      const anchor = brushStampAnchor(size, imageBrush)
      return { x: point.x - anchor.x, y: point.y - anchor.y }
    }
    const brushDynamicsAtEvent = (
      pointerEvent: Pick<React.PointerEvent<HTMLCanvasElement>, 'pointerId' | 'pointerType' | 'pressure' | 'buttons'>,
      speed = 0
    ): { size: number; opacityScale: number; gradientAmount: number | null; angle: number } => {
      const adapted = pressureAdapterRef.current.adapt(pointerEvent)
      const resolved = resolveBrushDynamics(
        session.brushDynamics,
        {
          pointerType: adapted.pointerType,
          pressure: adapted.pressure,
          speed,
          pressureAvailable: adapted.pressureAvailable,
          previousPressure: adapted.previousPressure
        },
        session.brushSize
      )
      const opacityScale = brushOpacityScale(resolved.opacityScale, session.brushOpacity)
      return activeBrushImage?.intrinsicSize ? { ...resolved, size: session.brushSize, opacityScale } : { ...resolved, opacityScale }
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
    // View-only navigation belongs to the pointed canvas. Activating another
    // document here refreshes every editor panel before the first pan frame.
    if (event.button === 1) {
      beginCanvasToolGesture(event.pointerId)
      navigationInput.beginPan({ event, playbackNavigationTool: null })
      return
    }
    if (state.activeId !== session.document.id) {
      state.setActive(session.document.id)
      return
    }
    const playbackNavigationTool = session.animationPlaying ? playbackCanvasNavigationTool(session.tool) : null
    const preflightSession = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id) ?? session
    const preflightGroupSelected = preflightSession.selectedGroupIds.length > 0 || Boolean(preflightSession.selectedGroupId)
    const preflightToolAllowed =
      Boolean(playbackNavigationTool) ||
      Boolean(inputRef.current.temporaryRightClickAction && (session.tool === 'move' || session.tool === 'hand' || session.tool === 'eyedropper')) ||
      preflightSession.tool === 'move' ||
      preflightSession.tool === 'hand' ||
      preflightSession.tool === 'zoom' ||
      preflightSession.tool === 'rotate'
    if (preflightGroupSelected && !preflightToolAllowed && event.button !== 1 && !(event.button === 0 && inputRef.current.spaceHeld)) {
      event.currentTarget.style.cursor = canvasCursors.unavailable
      event.preventDefault()
      return
    }
    beginCanvasToolGesture(event.pointerId)
    if (
      (event.button === 1 || (event.button === 0 && (inputRef.current.spaceHeld || playbackNavigationTool === 'hand'))) &&
      navigationInput.beginPan({ event, playbackNavigationTool })
    )
      return
    if (playbackNavigationTool === 'hand') return
    // Resolve the live free-transform session before any auxiliary canvas
    // interaction (such as symmetry-axis dragging) can claim the pointer.
    // Corner handles reshape the frame; the selected content itself remains
    // movable. Middle-button/space panning has already returned above.
    const currentInteractionSession = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id) ?? session
    const liveGroupSelectionActive = currentInteractionSession.selectedGroupIds.length > 0 || Boolean(currentInteractionSession.selectedGroupId)
    const liveGroupToolAllowed =
      Boolean(inputRef.current.temporaryRightClickAction && (session.tool === 'move' || session.tool === 'hand' || session.tool === 'eyedropper')) ||
      currentInteractionSession.tool === 'move' ||
      currentInteractionSession.tool === 'hand' ||
      currentInteractionSession.tool === 'zoom' ||
      currentInteractionSession.tool === 'rotate'
    // Group selection is a document-level move target, not a paint target.
    // Block pixel-edit/selection gestures before they can create any drag or
    // pixel edit state; viewport navigation remains available above.
    if (liveGroupSelectionActive && !liveGroupToolAllowed) {
      event.currentTarget.style.cursor = canvasCursors.unavailable
      event.preventDefault()
      return
    }
    const freeTransformActive = currentInteractionSession.freeTransformActive === true
    if (freeTransformActive && selectionInput.routeFreeTransform({ freeTransformActive, event })) return
    const pivotSamplingHeld = paletteSamplingShortcutActive() || quickToolActive('eyedropper') || (session.tool === 'rotate' && event.altKey)
    const viewNavigationToolActive = isCanvasViewNavigationTool(session.tool)
    if (
      event.button === 0 &&
      !viewNavigationToolActive &&
      !inputRef.current.temporaryRightClickAction &&
      !event.shiftKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !pivotSamplingHeld &&
      !freeTransformActive &&
      selectionPivotHitAt(event.clientX, event.clientY) &&
      selectionInput.beginPivot({ event, viewNavigationToolActive, pivotSamplingHeld, freeTransformActive, session })
    )
      return
    const symmetryHit = event.button === 0 && !viewNavigationToolActive && !inputRef.current.temporaryRightClickAction ? symmetryAxisHitAt(event.clientX, event.clientY, event.ctrlKey) : null
    if (symmetryHit) {
      symmetryDragRef.current = { axis: symmetryHit, pointerId: event.pointerId, center: { ...session.symmetryCenter }, previewFrame: null }
      event.currentTarget.setPointerCapture(event.pointerId)
      event.currentTarget.style.cursor = canvasCursors.move
      event.preventDefault()
      return
    }
    // A free-transform frame may extend beyond the document after a corner
    // drag. Keep the interaction alive there by falling back to continuous
    // document coordinates; regular tools retain the clipped integer path.
    const point = localPoint(event) ?? (freeTransformActive || viewNavigationToolActive ? localContinuousPointAt(event.clientX, event.clientY) : null)
    if (!point) return
    const modifierSizingActive =
      !inputRef.current.drag &&
      (activeLayer.kind !== 'tilemap' || session.tilemapMode !== 'paint') &&
      (activeLayer.kind !== 'free-tile' || session.freeTileMode !== 'paint') &&
      modifierActive(event.nativeEvent, 'brushSizeAdjust') &&
      (session.tool === 'pencil' ||
        session.tool === 'line' ||
        session.tool === 'airbrush' ||
        session.tool === 'eraser' ||
        session.tool === 'smooth' ||
        (session.tool === 'selection' && session.selectionKind === 'brush') ||
        session.tool === 'liquify')
    // Modifier sizing has no cursor hit-test or composited color sample to
    // resolve. Avoid updateCursor's layer-tree sampling on every mouse move.
    if (!modifierSizingActive) updateCursor(event)
    event.currentTarget.setPointerCapture(event.pointerId)
    const { sampleAtPoint } = startSampling({ event, point, readSession: () => session, state })

    const paletteSamplingHeld = paletteSamplingShortcutActive()
    if (paletteSamplingShortcutStartsPrimarySample(paletteSamplingHeld, event.button)) {
      sampleAtPoint()
      return
    }
    const selectionPriorityHit = event.button === 0 && session.selection ? selectionHit(event) : 'outside'
    const addingToSelection = Boolean(session.selection && modifierActive(event.nativeEvent, 'addToSelection'))
    const temporaryMove =
      !freeTransformActive &&
      event.button === 0 &&
      !radialGradientCenterModifierActive(session, event.nativeEvent) &&
      quickMoveToolActive() &&
      !brushLineConnectionHasPriority(event.nativeEvent) &&
      temporaryMoveForCanvasInteractionAllowed(session.tool, session.moveKind, selectionPriorityHit, addingToSelection, session.selectionKind)
    // Tilemap paint mode owns the canvas press regardless of the global pixel
    // tool. Resolve the tileset owner before any paint-mode branch uses the
    // active layer, otherwise a stale pencil/selection tool snapshot can keep
    // drawing on the previously selected layer.
    if (!temporaryMove && (event.button === 0 || event.button === 2) && session.tilemapMode === 'paint') {
      const selectedTilesetOwnerId = session.selectedTilesetId
        ? session.document.layers.find((layer) => layer.kind === 'tilemap' && layer.tilemapTilesetId === session.selectedTilesetId)?.id
        : undefined
      state.activateTilemapLayerForDrawing(selectedTilesetOwnerId)
      session = liveInputSession()
    }
    const selectedTextBox = selectedTextBoxForSession(session)
    const textBoxHit = event.button === 0 && selectedTextBox ? selectionHit(event) : 'outside'
    const textCopyTarget = !temporaryMove && session.tool === 'text' && event.button === 0 && event.altKey ? textLayerAt(point) : null
    if (
      !temporaryMove &&
      !textCopyTarget &&
      session.tool === 'text' &&
      selectedTextBox &&
      textBoxHit in resizeCursors &&
      textInput.beginTextResize({ temporaryMove, textCopyTarget, session, selectedTextBox, textBoxHit, state, point, event })
    )
      return
    if (
      !temporaryMove &&
      !textCopyTarget &&
      session.tool === 'text' &&
      selectedTextBox &&
      textBoxHit === 'inside' &&
      textInput.beginTextMove({ temporaryMove, textCopyTarget, session, selectedTextBox, textBoxHit, state, point, event })
    )
      return
    const activePolygon = inputRef.current.drag
    if (
      session.tool === 'selection' &&
      activePolygon?.kind === 'polygon-lasso' &&
      (event.button === 0 || event.button === 2) &&
      selectionInput.extendPolygonLasso({ session, activePolygon, event, point })
    )
      return
    if (
      session.tool === 'shape' &&
      activePolygon?.kind === 'polygon-shape' &&
      (event.button === 0 || event.button === 2) &&
      shapeInput.extendPolygonShape({ session, activePolygon, event, point })
    )
      return
    if (
      session.tool === 'line' &&
      session.lineKind === 'curve' &&
      activePolygon?.kind === 'curve-shape' &&
      activePolygon.curvePhase === 'anchors' &&
      (event.button === 0 || event.button === 2) &&
      shapeInput.extendCurve({ session, activePolygon, event })
    )
      return
    const resizeEdge = canvasResizeHit(event)
    const activeResizePreview = canvasResizePreviewRef.current
    if (activeResizePreview && boundsInput.beginBounds({ activeResizePreview, event, resizeEdge, point })) return
    const eyedropperHeld = paletteSamplingHeld || quickToolActive('eyedropper') || (session.tool === 'rotate' && event.altKey)
    const focusesRasterLayer =
      !groupSelectionActive &&
      event.button === 0 &&
      session.tool !== 'hand' &&
      session.tool !== 'zoom' &&
      session.tool !== 'move' &&
      session.tool !== 'eyedropper' &&
      session.tool !== 'selection' &&
      !eyedropperHeld &&
      !temporaryMove &&
      !session.activeLayerMaskId &&
      (session.selectedGroupIds.length > 0 || session.selectedLayerIds.length > 1)
    const hasRasterFocus = hasSelectedRasterLayer || focusesRasterLayer || (session.tool === 'selection' && selectionLayersEditable)
    if (
      (activeLayer.kind !== 'tilemap' || session.tilemapMode !== 'paint') &&
      (activeLayer.kind !== 'free-tile' || session.freeTileMode !== 'paint') &&
      modifierActive(event.nativeEvent, 'brushSizeAdjust') &&
      (session.tool === 'pencil' ||
        session.tool === 'line' ||
        session.tool === 'airbrush' ||
        session.tool === 'eraser' ||
        session.tool === 'smooth' ||
        (session.tool === 'selection' && session.selectionKind === 'brush') ||
        session.tool === 'liquify') &&
      (session.tool === 'smooth' ||
        (session.tool === 'selection' && session.selectionKind === 'brush') ||
        session.tool === 'airbrush' ||
        session.tool === 'liquify' ||
        activeLayer.kind === 'tilemap' ||
        !activeBrushImage?.intrinsicSize) &&
      event.button === 0
    ) {
      inputRef.current.sampling = false
      inputRef.current.drag = {
        kind: 'brush-size',
        start: point,
        last: point,
        startClient: { x: event.clientX, y: event.clientY },
        startBrushSize: session.tool === 'airbrush' ? session.airbrushScatterRadius : session.tool === 'liquify' ? session.liquifyRadius : session.brushSize
      }
      event.currentTarget.style.cursor = canvasToolCursor('pencil', session.primaryColor)
      return
    }
    // A held quick-tool shortcut can project a different tool onto the
    // session object. Free transform must keep selection semantics regardless
    // of that projection so a corner click cannot fall through to layer move.
    const selectionTool = freeTransformActive || session.tool === 'selection'
    const selectionMode = (): SelectionMode =>
      event.button === 2 ? 'subtract' : modifierActive(event.nativeEvent, 'addToSelection') ? 'add' : session.selectionMode
    const editableLayer = activePaintLayer(session)
    const canEditLayer =
      hasRasterFocus && editableLayer.kind !== 'adjustment' && isLayerEffectivelyVisible(session.document, editableLayer) && !isLayerEffectivelyLocked(session.document, editableLayer)
    const canEditSelectionLayers = selectionTool && (selectionLayersEditable || tilemapSelectionCreationAllowed)
    const tilemapPixelEditSelection = tilemapEditSelectionAtPoint(point, session, true)
    const pixelEditSelection = tilemapPixelEditSelection === undefined ? session.selection : tilemapPixelEditSelection
    const tilemapPixelEditBlocked = tilemapPixelEditSelection === null
    const tilemapEditDragState = tilemapPixelEditSelection ? { tilemapEditSelection: tilemapPixelEditSelection } : {}
    const movableActiveLayer = getActiveLayer(session.document)
    const canMoveActiveLayer =
      session.selectedGroupIds.length === 0 &&
      session.selectedLayerIds.includes(movableActiveLayer.id) &&
      isLayerEffectivelyVisible(session.document, movableActiveLayer) &&
      !isLayerEffectivelyLocked(session.document, movableActiveLayer)
    const copyLayerHeld = modifierActive(event.nativeEvent, 'copyLayerOnDrag')
    const prepareFreeTileSourceEdit = (): {
      source: NonNullable<ReturnType<typeof freeTileSourceForId>>
      instance: FreeTileInstance
      placementEdit: ReturnType<typeof state.beginFreeTilePlacement>
      sourceEdit: FreeTileSourceEditRaster
      selection: SelectionMask | null
      sourceRegion: SelectionRect
    } | null => {
      if (editableLayer.kind !== 'free-tile' || session.freeTileMode !== 'edit') return null
      let activeTarget = activeFreeTileCelTarget(session.document)
      // In edit mode each animation cel owns its own instance container. If
      // the pointer is over an instance belonging to another free-tile layer,
      // resolve that cel instead of forcing all edits into the active layer.
      const crossLayerTarget =
        session.document.layers
          .filter((candidate) => candidate.kind === 'free-tile' && candidate.id !== activeTarget?.layer.id)
          .map((candidate) => freeTileCelTargetAt(session.document, candidate.id, ensureAnimationDocument(session.document).activeFrameId))
          .find((candidate) => candidate && freeTileInstanceAtDocumentPoint(candidate, point.x, point.y)) ?? null
      let target = crossLayerTarget ?? activeTarget
      if (!target) {
        // A newly selected animation frame may not have a cel yet. The store
        // creates its free-tile cel lazily so every frame keeps free-tile
        // semantics while sharing the layer's source tileset.
        if (!state.beginFreeTilePlacement()) return null
        activeTarget = activeFreeTileCelTarget(session.document)
        target = activeTarget
      }
      if (!target) return null
      const hitInstance = freeTileInstanceAtDocumentPoint(target, point.x, point.y)
      const selectedSource =
        (hitInstance ? freeTileSourceForInstance(target.sources, hitInstance) : null) ??
        freeTileSourceForId(session.document, target.layer, session.selectedTilesetId) ??
        target.sources[0] ??
        null
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
        instance = {
          id: createId('free-tile-instance'),
          sourceId: selectedSource.id,
          x: origin.x,
          y: origin.y,
          opacity: selectedSource.opacity,
          blendMode: selectedSource.blendMode
        }
        placementEdit.after.instances.push(instance)
        placementEdit.dirtyRect = freeTileInstanceBounds(instance, target.sources, target.surface.offsetX, target.surface.offsetY)
        if (!state.previewFreeTilePlacement(placementEdit)) return null
      }
      const bounds = freeTileInstanceBounds(instance, target.sources, target.surface.offsetX, target.surface.offsetY)
      const sourceEdit = createFreeTileSourceEditRaster(session.document, selectedSource, bounds, point, instance, session.tool === 'pencil' || session.tool === 'eraser' || session.tool === 'airbrush')
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
    if (
      !freeTransformActive &&
      (session.tool === 'move' || temporaryMove) &&
      event.button === 0 &&
      movableActiveLayer.kind === 'free-tile' &&
      shouldUseFreeTileInstanceMove(movableActiveLayer.id, session.freeTileInstanceLayerId) &&
      freeTileInput.beginInstanceMove({ freeTransformActive, session, temporaryMove, event, movableActiveLayer, point, canMoveActiveLayer, state })
    )
      return
    if (
      session.tool === 'text' &&
      event.button === 0 &&
      !temporaryMove &&
      !textCopyTarget &&
      textInput.beginText({ session, event, temporaryMove, textCopyTarget, point, state })
    )
      return
    if (editableLayer.kind && !isToolAvailableForSession(session, temporaryMove ? 'move' : session.tool) && !canEditSelectionLayers && !eyedropperHeld) return
    if (!temporaryMove && selectionTool && (event.button === 0 || event.button === 2) && !canEditSelectionLayers && !eyedropperHeld) return
    if (
      !freeTransformActive &&
      !temporaryMove &&
      sliceTool && !inputRef.current.temporaryRightClickAction &&
      event.button === 0 &&
      sliceInput.beginSlice({ freeTransformActive, temporaryMove, event, session, point, state })
    )
      return
    if (
      !freeTransformActive &&
      (session.tool === 'move' || temporaryMove || textCopyTarget) &&
      event.button === 0 &&
      layerMoveInput.beginLayerMove({
        freeTransformActive,
        session,
        temporaryMove,
        textCopyTarget,
        event,
        point,
        state,
        canMoveActiveLayer,
        movableActiveLayer,
        eyedropperHeld,
        sampleAtPoint,
        copyLayerHeld
      })
    )
      return
    if (session.tool === 'rotate' && eyedropperHeld && (event.button === 0 || event.button === 2)) {
      sampleAtPoint()
      return
    }
    if (session.tool === 'rotate' && event.button === 0 && navigationInput.beginRotation({ session, event, point })) return
    if (
      lineConnectionActive(event.nativeEvent) &&
      hasRasterFocus &&
      (editableLayer.kind !== 'tilemap' || session.tilemapMode !== 'paint') &&
      (editableLayer.kind !== 'free-tile' || session.freeTileMode !== 'paint') &&
      (session.tool === 'pencil' || session.tool === 'eraser') &&
      lineAnchor &&
      event.button === 0 &&
      lineConnectionInput.beginLineConnection({
        event,
        hasRasterFocus,
        editableLayer,
        session,
        canEditLayer,
        tilemapPixelEditBlocked,
        point,
        brushDynamicsAtEvent,
        activeColor,
        brushGradientAt,
        prepareFreeTileSourceEdit,
        activeBrushTexture,
        activeBrushImage,
        proceduralAntialiasStrength,
        activeBrushPaintMode,
        brushPatternOrigin,
        activeBrushDither,
        state,
        pixelEditSelection
      })
    )
      return
    if (
      selectionTool &&
      (event.button === 0 || event.button === 2) &&
      selectionBeginInput.beginSelection({ selectionTool, event, selectionMode, session, eyedropperHeld, state, point, sampleAtPoint, editableLayer })
    )
      return
    if (eyedropperHeld && (event.button === 0 || event.button === 2)) {
      sampleAtPoint()
      return
    }
    if (shouldStartCanvasPan(session.tool) && navigationInput.beginHandPan({ session, event })) return
    if (session.tool === 'zoom' && navigationInput.beginZoom({ session, point, event })) return
    if (session.tool === 'magic-eraser') {
      if (event.button === 0 && canEditLayer && !tilemapPixelEditBlocked) fillInput.beginMagicEraser(point)
      return
    }
    if (session.tool === 'smooth' && strokeInput.beginSmooth({ session, event, hasRasterFocus, canEditLayer, tilemapPixelEditBlocked, editableLayer, point }))
      return
    if (
      session.tool === 'liquify' &&
      (event.button === 0 || event.button === 2) &&
      strokeInput.beginLiquify({ session, event, hasRasterFocus, canEditLayer, tilemapPixelEditBlocked, editableLayer, state })
    )
      return
    if (
      editableLayer.kind === 'free-tile' &&
      session.freeTileMode === 'edit' &&
      (session.tool === 'fill' || session.tool === 'shape' || session.tool === 'line' || session.tool === 'airbrush') &&
      freeTileEditInput.beginFreeTileEdit({
        editableLayer,
        session,
        hasRasterFocus,
        canEditLayer,
        prepareFreeTileSourceEdit,
        point,
        fillKind,
        event,
        gradientType,
        activeColor,
        activeBrushImage,
        activeBrushTexture,
        proceduralAntialiasStrength,
        activeBrushPaintMode,
        state
      })
    )
      return
    if (
      session.tool === 'fill' &&
      fillInput.beginFill({
        session,
        canEditLayer,
        tilemapPixelEditBlocked,
        point,
        fillKind,
        event,
        pixelEditSelection,
        gradientType,
        activeColor,
        editableLayer,
        tilemapEditDragState,
        activeBrushImage,
        activeBrushTexture,
        proceduralAntialiasStrength,
        activeBrushPaintMode,
        state
      })
    )
      return
    if (session.tool === 'eyedropper') {
      sampleAtPoint(false)
      return
    }
    if (
      session.tool === 'selection' &&
      (session.selectionKind === 'rectangle' || session.selectionKind === 'ellipse') &&
      (event.button === 0 || event.button === 2) &&
      selectionInput.beginMarquee({ session, event, selectionMode, point, state })
    )
      return
    if (session.tool === 'shape' && shapeInput.beginShape({ session, canEditLayer, tilemapPixelEditBlocked, event, activeColor, point, tilemapEditDragState }))
      return
    if (
      session.tool === 'line' &&
      (event.button === 0 || event.button === 2) &&
      shapeInput.beginLine({ session, event, canEditLayer, tilemapPixelEditBlocked, point, activeColor, tilemapEditDragState })
    )
      return
    if (
      session.tool === 'airbrush' &&
      strokeInput.beginAirbrush({
        session,
        hasRasterFocus,
        canEditLayer,
        tilemapPixelEditBlocked,
        event,
        point,
        editableLayer,
        activeColor,
        tilemapEditDragState
      })
    )
      return
    if (session.tool !== 'pencil' && session.tool !== 'eraser') return
    if (!hasRasterFocus) return
    if (!canEditLayer) return
    const freeTileTarget = editableLayer.kind === 'free-tile' ? activeFreeTileCelTarget(session.document) : null
    if (
      freeTileTarget &&
      freeTileInput.beginFreeTile({
        freeTileTarget,
        session,
        point,
        state,
        prepareFreeTileSourceEdit,
        event,
        brushPatternOrigin,
        brushDynamicsAtEvent,
        activeColor,
        brushGradientAt,
        activeBrushTexture,
        activeBrushImage,
        proceduralAntialiasStrength,
        activeBrushPaintMode,
        activeBrushDither
      })
    )
      return
    const tilemapTarget = editableLayer.kind === 'tilemap' ? activeTilemapCelTarget(session.document) : null
    if (tilemapTarget && session.tilemapMode === 'paint' && tileInput.beginTile({ tilemapTarget, session, point, event })) return
    measureRuntimeDiagnostic('canvas.stroke.initialize', () => startRaster({
      tilemapPixelEditBlocked,
      session,
      brushDynamicsAtEvent,
      event,
      point,
      activeBrushImage,
      editableLayer,
      brushPatternOrigin,
      activeColor,
      brushGradientAt,
      pixelEditSelection,
      activeBrushTexture,
      proceduralAntialiasStrength,
      activeBrushPaintMode,
      activeBrushDither,
      tilemapEditDragState
    }), () => ({ documentId: session.document.id, layerId: editableLayer.id, tool: session.tool }))
  }
}
