import { useRef, type CSSProperties, type FocusEventHandler, type ReactNode } from 'react'
import { rangeValueWithShiftStep } from '@/core/range-step'

interface RangeFieldProps {
  ariaLabel?: string
  ariaValueText?: string
  autoFocus?: boolean
  className?: string
  density?: 'compact' | 'regular'
  disabled?: boolean
  label?: ReactNode
  max: number
  min: number
  onChange: (value: number) => void
  onBlur?: FocusEventHandler<HTMLInputElement>
  step?: number
  suffix?: string
  value: number
  valueLabel?: ReactNode
}

export function RangeField({ ariaLabel, ariaValueText, autoFocus = false, className = '', density = 'regular', disabled = false, label, max, min, onBlur, onChange, step = 1, suffix, value, valueLabel }: RangeFieldProps) {
  const shiftHeldRef = useRef(false)
  const hasLabel = label !== undefined && label !== null
  const progress = max > min ? Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100)) : 0
  const displayValue = valueLabel ?? `${value}${suffix ?? ''}`
  const accessibleValueText = ariaValueText ?? (typeof displayValue === 'string' || typeof displayValue === 'number' ? String(displayValue) : undefined)
  const sliderStyle = {
    '--range-progress': `${progress}%`
  } as CSSProperties
  const accessibleLabel = ariaLabel ?? (typeof label === 'string' ? label : undefined)

  return <label className={`range-field range-field-${density} ${hasLabel ? 'range-field-labeled' : 'range-field-standalone'} ${className}`.trim()}>
    {hasLabel && <span className="range-field-label" title={typeof label === 'string' ? label : undefined}>{label}</span>}
    <span className="range-slider" style={sliderStyle}>
      <span className="range-slider-fill" aria-hidden="true" />
      <output className="range-slider-value" aria-hidden="true">{displayValue}</output>
      <input aria-label={accessibleLabel} aria-valuetext={accessibleValueText} autoFocus={autoFocus} type="range" disabled={disabled} min={min} max={max} step={step} value={value} onBlur={(event) => { shiftHeldRef.current = false; onBlur?.(event) }} onPointerDown={(event) => { shiftHeldRef.current = event.shiftKey }} onPointerMove={(event) => { shiftHeldRef.current = event.shiftKey }} onPointerUp={() => { shiftHeldRef.current = false }} onPointerCancel={() => { shiftHeldRef.current = false }} onKeyDown={(event) => { shiftHeldRef.current = event.shiftKey }} onKeyUp={(event) => { shiftHeldRef.current = event.shiftKey }} onChange={(event) => onChange(rangeValueWithShiftStep(Number(event.target.value), min, max, step, suffix === '%' ? 'percentage' : 'number', shiftHeldRef.current))} />
    </span>
  </label>
}
