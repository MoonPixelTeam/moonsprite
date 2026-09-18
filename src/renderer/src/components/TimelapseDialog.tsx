import { useEffect, useMemo, useRef, useState } from 'react'
import type { TimelapseExportFormat, TimelapseRecordingMode, TimelapseSettings, TimelapseSnapshot } from '@shared/types-timelapse'
import { timelapsePreviewFramePlan, type TimelapseExportOptions } from '@/core/timelapse'
import { loadEditorPreferences } from '@/core/file-preferences'
import { resolveTheme } from '@/core/theme'
import { DialogHeader } from './DialogHeader'
import { ModalShell } from './ModalShell'
import { TimelapseExportDialog } from './dialogs/TimelapseExportDialog'
import { ThemedSelect } from './ThemedSelect'
import { useI18n } from './I18nProvider'
import { PreviewPlaybackControls } from './PreviewPlaybackControls'
import { PixelUtilityIcon } from './PixelUtilityIcon'
import { FormField } from './FormField'
import { PreferenceToggle } from './PreferenceToggle'
import { readTimelapseFrame } from '@/platform/timelapse-library'

interface TimelapseDialogProps {
  settings: TimelapseSettings
  documentName: string
  defaultDirectory: string
  onChange: (settings: Partial<Omit<TimelapseSettings, 'snapshots'>>) => void
  onClear: () => void
  onExport: (format: TimelapseExportFormat, options: TimelapseExportOptions) => Promise<boolean>
  onClose: () => void
}

