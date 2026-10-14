import { useEffect, useRef, useState } from 'react'
import { DialogHeader } from '@/components/DialogHeader'
import { ModalShell } from '@/components/ModalShell'
import { FormField } from '@/components/FormField'
import { NumberInput } from '@/components/NumberInput'
import { RangeField } from '@/components/RangeField'
import { LivePreviewToggle } from '@/components/LivePreviewToggle'
import { useI18n } from '@/components/I18nProvider'
import { FILTER_PRESETS, filterPresetById } from '@/core/filter-presets'
import { useWorkspace } from '@/store/workspace'
import type { FilterChoice, FilterPreviewHandle } from '@/store/workspace-filter-preview'

export function FilterDialog({ initialFilter, onClose }: { initialFilter: FilterChoice; onClose: () => void }) {
  const { t } = useI18n()
  const [lcdAvailable] = useState(() => {
    const state = useWorkspace.getState()
    return state.sessions.find(session => session.document.id === state.activeId)?.selectedLayerIds.length === 1
  })
  const [filter, setFilter] = useState(initialFilter)
  const [opacities, setOpacities] = useState<Partial<Record<FilterChoice, number>>>({})
  const [width, setWidth] = useState(1), [height, setHeight] = useState(1)
  const [live, setLive] = useState(true), [busy, setBusy] = useState(false)
  const preview = useRef<FilterPreviewHandle | null>(null)
  const opacity = opacities[filter] ?? filterPresetById(filter)?.opacity ?? 1
  useEffect(() => {
    const handle = useWorkspace.getState().beginFilterPreview()
    preview.current = handle
    return () => { handle.cancel(); preview.current = null }
  }, [])
  useEffect(() => {
    // Coalesce slider events; stale async requests are discarded by the transaction.
    const timer = window.setTimeout(() => { void preview.current?.update(live ? { id: filter, opacity, lcd: { width, height } } : null) }, 40)
    return () => window.clearTimeout(timer)
  }, [filter, opacity, width, height, live])
  const choices = [...FILTER_PRESETS.map(preset => ({ id: preset.id as FilterChoice, name: t(`filter.preset.${preset.id}.name`) })), { id: 'lcd' as const, name: t('filter.lcdScreen') }]
  return <div className="modal-backdrop" role="presentation" onPointerDown={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <ModalShell as="form" storageKey="filter-browser" defaultWidth={640} defaultHeight={440} minWidth={360} minHeight={280} maxWidth={900} maxHeight={750} role="dialog" aria-modal="true" aria-labelledby="filter-title" onSubmit={async event => {
      event.preventDefault()
      if (busy) return
      setBusy(true)
      await preview.current?.apply({ id: filter, opacity, lcd: { width, height } })
      onClose()
    }}>
      <DialogHeader title={t('app.menu.edit.filters')} titleId="filter-title" closeLabel={t('common.close')} onClose={onClose} />
      <div className="modal-body" style={{ overflowY: 'auto', minHeight: 0 }}>
        <div role="group" aria-label={t('app.menu.edit.filters')} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 6 }}>
          {choices.map(choice => <button key={choice.id} type="button" aria-pressed={filter === choice.id} disabled={busy || (choice.id === 'lcd' && !lcdAvailable)} className={filter === choice.id ? 'primary-button' : 'quiet-button'} onClick={() => setFilter(choice.id)}>{choice.name}</button>)}
        </div>
        <p className="modal-note">{t(filter === 'lcd' ? 'filter.lcdScreenDialogHint' : `filter.preset.${filter}.description`)}</p>
        {filter === 'lcd' ? <div className="lcd-screen-size-grid">
          <FormField label={t('common.width')}><NumberInput min={1} max={64} suffix="px" value={width} onValueChange={value => setWidth(Math.max(1, Math.min(64, Math.round(value))))} /></FormField>
          <FormField label={t('common.height')}><NumberInput min={1} max={64} suffix="px" value={height} onValueChange={value => setHeight(Math.max(1, Math.min(64, Math.round(value))))} /></FormField>
        </div> : <RangeField label={t('layers.opacity')} min={0} max={100} value={Math.round(opacity * 100)} suffix="%" onChange={value => setOpacities(previous => ({ ...previous, [filter]: value / 100 }))} />}
      </div>
      <footer><LivePreviewToggle checked={live} onChange={setLive} /><span className="modal-footer-spacer" /><button type="button" className="quiet-button" disabled={busy} onClick={onClose}>{t('common.cancel')}</button><button type="submit" className="primary-button" disabled={busy}>{t('common.apply')}</button></footer>
    </ModalShell>
  </div>
}
