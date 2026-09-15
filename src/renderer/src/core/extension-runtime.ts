import type { ExtensionPermission, ExtensionRuntimeEvent } from '@shared/types-extension-runtime'
import type { StoredExtension, StoredExtensionCommand } from '@shared/types-extensions'

const STORAGE_PREFIX = 'moonsprite.extension-runtime.v1.'
const MAX_STORAGE_KEY_BYTES = 160
const MAX_STORAGE_VALUE_BYTES = 256 * 1024
const MAX_STORAGE_TOTAL_BYTES = 1024 * 1024

export const EXTENSION_RUNTIME_METHOD_PERMISSIONS: Readonly<Record<string, ExtensionPermission>> = {
  'runtime.getCapabilities': 'runtime',
  'commands.execute': 'commands',
  'ui.notify': 'ui',
  'ui.openSettings': 'ui',
  'windows.open': 'windows',
  'windows.close': 'windows',
  'windows.postMessage': 'windows',
  'workspace.listProjects': 'workspace.read',
  'workspace.getActiveProject': 'workspace.read',
  'workspace.activateProject': 'workspace.write',
  'document.getSummary': 'document.read',
  'document.getLayers': 'document.read',
  'document.getFrames': 'document.read',
  'document.undo': 'document.write',
  'document.redo': 'document.write',
  'tools.getActive': 'tools',
  'tools.setActive': 'tools',
  'colors.get': 'document.read',
  'colors.setPrimary': 'document.write',
  'colors.setSecondary': 'document.write',
  'storage.get': 'storage',
  'storage.set': 'storage',
  'storage.remove': 'storage',
  'storage.list': 'storage',
  'resources.read': 'resources',
  'clipboard.readText': 'clipboard',
  'clipboard.writeText': 'clipboard',
  'notifications.show': 'notifications',
  'network.fetch': 'network',
  'diagnostics.log': 'diagnostics'
}

export const extensionRuntimeAllows = (
  permissions: readonly ExtensionPermission[],
  method: string
): boolean => {
  const required = EXTENSION_RUNTIME_METHOD_PERMISSIONS[method]
  return required !== undefined && permissions.includes(required)
}

const storagePrefix = (extensionId: string): string => `${STORAGE_PREFIX}${extensionId}.`

const assertStorageKey = (key: unknown): string => {
  if (typeof key !== 'string' || key.length === 0 || new TextEncoder().encode(key).length > MAX_STORAGE_KEY_BYTES || /[\u0000-\u001f]/.test(key)) {
    throw new Error('扩展存储键无效。')
  }
  return key
}

const encodedValue = (value: unknown): string => {
  const encoded = JSON.stringify(value)
  if (encoded === undefined || new TextEncoder().encode(encoded).length > MAX_STORAGE_VALUE_BYTES) {
    throw new Error('扩展存储值超过大小限制。')
  }
  return encoded
}

export const extensionStorage = (extensionId: string, storage: Storage = localStorage) => ({
  get(key: unknown): unknown {
    const value = storage.getItem(`${storagePrefix(extensionId)}${assertStorageKey(key)}`)
    if (value === null) return null
    try { return JSON.parse(value) } catch { return null }
  },
  set(key: unknown, value: unknown): void {
    const resolvedKey = assertStorageKey(key)
    const encoded = encodedValue(value)
    const prefix = storagePrefix(extensionId)
    let total = new TextEncoder().encode(encoded).length
    for (let index = 0; index < storage.length; index++) {
      const candidate = storage.key(index)
      if (!candidate?.startsWith(prefix) || candidate === `${prefix}${resolvedKey}`) continue
      total += new TextEncoder().encode(storage.getItem(candidate) ?? '').length
    }
    if (total > MAX_STORAGE_TOTAL_BYTES) throw new Error('扩展存储空间超过 1 MiB 限制。')
    storage.setItem(`${prefix}${resolvedKey}`, encoded)
  },
  remove(key: unknown): void {
    storage.removeItem(`${storagePrefix(extensionId)}${assertStorageKey(key)}`)
  },
  list(): string[] {
    const prefix = storagePrefix(extensionId)
    const keys: string[] = []
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index)
      if (key?.startsWith(prefix)) keys.push(key.slice(prefix.length))
    }
    return keys.sort()
  }
})

type RuntimeDispatch = (event: ExtensionRuntimeEvent) => void
const runtimeDispatchers = new Map<string, RuntimeDispatch>()

export const registerExtensionRuntime = (extensionId: string, dispatch: RuntimeDispatch): (() => void) => {
  runtimeDispatchers.set(extensionId, dispatch)
  return () => {
    if (runtimeDispatchers.get(extensionId) === dispatch) runtimeDispatchers.delete(extensionId)
  }
}

export const dispatchExtensionRuntimeCommand = (
  extensionId: string,
  commandId: string,
  event: string
): boolean => {
  const dispatch = runtimeDispatchers.get(extensionId)
  if (!dispatch) return false
  dispatch({ type: 'command', commandId, event })
  return true
}

export const dispatchExtensionRuntimeEvent = (extensionId: string, event: ExtensionRuntimeEvent): boolean => {
  const dispatch = runtimeDispatchers.get(extensionId)
  if (!dispatch) return false
  dispatch(event)
  return true
}

export const broadcastExtensionRuntimeEvent = (event: ExtensionRuntimeEvent): void => {
  for (const dispatch of runtimeDispatchers.values()) dispatch(event)
}

export interface ExtensionCommandHandlers {
  runLua(scriptId: string): void
  openSettings(extensionId: string): void
}

export const executeExtensionCommand = (
  extension: StoredExtension,
  command: StoredExtensionCommand,
  handlers: ExtensionCommandHandlers
): boolean => {
  if (!extension.enabled) return false
  if (command.handler === 'lua') {
    handlers.runLua(`extension:${extension.id}:${command.id}`)
    return true
  }
  if (command.runtimeEvent) return dispatchExtensionRuntimeCommand(extension.id, command.id, command.runtimeEvent)
  if (command.opensSettings && extension.hasSettings) {
    handlers.openSettings(extension.id)
    return true
  }
  return false
}
