import { processRasterStrokeMove } from './canvas-raster-stroke'
import type { RasterLayer } from '@shared/types-layer'
import type { RgbaColor } from '@shared/types-color'
import type { SelectionMask, SelectionRect } from '@shared/types-selection'
import { animationMaskAt } from '@/core/document-model'
import { beginPixelEdit, mergePixelEdits } from '@/core/history'
import { applyLiquifyHoldPath, applyLiquifyPushPath, createLiquifyPushStroke, temporaryLiquifyModeForShift } from '@/core/liquify'
import { collectSmoothBrushArea } from '@/core/smooth-brush'
import { applyAccumulatedLiquifyPush } from '@/components/canvas-liquify-interaction'
import { DEFAULT_GRID_SETTINGS, snapPointToGrid } from '@/core/grid'
import { useWorkspace, type DocumentSession } from '@/store/workspace'
import { activePaintLayer } from '@/store/workspace-session'
import { CanvasInputState } from '@/core/canvas-input-controller'
import { shouldPreserveLineAnchorAfterNoopDrag } from '@/core/canvas-input-preview'
import { type CanvasDragState as DragState, type CanvasPoint as Point } from '@/core/canvas-input-contracts'
import { type FreeTileSourceEditRaster } from '@/core/free-tile-edit'
import { LineAnchorHistory, brushAngleWithDynamics } from './canvas-stage-helpers'

interface Ports {
  inputRef: import('react').RefObject<CanvasInputState>
  optimizedRotationEnabled: boolean
  scheduleDraw: () => void
  localContinuousPointAt: (clientX: number, clientY: number) => Point | null
  applyLiquifyHoldRef: import('react').RefObject<(drag: DragState) => void>
  scheduleLiquifyTimer: () => void
  gridSnapActive: boolean
  sprayAirbrushRef: import('react').RefObject<(drag: DragState) => void>
  scheduleAirbrushTimer: () => void
  canvasPreferences: import('@/core/file-preferences').EditorPreferences
  repeatedDocumentPointsAt: (
    clientX: number,
    clientY: number,
    continuous?: boolean,
    allowOutsideCopies?: boolean
  ) => {
    local: Point
    repeated: Point
    offset: {
      x: number
      y: number
    }
  } | null
  invalidateStrokeSegment: (from: Point, to: Point, size?: number, angle?: number) => void
  invalidateCompositeRect: (selection: SelectionRect | null | undefined, layerIds?: readonly string[]) => void
  compositeCacheRef: import('react').RefObject<import('@/components/canvas-composite-cache').CanvasCompositeCache>
  t: (key: import('@/locales/contracts').TranslationKey, params?: import('@/locales/contracts').TranslationParams) => string
  lineAnchorHistoryRef: import('react').RefObject<LineAnchorHistory | null>
  freeTileSourceEditForDrag: (drag: DragState) => FreeTileSourceEditRaster | null
  commitFreeTileSourceDrag: (drag: DragState, label: string) => boolean
}

