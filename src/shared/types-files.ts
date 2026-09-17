import type { RgbaColor } from './types-color'
import type { ColorMode } from './types-raster'

export interface ResourceInfo {
  totalBytes: number
  freeBytes: number
}

export interface OpenDialogResult {
  canceled: boolean
  filePaths: string[]
}

export interface SaveDialogResult {
  canceled: boolean
  filePath?: string
}

export interface DirectoryDialogResult {
  canceled: boolean
  directoryPath?: string
}

export interface DefaultFileDirectories {
  saveDirectory: string
  exportDirectory: string
}

export interface RecoveryRecord {
  id: string
  name: string
  updatedAt: string
}

export interface ProjectBackupRecord {
  filePath: string
  modifiedAt: number
  sizeBytes: number
}

export interface GalleryProject {
  filePath: string
  fileName: string
  modifiedAt: number
}

export interface GalleryListing {
  directoryPath: string
  projects: GalleryProject[]
}

export interface StoredPalette {
  id: string
  name: string
  filePath: string
  colors: RgbaColor[]
  builtIn: boolean
  columns?: number
  slots?: Array<number | null>
}

export interface PaletteSlotLayout {
  columns: number
  slots: Array<number | null>
}

export interface PaletteListing {
  directoryPath: string
  palettes: StoredPalette[]
}

export interface ClipboardImage {
  width: number
  height: number
  data: Uint8Array
}

export interface ClipboardImageSize {
  width: number
  height: number
}

export interface ProjectPreview {
  preview: Uint8Array
  width: number
  height: number
  colorMode: ColorMode
}

export interface BinaryReadProgress {
  bytesRead: number
  totalBytes: number
}
