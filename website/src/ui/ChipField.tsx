import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Chip } from './index'

/**
 * A field that offers ready-made values and still accepts anything else. Presets are the
 * common case, so they are one click; the free text box is there because no list covers
 * every pack. Values outside the presets show first as removable chips, so it is always
 * clear what is actually set.
 */
export function ChipField({ label, value, presets, onChange, badge, hint, customPlaceholder, addLabel, removeLabel, invalid }: {
  label: string
  value: string[]
  presets: string[]
  onChange: (next: string[]) => void
  /** Rendered next to the label: "required" / "optional". */
  badge?: string
  hint?: string
  customPlaceholder?: string
  addLabel?: string
  removeLabel?: string
  invalid?: boolean
}) {
  const [draft, setDraft] = useState('')
  const toggle = (item: string) => onChange(value.includes(item) ? value.filter((entry) => entry !== item) : [...value, item])
  const addDraft = () => {
    const next = draft.trim()
    if (next && !value.includes(next)) onChange([...value, next])
    setDraft('')
  }
  const custom = value.filter((item) => !presets.includes(item))

  return <div className={invalid ? 'field invalid' : 'field'}>
    {/*
      The label is a span, not a <label for>, because the control it names is a set of chips
      rather than one input. The free-text box still needs its own name: without it a screen
      reader announces an unnamed edit field, and asking "which one?" is the only clue.
    */}
    <span className="field-label" id={`chipfield-${label}`}>
      {label}
      {badge && <em>{badge}</em>}
      {value.length > 0 && <b className="field-counter">{value.length}</b>}
    </span>

    {custom.length > 0 && <div className="chip-set custom" role="group" aria-labelledby={`chipfield-${label}`}>
      {custom.map((item) => <Chip key={item} active title={removeLabel} onClick={() => toggle(item)}>
        {item}<X aria-hidden="true" />
      </Chip>)}
    </div>}

    <div className="chip-set" role="group" aria-labelledby={`chipfield-${label}`}>
      {presets.map((item) => <Chip key={item} active={value.includes(item)} onClick={() => toggle(item)}>{item}</Chip>)}
    </div>

    {customPlaceholder && <div className="inline-add">
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return
          event.preventDefault()
          addDraft()
        }}
        aria-label={customPlaceholder}
        placeholder={customPlaceholder} />
      <button type="button" className="button secondary compact" onClick={addDraft} disabled={draft.trim().length === 0}>
        <Plus aria-hidden="true" />{addLabel}
      </button>
    </div>}

    {hint && <small className="field-hint">{hint}</small>}
  </div>
}
