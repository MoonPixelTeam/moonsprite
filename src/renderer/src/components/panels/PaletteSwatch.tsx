import { memo, useLayoutEffect, useMemo, useRef, type CSSProperties, type PointerEvent, type ChangeEvent, type KeyboardEvent } from 'react'

interface Actions {
  begin: (event: PointerEvent<HTMLButtonElement>, slot: number, id: number | null) => void
  add: (slot: number) => void
  edit?: (slot: number, id: number | null) => void
}

export function usePaletteSwatchActions(begin: Actions['begin'], add: Actions['add'], edit?: Actions['edit']): Actions {
  const latest = useRef({ begin, add, edit })
  useLayoutEffect(() => { latest.current = { begin, add, edit } })
  return useMemo(() => ({
    begin: (event, slot, id) => latest.current.begin(event, slot, id),
    add: (slot) => latest.current.add(slot),
    edit: edit ? ((slot, id) => latest.current.edit?.(slot, id)) : undefined
  }), [])
}

export const PaletteSwatch = memo(function PaletteSwatch({ slot, id, className, wrapClassName, left, top, label, selected, color, markerColor, displayName, displayNameColor, editingName, nameDraft, onNameChange, onNameCommit, onNameCancel, actions }: {
  slot: number
  id?: number
  className: string
  wrapClassName: string
  left?: string
  top?: string
  label: string
  selected: boolean
  color?: string
  markerColor?: string
  displayName?: string
  displayNameColor?: string
  editingName?: boolean
  nameDraft?: string
  onNameChange?: (event: ChangeEvent<HTMLInputElement>) => void
  onNameCommit?: () => void
  onNameCancel?: () => void
  actions: Actions
}) {
  const handleNameKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') { event.preventDefault(); onNameCommit?.() }
    else if (event.key === 'Escape') { event.preventDefault(); onNameCancel?.() }
  }
  return <span className={wrapClassName} style={left === undefined ? undefined : { left, top }}>{editingName ? <input autoFocus className="palette-color-name-input" value={nameDraft ?? ''} onChange={onNameChange} onBlur={onNameCommit} onKeyDown={handleNameKeyDown} aria-label={label} /> : <button
    data-palette-slot={slot} data-palette-id={id} className={className}
    title={label} aria-label={label} aria-pressed={selected}
    style={{ '--swatch-color': color, '--swatch-corner-color': markerColor } as CSSProperties}
    onContextMenu={(event) => event.preventDefault()}
    onPointerDown={(event) => { if (event.detail > 1) { event.preventDefault(); event.stopPropagation(); return } actions.begin(event, slot, id ?? null) }}
    onDoubleClick={(event) => { event.preventDefault(); event.stopPropagation(); actions.edit ? actions.edit(slot, id ?? null) : actions.add(slot) }}
  />}{displayName && !editingName && <span className="palette-color-name" style={{ color: displayNameColor }}>{displayName}</span>}</span>
})
