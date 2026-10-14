import { useEffect, useRef, useState } from 'react'
import type { ColorMode } from '@shared/types-raster'
import { DEFAULT_DOCUMENT_SIZE_PRESETS, loadEditorPreferences, type DocumentSizePreset } from '@/core/file-preferences'
import { AVAILABLE_APP_LOCALES, DEFAULT_APP_LOCALE, translate, type AppLocale } from '@/core/localization'
import { useI18n } from './I18nProvider'
import { DialogHeader } from './DialogHeader'
import { ModalShell } from './ModalShell'
import { FormField } from './FormField'
import { NumberInput } from './NumberInput'
import { SegmentedControl } from './SegmentedControl'
import { TextInput } from './TextInput'
import { PreferenceToggle } from './PreferenceToggle'
import { ThemedSelect } from './ThemedSelect'
import { PixelUtilityIcon } from './PixelUtilityIcon'
import { loadNewDocumentPresets, saveNewDocumentPresets } from '@/core/new-document-presets'
import { clipboardService } from '@/store/clipboard-service'
import rgbaModeIcon from '@/assets/pixel-icons/color-mode-rgba.svg'
import indexedModeIcon from '@/assets/pixel-icons/color-mode-indexed.svg'
import grayscaleModeIcon from '@/assets/pixel-icons/color-mode-grayscale.svg'
import recordDrawingIcon from '@/assets/pixel-icons/record-drawing.svg'

const colorModeLabel = (icon: string, width: number, height: number, label: string) => <span className="new-document-color-mode-label">
  <img className="new-document-color-mode-icon" src={icon} width={width} height={height} alt="" aria-hidden="true" draggable={false} />
  <span>{label}</span>
</span>

