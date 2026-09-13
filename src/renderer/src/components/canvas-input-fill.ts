import { recordRuntimeDiagnostic } from '../core/runtime-diagnostics'
import type { RasterLayer } from '@shared/types-layer'
import type { RgbaColor } from '@shared/types-color'
import type { SelectionMask } from '@shared/types-selection'
import { isLayerEffectivelyLocked } from '@/core/document-model'
import { createCompositePointSampler } from '@/core/document-composite'
import { applyGradient, gradientRegionSelection, type GradientGeometryOptions } from '@/core/gradient'
import { DEFAULT_GRID_SETTINGS, snapPointToGrid } from '@/core/grid'
import { floodFillSymmetric } from '@/core/tools-fill'
import { useWorkspace, type DocumentSession } from '@/store/workspace'
import { activePaintLayer } from '@/store/workspace-session'
import { selectionContains } from '@/core/selection'
import { CanvasInputState } from '@/core/canvas-input-controller'
import { type CanvasDragState as DragState, type CanvasPoint as Point } from '@/core/canvas-input-contracts'
import { canvasToolCursor } from '@/core/canvas-visuals'
import { type FreeTileSourceEditRaster } from '@/core/free-tile-edit'
import { GradientPreviewCoverageCache } from './canvas-stage-helpers'

interface Ports {
  gridSnapActive: boolean
  gradientPreviewCoverageCacheRef: import('react').RefObject<GradientPreviewCoverageCache | null>
  inputRef: import('react').RefObject<CanvasInputState>
  gradientStopsForButton: (button: number) => import('@shared/types-brush').GradientStop[] | undefined
  draw: () => void
  symmetryCenter: import('@/core/symmetry').SymmetryCenter
  t: (key: import('@/locales/contracts').TranslationKey, params?: import('@/locales/contracts').TranslationParams) => string
  gradientPreviewDiagnosticsRef: import('react').RefObject<{
    record(
      key: string,
      detail: import('@/core/runtime-diagnostics').RuntimeDiagnosticDetail,
      timing: import('@/core/gradient-preview-diagnostics').GradientPreviewTiming
    ): void
    flush: () => void
  } | null>
  gradientPreviewInputAtRef: import('react').RefObject<number>
  updateGradientDragGeometry: (drag: DragState, point: Point, modifiers: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>) => void
  scheduleDraw: () => void
  freeTileSourceEditForDrag: (drag: DragState) => FreeTileSourceEditRaster | null
  freeTileLocalPoint: (drag: DragState, point: Point) => Point
  gradientDither: import('@shared/types-brush').GradientDither
  gradientType: import('@shared/types-brush').GradientType
  gradientGeometryOptionsForDrag: (
    drag: Pick<DragState, 'constrain' | 'gradientFromCenter' | 'gradientAngle' | 'gradientRadialGeometry'>
  ) => GradientGeometryOptions | undefined
  gradientStops: import('@shared/types-brush').GradientStop[] | undefined
  commitFreeTileSourceDrag: (drag: DragState, label: string) => boolean
  paintSelectionForDrag: (drag: DragState) => SelectionMask | null
}

