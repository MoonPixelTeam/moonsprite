import { strFromU8, unzipSync } from 'fflate'
import type { StoredExtension } from '@shared/types-extensions'
import type { ExtensionPermission } from '@shared/types-extension-runtime'
import petPackageUrl from '../../../../src-tauri/resources/bundled-extensions/pet-companion.msext?url'

type Manifest = Omit<StoredExtension, 'runtime'> & {
  runtime: { entry: string; permissions: ExtensionPermission[]; resources: Record<string, string> }
}

/** Only the bundled, application-owned package is exposed; arbitrary installation stays disabled. */
export function readBuiltinPetPackage(bytes: Uint8Array) {
  const files = unzipSync(bytes)
  if (!files['manifest.json']) throw new Error('内置宠物清单缺失。')
  const manifest = JSON.parse(strFromU8(files['manifest.json'])) as Manifest
  const read = (path: string): Uint8Array => {
    const bytes = files[path]
    if (!bytes) throw new Error('内置宠物资源缺失。')
    return bytes.slice()
  }
  const extension: StoredExtension = {
    ...manifest, author: manifest.author ?? 'MoonSprite', enabled: true,
    hasLuaEntry: false, hasSettings: Boolean(manifest.settingsUi),
    runtime: { permissions: manifest.runtime.permissions, resources: Object.keys(manifest.runtime.resources) },
    commands: manifest.commands.map(command => ({ ...command, description: command.description ?? '', handler: command.opensSettings ? 'settings' : 'runtime' })),
    panels: manifest.panels ?? [], menuItems: manifest.menuItems ?? [], topMenus: manifest.topMenus ?? []
  }
  const assertId = (id: string) => { if (id !== extension.id) throw new Error('网页版仅支持内置宠物扩展。') }
  return {
    extension,
    entry(id: string) { assertId(id); return strFromU8(read(manifest.runtime.entry)) },
    resource(id: string, resourceId: string) {
      assertId(id)
      if (!Object.hasOwn(manifest.runtime.resources, resourceId)) throw new Error('宠物资源未注册。')
      return read(manifest.runtime.resources[resourceId])
    }
  }
}

let pending: Promise<ReturnType<typeof readBuiltinPetPackage>> | null = null
export function loadBrowserPetExtension() {
  if (!pending) pending = (async () => {
    const response = await fetch(petPackageUrl)
    if (!response.ok) throw new Error(`内置宠物加载失败（HTTP ${response.status}）。`)
    return readBuiltinPetPackage(new Uint8Array(await response.arrayBuffer()))
  })().catch(error => { pending = null; throw error })
  return pending
}
