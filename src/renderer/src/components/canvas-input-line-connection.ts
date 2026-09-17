import type { FreeTileInstance } from '@shared/types-tiles'
import type { RasterLayer } from '@shared/types-layer'
import type { RgbaColor } from '@shared/types-color'
import type { SelectionMask, SelectionRect } from '@shared/types-selection'
import { beginPixelEdit } from '@/core/history'
import { inheritBrushPaintBaseline, paintLine } from '@/core/tools-brush'
import { type BrushGradientSample } from '@/core/tools-pixel-edit'
import { useWorkspace, type DocumentSession } from '@/store/workspace'
import { CanvasInputState } from '@/core/canvas-input-controller'
import { beginBrushSpeedTracking } from '@/core/canvas-input-pointer'
import { type CanvasPoint as Point } from '@/core/canvas-input-contracts'
import { nearestTileRepeatEquivalent, tileRepeatLineSegments, wrapDocumentPointForTileRepeat } from '@/core/tilemap'
import { freeTileSourceForId } from '@/core/free-tile-document'
import { freeTileSourceSnapshotFromEditRaster, type FreeTileSourceEditRaster } from '@/core/free-tile-edit'
import { LineAnchorHistory, brushAngleWithDynamics } from './canvas-stage-helpers'

interface Ports {
  lineConnectionActive: (event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>) => boolean
  lineAnchor: {
    x: number
    y: number
  } | null
  tileRepeatPointAt: (clientX: number, clientY: number) => Point | null
  resolveStraightLine: (
    from: Point,
    to: Point,
    constrained: boolean
  ) => {
    from: Point
    to: Point
  }
  modifierActive: (event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>, id: import('@/core/shortcuts').ShortcutId) => boolean
  lineAnchorHistoryRef: import('react').RefObject<LineAnchorHistory | null>
  balancedStraightLines: boolean
  brushLineGradient: (
    from: BrushGradientSample | undefined,
    to: BrushGradientSample | undefined
  ) =>
    | {
        startColor: RgbaColor
        endColor: RgbaColor
        fromAmount: number
        toAmount: number
        dither: import('@shared/types-brush').GradientDither
      }
    | undefined
  optimizedRotationEnabled: boolean
  t: (key: import('@/locales/contracts').TranslationKey, params?: import('@/locales/contracts').TranslationParams) => string
  compositeCacheRef: import('react').RefObject<import('@/components/canvas-composite-cache').CanvasCompositeCache>
  scheduleDraw: () => void
  symmetryCenter: import('@/core/symmetry').SymmetryCenter
  inputRef: import('react').RefObject<CanvasInputState>
}

