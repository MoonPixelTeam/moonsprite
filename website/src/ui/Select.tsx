import { useEffect, useId, useRef, useState } from 'react'
import { PixelCheck as Check, PixelChevronDown as ChevronDown } from './icons'

export type SelectOption<T extends string> = { value: T; label: string }

/**
 * A select built from a button and a listbox, not the native control: the native popup
 * is drawn by the OS, so it ignores the pixel chrome the rest of the site is made of.
 *
 * It still behaves the way a select is expected to — click to open, click away or Escape
 * to close, Up/Down/Home/End to move, Enter or Space to choose, and the list carries the
 * listbox/option roles so a screen reader announces it as one.
 */
export function Select<T extends string>({ value, options, onChange, label, className, align = 'start' }: {
  value: T
  options: SelectOption<T>[]
  onChange: (value: T) => void
  /** Accessible name; the visible label is usually rendered by the caller. */
  label: string
  className?: string
  align?: 'start' | 'end'
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(() => Math.max(0, options.findIndex((option) => option.value === value)))
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const id = useId()
  const current = options.find((option) => option.value === value) ?? options[0]

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  // Opening lands the highlight on the current value, like a native popup does.
  useEffect(() => {
    if (!open) return
    setActive(Math.max(0, options.findIndex((option) => option.value === value)))
  }, [open, options, value])

  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  const choose = (next: T) => {
    onChange(next)
    setOpen(false)
  }

  const onButtonKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) { setOpen(true); return }
      setActive((index) => (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length)
      return
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      if (!open) { setOpen(true); return }
      setActive(event.key === 'Home' ? 0 : Math.max(0, options.length - 1))
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (open) choose(options[active].value)
      else setOpen(true)
    }
  }

  return <div className={className ? `ui-select ${className}` : 'ui-select'} ref={rootRef}>
    <button
      type="button"
      className="ui-select-button"
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={open ? `${id}-list` : undefined}
      aria-label={label}
      onClick={() => setOpen((value) => !value)}
      onKeyDown={onButtonKeyDown}>
      <span>{current?.label}</span>
      <ChevronDown aria-hidden="true" />
    </button>
    {open && <ul
      className={align === 'end' ? 'ui-select-list end' : 'ui-select-list'}
      id={`${id}-list`}
      role="listbox"
      aria-label={label}
      aria-activedescendant={`${id}-option-${active}`}
      ref={listRef}>
      {options.map((option, index) => <li key={option.value} role="none">
        <button
          type="button"
          id={`${id}-option-${index}`}
          role="option"
          aria-selected={option.value === value}
          data-active={index === active}
          className={option.value === value ? 'selected' : undefined}
          onMouseEnter={() => setActive(index)}
          onClick={() => choose(option.value)}>
          <span>{option.label}</span>
          {option.value === value && <Check aria-hidden="true" />}
        </button>
      </li>)}
    </ul>}
  </div>
}
