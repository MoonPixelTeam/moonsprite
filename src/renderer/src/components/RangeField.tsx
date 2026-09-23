import { useEffect, useRef, type CSSProperties, type FocusEventHandler, type ReactNode } from 'react'
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
  /** Pair domain begin/commit commands here to group live changes into one history entry. */
  interaction?: { begin: () => void; commit: () => void }
  onBlur?: FocusEventHandler<HTMLInputElement>
  step?: number
  suffix?: string
  value: number
  valueLabel?: ReactNode
}

export function RangeField({ ariaLabel, ariaValueText, autoFocus = false, className = '', density = 'regular', disabled = false, label, max, min, onBlur, onChange, interaction, step = 1, suffix, value, valueLabel }: RangeFieldProps) {
  const shiftHeldRef = useRef(false)
  const activeRef = useRef(false)
  const pointerRef = useRef<number | null>(null)
  const commitRef = useRef<(() => void) | undefined>(undefined)
  const beginInteraction = (): void => {
    if (activeRef.current || disabled) return
    activeRef.current = true
    commitRef.current = interaction?.commit
    interaction?.begin()
  }
  const finishInteraction = (): void => {
    shiftHeldRef.current = false
    pointerRef.current = null
    if (!activeRef.current) return
    activeRef.current = false
    const commit = commitRef.current
    commitRef.current = undefined
    commit?.()
  }
  useEffect(() => {
    const endPointer = (event: PointerEvent): void => {
      if (pointerRef.current === event.pointerId) finishInteraction()
    }
    window.addEventListener('pointerup', endPointer)
    window.addEventListener('pointercancel', endPointer)
    window.addEventListener('blur', finishInteraction)
    return () => {
      window.removeEventListener('pointerup', endPointer)
      window.removeEventListener('pointercancel', endPointer)
      window.removeEventListener('blur', finishInteraction)
      finishInteraction()
    }
  }, [])
  useEffect(() => { if (disabled) finishInteraction() }, [disabled])
  const isAdjustmentKey = (key: string): boolean => ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(key)
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
      <input aria-label={accessibleLabel} aria-valuetext={accessibleValueText} autoFocus={autoFocus} type="range" disabled={disabled} min={min} max={max} step={step} value={value} onBlur={(event) => { finishInteraction(); onBlur?.(event) }}
        onPointerDown={(event) => { if (event.button !== 0 || disabled) return; shiftHeldRef.current = event.shiftKey; pointerRef.current = event.pointerId; beginInteraction() }}
        onPointerMove={(event) => { shiftHeldRef.current = event.shiftKey }}
        onLostPointerCapture={finishInteraction}
        onKeyDown={(event) => { shiftHeldRef.current = event.shiftKey; if (isAdjustmentKey(event.key)) beginInteraction() }}
        onKeyUp={(event) => { if (isAdjustmentKey(event.key) && pointerRef.current === null) finishInteraction(); shiftHeldRef.current = event.shiftKey }}
        onChange={(event) => {
          if (disabled) return
          const discrete = !activeRef.current
          beginInteraction()
          onChange(rangeValueWithShiftStep(Number(event.target.value), min, max, step, suffix === '%' ? 'percentage' : 'number', shiftHeldRef.current))
          if (discrete) finishInteraction()
        }} />
    </span>
  </label>
}
