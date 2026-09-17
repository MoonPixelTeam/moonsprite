import { layerBlendOptions } from './layer-blend-options'
import { forwardRef, useImperativeHandle } from 'react'
import { sameColor } from './layer-panel-selection'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { BlendMode, RgbaColor } from '@shared/types-color'
import type { LayerGroup } from '@shared/types-layer'
import { ColorValueControl } from '@/components/ColorValueControl'
import { DialogHeader } from '@/components/DialogHeader'
import { FormField } from '@/components/FormField'
import { ModalShell } from '@/components/ModalShell'
import { RangeField } from '@/components/RangeField'
import { TextAreaInput } from '@/components/TextAreaInput'
import { TextInput } from '@/components/TextInput'
import { ThemedSelect, type ThemedSelectGroup } from '@/components/ThemedSelect'
import { isGroupEffectivelyLocked, isLayerEffectivelyLocked } from '@/core/document-model'
import { useWorkspace, type LayerPropertyField, type LayerPropertyTarget, type LayerPropertyValues } from '@/store/workspace'
import { useI18n } from '@/components/I18nProvider'
import { CheckboxField } from '@/components/CheckboxField'

type LayerFormTarget = LayerPropertyTarget
type BatchProperty = LayerPropertyField
interface LayerFormState { id: string; kind: 'layer' | 'group'; targets: LayerFormTarget[]; batchChanges: BatchProperty[]; name: string; opacity: number; blendMode: BlendMode; cumulativeBlend: boolean; locked: boolean; displayColor: RgbaColor | null; description: string }
const ALL_LAYER_PROPERTY_FIELDS: readonly LayerPropertyField[] = ['name', 'opacity', 'blendMode', 'cumulativeBlend', 'displayColor', 'description']

const defaultLayerDisplayColor: RgbaColor = { r: 41, g: 121, b: 255, a: 255 }
export interface LayerPropertyEditorHandle { open(targets: readonly LayerPropertyTarget[]): void; close(): void }
interface Props { documentId: string; layerDisplayColorPresets: RgbaColor[] }

