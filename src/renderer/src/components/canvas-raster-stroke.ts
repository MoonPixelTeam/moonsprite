import { createCanvasStrokeBrush, type StrokePreferences } from './canvas-stroke-brush'
import type { PointerClientPoint } from '@/core/canvas-input'
import type { RgbaColor } from '@shared/types-color'
import type { SelectionMask, SelectionRect } from '@shared/types-selection'
import { beginPixelEdit, revertPixelEdit } from '@/core/history'
import { DEFAULT_BRUSH_DITHER_SETTINGS } from '@/core/gradient-color'
import { appendPerfectPixelSegment } from '@/core/tools-shapes'
import { brushStrokeInvalidationRects, paintBrush, paintLine } from '@/core/tools-brush'
import { beginBrushTailEdit } from '@/core/tools-pixel-edit-state'
import { interpolateBrushAngle, type BrushGradientSample } from '@/core/tools-pixel-edit'
import { type DocumentSession } from '@/store/workspace'
import { activePaintLayer } from '@/store/workspace-session'
import { updateBrushSpeedTracking, type CanvasDragState as DragState, type CanvasPoint as Point } from '@/core/canvas-input'
import { defaultSymmetryCenter, hasSymmetry } from '@/core/symmetry'
import { smoothBrushSizeEnvelope } from '@/core/pressure'
import { tileRepeatLineSegments, wrapDocumentPointForTileRepeat } from '@/core/tilemap'
import { brushAngleWithDynamics } from './canvas-stage-helpers'

interface StrokeMove {
  session: DocumentSession
  drag: DragState
  previousPoint: Point
  pointerType: string
  pointerSamples: readonly PointerClientPoint[]
  preferences: StrokePreferences
}
interface StrokeGeometry {
  documentPointsAt(x: number, y: number, continuous?: boolean, allowOutsideCopies?: boolean): {local: Point; repeated: Point; offset: Point} | null
}
interface StrokeInvalidation {
  strokeSegment(from: Point, to: Point, size: number, angle: number): void
  rect(rect: SelectionRect): void
  all(): void
  requestDraw(): void
}

