import { isWorkspaceResizing } from './workspace-resize'
import { useEffect, useRef } from 'react'
import type { RgbaColor } from '@shared/types-color'
import type { SelectionMask, SelectionRect } from '@shared/types-selection'
import { useWorkspace, type DocumentSession } from '@/store/workspace'
import { activePaintLayer } from '@/store/workspace-session'
import { createCanvasRenderPlan, deviceAlignedCanvasRect, deviceAlignedCoordinate } from '@/core/canvas-render-plan'
import { canvasBackingRatioForInterfaceScale } from '@/core/canvas-interface-scale'
import { rectSelection, selectionQuadBounds, transformedSelectionControlPoints, transformedSelectionPivotPreset } from '@/core/selection'
import {
  CanvasInputState,
  canvasGestureForPreview,
  drawingSizePreviewTargetForDrag,
  selectionOverlayFrameForDrag,
  type CanvasPoint as Point
} from '@/core/canvas-input'
import {
  drawSelectionOutline,
  drawSelectionSizeLabel,
  selectionScreenBox,
  selectionScreenPoint,
  type RasterContext2D,
  type SelectionBoundaryCache
} from '@/components/canvas-selection-renderer'
import { canvasBackingCapacity, clearCanvasBacking, syncCanvasDisplaySize } from '@/components/canvas-display-size'
import { activeTilemapCelTarget } from '@/core/tilemap-document'
import { expandSelectionToTilemapCells } from '@/core/tilemap'
import selectionPivotIcon from '@/assets/pixel-icons/selection-pivot.svg'
import { PolygonPathPreviewRenderCache, SELECTION_PIVOT_ICON_SIZE, selectedTextBoxForSession, SELECTION_PIVOT_ICON_OFFSET } from './canvas-stage-helpers'
interface Ports {
  readonly selectionOverlayDrawRef: import('react').RefObject<() => void>
  readonly canvasRef: import('react').RefObject<HTMLCanvasElement | null>
  readonly selectionCanvasRef: import('react').RefObject<HTMLCanvasElement | null>
  readonly session: DocumentSession
  readonly inputRef: import('react').RefObject<CanvasInputState>
  readonly textToolBoxRef: import('react').RefObject<SelectionRect | null>
  readonly displayedSelectionPoint: (point: Point) => Point
  readonly stageSize: () => {
    width: number
    height: number
  }
  readonly stageDisplaySize: () => {
    width: number
    height: number
  }
  readonly interfaceScale: 0.75 | 1 | 1.5 | 2
  readonly alignmentPreferences: {
    gridAlignmentEnabled: boolean
    smartAlignmentEnabled: boolean
    alignmentGuidesVisible: boolean
    alignmentThreshold: number
  }
  readonly selectedFreeTileInstancesBounds: (current?: DocumentSession) => SelectionRect | null
  readonly selectionSizeVisible: boolean
  readonly liveViewRef: import('react').RefObject<import('@shared/types-view').ViewState>
  readonly rotationIndicatorPosition: import('@/core/file-preferences').RotationIndicatorPosition
  readonly activeTheme: import('@/core/theme').ResolvedTheme
  readonly textBoxColor: RgbaColor
  readonly freeTileInstanceOutlineColor: RgbaColor
  readonly applyViewRotation: (context: CanvasRenderingContext2D, width: number, height: number, view: DocumentSession['view']) => void
  readonly t: (key: import('@/locales/contracts').TranslationKey, params?: import('@/locales/contracts').TranslationParams) => string
}