/** Owns form state, coalesced previews and the complete property transaction lifetime. */
export const LayerPropertyEditor = forwardRef<LayerPropertyEditorHandle, Props>(function LayerPropertyEditor({documentId, layerDisplayColorPresets}, ref) {
  const { t } = useI18n()
  const session = useWorkspace(state => state.sessions.find(item => item.document.id === documentId))
  const store = useWorkspace.getState()
  const [form, setForm] = useState<LayerFormState | null>(null)
  const propertyTransactionRef = useRef<string | null>(null)
  const pendingPropertyPreviewRef = useRef<LayerFormState | null>(null)
  const propertyPreviewTimerRef = useRef<number | null>(null)
  const blendOptions = layerBlendOptions(t)
  const blendOptionGroups: Array<ThemedSelectGroup<BlendMode>> = [
    { label: t('blend.group.basic'), options: blendOptions.filter((option) => option.value === 'normal') },
    { label: t('blend.group.darken'), options: blendOptions.filter((option) => ['darken', 'multiply', 'color-burn', 'linear-burn'].includes(option.value)) },
    { label: t('blend.group.lighten'), options: blendOptions.filter((option) => ['lighten', 'screen', 'color-dodge', 'linear-dodge'].includes(option.value)) },
    { label: t('blend.group.contrast'), options: blendOptions.filter((option) => ['overlay', 'soft-light', 'hard-light', 'vivid-light', 'linear-light', 'pin-light', 'hard-mix'].includes(option.value)) },
    { label: t('blend.group.compare'), options: blendOptions.filter((option) => ['difference', 'exclusion', 'subtract', 'divide'].includes(option.value)) },
    { label: t('blend.group.components'), options: blendOptions.filter((option) => ['hue', 'saturation', 'color', 'luminosity'].includes(option.value)) }
  ]

  const cancelPending = (): void => {
    if (propertyPreviewTimerRef.current !== null) window.clearTimeout(propertyPreviewTimerRef.current)
    propertyPreviewTimerRef.current = null
    pendingPropertyPreviewRef.current = null
    if (propertyTransactionRef.current) store.cancelLayerPropertiesTransaction(propertyTransactionRef.current)
    propertyTransactionRef.current = null
  }
  useImperativeHandle(ref, () => ({ close: () => closeProperties(), open(targets: readonly LayerPropertyTarget[]) {
    cancelPending()
    const current = useWorkspace.getState().sessions.find(item => item.document.id === documentId)
    // Property commands address the active document. Reject a stale portal request.
    if (!current || useWorkspace.getState().activeId !== documentId || !targets.length) { setForm(null); return }
    const first = targets[0]
    const source = first.kind === 'group' ? current.document.groups.find(group => group.id === first.id) : current.document.layers.find(layer => layer.id === first.id)
    if (!source) { setForm(null); return }
    const id = store.beginLayerPropertiesTransaction(targets)
    if (!id) { setForm(null); return }
    propertyTransactionRef.current = id
    setForm({ id: first.id, kind: first.kind, targets: [...targets], batchChanges: [], name: source.name, opacity: Math.round(source.opacity * 100), blendMode: source.blendMode, cumulativeBlend: first.kind === 'group' && (source as LayerGroup).cumulativeBlend === true, locked: source.locked, displayColor: source.displayColor ? { ...source.displayColor } : null, description: source.description ?? '' })
  } }))

  const propertyValues = (next: LayerFormState): LayerPropertyValues => ({
    name: next.name,
    opacity: next.opacity / 100,
    blendMode: next.blendMode,
    cumulativeBlend: next.cumulativeBlend,
    locked: next.locked,
    displayColor: next.displayColor ? { ...next.displayColor } : null,
    description: next.description
  })
  const propertyFields = (next: LayerFormState): readonly LayerPropertyField[] => next.targets.length > 1 ? next.batchChanges : ALL_LAYER_PROPERTY_FIELDS
  const applyPropertyPreview = (next: LayerFormState): void => {
    const transactionId = propertyTransactionRef.current
    if (!transactionId) return
    store.previewLayerPropertiesTransaction(transactionId, propertyValues(next), propertyFields(next))
  }
  const flushPropertyPreview = (): LayerFormState | null => {
    if (propertyPreviewTimerRef.current !== null) window.clearTimeout(propertyPreviewTimerRef.current)
    propertyPreviewTimerRef.current = null
    const pending = pendingPropertyPreviewRef.current
    pendingPropertyPreviewRef.current = null
    if (pending) applyPropertyPreview(pending)
    return pending
  }
  const previewProperties = (next: LayerFormState, batchProperty?: BatchProperty): void => {
    if (next.targets.length > 1 && batchProperty && !next.batchChanges.includes(batchProperty)) next = { ...next, batchChanges: [...next.batchChanges, batchProperty] }
    setForm(next)
    if (next.targets.length === 1 || batchProperty === 'displayColor' || batchProperty === 'blendMode') {
      flushPropertyPreview()
      applyPropertyPreview(next)
      return
    }
    pendingPropertyPreviewRef.current = next
    if (propertyPreviewTimerRef.current !== null) window.clearTimeout(propertyPreviewTimerRef.current)
    propertyPreviewTimerRef.current = window.setTimeout(() => { flushPropertyPreview() }, 40)
  }
  const closeProperties = (): void => {
    const closingForm = flushPropertyPreview() ?? form
    if (!closingForm) return
    const transactionId = propertyTransactionRef.current
    if (transactionId) store.commitLayerPropertiesTransaction(transactionId, propertyValues(closingForm), propertyFields(closingForm))
    propertyTransactionRef.current = null
    setForm(null)
  }
  useEffect(() => () => {
    if (propertyPreviewTimerRef.current !== null) window.clearTimeout(propertyPreviewTimerRef.current)
    pendingPropertyPreviewRef.current = null
    const transactionId = propertyTransactionRef.current
    if (transactionId) useWorkspace.getState().cancelLayerPropertiesTransaction(transactionId)
    propertyTransactionRef.current = null
  }, [documentId])
  useEffect(() => {
    if (!form) return
    const keyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      closeProperties()
    }
    window.addEventListener('keydown', keyDown, true)
    return () => window.removeEventListener('keydown', keyDown, true)
  }, [form])

  if (!session) return null
  const singleFormTargetLocked = Boolean(form && form.targets.length === 1 && (form.kind === 'group'
    ? session.document.groups.some((group) => group.id === form.id && isGroupEffectivelyLocked(session.document, group))
    : session.document.layers.some((layer) => layer.id === form.id && isLayerEffectivelyLocked(session.document, layer))))

  return <>    {form && createPortal(<div className="modal-backdrop dialog-backdrop" role="presentation">
      <ModalShell as="form" storageKey="layer-properties-v2" defaultWidth={380} defaultHeight={470} fitContentKey={`${form.kind}:${form.targets.length}:${form.targets.every((target) => target.kind === 'group')}`} minWidth={340} minHeight={340} maxWidth={520} maxHeight={700} className="layer-modal" onSubmit={(event) => { event.preventDefault(); closeProperties() }} onKeyDown={(event) => {
        if (event.defaultPrevented || event.key !== 'Enter' || event.nativeEvent.isComposing || (event.target as HTMLElement).tagName === 'TEXTAREA') return
        event.preventDefault()
        event.stopPropagation()
        closeProperties()
      }}>
        <DialogHeader eyebrow={form.targets.length > 1 ? 'MULTIPLE PROPERTIES' : form.kind === 'group' ? 'GROUP PROPERTIES' : 'LAYER PROPERTIES'} title={t(form.targets.length > 1 ? 'layers.multipleProperties' : form.kind === 'group' ? 'layers.groupProperties' : 'layers.layerPropertiesNamed', form.kind === 'layer' ? { name: form.name } : undefined)} closeLabel={t('common.close')} onClose={closeProperties} />
        <div className="modal-body layer-properties-body">
          <FormField className="layer-properties-inline-field" layout="inline" label={t('layers.name')}><TextInput autoFocus onFocus={(event) => event.currentTarget.select()} value={form.name} onChange={(event) => previewProperties({ ...form, name: event.target.value }, 'name')} /></FormField>
          <FormField className="layer-properties-inline-field" layout="inline" label={t('layers.blendMode')}><ThemedSelect label={t('layers.blendMode')} value={form.blendMode} groups={blendOptionGroups} disabled={singleFormTargetLocked} preserveAnimationSelection onChange={(blendMode) => previewProperties({ ...form, blendMode }, 'blendMode')} /></FormField>
          <RangeField className="layer-opacity-control" disabled={singleFormTargetLocked} label={t('layers.opacity')} min={0} max={100} suffix="%" value={form.opacity} onChange={(opacity) => previewProperties({ ...form, opacity }, 'opacity')} />
          {form.targets.every((target) => target.kind === 'group') && <CheckboxField className="tool-checkbox layer-cumulative-blend" checked={form.cumulativeBlend} disabled={singleFormTargetLocked} label={<><strong>{t('layers.cumulativeBlend')}</strong><small>{t('layers.cumulativeBlendDescription')}</small></>} onChange={(cumulativeBlend) => previewProperties({ ...form, cumulativeBlend }, 'cumulativeBlend')} />}
          <FormField className="layer-display-color-field" label={t('layers.displayColor')}><div className="layer-display-color-options"><button type="button" className={`layer-color-preset no-color ${form.displayColor === null ? 'selected' : ''}`} aria-label={t('layers.noDisplayColor')} aria-pressed={form.displayColor === null} onClick={() => previewProperties({ ...form, displayColor: null }, 'displayColor')}><span /></button>{layerDisplayColorPresets.map((color) => <button key={`${color.r}-${color.g}-${color.b}`} type="button" className={`layer-color-preset ${sameColor(form.displayColor, color) ? 'selected' : ''}`} aria-label={t('layers.displayColorRgb', { r: color.r, g: color.g, b: color.b })} aria-pressed={sameColor(form.displayColor, color)} style={{ '--layer-preset-color': `rgb(${color.r} ${color.g} ${color.b})` } as React.CSSProperties} onClick={() => previewProperties({ ...form, displayColor: { ...color } }, 'displayColor')}><span /></button>)}<ColorValueControl color={form.displayColor ?? defaultLayerDisplayColor} density="compact" onChange={(displayColor) => previewProperties({ ...form, displayColor }, 'displayColor')} label={t('layers.colorControl')} roleLabel={t('layers.custom')} className="layer-custom-color-trigger" fillWithColor /></div></FormField>
          <FormField className="layer-description-field" label={t('layers.description')}><TextAreaInput rows={3} value={form.description} placeholder={t('layers.descriptionPlaceholder')} onChange={(event) => previewProperties({ ...form, description: event.target.value }, 'description')} /></FormField>
        </div>
      </ModalShell>
    </div>, document.body)}
</>
})
