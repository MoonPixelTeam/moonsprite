import { memo, useLayoutEffect, useMemo, useRef, type CSSProperties, type PointerEvent } from 'react'

interface Actions {
  begin: (event: PointerEvent<HTMLButtonElement>, slot: number, id: number | null) => void
  add: (slot: number) => void
}

export function usePaletteSwatchActions(begin: Actions['begin'], add: Actions['add']): Actions {
  const latest = useRef({ begin, add })
  useLayoutEffect(() => { latest.current = { begin, add } })
  return useMemo(() => ({
    begin: (event, slot, id) => latest.current.begin(event, slot, id),
    add: (slot) => latest.current.add(slot)
  }), [])
}

export const PaletteSwatch = memo(function PaletteSwatch({ slot, id, className, wrapClassName, left, top, label, selected, color, markerColor, actions }: {
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
  actions: Actions
}) {
  return <span className={wrapClassName} style={left === undefined ? undefined : { left, top }}><button
    data-palette-slot={slot} data-palette-id={id} className={className}
    title={label} aria-label={label} aria-pressed={selected}
    style={{ '--swatch-color': color, '--swatch-corner-color': markerColor } as CSSProperties}
    onContextMenu={(event) => event.preventDefault()}
    onPointerDown={(event) => actions.begin(event, slot, id ?? null)}
    onDoubleClick={(event) => { event.preventDefault(); event.stopPropagation(); actions.add(slot) }}
  /></span>
})
