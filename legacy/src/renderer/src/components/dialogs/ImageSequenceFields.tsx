import { useI18n } from '@/components/I18nProvider'
import { useState } from 'react'
import { FormField } from '@/components/FormField'
import { NumberInput } from '@/components/NumberInput'
import { CheckboxField } from '@/components/CheckboxField'
import type { AppDialog } from '@/store/workspace-types'
import { sequenceDuration } from '@/core/image-sequence-preferences'
import { MAX_ANIMATION_FRAME_DURATION } from '@/core/animation'
import './image-sequence-fields.css'

export function ImageSequenceFields({ sequence }: { sequence: NonNullable<AppDialog['imageSequence']> }) {
  const { t } = useI18n()
  const [settings, setSettings] = useState(() => ({ ...sequence.settings }))
  const update = (patch: Partial<typeof settings>): void => {
    Object.assign(sequence.settings, patch)
    setSettings((current) => ({ ...current, ...patch }))
  }
  return <div className="image-sequence-fields">
    <ul className="image-sequence-files" aria-label={t('sequence.files')}>
      {sequence.files.map((file, index) => {
        const selected = settings.selectedIndices ?? sequence.files.map((_, i) => i)
        return <li key={index} data-selected={selected.includes(index)}>
          <CheckboxField label={file} checked={selected.includes(index)} onChange={(checked) => update({ selectedIndices: checked ? [...selected, index] : selected.filter((i) => i !== index) })} />
        </li>
      })}
    </ul>
    <FormField className="image-sequence-duration" layout="inline" label={t('sequence.duration')}>
      <NumberInput aria-label={t('sequence.duration')} min={1} max={MAX_ANIMATION_FRAME_DURATION} step={1}
        value={settings.duration} suffix="ms" live onValueChange={(value) => update({ duration: sequenceDuration(value) })} />
    </FormField>
    <div className="image-sequence-options">
      <CheckboxField checked={settings.repeat} label={t('sequence.repeat')} onChange={(repeat) => update({ repeat })} />
      <CheckboxField checked={settings.remember} label={t('sequence.remember')} onChange={(remember) => update({ remember })} />
    </div>
  </div>
}
