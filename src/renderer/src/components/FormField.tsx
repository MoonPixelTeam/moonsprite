import { useContext, type ReactNode } from 'react'
import { Tooltip } from './Tooltip'
import { PreferenceSearchContext, searchText } from './PreferenceSearchContext'

interface FormFieldProps {
  children: ReactNode
  className?: string
  hint?: ReactNode
  label: ReactNode
  layout?: 'stacked' | 'inline'
  tooltip?: ReactNode
}

export function FormField({ children, className = '', hint, label, layout = 'stacked', tooltip }: FormFieldProps) {
  const search = useContext(PreferenceSearchContext)
  const searchUnmatched = Boolean(search?.query && !search.matches(label))
  const copy = <span className="ui-field-label">{label}</span>
  return <div className={`ui-field ui-field-${layout} ${className} ${searchUnmatched ? 'search-unmatched' : ''}`.trim()} data-search-text={searchUnmatched ? searchText(label) : undefined}>
    {tooltip ? <Tooltip content={tooltip}>{copy}</Tooltip> : copy}
    <div className="ui-field-control">{children}</div>
    {hint && <small className="ui-field-hint">{hint}</small>}
  </div>
}
