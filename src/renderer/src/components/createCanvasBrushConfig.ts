import { createCanvasStrokeBrush } from './canvas-stroke-brush'
import { constrainGradientEndpoint, resolveRadialGradientGeometry, type GradientGeometryOptions } from '@/core/gradient'
import { DEFAULT_BRUSH_DITHER_SETTINGS } from '@/core/gradient-color'
import { DEFAULT_GRID_SETTINGS, snapPointToGrid } from '@/core/grid'
import { brushStampAnchor } from '@/core/tools-brush'
import { type DocumentSession } from '@/store/workspace'
import { constrainLineEndpoint } from '@/core/pixel-line'
import { isoGridLineSegment, isoLineEndpoint, snapIsoPointToGridVertex } from '@/core/isometric'
import { selectionRotationAngle, type CanvasDragState as DragState, type CanvasPoint as Point } from '@/core/canvas-input'
import { defaultSymmetryCenter } from '@/core/symmetry'
import { activeBrushInputsForTool } from '@/core/brushes'
interface Ports {
  readonly session: DocumentSession
  readonly isoViewPreferences: import('@/core/file-preferences').IsoViewPreferences
  readonly alignmentPreferences: {
    gridAlignmentEnabled: boolean
    smartAlignmentEnabled: boolean
    alignmentGuidesVisible: boolean
    alignmentThreshold: number
  }
  readonly canvasPreferences: import('@/core/file-preferences').EditorPreferences
  readonly balancedShiftLineEnabled: boolean
  readonly lineDirectionStep: number
}

