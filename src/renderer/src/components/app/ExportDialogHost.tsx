import { forwardRef, useImperativeHandle, useCallback, useRef, useState } from 'react'
import { DialogHeader } from '@/components/DialogHeader'
import { FormField } from '@/components/FormField'
import { NumberInput } from '@/components/NumberInput'
import { ModalShell } from '@/components/ModalShell'
import { PixelUtilityIcon } from '@/components/PixelUtilityIcon'
import { TextInput } from '@/components/TextInput'
import { ThemedSelect } from '@/components/ThemedSelect'
import { loadDocumentExportSettings, loadExportPresets, saveExportPresets, withExportFileExtension, type ExportPreset } from '@/core/export-settings'
import { EXPORT_FORMAT_PREFERENCE_KEY, imageExportKindForPreference, loadEditorPreferences, outputDirectoryForOperation } from '@/core/file-preferences'
import { readStoredString } from '@/core/storage'
import { type ExportOptions, useWorkspace } from '@/store/workspace'
import { useI18n } from '@/components/I18nProvider'
import { FileLocationPicker } from '@/components/FileLocationPicker'

export interface ExportDialogHandle {
  open(target?: NonNullable<ExportOptions['target']>): void
  closeIfOpen(): boolean
}
interface Props { defaultFileDirectories: { saveDirectory: string; exportDirectory: string }; exportScalePresets: number[] }