export function createLineConnectionCanvasInput(ports: Ports) {
  function beginLineConnection({
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
  }: {
    event: React.PointerEvent<HTMLCanvasElement>
    hasRasterFocus: boolean
    editableLayer: RasterLayer
    session: DocumentSession
    canEditLayer: boolean
    tilemapPixelEditBlocked: boolean
    point: Point
    brushDynamicsAtEvent: (
      pointerEvent: Pick<React.PointerEvent<HTMLCanvasElement>, 'pointerId' | 'pointerType' | 'pressure' | 'buttons'>,
      speed?: number
    ) => {
      size: number
      opacityScale: number
      gradientAmount: number | null
      angle: number
    }
    activeColor: (button?: number) => RgbaColor
    brushGradientAt: (buttonColor: RgbaColor, gradientAmount: number | null) => BrushGradientSample | undefined
    prepareFreeTileSourceEdit: () => {
      source: NonNullable<ReturnType<typeof freeTileSourceForId>>
      instance: FreeTileInstance
      placementEdit: ReturnType<() => import('@/core/free-tile-document').FreeTilePlacementEdit | null>
      sourceEdit: FreeTileSourceEditRaster
      selection: SelectionMask | null
      sourceRegion: SelectionRect
    } | null
    activeBrushTexture: import('@shared/types-brush').BrushTexture
    activeBrushImage: import('@shared/types-brush').ImageBrush | null
    proceduralAntialiasStrength: number
    activeBrushPaintMode: import('@shared/types-brush').BrushPaintMode
    brushPatternOrigin: (point: Point, size?: number, imageBrush?: import('@shared/types-brush').ImageBrush | null) => Point
    activeBrushDither: import('@shared/types-brush').BrushDitherSettings | undefined
    state: ReturnType<typeof useWorkspace.getState>
    pixelEditSelection: SelectionMask | null
  }): boolean {
    const {
      lineConnectionActive,
      lineAnchor,
      tileRepeatPointAt,
      resolveStraightLine,
      modifierActive,
      lineAnchorHistoryRef,
      balancedStraightLines,
      brushLineGradient,
      optimizedRotationEnabled,
      t,
      compositeCacheRef,
      scheduleDraw,
      symmetryCenter,
      inputRef
    } = ports
    if (
      lineConnectionActive(event.nativeEvent) &&
      hasRasterFocus &&
      (editableLayer.kind !== 'tilemap' || session.tilemapMode !== 'paint') &&
      (editableLayer.kind !== 'free-tile' || session.freeTileMode !== 'paint') &&
      (session.tool === 'pencil' || session.tool === 'eraser') &&
      lineAnchor &&
      event.button === 0
    ) {
      if (canEditLayer && !tilemapPixelEditBlocked) {
        const repeatMode = session.view.tileRepeatMode ?? 'off'
        const repeatedPointer = tileRepeatPointAt(event.clientX, event.clientY) ?? point
        const repeatedAnchor = nearestTileRepeatEquivalent(lineAnchor, repeatedPointer, session.document.width, session.document.height, repeatMode)
        const line = resolveStraightLine(repeatedAnchor, repeatedPointer, modifierActive(event.nativeEvent, 'constrainLineDirections'))
        const repeatedStart = line.from
        const repeatedTarget = line.to
        const target = wrapDocumentPointForTileRepeat(repeatedTarget, session.document.width, session.document.height, repeatMode)
        const anchorHistory = lineAnchorHistoryRef.current
        const reuseAnchorBaseline = Boolean(
          anchorHistory &&
            anchorHistory.documentId === session.document.id &&
            anchorHistory.layerId === editableLayer.id &&
            anchorHistory.tool === session.tool &&
            anchorHistory.point.x === lineAnchor.x &&
            anchorHistory.point.y === lineAnchor.y &&
            session.history.latestUndoEntry === anchorHistory.entry
        )
        const edit = beginPixelEdit(editableLayer.id)
        if (reuseAnchorBaseline && anchorHistory) inheritBrushPaintBaseline(edit, anchorHistory.baseline)
        const dynamics = brushDynamicsAtEvent(event)
        const lineColor = activeColor()
        const gradient = brushGradientAt(lineColor, dynamics.gradientAmount)
        if (editableLayer.kind === 'free-tile' && session.freeTileMode === 'edit') {
          const prepared = prepareFreeTileSourceEdit()
          if (!prepared) return true
          const { source, placementEdit, sourceEdit, selection } = prepared
          const edit = beginPixelEdit(sourceEdit.layer.id)
          const localAnchor = { x: repeatedStart.x - sourceEdit.origin.x, y: repeatedStart.y - sourceEdit.origin.y }
          for (const segment of tileRepeatLineSegments(
            repeatedStart,
            repeatedTarget,
            session.document.width,
            session.document.height,
            repeatMode,
            balancedStraightLines ? 'balanced' : 'raster'
          )) {
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
                fromAngle: brushAngleWithDynamics(session, dynamics.angle),
                toAngle: brushAngleWithDynamics(session, dynamics.angle),
                gradient: brushLineGradient(gradient, gradient)
              },
              'off',
              activeBrushDither,
              optimizedRotationEnabled,
              session.inkMode
            )
          }
          const label = session.tool === 'eraser' ? t('canvas.history.eraserLine') : t('canvas.history.pencilLine')
          state.commitFreeTileSourceEdit(source.id, sourceEdit.before, freeTileSourceSnapshotFromEditRaster(sourceEdit), label, placementEdit ?? undefined)
          lineAnchorHistoryRef.current = null
          if (session.tool === 'eraser') state.setLastEraserPoint(target)
          else state.setLastPencilPoint(target)
          compositeCacheRef.current.invalidateAll()
          scheduleDraw()
          return true
        }
        for (const segment of tileRepeatLineSegments(
          repeatedStart,
          repeatedTarget,
          session.document.width,
          session.document.height,
          repeatMode,
          balancedStraightLines ? 'balanced' : 'raster'
        )) {
          paintLine(
            session.document,
            editableLayer,
            edit,
            segment.from.x,
            segment.from.y,
            segment.to.x,
            segment.to.y,
            session.brushSize,
            lineColor,
            pixelEditSelection,
            session.brushShape,
            session.tool === 'pencil' || session.tool === 'eraser' ? activeBrushTexture : 'solid',
            session.brushTextureScale,
            session.tool === 'pencil' || session.tool === 'eraser' ? activeBrushImage : null,
            session.brushImageSettings,
            proceduralAntialiasStrength,
            activeBrushPaintMode,
            brushPatternOrigin(repeatedStart),
            balancedStraightLines ? 'balanced' : 'raster',
            session.symmetryAxes,
            symmetryCenter,
            undefined,
            {
              fromSize: dynamics.size,
              toSize: dynamics.size,
              fromOpacityScale: dynamics.opacityScale,
              toOpacityScale: dynamics.opacityScale,
              fromAngle: brushAngleWithDynamics(session, dynamics.angle),
              toAngle: brushAngleWithDynamics(session, dynamics.angle),
              gradient: brushLineGradient(gradient, gradient)
            },
            repeatMode,
            activeBrushDither,
            optimizedRotationEnabled,
            session.tool === 'eraser' ? 'simple' : session.inkMode
          )
        }
        const label = session.tool === 'eraser' ? t('canvas.history.eraserLine') : t('canvas.history.pencilLine')
        const lineEntry = state.commitPixelEdit(edit, label, { stroke: true, durationMs: 1 })
        const mergedEntry = reuseAnchorBaseline && anchorHistory?.mergeWithNext && lineEntry ? session.history.mergeLastTwo(label) : null
        const currentEntry = mergedEntry ?? lineEntry
        const nextBaseline = reuseAnchorBaseline && anchorHistory ? new Map(anchorHistory.baseline) : new Map<number, number>()
        for (const [index, value] of edit.before) if (!nextBaseline.has(index)) nextBaseline.set(index, value)
        lineAnchorHistoryRef.current = currentEntry
          ? {
              documentId: session.document.id,
              layerId: editableLayer.id,
              tool: session.tool,
              point: { ...target },
              entry: currentEntry,
              baseline: nextBaseline,
              mergeWithNext: false
            }
          : null
        if (session.tool === 'eraser') state.setLastEraserPoint(target)
        else state.setLastPencilPoint(target)
        // Shift+click commits the connecting line immediately. Keep the
        // pointer gesture alive from its endpoint so the user can continue
        // with an ordinary freehand stroke while still holding the mouse;
        // an unchanged continuation edit commits nothing on pointer-up.
        inputRef.current.drag = {
          kind: 'draw',
          start: target,
          last: target,
          edit: beginPixelEdit(editableLayer.id),
          path: [
            {
              ...target,
              size: dynamics.size,
              opacityScale: dynamics.opacityScale,
              angle: brushAngleWithDynamics(session, dynamics.angle),
              color: lineColor,
              gradient
            }
          ],
          tileRepeatPoint: repeatedTarget,
          tileRepeatStart: repeatedTarget,
          patternOrigin: brushPatternOrigin(target, dynamics.size, activeBrushImage),
          color: lineColor,
          lastBrushSize: dynamics.size,
          lastOpacityScale: dynamics.opacityScale,
          lastBrushColor: lineColor,
          lastBrushGradientActive: Boolean(gradient),
          preserveLineAnchorOnNoop: true,
          brushSpeed: beginBrushSpeedTracking({ clientX: event.clientX, clientY: event.clientY, timeStamp: event.timeStamp }),
          startedAt: Date.now()
        }
      }
      return true
    }
    return false
  }
  return { beginLineConnection }
}
