import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckboxField } from '@/components/CheckboxField'
import { Button } from '@/components/Button'
import { SegmentedControl } from '@/components/SegmentedControl'
import { DialogHeader } from '@/components/DialogHeader'
import { LivePreviewToggle } from '@/components/LivePreviewToggle'
import { ModalShell } from '@/components/ModalShell'
import { useI18n } from '@/components/I18nProvider'
import { CONVOLUTION_PRESETS, type ConvolutionOptions } from '@/core/convolution-matrix'
import { useWorkspace } from '@/store/workspace'
import type { ConvolutionPreviewHandle } from '@/store/workspace-convolution-preview'

export function ConvolutionMatrixDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n()
  const [preset, setPreset] = useState(CONVOLUTION_PRESETS.find(item => item.id === 'blur-3x3')!)
  const [channels, setChannels] = useState({ ...preset.channels })
  const [tiled, setTiled] = useState(false), [live, setLive] = useState(true)
  const [busy, setBusy] = useState(false), [rendering, setRendering] = useState(false)
  const [error, setError] = useState('')
  const preview = useRef<ConvolutionPreviewHandle | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const request = useRef(0), applied = useRef<ConvolutionOptions | null>(null)
  const options = useMemo(() => ({ presetId: preset.id, channels, tiled }), [preset.id, channels, tiled])
  useEffect(() => {
    try { preview.current = useWorkspace.getState().beginConvolutionPreview() }
    catch (reason) { setError(String(reason)) }
    return () => { request.current++; preview.current?.cancel(); preview.current = null }
  }, [])
  useEffect(() => {
    const ticket = ++request.current
    timer.current = window.setTimeout(() => {
      if (!preview.current) return
      setRendering(live)
      setError('')
      void preview.current.update(live && applied.current !== options ? options : null).catch(reason => {
        if (request.current === ticket) setError(String(reason))
      }).finally(() => { if (request.current === ticket) setRendering(false) })
    }, 40)
    return () => window.clearTimeout(timer.current)
  }, [options, live])
  const apply = async (close: boolean): Promise<void> => {
    if (busy || !preview.current) return
    window.clearTimeout(timer.current)
    request.current++
    setBusy(true)
    setError('')
    try {
      // Done after Apply accepts the already committed result without filtering twice.
      if (!close || applied.current !== options) await preview.current.apply(options)
      applied.current = options
      if (close) onClose()
    } catch (reason) { setError(String(reason)) }
    finally { setBusy(false); setRendering(false) }
  }
  return <div className="modal-backdrop" role="presentation" onPointerDown={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <ModalShell as="form" className="convolution-modal" storageKey="convolution-matrix-compact" defaultWidth={460} defaultHeight={430} minWidth={400} minHeight={330} maxWidth={700} maxHeight={800} role="dialog" aria-modal="true" aria-labelledby="convolution-title" onSubmit={event => { event.preventDefault(); void apply(true) }}>
      <DialogHeader title={t('convolution.title')} titleId="convolution-title" closeLabel={t('common.close')} onClose={() => { if (!busy) onClose() }} />
      <div className="modal-body convolution-body">
        <div className="convolution-presets">
          <SegmentedControl className="convolution-preset-list component-scrollbar" layout="vertical" label={t('convolution.presets')} value={preset.id} options={CONVOLUTION_PRESETS.map(item => ({ value: item.id, label: item.id, disabled: busy }))} onChange={value => {
            const selected = CONVOLUTION_PRESETS.find(item => item.id === value)!
            setPreset(selected); setChannels({ ...selected.channels })
          }} />
        </div>
        <div className="convolution-settings">
          <Button type="submit" variant="primary" disabled={busy || !preview.current}>{t('convolution.done')}</Button>
          <Button disabled={busy || !preview.current} onClick={() => { void apply(false) }}>{t('common.apply')}</Button>
          <Button disabled={busy} onClick={onClose}>{t('common.cancel')}</Button>
          <div role="group" aria-label={t('convolution.channels')} className="convolution-channels">
            {(['r', 'g', 'b', 'a'] as const).map(channel => <Button key={channel} disabled={busy} aria-pressed={channels[channel]} variant={channels[channel] ? 'primary' : 'quiet'} onClick={() => setChannels(previous => ({ ...previous, [channel]: !previous[channel] }))}>{channel.toUpperCase()}</Button>)}
          </div>
          <CheckboxField label={t('convolution.tiled')} checked={tiled} disabled={busy} onChange={setTiled} />
          <p className="modal-note" role="status">{busy || rendering ? t('convolution.processing') : '\u00a0'}</p>
          {error && <p role="alert">{error}</p>}
        </div>
      </div>
      <footer><LivePreviewToggle checked={live} onChange={value => { if (!busy) setLive(value) }} /></footer>
    </ModalShell>
  </div>
}
