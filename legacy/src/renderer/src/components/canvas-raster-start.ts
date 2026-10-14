import type { RasterLayer } from '@shared/types-layer'
import type { RgbaColor } from '@shared/types-color'
import type { SelectionMask } from '@shared/types-selection'
import { beginPixelEdit } from '@/core/history'
import { brushStampAnchor, paintBrush } from '@/core/tools-brush'
import { type BrushGradientSample } from '@/core/tools-pixel-edit'
import { type DocumentSession } from '@/store/workspace'
import { CanvasInputState, beginBrushSpeedTracking, type CanvasPoint as Point } from '@/core/canvas-input'
import { wrapDocumentPointForTileRepeat } from '@/core/tilemap'
import { brushAngleWithDynamics } from './canvas-stage-helpers'
export function createCanvasRasterStart(ports: {
  tileRepeatPointAt: (clientX: number, clientY: number) => Point | null
  isoGridSnapActive: boolean
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
  snapToIsoGrid: (point: Point) => Point
  gridSnapActive: boolean
  snapBrushPointToGrid: (
    point: Point,
    size: number,
    imageBrush?: Parameters<typeof brushStampAnchor>[1],
    angle?: number,
    currentSession?: DocumentSession
  ) => Point
  symmetryCenter: import('@/core/symmetry').SymmetryCenter
  optimizedRotationEnabled: boolean
  invalidateStrokeSegment: (from: Point, to: Point, size?: number, angle?: number) => void
  inputRef: import('react').RefObject<CanvasInputState>
  isoLineAlignmentActive: boolean
  scheduleDraw: () => void
}) {
  return ({
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
  }: {
    tilemapPixelEditBlocked: boolean
    session: DocumentSession
    brushDynamicsAtEvent: (
      pointerEvent: Pick<React.PointerEvent<HTMLCanvasElement>, 'pointerId' | 'pointerType' | 'pressure' | 'buttons'>,
      speed?: number
    ) => {
      size: number
      opacityScale: number
      gradientAmount: number | null
      angle: number
    }
    event: React.PointerEvent<HTMLCanvasElement>
    point: Point
    activeBrushImage: import('@shared/types-brush').ImageBrush | null
    editableLayer: RasterLayer
    brushPatternOrigin: (point: Point, size?: number, imageBrush?: import('@shared/types-brush').ImageBrush | null) => Point
    activeColor: (button?: number) => RgbaColor
    brushGradientAt: (buttonColor: RgbaColor, gradientAmount: number | null) => BrushGradientSample | undefined
    pixelEditSelection: SelectionMask | null
    activeBrushTexture: import('@shared/types-brush').BrushTexture
    proceduralAntialiasStrength: number
    activeBrushPaintMode: import('@shared/types-brush').BrushPaintMode
    activeBrushDither: import('@shared/types-brush').BrushDitherSettings | undefined
    tilemapEditDragState:
      | {
          tilemapEditSelection: SelectionMask
        }
      | {
          tilemapEditSelection?: undefined
        }
  }) => {
    const {
      tileRepeatPointAt,
      isoGridSnapActive,
      repeatedDocumentPointsAt,
      snapToIsoGrid,
      gridSnapActive,
      snapBrushPointToGrid,
      symmetryCenter,
      optimizedRotationEnabled,
      invalidateStrokeSegment,
      inputRef,
      isoLineAlignmentActive,
      scheduleDraw
    } = ports
    if (tilemapPixelEditBlocked) return
    const repeatMode = session.view.tileRepeatMode ?? 'off'
    const dynamics = brushDynamicsAtEvent(event)
    const rawRepeatedStart = tileRepeatPointAt(event.clientX, event.clientY) ?? point
    const isoRepeatedStart = isoGridSnapActive
      ? (repeatedDocumentPointsAt(event.clientX, event.clientY, true, true)?.repeated ?? rawRepeatedStart)
      : rawRepeatedStart
    const repeatedStart = isoGridSnapActive
      ? snapToIsoGrid(isoRepeatedStart)
      : gridSnapActive
        ? snapBrushPointToGrid(rawRepeatedStart, dynamics.size, activeBrushImage, brushAngleWithDynamics(session, dynamics.angle))
        : rawRepeatedStart
    const strokeStart = wrapDocumentPointForTileRepeat(repeatedStart, session.document.width, session.document.height, repeatMode)
    const edit = beginPixelEdit(editableLayer.id)
    const patternOrigin = brushPatternOrigin(strokeStart)
    const colorReplacement =
      session.tool === 'eraser' && event.button === 2 ? { source: { ...session.primaryColor }, target: { ...session.secondaryColor } } : undefined
    const strokeColor = activeColor(event.button)
    const gradient = colorReplacement ? undefined : brushGradientAt(strokeColor, dynamics.gradientAmount)
    if (!isoGridSnapActive) {
      paintBrush(
        session.document,
        editableLayer,
        edit,
        strokeStart.x,
        strokeStart.y,
        dynamics.size,
        strokeColor,
        session.brushShape,
        pixelEditSelection,
        session.tool === 'pencil' || session.tool === 'eraser' ? activeBrushTexture : 'solid',
        session.brushTextureScale,
        session.tool === 'pencil' || session.tool === 'eraser' ? activeBrushImage : null,
        session.brushImageSettings,
        proceduralAntialiasStrength,
        activeBrushPaintMode,
        patternOrigin,
        session.symmetryAxes,
        symmetryCenter,
        colorReplacement,
        dynamics.opacityScale,
        undefined,
        false,
        gradient,
        repeatMode,
        activeBrushDither,
        brushAngleWithDynamics(session, dynamics.angle),
        optimizedRotationEnabled,
        session.tool === 'eraser' ? 'simple' : session.inkMode
      )
      invalidateStrokeSegment(strokeStart, strokeStart, dynamics.size, brushAngleWithDynamics(session, dynamics.angle))
    }
    inputRef.current.drag = {
      kind: 'draw',
      start: strokeStart,
      last: strokeStart,
      edit,
      path: isoGridSnapActive
        ? []
        : [
            {
              ...repeatedStart,
              size: dynamics.size,
              opacityScale: dynamics.opacityScale,
              angle: brushAngleWithDynamics(session, dynamics.angle),
              color: strokeColor,
              gradient
            }
          ],
      tileRepeatPoint: repeatedStart,
      tileRepeatStart: repeatedStart,
      isoAlignedStroke: isoLineAlignmentActive ? (session.tool === 'eraser' ? 'eraser' : 'pencil') : undefined,
      isoAlignedRawAnchor: isoLineAlignmentActive && !isoGridSnapActive ? isoRepeatedStart : undefined,
      isoAlignedRawEndpoint: isoLineAlignmentActive && !isoGridSnapActive ? isoRepeatedStart : undefined,
      isoAlignedDirectionSamples: isoLineAlignmentActive ? 0 : undefined,
      isoGridStrokeEdges: isoGridSnapActive ? [] : undefined,
      isoGridPointer: isoGridSnapActive ? isoRepeatedStart : undefined,
      isoGridHoveredEdgeKey: isoGridSnapActive ? null : undefined,
      patternOrigin,
      color: activeColor(event.button),
      colorReplacement,
      lastBrushSize: dynamics.size,
      lastOpacityScale: dynamics.opacityScale,
      lastBrushColor: strokeColor,
      lastBrushGradientActive: Boolean(gradient),
      brushSpeed: beginBrushSpeedTracking({ clientX: event.clientX, clientY: event.clientY, timeStamp: event.timeStamp }),
      startedAt: Date.now(),
      ...tilemapEditDragState
    }
    scheduleDraw()
  }
}
