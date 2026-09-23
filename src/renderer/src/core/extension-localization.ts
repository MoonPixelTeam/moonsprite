

/** Translate package-owned presentation fields only; IDs and settings values stay stable. */
export function localizeExtension<T extends { translations?: Record<string, Record<string, string>> }>(extension: T, locale: string): T {
  const catalog = extension.translations?.[locale]
  if (!catalog) return extension
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(visit)
    if (!value || typeof value !== 'object') return value
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key,
      key === 'translations' ? entry : ['name', 'description', 'label', 'suffix', 'placeholder'].includes(key) && typeof entry === 'string'
        ? Object.hasOwn(catalog, entry) ? catalog[entry] : entry : visit(entry)
    ]))
  }
  return visit(extension) as T
}
