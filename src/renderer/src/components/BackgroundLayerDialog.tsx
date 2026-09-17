import { useCallback, useEffect, useRef, useState } from 'react'
import type { BackgroundPatternId } from '@shared/types-layer'
import type { StoredBackgroundPreset } from '@shared/types-library'
import type { BackgroundPatternTile } from '@/core/background-patterns'
import { BackgroundPatternPreview } from './BackgroundPatternPreview'
import { decodeBackgroundPresetTile } from '@/core/background-preset-images'
import type { TranslationKey } from '@/core/localization'
import { DialogHeader } from './DialogHeader'
import { ModalShell } from './ModalShell'
import { PixelUtilityIcon } from './PixelUtilityIcon'
import { useI18n } from './I18nProvider'

const SOLID_PRESET_ID = 'moonsprite:solid'

const backgroundPatternLabelKeys: Record<Exclude<BackgroundPatternId, 'solid'>, TranslationKey> = {
  grid: 'layers.backgroundPattern.grid',
  stripes: 'layers.backgroundPattern.stripes',
  diamond: 'layers.backgroundPattern.diamond',
  'diamond-nested': 'layers.backgroundPattern.diamond-nested',
  circles: 'layers.backgroundPattern.circles'
}

interface LoadedBackgroundPreset {
  preset: StoredBackgroundPreset
  tile: BackgroundPatternTile
}

export function BackgroundLayerDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (pattern: BackgroundPatternId | BackgroundPatternTile) => Promise<void> }) {
  const { t } = useI18n()
  const loadVersionRef = useRef(0)
  const [selectedId, setSelectedId] = useState(SOLID_PRESET_ID)
  const [directoryPath, setDirectoryPath] = useState('BackgroundPresets')
  const [presets, setPresets] = useState<LoadedBackgroundPreset[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const refreshPresets = useCallback(async (): Promise<void> => {
    const version = ++loadVersionRef.current
    setLoading(true)
    setStatus(null)
    try {
      const listing = await window.moonSprite.listBackgroundPresets()
      const results = await Promise.allSettled(listing.presets.map(async (preset): Promise<LoadedBackgroundPreset> => {
        const input = await window.moonSprite.readBinary(preset.filePath)
        return { preset, tile: await decodeBackgroundPresetTile(preset, input) }
      }))
      if (version !== loadVersionRef.current) return
      const loaded = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : [])
      const failedCount = results.length - loaded.length
      setDirectoryPath(listing.directoryPath)
      setPresets(loaded)
      setSelectedId((current) => current === SOLID_PRESET_ID || loaded.some((item) => item.preset.id === current) ? current : SOLID_PRESET_ID)
      if (failedCount > 0) setStatus(t('layers.backgroundPresetSomeFailed', { count: failedCount }))
    } catch {
      if (version !== loadVersionRef.current) return
      setPresets([])
      setSelectedId(SOLID_PRESET_ID)
      setStatus(t('layers.backgroundPresetReadError'))
    } finally {
      if (version === loadVersionRef.current) setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void refreshPresets()
    return () => { loadVersionRef.current += 1 }
  }, [refreshPresets])

  const openPresetFolder = async (): Promise<void> => {
    try {
      await window.moonSprite.openBackgroundPresetFolder()
    } catch {
      setStatus(t('layers.backgroundPresetOpenError'))
    }
  }

  const create = async (): Promise<void> => {
    if (creating) return
    const selected = selectedId === SOLID_PRESET_ID ? 'solid' : presets.find((item) => item.preset.id === selectedId)?.tile
    if (!selected) return
    setCreating(true)
    try {
      await onCreate(selected)
      setCreating(false)
      onClose()
    } catch {
      setCreating(false)
    }
  }
  return <div className="modal-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget && !creating) onClose() }}>
    <ModalShell as="form" storageKey="new-background-layer" defaultWidth={660} defaultHeight={460} minWidth={540} minHeight={360} maxWidth={820} maxHeight={680} className="layer-modal background-layer-dialog" role="dialog" aria-modal="true" aria-labelledby="background-layer-dialog-title" onSubmit={(event) => { event.preventDefault(); void create() }}>
      <DialogHeader eyebrow="BACKGROUND LAYER" title={t('layers.newBackground')} titleId="background-layer-dialog-title" closeLabel={t('common.close')} closeDisabled={creating} onClose={onClose} />
      <div className="modal-body background-layer-dialog-body">
        <p className="background-layer-dialog-intro">{t('layers.backgroundDialogDescription')}</p>
        <div className="background-layer-preset-toolbar">
          <span className="background-layer-preset-path" title={directoryPath}>{directoryPath}</span>
          <div className="background-layer-preset-actions">
            <button type="button" className="quiet-button" disabled={creating} onClick={() => void openPresetFolder()}><PixelUtilityIcon kind="folderOpen" />{t('layers.openBackgroundPresetFolder')}</button>
            <button type="button" className="quiet-button" disabled={creating || loading} onClick={() => void refreshPresets()}><PixelUtilityIcon kind="refresh" />{t('palette.refresh')}</button>
          </div>
        </div>
        <div className="background-layer-pattern-grid component-scrollbar" role="radiogroup" aria-label={t('layers.backgroundPatternLabel')} aria-busy={loading}>
          <button type="button" role="radio" aria-checked={selectedId === SOLID_PRESET_ID} className={selectedId === SOLID_PRESET_ID ? 'selected' : ''} onClick={() => setSelectedId(SOLID_PRESET_ID)}>
            <span className="background-layer-pattern-preview"><BackgroundPatternPreview source="solid" /></span>
            <span className="background-layer-pattern-name">{t('layers.backgroundPattern.solid')}</span>
          </button>
          {presets.map(({ preset, tile }) => {
            const label = tile.pattern ? t(backgroundPatternLabelKeys[tile.pattern]) : preset.name
            return <button type="button" key={preset.id} role="radio" aria-checked={selectedId === preset.id} className={selectedId === preset.id ? 'selected' : ''} title={label} onClick={() => setSelectedId(preset.id)}>
              <span className="background-layer-pattern-preview"><BackgroundPatternPreview source={tile} /></span>
              <span className="background-layer-pattern-name">{label}</span>
            </button>
          })}
          {loading && presets.length === 0 && <p className="background-layer-preset-state">{t('layers.backgroundPresetLoading')}</p>}
          {!loading && presets.length === 0 && <p className="background-layer-preset-state">{t('layers.backgroundPresetEmpty')}</p>}
        </div>
        {status && <p className="background-layer-preset-status" role="status">{status}</p>}
      </div>
      <footer><button type="button" className="quiet-button" disabled={creating} onClick={onClose}>{t('common.cancel')}</button><button type="submit" className="primary-button" disabled={creating}><PixelUtilityIcon kind="image" />{t('layers.createBackground')}</button></footer>
    </ModalShell>
  </div>
}
