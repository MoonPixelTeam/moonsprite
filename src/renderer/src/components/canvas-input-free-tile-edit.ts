import type { FreeTileInstance } from '@shared/types-tiles'
import type { RasterLayer } from '@shared/types-layer'
import type { RgbaColor } from '@shared/types-color'
import type { SelectionMask, SelectionRect } from '@shared/types-selection'
import { createCompositePointSampler } from '@/core/document-composite'
import { beginPixelEdit, revertPixelEdit } from '@/core/history'
import { gradientRegionSelection } from '@/core/gradient'
import { DEFAULT_GRID_SETTINGS, snapPointToGrid } from '@/core/grid'
import { paintLine } from '@/core/tools-brush'
import { floodFillSymmetric } from '@/core/tools-fill'
import { type BrushGradientSample } from '@/core/tools-pixel-edit'
import { useWorkspace, type DocumentSession } from '@/store/workspace'
import { CanvasInputState } from '@/core/canvas-input-controller'
import { updateBrushSpeedTracking } from '@/core/canvas-input-pointer'
import { type CanvasDragState as DragState, type CanvasPoint as Point } from '@/core/canvas-input-contracts'
import { smoothBrushSizeEnvelope } from '@/core/pressure'
import { freeTileSourceForId } from '@/core/free-tile-document'
import { freeTileSourceSnapshotFromEditRaster, type FreeTileSourceEditRaster } from '@/core/free-tile-edit'
import { brushAngleWithDynamics, brushBaseAngle } from './canvas-stage-helpers'

interface Ports {
  gradientStopsForButton: (button: number) => import('@shared/types-brush').GradientStop[] | undefined
  inputRef: import('react').RefObject<CanvasInputState>
  draw: () => void
  commitFreeTileSourceDrag: (drag: DragState, label: string) => boolean
  t: (key: import('@/locales/contracts').TranslationKey, params?: import('@/locales/contracts').TranslationParams) => string
  compositeCacheRef: import('react').RefObject<import('@/components/canvas-composite-cache').CanvasCompositeCache>
  gridSnapActive: boolean
  sprayAirbrushRef: import('react').RefObject<(drag: DragState) => void>
  scheduleAirbrushTimer: () => void
  isoGridSnapActive: boolean
  snapToIsoGrid: (point: Point) => Point
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
  advanceIsoGridBrushEdges: (
    drag: DragState,
    rawTarget: Point,
    targetDynamics: ReturnType<
      (
        pointerType: string | undefined,
        pressure: number | undefined,
        speed?: number,
        pressureAvailable?: boolean,
        previousPressure?: number
      ) => {
        size: number
        opacityScale: number
        gradientAmount: number | null
        angle: number
      }
    >
  ) => {
    key: string
    from: {
      x: number
      y: number
      size: number
      opacityScale: number
      angle: number
      color: RgbaColor
      gradient: BrushGradientSample | undefined
    }
    to: {
      x: number
      y: number
      size: number
      opacityScale: number
      angle: number
      color: RgbaColor
      gradient: BrushGradientSample | undefined
    }
  }[]
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
  localPointAt: (clientX: number, clientY: number, allowOutsideCopies?: boolean) => Point | null
  advanceIsoBrushPath: (
    drag: DragState,
    rawTarget: Point,
    targetDynamics: ReturnType<
      (
        pointerType: string | undefined,
        pressure: number | undefined,
        speed?: number,
        pressureAvailable?: boolean,
        previousPressure?: number
      ) => {
        size: number
        opacityScale: number
        gradientAmount: number | null
        angle: number
      }
    >
  ) => {
    x: number
    y: number
    size: number
    opacityScale: number
    angle: number
    color: RgbaColor
    gradient: BrushGradientSample | undefined
  } | null
  scheduleDraw: () => void
}

