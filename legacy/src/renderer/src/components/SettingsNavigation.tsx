import type { ReactNode } from 'react'

export interface SettingsNavigationItem<T extends string> {
  label: ReactNode
  muted?: boolean
  value: T
}

interface SettingsNavigationProps<T extends string> {
  className?: string
  label: string
  items: Array<SettingsNavigationItem<T>>
  onChange: (value: T) => void
  value: T
}

export function SettingsNavigation<T extends string>({ className = '', items, label, onChange, value }: SettingsNavigationProps<T>) {
  return <nav className={`settings-navigation component-scrollbar ${className}`.trim()} aria-label={label}>{items.map((item) => <button key={item.value} type="button" className={`${item.value === value ? 'selected' : ''}${item.muted ? ' muted' : ''}`.trim()} aria-current={item.value === value ? 'page' : undefined} onClick={() => onChange(item.value)}>{item.label}</button>)}</nav>
}
