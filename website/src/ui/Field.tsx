import { useId, useState, type ReactNode } from 'react'
import { FileArchive, ImagePlus, X } from 'lucide-react'

/*
 * Form fields. Before this, every form assembled its own label + control + hint markup,
 * which is how the studio and the account page ended up with different label gaps and
 * two different invalid treatments.
 */

/** The label row: label text, a required/optional badge, and a live counter. */
export function Field({ label, badge, hint, invalid, counter, children }: {
  label: string
  badge?: string
  hint?: ReactNode
  invalid?: boolean
  counter?: string
  children: ReactNode
}) {
  return <label className={invalid ? 'field invalid' : 'field'}>
    <span className="field-label">
      {label}
      {badge && <em>{badge}</em>}
      {counter && <b className="field-counter">{counter}</b>}
    </span>
    {children}
    {hint && <small className="field-hint">{hint}</small>}
  </label>
}

/** A field whose control is not a single input, so the label cannot wrap it. */
export function FormField({ label, badge, hint, invalid, children }: {
  label: string
  badge?: string
  hint?: ReactNode
  invalid?: boolean
  children: ReactNode
}) {
  return <div className={invalid ? 'field invalid' : 'field'}>
    <span className="field-label">
      {label}
      {badge && <em>{badge}</em>}
    </span>
    {children}
    {hint && <small className="field-hint">{hint}</small>}
  </div>
}

/**
 * File picking, by drop or by click. The native control is hidden and driven from styled
 * targets, because its own button is drawn by the OS. The hidden input must stay
 * `position: fixed` (see .visually-hidden) or it widens the document.
 */
export function FileField({ label, badge, hint, file, onPick, onClear, emptyTitle, emptyHint, replaceLabel, clearLabel, invalid, accept, icon }: {
  label: string
  badge?: string
  hint?: ReactNode
  file: { name: string; size: number } | null
  onPick: (file: File) => void
  onClear?: () => void
  emptyTitle: string
  emptyHint: string
  replaceLabel: string
  clearLabel: string
  invalid?: boolean
  accept?: string
  icon?: ReactNode
}) {
  const [dragging, setDragging] = useState(false)
  const id = useId()

  const formatSize = (bytes: number) => bytes < 1048576
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1048576).toFixed(1)} MB`

  return <div className="field">
    <span className="field-label">{label}{badge && <em>{badge}</em>}</span>
    <input
      className="visually-hidden"
      id={id}
      type="file"
      accept={accept}
      onChange={(event) => {
        const picked = event.target.files?.[0]
        if (picked) onPick(picked)
        // Allows re-picking the same file after a clear.
        event.target.value = ''
      }} />
    <div
      className={['drop-zone', dragging ? 'dragging' : '', invalid ? 'invalid' : ''].filter(Boolean).join(' ')}
      onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        const dropped = event.dataTransfer.files?.[0]
        if (dropped) onPick(dropped)
      }}>
      {file
        ? <>
          <div className="drop-file">
            {icon ?? <FileArchive aria-hidden="true" />}
            <span className="drop-file-copy">
              <strong>{file.name}</strong>
              <small>{formatSize(file.size)}</small>
            </span>
            {onClear && <button type="button" className="icon-button" onClick={onClear} aria-label={clearLabel}>
              <X aria-hidden="true" />
            </button>}
          </div>
          {onClear && <div className="drop-actions">
            <label className="button secondary compact" htmlFor={id}>{replaceLabel}</label>
          </div>}
        </>
        : <label className="drop-empty" htmlFor={id}>
          {icon ?? <ImagePlus aria-hidden="true" />}
          <strong>{emptyTitle}</strong>
          <small>{emptyHint}</small>
        </label>}
    </div>
    {hint && <small className="field-hint">{hint}</small>}
  </div>
}
