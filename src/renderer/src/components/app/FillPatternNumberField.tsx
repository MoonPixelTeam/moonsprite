import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FormField } from '../FormField'
import { NumberInput } from '../NumberInput'
import { RangeField } from '../RangeField'

export function FillPatternNumberField({ label, hint, value, min, max, suffix, step = 1, onChange }: {
  label: string; hint?: string; value: number; min: number; max: number; suffix?: string; step?: number; onChange: (value: number) => void
}) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ left: 0, top: 0 })
  const anchor = useRef<HTMLDivElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const control = anchor.current?.getBoundingClientRect(), slider = popup.current?.getBoundingClientRect()
      if (!control || !slider) return
      setPosition({ left: Math.max(8, Math.min(control.right - slider.width, window.innerWidth - slider.width - 8)),
        top: control.bottom + slider.height + 12 < window.innerHeight ? control.bottom + 4 : Math.max(8, control.top - slider.height - 4) })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true) }
  }, [open])
  useEffect(() => {
    if (!open) return
    const closeOutside = (event: Event) => {
      if (event.target instanceof Node && !anchor.current?.contains(event.target) && !popup.current?.contains(event.target)) setOpen(false)
    }
    window.addEventListener('pointerdown', closeOutside, true)
    window.addEventListener('focusin', closeOutside)
    return () => { window.removeEventListener('pointerdown', closeOutside, true); window.removeEventListener('focusin', closeOutside) }
  }, [open])
  return <FormField className="fill-pattern-value-field" layout="stacked" label={label} tooltip={hint}>
    <div ref={anchor} className="fill-pattern-number-control" onPointerDown={() => setOpen(true)}
      onKeyDown={event => { if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); anchor.current?.querySelector('input')?.focus(); setOpen(false) } }}>
      <NumberInput density="regular" aria-label={label} aria-haspopup="dialog" aria-expanded={open} min={min} max={max} step={step} suffix={suffix} value={value} onValueChange={onChange} onFocus={() => setOpen(true)} />
      {open && createPortal(<div ref={popup} className="brush-size-popover fill-pattern-slider-popover" role="dialog" aria-label={label} style={position}>
        <RangeField density="regular" ariaLabel={label} min={min} max={max} step={step} suffix={suffix} value={value} onChange={onChange} />
      </div>, document.body)}
    </div>
  </FormField>
}