export function useCanvasSelectionOverlay(ports: Ports) {
  const selectionTimerRef = useRef<number | null>(null)
  const selectionRotationSceneRef = useRef<OffscreenCanvas | null>(null)

  const selectionBoundaryCacheRef = useRef<SelectionBoundaryCache | null>(null)

  const polygonPathPreviewRenderCacheRef = useRef<PolygonPathPreviewRenderCache | null>(null)

  const selectionOverlayVisibleRef = useRef(false)

  const selectionPivotImageRef = useRef<HTMLImageElement | null>(null)

  useEffect(() => {
    const image = new Image(SELECTION_PIVOT_ICON_SIZE, SELECTION_PIVOT_ICON_SIZE)
    image.onload = () => ports.selectionOverlayDrawRef.current()
    image.src = selectionPivotIcon
    selectionPivotImageRef.current = image
    return () => {
      image.onload = null
      if (selectionPivotImageRef.current === image) selectionPivotImageRef.current = null
    }
  }, [])

  const drawSelectionOverlay = (): void => {
    const canvas = ports.canvasRef.current
    const overlay = ports.selectionCanvasRef.current
    if (!canvas || !overlay) return
    const currentSession = useWorkspace.getState().sessions.find((item) => item.document.id === ports.session.document.id) ?? ports.session
    const selectionDrag = canvasGestureForPreview(ports.inputRef.current.drag)
    const textBoxTransform = currentSession.textBoxTransform
    const activeTextBoxDrag =
      ports.inputRef.current.drag?.kind === 'transform-text-box' || ports.inputRef.current.drag?.kind === 'create-text-box' ? ports.inputRef.current.drag : null
    const selectedTextBox = selectedTextBoxForSession(currentSession)
    const visibleTextBox = activeTextBoxDrag?.previewTarget ?? ports.textToolBoxRef.current ?? textBoxTransform?.bounds ?? selectedTextBox
    const creatingSelection = selectionDrag?.kind === 'marquee' || selectionDrag?.kind === 'lasso' || selectionDrag?.kind === 'polygon-lasso'
    const transformedDrag =
      selectionDrag &&
      (selectionDrag.kind === 'move-content' ||
        selectionDrag.kind === 'transform-content' ||
        selectionDrag.kind === 'rotate-content' ||
        selectionDrag.kind === 'shear-content')
        ? selectionDrag
        : null
    const rotatingDrag = transformedDrag?.kind === 'rotate-content' ? transformedDrag : null
    const rotatingSelection = Boolean(rotatingDrag)
    const overlayFrame = selectionOverlayFrameForDrag(currentSession.selection, selectionDrag)
    // Magic-wand previews are rendered on the main canvas so the dashed
    // boundary follows the worker result in the same draw pass as the image.
    // Do not also paint the committed/preview selection on the separate
    // selection overlay canvas: while the pointer is held that produced two
    // independently cached marching-ant paths, which looked like ghosted
    // residual outlines. Once the gesture ends the normal overlay resumes.
    const visibleSelection = selectionDrag?.kind === 'magic-preview' ? null : overlayFrame.selection
    const selectionSizeTarget = drawingSizePreviewTargetForDrag(selectionDrag, currentSession.shapeRatio)
    const tilemapPaintReadout =
      selectionSizeTarget && selectionDrag?.kind === 'marquee' && currentSession.tilemapMode === 'paint' && activePaintLayer(currentSession).kind === 'tilemap'
        ? (() => {
            const target = activeTilemapCelTarget(currentSession.document)
            const expanded = target
              ? expandSelectionToTilemapCells(
                  rectSelection(selectionSizeTarget.x, selectionSizeTarget.y, selectionSizeTarget.width, selectionSizeTarget.height),
                  target.tilemap,
                  target.surface.offsetX,
                  target.surface.offsetY,
                  { x: 0, y: 0, width: currentSession.document.width, height: currentSession.document.height }
                )
              : null
            if (!target || !expanded) return null
            return {
              target: { x: expanded.x, y: expanded.y, width: expanded.width, height: expanded.height },
              columns: Math.max(1, Math.round(expanded.width / target.tilemap.tileWidth)),
              rows: Math.max(1, Math.round(expanded.height / target.tilemap.tileHeight)),
              anchor: ports.displayedSelectionPoint({ x: expanded.x, y: expanded.y })
            }
          })()
        : null
    const selectionSizeLabelTarget = tilemapPaintReadout?.target ?? selectionSizeTarget
    const selectionSizeLabelAngle = tilemapPaintReadout
      ? 0
      : selectionDrag?.kind === 'marquee' || selectionDrag?.kind === 'shape'
        ? (selectionDrag.previewAngle ?? selectionDrag.marqueeAngle ?? 0)
        : 0
    const rect = ports.stageSize()
    const displaySize = ports.stageDisplaySize()
    const dpr = canvasBackingRatioForInterfaceScale(window.devicePixelRatio || 1, ports.interfaceScale)
    const deviceScale = syncCanvasDisplaySize(overlay, rect.width, rect.height, dpr, displaySize.width, displaySize.height, isWorkspaceResizing())
    const displayContext = overlay.getContext('2d')
    if (!displayContext) return
    displayContext.setTransform(deviceScale.x, 0, 0, deviceScale.y, 0, 0)
    clearCanvasBacking(displayContext, overlay)
    displayContext.setTransform(deviceScale.x, 0, 0, deviceScale.y, 0, 0)
    const alignmentGuides = ports.alignmentPreferences.alignmentGuidesVisible ? (selectionDrag?.alignmentGuides ?? []) : []
    const freeTileInstancesSelectionBounds =
      !visibleSelection && !visibleTextBox && !currentSession.animationPlaying ? ports.selectedFreeTileInstancesBounds(currentSession) : null
    const shouldDrawSelection = Boolean(
      visibleSelection || visibleTextBox || freeTileInstancesSelectionBounds || (ports.selectionSizeVisible && selectionSizeTarget) || alignmentGuides.length
    )
    selectionOverlayVisibleRef.current = shouldDrawSelection
    if (!shouldDrawSelection) return
    const renderPlan = createCanvasRenderPlan(rect.width, rect.height, ports.session.document, ports.liveViewRef.current, ports.rotationIndicatorPosition)
    const { rotated, sceneLeft, sceneTop, sceneWidth, sceneHeight, originX, originY, canvasWidth, canvasHeight } = renderPlan
    let context: RasterContext2D = displayContext
    if (rotated) {
      let scene = selectionRotationSceneRef.current
      const sceneBackingWidth = canvasBackingCapacity(Math.max(1, Math.ceil(sceneWidth * deviceScale.x)), scene?.width ?? 0, isWorkspaceResizing())
      const sceneBackingHeight = canvasBackingCapacity(Math.max(1, Math.ceil(sceneHeight * deviceScale.y)), scene?.height ?? 0, isWorkspaceResizing())
      if (!scene || scene.width !== sceneBackingWidth || scene.height !== sceneBackingHeight) {
        scene = new OffscreenCanvas(sceneBackingWidth, sceneBackingHeight)
        selectionRotationSceneRef.current = scene
      }
      const sceneContext = scene.getContext('2d')
      if (!sceneContext) return
      sceneContext.setTransform(deviceScale.x, 0, 0, deviceScale.y, -sceneLeft * deviceScale.x, -sceneTop * deviceScale.y)
      clearCanvasBacking(sceneContext, scene)
      // This overlay sits above the document canvas, so keep the scene
      // transparent outside the preview geometry. An opaque surround here
      // would hide the rotated document during selection and shape previews.
      sceneContext.setTransform(deviceScale.x, 0, 0, deviceScale.y, -sceneLeft * deviceScale.x, -sceneTop * deviceScale.y)
      context = sceneContext
    }
    if (alignmentGuides.length) {
      const devicePixelX = 1 / deviceScale.x
      const devicePixelY = 1 / deviceScale.y
      const alignToDevicePixelX = (value: number): number => deviceAlignedCoordinate(value, deviceScale.x)
      const alignToDevicePixelY = (value: number): number => deviceAlignedCoordinate(value, deviceScale.y)
      context.save()
      context.beginPath()
      const boundary = deviceAlignedCanvasRect(originX, originY, canvasWidth, canvasHeight, deviceScale)
      context.rect(boundary.left, boundary.top, boundary.width, boundary.height)
      context.clip()
      context.globalCompositeOperation = 'source-over'
      context.globalAlpha = 0.9
      context.fillStyle = '#2979FF'
      for (const guide of alignmentGuides) {
        if (guide.axis === 'x' && guide.position >= 0 && guide.position <= ports.session.document.width) {
          const x =
            alignToDevicePixelX(originX + guide.position * ports.liveViewRef.current.zoom) -
            (guide.position === ports.session.document.width ? devicePixelX : 0)
          context.fillRect(x, boundary.top, devicePixelX, boundary.height)
        } else if (guide.axis === 'y' && guide.position >= 0 && guide.position <= ports.session.document.height) {
          const y =
            alignToDevicePixelY(originY + guide.position * ports.liveViewRef.current.zoom) -
            (guide.position === ports.session.document.height ? devicePixelY : 0)
          context.fillRect(boundary.left, y, boundary.width, devicePixelY)
        }
      }
      context.restore()
    }
    const floatingTransform = currentSession.pendingPaste
    const transformedQuad = transformedDrag?.freeTransform
      ? overlayFrame.quad
      : currentSession.freeTransformActive
        ? (currentSession.pendingPaste?.transformQuad ?? currentSession.freeTransformQuad ?? undefined)
        : undefined
    const transformedTarget = transformedQuad
      ? selectionQuadBounds(transformedQuad)
      : transformedDrag
        ? overlayFrame.target
        : (floatingTransform?.transformTarget ?? (currentSession.freeTransformActive ? (visibleSelection ?? undefined) : undefined))
    const transformedAngle = transformedQuad ? 0 : transformedDrag ? overlayFrame.angle : (floatingTransform?.transformAngle ?? 0)
    const transformedShear = transformedQuad ? undefined : transformedDrag ? overlayFrame.shear : floatingTransform?.transformShear
    const transformedHandlePoints = transformedQuad
      ? [transformedQuad.nw, transformedQuad.ne, transformedQuad.sw, transformedQuad.se].map((point) =>
          selectionScreenPoint(rect.width, rect.height, ports.session.document.width, ports.session.document.height, ports.liveViewRef.current, point)
        )
      : transformedTarget
        ? transformedSelectionControlPoints(transformedTarget, transformedAngle, transformedShear)
            .filter((_point, index) => !currentSession.freeTransformActive || index === 0 || index === 2 || index === 5 || index === 7)
            .map((point) =>
              selectionScreenPoint(rect.width, rect.height, ports.session.document.width, ports.session.document.height, ports.liveViewRef.current, point)
            )
        : undefined
    const transformedFramePoints = transformedQuad
      ? [transformedQuad.nw, transformedQuad.ne, transformedQuad.se, transformedQuad.sw].map((point) =>
          selectionScreenPoint(rect.width, rect.height, ports.session.document.width, ports.session.document.height, ports.liveViewRef.current, point)
        )
      : undefined
    const pivotTarget = transformedTarget ?? visibleSelection ?? undefined
    const visiblePivot =
      visibleSelection &&
      !visibleTextBox &&
      currentSession.freeTransformActive !== true &&
      currentSession.view.showSelectionPivot !== false &&
      !creatingSelection &&
      pivotTarget
        ? (overlayFrame.pivot ??
          currentSession.selectionPivot ??
          transformedSelectionPivotPreset(pivotTarget, 'center', transformedTarget ? transformedAngle : 0, transformedTarget ? transformedShear : undefined))
        : null
    const drawOverlaySelection = (selection: SelectionMask, showHandles: boolean, color?: string): void => {
      selectionBoundaryCacheRef.current = drawSelectionOutline({
        context,
        selection,
        box: selectionScreenBox(rect.width, rect.height, ports.session.document.width, ports.session.document.height, ports.liveViewRef.current, selection),
        view: ports.liveViewRef.current,
        viewportWidth: rect.width,
        viewportHeight: rect.height,
        rotationIndicatorPosition: ports.rotationIndicatorPosition,
        cache: selectionBoundaryCacheRef.current,
        outlineDark: color ?? ports.activeTheme.variables['--theme-selection-outline-dark'],
        outlineLight: color ?? ports.activeTheme.variables['--theme-selection-outline-light'],
        showOutline: !rotatingSelection && currentSession.view.showSelectionOutline !== false,
        showHandles,
        handlePoints: transformedHandlePoints,
        framePoints: transformedFramePoints
      })
    }
    if (visibleTextBox) {
      const selection = rectSelection(visibleTextBox.x, visibleTextBox.y, visibleTextBox.width, visibleTextBox.height)
      drawOverlaySelection(
        selection,
        currentSession.tool === 'text' && Boolean(selectedTextBox),
        `rgb(${ports.textBoxColor.r} ${ports.textBoxColor.g} ${ports.textBoxColor.b} / ${ports.textBoxColor.a / 255})`
      )
    } else if (visibleSelection) drawOverlaySelection(visibleSelection, currentSession.tool === 'selection' && !creatingSelection)
    else if (freeTileInstancesSelectionBounds)
      drawOverlaySelection(
        rectSelection(
          freeTileInstancesSelectionBounds.x,
          freeTileInstancesSelectionBounds.y,
          freeTileInstancesSelectionBounds.width,
          freeTileInstancesSelectionBounds.height
        ),
        false,
        `rgb(${ports.freeTileInstanceOutlineColor.r} ${ports.freeTileInstanceOutlineColor.g} ${ports.freeTileInstanceOutlineColor.b} / ${ports.freeTileInstanceOutlineColor.a / 255})`
      )
    if (rotated) {
      displayContext.save()
      ports.applyViewRotation(displayContext, rect.width, rect.height, ports.liveViewRef.current)
      displayContext.imageSmoothingEnabled = false
      const scene = selectionRotationSceneRef.current!
      // Use the actual horizontal/vertical backing ratios.  The scene size
      // is rounded independently on each axis, so a single nominal DPR can
      // introduce a second fractional scale at the final composite step.
      displayContext.drawImage(scene, 0, 0, scene.width, scene.height, sceneLeft, sceneTop, scene.width / deviceScale.x, scene.height / deviceScale.y)
      displayContext.restore()
    }
    const pivotImage = selectionPivotImageRef.current
    if (visiblePivot && pivotImage?.complete && pivotImage.naturalWidth > 0) {
      const point = ports.displayedSelectionPoint(visiblePivot)
      displayContext.save()
      displayContext.imageSmoothingEnabled = false
      displayContext.drawImage(
        pivotImage,
        Math.round(point.x) - SELECTION_PIVOT_ICON_OFFSET,
        Math.round(point.y) - SELECTION_PIVOT_ICON_OFFSET,
        SELECTION_PIVOT_ICON_SIZE,
        SELECTION_PIVOT_ICON_SIZE
      )
      displayContext.restore()
    }
    if (ports.selectionSizeVisible && selectionSizeLabelTarget) {
      const controlPoints = transformedSelectionControlPoints(selectionSizeLabelTarget, selectionSizeLabelAngle)
      drawSelectionSizeLabel({
        context: displayContext,
        points: [controlPoints[0], controlPoints[2], controlPoints[5], controlPoints[7]].map(ports.displayedSelectionPoint),
        selectionX: selectionSizeLabelTarget.x,
        selectionY: selectionSizeLabelTarget.y,
        selectionWidth: selectionSizeLabelTarget.width,
        selectionHeight: selectionSizeLabelTarget.height,
        viewportWidth: rect.width,
        viewportHeight: rect.height,
        startLabel: ports.t('canvas.selectionInfo.start'),
        endLabel: ports.t('canvas.selectionInfo.end'),
        sizeLabel: tilemapPaintReadout ? ports.t('canvas.selectionInfo.tiles') : ports.t('canvas.selectionInfo.size'),
        background: 'rgb(64 64 64 / 0.78)',
        foreground: '#ffffff',
        sizeWidth: tilemapPaintReadout?.columns,
        sizeHeight: tilemapPaintReadout?.rows,
        anchor: tilemapPaintReadout?.anchor
      })
    }
  }

  ports.selectionOverlayDrawRef.current = drawSelectionOverlay

  const selectionOverlayAnimated = Boolean(ports.session.selection || selectedTextBoxForSession(ports.session))

  useEffect(() => {
    if (!selectionOverlayAnimated) return
    const renderSelection = (): void => {
      ports.selectionOverlayDrawRef.current()
      const currentSession = useWorkspace.getState().sessions.find((item) => item.document.id === ports.session.document.id)
      if (currentSession?.selection || (currentSession && selectedTextBoxForSession(currentSession)))
        selectionTimerRef.current = window.setTimeout(renderSelection, 160)
    }
    selectionTimerRef.current = window.setTimeout(renderSelection, 160)
    return () => {
      if (selectionTimerRef.current) window.clearTimeout(selectionTimerRef.current)
      selectionTimerRef.current = null
    }
  }, [selectionOverlayAnimated, ports.session.document.id])
  return { selectionBoundaryCacheRef, polygonPathPreviewRenderCacheRef, drawSelectionOverlay }
}
