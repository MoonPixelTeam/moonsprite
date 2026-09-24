import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { DEFAULT_TWEEN_CURVE, type TweenCurve, type TweenEasing } from '@/core/tween-easing'
import { TweenEasingEditor } from './TweenEasingEditor'
import { ModalShell } from './ModalShell'
import { DialogHeader } from './DialogHeader'
import { Button } from './Button'
import { FormField } from './FormField'
import { ThemedSelect } from './ThemedSelect'
import { useI18n } from './I18nProvider'

export function TweenEasingDialog({ easing, curve, frameCount, onApply, onCancel }: {
  easing: TweenEasing; curve?: TweenCurve; frameCount: number
  onApply(easing: TweenEasing, curve: TweenCurve): void; onCancel(): void
}) {
  const { t } = useI18n()
  const [draftEasing, setDraftEasing] = useState(easing)
  const [draftCurve, setDraftCurve] = useState<TweenCurve>(() => [...(curve ?? DEFAULT_TWEEN_CURVE)])
  const root = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    root.current?.querySelector<HTMLButtonElement>('button')?.focus()
    return () => previous?.focus({ preventScroll: true })
  }, [])
  return createPortal(<div ref={root} className="modal-backdrop dialog-backdrop tween-easing-backdrop" role="presentation" onKeyDown={event => {
    event.stopPropagation()
    if (event.key === 'Escape' && !event.defaultPrevented && !(event.target as Element).closest('.themed-select-popover')) { event.preventDefault(); onCancel() }
    if (event.key === 'Tab') {
      const items = Array.from(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]') ?? [])
      const index = items.indexOf(document.activeElement as HTMLElement)
      if (items.length && ((event.shiftKey && index <= 0) || (!event.shiftKey && index === items.length - 1))) {
        event.preventDefault(); items[event.shiftKey ? items.length - 1 : 0].focus()
      }
    }
  }}>
    <ModalShell data-preserve-animation-selection role="dialog" aria-modal="true" aria-label={t('timeline.tween.curveEdit')} storageKey="animation-tween-easing" className="layer-modal tween-easing-dialog" defaultWidth={560} defaultHeight={680} minWidth={390} minHeight={420} maxWidth={820} maxHeight={960}>
      <DialogHeader title={t('timeline.tween.curveEdit')} closeLabel={t('common.close')} onClose={onCancel} />
      <div className="modal-body">
        <FormField label={t('timeline.tween.easing')}><ThemedSelect label={t('timeline.tween.easing')} value={draftEasing} preserveAnimationSelection groups={[{ label: t('timeline.tween.easing'), options: (['linear', 'ease-in', 'ease-out', 'ease-in-out', 'custom'] as const).map(value => ({ value, label: t(`timeline.tween.${value}`) })) }]} onChange={setDraftEasing} /></FormField>
        <TweenEasingEditor easing={draftEasing} curve={draftCurve} frameCount={frameCount} onChange={next => { setDraftEasing('custom'); setDraftCurve(next) }} />
      </div>
      <footer><span className="modal-footer-spacer" /><Button onClick={onCancel}>{t('common.cancel')}</Button><Button variant="primary" onClick={() => onApply(draftEasing, draftCurve)}>{t('common.apply')}</Button></footer>
    </ModalShell>
  </div>, document.body)
}
