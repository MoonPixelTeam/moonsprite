import type { InputHTMLAttributes, ReactNode } from 'react'
import { PixelCheckbox } from './PixelCheckbox'
import { Tooltip } from './Tooltip'

interface CheckboxFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'checked' | 'onChange'> {
  checked: boolean
  controlPosition?: 'start' | 'end'
  label: ReactNode
  onChange: (checked: boolean) => void
  tooltip?: ReactNode
}

export function CheckboxField({ checked, className = '', controlPosition = 'start', label, onChange, tooltip, ...inputProps }: CheckboxFieldProps) {
  const copy = <span>{label}</span>
  const control = <PixelCheckbox {...inputProps} checked={checked} onChange={(event) => onChange(event.target.checked)} />
  const labelCopy = tooltip ? <Tooltip content={tooltip}>{copy}</Tooltip> : copy
  return <label className={`checkbox-field ${className}`.trim()}>
    {controlPosition === 'start' ? <>{control}{labelCopy}</> : <>{labelCopy}{control}</>}
  </label>
}
