import { useState } from 'react'
import { DialogHeader } from './DialogHeader'
import { FormField } from './FormField'
import { ModalShell } from './ModalShell'
import { NumberInput } from './NumberInput'
import { PixelUtilityIcon } from './PixelUtilityIcon'
import { TextInput } from './TextInput'
import { ThemedSelect } from './ThemedSelect'
import { useI18n } from './I18nProvider'
import type { Tileset } from '@shared/types-tiles'
import type { TilemapLayerOptions } from '@/store/workspace'

const NEW_TILESET_OPTION = '__new-tileset__'

export function TilemapLayerDialog({ documentWidth, documentHeight, mode = 'create', initialName, tilesets: availableTilesets = [], onClose, onConfirm }: {
  documentWidth: number
  documentHeight: number
  mode?: 'create' | 'convert'
  initialName?: string
  tilesets?: readonly Tileset[]
  onClose: () => void
  onConfirm: (options: TilemapLayerOptions) => Promise<void>
}) {
  const { t } = useI18n()
  const tilesets = availableTilesets
  const defaultName = initialName?.trim() || t('workspace.tilemap.layerName')
  const [name, setName] = useState(defaultName)
  const [tileWidth, setTileWidth] = useState(Math.max(1, Math.min(16, documentWidth)))
  const [tileHeight, setTileHeight] = useState(Math.max(1, Math.min(16, documentHeight)))
  const [tilesetId, setTilesetId] = useState<string>(NEW_TILESET_OPTION)
  const [submitting, setSubmitting] = useState(false)
  const converting = mode === 'convert'
  const selectedTileset = !converting && tilesetId !== NEW_TILESET_OPTION
    ? tilesets.find((tileset) => tileset.id === tilesetId) ?? null
    : null

  const selectTileset = (next: string): void => {
    setTilesetId(next)
    const selected = next === NEW_TILESET_OPTION ? null : tilesets.find((tileset) => tileset.id === next) ?? null
    if (selected) {
      setTileWidth(selected.tileWidth)
      setTileHeight(selected.tileHeight)
    }
  }

  const confirm = async (): Promise<void> => {
    if (submitting) return
    setSubmitting(true)
    try {
      await onConfirm({ name: name.trim() || defaultName, tileWidth, tileHeight, tilesetId: selectedTileset?.id ?? null })
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return <div className="modal-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget && !submitting) onClose() }}>
    <ModalShell as="form" storageKey="new-tilemap-layer-v4" defaultWidth={470} defaultHeight={380} minWidth={420} minHeight={340} maxWidth={720} maxHeight={560} resizable className="layer-modal tilemap-layer-dialog" role="dialog" aria-modal="true" aria-labelledby="tilemap-layer-dialog-title" onSubmit={(event) => { event.preventDefault(); void confirm() }}>
      <DialogHeader eyebrow="TILEMAP" title={t(converting ? 'layers.convertToTilemap' : 'layers.newTilemap')} titleId="tilemap-layer-dialog-title" closeLabel={t('common.close')} closeDisabled={submitting} onClose={onClose} />
      <div className="modal-body tilemap-layer-dialog-body">
        {converting && <p>{t('layers.convertTilemapDialogDescription')}</p>}
        <FormField label={t('layers.name')}><TextInput autoFocus maxLength={96} value={name} onChange={(event) => setName(event.target.value)} /></FormField>
        {!converting && <FormField label={t('layers.tilemapTileset')} hint={selectedTileset ? t('layers.existingTilemapTilesetHint') : undefined}>
          <ThemedSelect<string>
            value={tilesetId}
            label={t('layers.tilemapTileset')}
            groups={[{
              label: t('layers.tilemapTileset'),
              options: [
                { value: NEW_TILESET_OPTION, label: t('layers.newTilemapTileset'), description: t('layers.newTilemapTilesetDescription') },
                ...tilesets.map((tileset) => ({ value: tileset.id, label: tileset.name, description: `${tileset.tileWidth} x ${tileset.tileHeight}px` }))
              ]
            }]}
            onChange={selectTileset}
            showOptionTooltips
          />
        </FormField>}
        <div className="tilemap-size-fields">
          <FormField label={t('layers.tileWidth')}><NumberInput disabled={Boolean(selectedTileset)} min={1} max={256} suffix="px" value={tileWidth} onValueChange={setTileWidth} /></FormField>
          <FormField label={t('layers.tileHeight')}><NumberInput disabled={Boolean(selectedTileset)} min={1} max={256} suffix="px" value={tileHeight} onValueChange={setTileHeight} /></FormField>
        </div>
      </div>
      <footer><button type="button" className="quiet-button" disabled={submitting} onClick={onClose}>{t('common.cancel')}</button><button type="submit" className="primary-button" disabled={submitting}><PixelUtilityIcon kind="tilemap" />{t(converting ? 'layers.convertTilemap' : 'layers.createTilemap')}</button></footer>
    </ModalShell>
  </div>
}