/** Processes a stroke's coalesced samples; geometry and rendering remain explicit ports.
* The shared CanvasInputState owns the gesture and its undo edit. */
export function processRasterStrokeMove(input: StrokeMove, geometry: StrokeGeometry, invalidation: StrokeInvalidation): void {
  const { session, drag, previousPoint, pointerType, pointerSamples, preferences } = input
  if (!drag.edit) return
  const {documentPointsAt: repeatedDocumentPointsAt} = geometry
  const {strokeSegment: invalidateStrokeSegment, rect: invalidateCompositeRect, all: invalidateAll, requestDraw: scheduleDraw} = invalidation
  const { activeColor, brushDynamicsAt, brushGradientAt, brushLineGradient, sameRgbaColor, advanceIsoBrushPath, advanceIsoGridBrushEdges, snapBrushPointToGrid, brushInputs, isoGridSnapActive } = createCanvasStrokeBrush(session, preferences)
  const activeBrushImage = brushInputs.imageBrush
  const activeBrushTexture = brushInputs.texture
  const activeBrushDither = activeBrushImage ? undefined : session.brushDither ?? DEFAULT_BRUSH_DITHER_SETTINGS
  const activeBrushPaintMode = activeBrushImage?.intrinsicSize ? session.brushPaintMode : 'paint'
  const proceduralAntialiasStrength = brushInputs.fillTextureEnabled && session.proceduralAntialias && activeBrushImage?.id.startsWith('procedural:') ? session.proceduralAntialiasStrength : 0
  const symmetryCenter = session.symmetryCenter ?? defaultSymmetryCenter(session.document.width, session.document.height)
  const optimizedRotationEnabled = preferences.optimizedRotationEnabled
  const gridSnapActive = session.view.isoViewEnabled !== true && preferences.gridAlignmentEnabled && session.view.showGrid
  const paintSelectionForDrag = (current: DragState): SelectionMask | null => current.tilemapEditSelection ?? session.selection

  const repeatMode = session.view.tileRepeatMode ?? 'off'
  const batchSimpleStrokeInvalidation = repeatMode === 'off' && !hasSymmetry(session.symmetryAxes)
  let batchedStrokeInvalidation: SelectionRect | null = null
  const batchedFineInvalidations: SelectionRect[] = []
  const queueStrokeInvalidation = (from: Point, to: Point, size: number, angle: number): void => {
    const simpleSolidStroke = !activeBrushImage
    && activeBrushTexture === 'solid'
    && !activeBrushDither?.enabled
    && !session.selection
    && batchSimpleStrokeInvalidation
    && (session.tool === 'pencil' || session.tool === 'eraser')
    && Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y)) <= 2
    if (simpleSolidStroke) {
      // Repaint the complete local stroke envelope instead of only the
      // stamp difference. Pointer samples can arrive faster than RAF;
      // difference-only regions then leave visible gaps between frames.
      for (const rect of brushStrokeInvalidationRects(
      from,
      to,
      size,
      null,
      session.document.width,
      session.document.height,
      undefined,
      symmetryCenter,
      'off',
      angle
      )) {
        batchedFineInvalidations.push(rect)
      }
      return
    }
    if (!batchSimpleStrokeInvalidation) {
      invalidateStrokeSegment(from, to, size, angle)
      return
    }
    for (const rect of brushStrokeInvalidationRects(
    from,
    to,
    size,
    activeBrushImage,
    session.document.width,
    session.document.height,
    undefined,
    symmetryCenter,
    'off',
    angle
    )) {
      if (!batchedStrokeInvalidation) batchedStrokeInvalidation = { ...rect }
      else {
        const left = Math.min(batchedStrokeInvalidation.x, rect.x)
        const top = Math.min(batchedStrokeInvalidation.y, rect.y)
        const right = Math.max(batchedStrokeInvalidation.x + batchedStrokeInvalidation.width, rect.x + rect.width)
        const bottom = Math.max(batchedStrokeInvalidation.y + batchedStrokeInvalidation.height, rect.y + rect.height)
        const currentArea = Math.max(1, batchedStrokeInvalidation.width * batchedStrokeInvalidation.height)
        const rectArea = Math.max(1, rect.width * rect.height)
        const union = { x: left, y: top, width: right - left, height: bottom - top }
        const unionArea = Math.max(1, union.width * union.height)
        // Do not let a long diagonal stroke turn into one giant dirty
        // rectangle. Once the union contains mostly untouched pixels,
        // flush the previous batch and keep a second local rectangle;
        // the cache will recompose both regions independently.
        if (unionArea > (currentArea + rectArea) * 3) {
          batchedFineInvalidations.push(batchedStrokeInvalidation)
          batchedStrokeInvalidation = { ...rect }
        } else batchedStrokeInvalidation = union
      }
    }
  }
  let segmentStart = drag.tileRepeatPoint ?? previousPoint
  let segmentStartSize = drag.lastBrushSize ?? session.brushSize
  let segmentStartOpacityScale = drag.lastOpacityScale ?? 1
  let segmentStartAngle = drag.path?.at(-1)?.angle ?? 0
  let segmentStartColor = drag.lastBrushColor ?? drag.color ?? activeColor()
  let segmentStartGradient = drag.path?.at(-1)?.gradient
  let rebuiltStroke = false
  const perfectPixelInvalidations: SelectionRect[] = []
  const paintRepeatedSegment = (
  from: Point,
  to: Point,
  fromSize: number,
  toSize: number,
  fromOpacityScale: number,
  toOpacityScale: number,
  fromAngle: number,
  toAngle: number,
  color: RgbaColor,
  fromGradient: BrushGradientSample | undefined,
  toGradient: BrushGradientSample | undefined,
  algorithm: 'raster' | 'balanced' = 'raster'
  ): Array<{ from: Point; to: Point }> => {
    // The overwhelmingly common path has tile repeat disabled. Avoid
    // allocating/splitting a one element segment list in that case; DEV.5
    // painted the line directly and this keeps the hot pointer path just
    // as cheap while preserving the repeated-canvas behavior below.
    if (repeatMode === 'off') {
      const gradient = brushLineGradient(fromGradient, toGradient)
      const interpolate = (start: number, end: number, progress: number): number => start + (end - start) * progress
      paintLine(session.document, activePaintLayer(session), drag.edit!, from.x, from.y, to.x, to.y, session.brushSize, color, paintSelectionForDrag(drag), session.brushShape, session.tool === 'pencil' || session.tool === 'eraser' ? activeBrushTexture : 'solid', session.brushTextureScale, session.tool === 'pencil' || session.tool === 'eraser' ? activeBrushImage : null, session.brushImageSettings, proceduralAntialiasStrength, activeBrushPaintMode, drag.patternOrigin, algorithm, session.symmetryAxes, symmetryCenter, drag.colorReplacement, {
        fromSize,
        toSize,
        fromOpacityScale,
        toOpacityScale,
        fromAngle,
        toAngle,
        gradient: gradient ? {
          ...gradient,
          fromAmount: interpolate(gradient.fromAmount, gradient.toAmount, 0),
          toAmount: interpolate(gradient.fromAmount, gradient.toAmount, 1)
        } : undefined
      }, 'off', activeBrushDither, optimizedRotationEnabled, session.tool === 'eraser' ? 'simple' : session.inkMode)
      return [{ from, to }]
    }
    const segments = tileRepeatLineSegments(from, to, session.document.width, session.document.height, repeatMode, algorithm)
    const gradient = brushLineGradient(fromGradient, toGradient)
    const interpolate = (start: number, end: number, progress: number): number => start + (end - start) * progress
    for (const segment of segments) {
      paintLine(session.document, activePaintLayer(session), drag.edit!, segment.from.x, segment.from.y, segment.to.x, segment.to.y, session.brushSize, color, paintSelectionForDrag(drag), session.brushShape, session.tool === 'pencil' || session.tool === 'eraser' ? activeBrushTexture : 'solid', session.brushTextureScale, session.tool === 'pencil' || session.tool === 'eraser' ? activeBrushImage : null, session.brushImageSettings, proceduralAntialiasStrength, activeBrushPaintMode, drag.patternOrigin, algorithm, session.symmetryAxes, symmetryCenter, drag.colorReplacement, {
        fromSize: interpolate(fromSize, toSize, segment.fromProgress),
        toSize: interpolate(fromSize, toSize, segment.toProgress),
        fromOpacityScale: interpolate(fromOpacityScale, toOpacityScale, segment.fromProgress),
        toOpacityScale: interpolate(fromOpacityScale, toOpacityScale, segment.toProgress),
        fromAngle: interpolateBrushAngle(fromAngle, toAngle, segment.fromProgress),
        toAngle: interpolateBrushAngle(fromAngle, toAngle, segment.toProgress),
        gradient: gradient ? {
          ...gradient,
          fromAmount: interpolate(gradient.fromAmount, gradient.toAmount, segment.fromProgress),
          toAmount: interpolate(gradient.fromAmount, gradient.toAmount, segment.toProgress)
        } : undefined
      }, repeatMode, activeBrushDither, optimizedRotationEnabled, session.tool === 'eraser' ? 'simple' : session.inkMode)
    }
    return segments
  }
  if (drag.isoAlignedStroke && drag.isoGridPointer) {
    let paintedEdge = false
    for (const sample of pointerSamples) {
      const repeatedPoints = repeatedDocumentPointsAt(sample.clientX, sample.clientY, true, true)
      if (!repeatedPoints) continue
      const speedSample = updateBrushSpeedTracking(drag.brushSpeed, sample)
      drag.brushSpeed = speedSample.state
      const targetDynamics = brushDynamicsAt(sample.pointerType ?? pointerType, sample.pressure, speedSample.speed, sample.pressureAvailable, sample.previousPressure)
      const strokes = advanceIsoGridBrushEdges(drag, repeatedPoints.repeated, targetDynamics)
      for (const stroke of strokes) {
        paintRepeatedSegment(
        stroke.from,
        stroke.to,
        stroke.from.size ?? session.brushSize,
        stroke.to.size ?? session.brushSize,
        stroke.from.opacityScale ?? 1,
        stroke.to.opacityScale ?? 1,
        stroke.from.angle ?? 0,
        stroke.to.angle ?? 0,
        stroke.from.color ?? drag.color ?? activeColor(),
        stroke.from.gradient,
        stroke.to.gradient,
        'balanced'
        )
        drag.last = wrapDocumentPointForTileRepeat(stroke.to, session.document.width, session.document.height, repeatMode)
        drag.tileRepeatPoint = stroke.to
        paintedEdge = true
      }
    }
    if (paintedEdge) invalidateAll()
    scheduleDraw()
    return
  }
  if (drag.isoAlignedStroke) {
    let pathChanged = false
    for (const sample of pointerSamples) {
      const repeatedPoints = repeatedDocumentPointsAt(sample.clientX, sample.clientY, isoGridSnapActive, true)
      if (!repeatedPoints) continue
      const speedSample = updateBrushSpeedTracking(drag.brushSpeed, sample)
      drag.brushSpeed = speedSample.state
      const targetDynamics = brushDynamicsAt(sample.pointerType ?? pointerType, sample.pressure, speedSample.speed, sample.pressureAvailable, sample.previousPressure)
      pathChanged = Boolean(advanceIsoBrushPath(drag, repeatedPoints.repeated, targetDynamics)) || pathChanged
    }
    if (!pathChanged || !drag.path || drag.path.length < 2) { scheduleDraw(); return }
    revertPixelEdit(session.document, drag.edit)
    drag.edit = beginPixelEdit(activePaintLayer(session).id)
    for (let index = 1; index < drag.path.length; index += 1) {
      const from = drag.path[index - 1]
      const to = drag.path[index]
      paintRepeatedSegment(
      from,
      to,
      from.size ?? session.brushSize,
      to.size ?? session.brushSize,
      from.opacityScale ?? 1,
      to.opacityScale ?? 1,
      from.angle ?? 0,
      to.angle ?? 0,
      from.color ?? drag.color ?? activeColor(),
      from.gradient,
      to.gradient,
      'balanced'
      )
    }
    const alignedTarget = drag.path.at(-1)!
    const localTarget = wrapDocumentPointForTileRepeat(alignedTarget, session.document.width, session.document.height, repeatMode)
    drag.last = localTarget
    drag.tileRepeatPoint = alignedTarget
    invalidateAll()
    scheduleDraw()
    return
  }
  // Preserve every coalesced turn and pressure sample. Batch invalidation and
  // presentation below instead of replacing a curved stroke with a chord.
  for (const sample of pointerSamples) {
    const repeatedPoints = repeatedDocumentPointsAt(sample.clientX, sample.clientY, false, true)
    if (!repeatedPoints) continue
    const rawPoint = repeatedPoints.local
    const rawRepeatedPoint = repeatedPoints.repeated
    const speedSample = updateBrushSpeedTracking(drag.brushSpeed, sample)
    drag.brushSpeed = speedSample.state
    const dynamics = brushDynamicsAt(sample.pointerType ?? pointerType, sample.pressure, speedSample.speed, sample.pressureAvailable, sample.previousPressure)
    const previousSize = drag.lastBrushSize ?? dynamics.size
    const previousOpacity = drag.lastOpacityScale ?? dynamics.opacityScale
    const fastMotion = speedSample.speed > 1.5
    const stableDynamics = fastMotion
    ? {
      ...dynamics,
      size: Math.max(previousSize * 0.8, Math.min(previousSize * 1.2, dynamics.size)),
      opacityScale: Math.max(previousOpacity - 0.2, Math.min(previousOpacity + 0.2, dynamics.opacityScale))
    }
    : dynamics
    const rasterDistance = Math.max(Math.abs(rawRepeatedPoint.x - segmentStart.x), Math.abs(rawRepeatedPoint.y - segmentStart.y))
    const acceptedSize = activeBrushImage?.intrinsicSize
    ? stableDynamics.size
    : smoothBrushSizeEnvelope(segmentStartSize, stableDynamics.size, session.brushSize, rasterDistance)
    const repeatedPoint = gridSnapActive
    ? snapBrushPointToGrid(rawRepeatedPoint, acceptedSize, activeBrushImage, brushAngleWithDynamics(session, dynamics.angle))
    : rawRepeatedPoint
    const point = gridSnapActive
    ? wrapDocumentPointForTileRepeat(repeatedPoint, session.document.width, session.document.height, repeatMode)
    : rawPoint
    const sampleColor = drag.color ?? activeColor()
    const sampleGradient = drag.colorReplacement ? undefined : brushGradientAt(sampleColor, stableDynamics.gradientAmount)
    const samePoint = repeatedPoint.x === segmentStart.x && repeatedPoint.y === segmentStart.y
    const sameColor = sampleColor.r === segmentStartColor.r && sampleColor.g === segmentStartColor.g && sampleColor.b === segmentStartColor.b && sampleColor.a === segmentStartColor.a
    const sameGradient = (!segmentStartGradient && !sampleGradient) || Boolean(segmentStartGradient && sampleGradient
    && segmentStartGradient.gradientAmount === sampleGradient.gradientAmount
    && segmentStartGradient.dither === sampleGradient.dither
    && sameRgbaColor(segmentStartGradient.startColor, sampleGradient.startColor)
    && sameRgbaColor(segmentStartGradient.endColor, sampleGradient.endColor))
    if (samePoint && acceptedSize === segmentStartSize && dynamics.opacityScale === segmentStartOpacityScale && sameColor && sameGradient) continue
    drag.last = point
    drag.tileRepeatPoint = repeatedPoint
    drag.lastBrushSize = acceptedSize
    drag.lastOpacityScale = dynamics.opacityScale
    drag.lastBrushColor = sampleColor
    drag.lastBrushGradientActive = Boolean(sampleGradient)
    if (session.perfectPixels) {
      const path = drag.path ?? [{ ...segmentStart, size: segmentStartSize, opacityScale: segmentStartOpacityScale, angle: segmentStartAngle, color: segmentStartColor, gradient: segmentStartGradient }]
      const previousTailDirty = drag.edit.dirtyRect ? { ...drag.edit.dirtyRect } : null
      // Perfect-pixel correction only needs the last two path points. Keep
      // those in a small reversible tail edit and seal older points into
      // an accumulated edit. Replaying the whole stroke at every corrected
      // corner made long eraser gestures progressively slower.
      revertPixelEdit(session.document, drag.edit)
      if (samePoint) {
        const last = path.at(-1)
        if (last) {
          last.size = acceptedSize
          last.opacityScale = Math.max(last.opacityScale ?? dynamics.opacityScale, dynamics.opacityScale)
          last.angle = brushAngleWithDynamics(session, dynamics.angle)
          last.color = sampleColor
          last.gradient = sampleGradient
        }
      } else {
        appendPerfectPixelSegment(path, { ...repeatedPoint, size: acceptedSize, opacityScale: dynamics.opacityScale, angle: brushAngleWithDynamics(session, dynamics.angle), color: sampleColor, gradient: sampleGradient })
        drag.path = path
      }
      const paintLayer = activePaintLayer(session)
      const committed = drag.perfectPixelCommittedEdit ?? beginPixelEdit(paintLayer.id)
      const tail = beginBrushTailEdit(committed)
      const stableEnd = Math.max(0, path.length - 2)
      for (let index = drag.perfectPixelStablePathLength ?? 0; index < stableEnd; index += 1) {
        const center = path[index]
        const wrapped = wrapDocumentPointForTileRepeat(center, session.document.width, session.document.height, repeatMode)
        paintBrush(session.document, paintLayer, committed, wrapped.x, wrapped.y, center.size ?? session.brushSize, center.color ?? drag.color ?? activeColor(), session.brushShape, paintSelectionForDrag(drag), session.tool === 'pencil' || session.tool === 'eraser' ? activeBrushTexture : 'solid', session.brushTextureScale, session.tool === 'pencil' || session.tool === 'eraser' ? activeBrushImage : null, session.brushImageSettings, proceduralAntialiasStrength, activeBrushPaintMode, drag.patternOrigin, session.symmetryAxes, symmetryCenter, drag.colorReplacement, center.opacityScale ?? 1, center.coverageKey, center.overrideImageBrushColor, center.gradient, repeatMode, activeBrushDither, center.angle, optimizedRotationEnabled, session.tool === 'eraser' ? 'simple' : session.inkMode)
      }
      for (let index = stableEnd; index < path.length; index += 1) {
        const center = path[index]
        const wrapped = wrapDocumentPointForTileRepeat(center, session.document.width, session.document.height, repeatMode)
        paintBrush(session.document, paintLayer, tail, wrapped.x, wrapped.y, center.size ?? session.brushSize, center.color ?? drag.color ?? activeColor(), session.brushShape, paintSelectionForDrag(drag), session.tool === 'pencil' || session.tool === 'eraser' ? activeBrushTexture : 'solid', session.brushTextureScale, session.tool === 'pencil' || session.tool === 'eraser' ? activeBrushImage : null, session.brushImageSettings, proceduralAntialiasStrength, activeBrushPaintMode, drag.patternOrigin, session.symmetryAxes, symmetryCenter, drag.colorReplacement, center.opacityScale ?? 1, center.coverageKey, center.overrideImageBrushColor, center.gradient, repeatMode, activeBrushDither, center.angle, optimizedRotationEnabled, session.tool === 'eraser' ? 'simple' : session.inkMode)
      }
      drag.perfectPixelCommittedEdit = committed
      drag.perfectPixelStablePathLength = stableEnd
      drag.edit = tail
      if (previousTailDirty) perfectPixelInvalidations.push(previousTailDirty)
      if (tail.dirtyRect) perfectPixelInvalidations.push({ ...tail.dirtyRect })
    } else {
      paintRepeatedSegment(segmentStart, repeatedPoint, segmentStartSize, acceptedSize, segmentStartOpacityScale, dynamics.opacityScale, segmentStartAngle, brushAngleWithDynamics(session, dynamics.angle), segmentStartColor, segmentStartGradient, sampleGradient)
      drag.path = [{ ...repeatedPoint, size: acceptedSize, opacityScale: dynamics.opacityScale, angle: brushAngleWithDynamics(session, dynamics.angle), color: sampleColor, gradient: sampleGradient }]
    }
    if (rebuiltStroke) {
      // Perfect-pixel corner repair rebuilds the edit buffer, but it does
      // not require invalidating the whole document. Repaint the rebuilt
      // path envelope so large documents keep the live preview responsive.
      const rebuiltPath = drag.path ?? []
      for (let index = 1; index < rebuiltPath.length; index += 1) {
        const from = rebuiltPath[index - 1]
        const to = rebuiltPath[index]
        queueStrokeInvalidation(from, to, Math.max(from.size ?? session.brushSize, to.size ?? session.brushSize), Math.max(from.angle ?? 0, to.angle ?? 0))
      }
    } else if (repeatMode === 'off') {
      queueStrokeInvalidation(segmentStart, repeatedPoint, Math.max(segmentStartSize, acceptedSize), Math.max(segmentStartAngle, brushAngleWithDynamics(session, dynamics.angle)))
    } else for (const segment of tileRepeatLineSegments(segmentStart, repeatedPoint, session.document.width, session.document.height, repeatMode)) {
      queueStrokeInvalidation(segment.from, segment.to, Math.max(segmentStartSize, acceptedSize), Math.max(segmentStartAngle, brushAngleWithDynamics(session, dynamics.angle)))
    }
    segmentStart = repeatedPoint
    segmentStartSize = acceptedSize
    segmentStartOpacityScale = dynamics.opacityScale
    segmentStartAngle = brushAngleWithDynamics(session, dynamics.angle)
    segmentStartColor = sampleColor
    segmentStartGradient = sampleGradient
  }
  // Keep live strokes on the dirty-rectangle path. The stroke segment
  // queues above already cover every newly painted area; invalidating the
  // whole surface here made every pointer sample rebuild the full 4K
  // canvas and caused the multi-hundred-millisecond stalls reported by
  // large projects.
  for (const rect of batchedFineInvalidations) invalidateCompositeRect(rect)
  if (batchedStrokeInvalidation) invalidateCompositeRect(batchedStrokeInvalidation)
  for (const rect of perfectPixelInvalidations) invalidateCompositeRect(rect)
  // Map size is not a change counter: compact strokes use edit.points,
  // and partial opacity can modify existing entries without growing it.
  if (perfectPixelInvalidations.length === 0 && batchedFineInvalidations.length === 0 && !batchedStrokeInvalidation && batchSimpleStrokeInvalidation) return
  scheduleDraw(); return

}
