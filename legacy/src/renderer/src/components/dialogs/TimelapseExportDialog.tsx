import { chooseExportLocation } from '@/platform/export-location'
import { useMemo, useRef, useState } from 'react'
import type { TimelapseExportFormat, TimelapseQuality, TimelapseSettings } from '@shared/types-timelapse'
import { isTimelapseVideoFormat, timelapseImageOutputDimensions, timelapseOutputDimensions, timelapseOutputScale, timelapseSourceDurationMs, timelapseVideoFramePlan, type TimelapseExportMode, type TimelapseExportOptions } from '@/core/timelapse'
import { loadEditorPreferences, outputDirectoryForOperation } from '@/core/file-preferences'
import { sanitizeFileStem } from '@/core/document-files'
import { useWorkspace } from '@/store/workspace'
import { DialogHeader } from '../DialogHeader'
import { FormField } from '../FormField'
import { ModalShell } from '../ModalShell'
import { NumberInput } from '../NumberInput'
import { PixelUtilityIcon } from '../PixelUtilityIcon'
import { TextInput } from '../TextInput'
import { ThemedSelect } from '../ThemedSelect'
import { useI18n } from '../I18nProvider'

interface Props {
  settings: TimelapseSettings
  documentName: string
  defaultDirectory: string
  onExport: (format: TimelapseExportFormat, options: TimelapseExportOptions) => Promise<boolean>
  onCancel: () => void
  onComplete: () => void
}