export function createCanvasBrushConfig(ports: Ports) {
  const lineAnchor = ports.session.tool === 'eraser' ? ports.session.lastEraserPoint : ports.session.lastPencilPoint

  const isoGridSnapActive = ports.session.view.isoViewEnabled === true && ports.isoViewPreferences.snapToGrid

  const isoLineAlignmentActive = ports.session.view.isoViewEnabled === true && (ports.isoViewPreferences.forceLineAlignment || isoGridSnapActive)

  // Cartesian snapping follows Aseprite's closest-grid-vertex rule. The
  // isometric path has its own geometry and therefore takes precedence.
  const gridSnapActive = ports.session.view.isoViewEnabled !== true && ports.alignmentPreferences.gridAlignmentEnabled && ports.session.view.showGrid

  const { brushLineGradient, sameRgbaColor, advanceIsoBrushPath, advanceIsoGridBrushEdges, snapBrushPointToGrid } = createCanvasStrokeBrush(
    ports.session,
    ports.canvasPreferences
  )

  const balancedStraightLines = ports.balancedShiftLineEnabled || isoLineAlignmentActive

  const snapToIsoGrid = (point: Point): Point =>
    snapIsoPointToGridVertex(point, ports.isoViewPreferences.stairStep, ports.isoViewPreferences.guideUnitSize, {
      x: ports.isoViewPreferences.guideOriginX,
      y: ports.isoViewPreferences.guideOriginY
    })

  const resolveStraightLine = (from: Point, to: Point, constrained: boolean): { from: Point; to: Point } => {
    const start = isoGridSnapActive ? snapToIsoGrid(from) : gridSnapActive ? snapPointToGrid(from, ports.session.view.grid ?? DEFAULT_GRID_SETTINGS) : from
    if (isoGridSnapActive) return isoGridLineSegment(start, to, ports.isoViewPreferences.stairStep)
    const target = isoLineAlignmentActive
      ? isoLineEndpoint(start, to, ports.isoViewPreferences.stairStep)
      : constrained
        ? constrainLineEndpoint(start, to, ports.lineDirectionStep)
        : to
    return { from: start, to: gridSnapActive ? snapPointToGrid(target, ports.session.view.grid ?? DEFAULT_GRID_SETTINGS) : target }
  }

  // Sessions created before the symmetry center field was introduced may still
  // exist during hot reload. Resolve that legacy state once per render.
  const symmetryCenter = ports.session.symmetryCenter ?? defaultSymmetryCenter(ports.session.document.width, ports.session.document.height)

  const fillKind = ports.session.fillKind ?? 'bucket'

  const sliceTool = ports.session.tool === 'move' && ports.session.moveKind === 'slice'

  const gradientDither = ports.session.gradientDither ?? 'none'

  const gradientStops = ports.session.gradientFreeform ? ports.session.gradientStops : undefined

  const gradientStopsForButton = (button: number): typeof gradientStops =>
    button === 2 && gradientStops
      ? gradientStops
          .slice()
          .reverse()
          .map((stop) => ({ position: 1 - stop.position, color: { ...stop.color } }))
      : gradientStops

  const gradientType = ports.session.gradientType ?? 'linear'

  const radialGradientCenterModifierActive = (targetSession: DocumentSession, event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey'>): boolean =>
    targetSession.tool === 'fill' &&
    (targetSession.fillKind ?? 'bucket') === 'gradient' &&
    (targetSession.gradientType ?? 'linear') === 'radial' &&
    Boolean(event.ctrlKey || event.metaKey)

  const gradientGeometryOptionsForDrag = (
    drag: Pick<DragState, 'constrain' | 'gradientFromCenter' | 'gradientAngle' | 'gradientRadialGeometry'>
  ): GradientGeometryOptions | undefined =>
    gradientType === 'radial'
      ? {
          fromCenter: Boolean(drag.gradientFromCenter),
          proportional: Boolean(drag.constrain),
          angle: drag.gradientAngle ?? 0,
          radialGeometry: drag.gradientRadialGeometry
        }
      : undefined

  const updateGradientDragGeometry = (drag: DragState, point: Point, modifiers: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>): void => {
    if (drag.kind !== 'gradient') return
    const snappedPoint = gridSnapActive ? snapPointToGrid(point, ports.session.view.grid ?? DEFAULT_GRID_SETTINGS) : point
    const radial = gradientType === 'radial'
    drag.constrain = modifiers.shiftKey
    drag.gradientFromCenter = radial && Boolean(modifiers.ctrlKey || modifiers.metaKey)
    if (!radial) {
      drag.gradientAngle = 0
      drag.gradientRadialGeometry = undefined
      drag.gradientRotationStart = undefined
      drag.last = modifiers.shiftKey ? constrainGradientEndpoint(drag.start, snappedPoint) : snappedPoint
      return
    }
    if (modifiers.altKey) {
      if (!drag.gradientRotationStart) {
        const geometry = resolveRadialGradientGeometry(drag.start, snappedPoint, {
          fromCenter: Boolean(drag.gradientFromCenter),
          proportional: Boolean(drag.constrain)
        })
        const frozenGeometry = { center: { ...geometry.center }, radiusX: geometry.radiusX, radiusY: geometry.radiusY }
        drag.gradientRotationStart = { pointer: { ...snappedPoint }, angle: drag.gradientAngle ?? 0, geometry: frozenGeometry }
        drag.gradientRadialGeometry = frozenGeometry
      }
      const rotationStart = drag.gradientRotationStart
      const bounds = {
        x: rotationStart.geometry.center.x - rotationStart.geometry.radiusX,
        y: rotationStart.geometry.center.y - rotationStart.geometry.radiusY,
        width: rotationStart.geometry.radiusX * 2,
        height: rotationStart.geometry.radiusY * 2
      }
      drag.gradientAngle = rotationStart.angle + selectionRotationAngle(bounds, rotationStart.pointer, snappedPoint, false, rotationStart.geometry.center)
      drag.gradientRadialGeometry = rotationStart.geometry
    } else if (drag.gradientRotationStart) {
      // Keep the angle for the rest of the drag, while allowing the next
      // pointer move to resize the radial gradient again.
      drag.gradientRotationStart = undefined
      drag.gradientRadialGeometry = undefined
    } else {
      drag.gradientRadialGeometry = undefined
    }
    drag.last = snappedPoint
  }

  const selectionCornerRadius = ports.session.selectionRounded ? ports.session.selectionCornerRadius : 0

  const shapeCornerRadius = ports.session.shapeRounded ? ports.session.shapeCornerRadius : 0

  const brushInputs = activeBrushInputsForTool(ports.session.tool, fillKind, ports.session.brushImage, ports.session.brushTexture)

  const activeBrushImage = brushInputs.imageBrush

  const activeBrushTexture = brushInputs.texture

  const activeBrushDither = activeBrushImage ? undefined : (ports.session.brushDither ?? DEFAULT_BRUSH_DITHER_SETTINGS)

  const activeBrushPaintMode = activeBrushImage?.intrinsicSize ? ports.session.brushPaintMode : 'paint'

  const activeBrushPreviewMode = activeBrushPaintMode

  const proceduralAntialiasStrength =
    brushInputs.fillTextureEnabled && ports.session.proceduralAntialias && activeBrushImage?.id.startsWith('procedural:')
      ? ports.session.proceduralAntialiasStrength
      : 0

  const brushPatternOrigin = (point: Point, size = ports.session.brushSize, imageBrush = activeBrushImage): Point => {
    const anchor = brushStampAnchor(size, imageBrush)
    return { x: point.x - anchor.x, y: point.y - anchor.y }
  }
  return {
    lineAnchor,
    isoGridSnapActive,
    isoLineAlignmentActive,
    gridSnapActive,
    brushLineGradient,
    sameRgbaColor,
    advanceIsoBrushPath,
    advanceIsoGridBrushEdges,
    snapBrushPointToGrid,
    balancedStraightLines,
    snapToIsoGrid,
    resolveStraightLine,
    symmetryCenter,
    fillKind,
    sliceTool,
    gradientDither,
    gradientStops,
    gradientStopsForButton,
    gradientType,
    radialGradientCenterModifierActive,
    gradientGeometryOptionsForDrag,
    updateGradientDragGeometry,
    selectionCornerRadius,
    shapeCornerRadius,
    activeBrushImage,
    activeBrushTexture,
    activeBrushDither,
    activeBrushPaintMode,
    activeBrushPreviewMode,
    proceduralAntialiasStrength,
    brushPatternOrigin
  }
}
