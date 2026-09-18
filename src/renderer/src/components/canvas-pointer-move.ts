import { createCanvasSymmetryMove } from './canvas-symmetry-move'
import { createCanvasAutoPan } from './canvas-auto-pan'
import { createCanvasQuickSamplingMove } from './canvas-quick-sampling-move'
import { createNavigationCanvasInput } from './canvas-input-navigation'
import { createSelectionCanvasInput } from './canvas-input-selection'
import { createTextCanvasInput } from './canvas-input-text'
import { createShapeCanvasInput } from './canvas-input-shape'
import { createBoundsCanvasInput } from './canvas-input-bounds'
import { createFreeTileCanvasInput } from './canvas-input-free-tile'
import { createSliceCanvasInput } from './canvas-input-slice'
import { createLayerMoveCanvasInput } from './canvas-input-layer-move'
import { createStrokeCanvasInput } from './canvas-input-stroke'
import { createFreeTileEditCanvasInput } from './canvas-input-free-tile-edit'
import { createFillCanvasInput } from './canvas-input-fill'
import { createTileCanvasInput } from './canvas-input-tile'
import { createSamplingCanvasInput } from './canvas-input-sampling'
import { createTransformCanvasInput } from './canvas-input-transform'
import type { RasterLayer } from '@shared/types-layer'
import type { RgbaColor } from '@shared/types-color'
import { TRANSPARENT } from '@/core/raster'
import { DEFAULT_BRUSH_DITHER_SETTINGS } from '@/core/gradient-color'
import { useWorkspace, type DocumentSession } from '@/store/workspace'
import { canvasClientDeltaForInterfaceScale } from '@/core/canvas-interface-scale'
import { canvasColorSamplingActiveFor, canvasColorSamplingIntentActive, routeCanvasColorSampling } from '@/core/canvas-color-sampling'
import {
  CanvasInputState,
  PointerPressureAdapter,
  coalescedPointerClientPoints,
  isCanvasViewNavigationDrag,
  isCanvasViewNavigationTool,
  type CanvasPoint as Point
} from '@/core/canvas-input'
import { canvasCursors, canvasToolCursor, selectionCreationCursor } from '@/core/canvas-visuals'
import { isPressurePointerType, resolveBrushDynamics } from '@/core/pressure'
import { activeBrushInputsForTool } from '@/core/brushes'
import { syncHeldShortcutModifiers } from '@/components/useQuickToolShortcut'
import { SymmetryDragState } from './canvas-stage-helpers'
interface Ports {
  inputRef: import('react').RefObject<CanvasInputState>
  navigationInput: ReturnType<typeof createNavigationCanvasInput>
  liveInputSession: () => DocumentSession
  canvasRef: import('react').RefObject<HTMLCanvasElement | null>
  tabletPreferences: import('@/core/file-preferences').TabletPreferences
  pressureAdapterRef: import('react').RefObject<PointerPressureAdapter>
  updateRotationIndicator: (rotation: number, visible: boolean) => void
  liveViewRef: import('react').RefObject<import('@shared/types-view').ViewState>
  symmetryDragRef: import('react').RefObject<SymmetryDragState | null>
  cancelActiveCanvasInteraction: () => void
  updateCursor: (event: React.PointerEvent<HTMLCanvasElement>) => void
  moveSymmetry: ReturnType<typeof createCanvasSymmetryMove>
  autoPanSelection: ReturnType<typeof createCanvasAutoPan>
  lineConnectionPreviewActive: (event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>) => boolean
  localPoint: (event: React.PointerEvent<HTMLCanvasElement>, allowOutsideCopies?: boolean) => Point | null
  repeatedDocumentPointsAt: (clientX: number, clientY: number, continuous?: boolean, allowOutsideCopies?: boolean) => { local: Point; repeated: Point } | null
  localContinuousPointAt: (clientX: number, clientY: number) => Point | null
  selectionCrosshair: boolean
  activeLayer: RasterLayer
  modifierActive: (event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>, id: import('@/core/shortcuts').ShortcutId) => boolean
  interfaceScale: 0.75 | 1 | 1.5 | 2
  brushPreviewOverlaySupported: (currentSession: DocumentSession) => boolean
  scheduleBrushPreviewOverlay: () => void
  scheduleDraw: () => void
  moveQuickSampling: ReturnType<typeof createCanvasQuickSamplingMove>
  selectionInput: ReturnType<typeof createSelectionCanvasInput>
  fillInput: ReturnType<typeof createFillCanvasInput>
  strokeInput: ReturnType<typeof createStrokeCanvasInput>
  samplingInput: ReturnType<typeof createSamplingCanvasInput>
  boundsInput: ReturnType<typeof createBoundsCanvasInput>
  freeTileInput: ReturnType<typeof createFreeTileCanvasInput>
  layerMoveInput: ReturnType<typeof createLayerMoveCanvasInput>
  freeTileEditInput: ReturnType<typeof createFreeTileEditCanvasInput>
  tileInput: ReturnType<typeof createTileCanvasInput>
  shapeInput: ReturnType<typeof createShapeCanvasInput>
  textInput: ReturnType<typeof createTextCanvasInput>
  sliceInput: ReturnType<typeof createSliceCanvasInput>
  transformInput: ReturnType<typeof createTransformCanvasInput>
}