export function TimelapseExportDialog({ settings, documentName, defaultDirectory, onExport, onCancel, onComplete }: Props) {
  const { t } = useI18n()
  const [format, setFormat] = useState<TimelapseExportFormat>('mp4')
  const [name, setName] = useState(() => `${sanitizeFileStem(documentName, 'MoonSprite')}-timelapse.mp4`)
  const [directory, setDirectory] = useState(() => outputDirectoryForOperation(loadEditorPreferences()) || defaultDirectory)
  const [exportMode, setExportMode] = useState<TimelapseExportMode>('duration')
  const [quality, setQuality] = useState(settings.quality)
  const [speed, setSpeed] = useState(settings.speed)
  const [durationSeconds, setDurationSeconds] = useState(() => Math.max(1, Math.round(timelapseSourceDurationMs(settings) / 1000 / Math.max(1, settings.speed))))
  const [exportScalePresets] = useState(() => loadEditorPreferences().exportScalePresets)
  const [imageScalePercent, setImageScalePercent] = useState(() => exportScalePresets.includes(100) ? 100 : exportScalePresets[0] ?? 100)
  const [pending, setPending] = useState(false)
  const submitting = useRef(false)
  const videoFormat = isTimelapseVideoFormat(format)
  const outputSettings = useMemo(() => ({ ...settings, quality, speed }), [settings, quality, speed])
  const exportOptions = useMemo<TimelapseExportOptions>(() => ({ mode: exportMode, durationSeconds, scalePercent: imageScalePercent, quality, speed, name, directory: directory.trim() || defaultDirectory }), [exportMode, durationSeconds, imageScalePercent, quality, speed, name, directory, defaultDirectory])
  const videoFramePlan = useMemo(() => timelapseVideoFramePlan(outputSettings, exportOptions), [outputSettings, exportOptions])
  const { width, height } = videoFormat ? timelapseOutputDimensions(outputSettings) : timelapseImageOutputDimensions(settings.snapshots, imageScalePercent)
  const outputDurationMs = videoFramePlan.reduce((total, frame) => total + frame.durationMs, 0)
  const outputDuration = outputDurationMs === 0 ? '0 s' : outputDurationMs < 10_000 ? `${(outputDurationMs / 1000).toFixed(1)} s` : `${Math.round(outputDurationMs / 1000)} s`
  const effectiveSpeed = outputDurationMs > 0 ? timelapseSourceDurationMs(settings) / outputDurationMs : speed
  const qualityOptions = (['low', 'medium', 'high'] as const).map(value => {
    const dimensions = timelapseOutputDimensions({ quality: value, snapshots: settings.snapshots })
    const label = t(value === 'low' ? 'timelapse.qualityLow' : value === 'medium' ? 'timelapse.qualityMedium' : 'timelapse.qualityHigh')
    const scale = timelapseOutputScale({ quality: value, snapshots: settings.snapshots })
    return { value, label: `${label} - ${scale}x - ${dimensions.width} x ${dimensions.height}` }
  })
  const chooseDirectory = async (): Promise<void> => {
    try {
      const result = await chooseExportLocation(window.moonSprite, directory || defaultDirectory, name, format)
      if (result) { setDirectory(result.directory); setName(result.name) }
    } catch (error) {
      useWorkspace.getState().setMessage(error instanceof Error ? error.message : String(error))
    }
  }
  const submit = async (): Promise<void> => {
    if (submitting.current || settings.snapshots.length === 0) return
    submitting.current = true
    setPending(true)
    try {
      if (await onExport(format, exportOptions)) onComplete()
    } catch (error) {
      useWorkspace.getState().setMessage(error instanceof Error ? error.message : t('timelapse.exportFailed'))
    } finally {
      submitting.current = false
      setPending(false)
    }
  }

  // The conflict dialog and progress dialog exclusively own input during export.
  // Keep this component mounted so canceling a conflict restores the user's form.
  if (pending) return null

  return <div className="modal-backdrop" role="presentation" onPointerDown={event => { if (event.target === event.currentTarget) onCancel() }}>
    <ModalShell as="form" storageKey="timelapse-export-v1" fitContentKey={`${format}:${exportMode}`} defaultWidth={520} defaultHeight={430} minWidth={420} minHeight={300} maxWidth={640} maxHeight={760} resizable={false} className="export-modal timelapse-export-modal" role="dialog" aria-modal="true" aria-labelledby="timelapse-export-title" onSubmit={event => { event.preventDefault(); void submit() }}>
      <DialogHeader title={`${t('timelapse.title')} · ${t('app.export.settings')}`} titleId="timelapse-export-title" closeLabel={t('common.close')} onClose={onCancel} />
      <div className="modal-body component-scrollbar export-modal-body">
        <FormField className="export-file-field" label={t('app.export.fileName')} hint={<span className="export-selected-directory" title={directory || defaultDirectory}>{t('app.export.selectedDirectory', { path: directory || defaultDirectory })}</span>}>
          <div className="export-file-control">
            <TextInput autoFocus aria-label={t('app.export.fileName')} value={name} onChange={event => setName(event.target.value)} />
            <button type="button" className="icon-button" title={t('app.export.choosePath')} aria-label={t('app.export.choosePath')} onClick={() => void chooseDirectory()}><PixelUtilityIcon kind="folderOpen" /></button>
          </div>
        </FormField>
        <div className="timelapse-config-grid">
          <FormField label={t('timelapse.exportFormat')}><ThemedSelect<TimelapseExportFormat> value={format} groups={[{ label: t('timelapse.exportFormat'), options: [{ value: 'mp4', label: 'MP4' }, { value: 'webm', label: 'WebM' }, { value: 'png', label: 'PNG' }, { value: 'jpeg', label: 'JPG' }] }]} label={t('timelapse.exportFormat')} onChange={value => { setFormat(value); setName(current => `${current.replace(/\.(mp4|webm|png|jpe?g)$/i, '')}.${value === 'jpeg' ? 'jpg' : value}`) }} /></FormField>
          {videoFormat ? <FormField label={t('timelapse.quality')}><ThemedSelect<TimelapseQuality> value={quality} groups={[{ label: t('timelapse.quality'), options: qualityOptions }]} label={t('timelapse.quality')} onChange={setQuality} /></FormField> : <><FormField className="timelapse-scale-field" label={t('timelapse.exportScale')}><NumberInput min={1} max={6400} value={imageScalePercent} suffix="%" onValueChange={setImageScalePercent} /></FormField><div className="timelapse-scale-presets scale-presets" aria-label={t('timelapse.exportScale')}>
            {exportScalePresets.map(scale => <button type="button" key={scale} className={imageScalePercent === scale ? 'selected' : ''} onClick={() => setImageScalePercent(scale)}>{`${scale}%`}</button>)}
          </div></>}
        </div>
        {videoFormat && <div className="timelapse-export-grid">
          <FormField label={t('timelapse.exportMode')}><ThemedSelect<TimelapseExportMode> value={exportMode} groups={[{ label: t('timelapse.exportMode'), options: [{ value: 'duration', label: t('timelapse.modeDuration'), description: t('timelapse.modeDurationHint') }, { value: 'speed', label: t('timelapse.modeSpeed'), description: t('timelapse.modeSpeedHint') }] }]} label={t('timelapse.exportMode')} onChange={setExportMode} /></FormField>
          {exportMode === 'duration' ? <FormField label={t('timelapse.duration')}><NumberInput live min={1} max={3600} value={durationSeconds} suffix="s" onValueChange={setDurationSeconds} /></FormField> : <FormField className="timelapse-speed-control" label={t('timelapse.speed')} hint={t('timelapse.speedHint')}><NumberInput live min={1} max={64} value={speed} suffix="x" onValueChange={setSpeed} /></FormField>}
        </div>}
        <section className={`timelapse-output-summary ${videoFormat ? 'is-video' : 'is-image'}`} aria-label={t('timelapse.outputSummary')}>
          <div><span>{t(videoFormat ? 'timelapse.outputSize' : 'timelapse.imageSize')}</span><strong>{width > 0 ? `${width} x ${height}` : '-'}</strong></div>
          <div><span>{t('timelapse.capturedFrames')}</span><strong>{settings.snapshots.length.toLocaleString()}</strong></div>
          {videoFormat ? <><div><span>{t('timelapse.speed')}</span><strong>{effectiveSpeed.toFixed(1)}x</strong></div><div><span>{t('timelapse.outputDuration')}</span><strong>{outputDuration}</strong></div></> : <div><span>{t('timelapse.exportScale')}</span><strong>{`${imageScalePercent}%`}</strong></div>}
        </section>
      </div>
      <footer><button type="button" className="quiet-button" onClick={onCancel}>{t('common.cancel')}</button><button type="submit" className="primary-button" disabled={settings.snapshots.length === 0}><PixelUtilityIcon kind="export" />{t(videoFormat ? 'timelapse.exportVideo' : 'timelapse.exportImages')}</button></footer>
    </ModalShell>
  </div>
}
