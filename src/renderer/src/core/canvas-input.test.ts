import { describe, expect, it } from 'vitest'
import { BRUSH_SPEED_STOP_MS, CanvasInputState, PEN_COMPATIBLE_MOUSE_SUPPRESSION_MS, PointerPressureAdapter, SELECTION_CORNER_RESIZE_HIT_RADIUS, SELECTION_RESIZE_HIT_RADIUS, appendCanvasPathStep, appendPolygonLassoVertex, beginBrushSpeedTracking, beginTemporaryCenteredMarqueeResize, brushLineConnectionOverridesTemporaryMove, cachedSelectionTransformSource, canvasGestureForPreview, centerMarqueeBoundsAtCreationPoint, centeredShapeBounds, clampCanvasZoom, coalescedPointerClientPoints, constrainFreeTransformCornerToAspectRatio, constrainedTranslation, consumePendingCanvasGestureHistory, createCanvasPanDrag, createMarqueeResizeStart, createPolygonPathRasterCache, deferredSelectionCommitInvalidationRects, deferredSelectionPreviewMaterializationRequired, deferredSelectionPreviewOwner, drawingSizePreviewTargetForDrag, finalizeMarqueeSelection, floatingSelectionCopyMode, isCanvasViewNavigationDrag, isCanvasViewNavigationTool, isPendingCanvasPathGesture, isQuickSelectionSecondPress, layerMovePreviewActive, marqueePreviewTargetForDrag, marqueeSelectionCommit, normalizeCanvasWheelDelta, paletteSamplingShortcutStartsPrimarySample, playbackCanvasNavigationTool, polygonLassoClosedPathPoints, polygonLassoPreviewPoints, quickSelectCellDragBounds, quickSelectCellSelection, redoCanvasPathStep, registerPendingCanvasGestureHistory, resizeRotatedMarqueeBounds, resizeSelectionBounds, resizeTransformedSelectionBounds, resolveMarqueeModifierMode, restoreCanvasDragAfterPan, restoreTemporaryCenteredMarqueeResize, revertCancelledCanvasDragPixelChanges, rotationHandles, sampledForegroundColorToAdd, selectionFreeTransformContentHit, selectionFreeTransformHit, selectionGestureMoved, selectionHitStartsContentMove, selectionInteractionHit, selectionInteractionOverridesTemporaryMove, selectionMarqueeUsesConstraint, selectionMovePointerDelta, selectionOverlayFrameForDrag, selectionOverlayMaskForDrag, selectionPivotAfterResize, selectionPivotAtDragPoint, selectionPivotHit, selectionResizeHit, selectionRotationAngle, selectionRotationHit, selectionShearHit, selectionTransformedInteractionHit, selectionTransformDeferredPreviewEnabled, selectionTransformGeometrySource, selectionTransformModifiers, selectionTransformPreviewChanged, shapeBounds, shouldClosePolygonLasso, shouldRestartFloatingSelectionForCopy, shouldReuseFloatingSelectionSourceForCopy, shouldStartCanvasPan, shouldUseTemporaryMoveForCanvasInteraction, shouldUseTemporaryMoveTool, snapSelectionRotation, steppedCanvasZoom, temporaryMoveForCanvasInteractionAllowed, temporaryMoveSuppressesToolPreview, temporaryMoveToolAllowed, temporaryTransformOffset, translatedSelectionRect, translatedSelectionTransformPreviewMask, undoActiveCanvasPathGesture, undoCanvasPathStep, updateBrushSpeedTracking, viewDragClientDelta, wheelCanvasZoom, zoomDragModeForModifiers, zoomDragTarget, type CanvasDragState } from './canvas-input'
import { balancedStairLinePoints } from './pixel-line'
import { createDocument, getActiveLayer, readLayerColor, writeLayerColor } from './document'
import { isPenBarrelButtonEvent, isPenEraserEvent } from './canvas-input'
import { beginPixelEdit } from './history'
import { applySelectionTransform, captureSelectionTransform, paintBrush } from './tools'
import { beginCanvasToolGesture, clearCanvasToolGestures, deferCanvasShortcut, endCanvasToolGesture, isCanvasToolGestureLocked } from './canvas-tool-gesture-lock'
const drag = (): CanvasDragState => ({ kind: 'move-content', start: { x: 0, y: 0 }, last: { x: 0, y: 0 } })

