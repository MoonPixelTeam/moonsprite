import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { RgbaColor } from '@shared/types-color'
import type { ToolId } from '@shared/types-brush'
import { ColorValueControl } from './ColorValueControl'
import { DialogHeader } from './DialogHeader'
import { FormField } from './FormField'
import { CANVAS_COLOR_SAMPLED_EVENT, CANVAS_COLOR_SAMPLING_COMPLETED_EVENT, type CanvasColorSampledDetail } from './color-sampling-events'
import { LivePreviewToggle } from './LivePreviewToggle'
import { ModalShell } from './ModalShell'
import { PixelUtilityIcon } from './PixelUtilityIcon'
import { ThemedSelect } from './ThemedSelect'
import { useI18n } from './I18nProvider'
import { normalEditorToolIconFor, PixelAssetIcon, TOOL_DEFINITIONS } from './app/editor-tools'
import { colorEquals } from '@/core/raster'
import { useWorkspace, type ColorReplacementPreview, type ColorReplacementTarget } from '@/store/workspace'

type DialogTarget = Exclude<ColorReplacementTarget, 'layer'>
type SamplingTarget = 'source' | 'replacement'

const copyColor = (color: RgbaColor): RgbaColor => ({ ...color })
const WHITE: RgbaColor = { r: 255, g: 255, b: 255, a: 255 }
const eyedropperLargeIcon = TOOL_DEFINITIONS.find((tool) => tool.id === 'eyedropper')?.icon ?? ''
const eyedropperIcon = normalEditorToolIconFor(eyedropperLargeIcon) ?? eyedropperLargeIcon

