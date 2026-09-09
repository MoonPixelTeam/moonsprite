import { useEffect, useRef, useState } from 'react'
import { FloatingDockPreview, PanelResizeHandles, useFloatingPanel } from '@/components/floating-panel'
import { AnimationPlaybackMenu } from '@/components/AnimationPlaybackMenu'
import { PlaybackPixelIcon } from '@/components/PlaybackPixelIcon'
import { PixelUtilityIcon } from '@/components/PixelUtilityIcon'
import { CanvasCompositeCache } from '@/components/canvas-composite-cache'
import type { DockDragProps } from '@/components/workspace-panel-types'
import { cloneDocumentForAnimationFrame, ensureAnimationDocument, firstPlayableAnimationFrameId, nextAnimationFrameId } from '@/core/animation'
import { advanceAnimationLoopSectionPlayback, animationLoopSectionAtFrame, animationLoopSectionStartFrameId, resolveAnimationLoopSectionRange } from '@/core/animation-loop-sections'
import { anchoredPreviewPan, followPreviewPosition, pixelAlignedPreviewFitScale, previewCheckerCellSize } from '@/core/preview-geometry'
import { normalizeCanvasWheelDelta, steppedCanvasZoom, viewDragClientDelta } from '@/core/canvas-input'
import { loadEditorPreferences, type CheckerboardPreferences } from '@/core/file-preferences'
import { registerViewPreviewListener } from '@/core/view-preview-lifecycle'
import { registerCanvasPreviewListener, type CanvasPreviewSnapshot } from '@/core/canvas-preview-lifecycle'
import { useWorkspace, type AnimationPlaybackMode, type DocumentSession } from '@/store/workspace'
import { useI18n } from '@/components/I18nProvider'
import { resolveTheme } from '@/core/theme'
import { initialDocumentCompositePending, subscribeInitialDocumentComposite } from '@/core/initial-document-composite'
import { pixelSamplingMode } from '@/core/pixel-display'
import { deviceAlignedCanvasRect } from '@/core/canvas-render-plan'
import { clearCanvasBacking } from '@/components/canvas-display-size'
import { PREVIEW_ZOOM_SHORTCUT_EVENT, type PreviewZoomShortcutDetail } from '@/core/preview-zoom-shortcuts'

interface FollowViewportSnapshot {
  viewportSize: { width: number; height: number }
  view: Pick<DocumentSession['view'], 'zoom' | 'panX' | 'panY' | 'rotation' | 'mirrored' | 'mirroredVertical'>
}

const previewLoopSectionContainsFrame = (timeline: ReturnType<typeof ensureAnimationDocument>, section: Parameters<typeof resolveAnimationLoopSectionRange>[1], frameId: string): boolean => {
  const range = resolveAnimationLoopSectionRange(timeline, section)
  const frameIndex = timeline.frames.findIndex((frame) => frame.id === frameId)
  return Boolean(range && frameIndex >= range.startIndex && frameIndex <= range.endIndex)
}

const followViewportView = (view: DocumentSession['view']): FollowViewportSnapshot['view'] => ({
  zoom: view.zoom,
  panX: view.panX,
  panY: view.panY,
  rotation: view.rotation,
  mirrored: view.mirrored,
  mirroredVertical: view.mirroredVertical
})

const followViewportSnapshot = (session: DocumentSession): FollowViewportSnapshot => ({ viewportSize: { ...session.viewportSize }, view: followViewportView(session.view) })

const sameFollowViewportSnapshot = (left: FollowViewportSnapshot, right: FollowViewportSnapshot): boolean =>
  left.viewportSize.width === right.viewportSize.width
  && left.viewportSize.height === right.viewportSize.height
  && left.view.zoom === right.view.zoom
  && left.view.panX === right.view.panX
  && left.view.panY === right.view.panY
  && left.view.rotation === right.view.rotation
  && left.view.mirrored === right.view.mirrored
  && left.view.mirroredVertical === right.view.mirroredVertical