export function createFreeTileEditCanvasInput(ports: Ports) {
  function beginFreeTileEdit({
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
  }: {
    editableLayer: RasterLayer
    session: DocumentSession
    hasRasterFocus: boolean
    canEditLayer: boolean
    prepareFreeTileSourceEdit: () => {
      source: NonNullable<ReturnType<typeof freeTileSourceForId>>
      instance: FreeTileInstance
      placementEdit: ReturnType<() => import('@/core/free-tile-document').FreeTilePlacementEdit | null>
      sourceEdit: FreeTileSourceEditRaster
      selection: SelectionMask | null
      sourceRegion: SelectionRect
    } | null
    point: Point
    fillKind: import('@shared/types-brush').FillKind
    event: React.PointerEvent<HTMLCanvasElement>
    gradientType: import('@shared/types-brush').GradientType
    activeColor: (button?: number) => RgbaColor
    activeBrushImage: import('@shared/types-brush').ImageBrush | null
    activeBrushTexture: import('@shared/types-brush').BrushTexture
    proceduralAntialiasStrength: number
    activeBrushPaintMode: import('@shared/types-brush').BrushPaintMode
    state: ReturnType<typeof useWorkspace.getState>
  }): boolean {
    const {
      gradientStopsForButton,
      inputRef,
      draw,
      commitFreeTileSourceDrag,
      t,
      compositeCacheRef,
      gridSnapActive,
      sprayAirbrushRef,
      scheduleAirbrushTimer,
      isoGridSnapActive,
      snapToIsoGrid
    } = ports
    if (
      editableLayer.kind === 'free-tile' &&
      session.freeTileMode === 'edit' &&
      (session.tool === 'fill' || session.tool === 'shape' || session.tool === 'line' || session.tool === 'airbrush')
    ) {
      if (!hasRasterFocus || !canEditLayer) return true
      const prepared = prepareFreeTileSourceEdit()
      if (!prepared) return true
      const { sourceEdit, placementEdit, selection, sourceRegion } = prepared
      const freeTileDragFields = {
        freeTilePlacementEdit: placementEdit ?? undefined,
        freeTileSourceId: prepared.source.id,
        freeTileInstanceId: prepared.instance.id,
        freeTileEditDocument: sourceEdit.document,
        freeTileEditLayer: sourceEdit.layer,
        freeTileSourceBefore: sourceEdit.before,
        freeTileEditOrigin: sourceEdit.origin,
        freeTileEditSourceOffset: sourceEdit.sourceOffset,
        freeTileEditInstanceTransform: sourceEdit.instanceTransform,
        freeTileEditTransformedSourceBounds: sourceEdit.transformedSourceBounds,
        freeTileEditSelection: selection,
        freeTileGradientPaintRegion: undefined
      }
      if (session.tool === 'fill') {
        const localPoint = { x: point.x - sourceEdit.origin.x, y: point.y - sourceEdit.origin.y }
        if (fillKind === 'gradient' && (event.button === 0 || event.button === 2)) {
          const gradientPaintRegion = gradientRegionSelection(
            sourceEdit.document,
            sourceEdit.layer,
            localPoint,
            session.gradientTolerance,
            session.gradientContiguous,
            {
              sourceColorAt: session.fillReference === 'visible-layers' ? createCompositePointSampler(sourceEdit.document) : undefined,
              connectivity: session.fillConnectivity
            }
          )
          const drag: DragState = {
            kind: 'gradient',
            start: point,
            last: point,
            rawLast: point,
            constrain: event.shiftKey,
            gradientFromCenter: gradientType === 'radial' && Boolean(event.ctrlKey || event.metaKey),
            color: activeColor(event.button),
            gradientEndColor: event.button === 2 ? session.primaryColor : session.secondaryColor,
            gradientStops: gradientStopsForButton(event.button),
            gradientPaintRegion,
            ...freeTileDragFields,
            freeTileGradientPaintRegion: gradientPaintRegion
          }
          inputRef.current.drag = drag
          draw()
          return true
        }
        const edit = floodFillSymmetric(
          sourceEdit.document,
          sourceEdit.layer,
          localPoint.x,
          localPoint.y,
          activeColor(event.button),
          selection ?? sourceRegion,
          session.fillMode === 'contiguous',
          activeBrushImage,
          session.brushSize,
          session.brushImageSettings,
          activeBrushTexture,
          session.brushTextureScale,
          proceduralAntialiasStrength,
          activeBrushPaintMode,
          undefined,
          undefined,
          session.fillTolerance,
          session.fillMode === 'contiguous' && session.fillGapClosing ? session.fillGapThreshold : 0,
          undefined,
          {
            sourceColorAt: session.fillReference === 'visible-layers' ? createCompositePointSampler(sourceEdit.document) : undefined,
            connectivity: session.fillConnectivity
          }
        )
        if (edit) {
          const drag: DragState = { kind: 'free-tile-edit', start: point, last: point, edit, ...freeTileDragFields }
          commitFreeTileSourceDrag(
            drag,
            activeBrushImage || activeBrushTexture !== 'solid'
              ? t('canvas.history.brushFill')
              : session.fillMode === 'contiguous'
                ? t('canvas.history.contiguousFill')
                : t('canvas.history.nonContiguousFill')
          )
        } else if (placementEdit) state.cancelFreeTilePlacement(placementEdit)
        compositeCacheRef.current.invalidateAll()
        draw()
        return true
      }
      if (session.tool === 'airbrush' && (event.button === 0 || event.button === 2)) {
        const airbrushPoint = gridSnapActive ? snapPointToGrid(point, session.view.grid ?? DEFAULT_GRID_SETTINGS) : point
        const drag: DragState = {
          kind: 'airbrush',
          start: airbrushPoint,
          last: airbrushPoint,
          edit: beginPixelEdit(sourceEdit.layer.id),
          color: activeColor(event.button),
          startedAt: Date.now(),
          nextAirbrushAt: performance.now() + session.airbrushIntervalMs,
          ...freeTileDragFields
        }
        inputRef.current.drag = drag
        sprayAirbrushRef.current(drag)
        scheduleAirbrushTimer()
        return true
      }
      if ((session.tool === 'shape' || session.tool === 'line') && (event.button === 0 || event.button === 2)) {
        const color = activeColor(event.button)
        if (session.tool === 'shape') {
          const shapePoint = gridSnapActive ? snapPointToGrid(point, session.view.grid ?? DEFAULT_GRID_SETTINGS) : point
          const drag: DragState =
            session.shapeKind === 'freeform'
              ? { kind: 'freeform-shape', start: shapePoint, last: shapePoint, color, path: [shapePoint], ...freeTileDragFields }
              : session.shapeKind === 'polygon'
                ? { kind: 'polygon-shape', start: shapePoint, last: shapePoint, color, path: [shapePoint], ...freeTileDragFields }
                : {
                    kind: 'shape',
                    start: shapePoint,
                    last: shapePoint,
                    startClient: { x: event.clientX, y: event.clientY },
                    color,
                    constrain: inputRef.current.shiftHeld,
                    ...freeTileDragFields
                  }
          inputRef.current.drag = drag
          draw()
          return true
        }
        const lineStart = isoGridSnapActive ? snapToIsoGrid(point) : gridSnapActive ? snapPointToGrid(point, session.view.grid ?? DEFAULT_GRID_SETTINGS) : point
        const drag: DragState =
          session.lineKind === 'curve'
            ? {
                kind: 'curve-shape',
                start: lineStart,
                last: lineStart,
                color,
                curvePhase: 'endpoint',
                curveAnchorCount: session.curveAnchorCount,
                ...freeTileDragFields
              }
            : {
                kind: 'line-shape',
                start: lineStart,
                last: lineStart,
                color,
                ...freeTileDragFields,
                ...(isoGridSnapActive ? { isoAlignedGridVertex: lineStart } : {})
              }
        inputRef.current.drag = drag
        draw()
        return true
      }
    }
    return false
  }

  function moveFreeTileEdit({
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
  }: {
    drag: DragState
    previousPoint: Point
    session: DocumentSession
    pointerSamples: {
      clientX: number
      clientY: number
      timeStamp?: number
      pointerType: string
      pressure: number | undefined
      pressureAvailable: boolean
      previousPressure: number | undefined
    }[]
    brushDynamicsAt: (
      pointerType: string | undefined,
      pressure: number | undefined,
      speed?: number,
      pressureAvailable?: boolean,
      previousPressure?: number
    ) => {
      size: number
      opacityScale: number
      gradientAmount: number | null
      angle: number
    }
    event: React.PointerEvent<HTMLCanvasElement>
    activeColor: (button?: number) => RgbaColor
    activeBrushTexture: import('@shared/types-brush').BrushTexture
    activeBrushImage: import('@shared/types-brush').ImageBrush | null
    proceduralAntialiasStrength: number
    activeBrushPaintMode: import('@shared/types-brush').BrushPaintMode
    activeBrushDither: import('@shared/types-brush').BrushDitherSettings | undefined
    state: ReturnType<typeof useWorkspace.getState>
  }): boolean {
    const {
      repeatedDocumentPointsAt,
      advanceIsoGridBrushEdges,
      brushLineGradient,
      optimizedRotationEnabled,
      isoGridSnapActive,
      localPointAt,
      advanceIsoBrushPath,
      compositeCacheRef,
      scheduleDraw
    } = ports
    if (
      drag.kind === 'free-tile-edit' &&
      drag.edit &&
      drag.freeTileEditDocument &&
      drag.freeTileEditLayer &&
      drag.freeTileEditOrigin &&
      drag.freeTileSourceId &&
      drag.freeTileSourceBefore &&
      drag.freeTileEditSourceOffset
    ) {
      let previous = drag.freeTileLastLocal ?? { x: previousPoint.x - drag.freeTileEditOrigin.x, y: previousPoint.y - drag.freeTileEditOrigin.y }
      let previousSize = drag.lastBrushSize ?? session.brushSize
      let previousOpacity = drag.lastOpacityScale ?? 1
      if (drag.isoAlignedStroke && drag.isoGridPointer) {
        for (const sample of pointerSamples) {
          const documentPoint = repeatedDocumentPointsAt(sample.clientX, sample.clientY, true, true)?.local ?? null
          if (!documentPoint) continue
          const speedSample = updateBrushSpeedTracking(drag.brushSpeed, sample)
          drag.brushSpeed = speedSample.state
          const targetDynamics = brushDynamicsAt(
            sample.pointerType ?? event.pointerType,
            sample.pressure,
            speedSample.speed,
            sample.pressureAvailable,
            sample.previousPressure
          )
          const strokes = advanceIsoGridBrushEdges(drag, documentPoint, targetDynamics)
          for (const stroke of strokes) {
            const localFrom = { x: stroke.from.x - drag.freeTileEditOrigin.x, y: stroke.from.y - drag.freeTileEditOrigin.y }
            const localTo = { x: stroke.to.x - drag.freeTileEditOrigin.x, y: stroke.to.y - drag.freeTileEditOrigin.y }
            const fromColor = stroke.from.color ?? drag.color ?? activeColor()
            const toColor = stroke.to.color ?? fromColor
            paintLine(
              drag.freeTileEditDocument,
              drag.freeTileEditLayer,
              drag.edit,
              localFrom.x,
              localFrom.y,
              localTo.x,
              localTo.y,
              session.brushSize,
              fromColor,
              drag.freeTileEditSelection ?? null,
              session.brushShape,
              activeBrushTexture,
              session.brushTextureScale,
              activeBrushImage,
              session.brushImageSettings,
              proceduralAntialiasStrength,
              activeBrushPaintMode,
              drag.patternOrigin,
              'balanced',
              undefined,
              undefined,
              drag.colorReplacement,
              {
                fromSize: stroke.from.size ?? session.brushSize,
                toSize: stroke.to.size ?? session.brushSize,
                fromOpacityScale: stroke.from.opacityScale ?? 1,
                toOpacityScale: stroke.to.opacityScale ?? 1,
                fromAngle: stroke.from.angle ?? 0,
                toAngle: stroke.to.angle ?? 0,
                fromColor,
                toColor,
                gradient: brushLineGradient(stroke.from.gradient, stroke.to.gradient)
              },
              'off',
              activeBrushDither,
              optimizedRotationEnabled,
              session.inkMode
            )
            previous = localTo
            previousSize = stroke.to.size ?? session.brushSize
            previousOpacity = stroke.to.opacityScale ?? 1
            drag.last = { x: stroke.to.x, y: stroke.to.y }
          }
        }
      } else if (drag.isoAlignedStroke) {
        let pathChanged = false
        for (const sample of pointerSamples) {
          const documentPoint = isoGridSnapActive
            ? (repeatedDocumentPointsAt(sample.clientX, sample.clientY, true, true)?.local ?? null)
            : localPointAt(sample.clientX, sample.clientY, true)
          if (!documentPoint) continue
          const speedSample = updateBrushSpeedTracking(drag.brushSpeed, sample)
          drag.brushSpeed = speedSample.state
          const targetDynamics = brushDynamicsAt(
            sample.pointerType ?? event.pointerType,
            sample.pressure,
            speedSample.speed,
            sample.pressureAvailable,
            sample.previousPressure
          )
          pathChanged = Boolean(advanceIsoBrushPath(drag, documentPoint, targetDynamics)) || pathChanged
        }
        if (pathChanged && drag.path && drag.path.length > 1) {
          revertPixelEdit(drag.freeTileEditDocument, drag.edit)
          drag.edit = beginPixelEdit(drag.freeTileEditLayer.id)
          for (let index = 1; index < drag.path.length; index += 1) {
            const from = drag.path[index - 1]
            const to = drag.path[index]
            const localFrom = { x: from.x - drag.freeTileEditOrigin.x, y: from.y - drag.freeTileEditOrigin.y }
            const localTo = { x: to.x - drag.freeTileEditOrigin.x, y: to.y - drag.freeTileEditOrigin.y }
            const fromColor = from.color ?? drag.color ?? activeColor()
            const toColor = to.color ?? fromColor
            paintLine(
              drag.freeTileEditDocument,
              drag.freeTileEditLayer,
              drag.edit,
              localFrom.x,
              localFrom.y,
              localTo.x,
              localTo.y,
              session.brushSize,
              fromColor,
              drag.freeTileEditSelection ?? null,
              session.brushShape,
              activeBrushTexture,
              session.brushTextureScale,
              activeBrushImage,
              session.brushImageSettings,
              proceduralAntialiasStrength,
              activeBrushPaintMode,
              drag.patternOrigin,
              'balanced',
              undefined,
              undefined,
              drag.colorReplacement,
              {
                fromSize: from.size ?? session.brushSize,
                toSize: to.size ?? session.brushSize,
                fromOpacityScale: from.opacityScale ?? 1,
                toOpacityScale: to.opacityScale ?? 1,
                fromAngle: from.angle ?? 0,
                toAngle: to.angle ?? 0,
                fromColor,
                toColor,
                gradient: brushLineGradient(from.gradient, to.gradient)
              },
              'off',
              activeBrushDither,
              optimizedRotationEnabled,
              session.inkMode
            )
          }
          const endpoint = drag.path.at(-1)!
          previous = { x: endpoint.x - drag.freeTileEditOrigin.x, y: endpoint.y - drag.freeTileEditOrigin.y }
          previousSize = endpoint.size ?? session.brushSize
          previousOpacity = endpoint.opacityScale ?? 1
          drag.last = { x: endpoint.x, y: endpoint.y }
        }
      } else {
        for (const sample of pointerSamples) {
          const documentPoint = localPointAt(sample.clientX, sample.clientY, true)
          if (!documentPoint) continue
          const local = { x: documentPoint.x - drag.freeTileEditOrigin.x, y: documentPoint.y - drag.freeTileEditOrigin.y }
          const speedSample = updateBrushSpeedTracking(drag.brushSpeed, sample)
          drag.brushSpeed = speedSample.state
          const dynamics = brushDynamicsAt(
            sample.pointerType ?? event.pointerType,
            sample.pressure,
            speedSample.speed,
            sample.pressureAvailable,
            sample.previousPressure
          )
          const distance = Math.max(Math.abs(local.x - previous.x), Math.abs(local.y - previous.y))
          const size = activeBrushImage?.intrinsicSize ? dynamics.size : smoothBrushSizeEnvelope(previousSize, dynamics.size, session.brushSize, distance)
          paintLine(
            drag.freeTileEditDocument,
            drag.freeTileEditLayer,
            drag.edit,
            previous.x,
            previous.y,
            local.x,
            local.y,
            session.brushSize,
            drag.color ?? activeColor(),
            drag.freeTileEditSelection ?? null,
            session.brushShape,
            activeBrushTexture,
            session.brushTextureScale,
            activeBrushImage,
            session.brushImageSettings,
            proceduralAntialiasStrength,
            activeBrushPaintMode,
            drag.patternOrigin,
            'raster',
            undefined,
            undefined,
            drag.colorReplacement,
            {
              fromSize: previousSize,
              toSize: size,
              fromOpacityScale: previousOpacity,
              toOpacityScale: dynamics.opacityScale,
              fromAngle: drag.path?.at(-1)?.angle ?? brushBaseAngle(session),
              toAngle: brushAngleWithDynamics(session, dynamics.angle)
            },
            'off',
            activeBrushDither,
            optimizedRotationEnabled,
            session.inkMode
          )
          previous = local
          previousSize = size
          previousOpacity = dynamics.opacityScale
        }
      }
      drag.freeTileLastLocal = previous
      drag.lastBrushSize = previousSize
      drag.lastOpacityScale = previousOpacity
      const sourceEdit: FreeTileSourceEditRaster = {
        document: drag.freeTileEditDocument,
        layer: drag.freeTileEditLayer,
        before: drag.freeTileSourceBefore,
        origin: drag.freeTileEditOrigin,
        sourceOffset: drag.freeTileEditSourceOffset,
        instanceTransform: drag.freeTileEditInstanceTransform ?? {},
        transformedSourceBounds: drag.freeTileEditTransformedSourceBounds ?? {
          x: drag.freeTileSourceBefore.offsetX,
          y: drag.freeTileSourceBefore.offsetY,
          width: drag.freeTileSourceBefore.width,
          height: drag.freeTileSourceBefore.height
        }
      }
      const cropped = freeTileSourceSnapshotFromEditRaster(sourceEdit)
      state.previewFreeTileSource(drag.freeTileSourceId, cropped.width, cropped.height, cropped.pixels, cropped.offsetX, cropped.offsetY)
      compositeCacheRef.current.invalidateAll()
      scheduleDraw()
      return true
    }
    return false
  }
  return { beginFreeTileEdit, moveFreeTileEdit }
}
