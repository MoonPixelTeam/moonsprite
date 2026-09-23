import { useId, useRef, useState, type ReactNode } from 'react'
import { Button, IconButton } from './primitives'
import { PixelFileArchive as FileArchive, PixelImagePlus as ImagePlus, PixelX as X } from './icons'

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
export function FileField({ label, badge, hint, file, onPick, onPickMany, onClear, emptyTitle, emptyHint, replaceLabel, clearLabel, invalid, accept, icon, disabled, multiple }: {
  label: string
  badge?: string
  hint?: ReactNode
  file: { name: string; size: number } | null
  onPick?: (file: File) => void
  onPickMany?: (files: File[]) => void
  onClear?: () => void
  emptyTitle: string
  emptyHint: string
  replaceLabel: string
  clearLabel: string
  invalid?: boolean
  accept?: string
  icon?: ReactNode
  disabled?: boolean
  multiple?: boolean
}) {
  const [dragging, setDragging] = useState(false)
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const pick = (files: File[]) => {
    if (disabled || inputRef.current?.matches(':disabled')) return
    if (onPickMany) onPickMany(files)
    else if (files[0]) onPick?.(files[0])
  }

  const formatSize = (bytes: number) => bytes < 1048576
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1048576).toFixed(1)} MB`

  return <div className="field">
    <span className="field-label">{label}{badge && <em>{badge}</em>}</span>
    <input
      className="visually-hidden"
      id={id}
      ref={inputRef}
      type="file"
      multiple={multiple}
      disabled={disabled}
      aria-label={label}
      aria-invalid={invalid || undefined}
      aria-describedby={hint ? `${id}-hint` : undefined}
      accept={accept}
      onChange={(event) => {
        pick(Array.from(event.target.files ?? []))
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
        pick(Array.from(event.dataTransfer.files))
      }}>
      {file
        ? <>
          <div className="drop-file">
            {icon ?? <FileArchive aria-hidden="true" />}
            <span className="drop-file-copy">
              <strong>{file.name}</strong>
              <small>{formatSize(file.size)}</small>
            </span>
            {onClear && <IconButton label={clearLabel} disabled={disabled} onClick={onClear} icon={<X aria-hidden="true" />} />}
          </div>
          <div className="drop-actions"><Button size="compact" disabled={disabled} onClick={() => inputRef.current?.click()}>{replaceLabel}</Button></div>
        </>
        : <Button className="drop-empty" disabled={disabled} onClick={() => inputRef.current?.click()}>
          {icon ?? <ImagePlus aria-hidden="true" />}
          <strong>{emptyTitle}</strong>
          <small>{emptyHint}</small>
        </Button>}
    </div>
    {hint && <small id={`${id}-hint`} className="field-hint">{hint}</small>}
  </div>
}
