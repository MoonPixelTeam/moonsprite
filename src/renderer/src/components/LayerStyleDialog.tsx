import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { LayerGroup, LayerStyles, RasterLayer, RgbaColor } from '@shared/types'
import { cloneLayerStyles, createDefaultLayerStyles, MAX_LAYER_STYLE_SHADOW_OFFSET, MAX_LAYER_STYLE_SIZE, MAX_LAYER_STYLE_STROKE_SIZE, resolveLayerStyles } from '@/core/layer-styles'
import { useWorkspace, type LayerPropertyTarget } from '@/store/workspace'
import { ColorValueControl } from './ColorValueControl'
import { DialogHeader } from './DialogHeader'
import { FormField } from './FormField'
import { GradientDitherSelect } from './GradientDitherSelect'
import { LivePreviewToggle } from './LivePreviewToggle'
import { ModalShell } from './ModalShell'
import { NumberInput } from './NumberInput'
import { PixelCheckbox } from './PixelCheckbox'
import { PixelUtilityIcon } from './PixelUtilityIcon'
import { PreferenceToggle } from './PreferenceToggle'
import { RangeField } from './RangeField'
import { OutlineStrokeControls } from './OutlineStrokeControls'
import { useI18n } from './I18nProvider'

type LayerStyleEffect = Exclude<keyof LayerStyles, 'enabled'>

