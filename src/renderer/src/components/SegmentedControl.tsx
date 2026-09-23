import type { ReactNode } from 'react'
import { Tooltip } from './Tooltip'

export interface SegmentedControlOption<T extends string> {
  ariaLabel?: string
  description?: ReactNode
  disabled?: boolean
  label: ReactNode
  value: T
}

interface SegmentedControlProps<T extends string> {
  className?: string
  layout?: 'horizontal' | 'grid' | 'vertical'
  label: string
  onChange: (value: T) => void
  options: Array<SegmentedControlOption<T>>
  value: T
}

export function SegmentedControl<T extends string>({ className = '', layout = 'horizontal', label, onChange, options, value }: SegmentedControlProps<T>) {
  return <div className={`segmented-control segmented-control-${layout} ${className}`.trim()} role="group" aria-label={label}>
    {options.map((option) => {
      const button = <button key={option.value} type="button" className={option.value === value ? 'selected' : ''} aria-label={option.ariaLabel} aria-pressed={option.value === value} disabled={option.disabled} onClick={() => onChange(option.value)}><span className="segmented-control-label">{option.label}</span></button>
      return option.description ? <Tooltip className="segmented-control-tooltip" content={option.description} key={option.value}>{button}</Tooltip> : button
    })}
  </div>
}
