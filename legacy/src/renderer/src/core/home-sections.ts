import { readStoredJson, writeStoredJson } from './storage'

export type BuiltInHomeSectionKind = 'recent' | 'gallery' | 'recovery'

export type BuiltInHomeSection = {
  [Kind in BuiltInHomeSectionKind]: { id: Kind; kind: Kind }
}[BuiltInHomeSectionKind]

export interface FolderHomeSection {
  id: string
  kind: 'folder'
  name: string
  directoryPath: string
}

export type HomeSectionDefinition = BuiltInHomeSection | FolderHomeSection

export const HOME_SECTIONS_STORAGE_KEY = 'moonsprite.home-sections.v1'

const builtInSections: readonly BuiltInHomeSection[] = [
  { id: 'recent', kind: 'recent' },
  { id: 'gallery', kind: 'gallery' },
  { id: 'recovery', kind: 'recovery' }
]

const normalizeDirectoryPath = (value: string): string => {
  const trimmed = value.trim()
  if (!trimmed) return ''
  const withoutTrailingSeparators = trimmed.replace(/[\\/]+$/, '')
  if (!withoutTrailingSeparators) return trimmed
  if (/^[a-z]:$/i.test(withoutTrailingSeparators)) return `${withoutTrailingSeparators}\\`
  return withoutTrailingSeparators
}

const directoryKey = (value: string): string => normalizeDirectoryPath(value).replace(/\\/g, '/').toLowerCase()

export const homeFolderName = (directoryPath: string): string => {
  const normalized = normalizeDirectoryPath(directoryPath)
  return normalized.split(/[\\/]/).filter(Boolean).pop() ?? normalized
}

export const createFolderHomeSection = (directoryPath: string): FolderHomeSection => {
  const normalized = normalizeDirectoryPath(directoryPath)
  return {
    id: `folder:${encodeURIComponent(directoryKey(normalized))}`,
    kind: 'folder',
    name: homeFolderName(normalized),
    directoryPath: normalized
  }
}

export const normalizeHomeSections = (value: unknown): HomeSectionDefinition[] => {
  const sections: HomeSectionDefinition[] = []
  const seenBuiltIns = new Set<BuiltInHomeSectionKind>()
  const seenDirectories = new Set<string>()

  if (Array.isArray(value)) {
    for (const item of value) {
      const kind = typeof item === 'string' ? item : item?.kind
      if (kind === 'recent' || kind === 'gallery' || kind === 'recovery') {
        if (seenBuiltIns.has(kind)) continue
        seenBuiltIns.add(kind)
        sections.push({ id: kind, kind })
        continue
      }
      if (kind !== 'folder' || typeof item?.directoryPath !== 'string') continue
      const folder = createFolderHomeSection(item.directoryPath)
      const key = directoryKey(folder.directoryPath)
      if (!folder.directoryPath || seenDirectories.has(key)) continue
      seenDirectories.add(key)
      if (typeof item.name === 'string' && item.name.trim()) folder.name = item.name.trim()
      sections.push(folder)
    }
  }

  for (const section of builtInSections) {
    if (!seenBuiltIns.has(section.kind)) sections.push({ ...section })
  }
  return sections
}

export const getHomeSections = (storage?: Storage): HomeSectionDefinition[] => normalizeHomeSections(
  readStoredJson<unknown>(HOME_SECTIONS_STORAGE_KEY, builtInSections, storage)
)

export const saveHomeSections = (sections: readonly HomeSectionDefinition[], storage?: Storage): HomeSectionDefinition[] => {
  const normalized = normalizeHomeSections(sections)
  writeStoredJson(HOME_SECTIONS_STORAGE_KEY, normalized, storage)
  return normalized
}

export const findFolderHomeSection = (sections: readonly HomeSectionDefinition[], directoryPath: string): FolderHomeSection | undefined => {
  const target = directoryKey(directoryPath)
  return sections.find((section): section is FolderHomeSection => section.kind === 'folder' && directoryKey(section.directoryPath) === target)
}

export const reorderHomeSections = (
  sections: readonly HomeSectionDefinition[],
  sourceId: string,
  targetId: string,
  insertAfter: boolean
): HomeSectionDefinition[] => {
  if (sourceId === targetId) return [...sections]
  const source = sections.find((section) => section.id === sourceId)
  if (!source) return [...sections]
  const remaining = sections.filter((section) => section.id !== sourceId)
  const targetIndex = remaining.findIndex((section) => section.id === targetId)
  if (targetIndex < 0) return [...sections]
  remaining.splice(targetIndex + (insertAfter ? 1 : 0), 0, source)
  return remaining
}