export function createStrokeCanvasInput(ports: Ports) {
  function beginSmooth({
    session,
    event,
    hasRasterFocus,
    canEditLayer,
    tilemapPixelEditBlocked,
    editableLayer,
    point
  }: {
    session: DocumentSession
    event: React.PointerEvent<HTMLCanvasElement>
    hasRasterFocus: boolean
    canEditLayer: boolean
    tilemapPixelEditBlocked: boolean
    editableLayer: RasterLayer
    point: Point
  }): boolean {
    const { inputRef, optimizedRotationEnabled, scheduleDraw } = ports
    if (session.tool === 'smooth') {
      if (event.button !== 0) return true
      if (!hasRasterFocus || !canEditLayer || tilemapPixelEditBlocked || editableLayer.kind || session.activeLayerMaskId) return true
      const drag: DragState = {
        kind: 'smooth',
        start: point,
        last: point,
        edit: beginPixelEdit(editableLayer.id),
        smoothStroke: { visited: new Set() },
        startedAt: Date.now()
      }
      inputRef.current.drag = drag
      collectSmoothBrushArea(
        session.document,
        drag.smoothStroke!,
        point,
        point,
        session.brushSize,
        session.selection,
        session.brushShape,
        brushAngleWithDynamics(session),
        optimizedRotationEnabled
      )
      scheduleDraw()
      return true
    }
    return false
  }

  function beginLiquify({
    session,
    event,
    hasRasterFocus,
    canEditLayer,
    tilemapPixelEditBlocked,
    editableLayer,
    state
  }: {
    session: DocumentSession
    event: React.PointerEvent<HTMLCanvasElement>
    hasRasterFocus: boolean
    canEditLayer: boolean
    tilemapPixelEditBlocked: boolean
    editableLayer: RasterLayer
    state: ReturnType<typeof useWorkspace.getState>
  }): boolean {
    const { localContinuousPointAt, inputRef, applyLiquifyHoldRef, scheduleLiquifyTimer } = ports
    if (session.tool === 'liquify' && (event.button === 0 || event.button === 2)) {
      if (!hasRasterFocus || !canEditLayer || tilemapPixelEditBlocked || editableLayer.kind) return true
      // A liquify gesture must start and continue in the same continuous
      // document coordinate space. Falling back to the integer `point` when
      // the continuous conversion fails injects a positive subpixel delta on
      // the first move, which makes every stroke drift toward bottom-right.
      const liquifyPoint = localContinuousPointAt(event.clientX, event.clientY)
      if (!liquifyPoint) return true
      const liquifyMode = temporaryLiquifyModeForShift(session.liquifyMode, event.shiftKey || inputRef.current.shiftHeld)
      const drag: DragState = {
        kind: 'liquify',
        start: liquifyPoint,
        last: liquifyPoint,
        edit: beginPixelEdit(editableLayer.id),
        liquifyMode,
        liquifyPushStroke: createLiquifyPushStroke(),
        liquifyCompound: state.beginLiquifyStroke(editableLayer.id),
        startedAt: Date.now()
      }
      inputRef.current.drag = drag
      state.setLiquifyGestureActive(true)
      if (liquifyMode !== 'push') {
        // Apply the first stationary liquify impulse immediately. The hold
        // clock intentionally starts after one step, so inflate/deflate/twist
        // must not wait for its first RAF tick before producing any effect.
        applyLiquifyHoldRef.current(drag)
        scheduleLiquifyTimer()
      }
      return true
    }
    return false
  }

  function beginAirbrush({
    session,
    hasRasterFocus,
    canEditLayer,
    tilemapPixelEditBlocked,
    event,
    point,
    editableLayer,
    activeColor,
    tilemapEditDragState
  }: {
    session: DocumentSession
    hasRasterFocus: boolean
    canEditLayer: boolean
    tilemapPixelEditBlocked: boolean
    event: React.PointerEvent<HTMLCanvasElement>
    point: Point
    editableLayer: RasterLayer
    activeColor: (button?: number) => RgbaColor
    tilemapEditDragState:
      | {
          tilemapEditSelection: SelectionMask
        }
      | {
          tilemapEditSelection?: undefined
        }
  }): boolean {
    const { gridSnapActive, inputRef, sprayAirbrushRef, scheduleAirbrushTimer } = ports
    if (session.tool === 'airbrush') {
      if (!hasRasterFocus || !canEditLayer || tilemapPixelEditBlocked || (event.button !== 0 && event.button !== 2)) return true
      const airbrushPoint = gridSnapActive ? snapPointToGrid(point, session.view.grid ?? DEFAULT_GRID_SETTINGS) : point
      const drag: DragState = {
        kind: 'airbrush',
        start: airbrushPoint,
        last: airbrushPoint,
        edit: beginPixelEdit(editableLayer.id),
        color: activeColor(event.button),
        startedAt: Date.now(),
        nextAirbrushAt: performance.now() + session.airbrushIntervalMs,
        ...tilemapEditDragState
      }
      inputRef.current.drag = drag
      sprayAirbrushRef.current(drag)
      scheduleAirbrushTimer()
      return true
    }
    return false
  }

  function moveSmooth({ drag, session, point }: { drag: DragState; session: DocumentSession; point: Point }): boolean {
    const { optimizedRotationEnabled, scheduleDraw } = ports
    if (drag.kind === 'smooth' && drag.edit && drag.smoothStroke) {
      collectSmoothBrushArea(
        session.document,
        drag.smoothStroke,
        drag.last,
        point,
        session.brushSize,
        session.selection,
        session.brushShape,
        brushAngleWithDynamics(session),
        optimizedRotationEnabled
      )
      drag.last = point
      scheduleDraw()
      return true
    }
    return false
  }

  function moveRaster({
    drag,
    session,
    previousPoint,
    event,
    pointerSamples
  }: {
    drag: DragState
    session: DocumentSession
    previousPoint: Point
    event: React.PointerEvent<HTMLCanvasElement>
    pointerSamples: {
      clientX: number
      clientY: number
      timeStamp?: number
      pointerType: string
      pressure: number | undefined
      pressureAvailable: boolean
      previousPressure: number | undefined
    }[]
  }): boolean {
    const { canvasPreferences, repeatedDocumentPointsAt, invalidateStrokeSegment, invalidateCompositeRect, compositeCacheRef, scheduleDraw } = ports
    if (drag.kind === 'draw' && drag.edit) {
      processRasterStrokeMove(
        { session, drag, previousPoint, pointerType: event.pointerType, pointerSamples, preferences: canvasPreferences },
        { documentPointsAt: repeatedDocumentPointsAt },
        {
          strokeSegment: invalidateStrokeSegment,
          rect: invalidateCompositeRect,
          all: () => compositeCacheRef.current.invalidateAll(),
          requestDraw: scheduleDraw
        }
      )
      return true
    }
    return false
  }

  function moveAirbrush({ drag, point, session }: { drag: DragState; point: Point; session: DocumentSession }): boolean {
    const { gridSnapActive, scheduleDraw } = ports
    if (drag.kind === 'airbrush') {
      drag.last = gridSnapActive ? snapPointToGrid(point, session.view.grid ?? DEFAULT_GRID_SETTINGS) : point
      scheduleDraw()
      return true
    }
    return false
  }

  function moveLiquify({ drag, event, session }: { drag: DragState; event: React.PointerEvent<HTMLCanvasElement>; session: DocumentSession }): boolean {
    const { localContinuousPointAt, invalidateCompositeRect, scheduleDraw } = ports
    if (drag.kind === 'liquify' && drag.edit) {
      // Liquify already resamples the segment between dispatched pointer
      // events. Using the browser/driver coalesced list here can replay stale
      // or out-of-order coordinates and corrupt the deformation direction.
      const currentPoint = localContinuousPointAt(event.clientX, event.clientY)
      if (!currentPoint) return true
      const points: Point[] = [currentPoint]
      if ((drag.liquifyMode ?? session.liquifyMode) === 'push') {
        const timeline = session.document.animation
        const layer = activePaintLayer(session)
        const mask = timeline ? animationMaskAt(timeline, layer.id, timeline.activeFrameId) : null
        let dirtyRect: SelectionRect | null = null
        const result = applyAccumulatedLiquifyPush(drag.last, points, (from, path) => {
          const applied = applyLiquifyPushPath(session.document, layer, drag.edit!, (drag.liquifyPushStroke ??= createLiquifyPushStroke()), from, path, {
            radius: session.liquifyRadius,
            strength: session.liquifyStrength,
            selection: session.selection,
            mask
          })
          dirtyRect = applied.dirtyRect
          return applied.changed
        })
        if (result.changed && dirtyRect) invalidateCompositeRect(dirtyRect, [layer.id])
        drag.last = result.pointerPoint
      } else {
        const next = points.at(-1)!
        const timeline = session.document.animation
        const layer = activePaintLayer(session)
        const mask = timeline ? animationMaskAt(timeline, layer.id, timeline.activeFrameId) : null
        const result = applyLiquifyHoldPath(session.document, layer, drag.edit, drag.last, next, {
          mode: drag.liquifyMode ?? session.liquifyMode,
          radius: session.liquifyRadius,
          strength: session.liquifyStrength,
          selection: session.selection,
          mask
        })
        if (result.changed) invalidateCompositeRect(result.dirtyRect, [layer.id])
        drag.last = next
      }
      scheduleDraw()
      return true
    }
    return false
  }

  function endRaster({ drag, state, session }: { drag: DragState; state: ReturnType<typeof useWorkspace.getState>; session: DocumentSession }): boolean {
    const { t, compositeCacheRef, lineAnchorHistoryRef } = ports
    if (drag.kind === 'draw' && drag.edit) {
      // Do not promote the live preview to the committed surface here. Fast
      // pointer sampling can leave intermediate stroke strips unpainted in
      // the cache even though the document edit is complete; treating that
      // preview as authoritative is what produces visible gaps until an eye
      // toggle forces a redraw. The committed dirty rect below is the source
      // of truth and will repaint every affected strip.
      if (drag.perfectPixelCommittedEdit) drag.edit = mergePixelEdits(drag.perfectPixelCommittedEdit, drag.edit)
      const entry = state.commitPixelEdit(drag.edit, session.tool === 'eraser' ? t('canvas.history.eraser') : t('canvas.history.draw'), {
        stroke: true,
        durationMs: Math.max(1, Date.now() - (drag.startedAt ?? Date.now()))
      })
      if (!entry) compositeCacheRef.current.clearLivePreview(session.document)
      // `commitPixelEdit` already publishes the edit's dirty rectangle through
      // `contentInvalidation`.  Keep the existing composite surface alive so
      // the next frame only recomposes the stroke bounds.  Invalidating the
      // whole 4K surface here turns every short stroke into a full-canvas
      // rebuild (the dominant source of the DEV.5 regression).
      const firstPathPoint = drag.path?.[0]
      const singlePoint = Boolean(firstPathPoint && drag.path?.every((point) => point.x === firstPathPoint.x && point.y === firstPathPoint.y))
      if (!shouldPreserveLineAnchorAfterNoopDrag(drag, Boolean(entry)))
        lineAnchorHistoryRef.current =
          entry && singlePoint
            ? {
                documentId: session.document.id,
                layerId: drag.edit.layerId,
                tool: session.tool === 'eraser' ? 'eraser' : 'pencil',
                point: { ...drag.last },
                entry,
                baseline: new Map(drag.edit.before),
                mergeWithNext: true
              }
            : null
      if (session.tool === 'eraser') state.setLastEraserPoint(drag.last)
      else state.setLastPencilPoint(drag.last)
    }
    return false
  }

  function endSmooth({ drag, state }: { drag: DragState; state: ReturnType<typeof useWorkspace.getState> }): boolean {
    const { invalidateCompositeRect, t } = ports
    if (drag.kind === 'smooth' && drag.edit) {
      if (drag.smoothStroke) state.applySmoothBrushStroke(drag.edit, drag.smoothStroke)
      if (drag.edit.dirtyRect) invalidateCompositeRect(drag.edit.dirtyRect, [drag.edit.layerId])
      state.commitPixelEdit(drag.edit, t('canvas.history.smooth'), { stroke: true, durationMs: Math.max(1, Date.now() - (drag.startedAt ?? Date.now())) })
    }
    return false
  }

  function endAirbrush({ drag, state }: { drag: DragState; state: ReturnType<typeof useWorkspace.getState> }): boolean {
    const { freeTileSourceEditForDrag, commitFreeTileSourceDrag, t } = ports
    if (drag.kind === 'airbrush' && drag.edit) {
      if (freeTileSourceEditForDrag(drag)) commitFreeTileSourceDrag(drag, t('canvas.history.airbrush'))
      else
        state.commitPixelEdit(drag.edit, t('canvas.history.airbrush'), { stroke: true, durationMs: Math.max(1, Date.now() - (drag.startedAt ?? Date.now())) })
    }
    return false
  }

  function endLiquify({ drag, state }: { drag: DragState; state: ReturnType<typeof useWorkspace.getState> }): boolean {
    const { t } = ports
    if (drag.kind === 'liquify' && drag.edit) {
      state.setLiquifyGestureActive(false)
      state.commitLiquifyStroke(
        drag.edit,
        t('canvas.history.liquify'),
        Boolean(drag.liquifyCompound),
        { stroke: true, durationMs: Math.max(1, Date.now() - (drag.startedAt ?? Date.now())) },
        drag.liquifyMode === 'push'
      )
    }
    return false
  }
  return { beginSmooth, beginLiquify, beginAirbrush, moveSmooth, moveRaster, moveAirbrush, moveLiquify, endRaster, endSmooth, endAirbrush, endLiquify }
}
