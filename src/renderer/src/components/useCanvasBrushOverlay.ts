import { brushPreviewNeedsComposite } from './canvas-brush-layer-preview'
import { isWorkspaceResizing } from './workspace-resize'
import { useEffect, useRef } from 'react'
import type { RgbaColor } from '@shared/types-color'
import { isLayerEffectivelyLocked, resolveLayerCanvasColor } from '@/core/document-model'
import { DEFAULT_BRUSH_DITHER_SETTINGS } from '@/core/gradient-color'
import { drawBrushCoverageOverlay } from './canvas-brush-coverage-overlay'
import { collectSmoothBrushArea, SMOOTH_BRUSH_OVERLAY } from '@/core/smooth-brush'
import { brushStampAnchor, solidBrushPreviewRowSpans } from '@/core/tools-brush'
import { useWorkspace, type DocumentSession } from '@/store/workspace'
import { activePaintLayer, isToolAvailableForSession } from '@/store/workspace-session'
import { createCanvasRenderPlan, deviceAlignedPixelRect } from '@/core/canvas-render-plan'
import { canvasBackingRatioForInterfaceScale } from '@/core/canvas-interface-scale'
import { selectionContains } from '@/core/selection'
import { CanvasInputState, type CanvasDragState as DragState, type CanvasPoint as Point } from '@/core/canvas-input'
import { canvasAdaptiveContrast } from './canvas-adaptive-contrast'
import { CanvasAdaptiveOutline, alignCanvasStrokePath } from './canvas-adaptive-outline'
import { syncCanvasDisplaySize } from '@/components/canvas-display-size'
import { CanvasOverlayDamage } from './canvas-overlay-damage'
import { canvasBrushSizePreviewSession } from './canvas-brush-size-update'
import { shareCanvasToolSettings } from './canvas-stage-helpers'
import { activeBrushInputsForTool } from '@/core/brushes'
import { brushOpacityScale } from '@/core/pressure'
import { BrushPreviewCompositeCache, BrushPreviewStackCache, brushAngleWithDynamics, brushBaseAngle } from './canvas-stage-helpers'
interface Ports {
  readonly canvasRef: import('react').RefObject<HTMLCanvasElement | null>
  readonly inputRef: import('react').RefObject<CanvasInputState>
  readonly brushPreviewMode: import('@/core/file-preferences').BrushPreviewMode
  readonly brushEdgeColor?: RgbaColor
  readonly brushEdgeThickness?: number
  readonly drawingBrushPreviewEnabled: boolean
  readonly liveViewRef: import('react').RefObject<import('@shared/types-view').ViewState>
  readonly session: DocumentSession
  readonly stageSize: () => {
    width: number
    height: number
  }
  readonly stageDisplaySize: () => {
    width: number
    height: number
  }
  readonly interfaceScale: import('@/core/file-preferences').UiScale
  readonly repeatedDocumentPointsAt: (
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
  readonly rotationIndicatorPosition: import('@/core/file-preferences').RotationIndicatorPosition
  readonly applyViewRotation: (context: CanvasRenderingContext2D, width: number, height: number, view: DocumentSession['view']) => void
  readonly optimizedRotationEnabled: boolean
  readonly snapBrushPointToGrid: (
    point: Point,
    size: number,
    imageBrush?: Parameters<typeof brushStampAnchor>[1],
    angle?: number,
    currentSession?: DocumentSession
  ) => Point
  readonly cursorCompositePointSamplerFor: (currentSession: DocumentSession) => (x: number, y: number) => RgbaColor
  readonly activeTheme: import('@/core/theme').ResolvedTheme
  readonly scheduleDraw: () => void
  readonly activeToolBrushSize: number | null
  readonly temporaryMoveActive?: (
    event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>,
    targetSession?: DocumentSession
  ) => boolean
}

export function useCanvasBrushOverlay(ports: Ports) {
  const previewToolAvailable = useWorkspace((state) => {
    const session = state.sessions.find((item) => item.document.id === ports.session.document.id) ?? ports.session
    return isToolAvailableForSession(session, session.tool)
  })
  // The brush cursor is a transient overlay. Keeping it off the document
  // canvas means pointer movement does not force a full layer composite.
  const brushPreviewCanvasRef = useRef<HTMLCanvasElement>(null)
  const damageRef = useRef(new CanvasOverlayDamage())

  const brushPreviewDrawRef = useRef<() => void>(() => {})

  const brushPreviewRequestRef = useRef<number | null>(null)

  const brushPreviewCompositeCacheRef = useRef<BrushPreviewCompositeCache | null>(null)

  const brushPreviewStackCacheRef = useRef<BrushPreviewStackCache | null>(null)

  const brushPreviewOverlaySupported = (currentSession: DocumentSession): boolean => {
    if (currentSession.animationPlaying || !isToolAvailableForSession(currentSession, currentSession.tool)) return false
    // Shift-connected strokes are rendered on the document canvas. Updating
    // only this cursor overlay leaves the line frozen at the last full draw.
    if (ports.inputRef.current.shiftLinePreview && (currentSession.tool === 'pencil' || currentSession.tool === 'eraser')) return false
    if (
      !ports.inputRef.current.modifierBrushSize && ports.temporaryMoveActive?.(
        {
          ctrlKey: ports.inputRef.current.ctrlHeld,
          metaKey: false,
          altKey: ports.inputRef.current.altHeld,
          shiftKey: ports.inputRef.current.shiftHeld
        },
        currentSession
      )
    )
      return false
    if (currentSession.tool === 'selection' && currentSession.selectionKind === 'brush') {
      const drag = ports.inputRef.current.drag
      return !currentSession.freeTransformActive && (!drag || drag.kind === 'selection-brush') && ports.inputRef.current.pointer.visible && !ports.inputRef.current.spaceHeld && !ports.inputRef.current.sampling
    }
    if (currentSession.tool === 'smooth') {
      const drag = ports.inputRef.current.drag
      return ports.inputRef.current.pointer.visible && !ports.inputRef.current.spaceHeld && !ports.inputRef.current.sampling && drag?.kind !== 'pan'
    }
    if (currentSession.tool === 'liquify') {
      const drag = ports.inputRef.current.drag
      return (
        ports.brushPreviewMode !== 'none' &&
        (!drag || (drag.kind === 'liquify' && ports.drawingBrushPreviewEnabled)) &&
        ports.inputRef.current.pointer.visible &&
        !ports.inputRef.current.sampling &&
        !ports.inputRef.current.spaceHeld
      )
    }
    if (ports.brushPreviewMode === 'none' || !['pencil', 'eraser', 'line'].includes(currentSession.tool)
      || (currentSession.tool !== 'eraser' && currentSession.inkMode !== 'simple')) return false
    if (currentSession.tool === 'line' && ports.brushPreviewMode === 'full') return false
    if ((ports.brushPreviewMode === 'full' || ports.brushPreviewMode === 'full-edge') && currentSession.tool !== 'eraser'
      && brushPreviewNeedsComposite(currentSession.document, activePaintLayer(currentSession).id)) return false
    const drag = ports.inputRef.current.drag
    if ((drag && (drag.kind !== 'draw' || !ports.drawingBrushPreviewEnabled)) || !ports.inputRef.current.pointer.visible || ports.inputRef.current.sampling || ports.inputRef.current.spaceHeld)
      return false
    const inputs = activeBrushInputsForTool(currentSession.tool, currentSession.fillKind ?? 'bucket', currentSession.brushImage, currentSession.brushTexture)
    return (
      !inputs.imageBrush &&
      inputs.texture === 'solid' &&
      !(currentSession.brushDither ?? DEFAULT_BRUSH_DITHER_SETTINGS).enabled &&
      !currentSession.selection &&
      (ports.liveViewRef.current.tileRepeatMode ?? 'off') === 'off' &&
      !ports.liveViewRef.current.mirrored && !ports.liveViewRef.current.mirroredVertical &&
      Math.abs(ports.liveViewRef.current.rotation) < 0.000001
    )
  }

  const drawBrushPreviewOverlay = (): void => {
    const overlay = brushPreviewCanvasRef.current
    if (!overlay) return
    const storedSession = useWorkspace.getState().sessions.find((item) => item.document.id === ports.session.document.id) ?? ports.session
    const state = useWorkspace.getState()
    const active = state.sessions.find(item => item.document.id === state.activeId)
    const shared = active && active !== storedSession ? shareCanvasToolSettings(storedSession, active) : storedSession
    const currentSession = canvasBrushSizePreviewSession(ports.inputRef.current, shared)
    const rect = ports.stageSize()
    const displaySize = ports.stageDisplaySize()
    const dpr = canvasBackingRatioForInterfaceScale(window.devicePixelRatio || 1, ports.interfaceScale)
    const deviceScale = syncCanvasDisplaySize(overlay, rect.width, rect.height, dpr, displaySize.width, displaySize.height, isWorkspaceResizing())
    const context = overlay.getContext('2d')
    if (!context) return
    context.setTransform(deviceScale.x, 0, 0, deviceScale.y, 0, 0)
    damageRef.current.clear(context, overlay)
    if (!brushPreviewOverlaySupported(currentSession)) return
    const pointerLocation = ports.repeatedDocumentPointsAt(ports.inputRef.current.pointer.clientX, ports.inputRef.current.pointer.clientY)
    const point = pointerLocation?.local ?? ports.inputRef.current.pointer.point
    if (!point) return
    const view = ports.liveViewRef.current
    const renderPlan = createCanvasRenderPlan(rect.width, rect.height, currentSession.document, view, ports.rotationIndicatorPosition, deviceScale)
    const selectionBrush = currentSession.tool === 'selection' && currentSession.selectionKind === 'brush'
    if (currentSession.tool === 'smooth' || selectionBrush) {
      const layer = activePaintLayer(currentSession)
      if (!selectionBrush && (layer.kind || currentSession.activeLayerMaskId || isLayerEffectivelyLocked(currentSession.document, layer))) return
      context.save()
      ports.applyViewRotation(context, rect.width, rect.height, view)
      context.fillStyle = selectionBrush ? 'rgba(41, 121, 255, 0.35)' : SMOOTH_BRUSH_OVERLAY
      const covered = new Set(selectionBrush ? ports.inputRef.current.drag?.selectionBrushStroke?.visited : ports.inputRef.current.drag?.smoothStroke?.visited)
      const outsidePreview = selectionBrush ? new Map(ports.inputRef.current.drag?.selectionBrushStroke?.outsidePreview) : undefined
      collectSmoothBrushArea(currentSession.document, { visited: covered, outsidePreview }, point, point,
        currentSession.brushSize, selectionBrush ? null : currentSession.selection,
        currentSession.brushShape, brushAngleWithDynamics(currentSession), ports.optimizedRotationEnabled,
        selectionBrush ? (view.tileRepeatMode ?? 'off') : 'off')
      drawBrushCoverageOverlay(context, covered, currentSession.document.width, currentSession.document.height,
        selectionBrush ? (view.tileRepeatMode ?? 'off') : 'off', renderPlan.originX, renderPlan.originY, view.zoom, deviceScale, outsidePreview?.values())
      context.restore()
      return
    }
    if (currentSession.tool === 'liquify') {
      // The preview is drawn on a separate overlay surface. Apply the same
      // view transform as the document surface so mirrored and rotated views
      // keep the brush region under the pointer.
      context.save()
      ports.applyViewRotation(context, rect.width, rect.height, view)
      const previewSize = Math.max(3, Math.round(currentSession.liquifyRadius) * 2 + 1)
      const anchor = brushStampAnchor(previewSize, null, 0, 'round')
      const brushPoint = ports.snapBrushPointToGrid(point, previewSize, null, 0, currentSession)
      const rows = solidBrushPreviewRowSpans(previewSize, 'round', 0, ports.optimizedRotationEnabled).map((span) => ({
        y: brushPoint.y - anchor.y + span.y,
        left: brushPoint.x - anchor.x + span.left,
        right: brushPoint.x - anchor.x + span.right
      }))
      context.lineWidth = ports.brushEdgeThickness ?? 1
      alignCanvasStrokePath(context)
      context.beginPath()
      const horizontalSegment = (left: number, right: number, y: number, bottom: boolean): void => {
        if (right < left || y < 0 || y >= currentSession.document.height) return
        const first = deviceAlignedPixelRect(renderPlan.originX, renderPlan.originY, view.zoom, Math.max(0, left), y, deviceScale)
        const last = deviceAlignedPixelRect(
          renderPlan.originX,
          renderPlan.originY,
          view.zoom,
          Math.min(currentSession.document.width - 1, right),
          y,
          deviceScale
        )
        if (last.x < first.x) return
        const edgeY = bottom ? first.y + first.height : first.y
        context.moveTo(first.x, edgeY)
        context.lineTo(last.x + last.width, edgeY)
      }
      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index]
        if (row.y < 0 || row.y >= currentSession.document.height) continue
        const left = Math.max(0, row.left)
        const right = Math.min(currentSession.document.width - 1, row.right)
        if (right < left) continue
        const first = deviceAlignedPixelRect(renderPlan.originX, renderPlan.originY, view.zoom, left, row.y, deviceScale)
        const last = deviceAlignedPixelRect(renderPlan.originX, renderPlan.originY, view.zoom, right, row.y, deviceScale)
        context.moveTo(first.x, first.y)
        context.lineTo(first.x, first.y + first.height)
        context.moveTo(last.x + last.width, last.y)
        context.lineTo(last.x + last.width, last.y + last.height)
        const previous = rows[index - 1]
        const next = rows[index + 1]
        if (!previous) horizontalSegment(row.left, row.right, row.y, false)
        else {
          if (previous.left > row.left) horizontalSegment(row.left, Math.min(row.right, previous.left - 1), row.y, false)
          if (previous.right < row.right) horizontalSegment(Math.max(row.left, previous.right + 1), row.right, row.y, false)
        }
        if (!next) horizontalSegment(row.left, row.right, row.y, true)
        else {
          if (next.left > row.left) horizontalSegment(row.left, Math.min(row.right, next.left - 1), row.y, true)
          if (next.right < row.right) horizontalSegment(Math.max(row.left, next.right + 1), row.right, row.y, true)
        }
      }
      context.strokeStyle = ports.brushEdgeColor
        ? `rgb(${ports.brushEdgeColor.r} ${ports.brushEdgeColor.g} ${ports.brushEdgeColor.b} / ${ports.brushEdgeColor.a / 255})`
        : canvasAdaptiveContrast(context, {
        x: renderPlan.originX + (brushPoint.x - anchor.x) * view.zoom - context.lineWidth,
        y: renderPlan.originY + (brushPoint.y - anchor.y) * view.zoom - context.lineWidth,
        width: previewSize * view.zoom + context.lineWidth * 2,
        height: previewSize * view.zoom + context.lineWidth * 2
      }, ports.canvasRef.current ?? undefined)
      context.stroke()
      context.restore()
      return
    }
    const drag = ports.inputRef.current.drag
    const drawing = drag?.kind === 'draw'
    const erasing = currentSession.tool === 'eraser'
    const showOutline = ports.brushPreviewMode === 'edge' || ports.brushPreviewMode === 'full-edge' || erasing
    if (drawing && !showOutline) return
    const size = drawing ? (drag.lastBrushSize ?? currentSession.brushSize) : currentSession.brushSize
    const previewAngle = drawing ? (drag.path?.at(-1)?.angle ?? brushBaseAngle(currentSession)) : brushBaseAngle(currentSession)
    const before = brushStampAnchor(size, null, previewAngle, currentSession.brushShape)
    const brushPoint = ports.snapBrushPointToGrid(point, size, null, previewAngle, currentSession)
    const spans = solidBrushPreviewRowSpans(size, currentSession.brushShape, previewAngle, ports.optimizedRotationEnabled)
    const color = resolveLayerCanvasColor(currentSession.document, activePaintLayer(currentSession), currentSession.primaryColor)
    const previewColor = { ...color, a: Math.round(color.a * brushOpacityScale(1, currentSession.brushOpacity)) }
    const outline = new CanvasAdaptiveOutline()
    const rows = spans.flatMap((span) => {
      const y = brushPoint.y - before.y + span.y
      const left = Math.max(0, brushPoint.x - before.x + span.left)
      const right = Math.min(currentSession.document.width - 1, brushPoint.x - before.x + span.right)
      return y >= 0 && y < currentSession.document.height && right >= left ? [{ y, left, right }] : []
    })
    context.fillStyle = `rgb(${previewColor.r} ${previewColor.g} ${previewColor.b} / ${previewColor.a / 255})`
    context.beginPath()
    for (const row of rows) {
      const first = deviceAlignedPixelRect(renderPlan.originX, renderPlan.originY, view.zoom, row.left, row.y, deviceScale)
      const last = deviceAlignedPixelRect(renderPlan.originX, renderPlan.originY, view.zoom, row.right, row.y, deviceScale)
      outline.include({ x: first.x, y: first.y, width: last.x + last.width - first.x, height: first.height })
      damageRef.current.include({ x: first.x, y: first.y, width: last.x + last.width - first.x, height: first.height }, deviceScale, (ports.brushEdgeThickness ?? 1) + 2)
      context.rect(first.x, first.y, last.x + last.width - first.x, first.height)
    }
    if (!drawing && !erasing && ports.brushPreviewMode !== 'edge') context.fill()
    if (!showOutline) return
    context.lineWidth = ports.brushEdgeThickness ?? 1
    alignCanvasStrokePath(context)
    context.beginPath()
    const horizontalSegment = (left: number, right: number, row: (typeof rows)[number], bottom: boolean): void => {
      if (right < left) return
      const first = deviceAlignedPixelRect(renderPlan.originX, renderPlan.originY, view.zoom, left, row.y, deviceScale)
      const last = deviceAlignedPixelRect(renderPlan.originX, renderPlan.originY, view.zoom, right, row.y, deviceScale)
      const edgeY = bottom ? first.y + first.height : first.y
      context.moveTo(first.x, edgeY)
      context.lineTo(last.x + last.width, edgeY)
    }
    const exposedHorizontal = (row: (typeof rows)[number], neighbor: (typeof rows)[number] | null, bottom: boolean): void => {
      if (!neighbor || neighbor.y !== row.y + (bottom ? 1 : -1)) {
        horizontalSegment(row.left, row.right, row, bottom)
        return
      }
      if (neighbor.left > row.left) horizontalSegment(row.left, Math.min(row.right, neighbor.left - 1), row, bottom)
      if (neighbor.right < row.right) horizontalSegment(Math.max(row.left, neighbor.right + 1), row.right, row, bottom)
    }
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index]
      const first = deviceAlignedPixelRect(renderPlan.originX, renderPlan.originY, view.zoom, row.left, row.y, deviceScale)
      const last = deviceAlignedPixelRect(renderPlan.originX, renderPlan.originY, view.zoom, row.right, row.y, deviceScale)
      context.moveTo(first.x, first.y)
      context.lineTo(first.x, first.y + first.height)
      context.moveTo(last.x + last.width, last.y)
      context.lineTo(last.x + last.width, last.y + last.height)
      exposedHorizontal(row, index > 0 ? rows[index - 1] : null, false)
      exposedHorizontal(row, index + 1 < rows.length ? rows[index + 1] : null, true)
    }
    outline.stroke(context, ports.canvasRef.current ?? undefined, ports.brushEdgeColor)
  }

  const scheduleBrushPreviewOverlay = (): void => {
    if (brushPreviewRequestRef.current !== null) return
    brushPreviewRequestRef.current = window.requestAnimationFrame(() => {
      brushPreviewRequestRef.current = null
      brushPreviewDrawRef.current()
    })
  }

  brushPreviewDrawRef.current = drawBrushPreviewOverlay

  // A non-active pane does not receive a React prop change when the active
  // session mutates its brush size in place. Redraw it while the pointer is
  // over that pane so the shared brush preview stays live without a click.
  useEffect(() => {
    // Selection can invalidate the tool without changing activeLayerId or tool.
    // Clear the dedicated overlay even when the main canvas does not redraw it.
    scheduleBrushPreviewOverlay()
  }, [previewToolAvailable])

  useEffect(() => {
    if (ports.inputRef.current.modifierBrushSize && brushPreviewOverlaySupported(ports.session)) scheduleBrushPreviewOverlay()
    else ports.scheduleDraw()
  }, [
    ports.activeToolBrushSize,
    ports.session.document.id,
    ports.session.document.activeLayerId,
    ports.session.brushShape,
    ports.session.brushAngle,
    ports.session.brushTexture,
    ports.session.brushTextureScale,
    ports.session.brushImage?.id,
    ports.session.brushPaintMode,
    ports.session.tool,
    ports.session.liquifyRadius,
    ports.brushPreviewMode
  ])
  useEffect(
    () => () => {
      if (brushPreviewRequestRef.current !== null) window.cancelAnimationFrame(brushPreviewRequestRef.current)
      brushPreviewRequestRef.current = null
    },
    [ports.session.document.id]
  )
  return {
    brushPreviewCanvasRef,
    brushPreviewDrawRef,
    brushPreviewCompositeCacheRef,
    brushPreviewStackCacheRef,
    brushPreviewOverlaySupported,
    scheduleBrushPreviewOverlay
  }
}
