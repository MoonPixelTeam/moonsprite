import { createContext, type ReactNode } from 'react'

export interface PreferenceSearchContextValue {
  query: string
  matches(value: ReactNode): boolean
}

export const PreferenceSearchContext = createContext<PreferenceSearchContextValue | null>(null)

export function searchText(value: ReactNode): string {
  if (value === null || value === undefined || typeof value === 'boolean') return ''
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (Array.isArray(value)) return value.map(searchText).join(' ')
  if (typeof value === 'object' && 'props' in value) {
    const props = value.props as { children?: ReactNode; label?: ReactNode; title?: ReactNode }
    return [props.label, props.title, props.children].map(searchText).join(' ')
  }
  return ''
}
