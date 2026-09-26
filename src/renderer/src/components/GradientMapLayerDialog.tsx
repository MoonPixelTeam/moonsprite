import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { RasterLayer, LayerAdjustment } from '@shared/types-layer'
import { cloneLayerAdjustment } from '@/core/layer-adjustment'
import { normalizeGradientMap } from '@/core/gradient-map'
import { useWorkspace } from '@/store/workspace'
import { GradientMapControls } from './GradientMapControls'
import { useCoalescedGradientPreview } from './useCoalescedGradientPreview'
import { ModalShell } from './ModalShell'
import { DialogHeader } from './DialogHeader'
import { LivePreviewToggle } from './LivePreviewToggle'
import { useI18n } from './I18nProvider'

export function GradientMapLayerDialog({ owner, onClose }: { owner: RasterLayer; onClose: () => void }) {
  const { t } = useI18n()
  const original = useRef(cloneLayerAdjustment(owner.adjustment))
  const finalized = useRef(false)
  const [draft, setDraft] = useState<LayerAdjustment>(() => cloneLayerAdjustment(owner.adjustment) ?? { kind: 'gradient-map', enabled: true, gradientMap: normalizeGradientMap(undefined) })
  const [previewEnabled, setPreviewEnabled] = useState(true)
  const preview = useCoalescedGradientPreview()
  const restore = () => useWorkspace.getState().previewLayerAdjustment(owner.id, original.current)
  useEffect(() => () => {
    if (!finalized.current) useWorkspace.getState().previewLayerAdjustment(owner.id, original.current)
  }, [owner.id])
  const cancel = () => { preview.cancel(); restore(); finalized.current = true; onClose() }
  const apply = () => {
    preview.cancel(); restore()
    useWorkspace.getState().setLayerAdjustment(owner.id, draft)
    finalized.current = true; onClose()
  }
  return createPortal(<div className="modal-backdrop" role="presentation">
    <ModalShell storageKey="gradient-map-layer" fitContent={false} placement="right" defaultWidth={400} defaultHeight={600} minWidth={350} minHeight={380} maxWidth={620} maxHeight={800} className="adjustment-modal gradient-map-layer-modal" role="dialog" aria-label={t('gradientMap.title')}>
      <DialogHeader eyebrow="ADJUST" title={t('gradientMap.title')} closeLabel={t('common.close')} onClose={cancel} />
      <div className="modal-body adjustment-modal-body component-scrollbar">
        <GradientMapControls value={draft.gradientMap} onChange={gradientMap => {
          const next: LayerAdjustment = { kind: 'gradient-map', enabled: true, gradientMap }
          setDraft(next)
          if (previewEnabled) preview.schedule(() => useWorkspace.getState().previewLayerAdjustment(owner.id, next))
        }} />
        <LivePreviewToggle className="adjustment-preview-toggle" checked={previewEnabled} onChange={enabled => {
          preview.cancel(); setPreviewEnabled(enabled)
          useWorkspace.getState().previewLayerAdjustment(owner.id, enabled ? draft : original.current)
        }} />
      </div>
      <footer><button type="button" className="quiet-button" onClick={cancel}>{t('common.cancel')}</button><button type="button" className="primary-button" onClick={apply}>{t('common.apply')}</button></footer>
    </ModalShell>
  </div>, document.body)
}
