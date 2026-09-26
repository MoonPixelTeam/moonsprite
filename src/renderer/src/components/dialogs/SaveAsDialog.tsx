import { chooseExportLocation } from '@/platform/export-location'
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
import { FileLocationPicker } from '@/components/FileLocationPicker'
import { NumberInput } from '@/components/NumberInput'

interface SaveAsDialogProps {
  initialName: string
  initialFormat: SaveAsOptions['format']
  initialDirectory: string
  localGalleryDirectory?: string
  projectRootDirectory?: string
  exportScalePresets: readonly number[]
  onSave: (options: SaveAsOptions) => Promise<boolean>
  onClose: () => void
}

export function SaveAsDialog({ initialName, initialFormat, initialDirectory, localGalleryDirectory = initialDirectory, projectRootDirectory = '', exportScalePresets, onSave, onClose }: SaveAsDialogProps) {
  const { t } = useI18n()
  const saveAsFormatOptions: Array<{ value: SaveAsOptions['format']; label: string }> = [
    { value: 'moonsprite', label: t('saveAs.format.moonsprite') },
    { value: 'png-auto', label: t('saveAs.format.pngAuto') },
    { value: 'png-rgba', label: t('saveAs.format.pngRgba') },
    { value: 'jpeg', label: t('saveAs.format.jpeg') },
    { value: 'webp', label: t('saveAs.format.webp') },
    { value: 'svg', label: 'SVG (.svg)' },
    { value: 'ico', label: 'ICO (.ico)' },
    { value: 'gif', label: 'GIF (.gif)' },
    { value: 'bmp', label: 'BMP (.bmp)' },
    { value: 'psd', label: t('saveAs.format.psd') },
    { value: 'ase', label: t('saveAs.format.ase') },
    { value: 'aseprite', label: t('saveAs.format.aseprite') }
  ]
  const [form, setForm] = useState<SaveAsOptions>({ name: initialName, format: initialFormat, scalePercent: 100, directory: initialDirectory })
  const [saving, setSaving] = useState(false)
  const [pathMenuOpen, setPathMenuOpen] = useState(false)
  const chooseDirectory = async (directory: string): Promise<void> => {
    const result = await chooseExportLocation(window.moonSprite, directory, form.name, form.format, true)
    if (result) setForm(current => ({ ...current, ...result }))
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
  const flattened = form.format === 'png-auto' || form.format === 'png-rgba' || form.format === 'jpeg' || form.format === 'webp' || form.format === 'svg' || form.format === 'ico' || form.format === 'gif' || form.format === 'bmp'
  const selectedDirectory = form.directory || initialDirectory
  return <div className="modal-backdrop modal-overlay-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget && !saving) onClose() }}>
    <ModalShell as="form" storageKey="save-as-v2" defaultWidth={520} minWidth={420} minHeight={0} maxWidth={640} maxHeight={520} fitContent fitContentKey={`${form.format}:${form.includeTimelapse ?? false}`} resizable={false} className="save-as-modal export-modal" onSubmit={(event) => { event.preventDefault(); void submit() }}>
      <DialogHeader eyebrow={t('saveAs.eyebrow')} title={t('saveAs.title')} closeLabel={t('common.close')} closeDisabled={saving} onClose={onClose} />
      <div className="modal-body component-scrollbar export-modal-body">
        <FormField className="export-file-field" label={t('saveAs.fileName')} hint={<span className="export-selected-directory" title={selectedDirectory}>{t('saveAs.selectedDirectory', { path: selectedDirectory })}</span>}>
          <div className="export-file-control">
            <TextInput autoFocus aria-label={t('saveAs.fileName')} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            <FileLocationPicker directory={selectedDirectory} defaultDirectory={initialDirectory} localGalleryDirectory={localGalleryDirectory} projectRootDirectory={projectRootDirectory} recentPathKind="save" open={pathMenuOpen} onOpenChange={setPathMenuOpen} onChooseDirectory={chooseDirectory} onSelectDirectory={(directory) => setForm((current) => ({ ...current, directory }))} disabled={saving} />
          </div>
        </FormField>
        <div className="export-primary-fields">
          <FormField label={t('saveAs.format')}><ThemedSelect value={form.format} groups={[{ label: t('saveAs.formatGroup'), options: saveAsFormatOptions }]} label={t('saveAs.formatGroup')} onChange={(format) => setForm({ ...form, format })} /></FormField>
        </div>
        {flattened && <FormField className="export-scale-field" label={form.format === 'svg' ? t('app.export.scale') : t('app.export.scalePercent')}><div className="scale-control"><NumberInput min={1} max={form.format === 'svg' ? 64 : 6400} value={form.format === 'svg' ? form.scalePercent / 100 : form.scalePercent} suffix={form.format === 'svg' ? 'x' : '%'} onValueChange={(value) => setForm((current) => ({ ...current, scalePercent: current.format === 'svg' ? Math.max(100, Math.round(value * 100)) : value }))} /><div className="scale-presets" aria-label={form.format === 'svg' ? t('app.export.scalePresets') : t('app.export.scalePercentPresets')}>{exportScalePresets.map((scale) => <button type="button" key={scale} className={form.scalePercent === scale ? 'selected' : ''} onClick={() => setForm((current) => ({ ...current, scalePercent: scale }))}>{form.format === 'svg' ? `${scale / 100}x` : `${scale}%`}</button>)}</div></div></FormField>}
        {form.format === 'moonsprite' && <CheckboxField className="save-as-timelapse-checkbox" checked={form.includeTimelapse ?? false} label={t('saveAs.includeTimelapse')} onChange={(includeTimelapse) => setForm({ ...form, includeTimelapse })} />}
        {flattened && <p className="modal-note save-as-format-warning">{t('saveAs.flattenedWarning')}</p>}
      </div>
      <footer><button type="button" className="quiet-button" disabled={saving} onClick={onClose}>{t('common.cancel')}</button><button type="submit" className="primary-button" disabled={saving || !form.name.trim()}><PixelUtilityIcon kind="save" />{t('common.save')}</button></footer>
    </ModalShell>
  </div>
}