const effectKeys: LayerStyleEffect[] = ['stroke', 'shadow', 'innerGlow', 'colorOverlay', 'gradientOverlay']
const effectLabelKeys = {
  stroke: 'layers.layerStyleStroke',
  shadow: 'layers.layerStyleShadow',
  innerGlow: 'layers.layerStyleInnerGlow',
  colorOverlay: 'layers.layerStyleColorOverlay',
  gradientOverlay: 'layers.layerStyleGradientOverlay'
} as const
export function LayerStyleDialog({ ownerKind, owner, targets, onClose }: { ownerKind: 'layer' | 'group'; owner: RasterLayer | LayerGroup; targets?: readonly LayerPropertyTarget[]; onClose: () => void }) {
  const { t } = useI18n()
  const previewLayerStyleEntries = useWorkspace((state) => state.previewLayerStyleEntries)
  const setLayerStylesForTargets = useWorkspace((state) => state.setLayerStylesForTargets)
  const targetsRef = useRef<LayerPropertyTarget[]>(targets?.length ? targets.map((target) => ({ ...target })) : [{ kind: ownerKind, id: owner.id }])
  const originalsRef = useRef(targetsRef.current.map((target) => {
    const session = useWorkspace.getState().sessions.find((item) => item.document.id === useWorkspace.getState().activeId)
    const targetOwner = target.kind === 'layer'
      ? session?.document.layers.find((layer) => layer.id === target.id)
      : session?.document.groups.find((group) => group.id === target.id)
    return { target, styles: cloneLayerStyles(targetOwner?.layerStyles) }
  }))
  const finalizedRef = useRef(false)
  const [draft, setDraft] = useState(() => resolveLayerStyles(owner.layerStyles))
  const [activeEffect, setActiveEffect] = useState<LayerStyleEffect>('stroke')
  const [previewEnabled, setPreviewEnabled] = useState(true)

  useEffect(() => () => {
    if (!finalizedRef.current) useWorkspace.getState().previewLayerStyleEntries(originalsRef.current)
  }, [])

  const previewDraft = (next: LayerStyles): void => {
    setDraft(next)
    if (previewEnabled) previewLayerStyleEntries(targetsRef.current.map((target) => ({ target, styles: next })))
  }
  const updateEffect = <K extends LayerStyleEffect>(effect: K, patch: Partial<LayerStyles[K]>): void => {
    previewDraft({ ...draft, [effect]: { ...draft[effect], ...patch } })
  }
  const updateColor = (effect: 'stroke' | 'shadow' | 'innerGlow' | 'colorOverlay', color: RgbaColor): void => updateEffect(effect, { color })
  const cancel = (): void => {
    previewLayerStyleEntries(originalsRef.current)
    finalizedRef.current = true
    onClose()
  }
  const apply = (): void => {
    previewLayerStyleEntries(originalsRef.current)
    setLayerStylesForTargets(targetsRef.current, draft)
    finalizedRef.current = true
    onClose()
  }
  const togglePreview = (enabled: boolean): void => {
    setPreviewEnabled(enabled)
    previewLayerStyleEntries(enabled
      ? targetsRef.current.map((target) => ({ target, styles: draft }))
      : originalsRef.current)
  }

  const editor = activeEffect === 'stroke'
    ? <>
        <PreferenceToggle className="layer-style-smart-toggle" label={t('layers.layerStyleSmartHue')} tooltip={t('layers.layerStyleSmartHueDescription')} checked={draft.stroke.smartHue} onChange={(smartHue) => updateEffect('stroke', { smartHue })} />
        {!draft.stroke.smartHue && <FormField label={t('layers.layerStyleColor')}><ColorValueControl color={draft.stroke.color} density="regular" onChange={(color) => updateColor('stroke', color)} label={t('layers.layerStyleStroke')} storageKey="layer-style-stroke" fillWithColor inPalette={false} /></FormField>}
        {draft.stroke.smartHue && <RangeField className="layer-style-smart-darkness" label={t('layers.layerStyleSmartHueDarkness')} min={0} max={100} suffix="%" value={draft.stroke.smartHueDarkness} onChange={(smartHueDarkness) => updateEffect('stroke', { smartHueDarkness })} />}
        <div className="layer-style-outline-controls"><OutlineStrokeControls variant="dialog" thickness={draft.stroke.size} maxThickness={MAX_LAYER_STYLE_STROKE_SIZE} position={draft.stroke.position} positions={['outside', 'inside', 'both']} kernel={draft.stroke.kernel} directions={draft.stroke.directions} onThicknessChange={(size) => updateEffect('stroke', { size })} onPositionChange={(position) => updateEffect('stroke', { position })} onPatternChange={(kernel, directions) => updateEffect('stroke', { kernel, directions })} /></div>
      </>
    : activeEffect === 'shadow'
      ? <>
          <PreferenceToggle className="layer-style-smart-toggle" label={t('layers.layerStyleSmartShadow')} tooltip={t('layers.layerStyleSmartShadowDescription')} checked={draft.shadow.smartShadow} onChange={(smartShadow) => updateEffect('shadow', { smartShadow })} />
          {!draft.shadow.smartShadow && <FormField label={t('layers.layerStyleColor')}><ColorValueControl color={draft.shadow.color} density="regular" onChange={(color) => updateColor('shadow', color)} label={t('layers.layerStyleShadow')} storageKey="layer-style-shadow" fillWithColor inPalette={false} /></FormField>}
          {draft.shadow.smartShadow && <RangeField className="layer-style-smart-darkness" label={t('layers.layerStyleSmartHueDarkness')} min={0} max={100} suffix="%" value={draft.shadow.smartShadowDarkness} onChange={(smartShadowDarkness) => updateEffect('shadow', { smartShadowDarkness })} />}
          <div className="layer-style-number-grid">
            <FormField label={t('layers.layerStyleOffsetX')}><NumberInput min={-MAX_LAYER_STYLE_SHADOW_OFFSET} max={MAX_LAYER_STYLE_SHADOW_OFFSET} suffix="px" value={draft.shadow.offsetX} onValueChange={(offsetX) => updateEffect('shadow', { offsetX })} /></FormField>
            <FormField label={t('layers.layerStyleOffsetY')}><NumberInput min={-MAX_LAYER_STYLE_SHADOW_OFFSET} max={MAX_LAYER_STYLE_SHADOW_OFFSET} suffix="px" value={draft.shadow.offsetY} onValueChange={(offsetY) => updateEffect('shadow', { offsetY })} /></FormField>
          </div>
          <RangeField label={t('layers.layerStyleBlur')} min={0} max={MAX_LAYER_STYLE_SIZE} suffix="px" value={draft.shadow.blur} onChange={(blur) => updateEffect('shadow', { blur })} />
        </>
      : activeEffect === 'innerGlow'
        ? <>
            <FormField label={t('layers.layerStyleColor')}><ColorValueControl color={draft.innerGlow.color} density="regular" onChange={(color) => updateColor('innerGlow', color)} label={t('layers.layerStyleInnerGlow')} storageKey="layer-style-inner-glow" fillWithColor inPalette={false} /></FormField>
            <RangeField label={t('layers.layerStyleSize')} min={1} max={MAX_LAYER_STYLE_SIZE} suffix="px" value={draft.innerGlow.size} onChange={(size) => updateEffect('innerGlow', { size })} />
          </>
        : activeEffect === 'colorOverlay'
          ? <FormField label={t('layers.layerStyleColor')}><ColorValueControl color={draft.colorOverlay.color} density="regular" onChange={(color) => updateColor('colorOverlay', color)} label={t('layers.layerStyleColorOverlay')} storageKey="layer-style-color-overlay" fillWithColor inPalette={false} /></FormField>
          : <>
              <div className="layer-style-number-grid">
                <FormField label={t('layers.layerStyleFromColor')}><ColorValueControl color={draft.gradientOverlay.from} density="regular" onChange={(from) => updateEffect('gradientOverlay', { from })} label={t('layers.layerStyleFromColor')} storageKey="layer-style-gradient-from" fillWithColor inPalette={false} /></FormField>
                <FormField label={t('layers.layerStyleToColor')}><ColorValueControl color={draft.gradientOverlay.to} density="regular" onChange={(to) => updateEffect('gradientOverlay', { to })} label={t('layers.layerStyleToColor')} storageKey="layer-style-gradient-to" fillWithColor inPalette={false} /></FormField>
              </div>
              <FormField label={t('toolOptions.gradientDither')}><GradientDitherSelect value={draft.gradientOverlay.dither} onChange={(dither) => updateEffect('gradientOverlay', { dither })} preserveAnimationSelection /></FormField>
              <RangeField label={t('layers.layerStyleAngle')} min={0} max={359} suffix="°" value={draft.gradientOverlay.angle} onChange={(angle) => updateEffect('gradientOverlay', { angle })} />
            </>

  return createPortal(<div className="modal-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) cancel() }}>
    <ModalShell as="form" data-preserve-animation-selection storageKey="layer-style-v1" defaultWidth={620} defaultHeight={470} minWidth={560} minHeight={420} maxWidth={760} maxHeight={680} className="layer-style-modal" onSubmit={(event) => { event.preventDefault(); apply() }} role="dialog" aria-label={t('layers.layerStyle')}>
      <DialogHeader title={targetsRef.current.length > 1 ? t('layers.multipleLayerStyleTitle') : t('layers.layerStyleTitle', { name: owner.name })} closeLabel={t('common.close')} onClose={cancel} />
      <div className="modal-body layer-style-dialog-body">
        <nav className="layer-style-effect-list component-scrollbar" aria-label={t('layers.layerStyleEffects')}>
          {effectKeys.map((effect) => <div key={effect} className={`layer-style-effect-row ${activeEffect === effect ? 'selected' : ''}`}>
            <PixelCheckbox checked={draft[effect].enabled} aria-label={t('layers.layerStyleToggleEffect', { effect: t(effectLabelKeys[effect]) })} onChange={(event) => { setActiveEffect(effect); updateEffect(effect, { enabled: event.target.checked }) }} />
            <button type="button" onClick={() => setActiveEffect(effect)}>{t(effectLabelKeys[effect])}</button>
          </div>)}
        </nav>
        <section className="layer-style-effect-editor">
          <div className="layer-style-fields component-scrollbar">{editor}</div>
        </section>
      </div>
      <footer>
        <LivePreviewToggle checked={previewEnabled} onChange={togglePreview} />
        <button type="button" className="quiet-button" onClick={() => previewDraft({ ...createDefaultLayerStyles(), enabled: draft.enabled })}><PixelUtilityIcon kind="restore" />{t('common.reset')}</button>
        <span className="modal-footer-spacer" />
        <button type="button" className="quiet-button" onClick={cancel}>{t('common.cancel')}</button>
        <button type="submit" className="primary-button">{t('common.apply')}</button>
      </footer>
    </ModalShell>
  </div>, document.body)
}