export function getWindowsFileNameError(value: string, locale: AppLocale = DEFAULT_APP_LOCALE): string | null {
  const name = value
  if (!name.trim()) return translate(locale, 'newDocument.error.required')
  if (name.length > 255) return translate(locale, 'newDocument.error.tooLong')
  const invalidCharacter = name.match(/[<>:"/\\|?*\u0000-\u001F]/)
  if (invalidCharacter) return translate(locale, 'newDocument.error.invalidCharacter', { character: invalidCharacter[0] })
  if (/[. ]$/.test(name)) return translate(locale, 'newDocument.error.trailing')
  if (/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/i.test(name)) return translate(locale, 'newDocument.error.reserved')
  return null
}

export function NewDocumentDialog({ open, presets = DEFAULT_DOCUMENT_SIZE_PRESETS, onClose, onCreate }: { open: boolean; presets?: readonly DocumentSizePreset[]; onClose: () => void; onCreate: (name: string, width: number, height: number, mode: ColorMode, recordDrawing: boolean) => void }) {
  const { locale, t } = useI18n()
  const [name, setName] = useState(() => t('newDocument.untitled'))
  const [width, setWidth] = useState(64)
  const [height, setHeight] = useState(64)
  const [mode, setMode] = useState<ColorMode>('rgba')
  const [recordDrawing, setRecordDrawing] = useState(() => loadEditorPreferences().timelapseRecordingEnabled)
  const [nameError, setNameError] = useState<string | null>(null)
  const [savedPresets, setSavedPresets] = useState(loadNewDocumentPresets)
  const [presetName, setPresetName] = useState('')
  const [presetMessage, setPresetMessage] = useState('')
  const manualSizeChangedRef = useRef(false)

  useEffect(() => {
    if (open) setRecordDrawing(loadEditorPreferences().timelapseRecordingEnabled)
  }, [open])

  useEffect(() => {
    setName((current) => AVAILABLE_APP_LOCALES.some((candidate) => current === translate(candidate, 'newDocument.untitled')) ? t('newDocument.untitled') : current)
  }, [locale, t])

  useEffect(() => {
    if (!open || !window.moonSprite) return
    let active = true
    manualSizeChangedRef.current = false
    void clipboardService.latestClipboardSize(
      () => window.moonSprite.readClipboardImageSize(),
      () => window.moonSprite.readClipboardImage()
    ).then((size) => {
      if (!active || manualSizeChangedRef.current || !size || size.width < 1 || size.height < 1) return
      setWidth(size.width)
      setHeight(size.height)
    }).catch(() => {
      // Clipboard access is optional; keep the normal document defaults.
    })
    return () => { active = false }
  }, [open])

  if (!open) return null
  const savePreset = (): void => {
    const trimmedName = presetName.trim()
    if (!trimmedName) { setPresetMessage(t('app.export.presetNameRequired')); return }
    const next = [...savedPresets.filter(preset => preset.presetName !== trimmedName), { presetName: trimmedName, width, height, mode, recordDrawing }]
    if (!saveNewDocumentPresets(next)) { setPresetMessage(t('app.export.presetSaveFailed')); return }
    setSavedPresets(next)
    setPresetName(trimmedName)
    setPresetMessage(t('app.export.presetSaved', { name: trimmedName }))
  }
  const deletePreset = (): void => {
    const next = savedPresets.filter(preset => preset.presetName !== presetName)
    if (!saveNewDocumentPresets(next)) { setPresetMessage(t('app.export.presetSaveFailed')); return }
    setSavedPresets(next)
    setPresetName('')
    setPresetMessage('')
  }
  const submit = (event: React.FormEvent): void => {
    event.preventDefault()
    const nextName = name || t('newDocument.untitled')
    const error = getWindowsFileNameError(nextName, locale)
    if (error) {
      setNameError(error)
      return
    }
    onCreate(nextName, width, height, mode, recordDrawing)
    onClose()
  }
  return <div className="modal-backdrop modal-overlay-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <ModalShell as="form" storageKey="new-document" defaultWidth={480} defaultHeight={560} minWidth={440} onSubmit={submit} aria-label={t('newDocument.title')}>
      <DialogHeader eyebrow={t('newDocument.eyebrow')} title={t('newDocument.title')} closeLabel={t('common.close')} onClose={onClose} />
      <div className="modal-body"><FormField label={t('newDocument.name')}><TextInput autoFocus value={name} aria-invalid={Boolean(nameError)} onChange={(event) => { setName(event.target.value); setNameError(getWindowsFileNameError(event.target.value, locale)) }} /></FormField>{nameError && <p className="field-error" role="alert">{nameError}</p>}
        <div className="form-grid">
          <FormField label={t('common.width')}><NumberInput aria-label={t('newDocument.widthAria')} min={1} value={width} onValueChange={(value) => { manualSizeChangedRef.current = true; setWidth(value) }} /></FormField>
          <FormField label={t('common.height')}><NumberInput aria-label={t('newDocument.heightAria')} min={1} value={height} onValueChange={(value) => { manualSizeChangedRef.current = true; setHeight(value) }} /></FormField>
        </div>
        <div className="new-document-presets" aria-label={t('newDocument.presetsAria')}>{presets.map((preset) => <button type="button" key={`${preset.width}x${preset.height}`} className={width === preset.width && height === preset.height ? 'selected' : ''} onClick={() => { manualSizeChangedRef.current = true; setWidth(preset.width); setHeight(preset.height) }}>{preset.width}x{preset.height}</button>)}</div>
        <FormField label={t('newDocument.colorMode')}><SegmentedControl className="new-document-mode-control" label={t('newDocument.colorMode')} value={mode} options={[
          { value: 'rgba', label: colorModeLabel(rgbaModeIcon, 32, 16, t('colorMode.rgba')), description: t('colorMode.rgbaDescription') },
          { value: 'indexed', label: colorModeLabel(indexedModeIcon, 32, 14, t('colorMode.indexed')), description: t('colorMode.indexedDescription') },
          { value: 'grayscale', label: colorModeLabel(grayscaleModeIcon, 28, 14, t('colorMode.grayscale')), description: t('colorMode.grayscaleDescription') }
        ]} onChange={setMode} /></FormField>
        <PreferenceToggle className="new-document-recording-toggle" copyClassName="new-document-recording-label" checked={recordDrawing} label={<><img className="new-document-recording-icon" src={recordDrawingIcon} width={32} height={14} alt="" aria-hidden="true" draggable={false} /><span>{t('newDocument.recordDrawing')}</span></>} tooltip={t('newDocument.recordDrawingHint')} onChange={setRecordDrawing} />
        <FormField className="export-preset-field" label={t('newDocument.preset')}>
          <div className="export-preset-control">
            <ThemedSelect value={savedPresets.some(preset => preset.presetName === presetName) ? presetName : ''} label={t('newDocument.preset')} groups={[{ label: t('app.export.savedPresets'), options: [{ value: '', label: t('app.export.choosePreset') }, ...savedPresets.map(preset => ({ value: preset.presetName, label: `${preset.presetName} · ${preset.width}×${preset.height}` }))] }]} onChange={value => {
              setPresetName(value)
              setPresetMessage('')
              const preset = savedPresets.find(item => item.presetName === value)
              if (!preset) return
              manualSizeChangedRef.current = true
              setWidth(preset.width)
              setHeight(preset.height)
              setMode(preset.mode)
              setRecordDrawing(preset.recordDrawing)
            }} />
            <div className="preset-row"><TextInput className="preset-name-input" aria-label={t('app.export.presetName')} placeholder={t('app.export.presetName')} value={presetName} onChange={event => { setPresetName(event.target.value); setPresetMessage('') }} /><button type="button" className="quiet-button" onClick={savePreset}>{t('app.export.savePreset')}</button><button type="button" className="icon-button preset-delete" title={t('app.export.deletePreset')} aria-label={t('app.export.deletePreset')} disabled={!savedPresets.some(preset => preset.presetName === presetName)} onClick={deletePreset}><PixelUtilityIcon kind="delete" /></button></div>
          </div>
        </FormField>
        {presetMessage && <p className="modal-note" role="status">{presetMessage}</p>}
        <p className="modal-note">{t('newDocument.note')}</p>
      </div>
      <footer><button type="button" className="quiet-button" onClick={onClose}>{t('common.cancel')}</button><button className="primary-button" type="submit">{t('newDocument.create')}</button></footer>
    </ModalShell>
  </div>
}
