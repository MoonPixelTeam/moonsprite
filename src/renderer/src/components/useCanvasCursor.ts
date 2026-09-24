import { selectionBrushOwnsPointer } from './canvas-selection-brush-gesture'
import { tabletBoxMove, tabletContentMove } from '@/core/tablet-interaction'
import { useLayoutEffect } from 'react'
import type { RasterLayer } from '@shared/types-layer'
import type { RgbaColor } from '@shared/types-color'
import type { SelectionQuad, SelectionRect } from '@shared/types-selection'
import {
  getActiveLayer,
  isLayerEffectivelyLocked,
  layerMaskDisplayColor,
  readLayerColor,
  readLayerMaskDisplayColorAt,
  resolveLayerCanvasColor
} from '@/core/document-model'
import { blendOver, TRANSPARENT } from '@/core/raster'
import { useWorkspace, type DocumentSession } from '@/store/workspace'
import { activeLayerMask, activePaintLayer, isToolAvailableForSession } from '@/store/workspace-session'
import { documentPointFromViewportPointContinuous } from '@/core/view-geometry'
import {
  selectionContains,
  selectionQuadFromRect,
  transformedSelectionCenter,
  transformedSelectionControlPoints,
  transformedSelectionPivotPreset,
  transformedSelectionShearDirection,
  type SelectionShearTransform
} from '@/core/selection'
import { paletteSamplingShortcutActive } from '@/core/palette-sampling-shortcut'
import {
  CanvasInputState,
  isCanvasViewNavigationDrag,
  isCanvasViewNavigationTool,
  playbackCanvasNavigationTool,
  selectionHitStartsContentMove,
  selectionInteractionHit,
  selectionResizeHit,
  selectionFreeTransformContentHit,
  selectionFreeTransformHit,
  selectionTransformedInteractionHit,
  shouldRestartFloatingSelectionForCopy,
  temporaryMoveForCanvasInteractionAllowed,
  type CanvasDragState as DragState,
  type CanvasPoint as Point,
  type SelectionHandle,
  type SelectionHit,
  type SelectionRotationHandle,
  type SelectionShearHandle
} from '@/core/canvas-input'
import {
  canvasCursors,
  canvasToolCursor,
  directionalResizeCursors,
  directionalShearCursors,
  previewCursorTools,
  resizeCursors,
  rotationCursors,
  selectionCornerResizeCursorForPoints,
  selectionResizeCursorForHandle,
  selectionRotationCursorForPosition,
  selectionShearCursorForDirection,
  shearCursors,
  selectionCreationCursor,
  selectionTransformDragCursor,
  transparencyColorAt
} from '@/core/canvas-visuals'
import { type SymmetryAxis } from '@/core/symmetry'
import { sliceAtPoint } from '@/core/slices'
import { tileRepeatMappedPointForCopies } from '@/core/tilemap'
import { selectedTextBoxForSession } from './canvas-stage-helpers'
interface Ports {
  readonly session: DocumentSession
  readonly canvasRef: import('react').RefObject<HTMLCanvasElement | null>
  readonly stageSize: () => {
    width: number
    height: number
  }
  readonly stagePoint: (clientX: number, clientY: number) => Point
  readonly liveViewRef: import('react').RefObject<import('@shared/types-view').ViewState>
  readonly rotationIndicatorPosition: import('@/core/file-preferences').RotationIndicatorPosition
  readonly freeTransformQuadForSession: (currentSession: DocumentSession) => SelectionQuad | null
  readonly displayedSelectionPoint: (point: Point) => Point
  readonly inputRef: import('react').RefObject<CanvasInputState>
  readonly selectionCrosshair: boolean
  useLocalCursors?: boolean
  readonly selectionInteractionEditable: boolean
  readonly quickToolActive: (tool: DocumentSession['tool']) => boolean
  readonly canvasResizePreviewRef: import('react').RefObject<import('@/store/workspace').CanvasResizePreview | null>
  readonly canvasResizeHitAt: (clientX: number, clientY: number) => DragState['canvasEdge'] | null
  readonly canvasResizeContainsAt: (clientX: number, clientY: number) => boolean
  readonly symmetryAxisHitAt: (clientX: number, clientY: number, ctrlHeld?: boolean) => SymmetryAxis | 'center' | null
  readonly symmetryDragRef?: import('react').RefObject<import('./canvas-stage-helpers').SymmetryDragState | null>
  readonly temporaryMoveActive: (event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>, targetSession?: DocumentSession) => boolean
  readonly localPointAt: (clientX: number, clientY: number, allowOutsideCopies?: boolean) => Point | null
  readonly cursorCompositePointSamplerFor: (currentSession: DocumentSession) => (x: number, y: number) => RgbaColor
  readonly activeLayerEditable: boolean
  readonly cursorCompositePointReplacementSamplerFor: (
    currentSession: DocumentSession,
    layerId: string
  ) => (x: number, y: number, replacement: RgbaColor) => RgbaColor
  readonly checkerboard: import('@/core/file-preferences').CheckerboardPreferences
  readonly activeLayer: RasterLayer
  readonly modifierActive: (event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>, id: import('@/core/shortcuts').ShortcutId) => boolean
  readonly wheelBrushSizePreviewRef: import('react').RefObject<boolean>
  readonly selectionPivotHitAt: (clientX: number, clientY: number) => boolean
  readonly topEditableLayerAt: (point: Point) => RasterLayer | null
  readonly selectionLayersEditable: boolean
  readonly textLayerAt: (point: Point) => RasterLayer | null
  readonly updateRotationIndicator: (rotation: number, visible: boolean) => void
  readonly hasSelectedMovableLayer: boolean
  readonly sliceTool: boolean
  readonly sliceHandleAt: (clientX: number, clientY: number, slice: SelectionRect) => SelectionHandle | null
  readonly scheduleDraw: () => void
  readonly symmetryCenter: import('@/core/symmetry').SymmetryCenter
  readonly symmetryAxisPreferences: import('@/core/file-preferences').SymmetryAxisPreferences
  readonly quickToolMatch: import('@/core/quick-tools').QuickToolMatch | null
}

