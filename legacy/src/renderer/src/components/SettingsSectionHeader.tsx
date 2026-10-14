import { useContext, type ReactNode } from 'react'
import { PreferenceSearchContext } from './PreferenceSearchContext'

interface SettingsSectionHeaderProps {
  actions?: ReactNode
  className?: string
  title: ReactNode
}

export function SettingsSectionHeader({ actions, className = '', title }: SettingsSectionHeaderProps) {
  const search = useContext(PreferenceSearchContext)
  const searchUnmatched = Boolean(search?.query && !search.matches(title))
  return <div className={`settings-section-header ${className} ${searchUnmatched ? 'search-unmatched' : ''}`.trim()}>
    <strong>{title}</strong>
    {actions && <div className="settings-section-actions">{actions}</div>}
  </div>
}
