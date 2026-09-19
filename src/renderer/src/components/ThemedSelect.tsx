import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Tooltip } from '@/components/Tooltip'
import { PixelDownIcon as ChevronDown, PixelUtilityIcon } from '@/components/PixelUtilityIcon'
import { TextInput } from '@/components/TextInput'

export interface ThemedSelectGroup<T extends string> {
  label: string
  options: Array<ThemedSelectOption<T>>
}

export interface ThemedSelectOption<T extends string> {
  value: T
  label: string
  description?: string
}

export function ThemedSelect<T extends string>({ value, groups, label, onChange, disabled = false, density = 'regular', renderSelected, renderOption, showCheck = true, showOptionTooltips = true, popoverClassName = '', popoverWidth, preserveAnimationSelection = false, searchable = false, searchPlaceholder = '' }: {
  value: T
  groups: Array<ThemedSelectGroup<T>>
  label: string
  onChange: (value: T) => void
  disabled?: boolean
  density?: 'compact' | 'regular'
  renderSelected?: (option: ThemedSelectOption<T>) => ReactNode
  renderOption?: (option: ThemedSelectOption<T>) => ReactNode
  showCheck?: boolean
  showOptionTooltips?: boolean
  popoverClassName?: string
  popoverWidth?: number
  preserveAnimationSelection?: boolean
  searchable?: boolean
  searchPlaceholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [position, setPosition] = useState({ left: 8, top: 8, minWidth: 0 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const options = groups.flatMap((group) => group.options)
  const filteredGroups = query.trim() ? groups.map((group) => ({ ...group, options: group.options.filter((option) => `${option.label} ${option.description ?? ''}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) })).filter((group) => group.options.length > 0) : groups
  const selected = options.find((option) => option.value === value) ?? options[0]

  useLayoutEffect(() => {
    if (!open) return
    const place = (): void => {
      const trigger = triggerRef.current?.getBoundingClientRect()
      const menu = menuRef.current?.getBoundingClientRect()
      if (!trigger || !menu) return
      const requestedWidth = popoverWidth ?? menu.width
      const width = Math.min(Math.max(trigger.width, requestedWidth), Math.max(1, window.innerWidth - 16))
      const left = Math.max(8, Math.min(window.innerWidth - width - 8, trigger.left))
      const top = window.innerHeight - trigger.bottom >= Math.min(menu.height, 320) + 5
        ? trigger.bottom + 4
        : Math.max(8, trigger.top - Math.min(menu.height, 320) - 4)
      const minWidth = Math.min(trigger.width, Math.max(1, window.innerWidth - 16))
      setPosition((current) => current.left === left && current.top === top && current.minWidth === minWidth
        ? current : { left, top, minWidth })
    }
    place()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place)
    if (menuRef.current) observer?.observe(menuRef.current)
    if (triggerRef.current) observer?.observe(triggerRef.current)
    window.addEventListener('resize', place)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', place)
    }
  }, [open, popoverWidth, groups])

  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent): void => {
      const target = event.target as Node
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false)
    }
    window.addEventListener('pointerdown', close, true)
    return () => window.removeEventListener('pointerdown', close, true)
  }, [open])

  const select = (next: T): void => {
    onChange(next)
    setOpen(false)
    setQuery('')
    window.requestAnimationFrame(() => triggerRef.current?.focus())
  }
  const moveSelection = (direction: -1 | 1): void => {
    if (options.length === 0) return
    const current = Math.max(0, options.findIndex((option) => option.value === value))
    select(options[(current + direction + options.length) % options.length].value)
  }

  return <span className={`themed-select themed-select-${density}`}>
    <button ref={triggerRef} type="button" className="themed-select-trigger" title={selected?.label ?? value} aria-label={label} aria-haspopup="listbox" aria-expanded={open} disabled={disabled} onClick={() => setOpen((current) => !current)} onKeyDown={(event) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        moveSelection(event.key === 'ArrowDown' ? 1 : -1)
      }
      if (event.key === 'Escape') setOpen(false)
    }}><span className="themed-select-selected-copy">{selected ? renderSelected?.(selected) ?? selected.label : value}</span><ChevronDown size={14} /></button>
    {open && createPortal(<div ref={menuRef} className={`themed-select-popover component-scrollbar ${popoverClassName}`.trim()} data-hide-check={!showCheck ? 'true' : undefined} data-preserve-animation-selection={preserveAnimationSelection ? '' : undefined} role="listbox" aria-label={label} style={{ ...position, width: popoverWidth === undefined ? 'max-content' : Math.max(position.minWidth, popoverWidth) }}>{searchable && <div className="themed-select-search"><TextInput autoFocus value={query} placeholder={searchPlaceholder} aria-label={searchPlaceholder || label} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') { setOpen(false); setQuery('') } }} /></div>}{filteredGroups.map((group) => <section key={group.label} className="themed-select-group">{group.options.map((option) => { const optionCopy = <span className="themed-select-option-copy">{renderOption?.(option) ?? <strong>{option.label}</strong>}</span>; return <button key={option.value} type="button" role="option" aria-selected={option.value === value} onClick={() => select(option.value)}>{showOptionTooltips ? <Tooltip content={option.description ? `${option.label} — ${option.description}` : option.label}>{optionCopy}</Tooltip> : optionCopy}{showCheck && option.value === value && <PixelUtilityIcon kind="check" />}</button> })}</section>)}</div>, document.body)}
  </span>
}
