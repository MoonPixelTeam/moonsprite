import { useEffect, useMemo, useRef, useState } from 'react'
import {
  buildCurveHistogramChunked,
  buildCurvePath,
  isColorAdjustmentIdentity,
  type AdjustmentKind,
  type ColorAdjustment,
  type CurveChannel,
  type CurveHistogram,
  type CurvePoint
} from '@/core/adjustments'
import { RangeField } from '@/components/RangeField'
import { DialogHeader } from '@/components/DialogHeader'
import { PixelUtilityIcon } from '@/components/PixelUtilityIcon'
import { LivePreviewToggle } from '@/components/LivePreviewToggle'
import { CheckboxField } from '@/components/CheckboxField'
import { ModalShell } from '@/components/ModalShell'
import { SegmentedControl } from '@/components/SegmentedControl'
import { useI18n } from '@/components/I18nProvider'
import { useWorkspace, type AdjustmentSnapshot } from '@/store/workspace'
import { beginAdjustmentPreviewEdit, endAdjustmentPreviewEdit, registerAdjustmentPreviewController } from '@/core/adjustment-preview-lifecycle'
import { AdjustmentPreviewWorkerClient } from '@/core/adjustment-preview-worker'
import type { AdjustmentPreviewBaseline, AdjustmentPreviewResult } from '@/core/adjustment-preview-protocol'
import { createCanvasRenderPlan } from '@/core/canvas-render-plan'
import { isLayerEffectivelyLocked, isLayerMask, rasterContentBounds } from '@/core/document-model'
import { loadEditorPreferences } from '@/core/file-preferences'
import { currentAppLocale } from '@/core/localization'
import { registerViewPreviewListener } from '@/core/view-preview-lifecycle'
import type { SelectionRect } from '@shared/types-selection'
import type { ViewState } from '@shared/types-view'

const ADJUSTMENT_VIEW_PREVIEW_DELAY_MS = 90
const ADJUSTMENT_PREVIEW_OVERSCAN_RATIO = 0.25

const adjustmentTargetState = (documentId: string | null) => {
  const state = useWorkspace.getState()
  const session = state.sessions.find((item) => item.document.id === documentId)
  return {
    selection: session?.selection ?? null,
    layerKey: session ? `${session.document.activeLayerId}|${session.selectedGroupId ?? ''}|${session.selectedGroupIds.join(',')}|${session.selectedLayerIds.join(',')}` : ''
  }
}

const adjustmentPreviewBaseline = (documentId: string | null, snapshot: AdjustmentSnapshot | null): AdjustmentPreviewBaseline | null => {
  if (!documentId || !snapshot) return null
  const session = useWorkspace.getState().sessions.find((item) => item.document.id === documentId)
  if (!session) return null
  const layers = snapshot.layers.flatMap((layerSnapshot) => {
    const layer = session.document.layers.find((candidate) => candidate.id === layerSnapshot.layerId)
    if (!layer || layer.kind || isLayerEffectivelyLocked(session.document, layer)) return []
    return [{
      layerId: layer.id,
      width: layerSnapshot.width,
      height: layerSnapshot.height,
      offsetX: layerSnapshot.offsetX,
      offsetY: layerSnapshot.offsetY,
      format: layer.format,
      isMask: isLayerMask(layer),
      localContentBounds: rasterContentBounds(layer, session.document.palette),
      pixels: layerSnapshot.pixels
    }]
  })
  return {
    documentWidth: session.document.width,
    documentHeight: session.document.height,
    colorMode: session.document.colorMode,
    palette: snapshot.palette,
    paletteOrder: session.document.paletteOrder,
    nextColorId: snapshot.nextColorId,
    selection: session.selection,
    locale: currentAppLocale(),
    layers
  }
}

