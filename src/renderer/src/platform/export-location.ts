import type { ImageExportFormat, SaveDialogFormat } from '@shared/types-color'
import type { MoonSpriteApi } from '@shared/types-platform'
import { fileNameFromPath, joinDirectoryPath } from '@/core/document-files'
import { parentDirectoryFromPath } from '@/core/export-settings'

type OutputFormat = ImageExportFormat | SaveDialogFormat | 'png-auto' | 'png-rgba'

/** Selects a destination only; file writes and batch conflict handling remain with the exporter. */
export async function chooseExportLocation(api: MoonSpriteApi, directory: string, name: string, format: OutputFormat, saveProject = false): Promise<{ directory: string; name: string } | null> {
  const dialogFormat = format === 'png-auto' || format === 'png-rgba' ? 'png' : format
  const extension = dialogFormat === 'jpeg' ? 'jpg' : dialogFormat
  const stem = name.trim().replace(/\.(moonsprite|aseprite|ase|png|jpe?g|webp|bmp|svg|gif|ico|psd|mp4|webm)$/i, '') || 'MoonSprite-export'
  const defaultPath = joinDirectoryPath(directory, `${stem}.${extension}`)
  const result = saveProject || dialogFormat === 'moonsprite' || dialogFormat === 'ase'
    ? await api.saveProject(defaultPath, dialogFormat as SaveDialogFormat)
    : await api.exportImage(defaultPath, dialogFormat as ImageExportFormat)
  if (result.canceled || !result.filePath) return null
  const selectedName = fileNameFromPath(result.filePath)
  const selectedDirectory = parentDirectoryFromPath(result.filePath)
  if (!selectedName || !selectedDirectory) return null
  // The exporter owns the format. Browsing with "All files" must not change it.
  const suffix = dialogFormat === 'jpeg' ? /\.jpe?g$/i : new RegExp(`\\.${extension}$`, 'i')
  return { directory: selectedDirectory, name: suffix.test(selectedName) ? selectedName : `${selectedName}.${extension}` }
}
