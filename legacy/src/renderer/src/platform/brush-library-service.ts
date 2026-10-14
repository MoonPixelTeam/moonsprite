import type { MoonSpriteApi } from '@shared/types-platform'
import type { StoredBrush } from '@shared/types-library'
import { createImageBrushFromRgba, encodeBrushPng } from '@/core/brushes'
import { compositeDocument } from '@/core/document-composite'
import { decodeDocumentFileAsync, fileExtension, fileNameFromPath } from '@/core/document-files'
import { translateCurrent as tr } from '@/core/localization'

export const BRUSH_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'] as const

export interface BrushImportFailure {
  path: string
  error: Error
}

export interface BrushImportResult {
  imported: StoredBrush[]
  failures: BrushImportFailure[]
}

const brushNameFromPath = (filePath: string): string => {
  const fileName = fileNameFromPath(filePath)
  return fileName.replace(/\.[^.]+$/u, '').trim() || tr('brush.defaultName')
}

export async function importBrushPath(api: MoonSpriteApi, filePath: string): Promise<StoredBrush> {
  const extension = fileExtension(filePath)
  if (!BRUSH_IMAGE_EXTENSIONS.includes(extension as (typeof BRUSH_IMAGE_EXTENSIONS)[number])) {
    throw new Error(tr('brush.unsupportedImage', { name: fileNameFromPath(filePath) }))
  }
  const bytes = await api.readBinary(filePath)
  const document = await decodeDocumentFileAsync(bytes, filePath)
  const name = brushNameFromPath(filePath)
  const brush = createImageBrushFromRgba(`import:${filePath}`, name, document.width, document.height, compositeDocument(document))
  return api.saveBrush(name, encodeBrushPng(brush), true)
}

export async function importBrushPaths(api: MoonSpriteApi, paths: readonly string[]): Promise<BrushImportResult> {
  const imported: StoredBrush[] = []
  const failures: BrushImportFailure[] = []
  for (const path of paths) {
    try {
      imported.push(await importBrushPath(api, path))
    } catch (error) {
      failures.push({ path, error: error instanceof Error ? error : new Error(String(error)) })
    }
  }
  return { imported, failures }
}
