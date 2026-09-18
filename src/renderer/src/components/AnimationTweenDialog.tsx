import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { SpriteDocument } from '@shared/types-document'
import { animationCelAt, resolveAnimationCel } from '@/core/animation'
import { DEFAULT_ANIMATION_TWEEN, animationTweenSource, animationTweenSourceFrameId, animationTweenSourceSurface, cropTweenSource, tweenProgress, tweenSurface, type AnimationTweenOptions, type TweenEasing } from '@/core/animation-tween'
import { animationLoopSectionAtFrame } from '@/core/animation-loop-sections'
import { rasterContentBounds } from '@/core/document-model'
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
import { LivePreviewToggle } from './LivePreviewToggle'
import { drawTweenCheckerboard, publishAnimationTweenPreview, tweenPreviewCanvas } from './animation-tween-preview'

export function AnimationTweenDialog({ document, frameId, layerId, onClose }: {
  document: SpriteDocument; frameId: string; layerId: string; onClose(): void
}) {
  const { t } = useI18n()
  const loopSections = useWorkspace((state) => state.sessions.find((session) => session.document.id === document.id)?.document.animation?.loopSections) ?? document.animation?.loopSections
  const revision = useWorkspace((state) => state.sessions.find((session) => session.document.id === document.id)?.revision)
  const [draftOptions, setOptions] = useState<AnimationTweenOptions>(() => ({
    ...DEFAULT_ANIMATION_TWEEN, scope: 'frame',
    loopSectionId: document.animation ? animationLoopSectionAtFrame(document.animation, frameId)?.id ?? document.animation.loopSections?.[0]?.id : undefined,
    duration: document.animation?.frames.find((frame) => frame.id === frameId)?.duration ?? 100
  }))
  // A dialog may stay open while loops are created, edited, deleted or restored.
  // Resolve the same valid ID for the select, preview and generation command.
  const options = useMemo<AnimationTweenOptions>(() => ({
    ...draftOptions,
    loopSectionId: loopSections?.some((section) => section.id === draftOptions.loopSectionId) ? draftOptions.loopSectionId
      : (document.animation ? animationLoopSectionAtFrame(document.animation, frameId)?.id : undefined) ?? loopSections?.[0]?.id
  }), [draftOptions, loopSections, document, frameId])
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
  const layer = document.layers.find((item) => item.id === layerId)
  const sourcePlan = useMemo(() => {
    try { return { value: animationTweenSource(document, frameId, layerId, options), error: '' } }
    catch (cause) { return { value: null, error: cause instanceof Error ? cause.message : String(cause) } }
  }, [document, frameId, layerId, options.scope, options.loopSectionId, loopSections, revision])
  const previewFrameId = sourcePlan.value ? animationTweenSourceFrameId(sourcePlan.value, options, Math.round(progress * options.frameCount)) : frameId
  const cel = document.animation ? resolveAnimationCel(document.animation, animationCelAt(document.animation, layerId, previewFrameId)) : null
  const source = animationTweenSourceSurface(document, layerId, previewFrameId)
  const endpointShape = useMemo(() => {
    if (endpointEnabled && sourcePlan.value) {
      try {
        const endpointFrameId = animationTweenSourceFrameId(sourcePlan.value, options, options.frameCount)
        const endpointSource = animationTweenSourceSurface(document, layerId, endpointFrameId)
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
  }, [endpointEnabled, sourcePlan, document, layerId, options.scope, options.frameCount, options.rotation, options.scale])
  useEffect(() => {
    if (endpointShape.preview) publishAnimationTweenPreview(document.id, {
      ...endpointShape.preview,
      offsetX: endpointShape.preview.offsetX + options.offsetX,
      offsetY: endpointShape.preview.offsetY + options.offsetY,
      move: { owner: endpointOwner.current, x: options.offsetX, y: options.offsetY, onChange: (offsetX, offsetY) => {
        setPlaying(false)
        setOptions((current) => ({ ...current, offsetX, offsetY }))
      } }
    })
    return () => publishAnimationTweenPreview(document.id, null)
  }, [endpointShape, document.id, options.offsetX, options.offsetY])
  const togglePlayback = (): void => {
    if (playing) { setPlaying(false); return }
    const frame = Math.round(progress * options.frameCount)
    playbackStartRef.current = frame >= options.frameCount ? 0 : frame
    setProgress(playbackStartRef.current / options.frameCount)
    setPlaying(true)
  }
  useEffect(() => {
    if (!playing) return
    const startedAt = performance.now()
    let request = 0
    const advance = (now: number): void => {
      const frame = playbackStartRef.current + Math.floor((now - startedAt) / options.duration)
      setProgress(Math.min(options.frameCount, frame) / options.frameCount)
      if (frame >= options.frameCount) { setPlaying(false); return }
      request = window.requestAnimationFrame(advance)
    }
    request = window.requestAnimationFrame(advance)
    return () => window.cancelAnimationFrame(request)
  }, [playing, options.duration, options.frameCount])
  useEffect(() => {
    const context = canvasRef.current?.getContext('2d')
    if (!context) return
    // The checkerboard and artwork share the same document origin and zoom.
    const pivot = sourcePlan.value?.pivot ?? { x: 0, y: 0, width: document.width, height: document.height }
    const radius = Math.hypot(pivot.width, pivot.height) * Math.max(1, options.scale / 100)
    const zoom = Math.min(460 / (radius + Math.abs(options.offsetX)), 250 / (radius + Math.abs(options.offsetY)))
    const centerX = pivot.x + pivot.width / 2 + options.offsetX / 2
    const centerY = pivot.y + pivot.height / 2 + options.offsetY / 2
    const originX = 240 - centerX * zoom, originY = 135 - centerY * zoom
    drawTweenCheckerboard(context, 480, 270, checkerboard, zoom, originX, originY)
    setError('')
    if (!source || !sourcePlan.value || !rasterContentBounds(source, document.palette)) return
    try {
      const cropped = cropTweenSource(source, document.palette)
      const transformed = tweenSurface(cropped, pivot, options, progress, 1024 * 1024)
      const buffer = tweenPreviewCanvas(transformed, document.palette)
      context.imageSmoothingEnabled = false
      context.globalAlpha = (cel?.opacity ?? layer?.opacity ?? 1) * (1 + (options.opacity / 100 - 1) * tweenProgress(progress, options.easing))
      context.drawImage(buffer, originX + transformed.offsetX * zoom, originY + transformed.offsetY * zoom, transformed.width * zoom, transformed.height * zoom)
      context.globalAlpha = 1
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
  }, [source, sourcePlan, cel?.opacity, layer?.opacity, document.palette, document.width, document.height, options, progress, checkerboard])
  const fields = [
    ['frameCount', 1, 120, 1, ''], ['duration', 1, 60000, 1, 'ms'],
    ['offsetX', -16384, 16384, 1, 'px'], ['offsetY', -16384, 16384, 1, 'px'],
    ['rotation', -3600, 3600, 1, '°'], ['scale', 1, 1000, 1, '%'], ['opacity', 0, 100, 1, '%']
  ] as const
  return createPortal(<div className="modal-backdrop dialog-backdrop" role="presentation">
    <ModalShell as="form" data-preserve-animation-selection storageKey="animation-tween" className="layer-modal animation-tween-modal" defaultWidth={520} defaultHeight={820} minWidth={420} minHeight={360} fitContent={false} onSubmit={(event) => {
      event.preventDefault()
      if (useWorkspace.getState().generateAnimationTween(document.id, frameId, layerId, options)) onClose()
      else setError(useWorkspace.getState().message ?? t('timeline.tween.invalid'))
    }}>
      <DialogHeader eyebrow="ANIMATION" title={t('timeline.tween.title')} closeLabel={t('common.close')} onClose={onClose} />
      <div className="modal-body animation-tween-body component-scrollbar">
        <div className="animation-tween-fields">
          <FormField label={t('timeline.tween.scope')}><ThemedSelect<'frame' | 'loop'> label={t('timeline.tween.scope')} value={options.scope ?? 'frame'} preserveAnimationSelection groups={[{ label: t('timeline.tween.scope'), options: [
            { value: 'frame', label: t('timeline.tween.scopeFrame') }, { value: 'loop', label: t('timeline.tween.scopeLoop') }
          ] }]} onChange={(scope) => { setPlaying(false); setProgress(0); setError(''); setOptions((current) => ({ ...current, scope })) }} /></FormField>
          {options.scope === 'loop' && <FormField label={t('timeline.tween.loopSection')}><ThemedSelect label={t('timeline.tween.loopSection')} value={options.loopSectionId ?? ''} preserveAnimationSelection disabled={!document.animation?.loopSections?.length} groups={[{ label: t('timeline.tween.loopSection'), options: (document.animation?.loopSections ?? []).map((section) => ({ value: section.id, label: section.name })) }]} onChange={(loopSectionId) => { setPlaying(false); setProgress(0); setError(''); setOptions((current) => ({ ...current, loopSectionId })) }} /></FormField>}
        </div>
        <p className="modal-note animation-tween-intro">{options.scope === 'loop' ? t('timeline.tween.loopHint', { layer: layer?.name ?? '' }) : t('timeline.tween.hint', { layer: layer?.name ?? '', frame: (document.animation?.frames.findIndex((frame) => frame.id === frameId) ?? 0) + 1 })}</p>
        {([['timing', fields.slice(0, 2)], ['transform', fields.slice(2)]] as const).map(([section, sectionFields]) => <section className="animation-tween-section" key={section} aria-label={t(`timeline.tween.${section}`)}>
          <SettingsSectionHeader title={t(`timeline.tween.${section}`)} />
          <div className="animation-tween-fields">
          {sectionFields.map(([key, min, max, step, suffix]) => <FormField key={key} label={t(`timeline.tween.${key}`)}><NumberInput aria-label={t(`timeline.tween.${key}`)} value={options[key]} min={min} max={max} step={step} suffix={suffix} onValueChange={(value) => { setPlaying(false); setOptions((current) => ({ ...current, [key]: Math.round(value) })) }} /></FormField>)}
          {section === 'transform' && <FormField label={t('timeline.tween.easing')}><ThemedSelect<TweenEasing> label={t('timeline.tween.easing')} value={options.easing} preserveAnimationSelection groups={[{ label: t('timeline.tween.easing'), options: (['linear', 'ease-in', 'ease-out', 'ease-in-out'] as const).map((value) => ({ value, label: t(`timeline.tween.${value}`) })) }]} onChange={(easing) => { setPlaying(false); setOptions((current) => ({ ...current, easing })) }} /></FormField>}
          </div>
        </section>)}
        <section className="timelapse-preview animation-tween-preview" aria-label={t('timelapse.preview')}>
          <div className="timelapse-preview-frame"><canvas ref={canvasRef} width={480} height={270} /></div>
          <PreviewPlaybackControls playing={playing} frame={Math.round(progress * options.frameCount)} frameCount={options.frameCount + 1} onToggle={togglePlayback} onSeek={(frame) => { setPlaying(false); setProgress(frame / options.frameCount) }} />
        </section>
        <p className="modal-note animation-tween-preview-note">{t('timeline.tween.preview')}</p>
        {endpointEnabled && <p className="modal-note">{t('timeline.tween.dragEndpoint')}</p>}
        {(sourcePlan.error || error || endpointShape.error) && <p className="modal-note animation-tween-error" role="alert">{sourcePlan.error || error || endpointShape.error}</p>}
      </div>
      <footer><LivePreviewToggle checked={endpointEnabled} onChange={setEndpointEnabled} label={t('timeline.tween.previewEndpoint')} /><span className="modal-footer-spacer" /><button type="button" className="quiet-button" onClick={onClose}>{t('common.cancel')}</button><button type="submit" className="primary-button" disabled={!sourcePlan.value}>{t('timeline.tween.generate')}</button></footer>
    </ModalShell>
  </div>, globalThis.document.body)
}
