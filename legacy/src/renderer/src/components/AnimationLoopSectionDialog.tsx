import { createPortal } from 'react-dom'
import { useState } from 'react'
import type { AnimationLoopDirection } from '@shared/types-animation'
import { CheckboxField } from '@/components/CheckboxField'
import { DialogHeader } from '@/components/DialogHeader'
import { FormField } from '@/components/FormField'
import { ModalShell } from '@/components/ModalShell'
import { NumberInput } from '@/components/NumberInput'
import { SettingsSection } from '@/components/SettingsSection'
import { TextInput } from '@/components/TextInput'
import { ThemedSelect, type ThemedSelectGroup } from '@/components/ThemedSelect'
import { MAX_ANIMATION_LOOP_REPEAT_COUNT } from '@/core/animation-loop-sections'
import { useI18n } from '@/components/I18nProvider'

export interface AnimationLoopSectionDraft {
  name: string
  startFrame: number
  endFrame: number
  direction: AnimationLoopDirection
  repeatCount: number | null
}

export function AnimationLoopSectionDialog({ mode, frameCount, initialValue, onClose, onConfirm }: {
  mode: 'create' | 'edit'
  frameCount: number
  initialValue: AnimationLoopSectionDraft
  onClose: () => void
  onConfirm: (value: AnimationLoopSectionDraft) => void
}) {
  const { t } = useI18n()
  const [draft, setDraft] = useState(initialValue)
  const directionGroups: Array<ThemedSelectGroup<AnimationLoopDirection>> = [{
    label: t('timeline.loopSectionDirection'),
    options: [
      { value: 'forward', label: t('timeline.loopSectionForward') },
      { value: 'reverse', label: t('timeline.loopSectionReverse') },
      { value: 'ping-pong', label: t('timeline.loopSectionPingPong') },
      { value: 'ping-pong-reverse', label: t('timeline.loopSectionPingPongReverse') }
    ]
  }]
  const normalizedStart = Math.max(1, Math.min(frameCount, Math.trunc(draft.startFrame) || 1))
  const normalizedEnd = Math.max(1, Math.min(frameCount, Math.trunc(draft.endFrame) || 1))
  const rangeStart = Math.min(normalizedStart, normalizedEnd)
  const rangeEnd = Math.max(normalizedStart, normalizedEnd)
  const rangeLength = rangeEnd - rangeStart + 1
  const normalizedRepeatCount = draft.repeatCount === null
    ? null
    : Math.max(1, Math.min(MAX_ANIMATION_LOOP_REPEAT_COUNT, Math.trunc(draft.repeatCount) || 1))
  const sectionName = draft.name.trim() || t('timeline.defaultLoopSectionName', { number: 1 })
  const rangeHighlightStyle = {
    left: `${((rangeStart - 1) / frameCount) * 100}%`,
    width: `${(rangeLength / frameCount) * 100}%`
  }
  const submit = (): void => {
    onConfirm({
      ...draft,
      name: sectionName,
      startFrame: rangeStart,
      endFrame: rangeEnd,
      repeatCount: normalizedRepeatCount
    })
  }

  return createPortal(<div className="modal-backdrop dialog-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <ModalShell as="form" data-preserve-animation-selection storageKey="animation-loop-section-properties" defaultWidth={430} defaultHeight={420} minWidth={360} minHeight={390} maxWidth={580} maxHeight={540} className="layer-modal animation-loop-section-modal" onSubmit={(event) => { event.preventDefault(); submit() }}>
      <DialogHeader eyebrow="LOOP SECTION" title={t(mode === 'create' ? 'timeline.createLoopSection' : 'timeline.loopSectionProperties')} closeLabel={t('common.close')} onClose={onClose} />
      <div className="modal-body animation-loop-section-fields">
        <FormField className="animation-loop-section-name" layout="inline" label={t('timeline.loopSectionName')}><TextInput autoFocus aria-label={t('timeline.loopSectionName')} value={draft.name} maxLength={64} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></FormField>

        <SettingsSection className="animation-loop-section-group" title={t('timeline.loopSectionRangeTitle')} actions={<span className="settings-section-meta">{t('timeline.loopSectionFrameCount', { count: rangeLength, total: frameCount })}</span>}>
          <div className="settings-section-body">
            <div className="animation-loop-section-range-preview" aria-hidden="true"><i style={rangeHighlightStyle} /></div>
            <div className="animation-loop-section-range">
              <FormField label={t('timeline.loopSectionStart')}><NumberInput aria-label={t('timeline.loopSectionStart')} value={draft.startFrame} min={1} max={frameCount} step={1} onValueChange={(startFrame) => setDraft({ ...draft, startFrame })} /></FormField>
              <FormField label={t('timeline.loopSectionEnd')}><NumberInput aria-label={t('timeline.loopSectionEnd')} value={draft.endFrame} min={1} max={frameCount} step={1} onValueChange={(endFrame) => setDraft({ ...draft, endFrame })} /></FormField>
            </div>
          </div>
        </SettingsSection>

        <SettingsSection className="animation-loop-section-group" title={t('timeline.playbackSettings')}>
          <div className="settings-section-body">
            <FormField className="animation-loop-section-direction" layout="inline" label={t('timeline.loopSectionDirection')}><ThemedSelect label={t('timeline.loopSectionDirection')} value={draft.direction} groups={directionGroups} preserveAnimationSelection onChange={(direction) => setDraft({ ...draft, direction })} /></FormField>
            <div className="animation-loop-section-repeat">
              <CheckboxField checked={draft.repeatCount !== null} label={t('timeline.loopSectionRepeatCount')} onChange={(enabled) => setDraft({ ...draft, repeatCount: enabled ? 1 : null })} />
              {draft.repeatCount === null
                ? <TextInput aria-label={t('timeline.loopSectionRepeatCount')} value={t('timeline.loopSectionInfiniteShort')} disabled readOnly />
                : <NumberInput aria-label={t('timeline.loopSectionRepeatCount')} value={draft.repeatCount} min={1} max={MAX_ANIMATION_LOOP_REPEAT_COUNT} step={1} onValueChange={(repeatCount) => setDraft({ ...draft, repeatCount })} />}
            </div>
          </div>
        </SettingsSection>

        <div className="animation-loop-section-summary" role="status">
          {t('timeline.loopSectionSummary', {
            name: sectionName,
            start: rangeStart,
            end: rangeEnd,
            direction: t(draft.direction === 'ping-pong' ? 'timeline.loopSectionPingPong' : draft.direction === 'ping-pong-reverse' ? 'timeline.loopSectionPingPongReverse' : draft.direction === 'reverse' ? 'timeline.loopSectionReverse' : 'timeline.loopSectionForward'),
            repeats: normalizedRepeatCount ?? t('timeline.loopSectionInfiniteShort')
          })}
        </div>
      </div>
      <footer><button type="button" className="quiet-button" onClick={onClose}>{t('common.cancel')}</button><button type="submit" className="primary-button">{t('common.save')}</button></footer>
    </ModalShell>
  </div>, document.body)
}
