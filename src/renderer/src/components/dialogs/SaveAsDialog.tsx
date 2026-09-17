import { useState } from 'react'
import { ThemedSelect } from '@/components/ThemedSelect'
import { DialogHeader } from '@/components/DialogHeader'
import { ModalShell } from '@/components/ModalShell'
import { FormField } from '@/components/FormField'
import { TextInput } from '@/components/TextInput'
import type { SaveAsOptions } from '@/store/workspace'
import { useI18n } from '@/components/I18nProvider'
import { PixelUtilityIcon } from '@/components/PixelUtilityIcon'
import { CheckboxField } from '@/components/CheckboxField'

interface SaveAsDialogProps {
  initialName: string
  initialFormat: SaveAsOptions['format']
  initialDirectory: string
  onSave: (options: SaveAsOptions) => Promise<boolean>
  onClose: () => void
}

export function SaveAsDialog({ initialName, initialFormat, initialDirectory, onSave, onClose }: SaveAsDialogProps) {
  const { t } = useI18n()
  const saveAsFormatOptions: Array<{ value: SaveAsOptions['format']; label: string }> = [
    { value: 'moonsprite', label: t('saveAs.format.moonsprite') },
    { value: 'png-auto', label: t('saveAs.format.pngAuto') },
    { value: 'png-rgba', label: t('saveAs.format.pngRgba') },
    { value: 'jpeg', label: t('saveAs.format.jpeg') },
    { value: 'webp', label: t('saveAs.format.webp') },
    { value: 'psd', label: t('saveAs.format.psd') },
    { value: 'ase', label: t('saveAs.format.ase') },
    { value: 'aseprite', label: t('saveAs.format.aseprite') }
  ]
  const [form, setForm] = useState<SaveAsOptions>({ name: initialName, format: initialFormat, scalePercent: 100, directory: initialDirectory })
  const [saving, setSaving] = useState(false)
  const [choosingDirectory, setChoosingDirectory] = useState(false)
  const chooseDirectory = async (): Promise<void> => {
    if (saving || choosingDirectory) return
    setChoosingDirectory(true)
    try {
      const result = await window.moonSprite.chooseDirectory(form.directory || initialDirectory)
      if (!result.canceled && result.directoryPath) setForm((current) => ({ ...current, directory: result.directoryPath }))
    } finally {
      setChoosingDirectory(false)
    }
  }
  const submit = async (): Promise<void> => {
    if (!form.name.trim() || saving) return
    setSaving(true)
    try {
      if (await onSave(form)) onClose()
    } finally {
      setSaving(false)
    }
  }
  const flattened = form.format === 'png-auto' || form.format === 'png-rgba' || form.format === 'jpeg' || form.format === 'webp'
  const selectedDirectory = form.directory || initialDirectory
  return <div className="modal-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget && !saving) onClose() }}>
    <ModalShell as="form" storageKey="save-as-v2" defaultWidth={520} defaultHeight={360} minWidth={420} minHeight={300} maxWidth={640} maxHeight={520} resizable={false} className="save-as-modal export-modal" onSubmit={(event) => { event.preventDefault(); void submit() }}>
      <DialogHeader eyebrow={t('saveAs.eyebrow')} title={t('saveAs.title')} closeLabel={t('common.close')} closeDisabled={saving} onClose={onClose} />
      <div className="modal-body component-scrollbar export-modal-body">
        <FormField className="export-file-field" label={t('saveAs.fileName')} hint={<span className="export-selected-directory" title={selectedDirectory}>{t('saveAs.selectedDirectory', { path: selectedDirectory })}</span>}>
          <div className="export-file-control">
            <TextInput autoFocus aria-label={t('saveAs.fileName')} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            <button type="button" className="icon-button" disabled={saving || choosingDirectory} title={t('saveAs.chooseLocation')} aria-label={t('saveAs.chooseLocation')} onClick={() => void chooseDirectory()}><PixelUtilityIcon kind="folderOpen" /></button>
          </div>
        </FormField>
        <div className="export-primary-fields">
          <FormField label={t('saveAs.format')}><ThemedSelect value={form.format} groups={[{ label: t('saveAs.formatGroup'), options: saveAsFormatOptions }]} label={t('saveAs.formatGroup')} onChange={(format) => setForm({ ...form, format })} /></FormField>
        </div>
        {form.format === 'moonsprite' && <CheckboxField className="save-as-timelapse-checkbox" checked={form.includeTimelapse ?? false} label={t('saveAs.includeTimelapse')} onChange={(includeTimelapse) => setForm({ ...form, includeTimelapse })} />}
        {flattened && <p className="modal-note save-as-format-warning">{t('saveAs.flattenedWarning')}</p>}
      </div>
      <footer><button type="button" className="quiet-button" disabled={saving} onClick={onClose}>{t('common.cancel')}</button><button type="submit" className="primary-button" disabled={saving || !form.name.trim()}><PixelUtilityIcon kind="save" />{t('common.save')}</button></footer>
    </ModalShell>
  </div>
}