const adjustmentPreviewRegion = (documentId: string | null, viewOverride?: ViewState, overscan = false): SelectionRect | undefined => {
  if (!documentId) return undefined
  const session = useWorkspace.getState().sessions.find((item) => item.document.id === documentId)
  if (!session) return undefined
  const full = { x: 0, y: 0, width: session.document.width, height: session.document.height }
  const view = viewOverride ?? session.view
  if (view.tileRepeatMode && view.tileRepeatMode !== 'off') return full
  if (session.viewportSize.width <= 0 || session.viewportSize.height <= 0) return full
  const plan = createCanvasRenderPlan(
    session.viewportSize.width,
    session.viewportSize.height,
    session.document,
    view,
    loadEditorPreferences().rotationIndicatorPosition
  )
  if (plan.toX <= plan.fromX || plan.toY <= plan.fromY) return undefined
  const visible = { x: plan.fromX, y: plan.fromY, width: plan.toX - plan.fromX, height: plan.toY - plan.fromY }
  if (!overscan) return visible
  const paddingX = Math.max(32, Math.ceil(visible.width * ADJUSTMENT_PREVIEW_OVERSCAN_RATIO))
  const paddingY = Math.max(32, Math.ceil(visible.height * ADJUSTMENT_PREVIEW_OVERSCAN_RATIO))
  const x = Math.max(0, visible.x - paddingX)
  const y = Math.max(0, visible.y - paddingY)
  const right = Math.min(session.document.width, visible.x + visible.width + paddingX)
  const bottom = Math.min(session.document.height, visible.y + visible.height + paddingY)
  return { x, y, width: right - x, height: bottom - y }
}

const previewRegionContains = (container: SelectionRect, target: SelectionRect): boolean => container.x <= target.x
  && container.y <= target.y
  && container.x + container.width >= target.x + target.width
  && container.y + container.height >= target.y + target.height

const previewRegionsOverlap = (first: SelectionRect, second: SelectionRect): boolean => first.x <= second.x + second.width
  && second.x <= first.x + first.width
  && first.y <= second.y + second.height
  && second.y <= first.y + first.height

const mergePreviewRegions = (first: SelectionRect, second: SelectionRect): SelectionRect => {
  const x = Math.min(first.x, second.x)
  const y = Math.min(first.y, second.y)
  const right = Math.max(first.x + first.width, second.x + second.width)
  const bottom = Math.max(first.y + first.height, second.y + second.height)
  return { x, y, width: right - x, height: bottom - y }
}

const adjustmentPreviewResultRegion = (result: AdjustmentPreviewResult): SelectionRect | null => result.layers.reduce<SelectionRect | null>((region, layer) => {
  const layerRegion = { x: layer.x, y: layer.y, width: layer.width, height: layer.height }
  return region ? mergePreviewRegions(region, layerRegion) : layerRegion
}, null)

const appendPreviewRegion = (regions: readonly SelectionRect[], next: SelectionRect): SelectionRect[] => {
  let merged = next
  let pending = [...regions]
  let changed = true
  while (changed) {
    changed = false
    const remaining: SelectionRect[] = []
    for (const region of pending) {
      if (previewRegionsOverlap(region, merged)) {
        merged = mergePreviewRegions(region, merged)
        changed = true
      } else remaining.push(region)
    }
    pending = remaining
  }
  return [...pending, merged]
}

const yieldHistogramControl = (): Promise<void> => new Promise((resolve) => {
  if (typeof MessageChannel === 'undefined') {
    window.setTimeout(resolve, 0)
    return
  }
  const channel = new MessageChannel()
  channel.port1.onmessage = () => {
    channel.port1.close()
    channel.port2.close()
    resolve()
  }
  channel.port2.postMessage(null)
})