describe('canvas input helpers', () => {
  it('keeps selection transforms proportional while the aspect link is locked', () => {
    expect(selectionTransformModifiers({ ctrlKey: false, altKey: false, shiftKey: false }).proportional).toBe(false)
    expect(selectionTransformModifiers({ ctrlKey: false, altKey: false, shiftKey: false, proportionalLocked: true }).proportional).toBe(true)
    expect(selectionTransformModifiers({ ctrlKey: false, altKey: false, shiftKey: true }).proportional).toBe(true)
  })

  it('constrains only the dragged free-transform corner to the linked aspect ratio', () => {
    const quad = {
      nw: { x: 0, y: 0 }, ne: { x: 4, y: 0 },
      se: { x: 4, y: 2 }, sw: { x: 0, y: 2 }
    }
    expect(constrainFreeTransformCornerToAspectRatio(quad, 'nw', { x: -4, y: -1 }, 2)).toEqual({ x: -4, y: -2 })
    expect(constrainFreeTransformCornerToAspectRatio(quad, 'nw', { x: -1, y: -4 }, 2)).toEqual({ x: -8, y: -4 })
    expect(constrainFreeTransformCornerToAspectRatio(quad, 'se', { x: 8, y: 3 }, 2)).toEqual({ x: 8, y: 4 })
  })

  it('keeps a pressed move layer in the base composite until a real preview starts', () => {
    const pressed: CanvasDragState = {
      kind: 'move-layer',
      start: { x: 2, y: 3 },
      last: { x: 2, y: 3 },
      layerContentBounds: { layer: { x: 1, y: 1, width: 4, height: 4 } }
    }

    expect(layerMovePreviewActive(pressed)).toBe(false)
    expect(layerMovePreviewActive({ ...pressed, moved: true })).toBe(false)
    expect(layerMovePreviewActive({ ...pressed, moved: true, layerPreviewOffset: { x: 1, y: 0 } })).toBe(true)
    expect(layerMovePreviewActive({ ...pressed, moved: true, layerPreviewOffset: { x: 0, y: 0 } })).toBe(true)
  })

  it('exposes an asynchronous magic-wand preview through the selection overlay frame', () => {
    const current = { x: 0, y: 0, width: 1, height: 1 }
    const preview = { x: 4, y: 5, width: 8, height: 9, mask: new Uint8Array(72).fill(1) }
    const frame = selectionOverlayFrameForDrag(current, {
      kind: 'magic-preview',
      start: { x: 4, y: 5 },
      last: { x: 4, y: 5 },
      previewSelection: preview
    })

    expect(frame.selection).toBe(preview)
  })

  it('recognizes Windows Ink eraser and barrel-button events without treating mouse input as pen input', () => {
    expect(isPenEraserEvent({ pointerType: 'pen', button: 5, buttons: 0 })).toBe(true)
    expect(isPenEraserEvent({ pointerType: 'mouse', button: 5, buttons: 32 })).toBe(false)
    expect(isPenBarrelButtonEvent({ pointerType: 'pen', button: 2, buttons: 2 })).toBe(true)
    expect(isPenBarrelButtonEvent({ pointerType: 'mouse', button: 2, buttons: 2 })).toBe(false)
  })

  it('clears temporary tablet tool state with the owning pointer', () => {
    const input = new CanvasInputState()
    input.setTemporaryTool(11, 'eraser')
    input.clearTemporaryTool(12)
    expect(input.temporaryTool).toBe('eraser')
    input.clearTemporaryTool(11)
    expect(input.temporaryTool).toBeNull()
  })

  it('hits only corner handles in free transform mode', () => {
    const target = { x: 4, y: 6, width: 12, height: 8 }
    expect(selectionFreeTransformHit(target, 0, undefined, { x: 4, y: 6 }, 1)).toBe('nw')
    expect(selectionFreeTransformHit(target, 0, undefined, { x: 16, y: 6 }, 1)).toBe('ne')
    expect(selectionFreeTransformHit(target, 0, undefined, { x: 10, y: 6 }, 1)).toBeNull()
    expect(selectionFreeTransformHit(target, 0, undefined, { x: 16, y: 10 }, 1)).toBeNull()
  })

  it('recognizes content inside a free-transform quad for translation', () => {
    const selection = { x: 4, y: 6, width: 12, height: 8 }
    const quad = {
      nw: { x: 4, y: 6 },
      ne: { x: 16, y: 6 },
      se: { x: 16, y: 14 },
      sw: { x: 4, y: 14 }
    }
    expect(selectionFreeTransformContentHit(selection, quad, { x: 10, y: 10 })).toBe(true)
    expect(selectionFreeTransformContentHit(selection, quad, { x: 2, y: 10 })).toBe(false)
  })

  it('keeps transparent holes movable inside the free-transform frame', () => {
    const selection = {
      x: 4,
      y: 6,
      width: 4,
      height: 4,
      mask: Uint8Array.from([
        1, 0, 0, 0,
        0, 0, 0, 0,
        0, 0, 0, 0,
        0, 0, 0, 1
      ])
    }
    const quad = {
      nw: { x: 4, y: 6 },
      ne: { x: 12, y: 6 },
      se: { x: 12, y: 14 },
      sw: { x: 4, y: 14 }
    }
    expect(selectionFreeTransformContentHit(selection, quad, { x: 8, y: 10 })).toBe(true)
  })

  it('hits the correct corners after a quad rotation', () => {
    const target = {
      nw: { x: 10, y: 5 },
      ne: { x: 10, y: 15 },
      se: { x: 2, y: 15 },
      sw: { x: 2, y: 5 }
    }
    expect(selectionFreeTransformHit(target, 0, undefined, { x: 10, y: 5 }, 1)).toBe('nw')
    expect(selectionFreeTransformHit(target, 0, undefined, { x: 10, y: 15 }, 1)).toBe('ne')
    expect(selectionFreeTransformHit(target, 0, undefined, { x: 6, y: 10 }, 1)).toBeNull()
  })

  it('keeps a free-transform quad change visible to the commit gate', () => {
    const startQuad = {
      nw: { x: 4, y: 6 },
      ne: { x: 16, y: 6 },
      se: { x: 16, y: 14 },
      sw: { x: 4, y: 14 }
    }
    const movedQuad = {
      ...startQuad,
      se: { x: 15, y: 13 }
    }
    expect(selectionTransformPreviewChanged({
      kind: 'transform-content',
      start: { x: 16, y: 14 },
      last: { x: 15, y: 13 },
      selectionStart: { x: 4, y: 6, width: 12, height: 8 },
      transformStartTarget: { x: 4, y: 6, width: 12, height: 8 },
      previewTarget: { x: 4, y: 6, width: 12, height: 8 },
      transformStartQuad: startQuad,
      previewQuad: movedQuad,
      startAngle: 0,
      previewAngle: 0
    })).toBe(true)
  })

  it('normalizes standard, horizontal, line and legacy wheel input', () => {
    expect(normalizeCanvasWheelDelta({ deltaY: 120 })).toBe(120)
    expect(normalizeCanvasWheelDelta({ deltaX: -8, deltaY: 0 })).toBe(-8)
    expect(normalizeCanvasWheelDelta({ deltaY: 3, deltaMode: 1 })).toBe(48)
    expect(normalizeCanvasWheelDelta({ wheelDelta: 120 })).toBe(-120)
    expect(normalizeCanvasWheelDelta({ deltaY: 0, deltaX: 0, wheelDelta: 0 })).toBe(0)
  })
  it('keeps temporary Move active only for tools without a dedicated Ctrl gesture', () => {
    const ctrl = { ctrlKey: true, metaKey: false, altKey: false, shiftKey: false }
    expect(shouldUseTemporaryMoveTool('pencil', ctrl, 'Ctrl')).toBe(true)
    expect(shouldUseTemporaryMoveTool('text', ctrl, 'Ctrl')).toBe(true)
    expect(shouldUseTemporaryMoveTool('selection', ctrl, 'Ctrl')).toBe(false)
    expect(shouldUseTemporaryMoveTool('move', ctrl, 'Ctrl', 'slice')).toBe(true)
    expect(shouldUseTemporaryMoveTool('eyedropper', ctrl, 'Ctrl')).toBe(true)
    expect(shouldUseTemporaryMoveTool('zoom', ctrl, 'Ctrl')).toBe(true)
    expect(shouldUseTemporaryMoveTool('rotate', ctrl, 'Ctrl')).toBe(true)
    expect(shouldUseTemporaryMoveTool('shape', ctrl, 'Ctrl')).toBe(false)
    expect(shouldUseTemporaryMoveTool('move', { ...ctrl, altKey: true }, 'Ctrl', 'slice')).toBe(true)
    expect(shouldUseTemporaryMoveTool('move', { ...ctrl, shiftKey: true }, 'Ctrl', 'slice')).toBe(true)
    expect(shouldUseTemporaryMoveTool('move', ctrl, 'Ctrl')).toBe(false)
    expect(shouldUseTemporaryMoveTool('move', { ...ctrl, ctrlKey: false, altKey: true }, 'Ctrl', 'slice')).toBe(false)
  })

  it('keeps Ctrl inside every selection-tool interaction instead of activating temporary Move', () => {
    const ctrl = { ctrlKey: true, metaKey: false, altKey: false, shiftKey: false }
    expect(shouldUseTemporaryMoveForCanvasInteraction('selection', ctrl, 'Ctrl', 'move', 'outside')).toBe(false)
    expect(shouldUseTemporaryMoveForCanvasInteraction('selection', ctrl, 'Ctrl', 'move', 'inside')).toBe(false)
    expect(shouldUseTemporaryMoveForCanvasInteraction('selection', ctrl, 'Ctrl', 'move', 'se')).toBe(false)
    expect(shouldUseTemporaryMoveForCanvasInteraction('selection', ctrl, 'Ctrl', 'move', 'outside', true)).toBe(false)
  })


  it('keeps a pen pointer authoritative over its trailing compatibility mouse events', () => {
    const input = new CanvasInputState()
    expect(input.acceptPointerDeviceEvent({ pointerId: 8, pointerType: 'pen', timeStamp: 100 })).toBe(true)
    expect(input.penPointerIsActive()).toBe(true)
    expect(input.acceptPointerDeviceEvent({ pointerId: 1, pointerType: 'mouse', timeStamp: 100 + PEN_COMPATIBLE_MOUSE_SUPPRESSION_MS })).toBe(false)
    expect(input.penPointerIsActive()).toBe(true)
    expect(input.acceptPointerDeviceEvent({ pointerId: 1, pointerType: 'mouse', timeStamp: 101 }, true)).toBe(true)
    expect(input.penPointerIsActive()).toBe(false)
  })

  it('latches pressure capability for a pen stream before the first changing sample', () => {
    const adapter = new PointerPressureAdapter()
    expect(adapter.adapt({ pointerId: 12, pointerType: 'pen', pressure: 0, buttons: 1 }).pressureAvailable).toBe(true)
    expect(adapter.adapt({ pointerId: 12, pointerType: 'pen', pressure: 0.5, buttons: 1 }).pressureAvailable).toBe(true)
  })







  it('reverts an unfinished drawing when the pointer interaction is cancelled', () => {
    const document = createDocument('cancelled stroke', 4, 4, 'rgba')
    const layer = getActiveLayer(document)
    const edit = beginPixelEdit(layer.id)
    paintBrush(document, layer, edit, 2, 1, 1, { r: 20, g: 40, b: 60, a: 255 }, 'square')
    expect(readLayerColor(document, layer, 1 * layer.width + 2).a).toBe(255)
    expect(revertCancelledCanvasDragPixelChanges(document, { kind: 'draw', start: { x: 2, y: 1 }, last: { x: 2, y: 1 }, edit })).toBe(true)
    expect(readLayerColor(document, layer, 1 * layer.width + 2).a).toBe(0)
  })

  it('uses the balanced stair algorithm for polygon lasso preview and closed edges when enabled', () => {
    const path = [{ x: 0, y: 0 }, { x: 8, y: 2 }, { x: 7, y: 7 }]
    expect(polygonLassoPreviewPoints(path, { x: 2, y: 8 }, false, true)).toEqual([
      ...balancedStairLinePoints(path[0], path[1]),
      ...balancedStairLinePoints(path[1], path[2]),
      ...balancedStairLinePoints(path[2], { x: 2, y: 8 })
    ])
    expect(polygonLassoClosedPathPoints(path, true)).toEqual([
      ...balancedStairLinePoints(path[0], path[1]),
      ...balancedStairLinePoints(path[1], path[2]),
      ...balancedStairLinePoints(path[2], path[0])
    ])
  })

  it('incrementally caches polygon shape contour points without changing the preview', () => {
    const path = [{ x: 1, y: 1 }, { x: 18, y: 4 }, { x: 12, y: 15 }]
    const pointer = { x: 4, y: 19 }
    const cache = createPolygonPathRasterCache()
    expect(polygonLassoPreviewPoints(path, pointer, true, false, cache)).toEqual(polygonLassoPreviewPoints(path, pointer, true, false))

    path.push({ x: 5, y: 20 })
    expect(polygonLassoPreviewPoints(path, pointer, true, false, cache)).toEqual(polygonLassoPreviewPoints(path, pointer, true, false))
  })

  it('uses the live marquee target for selection dimension displays', () => {
    const previewTarget = { x: 3, y: 4, width: 18, height: 11 }
    expect(marqueePreviewTargetForDrag({
      kind: 'marquee',
      start: { x: 3, y: 4 },
      last: { x: 20, y: 14 },
      moved: true,
      marqueeBounds: { x: 3, y: 4, width: 12, height: 8 },
      previewTarget
    })).toEqual(previewTarget)
    expect(marqueePreviewTargetForDrag({
      kind: 'marquee',
      start: { x: 3, y: 4 },
      last: { x: 3, y: 4 },
      moved: false,
      marqueeBounds: { x: 3, y: 4, width: 1, height: 1 }
    })).toBeNull()
  })

  it('uses drawing bounds for shape, line, and curve dimension displays', () => {
    expect(drawingSizePreviewTargetForDrag({
      kind: 'shape',
      start: { x: 8, y: 6 },
      last: { x: 2, y: 3 },
      previewTarget: { x: 2, y: 3, width: 7, height: 4 }
    })).toEqual({ x: 2, y: 3, width: 7, height: 4 })
    expect(drawingSizePreviewTargetForDrag({
      kind: 'shape',
      start: { x: 2, y: 2 },
      last: { x: 8, y: 5 },
      constrain: true
    })).toEqual({ x: 2, y: 2, width: 7, height: 7 })
    expect(drawingSizePreviewTargetForDrag({
      kind: 'line-shape',
      start: { x: 4, y: 9 },
      last: { x: 11, y: 5 }
    })).toEqual({ x: 4, y: 5, width: 8, height: 5 })
    expect(drawingSizePreviewTargetForDrag({
      kind: 'curve-shape',
      start: { x: 1, y: 2 },
      last: { x: 9, y: 8 },
      curveEnd: { x: 9, y: 8 },
      curvePhase: 'anchors'
    })).toEqual({ x: 1, y: 2, width: 9, height: 7 })
    expect(drawingSizePreviewTargetForDrag({
      kind: 'curve-shape',
      start: { x: 3, y: 3 },
      last: { x: 3, y: 3 },
      curvePhase: 'endpoint'
    })).toBeNull()
    expect(drawingSizePreviewTargetForDrag({
      kind: 'line-shape',
      start: { x: 4, y: 9 },
      last: { x: 4, y: 9 }
    })).toBeNull()
  })



  it('undoes and redoes in-progress freeform and polygon path steps without touching document history', () => {
    for (const kind of ['freeform-shape', 'polygon-shape', 'lasso', 'polygon-lasso'] as const) {
      const gesture: CanvasDragState = {
        kind,
        start: { x: 1, y: 1 },
        last: { x: 3, y: 1 },
        path: [{ x: 1, y: 1 }, { x: 2, y: 1 }]
      }
      expect(isPendingCanvasPathGesture(gesture)).toBe(true)
      expect(appendCanvasPathStep(gesture, { x: 3, y: 1 })).toBe(true)
      expect(undoCanvasPathStep(gesture)).toBe(true)
      expect(gesture.path).toEqual([{ x: 1, y: 1 }, { x: 2, y: 1 }])
      expect(redoCanvasPathStep(gesture)).toBe(true)
      expect(gesture.path).toEqual([{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }])
      expect(undoCanvasPathStep(gesture)).toBe(true)
      expect(appendCanvasPathStep(gesture, { x: 4, y: 1 })).toBe(true)
      expect(redoCanvasPathStep(gesture)).toBe(false)
    }
    expect(isPendingCanvasPathGesture({ kind: 'draw', start: { x: 0, y: 0 }, last: { x: 0, y: 0 } })).toBe(false)

    const input = new CanvasInputState()
    input.begin({ kind: 'polygon-shape', start: { x: 1, y: 1 }, last: { x: 1, y: 1 }, path: [{ x: 1, y: 1 }] })
    expect(undoActiveCanvasPathGesture(input)).toBe(true)
    expect(input.drag).toBeNull()
    expect(undoActiveCanvasPathGesture(input)).toBe(false)
  })

  it('routes active canvas gesture history by document and unregisters without clearing replacements', () => {
    let firstUndo = 0
    let replacementUndo = 0
    const unregisterFirst = registerPendingCanvasGestureHistory('document', {
      undo: () => { firstUndo += 1; return true },
      redo: () => true
    })
    const unregisterReplacement = registerPendingCanvasGestureHistory('document', {
      undo: () => { replacementUndo += 1; return true },
      redo: () => true
    })

    unregisterFirst()
    expect(consumePendingCanvasGestureHistory('document', 'undo')).toBe(true)
    expect(firstUndo).toBe(0)
    expect(replacementUndo).toBe(1)
    unregisterReplacement()
    expect(consumePendingCanvasGestureHistory('document', 'undo')).toBe(false)
  })




  it('keeps pasted transform geometry on its original rectangle after rotate or shear previews', () => {
    const sourceSelection = { x: 4, y: 3, width: 5, height: 4, mask: Uint8Array.from([
      0, 1, 1, 0, 0,
      1, 1, 1, 1, 0,
      0, 1, 1, 1, 1,
      0, 0, 1, 1, 0
    ]) }
    const previousTransformSelection = {
      x: 2,
      y: 1,
      width: 8,
      height: 7,
      mask: new Uint8Array(56).fill(1)
    }
    const selectionSource = {
      selection: sourceSelection,
      origin: 'clipboard'
    } as NonNullable<CanvasDragState['selectionSource']>

    expect(selectionTransformGeometrySource({
      selectionSource,
      selectionStart: previousTransformSelection
    })).toEqual({ x: 4, y: 3, width: 5, height: 4 })
  })


  it('does not use Shift as a generic canvas pan gesture', () => {
    expect(shouldStartCanvasPan('fill')).toBe(false)
    expect(shouldStartCanvasPan('selection')).toBe(false)
    expect(shouldStartCanvasPan('shape')).toBe(false)
  })

  it('classifies dedicated viewport navigation tools independently of layer editing', () => {
    expect(isCanvasViewNavigationTool('hand')).toBe(true)
    expect(isCanvasViewNavigationTool('zoom')).toBe(true)
    expect(isCanvasViewNavigationTool('rotate')).toBe(true)
    expect(isCanvasViewNavigationTool('move')).toBe(false)
    expect(isCanvasViewNavigationTool('pencil')).toBe(false)
  })

  it('routes playback tools to viewport navigation without changing dedicated zoom and rotation', () => {
    expect(playbackCanvasNavigationTool('hand')).toBe('hand')
    expect(playbackCanvasNavigationTool('zoom')).toBe('zoom')
    expect(playbackCanvasNavigationTool('rotate')).toBe('rotate')
    expect(playbackCanvasNavigationTool('move')).toBe('hand')
    expect(playbackCanvasNavigationTool('pencil')).toBe('hand')
    expect(playbackCanvasNavigationTool('selection')).toBe('hand')
  })

  it('keeps temporary viewport drags active regardless of the selected drawing tool', () => {
    expect(isCanvasViewNavigationDrag({ kind: 'pan' })).toBe(true)
    expect(isCanvasViewNavigationDrag({ kind: 'zoom-drag' })).toBe(true)
    expect(isCanvasViewNavigationDrag({ kind: 'rotate-view' })).toBe(true)
    expect(isCanvasViewNavigationDrag({ kind: 'draw' })).toBe(false)
    expect(isCanvasViewNavigationDrag(null)).toBe(false)
  })


  it('uses Ctrl only for centered marquee creation and Shift for the 1:1 constraint', () => {
    expect(selectionMarqueeUsesConstraint({ ctrlKey: false, shiftKey: true }, false, 'replace')).toBe(true)
    expect(selectionMarqueeUsesConstraint({ ctrlKey: false, shiftKey: true }, true, 'add')).toBe(false)
    expect(selectionMarqueeUsesConstraint({ ctrlKey: true, shiftKey: true }, false, 'replace')).toBe(true)
    expect(selectionMarqueeUsesConstraint({ ctrlKey: true, shiftKey: true }, true, 'add')).toBe(false)
    expect(selectionMarqueeUsesConstraint({ ctrlKey: true, shiftKey: false }, true, 'replace')).toBe(false)
    expect(selectionMarqueeUsesConstraint({ ctrlKey: true, shiftKey: false }, true, 'replace', true)).toBe(false)
    expect(selectionMarqueeUsesConstraint({ ctrlKey: true, shiftKey: true }, true, 'add', true)).toBe(false)
  })



  it('keeps selection movement continuous across a repeated-canvas seam', () => {
    const repeatedDrag: Pick<CanvasDragState, 'start' | 'tileRepeatStart'> = {
      start: { x: 15, y: 2 },
      tileRepeatStart: { x: 15.75, y: 2.25 }
    }
    expect(selectionMovePointerDelta(repeatedDrag, { x: 0, y: 2 }, { x: 16.1, y: 2.25 })).toEqual({ x: 1, y: 0 })
    expect(selectionMovePointerDelta(repeatedDrag, { x: 14, y: 3 }, { x: 14.9, y: 3.1 })).toEqual({ x: -1, y: 1 })
    expect(selectionMovePointerDelta({ start: { x: 4, y: 5 } }, { x: 7, y: 3 })).toEqual({ x: 3, y: -2 })
  })
















  it('resizes transformed content along its rotated local axes without replacing the transform box with the visible bounds', () => {
    const start = { x: 2, y: 2, width: 4, height: 3 }
    const resized = resizeTransformedSelectionBounds(start, { x: 0, y: 2 }, 90, 'e')
    expect(resized.x).toBeCloseTo(1)
    expect(resized.y).toBeCloseTo(3)
    expect(resized.width).toBe(6)
    expect(resized.height).toBe(3)
  })




  it('keeps transformed clipboard pixels deferred until the floating paste is confirmed', () => {
    expect(deferredSelectionPreviewMaterializationRequired(false, true, 'clipboard')).toBe(false)
    expect(deferredSelectionPreviewMaterializationRequired(false, false, 'clipboard')).toBe(true)
    expect(deferredSelectionPreviewMaterializationRequired(false, true, 'selection')).toBe(true)
    expect(deferredSelectionPreviewMaterializationRequired(true, true, 'clipboard')).toBe(false)
  })






  it('clears a lost pointer interaction so the next tool can receive shortcuts normally', () => {
    const input = new CanvasInputState()
    const active = drag()
    input.begin(active)
    input.pointer.visible = true
    input.sampling = true
    input.altHeld = true
    input.ctrlHeld = true
    input.shiftHeld = true
    input.spaceHeld = true

    expect(input.resetInteraction()).toBe(active)
    expect(input.drag).toBeNull()
    expect(input.pointer.visible).toBe(false)
    expect(input.sampling).toBe(false)
    expect(input.altHeld).toBe(false)
    expect(input.ctrlHeld).toBe(false)
    expect(input.shiftHeld).toBe(false)
    expect(input.spaceHeld).toBe(false)
  })

  it('locks tool changes until the active pointer gesture ends', () => {
    clearCanvasToolGestures()
    try {
      expect(isCanvasToolGestureLocked()).toBe(false)
      beginCanvasToolGesture(7)
      expect(isCanvasToolGestureLocked()).toBe(true)
      endCanvasToolGesture(7)
      expect(isCanvasToolGestureLocked()).toBe(false)
    } finally {
      clearCanvasToolGestures()
    }
  })

  it('replays deferred shortcuts in order after pointer release', async () => {
    clearCanvasToolGestures()
    const changes: string[] = []
    try {
      beginCanvasToolGesture(7)
      deferCanvasShortcut(() => changes.push('pencil'))
      deferCanvasShortcut(() => changes.push('eraser'))
      expect(changes).toEqual([])

      endCanvasToolGesture(7)
      expect(changes).toEqual([])
      await Promise.resolve()
      expect(changes).toEqual(['pencil', 'eraser'])
    } finally {
      clearCanvasToolGestures()
    }
  })
})


describe('compact pixel gesture cancellation', () => {
  it('reports and restores all pixels from a large brush compact record', () => {
    const document = createDocument('cancel large stroke', 128, 128, 'rgba')
    const layer = getActiveLayer(document)
    const baseline = layer.pixels.slice()
    const edit = beginPixelEdit(layer.id)
    paintBrush(document, layer, edit, 64, 64, 64, { r: 255, g: 0, b: 0, a: 255 }, 'square')
    expect(edit.before.size).toBe(0)
    expect(edit.points!.count).toBeGreaterThan(0)
    expect(revertCancelledCanvasDragPixelChanges(document, { kind: 'draw', start: { x: 64, y: 64 }, last: { x: 64, y: 64 }, edit })).toBe(true)
    expect(layer.pixels).toEqual(baseline)
  })
})