export function createFillCanvasInput(ports: Ports) {
  function beginFill({
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
  }: {
    session: DocumentSession
    canEditLayer: boolean
    tilemapPixelEditBlocked: boolean
    point: Point
    fillKind: import('@shared/types-brush').FillKind
    event: React.PointerEvent<HTMLCanvasElement>
    pixelEditSelection: SelectionMask | null
    gradientType: import('@shared/types-brush').GradientType
    activeColor: (button?: number) => RgbaColor
    editableLayer: RasterLayer
    tilemapEditDragState:
      | {
          tilemapEditSelection: SelectionMask
        }
      | {
          tilemapEditSelection?: undefined
        }
    activeBrushImage: import('@shared/types-brush').ImageBrush | null
    activeBrushTexture: import('@shared/types-brush').BrushTexture
    proceduralAntialiasStrength: number
    activeBrushPaintMode: import('@shared/types-brush').BrushPaintMode
    state: ReturnType<typeof useWorkspace.getState>
  }): boolean {
    const { gridSnapActive, gradientPreviewCoverageCacheRef, inputRef, gradientStopsForButton, draw, symmetryCenter, t } = ports
    if (session.tool === 'fill') {
      if (!canEditLayer || tilemapPixelEditBlocked) return true
      const fillPoint = gridSnapActive ? snapPointToGrid(point, session.view.grid ?? DEFAULT_GRID_SETTINGS) : point
      if (fillKind === 'gradient' && (event.button === 0 || event.button === 2)) {
        if (pixelEditSelection && !selectionContains(pixelEditSelection, fillPoint.x, fillPoint.y)) return true
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
          gradientPaintRegion: gradientRegionSelection(session.document, editableLayer, fillPoint, session.gradientTolerance, session.gradientContiguous, {
            sourceColorAt: session.fillReference === 'visible-layers' ? createCompositePointSampler(session.document) : undefined,
            connectivity: session.fillConnectivity
          }),
          ...tilemapEditDragState
        }
        draw()
        return true
      }
      const operationProbe = window.__moonSpriteCanvasProbe
      const profiler = operationProbe?.recordOperationStage
        ? {
            record: (stage: string, duration: number, detail?: Record<string, number | string | boolean>) =>
              operationProbe.recordOperationStage?.(stage, duration, detail)
          }
        : undefined
      const edit = floodFillSymmetric(
        session.document,
        editableLayer,
        fillPoint.x,
        fillPoint.y,
        activeColor(event.button),
        pixelEditSelection,
        session.fillMode === 'contiguous',
        activeBrushImage,
        session.brushSize,
        session.brushImageSettings,
        activeBrushTexture,
        session.brushTextureScale,
        proceduralAntialiasStrength,
        activeBrushPaintMode,
        session.symmetryAxes,
        symmetryCenter,
        session.fillTolerance,
        session.fillMode === 'contiguous' && session.fillGapClosing ? session.fillGapThreshold : 0,
        profiler,
        {
          sourceColorAt: session.fillReference === 'visible-layers' ? createCompositePointSampler(session.document) : undefined,
          connectivity: session.fillConnectivity
        }
      )
      if (edit) {
        const commitStartedAt = operationProbe?.recordOperationStage ? performance.now() : 0
        state.commitPixelEdit(
          edit,
          activeBrushImage || activeBrushTexture !== 'solid'
            ? t('canvas.history.brushFill')
            : session.fillMode === 'contiguous'
              ? t('canvas.history.contiguousFill')
              : t('canvas.history.nonContiguousFill')
        )
        operationProbe?.recordOperationStage?.('bucket.commit-total', performance.now() - commitStartedAt, {
          points: edit.before.size,
          runs: edit.runs?.length ?? 0
        })
      }
      return true
    }
    return false
  }

  function moveGradient({
    drag,
    event,
    session,
    point
  }: {
    drag: DragState
    event: React.PointerEvent<HTMLCanvasElement>
    session: DocumentSession
    point: Point
  }): boolean {
    const { gradientPreviewDiagnosticsRef, gradientPreviewInputAtRef, inputRef, updateGradientDragGeometry, scheduleDraw } = ports
    if (drag.kind === 'gradient') {
      if (gradientPreviewDiagnosticsRef.current) {
        const now = performance.now()
        gradientPreviewInputAtRef.current = event.timeStamp > 0 && event.timeStamp <= now ? event.timeStamp : now
      }
      inputRef.current.sampling = false
      event.currentTarget.style.cursor = canvasToolCursor(session.tool, session.primaryColor)
      drag.rawLast = point
      updateGradientDragGeometry(drag, point, event)
      scheduleDraw()
      return true
    }
    return false
  }

  function endGradient({ drag, session, state }: { drag: DragState; session: DocumentSession; state: ReturnType<typeof useWorkspace.getState> }): boolean {
    const {
      gradientPreviewCoverageCacheRef,
      freeTileSourceEditForDrag,
      freeTileLocalPoint,
      gradientDither,
      gradientType,
      gradientGeometryOptionsForDrag,
      gradientStops,
      commitFreeTileSourceDrag,
      t,
      paintSelectionForDrag,
      draw
    } = ports
    if (drag.kind === 'gradient') {
      gradientPreviewCoverageCacheRef.current = null
      const commitStartedAt = performance.now()
      let rasterMs = 0,
        historyMs = 0
      const moved = drag.start.x !== drag.last.x || drag.start.y !== drag.last.y
      const sourceEdit = freeTileSourceEditForDrag(drag)
      if (sourceEdit) {
        if (moved) {
          const edit = applyGradient(
            sourceEdit.document,
            sourceEdit.layer,
            freeTileLocalPoint(drag, drag.start),
            freeTileLocalPoint(drag, drag.last),
            drag.color ?? session.primaryColor,
            drag.gradientEndColor ?? session.secondaryColor,
            drag.freeTileEditSelection ?? null,
            gradientDither,
            drag.freeTileGradientPaintRegion,
            gradientType,
            gradientGeometryOptionsForDrag(drag),
            drag.gradientStops ?? gradientStops
          )
          if (edit) commitFreeTileSourceDrag(drag, t('canvas.history.gradient'))
          else if (drag.freeTilePlacementEdit) state.cancelFreeTilePlacement(drag.freeTilePlacementEdit)
        } else if (drag.freeTilePlacementEdit) state.cancelFreeTilePlacement(drag.freeTilePlacementEdit)
      } else if (moved) {
        const layer = activePaintLayer(session)
        if (!isLayerEffectivelyLocked(session.document, layer)) {
          const rasterStartedAt = performance.now()
          const edit = applyGradient(
            session.document,
            layer,
            drag.start,
            drag.last,
            drag.color ?? session.primaryColor,
            drag.gradientEndColor ?? session.secondaryColor,
            paintSelectionForDrag(drag),
            gradientDither,
            drag.gradientPaintRegion,
            gradientType,
            gradientGeometryOptionsForDrag(drag),
            drag.gradientStops ?? gradientStops
          )
          rasterMs = performance.now() - rasterStartedAt
          const historyStartedAt = performance.now()
          if (edit) state.commitPixelEdit(edit, t('canvas.history.gradient'))
          historyMs = performance.now() - historyStartedAt
        }
      }
      const drawStartedAt = performance.now()
      draw()
      const finishedAt = performance.now()
      const detail = {
        rasterMs,
        historyMs,
        drawMs: finishedAt - drawStartedAt,
        totalMs: finishedAt - commitStartedAt,
        width: session.document.width,
        height: session.document.height,
        dither: gradientDither,
        type: gradientType,
        freeTile: Boolean(sourceEdit)
      }
      window.__moonSpriteCanvasProbe?.recordOperationStage?.('gradient.commit', detail.totalMs, detail)
      if (import.meta.env.DEV) recordRuntimeDiagnostic('operation-end', 'gradient.commit', detail)
      return true
    }
    return false
  }
  return { beginFill, moveGradient, endGradient }
}
