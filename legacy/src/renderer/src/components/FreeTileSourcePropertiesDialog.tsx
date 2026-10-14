import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { FreeTileSourceLayer } from '@shared/types-tiles'
import type { RgbaColor } from '@shared/types-color'
import { ColorValueControl } from './ColorValueControl'
import { DialogHeader } from './DialogHeader'
import { FormField } from './FormField'
import { ModalShell } from './ModalShell'
import { PreferenceToggle } from './PreferenceToggle'
import { TextInput } from './TextInput'
import { useI18n } from './I18nProvider'
import { loadEditorPreferences } from '@/core/file-preferences'
import { useWorkspace } from '@/store/workspace'
import type { FreeTileSourcePropertyChanges } from '@/store/workspace-state'

interface FreeTileSourceFormState {
  name: string
  displayColor: RgbaColor | null
  visible: boolean
  locked: boolean
}

const defaultDisplayColor: RgbaColor = { r: 41, g: 121, b: 255, a: 255 }

const sameColor = (left: RgbaColor | null, right: RgbaColor | null): boolean => {
  if (left === null || right === null) return left === right
  return left.r === right.r && left.g === right.g && left.b === right.b && left.a === right.a
}

export function FreeTileSourcePropertiesDialog({ source, onClose }: {
  source: FreeTileSourceLayer
  onClose: () => void
}) {
  const { t } = useI18n()
  const [form, setForm] = useState<FreeTileSourceFormState>(() => ({
    name: source.name,
    displayColor: source.displayColor ? { ...source.displayColor } : null,
    visible: source.visible,
    locked: source.locked
  }))
  const transactionRef = useRef<string | null>(null)
  const changesRef = useRef<FreeTileSourcePropertyChanges>({})
  const presets = loadEditorPreferences().layerDisplayColorPresets
  const preview = (next: FreeTileSourceFormState, changes: FreeTileSourcePropertyChanges): void => {
    const merged = { ...changesRef.current, ...changes }
    changesRef.current = merged
    setForm(next)
    const transactionId = transactionRef.current
    if (transactionId) useWorkspace.getState().previewFreeTileSourcePropertiesTransaction(transactionId, merged)
  }
  const close = (): void => {
    const transactionId = transactionRef.current
    transactionRef.current = null
    if (transactionId) useWorkspace.getState().commitFreeTileSourcePropertiesTransaction(transactionId, changesRef.current)
    onClose()
  }
  useEffect(() => {
    if (!transactionRef.current) transactionRef.current = useWorkspace.getState().beginFreeTileSourcePropertiesTransaction(source.id)
    return () => {
      const transactionId = transactionRef.current
      transactionRef.current = null
      if (transactionId) useWorkspace.getState().cancelFreeTileSourcePropertiesTransaction(transactionId)
    }
  }, [source.id])
  useEffect(() => {
    const keyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      close()
    }
    window.addEventListener('keydown', keyDown, true)
    return () => window.removeEventListener('keydown', keyDown, true)
  })

  return <div className="modal-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) close() }}>
      <ModalShell as="form" storageKey="free-tile-source-properties-v4" defaultWidth={430} defaultHeight={300} minWidth={380} minHeight={260} maxWidth={640} maxHeight={520} className="layer-modal free-tile-source-properties-dialog" role="dialog" aria-modal="true" aria-labelledby="free-tile-source-properties-title" onSubmit={(event) => { event.preventDefault(); close() }}>
      <DialogHeader eyebrow="FREE TILE SOURCE" title={t('freeTiles.sourcePropertiesTitle', { name: source.name })} titleId="free-tile-source-properties-title" closeLabel={t('common.close')} onClose={close} />
      <div className="modal-body free-tile-source-properties-body">
        <FormField className="layer-properties-inline-field" layout="inline" label={t('layers.name')}><TextInput autoFocus maxLength={96} value={form.name} onFocus={(event) => event.currentTarget.select()} onChange={(event) => preview({ ...form, name: event.target.value }, { name: event.target.value })} /></FormField>
        <div className="free-tile-source-property-toggles"><PreferenceToggle checked={form.visible} label={t('freeTiles.sourceVisible')} tooltip={t('freeTiles.sourceVisibleDescription')} onChange={(visible) => preview({ ...form, visible }, { visible })} /><PreferenceToggle checked={form.locked} label={t('freeTiles.sourceLocked')} tooltip={t('freeTiles.sourceLockedDescription')} onChange={(locked) => preview({ ...form, locked }, { locked })} /></div>
        <FormField className="layer-display-color-field" label={t('layers.displayColor')}><div className="layer-display-color-options"><button type="button" className={`layer-color-preset no-color ${form.displayColor === null ? 'selected' : ''}`} aria-label={t('layers.noDisplayColor')} aria-pressed={form.displayColor === null} onClick={() => preview({ ...form, displayColor: null }, { displayColor: null })}><span /></button>{presets.map((color, index) => <button key={`${index}-${color.r}-${color.g}-${color.b}`} type="button" className={`layer-color-preset ${sameColor(form.displayColor, color) ? 'selected' : ''}`} aria-label={t('layers.displayColorRgb', { r: color.r, g: color.g, b: color.b })} aria-pressed={sameColor(form.displayColor, color)} style={{ '--layer-preset-color': `rgb(${color.r} ${color.g} ${color.b})` } as CSSProperties} onClick={() => preview({ ...form, displayColor: { ...color } }, { displayColor: { ...color } })}><span /></button>)}<ColorValueControl color={form.displayColor ?? defaultDisplayColor} density="compact" onChange={(displayColor) => preview({ ...form, displayColor }, { displayColor })} label={t('layers.colorControl')} roleLabel={t('layers.custom')} className="layer-custom-color-trigger" fillWithColor /></div></FormField>
      </div>
    </ModalShell>
  </div>
}