/** Owns export form state, presets, directory popover and in-flight submission. */
export const ExportDialogHost = forwardRef<ExportDialogHandle, Props>(function ExportDialogHost({defaultFileDirectories, exportScalePresets}, ref) {
  const { t } = useI18n()
  const [exportOpen, setExportOpen] = useState(false)
  const [exportForm, setExportForm] = useState<ExportOptions>({ name: 'MoonSprite-export.png', format: 'png-auto', scalePercent: 100, directory: 'exports', target: 'document', gifFrameRange: 'all', gifDirection: 'forward' })
  const [presetName, setPresetName] = useState('')
  const [presets, setPresets] = useState<ExportPreset[]>(loadExportPresets)
  const [exportPathMenuOpen, setExportPathMenuOpen] = useState(false)
  const exportActiveOperationRef = useRef<Promise<boolean> | null>(null)
  const activeId = useWorkspace(state => state.activeId)
  useWorkspace(state => exportOpen ? state.sessions.find(item => item.document.id === activeId)?.revision : null)
  const workspace = useWorkspace.getState()
  const session = workspace.sessions.find(item => item.document.id === activeId)
  const runExportActive = useCallback((options: ExportOptions): Promise<boolean> => {
    if (exportActiveOperationRef.current) return exportActiveOperationRef.current
    const operation = workspace.exportActive(options)
    exportActiveOperationRef.current = operation
    void operation.then(
      () => { if (exportActiveOperationRef.current === operation) exportActiveOperationRef.current = null },
      () => { if (exportActiveOperationRef.current === operation) exportActiveOperationRef.current = null }
    )
    return operation
  }, [workspace])

  const openExport = (requestedTarget?: NonNullable<ExportOptions['target']>): void => {
    if (!session) return
    const preferences = loadEditorPreferences()
    const remembered = loadDocumentExportSettings(session.document)
    const preferredFormat = imageExportKindForPreference(readStoredString(EXPORT_FORMAT_PREFERENCE_KEY))
    const frameCount = session.document.animation?.frames.length ?? 1
    const defaultFormat = requestedTarget === 'frames' ? (preferredFormat === 'gif' || preferredFormat === 'psd' ? 'png-auto' : preferredFormat) : frameCount > 1 ? 'gif' : preferredFormat
    const format = requestedTarget === 'frames' && (remembered?.format === 'gif' || remembered?.format === 'psd') ? 'png-auto' : remembered?.format ?? defaultFormat
    let target = requestedTarget ?? remembered?.target ?? 'document'
    if (format === 'psd') target = 'document'
    else if (format === 'gif' && target === 'frames') target = 'document'
    else if (target === 'frames' && requestedTarget !== 'frames' && frameCount <= 1) target = 'document'
    else if (target === 'slices' && !session.document.slices?.length) target = 'document'
    else if (target === 'selection' && !session.selection) target = 'document'
    const sliceId = target === 'slices' && remembered?.sliceId && session.document.slices?.some((slice) => slice.id === remembered.sliceId)
      ? remembered.sliceId
      : undefined
    const layerId = target === 'layer' && remembered?.layerId && session.document.layers.some((layer) => layer.id === remembered.layerId)
      ? remembered.layerId
      : undefined
    const defaultScale = format === 'svg' ? 100 : exportScalePresets.includes(100) ? 100 : exportScalePresets[0] ?? 100
    const documentName = session.document.name.replace(/\.(moonsprite|aseprite|ase|png|jpe?g|webp|svg|gif|psd)$/i, '') || 'MoonSprite-export'
    const gifFrameLimit = Math.max(1, frameCount)
    const rememberedLoopSectionId = remembered?.gifFrameRange === 'loop-section' && remembered.gifLoopSectionId && session.document.animation?.loopSections?.some((section) => section.id === remembered.gifLoopSectionId)
      ? remembered.gifLoopSectionId
      : undefined
    const gifFrameRange = remembered?.gifFrameRange === 'range' ? 'range' : rememberedLoopSectionId ? 'loop-section' : 'all'
    setExportForm({
      name: withExportFileExtension(remembered?.name ?? documentName, format),
      format,
      scalePercent: remembered?.scalePercent ?? defaultScale,
      trimMode: remembered?.trimMode ?? (remembered?.trim ? 'individual' : undefined),
      directory: outputDirectoryForOperation(preferences) || defaultFileDirectories.exportDirectory,
      target,
      ...(sliceId ? { sliceId } : {}),
      ...(layerId ? { layerId } : {}),
      gifFrameRange,
      ...(remembered?.gifFrameStart !== undefined ? { gifFrameStart: Math.min(gifFrameLimit, remembered.gifFrameStart) } : {}),
      ...(remembered?.gifFrameEnd !== undefined ? { gifFrameEnd: Math.min(gifFrameLimit, remembered.gifFrameEnd) } : {}),
      ...(rememberedLoopSectionId ? { gifLoopSectionId: rememberedLoopSectionId } : {}),
      gifDirection: remembered?.gifDirection ?? 'forward'
    })
    const rememberedPresetName = remembered?.presetName ?? ''
    setPresetName(presets.some((preset) => preset.presetName === rememberedPresetName && preset.format === format && (preset.target ?? 'document') === target) ? rememberedPresetName : '')
    setExportPathMenuOpen(false)
    setExportOpen(true)
  }

  const chooseExportDirectory = async (): Promise<void> => {
    const result = await window.moonSprite.chooseDirectory(exportForm.directory || defaultFileDirectories.exportDirectory)
    if (!result.canceled && result.directoryPath) setExportForm((current) => ({ ...current, directory: result.directoryPath }))
    setExportPathMenuOpen(false)
  }

  const savePreset = (): void => {
    const name = presetName.trim()
    if (!name) { workspace.setMessage(t('app.export.presetNameRequired')); return }
    const next = [...presets.filter((preset) => preset.presetName !== name), { ...exportForm, presetName: name }]
    if (!saveExportPresets(next)) { workspace.setMessage(t('app.export.presetSaveFailed')); return }
    setPresets(next)
    setPresetName(name)
    workspace.setMessage(t('app.export.presetSaved', { name }))
  }

  const deletePreset = (): void => {
    const name = presetName.trim()
    if (!name) return
    const next = presets.filter((preset) => preset.presetName !== name)
    if (!saveExportPresets(next)) { workspace.setMessage(t('app.export.presetSaveFailed')); return }
    setPresets(next)
    setPresetName('')
  }

  const exportSlices = session?.document.slices ?? []

  const projectFormat = exportForm.format === 'psd' || exportForm.format === 'ase' || exportForm.format === 'aseprite'

  const exportTarget: NonNullable<ExportOptions['target']> = projectFormat
    ? 'document'
    : exportForm.format === 'gif' && exportForm.target === 'frames'
    ? 'document'
    : exportForm.target === 'slices' && exportSlices.length === 0
      ? 'document'
      : exportForm.target ?? 'document'

  const exportLoopSections = session?.document.animation?.loopSections ?? []

  const selectedGifLoopSectionId = exportForm.gifFrameRange === 'loop-section' && exportForm.gifLoopSectionId && exportLoopSections.some((section) => section.id === exportForm.gifLoopSectionId)
    ? exportForm.gifLoopSectionId
    : ''

  const gifFrameRangeValue = selectedGifLoopSectionId ? `loop-section:${selectedGifLoopSectionId}` : exportForm.gifFrameRange === 'range' ? 'range' : 'all'

  const selectedExportSliceId = exportForm.sliceId && exportSlices.some((slice) => slice.id === exportForm.sliceId) ? exportForm.sliceId : ''

  const exportLayerOptions = session?.document.layers.map((layer) => ({ value: layer.id, label: layer.name })) ?? []

  const selectedExportLayerId = exportForm.layerId && exportLayerOptions.some((layer) => layer.value === exportForm.layerId) ? exportForm.layerId : ''

  const submitExport = async (openFolderAfterExport: boolean): Promise<void> => {
    const directory = exportForm.directory?.trim() || defaultFileDirectories.exportDirectory
    const selectedPresetName = presets.some((preset) => preset.presetName === presetName) ? presetName : undefined
    const exported = await runExportActive({
      ...exportForm,
      directory,
      target: exportTarget,
      sliceId: exportTarget === 'slices' ? selectedExportSliceId || undefined : undefined,
      layerId: exportTarget === 'layer' ? selectedExportLayerId || undefined : undefined,
      ...(selectedPresetName ? { presetName: selectedPresetName } : {})
    })
    if (!exported) return
    setExportOpen(false)
    if (!openFolderAfterExport) return
    try {
      await window.moonSprite.openDirectory(directory)
    } catch (error) {
      workspace.setMessage(error instanceof Error ? error.message : typeof error === 'string' ? error : t('app.export.openFolderFailed'))
    }
  }
  useImperativeHandle(ref, () => ({open: openExport, closeIfOpen: () => { if (!exportOpen) return false; setExportOpen(false); return true }}))
  return <>    {exportOpen && <div className="modal-backdrop modal-overlay-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) setExportOpen(false) }}>
      <ModalShell as="form" storageKey="export-layout-v2" fitContentKey={`${exportForm.format}:${exportTarget}:${exportForm.gifFrameRange ?? 'all'}`} defaultWidth={520} defaultHeight={520} minWidth={420} minHeight={360} maxWidth={640} maxHeight={760} resizable={false} className="export-modal" onSubmit={(event) => {
        event.preventDefault()
        void submitExport(false)
      }}>
        <DialogHeader eyebrow="EXPORT IMAGE" title={t('app.export.settings')} closeLabel={t('common.close')} onClose={() => setExportOpen(false)} />
        <div className="modal-body component-scrollbar export-modal-body">
          <FormField className="export-file-field" label={t('app.export.fileName')} hint={<span className="export-selected-directory" title={exportForm.directory || defaultFileDirectories.exportDirectory}>{t('app.export.selectedDirectory', { path: exportForm.directory || defaultFileDirectories.exportDirectory })}</span>}>
            <div className="export-file-control">
              <TextInput autoFocus aria-label={t('app.export.fileName')} value={exportForm.name} onChange={(event) => setExportForm({ ...exportForm, name: event.target.value })} />
              <FileLocationPicker directory={exportForm.directory || defaultFileDirectories.exportDirectory} defaultDirectory={defaultFileDirectories.exportDirectory} localGalleryDirectory={defaultFileDirectories.saveDirectory} open={exportPathMenuOpen} onOpenChange={setExportPathMenuOpen} onChooseDirectory={chooseExportDirectory} onSelectDirectory={(directory) => setExportForm((current) => ({ ...current, directory }))} />
            </div>
          </FormField>
          <div className="export-primary-fields">
            <FormField label={t('app.export.format')}><ThemedSelect<ExportOptions['format']> value={exportForm.format} groups={[{ label: t('app.export.formatGroup'), options: [{ value: 'png-auto', label: t('app.export.pngAuto') }, { value: 'png-rgba', label: t('app.export.pngRgba') }, { value: 'jpeg', label: t('app.export.jpegWhite') }, { value: 'webp', label: t('app.export.webp') }, { value: 'svg', label: t('app.export.svg') }, { value: 'gif', label: t('app.export.gif') }, { value: 'bmp', label: 'BMP (.bmp)' }, { value: 'ico', label: 'ICO (.ico)' }, { value: 'psd', label: t('app.export.psd'), description: t('app.export.psdDocumentOnly') }, { value: 'ase', label: t('app.export.ase'), description: t('app.export.projectDocumentOnly') }, { value: 'aseprite', label: t('app.export.aseprite'), description: t('app.export.projectDocumentOnly') }] }]} label={t('app.export.format')} onChange={(format) => setExportForm((current) => ({ ...current, name: withExportFileExtension(current.name, format), format, target: format === 'psd' || format === 'ase' || format === 'aseprite' || format === 'gif' && current.target === 'frames' ? 'document' : current.target, scalePercent: format === 'svg' ? 100 : current.scalePercent }))} /></FormField>
            <FormField label={t('app.export.target')}><ThemedSelect<NonNullable<ExportOptions['target']>> value={exportForm.target ?? 'document'} groups={[{ label: t('app.export.target'), options: [{ value: 'document', label: t('app.export.targetDocument') }, ...(!projectFormat ? [{ value: 'selection' as const, label: t('app.export.targetSelection') }, { value: 'layer' as const, label: t('app.export.targetLayer') }] : []), ...((session?.document.animation?.frames.length ?? 1) > 1 && exportForm.format !== 'gif' && !projectFormat ? [{ value: 'frames' as const, label: t('app.export.targetFrames') }] : []), ...(exportSlices.length && !projectFormat ? [{ value: 'slices' as const, label: t('app.export.targetSlices') }] : [])] }]} label={t('app.export.target')} onChange={(target) => setExportForm((current) => ({ ...current, target, sliceId: target === 'slices' ? selectedExportSliceId || undefined : undefined, layerId: target === 'layer' ? selectedExportLayerId || undefined : undefined }))} /></FormField>
            {exportTarget === 'slices' && <FormField className="export-slice-field" label={t('app.export.sliceSelection')}><ThemedSelect value={selectedExportSliceId} groups={[{ label: t('app.export.sliceSelection'), options: [{ value: '', label: t('app.export.allSlices') }, ...exportSlices.map((slice) => ({ value: slice.id, label: slice.name, description: `${slice.width} × ${slice.height} · ${slice.x}, ${slice.y}` }))] }]} label={t('app.export.sliceSelection')} onChange={(sliceId) => setExportForm({ ...exportForm, sliceId: sliceId || undefined })} /></FormField>}
            {exportTarget === 'layer' && <FormField className="export-layer-field" label={t('app.export.layerSelection')}><ThemedSelect value={selectedExportLayerId} groups={[{ label: t('app.export.layerSelection'), options: [{ value: '', label: t('app.export.allLayers') }, ...exportLayerOptions] }]} label={t('app.export.layerSelection')} onChange={(layerId) => setExportForm({ ...exportForm, layerId: layerId || undefined })} /></FormField>}
          </div>
          {exportForm.format === 'gif' && <section className="gif-export-options">
            <FormField label={t('app.export.gifRange')}><ThemedSelect value={gifFrameRangeValue} groups={[{ label: t('app.export.gifRange'), options: [{ value: 'all', label: t('app.export.gifAllFrames') }, { value: 'range', label: t('app.export.gifFrameRange') }, ...exportLoopSections.map((section) => ({ value: `loop-section:${section.id}`, label: t('app.export.gifLoopSection', { name: section.name }) }))] }]} label={t('app.export.gifRange')} onChange={(value) => setExportForm((current) => value.startsWith('loop-section:') ? { ...current, gifFrameRange: 'loop-section', gifLoopSectionId: value.slice('loop-section:'.length) } : { ...current, gifFrameRange: value === 'range' ? 'range' : 'all', gifLoopSectionId: undefined })} /></FormField>
            {exportForm.gifFrameRange === 'range' && <div className="gif-range-fields"><FormField label={t('app.export.gifStart')}><NumberInput min={1} max={session?.document.animation?.frames.length ?? 1} value={exportForm.gifFrameStart ?? 1} onValueChange={(gifFrameStart) => setExportForm({ ...exportForm, gifFrameStart })} /></FormField><FormField label={t('app.export.gifEnd')}><NumberInput min={1} max={session?.document.animation?.frames.length ?? 1} value={exportForm.gifFrameEnd ?? session?.document.animation?.frames.length ?? 1} onValueChange={(gifFrameEnd) => setExportForm({ ...exportForm, gifFrameEnd })} /></FormField></div>}
            <FormField label={t('app.export.gifDirection')}><ThemedSelect value={exportForm.gifDirection ?? 'forward'} groups={[{ label: t('app.export.gifDirection'), options: [{ value: 'forward', label: t('app.export.gifForward'), description: t('app.export.gifForwardHint') }, { value: 'reverse', label: t('app.export.gifReverse'), description: t('app.export.gifReverseHint') }, { value: 'forward-ping-pong', label: t('app.export.gifForwardPingPong'), description: t('app.export.gifForwardPingPongHint') }, { value: 'reverse-ping-pong', label: t('app.export.gifReversePingPong'), description: t('app.export.gifReversePingPongHint') }] }]} label={t('app.export.gifDirection')} onChange={(gifDirection) => setExportForm({ ...exportForm, gifDirection: gifDirection as NonNullable<ExportOptions['gifDirection']> })} /></FormField>
          </section>}
          <FormField className="export-scale-field" label={exportForm.format === 'svg' ? t('app.export.scale') : t('app.export.scalePercent')}><div className="scale-control"><NumberInput min={1} max={exportForm.format === 'svg' ? 64 : 6400} value={exportForm.format === 'svg' ? exportForm.scalePercent / 100 : exportForm.scalePercent} suffix={exportForm.format === 'svg' ? 'x' : '%'} onValueChange={(value) => setExportForm({ ...exportForm, scalePercent: exportForm.format === 'svg' ? Math.max(100, Math.round(value * 100)) : value })} /><div className="scale-presets" aria-label={exportForm.format === 'svg' ? t('app.export.scalePresets') : t('app.export.scalePercentPresets')}>{exportScalePresets.map((scale) => <button type="button" key={scale} className={exportForm.scalePercent === scale ? 'selected' : ''} onClick={() => setExportForm({ ...exportForm, scalePercent: scale })}>{exportForm.format === 'svg' ? `${scale / 100}x` : `${scale}%`}</button>)}</div></div></FormField>
          <FormField label={t('app.export.trim')}>
            <ThemedSelect value={exportForm.trimMode ?? ''} groups={[{ label: t('app.export.trim'), options: [
              { value: '', label: t('app.export.trimNone'), description: t('app.export.trimNoneHint') },
              { value: 'individual', label: t('app.export.trimIndividual'), description: t('app.export.trimIndividualHint') },
              { value: 'common', label: t('app.export.trimCommon'), description: t('app.export.trimCommonHint') }
            ] }]} label={t('app.export.trim')} onChange={(trimMode) => setExportForm((current) => ({ ...current, trim: undefined, trimMode: trimMode === 'individual' || trimMode === 'common' ? trimMode : undefined }))} />
          </FormField>
          <FormField className="export-preset-field" label={t('app.export.preset')}>
            <div className="export-preset-control">
              <ThemedSelect value={presetName} groups={[{ label: t('app.export.savedPresets'), options: [{ value: '', label: t('app.export.choosePreset') }, ...presets.map((preset) => ({ value: preset.presetName, label: `${preset.presetName} · ${preset.scalePercent}%` }))] }]} label={t('app.export.preset')} onChange={(value) => { const preset = presets.find((item) => item.presetName === value); setPresetName(value); if (preset) { const { presetName: _presetName, ...options } = preset; const sliceId = options.target === 'slices' && options.sliceId && exportSlices.some((slice) => slice.id === options.sliceId) ? options.sliceId : undefined; const layerId = options.target === 'layer' && options.layerId && exportLayerOptions.some((layer) => layer.value === options.layerId) ? options.layerId : undefined; setExportForm({ ...options, sliceId, layerId }) } }} />
              <div className="preset-row"><TextInput className="preset-name-input" aria-label={t('app.export.presetName')} placeholder={t('app.export.presetName')} value={presetName} onChange={(event) => setPresetName(event.target.value)} /><button type="button" className="quiet-button" onClick={savePreset}>{t('app.export.savePreset')}</button><button type="button" className="icon-button preset-delete" title={t('app.export.deletePreset')} aria-label={t('app.export.deletePreset')} disabled={!presets.some((preset) => preset.presetName === presetName)} onClick={deletePreset}><PixelUtilityIcon kind="delete" /></button></div>
            </div>
          </FormField>
        </div>
        <footer><button type="button" className="quiet-button" onClick={() => setExportOpen(false)}>{t('common.cancel')}</button><button type="button" className="quiet-button" onClick={() => void submitExport(true)}><PixelUtilityIcon kind="folderOpen" />{t('app.export.exportAndOpenFolder')}</button><button className="primary-button" type="submit"><PixelUtilityIcon kind="export" />{t('app.menu.file.export')}</button></footer>
      </ModalShell>
    </div>}
  </>
})