export function useCanvasCursor(ports: Ports) {
  const selectionHitAt = (clientX: number, clientY: number): SelectionHit => {
    const currentSession = useWorkspace.getState().sessions.find((item) => item.document.id === ports.session.document.id) ?? ports.session
    const textBox = currentSession.textBoxTransform?.bounds ?? selectedTextBoxForSession(currentSession)
    if ((!currentSession.selection && !textBox) || !ports.canvasRef.current) return 'outside'
    const size = ports.stageSize()
    const point = documentPointFromViewportPointContinuous(
      ports.stagePoint(clientX, clientY),
      size.width,
      size.height,
      currentSession.document.width,
      currentSession.document.height,
      ports.liveViewRef.current,
      ports.rotationIndicatorPosition
    )
    if (textBox) {
      const resizeHit = selectionResizeHit(
        textBox,
        point,
        12 / Math.max(0.0001, ports.liveViewRef.current.zoom),
        18 / Math.max(0.0001, ports.liveViewRef.current.zoom),
        5 / Math.max(0.0001, ports.liveViewRef.current.zoom)
      )
      if (resizeHit) return resizeHit
      return point.x >= textBox.x && point.x <= textBox.x + textBox.width && point.y >= textBox.y && point.y <= textBox.y + textBox.height
        ? 'inside'
        : 'outside'
    }
    const floating = currentSession.pendingPaste
    const selection = currentSession.selection
    if (!selection) return 'outside'
    const hitAt = (candidate: Point): SelectionHit => {
      if (tabletBoxMove(currentSession.document.id) && selectionContains(selection, Math.floor(candidate.x), Math.floor(candidate.y))) return 'edge'
      if (!currentSession.freeTransformActive && tabletContentMove(currentSession.document.id) && selectionContains(selection, Math.floor(candidate.x), Math.floor(candidate.y))) return 'inside'
      if (currentSession.freeTransformActive) {
        const target = ports.freeTransformQuadForSession(currentSession) ?? floating?.transformTarget ?? selection
        const corner = selectionFreeTransformHit(
          target,
          'nw' in target ? 0 : (floating?.transformAngle ?? 0),
          'nw' in target ? undefined : floating?.transformShear,
          candidate,
          ports.liveViewRef.current.zoom
        )
        if (corner) return corner
        const quad = 'nw' in target ? target : selectionQuadFromRect(target, floating?.transformAngle ?? 0, floating?.transformShear)
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
            ports.liveViewRef.current.zoom
          )
        : selectionInteractionHit(selection, candidate, ports.liveViewRef.current.zoom)
    }
    const directHit = hitAt(point)
    if (directHit !== 'outside') return directHit
    const mapped = tileRepeatMappedPointForCopies(
      point,
      currentSession.document.width,
      currentSession.document.height,
      ports.liveViewRef.current.tileRepeatMode ?? 'off'
    )
    return mapped ? hitAt(mapped.local) : 'outside'
  }

  const selectionHit = (event: React.PointerEvent<HTMLCanvasElement>): SelectionHit => selectionHitAt(event.clientX, event.clientY)

  const rotationCursorForHit = (hit: SelectionRotationHandle): string => {
    const currentSession = useWorkspace.getState().sessions.find((item) => item.document.id === ports.session.document.id) ?? ports.session
    const floating = currentSession.pendingPaste
    const target = floating?.transformTarget ?? currentSession.selection
    if (!target) return rotationCursors[hit]
    const points = transformedSelectionControlPoints(target, floating?.transformAngle ?? 0, floating?.transformShear)
    const cornerIndex: Record<SelectionRotationHandle, number> = { 'rotate-nw': 0, 'rotate-ne': 2, 'rotate-sw': 5, 'rotate-se': 7 }
    const center = currentSession.selectionPivot ?? transformedSelectionPivotPreset(target, 'center', floating?.transformAngle ?? 0, floating?.transformShear)
    const displayedCorner = ports.displayedSelectionPoint(points[cornerIndex[hit]])
    const displayedCenter = ports.displayedSelectionPoint(center)
    return rotationCursors[selectionRotationCursorForPosition(displayedCorner, displayedCenter)]
  }

  const displayedResizeCursorForHandle = (hit: SelectionHandle, contentRotation = 0): string => {
    const view = ports.liveViewRef.current
    return directionalResizeCursors[selectionResizeCursorForHandle(hit, contentRotation, view.rotation, Boolean(view.mirrored), Boolean(view.mirroredVertical))]
  }

  const resizeCursorForTransform = (hit: SelectionHandle, target: SelectionRect, angle = 0, shear?: SelectionShearTransform): string => {
    const displayedPoints = transformedSelectionControlPoints(target, angle, shear).map(ports.displayedSelectionPoint)
    const cornerCursor = selectionCornerResizeCursorForPoints(hit, displayedPoints)
    return cornerCursor ? directionalResizeCursors[cornerCursor] : displayedResizeCursorForHandle(hit, angle)
  }

  const resizeCursorForHit = (hit: SelectionHandle): string => {
    const currentSession = useWorkspace.getState().sessions.find((item) => item.document.id === ports.session.document.id) ?? ports.session
    const floating = currentSession.pendingPaste
    // A regular marquee selection is axis-aligned. Keep its four corner
    // cursors on the stable nw/se and ne/sw mapping; dynamic screen-space
    // direction inference is only needed while a floating selection is being
    // transformed.
    if (!floating?.transformTarget) {
      const view = ports.liveViewRef.current
      if (Math.abs(view.rotation) < 0.000001 && !view.mirrored && !view.mirroredVertical) return resizeCursors[hit]
      return displayedResizeCursorForHandle(hit)
    }
    return resizeCursorForTransform(hit, floating.transformTarget, floating.transformAngle ?? 0, floating.transformShear)
  }

  const shearCursorForTransform = (hit: SelectionShearHandle, target: SelectionRect, angle = 0, shear?: SelectionShearTransform): string => {
    const edge = hit.slice(-1) as 'n' | 'e' | 's' | 'w'
    const direction = transformedSelectionShearDirection(target, angle, shear, edge)
    if (!direction) return shearCursors[hit]
    const origin = transformedSelectionCenter(target, angle, shear)
    const displayedOrigin = ports.displayedSelectionPoint(origin)
    const displayedDirection = ports.displayedSelectionPoint({ x: origin.x + direction.x, y: origin.y + direction.y })
    return directionalShearCursors[
      selectionShearCursorForDirection({
        x: displayedDirection.x - displayedOrigin.x,
        y: displayedDirection.y - displayedOrigin.y
      })
    ]
  }

  const shearCursorForHit = (hit: SelectionShearHandle): string => {
    const currentSession = useWorkspace.getState().sessions.find((item) => item.document.id === ports.session.document.id) ?? ports.session
    const floating = currentSession.pendingPaste
    const target = floating?.transformTarget ?? currentSession.selection
    return target ? shearCursorForTransform(hit, target, floating?.transformAngle ?? 0, floating?.transformShear) : shearCursors[hit]
  }

  const selectionTransformCursorForDrag = (drag: DragState): string | null => {
    if (drag.kind === 'transform-content' && drag.handle) {
      const target = drag.previewTarget ?? drag.transformStartTarget ?? drag.selectionStart
      if (target) return resizeCursorForTransform(drag.handle, target, drag.previewAngle ?? drag.startAngle ?? 0, drag.previewShear ?? drag.transformStartShear)
      return displayedResizeCursorForHandle(drag.handle, drag.previewAngle ?? drag.startAngle ?? 0)
    }
    if (drag.kind === 'shear-content' && drag.shearHandle) {
      const target = drag.previewTarget ?? drag.transformStartTarget ?? drag.selectionStart
      if (target)
        return shearCursorForTransform(drag.shearHandle, target, drag.previewAngle ?? drag.startAngle ?? 0, drag.previewShear ?? drag.transformStartShear)
    }
    if (drag.kind === 'rotate-content') {
      const target = drag.previewTarget ?? drag.transformStartTarget ?? drag.selectionStart
      if (target) {
        const angle = drag.previewAngle ?? drag.startAngle ?? 0
        const pivot =
          drag.previewPivot ??
          drag.selectionPivotStart ??
          transformedSelectionPivotPreset(target, 'center', angle, drag.previewShear ?? drag.transformStartShear)
        return rotationCursors[selectionRotationCursorForPosition(ports.displayedSelectionPoint(drag.last), ports.displayedSelectionPoint(pivot))]
      }
    }
    return selectionTransformDragCursor(drag.kind)
  }

  const resolveCursorAt = (clientX: number, clientY: number, ctrlKey: boolean, altKey: boolean, shiftKey = false): void => {
    const canvas = ports.canvasRef.current
    if (!canvas) return
    // The symmetry-axis drag owns the pointer until release. Keep this ahead
    // of hover/tool resolution so pointer-capture events cannot briefly reset
    // the cursor when the moving axis leaves its original hit area.
    if (ports.symmetryDragRef?.current) {
      ports.inputRef.current.sampling = false
      canvas.style.cursor = canvasCursors.move
      return
    }
    if (ports.inputRef.current.spaceHeld || ports.inputRef.current.drag?.kind === 'pan') {
      ports.inputRef.current.sampling = false
      const drag = ports.inputRef.current.drag
      canvas.style.cursor =
        drag?.kind === 'marquee'
          ? selectionCreationCursor(ports.selectionCrosshair, ports.selectionInteractionEditable, true, ports.useLocalCursors)
          : drag?.kind === 'shape'
            ? canvasToolCursor(ports.session.tool, ports.session.primaryColor)
            : drag?.kind === 'pan'
              ? canvasCursors.grabbing
              : canvasCursors.grab
      return
    }
    // Selection gestures retain cursor ownership through availability changes.
    if (ports.inputRef.current.drag?.kind === 'selection-brush') {
      ports.inputRef.current.sampling = false
      canvas.style.cursor = canvasToolCursor('pencil', ports.session.primaryColor)
      return
    }
    const selectionCreationDrag =
      ports.inputRef.current.drag?.kind === 'marquee' || ports.inputRef.current.drag?.kind === 'lasso' || ports.inputRef.current.drag?.kind === 'polygon-lasso'
    if (selectionCreationDrag) {
      ports.inputRef.current.sampling = false
      canvas.style.cursor = selectionCreationCursor(ports.selectionCrosshair, true, true, ports.useLocalCursors)
      return
    }
    const liveCursorSession = useWorkspace.getState().sessions.find((item) => item.document.id === ports.session.document.id) ?? ports.session
    const playbackNavigationTool = liveCursorSession.animationPlaying ? playbackCanvasNavigationTool(liveCursorSession.tool) : null
    if (playbackNavigationTool === 'hand') {
      ports.inputRef.current.sampling = false
      canvas.style.cursor = canvasCursors.grab
      return
    }
    const liveCursorGroupSelected = liveCursorSession.selectedGroupIds.length > 0 || Boolean(liveCursorSession.selectedGroupId)
    if (
      liveCursorGroupSelected &&
      !isToolAvailableForSession(liveCursorSession, liveCursorSession.tool) &&
      !isCanvasViewNavigationDrag(ports.inputRef.current.drag)
    ) {
      ports.inputRef.current.sampling = false
      canvas.style.cursor = canvasCursors.unavailable
      return
    }
    const viewNavigationDrag = ports.inputRef.current.drag
    const rotateEyedropperActive = liveCursorSession.tool === 'rotate' && (paletteSamplingShortcutActive() || ports.quickToolActive('eyedropper') || altKey)
    if (isCanvasViewNavigationTool(liveCursorSession.tool) && !rotateEyedropperActive) {
      ports.inputRef.current.sampling = false
      canvas.style.cursor =
        viewNavigationDrag?.kind === 'pan' ? canvasCursors.grabbing : canvasToolCursor(liveCursorSession.tool, liveCursorSession.primaryColor)
      return
    }
    const activeResizePreview = ports.canvasResizePreviewRef.current
    if (activeResizePreview) {
      ports.inputRef.current.sampling = false
      ports.inputRef.current.shiftLinePreview = false
      const drag = ports.inputRef.current.drag
      const resizeEdge = drag?.kind === 'canvas-resize' ? drag.canvasEdge : ports.canvasResizeHitAt(clientX, clientY)
      if (resizeEdge) canvas.style.cursor = displayedResizeCursorForHandle(resizeEdge as SelectionHandle)
      else if (drag?.kind === 'canvas-move') canvas.style.cursor = canvasCursors.move
      else canvas.style.cursor = ports.canvasResizeContainsAt(clientX, clientY) ? canvasCursors.move : canvasCursors.default
      return
    }
    const cursorSession = useWorkspace.getState().sessions.find((item) => item.document.id === ports.session.document.id) ?? ports.session
    const freeTransformActive = cursorSession.freeTransformActive === true
    const activeDrag = ports.inputRef.current.drag
    // A gradient gesture owns the pointer for its entire drag. In particular,
    // Alt must not turn it into the eyedropper while the gesture is active.
    if (activeDrag?.kind === 'gradient') {
      ports.inputRef.current.sampling = false
      canvas.style.cursor = canvasToolCursor(cursorSession.tool, cursorSession.primaryColor)
      return
    }
    if (freeTransformActive && activeDrag?.freeTransform !== true) {
      const hit = selectionHitAt(clientX, clientY)
      const point = ports.localPointAt(clientX, clientY)
      const insideDocument = Boolean(point && point.x >= 0 && point.y >= 0 && point.x < ports.session.document.width && point.y < ports.session.document.height)
      ports.inputRef.current.sampling = false
      canvas.style.cursor =
        hit in resizeCursors ? resizeCursorForHit(hit as SelectionHandle) : hit === 'inside' ? canvasCursors.move : insideDocument ? canvasCursors.unavailable : canvasCursors.default
      return
    }
    const brushSizeAdjustmentPreviewActive = Boolean(ports.inputRef.current.modifierBrushSize)
    if (brushSizeAdjustmentPreviewActive && !activeDrag) {
      // The modifier gesture uses this fixed cursor in canvas-pointer-move.
      // Do not sample the layer stack for a contrast color that it overwrites.
      ports.inputRef.current.sampling = false
      canvas.style.cursor = canvasToolCursor('pencil', ports.session.primaryColor)
      return
    }
    if (
      !ports.inputRef.current.drag &&
      !brushSizeAdjustmentPreviewActive &&
      !ports.session.animationPlaying &&
      ports.symmetryAxisHitAt(clientX, clientY, ctrlKey)
    ) {
      ports.inputRef.current.sampling = false
      canvas.style.cursor = canvasCursors.move
      return
    }
    // Resolve gesture cursors before the expensive composite sampling below.
    const drag = ports.inputRef.current.drag
    // Alt+left temporary eyedropper drags keep the canvas pixels unchanged.
    // The magnifier owns the visual feedback, so avoid compiling a composite
    // sampler and scheduling a full stage paint for every pointer event.
    if (drag?.kind === 'sample-color') {
      ports.inputRef.current.sampling = true
      canvas.style.cursor = canvasCursors.eyedropper
      return
    }
    if (drag?.kind === 'move-content' || drag?.kind === 'move-selection') {
      ports.inputRef.current.sampling = false
      canvas.style.cursor =
        drag.kind === 'move-content' ? (drag.copy && !drag.floatingPaste ? canvasCursors.copy : canvasCursors.move) : canvasCursors.selectionMove
      return
    }
    if (drag?.kind === 'move-layer') {
      ports.inputRef.current.sampling = false
      canvas.style.cursor = drag.duplicateOnDrag ? canvasCursors.copy : canvasCursors.move
      return
    }
    // Drawing already owns the pointer hot path. Avoid rebuilding a composite
    // point sampler for every coalesced eraser sample just to choose the
    // cursor contrast; that synchronous layer-tree walk can block the RAF
    // responsible for the live stroke preview.
    if (drag?.kind === 'draw' || drag?.kind === 'airbrush') {
      ports.inputRef.current.sampling = false
      canvas.style.cursor = canvasToolCursor(ports.session.tool, ports.session.primaryColor)
      return
    }
    if (drag?.kind === 'create-slice' || drag?.kind === 'move-slice' || drag?.kind === 'resize-slice') {
      ports.inputRef.current.sampling = false
      canvas.style.cursor =
        drag.kind === 'resize-slice' && drag.handle
          ? displayedResizeCursorForHandle(drag.handle)
          : drag.kind === 'move-slice'
            ? drag.copy
              ? canvasCursors.copy
              : canvasCursors.move
            : selectionCreationCursor(ports.selectionCrosshair, true, false, ports.useLocalCursors)
      return
    }
    if (drag?.kind === 'transform-text-box') {
      ports.inputRef.current.sampling = false
      canvas.style.cursor = drag.handle ? displayedResizeCursorForHandle(drag.handle) : canvasCursors.move
      return
    }
    const temporaryMoveRequested = ports.temporaryMoveActive({ ctrlKey, metaKey: false, altKey, shiftKey })
    const transformCursor = drag?.kind === 'move-selection-pivot' ? canvasCursors.move : drag && selectionTransformCursorForDrag(drag)
    if (transformCursor) {
      ports.inputRef.current.sampling = false
      canvas.style.cursor = transformCursor
      return
    }
    if (drag?.kind === 'marquee' || drag?.kind === 'lasso' || drag?.kind === 'polygon-lasso' || drag?.kind === 'magic-preview') {
      ports.inputRef.current.sampling = false
      canvas.style.cursor = selectionCreationCursor(ports.selectionCrosshair, ports.selectionInteractionEditable, true, ports.useLocalCursors)
      return
    }
    if (drag?.kind === 'shape') {
      ports.inputRef.current.sampling = false
      canvas.style.cursor = canvasToolCursor(ports.session.tool, ports.session.primaryColor)
      return
    }
    const point = ports.localPointAt(clientX, clientY)
    const insideDocument = Boolean(point && point.x >= 0 && point.y >= 0 && point.x < ports.session.document.width && point.y < ports.session.document.height)
    const mask = activeLayerMask(ports.session)
    const cursorSampleProbe = window.__moonSpriteCanvasProbe
    const cursorSampleStartedAt = cursorSampleProbe?.recordOperationStage ? performance.now() : 0
    let contrastColor =
      insideDocument && point
        ? mask
          ? readLayerMaskDisplayColorAt(mask, point.x, point.y)
          : ports.cursorCompositePointSamplerFor(ports.session)(point.x, point.y)
        : ports.session.primaryColor
    cursorSampleProbe?.recordOperationStage?.('cursor.composite-sample', performance.now() - cursorSampleStartedAt)
    if (
      insideDocument &&
      point &&
      ports.activeLayerEditable &&
      previewCursorTools.has(ports.session.tool) &&
      (!ports.session.selection || selectionContains(ports.session.selection, point.x, point.y))
    ) {
      const layer = activePaintLayer(ports.session)
      if (!isLayerEffectivelyLocked(ports.session.document, layer)) {
        const index = point.y * ports.session.document.width + point.x
        const source = ports.session.tool === 'eraser' ? TRANSPARENT : ports.session.primaryColor
        const replacement = source.a > 0 && source.a < 255 ? blendOver(readLayerColor(ports.session.document, layer, index), source) : source
        const resolvedReplacement = resolveLayerCanvasColor(ports.session.document, layer, replacement)
        const replacementSampleStartedAt = cursorSampleProbe?.recordOperationStage ? performance.now() : 0
        contrastColor = mask
          ? layerMaskDisplayColor(resolvedReplacement)
          : ports.cursorCompositePointReplacementSamplerFor(ports.session, layer.id)(point.x, point.y, resolvedReplacement)
        cursorSampleProbe?.recordOperationStage?.('cursor.replacement-sample', performance.now() - replacementSampleStartedAt)
      }
    }
    if (insideDocument && point && contrastColor.a < 255) contrastColor = blendOver(transparencyColorAt(point.x, point.y, ports.checkerboard), contrastColor)
    const altActive = ports.inputRef.current.altHeld || altKey
    const ctrlActive = ports.inputRef.current.ctrlHeld || ctrlKey
    const brushSizeTool =
      ports.session.tool === 'pencil' ||
      ports.session.tool === 'line' ||
      ports.session.tool === 'airbrush' ||
      ports.session.tool === 'eraser' ||
      ports.session.tool === 'smooth' ||
      (ports.session.tool === 'selection' && ports.session.selectionKind === 'brush') ||
      ports.session.tool === 'liquify'
    const modifierSizing =
      brushSizeAdjustmentPreviewActive ||
      ((ports.activeLayer.kind !== 'tilemap' || ports.session.tilemapMode !== 'paint') &&
        ports.modifierActive({ ctrlKey, metaKey: false, altKey, shiftKey }, 'brushSizeAdjust') &&
        brushSizeTool)
    const wheelSizing = ports.wheelBrushSizePreviewRef.current && brushSizeTool
    const selectedTextBox = selectedTextBoxForSession(ports.session)
    const rawSelectionHit = ports.session.tool === 'selection' || selectedTextBox ? selectionHitAt(clientX, clientY) : 'outside'
    const selectionPivotHovered = !freeTransformActive && !ctrlActive && !altActive && !shiftKey && ports.selectionPivotHitAt(clientX, clientY)
    const addingToSelection = Boolean(ports.session.selection && shiftKey)
    const temporaryMove =
      !freeTransformActive &&
      temporaryMoveRequested &&
      temporaryMoveForCanvasInteractionAllowed(ports.session.tool, ports.session.moveKind, rawSelectionHit, addingToSelection, ports.session.selectionKind)
    const selectionModifierActive = shiftKey
    const selectionHit = selectionModifierActive
      ? 'outside'
      : ports.session.selectionMode === 'replace' || ports.session.selectionMode === 'add' || rawSelectionHit !== 'inside'
        ? rawSelectionHit
        : 'outside'
    const centeredSelectionResize = ports.session.tool === 'selection' && selectionHit in resizeCursors
    const moveToolActive = ports.session.tool === 'move' || temporaryMove
    const moveCopyAvailable =
      moveToolActive &&
      insideDocument &&
      Boolean(
        ports.session.moveAutoSelect
          ? point && (ports.topEditableLayerAt(point) ?? (ports.activeLayerEditable ? getActiveLayer(ports.session.document) : null))
          : ports.activeLayerEditable
      )
    const selectionCopyAvailable =
      !temporaryMove &&
      ports.session.tool === 'selection' &&
      !altActive &&
      ctrlActive &&
      selectionHitStartsContentMove(selectionHit, true) &&
      ports.selectionLayersEditable &&
      (!ports.session.pendingPaste || shouldRestartFloatingSelectionForCopy(ports.session.pendingPaste.copy, true))
    const copyAvailable = (altActive && moveCopyAvailable) || selectionCopyAvailable
    const textCopyAvailable = ports.session.tool === 'text' && altActive && Boolean(point && ports.textLayerAt(point))
    const sampling =
      paletteSamplingShortcutActive() ||
      ports.session.tool === 'eyedropper' ||
      ((ports.quickToolActive('eyedropper') || (ports.session.tool === 'rotate' && altKey)) &&
        !centeredSelectionResize &&
        !(moveToolActive && moveCopyAvailable) &&
        !modifierSizing)
    ports.inputRef.current.sampling = sampling
    if (sampling && ports.session.tool === 'rotate') ports.updateRotationIndicator(ports.liveViewRef.current.rotation, false)
    const moveAvailable = insideDocument && ports.hasSelectedMovableLayer && isToolAvailableForSession(ports.session, 'move')
    const available =
      temporaryMove || (ports.session.tool === 'move' && ports.session.moveKind === 'move')
        ? moveAvailable
        : insideDocument && (ports.session.tool === 'selection' ? ports.selectionLayersEditable : ports.activeLayerEditable)
    const resizeEdge = ports.canvasResizeHitAt(clientX, clientY)
    if (modifierSizing || wheelSizing) canvas.style.cursor = canvasToolCursor('pencil', contrastColor)
    else if (resizeEdge) canvas.style.cursor = displayedResizeCursorForHandle(resizeEdge as SelectionHandle)
    else if (copyAvailable || textCopyAvailable) canvas.style.cursor = canvasCursors.copy
    // Ctrl temporarily switches the eyedropper to the move tool. Keep this
    // cursor ahead of sampling so the visual feedback matches the gesture.
    else if (temporaryMove) canvas.style.cursor = available || !insideDocument ? canvasCursors.move : canvasCursors.unavailable
    else if (sampling) canvas.style.cursor = canvasCursors.eyedropper
    else if (ports.session.tool === 'text' && selectedTextBox && rawSelectionHit in resizeCursors)
      canvas.style.cursor = displayedResizeCursorForHandle(rawSelectionHit as SelectionHandle)
    else if (ports.session.tool === 'text' && selectedTextBox && rawSelectionHit === 'inside') canvas.style.cursor = canvasCursors.move
    else if (ports.session.tool === 'selection' && ports.session.selectionKind === 'brush' && selectionBrushOwnsPointer(freeTransformActive, selectionHit))
      canvas.style.cursor = canvasToolCursor('pencil', contrastColor, available || !insideDocument)
    else if (ports.session.tool === 'selection') {
      const hit = selectionHit
      canvas.style.cursor = freeTransformActive
        ? hit in resizeCursors
          ? resizeCursorForHit(hit as SelectionHandle)
          : insideDocument ? canvasCursors.unavailable : canvasCursors.default
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
                    : selectionCreationCursor(ports.selectionCrosshair, !insideDocument || ports.selectionInteractionEditable || selectionModifierActive, false, ports.useLocalCursors)
    } else if (ports.sliceTool) {
      const selectedIds = ports.session.selectedSliceIds?.length
        ? ports.session.selectedSliceIds
        : ports.session.selectedSliceId
          ? [ports.session.selectedSliceId]
          : []
      const selectedSlice = selectedIds.length === 1 ? ports.session.document.slices?.find((slice) => slice.id === selectedIds[0]) : null
      const handle = selectedSlice ? ports.sliceHandleAt(clientX, clientY, selectedSlice) : null
      const hit = point ? sliceAtPoint(ports.session.document.slices ?? [], point.x, point.y) : null
      canvas.style.cursor = handle
        ? displayedResizeCursorForHandle(handle)
        : hit
          ? canvasCursors.move
          : selectionCreationCursor(ports.selectionCrosshair, true, false, ports.useLocalCursors)
    } else canvas.style.cursor = canvasToolCursor(ports.session.tool, contrastColor, available || !insideDocument)
  }

  const updateCursorAt = (clientX: number, clientY: number, ctrlKey: boolean, altKey: boolean, shiftKey = false): void => {
    const canvas = ports.canvasRef.current
    const hadSelectionCorners = canvas?.style.cursor === 'none'
    resolveCursorAt(clientX, clientY, ctrlKey, altKey, shiftKey)
    // Overlay-only paths also need a full draw when corner ownership changes.
    if (canvas && ports.inputRef.current.pointer.visible && hadSelectionCorners !== (canvas.style.cursor === 'none')) ports.scheduleDraw()
  }

  const updateCursor = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    const rotatableDragModifierReleaseOnly = ports.inputRef.current.drag?.kind === 'marquee' || ports.inputRef.current.drag?.kind === 'shape'
    ports.inputRef.current.syncModifierKeys(event, rotatableDragModifierReleaseOnly)
    const ctrlKey = rotatableDragModifierReleaseOnly ? ports.inputRef.current.ctrlHeld : event.ctrlKey
    const altKey = rotatableDragModifierReleaseOnly ? ports.inputRef.current.altHeld : event.altKey
    const shiftKey = rotatableDragModifierReleaseOnly ? ports.inputRef.current.shiftHeld : event.shiftKey
    const allowOutsideCopies = Boolean(
      (ports.inputRef.current.drag?.kind === 'draw' || ports.inputRef.current.drag?.kind === 'tile-draw') &&
        (ports.liveViewRef.current.tileRepeatMode ?? 'off') !== 'off'
    )
    const point = ports.localPointAt(event.clientX, event.clientY, allowOutsideCopies)
    if (point) ports.inputRef.current.updatePointer({ point, clientX: event.clientX, clientY: event.clientY, ctrlKey, altKey })
    updateCursorAt(event.clientX, event.clientY, ctrlKey, altKey, shiftKey)
  }

  useLayoutEffect(() => {
    const pointer = ports.inputRef.current.pointer
    if (!pointer.visible) {
      if (!ports.inputRef.current.drag && ports.canvasRef.current) {
        const playbackNavigationTool = ports.session.animationPlaying ? playbackCanvasNavigationTool(ports.session.tool) : null
        ports.canvasRef.current.style.cursor =
          ports.inputRef.current.spaceHeld || playbackNavigationTool === 'hand'
            ? canvasCursors.grab
            : canvasToolCursor(playbackNavigationTool ?? ports.session.tool, ports.session.primaryColor)
      }
      return
    }
    updateCursorAt(pointer.clientX, pointer.clientY, ports.inputRef.current.ctrlHeld, ports.inputRef.current.altHeld, ports.inputRef.current.shiftHeld)
    ports.scheduleDraw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    ports.session.tool,
    ports.session.selectionKind,
    ports.selectionCrosshair,
    ports.useLocalCursors,
    ports.session.selectionMode,
    ports.session.selection,
    ports.session.freeTransformActive,
    ports.session.freeTransformQuad?.nw.x,
    ports.session.freeTransformQuad?.nw.y,
    ports.session.freeTransformQuad?.ne.x,
    ports.session.freeTransformQuad?.ne.y,
    ports.session.freeTransformQuad?.se.x,
    ports.session.freeTransformQuad?.se.y,
    ports.session.freeTransformQuad?.sw.x,
    ports.session.freeTransformQuad?.sw.y,
    ports.session.pendingPaste?.transformQuad?.nw.x,
    ports.session.pendingPaste?.transformQuad?.nw.y,
    ports.session.pendingPaste?.transformQuad?.ne.x,
    ports.session.pendingPaste?.transformQuad?.ne.y,
    ports.session.pendingPaste?.transformQuad?.se.x,
    ports.session.pendingPaste?.transformQuad?.se.y,
    ports.session.pendingPaste?.transformQuad?.sw.x,
    ports.session.pendingPaste?.transformQuad?.sw.y,
    ports.session.primaryColor.r,
    ports.session.primaryColor.g,
    ports.session.primaryColor.b,
    ports.session.primaryColor.a,
    ports.session.animationPlaying,
    ports.session.symmetryAxes.horizontal,
    ports.session.symmetryAxes.vertical,
    ports.session.symmetryAxes.diagonalUp,
    ports.session.symmetryAxes.diagonalDown,
    ports.session.symmetryAxes.rotational,
    ports.symmetryCenter.x,
    ports.symmetryCenter.y,
    ports.symmetryAxisPreferences.locked,
    ports.symmetryAxisPreferences.thickness,
    ports.activeLayerEditable,
    ports.selectionLayersEditable,
    ports.hasSelectedMovableLayer,
    ports.quickToolMatch?.id,
    ports.quickToolMatch?.binding
  ])
  return {
    selectionHitAt,
    selectionHit,
    rotationCursorForHit,
    displayedResizeCursorForHandle,
    resizeCursorForHit,
    shearCursorForTransform,
    updateCursorAt,
    updateCursor
  }
}