export function PreviewPanel({ session, onClose, docked = false, onDockDragStart, onPanelContextMenu, onFloatingDock, relativeLuminanceInPreview = true, relativeLuminanceOverride = null }: { session: DocumentSession; onClose: () => void; relativeLuminanceInPreview?: boolean; relativeLuminanceOverride?: boolean | null } & DockDragProps) {
  const { t } = useI18n()
  const defaultPosition = { x: Math.max(12, window.innerWidth - 310 - 250 - 16), y: Math.max(46, window.innerHeight - 27 - 260 - 16), width: 250, height: 260 }
  const floating = useFloatingPanel(docked ? null : defaultPosition, false, true, 'moonsprite.preview-panel.v1', true, onFloatingDock, docked)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // null keeps the artwork fitted until the first explicit zoom operation.
  // Once set, zoom is an absolute document-pixel scale: 1 === 100%.
  const [zoom, setZoom] = useState<number | null>(null)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [followViewport, setFollowViewport] = useState(false)
  const [panning, setPanning] = useState(false)
  const [checkerboard, setCheckerboard] = useState<CheckerboardPreferences>(() => loadEditorPreferences().checkerboard)
  const [canvasSurround, setCanvasSurround] = useState(() => resolveTheme(loadEditorPreferences().theme).definition.seeds.canvasSurround)
  const [rotationIndicatorPosition, setRotationIndicatorPosition] = useState(() => loadEditorPreferences().rotationIndicatorPosition)
  const [viewDragSensitivity, setViewDragSensitivity] = useState(() => loadEditorPreferences().viewDragSensitivity)
  const [timelineHidden, setTimelineHidden] = useState(() => loadEditorPreferences().timelineHidden)
  const [playbackMenu, setPlaybackMenu] = useState<{ x: number; y: number } | null>(null)
  const [initialCompositeReady, setInitialCompositeReady] = useState(() => !initialDocumentCompositePending(session.document))
  const timeline = session.document.animation ?? ensureAnimationDocument(session.document)
  const initialFrameId = timeline.activeFrameId
  const [previewFrameId, setPreviewFrameId] = useState(initialFrameId)
  const [previewStartFrameId, setPreviewStartFrameId] = useState<string | null>(null)
  const [previewPlaying, setPreviewPlaying] = useState(false)
  const [previewRate, setPreviewRate] = useState(1)
  const [previewPlaybackMode, setPreviewPlaybackMode] = useState<AnimationPlaybackMode>(timeline.loop ? 'all' : 'once')
  const [previewLoopSectionId, setPreviewLoopSectionId] = useState<string | null>(null)
  const [previewLoopIteration, setPreviewLoopIteration] = useState(0)
  const [previewTagCycleSectionId, setPreviewTagCycleSectionId] = useState<string | null>(null)
  const [previewReturnToStart, setPreviewReturnToStart] = useState(false)
  const panDrag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)
  const compositeCacheRef = useRef(new CanvasCompositeCache())
  const baseFitRef = useRef<{ documentId: string; width: number; height: number; viewportWidth: number; viewportHeight: number; devicePixelRatio: number; scale: number } | null>(null)
  const followSnapshotRef = useRef<FollowViewportSnapshot>(followViewportSnapshot(session))
  const drawRef = useRef<() => void>(() => {})
  const liveCanvasPreviewRef = useRef<CanvasPreviewSnapshot | null>(null)
  const followFrameRef = useRef<number | null>(null)
  const panFrameRef = useRef<number | null>(null)
  const liveCanvasPreviewFrameRef = useRef<number | null>(null)
  const compositeWorkFrameRef = useRef<number | null>(null)
  const pendingPanRef = useRef<{ x: number; y: number } | null>(null)
  const inheritedRelativeLuminance = session.view.relativeLuminance && relativeLuminanceInPreview
  const showRelativeLuminance = relativeLuminanceOverride ?? inheritedRelativeLuminance

  useEffect(() => {
    setInitialCompositeReady(!initialDocumentCompositePending(session.document))
    return subscribeInitialDocumentComposite(session.document, () => setInitialCompositeReady(true))
  }, [session.document])

  useEffect(() => {
    setZoom(null)
    setPan({ x: 0, y: 0 })
    baseFitRef.current = null
  }, [session.document.id])

  useEffect(() => {
    const handleZoomShortcut = (event: Event): void => {
      const panel = floating.ref.current
      const target = event.target
      if (!panel || !(target instanceof Node) || !panel.contains(target)) return
      const detail = (event as CustomEvent<PreviewZoomShortcutDetail>).detail
      if (!detail || !Number.isFinite(detail.zoom) || detail.zoom <= 0) return
      const canvas = canvasRef.current
      if (!canvas) return
      const bounds = canvas.getBoundingClientRect()
      if (bounds.width < 1 || bounds.height < 1) return
      const fitScale = pixelAlignedPreviewFitScale(Math.min(bounds.width / session.document.width, bounds.height / session.document.height), Math.max(1, window.devicePixelRatio || 1))
      const currentZoom = zoom ?? fitScale
      if (detail.zoom === currentZoom) return
      if (!followViewport) {
        setPan(anchoredPreviewPan({
          documentSize: { width: session.document.width, height: session.document.height },
          viewportSize: { width: bounds.width, height: bounds.height },
          pointer: detail.pointer
            ? { x: detail.pointer.x - bounds.left, y: detail.pointer.y - bounds.top }
            : { x: bounds.width / 2, y: bounds.height / 2 },
          pan,
          zoom: currentZoom,
          nextZoom: detail.zoom
        }))
      }
      setZoom(detail.zoom)
    }
    window.addEventListener(PREVIEW_ZOOM_SHORTCUT_EVENT, handleZoomShortcut)
    return () => window.removeEventListener(PREVIEW_ZOOM_SHORTCUT_EVENT, handleZoomShortcut)
  }, [floating.ref, followViewport, pan, session.document.height, session.document.id, session.document.width, zoom])

  useEffect(() => {
    const scheduleDraw = (): void => {
      if (liveCanvasPreviewFrameRef.current !== null) return
      liveCanvasPreviewFrameRef.current = window.requestAnimationFrame(() => {
        liveCanvasPreviewFrameRef.current = null
        drawRef.current()
      })
    }
    const unregister = registerCanvasPreviewListener(session.document.id, (snapshot) => {
      // The editor canvas already renders the live layer-move preview. A
      // second full-size composite in this auxiliary panel doubles the
      // synchronous blend work for every pointer event, so keep the panel at
      // its last committed image until the move ends.
      if (snapshot?.movingLayerIds?.length) return
      // The editor is the latency-sensitive surface during freehand painting.
      // Rebuilding the same full-size composite here for every pointer sample
      // competes with it on the UI thread; the committed revision redraw below
      // updates this panel once when the stroke ends.
      if (snapshot?.deferAuxiliaryDraw) return
      const previousSnapshot = liveCanvasPreviewRef.current
      // A null snapshot can mean either commit or cancellation. It carries no
      // commit revision, so discard the transient composite rather than
      // retaining pixels which may just have been rolled back.
      if (!snapshot && previousSnapshot) {
        compositeCacheRef.current.invalidateAll()
      }
      liveCanvasPreviewRef.current = snapshot
      if (snapshot?.invalidation?.kind === 'region') {
        compositeCacheRef.current.invalidateDocumentRect(snapshot.invalidation.rect, snapshot.document, snapshot.frameId)
      } else if (snapshot?.invalidation?.kind === 'full') compositeCacheRef.current.invalidateAll()
      scheduleDraw()
    })
    return () => {
      unregister()
      liveCanvasPreviewRef.current = null
      if (liveCanvasPreviewFrameRef.current !== null) {
        window.cancelAnimationFrame(liveCanvasPreviewFrameRef.current)
        liveCanvasPreviewFrameRef.current = null
      }
    }
  }, [session.document.id])

  useEffect(() => {
    if (!followViewport) return
    const scheduleDraw = (): void => {
      if (followFrameRef.current !== null) return
      followFrameRef.current = window.requestAnimationFrame(() => {
        followFrameRef.current = null
        drawRef.current()
      })
    }
    const updateSnapshot = (next: FollowViewportSnapshot): void => {
      if (sameFollowViewportSnapshot(followSnapshotRef.current, next)) return
      followSnapshotRef.current = next
      scheduleDraw()
    }
    const syncCommittedView = (): void => {
      const current = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id)
      if (!current) return
      updateSnapshot(followViewportSnapshot(current))
    }
    syncCommittedView()
    const unsubscribeWorkspace = useWorkspace.subscribe(syncCommittedView)
    const unregisterLiveView = registerViewPreviewListener(session.document.id, (view) => updateSnapshot({
      viewportSize: followSnapshotRef.current.viewportSize,
      view: followViewportView(view)
    }))
    return () => {
      unsubscribeWorkspace()
      unregisterLiveView()
      if (followFrameRef.current !== null) {
        window.cancelAnimationFrame(followFrameRef.current)
        followFrameRef.current = null
      }
    }
  }, [followViewport, session.document.id])

  useEffect(() => {
    if (!timeline.frames.some((frame) => frame.id === previewFrameId)) setPreviewFrameId(timeline.activeFrameId)
    if (previewPlaying && !timeline.frames.some((frame) => frame.id === previewStartFrameId)) setPreviewStartFrameId(previewFrameId)
  }, [session.document, previewFrameId, previewPlaying, previewStartFrameId, timeline])

  useEffect(() => {
    if (previewPlaying) return
    if (previewFrameId !== timeline.activeFrameId) setPreviewFrameId(timeline.activeFrameId)
  }, [previewFrameId, previewPlaying, timeline.activeFrameId])

  useEffect(() => {
    if (!previewPlaying) return
    const frame = timeline.frames.find((candidate) => candidate.id === previewFrameId)
    if (!frame) return
    const loopSection = previewLoopSectionId ? (timeline.loopSections ?? []).find((section) => section.id === previewLoopSectionId) ?? null : null
    if (previewLoopSectionId && !loopSection) {
      setPreviewPlaying(false)
      setPreviewLoopSectionId(null)
      setPreviewLoopIteration(0)
      return
    }
    const loopStep = loopSection
      ? advanceAnimationLoopSectionPlayback(timeline, loopSection, previewFrameId, previewLoopIteration)
      : null
    const loopAllFrames = previewPlaybackMode !== 'once'
    const nextFrameId = loopSection
      ? loopStep?.frameId ?? null
      : nextAnimationFrameId({ ...timeline, loop: loopAllFrames }, previewFrameId)
    const timer = window.setTimeout(() => {
      if (loopStep?.completed) {
        if (previewPlaybackMode === 'tag' && loopSection && loopSection.repeatCount !== null) {
          const continuationFrameId = nextAnimationFrameId({ ...timeline, loop: true }, loopSection.endFrameId)
          const cycleSection = previewTagCycleSectionId
            ? (timeline.loopSections ?? []).find((section) => section.id === previewTagCycleSectionId) ?? null
            : null
          if (cycleSection && continuationFrameId && previewLoopSectionContainsFrame(timeline, cycleSection, continuationFrameId)) {
            setPreviewLoopSectionId(cycleSection.id)
            setPreviewLoopIteration(0)
            setPreviewFrameId(animationLoopSectionStartFrameId(timeline, cycleSection) ?? continuationFrameId)
          } else if (cycleSection) {
            const continuationSection = continuationFrameId ? animationLoopSectionAtFrame(timeline, continuationFrameId) : null
            if (continuationSection && continuationSection.repeatCount !== null && continuationFrameId) {
              setPreviewLoopSectionId(continuationSection.id)
              setPreviewLoopIteration(0)
              setPreviewFrameId(animationLoopSectionStartFrameId(timeline, continuationSection) ?? continuationFrameId)
            } else {
              setPreviewLoopSectionId(null)
              setPreviewLoopIteration(0)
              if (continuationFrameId) setPreviewFrameId(continuationFrameId)
            }
          } else if (continuationFrameId) {
            const continuationSection = animationLoopSectionAtFrame(timeline, continuationFrameId)
            if (continuationSection) {
              setPreviewLoopSectionId(continuationSection.id)
              setPreviewLoopIteration(0)
              setPreviewFrameId(animationLoopSectionStartFrameId(timeline, continuationSection) ?? continuationFrameId)
            } else {
              setPreviewLoopSectionId(null)
              setPreviewLoopIteration(0)
              setPreviewFrameId(continuationFrameId)
            }
          } else {
            setPreviewLoopSectionId(null)
            setPreviewLoopIteration(0)
          }
          return
        }
        const returnFrameId = previewReturnToStart ? previewStartFrameId : previewFrameId
        setPreviewPlaying(false)
        setPreviewStartFrameId(null)
        setPreviewLoopSectionId(null)
        setPreviewLoopIteration(0)
        if (returnFrameId) setPreviewFrameId(returnFrameId)
        return
      }
      if (!nextFrameId || !loopSection && !loopAllFrames && nextFrameId === previewFrameId) {
        const returnFrameId = previewReturnToStart ? previewStartFrameId : previewFrameId
        setPreviewPlaying(false)
        setPreviewStartFrameId(null)
        if (returnFrameId) setPreviewFrameId(returnFrameId)
        return
      }
      if (loopStep) setPreviewLoopIteration(loopStep.completedIterations)
      if (previewPlaybackMode === 'tag' && nextFrameId && !loopSection) {
        if (previewTagCycleSectionId) {
          const cycleSection = (timeline.loopSections ?? []).find((section) => section.id === previewTagCycleSectionId) ?? null
          if (cycleSection && previewLoopSectionContainsFrame(timeline, cycleSection, nextFrameId)) {
            setPreviewLoopSectionId(cycleSection.id)
            setPreviewLoopIteration(0)
            setPreviewFrameId(animationLoopSectionStartFrameId(timeline, cycleSection) ?? nextFrameId)
            return
          }
          const nextSection = animationLoopSectionAtFrame(timeline, nextFrameId)
          if (nextSection && nextSection.repeatCount !== null) {
            setPreviewLoopSectionId(nextSection.id)
            setPreviewLoopIteration(0)
            setPreviewFrameId(animationLoopSectionStartFrameId(timeline, nextSection) ?? nextFrameId)
            return
          }
          setPreviewLoopSectionId(null)
          setPreviewLoopIteration(0)
        }
        const nextSection = animationLoopSectionAtFrame(timeline, nextFrameId)
        if (nextSection && !previewTagCycleSectionId) {
          setPreviewLoopSectionId(nextSection.id)
          setPreviewLoopIteration(0)
          setPreviewFrameId(animationLoopSectionStartFrameId(timeline, nextSection) ?? nextFrameId)
          return
        }
      }
      setPreviewFrameId(nextFrameId)
    }, frame.duration / Math.max(0.01, previewRate))
    return () => window.clearTimeout(timer)
  }, [previewFrameId, previewPlaying, previewRate, previewPlaybackMode, previewLoopIteration, previewLoopSectionId, previewReturnToStart, previewStartFrameId, previewTagCycleSectionId, timeline])

  const setPreviewPlayingState = (playing: boolean): void => {
    if (playing) {
      const startFrameId = previewFrameId
      const firstPlayableFrameId = firstPlayableAnimationFrameId(timeline)
      if (!firstPlayableFrameId) {
        setPreviewPlaying(false)
        return
      }
      setPreviewStartFrameId(startFrameId)
      setPreviewLoopSectionId(null)
      setPreviewLoopIteration(0)
      setPreviewTagCycleSectionId(null)
      const loopSection = previewPlaybackMode === 'tag' ? animationLoopSectionAtFrame(timeline, startFrameId) : null
      const targetFrameId = loopSection
        ? animationLoopSectionStartFrameId(timeline, loopSection)
        : previewPlaybackMode === 'once'
          ? firstPlayableFrameId
          : timeline.frames.find((frame) => frame.id === startFrameId)?.disabled === true
            ? nextAnimationFrameId({ ...timeline, loop: true }, startFrameId)
            : startFrameId
      if (!targetFrameId) {
        setPreviewPlaying(false)
        return
      }
      if (loopSection) {
        setPreviewLoopSectionId(loopSection.id)
        if (previewPlaybackMode === 'tag' && loopSection.repeatCount !== null) setPreviewTagCycleSectionId(loopSection.id)
      }
      if (targetFrameId && targetFrameId !== startFrameId) setPreviewFrameId(targetFrameId)
    } else {
      if (previewReturnToStart && previewStartFrameId) setPreviewFrameId(previewStartFrameId)
      setPreviewStartFrameId(null)
      setPreviewLoopSectionId(null)
      setPreviewLoopIteration(0)
      setPreviewTagCycleSectionId(null)
    }
    setPreviewPlaying(playing)
  }

  const setPreviewPlaybackModeState = (mode: AnimationPlaybackMode): void => {
    setPreviewPlaybackMode(mode)
    setPreviewLoopSectionId(null)
    setPreviewLoopIteration(0)
    setPreviewTagCycleSectionId(null)
    if (!previewPlaying || mode !== 'tag') return
    const loopSection = animationLoopSectionAtFrame(timeline, previewFrameId)
    const firstFrameId = loopSection ? animationLoopSectionStartFrameId(timeline, loopSection) : null
    if (!loopSection || !firstFrameId) {
      setPreviewPlaying(false)
      return
    }
    setPreviewLoopSectionId(loopSection.id)
    if (loopSection.repeatCount !== null) setPreviewTagCycleSectionId(loopSection.id)
    if (firstFrameId !== previewFrameId) setPreviewFrameId(firstFrameId)
  }

  const previewPlayback = {
    playing: previewPlaying,
    rate: previewRate,
    mode: previewPlaybackMode,
    returnToStart: previewReturnToStart,
    setPlaying: setPreviewPlayingState,
    setRate: setPreviewRate,
    setMode: setPreviewPlaybackModeState,
    setReturnToStart: setPreviewReturnToStart
  }

  useEffect(() => {
    const syncPreferences = (): void => {
      const preferences = loadEditorPreferences()
      setCheckerboard(preferences.checkerboard)
      setCanvasSurround(resolveTheme(preferences.theme).definition.seeds.canvasSurround)
      setRotationIndicatorPosition(preferences.rotationIndicatorPosition)
      setViewDragSensitivity(preferences.viewDragSensitivity)
      setTimelineHidden(preferences.timelineHidden)
    }
    window.addEventListener('moonsprite:preferences-changed', syncPreferences)
    return () => window.removeEventListener('moonsprite:preferences-changed', syncPreferences)
  }, [])

  useEffect(() => {
    if (timelineHidden) {
      setPreviewPlayingState(false)
      setPlaybackMenu(null)
    }
  // setPreviewPlayingState deliberately follows the current playback state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timelineHidden])

  useEffect(() => {
    const blur = (): void => {
      panDrag.current = null
      setPanning(false)
    }
    window.addEventListener('blur', blur)
    return () => window.removeEventListener('blur', blur)
  }, [])

  useEffect(() => {
    if (!followViewport) return
    panDrag.current = null
    pendingPanRef.current = null
    if (panFrameRef.current !== null) {
      window.cancelAnimationFrame(panFrameRef.current)
      panFrameRef.current = null
    }
    setPanning(false)
  }, [followViewport])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !initialCompositeReady) return
    const draw = (): void => {
      const context = canvas.getContext('2d')
      const bounds = canvas.getBoundingClientRect()
      if (!context || bounds.width < 1 || bounds.height < 1) return
      const storeSession = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id)
      const currentSession = storeSession && (
        storeSession.document !== session.document
        || (storeSession.revision >= session.revision && storeSession.contentRevision >= session.contentRevision)
      ) ? storeSession : session
      const currentTimeline = currentSession.document.animation ?? ensureAnimationDocument(currentSession.document)
      // Store propagation can leave the panel's local frame id one React
      // commit behind the playback clock. Render the store's active frame
      // directly while playing so the editor and preview consume the same
      // shared composite instead of building adjacent frames independently.
      const renderFrameId = currentSession.animationPlaying ? currentTimeline.activeFrameId : previewFrameId
      const livePreview = liveCanvasPreviewRef.current
      const livePreviewForFrame = !previewPlaying
        && livePreview
        && livePreview.document.id === currentSession.document.id
        && livePreview.frameId === currentTimeline.activeFrameId
        && renderFrameId === currentTimeline.activeFrameId
        ? livePreview
        : null
      const sourceDocument = livePreviewForFrame?.document ?? currentSession.document
      const previewDocument = renderFrameId === currentTimeline.activeFrameId
        ? sourceDocument
        : cloneDocumentForAnimationFrame(sourceDocument, renderFrameId)
      const renderRevision = livePreviewForFrame?.revision ?? currentSession.revision
      const renderContentRevision = livePreviewForFrame?.contentRevision ?? currentSession.contentRevision
      const dpr = Math.max(1, window.devicePixelRatio || 1)
      const width = Math.max(1, Math.round(bounds.width * dpr))
      const height = Math.max(1, Math.round(bounds.height * dpr))
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height }
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      const displayWidth = bounds.width
      const displayHeight = bounds.height
      clearCanvasBacking(context, canvas)
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      let baseFit = baseFitRef.current
      if (!baseFit || baseFit.documentId !== sourceDocument.id || baseFit.width !== sourceDocument.width || baseFit.height !== sourceDocument.height || baseFit.viewportWidth !== displayWidth || baseFit.viewportHeight !== displayHeight || baseFit.devicePixelRatio !== dpr) {
        baseFit = { documentId: sourceDocument.id, width: sourceDocument.width, height: sourceDocument.height, viewportWidth: displayWidth, viewportHeight: displayHeight, devicePixelRatio: dpr, scale: pixelAlignedPreviewFitScale(Math.min(displayWidth / sourceDocument.width, displayHeight / sourceDocument.height), dpr) }
        baseFitRef.current = baseFit
      }
      const scale = zoom ?? baseFit.scale
      const smoothPixelSampling = pixelSamplingMode(scale) === 'smooth'
      const followSnapshot = followSnapshotRef.current
      const effectivePan = followViewport ? followPreviewPosition({
        documentSize: { width: sourceDocument.width, height: sourceDocument.height },
        sourceViewportSize: followSnapshot.viewportSize,
        previewViewportSize: { width: displayWidth, height: displayHeight },
        previewScale: scale,
        sourceView: followSnapshot.view,
        rotationIndicatorPosition
      }) : pan
      const drawWidth = sourceDocument.width * scale
      const drawHeight = sourceDocument.height * scale
      const originX = (displayWidth - drawWidth) / 2 + effectivePan.x
      const originY = (displayHeight - drawHeight) / 2 + effectivePan.y
      const canvasBoundary = deviceAlignedCanvasRect(originX, originY, drawWidth, drawHeight, dpr)
      context.fillStyle = canvasSurround
      context.fillRect(0, 0, displayWidth, displayHeight)
      context.save()
      context.beginPath()
      context.rect(canvasBoundary.left, canvasBoundary.top, canvasBoundary.width, canvasBoundary.height)
      context.clip()
      context.fillStyle = `rgb(${checkerboard.lightColor.r} ${checkerboard.lightColor.g} ${checkerboard.lightColor.b})`
      context.fillRect(canvasBoundary.left, canvasBoundary.top, canvasBoundary.width, canvasBoundary.height)
      const checkerCell = previewCheckerCellSize(checkerboard.size, scale)
      if (checkerCell >= 2) {
        const columnCount = Math.ceil(sourceDocument.width / checkerboard.size)
        const rowCount = Math.ceil(sourceDocument.height / checkerboard.size)
        const firstColumn = Math.max(0, Math.floor((0 - originX) / checkerCell))
        const firstRow = Math.max(0, Math.floor((0 - originY) / checkerCell))
        const lastColumn = Math.min(columnCount, Math.ceil((displayWidth - originX) / checkerCell))
        const lastRow = Math.min(rowCount, Math.ceil((displayHeight - originY) / checkerCell))
        context.fillStyle = `rgb(${checkerboard.darkColor.r} ${checkerboard.darkColor.g} ${checkerboard.darkColor.b})`
        for (let row = firstRow; row < lastRow; row += 1) for (let column = firstColumn; column < lastColumn; column += 1) {
          if ((column + row) % 2 === 0) continue
          context.fillRect(originX + column * checkerCell, originY + row * checkerCell, checkerCell, checkerCell)
        }
      }
      context.imageSmoothingEnabled = smoothPixelSampling
      if (smoothPixelSampling) context.imageSmoothingQuality = 'high'
      const fromX = Math.max(0, Math.floor((0 - originX) / scale))
      const fromY = Math.max(0, Math.floor((0 - originY) / scale))
      const toX = Math.min(sourceDocument.width, Math.ceil((displayWidth - originX) / scale))
      const toY = Math.min(sourceDocument.height, Math.ceil((displayHeight - originY) / scale))
      if (toX > fromX && toY > fromY) compositeCacheRef.current.draw({
        context,
        document: previewDocument,
        view: { zoom: scale, panX: 0, panY: 0, rotation: 0, mirrored: false, mirroredVertical: false, showGrid: false, relativeLuminance: showRelativeLuminance },
        originX,
        originY,
        canvasWidth: drawWidth,
        canvasHeight: drawHeight,
        fromX,
        fromY,
        toX,
        toY,
        revision: renderRevision,
        contentRevision: renderContentRevision,
        contentInvalidation: livePreviewForFrame ? null : currentSession.contentInvalidation,
        frameId: renderFrameId,
        imageSmoothingEnabled: smoothPixelSampling,
        animationPlayback: previewPlaying || currentSession.animationPlaying,
        animationConsumerOnly: currentSession.animationPlaying,
        devicePixelRatio: dpr,
        requestRedraw: () => {
          if (compositeWorkFrameRef.current !== null) return
          compositeWorkFrameRef.current = window.requestAnimationFrame(() => {
            compositeWorkFrameRef.current = null
            drawRef.current()
          })
        },
        movingLayerIds: livePreviewForFrame?.movingLayerIds,
        selectionPreview: livePreviewForFrame?.selectionPreview
      })
      context.restore()
    }
    drawRef.current = draw
    draw()
  }, [session.document, session.contentRevision, session.animationPlaying, previewFrameId, previewPlaying, timeline.activeFrameId, showRelativeLuminance, checkerboard, canvasSurround, rotationIndicatorPosition, zoom, pan, followViewport, initialCompositeReady])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const observer = new ResizeObserver(() => drawRef.current())
    observer.observe(canvas)
    return () => {
      observer.disconnect()
      drawRef.current = () => {}
    }
  }, [session.document.id])

  useEffect(() => () => {
    if (panFrameRef.current !== null) window.cancelAnimationFrame(panFrameRef.current)
    if (followFrameRef.current !== null) window.cancelAnimationFrame(followFrameRef.current)
    if (liveCanvasPreviewFrameRef.current !== null) window.cancelAnimationFrame(liveCanvasPreviewFrameRef.current)
    if (compositeWorkFrameRef.current !== null) window.cancelAnimationFrame(compositeWorkFrameRef.current)
  }, [])

  const schedulePan = (next: { x: number; y: number }): void => {
    pendingPanRef.current = next
    if (panFrameRef.current !== null) return
    panFrameRef.current = window.requestAnimationFrame(() => {
      panFrameRef.current = null
      const pending = pendingPanRef.current
      pendingPanRef.current = null
      if (pending) setPan(pending)
    })
  }

  const currentFollowPan = (): { x: number; y: number } | null => {
    const bounds = canvasRef.current?.getBoundingClientRect()
    if (!bounds || bounds.width < 1 || bounds.height < 1) return null
    const previewFit = pixelAlignedPreviewFitScale(Math.min(bounds.width / session.document.width, bounds.height / session.document.height), Math.max(1, window.devicePixelRatio || 1))
    const followSnapshot = followSnapshotRef.current
    return followPreviewPosition({
      documentSize: { width: session.document.width, height: session.document.height },
      sourceViewportSize: followSnapshot.viewportSize,
      previewViewportSize: { width: bounds.width, height: bounds.height },
      previewScale: zoom ?? previewFit,
      sourceView: followSnapshot.view,
      rotationIndicatorPosition
    })
  }

  const adjustZoom = (zoomIn: boolean, pointer?: { x: number; y: number }): void => {
    const canvas = canvasRef.current
    if (!canvas) return
    const bounds = canvas.getBoundingClientRect()
    if (bounds.width < 1 || bounds.height < 1) return
    const fitScale = pixelAlignedPreviewFitScale(Math.min(bounds.width / session.document.width, bounds.height / session.document.height), Math.max(1, window.devicePixelRatio || 1))
    const currentZoom = zoom ?? fitScale
    const nextZoom = steppedCanvasZoom(currentZoom, zoomIn)
    if (nextZoom === currentZoom) return
    if (followViewport) {
      setZoom(nextZoom)
      return
    }
    setPan(anchoredPreviewPan({
      documentSize: { width: session.document.width, height: session.document.height },
      viewportSize: { width: bounds.width, height: bounds.height },
      pointer: pointer ?? { x: bounds.width / 2, y: bounds.height / 2 },
      pan,
      zoom: currentZoom,
      nextZoom
    }))
    setZoom(nextZoom)
  }
  const adjustWheelZoom = (event: React.WheelEvent<HTMLDivElement>): void => {
    const canvas = canvasRef.current
    if (!canvas) return
    const bounds = canvas.getBoundingClientRect()
    if (bounds.width < 1 || bounds.height < 1) return
    const delta = normalizeCanvasWheelDelta(event.nativeEvent)
    if (delta === 0) return
    event.preventDefault()
    const fitScale = pixelAlignedPreviewFitScale(Math.min(bounds.width / session.document.width, bounds.height / session.document.height), Math.max(1, window.devicePixelRatio || 1))
    const currentZoom = zoom ?? fitScale
    const nextZoom = steppedCanvasZoom(currentZoom, delta < 0)
    if (nextZoom === currentZoom) return
    if (followViewport) {
      setZoom(nextZoom)
      return
    }
    setPan(anchoredPreviewPan({
      documentSize: { width: session.document.width, height: session.document.height },
      viewportSize: { width: bounds.width, height: bounds.height },
      pointer: { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
      pan,
      zoom: currentZoom,
      nextZoom
    }))
    setZoom(nextZoom)
  }
  const toggleFollowViewport = (): void => {
    if (followViewport) {
      const followedPan = currentFollowPan()
      if (followedPan) setPan(followedPan)
    }
    setFollowViewport((current) => !current)
  }
  const startPan = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0 && event.button !== 1) return
    let start = pan
    if (followViewport) {
      const followedPan = currentFollowPan()
      if (followedPan) {
        start = followedPan
        setPan(followedPan)
      }
      setFollowViewport(false)
    }
    panDrag.current = { x: event.clientX, y: event.clientY, panX: start.x, panY: start.y }
    setPanning(true)
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }
  const finishPan = (event: React.PointerEvent<HTMLDivElement>): void => {
    panDrag.current = null
    setPanning(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  const movePan = (event: React.PointerEvent<HTMLDivElement>): void => {
    const drag = panDrag.current
    if (!drag) return
    const delta = viewDragClientDelta(
      { x: event.clientX, y: event.clientY },
      { x: drag.x, y: drag.y },
      viewDragSensitivity
    )
    schedulePan({ x: drag.panX + delta.x, y: drag.panY + delta.y })
  }
  return <section ref={floating.ref} className={`panel preview-panel ${floating.style ? 'floating-panel' : ''}`} style={floating.style} onPointerDown={floating.bringToFront} onContextMenu={onPanelContextMenu}>
    <header onPointerDown={(event) => floating.style ? floating.startDrag(event) : onDockDragStart?.(event, floating.startDetachedDrag)}><span>{t('panel.preview')}</span><span className="panel-actions"><button className={followViewport ? 'active' : ''} title={t('preview.followViewport')} aria-label={t('preview.followViewport')} aria-pressed={followViewport} onClick={toggleFollowViewport}><PixelUtilityIcon kind="follow" /></button><button title={t('preview.zoomOut')} aria-label={t('preview.zoomOut')} onClick={() => adjustZoom(false)}><PixelUtilityIcon kind="minus" /></button><button title={t('preview.zoomIn')} aria-label={t('preview.zoomIn')} onClick={() => adjustZoom(true)}><PixelUtilityIcon kind="plus" /></button><button className={previewPlaying ? 'active' : ''} disabled={timelineHidden || timeline.frames.length <= 1} title={t(previewPlaying ? 'timeline.pause' : 'timeline.play')} aria-label={t(previewPlaying ? 'timeline.pause' : 'timeline.play')} onClick={() => setPreviewPlayingState(!previewPlaying)} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); if (!timelineHidden) setPlaybackMenu({ x: event.clientX, y: event.clientY }) }}><PlaybackPixelIcon kind={previewPlaying ? 'pause' : 'play'} /></button><button title={t('preview.close')} aria-label={t('preview.close')} onClick={onClose}><PixelUtilityIcon kind="close" /></button></span></header>
    <div className={`preview-canvas-wrap ${panning ? 'space-panning' : ''}`} onWheel={adjustWheelZoom} onPointerDown={startPan} onPointerMove={movePan} onPointerUp={finishPan} onPointerCancel={finishPan}><div className="preview-canvas-frame"><canvas ref={canvasRef} aria-label={t('preview.canvasAria')} /></div></div>
    {floating.style && <PanelResizeHandles onResize={floating.startResize} />}
    <FloatingDockPreview style={floating.dockPreview} />
    {playbackMenu && <AnimationPlaybackMenu session={session} x={playbackMenu.x} y={playbackMenu.y} playback={previewPlayback} onClose={() => setPlaybackMenu(null)} />}
  </section>
}
