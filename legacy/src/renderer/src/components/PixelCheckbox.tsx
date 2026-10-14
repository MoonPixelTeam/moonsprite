import type { InputHTMLAttributes } from 'react'
import { PixelUtilityIcon } from './PixelUtilityIcon'

type PixelCheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'checked'> & {
  checked: boolean
}

export function PixelCheckbox({ checked, className = '', ...props }: PixelCheckboxProps) {
  return <span className={`pixel-checkbox ${className}`.trim()}>
    <input {...props} type="checkbox" checked={checked} />
    <PixelUtilityIcon kind={checked ? 'checkboxChecked' : 'checkboxUnchecked'} />
  </span>
}
