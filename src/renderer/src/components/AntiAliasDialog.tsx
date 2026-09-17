import { useEffect, useRef, useState } from 'react'
import type { AntiAliasColorSource } from '@shared/types-brush'
import type { RgbaColor } from '@shared/types-color'
import { ColorValueControl } from '@/components/ColorValueControl'
import { DialogHeader } from '@/components/DialogHeader'
import { FormField } from '@/components/FormField'
import { ModalShell } from '@/components/ModalShell'
import { LivePreviewToggle } from '@/components/LivePreviewToggle'
import { useI18n } from '@/components/I18nProvider'
import { useWorkspace, type AntiAliasPreview, type DocumentSession } from '@/store/workspace'
import { PreferenceToggle } from '@/components/PreferenceToggle'
import { RangeField } from '@/components/RangeField'
import { SegmentedControl } from '@/components/SegmentedControl'

export function AntiAliasDialog({ session, onClose }: { session: DocumentSession; onClose: () => void }) {
  const { t } = useI18n()
  const antiAliasSelection = useWorkspace((state) => state.antiAliasSelection)
  const previewAntiAliasSelection = useWorkspace((state) => state.previewAntiAliasSelection)
  const restoreAntiAliasPreview = useWorkspace((state) => state.restoreAntiAliasPreview)
  const [color, setColor] = useState<RgbaColor>(() => ({ ...session.primaryColor }))
  const [autoColor, setAutoColor] = useState(true)
  const [autoColorOpacity, setAutoColorOpacity] = useState(50)
  const [includeInteriorColors, setIncludeInteriorColors] = useState(false)
  const [colorSource, setColorSource] = useState<AntiAliasColorSource>('automatic')
  const [previewEnabled, setPreviewEnabled] = useState(true)
  const previewRef = useRef<AntiAliasPreview | null>(null)
  const previewFrameRef = useRef<number | null>(null)

  const cancelScheduledPreview = (): void => {
    if (previewFrameRef.current === null) return
    window.cancelAnimationFrame(previewFrameRef.current)
    previewFrameRef.current = null
  }

  const restorePreview = (): void => {
    if (!previewRef.current) return
    restoreAntiAliasPreview(previewRef.current)
    previewRef.current = null
  }

  useEffect(() => {
    setColor({ ...session.primaryColor })
  }, [session.document.id])

  const close = (): void => {
    cancelScheduledPreview()
    restorePreview()
    onClose()
  }

  const submit = (): void => {
    cancelScheduledPreview()
    restorePreview()
    if (antiAliasSelection(autoColor ? null : color, autoColorOpacity, includeInteriorColors, colorSource)) onClose()
  }

  useEffect(() => {
    cancelScheduledPreview()
    previewFrameRef.current = window.requestAnimationFrame(() => {
      previewFrameRef.current = null
      if (!previewEnabled) {
        restorePreview()
        return
      }
      previewRef.current = previewAntiAliasSelection(autoColor ? null : color, autoColorOpacity, includeInteriorColors, colorSource, previewRef.current)
    })
    return cancelScheduledPreview
  }, [previewEnabled, autoColor, color, autoColorOpacity, includeInteriorColors, colorSource, session.document.id, previewAntiAliasSelection])

  useEffect(() => () => {
    cancelScheduledPreview()
    restorePreview()
  }, [])

  return <div className="modal-backdrop" role="presentation">
    <ModalShell as="form" data-preserve-animation-selection storageKey="anti-alias" defaultWidth={440} defaultHeight={300} minWidth={360} minHeight={230} maxWidth={560} maxHeight={420} className="anti-alias-modal" role="dialog" aria-modal="true" aria-labelledby="anti-alias-title" onSubmit={(event) => { event.preventDefault(); submit() }}>
      <DialogHeader eyebrow="ANTI-ALIAS" title={t('quickCommands.quickAntiAlias')} titleId="anti-alias-title" closeLabel={t('common.close')} onClose={close} />
      <div className="modal-body anti-alias-modal-body">
        <div className="anti-alias-mode-card">
          <PreferenceToggle className="anti-alias-auto-toggle" label={t('antiAlias.autoColor')} tooltip={t('antiAlias.autoColorDescription')} checked={autoColor} onChange={setAutoColor} />
          {autoColor && <div className="anti-alias-auto-settings">
            <SegmentedControl<AntiAliasColorSource> className="anti-alias-color-source" label={t('antiAlias.colorSource')} options={[{ value: 'automatic', label: t('antiAlias.autoColor') }, { value: 'canvas', label: t('antiAlias.colorSource.canvas') }, { value: 'palette', label: t('antiAlias.colorSource.palette') }]} value={colorSource} onChange={setColorSource} />
            {colorSource === 'automatic' && <RangeField className="anti-alias-opacity" density="compact" label={t('antiAlias.opacity')} min={0} max={100} suffix="%" value={autoColorOpacity} onChange={setAutoColorOpacity} />}
          </div>}
          {!autoColor && <FormField className="anti-alias-custom-color" layout="inline" label={t('outline.color')}><ColorValueControl color={color} density="regular" onChange={setColor} label={t('outline.color')} storageKey="anti-alias-color" fillWithColor inPalette={false} /></FormField>}
        </div>
        <PreferenceToggle className="anti-alias-interior-toggle" label={t('antiAlias.includeInteriorColors')} tooltip={t('antiAlias.includeInteriorColorsDescription')} checked={includeInteriorColors} onChange={setIncludeInteriorColors} />
      </div>
      <footer><LivePreviewToggle checked={previewEnabled} onChange={setPreviewEnabled} /><span className="modal-footer-spacer" /><button type="button" className="quiet-button" onClick={close}>{t('common.cancel')}</button><button type="submit" className="primary-button">{t('common.apply')}</button></footer>
    </ModalShell>
  </div>
}
