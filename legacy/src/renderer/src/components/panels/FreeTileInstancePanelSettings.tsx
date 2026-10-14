import { useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { DialogHeader } from '@/components/DialogHeader'
import { FormField } from '@/components/FormField'
import { useI18n } from '@/components/I18nProvider'
import { ModalShell } from '@/components/ModalShell'
import { PixelUtilityIcon } from '@/components/PixelUtilityIcon'
import { ThemedSelect } from '@/components/ThemedSelect'
import { loadFreeTileInstancePanelLayout, saveFreeTileInstancePanelLayout, type FreeTileInstancePanelLayout } from '@/core/layer-panel-preferences'

interface FreeTileInstancePanelSettingsProps {
  onLayoutChange?: (layout: FreeTileInstancePanelLayout) => void
}

export function FreeTileInstancePanelSettings({ onLayoutChange }: FreeTileInstancePanelSettingsProps) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [layout, setLayout] = useState<FreeTileInstancePanelLayout>(loadFreeTileInstancePanelLayout)
  const titleId = useId()

  const openSettings = (): void => {
    setLayout(loadFreeTileInstancePanelLayout())
    setOpen(true)
  }
  const changeLayout = (next: FreeTileInstancePanelLayout): void => {
    setLayout(next)
    saveFreeTileInstancePanelLayout(next)
    onLayoutChange?.(next)
    window.dispatchEvent(new Event('moonsprite:preferences-changed'))
  }

  return <>
    <button type="button" title={t('freeTiles.instanceLayerSettings')} aria-label={t('freeTiles.instanceLayerSettings')} aria-expanded={open} onClick={openSettings}><PixelUtilityIcon kind="properties" /></button>
    {open && createPortal(<div className="modal-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) setOpen(false) }}>
      <ModalShell storageKey="free-tile-instance-panel-settings-v1" defaultWidth={360} defaultHeight={170} minWidth={320} minHeight={150} maxWidth={440} maxHeight={240} className="layer-modal free-tile-instance-settings-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} resizable={false}>
        <DialogHeader titleId={titleId} title={t('freeTiles.instanceLayerSettings')} closeLabel={t('common.close')} onClose={() => setOpen(false)} />
        <div className="modal-body">
          <FormField layout="inline" label={t('layers.freeTileInstancePanelLayout')}>
            <ThemedSelect<FreeTileInstancePanelLayout> density="compact" value={layout} label={t('layers.freeTileInstancePanelLayout')} groups={[{ label: t('layers.freeTileInstancePanelLayout'), options: [
              { value: 'separate', label: t('layers.freeTileInstancePanelSeparate'), description: t('layers.freeTileInstancePanelSeparateDescription') },
              { value: 'integrated', label: t('layers.freeTileInstancePanelIntegrated'), description: t('layers.freeTileInstancePanelIntegratedDescription') }
            ] }]} onChange={changeLayout} />
          </FormField>
        </div>
      </ModalShell>
    </div>, document.body)}
  </>
}
