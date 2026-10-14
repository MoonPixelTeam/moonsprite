import { isWebTrial } from '@/core/product-target'
import { currentAppLocale, translateCurrent } from '@/core/localization'
import { invoke } from '@tauri-apps/api/core'

export interface ExtensionExportFile { name: string; bytes: number[] }

/** Only invoked for the response to an explicit form action, never a pushed update. */
export async function saveExtensionFile(file: ExtensionExportFile): Promise<boolean> {
  if (!file || typeof file.name !== 'string' || !file.name || file.name.length > 120
    || /[<>:"/\\|?*\x00-\x1f]/.test(file.name) || !Array.isArray(file.bytes)
    || file.bytes.length > 12 * 1024 * 1024 || !file.bytes.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255)) {
    throw new Error(translateCurrent('extension.invalidExportFile'))
  }
  if (isWebTrial()) {
    if (!file.name.toLowerCase().endsWith('.mspet')) throw new Error('网页版仅支持下载宠物包；作品请保存为 .moonsprite 工程。')
    const url = URL.createObjectURL(new Blob([new Uint8Array(file.bytes)], { type: 'application/octet-stream' }))
    const anchor = document.createElement('a')
    try {
      anchor.href = url
      anchor.download = file.name
      document.body.append(anchor)
      anchor.click()
    } finally {
      anchor.remove()
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    }
    return true
  }
  const destination = await invoke<{ canceled: boolean; filePath?: string }>('save_extension_data_file', { fileName: file.name, language: currentAppLocale() })
  if (destination.canceled || !destination.filePath) return false
  await window.moonSprite.writeBinaryAtomic(destination.filePath, new Uint8Array(file.bytes))
  return true
}
