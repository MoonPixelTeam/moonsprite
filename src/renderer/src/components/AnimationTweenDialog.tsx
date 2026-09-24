import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { SpriteDocument } from '@shared/types-document'
import { DEFAULT_ANIMATION_TWEEN, animationTweenCompositePreview, animationTweenPreviewBounds, animationTweenSource, animationTweenSourceFrameId, animationTweenSourceSurface, cropTweenSource, tweenTranslation, tweenSurface, type AnimationTweenOptions, type TweenEasing } from '@/core/animation-tween'
import { animationLoopSectionAtFrame } from '@/core/animation-loop-sections'
import { rasterContentBounds } from '@/core/document-model'
import { shareRasterLayer } from '@/core/layer-preview'
import { loadEditorPreferences } from '@/core/file-preferences'
import { SettingsSectionHeader } from './SettingsSectionHeader'
import { useWorkspace } from '@/store/workspace'
import { useI18n } from './I18nProvider'
import { DialogHeader } from './DialogHeader'
import { ModalShell } from './ModalShell'
import { FormField } from './FormField'
import { NumberInput } from './NumberInput'
import { ThemedSelect } from './ThemedSelect'
import { PreviewPlaybackControls } from './PreviewPlaybackControls'
import { AnimationTweenPathEditor } from './AnimationTweenPathEditor'
import { LivePreviewToggle } from './LivePreviewToggle'
import { TweenEasingDialog } from './TweenEasingDialog'
import { PreferenceToggle } from './PreferenceToggle'
import { drawTweenCheckerboard, drawTweenPixelPath, publishAnimationTweenPreview, tweenPreviewCanvas } from './animation-tween-preview'

