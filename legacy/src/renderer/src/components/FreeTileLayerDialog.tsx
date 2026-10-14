import { useState } from 'react'
import { DialogHeader } from './DialogHeader'
import { FormField } from './FormField'
import { ModalShell } from './ModalShell'
import { PixelUtilityIcon } from './PixelUtilityIcon'
import { TextInput } from './TextInput'
import { ThemedSelect } from './ThemedSelect'
import { useI18n } from './I18nProvider'
import type { FreeTileLayerOptions } from '@/store/workspace'

const NEW_FREE_TILE_SET_OPTION = '__new-free-tile-set__'

export interface FreeTileSetOption {
  id: string
  name: string
  sourceCount: number
}

export function FreeTileLayerDialog({ sets = [], onClose, onConfirm }: {
  sets?: readonly FreeTileSetOption[]
  onClose: () => void
  onConfirm: (options: FreeTileLayerOptions) => Promise<void>
}) {
  const { t } = useI18n()
  const defaultName = t('workspace.freeTile.layerName')
  const [name, setName] = useState(defaultName)
  const [freeTileSetId, setFreeTileSetId] = useState(NEW_FREE_TILE_SET_OPTION)
  const [submitting, setSubmitting] = useState(false)

  const confirm = async (): Promise<void> => {
    if (submitting) return
    setSubmitting(true)
    try {
      await onConfirm({ name: name.trim() || defaultName, freeTileSetId: freeTileSetId === NEW_FREE_TILE_SET_OPTION ? null : freeTileSetId })
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return <div className="modal-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget && !submitting) onClose() }}>
    <ModalShell as="form" storageKey="new-free-tile-layer-v4" defaultWidth={470} defaultHeight={250} minWidth={420} minHeight={220} maxWidth={720} maxHeight={500} resizable className="layer-modal tilemap-layer-dialog" role="dialog" aria-modal="true" aria-labelledby="free-tile-layer-dialog-title" onSubmit={(event) => { event.preventDefault(); void confirm() }}>
      <DialogHeader eyebrow="FREE TILE" title={t('layers.newFreeTile')} titleId="free-tile-layer-dialog-title" closeLabel={t('common.close')} closeDisabled={submitting} onClose={onClose} />
      <div className="modal-body tilemap-layer-dialog-body">
        <FormField label={t('layers.name')}><TextInput autoFocus maxLength={96} value={name} onChange={(event) => setName(event.target.value)} /></FormField>
        <FormField label={t('layers.freeTileSet')} hint={freeTileSetId === NEW_FREE_TILE_SET_OPTION ? undefined : t('layers.existingFreeTileSetHint')}>
          <ThemedSelect<string>
            value={freeTileSetId}
            label={t('layers.freeTileSet')}
            groups={[{
              label: t('layers.freeTileSet'),
              options: [
                { value: NEW_FREE_TILE_SET_OPTION, label: t('layers.newFreeTileSet'), description: t('layers.newFreeTileSetDescription') },
                ...sets.map((set) => ({ value: set.id, label: set.name, description: t('layers.freeTileSetSourceCount', { count: set.sourceCount }) }))
              ]
            }]}
            onChange={setFreeTileSetId}
            showOptionTooltips
          />
        </FormField>
      </div>
      <footer><button type="button" className="quiet-button" disabled={submitting} onClick={onClose}>{t('common.cancel')}</button><button type="submit" className="primary-button" disabled={submitting}><PixelUtilityIcon kind="freeTile" />{t('layers.createFreeTile')}</button></footer>
    </ModalShell>
  </div>
}
