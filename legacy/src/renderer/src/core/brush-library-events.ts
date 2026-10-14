export const BRUSH_LIBRARY_CHANGED_EVENT = 'moonsprite:brush-library-changed'
export const BRUSH_LIBRARY_IMPORT_PATHS_EVENT = 'moonsprite:brush-library-import-paths'

export interface BrushLibraryImportPathsDetail {
  paths: string[]
}

export function publishBrushLibraryChanged(): void {
  window.dispatchEvent(new Event(BRUSH_LIBRARY_CHANGED_EVENT))
}

export function publishBrushLibraryImportPaths(paths: readonly string[]): void {
  if (paths.length === 0) return
  window.dispatchEvent(new CustomEvent<BrushLibraryImportPathsDetail>(BRUSH_LIBRARY_IMPORT_PATHS_EVENT, {
    detail: { paths: [...paths] }
  }))
}
