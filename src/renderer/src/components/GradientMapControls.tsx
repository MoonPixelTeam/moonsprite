import { hideGradientMapBuiltin, loadHiddenGradientMapPresets, deleteGradientMapPreset, GRADIENT_MAP_BUILTINS, gradientMapCss, loadGradientMapPresets, saveGradientMapPreset } from '@/core/gradient-map-presets'
import { TextInput } from './TextInput'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ThemedSelect } from './ThemedSelect'
import { gradientMapSignature } from '@/core/gradient-map'
import type { GradientMapSettings } from '@shared/types-gradient-map'
import { normalizeGradientMap } from '@/core/gradient-map'
import { useWorkspace } from '@/store/workspace'
import { useI18n } from './I18nProvider'
import { GradientStopsEditor } from './GradientStopsEditor'
import { GradientDitherSelect } from './GradientDitherSelect'
import { FormField } from './FormField'
import { SegmentedControl } from './SegmentedControl'

export function GradientMapControls({ value, onChange }: { value: GradientMapSettings; onChange: (value: GradientMapSettings) => void }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [saved, setSaved] = useState(() => {
    try { return { presets: loadGradientMapPresets(), hidden: loadHiddenGradientMapPresets(), readable: true } }
    catch { return { presets: [], hidden: [] as string[], readable: false } }
  })
  const [context, setContext] = useState<{ key: string; name?: string; x: number; y: number } | null>(null)
  const contextRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!context) return
    const close = (event: PointerEvent) => { if (!contextRef.current?.contains(event.target as Node)) setContext(null) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); setContext(null) } }
    window.addEventListener('pointerdown', close, true)
    window.addEventListener('keydown', escape, true)
    return () => { window.removeEventListener('pointerdown', close, true); window.removeEventListener('keydown', escape, true) }
  }, [context])
  const [presetName, setPresetName] = useState('')
  const [saveError, setSaveError] = useState(false)
  const palette = useWorkspace(state => state.sessions.find(session => session.document.id === state.activeId)?.document.palette)
  const paletteOrder = useWorkspace(state => state.sessions.find(session => session.document.id === state.activeId)?.document.paletteOrder)
  const update = (patch: Partial<GradientMapSettings>) => onChange(normalizeGradientMap({ ...value, ...patch }))
  const gradient = gradientMapCss(value)
  const presets = [
    ...GRADIENT_MAP_BUILTINS.filter(preset => !saved.hidden.includes(preset.nameKey)).map(preset => ({ value: preset.nameKey as string, label: t(preset.nameKey), settings: preset.settings, savedName: undefined as string | undefined })),
    ...saved.presets.map(preset => ({ value: `saved:${preset.name}`, label: preset.name, settings: preset.settings, savedName: preset.name }))
  ]
  const selectedPreset = presets.find(preset => gradientMapSignature(preset.settings) === gradientMapSignature(value))
  return <div className="gradient-map-controls" style={{ display: 'grid', gap: 10 }}>
    <button type="button" className="quiet-button gradient-map-edit-button" onClick={() => setOpen(true)}>
      <span aria-hidden="true" className="gradient-map-edit-preview" style={{ background: gradient }} /><span>{t('gradientMap.edit')}</span>
    </button>
    <FormField label={t('gradientMap.mode')}><SegmentedControl className="gradient-map-mode" label={t('gradientMap.mode')} value={value.mode} options={[{ value: 'continuous', label: t('gradientMap.continuous') }, { value: 'steps', label: t('gradientMap.steps') }]} onChange={mode => update({ mode })} /></FormField>
    <FormField label={t('toolOptions.gradientDither')}><GradientDitherSelect value={value.dither} onChange={dither => update({ dither })} preserveAnimationSelection /></FormField>
    <div className="gradient-editor-actions" style={{ flexWrap: 'wrap' }}>
      <button type="button" className="quiet-button" onClick={() => update({ reverse: !value.reverse })}>{t('gradientMap.reverse')}</button>
      <button type="button" className="quiet-button" disabled={!palette?.some(entry => entry.color.a > 0)} onClick={() => {
        const colors = (palette ?? []).filter(entry => entry.color.a > 0 && paletteOrder?.includes(entry.id)).slice(0, 256).map(entry => entry.color)
        colors.sort((a, b) => (a.r - b.r) * 0.2126 + (a.g - b.g) * 0.7152 + (a.b - b.b) * 0.0722)
        update({ stops: colors.map((color, index) => ({ position: colors.length === 1 ? 0 : index / (colors.length - 1), color })) })
      }}>{t('gradientMap.palette')}</button>
    </div>
    <section className="gradient-map-presets" aria-label={t('gradientMap.presets')}>
      <FormField label={t('gradientMap.presets')}><span className="gradient-dither-control"><ThemedSelect
        label={t('gradientMap.presets')} value={selectedPreset?.value ?? ''}
        groups={[{ label: t('gradientMap.presets'), options: presets }]}
        showCheck={false} showOptionTooltips={false} popoverClassName="gradient-dither-popover" popoverWidth={340} preserveAnimationSelection
        renderSelected={() => selectedPreset?.label ?? t('gradientMap.custom')}
        renderOption={option => <span className="gradient-option-content"><strong>{option.label}</strong><span className="gradient-preset-preview" style={{ background: gradientMapCss(presets.find(preset => preset.value === option.value)!.settings) }} aria-hidden="true" /></span>}
        onChange={key => { const preset = presets.find(preset => preset.value === key); if (preset) onChange(normalizeGradientMap(preset.settings)); setContext(null) }}
        onOptionContextMenu={(event, option) => {
          event.preventDefault(); event.stopPropagation()
          const preset = presets.find(preset => preset.value === option.value)
          setContext(preset ? { key: preset.value, name: preset.savedName, x: Math.max(8, Math.min(event.clientX, window.innerWidth - 168)), y: Math.max(8, Math.min(event.clientY, window.innerHeight - 48)) } : null)
        }}
      /></span></FormField>
      {context && createPortal(<div ref={contextRef} className="context-menu" role="menu" style={{ position: 'fixed', left: context.x, top: context.y, zIndex: 20000, minWidth: 160 }}>
        <button type="button" role="menuitem" onClick={() => {
          try {
            setSaved(context.name ? { ...saved, presets: deleteGradientMapPreset(context.name) } : { ...saved, hidden: hideGradientMapBuiltin(context.key) })
            setSaveError(false)
          }
          catch { setSaveError(true) }
          setContext(null)
        }}>{t('common.delete')}</button>
      </div>, document.body)}
      <div className="gradient-map-preset-save">
        <TextInput aria-label={t('gradientMap.presetName')} placeholder={t('gradientMap.presetName')} maxLength={80} value={presetName} onChange={event => setPresetName(event.target.value)} />
        <button type="button" className="quiet-button" disabled={!presetName.trim() || !saved.readable} onClick={() => {
          try { setSaved({ ...saved, presets: saveGradientMapPreset(presetName, value), readable: true }); setPresetName(''); setSaveError(false) }
          catch { setSaveError(true) }
        }}>{t('gradientMap.savePreset')}</button>
      </div>
      {(!saved.readable || saveError) && <p role="alert">{t(saved.readable ? 'gradientMap.saveFailed' : 'gradientMap.loadFailed')}</p>}
    </section>
    <p>{t('gradientMap.hint')}</p>
    <GradientStopsEditor titleKey="gradientMap.edit" open={open} stops={value.stops} disabled={false} primaryColor={value.stops[0].color} secondaryColor={value.stops[value.stops.length - 1].color} onChange={stops => update({ stops })} onClose={() => setOpen(false)} t={t} />
  </div>
}
