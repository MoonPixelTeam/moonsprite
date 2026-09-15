import { invoke } from '@tauri-apps/api/core'
import { emitTo, listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'

export interface ExtensionWindowBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface ExtensionWindowHitSpan {
  x: number
  y: number
  width: number
}

export interface ExtensionRuntimeWindowMessage {
  extensionId: string
  windowId: string
  message: unknown
}

export const listenForExtensionWindowMessage = async (callback: (message: unknown) => void): Promise<() => void> =>
  listen<unknown>('extension:message', (event) => callback(event.payload))

export const listenForExtensionWindowMove = async (callback: (position: { x: number; y: number }) => void): Promise<() => void> =>
  getCurrentWindow().onMoved((event) => callback(event.payload))

export const listenForExtensionWindowFocus = async (callback: (focused: boolean) => void): Promise<() => void> =>
  getCurrentWindow().onFocusChanged((event) => callback(event.payload))

export const listenForExtensionRuntimeWindowMessage = async (callback: (message: ExtensionRuntimeWindowMessage) => void): Promise<() => void> =>
  listen<ExtensionRuntimeWindowMessage>('extension:window-message', (event) => callback(event.payload))

export const emitExtensionRuntimeWindowMessage = async (message: ExtensionRuntimeWindowMessage): Promise<void> =>
  emitTo('main', 'extension:window-message', message)

export const startExtensionWindowDrag = async (): Promise<void> => {
  await invoke('start_extension_window_drag')
}

export const extensionWindowBounds = (): Promise<ExtensionWindowBounds> =>
  invoke('get_extension_window_bounds')

export const setExtensionWindowBounds = async (bounds: ExtensionWindowBounds): Promise<void> => {
  await invoke('set_extension_window_bounds', { bounds })
}

export const setExtensionWindowHitRegion = async (
  sourceWidth: number,
  sourceHeight: number,
  spans: ExtensionWindowHitSpan[]
): Promise<void> => {
  await invoke('set_extension_window_hit_region', { sourceWidth, sourceHeight, spans })
}

export const closeCurrentExtensionWindow = async (): Promise<void> => {
  await getCurrentWindow().close()
}