function CurveEditor({ points, channel = 'rgb', histogram, onChange, onReset }: { points: CurvePoint[]; channel?: CurveChannel; histogram?: Uint32Array; onChange: (points: CurvePoint[]) => void; onReset: () => void }) {
  const { t } = useI18n()
  const activePointRef = useRef<number | null>(null)
  const [selectedPoint, setSelectedPoint] = useState<number | null>(null)
  const pointsRef = useRef(points)
  pointsRef.current = points
  useEffect(() => {
    if (selectedPoint !== null && selectedPoint >= points.length) setSelectedPoint(null)
  }, [points.length, selectedPoint])
  const eventPoint = (event: React.PointerEvent<SVGSVGElement>): CurvePoint => {
    const bounds = event.currentTarget.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(255, Math.round((event.clientX - bounds.left) / Math.max(1, bounds.width) * 255))),
      y: Math.max(0, Math.min(255, Math.round((bounds.bottom - event.clientY) / Math.max(1, bounds.height) * 255)))
    }
  }
  const nearestPoint = (event: React.PointerEvent<SVGSVGElement>): number => {
    const bounds = event.currentTarget.getBoundingClientRect()
    return pointsRef.current.findIndex((point) => Math.hypot(point.x / 255 * bounds.width - (event.clientX - bounds.left), (255 - point.y) / 255 * bounds.height - (event.clientY - bounds.top)) <= 12)
  }
  const begin = (event: React.PointerEvent<SVGSVGElement>): void => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const hit = nearestPoint(event)
    if (hit >= 0) {
      activePointRef.current = hit
      setSelectedPoint(hit)
    } else {
      const point = eventPoint(event)
      const next = [...pointsRef.current, point].sort((left, right) => left.x - right.x)
      activePointRef.current = next.indexOf(point)
      setSelectedPoint(activePointRef.current)
      pointsRef.current = next
      onChange(next)
    }
    event.preventDefault()
  }
  const move = (event: React.PointerEvent<SVGSVGElement>): void => {
    const index = activePointRef.current
    if (index === null) return
    const source = pointsRef.current
    const point = eventPoint(event)
    const next = source.map((item) => ({ ...item }))
    point.x = index === 0 ? 0 : index === next.length - 1 ? 255 : Math.max(next[index - 1].x + 1, Math.min(next[index + 1].x - 1, point.x))
    next[index] = point
    pointsRef.current = next
    onChange(next)
  }
  const end = (event: React.PointerEvent<SVGSVGElement>): void => {
    activePointRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  const removeAt = (clientX: number, clientY: number, bounds: DOMRect): void => {
    const index = pointsRef.current.findIndex((point) => Math.hypot(point.x / 255 * bounds.width - (clientX - bounds.left), (255 - point.y) / 255 * bounds.height - (clientY - bounds.top)) <= 12)
    if (index <= 0 || index >= pointsRef.current.length - 1) return
    const next = pointsRef.current.filter((_, pointIndex) => pointIndex !== index)
    pointsRef.current = next
    setSelectedPoint(null)
    onChange(next)
  }
  const remove = (event: React.MouseEvent<SVGSVGElement>): void => {
    const bounds = event.currentTarget.getBoundingClientRect()
    removeAt(event.clientX, event.clientY, bounds)
  }
  const removeContext = (event: React.MouseEvent<SVGSVGElement>): void => {
    event.preventDefault()
    removeAt(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect())
  }
  const removeSelected = (): void => {
    if (selectedPoint === null || selectedPoint <= 0 || selectedPoint >= pointsRef.current.length - 1) return
    const next = pointsRef.current.filter((_, index) => index !== selectedPoint)
    pointsRef.current = next
    setSelectedPoint(null)
    onChange(next)
  }
  const path = buildCurvePath(points)
  const histogramBars = useMemo(() => {
    if (!histogram) return null
    const maximum = Math.max(1, ...histogram)
    const barWidth = 255 / histogram.length
    return Array.from(histogram, (value, index) => {
      const height = value === 0 ? 0 : Math.max(1, value / maximum * 251)
      return <rect key={index} x={index * barWidth} y={255 - height} width={barWidth + 0.1} height={height} />
    })
  }, [histogram])
  const tendency = channel === 'rgb' ? t('adjustment.curve.neutral') : channel === 'red' ? t('adjustment.curve.cyanRed') : channel === 'green' ? t('adjustment.curve.magentaGreen') : t('adjustment.curve.yellowBlue')
  return <div className={`curve-editor curve-editor-${channel}`}>
    <div className="curve-editor-toolbar">
      <span>{tendency}</span>
      <div className="curve-editor-actions"><button type="button" className="icon-button" title={t('adjustment.curve.resetChannel')} aria-label={t('adjustment.curve.resetChannel')} onClick={onReset}><PixelUtilityIcon kind="restore" /></button><button type="button" className="icon-button" title={t('adjustment.curve.deletePoint')} aria-label={t('adjustment.curve.deletePoint')} disabled={selectedPoint === null || selectedPoint === 0 || selectedPoint === points.length - 1} onClick={removeSelected}><PixelUtilityIcon kind="delete" /></button></div>
    </div>
    <svg className="curve-editor-plot" viewBox="0 0 255 255" preserveAspectRatio="none" role="application" tabIndex={0} aria-label={t('adjustment.curve.editorAria')} onKeyDown={(event) => { if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); removeSelected() } }} onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onDoubleClick={remove} onContextMenu={removeContext}>
      {histogramBars && <g className={`curve-histogram curve-histogram-${channel}`}>{histogramBars}</g>}
      <path className="curve-grid" d="M 63.75 0 V 255 M 127.5 0 V 255 M 191.25 0 V 255 M 0 63.75 H 255 M 0 127.5 H 255 M 0 191.25 H 255" />
      {points.length > 1 && <path className={`curve-line curve-line-${channel}`} d={path} />}
      {points.map((point, index) => <rect key={index} className={`curve-point curve-point-${channel} ${selectedPoint === index ? 'selected' : ''}`} x={point.x - 4} y={251 - point.y} width="8" height="8" />)}
    </svg>
    <div className="curve-editor-axis"><span>{t('adjustment.curve.shadows')}</span><span>{t('adjustment.curve.highlights')}</span></div>
  </div>
}

