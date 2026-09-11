import { useEffect, useState } from 'react'
import type { OutlineDirections, OutlineKernel, OutlinePosition, RgbaColor } from '@shared/types'
import { ColorValueControl } from '@/components/ColorValueControl'
import { DialogHeader } from '@/components/DialogHeader'
import { FormField } from '@/components/FormField'
import { useI18n } from '@/components/I18nProvider'
import { ModalShell } from '@/components/ModalShell'
import { LivePreviewToggle } from '@/components/LivePreviewToggle'
import { PreferenceToggle } from '@/components/PreferenceToggle'
import { RangeField } from '@/components/RangeField'
import { defaultOutlineSettings, normalizeOutlineSettings } from '@/core/outline-settings'
import { loadEditorPreferences } from '@/core/file-preferences'
import { useWorkspace, type DocumentSession } from '@/store/workspace'
import { OutlineStrokeControls } from '@/components/OutlineStrokeControls'

export function OutlineDialog({ open, session, onClose }: { open: boolean; session: DocumentSession; onClose: () => void }) {
  const { t } = useI18n()
  const setOutlinePreview = useWorkspace((state) => state.setOutlinePreview)
  const outlineActiveSelection = useWorkspace((state) => state.outlineActiveSelection)
  const [color, setColor] = useState<RgbaColor>(() => ({ ...session.primaryColor }))
  const [backgroundColor, setBackgroundColor] = useState<RgbaColor>(() => ({ r: 0, g: 0, b: 0, a: 0 }))
  const [thickness, setThickness] = useState(1)
  const [position, setPosition] = useState<OutlinePosition>('outside')
  const [kernel, setKernel] = useState<OutlineKernel>('round')
  const [edgeDirections, setEdgeDirections] = useState<OutlineDirections>(() => defaultOutlineSettings(session.primaryColor).directions)
  const [smartHue, setSmartHue] = useState(false)
  const [followOpacity, setFollowOpacity] = useState(false)
  const [smartHueDarkness, setSmartHueDarkness] = useState(() => defaultOutlineSettings(session.primaryColor).smartHueDarkness)
  const [previewEnabled, setPreviewEnabled] = useState(true)

  useEffect(() => {
    if (!open) {
      setOutlinePreview(null)
      return
    }
    const settings = (session.document.outlineSettings ? normalizeOutlineSettings(session.document.outlineSettings, session.primaryColor) : null)
      ?? (loadEditorPreferences().outlineSettings ? normalizeOutlineSettings(loadEditorPreferences().outlineSettings, session.primaryColor) : null)
      ?? defaultOutlineSettings(session.primaryColor)
    setColor({ ...settings.color })
    setBackgroundColor({ ...settings.backgroundColor })
    setThickness(settings.thickness)
    setPosition(settings.position)
    setKernel(settings.kernel)
    setEdgeDirections({ ...settings.directions })
    setSmartHue(settings.smartHue)
    setFollowOpacity(settings.followOpacity)
    setSmartHueDarkness(settings.smartHueDarkness)
    setPreviewEnabled(settings.previewEnabled)
  }, [open, session.document.id, session.primaryColor.r, session.primaryColor.g, session.primaryColor.b, session.primaryColor.a, setOutlinePreview])

  useEffect(() => {
    if (open && previewEnabled) setOutlinePreview({ color, backgroundColor, thickness, position, directions: edgeDirections, kernel, smartHue, smartHueDarkness, followOpacity })
    else setOutlinePreview(null)
  }, [open, previewEnabled, color, backgroundColor, thickness, position, edgeDirections, kernel, smartHue, smartHueDarkness, followOpacity, setOutlinePreview])

  const close = (): void => { setOutlinePreview(null); onClose() }
  const submit = (): void => {
    if (outlineActiveSelection({ color, backgroundColor, thickness, position, directions: edgeDirections, kernel, smartHue, smartHueDarkness, followOpacity, previewEnabled })) close()
  }

  useEffect(() => {
    if (!open) return
    const keydown = (event: KeyboardEvent): void => {
      if (event.key !== 'Enter' || event.isComposing || (event.target as HTMLElement | null)?.tagName === 'TEXTAREA') return
      if ((event.target as Element | null)?.closest?.('.outline-modal')) return
      event.preventDefault()
      event.stopPropagation()
      submit()
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [open, color, backgroundColor, thickness, position, edgeDirections, kernel, smartHue, smartHueDarkness, followOpacity, previewEnabled])

  if (!open) return null

  return <div className="modal-backdrop" role="presentation">
    <ModalShell as="form" storageKey="outline-v6" defaultWidth={400} defaultHeight={410} minWidth={390} minHeight={380} maxWidth={480} maxHeight={540} className="outline-modal" onSubmit={(event) => { event.preventDefault(); submit() }} onKeyDown={(event) => {
      if (event.key !== 'Enter' || event.nativeEvent.isComposing || (event.target as HTMLElement).tagName === 'TEXTAREA') return
      event.stopPropagation()
      if (event.defaultPrevented) return
      event.preventDefault()
      submit()
    }}>
      <DialogHeader eyebrow="OUTLINE" title={t('outline.title')} closeLabel={t('common.close')} onClose={close} />
      <div className="modal-body outline-modal-body">
        <div className="outline-tone-settings">
          <PreferenceToggle label={t('outline.smartHue')} tooltip={t('outline.smartHueDescription')} checked={smartHue} onChange={setSmartHue} />
          <PreferenceToggle label="跟随不透明度" tooltip="根据相邻源像素的不透明度调整描边透明度。关闭时使用描边颜色自身的透明度。" checked={followOpacity} onChange={setFollowOpacity} />
          {!smartHue && <FormField className="outline-color-field" layout="inline" label={t('outline.color')}><ColorValueControl color={color} density="regular" onChange={setColor} label={t('outline.color')} storageKey="selection-outline" fillWithColor inPalette={false} /></FormField>}
          <FormField className="outline-color-field" layout="inline" label={t('outline.backgroundColor')}><ColorValueControl color={backgroundColor} density="regular" onChange={setBackgroundColor} label={t('outline.backgroundColor')} storageKey="selection-outline-background" fillWithColor inPalette={false} /></FormField>
          {smartHue && <RangeField className="outline-smart-darkness" label={t('outline.smartHueDarkness')} min={0} max={100} suffix="%" value={smartHueDarkness} onChange={setSmartHueDarkness} />}
        </div>
        <div className="outline-stroke-controls"><OutlineStrokeControls variant="dialog" thickness={thickness} position={position} positions={['outside', 'inside', 'both']} kernel={kernel} directions={edgeDirections} onThicknessChange={setThickness} onPositionChange={setPosition} onPatternChange={(nextKernel, nextDirections) => { setKernel(nextKernel); setEdgeDirections(nextDirections) }} /></div>
      </div>
      <footer><LivePreviewToggle checked={previewEnabled} onChange={setPreviewEnabled} /><span className="modal-footer-spacer" /><button type="button" className="quiet-button" onClick={close}>{t('common.cancel')}</button><button type="submit" className="primary-button">{t('outline.apply')}</button></footer>
    </ModalShell>
  </div>
}
