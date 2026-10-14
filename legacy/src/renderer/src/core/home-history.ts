import { readStoredJson, writeStoredJson } from './storage'

export interface RecentProject {
  filePath: string
  fileName: string
  name: string
  lastOpened: number
  pinned: boolean
}

export const RECENT_PROJECTS_STORAGE_KEY = 'moonsprite.recent-projects.v1'
export const GALLERY_PINS_STORAGE_KEY = 'moonsprite.gallery-pins.v1'
export const RECENT_FILE_EXTENSIONS = ['moonsprite', 'ase', 'aseprite', 'png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'] as const

const readJson = <T>(key: string, fallback: T): T => {
  const value = readStoredJson<T | null>(key, null)
  return value ?? fallback
}

const baseName = (filePath: string): string => filePath.split(/[\\/]/).pop() ?? filePath

const normalizeRecentProjects = (projects: RecentProject[]): RecentProject[] => [
  ...projects.filter((project) => project.pinned),
  ...projects.filter((project) => !project.pinned)
]

const writeRecentProjects = (projects: RecentProject[]): RecentProject[] => {
  const next = normalizeRecentProjects(projects).slice(0, 24)
  writeStoredJson(RECENT_PROJECTS_STORAGE_KEY, next)
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('moonsprite:recent-files-changed'))
  return next
}

export function getRecentProjects(): RecentProject[] {
  const value = readJson<unknown>(RECENT_PROJECTS_STORAGE_KEY, [])
  if (!Array.isArray(value)) return []
  const projects = value.flatMap((item): RecentProject[] => {
    if (typeof item?.filePath !== 'string' || typeof item?.lastOpened !== 'number') return []
    return [{
      filePath: item.filePath,
      fileName: baseName(item.filePath),
      name: baseName(item.filePath),
      lastOpened: item.lastOpened,
      pinned: item.pinned === true
    }]
  })
  return normalizeRecentProjects(projects)
}

export function recordRecentProject(filePath: string, _name?: string): void {
  const extension = filePath.split('.').pop()?.toLowerCase()
  if (!RECENT_FILE_EXTENSIONS.includes(extension as (typeof RECENT_FILE_EXTENSIONS)[number])) return
  const previous = getRecentProjects().find((item) => item.filePath === filePath)
  const fileName = baseName(filePath)
  writeRecentProjects([
    { filePath, fileName, name: fileName, lastOpened: Date.now(), pinned: previous?.pinned === true },
    ...getRecentProjects().filter((item) => item.filePath !== filePath)
  ])
}

export function toggleRecentProjectPinned(filePath: string): RecentProject[] {
  const next = getRecentProjects().map((item) => item.filePath === filePath ? { ...item, pinned: !item.pinned } : item)
  return writeRecentProjects(next)
}

export function removeRecentProject(filePath: string): RecentProject[] {
  return writeRecentProjects(getRecentProjects().filter((project) => project.filePath !== filePath))
}

export function reorderRecentProjects(filePaths: string[]): RecentProject[] {
  const current = getRecentProjects()
  const byPath = new Map(current.map((project) => [project.filePath, project]))
  const seen = new Set<string>()
  const ordered = filePaths.flatMap((filePath): RecentProject[] => {
    const project = byPath.get(filePath)
    if (!project || seen.has(filePath)) return []
    seen.add(filePath)
    return [project]
  })
  for (const project of current) if (!seen.has(project.filePath)) ordered.push(project)
  return writeRecentProjects(ordered)
}

export function clearRecentProjects(): RecentProject[] {
  return writeRecentProjects(getRecentProjects().filter((project) => project.pinned))
}

export function getGalleryPins(): string[] {
  const value = readJson<unknown>(GALLERY_PINS_STORAGE_KEY, [])
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

export function toggleGalleryPin(filePath: string): string[] {
  const current = new Set(getGalleryPins())
  if (current.has(filePath)) current.delete(filePath)
  else current.add(filePath)
  const next = [...current]
  writeStoredJson(GALLERY_PINS_STORAGE_KEY, next)
  return next
}

export function removeGalleryPin(filePath: string): string[] {
  const next = getGalleryPins().filter((path) => path !== filePath)
  writeStoredJson(GALLERY_PINS_STORAGE_KEY, next)
  return next
}
