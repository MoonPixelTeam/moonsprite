import { invoke } from '@tauri-apps/api/core'
import { open, save } from '@tauri-apps/plugin-dialog'
import { readFile, writeFile, stat } from '@tauri-apps/plugin-fs'
import type { MoonSpriteApi } from '@shared/types'

const MAX_IMPORT_BYTES = 128 * 1024 * 1024
const extensions = new Set(['moonsprite', 'ase', 'aseprite', 'png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'])

/** Providers may return opaque content IDs. The actual decoder still validates the entire file. */
export function androidImportName(uri: string, bytes: Uint8Array): string {
  let name = ''
  try { name = decodeURIComponent(uri).split('/').pop()?.split('?')[0] ?? '' } catch { name = '' }
  name = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(-160)
  if (extensions.has(name.split('.').pop()?.toLowerCase() ?? '')) return name
  const starts = (...values: number[]): boolean => values.every((v, i) => bytes[i] === v)
  const ascii = (offset: number, text: string): boolean => [...text].every((v, i) => bytes[offset + i] === v.charCodeAt(0))
  const ext = starts(0x89, 0x50, 0x4e, 0x47) ? 'png'
    : starts(0xff, 0xd8, 0xff) ? 'jpg'
    : ascii(0, 'GIF8') ? 'gif'
    : ascii(0, 'RIFF') && ascii(8, 'WEBP') ? 'webp'
    : ascii(0, 'BM') ? 'bmp'
    : bytes[4] === 0xe0 && bytes[5] === 0xa5 ? 'aseprite'
    : starts(0x50, 0x4b, 3, 4) ? 'moonsprite' : null
  if (!ext) throw new Error('Unsupported file. Choose a MoonSprite, Aseprite, PNG, JPEG, WebP, BMP or GIF file.')
  return 'import-' + Date.now() + '.' + ext
}

function filename(path: string | undefined, extension: string): string {
  const name = (path ?? 'Untitled').split(/[\\/]/).pop() ?? 'Untitled'
  const stem = name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim() || 'Untitled'
  return stem.slice(0, 160) + '.' + (extension === 'jpeg' ? 'jpg' : extension)
}

/** All existing editor IO sees private filesystem paths, never content:// URIs. */
export function createAndroidApi(base: MoonSpriteApi): MoonSpriteApi {
  const destinations = new Map<string, string>()
  const allocate = (name: string, gallery: boolean): Promise<string> => invoke('android_allocate_file', { name, gallery })
  const importFiles = async (imagesOnly = false) => {
    const selected = await open({ multiple: true, directory: false, pickerMode: 'document',
      filters: [{ name: imagesOnly ? 'Images' : 'Documents', extensions: [imagesOnly ? 'image/*' : '*/*'] }] })
    const filePaths: string[] = []
    for (const uri of selected ?? []) {
      const info = await stat(uri)
      if (info.size > MAX_IMPORT_BYTES) throw new Error('Android test import limit: 128 MiB per file.')
      const bytes = await readFile(uri)
      if (bytes.byteLength > MAX_IMPORT_BYTES) throw new Error('Android test import limit: 128 MiB per file.')
      const path = await allocate(androidImportName(uri, bytes), false)
      await base.writeBinaryAtomic(path, bytes)
      filePaths.push(path)
    }
    return { canceled: filePaths.length === 0, filePaths }
  }
  const exportDialog = async (defaultPath: string | undefined, format: string) => {
    const name = filename(defaultPath, format)
    const uri = await save({ defaultPath: name })
    if (!uri) return { canceled: true }
    const path = await allocate(name, false)
    destinations.set(path, uri)
    return { canceled: false, filePath: path }
  }
  const publish = async (path: string): Promise<void> => {
    const uri = destinations.get(path)
    if (!uri) return
    // Only report success after the provider has accepted all bytes. A failed
    // external write leaves the complete private copy available for retry.
    await writeFile(uri, await base.readBinary(path))
    destinations.delete(path)
  }
  const unavailable = async (): Promise<never> => { throw new Error('This desktop feature is unavailable in the Android test build.') }
  return {
    ...base,
    openFiles: () => importFiles(),
    openBrushImages: () => importFiles(true),
    saveProject: async (path, format) => ({ canceled: false, filePath: await allocate(filename(path, format ?? 'moonsprite'), true) }),
    exportImage: exportDialog,
    savePaletteImage: (path) => exportDialog(path, 'png'),
    saveShortcutFile: (path) => exportDialog(path, 'json'),
    saveThemeFile: (path) => exportDialog(path, 'json'),
    chooseDirectory: unavailable,
    writeBinaryAtomic: async (path, bytes) => { await base.writeBinaryAtomic(path, bytes); await publish(path) },
    writeProjectIncremental: async (path, source, bytes) => { await base.writeProjectIncremental(path, source, bytes); await publish(path) },
    writeScaledPngAtomic: base.writeScaledPngAtomic ? async (...args) => {
      const result = await base.writeScaledPngAtomic!(...args)
      await publish(args[0])
      return result
    } : undefined,
    // Internal document copy/paste is maintained by the existing Store.
    writeClipboardImage: async () => {},
    readClipboardText: async () => null,
    readClipboardImage: async () => null,
    readClipboardImageSize: async () => null,
    openGalleryFolder: unavailable, openDirectory: unavailable,
    openPaletteFolder: unavailable, openWorkspaceFolder: unavailable,
    openBrushFolder: unavailable, openBackgroundPresetFolder: unavailable,
    openLuaScriptFolder: unavailable, openExtensionFolder: unavailable,
  }
}

/** Export an already-saved editable project without changing its internal save target. */
export async function exportAndroidSavedProject(path: string, api: MoonSpriteApi): Promise<boolean> {
  const uri = await save({ defaultPath: path.split(/[\\/]/).pop() ?? 'project.moonsprite' })
  if (!uri) return false
  await writeFile(uri, await api.readBinary(path))
  return true
}
