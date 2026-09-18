import { createGradientPreviewDiagnostics, GRADIENT_PREVIEW_DIAGNOSTIC_VERSION } from '../core/gradient-preview-diagnostics'
import { recordRuntimeDiagnostic, runtimeDiagnosticsActive } from '../core/runtime-diagnostics'
import { createRuntimeLatencyReporter } from '@/core/runtime-diagnostic-stages'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { canvasStageIsVisible } from './canvas-stage-visibility'
import type { RgbaColor } from '@shared/types-color'
import type { SelectionMask, SelectionRect } from '@shared/types-selection'
import {
  createCompositePointReplacementSampler,
  createCompositePointSampler,
  createNormalCompositePointReplacementSampler,
  createNormalCompositePointSampler
} from '@/core/document-composite'
import { brushStrokeInvalidationRects } from '@/core/tools-brush'
import { type OutlinePixelSample } from '@/core/tools-outline'
import { useWorkspace, type DocumentSession } from '@/store/workspace'
import { activeLayerMask, activePaintLayer } from '@/store/workspace-session'
import { CanvasInputState, type CanvasDragState as DragState, type CanvasPoint as Point } from '@/core/canvas-input'
import {
  notifyAnimationCelThumbnailPreview,
  notifyCanvasPreview,
  notifyLayerMaskThumbnailPreview,
  type CanvasPreviewSnapshot
} from '@/core/canvas-preview-lifecycle'
import { canvasCompositeCacheFor, releaseCanvasCompositeCache } from '@/components/canvas-composite-cache'
import { OnionSkinCompositeCache } from '@/components/onion-skin-composite-cache'
import { animationFrameIdsForCellKeys } from '@/components/canvas-move-selection'
import { type SelectionBoundaryCache } from '@/components/canvas-selection-renderer'
import { resolveAnimationCel } from '@/core/animation'
import { clearTilesetTilePreview } from '@/components/tileset-preview-events'
import { releaseInitialDocumentComposite } from '@/core/initial-document-composite'
import { GradientPreviewSurface, GradientCompositePreviewCache, GradientPreviewCoverageCache, nonContentPreviewDragKinds } from './canvas-stage-helpers'
interface Ports {
  readonly storedSession: DocumentSession
  readonly session: DocumentSession
  readonly activeBrushImage: import('@shared/types-brush').ImageBrush | null
  readonly symmetryCenter: import('@/core/symmetry').SymmetryCenter
  readonly inputRef: import('react').RefObject<CanvasInputState>
  readonly canvasRef: import('react').RefObject<HTMLCanvasElement | null>
  readonly drawRef: import('react').RefObject<() => void>
  readonly requestDrawRef: import('react').RefObject<() => void>
  readonly canvasResizePreviewRef: import('react').RefObject<import('@/store/workspace').CanvasResizePreview | null>
  readonly pendingCanvasResizeRef: import('react').RefObject<import('@/store/workspace').CanvasResizePreview | null>
  readonly canvasResizeFrameRef: import('react').RefObject<number | null>
  readonly selectionBoundaryCacheRef: import('react').RefObject<SelectionBoundaryCache | null>
  readonly localPointAt: (clientX: number, clientY: number, allowOutsideCopies?: boolean) => Point | null
  readonly updateCursorAt: (clientX: number, clientY: number, ctrlKey: boolean, altKey: boolean, shiftKey?: boolean) => void
  readonly interfaceScale: import('@/core/file-preferences').UiScale
  readonly activeBrushDither: import('@shared/types-brush').BrushDitherSettings | undefined
  readonly fillKind: import('@shared/types-brush').FillKind
  readonly gradientDither: import('@shared/types-brush').GradientDither
  readonly drawingBrushPreviewEnabled: boolean
  readonly brushPreviewMode: import('@/core/file-preferences').BrushPreviewMode
  readonly checkerboard: import('@/core/file-preferences').CheckerboardPreferences
  readonly gridColors: {
    pixelGridColor: RgbaColor
    gridColor: RgbaColor
  }
  readonly alignmentPreferences: {
    gridAlignmentEnabled: boolean
    smartAlignmentEnabled: boolean
    alignmentGuidesVisible: boolean
    alignmentThreshold: number
  }
  readonly sliceColor: RgbaColor
  readonly textBoxColor: RgbaColor
  readonly canvasResizeColor: RgbaColor
  readonly sliceOutlinesVisible: boolean
  readonly shiftLinePreviewEnabled: boolean
  readonly gradientLineVisible: boolean
  readonly gradientLineColor: RgbaColor
  readonly lassoPreviewClosed: boolean
  readonly selectionCrosshair: boolean
  readonly selectionPreviewColorMode: import('@/core/file-preferences').SelectionPreviewColorMode
  readonly selectionPreviewColor: RgbaColor
  readonly selectionSizeVisible: boolean
  readonly balancedShiftLineEnabled: boolean
  readonly lineDirectionStep: number
  readonly lineConnectionShortcut: string
  readonly rotationIndicatorPosition: import('@/core/file-preferences').RotationIndicatorPosition
  readonly onionSkin: import('@/core/file-preferences').OnionSkinPreferences
  readonly timelineHidden: boolean
  readonly symmetryAxisPreferences: import('@/core/file-preferences').SymmetryAxisPreferences
  readonly isoViewPreferences: import('@/core/file-preferences').IsoViewPreferences
  readonly optimizedRotationEnabled: boolean
}

