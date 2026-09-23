import { useRef, useState } from 'react'
import { useI18n } from '@/components/I18nProvider'
import { ThemedSelect } from '@/components/ThemedSelect'
import { Button } from '@/components/Button'
import { PreferenceToggle } from '@/components/PreferenceToggle'
import { FormField } from '@/components/FormField'
import { SettingsSection } from '@/components/SettingsSection'
import type { TabletPreferences } from '@/core/file-preferences'
import './tablet-workspace.css'

export function TabletInputSettings({ value, onChange }: { value: TabletPreferences; onChange: (next: TabletPreferences) => void }) {
  const { t } = useI18n()
  const [sample, setSample] = useState({ type: '—', pressure: 0, tiltX: 0, tiltY: 0, twist: 0, buttons: 0 })
  const [tested, setTested] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)
  return <div className="tablet-settings touch-controls">
    <FormField label={t('tablet.layout')} hint={t('tablet.hint')}>
      <ThemedSelect value={value.touchUi} label={t('tablet.layout')} groups={[{ label: '', options: (['auto', 'on', 'off'] as const).map(mode => ({ value: mode, label: t(`tablet.${mode}`) })) }]} onChange={touchUi => onChange({ ...value, touchUi })} />
    </FormField>
    <FormField label={t('tablet.side')}>
      <ThemedSelect value={value.touchBarSide} label={t('tablet.side')} groups={[{ label: '', options: [{ value: 'left', label: t('tablet.sideLeft') }, { value: 'right', label: t('tablet.sideRight') }] }]} onChange={touchBarSide => onChange({ ...value, touchBarSide })} />
    </FormField>
    {([['gestureUndoEnabled', 'tablet.gestureUndo'], ['rotationSnapEnabled', 'tablet.rotationSnap'], ['longPressEyedropper', 'tablet.longPress']] as const).map(([key, label]) =>
      <PreferenceToggle key={key} checked={value[key]} label={t(label)} onChange={checked => onChange({ ...value, [key]: checked })} />)}
    <SettingsSection title={t('tablet.test')}>
      <div className="settings-section-body tablet-input-test">
        <canvas ref={canvas} width={520} height={100} aria-label={t('tablet.testHint')}
          onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); setTested(true) }}
          onPointerMove={event => {
            setSample({ type: event.pointerType, pressure: event.pressure, tiltX: event.tiltX, tiltY: event.tiltY, twist: event.twist, buttons: event.buttons })
            if (!event.buttons) return
            const rect = event.currentTarget.getBoundingClientRect(), context = event.currentTarget.getContext('2d')
            if (context && rect.width > 0 && rect.height > 0) {
              context.fillStyle = getComputedStyle(event.currentTarget).getPropertyValue('--theme-accent').trim()
              context.beginPath(); context.arc((event.clientX - rect.left) * 520 / rect.width, (event.clientY - rect.top) * 100 / rect.height, Math.max(1, event.pressure * 8), 0, Math.PI * 2); context.fill()
            }
          }} />
        <output>{t('tablet.telemetry', { ...sample, pressure: sample.pressure.toFixed(2) })}</output>
        <Button disabled={!tested} onClick={() => { canvas.current?.getContext('2d')?.clearRect(0, 0, 520, 100); setTested(false) }}>{t('tablet.clearTest')}</Button>
      </div>
    </SettingsSection>
  </div>
}
