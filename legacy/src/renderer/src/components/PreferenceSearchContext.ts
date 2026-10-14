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
    const props = value.props as { children?: ReactNode; label?: ReactNode; title?: ReactNode; groups?: Array<{ label?: ReactNode; options?: Array<{ label?: ReactNode }> }> }
    return [props.label, props.title, props.children, ...(props.groups ?? []).flatMap(group => [group.label, ...(group.options ?? []).map(option => option.label)])].map(searchText).join(' ')
  }
  return ''
}
