import type { RgbaColor } from '@shared/types-color'
import { TRANSPARENT } from '@/core/raster'
import { DEFAULT_GRID_SETTINGS, snapPointToGrid } from '@/core/grid'
import { brushStampAnchor } from '@/core/tools-brush'
import { type BrushGradientSample } from '@/core/tools-pixel-edit'
import { type DocumentSession } from '@/store/workspace'
import { loadEditorPreferences } from '@/core/file-preferences'
import { advanceIsoAlignedStrokeSegment, traceIsoGridPointerEdges, updateIsoAlignedStrokePath } from '@/core/isometric'
import { type CanvasDragState as DragState, type CanvasPoint as Point } from '@/core/canvas-input'
import { brushOpacityScale, isPressurePointerType, resolveBrushDynamics, smoothBrushSizeEnvelope } from '@/core/pressure'
import { activeBrushInputsForTool } from '@/core/brushes'
import { brushAngleWithDynamics } from './canvas-stage-helpers'

export type StrokePreferences = Pick<ReturnType<typeof loadEditorPreferences>, 'isoView' | 'tablet' | 'gridAlignmentEnabled' | 'optimizedRotationEnabled'>

export function createCanvasStrokeBrush(session: DocumentSession, preferences: StrokePreferences) {
  const isoViewPreferences = preferences.isoView
  const tabletPreferences = preferences.tablet
  const alignmentPreferences = preferences
  const isoGridSnapActive = session.view.isoViewEnabled === true && isoViewPreferences.snapToGrid
  const brushInputs = activeBrushInputsForTool(session.tool, session.fillKind ?? 'bucket', session.brushImage, session.brushTexture)
  const activeBrushImage = brushInputs.imageBrush
  const snapBrushPointToGrid = (
  point: Point,
  size: number,
  imageBrush: Parameters<typeof brushStampAnchor>[1] = null,
  angle = 0,
  currentSession: DocumentSession = session
  ): Point => {
    const active = currentSession.view.isoViewEnabled !== true
    && alignmentPreferences.gridAlignmentEnabled
    && currentSession.view.showGrid
    if (!active) return point
    const anchor = brushStampAnchor(size, imageBrush, angle, currentSession.brushShape)
    // Aseprite snaps the brush bound (pointer centre minus brush centre),
    // then restores the anchor. This matters for even-sized brushes because
    // the half-cell decision must use the bound origin, not the cursor centre.
    const vertex = snapPointToGrid({ x: point.x - anchor.x, y: point.y - anchor.y }, currentSession.view.grid ?? DEFAULT_GRID_SETTINGS)
    return { x: vertex.x + anchor.x, y: vertex.y + anchor.y }
  }

  const activeColor = (button = 0): RgbaColor => session.tool === 'eraser'
  ? button === 2 ? session.secondaryColor : TRANSPARENT
  : button === 2 ? session.secondaryColor : session.primaryColor

  const brushDynamicsAt = (
  pointerType: string | undefined,
  pressure: number | undefined,
  speed = 0,
  pressureAvailable?: boolean,
  previousPressure?: number
  ): { size: number; opacityScale: number; gradientAmount: number | null; angle: number } => {
    const resolved = resolveBrushDynamics(session.brushDynamics, { pointerType, pressure, speed, pressureAvailable: pressureAvailable && (!isPressurePointerType(pointerType) || tabletPreferences.pressureEnabled), previousPressure }, session.brushSize)
    const opacityScale = brushOpacityScale(resolved.opacityScale, session.brushOpacity)
    return activeBrushImage?.intrinsicSize ? { ...resolved, size: session.brushSize, opacityScale } : { ...resolved, opacityScale }
  }

  const sameRgbaColor = (left: RgbaColor, right: RgbaColor): boolean => left.r === right.r && left.g === right.g && left.b === right.b && left.a === right.a

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

  const brushLineGradient = (from: BrushGradientSample | undefined, to: BrushGradientSample | undefined) => {
    const start = from ?? to
    const end = to ?? from
    if (!start || !end) return undefined
    return {
      startColor: start.startColor,
      endColor: start.endColor,
      fromAmount: start.gradientAmount,
      toAmount: end.gradientAmount,
      dither: end.dither
    }
  }

  const advanceIsoBrushPath = (
  drag: DragState,
  rawTarget: Point,
  targetDynamics: ReturnType<typeof brushDynamicsAt>
  ) => {
    const path = drag.path
    const startSample = path?.[0]
    const endpointSample = path?.at(-1)
    if (!path || !startSample || !endpointSample) return null
    const anchorSample = path.length > 1 ? path[path.length - 2] : startSample
    const advanced = advanceIsoAlignedStrokeSegment({
      anchor: anchorSample,
      endpoint: endpointSample,
      rawAnchor: drag.isoAlignedRawAnchor,
      rawEndpoint: drag.isoAlignedRawEndpoint,
      gridVertex: drag.isoAlignedGridVertex,
      direction: drag.isoAlignedDirection ?? null,
      directionSamples: drag.isoAlignedDirectionSamples
    }, rawTarget, isoViewPreferences.stairStep, isoGridSnapActive ? {
      diagonalOnly: true,
      grid: {
        spacing: isoViewPreferences.guideUnitSize,
        origin: { x: isoViewPreferences.guideOriginX, y: isoViewPreferences.guideOriginY }
      }
    } : {})
    const lockedPoints = advanced.lockedEndpoints ?? (advanced.lockedEndpoint ? [advanced.lockedEndpoint] : [])
    const lockedSamples = lockedPoints.map((point) => ({ ...endpointSample, ...point }))
    const segmentStartSample = lockedSamples.at(-1) ?? anchorSample
    const distance = Math.max(
    Math.abs(advanced.endpoint.x - advanced.anchor.x),
    Math.abs(advanced.endpoint.y - advanced.anchor.y)
    )
    const targetSize = activeBrushImage?.intrinsicSize
    ? targetDynamics.size
    : smoothBrushSizeEnvelope(segmentStartSample.size ?? session.brushSize, targetDynamics.size, session.brushSize, distance)
    const targetColor = drag.color ?? activeColor()
    const targetGradient = drag.colorReplacement ? undefined : brushGradientAt(targetColor, targetDynamics.gradientAmount)
    const targetSample = {
      ...advanced.endpoint,
      size: targetSize,
      opacityScale: targetDynamics.opacityScale,
      angle: brushAngleWithDynamics(session, targetDynamics.angle),
      color: targetColor,
      gradient: targetGradient
    }
    updateIsoAlignedStrokePath(path, advanced, targetSample)
    drag.isoAlignedDirection = advanced.direction ?? undefined
    drag.isoAlignedRawAnchor = advanced.rawAnchor
    drag.isoAlignedRawEndpoint = advanced.rawEndpoint
    drag.isoAlignedGridVertex = advanced.gridVertex
    drag.isoAlignedDirectionSamples = advanced.directionSamples
    drag.lastBrushSize = targetSize
    drag.lastOpacityScale = targetDynamics.opacityScale
    drag.lastBrushColor = targetColor
    drag.lastBrushGradientActive = Boolean(targetGradient)
    return targetSample
  }

  const advanceIsoGridBrushEdges = (
  drag: DragState,
  rawTarget: Point,
  targetDynamics: ReturnType<typeof brushDynamicsAt>
  ) => {
    const traced = traceIsoGridPointerEdges(drag.isoGridPointer ?? rawTarget, rawTarget, {
      stairStep: isoViewPreferences.stairStep,
      spacing: isoViewPreferences.guideUnitSize,
      origin: { x: isoViewPreferences.guideOriginX, y: isoViewPreferences.guideOriginY },
      hoveredEdgeKey: drag.isoGridHoveredEdgeKey
    })
    drag.isoGridPointer = { ...rawTarget }
    drag.isoGridHoveredEdgeKey = traced.hoveredEdgeKey
    if (traced.edges.length === 0) return []

    const strokes = traced.edges.map((edge) => {
      const distance = Math.max(Math.abs(edge.to.x - edge.from.x), Math.abs(edge.to.y - edge.from.y))
      const targetSize = activeBrushImage?.intrinsicSize
      ? targetDynamics.size
      : smoothBrushSizeEnvelope(drag.lastBrushSize ?? session.brushSize, targetDynamics.size, session.brushSize, distance)
      const targetColor = drag.color ?? activeColor()
      const targetGradient = drag.colorReplacement ? undefined : brushGradientAt(targetColor, targetDynamics.gradientAmount)
      const stroke = {
        key: edge.key,
        from: {
          ...edge.from,
          size: drag.lastBrushSize ?? targetSize,
          opacityScale: drag.lastOpacityScale ?? targetDynamics.opacityScale,
          angle: brushAngleWithDynamics(session, targetDynamics.angle),
          color: targetColor,
          gradient: targetGradient
        },
        to: {
          ...edge.to,
          size: targetSize,
          opacityScale: targetDynamics.opacityScale,
          angle: brushAngleWithDynamics(session, targetDynamics.angle),
          color: targetColor,
          gradient: targetGradient
        }
      }
      drag.isoGridStrokeEdges ??= []
      drag.isoGridStrokeEdges.push(stroke)
      drag.path ??= []
      drag.path.push(stroke.from, stroke.to)
      drag.lastBrushSize = targetSize
      drag.lastOpacityScale = targetDynamics.opacityScale
      drag.lastBrushColor = targetColor
      drag.lastBrushGradientActive = Boolean(targetGradient)
      return stroke
    })
    return strokes
  }
  return { activeColor, brushDynamicsAt, brushGradientAt, brushLineGradient, sameRgbaColor, advanceIsoBrushPath, advanceIsoGridBrushEdges, snapBrushPointToGrid, brushInputs, isoGridSnapActive }
}