export function AdjustmentDialog({ kind, onClose }: { kind: AdjustmentKind; onClose: () => void }) {
  const { t } = useI18n()
  const activeDocumentId = useWorkspace((state) => state.activeId)
  const activeSelection = useWorkspace((state) => state.sessions.find((session) => session.document.id === state.activeId)?.selection ?? null)
  const selectedLayerKey = useWorkspace((state) => {
    const session = state.sessions.find((item) => item.document.id === state.activeId)
    return session ? `${session.document.activeLayerId}|${session.selectedGroupId ?? ''}|${session.selectedGroupIds.join(',')}|${session.selectedLayerIds.join(',')}` : ''
  })
  const previewGeometryKey = useWorkspace((state) => {
    const session = state.sessions.find((item) => item.document.id === state.activeId)
    return session
      ? `${session.document.width}:${session.document.height}:${session.viewportSize.width}:${session.viewportSize.height}:${session.view.rotation}:${session.view.mirrored ? 1 : 0}:${session.view.mirroredVertical ? 1 : 0}:${session.view.tileRepeatMode ?? 'off'}`
      : ''
  })
  const [baseline, setBaseline] = useState(() => useWorkspace.getState().captureActiveLayerAdjustmentSnapshot())
  const baselineRef = useRef(baseline)
  const baselineTargetRef = useRef(adjustmentTargetState(activeDocumentId))
  const transientBaselineRef = useRef<typeof baseline>(null)
  const suspendedRef = useRef(false)
  const closedRef = useRef(false)
  const [previewEnabled, setPreviewEnabled] = useState(true)
  const [brightness, setBrightness] = useState(0)
  const [contrast, setContrast] = useState(0)
  const [hue, setHue] = useState(0)
  const [saturation, setSaturation] = useState(0)
  const [lightness, setLightness] = useState(0)
  const [curveChannel, setCurveChannel] = useState<CurveChannel>('rgb')
  const [curvePoints, setCurvePoints] = useState<Record<CurveChannel, CurvePoint[]>>({
    rgb: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
    red: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
    green: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
    blue: [{ x: 0, y: 0 }, { x: 255, y: 255 }]
  })
  const [balanceTone, setBalanceTone] = useState<'shadows' | 'midtones' | 'highlights'>('midtones')
  const [preserveLuminosity, setPreserveLuminosity] = useState(true)
  const histogramLayer = baseline?.layers[0]
  const [histogram, setHistogram] = useState<CurveHistogram | null>(null)
  useEffect(() => {
    if (kind !== 'curves' || !histogramLayer) {
      setHistogram(null)
      return
    }
    let active = true
    setHistogram(null)
    void buildCurveHistogramChunked(
      histogramLayer.pixels,
      histogramLayer.pixels instanceof Uint8ClampedArray ? 'rgba' : 'indexed',
      baseline?.palette ?? [],
      () => active,
      yieldHistogramControl
    ).then((result) => {
      if (active) setHistogram(result)
    })
    return () => { active = false }
  }, [baseline, histogramLayer, kind])
  const [balance, setBalance] = useState({
    shadowsCyanRed: 0, shadowsMagentaGreen: 0, shadowsYellowBlue: 0,
    midtonesCyanRed: 0, midtonesMagentaGreen: 0, midtonesYellowBlue: 0,
    highlightsCyanRed: 0, highlightsMagentaGreen: 0, highlightsYellowBlue: 0
  })
  const adjustment = useMemo<ColorAdjustment>(() => kind === 'brightness-contrast'
    ? { kind, brightness, contrast }
    : kind === 'hue-saturation'
      ? { kind, hue, saturation, lightness }
      : kind === 'curves'
        ? { kind, curvePoints: curvePoints.rgb, curveRedPoints: curvePoints.red, curveGreenPoints: curvePoints.green, curveBluePoints: curvePoints.blue }
        : { kind, ...balance, preserveLuminosity }, [kind, brightness, contrast, hue, saturation, lightness, curvePoints, balance, preserveLuminosity])
  const adjustmentKey = useMemo(() => JSON.stringify(adjustment), [adjustment])
  const previewFrameRef = useRef<number | null>(null)
  const viewPreviewTimerRef = useRef<number | null>(null)
  const pendingPreviewViewRef = useRef<ViewState | undefined>(undefined)
  const previewSequenceRef = useRef(0)
  const previewAppliedRef = useRef(false)
  const previewCoverageRef = useRef<{ adjustmentKey: string; region: SelectionRect } | null>(null)
  const pendingPreviewCoverageRef = useRef<{ adjustmentKey: string; region: SelectionRect; sequence: number } | null>(null)
  const previewDirtyRegionsRef = useRef<SelectionRect[]>([])
  const transientPreviewDirtyRegionsRef = useRef<SelectionRect[]>([])
  const workerReadyRef = useRef(false)
  const workerInitializingRef = useRef(false)
  const workerClientRef = useRef<AdjustmentPreviewWorkerClient | null>(null)
  const latestPreviewResultRef = useRef<{ adjustmentKey: string; result: AdjustmentPreviewResult } | null>(null)
  const schedulePreviewRef = useRef<(view?: ViewState, reason?: 'adjustment' | 'view') => void>(() => {})
  const latestAdjustmentRef = useRef(adjustment)
  const latestAdjustmentKeyRef = useRef(adjustmentKey)
  const previewEnabledRef = useRef(previewEnabled)
  latestAdjustmentRef.current = adjustment
  latestAdjustmentKeyRef.current = adjustmentKey
  previewEnabledRef.current = previewEnabled
  workerClientRef.current ??= new AdjustmentPreviewWorkerClient()
  const rememberPreviewRegion = (region: SelectionRect, transient = false): void => {
    const target = transient ? transientPreviewDirtyRegionsRef : previewDirtyRegionsRef
    target.current = appendPreviewRegion(target.current, region)
    if (!transient) previewAppliedRef.current = true
  }
  const restoreTrackedPreview = (snapshot: AdjustmentSnapshot, transient = false, forceFull = false): void => {
    const target = transient ? transientPreviewDirtyRegionsRef : previewDirtyRegionsRef
    if (target.current.length === 0 && !forceFull) return
    useWorkspace.getState().restoreActiveDocumentSnapshot(snapshot, target.current.length > 0 ? target.current : undefined)
    target.current = []
  }
  const clearViewPreviewTimer = (): void => {
    if (viewPreviewTimerRef.current !== null) window.clearTimeout(viewPreviewTimerRef.current)
    viewPreviewTimerRef.current = null
  }
  const cancelScheduledPreview = (): void => {
    if (previewFrameRef.current !== null) window.cancelAnimationFrame(previewFrameRef.current)
    clearViewPreviewTimer()
    previewFrameRef.current = null
    pendingPreviewViewRef.current = undefined
    previewSequenceRef.current += 1
    pendingPreviewCoverageRef.current = null
    workerClientRef.current?.cancel()
  }

  const visibleRegionCovered = (viewOverride?: ViewState): boolean => {
    const visible = adjustmentPreviewRegion(activeDocumentId, viewOverride)
    if (!visible) return true
    const key = latestAdjustmentKeyRef.current
    const applied = previewCoverageRef.current
    if (applied?.adjustmentKey === key && previewRegionContains(applied.region, visible)) return true
    const pending = pendingPreviewCoverageRef.current
    return Boolean(pending?.adjustmentKey === key && previewRegionContains(pending.region, visible))
  }

  const queuePreview = (viewOverride?: ViewState): void => {
    pendingPreviewViewRef.current = viewOverride
    if (previewFrameRef.current !== null || suspendedRef.current || closedRef.current) return
    previewFrameRef.current = window.requestAnimationFrame(() => {
      previewFrameRef.current = null
      const source = baselineRef.current
      if (!source || suspendedRef.current || closedRef.current) return
      const workspace = useWorkspace.getState()
      if (!previewEnabledRef.current) {
        workerClientRef.current?.cancel()
        latestPreviewResultRef.current = null
        restoreTrackedPreview(source, false, previewAppliedRef.current)
        previewAppliedRef.current = false
        previewCoverageRef.current = null
        pendingPreviewCoverageRef.current = null
        return
      }
      const currentAdjustment = latestAdjustmentRef.current
      if (isColorAdjustmentIdentity(currentAdjustment) && !previewAppliedRef.current) return
      const requestedView = pendingPreviewViewRef.current
      pendingPreviewViewRef.current = undefined
      const currentAdjustmentKey = latestAdjustmentKeyRef.current
      if (workerInitializingRef.current) return
      if (visibleRegionCovered(requestedView)) return
      const region = adjustmentPreviewRegion(activeDocumentId, requestedView, true)
      if (!region) return
      const requestSequence = ++previewSequenceRef.current
      if (!workerReadyRef.current) {
        workspace.previewActiveLayerAdjustment(currentAdjustment, source, undefined, region)
        latestPreviewResultRef.current = null
        previewCoverageRef.current = { adjustmentKey: currentAdjustmentKey, region }
        rememberPreviewRegion(region)
        return
      }
      pendingPreviewCoverageRef.current = { adjustmentKey: currentAdjustmentKey, region, sequence: requestSequence }
      const request = workerClientRef.current!.request(currentAdjustment, region)
      void request.then((result) => {
        if (requestSequence !== previewSequenceRef.current || suspendedRef.current || closedRef.current || !previewEnabledRef.current) return
        if (pendingPreviewCoverageRef.current?.sequence === requestSequence) pendingPreviewCoverageRef.current = null
        const currentBaseline = baselineRef.current
        if (!currentBaseline) return
        const currentWorkspace = useWorkspace.getState()
        if (result) {
          currentWorkspace.applyActiveLayerAdjustmentPreviewResult(currentBaseline, result)
          previewCoverageRef.current = { adjustmentKey: currentAdjustmentKey, region: result.region }
          latestPreviewResultRef.current = result.layers.length > 0 ? { adjustmentKey: currentAdjustmentKey, result } : null
          const dirtyRegion = adjustmentPreviewResultRegion(result)
          if (dirtyRegion) rememberPreviewRegion(dirtyRegion)
          return
        }
        currentWorkspace.previewActiveLayerAdjustment(currentAdjustment, currentBaseline, undefined, region)
        latestPreviewResultRef.current = null
        previewCoverageRef.current = { adjustmentKey: currentAdjustmentKey, region }
        rememberPreviewRegion(region)
      })
    })
  }

  schedulePreviewRef.current = (viewOverride, reason = 'adjustment') => {
    if (reason === 'adjustment') {
      clearViewPreviewTimer()
      queuePreview(viewOverride)
      return
    }
    pendingPreviewViewRef.current = viewOverride
    if (!previewEnabledRef.current || suspendedRef.current || closedRef.current || visibleRegionCovered(viewOverride)) {
      clearViewPreviewTimer()
      return
    }
    clearViewPreviewTimer()
    viewPreviewTimerRef.current = window.setTimeout(() => {
      viewPreviewTimerRef.current = null
      const pendingView = pendingPreviewViewRef.current
      if (!visibleRegionCovered(pendingView)) queuePreview(pendingView)
    }, ADJUSTMENT_VIEW_PREVIEW_DELAY_MS)
  }

  useEffect(() => {
    cancelScheduledPreview()
    baselineRef.current = baseline
    latestPreviewResultRef.current = null
    previewCoverageRef.current = null
    pendingPreviewCoverageRef.current = null
    previewDirtyRegionsRef.current = []
    const source = adjustmentPreviewBaseline(activeDocumentId, baseline)
    workerReadyRef.current = false
    workerInitializingRef.current = Boolean(source)
    if (!source) {
      schedulePreviewRef.current()
      return
    }
    let active = true
    void workerClientRef.current!.initialize(source).then((ready) => {
      if (!active || closedRef.current || baselineRef.current !== baseline) return
      workerInitializingRef.current = false
      workerReadyRef.current = ready
      schedulePreviewRef.current()
    })
    return () => { active = false }
  }, [activeDocumentId, baseline])

  useEffect(() => {
    if (!activeDocumentId) return
    return registerAdjustmentPreviewController(activeDocumentId, {
      suspend: () => {
        if (closedRef.current) return
        suspendedRef.current = true
        transientBaselineRef.current = null
        cancelScheduledPreview()
        latestPreviewResultRef.current = null
        if (baselineRef.current) restoreTrackedPreview(baselineRef.current, false, previewAppliedRef.current)
        previewAppliedRef.current = false
        previewCoverageRef.current = null
        transientPreviewDirtyRegionsRef.current = []
      },
      prepare: () => {
        if (!suspendedRef.current || !transientBaselineRef.current) return
        restoreTrackedPreview(transientBaselineRef.current, true)
      },
      render: (selection) => {
        if (!suspendedRef.current || closedRef.current) return
        const workspace = useWorkspace.getState()
        const next = workspace.captureActiveLayerAdjustmentSnapshot()
        transientBaselineRef.current = next
        if (next && previewEnabledRef.current && !isColorAdjustmentIdentity(latestAdjustmentRef.current)) {
          const region = adjustmentPreviewRegion(activeDocumentId)
          if (region) {
            workspace.previewActiveLayerAdjustment(latestAdjustmentRef.current, next, selection, region)
            rememberPreviewRegion(region, true)
          }
        }
      },
      resume: () => {
        if (closedRef.current || !suspendedRef.current) return
        const workspace = useWorkspace.getState()
        if (transientBaselineRef.current) restoreTrackedPreview(transientBaselineRef.current, true)
        const next = workspace.captureActiveLayerAdjustmentSnapshot()
        transientBaselineRef.current = null
        suspendedRef.current = false
        baselineTargetRef.current = adjustmentTargetState(activeDocumentId)
        baselineRef.current = next
        workerReadyRef.current = false
        setBaseline(next)
      }
    })
  }, [activeDocumentId])

  useEffect(() => {
    const target = baselineTargetRef.current
    if (target.selection === activeSelection && target.layerKey === selectedLayerKey) return
    if (!activeDocumentId || closedRef.current) return
    beginAdjustmentPreviewEdit(activeDocumentId)
    endAdjustmentPreviewEdit(activeDocumentId)
  }, [activeDocumentId, activeSelection, selectedLayerKey])

  useEffect(() => {
    previewCoverageRef.current = null
    pendingPreviewCoverageRef.current = null
    schedulePreviewRef.current(undefined, 'adjustment')
  }, [adjustmentKey, previewEnabled])

  useEffect(() => schedulePreviewRef.current(undefined, 'view'), [previewGeometryKey])

  useEffect(() => {
    if (!activeDocumentId) return
    return registerViewPreviewListener(activeDocumentId, (view) => schedulePreviewRef.current(view, 'view'))
  }, [activeDocumentId])

  const cancel = (): void => {
    if (closedRef.current) return
    closedRef.current = true
    cancelScheduledPreview()
    if (baselineRef.current) restoreTrackedPreview(baselineRef.current, false, previewAppliedRef.current)
    onClose()
  }
  const apply = (): void => {
    if (closedRef.current) return
    closedRef.current = true
    cancelScheduledPreview()
    if (baselineRef.current) {
      const currentAdjustment = latestAdjustmentRef.current
      if (isColorAdjustmentIdentity(currentAdjustment)) {
        restoreTrackedPreview(baselineRef.current, false, previewAppliedRef.current)
      } else {
        const preview = latestPreviewResultRef.current
        useWorkspace.getState().applyActiveLayerAdjustmentFromSnapshot(
          currentAdjustment,
          baselineRef.current,
          preview?.adjustmentKey === latestAdjustmentKeyRef.current ? preview.result : null
        )
      }
    }
    onClose()
  }
  useEffect(() => {
    const close = (event: Event): void => {
      const target = (event as CustomEvent<{ target?: string }>).detail?.target
      if (!target || target === 'adjustment') cancel()
    }
    window.addEventListener('moonsprite:close-dialog', close)
    return () => window.removeEventListener('moonsprite:close-dialog', close)
  })
  useEffect(() => () => {
    cancelScheduledPreview()
    workerClientRef.current?.dispose()
  }, [])
  const title = kind === 'color-balance' ? t('adjustment.title.colorBalance') : kind === 'brightness-contrast' ? t('adjustment.title.brightnessContrast') : kind === 'hue-saturation' ? t('adjustment.title.hueSaturation') : t('adjustment.title.curves')
  const tonePrefix = balanceTone === 'shadows' ? 'shadows' : balanceTone === 'midtones' ? 'midtones' : 'highlights'
  const updateBalance = (channel: 'CyanRed' | 'MagentaGreen' | 'YellowBlue', value: number): void => setBalance((current) => ({ ...current, [`${tonePrefix}${channel}`]: value }))
  const balanceValue = (channel: 'CyanRed' | 'MagentaGreen' | 'YellowBlue'): number => balance[`${tonePrefix}${channel}` as keyof typeof balance]
  const curveChannelOptions = (['rgb', 'red', 'green', 'blue'] as CurveChannel[]).map((channel) => ({
    value: channel,
    label: <span className={`curve-channel-label curve-channel-${channel}`}><i aria-hidden="true" />{channel === 'rgb' ? 'RGB' : channel === 'red' ? t('adjustment.channel.red') : channel === 'green' ? t('adjustment.channel.green') : t('adjustment.channel.blue')}</span>
  }))

  return <div className="modal-backdrop" role="presentation"><ModalShell storageKey={`adjustment-${kind}-v4`} placement="right" defaultWidth={kind === 'curves' ? 450 : 400} defaultHeight={kind === 'curves' ? 500 : 380} minWidth={kind === 'curves' ? 420 : 350} minHeight={kind === 'curves' ? 440 : 300} maxWidth={620} maxHeight={720} className="adjustment-modal" role="dialog" aria-label={title}><DialogHeader eyebrow="ADJUST" title={title} closeLabel={t('common.close')} onClose={cancel} /><div className="modal-body adjustment-modal-body">
    {kind === 'brightness-contrast' && <section className="adjustment-controls"><RangeField className="adjustment-slider-row" label={t('adjustment.brightness')} min={-100} max={100} value={brightness} onChange={setBrightness} /><RangeField className="adjustment-slider-row" label={t('adjustment.contrast')} min={-100} max={100} value={contrast} onChange={setContrast} /></section>}
    {kind === 'hue-saturation' && <section className="adjustment-controls"><RangeField className="adjustment-slider-row" label={t('adjustment.hue')} min={-180} max={180} value={hue} onChange={setHue} /><RangeField className="adjustment-slider-row" label={t('adjustment.saturation')} min={-100} max={100} value={saturation} onChange={setSaturation} /><RangeField className="adjustment-slider-row" label={t('adjustment.lightness')} min={-100} max={100} value={lightness} onChange={setLightness} /></section>}
    {kind === 'curves' && <section className="adjustment-controls curve-controls"><SegmentedControl className="curve-channel-tabs" label={t('adjustment.curve.channels')} options={curveChannelOptions} value={curveChannel} onChange={setCurveChannel} /><CurveEditor channel={curveChannel} histogram={histogram?.[curveChannel]} points={curvePoints[curveChannel]} onChange={(next) => setCurvePoints((current) => ({ ...current, [curveChannel]: next }))} onReset={() => setCurvePoints((current) => ({ ...current, [curveChannel]: [{ x: 0, y: 0 }, { x: 255, y: 255 }] }))} /></section>}
    {kind === 'color-balance' && <section className="balance-panel"><SegmentedControl className="balance-tone-tabs" label={t('adjustment.title.colorBalance')} options={[{ value: 'shadows', label: t('adjustment.balance.shadows') }, { value: 'midtones', label: t('adjustment.balance.midtones') }, { value: 'highlights', label: t('adjustment.balance.highlights') }]} value={balanceTone} onChange={setBalanceTone} /><div className="adjustment-controls balance-controls"><RangeField className="adjustment-slider-row" label={t('adjustment.balance.cyanRed')} min={-100} max={100} value={balanceValue('CyanRed')} onChange={(value) => updateBalance('CyanRed', value)} /><RangeField className="adjustment-slider-row" label={t('adjustment.balance.magentaGreen')} min={-100} max={100} value={balanceValue('MagentaGreen')} onChange={(value) => updateBalance('MagentaGreen', value)} /><RangeField className="adjustment-slider-row" label={t('adjustment.balance.yellowBlue')} min={-100} max={100} value={balanceValue('YellowBlue')} onChange={(value) => updateBalance('YellowBlue', value)} /></div><CheckboxField className="tool-checkbox preserve-luminosity" checked={preserveLuminosity} label={t('adjustment.balance.preserveLuminosity')} onChange={setPreserveLuminosity} /></section>}
    <LivePreviewToggle className="adjustment-preview-toggle" checked={previewEnabled} onChange={setPreviewEnabled} />
  </div><footer><button className="quiet-button" onClick={cancel}>{t('common.cancel')}</button><button className="primary-button" onClick={apply}>{t('common.apply')}</button></footer></ModalShell></div>
}
