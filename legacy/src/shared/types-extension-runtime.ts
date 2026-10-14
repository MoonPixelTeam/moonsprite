export const EXTENSION_RUNTIME_API_VERSION = '1.0.0'

export const EXTENSION_PERMISSIONS = [
  'runtime', 'commands', 'menus', 'ui', 'windows', 'workspace.read', 'workspace.write',
  'document.read', 'document.write', 'events', 'storage', 'resources', 'tools', 'io',
  'clipboard', 'notifications', 'network', 'diagnostics'
] as const

export type ExtensionPermission = (typeof EXTENSION_PERMISSIONS)[number]

export interface StoredExtensionRuntime {
  permissions: ExtensionPermission[]
  resources: string[]
}

export interface ExtensionRuntimeProjectSnapshot {
  id: string
  name: string
  width: number
  height: number
  colorMode: string
  layerCount: number
  frameCount: number
  dirty: boolean
  contentRevision: number
}

export type ExtensionRuntimeEvent =
  | { type: 'files-dropped'; files: { name: string; bytes: number[] }[] }
  | { type: 'locale-changed'; locale: string }
  | { type: 'editor-event'; name: string; timestamp: number; projectId?: string; detail: Record<string, string | number | boolean | null> }
  | { type: 'activate'; apiVersion: string; extensionId: string }
  | { type: 'project'; project: ExtensionRuntimeProjectSnapshot | null; homeOpen: boolean }
  | { type: 'command'; commandId: string; event: string }
  | { type: 'interaction'; kind: 'pointer' | 'keyboard' }
  | { type: 'clock'; timestamp: number }
  | { type: 'document-saved'; projectId: string }
  | { type: 'export-complete'; projectId: string; format?: string }
  | { type: 'settings-changed'; key: string; value: unknown }
  | { type: 'window-message'; windowId: string; message: unknown }
  | { type: 'deactivate' }

export interface ExtensionRuntimeRequest {
  type: 'moonsprite-extension-request'
  requestId?: string
  method: string
  params?: unknown
}

export interface ExtensionRuntimeResponse {
  type: 'moonsprite-extension-response'
  requestId: string
  ok: boolean
  result?: unknown
  error?: string
}
