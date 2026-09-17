export interface StoredBrush {
  id: string
  name: string
  filePath: string
  intrinsicSize?: boolean
  sourceX?: number
  sourceY?: number
  folderId?: string | null
}

export interface StoredBrushFolder {
  id: string
  name: string
  filePath: string
}

export interface BrushListing {
  directoryPath: string
  brushes: StoredBrush[]
  folders: StoredBrushFolder[]
}

export interface StoredFont {
  id: string
  family: string
  filePath: string
  imported: boolean
}

export interface FontListing {
  directoryPath: string
  fonts: StoredFont[]
}

export interface StoredBackgroundPreset {
  id: string
  name: string
  filePath: string
  builtIn: boolean
}

export interface BackgroundPresetListing {
  directoryPath: string
  presets: StoredBackgroundPreset[]
}
