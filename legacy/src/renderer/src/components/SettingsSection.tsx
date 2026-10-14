import type { HTMLAttributes, ReactNode } from 'react'
import { SettingsSectionHeader } from './SettingsSectionHeader'

interface SettingsSectionProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  actions?: ReactNode
  children: ReactNode
  title: ReactNode
}

export function SettingsSection({ actions, children, className = '', title, ...sectionProps }: SettingsSectionProps) {
  const accessibleLabel = sectionProps['aria-label'] ?? (typeof title === 'string' ? title : undefined)
  return <section {...sectionProps} aria-label={accessibleLabel} className={`settings-section ${className}`.trim()}>
    <SettingsSectionHeader title={title} actions={actions} />
    {children}
  </section>
}