export function AnimationTweenDialog({ document, frameId, layerId, initialLoopSectionId, onClose }: {
  document: SpriteDocument; frameId: string; layerId: string; initialLoopSectionId?: string; onClose(): void
}) {
  const { t } = useI18n()
  const loopSections = useWorkspace((state) => state.sessions.find((session) => session.document.id === document.id)?.document.animation?.loopSections) ?? document.animation?.loopSections
  const revision = useWorkspace((state) => state.sessions.find((session) => session.document.id === document.id)?.revision)
  const selectedLayerIds = useWorkspace((state) => state.sessions.find((session) => session.document.id === document.id)?.selectedLayerIds)
  const selectedGroupIds = useWorkspace((state) => state.sessions.find((session) => session.document.id === document.id)?.selectedGroupIds)
  const [draftOptions, setOptions] = useState<AnimationTweenOptions>(() => ({
    ...DEFAULT_ANIMATION_TWEEN, layerScope: 'all', scope: initialLoopSectionId ? 'loop' : document.animation?.frames[(document.animation.frames.findIndex((frame) => frame.id === frameId)) + 1] ? 'between' : 'frame',
    loopSectionId: initialLoopSectionId ?? (document.animation ? animationLoopSectionAtFrame(document.animation, frameId)?.id ?? document.animation.loopSections?.[0]?.id : undefined),
    duration: document.animation?.frames.find((frame) => frame.id === frameId)?.duration ?? 100
  }))
  // A dialog may stay open while loops are created, edited, deleted or restored.
  // Resolve the same valid ID for the select, preview and generation command.
  const options = useMemo<AnimationTweenOptions>(() => ({
    ...draftOptions,
    layerIds: selectedLayerIds, groupIds: selectedGroupIds,
    path: draftOptions.scope === 'between' ? undefined : draftOptions.path,
    loopSectionId: loopSections?.some((section) => section.id === draftOptions.loopSectionId) ? draftOptions.loopSectionId
      : (document.animation ? animationLoopSectionAtFrame(document.animation, frameId)?.id : undefined) ?? loopSections?.[0]?.id
  }), [draftOptions, loopSections, document, frameId, selectedLayerIds, selectedGroupIds])
  const between = options.scope === 'between'
  const previewSteps = options.frameCount + (between ? 1 : 0)
  const [progress, setProgress] = useState(1)
  const [endpointEnabled, setEndpointEnabled] = useState(false)
  const endpointOwner = useRef({})
  const [checkerboard, setCheckerboard] = useState(() => loadEditorPreferences().checkerboard)
  useEffect(() => {
    const refresh = () => setCheckerboard(loadEditorPreferences().checkerboard)
    window.addEventListener('moonsprite:preferences-changed', refresh)
    return () => window.removeEventListener('moonsprite:preferences-changed', refresh)
  }, [])
  const [playing, setPlaying] = useState(false)
  const playbackStartRef = useRef(0)
  const [error, setError] = useState('')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [pathEditorOpen, setPathEditorOpen] = useState(false)
  const [curveEditorOpen, setCurveEditorOpen] = useState(false)
  const savedPath = useRef<AnimationTweenOptions['path']>(undefined)
  const drawnPath = options.path !== undefined
  const pathReady = !drawnPath || Boolean(options.path?.some((point) => point.x !== 0 || point.y !== 0))
  const layer = document.layers.find((item) => item.id === layerId)
  const sourcePlan = useMemo(() => {
    try { return { value: animationTweenSource(document, frameId, layerId, options), error: '' } }
    catch (cause) { return { value: null, error: cause instanceof Error ? cause.message : String(cause) } }
  }, [document, frameId, layerId, options.scope, options.loopSectionId, options.betweenMode, options.layerScope, selectedLayerIds, selectedGroupIds, loopSections, revision])
  const previewFrameId = sourcePlan.value ? animationTweenSourceFrameId(sourcePlan.value, options, Math.round(progress * previewSteps)) : frameId
  const source = animationTweenSourceSurface(document, layerId, previewFrameId)
  const endpointShape = useMemo(() => {
    if (!between && endpointEnabled && !pathEditorOpen && sourcePlan.value) {
      try {
        if (sourcePlan.value.layerIds.length > 1) {
          const selected = { ...document, layers: document.layers.map((item) => {
            const shared = shareRasterLayer(item)
            shared.visible = item.visible && sourcePlan.value!.layers.has(item.id)
            return shared
          }) }
          const endpointOptions = { ...options, offsetX: 0, offsetY: 0, path: undefined }
          const bounds = animationTweenPreviewBounds(selected, layerId, sourcePlan.value, endpointOptions)
          const endpoint = animationTweenCompositePreview(selected, sourcePlan.value, endpointOptions, options.frameCount, bounds)
          return { preview: { canvas: tweenPreviewCanvas(endpoint, document.palette), offsetX: endpoint.offsetX, offsetY: endpoint.offsetY }, error: '' }
        }
        const endpointFrameId = animationTweenSourceFrameId(sourcePlan.value, options, options.frameCount)
        const endpointSource = animationTweenSourceSurface(document, sourcePlan.value.layerIds[0], endpointFrameId)
        if (endpointSource && rasterContentBounds(endpointSource, document.palette)) {
          // Translation only moves the cached bitmap; dragging never rerasterizes it.
          const endpoint = tweenSurface(cropTweenSource(endpointSource, document.palette), sourcePlan.value.pivot, {
            ...DEFAULT_ANIMATION_TWEEN, rotation: options.rotation, scale: options.scale, offsetX: 0, offsetY: 0
          }, 1, 1024 * 1024)
          return { preview: { canvas: tweenPreviewCanvas(endpoint, document.palette), offsetX: endpoint.offsetX, offsetY: endpoint.offsetY }, error: '' }
        }
      } catch (cause) { return { preview: null, error: cause instanceof Error ? cause.message : String(cause) } }
    }
    return { preview: null, error: '' }
  }, [between, endpointEnabled, pathEditorOpen, sourcePlan, document, layerId, options.scope, options.frameCount, options.rotation, options.scale])
  useEffect(() => {
    if (endpointShape.preview) publishAnimationTweenPreview(document.id, {
      ...endpointShape.preview,
      offsetX: endpointShape.preview.offsetX + tweenTranslation(options, 1).x,
      offsetY: endpointShape.preview.offsetY + tweenTranslation(options, 1).y,
      move: drawnPath ? undefined : { owner: endpointOwner.current, x: options.offsetX, y: options.offsetY, onChange: (offsetX, offsetY) => {
        setPlaying(false)
        setOptions((current) => ({ ...current, offsetX, offsetY }))
      } }
    })
    return () => publishAnimationTweenPreview(document.id, null)
  }, [endpointShape, document.id, options.offsetX, options.offsetY, options.path, drawnPath])
  const togglePlayback = (): void => {
    if (playing) { setPlaying(false); return }
    const frame = Math.round(progress * previewSteps)
    playbackStartRef.current = frame >= previewSteps ? 0 : frame
    setProgress(playbackStartRef.current / previewSteps)
    setPlaying(true)
  }
  useEffect(() => {
    if (!playing) return
    const startedAt = performance.now()
    let request = 0
    const advance = (now: number): void => {
      const frame = playbackStartRef.current + Math.floor((now - startedAt) / options.duration)
      setProgress(Math.min(previewSteps, frame) / previewSteps)
      if (frame >= previewSteps) { setPlaying(false); return }
      request = window.requestAnimationFrame(advance)
    }
    request = window.requestAnimationFrame(advance)
    return () => window.cancelAnimationFrame(request)
  }, [playing, options.duration, previewSteps])
  const pivot = sourcePlan.value?.pivot ?? { x: 0, y: 0, width: document.width, height: document.height }
  const previewBounds = useMemo(() => sourcePlan.value
    ? animationTweenPreviewBounds(document, layerId, sourcePlan.value, options) : pivot,
  [sourcePlan, document, layerId, options, revision])
  const zoom = Math.min(460 / previewBounds.width, 250 / previewBounds.height)
  const originX = 240 - (previewBounds.x + previewBounds.width / 2) * zoom
  const originY = 135 - (previewBounds.y + previewBounds.height / 2) * zoom
  useEffect(() => {
    const context = canvasRef.current?.getContext('2d')
    if (!context) return
    drawTweenCheckerboard(context, 480, 270, checkerboard, zoom, originX, originY)
    if (drawnPath && options.path?.length) drawTweenPixelPath(context, options.path.map(point => ({
      x: (options.pathAnchor?.x ?? Math.floor(pivot.x + pivot.width / 2)) + point.x,
      y: (options.pathAnchor?.y ?? Math.floor(pivot.y + pivot.height / 2)) + point.y
    })), 480, 270, { zoom, originX, originY })
    setError('')
    if (!sourcePlan.value) return
    try {
      const transformed = animationTweenCompositePreview(document, sourcePlan.value, options, Math.round(progress * previewSteps), previewBounds)
      const buffer = tweenPreviewCanvas(transformed, document.palette)
      context.imageSmoothingEnabled = false
      context.globalAlpha = 1
      context.drawImage(buffer, originX + transformed.offsetX * zoom, originY + transformed.offsetY * zoom, transformed.width * zoom, transformed.height * zoom)
      context.globalAlpha = 1
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
  }, [source, sourcePlan, document.palette, document.width, document.height, options, progress, checkerboard, zoom, originX, originY, drawnPath])
  const fields = [
    ['frameCount', 1, 120, 1, ''], ['duration', 1, 60000, 1, 'ms'],
    ['offsetX', -16384, 16384, 1, 'px'], ['offsetY', -16384, 16384, 1, 'px'],
    ['rotation', -3600, 3600, 1, '°'], ['scale', 1, 1000, 1, '%'], ['opacity', 0, 100, 1, '%']
  ] as const
  return <>{createPortal(<div className="modal-backdrop dialog-backdrop" role="presentation">
    <ModalShell as="form" data-preserve-animation-selection storageKey="animation-tween" className="layer-modal animation-tween-modal" defaultWidth={520} defaultHeight={820} minWidth={420} minHeight={360} fitContent={false} onSubmit={(event) => {
      event.preventDefault()
      if (!pathReady || pathEditorOpen || curveEditorOpen) return
      if (useWorkspace.getState().generateAnimationTween(document.id, frameId, layerId, options)) onClose()
      else setError(useWorkspace.getState().message ?? t('timeline.tween.invalid'))
    }}>
      <DialogHeader eyebrow="ANIMATION" title={t('timeline.tween.title')} closeLabel={t('common.close')} onClose={onClose} />
      <div className="modal-body animation-tween-body component-scrollbar">
        <div className="animation-tween-fields">
          <FormField label={t('timeline.tween.layerScope')}><ThemedSelect<'current' | 'selected' | 'all'> label={t('timeline.tween.layerScope')} value={options.layerScope ?? 'current'} preserveAnimationSelection groups={[{ label: t('timeline.tween.layerScope'), options: [
            { value: 'current', label: t('timeline.tween.currentLayer') }, { value: 'selected', label: t('timeline.tween.selectedLayers') }, { value: 'all', label: t('timeline.tween.allLayers') }
          ] }]} onChange={(layerScope) => { setPlaying(false); setProgress(0); setError(''); setOptions((current) => ({ ...current, layerScope })) }} /></FormField>
          <FormField label={t('timeline.tween.scope')}><ThemedSelect<'frame' | 'loop' | 'between'> label={t('timeline.tween.scope')} value={options.scope ?? 'frame'} preserveAnimationSelection groups={[{ label: t('timeline.tween.scope'), options: [
            { value: 'frame', label: t('timeline.tween.scopeFrame') }, { value: 'loop', label: t('timeline.tween.scopeLoop') }, { value: 'between', label: t('timeline.tween.scopeBetween') }
          ] }]} onChange={(scope) => { setPlaying(false); setProgress(0); setError(''); setOptions((current) => ({ ...current, scope })) }} /></FormField>
          {between && <FormField label={t('timeline.tween.betweenMode')}><ThemedSelect<'morph' | 'crossfade'> label={t('timeline.tween.betweenMode')} value={options.betweenMode ?? 'morph'} preserveAnimationSelection groups={[{ label: t('timeline.tween.betweenMode'), options: [
            { value: 'morph', label: t('timeline.tween.morph') }, { value: 'crossfade', label: t('timeline.tween.crossfade') }
          ] }]} onChange={(betweenMode) => { setPlaying(false); setProgress(0); setError(''); setOptions((current) => ({ ...current, betweenMode })) }} /></FormField>}
          {options.scope === 'loop' && <FormField label={t('timeline.tween.loopSection')}><ThemedSelect label={t('timeline.tween.loopSection')} value={options.loopSectionId ?? ''} preserveAnimationSelection disabled={!document.animation?.loopSections?.length} groups={[{ label: t('timeline.tween.loopSection'), options: (document.animation?.loopSections ?? []).map((section) => ({ value: section.id, label: section.name })) }]} onChange={(loopSectionId) => { setPlaying(false); setProgress(0); setError(''); setOptions((current) => ({ ...current, loopSectionId })) }} /></FormField>}
        </div>
        <p className="modal-note">{t('timeline.tween.layerScopeHint', { count: sourcePlan.value?.layerIds.length ?? 0 })}</p>
        <p className="modal-note animation-tween-intro">{between ? t(options.betweenMode === 'crossfade' ? 'timeline.tween.betweenHint' : 'timeline.tween.morphHint', { layer: sourcePlan.value?.layerIds.map((id) => document.layers.find((item) => item.id === id)?.name).join('、') ?? layer?.name ?? '' }) : options.scope === 'loop' ? t('timeline.tween.loopHint', { layer: sourcePlan.value?.layerIds.map((id) => document.layers.find((item) => item.id === id)?.name).join('、') ?? layer?.name ?? '' }) : t('timeline.tween.hint', { layer: sourcePlan.value?.layerIds.map((id) => document.layers.find((item) => item.id === id)?.name).join('、') ?? layer?.name ?? '', frame: (document.animation?.frames.findIndex((frame) => frame.id === frameId) ?? 0) + 1 })}</p>
        {([['timing', fields.slice(0, 2)], ['transform', fields.slice(2)]] as const).map(([section, sectionFields]) => between && section === 'transform' ? null : <section className="animation-tween-section" key={section} aria-label={t(`timeline.tween.${section}`)}>
          <SettingsSectionHeader title={t(`timeline.tween.${section}`)} />
          <div className="animation-tween-fields">
          {sectionFields.map(([key, min, max, step, suffix]) => <FormField key={key} label={t(between && key === 'frameCount' ? 'timeline.tween.betweenCount' : `timeline.tween.${key}`)}><NumberInput aria-label={t(between && key === 'frameCount' ? 'timeline.tween.betweenCount' : `timeline.tween.${key}`)} disabled={drawnPath && (key === 'offsetX' || key === 'offsetY')} value={options[key]} min={min} max={max} step={step} suffix={suffix} onValueChange={(value) => { setPlaying(false); setOptions((current) => ({ ...current, [key]: Math.round(value) })) }} /></FormField>)}
          {(section === 'transform' || between) && <FormField label={t('timeline.tween.easing')}><ThemedSelect<TweenEasing> label={t('timeline.tween.easing')} value={options.easing} preserveAnimationSelection groups={[{ label: t('timeline.tween.easing'), options: (['linear', 'ease-in', 'ease-out', 'ease-in-out', 'custom'] as const).map((value) => ({ value, label: t(`timeline.tween.${value}`) })) }]} onChange={(easing) => { setPlaying(false); setOptions((current) => ({ ...current, easing })) }} /></FormField>}
          </div>
        </section>)}
        <p className="modal-note">{t('timeline.tween.totalDuration', { count: options.frameCount, duration: options.duration, total: (options.frameCount * options.duration / 1000).toFixed(2) })}</p>
        <button type="button" className="quiet-button" onClick={() => { setPlaying(false); setCurveEditorOpen(true) }}>{t('timeline.tween.curveEdit')}</button>
        {!between && <FormField label={t('timeline.tween.pathMode')}><ThemedSelect<'linear' | 'drawn'> label={t('timeline.tween.pathMode')} value={drawnPath ? 'drawn' : 'linear'} preserveAnimationSelection groups={[{ label: t('timeline.tween.pathMode'), options: [
          { value: 'linear', label: t('timeline.tween.pathLinear') }, { value: 'drawn', label: t('timeline.tween.pathDrawn') }
        ] }]} onChange={(mode) => { setPlaying(false); setProgress(0); if (options.path) savedPath.current = options.path; setOptions((current) => ({ ...current, path: mode === 'drawn' ? savedPath.current ?? [{ x: 0, y: 0 }] : undefined })); if (mode === 'drawn') setPathEditorOpen(true) }} /></FormField>}
        {drawnPath && <button type="button" className="quiet-button" onClick={() => { setPlaying(false); setPathEditorOpen(true) }}>{t('timeline.tween.pathEdit')}</button>}
        <PreferenceToggle label={t('timeline.tween.autoCropCanvas')} tooltip={t('timeline.tween.autoCropCanvasHint')} checked={options.autoCropCanvas === true} onChange={(autoCropCanvas) => setOptions(current => ({ ...current, autoCropCanvas }))} />
        <section className="timelapse-preview animation-tween-preview" aria-label={t('timelapse.preview')}>
          <div className="timelapse-preview-frame"><canvas ref={canvasRef} width={480} height={270} aria-label={t('timelapse.preview')} /></div>
          <PreviewPlaybackControls playing={playing} frame={Math.round(progress * previewSteps)} frameCount={previewSteps + 1} onToggle={togglePlayback} onSeek={(frame) => { setPlaying(false); setProgress(frame / previewSteps) }} />
        </section>
        <p className="modal-note animation-tween-preview-note">{t('timeline.tween.preview')}</p>
        {!between && endpointEnabled && !drawnPath && <p className="modal-note">{t('timeline.tween.dragEndpoint')}</p>}
        {(sourcePlan.error || error || endpointShape.error) && <p className="modal-note animation-tween-error" role="alert">{sourcePlan.error || error || endpointShape.error}</p>}
      </div>
      <footer>{!between && <LivePreviewToggle checked={endpointEnabled} onChange={setEndpointEnabled} label={t('timeline.tween.previewEndpoint')} />}<span className="modal-footer-spacer" /><button type="button" className="quiet-button" onClick={onClose}>{t('common.cancel')}</button><button type="submit" className="primary-button" disabled={!sourcePlan.value || !pathReady}>{t('timeline.tween.generate')}</button></footer>
    </ModalShell>
  </div>, globalThis.document.body)}
  {curveEditorOpen && <TweenEasingDialog easing={options.easing} curve={options.easingCurve} frameCount={options.frameCount}
    onCancel={() => setCurveEditorOpen(false)}
    onApply={(easing, easingCurve) => { setOptions(current => ({ ...current, easing, easingCurve })); setCurveEditorOpen(false) }} />}
  {pathEditorOpen && sourcePlan.value && <AnimationTweenPathEditor
    initialPath={options.path ?? [{ x: 0, y: 0 }]} initialAnchor={options.pathAnchor}
    source={animationTweenSourceSurface(document, layerId, animationTweenSourceFrameId(sourcePlan.value, options, 0))}
    palette={document.palette} pivot={sourcePlan.value.pivot} documentSize={document}
    onCancel={() => setPathEditorOpen(false)}
    onApply={(path, pathAnchor) => { savedPath.current = path; setOptions((current) => ({ ...current, path, pathAnchor })); setProgress(1); setPathEditorOpen(false) }} />}
  </>
}