export function createCanvasPointerMove(ports: Ports) {
  return (event: React.PointerEvent<HTMLCanvasElement>): void => {
    const {
      inputRef,
      navigationInput,
      liveInputSession,
      canvasRef,
      tabletPreferences,
      pressureAdapterRef,
      updateRotationIndicator,
      liveViewRef,
      symmetryDragRef,
      cancelActiveCanvasInteraction,
      updateCursor,
      moveSymmetry,
      autoPanSelection,
      lineConnectionPreviewActive,
      localPoint,
      localContinuousPointAt,
      selectionCrosshair,
      activeLayer,
      modifierActive,
      interfaceScale,
      brushPreviewOverlaySupported,
      scheduleBrushPreviewOverlay,
      scheduleDraw,
      moveQuickSampling,
      selectionInput,
      fillInput,
      strokeInput,
      samplingInput,
      boundsInput,
      freeTileInput,
      layerMoveInput,
      freeTileEditInput,
      tileInput,
      shapeInput,
      textInput,
      sliceInput,
      transformInput
    } = ports

    syncHeldShortcutModifiers(event.nativeEvent)
    // Navigation is independent from the active paint tool. Handle it before
    // constructing brush dynamics, coalesced pressure samples, or sampling
    // helpers; those calculations are useful for drawing but only add latency
    // to a space or middle-button pan (especially with a high-rate primary
    // mouse stream).
    const navigationDrag = inputRef.current.drag
    if (navigationDrag?.kind === 'pan' && navigationDrag.startPan && navigationDrag.startClient && navigationInput.movePan({ navigationDrag, event })) return
    const session = liveInputSession()
    const navigationShortcutActive =
      session.animationPlaying || event.ctrlKey || event.metaKey || inputRef.current.spaceHeld || isCanvasViewNavigationTool(session.tool)
    if (canvasColorSamplingIntentActive() && !canvasColorSamplingActiveFor(canvasRef.current) && !inputRef.current.drag && !navigationShortcutActive) {
      event.currentTarget.style.cursor = canvasCursors.eyedropper
      return
    }
    const brushInputs = activeBrushInputsForTool(session.tool, session.fillKind ?? 'bucket', session.brushImage, session.brushTexture)
    const activeBrushImage = brushInputs.imageBrush
    const activeBrushTexture = brushInputs.texture
    const activeBrushDither = activeBrushImage ? undefined : (session.brushDither ?? DEFAULT_BRUSH_DITHER_SETTINGS)
    const activeBrushPaintMode = activeBrushImage?.intrinsicSize ? session.brushPaintMode : 'paint'
    const proceduralAntialiasStrength =
      brushInputs.fillTextureEnabled && session.proceduralAntialias && activeBrushImage?.id.startsWith('procedural:') ? session.proceduralAntialiasStrength : 0
    const activeColor = (button = 0): RgbaColor =>
      session.tool === 'eraser' ? (button === 2 ? session.secondaryColor : TRANSPARENT) : button === 2 ? session.secondaryColor : session.primaryColor
    const brushDynamicsAt = (
      pointerType: string | undefined,
      pressure: number | undefined,
      speed = 0,
      pressureAvailable?: boolean,
      previousPressure?: number
    ): { size: number; opacityScale: number; gradientAmount: number | null; angle: number } => {
      const resolved = resolveBrushDynamics(
        session.brushDynamics,
        {
          pointerType,
          pressure,
          speed,
          pressureAvailable: pressureAvailable && (!isPressurePointerType(pointerType) || tabletPreferences.pressureEnabled),
          previousPressure
        },
        session.brushSize
      )
      return activeBrushImage?.intrinsicSize ? { ...resolved, size: session.brushSize } : resolved
    }
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
      updateRotationIndicator(liveViewRef.current.rotation, false)
      inputRef.current.sampling = true
      event.currentTarget.style.cursor = canvasCursors.eyedropper
      return
    }
    const currentInteractionSession = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id) ?? session
    const freeTransformActive = currentInteractionSession.freeTransformActive === true
    const liveGroupSelectionActive = currentInteractionSession.selectedGroupIds.length > 0 || Boolean(currentInteractionSession.selectedGroupId)
    const liveGroupToolAllowed =
      currentInteractionSession.tool === 'move' ||
      currentInteractionSession.tool === 'hand' ||
      currentInteractionSession.tool === 'zoom' ||
      currentInteractionSession.tool === 'rotate'
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
    if (moveSymmetry({ event, session })) return

    autoPanSelection({ event })

    updateCursor(event)
    inputRef.current.shiftLinePreview = lineConnectionPreviewActive(event.nativeEvent)
    const repeatMode = liveViewRef.current.tileRepeatMode ?? 'off'
    const repeatedMarquee = inputRef.current.drag?.kind === 'marquee' && !inputRef.current.drag.quickSelectCell && repeatMode !== 'off'
    const repeatedLasso = inputRef.current.drag?.kind === 'lasso' && repeatMode !== 'off'
    const repeatedSelectionMove = (inputRef.current.drag?.kind === 'move-content' || inputRef.current.drag?.kind === 'move-selection') && repeatMode !== 'off'
    const allowOutsideCopies = Boolean(
      (inputRef.current.drag?.kind === 'draw' || inputRef.current.drag?.kind === 'tile-draw' || repeatedMarquee || repeatedLasso || repeatedSelectionMove) &&
        repeatMode !== 'off'
    )
    const textBoxInteraction = inputRef.current.drag?.kind === 'create-text-box' || inputRef.current.drag?.kind === 'transform-text-box'
    const point =
      localPoint(event, allowOutsideCopies) ??
      (freeTransformActive || activeDrag?.freeTransform === true || textBoxInteraction ? localContinuousPointAt(event.clientX, event.clientY) : null)
    if (point) inputRef.current.updatePointer({ point, clientX: event.clientX, clientY: event.clientY, ctrlKey: event.ctrlKey, altKey: event.altKey })
    if (inputRef.current.drag?.kind === 'marquee' || inputRef.current.drag?.kind === 'lasso' || inputRef.current.drag?.kind === 'polygon-lasso') {
      event.currentTarget.style.cursor = selectionCreationCursor(selectionCrosshair, true, true)
    }
    const modifierSizing =
      (activeLayer.kind !== 'tilemap' || session.tilemapMode !== 'paint') &&
      (activeLayer.kind !== 'free-tile' || session.freeTileMode !== 'paint') &&
      modifierActive(event.nativeEvent, 'brushSizeAdjust') &&
      (session.tool === 'pencil' ||
        session.tool === 'line' ||
        session.tool === 'airbrush' ||
        session.tool === 'eraser' ||
        session.tool === 'smooth' ||
        session.tool === 'liquify')
    if (modifierSizing && !inputRef.current.drag) {
      if (!inputRef.current.modifierBrushSize)
        inputRef.current.modifierBrushSize = {
          x: event.clientX,
          y: event.clientY,
          size: session.tool === 'airbrush' ? session.airbrushScatterRadius : session.tool === 'liquify' ? session.liquifyRadius : session.brushSize
        }
      else {
        const delta = canvasClientDeltaForInterfaceScale(event.clientX - inputRef.current.modifierBrushSize.x, interfaceScale)
        const nextSize = inputRef.current.modifierBrushSize.size + Math.round(delta / 4)
        if (session.tool === 'airbrush') useWorkspace.getState().setAirbrushScatterRadius(nextSize)
        else if (session.tool === 'liquify') useWorkspace.getState().setLiquifyRadius(nextSize)
        else useWorkspace.getState().setBrushSize(nextSize)
      }
      // The first move can initialize the modifier state after the cursor
      // update above. The brush overlay is enough while sizing; a full canvas
      // composite is only needed when the modifier is released.
      event.currentTarget.style.cursor = canvasToolCursor('pencil', session.primaryColor)
      if (brushPreviewOverlaySupported(session)) scheduleBrushPreviewOverlay()
      else scheduleDraw()
      return
    }
    if (!modifierSizing) inputRef.current.modifierBrushSize = null
    if (!point) return
    const drag = inputRef.current.drag
    if (moveQuickSampling({ drag, session, event })) return
    if (!drag) {
      if (brushPreviewOverlaySupported(session)) scheduleBrushPreviewOverlay()
      else scheduleDraw()
      return
    }
    const state = useWorkspace.getState()
    const previousPoint = drag.last
    if (drag.kind === 'brush-size' && drag.startClient) {
      drag.last = point
      const delta = canvasClientDeltaForInterfaceScale(event.clientX - drag.startClient.x, interfaceScale)
      const nextSize =
        (drag.startBrushSize ??
          (session.tool === 'airbrush' ? session.airbrushScatterRadius : session.tool === 'liquify' ? session.liquifyRadius : session.brushSize)) +
        Math.round(delta / 4)
      if (session.tool === 'airbrush') state.setAirbrushScatterRadius(nextSize)
      else if (session.tool === 'liquify') state.setLiquifyRadius(nextSize)
      else state.setBrushSize(nextSize)
      event.currentTarget.style.cursor = canvasCursors.ewResize
      return
    }
    if (drag.kind === 'move-selection-pivot' && drag.selectionPivotStart && selectionInput.movePivot({ drag, event })) return
    if (drag.kind === 'gradient' && fillInput.moveGradient({ drag, event, session, point })) return
    // Liquify uses continuous document coordinates in its own branch below.
    // Do not overwrite its previous point with the integer-snapped `point`.
    if (drag.kind !== 'liquify' && drag.kind !== 'smooth') drag.last = point
    if (drag.kind === 'smooth' && drag.edit && drag.smoothStroke && strokeInput.moveSmooth({ drag, session, point })) return
    if (drag.kind === 'sample-color' && samplingInput.moveSample({ drag, point, session, state, event })) return
    if (drag.kind === 'zoom-drag' && drag.startClient && navigationInput.moveZoom({ drag, session, event })) return
    if (
      drag.kind === 'rotate-view' &&
      drag.startAngle !== undefined &&
      drag.startRotation !== undefined &&
      navigationInput.moveRotation({ drag, event, state })
    )
      return
    if (drag.kind === 'canvas-resize' && drag.canvasPreview && drag.canvasEdge && boundsInput.moveBoundsResize({ drag, point })) return
    if (drag.kind === 'canvas-move' && drag.canvasPreview && boundsInput.moveBounds({ drag, point, event })) return
    if (
      drag.kind === 'free-tile-instance-move' &&
      drag.freeTilePlacementEdit &&
      drag.freeTileInstanceId &&
      freeTileInput.moveInstance({ drag, session, point, event, state })
    )
      return
    if (drag.kind === 'move-layer' && drag.layerId && drag.layerOffset && layerMoveInput.moveLayer({ drag, point, event, state, session })) return
    if (drag.kind === 'free-tile-draw' && drag.freeTilePlacementEdit && freeTileInput.moveFreeTileDraw({ drag, session, previousPoint, pointerSamples, state }))
      return
    if (
      drag.kind === 'free-tile-edit' &&
      drag.edit &&
      drag.freeTileEditDocument &&
      drag.freeTileEditLayer &&
      drag.freeTileEditOrigin &&
      drag.freeTileSourceId &&
      drag.freeTileSourceBefore &&
      drag.freeTileEditSourceOffset &&
      freeTileEditInput.moveFreeTileEdit({
        drag,
        previousPoint,
        session,
        pointerSamples,
        brushDynamicsAt,
        event,
        activeColor,
        activeBrushTexture,
        activeBrushImage,
        proceduralAntialiasStrength,
        activeBrushPaintMode,
        activeBrushDither,
        state
      })
    )
      return
    if (drag.kind === 'tile-draw' && drag.tilemapEdit && drag.tilemapCellIndex !== undefined && tileInput.moveTile({ drag, session, pointerSamples })) return
    if (drag.kind === 'draw' && drag.edit && strokeInput.moveRaster({ drag, session, previousPoint, event, pointerSamples })) return
    if (drag.kind === 'airbrush' && strokeInput.moveAirbrush({ drag, point, session })) return
    if (drag.kind === 'liquify' && drag.edit && strokeInput.moveLiquify({ drag, event, session })) return
    if (drag.kind === 'shape' && shapeInput.moveShape({ drag, point, session })) return
    if (drag.kind === 'freeform-shape' && shapeInput.moveFreeform({ drag, point, session })) return
    if (drag.kind === 'polygon-shape' && shapeInput.movePolygonShape({ drag, point, session })) return
    if (drag.kind === 'line-shape' && shapeInput.moveLine({ drag, point, event })) return
    if (drag.kind === 'curve-shape' && shapeInput.moveCurve({ drag, point, session })) return
    if (drag.kind === 'marquee' && selectionInput.moveMarquee({ drag, event, repeatedMarquee, point })) return
    if (drag.kind === 'create-text-box' && textInput.moveTextCreation({ drag, event, point })) return
    if (drag.kind === 'create-slice' && sliceInput.moveSliceCreation({ drag, event, point, session })) return
    if (drag.kind === 'move-slice' && drag.sliceStart && sliceInput.moveSlice({ drag, event, point, session })) return
    if (drag.kind === 'resize-slice' && drag.sliceStart && drag.handle && sliceInput.moveSliceResize({ drag, point, session })) return
    if (drag.kind === 'magic-preview' && selectionInput.moveMagic({ drag, point, previousPoint })) return
    if (drag.kind === 'lasso' && selectionInput.moveLasso({ drag, event, point })) return
    if (drag.kind === 'polygon-lasso' && selectionInput.movePolygonLasso({ drag })) return
    if (drag.kind === 'move-content' && drag.selectionStart && drag.tilemapSelectionMoveSource && tileInput.moveTileSelection({ drag, event, point, session }))
      return
    if (drag.kind === 'move-selection' && drag.selectionStart && selectionInput.moveSelection({ drag, event, point, session })) return
    if (
      drag.kind === 'move-content' &&
      drag.freeTileInstanceSelectionMove &&
      drag.freeTilePlacementEdit &&
      drag.freeTileInstanceId &&
      drag.selectionStart &&
      freeTileInput.moveFreeTileSelection({ drag, session, event, point, state })
    )
      return
    if (
      drag.kind === 'move-content' &&
      drag.freeTransform &&
      drag.selectionStart &&
      drag.transformStartQuad &&
      transformInput.moveFreeTransform({ drag, event, point, session })
    )
      return
    if (drag.kind === 'move-content' && drag.selectionStart && transformInput.moveContent({ drag, event, point, session })) return
    if (drag.kind === 'transform-content' && drag.freeTransform && drag.selectionStart && drag.handle && transformInput.resizeFreeTransform({ drag, point }))
      return
    if (drag.kind === 'transform-content' && drag.selectionStart && drag.handle && transformInput.resizeContent({ drag, point, event })) return
    if (drag.kind === 'transform-text-box' && drag.transformStartTarget && textInput.moveTextTransform({ drag, event, point, session, state })) return
    if (drag.kind === 'shear-content' && drag.selectionStart && drag.shearHandle && transformInput.shearContent({ drag, point })) return
    if (drag.kind === 'rotate-content' && drag.selectionStart && transformInput.rotateContent({ drag, point, event })) return
  }
}
