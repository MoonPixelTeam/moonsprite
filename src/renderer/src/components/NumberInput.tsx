import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type InputHTMLAttributes } from 'react'
import { evaluateNumericExpression } from '@/core/numeric-expression'
import { useI18n } from './I18nProvider'
import { PixelUtilityIcon } from './PixelUtilityIcon'

interface NumberInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange' | 'min' | 'max' | 'step'> {
  value: number | ''
  onValueChange(value: number): void
  live?: boolean
  min?: number
  max?: number
  density?: 'compact' | 'regular'
  step?: number
  suffix?: string
}

const filterNumericExpression = (source: string): string => {
  let filtered = ''
  for (const character of source) {
    if (/[0-9+\-*\/().\s]/.test(character)) {
      filtered += character
      continue
    }
    if (character !== 'e' && character !== 'E') continue
    const token = filtered.split(/[+\-*\/()\s]/).at(-1) ?? ''
    if (/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(token)) filtered += character
  }
  return filtered
}

export function NumberInput({ value, onValueChange, live = false, min, max, density = 'regular', step = 1, suffix, className = '', onFocus, onBlur, onKeyDown, ...inputProps }: NumberInputProps) {
  const { t } = useI18n()
  const [draft, setDraft] = useState(String(value))
  const currentValueRef = useRef<number | ''>(value)
  const lastPropValueRef = useRef<number | ''>(value)
  const onValueChangeRef = useRef(onValueChange)
  const repeatTimerRef = useRef<number | null>(null)
  const repeatStartedAtRef = useRef(0)
  const repeatDeltaRef = useRef(0)
  const repeatTargetRef = useRef<HTMLButtonElement | null>(null)
  const stepperPressTokenRef = useRef(0)
  const suppressStepperClickTargetsRef = useRef(new Map<HTMLButtonElement, number>())
  useLayoutEffect(() => setDraft(String(value)), [value])
  useEffect(() => {
    // A controlled parent may briefly render the previous value while the
    // pointer event updates are batched. Preserve our synchronous optimistic
    // value in that case; accept genuine external changes immediately.
    if (value !== lastPropValueRef.current && value !== currentValueRef.current) currentValueRef.current = value
    lastPropValueRef.current = value
    onValueChangeRef.current = onValueChange
  }, [onValueChange, value])
  useEffect(() => () => {
    if (repeatTimerRef.current !== null) window.clearTimeout(repeatTimerRef.current)
    suppressStepperClickTargetsRef.current.clear()
  }, [])
  const normalize = (next: number): number => {
    if (!Number.isFinite(next)) return typeof value === 'number' ? value : min ?? 0
    return Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min ?? Number.NEGATIVE_INFINITY, next))
  }
  const adjust = (delta: number): boolean => {
    const current = currentValueRef.current
    const next = normalize((typeof current === 'number' ? current : 0) + delta)
    if (next === current) return false
    currentValueRef.current = next
    onValueChangeRef.current(next)
    return true
  }
  const hasStepperRoom = (delta: number): boolean => {
    const current = currentValueRef.current
    if (typeof current !== 'number') return true
    if (delta > 0 && typeof max === 'number') return current < max
    if (delta < 0 && typeof min === 'number') return current > min
    return true
  }
  const stopStepperRepeat = (target?: HTMLButtonElement): void => {
    if (target && repeatTargetRef.current !== target) return
    if (repeatTimerRef.current !== null) window.clearTimeout(repeatTimerRef.current)
    repeatTimerRef.current = null
    repeatDeltaRef.current = 0
    repeatTargetRef.current = null
  }
  const cancelStepperRepeat = (target?: HTMLButtonElement): void => {
    if (target && repeatTargetRef.current !== target) return
    stopStepperRepeat(target)
    if (target) suppressStepperClickTargetsRef.current.delete(target)
  }
  const scheduleStepperRepeat = (): void => {
    const delta = repeatDeltaRef.current
    if (!delta) return
    const elapsed = Math.max(0, performance.now() - repeatStartedAtRef.current)
    const progress = 1 - Math.exp(-elapsed / 900)
    const interval = 24 + (180 - 24) * (1 - progress)
    repeatTimerRef.current = window.setTimeout(() => {
      if (!adjust(delta) || !hasStepperRoom(delta)) { stopStepperRepeat(); return }
      scheduleStepperRepeat()
    }, interval)
  }
  const startStepperRepeat = (target: HTMLButtonElement, delta: number): void => {
    stopStepperRepeat()
    if (!adjust(delta)) return
    if (!hasStepperRoom(delta)) return
    repeatTargetRef.current = target
    repeatDeltaRef.current = delta
    repeatStartedAtRef.current = performance.now()
    repeatTimerRef.current = window.setTimeout(() => scheduleStepperRepeat(), 300)
  }
  const switchStepperRepeat = (event: React.PointerEvent<HTMLButtonElement>, delta: number): void => {
    if (event.buttons !== 1 || repeatDeltaRef.current === 0 || repeatDeltaRef.current === delta) return
    suppressStepperClickTargetsRef.current.set(event.currentTarget, ++stepperPressTokenRef.current)
    startStepperRepeat(event.currentTarget, delta)
  }
  const leaveStepper = (event: React.PointerEvent<HTMLButtonElement>): void => {
    const relatedTarget = event.relatedTarget
    if (event.buttons === 1 && relatedTarget instanceof Node && event.currentTarget.parentElement?.contains(relatedTarget)) return
    cancelStepperRepeat(event.currentTarget)
  }
  const beginStepperPress = (event: React.PointerEvent<HTMLButtonElement>, delta: number): void => {
    if (event.button !== 0) return
    suppressStepperClickTargetsRef.current.set(event.currentTarget, ++stepperPressTokenRef.current)
    startStepperRepeat(event.currentTarget, delta)
  }
  const handleStepperClick = (event: React.MouseEvent<HTMLButtonElement>, delta: number): void => {
    if (suppressStepperClickTargetsRef.current.delete(event.currentTarget)) return
    adjust(delta)
  }
  const commit = (): void => {
    if (!draft.trim()) { setDraft(String(value)); return }
    const evaluated = evaluateNumericExpression(draft)
    if (evaluated === null) { setDraft(String(value)); return }
    const next = normalize(evaluated)
    setDraft(String(next))
    if (next !== value) onValueChange(next)
  }
  const updateDraft = (source: string): void => {
    const nextDraft = filterNumericExpression(source)
    setDraft(nextDraft)
    if (!live || !nextDraft.trim()) return
    const evaluated = evaluateNumericExpression(nextDraft)
    if (evaluated === null) return
    const next = normalize(evaluated)
    if (next !== value) onValueChange(next)
  }

  const control = <span className={`number-input number-input-${density} ${suffix ? 'has-suffix' : ''} ${className}`.trim()}>
    <span className="number-input-editor" style={suffix ? { '--number-input-value-chars': Math.max(1, draft.length) } as CSSProperties : undefined}>
      <input {...inputProps} type="text" inputMode="decimal" role="spinbutton" aria-valuemin={min} aria-valuemax={max} aria-valuenow={typeof value === 'number' ? value : undefined} value={draft} style={inputProps.style} onFocus={onFocus} onChange={(event) => updateDraft(event.target.value)} onBlur={(event) => { commit(); onBlur?.(event) }} onKeyDown={(event) => { onKeyDown?.(event); if (event.defaultPrevented || event.key !== 'Enter') return; event.preventDefault(); const form = event.currentTarget.form; commit(); if (form) window.queueMicrotask(() => form.requestSubmit()); else event.currentTarget.blur() }} />
      {suffix && <span className="number-input-suffix" aria-hidden="true">{suffix}</span>}
    </span>
    <span className="number-input-stepper">
      <button type="button" tabIndex={-1} aria-label={t('numberInput.increment')} disabled={inputProps.disabled || inputProps.readOnly} onPointerDown={(event) => beginStepperPress(event, step)} onPointerEnter={(event) => switchStepperRepeat(event, step)} onPointerUp={(event) => stopStepperRepeat(event.currentTarget)} onPointerCancel={(event) => cancelStepperRepeat(event.currentTarget)} onPointerLeave={leaveStepper} onBlur={(event) => cancelStepperRepeat(event.currentTarget)} onClick={(event) => handleStepperClick(event, step)}><PixelUtilityIcon kind="up" /></button>
      <button type="button" tabIndex={-1} aria-label={t('numberInput.decrement')} disabled={inputProps.disabled || inputProps.readOnly} onPointerDown={(event) => beginStepperPress(event, -step)} onPointerEnter={(event) => switchStepperRepeat(event, -step)} onPointerUp={(event) => stopStepperRepeat(event.currentTarget)} onPointerCancel={(event) => cancelStepperRepeat(event.currentTarget)} onPointerLeave={leaveStepper} onBlur={(event) => cancelStepperRepeat(event.currentTarget)} onClick={(event) => handleStepperClick(event, -step)}><PixelUtilityIcon kind="down" /></button>
    </span>
  </span>
  return control
}