export function useCanvasRenderEngine(ports: Ports) {
  const publishedTilesetPreviewRef = useRef<string | null>(null)

  const rotationSceneRef = useRef<OffscreenCanvas | null>(null)

  const checkerboardTileRef = useRef<{ key: string; canvas: OffscreenCanvas } | null>(null)

  const isoGuideTileRef = useRef<{ key: string; canvas: OffscreenCanvas } | null>(null)

  const gradientPreviewSurfaceRef = useRef<GradientPreviewSurface | null>(null)

  const gradientPreviewInputAtRef = useRef(0)

  const gradientPreviewDiagnosticsRef = useRef<ReturnType<typeof createGradientPreviewDiagnostics> | null>(null)

  useEffect(() => {
    if (!import.meta.env.DEV) return
    const collector = createGradientPreviewDiagnostics((detail) => recordRuntimeDiagnostic('operation-stage', 'gradient.preview.summary', detail))
    gradientPreviewDiagnosticsRef.current = collector
    recordRuntimeDiagnostic('session', 'gradient.preview.ready', { version: GRADIENT_PREVIEW_DIAGNOSTIC_VERSION })
    return () => {
      collector.flush()
      gradientPreviewDiagnosticsRef.current = null
    }
  }, [])

  const gradientCompositePreviewCacheRef = useRef<GradientCompositePreviewCache | null>(null)

  const gradientPreviewCoverageCacheRef = useRef<GradientPreviewCoverageCache | null>(null)

  const compositeReplacementSamplerRef = useRef<{
    document: DocumentSession['document']
    revision: number
    layerId: string
    sampler: (x: number, y: number, replacement: RgbaColor) => RgbaColor
  } | null>(null)

  const drawRequestRef = useRef<number | null>(null)

  const compositeCacheRef = useRef(canvasCompositeCacheFor(ports.storedSession.document))

  const compositeCacheDocumentRef = useRef(ports.storedSession.document)

  if (compositeCacheDocumentRef.current !== ports.storedSession.document) {
    compositeCacheDocumentRef.current = ports.storedSession.document
    compositeCacheRef.current = canvasCompositeCacheFor(ports.storedSession.document)
  }

  const compositePointSamplerRef = useRef<{ document: DocumentSession['document']; revision: number; sampler: (x: number, y: number) => RgbaColor } | null>(
    null
  )

  const cursorCompositePointSamplerRef = useRef<{
    document: DocumentSession['document']
    revision: number
    activeLayerId: string
    backgroundLayersKey: string
    sampler: (x: number, y: number) => RgbaColor
  } | null>(null)

  const cursorCompositePointReplacementSamplerRef = useRef<{
    document: DocumentSession['document']
    revision: number
    layerId: string
    sampler: (x: number, y: number, replacement: RgbaColor) => RgbaColor
  } | null>(null)

  const renderDocumentSizeRef = useRef({ width: ports.session.document.width, height: ports.session.document.height })

  const onionSkinCacheRef = useRef(new OnionSkinCompositeCache())

  const outlinePreviewCacheRef = useRef<{
    revision: number
    layerId: string
    selection: SelectionMask | null
    preview: NonNullable<DocumentSession['outlinePreview']>
    samples: OutlinePixelSample[]
  } | null>(null)

  const publishedCanvasPreviewRef = useRef<CanvasPreviewSnapshot | null>(null)

  useEffect(
    () => () => {
      if (publishedCanvasPreviewRef.current === null) return
      publishedCanvasPreviewRef.current = null
      notifyCanvasPreview(ports.session.document.id, null)
    },
    [ports.session.document.id]
  )

  const invalidateCompositeRect = (selection: SelectionRect | null | undefined, layerIds?: readonly string[]): void => {
    const paintTarget = activePaintLayer(ports.session)
    compositeCacheRef.current.invalidateDocumentRect(
      selection,
      ports.session.document,
      ports.session.document.animation?.activeFrameId,
      layerIds?.length ? layerIds : [paintTarget.id]
    )
  }

  const invalidateStrokeSegment = (from: Point, to: Point, size = ports.session.brushSize, angle = 0): void => {
    for (const rect of brushStrokeInvalidationRects(
      from,
      to,
      size,
      ports.activeBrushImage,
      ports.session.document.width,
      ports.session.document.height,
      ports.session.symmetryAxes,
      ports.symmetryCenter,
      ports.session.view.tileRepeatMode ?? 'off',
      angle
    ))
      invalidateCompositeRect(rect)
  }

  const invalidateOnionSkinDragFrames = (drag: DragState): void => {
    const frameIds = [
      ...ports.session.selectedAnimationFrameIds,
      ...(drag.selectionLayers ?? []).flatMap((layer) => (layer.frameId ? [layer.frameId] : [])),
      ...animationFrameIdsForCellKeys(drag.animationCellKeys ?? [])
    ]
    onionSkinCacheRef.current.invalidateFrames(frameIds)
  }

  const frameWaitRef = useRef<ReturnType<typeof createRuntimeLatencyReporter> | null>(null)
  frameWaitRef.current ??= createRuntimeLatencyReporter('canvas.frame.wait')
  useEffect(() => () => frameWaitRef.current?.flush(), [])

  const scheduleDraw = (): void => {
    if (!canvasStageIsVisible(ports.canvasRef.current, useWorkspace.getState().activeId)) return
    if (drawRequestRef.current !== null) return
    const queuedAt = runtimeDiagnosticsActive() ? performance.now() : null
    drawRequestRef.current = window.requestAnimationFrame(() => {
      drawRequestRef.current = null
      // The tab may have been hidden after this frame was queued. Skip both
      // the expensive draw and its auxiliary thumbnail notifications.
      if (!canvasStageIsVisible(ports.canvasRef.current, useWorkspace.getState().activeId)) return
      frameWaitRef.current?.record(queuedAt, () => ({ documentId: ports.session.document.id }))
      // Auxiliary thumbnails follow the canvas RAF. Emitting this from every
      // pointer event makes a long stroke enqueue redundant thumbnail renders.
      const currentSession = useWorkspace.getState().sessions.find((item) => item.document.id === ports.session.document.id) ?? ports.session
      const currentMask = activeLayerMask(currentSession)
      const activeDrag = ports.inputRef.current.drag
      if (activeDrag && !nonContentPreviewDragKinds.has(activeDrag.kind)) {
        if (currentMask) notifyLayerMaskThumbnailPreview(ports.session.document.id, currentMask.id)
        else {
          const timeline = currentSession.document.animation
          const activeCel = timeline
            ? resolveAnimationCel(
                timeline,
                timeline.cels.find((item) => item.layerId === currentSession.document.activeLayerId && item.frameId === timeline.activeFrameId) ?? null
              )
            : null
          if (activeCel) notifyAnimationCelThumbnailPreview(ports.session.document.id, activeCel.id, currentSession.document.activeLayerId)
        }
      }
      ports.drawRef.current()
    })
  }

  ports.requestDrawRef.current = scheduleDraw

  useEffect(() => useWorkspace.subscribe((state, previous) => {
    if (state.activeId !== previous.activeId && state.activeId === ports.session.document.id) scheduleDraw()
    // Hidden changes retain their normal invalidations. Paint the latest
    // content once on activation, including updates that happened offscreen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [ports.session.document.id])

  useEffect(
    () => () => {
      const tilesetId = publishedTilesetPreviewRef.current
      if (!tilesetId) return
      publishedTilesetPreviewRef.current = null
      clearTilesetTilePreview(ports.session.document.id, tilesetId)
    },
    [ports.session.document.id]
  )

  useLayoutEffect(() => {
    const previousSize = renderDocumentSizeRef.current
    const documentSizeChanged = previousSize.width !== ports.session.document.width || previousSize.height !== ports.session.document.height
    if (documentSizeChanged) {
      renderDocumentSizeRef.current = { width: ports.session.document.width, height: ports.session.document.height }
      compositeCacheRef.current.invalidateAll()
      onionSkinCacheRef.current.invalidateAll()
      ports.canvasResizePreviewRef.current = null
      ports.pendingCanvasResizeRef.current = null
      if (ports.canvasResizeFrameRef.current !== null) {
        window.cancelAnimationFrame(ports.canvasResizeFrameRef.current)
        ports.canvasResizeFrameRef.current = null
      }
      ports.selectionBoundaryCacheRef.current = null
      ports.inputRef.current.shiftLinePreview = false
      ports.inputRef.current.sampling = false
    }
    const pointer = ports.inputRef.current.pointer
    if (pointer.visible) {
      const point = ports.localPointAt(pointer.clientX, pointer.clientY)
      if (point)
        ports.inputRef.current.updatePointer({
          point,
          clientX: pointer.clientX,
          clientY: pointer.clientY,
          ctrlKey: ports.inputRef.current.ctrlHeld,
          altKey: ports.inputRef.current.altHeld
        })
      ports.updateCursorAt(pointer.clientX, pointer.clientY, ports.inputRef.current.ctrlHeld, ports.inputRef.current.altHeld, ports.inputRef.current.shiftHeld)
    }
    scheduleDraw()
    // View rotation is rendered inside the canvas rather than by rotating the viewport element.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    ports.interfaceScale,
    ports.session.document.width,
    ports.session.document.height,
    ports.session.view.rotation,
    ports.session.view.mirrored,
    ports.session.view.mirroredVertical,
    ports.session.view.panX,
    ports.session.view.panY,
    ports.session.view.zoom
  ])

  useLayoutEffect(() => {
    scheduleDraw()
    // Layer selection changes do not increment the document revision, but they
    // do change whether an editable text box belongs in the overlay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ports.session.selectedLayerIds.join('\0'), ports.session.selectedGroupIds.join('\0')])

  useEffect(() => {
    // Every dependency in this effect contributes to the canvas appearance.
    // Do not short-circuit on contentRevision: view-only commands (grid,
    // mirror, luminance, tile repeat, etc.) intentionally leave the content
    // revision unchanged but still require a full canvas redraw. Pointer
    // movement must never be the first event that makes those changes visible.
    scheduleDraw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    ports.session.document.id,
    ports.session.revision,
    ports.session.contentRevision,
    ports.session.activeLayerMaskId,
    ports.session.layerMaskIsolatedView,
    ports.session.selectedTilesetId,
    ports.session.selectedTileId,
    ports.session.secondaryTileId,
    ports.session.tilemapMode,
    ports.session.freeTileMode,
    ports.session.view.tileRepeatMode,
    ports.session.view.showPixelGrid,
    ports.session.view.showGrid,
    ports.session.view.isoViewEnabled,
    ports.session.view.grid?.x,
    ports.session.view.grid?.y,
    ports.session.view.grid?.width,
    ports.session.view.grid?.height,
    ports.session.view.relativeLuminance,
    ports.session.view.mirrored,
    ports.session.view.mirroredVertical,
    ports.session.view.showSelectionOutline,
    ports.session.view.showSelectionPivot,
    ports.session.selection,
    ports.session.freeTransformActive,
    ports.session.freeTransformQuad?.nw.x,
    ports.session.freeTransformQuad?.nw.y,
    ports.session.freeTransformQuad?.ne.x,
    ports.session.freeTransformQuad?.ne.y,
    ports.session.freeTransformQuad?.se.x,
    ports.session.freeTransformQuad?.se.y,
    ports.session.freeTransformQuad?.sw.x,
    ports.session.freeTransformQuad?.sw.y,
    ports.session.pendingPaste?.transformQuad?.nw.x,
    ports.session.pendingPaste?.transformQuad?.nw.y,
    ports.session.pendingPaste?.transformQuad?.ne.x,
    ports.session.pendingPaste?.transformQuad?.ne.y,
    ports.session.pendingPaste?.transformQuad?.se.x,
    ports.session.pendingPaste?.transformQuad?.se.y,
    ports.session.pendingPaste?.transformQuad?.sw.x,
    ports.session.pendingPaste?.transformQuad?.sw.y,
    ports.session.selectionPivot?.x,
    ports.session.selectionPivot?.y,
    ports.session.outlinePreview,
    ports.session.brushSize,
    ports.session.brushShape,
    ports.session.brushAngle,
    ports.activeBrushDither?.enabled,
    ports.activeBrushDither?.template,
    ports.activeBrushDither?.stage,
    ports.session.shapeKind,
    ports.session.shapeRatio,
    ports.session.fillMode,
    ports.fillKind,
    ports.gradientDither,
    ports.session.symmetryAxes.horizontal,
    ports.session.symmetryAxes.vertical,
    ports.session.symmetryAxes.diagonalUp,
    ports.session.symmetryAxes.diagonalDown,
    ports.session.symmetryAxes.rotational,
    ports.symmetryCenter.x,
    ports.symmetryCenter.y,
    ports.drawingBrushPreviewEnabled,
    ports.brushPreviewMode,
    ports.checkerboard,
    ports.gridColors,
    ports.alignmentPreferences.gridAlignmentEnabled,
    ports.alignmentPreferences.smartAlignmentEnabled,
    ports.alignmentPreferences.alignmentGuidesVisible,
    ports.alignmentPreferences.alignmentThreshold,
    ports.sliceColor,
    ports.textBoxColor,
    ports.canvasResizeColor,
    ports.sliceOutlinesVisible,
    ports.shiftLinePreviewEnabled,
    ports.gradientLineVisible,
    ports.gradientLineColor,
    ports.lassoPreviewClosed,
    ports.selectionCrosshair,
    ports.selectionPreviewColorMode,
    ports.selectionPreviewColor,
    ports.selectionSizeVisible,
    ports.balancedShiftLineEnabled,
    ports.lineDirectionStep,
    ports.lineConnectionShortcut,
    ports.rotationIndicatorPosition,
    ports.onionSkin,
    ports.timelineHidden,
    ports.symmetryAxisPreferences,
    ports.isoViewPreferences,
    ports.interfaceScale
  ])

  // Playback advances the active frame without changing contentRevision. Keep
  // this explicit boundary so frame navigation remains redraw-safe even when
  // the broader appearance dependency list is unchanged.
  useEffect(() => {
    scheduleDraw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ports.session.document.id, ports.session.document.animation?.activeFrameId])

  useEffect(() => {
    scheduleDraw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ports.optimizedRotationEnabled])

  useEffect(() => {
    scheduleDraw()
    // Free-tile instance selection is session state rather than document revision.
    // Redraw the overlay when it changes so the merged selection frame stays in sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    ports.session.document.id,
    ports.session.freeTileInstanceLayerId,
    ports.session.selectedFreeTileInstanceId,
    ports.session.selectedFreeTileInstanceIds.join('\\0')
  ])

  const cursorCompositePointSamplerFor = (currentSession: DocumentSession): ((x: number, y: number) => RgbaColor) => {
    const document = currentSession.document
    const activeLayerId = document.activeLayerId
    const backgroundLayersKey = document.layers
      .filter((layer) => Boolean(layer.background))
      .map((layer) => layer.id)
      .join('\0')
    const cached = cursorCompositePointSamplerRef.current
    if (
      cached &&
      cached.document === document &&
      cached.revision === currentSession.revision &&
      cached.activeLayerId === activeLayerId &&
      cached.backgroundLayersKey === backgroundLayersKey
    )
      return cached.sampler

    const hasBackground = backgroundLayersKey.length > 0
    const activeBackground = document.layers.some((layer) => layer.id === activeLayerId && Boolean(layer.background))
    // Keep sampleCompositeColor's background rule while compiling only once
    // for this document revision. The sampler still reads live pixel storage,
    // so an in-progress stroke does not need to rebuild the layer tree.
    const samplingDocument = activeBackground || !hasBackground ? document : { ...document, layers: document.layers.filter((layer) => !layer.background) }
    const sampler = createNormalCompositePointSampler(samplingDocument) ?? createCompositePointSampler(samplingDocument)
    cursorCompositePointSamplerRef.current = { document, revision: currentSession.revision, activeLayerId, backgroundLayersKey, sampler }
    return sampler
  }

  const cursorCompositePointReplacementSamplerFor = (
    currentSession: DocumentSession,
    layerId: string
  ): ((x: number, y: number, replacement: RgbaColor) => RgbaColor) => {
    const document = currentSession.document
    const cached = cursorCompositePointReplacementSamplerRef.current
    if (cached && cached.document === document && cached.revision === currentSession.revision && cached.layerId === layerId) return cached.sampler
    const sampler = createNormalCompositePointReplacementSampler(document, layerId) ?? createCompositePointReplacementSampler(document, layerId)
    cursorCompositePointReplacementSamplerRef.current = { document, revision: currentSession.revision, layerId, sampler }
    return sampler
  }
  useEffect(
    () => {
      const document = ports.storedSession.document
      return () => {
        if (drawRequestRef.current !== null) window.cancelAnimationFrame(drawRequestRef.current)
        drawRequestRef.current = null
        onionSkinCacheRef.current.invalidateAll()
        for (const canvas of [rotationSceneRef.current, checkerboardTileRef.current?.canvas, isoGuideTileRef.current?.canvas, gradientPreviewSurfaceRef.current?.canvas]) {
          if (!canvas) continue
          canvas.width = 1
          canvas.height = 1
        }
        rotationSceneRef.current = null
        checkerboardTileRef.current = null
        isoGuideTileRef.current = null
        gradientPreviewSurfaceRef.current = null
        gradientCompositePreviewCacheRef.current = null
        gradientPreviewCoverageCacheRef.current = null
        compositeReplacementSamplerRef.current = null
        compositePointSamplerRef.current = null
        cursorCompositePointSamplerRef.current = null
        cursorCompositePointReplacementSamplerRef.current = null
        if (!useWorkspace.getState().sessions.some((session) => session.document === document)) {
          releaseCanvasCompositeCache(document)
          releaseInitialDocumentComposite(document)
        }
      }
    },
    [ports.session.document.id]
  )
  return {
    publishedTilesetPreviewRef,
    rotationSceneRef,
    checkerboardTileRef,
    isoGuideTileRef,
    gradientPreviewSurfaceRef,
    gradientPreviewInputAtRef,
    gradientPreviewDiagnosticsRef,
    gradientCompositePreviewCacheRef,
    gradientPreviewCoverageCacheRef,
    compositeReplacementSamplerRef,
    compositeCacheRef,
    compositePointSamplerRef,
    onionSkinCacheRef,
    outlinePreviewCacheRef,
    publishedCanvasPreviewRef,
    invalidateCompositeRect,
    invalidateStrokeSegment,
    invalidateOnionSkinDragFrames,
    scheduleDraw,
    cursorCompositePointSamplerFor,
    cursorCompositePointReplacementSamplerFor
  }
}