export function ColorReplacementDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n()
  const sessions = useWorkspace((state) => state.sessions)
  const activeId = useWorkspace((state) => state.activeId)
  const session = sessions.find((item) => item.document.id === activeId) ?? null
  const documentId = useRef(session?.document.id ?? null)
  // Each dialog mount starts from the editor's two active swatches. Keep the
  // values local afterwards so sampling and manual edits remain independent.
  const [sourceColor, setSourceColor] = useState<RgbaColor>(() => copyColor(session?.primaryColor ?? WHITE))
  const [replacementColor, setReplacementColor] = useState<RgbaColor>(() => copyColor(session?.secondaryColor ?? WHITE))
  const [target, setTarget] = useState<DialogTarget>('layers')
  // Replacement previews are opt-in because large documents and multi-frame
  // targets can make each parameter change expensive.
  const [previewEnabled, setPreviewEnabled] = useState(false)
  const [samplingTarget, setSamplingTarget] = useState<SamplingTarget | null>(null)
  const samplingTargetRef = useRef<SamplingTarget | null>(null)
  const samplingReturnToolRef = useRef<ToolId | null>(null)
  const previewRef = useRef<ColorReplacementPreview | null>(null)
  const previewFrameRef = useRef<number | null>(null)
  const closedRef = useRef(false)

  const targetAvailability = {
    document: Boolean(session),
    selection: Boolean(session?.selection),
    layers: Boolean(session?.selectedLayerIds.length),
    frames: Boolean(session?.selectedAnimationFrameIds.length),
    cells: Boolean(session?.selectedAnimationCellKeys.length),
    palette: Boolean(session?.document.palette.some((entry) => entry.id !== 0))
  }
  const loopSections = session?.document.animation?.loopSections ?? []
  const animationFrames = session?.document.animation?.frames ?? []
  const selectedLoopSection = target.startsWith('loop-section:')
    ? loopSections.find((section) => section.id === target.slice('loop-section:'.length)) ?? null
    : null
  const loopSectionFrameCount = selectedLoopSection && session?.document.animation
    ? (() => {
      const start = animationFrames.findIndex((frame) => frame.id === selectedLoopSection.startFrameId)
      const end = animationFrames.findIndex((frame) => frame.id === selectedLoopSection.endFrameId)
      return start >= 0 && end >= 0 ? Math.abs(end - start) + 1 : 0
    })()
    : 0
  const targetCount = target === 'layers'
    ? session?.selectedLayerIds.length ?? 0
    : target === 'frames'
      ? session?.selectedAnimationFrameIds.length ?? 0
      : target === 'cells'
        ? session?.selectedAnimationCellKeys.length ?? 0
        : target === 'selection'
          ? session?.selection ? 1 : 0
        : target === 'palette'
          ? session?.document.palette.filter((entry) => entry.id !== 0).length ?? 0
          : selectedLoopSection ? loopSectionFrameCount * (session?.document.layers.length ?? 0) : session?.document.layers.length ?? 0
  const targetAvailable = selectedLoopSection
    ? true
    : targetAvailability[target as Exclude<DialogTarget, `loop-section:${string}`>]
  const replacementDisabled = !session || !targetAvailable || colorEquals(sourceColor, replacementColor)
  const targetSelectionKey = target === 'layers'
    ? session?.selectedLayerIds.join('\u0000') ?? ''
    : target === 'frames'
      ? session?.selectedAnimationFrameIds.join('\u0000') ?? ''
      : target === 'cells'
        ? session?.selectedAnimationCellKeys.join('\u0000') ?? ''
        : target === 'selection'
          ? session?.selection
            ? `${session.selection.x}:${session.selection.y}:${session.selection.width}:${session.selection.height}`
            : ''
          : target === 'palette'
            ? session?.document.paletteOrder.join('\u0000') ?? ''
            : selectedLoopSection
              ? `${target}:${selectedLoopSection.startFrameId}:${selectedLoopSection.endFrameId}`
          : session?.document.id ?? ''

  const targetOptions: Array<{ value: DialogTarget; label: string; description: string }> = ([
    ['document', 'colorReplacement.target.document', 'colorReplacement.target.documentHint'],
    ['selection', 'colorReplacement.target.selection', 'colorReplacement.target.selectionHint'],
    ['layers', 'colorReplacement.target.layers', 'colorReplacement.target.layersHint'],
    ['frames', 'colorReplacement.target.frames', 'colorReplacement.target.framesHint'],
    ['cells', 'colorReplacement.target.cells', 'colorReplacement.target.cellsHint'],
    ['palette', 'colorReplacement.target.palette', 'colorReplacement.target.paletteHint']
  ] as const).map(([value, label, description]) => ({ value, label: t(label), description: t(description) }))
  targetOptions.push(...loopSections.map((section) => ({
    value: `loop-section:${section.id}` as DialogTarget,
    label: t('colorReplacement.target.loopSection', { name: section.name }),
    description: t('timeline.loopSectionSummary', {
      name: section.name,
      start: animationFrames.findIndex((frame) => frame.id === section.startFrameId) + 1,
      end: animationFrames.findIndex((frame) => frame.id === section.endFrameId) + 1,
      direction: t(section.direction === 'reverse' ? 'timeline.loopSectionReverse' : 'timeline.loopSectionForward'),
      repeats: section.repeatCount ?? t('timeline.loopSectionInfiniteShort')
    })
  })))
  const targetGroups = [{ label: t('colorReplacement.target'), options: targetOptions }]

  const cancelScheduledPreview = (): void => {
    if (previewFrameRef.current === null) return
    window.cancelAnimationFrame(previewFrameRef.current)
    previewFrameRef.current = null
  }
  const restorePreview = (): void => {
    if (!previewRef.current) return
    useWorkspace.getState().restoreColorReplacementPreview(previewRef.current)
    previewRef.current = null
  }
  const changeSourceColor = (color: RgbaColor): void => {
    cancelScheduledPreview()
    useWorkspace.getState().setPrimaryColor(color)
    setSourceColor(copyColor(color))
  }
  const changeReplacementColor = (color: RgbaColor): void => {
    cancelScheduledPreview()
    setReplacementColor(copyColor(color))
  }
  const beginSampling = (nextTarget: SamplingTarget): void => {
    if (samplingTargetRef.current === nextTarget) {
      finishSampling()
      return
    }
    if (!samplingTargetRef.current) {
      const workspace = useWorkspace.getState()
      samplingReturnToolRef.current = workspace.sessions.find((item) => item.document.id === workspace.activeId)?.tool ?? null
    }
    samplingTargetRef.current = nextTarget
    setSamplingTarget(nextTarget)
    useWorkspace.getState().setTool('eyedropper')
  }
  const finishSampling = (): void => {
    if (!samplingTargetRef.current) return
    samplingTargetRef.current = null
    setSamplingTarget(null)
    const returnTool = samplingReturnToolRef.current
    samplingReturnToolRef.current = null
    if (returnTool && returnTool !== 'eyedropper') useWorkspace.getState().setTool(returnTool)
  }
  const cancel = (): void => {
    if (closedRef.current) return
    closedRef.current = true
    finishSampling()
    cancelScheduledPreview()
    restorePreview()
    onClose()
  }
  const apply = (event: FormEvent): void => {
    event.preventDefault()
    if (closedRef.current || replacementDisabled) return
    closedRef.current = true
    finishSampling()
    cancelScheduledPreview()
    restorePreview()
    useWorkspace.getState().replaceColor(target, sourceColor, replacementColor)
    onClose()
  }

  useEffect(() => {
    if (!session || session.document.id !== documentId.current) cancel()
  }, [session?.document.id])

  useEffect(() => {
    const sampled = (event: Event): void => {
      const sample = (event as CustomEvent<CanvasColorSampledDetail>).detail
      if (!samplingTargetRef.current || !sample?.color) return
      if (samplingTargetRef.current === 'source') changeSourceColor(sample.color)
      else changeReplacementColor(sample.color)
    }
    const completed = (): void => finishSampling()
    window.addEventListener(CANVAS_COLOR_SAMPLED_EVENT, sampled)
    window.addEventListener(CANVAS_COLOR_SAMPLING_COMPLETED_EVENT, completed)
    return () => {
      window.removeEventListener(CANVAS_COLOR_SAMPLED_EVENT, sampled)
      window.removeEventListener(CANVAS_COLOR_SAMPLING_COMPLETED_EVENT, completed)
    }
  }, [])

  useEffect(() => {
    if (session?.tool === 'eyedropper' || !samplingTargetRef.current) return
    samplingTargetRef.current = null
    setSamplingTarget(null)
  }, [session?.tool])

  useEffect(() => {
    cancelScheduledPreview()
    previewFrameRef.current = window.requestAnimationFrame(() => {
      previewFrameRef.current = null
      const workspace = useWorkspace.getState()
      if (!previewEnabled || replacementDisabled) {
        restorePreview()
        return
      }
      const nextPreview = workspace.previewColorReplacement(target, sourceColor, replacementColor, previewRef.current)
      if (nextPreview) nextPreview.primaryColor = copyColor(sourceColor)
      previewRef.current = nextPreview
      if (target !== 'palette') workspace.setPrimaryColor(sourceColor)
    })
    return cancelScheduledPreview
  }, [sourceColor, replacementColor, target, targetSelectionKey, previewEnabled, replacementDisabled])

  useEffect(() => () => {
    cancelScheduledPreview()
    restorePreview()
  }, [])

  if (!session) return null

  return <div className="modal-backdrop" role="presentation">
    <ModalShell as="form" data-preserve-animation-selection storageKey="color-replacement-v1" placement="right" defaultWidth={430} defaultHeight={390} minWidth={390} minHeight={340} maxWidth={600} maxHeight={680} className="color-replacement-modal" onSubmit={apply} role="dialog" aria-modal="true" aria-label={t('colorReplacement.title')}>
      <DialogHeader eyebrow="COLOR" title={t('colorReplacement.title')} closeLabel={t('common.close')} onClose={cancel} />
      <div className="modal-body color-replacement-body">
        <section className="color-replacement-section">
          <h3>{t('colorReplacement.colors')}</h3>
          <div className="color-replacement-colors">
            <FormField label={t('colorReplacement.source')}><span className="color-replacement-color-input"><ColorValueControl color={sourceColor} density="emphasized" onChange={changeSourceColor} label={t('colorReplacement.source')} roleLabel={t('colorReplacement.source')} storageKey="replace-color-source" fillWithColor inPalette={false} dismissOnFocusLoss preserveAnimationSelection /><button type="button" className={`icon-button color-replacement-eyedropper ${samplingTarget === 'source' ? 'selected' : ''}`} aria-label={t('colorReplacement.pickSource')} aria-pressed={samplingTarget === 'source'} onClick={() => beginSampling('source')}><PixelAssetIcon src={eyedropperIcon} /></button></span></FormField>
            <span className="color-replacement-direction" aria-hidden="true"><PixelUtilityIcon kind="right" scale={2} /></span>
            <FormField label={t('colorReplacement.replacement')}><span className="color-replacement-color-input"><ColorValueControl color={replacementColor} density="emphasized" onChange={changeReplacementColor} label={t('colorReplacement.replacement')} roleLabel={t('colorReplacement.replacement')} storageKey="replace-color-target" fillWithColor inPalette={false} dismissOnFocusLoss preserveAnimationSelection /><button type="button" className={`icon-button color-replacement-eyedropper ${samplingTarget === 'replacement' ? 'selected' : ''}`} aria-label={t('colorReplacement.pickReplacement')} aria-pressed={samplingTarget === 'replacement'} onClick={() => beginSampling('replacement')}><PixelAssetIcon src={eyedropperIcon} /></button></span></FormField>
          </div>
        </section>
        <section className="color-replacement-section">
          <h3>{t('colorReplacement.range')}</h3>
          <FormField className="color-replacement-target" layout="inline" label={t('colorReplacement.target')}><ThemedSelect value={target} groups={targetGroups} label={t('colorReplacement.target')} onChange={setTarget} popoverWidth={300} preserveAnimationSelection /></FormField>
          <small className={targetAvailable ? '' : 'is-unavailable'}>{targetAvailable ? t('colorReplacement.targetCount', { count: targetCount }) : t('colorReplacement.targetUnavailable')}</small>
        </section>
        <LivePreviewToggle className="color-replacement-preview" checked={previewEnabled} onChange={setPreviewEnabled} label={t('colorReplacement.preview')} />
      </div>
      <footer><button type="button" className="quiet-button" onClick={cancel}>{t('common.cancel')}</button><button type="submit" className="primary-button" disabled={replacementDisabled}><PixelUtilityIcon kind="refresh" />{t('colorReplacement.apply')}</button></footer>
    </ModalShell>
  </div>
}