export function TimelapseDialog({ documentName, defaultDirectory, settings, onChange, onClear, onExport, onClose }: TimelapseDialogProps) {
  const { t } = useI18n()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const previewStartFrameRef = useRef(0)
  const previewBitmapCacheRef = useRef(new Map<string, ImageBitmap>())
  const [previewPlaying, setPreviewPlaying] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [previewFrame, setPreviewFrame] = useState(0)
  const [exportOpen, setExportOpen] = useState(false)
  const [previewVisuals, setPreviewVisuals] = useState(() => {
    const preferences = loadEditorPreferences()
    return { checkerboard: preferences.checkerboard, background: resolveTheme(preferences.theme).variables['--theme-deep-surface'] }
  })
  const previewPlan = useMemo(() => timelapsePreviewFramePlan(settings), [settings.fps, settings.snapshots, settings.speed])
  const previewTimeline = useMemo(() => {
    const offsets = [0]
    for (const frame of previewPlan) offsets.push(offsets[offsets.length - 1] + frame.durationMs)
    return offsets
  }, [previewPlan])
  const previewPlanFrame = previewPlan[Math.min(previewFrame, Math.max(0, previewPlan.length - 1))]
  const snapshot = previewPlanFrame ? settings.snapshots[previewPlanFrame.snapshotIndex] : undefined
  const previewDurationMs = previewTimeline.at(-1) ?? 0
  const togglePreviewPlayback = (): void => {
    if (previewPlaying) {
      setPreviewPlaying(false)
      return
    }
    const lastFrame = Math.max(0, previewPlan.length - 1)
    const startFrame = previewFrame >= lastFrame ? 0 : previewFrame
    previewStartFrameRef.current = startFrame
    if (startFrame !== previewFrame) setPreviewFrame(startFrame)
    setPreviewPlaying(true)
  }

  useEffect(() => {
    if (previewFrame < previewPlan.length) return
    setPreviewFrame(Math.max(0, previewPlan.length - 1))
  }, [previewFrame, previewPlan.length])

  useEffect(() => {
    const syncPreferences = (): void => {
      const preferences = loadEditorPreferences()
      setPreviewVisuals({ checkerboard: preferences.checkerboard, background: resolveTheme(preferences.theme).variables['--theme-deep-surface'] })
    }
    window.addEventListener('moonsprite:preferences-changed', syncPreferences)
    return () => window.removeEventListener('moonsprite:preferences-changed', syncPreferences)
  }, [])

  useEffect(() => {
    if (!previewPlaying || previewPlan.length < 2 || previewDurationMs <= 0) return
    const lastFrame = previewPlan.length - 1
    const startFrame = Math.min(previewStartFrameRef.current, lastFrame)
    const startOffset = previewTimeline[startFrame] ?? 0
    const startedAt = performance.now()
    let animationFrame = 0
    const advance = (now: number): void => {
      const elapsed = startOffset + now - startedAt
      if (elapsed >= previewDurationMs) {
        setPreviewFrame(lastFrame)
        setPreviewPlaying(false)
        return
      }
      let low = 0
      let high = lastFrame
      while (low < high) {
        const middle = Math.ceil((low + high) / 2)
        if ((previewTimeline[middle] ?? 0) <= elapsed) low = middle
        else high = middle - 1
      }
      const nextFrame = low
      setPreviewFrame((frame) => frame === nextFrame ? frame : nextFrame)
      animationFrame = window.requestAnimationFrame(advance)
    }
    animationFrame = window.requestAnimationFrame(advance)
    return () => window.cancelAnimationFrame(animationFrame)
  }, [previewDurationMs, previewPlan.length, previewPlaying, previewTimeline])

  useEffect(() => () => {
    for (const bitmap of previewBitmapCacheRef.current.values()) bitmap.close()
    previewBitmapCacheRef.current.clear()
  }, [])

  useEffect(() => {
    if (exportOpen) return
    const canvas = canvasRef.current
    if (!canvas) return
    const renderEmpty = (): void => {
      canvas.width = 480
      canvas.height = 270
      const context = canvas.getContext('2d')
      if (!context) return
      context.fillStyle = previewVisuals.background
      context.fillRect(0, 0, canvas.width, canvas.height)
    }
    if (!snapshot) {
      renderEmpty()
      return
    }
    let canceled = false
    const render = async (frame: TimelapseSnapshot): Promise<void> => {
      const previewWidth = 480
      const previewHeight = 270
      let bitmap = previewBitmapCacheRef.current.get(frame.id)
      if (!bitmap) {
        const data = await readTimelapseFrame(frame)
        if (canceled) return
        const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
        bitmap = await createImageBitmap(new Blob([buffer], { type: 'image/png' }))
        if (canceled) { bitmap.close(); return }
        previewBitmapCacheRef.current.set(frame.id, bitmap)
        while (previewBitmapCacheRef.current.size > 8) {
          const oldest = previewBitmapCacheRef.current.keys().next().value
          if (!oldest) break
          previewBitmapCacheRef.current.get(oldest)?.close()
          previewBitmapCacheRef.current.delete(oldest)
        }
      } else {
        previewBitmapCacheRef.current.delete(frame.id)
        previewBitmapCacheRef.current.set(frame.id, bitmap)
      }
      if (canceled) {
        previewBitmapCacheRef.current.delete(frame.id)
        bitmap.close()
        return
      }
      canvas.width = previewWidth
      canvas.height = previewHeight
      const context = canvas.getContext('2d')
      if (!context) return
      const checkerSize = 8
      for (let y = 0; y < previewHeight; y += checkerSize) for (let x = 0; x < previewWidth; x += checkerSize) {
        const color = ((x / checkerSize + y / checkerSize) & 1) === 0 ? previewVisuals.checkerboard.lightColor : previewVisuals.checkerboard.darkColor
        context.fillStyle = `rgb(${color.r} ${color.g} ${color.b})`
        context.fillRect(x, y, checkerSize, checkerSize)
      }
      context.imageSmoothingEnabled = false
      const scale = Math.min(previewWidth / frame.width, previewHeight / frame.height)
      const width = Math.max(1, Math.round(frame.width * scale))
      const height = Math.max(1, Math.round(frame.height * scale))
      context.drawImage(bitmap, Math.floor((previewWidth - width) / 2), Math.floor((previewHeight - height) / 2), width, height)
    }
    setPreviewError('')
    void render(snapshot).catch(error => { if (!canceled) { setPreviewError(String(error)); setPreviewPlaying(false) } })
    return () => { canceled = true }
  }, [exportOpen, previewVisuals, snapshot])

  if (exportOpen) return <TimelapseExportDialog settings={settings} documentName={documentName} defaultDirectory={defaultDirectory} onExport={onExport} onCancel={() => setExportOpen(false)} onComplete={onClose} />

  return <div className="modal-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <ModalShell storageKey="timelapse-v3" defaultWidth={420} defaultHeight={525} fitContent={false} minWidth={420} minHeight={420} maxWidth={760} maxHeight={760} className="timelapse-modal" role="dialog" aria-modal="true" aria-labelledby="timelapse-title">
      <DialogHeader title={t('timelapse.title')} titleId="timelapse-title" closeLabel={t('common.close')} onClose={onClose} />
      <div className="modal-body timelapse-body component-scrollbar">
        <section className="timelapse-preview" aria-label={t('timelapse.preview')}>
          {previewError && <div role="alert"><p>{t('timelapse.previewUnavailable')}</p><p className="modal-note">{previewError}</p></div>}
          <div className="timelapse-preview-frame"><canvas ref={canvasRef} /></div>
          <PreviewPlaybackControls playing={previewPlaying} frame={previewFrame} frameCount={previewPlan.length} onToggle={togglePreviewPlayback} onSeek={(value) => { setPreviewPlaying(false); setPreviewFrame(value) }} />
        </section>
        <PreferenceToggle className="timelapse-toggle" checked={settings.enabled} label={t('timelapse.recording')} onChange={(enabled) => onChange({ enabled })} />
        <p className="modal-note">{t('timelapse.storageHint')}</p>
        <FormField label={t('timelapse.recordingMode')}>
          <ThemedSelect<TimelapseRecordingMode>
            value={settings.mode ?? 'smart'}
            groups={[{ label: t('timelapse.recordingMode'), options: [
              { value: 'full', label: t('timelapse.recordingModeFull'), description: t('timelapse.recordingModeFullHint') },
              { value: 'smart', label: t('timelapse.recordingModeSmart'), description: t('timelapse.recordingModeSmartHint') }
            ] }]}
            label={t('timelapse.recordingMode')}
            showOptionTooltips
            onChange={(mode) => onChange({ mode })}
          />
        </FormField>
        <PreferenceToggle className="timelapse-undo-toggle" checked={settings.recordUndoSteps === true} label={t('timelapse.recordUndoSteps')} tooltip={t('timelapse.recordUndoStepsHint')} onChange={(recordUndoSteps) => onChange({ recordUndoSteps })} />
        <section className="timelapse-output-summary" aria-label={t('timelapse.outputSummary')}>
          <div><span>{t('timelapse.capturedFrames')}</span><strong>{settings.snapshots.length.toLocaleString()}</strong></div>
        </section>
      </div>
      <footer className="timelapse-footer">
        <div className="timelapse-clear-actions">
          <button type="button" className="quiet-button timelapse-clear" disabled={settings.snapshots.length === 0} onClick={() => { setPreviewPlaying(false); setPreviewFrame(0); onClear() }}><PixelUtilityIcon kind="clearRecords" />{t('timelapse.clear')}</button>
        </div>
        <div className="timelapse-footer-actions"><button className="quiet-button" onClick={onClose}>{t('common.close')}</button><button className="primary-button" disabled={settings.snapshots.length === 0} onClick={() => { setPreviewPlaying(false); setExportOpen(true) }}><PixelUtilityIcon kind="export" />{t('timelapse.exportVideo')}</button></div>
      </footer>
    </ModalShell>
  </div>
}
